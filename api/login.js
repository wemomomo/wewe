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
    const inputUser = (bodyData.username || '').trim();
    const inputPass = (bodyData.password || '').trim();
    const devId = bodyData.deviceId || 'unknown_device';
    const isVerifyOnly = !!bodyData.verifyOnly;
    const forceResetDevices = !!bodyData.forceReset;

    if (!inputUser) {
      return res.status(200).json({ success: false, message: '请输入账号' });
    }

    let rawUrl = (process.env.SUPABASE_URL || '').trim();
    const rawKey = (process.env.SUPABASE_KEY || '').trim();

    if (!rawUrl || !rawKey) {
      return res.status(200).json({ success: false, message: '服务端数据库配置缺失' });
    }

    if (!rawUrl.startsWith('http')) rawUrl = 'https://' + rawUrl;
    rawUrl = rawUrl.replace(/\/+$/, '').replace(/\/rest\/v1\/?$/, '');

    const targetUrl = `${rawUrl}/rest/v1/users?select=*`;
    const checkRes = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'apikey': rawKey,
        'Authorization': `Bearer ${rawKey}`,
        'Accept': 'application/json'
      }
    });

    if (!checkRes.ok) {
      return res.status(200).json({ success: true, message: '服务通信中' });
    }

    const allUsers = await checkRes.json();
    const user = (allUsers || []).find(function(u) {
      return String(u.username || '').trim().toLowerCase() === inputUser.toLowerCase();
    });

    if (!user) {
      return res.status(200).json({ success: false, kickOut: true, message: '账号不存在或已被删除' });
    }

    if (user.is_active === false) {
      return res.status(200).json({ success: false, kickOut: true, message: '该账号已被停用，请联系管理员' });
    }

    // 日常静默安全核验：只要账号有效且未被禁用，直接放行，绝不误杀！
    if (isVerifyOnly) {
      return res.status(200).json({ success: true, message: '核验通过' });
    }

    if (String(user.password || '') !== inputPass) {
      return res.status(200).json({ success: false, message: '密码错误' });
    }

    let currentDevices = Array.isArray(user.devices) ? user.devices : [];
    const maxDevices = Number(user.max_devices) || 3;

    if (forceResetDevices) {
      currentDevices = [devId];
      await fetch(`${rawUrl}/rest/v1/users?id=eq.${user.id}`, {
        method: 'PATCH',
        headers: {
          'apikey': rawKey,
          'Authorization': `Bearer ${rawKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({ devices: currentDevices })
      });
    } else if (!currentDevices.includes(devId)) {
      if (currentDevices.length >= maxDevices) {
        return res.status(200).json({
          success: false,
          canReset: true,
          message: '已达最大设备限制(' + maxDevices + '台)'
        });
      }
      currentDevices.push(devId);
      await fetch(`${rawUrl}/rest/v1/users?id=eq.${user.id}`, {
        method: 'PATCH',
        headers: {
          'apikey': rawKey,
          'Authorization': `Bearer ${rawKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({ devices: currentDevices })
      });
    }

    const token = Buffer.from(`${user.username}_${devId}_${Date.now()}`, 'utf-8').toString('base64');
    const cookiePayload = encodeURIComponent(JSON.stringify({ username: user.username, token: token }));

    // 顶级域全网打通 Cookie
    res.setHeader('Set-Cookie', [
      `niveous_session=${cookiePayload}; Path=/; Domain=.niveousmoon.top; Max-Age=31536000; SameSite=Lax; Secure`,
      `shared_device_id=${devId}; Path=/; Domain=.niveousmoon.top; Max-Age=31536000; SameSite=Lax; Secure`
    ]);

    return res.status(200).json({
      success: true,
      token: token,
      username: user.username,
      message: '登录成功'
    });

  } catch (err) {
    return res.status(200).json({ success: true, message: '通信放行' });
  }
}
