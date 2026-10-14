// 通用 UI 组件：toast / 模态框 / 确认框 / DOM 助手

import { renderMarkdownInto } from './markdown.js';

/** 快捷 DOM 构造：el('div', {class: 'x', onclick: fn}, child1, 'text') */
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null) continue;
    if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (k === 'class') node.className = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k === 'html') node.innerHTML = v;
    else node.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c === undefined || c === null) continue;
    node.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return node;
}

/** toast 提示 */
export function toast(message, type = '') {
  const box = document.getElementById('toast-container');
  if (!box) return;
  const t = el('div', { class: `toast ${type}` }, message);
  box.appendChild(t);
  setTimeout(() => {
    t.style.transition = 'opacity .3s';
    t.style.opacity = '0';
    setTimeout(() => t.remove(), 350);
  }, type === 'err' ? 4200 : 2400);
}

/**
 * 底部弹层。返回 { close, body }。
 * opts: { title, onclose }
 */
export function showModal({ title = '', onclose } = {}) {
  const root = document.getElementById('modal-root');
  const body = el('div', { class: 'modal-body' });
  const mask = el('div', { class: 'modal-mask' },
    el('div', { class: 'modal', role: 'dialog' },
      el('div', { class: 'modal-header' },
        el('h3', {}, title),
        el('button', { class: 'modal-close', onclick: close }, '✕')),
      body));
  mask.addEventListener('click', (e) => { if (e.target === mask) close(); });
  function close() {
    mask.remove();
    if (onclose) onclose();
  }
  root.appendChild(mask);
  return { close, body };
}

/** 确认框：Promise<boolean> */
export function confirmDialog(message, { danger = false, okText = '确定', cancelText = '取消' } = {}) {
  return new Promise((resolve) => {
    const modal = showModal({ title: '请确认', onclose: () => resolve(false) });
    modal.body.append(
      el('p', { style: 'font-size:15px;margin-top:0' }, message),
      el('div', { class: 'wizard-nav', style: 'margin-top:14px' },
        el('button', { class: 'btn btn-outline', style: 'flex:1', onclick: () => { resolve(false); modal.close(); } }, cancelText),
        el('button', { class: `btn ${danger ? 'btn-danger' : 'btn-primary'}`, style: 'flex:1', onclick: () => { resolve(true); modal.close(); } }, okText)));
  });
}

/** 渲染 markdown 到模态框正文 */
export function markdownModal(title, md) {
  const modal = showModal({ title });
  const wrap = el('div', { class: 'md' });
  renderMarkdownInto(wrap, md);
  modal.body.appendChild(wrap);
  return modal;
}

/** 加载占位 */
export function loadingBlock(text = '加载中…') {
  return el('div', { class: 'loading-block' }, text);
}
