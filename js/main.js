// 应用入口：开 DB → 持久存储申请 → 注册路由 → SW → 首跳逻辑

import { openDB } from './db.js';
import { registerRoute, initRouter, navigate } from './router.js';
import { settings } from './settings.js';
import { todayPage } from './ui/pages/today.js';
import { chatPage } from './ui/pages/chat.js';
import { plansPage } from './ui/pages/plans.js';
import { profilePage } from './ui/pages/profile.js';
import { recordsPage } from './ui/pages/records.js';
import { settingsPage } from './ui/pages/settings.js';
import { onboardingPage } from './ui/pages/onboarding.js';

registerRoute('today', todayPage);
registerRoute('chat', chatPage);
registerRoute('plans', plansPage);
registerRoute('profile', profilePage);
registerRoute('records', recordsPage);
registerRoute('settings', settingsPage);
registerRoute('onboarding', onboardingPage);

async function boot() {
  await openDB();

  // 请求持久存储（降低 iOS 清理概率）
  try {
    if (navigator.storage && navigator.storage.persist) {
      await navigator.storage.persist();
    }
  } catch { /* ignore */ }

  // Service Worker（https 或 localhost 安全上下文）
  const isSecure = location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname);
  if ('serviceWorker' in navigator && isSecure) {
    try {
      const reg = await navigator.serviceWorker.register('./sw.js');
      // 更新检测
      reg.addEventListener('updatefound', () => { /* 等待中 */ });
      if (reg.waiting) showUpdateBanner(reg);
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (sessionStorage.getItem('tm-reloaded') !== '1') {
          sessionStorage.setItem('tm-reloaded', '1');
          location.reload();
        }
      });
      // 定时检查更新
      setInterval(() => reg.update().catch(() => {}), 6 * 60 * 60 * 1000);
    } catch (err) {
      console.warn('SW 注册失败（不影响使用）', err);
    }
  }

  // 首次使用跳向导（向导/设置页可自由进出，其余页面在完成前都回到向导）
  const onboardingDone = await settings.get('onboardingDone');
  const path = (location.hash || '').replace(/^#\/?/, '').split('?')[0];
  if (!onboardingDone && !['onboarding', 'settings'].includes(path)) {
    navigate('onboarding');
  }

  await initRouter();

  // iOS Safari 浏览器内访问 → 引导添加到主屏幕
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  if (isIOS && !standalone && !localStorage.getItem('tm-install-dismissed')) {
    const banner = document.getElementById('install-banner');
    banner.classList.remove('hidden');
    document.getElementById('install-close').addEventListener('click', () => {
      banner.classList.add('hidden');
      localStorage.setItem('tm-install-dismissed', '1');
    });
  }
}

function showUpdateBanner(reg) {
  const banner = document.getElementById('update-banner');
  banner.classList.remove('hidden');
  document.getElementById('update-btn').addEventListener('click', () => {
    reg.waiting && reg.waiting.postMessage({ type: 'SKIP_WAITING' });
  });
}

boot().catch(err => {
  console.error(err);
  const app = document.getElementById('app');
  app.innerHTML = `<div class="card"><div class="md">⚠️ 启动失败：${String(err && err.message || err)}</div></div>`;
});
