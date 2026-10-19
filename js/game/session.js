/* 单关运行时状态机：选品阶段、已选集合、实时总价、操作守卫。
 * P3 只覆盖 SELECTING 的基础行为（点击选/取消、超支拦截）；
 * P4 在此之上接入计时器、延时卡片与 CHECKOUT/RESULT 结算。 */
window.ZQ = window.ZQ || {};

(function () {
  /**
   * @param {object} lv 关卡实例（含 items / budget，金额单位为分）
   */
  function Session(lv) {
    this.lv = lv;
    this.state = 'selecting';   // selecting | checkout | result
    this.selected = [];         // 已选商品在 lv.items 中的下标（升序）
    this.total = 0;             // 已选总价（分）
  }

  Session.prototype = {
    isSelected: function (idx) {
      return this.selected.indexOf(idx) !== -1;
    },

    count: function () {
      return this.selected.length;
    },

    /** 当前已选商品对象，按槽位下标升序返回 */
    items: function () {
      var out = [];
      for (var i = 0; i < this.selected.length; i++) out.push(this.lv.items[this.selected[i]]);
      return out;
    },

    /** 剩余预算（分），选中项超支时为负 */
    remaining: function () {
      return this.lv.budget - this.total;
    },

    /**
     * 点击商品：已选则取消；未选则尝试加入。
     * 超支会被拦截，且**不写入任何状态**（保证不会出现「抖动却已加入」）。
     * @returns {{ok:boolean, action?:'add'|'remove', reason?:'overspend'|'tooMany'|'frozen'|'absent'}}
     */
    toggle: function (idx) {
      if (this.state !== 'selecting') return { ok: false, reason: 'frozen' };
      if (this.isSelected(idx)) return this.remove(idx);
      var item = this.lv.items[idx];
      if (!item) return { ok: false, reason: 'absent' };
      if (this.selected.length >= this.lv.n) return { ok: false, reason: 'tooMany' };
      if (this.total + item.price > this.lv.budget) return { ok: false, reason: 'overspend' };
      this.selected.push(idx);
      this.selected.sort(function (a, b) { return a - b; });
      this.total += item.price;
      return { ok: true, action: 'add' };
    },

    /** 取消选中（未选中或已冻结时返回 ok:false，状态不变） */
    remove: function (idx) {
      if (this.state !== 'selecting') return { ok: false, reason: 'frozen' };
      var pos = this.selected.indexOf(idx);
      if (pos === -1) return { ok: false, reason: 'absent' };
      this.selected.splice(pos, 1);
      this.total -= this.lv.items[idx].price;
      return { ok: true, action: 'remove' };
    },

    clear: function () {
      this.selected = [];
      this.total = 0;
    },

    setState: function (s) {
      this.state = s;
    },
  };

  ZQ.session = {
    Session: Session,
    create: function (lv) { return new Session(lv); },
  };
})();
