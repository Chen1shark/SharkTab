/* page-menu.js
 * 所有右键都走自定义菜单，按场景给出不同动作：
 * - 时钟：复制时间 / 日期
 * - 页面空白 / 右下角「···」：页面操作
 * - 快捷入口网格 / 加号 / 折叠按钮：快捷入口操作
 * - 文本输入框：剪切 / 复制 / 粘贴
 * - 弹窗图标区：上传 / 恢复自动
 * - 搜索引擎按钮：引擎列表
 * 磁贴仍有自己的菜单；打开中的菜单和弹窗保留自定义行为，不再出现浏览器原生菜单。
 */
(() => {
  const pageMenu = document.getElementById('pageMenu');
  const trigger = document.getElementById('pageMore');
  const editMenu = document.getElementById('editMenu');
  const iconMenu = document.getElementById('iconMenu');
  const dialogMenu = document.getElementById('dialogMenu');
  const searchInput = document.getElementById('query');
  const engineMenu = document.getElementById('engineMenu');
  const shortcutsToggle = document.getElementById('shortcutsToggle');
  const timeEl = document.getElementById('time');
  const dateEl = document.getElementById('date');
  if (!pageMenu) return;

  let pageAnchor = null;
  let pageReturnFocus = null;
  let editReturnFocus = null;
  let editSelection = null;
  let iconReturnFocus = null;
  let dialogReturnFocus = null;

  if (typeof setupMenuArrowNavigation === 'function') {
    for (const menu of [pageMenu, editMenu, iconMenu, dialogMenu]) {
      if (menu) setupMenuArrowNavigation(menu, '.tile-menu-item');
    }
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(value, max));
  }

  /* 菜单统一从光标或锚点那一点向外放大；offsetWidth/Height 不受 transform 影响 */
  function placeMenu(menu, { x = 0, y = 0, anchor = null, dialog = null } = {}) {
    menu.style.left = '0px';
    menu.style.top = '0px';
    const width = menu.offsetWidth;
    const height = menu.offsetHeight;
    const pad = 8;
    let viewportLeft;
    let viewportTop;

    if (anchor) {
      // 从右下角按钮向上弹：右边缘对齐按钮，底边留 8px
      viewportLeft = clamp(anchor.right - width, pad, window.innerWidth - width - pad);
      viewportTop = clamp(anchor.top - height - 8, pad, window.innerHeight - height - pad);
    } else {
      viewportLeft = clamp(x, pad, window.innerWidth - width - pad);
      viewportTop = clamp(y, pad, window.innerHeight - height - pad);
    }

    let left = viewportLeft;
    let top = viewportTop;
    if (dialog) {
      // 弹窗里的菜单是 dialog 的绝对定位子元素，要减去 dialog 的位置
      const rect = dialog.getBoundingClientRect();
      left = viewportLeft - rect.left + dialog.scrollLeft;
      top = viewportTop - rect.top + dialog.scrollTop;
    }

    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;

    const originX = clamp(anchor ? anchor.left + anchor.width / 2 - viewportLeft : x - viewportLeft, 0, width);
    const originY = clamp(anchor ? anchor.top - viewportTop : y - viewportTop, 0, height);
    menu.style.transformOrigin = `${Math.round(originX)}px ${Math.round(originY)}px`;
  }

  function detachMenuFromDialog(menu) {
    const dialog = menu.parentElement && menu.parentElement.closest
      ? menu.parentElement.closest('dialog')
      : null;
    if (!dialog) return;
    dialog.style.overflow = '';
    document.body.append(menu);
    menu.style.position = '';
  }

  // 菜单在弹窗里时挂进 dialog，才能盖在弹窗内容之上
  function mountMenu(menu, target) {
    const dialog = target instanceof Element ? target.closest('dialog[open]') : null;
    if (!dialog) {
      detachMenuFromDialog(menu);
      return null;
    }

    const currentDialog = menu.parentElement && menu.parentElement.closest
      ? menu.parentElement.closest('dialog')
      : null;
    if (currentDialog && currentDialog !== dialog) currentDialog.style.overflow = '';

    if (menu.parentElement !== dialog) {
      dialog.append(menu);
      menu.style.position = 'absolute';
    }
    dialog.style.overflow = 'visible';
    return dialog;
  }

  function closePageMenu() {
    if (pageMenu.hidden) return;
    pageMenu.classList.remove('is-open');
    pageMenu.hidden = true;
    pageAnchor = null;
    pageReturnFocus = null;
    if (trigger) trigger.setAttribute('aria-expanded', 'false');
  }

  function closeEditMenu() {
    if (!editMenu) return;
    detachMenuFromDialog(editMenu);
    if (editMenu.hidden) return;
    editMenu.classList.remove('is-open');
    editMenu.hidden = true;
    editReturnFocus = null;
    editSelection = null;
  }

  function closeIconMenu() {
    if (!iconMenu) return;
    detachMenuFromDialog(iconMenu);
    if (iconMenu.hidden) return;
    iconMenu.classList.remove('is-open');
    iconMenu.hidden = true;
    iconReturnFocus = null;
  }

  function closeDialogMenu() {
    if (!dialogMenu) return;
    detachMenuFromDialog(dialogMenu);
    if (dialogMenu.hidden) return;
    dialogMenu.classList.remove('is-open');
    dialogMenu.hidden = true;
    dialogReturnFocus = null;
  }

  function closeEngineMenu() {
    if (typeof closeMenu === 'function') closeMenu();
  }

  function closeCustomMenus() {
    closePageMenu();
    closeEditMenu();
    closeIconMenu();
    closeDialogMenu();
  }

  function closeAllMenus() {
    closeCustomMenus();
    closeEngineMenu();
    if (typeof closeTileMenu === 'function') closeTileMenu();
  }

  function pageMenuItems() {
    return [...pageMenu.querySelectorAll('.tile-menu-item')]
      .filter((item) => !item.hidden && !item.disabled);
  }

  function configurePageMenu(scene) {
    const isClock = scene === 'clock';
    const isGrid = scene === 'grid';

    for (const item of pageMenu.querySelectorAll('[data-action="copy-time"], [data-action="copy-date"]')) {
      item.hidden = !isClock;
    }
    for (const item of pageMenu.querySelectorAll('[data-action="add-shortcut"], [data-action="change-wallpaper"], [data-action="reset-wallpaper"]')) {
      item.hidden = isClock;
    }

    const toggleItem = pageMenu.querySelector('[data-action="toggle-shortcuts"]');
    if (toggleItem) {
      const expanded = shortcutsToggle
        ? shortcutsToggle.getAttribute('aria-expanded') === 'true'
        : false;
      const canToggle = shortcutsToggle && !shortcutsToggle.hidden;
      toggleItem.hidden = !isGrid || !canToggle;
      toggleItem.classList.toggle('is-expanded', expanded);
      const label = toggleItem.querySelector('span');
      if (label) label.textContent = expanded ? '收起快捷入口' : '展开全部快捷入口';
    }

    if (!isClock) {
      const resetItem = pageMenu.querySelector('[data-action="reset-wallpaper"]');
      if (resetItem) {
        resetItem.hidden = !(typeof window.hasWallpaper === 'function' && window.hasWallpaper());
      }
    }

    pageMenu.setAttribute(
      'aria-label',
      isClock ? '时间操作' : (isGrid ? '快捷入口操作' : '页面操作')
    );
  }

  function openPageMenu(x, y, focusFirst = true, anchor = null, scene = 'page') {
    if (document.querySelector('dialog[open]')) return;

    closeEditMenu();
    closeIconMenu();
    closeDialogMenu();
    closeEngineMenu();
    if (typeof closeTileMenu === 'function') closeTileMenu();

    configurePageMenu(scene);

    const wasOpen = !pageMenu.hidden;
    pageMenu.hidden = false;
    if (!wasOpen) pageMenu.classList.remove('is-open');

    placeMenu(pageMenu, { x, y, anchor });

    pageAnchor = anchor ? trigger : null;
    pageReturnFocus = anchor
      ? trigger
      : (focusFirst && document.activeElement instanceof HTMLElement
          && document.activeElement !== document.body
          ? document.activeElement
          : null);
    if (trigger) trigger.setAttribute('aria-expanded', String(Boolean(anchor)));

    if (!wasOpen) {
      void pageMenu.offsetWidth;
      pageMenu.classList.add('is-open');
    }

    // 鼠标右键只定位、不聚焦；键盘菜单键或键盘激活按钮时才把焦点交给第一项
    if (focusFirst) {
      const first = pageMenu.querySelector('.tile-menu-item:not([hidden]):not(:disabled)');
      if (first) first.focus({ preventScroll: true });
    }
  }

  function editableInputOf(target) {
    const input = target.closest('input, textarea');
    if (!input || input.disabled || input.readOnly) return null;
    if (input.tagName === 'TEXTAREA') return input;
    const type = (input.getAttribute('type') || 'text').toLowerCase();
    return ['text', 'search', 'url', 'tel', 'password'].includes(type) ? input : null;
  }

  function selectionSnapshot(input) {
    const start = input.selectionStart ?? 0;
    const end = input.selectionEnd ?? start;
    return {
      input,
      start,
      end,
      direction: input.selectionDirection || 'none',
      text: input.value.slice(start, end),
    };
  }

  function restoreEditSelection(selection) {
    const input = selection && selection.input;
    if (!input || !input.isConnected) return null;
    input.focus({ preventScroll: true });
    input.setSelectionRange(selection.start, selection.end, selection.direction);
    return input;
  }

  function openEditMenu(input, x, y, focusFirst = false, target = input) {
    if (!editMenu || !input) return;

    closePageMenu();
    closeIconMenu();
    closeDialogMenu();
    closeEngineMenu();
    if (typeof closeTileMenu === 'function') closeTileMenu();

    const dialog = mountMenu(editMenu, target || input);

    editSelection = selectionSnapshot(input);
    const hasSelection = editSelection.start !== editSelection.end;
    for (const action of ['cut', 'copy']) {
      const item = editMenu.querySelector(`[data-action="${action}"]`);
      if (item) item.disabled = !hasSelection;
    }
    editMenu.setAttribute(
      'aria-label',
      input.closest('dialog') ? '输入框操作' : '文字操作'
    );

    const wasOpen = !editMenu.hidden;
    editMenu.hidden = false;
    if (!wasOpen) editMenu.classList.remove('is-open');

    placeMenu(editMenu, { x, y, dialog });

    editReturnFocus = input;

    if (!wasOpen) {
      void editMenu.offsetWidth;
      editMenu.classList.add('is-open');
    }

    // 鼠标右键保留输入框焦点和选区；键盘菜单键才把焦点交给第一个可用项
    if (focusFirst) {
      const first = editMenu.querySelector('.tile-menu-item:not(:disabled)');
      if (first) first.focus({ preventScroll: true });
    }
  }

  async function writeClipboard(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (_) { /* 走下面的兜底 */ }

    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.top = '0';
    area.style.left = '-9999px';
    area.style.opacity = '0';
    document.body.append(area);
    area.select();
    area.setSelectionRange(0, area.value.length);
    let copied = false;
    try {
      copied = document.execCommand('copy');
    } catch (_) {
      copied = false;
    }
    area.remove();
    return copied;
  }

  async function copyText(text, message) {
    if (!text) return;
    const copied = await writeClipboard(text);
    if (typeof showToast === 'function') {
      showToast(copied ? message : '复制失败，请手动复制');
    }
  }

  async function copyEditSelection(selection) {
    if (!selection || selection.start === selection.end) return;
    if (!restoreEditSelection(selection)) return;
    const copied = await writeClipboard(selection.text);
    if (!copied && typeof showToast === 'function') showToast('复制失败，请手动复制');
  }

  async function cutEditSelection(selection) {
    if (!selection || selection.start === selection.end) return;
    const input = restoreEditSelection(selection);
    if (!input) return;

    const copied = await writeClipboard(selection.text);
    if (!copied) {
      if (typeof showToast === 'function') showToast('剪切失败，请手动复制');
      return;
    }

    // 菜单打开后输入内容若已变化，不要按旧位置删错文字
    if (input.value.slice(selection.start, selection.end) !== selection.text) {
      if (typeof showToast === 'function') showToast('输入内容已变化，请重新剪切');
      return;
    }

    input.setRangeText('', selection.start, selection.end, 'start');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.focus({ preventScroll: true });
  }

  function insertTextAtSelection(input, text) {
    if (!input || !text) return;

    // 单行输入框从多行剪贴板粘贴时按原生行为压成一行
    const clean = input.tagName === 'INPUT' ? text.replace(/[\r\n]+/g, ' ') : text;
    if (!clean) return;

    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? start;
    input.setRangeText(clean, start, end, 'end');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.focus({ preventScroll: true });
  }

  async function pasteEditSelection(selection) {
    const input = restoreEditSelection(selection);
    if (!input) return;

    let text = null;
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        text = await navigator.clipboard.readText();
      }
    } catch (_) {
      text = null;
    }

    if (typeof text === 'string') {
      if (text) insertTextAtSelection(input, text);
      return;
    }

    // 没有 clipboardRead 权限时让浏览器自己粘贴；仍失败就提示键盘粘贴
    let pasted = false;
    try {
      pasted = document.execCommand('paste');
    } catch (_) {
      pasted = false;
    }
    if (!pasted && typeof showToast === 'function') {
      showToast('无法读取剪贴板，请按 Ctrl+V 粘贴');
    }
  }

  function openIconMenu(x, y, focusFirst = false, target = null) {
    if (!iconMenu) return;

    closePageMenu();
    closeEditMenu();
    closeDialogMenu();
    closeEngineMenu();
    if (typeof closeTileMenu === 'function') closeTileMenu();

    const dialog = mountMenu(iconMenu, target);

    const resetItem = iconMenu.querySelector('[data-action="reset-icon"]');
    const resetBtn = document.getElementById('iconReset');
    if (resetItem) resetItem.hidden = !resetBtn || resetBtn.hidden;

    const wasOpen = !iconMenu.hidden;
    iconMenu.hidden = false;
    if (!wasOpen) iconMenu.classList.remove('is-open');

    placeMenu(iconMenu, { x, y, dialog });

    iconReturnFocus = focusFirst
      && document.activeElement instanceof HTMLElement
      && document.activeElement !== document.body
      ? document.activeElement
      : null;

    if (!wasOpen) {
      void iconMenu.offsetWidth;
      iconMenu.classList.add('is-open');
    }

    if (focusFirst) {
      const first = iconMenu.querySelector('.tile-menu-item:not([hidden]):not(:disabled)');
      if (first) first.focus({ preventScroll: true });
    }
  }

  function openEngineMenu(focusFirst = false) {
    closePageMenu();
    closeEditMenu();
    closeIconMenu();
    closeDialogMenu();
    if (typeof closeTileMenu === 'function') closeTileMenu();
    if (typeof openMenu !== 'function') return;

    openMenu();

    if (focusFirst && engineMenu) {
      const selected = engineMenu.querySelector('.menu-item[aria-selected="true"]');
      if (selected) selected.focus({ preventScroll: true });
    }
  }

  function openDialogMenu(x, y, focusFirst = false, target = null) {
    if (!dialogMenu) return;

    closePageMenu();
    closeEditMenu();
    closeIconMenu();
    closeEngineMenu();
    if (typeof closeTileMenu === 'function') closeTileMenu();

    const dialog = mountMenu(dialogMenu, target);
    const isConfirm = Boolean(dialog && dialog.id === 'confirmDialog');
    const label = dialogMenu.querySelector('#dialogCloseLabel');
    if (label) label.textContent = isConfirm ? '取消' : '关闭面板';
    dialogMenu.setAttribute('aria-label', isConfirm ? '取消操作' : '弹窗操作');

    const wasOpen = !dialogMenu.hidden;
    dialogMenu.hidden = false;
    if (!wasOpen) dialogMenu.classList.remove('is-open');

    placeMenu(dialogMenu, { x, y, dialog });

    dialogReturnFocus = focusFirst
      && document.activeElement instanceof HTMLElement
      && document.activeElement !== document.body
      ? document.activeElement
      : null;

    if (!wasOpen) {
      void dialogMenu.offsetWidth;
      dialogMenu.classList.add('is-open');
    }

    if (focusFirst) {
      const first = dialogMenu.querySelector('.tile-menu-item:not(:disabled)');
      if (first) first.focus({ preventScroll: true });
    }
  }

  pageMenu.addEventListener('click', (event) => {
    const item = event.target.closest('.tile-menu-item');
    if (!item) return;

    const action = item.dataset.action;
    const returnFocus = pageReturnFocus;
    closePageMenu();

    if (action === 'add-shortcut') {
      if (typeof openManager === 'function') openManager();
      return;
    }

    if (action === 'toggle-shortcuts') {
      if (shortcutsToggle) shortcutsToggle.click();
    } else if (action === 'change-wallpaper') {
      const input = document.getElementById('wallpaperFile');
      if (input) input.click();
    } else if (action === 'reset-wallpaper') {
      if (typeof window.resetWallpaper === 'function') window.resetWallpaper();
    } else if (action === 'copy-time') {
      void copyText(timeEl ? timeEl.textContent : '', '已复制时间');
    } else if (action === 'copy-date') {
      void copyText(dateEl ? dateEl.textContent : '', '已复制日期');
    }

    // 按钮或键盘打开时，动作结束后把焦点还给触发元素；鼠标右键打开不抢焦点
    if (returnFocus) returnFocus.focus({ preventScroll: true });
  });

  if (editMenu) {
    editMenu.addEventListener('click', (event) => {
      const item = event.target.closest('.tile-menu-item');
      if (!item || item.disabled) return;

      const action = item.dataset.action;
      const selection = editSelection;
      closeEditMenu();

      if (action === 'cut') void cutEditSelection(selection);
      else if (action === 'copy') void copyEditSelection(selection);
      else if (action === 'paste') void pasteEditSelection(selection);
    });
  }

  if (iconMenu) {
    iconMenu.addEventListener('click', (event) => {
      const item = event.target.closest('.tile-menu-item');
      if (!item) return;

      const action = item.dataset.action;
      const returnFocus = iconReturnFocus;
      closeIconMenu();

      if (action === 'upload-icon') {
        const btn = document.getElementById('iconUpload');
        if (btn) btn.click();
      } else if (action === 'reset-icon') {
        const btn = document.getElementById('iconReset');
        if (btn && !btn.hidden) btn.click();
      }

      if (returnFocus) returnFocus.focus({ preventScroll: true });
    });
  }

  if (dialogMenu) {
    dialogMenu.addEventListener('click', (event) => {
      const item = event.target.closest('.tile-menu-item');
      if (!item) return;

      const hostDialog = dialogMenu.parentElement && dialogMenu.parentElement.closest
        ? dialogMenu.parentElement.closest('dialog')
        : null;
      closeDialogMenu();
      if (hostDialog && hostDialog.open) hostDialog.close();
    });
  }

  if (trigger) {
    trigger.addEventListener('click', (event) => {
      event.stopPropagation();

      if (!pageMenu.hidden && pageAnchor === trigger) {
        closePageMenu();
        trigger.focus({ preventScroll: true });
        return;
      }

      const rect = trigger.getBoundingClientRect();
      openPageMenu(rect.right, rect.top, event.detail === 0, rect, 'page');
    });

    trigger.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
      if (event.altKey || event.ctrlKey || event.metaKey) return;

      event.preventDefault();
      if (pageMenu.hidden) {
        const rect = trigger.getBoundingClientRect();
        openPageMenu(rect.right, rect.top, false, rect, 'page');
      }
      if (pageMenu.hidden) return;

      const items = pageMenuItems();
      if (!items.length) return;
      const target = event.key === 'ArrowDown' ? items[0] : items[items.length - 1];
      target.focus({ preventScroll: true });
    });
  }

  document.addEventListener(
    'contextmenu',
    (event) => {
      const target = event.target instanceof Element ? event.target : null;

      // 页面上不再出现浏览器原生菜单：磁贴、弹窗、输入框、菜单本身都走自定义处理
      event.preventDefault();
      if (!target) return;

      const keyboard = event.button !== 2;
      const pointFor = (el) => {
        if (!keyboard) return [event.clientX, event.clientY];
        const rect = el.getBoundingClientRect();
        return [rect.left + rect.width / 2, rect.top + rect.height / 2];
      };

      // 打开中的自定义菜单：右键收起，不再叠加
      if (target.closest('.tile-menu, .menu')) {
        closeAllMenus();
        return;
      }

      // 磁贴：普通磁贴由自己的监听打开 tileMenu；加号磁贴走快捷入口菜单
      if (target.closest('.shortcut')) {
        closePageMenu();
        closeEditMenu();
        closeIconMenu();
        closeEngineMenu();

        if (target.closest('.shortcut.add')) {
          if (typeof closeTileMenu === 'function') closeTileMenu();
          const [x, y] = pointFor(target);
          openPageMenu(x, y, keyboard, null, 'grid');
        }
        return;
      }

      // 弹窗：输入框和图标区给对应菜单，其它区域只屏蔽原生菜单
      if (target.closest('dialog')) {
        const input = editableInputOf(target);
        if (input) {
          const [x, y] = pointFor(input);
          openEditMenu(input, x, y, keyboard, target);
          return;
        }
        if (target.closest('#preview, #iconUpload, #iconReset')) {
          const [x, y] = pointFor(target);
          openIconMenu(x, y, keyboard, target);
          return;
        }

        const [x, y] = pointFor(target);
        openDialogMenu(x, y, keyboard, target);
        return;
      }

      // 时钟
      if (target.closest('.clock-container')) {
        const [x, y] = pointFor(target);
        openPageMenu(x, y, keyboard, null, 'clock');
        return;
      }

      // 搜索引擎按钮：打开引擎列表
      if (target.closest('#engineBtn')) {
        openEngineMenu(keyboard);
        return;
      }

      // 搜索框其它区域：文字编辑菜单，目标是输入框
      if (target.closest('.search')) {
        const input = editableInputOf(target) || searchInput;
        if (input) {
          const [x, y] = pointFor(target);
          openEditMenu(input, x, y, keyboard, target);
          return;
        }
      }

      // 快捷入口网格 / 折叠按钮
      if (target.closest('.shortcuts, .shortcuts-toggle')) {
        const [x, y] = pointFor(target);
        openPageMenu(x, y, keyboard, null, 'grid');
        return;
      }

      // 右下角「···」
      if (target.closest('#pageMore') && trigger) {
        const rect = trigger.getBoundingClientRect();
        openPageMenu(rect.right, rect.top, keyboard, rect, 'page');
        return;
      }

      // 提示条等纯反馈元素不给菜单
      if (target.closest('.toast')) {
        closePageMenu();
        closeEditMenu();
        closeIconMenu();
        closeEngineMenu();
        return;
      }

      // 页面空白
      const [x, y] = pointFor(target);
      openPageMenu(x, y, keyboard, null, 'page');
    },
    false
  );

  document.addEventListener(
    'pointerdown',
    (event) => {
      if (!pageMenu.hidden && !pageMenu.contains(event.target)) {
        // 按钮自己负责 toggle，不能让 pointerdown 先把菜单关掉
        if (!trigger || !trigger.contains(event.target)) closePageMenu();
      }
      if (editMenu && !editMenu.hidden && !editMenu.contains(event.target)) closeEditMenu();
      if (iconMenu && !iconMenu.hidden && !iconMenu.contains(event.target)) closeIconMenu();
      if (dialogMenu && !dialogMenu.hidden && !dialogMenu.contains(event.target)) closeDialogMenu();
    },
    true,
  );

  // 菜单打开后继续输入会让剪切/复制状态过期，直接收起
  document.addEventListener(
    'input',
    () => {
      if (editMenu && !editMenu.hidden) closeEditMenu();
    },
    true,
  );

  // 捕获阶段先关掉最上层菜单，避免 App 的 Escape 顺手清空搜索框或关闭弹窗
  document.addEventListener(
    'keydown',
    (event) => {
      if (event.key !== 'Escape') return;

      let returnFocus = false;
      if (!pageMenu.hidden) {
        returnFocus = pageReturnFocus;
        closePageMenu();
      } else if (editMenu && !editMenu.hidden) {
        returnFocus = editReturnFocus;
        closeEditMenu();
      } else if (iconMenu && !iconMenu.hidden) {
        returnFocus = iconReturnFocus;
        closeIconMenu();
      } else if (dialogMenu && !dialogMenu.hidden) {
        returnFocus = dialogReturnFocus;
        closeDialogMenu();
      } else {
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();
      if (returnFocus instanceof HTMLElement) returnFocus.focus({ preventScroll: true });
    },
    true,
  );

  for (const dialog of document.querySelectorAll('dialog')) {
    dialog.addEventListener('close', closeCustomMenus);
  }

  window.addEventListener('resize', closeAllMenus);
  window.addEventListener('scroll', closeAllMenus, true);
})();
