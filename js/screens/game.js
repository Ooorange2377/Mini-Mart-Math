/* 游戏主界面页：组装任务/计时/货架/购物篮布局 + 选品交互（点击选/取消、超支拦截、飞入购物篮、翻页、双击删除）
 * + 计时器 / 延时卡片 / CHECKOUT 冻结 / 结算弹窗（P4）。 */
window.ZQ = window.ZQ || {};
ZQ.screens = ZQ.screens || {};

(function () {
  /* 飞行中的商品下标 → 飞行记录（用于取消已被移除商品的动画） */
  var flying = {};

  function fmtTime(sec) {
    var s = Math.max(0, sec | 0);
    var m = Math.floor(s / 60);
    var r = s % 60;
    return (m < 10 ? '0' : '') + m + ':' + (r < 10 ? '0' : '') + r;
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

  /** 首次遇到多页货架时，框选翻页器并暂停计时，关闭提示后再开始本关 */
  function showPagerHint(pager, onClose) {
    var layer = document.getElementById('modal-layer');
    if (!layer) { onClose(); return; }

    layer.innerHTML = '';
    var mask = document.createElement('div');
    mask.className = 'pager-tip-mask';
    mask.innerHTML =
      '<div class="pager-tip-spot" aria-hidden="true"></div>' +
      '<div class="pager-tip-card" role="dialog" aria-modal="true">' +
        '<div class="pager-tip-title">' + ZQ.I18N.pagerTipTitle + '</div>' +
        '<div class="pager-tip-text">' + ZQ.I18N.pagerTipText + '</div>' +
        '<button class="btn-result btn-primary pager-tip-ok" type="button">' +
          ZQ.I18N.pagerTipOk +
        '</button>' +
      '</div>';
    layer.appendChild(mask);

    var spot = mask.querySelector('.pager-tip-spot');
    var card = mask.querySelector('.pager-tip-card');
    var ok = mask.querySelector('.pager-tip-ok');
    var closed = false;

    function position() {
      var rect = pager.getBoundingClientRect();
      var pad = 9;
      spot.style.left = (rect.left - pad) + 'px';
      spot.style.top = (rect.top - pad) + 'px';
      spot.style.width = (rect.width + pad * 2) + 'px';
      spot.style.height = (rect.height + pad * 2) + 'px';
      card.style.left = (rect.left + rect.width / 2) + 'px';
      card.style.top = (rect.top - 18) + 'px';
    }

    function close() {
      if (closed) return;
      closed = true;
      window.removeEventListener('resize', position);
      document.removeEventListener('keydown', onKey);
      ZQ.store.markTutorial('shelfPager');
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
        '<div class="room"><div class="room-floor"></div></div>' +

        // 左侧任务卡：标签与值左右对齐
        '<aside class="hud-target" aria-label="' + ZQ.I18N.labelTarget + '">' +
          '<div class="t-head">' +
            '<span class="t-title">' + ZQ.I18N.labelTarget + '</span>' +
          '</div>' +
          '<div class="t-row"><span>' + ZQ.I18N.labelLevel + '</span><b>' + lv.levelId + '</b></div>' +
          '<div class="t-row t-budget"><span>' + ZQ.I18N.labelBudget + '</span><b>¥ ' + ZQ.money.fmtTrim(lv.budget) + '</b></div>' +
          '<div class="t-row"><span>' + ZQ.I18N.labelNeedCount + '</span><b>' + lv.n + ' 件</b></div>' +
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

        // 左上：延时卡片按钮，位于任务面板上方、倒计时面板左侧
        '<button class="btn-delaycard" type="button">' +
          '<span class="dc-label">' + ZQ.I18N.useCard + '</span>' +
          '<span class="dc-count"></span>' +
        '</button>' +

        // 右侧纵向功能区：详情下拉 + 购物篮
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
      el.setAttribute('data-level', lv.levelId);
      this.stage = el;

      ZQ.ui.list.reset();   // 新关卡：清空清单行缓存，避免沿用上一关的新增判定
      bind(el, lv, session);
      return el;
    },

    fmtTime: fmtTime,
  };

  /** 事件绑定：所有交互走 .stage 上的事件委托 */
  function bind(el, lv, session) {
    var cartPanel = el.querySelector('.panel-cart');
    var cartBox = el.querySelector('.cart');
    var shelfEl = el.querySelector('.shelf');
    var timerBox = el.querySelector('.hud-timer');
    var page = 0;

    /* ---------- 计时器 ---------- */
    var remaining = lv.timeSec;      // 剩余秒数
    var deadline = Date.now() + remaining * 1000;
    var timerId = null;
    var cardsUsed = 0;               // 本关已用延时卡张数

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

    /** 延时卡片剩余可用张数：实际持有量与本关上限制约后的较小值 */
    function updateCardBtn() {
      var own = ZQ.store.data.delayCards || 0;
      var left = Math.max(0, Math.min(own, ZQ.DELAY_CARD_MAX_PER_LEVEL - cardsUsed));
      var c = el.querySelector('.btn-delaycard .dc-count');
      if (c) c.textContent = '剩 ' + left;
      var btn = el.querySelector('.btn-delaycard');
      if (btn && session.state === 'selecting') btn.classList.toggle('is-off', left <= 0);
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
      if (cardsUsed >= ZQ.DELAY_CARD_MAX_PER_LEVEL) {
        ZQ.audio.error();
        ZQ.ui.toast.show(ZQ.I18N.toastDelayCardUsedUp, { type: 'error' });
        return;
      }
      if (!ZQ.store.useCard()) {
        ZQ.audio.error();
        ZQ.ui.toast.show(ZQ.I18N.toastDelayCardEmpty, { type: 'error' });
        return;
      }
      cardsUsed += 1;
      remaining += ZQ.DELAY_CARD_SECONDS;
      deadline += ZQ.DELAY_CARD_SECONDS * 1000;
      updateTimerHud();
      updateCardBtn();
      floatText(ZQ.I18N.toastDelayCardAdded);
      ZQ.audio.coin();
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
              ? ZQ.I18N.toastNeedMore.replace('{n}', left)
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

      var btn = el.querySelector('.btn-delaycard');
      if (btn) { btn.disabled = true; btn.classList.add('is-off'); }
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
    }

    /** 进入指定关卡（不传 seed → 由 resolveLevel 决定沿用固定题或重新出题） */
    function goLevel(levelId) {
      ZQ.screens.result.close();
      ZQ.app.go('game', { levelId: levelId });
    }

    /** 回地图；P5 地图页就绪前回退为重开本关 */
    function goMap() {
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

      // 清单行 → 取消选择
      var row = t.closest('.items-row[data-slot]');
      if (row) { deselect(parseInt(row.getAttribute('data-slot'), 10)); return; }

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

      // 延时卡片
      if (t.closest('.btn-delaycard')) { ZQ.audio.unlock(); useCard(); return; }

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

    // 购物篮缩略图双击 → 移除该商品
    cartPanel.addEventListener('dblclick', function (e) {
      var t = e.target;
      if (!t || !t.closest) return;
      var item = t.closest('.cart-item[data-slot]');
      if (!item) return;
      deselect(parseInt(item.getAttribute('data-slot'), 10));
    });

    refresh();
    updateCardBtn();
    var pager = el.querySelector('.shelf-pager');
    if (lv.pages > 1 && pager && !ZQ.store.tutorialSeen('shelfPager')) {
      requestAnimationFrame(function () { showPagerHint(pager, startTimer); });
    } else {
      startTimer();
    }
  }
})();
