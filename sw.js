/* 最小可用 Service Worker：让浏览器认定「可安装」，并把素材放进缓存以便离线/秒进。
 * 策略：
 *   - 导航请求（HTML）走网络优先，失败回落缓存 —— 避免版本更新后还打开旧页面；
 *   - 图片/字体走缓存优先 —— 素材 URL 带 ?v= 版本号，换版本自然是新缓存键，不会发"钉子户"；
 *   - 其余静态资源走网络优先 + 缓存兜底。
 * 不做预缓存清单：素材多且带版本号，运行时缓存足够，也省掉维护成本。 */
'use strict';

var CACHE = 'zq-shell-v1';

self.addEventListener('install', function () {
  self.skipWaiting();
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; })
        .map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

function put(req, res) {
  if (!res || !res.ok || res.type === 'opaque') return res;
  var copy = res.clone();
  caches.open(CACHE).then(function (c) { c.put(req, copy); });
  return res;
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  /* 页面本身：网络优先，断网时回落缓存 */
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(function (r) { return put(req, r); })
        .catch(function () {
          return caches.match(req).then(function (m) { return m || caches.match('index.html'); });
        })
    );
    return;
  }

  /* 图片/字体：缓存优先（体积大、极少变，命中即秒开） */
  var isAsset = /\.(png|webp|jpg|jpeg|svg|gif|woff2?|ttf)$/i.test(url.pathname);
  if (isAsset) {
    e.respondWith(
      caches.match(req).then(function (m) {
        return m || fetch(req).then(function (r) { return put(req, r); });
      })
    );
    return;
  }

  /* 脚本/样式：网络优先，失败回落缓存 */
  e.respondWith(
    fetch(req).then(function (r) { return put(req, r); })
      .catch(function () { return caches.match(req); })
  );
});
