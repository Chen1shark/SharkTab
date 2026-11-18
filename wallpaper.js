/* wallpaper.js
 * 自定义背景：上传 → 采样 → 落盘 → 刷新恢复 / 恢复默认。
 * 背景图存成 Blob（IndexedDB），不塞 localStorage。
 * 入口在页面空白处右键菜单；本文件只负责文件输入、存储和状态。
 */
(() => {
  const DB_NAME = 'sharktab';
  const STORE = 'wallpaper';
  const KEY = 'current';
  const MAX_BYTES = 20 * 1024 * 1024;

  const fileInput = document.getElementById('wallpaperFile');
  if (!fileInput) return;

  let objectUrl = null;
  let seq = 0;

  const warn = (message) => console.warn('[SharkTab]', message);

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
        tx.objectStore(STORE).put(blob, KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error('indexeddb-aborted'));
      });
    } finally {
      db.close();
    }
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

  async function applyWallpaper(blob, { persist = true } = {}) {
    if (typeof window.applyWallpaperTone !== 'function') {
      warn('背景读取组件未加载');
      return false;
    }

    const mine = ++seq;
    const url = URL.createObjectURL(blob);

    let ok = false;
    try {
      ok = (await window.applyWallpaperTone(url)) !== false;
    } catch {
      ok = false;
    }

    if (mine !== seq) {
      URL.revokeObjectURL(url);
      return false;
    }

    if (!ok) {
      URL.revokeObjectURL(url);
      warn('这张图片无法读取');
      return false;
    }

    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = url;
    document.documentElement.style.setProperty('--wallpaper', `url("${url}")`);

    if (persist) {
      try {
        await putStoredWallpaper(blob);
      } catch {
        warn('已应用，但无法保存');
      }
    }

    return true;
  }

  async function resetWallpaper() {
    seq++;
    if (typeof window.resetWallpaperTone === 'function') {
      window.resetWallpaperTone();
    }
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
      objectUrl = null;
    }
    document.documentElement.style.removeProperty('--wallpaper');
    try {
      await clearStoredWallpaper();
    } catch {
      /* 存储不可用时也允许本页恢复默认 */
    }
  }

  async function restoreWallpaper() {
    let blob;
    try {
      blob = await getStoredWallpaper();
    } catch {
      return;
    }
    if (!blob || !(blob instanceof Blob)) return;
    // 用户在读取期间已经开始换背景，就不要用旧图覆盖
    if (seq !== 0) return;

    const mine = seq + 1;
    const ok = await applyWallpaper(blob, { persist: false });
    if (!ok && seq === mine) {
      try {
        await clearStoredWallpaper();
      } catch {
        /* ignore */
      }
    }
  }

  fileInput.addEventListener('change', () => {
    const file = fileInput.files && fileInput.files[0];
    fileInput.value = '';
    if (!file) return;
    if (file.type && !file.type.startsWith('image/')) {
      warn('请选择图片文件');
      return;
    }
    if (file.size > MAX_BYTES) {
      warn('图片太大，上限 20MB');
      return;
    }
    void applyWallpaper(file);
  });

  window.hasWallpaper = () => Boolean(objectUrl);
  window.resetWallpaper = resetWallpaper;

  void restoreWallpaper();
})();
