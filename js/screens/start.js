/* 游戏大厅（Little Chef 风格）：
 *  米白纯底 + 虚线装饰边框 + 角落散落道具插画 + 双层描边大标题 + 顶部统计条 + 双主按钮 + 右侧竖排。
 *  SVG 图标集中在 ICO 对象，后期替换图片资源只改一处。 */
window.ZQ = window.ZQ || {};
ZQ.screens = ZQ.screens || {};

(function () {
  var layer = null;

  /* ---------- 隐藏渐变定义（所有 SVG 共用，避免 id 冲突） ---------- */
  var DEFS = '<svg width="0" height="0" style="position:absolute" aria-hidden="true">' +
    '<defs>' +
      '<linearGradient id="ico-star" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0" stop-color="#FFE473"/><stop offset="1" stop-color="#FFB84D"/>' +
      '</linearGradient>' +
      '<linearGradient id="ico-medal" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0" stop-color="#FFE473"/><stop offset="1" stop-color="#F4A82E"/>' +
      '</linearGradient>' +
      '<radialGradient id="ico-coin" cx=".35" cy=".3" r=".7">' +
        '<stop offset="0" stop-color="#FFF5A3"/><stop offset=".6" stop-color="#FFD84D"/><stop offset="1" stop-color="#D9931F"/>' +
      '</radialGradient>' +
      '<linearGradient id="bg-primary" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0" stop-color="#FFE57A"/><stop offset="1" stop-color="#FFB84D"/>' +
      '</linearGradient>' +
      '<linearGradient id="bg-secondary" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0" stop-color="#7EC4F0"/><stop offset="1" stop-color="#5B91C4"/>' +
      '</linearGradient>' +
    '</defs>' +
  '</svg>';

  /* ---------- 功能图标（顶部统计条 + 按钮内） ---------- */
  var ICO = {
    // 立体星
    star: '<svg viewBox="0 0 40 40" width="1.6cqw" height="1.6cqw" aria-hidden="true">' +
      '<path d="M20 3 L25 15 L38 16 L28 25 L31 38 L20 31 L9 38 L12 25 L2 16 L15 15 Z"' +
        'fill="url(#ico-star)" stroke="#1B3E6F" stroke-width="2.6" stroke-linejoin="round"/>' +
      '<path d="M17 12 L20 6 L23 12" fill="none" stroke="#FFFDF7" stroke-width="2" stroke-linecap="round"/>' +
    '</svg>',

    // 奖章
    medal: '<svg viewBox="0 0 48 48" width="1.6cqw" height="1.6cqw" aria-hidden="true">' +
      '<path d="M12 4 L24 14 L36 4 L36 18 L24 30 L12 18 Z" fill="#E76F6F" stroke="#1B3E6F" stroke-width="2.6" stroke-linejoin="round"/>' +
      '<circle cx="24" cy="30" r="11" fill="url(#ico-medal)" stroke="#1B3E6F" stroke-width="2.6"/>' +
      '<path d="M20 27 L24 23 L28 27 M24 23 L24 33" fill="none" stroke="#1B3E6F" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>' +
    '</svg>',

    // 硬币
    coin: '<svg viewBox="0 0 40 40" width="1.6cqw" height="1.6cqw" aria-hidden="true">' +
      '<circle cx="20" cy="20" r="16" fill="url(#ico-coin)" stroke="#1B3E6F" stroke-width="2.6"/>' +
      '<circle cx="20" cy="20" r="12" fill="none" stroke="#1B3E6F" stroke-width="1.6" opacity=".5"/>' +
      '<path d="M16 15 L24 25 M24 15 L16 25 M13 20 H27" fill="none" stroke="#1B3E6F" stroke-width="2.2" stroke-linecap="round"/>' +
    '</svg>',

    // 齿轮
    gear: '<svg viewBox="0 0 40 40" width="1.6cqw" height="1.6cqw" aria-hidden="true">' +
      '<g fill="none" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round">' +
        '<circle cx="20" cy="20" r="7"/>' +
        '<path d="M20 3 L22 7 M20 33 L22 37 M3 20 L7 18 M33 20 L37 22 M9 9 L12 12 M31 31 L34 34 M31 9 L34 6 M9 31 L12 34"/>' +
      '</g>' +
    '</svg>',

    // 播放三角
    play: '<svg viewBox="0 0 24 24" width="2.6cqw" height="2.6cqw" aria-hidden="true">' +
      '<path d="M6 4 L20 12 L6 20 Z" fill="#FFFDF7" stroke="#1B3E6F" stroke-width="2.6" stroke-linejoin="round"/>' +
    '</svg>',

    // 小购物车
    cart: '<svg viewBox="0 0 48 40" width="2.6cqw" height="2.6cqw" aria-hidden="true">' +
      '<g fill="none" stroke="#1B3E6F" stroke-width="2.6" stroke-linejoin="round">' +
        '<path d="M4 8 H12 L15 26 H40 L37 32 H12 Z" fill="#E8F4FB"/>' +
        '<path d="M18 12 V22 M24 12 V22 M30 12 V22"/>' +
        '<path d="M14 35 A3 3 0 1 0 14.1 35 M35 35 A3 3 0 1 0 35.1 35" fill="#1B3E6F"/>' +
      '</g>' +
    '</svg>',

    // 四宫格
    grid: '<svg viewBox="0 0 32 32" width="2.4cqw" height="2.4cqw" aria-hidden="true">' +
      '<g fill="#FFFDF7" stroke="#1B3E6F" stroke-width="2.6" stroke-linejoin="round">' +
        '<rect x="3" y="3" width="11" height="11" rx="2.5"/>' +
        '<rect x="18" y="3" width="11" height="11" rx="2.5"/>' +
        '<rect x="3" y="18" width="11" height="11" rx="2.5"/>' +
        '<rect x="18" y="18" width="11" height="11" rx="2.5"/>' +
      '</g>' +
    '</svg>',

    // 地图
    map: '<svg viewBox="0 0 40 40" width="2.4cqw" height="2.4cqw" aria-hidden="true">' +
      '<g fill="none" stroke="#1B3E6F" stroke-width="2.6" stroke-linejoin="round">' +
        '<path d="M4 10 L14 6 L26 12 L36 8 L36 32 L26 36 L14 30 L4 34 Z" fill="#E8F4FB"/>' +
        '<path d="M14 6 V30 M26 12 V36"/>' +
        '<circle cx="20" cy="20" r="2.5" fill="#E76F6F"/>' +
      '</g>' +
    '</svg>',

    // 商店招牌
    shop: '<svg viewBox="0 0 40 44" width="2.4cqw" height="2.4cqw" aria-hidden="true">' +
      '<g stroke="#1B3E6F" stroke-width="2.6" stroke-linejoin="round">' +
        '<path d="M3 14 H37 V40 H3 Z" fill="#FFFDF7"/>' +
        '<path d="M3 14 L3 8 Q20 2 37 8 L37 14 Z" fill="#F4E3B8"/>' +
        '<rect x="9" y="20" width="22" height="14" fill="#B8E0D2"/>' +
      '</g>' +
    '</svg>',

    // 背包
    backpack: '<svg viewBox="0 0 36 40" width="2.4cqw" height="2.4cqw" aria-hidden="true">' +
      '<g stroke="#1B3E6F" stroke-width="2.6" stroke-linejoin="round">' +
        '<path d="M7 16 Q7 6 18 6 Q29 6 29 16 L29 36 L7 36 Z" fill="#D4A574"/>' +
        '<path d="M14 6 V14 M22 6 V14" fill="none"/>' +
        '<rect x="11" y="18" width="14" height="10" rx="2" fill="#FFFDF7"/>' +
        '<path d="M17 23 H19" fill="none"/>' +
      '</g>' +
    '</svg>',
  };

  /* ---------- 玩法说明弹窗（保留，触发点后续改到首次进地图前） ---------- */
  function howToHTML() {
    return '<div class="howto-block">' +
        '<div class="howto-head">' + ZQ.I18N.howToGoalTitle + '</div>' +
        '<p>' + ZQ.I18N.howToGoalText + '</p>' +
      '</div>' +
      '<div class="howto-block">' +
        '<div class="howto-head">' + ZQ.I18N.howToCoinsTitle + '</div>' +
        '<ul class="howto-list">' +
          '<li><b class="howto-mode">' + ZQ.I18N.howToSavingMode + '</b>：' +
            ZQ.I18N.howToSavingText + '</li>' +
          '<li><b class="howto-mode">' + ZQ.I18N.howToPerfectMode + '</b>：' +
            ZQ.I18N.howToPerfectText.replace('{n}', ZQ.MOM_BONUS_COINS) +
            '<span class="howto-first">（' + ZQ.I18N.howToFirstOnly + '）</span></li>' +
        '</ul>' +
      '</div>';
  }

  function openModal(o) {
    layer = layer || document.getElementById('modal-layer');
    if (!layer) return;
    layer.innerHTML = '';
    var mask = document.createElement('div');
    mask.className = 'modal-mask';
    mask.innerHTML =
      '<div class="modal-simple">' +
        '<div class="ms-title">' + o.title + '</div>' +
        '<div class="ms-text' + (o.rich ? ' is-rich' : '') + '">' + (o.html || o.text) + '</div>' +
        '<div class="ms-actions">' +
          (o.cancel
            ? '<button class="btn-result btn-ghost ms-cancel" type="button">' + o.cancel + '</button>'
            : '') +
          '<button class="btn-result btn-primary ms-ok" type="button">' + o.ok + '</button>' +
        '</div>' +
      '</div>';
    layer.appendChild(mask);
    requestAnimationFrame(function () { mask.classList.add('is-in'); });
    mask.querySelector('.ms-ok').addEventListener('click', function () {
      ZQ.audio.click(); closeModal();
      if (o.onOk) o.onOk();
    });
    var c = mask.querySelector('.ms-cancel');
    if (c) c.addEventListener('click', function () { ZQ.audio.back(); closeModal(); });
    return mask;
  }

  function closeModal() {
    layer = layer || document.getElementById('modal-layer');
    if (layer) layer.innerHTML = '';
  }

  /* ---------- 主渲染 ---------- */
  ZQ.screens.start = {
    render: function () {
      if (!ZQ.store.data) ZQ.store.load();
      var saved = ZQ.store.data || {};
      var hasProgress = ZQ.store.totalStars() > 0 || (saved.coins || 0) > 0 || (saved.delayCards || 0) > 0;
      var totalStars = ZQ.store.totalStars();
      var threeStars = ZQ.store.threeStars ? ZQ.store.threeStars() : Object.keys(saved.threeStarLedger || {}).filter(function (k) { return saved.threeStarLedger[k]; }).length;
      var coins = saved.coins || 0;

      var el = document.createElement('div');
      el.className = 'stage screen-start';
      el.innerHTML =
        // 渐变 defs
        DEFS +

        // 米白背景 + 隐藏旧地板
        '<div class="hall-bg"></div>' +

        // 左侧妈妈人物
        '<img class="hall-mom" src="图标素材/妈妈人物.PNG" alt="妈妈" aria-hidden="true">' +

        // 顶部横排：星数 / 三星数 / 零花钱 / 设置
        '<div class="top-bar">' +
          '<div class="top-pill">' + ICO.star + '<span>' + totalStars + '</span></div>' +
          '<div class="top-pill">' + ICO.medal + '<span>' + threeStars + '</span></div>' +
          '<div class="top-pill">' + ICO.coin + '<span>' + coins + '</span></div>' +
          '<button class="btn-settings" type="button" aria-label="' + ZQ.I18N.btnSettings + '"><img src="图标素材/设置.PNG" alt=""></button>' +
        '</div>' +

        // 中央标题图片（居中偏上）
        '<div class="hall-title">' +
          '<img src="便利店购物大作战标题.PNG" alt="' + ZQ.I18N.title + '">' +
        '</div>' +

        // 中央双主按钮
        '<div class="hall-buttons">' +
          '<button class="btn-hall btn-hall-primary" type="button">' +
            '<span class="btn-icon">' + ICO.play + '</span>' +
            '<span class="btn-text">' + (hasProgress ? ZQ.I18N.startContinue : ZQ.I18N.startBegin) + '</span>' +
            '<span class="btn-icon">' + ICO.cart + '</span>' +
          '</button>' +
          '<button class="btn-hall btn-hall-secondary" type="button">' +
            '<span class="btn-icon">' + ICO.grid + '</span>' +
            '<span class="btn-text">' + ZQ.I18N.startLevelSelect + '</span>' +
            '<span class="btn-icon">' + ICO.map + '</span>' +
          '</button>' +
        '</div>' +

        // 右侧竖排：商店 / 道具
        '<div class="hall-side">' +
          '<button class="btn-side" type="button">' +
            '<span class="btn-side-icon"><img src="图标素材/商店.PNG" alt=""></span>' +
            '<span class="btn-side-label">' + ZQ.I18N.btnShop + '</span>' +
          '</button>' +
          '<button class="btn-side" type="button">' +
            '<span class="btn-side-icon"><img src="图标素材/皮肤.PNG" alt=""></span>' +
            '<span class="btn-side-label">' + ZQ.I18N.btnItem + '</span>' +
          '</button>' +
        '</div>';

      /* ---------- 事件绑定 ---------- */
      el.querySelector('.btn-hall-primary').addEventListener('click', function () {
        ZQ.audio.unlock(); ZQ.audio.click();
        ZQ.app.go('map');
      });
      el.querySelector('.btn-hall-secondary').addEventListener('click', function () {
        ZQ.audio.unlock(); ZQ.audio.click();
        ZQ.app.go('map');
      });
      el.querySelector('.btn-side:nth-child(1)').addEventListener('click', function () {
        ZQ.audio.click();
        if (ZQ.screens.shop) ZQ.app.go('shop');
      });
      el.querySelector('.btn-side:nth-child(2)').addEventListener('click', function () {
        ZQ.audio.click();
        if (ZQ.screens.skins) ZQ.app.go('skins');
      });
      el.querySelector('.btn-settings').addEventListener('click', function () {
        ZQ.audio.click();
        var cur = ZQ.store.data && ZQ.store.data.settings && ZQ.store.data.settings.sound !== false;
        openModal({
          title: ZQ.I18N.btnSettings,
          html: '<div style="font-size:2.2cqw;line-height:1.8">' +
            '<label style="display:flex;align-items:center;gap:.8cqw;cursor:pointer">' +
              '<input type="checkbox" id="sound-toggle" ' + (cur ? 'checked' : '') + ' style="width:1.6cqw;height:1.6cqw">' +
              '<span>音效' + (cur ? '（已开启）' : '（已关闭）') + '</span>' +
            '</label>' +
          '</div>',
          rich: true,
          ok: ZQ.I18N.btnOk,
          onOk: function () {
            var cb = document.getElementById('sound-toggle');
            if (cb) ZQ.audio.setEnabled(cb.checked);
          },
        });
      });

      return el;
    },

    close: closeModal,
  };
})();
