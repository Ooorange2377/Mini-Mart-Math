/* ITEMS 下拉清单：默认收起为按钮，点击头部展开明细；每行显示勾选框 + 商品名 + 单价（不显示总价），
 * 点击行取消选择。件数 ITEMS (N) 显示在按钮上；新增行滑入、空→非空时按钮轻弹提示。 */
window.ZQ = window.ZQ || {};
ZQ.ui = ZQ.ui || {};

(function () {
  /** 上一次同步的已选下标（用于识别新增行 / 空→非空 的提示动画） */
  var lastSel = [];

  ZQ.ui.list = {
    /** 同步清单行、件数标题与空态 */
    sync: function (holderEl, lv, session) {
      if (!holderEl) return;
      var list = holderEl.querySelector('.items-list');
      var sel = session.selected.slice().sort(function (a, b) { return a - b; });
      var wasEmpty = lastSel.length === 0;

      var prev = {};
      for (var p = 0; p < lastSel.length; p++) prev[lastSel[p]] = true;

      var html = '';
      for (var i = 0; i < sel.length; i++) {
        var item = lv.items[sel[i]];
        html += '<li class="items-row' + (prev[sel[i]] ? '' : ' is-new') + '" data-slot="' + sel[i] + '">' +
          '<span class="row-box"></span><span class="row-name">' + ZQ.itemName(item) + '</span>' +
          '<span class="row-price">' + ZQ.money.fmt2(item.price) + '</span>' +
        '</li>';
      }
      if (list) list.innerHTML = html;
      holderEl.classList.toggle('is-empty', sel.length === 0);

      var cnt = holderEl.querySelector('.note-count');
      if (cnt) cnt.textContent = '(' + sel.length + ')';

      // 首次有商品：头部按钮轻弹一下提示件数变化
      if (wasEmpty && sel.length > 0) {
        holderEl.classList.remove('is-unfold');
        void holderEl.offsetWidth;
        holderEl.classList.add('is-unfold');
      }

      lastSel = sel;
    },

    /** 清空上一次的缓存（换关重渲染时调用，避免误判新增行） */
    reset: function () { lastSel = []; },
  };
})();
