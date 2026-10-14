// 识餐业务：视觉识别 → 解析 mealjson → 确认记录（meals 仓 + 当日 md）

import { tx, reqAsPromise } from '../db.js';
import { settings } from '../settings.js';
import { chatStream } from '../ai/client.js';
import { buildMealSystemPrompt, extractFence } from '../ai/context.js';
import { buildImageUserMessage, makeThumbnail } from '../ai/image.js';
import { appendMealToDaily } from './logs.js';
import { dateISO, timeHM } from '../utils/format.js';

/**
 * 识别一餐。返回 { parsed, raw }；解析失败时 parsed 为 null。
 * @param {{dataUrl: string, note?: string, mealType?: string, signal?: AbortSignal, onDelta?: Function}} opts
 */
export async function recognizeMeal({ dataUrl, note = '', mealType = '', signal, onDelta }) {
  const provider = await settings.getDefaultProvider();
  if (!provider.apiKey) throw new Error('尚未配置 API Key，请到「我的 → 设置」填写。');
  const visionModel = provider.visionModel || provider.chatModel;

  const systemPrompt = await buildMealSystemPrompt();
  const userText = [
    `这是我${mealType || '这一餐'}的照片。`,
    note ? `补充说明：${note}。` : '',
    '请识别所有食物，估算每种分量与营养，结合我的饮食计划给出这一餐怎么吃的建议。',
  ].filter(Boolean).join('');

  const messages = [
    { role: 'system', content: systemPrompt },
    buildImageUserMessage(userText, [dataUrl]),
  ];

  const { content } = await chatStream({ provider, model: visionModel, messages, signal, onDelta });
  const parsed = parseMealJson(content);
  return { parsed, raw: content };
}

/** 宽松解析 ```mealjson 围栏 */
export function parseMealJson(text) {
  const fence = extractFence(text, 'mealjson');
  const candidate = fence || (/(items|totals)/.test(text) ? text : null);
  if (!candidate) return null;
  // 从文本里抠出第一段 JSON 对象
  const start = candidate.indexOf('{');
  if (start < 0) return null;
  let depth = 0, end = -1;
  for (let i = start; i < candidate.length; i++) {
    if (candidate[i] === '{') depth++;
    else if (candidate[i] === '}') {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }
  if (end < 0) return null;
  try {
    const obj = JSON.parse(candidate.slice(start, end + 1));
    if (!Array.isArray(obj.items)) return null;
    return normalizeMeal(obj);
  } catch {
    return null;
  }
}

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

export function normalizeMeal(obj) {
  const items = (obj.items || []).map(it => ({
    name: String(it.name || '食物'),
    grams: toNum(it.grams),
    kcal: toNum(it.kcal),
    protein: toNum(it.protein),
    carbs: toNum(it.carbs),
    fat: toNum(it.fat),
  }));
  const sum = k => items.reduce((a, it) => a + (Number(it[k]) || 0), 0);
  const t = obj.totals || {};
  const totals = {
    kcal: t.kcal ? toNum(t.kcal) : sum('kcal'),
    protein: t.protein ? toNum(t.protein) : sum('protein'),
    carbs: t.carbs ? toNum(t.carbs) : sum('carbs'),
    fat: t.fat ? toNum(t.fat) : sum('fat'),
  };
  return {
    title: String(obj.title || '这一餐'),
    mealType: obj.mealType || '',
    items,
    totals,
    advice: String(obj.advice || ''),
  };
}

/** 用户确认后记录这一餐（meals 仓 + 当日 md + 缩略图） */
export async function confirmMealRecord(meal, dataUrl) {
  const iso = dateISO();
  let thumb = '';
  if (dataUrl) {
    try { thumb = await makeThumbnail(dataUrl); } catch { thumb = dataUrl; }
  }
  const rec = {
    ...meal,
    date: iso,
    time: timeHM(),
    image: thumb,
    createdAt: new Date().toISOString(),
  };
  const id = await tx('meals', 'readwrite', s => s.add(rec));
  try {
    await appendMealToDaily(iso, { ...rec, time: rec.time });
  } catch { /* md 写失败不阻塞记录 */ }
  return id;
}

/** 删除某条餐食记录（md 日志保持追加式不改，删除仅影响仓与汇总） */
export async function deleteMeal(id) {
  await tx('meals', 'readwrite', s => s.delete(id));
}

export async function mealsByDate(iso) {
  const list = await tx('meals', 'readonly', s => reqAsPromise(s.index('by_date').getAll(iso)));
  return list.sort((a, b) => (a.time || '').localeCompare(b.time || ''));
}

/** 有记录的日期集合（记录页打点） */
export async function datesWithRecords() {
  const list = await tx('meals', 'readonly', s => reqAsPromise(s.getAll()));
  const set = new Set(list.map(m => m.date));
  const logs = await import('../vfs.js').then(v => v.vfs.list('logs/'));
  for (const f of logs) {
    const m = f.path.match(/^logs\/(\d{4}-\d{2}-\d{2})\.md$/);
    if (m) set.add(m[1]);
  }
  return set;
}

/** 某日汇总 */
export async function dayTotals(iso) {
  const meals = await mealsByDate(iso);
  const t = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  for (const m of meals) {
    const mt = m.totals || {};
    t.kcal += mt.kcal || 0;
    t.protein += mt.protein || 0;
    t.carbs += mt.carbs || 0;
    t.fat += mt.fat || 0;
  }
  return t;
}
