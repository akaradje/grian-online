/* ═══════════════════════════════════════════════════════════
   auto.js — โหมดเล่นอัตโนมัติ (ของคู่บ้านคู่เมืองของ MMO ไทย)
   ทำงานจริง: หาเป้า เดินเข้าหา ตี ใช้สกิล กินยา เก็บของ กลับจุดเดิม
   พร้อมสถานะที่ล้อเลียนว่า AI มัน "คิดไม่ค่อยเก่ง"
   ═══════════════════════════════════════════════════════════ */

import { SKILLS, ADVANCED } from './data.js';
import { playerAttack, nearestMonster, ATTACK_RANGE, countItem } from './entities.js';
import { Settings } from './settings.js';

const REPATH_EVERY = 0.55;
const HOME_RADIUS = 110;        // ไกลกว่านี้ถือว่าออกจากพื้นที่ แล้วเดินกลับ
const RETREAT_PUSH = 90;        // ระยะที่ถอยหนีเมื่อเลือดน้อย

/** สกิลที่ AUTO พิจารณาใช้ — รวมสกิลสาขาย่อย */
function usableSkills(p) {
  return p.advId && ADVANCED[p.advId] ? [...p.cls.skills, ADVANCED[p.advId].skill] : p.cls.skills;
}

export const Auto = {
  on: false,
  st: 'idle',
  stT: 0,
  home: null,
  repathT: 0,
  skillT: 0,
  thinkT: 45,
  statusMsg: '',
  finder: null,
  world: null,
  sessionStart: 0,
  killsStart: 0,

  attach({ finder, world }) { this.finder = finder; this.world = world; },

  toggle(state) {
    this.on = !this.on;
    const p = state.player;
    if (this.on) {
      this.home = { x: p.x, y: p.y };
      this.st = 'search';
      this.stT = 0;
      this.skillT = 0;
      this.thinkT = 45 + Math.random() * 30;
      this.sessionStart = state.time;
      this.killsStart = p.kills_total;
      state.onAutoToggle?.(true);
    } else {
      // บันทึกเวลาเล่นด้วย auto ไว้ทำสถิติ/ความสำเร็จ
      p.ctr.autoTime = (p.ctr.autoTime || 0) + Math.max(0, state.time - this.sessionStart);
      p.path = null; p.pathIdx = 0;
      state.targetMonster = null;
      state.onAutoToggle?.(false);
    }
    return this.on;
  },

  reset(state) {
    if (this.on && state.player) {
      state.player.ctr.autoTime = (state.player.ctr.autoTime || 0) + Math.max(0, state.time - this.sessionStart);
    }
    this.on = false;
    this.st = 'idle';
    this.home = null;
    this.repathT = 0;
  },

  /** ข้อความสถานะที่แสดงบนปุ่ม AUTO */
  status() {
    if (!this.on) return { label: 'AUTO ปิด', cls: 'off' };
    return {
      label: {
        idle: 'AUTO: ว่าง',
        search: 'AUTO: หาเป้า...',
        move: 'AUTO: กำลังวิ่ง',
        fight: 'AUTO: กำลังตี',
        rest: 'AUTO: ถอยหนี',
        home: 'AUTO: กลับจุดเดิม',
        pot: 'AUTO: กินยา',
        think: 'AUTO: AI กำลังคิด...',
      }[this.st] || 'AUTO',
      cls: 'on',
    };
  },

  /* ─────────── ตัวเลือกเป้าหมาย ─────────── */
  pickTarget(state) {
    const p = state.player;
    const range = Number(Settings.get('autoRange')) || 260;
    const mode = Settings.get('autoMode') || 'balanced';
    let best = null, bd = range * range;

    for (const m of state.monsters) {
      if (m.dead) continue;
      // โหมดสุภาพ: ไม่ไปหาเรื่องมอนที่ไม่ได้สู้กับเรา
      if (mode === 'polite' && !m.engaged && !m.boss) continue;
      // โหมดสุภาพ/สมดุล: อย่าไปยุ่งกับ elite ที่เลือดเราไม่เต็ม
      if (mode !== 'aggressive' && m.elite && p.hp / p.maxHp < 0.7) continue;
      if (mode === 'polite' && m.boss) continue;
      const d = (m.x - p.x) ** 2 + (m.y - p.y) ** 2;
      if (d < bd) { bd = d; best = m; }
    }
    return best;
  },

  /* ─────────── เลือกสกิลที่จะใช้ ─────────── */
  chooseSkill(state, target) {
    const p = state.player;
    const near = state.monsters.filter(
      (m) => !m.dead && Math.hypot(m.x - p.x, m.y - p.y) < 60,
    ).length;

    const ready = (id) => {
      const sk = SKILLS[id];
      if (!sk) return false;
      if ((p.cooldowns[id] || 0) > 0) return false;
      if (p.mp < sk.mp) return false;
      return sk;
    };

    let buffPick = null, dmgPick = null, healPick = null, aoePick = null, execPick = null;
    for (const id of usableSkills(p)) {
      const sk = ready(id);
      if (!sk) continue;
      if (sk.type === 'heal') healPick = healPick || id;
      else if (sk.type === 'buff') buffPick = buffPick || id;
      else if (sk.type === 'exec') {
        if (target && target.hp / target.maxHp < sk.threshold) execPick = id;
      } else if (sk.type === 'aoe') {
        if (near >= 2) aoePick = id;
      } else if (sk.type === 'dmg' || sk.type === 'stun' || sk.type === 'selfdmg' || sk.type === 'banish') {
        dmgPick = dmgPick || id;
      }
    }

    // ลำดับความสำคัญ: ฟื้นเลือด → เก็บคิล → ตีหมู่ → บัฟ → ท่าโจมตี
    if (healPick && p.hp / p.maxHp < 0.5) return healPick;
    if (execPick) return execPick;
    if (aoePick) return aoePick;
    if (buffPick && !p.buffs.some((b) => b.t > 2)) return buffPick;
    return dmgPick;
  },

  /* ─────────── อัปเดตหลัก ─────────── */
  update(state, dt) {
    if (!this.on) return;
    const p = state.player;
    if (!p || p.dead) return;

    this.stT += dt;
    this.skillT -= dt;
    this.repathT -= dt;

    const mode = Settings.get('autoMode') || 'balanced';
    const hpR = p.hp / p.maxHp;

    // ── 0. AI งง (มุก: ล้อเลียน auto ที่คิดไม่ค่อยเก่ง) ──
    this.thinkT -= dt;
    if (this.thinkT <= 0 && this.st !== 'think') {
      this.thinkT = 55 + Math.random() * 45;
      this.st = 'think';
      this.stT = 0;
      state.onAutoThink?.();
      return;
    }
    if (this.st === 'think') {
      if (this.stT > 1.1) { this.st = 'search'; this.stT = 0; }
      return;
    }

    // ── 1. กินยา ──
    if (Settings.get('autoPotion')) {
      if (hpR < 0.35 && countItem(p, 'hp_potion') > 0) {
        this.st = 'pot'; this.stT = 0;
        state.onAutoUseItem?.('hp_potion');
        return;
      }
      if (p.mp / p.maxMp < 0.22 && countItem(p, 'mp_potion') > 0) {
        state.onAutoUseItem?.('mp_potion');
      }
    }

    // ── 2. เลือดน้อย → ถอย (โหมดดุดันไม่ถอย) ──
    const retreatAt = mode === 'aggressive' ? 0 : (mode === 'polite' ? 0.4 : 0.2);
    if (retreatAt && hpR < retreatAt) {
      const threat = nearestMonster(state, p.x, p.y, 150);
      this.st = 'rest';
      if (threat) {
        // ถอยออกห่างจากมอนที่ใกล้สุด
        const dx = p.x - threat.x, dy = p.y - threat.y;
        const d = Math.hypot(dx, dy) || 1;
        const sp = p.spd * 1.05 * dt;
        const nx = p.x + (dx / d) * sp, ny = p.y + (dy / d) * sp;
        if (!state.world.solidAtPx(nx, p.y)) p.x = nx;
        if (!state.world.solidAtPx(p.x, ny)) p.y = ny;
      }
      state.targetMonster = null;
      return;
    }

    // ── 3. หาเป้า ──
    let target = state.targetMonster;
    if (!target || target.dead) {
      target = this.pickTarget(state);
      state.targetMonster = target;
    }

    if (target) {
      const d = Math.hypot(target.x - p.x, target.y - p.y);

      // ── 3a. อยู่ในระยะตี → ตี + ใช้สกิล ──
      if (d <= ATTACK_RANGE + 6) {
        this.st = 'fight';
        p.path = null; p.pathIdx = 0;
        p.dir = Math.sign(target.x - p.x) || p.dir;
        if (p.attackCd <= 0) {
          p.attackCd = 0.42;
          playerAttack(state, 1, '', target);
        }
        if (Settings.get('autoSkill') && this.skillT <= 0) {
          const id = this.chooseSkill(state, target);
          if (id) { this.skillT = 0.5; state.onAutoSkill?.(id); }
        }
        return;
      }

      // ── 3b. เดินเข้าหา ──
      this.st = 'move';
      if (!p.path || this.repathT <= 0) {
        this.repathT = REPATH_EVERY;
        const path = this.finder && this.finder.find(p.x, p.y, target.x, target.y);
        if (path) { p.path = path; p.pathIdx = 0; }
      }
      return;
    }

    // ── 4. ไม่มีเป้า → กลับจุดที่เปิด auto ──
    if (this.home && Math.hypot(p.x - this.home.x, p.y - this.home.y) > HOME_RADIUS) {
      this.st = 'home';
      if (!p.path || this.repathT <= 0) {
        this.repathT = REPATH_EVERY * 2;
        const path = this.finder && this.finder.find(p.x, p.y, this.home.x, this.home.y);
        if (path) { p.path = path; p.pathIdx = 0; }
      }
      return;
    }

    this.st = 'search';
    p.path = null;
  },

  /** สรุปผลของเซสชัน auto (ใช้แสดงตอนปิด) */
  sessionSummary(state) {
    const p = state.player;
    const mins = Math.max(0, state.time - this.sessionStart) / 60;
    return {
      minutes: mins,
      kills: p.kills_total - this.killsStart,
      totalAutoMinutes: (p.ctr.autoTime || 0) / 60,
    };
  },
};
