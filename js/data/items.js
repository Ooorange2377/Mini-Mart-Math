/* 商品库：由 商品素材/ 目录清单生成，共 94 条。
 * 数据库只标注「名称 + 品类」，价格由关卡生成时动态分配（可随关卡不同而变化）。
 * 注：「漱口水」「柠檬洗洁精」文件位于 饮品类 目录下，但品类修正为 daily（日用品）。 */
window.ZQ = window.ZQ || {};

ZQ.ITEMS = [
  { id: 'd01', name: '一口可乐', nameEn: 'Mini Cola', category: 'drink', path: '商品素材/饮品类/一口可乐.png' },
  { id: 'd02', name: '乌龙茶', nameEn: 'Oolong Tea', category: 'drink', path: '商品素材/饮品类/乌龙茶.png' },
  { id: 'd03', name: '啵啵奶茶', nameEn: 'Bubble Milk Tea', category: 'drink', path: '商品素材/饮品类/啵啵奶茶.png' },
  { id: 'd04', name: '抹茶拿铁', nameEn: 'Matcha Latte', category: 'drink', path: '商品素材/饮品类/抹茶拿铁.png' },
  { id: 'd05', name: '无糖红茶', nameEn: 'Unsweetened Tea', category: 'drink', path: '商品素材/饮品类/无糖红茶.png' },
  { id: 'd06', name: '杏仁奶', nameEn: 'Almond Milk', category: 'drink', path: '商品素材/饮品类/杏仁奶.png' },
  { id: 'd07', name: '柠檬汽水', nameEn: 'Lemon Soda', category: 'drink', path: '商品素材/饮品类/柠檬汽水.png' },
  { id: 'd08', name: '椰子汁', nameEn: 'Coconut Water', category: 'drink', path: '商品素材/饮品类/椰子汁.png' },
  { id: 'd09', name: '橙子汽水', nameEn: 'Orange Soda', category: 'drink', path: '商品素材/饮品类/橙子汽水.png' },
  { id: 'd10', name: '橙汁', nameEn: 'Orange Juice', category: 'drink', path: '商品素材/饮品类/橙汁.png' },
  { id: 'd11', name: '焙香乌龙', nameEn: 'Roasted Oolong', category: 'drink', path: '商品素材/饮品类/焙香乌龙茶.png' },
  { id: 'd12', name: '石榴汁', nameEn: 'Pomegranate', category: 'drink', path: '商品素材/饮品类/石榴汁.png' },
  { id: 'd13', name: '纯净水', nameEn: 'Purified Water', category: 'drink', path: '商品素材/饮品类/纯净水.png' },
  { id: 'd14', name: '绿茶', nameEn: 'Green Tea', category: 'drink', path: '商品素材/饮品类/绿茶.png' },
  { id: 'd15', name: '能量水', nameEn: 'Energy Water', category: 'drink', path: '商品素材/饮品类/能量水.png' },
  { id: 'd16', name: '芒果汁', nameEn: 'Mango Juice', category: 'drink', path: '商品素材/饮品类/芒果汁.png' },
  { id: 'd17', name: '苹果汁', nameEn: 'Apple Juice', category: 'drink', path: '商品素材/饮品类/苹果汁.png' },
  { id: 'd18', name: '茉莉花茶', nameEn: 'Jasmine Tea', category: 'drink', path: '商品素材/饮品类/茉莉花茶.png' },
  { id: 'd19', name: '葡萄汁', nameEn: 'Grape Juice', category: 'drink', path: '商品素材/饮品类/葡萄汁.png' },
  { id: 'd20', name: '蓝莓汁', nameEn: 'Blueberry Juice', category: 'drink', path: '商品素材/饮品类/蓝莓汁.png' },
  { id: 'd21', name: '蜜桃茶', nameEn: 'Peach Tea', category: 'drink', path: '商品素材/饮品类/蜜桃茶.png' },
  { id: 'd22', name: '金色啤酒', nameEn: 'Golden Beer', category: 'drink', path: '商品素材/饮品类/金色啤酒.png' },
  { id: 's01', name: '饭团', nameEn: 'Salmon Onigiri', category: 'snack', path: '商品素材/零食类/三文鱼饭团.png' },
  { id: 's02', name: '双莓饼干', nameEn: 'Berry Cookie', category: 'snack', path: '商品素材/零食类/双莓夹心饼干.png' },
  { id: 's03', name: '吐司', nameEn: 'Toast', category: 'snack', path: '商品素材/零食类/吐司.png' },
  { id: 's04', name: '苏打饼干', nameEn: 'Salted Crackers', category: 'snack', path: '商品素材/零食类/咸味苏打饼干.png' },
  { id: 's05', name: '蜜瓜饼干', nameEn: 'Melon Cookie', category: 'snack', path: '商品素材/零食类/哈密瓜夹心饼干.png' },
  { id: 's06', name: '坚果棒', nameEn: 'Nut Energy Pack', category: 'snack', path: '商品素材/零食类/坚果能量包.png' },
  { id: 's07', name: '坚果薄脆', nameEn: 'Nut Crisps', category: 'snack', path: '商品素材/零食类/坚果薄脆.png' },
  { id: 's08', name: '奶香曲奇', nameEn: 'Creamy Cookies', category: 'snack', path: '商品素材/零食类/奶香曲奇.png' },
  { id: 's09', name: '奶香蛋卷', nameEn: 'Creamy Egg Roll', category: 'snack', path: '商品素材/零食类/奶香蛋卷.png' },
  { id: 's10', name: '小熊软糖', nameEn: 'Gummy Bears', category: 'snack', path: '商品素材/零食类/小熊软糖.png' },
  { id: 's11', name: '山楂卷', nameEn: 'Hawthorn Roll', category: 'snack', path: '商品素材/零食类/山楂卷.png' },
  { id: 's12', name: '黑巧棒', nameEn: 'Choco Bar', category: 'snack', path: '商品素材/零食类/巧克力能量棒.png' },
  { id: 's13', name: '黑巧饼干', nameEn: 'Choco Cookies', category: 'snack', path: '商品素材/零食类/巧克力饼干.png' },
  { id: 's14', name: '黑巧麦芬', nameEn: 'Choco Muffin', category: 'snack', path: '商品素材/零食类/巧克力麦芬.png' },
  { id: 's15', name: '彩虹豆', nameEn: 'Choco Buttons', category: 'snack', path: '商品素材/零食类/彩色巧克力豆.png' },
  { id: 's16', name: '炸鸡块', nameEn: 'Fried Chicken', category: 'snack', path: '商品素材/零食类/日式炸鸡块.png' },
  { id: 's17', name: '柠檬糖', nameEn: 'Lemon Candy', category: 'snack', path: '商品素材/零食类/柠檬糖.png' },
  { id: 's18', name: '榴莲冻干', nameEn: 'Dried Durian', category: 'snack', path: '商品素材/零食类/榴莲冻干.png' },
  { id: 's19', name: '沙琪玛', nameEn: 'Sachima', category: 'snack', path: '商品素材/零食类/沙琪玛.png' },
  { id: 's20', name: '海盐饼干', nameEn: 'Sea Salt Crackers', category: 'snack', path: '商品素材/零食类/海盐饼干.png' },
  { id: 's21', name: '海鲜泡面', nameEn: 'Seafood Noodles', category: 'snack', path: '商品素材/零食类/海鲜泡面.png' },
  { id: 's22', name: '烧烤薯片', nameEn: 'BBQ Chips', category: 'snack', path: '商品素材/零食类/烧烤味薯片.png' },
  { id: 's23', name: '焦糖布丁', nameEn: 'Caramel Pudding', category: 'snack', path: '商品素材/零食类/焦糖布丁.png' },
  { id: 's24', name: '爆米花', nameEn: 'Caramel Popcorn', category: 'snack', path: '商品素材/零食类/焦糖爆米花.png' },
  { id: 's25', name: '牛肉干', nameEn: 'Beef Jerky', category: 'snack', path: '商品素材/零食类/牛肉干.png' },
  { id: 's26', name: '牛肉脆片', nameEn: 'Beef Crisps', category: 'snack', path: '商品素材/零食类/牛肉脆片.png' },
  { id: 's27', name: '牛肉面', nameEn: 'Beef Noodle Cup', category: 'snack', path: '商品素材/零食类/番茄牛肉面.png' },
  { id: 's28', name: '白巧球', nameEn: 'White Choco', category: 'snack', path: '商品素材/零食类/白巧克力球.png' },
  { id: 's29', name: '真知棒', nameEn: 'Swirl Lollipop', category: 'snack', path: '商品素材/零食类/真知棒.png' },
  { id: 's30', name: '糖霜圈', nameEn: 'Frosted Donut', category: 'snack', path: '商品素材/零食类/糖霜甜甜圈.png' },
  { id: 's31', name: '糯米糕', nameEn: 'Red Bean Mochi', category: 'snack', path: '商品素材/零食类/红豆糯米糕.png' },
  { id: 's32', name: '绿豆方糖', nameEn: 'Mung Bean Candy', category: 'snack', path: '商品素材/零食类/绿豆方糖.png' },
  { id: 's33', name: '绿豆糕', nameEn: 'Mung Bean Cake', category: 'snack', path: '商品素材/零食类/绿豆糕.png' },
  { id: 's34', name: '草莓奶糖', nameEn: 'Berry Toffee', category: 'snack', path: '商品素材/零食类/草莓奶糖.png' },
  { id: 's35', name: '草莓软糖', nameEn: 'Strawberry Gummy', category: 'snack', path: '商品素材/零食类/草莓软糖.png' },
  { id: 's36', name: '葡萄软糖', nameEn: 'Grape Gummy', category: 'snack', path: '商品素材/零食类/葡萄软糖.png' },
  { id: 's37', name: '蓝莓麦芬', nameEn: 'Blueberry Muffin', category: 'snack', path: '商品素材/零食类/蓝莓麦芬.png' },
  { id: 's38', name: '豚骨拉面', nameEn: 'Tonkotsu Ramen', category: 'snack', path: '商品素材/零食类/豚骨拉面.png' },
  { id: 's39', name: '辣条', nameEn: 'Spicy Strips', category: 'snack', path: '商品素材/零食类/辣条.png' },
  { id: 's40', name: '脆薯片', nameEn: 'Crispy Chips', category: 'snack', path: '商品素材/零食类/香香脆薯片.png' },
  { id: 's41', name: '鲜虾杯面', nameEn: 'Shrimp Noodles', category: 'snack', path: '商品素材/零食类/鲜虾鱼丸杯面.png' },
  { id: 's42', name: '鸡排餐盒', nameEn: 'Chicken Bento', category: 'snack', path: '商品素材/零食类/鸡排餐盒.png' },
  { id: 's43', name: '三明治', nameEn: 'Chicken Sandwich', category: 'snack', path: '商品素材/零食类/鸡腿三明治.png' },
  { id: 's44', name: '黄油曲奇', nameEn: 'Butter Cookies', category: 'snack', path: '商品素材/零食类/黄油曲奇.png' },
  { id: 's45', name: '黑巧克力', nameEn: 'Dark Chocolate', category: 'snack', path: '商品素材/零食类/黑巧克力.png' },
  { id: 'y01', name: '口罩', nameEn: 'Face Mask', category: 'daily', path: '商品素材/日用品类/一次性口罩.png' },
  { id: 'y02', name: '牙线', nameEn: 'Dental Floss', category: 'daily', path: '商品素材/日用品类/一次性牙线.png' },
  { id: 'y03', name: '夜用巾', nameEn: 'Overnight Pads', category: 'daily', path: '商品素材/日用品类/夜用卫生巾.png' },
  { id: 'y04', name: '护发精油', nameEn: 'Hair Oil', category: 'daily', path: '商品素材/日用品类/护发精油.png' },
  { id: 'y05', name: '日用巾', nameEn: 'Daytime Pads', category: 'daily', path: '商品素材/日用品类/日用卫生巾.png' },
  { id: 'y06', name: '洗洁精', nameEn: 'Lemon Dish Soap', category: 'daily', path: '商品素材/饮品类/柠檬洗洁精.png' },
  { id: 'y07', name: '沐浴露', nameEn: 'Body Wash', category: 'daily', path: '商品素材/日用品类/沐浴露.png' },
  { id: 'y08', name: '洗发水', nameEn: 'Shampoo', category: 'daily', path: '商品素材/日用品类/洗发水.png' },
  { id: 'y09', name: '洗手液', nameEn: 'Hand Soap', category: 'daily', path: '商品素材/日用品类/洗手液.png' },
  { id: 'y10', name: '漱口水', nameEn: 'Mouthwash', category: 'daily', path: '商品素材/饮品类/漱口水.png' },
  { id: 'y11', name: '牙膏', nameEn: 'Toothpaste', category: 'daily', path: '商品素材/日用品类/牙膏.png' },
  { id: 'y12', name: '牛奶香皂', nameEn: 'Milk Honey Soap', category: 'daily', path: '商品素材/日用品类/牛奶蜂蜜香皂.png' },
  { id: 'y13', name: '清新剂', nameEn: 'Air Freshener', category: 'daily', path: '商品素材/日用品类/空气清新剂.png' },
  { id: 'y14', name: '酒精湿巾', nameEn: 'Alcohol Wipes', category: 'daily', path: '商品素材/日用品类/酒精湿巾.png' },
  { id: 'y15', name: '防晒霜', nameEn: 'Sunscreen', category: 'daily', path: '商品素材/日用品类/防晒霜.png' },
  { id: 'y16', name: '驱蚊液', nameEn: 'Bug Spray', category: 'daily', path: '商品素材/日用品类/驱蚊液.png' },
  { id: 't01', name: '沙拉酱', nameEn: 'Salad Dressing', category: 'seasoning', path: '商品素材/调味品类/沙拉酱.png' },
  { id: 't02', name: '白砂糖', nameEn: 'Sugar', category: 'seasoning', path: '商品素材/调味品类/白砂糖.png' },
  { id: 't03', name: '管状芥末', nameEn: 'Wasabi Tube', category: 'seasoning', path: '商品素材/调味品类/管状芥末.png' },
  { id: 't04', name: '芥末酱', nameEn: 'Mustard', category: 'seasoning', path: '商品素材/调味品类/芥末酱.png' },
  { id: 't05', name: '蕃茄酱', nameEn: 'Ketchup', category: 'seasoning', path: '商品素材/调味品类/蕃茄酱.png' },
  { id: 't06', name: '蚝油', nameEn: 'Oyster Sauce', category: 'seasoning', path: '商品素材/调味品类/蚝油.png' },
  { id: 't07', name: '蛋黄酱', nameEn: 'Mayo', category: 'seasoning', path: '商品素材/调味品类/蛋黄酱.png' },
  { id: 't08', name: '辣椒酱', nameEn: 'Chili Sauce', category: 'seasoning', path: '商品素材/调味品类/辣椒酱.png' },
  { id: 't09', name: '酱油', nameEn: 'Soy Sauce', category: 'seasoning', path: '商品素材/调味品类/酱油.png' },
  { id: 't10', name: '食盐', nameEn: 'Salt', category: 'seasoning', path: '商品素材/调味品类/食盐.png' },
  { id: 't11', name: '胡椒海盐', nameEn: 'Pepper Sea Salt', category: 'seasoning', path: '商品素材/调味品类/黑胡椒海盐.png' },
];

ZQ.CATEGORY_NAMES_ZH = { drink: '饮品', snack: '零食', daily: '日用品', seasoning: '调味品' };
ZQ.CATEGORY_NAMES_EN = { drink: 'Drinks', snack: 'Snacks', daily: 'Household', seasoning: 'Condiments' };

/* 当前语言的品类名 */
ZQ.catName = function (category) {
  var map = ZQ.isEn() ? ZQ.CATEGORY_NAMES_EN : ZQ.CATEGORY_NAMES_ZH;
  return map[category] || category;
};

/* 商品索引与当前语言商品名（固定题只存 itemId，切语言时按 id 取名） */
ZQ.ITEM_BY_ID = {};
for (var ii = 0; ii < ZQ.ITEMS.length; ii++) ZQ.ITEM_BY_ID[ZQ.ITEMS[ii].id] = ZQ.ITEMS[ii];
ZQ.itemName = function (item) {
  if (!item) return '';
  var base = item.itemId ? ZQ.ITEM_BY_ID[item.itemId] : item;
  if (!base) return item.name || '';
  return (ZQ.isEn() && base.nameEn) ? base.nameEn : base.name;
};

/* 运行素材：原图保留为母版，页面优先加载 512px 优化副本；缺失时由渲染层回退原图。 */
ZQ.itemRuntimePath = function (item) {
  if (!item || !item.path) return '';
  return item.path.replace(/^商品素材\//, '商品素材/优化/');
};
