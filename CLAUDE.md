# CLAUDE.md — Train Master 项目约定

本项目用户**没有代码能力**，所有开发由 AI 完成。修改代码前先读 `docs/架构说明.md`。

## 项目是什么

个人健身/饮食规划 PWA（中文、iPhone 主用）。纯静态无构建：vanilla JS (ES modules) + hash 路由，托管 GitHub Pages（`https://li-baixi.github.io/trainmaster/`，子路径！全站必须用相对路径 `./`）。数据 100% 存 IndexedDB（虚拟 md 文件系统），AI 调用经用户自部署的 Cloudflare Worker（`worker/proxy.js`）。

## 硬性约定（违反会出线上事故）

1. **改任何前端资产（html/css/js/图标）必须递增 `sw.js` 顶部 `VERSION`**；新增文件要加进 `PRECACHE` 列表
2. UI 全中文，错误提示必须告诉用户「去哪里点能解决」，不要暴露技术细节
3. 渲染任何 markdown（用户输入/AI 输出）必须走 `js/ui/markdown.js`（内置 DOMPurify 消毒）
4. AI 写入档案/计划必须经用户确认（提案卡/确认框），且旧版归档到 `versions/`
5. API Key 只存本机 IndexedDB：**绝不**写入导出内容
6. vendor/ 两个库（marked/DOMPurify）版本固定，升级=官网下载新版整文件覆盖

## 常用命令

```bash
# 本地起服务（用户验收用，浏览器开 http://localhost:8000）
cd "E:\train master" && python -m http.server 8000

# 发布前语法自查
node --check js/xxx.js  （每个改动过的文件）

# 提交发布
git add -A && git commit -m "..." && git push
# push 后 GitHub Actions 自动部署，1-2 分钟后线上生效
```

## 数据路径约定（IndexedDB files 仓）

`profile.md`（档案）· `plans/current.md`（当前计划）· `versions/plans|profile/*.md`（历史）· `logs/YYYY-MM-DD.md`（当日日志：对话段 + 餐食段含 ```meal 围栏）。

## AI 协议要点

- 五段式 system prompt 在 `js/ai/context.js`；围栏协议：```plan（新计划全文）、```mealjson（识餐结果）、```profile（档案）
- Worker 路径约定：浏览器请求 `/v1/chat/completions`，Worker 去掉 `/v1` 拼到 `X-Api-Base`。所以 provider.baseUrl 不含 /v1（DeepSeek 填 `https://api.deepseek.com`；OpenAI 官方填 `https://api.openai.com/v1`）
- DeepSeek 模型名可能更新（当前默认 chat=deepseek-flash / vision=deepseek-flash，2026-10 官方在售：deepseek-flash、deepseek-v4-pro），改动默认值在 `js/settings.js`，设置页可覆盖

## 用户协作事项

用户需要手动做的只有三件：开 Pages（网页点几下）、部署 Worker（照 docs 指南）、iPhone 验收（照 docs/使用指南 清单）。其余都是 AI 的事。
