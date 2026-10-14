// 计划业务：读取 / 确认应用（归档旧版）/ 版本列表 / 恢复

import { vfs } from '../vfs.js';
import { fileStamp, dateISO } from '../utils/format.js';

export async function getCurrentPlan() {
  return vfs.read('plans/current.md');
}

/**
 * 应用新计划：旧版归档 → 写入新版。
 * @returns {archivedAs: string|null}
 */
export async function applyNewPlan(newMd, note = '') {
  const old = await getCurrentPlan();
  let archivedAs = null;
  if (old && old.trim()) {
    archivedAs = `versions/plans/${fileStamp()}.md`;
    await vfs.write(archivedAs, old);
  }
  const header = `<!-- 生效于 ${dateISO()}${note ? `｜${note}` : ''} -->\n`;
  await vfs.write('plans/current.md', header + newMd.trim() + '\n');
  return { archivedAs };
}

/** 计划历史版本列表（新→旧） */
export async function listPlanVersions() {
  const list = await vfs.list('versions/plans/');
  return list.sort((a, b) => a.path > b.path ? -1 : 1);
}

/** 把某个历史版本设为当前（同样先归档现在的） */
export async function restoreVersion(path) {
  const content = await vfs.read(path);
  if (!content) throw new Error('该版本内容不存在');
  return applyNewPlan(content.replace(/^<!-- [^\n]*-->\n/, ''), `恢复自 ${path}`);
}

/** 档案保存（旧版归档） */
export async function saveProfile(newMd) {
  const old = await vfs.read('profile.md');
  if (old && old.trim() && old.trim() !== newMd.trim()) {
    await vfs.write(`versions/profile/${fileStamp()}.md`, old);
  }
  await vfs.write('profile.md', newMd.trim() + '\n');
}

/** 从计划 md 提取「每日热量目标：约 XXXX kcal」 */
export function extractKcalGoal(planMd) {
  if (!planMd) return null;
  const m = planMd.match(/每日热量目标[：:]\s*约?\s*(\d{3,5})\s*kcal/i);
  return m ? Number(m[1]) : null;
}

/** 从计划 md 抽取今天（周X）的训练段落 */
export function extractTodaySection(planMd) {
  if (!planMd) return null;
  const d = new Date();
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  const name = weekdays[d.getDay()];
  const re = new RegExp(`###\\s*${name}[^\\n]*\\n([\\s\\S]*?)(?=\\n### |\\n## |$)`, 'i');
  const m = planMd.match(re);
  if (m && m[1].trim()) return m[1].trim();
  // 兜底：休息日说明
  return null;
}
