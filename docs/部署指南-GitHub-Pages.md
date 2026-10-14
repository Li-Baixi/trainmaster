# 部署指南：GitHub Pages（App 的网址）

> 仓库推送到 GitHub 后，Pages 会自动把 App 发布成一个网页。**免费**，带 HTTPS（PWA 必需）。
> 本仓库已配好自动部署（`.github/workflows/deploy.yml`），你只需要开一次开关。

## 第 1 步：确认代码已推送

本地 `E:\train master` 的代码已提交并推送到 `https://github.com/Li-Baixi/trainmaster` 的 `main` 分支。

## 第 2 步：开启 Pages（一次性）

1. 打开仓库页面：**https://github.com/Li-Baixi/trainmaster**
2. 点顶部 **Settings / 设置**
3. 左侧菜单找 **Pages**
4. 在 **Build and deployment / 构建和部署** 下的 **Source / 来源**，选择 **GitHub Actions**（⚠️ 不要选 "Deploy from a branch"）
5. 完成。之后每次推送代码，Actions 会自动重新发布

## 第 3 步：等待首次发布

1. 仓库顶部点 **Actions** 标签
2. 应该能看到一个正在运行（黄色转圈）或已完成（绿色对勾）的 "Deploy to GitHub Pages"
3. 绿色对勾后，打开网址：

   **https://li-baixi.github.io/trainmaster/**

4. 能看到「训练大师」欢迎页即成功

## 第 4 步：iPhone 上安装成 App

见 `使用指南.md` 的「添加到主屏幕」一节。

---

## 常见问题

| 问题 | 处理 |
|---|---|
| Actions 红叉 | 点进失败的运行看日志；通常是 Pages 未开启（回第 2 步）或 workflow 文件有问题 |
| 打开是 404 | Pages 还没部署完，等 1-2 分钟刷新；确认 Source 选的是 GitHub Actions |
| 改了代码手机上没更新 | App 内顶部会出现「有新版本」横幅，点立即更新；或关掉重开 |
| 想换仓库名/用户名 | 记得同步改 Cloudflare Worker 的 `ALLOWED_ORIGINS` |
