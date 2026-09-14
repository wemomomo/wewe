import https from 'https';

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
    let bodyData = req.body;
    if (typeof bodyData === 'string') {
      try { bodyData = JSON.parse(bodyData); } catch (e) { bodyData = {}; }
    }
    bodyData = bodyData || {};

    const { base64Data, customName, forcePNG, mimeType } = bodyData;

    if (!base64Data || typeof base64Data !== 'string') {
      return res.status(200).json({ success: false, message: '未收到有效的图片数据' });
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
    const base64Pure = commaIdx !== -1 ? base64Data.substring(commaIdx + 1) : base64Data;
    const buffer = Buffer.from(base64Pure.trim(), 'base64');

    if (!buffer || buffer.length === 0) {
      return res.status(200).json({ success: false, message: '图片解码失败' });
    }

    let finalFileName = '';
    if (customName && String(customName).trim()) {
      let cleanCustom = String(customName).trim().replace(/[^a-zA-Z0-9_-]/g, '_');
      cleanCustom = cleanCustom.replace(/\.(png|jpg|jpeg|webp|gif)$/i, '');
      finalFileName = cleanCustom + '.' + ext;
    } else {
      finalFileName = 'img_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7) + '.' + ext;
    }

    const targetUrlObj = new URL(rawUrl + '/storage/v1/object/images/' + finalFileName);

    const uploadToSupabase = () => {
      return new Promise((resolve, reject) => {
        const options = {
          hostname: targetUrlObj.hostname,
          port: 443,
          path: targetUrlObj.pathname,
          method: 'POST',
          headers: {
            'apikey': rawKey,
            'Authorization': 'Bearer ' + rawKey,
            'Content-Type': contentType,
            'Content-Length': buffer.length,
            'cache-control': 'max-age=31536000, public',
            'x-upsert': 'true'
          },
          timeout: 10000
        };

        const reqClient = https.request(options, (resClient) => {
          let resBody = '';
          resClient.on('data', (chunk) => { resBody += chunk; });
          resClient.on('end', () => {
            if (resClient.statusCode >= 200 && resClient.statusCode < 300) {
              resolve({ ok: true, data: resBody });
            } else {
              resolve({ ok: false, status: resClient.statusCode, error: resBody });
            }
          });
        });

        reqClient.on('timeout', () => {
          reqClient.destroy();
          reject(new Error('Supabase 存储桶握手超时(10s)'));
        });

        reqClient.on('error', (e) => {
          reject(e);
        });

        reqClient.write(buffer);
        reqClient.end();
      });
    };

    const uploadResult = await uploadToSupabase();

    if (!uploadResult.ok) {
      return res.status(200).json({
        success: false,
        message: '存储桶返回错误(' + uploadResult.status + '): ' + uploadResult.error
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
    return res.status(200).json({ success: false, message: '服务异常: ' + err.message });
  }
}