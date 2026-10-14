/* ═══════════════════════════════════════════════════════════
   vfx.js — เอฟเฟกต์ของสกิล (คนละชั้นกับ Particles)
   Particles = อนุภาคเม็ดเล็กจำนวนมาก
   VFX      = รูปทรงที่วาดเอง เช่น ลูกไฟบิน สายฟ้า เสาแสง คลื่นกระแทก
   ═══════════════════════════════════════════════════════════ */

import { Particles, compact } from './fx.js';

const MAX_VFX = 90;

export const VFX = {
  list: [],
  flashes: [],          // แฟลชเต็มจอ (วาดทับทุกอย่าง)
  shakeHint: 0,

  spawn(kind, o = {}) {
    if (this.list.length >= MAX_VFX) this.list.shift();
    const e = {
      kind,
      x: o.x || 0, y: o.y || 0,
      x2: o.x2, y2: o.y2,
      from: o.from, to: o.to,
      follow: o.follow || null,
      color: o.color || '#ffffff',
      color2: o.color2 || null,
      size: o.size || 20,
      dur: o.dur || 0.45,
      t: 0,
      seed: Math.random() * 1000,
      text: o.text || null,
      arc: o.arc === undefined ? 18 : o.arc,
      z: 0, vz: 0, vx: 0, vy: 0, g: 0, ph: false,
    };
    // ── ฟิสิกส์: ลูกไฟ/กระสุนบิน = การเคลื่อนที่แบบ ballistic (g คงที่) ──
    // จากระยะ + เวลาบินคำนวณ vx,vy,vz ให้ลงจุดเป้าหมายตรงเวลา T พร้อม apex = arc
    //   z(T) = dz  ⇒  vz = dz/T + ½gT · apex = ½gT² = arc  ⇒  g = 8·arc/T²
    if (kind === 'projectile' && o.from && o.to && e.dur > 0) {
      const T = e.dur, dz = (o.to.y - o.from.y) || 0;
      e.g = (8 * e.arc) / (T * T);
      e.vz = dz / T + 0.5 * e.g * T;
      e.vx = ((o.to.x - o.from.x) || 0) / T;
      e.vy = dz / T;
      e.x = o.from.x; e.y = o.from.y;
      e.ph = true;               // physics-driven
    }
    this.list.push(e);
    return e;
  },

  flash(color, alpha, dur = 0.28) {
    this.flashes.push({ color, a0: alpha, t: 0, dur });
  },

  update(dt) {
    const l = this.list;
    for (let i = 0; i < l.length; i++) {
      const e = l[i];
      e.t += dt;
      if (e.follow) { e.x = e.follow.x; e.y = e.follow.y; }

      if (e.ph) {
        // ── ballistic: ความเร่งโน้มถ่วงคงที่ (semi-implicit Euler เฟรมคงที่ 60Hz) ──
        e.z += e.vz * dt;
        e.vz -= e.g * dt;
        if (e.z <= 0 && e.vz < 0) {          // กระแทกพื้น: เด้งตาม restitution + สูญเสียพลังงาน
          e.z = 0;
          e.vz = -e.vz * 0.42;
          e.vx *= 0.72; e.vy *= 0.72;
          if (Math.abs(e.vz) < 26) { e.vz = 0; e.dead = true; }   // หยุดเด้ง — เลือนทิ้ง
        }
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        // ทิ้งหางไว้ข้างหลัง (ความหนาแน่นตามอัตรารอบตัว — เร็ว=ห่าง)
        if (Math.random() < 0.8) {
          Particles.spawn('spark', e.x, e.y, { count: 1, c: e.color });
        }
      }
      if (e.kind === 'aura' && Math.random() < 0.25) {
        const a = Math.random() * Math.PI * 2;
        Particles.spawn('spark', e.x + Math.cos(a) * e.size, e.y + Math.sin(a) * e.size * 0.5,
          { count: 1, c: e.color });
      }
    }
    compact(l, (e) => e.t < e.dur && !e.dead);
    compact(this.flashes, (f) => { f.t += dt; return f.t < f.dur; });
  },

  /** วาดในพิกัดโลก (หลังตัวละคร เพื่อให้เอฟเฟกต์อยู่หน้าสุด) */
  draw(g, cx, cy, proj) {
    const l = this.list;
    for (let i = 0; i < l.length; i++) {
      const e = l[i];
      const k = Math.min(1, e.t / e.dur);
      // proj: world→CSS (โหมด 3D) — มิฉะนั้น map แบบ 2D ตรง ๆ
      // e.z = ความสูงจริงของลูกไฟ (ballistic) → โปรเจกต์ให้สูงขึ้นจากพื้นตามฟิสิกส์
      const P = proj ? proj(e.x, e.y, e.z || 0) : { x: e.x - cx, y: e.y - cy - (e.z || 0) };
      const X = Math.round(P.x), Y = Math.round(P.y);
      const X2 = e.x2 !== undefined ? Math.round((proj ? proj(e.x2, e.y2, 0) : { x: e.x2 - cx }).x) : X;
      const Y2 = e.y2 !== undefined ? Math.round((proj ? proj(e.x2, e.y2, 0) : { y: e.y2 - cy }).y) : Y;
      g.save();

      switch (e.kind) {
        /* ── รอยฟันโค้ง ── */
        case 'arc': {
          const r = e.size * (0.5 + k * 0.9);
          g.globalAlpha = (1 - k) * 0.95;
          g.strokeStyle = e.color;
          g.lineWidth = 2.5 - k * 1.5;
          g.beginPath();
          g.arc(X, Y, r, -Math.PI * 0.9 + k * 1.4, -Math.PI * 0.1 + k * 1.4);
          g.stroke();
          g.globalAlpha = (1 - k) * 0.5;
          g.strokeStyle = '#ffffff';
          g.lineWidth = 1;
          g.beginPath();
          g.arc(X, Y, r * 0.8, -Math.PI * 0.85 + k * 1.4, -Math.PI * 0.15 + k * 1.4);
          g.stroke();
          break;
        }

        /* ── ลูกไฟ/กระสุนบิน ── */
        case 'projectile': {
          const r = 3.5 - k * 0.8;
          g.globalAlpha = 0.35;
          g.fillStyle = e.color;
          g.beginPath(); g.arc(X, Y, r * 2.6, 0, Math.PI * 2); g.fill();
          g.globalAlpha = 1;
          g.fillStyle = e.color;
          g.beginPath(); g.arc(X, Y, r, 0, Math.PI * 2); g.fill();
          g.fillStyle = '#fff8e0';
          g.beginPath(); g.arc(X - 0.5, Y - 0.5, r * 0.5, 0, Math.PI * 2); g.fill();
          break;
        }

        /* ── ระเบิด ── */
        case 'explosion': {
          const r = e.size * (0.35 + k * 0.9);
          g.globalAlpha = (1 - k) * 0.85;
          g.fillStyle = e.color;
          g.beginPath(); g.arc(X, Y, r, 0, Math.PI * 2); g.fill();
          g.globalAlpha = (1 - k) * 0.95;
          g.fillStyle = '#fff2c0';
          g.beginPath(); g.arc(X, Y, r * 0.45, 0, Math.PI * 2); g.fill();
          g.globalAlpha = (1 - k) * 0.7;
          g.strokeStyle = e.color2 || e.color;
          g.lineWidth = 2;
          g.beginPath(); g.arc(X, Y, r * 1.25, 0, Math.PI * 2); g.stroke();
          break;
        }

        /* ── คลื่นกระแทก ── */
        case 'shockwave': {
          const r = e.size * k;
          g.globalAlpha = (1 - k) * 0.9;
          g.strokeStyle = e.color;
          g.lineWidth = 3 - k * 2;
          g.beginPath(); g.ellipse(X, Y, r, r * 0.55, 0, 0, Math.PI * 2); g.stroke();
          if (e.color2) {
            g.globalAlpha = (1 - k) * 0.5;
            g.strokeStyle = e.color2;
            g.lineWidth = 1;
            g.beginPath(); g.ellipse(X, Y, r * 0.72, r * 0.4, 0, 0, Math.PI * 2); g.stroke();
          }
          break;
        }

        /* ── สายฟ้า (ซิกแซก) ── */
        case 'bolt': {
          const bx = X2, by = Y2;
          g.globalAlpha = (1 - k) * 0.95;
          for (let pass = 0; pass < 2; pass++) {
            g.strokeStyle = pass ? '#ffffff' : e.color;
            g.lineWidth = pass ? 1 : 2.5;
            g.beginPath();
            g.moveTo(X, Y);
            const segs = 7;
            for (let s = 1; s <= segs; s++) {
              const f = s / segs;
              const jitter = (s === segs) ? 0 : (Math.random() - 0.5) * 7;
              g.lineTo(X + (bx - X) * f + jitter, Y + (by - Y) * f + jitter * 0.6);
            }
            g.stroke();
          }
          break;
        }

        /* ── เสาแสง ── */
        case 'beam': {
          const w = e.size * (1 - k * 0.35);
          g.globalAlpha = (1 - k) * 0.55;
          g.fillStyle = e.color;
          g.fillRect(X - w / 2, Y - 90, w, 90);
          g.globalAlpha = (1 - k) * 0.9;
          g.fillStyle = '#ffffff';
          g.fillRect(X - w / 6, Y - 90, w / 3, 90);
          g.globalAlpha = (1 - k) * 0.6;
          g.beginPath(); g.ellipse(X, Y, w * 0.9, w * 0.35, 0, 0, Math.PI * 2); g.fill();
          break;
        }

        /* ── รอยไหม้บนพื้น ── */
        case 'decal': {
          g.globalAlpha = (1 - k) * 0.5;
          g.fillStyle = e.color;
          g.beginPath(); g.ellipse(X, Y, e.size, e.size * 0.5, 0, 0, Math.PI * 2); g.fill();
          break;
        }

        /* ── วงออร่ารอบตัว (ตามเอนทิตี) ── */
        case 'aura': {
          const pulse = 0.75 + 0.25 * Math.sin(e.t * 9);
          g.globalAlpha = (1 - k) * 0.75;
          g.strokeStyle = e.color;
          g.lineWidth = 1.5;
          g.beginPath(); g.ellipse(X, Y, e.size * pulse, e.size * 0.5 * pulse, 0, 0, Math.PI * 2); g.stroke();
          g.globalAlpha = (1 - k) * 0.4;
          g.fillStyle = e.color;
          g.beginPath(); g.ellipse(X, Y, e.size * 0.75 * pulse, e.size * 0.38 * pulse, 0, 0, Math.PI * 2); g.fill();
          break;
        }

        /* ── เส้นความเร็ว ── */
        case 'speedlines': {
          g.globalAlpha = (1 - k) * 0.7;
          g.strokeStyle = e.color;
          g.lineWidth = 1;
          for (let s = 0; s < 6; s++) {
            const yy = Y - 10 + s * 4 + ((e.seed + s * 7) % 5);
            const len = 12 + ((e.seed * (s + 1)) % 14);
            g.beginPath();
            g.moveTo(X - 4 - len, yy);
            g.lineTo(X - 4, yy);
            g.stroke();
          }
          break;
        }

        /* ── ดูดเข้าศูนย์กลาง ── */
        case 'implode': {
          g.globalAlpha = (1 - k) * 0.9;
          g.strokeStyle = e.color;
          g.lineWidth = 1.5;
          for (let s = 0; s < 10; s++) {
            const a = (s / 10) * Math.PI * 2 + e.seed;
            const r = e.size * (1 - k);
            g.beginPath();
            g.moveTo(X + Math.cos(a) * r, Y + Math.sin(a) * r * 0.6);
            g.lineTo(X + Math.cos(a) * (r + 6), Y + Math.sin(a) * (r + 6) * 0.6);
            g.stroke();
          }
          g.globalAlpha = (1 - k) * 0.8;
          g.fillStyle = '#ffffff';
          g.beginPath(); g.arc(X, Y, 2 + (1 - k) * 3, 0, Math.PI * 2); g.fill();
          break;
        }

        /* ── ประกายฟื้นเลือด ── */
        case 'motes': {
          g.globalAlpha = (1 - k) * 0.9;
          g.fillStyle = e.color;
          for (let s = 0; s < 9; s++) {
            const a = (s / 9) * Math.PI * 2 + e.seed;
            const r = e.size * (1 - k * 0.6);
            const yy = Y - k * 26 + Math.sin(a) * 3;
            g.fillRect(X + Math.cos(a) * r, yy, 2, 2);
          }
          break;
        }
      }
      g.restore();
    }
  },

  /** วาดทับทุกอย่าง (แฟลชเต็มจอ) */
  drawOverlay(g, w, h) {
    for (let i = 0; i < this.flashes.length; i++) {
      const f = this.flashes[i];
      const k = f.t / f.dur;
      g.save();
      g.globalAlpha = f.a0 * (1 - k);
      g.fillStyle = f.color;
      g.fillRect(0, 0, w, h);
      g.restore();
    }
  },

  clear() { this.list.length = 0; this.flashes.length = 0; },
  count() { return this.list.length; },
};

/* ═══════════════════════════════════════════════════════════
   เอฟเฟกต์เฉพาะของแต่ละสกิล — ทุกท่าต้องดูออกทันทีว่าเป็นท่าไหน
   ctx = { caster, target, skill }
   ═══════════════════════════════════════════════════════════ */
export function spawnSkillFx(skillId, ctx) {
  const { caster, target } = ctx;
  const cx = caster.x, cy = caster.y - 8;
  const tx = target ? target.x : caster.x + caster.dir * 26;
  const ty = target ? target.y - 8 : caster.y - 8;

  switch (skillId) {
    case 'slash':
      VFX.spawn('arc', { x: cx + caster.dir * 16, y: cy, color: '#ffffff', size: 24, dur: 0.28 });
      Particles.spawn('spark', cx + caster.dir * 14, cy, { count: 5, c: '#ffe9a8' });
      break;

    case 'lootbag':
      VFX.spawn('aura', { follow: caster, x: cx, y: caster.y, color: '#ffc94d', size: 20, dur: 1.3 });
      VFX.spawn('motes', { x: caster.x, y: caster.y, color: '#ffd76a', size: 18, dur: 0.8 });
      break;

    case 'fire':
      // ลูกไฟบินเป็นโค้งไปหาศัตรู แล้วระเบิดทิ้งรอยไหม้ไว้
      VFX.spawn('projectile', {
        from: { x: cx, y: cy }, to: { x: tx, y: ty },
        color: '#ff8f3c', size: 20, dur: 0.3, arc: 14,
      });
      setTimeout(() => {
        VFX.spawn('explosion', { x: tx, y: ty, color: '#ff8f3c', color2: '#ffd76a', size: 26, dur: 0.5 });
        VFX.spawn('decal', { x: tx, y: target ? target.y : ty + 8, color: '#3a2418', size: 11, dur: 2.4 });
        Particles.spawn('burst', tx, ty, { count: 12, c: '#ff8f3c' });
      }, 300);
      break;

    case 'collect':
      VFX.spawn('shockwave', { x: caster.x, y: caster.y, color: '#ffc94d', color2: '#fff2c0', size: 64, dur: 0.48 });
      Particles.spawn('coin', caster.x, caster.y - 10, { count: 8 });
      break;

    case 'steal':
      VFX.spawn('arc', { x: cx + caster.dir * 14, y: cy, color: '#ff4d6b', size: 26, dur: 0.3 });
      VFX.spawn('implode', { x: tx, y: ty, color: '#ff4d6b', size: 30, dur: 0.45 });
      VFX.flash('#ff4d6b', 0.16, 0.22);
      break;

    case 'feed':
      VFX.spawn('explosion', { x: caster.x, y: caster.y - 8, color: '#c94f4f', color2: '#ff8f8f', size: 16, dur: 0.42 });
      Particles.spawn('blood', caster.x, caster.y - 8, { count: 10, c: '#c94f4f' });
      break;

    case 'shutdown':
      VFX.spawn('bolt', { x: cx, y: cy, x2: tx, y2: ty, color: '#7fe0ff', dur: 0.28 });
      VFX.spawn('aura', { follow: target || caster, x: tx, y: target ? target.y : caster.y, color: '#7fe0ff', size: 15, dur: 0.9 });
      Particles.spawn('spark', tx, ty, { count: 10, c: '#7fe0ff' });
      break;

    case 'turbo':
      VFX.spawn('aura', { follow: caster, x: cx, y: caster.y, color: '#7fe0ff', size: 17, dur: 1.0 });
      VFX.spawn('speedlines', { follow: caster, x: cx, y: cy, color: '#bff0ff', dur: 0.9 });
      break;

    case 'ult':
      VFX.flash('#ffd76a', 0.40, 0.42);
      VFX.spawn('explosion', { x: tx, y: ty, color: '#ffc94d', color2: '#fff2c0', size: 46, dur: 0.72 });
      VFX.spawn('shockwave', { x: tx, y: ty, color: '#ffc94d', color2: '#ffffff', size: 82, dur: 0.62 });
      VFX.spawn('motes', { x: caster.x, y: caster.y, color: '#fff2c0', size: 24, dur: 0.7 });
      break;

    case 'ban':
      VFX.spawn('implode', { x: tx, y: ty, color: '#b98bff', size: 36, dur: 0.5 });
      VFX.spawn('decal', { x: tx, y: target ? target.y : ty + 8, color: '#2a1f45', size: 12, dur: 1.8 });
      break;

    case 'restart':
      VFX.spawn('beam', { x: caster.x, y: caster.y, color: '#5fe89b', size: 24, dur: 0.85 });
      VFX.spawn('motes', { x: caster.x, y: caster.y, color: '#5fe89b', size: 18, dur: 0.85 });
      break;

    /* ── สกิลสาขาย่อย: ได้เฉดสี/รูปทรงตามเท่ของสาขา ── */
    case 'dig':
      VFX.spawn('shockwave', { x: caster.x, y: caster.y, color: '#ffc94d', color2: '#fff2c0', size: 44, dur: 0.44 });
      Particles.spawn('coin', caster.x, caster.y - 10, { count: 5 });
      break;
    case 'finisher':
      VFX.spawn('arc', { x: cx + caster.dir * 16, y: cy, color: '#ff6b6b', size: 28, dur: 0.28 });
      VFX.spawn('implode', { x: tx, y: ty, color: '#ff6b6b', size: 22, dur: 0.4 });
      VFX.flash('#ff4d6b', 0.10, 0.18);
      break;
    case 'fire3':
      for (let i = 0; i < 3; i++) {
        VFX.spawn('projectile', {
          from: { x: cx, y: cy - i * 4 }, to: { x: tx + (i - 1) * 10, y: ty },
          color: '#ff8f3c', size: 18, dur: 0.26, arc: 16 + i * 6,
        });
      }
      break;
    case 'overdraw':
      VFX.spawn('aura', { follow: caster, x: cx, y: caster.y, color: '#c9a2ff', size: 26, dur: 1.1 });
      VFX.spawn('shockwave', { x: tx, y: ty, color: '#c9a2ff', color2: '#ffffff', size: 70, dur: 0.6 });
      VFX.flash('#c9a2ff', 0.22, 0.3);
      break;
    case 'rally':
      VFX.spawn('aura', { follow: caster, x: cx, y: caster.y, color: '#5fe89b', size: 22, dur: 1.2 });
      VFX.spawn('motes', { x: caster.x, y: caster.y, color: '#5fe89b', size: 20, dur: 0.8 });
      break;
    case 'grandfeed':
      VFX.spawn('explosion', { x: caster.x, y: caster.y - 8, color: '#c94f4f', color2: '#ff8f8f', size: 22, dur: 0.46 });
      Particles.spawn('blood', caster.x, caster.y - 8, { count: 14, c: '#c94f4f' });
      break;
    case 'lanfix':
      VFX.spawn('aura', { follow: caster, x: cx, y: caster.y, color: '#7fe0ff', size: 20, dur: 1.0 });
      VFX.spawn('speedlines', { follow: caster, x: cx, y: cy, color: '#bff0ff', dur: 0.9 });
      break;
    case 'lagspike':
      VFX.spawn('bolt', { x: cx, y: cy, x2: tx, y2: ty, color: '#8ad6ff', dur: 0.3 });
      VFX.spawn('shockwave', { x: tx, y: ty, color: '#8ad6ff', color2: '#ffffff', size: 40, dur: 0.5 });
      break;
    case 'star55':
      VFX.spawn('motes', { x: caster.x, y: caster.y, color: '#ffd76a', size: 26, dur: 0.9 });
      VFX.spawn('shockwave', { x: tx, y: ty, color: '#ffd76a', color2: '#ffffff', size: 76, dur: 0.6 });
      VFX.flash('#ffd76a', 0.26, 0.34);
      break;
    case 'reroll':
      VFX.spawn('aura', { follow: caster, x: cx, y: caster.y, color: '#b98bff', size: 20, dur: 1.1 });
      VFX.spawn('motes', { x: caster.x, y: caster.y, color: '#b98bff', size: 22, dur: 0.8 });
      break;
    case 'blacklist':
      VFX.spawn('implode', { x: tx, y: ty, color: '#b98bff', size: 40, dur: 0.5 });
      VFX.spawn('decal', { x: tx, y: target ? target.y : ty + 8, color: '#241d45', size: 14, dur: 1.8 });
      break;
    case 'hotfix':
      VFX.spawn('beam', { x: caster.x, y: caster.y, color: '#5fe89b', size: 28, dur: 0.9 });
      VFX.spawn('motes', { x: caster.x, y: caster.y, color: '#5fe89b', size: 20, dur: 0.9 });
      break;

    default:
      VFX.spawn('arc', { x: cx + caster.dir * 14, y: cy, color: '#ffffff', size: 20, dur: 0.26 });
  }
}

