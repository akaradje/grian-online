/* ═══════════════════════════════════════════════════════════
   main.js — bootstrap · เกมลูป · เรนเดอร์โลก · อินพุต · ตัวจัดการ
   ลูปเป็น fixed timestep 60Hz + interpolate การวาด
   ═══════════════════════════════════════════════════════════ */

import {
  CONFIG, CLASSES, ITEMS, CHAT_REPLIES, AUTO_CHAT, BOT_NAMES, NPCS,
  RESPAWN_LINES, CHEST_LOOT, SKILLS, QUESTS,
} from './data.js';
import { buildSprites, SPR } from './sprites.js';
import { World, SPRITE_OF_TILE, T, HURT_TILES } from './world.js';
import { createFinder } from './pathfind.js';
import {
  createPlayer, createNpc, makeBots, recalcPlayer, addItem, removeItem, countItem,
  updatePlayer, updateMonsters, updateNpcs, updateBots, updateDrops, updateEffects,
  playerAttack, useSkill, checkLevelUp, applyDeathPenalty, upgradeEquipped, killMonster,
  addFloater, nearestMonster, ATTACK_RANGE, advanceClass,
  craftProtectCharm, togglePartyBot, applyGuildBuff, startTowerFloor, playerAura, hasFullSet, hitBot,
} from './entities.js';
import {
  updatePets, attemptCapture, finishCapture,
  usePetPotion, onMonsterKilled, hydratePets,
} from './pets.js';
import { UI } from './ui.js';
import {
  pushChat, sysMsg, tickChat, updateQuests, acceptQuest, completeQuest, doGacha,
  tickBoss, tickSpawn, initialMonsters, bossTimerText, deathQuote, fakeOnline, fakePing,
  saveGame, loadSave, applySave, hasSave, listSlots, wipeSave, migrateLegacy, restoreWorld,
} from './systems.js';
import { Audio } from './audio.js';
import { Settings } from './settings.js';
import { checkAchievements } from './achievements.js';
import { Particles, Camera, DayNight, HitStop, Perf } from './fx.js';
import { VFX } from './vfx.js';
import { Auto } from './auto.js';
import { AutoQ } from './autoquest.js';
import { GFX3D } from './gfx3d.js';
import { Net } from './net.js';

/* ───────────── สถานะเกม ───────────── */
const state = {
  time: 0,
  screen: 'title',
  player: null,
  world: null,
  mapId: 'field',
  monsters: [], npcs: [], bots: [], drops: [], effects: [], floaters: [],
  pets: [],
  targetMonster: null,
  capture: null,
  chestToast: null,
  chat: [],
  boss: { active: false, nextAt: CONFIG.BOSS_FIRST, entity: null },
  tower: { active: false, floor: 0, total: 0 },
  pvpMode: false,
  chatT: 2, spawnT: 1, replyT: null, achT: 1,
  onlineCount: 1247, ping: 12, zoneName: 'หมู่บ้านโนบอดี้', bossText: '--:--',
  inputLocked: false, paused: false, pendingClass: null,
  errors: 0, lastError: null,
};

const input = { keys: new Set() };
const view = { ox: 0, oy: 0, scale: 3, camX: 0, camY: 0, w: 0, h: 0 };

const cv = document.getElementById('world');
const wg = cv.getContext('2d');
cv.width = CONFIG.VIEW_W; cv.height = CONFIG.VIEW_H;
wg.imageSmoothingEnabled = false;

let lastTs = 0;
let acc = 0;
let uidSeq = 0;
const FIXED = 1 / 60;
let vignette = null;
const renderList = [];

function makeGlow(r, g, b, size, peak) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g2 = c.getContext('2d');
  const grd = g2.createRadialGradient(size / 2, size / 2, 1, size / 2, size / 2, size / 2);
  grd.addColorStop(0, `rgba(${r},${g},${b},${peak})`);
  grd.addColorStop(0.55, `rgba(${r},${g},${b},${peak * 0.35})`);
  grd.addColorStop(1, `rgba(${r},${g},${b},0)`);
  g2.fillStyle = grd;
  g2.fillRect(0, 0, size, size);
  return c;
}
const GLOW_LAMP = makeGlow(255, 196, 110, 96, 0.5);
const GLOW_WIN = makeGlow(255, 214, 150, 64, 0.35);

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

function setupTouch() {
  const mode = Settings.get('touchControls');
  const has = 'ontouchstart' in window || (navigator.maxTouchPoints || 0) > 0;
  const on = mode === 'on' || (mode === 'auto' && has);
  document.body.classList.toggle('touch-mode', on);
  const ui = document.getElementById('touch-ui');
  if (ui) ui.classList.toggle('touch-hidden', !on);
  return on;
}
const TOUCH_ON = setupTouch();

function resize() {
  const stage = document.getElementById('stage');
  const sw = stage.clientWidth || window.innerWidth;
  const sh = stage.clientHeight || window.innerHeight;
  const scale = Math.max(sw / CONFIG.VIEW_W, sh / CONFIG.VIEW_H);
  view.scale = scale;
  view.w = sw; view.h = sh;
  cv.style.width = (CONFIG.VIEW_W * scale) + 'px';
  cv.style.height = (CONFIG.VIEW_H * scale) + 'px';
  const c3 = document.getElementById('world-3d');
  if (c3) {
    c3.style.width = (CONFIG.VIEW_W * scale) + 'px';
    c3.style.height = (CONFIG.VIEW_H * scale) + 'px';
    GFX3D.resize(CONFIG.VIEW_W * scale, CONFIG.VIEW_H * scale);
  }
  const r = cv.getBoundingClientRect();
  const sr = stage.getBoundingClientRect();
  view.ox = r.left - sr.left;
  view.oy = r.top - sr.top;

  const portrait = sh > sw * 1.1;
  document.body.classList.toggle('touch-portrait', TOUCH_ON && portrait);

  vignette = wg.createRadialGradient(
    CONFIG.VIEW_W / 2, CONFIG.VIEW_H / 2, CONFIG.VIEW_H * 0.34,
    CONFIG.VIEW_W / 2, CONFIG.VIEW_H / 2, CONFIG.VIEW_W * 0.72,
  );
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, 'rgba(0,0,0,0.32)');
}
window.addEventListener('resize', resize);

/* ═══════════════════════════════════════════════════════════
   ส่วนที่ 1 — ลอจิกเกม (เดินที่ 60Hz คงที่)
   ═══════════════════════════════════════════════════════════ */
function step(dt) {
  state.time += dt;

  if (!state.inputLocked && !state.paused) {
    updatePlayer(state, dt, input);
    if (input.attackQueued) { input.attackQueued = false; doAttack(); }
  } else {
    updatePlayer(state, dt, { keys: new Set() });
  }

  updateChase(state, dt);
  Auto.update(state, dt);
  AutoQ.update(state, dt);
  updateAmbient(state, dt);
  updatePortals(state, dt);
  updateHazards(state, dt);
  state.autoOn = Auto.on;
  if (!Auto.on && state.player && !state.player.dead) {
    state.player.ctr.manualTime = (state.player.ctr.manualTime || 0) + dt;
  }
  updateMonsters(state, dt);
  updateNpcs(state, dt);
  updateBots(state, dt);
  Net.update(state, dt);
  updatePets(state, dt);
  updateCapture(state, dt);
  updateDrops(state, dt);
  updateEffects(state, dt);
  Particles.update(dt);        // แก้บั๊ก v0.9.0: ต้องอัปเดตฟิสิกส์และอายุขัยของอนุภาคทุกเฟรม
  VFX.update(dt);
  updateQuests(state, dt);
  tickSpawn(state, dt);
  tickBoss(state, dt);
  tickChat(state, dt);
  updateLandmarks(state, dt);

  state._hudT = (state._hudT || 0) - dt;
  if (state._hudT <= 0) {
    state._hudT = 0.5;
    state.onlineCount = fakeOnline(state);
    state.ping = fakePing(state);
    const zone = state.world.zoneNameAt(state.player.x, state.player.y);
    if (zone !== state.zoneName) {
      state.zoneName = zone;
      UI.zoneBanner(zone);
    }
    state.bossText = bossTimerText(state);
    updateMusic();
  }

  state.achT -= dt;
  if (state.achT <= 0) {
    state.achT = 1.2;
    const fresh = checkAchievements(state);
    for (const a of fresh) state.onAchievement?.(a);
  }

  if (Settings.get('autoQuality') && Perf.fps > 0) {
    state._aqLo = Perf.fps < 45 ? (state._aqLo || 0) + dt : 0;
    if (state._aqLo > 4 && Particles.quality === 'high') {
      Particles.quality = 'low';
      UI.toast('เครื่องหนัก — ลดคุณภาพเอฟเฟกต์อัตโนมัติ (ปิดได้ที่ตั้งค่า)', 'bad');
      state._aqLo = 0;
    }
    state._aqLo2 = Perf.fps < 70 && GFX3D.ok ? (state._aqLo2 || 0) + dt : 0;
    if (state._aqLo2 > 4 && GFX3D.ok) {
      GFX3D.ok = false;
      GFX3D.reason = 'off';
      UI.toast('เครื่อง/การ์ดจอรัน 3D ไม่ทัน — สลับไป 2D (เปิดบังคับได้ที่ตั้งค่า)', 'bad');
      state._aqLo2 = 0;
      resize();
    }
  }

  if (state.replyT !== null) {
    state.replyT -= dt;
    if (state.replyT <= 0) {
      state.replyT = null;
      pushChat(state, 'world', BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)],
        CHAT_REPLIES[Math.floor(Math.random() * CHAT_REPLIES.length)]);
    }
  }

  if (Settings.get('autoSave')) {
    state._saveT = (state._saveT || 0) + dt;
    if (state._saveT > 25) { state._saveT = 0; saveGame(state); }
  }
}

/* ═══════════════════════════════════════════════════════════
   ส่วนที่ 2 — การวาด (ใช้ alpha interpolate ระหว่างสองสเต็ป)
   ═══════════════════════════════════════════════════════════ */
function render(alpha, frameDt) {
  const p = state.player;
  const TS = CONFIG.TILE;
  const world = state.world;
  const is3D = GFX3D.ok;

  const px = lerp(p.prevX, p.x, alpha);
  const py = lerp(p.prevY, p.y, alpha);

  const maxX = world.w * TS - CONFIG.VIEW_W;
  const maxY = world.h * TS - CONFIG.VIEW_H;
  const tcx = clamp(px - CONFIG.VIEW_W / 2 + p.dir * 12, 0, maxX);
  const tcy = clamp(py - CONFIG.VIEW_H / 2, 0, maxY);
  Camera.update(frameDt, tcx, tcy);
  const cx = clamp(Math.round(Camera.x + Camera.ox), 0, maxX);
  const cy = clamp(Math.round(Camera.y + Camera.oy), 0, maxY);
  view.camX = cx; view.camY = cy;
  state._dnDark = DayNight.enabled ? DayNight.darkness() : 0;
  view.project = (GFX3D.ok && GFX3D.project) ? GFX3D.project.bind(GFX3D) : null;

  if (is3D) {
    GFX3D.flash = 0;
    for (const f of VFX.flashes) GFX3D.flash = Math.max(GFX3D.flash, f.a0 * (1 - f.t / f.dur));
    const list = [];
    for (const n of state.npcs) list.push({ sprId: n.sprite, x: n.x, y: n.y, frame: n.frame });
    for (const b of state.bots) {
      if (b.koT > 0) continue;
      list.push({ sprId: 'hero_' + CLASSES[(b._c || 0) % CLASSES.length].id, x: b.x, y: b.y, frame: b.frame, flip: b.dir < 0 });
    }
    for (const peer of Net.sameMapPeers(state)) {
      const pAura = peer.auraLvl >= 10 ? '#ff4d6b' : (peer.auraLvl >= 9 ? '#ffc94d' : (peer.auraLvl >= 7 ? '#b98bff' : (peer.auraLvl >= 5 ? '#4aa8ff' : null)));
      list.push({ sprId: 'hero_' + (peer.clsId || 'loot'), x: peer.renderX ?? peer.x, y: peer.renderY ?? peer.y, frame: peer.frame || 0, flip: peer.dir < 0, auraColor: pAura });
    }
    for (const m of state.monsters) if (!m.dead) list.push({ sprId: m.def.sprite, x: m.x, y: m.y, frame: m.frame, flip: m.dir < 0, headUp: m.boss ? 8 : 0, shadowR: m.boss ? 26 : 0, auraColor: m.boss ? '#ff4d6b' : (m.elite ? m.elite.aura : null) });
    for (const pt of state.pets) list.push({ sprId: pt.speciesId, x: pt.x, y: pt.y, frame: pt.frame, flip: pt.dir < 0 });
    for (const d of state.drops) list.push({ sprId: d.id === 'gem' ? 'drop_gem' : 'drop_bag', x: d.x, y: d.y, frame: Math.floor(state.time * 3) % 2 });
    const myAura = playerAura(p);
    list.push({ sprId: 'hero_' + p.clsId, x: px, y: py, frame: p.frame, flip: p.dir < 0, headUp: 0, auraColor: myAura ? myAura.color : null });
    GFX3D.render(state, alpha, frameDt, list);
    if (!GFX3D.ok && GFX3D.reason === 'slow-gl') {
      UI.toast('เครื่อง/การ์ดจอรัน 3D ไม่ทัน — สลับไป 2D (เปิดบังคับได้ที่ตั้งค่า)', 'bad');
      GFX3D.reason = 'off';
      resize();
    }
  }

  wg.imageSmoothingEnabled = false;
  wg.clearRect(0, 0, CONFIG.VIEW_W, CONFIG.VIEW_H);

  // ตัวแปลง world → พิกัดแคนวาส 480×270 (ในโหมด 3D ต้องหารด้วย view.scale)
  const W2S = (wx, wy, headUp = 0) => {
    if (is3D) {
      const pr = GFX3D.project(wx, wy, headUp);
      const sc = view.scale || 1;
      return { sx: Math.round(pr.sx / sc), sy: Math.round(pr.sy / sc) };
    }
    return { sx: Math.round(wx - cx), sy: Math.round(wy - cy) };
  };
  const sx = (wx) => W2S(wx, 0).sx;
  const sy = (wy) => W2S(0, wy).sy;

  if (!is3D) {
    wg.fillStyle = '#0d1018';
    wg.fillRect(0, 0, CONFIG.VIEW_W, CONFIG.VIEW_H);
    wg.drawImage(world.groundCanvas, cx, cy, CONFIG.VIEW_W, CONFIG.VIEW_H, 0, 0, CONFIG.VIEW_W, CONFIG.VIEW_H);
    const wave = Math.floor(state.time * 2) % 2;
    const at = world.animatedTiles;
    for (let i = 0; i < at.length; i += 2) {
      const ax = at[i], ay = at[i + 1];
      const dxp = ax * TS - cx, dyp = ay * TS - cy;
      if (dxp <= -TS || dyp <= -TS || dxp >= CONFIG.VIEW_W || dyp >= CONFIG.VIEW_H) continue;
      const spr = SPR[SPRITE_OF_TILE[world.get(ax, ay)]];
      if (spr) wg.drawImage(spr.frames[wave] || spr.frames[0], dxp, dyp);
    }
  }

  /* ── ประกายหีบสมบัติที่ยังไม่เปิด ── */
  for (const c of state.world.chests) {
    if (c.opened) continue;
    const gp = W2S(c.x + 8, c.y + 8, 6);
    if (gp.sx < -40 || gp.sx > CONFIG.VIEW_W + 40 || gp.sy < -40 || gp.sy > CONFIG.VIEW_H + 40) continue;
    const pulse = 0.5 + 0.5 * Math.sin(state.time * 3.4);
    wg.save();
    wg.globalAlpha = 0.18 + 0.22 * pulse;
    wg.fillStyle = '#ffc94d';
    wg.beginPath(); wg.ellipse(gp.sx, gp.sy, 11 + pulse * 3, 9 + pulse * 2, 0, 0, Math.PI * 2); wg.fill();
    wg.globalAlpha = 0.6 + 0.4 * pulse;
    wg.fillStyle = '#fff2c0';
    const t = state.time * 2.2;
    wg.fillRect(gp.sx + Math.cos(t) * 7, gp.sy - 6 + Math.sin(t) * 3, 1, 1);
    wg.restore();
  }

  /* ── วงออร่าอุปกรณ์ตีบวก (+5 / +7 / +9 / +10) ── */
  const aura = playerAura(p);
  if (aura) {
    const ap = W2S(px, py, 1);
    const pulse = 0.75 + 0.25 * Math.sin(state.time * 6);
    wg.save();
    wg.globalAlpha = 0.55 * pulse;
    wg.strokeStyle = aura.color;
    wg.lineWidth = 1.5;
    wg.beginPath(); wg.ellipse(ap.sx, ap.sy - 1, 10 * pulse, 4.5 * pulse, 0, 0, Math.PI * 2); wg.stroke();
    wg.restore();
  }

  /* ── วงเตือนท่าของบอส ── */
  const boss = state.boss.entity;
  if (boss && !boss.dead && boss.abil) {
    const a = boss.abil;
    const bp = W2S(boss.x, boss.y, 0);
    if (bp.sx > -80 && bp.sx < CONFIG.VIEW_W + 80 && bp.sy > -80 && bp.sy < CONFIG.VIEW_H + 80 && a.phase === 'tell') {
      const prog = Math.min(1, a.t / Math.max(0.001, a.dur || 1));
      if (a.radius) {
        wg.save();
        wg.globalAlpha = (boss.phase2 ? 0.24 : 0.16) + 0.10 * Math.sin(state.time * 16);
        wg.fillStyle = boss.phase2 ? '#ff2d2d' : '#ff4d4d';
        wg.beginPath(); wg.arc(bp.sx, bp.sy, a.radius, 0, Math.PI * 2); wg.fill();
        wg.globalAlpha = 0.9;
        wg.strokeStyle = '#ff6b6b';
        wg.lineWidth = 2;
        wg.beginPath(); wg.arc(bp.sx, bp.sy, a.radius, 0, Math.PI * 2); wg.stroke();
        wg.strokeStyle = '#ffe9a8';
        wg.lineWidth = 2.5;
        wg.beginPath();
        wg.arc(bp.sx, bp.sy, a.radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * prog);
        wg.stroke();
        wg.restore();
      } else {
        wg.save();
        wg.globalAlpha = 0.85;
        wg.strokeStyle = '#b98bff';
        wg.lineWidth = 2;
        wg.beginPath(); wg.arc(bp.sx, bp.sy, 44 - 30 * prog, 0, Math.PI * 2); wg.stroke();
        wg.restore();
      }
    }
  }

  /* ── เงา + ตัวละคร (โหมด 2D เฉพาะ) ── */
  if (!is3D) {
    const list = renderList;
    list.length = 0;
    const viewPad = 40;
    const inView = (x, y) => x >= cx - viewPad && x <= cx + CONFIG.VIEW_W + viewPad
      && y >= cy - viewPad && y <= cy + CONFIG.VIEW_H + viewPad;
    for (const n of state.npcs) if (inView(n.x, n.y)) list.push({ y: n.y, kind: 'npc', e: n });
    for (const b of state.bots) if (b.koT <= 0 && inView(b.x, b.y)) list.push({ y: b.y, kind: 'bot', e: b });
    for (const peer of Net.sameMapPeers(state)) if (inView(peer.renderX ?? peer.x, peer.renderY ?? peer.y)) list.push({ y: peer.renderY ?? peer.y, kind: 'peer', e: peer });
    for (const m of state.monsters) if (!m.dead && inView(m.x, m.y)) list.push({ y: m.y, kind: 'mon', e: m });
    for (const pt of state.pets) if (inView(pt.x, pt.y)) list.push({ y: pt.y, kind: 'pet', e: pt });
    if (inView(px, py)) list.push({ y: py, kind: 'me', e: p });
    list.sort((a, b) => a.y - b.y);

    wg.fillStyle = 'rgba(0,0,0,0.30)';
    for (const it of list) {
      const e = it.e;
      const ex = (it.kind === 'me') ? px : lerp(e.prevX ?? e.x, e.x, alpha);
      const ey = (it.kind === 'me') ? py : lerp(e.prevY ?? e.y, e.y, alpha);
      const rw = it.kind === 'mon' && e.boss ? 9 : 6;
      wg.beginPath();
      wg.ellipse(sx(ex), sy(ey) - 1, rw, rw * 0.42, 0, 0, Math.PI * 2);
      wg.fill();
    }

    for (const d of state.drops) {
      const spr = SPR[d.id === 'gem' ? 'drop_gem' : 'drop_bag'];
      const bob = Math.sin(d.bob) * 1.5;
      wg.drawImage(spr.frames[Math.floor(state.time * 3) % 2], sx(d.x) - 6, Math.round(sy(d.y) - 12 + bob));
    }

    for (const it of list) {
      const e = it.e;
      const ex = (it.kind === 'me') ? px : lerp(e.prevX ?? e.x, e.x, alpha);
      const ey = (it.kind === 'me') ? py : lerp(e.prevY ?? e.y, e.y, alpha);
      let sprId;
      if (it.kind === 'me') sprId = 'hero_' + p.clsId;
      else if (it.kind === 'mon') sprId = e.def.sprite;
      else if (it.kind === 'npc') sprId = e.sprite;
      else if (it.kind === 'pet') sprId = e.speciesId;
      else if (it.kind === 'peer') sprId = 'hero_' + (e.clsId || 'loot');
      else sprId = 'hero_' + CLASSES[(e._c || 0) % CLASSES.length].id;
      const spr = SPR[sprId] || SPR['dummy'];
      const f = spr.frames[e.frame % spr.frames.length] || spr.frames[0];
      const w = spr.w, h = spr.h;

      if (it.kind === 'pet') {
        wg.save();
        wg.globalAlpha = e.ko ? 0.3 : 0.85;
        wg.strokeStyle = e.rarity.color;
        wg.lineWidth = 1;
        wg.beginPath(); wg.ellipse(sx(ex), sy(ey) - 1, 8, 3.4, 0, 0, Math.PI * 2); wg.stroke();
        wg.restore();
        if (e.ko) {
          wg.save();
          wg.globalAlpha = 0.55;
          wg.fillStyle = '#7f8aa8';
          wg.font = '7px monospace';
          wg.fillText('สลบ', sx(ex) - 8, sy(ey) - h - 2);
          wg.restore();
        }
      }

      if (it.kind === 'mon' && e.elite) {
        const pulse = 0.55 + 0.45 * Math.sin(state.time * 5);
        wg.save();
        wg.globalAlpha = 0.22 * pulse;
        wg.fillStyle = e.elite.aura;
        wg.beginPath(); wg.ellipse(sx(ex), sy(ey) - 5, 12, 13, 0, 0, Math.PI * 2); wg.fill();
        wg.globalAlpha = 0.55 * pulse;
        wg.strokeStyle = e.elite.aura;
        wg.lineWidth = 1;
        wg.beginPath(); wg.ellipse(sx(ex), sy(ey) - 5, 10, 11, 0, 0, Math.PI * 2); wg.stroke();
        wg.restore();
      }

      if (e.dir < 0) {
        wg.save();
        wg.translate(sx(ex) + Math.round(w / 2), sy(ey));
        wg.scale(-1, 1);
        wg.drawImage(f, -Math.round(w / 2), -h);
        wg.restore();
      } else {
        wg.drawImage(f, sx(ex) - Math.round(w / 2), sy(ey) - h);
      }

      if (e.hitFlash > 0) {
        wg.save();
        wg.globalAlpha = Math.min(0.85, e.hitFlash * 5);
        wg.fillStyle = '#ff5f5f';
        wg.fillRect(sx(ex) - Math.round(w / 2), sy(ey) - h, w, h);
        wg.restore();
      }
    }
  }

  /* ── กรอบเป้าหมายที่คลิกเลือก ── */
  const tgt = state.targetMonster;
  if (tgt && !tgt.dead) {
    const tp = W2S(lerp(tgt.prevX, tgt.x, alpha), lerp(tgt.prevY, tgt.y, alpha), 8);
    const k = 11;
    wg.save();
    wg.strokeStyle = tgt.boss ? '#ff9d5c' : (tgt.elite ? '#ffc94d' : '#ff6b6b');
    wg.lineWidth = 1;
    const top = tp.sy - (tgt.boss ? 24 : 16) - 2, bot = tp.sy + 2;
    wg.beginPath();
    wg.moveTo(tp.sx - k, top + 4); wg.lineTo(tp.sx - k, top); wg.lineTo(tp.sx - k + 4, top);
    wg.moveTo(tp.sx + k, top + 4); wg.lineTo(tp.sx + k, top); wg.lineTo(tp.sx + k - 4, top);
    wg.moveTo(tp.sx - k, bot - 4); wg.lineTo(tp.sx - k, bot); wg.lineTo(tp.sx - k + 4, bot);
    wg.moveTo(tp.sx + k, bot - 4); wg.lineTo(tp.sx + k, bot); wg.lineTo(tp.sx + k - 4, bot);
    wg.stroke();
    wg.restore();
  }

  /* ── จุดหมายที่คลิกเดิน ── */
  const mk = state.moveMarker;
  if (mk) {
    const k = mk.t / 0.7;
    const mp = W2S(mk.x, mk.y, 2);
    wg.save();
    wg.globalAlpha = (1 - k) * 0.9;
    wg.strokeStyle = mk.bad ? '#ff6b6b' : '#ffe9a8';
    wg.lineWidth = 1;
    wg.beginPath(); wg.arc(mp.sx, mp.sy, 3 + k * 9, 0, Math.PI * 2); wg.stroke();
    wg.beginPath();
    wg.moveTo(mp.sx - 5, mp.sy); wg.lineTo(mp.sx + 5, mp.sy);
    wg.moveTo(mp.sx, mp.sy - 5); wg.lineTo(mp.sx, mp.sy + 5);
    wg.stroke();
    wg.restore();
  }

  /* ── เอฟเฟกต์สกิล ── */
  VFX.draw(wg, cx, cy, is3D ? W2S : null);

  /* ── particle (2D เฉพาะ) ── */
  if (!is3D) Particles.draw(wg, cx, cy);

  /* ── เอฟเฟกต์เชิงรูปทรง ── */
  for (const ef of state.effects) {
    const k = ef.t / ef.dur;
    const ep = W2S(ef.x, ef.y, 0);
    if (ef.type === 'slash') {
      const spr = SPR['fx_slash'];
      const fr = spr.frames[Math.min(2, Math.floor(k * 3))];
      wg.save();
      wg.globalAlpha = 1 - k * 0.6;
      if (ef.dir < 0) {
        wg.translate(ep.sx, ep.sy);
        wg.scale(-1, 1);
        wg.drawImage(fr, -10, -10);
      } else {
        wg.drawImage(fr, ep.sx - 10, ep.sy - 10);
      }
      wg.restore();
    } else if (ef.type === 'hit') {
      wg.save();
      wg.globalAlpha = 1 - k;
      wg.strokeStyle = '#ffffff';
      wg.lineWidth = 1;
      wg.beginPath(); wg.arc(ep.sx, ep.sy, 3 + k * 7, 0, Math.PI * 2); wg.stroke();
      wg.restore();
    } else if (ef.type === 'aoe') {
      wg.save();
      wg.globalAlpha = (1 - k) * 0.9;
      wg.strokeStyle = '#ff9d5c';
      wg.lineWidth = 2;
      wg.beginPath(); wg.arc(ep.sx, ep.sy, ef.radius * k, 0, Math.PI * 2); wg.stroke();
      wg.restore();
    } else if (ef.type === 'blink') {
      wg.save();
      wg.globalAlpha = (1 - k) * 0.9;
      wg.strokeStyle = '#7fe0ff';
      wg.lineWidth = 2;
      wg.beginPath(); wg.arc(ep.sx, ep.sy, 4 + k * 14, 0, Math.PI * 2); wg.stroke();
      wg.restore();
    }
  }

  /* ── แสงกลางวัน-กลางคืน + ขอบมืด (2D เท่านั้น) ── */
  DayNight.update(frameDt);
  if (!is3D) {
    const tint = DayNight.tint();
    if (tint) {
      wg.save();
      wg.globalCompositeOperation = 'multiply';
      wg.globalAlpha = tint.a;
      wg.fillStyle = tint.c;
      wg.fillRect(0, 0, CONFIG.VIEW_W, CONFIG.VIEW_H);
      wg.restore();
    }
    if (vignette) {
      wg.save();
      wg.fillStyle = vignette;
      wg.fillRect(0, 0, CONFIG.VIEW_W, CONFIG.VIEW_H);
      wg.restore();
    }
    if (state._dnDark > 0.06 || world.cyber) {
      const spots = world.lightSpots;
      for (let i = 0; i < spots.length; i += 3) {
        const dxp = spots[i] - cx, dyp = spots[i + 1] - cy;
        const rad = spots[i + 2] === 1 ? 46 : 26;
        if (dxp < -rad || dyp < -rad || dxp > CONFIG.VIEW_W + rad || dyp > CONFIG.VIEW_H + rad) continue;
        const fl = 0.88 + 0.12 * Math.sin(state.time * 6.3 + spots[i] * 0.35 + spots[i + 1] * 0.21);
        const a = Math.max(world.cyber ? 0.45 : 0, state._dnDark) * spots[i + 2] * fl;
        const glow = spots[i + 2] === 1 ? GLOW_LAMP : GLOW_WIN;
        wg.save();
        wg.globalCompositeOperation = 'lighter';
        wg.globalAlpha = Math.min(0.85, a * 0.75);
        wg.drawImage(glow, dxp - glow.width / 2, dyp - glow.height / 2);
        wg.restore();
      }
    }
    if (state._ambient > 0) Particles.drawGlow(wg, cx, cy);
  }

  VFX.drawOverlay(wg, CONFIG.VIEW_W, CONFIG.VIEW_H);

  /* ── แถบเลือดบอส ── */
  if (boss && !boss.dead) {
    const bp = W2S(lerp(boss.prevX, boss.x, alpha), lerp(boss.prevY, boss.y, alpha), 36);
    const bw = 84, bx = bp.sx - bw / 2, by = bp.sy;
    wg.fillStyle = 'rgba(0,0,0,.78)';
    wg.fillRect(bx - 1, by - 1, bw + 2, 8);
    wg.fillStyle = boss.phase2 ? '#ff3b3b' : '#ff5f5f';
    wg.fillRect(bx, by, Math.max(0, bw * (boss.hp / boss.maxHp)), 6);
    wg.fillStyle = '#fff';
    wg.font = '6px monospace';
    wg.fillText(boss.phase2 ? 'บอสโลก เฟส 2' : 'บอสโลก', bx, by - 3);
  }
}

/* ═══════════════════════════════════════════════════════════
   ส่วนที่ 3 — ลูปหลัก + ตัวกันพัง
   ═══════════════════════════════════════════════════════════ */
let errorWindow = [];

function frame(ts) {
  requestAnimationFrame(frame);
  if (!lastTs) lastTs = ts;
  const rawMs = ts - lastTs;
  lastTs = ts;
  const frameDt = Math.min(rawMs / 1000, 0.25);
  Perf.sample(rawMs);

  if (state.screen !== 'play' || !state.player) return;

  try {
    if (state.paused) {
      acc = 0;
      render(0, frameDt);
      UI.render(state, view, frameDt);
      UI.tickPerf(state, Perf, frameDt);
      return;
    }

    const dt = HitStop.consume(frameDt);
    acc += dt;
    let steps = 0;
    while (acc >= FIXED && steps < 5) { step(FIXED); acc -= FIXED; steps++; }
    if (steps >= 5) acc = 0;
    const alpha = Math.min(1, acc / FIXED);

    render(alpha, frameDt);
    UI.render(state, view, frameDt);
    UI.tickPerf(state, Perf, frameDt);
  } catch (err) {
    onLoopError(err);
  }
}

function onLoopError(err) {
  state.errors++;
  state.lastError = err;
  const now = performance.now();
  errorWindow = errorWindow.filter((t) => now - t < 3000);
  errorWindow.push(now);
  if (state.errors <= 3) console.error('[GRIAN] ข้อผิดพลาดในลูป:', err);
  if (errorWindow.length > 40) {
    state.screen = 'error';
    UI.showFatal(err, () => {
      state.errors = 0; errorWindow = []; state.screen = 'play'; lastTs = 0;
    });
  }
}

/* ───────────── การกระทำของผู้เล่น ───────────── */
function doAttack() {
  const p = state.player;
  if (p.dead) return;
  if (p.attackCd > 0) return;
  p.attackCd = 0.42;
  playerAttack(state, 1);
  Net.sendAction('attack');
}

function nearestNpc() {
  const p = state.player;
  let best = null, bd = 44 * 44;
  for (const n of state.npcs) {
    const d = (n.x - p.x) ** 2 + (n.y - p.y) ** 2;
    if (d < bd) { bd = d; best = n; }
  }
  return best;
}

/* ───────────── คลิกเดิน / คลิกเป้าโจมตี ───────────── */
let finder = null;
let mouseHeld = false;
let holdT = 0;

function canvasToWorld(clientX, clientY) {
  if (GFX3D.ok) {
    const hit = GFX3D.pick(clientX, clientY);
    if (hit) return hit;
  }
  const r = cv.getBoundingClientRect();
  return {
    x: (clientX - r.left) / view.scale + view.camX,
    y: (clientY - r.top) / view.scale + view.camY,
  };
}

function monsterAt(wx, wy) {
  let best = null, bd = 15 * 15;
  for (const m of state.monsters) {
    if (m.dead) continue;
    const d = (m.x - wx) ** 2 + (m.y - wy - 8) ** 2;
    if (d < bd) { bd = d; best = m; }
  }
  return best;
}

function botAt(wx, wy) {
  if (!state.pvpMode) return null;
  let best = null, bd = 16 * 16;
  for (const b of state.bots) {
    if (b.afk || b.inParty || b.koT > 0) continue;
    const d = (b.x - wx) ** 2 + (b.y - wy - 8) ** 2;
    if (d < bd) { bd = d; best = b; }
  }
  return best;
}

function orderMove(clientX, clientY) {
  const p = state.player;
  if (!p || p.dead || state.paused) return;
  const w = canvasToWorld(clientX, clientY);
  const m = monsterAt(w.x, w.y);

  if (m) {
    state.targetMonster = m;
    UI.setTarget(m);
    const path = finder.find(p.x, p.y, m.x, m.y);
    if (path) { p.path = path; p.pathIdx = 0; }
    return;
  }

  const b = botAt(w.x, w.y);
  if (b) {
    b.hostile = true;
    const path = finder.find(p.x, p.y, b.x, b.y);
    if (path) { p.path = path; p.pathIdx = 0; }
    if (Math.hypot(b.x - p.x, b.y - p.y) <= ATTACK_RANGE + 12 && p.attackCd <= 0) {
      p.attackCd = 0.42;
      hitBot(state, b, p.atk, p.luck, 1);
    }
    return;
  }

  state.targetMonster = null;
  UI.setTarget(null);
  const path = finder.find(p.x, p.y, w.x, w.y);
  if (path) {
    p.path = path; p.pathIdx = 0;
    state.moveMarker = { x: path[path.length - 1].x, y: path[path.length - 1].y, t: 0 };
  } else {
    state.moveMarker = { x: w.x, y: w.y, t: 0, bad: true };
  }
}

function updateChase(state, dt) {
  const p = state.player;
  const m = state.targetMonster;
  if (!m) return;
  if (m.dead) { state.targetMonster = null; UI.setTarget(null); return; }

  const d = Math.hypot(m.x - p.x, m.y - p.y);
  if (d <= ATTACK_RANGE + 6) {
    p.path = null; p.pathIdx = 0;
    p.dir = Math.sign(m.x - p.x) || p.dir;
    if (p.attackCd <= 0 && !p.dead) {
      p.attackCd = 0.42;
      playerAttack(state, 1, '', m);
    }
    return;
  }
  state._chaseT = (state._chaseT || 0) - dt;
  if (state._chaseT <= 0 || !p.path) {
    state._chaseT = 0.5;
    const path = finder.find(p.x, p.y, m.x, m.y);
    if (path) { p.path = path; p.pathIdx = 0; }
  }
}

function updateAmbient(state, dt) {
  state._ambT = (state._ambT || 0) - dt;
  if (state._ambT > 0) return;
  state._ambT = DayNight.enabled && DayNight.darkness() > 0.15 ? 0.55 : 0.9;
  const p = state.player, world = state.world;
  if (!p || !world) return;
  const dark = DayNight.enabled ? DayNight.darkness() : 0;
  state._ambient = dark;
  if (dark < 0.15 && !world.cyber) {
    const region = world.regionAt(p.x, p.y);
    const dense = (region === 'tallgrass' || region === 'village') ? 2 : 1;
    for (let i = 0; i < dense; i++) {
      const a = Math.random() * Math.PI * 2, r = 40 + Math.random() * 200;
      const x = p.x + Math.cos(a) * r, y = p.y + Math.sin(a) * r;
      if (!world.solidAtPx(x, y)) Particles.spawn('pollen', x, y, { count: 1 });
    }
    return;
  }
  const region = world.regionAt(p.x, p.y);
  const dense = (region === 'graveyard' || region === 'cave' || region === 'hellfield' || world.cyber) ? 3 : 2;
  for (let i = 0; i < dense; i++) {
    const a = Math.random() * Math.PI * 2, r = 30 + Math.random() * 210;
    const x = p.x + Math.cos(a) * r, y = p.y + Math.sin(a) * r;
    if (!world.solidAtPx(x, y)) {
      const col = world.cyber ? '#4ae8ff' : (region === 'graveyard' ? '#a8ffd8' : '#c8ff9a');
      Particles.spawn('firefly', x, y, { count: 1, c: col });
    }
  }
}

/* ───────────── เดินทางข้ามแมพ (3 โซน) + อันตรายของโซน 2/3 ───────────── */
let travelFx = null;

function updatePortals(state) {
  const p = state.player, world = state.world;
  if (!p || !world || !world.portals.length || state.paused || state.inputLocked) return;
  if (travelFx && state.time - travelFx < 1.2) return;
  for (const z of world.portals) {
    if (Math.hypot(p.x - (z.x + 8), p.y - (z.y + 8)) < 20) {
      travelTo(z.to);
      travelFx = state.time;
      return;
    }
  }
}

function travelTo(mapId) {
  const p = state.player;
  if (!p) return;
  const targetMap = (mapId === 'hell' || mapId === 'cyber') ? mapId : 'field';
  const hell = targetMap === 'hell';
  const cyber = targetMap === 'cyber';
  state.mapId = targetMap;
  state.world = new World({ hell, cyber, mapId: targetMap });
  finder = createFinder(state.world);
  Auto.attach({ finder, world: state.world });
  AutoQ.attach(finder);
  if (GFX3D.ok) GFX3D.remap(state.world);

  if (hell || cyber) {
    p.x = state.world.spawn.x; p.y = state.world.spawn.y;
    if (cyber) p.ctr.visitedCyber = (p.ctr.visitedCyber || 0) + 1;
  } else {
    const z = state.world.portals[0];
    p.x = z ? z.x + 28 : state.world.spawn.x;
    p.y = z ? z.y + 10 : state.world.spawn.y;
  }
  p.prevX = p.x; p.prevY = p.y;
  p.path = null; p.pathIdx = 0;

  state.npcs = state.world.npcSpots.map((s) => createNpc(s.id, s.x, s.y));
  state.bots = makeBots(state.world);
  state.bots.forEach((b, i) => { b._uid = ++uidSeq; b._c = i; });
  p.partyCount = 0;
  state.monsters = [];
  initialMonsters(state);

  state.drops = []; state.effects = []; state.floaters = [];
  state.targetMonster = null; state.moveMarker = null; state.capture = null;
  state.tower = { active: false, floor: 0, total: 0 };
  state._signSeen = new Set();
  state.boss = { active: false, nextAt: CONFIG.BOSS_FIRST, entity: null };
  VFX.clear();
  Auto.reset(state);
  Camera.snap(p.x - CONFIG.VIEW_W / 2, p.y - CONFIG.VIEW_H / 2);
  state.zoneName = state.world.zoneNameAt(p.x, p.y);
  UI.setTarget(null);
  const burstCol = cyber ? '#4ae8ff' : (hell ? '#b98bff' : '#7fe0ff');
  Particles.spawn('burst', p.x, p.y - 8, { count: 22, c: burstCol });
  Audio.play((hell || cyber) ? 'boss' : 'rare');
  UI.zoneBanner(cyber ? 'แดนเซิร์ฟเถื่อน' : (hell ? 'ดินแดนมาร์' : 'หมู่บ้านโนบอดี้'));
  if (cyber) {
    sysMsg(state, 'คุณทะลุเข้าสู่ แดนเซิร์ฟเถื่อน (แมพ 3) — เสียงพัดลมการ์ดจอดังสนั่นหวั่นไหว!');
    pushChat(state, 'world', BOT_NAMES[0], 'ยินดีต้อนรับสู่เซิร์ฟเถื่อนคูณร้อย ระวังบ่อบั๊กไฟดูดด้วย!');
  } else if (hell) {
    sysMsg(state, 'คุณเดินลึกเข้าประตู... กลิ่นไหม้มาตั้งแต่ไกล เออ ตรงกับชื่อโซน');
    pushChat(state, 'world', BOT_NAMES[0], 'มีใครกล้ามาโซนใหม่ยัง');
  } else {
    sysMsg(state, 'คุณผ่านประตูกลับมา หมอกจางหายไป เห็นสนามหญ้าอีกครั้ง');
  }
  musicCtx = '';
  updateMusic();
}

function updateHazards(state, dt) {
  const p = state.player, world = state.world;
  if (!p || p.dead || (!world.hell && !world.cyber)) return;
  const tile = world.get(Math.floor(p.x / CONFIG.TILE), Math.floor(p.y / CONFIG.TILE));
  if (!HURT_TILES.has(tile)) { state._lavaT = 0; return; }
  state._lavaT = (state._lavaT || 0) - dt;
  if (state._lavaT > 0) return;
  state._lavaT = 0.5;
  const isGlitch = tile === T.GLITCH;
  const dmg = Math.ceil((isGlitch ? CONFIG.CYBER_DPS : CONFIG.LAVA_DPS) * 0.5);
  p.hp -= dmg;
  p.hitFlash = 0.16;
  Particles.spawn('spark', p.x, p.y - 4, { count: 3, c: isGlitch ? '#4ae8ff' : '#ffb04d' });
  addFloater(state, p.x, p.y - 28, `${isGlitch ? 'ไฟดูด!' : 'เผา!'} -${dmg}`, isGlitch ? '#4ae8ff' : '#ff8f3c', 0.95);
  Audio.play('hurt');
  Camera.kick(2, 0.12);
  if (p.hp <= 0) {
    p.hp = 0; p.dead = true; p.deaths++;
    Particles.spawn('burst', p.x, p.y - 10, { count: 16, c: '#e04b4b' });
    Audio.play('die');
    state.onPlayerDeath?.({ name: isGlitch ? 'บ่อบั๊กไฟดูดแดนเซิร์ฟเถื่อน' : 'ลาวกลางดินแดนมาร์' });
  }
}

/* ───────────── การจับสัตว์เลี้ยง ───────────── */
function beginCapture(monster) {
  const r = attemptCapture(state, monster);
  if (!r.ok) { UI.toast(r.msg, 'bad'); Audio.play('error'); return; }
  monster.stun = 99;
  state.capture = { result: r, t: 0, lastShake: -1, done: false };
  UI.updateHotbar(state);
}

function updateCapture(state, dt) {
  const c = state.capture;
  if (!c) return;
  c.t += dt;
  const r = c.result;
  const shakeStart = 0.3, per = 0.34;

  if (c.t >= shakeStart) {
    const idx = Math.floor((c.t - shakeStart) / per);
    if (idx < r.shakes) {
      if (c.lastShake !== idx) {
        c.lastShake = idx;
        addFloater(state, r.monster.x, r.monster.y - 22, `ดิ้น ${idx + 1}...`, '#b98bff', 1.0);
        Audio.play('hit');
        Particles.spawn('spark', r.monster.x, r.monster.y - 8, { count: 4, c: '#b98bff' });
      }
    } else if (!c.done) {
      c.done = true;
      const pet = finishCapture(state, r);
      r.monster.stun = 0;
      if (pet) {
        UI.toast(`${r.line} — ได้ ${pet.species.name} (${pet.rarity.name}) ชื่อ "${pet.nickname}"`, 'epic');
        UI.toast(`อัตราจับสำเร็จครั้งนั้น ${(r.chance * 100).toFixed(0)}%`, 'good');
        Camera.kick(6, 0.3);
      } else {
        UI.toast(`${r.line} (โอกาส ${(r.chance * 100).toFixed(0)}%) — ลูกแก้วหายไป 1 ลูก`, 'bad');
        Audio.play('error');
      }
      UI.refreshPetHud(state);
    }
  }
  if (c.t > shakeStart + r.shakes * per + 0.7) state.capture = null;
}

function updateLandmarks(state, dt) {
  const p = state.player;
  if (state.moveMarker) {
    state.moveMarker.t += dt;
    if (state.moveMarker.t > 0.7) state.moveMarker = null;
  }
  const sign = state.world.signNear(p.x, p.y);
  if (sign) {
    state._signSeen = state._signSeen || new Set();
    const key = sign.x + ',' + sign.y;
    if (!state._signSeen.has(key)) {
      state._signSeen.add(key);
      UI.toast(`📍 ${sign.zone}`, 'good');
    }
  }
  if (state.chestToast) {
    state.chestToast.t += dt;
    if (state.chestToast.t > 0.4) state.chestToast = null;
  }
}

function openChest(chest) {
  const p = state.player;
  chest.opened = true;
  const floorTile = state.world.cyber ? T.CYBERFLOOR : (state.world.hell ? T.ASH : T.GRASS);
  state.world.set(chest.tx, chest.ty, floorTile);
  state.world.repaintRegion(chest.tx - 1, chest.ty - 1, 3, 3);
  const loot = Math.random() < 0.5 ? CHEST_LOOT.common : CHEST_LOOT.rich;
  const gold = CHEST_LOOT.gold[Math.floor(Math.random() * CHEST_LOOT.gold.length)];
  p.gold += gold;
  const got = [];
  for (const [id, n] of loot) {
    if (Math.random() < 0.55) { addItem(p, id, n); got.push(`${ITEMS[id].icon}${ITEMS[id].name}×${n}`); }
  }
  Audio.play('rare');
  Camera.kick(5, 0.3);
  Particles.spawn('burst', chest.x + 8, chest.y, { count: 20, c: '#ffc94d' });
  UI.toast(CHEST_LOOT.lines[Math.floor(Math.random() * CHEST_LOOT.lines.length)], 'epic');
  UI.toast(`ได้ ${gold} เงิน${got.length ? ' · ' + got.join(' · ') : ''}`, 'good');
  sysMsg(state, `เปิดหีบสมบัติ ได้ ${gold} เงิน`);
}

let musicCtx = '';
function updateMusic() {
  if (!Audio.ready) return;
  let want = 'field';
  if (state.boss.active && state.boss.entity && !state.boss.entity.dead) want = 'boss';
  else if (state.world && state.world.cyber) want = 'cyber';
  else if (state.world && state.world.hell) want = 'hell';
  else if (state.world && state.world.inVillage(state.player.x, state.player.y)) want = 'village';
  if (want !== musicCtx) { musicCtx = want; Audio.playMusic(want); }
}

/* ───────────── เริ่มเกม ───────────── */
function startGame(player, saved, saveData = null) {
  state.player = player;
  const savedMap = saveData?.mapId || 'field';
  state.mapId = (savedMap === 'hell' || savedMap === 'cyber') ? savedMap : 'field';
  state.world = new World({ mapId: state.mapId, hell: state.mapId === 'hell', cyber: state.mapId === 'cyber' });
  finder = createFinder(state.world);
  if (!player.x || !player.y || state.world.solidAtPx(player.x, player.y)) {
    player.x = state.world.spawn.x;
    player.y = state.world.spawn.y;
  }
  player.prevX = player.x; player.prevY = player.y;
  player.path = null; player.pathIdx = 0;

  Particles.init();
  Particles.quality = Settings.get('particles');
  state._gfxParticles = Particles.pool;
  if (Settings.get('render3d') !== 'off') GFX3D.init(state.world);
  Camera.enabled = Settings.get('shake') > 0;
  Camera.scale = Number(Settings.get('shake')) || 0;
  Camera.snap(player.x - CONFIG.VIEW_W / 2, player.y - CONFIG.VIEW_H / 2);
  DayNight.enabled = Settings.get('dayNight');
  HitStop.t = 0;
  Perf.reset();

  state.npcs = state.world.npcSpots.map((s) => createNpc(s.id, s.x, s.y));
  state.bots = makeBots(state.world);
  state.bots.forEach((b, i) => { b._uid = ++uidSeq; b._c = i; });

  state.monsters = [];
  initialMonsters(state);

  state.drops = []; state.effects = []; state.floaters = [];
  state.pets = [];
  if (saveData) {
    restoreWorld(state, saveData);
    if (Array.isArray(saveData.pets) && saveData.pets.length) {
      hydratePets(state, saveData.pets);
    } else {
      state.player.activePet = null;
    }
  }
  state.targetMonster = null;
  state.capture = null;
  state.moveMarker = null;
  state.tower = { active: false, floor: 0, total: 0 };
  state.pvpMode = false;
  state._signSeen = new Set();
  state._chaseT = 0;
  VFX.clear();
  Auto.reset(state);
  AutoQ.reset(state);
  Auto.attach({ finder, world: state.world });
  AutoQ.attach(finder);
  state.boss = { active: false, nextAt: CONFIG.BOSS_FIRST, entity: null };
  state.time = 0; state.chatT = 2; state.spawnT = 1; state.achT = 1.5;
  state.chat = []; state.errors = 0; errorWindow = [];
  state._ambT = 0; state._ambient = 0;
  state.paused = false;
  state._saveT = 0;

  UI.resetForNewRun(state);
  UI.drawPortrait();
  UI.buildHotbar(state);
  UI.showScreen('play');
  UI.hideFatal();
  resize();
  UI.refreshTitleMenu();
  musicCtx = '';
  updateMusic();

  if (!saved) {
    sysMsg(state, `ยินดีต้อนรับ ${player.name} สู่ เกรียนออนไลน์ เซิร์ฟเวอร์ ระนาวรก-1`);
    sysMsg(state, `ผู้เล่นออนไลน์ ${state.onlineCount} คน`);
    pushChat(state, 'world', 'GM_ผู้ดูแล', 'ยินดีต้อนรับครับ อ่านประกาศหน้าล็อกอินด้วยนะครับ', 'gm');
    pushChat(state, 'world', BOT_NAMES[0], 'ใครมาใหม่เนี่ย ไปตีหนูกันไหม');
    pushChat(state, 'world', BOT_NAMES[1], 'ตีหนู 200 ตัว ยังไม่ได้หางเลย');
    UI.toast('คลิกซ้ายที่พื้น = เดินไป · คลิกที่มอน = เข้าไปตี · กด V เปิดปาร์ตี้/ประลอง/วาร์ป', 'good');
    UI.toast('WASD เดินเองได้ · E เปิดหีบ/คุย NPC · H ดูวิธีเล่นทั้งหมด', 'good');
  } else {
    sysMsg(state, `โหลดเซฟสำเร็จ — ยินดีต้อนรับกลับ ${player.name}`);
    UI.toast('โหลดเซฟแล้ว (ของที่หายไปถือว่าเป็นบั๊ก)', 'good');
  }
  state.screen = 'play';
}

/* ───────────── ตัวจัดการ UI ───────────── */
const handlers = {
  onEnter() {
    state.pendingClass = null;
    UI.showScreen('create');
    UI.el['btn-start'].disabled = true;
    UI.updateCreatePreview('loot');
    document.querySelector('.class-card')?.classList.add('sel');
  },

  onContinue(slot = 0) {
    const d = loadSave(slot);
    if (!d) { UI.toast('ไม่พบเซฟในช่องนี้', 'bad'); return; }
    state.player = createPlayer(d.name, d.clsId);
    applySave(state, d);
    startGame(state.player, true, d);
  },

  onSelectClass(id) { state.pendingClass = id; },

  onStart() {
    const name = UI.el['in-name'].value.trim() || 'ผู้กล้านิรนาม';
    const cls = state.pendingClass || 'loot';
    const p = createPlayer(name, cls);
    startGame(p, false);
  },

  onAttack() { input.attackQueued = true; },

  onSkill(id) {
    const r = useSkill(state, id);
    if (!r.ok) { UI.toast(r.msg, 'bad'); Audio.play('error'); return; }
    Net.sendAction('skill', { skillId: id });
  },

  onUseItem(id) {
    const p = state.player;
    const d = ITEMS[id];
    if (!d || countItem(p, id) <= 0) { UI.toast('ไม่มีไอเทมนี้', 'bad'); return; }
    if (d.kind !== 'use') { UI.toast('ไอเทมนี้ใช้แบบนี้ไม่ได้', 'bad'); return; }

    if (id === 'capture_ball') {
      if (state.capture) { UI.toast('กำลังจับตัวหนึ่งอยู่ รอให้เสร็จก่อน', 'bad'); return; }
      const m = (state.targetMonster && !state.targetMonster.dead)
        ? state.targetMonster
        : nearestMonster(state, p.x, p.y, 70);
      if (!m) { UI.toast('เลือกเป้าก่อน — คลิกที่มอน แล้วกดลูกแก้วอีกครั้ง', 'bad'); Audio.play('error'); return; }
      beginCapture(m);
      return;
    }

    if (id === 'pet_potion') {
      const r = usePetPotion(state);
      if (!r.ok) { UI.toast(r.msg, 'bad'); Audio.play('error'); return; }
      UI.toast(`${r.pet.nickname} ${r.wasKo ? 'ฟื้นจากสลบ' : 'ฟื้นเลือด'} (${Math.round(r.pet.hp)}/${r.pet.maxHp})`, 'good');
      UI.refreshPetHud(state);
      UI.updateHotbar(state);
      return;
    }

    if (id === 'upgrade_stone' || id === 'protect_charm') {
      UI.toast('ใช้ตอนตีบวกอุปกรณ์ในหน้าต่างกระเป๋า (I)', 'bad');
      return;
    }

    if (d.heal) { p.hp = Math.min(p.maxHp, p.hp + d.heal); UI.floatText(state, p.x, p.y - 22, `+${d.heal} HP`, '#5fe89b'); Particles.spawn('heal', p.x, p.y - 8, { count: 6 }); }
    if (d.healMp) { p.mp = Math.min(p.maxMp, p.mp + d.healMp); UI.floatText(state, p.x, p.y - 22, `+${d.healMp} MP`, '#6fbcff'); Particles.spawn('heal', p.x, p.y - 8, { count: 6, c: '#6fbcff' }); }
    if (d.buffAtk) {
      p.buffs = p.buffs.filter((b) => b.stat !== 'atk');
      p.buffs.push({ stat: 'atk', mul: d.buffAtk, t: d.buffDur || 20, dur: d.buffDur || 20 });
    }
    if (d.buffSpd) {
      p.buffs = p.buffs.filter((b) => b.stat !== 'spd');
      p.buffs.push({ stat: 'spd', mul: d.buffSpd, t: d.buffDur || 20, dur: d.buffDur || 20 });
    }
    if (d.badChance && Math.random() < d.badChance) {
      p.poison = 5;
      UI.toast('ขนมปังหมดอายุ... ท้องเสีย! (ความเร็วลด 5 วินาที)', 'bad');
      Audio.play('error');
    }
    Audio.play('loot');
    removeItem(p, id, 1);
    UI.updateHotbar(state);
    if (UI.openPanelName === 'inv') UI.renderInventory();
  },

  onEquipItem(id) {
    const p = state.player;
    const d = ITEMS[id];
    if (!d || d.kind !== 'equip') { UI.toast('ไอเทมนี้สวมใส่ไม่ได้', 'bad'); return; }
    const slot = d.slot || ((id === 'ring_fake' || id === 'amulet_whale') ? 'acc' : (id.startsWith('armor_') ? 'armor' : 'weapon'));
    const prev = p.equip[slot];
    const prevLvl = prev?.lvl || 0;
    if (prev) addItem(p, prev.id, 1);
    removeItem(p, id, 1);
    p.equip[slot] = { id, lvl: prevLvl }; // โอนระดับตีบวกเดิมให้ของชิ้นใหม่เพื่อไม่ให้เสียเปล่า
    recalcPlayer(p);
    Audio.play('equip');
    UI.toast(`สวมใส่ ${d.name}${prevLvl ? ` (+${prevLvl})` : ''} แล้ว`, 'good');
    if (UI.openPanelName === 'inv') UI.renderInventory();
    if (UI.openPanelName === 'stats') UI.renderStats();
  },

  onUpgrade(slot) {
    const r = upgradeEquipped(state, slot);
    if (!r.ok) { UI.toast(r.msg, 'bad'); Audio.play('error'); return; }
    if (r.success) {
      UI.toast(`อัพเกรดสำเร็จ! เป็น +${r.lvl} (โอกาส ${(r.rate * 100).toFixed(0)}%)${r.aura ? ` · ปลดล็อก ${r.aura.name}!` : ''}`, 'epic');
    } else if (r.charmUsed) {
      UI.toast('อัพเกรดล้มเหลว แต่ 🧿 ยันต์กันแตก ช่วยชีวิตอุปกรณ์ไว้ได้!', 'good');
    } else if (r.broke) {
      UI.toast('อัพเกรดล้มเหลว และไอเทมแตกสลาย!', 'bad');
    } else {
      UI.toast(`อัพเกรดล้มเหลว (โอกาส ${(r.rate * 100).toFixed(0)}%) หินหายไป 1 ชิ้น`, 'bad');
    }
    UI.renderInventory();
  },

  onCraftCharm() {
    const r = craftProtectCharm(state);
    if (!r.ok) { UI.toast(r.msg, 'bad'); Audio.play('error'); return; }
    UI.toast('🧿 หลอมยันต์กันแตกสำเร็จ 1 ใบ!', 'epic');
  },

  onWarp(mapId) {
    travelTo(mapId);
  },

  onTogglePvp() {
    state.pvpMode = !state.pvpMode;
    Audio.play(state.pvpMode ? 'boss' : 'click');
    if (state.pvpMode) {
      UI.toast('⚔️ เปิดโหมด PK — ตอนนี้คุณสามารถคลิกตีหรือกด Space ตีบอทเกรียนได้!', 'bad');
      sysMsg(state, `${state.player.name} เปิดโหมด PK ท้าประลองทั่วแมพ!`);
    } else {
      for (const b of state.bots) b.hostile = false;
      UI.toast('🛡️ ปิดโหมด PK — กลับสู่โหมดรักสงบ', 'good');
    }
    return state.pvpMode;
  },

  onChallengeBot() {
    state.pvpMode = true;
    const p = state.player;
    const b = state.bots.find((x) => !x.afk && !x.inParty && x.koT <= 0);
    if (!b) { UI.toast('ไม่มีบอทว่างให้ท้าตีในขณะนี้', 'bad'); return; }
    b.x = p.x + 22; b.y = p.y;
    b.prevX = b.x; b.prevY = b.y;
    b.hp = b.maxHp;
    b.hostile = true;
    Audio.play('boss');
    UI.toast(`⚔️ ท้าประลองกับ ${b.name} (Lv.${b.lvl})! กด Space หรือคลิกตีได้เลย!`, 'epic');
    pushChat(state, 'world', b.name, `ใครท้ากูวะ ${p.name} เข้ามาดิ!`);
  },

  onToggleParty(botUid) {
    const r = togglePartyBot(state, botUid);
    if (!r.ok) { UI.toast(r.msg, 'bad'); Audio.play('error'); return; }
    if (r.joined) {
      UI.toast(`🤝 ${r.bot.name} เข้าร่วมปาร์ตี้แล้ว! (ช่วยตีมอน + บัฟ ATK/EXP)`, 'good');
      pushChat(state, 'party', r.bot.name, 'สวัสดีครับหัวหน้าตี้ ลุยไหนลุยกัน!');
    } else {
      UI.toast(`เตะ ${r.bot.name} ออกจากปาร์ตี้แล้ว`, 'bad');
    }
  },

  onGuildBuff(buffId) {
    const r = applyGuildBuff(state, buffId);
    if (!r.ok) { UI.toast(r.msg, 'bad'); Audio.play('error'); return; }
    UI.toast(`${r.buff.icon} รับ ${r.buff.name} สำเร็จ!`, 'epic');
  },

  onStartTower() {
    const r = startTowerFloor(state);
    if (!r.ok) { UI.toast(r.msg, 'bad'); Audio.play('error'); return; }
    UI.bossAlert(`🗼 หอคอยบั๊ก ชั้นที่ ${r.floor} — กำจัดมอนทั้ง ${r.count} ตัว!`);
    UI.toast(`🗼 เริ่มหอคอยบั๊ก ชั้นที่ ${r.floor} (มอน ${r.count} ตัว)`, 'epic');
  },

  onSellItem(id) {
    const p = state.player;
    const d = ITEMS[id];
    if (!d || d.kind !== 'sell') { UI.toast('ไอเทมนี้ขายไม่ได้ (ร้านไม่รับ)', 'bad'); return; }
    removeItem(p, id, 1);
    p.gold += d.price;
    Audio.play('coin');
    UI.toast(`ขายได้ ${d.price} เงิน`, 'good');
  },

  onChatSend(text) {
    pushChat(state, 'world', state.player.name, text, 'self');
    Net.sendChat('world', state.player.name, text);
    Audio.play('chat');
    if (Math.random() < 0.7) state.replyT = 0.8 + Math.random() * 1.6;
    if (/gm|จีเอ็ม/i.test(text)) {
      setTimeout(() => {
        pushChat(state, 'world', NPCS.gm.name, 'ครับ มีอะไรให้ช่วยครับ (ตอบช้าเพราะมีผู้เล่น 1247 คน)', 'gm');
        UI.toast('GM ตอบคุณแล้ว (ใช้เวลา 1.2 วินาที)', 'good');
      }, 900 + Math.random() * 1200);
    }
    if (/ขาย|รับซื้อ/i.test(text)) {
      setTimeout(() => {
        pushChat(state, 'trade', BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)], 'สนใจครับ ทักหลังบ้าน');
      }, 1100 + Math.random() * 1500);
    }
  },

  onAcceptQuest(qid) { acceptQuest(state, qid); },
  onCompleteQuest(qid) { completeQuest(state, qid); UI.renderQuestTracker(state); },

  onGacha(n) {
    const r = doGacha(state, n);
    if (!r.ok) { UI.toast(r.msg, 'bad'); Audio.play('error'); return; }
    const got5 = r.results.filter((x) => x.rarity === '5').length;
    Audio.play(got5 ? 'gacha5' : 'gacha');
    if (got5) Camera.kick(8, 0.5);
    UI.renderGachaResult(r.results);
    UI.renderGacha();
    UI.updateHotbar(state);
    if (!got5 && n === 10) UI.toast('เปิด 10 ครั้ง ไม่ได้ ★5 — ยังมี pity อีก 80 ครั้ง', 'bad');
  },

  onRespawn() {
    const p = state.player;
    const hardcore = Settings.get('hardcore');
    const pen = applyDeathPenalty(state, hardcore ? 5 : 1);
    p.dead = false;
    p.hp = p.maxHp; p.mp = p.maxMp;
    p.x = state.world.spawn.x; p.y = state.world.spawn.y;
    p.prevX = p.x; p.prevY = p.y;
    p.weak = 0;
    Audio.play('respawn');
    UI.hideDeath();
    UI.toast(RESPAWN_LINES[0], 'good');
    if (pen.lost > 0 || pen.fee > 0) {
      UI.toast(`บทลงโทษ: เสีย EXP ${pen.lost}${pen.fee ? ` และค่าชุบ ${pen.fee} เงิน` : ''}`, 'bad');
    }
    sysMsg(state, `${p.name} ฟื้นขึ้นที่จุดเกิด (เสีย EXP ${pen.lost}${pen.fee ? `, ค่าชุบ ${pen.fee} เงิน` : ''})`);
  },

  onSave(slot = 0) {
    const ok = saveGame(state, slot);
    UI.toast(ok ? `เซฟลงช่อง ${slot + 1} แล้ว` : 'เซฟไม่สำเร็จ (พื้นที่เก็บเต็ม?)', ok ? 'good' : 'bad');
  },

  onAdvance(advId) {
    const r = advanceClass(state, advId);
    if (!r.ok) { UI.toast(r.msg, 'bad'); Audio.play('error'); return; }
    UI.hideAdvance();
    state.paused = false;
    state._advOffered = true;
    Audio.play('levelup');
    Camera.kick(8, 0.4);
    Particles.spawn('burst', state.player.x, state.player.y - 14, { count: 26, c: '#ffc94d' });
    UI.toast(`🎓 เลือกเส้นทาง: ${r.adv.icon} ${r.adv.name}!`, 'epic');
    sysMsg(state, `${state.player.name} เลือกอาชีพขั้นสูงแล้ว: ${r.adv.name} (สกิลใหม่: ${SKILLS[r.adv.skill].name})`);
    UI.buildHotbar(state);
    UI.drawPortrait();
    if (UI.openPanelName === 'skill') UI.renderSkills();
  },

  onToggleAuto() {
    return Auto.toggle(state);
  },

  onToggleAutoQuest() {
    return AutoQ.toggle(state);
  },

  onQuitToTitle() {
    saveGame(state, 0);
    state.screen = 'title';
    state.paused = false;
    UI.closePanels();
    UI.showScreen('title');
    UI.refreshTitleMenu();
    musicCtx = '';
    Audio.playMusic('village');
  },

  onTogglePause() {
    state.paused = !state.paused;
    UI.showPause(state.paused);
  },
};

/* ───────────── อินพุตเมาส์ (คลิกเดิน / คลิกเป้า / ซูมกล้อง 3D) ───────────── */
cv.addEventListener('mousedown', (e) => {
  if (state.screen !== 'play' || state.paused) return;
  if (e.button === 2) {
    state.targetMonster = null;
    state.player.path = null; state.player.pathIdx = 0;
    UI.setTarget(null);
    e.preventDefault();
    return;
  }
  if (e.button !== 0) return;
  mouseHeld = true;
  holdT = 0;
  orderMove(e.clientX, e.clientY);
});

cv.addEventListener('wheel', (e) => {
  if (state.screen !== 'play' || !GFX3D.ok) return;
  e.preventDefault();
  GFX3D.setZoom(e.deltaY > 0 ? 0.08 : -0.08);
}, { passive: false });

window.addEventListener('mousemove', (e) => {
  if (!mouseHeld || state.screen !== 'play' || state.paused) return;
  holdT += 1;
  const now = performance.now();
  if (now - (state._holdLast || 0) < 140) return;
  state._holdLast = now;
  orderMove(e.clientX, e.clientY);
});

window.addEventListener('mouseup', () => { mouseHeld = false; });
cv.addEventListener('mouseleave', () => { mouseHeld = false; });
cv.addEventListener('contextmenu', (e) => e.preventDefault());

if (TOUCH_ON) {
  const joy = document.getElementById('joystick');
  const knob = document.getElementById('joy-knob');
  let joyId = null;
  const R = 33;

  const joyMove = (t) => {
    const r = joy.getBoundingClientRect();
    let dx = t.clientX - (r.left + r.width / 2);
    let dy = t.clientY - (r.top + r.height / 2);
    const d = Math.hypot(dx, dy);
    if (d > R) { dx = (dx / d) * R; dy = (dy / d) * R; }
    knob.style.transform = `translate(${dx}px,${dy}px)`;
    input.moveVec = { x: dx / R, y: dy / R };
    if (Auto.on && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
      Auto.toggle(state); UI.toast('ปิด AUTO เพราะคุณเริ่มบังคับเอง', 'bad');
    }
  };
  const joyEnd = () => { joyId = null; input.moveVec = null; knob.style.transform = ''; };

  joy.addEventListener('touchstart', (e) => {
    e.preventDefault(); joyId = e.changedTouches[0].identifier; joyMove(e.changedTouches[0]);
  }, { passive: false });
  joy.addEventListener('touchmove', (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) if (t.identifier === joyId) joyMove(t);
  }, { passive: false });
  joy.addEventListener('touchend', (e) => { e.preventDefault(); joyEnd(); }, { passive: false });
  joy.addEventListener('touchcancel', (e) => { e.preventDefault(); joyEnd(); }, { passive: false });

  cv.addEventListener('touchstart', (e) => {
    if (state.screen !== 'play' || state.paused) return;
    const t = e.changedTouches[0];
    orderMove(t.clientX, t.clientY);
    e.preventDefault();
  }, { passive: false });

  const atk = document.getElementById('btn-touch-atk');
  atk?.addEventListener('touchstart', (e) => { e.preventDefault(); input.attackQueued = true; }, { passive: false });
  const autoB = document.getElementById('btn-touch-auto');
  autoB?.addEventListener('touchstart', (e) => { e.preventDefault(); handlers.onToggleAuto(); }, { passive: false });
}

/* ───────────── อินพุตคีย์บอร์ด ───────────── */
const MOVE_KEYS = new Set(['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright']);
window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (state.inputLocked && k !== 'escape' && k !== 'enter') return;
  if (MOVE_KEYS.has(k)) {
    if (Auto.on) { Auto.toggle(state); UI.toast('ปิด AUTO เพราะคุณเริ่มบังคับเอง', 'bad'); }
    input.keys.add(k); e.preventDefault(); return;
  }
  if (k === 'tab') { e.preventDefault(); handlers.onToggleAuto(); return; }
  if (k === 'u') { e.preventDefault(); handlers.onToggleAutoQuest(); return; }

  if (k === ' ' && Settings.get('keyAttack') === 'space') { input.attackQueued = true; e.preventDefault(); return; }
  if (k === 'escape') {
    if (!UI.el.advance.classList.contains('hidden')) {
      UI.toast('เลือกอาชีพขั้นสูงให้ครบก่อน (เลือกครั้งเดียว)', 'bad');
      return;
    }
    if (UI.openPanelName) { UI.closePanels(); return; }
    if (!UI.el.dialog.classList.contains('hidden')) { UI.hideDialog(); return; }
    if (state.screen === 'play') handlers.onTogglePause();
    return;
  }
  if (k === 'f5') { e.preventDefault(); handlers.onSave(0); return; }
  if (k === 'f3') { e.preventDefault(); Settings.set('perf', !Settings.get('perf')); return; }
  if (state.screen !== 'play') return;

  if (k >= '1' && k <= '9') {
    const i = Number(k) - 1;
    if (UI.slots && UI.slots[i]) UI.useSlot(UI.slots[i].it);
    return;
  }
  const panelKey = {
    i: 'inv', k: 'skill', g: 'gacha', q: 'quest', c: 'stats',
    h: 'help', j: 'ach', o: 'settings', p: 'pet', v: 'social',
  }[k];
  if (panelKey) { UI.togglePanel(panelKey); return; }
  if (k === 'e') {
    const chest = state.world.chestNear(state.player.x, state.player.y, 34);
    if (chest) { openChest(chest); return; }
    const n = nearestNpc();
    if (n) {
      if (n.id === 'afk_guy') {
        state.player.talks['afk_guy'] = (state.player.talks['afk_guy'] || 0) + 1;
        UI.toast('คุณเขย่าตัว AFK_ตั้งแต่ปี2550 — เขาขยับเล็กน้อย', 'good');
      }
      UI.showDialog(n, state);
    } else UI.toast('ไม่มี NPC หรือหีบใกล้ ๆ (ลองเข้าไปในหมู่บ้าน)', 'bad');
  }
});
window.addEventListener('keyup', (e) => { input.keys.delete(e.key.toLowerCase()); });
window.addEventListener('blur', () => { input.keys.clear(); if (state.screen === 'play' && !state.paused) handlers.onTogglePause(); });

/* ───────────── hook จากระบบ ───────────── */
state.onToast = (t, k) => UI.toast(t, k);
state.onNetChat = (m) => pushChat(state, m.ch || 'world', '🌐 ' + m.name, m.text, m.ch === 'system' ? 'gm' : 'world');
state.onLoot = (id, qty) => UI.lootFeed(id, qty);
state.onLevelUp = (lvl) => {
  UI.levelUp(lvl);
  sysMsg(state, `${state.player.name} ขึ้นเลเวล ${lvl} แล้ว!`);
  UI.updateHotbar(state);
  if (lvl >= 10 && !state.player.advId && !state._advOffered) {
    state._advOffered = true;
    setTimeout(() => {
      if (state.screen === 'play' && !state.player.advId) {
        state.paused = true;
        UI.showAdvance();
      }
    }, 900);
  }
};
state.onLevelUpCheck = () => checkLevelUp(state);
state.onPlayerDeath = (m) => {
  UI.showDeath(m.name, deathQuote(state));
  sysMsg(state, `${state.player.name} ถึงแก่กรรมโดย ${m.name}`);
};
state.onBossSpawn = () => {
  UI.bossAlert('⚠ บอสโลกปรากฏตัวแล้วที่ลานตะวันออก — ครูฝึกสอนการบ้าน');
  UI.toast('บอสโลกเกิดแล้ว! ไปที่ลานตะวันออก (ดูมินิแมป)', 'bad');
  Audio.play('boss');
  Camera.kick(10, 0.8);
};
state.onBossKilled = () => {
  sysMsg(state, `บอสโลกถูกปราบโดย ${state.player.name}`);
  UI.toast('ปราบบอสโลกสำเร็จ! ของรางวัลตกลงพื้น', 'epic');
};
state.onBossPhase2 = () => {
  UI.bossAlert('⚠ บอสโลกเข้าสู่เฟส 2 — ท่าแรงขึ้น วงเตือนสั้นลง!');
  pushChat(state, 'world', BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)], 'บอสเฟส2แล้วว! ท่าลงมือเร็วขึ้น ระวังใจ');
  sysMsg(state, 'บอสโลกเข้าสู่โหมดโกรธจัด — ท่าใหม่ 3 แบบ');
};
state.onBossTaunt = (m) => {
  pushChat(state, 'world', m.name, m.taunt || 'ทำการบ้านครบหรือยัง!', 'gm');
};
state.onBossCast = (def) => {
  UI.bossAlert(`${def.icon} ${m0Name()}: ${def.cry}`);
};
state.onEliteSpawn = () => {};
state.onEliteKilled = (m) => {
  UI.toast(`ปราบ ${m.name} ได้! ของดรอปเพิ่มขึ้น`, 'epic');
};
state.onPathBlocked = () => { UI.toast('ทางตัน — เลือกจุดหมายใหม่', 'bad'); };
state.onPvpWin = (b, gold, exp) => {
  UI.toast(`🥊 ชนะประลอง ${b.name}! +${gold} เงิน · +${exp} EXP`, 'epic');
  sysMsg(state, `${state.player.name} เอาชนะ ${b.name} ในการประลอง PvP!`);
};
state.onTowerClear = (fl, gold, gems) => {
  UI.bossAlert(`🎉 เคลียร์หอคอยบั๊ก ชั้นที่ ${fl} สำเร็จ!`);
  UI.toast(`🗼 ผ่านชั้น ${fl}! ได้ +${gold} เงิน · +${gems} เพชร${fl % 2 === 0 ? ' · 🧿 ยันต์กันแตก ×1' : ''}`, 'epic');
  sysMsg(state, `${state.player.name} พิชิตหอคอยบั๊ก ชั้นที่ ${fl} สำเร็จ!`);
};

const randBot = () => BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
const pickLine = (a) => a[Math.floor(Math.random() * a.length)];
state.onAutoSkill = (id) => handlers.onSkill(id);
state.onAutoUseItem = (id) => handlers.onUseItem(id);
state.onSkillCast = (id, sk) => UI.skillBanner(id, sk);
state.onAutoToggle = (on) => {
  Audio.play(on ? 'gacha' : 'click');
  if (on) {
    UI.toast('🤖 เปิดโหมด AUTO — เกมจะเล่นให้คุณเอง', 'good');
    pushChat(state, 'world', randBot(), pickLine(AUTO_CHAT.on));
    UI.toast(`โหมด: ${({ polite: 'สุภาพ', balanced: 'สมดุล', aggressive: 'ดุดัน' })[Settings.get('autoMode')]} · ปรับได้ที่ตั้งค่า (O)`, 'good');
  } else {
    const s = Auto.sessionSummary(state);
    UI.toast(`ปิด AUTO — สังหาร ${s.kills} ตัว ใน ${s.minutes.toFixed(1)} นาที`
      + ` (auto สะสม ${s.totalAutoMinutes.toFixed(0)} นาที)`, 'bad');
    pushChat(state, 'world', randBot(), pickLine(AUTO_CHAT.off));
  }
};
state.onAutoThink = () => {
  UI.toast('🤖 AI กำลังคิด... (คิดไม่ออก)', 'bad');
  if (Math.random() < 0.5) pushChat(state, 'world', randBot(), pickLine(AUTO_CHAT.think));
};

state.onAutoQuest = (on) => {
  Audio.play(on ? 'gacha' : 'click');
  if (on) {
    UI.toast('🧾 เปิดออโต้เควสต์ — เกมจะรับเควสต์ ตีมอน แล้วกลับส่งเอง', 'good');
    pushChat(state, 'world', randBot(), 'มีบอทช่วยทำเควสต์ด้วยนะ วันนี้สบายแล้ว');
  } else {
    UI.toast('ปิดออโต้เควสต์แล้ว', 'bad');
  }
};
state.onAutoAccept = (qid) => {
  const q = QUESTS.find((x) => x.id === qid);
  if (!q) return;
  UI.toast(`🧾 รับเควสต์อัตโนมัติ: ${q.title}`, 'good');
  sysMsg(state, `ออโต้เควสต์รับเควสต์: ${q.title}`);
  Audio.play('loot');
};
state.onAutoTalk = (npcId, q) => {
  UI.toast(`🧾 คุยกับ ${NPCS[npcId]?.name || npcId} แล้ว (เควสต์: ${q.title})`, 'good');
  Audio.play('chat');
};

state.onPetExp = (m) => onMonsterKilled(state, m);
state.onPetKill = (m) => killMonster(state, m);
state.onPetKO = (pet, line) => {
  UI.toast(`${pet.nickname} หมดสติ! ${line}`, 'bad');
  UI.refreshPetHud(state);
};
state.onPetLevelUp = (pet) => {
  UI.toast(`📍 ${pet.nickname} ขึ้นเลเวล ${pet.lvl}!`, 'good');
  UI.refreshPetHud(state);
};
state.onAchievement = (a) => {
  UI.toast(`🏆 ความสำเร็จ: ${a.name} — ${a.desc}`, 'epic');
  Audio.play('upgrade_ok');
  Particles.spawn('burst', state.player.x, state.player.y - 12, { count: 14, c: '#ffc94d' });
};
function m0Name() { return state.boss.entity ? state.boss.entity.name : 'บอสโลก'; }

/* ───────────── บูต ───────────── */
Settings.load();
Settings.onChange((k, v, all) => {
  if (k === '*') { Camera.enabled = (all?.shake ?? 0) > 0; Camera.scale = Number(all?.shake) || 0; Particles.quality = all?.particles || 'high'; DayNight.enabled = !!all?.dayNight; return; }
  if (k === 'shake') { Camera.enabled = v > 0; Camera.scale = Number(v) || 0; }
  else if (k === 'particles') Particles.quality = v;
  else if (k === 'dayNight') DayNight.enabled = v;
  else if (k === 'render3d') {
    if (v === 'off') {
      if (GFX3D.ok) { try { GFX3D.renderer.dispose(); } catch (e) {} }
      GFX3D.ok = false; GFX3D.reason = 'off';
    } else if (!GFX3D.ok && state.screen === 'play') {
      GFX3D.reason = null;
      if (GFX3D.init(state.world)) GFX3D.resize(view.w, view.h);
    }
    resize();
  }
  else if (k === 'master' || k === 'music' || k === 'sfx' || k === 'muted') Settings.apply(Audio);
  else if (k === 'touchControls') setupTouch();
});
buildSprites();
UI.init(state, handlers, {
  Audio, Settings, DayNight, Perf, Camera, Particles,
  onPauseToggle: () => handlers.onTogglePause(),
  onQuit: () => handlers.onQuitToTitle(),
  onContinueSlot: (s) => handlers.onContinue(s),
  onSaveSlot: (s) => handlers.onSave(s),
});
resize();
migrateLegacy();
UI.refreshTitleMenu();

const unlock = () => {
  if (Audio.resume()) {
    Settings.apply(Audio);
    Audio.playMusic('village');
    musicCtx = 'village';
  }
  window.removeEventListener('pointerdown', unlock);
  window.removeEventListener('keydown', unlock);
};
window.addEventListener('pointerdown', unlock);
window.addEventListener('keydown', unlock);

// คลิกที่มินิแมปเพื่อเดินไปยังจุดนั้นอัตโนมัติ (A*)
const mmEl = document.getElementById('minimap');
mmEl?.addEventListener('click', (e) => {
  if (state.screen !== 'play' || !state.player || !state.world || !finder) return;
  const r = mmEl.getBoundingClientRect();
  const wx = ((e.clientX - r.left) / Math.max(1, r.width)) * state.world.w * CONFIG.TILE;
  const wy = ((e.clientY - r.top) / Math.max(1, r.height)) * state.world.h * CONFIG.TILE;
  const path = finder.find(state.player.x, state.player.y, wx, wy);
  if (path) {
    state.player.path = path; state.player.pathIdx = 0;
    state.moveMarker = { x: path[path.length - 1].x, y: path[path.length - 1].y, t: 0 };
    UI.toast('🗺️ กำลังเดินไปยังจุดที่คลิกบนมินิแมป...', 'good');
  }
});

Net.init(state);
UI.bootSequence(() => UI.refreshTitleMenu());
requestAnimationFrame(frame);

window.addEventListener('beforeunload', () => { if (state.screen === 'play') saveGame(state, 0); });

/* เปิดให้ตรวจสอบจากภายนอก (ใช้ตอนทดสอบอัตโนมัติ) */
window.__GRIAN__ = {
  state, view, UI, handlers, input, Audio, Settings, Particles, Camera, DayNight, HitStop, Perf,
  VFX, Auto, AutoQ, GFX3D, Net, hasFullSet,
  hasSave, listSlots, wipeSave,
  get finder() { return finder; },
  orderMove, openChest, beginCapture, travelTo, advanceClass,
  craftProtectCharm, togglePartyBot, applyGuildBuff, startTowerFloor, playerAura, recalcPlayer,
  T, HURT_TILES,
};
