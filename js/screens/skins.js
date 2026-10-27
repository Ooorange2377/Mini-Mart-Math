/* 皮肤图鉴：9 款皮肤（购物车 5 / 存钱罐 4），按「三星通关数」解锁，不可用零花钱购买。
 * 装备后立即生效：开始页 / 游戏页的购物车、开始页的存钱罐都会换成对应皮肤。 */
window.ZQ = window.ZQ || {};
ZQ.screens = ZQ.screens || {};

(function () {
  var CART_SWATCH_PATH =
    'M8 68 C7 48 19 31 39 30 C57 29 69 43 84 40 ' +
    'C104 36 111 15 137 10 C166 4 183 26 199 40 ' +
    'C213 52 228 48 242 34 C257 19 280 18 299 31 ' +
    'C317 43 323 64 317 84 C310 108 291 123 269 131 ' +
    'C246 139 218 134 197 124 C179 116 168 100 150 96 ' +
    'C132 92 117 104 101 118 C82 134 57 139 35 129 ' +
    'C15 120 6 99 7 82 C7 77 8 72 8 68 Z';

  function cartSwatchHtml(skinId) {
    return '<span class="skin-swatch skin-swatch-' + skinId + '" aria-hidden="true">' +
        '<svg viewBox="0 0 324 140">' +
          '<path d="' + CART_SWATCH_PATH + '"/>' +
        '</svg>' +
      '</span>';
  }

  /* 当前分类与滑动位置：装备后整页重渲染时保持停留在原处 */
  var curType = 'cart';
  var curIndex = 0;

  /** 某一类皮肤的全部卡片 HTML */
  function cardsHtml(type, save) {
    var three = ZQ.store.threeStarCount();
    var unlocked = ZQ.rules.unlockedSkins(three);
    var eq = (save.equipped || {})[type];

    var cards = '';
    for (var i = 0; i < ZQ.SKINS.length; i++) {
      var s = ZQ.SKINS[i];
      if (s.type !== type) continue;

      var ok = unlocked[s.id];
      var isEq = eq === s.id;
      var state = isEq ? 'equipped' : (!ok ? 'locked' : 'equip');
      var cls = 'skin-card' + (ok ? '' : ' is-locked') + (isEq ? ' is-equipped' : '');
      var preview = type === 'cart' ? cartSwatchHtml(s.id) : ZQ.ui.slots.renderPig(s.id);
      var label = isEq ? (ZQ.I18N.skinsEquipped + ' ✓') : (ok ? ZQ.I18N.skinsEquip : '🔒 ' + (s.need || '默认'));
      /* 解锁条件统一文案：默认皮肤显示「默认」，其余一律「需达到 N 个三星奖牌」 */
      var sub = s.need === 0 ? ZQ.I18N.skinsDefault : ZQ.I18N.skinsNeed.replace('{n}', s.need);

      cards += '<div class="' + cls + '" data-type="' + type + '" data-skin="' + s.id + '">' +
          '<div class="skin-preview">' + preview + '</div>' +
          '<div class="skin-name">' + s.name + '</div>' +
          '<div class="skin-sub">' + sub + '</div>' +
          '<button class="btn-menu btn-skin' +
            (isEq ? ' btn-skin-on' : '') +
            (!ok ? ' btn-skin-lock' : '') +
          '" type="button" data-state="' + state + '">' +
            label +
          '</button>' +
        '</div>';
    }
    return cards;
  }

  ZQ.screens.skins = {
    /** @returns {HTMLElement} */
    render: function () {
      if (!ZQ.store.data) ZQ.store.load();
      var save = ZQ.store.data;
      if (!save.equipped) save.equipped = { cart: 'silver', pig: 'glass' };

      var el = document.createElement('div');
      el.className = 'stage screen-skins';
      el.innerHTML =
        '<div class="room"><div class="room-floor"></div></div>' +

        '<div class="page-top is-stacked">' +
          '<button class="btn-back-start" type="button" aria-label="返回大厅">← ' + ZQ.I18N.shopBack + '</button>' +
          '<div class="page-title">' + ZQ.I18N.skinsTitle + '</div>' +
          '<div class="page-balance">' +
            '<span class="stat"><i class="ic-img ic-img-medal"></i><b>' + ZQ.store.threeStarCount() + '</b>' +
              '<em>' + ZQ.I18N.mapThreeStar + '</em></span>' +
          '</div>' +
        '</div>' +

        '<div class="skins-wrap">' +
          '<div class="skin-tabs">' +
            '<button class="skin-tab" type="button" data-type="cart">' + ZQ.I18N.skinsCart + '</button>' +
            '<button class="skin-tab" type="button" data-type="pig">' + ZQ.I18N.skinsPig + '</button>' +
          '</div>' +
          '<div class="skins-body"><div class="skin-track"></div></div>' +
        '</div>';

      var body = el.querySelector('.skins-body');
      var track = el.querySelector('.skin-track');
      var tabs = el.querySelectorAll('.skin-tab');
      var offset = 0;        /* 当前横向位移（px，<= 0） */
      var drag = null;       /* { x0, base } */
      var suppressClick = false;

      function gapPx() {
        return parseFloat(getComputedStyle(track).columnGap) || 0;
      }
      function stepPx() {
        var c = track.firstElementChild;
        return c ? c.getBoundingClientRect().width + gapPx() : body.clientWidth;
      }
      function maxOffset() {
        return Math.max(0, track.scrollWidth - body.clientWidth);
      }
      function apply(anim) {
        offset = Math.max(-maxOffset(), Math.min(0, offset));
        track.style.transition = anim ? '' : 'none';
        track.style.transform = 'translateX(' + offset + 'px)';
      }
      function snapTo(index, anim) {
        offset = -index * stepPx();
        curIndex = index;
        apply(anim);
      }
      function paint() {
        track.innerHTML = cardsHtml(curType, save);
        for (var i = 0; i < tabs.length; i++) {
          tabs[i].classList.toggle('is-on', tabs[i].getAttribute('data-type') === curType);
        }
        apply(false);
        snapTo(curIndex, false);
      }

      /* 手指 / 鼠标拖拽滑动，松手吸附到最近一张。
       * 注意：不能在 pointerdown 就 setPointerCapture —— 捕获后 pointerup 会被重定向到
       * .skins-body，浏览器据此把 click 的 target 也改成 .skins-body，导致卡片上的
       * 「装备」按钮 click 永远到不了委托监听。改为位移超过阈值后才捕获。 */
      body.addEventListener('pointerdown', function (e) {
        if (e.button !== undefined && e.button !== 0) return;
        drag = { x0: e.clientX, base: offset, moved: 0, captured: false };
      });
      body.addEventListener('pointermove', function (e) {
        if (!drag) return;
        var dx = e.clientX - drag.x0;
        drag.moved = Math.max(drag.moved, Math.abs(dx));
        if (!drag.captured) {
          if (drag.moved <= 6) return;     // 还只是点击抖动，不动轨道、不抢事件
          drag.captured = true;
          try { body.setPointerCapture(e.pointerId); } catch (err) {}
          body.classList.add('is-drag');
        }
        offset = drag.base + dx;
        apply(false);
      });
      function endDrag(e) {
        if (!drag) return;
        var moved = drag.moved;
        var captured = drag.captured;
        drag = null;
        body.classList.remove('is-drag');
        if (captured && e && e.pointerId !== undefined && body.hasPointerCapture(e.pointerId)) {
          body.releasePointerCapture(e.pointerId);
        }
        if (moved > 6) {
          snapTo(Math.round(-offset / stepPx()), true);
          suppressClick = true;
          setTimeout(function () { suppressClick = false; }, 0);
        }
      }
      body.addEventListener('pointerup', endDrag);
      body.addEventListener('pointercancel', endDrag);

      el.addEventListener('click', function (e) {
        var t = e.target;
        if (!t || !t.closest) return;

        if (suppressClick) return;

        if (t.closest('.btn-back-start')) {
          ZQ.audio.back();
          ZQ.app.go('start');
          return;
        }

        var tab = t.closest('.skin-tab');
        if (tab) {
          ZQ.audio.click();
          curType = tab.getAttribute('data-type');
          curIndex = 0;
          paint();
          return;
        }

        var btn = t.closest('.btn-skin');
        if (!btn) return;
        var card = btn.closest('.skin-card');
        var type = card.getAttribute('data-type');
        var skinId = card.getAttribute('data-skin');
        var state = btn.getAttribute('data-state');

        if (state === 'locked') {
          ZQ.audio.error();
          ZQ.ui.toast.show(ZQ.I18N.toastSkinLocked, { type: 'error' });
          return;
        }

        if (state === 'equipped') {
          ZQ.audio.click();
          ZQ.ui.toast.show('已在装备中', { type: 'info' });
          return;
        }

        // state === 'equip'：点击装备
        if (!ZQ.store.setEquipped(type, skinId)) {
          ZQ.audio.error();
          ZQ.ui.toast.show(ZQ.I18N.toastSkinLocked, { type: 'error' });
          return;
        }
        ZQ.audio.click();
        ZQ.ui.toast.show(ZQ.I18N.toastSkinEquipped, { type: 'good' });
        paint();   // 只重绘卡片，不整页重建
      });

      paint();
      return el;
    },
  };
})();
