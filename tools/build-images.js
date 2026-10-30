#!/usr/bin/env node
/* 关卡内图片 WebP 构建：把「商品素材/优化」与「购物篮/优化」的 PNG 批量转码为 WebP。
 * 编码用本机 Chrome 的 canvas.toDataURL('image/webp')，无需安装任何第三方依赖。
 *
 * 用法（先确保项目根有静态服务器，默认 http://127.0.0.1:8137）：
 *   node tools/build-images.js                 # 增量：已存在的 webp 跳过
 *   node tools/build-images.js --force         # 全量重转
 *   node tools/build-images.js --size=384 --q=0.82        # 覆盖商品图参数
 *   node tools/build-images.js --cart-size=640 --cart-q=0.85
 *   node tools/build-images.js --base=http://127.0.0.1:8137/
 */
'use strict';
var fs = require('fs');
var path = require('path');
var cp = require('child_process');
var os = require('os');

var ROOT = path.resolve(__dirname, '..');
var ARGS = {};
process.argv.slice(2).forEach(function (a) {
  var m = a.match(/^--([^=]+)(?:=(.*))?$/);
  if (m) ARGS[m[1]] = m[2] === undefined ? true : m[2];
});

var BASE = String(ARGS.base || 'http://127.0.0.1:8137/').replace(/\/?$/, '/');
var ITEM_SIZE = parseInt(ARGS.size || '384', 10);
var ITEM_Q = parseFloat(ARGS.q || '0.82');
var CART_SIZE = parseInt(ARGS['cart-size'] || '640', 10);
var CART_Q = parseFloat(ARGS['cart-q'] || '0.85');
var FORCE = !!ARGS.force;

var JOBS = [
  { src: '商品素材/优化', out: '商品素材/webp', size: ITEM_SIZE, q: ITEM_Q, label: '商品图' },
  { src: '购物篮/优化', out: '购物篮/webp', size: CART_SIZE, q: CART_Q, label: '购物篮' },
];

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
function kb(n) { return (n / 1024).toFixed(1) + ' KB'; }

function walk(dir) {
  var out = [];
  fs.readdirSync(dir).forEach(function (name) {
    var p = path.join(dir, name);
    var st = fs.statSync(p);
    if (st.isDirectory()) out = out.concat(walk(p));
    else if (/\.png$/i.test(name)) out.push(p);
  });
  return out;
}

/* ---------- 极简 CDP 客户端 ---------- */
function CDP(wsUrl) {
  var self = this;
  this.ws = new WebSocket(wsUrl);
  this.seq = 0; this.pending = new Map();
  this.ready = new Promise(function (res, rej) {
    self.ws.addEventListener('open', function () { res(); });
    self.ws.addEventListener('error', function () { rej(new Error('CDP 连接失败')); });
  });
  this.ws.addEventListener('message', function (ev) {
    var m = JSON.parse(ev.data);
    if (m.id && self.pending.has(m.id)) {
      var p = self.pending.get(m.id); self.pending.delete(m.id);
      if (m.error) p.reject(new Error(m.error.message)); else p.resolve(m.result);
    }
  });
}
CDP.prototype.send = function (method, params) {
  var self = this, id = ++this.seq;
  return new Promise(function (res, rej) {
    self.pending.set(id, { resolve: res, reject: rej });
    self.ready.then(function () {
      self.ws.send(JSON.stringify({ id: id, method: method, params: params || {} }));
    });
  });
};
CDP.prototype.evaluate = function (expr, awaitPromise) {
  return this.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: !!awaitPromise })
    .then(function (r) {
      if (r.exceptionDetails) {
        throw new Error((r.exceptionDetails.text || '') + ' :: ' +
          ((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || ''));
      }
      return r.result && r.result.value;
    });
};

function launchChrome() {
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zqbuild-'));
  var bin = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  if (!fs.existsSync(bin)) return Promise.reject(new Error('未找到 Chrome：' + bin));
  var proc = cp.spawn(bin, [
    '--headless=new', '--disable-gpu', '--mute-audio', '--no-first-run',
    '--no-default-browser-check', '--disable-extensions',
    '--remote-debugging-port=0', '--user-data-dir=' + dir, 'about:blank'
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  return new Promise(function (res, rej) {
    var buf = '', t = setTimeout(function () { rej(new Error('Chrome 启动超时')); }, 25000);
    proc.stderr.on('data', function (ch) {
      buf += ch.toString();
      var m = buf.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (m) { clearTimeout(t); res({ proc: proc, ws: m[1] }); }
    });
    proc.on('error', rej);
  });
}

/* 在页面内：取图 → 等比缩到长边 size → canvas 编码 WebP → 返回 base64 与实际像素 */
function encodeExpr(relPath, size, q) {
  var url = BASE + encodeURI(relPath);
  return 'new Promise(function(res){' +
    'var img=new Image();img.crossOrigin="anonymous";' +
    'img.onload=function(){' +
      'var w=img.naturalWidth,h=img.naturalHeight;' +
      'var s=Math.min(1,' + size + '/Math.max(w,h));' +
      'var c=document.createElement("canvas");' +
      'c.width=Math.max(1,Math.round(w*s));c.height=Math.max(1,Math.round(h*s));' +
      'var g=c.getContext("2d");g.imageSmoothingEnabled=true;g.imageSmoothingQuality="high";' +
      'g.drawImage(img,0,0,c.width,c.height);' +
      'var d=c.toDataURL("image/webp",' + q + ');' +
      'if(d.indexOf("data:image/webp")!==0){res({err:"该浏览器不支持 WebP 编码"});return;}' +
      'res({w:c.width,h:c.height,srcW:w,srcH:h,b64:d.slice(d.indexOf(",")+1)});' +
    '};' +
    'img.onerror=function(){res({err:"加载失败"});};' +
    'img.src="' + url + '";})';
}

/* 校验：写出的 WebP 能被解码，且尺寸一致 */
function verifyExpr(relPath, w, h) {
  var url = BASE + encodeURI(relPath) + '?t=' + Date.now();
  return 'new Promise(function(res){var i=new Image();' +
    'i.onload=function(){res({w:i.naturalWidth,h:i.naturalHeight});};' +
    'i.onerror=function(){res({err:"解码失败"});};i.src="' + url + '";})';
}

(async function () {
  var ch = await launchChrome();
  var host = ch.ws.replace(/^ws:\/\//, '').replace(/\/devtools.*$/, '');
  var list = await fetch('http://' + host + '/json/list').then(function (r) { return r.json(); });
  var target = list.filter(function (t) { return t.type === 'page'; })[0];
  var cdp = new CDP(target.webSocketDebuggerUrl);
  await cdp.ready;
  await cdp.send('Page.enable');
  await cdp.send('Page.navigate', { url: BASE + 'index.html' });
  await sleep(1500);

  var grand = { src: 0, out: 0, n: 0, skip: 0, fail: 0 };
  var rows = [];

  for (var j = 0; j < JOBS.length; j++) {
    var job = JOBS[j];
    var srcDir = path.join(ROOT, job.src);
    var outDir = path.join(ROOT, job.out);
    if (!fs.existsSync(srcDir)) { console.log('跳过（目录不存在）：' + job.src); continue; }
    var files = walk(srcDir);
    console.log('\n=== ' + job.label + '：' + files.length + ' 张，长边 ' + job.size + 'px q' + job.q + ' ===');
    for (var i = 0; i < files.length; i++) {
      var abs = files[i];
      var rel = path.relative(ROOT, abs).split(path.sep).join('/');
      var relOut = job.out + '/' + path.relative(srcDir, abs).split(path.sep).join('/').replace(/\.png$/i, '.webp');
      var absOut = path.join(ROOT, relOut.split('/').join(path.sep));
      var srcBytes = fs.statSync(abs).size;

      if (!FORCE && fs.existsSync(absOut)) {
        grand.skip++; grand.src += srcBytes; grand.out += fs.statSync(absOut).size;
        rows.push({ job: job.label, key: relOut, name: path.basename(rel), src: srcBytes,
          out: fs.statSync(absOut).size, note: '跳过' });
        continue;
      }

      var r = await cdp.evaluate(encodeExpr(rel, job.size, job.q), true);
      if (!r || r.err) {
        console.log('  ✗ ' + rel + ' → ' + (r && r.err || '未知错误'));
        grand.fail++;
        continue;
      }
      var buf = Buffer.from(r.b64, 'base64');
      fs.mkdirSync(path.dirname(absOut), { recursive: true });
      fs.writeFileSync(absOut, buf);

      var v = await cdp.evaluate(verifyExpr(relOut, r.w, r.h), true);
      var ok = v && !v.err && v.w === r.w && v.h === r.h;
      if (!ok) { grand.fail++; console.log('  ✗ 校验失败 ' + relOut + ' ' + JSON.stringify(v)); continue; }

      grand.n++; grand.src += srcBytes; grand.out += buf.length;
      rows.push({ job: job.label, key: relOut, name: path.basename(rel), src: srcBytes, out: buf.length, note: '' });
      console.log('  ✓ ' + path.basename(rel) + '  ' + r.srcW + '×' + r.srcH + ' → ' + r.w + '×' + r.h +
        '  ' + kb(srcBytes) + ' → ' + kb(buf.length) + '（' + Math.round(buf.length / srcBytes * 100) + '%）');
    }
  }

  /* ---------- 汇总 ---------- */
  console.log('\n=== 体积汇总（本次处理 + 已存在跳过）===');
  JOBS.forEach(function (job) {
    var sub = rows.filter(function (x) { return x.job === job.label; });
    if (!sub.length) return;
    var s = sub.reduce(function (a, x) { return a + x.src; }, 0);
    var o = sub.reduce(function (a, x) { return a + x.out; }, 0);
    console.log('  ' + job.label + '：' + sub.length + ' 张  ' + kb(s) + ' → ' + kb(o) +
      '（' + Math.round(o / s * 100) + '%，省 ' + Math.round((1 - o / s) * 100) + '%）');
  });
  if (rows.length) {
    console.log('  合计：' + rows.length + ' 张  ' + kb(grand.src) + ' → ' + kb(grand.out) +
      '（省 ' + Math.round((1 - grand.out / Math.max(grand.src, 1)) * 100) + '%）');
  }
  console.log('  新转码 ' + grand.n + ' / 跳过 ' + grand.skip + ' / 失败 ' + grand.fail);

  /* ---------- 体积清单（供 dev 断言「进关图片总字节」用，避免依赖缓存/网络） ---------- */
  if (rows.length) {
    var keys = rows.map(function (r) { return r.key; }).sort();
    var byKey = {};
    rows.forEach(function (r) { byKey[r.key] = r.out; });
    var lines = keys.map(function (k) {
      return "  '" + k + "': " + byKey[k] + ',';
    });
    var out = '/* 由 tools/build-images.js 生成：WebP 素材体积清单（字节）。请勿手改，重跑脚本即可。\n' +
      ' * 用途：dev 断言「进关图片总字节 ≤350KB」的确定性口径（不受浏览器缓存影响）。 */\n' +
      'window.ZQ = window.ZQ || {};\n' +
      'ZQ.IMAGE_BYTES = {\n' + lines.join('\n') + '\n};\n';
    fs.writeFileSync(path.join(ROOT, 'js/data/image-sizes.js'), out);
    console.log('  体积清单已写入 js/data/image-sizes.js（' + keys.length + ' 条）');
  }

  ch.proc.kill();
  process.exit(grand.fail ? 1 : 0);
})().catch(function (e) { console.error('构建失败：' + e.message); process.exit(2); });
