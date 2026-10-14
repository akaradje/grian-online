/* ═══════════════════════════════════════════════════════════
   systems.js — เควสต์ · กาชา · แชทโลก · บอสโลก · เซฟเกม
   ═══════════════════════════════════════════════════════════ */

import {
  CONFIG, QUESTS, GACHA, CHAT, MONSTERS, ITEMS, BOT_NAMES, NPCS,
  DEATH_QUOTES, LEVEL_QUOTES, BOSS_TAUNTS, TITLE_ONLINE_BASE, ADVANCED,
} from './data.js';
import { T } from './world.js';
import { addItem, removeItem, countItem, recalcPlayer, spawnMonster, createMonster, xpFor } from './entities.js';

let chatSeq = 0;

/* ─────────────── แชท ─────────────── */
export function pushChat(state, ch, name, text, cls = '') {
  state.chat.push({ id: ++chatSeq, ch, name, text, cls: cls || ch, t: state.time });
  if (state.chat.length > 140) state.chat.splice(0, state.chat.length - 140);
}

export function sysMsg(state, text) { pushChat(state, 'system', '', text, 'system'); }

function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

export function tickChat(state, dt) {
  state.chatT -= dt;
  if (state.chatT > 0) return;
  state.chatT = 1.1 + Math.random() * 3.4;

  const r = Math.random();
  let ch = 'world';
  if (r > 0.86) ch = 'trade';
  else if (r > 0.74) ch = 'party';
  const name = rand(BOT_NAMES);
  const line = rand(CHAT[ch]);
  pushChat(state, ch, name, line);

  if (Math.random() < 0.06) {
    pushChat(state, 'world', NPCS.gm.name, rand(CHAT.gm), 'gm');
  }
  if (Math.random() < 0.05) {
    pushChat(state, 'system', '', 'เซิร์ฟเวอร์จะปิดปรับปรุงใน 1 นาที', 'system');
  }
}

/* ─────────────── เควสต์ ─────────────── */
export function questById(id) { return QUESTS.find((q) => q.id === id); }

export function acceptQuest(state, qid) {
  const p = state.player;
  if (p.quests[qid]) return false;
  const q = questById(qid);
  if (!q) return false;
  p.quests[qid] = { state: 'active', acceptedAt: state.time, mercyDone: false, baseline: snapshotKills(p) };
  sysMsg(state, `รับเควสต์: ${q.title}`);
  state.onToast?.(`รับเควสต์แล้ว: ${q.title}`, 'good');
  return true;
}

function snapshotKills(p) { return { ...p.kills }; }

export function questProgress(state, q) {
  const p = state.player;
  const prog = p.quests[q.id];
  if (!prog) return { cur: 0, need: 1, text: '—', done: false };
  const o = q.objective;
  if (o.type === 'item') {
    const cur = countItem(p, o.item);
    return { cur: Math.min(cur, o.need), need: o.need, text: `${ITEMS[o.item]?.name || o.item}`, done: cur >= o.need };
  }
  if (o.type === 'kill') {
    const base = prog.baseline[o.monster] || 0;
    const cur = Math.max(0, (p.kills[o.monster] || 0) - base);
    return { cur: Math.min(cur, o.need), need: o.need, text: MONSTERS[o.monster]?.name || o.monster, done: cur >= o.need };
  }
  if (o.type === 'talk') {
    const cur = p.talks[o.npc] || 0;
    return { cur: Math.min(cur, o.need), need: o.need, text: NPCS[o.npc]?.name || o.npc, done: cur >= o.need };
  }
  return { cur: 0, need: 1, text: '?', done: false };
}

export function updateQuests(state, dt) {
  const p = state.player;
  for (const q of QUESTS) {
    const prog = p.quests[q.id];
    if (!prog || prog.state !== 'active') continue;
    if (q.mercy && !prog.mercyDone && state.time - prog.acceptedAt > q.mercy.at) {
      prog.mercyDone = true;
      for (const md of Object.values(MONSTERS)) {
        const di = (md.drops || []).findIndex((d) => d[0] === q.objective.item);
        if (di >= 0) { md.drops[di][1] = q.mercy.rate; break; }
      }
      sysMsg(state, q.mercy.msg);
      pushChat(state, 'world', NPCS.gm.name, 'เราไม่ได้ตั้งอัตราดรอปผิดนะ', 'gm');
    }
    const pr = questProgress(state, q);
    if (pr.done && prog.state === 'active') {
      prog.state = 'done';
      state.onToast?.(`เควสต์พร้อมส่ง: ${q.title} — กลับไปหาผู้ให้เควสต์`, 'good');
      sysMsg(state, `เควสต์ "${q.title}" เสร็จแล้ว กลับไปส่งที่ผู้ให้เควสต์`);
    }
  }
}

export function completeQuest(state, qid) {
  const p = state.player;
  const q = questById(qid);
  const prog = p.quests[qid];
  if (!q || !prog || prog.state !== 'done') return false;
  prog.state = 'claimed';

  if (q.objective.type === 'item') removeItem(p, q.objective.item, q.objective.need);
  p.exp += q.reward.exp;
  p.gold += q.reward.gold;
  for (const [id, n] of (q.reward.items || [])) addItem(p, id, n);
  recalcPlayer(p);
  state.onLevelUpCheck?.();

  sysMsg(state, `ส่งเควสต์ "${q.title}" สำเร็จ ได้ ${q.reward.exp} EXP และ ${q.reward.gold} เงิน`);
  state.onToast?.(`ส่งเควสต์สำเร็จ! +${q.reward.exp} EXP · +${q.reward.gold} เงิน`, 'good');
  return true;
}

/* ─────────────── กาชา ─────────────── */
function rollRarity(pity) {
  if (pity >= GACHA.pity - 1) return '5';
  const r = Math.random();
  let acc = 0;
  for (const [rar, rate] of GACHA.rates) {
    acc += rate;
    if (r < acc) return rar;
  }
  return '1';
}

export function doGacha(state, times) {
  const p = state.player;
  const results = [];
  for (let i = 0; i < times; i++) {
    const useTicket = p.tickets > 0;
    if (useTicket) p.tickets -= 1;
    else if (p.gems >= GACHA.cost.gem) p.gems -= GACHA.cost.gem;
    else return { ok: false, msg: 'เพชรและตั๋วไม่พอ', results };

    p.totalPulls++;
    p.pity++;
    const rar = rollRarity(p.pity);
    if (rar === '5') p.pity = 0;
    const pool = GACHA.pool[rar];
    const unit = pool[Math.floor(Math.random() * pool.length)];
    results.push({ rarity: rar, ...unit });
    if (rar === '5') p.ctr.gacha5 = (p.ctr.gacha5 || 0) + 1;
    if (rar === '1') p.ctr.gacha1 = (p.ctr.gacha1 || 0) + 1;
  }
  const best = results.slice().sort((a, b) => Number(b.rarity) - Number(a.rarity))[0];
  if (best && Number(best.rarity) >= 4) {
    p.companion = { n: best.n, e: best.e, rarity: best.rarity };
    state.onToast?.(`${best.n} ตามหลังคุณแล้ว! (แต่ไม่ได้ช่วยอะไรมาก)`, 'epic');
  }
  const got5 = results.filter((r) => r.rarity === '5').length;
  if (got5) state.onToast?.(`ได้ ★5! ${results.find((r) => r.rarity === '5').n}`, 'epic');
  return { ok: true, results };
}

/* ─────────────── บอสโลก ─────────────── */
export function tickBoss(state, dt) {
  const b = state.boss;
  if (!b.active && state.time >= b.nextAt) {
    const bossId = state.world?.cyber ? 'boss_ai' : (state.world?.hell ? 'boss_collector' : 'boss');
    const e = createMonster(bossId, state.world.bossSpot.x, state.world.bossSpot.y);
    b.entity = e;
    b.active = true;
    state.monsters.push(e);
    sysMsg(state, 'บอสโลกปรากฏตัวแล้วที่ลานบอส');
    pushChat(state, 'world', rand(BOT_NAMES), 'บอสเกิดแล้ววว ไปกัน', 'world');
    pushChat(state, 'world', rand(BOT_NAMES), 'ไปตายกันอีกแล้ว');
    state.onBossSpawn?.(e);
  }
}

export function bossTimerText(state) {
  if (state.boss.active) return 'กำลังเกิด!';
  const s = Math.max(0, Math.ceil(state.boss.nextAt - state.time));
  const m = Math.floor(s / 60), ss = s % 60;
  return `${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

/* ─────────────── การเกิดมอน ─────────────── */
export function tickSpawn(state, dt) {
  state.spawnT -= dt;
  if (state.spawnT > 0) return;
  state.spawnT = CONFIG.SPAWN_INTERVAL;
  if (state.monsters.length >= CONFIG.MAX_MONSTERS) return;

  const lvl = state.player.lvl;
  const p = state.player;
  const region = state.world.regionAt(p.x, p.y);

  const byRegion = {
    graveyard: [['ghost', 1.6], ['dummy', 0.4], ['taxman', 0.5], ['rat', 0.3]],
    cave: [['bat', 1.6], ['dummy', 0.5], ['pro', 0.5]],
    tallgrass: [['rat', 1.4], ['slime', 1.2], ['bat', 0.7], ['dummy', 0.4]],
    shore: [['slime', 1.5], ['rat', 0.6], ['bat', 0.4]],
    hellfield: [['imp', 1.6], ['skull', 1.0], ['ghost', 0.4]],
    hellcore: [['skull', 1.6], ['imp', 1.4], ['pro', 0.4]],
    cyberfield: [['botmon', 1.7], ['glitchbug', 1.2], ['whale', 0.5]],
    cybercore: [['glitchbug', 1.5], ['whale', 1.1], ['botmon', 1.2]],
    field: [],
  };
  const base = [
    ['rat', 1.0],
    ['slime', lvl >= 2 ? 0.9 : 0.2],
    ['dummy', lvl >= 4 ? 0.55 : 0.1],
    ['taxman', lvl >= 6 ? 0.5 : 0.05],
    ['bat', lvl >= 6 ? 0.4 : 0],
    ['ghost', lvl >= 8 ? 0.35 : 0],
    ['pro', lvl >= 9 ? 0.3 : 0],
  ];
  const baseTable = (state.world.hell || state.world.cyber) ? [] : base;
  const extra = byRegion[region] || (
    state.world.cyber ? byRegion.cyberfield : (state.world.hell ? byRegion.hellfield : [])
  );
  const merged = new Map();
  for (const [id, w] of baseTable) merged.set(id, (merged.get(id) || 0) + w);
  for (const [id, w] of extra) if (MONSTERS[id]) merged.set(id, (merged.get(id) || 0) + w);

  const table = Array.from(merged.entries()).filter(([, w]) => w > 0);
  const total = table.reduce((a, b) => a + b[1], 0);
  if (total <= 0) return;
  let r = Math.random() * total;
  let pick = 'rat';
  for (const [id, w] of table) { r -= w; if (r <= 0) { pick = id; break; } }

  const spot = (region === 'graveyard' || region === 'cave' || region === 'tallgrass'
    || region === 'hellfield' || region === 'hellcore' || region === 'cyberfield' || region === 'cybercore')
    ? state.world.randomSpot(Math.random, { region, awayFrom: p, minDist: 120, outsideVillage: true })
    : undefined;
  spawnMonster(state, pick, spot);
}

export function initialMonsters(state) {
  const w = state.world;
  if (w.cyber) {
    const zones = [
      ['botmon', 'cyberfield', 8],
      ['glitchbug', 'cyberfield', 6],
      ['whale', 'cybercore', 3],
      ['glitchbug', 'cybercore', 4],
    ];
    for (const [id, region, n] of zones) {
      for (let i = 0; i < n; i++) {
        const spot = w.randomSpot(Math.random, { region, tries: 140, outsideVillage: true });
        spawnMonster(state, id, spot);
      }
    }
  } else if (w.hell) {
    const zones = [
      ['imp', 'hellfield', 8],
      ['skull', 'hellfield', 6],
      ['skull', 'hellcore', 4],
      ['imp', 'hellcore', 4],
    ];
    for (const [id, region, n] of zones) {
      for (let i = 0; i < n; i++) {
        const spot = w.randomSpot(Math.random, { region, tries: 140, outsideVillage: true });
        spawnMonster(state, id, spot);
      }
    }
  } else {
    for (let i = 0; i < 16; i++) {
      spawnMonster(state, rand(['rat', 'rat', 'slime', 'dummy', 'taxman']));
    }
    const zones = [
      ['ghost', 'graveyard', 5],
      ['bat', 'cave', 4],
      ['rat', 'tallgrass', 4],
      ['slime', 'shore', 3],
    ];
    for (const [id, region, n] of zones) {
      for (let i = 0; i < n; i++) {
        const spot = w.randomSpot(Math.random, { region, tries: 140, outsideVillage: true });
        spawnMonster(state, id, spot);
      }
    }
  }
  for (const c of w.chests) {
    if (Math.random() < 0.6) {
      const spot = w.randomSpot(Math.random, { awayFrom: { x: c.x, y: c.y }, minDist: 40, tries: 60, outsideVillage: true });
      const guardPool = w.cyber ? ['botmon', 'glitchbug'] : (w.hell ? ['imp', 'skull'] : ['taxman', 'dummy', 'rat']);
      spawnMonster(state, rand(guardPool), spot, true);
    }
  }
}

/* ─────────────── มุกจากระบบ ─────────────── */
export function deathQuote(state) {
  return rand(DEATH_QUOTES).replace('{n}', String(state.player.deaths));
}
export function levelQuote() { return rand(LEVEL_QUOTES); }
export function bossTaunt() { return rand(BOSS_TAUNTS); }
export function fakeOnline(state) {
  return TITLE_ONLINE_BASE + Math.floor(Math.sin(state.time * 0.07) * 40) + Math.floor(Math.random() * 6);
}
export function fakePing() {
  const r = Math.random();
  if (r < 0.82) return CONFIG.PING_FAKE[Math.floor(Math.random() * 3)];
  return CONFIG.PING_FAKE[3 + Math.floor(Math.random() * (CONFIG.PING_FAKE.length - 3))];
}

/* ─────────────── เซฟ / โหลด ─────────────── */
export const SAVE_SLOTS = 3;
export const SAVE_VERSION = 2;
const slotKey = (s) => `grian_save_v2_slot${s}`;
const LEGACY_KEY = 'grian_online_save_v1';

/** รวมข้อมูลเซฟเป็น object */
function buildSaveData(state) {
  const p = state.player;
  return {
    v: SAVE_VERSION,
    savedAt: Date.now(),
    mapId: state.mapId || 'field',
    name: p.name, clsId: p.clsId, lvl: p.lvl, exp: Math.floor(p.exp),
    hp: Math.round(p.hp), mp: Math.round(p.mp),
    gold: Math.floor(p.gold), gems: p.gems, tickets: p.tickets,
    inv: p.inv, equip: p.equip, kills: p.kills, talks: p.talks,
    quests: p.quests, pity: p.pity, totalPulls: p.totalPulls,
    companion: p.companion,
    advId: p.advId || null,
    x: Math.round(p.x), y: Math.round(p.y),
    maxGold: Math.floor(p.maxGold || 0),
    unlocked: p.unlocked || {},
    ctr: p.ctr || {},
    pets: (state.pets || []).map((pt) => ({
      uid: pt.uid, speciesId: pt.speciesId, rarityId: pt.rarityId,
      nickname: pt.nickname, lvl: pt.lvl, exp: pt.exp,
      maxHp: pt.maxHp, hp: Math.round(pt.hp), atk: pt.atk, spd: pt.spd,
      kills: pt.kills, ko: pt.ko, caughtFrom: pt.caughtFrom || null,
    })),
    activePet: p.activePet || null,
    openedChests: state.world
      ? state.world.chests.filter((c) => c.opened).map((c) => c.id)
      : [],
    stats: {
      kills: p.kills_total, deaths: p.deaths, drops: p.dropsTotal,
      playtime: Math.round(state.time),
    },
  };
}

export function saveGame(state, slot = 0) {
  const p = state.player;
  if (!p) return false;
  try {
    localStorage.setItem(slotKey(slot), JSON.stringify(buildSaveData(state)));
    return true;
  } catch (e) { return false; }
}

/** กู้คืนสถานะของโลกที่ผูกกับเซฟ (หีบที่เปิดแล้ว) */
export function restoreWorld(state, d) {
  if (!d || !state.world) return;
  const opened = d.openedChests;
  if (!Array.isArray(opened) || !opened.length) return;
  const floorTile = state.world.cyber ? T.CYBERFLOOR : (state.world.hell ? T.ASH : T.GRASS);
  for (const c of state.world.chests) {
    if (!opened.includes(c.id)) continue;
    c.opened = true;
    state.world.set(c.tx, c.ty, floorTile);
    state.world.repaintRegion(c.tx - 1, c.ty - 1, 3, 3);
  }
}

/** อ่านดิบ + รองรับเซฟเวอร์ชันเก่า */
export function loadSave(slot = 0) {
  let d = null;
  try {
    const raw = localStorage.getItem(slotKey(slot));
    if (raw) d = JSON.parse(raw);
  } catch (e) { return null; }
  if (!d) return null;
  if (d.v === 1) d = upgradeV1(d);
  if (d.v !== SAVE_VERSION) return null;
  return d;
}

function upgradeV1(d) {
  return {
    ...d,
    v: SAVE_VERSION,
    maxGold: d.gold || 0,
    unlocked: {},
    ctr: {
      ratTail: 0, ratTailTotal: 0, brokeSkill: 0, stolenKills: 0, feeds: 0,
      banished: 0, gacha5: 0, gacha1: 0, bossKills: 0, distance: 0,
      idle: 0, idleBest: 0, playtime: d.stats?.playtime || 0,
      upgradeOk: 0, upgradeFail: 0,
    },
    _migrated: true,
  };
}

export function migrateLegacy() {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return false;
    if (localStorage.getItem(slotKey(0))) { localStorage.removeItem(LEGACY_KEY); return false; }
    const d = JSON.parse(raw);
    if (!d || d.v !== 1) { localStorage.removeItem(LEGACY_KEY); return false; }
    localStorage.setItem(slotKey(0), JSON.stringify(upgradeV1(d)));
    localStorage.removeItem(LEGACY_KEY);
    return true;
  } catch (e) { return false; }
}

export function listSlots() {
  const out = [];
  for (let s = 0; s < SAVE_SLOTS; s++) {
    const d = loadSave(s);
    out.push({
      slot: s,
      exists: !!d,
      name: d?.name || null,
      clsId: d?.clsId || null,
      lvl: d?.lvl || 0,
      gold: d?.gold || 0,
      savedAt: d?.savedAt || 0,
      playtime: d?.stats?.playtime || 0,
      kills: d?.stats?.kills || 0,
      migrated: !!d?._migrated,
    });
  }
  return out;
}

export function hasSave() { return listSlots().some((s) => s.exists); }

export function wipeSave(slot) {
  try {
    if (slot === undefined) {
      for (let s = 0; s < SAVE_SLOTS; s++) localStorage.removeItem(slotKey(s));
      localStorage.removeItem(LEGACY_KEY);
    } else localStorage.removeItem(slotKey(slot));
    return true;
  } catch (e) { return false; }
}

export function exportSave(state) {
  try {
    const tmp = { state: { player: state.player, pets: state.pets, time: state.time, world: state.world, mapId: state.mapId } };
    const raw = JSON.stringify(buildSaveData(tmp.state));
    const code = btoa(unescape(encodeURIComponent(raw)));
    return code;
  } catch (e) { return null; }
}

export function importSave(code) {
  try {
    const raw = decodeURIComponent(escape(atob(code.trim())));
    const d = JSON.parse(raw);
    if (!d || !d.name) return { ok: false, msg: 'โค้ดไม่ถูกต้อง' };
    const v = d.v === 1 ? upgradeV1(d) : d;
    if (v.v !== SAVE_VERSION) return { ok: false, msg: 'เวอร์ชันเซฟไม่รองรับ' };
    localStorage.setItem(slotKey(0), JSON.stringify(v));
    return { ok: true, data: v };
  } catch (e) { return { ok: false, msg: 'อ่านโค้ดไม่สำเร็จ' }; }
}

export function applySave(state, d) {
  const p = state.player;
  p.lvl = d.lvl || 1;
  p.exp = d.exp || 0;
  p.gold = d.gold ?? 60;
  p.gems = d.gems ?? 160;
  p.tickets = d.tickets ?? 1;
  p.inv = Array.isArray(d.inv) ? d.inv : [];
  p.equip = { weapon: null, armor: null, acc: null, ...(d.equip || {}) };
  p.kills = d.kills || {};
  p.talks = d.talks || {};
  p.quests = d.quests || {};
  p.pity = d.pity || 0;
  p.totalPulls = d.totalPulls || 0;
  p.companion = d.companion || null;
  p.advId = d.advId || null;
  p.adv = p.advId ? ADVANCED[p.advId] : null;
  p.maxGold = d.maxGold || 0;
  p.unlocked = d.unlocked || {};
  p.ctr = { ...p.ctr, ...(d.ctr || {}) };
  p.activePet = d.activePet || null;
  p.kills_total = d.stats?.kills || 0;
  p.deaths = d.stats?.deaths || 0;
  p.dropsTotal = d.stats?.drops || 0;
  recalcPlayer(p);
  p.hp = Math.min(d.hp ?? p.maxHp, p.maxHp) || p.maxHp;
  p.mp = Math.min(d.mp ?? p.maxMp, p.maxMp) || p.maxMp;
  if (d.x && d.y) { p.x = d.x; p.y = d.y; p.prevX = d.x; p.prevY = d.y; }
  return p;
}
