/* ============================================================
 * VoxelCraft — WebAudio 程序化音效 + 生成式环境音乐
 * 全部声音实时合成, 无音频文件
 * ============================================================ */
"use strict";

const Sound = {
  ctx: null,
  master: null,
  musicGain: null,
  musicOn: true,
  _musicTimer: null,
  _stepAcc: 0,

  init() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = G.settings.volume / 100;
      this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.16;
      this.musicGain.connect(this.master);
      this.musicOn = G.settings.music === "on";
    } catch (e) { console.warn("音频初始化失败", e); }
  },

  setVolume(v) { if (this.master) this.master.gain.value = v / 100; },
  setMusic(on) {
    this.musicOn = on;
    if (!on && this._musicTimer) { clearTimeout(this._musicTimer); this._musicTimer = null; }
    else if (on) this.scheduleMusic(2000);
  },

  resume() { if (this.ctx && this.ctx.state === "suspended") this.ctx.resume(); },

  // ---------- 合成基元 ----------
  noiseBurst(opts) {
    if (!this.ctx) return;
    const { dur = 0.12, freq = 800, q = 1, gain = 0.4, type = "lowpass", rate = 1 } = opts;
    const ctx = this.ctx;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = rate;
    const filter = ctx.createBiquadFilter();
    filter.type = type; filter.frequency.value = freq; filter.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    src.connect(filter); filter.connect(g); g.connect(this.master);
    src.start();
  },

  tone(opts) {
    if (!this.ctx) return;
    const { freq = 440, dur = 0.15, type = "sine", gain = 0.2, slide = 0, delay = 0 } = opts;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = type;
    const t0 = ctx.currentTime + delay;
    osc.frequency.setValueAtTime(freq, t0);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g); g.connect(this.master);
    osc.start(t0); osc.stop(t0 + dur + 0.05);
  },

  // ---------- 游戏音效 ----------
  blockSound(id, kind) {
    if (!this.ctx) return;
    const b = BLOCKS[id];
    if (!b) return;
    let freq = 700, gain = 0.35, dur = 0.11, type = "lowpass";
    if (b.tool === "pickaxe") { freq = 420; gain = 0.4; }
    else if (b.tool === "shovel") { freq = 650; gain = 0.3; }
    else if (b.tool === "axe") { freq = 300; gain = 0.42; type = "bandpass"; }
    else if (b.plant) { freq = 1400; gain = 0.18; dur = 0.07; }
    else if (id === B.GLASS || id === B.ICE) { freq = 2600; gain = 0.3; type = "highpass"; }
    else if (id === B.SAND) { freq = 900; gain = 0.25; }
    const jitter = 0.85 + Math.random() * 0.3;
    this.noiseBurst({ dur, freq: freq * jitter, gain, type, q: 1.2, rate: jitter });
    if (kind === "dig" && Math.random() < 0.5) this.tone({ freq: freq * 0.5 * jitter, dur: 0.06, gain: 0.1, type: "triangle" });
  },

  place(id) { this.blockSound(id, "place"); },
  breakBlock(id) { this.blockSound(id, "break"); this.tone({ freq: 180, dur: 0.08, gain: 0.15, type: "triangle", slide: -60 }); },

  step(id) {
    if (!this.ctx) return;
    const b = BLOCKS[id];
    let freq = 800, gain = 0.1;
    if (b && b.tool === "pickaxe") freq = 500;
    if (b && b.plant) freq = 1600;
    this.noiseBurst({ dur: 0.05, freq: freq * (0.9 + Math.random() * 0.2), gain, type: "lowpass" });
  },

  swing() { this.noiseBurst({ dur: 0.09, freq: 1800, gain: 0.08, type: "bandpass", q: 2 }); },

  pop() { this.tone({ freq: 420, dur: 0.09, gain: 0.18, type: "sine", slide: 500 }); },

  hurt() {
    this.tone({ freq: 220, dur: 0.16, gain: 0.3, type: "square", slide: -90 });
    this.noiseBurst({ dur: 0.1, freq: 500, gain: 0.15 });
  },

  eat() {
    this.noiseBurst({ dur: 0.08, freq: 1100, gain: 0.2, type: "bandpass", q: 3 });
    this.tone({ freq: 300 + Math.random() * 200, dur: 0.06, gain: 0.08, type: "triangle" });
  },

  burp() { this.tone({ freq: 140, dur: 0.22, gain: 0.22, type: "sawtooth", slide: -60 }); },

  zombieGroan() {
    if (!this.ctx) return;
    const f = 90 + Math.random() * 50;
    this.tone({ freq: f, dur: 0.5, gain: 0.14, type: "sawtooth", slide: -25 });
    this.tone({ freq: f * 1.5, dur: 0.4, gain: 0.06, type: "sawtooth", slide: -20, delay: 0.1 });
  },

  pigOink() {
    this.tone({ freq: 260 + Math.random() * 80, dur: 0.14, gain: 0.16, type: "square", slide: -80 });
  },

  sheepBaa() {
    this.tone({ freq: 340, dur: 0.35, gain: 0.14, type: "sawtooth", slide: 30 });
  },

  cowMoo() {
    if (!this.ctx) return;
    const f = 140 + Math.random() * 30;
    this.tone({ freq: f, dur: 0.7, gain: 0.16, type: "sawtooth", slide: -35 });
    this.tone({ freq: f * 1.5, dur: 0.5, gain: 0.05, type: "sine", slide: -20, delay: 0.08 });
  },

  chickenCluck() {
    if (!this.ctx) return;
    const n = 2 + ((Math.random() * 2) | 0);
    for (let i = 0; i < n; i++) {
      this.tone({ freq: 700 + Math.random() * 300, dur: 0.08, gain: 0.1, type: "square", slide: -180, delay: i * 0.12 });
    }
  },

  skeletonRattle() {
    if (!this.ctx) return;
    const n = 3 + ((Math.random() * 3) | 0);
    for (let i = 0; i < n; i++) {
      this.noiseBurst({ dur: 0.05, freq: 2400 + Math.random() * 800, gain: 0.08, type: "bandpass", q: 4, rate: 1.5 });
    }
  },

  creeperHiss() {
    this.noiseBurst({ dur: 1.4, freq: 4200, gain: 0.22, type: "highpass", q: 0.7 });
  },

  arrowShoot() {
    this.noiseBurst({ dur: 0.12, freq: 2600, gain: 0.14, type: "bandpass", q: 3, rate: 1.6 });
  },

  arrowHit() {
    this.noiseBurst({ dur: 0.08, freq: 900, gain: 0.2, type: "lowpass" });
    this.tone({ freq: 200, dur: 0.05, gain: 0.1, type: "triangle", slide: -60 });
  },

  doorOpen() { this.tone({ freq: 240, dur: 0.18, gain: 0.2, type: "sawtooth", slide: 90 }); },
  doorClose() { this.tone({ freq: 300, dur: 0.14, gain: 0.2, type: "sawtooth", slide: -110 }); },
  chestOpen() { this.tone({ freq: 180, dur: 0.22, gain: 0.16, type: "triangle", slide: 60 }); },
  chestClose() { this.tone({ freq: 260, dur: 0.16, gain: 0.16, type: "triangle", slide: -80 }); },
  levelUp() {
    this.tone({ freq: 523, dur: 0.12, gain: 0.18, type: "sine" });
    this.tone({ freq: 659, dur: 0.12, gain: 0.18, type: "sine", delay: 0.1 });
    this.tone({ freq: 784, dur: 0.2, gain: 0.18, type: "sine", delay: 0.2 });
  },

  rainAmbient() {
    this.noiseBurst({ dur: 1.8, freq: 1500, gain: 0.06, type: "bandpass", q: 0.4 });
  },

  thunder() {
    if (!this.ctx) return;
    this.noiseBurst({ dur: 2.2, freq: 180, gain: 0.8, type: "lowpass" });
    this.tone({ freq: 50, dur: 1.4, gain: 0.45, type: "sine", slide: -20 });
    this.noiseBurst({ dur: 1.0, freq: 900, gain: 0.25, type: "bandpass", q: 0.6, delay: 0 });
  },

  explosion() {
    if (!this.ctx) return;
    this.noiseBurst({ dur: 1.1, freq: 300, gain: 0.9, type: "lowpass" });
    this.tone({ freq: 70, dur: 0.7, gain: 0.5, type: "sine", slide: -40 });
  },

  fuse() { this.noiseBurst({ dur: 0.4, freq: 3500, gain: 0.12, type: "highpass" }); },

  craft() {
    this.tone({ freq: 500, dur: 0.08, gain: 0.15, type: "triangle" });
    this.tone({ freq: 750, dur: 0.1, gain: 0.15, type: "triangle", delay: 0.07 });
  },

  click() { this.tone({ freq: 900, dur: 0.04, gain: 0.12, type: "square" }); },

  splash() { this.noiseBurst({ dur: 0.3, freq: 1200, gain: 0.3, type: "bandpass", q: 0.8 }); },

  // ---------- 生成式音乐 ----------
  scheduleMusic(delay = 8000) {
    if (this._musicTimer) return;
    this._musicTimer = setTimeout(() => {
      this._musicTimer = null;
      if (this.musicOn && G.state === "playing") this.playMusicPhrase();
      this.scheduleMusic(45000 + Math.random() * 60000);
    }, delay);
  },

  playMusicPhrase() {
    if (!this.ctx) return;
    // 五声音阶, 轻柔琶音
    const scale = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25];
    const root = [0, 3, 5][(Math.random() * 3) | 0];
    const notes = 8 + ((Math.random() * 8) | 0);
    let t = 0;
    for (let i = 0; i < notes; i++) {
      const idx = clamp(root + Math.floor((Math.random() - 0.3) * 4), 0, scale.length - 1);
      const freq = scale[idx];
      const dur = 1.2 + Math.random() * 1.4;
      const ctx = this.ctx;
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq;
      const osc2 = ctx.createOscillator();
      osc2.type = "sine";
      osc2.frequency.value = freq * 2.003;
      const g = ctx.createGain();
      const t0 = ctx.currentTime + t;
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(0.5, t0 + 0.14);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      osc.connect(g); osc2.connect(g); g.connect(this.musicGain);
      osc.start(t0); osc2.start(t0);
      osc.stop(t0 + dur); osc2.stop(t0 + dur);
      t += 0.55 + Math.random() * 0.5;
    }
  },
};
