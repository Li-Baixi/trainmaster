// 「设置」页：模型服务商（多服务商）+ Worker 地址 + 上下文偏好 + 数据管理

import { el, toast, confirmDialog, markdownModal } from '../components.js';
import { settings, defaultDeepSeekProvider } from '../../settings.js';
import { testProvider, testWorker } from '../../ai/client.js';
import { exportAll } from '../../services/backup.js';
import { clearMessages } from '../../services/chat.js';
import { tx } from '../../db.js';
import { navigate } from '../../router.js';

export const settingsPage = {
  async render(app) {
    app.innerHTML = '';
    app.appendChild(el('h1', { class: 'page-title' }, '⚙️ 设置'));

    let providers = await settings.getProviders();
    let workerUrl = await settings.getWorkerUrl();
    const ctxPrefs = await settings.getCtxPrefs();

    // ---------- Worker 地址 ----------
    const workerInput = el('input', { class: 'input', placeholder: 'https://你的worker名.你的子域.workers.dev' });
    workerInput.value = workerUrl;
    const workerTestBtn = el('button', { class: 'btn btn-sm btn-outline', onclick: async () => {
      await settings.setWorkerUrl(workerInput.value);
      workerTestBtn.disabled = true;
      workerTestBtn.textContent = '测试中…';
      const r = await testWorker();
      workerTestBtn.disabled = false;
      workerTestBtn.textContent = '测试 Worker';
      toast(r.ok ? `Worker 正常（状态 ${r.status}）✅` : r.error, r.ok ? 'ok' : 'err');
    } }, '测试 Worker');

    app.appendChild(el('div', { class: 'card' },
      el('h2', { class: 'card-title' }, '🔗 转发地址（Cloudflare Worker）',
        el('span', { class: 'hint' }, '必填')),
      el('p', { style: 'margin:0 0 8px;font-size:13px;color:var(--text-secondary)' },
        'DeepSeek 等服务商不允许网页直接调用，需要一次性的免费转发层。'),
      el('div', { class: 'field' }, workerInput),
      el('div', { style: 'display:flex;gap:8px' }, workerTestBtn,
        el('button', { class: 'btn btn-sm btn-outline', onclick: () => markdownGuide() }, '📖 部署指南'))));

    // ---------- 服务商 ----------
    const providersCard = el('div', { class: 'card' });
    renderProviders();
    app.appendChild(providersCard);

    function renderProviders() {
      providersCard.innerHTML = '';
      providersCard.appendChild(el('h2', { class: 'card-title' }, '🤖 模型服务',
        el('span', { class: 'hint' }, 'API Key 只保存在本机')));
      for (const p of providers) {
        providersCard.appendChild(providerForm(p));
      }
      providersCard.appendChild(el('button', { class: 'btn btn-outline btn-sm', onclick: () => {
        providers.push({
          id: 'custom-' + Date.now(),
          name: '新服务商',
          baseUrl: 'https://api.example.com',
          apiKey: '',
          chatModel: '',
          visionModel: '',
          isDefault: false,
        });
        renderProviders();
      } }, '＋ 添加服务商（OpenAI 兼容）'));
    }

    function providerForm(p) {
      const box = el('div', { class: 'provider-card' });
      const mkInput = (label, key, placeholder, password = false) => {
        const input = el('input', { class: 'input', placeholder });
        if (password) input.type = 'password';
        input.value = p[key] || '';
        input.addEventListener('change', () => { p[key] = input.value.trim(); scheduleSave(); });
        return el('div', { class: 'field' }, el('label', {}, label), input);
      };
      const testBtn = el('button', { class: 'btn btn-sm btn-outline' }, '测试连接');
      testBtn.addEventListener('click', async () => {
        await settings.setWorkerUrl(workerInput.value);
        await settings.setProviders(providers);
        testBtn.disabled = true;
        testBtn.textContent = '测试中…';
        const r = await testProvider(p);
        testBtn.disabled = false;
        testBtn.textContent = '测试连接';
        toast(r.ok ? `连接成功（${r.latencyMs}ms）✅` : r.error, r.ok ? 'ok' : 'err');
      });
      box.append(
        el('div', { class: 'provider-head' },
          el('b', {}, p.name || '服务商'),
          p.isDefault ? el('span', { class: 'badge' }, '默认') : null,
          el('span', { style: 'flex:1' }),
          !p.isDefault && providers.length > 1 ? el('button', { class: 'btn btn-sm btn-outline', onclick: async () => {
            providers = providers.filter(x => x.id !== p.id);
            if (!providers.some(x => x.isDefault) && providers.length) providers[0].isDefault = true;
            await settings.setProviders(providers);
            renderProviders();
          } }, '删除') : null,
          !p.isDefault ? el('button', { class: 'btn btn-sm btn-outline', onclick: async () => {
            providers.forEach(x => { x.isDefault = x.id === p.id; });
            await settings.setProviders(providers);
            renderProviders();
          } }, '设为默认') : null),
        mkInput('名称', 'name', '如 DeepSeek'),
        mkInput('接口地址 baseUrl（不含 /v1）', 'baseUrl', 'https://api.deepseek.com'),
        mkInput('API Key', 'apiKey', 'sk-…', true),
        mkInput('对话模型', 'chatModel', 'deepseek-chat'),
        mkInput('视觉模型（拍照识餐/器械用）', 'visionModel', 'deepseek-flash'),
        testBtn);
      return box;
    }

    // 输入变化统一保存（简单防抖）
    let saveTimer = null;
    async function scheduleSave() {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(async () => {
        await settings.setWorkerUrl(workerInput.value);
        await settings.setProviders(providers);
      }, 600);
    }
    workerInput.addEventListener('change', scheduleSave);

    // ---------- 上下文偏好 ----------
    const logDaysSeg = el('div', { class: 'seg' });
    for (const n of [1, 2, 3, 5, 7]) {
      const btn = el('button', { class: n === ctxPrefs.logDays ? 'selected' : '', onclick: async () => {
        [...logDaysSeg.children].forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        await settings.setCtxPrefs({ logDays: n });
        toast(`已改为注入最近 ${n} 天动态`);
      } }, `${n}天`);
      logDaysSeg.appendChild(btn);
    }
    app.appendChild(el('div', { class: 'card' },
      el('h2', { class: 'card-title' }, '🧠 AI 记忆范围'),
      el('p', { style: 'margin:0 0 8px;font-size:13px;color:var(--text-secondary)' }, '每次对话自动附带：档案 + 当前计划 + 最近几天的动态摘要'),
      el('div', { class: 'field' }, el('label', {}, '注入最近几天的记录'), logDaysSeg)));

    // ---------- 数据 ----------
    app.appendChild(el('div', { class: 'card' },
      el('h2', { class: 'card-title' }, '📦 数据'),
      el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' },
        el('button', { class: 'btn btn-outline', style: 'flex:1', onclick: async () => {
          try { const r = await exportAll(); if (r.via === 'download') toast(`已下载 ${r.count} 个文件`); }
          catch (err) { toast(err.message || '导出失败', 'err'); }
        } }, '📤 导出全部'),
        el('button', { class: 'btn btn-outline', style: 'flex:1', onclick: async () => {
          const ok = await confirmDialog('清空全部对话消息吗？（档案、计划、餐食记录、md 日志都不受影响）', { danger: true, okText: '清空' });
          if (!ok) return;
          await clearMessages();
          toast('对话已清空', 'ok');
        } }, '🧹 清空对话'))));

    // ---------- 关于 ----------
    app.appendChild(el('div', { class: 'card' },
      el('h2', { class: 'card-title' }, 'ℹ️ 关于'),
      el('p', { style: 'margin:0;font-size:13px;color:var(--text-secondary)' },
        '训练大师 · 个人健身饮食 PWA', el('br'),
        '数据全部保存在本机（IndexedDB），导出为 md 文件归你所有。', el('br'),
        '忘记情况时：重装 App → 导入 md → 一切恢复。')));

    function markdownGuide() {
      markdownModal('Worker 部署指南（要点）', [
        '# 部署 Cloudflare Worker（一次性，约5分钟）',
        '',
        '1. 打开 [workers.cloudflare.com](https://workers.cloudflare.com)，注册/登录（免费）',
        '2. 「Create Worker」→ 起名 `trainmaster-proxy` → 先点「Deploy」部署空模板',
        '3. 点「Edit code」→ 删掉模板代码 → 把仓库里 `worker/proxy.js` 的全部内容粘贴进去 → 右上角「Deploy」',
        '4. Settings → Variables → 添加 `ALLOWED_ORIGINS`，值为：',
        '   `https://li-baixi.github.io,http://localhost:8000`',
        '5. 复制 Worker 地址（`https://trainmaster-proxy.你的子域.workers.dev`）填到上面输入框',
        '6. 点「测试 Worker」确认正常',
        '',
        '> 详细图文见仓库 `docs/部署指南-Cloudflare-Worker.md`',
        '> 免费额度：每天 10 万次请求，个人使用绰绰有余',
      ].join('\n'));
    }
  },
  destroy() {},
};
