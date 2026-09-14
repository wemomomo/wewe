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
    return res.status(200).json({ success: false, message: '请求方式错误(仅支持POST)' });
  }

  try {
    let bodyData = req.body;
    if (typeof bodyData === 'string') {
      try { bodyData = JSON.parse(bodyData); } catch (e) {
        return res.status(200).json({ success: false, message: 'JSON解析错误: ' + e.message });
      }
    }
    bodyData = bodyData || {};

    const { base64Data, filename, customName, forcePNG, mimeType } = bodyData;

    if (!base64Data) {
      return res.status(200).json({ success: false, message: '未接收到图片base64数据' });
    }

    const rawUrl = (process.env.SUPABASE_URL || '').trim();
    const rawKey = (process.env.SUPABASE_KEY || '').trim();

    if (!rawUrl || !rawKey) {
      return res.status(200).json({
        success: false,
        message: '环境变量未配置: URL(' + (rawUrl ? '已配' : '缺失') + ') KEY(' + (rawKey ? '已配' : '缺失') + ')'
      });
    }

    let baseUrl = rawUrl.startsWith('http') ? rawUrl : 'https://' + rawUrl;
    baseUrl = baseUrl.replace(/\/+$/, '').replace(/\/rest\/v1\/?$/, '');

    let ext = 'jpg';
    let contentType = 'image/jpeg';

    if (forcePNG || (mimeType && mimeType.indexOf('png') !== -1) || base64Data.indexOf('data:image/png') === 0) {
      ext = 'png';
      contentType = 'image/png';
    } else if (mimeType && mimeType.indexOf('webp') !== -1) {
      ext = 'webp';
      contentType = 'image/webp';
    } else if (mimeType && mimeType.indexOf('gif') !== -1) {
      ext = 'gif';
      contentType = 'image/gif';
    }

    const commaIdx = base64Data.indexOf(',');
    const base64Pure = (commaIdx !== -1 ? base64Data.substring(commaIdx + 1) : base64Data).replace(/\s/g, '');
    const buffer = Buffer.from(base64Pure, 'base64');

    if (!buffer || buffer.length === 0) {
      return res.status(200).json({ success: false, message: '图片解码为二进制失败' });
    }

    let finalFileName = '';
    if (customName && String(customName).trim()) {
      let cleanCustom = String(customName).trim().replace(/[^a-zA-Z0-9_-]/g, '_');
      cleanCustom = cleanCustom.replace(/\.(png|jpg|jpeg|webp|gif)$/i, '');
      finalFileName = cleanCustom + '.' + ext;
    } else {
      finalFileName = 'img_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7) + '.' + ext;
    }

    const uploadUrl = baseUrl + '/storage/v1/object/images/' + finalFileName;

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

    const resText = await uploadRes.text();

    if (!uploadRes.ok) {
      return res.status(200).json({
        success: false,
        message: 'Supabase存储桶错误[' + uploadRes.status + ']: ' + resText
      });
    }

    const shortPublicUrl = 'https://niveousmoon.top/images/' + finalFileName;

    return res.status(200).json({
      success: true,
      url: shortPublicUrl,
      filename: finalFileName,
      message: '上传成功'
    });

  } catch (err) {
    return res.status(200).json({ success: false, message: '服务端异常: ' + err.message });
  }
}