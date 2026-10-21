/* 音效：用 WebAudio 合成，无需任何音频素材。含全局静音开关（存于存档 settings.sound）。 */
window.ZQ = window.ZQ || {};

(function () {
  var ctx = null;
  var enabled = true;

  function ensureCtx() {
    if (!ctx) {
      var C = window.AudioContext || window.webkitAudioContext;
      if (!C) return null;
      ctx = new C();
    }
    // 浏览器要求用户手势后才能播放
    if (ctx.state === 'suspended' && ctx.resume) ctx.resume();
    return ctx;
  }

  /** 单个音符：freq 频率(Hz)，dur 时长(s)，type 波形，gain 音量，delay 延迟(s) */
  function tone(freq, dur, type, gain, delay) {
    if (!enabled) return;
    var c = ensureCtx();
    if (!c) return;
    var t0 = c.currentTime + (delay || 0);
    var osc = c.createOscillator();
    var g = c.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain || 0.16, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  }

  ZQ.audio = {
    setEnabled: function (v) { enabled = !!v; },
    isEnabled: function () { return enabled; },
    /** 首次用户手势时调用，解锁音频上下文 */
    unlock: function () { ensureCtx(); },

    ding:  function () { tone(1180, 0.16, 'sine', 0.14, 0); tone(1760, 0.12, 'sine', 0.08, 0.03); },
    click: function () { tone(520, 0.06, 'triangle', 0.10, 0); },
    back:  function () { tone(300, 0.09, 'triangle', 0.10, 0); },
    error: function () { tone(200, 0.12, 'square', 0.08, 0); tone(150, 0.16, 'square', 0.07, 0.1); },
    coin:  function () { tone(1320, 0.09, 'square', 0.09, 0); tone(1980, 0.14, 'square', 0.07, 0.06); },
    star:  function (i) { tone(880 + (i || 0) * 220, 0.14, 'triangle', 0.13, (i || 0) * 0.12); },
    win:   function () { [660, 880, 1100, 1320].forEach(function (f, i) { tone(f, 0.22, 'triangle', 0.13, i * 0.11); }); },
    lose:  function () { [440, 370, 294].forEach(function (f, i) { tone(f, 0.26, 'sine', 0.12, i * 0.14); }); },
    tick:  function () { tone(1500, 0.05, 'square', 0.06, 0); },
    page:  function () { tone(420, 0.08, 'sine', 0.09, 0); tone(620, 0.08, 'sine', 0.07, 0.05); },

    /* — 存钱罐仪式专用 — */
    /** 扭蛋机摇杆咔哒（快速旋转时每 110ms 一次，模拟机械咬合） */
    crank: function () { tone(240, 0.035, 'square', 0.07, 0); tone(360, 0.045, 'square', 0.05, 0.02); },
    /** 扭蛋咕噜滚出（闷响下滑，两个低音） */
    gachaDrop: function () { tone(300, 0.18, 'sine', 0.12, 0); tone(220, 0.22, 'sine', 0.10, 0.08); },
    /** 扭蛋"啪"的一声弹开 */
    gachaPop: function () { tone(880, 0.08, 'triangle', 0.12, 0); tone(1400, 0.07, 'triangle', 0.08, 0.05); },
    /** 中奖叮（两个上行音，比 coin 更亮） */
    rewardDing: function () { tone(1100, 0.10, 'sine', 0.12, 0); tone(1650, 0.14, 'sine', 0.10, 0.04); tone(2200, 0.16, 'sine', 0.08, 0.10); },
    /** 谢谢惠顾的呜（下行，淡淡的遗憾） */
    rewardAw: function () { tone(520, 0.18, 'sine', 0.10, 0); tone(400, 0.24, 'sine', 0.08, 0.10); },
    /** UFO 绿色光束持续嗡鸣（带颤音：一个低频正弦 + 一个稍高，差频产生 beat） */
    ufoHum: function () {
      if (!enabled) return;
      var c = ensureCtx(); if (!c) return;
      var t0 = c.currentTime;
      var o1 = c.createOscillator(), o2 = c.createOscillator();
      var g = c.createGain();
      o1.type = 'sine'; o2.type = 'sine';
      o1.frequency.setValueAtTime(120, t0);
      o2.frequency.setValueAtTime(135, t0);
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(0.10, t0 + 0.35);
      g.gain.setValueAtTime(0.10, t0 + 3.2);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 3.6);
      o1.connect(g); o2.connect(g); g.connect(c.destination);
      o1.start(t0); o2.start(t0);
      o1.stop(t0 + 3.7); o2.stop(t0 + 3.7);
    },
    /** UFO 飞走嗖（高频正弦快速下滑） */
    ufoFly: function () {
      var c = ensureCtx(); if (!c) return;
      var t0 = c.currentTime;
      var o = c.createOscillator();
      var g = c.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(1800, t0);
      o.frequency.exponentialRampToValueAtTime(180, t0 + 0.85);
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(0.10, t0 + 0.06);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.95);
      o.connect(g); g.connect(c.destination);
      o.start(t0); o.stop(t0 + 1.0);
    },
  };
})();
