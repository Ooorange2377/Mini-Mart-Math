/* 文案集中管理：状态词、提示语、星级鼓励话术、页面文案 */
window.ZQ = window.ZQ || {};

ZQ.I18N = {
  title: '零钱大作战',
  subtitle: '便利店精算师',

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
  toastLevelLocked: '先通关前面的关卡才能挑战这一关',
  toastChapterLocked: '累计星数还不够，先去拿更多星星吧',
  toastTooMany: '本关只需要 {n} 件商品',
  toastNeedMore: '还差 {n} 件商品',
  toastConstraint: '商品品类还没满足本关要求',
  toastResetDone: '存档已重置',

  // 通用按钮
  btnOk: '确定',
  btnCancel: '取消',

  // 结算弹窗
  resultTotal: '总价',
  resultBudget: '预算',
  resultCoins: '零花钱',
  resultThreeStar: '三星通关数',
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
  mapThreeStar: '三星通关数',
  mapCoins: '零花钱',
  mapNeedStars: '还需 {n} 颗星解锁',
  mapShop: '零花钱商店',
  mapSkins: '皮肤图鉴',

  // 开始页
  startBegin: '开始游戏',
  startContinue: '继续游戏',
  startHowTo: '玩法说明',
  startReset: '重置存档',
  howTo: '从货架上挑选商品，让总价尽量接近但不超过妈妈的预算。一分不差就是三星！',
  resetConfirm: '确定要清空所有进度吗？',

  // 商店页
  shopTitle: '零花钱商店',
  shopOwn: '持有延时卡片',
  shopPrice: '零花钱',
  shopBuy: '兑换',
  shopBack: '返回',
  shopTip: '延时卡片：结算前额外获得 30 秒思考时间，每关最多使用 3 张',

  // 图鉴页
  skinsTitle: '皮肤图鉴',
  skinsCart: '购物车',
  skinsPig: '存钱罐',
  skinsNeed: '需 {n} 个三星通关',
  skinsEquip: '装备',
  skinsEquipped: '已装备',
  skinsDefault: '默认',

  // 游戏内
  timerLabel: '倒计时',
  cartCount: '已选 {n} / {total} 件',
  constraintAny: '任选 {n} 件',
  useCard: '用延时卡',
  hintOverspendShort: '超支',
};
