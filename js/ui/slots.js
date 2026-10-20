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
    glass:    { name: '普通玻璃存钱罐' },
    burger:   { name: '汉堡存钱罐' },
    donut:    { name: '甜甜圈存钱罐' },
    luckycat: { name: '招财猫存钱罐' },
  };

  /* 购物篮：顶视角铁丝篮位图（透明留白由 CSS 放大处理） */
  function cartImg(skinId) {
    var t = CART_SKINS[skinId] || CART_SKINS.silver;
    return '<img class="cart-svg" src="' + encodeURI(t.src) + '" alt="' + t.name + '" draggable="false">';
  }

  /* 存钱罐：四种独立造型，均保留 Q 版粗描边与圆润比例 */
  function pigSvg(skinId) {
    var id = PIG_THEMES[skinId] ? skinId : 'glass';
    var s = '<svg class="pig-svg" viewBox="0 0 220 180" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      '<g stroke="' + INK + '" stroke-width="4" stroke-linejoin="round" stroke-linecap="round">';

    if (id === 'glass') {
      s += '<rect x="62" y="35" width="96" height="116" rx="34" fill="#DDF4FC"/>' +
           '<rect x="58" y="20" width="104" height="24" rx="11" fill="#EDF9FD"/>' +
           '<rect x="92" y="37" width="36" height="8" rx="4" fill="' + INK + '" stroke="none"/>' +
           '<path d="M78 62 C70 88 76 119 89 136" fill="none" stroke="#FFFFFF" stroke-width="5" opacity=".78"/>' +
           '<circle cx="91" cy="126" r="9" fill="#F3C950" stroke-width="3"/>' +
           '<circle cx="119" cy="132" r="8" fill="#F3C950" stroke-width="3"/>' +
           '<rect x="76" y="148" width="20" height="10" rx="5" fill="#DDF4FC"/>' +
           '<rect x="124" y="148" width="20" height="10" rx="5" fill="#DDF4FC"/>';
    } else if (id === 'burger') {
      s += '<path d="M48 88 C48 50 74 30 110 30 C146 30 172 50 172 88 Z" fill="#F2C56D"/>' +
           '<rect x="96" y="48" width="28" height="7" rx="3" fill="' + INK + '" stroke="none"/>' +
           '<g fill="#FFF3D0" stroke="none">' +
             '<ellipse cx="78" cy="57" rx="7" ry="3" transform="rotate(-18 78 57)"/>' +
             '<ellipse cx="111" cy="42" rx="7" ry="3" transform="rotate(8 111 42)"/>' +
             '<ellipse cx="141" cy="62" rx="7" ry="3" transform="rotate(18 141 62)"/>' +
           '</g>' +
           '<path d="M45 94 C57 86 68 104 82 94 C96 84 108 104 122 94 C136 84 151 104 175 94 L172 110 H48 Z" fill="#7AB95A"/>' +
           '<path d="M49 106 H171 L164 122 H55 Z" fill="#F4C84F"/>' +
           '<rect x="50" y="116" width="120" height="20" rx="9" fill="#9D5B36"/>' +
           '<path d="M50 132 H170 C167 153 145 162 110 162 C75 162 53 153 50 132 Z" fill="#E8B158"/>';
    } else if (id === 'donut') {
      s += '<path fill-rule="evenodd" fill="#E5AA5E" d="' +
             'M110 18 C170 18 198 52 198 90 C198 130 163 158 110 158 C57 158 22 130 22 90 C22 52 50 18 110 18 Z ' +
             'M110 70 C91 70 78 78 78 90 C78 104 92 112 110 112 C128 112 142 104 142 90 C142 78 129 70 110 70 Z"/>' +
           '<path fill-rule="evenodd" fill="#F1AFC6" d="' +
             'M110 25 C162 25 188 56 188 90 C188 123 158 148 110 148 C62 148 32 123 32 90 C32 56 58 25 110 25 Z ' +
             'M110 74 C94 74 84 80 84 90 C84 101 95 106 110 106 C125 106 136 101 136 90 C136 80 126 74 110 74 Z"/>' +
           '<rect x="96" y="29" width="28" height="7" rx="3" fill="' + INK + '" stroke="none"/>' +
           '<g fill="none" stroke-width="5">' +
             '<path d="M67 62 L77 57" stroke="#F4C84F"/>' +
             '<path d="M93 46 L103 52" stroke="#5B91C4"/>' +
             '<path d="M130 47 L139 53" stroke="#7DBE5D"/>' +
             '<path d="M157 65 L165 73" stroke="#F4C84F"/>' +
             '<path d="M62 78 L71 83" stroke="#5B91C4"/>' +
             '<path d="M146 82 L157 82" stroke="#EF892F"/>' +
           '</g>';
    } else {
      s += '<path d="M68 77 C52 101 48 135 60 154 L160 154 C172 135 168 101 152 77 Z" fill="#FFF8E7"/>' +
           '<path d="M72 70 L69 30 L98 48 Z" fill="#FFF8E7"/>' +
           '<path d="M148 70 L151 30 L122 48 Z" fill="#FFF8E7"/>' +
           '<ellipse cx="110" cy="76" rx="49" ry="41" fill="#FFF8E7"/>' +
           '<path d="M63 101 C45 88 39 66 51 55 C63 67 71 81 75 92" fill="#FFF8E7"/>' +
           '<path d="M158 130 C180 121 185 99 176 86" fill="none"/>' +
           '<rect x="96" y="43" width="28" height="7" rx="3" fill="' + INK + '" stroke="none"/>' +
           '<circle cx="93" cy="74" r="4" fill="' + INK + '" stroke="none"/>' +
           '<circle cx="127" cy="74" r="4" fill="' + INK + '" stroke="none"/>' +
           '<path d="M106 84 Q110 88 114 84" fill="none"/>' +
           '<path d="M82 82 H64 M156 82 H138 M84 91 L67 95 M154 91 L171 95" fill="none" stroke-width="3"/>' +
           '<path d="M72 111 H148 L143 124 H77 Z" fill="#F4C84F"/>' +
           '<circle cx="110" cy="128" r="13" fill="#F4C84F" stroke-width="3"/>' +
           '<rect x="106" y="121" width="8" height="14" rx="3" fill="' + INK + '" stroke="none"/>';
    }
    return s + '</g></svg>';
  }

  ZQ.ui.slots = {
    CART_SKINS: Object.keys(CART_SKINS),
    PIG_SKINS: Object.keys(PIG_THEMES),
    cartTheme: function (id) { return CART_SKINS[id] || CART_SKINS.silver; },
    renderCart: cartImg,
    renderPig: pigSvg,
  };
})();
