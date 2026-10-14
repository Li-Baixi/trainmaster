// 「我的」页：个人档案查看/编辑 + 入口（设置/重新问卷/导出）

import { el, toast, confirmDialog } from '../components.js';
import { renderMarkdownInto } from '../markdown.js';
import { vfs } from '../../vfs.js';
import { saveProfile } from '../../services/plans.js';
import { settings } from '../../settings.js';
import { navigate } from '../../router.js';

export const profilePage = {
  async render(app) {
    app.innerHTML = '';
    app.appendChild(el('h1', { class: 'page-title' }, '👤 我的'));

    const profileMd = await vfs.read('profile.md');
    const lastExportAt = await settings.get('lastExportAt');
    const daysSinceExport = lastExportAt ? Math.floor((Date.now() - new Date(lastExportAt).getTime()) / 86400000) : null;

    if (!profileMd) {
      app.appendChild(el('div', { class: 'card' },
        el('p', { style: 'margin:0 0 10px' }, '还没有个人档案。完成问卷后，教练就会记住你。'),
        el('button', { class: 'btn btn-primary', onclick: () => navigate('onboarding') }, '开始问卷')));
    } else {
      let editing = false;
      const card = el('div', { class: 'card' });
      const view = el('div', { class: 'md' });
      renderMarkdownInto(view, profileMd);
      const textarea = el('textarea', { class: 'input input-mono', rows: '16' });
      textarea.value = profileMd;
      textarea.style.display = 'none';
      const toggleBtn = el('button', { class: 'btn btn-sm btn-outline', onclick: () => {
        editing = !editing;
        view.style.display = editing ? 'none' : 'block';
        textarea.style.display = editing ? 'block' : 'none';
        toggleBtn.textContent = editing ? '预览' : '✏️ 编辑原文';
        if (!editing) renderMarkdownInto(view, textarea.value);
      } }, '✏️ 编辑原文');
      const saveBtn = el('button', { class: 'btn btn-sm btn-primary', style: 'display:none;margin-left:8px', onclick: async () => {
        const ok = await confirmDialog('保存对档案的修改吗？旧版会自动归档。AI 之后将按新档案回答。');
        if (!ok) return;
        try {
          await saveProfile(textarea.value);
          toast('档案已保存 ✅', 'ok');
          profilePage.render(app);
        } catch (err) { toast(err.message || '保存失败', 'err'); }
      } }, '保存');
      // 简单处理：编辑时显示保存
      toggleBtn.addEventListener('click', () => { saveBtn.style.display = editing ? 'inline-flex' : 'none'; });

      card.append(el('div', { class: 'card-title' }, '📄 个人档案（AI 的长期记忆）', toggleBtn, saveBtn), view, textarea);
      app.appendChild(card);
    }

    // 备份提醒
    if (daysSinceExport === null || daysSinceExport > 7) {
      app.appendChild(el('div', { class: 'card', style: 'border:1.5px solid var(--accent);background:var(--accent-soft)' },
        el('p', { style: 'margin:0 0 8px;font-size:14px' }, daysSinceExport === null ? '💡 建议：到「记录」页把数据导出到「文件」App，养成备份习惯' : `⏰ 已有 ${daysSinceExport} 天没导出备份了，建议导出一次`),
        el('button', { class: 'btn btn-sm btn-outline', onclick: () => navigate('records') }, '去导出')));
    }

    // 功能入口
    app.appendChild(el('div', { class: 'card' },
      el('div', { class: 'version-item', onclick: () => navigate('settings'), style: 'cursor:pointer' }, el('span', { class: 'v-name' }, '⚙️ 设置（模型 / API / 数据）'), el('span', {}, '›')),
      el('div', { class: 'version-item', onclick: async () => {
        const ok = await confirmDialog('重新进行问卷吗？教练会在现有档案基础上做修订。', { okText: '开始' });
        if (ok) navigate('onboarding');
      }, style: 'cursor:pointer' }, el('span', { class: 'v-name' }, '🔄 重新进行问卷'), el('span', {}, '›')),
      el('div', { class: 'version-item', onclick: () => navigate('records'), style: 'cursor:pointer' }, el('span', { class: 'v-name' }, '📊 记录与数据导出'), el('span', {}, '›'))));
  },
  destroy() {},
};
