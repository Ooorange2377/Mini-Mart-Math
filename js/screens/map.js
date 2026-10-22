/* 章节/关卡地图页：顶部统计（星星 / 三星通关数 / 零花钱）、可滚动章节卡片、底部商店与图鉴入口。
 * 解锁判定全部走 ZQ.store：星数门槛、前置章节通关、全局关卡顺序三重校验。 */
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

  function chapterRequirements(status) {
    var lines = [];
    if (status.previousChapterId) {
      lines.push(ZQ.I18N.mapNeedPreviousChapter.replace('{chapter}', status.previousChapterId));
    }
    if (status.starsNeeded > 0) {
      lines.push(ZQ.I18N.mapNeedStars.replace('{n}', status.starsNeeded));
    }
    return lines;
  }

  function chapterLockText(status) {
    var lines = chapterRequirements(status);
    return lines.length ? lines.join('；') : ZQ.I18N.toastChapterLocked;
  }

  function levelLockText(lock) {
    if (lock.reason === 'previous') {
      return ZQ.I18N.toastLevelLocked.replace('{n}', lock.requiredLevel);
    }
    if (lock.reason === 'chapter') return chapterLockText(lock.chapterStatus);
    return ZQ.I18N.toastChapterLocked;
  }

  function chapterHtml(ch, cur) {
    var lock = ZQ.store.chapterLockStatus(ch.id);
    var unlocked = lock.unlocked;
    var chStars = 0;
    for (var k = ch.range[0]; k <= ch.range[1]; k++) chStars += ZQ.store.levelStars(k);

    var cells = '';
    for (var lv = ch.range[0]; lv <= ch.range[1]; lv++) {
      var star = ZQ.store.levelStars(lv);
      var levelLock = ZQ.store.levelLockStatus(lv);
      var open = levelLock.unlocked;
      var lockHint = open ? '' : levelLockText(levelLock);
      var cls = 'lv';
      if (!open) cls += ' is-locked' + (levelLock.reason === 'previous' ? ' is-gate-locked' : '');
      else if (star >= 3) cls += ' is-three';
      else if (star > 0) cls += ' is-cleared';
      if (lv === cur) cls += ' is-current';
      cells += '<button class="' + cls + '" type="button" data-level="' + lv + '"' +
                 (open ? '' : ' title="' + lockHint + '" aria-label="第 ' + lv + ' 关，未解锁，' + lockHint + '"') +
                 ' data-lock-reason="' + (levelLock.reason || '') + '">' +
                 '<span class="lv-no">' + lv + '</span>' +
                 '<span class="lv-stars">' + (open ? miniStars(star) : '🔒') + '</span>' +
               '</button>';
    }

    var requirements = '';
    if (!unlocked) {
      var lines = chapterRequirements(lock);
      for (var r = 0; r < lines.length; r++) {
        requirements += '<span class="ch-lock-req">' + lines[r] + '</span>';
      }
    }

    return '<section class="chapter' + (unlocked ? '' : ' is-locked is-locked-' + lock.reason) +
        '" data-chapter="' + ch.id + '">' +
      '<div class="ch-head">' +
        '<span class="ch-name">第 ' + ch.id + ' 章 · ' + ch.name + '</span>' +
        '<span class="ch-stars">★ ' + chStars + ' / ' + ch.maxStars + '</span>' +
      '</div>' +
      '<div class="ch-desc">' + ch.desc + '</div>' +
      '<div class="ch-grid">' + cells + '</div>' +
      (unlocked
        ? ''
        : '<div class="ch-lock is-' + lock.reason + '">' +
            '<b class="ch-lock-title">🔒 ' +
              ZQ.I18N.mapChapterLocked.replace('{chapter}', ch.id) +
            '</b>' + requirements +
          '</div>') +
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
          '<button class="btn-back-start" type="button" aria-label="返回初始界面">← 返回</button>' +
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
          '<button class="btn-menu btn-skins" type="button">🏅 ' + ZQ.I18N.mapSkins + '</button>' +
        '</div>';

      el.addEventListener('click', function (e) {
        var t = e.target;
        if (!t || !t.closest) return;

        if (t.closest('.btn-back-start')) {
          ZQ.audio.click();
          ZQ.app.go('start');
          return;
        }

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
        var lock = ZQ.store.levelLockStatus(lv);
        if (!lock.unlocked) {
          ZQ.audio.error();
          ZQ.ui.toast.show(levelLockText(lock), { type: 'error' });
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
