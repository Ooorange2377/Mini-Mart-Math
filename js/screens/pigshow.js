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

  /** —— torph 式逐位数字滚动（参考 torph.lochie.me 的文字连续性效果）——
   * 每个数字位是一个 overflow:hidden 竖槽，内部 0-9 数字条 translateY 滚动；
   * 旧值→新值只滚变化的位（不变位保持不动 = 文字连续性），位数增减时左侧槽展开/收起，
   * 从右往左 45ms 级联延迟，模拟机械进位感；弹性缓动带轻微过冲 = 老虎机手感。 */
  var T_STEP = 1.2;   // 每位槽高（em），必须与 CSS .t-strip span 高度一致

  function makeCol(digit) {
    var col = document.createElement('span');
    col.className = 't-col';
    var strip = document.createElement('span');
    strip.className = 't-strip';
    for (var n = 0; n <= 9; n++) {
      var s = document.createElement('span');
      s.textContent = n;
      strip.appendChild(s);
    }
    // 插入 DOM 前就定位好 → 首次渲染不触发过渡
    strip.style.transform = 'translateY(' + (-(digit * T_STEP)).toFixed(3) + 'em)';
    col.appendChild(strip);
    return col;
  }

  /** 初始化滚动器：清空 el，按 value 建列；el._tval 记录当前值供后续滚动 */
  function initRoller(el, value) {
    if (!el) return;
    el._tval = String(Math.max(0, Math.floor(value || 0)));
    el.textContent = '';
    var str = el._tval;
    for (var i = 0; i < str.length; i++) el.appendChild(makeCol(+str[i]));
  }

  /** 滚到新值：只滚变化的位 + 位数增减时左侧槽展开/收起 */
  function setRoller(el, target) {
    if (!el || !el._tval) return;
    var next = String(Math.max(0, Math.floor(target || 0)));
    var old = el._tval;
    if (next === old) return;
    el._tval = next;

    // 位数增加：左侧补新槽（先 0 宽，下一帧展开）
    if (next.length > old.length) {
      var add = next.length - old.length;
      for (var a = add - 1; a >= 0; a--) {
        var nc = makeCol(+next[a]);
        nc.classList.add('t-in');
        el.insertBefore(nc, el.firstChild);
      }
      requestAnimationFrame(function () {
        var ins = el.querySelectorAll('.t-col.t-in');
        for (var i = 0; i < ins.length; i++) ins[i].classList.remove('t-in');
      });
    }

    // 位数减少：左侧多余槽收起后移除
    if (next.length < old.length) {
      var outs = el.querySelectorAll('.t-col:not(.t-out)');
      var rem = old.length - next.length;
      for (var r = 0; r < rem && r < outs.length; r++) {
        (function (node) {
          node.classList.add('t-out');
          ZQ.timer.after(function () {
            if (node.parentNode) node.parentNode.removeChild(node);
          }, 360);
        })(outs[r]);
      }
    }

    // 共享位逐个滚：从右往左（个位先滚 = 进位感），不变位保持不动
    var cols = el.querySelectorAll('.t-col:not(.t-out)');
    var shared = Math.min(old.length, next.length);
    for (var j = 0; j < shared; j++) {
      var od = old.charAt(old.length - 1 - j);
      var nd = next.charAt(next.length - 1 - j);
      if (od === nd) continue;
      var col = cols[cols.length - 1 - j];
      if (!col) continue;
      var strip = col.firstChild;
      strip.style.transitionDelay = (j * 45) + 'ms';
      strip.style.transform = 'translateY(' + (-(+nd * T_STEP)).toFixed(3) + 'em)';
    }
  }

  /** 极简外壳：jar-clipped 层(z3) 放罐内金币（被 clip-path 硬裁 + SVG 罐身盖住），pig(z5) 是 SVG 罐子本身。gacha/ufo 时 jar-clipped 为空、hidden。 */
  function shellHTML(skinId) {
    return '' +
      '<div class="ceremony-stage">' +
        '<div class="ceremony-jar-clipped"></div>' +
        '<div class="ceremony-coins"></div>' +
        '<div class="ceremony-pig">' +
          (ZQ.ui.slots.renderPig(skinId)) +
        '</div>' +
        '<div class="ceremony-total">' + ZQ.I18N.ceremonyTotal + '<b></b></div>' +
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
    wrap.innerHTML = shellHTML(ctx.skin);
    // torph 式滚动器：初始值 = 当前 store 总零花钱 - 本次新增
    initRoller(wrap.querySelector('.ceremony-total b'), initialTotal);
    layer.appendChild(wrap);
    requestAnimationFrame(function () { wrap.classList.add('is-in'); });
    return wrap;
  }

  /** —— 分支 1：玻璃罐 —— 静态金币堆(store 历史) + 动画金币从投币口上方 1/2 罐高处斜落入罐 + 底部总量逐位滚动 */
  function runGlass(wrap, finishLater, coinCount) {
    var pig = wrap.querySelector('.ceremony-pig');
    var clipped = wrap.querySelector('.ceremony-jar-clipped');
    var coinsBox = wrap.querySelector('.ceremony-coins');
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
    var baseTotal = (totalEl && totalEl._tval) ? (parseInt(totalEl._tval, 10) || 0) : 0;
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
      ZQ.audio.coinDrop();   // 每枚金币落底一声「叮」，几枚就有几声
      done++;
      if (totalEl) setRoller(totalEl, baseTotal + done);
      if (done >= num) {
        ZQ.timer.after(finishLater, 2100);   // 最后一枚落底后多停 1s 回味
      }
    }

    // 动画金币放到全屏 coins 层（z4 低于 pig SVG z5 → 落入罐内后被半透明玻璃盖住）
    // 起点在投币口（SVG 110,41）上方约 1/2 罐身高度处，斜着落进罐底随机位置
    var slotX = pigBox.left + pw * (110 / 220);
    var slotY = pigBox.top + ph * (41 / 180);
    var startY = slotY - ph * 0.5;   // 距投币口约半个罐身高度
    for (var i = 0; i < num; i++) {
      var coin = coinEl(30);
      var landX = jarLeft + Math.max(4, Math.min(jarW - 34, (jarW - 8) * Math.random() + 4));
      var landY = jarTop + Math.max(jarH - 34 - 10, jarH - 34 - 6 - Math.random() * 10);
      var startX = landX + (slotX - landX) * 0.55;   // 起点偏向投币口 → 斜线落进罐内
      coin.style.left = startX + 'px';
      coin.style.top = startY + 'px';
      coin.style.setProperty('--end-x', (landX - startX) + 'px');
      coin.style.setProperty('--end-y', (landY - startY) + 'px');
      coin.style.setProperty('--fall-dur', (0.62 + Math.random() * 0.12).toFixed(2) + 's');
      coinsBox.appendChild(coin);
      (function (el, delay) {
        ZQ.timer.after(function () {
          el.classList.add('is-fall');
          el.addEventListener('animationend', onHit, { once: true });
        }, delay);
      })(coin, i * 170);
    }
  }

  /** —— 分支 2：扭蛋机 —— 先投币（几枚零花钱投几枚，总额逐位滚动）→ 仅 coins===3 时：
   *  机身震动 → 摇杆卡顿旋转 + 扭蛋翻滚 → 出蛋弹跳 → 蚌壳开蛋 → 随机奖励纸条 */
  function runGacha(wrap, finishLater, coinCount) {
    var pig = wrap.querySelector('.ceremony-pig');
    var gacha = pig.querySelector('.pig-gacha');
    var balls = pig.querySelector('.pig-gacha-balls');
    var crank = pig.querySelector('.gacha-crank');
    var coinsBox = wrap.querySelector('.ceremony-coins');
    var capsule = wrap.querySelector('.ceremony-gacha-capsule');
    var rewardEl = wrap.querySelector('.ceremony-reward');
    var totalEl = wrap.querySelector('.ceremony-total b');
    var baseTotal = (totalEl && totalEl._tval) ? (parseInt(totalEl._tval, 10) || 0) : 0;

    var coins = Math.min(Math.max(1, coinCount || 1), 3);
    var fullShow = (coins === 3);   // 零花钱=3 才触发摇杆掉扭蛋的完整流程

    requestAnimationFrame(function () {
      var pigBox = pig.getBoundingClientRect();

      // —— Phase 1: 投币 —— 起点距投币口（SVG 110,16.5）约 1/2 罐身高度，逐枚落入，总额逐位滚动
      var slotX = pigBox.left + pigBox.width * (110 / 220);
      var slotY = pigBox.top + pigBox.height * (16.5 / 180);
      var startY = slotY - pigBox.height * 0.5;
      var landed = 0;

      var _loop = function (i) {
        var coin = coinEl(26);
        coin.style.left = (slotX + (Math.random() - 0.5) * 10) + 'px';
        coin.style.top = startY + 'px';
        coin.style.setProperty('--end-y', (slotY - startY) + 'px');
        coin.style.setProperty('--fall-dur', '.72s');
        coinsBox.appendChild(coin);
        ZQ.timer.after(function () {
          coin.classList.add('is-slot-fall');
          coin.addEventListener('animationend', function () {
            ZQ.audio.coin();
            landed++;
            setRoller(totalEl, baseTotal + landed);
            if (landed >= coins) ZQ.timer.after(phase2, 350);
          }, { once: true });
        }, i * 200);
      };
      for (var i = 0; i < coins; i++) _loop(i);

      // —— Phase 2: 仅 coins===3 → 震动 → 摇杆 + 翻滚 → 出蛋 → 开蛋 ——
      function phase2() {
        if (!fullShow) { ZQ.timer.after(finishLater, 2100); return; }

        // 机身接住最后一枚币震一下（Squash & Stretch）
        gacha.classList.add('is-shake');

        // 摇杆卡顿旋转 + 扭蛋群疯狂翻滚
        ZQ.timer.after(function () {
          if (crank) {
            crank.classList.add('is-crank');
            var crankTicker = ZQ.timer.every(function () { ZQ.audio.crank(); }, 130);
            ZQ.timer.after(function () { ZQ.timer.clear(crankTicker); }, 1700);
          }
          if (balls) balls.classList.add('is-tumble');
        }, 300);

        // 摇杆/翻滚结束 → 扭蛋从出蛋口（SVG 110,150）滑出并弹跳两下
        ZQ.timer.after(function () {
          if (balls) balls.classList.remove('is-tumble');
          ZQ.audio.gachaDrop();
          var exitX = pigBox.left + pigBox.width * (110 / 220);
          var exitY = pigBox.top + pigBox.height * (150 / 180);
          capsule.style.left = exitX + 'px';
          capsule.style.top = exitY + 'px';
          capsule.classList.add('is-slide-out');
        }, 2050);

        // 蚌壳开蛋 + 随机奖励纸条
        ZQ.timer.after(function () {
          ZQ.audio.gachaPop();
          capsule.classList.add('is-pop');

          var roll = Math.random();
          var reward, text;
          if (roll < 0.40) {
            reward = 'coin'; text = ZQ.I18N.ceremonyCoinReward.replace('{n}', 1);
            ZQ.store.addCoins(1);
            setRoller(totalEl, baseTotal + coins + 1);   // 奖励金币也计入总额滚动
          } else if (roll < 0.70) {
            reward = 'card'; text = ZQ.I18N.ceremonyCardReward.replace('{n}', 1);
            ZQ.store.addCards(1);
          } else {
            reward = 'none'; text = ZQ.I18N.ceremonyNone;
          }

          var capBox = capsule.getBoundingClientRect();
          rewardEl.style.left = capBox.left + 'px';
          rewardEl.style.top = (capBox.top - 10) + 'px';
          rewardEl.textContent = text;
          rewardEl.classList.add('is-in');
          if (reward === 'none') ZQ.audio.rewardAw(); else ZQ.audio.rewardDing();

          ZQ.timer.after(finishLater, 2100);
        }, 3300);
      }
    });
  }

  /** —— 分支 3：UFO（参考「猫咪被 UFO 绑架」桥段）——
   * 金币静置在 UFO 底盘下方约 1/3 罐高处 → UFO 从远处飞来悬停上方 → 绿光从底盘向下展开闪烁并把金币逐枚吸上去（总额逐位滚动）
   * → UFO 居中故障闪烁快速缩小消失 → 仅零花钱=3 时留下黑色晶石 → 用户点击晶石上下裂开露出随机奖励
   * 奖励池：零花钱 1-3 枚 / 延时卡 1-2 张 / 「这只是一块普通的石头...」 */
  function runUfo(wrap, finishLater, coinCount) {
    var pig = wrap.querySelector('.ceremony-pig');
    var stage = wrap.querySelector('.ceremony-stage');
    var coinsBox = wrap.querySelector('.ceremony-coins');
    var rewardEl = wrap.querySelector('.ceremony-reward');
    var totalEl = wrap.querySelector('.ceremony-total b');
    var baseTotal = (totalEl && totalEl._tval) ? (parseInt(totalEl._tval, 10) || 0) : 0;
    var n = Math.min(Math.max(1, coinCount || 1), 6);
    var fullShow = ((coinCount || 0) === 3);   // 仅零花钱=3 才留晶石开奖励
    var absorbed = 0;

    requestAnimationFrame(function () {
      // —— 预计算 UFO 悬停后的实际位置（fly-in 终点固定：舞台中心上方 -78% 罐高，transform 不影响 offsetWidth）——
      var stageRect = stage.getBoundingClientRect();
      var pw = pig.offsetWidth;
      var ph = pw * 180 / 220;                       // SVG viewBox 220x180 等比
      var cx = stageRect.left + stageRect.width / 2;
      var pigTop = stageRect.top + stageRect.height / 2 - ph * 0.78;
      var pigBottom = pigTop + ph;
      var hoodY = pigTop + ph * 0.73;                // 底盘光束罩中心（SVG 132/180）
      var coinY = pigBottom + ph / 3 * 0.7;          // 金币距底盘约 1/3 罐高，整体上移 30%（≈0.23 罐高）

      // —— 光束几何：从底盘向下展开到金币位置（CSS 变量定位）——
      stage.style.setProperty('--beam-x', cx + 'px');
      stage.style.setProperty('--beam-top', (hoodY - ph * 0.04) + 'px');
      stage.style.setProperty('--beam-h', (coinY - hoodY + ph * 0.22) + 'px');
      stage.style.setProperty('--beam-w', (pw * 0.55) + 'px');

      // —— UFO 从远处飞来（远方很小 → 飞到画面上方悬停）——
      pig.classList.add('is-fly-in');
      ZQ.audio.ufoIn();

      // —— 金币（替换猫咪的位置）静置：一排，位于 UFO 底盘下方 1/3 罐高处 ——
      var sit = [];
      for (var i = 0; i < n; i++) {
        var c = coinEl(30);
        c.style.left = (cx + (i - (n - 1) / 2) * 42) + 'px';
        c.style.top = (coinY + (i % 2 === 0 ? -6 : 8)) + 'px';
        coinsBox.appendChild(c);
        sit.push(c);
      }

      // —— t≈1.0s 到位：绿光闪两下 + 光束张开 + 嗡鸣，逐枚把金币吸上去 ——
      ZQ.timer.after(function () {
        stage.classList.add('is-ufo-beam');
        ZQ.audio.ufoHum();
        sit.forEach(function (el, i) {
          el.style.setProperty('--target-x', cx + 'px');
          el.style.setProperty('--target-y', hoodY + 'px');
          ZQ.timer.after(function () { el.classList.add('is-beam-up'); }, 1450 + i * 260);
          ZQ.timer.after(function () {           // 金币到达 UFO → 入账 + 总额滚动
            ZQ.audio.coin();
            absorbed++;
            setRoller(totalEl, baseTotal + absorbed);
          }, 1450 + i * 260 + 950);
        });
      }, 1000);

      // —— 全部吸完：居中故障闪烁 + 快速缩小消失；残留金币随 UFO 一起清掉 ——
      var lastArrive = 1450 + (n - 1) * 260 + 950;
      ZQ.timer.after(function () {
        stage.classList.remove('is-ufo-beam');
        stage.classList.add('is-zap');
        pig.classList.add('is-vanish');
        ZQ.audio.ufoZap();
        coinsBox.classList.add('is-clear');   // 吸走的金币已停在光束罩位置，随消失一起缩小淡出
        ZQ.timer.after(function () { coinsBox.innerHTML = ''; }, 420);
      }, lastArrive + 350);

      // —— 仅零花钱=3：消失处留下黑色晶石；否则故障消失后稍作停顿直接返回结算 ——
      if (fullShow) ZQ.timer.after(showCrystal, lastArrive + 970);
      else ZQ.timer.after(finishLater, lastArrive + 2100);
    });

    function showCrystal() {
      var crystal = document.createElement('div');
      crystal.className = 'ceremony-crystal';
      crystal.innerHTML = crystalHTML() +
        '<div class="ceremony-crystal-hint">' + ZQ.I18N.ceremonyCrystalHint + '</div>';
      stage.appendChild(crystal);

      var opened = false;
      var fallback = ZQ.timer.after(openCrystal, 8000);   // 兜底：8s 未点击自动裂开
      crystal.addEventListener('click', function () {
        window.clearTimeout(fallback);
        openCrystal();
      });

      function openCrystal() {
        if (opened) return;
        opened = true;
        crystal.classList.add('is-open');
        crystal.style.pointerEvents = 'none';
        ZQ.audio.gachaPop();

        var cx = window.innerWidth / 2;
        var cy = window.innerHeight / 2;
        var roll = Math.random();
        var text;
        if (roll < 0.40) {
          var m = rint(1, 3);
          text = ZQ.I18N.ceremonyCoinReward.replace('{n}', m);
          ZQ.store.addCoins(m);
          setRoller(totalEl, baseTotal + n + m);   // 奖励金币计入总额滚动
          for (var i = 0; i < m; i++) {
            (function (idx) {
              var pc = coinEl(28);
              pc.style.left = (cx + (idx - (m - 1) / 2) * 40) + 'px';
              pc.style.top = cy + 'px';
              pc.style.setProperty('--prize-delay', (idx * 0.13).toFixed(2) + 's');
              pc.classList.add('is-prize');
              coinsBox.appendChild(pc);
            })(i);
          }
          ZQ.audio.rewardDing();
        } else if (roll < 0.75) {
          var k = rint(1, 2);
          text = ZQ.I18N.ceremonyCardReward.replace('{n}', k);
          ZQ.store.addCards(k);
          ZQ.audio.rewardDing();
        } else {
          text = ZQ.I18N.ceremonyStoneNone;
          ZQ.audio.rewardAw();
        }

        rewardEl.style.left = cx + 'px';
        rewardEl.style.top = (cy - 10) + 'px';
        rewardEl.textContent = text;
        rewardEl.classList.add('is-in');

        ZQ.timer.after(finishLater, 2300);
      }
    }
  }

  /** 黑色晶石：同一颗宝石 SVG 用上下两个裁切容器各露一半，点击后两半向上下裂开 */
  function crystalHTML() {
    var gem =
      '<svg width="120" height="140" viewBox="0 0 120 140" aria-hidden="true">' +
        '<polygon points="60,4 104,34 112,84 60,136 8,84 16,34" fill="#141420" stroke="#1B3E6F" stroke-width="4" stroke-linejoin="round"/>' +
        '<polygon points="60,4 104,34 60,58 16,34" fill="#23233A" stroke="#1B3E6F" stroke-width="3" stroke-linejoin="round"/>' +
        '<polygon points="16,34 60,58 60,136 8,84" fill="#1B1B2C" stroke="#1B3E6F" stroke-width="3" stroke-linejoin="round"/>' +
        '<polygon points="104,34 60,58 60,136 112,84" fill="#0D0D18" stroke="#1B3E6F" stroke-width="3" stroke-linejoin="round"/>' +
        '<polyline points="26,44 46,66" fill="none" stroke="#8FA8FF" stroke-width="4" stroke-linecap="round" opacity=".5"/>' +
      '</svg>';
    return '<div class="crystal-half is-top">' + gem + '</div>' +
           '<div class="crystal-half is-bottom">' + gem + '</div>';
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
        ZQ.timer.after(function () {
          if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
        }, 320);
      }

      var skin = ctx.skin || 'glass';
      var coins = ctx.coins || 1;
      if (skin === 'gacha') runGacha(wrap, finish, coins);
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
