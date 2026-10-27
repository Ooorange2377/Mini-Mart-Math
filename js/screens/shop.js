/* 零花钱商店：3 类消耗品（延时卡 / 提示卡 / 换题卡），每类 2~3 档套餐。
 * 余额与持有数就地更新，不整页重渲染，保留兑换动画。 */
window.ZQ = window.ZQ || {};
ZQ.screens = ZQ.screens || {};

(function () {
  var DEFAULT_CART = 'silver';

  var META = {
    delay: 'shopDelay',
    hint: 'shopHint',
    reroll: 'shopReroll',
  };

  var OWN_KEY = {
    delay: 'delayCards',
    hint: 'hintCards',
    reroll: 'rerollCards',
  };

  /* 各卡片底部的使用说明 */
  var DESC = {
    delay: 'shopDescDelay',
    hint: 'shopDescHint',
    reroll: 'shopDescReroll',
  };

  /** 单档价签：张数 + 价格 + 兑换按钮，折扣档带角标 */
  function tierHtml(t) {
    var tag = ZQ.isEn() ? (t.tagEn || '') : t.tag;
    return '<div class="tier-row' + (tag ? ' has-tag' : '') + '" data-tier="' + t.id + '">' +
      '<span class="tier-count">× ' + t.count + '</span>' +
      (tag ? '<span class="tier-tag">' + tag + '</span>' : '') +
      '<span class="tier-price"><i class="ic-img ic-img-coin"></i><b>' + t.price + '</b></span>' +
      '<button class="btn-menu btn-buy" type="button">' + ZQ.I18N.shopBuy + '</button>' +
    '</div>';
  }

  /** 一类消耗品一张卡：图标 + 名称 + 多档价签 + 当前持有量 */
  function cardHtml(item) {
    var tiers = '';
    for (var i = 0; i < item.tiers.length; i++) tiers += tierHtml(item.tiers[i]);
    return '<div class="shop-card shop-card-' + item.id + '" data-shop="' + item.id + '">' +
      '<div class="card-icon card-icon-' + item.id + '">' +
        '<span class="ci-main">' + item.icon + '</span>' +
        '<span class="ci-unit">' + item.unit + '</span>' +
      '</div>' +
      '<div class="card-name">' + ZQ.I18N[META[item.id]] + '</div>' +
      '<div class="tier-list">' + tiers + '</div>' +
      '<div class="card-owned js-own" data-kind="' + item.id + '"></div>' +
      '<div class="card-desc">' + ZQ.I18N[DESC[item.id]] + '</div>' +
    '</div>';
  }

  /** 按套餐 id 找到所属类别与档位 */
  function findTier(id) {
    for (var i = 0; i < ZQ.SHOP_ITEMS.length; i++) {
      var item = ZQ.SHOP_ITEMS[i];
      for (var j = 0; j < item.tiers.length; j++) {
        if (item.tiers[j].id === id) return { kind: item.id, tier: item.tiers[j] };
      }
    }
    return null;
  }

  /** 余额不足：卡片抖动（重新触发同一关键帧需先移除类并强制回流） */
  function shake(el) {
    el.classList.remove('is-denied');
    void el.offsetWidth;
    el.classList.add('is-denied');
    setTimeout(function () { el.classList.remove('is-denied'); }, 460);
  }

  ZQ.screens.shop = {
    /** @returns {HTMLElement} */
    render: function () {
      if (!ZQ.store.data) ZQ.store.load();
      if (!ZQ.store.data.equipped) ZQ.store.data.equipped = { cart: DEFAULT_CART, pig: 'glass' };
      var save = ZQ.store.data;

      var cards = '';
      for (var i = 0; i < ZQ.SHOP_ITEMS.length; i++) cards += cardHtml(ZQ.SHOP_ITEMS[i]);

      var el = document.createElement('div');
      el.className = 'stage screen-shop';
      el.innerHTML =
        '<div class="room"><div class="room-floor"></div></div>' +

        '<div class="page-top is-stacked">' +
          '<button class="btn-back-start" type="button" aria-label="' + ZQ.I18N.backHallAria + '">← ' + ZQ.I18N.shopBack + '</button>' +
          '<div class="page-title">' + ZQ.I18N.shopTitle + '</div>' +
          '<div class="page-balance">' +
            '<span class="stat"><i class="ic-img ic-img-coin"></i><b class="js-coins">' + (save.coins || 0) + '</b>' +
              '<em>' + ZQ.I18N.mapCoins + '</em></span>' +
          '</div>' +
        '</div>' +

        '<div class="shop-grid">' + cards + '</div>';

      function refreshOwn() {
        var slots = el.querySelectorAll('.js-own');
        for (var k = 0; k < slots.length; k++) {
          var kind = slots[k].getAttribute('data-kind');
          var n = ZQ.store.data[OWN_KEY[kind]] || 0;
          slots[k].textContent = ZQ.I18N.shopOwnShort.replace('{n}', n);
        }
      }
      refreshOwn();

      el.addEventListener('click', function (e) {
        var t = e.target;
        if (!t || !t.closest) return;

        if (t.closest('.btn-back-start')) {
          ZQ.audio.back();
          ZQ.app.go('start');
          return;
        }

        var buy = t.closest('.btn-buy');
        if (!buy) return;
        var row = buy.closest('.tier-row');
        var found = findTier(row.getAttribute('data-tier'));
        if (!found) return;
        var card = buy.closest('.shop-card');

        if ((ZQ.store.data.coins || 0) < found.tier.price) {
          ZQ.audio.error();
          shake(card);
          ZQ.ui.toast.show(ZQ.I18N.toastCoinsNotEnough, { type: 'error' });
          return;
        }

        // 先扣零花钱、再入账对应道具（两处均落存档）
        ZQ.store.spendCoins(found.tier.price);
        ZQ.store.addCards(found.tier.count, found.kind);
        ZQ.audio.coin();

        el.querySelector('.js-coins').textContent = ZQ.store.data.coins;
        refreshOwn();
        var own = el.querySelector('.js-own[data-kind="' + found.kind + '"]');
        if (own) {
          own.classList.remove('is-pop');
          void own.offsetWidth;
          own.classList.add('is-pop');
        }
        var icon = card.querySelector('.card-icon');
        if (icon) {
          icon.classList.remove('is-pop');
          void icon.offsetWidth;
          icon.classList.add('is-pop');
        }
        ZQ.ui.toast.show(ZQ.I18N.toastBought, { type: 'good' });
      });

      return el;
    },
  };
})();
