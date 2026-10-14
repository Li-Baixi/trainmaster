// markdown 渲染统一入口：marked 解析 + DOMPurify 消毒

/** 渲染 markdown 为安全 HTML 字符串 */
export function renderMarkdown(md) {
  if (!md) return '';
  const html = window.marked.parse(md);
  return window.DOMPurify.sanitize(html, {
    FORBID_TAGS: ['style', 'form', 'input', 'iframe'],
    FORBID_ATTR: ['onerror', 'onclick', 'onload'],
  });
}

/** 渲染到某个容器 */
export function renderMarkdownInto(el, md) {
  if (el) el.innerHTML = renderMarkdown(md);
}
