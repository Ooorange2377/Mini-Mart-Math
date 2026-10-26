/* 音效与背景音乐：全部用 WebAudio 实时合成，无需任何音频素材。
   含全局静音开关（存于存档 settings.sound）与独立的音乐开关（settings.music）。 */
window.ZQ = window.ZQ || {};

(function () {
  var ctx = null;
  var enabled = true;
  var gestured = false;

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

  /* ================= 背景音乐：便利店 Bossa（纯合成，小节队列调度） ================= */
  var MUSIC_VOL = 0.16;
  var BPM = 88;
  var BEAT = 60 / BPM;
  var BAR = BEAT * 4;
  /* 4 小节循环：Cmaj7 → Am7 → Dm7 → G7（电钢和弦音 MIDI + 贝斯根音 MIDI） */
  var PROG = [
    { notes: [60, 64, 67, 71], bass: 48 },
    { notes: [57, 60, 64, 67], bass: 45 },
    { notes: [62, 65, 69, 72], bass: 50 },
    { notes: [55, 59, 62, 65], bass: 43 }
  ];

  var musicOn = true;      // 用户开关（设置里可单独关）
  var wantMusic = false;   // 当前界面是否需要 BGM
  var musicPlaying = false;
  var musicTimer = null;
  var nextBarTime = 0;
  var barIndex = 0;
  var musicGain = null;
  var noiseBuf = null;

  function mf(midi) { return 440 * Math.pow(2, (midi - 69) / 12); }

  /** 0.5s 白噪声缓冲，刷镲与沙锤共用（只生成一次） */
  function noise() {
    if (!noiseBuf) {
      noiseBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.5), ctx.sampleRate);
      var d = noiseBuf.getChannelData(0);
      for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    return noiseBuf;
  }

  /** 电钢琴：正弦基音 + 弱八度泛音，低通滤掉毛刺，软起音长衰减 */
  function ep(t, freq, dur, vol) {
    if (!ctx || !musicGain) return;
    var o1 = ctx.createOscillator(), o2 = ctx.createOscillator();
    var g1 = ctx.createGain(), g2 = ctx.createGain();
    var lp = ctx.createBiquadFilter();
    o1.type = 'sine'; o1.frequency.setValueAtTime(freq, t);
    o2.type = 'sine'; o2.frequency.setValueAtTime(freq * 2, t);
    g2.gain.setValueAtTime(0.28, t);
    lp.type = 'lowpass'; lp.frequency.setValueAtTime(2400, t);
    g1.gain.setValueAtTime(0, t);
    g1.gain.linearRampToValueAtTime(vol, t + 0.014);
    g1.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o1.connect(g1); o2.connect(g2); g2.connect(g1);
    g1.connect(lp); lp.connect(musicGain);
    o1.start(t); o1.stop(t + dur + 0.05);
    o2.start(t); o2.stop(t + dur + 0.05);
  }

  /** 拨弦贝斯：三角波 + 低通压到 420Hz，短促有弹性 */
  function bass(t, freq, dur, vol) {
    if (!ctx || !musicGain) return;
    var o = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter();
    o.type = 'triangle'; o.frequency.setValueAtTime(freq, t);
    lp.type = 'lowpass'; lp.frequency.setValueAtTime(420, t);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(lp); lp.connect(musicGain);
    o.start(t); o.stop(t + dur + 0.05);
  }

  /** 轻刷鼓：白噪声过带通，模拟鼓刷扫过鼓皮的沙沙声 */
  function brush(t, vol) {
    if (!ctx || !musicGain) return;
    var s = ctx.createBufferSource(); s.buffer = noise();
    var bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(2600, t);
    bp.Q.setValueAtTime(0.9, t);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    s.connect(bp); bp.connect(g); g.connect(musicGain);
    s.start(t); s.stop(t + 0.22);
  }

  /** 沙锤：高频噪声极短衰减，落在八分音符上 */
  function shaker(t, vol) {
    if (!ctx || !musicGain) return;
    var s = ctx.createBufferSource(); s.buffer = noise();
    var hp = ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.setValueAtTime(6500, t);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    s.connect(hp); hp.connect(g); g.connect(musicGain);
    s.start(t); s.stop(t + 0.07);
  }

  /** 门铃点缀：两个高音正弦，模拟便利店自动门 */
  function bell(t) {
    if (!ctx || !musicGain) return;
    [1568, 2093].forEach(function (f, i) {
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(f, t);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(i ? 0.016 : 0.026, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
      o.connect(g); g.connect(musicGain);
      o.start(t); o.stop(t + 0.95);
    });
  }

  /** 排一小节：电钢切分和弦 + 贝斯 根音/五度/提前根音 + 刷镲 + 沙锤 + 偶发门铃 */
  function playBar(i, t0) {
    var p = PROG[i % 4];
    var next = PROG[(i + 1) % 4];

    [0, 1.5, 2.5].forEach(function (b) {
      p.notes.forEach(function (m) { ep(t0 + b * BEAT, mf(m), 0.85, 0.045); });
    });

    bass(t0, mf(p.bass), 0.55, 0.10);
    bass(t0 + 2.5 * BEAT, mf(p.bass + 7), 0.5, 0.075);
    bass(t0 + 3.5 * BEAT, mf(next.bass), 0.35, 0.06);

    brush(t0 + 1 * BEAT, 0.05);
    brush(t0 + 3 * BEAT, 0.05);

    for (var s = 0; s < 8; s++) shaker(t0 + s * BEAT / 2, s % 2 ? 0.012 : 0.008);

    if (i % 4 === 3) bell(t0 + 2 * BEAT + Math.random() * 0.3);
  }

  /** 前瞻调度：提前 0.4s 把后续小节排进音频时间轴，循环无缝 */
  function scheduleMusic() {
    if (!ctx) return;
    while (nextBarTime < ctx.currentTime + 0.4) {
      playBar(barIndex, nextBarTime);
      barIndex++;
      nextBarTime += BAR;
    }
  }

  function startMusic() {
    if (musicPlaying || !musicOn || !wantMusic || !gestured) return;
    var c = ensureCtx();
    if (!c) return;
    if (c.state !== 'running') {
      if (c.resume) {
        c.resume().then(function () {
          if (c.state === 'running') startMusic();
        }).catch(function () {});
      }
      return;
    }
    musicGain = musicGain || c.createGain();
    musicGain.connect(c.destination);
    musicGain.gain.cancelScheduledValues(c.currentTime);
    musicGain.gain.setValueAtTime(0.0001, c.currentTime);
    musicGain.gain.linearRampToValueAtTime(MUSIC_VOL, c.currentTime + 1.2);
    musicPlaying = true;
    barIndex = 0;
    nextBarTime = c.currentTime + 0.15;
    if (musicTimer) clearInterval(musicTimer);
    musicTimer = setInterval(scheduleMusic, 60);
    scheduleMusic();
  }

  function stopMusic() {
    if (!musicPlaying) return;
    musicPlaying = false;
    if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
    if (ctx && musicGain) {
      musicGain.gain.cancelScheduledValues(ctx.currentTime);
      musicGain.gain.setValueAtTime(musicGain.gain.value, ctx.currentTime);
      musicGain.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 0.6);
    }
  }

  ZQ.audio = {
    setEnabled: function (v) { enabled = !!v; },
    isEnabled: function () { return enabled; },
    /** 首次用户手势时调用，解锁音频上下文 */
    unlock: function () {
      gestured = true;
      ensureCtx();
      startMusic();
    },

    /* ---- 背景音乐控制 ---- */
    setMusicEnabled: function (v) {
      musicOn = !!v;
      if (musicOn) startMusic(); else stopMusic();
    },
    isMusicEnabled: function () { return musicOn; },
    /** 按界面切换 BGM：游戏内静音，其余界面循环播放 */
    bgm: function (screen) {
      wantMusic = screen !== 'game';
      if (wantMusic) startMusic(); else stopMusic();
    },

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
    /** 金币掉进玻璃瓶：低频落底闷点 + 高频玻璃脆响（每枚金币落底时各响一次） */
    coinDrop: function () { tone(700, 0.06, 'sine', 0.10, 0); tone(2100, 0.07, 'triangle', 0.10, 0.01); tone(3150, 0.12, 'sine', 0.06, 0.03); },
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
    /** UFO 从远处飞来：低频嗡鸣 + 多普勒式上滑音（远方小声 → 靠近变响变高） */
    ufoIn: function () {
      var c = ensureCtx(); if (!c) return;
      var t0 = c.currentTime;
      var o = c.createOscillator();
      var g = c.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(160, t0);
      o.frequency.linearRampToValueAtTime(340, t0 + 0.9);
      g.gain.setValueAtTime(0.015, t0);
      g.gain.linearRampToValueAtTime(0.09, t0 + 0.85);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.05);
      o.connect(g); g.connect(c.destination);
      o.start(t0); o.stop(t0 + 1.1);
    },
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
    /** UFO 故障消失：电流滋滋（方波颤音）+ 两声高频电火花 */
    ufoZap: function () {
      var c = ensureCtx(); if (!c) return;
      var t0 = c.currentTime;
      var o = c.createOscillator();
      var g = c.createGain();
      o.type = 'square';
      o.frequency.setValueAtTime(1400, t0);
      o.frequency.exponentialRampToValueAtTime(120, t0 + 0.5);
      g.gain.setValueAtTime(0.07, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.55);
      o.connect(g); g.connect(c.destination);
      o.start(t0); o.stop(t0 + 0.6);
      tone(2600, 0.05, 'sawtooth', 0.05, 0.05);
      tone(1900, 0.05, 'sawtooth', 0.05, 0.14);
    },
  };
})();
