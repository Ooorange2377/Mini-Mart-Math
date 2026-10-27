/* 全局初始化与页面路由：state.screen ∈ {start, map, game, shop, skins}，#app 子树整体替换。 */
window.ZQ = window.ZQ || {};

(function () {
  function boot() {
    ZQ.store.load();
    var d = ZQ.store.data;
    ZQ.setLang((d.settings && d.settings.lang) || 'zh');
    ZQ.audio.setEnabled(!(d.settings && d.settings.sound === false));
    ZQ.audio.setMusicEnabled(!(d.settings && d.settings.music === false));
    /* 浏览器要求先有用户手势才能出声：首次任意点击即解锁并起播 BGM */
    document.addEventListener('pointerdown', function () { ZQ.audio.unlock(); }, { once: true });

    ZQ.state = { screen: 'start' };
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
    ZQ.audio.bgm(ZQ.state.screen);
  }

  ZQ.app = {
    render: render,
    /** 路由跳转；opts.seed 省略即清除旧种子（让关卡按固定题/重新出题规则取题） */
    go: function (screen, opts) {
      opts = opts || {};
      ZQ.state.screen = screen;
      if (opts.levelId) ZQ.state.levelId = opts.levelId;
      ZQ.state.seed = opts.seed;
      render();
    },
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
