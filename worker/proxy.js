/**
 * Train Master — Cloudflare Worker 转发层
 *
 * 作用：DeepSeek 等服务商的 API 不允许网页直接调用（CORS 限制），
 *       本 Worker 做纯透传：加 CORS 头、转发请求、原样回传（含 SSE 流）。
 * 安全：无状态、不存储 API Key（Key 由浏览器每次请求经 Authorization 头透传）；
 *       仅允许 ALLOWED_ORIGINS 白名单内的来源，防止被当成开放代理。
 *
 * 部署：见 docs/部署指南-Cloudflare-Worker.md
 * 环境变量：
 *   ALLOWED_ORIGINS   逗号分隔的允许来源，如 https://li-baixi.github.io,http://localhost:8000
 *   ALLOWED_API_BASES （可选）逗号分隔的允许上游，如 https://api.deepseek.com —— 建议设置
 */

const DEFAULT_API_BASE = 'https://api.deepseek.com';

const CORS_HEADERS = {
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Api-Base, Accept',
  'Access-Control-Max-Age': '86400',
};

function jsonResp(status, obj, origin) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': origin || '*',
      ...CORS_HEADERS,
    },
  });
}

function splitList(s) {
  return (s || '').split(',').map(x => x.trim()).filter(Boolean);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';

    // 1) 预检
    if (request.method === 'OPTIONS') {
      const allowed = splitList(env.ALLOWED_ORIGINS);
      if (origin && allowed.includes(origin)) {
        return new Response(null, {
          status: 204,
          headers: { 'Access-Control-Allow-Origin': origin, ...CORS_HEADERS },
        });
      }
      return new Response(null, { status: 403 });
    }

    // 2) 仅放行 /v1/* 的 GET（models 测试）与 POST（chat/completions）
    if (!url.pathname.startsWith('/v1/')) {
      return jsonResp(404, { error: { message: 'Train Master 代理已运行。仅支持 /v1/* 接口。' } }, origin);
    }
    if (request.method !== 'GET' && request.method !== 'POST') {
      return jsonResp(405, { error: { message: '仅支持 GET/POST' } }, origin);
    }

    // 3) Origin 白名单（防开放代理）
    const allowedOrigins = splitList(env.ALLOWED_ORIGINS);
    if (origin && allowedOrigins.length && !allowedOrigins.includes(origin)) {
      return jsonResp(403, { error: { message: '来源不在白名单：请在 Worker 的 ALLOWED_ORIGINS 变量中加入 ' + origin } }, origin);
    }

    // 4) 上游地址：X-Api-Base 头 → 默认 DeepSeek；可选上游白名单
    let apiBase = (request.headers.get('X-Api-Base') || DEFAULT_API_BASE).replace(/\/+$/, '');
    if (!/^https:\/\//.test(apiBase)) {
      return jsonResp(400, { error: { message: 'X-Api-Base 必须是 https:// 开头' } }, origin);
    }
    const allowedBases = splitList(env.ALLOWED_API_BASES).map(b => b.replace(/\/+$/, ''));
    if (allowedBases.length && !allowedBases.includes(apiBase)) {
      return jsonResp(403, { error: { message: '上游不在 ALLOWED_API_BASES 白名单内：' + apiBase } }, origin);
    }

    // 5) 组装上游请求：去掉 /v1 前缀（约定 baseUrl 已含版本段，如 OpenAI 填 https://api.openai.com/v1）
    const upstream = new URL(apiBase + url.pathname.replace(/^\/v1/, '') + url.search);
    const headers = new Headers();
    for (const key of ['Authorization', 'Content-Type', 'Accept']) {
      const v = request.headers.get(key);
      if (v) headers.set(key, v);
    }

    let upstreamResp;
    try {
      // 请求体很小（JSON），直接缓冲转发，避免流式 body 的兼容性问题
      const body = request.method === 'POST' ? await request.text() : undefined;
      upstreamResp = await fetch(upstream, {
        method: request.method,
        headers,
        body,
        redirect: 'manual',
      });
    } catch (err) {
      return jsonResp(502, { error: { message: '上游请求失败：' + (err && err.message || err) + '（检查 baseUrl 是否正确）' } }, origin);
    }

    // 6) 原样回传 + CORS 头
    const respHeaders = new Headers(upstreamResp.headers);
    respHeaders.set('Access-Control-Allow-Origin', origin || allowedOrigins[0] || '*');
    for (const [k, v] of Object.entries(CORS_HEADERS)) respHeaders.set(k, v);
    respHeaders.delete('content-encoding'); // 避免双重压缩问题
    respHeaders.delete('content-length');

    return new Response(upstreamResp.body, {
      status: upstreamResp.status,
      headers: respHeaders,
    });
  },
};
