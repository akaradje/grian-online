/* ═══════════════════════════════════════════════════════════
   fx.js — ระบบเอฟเฟกต์: particle แบบ pool · กล้อง · แสงกลางวัน-คืน
            · hit-stop · ตัววัดประสิทธิภาพ
   ═══════════════════════════════════════════════════════════ */

/* ─────────────── ตัวช่วย: กรองอาเรย์แบบไม่สร้างอาเรย์ใหม่ ───────────────
   .filter() สร้างอาเรย์ใหม่ทุกครั้ง ถ้าเรียกทุกเฟรมจะทำให้ GC ทำงานถี่
   → เห็นเป็นเฟรมกระตุกเป็นช่วง ๆ ฟังก์ชันนี้เขียนทับในที่เดิม */
export function compact(arr, keep) {
  let w = 0;
  for (let i = 0; i < arr.length; i++) {
    const v = arr[i];
    if (keep(v)) arr[w++] = v;
  }
  arr.length = w;
  return arr;
}

/* ─────────────── Particle (pool คงที่ ไม่มี GC) ─────────────── */
const MAX_P = 420;

export const Particles = {
  pool: [],
  active: 0,
  quality: 'high',

  init() {
    this.pool = new Array(MAX_P);
    for (let i = 0; i < MAX_P; i++) {
      this.pool[i] = { on: false, x: 0, y: 0, vx: 0, vy: 0, g: 0, life: 0, max: 1, c: '#fff', s: 1, fade: 1, shrink: true, pulse: 0, seed: 0, drag: 0, bounce: 0, groundY: 0 };
    }
    this.active = 0;
    this._t = 0;
  },

  spawn(kind, x, y, o = {}) {
    const n = this.quality === 'low' ? 1 : (o.count || 1);
    for (let k = 0; k < n; k++) {
      const p = this._get();
      if (!p) return;
      const r = () => Math.random() - 0.5;
      p.on = true;
      p.pulse = 0;
      p.seed = Math.random() * 10;
      p.drag = 0; p.bounce = 0; p.groundY = y + 10;      // ระดับพื้นโดยประมาณ
      switch (kind) {
        case 'spark':
          p.x = x; p.y = y; p.vx = r() * 90; p.vy = r() * 90 - 20; p.g = 190;
          p.max = 0.32; p.c = o.c || '#ffe9a8'; p.s = 1; p.drag = 2.6; p.bounce = 0.4; break;
        case 'blood':
          p.x = x; p.y = y; p.vx = r() * 70; p.vy = r() * 50 - 40; p.g = 260;
          p.max = 0.42; p.c = o.c || '#d94f4f'; p.s = 2; p.drag = 1.1; p.bounce = 0.3; break;
        case 'dust':
          p.x = x; p.y = y; p.vx = r() * 22; p.vy = -12 - Math.random() * 12; p.g = 10;
          p.max = 0.5; p.c = o.c || 'rgba(200,190,165,.55)'; p.s = 2; p.drag = 3.2; break;
        case 'coin':
          p.x = x; p.y = y; p.vx = r() * 40; p.vy = -70 - Math.random() * 40; p.g = 220;
          p.max = 0.7; p.c = o.c || '#ffc94d'; p.s = 2; p.drag = 0.3; p.bounce = 0.55; break;
        case 'heal':
          p.x = x; p.y = y; p.vx = r() * 24; p.vy = -46 - Math.random() * 26; p.g = -14;
          p.max = 0.8; p.c = o.c || '#5fe89b'; p.s = 2; break;
        case 'burst': {
          const a = Math.random() * Math.PI * 2, sp = 60 + Math.random() * 90;
          p.x = x; p.y = y; p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp; p.g = 130;
          p.max = 0.55; p.c = o.c || '#ffc94d'; p.s = 2; p.drag = 2.2; break;
        }
        case 'smoke':
          p.x = x; p.y = y; p.vx = r() * 16; p.vy = -22 - Math.random() * 14; p.g = -8;
          p.max = 1.1; p.c = o.c || 'rgba(120,120,140,.45)'; p.s = 3; p.drag = 1.4; break;
        /* ── บรรยากาศ: หิ่งห้อยกลางคืน ── */
        case 'firefly':
          p.x = x; p.y = y; p.vx = r() * 10; p.vy = r() * 10; p.g = 0;
          p.max = 2.6 + Math.random() * 2.4; p.c = o.c || '#c8ff9a'; p.s = 2;
          p.pulse = 1; p.fade = 0.9; p.drag = 0.4; break;
        /* ── บรรยากาศ: ละออง pollen กลางวัน ── */
        case 'pollen':
          p.x = x; p.y = y; p.vx = r() * 12; p.vy = -8 - Math.random() * 8; p.g = 3;
          p.max = 2.2 + Math.random() * 1.6; p.c = o.c || 'rgba(255,240,200,.85)'; p.s = 1;
          p.pulse = 0.6; p.fade = 0.8; p.drag = 0.9; break;
        default:
          p.x = x; p.y = y; p.vx = 0; p.vy = 0; p.g = 0; p.max = 0.4; p.c = '#fff'; p.s = 1;
      }
      p.life = p.max;
      this.active++;
    }
  },

  _get() {
    // หาช่องว่างแบบ round-robin เพื่อกระจายการใช้งาน
    for (let i = 0; i < MAX_P; i++) {
      const idx = (this._rr = ((this._rr || 0) + 1) % MAX_P);
      if (!this.pool[idx].on) return this.pool[idx];
    }
    return null;   // pool เต็ม — ปล่อยผ่านไป ดีกว่าทำให้กระตุก
  },

  update(dt) {
    let n = 0;
    this._t = (this._t || 0) + dt;
    for (let i = 0; i < MAX_P; i++) {
      const p = this.pool[i];
      if (!p.on) continue;
      p.life -= dt;
      if (p.life <= 0) { p.on = false; continue; }
      // ── ฟิสิกส์: แรงต้านอากาศ (air drag) ──
      if (p.drag) {
        const f = Math.max(0, 1 - p.drag * dt);
        p.vx *= f; p.vy *= f;
      }
      // หิ่งห่อยโบยไปมาโดยถ่วงด้วย sine — ดูเป็นชีวิตมากกว่าลอยแนวตรง
      if (p.pulse) {
        p.vx += Math.sin(this._t * 1.9 + p.seed) * 9 * dt;
        p.vy += Math.cos(this._t * 1.5 + p.seed * 1.3) * 9 * dt;
        const sp = Math.hypot(p.vx, p.vy);
        if (sp > 16) { p.vx = (p.vx / sp) * 16; p.vy = (p.vy / sp) * 16; }
      }
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      // ── ฟิสิกส์: กระถกพื้น + เสียดเสียบ (restitution) ──
      if (p.bounce > 0 && p.y > p.groundY) {
        p.y = p.groundY;
        p.vy = -p.vy * p.bounce;
        p.vx *= 0.7;
        p.bounce *= 0.8;
        if (Math.abs(p.vy) < 8) { p.g = 0; p.vy = 0; p.bounce = 0; }
      }
      n++;
    }
    this.active = n;
  },

  draw(g, cx, cy) {
    // ผ่านที่ 1: particle ปกติ (source-over)
    for (let i = 0; i < MAX_P; i++) {
      const p = this.pool[i];
      if (!p.on || p.pulse) continue;
      const k = p.life / p.max;
      g.globalAlpha = p.fade * Math.min(1, k * 2.2);
      g.fillStyle = p.c;
      const s = p.shrink ? Math.max(1, Math.round(p.s * (0.4 + k * 0.6))) : p.s;
      g.fillRect(Math.round(p.x - cx), Math.round(p.y - cy), s, s);
    }
    // ผ่านที่ 2: ตัวกระพริบ (หิ่งห้อย/ละออง) — เปิด lighter ครั้งเดียวต่อเฟรม
    // (เดิมสลับ composite ทุกตัว — software rasterizer รู้สึก-cost สูง)
    let glow = false;
    for (let i = 0; i < MAX_P; i++) {
      const p = this.pool[i];
      if (!p.on || !p.pulse) continue;
      if (!glow) { g.save(); g.globalCompositeOperation = 'lighter'; glow = true; }
      const k = p.life / p.max;
      g.globalAlpha = p.fade * Math.min(1, k * 2.2)
        * (0.45 + 0.55 * (0.5 + 0.5 * Math.sin(this._t * 5 + p.seed * 3)));
      g.fillStyle = p.c;
      const s = p.shrink ? Math.max(1, Math.round(p.s * (0.4 + k * 0.6))) : p.s;
      g.fillRect(Math.round(p.x - cx), Math.round(p.y - cy), s, s);
    }
    if (glow) g.restore();
    g.globalAlpha = 1;
  },

  /** วาดตัวกระพริบซ้ำชั้นหลังตัวกรองแสงกลางคืน — ให้หิ่งห้อยยังมองseenได้แม้มืด */
  drawGlow(g, cx, cy) {
    let drew = false;
    for (let i = 0; i < MAX_P; i++) {
      const p = this.pool[i];
      if (!p.on || !p.pulse) continue;
      const k = p.life / p.max;
      if (!drew) { g.save(); g.globalCompositeOperation = 'lighter'; drew = true; }
      g.globalAlpha = p.fade * Math.min(1, k * 2.2) * 0.8;
      g.fillStyle = p.c;
      g.fillRect(Math.round(p.x - cx) - 1, Math.round(p.y - cy) - 1, p.s + 2, p.s + 2);
    }
    if (drew) { g.restore(); }
    else g.globalAlpha = 1;
  },

  clear() { for (const p of this.pool) p.on = false; this.active = 0; },
  count() { return this.active; },
};

/* ─────────────── กล้อง (นุ่มนวล + สั่น) ─────────────── */
export const Camera = {
  x: 0, y: 0,
  shakeT: 0, shakeDur: 0.001, shakeMag: 0,
  ox: 0, oy: 0,
  enabled: true,
  scale: 1,                // เอาค่าจากตั้งค่า (0=ปิด · 0.5=เบา · 1=ปกติ · 1.6=มาก)

  snap(x, y) { this.x = x; this.y = y; },

  update(dt, tx, ty) {
    const k = Math.min(1, dt * 7.5);
    this.x += (tx - this.x) * k;
    this.y += (ty - this.y) * k;

    if (this.shakeT > 0) {
      this.shakeT = Math.max(0, this.shakeT - dt);
      const f = this.shakeT / this.shakeDur;
      const m = this.shakeMag * f * f;
      this.ox = (Math.random() - 0.5) * 2 * m;
      this.oy = (Math.random() - 0.5) * 2 * m;
    } else {
      this.ox = 0; this.oy = 0;
    }
  },

  kick(mag, dur = 0.22) {
    if (!this.enabled || this.scale <= 0) return;
    const m = mag * this.scale;      // เดิมตั้งค่า 4 ระดับไม่เคยถูกใช้ — มีแค่เปิด/ปิด
    // เอาค่าที่แรงกว่า เพื่อไม่ให้การสั่นเล็ก ๆ กลบการสั่นใหญ่
    if (m * 1.0 >= this.shakeMag * (this.shakeT / this.shakeDur)) {
      this.shakeMag = m;
      this.shakeDur = dur;
      this.shakeT = dur;
    }
  },
};

/* ─────────────── แสงกลางวัน-กลางคืน ─────────────── */
const PHASES = [
  // [สัดส่วนของวัน, สี, ความทึบ]
  [0.00, '18,22,54', 0.52],   // เที่ยงคืน
  [0.18, '30,30,64', 0.44],   // ก่อนรุ่ง
  [0.26, '120,70,50', 0.26],  // รุ่งเช้า
  [0.35, '0,0,0', 0.0],       // สาย
  [0.62, '0,0,0', 0.0],       // บ่าย
  [0.74, '140,70,40', 0.26],  // ตะวันตกดิน
  [0.84, '40,35,70', 0.42],   // พลบ
  [1.00, '18,22,54', 0.52],
];

/** ค่า [r,g,b,alpha] ของช่วงเวลาปัจจุบัน (ไม่สน enabled) */
function phaseAt(t) {
  let a = PHASES[0], b = PHASES[PHASES.length - 1];
  for (let i = 0; i < PHASES.length - 1; i++) {
    if (t >= PHASES[i][0] && t <= PHASES[i + 1][0]) { a = PHASES[i]; b = PHASES[i + 1]; break; }
  }
  const span = (b[0] - a[0]) || 1;
  const f = (t - a[0]) / span;
  const ca = a[1].split(',').map(Number), cb = b[1].split(',').map(Number);
  const col = ca.map((v, i) => Math.round(v + (cb[i] - v) * f));
  const alpha = a[2] + (b[2] - a[2]) * f;
  return [col[0], col[1], col[2], alpha];
}

export const DayNight = {
  t: 0.34,            // เริ่มตอนสาย (มองเห็นชัด)
  cycle: 300,         // หนึ่งวัน = 5 นาทีจริง
  enabled: true,
  _cache: { key: '', c: 'rgba(0,0,0,0)', a: 0 },

  update(dt) {
    if (!this.enabled) return;
    this.t = (this.t + dt / this.cycle) % 1;
  },

  /** คืนค่า [rgba, alpha] ของ tint ปัจจุบัน */
  tint() {
    if (!this.enabled) return null;
    const [r, g, b, alpha] = phaseAt(this.t);
    if (alpha < 0.01) return null;
    return { c: `rgb(${r},${g},${b})`, a: alpha };
  },

  /** ความมืด 0..1 — ใช้ตัดสินใจว่าจะวาดแสงอุ่น/หิ่งห้อยแค่ไหน */
  darkness() {
    if (!this.enabled) return 0;
    return Math.min(1, phaseAt(this.t)[3] / 0.48);
  },

  label() {
    if (this.t < 0.24) return 'กลางคืน';
    if (this.t < 0.32) return 'รุ่งเช้า';
    if (this.t < 0.66) return 'กลางวัน';
    if (this.t < 0.78) return 'เย็น';
    if (this.t < 0.86) return 'พลบ';
    return 'กลางคืน';
  },

  icon() {
    if (this.t < 0.24) return '🌙';
    if (this.t < 0.32) return '🌅';
    if (this.t < 0.66) return '☀️';
    if (this.t < 0.78) return '🌇';
    if (this.t < 0.86) return '🌆';
    return '🌙';
  },
};

/* ─────────────── Hit-stop (หยุดเวลาเสี้ยววินาทีตอนตีแรง) ─────────────── */
export const HitStop = {
  t: 0,
  trigger(dur) { if (dur > this.t) this.t = dur; },
  consume(dt) {
    if (this.t <= 0) return dt;
    const used = Math.min(this.t, dt);
    this.t -= used;
    return dt - used;
  },
  get active() { return this.t > 0; },
};

/* ─────────────── ตัววัดประสิทธิภาพ ─────────────── */
export const Perf = {
  buf: new Float32Array(120),
  sort: new Float32Array(120),   // ใช้ซ้ำทุกเฟรม — เดิมสร้างอาเรย์ใหม่ทุกเฟรม then sort
  i: 0, filled: 0,
  fps: 0, ms: 0, p95: 0, worst: 0,
  longFrames: 0,

  sample(ms) {
    this.buf[this.i] = ms;
    this.i = (this.i + 1) % this.buf.length;
    if (this.filled < this.buf.length) this.filled++;
    if (ms > 33) this.longFrames++;

    if (this.filled < 8) return;
    const n = this.filled;
    let sum = 0;
    for (let k = 0; k < n; k++) { sum += this.buf[k]; this.sort[k] = this.buf[k]; }
    this.ms = sum / n;
    this.fps = 1000 / this.ms;
    this.sort.subarray(0, n).sort();
    this.p95 = this.sort[Math.floor(n * 0.95)];
    this.worst = this.sort[n - 1];
  },

  reset() { this.filled = 0; this.i = 0; this.longFrames = 0; },
};
