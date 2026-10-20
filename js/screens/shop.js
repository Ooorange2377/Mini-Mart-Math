/* 零花钱商店：ZQ.SHOP_ITEMS 三种套餐（1/5/10 张延时卡），零花钱兑换。
 * 余额与持有数就地更新，不整页重渲染，保留兑换动画。 */
window.ZQ = window.ZQ || {};
ZQ.screens = ZQ.screens || {};

(function () {
  var DEFAULT_CART = 'silver';

  /** 单张套餐卡：折扣角标 + 卡片图标 + 张数 + 价格 + 兑换按钮 */
  function cardHtml(s) {
    return '<div class="shop-card' + (s.tag ? ' has-tag' : '') + '" data-shop="' + s.id + '">' +
      (s.tag ? '<span class="card-tag">' + s.tag + '</span>' : '') +
      '<div class="card-icon"><span class="ci-plus">+30s</span><span class="ci-clock">⏱</span></div>' +
      '<div class="card-count">× ' + s.count + '</div>' +
      '<div class="card-price">💰 <b>' + s.price + '</b></div>' +
      '<button class="btn-menu btn-buy" type="button">' + ZQ.I18N.shopBuy + '</button>' +
    '</div>';
  }

  function findItem(id) {
    for (var i = 0; i < ZQ.SHOP_ITEMS.length; i++) {
      if (ZQ.SHOP_ITEMS[i].id === id) return ZQ.SHOP_ITEMS[i];
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

        '<div class="page-top">' +
          '<button class="btn-menu btn-back" type="button">\u2039 ' + ZQ.I18N.shopBack + '</button>' +
          '<div class="page-title">' + ZQ.I18N.shopTitle + '</div>' +
          '<div class="page-balance">' +
            '<span class="stat"><i class="ic">💰</i><b class="js-coins">' + (save.coins || 0) + '</b>' +
              '<em>' + ZQ.I18N.mapCoins + '</em></span>' +
            '<span class="stat"><i class="ic">⏱</i><b class="js-own">' + (save.delayCards || 0) + '</b>' +
              '<em>' + ZQ.I18N.shopOwn + '</em></span>' +
          '</div>' +
        '</div>' +

        '<div class="shop-grid">' + cards + '</div>' +
        '<div class="shop-tip">' + ZQ.I18N.shopTip + '</div>';

      el.addEventListener('click', function (e) {
        var t = e.target;
        if (!t || !t.closest) return;

        if (t.closest('.btn-back')) {
          ZQ.audio.back();
          ZQ.app.go('map');
          return;
        }

        var buy = t.closest('.btn-buy');
        if (!buy) return;
        var card = buy.closest('.shop-card');
        var shop = findItem(card.getAttribute('data-shop'));
        if (!shop) return;

        if ((ZQ.store.data.coins || 0) < shop.price) {
          ZQ.audio.error();
          shake(card);
          ZQ.ui.toast.show(ZQ.I18N.toastCoinsNotEnough, { type: 'error' });
          return;
        }

        // 先扣零花销、再入账延时卡（两处均落存档）
        ZQ.store.spendCoins(shop.price);
        ZQ.store.addCards(shop.count);
        ZQ.audio.coin();

        el.querySelector('.js-coins').textContent = ZQ.store.data.coins;
        var own = el.querySelector('.js-own');
        own.textContent = ZQ.store.data.delayCards;
        own.classList.remove('is-pop');
        void own.offsetWidth;
        own.classList.add('is-pop');
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
