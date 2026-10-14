// 「对话」页：流式聊天 + 拍照提问 + 计划提案确认

import { el, toast, confirmDialog } from '../components.js';
import { renderMarkdownInto } from '../markdown.js';
import { sendMessage, getRecentMessages } from '../../services/chat.js';
import { applyNewPlan } from '../../services/plans.js';
import { compressImage } from '../../ai/image.js';
import { stripFences } from '../../ai/context.js';
import { settings } from '../../settings.js';

const QUICK_CHIPS = [
  '帮我调整一下本周计划',
  '这个器械怎么用（我先拍张照）',
  '今天吃多了，怎么补救？',
  '最近训练没状态，怎么办',
];

export const chatPage = {
  async render(app, params) {
    let aborted = false;
    let sending = false;
    let pendingImages = [];
    let autoScroll = true;

    app.innerHTML = '';
    const wrap = el('div', { class: 'chat-wrap' });
    const scroll = el('div', { class: 'chat-scroll' });
    const chips = el('div', { class: 'quick-chips' });
    const input = el('textarea', { placeholder: '问教练任何事…', rows: '1' });
    const cameraBtn = el('button', { class: 'icon-btn', title: '拍照/选图' }, '📷');
    const sendBtn = el('button', { class: 'icon-btn send', title: '发送' }, '▲');
    const inputbar = el('div', { class: 'chat-inputbar' }, cameraBtn, input, sendBtn);

    // 隐藏的文件选择
    const fileInput = el('input', { type: 'file', accept: 'image/*', multiple: true, style: 'display:none' });

    // 消息列表
    const list = el('div', {});
    scroll.appendChild(list);

    // 快捷 chips
    for (const text of QUICK_CHIPS) {
      chips.appendChild(el('button', { class: 'chip', onclick: () => { input.value = text; input.focus(); } }, text));
    }

    wrap.append(scroll, chips, inputbar, fileInput);
    app.appendChild(wrap);

    // ---- 历史消息 ----
    const history = await getRecentMessages(50);
    for (const m of history) {
      list.appendChild(buildMessageEl(m.role, m.content, m.images || [], false));
    }
    if (!history.length) {
      list.appendChild(el('div', { class: 'empty-hint', style: 'padding:30px 20px' },
        '教练已经了解你的档案和当前计划\n有训练、饮食、器械使用的问题直接问'));
    }
    scrollBottom(true);

    // URL 参数预填（从计划页跳转来）
    const prefill = params.get('q');
    if (prefill) {
      input.value = prefill;
      input.focus();
    }

    // ---- 交互 ----
    scroll.addEventListener('scroll', () => {
      const nearBottom = scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 60;
      autoScroll = nearBottom;
    });

    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = Math.min(120, input.scrollHeight) + 'px';
      chips.style.display = input.value ? 'none' : 'flex';
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        doSend();
      }
    });
    sendBtn.addEventListener('click', () => {
      if (sending) {
        aborted = true;
        return;
      }
      doSend();
    });
    cameraBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', async () => {
      const files = Array.from(fileInput.files || []).slice(0, 3);
      fileInput.value = '';
      if (!files.length) return;
      try {
        const compressed = await Promise.all(files.map(f => compressImage(f, { maxEdge: 1280 })));
        pendingImages = compressed.map(c => c.dataUrl);
        showPendingImages();
        toast(`已附 ${pendingImages.length} 张图，输入问题后发送`);
      } catch {
        toast('图片读取失败', 'err');
      }
    });

    function showPendingImages() {
      let strip = inputbar.previousElementSibling;
      if (strip && strip.classList.contains('img-preview-strip')) strip.remove();
      if (!pendingImages.length) return;
      strip = el('div', { class: 'img-preview-strip' });
      for (const url of pendingImages) {
        strip.appendChild(el('img', { src: url, alt: '待发送' }));
      }
      strip.appendChild(el('button', { class: 'btn btn-sm btn-outline', onclick: () => { pendingImages = []; strip.remove(); } }, '✕ 移除'));
      inputbar.before(strip);
    }

    // 键盘适配（iOS visualViewport）
    const vv = window.visualViewport;
    const onVV = () => { if (vv && window.innerHeight - vv.height > 100) scrollBottom(true); };
    if (vv) vv.addEventListener('resize', onVV);

    function scrollBottom(force) {
      if (force || autoScroll) requestAnimationFrame(() => { scroll.scrollTop = scroll.scrollHeight; });
    }

    async function doSend() {
      const text = input.value.trim();
      if ((!text && !pendingImages.length) || sending) return;
      const images = pendingImages;
      pendingImages = [];
      showPendingImages();
      input.value = '';
      input.style.height = 'auto';
      chips.style.display = 'none';

      // 用户气泡
      list.appendChild(buildMessageEl('user', text, images, false));
      scrollBottom(true);

      // AI 气泡（流式）
      const aiMsg = buildMessageEl('assistant', '', [], true);
      list.appendChild(aiMsg);
      const bubbleBody = aiMsg.querySelector('.bubble');
      const typing = el('div', { class: 'typing-row' }, el('span'), el('span'), el('span'),
        el('i', { style: 'font-style:normal;font-size:12px;color:var(--text-tertiary);margin-left:4px' }, '思考中…（长回答可能要等一会儿）'));
      bubbleBody.appendChild(typing);
      scrollBottom(true);

      sending = true;
      aborted = false;
      sendBtn.classList.add('stop');
      sendBtn.textContent = '■';
      let firstDelta = true;

      try {
        const { assistantContent, planProposal } = await sendMessage({
          text, images,
          onDelta: (_d, full) => {
            if (firstDelta) { typing.remove(); firstDelta = false; }
            renderMarkdownInto(bubbleBody, full + '▍');
            scrollBottom(false);
          },
        });
        typing.remove();
        renderMarkdownInto(bubbleBody, stripFences(assistantContent));
        if (planProposal) attachProposalCard(list, planProposal);
      } catch (err) {
        typing.remove();
        if (err.name === 'AbortError') {
          renderMarkdownInto(bubbleBody, '（已停止）');
        } else {
          bubbleBody.appendChild(el('p', { style: 'color:var(--danger);font-size:14px;margin:6px 0 0' }, '⚠️ ' + (err.message || '出错了')));
        }
      } finally {
        sending = false;
        sendBtn.classList.remove('stop');
        sendBtn.textContent = '▲';
        scrollBottom(false);
      }
    }

    // 计划提案卡（确认应用流）
    function attachProposalCard(container, planMd) {
      const card = el('div', { class: 'proposal-card' },
        el('b', {}, '📋 教练生成了一份新计划'),
        el('p', { style: 'margin:6px 0;font-size:13px;color:var(--text-secondary)' }, '确认后替换当前计划，旧版本会自动归档，可随时恢复。'));
      const actions = el('div', { class: 'proposal-actions' });
      const previewBtn = el('button', { class: 'btn btn-sm btn-outline' }, '预览');
      const applyBtn = el('button', { class: 'btn btn-sm btn-primary' }, '确认应用');
      const ignoreBtn = el('button', { class: 'btn btn-sm btn-outline' }, '忽略');
      actions.append(previewBtn, applyBtn, ignoreBtn);
      card.appendChild(actions);

      previewBtn.addEventListener('click', () => {
        let pv = card.querySelector('.proposal-preview');
        if (pv) { pv.remove(); previewBtn.textContent = '预览'; return; }
        pv = el('div', { class: 'proposal-preview md' });
        renderMarkdownInto(pv, planMd);
        card.appendChild(pv);
        previewBtn.textContent = '收起预览';
      });
      applyBtn.addEventListener('click', async () => {
        const ok = await confirmDialog('确认用这份新计划替换当前计划吗？旧版本会自动归档，之后可在「计划」页恢复。');
        if (!ok) return;
        try {
          await applyNewPlan(planMd, '对话中教练提案');
          card.classList.add('applied');
          actions.remove();
          card.appendChild(el('p', { style: 'margin:4px 0 0;font-size:13px' }, '✅ 已应用，旧版已归档'));
          toast('新计划已生效 ✅', 'ok');
        } catch (err) {
          toast('应用失败：' + (err.message || err), 'err');
        }
      });
      ignoreBtn.addEventListener('click', () => card.remove());
      container.appendChild(card);
      scrollBottom(false);
    }

    this._cleanup = () => {
      if (vv) vv.removeEventListener('resize', onVV);
    };
  },
  destroy() {
    if (this._cleanup) this._cleanup();
  },
};

/** 构造消息气泡 */
function buildMessageEl(role, content, images = [], streaming = false) {
  const msg = el('div', { class: `msg ${role === 'user' ? 'msg-user' : 'msg-ai'}` });
  const bubble = el('div', { class: 'bubble' });
  if (images.length) {
    bubble.appendChild(el('div', { class: 'msg-images' }, images.map(url => el('img', { src: url, alt: '' }))));
  }
  if (content) renderMarkdownInto(bubble, content);
  if (streaming && !content) bubble.classList.add('pending');
  msg.appendChild(bubble);
  return msg;
}
