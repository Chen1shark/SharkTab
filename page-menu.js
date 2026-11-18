/* page-menu.js
 * 空白处右键菜单：新增快捷入口 / 更换壁纸。
 * 磁贴、搜索框、时钟、已打开的菜单和弹窗保留各自的原生/自定义行为。
 */
(() => {
  const pageMenu = document.getElementById('pageMenu');
  if (!pageMenu) return;

  const IGNORE = '.search, .clock-container, .menu, .tile-menu, dialog';

  function closePageMenu() {
    if (pageMenu.hidden) return;
    pageMenu.classList.remove('is-open');
    pageMenu.hidden = true;
  }

  function openPageMenu(x, y, focusFirst = true) {
    if (document.querySelector('dialog[open]')) return;

    // 同一时间只留一个菜单
    if (typeof closeMenu === 'function') closeMenu();
    if (typeof closeTileMenu === 'function') closeTileMenu();

    // 没有自定义背景时，不显示「恢复默认背景」
    const resetItem = pageMenu.querySelector('[data-action="reset-wallpaper"]');
    if (resetItem) {
      const hasWallpaper =
        typeof window.hasWallpaper === 'function' && window.hasWallpaper();
      resetItem.hidden = !hasWallpaper;
    }

    const wasOpen = !pageMenu.hidden;
    pageMenu.hidden = false;
    if (!wasOpen) pageMenu.classList.remove('is-open');

    // offsetWidth/Height 不受 transform 影响，可以直接量出未缩放尺寸
    pageMenu.style.left = '0px';
    pageMenu.style.top = '0px';
    const width = pageMenu.offsetWidth;
    const height = pageMenu.offsetHeight;

    const pad = 8;
    const left = Math.max(pad, Math.min(x, window.innerWidth - width - pad));
    const top = Math.max(pad, Math.min(y, window.innerHeight - height - pad));
    pageMenu.style.left = `${left}px`;
    pageMenu.style.top = `${top}px`;

    // 从光标那一点向外放大，和磁贴右键菜单同一套动作
    const originX = Math.max(0, Math.min(width, x - left));
    const originY = Math.max(0, Math.min(height, y - top));
    pageMenu.style.transformOrigin = `${Math.round(originX)}px ${Math.round(originY)}px`;

    if (!wasOpen) {
      void pageMenu.offsetWidth;
      pageMenu.classList.add('is-open');
    }

    // 鼠标右键只定位、不聚焦；键盘菜单键（button 0）才把焦点交给第一项
    if (focusFirst) {
      const first = pageMenu.querySelector('.tile-menu-item');
      if (first) first.focus({ preventScroll: true });
    }
  }

  pageMenu.addEventListener('click', (event) => {
    const item = event.target.closest('.tile-menu-item');
    if (!item) return;

    const action = item.dataset.action;
    closePageMenu();

    if (action === 'add-shortcut') {
      if (typeof openManager === 'function') openManager();
    } else if (action === 'change-wallpaper') {
      const input = document.getElementById('wallpaperFile');
      if (input) input.click();
    } else if (action === 'reset-wallpaper') {
      if (typeof window.resetWallpaper === 'function') window.resetWallpaper();
    }
  });

  document.addEventListener(
    'contextmenu',
    (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;

      // 磁贴有自己的右键菜单，不要抢
      if (target.closest('.shortcut')) {
        closePageMenu();
        return;
      }

      if (event.defaultPrevented) return;

      // 搜索栏、时钟、已打开的菜单和弹窗保留原有行为
      if (target.closest(IGNORE)) {
        closePageMenu();
        return;
      }

      event.preventDefault();
      openPageMenu(event.clientX, event.clientY, event.button !== 2);
    },
    false
  );

  document.addEventListener(
    'pointerdown',
    (event) => {
      if (pageMenu.hidden || pageMenu.contains(event.target)) return;
      closePageMenu();
    },
    true,
  );

  // 捕获阶段先关掉页面菜单，避免 App 的 Escape 顺手清空搜索框
  document.addEventListener(
    'keydown',
    (event) => {
      if (event.key !== 'Escape' || pageMenu.hidden) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      closePageMenu();
    },
    true,
  );

  window.addEventListener('resize', closePageMenu);
  window.addEventListener('scroll', closePageMenu, true);
})();
