// 日志业务：当日 md 的追加写入（对话段 / 餐食段）
// md 是导出真源，messages/meals 仓是 UI 真源，双写。

import { vfs } from '../vfs.js';
import { dateISO, timeHM, weekdayCN } from '../utils/format.js';

function dayHeader(iso) {
  const d = new Date(iso + 'T12:00:00');
  return `# ${iso} 周${weekdayCN(d)} 日志\n`;
}

/** 追加一段对话（用户 + 教练回复） */
export async function appendChatToDaily(iso, { time, userText, assistantText, hasImages = false }) {
  const t = time || timeHM();
  const userLine = hasImages && !userText ? '（拍照提问）' : userText;
  let section = `\n## ${t} 对话\n### 我\n${userLine || '（空）'}\n\n### 教练\n${assistantText || '（无回复）'}\n`;
  await vfs.appendSection(`logs/${iso}.md`, section.trim(), dayHeader(iso));
}

/** 追加一段餐食记录（含 meal 围栏 JSON，导入时据此重建 meals 仓） */
export async function appendMealToDaily(iso, meal) {
  const t = meal.time || timeHM();
  const itemsTable = ['| 食物 | 估重(g) | 热量(kcal) | 蛋白(g) | 碳水(g) | 脂肪(g) |', '|---|---|---|---|---|---|'];
  for (const it of meal.items || []) {
    itemsTable.push(`| ${it.name} | ${it.grams ?? '?'} | ${it.kcal ?? '?'} | ${it.protein ?? '?'} | ${it.carbs ?? '?'} | ${it.fat ?? '?'} |`);
  }
  const totals = meal.totals || {};
  const json = {
    title: meal.title,
    mealType: meal.mealType,
    items: meal.items,
    totals,
    advice: meal.advice,
    recordedAt: meal.createdAt,
  };
  const section = [
    `\n## ${t} ${meal.mealType || '餐'}：${meal.title || ''}`,
    itemsTable.join('\n'),
    `共计约 **${totals.kcal ?? '?'} kcal**（蛋白 ${totals.protein ?? '?'}g / 碳水 ${totals.carbs ?? '?'}g / 脂肪 ${totals.fat ?? '?'}g）`,
    meal.advice ? `> 建议：${meal.advice}` : '',
    '```meal\n' + JSON.stringify(json, null, 2) + '\n```',
  ].filter(Boolean).join('\n');
  await vfs.appendSection(`logs/${iso}.md`, section, dayHeader(iso));
}

/** 读取某天的日志 md */
export async function readDaily(iso) {
  return vfs.read(`logs/${iso}.md`);
}
