// 拍照识餐完整流程：拍照/选图 → 压缩 → 预览 → 流式识别 → 可编辑结果 → 记入今天

import { el, toast, showModal, confirmDialog } from './components.js';
import { compressImage } from '../ai/image.js';
import { recognizeMeal, confirmMealRecord, normalizeMeal } from '../services/meals.js';
import { timeHM } from '../utils/format.js';

function defaultMealType() {
  const h = new Date().getHours();
  if (h < 10) return '早餐';
  if (h < 15) return '午餐';
  if (h < 21) return '晚餐';
  return '加餐';
}

/** 打开识餐流程（入口） */
export function openMealCapture() {
  const input = el('input', { type: 'file', accept: 'image/*', capture: 'environment', style: 'display:none' });
  document.body.appendChild(input);
  input.addEventListener('change', async () => {
    const file = input.files && input.files[0];
    input.remove();
    if (!file) return;
    let compressed;
    try {
      compressed = await compressImage(file);
    } catch {
      toast('图片读取失败，请重拍', 'err');
      return;
    }
    openPreviewPanel(compressed.dataUrl);
  });
  input.click();
}

/** 第二步：预览 + 餐次/备注 → 识别 */
function openPreviewPanel(dataUrl) {
  const modal = showModal({ title: '📷 拍照记一餐', onclose: null });
  const mealType = defaultMealType();
  const typeSeg = el('div', { class: 'seg' });
  for (const t of ['早餐', '午餐', '晚餐', '加餐']) {
    const btn = el('button', { onclick: () => { [...typeSeg.children].forEach(b => b.classList.remove('selected')); btn.classList.add('selected'); typeSeg.dataset.value = t; } }, t);
    if (t === mealType) { btn.classList.add('selected'); typeSeg.dataset.value = t; }
    typeSeg.appendChild(btn);
  }
  const noteInput = el('input', { class: 'input', placeholder: '备注（可空）：如 食堂打的、半份米饭' });
  const recognizeBtn = el('button', { class: 'btn btn-primary btn-block btn-lg' }, '🔍 开始识别');

  modal.body.append(
    el('div', { class: 'img-preview-strip' }, el('img', { src: dataUrl, alt: '餐食照片' })),
    el('div', { class: 'field' }, el('label', {}, '餐次'), typeSeg),
    el('div', { class: 'field' }, el('label', {}, '备注'), noteInput),
    recognizeBtn);

  recognizeBtn.addEventListener('click', async () => {
    recognizeBtn.disabled = true;
    recognizeBtn.textContent = '识别中…';
    const streamBox = el('div', { class: 'recognizing' }, '正在识别…');
    modal.body.appendChild(streamBox);
    let acc = '';
    try {
      const { parsed, raw } = await recognizeMeal({
        dataUrl,
        mealType: typeSeg.dataset.value || mealType,
        note: noteInput.value.trim(),
        onDelta: (_d, full) => {
          acc = full;
          streamBox.textContent = full.slice(-600);
          streamBox.scrollTop = streamBox.scrollHeight;
        },
      });
      streamBox.remove();
      modal.close();
      if (parsed) {
        openResultPanel(dataUrl, parsed);
      } else {
        const retry = await confirmDialog('识别完成但没能解析成结构化数据（可重试，或手动填写）。要重试吗？', { okText: '重试' });
        if (retry) openPreviewPanel(dataUrl);
        else openResultPanel(dataUrl, normalizeMeal({ title: '手动填写', items: [{ name: '' }], totals: {}, advice: raw ? raw.slice(0, 500) : '' }));
      }
    } catch (err) {
      streamBox.remove();
      toast(err.message || '识别失败', 'err');
      recognizeBtn.disabled = false;
      recognizeBtn.textContent = '🔍 重新识别';
    }
  });
}

/** 第三步：结果表格（可编辑）→ 记入今天 */
function openResultPanel(dataUrl, parsed) {
  const modal = showModal({ title: '🍽️ 识别结果（可修改）' });
  const meal = JSON.parse(JSON.stringify(parsed));
  const adviceEl = el('textarea', { class: 'input', rows: '2' }, meal.advice || '');
  const titleEl = el('input', { class: 'input', value: meal.title || '' });

  const table = el('table', { class: 'meal-edit-table' });
  const thead = el('thead', {}, el('tr', {}, ['食物', '克数', 'kcal', '蛋白g', '碳水g', '脂肪g', ''].map(h => el('th', {}, h))));
  const tbody = el('tbody');
  function renderRows() {
    tbody.innerHTML = '';
    meal.items.forEach((it, i) => {
      const mk = (key, w = '44px') => el('input', { value: String(it[key] ?? ''), style: `width:${w};min-width:34px`, onchange: (e) => { it[key] = key === 'name' ? e.target.value : (Number(e.target.value) || 0); recompute(); } });
      const del = el('button', { class: 'btn btn-sm btn-outline', onclick: () => { meal.items.splice(i, 1); renderRows(); recompute(); } }, '✕');
      tbody.appendChild(el('tr', {}, el('td', {}, mk('name', '90px')), el('td', {}, mk('grams')), el('td', {}, mk('kcal')), el('td', {}, mk('protein')), el('td', {}, mk('carbs')), el('td', {}, mk('fat')), el('td', {}, del)));
    });
  }
  const totalsRow = el('p', { style: 'text-align:center;font-size:14px;color:var(--text-secondary);margin:8px 0' });
  function recompute() {
    const sum = k => meal.items.reduce((a, it) => a + (Number(it[k]) || 0), 0);
    meal.totals = { kcal: sum('kcal'), protein: sum('protein'), carbs: sum('carbs'), fat: sum('fat') };
    totalsRow.innerHTML = `共 <b>${meal.totals.kcal}</b> kcal｜蛋白 <b>${meal.totals.protein}</b>g｜碳水 <b>${meal.totals.carbs}</b>g｜脂肪 <b>${meal.totals.fat}</b>g`;
  }
  renderRows();
  recompute();
  table.append(thead, tbody);

  const saveBtn = el('button', { class: 'btn btn-primary btn-block btn-lg' }, '✅ 记入今天');
  modal.body.append(
    el('div', { class: 'field' }, el('label', {}, '这餐名称'), titleEl),
    table,
    el('button', { class: 'btn btn-sm btn-outline', style: 'margin-top:8px', onclick: () => { meal.items.push({ name: '', grams: 0, kcal: 0, protein: 0, carbs: 0, fat: 0 }); renderRows(); } }, '＋ 添加食物'),
    totalsRow,
    el('div', { class: 'field' }, el('label', {}, '教练建议（会记入日志）'), adviceEl),
    saveBtn);

  async function save() {
    meal.title = titleEl.value.trim() || '这一餐';
    meal.advice = adviceEl.value.trim();
    meal.items = meal.items.filter(it => (it.name || '').trim());
    if (!meal.items.length) { toast('至少要有一个食物', 'err'); return; }
    try {
      await confirmMealRecord(meal, dataUrl);
      modal.close();
      toast('已记入今天的记录 ✅', 'ok');
      // 通知页面刷新（记录页/今天页监听）
      window.dispatchEvent(new CustomEvent('meal-recorded'));
    } catch (err) {
      toast('保存失败：' + (err.message || err), 'err');
    }
  }
  saveBtn.addEventListener('click', save);
}
