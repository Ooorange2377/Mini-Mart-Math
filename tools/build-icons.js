#!/usr/bin/env node
/* 应用图标生成：把 icons/my-icon.png 渲染成 PWA 所需的各尺寸 PNG。
 *
 * 要点：源图本身就是「圆角方形 + 四角透明」的苹果式图标。
 * 直接缩放会导致 iOS 把透明角渲染成黑色、安卓自适应遮罩露出透明底，
 * 所以这里先铺一层「自身放大并模糊」的延展背景把四角填满，
 * 再把原图按 scale 叠上去（maskable 的 scale=0.8 保证核心画面落在中心安全圆内）。
 *
 * 依赖仅本机 Chrome（headless canvas），无需任何 npm 包。
 * 用法：node tools/build-icons.js   （需先起静态服务器 http://127.0.0.1:8137）
 */
'use strict';
var cp = require('child_process'), fs = require('fs'), os = require('os'), path = require('path');
var ROOT = path.resolve(__dirname, '..');
var BASE = 'http://127.0.0.1:8137/';
var SRC = 'icons/my-icon.png';   // 图标母版（要换图标就替换这张图后重跑）
var JOBS = [
  { file: 'apple-touch-icon-180.png', size: 180, scale: 1 },   // iOS 主屏
  { file: 'icon-192.png', size: 192, scale: 1 },               // 安卓通用
  { file: 'icon-512.png', size: 512, scale: 1 },               // 安卓高清 + 启动图
  { file: 'maskable-512.png', size: 512, scale: 0.8 },         // 自适应遮罩：核心画面收进中心 80%
];
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
function CDP(ws) {
  var self = this; this.ws = new WebSocket(ws); this.seq = 0; this.p = new Map();
  this.ready = new Promise(function (res, rej) {
    self.ws.addEventListener('open', function () { res(); });
    self.ws.addEventListener('error', function () { rej(new Error('ws 连接失败')); });
  });
  this.ws.addEventListener('message', function (ev) {
    var m = JSON.parse(ev.data);
    if (m.id && self.p.has(m.id)) {
      var q = self.p.get(m.id); self.p.delete(m.id);
      if (m.error) q.reject(new Error(m.error.message)); else q.resolve(m.result);
    }
  });
}
CDP.prototype.send = function (me, pa) {
  var s = this, id = ++this.seq;
  return new Promise(function (res, rej) { s.p.set(id, { resolve: res, reject: rej }); s.ready.then(function () { s.ws.send(JSON.stringify({ id: id, method: me, params: pa || {} })); }); });
};
CDP.prototype.ev = function (expr, aw) {
  return this.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: !!aw }).then(function (r) {
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text); return r.result && r.result.value;
  });
};
function launch() {
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zqicon-'));
  var p = cp.spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    ['--headless=new', '--disable-gpu', '--no-first-run', '--remote-debugging-port=0', '--user-data-dir=' + dir, 'about:blank'],
    { stdio: ['ignore', 'ignore', 'pipe'] });
  return new Promise(function (res, rej) {
    var b = '', t = setTimeout(function () { rej(new Error('Chrome 启动超时')); }, 20000);
    p.stderr.on('data', function (c) {
      b += c; var m = b.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (m) { clearTimeout(t); res({ proc: p, ws: m[1] }); }
    });
    p.on('error', rej);
  });
}
/* size：输出边长；scale：原图相对画布的占比（1=铺满，0.8=收进中心 80%） */
function expr(size, scale) {
  var px = 1024;  // 内部先按 1024 渲染再缩小，圆角与描边更干净
  return 'new Promise(function(res){var i=new Image();' +
    'i.onload=function(){' +
      'var c=document.createElement("canvas");c.width=' + px + ';c.height=' + px + ';' +
      'var g=c.getContext("2d");' +
      /* 0) 先取原图的平均色做不透明底：模糊会把 alpha 一起糊开，没有这层四角就会半透明
       *    （iOS 会把透明区渲染成黑色） */
      'var s4=document.createElement("canvas");s4.width=8;s4.height=8;' +
      'var g4=s4.getContext("2d");g4.drawImage(i,0,0,8,8);' +
      'var d4=g4.getImageData(0,0,8,8).data,r=0,gc=0,b=0,n=0;' +
      'for(var q=0;q<d4.length;q+=4){if(d4[q+3]>200){r+=d4[q];gc+=d4[q+1];b+=d4[q+2];n++;}}' +
      'if(!n){r=234;gc=246;b=251;n=1;}' +
      'g.fillStyle="rgb("+Math.round(r/n)+","+Math.round(gc/n)+","+Math.round(b/n)+")";' +
      'g.fillRect(0,0,' + px + ',' + px + ');' +
      /* 1) 延展底：原图放大 1.2 倍铺满整块并重度模糊，把四角补成相近色彩 */
      'var bs=' + px + '/Math.min(i.naturalWidth,i.naturalHeight)*1.2;' +
      'var bw=i.naturalWidth*bs,bh=i.naturalHeight*bs;' +
      'g.filter="blur(24px)";g.drawImage(i,(' + px + '-bw)/2,(' + px + '-bh)/2,bw,bh);g.filter="none";' +
      /* 2) 主体：按 scale 居中叠加原图。
       *    scale<1（maskable）时额外羽化边缘：源图自带圆角边框，直接缩小会露出
       *    「图标套图标」的方框，羽化后与延展底自然衔接。 */
      'var s=' + (px / 512) + '*' + scale + ',side=512*s,o=(' + px + '-side)/2;' +
      'if(' + scale + '<1){' +
        'var T=document.createElement("canvas");T.width=' + px + ';T.height=' + px + ';' +
        'var tg=T.getContext("2d");tg.imageSmoothingQuality="high";tg.drawImage(i,o,o,side,side);' +
        'var M=document.createElement("canvas");M.width=' + px + ';M.height=' + px + ';' +
        'var mg=M.getContext("2d");mg.fillStyle="#fff";' +
        'var rad=side*0.24;mg.beginPath();' +
        'mg.moveTo(o+rad,o);mg.lineTo(o+side-rad,o);mg.quadraticCurveTo(o+side,o,o+side,o+rad);' +
        'mg.lineTo(o+side,o+side-rad);mg.quadraticCurveTo(o+side,o+side,o+side-rad,o+side);' +
        'mg.lineTo(o+rad,o+side);mg.quadraticCurveTo(o,o+side,o,o+side-rad);' +
        'mg.lineTo(o,o+rad);mg.quadraticCurveTo(o,o,o+rad,o);mg.closePath();mg.fill();' +
        'var M2=document.createElement("canvas");M2.width=' + px + ';M2.height=' + px + ';' +
        'var m2=M2.getContext("2d");m2.filter="blur(72px)";m2.drawImage(M,0,0);m2.filter="none";' +
        'tg.globalCompositeOperation="destination-in";tg.drawImage(M2,0,0);' +
        'g.imageSmoothingQuality="high";g.drawImage(T,0,0);' +
      '}else{' +
        'g.imageSmoothingQuality="high";g.drawImage(i,o,o,side,side);' +
      '}' +
      /* 3) 缩到目标尺寸 */
      'var o2=document.createElement("canvas");o2.width=' + size + ';o2.height=' + size + ';' +
      'var g2=o2.getContext("2d");g2.imageSmoothingQuality="high";g2.drawImage(c,0,0,' + size + ',' + size + ');' +
      'var px2=g2.getImageData(0,0,' + size + ',' + size + ').data;var amin=255;' +
      'for(var k=3;k<px2.length;k+=4){if(px2[k]<amin)amin=px2[k];}' +
      'res({b64:o2.toDataURL("image/png").split(",")[1],alphaMin:amin});' +
    '};' +
    'i.onerror=function(){res({err:"加载失败"});};i.src="' + BASE + SRC + '";})';
}
(async function () {
  var l = await launch();
  var host = l.ws.replace(/^ws:\/\//, '').replace(/\/devtools.*$/, '');
  var list = await fetch('http://' + host + '/json/list').then(function (r) { return r.json(); });
  var cdp = new CDP(list.filter(function (t) { return t.type === 'page'; })[0].webSocketDebuggerUrl);
  await cdp.ready;
  await cdp.send('Page.enable');
  await cdp.send('Page.navigate', { url: BASE + 'index.html' });
  await sleep(1200);
  var bad = 0;
  for (var i = 0; i < JOBS.length; i++) {
    var j = JOBS[i];
    var r = await cdp.ev(expr(j.size, j.scale), true);
    if (!r || r.err || !r.b64) { console.log('✗ ' + j.file + '（' + (r && r.err || '未知错误') + '）'); bad++; continue; }
    var buf = Buffer.from(r.b64, 'base64');
    fs.writeFileSync(path.join(ROOT, 'icons', j.file), buf);
    var cov = ((1 - j.scale) * 100).toFixed(0);
    console.log('✓ icons/' + j.file + '  ' + j.size + '×' + j.size +
      '  主体占比 ' + (j.scale * 100).toFixed(0) + '%' + (j.scale < 1 ? '（四周留 ' + cov + '% 安全区）' : '') +
      '  ' + (buf.length / 1024).toFixed(1) + ' KB  最小 alpha ' + r.alphaMin);
    if (r.alphaMin < 255) { console.log('  ⚠ 仍有透明像素，iOS 会显示为黑色'); bad++; }
  }
  l.proc.kill();
  process.exit(bad ? 1 : 0);
})().catch(function (e) { console.error('失败：' + e.message); process.exit(2); });
