// 图片处理：EXIF 方向修正 + 客户端压缩 + 视觉消息构造

/**
 * 压缩图片文件为 JPEG dataURL。
 * @param {File} file 输入的图片文件
 * @param {{maxEdge?: number, quality?: number}} opts
 * @returns {Promise<{dataUrl: string, width: number, height: number}>}
 */
export async function compressImage(file, { maxEdge = 1280, quality = 0.8 } = {}) {
  let bitmap;
  try {
    // 修正 EXIF 方向（iOS 拍照常见）
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    bitmap = await loadViaImg(file);
  }
  try {
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0, w, h);
    return { dataUrl: canvas.toDataURL('image/jpeg', quality), width: w, height: h };
  } finally {
    if (bitmap && typeof bitmap.close === 'function') bitmap.close();
  }
}

/** 旧浏览器降级：<img> 加载 */
function loadViaImg(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('图片无法读取')); };
    img.src = url;
  });
}

/** 生成缩略图（记录展示用，更小） */
export async function makeThumbnail(dataUrl, maxEdge = 240) {
  try {
    const bitmap = await createImageBitmap(await (await fetch(dataUrl)).blob());
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return canvas.toDataURL('image/jpeg', 0.7);
  } catch {
    return dataUrl; // 失败就用原图
  }
}

/**
 * 构造带图的用户消息（OpenAI 视觉格式）。
 * dataUrls: 压缩后的 dataURL 数组（1-3 张）
 */
export function buildImageUserMessage(text, dataUrls = []) {
  const content = [{ type: 'text', text: text || '请看这张图片。' }];
  for (const url of dataUrls) {
    if (url) content.push({ type: 'image_url', image_url: { url } });
  }
  return { role: 'user', content };
}
