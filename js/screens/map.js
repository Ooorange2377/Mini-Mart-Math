/* 章节/关卡地图页：顶部统计（星星 / 三星通关数 / 零花钱）、可滚动章节卡片、底部商店与图鉴入口。
 * 解锁判定全部走 ZQ.store（章节门槛用累计历史最高星之和，关内逐关推进）。 */
window.ZQ = window.ZQ || {};
ZQ.screens = ZQ.screens || {};

(function () {
  /** 三颗小星槽位：前 n 颗点亮 */
  function miniStars(n) {
    var s = '';
    for (var i = 1; i <= 3; i++) s += '<i class="ms' + (i <= n ? ' on' : '') + '">★</i>';
    return s;
  }

  /** 第一个「已解锁且尚未通关」的关卡（用于高亮当前目标） */
  function currentLevel() {
    for (var lv = 1; lv <= ZQ.totalLevels; lv++) {
      if (!ZQ.store.levelUnlocked(lv)) return 0;
      if (ZQ.store.levelStars(lv) < 1) return lv;
    }
    return 0;
  }

  function chapterHtml(ch, cur) {
    var total = ZQ.store.totalStars();
    var unlocked = ZQ.store.chapterUnlocked(ch.id);
    var chStars = 0;
    for (var k = ch.range[0]; k <= ch.range[1]; k++) chStars += ZQ.store.levelStars(k);

    var cells = '';
    for (var lv = ch.range[0]; lv <= ch.range[1]; lv++) {
      var star = ZQ.store.levelStars(lv);
      var open = ZQ.store.levelUnlocked(lv);
      var cls = 'lv';
      if (!open) cls += ' is-locked';
      else if (star >= 3) cls += ' is-three';
      else if (star > 0) cls += ' is-cleared';
      if (lv === cur) cls += ' is-current';
      cells += '<button class="' + cls + '" type="button" data-level="' + lv + '">' +
                 '<span class="lv-no">' + lv + '</span>' +
                 '<span class="lv-stars">' + (open ? miniStars(star) : '🔒') + '</span>' +
               '</button>';
    }

    return '<section class="chapter' + (unlocked ? '' : ' is-locked') + '" data-chapter="' + ch.id + '">' +
      '<div class="ch-head">' +
        '<span class="ch-name">第 ' + ch.id + ' 章 · ' + ch.name + '</span>' +
        '<span class="ch-stars">★ ' + chStars + ' / ' + ch.maxStars + '</span>' +
      '</div>' +
      '<div class="ch-desc">' + ch.desc + '</div>' +
      '<div class="ch-grid">' + cells + '</div>' +
      (unlocked
        ? ''
        : '<div class="ch-lock">' + ZQ.I18N.mapNeedStars.replace('{n}', ZQ.rules.chapterStarsNeeded(ch.id, total)) + '</div>') +
    '</section>';
  }

  /** 所有章节共用同一列数，避免关卡较少的章节把卡片横向撑大。 */
  function chapterColumns() {
    var cols = 1;
    for (var i = 0; i < ZQ.CHAPTERS.length; i++) {
      var count = ZQ.CHAPTERS[i].range[1] - ZQ.CHAPTERS[i].range[0] + 1;
      if (count > cols) cols = count;
    }
    return cols;
  }

  ZQ.screens.map = {
    /** @returns {HTMLElement} */
    render: function () {
      if (!ZQ.store.data) ZQ.store.load();
      var saved = ZQ.store.data || {};
      var cur = currentLevel();

      var chapters = '';
      for (var i = 0; i < ZQ.CHAPTERS.length; i++) chapters += chapterHtml(ZQ.CHAPTERS[i], cur);

      var el = document.createElement('div');
      el.className = 'stage screen-map';
      el.innerHTML =
        '<div class="room"><div class="room-floor"></div></div>' +

        '<div class="map-top">' +
          '<div class="map-title">' + ZQ.I18N.mapTitle + '</div>' +
          '<div class="map-stats">' +
            '<span class="stat"><i class="ic ic-star">★</i><b>' + ZQ.store.totalStars() + '</b>' +
              '<em>' + ZQ.I18N.mapTotalStars + '</em></span>' +
            '<span class="stat"><i class="ic ic-medal">🏅</i><b>' + ZQ.store.threeStarCount() + '</b>' +
              '<em>' + ZQ.I18N.mapThreeStar + '</em></span>' +
            '<span class="stat"><i class="ic ic-coin">💰</i><b>' + (saved.coins || 0) + '</b>' +
              '<em>' + ZQ.I18N.mapCoins + '</em></span>' +
          '</div>' +
        '</div>' +

        '<div class="map-body" style="--chapter-rows:' + Math.ceil(ZQ.CHAPTERS.length / 2) +
          ';--chapter-cols:' + chapterColumns() + '">' +
          chapters +
        '</div>' +

        '<div class="map-foot">' +
          '<button class="btn-menu btn-shop" type="button">💰 ' + ZQ.I18N.mapShop + '</button>' +
          '<button class="btn-menu btn-skins" type="button">🐷 ' + ZQ.I18N.mapSkins + '</button>' +
        '</div>';

      el.addEventListener('click', function (e) {
        var t = e.target;
        if (!t || !t.closest) return;

        if (t.closest('.btn-shop')) {
          ZQ.audio.click();
          if (ZQ.screens.shop) ZQ.app.go('shop');
          return;
        }
        if (t.closest('.btn-skins')) {
          ZQ.audio.click();
          if (ZQ.screens.skins) ZQ.app.go('skins');
          return;
        }

        var btn = t.closest('.lv[data-level]');
        if (!btn) return;
        var lv = parseInt(btn.getAttribute('data-level'), 10);
        if (!ZQ.store.levelUnlocked(lv)) {
          ZQ.audio.error();
          var ch = ZQ.chapterOf(lv);
          ZQ.ui.toast.show(
            ZQ.store.chapterUnlocked(ch.id) ? ZQ.I18N.toastLevelLocked : ZQ.I18N.toastChapterLocked,
            { type: 'error' }
          );
          return;
        }
        ZQ.audio.unlock();
        ZQ.audio.click();
        ZQ.app.go('game', { levelId: lv });
      });

      return el;
    },
  };
})();
