/* 存档：localStorage 读写、版本迁移、派生值（总星数 / 三星通关数 / 解锁态）。 */
window.ZQ = window.ZQ || {};

(function () {
  var KEY = 'zqdz_save_v1';
  var VERSION = 4;

  /** v1（40 关）到 v2（42 关）的关卡编号迁移。 */
  function migratedLevelId(id) {
    if (!isFinite(id) || id < 1) return id;
    if (id <= 6) return id;
    if (id <= 26) return id + 1;
    if (id <= 40) return id + 2;
    return id;
  }

  function remapLevelMap(map, transformValue) {
    var next = {};
    for (var key in map) {
      if (!Object.prototype.hasOwnProperty.call(map, key)) continue;
      var oldId = parseInt(key, 10);
      if (!isFinite(oldId)) {
        next[key] = transformValue ? transformValue(map[key], key) : map[key];
        continue;
      }
      var newId = migratedLevelId(oldId);
      next[newId] = transformValue ? transformValue(map[key], newId) : map[key];
    }
    return next;
  }

  function migrateLevelIds(save) {
    save.levelStars = remapLevelMap(save.levelStars);
    save.threeStarLedger = remapLevelMap(save.threeStarLedger);
    save.clearCounts = remapLevelMap(save.clearCounts);
    save.fixedQuestions = remapLevelMap(save.fixedQuestions, function (question, levelId) {
      if (!question || typeof question !== 'object') return question;
      question.levelId = levelId;
      var chapter = ZQ.chapterOf(levelId);
      if (chapter) question.chapter = chapter.id;
      return question;
    });
  }

  /** v2 及更早存档：已获得三星的关卡补发一次妈妈奖励金。 */
  function migrateMomBonuses(save) {
    var granted = 0;
    for (var key in save.threeStarLedger) {
      if (!Object.prototype.hasOwnProperty.call(save.threeStarLedger, key)) continue;
      if (!save.threeStarLedger[key]) continue;
      var levelId = parseInt(key, 10);
      if (!isFinite(levelId) || save.momBonusLedger[levelId]) continue;
      save.momBonusLedger[levelId] = true;
      granted++;
    }
    if (granted > 0) save.coins += granted * ZQ.MOM_BONUS_COINS;
  }

  function previousChapterOf(chapterId) {
    for (var i = 0; i < ZQ.CHAPTERS.length; i++) {
      if (ZQ.CHAPTERS[i].id === chapterId) {
        return i > 0 ? ZQ.CHAPTERS[i - 1] : null;
      }
    }
    return null;
  }

  /** v3 及更早存档：旧存钱罐皮肤下线后迁移到当前可用款式。 */
  function migratePigSkins(save) {
    if (!save.equipped || typeof save.equipped !== 'object') return;
    if (save.equipped.pig === 'zhaocai') save.equipped.pig = 'luckycat';
    else if (save.equipped.pig === 'xiaohua' || save.equipped.pig === 'space') save.equipped.pig = 'glass';
  }

  /** 门槛调整后，旧存档里已装备但当前仍锁定的皮肤回退到默认款。 */
  function sanitizeEquippedSkins(save) {
    if (!save.equipped || typeof save.equipped !== 'object' || !ZQ.rules) return;
    var three = 0;
    for (var key in save.threeStarLedger) {
      if (save.threeStarLedger[key]) three++;
    }
    var unlocked = ZQ.rules.unlockedSkins(three);
    if (!unlocked[save.equipped.cart]) save.equipped.cart = 'silver';
    if (!unlocked[save.equipped.pig]) save.equipped.pig = 'glass';
  }

  function defaultSave() {
    return {
      version: VERSION,
      levelStars: {},        // 每关历史最高星级（只增不减）
      threeStarLedger: {},   // 每关是否已计过「三星通关数」
      momBonusLedger: {},    // 每关是否已领取「妈妈奖励金」
      coins: 0,              // 零花钱
      delayCards: 0,         // 延时卡片存量
      equipped: { cart: 'silver', pig: 'glass' },
      clearCounts: {},       // 每关成功通关次数（递减倍率用）
      fixedQuestions: {},    // 未满星关卡的固定题
      tutorialSeen: {},
      settings: { sound: true },
    };
  }

  var data = null;

  function migrate(save) {
    if (!save || typeof save !== 'object') return defaultSave();
    var base = defaultSave();
    // 未知高版本存档：备份后重置，避免结构不兼容
    if (typeof save.version === 'number' && save.version > VERSION) {
      try { window.localStorage.setItem(KEY + '_backup', JSON.stringify(save)); } catch (e) {}
      return base;
    }
    for (var k in base) {
      if (!(k in save)) save[k] = base[k];
    }
    // 逐字段类型兜底
    if (typeof save.levelStars !== 'object' || !save.levelStars) save.levelStars = {};
    if (typeof save.threeStarLedger !== 'object' || !save.threeStarLedger) save.threeStarLedger = {};
    if (typeof save.momBonusLedger !== 'object' || !save.momBonusLedger) save.momBonusLedger = {};
    if (typeof save.clearCounts !== 'object' || !save.clearCounts) save.clearCounts = {};
    if (typeof save.fixedQuestions !== 'object' || !save.fixedQuestions) save.fixedQuestions = {};
    if (typeof save.tutorialSeen !== 'object' || !save.tutorialSeen) save.tutorialSeen = {};
    if (typeof save.equipped !== 'object' || !save.equipped) save.equipped = base.equipped;
    // 旧版购物车皮肤 id 迁移：机甲灰已下线 → 回落到普通银色
    if (save.equipped.cart === 'mecha') save.equipped.cart = 'silver';
    if (typeof save.coins !== 'number' || !isFinite(save.coins)) save.coins = 0;
    if (typeof save.delayCards !== 'number' || !isFinite(save.delayCards)) save.delayCards = 0;
    if (typeof save.settings !== 'object' || !save.settings) save.settings = base.settings;
    var fromVersion = typeof save.version === 'number' ? save.version : 1;
    if (fromVersion < 2) migrateLevelIds(save);
    if (fromVersion < 3) migrateMomBonuses(save);
    if (fromVersion < 4) migratePigSkins(save);
    sanitizeEquippedSkins(save);
    save.version = VERSION;
    return save;
  }

  function load() {
    var raw = null;
    try { raw = window.localStorage.getItem(KEY); } catch (e) { raw = null; }
    var parsed = null;
    if (raw) {
      try { parsed = JSON.parse(raw); } catch (e) { parsed = null; }
    }
    data = migrate(parsed);
    return data;
  }

  function save() {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(data));
    } catch (e) {
      // 存储不可用（隐私模式 / 超出配额）时静默降级为内存存档
    }
  }

  ZQ.store = {
    load: load,
    save: save,

    get data() { return data; },

    reset: function () {
      data = defaultSave();
      save();
      return data;
    },

    /** 累计历史最高星之和（只增不减，用于章节解锁） */
    totalStars: function () {
      var t = 0;
      for (var k in data.levelStars) t += (data.levelStars[k] || 0);
      return t;
    },

    /** 三星通关数（每关仅计 1 次） */
    threeStarCount: function () {
      var n = 0;
      for (var k in data.threeStarLedger) if (data.threeStarLedger[k]) n++;
      return n;
    },

    levelStars: function (levelId) {
      return data.levelStars[levelId] || 0;
    },

    /** 关卡是否已通关（历史最高星 >= 1） */
    levelCleared: function (levelId) {
      return ZQ.store.levelStars(levelId) >= 1;
    },

    /** 某章节是否已通关全部关卡 */
    chapterCleared: function (chapterId) {
      var ch = null;
      for (var i = 0; i < ZQ.CHAPTERS.length; i++) {
        if (ZQ.CHAPTERS[i].id === chapterId) { ch = ZQ.CHAPTERS[i]; break; }
      }
      if (!ch) return false;
      for (var lv = ch.range[0]; lv <= ch.range[1]; lv++) {
        if (!ZQ.store.levelCleared(lv)) return false;
      }
      return true;
    },

    /** 章节锁定详情：星数门槛与前置章节通关条件会同时校验 */
    chapterLockStatus: function (chapterId) {
      var ch = null;
      for (var i = 0; i < ZQ.CHAPTERS.length; i++) {
        if (ZQ.CHAPTERS[i].id === chapterId) { ch = ZQ.CHAPTERS[i]; break; }
      }
      if (!ch) {
        return {
          unlocked: false,
          reason: 'invalid',
          starsNeeded: 0,
          previousChapterId: 0,
          previousChapterCleared: false,
        };
      }

      var total = ZQ.store.totalStars();
      var starsNeeded = ZQ.rules.chapterStarsNeeded(ch.id, total);
      var prev = previousChapterOf(ch.id);
      var previousCleared = !prev || ZQ.store.chapterCleared(prev.id);
      var starsOk = starsNeeded === 0;
      var reason = null;
      if (!previousCleared && !starsOk) reason = 'both';
      else if (!previousCleared) reason = 'previous';
      else if (!starsOk) reason = 'stars';

      return {
        unlocked: starsOk && previousCleared,
        reason: reason,
        starsNeeded: starsNeeded,
        previousChapterId: previousCleared ? 0 : prev.id,
        previousChapterCleared: previousCleared,
      };
    },

    /** 章节是否解锁：星数门槛 + 前置章节全部通关 */
    chapterUnlocked: function (chapterId) {
      return ZQ.store.chapterLockStatus(chapterId).unlocked;
    },

    /**
     * 关卡锁定详情：章节已解锁，且全局前一关已通关。
     */
    levelLockStatus: function (levelId) {
      var ch = ZQ.chapterOf(levelId);
      if (!ch) {
        return { unlocked: false, reason: 'invalid', requiredLevel: 0, chapterId: 0, chapterStatus: null };
      }
      var chapterStatus = ZQ.store.chapterLockStatus(ch.id);
      if (!chapterStatus.unlocked) {
        return {
          unlocked: false,
          reason: 'chapter',
          requiredLevel: 0,
          chapterId: ch.id,
          chapterStatus: chapterStatus,
        };
      }
      if (levelId > ch.range[0] && !ZQ.store.levelCleared(levelId - 1)) {
        return {
          unlocked: false,
          reason: 'previous',
          requiredLevel: levelId - 1,
          chapterId: ch.id,
          chapterStatus: chapterStatus,
        };
      }
      return {
        unlocked: true,
        reason: null,
        requiredLevel: 0,
        chapterId: ch.id,
        chapterStatus: chapterStatus,
      };
    },

    /** 关卡是否可挑战：严格按全局关卡顺序解锁，不可跳关或跳章 */
    levelUnlocked: function (levelId) {
      return ZQ.store.levelLockStatus(levelId).unlocked;
    },

    /**
     * 记录一次结算。
     * @returns {{star:number, starsGained:number, firstThreeStar:boolean, momBonus:number, clearIndex:number, twoStarAdded:boolean}}
     *  - starsGained：本次相较历史最高星新增的星数（0 表示未提升）
     *  - firstThreeStar：是否「首次」获得 3 星（用于三星通关数 +1）
     *  - momBonus：本次入账的妈妈奖励金
     *  - clearIndex：本次结算在递减阶梯中的序号（用递增前的值）
     */
    recordResult: function (levelId, star) {
      var res = { star: star, starsGained: 0, firstThreeStar: false, momBonus: 0, clearIndex: 0, twoStarAdded: false, levelNowThree: false };
      var prev = ZQ.store.levelStars(levelId);
      if (star > prev) {
        res.starsGained = star - prev;
        data.levelStars[levelId] = star;
      }
      // 成功通关（星 >= 1）才计入递减计数器
      if (star >= 1) {
        res.clearIndex = data.clearCounts[levelId] || 0;
        data.clearCounts[levelId] = res.clearIndex + 1;
      } else {
        res.clearIndex = data.clearCounts[levelId] || 0;
      }
      // 首次 3 星：三星通关数 +1
      if (star === 3 && !data.threeStarLedger[levelId]) {
        data.threeStarLedger[levelId] = true;
        res.firstThreeStar = true;
      }
      if (star === 3 && data.threeStarLedger[levelId] && !data.momBonusLedger[levelId]) {
        data.momBonusLedger[levelId] = true;
        data.coins = Math.max(0, (data.coins || 0) + ZQ.MOM_BONUS_COINS);
        res.momBonus = ZQ.MOM_BONUS_COINS;
      }
      res.levelNowThree = ZQ.store.levelStars(levelId) >= 3;
      if (res.levelNowThree) {
        // 已满 3 星的关卡不再保留固定题（回刷时自动换题）
        if (data.fixedQuestions[levelId]) delete data.fixedQuestions[levelId];
      }
      res.twoStarAdded = false;
      save();
      return res;
    },

    /** 该关当前是否处于「已满 3 星」状态（回刷需换题） */
    isLevelMaxed: function (levelId) {
      return ZQ.store.levelStars(levelId) >= 3;
    },

    /** 读取未满星关卡的固定题 */
    getFixedQuestion: function (levelId) {
      return data.fixedQuestions[levelId] || null;
    },

    /** 写入固定题 */
    setFixedQuestion: function (levelId, q) {
      data.fixedQuestions[levelId] = q;
      save();
    },

    addCoins: function (n) {
      data.coins = Math.max(0, (data.coins || 0) + (n | 0));
      save();
      return data.coins;
    },

    /** 扣零花钱，成功返回 true */
    spendCoins: function (n) {
      if ((data.coins || 0) < n) return false;
      data.coins -= n;
      save();
      return true;
    },

    addCards: function (n) {
      data.delayCards = Math.max(0, (data.delayCards || 0) + (n | 0));
      save();
      return data.delayCards;
    },

    /** 消耗 1 张延时卡，成功返回 true */
    useCard: function () {
      if ((data.delayCards || 0) <= 0) return false;
      data.delayCards -= 1;
      save();
      return true;
    },

    setEquipped: function (type, skinId) {
      var unlocked = ZQ.rules.unlockedSkins(ZQ.store.threeStarCount());
      if (!unlocked[skinId]) return false;
      data.equipped[type] = skinId;
      save();
      return true;
    },

    tutorialSeen: function (key) {
      return !!data.tutorialSeen[key];
    },

    markTutorial: function (key) {
      data.tutorialSeen[key] = true;
      save();
    },

    setSound: function (on) {
      data.settings.sound = !!on;
      save();
    },
  };
})();
