// 首次问卷向导：4 步问卷 + 1 步确认生成（两次流式 AI 调用）

import { el, toast } from '../components.js';
import { renderMarkdownInto } from '../markdown.js';
import { settings } from '../../settings.js';
import { WIZARD_STEPS, generateProfile, generatePlan, finishOnboarding } from '../../services/onboarding.js';
import { navigate } from '../../router.js';

export const onboardingPage = {
  async render(app) {
    const draft = (await settings.get('onboardingDraft')) || {};
    let step = 0;
    let profileMd = null;
    let planMd = null;

    const container = el('div', {});
    app.appendChild(container);

    function fieldKey(stepDef, f) { return `${stepDef.key}.${f.key}`; }

    function renderStep() {
      container.innerHTML = '';
      // 进度条
      const stepsBar = el('div', { class: 'wizard-steps' },
        WIZARD_STEPS.map((s, i) => el('i', { class: i <= step ? 'done' : '' })));
      container.append(el('h1', { class: 'page-title' }, '欢迎来到训练大师 👋'), stepsBar);

      if (step < WIZARD_STEPS.length) {
        renderQuestionStep(WIZARD_STEPS[step]);
      } else {
        renderConfirmStep();
      }
      window.scrollTo(0, 0);
    }

    function renderQuestionStep(stepDef) {
      container.append(el('p', { class: 'page-subtitle' }, `${stepDef.title} — ${stepDef.desc}`));
      const card = el('div', { class: 'card' });
      for (const f of stepDef.fields) {
        const key = fieldKey(stepDef, f);
        card.appendChild(el('div', { class: 'field' },
          el('label', {}, f.required ? `${f.label} *` : f.label),
          buildFieldInput(f, key)));
      }
      container.append(card);

      const nav = el('div', { class: 'wizard-nav' });
      if (step > 0) nav.append(el('button', { class: 'btn btn-outline', style: 'flex:1', onclick: () => { step--; renderStep(); } }, '上一步'));
      nav.append(el('button', { class: 'btn btn-primary', style: 'flex:2', onclick: () => {
        // 必填校验
        for (const f of stepDef.fields) {
          if (!f.required) continue;
          const v = draft[fieldKey(stepDef, f)];
          if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) {
            toast(`「${f.label}」还没填`, 'err');
            return;
          }
        }
        step++;
        renderStep();
      } }, step === WIZARD_STEPS.length - 1 ? '下一步，确认信息' : '下一步'));
      container.append(nav);
    }

    function buildFieldInput(f, key) {
      if (f.type === 'chips') {
        const row = el('div', { class: 'chip-row' });
        const current = draft[key] || (f.multi ? [] : undefined);
        for (const opt of f.options) {
          const selected = f.multi ? current.includes(opt) : current === opt;
          const chip = el('button', {
            class: `chip${selected ? ' selected' : ''}`,
            type: 'button',
            onclick: () => {
              if (f.multi) {
                const arr = new Set(draft[key] || []);
                arr.has(opt) ? arr.delete(opt) : arr.add(opt);
                draft[key] = [...arr];
              } else {
                draft[key] = opt;
              }
              saveDraft();
              // 重渲染这个 chip 行
              row.replaceWith(buildFieldInput(f, key));
            },
          }, opt);
          row.appendChild(chip);
        }
        return row;
      }
      if (f.type === 'textarea') {
        const ta = el('textarea', { class: 'input', placeholder: f.placeholder || '' });
        ta.value = draft[key] || '';
        ta.addEventListener('change', () => { draft[key] = ta.value; saveDraft(); });
        return ta;
      }
      const input = el('input', { class: 'input', type: f.type === 'number' ? 'number' : 'text', placeholder: f.placeholder || '', inputmode: f.type === 'number' ? 'decimal' : undefined });
      input.value = draft[key] ?? '';
      input.addEventListener('change', () => { draft[key] = input.value; saveDraft(); });
      return input;
    }

    async function saveDraft() {
      await settings.set('onboardingDraft', draft);
    }

    async function renderConfirmStep() {
      const summary = el('dl', {});
      const dlLines = [];
      for (const stepDef of WIZARD_STEPS) {
        for (const f of stepDef.fields) {
          const v = draft[fieldKey(stepDef, f)];
          if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) continue;
          dlLines.push([f.label.replace(/（.*）/, ''), Array.isArray(v) ? v.join('、') : v]);
        }
      }
      for (const [k, v] of dlLines) {
        summary.append(el('dt', {}, k), el('dd', {}, String(v)));
      }

      // API 配置检查
      const provider = await settings.getDefaultProvider();
      const workerUrl = await settings.getWorkerUrl();
      const apiReady = provider.apiKey && workerUrl;
      const apiWarn = apiReady ? null : el('div', { class: 'card', style: 'border:1.5px solid var(--accent);background:var(--accent-soft)' },
        el('p', { style: 'margin:0 0 8px;font-size:14px' }, '⚠️ 还没配置 AI 服务（API Key + 转发地址），无法生成计划。'),
        el('button', { class: 'btn btn-outline btn-sm', onclick: () => navigate('settings') }, '先去设置（问卷进度已保存）'));

      const generateBtn = el('button', { class: 'btn btn-primary btn-block btn-lg' }, '✨ 生成我的档案和计划');
      const resultBox = el('div', { class: 'card hidden' });
      const resultMd = el('div', { class: 'md' });
      const finishBtn = el('button', { class: 'btn btn-primary btn-block btn-lg hidden' }, '🎉 开始使用');

      container.append(
        el('p', { class: 'page-subtitle' }, '最后确认一下你的信息，教练将据此定制方案'),
        el('div', { class: 'card wizard-summary' }, summary),
        apiWarn,
        generateBtn,
        resultBox,
        finishBtn,
        el('div', { class: 'wizard-nav' }, el('button', { class: 'btn btn-outline', style: 'flex:1', onclick: () => { step--; renderStep(); } }, '返回修改')));

      generateBtn.addEventListener('click', async () => {
        if (!apiReady) { toast('请先完成 AI 服务配置', 'err'); return; }
        generateBtn.disabled = true;
        generateBtn.classList.add('hidden');
        resultBox.classList.remove('hidden');

        // 生成过程 UI：状态行 + 思考预览 + 正文预览 + 计时
        const statusLine = el('p', { style: 'color:var(--text-tertiary);font-size:14px;margin:0' }, '📝 正在生成个人档案…');
        const thinkLine = el('p', {
          style: 'font-size:12px;color:var(--text-tertiary);white-space:pre-wrap;max-height:66px;overflow:hidden;margin:8px 0 0;display:none',
        });
        resultBox.innerHTML = '';
        resultBox.append(statusLine, thinkLine, resultMd);

        const startedAt = Date.now();
        const timer = setInterval(() => {
          const s = Math.round((Date.now() - startedAt) / 1000);
          statusLine.textContent = `${statusLine.dataset.msg}（已进行 ${s} 秒，长文生成可能要 1-3 分钟，请保持页面开着）`;
        }, 1000);

        const setStatus = (msg) => { statusLine.dataset.msg = msg; statusLine.textContent = msg; };
        setStatus('📝 正在生成个人档案…');
        const onDelta = (_d, full) => {
          thinkLine.style.display = 'none';
          setStatus('✍️ AI 正在输出，实时预览：');
          resultMd.textContent = '';
          renderMarkdownInto(resultMd, '```\n' + (full || '').slice(-1200) + '\n```');
        };
        const onReasoning = (_r, rFull) => {
          if (thinkLine.style.display === 'none') thinkLine.style.display = 'block';
          thinkLine.textContent = '🧠 AI 思考中：' + (rFull || '').slice(-260);
        };

        try {
          profileMd = await generateProfile(draft, onDelta, null, onReasoning);
          phase = 'plan';
          resultMd.textContent = '';
          thinkLine.style.display = 'none';
          setStatus('📋 档案完成，正在定制训练与饮食计划…');
          planMd = await generatePlan(profileMd, draft, onDelta, null, onReasoning);
          clearInterval(timer);
          resultBox.innerHTML = '';
          resultBox.append(el('div', { class: 'card-title' }, '✅ 你的档案与计划已生成（可稍后在「我的」「计划」里查看和修改）'), resultMd);
          renderMarkdownInto(resultMd, profileMd + '\n\n---\n\n' + planMd);
          finishBtn.classList.remove('hidden');
        } catch (err) {
          clearInterval(timer);
          toast(err.message || '生成失败，请重试', 'err');
          resultBox.innerHTML = '';
          resultBox.append(
            el('p', { style: 'color:var(--danger);font-size:14px;margin:0 0 4px' }, '⚠️ ' + (err.message || '生成失败')),
            el('p', { style: 'color:var(--text-tertiary);font-size:13px;margin:0 0 8px' }, '点下面的按钮重试即可，问卷答案都还在。若多次失败，可到「设置」把对话模型换成 deepseek-flash（更快更稳）。'));
          generateBtn.classList.remove('hidden');
          generateBtn.disabled = false;
          generateBtn.textContent = '🔄 重新生成';
        }
      });

      finishBtn.addEventListener('click', async () => {
        await finishOnboarding(profileMd, planMd, draft);
        toast('欢迎！从今天开始 💪', 'ok');
        navigate('today');
      });
    }

    renderStep();
  },
  destroy() {},
};
