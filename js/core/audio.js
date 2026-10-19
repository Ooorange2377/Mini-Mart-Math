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
  };
})();
