/* 可复现的种子随机数：mulberry32。同一 seed 永远产生同一序列，便于关卡持久化与复现。 */
window.ZQ = window.ZQ || {};

ZQ.rng = {
  /** 由整型种子创建一个随机数发生器，返回 [0,1) 的浮点数函数（附带 int/range/pick/shuffle 便捷方法） */
  create: function (seed) {
    var s = seed >>> 0;
    var next = function () {
      s = (s + 0x6D2B79F5) >>> 0;
      var t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    next.int = function (min, max) { // 闭区间整数
      return min + Math.floor(next() * (max - min + 1));
    };
    next.pick = function (arr) {
      return arr[Math.floor(next() * arr.length)];
    };
    next.shuffle = function (arr) {
      var a = arr.slice();
      for (var i = a.length - 1; i > 0; i--) {
        var j = Math.floor(next() * (i + 1));
        var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
      }
      return a;
    };
    return next;
  },

  /** 生成一个新的随机种子 */
  newSeed: function () {
    return (Math.floor(Math.random() * 0xFFFFFFFF) >>> 0) || 1;
  },
};
