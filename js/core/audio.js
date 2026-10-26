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

  /* ================= 背景音乐：Let's Go Shopping（Purrple Cat） =================
     来源 https://opengameart.org/content/lets-go-shopping-0 ，CC-BY 4.0，
     文件随包放在 audio/ 下，用 <audio> 循环播放，避免合成音色失真。 */
  var MUSIC_VOL = 0.28;                          // 0~1，音乐音量（混在音效之下）
  var MUSIC_SRC = 'audio/lets_go_shopping.mp3';
  var MUSIC_XFADE = 2.4;                         // 结尾交叉淡化时长（秒）

  var musicOn = true;      // 用户开关（设置里可单独关）
  var wantMusic = false;   // 当前界面是否需要 BGM
  var musicEl = null;      // 当前在播的那一路
  var musicEl2 = null;     // 交叉淡化用的备用路（懒创建）
  var loopTimer = null;    // 临近结尾的监测
  var pauseTimer = null;
  var noiseBuf = null;

  /** 0.5s 白噪声缓冲：笑声字头的送气声复用（只生成一次） */
  function noise() {
    if (!noiseBuf) {
      noiseBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.5), ctx.sampleRate);
      var d = noiseBuf.getChannelData(0);
      for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    return noiseBuf;
  }

  /** 单声笑「哈」：三角波急速下滑 + 双共振峰做元音 a，再叠一点送气噪声当字头 */
  function laughHa(c, t, freq, vol, isLast) {
    var dur = isLast ? 0.16 : 0.10;
    var o = c.createOscillator(), g = c.createGain();
    var f1 = c.createBiquadFilter(), f2 = c.createBiquadFilter();
    o.type = 'triangle';
    o.frequency.setValueAtTime(freq, t);
    /* 每声内部音高快速下滑，这是「笑出来」而不是「唱出来」的关键 */
    o.frequency.exponentialRampToValueAtTime(freq * 0.82, t + dur * 0.7);

    /* 元音 a 的两个共振峰：880Hz 定音色、1350Hz 提亮度 */
    f1.type = 'bandpass'; f1.frequency.setValueAtTime(880, t); f1.Q.setValueAtTime(2.2, t);
    f2.type = 'bandpass'; f2.frequency.setValueAtTime(1350, t); f2.Q.setValueAtTime(3, t);

    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f1); o.connect(f2);
    f1.connect(g); f2.connect(g); g.connect(c.destination);
    o.start(t); o.stop(t + dur + 0.03);

    /* 字头「h」的送气声：短促高频噪声，比元音早一丝，笑才有颗粒感 */
    var s = c.createBufferSource(), bp = c.createBiquadFilter(), ng = c.createGain();
    s.buffer = noise();
    bp.type = 'bandpass'; bp.frequency.setValueAtTime(2200, t); bp.Q.setValueAtTime(1.1, t);
    ng.gain.setValueAtTime(0, t);
    ng.gain.linearRampToValueAtTime(vol * 0.5, t + 0.01);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    s.connect(bp); bp.connect(ng); ng.connect(c.destination);
    s.start(t); s.stop(t + 0.09);
  }

  /** 新建一路音乐元素：预加载、音量从 0 起以便淡入 */
  function makeEl() {
    var el = new Audio();
    el.src = MUSIC_SRC;
    el.loop = true;        // 兜底：极端情况下（时长未知）仍能循环，不至于断掉
    el.preload = 'auto';
    el.volume = 0;
    return el;
  }

  /** 单路音量渐变；每个元素各挂一个定时器，两路可以同时互不干扰 */
  function ramp(el, target, ms, done) {
    if (el._fade) { clearInterval(el._fade); el._fade = null; }
    var from = el.volume;
    var steps = Math.max(1, Math.round(ms / 40));
    var i = 0;
    el._fade = setInterval(function () {
      i++;
      var v = from + (target - from) * (i / steps);
      el.volume = Math.min(1, Math.max(0, v));
      if (i >= steps) {
        clearInterval(el._fade); el._fade = null;
        if (done) done();
      }
    }, 40);
  }

  /** 清掉两路的渐变定时器、循环监测与兜底暂停 */
  function clearAudioTimers() {
    [musicEl, musicEl2].forEach(function (el) {
      if (el && el._fade) { clearInterval(el._fade); el._fade = null; }
    });
    if (loopTimer) { clearInterval(loopTimer); loopTimer = null; }
    if (pauseTimer) { clearTimeout(pauseTimer); pauseTimer = null; }
  }

  /** 结尾交叉淡化：备用路从头起播，两路一进一出，衔接处听不出断点 */
  function crossfade() {
    var out = musicEl;
    var inc = musicEl2 || (musicEl2 = makeEl());
    /* 淡出的一路关掉 loop，避免它在这 2.4 秒内先播到结尾又回卷重播，出现一声突兀的重来 */
    out.loop = false;
    inc.loop = true;
    try { inc.currentTime = 0; } catch (e) {}
    inc.volume = 0;
    var p = inc.play();
    if (p && p.catch) p.catch(function () {});
    var ms = MUSIC_XFADE * 1000;
    ramp(inc, MUSIC_VOL, ms);
    ramp(out, 0, ms, function () { out.pause(); });
    /* 交换角色：下一轮由新的一路接续 */
    musicEl = inc;
    musicEl2 = out;
  }

  /** 监测当前一路是否临近结尾，到点就交叉淡化 */
  function watchLoop() {
    if (loopTimer) return;
    loopTimer = setInterval(function () {
      var el = musicEl;
      if (!el || el.paused) return;
      var d = el.duration;
      if (!d || !isFinite(d)) return;
      if (d - el.currentTime <= MUSIC_XFADE) crossfade();
    }, 250);
  }

  function startMusic() {
    if (!musicOn || !wantMusic || !gestured) return;
    clearAudioTimers();
    var el = musicEl || (musicEl = makeEl());
    /* 只在真正暂停时才 play，重复调用不会再起一层播放 */
    if (el.paused) {
      var d = el.duration;
      /* 暂停点已贴近结尾时跳回开头，避免刚恢复就立刻淡化 */
      if (d && isFinite(d) && d - el.currentTime <= MUSIC_XFADE) el.currentTime = 0;
      el.loop = true;
      el.volume = 0;
      var p = el.play();
      if (p && p.catch) p.catch(function () {});
    }
    ramp(el, MUSIC_VOL, 800);
    watchLoop();
  }

  function stopMusic() {
    clearAudioTimers();
    [musicEl, musicEl2].forEach(function (el) {
      if (!el) return;
      ramp(el, 0, 220, function () { el.pause(); });
    });
    /* 兜底：即使渐变定时器被后续 startMusic 清掉，也一定会暂停 */
    pauseTimer = setTimeout(function () {
      pauseTimer = null;
      [musicEl, musicEl2].forEach(function (el) { if (el) el.pause(); });
    }, 260);
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

    /** 妈妈招呼：一串短促俏皮的笑声「哈哈哈哈哈」（四声抬调，气声 + 元音共鸣） */
    momGreet: function () {
      if (!enabled) return;
      var c = ensureCtx();
      if (!c) return;
      var t0 = c.currentTime + 0.02;
      /* 四声逐级抬高音高，越笑越亮；音量递减做出收尾的语气 */
      var seq = [470, 512, 556, 610];
      seq.forEach(function (f, i) {
        laughHa(c, t0 + i * 0.095, f, i === seq.length - 1 ? 0.13 : 0.15, i === 3);
      });
    },

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
