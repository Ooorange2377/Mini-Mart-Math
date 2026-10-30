/* 文案集中管理：中英双词典 + 语言状态与少量拼接辅助。
 * 页面统一读 ZQ.I18N，ZQ.setLang() 切换后重新渲染即可生效。 */
window.ZQ = window.ZQ || {};

/* ---------- 中文 ---------- */
ZQ.I18N_ZH = {
  title: '便利店 购物大作战',
  subtitle: '益智·收集·闯关',

  // 状态词
  stateSelecting: '挑选中',
  stateCheckout: '结算中',

  // 面板标签
  labelTarget: '购物任务',
  labelLevel: '关卡',
  labelBudget: '预算',
  labelNeedCount: '数量',
  labelConstraint: '品类要求',
  viewDetails: '查看明细',
  labelCheckout: '结算',
  budgetHint: '请凑出这个金额',
  checkoutHint: '点击结账',

  // 轻提示
  toastOverspend: '超支啦！再看看别的吧',
  toastCartEmpty: '还没有选择商品哦！',
  toastDelayCardEmpty: '延时卡片不够啦，去商店兑换吧',
  toastDelayCardUsedUp: '本关延时卡片已用完（上限 3 张）',
  toastHintCardEmpty: '没有提示卡啦，去商店兑换吧',
  toastHintCardUsedUp: '本关提示卡已用完（上限 2 张）',
  toastHintNothing: '品类要求都已满足，先换掉一件商品吧',
  toastHintWrong: '标记的商品不在最优组合里，换掉它再试一次',
  toastHintPerfect: '购物车已经是最优组合啦，直接结账吧',
  toastHintDone: '已高亮唯一解中的下一件商品',
  toastRerollCardEmpty: '没有换题卡啦，去商店兑换吧',
  toastRerollCardUsedUp: '本关换题卡已用完（上限 1 张）',
  toastRerollDone: '已换新题，倒计时继续',
  toastDelayCardAdded: '+30 秒',
  toastCoinsNotEnough: '零花钱不够哦',
  toastBought: '兑换成功！',
  toastSkinLocked: '还没解锁这个皮肤哦',
  toastSkinEquipped: '已装备',
  toastLevelLocked: '先通关第 {n} 关才能挑战这一关',
  toastChapterLocked: '章节尚未解锁，请先满足前置条件',
  toastTooMany: '本关只需要 {n} 件商品',
  toastNeedMore: '还差 {n} 件商品',
  toastConstraint: '商品品类还没满足本关要求',
  toastResetDone: '存档已重置',
  pagerTipTitle: '货架分页啦',
  pagerTipText: '这一关的商品超过 12 件。点击底部的翻页箭头或圆点，可以查看下一页商品。',
  pagerTipTextTouch: '这一关的商品超过 12 件。左右滑动货架，就能查看下一页商品。',
  pagerTipOk: '知道了',
  tipConstraintTitle: '新挑战：品类要求',
  tipConstraintText: '这一关还要按品类挑选商品。结算前记得核对每一类的件数哦！',
  tipFourTitle: '新挑战：一次买 4 件',
  tipFourText: '这一关要选满 4 件商品。件数或品类不符，都不算通关。',
  tipGotIt: '我明白啦',

  // 第一关基础操作引导（5 步：目标 → 选品 → 取消 → 查看 → 结算）
  guideSkip: '跳过引导',
  guide1Title: '明确目标',
  guide1Text: '查看本关的预算目标、数量和品类要求，尽量花光预算哦！',
  guide2Title: '挑选商品',
  guide2Text: '点击货架上的商品卡片，即可放入购物篮。',
  guide3Title: '取消选择',
  guide3Text: '选错了？再点一下货架上的它，或者点右上角「查看明细」去取消。',
  guide4Title: '查看已选购的商品',
  guide4Text: '点击后展开清单，就能查看已选购的全部商品。',
  guide5Title: '最后结账',
  guide5Text: '件数和品类都选对以后，点底部的结算按钮结算。',

  // 竖屏提示（仅竖屏 + 触摸设备）
  rotateTitle: '把手机横过来玩吧',
  rotateText: '这一关的画面是横版的：横屏才能看清货架上的商品与价格。',
  rotateContinue: '仍要继续',
  // 首页按返回键时的提示（返回键由页面接管，避免误触直接退出）
  backExitHint: '再按一次返回键退出游戏',

  // 通用按钮
  btnOk: '确定',
  btnCancel: '取消',

  // 结算弹窗
  resultTotal: '总价',
  resultBudget: '预算',
  resultCoins: '零花钱',
  resultMomBonus: '妈妈的奖励金',
  resultThreeStar: '三星奖牌',
  resultBtnRetry: '再来一次',
  resultBtnNext: '下一关',
  resultBtnMap: '回到地图',
  resultInvalidCount: '商品件数不符合本关要求，本次不计通关。',
  resultInvalidConstraint: '商品品类不符合本关要求，本次不计通关。',

  // 星级对应话术
  resultText: {
    0: '还差一点点就能买更多东西啦！再试试看，把预算花得更接近一些吧！',
    1: '不错哦！再精打细算一点，就能买到更多东西啦！',
    2: '太棒了！只差一点点就能一分不差，再练练你就能拿三星啦！',
    3: '一分不差！你就是今天的“精算大师”！',
  },
  resultStars: ['失败', '成功', '成功', '完美'],

  // 地图页
  mapTitle: '选择关卡',
  mapTotalStars: '星星',
  mapThreeStar: '三星奖牌',
  mapCoins: '零花钱',
  mapNeedStars: '还需 {n} 颗星星解锁',
  mapChapterLocked: '第 {chapter} 章尚未解锁',
  mapNeedPreviousChapter: '先通关第 {chapter} 章全部关卡',
  mapLevelNeedPrevious: '先通关第 {n} 关',

  // 开始页
  startBegin: '开始游戏',
  startContinue: '继续游戏',
  startLevelSelect: '关卡选择',
  momGreet: '宝贝，准备好和妈妈一起去购物了吗？',
  startHowTo: '玩法说明',
  startReset: '重置存档',
  btnShop: '商店',
  btnItem: '皮肤',
  btnSettings: '设置',
  musicCredit: '音乐：Purrple Cat – Let\'s Go Shopping (CC BY 4.0)',
  topStars: '星数',
  topThreeStar: '三星',
  topCoins: '零花钱',
  howToGoalTitle: '🛒 购物目标',
  howToGoalText: '挑选商品凑出妈妈的预算，<b>千万不要超支哦！</b>',
  howToCoinsTitle: '怎么赚零花钱？',
  howToSavingMode: '省钱模式（1～2星）',
  howToSavingText: '帮妈妈省下的钱，直接作为“找零”奖励给你！',
  howToPerfectMode: '完美模式（3星）',
  howToPerfectText: '一分不差刚好花完？妈妈额外奖励 <b>{n} 个零花钱</b>！',
  howToFirstOnly: '仅首次通关获得',
  resetConfirm: '确定要清空所有进度吗？',

  // 设置弹窗
  settingsSound: '音效',
  settingsMusic: '音乐',
  settingsOn: '已开启',
  settingsOff: '已关闭',
  language: '语言',

  // 商店页
  shopTitle: '零花钱商店',
  shopPrice: '零花钱',
  shopBuy: '兑换',
  shopBack: '返回',
  shopDescDelay: '结算前 +30 秒，每关最多 3 张',
  shopDescHint: '高亮一件符合要求的商品，每关最多 2 张',
  shopDescReroll: '重出一套同难度题目，每关最多 1 张',
  shopDelay: '延时卡',
  shopHint: '提示卡',
  shopReroll: '换题卡',
  shopOwnShort: '持有 {n}',

  // 图鉴页
  skinsTitle: '我的皮肤',
  skinsCart: '购物车',
  skinsPig: '存钱罐',
  skinsNeed: '需达到 {n} 个三星奖牌',
  skinsEquip: '装备',
  skinsEquipped: '已装备',
  skinsDefault: '默认',
  skinAlreadyEquipped: '已在装备中',

  // 存钱罐仪式弹窗
  pigShowTitle: '存进存钱罐啦！',
  pigShowOk: '好耶~',
  pigSkip: '跳过',
  gachaRewardCoins: '零花钱 +1',
  gachaRewardCard: '延时卡 +1',
  gachaRewardNone: '谢谢惠顾，再接再厉~',
  ceremonyTotal: '零花钱总额：',
  ceremonyCoinReward: '零花钱 ×{n}',
  ceremonyCardReward: '延时卡 ×{n}',
  ceremonyNone: '谢谢惠顾',
  ceremonyStoneNone: '这只是一块普通的石头...',
  ceremonyCrystalHint: '点击看看里面是什么？',

  // 游戏内
  timerLabel: '倒计时',
  itemCount: '{n} 件',
  cardsLeft: '剩 {n}',
  constraintAny: '任选 {n} 件',
  useCard: '用延时卡',
  toolDelay: '延时',
  toolHint: '提示',
  toolReroll: '换题',
  hintOverspendShort: '超支',

  // 拼装辅助
  colon: '：',
  listSep: '；',
  chapterLabel: '第 {n} 章 · {name}',
  chapterPrefix: '第 {n} 章 ·',
  backMapAria: '返回地图',
  backHallAria: '返回大厅',
  backHomeAria: '返回初始界面',
  prevPageAria: '上一页',
  nextPageAria: '下一页',
  levelLockedAria: '第 {n} 关，未解锁，{hint}',
};

/* ---------- English ---------- */
ZQ.I18N_EN = {
  title: 'Mini-Mart Math: Budget Shopping Puzzle',
  subtitle: 'Puzzle · Collect · Progress',

  stateSelecting: 'Choosing',
  stateCheckout: 'Checking Out',

  labelTarget: 'Shopping Task',
  labelLevel: 'Level',
  labelBudget: 'Budget',
  labelNeedCount: 'Items',
  labelConstraint: 'Required',
  viewDetails: 'Details',
  labelCheckout: 'Checkout',
  budgetHint: 'Match this amount',
  checkoutHint: 'Tap to check out',

  toastOverspend: 'Over budget! Try something else.',
  toastCartEmpty: 'No items yet!',
  toastDelayCardEmpty: 'No Time Cards left. Get more in the Shop!',
  toastHintCardEmpty: 'No Hint Cards left. Get more in the Shop!',
  toastHintCardUsedUp: '2 Hint Cards max per level',
  toastHintNothing: 'All categories are already met — swap an item first',
  toastHintWrong: 'The marked item is not part of the best combo — swap it out',
  toastHintPerfect: 'Your cart is already the best combo — check out!',
  toastHintDone: 'Highlighted the next item of the best combo',
  toastRerollCardEmpty: 'No Reroll Cards left. Get more in the Shop!',
  toastRerollCardUsedUp: '1 Reroll Card max per level',
  toastRerollDone: 'New puzzle drawn — time kept',
  toastDelayCardUsedUp: '3 Time Cards max per level',
  toastDelayCardAdded: '+30 sec',
  toastCoinsNotEnough: 'Not enough Allowance',
  toastBought: 'Redeemed!',
  toastSkinLocked: 'Skin locked',
  toastSkinEquipped: 'Equipped',
  toastLevelLocked: 'Clear Level {n} first',
  toastChapterLocked: 'This chapter is still locked',
  toastTooMany: 'This level needs exactly {n} items',
  toastNeedMore: 'Add {n} more {item}',
  toastConstraint: 'Required categories not met',
  toastResetDone: 'Progress reset.',
  pagerTipTitle: 'More items on the next shelf!',
  pagerTipText: 'More than 12 items. Tap the arrows or dots below.',
  pagerTipTextTouch: 'More than 12 items. Swipe the shelf left or right to see the next page.',
  pagerTipOk: 'Got it',
  tipConstraintTitle: 'New Challenge: Category Rules',
  tipConstraintText: 'This level also sets how many items you need from each category. Check them before checkout!',
  tipFourTitle: 'New Challenge: 4 Items',
  tipFourText: 'Pick exactly 4 items this level. Wrong count or categories will not count.',
  tipGotIt: 'Got it!',

  // Basic first-level guide (5 steps: goals → pick → deselect → view → checkout)
  guideSkip: 'Skip',
  guide1Title: 'Check Goals',
  guide1Text: 'Check the budget, quantity, and category requirements for this level. Try to spend it all!',
  guide2Title: 'Select Items',
  guide2Text: 'Tap an item on the shelf to add it to your cart.',
  guide3Title: 'Deselect',
  guide3Text: 'Changed your mind? Tap it again on the shelf, or tap Details at the top to remove it.',
  guide4Title: 'View Selected',
  guide4Text: "Tap here to expand the list and view all the items you've selected.",
  guide5Title: 'Checkout',
  guide5Text: 'Once you have the right items and categories, tap the checkout button at the bottom to finish.',

  // Portrait hint (portrait + touch devices only)
  rotateTitle: 'Turn your phone sideways',
  rotateText: 'The game stage is landscape: rotating gives you a readable shelf and price tags.',
  rotateContinue: 'Continue anyway',
  backExitHint: 'Press back again to exit',

  btnOk: 'OK',
  btnCancel: 'Cancel',

  resultTotal: 'Total',
  resultBudget: 'Budget',
  resultCoins: 'Allowance',
  resultMomBonus: "Mom's Bonus",
  resultThreeStar: '3-Star Medal',
  resultBtnRetry: 'Try Again',
  resultBtnNext: 'Next Level',
  resultBtnMap: 'Back to Map',
  resultInvalidCount: 'Wrong item count — level not cleared.',
  resultInvalidConstraint: 'Wrong categories — level not cleared.',

  resultText: {
    0: 'So close! Try to match the budget more closely!',
    1: 'Nice! Get closer to the budget for a better score!',
    2: 'Great! Just a little off — try again for 3 stars!',
    3: "Perfect match! You're today's Budget Master!",
  },
  resultStars: ['Oops', 'Good', 'Great', 'Perfect'],

  mapTitle: 'Select Level',
  mapTotalStars: 'Stars',
  mapThreeStar: '3-Star Medals',
  mapCoins: 'Allowance',
  mapNeedStars: 'Need {n} more {star} to unlock',
  mapChapterLocked: 'Chapter {chapter} is locked',
  mapNeedPreviousChapter: 'Clear all levels in Chapter {chapter} first',
  mapLevelNeedPrevious: 'Clear Level {n} first',

  startBegin: 'Start Game',
  startContinue: 'Continue',
  startLevelSelect: 'Select Level',
  momGreet: 'Ready to go shopping with Mom, sweetie?',
  startHowTo: 'How to Play',
  startReset: 'Reset Progress',
  btnShop: 'Shop',
  btnItem: 'Skins',
  btnSettings: 'Settings',
  musicCredit: 'Music: Purrple Cat – Let\'s Go Shopping (CC BY 4.0)',
  topStars: 'Stars',
  topThreeStar: 'Medals',
  topCoins: 'Allowance',
  howToGoalTitle: '🛒 Shopping Goal',
  howToGoalText: "Pick items to match Mom's budget — <b>don't go over!</b>",
  howToCoinsTitle: 'How to earn Allowance',
  howToSavingMode: 'Saving Mode (1–2 stars)',
  howToSavingText: 'Whatever you save Mom becomes your change reward!',
  howToPerfectMode: 'Perfect Mode (3 stars)',
  howToPerfectText: 'Spend the budget exactly and Mom gives you <b>{n} bonus coins</b>!',
  howToFirstOnly: 'First clear only',
  resetConfirm: 'Reset all progress?',

  settingsSound: 'SFX',
  settingsMusic: 'Music',
  settingsOn: 'On',
  settingsOff: 'Off',
  language: 'Language',

  shopTitle: 'Allowance Shop',
  shopPrice: 'Allowance',
  shopBuy: 'Redeem',
  shopBack: 'Back',
  shopDescDelay: '+30 sec before checkout · max 3 per level',
  shopDescHint: 'Highlights one matching item · max 2 per level',
  shopDescReroll: 'Redraws a puzzle of the same difficulty · max 1 per level',
  shopDelay: 'Time Card',
  shopHint: 'Hint Card',
  shopReroll: 'Reroll Card',
  shopOwnShort: 'Owned {n}',

  skinsTitle: 'My Skins',
  skinsCart: 'Carts',
  skinsPig: 'Piggy Banks',
  skinsNeed: 'Earn {n} 3-Star Medals',
  skinsEquip: 'Equip',
  skinsEquipped: 'Equipped',
  skinsDefault: 'Default',
  skinAlreadyEquipped: 'Already equipped',

  pigShowTitle: 'Into the piggy bank!',
  pigShowOk: 'Yay!',
  pigSkip: 'Skip',
  gachaRewardCoins: 'Allowance +1',
  gachaRewardCard: 'Time Card +1',
  gachaRewardNone: 'Better luck next time!',
  ceremonyTotal: 'Total Allowance: ',
  ceremonyCoinReward: 'Allowance ×{n}',
  ceremonyCardReward: 'Time Card ×{n}',
  ceremonyNone: 'Better luck next time!',
  ceremonyStoneNone: 'Just an ordinary rock...',
  ceremonyCrystalHint: "Tap to see what's inside!",

  timerLabel: 'Countdown',
  itemCount: '{n} {item}',
  cardsLeft: '{n} left',
  constraintAny: 'Any {n} items',
  useCard: 'Time Card',
  toolDelay: 'Time',
  toolHint: 'Hint',
  toolReroll: 'Reroll',
  hintOverspendShort: 'Over budget',

  colon: ': ',
  listSep: ' · ',
  chapterLabel: 'Chapter {n} · {name}',
  chapterPrefix: 'Chapter {n} ·',
  backMapAria: 'Back to Map',
  backHallAria: 'Back to Hall',
  backHomeAria: 'Back to Home',
  prevPageAria: 'Previous page',
  nextPageAria: 'Next page',
  levelLockedAria: 'Level {n}, locked. {hint}',
};

/* 当前语言（默认中文；由 ZQ.setLang 切换并同步 <html lang>） */
ZQ.lang = 'zh';
ZQ.I18N = ZQ.I18N_ZH;

ZQ.setLang = function (lang) {
  ZQ.lang = lang === 'en' ? 'en' : 'zh';
  ZQ.I18N = ZQ.lang === 'en' ? ZQ.I18N_EN : ZQ.I18N_ZH;
  var root = document.documentElement;
  root.lang = ZQ.lang === 'en' ? 'en' : 'zh-CN';
  root.classList.toggle('lang-en', ZQ.lang === 'en');
  document.title = ZQ.I18N.title;
};

ZQ.isEn = function () { return ZQ.lang === 'en'; };

/* 英文按数量取单词；中文返回固定量词，供模板里的 {item} / {star} 使用 */
ZQ.itemWord = function (n) { return ZQ.isEn() ? (n === 1 ? 'item' : 'items') : '件'; };
ZQ.starWord = function (n) { return ZQ.isEn() ? (n === 1 ? 'Star' : 'Stars') : '颗星星'; };
