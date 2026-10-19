/* 金额工具：所有金额以「分」为整数存储，仅在渲染时格式化，杜绝浮点误差。
 * 商品标价与结算弹窗统一 2 位小数；Target 面板的预算用去尾零写法（53.7 / 18）。 */
window.ZQ = window.ZQ || {};

ZQ.money = {
  /** 元 -> 分（四舍五入到分） */
  toCents: function (yuan) {
    return Math.round(yuan * 100);
  },

  /** 分 -> 元（浮点），仅用于展示前的中间值 */
  toYuan: function (cents) {
    return cents / 100;
  },

  /** 2 位小数写法：420 -> "4.20"；500 -> "5.00" */
  fmt2: function (cents) {
    var neg = cents < 0;
    var v = Math.abs(Math.round(cents));
    var s = Math.floor(v / 100) + '.' + String(v % 100).padStart(2, '0');
    return (neg ? '-' : '') + s;
  },

  /** 去尾零写法：5370 -> "53.7"；1800 -> "18"；1750 -> "17.5"；1755 -> "17.55" */
  fmtTrim: function (cents) {
    var s = ZQ.money.fmt2(cents);
    if (s.indexOf('.') === -1) return s;
    s = s.replace(/0+$/, '');
    s = s.replace(/\.$/, '');
    return s;
  },

  /** 带 ¥ 前缀 */
  yuan2: function (cents) { return '¥' + ZQ.money.fmt2(cents); },
  yuanTrim: function (cents) { return '¥' + ZQ.money.fmtTrim(cents); },
};
