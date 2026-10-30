/* 货架渲染：把关卡实例的 items 按「每页 12 位 = 3 层 × 每层 4 位」铺进货架，并生成翻页器。
 * 层 = 品类（层内先放精准解商品，再由干扰项补齐），效果贴合参考图「一行一品类」。 */
window.ZQ = window.ZQ || {};
ZQ.ui = ZQ.ui || {};

(function () {
  var itemMap = null;
  var AWNING_PANELS = 12;
  /* 第二页起延后加载：进关先让首屏 12 张占满带宽，其余图在空闲后再补 */
  var DEFER_MS = 800;

  function lookup(itemId) {
    if (!itemMap) {
      itemMap = {};
      for (var i = 0; i < ZQ.ITEMS.length; i++) itemMap[ZQ.ITEMS[i].id] = ZQ.ITEMS[i];
    }
    return itemMap[itemId] || null;
  }

  // 商品 id → 元数据（购物篮缩略图与清单行共用同一查表）
  ZQ.ui.itemById = lookup;

  /** 单件商品卡：虚线框商品图 + 蓝色斜标签 + 带标签图标的标价
   *  首页图直接挂 src 并标 fetchpriority=high；后续页先只写 data-src，等 primePage() 再补。 */
  function slotHtml(item, defer) {
    if (!item) return '<div class="slot slot-empty"></div>';
    var it = lookup(item.itemId);
    var src = it ? encodeURI(ZQ.itemRuntimePath(it)) : '';
    var fallback = it ? encodeURI(ZQ.itemFallbackPath(it)) : '';
    var shownName = ZQ.itemName(item);
    var loadAttr = defer
      ? 'data-src="' + src + '"'
      : 'loading="lazy" decoding="async" fetchpriority="high" src="' + src + '"';
    return '<div class="slot" data-slot="' + item.slot + '" data-item="' + item.itemId + '">' +
      '<div class="slot-frame">' +
        '<img class="slot-img" ' + loadAttr + ' data-fallback="' + fallback +
          '" alt="' + shownName + '">' +
      '</div>' +
      '<div class="slot-name">' + shownName + '</div>' +
      '<div class="slot-price"><span class="price-tag"></span>' + ZQ.money.fmt2(item.price) + '</div>' +
      '</div>';
  }

  /** 一层：品类浅色块（4 位）+ 木色层板；整层无商品时隐藏（末页不足 12 件） */
  function layerHtml(items, globalLayer, defer) {
    var has = items.some(function (x) { return !!x; });
    if (!has) return '<div class="layer layer-empty" data-layer="' + globalLayer + '"></div>';
    var cat = (items[0] && items[0].category) || 'drink';
    var cells = '';
    for (var i = 0; i < ZQ.ITEMS_PER_LAYER; i++) cells += slotHtml(items[i], defer);
    return '<div class="layer cat-' + cat + '" data-layer="' + globalLayer + '">' +
      '<div class="layer-grid">' + cells + '</div>' +
      '<div class="layer-board"></div>' +
      '</div>';
  }

  function pageHtml(items, pageIndex) {
    var layers = '';
    var defer = pageIndex > 0;   // 首页 12 张立即加载，其余页延后
    for (var L = 0; L < ZQ.SLOTS_PER_PAGE / ZQ.ITEMS_PER_LAYER; L++) {
      layers += layerHtml(items.slice(L * ZQ.ITEMS_PER_LAYER, (L + 1) * ZQ.ITEMS_PER_LAYER), pageIndex * 3 + L, defer);
    }
    return '<div class="shelf-page" data-page="' + pageIndex + '">' + layers + '</div>';
  }

  /** 把某一页所有 data-src 补成 src（幂等：补过就没有 data-src 了） */
  function primePage(pageEl) {
    if (!pageEl) return 0;
    var imgs = pageEl.querySelectorAll('img[data-src]');
    for (var i = 0; i < imgs.length; i++) {
      var src = imgs[i].getAttribute('data-src');
      imgs[i].removeAttribute('data-src');
      if (src) imgs[i].setAttribute('src', src);
    }
    return imgs.length;
  }

  function primeAll(rootEl) {
    if (!rootEl) return;
    var pages = rootEl.querySelectorAll('.shelf-page');
    for (var i = 0; i < pages.length; i++) primePage(pages[i]);
  }

  ZQ.ui.shelf = {
    /**
     * 渲染货架。
     * @param {object} lv 关卡实例（含 items / pages）
     * @returns {HTMLElement}
     */
    render: function (lv) {
      var el = document.createElement('div');
      el.className = 'shelf';
      el.setAttribute('data-pages', lv.pages);
      /* 当前页（横滑/箭头/页点共用同一真值，便于手势层与断言读取） */
      el.setAttribute('data-cur', '0');

      var pages = '';
      for (var p = 0; p < lv.pages; p++) {
        pages += pageHtml(lv.items.slice(p * ZQ.SLOTS_PER_PAGE, (p + 1) * ZQ.SLOTS_PER_PAGE), p);
      }

      var slats = '';
      var scallops = '';
      for (var a = 0; a < AWNING_PANELS; a++) {
        var alt = a % 2 ? ' is-alt' : '';
        slats += '<span class="awning-slat' + alt + '" aria-hidden="true"></span>';
        scallops += '<span class="awning-scallop' + alt + '" aria-hidden="true"></span>';
      }

      var html = '<div class="shelf-awning">' +
          '<div class="awning-canopy">' + slats + '</div>' +
          '<div class="awning-valance">' + scallops + '</div>' +
          '<div class="awning-shadow" aria-hidden="true"></div>' +
        '</div>' +
        '<div class="shelf-stand"><div class="shelf-viewport">' +
          '<div class="shelf-track">' + pages + '</div>' +
        '</div></div>';

      // 翻页器：仅当件数 > 12（页数 > 1）时显示
      if (lv.pages > 1) {
        var dots = '';
        for (var d = 0; d < lv.pages; d++) {
          dots += '<span class="pager-dot' + (d === 0 ? ' is-active' : '') + '" data-page="' + d + '"></span>';
        }
        html += '<div class="shelf-pager">' +
          '<button class="pager-arrow pager-prev" aria-label="' + ZQ.I18N.prevPageAria + '">\u2039</button>' +
          dots +
          '<button class="pager-arrow pager-next" aria-label="' + ZQ.I18N.nextPageAria + '">\u203a</button>' +
          '</div>';
      }

      el.innerHTML = html;
      var imgs = el.querySelectorAll('img[data-fallback]');
      for (var j = 0; j < imgs.length; j++) {
        imgs[j].addEventListener('error', function () {
          var fallback = this.getAttribute('data-fallback');
          if (!fallback || this.getAttribute('src') === fallback) return;
          this.setAttribute('src', fallback);
        });
      }
      /* 首屏只发首页 12 张；其余页在空闲 800ms 后统一补 src（翻页/横滑会提前触发） */
      setTimeout(function () {
        if (el.isConnected) primeAll(el);
      }, DEFER_MS);
      return el;
    },

    /** 平移货架到指定页（P3 翻页交互调用；新页商品逐位淡入） */
    goto: function (shelfEl, page) {
      var track = shelfEl.querySelector('.shelf-track');
      var pages = parseInt(shelfEl.getAttribute('data-pages'), 10) || 1;
      var p = Math.max(0, Math.min(pages - 1, page));
      track.style.transform = 'translateX(' + (-100 * p) + '%)';
      shelfEl.setAttribute('data-cur', String(p));
      var dots = shelfEl.querySelectorAll('.pager-dot');
      for (var i = 0; i < dots.length; i++) dots[i].classList.toggle('is-active', i === p);

      // 入场细节：该页商品卡的商品框依次淡入（动画加在 .slot-frame 上，不与商品卡的抖动/选中态冲突）
      var pageEl = track.children[p];
      if (pageEl) {
        primePage(pageEl);   // 换页即加载该页图，不让「先白框再看图」
        var frames = pageEl.querySelectorAll('.slot[data-slot] .slot-frame');
        for (var k = 0; k < frames.length; k++) {
          frames[k].classList.remove('is-in');
          frames[k].style.animationDelay = (k * 22) + 'ms';
        }
        void pageEl.offsetWidth;
        for (var m = 0; m < frames.length; m++) frames[m].classList.add('is-in');
      }
      return p;
    },

    /** 提前挂某页的图（横滑按下时调用，避免滑到位才看到白框）；越界自动忽略 */
    prime: function (shelfEl, page) {
      if (!shelfEl) return;
      var track = shelfEl.querySelector('.shelf-track');
      if (track) primePage(track.children[page]);
    },
  };
})();
