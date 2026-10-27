/* 结算弹窗：星级圆弧 + 数据面板（总价/预算、零花钱、三星通关数）+ 鼓励话术 + 按钮。
 * 挂载到 #modal-layer，关闭即清空该层。数值由调用方（game.js）算好后传入。 */
window.ZQ = window.ZQ || {};
ZQ.screens = ZQ.screens || {};

(function () {
  /** 三颗星槽位：前 star 颗点亮，其余置灰；圆弧与逐颗入场由 CSS 负责 */
  function starHTML(star) {
    var html = '';
    for (var i = 1; i <= 3; i++) {
      html += '<span class="r-star s' + i + (i <= star ? '' : ' is-dim') + '">' +
                '<svg class="star-in" viewBox="0 0 100 100" aria-hidden="true">' +
                  '<path d="M50 8 L60.3 35.8 L90 37 L66.6 55.4 ' +
                    'L74.7 84 L50 67.5 L25.3 84 L33.4 55.4 L10 37 L39.7 35.8 Z"/>' +
                '</svg>' +
              '</span>';
    }
    return html;
  }

  ZQ.screens.result = {
    /**
     * 展示结算弹窗。
     * @param {object} ctx
     *   lv, star, total, budget, coins, momBonus, firstThreeStar,
     *   onRetry, onNext, onMap  —— 按钮回调（调用方负责关闭弹窗与路由）
     * @returns {HTMLElement|undefined}
     */
    show: function (ctx) {
      var layer = document.getElementById('modal-layer');
      if (!layer) return;

      layer.innerHTML = '';
      var fail = ctx.star === 0;
      var resultText = ctx.invalidReason === 'count'
        ? ZQ.I18N.resultInvalidCount
        : (ctx.invalidReason === 'constraint' ? ZQ.I18N.resultInvalidConstraint : ZQ.rules.resultText(ctx.star));
      var eq = (ZQ.store.data && ZQ.store.data.equipped) || {};
      var pigSkin = eq.pig || 'glass';

      var mask = document.createElement('div');
      mask.className = 'modal-mask';
      mask.innerHTML =
        '<div class="modal-result" data-star="' + ctx.star + '">' +
          '<div class="result-stars">' + starHTML(ctx.star) + '</div>' +
          '<div class="r-word">' + ZQ.rules.resultWord(ctx.star) + '</div>' +
          '<div class="result-panel">' +
            '<div class="r-row r-total">' +
              '<span class="r-k">' + ZQ.I18N.resultTotal + '</span>' +
              '<b>' + ZQ.money.yuan2(ctx.total) + '</b>' +
              '<span class="r-slash">/</span>' +
              '<span class="r-k">' + ZQ.I18N.resultBudget + '</span>' +
              '<b>' + ZQ.money.yuan2(ctx.budget) + '</b>' +
            '</div>' +
            (ctx.momBonus > 0
              ? '<div class="r-row r-coins r-mom-bonus"><i class="ic-img ic-img-coin"></i>' + ZQ.I18N.resultMomBonus + ZQ.I18N.colon +
                  '<b class="coins-num">+' + ctx.momBonus + '</b>' +
                '</div>'
              : (ctx.coins > 0
              ? '<div class="r-row r-coins"><i class="ic-img ic-img-coin"></i>' + ZQ.I18N.resultCoins + ZQ.I18N.colon +
                  '<b class="coins-num">+' + ctx.coins + '</b>' +
                '</div>'
              : '')) +
            (ctx.firstThreeStar
              ? '<div class="r-row r-medal"><i class="ic-img ic-img-medal"></i>' + ZQ.I18N.resultThreeStar + ZQ.I18N.colon + '<b>+1</b></div>'
              : '') +
            '<div class="r-text">' + resultText + '</div>' +
            '<div class="r-actions">' +
              '<button class="btn-result btn-primary" type="button">' +
                (fail ? ZQ.I18N.resultBtnRetry : ZQ.I18N.resultBtnNext) +
              '</button>' +
              '<button class="btn-result btn-ghost" type="button">' +
                ZQ.I18N.resultBtnMap +
              '</button>' +
            '</div>' +
          '</div>' +
        '</div>';

      layer.appendChild(mask);
      requestAnimationFrame(function () { mask.classList.add('is-in'); });

      // 音效：星星逐颗响起；整体胜/负音在星星入场后兜底
      for (var i = 1; i <= ctx.star; i++) ZQ.audio.star(i);
      setTimeout(function () {
        if (ctx.star > 0) ZQ.audio.win(); else ZQ.audio.lose();
      }, fail ? 160 : 560);

      // 按钮：直接调用原回调 + 关闭结算弹窗
      mask.querySelector('.btn-primary').addEventListener('click', function () {
        ZQ.audio.click();
        var ok = fail ? ctx.onRetry : ctx.onNext;
        ZQ.screens.result.close();
        ok && ok();
      });
      mask.querySelector('.btn-ghost').addEventListener('click', function () {
        ZQ.audio.back();
        ZQ.screens.result.close();
        ctx.onMap && ctx.onMap();
      });

      // 自动存钱罐仪式：有零花钱才弹（失败星/没奖励不弹），叠在结算弹窗之上
      if (!fail && ctx.coins > 0) {
        window.setTimeout(function () {
          ZQ.screens.pigshow.show({ skin: pigSkin, coins: ctx.coins });
        }, 800);
      }
      return mask;
    },

    close: function () {
      var layer = document.getElementById('modal-layer');
      if (layer) layer.innerHTML = '';
    },
  };
})();
