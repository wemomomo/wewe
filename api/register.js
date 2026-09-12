export default async function handler(req, res) {
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
         
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: '请求方法不受支持' });
  }

  try {
    const bodyData = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const inviteCode = (bodyData.inviteCode || '').trim();
    const username = (bodyData.username || '').trim();
    const password = (bodyData.password || '').trim();
    const devId = bodyData.deviceId || 'unknown_device';

    if (!inviteCode || !username || !password) {
      return res.status(200).json({ success: false, message: '请填写邀请码、账号和密码' });
    }

    let rawUrl = (process.env.SUPABASE_URL || '').trim();
    const rawKey = (process.env.SUPABASE_KEY || '').trim();

    if (!rawUrl || !rawKey) {
      return res.status(200).json({ success: false, message: '服务端数据库配置缺失' });
    }

    if (!rawUrl.startsWith('http')) rawUrl = 'https://' + rawUrl;
    rawUrl = rawUrl.replace(/\/+$/, '').replace(/\/rest\/v1\/?$/, '');

    // 1. 验证邀请码
    const codesRes = await fetch(`${rawUrl}/rest/v1/invite_codes?select=*`, {
      method: 'GET',
      headers: {
        'apikey': rawKey,
        'Authorization': `Bearer ${rawKey}`,
        'Accept': 'application/json'
      }
    });

    if (!codesRes.ok) {
      return res.status(200).json({ success: false, message: '数据库连接异常' });
    }

    const allCodes = await codesRes.json();
    const codeRecord = (allCodes || []).find(function(c) {
      return String(c.code || '').trim() === inviteCode;
    });

    if (!codeRecord) {
      return res.status(200).json({ success: false, message: '邀请码无效' });
    }

    if (codeRecord.is_used === true) {
      return res.status(200).json({ success: false, message: '该邀请码已被使用' });
    }

    // 2. 检查用户名是否存在
    const usersRes = await fetch(`${rawUrl}/rest/v1/users?select=*`, {
      method: 'GET',
      headers: {
        'apikey': rawKey,
        'Authorization': `Bearer ${rawKey}`,
        'Accept': 'application/json'
      }
    });

    const allUsers = await usersRes.json();
    const existingUser = (allUsers || []).find(function(u) {
      return String(u.username || '').trim().toLowerCase() === username.toLowerCase();
    });

    if (existingUser) {
      return res.status(200).json({ success: false, message: '该账号名已被注册，请换一个' });
    }

    // 3. 创建用户并记录当前设备
    const maxDevices = Number(codeRecord.max_devices) || 3;
    const initialDevices = devId !== 'unknown_device' ? [devId] : [];

    const createRes = await fetch(`${rawUrl}/rest/v1/users`, {
      method: 'POST',
      headers: {
        'apikey': rawKey,
        'Authorization': `Bearer ${rawKey}`,
        'Content-Type': 'application/json; charset=utf-8',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({
        username: username,
        password: password,
        is_active: true,
        devices: initialDevices,
        max_devices: maxDevices
      })
    });

    if (!createRes.ok) {
      const errText = await createRes.text();
      return res.status(200).json({ success: false, message: '注册失败: ' + errText });
    }

    // 4. 标记邀请码已使用
    await fetch(`${rawUrl}/rest/v1/invite_codes?id=eq.${codeRecord.id}`, {
      method: 'PATCH',
      headers: {
        'apikey': rawKey,
        'Authorization': `Bearer ${rawKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        is_used: true,
        used_by: username
      })
    });

    const token = Buffer.from(`${username}_${devId}_${Date.now()}`, 'utf-8').toString('base64');
    const cookiePayload = encodeURIComponent(JSON.stringify({ username: username, token: token }));

    // 顶级域全网打通 Cookie
    res.setHeader('Set-Cookie', [
      `niveous_session=${cookiePayload}; Path=/; Domain=.niveousmoon.top; Max-Age=31536000; SameSite=Lax; Secure`,
      `shared_device_id=${devId}; Path=/; Domain=.niveousmoon.top; Max-Age=31536000; SameSite=Lax; Secure`
    ]);

    return res.status(200).json({
      success: true,
      token: token,
      username: username,
      message: '注册成功'
    });

  } catch (err) {
    return res.status(200).json({ success: false, message: '服务异常: ' + err.message });
  }
}
