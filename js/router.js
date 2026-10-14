// hash 路由：#/today #/chat #/plans #/profile #/records #/settings #/onboarding

const routes = new Map();
let currentPage = null;
let lastPath = null;

export function registerRoute(path, page) {
  routes.set(path, page);
}

export function navigate(path) {
  location.hash = '#/' + path.replace(/^#?\/?/, '');
}

function parseHash() {
  const h = location.hash.replace(/^#\/?/, '');
  const [path, query] = h.split('?');
  const params = new URLSearchParams(query || '');
  return { path: path || 'today', params };
}

export function currentRoute() {
  return parseHash();
}

async function render() {
  const { path, params } = parseHash();
  const page = routes.get(path) || routes.get('today');
  const app = document.getElementById('app');

  if (currentPage && typeof currentPage.destroy === 'function') {
    try { currentPage.destroy(); } catch { /* ignore */ }
  }
  currentPage = null;
  app.innerHTML = '';

  // 底部导航高亮
  document.querySelectorAll('.tab').forEach(a => {
    a.classList.toggle('active', a.dataset.route === path);
  });

  currentPage = page;
  lastPath = path;
  try {
    await page.render(app, params);
  } catch (err) {
    console.error('页面渲染失败', err);
    app.innerHTML = `<div class="card"><div class="md">⚠️ 页面出错了：${String(err && err.message || err)}</div></div>`;
  }
  window.scrollTo(0, 0);
}

export function initRouter() {
  window.addEventListener('hashchange', render);
  return render();
}
