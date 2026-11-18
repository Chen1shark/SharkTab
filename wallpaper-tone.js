/* wallpaper-tone.js
 * 采样壁纸 → 给 .search / .shortcuts 写 data-tone。
 * 搜索框和磁贴本身是固定白纸；tone 只决定环境文字（磁贴标签/添加磁贴）
 * 和纸面阴影的明暗，不再给表面加半透明蒙层。时钟固定纯白，不参与采样。
 * 图片需同源或带 CORS；上传图会存成本地 Blob，因此 canvas 能读取像素。
 * 用法：applyWallpaperTone(url) / resetWallpaperTone()
 */
(() => {
  const DARK_INK = [12, 14, 18];       // 深墨：配浅色壁纸
  const LIGHT_INK = [246, 248, 252];   // 浅墨：配深色壁纸
  const N = 32;

  // 文本行只取字形附近的窄带；搜索框/磁贴取整个表面及其外缘
  const SCOPES = [
    { selector: '.search', pad: 26 },
    { selector: '.shortcuts', pad: 26 },
  ];

  const channel = (v) => {
    v /= 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const luminance = (r, g, b) =>
    0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

  const L_DARK_INK = luminance(...DARK_INK);
  const L_LIGHT_INK = luminance(...LIGHT_INK);

  let runId = 0;

  const load = (src) =>
    new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });

  function sample(ctx, img, sx, sy, sw, sh) {
    // 透明图先垫默认底色，避免透明像素被当成纯黑
    ctx.fillStyle = '#0a0f24';
    ctx.fillRect(0, 0, N, N);
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, N, N);

    const data = ctx.getImageData(0, 0, N, N).data;
    const pixels = [];

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      pixels.push({ r, g, b, L: luminance(r, g, b) });
    }

    pixels.sort((a, b) => a.L - b.L);
    return pixels[Math.floor(pixels.length * 0.5)];
  }

  async function apply(src) {
    const id = ++runId;

    let img;
    try {
      img = await load(src);
    } catch {
      return false;
    }
    if (id !== runId) return false;

    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    const iw = img.naturalWidth;
    const ih = img.naturalHeight;
    if (!iw || !ih) return false;

    // 与 background-size: cover / background-position: center 对齐
    const scale = Math.max(vw / iw, vh / ih);
    const ox = (vw - iw * scale) / 2;
    const oy = (vh - ih * scale) / 2;

    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = N;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingQuality = 'high';

    for (const { selector, pad } of SCOPES) {
      const el = document.querySelector(selector);
      if (!el) continue;

      const box = el.getBoundingClientRect();
      if (!box.width || !box.height) continue;

      const x = Math.max(0, box.left - pad);
      const y = Math.max(0, box.top - pad);
      const w = Math.min(vw, box.right + pad) - x;
      const h = Math.min(vh, box.bottom + pad) - y;
      if (w <= 0 || h <= 0) continue;

      let sx = (x - ox) / scale;
      let sy = (y - oy) / scale;
      let sw = w / scale;
      let sh = h / scale;
      sx = Math.max(0, Math.min(iw - 1, sx));
      sy = Math.max(0, Math.min(ih - 1, sy));
      sw = Math.max(1, Math.min(iw - sx, sw));
      sh = Math.max(1, Math.min(ih - sy, sh));

      let mid;
      try {
        mid = sample(ctx, img, sx, sy, sw, sh);
      } catch {
        return false; // 跨域污染画布：保留 CSS 默认深色
      }

      // 中位亮度决定环境墨色；表面本身固定白纸
      const useDarkInk =
        ratio(mid.L, L_DARK_INK) >= ratio(L_LIGHT_INK, mid.L);
      el.dataset.tone = useDarkInk ? 'light' : 'dark';
    }

    return true;
  }

  function reset() {
    runId++;
    for (const { selector } of SCOPES) {
      const el = document.querySelector(selector);
      if (el) delete el.dataset.tone;
    }
  }

  window.applyWallpaperTone = apply;
  window.resetWallpaperTone = reset;
})();
