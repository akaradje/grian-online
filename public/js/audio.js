/* ═══════════════════════════════════════════════════════════
   audio.js — ระบบเสียง 8-bit สังเคราะห์เองด้วย WebAudio
   ไม่โหลดไฟล์เสียงแม้ไฟล์เดียว ทุกเสียงสร้างจาก oscillator + noise
   ═══════════════════════════════════════════════════════════ */

const SEMI = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };

/** "A3" → 57 (MIDI) */
export function midi(name) {
  const m = /^([A-G]#?)(-?\d)$/.exec(name);
  if (!m) return 60;
  return SEMI[m[1]] + (Number(m[2]) + 1) * 12;
}
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

/* ─────────────── คอร์ด → โน้ต ─────────────── */
const CHORD = {
  M: [0, 4, 7], m: [0, 3, 7], m7: [0, 3, 7, 10], M7: [0, 4, 7, 11],
  sus: [0, 5, 7], dim: [0, 3, 6],
};
function chordTones(rootMidi, type, octave = 0) {
  return CHORD[type].map((i) => rootMidi + i + octave * 12);
}

/* ─────────────── เอนจิน ─────────────── */
export const Audio = {
  ctx: null,
  master: null, musicBus: null, sfxBus: null,
  vol: { master: 0.7, music: 0.42, sfx: 0.85 },
  muted: false,
  ready: false,
  noiseBuf: null,

  track: null, trackName: null,
  step: 0, nextTime: 0, timer: null, stepDur: 0.13,
  duck: 0,                 // ลดเสียงเพลงชั่วคราวตอนมี SFX สำคัญ
  lastSfx: Object.create(null),

  init() {
    if (this.ctx) return this.ready;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    try {
      this.ctx = new AC();
    } catch (e) { return false; }

    this.master = this.ctx.createGain();
    this.master.gain.value = this.vol.master;
    this.master.connect(this.ctx.destination);

    // คอมเพรสเซอร์กันเสียงแตกเวลาตีรัว ๆ
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -12; comp.knee.value = 24; comp.ratio.value = 6;
    comp.attack.value = 0.004; comp.release.value = 0.18;
    comp.connect(this.master);

    this.musicBus = this.ctx.createGain();
    this.musicBus.gain.value = this.vol.music;
    this.musicBus.connect(comp);

    this.sfxBus = this.ctx.createGain();
    this.sfxBus.gain.value = this.vol.sfx;
    this.sfxBus.connect(comp);

    // บัฟเฟอร์ noise ใช้ร่วมกันทุกเสียง
    const len = Math.floor(this.ctx.sampleRate * 0.6);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    let seed = 12345;
    for (let i = 0; i < len; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      d[i] = (seed / 0x3fffffff) - 1;
    }
    this.noiseBuf = buf;
    this.ready = true;
    return true;
  },

  /** ต้องเรียกหลังผู้ใช้คลิกครั้งแรก (นโยบาย autoplay ของเบราว์เซอร์) */
  resume() {
    if (!this.ctx) this.init();
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    return this.ready;
  },

  setVol(k, v) {
    this.vol[k] = v;
    if (!this.ready) return;
    if (k === 'master') this.master.gain.value = this.muted ? 0 : v;
    if (k === 'music') this.musicBus.gain.value = v;
    if (k === 'sfx') this.sfxBus.gain.value = v;
  },
  setMuted(m) {
    this.muted = m;
    if (this.ready) this.master.gain.value = m ? 0 : this.vol.master;
  },

  /* ─────────────── ชิ้นส่วนเสียง ─────────────── */
  _tone(t0, o) {
    const { type = 'square', f0, f1, dur = 0.1, vol = 0.2, bus = this.sfxBus, delay = 0 } = o;
    const t = t0 + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g); g.connect(bus);
    osc.start(t); osc.stop(t + dur + 0.03);
  },

  _noise(t0, o) {
    const { dur = 0.08, vol = 0.15, f0 = 2000, f1 = 400, q = 1, bus = this.sfxBus, delay = 0 } = o;
    const t = t0 + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const flt = this.ctx.createBiquadFilter();
    flt.type = 'bandpass'; flt.Q.value = q;
    flt.frequency.setValueAtTime(f0, t);
    flt.frequency.exponentialRampToValueAtTime(Math.max(60, f1), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(flt); flt.connect(g); g.connect(bus);
    src.start(t); src.stop(t + dur + 0.02);
  },

  /* ─────────────── คลังเสียงเอฟเฟกต์ ─────────────── */
  play(name) {
    if (!this.ready || this.muted) return;
    const now = this.ctx.currentTime;
    // กันเสียงซ้ำถี่เกินไป (ตีรัว ๆ แล้วเสียงแตก)
    if (this.lastSfx[name] && now - this.lastSfx[name] < 0.035) return;
    this.lastSfx[name] = now;
    const b = this.sfxBus;
    switch (name) {
      case 'click':
        this._tone(now, { type: 'square', f0: 880, f1: 1320, dur: 0.045, vol: 0.13, bus: b }); break;
      case 'hover':
        this._tone(now, { type: 'square', f0: 1400, dur: 0.02, vol: 0.05, bus: b }); break;
      case 'hit':
        this._tone(now, { type: 'square', f0: 320, f1: 110, dur: 0.09, vol: 0.20, bus: b });
        this._noise(now, { dur: 0.05, vol: 0.11, f0: 1900, f1: 500, bus: b }); break;
      case 'crit':
        this._tone(now, { type: 'square', f0: 560, f1: 150, dur: 0.15, vol: 0.26, bus: b });
        this._tone(now, { type: 'sawtooth', f0: 1120, f1: 300, dur: 0.12, vol: 0.10, bus: b });
        this._noise(now, { dur: 0.11, vol: 0.20, f0: 3400, f1: 700, bus: b }); break;
      case 'swing':
        this._noise(now, { dur: 0.07, vol: 0.07, f0: 900, f1: 2600, q: 0.8, bus: b }); break;
      case 'hurt':
        this._tone(now, { type: 'sawtooth', f0: 220, f1: 90, dur: 0.16, vol: 0.20, bus: b }); break;
      case 'loot':
        this._tone(now, { type: 'square', f0: hz(76), dur: 0.055, vol: 0.12, bus: b });
        this._tone(now, { type: 'square', f0: hz(83), dur: 0.08, vol: 0.12, bus: b, delay: 0.055 }); break;
      case 'rare':
        [72, 76, 79, 84].forEach((n, i) => this._tone(now, { type: 'square', f0: hz(n), dur: 0.16, vol: 0.13, bus: b, delay: i * 0.07 })); break;
      case 'coin':
        this._tone(now, { type: 'square', f0: hz(88), dur: 0.04, vol: 0.10, bus: b });
        this._tone(now, { type: 'square', f0: hz(95), dur: 0.09, vol: 0.10, bus: b, delay: 0.04 }); break;
      case 'levelup':
        [72, 76, 79, 84, 88].forEach((n, i) => this._tone(now, { type: 'square', f0: hz(n), dur: 0.22, vol: 0.15, bus: b, delay: i * 0.085 })); break;
      case 'skill':
        this._tone(now, { type: 'triangle', f0: 300, f1: 1400, dur: 0.18, vol: 0.16, bus: b });
        this._noise(now, { dur: 0.18, vol: 0.10, f0: 400, f1: 3800, q: 1.2, bus: b }); break;
      case 'ban':
        this._tone(now, { type: 'square', f0: 900, f1: 180, dur: 0.3, vol: 0.2, bus: b });
        this._noise(now, { dur: 0.25, vol: 0.14, f0: 2600, f1: 300, bus: b }); break;
      case 'gacha':
        [69, 72, 76, 81].forEach((n, i) => this._tone(now, { type: 'triangle', f0: hz(n), dur: 0.13, vol: 0.11, bus: b, delay: i * 0.05 })); break;
      case 'gacha5':
        [69, 73, 76, 81, 85, 88].forEach((n, i) => this._tone(now, { type: 'square', f0: hz(n), dur: 0.42, vol: 0.16, bus: b, delay: i * 0.1 }));
        this._tone(now, { type: 'triangle', f0: hz(45), dur: 0.7, vol: 0.12, bus: b, delay: 0.1 }); break;
      case 'die':
        [64, 60, 55, 48].forEach((n, i) => this._tone(now, { type: 'sawtooth', f0: hz(n), dur: 0.3, vol: 0.16, bus: b, delay: i * 0.14 })); break;
      case 'respawn':
        [60, 64, 67].forEach((n, i) => this._tone(now, { type: 'triangle', f0: hz(n), dur: 0.25, vol: 0.13, bus: b, delay: i * 0.09 })); break;
      case 'boss':
        this._tone(now, { type: 'sawtooth', f0: hz(33), dur: 1.6, vol: 0.24, bus: b });
        this._tone(now, { type: 'sawtooth', f0: hz(45), dur: 1.4, vol: 0.12, bus: b, delay: 0.12 });
        this._noise(now, { dur: 1.2, vol: 0.13, f0: 260, f1: 90, q: 0.6, bus: b }); break;
      case 'warn':
        this._tone(now, { type: 'square', f0: hz(72), dur: 0.12, vol: 0.14, bus: b });
        this._tone(now, { type: 'square', f0: hz(67), dur: 0.16, vol: 0.14, bus: b, delay: 0.14 }); break;
      case 'chat':
        this._tone(now, { type: 'square', f0: 1200, dur: 0.025, vol: 0.06, bus: b }); break;
      case 'error':
        this._tone(now, { type: 'square', f0: 180, f1: 140, dur: 0.14, vol: 0.14, bus: b }); break;
      case 'equip':
        this._tone(now, { type: 'square', f0: 700, f1: 1000, dur: 0.09, vol: 0.13, bus: b });
        this._noise(now, { dur: 0.07, vol: 0.09, f0: 2400, f1: 900, bus: b }); break;
      case 'upgrade_ok':
        [72, 79, 84, 91].forEach((n, i) => this._tone(now, { type: 'square', f0: hz(n), dur: 0.3, vol: 0.15, bus: b, delay: i * 0.08 })); break;
      case 'upgrade_fail':
        this._tone(now, { type: 'square', f0: 260, f1: 120, dur: 0.35, vol: 0.17, bus: b });
        this._noise(now, { dur: 0.3, vol: 0.12, f0: 1400, f1: 200, bus: b }); break;
    }
  },

  /* ─────────────── เพลงประกอบ (chiptune sequencer) ─────────────── */
  tracks: {
    // หมู่บ้าน: สงบ ช้า ไม่กดดัน
    village: {
      bpm: 92, swing: 0,
      prog: [['A', 3, 'm'], ['F', 3, 'M'], ['C', 4, 'M'], ['G', 3, 'M']],
      bassOct: -2, arpOct: 0, leadOct: 0,
      arpPat: [0, 1, 2, 1],
      drums: 'k...h...s...h...',
      lead: [null, null, 76, null, null, 74, null, null, null, null, 72, null, null, 69, null, null,
        null, null, 74, null, null, 72, null, null, null, null, 69, null, null, 67, null, null],
    },
    // ทุ่งนา: คึกคัก
    field: {
      bpm: 124, swing: 0,
      prog: [['A', 3, 'm'], ['F', 3, 'M'], ['C', 4, 'M'], ['G', 3, 'M']],
      bassOct: -2, arpOct: 0, leadOct: 1,
      arpPat: [0, 1, 2, 1],
      drums: 'k.h.s.h.k.h.s.hh',
      lead: [81, null, null, 79, null, 76, null, null, 79, null, null, 76, null, 74, null, null,
        null, 76, null, 79, null, 81, null, null, 84, null, 81, null, 79, null, 76, null],
    },
    // บอส: ตึงเครียด
    boss: {
      bpm: 148, swing: 0,
      prog: [['A', 2, 'm'], ['A', 2, 'm'], ['G', 2, 'M'], ['F', 2, 'M']],
      bassOct: -1, arpOct: 1, leadOct: 1,
      arpPat: [0, 2, 1, 2],
      drums: 'k.khs.k.khhs.hh',
      lead: [69, null, 69, null, 70, null, 69, null, 67, null, 69, null, 65, null, 67, null,
        null, 69, null, 70, null, 72, null, 74, null, 72, null, 70, null, 69, null],
    },
    // ดินแดนมาร์: ช้า กดดัน เสียงกดลด (dim chords + drone)
    hell: {
      bpm: 96, swing: 0,
      prog: [['D', 2, 'dim'], ['D', 2, 'dim'], ['E', 2, 'dim'], ['D', 2, 'm']],
      bassOct: -2, arpOct: 1, leadOct: 0,
      arpPat: [0, 2, 1, 0],
      drums: 'k...s...k.h.s...',
      lead: [74, null, null, null, 72, null, 73, null, null, null, 69, null, null, null, 70, null,
        74, null, null, null, 72, null, 69, null, null, null, null, null, 67, null, 66, null],
    },
  },

  playMusic(name) {
    if (!this.ready || this.trackName === name) return;
    const t = this.tracks[name];
    if (!t) return;
    this.stopMusic(true);
    this.trackName = name;
    this.track = t;
    this.stepDur = (60 / t.bpm) / 4;      // หนึ่งขั้น = โน้ตเขบ็ตหนึ่งชั้น
    this.step = 0;
    this.nextTime = this.ctx.currentTime + 0.08;
    this.timer = setInterval(() => this._scheduler(), 25);
    this._scheduler();
  },

  stopMusic(keepName) {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    if (!keepName) this.trackName = null;
  },

  _scheduler() {
    if (!this.ready || !this.track) return;
    const ahead = this.ctx.currentTime + 0.14;
    let guard = 0;
    while (this.nextTime < ahead && guard++ < 64) {
      this._step(this.step, this.nextTime);
      this.nextTime += this.stepDur;
      this.step = (this.step + 1) % 64;
    }
  },

  _step(s, t) {
    const tr = this.track;
    const bar = Math.floor(s / 16);
    const [rootName, oct, type] = tr.prog[bar % tr.prog.length];
    const root = midi(rootName + oct);
    const tones = chordTones(root, type);
    const b = this.musicBus;

    // เบส — ทุกครึ่งจังหวะ
    if (s % 4 === 0) {
      this._tone(t, { type: 'triangle', f0: hz(root + tr.bassOct * 12), dur: this.stepDur * 3.1, vol: 0.16, bus: b });
    } else if (s % 4 === 2) {
      this._tone(t, { type: 'triangle', f0: hz(root + tr.bassOct * 12), dur: this.stepDur * 0.9, vol: 0.08, bus: b });
    }
    // อาร์เพจจิโอ — ทุกขั้น
    const tone = tones[tr.arpPat[s % tr.arpPat.length] % tones.length];
    this._tone(t, { type: 'square', f0: hz(tone + tr.arpOct * 12), dur: this.stepDur * 0.8, vol: 0.045, bus: b });
    // ทำนอง
    const n = tr.lead[(s + bar * 16) % tr.lead.length];
    if (n !== null && n !== undefined) {
      this._tone(t, { type: 'square', f0: hz(n + tr.leadOct * 12), dur: this.stepDur * 2.4, vol: 0.075, bus: b });
    }
    // กลอง
    const d = tr.drums[s % 16];
    if (d === 'k') {
      this._tone(t, { type: 'sine', f0: 140, f1: 46, dur: 0.11, vol: 0.20, bus: b });
    } else if (d === 's') {
      this._noise(t, { dur: 0.09, vol: 0.11, f0: 1700, f1: 700, q: 0.9, bus: b });
    } else if (d === 'h') {
      this._noise(t, { dur: 0.03, vol: 0.05, f0: 8000, f1: 6000, q: 1.6, bus: b });
    }
  },
};
