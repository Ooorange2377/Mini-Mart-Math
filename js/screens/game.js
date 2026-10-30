/* 游戏主界面页：组装任务/计时/货架/购物篮布局 + 选品交互（点击选/取消、超支拦截、飞入购物篮、翻页、双击删除）
 * + 计时器 / 延时卡片 / CHECKOUT 冻结 / 结算弹窗（P4）。 */
window.ZQ = window.ZQ || {};
ZQ.screens = ZQ.screens || {};

(function () {
  /* 飞行中的商品下标 → 飞行记录（用于取消已被移除商品的动画） */
  var flying = {};

  /* 换题卡重渲染时，用于把已用道具次数与剩余时间带到新一局 */
  var rerollCarry = null;

  /* 道具元数据：存档字段 / 每关上限 / 提示 */
  var TOOLS = {
    delay: {
      own: 'delayCards', limit: ZQ.DELAY_CARD_MAX_PER_LEVEL || 3,
      name: 'toolDelay', label: '+30s', icon: '⏱',
      empty: 'toastDelayCardEmpty', usedUp: 'toastDelayCardUsedUp',
    },
    hint: {
      own: 'hintCards', limit: ZQ.HINT_CARD_MAX_PER_LEVEL || 2,
      name: 'toolHint', label: 'HINT', icon: '💡',
      empty: 'toastHintCardEmpty', usedUp: 'toastHintCardUsedUp',
    },
    reroll: {
      own: 'rerollCards', limit: ZQ.REROLL_CARD_MAX_PER_LEVEL || 1,
      name: 'toolReroll', label: 'REROLL', icon: '🔄',
      empty: 'toastRerollCardEmpty', usedUp: 'toastRerollCardUsedUp',
    },
  };

  function fmtTime(sec) {
    var s = Math.max(0, sec | 0);
    var m = Math.floor(s / 60);
    var r = s % 60;
    return (m < 10 ? '0' : '') + m + ':' + (r < 10 ? '0' : '') + r;
  }

  /** 三块道具方块（数量由 updateTools() 刷新） */
  function toolsHtml() {
    var out = '';
    for (var k in TOOLS) {
      var t = TOOLS[k];
      out += '<button class="btn-tool btn-tool-' + k + '" type="button" data-tool="' + k + '">' +
        '<span class="dt-icon">' + t.icon + '</span>' +
        '<span class="dt-name">' + t.label + '</span>' +
        '<span class="dt-badge" data-left="' + k + '">0</span>' +
      '</button>';
    }
    return out;
  }

  /** 超支抖动：重新触发同一关键帧需先移除类并强制回流 */
  function shake(el) {
    el.classList.remove('is-overspend');
    void el.offsetWidth;
    el.classList.add('is-overspend');
    setTimeout(function () { el.classList.remove('is-overspend'); }, 460);
  }

  /**
   * 取本关题目（方案 5.9）：
   * 已满 3 星的关卡每次进关都重新出题；未满星关卡首次生成并写入存档，之后始终复用（补考）。
   * @param {number} levelId
   * @param {number} [seed] 显式种子（有则直接生成，不落存档）
   */
  function resolveLevel(levelId, seed) {
    if (seed) return ZQ.generator.generate(levelId, seed);
    var maxed = ZQ.store.isLevelMaxed(levelId);
    if (!maxed) {
      var fixed = ZQ.store.getFixedQuestion(levelId);
      if (fixed) return fixed;
    }
    var lv = ZQ.generator.generate(levelId, ZQ.rng.newSeed());
    if (!maxed) ZQ.store.setFixedQuestion(levelId, lv);
    return lv;
  }

  /**
   * 商品飞入购物篮：外层线性横移 + 内层弧线纵移，合成抛物线；落点到达后回调。
   * @returns {void}
   */
  function startFlight(slotEl, cartBox, idx, onArrive) {
    var img = slotEl.querySelector('.slot-img');
    if (!img || !cartBox) { onArrive(); return; }
    var a = img.getBoundingClientRect();
    var b = cartBox.getBoundingClientRect();
    if (a.width < 2 || b.width < 2) { onArrive(); return; }

    var wrap = document.createElement('div');
    wrap.className = 'fx-fly';
    wrap.style.left = (a.left + a.width / 2) + 'px';
    wrap.style.top = (a.top + a.height / 2) + 'px';
    wrap.style.width = a.width + 'px';
    wrap.style.height = a.height + 'px';

    var dy = (b.top + b.height * 0.6) - (a.top + a.height / 2);
    var dx = (b.left + b.width / 2) - (a.left + a.width / 2);
    var lift = Math.max(16, Math.min(72, Math.abs(dy) * 0.32));

    wrap.style.setProperty('--dy', dy.toFixed(1) + 'px');
    wrap.style.setProperty('--lift', lift.toFixed(0) + 'px');
    wrap.style.setProperty('--fly-dur', '0.52s');
    wrap.innerHTML = '<div class="fx-fly-x"><div class="fx-fly-y">' +
      '<img src="' + img.getAttribute('src') + '" alt=""></div></div>';

    var rec = { el: wrap, finished: false };
    flying[idx] = rec;
    document.body.appendChild(wrap);

    // 下一帧再启动横向位移，避免与初始位置合并为同一帧导致无过渡
    var xLayer = wrap.querySelector('.fx-fly-x');
    requestAnimationFrame(function () {
      xLayer.style.transform = 'translateX(' + dx.toFixed(1) + 'px)';
    });

    function finish() {
      if (rec.finished) return;
      rec.finished = true;
      if (flying[idx] === rec) delete flying[idx];
      if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
      onArrive();
    }
    wrap.querySelector('.fx-fly-y').addEventListener('animationend', finish);
    setTimeout(finish, 700);   // 动画事件兜底
  }

  /** 立即取消某商品的飞行动画（选中后又被取消时调用） */
  function cancelFlight(idx) {
    var rec = flying[idx];
    if (!rec) return;
    rec.finished = true;
    delete flying[idx];
    if (rec.el.parentNode) rec.el.parentNode.removeChild(rec.el);
  }

  /**
   * 首次遇到新机制时，框选对应控件并暂停计时，关闭提示后再开始本关。
   * @param {HTMLElement} target 需要框选的目标元素
   * @param {object} tip 文案与记录键：{ key, title, text, ok }
   * @param {Function} onClose
   */
  function showSpotlightTip(target, tip, onClose) {
    var layer = document.getElementById('modal-layer');
    if (!layer || !target) { onClose(); return; }

    layer.innerHTML = '';
    var mask = document.createElement('div');
    mask.className = 'pager-tip-mask';
    mask.innerHTML =
      '<div class="pager-tip-spot" aria-hidden="true"></div>' +
      '<div class="pager-tip-card" role="dialog" aria-modal="true">' +
        '<div class="pager-tip-title">' + tip.title + '</div>' +
        '<div class="pager-tip-text">' + tip.text + '</div>' +
        '<button class="btn-result btn-primary pager-tip-ok" type="button">' +
          (tip.ok || ZQ.I18N.pagerTipOk) +
        '</button>' +
        (tip.skip ? '<button class="pager-tip-skip" type="button">' + tip.skip + '</button>' : '') +
      '</div>';
    layer.appendChild(mask);

    var spot = mask.querySelector('.pager-tip-spot');
    var card = mask.querySelector('.pager-tip-card');
    var ok = mask.querySelector('.pager-tip-ok');
    var closed = false;

    function position() {
      var rect = target.getBoundingClientRect();
      card.style.width = '';            /* 每次重排都从 CSS 宽度起算，避免上次收窄残留 */
      var pad = 9;
      spot.style.left = (rect.left - pad) + 'px';
      spot.style.top = (rect.top - pad) + 'px';
      spot.style.width = (rect.width + pad * 2) + 'px';
      spot.style.height = (rect.height + pad * 2) + 'px';

      /* 卡片落位：优先「下方 / 上方」，两侧空间都不够时改放侧边，
       * 避免把正在讲的那个控件整个盖住（购物篮在右侧、又矮又窄，曾出现纸条只剩一条边）。
       * 三种朝向用不同的 transform 锚点：
       *   上方 translate(-50%,-100%) → 可视 bbox [top-ch, top]
       *   下方 is-below translate(-50%,0) → [top, top+ch]
       *   左侧 is-side-left translate(-100%,-50%) → x 右边缘贴 left
       *   右侧 is-side-right translate(0,-50%) → x 左边缘贴 left
       * 因此每种模式的合法 clamp 区间必须分开算。 */
      var wv = window.innerWidth, h = window.innerHeight;
      var cw = card.offsetWidth || 320;
      var ch = card.offsetHeight || 150;
      var GAP = 16, EDGE = 8;
      var spaceBelow = h - rect.bottom - GAP - EDGE;
      var spaceAbove = rect.top - GAP - EDGE;
      var mode;
      if (spaceBelow >= ch) mode = 'below';
      else if (spaceAbove >= ch) mode = 'above';
      else mode = (rect.left - EDGE) >= (wv - rect.right - EDGE) ? 'side-left' : 'side-right';

      card.classList.toggle('is-below', mode === 'below');
      card.classList.toggle('is-side-left', mode === 'side-left');
      card.classList.toggle('is-side-right', mode === 'side-right');

      if (mode === 'below' || mode === 'above') {
        var cx = Math.min(Math.max(rect.left + rect.width / 2, cw / 2 + EDGE), wv - cw / 2 - EDGE);
        var top;
        if (mode === 'below') {
          top = Math.min(rect.bottom + GAP, h - ch - EDGE);
          top = Math.max(top, EDGE);
        } else {
          top = Math.max(rect.top - GAP, ch + EDGE);
          top = Math.min(top, h - EDGE);
        }
        card.style.left = cx + 'px';
        card.style.top = top + 'px';
      } else {
        /* 侧向：先看这一侧到底能放下多宽。放不下就按可用宽度收窄（文字自动换行），
         * 否则卡片会伸出屏幕（曾经在 629 档、目标是整块货架时超出右缘 102px）。
         * 收窄时不能再设 200px 宽度下限：629 档整块货架两侧只剩 158px，
         * 硬撑到 200px 会反过来盖住高亮目标（实测重叠 35px）。 */
        var avail = mode === 'side-left'
          ? (rect.left - GAP) - EDGE
          : (wv - rect.right - GAP) - EDGE;
        if (avail < cw) {
          var fitW = Math.max(140, Math.floor(avail));
          card.style.width = fitW + 'px';
          cw = fitW;
          ch = card.offsetHeight || ch;
        }
        var leftSide = mode === 'side-left' ? rect.left - GAP : rect.right + GAP;
        var left = mode === 'side-left'
          ? Math.max(leftSide, cw + EDGE)
          : Math.min(leftSide, wv - cw - EDGE);
        var cy = Math.min(Math.max(rect.top + rect.height / 2, ch / 2 + EDGE), h - ch / 2 - EDGE);
        card.style.left = left + 'px';
        card.style.top = cy + 'px';
      }
    }

    function close() {
      if (closed) return;
      closed = true;
      window.removeEventListener('resize', position);
      document.removeEventListener('keydown', onKey);
      ZQ.store.markTutorial(tip.key);
      layer.innerHTML = '';
      onClose();
    }

    function onKey(e) {
      if (e.key === 'Escape' || e.key === 'Enter') close();
    }

    mask.addEventListener('click', function (e) {
      if (!e.target.closest('.pager-tip-card')) close();
    });
    ok.addEventListener('click', function (e) {
      e.stopPropagation();
      ZQ.audio.click();
      close();
    });
    var skip = mask.querySelector('.pager-tip-skip');
    if (skip) {
      skip.addEventListener('click', function (e) {
        e.stopPropagation();
        ZQ.audio.click();
        if (tip.onSkip) tip.onSkip();
        close();
      });
    }
    window.addEventListener('resize', position);
    document.addEventListener('keydown', onKey);
    requestAnimationFrame(function () {
      position();
      mask.classList.add('is-in');
      ok.focus();
    });
  }

  ZQ.screens.game = {
    /** 当前关卡实例 */
    current: null,
    /** 当前关卡会话（选品状态机） */
    session: null,
    /** 当前舞台根元素 */
    stage: null,
    /** 上一份绑定的计时器停止函数（重渲染时先停掉，避免旧关卡的计时回调误触发结算） */
    _stopTimer: null,
    /** 上一份绑定的「切后台冻结计时」监听（重绑定时移除，避免重复挂载） */
    _visHandler: null,
    /** 取关题目（预取模块复用同一套「固定题 / 重出题」规则，保证预取的就是进关会看到的） */
    resolveLevel: function (levelId) { return resolveLevel(levelId); },

    /**
     * 渲染游戏主界面。
     * @param {number} levelId 关卡编号
     * @param {number} [seed]  出题种子（省略则按方案 5.9 取固定题 / 随机）
     * @returns {HTMLElement}
     */
    render: function (levelId, seed) {
      if (!ZQ.store.data) ZQ.store.load();
      if (this._stopTimer) { this._stopTimer(); this._stopTimer = null; }
      ZQ.screens.result.close();

      var lv = resolveLevel(levelId, seed);
      this.current = lv;
      this.session = ZQ.session.create(lv);
      var session = this.session;

      // 换题卡重开：把已用道具次数与剩余时间带进新一局（关卡不同则丢弃）
      var carry = rerollCarry;
      rerollCarry = null;
      if (carry && carry.levelId !== lv.levelId) carry = null;

      var saved = ZQ.store.data || {};
      var equipped = (saved.equipped && saved.equipped.cart) || 'silver';
      var constraints = lv.constraint || [];
      var fullConstraint = ZQ.rules.constraintLabel(constraints) ||
        ZQ.I18N.constraintAny.replace('{n}', lv.n);
      var constraintLines = ZQ.rules.constraintLabelLines(constraints);
      var ruleClass = constraints.length ? ' count-' + constraints.length : '';
      var constraintHtml = '';
      if (constraintLines.length) {
        for (var cl = 0; cl < constraintLines.length; cl++) {
          constraintHtml += '<span class="t-rule-line">' +
            constraintLines[cl] + '</span>';
        }
      } else {
        constraintHtml = '<span class="t-rule-line">' +
          ZQ.I18N.constraintAny.replace('{n}', lv.n) + '</span>';
      }

      var el = document.createElement('div');
      el.className = 'stage screen-game';

      el.innerHTML =
        '<button class="btn-back-game" type="button" aria-label="' + ZQ.I18N.backMapAria + '">' +
          '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">' +
            '<path fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" d="M15 5L8 12l7 7"/>' +
          '</svg>' +
        '</button>' +

        '<div class="room"><div class="room-floor"></div></div>' +

        // 左侧任务卡：标签与值左右对齐
        '<aside class="hud-target" aria-label="' + ZQ.I18N.labelTarget + '">' +
          '<div class="t-head">' +
            '<span class="t-title">' + ZQ.I18N.labelTarget + '</span>' +
          '</div>' +
          '<div class="t-row"><span>' + ZQ.I18N.labelLevel + '</span><b>' + lv.levelId + '</b></div>' +
          '<div class="t-row t-budget"><span>' + ZQ.I18N.labelBudget + '</span><b>¥ ' + ZQ.money.fmtTrim(lv.budget) + '</b></div>' +
          '<div class="t-row t-count"><span>' + ZQ.I18N.labelNeedCount + '</span><b>' +
            ZQ.I18N.itemCount.replace('{n}', lv.n).replace('{item}', ZQ.itemWord(lv.n)) + '</b></div>' +
          '<div class="t-rule' + ruleClass + '" title="' + fullConstraint + '">' +
            '<span class="t-rule-label">' + ZQ.I18N.labelConstraint + '</span>' +
            '<b class="t-rule-value">' + constraintHtml + '</b>' +
          '</div>' +
        '</aside>' +

        // 顶部中央：独立计时器 + 剩余时间进度条
        '<div class="hud-timer" data-state="selecting" role="timer" aria-live="polite">' +
          '<div class="timer-top">' +
            '<span class="t-state">' + ZQ.I18N.stateSelecting + '</span>' +
            '<span class="t-label">' + ZQ.I18N.timerLabel + '</span>' +
          '</div>' +
          '<div class="t-time"><b>' + fmtTime(lv.timeSec) + '</b></div>' +
          '<div class="timer-track"><span class="timer-fill"></span></div>' +
        '</div>' +

        // 右上角纵排道具按钮：延时卡 / 提示卡 / 换题卡
        '<div class="hud-tools">' + toolsHtml() + '</div>' +

        // 右侧纵向功能区：详情下拉 + 购物篮（hud-items 保持在 panel-basket 内，不动）
        '<aside class="panel-basket">' +
          '<div class="hud-items is-empty">' +
            '<button class="note-head" type="button" aria-expanded="false" aria-controls="cart-details">' +
              '<span class="note-perf"></span>' +
              '<span class="note-title">' + ZQ.I18N.viewDetails + ' <b class="note-count">(0)</b></span>' +
              '<span class="note-arrow">&#9662;</span>' +
            '</button>' +
            '<div class="note-body" id="cart-details">' +
              '<div class="note-rule"></div>' +
              '<ul class="items-list"></ul>' +
              '<div class="items-empty">' + ZQ.I18N.toastCartEmpty + '</div>' +
            '</div>' +
          '</div>' +
          '<div class="panel-cart">' + ZQ.ui.cart.render(equipped, 0, lv.n) + '</div>' +
        '</aside>' +

        // 中央货架
        '<div class="panel-shelf"></div>' +

        // 右下固定结账区
        '<div class="checkout-dock">' +
          (ZQ.store.tutorialSeen('checkoutHint') ? '' :
            '<div class="checkout-hint">' + ZQ.I18N.checkoutHint + '</div>') +
          '<button class="btn-checkout is-breathe" type="button">' + ZQ.I18N.labelCheckout + '</button>' +
        '</div>';

      // 货架由独立 UI 模块渲染
      el.querySelector('.panel-shelf').appendChild(ZQ.ui.shelf.render(lv));
      ZQ.ui.slots.bindFallbacks(el);   // 购物篮皮肤：WebP 失败回退优化 PNG
      el.setAttribute('data-level', lv.levelId);
      this.stage = el;

      ZQ.ui.list.reset();   // 新关卡：清空清单行缓存，避免沿用上一关的新增判定
      bind(el, lv, session, carry);
      return el;
    },

    fmtTime: fmtTime,
  };

  /** 事件绑定：所有交互走 .stage 上的事件委托 */
  function bind(el, lv, session, carry) {
    var cartPanel = el.querySelector('.panel-cart');
    var cartBox = el.querySelector('.cart');
    var shelfEl = el.querySelector('.shelf');
    var timerBox = el.querySelector('.hud-timer');
    var page = 0;
    var suppressClick = false;   /* 横滑收尾时吞掉紧随其后的那次 click */

    /* ---------- 计时器 ---------- */
    var remaining = carry ? carry.remaining : lv.timeSec;   // 剩余秒数
    var deadline = Date.now() + remaining * 1000;
    var timerId = null;
    var used = carry ? carry.used : { delay: 0, hint: 0, reroll: 0 };  // 本关各类道具已用次数

    /** 剩余时间与告急态（仅 SELECTING 阶段显示告急） */
    function updateTimerHud() {
      var t = el.querySelector('.hud-timer .t-time b');
      if (t) t.textContent = fmtTime(remaining);
      var fill = el.querySelector('.hud-timer .timer-fill');
      if (fill) fill.style.width = Math.max(0, Math.min(100, remaining / Math.max(1, lv.timeSec) * 100)) + '%';
      if (timerBox) {
        timerBox.classList.toggle('is-urgent', session.state === 'selecting' && remaining <= 30);
        timerBox.setAttribute('aria-label', ZQ.I18N.timerLabel + ' ' + fmtTime(remaining));
      }
    }

    /** 状态词切换（挑选中 ⇄ 结算中） */
    function updateHudState() {
      if (!timerBox) return;
      var word = timerBox.querySelector('.t-state');
      if (word) word.textContent = session.state === 'selecting' ? ZQ.I18N.stateSelecting : ZQ.I18N.stateCheckout;
      timerBox.setAttribute('data-state', session.state === 'selecting' ? 'selecting' : 'checkout');
      timerBox.classList.remove('is-urgent');
    }

    function tick() {
      if (session.state !== 'selecting') return;
      var prev = remaining;
      remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      updateTimerHud();
      if (remaining !== prev && remaining > 0 && remaining <= 5) ZQ.audio.tick();
      if (remaining <= 0) settle(true);
    }

    function startTimer() {
      if (timerId !== null) return;
      deadline = Date.now() + remaining * 1000;
      updateTimerHud();
      timerId = window.setInterval(tick, 250);
    }

    function stopTimer() {
      if (timerId === null) return;
      window.clearInterval(timerId);
      timerId = null;
    }
    ZQ.screens.game._stopTimer = stopTimer;

    /* ---------- 切后台冻结倒计时 ----------
     * deadline 基于 Date.now()，锁屏/切后台期间时间照走，回来会直接判 0 星。
     * 这里在 hidden 时停表并记下时刻，回来把 deadline 顺延同样时长。 */
    if (ZQ.screens.game._visHandler) {
      document.removeEventListener('visibilitychange', ZQ.screens.game._visHandler);
    }
    var frozenAt = 0;
    var visHandler = function () {
      if (!el.parentNode) return;      // 已离开关卡：不再处理
      if (document.hidden) {
        if (timerId !== null) { stopTimer(); frozenAt = Date.now(); }
      } else if (frozenAt) {
        frozenAt = 0;
        /* startTimer 会用冻结时的 remaining 重排 deadline，等于把后台时间整段补回来 */
        if (session.state === 'selecting') startTimer();
      }
    };
    document.addEventListener('visibilitychange', visHandler);
    ZQ.screens.game._visHandler = visHandler;

    /** 三类道具按钮的可用次数：实际持有量与本关上限制约后的较小值 */
    function updateTools() {
      for (var k in TOOLS) {
        var t = TOOLS[k];
        var own = ZQ.store.data[t.own] || 0;
        var left = Math.max(0, Math.min(own, t.limit - used[k]));
        var badge = el.querySelector('.dt-badge[data-left="' + k + '"]');
        if (badge) badge.textContent = left;
        var btn = el.querySelector('.btn-tool-' + k);
        if (btn) {
          btn.classList.toggle('is-off', left <= 0);
          btn.setAttribute('aria-label', ZQ.I18N[t.name] + ' ' + left);
        }
      }
    }

    /** 「+30s」飘字：绝对定位于舞台顶部（状态胶囊下方） */
    function floatText(text) {
      var f = document.createElement('div');
      f.className = 'fx-float';
      f.textContent = text;
      f.style.left = '50%';
      f.style.top = '12.8%';
      f.style.fontSize = '3cqw';
      f.style.color = 'var(--green)';
      el.appendChild(f);
      setTimeout(function () { if (f.parentNode) f.parentNode.removeChild(f); }, 1250);
    }

    /** 使用一张延时卡：本关上限校验 → 扣存档 → 加时 → 飘字 */
    function useCard() {
      if (session.state !== 'selecting') return;
      if (used.delay >= TOOLS.delay.limit) {
        ZQ.audio.error();
        ZQ.ui.toast.show(ZQ.I18N.toastDelayCardUsedUp, { type: 'error' });
        return;
      }
      if (!ZQ.store.useCard('delay')) {
        ZQ.audio.error();
        ZQ.ui.toast.show(ZQ.I18N.toastDelayCardEmpty, { type: 'error' });
        return;
      }
      used.delay += 1;
      remaining += ZQ.DELAY_CARD_SECONDS;
      deadline += ZQ.DELAY_CARD_SECONDS * 1000;
      updateTimerHud();
      updateTools();
      floatText(ZQ.I18N.toastDelayCardAdded);
      ZQ.audio.coin();
    }

    /**
     * 使用一张提示卡：以出题时的唯一解为基准给提示。
     * - 已选商品都在唯一解里 → 高亮解中「下一件」（唯一正确的下一步）
     * - 已选里有解外商品 → 精确解已不可达，标红这些错件让玩家换掉，并扣卡
     * 购物车已经是唯一解时不扣卡。
     */
    function useHint() {
      if (session.state !== 'selecting') return;
      if (used.hint >= TOOLS.hint.limit) {
        ZQ.audio.error();
        ZQ.ui.toast.show(ZQ.I18N.toastHintCardUsedUp, { type: 'error' });
        return;
      }
      if ((ZQ.store.data.hintCards || 0) <= 0) {
        ZQ.audio.error();
        ZQ.ui.toast.show(ZQ.I18N.toastHintCardEmpty, { type: 'error' });
        return;
      }
      var plan = hintPlan();
      if (!plan) {
        ZQ.audio.error();
        ZQ.ui.toast.show(ZQ.I18N.toastHintNothing, { type: 'error' });
        return;
      }
      if (plan.state === 'perfect') {
        ZQ.ui.toast.show(ZQ.I18N.toastHintPerfect, { type: 'good' });
        return;
      }
      ZQ.store.useCard('hint');
      used.hint += 1;
      updateTools();

      if (plan.state === 'wrong') {
        markWrong(plan.wrong);
        ZQ.ui.toast.show(ZQ.I18N.toastHintWrong, { type: 'error' });
      } else {
        highlightSlot(plan.next);
        ZQ.ui.toast.show(ZQ.I18N.toastHintDone, { type: 'good' });
      }
      ZQ.audio.coin();
    }

    /** 唯一解的商品下标列表（出题时写入的 solutionKey，字符串 "i,j,k"） */
    function solutionIndices() {
      var key = lv.solutionKey || '';
      if (!key) return [];
      var parts = key.split(',');
      var out = [];
      for (var i = 0; i < parts.length; i++) {
        var idx = parseInt(parts[i], 10);
        if (!isNaN(idx)) out.push(idx);
      }
      return out;
    }

    /**
     * 提示计划：返回 null（无唯一解，不可提示）、
     * { state: 'perfect' }（购物车已是唯一解）、
     * { state: 'wrong', wrong: [下标...] } 或 { state: 'next', next: 下标 }
     */
    function hintPlan() {
      var sol = solutionIndices();
      if (!sol.length) return null;

      var inSol = {};
      for (var s = 0; s < sol.length; s++) inSol[sol[s]] = true;

      var chosen = {};
      var wrong = [];
      for (var i = 0; i < session.selected.length; i++) {
        var idx = session.selected[i];
        chosen[idx] = true;
        if (!inSol[idx]) wrong.push(idx);
      }
      if (wrong.length) return { state: 'wrong', wrong: wrong };

      for (var j = 0; j < sol.length; j++) {
        if (!chosen[sol[j]]) return { state: 'next', next: sol[j] };
      }
      return { state: 'perfect' };
    }

    /** 高亮货架上的目标商品：先翻到它所在页，再给 3 秒呼吸框 */
    function highlightSlot(idx) {
      var pageNo = Math.floor(idx / ZQ.SLOTS_PER_PAGE);
      if (pageNo !== page) page = ZQ.ui.shelf.goto(shelfEl, pageNo);
      var slot = el.querySelector('.slot[data-slot="' + idx + '"]');
      if (!slot) return;
      slot.classList.remove('is-hint');
      void slot.offsetWidth;
      slot.classList.add('is-hint');
      setTimeout(function () { slot.classList.remove('is-hint'); }, 3000);
    }

    /** 标红「不在唯一解里」的已选商品（购物车缩略图 + 右侧清单行），3 秒后自动卸掉 */
    function markWrong(indices) {
      for (var i = 0; i < indices.length; i++) {
        var nodes = [
          el.querySelector('.cart-item[data-slot="' + indices[i] + '"]'),
          el.querySelector('.items-row[data-slot="' + indices[i] + '"]'),
        ];
        for (var k = 0; k < nodes.length; k++) {
          (function (node) {
            if (!node) return;
            node.classList.remove('is-wrong');
            void node.offsetWidth;
            node.classList.add('is-wrong');
            setTimeout(function () { node.classList.remove('is-wrong'); }, 3000);
          })(nodes[k]);
        }
      }
    }

    /**
     * 使用一张换题卡：同关卡、换 seed 重出题目。
     * 已用次数与剩余时间带到新一局，每关本身上限 1 次。
     */
    function useReroll() {
      if (session.state !== 'selecting') return;
      if (used.reroll >= TOOLS.reroll.limit) {
        ZQ.audio.error();
        ZQ.ui.toast.show(ZQ.I18N.toastRerollCardUsedUp, { type: 'error' });
        return;
      }
      if ((ZQ.store.data.rerollCards || 0) <= 0) {
        ZQ.audio.error();
        ZQ.ui.toast.show(ZQ.I18N.toastRerollCardEmpty, { type: 'error' });
        return;
      }
      ZQ.store.useCard('reroll');
      used.reroll += 1;
      stopTimer();

      // 新题同时写回固定题，避免下次重进又回到原来那套凑不出的组合
      var seed = newSeed();
      var nextLv = ZQ.generator.generate(lv.levelId, seed);
      if (!ZQ.store.isLevelMaxed(lv.levelId)) ZQ.store.setFixedQuestion(lv.levelId, nextLv);

      rerollCarry = {
        levelId: lv.levelId,
        remaining: Math.max(1, remaining),
        used: { delay: used.delay, hint: used.hint, reroll: used.reroll },
      };
      ZQ.ui.toast.show(ZQ.I18N.toastRerollDone, { type: 'good' });
      ZQ.app.go('game', { levelId: lv.levelId, seed: seed });
    }

    /** 换题随机种子：避免与当前种子相同 */
    function newSeed() {
      var s = (Date.now() % 2147483647) ^ Math.floor(Math.random() * 999999);
      if (s === lv.seed) s += 1;
      return s;
    }

    /**
     * 结算：冻结选品 → 评级 → 记账 → 弹窗。
     * 由「点击结账」或「倒计时归零」触发；session.state 为唯一真源，重复调用直接返回。
     */
    function settle(forceInvalid) {
      if (session.state !== 'selecting') return;
      var evaluation = ZQ.rules.evaluateSelection(session.items(), lv);
      if (!evaluation.valid && !forceInvalid) {
        ZQ.audio.error();
        if (evaluation.invalidReason === 'count') {
          var left = Math.max(0, lv.n - evaluation.count);
          ZQ.ui.toast.show(
            left > 0
              ? ZQ.I18N.toastNeedMore.replace('{n}', left).replace('{item}', ZQ.itemWord(left))
              : ZQ.I18N.toastTooMany.replace('{n}', lv.n),
            { type: 'error' }
          );
        } else {
          ZQ.ui.toast.show(ZQ.I18N.toastConstraint, { type: 'error' });
        }
        return;
      }
      stopTimer();
      session.setState('checkout');
      updateHudState();

      var tools = el.querySelectorAll('.btn-tool');
      for (var bi = 0; bi < tools.length; bi++) {
        tools[bi].disabled = true;
        tools[bi].classList.add('is-off');
      }
      var hint = el.querySelector('.checkout-hint');
      if (hint) hint.parentNode.removeChild(hint);
      ZQ.store.markTutorial('checkoutHint');

      var T = session.total;
      var B = lv.budget;
      var star = evaluation.star;
      var rec = ZQ.store.recordResult(lv.levelId, star);
      var award = ZQ.rules.coinsAward(T, B, star, rec.clearIndex, rec.momBonus);
      // 妈妈奖励金已在 recordResult 内一次性入账，这里只补找零，避免重复发放。
      if (award.changeCoins > 0) ZQ.store.addCoins(award.changeCoins);

      session.setState('result');
      ZQ.screens.result.show({
        lv: lv,
        star: star,
        total: T,
        budget: B,
        coins: award.total,
        momBonus: award.momBonus,
        invalidReason: evaluation.invalidReason,
        firstThreeStar: rec.firstThreeStar,
        onRetry: function () { goLevel(lv.levelId); },
        onNext: function () {
          var next = lv.levelId + 1;
          if (next <= ZQ.totalLevels && ZQ.store.levelUnlocked(next)) goLevel(next);
          else goMap();
        },
        onMap: goMap,
      });

      /* 玩家看结算的这几秒，把下一关的图预取进缓存（未解锁/已满星时内部自动跳过） */
      if (ZQ.preload) ZQ.preload.items(lv.levelId + 1);
    }

    /** 进入指定关卡（不传 seed → 由 resolveLevel 决定沿用固定题或重新出题） */
    function goLevel(levelId) {
      ZQ.screens.result.close();
      ZQ.app.go('game', { levelId: levelId });
    }

    /** 回地图；P5 地图页就绪前回退为重开本关 */
    function goMap() {
      stopTimer();
      ZQ.screens.result.close();
      if (ZQ.screens.map) ZQ.app.go('map');
      else ZQ.app.go('game', { levelId: lv.levelId });
    }

    /* ---------- 界面同步 ---------- */

    /** 同步商品卡选中态（跨页保留）、购物篮缩略图、清单与件数 */
    function refresh() {
      var slots = el.querySelectorAll('.slot[data-slot]');
      for (var i = 0; i < slots.length; i++) {
        var ix = parseInt(slots[i].getAttribute('data-slot'), 10);
        var selected = session.isSelected(ix);
        slots[i].classList.toggle('is-selected', selected);
        slots[i].setAttribute('aria-pressed', selected ? 'true' : 'false');
      }
      ZQ.ui.cart.sync(cartPanel, lv, session);
      ZQ.ui.list.sync(el.querySelector('.hud-items'), lv, session);
      var evaluation = ZQ.rules.evaluateSelection(session.items(), lv);
      var checkout = el.querySelector('.btn-checkout');
      if (checkout) {
        checkout.classList.toggle('is-incomplete', !evaluation.valid);
        checkout.setAttribute('aria-label', evaluation.valid
          ? ZQ.I18N.labelCheckout
          : (ZQ.rules.constraintLabel(lv.constraint) || ZQ.I18N.constraintAny.replace('{n}', lv.n)));
      }
    }

    function popBadge() {
      var c = cartPanel.querySelector('.cart-count');
      if (!c) return;
      c.classList.remove('is-pop');
      void c.offsetWidth;
      c.classList.add('is-pop');
    }

    /** 取消选中某商品（清单行点击、购物篮双击共用） */
    function deselect(idx) {
      if (!session.remove(idx).ok) return;
      cancelFlight(idx);
      var slotEl = el.querySelector('.slot[data-slot="' + idx + '"]');
      if (slotEl) slotEl.classList.remove('is-selected');
      refresh();
      ZQ.audio.click();
    }

    el.addEventListener('click', function (e) {
      var t = e.target;
      if (!t || !t.closest) return;
      if (suppressClick) return;

      // 返回地图
      if (t.closest('.btn-back-game')) {
        ZQ.audio.click();
        goMap();
        return;
      }

      // 清单行 → 取消选择
      var row = t.closest('.items-row[data-slot]');
      if (row) { deselect(parseInt(row.getAttribute('data-slot'), 10)); return; }

      // 购物篮缩略图 → 取消选择（单击即取消，与清单行一致）
      var cartItem = t.closest('.cart-item[data-slot]');
      if (cartItem) {
        ZQ.audio.unlock();
        deselect(parseInt(cartItem.getAttribute('data-slot'), 10));
        return;
      }

      // 商品卡 → 选 / 取消（含超支拦截）
      var slotEl = t.closest('.slot[data-slot]');
      if (slotEl) {
        ZQ.audio.unlock();
        if (session.state !== 'selecting') return;
        var idx = parseInt(slotEl.getAttribute('data-slot'), 10);
        var res = session.toggle(idx);
        if (!res.ok) {
          if (res.reason === 'overspend') {
            shake(slotEl);
            ZQ.audio.error();
            ZQ.ui.toast.show(ZQ.I18N.toastOverspend, { type: 'error' });
          } else if (res.reason === 'tooMany') {
            shake(slotEl);
            ZQ.audio.error();
            ZQ.ui.toast.show(ZQ.I18N.toastTooMany.replace('{n}', lv.n), { type: 'error' });
          }
          return;
        }
        if (res.action === 'add') {
          slotEl.classList.add('is-selected');
          startFlight(slotEl, cartBox, idx, function () {
            if (!session.isSelected(idx)) return;
            refresh();
            ZQ.audio.ding();
            popBadge();
          });
        } else {
          cancelFlight(idx);
          slotEl.classList.remove('is-selected');
          refresh();
          ZQ.audio.click();
        }
        return;
      }

      // View Details 下拉清单：点击头部展开 / 收起
      var head = t.closest('.note-head');
      if (head) {
        var holder = el.querySelector('.hud-items');
        holder.classList.toggle('is-open');
        head.setAttribute('aria-expanded', holder.classList.contains('is-open') ? 'true' : 'false');
        ZQ.audio.click();
        return;
      }

      // 道具：延时卡 / 提示卡 / 换题卡
      var tool = t.closest('.btn-tool');
      if (tool) {
        ZQ.audio.unlock();
        var kind = tool.getAttribute('data-tool');
        if (kind === 'delay') useCard();
        else if (kind === 'hint') useHint();
        else if (kind === 'reroll') useReroll();
        return;
      }

      // 翻页
      var arrow = t.closest('.pager-arrow');
      if (arrow) {
        page = ZQ.ui.shelf.goto(shelfEl, page + (arrow.classList.contains('pager-next') ? 1 : -1));
        ZQ.audio.page();
        return;
      }
      var dot = t.closest('.pager-dot');
      if (dot) {
        page = ZQ.ui.shelf.goto(shelfEl, parseInt(dot.getAttribute('data-page'), 10));
        ZQ.audio.page();
        return;
      }

      // 结算：空车仅提示；否则进入结算
      if (t.closest('.btn-checkout')) {
        ZQ.audio.unlock();
        if (session.state !== 'selecting') return;
        if (session.count() === 0) {
          ZQ.audio.error();
          ZQ.ui.toast.show(ZQ.I18N.toastCartEmpty, { type: 'error' });
        } else {
          ZQ.audio.click();
          settle();
        }
      }
    });

    /* ---------- 货架横滑翻页（B2） ----------
     * 监听只挂在 .shelf-viewport：8px 内不捕获，商品卡点击不被劫持。
     * 拖拽中 inline 关掉 transition 跟手，松手交给 goto() 归一化（百分比基准）。
     * 位移写成 translateX(calc(-100%*page + offpx))，测试脚本可直接解析 inline 值。 */
    var swipeViewport = shelfEl.querySelector('.shelf-viewport');
    var swipeTrack = shelfEl.querySelector('.shelf-track');
    var pageCount = parseInt(shelfEl.getAttribute('data-pages'), 10) || 1;
    var swipeStart = 0;
    var swipePage = 0;

    // 速度基准从「手指按下」开始算，避免按住不动后再慢拖被误判为甩动
    swipeViewport.addEventListener('pointerdown', function () { swipeStart = Date.now(); });

    ZQ.ui.gesture.drag(swipeViewport, {
      axis: 'x',
      threshold: 8,
      firstPointerOnly: true,
      ignore: '.pager-arrow, .pager-dot',
      onStart: function () {
        /* 以 .shelf 的 data-cur 为准，而不是闭包里的 page：
         * 箭头/页点/提示高亮都会直接调 goto，闭包 page 可能已落后一帧。 */
        swipePage = parseInt(shelfEl.getAttribute('data-cur'), 10) || 0;
        swipeTrack.style.transition = 'none';
        /* 手指一动就把邻页的图挂上：真滑过去时基本已解码完，看不到白框 */
        ZQ.ui.shelf.prime(shelfEl, swipePage - 1);
        ZQ.ui.shelf.prime(shelfEl, swipePage + 1);
      },
      onMove: function (dx) {
        var w = swipeViewport.getBoundingClientRect().width;
        var off = Math.max(-(pageCount - 1 - swipePage) * w, Math.min(swipePage * w, dx));
        swipeTrack.style.transform = 'translateX(calc(' + (-100 * swipePage) + '% + ' + off + 'px))';
      },
      onEnd: function (info, cancelled) {
        /* 没越过 8px（纯点击/轻触）不接管：不写 transform、不吞 click */
        if (!info.captured) return;
        var w = swipeViewport.getBoundingClientRect().width;
        var off = Math.max(-(pageCount - 1 - swipePage) * w, Math.min(swipePage * w, info.dx));
        var elapsed = Math.max(1, Date.now() - swipeStart);
        var flipped = !cancelled &&
          (Math.abs(off) >= w * 0.3 || Math.abs(off) / elapsed >= 0.35);
        var next = flipped ? swipePage + (off < 0 ? 1 : -1) : swipePage;
        swipeTrack.style.transition = '';
        page = ZQ.ui.shelf.goto(shelfEl, next);
        suppressClick = true;
        setTimeout(function () { suppressClick = false; }, 0);
      }
    });
    refresh();
    updateTools();
    updateTimerHud();
    // 换题卡重开不重复演示新手提示，直接接着上一次的剩余时间
    if (carry) startTimer();
    else startWithTips(el, lv, startTimer);
  }

  /** 首次进入需要新机制的关卡时，依次弹出提示，全部关闭后才启动计时 */
  function startWithTips(el, lv, onAllClosed) {
    var queue = [];
    /* 第一关首见：基础操作引导（目标 → 选品 → 取消 → 查看 → 结算）。
     * 只教一次，跳过也记已读；后续机制提示仍各走各的 key。 */
    if (Number(lv.levelId || lv.id) === 1 && !ZQ.store.tutorialSeen('basicGuide')) {
      queue.push({
        target: el.querySelector('.hud-target'),
        key: 'basicGuide1',
        guide: true,
        title: ZQ.I18N.guide1Title,
        text: ZQ.I18N.guide1Text,
      });
      queue.push({
        target: el.querySelector('.slot[data-slot]'),
        key: 'basicGuide2',
        guide: true,
        title: ZQ.I18N.guide2Title,
        text: ZQ.I18N.guide2Text,
      });
      queue.push({
        target: el.querySelector('.panel-cart'),
        key: 'basicGuide3',
        guide: true,
        title: ZQ.I18N.guide3Title,
        text: ZQ.I18N.guide3Text,
      });
      queue.push({
        target: el.querySelector('.hud-items'),
        key: 'basicGuide4',
        guide: true,
        title: ZQ.I18N.guide4Title,
        text: ZQ.I18N.guide4Text,
      });
      queue.push({
        target: el.querySelector('.btn-checkout'),
        key: 'basicGuide5',
        guide: true,
        title: ZQ.I18N.guide5Title,
        text: ZQ.I18N.guide5Text,
      });
    }
    if (lv.constraint && lv.constraint.length && !ZQ.store.tutorialSeen('constraint')) {
      queue.push({
        target: el.querySelector('.hud-target .t-rule'),
        key: 'constraint',
        title: ZQ.I18N.tipConstraintTitle,
        text: ZQ.I18N.tipConstraintText,
        ok: ZQ.I18N.tipGotIt,
      });
    }
    if (lv.n >= 4 && !ZQ.store.tutorialSeen('fourItems')) {
      queue.push({
        target: el.querySelector('.hud-target .t-count'),
        key: 'fourItems',
        title: ZQ.I18N.tipFourTitle,
        text: ZQ.I18N.tipFourText,
        ok: ZQ.I18N.tipGotIt,
      });
    }
    var pager = el.querySelector('.shelf-pager');
    if (lv.pages > 1 && pager && !ZQ.store.tutorialSeen('shelfPager')) {
      /* 触摸端没有箭头，只有横滑：文案与高亮锚点都要换（锚点改成整块货架，
         否则高亮框只会套住三个 6px 小圆点） */
      var touchOnly = !!(window.matchMedia && window.matchMedia('(any-pointer: coarse)').matches);
      var shelfView = el.querySelector('.shelf-viewport');
      queue.push({
        target: touchOnly && shelfView ? shelfView : pager,
        key: 'shelfPager',
        title: ZQ.I18N.pagerTipTitle,
        text: touchOnly ? ZQ.I18N.pagerTipTextTouch : ZQ.I18N.pagerTipText,
        ok: ZQ.I18N.pagerTipOk,
      });
    }

    var skipAll = false;
    var hasGuide = false;
    queue.forEach(function (t) {
      if (!t.guide) return;
      hasGuide = true;
      t.skip = t.skip || ZQ.I18N.guideSkip;
      t.onSkip = function () { skipAll = true; };
    });

    next(0);

    function next(i) {
      if (skipAll || i >= queue.length) {
        if (hasGuide) ZQ.store.markTutorial('basicGuide');
        onAllClosed(); return;
      }
      var tip = queue[i];
      var done = false;
      function run() {
        if (done) return;
        done = true;
        showSpotlightTip(tip.target, tip, function () { next(i + 1); });
      }
      // 等一帧让布局稳定；后台标签页里 rAF 可能被冻结，用定时器兜底
      requestAnimationFrame(run);
      setTimeout(run, 60);
    }
  }
})();
