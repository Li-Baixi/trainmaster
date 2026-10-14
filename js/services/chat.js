// 对话业务：消息存取 + 发送（组上下文 → 流式 → 落库 → 检测计划提案）

import { tx, reqAsPromise } from '../db.js';
import { settings } from '../settings.js';
import { chatStream } from '../ai/client.js';
import { buildChatSystemPrompt, buildHistoryMessages, extractFence } from '../ai/context.js';
import { buildImageUserMessage } from '../ai/image.js';
import { appendChatToDaily } from './logs.js';
import { dateISO } from '../utils/format.js';

/** 取最近 N 条消息（UI 渲染） */
export async function getRecentMessages(limit = 50) {
  const all = await tx('messages', 'readonly', s => reqAsPromise(s.getAll()));
  return all.slice(-limit);
}

async function addMessage(rec) {
  const date = rec.date || dateISO();
  await tx('messages', 'readwrite', s => s.add({ ...rec, date, createdAt: Date.now() }));
}

/**
 * 发送一条用户消息并流式获取回复。
 * @param {object} opts
 *   text: 用户文本；images: 压缩后的 dataURL 数组；signal: AbortSignal；
 *   onDelta(增量, 全量): 流式回调；onDone({assistantContent, planProposal})
 * @returns {Promise<{assistantContent: string, planProposal: string|null}>}
 */
export async function sendMessage({ text, images = [], signal, onDelta }) {
  const provider = await settings.getDefaultProvider();
  if (!provider.apiKey) throw new Error('尚未配置 API Key，请到「我的 → 设置 → 模型服务」填写。');

  // 1. 先落库用户消息（含图片，最近一轮保留原图）
  await addMessage({ role: 'user', content: text || '', images: images.length ? images : undefined, model: provider.chatModel });

  // 2. 组上下文
  const systemPrompt = await buildChatSystemPrompt();
  const history = await buildHistoryMessages();
  // buildHistoryMessages 已包含刚存入的这条用户消息（含图）——直接用
  const messages = [{ role: 'system', content: systemPrompt }, ...history];

  // 3. 流式调用（带图时用视觉模型）
  const model = images.length ? (provider.visionModel || provider.chatModel) : provider.chatModel;
  let lastImageMsg = messages[messages.length - 1];
  if (images.length && !(Array.isArray(lastImageMsg.content))) {
    messages[messages.length - 1] = buildImageUserMessage(text, images);
  }

  const { content } = await chatStream({ provider, model, messages, signal, onDelta });

  // 4. 落库 AI 回复 + 追加当日 md
  await addMessage({ role: 'assistant', content, model });
  const iso = dateISO();
  try {
    await appendChatToDaily(iso, { userText: text, assistantText: content, hasImages: images.length > 0 });
  } catch { /* md 写失败不阻塞对话 */ }

  // 5. 检测计划提案
  const planProposal = extractFence(content, 'plan');
  return { assistantContent: content, planProposal };
}

/** 清空对话历史（保留 md 日志） */
export async function clearMessages() {
  await tx('messages', 'readwrite', s => s.clear());
}
