// Service Worker：app shell 预缓存 + 版本整批更新
// 规则（CLAUDE.md 也有记录）：改动任何前端资产后必须递增 VERSION！

const VERSION = 'tm-2026-10-14-1';
const CACHE_NAME = `trainmaster-${VERSION}`;

const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './vendor/marked.min.js',
  './vendor/purify.min.js',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/apple-touch-icon.png',
  './js/main.js',
  './js/router.js',
  './js/db.js',
  './js/vfs.js',
  './js/settings.js',
  './js/utils/format.js',
  './js/ai/client.js',
  './js/ai/context.js',
  './js/ai/image.js',
  './js/services/logs.js',
  './js/services/plans.js',
  './js/services/chat.js',
  './js/services/meals.js',
  './js/services/onboarding.js',
  './js/services/backup.js',
  './js/ui/markdown.js',
  './js/ui/components.js',
  './js/ui/mealcapture.js',
  './js/ui/pages/today.js',
  './js/ui/pages/chat.js',
  './js/ui/pages/plans.js',
  './js/ui/pages/profile.js',
  './js/ui/pages/records.js',
  './js/ui/pages/settings.js',
  './js/ui/pages/onboarding.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // AI 请求（跨域 / POST）一律直连，永不缓存
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  // 页面导航：缓存兜底（离线可开）
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('./index.html'))
    );
    return;
  }

  // 同源静态资源：cache-first
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(res => {
        // 顺手缓存成功响应
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
        }
        return res;
      }).catch(() => cached);
    })
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});
