#!/usr/bin/env node
/* PC 基线截图 + 关键选择器样式快照。
 *
 * 用法：
 *   node js/dev/capture.js js/dev/baseline/pc1920
 *   node js/dev/capture.js /tmp/after --url http://127.0.0.1:8137/index.html
 *   可选参数：--width 1920 --height 1080 --dpr 1
 *
 * 前提：已启动静态服务器（默认 8137），本机装有 Chrome（可用 CHROME 环境变量覆盖）。
 *
 * 为可复现性，脚本在截图前会：
 *   1. 注入固定存档（30 关三星、零花钱 120、各类卡各 2 张、教程标记全为已读）
 *   2. 关闭音效与音乐
 *   3. 注入 `*{animation:none!important;transition:none!important}`，冻结所有动画到终态
 *   4. 关卡页停掉倒计时，结算页传 coins=0 避免落币动画
 * 因此基线是「静止态」截图，用于改动前后逐像素比对，不代表动画过程中的画面。 */
'use strict';

var fs = require('fs');
var os = require('os');
var path = require('path');
var childProcess = require('child_process');

function arg(name, fallback) {
  var i = process.argv.indexOf('--' + name);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

var OUT_DIR = process.argv[2] && process.argv[2].indexOf('--') !== 0
  ? process.argv[2]
  : path.join(__dirname, 'baseline', 'pc1920');
var URL_BASE = arg('url', 'http://127.0.0.1:8137/index.html');
var WIDTH = parseInt(arg('width', '1920'), 10);
var HEIGHT = parseInt(arg('height', '1080'), 10);
var DPR = parseFloat(arg('dpr', '1'));
var MOBILE = arg('mobile', '') === '1';
var ASSERT_MOBILE = arg('assert-mobile', '') === '1';
var VERIFY_BEHAVIOR = arg('verify-behavior', '') === '1';
var VERIFY_GESTURE = arg('verify-gesture', '') === '1';
var VERIFY_SHELF = arg('verify-shelf', '') === '1';
/* 注入底部安全区高度（px）：headless 无法模拟 env(safe-area-inset-*)，
 * 用 --safe-b 变量代偿；生产环境走 env()，传 0 等价于无安全区。 */
var SAFE_B = parseFloat(arg('safe-b', '0'));
/* 名称溢出的容忍值（px）：629/667/844 用 0（必须完整显示），606 保守档可放宽用于记录 */
var NAME_TOL = parseFloat(arg('name-tol', '0'));
/* 名称全覆盖审计：把 1~42 关的商品池逐一渲染进真实货架，逐个测量 .slot-name */
var NAME_AUDIT = arg('name-audit', '') === '1';

/* 本轮批量改短的 21 个商品 id（审计逐个点名输出） */
var AUDIT_IDS = ['s05', 's02', 's04', 's12', 's15', 's41', 'y12',
  's01', 's06', 's13', 's14', 's16', 's22', 's24', 's27', 's28', 's43',
  'y03', 'y05', 'y06', 'y13'];

/* 需要快照计算样式的选择器：覆盖 4 个页面 + 游戏内关键控件 */
var STYLE_TARGETS = [
  '.stage', '.hall-bg', '.hall-title', '.hall-mom',
  '.hud-target', '.t-title', '.t-rule-label', '.t-rule-line',
  '.hud-timer', '.hud-timer .t-label', '.hud-timer .t-time',
  '.shelf', '.shelf-viewport', '.slot', '.slot-name', '.slot-price',
  '.shelf-pager', '.pager-arrow', '.pager-dot',
  '.panel-basket', '.hud-items', '.hud-tools', '.dt-btn', '.btn-back-game',
  '.items-row .row-name', '.items-row .row-price', '.cart-item',
  '.btn-checkout', '.map-title', '.page-title', '.map-body', '.lv',
  '.shop-grid', '.card-name', '.card-owned', '.skins-body', '.skin-card'
];

/* 固定存档：让 5 个页面都处于「有内容」的稳定状态 */
var SEED = {
  version: 4,
  levelStars: {}, threeStarLedger: {}, momBonusLedger: {}, clearCounts: {},
  coins: 120, delayCards: 2, hintCards: 2, rerollCards: 2,
  equipped: { cart: 'mint', pig: 'glass' },
  fixedQuestions: {},
  tutorialSeen: { constraint: true, fourItems: true, shelfPager: true, checkoutHint: true },
  settings: { sound: false, music: false, lang: 'zh' }
};
for (var i = 1; i <= 30; i++) {
  SEED.levelStars[i] = 3;
  SEED.threeStarLedger[i] = true;
  SEED.momBonusLedger[i] = true;
  SEED.clearCounts[i] = 1;
}

var SEED_SOURCE = 'try{window.localStorage.setItem("zqdz_save_v1",' + JSON.stringify(JSON.stringify(SEED)) + ');}catch(e){}';

/* 冻结动画：在文档最早期注入，保证首帧就没有动画在跑 */
var FREEZE_CSS =
  '*{animation-duration:0s!important;animation-delay:0s!important;' +
  'transition-duration:0s!important;transition-delay:0s!important;}';

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

/* ---------- 极简 CDP 客户端（Node 22+ 自带 WebSocket） ---------- */
function CDP(wsUrl) {
  var self = this;
  this.ws = new WebSocket(wsUrl);
  this.seq = 0;
  this.pending = new Map();
  this.listeners = new Map();
  this.ready = new Promise(function (res, rej) {
    self.ws.addEventListener('open', function () { res(); });
    self.ws.addEventListener('error', function (e) { rej(new Error('WebSocket error')); });
  });
  this.ws.addEventListener('message', function (ev) {
    var msg = JSON.parse(ev.data);
    if (msg.id && self.pending.has(msg.id)) {
      var p = self.pending.get(msg.id);
      self.pending.delete(msg.id);
      if (msg.error) p.reject(new Error(msg.error.message)); else p.resolve(msg.result);
    } else if (msg.method) {
      (self.listeners.get(msg.method) || []).forEach(function (fn) { fn(msg.params); });
    }
  });
}

CDP.prototype.send = function (method, params) {
  var self = this;
  var id = ++this.seq;
  return new Promise(function (resolve, reject) {
    self.pending.set(id, { resolve: resolve, reject: reject });
    self.ready.then(function () {
      self.ws.send(JSON.stringify({ id: id, method: method, params: params || {} }));
    });
  });
};

CDP.prototype.once = function (method, timeout) {
  var self = this;
  return new Promise(function (resolve, reject) {
    var list = self.listeners.get(method) || [];
    var timer = setTimeout(function () {
      self.listeners.set(method, (self.listeners.get(method) || []).filter(function (f) { return f !== fn; }));
      reject(new Error('timeout waiting ' + method));
    }, timeout || 20000);
    var fn = function (params) {
      clearTimeout(timer);
      self.listeners.set(method, (self.listeners.get(method) || []).filter(function (f) { return f !== fn; }));
      resolve(params);
    };
    self.listeners.set(method, list.concat(fn));
  });
};

CDP.prototype.evaluate = function (expr, awaitPromise) {
  return this.send('Runtime.evaluate', {
    expression: expr, awaitPromise: !!awaitPromise, returnByValue: true, allowUnsafeEvalBlockedByCSP: true
  }).then(function (r) {
    if (r.exceptionDetails) throw new Error('page error: ' + (r.exceptionDetails.text || '') +
      ' ' + (r.exceptionDetails.exception && r.exceptionDetails.exception.description || ''));
    return r.result && r.result.value;
  });
};

/* ---------- 启动 Chrome ---------- */
function findChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  var candidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser'
  ];
  for (var i = 0; i < candidates.length; i++) {
    if (fs.existsSync(candidates[i])) return candidates[i];
  }
  throw new Error('未找到 Chrome，可用 CHROME=/path/to/chrome 指定');
}

function launchChrome() {
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zqcap-'));
  var proc = childProcess.spawn(findChrome(), [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--mute-audio',
    '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    '--force-device-scale-factor=' + DPR,
    '--window-size=' + WIDTH + ',' + HEIGHT,
    '--remote-debugging-port=0',
    '--user-data-dir=' + dir,
    'about:blank'
  ], { stdio: ['ignore', 'ignore', 'pipe'] });

  return new Promise(function (resolve, reject) {
    var buf = '';
    var timer = setTimeout(function () { reject(new Error('Chrome 启动超时')); }, 20000);
    proc.stderr.on('data', function (chunk) {
      buf += chunk.toString();
      var m = buf.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (m) {
        clearTimeout(timer);
        var wsHost = m[1].replace(/^ws:\/\//, '');
        resolve({ proc: proc, browserWs: m[1], httpBase: 'http://' + wsHost.replace(/\/devtools.*$/, '') });
      }
    });
    proc.on('error', reject);
  });
}

/* ---------- 采样 ---------- */
/* 等图片解码 + 字体就绪。注意：懒加载且未进入视口的图片，img.decode() 可能永久挂起，
 * 因此每个 decode 都加 900ms 上限，整体再加 1200ms 兜底，保证采样一定会推进。 */
function settleScript() {
  return 'new Promise(function(res){' +
    'var finished=false;' +
    'function done(){if(finished)return;finished=true;requestAnimationFrame(function(){requestAnimationFrame(function(){res(1);});});}' +
    'setTimeout(done,1200);' +
    '/* file:// 下对 <img> 调 decode() 会触发 CORS 报错，只等 complete 与字体即可 */' +
    'if(location.protocol==="file:"){setTimeout(done,300);return;}' +
    'function cap(p){return Promise.race([p,new Promise(function(r){setTimeout(r,900);})]);}' +
    'var imgs=[].slice.call(document.images).filter(function(i){return i.complete;i});' +
    'var waits=imgs.map(function(i){return cap((i.decode?i.decode():Promise.resolve()).catch(function(){}));});' +
    'Promise.all(waits).then(function(){return cap(document.fonts&&document.fonts.ready);})' +
    '.then(function(){setTimeout(done,60);});' +
    '})';
}

function snapshotScript() {
  return '(function(){var out={};var sel=' + JSON.stringify(STYLE_TARGETS) + ';' +
    'sel.forEach(function(s){var el=document.querySelector(s);if(!el){out[s]=null;return;}' +
    'var cs=getComputedStyle(el);var r=el.getBoundingClientRect();' +
    'out[s]={fontSize:cs.fontSize,lineHeight:cs.lineHeight,padding:cs.padding,color:cs.color,' +
    'x:Math.round(r.left*100)/100,y:Math.round(r.top*100)/100,w:Math.round(r.width*100)/100,h:Math.round(r.height*100)/100};});' +
    'return out;})()';
}

var SCREENS = [
  { name: '01-start', js: '' },
  { name: '02-map', js: 'ZQ.app.go("map");' },
  {
    name: '03-game',
    js: 'ZQ.app.go("game",{levelId:25,seed:12345});' +
        'if(ZQ.screens.game._stopTimer)ZQ.screens.game._stopTimer();'
  },
  {
    name: '04-result',
    js: 'ZQ.app.go("game",{levelId:25,seed:12345});' +
        'if(ZQ.screens.game._stopTimer)ZQ.screens.game._stopTimer();' +
        'ZQ.screens.result.show({lv:ZQ.levelConfig(25),star:3,total:2000,budget:2000,' +
        'coins:0,momBonus:0,firstThreeStar:false,onRetry:function(){},onNext:function(){},onMap:function(){}});'
  },
  { name: '05-shop', js: 'ZQ.app.go("shop");' },
  { name: '06-skins', js: 'ZQ.app.go("skins");' }
];

/* ---------- 移动端验收断言（在页面内执行，返回 {name, pass, detail} 数组） ---------- */
function mobileAssertScript() {
  var portrait = HEIGHT > WIDTH;
  /* 图片区防回退线（按档锁死，口径 = 商品图框高，即评估时给作者看的那组数）：
   * 844=48 / 667=45 / 629=41 / 606=38（图框 = 可绘制区 + 2×2px 虚线边框） */
  var IMG_FLOOR = SAFE_B >= 34 ? 38 : (SAFE_B >= 21 ? 41 : (WIDTH < 760 ? 45 : 48));
  return '(function(){' +
    'var out=[];' +
    'var portrait=' + portrait + ';' +
    'function add(name,pass,detail){out.push({name:name,pass:!!pass,detail:detail});}' +
    'var coarse=window.matchMedia("(pointer: coarse)").matches;' +
    'add("pointer: coarse 生效",coarse,"pointer coarse=" + coarse);' +
    '/* 竖屏：只验提示层，不进行可玩性断言（竖屏不提供游玩布局） */' +
    'var tip0=document.querySelector(".rotate-tip");' +
    'var tipShown=!!tip0&&getComputedStyle(tip0).display!=="none";' +
    'var tipDisp=tip0?getComputedStyle(tip0).display:"(无节点)";' +
    'if(portrait){' +
    'add("竖屏提示显示",portrait===tipShown,"display="+tipDisp+"（竖屏应为 flex）");' +
    'var card=tip0.querySelector(".rotate-tip-card");var cr=card.getBoundingClientRect();' +
    'add("竖屏提示在视口内",cr.left>=0&&cr.top>=0&&cr.right<=window.innerWidth+1' +
    '&&cr.bottom<=window.innerHeight+1,"卡片 "+Math.round(cr.left)+","+Math.round(cr.top)+" "+Math.round(cr.width)+"×"+Math.round(cr.height));' +
    'add("竖屏提示可关闭",getComputedStyle(tip0.querySelector(".rotate-tip-btn")).display!=="none","按钮可见");' +
    'return JSON.stringify(out);}' +
    'add("横屏不显示提示",!tipShown,"display="+tipDisp);' +
    'var docW=document.documentElement.scrollWidth, winW=window.innerWidth;' +
    'add("无横向溢出",docW<=winW+1,docW+" <= "+winW);' +
    '/* 1. 字号下限（逐项，不抽样） */' +
    'var fonts=[[".hud-target .t-title",14],[".hud-target .t-rule-label",10],' +
    '[".hud-target .t-rule-line",10],[".hud-timer .t-label",11],' +
    '[".hud-timer .t-state",10],[".hud-items .note-title",11],' +
    '[".items-row .row-name",11],[".items-row .row-price",11],' +
    '[".slot-name",10],[".slot-price",12],[".btn-tool .dt-name",10],[".dt-badge",10]];' +
    'fonts.forEach(function(f){var el=document.querySelector(f[0]);' +
    'if(!el){add("字号 "+f[0],true,"元素不存在，跳过");return;}' +
    'var fs=parseFloat(getComputedStyle(el).fontSize);' +
    'add("字号 "+f[0]+" ≥ "+f[1]+"px",fs>=f[1]-0.01,fs.toFixed(2)+"px");});' +
    '/* 2. nowrap 文本溢出逐项检查：.slot-name 要求「完整显示」（容忍值可配），' +
    ' *    .t-rule-line 允许 ≤3px 并记录实际值（窄台可接受），其余要求完全容纳 */' +
    'var NAME_TOL=' + NAME_TOL + ';' +
    'var nowrap=[".slot-name",".slot-price",".t-rule-line",".items-row .row-name",' +
    '".items-row .row-price",".hud-items .note-title"];' +
    'nowrap.forEach(function(s){var els=[].slice.call(document.querySelectorAll(s));' +
    'if(!els.length){add("溢出 "+s,true,"无元素，跳过");return;}' +
    'var tol=s===".slot-name"?NAME_TOL:(s===".t-rule-line"?3:1);' +
    'var bad=els.filter(function(e){return e.scrollWidth>e.clientWidth+tol;});' +
    'var worst=0;els.forEach(function(e){var o=e.scrollWidth-e.clientWidth;if(o>worst)worst=o;});' +
    'var head=bad.length? bad.length+" 个溢出，例："+bad[0].textContent.trim()+" "' +
    '+bad[0].scrollWidth+">"+bad[0].clientWidth : (s===".slot-name"?"全部完整显示":"全部容纳");' +
    'add("溢出 "+s+"("+els.length+" 个)",bad.length===0,' +
    'head+"；最大溢出 "+worst+"px（容忍 "+tol+"px）");});' +
    '/* 3. 热区：先给出热区矩形四角坐标与是否在舞台内，再验命中。' +
    ' *    热区 = 元素盒 ∪ ::after（伪元素锚定在元素左上角）。' +
    ' *    圆角控件（btn-back-game r=12、btn-tool r=2.8cqw）真角点在圆角外，属设计而非裁剪，' +
    ' *    因此「四角命中」只做记录，「命中」按圆角内缩后的 4 角 + 中心判定。 */' +
    'var stageBox=document.querySelector(".stage").getBoundingClientRect();' +
    'function inner(sel){var el=document.querySelector(sel);if(!el)return null;' +
    'var r=el.getBoundingClientRect(),af=getComputedStyle(el,"::after");' +
    'var aw=parseFloat(af.width)||0,ah=parseFloat(af.height)||0;' +
    'var rad=Math.max(parseFloat(getComputedStyle(el).borderTopLeftRadius)||0,' +
    'parseFloat(af.borderTopLeftRadius)||0);' +
    'return {el:el,r:r,hw:Math.max(r.width,aw),hh:Math.max(r.height,ah),rad:rad,aw:aw,ah:ah};}' +
    'function hit(sel,min){var o=inner(sel);' +
    'if(!o){add("热区 "+sel,true,"元素不存在，跳过");return;}' +
    'var x0=o.r.left,y0=o.r.top,x1=x0+o.hw,y1=y0+o.hh;' +
    'var fmt=function(p){return "("+Math.round(p[0])+","+Math.round(p[1])+")";};' +
    'var cs=[[x0,y0],[x1,y0],[x0,y1],[x1,y1]];' +
    'add("热区尺寸 "+sel,Math.min(o.hw,o.hh)>=min,' +
    '"热区 "+Math.round(o.hw)+"×"+Math.round(o.hh)+"，四角 "+cs.map(fmt).join(" ")+' +
    '"（元素 "+Math.round(o.r.width)+"×"+Math.round(o.r.height)+"，伪元素 "+Math.round(o.aw)+"×"+Math.round(o.ah)+"）");' +
    'var inside=cs.every(function(p){return p[0]>=stageBox.left-0.5&&p[0]<=stageBox.right+0.5&&' +
    'p[1]>=stageBox.top-0.5&&p[1]<=stageBox.bottom+0.5;});' +
    'add("热区四角在舞台内 "+sel,inside,inside?"四角均在 ("+Math.round(stageBox.left)+","+Math.round(stageBox.top)+"–"' +
    '+Math.round(stageBox.right)+","+Math.round(stageBox.bottom)+") 内":' +
    '"有角超出舞台，请按裁剪后尺寸计："+Math.round(Math.min(x1,stageBox.right)-Math.max(x0,stageBox.left))+"×"' +
    '+Math.round(Math.min(y1,stageBox.bottom)-Math.max(y0,stageBox.top)));' +
    '/* 圆角内缩：点 (d,d) 落在圆角内需 d ≥ rad·(1-1/√2) */' +
    'var d=o.rad*(1-Math.SQRT1_2)+1;' +
    'var pts0=cs.map(fmt);' +
    'var pts=[[x0+d,y0+d],[x1-d,y0+d],[x0+d,y1-d],[x1-d,y1-d],[(x0+x1)/2,(y0+y1)/2]];' +
    'var miss=pts.filter(function(p){var t=document.elementFromPoint(p[0],p[1]);' +
    'return !t||!(t===o.el||o.el.contains(t)||t.parentNode===o.el);}).length;' +
    'add("热区命中 "+sel,miss===0,miss+" 个采样点未命中（共 5 点，圆角 "+Math.round(o.rad)+' +
    '"px 内缩 "+Math.round(d)+"px，可点区域为圆角矩形）；真角点 "+pts0.join(" ")+' +
    '" 为圆角透明区，不计入");' +
    'return o;}' +
    'var arrowVisNow=[].slice.call(document.querySelectorAll(".pager-arrow")).filter(function(a){' +
    'var r=a.getBoundingClientRect();return r.width>0&&r.height>0;});' +
    'add("触摸端隐藏翻页箭头",arrowVisNow.length===0,"可见箭头 "+arrowVisNow.length+" 个（触摸端只保留横滑，PC 不受影响）");' +
    'hit(".btn-tool",44);var bk=hit(".btn-back-game",44);' +
    /* 3.2 44px 是否挤压排版：与相邻元素不相交、货架可视宽度不减少 */
    'var inter=function(a,b){return a.left<b.right-0.5&&b.left<a.right-0.5&&a.top<b.bottom-0.5&&b.top<a.bottom-0.5;};' +
    'var tools=[].slice.call(document.querySelectorAll(".btn-tool"));' +
    'var clash=0;' +
    'for(var ti=0;ti<tools.length;ti++){for(var tj=ti+1;tj<tools.length;tj++){' +
    'if(inter(tools[ti].getBoundingClientRect(),tools[tj].getBoundingClientRect()))clash++;}}' +
    'add("道具方块 44px 互不相交",clash===0,clash+" 对相交（共 "+tools.length+" 块）");' +
    'var dots=[].slice.call(document.querySelectorAll(".pager-dot"));' +
    '/* 页点在触摸端只作「第几页」的指示，不可点击：不得压商品卡，且与最下行卡底留净空 */' +
    'var dotClash=0,dotGap=1e9,slotMaxB=0;' +
    '[].slice.call(document.querySelectorAll(".slot")).forEach(function(s){' +
    'var b=s.getBoundingClientRect().bottom;if(b>slotMaxB)slotMaxB=b;});' +
    'dots.forEach(function(dt){var dr=dt.getBoundingClientRect();' +
    'if(dr.top<dotGap)dotGap=dr.top-slotMaxB;' +
    '[].slice.call(document.querySelectorAll(".slot")).forEach(function(s){' +
    'if(inter(dr,s.getBoundingClientRect()))dotClash++;});});' +
    'add("页点不压商品卡",dots.length>0&&dotClash===0,dotClash+" 处相交（页点 "+dots.length+" 个）");' +
    'add("页点与末行卡底留净空 ≥2px",dots.length>0&&dotGap>=2,' +
    '"最小净空 "+(dots.length?dotGap.toFixed(1):"-")+"px（原「箭头↔价格行 ≥8px」在触摸端由本条替代）");' +
    '/* A/B：临时去掉 min-width/min-height，货架宽度若变化说明热区挤压了排版 */' +
    'var shelf=document.querySelector(".shelf-viewport")||document.querySelector(".shelf");' +
    'var grid=document.querySelector(".layer-grid");' +
    'var w1=shelf.clientWidth,g1=grid?grid.clientWidth:0;' +
    'tools.forEach(function(t){t.style.minWidth="0px";t.style.minHeight="0px";});' +
    'void shelf.offsetWidth;' +
    'var w2=shelf.clientWidth,g2=grid?grid.clientWidth:0;' +
    'tools.forEach(function(t){t.style.minWidth="";t.style.minHeight="";});' +
    'add("44px 热区不压缩货架",w1===w2&&g1===g2,' +
    '"有 44px 时货架 "+w1+"px / 网格 "+g1+"px，去掉后 "+w2+"px / "+g2+"px");' +
    /* 计时器不得压住雨棚：与「改造前几何」对比（货架顶 18.8%/79.2% + 桌面级计时器内边距），
     * 要求重叠不增加（允许 0.5px 测量误差）。相对比较而非绝对阈值，四档自动适配。 */
    'var awEl=document.querySelector(".shelf-awning"),tmEl=document.querySelector(".hud-timer");' +
    'var psEl=document.querySelector(".panel-shelf"),trEl=document.querySelector(".hud-timer .timer-track");' +
    'function awOverlap(){if(!awEl||!tmEl)return 0;var a=awEl.getBoundingClientRect(),b=tmEl.getBoundingClientRect();' +
    'return Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top));}' +
    'var ovNew=awOverlap();' +
    'var psTop=psEl.style.top,psH=psEl.style.height,tmPad=tmEl.style.padding,trH=trEl?trEl.style.height:"",trMt=trEl?trEl.style.marginTop:"";' +
    'psEl.style.top="18.8%";psEl.style.height="79.2%";' +
    /* 桌面级盒模型（= 改造前的值，触摸端原本没有覆盖）：用内联 cqw 显式还原，
     * 因为把 inline 置空只会回落到 stylesheet 里改造后的新值 */
    'tmEl.style.padding=".58cqw 1.25cqw .82cqw";' +
    'if(trEl){trEl.style.height=".8cqw";trEl.style.marginTop=".55cqw";}' +
    'void psEl.offsetHeight;' +
    'var ovOld=awOverlap();' +
    'psEl.style.top=psTop;psEl.style.height=psH;tmEl.style.padding=tmPad;' +
    'if(trEl){trEl.style.height=trH;trEl.style.marginTop=trMt;}' +
    'add("计时器不压雨棚（不劣于改造前）",awEl&&tmEl&&ovNew<=ovOld+0.5,' +
    '"重叠 "+ovNew.toFixed(1)+"px（改造前同档 "+ovOld.toFixed(1)+' +
    '"px，允许 +0.5px 测量误差；改造手法：货架顶上移 1.6%（17.2%）+ 计时器只收内边距与进度条）");' +

    /* 3.3 关键尺寸：货架总高 / 商品卡高 / 页内商品数，以及留白可下调余量（A/B 还原为 2.6cqw） */
    'var shelfRoot=document.querySelector(".shelf");' +
    'var pageEl=document.querySelector(".shelf-page");' +
    /* 断言前会点选前两件商品（is-selected 会把图框描边 2px→3px、图片区变小），
     * 红线针对常态商品卡，因此统一取「未选中」的 slot 测量。 */
    'var slotEl=document.querySelector(".slot:not(.is-selected)")||document.querySelector(".slot");' +
    'var imgEl=slotEl?slotEl.querySelector(".slot-img"):null;' +
    'var slotN=pageEl?pageEl.querySelectorAll(".slot").length:0;' +
    'var layers=pageEl?pageEl.querySelectorAll(".layer").length:0;' +
    'var visN=0;' +
    'var vp=document.querySelector(".shelf-viewport");' +
    'if(vp){var vr=vp.getBoundingClientRect();' +
    'pageEl.querySelectorAll(".slot").forEach(function(s){var sr=s.getBoundingClientRect();' +
    'if(sr.top>=vr.top-0.5&&sr.bottom<=vr.bottom+0.5&&sr.left>=vr.left-0.5&&sr.right<=vr.right+0.5)visN++;});}' +
    'var padNow=getComputedStyle(pageEl).paddingBottom;' +
    'var hNow=slotEl.getBoundingClientRect().height;' +
    'var ihNow=imgEl?imgEl.getBoundingClientRect().height:0;' +
    'pageEl.style.paddingBottom="2.6cqw";void pageEl.offsetWidth;' +
    'var hOld=slotEl.getBoundingClientRect().height;' +
    'var ihOld=imgEl?imgEl.getBoundingClientRect().height:0;' +
    'var visOld=0;' +
    'if(vr)pageEl.querySelectorAll(".slot").forEach(function(s){var sr=s.getBoundingClientRect();' +
    'if(sr.top>=vr.top-0.5&&sr.bottom<=vr.bottom+0.5&&sr.left>=vr.left-0.5&&sr.right<=vr.right+0.5)visOld++;});' +
    'pageEl.style.paddingBottom="";' +
    'var gapMin=1e9;' +
    '/* 触摸端不看箭头，改看页点与末行卡底的最小净空（与上文同口径，这里留存量诊断） */' +
    'dots.forEach(function(dt){var dr=dt.getBoundingClientRect();' +
    'var dy=dr.top-slotMaxB;if(dy<gapMin)gapMin=dy;});' +
    'var shH=shelfRoot?Math.round(shelfRoot.getBoundingClientRect().height):0;' +
    'var vpH=vr?Math.round(vr.height):0;' +
    'var per=Math.round(slotN/Math.max(layers,1));' +
    'var msg="货架 "+shH+"px / 视口 "+vpH+"px；"+layers+" 层 × "+per+" 件 = "+slotN+' +
    '" 件/页（完整可见 "+visN+" 件，原 "+visOld+" 件）；商品卡 "+hNow.toFixed(1)+"px（原 "+hOld.toFixed(1)+' +
    '"px，缩 "+(hOld-hNow).toFixed(1)+"px）；商品图 "+ihNow.toFixed(1)+"px（原 "+ihOld.toFixed(1)+' +
    '"px）；底部留白 "+padNow;' +
    'add("关键尺寸",true,msg);' +
    'add("留白可下调余量",gapMin>=2,"页点与末行卡底最小净空 "+gapMin.toFixed(1)+' +
    '"px（≥2 底线；可下调约 "+Math.max(0,Math.round(gapMin-2))+"px）");' +
    '/* 卡底与层板顶的间隙：必须为正且落在 3~4.5px（安全区会把它抬高），否则卡片看起来压在层板上 */' +
    'var bEl=pageEl?pageEl.querySelector(".layer-board"):null;' +
    'var gapBoard=bEl?bEl.getBoundingClientRect().top-slotEl.getBoundingClientRect().bottom:0;' +
    'add("卡片不压层板",gapBoard>=3&&gapBoard<=4.5,"卡底与层板顶间隙 "+gapBoard.toFixed(2)+' +
    '"px（要求 3~4.5px；留白 48px 那版为负值）");' +
    '/* 商品图片可绘制区（去掉 .slot-img 的 scale(1.06)）：红线 20px，断言留 0.5px 测量余量 */' +
    'var imgScale=1;var mt=(imgEl?getComputedStyle(imgEl).transform:"").match(/matrix\\(([^,]+)/);' +
    'if(mt)imgScale=parseFloat(mt[1]);' +
    'var drawH=imgEl?imgEl.getBoundingClientRect().height/imgScale:0;' +
    'var frameEl=slotEl?slotEl.querySelector(".slot-frame"):null;' +
    'var frameH=frameEl?frameEl.getBoundingClientRect().height:0;' +
    'add("图片区 ≥'+IMG_FLOOR+'",frameH>='+IMG_FLOOR+',"图框 "+frameH.toFixed(2)+' +
    '"px（可绘制区 "+drawH.toFixed(2)+"px = 图框 − 2×2px 虚线边框；本档防回退线 '+IMG_FLOOR+
    '，scale="+imgScale.toFixed(2)+"）");' +
    '/* 3.4 圆角控件：四角需向内多少才能命中（判断是自身圆角还是被裁剪） */' +
    'function corner(sel){var el=document.querySelector(sel);if(!el)return;' +
    'var r=el.getBoundingClientRect();' +
    'var rad=parseFloat(getComputedStyle(el).borderTopLeftRadius)||0;' +
    'var cs=[[r.left,r.top,1,1],[r.right-1,r.top,-1,1],[r.left,r.bottom-1,1,-1],[r.right-1,r.bottom-1,-1,-1]];' +
    'var need=cs.map(function(c){' +
    'for(var d=0;d<=24;d++){var t=document.elementFromPoint(c[0]+c[2]*d,c[1]+c[3]*d);' +
    'if(t&&(t===el||el.contains(t)))return d;}return -1;});' +
    'add("四角命中内缩 "+sel,true,"圆角 "+Math.round(rad)+"px；自角点向内需 " +' +
    'need.join("/")+"px（-1=24px 内仍点不到）；理论值 "+Math.round(rad*(1-Math.SQRT1_2))+"px");}' +
    'corner(".btn-tool");corner(".btn-back-game");corner(".btn-checkout");' +
    /* 3.5 hover / focus 隔离（C）：触控端不命中 hover 态、点按不留键盘焦点环，
     *     但键盘路径（body.is-keyboard）必须仍能看到焦点环（外接键盘可达性） */
    'var hFine=window.matchMedia("(hover: hover) and (pointer: fine)").matches;' +
    'add("hover 媒体不命中",!hFine,"(hover:hover) and (pointer:fine)="+hFine);' +
    /* 用静态按钮（返回键）做探针：关卡页每秒会重刷道具角标，节点可能被换掉 */
    'function probeBtn(){return document.querySelector(".btn-back-game")||' +
    'document.querySelector(".btn-tool")||document.querySelector("button");}' +
    'var b1=probeBtn();' +
    'if(!b1){add("触控端焦点环隔离",false,"无可测按钮");}' +
    'else{' +
    'b1.focus();var st1=getComputedStyle(b1);var ow1=parseFloat(st1.outlineWidth)||0;' +
    'add("触控端点按不留焦点环",st1.outlineStyle==="none"||ow1===0,' +
    '"activeElement="+(document.activeElement===b1)+"，outline="+st1.outlineStyle+" "+st1.outlineWidth);' +
    'document.body.classList.add("is-keyboard");' +
    'var b2=probeBtn();b2.focus();var st2=getComputedStyle(b2);var ow2=parseFloat(st2.outlineWidth)||0;' +
    'add("键盘路径仍有焦点环",st2.outlineStyle==="solid"&&ow2>=1&&b2.matches(":focus"),' +
    '"body.is-keyboard 下 outline="+st2.outlineStyle+" "+st2.outlineWidth+"（已聚焦="+b2.matches(":focus")+"）");' +
    'document.body.classList.remove("is-keyboard");b2.blur();}' +
    /* 3.6 进关图片总字节：本关全部商品图（含还没上屏、只挂 data-src 的第二页）+ 购物篮皮肤，
     *     按 ZQ.IMAGE_BYTES 体积清单求和 —— 确定性口径，不受浏览器缓存影响 */
    'var seenU={},nimg=0,miss=[],bytes=0;' +
    'var loadImgs=[].slice.call(document.querySelectorAll(".slot-img,.cart-svg"));' +
    'loadImgs.forEach(function(el){' +
    'var u=el.getAttribute("data-src")||el.getAttribute("src")||"";' +
    'if(!u||seenU[u])return;seenU[u]=1;' +
    'var key;try{key=decodeURI(u).replace(/^https?:\\/\\/[^\\/]+\\//,"").split("?")[0];}catch(err){key=u;}' +
    'nimg++;' +
    'if(window.ZQ&&ZQ.IMAGE_BYTES&&ZQ.IMAGE_BYTES[key])bytes+=ZQ.IMAGE_BYTES[key];else miss.push(key);});' +
    'var BUDGET=350*1024;' +
    'add("进关图片总字节 ≤350KB",nimg>0&&miss.length===0&&bytes<=BUDGET,' +
    '"本关 "+nimg+" 张（商品图 + 购物篮皮肤）共 "+(bytes/1024).toFixed(1)+" KB / 上限 350 KB"' +
    '+(miss.length?"；清单缺 "+miss.length+" 条，例："+miss.slice(0,2).join(" "):"")' +
    '+(window.ZQ&&ZQ.IMAGE_BYTES?"":"；未找到 ZQ.IMAGE_BYTES，请先跑 node tools/build-images.js"));' +
    'return JSON.stringify(out);})()';
}

/* ---------- 名称全覆盖审计 ----------
 * 只测第 25 关不足以覆盖全部商品：不同关卡的 pool 由品类池随机抽样，长名可能出现在任意关卡。
 * 因此把 1~42 关的关卡实例逐一交给真实渲染器 ZQ.ui.shelf.render() 生成货架，
 * 换进当前真实 .shelf-track 后逐个测量 .slot-name 的 scrollWidth / clientWidth。
 * 容器宽度只由舞台宽度决定、与关卡无关，故一次渲染即可得到该档位下每个名称的真实排版结果。 */
function nameAuditScript() {
  return '(function(){' +
    'var TARGET=' + JSON.stringify(AUDIT_IDS) + ';' +
    'var track=document.querySelector(".shelf-track");' +
    'if(!track)return JSON.stringify({error:"找不到 .shelf-track（需先进入关卡）"});' +
    'var original=track.innerHTML;' +
    'var best={};var recs=[];var levels=0;' +
    'for(var lvId=1;lvId<=ZQ.totalLevels;lvId++){' +
    'var lv=ZQ.generator.generate(lvId,12345);if(!lv)continue;' +
    'var shelf=ZQ.ui.shelf.render(lv);var nt=shelf.querySelector(".shelf-track");' +
    'if(!nt)continue;levels++;' +
    'track.innerHTML=nt.innerHTML;void track.offsetWidth;' +
    'var slots=track.querySelectorAll(".slot[data-item]");' +
    'for(var i=0;i<slots.length;i++){var sl=slots[i];var nm=sl.querySelector(".slot-name");' +
    'if(!nm)continue;var id=sl.getAttribute("data-item");var it=ZQ.ui.itemById(id);' +
    'var r={id:id,name:it?ZQ.itemName(it):nm.textContent.trim(),' +
    'w:Math.round(nm.scrollWidth*100)/100,cw:Math.round(nm.clientWidth*100)/100,' +
    'ov:Math.round((nm.scrollWidth-nm.clientWidth)*100)/100,lv:lvId};' +
    'recs.push(r);' +
    'if(!best[id]||r.ov>best[id].ov){best[id]={id:id,name:r.name,w:r.w,cw:r.cw,ov:r.ov,lv:r.lv};}}' +
    '}' +
    'track.innerHTML=original;' +
    'var targets=TARGET.map(function(id){return best[id]||{id:id,missing:true};});' +
    'var worst=null;recs.forEach(function(r){if(!worst||r.ov>worst.ov)worst=r;});' +
    'var bad=recs.filter(function(r){return r.ov>0;});' +
    'return JSON.stringify({levels:levels,measurements:recs.length,bad:bad.length,' +
    'targets:targets,worst:worst});' +
    '})()';
}

function printNameAudit(data) {
  console.log('\n名称全覆盖审计：' + data.levels + ' 关 / ' + data.measurements + ' 次测量，' +
    '溢出项 ' + data.bad + ' 个');
  console.log('  名称            文字宽  可用宽  溢出');
  var failed = 0;
  data.targets.forEach(function (t) {
    if (t.missing) { failed++; console.log('  MISS ' + t.id + ' — 未在任何关卡商品池中出现'); return; }
    var ok = t.ov <= 0;
    if (!ok) failed++;
    console.log('  ' + (ok ? 'PASS ' : 'FAIL ') + pad(t.id, 4) + ' ' + pad(t.name, 8) +
      pad(t.w.toFixed(2), 8) + pad(t.cw.toFixed(2), 8) + (t.ov > 0 ? '+' + t.ov.toFixed(2) : '0.00') +
      '  （最差出现在第 ' + t.lv + ' 关）');
  });
  if (data.worst) {
    console.log('  全部商品最差：' + data.worst.id + ' ' + data.worst.name +
      ' 溢出 ' + data.worst.ov.toFixed(2) + 'px（文字 ' + data.worst.w.toFixed(2) +
      ' / 可用 ' + data.worst.cw.toFixed(2) + '，第 ' + data.worst.lv + ' 关）');
  }
  console.log(failed ? '\n名称审计 FAIL：' + failed + '/' + data.targets.length
    : '\n名称审计 PASS：' + data.targets.length + ' 个名称全部完整显示');
  return failed;
}

function pad(s, n) {
  s = String(s);
  while (s.length < n) s += ' ';
  return s;
}

/* ---------- 手势验证（--verify-gesture 1） ----------
 * 皮肤页拖拽已迁到 ZQ.ui.gesture，本脚本证明迁移后行为 1:1：
 *   A1 位移 ≤6px 不拖动轨道、不加 is-drag（阈值严格 >6）
 *   A2 拖拽过程中跟手位移正确（未松手）
 *   A3 松手吸附到相邻卡位、is-drag 清除
 *   A4 拖拽结束那一次 click 被吞（suppressClick + setTimeout 0 时序）
 *   A5 纯点击「装备」按钮生效（P0 死按钮回归点：不能在 pointerdown 就捕获）
 *   A6 两指先后按下仍按「后按下的指针重置基准」处理，无重复位移/跳变
 *   A7 destroy() 后不再响应
 *   A8 touch-action 仍为 pan-y（P0 兼容）
 * 建议配 --width 844 --height 390 --mobile 1 运行，保证卡片步长足够容纳断言位移。 */
function gestureScript() {
  return '(async function(){' +
    'var out=[];function add(n,p,d){out.push({name:n,pass:!!p,detail:d});}' +
    'function wait(ms){return new Promise(function(r){setTimeout(r,ms);});}' +
    'function tx(){var tr=document.querySelector(".skin-track");if(!tr)return NaN;' +
      'var m=/translateX\\((-?[\\d.]+)px\\)/.exec(tr.style.transform||"");return m?parseFloat(m[1]):0;}' +
    'function fire(el,type,x,y,id){var ev=new PointerEvent(type,{bubbles:true,cancelable:true,' +
      'clientX:x,clientY:y,button:0,buttons:type==="pointerup"?0:1,pointerId:id||1,' +
      'pointerType:"touch",isPrimary:(id||1)===1});el.dispatchEvent(ev);return ev;}' +

    'add("gesture 模块已加载",!!(ZQ.ui&&ZQ.ui.gesture&&ZQ.ui.gesture.drag),' +
      '"ZQ.ui.gesture.drag="+typeof(ZQ.ui&&ZQ.ui.gesture&&ZQ.ui.gesture.drag));' +
    'ZQ.app.go("skins");await wait(120);' +
    'var body=document.querySelector(".skins-body"),track=document.querySelector(".skin-track");' +
    'add("skins 页存在拖拽容器",!!body&&!!track,"body="+!!body+" track="+!!track);' +
    'var card=track.querySelector(".skin-card");' +
    'var step=card.getBoundingClientRect().width+(parseFloat(getComputedStyle(track).columnGap)||0);' +
    'add("A8 touch-action 仍为 pan-y",getComputedStyle(body).touchAction==="pan-y",' +
      '"touch-action="+getComputedStyle(body).touchAction);' +

    'var x0=200,y0=200;var before=tx();' +
    'fire(body,"pointerdown",x0,y0,1);fire(body,"pointermove",x0+3,y0,1);fire(body,"pointerup",x0+3,y0,1);' +
    'add("A1 位移 3px 不拖动轨道",tx()===before,"起点 "+before+"px，3px 位移后 "+tx()+"px");' +
    'add("A1 位移 3px 不加 is-drag",!body.classList.contains("is-drag"),"class="+body.className);' +

    'await wait(60);var base=tx();var d=Math.round(step*0.8);' +
    'fire(body,"pointerdown",x0,y0,1);fire(body,"pointermove",x0-d,y0,1);' +
    'add("A2 拖拽过程中跟手位移",Math.abs((base-d)-tx())<0.6,' +
      '"期望 "+(base-d)+"px，实际 "+tx()+"px（向左位移 "+d+"px）");' +
    'add("A2 拖拽中加 is-drag",body.classList.contains("is-drag"),"class="+body.className);' +

    'fire(body,"pointerup",x0-d,y0,1);' +
    'add("A3 松手吸附到相邻卡位",Math.abs((base-step)-tx())<0.6,' +
      '"期望 "+(base-step)+"px，实际 "+tx()+"px（步长 "+step.toFixed(2)+"px）");' +
    'add("A3 松手移除 is-drag",!body.classList.contains("is-drag"),"class="+body.className);' +

    'var eq0=JSON.stringify(ZQ.store.data.equipped);var btn4=document.querySelector(".btn-skin[data-state=\\"equip\\"]");' +
    'if(btn4)btn4.click();' +
    'add("A4 拖拽后那次 click 被吞",JSON.stringify(ZQ.store.data.equipped)===eq0,' +
      '"装备 "+eq0+" → "+JSON.stringify(ZQ.store.data.equipped));' +
    'await wait(80);' +

    'var eq1=JSON.stringify(ZQ.store.data.equipped);var btns=document.querySelectorAll(".btn-skin");var btn5=null;' +
    'for(var i=0;i<btns.length;i++){if(btns[i].getAttribute("data-state")==="equip"){btn5=btns[i];break;}}' +
    'if(btn5){fire(btn5,"pointerdown",300,300,1);fire(btn5,"pointerup",300,300,1);btn5.click();}' +
    'add("A5 纯点击装备按钮生效",!!btn5&&JSON.stringify(ZQ.store.data.equipped)!==eq1,' +
      '"装备 "+eq1+" → "+JSON.stringify(ZQ.store.data.equipped));' +
    'await wait(80);' +

    'var tab=document.querySelector(".skin-tab[data-type=\\"cart\\"]");if(tab)tab.click();await wait(80);' +
    'var t0=tx();fire(body,"pointerdown",x0,y0,1);fire(body,"pointerdown",x0+100,y0,2);' +
    'fire(body,"pointermove",x0+60,y0,2);' +
    'add("A6 两指按下按后按指针重置基准",Math.abs((t0-40)-tx())<0.6,' +
      '"期望 "+(t0-40)+"px，实际 "+tx()+"px（起点 "+t0+"px）");' +
    'fire(body,"pointerup",x0+60,y0,2);' +

    'var probe=document.createElement("div");' +
    'probe.style.cssText="position:fixed;left:0;top:0;width:10px;height:10px";document.body.appendChild(probe);' +
    'var hits=0;var g=ZQ.ui.gesture.drag(probe,{axis:"x",threshold:6,' +
      'onStart:function(){hits++;},onMove:function(){hits++;}});' +
    'g.destroy();fire(probe,"pointerdown",10,10,3);fire(probe,"pointermove",60,10,3);fire(probe,"pointerup",60,10,3);' +
    'add("A7 destroy 后不再响应",hits===0,"回调命中 "+hits+" 次（应 0）");' +
    'if(probe.parentNode)probe.parentNode.removeChild(probe);' +

    /* A9：pointercancel 与 pointerup 共用同一收尾（旧实现 endDrag 同时挂在两者上） */
    'await wait(80);var tab2=document.querySelector(".skin-tab[data-type=\\"cart\\"]");if(tab2)tab2.click();await wait(80);' +
    'var c0=tx();var dc=Math.round(step*0.8);' +
    'fire(body,"pointerdown",x0,y0,1);fire(body,"pointermove",x0-dc,y0,1);fire(body,"pointercancel",x0-dc,y0,1);' +
    'add("A9 pointercancel 走同一收尾",Math.abs((c0-step)-tx())<0.6&&!body.classList.contains("is-drag"),' +
      '"期望 "+(c0-step)+"px，实际 "+tx()+"px，class="+body.className);' +

    /* A10：lostpointercapture 两侧都没有监听，不应终止拖拽 */
    'await wait(80);var tab3=document.querySelector(".skin-tab[data-type=\\"cart\\"]");if(tab3)tab3.click();await wait(80);' +
    'var l0=tx();var dl=Math.round(step*0.5);' +
    'fire(body,"pointerdown",x0,y0,1);fire(body,"pointermove",x0-dl,y0,1);' +
    'var midOk=Math.abs((l0-dl)-tx())<0.6;' +
    'fire(body,"lostpointercapture",x0-dl,y0,1);' +
    'fire(body,"pointermove",x0-dl-20,y0,1);' +
    'add("A10 lostpointercapture 不终止拖拽",midOk&&Math.abs((l0-dl-20)-tx())<0.6,' +
      '"中止前 "+(l0-dl)+"px，继续拖 20px 后 "+(l0-dl-20)+"px，实际 "+tx()+"px");' +
    'fire(body,"pointerup",x0-dl-20,y0,1);' +

    /* A11：拖拽途中元素被移出文档，监听仍在但不得抛错 */
    'await wait(80);' +
    'var p11=document.createElement("div");p11.style.cssText="position:fixed;left:0;top:0;width:10px;height:10px";' +
    'document.body.appendChild(p11);var end11=0,off11=0;' +
    'ZQ.ui.gesture.drag(p11,{axis:"x",threshold:6,onMove:function(dx){off11=dx;},onEnd:function(){end11++;}});' +
    'fire(p11,"pointerdown",100,100,5);fire(p11,"pointermove",60,100,5);' +
    'p11.parentNode.removeChild(p11);' +
    'var threw11=false;try{fire(p11,"pointermove",40,100,5);fire(p11,"pointerup",40,100,5);}catch(e){threw11=true;}' +
    'add("A11 拖拽中元素被移除不抛错",!threw11&&end11===1&&off11===-60,' +
      '"抛错="+threw11+"，onEnd "+end11+" 次，末次位移 "+off11+"px");' +

    /* A12：旧实现逐行复刻对照（证明两指行为与迁移前逐点一致，含「第二指按下后第一指移动」的跳变）
     * 旧代码在 pointerdown 直接把基准重置为最新指针，任何一条 pointermove 都按该基准算 dx；
     * 因此两指场景下第一指再移动会产生跳变。B1 未改变该算法，仲裁留到 B2。 */
    'function mkProbe(){var p=document.createElement("div");' +
      'p.style.cssText="position:fixed;left:0;top:0;width:10px;height:10px";document.body.appendChild(p);return p;}' +
    'var pOld=mkProbe(),pNew=mkProbe(),oldOff=0,newOff=0,oldDrag=null;' +
    'pOld.addEventListener("pointerdown",function(e){if(e.button!==undefined&&e.button!==0)return;' +
      'oldDrag={x0:e.clientX,base:oldOff,moved:0,captured:false};});' +
    'pOld.addEventListener("pointermove",function(e){if(!oldDrag)return;var dx=e.clientX-oldDrag.x0;' +
      'oldDrag.moved=Math.max(oldDrag.moved,Math.abs(dx));' +
      'if(!oldDrag.captured){if(oldDrag.moved<=6)return;oldDrag.captured=true;}' +
      'oldOff=Math.min(0,oldDrag.base+dx);});' +
    'pOld.addEventListener("pointerup",function(){oldDrag=null;});' +
    'pOld.addEventListener("pointercancel",function(){oldDrag=null;});' +
    'ZQ.ui.gesture.drag(pNew,{axis:"x",threshold:6,onMove:function(dx){newOff=Math.min(0,dx);}});' +
    'function both(t,x,id){fire(pOld,t,x,50,id);fire(pNew,t,x,50,id);}' +
    'both("pointerdown",200,1);both("pointerdown",300,2);' +
    'both("pointermove",250,2);var s1=[oldOff,newOff];' +
    'both("pointermove",210,1);var s2=[oldOff,newOff];' +
    'both("pointerup",210,1);' +
    'add("A12 两指行为与旧实现逐点一致",s1[0]===s1[1]&&s2[0]===s2[1],' +
      '"第2指拖至250：旧 "+s1[0]+"px / 新 "+s1[1]+"px；随后第1指移到210：旧 "+s2[0]+"px / 新 "+s2[1]+"px' +
      '（该跳变两侧一致，B2 用 pointerId 仲裁解决）");' +
    'if(pOld.parentNode)pOld.parentNode.removeChild(pOld);' +
    'if(pNew.parentNode)pNew.parentNode.removeChild(pNew);' +

    'return JSON.stringify(out);})()';
}

/* ---------- 货架横滑验证（--verify-shelf 1） ----------
 * B2 功能：货架横滑翻页 + 点选互斥 + overscroll-behavior，先写断言后写实现（TDD）。
 *   S0 前置：多页关卡、轨道有 transition 载体
 *   S1 位移 5px（<8 阈值）不触发
 *   S2 横移 60px 跟手（含「拖拽中 transition 为 none」子项）
 *   S3 松手越过 30% 视口宽 → 翻页 + 页点同步 + transform 归位
 *   S4 反向拖 40px（<30%）松手 → 回原位
 *   S5 首页右拖硬钳制为 0
 *   S6 末页左拖不越界
 *   S7 纵向拖交还浏览器（不翻页、不位移）
 *   S8 pointerdown 落在 .pager-arrow 不启动手势
 *   S9 翻页后紧接的那次 click 被吞（商品未被选中）
 *   S10 普通点击商品卡正常选中
 *   S11 第二指忽略、第一指继续
 * 建议配 --width 844 --height 390 --mobile 1 --dpr 2 运行。
 * 注意：合成 PointerEvent 没有真实活动指针，setPointerCapture 会抛 NotFoundError，
 *       实现侧必须 try/catch；本工具把捕获异常计入 detail，便于定位。 */
function shelfScript() {
  return '(async function(){' +
    'var out=[];function add(n,p,d){out.push({name:n,pass:!!p,detail:d});}' +
    'function wait(ms){return new Promise(function(r){setTimeout(r,ms);});}' +
    'function fire(el,type,x,y,id){var ev=new PointerEvent(type,{bubbles:true,cancelable:true,' +
      'clientX:x,clientY:y,button:0,buttons:type==="pointerup"?0:1,pointerId:id||1,' +
      'pointerType:"touch",isPrimary:(id||1)===1});el.dispatchEvent(ev);return ev;}' +
    'function sh(){return document.querySelector(".shelf");}' +
    'function track(){return document.querySelector(".shelf-track");}' +
    'function vp(){return document.querySelector(".shelf-viewport");}' +
    'function pages(){return parseInt(sh().getAttribute("data-pages"),10)||1;}' +
    /* 当前页：优先读 data-cur（B2 新增），缺失时回退到页点，保证红测也能给出可读数值 */
    'function cur(){var v=sh().getAttribute("data-cur");if(v!=null&&v!=="")return parseInt(v,10);' +
      'var d=document.querySelector(".pager-dot.is-active");' +
      'return d?parseInt(d.getAttribute("data-page"),10)||0:0;}' +
    'function inline(){var t=track();return t?(t.style.transform||"(空)"):"(无 track)";}' +
    /* 位移解析：兼容 translateX(calc(-100% + -60px)) / translateX(calc(0% - 60px))
     *             / translateX(-100%) / translateX(-60px)
     * 不依赖 getComputedStyle，避免 calc 下读到上一帧的矩阵；
     * 注意 Chrome 会把 calc 里的 "+ -60px" 序列化成 "- 60px"，两种都要认。 */
    'function parse(s){s=s||"";' +
      'var mc=/translateX\\(calc\\((-?[\\d.]+)%\\s*([+-])\\s*(-?[\\d.]+)px\\)\\)/.exec(s);' +
      'if(mc){var n=parseFloat(mc[3]);if(mc[2]==="+")return{pct:parseFloat(mc[1]),dx:n};' +
        'return{pct:parseFloat(mc[1]),dx:-n};}' +
      'var mp=/translateX\\((-?[\\d.]+)%\\)/.exec(s);if(mp)return{pct:parseFloat(mp[1]),dx:0};' +
      'var mx=/translateX\\((-?[\\d.]+)px\\)/.exec(s);if(mx)return{pct:null,dx:parseFloat(mx[1])};' +
      'return{pct:0,dx:0};}' +
    'function dxNow(){return parse(track().style.transform).dx;}' +
    'function pctNow(){return parse(track().style.transform).pct;}' +
    'function vw(){var e=vp();return e?e.getBoundingClientRect().width:0;}' +
    'function selCount(){return document.querySelectorAll(".slot.is-selected").length;}' +
    'function dots(){return document.querySelectorAll(".pager-dot.is-active").length;}' +
    /* 冻结样式（capture 注入的 *{transition-duration:0s!important}）会掩盖轨道自身的
     * transition，S0b 需要「真实」值：临时禁用该样式表读一次再恢复，不改页面状态。 */
    'function dur(){var fs=document.getElementById("zq-freeze");var was=false;' +
      'if(fs&&fs.sheet){was=fs.sheet.disabled;fs.sheet.disabled=true;}' +
      'var v=getComputedStyle(track()).transitionDuration;' +
      'if(fs&&fs.sheet)fs.sheet.disabled=was;return v;}' +
    /* 红绿灯门禁：B2 会给 .shelf 写 data-cur。缺失时业务断言一律 FAIL，
     * 避免「没有手势代码 → 位移恒为 0 → 断言意外 PASS」的假绿。 */
    'function addF(n,cond,d){if(featOK)add(n,cond,d);else add(n,false,"横滑未接线（.shelf 缺 data-cur）｜"+d);}' +

    /* 选一个多页关卡（pool > 12），不硬编码关卡号 */
    'var lvId=0;for(var i=1;i<=42;i++){var c=ZQ.levelConfig(i);if(c&&c.pool>ZQ.SLOTS_PER_PAGE){lvId=i;break;}}' +
    'ZQ.app.go("game",{levelId:lvId,seed:12345});' +
    'if(ZQ.screens.game._stopTimer)ZQ.screens.game._stopTimer();' +
    'await wait(220);' +
    'add("S0a 多页关卡已渲染",!!sh()&&pages()>=2,"关卡 "+lvId+"，pages="+(sh()?pages():"无货架"));' +
    'var featOK=!!(sh()&&sh().hasAttribute("data-cur"));' +
    'var tr=track();var td=tr?dur():"-";' +
    'add("S0b 轨道有 transition 载体",!!tr&&td!=="0s","transition-duration="+td+"（已临时解除冻结样式测量）");' +
    'add("S0c 横滑已接线（data-cur）",featOK,"data-cur="+(featOK?sh().getAttribute("data-cur"):"(缺失)"));' +

    'var X=200,Y=200,vwPx=vw();' +
    /* S1 阈值 */
    'var before=inline();' +
    'fire(vp(),"pointerdown",X,Y,1);fire(vp(),"pointermove",X+5,Y,1);fire(vp(),"pointerup",X+5,Y,1);' +
    'addF("S1 位移 5px 不触发横滑",inline()===before,"起点 "+before+" → 5px 后 "+inline());' +
    'await wait(60);' +

    /* S2 跟手 */
    'ZQ.ui.shelf.goto(sh(),0);await wait(30);' +
    'fire(vp(),"pointerdown",X,Y,1);fire(vp(),"pointermove",X-60,Y,1);' +
    'var d2=dxNow(),t2=track().style.transition;' +
    'addF("S2a 拖拽中跟手 60px",Math.abs(d2+60)<0.6,"期望 -60px，实际 "+d2+"px（inline="+inline()+"）");' +
    'addF("S2b 拖拽中禁用 transition",t2==="none","transition="+t2);' +

    /* S3 越过 30% 松手翻页 */
    'var need=Math.round(vwPx*0.5);' +
    'await wait(40);fire(vp(),"pointermove",X-need,Y,1);await wait(40);fire(vp(),"pointerup",X-need,Y,1);' +
    'var c3=cur(),p3=pctNow(),dot3=(function(){var d=document.querySelector(".pager-dot.is-active");' +
      'return d?parseInt(d.getAttribute("data-page"),10):-1;})();' +
    'addF("S3a 松手翻页 cur+1",c3===1,"位移 "+need+"px（视口 "+vwPx.toFixed(1)+"px），cur="+c3);' +
    'addF("S3b 页点同步",dot3===c3,"active dot="+dot3+"，cur="+c3+"（is-active 共 "+dots()+" 个）");' +
    'addF("S3c transform 归位",Math.abs((p3===null?0:p3)+100*c3)<0.6,"期望 "+(-100*c3)+"%，实际 "+p3+"%");' +

    /* S4 未达阈值回原位（放慢节奏：40px / ≥400ms，速度远低于 0.35px·ms⁻¹ 的甩动阈值） */
    'await wait(180);fire(vp(),"pointerdown",X,Y,1);await wait(200);' +
    'fire(vp(),"pointermove",X+40,Y,1);await wait(200);fire(vp(),"pointerup",X+40,Y,1);' +
    'var c4=cur();addF("S4 未达 30% 回原位",c4===1,"40px / "+(vwPx*0.3).toFixed(1)+"px 阈值，cur="+c4);' +

    /* S5 首页钳制 */
    'ZQ.ui.shelf.goto(sh(),0);await wait(30);' +
    'fire(vp(),"pointerdown",X,Y,1);fire(vp(),"pointermove",X+80,Y,1);' +
    'var d5=dxNow();addF("S5 首页右拖钳制为 0",Math.abs(d5)<0.6,"实际 "+d5+"px（inline="+inline()+"）");' +
    'fire(vp(),"pointerup",X+80,Y,1);await wait(60);' +

    /* S6 末页不越界 */
    'ZQ.ui.shelf.goto(sh(),pages()-1);await wait(30);var last=pages()-1;' +
    'fire(vp(),"pointerdown",X,Y,1);fire(vp(),"pointermove",X-80,Y,1);' +
    'var d6=dxNow();addF("S6 末页左拖不越界",Math.abs(d6)<0.6&&cur()===last,' +
      '"实际 "+d6+"px，cur="+cur()+"（末页 "+last+"）");' +
    'fire(vp(),"pointerup",X-80,Y,1);await wait(60);' +

    /* S7 纵向手势 */
    'ZQ.ui.shelf.goto(sh(),0);await wait(30);' +
    'fire(vp(),"pointerdown",X,Y,1);fire(vp(),"pointermove",X,Y+60,1);' +
    'var d7=dxNow();addF("S7 纵向拖不横滑",Math.abs(d7)<0.6&&cur()===0,' +
      '"位移 "+d7+"px，cur="+cur()+"（inline="+inline()+"）");' +
    'fire(vp(),"pointerup",X,Y+60,1);await wait(60);' +

    /* S8 触摸端箭头已隐藏；若存在必须不启动手势（PC 档仍走这条） */
    'var arrow=document.querySelector(".pager-arrow");var before8=inline();' +
    'var arrowRect=arrow?arrow.getBoundingClientRect():null;' +
    'var arrowHidden=!arrowRect||(arrowRect.width===0&&arrowRect.height===0);' +
    'if(arrow&&!arrowHidden){fire(arrow,"pointerdown",X,Y,1);fire(arrow,"pointermove",X-60,Y,1);fire(arrow,"pointerup",X-60,Y,1);}' +
    'addF("S8 触摸端无可见箭头且不启动横滑",arrowHidden&&inline()===before8,' +
      '"箭头 "+(arrow?"存在":"缺失")+(arrowHidden?"（已隐藏）":"（可见）")+"，"+before8+" → "+inline());' +
    'await wait(60);' +
    '/* S8b 页点只作指示：点它不得翻页（pointer-events:none，事件落到货架但无位移不捕获） */' +
    'var dot=document.querySelector(".pager-dot");var beforeD=cur();' +
    'if(dot){var dr=dot.getBoundingClientRect();var dx0=(dr.left+dr.right)/2,dy0=(dr.top+dr.bottom)/2;' +
    'fire(dot,"pointerdown",dx0,dy0,1);fire(dot,"pointerup",dx0,dy0,1);}' +
    'addF("S8b 点页点不翻页",!!dot&&cur()===beforeD,"页点 "+(dot?"存在":"缺失")+"，cur "+beforeD+" → "+cur());' +
    'await wait(60);' +

    /* S9 翻页后 click 被吞（pointerup 与 click 同步，验证抑制窗口仍在） */
    'ZQ.ui.shelf.goto(sh(),0);await wait(40);' +
    'var sel0=selCount();' +
    'fire(vp(),"pointerdown",X,Y,1);fire(vp(),"pointermove",X-need,Y,1);fire(vp(),"pointerup",X-need,Y,1);' +
    'var slot9=document.querySelector(".slot[data-slot]");if(slot9)slot9.click();' +
    'addF("S9 翻页后那次 click 被吞",selCount()===sel0,"选中数 "+sel0+" → "+selCount());' +
    'await wait(80);' +

    /* S10 普通点击可选中 */
    'var slot10=document.querySelector(".slot[data-slot]");var selA=selCount();' +
    'if(slot10)slot10.click();' +
    'addF("S10 普通点击可选中",selCount()===selA+1,"选中数 "+selA+" → "+selCount());' +
    'await wait(60);' +

    /* S11 只认第一指 */
    'ZQ.ui.shelf.goto(sh(),0);await wait(40);' +
    'fire(vp(),"pointerdown",X,Y,1);' +
    'fire(vp(),"pointerdown",X+120,Y,2);fire(vp(),"pointermove",X+60,Y,2);' +
    'var d11a=dxNow();' +
    'fire(vp(),"pointermove",X-30,Y,1);var d11b=dxNow();' +
    'fire(vp(),"pointerup",X-30,Y,1);' +
    'addF("S11 第二指被忽略、第一指继续",Math.abs(d11a)<0.6&&Math.abs(d11b+30)<0.6,' +
      '"第二指拖 60px 后位移 "+d11a+"px；第一指再拖 30px 后 "+d11b+"px（B1 两指跳变 → B2 第一指继续）");' +
    'await wait(60);' +

    /* S12 购物篮缩略图【单击】即取消（旧实现绑在 dblclick，真机上单击无反应） */
    'ZQ.ui.shelf.goto(sh(),0);await wait(40);' +
    'var cands=[].slice.call(document.querySelectorAll(".slot[data-slot]:not(.is-selected)")).map(function(s){' +
    'var pe=s.querySelector(".slot-price");var v=pe?parseFloat(pe.textContent.replace(/[^\\d.]/g,""))||1e9:1e9;' +
    'return{el:s,v:v};}).sort(function(a,b){return a.v-b.v;});' +
    'var cheap=cands.length?cands[0]:null;' +
    'var nA=selCount();if(cheap)cheap.el.click();await wait(800);' +
    'var nB=selCount();' +
    'var cartItem=cheap?document.querySelector(".cart-item[data-slot=\\""+cheap.el.getAttribute("data-slot")+"\\"]"):null;' +
    'if(cartItem)cartItem.click();await wait(60);' +
    'add("S12 购物篮单击即取消",!!cheap&&!!cartItem&&nB===nA+1&&selCount()===nA,' +
      '"最少价卡 "+Math.round(cheap&&cheap.v||0)+"；点卡后 "+nB+" 件，点篮内缩略图后 "+' +
      'selCount()+" 件（篮内 item="+(cartItem?cartItem.getAttribute("data-slot"):"无")+"）");' +

    'return JSON.stringify(out);})()';
}

/* ---------- 首见多页提示（触摸端横滑版）：文案分流 + 卡片不出屏 + 高亮套住整块货架 ---------- */
function pagerTipScript() {
  return '(async function(){' +
    'var out=[];function add(n,p,d){out.push({name:n,pass:!!p,detail:d});}' +
    'function wait(ms){return new Promise(function(r){setTimeout(r,ms);});}' +
    /* 卡片插入是同步的，定位在 rAF 里做：必须等到 style.top/left 落定再量 bbox */
    'async function settle(){var t=Date.now();' +
      'while(Date.now()-t<2500){var c=document.querySelector(".pager-tip-card");' +
      'if(c&&c.style.top&&c.style.left)break;await wait(50);}await wait(60);}' +
    'await settle();' +
    'function R(sel){var e=document.querySelector(sel);if(!e)return null;var r=e.getBoundingClientRect();' +
    'return {l:r.left,t:r.top,r:r.right,b:r.bottom,w:r.width,h:r.height};}' +
    'var card=R(".pager-tip-card"),spot=R(".pager-tip-spot"),vp=R(".shelf-viewport");' +
    'var text=document.querySelector(".pager-tip-card .pager-tip-text");' +
    'var txt=text?text.textContent.trim():"";' +
    'var wv=window.innerWidth,hv=window.innerHeight;' +
    'add("T1 多页关卡首见弹出提示",!!card,"卡片 "+(card?"已出现":"未出现")+"（多页关卡）");' +
    'add("T2 触摸端文案走横滑版",!!text&&txt.indexOf("滑动")>-1&&txt.indexOf("箭头")<0,"文案「"+txt+"」");' +
    'add("T3 提示卡片完整在视口内",!!card&&card.l>=-0.5&&card.t>=-0.5&&card.r<=wv+0.5&&card.b<=hv+0.5,' +
    '"卡片 "+[card?Math.round(card.l):"-",card?Math.round(card.t):"-",card?Math.round(card.r):"-",' +
    'card?Math.round(card.b):"-"].join(",")+" / 视口 "+wv+"×"+hv);' +
    'add("T4 高亮套住整块货架",!!spot&&!!vp&&spot.l<=vp.l+0.5&&spot.t<=vp.t+0.5&&spot.r>=vp.r-0.5&&spot.b>=vp.b-0.5,' +
    '"高亮 "+(spot?Math.round(spot.w)+"×"+Math.round(spot.h):"-")+" / 货架 "+(vp?Math.round(vp.w)+"×"+Math.round(vp.h):"-"));' +
    'add("T5 卡片不遮挡高亮目标",!!card&&!!spot&&(card.r<=spot.l+0.5||card.l>=spot.r-0.5||card.b<=spot.t+0.5||card.t>=spot.b-0.5),' +
    '"卡片 x "+Math.round(card?card.l:0)+"–"+Math.round(card?card.r:0)+" / 高亮 x "+' +
    'Math.round(spot?spot.l:0)+"–"+Math.round(spot?spot.r:0));' +
    'add("T6 无横向溢出",document.documentElement.scrollWidth<=wv+1,' +
    '"docScrollWidth "+document.documentElement.scrollWidth+" / 视口 "+wv);' +
    'return JSON.stringify(out);})()';
}

/* ---------- 新手引导验证（--assert-mobile 附带，第一关首见 5 步） ---------- */
function guideScript() {
  return '(async function(){' +
    'var out=[];function add(n,p,d){out.push({name:n,pass:!!p,detail:d});}' +
    'function wait(ms){return new Promise(function(r){setTimeout(r,ms);});}' +
    'function card(){return document.querySelector(".pager-tip-card");}' +
    'function spot(){return document.querySelector(".pager-tip-spot");}' +
    /* 卡片是同步插入 DOM 的，但定位在 requestAnimationFrame 里做：
     * 必须等 style.top/left 落定后再量 bbox，否则读到的是未定位的 (0,0) 原点。 */
    'function ready(){var c=card();return c&&c.style.top&&c.style.left?c:null;}' +
    'async function settle(){var t=Date.now();' +
      'while(!(ready()&&spot()&&spot().style.top)&&Date.now()-t<2500){await wait(50);}' +
      'await wait(40);}' +
    /* 高亮框是否完整包住某个选择器对应的元素 */
    'function covers(sel){var s=spot(),el=document.querySelector(sel);' +
      'if(!s||!el)return{ok:false,d:"spot="+!!s+" el="+!!el};' +
      'var a=s.getBoundingClientRect(),b=el.getBoundingClientRect();' +
      'return{ok:a.left<=b.left+0.5&&a.top<=b.top+0.5&&a.right>=b.right-0.5&&a.bottom>=b.bottom-0.5,' +
      'd:"spot "+Math.round(a.width)+"×"+Math.round(a.height)+" / 目标 "+Math.round(b.width)+"×"+Math.round(b.height)};}' +
    'await settle();' +
    'var c=ready()||card();' +
    'var dbg="";' +
    'if(!c){var ml=document.getElementById("modal-layer");' +
      'dbg="3s 内未出现｜modal="+((ml&&ml.innerHTML)||"").slice(0,60)+' +
      '"｜lv="+(ZQ.screens.game.current?(ZQ.screens.game.current.levelId||ZQ.screens.game.current.id):"-")+' +
      '"｜seen="+ZQ.store.tutorialSeen("basicGuide")+' +
      '"｜goal="+!!document.querySelector(".hud-target")+' +
      '"｜slot="+!!document.querySelector(".slot[data-slot]")+' +
      '"｜basket="+!!document.querySelector(".panel-cart");}' +
    'add("G1 第 1 关首见弹出引导",!!c,c?"卡片已出现":dbg);' +
    'if(!c){return JSON.stringify(out);}' +
    'var r=c.getBoundingClientRect();' +
    'add("G2 卡片完整在视口内",r.left>=-0.5&&r.top>=-0.5&&r.right<=innerWidth+0.5&&r.bottom<=innerHeight+0.5,' +
      '"bbox "+[r.left,r.top,r.right,r.bottom].map(function(v){return Math.round(v);}).join(",")+' +
      '" / 视口 "+innerWidth+"×"+innerHeight);' +
    'var ti=c.querySelector(".pager-tip-title"),tx=c.querySelector(".pager-tip-text");' +
    'add("G3 标题/正文不溢出",ti.scrollWidth<=ti.clientWidth&&tx.scrollWidth<=tx.clientWidth,' +
      '"title "+ti.scrollWidth+"/"+ti.clientWidth+"，text "+tx.scrollWidth+"/"+tx.clientWidth);' +
    'var ok=c.querySelector(".pager-tip-ok"),sk=c.querySelector(".pager-tip-skip");' +
    'var ro=ok.getBoundingClientRect(),rs=sk?sk.getBoundingClientRect():null;' +
    'add("G4 OK 热区 ≥44",ro.width>=44&&ro.height>=44,' +
      '"OK "+Math.round(ro.width)+"×"+Math.round(ro.height));' +
    'add("G5 跳过热区 ≥44",!!rs&&rs.width>=44&&rs.height>=44,' +
      '(rs?"跳过 "+Math.round(rs.width)+"×"+Math.round(rs.height):"无跳过按钮"));' +
    /* 5 步依次点 OK，每步校验高亮框套住的目标 */
    'var steps=[{n:"G6 第 1 步高亮目标清单",s:".hud-target"},' +
      '{n:"G7 第 2 步高亮商品卡",s:".slot[data-slot]"},' +
      '{n:"G8 第 3 步高亮购物篮",s:".panel-cart"},' +
      '{n:"G9 第 4 步高亮查看明细",s:".hud-items"},' +
      '{n:"G10 第 5 步高亮结算按钮",s:".btn-checkout"}];' +
    'for(var i=0;i<steps.length;i++){' +
      'var res=covers(steps[i].s);add(steps[i].n,res.ok,res.d);' +
      'if(i<steps.length-1){var b=card()&&card().querySelector(".pager-tip-ok");' +
        'if(b){b.click();await wait(90);await settle();}}' +
    '}' +
    /* 第 5 步点「跳过」→ 整段引导立即收起，并落下 basicGuide 已读标记 */
    'var sk5=card()&&card().querySelector(".pager-tip-skip");if(sk5)sk5.click();await wait(200);' +
    'add("G11 跳过即关闭并记已读",!card()&&ZQ.store.tutorialSeen("basicGuide"),' +
      '"卡片="+(!!card())+" 标记="+ZQ.store.tutorialSeen("basicGuide"));' +
    /* 再次进入第 1 关：不应重复弹出 */
    'ZQ.app.go("map");await wait(120);' +
    'ZQ.app.go("game",{levelId:1,seed:12345});' +
    'if(ZQ.screens.game._stopTimer)ZQ.screens.game._stopTimer();' +
    'await wait(300);' +
    'add("G12 再次进入不再弹",!card(),"重新进入第 1 关后卡片="+(!!card()));' +
    'return JSON.stringify(out);})()';
}

function printAssertions(list, label) {
  var failed = 0;
  list.forEach(function (a) {
    if (!a.pass) failed++;
    console.log((a.pass ? '  PASS ' : '  FAIL ') + a.name + ' — ' + a.detail);
  });
  label = label || '移动端断言';
  console.log(failed ? '\n' + label + ' FAIL：' + failed + '/' + list.length : '\n' + label + ' PASS：' + list.length + ' 项');
  return failed;
}

function withTimeout(promise, ms, label) {
  return Promise.race([promise, new Promise(function (_, reject) {
    setTimeout(function () { reject(new Error('超时 ' + ms + 'ms：' + label)); }, ms);
  })]);
}

/* ---------- 运行时行为验证（切后台冻结 / 恢复、浏览器返回键） ---------- */
function behaviorScript() {
  return '(async function(){' +
    'var out=[];' +
    'function add(n,p,d){out.push({name:n,pass:!!p,detail:d});}' +
    'function wait(ms){return new Promise(function(r){setTimeout(r,ms);});}' +
    'function setHidden(v){try{Object.defineProperty(document,"hidden",{configurable:true,get:function(){return v;}});' +
    'Object.defineProperty(document,"visibilityState",{configurable:true,get:function(){return v?"hidden":"visible";}});}catch(e){}' +
    'document.dispatchEvent(new Event("visibilitychange"));}' +
    'function tsec(){var t=document.querySelector(".hud-timer .t-time");if(!t)return -1;' +
    'var m=/^(\\d+):(\\d+)$/.exec(t.textContent.trim());return m?(+m[1])*60+(+m[2]):-1;}' +

    /* 1. 倒计时：切后台冻结 */
    'await wait(1300);' +
    'var t0=tsec();' +
    'setHidden(true);' +
    'var t1=tsec();' +
    'await wait(1600);' +
    'var t2=tsec();' +
    'add("切后台倒计时冻结",t2===t1,"后台前 "+t0+"s，冻结时 "+t1+"s，后台 1.6s 后 "+t2+"s");' +
    'add("切后台标记 is-paused",document.body.classList.contains("is-paused"),' +
    '"body.class="+document.body.className);' +
    'var sample=document.querySelector(".timer-fill")||document.querySelector(".hud-timer");' +
    'add("切后台动画暂停",getComputedStyle(sample).animationPlayState==="paused",' +
    '"animation-play-state="+getComputedStyle(sample).animationPlayState);' +

    /* 2. 回到前台：继续走 */
    'setHidden(false);' +
    'await wait(1800);' +
    'var t3=tsec();' +
    'add("回前台倒计时继续",t3<t2&&!document.body.classList.contains("is-paused"),' +
    '"恢复时 "+t2+"s，1.8s 后 "+t3+"s");' +

    /* 2.5 结算/存钱罐动画用的 ZQ.timer 同样在后台暂停、回来继续
     *     按真实时序：先在可见时起一个 400ms 的定时器，切后台后它不应到期。 */
    'var fired=0;' +
    'ZQ.timer.after(function(){fired++;},400);' +
    'await wait(100);' +
    'setHidden(true);' +
    'await wait(800);' +
    'add("后台期间结算定时器不跑",fired===0,"fired="+fired+"（应 0）");' +
    'setHidden(false);' +
    'await wait(800);' +
    'add("回前台后结算定时器补跑",fired===1,"fired="+fired+"（应 1）");' +

    /* 3. 返回键：地图 → 开始页（同文档内 popstate） */
    'ZQ.app.go("start"); await wait(80);' +
    'ZQ.app.go("map"); await wait(80);' +
    'history.back(); await wait(300);' +
    'add("返回键 地图→开始",ZQ.state.screen==="start"&&location.hash==="#start",' +
    '"screen="+ZQ.state.screen+" hash="+location.hash);' +

    /* 4. 返回键：已在开始页时首次拦截 + 提示，2.5s 窗口过期后再次提示 */
    'ZQ.app.go("map"); await wait(80);' +
    'var hl0=history.length;' +
    'ZQ.app.go("start"); await wait(80);' +
    'history.back(); await wait(320);' +
    'add("开始页返回键不退出",ZQ.state.screen==="start"&&location.hash==="#start"&&document.body.childElementCount>0,' +
    '"screen="+ZQ.state.screen+" hash="+location.hash);' +
    'add("返回键补历史条目不增不减",history.length===hl0+1,"离开前 "+hl0+"，入栈开始页后 "+(hl0+1)+' +
    '"，按一次返回后 "+history.length);' +
    'var toastEl=document.querySelector("#toast-layer .toast");' +
    'add("返回键弹接管提示",!!toastEl&&toastEl.textContent===ZQ.I18N.backExitHint,' +
    'toastEl?"文案："+toastEl.textContent:"无 toast");' +
    '/* 窗口过期：2.6s 后再按应重新提示（本次不再补历史，交给浏览器退出，页面内无法断言退出本身） */' +
    'await wait(2600);' +
    'history.back(); await wait(320);' +
    'var toast2=[].slice.call(document.querySelectorAll("#toast-layer .toast")).pop();' +
    'add("窗口过期后再次提示",ZQ.state.screen==="start"&&!!toast2,' +
    '"screen="+ZQ.state.screen+" toast="+(toast2?toast2.textContent:"无"));' +

    'return JSON.stringify(out);})()';
}

async function main() {
  if (typeof WebSocket === 'undefined') {
    throw new Error('需要 Node 22+ 内置 WebSocket，当前 ' + process.version);
  }
  var only = arg('only', '');
  if (only) SCREENS = SCREENS.filter(function (s) { return s.name.indexOf(only) > -1; });
  fs.mkdirSync(OUT_DIR, { recursive: true });

  var launched = await launchChrome();
  var proc = launched.proc;

  try {
    var list = await fetch(launched.httpBase + '/json/list').then(function (r) { return r.json(); });
    var target = list.filter(function (t) { return t.type === 'page'; })[0];
    if (!target) throw new Error('未取到页面 target');

    var pageErrors = [];
    var cdp = new CDP(target.webSocketDebuggerUrl);
    await cdp.ready;
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Log.enable');
    cdp.listeners.set('Runtime.exceptionThrown', [function (p) {
      pageErrors.push('exception: ' + (p.exceptionDetails.exception && p.exceptionDetails.exception.description || p.exceptionDetails.text));
    }]);
    cdp.listeners.set('Log.entryAdded', [function (p) {
      if (p.entry.level === 'error') {
        pageErrors.push('console.error: ' + p.entry.text + (p.entry.url ? ' @ ' + p.entry.url : ''));
      }
    }]);
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: WIDTH, height: HEIGHT, deviceScaleFactor: DPR, mobile: MOBILE
    });
    if (MOBILE) {
      /* 只开触摸模拟：让 pointer/any-pointer 变 coarse，用来跑移动端断言 */
      await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    }
    /* headless 窗口默认没有焦点，`:focus` 不命中（activeElement 仍在），
     * focus 相关断言会假失败；只在跑断言时强制页面「被聚焦」，
     * 不影响截图基线（避免改到后台暂停等依赖可见性的逻辑）。 */
    if (ASSERT_MOBILE) {
      await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true });
    }
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: SEED_SOURCE });
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
      source: 'document.addEventListener("DOMContentLoaded",function(){' +
        'var s=document.createElement("style");s.id="zq-freeze";s.textContent=' + JSON.stringify(FREEZE_CSS) + ';' +
        'document.head.appendChild(s);});'
    });

    var loaded = cdp.once('Page.loadEventFired', 30000);
    await cdp.send('Page.navigate', { url: URL_BASE + (URL_BASE.indexOf('?') > -1 ? '&' : '?') + 't=' + Date.now() });
    await loaded;
    await withTimeout(cdp.evaluate(settleScript(), true), 20000, '首屏 settle');
    if (SAFE_B > 0) {
      /* 注入安全区：与 base.css 的 --safe-b 同优先级，后写入生效 */
      await withTimeout(cdp.evaluate(
        'var s=document.getElementById("zq-safe-b");' +
        'if(!s){s=document.createElement("style");s.id="zq-safe-b";document.head.appendChild(s);}' +
        's.textContent=":root{--safe-b:' + SAFE_B + 'px}";'
      ), 10000, '注入安全区');
      await sleep(120);
      console.log('  注入底部安全区 ' + SAFE_B + 'px');
    }
    console.log('  页面就绪');

    for (var i = 0; i < SCREENS.length; i++) {
      var s = SCREENS[i];
      console.log('  · ' + s.name + ' 渲染');
      if (s.js) {
        await withTimeout(cdp.evaluate(s.js), 15000, s.name + ' 路由');
        await sleep(80);
        await withTimeout(cdp.evaluate(settleScript(), true), 25000, s.name + ' settle');
      }
      var shot = await withTimeout(cdp.send('Page.captureScreenshot', {
        format: 'png', captureBeyondViewport: false
      }), 25000, s.name + ' 截图');
      fs.writeFileSync(path.join(OUT_DIR, s.name + '.png'), Buffer.from(shot.data, 'base64'));
      var styles = await withTimeout(cdp.evaluate(snapshotScript()), 15000, s.name + ' 样式快照');
      fs.writeFileSync(path.join(OUT_DIR, s.name + '.styles.json'), JSON.stringify(styles, null, 1));
      process.stdout.write('  ✓ ' + s.name + '.png\n');
    }

    fs.writeFileSync(path.join(OUT_DIR, 'meta.json'), JSON.stringify({
      url: URL_BASE, width: WIDTH, height: HEIGHT, dpr: DPR, mobile: MOBILE,
      frozen: true, seed: 'fixed-30x3', createdAt: new Date().toISOString()
    }, null, 1));
    console.log('基线已写入 ' + OUT_DIR);

    if (ASSERT_MOBILE) {
      /* 断言需要真实游戏界面：回到第 25 关再跑 */
      await withTimeout(cdp.evaluate(
        'ZQ.app.go("game",{levelId:25,seed:12345});' +
        'if(ZQ.screens.game._stopTimer)ZQ.screens.game._stopTimer();'
      ), 15000, '断言前进入关卡');
      await sleep(150);
      /* 明细清单的 .items-row 只有选了商品并展开后才存在：
       * 先点两件商品、再展开清单，否则行内字号与溢出会被「元素不存在」跳过。 */
      await withTimeout(cdp.evaluate(
        'var slots=document.querySelectorAll(".slot");' +
        'if(slots[0])slots[0].click();' +
        'if(slots[1])slots[1].click();'
      ), 15000, '断言前选品');
      await sleep(900);
      await withTimeout(cdp.evaluate(
        'var head=document.querySelector(".hud-items .note-head");' +
        'if(head&&!document.querySelector(".items-row"))head.click();'
      ), 15000, '断言前展开明细');
      await sleep(260);
      await withTimeout(cdp.evaluate(settleScript(), true), 25000, '断言前 settle');
      var raw = await withTimeout(cdp.evaluate(mobileAssertScript()), 15000, '移动端断言');
      var code = printAssertions(JSON.parse(raw));
      if (code) process.exitCode = 1;

      /* 新手引导（第一关首见）：几何 / 热区 / 分步 / 跳过语义 / 不重复弹 */
      await withTimeout(cdp.evaluate(
        'ZQ.app.go("game",{levelId:1,seed:12345});' +
        'if(ZQ.screens.game._stopTimer)ZQ.screens.game._stopTimer();'
      ), 15000, '引导前进入第 1 关');
      var rawQ = await withTimeout(cdp.evaluate(guideScript(), true), 20000, '新手引导验证');
      var codeQ = printAssertions(JSON.parse(rawQ), '新手引导验证');
      if (codeQ) process.exitCode = 1;

      /* 首见多页提示（触摸端横滑版）：把 shelfPager 改回未读 → 进多页关卡。
       * 不能走「改 localStorage + Page.reload」：固定存档是用
       * addScriptToEvaluateOnNewDocument 注入的，每个新文档都会把存档重写一遍，
       * 重载后标记又变回已读，提示永远不弹。直接改内存里的 store.data 才可靠
       * （tutorialSeen() 与 markTutorial() 读写的都是这份 data）。 */
      await withTimeout(cdp.evaluate(
        '(function(){ZQ.store.data.tutorialSeen.shelfPager=false;return 1;})()'
      ), 15000, '清 shelfPager 标记');
      var tipLv = await withTimeout(cdp.evaluate(
        '(function(){var ids=[25,24,30,20,15,42,10,35];' +
        'for(var i=0;i<ids.length;i++){ZQ.app.go("game",{levelId:ids[i],seed:12345});' +
        'var n=parseInt(document.querySelector(".shelf").getAttribute("data-pages"),10)||0;' +
        'if(n>1)return ids[i];}return 0;})()'
      ), 20000, '找多页关卡');
      await sleep(1200);
      await withTimeout(cdp.evaluate(settleScript(), true), 25000, '提示前 settle');
      var rawT = await withTimeout(cdp.evaluate(pagerTipScript(), true), 15000, '首见多页提示验证');
      var codeT = printAssertions(JSON.parse(rawT), '首见多页提示（第 ' + tipLv + ' 关）');
      if (codeT) process.exitCode = 1;
    }

    if (NAME_AUDIT) {
      await withTimeout(cdp.evaluate(
        'ZQ.app.go("game",{levelId:25,seed:12345});' +
        'if(ZQ.screens.game._stopTimer)ZQ.screens.game._stopTimer();'
      ), 15000, '名称审计前进入关卡');
      await sleep(150);
      await withTimeout(cdp.evaluate(settleScript(), true), 25000, '名称审计前 settle');
      var rawN = await withTimeout(cdp.evaluate(nameAuditScript()), 60000, '名称审计');
      var dataN = JSON.parse(rawN);
      if (dataN.error) {
        console.log('  名称审计失败：' + dataN.error);
        process.exitCode = 1;
      } else if (printNameAudit(dataN)) {
        process.exitCode = 1;
      }
    }

    if (VERIFY_BEHAVIOR) {
      await withTimeout(cdp.evaluate('ZQ.app.go("game",{levelId:25,seed:12345});'), 15000, '行为验证进入关卡');
      await sleep(200);
      var rawB = await withTimeout(cdp.evaluate(behaviorScript(), true), 40000, '行为验证');
      var codeB = printAssertions(JSON.parse(rawB), '行为验证');
      if (codeB) process.exitCode = 1;
    }

    if (VERIFY_GESTURE) {
      var rawG = await withTimeout(cdp.evaluate(gestureScript(), true), 40000, '手势验证');
      var codeG = printAssertions(JSON.parse(rawG), '手势验证');
      if (codeG) process.exitCode = 1;
    }

    if (VERIFY_SHELF) {
      var rawS = await withTimeout(cdp.evaluate(shelfScript(), true), 40000, '货架手势验证');
      var codeS = printAssertions(JSON.parse(rawS), '货架手势验证');
      if (codeS) process.exitCode = 1;
    }

    /* 页面级 JS 报错一律算失败：静默的 TypeError 会让截图看起来正常但功能已坏。
     * file:// 例外：妈妈立绘的环境光用 mask-image 取像素，Chrome 会把 file:// 当跨域拦截，
     * 这条报错既有存在、只影响那层暖光，视觉主体正常，故单独放行。 */
    var isFile = URL_BASE.indexOf('file://') === 0;
    var ignored = [];
    var fatal = pageErrors.filter(function (e) {
      if (!isFile) return true;
      if (e.indexOf('CORS policy') > -1) { ignored.push(e); return false; }
      /* 同一条 mask-image 限制在 Chrome 里还会额外记一条 ERR_FAILED 资源加载失败，
       * 只在 file:// 且 URL 就是那张立绘时放行，范围收窄避免掩盖真正的坏资源 */
      if (e.indexOf('net::ERR_FAILED') > -1 && e.indexOf('%E5%A6%88%E5%A6%88%E4%BA%BA%E7%89%A9') > -1) {
        ignored.push(e); return false;
      }
      return true;
    });
    if (ignored.length) {
      console.log('\n（file:// 已知限制，已放行 ' + ignored.length + ' 条 mask-image CORS / 资源加载报错）');
    }
    if (fatal.length) {
      console.log('\n页面报错 ' + fatal.length + ' 条：');
      fatal.slice(0, 10).forEach(function (e) { console.log('  ✗ ' + e); });
      process.exitCode = 1;
    } else {
      console.log('页面无 JS 报错');
    }
  } finally {
    try { proc.kill('SIGKILL'); } catch (e) {}
  }
}

main().catch(function (e) {
  console.error('capture failed: ' + e.message);
  process.exit(1);
});
