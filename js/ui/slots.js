/* 皮肤素材：购物篮 5 款（购物篮/ 目录 PNG 顶视角铁丝篮）+ 存钱罐 3 款（内联 SVG）。
 * 购物车素材为带透明留白的位图，由 CSS 放大裁切让篮身铺满容器。 */
window.ZQ = window.ZQ || {};
ZQ.ui = ZQ.ui || {};

(function () {
  var INK = '#1B3E6F';

  var CART_SKINS = {
    silver:   { name: '普通银色', src: '购物篮/普通铁皮.png' },
    starblue: { name: '星空蓝',   src: '购物篮/星空蓝.png' },
    straw:    { name: '草莓粉',   src: '购物篮/草莓粉.png' },
    mint:     { name: '薄荷绿',   src: '购物篮/薄荷绿.png' },
    gold:     { name: '金光闪闪', src: '购物篮/金光闪闪.png' },
  };

  var PIG_THEMES = {
    xiaohua: { name: '小花猪',   body: '#F7BFC9', snout: '#E8839B', ear: '#EFA3B4', spots: true  },
    space:   { name: '太空猪',   body: '#C3CCEC', snout: '#8E9BD1', ear: '#A9B4E0', ring: true   },
    zhaocai: { name: '招财金猪', body: '#F5CE58', snout: '#E0A93A', ear: '#EFC24A', coin: true   },
  };

  /* 购物篮：顶视角铁丝篮位图（透明留白由 CSS 放大处理） */
  function cartImg(skinId) {
    var t = CART_SKINS[skinId] || CART_SKINS.silver;
    return '<img class="cart-svg" src="' + encodeURI(t.src) + '" alt="' + t.name + '" draggable="false">';
  }

  /* 存钱罐：小花猪 / 太空猪 / 招财金猪 */
  function pigSvg(skinId) {
    var t = PIG_THEMES[skinId] || PIG_THEMES.xiaohua;
    var s = '<svg class="pig-svg" viewBox="0 0 220 180" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      '<g stroke="' + INK + '" stroke-width="4" stroke-linejoin="round" stroke-linecap="round">';
    s += '<rect x="62" y="130" width="18" height="28" rx="7" fill="' + t.ear + '"/>' +
         '<rect x="96" y="134" width="18" height="26" rx="7" fill="' + t.ear + '"/>' +
         '<rect x="130" y="130" width="18" height="28" rx="7" fill="' + t.ear + '"/>';
    s += '<ellipse cx="110" cy="104" rx="78" ry="56" fill="' + t.body + '"/>';
    s += '<path d="M70 60 L92 32 L104 72 Z" fill="' + t.ear + '"/>';
    if (t.spots) {                                       // 小花猪：两块花斑
      s += '<ellipse cx="72" cy="118" rx="15" ry="11" fill="' + t.snout + '" stroke="none"/>' +
           '<ellipse cx="104" cy="140" rx="10" ry="7" fill="' + t.snout + '" stroke="none"/>';
    }
    if (t.ring) {                                        // 太空猪：护目圈
      s += '<circle cx="119" cy="87" r="13" fill="none" stroke="#7B88C4" stroke-width="5"/>';
    }
    s += '<ellipse cx="150" cy="112" rx="26" ry="20" fill="' + t.snout + '"/>' +
         '<circle cx="143" cy="112" r="4" fill="' + INK + '" stroke="none"/>' +
         '<circle cx="157" cy="112" r="4" fill="' + INK + '" stroke="none"/>' +
         '<circle cx="119" cy="87" r="5" fill="' + INK + '" stroke="none"/>' +
         '<rect x="86" y="44" width="34" height="8" rx="4" fill="' + INK + '" stroke="none"/>';
    if (t.coin) {                                        // 招财金猪：头顶金币
      s += '<circle cx="103" cy="26" r="14" fill="#F2D275" stroke="' + INK + '" stroke-width="4"/>' +
           '<rect x="99" y="19" width="8" height="14" rx="3" fill="' + INK + '" stroke="none"/>';
    }
    s += '</g></svg>';
    return s;
  }

  ZQ.ui.slots = {
    CART_SKINS: Object.keys(CART_SKINS),
    PIG_SKINS: Object.keys(PIG_THEMES),
    cartTheme: function (id) { return CART_SKINS[id] || CART_SKINS.silver; },
    renderCart: cartImg,
    renderPig: pigSvg,
  };
})();
