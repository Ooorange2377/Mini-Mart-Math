/* 可暂停的定时器：页面切到后台时冻结倒计时/仪式动画的推进，回来按剩余时间继续。
 *
 * 为什么不用原生 setTimeout：浏览器在后台会节流甚至丢弃回调，导致仪式动画
 * 「跳帧跑完」或阶段错乱。这里把每个定时器的到期时刻记录下来，hidden 时
 * 清掉原生定时器，visible 时用剩余时长重新排期。
 *
 * 用法：ZQ.timer.after(fn, ms)、ZQ.timer.every(fn, ms)、ZQ.timer.clear(token) */
window.ZQ = window.ZQ || {};

(function () {
  var seq = 0;
  var items = {};          // token -> { fn, ms, repeat, due, handle, done }
  var paused = false;
  var pausedAt = 0;

  function now() { return Date.now(); }

  function schedule(item, delay) {
    if (item.done) return;
    item.due = now() + delay;
    item.handle = window.setTimeout(function fire() {
      if (item.done) return;
      if (item.repeat) {
        item.due = now() + item.ms;
        item.handle = window.setTimeout(fire, item.ms);
        item.fn();
      } else {
        item.done = true;
        delete items[item.token];
        item.fn();
      }
    }, delay);
  }

  function add(fn, ms, repeat) {
    var token = ++seq;
    var item = { token: token, fn: fn, ms: ms, repeat: repeat, done: false };
    items[token] = item;
    schedule(item, ms);
    return token;
  }

  function pause() {
    if (paused) return;
    paused = true;
    pausedAt = now();
    for (var k in items) {
      if (!items.hasOwnProperty(k)) continue;
      var item = items[k];
      if (item.done) continue;
      window.clearTimeout(item.handle);
      item.handle = null;
      item.remaining = Math.max(0, item.due - pausedAt);
    }
  }

  function resume() {
    if (!paused) return;
    paused = false;
    for (var k in items) {
      if (!items.hasOwnProperty(k)) continue;
      var item = items[k];
      if (item.done) continue;
      schedule(item, item.remaining || 0);
    }
  }

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      pause();
      document.body.classList.add('is-paused');   // CSS 动画同步暂停（见 animations.css）
    } else {
      document.body.classList.remove('is-paused');
      resume();
    }
  });

  ZQ.timer = {
    after: function (fn, ms) { return add(fn, ms, false); },
    every: function (fn, ms) { return add(fn, ms, true); },
    clear: function (token) {
      var item = items[token];
      if (!item) return;
      item.done = true;
      if (item.handle) window.clearTimeout(item.handle);
      delete items[token];
    },
    isPaused: function () { return paused; }
  };
})();
