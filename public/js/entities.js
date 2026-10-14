/* ═══════════════════════════════════════════════════════════
   entities.js — ผู้เล่น · มอน · NPC · ผู้เล่นบอท · การต่อสู้
   ═══════════════════════════════════════════════════════════ */

import { CONFIG, CLASSES, SKILLS, MONSTERS, ITEMS, NPCS, BOT_NAMES, AFK_NAMES, ELITE, ELITE_CHANCE, BOSS_ABILITIES, BOSS_ABILITIES_P2, UPGRADE, ADVANCED } from './data.js';
import { Audio } from './audio.js';
import { Particles, Camera, HitStop, compact } from './fx.js';
import { VFX, spawnSkillFx } from './vfx.js';

export const ATTACK_RANGE = 30;
export const BOT_ATTACK_RANGE = 28;

/* ── สูตรเลเวล ── */
export function xpFor(lvl) { return Math.floor(70 * Math.pow(lvl, 1.5)) + 30; }

/* ── สร้างผู้เล่น ── */
export function createPlayer(name, clsId) {
  const cls = CLASSES.find((c) => c.id === clsId) || CLASSES[0];
  const p = {
    kind: 'player', name, clsId: cls.id, cls,
    advId: null, adv: null,               // อาชีพขั้นสูง (เลเวล 10)
    lvl: 1, exp: 0,
    base: { ...cls.base },
    gold: 60, gems: 160, tickets: 1,
    inv: [], equip: { weapon: null, acc: null },
    x: 0, y: 0, prevX: 0, prevY: 0, dir: 1, frame: 0, animT: 0,
    path: null, pathIdx: 0,              // เส้นทางจากการคลิกเดิน
    attackCd: 0, cooldowns: {}, buffs: [], weak: 0, poison: 0,
    quests: {}, kills: {}, talks: {},
    pity: 0, totalPulls: 0, companions: [],
    dead: false, hitFlash: 0, kills_total: 0, deaths: 0, dropsTotal: 0,
    // สถิติสำหรับความสำเร็จ
    maxGold: 60, unlocked: {},
    ctr: {
      ratTail: 0, ratTailTotal: 0, brokeSkill: 0, stolenKills: 0, feeds: 0,
      banished: 0, gacha5: 0, gacha1: 0, bossKills: 0, distance: 0,
      idle: 0, idleBest: 0, playtime: 0, upgradeOk: 0, upgradeFail: 0,
      autoTime: 0, manualTime: 0, autoKills: 0,
    },
  };
  recalcPlayer(p);
  p.hp = p.maxHp; p.mp = p.maxMp;
  p.prevX = p.x; p.prevY = p.y;
  addItem(p, 'hp_potion', 3);
  addItem(p, 'hp_potion_fake', 2);
  addItem(p, 'upgrade_stone', 3);
  return p;
}

/** สกิลที่ผู้เล่นมี — รวมสกิลของอาชีพขั้นสูง (เดิมใช้ cls.skills ตรง ๆ) */
export function playerSkills(p) {
  if (p.advId && ADVANCED[p.advId]) return [...p.cls.skills, ADVANCED[p.advId].skill];
  return p.cls.skills;
}

export function advanceClass(state, advId) {
  const p = state.player;
  const adv = ADVANCED[advId];
  if (!adv) return { ok: false, msg: 'ไม่มีสาขานี้' };
  if (p.advId) return { ok: false, msg: 'เลือกสาขาไปแล้ว (เลือกซ้ำไม่ได้)' };
  if (p.lvl < 10) return { ok: false, msg: 'ต้องถึงเลเวล 10 ก่อน' };
  if (adv.from !== p.clsId) return { ok: false, msg: 'สาขานี้ไม่ใช่งานของคุณ' };
  p.advId = advId;
  p.adv = adv;
  recalcPlayer(p);
  p.hp = p.maxHp; p.mp = p.maxMp;
  const pet = state.pets?.find((x) => x.uid === p.activePet);
  state.onAdvance?.(adv, pet);
  return { ok: true, adv };
}

export function recalcPlayer(p) {
  const g = (k) => Math.floor((p.lvl - 1) * k);
  let maxHp = p.base.hp + g(16);
  let maxMp = p.base.mp + g(7);
  let atk = p.base.atk + g(2.2);
  let def = p.base.def + g(1.1);
  let luck = p.base.luck + g(0.4);
  const spd = p.base.spd + g(0.8);

  // บอนัสจากอาชีพขั้นสูง (สาขาย่อย)
  if (p.advId && ADVANCED[p.advId]) {
    for (const [k, v] of Object.entries(ADVANCED[p.advId].bonus || {})) {
      if (k === 'hp') maxHp += v;
      else if (k === 'mp') maxMp += v;
      else if (k === 'atk') atk += v;
      else if (k === 'def') def += v;
      else if (k === 'luck') luck += v;
      else if (k === 'spd') spd += v;
    }
  }

  for (const slot of ['weapon', 'acc']) {
    const it = p.equip[slot];
    if (!it) continue;
    const d = ITEMS[it.id]; if (!d) continue;
    atk += d.atk || 0; def += d.def || 0; luck += d.luck || 0;
  }
  // พาสซีฟอาชีพ
  if (p.clsId === 'debt' && p.gold <= 0) atk *= 1.2;
  if (p.clsId === 'cafe') { /* spd คิดตอนคำนวณการเคลื่อนที่ */ }

  p.maxHp = Math.round(maxHp); p.maxMp = Math.round(maxMp);
  p.atk = Math.round(atk); p.def = Math.round(def); p.luck = Math.round(luck); p.spd = spd;
  p.hp = Math.min(p.hp ?? p.maxHp, p.maxHp);
  p.mp = Math.min(p.mp ?? p.maxMp, p.maxMp);
}

export function effAtk(p) {
  let a = p.atk;
  for (const b of p.buffs) if (b.stat === 'atk') a *= b.mul;
  if (p.weak > 0) a *= 0.5;
  if (p.clsId === 'fivestar' && p.inCombatT > 30) a *= 0.7; // ดีบัฟซ่อนเร้น
  return a;
}
export function effSpd(p) {
  let s = p.spd;
  for (const b of p.buffs) if (b.stat === 'spd') s *= b.mul;
  if (p.clsId === 'cafe') s *= 1.15;
  if (p.poison > 0) s *= 0.75;
  return s;
}
export function dropBonus(p) {
  let m = 1;
  if (p.clsId === 'loot') m += 0.8;
  for (const b of p.buffs) if (b.stat === 'drop') m += b.mul;
  return m;
}

/* ── กระเป๋า (ย้ายไป inventory.js เพื่อให้ pets.js ใช้ร่วมได้โดยไม่มี cycle) ── */
export { addItem, removeItem, countItem } from './inventory.js';
import { addItem, removeItem, countItem } from './inventory.js';

/* ── มอนสเตอร์ ── */
let entSeq = 0;
export function createMonster(id, x, y, elite) {
  const d = MONSTERS[id];
  const e = elite || null;
  const m = {
    kind: 'monster', _uid: ++entSeq, def: d, id, name: d.name, lvl: d.lvl,
    hp: d.hp, maxHp: d.hp, atk: d.atk, defv: d.def, spd: d.spd,
    exp: d.exp, gold: d.gold, boss: !!d.boss, elite: e,
    x, y, prevX: x, prevY: y, dir: 1, frame: 0, animT: 0,
    st: 'idle', stun: 0, atkCd: 0, wanderT: 0, wanderDir: { x: 0, y: 0 },
    home: { x, y }, dead: false, hitFlash: 0, blinkT: 2, tauntT: 0, engaged: false,
    abil: null, abilCd: 3.5,
  };
  if (e) {
    m.name = `${d.name} (${e.prefix})`;
    m.lvl = d.lvl + 3;
    m.maxHp = Math.round(d.hp * e.mul.hp);
    m.hp = m.maxHp;
    m.atk = Math.round(d.atk * e.mul.atk);
    m.exp = Math.round(d.exp * e.mul.exp);
    m.gold = Math.round(d.gold * e.mul.gold);
    m.aura = e.aura;
    m.dropMul = e.dropMul;
  }
  return m;
}

export function spawnMonster(state, id, spot, forceElite) {
  const s = spot || state.world.randomSpot(Math.random, {
    awayFrom: state.player, minDist: 90, outsideVillage: true,
  });
  const elite = (forceElite || (!MONSTERS[id].boss && Math.random() < ELITE_CHANCE))
    ? ELITE[Math.floor(Math.random() * ELITE.length)] : null;
  const m = createMonster(id, s.x, s.y, elite);
  state.monsters.push(m);
  if (elite) {
    state.onEliteSpawn?.(m);
    Particles.spawn('burst', m.x, m.y - 8, { count: 6, c: elite.aura });
  }
  return m;
}

/* ── NPC ── */
export function createNpc(id, x, y) {
  const d = NPCS[id];
  return {
    kind: 'npc', def: d, id, name: d.name, x, y, dir: -1,
    frame: 0, animT: 0, sprite: d.sprite,
  };
}

/* ── ผู้เล่นบอท (ทำให้โลกดูมีคน) ── */
export function createBot(name, x, y, afk = false) {
  return {
    kind: 'bot', name, lvl: 1 + Math.floor(Math.random() * 60),
    x, y, dir: 1, frame: 0, animT: 0, afk,
    st: 'wander', wanderT: Math.random() * 3, target: null,
    wanderDir: { x: 0, y: 0 },
    atkCd: 0, chatT: 6 + Math.random() * 26, hp: 100, maxHp: 100,
  };
}

export function makeBots(world) {
  const bots = [];
  const names = BOT_NAMES.slice().sort(() => Math.random() - 0.5);
  for (let i = 0; i < CONFIG.BOT_COUNT; i++) {
    const s = world.randomSpot(Math.random, {});
    bots.push(createBot(names[i % names.length], s.x, s.y, false));
  }
  AFK_NAMES.forEach((n) => {
    const s = world.randomSpot(Math.random, {});
    bots.push(createBot(n, s.x, s.y, true));
  });
  return bots;
}

/* ── เอฟเฟกต์ & ตัวเลขลอย ── */
let floatSeq = 0;
export function addFloater(state, x, y, text, color = '#fff', size = 1) {
  state.floaters.push({ uid: ++floatSeq, x, y, text, color, size, t: 0, dur: 0.9, vy: -26 });
}
export function addEffect(state, type, x, y, dur = 0.22, extra = {}) {
  state.effects.push({ type, x, y, t: 0, dur, ...extra });
}

/* ── คำนวณดาเมจ ── */
function rollDamage(atk, def, luck = 0, power = 1) {
  const base = atk * power * (0.9 + Math.random() * 0.2);
  const crit = Math.random() < Math.min(0.45, 0.05 + luck * 0.006);
  let dmg = Math.max(1, Math.round(base - def * 0.5));
  if (crit) dmg = Math.round(dmg * 1.8);
  return { dmg, crit };
}

/* ── โจมตีมอน ── */
export function hitMonster(state, m, atk, luck, power, tag = '') {
  if (m.dead) return 0;
  const { dmg, crit } = rollDamage(atk, m.defv, luck, power);
  m.hp -= dmg;
  m.hitFlash = 0.12;
  m.engaged = true;
  addFloater(state, m.x + (Math.random() * 10 - 5), m.y - 12, (crit ? '★' : '') + dmg,
    crit ? '#ffc94d' : '#ffffff', crit ? 1.35 : 1);
  if (tag) addFloater(state, m.x, m.y - 22, tag, '#b98bff', 0.9);
  addEffect(state, 'hit', m.x, m.y - 8, 0.18);

  // เอฟเฟกต์ตามน้ำหนักของการตี
  Particles.spawn(crit ? 'burst' : 'spark', m.x, m.y - 9, {
    count: crit ? 9 : 4, c: crit ? '#ffc94d' : '#ffe9a8',
  });
  Particles.spawn('blood', m.x, m.y - 8, { count: crit ? 5 : 2, c: m.boss ? '#8a3f8a' : '#c94f4f' });
  Audio.play(crit ? 'crit' : 'hit');
  if (crit) {
    HitStop.trigger(0.055);
    Camera.kick(4.5, 0.16);
  } else {
    Camera.kick(1.6, 0.09);
  }

  if (m.hp <= 0) killMonster(state, m);
  return dmg;
}

/* ── มอนตาย ── */
export function killMonster(state, m) {
  if (m.dead) return;
  m.dead = true;
  const p = state.player;
  p.kills_total++;
  p.kills[m.id] = (p.kills[m.id] || 0) + 1;
  if (state.autoOn) p.ctr.autoKills = (p.ctr.autoKills || 0) + 1;

  const gainExp = Math.round(m.exp);
  const gainGold = Math.round(m.gold * (p.clsId === 'troll' ? 1.25 : 1));
  p.exp += gainExp;
  p.gold += gainGold;
  addFloater(state, m.x, m.y - 20, `+${gainExp} EXP`, '#ffd23f', 0.85);

  // ดรอปของ
  const bonus = dropBonus(p) * (m.dropMul || 1);
  for (const [item, rate] of (m.def.drops || [])) {
    const rr = Math.min(0.98, rate * bonus);
    if (Math.random() < rr) {
      state.drops.push({
        x: m.x + (Math.random() * 18 - 9), y: m.y + (Math.random() * 12 - 6),
        id: item, qty: 1, t: 0, bob: Math.random() * 6,
      });
    }
  }

  addEffect(state, 'death', m.x, m.y, 0.5);
  Particles.spawn('burst', m.x, m.y - 10, { count: m.boss ? 40 : (m.elite ? 18 : 10), c: m.elite?.aura || '#ffffff' });
  Particles.spawn('smoke', m.x, m.y - 6, { count: 6 });
  Audio.play(m.boss ? 'rare' : (m.elite ? 'rare' : 'hit'));

  if (m.boss) {
    state.boss.active = false;
    state.boss.nextAt = state.time + CONFIG.BOSS_EVERY;
    p.ctr.bossKills = (p.ctr.bossKills || 0) + 1;
    Camera.kick(16, 0.7);
    HitStop.trigger(0.14);
    state.onBossKilled?.(m);
  } else if (m.elite) {
    Camera.kick(5, 0.2);
    state.onEliteKilled?.(m);
  }

  state.onPetExp?.(m);          // ให้สัตว์เลี้ยงได้ EXP จากการสังหารนี้
  checkLevelUp(state);
  return true;
}

export function checkLevelUp(state) {
  const p = state.player;
  let leveled = 0;
  while (p.exp >= xpFor(p.lvl)) {
    p.exp -= xpFor(p.lvl);
    p.lvl++;
    leveled++;
    if (p.lvl > 200) break;
  }
  if (leveled) {
    recalcPlayer(p);
    p.hp = p.maxHp; p.mp = p.maxMp;
    Audio.play('levelup');
    Particles.spawn('burst', p.x, p.y - 12, { count: 22, c: '#ffc94d' });
    Particles.spawn('heal', p.x, p.y - 6, { count: 8 });
    Camera.kick(6, 0.35);
    state.onLevelUp?.(p.lvl, leveled);
  }
}

/* ── ผู้เล่นโจมตีปกติ ── */
export function playerAttack(state, power = 1, tag = '', forcedTarget = null) {
  const p = state.player;
  const m = (forcedTarget && !forcedTarget.dead)
    ? forcedTarget
    : nearestMonster(state, p.x, p.y, ATTACK_RANGE + 8);
  p.dir = m ? Math.sign(m.x - p.x) || p.dir : p.dir;
  VFX.spawn('arc', { x: p.x + p.dir * 14, y: p.y - 8, color: '#ffffff', size: 17, dur: 0.22 });
  Audio.play('swing');
  if (!m) return null;
  const dmg = hitMonster(state, m, effAtk(p), p.luck, power, tag);
  // ดาบหัก
  const w = p.equip.weapon;
  if (w && ITEMS[w.id]?.breakChance && Math.random() < ITEMS[w.id].breakChance) {
    removeItem(p, w.id, 1);
    p.equip.weapon = null;
    recalcPlayer(p);
    Audio.play('upgrade_fail');
    state.onToast?.('ดาบ +9 ของคุณหัก! (ตามเงื่อนไขที่เขียนไว้ตัวเล็ก ๆ)', 'bad');
  }
  return dmg;
}

export function nearestMonster(state, x, y, range) {
  let best = null, bd = range * range;
  for (const m of state.monsters) {
    if (m.dead) continue;
    const d = (m.x - x) ** 2 + (m.y - y) ** 2;
    if (d < bd) { bd = d; best = m; }
  }
  return best;
}

/* ── ใช้สกิล ── */
export function useSkill(state, skillId) {
  const p = state.player;
  const sk = SKILLS[skillId];
  if (!sk) return { ok: false, msg: 'ไม่มีสกิลนี้' };
  if ((p.cooldowns[skillId] || 0) > 0) return { ok: false, msg: 'สกิลยังติดคูลดาวน์' };
  if (p.mp < sk.mp) return { ok: false, msg: 'MP ไม่พอ' };
  if (sk.goldCost && p.gold <= 0 && p.clsId === 'debt') { /* ยอมให้ร่ายได้ */ }

  p.mp -= sk.mp;
  p.cooldowns[skillId] = sk.cd;

  if (sk.goldCost) {
    const cost = Math.max(1, Math.floor(p.gold * sk.goldCost));
    p.gold = Math.max(0, p.gold - cost);
    addFloater(state, p.x, p.y - 26, `-${cost} เงิน`, '#ff8f8f', 0.85);
    if (p.gold <= 0) p.ctr.brokeSkill = (p.ctr.brokeSkill || 0) + 1;
  }

  Audio.play(sk.type === 'banish' ? 'ban' : 'skill');
  // เอฟเฟกต์เฉพาะของท่านี้ (ดูสกิลไหนออกทันทีจากภาพ)
  spawnSkillFx(skillId, {
    caster: p,
    target: nearestMonster(state, p.x, p.y, ATTACK_RANGE + 26),
    skill: sk,
  });
  state.onSkillCast?.(skillId, sk);

  switch (sk.type) {
    case 'dmg': {
      playerAttack(state, sk.power);
      if (sk.selfWeak) {
        p.weak = sk.selfWeak;
        state.onToast?.('ท่าไม้ตายเทพสำเร็จ! หมดสภาพ 12 วินาที (ระบบยังไม่แก้)', 'bad');
      }
      break;
    }
    case 'aoe': {
      addEffect(state, 'aoe', p.x, p.y, 0.4, { radius: sk.radius });
      let hit = 0;
      for (const m of state.monsters) {
        if (m.dead) continue;
        if (Math.hypot(m.x - p.x, m.y - p.y) <= sk.radius) {
          hitMonster(state, m, effAtk(p), p.luck, sk.power);
          hit++;
        }
      }
      if (hit) p.gold += hit * 4;
      break;
    }
    case 'exec': {
      const m = nearestMonster(state, p.x, p.y, ATTACK_RANGE + 10);
      if (m && m.hp / m.maxHp < sk.threshold) {
        addFloater(state, m.x, m.y - 20, 'ขโมยคิล!', '#ffc94d', 1.1);
        Particles.spawn('burst', m.x, m.y - 10, { count: 10, c: '#ffc94d' });
        Audio.play('rare');
        p.ctr.stolenKills = (p.ctr.stolenKills || 0) + 1;
        m.hp = 0; killMonster(state, m);
      } else {
        state.onToast?.('ขโมยคิลไม่สำเร็จ — มอนเลือดยังไม่ต่ำพอ', 'bad');
        Audio.play('error');
        p.cooldowns[skillId] = 1.5;
      }
      break;
    }
    case 'selfdmg': {
      const loss = Math.round(p.maxHp * sk.selfHp);
      p.hp = Math.max(1, p.hp - loss);
      const g = Math.round(20 * sk.gain);
      p.gold += g;
      p.ctr.feeds = (p.ctr.feeds || 0) + 1;
      addFloater(state, p.x, p.y - 24, `-${loss} HP / +${g} เงิน`, '#ff8f8f', 0.9);
      Particles.spawn('blood', p.x, p.y - 10, { count: 5 });
      Audio.play('hurt');
      break;
    }
    case 'stun': {
      const m = nearestMonster(state, p.x, p.y, ATTACK_RANGE + 14);
      if (m) {
        m.stun = sk.dur;
        hitMonster(state, m, effAtk(p), p.luck, sk.power);
        addFloater(state, m.x, m.y - 24, 'สตัน!', '#7fe0ff', 1);
      } else state.onToast?.('ไม่มีเป้าหมายให้ปิดเครื่อง', 'bad');
      break;
    }
    case 'banish': {
      const m = nearestMonster(state, p.x, p.y, ATTACK_RANGE + 20);
      if (m) {
        m.dead = true;
        p.ctr.banished = (p.ctr.banished || 0) + 1;
        addFloater(state, m.x, m.y - 20, 'ถูกเตะออก', '#ff9d5c', 1.05);
        Particles.spawn('smoke', m.x, m.y - 8, { count: 8 });
        state.onToast?.(`เตะ ${m.name} ออกจากเซิร์ฟ (แต่ไม่ได้ของและไม่ได้ EXP)`, 'bad');
      } else { state.onToast?.('ไม่มีใครให้เตะ', 'bad'); Audio.play('error'); }
      break;
    }
    case 'heal': {
      const h = Math.round(p.maxHp * sk.heal);
      p.hp = Math.min(p.maxHp, p.hp + h);
      addFloater(state, p.x, p.y - 26, `+${h} HP`, '#5fe89b', 1.1);
      state.onToast?.('รีสตาร์ทเซิร์ฟเวอร์สำเร็จ — ประกาศปิดปรับปรุง 1 นาที', 'good');
      break;
    }
    case 'buff': {
      const stat = Object.keys(sk.buff)[0];
      p.buffs = p.buffs.filter((b) => b.stat !== stat);
      p.buffs.push({ stat, mul: sk.buff[stat], t: sk.buff.dur, dur: sk.buff.dur });
      addFloater(state, p.x, p.y - 26, sk.name, '#b98bff', 0.95);
      if (skillId === 'turbo' && Math.random() < 0.25) {
        state.onToast?.('ping กระตุก! ตัวละครหยุดชั่วครู่', 'bad');
      }
      break;
    }
  }
  return { ok: true };
}

/* ── มอนโจมตีผู้เล่น ── */
export function monsterHitPlayer(state, m) {
  const p = state.player;
  if (p.dead) return;
  const { dmg, crit } = rollDamage(m.atk, p.def, 0, 1);
  p.hp -= dmg;
  p.hitFlash = 0.14;
  addFloater(state, p.x, p.y - 22, (crit ? '★' : '') + dmg, '#ff6b6b', crit ? 1.3 : 1);
  addEffect(state, 'hit', p.x, p.y - 8, 0.18);
  Particles.spawn('blood', p.x, p.y - 10, { count: crit ? 6 : 3, c: '#e04b4b' });
  Audio.play('hurt');
  Camera.kick(crit ? 7 : 3, 0.16);
  if (crit) HitStop.trigger(0.05);

  if (m.def.drainsGold) {
    const g = Math.min(p.gold, 3 + Math.floor(Math.random() * 8));
    if (g > 0) {
      p.gold -= g;
      addFloater(state, p.x, p.y - 36, `-${g} เงิน`, '#ffc94d', 0.9);
      Particles.spawn('coin', p.x, p.y - 12, { count: 4 });
      Audio.play('coin');
    }
  }
  if (p.hp <= 0) {
    p.hp = 0; p.dead = true; p.deaths++;
    Particles.spawn('burst', p.x, p.y - 10, { count: 20, c: '#e04b4b' });
    Audio.play('die');
    state.onPlayerDeath?.(m);
  }
}

/* ── บทลงโทษเมื่อตาย (สอดคล้องกับข้อความที่เกมเขียนไว้เอง) ── */
export function applyDeathPenalty(state, mul = 1) {
  const p = state.player;
  const lost = Math.floor(p.exp * 0.01 * mul);
  p.exp = Math.max(0, p.exp - lost);
  const fee = Math.min(Math.floor(p.gold * 0.02 * mul), 200 * mul);
  p.gold = Math.max(0, p.gold - fee);
  return { lost, fee };
}

/* ── อัพเกรดอุปกรณ์ (+n) ── */
export function upgradeEquipped(state, slot) {
  const p = state.player;
  const it = p.equip[slot];
  if (!it) return { ok: false, msg: 'ไม่มีไอเทมในช่องนี้' };
  const lvl = it.lvl || 0;
  if (lvl >= UPGRADE.maxLevel) return { ok: false, msg: `อัพเกรดได้สูงสุด +${UPGRADE.maxLevel} แล้ว` };
  const gold = UPGRADE.goldPerTry(lvl);
  if (countItem(p, UPGRADE.stoneItem) <= 0) return { ok: false, msg: 'ไม่มีหินอัพเกรด (ดรอปจากมอน)' };
  if (p.gold < gold) return { ok: false, msg: `เงินไม่พอ (ต้องใช้ ${gold} เงิน)` };

  removeItem(p, UPGRADE.stoneItem, 1);
  p.gold -= gold;
  const rate = UPGRADE.rates[lvl] ?? 0.05;
  const success = Math.random() < rate;

  if (success) {
    it.lvl = lvl + 1;
    p.ctr.upgradeOk = (p.ctr.upgradeOk || 0) + 1;
    recalcPlayer(p);
    Audio.play('upgrade_ok');
    Particles.spawn('burst', p.x, p.y - 16, { count: 14, c: '#ffc94d' });
    return { ok: true, success: true, lvl: it.lvl, rate, gold };
  }

  const breakChance = lvl >= UPGRADE.breakFrom ? UPGRADE.breakChance[lvl] : 0;
  let broke = false;
  if (Math.random() < breakChance) {
    removeItem(p, it.id, 1);
    p.equip[slot] = null;
    recalcPlayer(p);
    broke = true;
  }
  p.ctr.upgradeFail = (p.ctr.upgradeFail || 0) + 1;
  Audio.play('upgrade_fail');
  Particles.spawn('smoke', p.x, p.y - 12, { count: 6, c: 'rgba(150,150,160,.5)' });
  return { ok: true, success: false, broke, rate, gold, lvl };
}

/* ── เดินตามเส้นทางที่คำนวณไว้ (คลิกเดิน) ── */
function followPath(state, p, dt) {
  const wp = p.path[p.pathIdx];
  if (!wp) { p.path = null; p.pathIdx = 0; return; }
  const dx = wp.x - p.x, dy = wp.y - p.y;
  const d = Math.hypot(dx, dy);
  if (d < 3.5) {
    p.pathIdx++;
    if (p.pathIdx >= p.path.length) { p.path = null; p.pathIdx = 0; }
    return;
  }
  const sp = effSpd(p) * dt;
  const nx = p.x + (dx / d) * sp, ny = p.y + (dy / d) * sp;
  let moved = false;
  if (!state.world.solidAtPx(nx, p.y)) { p.x = nx; moved = true; }
  if (!state.world.solidAtPx(p.x, ny)) { p.y = ny; moved = true; }

  if (!moved) {
    // ติดมุม — ข้ามจุดพักนี้ไปก่อน แล้วค่อยลองใหม่ ถ้าหมดทางจริงจึงยกเลิก
    // (การยกเลิกทันทีทำให้ผู้เล่นค้างกลางทางเวลาจุดพักอยู่ชิดกำแพง)
    p.stuckFrames = (p.stuckFrames || 0) + 1;
    if (p.stuckFrames < 8) {
      p.pathIdx++;
      if (p.pathIdx >= p.path.length) {
        p.path = null; p.pathIdx = 0; p.stuckFrames = 0;
        state.onPathBlocked?.();
      }
    } else {
      p.path = null; p.pathIdx = 0; p.stuckFrames = 0;
      state.onPathBlocked?.();
    }
    return;
  }
  p.stuckFrames = 0;
  p.ctr.distance = (p.ctr.distance || 0) + sp;
  if (dx) p.dir = Math.sign(dx);
  if (p.animT > 0.16) { p.animT = 0; p.frame ^= 1; }
  if (Math.random() < 0.09) Particles.spawn('dust', p.x - p.dir * 4, p.y - 1, { count: 1 });
}

/* ── อัปเดตมอน ── */
export function updateMonsters(state, dt) {
  const p = state.player;
  for (const m of state.monsters) {
    if (m.dead) continue;
    m.prevX = m.x; m.prevY = m.y;
    m.animT += dt; m.hitFlash = Math.max(0, m.hitFlash - dt);
    if (m.animT > 0.22) { m.animT = 0; m.frame ^= 1; }
    if (m.stun > 0) { m.stun -= dt; continue; }
    if (m.atkCd > 0) m.atkCd -= dt;

    const d = Math.hypot(p.x - m.x, p.y - m.y);
    const aggro = m.def.aggro || 0;
    // พาสซีฟแอดมิน: มอนไม่โจมตีก่อน
    const adminPassive = p.clsId === 'admin' && !m.engaged;

    // บอสโลก: ตรวจการร่ายท่าก่อน ถ้ากำลังร่ายจะหยุดเดิน
    if (m.boss && updateBossAbility(state, m, dt, d)) continue;

    // ── เฟส 2: เหลือครึ่งเลือด = โหดขึ้นจริง ──
    if (m.boss && !m.phase2 && !m.dead && m.hp > 0 && m.hp / m.maxHp <= 0.5) {
      m.phase2 = true;
      m.atk = Math.round(m.atk * 1.25);
      m.defv += 4;
      m.abil = null;
      m.abilCd = 1.2;                       // เข้าเฟส 2 แล้วร่ายทันที
      addFloater(state, m.x, m.y - 42, 'ครูฝึก: โมโหสุด!', '#ff4d4d', 1.4);
      Particles.spawn('burst', m.x, m.y - 12, { count: 30, c: '#ff4d4d' });
      Audio.play('boss');
      Camera.kick(14, 0.6);
      HitStop.trigger(0.12);
      state.onBossPhase2?.(m);
      continue;
    }

    if (m.def.ai === 'none') { /* ยืนเฉย ไม่มี AI จริง ๆ */ }
    else if (m.def.ai === 'lazy') {
      m.wanderT -= dt;
      if (m.wanderT <= 0) {
        m.wanderT = 2 + Math.random() * 4;
        m.wanderDir = Math.random() < 0.55 ? { x: 0, y: 0 } : { x: Math.random() * 2 - 1, y: Math.random() * 2 - 1 };
      }
      if (d < 34 && !adminPassive && m.atkCd <= 0) { monsterHitPlayer(state, m); m.atkCd = 1.8; }
      else moveMonster(state, m, m.wanderDir.x * 0.35, m.wanderDir.y * 0.35, dt);
    } else if (m.def.ai === 'erratic') {
      // ค้างคาวเน็ตหลุด — เปลี่ยนทิศถี่ ๆ เหมือนสัญญาณไม่เสถียร
      m.wanderT -= dt;
      if (m.wanderT <= 0) {
        m.wanderT = 0.3 + Math.random() * 0.45;
        m.wanderDir = { x: Math.random() * 2 - 1, y: Math.random() * 2 - 1 };
      }
      if (d < aggro && !adminPassive) {
        moveMonster(state, m,
          Math.sign(p.x - m.x) + m.wanderDir.x * 0.9,
          Math.sign(p.y - m.y) + m.wanderDir.y * 0.9, dt);
        if (d < 26 && m.atkCd <= 0) { monsterHitPlayer(state, m); m.atkCd = 1.25; }
      } else {
        moveMonster(state, m, m.wanderDir.x, m.wanderDir.y, dt);
      }
    } else if (m.def.ai === 'blink') {
      m.blinkT -= dt;
      if (d < aggro && !adminPassive) {
        if (d > 46) moveMonster(state, m, Math.sign(p.x - m.x), Math.sign(p.y - m.y), dt);
        else if (m.atkCd <= 0) { monsterHitPlayer(state, m); m.atkCd = 1.5; }
      } else {
        wander(state, m, dt, 0.4);
      }
      if (m.blinkT <= 0 && d < aggro * 1.3) {
        m.blinkT = 3.5;
        const s = state.world.randomSpot(Math.random, { awayFrom: p, minDist: 40, outsideVillage: true });
        addEffect(state, 'blink', m.x, m.y, 0.3);
        Particles.spawn('smoke', m.x, m.y - 6, { count: 5 });
        m.x = s.x; m.y = s.y;
        addEffect(state, 'blink', m.x, m.y, 0.3);
        addFloater(state, m.x, m.y - 22, 'วาป!', '#7fe0ff', 0.95);
      }
    } else { // chase
      if (d < aggro && !adminPassive) {
        if (d > 30) moveMonster(state, m, Math.sign(p.x - m.x), Math.sign(p.y - m.y), dt);
        else if (m.atkCd <= 0) { monsterHitPlayer(state, m); m.atkCd = 1.5; }
      } else {
        if (m.engaged && d > aggro * 2.2) m.engaged = false;
        wander(state, m, dt, 0.45);
      }
    }

    if (m.boss) {
      m.tauntT -= dt;
      if (m.tauntT <= 0 && d < 400) {
        m.tauntT = 9;
        state.onBossTaunt?.(m);
      }
    }
  }

  // แยกมอนไม่ให้ทับกัน
  for (let i = 0; i < state.monsters.length; i++) {
    const a = state.monsters[i]; if (a.dead) continue;
    for (let j = i + 1; j < state.monsters.length; j++) {
      const b = state.monsters[j]; if (b.dead) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      const dd = Math.hypot(dx, dy);
      if (dd < 12 && dd > 0.01) {
        const push = (12 - dd) / 2;
        a.x -= (dx / dd) * push; a.y -= (dy / dd) * push;
        b.x += (dx / dd) * push; b.y += (dy / dd) * push;
      }
    }
  }

  state.monsters = compact(state.monsters, (m) => !m.dead);
}

/* ── ท่าของบอสโลก (telegraph → ฟาด) ── */
function updateBossAbility(state, m, dt, distToPlayer) {
  if (m.abil) {
    const a = m.abil;
    a.t += dt;
    const pool = m.phase2 ? BOSS_ABILITIES_P2 : BOSS_ABILITIES;
    const def = pool.find((x) => x.id === a.id) || pool[0];
    if (a.phase === 'tell') {
      // ตัวบอสจะยืนนิ่งและขึ้นวงเตือน — ผู้เล่นมีเวลาหลบ
      if (a.t >= def.telegraph) {
        a.phase = 'fire'; a.t = 0;
        fireBossAbility(state, m, def, a);
      }
    } else if (a.t >= 0.3) {
      m.abil = null;
      m.abilCd = def.cd;
    }
    return true;
  }
  m.abilCd -= dt;
  if (m.abilCd <= 0 && distToPlayer < 340) {
    const pool = (m.phase2 ? BOSS_ABILITIES_P2 : BOSS_ABILITIES)
      .filter((x) => !x.summon || state.monsters.length < CONFIG.MAX_MONSTERS - 4);
    const def = pool[Math.floor(Math.random() * pool.length)];
    m.abil = {
      id: def.id, phase: 'tell', t: 0, dur: def.telegraph,
      x: m.x, y: m.y, radius: def.radius || 0, icon: def.icon, name: def.name,
    };
    addFloater(state, m.x, m.y - 38, `${def.icon} ${def.name}`, '#ff9d5c', 1.1);
    Audio.play(m.phase2 ? 'warn' : 'warn');
    state.onBossCast?.(def);
  }
  return false;
}

function fireBossAbility(state, m, def, a) {
  const p = state.player;
  Audio.play('skill');
  Camera.kick(def.kick || 6, 0.3);

  if (def.summon) {
    let made = 0;
    for (let i = 0; i < def.count; i++) {
      const id = def.summon[i % def.summon.length];
      const ang = (i / def.count) * Math.PI * 2;
      const sx = m.x + Math.cos(ang) * 44, sy = m.y + Math.sin(ang) * 44;
      if (state.world.solidAtPx(sx, sy)) continue;
      const mm = createMonster(id, sx, sy, null);
      state.monsters.push(mm);
      Particles.spawn('burst', sx, sy - 8, { count: 6, c: '#b98bff' });
      made++;
    }
    addFloater(state, m.x, m.y - 34, `เรียกบริวาร ${made} ตัว!`, '#ff9d5c', 1.05);
    return;
  }

  const r = def.radius || 56;
  Particles.spawn('burst', a.x, a.y - 8, { count: 22, c: '#ff9d5c' });
  Particles.spawn('smoke', a.x, a.y - 6, { count: 8 });
  addEffect(state, 'aoe', a.x, a.y, 0.45, { radius: r });

  const d = Math.hypot(p.x - a.x, p.y - a.y);
  if (d <= r + 6 && !p.dead) {
    const { dmg } = rollDamage(m.atk, p.def, 0, def.dmgMul || 1);
    p.hp -= dmg;
    p.hitFlash = 0.2;
    addFloater(state, p.x, p.y - 24, dmg, '#ff5f5f', 1.5);
    Camera.kick(11, 0.42);
    HitStop.trigger(0.09);
    Audio.play('hurt');
    Particles.spawn('blood', p.x, p.y - 10, { count: 8 });
    if (p.hp <= 0) { p.hp = 0; p.dead = true; p.deaths++; state.onPlayerDeath?.(m); }
  } else {
    addFloater(state, a.x, a.y - 22, 'หลบทัน!', '#7fe0ff', 1.05);
  }
}

function wander(state, m, dt, speedMul) {
  m.wanderT -= dt;
  if (m.wanderT <= 0) {
    m.wanderT = 1.5 + Math.random() * 3.5;
    m.wanderDir = Math.random() < 0.4 ? { x: 0, y: 0 } : { x: Math.random() * 2 - 1, y: Math.random() * 2 - 1 };
  }
  moveMonster(state, m, m.wanderDir.x * speedMul, m.wanderDir.y * speedMul, dt);
}

function moveMonster(state, m, dx, dy, dt) {
  const len = Math.hypot(dx, dy);
  if (len < 0.01) return;
  const sp = m.spd * dt;
  const nx = m.x + (dx / len) * sp;
  const ny = m.y + (dy / len) * sp;
  if (!state.world.solidAtPx(nx, m.y)) m.x = nx;
  if (!state.world.solidAtPx(m.x, ny)) m.y = ny;
  if (dx !== 0) m.dir = Math.sign(dx);
}

/* ── อัปเดต NPC ── */
export function updateNpcs(state, dt) {
  for (const n of state.npcs) {
    n.animT += dt;
    if (n.animT > 0.5) { n.animT = 0; n.frame ^= 1; }
  }
}

/* ── อัปเดตบอท ── */
export function updateBots(state, dt) {
  const w = state.world;
  for (const b of state.bots) {
    b.animT += dt;
    if (b.animT > 0.2) { b.animT = 0; b.frame ^= 1; }
    b.chatT -= dt;
    if (b.afk) continue;
    if (b.atkCd > 0) b.atkCd -= dt;

    const tgt = nearestMonster(state, b.x, b.y, 120);
    if (tgt && tgt.def.ai !== 'none') {
      const d = Math.hypot(tgt.x - b.x, tgt.y - b.y);
      if (d > 26) {
        const dx = Math.sign(tgt.x - b.x), dy = Math.sign(tgt.y - b.y);
        const sp = 52 * dt;
        const nx = b.x + dx * sp, ny = b.y + dy * sp;
        if (!w.solidAtPx(nx, b.y)) b.x = nx;
        if (!w.solidAtPx(b.x, ny)) b.y = ny;
        b.dir = dx || b.dir;
      } else if (b.atkCd <= 0) {
        b.atkCd = 0.9 + Math.random() * 0.6;
        // บอทตีมอนแบบหลอก ๆ (ไม่ฆ่าจริง เพื่อไม่ให้แย่ง EXP ผู้เล่น)
        tgt.hitFlash = 0.1;
        addFloater(state, tgt.x, tgt.y - 14, String(3 + Math.floor(Math.random() * 9)), '#c9d2ee', 0.8);
        addEffect(state, 'slash', b.x + (b.dir || 1) * 12, b.y - 6, 0.16, { dir: b.dir });
      }
    } else {
      b.wanderT -= dt;
      if (b.wanderT <= 0) {
        b.wanderT = 2 + Math.random() * 5;
        b.wanderDir = { x: Math.random() * 2 - 1, y: Math.random() * 2 - 1 };
      }
      const sp = 34 * dt;
      const nx = b.x + b.wanderDir.x * sp, ny = b.y + b.wanderDir.y * sp;
      if (!w.solidAtPx(nx, b.y)) b.x = nx;
      if (!w.solidAtPx(b.x, ny)) b.y = ny;
      if (b.wanderDir.x) b.dir = Math.sign(b.wanderDir.x);
    }
  }
}

/* ── อัปเดตของบนพื้น ── */
export function updateDrops(state, dt) {
  const p = state.player;
  for (const d of state.drops) {
    d.t += dt;
    d.bob += dt * 4;
    const dist = Math.hypot(d.x - p.x, d.y - p.y);
    if (dist < 22) {                       // ดูดเข้าหาตัว
      d.x += (p.x - d.x) * Math.min(1, dt * 6);
      d.y += (p.y - d.y) * Math.min(1, dt * 6);
    }
    if (dist < 10) {
      d.taken = true;
      addItem(p, d.id, d.qty);
      p.dropsTotal++;
      const it = ITEMS[d.id];
      if (it) {
        if (d.id === 'rat_tail') { p.ctr.ratTail = (p.ctr.ratTail || 0) + 1; p.ctr.ratTailTotal = (p.ctr.ratTailTotal || 0) + 1; }
        const rare = it.rarity === 'rare' || it.rarity === 'epic';
        Audio.play(rare ? 'rare' : 'loot');
        Particles.spawn('spark', d.x, d.y - 6, { count: rare ? 8 : 3, c: rare ? '#b98bff' : '#ffe9a8' });
      }
      state.onLoot?.(d.id, d.qty);
    }
  }
  state.drops = compact(state.drops, (d) => !d.taken && d.t < 90);
}

export function updateEffects(state, dt) {
  for (let i = 0; i < state.effects.length; i++) state.effects[i].t += dt;
  compact(state.effects, (e) => e.t < e.dur);
  const fl = state.floaters;
  for (let i = 0; i < fl.length; i++) { const f = fl[i]; f.t += dt; f.y += f.vy * dt; f.vy += 42 * dt; }
  compact(fl, (f) => f.t < f.dur);
}

/* ── ผู้เล่น ── */
export function updatePlayer(state, dt, input) {
  const p = state.player;
  if (p.dead) return;
  p.prevX = p.x; p.prevY = p.y;
  p.animT += dt;
  p.hitFlash = Math.max(0, p.hitFlash - dt);
  if (p.weak > 0) p.weak -= dt;
  if (p.poison > 0) p.poison -= dt;
  p.inCombatT = nearestMonster(state, p.x, p.y, 150) ? (p.inCombatT || 0) + dt : 0;
  p.ctr.playtime = (p.ctr.playtime || 0) + dt;
  if (p.gold > (p.maxGold || 0)) p.maxGold = Math.floor(p.gold);

  // คูลดาวน์
  for (const k of Object.keys(p.cooldowns)) {
    if (p.cooldowns[k] > 0) p.cooldowns[k] = Math.max(0, p.cooldowns[k] - dt);
  }
  if (p.attackCd > 0) p.attackCd -= dt;

  // บัฟ
  const bl = p.buffs;
  for (let i = 0; i < bl.length; i++) bl[i].t -= dt;
  compact(bl, (b) => b.t > 0);

  // ฟื้นเลือด/มานา ช้า ๆ
  p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.006 * dt);
  p.mp = Math.min(p.maxMp, p.mp + p.maxMp * 0.02 * dt);

  // การเคลื่อนที่
  let dx = 0, dy = 0;
  if (input.keys.has('w') || input.keys.has('arrowup')) dy -= 1;
  if (input.keys.has('s') || input.keys.has('arrowdown')) dy += 1;
  if (input.keys.has('a') || input.keys.has('arrowleft')) dx -= 1;
  if (input.keys.has('d') || input.keys.has('arrowright')) dx += 1;
  // จอยเสมือน (มือถือ) — รวมเข้ากับทางเดียวกันกับ WASD
  const mv = input.moveVec;
  if (mv && (mv.x || mv.y)) { dx += mv.x; dy += mv.y; }
  const moving = !!(dx || dy);
  if (moving) {
    p.ctr.idle = 0;
    p.path = null; p.pathIdx = 0;        // กดปุ่มเดินเอง = ยกเลิกการเดินอัตโนมัติ
    const len = Math.hypot(dx, dy);
    let sp = effSpd(p) * dt;
    // เด็กเน็ตคาเฟ่: กระตุกสุ่ม
    if (p.clsId === 'cafe' && Math.random() < 0.012) sp = 0;
    const nx = p.x + (dx / len) * sp;
    const ny = p.y + (dy / len) * sp;
    const ox = p.x, oy = p.y;
    if (!state.world.solidAtPx(nx, p.y)) p.x = nx;
    if (!state.world.solidAtPx(p.x, ny)) p.y = ny;
    p.ctr.distance = (p.ctr.distance || 0) + Math.hypot(p.x - ox, p.y - oy);
    if (dx) p.dir = Math.sign(dx);
    if (p.animT > 0.16) { p.animT = 0; p.frame ^= 1; }
    // ฝุ่นตอนเดิน
    if (Math.random() < 0.09) {
      Particles.spawn('dust', p.x - p.dir * 4, p.y - 1, { count: 1 });
    }
  } else if (p.path && p.path.length) {
    // ── เดินตามเส้นทางที่คำนวณจากคลิกเมาส์ ──
    p.ctr.idle = 0;
    followPath(state, p, dt);
  } else {
    p.frame = 0;
    p.ctr.idle = (p.ctr.idle || 0) + dt;
    if (p.ctr.idle > (p.ctr.idleBest || 0)) p.ctr.idleBest = p.ctr.idle;
  }

  // ขอบแผนที่
  const W = state.world.w * CONFIG.TILE, H = state.world.h * CONFIG.TILE;
  p.x = Math.max(CONFIG.TILE, Math.min(W - CONFIG.TILE, p.x));
  p.y = Math.max(CONFIG.TILE, Math.min(H - CONFIG.TILE, p.y));
}

/* ── เลือกอาชีพสำหรับแสดงผล ── */
export function playerSpriteId(p) { return 'hero_' + p.clsId; }
export function classById(id) { return CLASSES.find((c) => c.id === id); }
