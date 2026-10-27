#!/usr/bin/env node
/* 移动端适配的静态断言（一键回归门禁）。
 *
 * 用法：
 *   node js/dev/css-audit.js            # 断言全部规则，退出码 0 = 通过
 *   node js/dev/css-audit.js --list     # 额外打印每条字体规则所在媒体查询，便于排查
 *
 * 断言内容（对应「视觉用 pointer、交互用 any-pointer」的约定）：
 *   1. 字号下限：关键选择器的 font-size 只能出现在 @media (pointer: coarse) 内，
 *      且不能出现在只有 any-pointer 的媒体查询里（避免触控本用鼠标时被放大）。
 *   2. 所有含 max()/clamp() 的字号声明同样只能在 (pointer: coarse) 内。
 *   3. css/mobile.css 不允许出现顶层规则（必须全部被媒体查询包住）。
 *   4. touch-action / -webkit-touch-callout 只能在 (any-pointer: coarse) 内。
 *   5. 热区选择器（.pager-arrow / .btn-tool / .btn-back-game / .note-head）的
 *      ::after 尺寸规则只能在 (any-pointer: coarse) 内。
 *   6. .rotate-tip 系列只能在 (orientation: portrait) and (any-pointer: coarse) 内。
 *   7. :hover 规则必须在 (hover: hover) and (pointer: fine) 内。
 *   8. height: 100vh 必须与 100dvh 成对出现（前者是后者的兜底）。
 *   9. .stage 不允许用 env() 做 padding（会改变容器查询基准，破坏 1cqw）。
 */
'use strict';

var fs = require('fs');
var path = require('path');

var CSS_DIR = path.join(__dirname, '..', '..', 'css');
var FILES = ['base.css', 'layout.css', 'components.css', 'screens.css', 'animations.css', 'mobile.css'];

/* 需要字号下限的 13 个选择器（PC 原字号见实现方案表） */
var VISUAL_SELECTORS = [
  '.hud-target .t-title',
  '.hud-target .t-rule .t-rule-label',
  '.hud-target .t-rule .t-rule-line',
  '.lang-en .hud-target .t-rule .t-rule-line',
  '.hud-timer .t-label',
  '.hud-timer .t-state',
  '.hud-items .note-title',
  '.items-row .row-name',
  '.lang-en .items-row .row-name',
  '.items-row .row-price',
  '.slot-name',
  '.slot-price',
  '.btn-tool .dt-name',
  '.btn-tool .dt-badge',
  '.card-owned'
];

var HIT_SELECTORS = ['.pager-arrow', '.btn-tool', '.btn-back-game', '.hud-items .note-head', '.pager-dot'];

var violations = [];

function fail(msg) { violations.push(msg); }

/* ---------- 极简 CSS 解析：只关心「媒体栈 + 选择器 + 声明」 ---------- */
function parseCss(text, file) {
  text = text.replace(/\/\*[\s\S]*?\*\//g, '');
  var entries = [];
  var stack = [];
  var buf = '';
  var i = 0;

  function currentRule() {
    for (var k = stack.length - 1; k >= 0; k--) {
      if (stack[k].type === 'rule') return stack[k];
    }
    return null;
  }
  function mediaStack() {
    return stack.filter(function (f) { return f.type === 'at' && /^@media/.test(f.prelude); })
      .map(function (f) { return f.prelude; });
  }
  function supportsStack() {
    return stack.filter(function (f) { return f.type === 'at' && /^@supports/.test(f.prelude); })
      .map(function (f) { return f.prelude; });
  }
  function inKeyframes() {
    return stack.some(function (f) { return f.type === 'at' && /^@(-webkit-)?keyframes/.test(f.prelude); });
  }

  while (i < text.length) {
    var ch = text[i];
    if (ch === '{') {
      var prelude = buf.trim();
      buf = '';
      if (prelude.charAt(0) === '@') {
        stack.push({ type: 'at', prelude: prelude });
      } else {
        stack.push({ type: 'rule', prelude: prelude, media: mediaStack(), supports: supportsStack(), decls: [] });
      }
      i++;
      continue;
    }
    if (ch === '}') {
      var frame = stack.pop();
      if (frame && frame.type === 'rule') {
        if (!inKeyframes() && frame.decls.length) {
          entries.push({
            file: file, selector: frame.prelude.replace(/\s+/g, ' '),
            media: frame.media, supports: frame.supports, decls: frame.decls
          });
        }
      }
      buf = '';
      i++;
      continue;
    }
    if (ch === ';') {
      var rule = currentRule();
      var decl = buf.trim();
      buf = '';
      if (rule && decl && !inKeyframes()) {
        var idx = decl.indexOf(':');
        if (idx > 0) {
          rule.decls.push({
            prop: decl.slice(0, idx).trim().toLowerCase(),
            value: decl.slice(idx + 1).trim()
          });
        }
      }
      i++;
      continue;
    }
    buf += ch;
    i++;
  }
  return entries;
}

function strictPointerCoarse(entry) {
  var joined = entry.media.join(' ');
  return /(^|[\s(])pointer\s*:\s*coarse/.test(joined);
}
function anyPointerCoarse(entry) {
  return /any-pointer\s*:\s*coarse/.test(entry.media.join(' '));
}
function hoverFine(entry) {
  var joined = entry.media.join(' ');
  return /hover\s*:\s*hover/.test(joined) && /pointer\s*:\s*fine/.test(joined);
}
function normalize(sel) {
  return sel.replace(/\s+/g, ' ').replace(/,(?![^(]*\))/g, ', ').trim();
}

function selMatches(selector, target) {
  var list = normalize(selector).split(/,\s*(?![^(]*\))/);
  for (var i = 0; i < list.length; i++) {
    if (list[i].trim() === target) return true;
    /* 允许伪类/伪元素例外：目标前加 .is-* 之类状态限定也算命中同族 */
    if (list[i].trim().indexOf(target) === 0) return true;
  }
  return false;
}

function main() {
  var listMode = process.argv.indexOf('--list') > -1;
  var all = [];

  FILES.forEach(function (name) {
    var p = path.join(CSS_DIR, name);
    if (!fs.existsSync(p)) {
      if (name === 'mobile.css') fail('缺少 css/mobile.css');
      return;
    }
    all = all.concat(parseCss(fs.readFileSync(p, 'utf8'), name));
  });

  /* 1. 字号下限只允许出现在严格 (pointer: coarse) 内 */
  all.forEach(function (e) {
    e.decls.forEach(function (d) {
      if (d.prop !== 'font-size') return;
      VISUAL_SELECTORS.forEach(function (target) {
        if (!selMatches(e.selector, target)) return;
        if (listMode) console.log('[font] ' + e.file + ' | ' + e.selector + ' | ' + d.value + ' | media: ' + (e.media.join(' & ') || '(无)'));
        /* 顶层声明是 PC 基线，允许存在；一旦放进媒体查询，就必须是严格 pointer: coarse */
        if (e.media.length && !strictPointerCoarse(e)) {
          fail(e.file + ' ' + e.selector + ' 的 font-size=' + d.value + ' 放进了非 (pointer: coarse) 的媒体查询（media: ' + e.media.join(' & ') + '）');
        }
      });
    });
  });

  /* 2. 字号下限：mobile.css 里的 max()/clamp() 只能在严格 coarse 内，且必须带 px 下限。
   *    （components/screens 里原有的 vh 版 clamp 属于 PC 既有样式，不在本规则范围内） */
  all.forEach(function (e) {
    if (e.file !== 'mobile.css') return;
    e.decls.forEach(function (d) {
      if (d.prop !== 'font-size') return;
      if (!/max\(|clamp\(/.test(d.value)) return;
      if (!/\d+px/.test(d.value)) fail(e.file + ' ' + e.selector + ' 的 font-size 缺少 px 下限：' + d.value);
      if (!strictPointerCoarse(e)) {
        fail(e.file + ' ' + e.selector + ' 的 font-size=' + d.value + ' 使用了 max()/clamp() 但不在 (pointer: coarse) 内');
      }
    });
  });

  /* 3. mobile.css 不允许顶层规则 */
  all.forEach(function (e) {
    if (e.file !== 'mobile.css') return;
    if (!e.media.length) fail('mobile.css 存在顶层规则（未包媒体查询）：' + e.selector);
  });

  /* 4. mobile.css 里的 touch-action / touch-callout 只能出现在 any-pointer: coarse 内
   *    （base.css 的全局 manipulation、screens.css 的皮肤页 pan-y 是既有样式） */
  all.forEach(function (e) {
    if (e.file !== 'mobile.css') return;
    e.decls.forEach(function (d) {
      if (d.prop !== 'touch-action' && d.prop !== '-webkit-touch-callout') return;
      if (!anyPointerCoarse(e)) {
        fail(e.file + ' ' + e.selector + ' 的 ' + d.prop + ' 不在 (any-pointer: coarse) 内');
      }
    });
  });

  /* 5. 热区 ::after 尺寸规则只能在 any-pointer: coarse 内（只审 mobile.css 新增的热区层） */
  all.forEach(function (e) {
    if (e.file !== 'mobile.css') return;
    if (e.selector.indexOf('::after') < 0) return;
    var isHit = HIT_SELECTORS.some(function (h) { return e.selector.indexOf(h) > -1; });
    if (!isHit) return;
    if (!anyPointerCoarse(e)) {
      fail(e.file + ' ' + e.selector + ' 是热区规则但不在 (any-pointer: coarse) 内');
    }
  });

  /* 6. 竖屏提示只能在 portrait + any-pointer: coarse 内（只审 mobile.css） */
  all.forEach(function (e) {
    if (e.file !== 'mobile.css') return;
    if (e.selector.indexOf('.rotate-tip') < 0) return;
    var joined = e.media.join(' ');
    if (!/orientation\s*:\s*portrait/.test(joined) || !/any-pointer\s*:\s*coarse/.test(joined)) {
      fail('竖屏提示规则缺少 (orientation: portrait) and (any-pointer: coarse)：' + e.selector);
    }
  });

  /* 7. :hover 必须包在 (hover: hover) and (pointer: fine) 内 */
  all.forEach(function (e) {
    if (e.selector.indexOf(':hover') < 0) return;
    if (!hoverFine(e)) {
      fail(e.file + ' ' + e.selector + ' 的 :hover 规则未包在 (hover: hover) and (pointer: fine) 内');
    }
  });

  /* 8. 100vh 必须与 100dvh 成对（兜底模式） */
  all.forEach(function (e) {
    e.decls.forEach(function (d) {
      if (d.prop !== 'height' || d.value.indexOf('100vh') < 0) return;
      var hasDvh = e.decls.some(function (x) { return x.prop === 'height' && x.value.indexOf('100dvh') > -1; });
      if (!hasDvh) fail(e.file + ' ' + e.selector + ' 使用 100vh 但未补 100dvh 兜底');
    });
  });

  /* 9. .stage 不能用 env() 做 padding */
  all.forEach(function (e) {
    if (!selMatches(e.selector, '.stage')) return;
    e.decls.forEach(function (d) {
      if (/^padding/.test(d.prop) && d.value.indexOf('env(') > -1) {
        fail('.stage 使用 env() padding 会破坏容器查询基准：' + d.prop + '=' + d.value);
      }
    });
  });

  if (violations.length) {
    console.log('CSS 断言 FAIL（' + violations.length + ' 项）');
    violations.forEach(function (v) { console.log('  ✗ ' + v); });
    process.exit(1);
  }
  console.log('CSS 断言 PASS：' + all.length + ' 条规则，' + FILES.length + ' 个文件');
}

main();
