# Train Master · 训练大师

个人健身与饮食规划 PWA。AI 教练永远记得你的情况——档案、计划、每天吃了什么聊了什么，全部以 markdown 文件存在你自己的手机里。

## 特性

- 🧠 **AI 永远记得你**：每次对话自动注入个人档案 + 当前计划 + 最近动态
- 📋 **问卷生成方案**：首次使用 5 步问卷 → 生成个人档案与训练饮食计划；之后对话动态调整（确认后生效、自动归档旧版、可恢复）
- 📷 **拍照识餐**：拍一张照片 → 识别食物、估算热量营养 → 结合你的计划说怎么吃 → 一键记录
- 🏋️ **器械指导**：拍器械照问用法，教练给动作讲解
- 💬 **流式对话**：支持 DeepSeek 及任意 OpenAI 兼容服务商，可随时切换
- 📁 **数据归你**：全部数据是本地 md 文件，一键导出到 iPhone「文件」App，导入即恢复
- 📱 **PWA**：Safari 添加到主屏幕，像原生 App 一样用，离线可看

## 文档

| 文档 | 内容 |
|---|---|
| [docs/使用指南.md](docs/使用指南.md) | 用户手册：安装、日常使用、备份习惯 |
| [docs/部署指南-GitHub-Pages.md](docs/部署指南-GitHub-Pages.md) | 发布 App 网址（一次性） |
| [docs/部署指南-Cloudflare-Worker.md](docs/部署指南-Cloudflare-Worker.md) | 部署转发层（一次性，约5分钟） |
| [docs/架构说明.md](docs/架构说明.md) | 架构与维护约定（供 AI 维护参考） |

## 技术一览

纯静态无构建（vanilla JS ES modules + hash 路由）· IndexedDB 虚拟 md 文件系统 · marked + DOMPurify（vendor）· Cloudflare Worker 透传（解决 AI 服务商 CORS）· GitHub Actions → Pages 自动部署 · Service Worker 离线缓存。
