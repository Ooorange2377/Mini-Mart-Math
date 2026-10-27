#!/usr/bin/env node
/* PC 基线比对：逐像素 diff + 关键选择器样式快照 diff。
 *
 * 用法：
 *   node js/dev/pixel-diff.js js/dev/baseline/pc1920 /tmp/after
 *   node js/dev/pixel-diff.js <baseline> <current> --tolerance 0   （默认 0，即要求完全一致）
 *
 * 输出：每个屏幕的差异像素数 / 差异率 / 最大通道差 / 差异包围盒，以及样式快照中
 * 字号、位置、尺寸发生变化的条目。任一屏有差异即退出码 1。 */
'use strict';

var fs = require('fs');
var path = require('path');
var zlib = require('zlib');

function arg(name, fallback) {
  var i = process.argv.indexOf('--' + name);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

/* ---------- 最小 PNG 解码（8bit / 非隔行 / 灰度·RGB·灰度A·RGBA） ---------- */
function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('不是 PNG');
  var off = 8, width = 0, height = 0, bitDepth = 0, colorType = 0, interlace = 0;
  var idat = [];
  while (off < buf.length) {
    var len = buf.readUInt32BE(off);
    var type = buf.toString('ascii', off + 4, off + 8);
    var data = buf.slice(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
    off += 12 + len;
  }
  if (bitDepth !== 8) throw new Error('只支持 8bit PNG，当前 ' + bitDepth);
  if (interlace !== 0) throw new Error('不支持隔行 PNG');

  var channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType];
  if (!channels) throw new Error('不支持的 colorType ' + colorType);

  var raw = zlib.inflateSync(Buffer.concat(idat));
  var stride = width * channels;
  var out = Buffer.alloc(width * height * 4);
  var prev = Buffer.alloc(stride);
  var cur = Buffer.alloc(stride);

  for (var y = 0; y < height; y++) {
    var pos = y * (stride + 1);
    var filter = raw[pos];
    raw.copy(cur, 0, pos + 1, pos + 1 + stride);
    for (var x = 0; x < stride; x++) {
      var a = x >= channels ? cur[x - channels] : 0;
      var b = prev[x];
      var c = x >= channels ? prev[x - channels] : 0;
      var v = cur[x];
      switch (filter) {
        case 0: break;
        case 1: v = (v + a) & 0xff; break;
        case 2: v = (v + b) & 0xff; break;
        case 3: v = (v + ((a + b) >> 1)) & 0xff; break;
        case 4: {
          var p = a + b - c;
          var pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          v = (v + (pa <= pb && pa <= pc ? a : (pb <= pc ? b : c))) & 0xff;
          break;
        }
        default: throw new Error('未知过滤类型 ' + filter);
      }
      cur[x] = v;
    }
    for (var px = 0; px < width; px++) {
      var si = px * channels, di = (y * width + px) * 4;
      if (channels === 1) {
        out[di] = out[di + 1] = out[di + 2] = cur[si]; out[di + 3] = 255;
      } else if (channels === 3) {
        out[di] = cur[si]; out[di + 1] = cur[si + 1]; out[di + 2] = cur[si + 2]; out[di + 3] = 255;
      } else if (channels === 2) {
        out[di] = out[di + 1] = out[di + 2] = cur[si]; out[di + 3] = cur[si + 1];
      } else {
        out[di] = cur[si]; out[di + 1] = cur[si + 1]; out[di + 2] = cur[si + 2]; out[di + 3] = cur[si + 3];
      }
    }
    var tmp = prev; prev = cur; cur = tmp;
  }
  return { width: width, height: height, data: out };
}

function comparePng(fileA, fileB, tolerance) {
  var a = decodePng(fs.readFileSync(fileA));
  var b = decodePng(fs.readFileSync(fileB));
  if (a.width !== b.width || a.height !== b.height) {
    return { fatal: '尺寸不同：' + a.width + '×' + a.height + ' vs ' + b.width + '×' + b.height };
  }
  var diffPixels = 0, maxDelta = 0;
  var box = { x0: a.width, y0: a.height, x1: -1, y1: -1 };
  for (var p = 0; p < a.width * a.height; p++) {
    var i = p * 4, worst = 0;
    for (var c = 0; c < 3; c++) {
      var d = Math.abs(a.data[i + c] - b.data[i + c]);
      if (d > worst) worst = d;
    }
    if (worst > tolerance) {
      diffPixels++;
      if (worst > maxDelta) maxDelta = worst;
      var x = p % a.width, y = (p - x) / a.width;
      if (x < box.x0) box.x0 = x;
      if (y < box.y0) box.y0 = y;
      if (x > box.x1) box.x1 = x;
      if (y > box.y1) box.y1 = y;
    }
  }
  var ratio = diffPixels / (a.width * a.height);
  return {
    diffPixels: diffPixels, ratio: ratio, maxDelta: maxDelta,
    box: diffPixels ? box : null
  };
}

function compareStyles(fileA, fileB) {
  if (!fs.existsSync(fileA) || !fs.existsSync(fileB)) return [];
  var a = JSON.parse(fs.readFileSync(fileA, 'utf8'));
  var b = JSON.parse(fs.readFileSync(fileB, 'utf8'));
  var out = [];
  Object.keys(a).forEach(function (sel) {
    var va = a[sel], vb = b[sel];
    if (!va && !vb) return;
    if (!va || !vb) { out.push(sel + '：一侧不存在'); return; }
    Object.keys(va).forEach(function (k) {
      if (typeof va[k] === 'number') {
        if (Math.abs(va[k] - vb[k]) > 0.01) out.push(sel + ' . ' + k + '：' + va[k] + ' → ' + vb[k]);
      } else if (va[k] !== vb[k]) {
        out.push(sel + ' . ' + k + '：' + va[k] + ' → ' + vb[k]);
      }
    });
  });
  return out;
}

function main() {
  var baseDir = process.argv[2];
  var curDir = process.argv[3];
  if (!baseDir || !curDir) {
    console.error('用法：node js/dev/pixel-diff.js <基线目录> <当前目录> [--tolerance 0]');
    process.exit(2);
  }
  var tolerance = parseInt(arg('tolerance', '0'), 10);
  var names = fs.readdirSync(baseDir).filter(function (f) { return /\.png$/.test(f); }).sort();
  if (!names.length) {
    console.error('基线目录里没有 PNG：' + baseDir);
    process.exit(2);
  }

  var failed = 0;
  names.forEach(function (name) {
    var a = path.join(baseDir, name);
    var b = path.join(curDir, name);
    if (!fs.existsSync(b)) {
      console.log('MISSING  ' + name);
      failed++;
      return;
    }
    var res = comparePng(a, b, tolerance);
    var styleDiffs = compareStyles(
      a.replace(/\.png$/, '.styles.json'),
      b.replace(/\.png$/, '.styles.json')
    );
    if (res.fatal) {
      console.log('SIZE     ' + name + '  ' + res.fatal);
      failed++;
      return;
    }
    var pixelOk = res.diffPixels === 0;
    var styleOk = styleDiffs.length === 0;
    if (pixelOk && styleOk) {
      console.log('PASS     ' + name);
      return;
    }
    failed++;
    if (!pixelOk) {
      console.log('DIFF     ' + name + '  差异像素 ' + res.diffPixels +
        '（' + (res.ratio * 100).toFixed(4) + '%）最大通道差 ' + res.maxDelta +
        ' 包围盒 [' + res.box.x0 + ',' + res.box.y0 + ' - ' + res.box.x1 + ',' + res.box.y1 + ']');
    }
    if (!styleOk) {
      console.log('STYLE    ' + name + '  ' + styleDiffs.length + ' 项变化：');
      styleDiffs.slice(0, 12).forEach(function (line) { console.log('           ' + line); });
    }
  });

  if (failed) {
    console.log('\nFAIL：' + failed + '/' + names.length + ' 屏与基线不一致');
    process.exit(1);
  }
  console.log('\nPASS：' + names.length + ' 屏与基线完全一致（tolerance=' + tolerance + '）');
}

main();
