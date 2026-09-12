export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb'
    }
  }
};
 
export default async function handler(req, res) {
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: '请求方法不受支持' });
  }

  try {
    const bodyData = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const { base64Data, filename, mimeType, customName, forcePNG } = bodyData;

    if (!base64Data) {
      return res.status(200).json({ success: false, message: '未收到图片数据' });
    }

    let rawUrl = (process.env.SUPABASE_URL || '').trim();
    const rawKey = (process.env.SUPABASE_KEY || '').trim();

    if (!rawUrl || !rawKey) {
      return res.status(200).json({ success: false, message: '服务端环境变量未配置' });
    }

    if (!rawUrl.startsWith('http')) rawUrl = 'https://' + rawUrl;
    rawUrl = rawUrl.replace(/\/+$/, '').replace(/\/rest\/v1\/?$/, '');

    let ext = 'jpg';
    let contentType = 'image/jpeg';

    if (forcePNG || (mimeType && mimeType.indexOf('png') !== -1)) {
      ext = 'png';
      contentType = 'image/png';
    } else if (mimeType && mimeType.indexOf('webp') !== -1) {
      ext = 'webp';
      contentType = 'image/webp';
    } else if (mimeType && mimeType.indexOf('gif') !== -1) {
      ext = 'gif';
      contentType = 'image/gif';
    } else {
      ext = 'jpg';
      contentType = 'image/jpeg';
    }

    const base64Pure = base64Data.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Pure, 'base64');

    let finalFileName = '';
    if (customName && String(customName).trim()) {
      let cleanCustom = String(customName).trim().replace(/[^a-zA-Z0-9_-]/g, '_');
      cleanCustom = cleanCustom.replace(/\.(png|jpg|jpeg|webp|gif)$/i, '');
      finalFileName = cleanCustom + '.' + ext;
    } else {
      finalFileName = 'img_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7) + '.' + ext;
    }

    const uploadUrl = rawUrl + '/storage/v1/object/images/' + finalFileName;

    const uploadRes = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'apikey': rawKey,
        'Authorization': 'Bearer ' + rawKey,
        'Content-Type': contentType,
        'cache-control': 'max-age=31536000, public',
        'x-upsert': 'true'
      },
      body: buffer
    });

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      return res.status(200).json({ success: false, message: '上传存储桶失败: ' + errText });
    }

    const shortPublicUrl = 'https://niveousmoon.top/images/' + finalFileName;

    return res.status(200).json({
      success: true,
      url: shortPublicUrl,
      filename: finalFileName,
      message: '上传成功'
    });

  } catch (err) {
    return res.status(200).json({ success: false, message: '服务异常: ' + err.message });
  }
}
