// 「今天」页：今日训练 + 饮食汇总 + 拍照记一餐 + 继续对话

import { el } from '../components.js';
import { renderMarkdownInto } from '../markdown.js';
import { openMealCapture } from '../mealcapture.js';
import { getCurrentPlan, extractTodaySection, extractKcalGoal } from '../../services/plans.js';
import { dayTotals } from '../../services/meals.js';
import { getRecentMessages } from '../../services/chat.js';
import { navigate } from '../../router.js';
import { dateISO, weekdayCN } from '../../utils/format.js';
import { settings } from '../../settings.js';

export const todayPage = {
  async render(app) {
    app.innerHTML = ''; // 支持事件触发的手动重渲染
    if (this._onMeal) window.removeEventListener('meal-recorded', this._onMeal); // 防累积
    const iso = dateISO();
    const greeting = (() => {
      const h = new Date().getHours();
      if (h < 6) return '夜深了';
      if (h < 11) return '早上好';
      if (h < 14) return '中午好';
      if (h < 18) return '下午好';
      return '晚上好';
    })();
    const nickname = (await settings.get('nickname')) || '';

    const planMd = await getCurrentPlan();
    const todaySection = extractTodaySection(planMd);
    const kcalGoal = extractKcalGoal(planMd);
    const totals = await dayTotals(iso);
    const recentMsgs = await getRecentMessages(1);
    const lastMsg = recentMsgs.length ? recentMsgs[recentMsgs.length - 1] : null;

    // 训练卡
    const trainBody = todaySection
      ? el('div', { class: 'md' })
      : el('p', { class: 'empty-hint' }, planMd ? '今天没有安排训练（休息日），好好恢复' : '还没有计划');
    if (todaySection) renderMarkdownInto(trainBody, todaySection);

    // 饮食卡
    const meterFill = kcalGoal ? Math.min(100, Math.round(totals.kcal / kcalGoal * 100)) : 0;
    const dietCard = el('div', { class: 'card' },
      el('h2', { class: 'card-title' }, '🍽️ 今日饮食',
        kcalGoal ? el('span', { class: 'hint' }, `目标约 ${kcalGoal} kcal`) : el('span', { class: 'hint' }, '')),
      el('div', { class: 'stat-grid' },
        statEl(totals.kcal, '热量 kcal', 'kcal'),
        statEl(totals.protein, '蛋白 g'),
        statEl(totals.carbs, '碳水 g'),
        statEl(totals.fat, '脂肪 g')),
      kcalGoal ? el('div', { class: 'meter' }, el('div', { class: `meter-fill${totals.kcal > kcalGoal ? ' over' : ''}`, style: `width:${meterFill}%` })) : null,
      el('button', { class: 'btn btn-outline btn-sm', style: 'margin-top:10px', onclick: () => navigate('records') }, '查看记录'));

    // 最近对话卡
    const chatCard = lastMsg
      ? el('div', { class: 'card', onclick: () => navigate('chat'), style: 'cursor:pointer' },
          el('h2', { class: 'card-title' }, '💬 继续和教练聊'),
          el('p', { style: 'margin:0;color:var(--text-secondary);font-size:14px;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical' },
            (lastMsg.role === 'user' ? '我：' : '教练：') + (lastMsg.content || '').replace(/[#*`>\n]/g, ' ').slice(0, 80)))
      : el('div', { class: 'card', onclick: () => navigate('chat'), style: 'cursor:pointer' },
          el('h2', { class: 'card-title' }, '💬 和教练聊聊'),
          el('p', { style: 'margin:0;color:var(--text-tertiary);font-size:14px' }, '不会用器械、吃多了怎么补、随时问'));

    app.append(
      el('p', { class: 'hero-date' }, `${iso} 周${weekdayCN()}`),
      el('h1', { class: 'page-title' }, `${greeting}${nickname ? '，' + nickname : ''} 💪`),
      el('button', { class: 'btn btn-primary btn-block btn-lg', style: 'margin-bottom:14px', onclick: () => openMealCapture() }, '📷 拍照记一餐'),
      el('div', { class: 'card' },
        el('h2', { class: 'card-title' }, `🏋️ 今日训练（周${weekdayCN()}）`,
          el('span', { class: 'hint' }, el('a', { href: '#/plans', class: 'link' }, '完整计划'))),
        trainBody),
      dietCard,
      chatCard);

    function statEl(v, label, extraClass = '') {
      return el('div', { class: `stat ${extraClass}` }, el('b', {}, String(v || 0)), el('span', {}, label));
    }

    // 记录变化时刷新
    this._onMeal = () => todayPage.render(app);
    window.addEventListener('meal-recorded', this._onMeal);
  },
  destroy() {
    if (this._onMeal) window.removeEventListener('meal-recorded', this._onMeal);
  },
};
