#!/usr/bin/env node
/* 一键回归：把移动端适配的全部自动断言串起来，任一 FAIL 非零退出。
 *
 * 用法：
 *   node js/dev/regress.js                 # 全量
 *   node js/dev/regress.js --only gesture  # 只跑名字含该子串的步骤
 *   node js/dev/regress.js --keep          # 保留截图与日志（默认也保留在 /tmp）
 *
 * 前提：静态服务器已在 8137 端口运行（cd 到项目根 python3 -m http.server 8137）。
 * 输出目录：/tmp/zq-regress/<时间戳>/
 *
 * 判定口径：
 *   1. 每步要求子进程 exit 0；
 *   2. 606×341 为「保守上界」档，历史上唯一已授权失败是 .t-rule-line 溢出 5px，
 *      该步若失败只允许是这一条（品类要求改为每行一条后已不再溢出，保留兜底判定）。
 *   3. --verify-shelf / --name-audit 未实现时自动 SKIP，不计入失败。
 */
'use strict';

var fs = require('fs');
var os = require('os');
var path = require('path');
var cp = require('child_process');
var http = require('http');

var ROOT = path.resolve(__dirname, '..', '..');
var DEV = path.join(ROOT, 'js', 'dev');
var STAMP = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
var OUT = path.join(os.tmpdir(), 'zq-regress', STAMP);
var URL_BASE = 'http://127.0.0.1:8137/index.html';
var ONLY = arg('only', '');
var STEP_TIMEOUT = 240000;

function arg(name, fallback) {
  var i = process.argv.indexOf('--' + name);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function hasFlag(file, flag) {
  try { return fs.readFileSync(file, 'utf8').indexOf("'" + flag + "'") > -1; } catch (e) { return false; }
}

function checkServer() {
  return new Promise(function (resolve) {
    var req = http.get(URL_BASE.replace('/index.html', '/index.html'), function (r) {
      r.resume(); resolve(r.statusCode === 200);
    });
    req.on('error', function () { resolve(false); });
    req.setTimeout(2500, function () { req.destroy(); resolve(false); });
  });
}

/* 606 档：允许失败，但必须是已知的那一条 .t-rule-line 溢出 */
function onlyKnownRuleLineFailure(out) {
  var lines = out.split('\n').filter(function (l) { return /^\s+FAIL\s/.test(l); });
  if (lines.length !== 1) return false;
  return /t-rule-line/.test(lines[0]);
}

var CAN_SHELF = hasFlag(path.join(DEV, 'capture.js'), 'verify-shelf');
var CAN_AUDIT = hasFlag(path.join(DEV, 'capture.js'), 'name-audit');
var CAN_GESTURE = hasFlag(path.join(DEV, 'capture.js'), 'verify-gesture');

var MOBILE = ['--mobile', '1', '--assert-mobile', '1', '--dpr', '2'];

var STEPS = [
  { name: 'selfcheck（42 关出题）', cmd: ['node', path.join(DEV, 'selfcheck.js')] },
  { name: 'css-audit（媒体查询/热区归属）', cmd: ['node', path.join(DEV, 'css-audit.js')] },
  { name: 'timer-test（可暂停计时器）', cmd: ['node', path.join(DEV, 'timer-test.js')] },
  {
    name: 'verify-behavior（后台暂停/返回键）',
    dir: 'behavior',
    cmd: ['node', path.join(DEV, 'capture.js'), 'OUT', '--verify-behavior', '1']
  },
  {
    name: '844×390 移动断言' + (CAN_GESTURE ? ' + 手势' : ''),
    dir: 'm844',
    cmd: ['node', path.join(DEV, 'capture.js'), 'OUT', '--width', '844', '--height', '390']
      .concat(MOBILE, CAN_GESTURE ? ['--verify-gesture', '1'] : [])
  },
  {
    name: '667×375 移动断言（12/13 mini）',
    dir: 'm667',
    cmd: ['node', path.join(DEV, 'capture.js'), 'OUT', '--width', '667', '--height', '375']
      .concat(MOBILE, CAN_GESTURE ? ['--verify-gesture', '1'] : [])
  },
  {
    name: '629×354 移动断言（安全区 21px）' + (CAN_AUDIT ? ' + 名称审计' : ''),
    dir: 'm629',
    cmd: ['node', path.join(DEV, 'capture.js'), 'OUT', '--width', '660', '--height', '375']
      .concat(MOBILE, ['--safe-b', '21'], CAN_AUDIT ? ['--name-audit', '1'] : [])
  },
  {
    name: '606×341 保守档（品类要求每行一条后已无溢出）',
    dir: 'm606',
    expectKnownFailure: onlyKnownRuleLineFailure,
    cmd: ['node', path.join(DEV, 'capture.js'), 'OUT', '--width', '666', '--height', '375']
      .concat(MOBILE, ['--safe-b', '34', '--name-tol', '4'], CAN_AUDIT ? ['--name-audit', '1'] : [])
  },
  {
    name: 'verify-shelf（货架横滑/点选互斥）',
    dir: 'shelf',
    skip: !CAN_SHELF,
    cmd: ['node', path.join(DEV, 'capture.js'), 'OUT', '--width', '844', '--height', '390']
      .concat(MOBILE, ['--verify-shelf', '1'])
  },
  {
    name: 'PC 截图（1920×1080 六屏）',
    dir: 'pc',
    cmd: ['node', path.join(DEV, 'capture.js'), 'OUT']
  },
  {
    name: 'PC 基线 diff（tolerance=0）',
    after: 'pc',
    cmd: ['node', path.join(DEV, 'pixel-diff.js'),
      path.join(DEV, 'baseline', 'pc1920'), 'OUT_PC']
  }
];

function runStep(step, idx) {
  return new Promise(function (resolve) {
    if (step.skip) {
      console.log('SKIP  ' + step.name + '  （工具尚未实现该开关）');
      return resolve({ name: step.name, state: 'skip' });
    }
    var dir = step.dir ? path.join(OUT, step.dir) : null;
    if (dir) fs.mkdirSync(dir, { recursive: true });
    var argv = step.cmd.map(function (a) {
      if (a === 'OUT') return dir;
      if (a === 'OUT_PC') return path.join(OUT, 'pc');
      return a;
    });
    var t0 = Date.now();
    var r = cp.spawnSync(argv[0], argv.slice(1), {
      cwd: ROOT, encoding: 'utf8', timeout: STEP_TIMEOUT, maxBuffer: 64 * 1024 * 1024
    });
    var out = (r.stdout || '') + (r.stderr || '');
    var logFile = path.join(OUT, 'step' + (idx + 1) + '.log');
    fs.writeFileSync(logFile, out);
    var ms = Date.now() - t0;
    var failLines = out.split('\n').filter(function (l) { return /^\s+FAIL\s/.test(l); });

    if (r.status === 0) {
      console.log('PASS  ' + step.name + '  (' + ms + 'ms)');
      return resolve({ name: step.name, state: 'pass', ms: ms });
    }
    if (step.expectKnownFailure && step.expectKnownFailure(out)) {
      console.log('PASS  ' + step.name + '  (' + ms + 'ms)  [已授权失败：' + failLines[0].trim() + ']');
      return resolve({ name: step.name, state: 'pass-known', ms: ms });
    }
    console.log('FAIL  ' + step.name + '  (' + ms + 'ms, exit ' + r.status + ')');
    failLines.slice(0, 6).forEach(function (l) { console.log('        ' + l.trim()); });
    console.log('        日志：' + logFile);
    resolve({ name: step.name, state: 'fail', ms: ms, log: logFile });
  });
}

(async function () {
  var up = await checkServer();
  if (!up) {
    console.error('静态服务器未运行：' + URL_BASE);
    console.error('请先在项目根启动：python3 -m http.server 8137');
    process.exit(2);
  }
  fs.mkdirSync(OUT, { recursive: true });
  console.log('回归开始  ' + STAMP);
  console.log('输出目录  ' + OUT + '\n');

  var results = [];
  /* --only 时自动带上依赖步骤（如「PC 基线 diff」需要先有「PC 截图」的输出） */
  var include = STEPS.map(function (s) { return !ONLY || s.name.indexOf(ONLY) > -1; });
  STEPS.forEach(function (s, i) {
    if (include[i] && s.after) {
      STEPS.forEach(function (t, j) { if (t.dir === s.after) include[j] = true; });
    }
  });
  for (var i = 0; i < STEPS.length; i++) {
    if (!include[i]) continue;
    results.push(await runStep(STEPS[i], i));
  }

  var failed = results.filter(function (r) { return r.state === 'fail'; });
  var known = results.filter(function (r) { return r.state === 'pass-known'; });
  var skipped = results.filter(function (r) { return r.state === 'skip'; });
  console.log('\n---- 汇总 ----');
  console.log('通过 ' + results.filter(function (r) { return r.state === 'pass'; }).length +
    ' / 已授权 ' + known.length + ' / 跳过 ' + skipped.length + ' / 失败 ' + failed.length);
  if (known.length) known.forEach(function (k) { console.log('  [KNOWN] ' + k.name); });
  if (skipped.length) skipped.forEach(function (k) { console.log('  [SKIP]  ' + k.name); });
  if (failed.length) {
    failed.forEach(function (f) { console.log('  [FAIL]  ' + f.name); });
    process.exit(1);
  }
  console.log('\n全部通过（含已授权项），可交付。');
  process.exit(0);
})().catch(function (e) {
  console.error('regress 异常：' + e.message);
  process.exit(1);
});
