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

  /* ================= 背景音乐 =================
     大厅：Let's Go Shopping（Purrple Cat），来源
       https://opengameart.org/content/lets-go-shopping-0 ，CC-BY 4.0；
     关卡内：bgm-game.m4a（原 bgm-game.mp3 → AAC 96kbps 单声道，210s / 2.3MB）。
     两首都用 <audio> 循环播放、音量统一交给 GainNode（iOS 会忽略 el.volume）；
     每首内部用「双路交叉淡化」接住循环接缝，大厅 ↔ 关卡之间再做一次交叉淡化切换。 */
  var MUSIC_VOL = 0.28;    // 大厅曲音量（0~1，混在音效之下）
  var GAME_VOL = 0.12;     // 关卡内 BGM：约大厅的 43%（−7.4dB），刻意压低，不抢算账注意力
  var MUSIC_XFADE = 2.4;   // 同一首结尾前的循环交叉淡化时长（秒）
  var SWITCH_XFADE = 1.2;  // 大厅 ↔ 关卡 切歌时的交叉淡化时长（秒）

  var musicOn = true;      // 「音乐」总开关：关上则大厅与关卡两首都静音
  var gameBgmOn = true;    // 「关卡内 BGM」独立开关：总开关关闭时不生效
  var noiseBuf = null;

  /** 一路背景音乐：el 当前在播、alt 是循环交叉淡化用的备用路（懒创建） */
  function makeTrack(src, vol) {
    return { src: src, vol: vol, el: null, alt: null, loopTimer: null, pauseTimer: null, want: false };
  }
  var TRACKS = {
    hall: makeTrack('audio/lets_go_shopping.mp3', MUSIC_VOL),
    game: makeTrack('audio/bgm-game.m4a', GAME_VOL),
  };

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
  function makeEl(track) {
    var el = new Audio();
    el.src = track.src;
    el.loop = true;        // 兜底：极端情况下（时长未知）仍能循环，不至于断掉
    /* preload=none：首屏不抢 4.4MB 带宽，首次手势解锁后才真正加载 */
    el.preload = 'none';
    el.volume = 0;
    return el;
  }

  /** 把音乐元素接入 WebAudio 增益链：iOS 会忽略 HTMLAudioElement.volume，
   *  只能用 ctx.createGain() 控制音量与交叉淡化。每个元素只能建一次 source。 */
  function wire(el) {
    if (el._wired) return el;
    var c = ensureCtx();
    if (!c) return el;
    try {
      el._src = c.createMediaElementSource(el);
      el._gain = c.createGain();
      el._gain.gain.value = el.volume;
      el._src.connect(el._gain);
      el._gain.connect(c.destination);
      el._wired = true;
      el.volume = 1;      // 音量全部交给增益节点，避免两处相乘
    } catch (e) { el._wired = false; }
    return el;
  }

  /** 单路音量渐变；WebAudio 走增益自动化，其余浏览器退回 el.volume 轮询 */
  function ramp(el, target, ms, done) {
    if (el._fade) { clearInterval(el._fade); el._fade = null; }
    if (el._wired && el._gain) {
      var g = el._gain.gain;
      var t = ctx.currentTime;
      try {
        if (g.cancelAndHoldAtTime) g.cancelAndHoldAtTime(t);
        else { g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); }
        g.linearRampToValueAtTime(Math.min(1, Math.max(0, target)), t + ms / 1000);
      } catch (e) {
        g.value = target;
      }
      el._fade = setTimeout(function () {
        el._fade = null;
        if (done) done();
      }, ms);
      return;
    }
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

  /** 清掉某一路的循环监测；切歌/暂停时必须先清，否则淡出期间还会触发内部交叉淡化出现第三路 */
  function clearLoop(track) {
    if (track.loopTimer) { clearInterval(track.loopTimer); track.loopTimer = null; }
  }

  /** 同一首的结尾交叉淡化：备用路从头起播，两路一进一出，衔接处听不出断点 */
  function crossfade(track) {
    var out = track.el;
    var inc = wire(track.alt || (track.alt = makeEl(track)));
    /* 淡出的一路关掉 loop，避免它在这 2.4 秒内先播到结尾又回卷重播，出现一声突兀的重来 */
    out.loop = false;
    inc.loop = true;
    try { inc.currentTime = 0; } catch (e) {}
    if (inc._wired && inc._gain) inc._gain.gain.value = 0; else inc.volume = 0;
    var p = inc.play();
    if (p && p.catch) p.catch(function () {});
    var ms = MUSIC_XFADE * 1000;
    ramp(inc, track.vol, ms);
    ramp(out, 0, ms, function () { out.pause(); });
    /* 交换角色：下一轮由新的一路接续 */
    track.el = inc;
    track.alt = out;
  }

  /** 监测某一路是否临近结尾，到点就交叉淡化 */
  function watchLoop(track) {
    if (track.loopTimer) return;
    track.loopTimer = setInterval(function () {
      var el = track.el;
      if (!el || el.paused) return;
      var d = el.duration;
      if (!d || !isFinite(d)) return;
      if (d - el.currentTime <= MUSIC_XFADE) crossfade(track);
    }, 250);
  }

  /** 从 0 淡入到该曲自身音量。等 play() 的 promise 之后再开始计时：
   *  关卡曲首次进关要下载 2.3MB，若增益已按时间表爬满，出声瞬间会直接跳到全音量 */
  function fadeIn(track, ms) {
    if (track.pauseTimer) { clearTimeout(track.pauseTimer); track.pauseTimer = null; }
    var el = wire(track.el || (track.el = makeEl(track)));
    var begin = function () { ramp(el, track.vol, ms); watchLoop(track); };
    if (!el.paused) { begin(); return; }
    var d = el.duration;
    /* 暂停点已贴近结尾时跳回开头，避免刚恢复就立刻淡化 */
    if (d && isFinite(d) && d - el.currentTime <= MUSIC_XFADE) el.currentTime = 0;
    el.loop = true;
    if (el._wired && el._gain) el._gain.gain.value = 0; else el.volume = 0;
    var p = el.play();
    if (p && p.then) p.then(begin)['catch'](function () {});
    else begin();
  }

  /** 淡出并暂停某一路（含正在交叉淡化的备用路） */
  function fadeOut(track, ms) {
    clearLoop(track);
    if (track.pauseTimer) { clearTimeout(track.pauseTimer); track.pauseTimer = null; }
    [track.el, track.alt].forEach(function (el) {
      if (!el) return;
      ramp(el, 0, ms, function () { el.pause(); });
    });
    /* 兜底：即使渐变定时器被后续 fadeIn 清掉，也一定会暂停 */
    track.pauseTimer = setTimeout(function () {
      track.pauseTimer = null;
      [track.el, track.alt].forEach(function (el) { if (el) el.pause(); });
    }, ms + 40);
  }

  /** 按 want / 总开关 / 手势解锁统一决定两路起停；一进一出同时渐变 = 交叉淡化 */
  function syncTracks(dur) {
    var ms = (dur || SWITCH_XFADE) * 1000;
    [TRACKS.hall, TRACKS.game].forEach(function (track) {
      var should = !!(track.want && musicOn && gestured);
      if (should) fadeIn(track, ms);
      else if (track.el || track.alt) fadeOut(track, ms);
    });
  }

  ZQ.audio = {
    setEnabled: function (v) { enabled = !!v; },
    isEnabled: function () { return enabled; },
    /** 首次用户手势时调用，解锁音频上下文。
     *  iOS/Chrome 都要求手势内 resume()；音乐元素用 preload=none，
     *  这里只触发 play()，真正的网络加载是异步的，不能等它加载完才解锁。 */
    unlock: function () {
      gestured = true;
      ensureCtx();      // 内部已调用 ctx.resume()，不 await，避免阻塞解锁
      syncTracks();     // 按当前界面起播对应曲目（大厅曲或关卡曲），play() 内部异步加载
    },

    /** 手势补漏：从后台回来、或系统中断后上下文被挂起时，用任意一次点击恢复播放 */
    kick: function () {
      if (!gestured) return;
      var c = ensureCtx();
      if (c && c.state === 'suspended' && c.resume) c.resume();
      syncTracks();     // 关卡内恢复的应当是关卡曲，不能再写死大厅曲
    },

    /* ---- 背景音乐控制 ---- */
    setMusicEnabled: function (v) {
      musicOn = !!v;
      syncTracks();     // 总开关：一关两首同时淡出，一开按当前界面淡入
    },
    isMusicEnabled: function () { return musicOn; },
    /** 关卡内 BGM 独立开关；在关卡里改设置也立即生效 */
    setGameBgm: function (v) {
      gameBgmOn = !!v;
      syncTracks();
    },
    isGameBgmEnabled: function () { return gameBgmOn; },
    /** 按界面切歌：大厅 ↔ 关卡交叉淡化（两首同时渐变），中间不会出现空档 */
    bgm: function (screen) {
      var inGame = screen === 'game';
      TRACKS.hall.want = !inGame;
      TRACKS.game.want = inGame && gameBgmOn;
      syncTracks();
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
