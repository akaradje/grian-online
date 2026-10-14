/* ═══════════════════════════════════════════════════════════
   pets.js — ระบบสัตว์เลี้ยง
   ไม่ได้มาจากกาชา ต้อง "จับ" จากมอนที่ตีจนเลือดน้อย
   สัตว์เลี้ยงเดินตาม ช่วยตี ได้เลเวล และหมดสติได้
   ═══════════════════════════════════════════════════════════ */

import {
  PET_SPECIES, PET_RARITY, PET_NAMES, PET_IDLE_LINES, PET_KO_LINES, CAPTURE, MONSTERS,
} from './data.js';
import { addItem, removeItem, countItem } from './inventory.js';
import { Audio } from './audio.js';
import { Particles } from './fx.js';

export const PET_MAX = 6;
const FOLLOW_DIST = 34;
const LEASH_DIST = 260;      // ไกลกว่านี้ = วาปมาหาเจ้าของ (พฤติกรรมคลาสสิกของเกม MMO)
const COMBAT_LEASH = 72;     // ไกลกว่านี้ = เลิกไล่ตี แล้วกลับมาหาเจ้าของก่อน
const FIGHT_RANGE = 110;
const PET_MELEE = 24;
const REVIVE_TIME = 30;

let petSeq = 0;

/* ── ตัวเลขพื้นฐาน ── */
export function rarityById(id) { return PET_RARITY.find((r) => r.id === id) || PET_RARITY[0]; }

export function rarityForMonster(monster) {
  let base = 0;
  if (monster.elite) base += 2;
  if (monster.lvl >= 18) base += 3;
  else if (monster.lvl >= 12) base += 2;
  else if (monster.lvl >= 6) base += 1;
  if (monster.def.ai === 'blink') base += 1;     // มอนหายาก = สัตว์เลี้ยงหายาก
  const i = Math.max(0, Math.min(PET_RARITY.length - 1, base - 1));
  return PET_RARITY[i].id;
}

export function petStats(speciesId, lvl, rarityId) {
  const sp = PET_SPECIES[speciesId] || PET_SPECIES.rat;
  const rar = rarityById(rarityId);
  return {
    maxHp: Math.round((40 + lvl * 9) * sp.hpMul * rar.mul),
    atk: Math.round((4 + lvl * 1.9) * sp.atkMul * rar.mul),
    spd: 48 * sp.spdMul,
  };
}

export function petXpFor(lvl) { return Math.floor(45 * Math.pow(lvl, 1.4)) + 25; }

/* ── สร้างสัตว์เลี้ยง ── */
export function createPet(speciesId, lvl, rarityId, opts = {}) {
  const sp = PET_SPECIES[speciesId] || PET_SPECIES.rat;
  const rar = rarityById(rarityId);
  const st = petStats(speciesId, lvl, rarityId);
  return {
    kind: 'pet', uid: ++petSeq,
    speciesId, species: sp, rarityId, rarity: rar,
    nickname: opts.nickname || PET_NAMES[Math.floor(Math.random() * PET_NAMES.length)],
    lvl, exp: 0, maxHp: st.maxHp, hp: st.maxHp, atk: st.atk, spd: st.spd,
    x: opts.x || 0, y: opts.y || 0, prevX: opts.x || 0, prevY: opts.y || 0,
    dir: 1, frame: 0, animT: 0, atkCd: 0, idleT: 8 + Math.random() * 14,
    ko: false, koT: 0, kills: 0, caughtFrom: opts.caughtFrom || null,
  };
}

/* ── จับสัตว์เลี้ยง ── */
export function captureChance(monster) {
  if (!monster || monster.dead) return 0;
  const hpRatio = Math.max(0, monster.hp / monster.maxHp);
  let c = CAPTURE.base + CAPTURE.hpBonus * (1 - hpRatio);
  if (monster.elite) c *= CAPTURE.eliteBonus;
  c *= Math.max(0.35, 1 - monster.lvl * CAPTURE.lvlPenalty);
  return Math.max(CAPTURE.minChance, Math.min(CAPTURE.maxChance, c));
}

/**
 * พยายามจับ — คืนผลลัพธ์ให้ UI เล่นอนิเมชันต่อ
 * ไม่ได้ลบมอนออกทันที เพื่อให้ UI แสดงการดิ้นได้ครบ
 */
export function attemptCapture(state, monster) {
  const p = state.player;
  if (!monster || monster.dead) return { ok: false, msg: 'ไม่มีเป้าหมายให้จับ' };
  if (monster.boss) return { ok: false, msg: 'บอสโลกจับไม่ได้ (ลองคิดดูดี ๆ)' };
  if (!PET_SPECIES[monster.id]) return { ok: false, msg: 'มอนชนิดนี้จับไม่ได้' };
  if (state.pets.length >= PET_MAX) return { ok: false, msg: `เก็บสัตว์เลี้ยงได้สูงสุด ${PET_MAX} ตัว` };
  if (countItem(p, 'capture_ball') <= 0) return { ok: false, msg: 'ไม่มีลูกแก้วจับมอน' };

  removeItem(p, 'capture_ball', 1);
  const chance = captureChance(monster);
  const success = Math.random() < chance;
  Audio.play('skill');
  Particles.spawn('burst', monster.x, monster.y - 10, { count: 10, c: '#b98bff' });

  return {
    ok: true,
    success,
    chance,
    monster,
    shakes: CAPTURE.shakes,
    speciesId: monster.id,
    lvl: Math.max(1, monster.lvl - 1),
    rarityId: rarityForMonster(monster),
    line: success ? pick(CAPTURE.successLines) : pick(CAPTURE.failLines),
  };
}

/** เรียกหลังอนิเมชันดิ้นจบ — สร้างสัตว์เลี้ยงจริงและลบมอน */
export function finishCapture(state, result) {
  const m = result.monster;
  if (!result.success) return null;
  const pet = createPet(result.speciesId, result.lvl, result.rarityId, {
    x: state.player.x + 18, y: state.player.y,
    caughtFrom: m.name,
  });
  state.pets.push(pet);
  if (!state.player.activePet) state.player.activePet = pet.uid;
  m.dead = true;
  Particles.spawn('burst', m.x, m.y - 10, { count: 16, c: pet.rarity.color });
  Audio.play('rare');
  return pet;
}

/**
 * กู้คืนสัตว์เลี้ยงจากเซฟ
 * species/rarity เป็นอ้างอิงไปที่ data.js จึงต้องผูกใหม่ตอนโหลด
 * (เดิมสัตว์เลี้ยงหายหมดหลังเล่นต่อ — ของที่使用者ลงเวลาไปหมดทั้งหมด)
 */
export function hydratePets(state, list) {
  const out = [];
  for (const s of (list || [])) {
    if (!s || !PET_SPECIES[s.speciesId]) continue;
    const pet = createPet(s.speciesId, Math.max(1, s.lvl || 1), s.rarityId || 'common', {
      x: state.player.x + 14, y: state.player.y,
      caughtFrom: s.caughtFrom || null,
    });
    if (s.uid) pet.uid = s.uid;
    if (s.uid >= petSeq) petSeq = s.uid;       // กัน uid ซ้ำกับตัวที่จับใหม่
    if (s.nickname) pet.nickname = s.nickname;
    pet.exp = s.exp || 0;
    if (s.maxHp) pet.maxHp = s.maxHp;
    pet.hp = Math.min(pet.maxHp, s.hp ?? pet.maxHp);
    if (s.atk) pet.atk = s.atk;
    if (s.spd) pet.spd = s.spd;
    pet.kills = s.kills || 0;
    pet.ko = !!s.ko;
    out.push(pet);
  }
  state.pets = out;
  if (!out.some((x) => x.uid === state.player.activePet)) {
    state.player.activePet = out.length ? out[0].uid : null;
  }
  return out;
}

/* ── จัดการสัตว์เลี้ยง ── */
export function activePet(state) {
  const p = state.player;
  if (!p.activePet) return null;
  return state.pets.find((x) => x.uid === p.activePet) || null;
}

export function setActivePet(state, uid) {
  const pet = state.pets.find((x) => x.uid === uid);
  if (!pet) return false;
  state.player.activePet = uid;
  return true;
}

export function releasePet(state, uid) {
  const i = state.pets.findIndex((x) => x.uid === uid);
  if (i < 0) return null;
  const pet = state.pets[i];
  state.pets.splice(i, 1);
  if (state.player.activePet === uid) {
    state.player.activePet = state.pets.length ? state.pets[0].uid : null;
  }
  return pet;
}

export function renamePet(state, uid, name) {
  const pet = state.pets.find((x) => x.uid === uid);
  if (!pet) return false;
  const n = String(name || '').trim().slice(0, 14);
  if (n.length < 1) return false;
  pet.nickname = n;
  return true;
}

export function revivePet(state, uid, ratio = 1) {
  const pet = state.pets.find((x) => x.uid === uid);
  if (!pet) return false;
  pet.ko = false; pet.koT = 0;
  pet.hp = Math.max(1, Math.round(pet.maxHp * ratio));
  return true;
}

/** ใช้ยาฟื้นสัตว์เลี้ยง — ฟื้นตัวที่หมดสติ (หรือเลือดน้อยสุด) */
export function usePetPotion(state) {
  const p = state.player;
  if (countItem(p, 'pet_potion') <= 0) return { ok: false, msg: 'ไม่มี ยาฟื้นสัตว์เลี้ยง' };
  const target = state.pets.find((x) => x.ko)
    || state.pets.slice().sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
  if (!target) return { ok: false, msg: 'ยังไม่มีสัตว์เลี้ยง' };
  removeItem(p, 'pet_potion', 1);
  const wasKo = target.ko;
  target.ko = false; target.koT = 0;
  target.hp = Math.min(target.maxHp, target.hp + Math.round(target.maxHp * 0.5));
  if (target.hp <= 0) target.hp = Math.round(target.maxHp * 0.5);
  Audio.play('heal');
  Particles.spawn('heal', target.x, target.y - 8, { count: 8 });
  return { ok: true, pet: target, wasKo };
}

/* ── เลเวลอัพ ── */
function gainXp(state, pet, amount) {
  pet.exp += amount;
  let leveled = 0;
  while (pet.exp >= petXpFor(pet.lvl) && pet.lvl < 60) {
    pet.exp -= petXpFor(pet.lvl);
    pet.lvl++;
    leveled++;
  }
  if (leveled) {
    const st = petStats(pet.speciesId, pet.lvl, pet.rarityId);
    const hpRatio = pet.maxHp ? pet.hp / pet.maxHp : 1;
    pet.maxHp = st.maxHp; pet.atk = st.atk; pet.spd = st.spd;
    pet.hp = Math.max(1, Math.round(pet.maxHp * hpRatio));
    Audio.play('levelup');
    Particles.spawn('burst', pet.x, pet.y - 10, { count: 12, c: pet.rarity.color });
    state.onPetLevelUp?.(pet, leveled);
  }
}

/** เรียกจาก killMonster — สัตว์เลี้ยงได้ EXP ครึ่งหนึ่ง */
export function onMonsterKilled(state, monster) {
  const pet = activePet(state);
  if (!pet || pet.ko) return;
  pet.kills++;
  gainXp(state, pet, Math.max(1, Math.round(monster.exp * 0.5)));
}

/* ── ต่อสู้ ── */
function damageMonster(state, pet, m) {
  const crit = Math.random() < 0.08;
  let dmg = Math.max(1, Math.round(pet.atk * (0.9 + Math.random() * 0.2) - m.defv * 0.4));
  if (crit) dmg = Math.round(dmg * 1.7);
  m.hp -= dmg;
  m.hitFlash = 0.1;
  m.engaged = true;
  state.floaters.push({
    uid: 'p' + (++petSeq), x: m.x + (Math.random() * 8 - 4), y: m.y - 12,
    text: (crit ? '★' : '') + dmg, color: pet.rarity.color, size: crit ? 1.15 : 0.85,
    t: 0, dur: 0.8, vy: -24,
  });
  Particles.spawn('spark', m.x, m.y - 9, { count: crit ? 6 : 3, c: pet.rarity.color });
  Audio.play('hit');
  if (m.hp <= 0) {
    // ให้ entities.js เป็นคนจัดการตอนมอนตาย (EXP/ของ) ผ่าน callback
    state.onPetKill?.(m);
  }
}

function petTakeDamage(state, pet, m) {
  const dmg = Math.max(1, Math.round(m.atk * 0.5 * (0.9 + Math.random() * 0.2)));
  pet.hp -= dmg;
  pet.hitFlash = 0.12;
  state.floaters.push({
    uid: 'p' + (++petSeq), x: pet.x, y: pet.y - 20, text: String(dmg),
    color: '#ff8f8f', size: 0.85, t: 0, dur: 0.8, vy: -24,
  });
  if (pet.hp <= 0) {
    pet.hp = 0; pet.ko = true; pet.koT = REVIVE_TIME;
    Audio.play('die');
    Particles.spawn('smoke', pet.x, pet.y - 6, { count: 8 });
    state.onPetKO?.(pet, pick(PET_KO_LINES));
  }
}

/* ── อัปเดตสัตว์เลี้ยง ── */
export function updatePets(state, dt) {
  const p = state.player;
  const pets = state.pets;
  if (!pets.length) return;

  for (const pet of pets) {
    pet.prevX = pet.x; pet.prevY = pet.y;
    pet.animT += dt;
    if (pet.animT > 0.24) { pet.animT = 0; pet.frame ^= 1; }
    if (pet.hitFlash > 0) pet.hitFlash = Math.max(0, pet.hitFlash - dt);

    if (pet.ko) {
      pet.koT -= dt;
      if (pet.koT <= 0) revivePet(state, pet.uid, 0.3);
      continue;
    }

    const isActive = pet.uid === p.activePet;
    if (!isActive) {
      // ตัวที่ไม่ aktif จะยืนรออยู่ข้างเจ้าของแบบเงียบ ๆ
      followOwner(state, pet, dt, 0.55);
      continue;
    }

    // ── ตัวที่ aktif: หาเป้าแล้วเข้าตี ──
    if (pet.atkCd > 0) pet.atkCd -= dt;

    // สัตว์เลี้ยงต้องไม่วิ่งหนีห่างเจ้าของเกินไป — ถ้าไกลเกินให้กลับก่อนเสมอ
    const distOwner = Math.hypot(pet.x - p.x, pet.y - p.y);
    const target = distOwner > COMBAT_LEASH ? null : pickPetTarget(state, pet);
    if (target) {
      const d = Math.hypot(target.x - pet.x, target.y - pet.y);
      if (d > PET_MELEE) {
        const sp = pet.spd * dt;
        const dx = (target.x - pet.x) / d, dy = (target.y - pet.y) / d;
        const nx = pet.x + dx * sp, ny = pet.y + dy * sp;
        if (!state.world.solidAtPx(nx, pet.y)) pet.x = nx;
        if (!state.world.solidAtPx(pet.x, ny)) pet.y = ny;
        if (dx) pet.dir = Math.sign(dx);
      } else if (pet.atkCd <= 0) {
        pet.atkCd = 1.05;
        damageMonster(state, pet, target);
      }
      // ถ้าอยู่ไกลเจ้าของเกินไป ให้กลับมาหาเจ้าของก่อน
      if (Math.hypot(pet.x - p.x, pet.y - p.y) > LEASH_DIST) {
        followOwner(state, pet, dt, 1.6);
      }
    } else {
      followOwner(state, pet, dt, 1);
      pet.idleT -= dt;
      if (pet.idleT <= 0) {
        pet.idleT = 14 + Math.random() * 22;
        state.floaters.push({
          uid: 'p' + (++petSeq), x: pet.x, y: pet.y - 22, text: pick(PET_IDLE_LINES),
          color: '#c9d2ee', size: 0.72, t: 0, dur: 1.6, vy: -12,
        });
      }
    }
  }

  // สัตว์เลี้ยงชนกันเองไม่ให้ทับ
  for (let i = 0; i < pets.length; i++) {
    for (let j = i + 1; j < pets.length; j++) {
      const a = pets[i], b = pets[j];
      if (a.ko || b.ko) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      const dd = Math.hypot(dx, dy);
      if (dd < 10 && dd > 0.01) {
        const push = (10 - dd) / 2;
        a.x -= (dx / dd) * push; a.y -= (dy / dd) * push;
        b.x += (dx / dd) * push; b.y += (dy / dd) * push;
      }
    }
  }
}

function followOwner(state, pet, dt, mul) {
  const p = state.player;
  const d = Math.hypot(p.x - pet.x, p.y - pet.y);

  if (d <= FOLLOW_DIST) { pet.stuckT = 0; return; }

  // ไกลเกินไป หรือติดนานเกินไป → วาปมาหาเจ้าของ (พฤติกรรมคลาสสิกของสัตว์เลี้ยง MMO)
  if (d > LEASH_DIST || (pet.stuckT || 0) > 2.0) {
    Particles.spawn('smoke', pet.x, pet.y - 6, { count: 5 });
    pet.x = p.x - p.dir * 16 + (Math.random() * 10 - 5);
    pet.y = p.y + 12;
    pet.prevX = pet.x; pet.prevY = pet.y;
    pet.stuckT = 0;
    Particles.spawn('smoke', pet.x, pet.y - 6, { count: 5 });
    return;
  }

  const sp = pet.spd * mul * dt;
  const dx = (p.x - pet.x) / d, dy = (p.y - pet.y) / d;
  const nx = pet.x + dx * sp, ny = pet.y + dy * sp;
  let moved = false;
  if (!state.world.solidAtPx(nx, pet.y)) { pet.x = nx; moved = true; }
  if (!state.world.solidAtPx(pet.x, ny)) { pet.y = ny; moved = true; }

  if (!moved) {
    // ติดของ — ลองเลื่อนตั้งฉากกับทิศทางเพื่ออ้อมไปข้าง ๆ
    const side = pet._side || 1;
    const ox = -dy * sp * side, oy = dx * sp * side;
    if (!state.world.solidAtPx(pet.x + ox, pet.y + oy)) {
      pet.x += ox; pet.y += oy; moved = true;
    } else {
      pet._side = -side;                 // เปลี่ยนข้างที่ลองอ้อม
    }
  }

  if (moved) pet.stuckT = Math.max(0, (pet.stuckT || 0) - dt * 0.5);
  else pet.stuckT = (pet.stuckT || 0) + dt;

  if (Math.abs(dx) > 0.05) pet.dir = Math.sign(dx);
}

function pickPetTarget(state, pet) {
  const p = state.player;
  // ให้ความสำคัญกับเป้าที่ผู้เล่นเลือกไว้ก่อน
  if (state.targetMonster && !state.targetMonster.dead) {
    const t = state.targetMonster;
    if (Math.hypot(t.x - pet.x, t.y - pet.y) < FIGHT_RANGE * 1.6) return t;
  }
  let best = null, bd = FIGHT_RANGE * FIGHT_RANGE;
  for (const m of state.monsters) {
    if (m.dead) continue;
    const d = (m.x - pet.x) ** 2 + (m.y - pet.y) ** 2;
    if (d < bd) { bd = d; best = m; }
  }
  return best;
}

/* ── สรุปสำหรับแสดงผล ── */
export function petSummary(state) {
  const pets = state.pets;
  return {
    count: pets.length,
    max: PET_MAX,
    ko: pets.filter((x) => x.ko).length,
    best: pets.slice().sort((a, b) => b.lvl - a.lvl)[0] || null,
  };
}

function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
