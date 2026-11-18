const ENGINES = [
  { id: 'bing',   name: 'Bing',   domain: 'bing.com',   logo: 'icons/engines/bing.png',   url: 'https://www.bing.com/search?q=%s' },
  { id: 'google', name: 'Google', domain: 'google.com', logo: 'icons/engines/google.png', url: 'https://www.google.com/search?q=%s' },
  { id: 'baidu',  name: '百度',   domain: 'baidu.com',  logo: 'icons/engines/baidu.svg',  url: 'https://www.baidu.com/s?wd=%s' },
];

const STORAGE_KEY = 'sharktab.engine';
const DEFAULT_ENGINE = 'bing';

const form = document.getElementById('searchForm');
const input = document.getElementById('query');
const hint = document.getElementById('searchHint');
const clearBtn = document.getElementById('clearBtn');
const engineBtn = document.getElementById('engineBtn');
const engineIconSlot = document.getElementById('engineIcon');
const engineMenu = document.getElementById('engineMenu');

let composing = false;

/* ---------- 搜索引擎选择 ---------- */

function engineLogoUrl(engine) {
  // 本地透明底 logo，统一放在浅色底座上；后续可直接替换这里的文件
  return engine.logo;
}

/* 彩色 logo，加载失败或超时则回退到首字母色块。
 * 图片请求可能被墙/挂起，所以用超时主动放弃，避免拖慢页面 load。 */
const LOGO_TIMEOUT = 4000;

function makeEngineLogo(engine) {
  const slot = document.createElement('span');
  slot.className = 'engine-logo-slot';
  slot.append(badgeFor({ url: `https://${engine.domain}/`, name: engine.name }));

  const img = new Image();
  img.alt = '';
  img.className = 'engine-logo';

  let settled = false;
  const timer = setTimeout(() => {
    if (settled) return;
    settled = true;
    img.src = '';
  }, LOGO_TIMEOUT);

  img.addEventListener('load', () => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    if (img.naturalWidth >= 8 && img.naturalHeight >= 8) {
      slot.replaceChildren(img);
    }
  });
  img.addEventListener('error', () => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
  });

  img.src = engineLogoUrl(engine);
  return slot;
}

function getEngine() {
  let id = DEFAULT_ENGINE;
  try {
    id = localStorage.getItem(STORAGE_KEY) || DEFAULT_ENGINE;
  } catch (_) { /* 存储不可用时回退到默认引擎 */ }

  const engine = ENGINES.find((e) => e.id === id);
  if (engine) return engine;

  // 引擎已下线（如 DuckDuckGo）时清掉旧偏好，回到默认
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (_) { /* 忽略清理失败 */ }
  return ENGINES[0];
}

function setEngine(id) {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch (_) { /* 忽略写入失败 */ }
  syncEngine();
}

function syncEngine() {
  const engine = getEngine();
  engineIconSlot.replaceChildren(makeEngineLogo(engine));
  engineBtn.setAttribute('aria-label', `切换搜索引擎，当前 ${engine.name}`);
  hint.textContent = `在 ${engine.name} 中搜索`;

  for (const item of engineMenu.children) {
    item.setAttribute('aria-selected', String(item.dataset.id === engine.id));
  }
}

function buildMenu() {
  for (const engine of ENGINES) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'menu-item';
    item.dataset.id = engine.id;
    item.setAttribute('role', 'option');

    const icon = document.createElement('span');
    icon.className = 'menu-icon';
    icon.append(makeEngineLogo(engine));

    const label = document.createElement('span');
    label.className = 'menu-label';
    label.textContent = engine.name;

    const check = document.createElement('span');
    check.className = 'check';
    check.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.6 L9.8 17.4 L19 6.8" /></svg>';

    item.append(icon, label, check);
    item.addEventListener('click', () => {
      setEngine(engine.id);
      closeMenu();
      input.focus();
    });
    engineMenu.append(item);
  }
}

function openMenu() {
  engineMenu.hidden = false;
  engineBtn.setAttribute('aria-expanded', 'true');
  // 先提交 opacity:0 / scale(.97) 的起始态，再切到 is-open 触发 transition
  void engineMenu.offsetWidth;
  engineMenu.classList.add('is-open');
}

function closeMenu() {
  engineMenu.classList.remove('is-open');
  engineMenu.hidden = true;
  engineBtn.setAttribute('aria-expanded', 'false');
}

/* ---------- 输入处理 ---------- */

function submit() {
  if (composing) return;
  const text = input.value.trim();
  if (!text) return;

  // 保留当前新标签页，搜索结果在新标签页打开
  openInNewTab(getEngine().url.replace('%s', encodeURIComponent(text)));
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  submit();
});

input.addEventListener('compositionstart', () => { composing = true; });
input.addEventListener('compositionend', () => { composing = false; });

clearBtn.addEventListener('click', () => {
  input.value = '';
  input.focus();
});

/* ---------- 引擎菜单交互 ---------- */

engineBtn.addEventListener('click', (event) => {
  event.stopPropagation();
  if (engineMenu.hidden) openMenu();
  else closeMenu();
});

document.addEventListener('click', (event) => {
  if (!engineMenu.hidden && !engineMenu.contains(event.target)) closeMenu();
});

/* ---------- 快捷入口 ---------- */

const SHORTCUTS_KEY = 'sharktab.shortcuts.v1';

const DEFAULT_SHORTCUTS = [
  { id: 'github', name: 'GitHub', url: 'https://github.com/', icon: '' },
  { id: 'bilibili', name: '哔哩哔哩', url: 'https://www.bilibili.com/', icon: '' },
  { id: 'douyu', name: '斗鱼', url: 'https://www.douyu.com/', icon: '' },
];

const shortcutsEl = document.getElementById('shortcuts');
const shortcutsToggle = document.getElementById('shortcutsToggle');
const manager = document.getElementById('manager');
const managerForm = document.getElementById('managerForm');
const managerClose = document.getElementById('managerClose');
const tileMenu = document.getElementById('tileMenu');
const confirmDialog = document.getElementById('confirmDialog');
const confirmName = document.getElementById('confirmName');
const confirmCancel = document.getElementById('confirmCancel');
const confirmOk = document.getElementById('confirmOk');
const scName = document.getElementById('scName');
const scUrl = document.getElementById('scUrl');
const formError = document.getElementById('formError');
const formTitle = document.getElementById('formTitle');
const saveBtn = document.getElementById('saveBtn');
const cancelEdit = document.getElementById('cancelEdit');
const preview = document.getElementById('preview');
const previewIcon = document.getElementById('previewIcon');
const previewText = document.getElementById('previewText');
const iconUpload = document.getElementById('iconUpload');
const iconReset = document.getElementById('iconReset');
const iconFile = document.getElementById('iconFile');

let shortcuts = loadShortcuts();
let editingId = null;
let nameAutoFilled = false;
let previewTimer = 0;
let currentIcon = '';
let menuShortcut = null;
let pendingDelete = null;
let managerResetTimer = 0;

function normalizeUrl(raw) {
  const text = raw.trim();
  if (!text) return null;
  const candidate = /^https?:\/\//i.test(text) ? text : `https://${text}`;
  try {
    const url = new URL(candidate);
    return /^http(s)?:$/.test(url.protocol) ? url.href : null;
  } catch (_) {
    return null;
  }
}

function isValidShortcut(item) {
  return item
    && typeof item === 'object'
    && typeof item.id === 'string'
    && typeof item.name === 'string'
    && typeof item.url === 'string'
    && normalizeUrl(item.url) !== null;
}

function loadShortcuts() {
  try {
    const raw = localStorage.getItem(SHORTCUTS_KEY);
    if (raw !== null) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter(isValidShortcut).map((item) => ({
          id: item.id,
          name: item.name.slice(0, 24),
          url: normalizeUrl(item.url),
          // 旧版内置图标路径不再保留；站点图标全部由本地运行时抓取
          icon: typeof item.icon === 'string' && !item.icon.startsWith('icons/') ? item.icon : '',
        }));
      }
    }
  } catch (_) { /* 数据损坏时回退默认值 */ }
  return DEFAULT_SHORTCUTS.map((item) => ({ ...item }));
}

function saveShortcuts() {
  try {
    localStorage.setItem(SHORTCUTS_KEY, JSON.stringify(shortcuts));
  } catch (_) { /* 存储不可用时本次修改不持久化 */ }
}

function makeId() {
  try {
    if (crypto.randomUUID) return crypto.randomUUID();
  } catch (_) { /* 非安全上下文时走下面的兜底 */ }
  return `sc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/* 常见站点的品牌名：输入网址后回显成「豆包」而不是「doubao.com」。
 * 键为不带 www. 的域名（小写）；匹配时也认子域名，取最长命中。 */
const SITE_NAMES = {
  // 中文站点
  'doubao.com': '豆包',
  'bilibili.com': '哔哩哔哩',
  'b23.tv': '哔哩哔哩',
  'douyin.com': '抖音',
  'ixigua.com': '西瓜视频',
  'douyu.com': '斗鱼',
  'huya.com': '虎牙直播',
  'acfun.cn': 'AcFun',
  'zhihu.com': '知乎',
  'weibo.com': '微博',
  'xiaohongshu.com': '小红书',
  'douban.com': '豆瓣',
  'tieba.baidu.com': '百度贴吧',
  'baidu.com': '百度',
  'qq.com': '腾讯QQ',
  'y.qq.com': 'QQ音乐',
  'qqmusic.qq.com': 'QQ音乐',
  'weixin.qq.com': '微信',
  'wechat.com': '微信',
  '163.com': '网易',
  'music.163.com': '网易云音乐',
  'taobao.com': '淘宝',
  'tmall.com': '天猫',
  'jd.com': '京东',
  'pinduoduo.com': '拼多多',
  'yangkeduo.com': '拼多多',
  'alipay.com': '支付宝',
  'aliyun.com': '阿里云',
  'dingtalk.com': '钉钉',
  'feishu.cn': '飞书',
  'larksuite.com': '飞书',
  'wps.cn': 'WPS',
  'youku.com': '优酷',
  'iqiyi.com': '爱奇艺',
  'mgtv.com': '芒果TV',
  'kuaishou.com': '快手',
  'toutiao.com': '今日头条',
  'meituan.com': '美团',
  'dianping.com': '大众点评',
  'ele.me': '饿了么',
  'ctrip.com': '携程',
  'qunar.com': '去哪儿',
  'amap.com': '高德地图',
  '12306.cn': '12306',
  'smzdm.com': '什么值得买',
  'kugou.com': '酷狗音乐',
  'mi.com': '小米',
  'huawei.com': '华为',
  // 开发者 / 技术
  'github.com': 'GitHub',
  'gitlab.com': 'GitLab',
  'gitee.com': 'Gitee',
  'gitcode.com': 'GitCode',
  'stackoverflow.com': 'Stack Overflow',
  'npmjs.com': 'npm',
  'developer.mozilla.org': 'MDN',
  'mozilla.org': 'Mozilla',
  'csdn.net': 'CSDN',
  'juejin.cn': '掘金',
  'segmentfault.com': 'SegmentFault',
  'cnblogs.com': '博客园',
  'oschina.net': '开源中国',
  'v2ex.com': 'V2EX',
  'nodeseek.com': 'NodeSeek',
  'linux.do': 'LINUX DO',
  'jianshu.com': '简书',
  'sspai.com': '少数派',
  '52pojie.cn': '吾爱破解',
  'huggingface.co': 'Hugging Face',
  'kaggle.com': 'Kaggle',
  'colab.research.google.com': 'Colab',
  // AI
  'openai.com': 'OpenAI',
  'chatgpt.com': 'ChatGPT',
  'claude.ai': 'Claude',
  'anthropic.com': 'Anthropic',
  'deepseek.com': 'DeepSeek',
  'kimi.com': 'Kimi',
  'moonshot.cn': 'Kimi',
  'tongyi.aliyun.com': '通义',
  'gemini.google.com': 'Gemini',
  'notebooklm.google.com': 'NotebookLM',
  // 国际站点
  'google.com': 'Google',
  'bing.com': 'Bing',
  'youtube.com': 'YouTube',
  'x.com': 'X',
  'twitter.com': 'Twitter',
  'facebook.com': 'Facebook',
  'instagram.com': 'Instagram',
  'reddit.com': 'Reddit',
  'discord.com': 'Discord',
  'telegram.org': 'Telegram',
  'wikipedia.org': 'Wikipedia',
  'netflix.com': 'Netflix',
  'spotify.com': 'Spotify',
  'amazon.com': 'Amazon',
  'apple.com': 'Apple',
  'microsoft.com': 'Microsoft',
  'notion.so': 'Notion',
  'figma.com': 'Figma',
  'vercel.com': 'Vercel',
  'cloudflare.com': 'Cloudflare',
  'medium.com': 'Medium',
  'dev.to': 'DEV',
  'steampowered.com': 'Steam',
  'steamcommunity.com': 'Steam',
  'epicgames.com': 'Epic Games',
  'pixiv.net': 'Pixiv',
};

/* 返回匹配到的品牌名；子域名也算命中（取最长的键），没有则返回空串 */
function siteLabel(host) {
  const clean = host.toLowerCase().replace(/^www\./, '');
  let bestKey = '';

  for (const key of Object.keys(SITE_NAMES)) {
    if (clean === key || clean.endsWith(`.${key}`)) {
      if (key.length > bestKey.length) bestKey = key;
    }
  }

  return bestKey ? SITE_NAMES[bestKey] : '';
}

/* 从网址推导默认名称：优先用内置品牌名，其次域名去掉开头的 www. */
function deriveName(url) {
  try {
    const host = new URL(url).hostname;
    const known = siteLabel(host);
    if (known) return known.slice(0, 24);
    return host.replace(/^www\./i, '').slice(0, 24);
  } catch (_) {
    return '';
  }
}

/* 输入网址后回显识别结果：图标 + 名称 */
function updatePreview() {
  const url = normalizeUrl(scUrl.value);
  if (!url) {
    preview.hidden = true;
    return;
  }

  let host = '';
  try {
    host = new URL(url).hostname;
  } catch (_) { /* 上面已校验过，这里不会走到 */ }

  // 只输入了半截单词（如 "gith"）时不急于回显
  if (!host.includes('.') && host.toLowerCase() !== 'localhost') {
    preview.hidden = true;
    return;
  }

  preview.hidden = false;
  previewText.textContent = currentIcon.startsWith('data:')
    ? `自定义图标 · ${host}`
    : `已识别 ${host}`;
  fillIcon(
    previewIcon,
    {
      url,
      name: deriveName(url),
      icon: currentIcon,
    },
    // 表单回显不要先露首字母：等真实图标出来再显示
    { showBadgeWhileLoading: false }
  );
  syncIconControls();

  if (nameAutoFilled || !scName.value.trim()) {
    scName.value = deriveName(url);
    nameAutoFilled = true;
  }
}

function autoIconFor(url) {
  const known = DEFAULT_SHORTCUTS.find((item) => normalizeUrl(item.url) === url);
  return known ? known.icon : '';
}

function syncIconControls() {
  iconReset.hidden = !currentIcon.startsWith('data:');
}

function schedulePreview() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(updatePreview, 150);
}

/* 图标来源按优先级排序：
 * 1. 手动上传的图标
 * 2. 浏览器 favicon 缓存（扩展环境，需 manifest 的 favicon 权限）
 * 3. 站点根目录 favicon.ico
 * 4. icon.horse：解析站点声明的图标，响应带 CORS 与占位图标记，
 *    可以直接把同一枚图标的字节缓存下来（favicon.ico 返回 HTML 的 SPA 站点靠它兜底，如豆包）；
 *    站点没有图标时会返回占位图并带 x-icon-fallback: true，据此跳过，避免把占位图当成真图标
 * 5. 首字母色块
 *
 * 所有快捷入口图标都由用户本地运行时抓取并缓存，扩展包内不带站点品牌 logo。
 * 每个来源最多等 4 秒，超时即放弃，避免被墙的请求拖慢页面。
 */
function iconSources(sc) {
  if (sc.icon) return [sc.icon];

  const sources = [];


  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
    const pageUrl = encodeURIComponent(sc.url);
    // 只留 MV3 的 _favicon：chrome://favicon2 是旧接口，取不到时会一直等到超时，
    // 让表单回显和磁贴白白空等几秒
    sources.push(
      `${chrome.runtime.getURL('/_favicon/')}?pageUrl=${pageUrl}&size=64&scaleFactor=1x&forceEmptyDefaultFavicon=1`
    );
  }

  try {
    const host = new URL(sc.url).hostname;
    sources.push(
      `https://${host}/favicon.ico`,
      { url: `https://icon.horse/icon/${host}`, fallbackHeader: 'x-icon-fallback' }
    );
  } catch (_) { /* 无法解析时只剩首字母色块 */ }

  return sources;
}

function sourceUrl(source) {
  return typeof source === 'string' ? source : source.url;
}

/* ---------- 图标缓存 ----------
 * 每次刷新都重新走一遍网络，图标就会先闪一下字母块再出来。
 * 这里按域名把解析成功的图标记下来：
 * - 能把图片字节读出来时（浏览器 favicon 服务、走 CORS 取回的上游图标），
 *   存成 data URL，下次刷新同步出图，不依赖网络；
 * - 读不到字节的跨源图片，就记住可用的来源地址，下次优先用它。
 */
const ICON_CACHE_KEY = 'sharktab.icons.v2';
const ICON_CACHE_TTL = 60 * 24 * 60 * 60 * 1000;
const ICON_CACHE_LIMIT = 80;

const iconCache = loadIconCache();
let iconCacheTimer = 0;

function hostOf(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch (_) {
    return '';
  }
}

function loadIconCache() {
  try {
    const parsed = JSON.parse(localStorage.getItem(ICON_CACHE_KEY) || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (_) {
    return {};
  }
}

function rememberIcon(host, patch) {
  if (!host) return;
  iconCache[host] = { ...(iconCache[host] || {}), ...patch, at: Date.now() };
  clearTimeout(iconCacheTimer);
  iconCacheTimer = setTimeout(() => {
    iconCacheTimer = 0;
    saveIconCache();
  }, 1200);
}

function saveIconCache() {
  const cutoff = Date.now() - ICON_CACHE_TTL;
  const kept = Object.entries(iconCache)
    .filter(([, entry]) => entry && typeof entry.at === 'number' && entry.at > cutoff)
    .sort((a, b) => b[1].at - a[1].at)
    .slice(0, ICON_CACHE_LIMIT);

  for (const key of Object.keys(iconCache)) delete iconCache[key];
  for (const [key, entry] of kept) iconCache[key] = entry;

  try {
    localStorage.setItem(ICON_CACHE_KEY, JSON.stringify(iconCache));
  } catch (_) { /* 配额不足时只在本次会话内缓存 */ }
}

/* 同源图片才能导出字节；跨源会抛 SecurityError，返回空串 */
function iconDataUrlFrom(img) {
  try {
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    // 缩放到铺满 64px 画布：favicon 常见只有 16/32px，若不放大，
    // 存下来的图在 28px 磁贴里会显得比其它图标小一圈。
    const scale = Math.min(size / img.naturalWidth, size / img.naturalHeight);
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
    return canvas.toDataURL('image/webp', 0.9);
  } catch (_) {
    return '';
  }
}

function iconElement(src) {
  const img = new Image();
  img.alt = '';
  img.className = 'shortcut-icon';
  img.src = src;
  return img;
}

/* 加载单个来源，成功时返回 { img, data }：
 * - 普通来源直接挂到 Image 上；
 * - 字节来源先 fetch（能校验占位图标记，也能直接拿到字节存成 data URL）。
 * 每个来源最多等 4 秒，失败抛错交给下一个来源。 */
function loadIconSource(source) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let timer = 0;
    let controller = null;

    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };

    const fail = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error('icon-source-failed'));
    };

    const accept = (img) => {
      if (img.naturalWidth < 8 || img.naturalHeight < 8) {
        fail();
        return;
      }
      finish({ img, data: iconDataUrlFrom(img) });
    };

    timer = setTimeout(() => {
      if (controller) controller.abort();
      fail();
    }, LOGO_TIMEOUT);

    if (typeof source === 'string') {
      const img = new Image();
      img.alt = '';
      img.className = 'shortcut-icon';
      img.onload = () => accept(img);
      img.onerror = fail;
      img.src = source;
      return;
    }

    if (typeof AbortController !== 'undefined') controller = new AbortController();

    fetch(source.url, controller ? { signal: controller.signal } : undefined)
      .then(async (res) => {
        if (!res.ok) throw new Error('bad-status');
        // 站点没有可用图标时上游会返回通用占位图，宁可换下一个来源
        if (source.fallbackHeader && res.headers.get(source.fallbackHeader) === 'true') {
          throw new Error('placeholder');
        }

        const blob = await res.blob();
        if (!blob.type.startsWith('image/')) throw new Error('not-an-image');

        const objectUrl = URL.createObjectURL(blob);
        const img = new Image();
        img.alt = '';
        img.className = 'shortcut-icon';
        img.onload = () => {
          URL.revokeObjectURL(objectUrl);
          accept(img);
        };
        img.onerror = () => {
          URL.revokeObjectURL(objectUrl);
          fail();
        };
        img.src = objectUrl;
      })
      .catch(fail);
  });
}

function badgeFor(sc) {
  let host = '';
  try {
    host = new URL(sc.url).hostname;
  } catch (_) { /* 使用名称兜底 */ }

  const label = (sc.name || host || '?').trim();
  const badge = document.createElement('span');
  badge.className = 'shortcut-badge';
  badge.textContent = label.slice(0, 1);

  const hue = [...(host || label)].reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) % 360, 0);
  badge.style.background = `hsl(${hue} 48% 42%)`;
  return badge;
}

/* 按来源列表逐个尝试，全部失败才显示首字母色块。
 * 命中本地缓存（含字节）时直接出图；默认首次解析时先用字母块占位，
 * 表单里的回显则关掉占位（showBadgeWhileLoading: false），等真实图标出来再显示。 */
function fillIcon(container, sc, options = {}) {
  const showBadgeWhileLoading = options.showBadgeWhileLoading !== false;
  const host = hostOf(sc.url);

  // 手动上传的图标本身就是 data URL，不需要联网
  if (sc.icon) {
    container.replaceChildren(iconElement(sc.icon));
    return;
  }

  const cached = host ? iconCache[host] : null;

  if (cached && cached.data) {
    container.replaceChildren(iconElement(cached.data));
    return;
  }

  // 缓存过的条目空着等图标，避免闪字母；首次解析按调用方要求决定是否用字母占位
  if (showBadgeWhileLoading && !cached) container.replaceChildren(badgeFor(sc));

  let sources = iconSources(sc);
  // 上次可用的来源排到最前，避免每次都先试几个取不到缓存的来源
  if (cached && cached.src) {
    sources = [cached.src].concat(sources.filter((src) => sourceUrl(src) !== cached.src));
  }

  (async () => {
    for (const source of sources) {
      let result;
      try {
        result = await loadIconSource(source);
      } catch (_) {
        continue;
      }

      container.replaceChildren(result.img);
      rememberIcon(host, { src: sourceUrl(source) });
      if (result.data) rememberIcon(host, { data: result.data });
      return;
    }

    // 所有来源都失败：此时才退回首字母色块
    container.replaceChildren(badgeFor(sc));
  })();
}

function buildTile(sc) {
  const link = document.createElement('a');
  link.className = 'shortcut';
  link.href = sc.url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.title = sc.name;
  link.dataset.shortcutId = sc.id;
  link.draggable = false;

  const slot = document.createElement('span');
  slot.className = 'shortcut-icon-slot';
  fillIcon(slot, sc);

  const label = document.createElement('span');
  label.className = 'shortcut-label';
  label.textContent = sc.name;

  // 长按 400ms 后可以拖动，交换两个磁贴的位置
  link.addEventListener('pointerdown', (event) => beginShortcutPress(link, event));
  link.addEventListener('dragstart', (event) => event.preventDefault());

  // 右键呼出「编辑 / 删除」菜单；鼠标右键不抢焦点，键盘菜单键才聚焦
  link.addEventListener('contextmenu', (event) => {
    if ((shortcutDrag && shortcutDrag.dragging) || suppressShortcutClick) {
      event.preventDefault();
      return;
    }
    event.preventDefault();
    const box = link.getBoundingClientRect();
    const x = event.clientX || box.left + box.width / 2;
    const y = event.clientY || box.top + box.height / 2;
    openTileMenu(sc, x, y, event.button !== 2);
  });

  link.append(slot, label);
  return link;
}

function buildAddTile() {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'shortcut add';
  btn.setAttribute('aria-label', '添加快捷入口');
  btn.innerHTML =
    '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 6 V18 M6 12 H18" /></svg>';
  btn.addEventListener('click', openManager);
  // 「＋」磁贴的右键与左键同义：直接进入新建面板，不弹自己那套菜单
  btn.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    closeMenu();
    closeTileMenu();
    openManager();
  });
  return btn;
}

function renderShortcuts() {
  shortcutsEl.replaceChildren();
  for (const sc of shortcuts) shortcutsEl.append(buildTile(sc));
  shortcutsEl.append(buildAddTile());
  syncShortcutsLayout();
}

/* ---------- 快捷入口折叠 / 展开 ---------- */

const SHORTCUTS_ANIM_MS = 240;

let shortcutsExpanded = false;
let shortcutsHeightTimer = 0;
let shortcutsResizeTimer = 0;
let shortcutsAnimating = false;

// 列数由 CSS 变量提供：大屏 8 列，窄屏 6 列；收起状态固定为 2 行
function shortcutsColumns() {
  const raw = getComputedStyle(shortcutsEl).getPropertyValue('--shortcut-columns').trim();
  const cols = parseInt(raw, 10);
  return Number.isFinite(cols) && cols > 0 ? cols : 6;
}

function shortcutsVisibleLimit() {
  return shortcutsColumns() * 2;
}

function setShortcutsFolded(folded) {
  const limit = shortcutsVisibleLimit();
  [...shortcutsEl.children].forEach((item, index) => {
    item.classList.toggle('is-folded', folded && index >= limit);
  });
}

function anyShortcutFolded() {
  return shortcutsEl.querySelector('.shortcut.is-folded') !== null;
}

function syncShortcutsLayout(animate = false) {
  const total = shortcutsEl.children.length;
  const limit = shortcutsVisibleLimit();
  const canExpand = total > limit;
  if (!canExpand) shortcutsExpanded = false;

  // 不足 5 个图标（含末尾「＋」）时整组居中，否则一律左对齐
  shortcutsEl.classList.toggle('is-sparse', total < 5);

  shortcutsToggle.hidden = !canExpand;
  shortcutsToggle.classList.toggle('is-expanded', shortcutsExpanded);
  shortcutsToggle.setAttribute('aria-expanded', String(shortcutsExpanded));
  shortcutsToggle.setAttribute(
    'aria-label',
    shortcutsExpanded ? '收起快捷入口' : '展示全部快捷入口'
  );

  const collapsed = !shortcutsExpanded && canExpand;

  // 内容增减 / 窗口尺寸变化时直接落到最终状态，不播高度动画
  if (!animate || !canExpand) {
    clearTimeout(shortcutsHeightTimer);
    shortcutsAnimating = false;
    shortcutsEl.style.height = '';
    shortcutsEl.style.overflow = '';
    setShortcutsFolded(collapsed);
    return;
  }

  if (shortcutsAnimating) return;
  if (anyShortcutFolded() === collapsed) return;

  shortcutsAnimating = true;
  const start = shortcutsEl.getBoundingClientRect().height;
  shortcutsEl.style.overflow = 'hidden';

  if (collapsed) {
    // 先量出 2 行的高度，但暂时不隐藏后面几行，让它们随高度一起被裁掉
    setShortcutsFolded(true);
    const end = shortcutsEl.getBoundingClientRect().height;
    setShortcutsFolded(false);

    shortcutsEl.style.height = `${start}px`;
    void shortcutsEl.offsetHeight;
    shortcutsEl.style.height = `${end}px`;

    shortcutsHeightTimer = window.setTimeout(() => {
      setShortcutsFolded(true);
      shortcutsEl.style.height = '';
      shortcutsEl.style.overflow = '';
      shortcutsAnimating = false;
    }, SHORTCUTS_ANIM_MS);
  } else {
    // 展开：先让所有磁贴参与布局，再从 2 行高度长出来
    setShortcutsFolded(false);
    const end = shortcutsEl.getBoundingClientRect().height;

    shortcutsEl.style.height = `${start}px`;
    void shortcutsEl.offsetHeight;
    shortcutsEl.style.height = `${end}px`;

    shortcutsHeightTimer = window.setTimeout(() => {
      shortcutsEl.style.height = '';
      shortcutsEl.style.overflow = '';
      shortcutsAnimating = false;
    }, SHORTCUTS_ANIM_MS);
  }
}

shortcutsToggle.addEventListener('click', () => {
  if (shortcutsAnimating) return;
  if (shortcutsEl.children.length <= shortcutsVisibleLimit()) return;

  shortcutsExpanded = !shortcutsExpanded;
  syncShortcutsLayout(true);
});

// 跨过 720px 断点时列数会从 8 变 6，收起阈值要跟着重算
window.addEventListener('resize', () => {
  clearTimeout(shortcutsResizeTimer);
  shortcutsResizeTimer = window.setTimeout(() => syncShortcutsLayout(), 150);
});

/* ---------- 长按拖动排序 ---------- */

const LONG_PRESS_MS = 400;
const DRAG_CANCEL_PX = 8;

let shortcutDrag = null;
let suppressShortcutClick = false;
let suppressShortcutClickTimer = 0;

function beginShortcutPress(link, event) {
  if (event.button !== 0 || event.isPrimary === false) return;
  if (shortcutDrag || !link.dataset.shortcutId) return;

  const state = {
    link,
    id: link.dataset.shortcutId,
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    timer: 0,
    dragging: false,
    ghost: null,
  };

  shortcutDrag = state;
  state.timer = window.setTimeout(() => startShortcutDrag(state), LONG_PRESS_MS);

  window.addEventListener('pointermove', onShortcutDragMove, { passive: false });
  window.addEventListener('pointerup', onShortcutDragEnd);
  window.addEventListener('pointercancel', onShortcutDragCancel);
  window.addEventListener('blur', onShortcutDragCancel);
}

function removeShortcutDragListeners() {
  window.removeEventListener('pointermove', onShortcutDragMove);
  window.removeEventListener('pointerup', onShortcutDragEnd);
  window.removeEventListener('pointercancel', onShortcutDragCancel);
  window.removeEventListener('blur', onShortcutDragCancel);
}

function clearShortcutPress(state) {
  if (!state) return;
  if (state.timer) {
    clearTimeout(state.timer);
    state.timer = 0;
  }
  removeShortcutDragListeners();
  if (shortcutDrag === state) shortcutDrag = null;
}

function clearShortcutDrag(state) {
  if (!state) return;
  if (state.timer) {
    clearTimeout(state.timer);
    state.timer = 0;
  }
  if (state.ghost) {
    state.ghost.remove();
    state.ghost = null;
  }
  state.link.classList.remove('is-drag-source');
  document.body.classList.remove('is-shortcut-dragging');
  removeShortcutDragListeners();
  if (shortcutDrag === state) shortcutDrag = null;
}

function suppressClickSoon() {
  suppressShortcutClick = true;
  clearTimeout(suppressShortcutClickTimer);
  suppressShortcutClickTimer = window.setTimeout(() => {
    suppressShortcutClick = false;
  }, 350);
}

function startShortcutDrag(state) {
  if (shortcutDrag !== state || state.dragging) return;
  state.timer = 0;
  state.dragging = true;

  closeMenu();
  closeTileMenu();

  const link = state.link;
  link.classList.add('is-drag-source');

  const ghost = link.cloneNode(true);
  ghost.classList.remove('is-drag-source');
  ghost.classList.add('shortcut-drag-ghost');
  ghost.removeAttribute('href');
  ghost.setAttribute('aria-hidden', 'true');
  ghost.tabIndex = -1;
  const ghostLabel = ghost.querySelector('.shortcut-label');
  if (ghostLabel) ghostLabel.remove();

  ghost.style.width = `${link.offsetWidth}px`;
  ghost.style.height = `${link.offsetHeight}px`;

  document.body.append(ghost);
  state.ghost = ghost;
  document.body.classList.add('is-shortcut-dragging');

  moveShortcutGhost(state, state.startX, state.startY);
}

function moveShortcutGhost(state, x, y) {
  if (!state.ghost) return;
  state.ghost.style.left = `${x}px`;
  state.ghost.style.top = `${y}px`;
}

function animateShortcutReorder(beforeRects) {
  const tiles = [...shortcutsEl.querySelectorAll('.shortcut:not(.add)')];

  for (const tile of tiles) {
    const before = beforeRects.get(tile);
    if (!before) continue;

    const after = tile.getBoundingClientRect();
    const dx = before.left - after.left;
    const dy = before.top - after.top;
    if (!dx && !dy) continue;

    tile.style.transition = 'none';
    tile.style.transform = `translate(${dx}px, ${dy}px)`;
    void tile.offsetWidth;
    tile.style.transition = '';
    tile.style.transform = '';
  }
}

function previewShortcutReorder(state, x, y) {
  const under = document.elementFromPoint(x, y);
  const target = under ? under.closest('.shortcut') : null;
  if (
    !target ||
    target === state.link ||
    target.classList.contains('add') ||
    target.classList.contains('shortcut-drag-ghost')
  ) {
    return;
  }

  const rect = target.getBoundingClientRect();
  const insertBefore = x < rect.left + rect.width / 2;
  const reference = insertBefore ? target : target.nextElementSibling;

  if (reference === state.link) return;
  if (insertBefore && state.link.nextElementSibling === target) return;
  if (!insertBefore && target.nextElementSibling === state.link) return;

  const beforeRects = new Map(
    [...shortcutsEl.querySelectorAll('.shortcut:not(.add)')].map((tile) => [
      tile,
      tile.getBoundingClientRect(),
    ])
  );

  shortcutsEl.insertBefore(state.link, reference);
  animateShortcutReorder(beforeRects);
}

function onShortcutDragMove(event) {
  const state = shortcutDrag;
  if (!state || event.pointerId !== state.pointerId) return;

  if (!state.dragging) {
    const dx = event.clientX - state.startX;
    const dy = event.clientY - state.startY;
    if (dx * dx + dy * dy > DRAG_CANCEL_PX * DRAG_CANCEL_PX) {
      clearShortcutPress(state);
    }
    return;
  }

  event.preventDefault();
  moveShortcutGhost(state, event.clientX, event.clientY);
  previewShortcutReorder(state, event.clientX, event.clientY);
}

function finishShortcutDrag(state) {
  clearShortcutDrag(state);

  // 以当前 DOM 顺序为准写回 shortcuts 数组；这里不重渲染，避免图标闪烁
  const ordered = [...shortcutsEl.querySelectorAll('.shortcut:not(.add)')]
    .map((tile) => shortcuts.find((sc) => sc.id === tile.dataset.shortcutId))
    .filter(Boolean);

  if (ordered.length === shortcuts.length) {
    shortcuts.splice(0, shortcuts.length, ...ordered);
    saveShortcuts();
  }

  suppressClickSoon();
}

function onShortcutDragEnd(event) {
  const state = shortcutDrag;
  if (!state || event.pointerId !== state.pointerId) return;

  if (!state.dragging) {
    clearShortcutPress(state);
    return;
  }

  previewShortcutReorder(state, event.clientX, event.clientY);
  finishShortcutDrag(state);
}

function onShortcutDragCancel(event) {
  const state = shortcutDrag;
  if (!state) return;
  if (event && typeof event.pointerId === 'number' && event.pointerId !== state.pointerId) {
    return;
  }

  const wasDragging = state.dragging;
  clearShortcutDrag(state);

  // 取消时 DOM 可能已经被实时重排过，按原数组顺序重建
  if (wasDragging) {
    renderShortcuts();
    suppressClickSoon();
  }
}

// 拖动结束后会紧跟一次 click；只拦截落在磁贴上的那次，避免误开网页
document.addEventListener(
  'click',
  (event) => {
    if (!suppressShortcutClick) return;
    clearTimeout(suppressShortcutClickTimer);
    suppressShortcutClick = false;

    if (event.target instanceof Element && event.target.closest('.shortcut')) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  },
  true
);

/* ---------- 磁贴右键菜单 ---------- */

function openTileMenu(sc, x, y, focusFirst = true) {
  menuShortcut = sc;
  const wasOpen = !tileMenu.hidden;
  tileMenu.hidden = false;
  if (!wasOpen) tileMenu.classList.remove('is-open');

  // offsetWidth/Height 不受 transform 影响，可以直接量出未缩放尺寸
  tileMenu.style.left = '0px';
  tileMenu.style.top = '0px';
  const width = tileMenu.offsetWidth;
  const height = tileMenu.offsetHeight;

  const pad = 8;
  const left = Math.max(pad, Math.min(x, window.innerWidth - width - pad));
  const top = Math.max(pad, Math.min(y, window.innerHeight - height - pad));
  tileMenu.style.left = `${left}px`;
  tileMenu.style.top = `${top}px`;

  // 以光标所在那一点为原点向外放大，看起来像从光标长出来
  const originX = Math.max(0, Math.min(width, x - left));
  const originY = Math.max(0, Math.min(height, y - top));
  tileMenu.style.transformOrigin = `${Math.round(originX)}px ${Math.round(originY)}px`;

  // 关闭状态下先提交初始位置，再进入；已经开着时只移到新位置，不重播动画
  if (!wasOpen) {
    void tileMenu.offsetWidth;
    tileMenu.classList.add('is-open');
  }

  // 鼠标右键只定位、不聚焦；键盘菜单键（button 0）才把焦点交给第一项
  if (focusFirst) {
    const first = tileMenu.querySelector('.tile-menu-item');
    if (first) first.focus({ preventScroll: true });
  }
}

function closeTileMenu() {
  if (tileMenu.hidden) return;
  tileMenu.classList.remove('is-open');
  tileMenu.hidden = true;
  menuShortcut = null;
}

function editShortcut(sc) {
  resetForm();
  if (!manager.open) manager.showModal();
  startEdit(sc);
}

/* 扩展里用 chrome.tabs.create，避免 window.open 被当成弹窗拦掉；普通页面回退 window.open */
function openInNewTab(url) {
  if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.create) {
    try {
      chrome.tabs.create({ url });
      return;
    } catch (_) { /* 回退到 window.open */ }
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

tileMenu.addEventListener('click', (event) => {
  const item = event.target.closest('.tile-menu-item');
  if (!item || !menuShortcut) return;

  const sc = menuShortcut;
  const action = item.dataset.action;
  closeTileMenu();

  if (action === 'open') openInNewTab(sc.url);
  else if (action === 'edit') editShortcut(sc);
  else if (action === 'delete') askDeleteShortcut(sc);
});

document.addEventListener('click', (event) => {
  if (tileMenu.hidden || tileMenu.contains(event.target)) return;
  closeTileMenu();
});

document.addEventListener('contextmenu', (event) => {
  // 磁贴上已经 preventDefault，其它位置右键则关掉菜单，让浏览器原生菜单接管
  if (event.defaultPrevented || tileMenu.contains(event.target)) return;
  closeTileMenu();
});

window.addEventListener('resize', closeTileMenu);
window.addEventListener('scroll', closeTileMenu, true);

/* ---------- 新增 / 编辑面板 ---------- */

function openManager() {
  resetForm();
  if (!manager.open) manager.showModal();
  // 打开后聚焦第一个输入项：这是弹窗里唯一值得先做的事
  scUrl.focus({ preventScroll: true });
}

function resetForm() {
  clearTimeout(managerResetTimer);
  editingId = null;
  nameAutoFilled = false;
  currentIcon = '';
  clearTimeout(previewTimer);
  managerForm.reset();
  preview.hidden = true;
  formTitle.textContent = '添加快捷入口';
  saveBtn.textContent = '添加';
  cancelEdit.hidden = true;
  formError.textContent = '';
  syncIconControls();
}

function startEdit(sc) {
  editingId = sc.id;
  nameAutoFilled = false;
  currentIcon = sc.icon || '';
  scName.value = sc.name;
  scUrl.value = sc.url;
  formTitle.textContent = '编辑快捷入口';
  saveBtn.textContent = '保存';
  cancelEdit.hidden = false;
  formError.textContent = '';
  updatePreview();
  scName.focus();
}

function removeShortcut(sc) {
  shortcuts = shortcuts.filter((item) => item.id !== sc.id);
  saveShortcuts();
  renderShortcuts();
  if (editingId === sc.id) resetForm();
}

/* 自绘删除确认弹窗，替代浏览器原生 confirm */
function askDeleteShortcut(sc) {
  pendingDelete = sc;
  confirmName.textContent = sc.name;
  if (!confirmDialog.open) confirmDialog.showModal();
  // 默认焦点放在「取消」，避免回车误删
  confirmCancel.focus({ preventScroll: true });
}

confirmCancel.addEventListener('click', () => confirmDialog.close());

confirmOk.addEventListener('click', () => {
  const sc = pendingDelete;
  pendingDelete = null;
  confirmDialog.close();
  if (sc) removeShortcut(sc);
});

confirmDialog.addEventListener('close', () => { pendingDelete = null; });

/* 点击遮罩关闭：只在 dialog 自身被按下时判断坐标是否在面板外。
 * 用 pointerdown 而不是 click——从面板内拖选文字到面板外松手时，
 * click 的 target 可能仍是 dialog，会把弹窗误关。 */
function closeOnBackdrop(event, dialog) {
  if (event.button !== 0 || event.target !== dialog) return;
  const box = dialog.getBoundingClientRect();
  const inside =
    event.clientX >= box.left && event.clientX <= box.right &&
    event.clientY >= box.top && event.clientY <= box.bottom;
  if (!inside) dialog.close();
}

confirmDialog.addEventListener('pointerdown', (event) => closeOnBackdrop(event, confirmDialog));

managerForm.addEventListener('submit', (event) => {
  event.preventDefault();

  const url = normalizeUrl(scUrl.value);

  if (!url) {
    formError.textContent = '请输入有效的网址，例如 github.com。';
    scUrl.focus();
    return;
  }

  // 名称为空时用域名兜底，保证任何网址都能保存
  const name = (scName.value.trim() || deriveName(url)).slice(0, 24);
  const icon = currentIcon;

  if (editingId) {
    const target = shortcuts.find((item) => item.id === editingId);
    if (target) Object.assign(target, { name, url, icon });
  } else {
    shortcuts.push({ id: makeId(), name, url, icon });
  }

  saveShortcuts();
  renderShortcuts();
  // 保存后直接收起面板，编辑/删除都从磁贴右键进入
  manager.close();
});

managerClose.addEventListener('click', () => manager.close());
// 取消编辑直接收起面板，不要在编辑态和新增态之间来回切换
cancelEdit.addEventListener('click', () => manager.close());

/* close 在退场动画刚开始时就触发。立刻 resetForm 会让面板一边淡出、
 * 一边把标题和按钮“跳”成新增态，所以等退场结束（160ms + 余量）再清空；
 * 若这段时间内又打开了面板，resetForm() 会取消这个定时器。 */
manager.addEventListener('close', () => {
  clearTimeout(managerResetTimer);
  managerResetTimer = setTimeout(resetForm, 200);
});

/* 网址变化时更新识别结果；手动改过名称后不再覆盖 */
scUrl.addEventListener('input', schedulePreview);
scName.addEventListener('input', () => { nameAutoFilled = false; });

/* 上传图标：最长边不超过 64px 的 data URL，避免大图撑爆 localStorage。
 * 规则：图片格式、≤8MB、源图 ≥16×16；不放大、保持比例居中、保留透明。 */
function fileToIconDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('not-image'));
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      reject(new Error('too-large'));
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      const srcW = img.naturalWidth;
      const srcH = img.naturalHeight;

      if (!srcW || !srcH) {
        reject(new Error('no-size'));
        return;
      }
      if (srcW < 16 || srcH < 16) {
        reject(new Error('too-small'));
        return;
      }

      const size = 64;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');

      // 不放大，只缩小；保持比例居中，四周留透明
      const scale = Math.min(1, size / srcW, size / srcH);
      const w = Math.round(srcW * scale);
      const h = Math.round(srcH * scale);
      ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);

      resolve(canvas.toDataURL('image/webp', 0.9));
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('decode-failed'));
    };

    img.src = objectUrl;
  });
}

iconUpload.addEventListener('click', () => iconFile.click());

iconFile.addEventListener('change', async () => {
  const file = iconFile.files && iconFile.files[0];
  iconFile.value = '';
  if (!file) return;

  try {
    currentIcon = await fileToIconDataUrl(file);
    formError.textContent = '';
    updatePreview();
  } catch (error) {
    const messages = {
      'too-large': '图片太大了，请选择 8MB 以内的图片。',
      'too-small': '图片太小了，请使用至少 16×16 的图片。',
      'no-size': '这张图片没有明确尺寸（常见于部分 SVG），请换一张或导出为 PNG。',
      'not-image': '请选择图片文件。',
      'decode-failed': '这张图片读取失败，换一张试试。',
    };
    formError.textContent = messages[error.message] || '这张图片读取失败，换一张试试。';
  }
});

iconReset.addEventListener('click', () => {
  const url = normalizeUrl(scUrl.value);
  currentIcon = url ? autoIconFor(url) : '';
  formError.textContent = '';
  updatePreview();
});

/* 点击遮罩关闭 */
manager.addEventListener('pointerdown', (event) => closeOnBackdrop(event, manager));

/* ---------- 快捷键 ---------- */

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !tileMenu.hidden) {
    event.preventDefault();
    closeTileMenu();
    return;
  }

  if (manager.open || confirmDialog.open) return;

  if (event.key === 'Escape') {
    if (!engineMenu.hidden) {
      closeMenu();
    } else if (document.activeElement === input) {
      if (input.value) input.value = '';
      else input.blur();
    }
    return;
  }

  if (event.key === '/' && document.activeElement !== input) {
    event.preventDefault();
    input.focus();
  }
});

/* ---------- 初始化 ---------- */

buildMenu();
syncEngine();
renderShortcuts();

// 旧版图标缓存键已不再使用，顺手清掉
try {
  localStorage.removeItem('sharktab.icons.v1');
} catch (_) { /* 忽略清理失败 */ }

// 关闭/切走页面时把还没落盘的图标缓存写完，避免刚解析出的图标下次又得重新加载
window.addEventListener('pagehide', () => {
  if (!iconCacheTimer) return;
  clearTimeout(iconCacheTimer);
  iconCacheTimer = 0;
  saveIconCache();
});

// 刻意不自动聚焦：新标签页打开时焦点留在地址栏，导航交给浏览器原生地址栏。
