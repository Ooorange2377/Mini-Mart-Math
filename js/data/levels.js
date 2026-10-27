/* 关卡与章节配置：章节参数、42 关配置表、商品池递增曲线、星星门槛、皮肤表、道具表。
 * 金额单位统一为「分」（整数），避免浮点误差。
 * 注：方案 5.2 节的占比区间 [0.8/n, 1.2/n] 在第一章 n=2 场景下数学不可行，
 *     故取价区间改为「相对容差 rel」（见 generator.js 的 REL_STEPS），优先使用最窄可行情。 */
window.ZQ = window.ZQ || {};

/* 品类参考价区间（软约束），单位：分 */
ZQ.CAT_RANGE = {
  drink:     [200, 1000],
  snack:     [200, 2500],
  daily:     [300, 3000],
  seasoning: [300, 1500],
};

/* 尾数允许集合（单位：分，取值范围 0~99），按章节递增复杂 */
ZQ.TAILS = {
  int:       [0],
  half:      [0, 50],
  half_nine: [0, 50, 90],
  mix99:     [0, 50, 90, 99],
  quarter:   [0, 25, 50, 75],
  mix25:     [0, 25, 50, 75, 90, 99],
};

/* 章节表：range=关卡范围，maxStars=本章满星上限，unlockAt=进入本章所需累计星数（null=无需解锁） */
ZQ.CHAPTERS = [
  { id: 1, name: '购物新手', nameEn: 'Rookie Shopper', range: [1, 7],   maxStars: 21, unlockAt: null, tailType: 'int' },
  { id: 2, name: '预算小将', nameEn: 'Budget Cadet',   range: [8, 14],  maxStars: 21, unlockAt: 12,   tailType: 'half' },
  { id: 3, name: '分类达人', nameEn: 'Category Whiz',  range: [15, 21], maxStars: 21, unlockAt: 26,   tailType: 'half_nine' },
  { id: 4, name: '凑单高手', nameEn: 'Cart Filler',    range: [22, 28], maxStars: 21, unlockAt: 41,   tailType: 'mix99' },
  { id: 5, name: '零钱专家', nameEn: 'Change Expert',  range: [29, 35], maxStars: 21, unlockAt: 59,   tailType: 'quarter' },
  { id: 6, name: '精算大师', nameEn: 'Budget Master',  range: [36, 42], maxStars: 21, unlockAt: 80,   tailType: 'mix25' },
];

ZQ.LEVELS_PER_CHAPTER = 7;

/* 42 关配置表：n=需选商品数，constraint=品类约束（空数组=无约束），budget=[下限,上限] 元，
 * pool=商品池件数（单调非递减），timeSec=倒计时秒数 */
ZQ.LEVELS = [
  // 第一章 1~7：整数尾数，无约束，商品池 4→10
  { id: 1,  n: 2, constraint: [],                                       budget: [8, 11],    pool: 4,  timeSec: 180 },
  { id: 2,  n: 2, constraint: [],                                       budget: [9, 12],    pool: 5,  timeSec: 180 },
  { id: 3,  n: 2, constraint: [],                                       budget: [10, 13],   pool: 6,  timeSec: 180 },
  { id: 4,  n: 3, constraint: [],                                       budget: [12, 15],   pool: 7,  timeSec: 180 },
  { id: 5,  n: 3, constraint: [],                                       budget: [14, 18],   pool: 8,  timeSec: 180 },
  { id: 6,  n: 3, constraint: [],                                       budget: [16, 21],   pool: 9,  timeSec: 180 },
  { id: 7,  n: 3, constraint: [],                                       budget: [18, 23],   pool: 10, timeSec: 180 },
  // 第二章 8~14：.5 尾数，无约束，商品池 10→16
  { id: 8,  n: 2, constraint: [],                                       budget: [10, 14],   pool: 10, timeSec: 150 },
  { id: 9,  n: 2, constraint: [],                                       budget: [12, 16],   pool: 11, timeSec: 150 },
  { id: 10, n: 2, constraint: [],                                       budget: [14, 18],   pool: 12, timeSec: 150 },
  { id: 11, n: 3, constraint: [],                                       budget: [16, 19],   pool: 13, timeSec: 150 },
  { id: 12, n: 3, constraint: [],                                       budget: [18, 21],   pool: 14, timeSec: 150 },
  { id: 13, n: 3, constraint: [],                                       budget: [20, 23],   pool: 15, timeSec: 150 },
  { id: 14, n: 3, constraint: [],                                       budget: [22, 25],   pool: 16, timeSec: 150 },
  // 第三章 15~21：.5/.9 混杂，强制 2~3 品类各选若干，商品池 16→20
  { id: 15, n: 2, constraint: [{ category: 'drink', count: 1 }, { category: 'snack', count: 1 }],                          budget: [10.8, 14.4], pool: 16, timeSec: 120 },
  { id: 16, n: 2, constraint: [{ category: 'daily', count: 1 }, { category: 'seasoning', count: 1 }],                      budget: [12.5, 16],   pool: 17, timeSec: 120 },
  { id: 17, n: 3, constraint: [{ category: 'drink', count: 1 }, { category: 'snack', count: 2 }],                           budget: [14.9, 18.5], pool: 18, timeSec: 120 },
  { id: 18, n: 3, constraint: [{ category: 'daily', count: 1 }, { category: 'snack', count: 2 }],                           budget: [17.2, 20.6], pool: 18, timeSec: 120 },
  { id: 19, n: 3, constraint: [{ category: 'drink', count: 1 }, { category: 'daily', count: 1 }, { category: 'seasoning', count: 1 }], budget: [19.5, 22.4], pool: 19, timeSec: 120 },
  { id: 20, n: 3, constraint: [{ category: 'snack', count: 1 }, { category: 'daily', count: 1 }, { category: 'seasoning', count: 1 }], budget: [21.8, 24.1], pool: 20, timeSec: 120 },
  { id: 21, n: 3, constraint: [{ category: 'drink', count: 1 }, { category: 'snack', count: 1 }, { category: 'daily', count: 1 }],      budget: [23.2, 25.3], pool: 20, timeSec: 120 },
  // 第四章 22~28：.5/.9/.99 混杂，四类各选 1 个 / 饮品1+零食2，商品池 21→25
  { id: 22, n: 3, constraint: [{ category: 'drink', count: 1 }, { category: 'snack', count: 2 }],                            budget: [18, 24], pool: 21, timeSec: 120 },
  { id: 23, n: 3, constraint: [{ category: 'drink', count: 1 }, { category: 'snack', count: 2 }],                            budget: [22, 30], pool: 22, timeSec: 120 },
  { id: 24, n: 3, constraint: [{ category: 'snack', count: 2 }, { category: 'daily', count: 1 }],                            budget: [26, 34], pool: 22, timeSec: 120 },
  { id: 25, n: 4, constraint: [{ category: 'drink', count: 1 }, { category: 'snack', count: 1 }, { category: 'daily', count: 1 }, { category: 'seasoning', count: 1 }], budget: [28, 38], pool: 23, timeSec: 90 },
  { id: 26, n: 4, constraint: [{ category: 'drink', count: 1 }, { category: 'snack', count: 1 }, { category: 'daily', count: 1 }, { category: 'seasoning', count: 1 }], budget: [32, 44], pool: 24, timeSec: 90 },
  { id: 27, n: 4, constraint: [{ category: 'drink', count: 1 }, { category: 'snack', count: 1 }, { category: 'daily', count: 1 }, { category: 'seasoning', count: 1 }], budget: [38, 50], pool: 24, timeSec: 90 },
  { id: 28, n: 4, constraint: [{ category: 'drink', count: 1 }, { category: 'snack', count: 1 }, { category: 'daily', count: 1 }, { category: 'seasoning', count: 1 }], budget: [40, 52], pool: 25, timeSec: 90 },
  // 第五章 29~35：整角尾数，四品类高预算组合，商品池 25→30
  { id: 29, n: 4, constraint: [{ category: 'drink', count: 1 }, { category: 'snack', count: 2 }, { category: 'daily', count: 1 }], budget: [42, 52], pool: 25, timeSec: 85 },
  { id: 30, n: 4, constraint: [{ category: 'snack', count: 2 }, { category: 'daily', count: 1 }, { category: 'seasoning', count: 1 }], budget: [44, 55], pool: 26, timeSec: 85 },
  { id: 31, n: 4, constraint: [{ category: 'drink', count: 1 }, { category: 'snack', count: 2 }, { category: 'seasoning', count: 1 }], budget: [46, 57], pool: 26, timeSec: 85 },
  { id: 32, n: 4, constraint: [{ category: 'drink', count: 1 }, { category: 'snack', count: 1 }, { category: 'daily', count: 1 }, { category: 'seasoning', count: 1 }], budget: [48, 60], pool: 27, timeSec: 80 },
  { id: 33, n: 4, constraint: [{ category: 'drink', count: 1 }, { category: 'snack', count: 2 }, { category: 'daily', count: 1 }], budget: [50, 62], pool: 28, timeSec: 80 },
  { id: 34, n: 4, constraint: [{ category: 'drink', count: 1 }, { category: 'snack', count: 1 }, { category: 'daily', count: 1 }, { category: 'seasoning', count: 1 }], budget: [52, 65], pool: 29, timeSec: 75 },
  { id: 35, n: 4, constraint: [{ category: 'drink', count: 1 }, { category: 'snack', count: 2 }, { category: 'seasoning', count: 1 }], budget: [55, 68], pool: 30, timeSec: 75 },
  // 第六章 36~42：.25/.5/.9/.99 综合尾数，商品池 30→32，倒计时进一步压缩
  { id: 36, n: 4, constraint: [{ category: 'drink', count: 1 }, { category: 'snack', count: 1 }, { category: 'daily', count: 1 }, { category: 'seasoning', count: 1 }], budget: [58, 72], pool: 30, timeSec: 70 },
  { id: 37, n: 4, constraint: [{ category: 'drink', count: 1 }, { category: 'snack', count: 2 }, { category: 'daily', count: 1 }], budget: [60, 75], pool: 31, timeSec: 70 },
  { id: 38, n: 4, constraint: [{ category: 'drink', count: 2 }, { category: 'snack', count: 1 }, { category: 'daily', count: 1 }], budget: [62, 78], pool: 31, timeSec: 65 },
  { id: 39, n: 4, constraint: [{ category: 'drink', count: 1 }, { category: 'snack', count: 1 }, { category: 'daily', count: 1 }, { category: 'seasoning', count: 1 }], budget: [65, 82], pool: 32, timeSec: 65 },
  { id: 40, n: 4, constraint: [{ category: 'snack', count: 2 }, { category: 'daily', count: 1 }, { category: 'seasoning', count: 1 }], budget: [68, 86], pool: 32, timeSec: 60 },
  { id: 41, n: 4, constraint: [{ category: 'drink', count: 1 }, { category: 'snack', count: 1 }, { category: 'daily', count: 1 }, { category: 'seasoning', count: 1 }], budget: [72, 90], pool: 32, timeSec: 60 },
  { id: 42, n: 4, constraint: [{ category: 'drink', count: 1 }, { category: 'snack', count: 2 }, { category: 'daily', count: 1 }], budget: [75, 95], pool: 32, timeSec: 55 },
];

/* 每页 12 个陈列位（3 层 × 每层 4 位）；层 → 品类归属（循环），页数不限 */
ZQ.SLOTS_PER_PAGE = 12;
ZQ.ITEMS_PER_LAYER = 4;
ZQ.LAYER_CATEGORIES = ['drink', 'snack', 'daily', 'seasoning', 'drink', 'snack', 'daily', 'seasoning'];

/* 零花钱商店：3 类消耗品，每类 2~3 档（多买打折）。tiers 内的 id 是兑换按钮的唯一标识 */
ZQ.SHOP_ITEMS = [
  {
    id: 'delay', icon: '⏱', unit: '+30s',
    tiers: [
      { id: 'delay1', count: 1, price: 10, tag: '',    tagEn: '' },
      { id: 'delay5', count: 5, price: 40, tag: '8折',  tagEn: '20% OFF' },
    ],
  },
  {
    id: 'hint', icon: '💡', unit: 'HINT',
    tiers: [
      { id: 'hint1', count: 1, price: 15, tag: '',    tagEn: '' },
      { id: 'hint3', count: 3, price: 39, tag: '省6',  tagEn: 'SAVE 6' },
    ],
  },
  {
    id: 'reroll', icon: '🔄', unit: 'REROLL',
    tiers: [
      { id: 'reroll1', count: 1, price: 20, tag: '',     tagEn: '' },
      { id: 'reroll5', count: 5, price: 85, tag: '省15',  tagEn: 'SAVE 15' },
    ],
  },
];
ZQ.DELAY_CARD_MAX_PER_LEVEL = 3;   // 每关最多使用 3 张
ZQ.DELAY_CARD_SECONDS = 30;        // 每张 +30 秒
ZQ.HINT_CARD_MAX_PER_LEVEL = 2;    // 每关最多使用 2 张
ZQ.REROLL_CARD_MAX_PER_LEVEL = 1;  // 每关最多使用 1 张

/* 皮肤表：按「三星奖牌数」解锁，不可用零花钱购买 */
ZQ.SKINS = [
  { id: 'silver',   type: 'cart', name: '普通银色',   nameEn: 'Classic Silver',  need: 0 },
  { id: 'starblue', type: 'cart', name: '星空蓝',     nameEn: 'Starry Blue',     need: 3 },
  { id: 'straw',    type: 'cart', name: '草莓粉',     nameEn: 'Strawberry Pink', need: 10 },
  { id: 'mint',     type: 'cart', name: '薄荷绿',     nameEn: 'Mint Green',      need: 22 },
  { id: 'gold',     type: 'cart', name: '金光闪闪',   nameEn: 'Golden Glow',     need: 36 },
  { id: 'glass',    type: 'pig',  name: '玻璃存钱罐', nameEn: 'Glass Jar',       need: 0 },
  { id: 'gacha',    type: 'pig',  name: '扭蛋机存钱罐', nameEn: 'Gacha Machine', need: 10 },
  { id: 'ufo',      type: 'pig',  name: 'UFO 存钱罐', nameEn: 'UFO Bank',        need: 22 },
];

/* 当前语言的章节名 / 皮肤名 */
ZQ.chapterName = function (c) {
  if (!c) return '';
  return (ZQ.isEn() && c.nameEn) ? c.nameEn : c.name;
};
ZQ.skinName = function (s) {
  if (!s) return '';
  return (ZQ.isEn() && s.nameEn) ? s.nameEn : s.name;
};

/* 零花钱重复通关递减倍率：第 1~5 次 100/80/60/40/20%，第 6 次及以后 0% */
ZQ.DECAY_MUL = [1, 0.8, 0.6, 0.4, 0.2, 0];

/* 首次三星通关奖励：妈妈奖励金（零花钱） */
ZQ.MOM_BONUS_COINS = 3;

ZQ.chapterOf = function (levelId) {
  for (var i = 0; i < ZQ.CHAPTERS.length; i++) {
    var c = ZQ.CHAPTERS[i];
    if (levelId >= c.range[0] && levelId <= c.range[1]) return c;
  }
  return null;
};

ZQ.levelConfig = function (levelId) {
  for (var i = 0; i < ZQ.LEVELS.length; i++) {
    if (ZQ.LEVELS[i].id === levelId) return ZQ.LEVELS[i];
  }
  return null;
};

ZQ.totalLevels = ZQ.LEVELS.length;
