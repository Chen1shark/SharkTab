/* wallpaper.js
 * 自定义背景：上传 → 解码 / 压缩 → 落盘 → 刷新恢复 / 恢复默认。
 * 背景图压缩成 WebP Blob（IndexedDB），不塞 localStorage。
 * 入口在页面右下角「···」或空白处右键菜单；本文件只负责文件输入、压缩、存储和状态。
 */
(() => {
  const DB_NAME = 'sharktab';
  const STORE = 'wallpaper';
  const KEY = 'current';
  const MAX_BYTES = 20 * 1024 * 1024;
  const MAX_EDGE = 3840;
  const MAX_PIXELS = 3840 * 2160;
  const WEBP_QUALITY = 0.85;

  const fileInput = document.getElementById('wallpaperFile');
  if (!fileInput) return;

  let objectUrl = null;
  let seq = 0;
  let writeChain = Promise.resolve();

  const warn = (message) => console.warn('[SharkTab]', message);

  function notify(message) {
    if (typeof window.showToast === 'function') window.showToast(message);
    else warn(message);
  }

  /* 所有 IndexedDB 写操作串行：旧壁纸的 put 不会插到「恢复默认」的 delete 之后。 */
  function queueWrite(task) {
    const run = writeChain.then(task, task);
    writeChain = run.catch(() => { /* 让队列在失败后继续 */ });
    return run;
  }

  function openDb() {
    if (!('indexedDB' in window)) {
      return Promise.reject(new Error('indexeddb-unavailable'));
    }

    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('indexeddb-blocked'));
    });
  }

  async function getStoredWallpaper() {
    const db = await openDb();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readonly');
        const req = tx.objectStore(STORE).get(KEY);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      });
    } finally {
      db.close();
    }
  }

  async function putStoredWallpaper(blob) {
    const db = await openDb();
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        // 带版本的对象：旧版存的是裸 Blob，恢复时据此重新压缩
        tx.objectStore(STORE).put({ version: 2, blob }, KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error('indexeddb-aborted'));
      });
    } finally {
      db.close();
    }
  }

  function readStoredWallpaper(value) {
    // 裸 Blob 是旧版原图，需要重新压缩；带版本的对象已经处理过
    if (value instanceof Blob) return { blob: value, processed: false };
    if (value && value.blob instanceof Blob) return { blob: value.blob, processed: true };
    return null;
  }

  async function clearStoredWallpaper() {
    const db = await openDb();
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete(KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error('indexeddb-aborted'));
      });
    } finally {
      db.close();
    }
  }

  function canvasToBlob(canvas, type, quality) {
    return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
  }

  /* 解码原图，按最大边长 / 总像素缩到显示够用的尺寸，再编码成 WebP。
   * 压缩失败时退回原图，至少让用户还能用；图片完全读不出来才报错。 */
  async function compressWallpaper(source) {
    const url = URL.createObjectURL(source);
    const img = new Image();
    let decoded = false;

    try {
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = () => reject(new Error('decode-failed'));
        img.src = url;
      });
      decoded = true;

      const iw = img.naturalWidth;
      const ih = img.naturalHeight;
      if (!iw || !ih) throw new Error('no-size');

      const edgeScale = Math.min(1, MAX_EDGE / Math.max(iw, ih));
      const pixelScale = Math.min(1, Math.sqrt(MAX_PIXELS / (iw * ih)));
      const scale = Math.min(edgeScale, pixelScale);
      const width = Math.max(1, Math.round(iw * scale));
      const height = Math.max(1, Math.round(ih * scale));

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('no-canvas');

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, width, height);

      const blob = await canvasToBlob(canvas, 'image/webp', WEBP_QUALITY);
      canvas.width = canvas.height = 1;

      if (!blob || !blob.type.startsWith('image/')) throw new Error('encode-failed');
      return { blob, compressed: true };
    } catch (error) {
      // 有些 SVG 会污染画布，或浏览器不支持目标编码；已经解码成功的原图先兜底。
      // 解码阶段就失败的文件不能兜底，否则会把坏图当成壁纸存下来。
      if (decoded) {
        return { blob: source, compressed: false, error };
      }
      throw error;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function applyWallpaper(source, { persist = true, recompress = true, progress = false } = {}) {
    const mine = ++seq;

    let blob = source;
    if (recompress) {
      let result;
      try {
        result = await compressWallpaper(source);
      } catch {
        if (mine === seq) notify('这张图片无法读取');
        return false;
      }

      if (mine !== seq) return false;

      // 压缩完成就收起「正在处理」，后面的保存失败提示不会再被它覆盖
      if (progress && typeof window.hideToast === 'function') window.hideToast();

      blob = result.blob;
      if (!result.compressed) notify('图片已应用，但无法压缩，已按原图保存');
    }

    if (mine !== seq) return false;

    const url = URL.createObjectURL(blob);
    if (mine !== seq) {
      URL.revokeObjectURL(url);
      return false;
    }

    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = url;
    document.documentElement.style.setProperty('--wallpaper', `url("${url}")`);

    if (persist) {
      try {
        await queueWrite(() => putStoredWallpaper(blob));
      } catch {
        if (mine === seq) notify('壁纸已应用，但无法保存；刷新后会丢失');
      }
    }

    return true;
  }

  async function resetWallpaper() {
    const mine = ++seq;

    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
      objectUrl = null;
    }
    document.documentElement.style.removeProperty('--wallpaper');

    try {
      await queueWrite(() => clearStoredWallpaper());
    } catch {
      if (mine === seq) notify('已恢复默认背景，但已保存的壁纸未能清除');
    }
  }

  async function restoreWallpaper() {
    let stored;
    try {
      stored = readStoredWallpaper(await getStoredWallpaper());
    } catch {
      return;
    }
    if (!stored) return;

    // 用户在读取期间已经开始换背景，就不要用旧图覆盖
    if (seq !== 0) return;

    // 旧版存的是原图，升级后恢复时压一次并回写；新版已处理过的文件直接显示
    const expected = seq + 1;
    const ok = await applyWallpaper(stored.blob, {
      persist: !stored.processed,
      recompress: !stored.processed,
    });

    if (!ok && seq === expected) {
      try {
        await queueWrite(() => clearStoredWallpaper());
      } catch {
        /* 读不出来的旧图清掉，下次不重复尝试 */
      }
    }
  }

  fileInput.addEventListener('change', () => {
    const file = fileInput.files && fileInput.files[0];
    fileInput.value = '';
    if (!file) return;

    if (file.type && !file.type.startsWith('image/')) {
      notify('请选择图片文件');
      return;
    }
    if (file.size > MAX_BYTES) {
      notify('图片太大，上限 20MB');
      return;
    }

    // 大图解码 / 压缩需要一点时间，先给用户一个已经收到的反馈
    notify('正在处理壁纸…');
    void applyWallpaper(file, { progress: true });
  });

  window.hasWallpaper = () => Boolean(objectUrl);
  window.resetWallpaper = resetWallpaper;

  void restoreWallpaper();
})();
