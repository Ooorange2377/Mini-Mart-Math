/* 关卡图片预取：在玩家看结算、翻地图的空档，把下一关会用到的商品图悄悄下好。
 * 只预取 WebP（失败回退优化 PNG），全局去重 + 并发限流 + 单次上限 24 张，
 * 保证「正在玩的这一关」永远优先占用带宽。 */
window.ZQ = window.ZQ || {};

(function () {
  var MAX = 24;          // 单次预取上限（一关最多 2 页 × 12 件，去重后通常 ≤ 23）
  var CONCURRENCY = 4;   // 同时最多 4 个请求，轻度预取
  var queued = {};       // url → true（全局去重，同一张图只排一次）
  var queue = [];
  var active = 0;
  var alive = [];        // 持有 Image 引用，避免未完成的请求被 GC 回收

  function pump() {
    while (active < CONCURRENCY && queue.length) {
      var job = queue.shift();
      active++;
      var img = new Image();
      alive.push(img);
      img.onload = function () { active--; pump(); };
      /* WebP 缺失时按 PNG 兜底：只切一次，避免同一张失败图反复触发 error */
      img.onerror = function () {
        var fb = this.getAttribute('data-fb');
        if (!fb) {
          this.setAttribute('data-fb', '1');
          active--;
          if (job.fallback) this.src = job.fallback;
          pump();
        }
      };
      img.src = job.url;
    }
  }

  function enqueue(url, fallback) {
    if (!url || queued[url]) return 0;
    queued[url] = true;
    queue.push({ url: url, fallback: fallback || '' });
    return 1;
  }

  ZQ.preload = {
    /**
     * 预热某关的商品图。
     * 已满 3 星的关卡每次进关都会重新出题，预取结果对不上，直接跳过。
     * @param {number} levelId
     * @returns {number} 本次新排入队列的图片数
     */
    items: function (levelId) {
      if (!levelId || levelId < 1 || levelId > ZQ.totalLevels) return 0;
      if (ZQ.store.levelStars(levelId) >= 3) return 0;
      var resolve = ZQ.screens.game && ZQ.screens.game.resolveLevel;
      if (!resolve) return 0;
      var lv = resolve(levelId);
      if (!lv || !lv.items) return 0;
      var n = 0;
      var seen = {};
      for (var i = 0; i < lv.items.length && n < MAX; i++) {
        var id = lv.items[i] && lv.items[i].itemId;
        if (!id || seen[id]) continue;
        seen[id] = 1;
        var meta = ZQ.ITEM_BY_ID[id];
        if (!meta) continue;
        n += enqueue(encodeURI(ZQ.itemRuntimePath(meta)), encodeURI(ZQ.itemFallbackPath(meta)));
      }
      pump();
      return n;
    },

    /** 排队中/进行中的图片数（断言与调试用） */
    pending: function () {
      return queue.length + active;
    },
  };
})();
