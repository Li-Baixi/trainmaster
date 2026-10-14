// 日期与文本格式化工具

/** 本地时区的 YYYY-MM-DD */
export function dateISO(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** HH:mm */
export function timeHM(d = new Date()) {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** 文件名友好的时间戳：YYYY-MM-DD_HHMM */
export function fileStamp(d = new Date()) {
  return `${dateISO(d)}_${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
}

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

/** 周几的中文，如「三」 */
export function weekdayCN(d = new Date()) {
  return WEEKDAYS[d.getDay()];
}

/** 「2026-10-14 周三」 */
export function prettyDate(iso) {
  const d = new Date(iso + 'T12:00:00');
  return `${iso} 周${weekdayCN(d)}`;
}

/** ISO 日期往前推 n 天的 ISO */
export function daysAgoISO(n, base = new Date()) {
  const d = new Date(base);
  d.setDate(d.getDate() - n);
  return dateISO(d);
}

/** 中文按 1 字符≈1 token 的保守估算 */
export function estimateTokens(text) {
  return (text || '').length;
}

/** 截断保留头部（档案等信息头重脚轻） */
export function truncateHead(text, max) {
  if (!text || text.length <= max) return text || '';
  return text.slice(0, max - 20) + '\n…（已截断）';
}

/** 截断保留头尾（计划等结构首尾都要） */
export function truncateMiddle(text, max) {
  if (!text || text.length <= max) return text || '';
  const head = Math.floor((max - 30) * 0.7);
  const tail = max - 30 - head;
  return text.slice(0, head) + '\n…（中间部分已截断）\n' + text.slice(-tail);
}

/** 防抖 */
export function debounce(fn, ms = 300) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

/** 转义 HTML 文本（用于拼接小段 HTML） */
export function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
