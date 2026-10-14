// OpenAI 兼容 AI 客户端：经 Cloudflare Worker 转发调用 chat/completions
// - 浏览器持有 API key（Authorization 头透传，Worker 不存储）
// - X-Api-Base 告诉 Worker 上游地址（baseUrl 不含 /v1，浏览器请求路径以 /v1 开头，Worker 去掉 /v1 拼接）
// - SSE 流式 + 非流式降级

import { settings } from '../settings.js';

class AIError extends Error {
  constructor(message, { status } = {}) {
    super(message);
    this.name = 'AIError';
    this.status = status;
  }
}

/** 把用户的中止信号和一个可重置的「看门狗」计时器绑到一个内部 AbortController 上。
 *  arm(ms) 重新计时；超时后 abort（timedOut=true），与用户主动 abort 区分开。 */
function linkedController(userSignal, timeoutMs) {
  const ctrl = new AbortController();
  let timedOut = false;
  let timer = null;
  const onUserAbort = () => ctrl.abort();
  if (userSignal) {
    if (userSignal.aborted) ctrl.abort();
    else userSignal.addEventListener('abort', onUserAbort, { once: true });
  }
  return {
    signal: ctrl.signal,
    get timedOut() { return timedOut; },
    arm(ms = timeoutMs) {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { timedOut = true; ctrl.abort(); }, ms);
    },
    cleanup() {
      if (timer) clearTimeout(timer);
      if (userSignal) userSignal.removeEventListener('abort', onUserAbort);
    },
  };
}

/** 请求 Worker 的完整 URL（workerUrl + /v1/...） */
async function workerUrl() {
  const base = await settings.getWorkerUrl();
  if (!base) {
    throw new AIError('尚未配置转发地址（Worker URL），请到「我的 → 设置」填写。部署方法见 App 内指南。');
  }
  return base;
}

function friendlyError(status, message) {
  if (status === 401 || status === 403) return `鉴权失败（${status}）：API Key 无效，或 Worker 的 ALLOWED_ORIGINS 未包含当前网址。`;
  if (status === 402) return '账户余额不足，请到服务商官网充值。';
  if (status === 429) return '请求太频繁或额度用完，稍等片刻再试。';
  if (status === 404) return `接口路径或模型名不存在（404）：请检查服务商的 baseUrl 与模型名是否正确。${message || ''}`;
  if (status >= 500) return `服务商/转发层暂时故障（${status}），请稍后重试。`;
  return message || `请求失败（${status}）`;
}

/**
 * 非流式一次性调用。返回完整文本。
 * { provider, messages, signal, temperature, maxTokens }
 */
export async function chatOnce({ provider, messages, signal, temperature = 0.7, maxTokens }) {
  const base = await workerUrl();
  const body = { model: provider.chatModel || provider.model, messages, stream: false, temperature };
  if (maxTokens) body.max_tokens = maxTokens;
  const link = linkedController(signal, 300000); // 非流式整体最长 5 分钟
  link.arm();
  let res;
  try {
    res = await fetch(`${base}/v1/chat/completions`, {
      method: 'POST',
      signal: link.signal,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${provider.apiKey}`,
        'X-Api-Base': provider.baseUrl,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    if (link.timedOut) throw new AIError('AI 处理时间过长（超过 5 分钟）。请重试；若反复出现，可在设置里把对话模型换成 deepseek-flash（更快）。');
    if (err.name === 'AbortError') throw err;
    throw new AIError('网络请求失败：请检查网络，以及 Worker 地址是否正确、是否已部署。');
  } finally {
    link.cleanup();
  }
  if (!res.ok) {
    let msg = '';
    try { msg = (await res.json())?.error?.message || ''; } catch { /* ignore */ }
    throw new AIError(friendlyError(res.status, msg), { status: res.status });
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') throw new AIError('模型返回格式异常，请重试。');
  return { content };
}

/**
 * 流式调用。逐字回调 onDelta，完成后返回完整文本与用量。
 * 推理类模型（先思考后回答）思考期间回调 onReasoning，正文用 onDelta。
 * 内置看门狗：响应头 120 秒不回、流中 90 秒无数据 → 明确报错，不会无限卡住。
 * 环境不支持 response.body 读取时自动降级为非流式。
 * { provider, model, messages, signal, onDelta, onReasoning, temperature, maxTokens }
 */
export async function chatStream({ provider, model, messages, signal, onDelta, onReasoning, temperature = 0.7, maxTokens }) {
  const useModel = model || provider.chatModel || provider.model;
  const base = await workerUrl();
  const body = { model: useModel, messages, stream: true, temperature };
  if (maxTokens) body.max_tokens = maxTokens;

  const link = linkedController(signal, 120000); // 响应头最长等 2 分钟
  link.arm();
  let res;
  try {
    res = await fetch(`${base}/v1/chat/completions`, {
      method: 'POST',
      signal: link.signal,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
        'Authorization': `Bearer ${provider.apiKey}`,
        'X-Api-Base': provider.baseUrl,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    if (link.timedOut) throw new AIError('AI 服务 2 分钟内没有响应。请点重试；若反复出现，可在设置里把模型换成 deepseek-flash（更快）。');
    if (err.name === 'AbortError') throw err;
    throw new AIError('网络请求失败：请检查网络，以及 Worker 地址是否正确、是否已部署。');
  }

  if (!res.ok) {
    link.cleanup();
    let msg = '';
    try { msg = (await res.json())?.error?.message || ''; } catch { /* ignore */ }
    throw new AIError(friendlyError(res.status, msg), { status: res.status });
  }

  // 不支持流式读取 → 降级
  if (!res.body || typeof res.body.getReader !== 'function') {
    link.cleanup();
    const again = await chatOnce({ provider: { ...provider, chatModel: useModel }, messages, signal, temperature, maxTokens });
    if (onDelta) onDelta(again.content);
    return { content: again.content, usage: null };
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';
  let reasoning = '';
  link.arm(90000); // 之后：90 秒收不到任何数据视为断流

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      link.arm(90000); // 收到数据，重置看门狗
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // 留最后一段不完整行
      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;
        try {
          const evt = JSON.parse(payload);
          const d = evt?.choices?.[0]?.delta;
          const r = d?.reasoning_content ?? d?.reasoning; // 思考流（DeepSeek/OpenAI 风格）
          if (typeof r === 'string' && r) {
            reasoning += r;
            if (onReasoning) onReasoning(r, reasoning);
          }
          const delta = d?.content;
          if (typeof delta === 'string' && delta) {
            full += delta;
            if (onDelta) onDelta(delta, full);
          }
        } catch { /* 忽略无法解析的行 */ }
      }
    }
  } catch (err) {
    if (err.name === 'AbortError' && !link.timedOut) throw err; // 用户主动停止
    if (!full) {
      if (link.timedOut) {
        throw new AIError(`AI 生成中断（90 秒没有收到数据${reasoning ? '，发生在思考阶段' : ''}）。请点重试；若反复出现，可在设置里把模型换成 deepseek-flash（更快）。`);
      }
      // 其他读取异常 → 整体降级非流式
      const again = await chatOnce({ provider: { ...provider, chatModel: useModel }, messages, signal, temperature, maxTokens });
      if (onDelta) onDelta(again.content);
      return { content: again.content, usage: null, degraded: true };
    }
    // 断流但已有部分内容 → 用已有内容（截断的由上层兜底报错）
  } finally {
    link.cleanup();
  }

  if (!full.trim()) {
    // 流正常结束但没有内容：降级重试一次
    const again = await chatOnce({ provider: { ...provider, chatModel: useModel }, messages, signal, temperature, maxTokens });
    if (onDelta) onDelta(again.content);
    return { content: again.content, usage: null, degraded: true };
  }
  return { content: full, usage: null, reasoning };
}

/**
 * 测试连接：GET /v1/models（经 Worker）。同时验证 Worker、Key、baseUrl。
 * 返回 { ok, latencyMs, error }
 */
export async function testProvider(provider) {
  const started = performance.now();
  try {
    const base = await workerUrl();
    const res = await fetch(`${base}/v1/models`, {
      headers: { 'Authorization': `Bearer ${provider.apiKey}`, 'X-Api-Base': provider.baseUrl },
    });
    if (!res.ok) {
      let msg = '';
      try { msg = (await res.json())?.error?.message || ''; } catch { /* ignore */ }
      return { ok: false, latencyMs: Math.round(performance.now() - started), error: friendlyError(res.status, msg) };
    }
    await res.json(); // 能解析即可
    return { ok: true, latencyMs: Math.round(performance.now() - started), error: null };
  } catch (err) {
    return { ok: false, latencyMs: Math.round(performance.now() - started), error: `连不上：${err.message}（检查 Worker 地址与网络）` };
  }
}

/** 只测 Worker 本身（不需要 key）：非法方法应得到 Worker 的 JSON 响应而非网络错误 */
export async function testWorker() {
  try {
    const base = await workerUrl();
    const res = await fetch(base, { method: 'GET' });
    // Worker 对根路径返回 JSON（404/403 都说明 Worker 活着）
    const text = await res.text();
    try { JSON.parse(text); return { ok: true, status: res.status }; }
    catch { return { ok: false, error: '地址有响应但不是本项目的 Worker，请确认部署的是 worker/proxy.js' }; }
  } catch (err) {
    return { ok: false, error: `连不上该地址：${err.message}` };
  }
}
