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

  /** 一组皮肤（购物车 / 存钱罐）：预览 SVG + 名称 + 条件 + 装备按钮 */
  function groupHtml(type, title, save) {
    var three = ZQ.store.threeStarCount();
    var unlocked = ZQ.rules.unlockedSkins(three);
    var eq = (save.equipped || {})[type];

    var cards = '';
    for (var i = 0; i < ZQ.SKINS.length; i++) {
      var s = ZQ.SKINS[i];
      if (s.type !== type) continue;

      var ok = unlocked[s.id];
      var isEq = eq === s.id;
      var cls = 'skin-card' + (ok ? '' : ' is-locked') + (isEq ? ' is-equipped' : '');
      var preview = type === 'cart' ? cartSwatchHtml(s.id) : ZQ.ui.slots.renderPig(s.id);
      var label = isEq ? ZQ.I18N.skinsEquipped : (ok ? ZQ.I18N.skinsEquip : '🔒');
      var sub = ok
        ? (s.need === 0 ? ZQ.I18N.skinsDefault : s.desc)
        : ZQ.I18N.skinsNeed.replace('{n}', s.need);

      cards += '<div class="' + cls + '" data-type="' + type + '" data-skin="' + s.id + '">' +
          '<div class="skin-preview">' + preview + '</div>' +
          '<div class="skin-name">' + s.name + '</div>' +
          '<div class="skin-sub">' + sub + '</div>' +
          '<button class="btn-menu btn-skin" type="button"' + ((!ok || isEq) ? ' disabled' : '') + '>' +
            label +
          '</button>' +
        '</div>';
    }

    return '<section class="skin-group">' +
      '<div class="skin-group-title">' + title + '</div>' +
      '<div class="skin-grid">' + cards + '</div>' +
    '</section>';
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

        '<div class="page-top">' +
          '<button class="btn-menu btn-back" type="button">\u2039 ' + ZQ.I18N.shopBack + '</button>' +
          '<div class="page-title">' + ZQ.I18N.skinsTitle + '</div>' +
          '<div class="page-balance">' +
            '<span class="stat"><i class="ic-img ic-img-medal"></i><b>' + ZQ.store.threeStarCount() + '</b>' +
              '<em>' + ZQ.I18N.mapThreeStar + '</em></span>' +
          '</div>' +
        '</div>' +

        '<div class="skins-body">' +
          groupHtml('cart', ZQ.I18N.skinsCart, save) +
          groupHtml('pig', ZQ.I18N.skinsPig, save) +
        '</div>';

      el.addEventListener('click', function (e) {
        var t = e.target;
        if (!t || !t.closest) return;

        if (t.closest('.btn-back')) {
          ZQ.audio.back();
          ZQ.app.go('start');
          return;
        }

        var btn = t.closest('.btn-skin');
        if (!btn) return;
        var card = btn.closest('.skin-card');
        var type = card.getAttribute('data-type');
        var skinId = card.getAttribute('data-skin');

        if (card.classList.contains('is-locked')) {
          ZQ.audio.error();
          ZQ.ui.toast.show(ZQ.I18N.toastSkinLocked, { type: 'error' });
          return;
        }

        ZQ.store.setEquipped(type, skinId);
        ZQ.audio.click();
        ZQ.ui.toast.show(ZQ.I18N.toastSkinEquipped, { type: 'good' });
        ZQ.app.render();   // 重渲染整页：同步「已装备 / 装备」按钮态
      });

      return el;
    },
  };
})();
