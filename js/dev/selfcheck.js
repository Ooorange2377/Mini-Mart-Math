/* 出题算法自检脚本。
 * 浏览器：index.html?debug=1 时自动加载并输出到控制台
 * Node  ：node js/dev/selfcheck.js
 *
 * 校验项：
 *  1) 精准解全局唯一（Sum = B 的组合有且仅有一个）
 *  2) 精准解价格之和精确等于预算
 *  3) 精准解每件价格落在 [1/n ± rel/n] 区间内（并与品类参考价取交集）
 *  4) 所有价格均为整数「分」，尾数落在章节允许集合内，且不低于 ¥1
 *  5) 商品池件数符合配置，页数 = ceil(件数 / 12)，超过 12 件自动分页
 *  6) 存在 0 < Q ≤ 10% 的可选组合（1 星可达）
 *  7) 商品池件数曲线单调非递减
 *  8) 各章关卡数一致、章节星数门槛可达性与皮肤阈值可达性
 *  9) 标价重复度（观感统计，非硬性失败项）
 */
(function () {
  var IS_NODE = (typeof window === 'undefined');
  if (IS_NODE) {
    global.window = global;
    var b = __dirname + '/../';
    require(b + 'data/items.js');
    require(b + 'data/levels.js');
    require(b + 'data/i18n.js');
    require(b + 'core/rng.js');
    require(b + 'core/money.js');
    require(b + 'game/rules.js');
    require(b + 'game/generator.js');
  }
  window.ZQ = window.ZQ || {};

  function fail(list, levelId, msg) {
    list.push('L' + levelId + ': ' + msg);
  }

  ZQ.selfcheck = {
    /**
     * @param {number} repeats 每关重复生成的次数
     * @returns {{ok:boolean, errors:string[], stats:object}}
     */
    run: function (repeats) {
      repeats = repeats || 30;
      var errors = [];
      var stats = { levels: 0, runs: 0, uniqueFails: 0, nearFails: 0, degraded: 0, relUse: {}, dupRuns: 0, dupTotal: 0, dupWorst: 0, ms: 0 };
      var t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());

      var prevPool = -Infinity;

      for (var li = 0; li < ZQ.LEVELS.length; li++) {
        var cfg = ZQ.LEVELS[li];
        var ch = ZQ.chapterOf(cfg.id);
        var tails = ZQ.TAILS[ch.tailType];
        stats.levels++;

        if (cfg.id !== li + 1) fail(errors, cfg.id, '关卡编号应连续：期望 ' + (li + 1) + '，实际 ' + cfg.id);

        // 7) 商品池曲线单调非递减
        if (cfg.pool < prevPool) fail(errors, cfg.id, '商品池件数未单调递增：' + prevPool + ' -> ' + cfg.pool);
        prevPool = cfg.pool;

        var nearOkCount = 0;
        for (var r = 0; r < repeats; r++) {
          stats.runs++;
          var seed = (cfg.id * 1000003 + r * 7919 + 12345) >>> 0;
          var lv = ZQ.generator.generate(cfg.id, seed);
          if (!lv) { fail(errors, cfg.id, '生成失败（返回 null）'); stats.uniqueFails++; continue; }
          if (lv.degraded) stats.degraded++;
          stats.relUse[lv.rel] = (stats.relUse[lv.rel] || 0) + 1;

          // 9) 标价重复度（同一关内出现相同标价的数量）
          var priceSeen = {}, dup = 0;
          for (var pi = 0; pi < lv.items.length; pi++) {
            var pv = lv.items[pi].price;
            if (priceSeen[pv]) dup++; else priceSeen[pv] = true;
          }
          if (dup > 0) { stats.dupRuns++; stats.dupTotal += dup; if (dup > stats.dupWorst) stats.dupWorst = dup; }

          // 5) 件数与页数
          if (lv.items.length !== cfg.pool) fail(errors, cfg.id, '件数 ' + lv.items.length + ' ≠ 配置 ' + cfg.pool);
          var pages = Math.ceil(cfg.pool / ZQ.SLOTS_PER_PAGE);
          if (lv.pages !== pages) fail(errors, cfg.id, '页数 ' + lv.pages + ' ≠ ' + pages);
          if (cfg.pool > ZQ.SLOTS_PER_PAGE && lv.pages < 2) fail(errors, cfg.id, '超过 12 件应为 2 页以上');
          if (cfg.pool <= ZQ.SLOTS_PER_PAGE && lv.pages !== 1) fail(errors, cfg.id, '不超过 12 件应为 1 页');

          // 8) 预算落在配置区间内
          var bLo = ZQ.money.toCents(cfg.budget[0]);
          var bHi = ZQ.money.toCents(cfg.budget[1]);
          if (lv.budget < bLo || lv.budget > bHi) {
            fail(errors, cfg.id, '预算 ' + ZQ.money.fmt2(lv.budget) + ' 超出区间 [' + ZQ.money.fmt2(bLo) + ',' + ZQ.money.fmt2(bHi) + ']');
          }

          // 4) 价格合法性
          var ratioHalf = lv.rel / cfg.n;
          var ratioLo = Math.max(100, Math.ceil(lv.budget * (1 / cfg.n - ratioHalf)));
          var ratioHi = Math.floor(lv.budget * (1 / cfg.n + ratioHalf));
          for (var i = 0; i < lv.items.length; i++) {
            var p = lv.items[i].price;
            if (!Number.isInteger(p)) fail(errors, cfg.id, '价格非整数分：' + p);
            if (p < 100) fail(errors, cfg.id, '价格低于 ¥1：' + p);
            if (tails.indexOf(p % 100) === -1) {
              fail(errors, cfg.id, '价格尾数越界：' + ZQ.money.fmt2(p) + '（允许 ' + tails.join('/') + '）');
            }
            var cr = ZQ.CAT_RANGE[lv.items[i].category];
            // 品类参考价为软约束：仅当它与本关占比区间有交集时要求价格落在交集中。
            var categoryApplies = cr && !(cr[1] < ratioLo || cr[0] > ratioHi);
            if (categoryApplies && (p < cr[0] || p > cr[1])) {
              fail(errors, cfg.id, '价格超出品类参考价：' + lv.items[i].name + ' ' + ZQ.money.fmt2(p) + ' ∈ [' + ZQ.money.fmt2(cr[0]) + ',' + ZQ.money.fmt2(cr[1]) + ']');
            }
          }

          // 1) 唯一性 + 6) 近解可达
          var a = ZQ.generator.analyze(lv.items, cfg.n, cfg.constraint, lv.budget);
          if (a.exact.length !== 1) {
            fail(errors, cfg.id, '精准解不唯一：Sum=B 的组合数 = ' + a.exact.length);
            stats.uniqueFails++;
          }
          if (a.nearCount < 1) stats.nearFails++; else nearOkCount++;

          // 2) 精准解求和 = 预算
          var key = lv.solutionKey.split(',').map(Number);
          var sum = 0;
          for (var k = 0; k < key.length; k++) sum += lv.items[key[k]].price;
          if (sum !== lv.budget) {
            fail(errors, cfg.id, '精准解之和 ' + ZQ.money.fmt2(sum) + ' ≠ 预算 ' + ZQ.money.fmt2(lv.budget));
          }

          // 3) 精准解价格落在占比区间（并与品类参考价取交集）
          var n = cfg.n;
          var half = lv.rel / n;
          var loAbs = Math.max(100, Math.ceil(lv.budget * (1 / n - half)));
          var hiAbs = Math.floor(lv.budget * (1 / n + half));
          for (var m = 0; m < key.length; m++) {
            var it = lv.items[key[m]];
            var c2 = ZQ.CAT_RANGE[it.category] || [0, Infinity];
            var l2 = Math.max(loAbs, c2[0]), h2 = Math.min(hiAbs, c2[1]);
            if (l2 > h2) { l2 = loAbs; h2 = hiAbs; }
            if (it.price < l2 || it.price > h2) {
              fail(errors, cfg.id, '精准解单品越界：' + it.name + ' ' + ZQ.money.fmt2(it.price) +
                ' ∉ [' + ZQ.money.fmt2(l2) + ',' + ZQ.money.fmt2(h2) + ']');
            }
          }

          // 精准解品类构成必须恰好满足约束
          var solItems = key.map(function (idx) { return lv.items[idx]; });
          if (!ZQ.rules.satisfiesConstraint(solItems, cfg.constraint)) {
            fail(errors, cfg.id, '精准解不满足品类约束');
          }
        }

        if (nearOkCount === 0 && repeats > 0) {
          fail(errors, cfg.id, '全部 ' + repeats + ' 次生成均无 0<Q≤10% 的近解（1 星不可达）');
        }
      }

      // 8) 章节门槛与皮肤阈值可达性
      var cum = 0;
      var lines = [];
      for (var ci = 0; ci < ZQ.CHAPTERS.length; ci++) {
        var c = ZQ.CHAPTERS[ci];
        var levelCount = c.range[1] - c.range[0] + 1;
        if (levelCount !== ZQ.LEVELS_PER_CHAPTER) {
          fail(errors, 0, '第 ' + c.id + ' 章有 ' + levelCount + ' 关，应为 ' + ZQ.LEVELS_PER_CHAPTER + ' 关');
        }
        if (c.maxStars !== levelCount * 3) {
          fail(errors, 0, '第 ' + c.id + ' 章满星上限 ' + c.maxStars + ' ≠ ' + (levelCount * 3));
        }
        if (c.unlockAt !== null && c.unlockAt > cum) {
          fail(errors, 0, '第 ' + c.id + ' 章门槛 ' + c.unlockAt + ' 星 超过此前累计上限 ' + cum);
        }
        lines.push('  第' + c.id + '章 ' + c.name + '：关 ' + c.range[0] + '~' + c.range[1] +
          '，本章满星 ' + c.maxStars + '，进入门槛 ' + (c.unlockAt === null ? '无' : c.unlockAt) +
          '，所需平均星级 ' + (c.unlockAt === null ? '-' : (c.unlockAt / cum).toFixed(2)));
        cum += c.maxStars;
      }
      var maxThree = ZQ.LEVELS.length;
      for (var si = 0; si < ZQ.SKINS.length; si++) {
        if (ZQ.SKINS[si].need > maxThree) fail(errors, 0, '皮肤 ' + ZQ.SKINS[si].name + ' 阈值 ' + ZQ.SKINS[si].need + ' 超过关卡数');
      }

      stats.ms = Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0);
      stats.chapterLines = lines;
      stats.maxStars = cum;
      return { ok: errors.length === 0, errors: errors, stats: stats };
    },

    /** 输出到控制台（浏览器/Node 通用） */
    report: function (repeats) {
      var res = ZQ.selfcheck.run(repeats);
      var s = res.stats;
      var lines = [];
      lines.push('');
      lines.push('===== 出题算法自检 =====');
      lines.push('关卡数 ' + s.levels + '，每关生成 ' + (repeats || 30) + ' 次，共 ' + s.runs + ' 题，耗时 ' + s.ms + 'ms');
      lines.push('精准解不唯一次数：' + s.uniqueFails + '（必须为 0）');
      lines.push('无近解次数：' + s.nearFails + '（1 星不可达，允许但应尽量少）');
      lines.push('降级兜底次数：' + s.degraded + '（必须为 0）');
      lines.push('占比容差 rel 分布：' + JSON.stringify(s.relUse));
      lines.push('标价重复：出现在 ' + s.dupRuns + '/' + s.runs + ' 题中，重复标价合计 ' + s.dupTotal +
        ' 个，单题最多重复 ' + s.dupWorst + ' 个（观感指标，越低越好）');
      lines.push('章节门槛验算：');
      for (var i = 0; i < s.chapterLines.length; i++) lines.push(s.chapterLines[i]);
      lines.push(ZQ.LEVELS.length + ' 关满星上限合计：' + s.maxStars);
      if (res.ok) {
        lines.push('结果：PASS ✓');
      } else {
        lines.push('结果：FAIL ✗ 共 ' + res.errors.length + ' 项，前 40 项：');
        for (var j = 0; j < Math.min(40, res.errors.length); j++) lines.push('  - ' + res.errors[j]);
      }
      lines.push('========================');
      var text = lines.join('\n');
      if (typeof console !== 'undefined' && console.log) console.log(text);
      return res;
    },
  };

  if (IS_NODE) {
    var r = ZQ.selfcheck.report(30);
    process.exit(r.ok ? 0 : 1);
  }
})();
