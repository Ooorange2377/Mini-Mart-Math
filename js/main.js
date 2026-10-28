/* 全局初始化与页面路由：state.screen ∈ {start, map, game, shop, skins}，#app 子树整体替换。 */
window.ZQ = window.ZQ || {};

(function () {
  /* 首页按返回键的「再按一次退出」判定时间戳（离开首页即清零） */
  var backExitAt = 0;
  var BACK_EXIT_WINDOW = 2500;

  /** 竖屏提示文案（语言切换后重新填充） */
  function syncRotateTip() {
    var tip = document.querySelector('.rotate-tip');
    if (!tip) return;
    tip.querySelector('.rotate-tip-title').textContent = ZQ.I18N.rotateTitle;
    tip.querySelector('.rotate-tip-text').textContent = ZQ.I18N.rotateText;
    tip.querySelector('.rotate-tip-btn').textContent = ZQ.I18N.rotateContinue;
  }

  /** 竖屏提示：本会话只提示一次；点「仍要继续」或旋转到横屏后不再弹 */
  function bindRotateTip() {
    var tip = document.querySelector('.rotate-tip');
    if (!tip) return;
    var seenPortrait = window.matchMedia('(orientation: portrait)').matches;
    function dismiss() { tip.classList.add('is-dismissed'); }
    tip.querySelector('.rotate-tip-btn').addEventListener('click', function () {
      ZQ.audio.back();
      dismiss();
    });
    var mq = window.matchMedia('(orientation: portrait)');
    function onChange() {
      if (mq.matches) { seenPortrait = true; return; }
      if (seenPortrait) dismiss();   // 已经提示过，转回竖屏也不再打扰
    }
    if (mq.addEventListener) mq.addEventListener('change', onChange);
    else mq.addListener(onChange);
  }

  /** 触摸长按素材时屏蔽系统菜单，其他地方保留桌面右键习惯 */
  function bindContextMenu() {
    document.addEventListener('contextmenu', function (e) {
      if (e.target.closest && e.target.closest('.slot, .cart-item, .skin-card, .hall-mom, .card-icon')) {
        e.preventDefault();
      }
    });
  }

  /** 浏览器返回键兜底：屏幕级切换入栈，弹窗只关弹窗不跳屏。
   *  不做这件事时 Android 返回键会直接退出游戏，用户看到的是空白页。 */
  function bindHistory() {
    history.replaceState({ zq: 1, screen: ZQ.state.screen }, '', '#' + ZQ.state.screen);
    window.addEventListener('popstate', function () {
      var layer = document.getElementById('modal-layer');
      var hasModal = layer && layer.children.length;
      if (hasModal) {
        // 仪式动画可被点击跳过，但不在这里强制拆除（中途销毁会让定时器引用已移除节点）
        if (document.querySelector('.modal-mask.is-ceremony')) {
          history.pushState({ zq: 1, screen: ZQ.state.screen }, '', '#' + ZQ.state.screen);
          return;
        }
        history.pushState({ zq: 1, screen: ZQ.state.screen }, '', '#' + ZQ.state.screen);
        if (document.querySelector('.modal-result') && ZQ.screens.result) ZQ.screens.result.close();
        else if (document.querySelector('.modal-simple') && ZQ.screens.start) ZQ.screens.start.close();
        else layer.innerHTML = '';
        return;
      }
      if (ZQ.state.screen === 'game') { ZQ.app.go('map', { noHistory: true }); return; }
      if (ZQ.state.screen !== 'start') { ZQ.app.go('start', { noHistory: true }); return; }
      /* 已在开始页：浏览器已把最后一条历史 pop 掉，若不再补一条，再按就会离开页面（空白页）。
       * 做法同 Android 惯例：首次补历史 + 提示「再按一次返回键退出游戏」，
       * 2.5 秒内再按则不补、让浏览器按原有栈退出。 */
      var now = Date.now();
      if (backExitAt && now - backExitAt < BACK_EXIT_WINDOW) {
        backExitAt = 0;
        return;
      }
      backExitAt = now;
      history.pushState({ zq: 1, screen: 'start' }, '', '#start');
      ZQ.ui.toast.show(ZQ.I18N.backExitHint, 2000);
    });
  }

  function boot() {
    ZQ.store.load();
    var d = ZQ.store.data;
    ZQ.setLang((d.settings && d.settings.lang) || 'zh');
    ZQ.audio.setEnabled(!(d.settings && d.settings.sound === false));
    ZQ.audio.setMusicEnabled(!(d.settings && d.settings.music === false));
    /* 浏览器要求先有用户手势才能出声：首次任意点击即解锁并起播 BGM。
     * 之后的点击继续调用 kick()，用于系统中断/后台返回后恢复上下文。 */
    document.addEventListener('pointerdown', function () { ZQ.audio.unlock(); }, { once: true });
    document.addEventListener('pointerdown', function () { ZQ.audio.kick(); });

    bindContextMenu();
    bindRotateTip();

    ZQ.state = { screen: 'start' };
    bindHistory();
    render();
  }

  /** 生成当前页视图；页面尚未实现时返回 null（保持当前画面，避免出现空白） */
  function viewFor(state) {
    var S = ZQ.screens;
    switch (state.screen) {
      case 'start': return S.start ? S.start.render() : null;
      case 'map':   return S.map ? S.map.render() : null;
      case 'game':  return S.game.render(state.levelId, state.seed);
      case 'shop':  return S.shop ? S.shop.render() : null;
      case 'skins': return S.skins ? S.skins.render() : null;
    }
    return null;
  }

  function render() {
    var app = document.getElementById('app');
    if (!app) return;

    var view = viewFor(ZQ.state);
    if (!view) return;

    app.innerHTML = '';
    app.appendChild(view);
    syncRotateTip();
    ZQ.audio.bgm(ZQ.state.screen);
  }

  ZQ.app = {
    render: render,
    /** 路由跳转；opts.seed 省略即清除旧种子（让关卡按固定题/重新出题规则取题）
     *  opts.noHistory：浏览器返回键触发的跳转，不再入栈（否则会形成回不去的循环） */
    go: function (screen, opts) {
      opts = opts || {};
      ZQ.state.screen = screen;
      backExitAt = 0;
      if (opts.levelId) ZQ.state.levelId = opts.levelId;
      ZQ.state.seed = opts.seed;
      if (!opts.noHistory) {
        history.pushState({ zq: 1, screen: screen }, '', '#' + screen);
      } else {
        /* 返回键驱动的跳转：不新增历史条目，否则会形成「返回→再进」的死循环；
         * 用 replaceState 让地址栏与当前画面保持一致。 */
        history.replaceState({ zq: 1, screen: screen }, '', '#' + screen);
      }
      render();
    },
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
