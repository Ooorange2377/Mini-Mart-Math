/* 纯规则函数：星级评定、零花钱、递减倍率、章节解锁、皮肤解锁、文案。
 * 全部无副作用，输入输出均基于「分」的整数金额。 */
window.ZQ = window.ZQ || {};

ZQ.rules = {
  /** 剩余比例 Q（0~1 之间的小数），入参单位：分 */
  Q: function (T, B) {
    if (B <= 0) return 1;
    return (B - T) / B;
  },

  /**
   * 星级：Q=0 → 3星；0<Q≤5% → 2星；5%<Q≤10% → 1星；Q>10% → 0星
   * 仅在 T ≤ B（未超支）时结算。
   */
  starOf: function (T, B) {
    if (T > B) return 0;
    if (T === B) return 3;
    var q = ZQ.rules.Q(T, B);
    if (q <= 0.05) return 2;
    if (q <= 0.10) return 1;
    return 0;
  },

  /** 递减倍率：clearIndex 为「本次之前」该关已成功通关的次数 */
  decayMul: function (clearIndex) {
    var i = Math.max(0, Math.min(ZQ.DECAY_MUL.length - 1, clearIndex | 0));
    return ZQ.DECAY_MUL[i];
  },

  /**
   * 零花钱奖励拆分：
   * - changeCoins：1/2 星按节省金额发放的找零
   * - momBonus：首次 3 星获得的妈妈奖励金
   */
  coinsAward: function (T, B, star, clearIndex, momBonus) {
    var changeCoins = 0;
    if (star === 1 || star === 2) {
      var base = Math.ceil((B - T) / 100);      // 向上取整到整数元
      changeCoins = Math.round(base * ZQ.rules.decayMul(clearIndex));
      if (changeCoins < 0) changeCoins = 0;
    }
    var bonus = star === 3 && momBonus ? momBonus : 0;
    return {
      changeCoins: changeCoins,
      momBonus: bonus,
      total: changeCoins + bonus,
    };
  },

  /** 本次结算发放的零花钱总数 */
  coinsOf: function (T, B, star, clearIndex, momBonus) {
    return ZQ.rules.coinsAward(T, B, star, clearIndex, momBonus).total;
  },

  /**
   * 章节是否已解锁：累计星数达标，且前置章节已经全部通关。
   * previousChapterCleared 由存档层根据实际通关记录传入。
   */
  chapterUnlocked: function (chapterId, totalStars, previousChapterCleared) {
    for (var i = 0; i < ZQ.CHAPTERS.length; i++) {
      if (ZQ.CHAPTERS[i].id === chapterId) {
        var need = ZQ.CHAPTERS[i].unlockAt;
        var starsOk = need === null || totalStars >= need;
        return starsOk && previousChapterCleared !== false;
      }
    }
    return false;
  },

  /** 还差多少星解锁某章节 */
  chapterStarsNeeded: function (chapterId, totalStars) {
    for (var i = 0; i < ZQ.CHAPTERS.length; i++) {
      if (ZQ.CHAPTERS[i].id === chapterId) {
        var need = ZQ.CHAPTERS[i].unlockAt;
        if (need === null) return 0;
        return Math.max(0, need - totalStars);
      }
    }
    return 0;
  },

  /** 皮肤解锁判定（按三星通关数），返回已解锁的皮肤 id 集合对象 */
  unlockedSkins: function (threeStarCount) {
    var map = {};
    for (var i = 0; i < ZQ.SKINS.length; i++) {
      map[ZQ.SKINS[i].id] = threeStarCount >= ZQ.SKINS[i].need;
    }
    return map;
  },

  /** 星级对应鼓励话术 */
  resultText: function (star) {
    return ZQ.I18N.resultText[star] || '';
  },

  /** 星级对应结果词（失败/成功/完美） */
  resultWord: function (star) {
    return ZQ.I18N.resultStars[star] || '';
  },

  /**
   * 校验购物车是否满足本关件数与品类要求，并计算星级。
   * 无效购物车始终为 0 星，避免错误件数/品类命中预算后获得奖励。
   * @param {Array<object>} selectedItems 已选商品（含 category / price）
   * @param {object} lv 关卡实例（含 n / constraint / budget）
   */
  evaluateSelection: function (selectedItems, lv) {
    var items = selectedItems || [];
    var total = 0;
    for (var i = 0; i < items.length; i++) total += items[i].price || 0;

    var need = lv && lv.n ? lv.n : items.length;
    var countOk = items.length === need;
    var constraintOk = ZQ.rules.satisfiesConstraint(items, lv && lv.constraint);
    var valid = countOk && constraintOk;
    var star = valid ? ZQ.rules.starOf(total, lv.budget) : 0;
    var invalidReason = countOk ? (constraintOk ? null : 'constraint') : 'count';

    return {
      total: total,
      need: need,
      count: items.length,
      countOk: countOk,
      constraintOk: constraintOk,
      valid: valid,
      star: star,
      invalidReason: invalidReason,
    };
  },

  /** 品类约束的展示文案：如「日用品 × 1 · 零食 × 2」 */
  constraintLabel: function (constraint) {
    if (!constraint || !constraint.length) return '';
    return constraint.map(function (c) {
      return ZQ.CATEGORY_NAMES[c.category] + ' × ' + c.count;
    }).join(' · ');
  },

  /**
   * 组合是否满足品类约束（constraint 为 [{category,count}]，件数须恰好等于 n）
   */
  satisfiesConstraint: function (items, constraint) {
    if (!constraint || !constraint.length) return true;
    var cnt = {};
    for (var i = 0; i < items.length; i++) {
      cnt[items[i].category] = (cnt[items[i].category] || 0) + 1;
    }
    for (var j = 0; j < constraint.length; j++) {
      if ((cnt[constraint[j].category] || 0) !== constraint[j].count) return false;
    }
    // 不得出现约束之外的额外品类
    var allowed = {};
    for (var k = 0; k < constraint.length; k++) allowed[constraint[k].category] = true;
    for (var c in cnt) if (!allowed[c]) return false;
    return true;
  },
};
