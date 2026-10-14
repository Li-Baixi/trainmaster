# worker/ — Cloudflare Worker 转发层

`proxy.js` 是需要部署到 Cloudflare Workers 的唯一组件（免费，一次性，约 5 分钟）。

**为什么需要**：DeepSeek 等服务商的 API 不允许网页直接调用（浏览器 CORS 限制）。这个 Worker 只做透传：加上 CORS 头、把请求原样转给服务商、把回复（包括流式 SSE）原样传回网页。

**安全性**：Worker 不存储 API Key（浏览器每次请求时经 Authorization 头透传）；只允许 `ALLOWED_ORIGINS` 白名单内的来源调用，不会被人当成免费开放代理。

部署步骤见仓库 `docs/部署指南-Cloudflare-Worker.md`。
