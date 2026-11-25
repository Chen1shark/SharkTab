/* page-menu.js
 * 页面操作菜单：空白处右键，或右下角「···」按钮。
 * 磁贴、搜索框、时钟、已打开的菜单和弹窗保留各自的原生/自定义行为。
 */
(() => {
  const pageMenu = document.getElementById('pageMenu');
  const trigger = document.getElementById('pageMore');
  if (!pageMenu) return;

  const IGNORE = '.search, .clock-container, .menu, .tile-menu, dialog';
  let menuAnchor = null;

  function closePageMenu() {
    if (pageMenu.hidden) return;
    pageMenu.classList.remove('is-open');
    pageMenu.hidden = true;
    menuAnchor = null;
    if (trigger) trigger.setAttribute('aria-expanded', 'false');
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(value, max));
  }

  function openPageMenu(x, y, focusFirst = true, anchor = null) {
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
    let left;
    let top;

    if (anchor) {
      // 从右下角按钮向上弹：右边缘对齐按钮，底边留 8px
      left = clamp(anchor.right - width, pad, window.innerWidth - width - pad);
      top = clamp(anchor.top - height - 8, pad, window.innerHeight - height - pad);
    } else {
      left = clamp(x, pad, window.innerWidth - width - pad);
      top = clamp(y, pad, window.innerHeight - height - pad);
    }

    pageMenu.style.left = `${left}px`;
    pageMenu.style.top = `${top}px`;

    // 从光标或按钮那一点向外放大，和磁贴右键菜单同一套动作
    const originX = clamp(anchor ? anchor.left + anchor.width / 2 - left : x - left, 0, width);
    const originY = clamp(anchor ? anchor.top - top : y - top, 0, height);
    pageMenu.style.transformOrigin = `${Math.round(originX)}px ${Math.round(originY)}px`;

    menuAnchor = anchor ? trigger : null;
    if (trigger) trigger.setAttribute('aria-expanded', 'true');

    if (!wasOpen) {
      void pageMenu.offsetWidth;
      pageMenu.classList.add('is-open');
    }

    // 鼠标右键只定位、不聚焦；键盘菜单键或键盘激活按钮时才把焦点交给第一项
    if (focusFirst) {
      const first = pageMenu.querySelector('.tile-menu-item');
      if (first) first.focus({ preventScroll: true });
    }
  }

  pageMenu.addEventListener('click', (event) => {
    const item = event.target.closest('.tile-menu-item');
    if (!item) return;

    const action = item.dataset.action;
    const fromTrigger = menuAnchor === trigger;
    closePageMenu();

    if (action === 'add-shortcut') {
      if (typeof openManager === 'function') openManager();
      return;
    }

    if (action === 'change-wallpaper') {
      const input = document.getElementById('wallpaperFile');
      if (input) input.click();
    } else if (action === 'reset-wallpaper') {
      if (typeof window.resetWallpaper === 'function') window.resetWallpaper();
    }

    // 从按钮打开时，动作结束后把焦点还给按钮；右键打开不抢焦点
    if (fromTrigger && trigger) trigger.focus({ preventScroll: true });
  });

  if (trigger) {
    trigger.addEventListener('click', (event) => {
      event.stopPropagation();

      if (!pageMenu.hidden && menuAnchor === trigger) {
        closePageMenu();
        trigger.focus({ preventScroll: true });
        return;
      }

      const rect = trigger.getBoundingClientRect();
      openPageMenu(rect.right, rect.top, event.detail === 0, rect);
    });
  }

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
      // 按钮自己负责 toggle，不能让 pointerdown 先把菜单关掉
      if (trigger && trigger.contains(event.target)) return;
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
      const fromTrigger = menuAnchor === trigger;
      closePageMenu();
      if (fromTrigger && trigger) trigger.focus({ preventScroll: true });
    },
    true,
  );

  window.addEventListener('resize', closePageMenu);
  window.addEventListener('scroll', closePageMenu, true);
})();
