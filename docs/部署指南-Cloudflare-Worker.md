# 部署指南：Cloudflare Worker 转发层（一次性，约 5 分钟）

> **为什么需要这一步**：DeepSeek 等服务商的 API 不允许网页直接调用（浏览器的 CORS 安全限制）。所以需要一个架在 Cloudflare 上的"转发员"，它只做一件事：把 App 的请求原样转给 DeepSeek，再把回复传回来。**免费**（个人每天 10 万次额度，用不完），**只需做一次**，之后不用再管。

---

## 第 1 步：注册 Cloudflare 账号（免费）

1. 手机或电脑浏览器打开 **workers.cloudflare.com**
2. 点 **Get started / 开始使用** → **Sign up / 注册**（有 Google 账号可直接用 Google 登录）
3. 邮箱验证完成后进入控制台

> 不需要绑卡，免费版够用。

## 第 2 步：创建 Worker

1. 进入控制台后，点 **Create Worker / 创建 Worker**（如果第一次进，可能先让你选 Workers & Pages，一样）
2. 名字改成 **`trainmaster-proxy`**（也可以随便起，但要记住）
3. 先不管模板里的代码，直接点右下角 **Deploy / 部署**
4. 部署成功后，点 **Edit code / 编辑代码**

## 第 3 步：粘贴代码

1. 把编辑器里的模板代码**全部删除**（Ctrl+A → Delete）
2. 打开本仓库的 `worker/proxy.js` 文件，**全选复制**，粘贴进编辑器
3. 点右上角 **Deploy / 部署**
4. 看到 "Success / 成功" 即可

## 第 4 步：设置允许的来源（重要！）

1. 回到 Worker 概览页，点 **Settings / 设置**
2. 找到 **Variables and Secrets / 变量与机密**，点 **Add / 添加**
3. 变量名填：`ALLOWED_ORIGINS`
   变量值填：
   ```
   https://li-baixi.github.io,http://localhost:8000
   ```
   （逗号分隔，不要有空格；第一个是你将来 App 的网址，第二个是电脑本地测试用）
4. 保存后，**回到 Edit code 随便再点一次 Deploy**（让变量生效，这是 Cloudflare 的一个小怪癖，改了变量最好重新部署一次）

**可选加固**（建议）：再加一个变量 `ALLOWED_API_BASES`，值为 `https://api.deepseek.com`。这样这个 Worker 只会转发给 DeepSeek，将来如果添加其他服务商，在值里追加逗号+新地址即可。

## 第 5 步：拿到 Worker 地址

1. Worker 概览页顶部能看到地址，形如：
   ```
   https://trainmaster-proxy.你的子域.workers.dev
   ```
2. 复制它

## 第 6 步：填进 App 并验证

1. 打开 App → **我的 → 设置**
2. **转发地址** 输入框粘贴 Worker 地址
3. 点 **测试 Worker** —— 看到 "Worker 正常" 就成功了
4. 再到「模型服务」里填好 API Key，点 **测试连接** —— 看到 "连接成功" 全部搞定 🎉

---

## 常见问题

| 问题 | 处理 |
|---|---|
| 找不到 Deploy 按钮 | 界面偶有改版，找蓝色的部署/保存按钮即可 |
| 改了变量没生效 | 回到 Edit code 再点一次 Deploy |
| 测试 Worker 报"连不上" | 检查地址是否复制完整（以 `.workers.dev` 结尾），以及手机网络 |
| 测试连接报 403 来源不在白名单 | `ALLOWED_ORIGINS` 里没包含你当前打开 App 的网址——把网址加进去（逗号分隔），重新 Deploy |
| 以后换了 App 网址 | 记得同步更新 `ALLOWED_ORIGINS` |
| 免费额度会超吗 | 每天 10 万次，个人聊天+拍照每天几百次都不到 1% |

## 它安全吗？

- 你的 API Key **不会**存在 Cloudflare 上（每次请求由你的手机带着 Key 通过它转发，Worker 不保存）
- 别人即使知道你的 Worker 地址，也会因为来源不在白名单被拒绝（403）
