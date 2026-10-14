/* ═══════════════════════════════════════════════════════════
   autoquest.js — ออโต้เควสต์ (ของคู่บ้านของ MMO ไทย — ต่อจาก AUTO)
   ทำงานจริง: รับเควสต์ → ฆ่ามอนตามเป้า/เก็บไอเทม → คุย NPC →
             กลับส่งเควสต์ → รับตัวต่อไป
   ─══════════════════════════════════════════════════════════ */

import { QUESTS, NPCS, MONSTERS } from './data.js';
import { acceptQuest, completeQuest, questProgress } from './systems.js';
import { playerAttack, ATTACK_RANGE, countItem } from './entities.js';
import { Settings } from './settings.js';

let finder = null;

/** มอนที่ดรอปไอเทมนี้ (ไว้ฟาร์มเควสต์ชนิด "เก็บของ") */
function monstersDropping(item) {
  const out = [];
  for (const m of Object.values(MONSTERS)) {
    if ((m.drops || []).some(([id]) => id === item)) out.push(m.id);
  }
  return out;
}

export const AutoQ = {
  on: false,
  st: 'off',            // idle · accept · farm · collect · talk · turnin
  stT: 0,
  repathT: 0,
  questId: null,

  attach(f) { finder = f; },

  toggle(state) {
    this.on = !this.on;
    if (this.on) {
      this.st = 'idle'; this.stT = 0; this.repathT = 0;
      state.onAutoQuest?.(true);
    } else {
      state.onAutoQuest?.(false);
    }
    return this.on;
  },

  status(state) {
    if (!this.on) return { label: 'ปิดอยู่', cls: 'off' };
    const names = {
      idle: 'รอเควสต์', accept: 'ไปรับเควสต์', farm: 'ไปฆ่ามอน',
      collect: 'เก็บไอเทม', talk: 'ไปคุย NPC', turnin: 'ไปส่งเควสต์',
    };
    const q = this.questId ? questById(this.questId) : null;
    const extra = q ? ` · ${q.title.length > 20 ? q.title.slice(0, 20) + '…' : q.title}` : '';
    return { label: (names[this.st] || this.st) + extra, cls: 'on' };
  },

  /** เควสต์ที่กำลังทำ — เลือกตัวที่ใกล้เสร็จสุดก่อน */
  pickQuest(state) {
    let best = null, bestRatio = -1;
    for (const q of QUESTS) {
      const prog = state.player.quests[q.id];
      if (!prog || prog.state !== 'active') continue;
      const pr = questProgress(state, q);
      const ratio = pr.need > 0 ? pr.cur / pr.need : 0;
      if (ratio > bestRatio) { bestRatio = ratio; best = q; }
    }
    return best;
  },

  /** NPC ที่ให้เควสต์นี้ */
  giverOf(q) {
    for (const n of Object.values(NPCS)) {
      if ((n.quests || []).includes(q.id)) return n.id;
    }
    return null;
  },

  /** เดินไปหา NPC — คืน true ถ้าอยู่ใกล้พอให้ interact */
  goToNpc(state, npcId, dt, reach = 52) {
    const p = state.player;
    const npc = state.npcs.find((n) => n.id === npcId);
    if (!npc) return false;
    const d = Math.hypot(npc.x - p.x, npc.y - p.y);
    if (d <= reach) { p.path = null; p.pathIdx = 0; return true; }
    if (!p.path || this.repathT <= 0) {
      this.repathT = 0.6;
      const path = finder && finder.find(p.x, p.y, npc.x, npc.y);
      if (path) { p.path = path; p.pathIdx = 0; }
    }
    return false;
  },

  update(state, dt) {
    if (!this.on || !state.player || !state.world) return;
    const p = state.player;
    if (state.paused || state.inputLocked || p.dead) return;

    this.stT -= dt;
    this.repathT -= dt;

    const quest = this.pickQuest(state);
    if (quest) { this.questId = quest.id; this.doQuest(state, quest, dt); return; }

    // ไม่มีเควสต์กำลังทำ → ไปรับใหม่
    this.questId = null;
    this.tryAcceptAny(state, dt);
  },

  doQuest(state, q, dt) {
    const pr = questProgress(state, q);

    // เป้าหมายเสร็จแล้ว → กลับส่ง
    if (pr.done) {
      this.st = 'turnin';
      const giver = this.giverOf(q);
      if (!giver || this.goToNpc(state, giver, dt, 56)) {
        completeQuest(state, q.id);
        this.questId = null;
      }
      return;
    }

    // เควสต์แบบคุย NPC
    if (q.objective.type === 'talk') {
      this.st = 'talk';
      const giver = this.giverOf(q) || q.objective.npc;
      if (this.goToNpc(state, giver, dt, 56)) {
        state.player.talks[q.objective.npc] = (state.player.talks[q.objective.npc] || 0) + 1;
        state.onAutoTalk?.(q.objective.npc, q);
        this.questId = null;
      }
      return;
    }

    // เควสต์แบบฆ่ามอน
    if (q.objective.type === 'kill') {
      this.st = 'farm';
      const m = this.nearestOf(state, q.objective.monster);
      if (!m) { this.wanderOrIdle(state, dt); return; }
      this.engage(state, m);
      return;
    }

    // เควสต์แบบเก็บไอเทม
    if (q.objective.type === 'item') {
      this.st = 'collect';
      const have = countItem(state.player, q.objective.item);
      if (have >= q.objective.need) return;      // ของครบ — รอบหน้าจะไปส่งเอง
      const ids = monstersDropping(q.objective.item);
      let m = null;
      for (const id of ids) { m = this.nearestOf(state, id); if (m) break; }
      if (!m) { this.wanderOrIdle(state, dt); return; }
      this.engage(state, m);
    }
  },

  /** เดินเข้าไปตีเป้า (ใช้ระบบเดียวกันกับคลิกเลือกมอน) */
  engage(state, m) {
    const p = state.player;
    state.targetMonster = m;
    const d = Math.hypot(m.x - p.x, m.y - p.y);
    if (d <= ATTACK_RANGE + 6) {
      p.path = null; p.pathIdx = 0;
      p.dir = Math.sign(m.x - p.x) || p.dir;
      if (p.attackCd <= 0) {
        p.attackCd = 0.42;
        playerAttack(state, 1, '', m);
      }
      return;
    }
    if (!p.path || this.repathT <= 0) {
      this.repathT = 0.6;
      const path = finder && finder.find(p.x, p.y, m.x, m.y);
      if (path) { p.path = path; p.pathIdx = 0; }
    }
  },

  nearestOf(state, monsterId) {
    let best = null, bd = 700 * 700;
    for (const m of state.monsters) {
      if (m.dead || m.id !== monsterId) continue;
      const d = (m.x - state.player.x) ** 2 + (m.y - state.player.y) ** 2;
      if (d < bd) { bd = d; best = m; }
    }
    return best;
  },

  /** ไม่เจอเป้าในระยะ — เดินวนหา (會 EXPLORE) */
  wanderOrIdle(state) {
    const p = state.player;
    if (p.path && p.path.length) return;
    if (this.stT > 0) return;
    this.stT = 1.2;
    const w = state.world;
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * Math.PI * 2, r = 60 + Math.random() * 140;
      const x = p.x + Math.cos(a) * r, y = p.y + Math.sin(a) * r;
      if (x < 32 || y < 32 || x > (w.w - 3) * 16 || y > (w.h - 3) * 16) continue;
      if (w.solidAtPx(x, y)) continue;
      const path = finder && finder.find(p.x, p.y, x, y);
      if (path) { p.path = path; p.pathIdx = 0; return; }
    }
  },

  /** ยังไม่มีเควสต์ — ไปหา NPC ที่มีเควสต์ให้แล้วรับ */
  tryAcceptAny(state) {
    this.st = 'accept';
    const p = state.player;
    // NPC ใกล้ ๆ ที่มีเควสต์ยังไม่รับ → รับเลย
    for (const n of state.npcs) {
      if (Math.hypot(n.x - p.x, n.y - p.y) > 56) continue;
      const def = NPCS[n.id];
      if (!def) continue;
      for (const qid of (def.quests || [])) {
        if (p.quests[qid]) continue;
        acceptQuest(state, qid);
        state.onAutoAccept?.(qid);
        return;
      }
    }
    // มิฉะนั้น เดินไปหา NPC ที่มีเควสต์ให้ (ใกล้สุด)
    let target = null, bd = Infinity;
    for (const n of state.npcs) {
      const def = NPCS[n.id];
      if (!def) continue;
      if (!(def.quests || []).some((qid) => !p.quests[qid])) continue;
      const d = Math.hypot(n.x - p.x, n.y - p.y);
      if (d < bd) { bd = d; target = n; }
    }
    if (!target) { this.st = 'idle'; state.targetMonster = null; return; }
    this.goToNpc(state, target.id, 0, 56);
  },

  reset(state) {
    this.on = false;
    this.st = 'off';
    this.questId = null;
    if (state?.player) { state.player.path = null; state.player.pathIdx = 0; }
  },
};

function questById(id) { return QUESTS.find((q) => q.id === id) || null; }
