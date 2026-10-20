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
                '<i class="star-in">★</i>' +
              '</span>';
    }
    return html;
  }

  /** 数字滚动递增：+0 → +total（分若干步，避免只跳一次） */
  function countUp(el, total, dur) {
    if (!el) return;
    var steps = Math.min(total, 8);
    var per = Math.max(1, Math.ceil(total / steps));
    var cur = 0;
    el.textContent = '+0';
    var timer = window.setInterval(function () {
      cur += per;
      if (cur >= total) { cur = total; window.clearInterval(timer); }
      el.textContent = '+' + cur;
    }, Math.max(55, dur / steps));
  }

  /** 单枚硬币：从存钱罐上方落下，命中后挤一下存钱罐并响一声 */
  function dropCoin(pigBox, pigEl) {
    var size = Math.max(11, pigBox.width * 0.42);
    var fromX = pigBox.left + pigBox.width * (0.28 + Math.random() * 0.44);
    var fromY = pigBox.top - pigBox.height * 1.7;

    var wrap = document.createElement('div');
    wrap.className = 'fx-fly';
    wrap.style.left = fromX + 'px';
    wrap.style.top = fromY + 'px';
    wrap.style.width = size + 'px';
    wrap.style.height = size + 'px';
    wrap.style.setProperty('--dy', ((pigBox.top + pigBox.height * 0.62) - fromY).toFixed(1) + 'px');
    wrap.style.setProperty('--lift', '6px');
    wrap.style.setProperty('--fly-dur', '0.42s');
    wrap.innerHTML = '<div class="fx-fly-x"><div class="fx-fly-y"><span class="coin"></span></div></div>';
    document.body.appendChild(wrap);

    var done = false;
    function finish() {
      if (done) return;
      done = true;
      if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
      pigEl.classList.remove('is-hit');
      void pigEl.offsetWidth;
      pigEl.classList.add('is-hit');
      ZQ.audio.coin();
    }
    wrap.querySelector('.fx-fly-y').addEventListener('animationend', finish);
    window.setTimeout(finish, 700);   // 动画事件兜底
  }

  /** 硬币落罐：逐枚错峰落下（数量随零花钱自适应，最多 6 枚） */
  function coinRain(pigEl, total) {
    if (!pigEl) return;
    var box = pigEl.getBoundingClientRect();
    if (box.width < 2) return;
    var n = Math.min(6, Math.max(3, total));
    for (var i = 0; i < n; i++) {
      (function (i) {
        window.setTimeout(function () {
          var b = pigEl.getBoundingClientRect();   // 重测：弹窗缩放动画结束后位置已稳定
          dropCoin(b, pigEl);
        }, i * 120);
      })(i);
    }
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
              ? '<div class="r-row r-coins r-mom-bonus">💰 ' + ZQ.I18N.resultMomBonus + '：' +
                  '<b class="coins-num">+0</b>' +
                  '<span class="coins-pig" title="' + ZQ.I18N.mapCoins + '">' +
                    ZQ.ui.slots.renderPig(pigSkin) +
                  '</span>' +
                '</div>'
              : (ctx.coins > 0
              ? '<div class="r-row r-coins">💰 ' + ZQ.I18N.resultCoins + '：' +
                  '<b class="coins-num">+0</b>' +
                  '<span class="coins-pig" title="' + ZQ.I18N.mapCoins + '">' +
                    ZQ.ui.slots.renderPig(pigSkin) +
                  '</span>' +
                '</div>'
              : '')) +
            (ctx.firstThreeStar
              ? '<div class="r-row r-medal">🏅 ' + ZQ.I18N.resultThreeStar + '：<b>+1</b></div>'
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

      // 硬币落罐 + 数字滚动：等弹窗缩放动画（.3s）稳定后再测量存钱罐位置，避免落点错位
      if (ctx.coins > 0) {
        window.setTimeout(function () {
          var numEl = mask.querySelector('.coins-num');
          var pigEl = mask.querySelector('.coins-pig');
          if (numEl) countUp(numEl, ctx.coins, 700);
          coinRain(pigEl, ctx.coins);
        }, 360);
      }

      // 音效：星星逐颗响起；整体胜/负音在星星入场后兜底
      for (var i = 1; i <= ctx.star; i++) ZQ.audio.star(i);
      setTimeout(function () {
        if (ctx.star > 0) ZQ.audio.win(); else ZQ.audio.lose();
      }, fail ? 160 : 560);

      mask.querySelector('.btn-primary').addEventListener('click', function () {
        ZQ.audio.click();
        if (fail) ctx.onRetry(); else ctx.onNext();
      });
      mask.querySelector('.btn-ghost').addEventListener('click', function () {
        ZQ.audio.back();
        ctx.onMap();
      });
      return mask;
    },

    close: function () {
      var layer = document.getElementById('modal-layer');
      if (layer) layer.innerHTML = '';
    },
  };
})();
