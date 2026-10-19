/* 轻提示：在 #toast-layer 内自上而下堆叠，淡入 → 停留 → 淡出移除。 */
window.ZQ = window.ZQ || {};
ZQ.ui = ZQ.ui || {};

(function () {
  var DEFAULT_DUR = 1600;
  var EXIT_MS = 320;

  ZQ.ui.toast = {
    /**
     * 显示一条轻提示。
     * @param {string} msg 文案
     * @param {{type?:'info'|'error'|'good', dur?:number}} [opts] type 决定配色，dur 为停留毫秒
     */
    show: function (msg, opts) {
      var layer = document.getElementById('toast-layer');
      if (!layer) return;
      opts = opts || {};

      var el = document.createElement('div');
      el.className = 'toast' + (opts.type ? ' toast-' + opts.type : '');
      el.textContent = msg;
      layer.appendChild(el);

      // 下一帧再加 .is-in，保证从初始态过渡到展开态
      requestAnimationFrame(function () { el.classList.add('is-in'); });

      setTimeout(function () {
        el.classList.remove('is-in');
        el.classList.add('is-out');
        setTimeout(function () {
          if (el.parentNode) el.parentNode.removeChild(el);
        }, EXIT_MS);
      }, opts.dur || DEFAULT_DUR);
    },
  };
})();
