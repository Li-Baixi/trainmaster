// 「计划」页：当前计划渲染 + 历史版本 + 恢复 + 让 AI 调整

import { el, toast, confirmDialog, markdownModal } from '../components.js';
import { renderMarkdownInto } from '../markdown.js';
import { getCurrentPlan, listPlanVersions, restoreVersion } from '../../services/plans.js';
import { vfs } from '../../vfs.js';
import { navigate } from '../../router.js';

export const plansPage = {
  async render(app) {
    app.innerHTML = '';
    app.appendChild(el('h1', { class: 'page-title' }, '📋 我的计划'));

    const planMd = await getCurrentPlan();
    const versions = await listPlanVersions();

    if (!planMd) {
      app.appendChild(el('div', { class: 'card' },
        el('p', { style: 'margin:0 0 10px' }, '还没有计划。可以先完成问卷向导，或直接让教练帮你生成。'),
        el('button', { class: 'btn btn-primary', onclick: () => navigate('onboarding') }, '开始问卷'),
        ' ',
        el('button', { class: 'btn btn-outline', onclick: () => navigate('chat', ) }, '去对话里让教练生成')));
      return;
    }

    const planView = el('div', { class: 'card md' });
    renderMarkdownInto(planView, planMd);
    app.append(
      el('p', { class: 'page-subtitle' }, `当前版本 · 已有 ${versions.length} 个历史版本`),
      el('div', { class: 'card', style: 'display:flex;gap:8px' },
        el('button', { class: 'btn btn-primary', style: 'flex:1', onclick: () => navigate('chat?q=' + encodeURIComponent('我想调整一下当前计划：')) }, '✨ 让 AI 调整'),
        el('button', { class: 'btn btn-outline', style: 'flex:1', onclick: () => toggleVersions() }, versions.length ? `🕘 历史版本 (${versions.length})` : '🕘 暂无历史版本')),
      planView);

    const versionCard = el('div', { class: 'card hidden' });
    app.appendChild(versionCard);

    async function toggleVersions() {
      if (!versionCard.classList.contains('hidden')) { versionCard.classList.add('hidden'); return; }
      versionCard.classList.remove('hidden');
      versionCard.innerHTML = '';
      if (!versions.length) {
        versionCard.appendChild(el('p', { class: 'empty-hint' }, '调整过计划后，旧版本会出现在这里'));
        return;
      }
      for (const v of versions) {
        const name = v.path.split('/').pop();
        versionCard.appendChild(el('div', { class: 'version-item' },
          el('div', {},
            el('div', { class: 'v-name' }, name.replace('.md', '')),
            el('div', { class: 'v-meta' }, new Date(v.updatedAt).toLocaleString('zh-CN'))),
          el('div', { style: 'display:flex;gap:6px' },
            el('button', { class: 'btn btn-sm btn-outline', onclick: async () => { markdownModal('版本预览', (await vfs.read(v.path)) || '(空)'); } }, '预览'),
            el('button', { class: 'btn btn-sm btn-outline', onclick: async () => {
              const ok = await confirmDialog(`把「${name}」恢复为当前计划吗？当前版本会先归档。`);
              if (!ok) return;
              try {
                await restoreVersion(v.path);
                toast('已恢复 ✅', 'ok');
                plansPage.render(app);
              } catch (err) { toast(err.message || '恢复失败', 'err'); }
            } }, '恢复'))));
      }
    }
  },
  destroy() {},
};
