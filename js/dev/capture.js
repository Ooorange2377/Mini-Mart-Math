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
    'var back=hit(".pager-arrow",40);hit(".btn-tool",44);var bk=hit(".btn-back-game",44);' +
    /* 3.2 44px 是否挤压排版：与相邻元素不相交、货架可视宽度不减少 */
    'var inter=function(a,b){return a.left<b.right-0.5&&b.left<a.right-0.5&&a.top<b.bottom-0.5&&b.top<a.bottom-0.5;};' +
    'var tools=[].slice.call(document.querySelectorAll(".btn-tool"));' +
    'var clash=0;' +
    'for(var ti=0;ti<tools.length;ti++){for(var tj=ti+1;tj<tools.length;tj++){' +
    'if(inter(tools[ti].getBoundingClientRect(),tools[tj].getBoundingClientRect()))clash++;}}' +
    'add("道具方块 44px 互不相交",clash===0,clash+" 对相交（共 "+tools.length+" 块）");' +
    'var arrows=[].slice.call(document.querySelectorAll(".pager-arrow"));' +
    'var dots=[].slice.call(document.querySelectorAll(".pager-dot"));' +
    'var dotClash=0;arrows.forEach(function(a){dots.forEach(function(dt){' +
    'if(inter(a.getBoundingClientRect(),dt.getBoundingClientRect()))dotClash++;});});' +
    'add("翻页箭头 44px 不压页点",dotClash===0,dotClash+" 处相交（箭头 "+arrows.length+"，页点 "+dots.length+"）");' +
    'var slotClash=0,maxOv=0;arrows.forEach(function(a){[].slice.call(document.querySelectorAll(".slot")).forEach(function(s){' +
    'var ar=a.getBoundingClientRect(),sr=s.getBoundingClientRect();' +
    'if(inter(ar,sr)){slotClash++;var ox=Math.min(ar.right,sr.right)-Math.max(ar.left,sr.left);' +
    'var oy=Math.min(ar.bottom,sr.bottom)-Math.max(ar.top,sr.top);' +
    'if(ox*oy>maxOv)maxOv=Math.round(ox)+"×"+Math.round(oy);}});});' +
    'var clashMsg=slotClash===0?"不相交":(slotClash+" 处相交，最大重叠 "+maxOv+"px（箭头 z-index 更高，点击仍命中箭头）");' +
    'add("翻页箭头热区不压商品卡",slotClash===0,clashMsg);' +
    '/* A/B：临时去掉 min-width/min-height，货架宽度若变化说明热区挤压了排版 */' +
    'var shelf=document.querySelector(".shelf-viewport")||document.querySelector(".shelf");' +
    'var grid=document.querySelector(".layer-grid");' +
    'var w1=shelf.clientWidth,g1=grid?grid.clientWidth:0;' +
    'arrows.forEach(function(a){a.style.minWidth="0px";a.style.minHeight="0px";});' +
    'void shelf.offsetWidth;' +
    'var w2=shelf.clientWidth,g2=grid?grid.clientWidth:0;' +
    'arrows.forEach(function(a){a.style.minWidth="";a.style.minHeight="";});' +
    'add("44px 热区不压缩货架",w1===w2&&g1===g2,' +
    '"有 44px 时货架 "+w1+"px / 网格 "+g1+"px，去掉后 "+w2+"px / "+g2+"px");' +

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
    'arrows.forEach(function(a){var ar=a.getBoundingClientRect();' +
    '[].slice.call(document.querySelectorAll(".slot")).forEach(function(s){var sr=s.getBoundingClientRect();' +
    'var ox=Math.min(ar.right,sr.right)-Math.max(ar.left,sr.left);' +
    'if(ox>0){var dy=ar.top-sr.bottom;if(dy<gapMin)gapMin=dy;}});});' +
    'var shH=shelfRoot?Math.round(shelfRoot.getBoundingClientRect().height):0;' +
    'var vpH=vr?Math.round(vr.height):0;' +
    'var per=Math.round(slotN/Math.max(layers,1));' +
    'var msg="货架 "+shH+"px / 视口 "+vpH+"px；"+layers+" 层 × "+per+" 件 = "+slotN+' +
    '" 件/页（完整可见 "+visN+" 件，原 "+visOld+" 件）；商品卡 "+hNow.toFixed(1)+"px（原 "+hOld.toFixed(1)+' +
    '"px，缩 "+(hOld-hNow).toFixed(1)+"px）；商品图 "+ihNow.toFixed(1)+"px（原 "+ihOld.toFixed(1)+' +
    '"px）；底部留白 "+padNow;' +
    'add("关键尺寸",true,msg);' +
    'add("留白可下调余量",gapMin>=8,"箭头与价格行最小间隙 "+gapMin.toFixed(1)+' +
    '"px（≥8 底线；可下调约 "+Math.max(0,Math.round(gapMin-8))+"px）");' +
    '/* 卡底与层板顶的间隙：必须为正且落在 3~4.5px（安全区会把它抬高），否则卡片看起来压在层板上 */' +
    'var bEl=pageEl?pageEl.querySelector(".layer-board"):null;' +
    'var gapBoard=bEl?bEl.getBoundingClientRect().top-slotEl.getBoundingClientRect().bottom:0;' +
    'add("卡片不压层板",gapBoard>=3&&gapBoard<=4.5,"卡底与层板顶间隙 "+gapBoard.toFixed(2)+' +
    '"px（要求 3~4.5px；留白 48px 那版为负值）");' +
    '/* 商品图片可绘制区（去掉 .slot-img 的 scale(1.06)）：红线 20px，断言留 0.5px 测量余量 */' +
    'var imgScale=1;var mt=(imgEl?getComputedStyle(imgEl).transform:"").match(/matrix\\(([^,]+)/);' +
    'if(mt)imgScale=parseFloat(mt[1]);' +
    'var drawH=imgEl?imgEl.getBoundingClientRect().height/imgScale:0;' +
    'add("图片区 ≥19.5",drawH>=19.5,"图片可绘制区 "+drawH.toFixed(2)+' +
    '"px（红线 20，允许 0.5px 工具误差；scale="+imgScale.toFixed(2)+"）");' +
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
    'corner(".btn-tool");corner(".btn-back-game");corner(".pager-arrow");' +
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
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: SEED_SOURCE });
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
      source: 'document.addEventListener("DOMContentLoaded",function(){' +
        'var s=document.createElement("style");s.textContent=' + JSON.stringify(FREEZE_CSS) + ';' +
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
