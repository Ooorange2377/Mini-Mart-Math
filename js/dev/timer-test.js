/* 定时器暂停模块的纯逻辑测试（不需要浏览器）：
 *   node js/dev/timer-test.js
 * 断言：切后台期间到期时间被冻结、回到前台按剩余时长继续、clear() 生效。 */
'use strict';

var fs = require('fs');
var path = require('path');

var listeners = [];
var bodyClasses = [];
var fakeDocument = {
  hidden: false,
  body: { classList: { add: function (c) { bodyClasses.push('+' + c); }, remove: function (c) { bodyClasses.push('-' + c); } } },
  addEventListener: function (type, fn) { listeners.push({ type: type, fn: fn }); }
};
var timers = [];
var seq = 0;

global.window = {
  setTimeout: function (fn, ms) { var id = ++seq; timers.push({ id: id, fn: fn, at: Date.now() + ms, ms: ms }); return id; },
  clearTimeout: function (id) { timers = timers.filter(function (t) { return t.id !== id; }); }
};
global.document = fakeDocument;

/* 时钟推进器：用虚拟偏移量模拟时间流逝 */
var clockOffset = 0;

/* 让 timers.js 里的 Date.now() 也受虚拟时间控制 */
var realNow = Date.now;
Date.now = function () { return realNow() + clockOffset; };

/* 以 10ms 步长推进虚拟时间，让周期定时器能像真实环境一样连续到期 */
function advance(ms) {
  var step = 10;
  for (var elapsed = 0; elapsed < ms; elapsed += step) {
    clockOffset += step;
    var due = timers.filter(function (t) { return t.at <= Date.now(); });
    due.sort(function (a, b) { return a.at - b.at; });
    due.forEach(function (t) {
      if (timers.indexOf(t) < 0) return;
      timers = timers.filter(function (x) { return x.id !== t.id; });
      t.fn();
    });
  }
}

function fireVisibility(hidden) {
  fakeDocument.hidden = hidden;
  listeners.filter(function (l) { return l.type === 'visibilitychange'; })
    .forEach(function (l) { l.fn(); });
}

/* 载入模块（它依赖 window/document 全局；浏览器里 window 属性可直接当全局变量用，
 *  测试环境里需要手动把 ZQ 挂到 global 上） */
global.window.ZQ = {};
global.ZQ = global.window.ZQ;
var src = fs.readFileSync(path.join(__dirname, '..', 'core', 'timers.js'), 'utf8');
new Function('window', 'document', src)(global.window, global.document);
var ZQ = global.window.ZQ;

var failed = 0;
function check(name, cond, detail) {
  if (!cond) failed++;
  console.log((cond ? '  PASS ' : '  FAIL ') + name + (detail ? ' — ' + detail : ''));
}

/* 1. after：正常到期 */
var fired = 0;
ZQ.timer.after(function () { fired++; }, 1000);
advance(600);
check('after 未提前触发', fired === 0, 'fired=' + fired);
advance(500);
check('after 到期触发一次', fired === 1, 'fired=' + fired);

/* 2. 后台冻结：剩余 400ms 时切后台 5 秒，回到前台后还在 400ms 以内不触发 */
var fired2 = 0;
ZQ.timer.after(function () { fired2++; }, 1000);
advance(600);
fireVisibility(true);
check('hidden 后清空原生定时器', timers.length === 0, 'pending=' + timers.length);
check('body 加 is-paused', bodyClasses.indexOf('+is-paused') > -1, bodyClasses.join(','));
advance(5000);                          // 后台 5 秒（虚拟定时器已清空，不应触发）
check('后台期间不触发', fired2 === 0, 'fired=' + fired2);
fireVisibility(false);
check('body 移除 is-paused', bodyClasses.indexOf('-is-paused') > -1, bodyClasses.join(','));
advance(300);
check('回来后不足 400ms 仍不触发', fired2 === 0, 'fired=' + fired2);
advance(150);
check('回来后按剩余时长触发', fired2 === 1, 'fired=' + fired2);

/* 3. clear：取消后不再触发 */
var fired3 = 0;
var token = ZQ.timer.after(function () { fired3++; }, 500);
ZQ.timer.clear(token);
advance(1000);
check('clear 后不触发', fired3 === 0, 'fired=' + fired3);

/* 4. every：周期触发，且暂停期间不累积补发 */
var count = 0;
var tk = ZQ.timer.every(function () { count++; }, 200);
advance(650);
check('every 周期触发', count >= 3 && count <= 4, 'count=' + count);
fireVisibility(true);
advance(2000);
check('every 暂停期间不触发', count <= 4, 'count=' + count);
fireVisibility(false);
advance(250);
/* 暂停点剩约 150ms：恢复后先补这一次，下一次要再等 200ms 才到期 */
check('every 恢复后继续', count === 4, 'count=' + count);
ZQ.timer.clear(tk);

/* 5. 暂停状态下新建的定时器不应被误当作已暂停 */
fireVisibility(true);
var fired4 = 0;
ZQ.timer.after(function () { fired4++; }, 100);
advance(300);
check('暂停期间新建的定时器仍按真实时间走', fired4 === 1, 'fired=' + fired4);
fireVisibility(false);

if (failed) {
  console.log('\n定时器测试 FAIL：' + failed + ' 项');
  process.exit(1);
}
console.log('\n定时器测试 PASS：全部通过');
