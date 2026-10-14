// 虚拟文件系统：md 文件的唯一真源（IndexedDB files 仓）
// 路径约定：profile.md / plans/current.md / versions/plans/*.md / versions/profile/*.md / logs/YYYY-MM-DD.md

import { tx, reqAsPromise } from './db.js';

export const vfs = {
  /** 读文件内容；不存在返回 null */
  async read(path) {
    const rec = await tx('files', 'readonly', s => reqAsPromise(s.get(path)));
    return rec ? rec.content : null;
  },

  /** 写整个文件（不存在则创建） */
  async write(path, content) {
    const now = new Date().toISOString();
    const rec = { path, content, size: (content || '').length, updatedAt: now };
    const existing = await tx('files', 'readonly', s => reqAsPromise(s.get(path)));
    if (existing) rec.createdAt = existing.createdAt;
    else rec.createdAt = now;
    await tx('files', 'readwrite', s => s.put(rec));
  },

  /** 追加一段 markdown；文件不存在时先写入 header（可选） */
  async appendSection(path, sectionMd, header = '') {
    let prev = await vfs.read(path);
    if (prev === null) {
      prev = header || `# ${path}\n`;
    }
    const next = prev.endsWith('\n') || prev === '' ? prev : prev + '\n';
    await vfs.write(path, next + sectionMd + '\n');
  },

  /** 列出某前缀下的文件元信息，按路径排序 */
  async list(prefix = '') {
    const all = await tx('files', 'readonly', s => reqAsPromise(s.getAll()));
    return all
      .filter(r => r.path.startsWith(prefix))
      .map(({ path, size, updatedAt }) => ({ path, size, updatedAt }))
      .sort((a, b) => a.path < b.path ? -1 : 1);
  },

  async delete(path) {
    await tx('files', 'readwrite', s => s.delete(path));
  },

  /**
   * 批量导入（覆盖同名）。冲突的旧文件先备份到 versions/imported/。
   * files: [{path, content}]
   */
  async importFiles(files) {
    let imported = 0;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
    for (const f of files) {
      if (!f.path || typeof f.content !== 'string') continue;
      const existing = await vfs.read(f.path);
      if (existing !== null && existing !== f.content) {
        await vfs.write(`versions/imported/${stamp}/${f.path}`.replace(/\/+/g, '/'), existing);
      }
      await vfs.write(f.path, f.content);
      imported++;
    }
    return { imported };
  },
};

/** 导出用的文件名 ↔ 虚拟路径转换（iOS 分享导出无法带目录结构） */
export function pathToFileName(path) {
  return path.replace(/\//g, '__');
}

export function fileNameToPath(name) {
  return name.replace(/__/g, '/');
}
