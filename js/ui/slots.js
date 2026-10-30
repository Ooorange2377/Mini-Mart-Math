/* 皮肤素材：购物篮 5 款（640px WebP，回退 购物篮/优化/ 的 PNG）+ 存钱罐 4 款（内联 SVG）。
 * 购物车素材为带透明留白的位图，由 CSS 放大裁切让篮身铺满容器。 */
window.ZQ = window.ZQ || {};
ZQ.ui = ZQ.ui || {};

(function () {
  var INK = '#1B3E6F';

  var CART_SKINS = {
    silver:   { name: '普通银色', nameEn: 'Classic Silver',  src: '购物篮/webp/普通铁皮.webp', fb: '购物篮/优化/普通铁皮.png' },
    starblue: { name: '星空蓝',   nameEn: 'Starry Blue',     src: '购物篮/webp/星空蓝.webp',   fb: '购物篮/优化/星空蓝.png' },
    straw:    { name: '草莓粉',   nameEn: 'Strawberry Pink', src: '购物篮/webp/草莓粉.webp',   fb: '购物篮/优化/草莓粉.png' },
    mint:     { name: '薄荷绿',   nameEn: 'Mint Green',      src: '购物篮/webp/薄荷绿.webp',   fb: '购物篮/优化/薄荷绿.png' },
    gold:     { name: '金光闪闪', nameEn: 'Golden Glow',     src: '购物篮/webp/金光闪闪.webp', fb: '购物篮/优化/金光闪闪.png' },
  };

  var PIG_THEMES = {
    glass: { name: '玻璃存钱罐',   nameEn: 'Glass Jar' },
    gacha: { name: '扭蛋机存钱罐', nameEn: 'Gacha Machine' },
    ufo:   { name: 'UFO 存钱罐',   nameEn: 'UFO Bank' },
  };

  /* 购物篮：顶视角铁丝篮位图（透明留白由 CSS 放大处理） */
  function cartImg(skinId) {
    var t = CART_SKINS[skinId] || CART_SKINS.silver;
    return '<img class="cart-svg" src="' + encodeURI(t.src) + '" data-fallback="' + encodeURI(t.fb) + '" alt="' +
      ((ZQ.isEn() && t.nameEn) ? t.nameEn : t.name) + '" draggable="false">';
  }

  /* 给 root 内所有带 data-fallback 且尚未绑定的图挂「WebP 失败 → PNG」兜底 */
  function bindFallbacks(root) {
    if (!root) return;
    var imgs = root.querySelectorAll('img[data-fallback]');
    for (var i = 0; i < imgs.length; i++) {
      var img = imgs[i];
      if (img.getAttribute('data-fb-bound')) continue;
      img.setAttribute('data-fb-bound', '1');
      img.addEventListener('error', function () {
        var fb = this.getAttribute('data-fallback');
        if (!fb || this.getAttribute('src') === fb) return;
        this.setAttribute('src', fb);
      });
    }
  }

  /* 存钱罐：三款独立造型，Q 版粗描边 4px + 大圆角 */
  function pigSvg(skinId) {
    var id = PIG_THEMES[skinId] ? skinId : 'glass';
    var s = '<svg class="pig-svg" viewBox="0 0 220 180" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      '<g stroke="' + INK + '" stroke-width="4" stroke-linejoin="round" stroke-linecap="round">';

    if (id === 'glass') {
      // 玻璃存钱罐：罐体半透明(.62)让罐内金币看得见但玻璃感够；高光弧 + 投币口 + 两只脚
      s += '<rect x="62" y="35" width="96" height="116" rx="34" fill="rgba(221,244,252,.62)"/>' +
           '<rect x="58" y="20" width="104" height="24" rx="11" fill="rgba(237,249,253,.70)"/>' +
           '<rect x="92" y="37" width="36" height="8" rx="4" fill="' + INK + '" stroke="none"/>' +
           '<path d="M78 62 C70 88 76 119 89 136" fill="none" stroke="#FFFFFF" stroke-width="5" opacity=".78"/>' +
           '<rect x="76" y="148" width="20" height="10" rx="5" fill="rgba(221,244,252,.70)"/>' +
           '<rect x="124" y="148" width="20" height="10" rx="5" fill="rgba(221,244,252,.70)"/>';
    } else if (id === 'gacha') {
      // 扭蛋机存钱罐（重绘：猫咪造型 + 奶油黄机身 + 玻璃圆球罩 + 金黄扭蛋群）
      // 关键：扭蛋群必须画在玻璃罩之前（SVG 后画在上层），这样半透明玻璃罩才能叠在扭蛋之上
      s += '<g class="pig-gacha">' +
           // —— defs：圆形 clipPath（严格限制扭蛋只在玻璃圆球内，不能超出）——
           '<defs>' +
             '<clipPath id="gacha-dome-clip">' +
               '<circle cx="110" cy="65" r="52"/>' +
             '</clipPath>' +
           '</defs>' +
           // —— 机身主体（奶油黄色圆角矩形 + 底部托盘）——
           '<rect x="40" y="108" width="140" height="62" rx="14" fill="#FCE8BC"/>' +
           '<rect x="40" y="108" width="140" height="62" rx="14" fill="none"/>' +
           // 机身前檐（稍深奶油色，营造托盘感）
           '<path d="M44 160 Q110 168 176 160 L176 170 L44 170 Z" fill="#F0D89A" stroke="' + INK + '"/>' +
           // —— 猫咪耳朵（顶部左右两个小圆三角）——
           '<path d="M56 108 L48 88 L68 96 Z" fill="#FCE8BC"/>' +
           '<path d="M56 108 L48 88 L68 96 Z" fill="none"/>' +
           '<path d="M164 108 L172 88 L152 96 Z" fill="#FCE8BC"/>' +
           '<path d="M164 108 L172 88 L152 96 Z" fill="none"/>' +
           // —— 扭蛋群（先画，在底层，被圆形 clipPath 严格裁切在玻璃球内）——
           '<g class="pig-gacha-balls" clip-path="url(#gacha-dome-clip)">' +
             '<circle cx="100" cy="55" r="13" fill="#FFD866" stroke="' + INK + '"/>' +
             '<circle cx="125" cy="62" r="11" fill="#FFD866" stroke="' + INK + '"/>' +
             '<circle cx="92" cy="72" r="12" fill="#FFE08A" stroke="' + INK + '"/>' +
             '<circle cx="118" cy="80" r="10" fill="#FFD866" stroke="' + INK + '"/>' +
             '<circle cx="138" cy="76" r="9" fill="#FFE08A" stroke="' + INK + '"/>' +
             '<circle cx="82" cy="60" r="10" fill="#FFD866" stroke="' + INK + '"/>' +
             '<circle cx="108" cy="85" r="11" fill="#FFE08A" stroke="' + INK + '"/>' +
             '<circle cx="130" cy="48" r="9" fill="#FFD866" stroke="' + INK + '"/>' +
             // 每颗球加一个左上高光点（白椭圆），增加立体感
             '<ellipse cx="96" cy="51" rx="3" ry="2" fill="#FFFFFF" stroke="none"/>' +
             '<ellipse cx="121" cy="58" rx="2.5" ry="1.8" fill="#FFFFFF" stroke="none"/>' +
             '<ellipse cx="88" cy="68" rx="2.8" ry="2" fill="#FFFFFF" stroke="none"/>' +
             '<ellipse cx="114" cy="76" rx="2.3" ry="1.7" fill="#FFFFFF" stroke="none"/>' +
             '<ellipse cx="134" cy="72" rx="2.2" ry="1.5" fill="#FFFFFF" stroke="none"/>' +
             '<ellipse cx="78" cy="56" rx="2.2" ry="1.5" fill="#FFFFFF" stroke="none"/>' +
             '<ellipse cx="104" cy="81" rx="2.5" ry="1.8" fill="#FFFFFF" stroke="none"/>' +
             '<ellipse cx="126" cy="44" rx="2.2" ry="1.5" fill="#FFFFFF" stroke="none"/>' +
           '</g>' +
           // —— 玻璃圆球罩（后画，叠在扭蛋群之上，半透明 + 高光）——
           '<circle cx="110" cy="65" r="52" fill="rgba(210,240,255,.55)"/>' +
           '<circle cx="110" cy="65" r="52" fill="none"/>' +
           // 玻璃高光弧（左上）+ 光斑（右上）
           '<path d="M78 42 Q92 28 110 28" fill="none" stroke="#FFFFFF" stroke-width="4" stroke-linecap="round" opacity=".75"/>' +
           '<ellipse cx="142" cy="44" rx="7" ry="3.5" fill="#FFFFFF" opacity=".6" stroke="none"/>' +
           // —— 投币口（圆球罩顶部正中间）——
           '<rect x="102" y="18" width="16" height="5" rx="2" fill="' + INK + '" stroke="none"/>' +
           '<rect x="98" y="15" width="24" height="3" rx="1.5" fill="' + INK + '" stroke="none"/>' +
           // —— 深灰色方形出蛋口（机身底部正中间）——
           '<rect x="92" y="142" width="36" height="16" rx="3" fill="#4A4A52"/>' +
           '<rect x="92" y="142" width="36" height="16" rx="3" fill="none"/>' +
           '<rect x="96" y="145" width="28" height="10" rx="2" fill="#2B2B33" stroke="none"/>' +
           // —— 十字形摇杆（机身右侧中部）——
           '<g class="gacha-crank" style="transform-origin:182px 132px">' +
             '<circle cx="182" cy="132" r="13" fill="#D4D7DC"/>' +
             '<line x1="169" y1="132" x2="195" y2="132" stroke-width="4"/>' +
             '<line x1="182" y1="119" x2="182" y2="145" stroke-width="4"/>' +
             '<circle cx="182" cy="132" r="4" fill="none"/>' +
           '</g>' +
           '</g>';
    } else {
      // UFO 存钱罐
      s += '<g class="pig-ufo">' +
           // 圆罩（驾驶舱）
           '<ellipse cx="110" cy="82" rx="48" ry="26" fill="rgba(180,220,240,.65)"/>' +
           '<ellipse cx="110" cy="82" rx="48" ry="26" fill="none"/>' +
           '<path d="M82 78 Q90 68 98 78" fill="none" stroke="#FFFFFF" stroke-width="3" opacity=".7"/>' +
           // 底部金属底盘（扁椭圆）
           '<ellipse cx="110" cy="106" rx="72" ry="24" fill="#C8D0DA"/>' +
           '<ellipse cx="110" cy="106" rx="72" ry="24" fill="none"/>' +
           '<line x1="60" y1="102" x2="160" y2="102" stroke-width="2"/>' +
           // 舷窗
           '<circle cx="78" cy="98" r="4" fill="#F6C1D8"/>' +
           '<circle cx="110" cy="96" r="4" fill="#FFE066"/>' +
           '<circle cx="142" cy="98" r="4" fill="#8FD14F"/>' +
           // 底部光束罩（仪式里 .is-beam 会开启绿色光束动画）
           '<ellipse class="ufo-beam-hood" cx="110" cy="132" rx="36" ry="10" fill="#8FD14F" opacity=".22"/>' +
           '<path class="ufo-beam-hood" d="M74 132 Q110 126 146 132" fill="none"/>' +
           // 支脚
           '<line x1="68" y1="124" x2="58" y2="156" stroke-width="4"/>' +
           '<line x1="152" y1="124" x2="162" y2="156" stroke-width="4"/>' +
           '<line x1="110" y1="128" x2="110" y2="158" stroke-width="4"/>' +
           '<circle cx="58" cy="156" r="5" fill="#C8D0DA"/>' +
           '<circle cx="162" cy="156" r="5" fill="#C8D0DA"/>' +
           '<circle cx="110" cy="158" r="5" fill="#C8D0DA"/>' +
           '</g>';
    }
    return s + '</g></svg>';
  }

  ZQ.ui.slots = {
    CART_SKINS: Object.keys(CART_SKINS),
    PIG_SKINS: Object.keys(PIG_THEMES),
    cartTheme: function (id) { return CART_SKINS[id] || CART_SKINS.silver; },
    renderCart: cartImg,
    bindFallbacks: bindFallbacks,
    renderPig: pigSvg,
  };
})();
