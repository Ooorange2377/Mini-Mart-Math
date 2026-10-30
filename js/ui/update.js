/* PWA 版本更新提示：Service Worker 发现新版本后，在右下角弹一条可点击的非阻塞横幅。
 * 点一下 → 通知 waiting 的 Worker 接管 → 刷新页面。
 *
 * 关键约束：
 *   - 只在「已有 Worker 接管页面」时才提示（navigator.serviceWorker.controller 非空），
 *     否则首次安装也会弹，属于误报；
 *   - 不在关卡内弹（会挡住右上角道具与右下角结账），检测到更新就挂起，回到其他屏再显示；
 *   - 不主动刷新：只有玩家点了横幅才 reload，避免玩到一半被强制刷新；
 *   - file:// 双击通道不注册 SW，watch() 根本不会被调用，本模块全程静默。 */
window.ZQ = window.ZQ || {};
ZQ.ui = ZQ.ui || {};

(function () {
  var REFRESH_FALLBACK = 1200;   /* 点了刷新但 controllerchange 迟迟不来时的兜底 */
  var CHECK_GAP = 60000;         /* 回到前台主动检查更新（独立窗口长期不关时用）的最小间隔 */

  var registration = null;
  var waitingWorker = null;      /* 待接管的新 Worker；首装形态下为空 */
  var pending = false;           /* 已发现新版本，等合适的屏幕再展示 */
  var banner = null;
  var refreshing = false;        /* 玩家已点过横幅：此后 controllerchange 才跟随刷新 */
  var reloading = false;
  var lastCheck = 0;             /* 上次主动检查更新的时间戳 */

  function reloadOnce() {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  }

  /* 关卡内不打扰：横幅会压住右上角道具三连和右下角结账按钮 */
  function blockedByScreen() {
    return !!(ZQ.state && ZQ.state.screen === 'game');
  }

  function build() {
    var el = document.createElement('button');
    el.type = 'button';
    el.className = 'update-banner';
    el.hidden = true;
    el.addEventListener('click', function () {
      if (refreshing) return;
      refreshing = true;
      if (ZQ.audio && ZQ.audio.click) ZQ.audio.click();
      hide();
      if (waitingWorker) {
        try { waitingWorker.postMessage({ type: 'SKIP_WAITING' }); } catch (err) { /* 已接管时无需消息 */ }
      }
      /* waitingWorker 为空（新版本已被提前接管）时不会有 controllerchange，直接兜底刷新 */
      setTimeout(reloadOnce, REFRESH_FALLBACK);
    });
    document.body.appendChild(el);
    return el;
  }

  function show() {
    if (!banner) banner = build();
    banner.textContent = ZQ.I18N.updateToast;   /* 语言切换后重新填充文案 */
    banner.hidden = false;
    requestAnimationFrame(function () { banner.classList.add('is-in'); });
  }

  function hide() {
    if (!banner || banner.hidden) return;
    banner.classList.remove('is-in');
    banner.hidden = true;
  }

  /** 按当前屏幕决定显隐；由 main.js 每次渲染后调用 */
  function sync() {
    if (!pending) return;
    if (blockedByScreen()) hide();
    else show();
  }

  function note(worker) {
    pending = true;
    waitingWorker = worker || null;
    sync();
  }

  function watchWorker(worker) {
    if (!worker) return;
    if (worker.state === 'redundant') return;
    if (worker.state === 'installed') {
      /* controller 存在 = 页面上已有旧版本在跑，这次才是真正的更新；首装时为空，不提示 */
      if (navigator.serviceWorker.controller) note(worker);
      return;
    }
    worker.addEventListener('statechange', function () {
      if (worker.state === 'installed' && navigator.serviceWorker.controller) note(worker);
    });
  }

  function watch(reg) {
    if (!reg || !navigator.serviceWorker) return;
    registration = reg;

    /* 页面上次打开时就已经有等待中的 Worker（浏览器可能在本次 register 之前就发现了更新） */
    if (navigator.serviceWorker.controller && reg.waiting) note(reg.waiting);

    reg.addEventListener('updatefound', function () { watchWorker(reg.installing); });
    watchWorker(reg.installing);

    /* 只有玩家点过横幅才跟随接管刷新，否则保持旧版本继续玩 */
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (refreshing) reloadOnce();
    });

    /* 独立窗口可能长期不关，浏览器不一定会自己检查更新：每次回到前台主动查一次（限频） */
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState !== 'visible' || !registration) return;
      var now = Date.now();
      if (now - lastCheck < CHECK_GAP) return;
      lastCheck = now;
      var p = registration.update();
      if (p && p['catch']) p['catch'](function () { /* 离线/被墙时静默 */ });
    });
  }

  ZQ.ui.update = { watch: watch, sync: sync };
})();
