/* clock.js
 * 新标签页时间：24 小时制（09:05）+「11月18日 星期三 · 农历十月初十」。
 * 每秒比对一次时间戳，只有分钟真的变了才写 DOM。
 */
(() => {
  const timeEl = document.getElementById('time');
  const dateEl = document.getElementById('date');
  if (!timeEl || !dateEl) return;

  const WEEK = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  const LUNAR_DAY = [
    '初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八', '初九', '初十',
    '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十',
    '廿一', '廿二', '廿三', '廿四', '廿五', '廿六', '廿七', '廿八', '廿九', '三十',
  ];
  const pad = (n) => String(n).padStart(2, '0');

  // ICU 自带的农历：月份已是中文（含「闰X月」），日期是数字，需要再转成「初十 / 廿三」
  let lunarFmt;
  try {
    lunarFmt = new Intl.DateTimeFormat('zh-CN-u-ca-chinese', { month: 'long', day: 'numeric' });
  } catch (_) {
    lunarFmt = null;
  }

  function lunarLabel(date) {
    if (!lunarFmt) return '';
    try {
      const parts = lunarFmt.formatToParts(date);
      const month = parts.find((p) => p.type === 'month');
      const day = parts.find((p) => p.type === 'day');
      if (!month || !day) return '';
      const dayName = LUNAR_DAY[Number(day.value) - 1];
      return dayName ? `农历${month.value}${dayName}` : '';
    } catch (_) {
      return '';
    }
  }

  let lastStamp = '';

  function tick() {
    const now = new Date();
    const stamp = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()} ${now.getHours()}:${now.getMinutes()}`;
    if (stamp === lastStamp) return;
    lastStamp = stamp;

    const lunar = lunarLabel(now);
    timeEl.textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    dateEl.textContent =
      `${now.getMonth() + 1}月${now.getDate()}日 ${WEEK[now.getDay()]}` +
      (lunar ? ` · ${lunar}` : '');
  }

  tick();
  setInterval(tick, 1000);
})();
