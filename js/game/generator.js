/* 出题算法：给定关卡配置，确定性生成满足「精准解全局唯一」的题目。
 *
 * 核心约束：
 *  1. 精准解唯一——在所有「件数 = n 且满足品类约束」的组合中，Sum = B 的组合有且仅有一个。
 *  2. 允许存在 Q ≤ 5% 的近似组合（部分选中精准解 / 替换其中 1 件），这是 2 星的正常获得路径。
 *  3. 存在至少 1 个 0 < Q ≤ 10% 的可选组合，保证 1 星可达（极端关卡允许降级为软要求）。
 *
 * 金额一律用「分」整数运算，杜绝浮点误差。
 * 取价占比区间 = 1/n × [1 - rel, 1 + rel]（rel 从 0.2 起，不可行时逐步放宽，见方案第十一节）。
 */
window.ZQ = window.ZQ || {};

(function () {
  /* 取价占比区间 = 1/n × [1 - rel, 1 + rel]，与方案 5.2 节 [0.8/n, 1.2/n] 等价（rel = 0.2）。
   * 数学上不可行时才逐步放宽 rel。 */
  var REL_STEPS = [0.2, 0.25, 0.3, 0.4];
  var CATS = ['drink', 'snack', 'daily', 'seasoning'];

  /* ---------- 基础工具 ---------- */

  /** 枚举 size 个尾数之和 mod 100 的全部可能取值 */
  function achievableTails(tails, size) {
    var set = {};
    (function rec(pos, sum) {
      if (pos === size) { set[sum % 100] = true; return; }
      for (var i = 0; i < tails.length; i++) rec(pos + 1, sum + tails[i]);
    })(0, 0);
    return set;
  }

  /** 在预算区间内取一个 B（分），要求 B % 100 落在可达尾数集合中 */
  function pickBudget(rangeYuan, achievable, rng) {
    var lo = ZQ.money.toCents(rangeYuan[0]);
    var hi = ZQ.money.toCents(rangeYuan[1]);
    var cands = [];
    for (var v = lo; v <= hi; v++) {
      if (achievable[v % 100]) cands.push(v);
    }
    if (!cands.length) {
      // 区间内没有任何可达尾数（理论上不会发生）：退化为区间内任意值
      return lo + Math.floor(rng() * (hi - lo + 1));
    }
    return cands[Math.floor(rng() * cands.length)];
  }

  /** 找一组尾数分配：n 件，和为 B % 100（mod 100）。返回长度 n 的数组或 null */
  function findTailAllocation(tails, n, mod, rng) {
    var results = [];
    (function rec(pos, sum, acc) {
      if (results.length >= 40) return;
      if (pos === n) {
        if (sum % 100 === mod) results.push(acc.slice());
        return;
      }
      for (var i = 0; i < tails.length; i++) {
        acc.push(tails[i]);
        rec(pos + 1, sum + tails[i], acc);
        acc.pop();
      }
    })(0, 0, []);
    if (!results.length) return null;
    return results[Math.floor(rng() * results.length)];
  }

  /** 生成 size 个下标的全组合（数组形式） */
  function combinations(arr, size) {
    var out = [];
    (function rec(start, acc) {
      if (acc.length === size) { out.push(acc.slice()); return; }
      for (var i = start; i < arr.length; i++) {
        acc.push(arr[i]);
        rec(i + 1, acc);
        acc.pop();
      }
    })(0, []);
    return out;
  }

  /* ---------- 商品池布局 ---------- */

  /** 为每个陈列位分配「层」与「层所属品类」 */
  function buildSlots(poolSize) {
    var slots = [];
    for (var i = 0; i < poolSize; i++) {
      var layer = Math.floor(i / ZQ.ITEMS_PER_LAYER);
      slots.push({
        index: i,
        layer: layer,
        category: ZQ.LAYER_CATEGORIES[Math.min(layer, ZQ.LAYER_CATEGORIES.length - 1)],
      });
    }
    return slots;
  }

  /** 选出精准解所在的槽位下标（满足品类约束；无约束则随机取 n 个） */
  function pickSolutionSlots(slots, constraint, n, rng) {
    if (!constraint || !constraint.length) {
      return rng.shuffle(slots.map(function (s) { return s.index; })).slice(0, n).sort(function (a, b) { return a - b; });
    }
    var byCat = {};
    slots.forEach(function (s) { (byCat[s.category] = byCat[s.category] || []).push(s.index); });
    var acc = [];
    for (var i = 0; i < constraint.length; i++) {
      var list = byCat[constraint[i].category] || [];
      if (list.length < constraint[i].count) return null;
      acc = acc.concat(rng.shuffle(list).slice(0, constraint[i].count));
    }
    if (acc.length !== n) return null;
    return acc.sort(function (a, b) { return a - b; });
  }

  /** 按层品类抽取商品填充商品池（同一关卡内不重复） */
  function fillItems(slots, rng) {
    var pools = {};
    CATS.forEach(function (c) {
      pools[c] = rng.shuffle(ZQ.ITEMS.filter(function (it) { return it.category === c; }));
    });
    var ptr = { drink: 0, snack: 0, daily: 0, seasoning: 0 };
    var globalUsed = {};
    var globalPool = rng.shuffle(ZQ.ITEMS.slice());
    return slots.map(function (s) {
      var pool = pools[s.category];
      var it = null;
      while (ptr[s.category] < pool.length) {
        var cand = pool[ptr[s.category]++];
        if (!globalUsed[cand.id]) { it = cand; break; }
      }
      if (!it) {
        // 兜底：该品类商品不足时从全局未使用池补位（正常规模下不会触发）
        for (var i = 0; i < globalPool.length; i++) {
          if (!globalUsed[globalPool[i].id]) { it = globalPool[i]; break; }
        }
      }
      if (!it) return null;
      globalUsed[it.id] = true;
      return {
        itemId: it.id,
        name: it.name,
        category: s.category,
        layer: s.layer,
        slot: s.index,
        price: 0,
        isSolution: false,
      };
    });
  }

  /* ---------- 定价 ---------- */

  /**
   * 精准解定价（整元水填充）：返回长度 n 的价格数组，使 Σ = B 且每件落在 1/n × [1-rel, 1+rel] 内
   * @param solSlots 精准解槽位（含 category）
   * @param tails    尾数候选分配（长度 n）
   */
  function fillYuan(solSlots, B, n, tails, rel, rng) {
    var half = rel / n;
    var loAbs = Math.max(100, Math.ceil(B * (1 / n - half)));
    var hiAbs = Math.floor(B * (1 / n + half));
    if (hiAbs < loAbs) return null;

    for (var sh = 0; sh < 40; sh++) {
      var ta = sh === 0 ? tails.slice() : rng.shuffle(tails.slice());
      var wmin = [], wmax = [], ok = true;
      for (var i = 0; i < n; i++) {
        var cr = ZQ.CAT_RANGE[solSlots[i].category] || [0, Infinity];
        var l = Math.max(loAbs, cr[0]);
        var h = Math.min(hiAbs, cr[1]);
        if (l > h) { l = loAbs; h = hiAbs; }   // 品类软约束：交集为空时以占比区间为准
        var a = Math.ceil((l - ta[i]) / 100);
        var b = Math.floor((h - ta[i]) / 100);
        if (a < 0) a = 0;
        if (b < a) { ok = false; break; }
        wmin.push(a); wmax.push(b);
      }
      if (!ok) continue;

      var sumT = ta.reduce(function (s, v) { return s + v; }, 0);
      var rem = B - sumT;
      if (rem < 0 || rem % 100 !== 0) continue;
      var yuan = rem / 100;
      var baseSum = wmin.reduce(function (s, v) { return s + v; }, 0);
      var capSum = wmax.reduce(function (s, v) { return s + v; }, 0);
      if (yuan < baseSum || yuan > capSum) continue;

      var w = wmin.slice();
      var rest = yuan - baseSum;
      var guard = 0;
      while (rest > 0 && guard < 100000) {
        guard++;
        var room = [];
        for (var j = 0; j < n; j++) if (w[j] < wmax[j]) room.push(j);
        if (!room.length) break;
        w[room[Math.floor(rng() * room.length)]]++;
        rest--;
      }
      if (rest !== 0) continue;

      var prices = [];
      for (var k = 0; k < n; k++) prices.push(w[k] * 100 + ta[k]);

      // 观感打散：n ≥ 3 且各件标价全同时，尝试在区间内做「一件 −1 元、另一件 +1 元」的微调
      if (n >= 3 && prices.every(function (p) { return p === prices[0]; })) {
        for (var i2 = 0; i2 < n; i2++) {
          if (ta[i2] !== ta[0]) continue;
          for (var j2 = 0; j2 < n; j2++) {
            if (j2 === i2 || ta[j2] !== ta[i2]) continue;
            if (w[i2] - 1 < wmin[i2] || w[j2] + 1 > wmax[j2]) continue;
            var spread = prices.slice();
            spread[i2] -= 100;
            spread[j2] += 100;
            return spread;
          }
        }
      }
      return prices;
    }
    return null;
  }

  /** 按尾数类型把价格对齐到允许尾数 */
  function snapTail(cents, tails) {
    var t = cents % 100;
    var best = tails[0], bd = Infinity;
    for (var i = 0; i < tails.length; i++) {
      var d = Math.abs(tails[i] - t);
      if (d < bd) { bd = d; best = tails[i]; }
    }
    var base = Math.floor(cents / 100) * 100;
    var p = base + best;
    if (p < 100) p = 100 + best;
    return p;
  }

  /** 干扰项定价：分布在品类参考价内较宽的价格带，优先取不与池内重复、且不贴近精准解价格的值 */
  function priceDistractors(items, solIdx, solPrices, B, n, tails, rng) {
    var avg = B / n;
    var lo = Math.max(100, Math.round(avg * 0.45));
    var hi = Math.max(lo, Math.round(avg * 2.2));
    var used = {};
    for (var s = 0; s < solPrices.length; s++) used[solPrices[s]] = true;

    function nearSolution(p) {
      for (var k = 0; k < solPrices.length; k++) {
        if (Math.abs(p - solPrices[k]) <= 100) return true;
      }
      return false;
    }

    for (var i = 0; i < items.length; i++) {
      if (solIdx.indexOf(i) !== -1) continue;
      var cr = ZQ.CAT_RANGE[items[i].category] || [100, Infinity];
      var catLo = Math.max(lo, cr[0]);
      var catHi = Math.min(hi, cr[1]);
      if (catLo > catHi) { catLo = Math.max(100, cr[0]); catHi = cr[1]; }

      var c1 = null, c2 = null, c3 = null;
      for (var t = 0; t < 30; t++) {
        var raw = catLo + Math.floor(rng() * (catHi - catLo + 1));
        var p = snapTail(raw, tails);
        if (p < cr[0]) p = snapTail(cr[0] + 99, tails);
        if (p > cr[1]) p = snapTail(cr[1], tails);
        if (p < 100) p = 100 + tails[0];
        var isUsed = !!used[p];
        var isNear = nearSolution(p);
        if (!isUsed && !isNear) { if (!c1) c1 = p; }
        else if (!isUsed) { if (!c2) c2 = p; }
        else { if (!c3) c3 = p; }
        if (c1 && c2) break;
      }
      var chosen = c1 || c2 || c3 || snapTail(Math.max(100, cr[0]), tails);
      if (chosen < cr[0]) chosen = snapTail(cr[0] + 99, tails);
      if (chosen > cr[1]) chosen = snapTail(cr[1], tails);
      if (chosen < 100) chosen = 100 + tails[0];
      used[chosen] = true;
      items[i].price = chosen;
    }
  }

  /* ---------- 校验 ---------- */

  /** 枚举所有满足约束的组合下标（剪枝：按品类约束分组求笛卡尔积） */
  function enumerateValidCombos(items, n, constraint) {
    var all = items.map(function (_, i) { return i; });
    if (!constraint || !constraint.length) return combinations(all, n);

    var byCat = {};
    items.forEach(function (it, i) { (byCat[it.category] = byCat[it.category] || []).push(i); });
    var groups = constraint.map(function (c) {
      return combinations(byCat[c.category] || [], c.count);
    });
    var out = [];
    (function rec(g, acc) {
      if (g === groups.length) { out.push(acc.slice()); return; }
      for (var i = 0; i < groups[g].length; i++) {
        var next = acc.concat(groups[g][i]);
        rec(g + 1, next);
      }
    })(0, []);
    return out;
  }

  function sumPrice(items, combo) {
    var s = 0;
    for (var i = 0; i < combo.length; i++) s += items[combo[i]].price;
    return s;
  }

  /** 统计：精准解组合数量 + 可用近解（0 < Q ≤ 10%）组合数量 */
  function analyze(items, n, constraint, B) {
    var combos = enumerateValidCombos(items, n, constraint);
    var exact = [], near = 0;
    for (var i = 0; i < combos.length; i++) {
      var s = sumPrice(items, combos[i]);
      if (s > B) continue;                       // 超支组合在操作层面被拦截，不计
      if (s === B) exact.push(combos[i]);
      else if ((B - s) / B <= 0.10) near++;
    }
    return { exact: exact, nearCount: near, total: combos.length };
  }

  /**
   * 局部修复：当出现第二个精准解组合时，调整该组合里一个「非精准解」商品的价格，
   * 使其不再落入该组合。反复迭代直到唯一或达到上限。
   *
   * 选价优先级（避免破坏观感）：
   *   ① 池内未用过、且不紧贴精准解价格（不落入解价 ±1 元）；
   *   ② 池内未用过；
   *   ③ 任意合法值。
   * 价格一律落在品类参考价区间内。
   */
  function repairUniqueness(items, n, constraint, B, solIdx, tails, maxIter, rng) {
    var visited = {};
    var solPrices = solIdx.map(function (i) { return items[i].price; });

    function usedByOthers(idx, p) {
      for (var i = 0; i < items.length; i++) {
        if (i !== idx && items[i].price === p) return true;
      }
      return false;
    }
    function nearSol(p) {
      for (var k = 0; k < solPrices.length; k++) {
        if (Math.abs(p - solPrices[k]) <= 100) return true;
      }
      return false;
    }

    for (var iter = 0; iter < maxIter; iter++) {
      var a = analyze(items, n, constraint, B);
      if (a.exact.length === 1) return a;
      if (a.exact.length === 0) return null;      // 精准解被改坏，放弃本次
      // 取一个非精准解的组合（含至少 1 个干扰项）
      var other = null;
      for (var i = 0; i < a.exact.length; i++) {
        if (a.exact[i].join(',') !== solIdx.join(',')) { other = a.exact[i]; break; }
      }
      if (!other) return a;
      var target = -1;
      for (var j = 0; j < other.length; j++) {
        if (solIdx.indexOf(other[j]) === -1) { target = other[j]; break; }
      }
      if (target === -1) return null;
      var cr = ZQ.CAT_RANGE[items[target].category] || [100, Infinity];
      var cur = items[target].price;

      // 候选集合：双向步长 + 品类区间内随机采样
      var cands = [];
      var steps = [-100, 100, -200, 200, -300, 300, -400, 400, -500, 500, -700, 700];
      for (var k = 0; k < steps.length; k++) {
        cands.push(snapTail(cur + steps[k], tails));
      }
      var span = Math.max(0, cr[1] - cr[0]);
      for (var s = 0; s < 24; s++) {
        cands.push(snapTail(cr[0] + Math.floor(rng() * (span + 1)), tails));
      }

      var best = -1, bestTier = 9;
      for (var m = 0; m < cands.length; m++) {
        var p = cands[m];
        if (p < cr[0] || p > cr[1]) continue;
        if (p === cur) continue;
        var sig = target + ':' + p;
        if (visited[sig]) continue;
        var tier = usedByOthers(target, p) ? (nearSol(p) ? 3 : 2) : (nearSol(p) ? 1 : 0);
        if (tier < bestTier) { bestTier = tier; best = p; if (tier === 0) break; }
      }
      if (best < 0) return null;
      visited[target + ':' + best] = true;
      items[target].price = best;
    }
    var fin = analyze(items, n, constraint, B);
    return fin.exact.length === 1 ? fin : null;
  }

  /* ---------- 兜底关卡 ---------- */

  /** 极端兜底：精准解按占比区间定价，干扰项全部压到最低价，保证不产生第二个精准解 */
  function degenerateLevel(levelId, cfg, ch, achievable, rng) {
    var n = cfg.n;
    var tails = ZQ.TAILS[ch.tailType];
    for (var tryOuter = 0; tryOuter < 300; tryOuter++) {
      var B = pickBudget(cfg.budget, achievable, rng);
      var slots = buildSlots(cfg.pool);
      var solIdx = pickSolutionSlots(slots, cfg.constraint, n, rng);
      if (!solIdx) continue;
      var items = fillItems(slots, rng);
      if (!items) continue;
      var ta = findTailAllocation(tails, n, B % 100, rng);
      if (!ta) continue;
      var solSlots = solIdx.map(function (i) { return items[i]; });
      var prices = fillYuan(solSlots, B, n, ta, 0.4, rng);
      if (!prices) continue;
      solIdx.forEach(function (i, k) { items[i].price = prices[k]; items[i].isSolution = true; });
      // 干扰项压到品类最低价
      for (var i = 0; i < items.length; i++) {
        if (solIdx.indexOf(i) !== -1) continue;
        var cr = ZQ.CAT_RANGE[items[i].category] || [100, 200];
        var low = snapTail(Math.max(100, cr[0]), tails);
        if (low < 100) low = 100 + tails[0];
        items[i].price = low;
      }
      var a = analyze(items, n, cfg.constraint, B);
      if (a.exact.length === 1) {
        return { levelId: levelId, budget: B, items: items, solutionKey: solIdx.join(','), nearCount: a.nearCount };
      }
    }
    return null;
  }

  /* ---------- 单次尝试 ---------- */

  function tryBuild(cfg, B, rel, tails, rng) {
    var n = cfg.n;
    var slots = buildSlots(cfg.pool);
    var solIdx = pickSolutionSlots(slots, cfg.constraint, n, rng);
    if (!solIdx) return null;
    var items = fillItems(slots, rng);
    if (!items) return null;

    var ta = findTailAllocation(tails, n, B % 100, rng);
    if (!ta) return null;
    var solSlots = solIdx.map(function (i) { return items[i]; });
    var prices = fillYuan(solSlots, B, n, ta, rel, rng);
    if (!prices) return null;
    solIdx.forEach(function (i, k) { items[i].price = prices[k]; items[i].isSolution = true; });

    priceDistractors(items, solIdx, prices, B, n, tails, rng);

    var a = analyze(items, n, cfg.constraint, B);
    if (a.exact.length !== 1) {
      a = repairUniqueness(items, n, cfg.constraint, B, solIdx, tails, 300, rng);
      if (!a) return null;
    }
    return {
      levelId: cfg.id,
      budget: B,
      items: items,
      solutionKey: solIdx.join(','),
      nearCount: a.nearCount,
    };
  }

  /* ---------- 对外接口 ---------- */

  ZQ.generator = {
    REL_STEPS: REL_STEPS,

    /**
     * 生成一关题目。
     * @param {number} levelId 关卡编号 1~42
     * @param {number} seed    随机种子（可复现）
     * @returns {object|null}  关卡实例（含 budget / n / items / solutionKey / pages 等）
     */
    generate: function (levelId, seed) {
      var cfg = ZQ.levelConfig(levelId);
      var ch = ZQ.chapterOf(levelId);
      if (!cfg || !ch) return null;
      var rng = ZQ.rng.create(seed);
      var tails = ZQ.TAILS[ch.tailType];
      var achievable = achievableTails(tails, cfg.n);

      var fallbackResult = null;
      for (var di = 0; di < REL_STEPS.length; di++) {
        var rel = REL_STEPS[di];
        var passes = [true, false];   // false = 放弃 nearCount 硬性要求
        for (var pi = 0; pi < passes.length; pi++) {
          for (var outer = 0; outer < 10; outer++) {
            var B = pickBudget(cfg.budget, achievable, rng);
            for (var attempt = 0; attempt < 150; attempt++) {
              var res = tryBuild(cfg, B, rel, tails, rng);
              if (!res) continue;
              if (passes[pi] && res.nearCount < 1) {
                if (!fallbackResult) fallbackResult = res;
                continue;
              }
              delete res.nearCount;
              res.n = cfg.n;
              res.constraint = cfg.constraint;
              res.tailType = ch.tailType;
              res.chapter = ch.id;
              res.seed = seed;
              res.rel = rel;
              res.pool = cfg.pool;
              res.pages = Math.ceil(cfg.pool / ZQ.SLOTS_PER_PAGE);
              res.timeSec = cfg.timeSec;
              return res;
            }
          }
        }
      }

      // 最终兜底：优先使用「唯一性已满足但无近解」的结果，其次使用退化关卡
      var finalLv = fallbackResult;
      var finalDegraded = false;
      if (!finalLv) {
        finalLv = degenerateLevel(levelId, cfg, ch, achievable, rng);
        finalDegraded = true;
      }
      if (!finalLv) {
        finalLv = { levelId: levelId, budget: ZQ.money.toCents(cfg.budget[0]), items: [], solutionKey: '' };
        finalDegraded = true;
      }
      delete finalLv.nearCount;
      finalLv.n = cfg.n;
      finalLv.constraint = cfg.constraint;
      finalLv.tailType = ch.tailType;
      finalLv.chapter = ch.id;
      finalLv.seed = seed;
      finalLv.rel = 0.4;
      finalLv.pool = cfg.pool;
      finalLv.pages = Math.ceil(cfg.pool / ZQ.SLOTS_PER_PAGE);
      finalLv.timeSec = cfg.timeSec;
      if (finalDegraded) finalLv.degraded = true;
      return finalLv;
    },

    /** 组合枚举（供自检脚本复用） */
    enumerateValidCombos: enumerateValidCombos,
    analyze: analyze,
    combinations: combinations,
  };
})();
