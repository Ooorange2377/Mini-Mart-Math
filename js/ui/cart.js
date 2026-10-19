/* 右侧购物篮：篮内已选商品缩略图 + 件数角标。
 * 缩略图带 data-slot（对应 lv.items 下标），双击移除由 game.js 在 .panel-cart 上事件委托处理。
 * 1~4 件商品使用预设散点布局，覆盖篮身上、中、下区域并保留稳定旋转与轻微重叠。 */
window.ZQ = window.ZQ || {};
ZQ.ui = ZQ.ui || {};

(function () {
  /** 上一次同步的已选下标（用于识别新丢入的商品，播落入动画） */
  var lastSel = [];

  var LAYOUTS = {
    1: [{ x: 0, y: -1, r: -5, s: 1.04 }],
    2: [
      { x: -12, y: -22, r: -8, s: 1.02 },
      { x: 12, y: 11, r: 8, s: 1.08 },
    ],
    3: [
      { x: -14, y: -22, r: -9, s: 1.00 },
      { x: 14, y: -10, r: 8, s: 1.04 },
      { x: 0, y: 20, r: -5, s: 1.08 },
    ],
    4: [
      { x: -14, y: -20, r: -8, s: 1.00 },
      { x: 14, y: -18, r: 8, s: 1.02 },
      { x: -14, y: 19, r: -6, s: 1.06 },
      { x: 14, y: 18, r: 7, s: 1.04 },
    ],
  };

  /** 在预设散点位置附近加入稳定的小幅扰动，避免每次同步跳动。 */
  function toss(idx, base) {
    var r = ((idx * 47) % 7) - 3;
    var jx = ((idx * 31) % 5) - 2;
    return {
      x: base.x + jx * 0.8,
      y: base.y + r * 0.7,
      r: base.r + r * 1.8,
      s: base.s,
    };
  }

  ZQ.ui.cart = {
    /**
     * 生成 .panel-cart 的内容 HTML。
     * @param {string} skinId 购物车皮肤
     * @param {number} [count] 初始已选件数
     * @param {number} [total] 本关需选件数
     */
    render: function (skinId, count, total) {
      return '<div class="cart">' + ZQ.ui.slots.renderCart(skinId) +
          '<div class="cart-items"></div>' +
        '</div>' +
        '<div class="cart-count">' + ZQ.I18N.cartCount
          .replace('{n}', count || 0)
          .replace('{total}', total || count || 0) + '</div>';
    },

    /** 同步篮内缩略图与件数角标 */
    sync: function (panelEl, lv, session) {
      if (!panelEl) return;
      var box = panelEl.querySelector('.cart-items');
      var countEl = panelEl.querySelector('.cart-count');
      var sel = session.selected.slice().sort(function (a, b) { return a - b; });

      var prev = {};
      for (var p = 0; p < lastSel.length; p++) prev[lastSel[p]] = true;

      var html = '';
      var layout = LAYOUTS[sel.length] || LAYOUTS[1];
      for (var i = 0; i < sel.length; i++) {
        var item = lv.items[sel[i]];
        var meta = ZQ.ui.itemById ? ZQ.ui.itemById(item.itemId) : null;
        var src = meta ? encodeURI(ZQ.itemRuntimePath(meta)) : '';
        var fallback = meta ? encodeURI(meta.path) : '';
        var t = toss(sel[i], layout[i] || layout[layout.length - 1]);
        html += '<div class="cart-item' + (prev[sel[i]] ? '' : ' is-new') + '" data-slot="' + sel[i] + '" ' +
          'style="--x:' + t.x.toFixed(1) + '%;--y:' + t.y.toFixed(1) + '%;--r:' + t.r.toFixed(1) +
          'deg;--s:' + t.s.toFixed(2) + ';z-index:' + (i + 1) + '">' +
          '<img src="' + src + '" data-fallback="' + fallback + '" alt="' + item.name + '" ' +
            'decoding="async" draggable="false">' +
        '</div>';
      }
      if (box) {
        box.innerHTML = html;
        box.setAttribute('data-count', sel.length);
      }
      var images = box ? box.querySelectorAll('img[data-fallback]') : [];
      for (var j = 0; j < images.length; j++) {
        images[j].addEventListener('error', function () {
          var fallback = this.getAttribute('data-fallback');
          if (!fallback || this.getAttribute('src') === fallback) return;
          this.setAttribute('src', fallback);
        });
      }
      if (countEl) {
        countEl.textContent = ZQ.I18N.cartCount
          .replace('{n}', sel.length)
          .replace('{total}', lv.n || sel.length);
        countEl.classList.toggle('is-complete', sel.length === lv.n);
      }

      lastSel = sel;
    },

    /** 清空上一次的缓存（换关重渲染时调用） */
    reset: function () { lastSel = []; },
  };
})();
