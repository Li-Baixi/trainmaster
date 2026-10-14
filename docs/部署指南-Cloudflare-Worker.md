# Cloudflare Worker 转发层（已部署完成 ✅）

> **状态**：2026-10-14 部署完成并验证通过。
> **地址**：`https://trainmaster.lbx984537487.workers.dev`
> **部署方式**：Worker 连接了 GitHub 仓库 `Li-Baixi/trainmaster`，**每次推送代码到 main 分支，Cloudflare 会自动重新部署**，无需手动操作。

---

## 为什么需要它

DeepSeek 等 AI 服务商不允许网页直接调用（浏览器的 CORS 安全限制）。这个架在 Cloudflare 上的"转发员"只做一件事：把 App 的请求原样转给 DeepSeek，再把回复传回来。免费（每天 10 万次额度，个人用不到 1%），且不保存你的 API Key。

## 它是怎么部署的（了解即可，不用操作）

1. 仓库根目录有 `wrangler.jsonc` 配置文件，指定了 Worker 的入口是 `worker/proxy.js`
2. Cloudflare 检测到仓库更新 → 自动构建 → 自动部署到上面的地址
3. 允许的来源（`ALLOWED_ORIGINS`）和允许转发的服务商（`ALLOWED_API_BASES`）都写在 `wrangler.jsonc` 里
4. **以后 AI 改了转发代码，只要推送到 GitHub，1~3 分钟后自动生效**

## 已验证的项目（2026-10-14）

| 测试 | 结果 |
|---|---|
| 访问 Worker 地址返回运行提示 | ✅ |
| App 网址的跨域预检（CORS） | ✅ 正常放行 |
| 非白名单网址访问 | ✅ 被 403 拒绝 |
| 真实转发到 DeepSeek | ✅ 请求已到达 DeepSeek 服务器 |

## 怎么用

打开 App → **我的 → 设置**：
1. **转发地址** 填：`https://trainmaster.lbx984537487.workers.dev` → 点「测试 Worker」
2. **模型服务** 里填 DeepSeek API Key → 点「测试连接」

## 常见问题

| 问题 | 处理 |
|---|---|
| 测试 Worker 报"连不上" | 检查地址是否复制完整（以 `.workers.dev` 结尾）；稍等 1 分钟再试（刚推送过代码时在重新部署） |
| 测试连接报 401 | API Key 填错了，去 [DeepSeek 平台](https://platform.deepseek.com) 重新复制 |
| 测试连接报 403 来源不在白名单 | 换了 App 网址/换了打开方式——把新网址加进 `wrangler.jsonc` 的 `ALLOWED_ORIGINS`（逗号分隔）并推送，让 AI 改 |
| 想添加其他 AI 服务商 | 把服务商 API 地址加进 `ALLOWED_API_BASES`（逗号分隔）并推送，让 AI 改 |
| 怀疑 Worker 出问题 | 浏览器直接打开 Worker 地址，看到「Train Master 代理已运行」就是正常的 |

## 附录：手动部署方式（备用，一般用不到）

如果不采用仓库自动部署，也可以手动创建：

1. Cloudflare 控制台 → **Workers & Pages** → **Create application** → 选 **Workers** 标签页 → **Create Worker**
2. 起名（如 `trainmaster-proxy`）→ Deploy → Edit code
3. 全选删掉模板代码，粘贴 https://github.com/Li-Baixi/trainmaster/blob/main/worker/proxy.js 的内容 → Deploy
4. Settings → Variables and Secrets → 添加 `ALLOWED_ORIGINS` = `https://li-baixi.github.io,http://localhost:8000`
5. 复制 `.workers.dev` 结尾的地址填进 App

## 它安全吗？

- 你的 API Key **不会**存在 Cloudflare 上（每次请求由你的手机带着 Key 通过它转发，Worker 不保存）
- 别人即使知道你的 Worker 地址，也会因为来源不在白名单被拒绝（403）
- 只允许转发到白名单里的 AI 服务商地址
