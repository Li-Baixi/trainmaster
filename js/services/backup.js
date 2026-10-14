// 备份业务：导出（Web Share 多文件 → iOS 文件 App）/ 导入（file input）

import { vfs, pathToFileName, fileNameToPath } from '../vfs.js';
import { settings } from '../settings.js';

/** 导出全部 md 文件。优先系统分享面板，降级逐个下载。 */
export async function exportAll(onProgress) {
  const files = await vfs.list('');
  if (!files.length) throw new Error('还没有可导出的数据。');
  const fileObjects = [];
  for (const meta of files) {
    const content = await vfs.read(meta.path);
    fileObjects.push(new File([content], pathToFileName(meta.path), { type: 'text/markdown' }));
    if (onProgress) onProgress(fileObjects.length, files.length);
  }
  try {
    if (navigator.canShare && navigator.canShare({ files: fileObjects })) {
      await navigator.share({
        files: fileObjects,
        title: '训练大师数据备份',
        text: `共 ${fileObjects.length} 个 md 文件（选择「存储到文件」）`,
      });
      await settings.set('lastExportAt', new Date().toISOString());
      return { via: 'share', count: fileObjects.length };
    }
  } catch (err) {
    if (err.name === 'AbortError') return { via: 'cancelled', count: 0 };
    // 分享失败 → 降级下载
  }
  downloadFiles(fileObjects);
  await settings.set('lastExportAt', new Date().toISOString());
  return { via: 'download', count: fileObjects.length };
}

/** 导出单日日志 */
export async function exportDay(iso) {
  const content = await vfs.read(`logs/${iso}.md`);
  if (!content) throw new Error('该日没有日志。');
  const f = new File([content], `log__${iso}.md`, { type: 'text/markdown' });
  try {
    if (navigator.canShare && navigator.canShare({ files: [f] })) {
      await navigator.share({ files: [f], title: `${iso} 日志` });
      return;
    }
  } catch (err) {
    if (err.name === 'AbortError') return;
  }
  downloadFiles([f]);
}

function downloadFiles(fileObjects) {
  for (const f of fileObjects) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(f);
    a.download = f.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
}

/**
 * 从选择的 md 文件导入：文件名还原虚拟路径（profile.md / plans__current.md → plans/current.md）。
 * 返回 { imported, mealsRestored } 报告。
 */
export async function importFromFiles(fileList) {
  const files = Array.from(fileList).filter(f => /\.md$/i.test(f.name));
  if (!files.length) throw new Error('请选择 .md 文件。');
  const toImport = [];
  for (const f of files) {
    const path = normalizePath(fileNameToPath(f.name.replace(/\.md$/i, '')));
    const content = await f.text();
    toImport.push({ path: path + '.md', content });
  }
  const { imported } = await vfs.importFiles(toImport);
  const mealsRestored = await rebuildMealsFromLogs();
  return { imported, mealsRestored };
}

function normalizePath(p) {
  // 兼容历史导出名 log__2026-10-14 → logs/2026-10-14
  if (p.startsWith('log__')) return 'logs/' + p.slice(5);
  return p;
}

/** 从 logs/*.md 的 ```meal 围栏重建 meals 仓（导入恢复用） */
async function rebuildMealsFromLogs() {
  const { tx } = await import('../db.js');
  const logs = await vfs.list('logs/');
  let restored = 0;
  const existing = await tx('meals', 'readonly', s => s.getAll());
  const seen = new Set(existing.map(m => `${m.date}|${m.time}|${m.title}`));
  for (const meta of logs) {
    const m = meta.path.match(/^logs\/(\d{4}-\d{2}-\d{2})\.md$/);
    if (!m) continue;
    const content = await vfs.read(meta.path);
    const blocks = content.match(/```meal\n[\s\S]*?```/g) || [];
    for (const block of blocks) {
      try {
        const obj = JSON.parse(block.replace(/```meal\n?/, '').replace(/```$/, ''));
        const time = guessTime(content, block) || (obj.recordedAt ? obj.recordedAt.slice(11, 16) : '');
        const key = `${m[1]}|${time}|${obj.title}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const { normalizeMeal } = await import('./meals.js');
        const meal = normalizeMeal({ ...obj, mealType: obj.mealType || '' });
        await tx('meals', 'readwrite', s => s.add({
          ...meal,
          date: m[1],
          time,
          image: '',
          createdAt: obj.recordedAt || new Date().toISOString(),
        }));
        restored++;
      } catch { /* 跳过坏块 */ }
    }
  }
  return restored;
}

/** 猜测 meal 块对应的时间：找它前面最近的「## HH:mm」标题 */
function guessTime(content, block) {
  const idx = content.indexOf(block);
  const before = content.slice(0, idx);
  const times = before.match(/^## (\d{2}:\d{2})/gm) || [];
  const last = times[times.length - 1];
  return last ? last.replace('## ', '') : '';
}
