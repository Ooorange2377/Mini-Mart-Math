/* 手势状态机：只做「指针按下 → 越过阈值 → 捕获 → 跟手 → 收尾」的判定，
 * 不移动任何元素、不改任何 CSS、不注册 click 监听。
 *
 * 为什么不能在 pointerdown 就 setPointerCapture：
 * 捕获后 pointerup 会被重定向到被捕获元素，浏览器据此把 click 的 target 也改掉，
 * 卡片上的「装备」按钮 click 就永远到不了委托监听（P0 踩过的坑）。
 * 因此只有位移越过阈值、确认是拖拽而非点击时才捕获。
 *
 * 用法：
 *   var g = ZQ.ui.gesture.drag(el, {
 *     axis: 'x',                    // 'x' | 'y'，判定与取 dx/dy 都按主方向
 *     threshold: 6,                 // px：位移严格大于该值才进入拖拽（与旧实现一致）
 *     onStart: function (dx, dy, e) {},          // 越过阈值时调用一次（已捕获）
 *     onMove:  function (dx, dy, e) {},          // 含越过阈值的那一次 move
 *     onEnd:   function (info, cancelled) {},    // info: { dx, dy, moved, captured }
 *   });
 *   g.destroy();
 */
window.ZQ = window.ZQ || {};
ZQ.ui = ZQ.ui || {};

(function () {
  var PRIMARY_BUTTON = 0;

  ZQ.ui.gesture = {
    drag: function (el, opts) {
      opts = opts || {};
      var axis = opts.axis === 'y' ? 'y' : 'x';
      var threshold = typeof opts.threshold === 'number' ? opts.threshold : 6;
      var drag = null;        /* { x0, y0, moved, captured, pointerId } */
      var destroyed = false;

      function onDown(e) {
        if (destroyed) return;
        if (e.button !== undefined && e.button !== PRIMARY_BUTTON) return;
        /* 多指：后按下的指针直接重置基准（与旧实现同一算法，不做 pointerId 仲裁） */
        drag = { x0: e.clientX, y0: e.clientY, moved: 0, captured: false, pointerId: e.pointerId };
      }

      function onMove(e) {
        if (destroyed || !drag) return;
        var dx = e.clientX - drag.x0;
        var dy = e.clientY - drag.y0;
        var d = axis === 'y' ? dy : dx;
        drag.moved = Math.max(drag.moved, Math.abs(d));
        if (!drag.captured) {
          if (drag.moved <= threshold) return;   /* 还只是点击抖动：不动、不抢事件 */
          drag.captured = true;
          try { el.setPointerCapture(e.pointerId); } catch (err) {}
          if (opts.onStart) opts.onStart(dx, dy, e);
        }
        if (opts.onMove) opts.onMove(dx, dy, e);
      }

      function end(e, cancelled) {
        if (destroyed || !drag) return;
        var info = {
          dx: e ? e.clientX - drag.x0 : 0,
          dy: e ? e.clientY - drag.y0 : 0,
          moved: drag.moved,
          captured: drag.captured
        };
        var pid = (e && e.pointerId !== undefined) ? e.pointerId : drag.pointerId;
        drag = null;
        if (info.captured && pid !== undefined && el.hasPointerCapture && el.hasPointerCapture(pid)) {
          el.releasePointerCapture(pid);
        }
        if (opts.onEnd) opts.onEnd(info, !!cancelled);
      }

      function onUp(e) { end(e, false); }
      function onCancel(e) { end(e, true); }

      el.addEventListener('pointerdown', onDown);
      el.addEventListener('pointermove', onMove);
      el.addEventListener('pointerup', onUp);
      el.addEventListener('pointercancel', onCancel);

      return {
        destroy: function () {
          if (destroyed) return;
          destroyed = true;
          el.removeEventListener('pointerdown', onDown);
          el.removeEventListener('pointermove', onMove);
          el.removeEventListener('pointerup', onUp);
          el.removeEventListener('pointercancel', onCancel);
          if (drag && drag.captured && el.hasPointerCapture && el.hasPointerCapture(drag.pointerId)) {
            el.releasePointerCapture(drag.pointerId);
          }
          drag = null;
        }
      };
    }
  };
})();
