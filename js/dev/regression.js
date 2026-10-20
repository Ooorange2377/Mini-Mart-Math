/* 规则 / 会话 / 存档回归测试。
 * Node：node js/dev/regression.js
 * 浏览器：index.html?debug=1 时加载，可调用 ZQ.regression.run()。
 */
(function () {
  var IS_NODE = (typeof window === 'undefined');
  var storageData = {};
  var SAVE_KEY = 'zqdz_save_v1';
  var BACKUP_KEY = SAVE_KEY + '_backup';

  if (IS_NODE) {
    global.window = global;
    global.localStorage = {
      getItem: function (key) { return Object.prototype.hasOwnProperty.call(storageData, key) ? storageData[key] : null; },
      setItem: function (key, value) { storageData[key] = String(value); },
      removeItem: function (key) { delete storageData[key]; },
      clear: function () { storageData = {}; },
    };
    var b = __dirname + '/../';
    require(b + 'data/items.js');
    require(b + 'data/levels.js');
    require(b + 'data/i18n.js');
    require(b + 'core/rng.js');
    require(b + 'core/money.js');
    require(b + 'game/rules.js');
    require(b + 'core/store.js');
    require(b + 'game/session.js');
  }

  window.ZQ = window.ZQ || {};

  function assert(ok, errors, msg) {
    if (!ok) errors.push(msg);
  }

  function item(category, price) {
    return { category: category, price: price };
  }

  function storageGet(key) {
    return window.localStorage.getItem(key);
  }

  function storageSet(key, value) {
    window.localStorage.setItem(key, String(value));
  }

  function storageRemove(key) {
    window.localStorage.removeItem(key);
  }

  ZQ.regression = {
    /** @returns {{ok:boolean, errors:string[], count:number}} */
    run: function () {
      var errors = [];
      var count = 0;

      function check(ok, msg) {
        count++;
        assert(ok, errors, msg);
      }

      // 星级边界
      check(ZQ.rules.starOf(1000, 1000) === 3, 'T=B 应为 3 星');
      check(ZQ.rules.starOf(950, 1000) === 2, 'Q=5% 应为 2 星');
      check(ZQ.rules.starOf(951, 1000) === 2, 'Q<5% 应为 2 星');
      check(ZQ.rules.starOf(900, 1000) === 1, 'Q=10% 应为 1 星');
      check(ZQ.rules.starOf(899, 1000) === 0, 'Q>10% 应为 0 星');
      check(ZQ.rules.starOf(1001, 1000) === 0, '超支应为 0 星');

      // 零花钱与递减倍率
      check(ZQ.rules.coinsOf(950, 1000, 2, 0) === 1, '2 星首通应发放 1 元零花钱');
      check(ZQ.rules.coinsOf(950, 1000, 2, 1) === 1, '第 2 次通关应按 80% 取整');
      var firstPerfect = ZQ.rules.coinsAward(1000, 1000, 3, 0, ZQ.MOM_BONUS_COINS);
      check(firstPerfect.changeCoins === 0 && firstPerfect.momBonus === 3 && firstPerfect.total === 3,
        '首次 3 星应发放 3 个妈妈奖励金');
      var repeatPerfect = ZQ.rules.coinsAward(1000, 1000, 3, 1, 0);
      check(repeatPerfect.momBonus === 0 && repeatPerfect.total === 0, '重复 3 星不应再次发放奖励金');
      check(ZQ.rules.coinsOf(1000, 1000, 3, 0, 0) === 0, '未领取奖励金时 3 星不应发放零花钱');
      check(ZQ.rules.coinsOf(899, 1000, 0, 0) === 0, '0 星不应发放零花钱');

      // 章节解锁必须同时满足星数门槛与前置章节通关条件。
      check(!ZQ.rules.chapterUnlocked(2, 99, false), '前章未通关时星数再高也不能解锁下一章');
      check(ZQ.rules.chapterUnlocked(2, 12, true), '星数达标且前章通关后应解锁下一章');

      // 购物车件数 / 品类判定
      var lv = {
        budget: 700,
        n: 2,
        constraint: [{ category: 'drink', count: 1 }, { category: 'snack', count: 1 }],
      };
      var valid = ZQ.rules.evaluateSelection([item('drink', 400), item('snack', 300)], lv);
      check(valid.valid && valid.star === 3 && valid.invalidReason === null, '正确件数+品类+预算应判定为有效三星');

      var wrongConstraint = ZQ.rules.evaluateSelection([item('drink', 400), item('drink', 300)], lv);
      check(!wrongConstraint.valid && wrongConstraint.invalidReason === 'constraint', '错误品类应判定无效');

      var wrongCount = ZQ.rules.evaluateSelection([item('drink', 400)], lv);
      check(!wrongCount.valid && wrongCount.invalidReason === 'count', '错误件数应判定无效');

      var overspend = ZQ.rules.evaluateSelection([item('drink', 400), item('snack', 400)], lv);
      check(overspend.star === 0, '超支购物车应为 0 星');

      // 会话状态：超过 n 不写入状态
      var session = ZQ.session.create({
        budget: 700,
        n: 2,
        constraint: lv.constraint,
        items: [item('drink', 400), item('snack', 300), item('daily', 100)],
      });
      check(session.toggle(0).ok, '第 1 件商品应可加入');
      check(session.toggle(1).ok, '第 2 件商品应可加入');
      var overflow = session.toggle(2);
      check(!overflow.ok && overflow.reason === 'tooMany', '超过所需件数应被拦截');
      check(session.count() === 2 && session.total === 700, '件数拦截不得改变会话状态');
      check(session.remove(0).ok && session.count() === 1, '取消选择应正确更新状态');

      // 存档默认值、旧字段补全与高版本保护；执行前快照，结束后恢复玩家存档。
      var savedRaw = storageGet(SAVE_KEY);
      var savedBackup = storageGet(BACKUP_KEY);
      storageRemove(SAVE_KEY);
      storageRemove(BACKUP_KEY);
      var loaded = ZQ.store.load();
      check(loaded.version === 4 && loaded.equipped.cart === 'silver' && loaded.equipped.pig === 'glass',
        '空存档应加载默认值');

      storageSet(SAVE_KEY, JSON.stringify({
        version: 1,
        levelStars: { 1: 3 },
        equipped: { cart: 'mecha', pig: 'xiaohua' },
      }));
      loaded = ZQ.store.load();
      check(loaded.levelStars[1] === 3, '旧存档应保留关卡星数');
      check(loaded.equipped.cart === 'silver', '旧机甲灰皮肤应迁移为普通银色');
      check(loaded.equipped.pig === 'glass', '旧小花猪皮肤应迁移为普通玻璃存钱罐');
      check(loaded.settings.sound === true, '旧存档缺失字段应补默认值');

      // v1 的 40 关编号迁移到 v2 的 42 关编号，避免新增关卡导致进度错位。
      storageSet(SAVE_KEY, JSON.stringify({
        version: 1,
        levelStars: { 6: 1, 7: 2, 20: 3, 21: 1, 26: 2, 27: 1, 40: 3 },
        threeStarLedger: { 20: true, 40: true },
        clearCounts: { 7: 4, 27: 2 },
        fixedQuestions: { 7: { levelId: 7, chapter: 2, seed: 123 } },
      }));
      loaded = ZQ.store.load();
      check(loaded.version === 4, 'v1 存档应迁移到 v4');
      check(loaded.levelStars[6] === 1 && loaded.levelStars[7] === undefined, '第 1~6 关编号应保持不变');
      check(loaded.levelStars[8] === 2, '原第 7 关应迁移到第 8 关');
      check(loaded.levelStars[21] === 3, '原第 20 关应迁移到第 21 关');
      check(loaded.levelStars[22] === 1, '原第 21 关应迁移到第 22 关');
      check(loaded.levelStars[27] === 2, '原第 26 关应迁移到第 27 关');
      check(loaded.levelStars[29] === 1, '原第 27 关应迁移到第 29 关');
      check(loaded.levelStars[42] === 3, '原第 40 关应迁移到第 42 关');
      check(loaded.threeStarLedger[21] && loaded.threeStarLedger[42], '三星记录应随关卡编号迁移');
      check(loaded.clearCounts[8] === 4 && loaded.clearCounts[29] === 2, '通关次数应随关卡编号迁移');
      check(loaded.fixedQuestions[8].levelId === 8 && loaded.fixedQuestions[8].chapter === 2,
        '固定题应随关卡编号迁移并更新关卡字段');
      check(loaded.coins === 6 && loaded.momBonusLedger[21] && loaded.momBonusLedger[42],
        '已有三星关卡应补发一次妈妈奖励金');

      storageSet(SAVE_KEY, JSON.stringify({
        version: 2,
        threeStarLedger: { 5: true, 6: true },
        coins: 7,
      }));
      loaded = ZQ.store.load();
      check(loaded.version === 4 && loaded.coins === 13, 'v2 已有三星进度应补发奖励金并保留原余额');
      loaded = ZQ.store.load();
      check(loaded.coins === 13, '再次加载同一存档不应重复补发奖励金');

      storageSet(SAVE_KEY, JSON.stringify({
        version: 3,
        equipped: { cart: 'silver', pig: 'zhaocai' },
      }));
      loaded = ZQ.store.load();
      check(loaded.equipped.pig === 'luckycat', '旧招财金猪应迁移为招财猫存钱罐');

      // 严格线性推进：缺任意前置关卡时，即使星数达标也不能跳章。
      storageSet(SAVE_KEY, JSON.stringify({
        version: 3,
        levelStars: { 1: 3, 2: 3, 3: 3, 4: 3, 8: 3 },
      }));
      loaded = ZQ.store.load();
      var ch2Lock = ZQ.store.chapterLockStatus(2);
      check(ch2Lock.reason === 'previous' && ch2Lock.previousChapterId === 1,
        '星数达标但第一章未全通时，第二章应因前置章节锁定');
      check(!ZQ.store.chapterUnlocked(2) && !ZQ.store.levelUnlocked(8),
        '前置章节未全通时不得跳章进入第二章');

      storageSet(SAVE_KEY, JSON.stringify({
        version: 3,
        levelStars: { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1, 7: 1 },
      }));
      loaded = ZQ.store.load();
      var ch2StarsLock = ZQ.store.chapterLockStatus(2);
      check(!ch2StarsLock.unlocked && ch2StarsLock.reason === 'stars' && ch2StarsLock.starsNeeded === 5,
        '第一章全通但星数不足时，第二章仍应锁定');

      storageSet(SAVE_KEY, JSON.stringify({
        version: 3,
        levelStars: { 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 2, 7: 2 },
      }));
      loaded = ZQ.store.load();
      check(ZQ.store.chapterUnlocked(2) && ZQ.store.levelUnlocked(8),
        '前置章节全通且星数达标后，应解锁第二章首关');
      var level9Lock = ZQ.store.levelLockStatus(9);
      check(!level9Lock.unlocked && level9Lock.reason === 'previous' && level9Lock.requiredLevel === 8,
        '第二章第二关必须等待第 8 关通关');

      storageSet(SAVE_KEY, JSON.stringify({
        version: 3,
        levelStars: { 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 2, 7: 2, 8: 1 },
      }));
      loaded = ZQ.store.load();
      check(ZQ.store.levelUnlocked(9) && !ZQ.store.levelUnlocked(10),
        '通关第 8 关后仅解锁第 9 关，不能继续跳关');

      storageSet(SAVE_KEY, JSON.stringify({ version: 99, levelStars: { 1: 3 } }));
      loaded = ZQ.store.load();
      check(loaded.version === 4 && ZQ.store.totalStars() === 0, '未知高版本存档应安全重置');
      check(!!storageGet(BACKUP_KEY), '高版本存档重置前应保留备份');

      // 首次三星奖励只记一次；重复三星仍可通关，但不再产生妈妈奖励金。
      storageSet(SAVE_KEY, JSON.stringify({ version: 2 }));
      loaded = ZQ.store.load();
      var firstThree = ZQ.store.recordResult(1, 3);
      var firstThreeAward = ZQ.rules.coinsAward(1000, 1000, 3, firstThree.clearIndex, firstThree.momBonus);
      check(firstThree.firstThreeStar && firstThree.momBonus === 3 && firstThreeAward.total === 3,
        '首次三星应获得一次奖励金');
      check(ZQ.store.data.coins === 3, '首次三星奖励金应立即入账');
      var repeatThree = ZQ.store.recordResult(1, 3);
      var repeatThreeAward = ZQ.rules.coinsAward(1000, 1000, 3, repeatThree.clearIndex, repeatThree.momBonus);
      check(!repeatThree.firstThreeStar && repeatThree.momBonus === 0 && repeatThreeAward.total === 0,
        '重复三星不应重复获得奖励金');
      check(ZQ.store.data.coins === 3, '重复三星后奖励金余额不应增加');

      if (savedRaw === null) storageRemove(SAVE_KEY); else storageSet(SAVE_KEY, savedRaw);
      if (savedBackup === null) storageRemove(BACKUP_KEY); else storageSet(BACKUP_KEY, savedBackup);
      ZQ.store.load();

      return { ok: errors.length === 0, errors: errors, count: count };
    },

    report: function () {
      var res = ZQ.regression.run();
      var lines = [];
      lines.push('');
      lines.push('===== 规则 / 会话 / 存档回归 =====');
      lines.push('断言数：' + res.count);
      if (res.ok) {
        lines.push('结果：PASS \u2713');
      } else {
        lines.push('结果：FAIL \u2717 共 ' + res.errors.length + ' 项');
        for (var i = 0; i < res.errors.length; i++) lines.push('  - ' + res.errors[i]);
      }
      lines.push('==================================');
      var text = lines.join('\n');
      if (typeof console !== 'undefined' && console.log) console.log(text);
      return res;
    },
  };

  if (IS_NODE) {
    var result = ZQ.regression.report();
    process.exit(result.ok ? 0 : 1);
  }
})();
