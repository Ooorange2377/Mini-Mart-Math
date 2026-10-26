/* 游戏大厅（Little Chef 风格）：
 *  米白纯底 + 虚线装饰边框 + 角落散落道具插画 + 双层描边大标题 + 顶部统计条 + 双主按钮 + 右侧竖排。
 *  SVG 图标集中在 ICO 对象，后期替换图片资源只改一处。 */
window.ZQ = window.ZQ || {};
ZQ.screens = ZQ.screens || {};

(function () {
  var layer = null;

  /** 最新可玩关卡：第一个已解锁且未通关的关卡，全部通关则返回 0 */
  function latestLevel() {
    for (var lv = 1; lv <= ZQ.totalLevels; lv++) {
      if (!ZQ.store.levelUnlocked(lv)) return 0;
      if (ZQ.store.levelStars(lv) < 1) return lv;
    }
    return 0;
  }

  /* ---------- 玩法说明弹窗（保留，触发点后续改到首次进地图前） ---------- */
  function howToHTML() {
    return '<div class="howto-block">' +
        '<div class="howto-head">' + ZQ.I18N.howToGoalTitle + '</div>' +
        '<p>' + ZQ.I18N.howToGoalText + '</p>' +
      '</div>' +
      '<div class="howto-block">' +
        '<div class="howto-head"><i class="ic-img ic-img-coin"></i>' + ZQ.I18N.howToCoinsTitle + '</div>' +
        '<ul class="howto-list">' +
          '<li><b class="howto-mode">' + ZQ.I18N.howToSavingMode + '</b>：' +
            ZQ.I18N.howToSavingText + '</li>' +
          '<li><b class="howto-mode">' + ZQ.I18N.howToPerfectMode + '</b>：' +
            ZQ.I18N.howToPerfectText.replace('{n}', ZQ.MOM_BONUS_COINS) +
            '<span class="howto-first">（' + ZQ.I18N.howToFirstOnly + '）</span></li>' +
        '</ul>' +
      '</div>';
  }

  function openModal(o) {
    layer = layer || document.getElementById('modal-layer');
    if (!layer) return;
    layer.innerHTML = '';
    var mask = document.createElement('div');
    mask.className = 'modal-mask';
    mask.innerHTML =
      '<div class="modal-simple">' +
        '<div class="ms-title">' + o.title + '</div>' +
        '<div class="ms-text' + (o.rich ? ' is-rich' : '') + '">' + (o.html || o.text) + '</div>' +
        '<div class="ms-actions">' +
          (o.cancel
            ? '<button class="btn-result btn-ghost ms-cancel" type="button">' + o.cancel + '</button>'
            : '') +
          '<button class="btn-result btn-primary ms-ok" type="button">' + o.ok + '</button>' +
        '</div>' +
      '</div>';
    layer.appendChild(mask);
    requestAnimationFrame(function () { mask.classList.add('is-in'); });
    mask.querySelector('.ms-ok').addEventListener('click', function () {
      ZQ.audio.click();
      /* 先执行回调再关闭：回调可能需要读取弹窗内的表单元素 */
      if (o.onOk) o.onOk();
      closeModal();
    });
    var c = mask.querySelector('.ms-cancel');
    if (c) c.addEventListener('click', function () { ZQ.audio.back(); closeModal(); });
    return mask;
  }

  function closeModal() {
    layer = layer || document.getElementById('modal-layer');
    if (layer) layer.innerHTML = '';
  }

  /* ---------- 主渲染 ---------- */
  ZQ.screens.start = {
    render: function () {
      if (!ZQ.store.data) ZQ.store.load();
      var saved = ZQ.store.data || {};
      var totalStars = ZQ.store.totalStars();
      var threeStars = ZQ.store.threeStars ? ZQ.store.threeStars() : Object.keys(saved.threeStarLedger || {}).filter(function (k) { return saved.threeStarLedger[k]; }).length;
      var coins = saved.coins || 0;

      var el = document.createElement('div');
      el.className = 'stage screen-start';
      el.innerHTML =
        // 米白背景 + 隐藏旧地板
        '<div class="hall-bg"></div>' +

        // 左侧妈妈人物
        '<div class="hall-mom" aria-hidden="true">' +
          '<img src="图标素材/妈妈人物.PNG" alt="">' +
          '<span class="mom-light"></span>' +
          '<div class="mom-bubble">' + ZQ.I18N.momGreet + '</div>' +
        '</div>' +

        // 顶部横排：星数 / 三星数 / 零花钱 / 设置
        '<div class="top-bar">' +
          '<div class="top-pill"><div class="top-pill-ic top-pill-ic-star" style="background-image:url(\'图标素材/三星通关数.jpg\')"></div><span>' + totalStars + '</span></div>' +
          '<div class="top-pill"><div class="top-pill-ic top-pill-ic-medal" style="background-image:url(\'图标素材/奖牌.png\')"></div><span>' + threeStars + '</span></div>' +
          '<div class="top-pill"><div class="top-pill-ic top-pill-ic-coin" style="background-image:url(\'图标素材/零花钱.jpg\')"></div><span>' + coins + '</span></div>' +
          '<button class="btn-settings" type="button" aria-label="' + ZQ.I18N.btnSettings + '"><img src="图标素材/设置.PNG" alt=""></button>' +
        '</div>' +

        // 中央标题图片（居中偏上）
        '<div class="hall-title">' +
          '<img src="便利店购物大作战标题.PNG" alt="' + ZQ.I18N.title + '">' +
        '</div>' +

        // 中央双主按钮（纯文字，不带图标）
        '<div class="hall-buttons">' +
          '<button class="btn-hall btn-hall-primary" type="button">' +
            '<span class="btn-text">' + ZQ.I18N.startBegin + '</span>' +
          '</button>' +
          '<button class="btn-hall btn-hall-secondary" type="button">' +
            '<span class="btn-text">' + ZQ.I18N.startLevelSelect + '</span>' +
          '</button>' +
        '</div>' +

        // 右侧竖排：商店 / 道具
        '<div class="hall-side">' +
          '<button class="btn-side" type="button">' +
            '<span class="btn-side-icon"><img src="图标素材/商店.PNG" alt=""></span>' +
            '<span class="btn-side-label">' + ZQ.I18N.btnShop + '</span>' +
          '</button>' +
          '<button class="btn-side" type="button">' +
            '<span class="btn-side-icon"><img src="图标素材/皮肤.PNG" alt=""></span>' +
            '<span class="btn-side-label">' + ZQ.I18N.btnItem + '</span>' +
          '</button>' +
        '</div>';

      /* ---------- 点击妈妈立绘：切成 V2 表情，5 秒后自动换回 ---------- */
      var mom = el.querySelector('.hall-mom');
      var momImg = mom && mom.querySelector('img');
      var momTimer = null;
      function setMom(v2) {
        if (!momImg) return;
        momImg.src = v2 ? '图标素材/妈妈人物V2.PNG' : '图标素材/妈妈人物.PNG';
        /* 环境光层的遮罩跟着换，保证光影仍贴合新立绘轮廓 */
        mom.style.setProperty('--mom-src', v2
          ? "url('图标素材/妈妈人物V2.PNG')"
          : "url('图标素材/妈妈人物.PNG')");
        mom.classList.toggle('is-greet', v2);
      }
      if (mom) {
        mom.addEventListener('click', function () {
          if (momTimer) clearTimeout(momTimer);
          ZQ.audio.momGreet();
          setMom(true);
          momTimer = setTimeout(function () {
            momTimer = null;
            if (!mom.isConnected) return;
            setMom(false);
          }, 3000);
        });
      }

      /* ---------- 事件绑定 ---------- */
      el.querySelector('.btn-hall-primary').addEventListener('click', function () {
        ZQ.audio.unlock(); ZQ.audio.click();
        var lv = latestLevel();
        if (lv) ZQ.app.go('game', { levelId: lv });
        else ZQ.app.go('map');
      });
      el.querySelector('.btn-hall-secondary').addEventListener('click', function () {
        ZQ.audio.unlock(); ZQ.audio.click();
        ZQ.app.go('map');
      });
      el.querySelector('.btn-side:nth-child(1)').addEventListener('click', function () {
        ZQ.audio.click();
        if (ZQ.screens.shop) ZQ.app.go('shop');
      });
      el.querySelector('.btn-side:nth-child(2)').addEventListener('click', function () {
        ZQ.audio.click();
        if (ZQ.screens.skins) ZQ.app.go('skins');
      });
      el.querySelector('.btn-settings').addEventListener('click', function () {
        ZQ.audio.click();
        var st = (ZQ.store.data && ZQ.store.data.settings) || {};
        var sndOn = st.sound !== false;
        var musOn = ZQ.audio.isMusicEnabled();
        function row(id, label, on) {
          return '<label style="display:flex;align-items:center;gap:.8cqw;cursor:pointer">' +
            '<input type="checkbox" id="' + id + '" ' + (on ? 'checked' : '') + ' style="width:1.6cqw;height:1.6cqw">' +
            '<span>' + label + (on ? '（已开启）' : '（已关闭）') + '</span>' +
          '</label>';
        }
        openModal({
          title: ZQ.I18N.btnSettings,
          html: '<div style="font-size:2.2cqw;line-height:1.8">' +
            row('sound-toggle', '音效', sndOn) +
            row('music-toggle', '音乐', musOn) +
            '<div style="margin-top:.9cqw;font-size:1.5cqw;line-height:1.5;color:rgba(27,62,111,.55)">' +
              ZQ.I18N.musicCredit +
            '</div>' +
          '</div>',
          rich: true,
          ok: ZQ.I18N.btnOk,
          onOk: function () {
            var sCb = document.getElementById('sound-toggle');
            var mCb = document.getElementById('music-toggle');
            if (sCb) { ZQ.audio.setEnabled(sCb.checked); ZQ.store.setSound(sCb.checked); }
            if (mCb) { ZQ.audio.setMusicEnabled(mCb.checked); ZQ.store.setMusic(mCb.checked); }
          },
        });
      });

      return el;
    },

    close: closeModal,
  };
})();
