# 部署指南：Cloudflare Worker 转发层（一次性，约 5 分钟）

> **为什么需要这一步**：DeepSeek 等服务商的 API 不允许网页直接调用（浏览器的 CORS 安全限制）。所以需要一个架在 Cloudflare 上的"转发员"，它只做一件事：把 App 的请求原样转给 DeepSeek，再把回复传回来。**免费**（个人每天 10 万次额度，用不完），**只需做一次**，之后不用再管。

---

## 第 1 步：注册 Cloudflare 账号（免费）

1. 手机或电脑浏览器打开 **workers.cloudflare.com**
2. 点 **Get started / 开始使用** → **Sign up / 注册**（有 Google 账号可直接用 Google 登录）
3. 邮箱验证完成后进入控制台

> 不需要绑卡，免费版够用。

## 第 2 步：创建 Worker

> Cloudflare 界面经常改版，按钮名字可能略有出入，中英文界面叫法不同。下面每一步都给了中/英两种叫法，找不到完全一致的按钮时，找**意思最接近**的那个。

1. 进入控制台后，点左侧菜单 **Workers & Pages**
2. 点右上角（或页面中间）的 **Create application / 创建应用程序** 按钮
   - 找不到的话：也可能叫 **Create / 创建**，是个蓝色大按钮
3. 这时会进入「选择类型」页面，有两个标签页：**Workers** 和 **Pages**
   - ⚠️ **选 Workers 标签页**（不要选 Pages！）
4. 在 Workers 标签页下，点 **Create Worker / 创建 Worker** 大按钮
   - 有的版本是先看到一个模板列表（Hello World 等），直接用默认的就行，什么都不用选
   - 如果有 **Import a repository / 导入存储库** 的选项——**不要点**，我们不用那个
5. 这时会出现给 Worker 起名的页面：
   - 名字输入框里会有一个随机名字（像 `sparkling-firefly-1a2b` 这种），把它**清空**，改成 **`trainmaster-proxy`**
   - 改名后注意下面显示的地址会跟着变，应该是 `trainmaster-proxy.你的子域.workers.dev`
6. 点 **Deploy / 部署** 按钮（右下角，蓝色）
7. 看到 "Successfully deployed / 部署成功" 和烟花/对勾动画后，点 **Edit code / 编辑代码** 按钮
   - 如果没看到这个按钮，就点 Worker 名字进入详情，找「编辑代码」

## 第 3 步：粘贴代码

1. 现在你在代码编辑器页面（左边有小文件列表，中间是大片代码区）
2. 先**新开一个浏览器标签页**，打开我们仓库里的代码文件：
   **https://github.com/Li-Baixi/trainmaster/blob/main/worker/proxy.js**
3. 在这个 GitHub 页面，点文件内容右上角的**复制按钮**（一个方形叠着方形的图标，鼠标悬停显示 "Copy raw file / 复制原始文件"）
   - 找不到复制按钮就点 "Raw / 原始文件" 按钮，进入纯文本页后 Ctrl+A 全选 → Ctrl+C 复制
4. 回到 Cloudflare 编辑器：点一下代码区，**Ctrl+A 全选 → Delete 删除**（把 Hello World 模板删光）
5. **Ctrl+V 粘贴**我们的代码
6. 点右上角（或右下角）的 **Deploy / 部署** 按钮
7. 看到 "Successfully deployed / 部署成功" 即可，点返回（←）退出编辑器

## 第 4 步：设置允许的来源（重要！）

1. 现在回到 Worker 的概览页（点 Worker 名字 `trainmaster-proxy` 进入的那个页面）
2. 点 **Settings / 设置**（Worker 详情里的标签页，不是网站左下角的全局设置）
3. 找到 **Variables and Secrets / 变量与机密** 区域（有的版本在「设置」页里滚动就能看到；有的版本藏在 **Bindings / 绑定** 附近），点 **Add / 添加**（或 **Create variable / 创建变量**）
   - 如果弹出选项让你选类型（Designer 设计器 / Secret 加密 / JSON），选 **Designer / 设计器**（就是普通明文变量）
4. 第一格「变量名 / Type」填：`ALLOWED_ORIGINS`
   第二格「值 / Value」填：
   ```
   https://li-baixi.github.io,http://localhost:8000
   ```
   （一行填完，逗号分隔，**不要有空格**；第一个是你 App 的网址，第二个是电脑本地测试用）
5. 点 **Save / Deploy / 保存并部署**（页面下方或右下角）

**可选加固**（建议）：用同样方法再加一个变量 `ALLOWED_API_BASES`，值为 `https://api.deepseek.com`。这样这个 Worker 只会转发给 DeepSeek；将来添加其他服务商时，在值里追加逗号+新地址即可。

## 第 5 步：拿到 Worker 地址

1. 回到 Worker 概览页（点左上角 Worker 名字 `trainmaster-proxy`）
2. 页面上能看到你的专属地址，形如：
   ```
   https://trainmaster-proxy.你的子域.workers.dev
   ```
   - 位置可能在顶部、右侧「访问 / Visit」链接旁，或 **Settings → Domains & Routes / 域和路由** 里
   - 也可以直接点 **Visit / 访问** 在新标签页打开，地址栏里的网址就是它（页面会显示一段 JSON 文字，这是正常的，说明 Worker 活着）
3. 完整复制这个地址（以 `.workers.dev` 结尾）

## 第 6 步：填进 App 并验证

1. 打开 App → **我的 → 设置**
2. **转发地址** 输入框粘贴 Worker 地址
3. 点 **测试 Worker** —— 看到 "Worker 正常" 就成功了
4. 再到「模型服务」里填好 API Key，点 **测试连接** —— 看到 "连接成功" 全部搞定 🎉

---

## 常见问题

| 问题 | 处理 |
|---|---|
| 只有「Create application / 创建应用程序」没有「Create Worker」 | 正常，新界面改版了：点 Create application → 选 **Workers** 标签页 → 里面才有 Create Worker |
| 「Create application」里让我选 Workers 还是 Pages | 选 **Workers**（Pages 是给建网站用的，不是我们要的） |
| 看到模板选择列表（Hello World 等） | 用默认的就行，什么都不用选，直接下一步 |
| 看到「Import a repository / 导入存储库」 | 不要点，我们不用 GitHub 连接方式 |
| 找不到 Deploy 按钮 | 界面偶有改版，找蓝色的部署/保存按钮即可 |
| 改了变量没生效 | 回到 Edit code 再点一次 Deploy |
| 测试 Worker 报"连不上" | 检查地址是否复制完整（以 `.workers.dev` 结尾），以及手机网络 |
| 测试连接报 403 来源不在白名单 | `ALLOWED_ORIGINS` 里没包含你当前打开 App 的网址——把网址加进去（逗号分隔），重新 Deploy |
| 以后换了 App 网址 | 记得同步更新 `ALLOWED_ORIGINS` |
| 免费额度会超吗 | 每天 10 万次，个人聊天+拍照每天几百次都不到 1% |

## 它安全吗？

- 你的 API Key **不会**存在 Cloudflare 上（每次请求由你的手机带着 Key 通过它转发，Worker 不保存）
- 别人即使知道你的 Worker 地址，也会因为来源不在白名单被拒绝（403）
