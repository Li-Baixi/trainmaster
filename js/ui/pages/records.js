// 「记录」页：日期选择 + 当日餐食/汇总 + 日志查看 + 导出/导入

import { el, toast, confirmDialog, markdownModal } from '../components.js';
import { openMealCapture } from '../mealcapture.js';
import { mealsByDate, dayTotals, deleteMeal, datesWithRecords } from '../../services/meals.js';
import { readDaily } from '../../services/logs.js';
import { exportAll, exportDay, importFromFiles } from '../../services/backup.js';
import { dateISO, daysAgoISO, weekdayCN, prettyDate } from '../../utils/format.js';

export const recordsPage = {
  async render(app) {
    app.innerHTML = '';
    if (this._onMeal) window.removeEventListener('meal-recorded', this._onMeal); // 防累积
    let selected = dateISO();

    app.appendChild(el('h1', { class: 'page-title' }, '📊 记录'));

    const strip = el('div', { class: 'date-strip' });
    const content = el('div', {});

    const recordBtnRow = el('div', { class: 'card', style: 'display:flex;gap:8px' },
      el('button', { class: 'btn btn-primary', style: 'flex:1', onclick: () => openMealCapture() }, '📷 补记一餐'),
      el('button', { class: 'btn btn-outline', style: 'flex:1', onclick: async () => {
        const md = await readDaily(selected);
        if (!md) { toast('该日没有日志', 'err'); return; }
        markdownModal(`${selected} 日志`, md);
      } }, '📖 看当日日志'));

    const dataCard = el('div', { class: 'card' },
      el('h2', { class: 'card-title' }, '💾 数据备份'),
      el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' },
        el('button', { class: 'btn btn-primary', style: 'flex:1', onclick: onExportAll }, '📤 导出全部 md'),
        el('button', { class: 'btn btn-outline', style: 'flex:1', onclick: () => importInput.click() }, '📥 导入恢复'),
        el('button', { class: 'btn btn-outline', style: 'flex:1', onclick: async () => {
          try { await exportDay(selected); } catch (err) { toast(err.message || '导出失败', 'err'); }
        } }, '📤 只导出当天')));

    const importInput = el('input', { type: 'file', accept: '.md', multiple: true, style: 'display:none' });
    importInput.addEventListener('change', async () => {
      const files = importInput.files;
      if (!files || !files.length) return;
      const ok = await confirmDialog(`确定导入 ${files.length} 个 md 文件吗？同名文件会被覆盖（旧内容自动备份）。`);
      if (!ok) { importInput.value = ''; return; }
      try {
        const { imported, mealsRestored } = await importFromFiles(files);
        toast(`导入 ${imported} 个文件，恢复 ${mealsRestored} 条餐食记录 ✅`, 'ok');
        await refresh();
      } catch (err) {
        toast('导入失败：' + (err.message || err), 'err');
      }
      importInput.value = '';
    });

    async function onExportAll() {
      try {
        const r = await exportAll((i, n) => { toast(`正在整理 ${i}/${n}…`); });
        if (r.via === 'share') toast('已调出分享面板，选择「存储到文件」✅', 'ok');
        else if (r.via === 'download') toast(`已下载 ${r.count} 个文件`, 'ok');
      } catch (err) {
        toast(err.message || '导出失败', 'err');
      }
    }

    app.append(strip, recordBtnRow, content, dataCard, importInput);

    async function refresh() {
      // 日期条（最近 14 天，今天在最右）
      const withRecords = await datesWithRecords();
      strip.innerHTML = '';
      for (let i = 13; i >= 0; i--) {
        const iso = daysAgoISO(i);
        const d = new Date(iso + 'T12:00:00');
        const chip = el('button', {
          class: `date-chip${iso === selected ? ' selected' : ''}${withRecords.has(iso) ? ' has-dot' : ''}`,
          onclick: () => { selected = iso; refresh(); },
        },
          el('span', { class: 'dw' }, `周${weekdayCN(d)}`),
          el('span', { class: 'dd' }, String(d.getDate())));
        strip.appendChild(chip);
      }

      // 当日内容
      content.innerHTML = '';
      const totals = await dayTotals(selected);
      const meals = await mealsByDate(selected);

      content.appendChild(el('div', { class: 'card' },
        el('h2', { class: 'card-title' }, `🍽️ ${selected === dateISO() ? '今天' : prettyDate(selected)}`,
          el('span', { class: 'hint' }, `${totals.kcal} kcal · 蛋白${totals.protein}g`)),
        meals.length
          ? meals.map(m => el('div', { class: 'meal-item' },
              m.image
                ? el('img', { class: 'meal-thumb', src: m.image, alt: '' })
                : el('div', { class: 'meal-thumb meal-thumb-empty' }, '🍽️'),
              el('div', { class: 'meal-info' },
                el('b', {}, `${m.time} ${m.mealType || ''} ${m.title || ''}`),
                el('div', { class: 'meal-meta' }, `${m.totals?.kcal ?? '?'} kcal｜蛋白${m.totals?.protein ?? '?'}g｜碳水${m.totals?.carbs ?? '?'}g｜脂肪${m.totals?.fat ?? '?'}g`),
                m.advice ? el('div', { class: 'meal-meta', style: 'color:var(--primary-text)' }, `💡 ${m.advice}`) : null),
              el('button', { class: 'btn btn-sm btn-outline', onclick: async () => {
                const ok = await confirmDialog(`删除「${m.title}」这条记录吗？`, { danger: true, okText: '删除' });
                if (!ok) return;
                await deleteMeal(m.id);
                await refresh();
              } }, '✕')))
          : el('p', { class: 'empty-hint' }, '这一天还没有餐食记录')));

      const statGrid = el('div', { class: 'stat-grid', style: 'margin-top:8px' },
        el('div', { class: 'stat kcal' }, el('b', {}, String(totals.kcal)), el('span', {}, '热量 kcal')),
        el('div', { class: 'stat' }, el('b', {}, String(totals.protein)), el('span', {}, '蛋白 g')),
        el('div', { class: 'stat' }, el('b', {}, String(totals.carbs)), el('span', {}, '碳水 g')),
        el('div', { class: 'stat' }, el('b', {}, String(totals.fat)), el('span', {}, '脂肪 g')));
      content.querySelector('.card').appendChild(statGrid);
    }

    this._onMeal = () => refresh();
    window.addEventListener('meal-recorded', this._onMeal);
    await refresh();
  },
  destroy() {
    if (this._onMeal) window.removeEventListener('meal-recorded', this._onMeal);
  },
};
