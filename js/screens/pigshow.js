/* 存钱罐仪式弹窗：结算后紧接着的全屏视觉奖励。
 * 浅黑遮罩叠加在结算弹窗之上，仅展示存钱罐 + 金币动画。
 * 根据当前装备的存钱罐皮肤分发三套完全不同的特效序列：
 *   glass  —— 金币从顶部掉进玻璃瓶口
 *   gacha  —— 摇杆咔哒旋转 → 扭蛋咕噜滚出 → 弹开 → 随机奖励（40% 零花钱 / 30% 延时卡 / 30% 谢谢惠顾）
 *   ufo    —— 绿色光束亮起 → 吸起金币 → 绕屏幕中心一圈 → 嗖声飞走
 * 动画结束后 1s 自动淡出回到结算弹窗。
 * 所有动画靠 CSS keyframes 驱动，JS 只负责编排时序与音效。 */
window.ZQ = window.ZQ || {};
ZQ.screens = ZQ.screens || {};

(function () {
  var INK = '#1B3E6F';

  /** 生成一枚金币 DOM（绝对定位到遮罩内，坐标由 runXXX 设定） */
  function coinEl(size) {
    var w = size || 34;
    var el = document.createElement('div');
    el.className = 'ceremony-coin';
    el.style.width = w + 'px';
    el.style.height = w + 'px';
    el.innerHTML = '<div class="ceremony-coin-face">¥</div>';
    return el;
  }

  /** 随机整数：[min, max] 闭区间 */
  function rint(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

  /** 极简 countUp：把 el 里的数字滚到 target（纯数字，不带 + 号） */
  function countUp(el, target, dur) {
    var cur = parseInt((el.textContent || '0').replace(/\D/g, ''), 10) || 0;
    if (target <= cur) { el.textContent = target; return; }
    var steps = 18;
    var stepDur = Math.max(20, (dur || 420) / steps);
    var delta = target - cur;
    var i = 0;
    var timer = window.setInterval(function () {
      i++;
      cur += Math.round(delta / (steps - i + 1));
      if (cur >= target) cur = target;
      el.textContent = cur;
      if (cur >= target || i >= steps) window.clearInterval(timer);
    }, stepDur);
  }

  /** 极简外壳：jar-clipped 层(z3) 放罐内金币（被 clip-path 硬裁 + SVG 罐身盖住），pig(z5) 是 SVG 罐子本身。gacha/ufo 时 jar-clipped 为空、hidden。 */
  function shellHTML(skinId, initialTotal) {
    var init = initialTotal || 0;
    return '' +
      '<div class="ceremony-stage">' +
        '<div class="ceremony-jar-clipped"></div>' +
        '<div class="ceremony-coins"></div>' +
        '<div class="ceremony-pig">' +
          (ZQ.ui.slots.renderPig(skinId)) +
        '</div>' +
        '<div class="ceremony-total">零花钱：<b>' + init + '</b></div>' +
        '<div class="ceremony-gacha-capsule" aria-hidden="true">' +
          '<div class="cap-top"></div><div class="cap-bottom"></div>' +
        '</div>' +
        '<div class="ceremony-reward" role="status" aria-live="polite"></div>' +
      '</div>';
  }

  function mount(ctx) {
    var layer = document.getElementById('modal-layer');
    if (!layer) return null;
    // 初始值 = 当前 store 总零花钱 - 本次新增（因为结算时 store 已先加过）
    var storeCoins = (ZQ.store && ZQ.store.data && ZQ.store.data.coins) || 0;
    var initialTotal = Math.max(0, storeCoins - (ctx.coins || 0));
    var wrap = document.createElement('div');
    wrap.className = 'modal-mask is-ceremony';
    wrap.innerHTML = shellHTML(ctx.skin, initialTotal);
    layer.appendChild(wrap);
    requestAnimationFrame(function () { wrap.classList.add('is-in'); });
    return wrap;
  }

  /** —— 分支 1：玻璃罐 —— clip-path 硬裁不溢出 + 静态金币堆(store 历史)+ 本次动画掉落 + 底部总量滚动 */
  function runGlass(wrap, finishLater, coinCount) {
    var pig = wrap.querySelector('.ceremony-pig');
    var clipped = wrap.querySelector('.ceremony-jar-clipped');
    var totalEl = wrap.querySelector('.ceremony-total b');
    var pigBox = pig.getBoundingClientRect();

    // 罐身 rect (viewBox): x=62 y=35 w=96 h=116 rx=34 —— 缩放成绝对像素
    var pw = pigBox.width, ph = pigBox.height;
    var jarLeft = pigBox.left + pw * (62 / 220);
    var jarTop  = pigBox.top  + ph * (35 / 180);
    var jarW    = pw * (96 / 220);
    var jarH    = ph * (116 / 180);
    var jarRx   = Math.round(jarW * 34 / 96);   // rx 按比例缩

    // 动态设置 jar-clipped：绝对定位匹配罐身 rect + clip-path 硬裁
    clipped.style.left   = jarLeft + 'px';
    clipped.style.top    = jarTop + 'px';
    clipped.style.width  = jarW + 'px';
    clipped.style.height = jarH + 'px';
    clipped.style.clipPath = 'inset(0 round ' + jarRx + 'px)';
    clipped.style.webkitClipPath = 'inset(0 round ' + jarRx + 'px)';

    // —— 静态金币堆：store 历史总量（即 baseTotal），上限 8 枚，罐底内堆叠 ——
    var baseTotal = parseInt((totalEl && totalEl.textContent) || '0', 10) || 0;
    var pileCount = Math.min(baseTotal, 8);
    var coinD = 28;   // 金币直径（跟 coinEl(28) 统一）
    // 堆叠策略：底行优先，每行最多 floor((jarW - 4) / (coinD + 3))，层间交错 1/2 金币
    var perRow = Math.max(1, Math.floor((jarW - 4) / (coinD + 3)));
    var rows = [];
    for (var k = 0; k < pileCount; k++) {
      var row = Math.floor(k / perRow);
      var col = k % perRow;
      var xOffset = row % 2 === 1 ? coinD / 2 : 0;
      rows.push({
        // 相对 jar-clipped 的坐标系（0,0 就是 jar-clipped 左上角）
        x: 4 + col * (coinD + 3) + xOffset,
        // 从底部 jarH - coinD/2 - 4 往上每层 coinD+3
        y: jarH - coinD - 4 - row * (coinD - 6),
      });
    }
    rows.forEach(function (pos) {
      var c = coinEl(coinD);
      c.style.left = pos.x + 'px';
      c.style.top  = pos.y + 'px';
      c.style.opacity = '0.62';
      c.style.transform = 'translate(0, 0)';
      clipped.appendChild(c);
    });

    // —— 本次新增的动画金币（coinCount 精确对应，上限 15）——
    var num = Math.min(Math.max(1, coinCount || 1), 15);
    var done = 0;

    function onHit() {
      pig.classList.remove('is-hit'); void pig.offsetWidth; pig.classList.add('is-hit');
      ZQ.audio.coin();
      done++;
      if (totalEl) countUp(totalEl, baseTotal + done, 360);
      if (done >= num) {
        window.setTimeout(finishLater, 2100);   // 最后一枚落底后多停 1s 回味
      }
    }

    // 动画金币也放到 jar-clipped（clip-path 硬裁保证不超出）
    // 起点在 jar-clipped 内部靠上（投币口下方，相对 jar-clipped 的 y≈10），竖直掉到底部随机位置
    for (var i = 0; i < num; i++) {
      var coin = coinEl(30);
      var landX = Math.max(4, Math.min(jarW - 34, (jarW - 8) * Math.random() + 4));
      var landY = Math.max(jarH - 34 - 10, jarH - 34 - 6 - Math.random() * 10);
      var coinTopStart = 10;   // jar-clipped 内部相对坐标，对应 SVG 投币口下方
      coin.style.left = landX + 'px';
      coin.style.top  = coinTopStart + 'px';
      coin.style.setProperty('--end-y', (landY - coinTopStart) + 'px');
      coin.style.setProperty('--fall-dur', (0.62 + Math.random() * 0.12).toFixed(2) + 's');
      clipped.appendChild(coin);
      (function (el, delay) {
        window.setTimeout(function () {
          el.classList.add('is-fall');
          el.addEventListener('animationend', onHit, { once: true });
        }, delay);
      })(coin, i * 170);
    }
  }

  /** —— 分支 2：扭蛋机 —— 投币 → 震动+叮 → 摇杆卡顿旋转+扭蛋翻滚 → 出蛋弹跳 → 蚌壳开蛋 → 纸条蹦出 */
  function runGacha(wrap, finishLater) {
    var pig = wrap.querySelector('.ceremony-pig');
    var gacha = pig.querySelector('.pig-gacha');
    var balls = pig.querySelector('.pig-gacha-balls');
    var crank = pig.querySelector('.gacha-crank');
    var coinsBox = wrap.querySelector('.ceremony-coins');
    var capsule = wrap.querySelector('.ceremony-gacha-capsule');
    var rewardEl = wrap.querySelector('.ceremony-reward');

    // 坐标参考：所有元素靠 pig.getBoundingClientRect() 定位，用 requestAnimationFrame 等布局稳定
    requestAnimationFrame(function () {
      var pigBox = pig.getBoundingClientRect();

      // —— Step 1: 投币（t=0 开始下落，精准掉入圆球罩顶部投币口）——
      // 投币口在新猫咪扭蛋机 SVG viewBox (110, 16.5)
      var slotCenterX = pigBox.left + pigBox.width * (110 / 220);       // 50%
      var slotCenterY = pigBox.top + pigBox.height * (16.5 / 180);       // 9.2%（比之前更高）
      var coin = coinEl(26);
      var startOffset = 150;   // 投币口上方起始距离
      coin.style.left = slotCenterX + 'px';
      coin.style.top = (slotCenterY - startOffset) + 'px';
      coin.style.setProperty('--end-y', startOffset + 'px');            // 下落距离 = startOffset
      coin.style.setProperty('--fall-dur', '.72s');
      coinsBox.appendChild(coin);
      coin.classList.add('is-slot-fall');

      // —— Step 2: 硬币入槽瞬间（~t=720ms）→ 机身震动（Squash & Stretch）+ 叮声 ——
      window.setTimeout(function () {
        gacha.classList.add('is-shake');
        ZQ.audio.coin();   // 复用 coin 音效做「叮」
      }, 720);

      // —— Step 3: 摇杆卡顿旋转 + 扭蛋群疯狂翻滚（~t=900ms 启动）——
      window.setTimeout(function () {
        if (crank) {
          crank.classList.add('is-crank');
          var crankTicker = window.setInterval(function () { ZQ.audio.crank(); }, 130);
          window.setTimeout(function () { window.clearInterval(crankTicker); }, 1700);
        }
        if (balls) balls.classList.add('is-tumble');
      }, 900);

      // —— Step 4: 摇杆/翻滚结束（~t=2550ms），扭蛋从机身底部出蛋口滑出并弹跳两下 ——
      window.setTimeout(function () {
        if (balls) balls.classList.remove('is-tumble');
        ZQ.audio.gachaDrop();

        // 新猫咪款出蛋口位置：SVG viewBox (110, 150)，占比 150/180 ≈ 83.3%
        var exitX = pigBox.left + pigBox.width * (110 / 220);
        var exitY = pigBox.top + pigBox.height * (150 / 180);
        capsule.style.left = exitX + 'px';
        capsule.style.top = exitY + 'px';
        capsule.classList.add('is-slide-out');
      }, 2650);

      // —— Step 5: 扭蛋弹开（~t=3900ms）→ 蚌壳开蛋 + 随机奖励纸条 ——
      window.setTimeout(function () {
        ZQ.audio.gachaPop();
        capsule.classList.add('is-pop');

        var roll = Math.random();
        var reward, text;
        if (roll < 0.40) {
          reward = 'coin'; text = '零花钱 ×1';
          ZQ.store.addCoins(1);
        } else if (roll < 0.70) {
          reward = 'card'; text = '延时卡 ×1';
          ZQ.store.addCards(1);
        } else {
          reward = 'none'; text = '谢谢惠顾';
        }

        // 纸条从开蛋位置蹦出（位置随扭蛋弹出稍偏右下）
        var capBox = capsule.getBoundingClientRect();
        rewardEl.style.left = capBox.left + 'px';
        rewardEl.style.top  = (capBox.top - 10) + 'px';
        rewardEl.textContent = text;
        rewardEl.classList.add('is-in');
        if (reward === 'none') ZQ.audio.rewardAw(); else ZQ.audio.rewardDing();

        // 纸条展示 1.1s + 回味 1s → 自动消失
        window.setTimeout(finishLater, 2100);
      }, 3900);
    });
  }

  /** —— 分支 3：UFO —— 先落一币到底部光束罩 → 光束亮起 → 多币吸起 → 绕圈 → 飞走 */
  function runUfo(wrap, finishLater, coinCount) {
    var pig = wrap.querySelector('.ceremony-pig');
    var coinsBox = wrap.querySelector('.ceremony-coins');
    var hood = pig.querySelector('.ufo-beam-hood');

    requestAnimationFrame(function () {
      var pigBox = pig.getBoundingClientRect();
      // UFO 底部光束罩中心：SVG viewBox cx=110 cy=132（占比 110/220=50%, 132/180≈73.3%）
      var hoodCenterX = pigBox.left + pigBox.width * 0.50;
      var hoodCenterY = pigBox.top + pigBox.height * 0.73;

      // —— Step 1: 1 枚金币从顶部精准掉到光束罩上 + coin 音效 ——
      var dropCoin = coinEl(30);
      dropCoin.style.left = hoodCenterX + 'px';
      dropCoin.style.top = (hoodCenterY - 170) + 'px';
      dropCoin.style.setProperty('--end-y', '170px');
      dropCoin.style.setProperty('--fall-dur', '.75s');
      coinsBox.appendChild(dropCoin);
      dropCoin.classList.add('is-slot-fall');
      dropCoin.addEventListener('animationend', function () {
        ZQ.audio.coin();
      }, { once: true });

      // —— Step 2: 光束亮起 + 嗡鸣（~t=900ms）——
      window.setTimeout(function () {
        ZQ.audio.ufoHum();
        if (hood) hood.classList.add('is-beam');

        // —— Step 3: 吸起多枚金币（屏幕底部分散位置往上吸，数量由 ctx.coins 决定，上限 6）——
        var n = Math.min(coinCount || 4, 6);
        for (var i = 0; i < n; i++) {
          var coin = coinEl(28);
          coin.style.left = rint(100, window.innerWidth - 100) + 'px';
          coin.style.top = rint(window.innerHeight * 0.65, window.innerHeight * 0.88) + 'px';
          coin.style.setProperty('--target-x', hoodCenterX + 'px');
          coin.style.setProperty('--target-y', hoodCenterY + 'px');
          coinsBox.appendChild(coin);
          (function (el, d) {
            window.setTimeout(function () { el.classList.add('is-beam-up'); }, d);
          })(coin, i * 100);
        }
      }, 900);

      // —— Step 4: 全部飞到光束中心后，绕中心一圈椭圆轨道（~1.8s）——
      window.setTimeout(function () {
        var all = coinsBox.querySelectorAll('.ceremony-coin');
        for (var j = 0; j < all.length; j++) {
          var el = all[j];
          el.style.setProperty('--orbit-cx', hoodCenterX + 'px');
          el.style.setProperty('--orbit-cy', hoodCenterY + 'px');
          el.style.setProperty('--orbit-delay', (j * 0.15).toFixed(2) + 's');
          el.classList.remove('is-beam-up');
          el.classList.add('is-orbit');
        }
      }, 1900);

      // —— Step 5: 飞走 + 嗖声 ——
      window.setTimeout(function () {
        ZQ.audio.ufoFly();
        if (hood) hood.classList.remove('is-beam');
        pig.classList.add('is-fly-away');
      }, 3700);

      window.setTimeout(finishLater, 5700);
    });
  }

  ZQ.screens.pigshow = {
    /**
     * 存钱罐仪式弹窗。叠在已有的结算弹窗之上，结束后自动淡出回结算弹窗。
     * @param {object} ctx  { skin, coins }
     */
    show: function (ctx) {
      var wrap = mount(ctx);
      if (!wrap) return null;
      var done = false;
      function finish() {
        if (done) return;
        done = true;
        wrap.classList.add('is-out');
        window.setTimeout(function () {
          if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
        }, 320);
      }

      var skin = ctx.skin || 'glass';
      var coins = ctx.coins || 1;
      if (skin === 'gacha') runGacha(wrap, finish);
      else if (skin === 'ufo') runUfo(wrap, finish, coins);
      else runGlass(wrap, finish, coins);

      return wrap;
    },

    close: function () {
      var layer = document.getElementById('modal-layer');
      if (layer) {
        var cer = layer.querySelector('.modal-mask.is-ceremony');
        if (cer && cer.parentNode) cer.parentNode.removeChild(cer);
      }
    },
  };
})();
