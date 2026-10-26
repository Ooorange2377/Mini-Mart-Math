/* 文案集中管理：状态词、提示语、星级鼓励话术、页面文案 */
window.ZQ = window.ZQ || {};

ZQ.I18N = {
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
  toastListHint: '清单仅供核对，不显示总价',
  toastDelayCardEmpty: '延时卡片不够啦，去商店兑换吧',
  toastDelayCardUsedUp: '本关延时卡片已用完（上限 3 张）',
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
  pagerTipOk: '知道了',

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

  // 商店页
  shopTitle: '零花钱商店',
  shopOwn: '延时卡数量',
  shopPrice: '零花钱',
  shopBuy: '兑换',
  shopBack: '返回',
  shopTip: '延时卡片：结算前额外获得 30 秒思考时间，每关最多使用 3 张',

  // 图鉴页
  skinsTitle: '皮肤图鉴',
  skinsCart: '购物车',
  skinsPig: '存钱罐',
  skinsNeed: '需达到 {n} 个三星奖牌',
  skinsEquip: '装备',
  skinsEquipped: '已装备',
  skinsDefault: '默认',

  // 存钱罐仪式弹窗
  pigShowTitle: '存进存钱罐啦！',
  pigShowOk: '好耶~',
  pigSkip: '跳过',
  gachaRewardCoins: '零花钱 +1',
  gachaRewardCard: '延时卡 +1',
  gachaRewardNone: '谢谢惠顾，再接再厉~',

  // 游戏内
  timerLabel: '倒计时',
  cartCount: '已选 {n} / {total} 件',
  constraintAny: '任选 {n} 件',
  useCard: '用延时卡',
  hintOverspendShort: '超支',
};
