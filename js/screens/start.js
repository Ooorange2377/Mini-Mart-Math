/* 开始页：招牌标题 + Q 版购物车入场动画 + 开始/继续游戏、玩法说明、重置存档。
 * 「继续游戏」的显示条件：存在任何进度（历史星数 / 零花钱 / 延时卡片）。 */
window.ZQ = window.ZQ || {};
ZQ.screens = ZQ.screens || {};

(function () {
  var layer = null;

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

  function startCartHTML() {
    return '<div class="start-cart" aria-hidden="true">' +
        '<div class="start-cart-float">' +
          '<div class="start-cart-visual">' +
              '<svg class="start-cart-back" viewBox="0 0 340 250">' +
                '<path d="M68 76 H296 L266 174 H88 Z" fill="#E8F4FB" ' +
                  'stroke="#1B3E6F" stroke-width="7" stroke-linejoin="round"/>' +
                '<path d="M82 93 H284" stroke="#FFFDF7" stroke-width="4" ' +
                  'stroke-linecap="round" opacity=".9"/>' +
              '</svg>' +
              '<svg class="start-cart-front" viewBox="0 0 340 250">' +
                '<g fill="none" stroke="#1B3E6F" stroke-width="6" ' +
                  'stroke-linecap="round" stroke-linejoin="round">' +
                  '<path d="M68 76 H296 L266 174 H88 Z"/>' +
                  '<path d="M91 77 L104 173 M132 77 L138 173 M174 77 L171 173 ' +
                    'M216 77 L204 173 M258 77 L237 173"/>' +
                  '<path d="M76 98 H288 M84 122 H278 M92 146 H268"/>' +
                  '<path d="M91 174 L108 195 M264 174 L247 195"/>' +
                  '<path d="M296 82 C316 82 323 72 327 57 L336 48"/>' +
                '</g>' +
                '<path d="M334 49 L344 42" stroke="#1B3E6F" stroke-width="15" ' +
                  'stroke-linecap="round"/>' +
                '<path d="M334 49 L344 42" stroke="#F4E3B8" stroke-width="8" ' +
                  'stroke-linecap="round"/>' +
                '<g transform="translate(118 210)">' +
                  '<g class="start-cart-wheel">' +
                    '<circle r="21" fill="#FFFDF7" stroke="#1B3E6F" stroke-width="6"/>' +
                    '<path d="M-13 0 H13 M0 -13 V13" stroke="#5B91C4" ' +
                      'stroke-width="5" stroke-linecap="round"/>' +
                    '<circle r="4" fill="#EF892F" stroke="#1B3E6F" stroke-width="3"/>' +
                  '</g>' +
                '</g>' +
                '<g transform="translate(242 210)">' +
                  '<g class="start-cart-wheel">' +
                    '<circle r="21" fill="#FFFDF7" stroke="#1B3E6F" stroke-width="6"/>' +
                    '<path d="M-13 0 H13 M0 -13 V13" stroke="#5B91C4" ' +
                      'stroke-width="5" stroke-linecap="round"/>' +
                    '<circle r="4" fill="#EF892F" stroke="#1B3E6F" stroke-width="3"/>' +
                  '</g>' +
                '</g>' +
              '</svg>' +
          '</div>' +
        '</div>' +
      '</div>';
  }

  /** 通用小弹窗：标题 + 正文 + 确定（可选：取消）；只走 #modal-layer */
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
      ZQ.audio.click();
      closeModal();
      if (o.onOk) o.onOk();
    });
    var c = mask.querySelector('.ms-cancel');
    if (c) {
      c.addEventListener('click', function () {
        ZQ.audio.back();
        closeModal();
      });
    }
    return mask;
  }

  function closeModal() {
    layer = layer || document.getElementById('modal-layer');
    if (layer) layer.innerHTML = '';
  }

  ZQ.screens.start = {
    /** @returns {HTMLElement} */
    render: function () {
      if (!ZQ.store.data) ZQ.store.load();
      var saved = ZQ.store.data || {};
      var hasProgress = ZQ.store.totalStars() > 0 || (saved.coins || 0) > 0 || (saved.delayCards || 0) > 0;

      var el = document.createElement('div');
      el.className = 'stage screen-start';
      el.innerHTML =
        '<div class="room"><div class="room-floor"></div></div>' +

        // 顶部招牌（雨棚条纹 + 黄底招牌）
        '<div class="start-board">' +
          '<div class="board-awning"></div>' +
          '<div class="board-face">' +
            '<div class="start-title">' + ZQ.I18N.title + '</div>' +
            '<div class="start-sub">' + ZQ.I18N.subtitle + '</div>' +
          '</div>' +
        '</div>' +

        // 中央偏下：Q 版购物车滑入并停在主视觉区域
        startCartHTML() +

        // 底部菜单
        '<div class="start-menu">' +
          '<button class="btn-menu btn-start" type="button">' +
            (hasProgress ? ZQ.I18N.startContinue : ZQ.I18N.startBegin) +
          '</button>' +
          '<div class="menu-row">' +
            '<button class="btn-menu btn-howto" type="button">' + ZQ.I18N.startHowTo + '</button>' +
            '<button class="btn-menu btn-reset" type="button">' + ZQ.I18N.startReset + '</button>' +
          '</div>' +
        '</div>';

      el.querySelector('.btn-start').addEventListener('click', function () {
        ZQ.audio.unlock();
        ZQ.audio.click();
        ZQ.app.go('map');
      });

      el.querySelector('.btn-howto').addEventListener('click', function () {
        ZQ.audio.click();
        openModal({
          title: ZQ.I18N.startHowTo,
          html: howToHTML(),
          rich: true,
          ok: ZQ.I18N.btnOk,
        });
      });

      el.querySelector('.btn-reset').addEventListener('click', function () {
        ZQ.audio.click();
        openModal({
          title: ZQ.I18N.startReset,
          text: ZQ.I18N.resetConfirm,
          ok: ZQ.I18N.btnOk,
          cancel: ZQ.I18N.btnCancel,
          onOk: function () {
            ZQ.store.reset();
            ZQ.audio.setEnabled(!(ZQ.store.data.settings && ZQ.store.data.settings.sound === false));
            ZQ.ui.toast.show(ZQ.I18N.toastResetDone, { type: 'good' });
            ZQ.app.render();
          },
        });
      });

      return el;
    },

    close: closeModal,
  };
})();
