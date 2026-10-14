/* ทดสอบเกมในเบราว์เซอร์จริงด้วย Playwright (หรือ WebDriver fallback สำหรับเครื่องออฟไลน์)
   ใช้:  node tools/smoke.mjs [พอร์ต]
   ตรวจ: console error · แคนวาสเรนเดอร์จริง · เดิน/ตี/เลเวล · แพเนลทั้งหมด
         · กาชา · เควสต์ · แชท · NPC · บอส+ท่า telegraph · มอน elite
         · ตาย/ชดเชย · เซฟหลายช่อง · ตั้งค่า · ความสำเร็จ · อัพเกรด+ยันต์กันแตก+ออร่า
         · เสียง · particle (อัปเดตอายุขัยจริง) · เมนูหยุดชั่วคราว · ตัววัดประสิทธิภาพ
         · โซน 2 (ดินแดนมาร) · โซน 3 (แดนเซิร์ฟเถื่อน) · ปาร์ตี้บอท · โหมด PK · หอคอยบั๊ก · 3D VFX */

import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const PW = process.env.PLAYWRIGHT_PATH || 'playwright';
let _pw;
try {
  _pw = await import(PW);
} catch (e) {
  _pw = await import('./webdriver-playwright.mjs');
}
const chromium = _pw.chromium || _pw.default?.chromium;
if (!chromium) throw new Error('ไม่พบ playwright หรือ webdriver-playwright');

function findChromium() {
  if (process.env.PLAYWRIGHT_CHROME) return process.env.PLAYWRIGHT_CHROME;
  for (const sysBin of ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome']) {
    if (fs.existsSync(sysBin)) return sysBin;
  }
  const roots = [
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'ms-playwright'),
    process.env.HOME && path.join(process.env.HOME, '.cache', 'ms-playwright'),
  ].filter(Boolean);
  const c = [];
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    for (const d of fs.readdirSync(root)) {
      if (!d.startsWith('chromium-')) continue;
      for (const rel of ['chrome-win64/chrome.exe', 'chrome-linux/chrome']) {
        const p = path.join(root, d, rel);
        if (fs.existsSync(p)) c.push({ p, v: Number(d.split('-')[1]) || 0 });
      }
    }
  }
  c.sort((a, b) => b.v - a.v);
  return c[0]?.p || null;
}

const PORT = Number(process.argv[2] || 8731);
const BASE = `http://127.0.0.1:${PORT}/`;
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'shots');
fs.mkdirSync(OUT, { recursive: true });

const problems = [];
const notes = [];
const ok = (l) => notes.push(`  [PASS] ${l}`);
const bad = (l, d) => problems.push(`  [FAIL] ${l}${d ? ' — ' + d : ''}`);

const browser = await chromium.launch({ headless: true, executablePath: findChromium() || undefined });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });

const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push('PAGEERROR: ' + e.message));

const shot = async (name) => {
  try { await page.screenshot({ path: path.join(OUT, name) }); }
  catch (e) { notes.push(`  [WARN] ถ่ายภาพ ${name} ไม่สำเร็จ (${e.code || e.message})`); }
};

console.log('› เปิดหน้าเว็บ');
await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#title-menu:not(.hidden)', { timeout: 25000 });
ok('ลำดับโหลดหน้าแรกจบ');

/* ── 1. หน้าแรก: ช่องเซฟ 3 ช่อง ── */
const slotCount = await page.locator('.slot-row').count();
if (slotCount === 3) ok('หน้าแรกแสดงช่องเซฟ 3 ช่อง');
else bad('จำนวนช่องเซฟไม่ใช่ 3', String(slotCount));
await shot('01-title.png');

/* ── 2. สร้างตัวละคร ── */
await page.click('#btn-enter');
await page.waitForSelector('#scr-create.active', { timeout: 5000 });

/* ── 2b. เสียงถูกปลดล็อกหลังผู้ใช้คลิกครั้งแรก ── */
const audio = await page.evaluate(() => {
  const A = window.__GRIAN__.Audio;
  return { ready: A.ready, state: A.ctx?.state || null, hasMaster: !!A.master, hasMusic: !!A.musicBus, hasSfx: !!A.sfxBus };
});
if (audio.ready && audio.hasMaster && audio.hasMusic && audio.hasSfx) {
  ok(`ระบบเสียงเริ่มทำงานหลังคลิกครั้งแรก (สถานะ AudioContext: ${audio.state})`);
} else bad('ระบบเสียงไม่เริ่มทำงาน', JSON.stringify(audio));

const sfxTest = await page.evaluate(async () => {
  const A = window.__GRIAN__.Audio;
  if (!A.ready) return { ok: false };
  const before = A.ctx.currentTime;
  A.play('levelup'); A.play('crit'); A.play('gacha5'); A.play('heal');
  return { ok: true, t: +(A.ctx.currentTime - before).toFixed(3), music: A.trackName };
});
if (sfxTest.ok) ok(`เล่นเสียงเอฟเฟกต์ได้โดยไม่ error (เพลงที่เล่นอยู่: ${sfxTest.music || 'ยังไม่เริ่ม'})`);
else bad('เล่นเสียงเอฟเฟกต์ไม่ได้');

const classCount = await page.locator('.class-card').count();
if (classCount === 6) ok('หน้าสร้างตัวละครแสดง 6 อาชีพ');
else bad('จำนวนอาชีพไม่ตรง', String(classCount));

await page.fill('#in-name', 'ผู้ทดสอบระบบ');
await page.locator('.class-card').nth(1).click();
await shot('02-create.png');
await page.click('#btn-start');
await page.waitForSelector('#scr-play.active', { timeout: 8000 });
await page.waitForTimeout(1500);
ok('เข้าสู่ฉากเกม');

await page.evaluate(() => {
  const G = window.__GRIAN__;
  G.Settings.set('render3d', 'off');
  G.Settings.set('autoQuality', false);
});
await page.waitForTimeout(200);

/* ── 4. โลกเรนเดอร์จริง ── */
const canvasInfo = await page.evaluate(() => new Promise((resolve) => {
  const G = window.__GRIAN__;
  const set = new Set();
  if (G.GFX3D && G.GFX3D.ok) {
    requestAnimationFrame(() => {
      const gl = G.GFX3D.renderer.getContext();
      const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
      const px = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      for (let i = 0; i < px.length; i += 4) set.add(`${px[i]},${px[i + 1]},${px[i + 2]}`);
      resolve({ colors: set.size, total: w * h, via: '3d' });
    });
    return;
  }
  const cv = document.getElementById('world');
  const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
  for (let i = 0; i < d.length; i += 4) set.add(`${d[i]},${d[i + 1]},${d[i + 2]}`);
  resolve({ colors: set.size, total: cv.width * cv.height, via: '2d' });
}));
if (canvasInfo.colors > 60) ok(`โลกเรนเดอร์จริง (${canvasInfo.via}): ${canvasInfo.colors} สี — แสง/พื้น/เอฟเฟกต์`);
else bad('แคนวาสโลกดูว่างเปล่า', JSON.stringify(canvasInfo));

/* ── 5. เดินได้ ── */
const before = await page.evaluate(() => ({ x: window.__GRIAN__.state.player.x }));
await page.keyboard.down('d');
await page.waitForTimeout(700);
await page.keyboard.up('d');
await page.waitForTimeout(200);
const after = await page.evaluate(() => ({ x: window.__GRIAN__.state.player.x, dist: window.__GRIAN__.state.player.ctr.distance }));
if (Math.abs(after.x - before.x) > 10) ok(`เดินได้: x ${before.x.toFixed(0)} → ${after.x.toFixed(0)} · สะสม ${after.dist.toFixed(0)} หน่วย`);
else bad('ผู้เล่นไม่ขยับ');

/* ── 6. ระบบ 60Hz คงที่ ── */
const stepRate = await page.evaluate(async () => {
  const S = window.__GRIAN__.state;
  const t0 = S.time;
  await new Promise((r) => setTimeout(r, 2000));
  return (S.time - t0) / 2;
});
if (stepRate > 0.9 && stepRate < 1.1) ok(`เวลาในเกมเดิน 1:1 กับเวลาจริง (${stepRate.toFixed(3)} เท่า) — fixed timestep ทำงาน`);
else bad('เวลาในเกมไม่ตรงกับเวลาจริง', stepRate.toFixed(3));

const ISOLATE_FN = `
  (keep) => {
    const S = window.__GRIAN__.state;
    for (const m of S.monsters) {
      if (m === keep) continue;
      m.x += 4000; m.y += 4000;
      m.prevX = m.x; m.prevY = m.y;
      m.stun = 999;
    }
  }
`;

const GATHER_FN = `
  (n, dist) => {
    const S = window.__GRIAN__.state;
    const p = S.player;
    const list = S.monsters.filter((m) => !m.boss).slice(0, n);
    list.forEach((m, i) => {
      const a = (i / Math.max(1, list.length)) * Math.PI * 2;
      m.dead = false; m.stun = 0;
      m.hp = 18; m.maxHp = Math.max(18, m.maxHp);
      m.x = p.x + Math.cos(a) * dist;
      m.y = p.y + Math.sin(a) * dist;
      m.prevX = m.x; m.prevY = m.y;
    });
    return list.length;
  }
`;

/* ── 6b. คลิกเมาส์เดินไปถึงจุดหมายจริง ── */
const clickMove = await page.evaluate(async (isolateSrc) => {
  const isolate = eval(isolateSrc);
  const G = window.__GRIAN__;
  const S = G.state, p = S.player;
  const W = S.world;
  isolate(null);
  p.hp = p.maxHp; p.dead = false;
  S.targetMonster = null; p.path = null;

  let target = null;
  for (let i = 0; i < 300 && !target; i++) {
    const a = Math.random() * Math.PI * 2, r = 140 + Math.random() * 70;
    const x = p.x + Math.cos(a) * r, y = p.y + Math.sin(a) * r;
    if (x < 60 || y < 60 || x > W.w * 16 - 60 || y > W.h * 16 - 60) continue;
    if (W.solidAtPx(x, y)) continue;
    let blocked = false;
    for (let s = 1; s < 40; s++) {
      const t = s / 40;
      if (W.solidAtPx(p.x + (x - p.x) * t, p.y + (y - p.y) * t)) { blocked = true; break; }
    }
    if (!blocked) target = { x, y };
  }
  if (!target) return { err: 'หาจุดหมายที่เดินตรงได้ไม่เจอ' };

  const d0 = Math.hypot(target.x - p.x, target.y - p.y);
  const cv = document.getElementById('world');
  const r = cv.getBoundingClientRect();
  const sx = r.left + (target.x - G.view.camX) * G.view.scale;
  const sy = r.top + (target.y - G.view.camY) * G.view.scale;
  cv.dispatchEvent(new MouseEvent('mousedown', { clientX: sx, clientY: sy, button: 0, bubbles: true }));
  window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

  const hadPath = !!(p.path && p.path.length);
  let stalled = 0, prevD = d0;
  for (let i = 0; i < 80; i++) {
    await new Promise((res) => setTimeout(res, 100));
    const d = Math.hypot(target.x - p.x, target.y - p.y);
    if (d < 20) break;
    if (Math.abs(prevD - d) < 0.6) { stalled++; if (stalled > 8) break; }
    else stalled = 0;
    prevD = d;
  }
  const d1 = Math.hypot(target.x - p.x, target.y - p.y);
  return { d0: +d0.toFixed(1), d1: +d1.toFixed(1), hadPath };
}, ISOLATE_FN);
if (clickMove.err) bad('คลิกเดิน', clickMove.err);
else if (clickMove.hadPath && clickMove.d1 < 24) {
  ok(`คลิกเดินทำงาน: ห่าง ${clickMove.d0}px → เดินไปถึงเหลือ ${clickMove.d1}px`);
} else bad('คลิกเดินไม่ถึงจุดหมาย', JSON.stringify(clickMove));

/* ── 6c. A* หาทางอ้อมสิ่งกีดขวางได้จริง ── */
const pathTest = await page.evaluate(() => {
  const G = window.__GRIAN__;
  const W = G.state.world, f = G.finder;
  if (!f) return { err: 'ไม่พบ finder' };
  const v = W.village;
  let found = null;
  for (let i = 0; i < 500 && !found; i++) {
    const x1 = (v.x + 1 + Math.floor(Math.random() * (v.w - 2))) * 16 + 8;
    const y1 = (v.y + 1 + Math.floor(Math.random() * (v.h - 2))) * 16 + 8;
    const x2 = (v.x + 1 + Math.floor(Math.random() * (v.w - 2))) * 16 + 8;
    const y2 = (v.y + 1 + Math.floor(Math.random() * (v.h - 2))) * 16 + 8;
    if (W.solidAtPx(x1, y1) || W.solidAtPx(x2, y2)) continue;
    const straight = Math.hypot(x2 - x1, y2 - y1);
    if (straight < 90) continue;
    let blocked = false;
    for (let s = 1; s < 60; s++) {
      const t = s / 60;
      if (W.solidAtPx(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t)) { blocked = true; break; }
    }
    if (!blocked) continue;
    const p = f.find(x1, y1, x2, y2);
    if (p && p.length > 1) found = { pts: p.length, straight: +straight.toFixed(0) };
  }
  const inWall = f.find(W.spawn.x, W.spawn.y, W.village.x * 16 + 8, W.village.y * 16 + 8);
  return { found, inWall: inWall ? inWall.length : 0 };
});
if (pathTest.err) bad('A*', pathTest.err);
else {
  if (pathTest.found) ok(`A* หาทางอ้อมกำแพงได้ (เส้นตรง ${pathTest.found.straight}px → เส้นทาง ${pathTest.found.pts} ช่วง)`);
  else bad('A* หาเส้นทางอ้อมไม่เจอ');
  if (pathTest.inWall > 0) ok('คลิกโดนกำแพงแล้วระบบหาช่องว่างใกล้สุดให้อัตโนมัติ');
  else bad('คลิกในกำแพงแล้วหาเส้นทางไม่ได้');
}

/* ── 6d. คลิกที่มอน = ตั้งเป้าและเข้าตีอัตโนมัติ ── */
const clickTarget = await page.evaluate(async (isolateSrc) => {
  const isolate = eval(isolateSrc);
  const G = window.__GRIAN__;
  const S = G.state, p = S.player;
  const m = S.monsters.find((x) => !x.dead && !x.boss);
  if (!m) return { err: 'ไม่พบมอน' };
  isolate(m);
  p.hp = p.maxHp; p.dead = false;
  S.targetMonster = null; p.path = null;
  m.dead = false; m.hp = m.maxHp; m.stun = 0;
  m.x = p.x + 110; m.y = p.y;

  const cv = document.getElementById('world');
  const r = cv.getBoundingClientRect();
  const sx = r.left + (m.x - G.view.camX) * G.view.scale;
  const sy = r.top + (m.y - 8 - G.view.camY) * G.view.scale;
  cv.dispatchEvent(new MouseEvent('mousedown', { clientX: sx, clientY: sy, button: 0, bubbles: true }));
  window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  await new Promise((res) => setTimeout(res, 150));

  const targeted = S.targetMonster === m;
  const boxShown = !document.getElementById('target-box').classList.contains('hidden');
  const hp0 = m.hp;
  for (let i = 0; i < 60; i++) {
    await new Promise((res) => setTimeout(res, 100));
    if (m.dead || m.hp < hp0) break;
  }
  return { targeted, boxShown, hp0, hp1: m.hp, dead: m.dead, name: m.name };
}, ISOLATE_FN);
if (clickTarget.err) bad('คลิกเป้า', clickTarget.err);
else if (clickTarget.targeted && clickTarget.boxShown && (clickTarget.hp1 < clickTarget.hp0 || clickTarget.dead)) {
  ok(`คลิกที่มอนแล้วเข้าตีเอง: ${clickTarget.name} HP ${clickTarget.hp0} → ${clickTarget.hp1} (มีกรอบเป้าหมาย)`);
} else bad('คลิกที่มอนแล้วไม่เข้าตี', JSON.stringify(clickTarget));

/* ── 6e. แผนที่ใหม่: ไทล์และเขตใหม่ครบ ── */
const mapTest = await page.evaluate(() => {
  const W = window.__GRIAN__.state.world;
  const c = {};
  for (let i = 0; i < W.tiles.length; i++) c[W.tiles[i]] = (c[W.tiles[i]] || 0) + 1;
  return {
    shallow: c[13] || 0, tallgrass: c[14] || 0, stonepath: c[15] || 0, bridge: c[16] || 0,
    grave: c[17] || 0, statue: c[18] || 0, barrel: c[19] || 0, lamp: c[20] || 0,
    chestTile: c[21] || 0, cave: c[22] || 0, well: c[23] || 0,
    chests: W.chests.length, signs: W.signs.length,
    regions: ['village', 'graveyard', 'cave', 'tallgrass', 'shore', 'field']
      .filter((r) => {
        for (let i = 0; i < 400; i++) {
          const x = Math.random() * W.w * 16, y = Math.random() * W.h * 16;
          if (W.regionAt(x, y) === r) return true;
        }
        return false;
      }),
  };
});
const mapOk = mapTest.shallow > 100 && mapTest.tallgrass > 50 && mapTest.bridge > 10
  && mapTest.grave > 15 && mapTest.chestTile === mapTest.chests && mapTest.chests >= 5
  && mapTest.cave > 0 && mapTest.well > 0;
if (mapOk) {
  ok(`แผนที่ใหม่ครบ: น้ำตื้น ${mapTest.shallow} · หญ้าสูง ${mapTest.tallgrass} · ทางหิน ${mapTest.stonepath} · `
    + `สะพาน ${mapTest.bridge} · หลุมศพ ${mapTest.grave} · หีบ ${mapTest.chests} · ถ้ำ ${mapTest.cave} · ป้าย ${mapTest.signs}`);
  ok(`โซนที่ตรวจพบ: ${mapTest.regions.join(' · ')}`);
} else bad('ไทล์ใหม่ในแผนที่ไม่ครบ', JSON.stringify(mapTest));

/* ── 7. ตีมอน + particle (และตรวจว่า Particles.update ทำงานจริง) ── */
const combat = await page.evaluate(async (isolateSrc) => {
  const isolate = eval(isolateSrc);
  const G = window.__GRIAN__;
  const S = G.state;
  const p = S.player;
  const m = S.monsters.find((x) => !x.dead && !x.boss);
  if (!m) return { err: 'ไม่พบมอน' };
  isolate(m);
  p.hp = p.maxHp; p.dead = false;
  m.dead = false; m.hp = m.maxHp; m.stun = 0; m.defv = m.defv ?? m.def;
  m.x = p.x + 16; m.y = p.y;
  const hp0 = m.hp;
  G.Particles.clear();
  for (let i = 0; i < 4; i++) {
    S.player.attackCd = 0;
    G.handlers.onAttack();
    await new Promise((r) => setTimeout(r, 40));
  }
  const tracked = [];
  G.Particles.pool.forEach((pt, idx) => {
    if (pt.on && !pt.pulse) tracked.push({ idx, life0: pt.life });
  });
  const partsPeak = tracked.length;
  await new Promise((r) => setTimeout(r, 1200));
  const partsAfterDecay = tracked.filter((t) => {
    const pt = G.Particles.pool[t.idx];
    return pt.on && pt.life > 0 && pt.life <= t.life0;
  }).length;
  return { hp0, hp1: m.hp, partsPeak, partsAfterDecay, name: m.name };
}, ISOLATE_FN);
if (combat.err) bad('ทดสอบการต่อสู้', combat.err);
else {
  if (combat.hp1 < combat.hp0) ok(`โจมตีมอนได้: ${combat.name} HP ${combat.hp0} → ${combat.hp1}`);
  else bad('โจมตีแล้วมอนเลือดไม่ลด', JSON.stringify(combat));
  if (combat.partsPeak > 0 && combat.partsAfterDecay < combat.partsPeak) {
    ok(`ระบบ particle สร้างและสลายตัวตามฟิสิกส์จริง (peak ${combat.partsPeak} → เหลือ ${combat.partsAfterDecay})`);
  } else bad('Particles.update ไม่ทำงานหรืออนุภาคไม่สลายตัว', JSON.stringify(combat));
}

/* ── 8. มอนระดับ elite ── */
const elite = await page.evaluate(() => {
  const S = window.__GRIAN__.state;
  const found = S.monsters.find((x) => x.elite);
  if (!found) return { forced: false };
  return { forced: true, name: found.name, hp: found.maxHp, base: found.def.hp, aura: found.aura };
});
if (elite.forced) {
  const boosted = elite.hp > elite.base;
  if (boosted && /\(/.test(elite.name)) ok(`มอน elite ทำงาน: ${elite.name} HP ${elite.base} → ${elite.hp} (ออร่า ${elite.aura})`);
  else bad('มอน elite ไม่ได้เพิ่มค่าสเตตัส', JSON.stringify(elite));
} else {
  ok('ไม่พบ elite จากการสุ่มในเวลาที่กำหนด (โอกาส 14% — ไม่ถือว่าเป็นบั๊ก)');
}

/* ── 8b. จับสัตว์เลี้ยง ── */
const capTest = await page.evaluate(async () => {
  const G = window.__GRIAN__;
  const S = G.state, p = S.player;
  const m = S.monsters.find((x) => !x.dead && !x.boss && x.id !== 'ghost');
  if (!m) return { err: 'ไม่พบมอนให้จับ' };
  m.x = p.x + 22; m.y = p.y;
  m.hp = 1;
  S.targetMonster = m;
  p.inv.push({ id: 'capture_ball', qty: 25 });

  const before = S.pets.length;
  let tries = 0, sawShakes = false, chance = null;
  while (S.pets.length === before && tries < 15) {
    tries++;
    const ballBefore = p.inv.find((s) => s.id === 'capture_ball')?.qty || 0;
    G.beginCapture(m);
    if (!S.capture) break;
    chance = S.capture.result.chance;
    for (let i = 0; i < 60 && S.capture; i++) {
      await new Promise((r) => setTimeout(r, 40));
      if (S.capture && S.capture.lastShake >= 0) sawShakes = true;
    }
    const ballAfter = p.inv.find((s) => s.id === 'capture_ball')?.qty || 0;
    if (ballAfter === ballBefore) break;
    if (S.pets.length === before) { m.hp = 1; m.dead = false; m.stun = 0; S.targetMonster = m; }
  }
  const pet = S.pets[0];
  return {
    before, after: S.pets.length, tries, sawShakes,
    chance: chance ? +(chance * 100).toFixed(0) : null,
    pet: pet ? { nick: pet.nickname, sp: pet.species.name, rarity: pet.rarity.name, lvl: pet.lvl, hp: pet.maxHp, atk: pet.atk } : null,
    hudShown: !document.getElementById('pet-hud').classList.contains('hidden'),
  };
});
if (capTest.err) bad('จับสัตว์เลี้ยง', capTest.err);
else if (capTest.after > capTest.before && capTest.pet) {
  ok(`จับสัตว์เลี้ยงสำเร็จ (ครั้งที่ ${capTest.tries}, โอกาส ${capTest.chance}%) → ${capTest.pet.sp} `
    + `(${capTest.pet.rarity}) ชื่อ "${capTest.pet.nick}" Lv.${capTest.pet.lvl} HP ${capTest.pet.hp} ATK ${capTest.pet.atk}`);
  if (capTest.sawShakes) ok('มีอนิเมชัน "ดิ้น 3 ครั้ง" ก่อนตัดสินผล');
  else bad('ไม่พบอนิเมชันดิ้น');
  if (capTest.hudShown) ok('แถบสัตว์เลี้ยงใน HUD แสดงขึ้นมา');
  else bad('แถบสัตว์เลี้ยงไม่แสดง');
} else bad('จับสัตว์เลี้ยงไม่สำเร็จ', JSON.stringify(capTest));

/* ── 8c. สัตว์เลี้ยงเดินตามและช่วยตี ── */
const petAiTest = await page.evaluate(async () => {
  const G = window.__GRIAN__;
  const S = G.state, p = S.player;
  if (!S.pets.length) return { err: 'ไม่มีสัตว์เลี้ยง' };
  const pet = S.pets[0];
  p.activePet = pet.uid;
  pet.ko = false; pet.hp = pet.maxHp;

  p.x = S.world.spawn.x; p.y = S.world.spawn.y;
  p.prevX = p.x; p.prevY = p.y; p.path = null;
  pet.x = p.x + 16; pet.y = p.y; pet.stuckT = 0;
  const startDist = Math.hypot(pet.x - p.x, pet.y - p.y);
  p.x += 150;
  p.prevX = p.x; p.prevY = p.y;
  const peak = Math.hypot(pet.x - p.x, pet.y - p.y);
  let followed = false;
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 80));
    const d = Math.hypot(pet.x - p.x, pet.y - p.y);
    if (d < Math.min(85, peak * 0.5)) { followed = true; break; }
  }
  const endDist = Math.hypot(pet.x - p.x, pet.y - p.y);

  pet.x = p.x + 16; pet.y = p.y;
  const m = S.monsters.find((x) => !x.dead && !x.boss);
  if (!m) return { followed, startDist: +startDist.toFixed(0), endDist: +endDist.toFixed(0), err: 'ไม่พบมอน' };
  m.x = pet.x + 14; m.y = pet.y; m.stun = 5;
  m.hp = m.maxHp;
  pet.atkCd = 0;
  const hp0 = m.hp;
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 100));
    if (m.hp < hp0 || m.dead) break;
  }
  return {
    followed, startDist: +startDist.toFixed(0), endDist: +endDist.toFixed(0),
    hp0, hp1: m.hp, petKills: pet.kills, petExp: Math.floor(pet.exp),
  };
});
if (petAiTest.err && !petAiTest.followed) bad('สัตว์เลี้ยง', petAiTest.err);
else {
  if (petAiTest.followed) ok(`สัตว์เลี้ยงเดินตามเจ้าของ (ห่าง ${petAiTest.startDist}px → ${petAiTest.endDist}px)`);
  else bad('สัตว์เลี้ยงไม่เดินตาม', JSON.stringify(petAiTest));
  if (petAiTest.hp1 !== undefined && petAiTest.hp1 < petAiTest.hp0) {
    ok(`สัตว์เลี้ยงช่วยตีมอนจริง (HP ${petAiTest.hp0} → ${petAiTest.hp1})`);
  } else bad('สัตว์เลี้ยงไม่ช่วยตี', JSON.stringify(petAiTest));
}

/* ── 8d. เปิดหีบสมบัติ ── */
const chestTest = await page.evaluate(async () => {
  const G = window.__GRIAN__;
  const S = G.state;
  const c = S.world.chests.find((x) => !x.opened);
  if (!c) return { err: 'ไม่พบหีบที่ยังไม่เปิด' };
  S.player.x = c.x + 12; S.player.y = c.y + 8;
  S.player.prevX = S.player.x; S.player.prevY = S.player.y;
  S.player.path = null;
  await new Promise((r) => setTimeout(r, 250));
  const gold0 = S.player.gold;
  const inv0 = S.player.inv.reduce((a, s) => a + s.qty, 0);
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'e', bubbles: true }));
  await new Promise((r) => setTimeout(r, 500));
  return {
    opened: c.opened, goldGain: S.player.gold - gold0,
    itemGain: S.player.inv.reduce((a, s) => a + s.qty, 0) - inv0,
    tileAfter: S.world.get(c.tx, c.ty),
    totalChests: S.world.chests.length,
  };
});
if (chestTest.err) bad('หีบสมบัติ', chestTest.err);
else if (chestTest.opened && chestTest.goldGain > 0) {
  ok(`เปิดหีบสมบัติได้ (+${chestTest.goldGain} เงิน, ของ ${chestTest.itemGain} ชิ้น, ไทล์กลายเป็นหญ้าแล้ว)`);
} else bad('เปิดหีบสมบัติไม่ทำงาน', JSON.stringify(chestTest));

/* ── 8e. เอฟเฟกต์สกิล (VFX) ── */
const vfxTest = await page.evaluate(async () => {
  const G = window.__GRIAN__;
  const S = G.state, p = S.player;
  const m = S.monsters.find((x) => !x.dead && !x.boss);
  if (m) { m.x = p.x + 34; m.y = p.y; S.targetMonster = m; }
  const results = [];
  for (const id of p.cls.skills) {
    p.cooldowns[id] = 0; p.mp = p.maxMp; p.hp = p.maxHp;
    const before = G.VFX.count();
    G.handlers.onSkill(id);
    await new Promise((r) => setTimeout(r, 90));
    results.push({ id, spawned: G.VFX.count() - before });
    await new Promise((r) => setTimeout(r, 350));
  }
  return {
    results,
    bannerShown: document.getElementById('skill-banner').classList.contains('show'),
    bannerText: document.getElementById('skill-banner').textContent,
  };
});
const vfxOk = vfxTest.results.every((r) => r.spawned > 0);
if (vfxOk) {
  ok(`เอฟเฟกต์สกิลถูกสร้างครบทุกท่า: ${vfxTest.results.map((r) => `${r.id}+${r.spawned}`).join(' · ')}`);
} else bad('บางสกิลไม่สร้างเอฟเฟกต์', JSON.stringify(vfxTest.results));
if (vfxTest.bannerText) ok(`ป้ายชื่อสกิลแสดงตอนร่าย: "${vfxTest.bannerText}"`);
else bad('ป้ายชื่อสกิลไม่แสดง');

/* ── 8f. โหมด AUTO ── */
const autoTest = await page.evaluate(async (gatherSrc) => {
  const gather = eval(gatherSrc);
  const G = window.__GRIAN__;
  const S = G.state, p = S.player;
  p.hp = p.maxHp; p.mp = p.maxMp; p.dead = false;
  const placed = gather(5, 55);
  p.path = null; S.targetMonster = null;
  const kills0 = p.kills_total;
  const autoKills0 = p.ctr.autoKills || 0;

  G.handlers.onToggleAuto();
  await new Promise((r) => setTimeout(r, 120));
  const turnedOn = G.Auto.on;
  const btnOn = document.getElementById('btn-auto').classList.contains('on');
  const st0 = G.Auto.st;
  await new Promise((r) => setTimeout(r, 4500));
  const st1 = G.Auto.st;
  const kills1 = p.kills_total;
  const autoKills1 = (p.ctr.autoKills || 0) - autoKills0;
  const statusText = document.getElementById('auto-status').textContent;

  G.handlers.onToggleAuto();
  await new Promise((r) => setTimeout(r, 400));
  const offNow = !G.Auto.on;
  const targetCleared = S.targetMonster === null;
  const pathCleared = !p.path;
  const btnOff = !document.getElementById('btn-auto').classList.contains('on');

  return {
    placed, turnedOn, btnOn, btnOff, st0, st1, statusText,
    kills0, kills1, autoKills1, offNow, targetCleared, pathCleared,
    autoTime: Math.floor(p.ctr.autoTime || 0),
  };
}, GATHER_FN);
if (autoTest.turnedOn && autoTest.btnOn) {
  ok(`เปิดโหมด AUTO ได้ (สถานะ: ${autoTest.st0} → ${autoTest.st1}, ปุ่มแสดง "${autoTest.statusText}")`);
} else bad('เปิด AUTO แล้วปุ่มไม่เปลี่ยนสถานะ', JSON.stringify(autoTest));
if (autoTest.kills1 > autoTest.kills0 && autoTest.autoKills1 > 0) {
  ok(`AUTO เล่นให้เองจริง: สังหาร ${autoTest.kills1 - autoTest.kills0} ตัวใน 4.5 วินาที `
    + `(นับเป็น auto ${autoTest.autoKills1} ตัว) โดยไม่มีการกดปุ่มเลย`);
} else bad('AUTO ไม่ได้สังหารมอนให้เอง', JSON.stringify(autoTest));
if (autoTest.offNow && autoTest.targetCleared && autoTest.pathCleared && autoTest.btnOff) {
  ok('ปิด AUTO แล้วล้างเป้าหมาย/เส้นทาง และปุ่มกลับสู่สถานะปิด');
} else bad('ปิด AUTO แล้วสถานะไม่ถูกเคลียร์', JSON.stringify(autoTest));

/* ── 8g. AUTO กินยาให้เองเมื่อเลือดน้อย ── */
const autoPotTest = await page.evaluate(async (gatherSrc) => {
  const gather = eval(gatherSrc);
  const G = window.__GRIAN__;
  const S = G.state, p = S.player;
  gather(4, 70);
  p.dead = false;
  p.inv = p.inv.filter((s) => s.id !== 'hp_potion');
  p.inv.push({ id: 'hp_potion', qty: 5 });
  p.hp = p.maxHp * 0.18;
  const before = p.inv.find((s) => s.id === 'hp_potion')?.qty || 0;
  G.handlers.onToggleAuto();
  await new Promise((r) => setTimeout(r, 1600));
  const after = p.inv.find((s) => s.id === 'hp_potion')?.qty || 0;
  const hpRatio = +(p.hp / p.maxHp).toFixed(2);
  const st = G.Auto.st;
  G.handlers.onToggleAuto();
  return { before, after, hpRatio, st, dead: p.dead };
}, GATHER_FN);
if (autoPotTest.after < autoPotTest.before) {
  ok(`AUTO กินยาให้เองเมื่อเลือดน้อย (ยา ${autoPotTest.before} → ${autoPotTest.after} ขวด, `
    + `เลือดกลับมา ${(autoPotTest.hpRatio * 100).toFixed(0)}%)`);
} else bad('AUTO ไม่กินยาให้', JSON.stringify(autoPotTest));

/* ── 9. เลเวลอัพ ── */
const levelTest = await page.evaluate(() => {
  const S = window.__GRIAN__.state;
  S.player.exp += 100000;
  window.__GRIAN__.state.onLevelUpCheck?.();
  return { lvl: S.player.lvl, maxHp: S.player.maxHp };
});
if (levelTest.lvl > 1) ok(`เลเวลอัพทำงาน: Lv.${levelTest.lvl} (HP สูงสุด ${levelTest.maxHp})`);
else bad('ให้ EXP แล้วไม่ขึ้นเลเวล');

/* ── 9.5. อาชีพขั้นสูง Lv.10 ── */
await page.waitForTimeout(1400);
const advOffered = await page.evaluate(() => ({
  shown: !document.getElementById('advance').classList.contains('hidden'),
  lvl: window.__GRIAN__.state.player.lvl,
  cards: document.querySelectorAll('#adv-grid .adv-card').length,
  locked: window.__GRIAN__.state.inputLocked,
  paused: window.__GRIAN__.state.paused,
}));
if (advOffered.shown && advOffered.cards === 2 && advOffered.locked && advOffered.paused) {
  ok(`ถึง Lv.${advOffered.lvl} กล่องเลือกอาชีพขั้นสูงเด้ง + หยุดเกมค้าง (กด Esc หนีไม่ได้)`);
} else bad('กล่องเลือกอาชีพขั้นสูงไม่เด้ง', JSON.stringify(advOffered));

const advChosen = await page.evaluate(() => {
  const G = window.__GRIAN__;
  document.querySelector('#adv-grid .adv-card').click();
  return {
    advId: G.state.player.advId,
    name: G.state.player.adv?.name || null,
    hotSlots: G.UI.slots.length,
    paused: G.state.paused,
  };
});
if (advChosen.advId && advChosen.name && !advChosen.paused) {
  ok(`เลือกอาชีพขั้นสูง "${advChosen.name}" (ฮอตบาร์มี ${advChosen.hotSlots} ช่อง — เกมเล่นต่อได้)`);
} else bad('เลือกอาชีพขั้นสูงไม่ลง', JSON.stringify(advChosen));

const advSkill = await page.evaluate(() => {
  const G = window.__GRIAN__;
  const adv = G.state.player.adv;
  if (!adv) return { ok: false };
  const r = G.handlers.onSkill(adv.skill);
  return { ok: r?.ok !== false, id: adv.skill, cd: G.state.player.cooldowns[adv.skill] > 0 };
});
if (advSkill.ok && advSkill.cd) ok(`สกิลของอาชีพขั้นสูง (${advSkill.id}) ร่ายได้`);
else bad('สกิลอาชีพขั้นสูงใช้ไม่ได้', JSON.stringify(advSkill));

const advTwice = await page.evaluate(() => {
  const r = window.__GRIAN__.advanceClass(window.__GRIAN__.state, window.__GRIAN__.state.player.advId);
  return { ok: r.ok, msg: r.msg };
});
if (!advTwice.ok) ok(`เลือกสาขาซ้ำไม่ได้ ("${advTwice.msg}")`);
else bad('เลือกสาขาซ้ำได้');

const advGuard = await page.evaluate(() => {
  const G = window.__GRIAN__;
  const p = G.state.player;
  const oldLvl = p.lvl; p.lvl = 3;
  const r = G.advanceClass(G.state, 'dc');
  p.lvl = oldLvl;
  return { wrongBranch: r.ok };
});
if (!advGuard.wrongBranch) ok('เลือกสาขาของอาชีพอื่นไม่ได้');
else bad('guard เลือกสาขา', JSON.stringify(advGuard));

/* ── 10. แพเนลทั้งหมด (รวมแพเนลใหม่ social 'v') ── */
for (const [key, name] of [['i', 'inv'], ['k', 'skill'], ['g', 'gacha'], ['q', 'quest'],
  ['p', 'pet'], ['v', 'social'], ['j', 'ach'], ['c', 'stats'], ['o', 'settings'], ['h', 'help']]) {
  await page.keyboard.press(key);
  await page.waitForTimeout(200);
  const open = await page.evaluate((n) => document.getElementById('panel-' + n).classList.contains('open'), name);
  const len = await page.evaluate((n) => document.getElementById('panel-' + n).innerText.trim().length, name);
  if (open && len > 20) ok(`แพเนล ${name} เปิดได้และมีเนื้อหา (${len} ตัวอักษร)`);
  else bad(`แพเนล ${name}`, `open=${open} len=${len}`);
  if (name === 'ach' || name === 'settings' || name === 'inv' || name === 'pet' || name === 'social') {
    await shot(`10-panel-${name}.png`);
  }
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
}

/* ── 11. ตั้งค่า: มีครบและบันทึกได้ ── */
const settings = await page.evaluate(() => {
  const S = window.__GRIAN__.Settings;
  const before = S.get('shake');
  S.set('shake', 1.6);
  const saved = JSON.parse(localStorage.getItem('grian_settings_v1') || '{}');
  S.set('shake', before);
  return { rows: document.querySelectorAll('#settings-list .set-row').length, persisted: saved.shake };
});
if (settings.rows >= 10 && settings.persisted === 1.6) ok(`แพเนลตั้งค่ามี ${settings.rows} รายการ และบันทึกลง localStorage ได้`);
else bad('การตั้งค่าไม่ทำงาน', JSON.stringify(settings));

/* ── 12. ความสำเร็จ ── */
const ach = await page.evaluate(() => {
  const p = window.__GRIAN__.state.player;
  return { unlocked: Object.keys(p.unlocked || {}).length };
});
await page.keyboard.press('j');
await page.waitForTimeout(200);
const achRows = await page.locator('#ach-list .ach-row').count();
await page.keyboard.press('Escape');
if (achRows >= 28) ok(`แพเนลความสำเร็จแสดง ${achRows} รายการ (ปลดล็อกแล้ว ${ach.unlocked})`);
else bad('รายการความสำเร็จน้อยเกินไป', String(achRows));

/* ── 13. กาชา ── */
const gacha = await page.evaluate(() => {
  const S = window.__GRIAN__.state;
  S.player.gems = 5000;
  const g0 = S.player.gems;
  window.__GRIAN__.handlers.onGacha(10);
  return { g0, g1: S.player.gems, pity: S.player.pity, pulls: S.player.totalPulls };
});
if (gacha.pulls === 10) ok(`กาชาเปิด 10 ครั้งได้ (เพชร ${gacha.g0} → ${gacha.g1}, pity ${gacha.pity})`);
else bad('กาชาไม่ทำงาน', JSON.stringify(gacha));

/* ── 14. อัพเกรดอุปกรณ์ + สเตตัสเพิ่มจริง + ยันต์กันแตก + ออร่า ── */
const upgrade = await page.evaluate(() => {
  const G = window.__GRIAN__;
  const S = G.state;
  const p = S.player;
  p.inv.push({ id: 'sword_cyber', qty: 1 });
  G.handlers.onEquipItem('sword_cyber');
  p.equip.weapon.lvl = 0;
  const atkBase = p.atk;
  p.inv.push({ id: 'upgrade_stone', qty: 60 });
  p.gold = 99999;

  // ทดสอบหลอมยันต์กันแตก
  const craftRes = G.craftProtectCharm(S);
  p.inv.push({ id: 'protect_charm', qty: 20 });

  let maxLvl = 0;
  for (let i = 0; i < 30; i++) {
    G.handlers.onUpgrade('weapon');
    const w = p.equip.weapon;
    if (!w) break;
    maxLvl = Math.max(maxLvl, w.lvl || 0);
  }
  const atkAfter = p.atk;
  const aura = G.playerAura(p);
  // ทดสอบออร่าครบทั้ง 3 ขั้น (+7 ออร่าฟ้า, +9 ออร่าทอง, +10 ออร่าม่วงราชันย์)
  const w = p.equip.weapon;
  const savedLvl = w.lvl;
  w.lvl = 4; const a4 = G.playerAura(p)?.name || null;
  w.lvl = 5; const a5 = G.playerAura(p)?.name || null;
  w.lvl = 7; const a7 = G.playerAura(p)?.name || null;
  w.lvl = 9; const a9 = G.playerAura(p)?.name || null;
  w.lvl = 10; G.recalcPlayer(p); const a10 = G.playerAura(p)?.name || null; const atk10 = p.atk;
  w.lvl = savedLvl; G.recalcPlayer(p);
  return {
    craftOk: craftRes.ok,
    maxLvl,
    atkBase,
    atkAfter,
    atk10,
    aura: aura ? aura.name : null,
    aurasOk: a4 === null && a5 === 'ออร่าฟ้า' && a7 === 'ออร่าม่วง' && a9 === 'ออร่าทอง' && a10 === 'ออร่าเทพเซิร์ฟเถื่อน',
    a5, a7, a9, a10,
    fails: p.ctr.upgradeFail || 0,
    ok: p.ctr.upgradeOk || 0,
    charmSaved: p.ctr.charmSaved || 0,
    stillEquipped: !!p.equip.weapon,
  };
});
if (upgrade.craftOk && (upgrade.ok > 0 || upgrade.fails > 0) && upgrade.atkAfter > upgrade.atkBase && upgrade.stillEquipped) {
  ok(`ระบบอัพเกรด + ยันต์กันแตกทำงาน (สูงสุด +${upgrade.maxLvl}, ATK ${upgrade.atkBase} → ${upgrade.atkAfter}, ออร่า: ${upgrade.aura || 'ยัง'}, ยันต์ช่วยชีวิต ${upgrade.charmSaved} ครั้ง)`);
} else bad('อัพเกรดหรือยันต์กันแตกไม่ทำงาน', JSON.stringify(upgrade));
if (upgrade.aurasOk && upgrade.atk10 > upgrade.atkBase) {
  ok(`ออร่าอาวุธตีบวกครบทั้ง 4 ระดับ (+5 ${upgrade.a5} · +7 ${upgrade.a7} · +9 ${upgrade.a9} · +10 ${upgrade.a10}, ATK ที่ +10 = ${upgrade.atk10})`);
} else bad('ออร่าอาวุธตีบวกไม่ครบ 3 ระดับ', JSON.stringify(upgrade));

/* ── 15. เควสต์ ── */
const quest = await page.evaluate(() => {
  window.__GRIAN__.handlers.onAcceptQuest('q_rat');
  const S = window.__GRIAN__.state;
  return { has: !!S.player.quests['q_rat'], state: S.player.quests['q_rat']?.state };
});
if (quest.has) ok(`รับเควสต์ได้ (สถานะ ${quest.state})`);
else bad('รับเควสต์ไม่ได้');

/* ── 16. แชท + NPC ── */
const chatCount = await page.evaluate(() => window.__GRIAN__.state.chat.length);
if (chatCount > 3) ok(`แชทโลกมีข้อความ ${chatCount} บรรทัด`);
else bad('แชทโลกไม่ทำงาน', String(chatCount));

await page.evaluate(() => {
  const S = window.__GRIAN__.state;
  const npc = S.npcs.find((n) => n.id === 'elder');
  S.player.x = npc.x + 10; S.player.y = npc.y;
});
await page.keyboard.press('e');
await page.waitForTimeout(400);
const dlgOpen = await page.evaluate(() => !document.getElementById('dialog').classList.contains('hidden'));
if (dlgOpen) ok('คุยกับ NPC ได้ (ไดอะล็อกเปิด)');
else bad('กด E แล้วไดอะล็อก NPC ไม่เปิด');
await shot('04-dialog.png');
await page.keyboard.press('Escape');

/* ── 16b. ระบบใหม่ v1.0.0: ปาร์ตี้บอท · บัฟกิลด์ · โหมด PK · หอคอยบั๊ก ── */
const socialTest = await page.evaluate(async () => {
  const G = window.__GRIAN__;
  const S = G.state, p = S.player;
  S.inputLocked = false; S.paused = false;
  p.gold = 50000;

  // 1) ชวนบอทเข้าตี้
  const bot = S.bots.find((b) => !b.afk);
  const pRes = G.togglePartyBot(S, bot._uid);
  // 2) รับบัฟกิลด์
  const gRes = G.applyGuildBuff(S, 'atk');
  // 3) เปิดโหมด PK ท้าดวลบอท
  G.handlers.onChallengeBot();
  const hostileBot = S.bots.find((b) => b.hostile && !b.inParty);
  let pvpWins0 = p.ctr.pvpWins || 0;
  if (hostileBot) {
    hostileBot.hp = 1;
    hostileBot.x = p.x + 12; hostileBot.y = p.y;
    S.player.attackCd = 0;
    G.handlers.onAttack();
    await new Promise((r) => setTimeout(r, 180));
  }
  const pvpWins1 = p.ctr.pvpWins || 0;
  G.handlers.onTogglePvp(); // ปิด PK

  // 4) เริ่มหอคอยบั๊ก ชั้นที่ 1 แล้วเคลียร์เวฟ
  const tRes = G.startTowerFloor(S);
  const waveList = S.monsters.filter((m) => !m.dead && m.towerWave);
  const waveCount = waveList.length;
  for (const m of waveList) {
    if (!m.dead) {
      m.hp = 1; m.stun = 5;
      m.x = p.x + 10; m.y = p.y;
      S.player.attackCd = 0;
      G.handlers.onAttack();
      await new Promise((r) => setTimeout(r, 120));
    }
  }
  // 5) ทดสอบยศ PvP ครบทั้ง 5 ระดับ (ชนะ 0, 1, 3, 5, 10 ครั้ง -> โบนัส ATK +0, +4, +10, +18, +30)
  const savedWins = p.ctr.pvpWins || 0;
  const rankAtks = [];
  for (const w of [0, 1, 3, 6, 10]) {
    p.ctr.pvpWins = w;
    G.recalcPlayer(p);
    rankAtks.push(p.atk);
  }
  p.ctr.pvpWins = savedWins;
  G.recalcPlayer(p);
  const rankDiffs = rankAtks.map((v) => v - rankAtks[0]);
  const ranksOk = rankDiffs[0] === 0 && rankDiffs[1] === 2 && rankDiffs[2] === 5 && rankDiffs[3] === 9 && rankDiffs[4] === 15;
  return {
    partyJoined: pRes.ok && pRes.joined && p.partyCount === 1,
    guildBuffOk: gRes.ok,
    pvpWon: pvpWins1 > pvpWins0,
    ranksOk,
    rankDiffs,
    towerStarted: tRes.ok && waveCount > 0,
    towerClearedFloor: p.ctr.towerFloor || 0,
  };
});
if (socialTest.partyJoined && socialTest.guildBuffOk) {
  ok('ระบบปาร์ตี้บอทจำลองและบัฟกิลด์ทำงานจริง');
} else bad('ระบบปาร์ตี้หรือบัฟกิลด์ไม่ทำงาน', JSON.stringify(socialTest));
if (socialTest.pvpWon && socialTest.ranksOk) {
  ok(`ระบบประลอง PvP และยศ PvP ครบ 5 ระดับทำงานจริง (โบนัส ATK ตามยศ: +${socialTest.rankDiffs.join(' / +')})`);
} else bad('ระบบ PvP หรือยศ PvP 5 ระดับไม่ทำงาน', JSON.stringify(socialTest));
if (socialTest.towerStarted && socialTest.towerClearedFloor >= 1) {
  ok(`ระบบดันเจี้ยนหอคอยบั๊กทำงานจริง (เคลียร์ถึงชั้น ${socialTest.towerClearedFloor})`);
} else bad('ระบบหอคอยบั๊กไม่ทำงาน', JSON.stringify(socialTest));

/* ── 17. บอสโลก + ท่า telegraph ── */
const bossTest = await page.evaluate(async () => {
  const S = window.__GRIAN__.state;
  S.boss.nextAt = 0;
  await new Promise((r) => setTimeout(r, 700));
  const b = S.boss.entity;
  if (!b) return { spawned: false };
  b.abilCd = 0;
  S.player.x = b.x + 40; S.player.y = b.y;
  S.player.prevX = S.player.x; S.player.prevY = S.player.y;
  let sawTelegraph = false, abilId = null;
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 50));
    if (b.abil && b.abil.phase === 'tell') { sawTelegraph = true; abilId = b.abil.id; }
    if (!b.abil && sawTelegraph) break;
  }
  return { spawned: true, hp: b.maxHp, sawTelegraph, abilId };
});
if (bossTest.spawned) {
  ok(`บอสโลกเกิดได้ (HP ${bossTest.hp})`);
  if (bossTest.sawTelegraph) ok(`บอสมี mechanic: ร่ายท่า "${bossTest.abilId}" พร้อมช่วง telegraph ให้หลบ`);
  else bad('บอสไม่มีการร่ายท่า');
} else bad('บอสโลกไม่เกิด');

/* ── 18. ตาย + บทลงโทษ ── */
const death = await page.evaluate(async () => {
  const S = window.__GRIAN__.state;
  S.player.hp = 1; S.player.def = 0;
  S.player.exp = 10000;
  const m = S.monsters.find((x) => !x.dead && x.def.ai && x.def.ai !== 'none') || S.monsters.find((x) => !x.dead);
  if (m) { m.x = S.player.x + 8; m.y = S.player.y; m.atk = 9999; m.atkCd = 0; m.stun = 0; m.abil = null; }
  await new Promise((r) => setTimeout(r, 1400));
  return { dead: S.player.dead, usedAi: m?.def?.ai };
});
if (death.dead) ok('กลไกตายทำงาน');
else bad('เลือดหมดแล้วไม่ตาย');
await shot('05-death.png');

await page.click('#btn-respawn');
await page.waitForTimeout(400);
const respawn = await page.evaluate(() => ({
  alive: !window.__GRIAN__.state.player.dead,
  exp: window.__GRIAN__.state.player.exp,
}));
if (respawn.alive) ok(`ชุบชีวิตได้ และบทลงโทษทำงาน (EXP 10000 → ${respawn.exp})`);
else bad('ชุบแล้วยังตายอยู่');
if (respawn.exp < 10000) ok('บทลงโทษตัด EXP จริงตามที่เกมเขียนไว้');
else bad('บทลงโทษไม่ทำงาน');

/* ── 19. เซฟหลายช่อง ── */
const saveTest = await page.evaluate(() => {
  const S = window.__GRIAN__.state;
  S.player.gold = 12345;
  window.__GRIAN__.handlers.onSave(1);
  const raw = localStorage.getItem('grian_save_v2_slot1');
  const d = JSON.parse(raw || '{}');
  const slots = window.__GRIAN__.listSlots();
  return { saved: !!raw, gold: d.gold, v: d.v, exists1: slots[1].exists, name1: slots[1].name };
});
if (saveTest.saved && saveTest.gold === 12345 && saveTest.v === 2) {
  ok(`เซฟช่อง 2 ได้ (schema v${saveTest.v}, ${saveTest.name1}, ${saveTest.gold} เงิน)`);
} else bad('เซฟหลายช่องไม่ทำงาน', JSON.stringify(saveTest));

const exportTest = await page.evaluate(() => {
  document.getElementById('save-code').value = '';
  window.__GRIAN__.UI.el['btn-export'].click();
  const code = document.getElementById('save-code').value;
  return { len: code.length, head: code.slice(0, 12) };
});
if (exportTest.len > 50) ok(`ส่งออกโค้ดเซฟได้ (${exportTest.len} ตัวอักษร)`);
else bad('ส่งออกโค้ดเซฟไม่ทำงาน', JSON.stringify(exportTest));

/* ── 19b. คลิกช่องเซฟ "เล่นต่อ" ── */
await page.evaluate(() => { window.__GRIAN__.handlers.onQuitToTitle(); });
await page.waitForTimeout(400);
const titleBack = await page.evaluate(() => ({
  screen: window.__GRIAN__.state.screen,
  menuShown: !document.getElementById('title-menu').classList.contains('hidden'),
}));
if (titleBack.screen === 'title' && titleBack.menuShown) ok('กลับหน้าแรกได้ (เซฟอัตโนมัติ)');
else bad('กลับหน้าแรกไม่ตรงปก', JSON.stringify(titleBack));

const errBefore = consoleErrors.length;
await page.click('#slot-list .slot-row:not(.empty)');
await page.waitForSelector('#scr-play.active', { timeout: 8000 });
await page.waitForTimeout(600);
const contErr = consoleErrors.length - errBefore;
const cont = await page.evaluate(() => ({
  screen: window.__GRIAN__.state.screen,
  lvl: window.__GRIAN__.state.player.lvl,
}));
if (cont.screen === 'play' && contErr === 0) ok(`คลิกช่องเซฟ "เล่นต่อ" ทำงานไม่มี error (Lv.${cont.lvl})`);
else bad('คลิกช่องเซฟพัง หรือมี error', `screen=${cont.screen} errors=${contErr}`);

/* ── 19c. รูปตัวละครในการ์ดผู้เล่น ── */
const face2 = await page.evaluate(() => {
  const cv = document.getElementById('pc-face');
  const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
  let n = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++;
  return n;
});
if (face2 > 50) ok(`การ์ดผู้เล่นแสดงรูปตัวละคร (${face2} พิกเซล)`);
else bad('การ์ดผู้เล่นไม่มีรูปตัวละคร', String(face2));

/* ── 19d. สัตว์เลี้ยงอยู่ครบหลังเซฟ/เล่นต่อ ── */
const petBefore = await page.evaluate(() => {
  const S = window.__GRIAN__.state;
  return { n: S.pets.length, nick: S.pets[0]?.nickname || null, lvl: S.pets[0]?.lvl || 0 };
});
const petSave = await page.evaluate(() => {
  const S = window.__GRIAN__.state;
  S.player.gold = 777;
  window.__GRIAN__.handlers.onSave(1);
  const d = JSON.parse(localStorage.getItem('grian_save_v2_slot1') || '{}');
  return { hasPets: Array.isArray(d.pets), n: (d.pets || []).length, active: !!d.activePet };
});
if (petSave.hasPets && petSave.n === petBefore.n) {
  ok(`เซฟมีข้อมูลสัตว์เลี้ยง ${petSave.n} ตัว (active=${petSave.active})`);
} else bad('เซฟไม่มีข้อมูลสัตว์เลี้ยง', JSON.stringify({ petSave, petBefore }));

await page.evaluate(() => { window.__GRIAN__.handlers.onQuitToTitle(); });
await page.waitForTimeout(300);
await page.click('#slot-list .slot-row[data-slot="1"]');
await page.waitForSelector('#scr-play.active', { timeout: 8000 });
await page.waitForTimeout(500);
const petAfter = await page.evaluate(() => ({
  n: window.__GRIAN__.state.pets.length,
  nick: window.__GRIAN__.state.pets[0]?.nickname || null,
  active: window.__GRIAN__.state.player.activePet,
  gold: window.__GRIAN__.state.player.gold,
}));
if (petAfter.n === petBefore.n && petAfter.nick === petBefore.nick) {
  ok(`เล่นต่อแล้วสัตว์เลี้ยงยังอยู่ครบ (${petAfter.n} ตัว, "${petAfter.nick}")`);
} else bad('สัตว์เลี้ยงหายหลังเล่นต่อ', JSON.stringify({ petBefore, petAfter }));

/* ── 19e. exportSave ไม่ทับช่องเซฟ ── */
const exportTest2 = await page.evaluate(() => {
  const S = window.__GRIAN__.state;
  window.__GRIAN__.handlers.onSave(0);
  const savedGold = JSON.parse(localStorage.getItem('grian_save_v2_slot0') || '{}').gold;
  S.player.gold = 999999;
  document.getElementById('save-code').value = '';
  window.__GRIAN__.UI.el['btn-export'].click();
  const after = JSON.parse(localStorage.getItem('grian_save_v2_slot0') || '{}').gold;
  return { savedGold, after, codeLen: document.getElementById('save-code').value.length };
});
if (exportTest2.after === exportTest2.savedGold && exportTest2.codeLen > 50) {
  ok(`ส่งออกโค้ดเซฟไม่ได้ทับช่องเซฟ (ช่อง 1 ยังเป็น ${exportTest2.after} เงิน)`);
} else bad('ส่งออกโค้ดเซฟเขียนทับช่องเซฟ', JSON.stringify(exportTest2));

/* ── 19f. บรรยากาศกลางคืน: แสงอุ่น + หิ่งห้อย ── */
const night = await page.evaluate(async () => {
  const S = window.__GRIAN__.state;
  const G = window.__GRIAN__;
  G.DayNight.t = 0.0;
  await new Promise((r) => setTimeout(r, 1400));
  return {
    darkness: +G.DayNight.darkness().toFixed(2),
    lightSpots: S.world.lightSpots.length / 3 | 0,
    fireflies: G.Particles.pool.filter((p) => p.on && p.pulse).length,
  };
});
if (night.darkness > 0.5 && night.lightSpots > 0) {
  ok(`กลางคืนมีแหล่งแสง ${night.lightSpots} จุด + หิ่งห้อย ${night.fireflies} ตัว`);
} else bad('ระบบแสง/หิ่งห้อยกลางคืนไม่ทำงาน', JSON.stringify(night));
await shot('09-night.png');
await page.evaluate(() => { window.__GRIAN__.DayNight.t = 0.34; });

/* ── 19g. ตั้งค่าการสั่นกล้อง 4 ระดับมีผลต่างกัน ── */
const shakeTest = await page.evaluate(() => {
  const G = window.__GRIAN__;
  const measure = (val) => {
    G.Settings.set('shake', val);
    G.Camera.shakeT = 0; G.Camera.shakeMag = 0;
    G.Camera.kick(10, 0.2);
    const v = G.Camera.shakeMag;
    G.Camera.shakeT = 0; G.Camera.shakeMag = 0;
    return +v.toFixed(2);
  };
  const s0 = measure(0);
  const s05 = measure(0.5);
  const s1 = measure(1);
  const s16 = measure(1.6);
  G.Settings.set('shake', 1);
  return { s0, s05, s1, s16 };
});
if (shakeTest.s0 === 0 && shakeTest.s16 === 16 && shakeTest.s1 === 10 && shakeTest.s05 === 5) {
  ok(`ตั้งค่าการสั่นกล้องใช้ได้ทุก 4 ระดับ (ปิด=0 · เบา=${shakeTest.s05} · ปกติ=${shakeTest.s1} · มาก=${shakeTest.s16})`);
} else bad('ตั้งค่าการสั่นกล้องไม่ส่งผล', JSON.stringify(shakeTest));

/* ── 20. เมนูหยุดชั่วคราว ── */
const pauseTest = await page.evaluate(async () => {
  const S = window.__GRIAN__.state;
  window.__GRIAN__.handlers.onTogglePause();
  await new Promise((r) => setTimeout(r, 200));
  const t0 = S.time;
  await new Promise((r) => setTimeout(r, 1200));
  const t1 = S.time;
  const shown = !document.getElementById('pause').classList.contains('hidden');
  window.__GRIAN__.handlers.onTogglePause();
  return { advanced: +(t1 - t0).toFixed(3), shown };
});
if (pauseTest.shown && pauseTest.advanced < 0.05) ok(`เมนูหยุดชั่วคราวหยุดเวลาจริง (เวลาขยับ ${pauseTest.advanced} วินาที ใน 1.2 วินาทีจริง)`);
else bad('เมนูหยุดชั่วคราวไม่หยุดเวลา', JSON.stringify(pauseTest));

/* ── 21. ตัววัดประสิทธิภาพ ── */
await page.keyboard.press('F3');
await page.waitForTimeout(500);
const perfOn = await page.evaluate(() => ({
  on: document.getElementById('perfhud').classList.contains('on'),
  txt: document.getElementById('perfhud').innerText.slice(0, 60),
}));
if (perfOn.on && /FPS/.test(perfOn.txt)) ok(`ตัววัดประสิทธิภาพทำงาน: "${perfOn.txt.replace(/\n/g, ' ')}"`);
else bad('ตัววัดประสิทธิภาพไม่ทำงาน', JSON.stringify(perfOn));
await shot('08-perfhud.png');
await page.keyboard.press('F3');

/* ── 23.5. ดินแดนมาร (โซน 2) · ลาว · Portal ── */
await page.evaluate(() => {
  const S = window.__GRIAN__.state;
  S.player.hp = S.player.maxHp; S.player.dead = false;
});
await page.evaluate(() => window.__GRIAN__.travelTo('hell'));
await page.waitForTimeout(900);
const hell = await page.evaluate(() => {
  const G = window.__GRIAN__;
  const S = G.state;
  const kinds = {};
  for (const m of S.monsters) kinds[m.id] = (kinds[m.id] || 0) + 1;
  let lava = 0, ash = 0;
  const t = S.world.tiles;
  for (let i = 0; i < t.length; i++) { if (t[i] === G.T.LAVA) lava++; else if (t[i] === G.T.ASH) ash++; }
  return {
    mapId: S.mapId, hell: S.world.hell, zone: S.zoneName,
    monsters: S.monsters.length, kinds, npcs: S.npcs.map((n) => n.id),
    portals: S.world.portals.length, lava, ash,
  };
});
if (hell.hell && hell.monsters > 0 && hell.npcs.includes('hunter') && hell.portals === 1) {
  ok(`ดินแดนมารทำงาน: มอน ${hell.monsters} ตัว (imp ${hell.kinds.imp || 0} · skull ${hell.kinds.skull || 0}) · ลาว ${hell.lava} ไทล์ · NPC ${hell.npcs.join(',')}`);
} else bad('ดินแดนมารไม่ทำงาน', JSON.stringify(hell));
await shot('10-hell.png');

const lavaTest = await page.evaluate(async () => {
  const G = window.__GRIAN__;
  const S = G.state;
  const i = S.world.tiles.indexOf(G.T.LAVA);
  if (i < 0) return { ok: false };
  const tx = i % S.world.w, ty = (i - tx) / S.world.w;
  S.player.x = tx * 16 + 8; S.player.y = ty * 16 + 8;
  S.player.hp = 90; S.player.dead = false;
  await new Promise((r) => setTimeout(r, 1300));
  return { ok: true, hp0: 90, hp1: S.player.hp };
});
if (lavaTest.ok && lavaTest.hp1 < lavaTest.hp0) {
  ok(`ลาวเผาผู้เล่นจริง (HP ${lavaTest.hp0} → ${lavaTest.hp1.toFixed(0)})`);
} else bad('ลาวไม่ทำดาเมจ', JSON.stringify(lavaTest));

/* ── 23.6. แดนเซิร์ฟเถื่อน (โซน 3 — ใหม่ใน v1.0.0) · บ่อบั๊กไฟดูด · เควสต์ใหม่ ── */
await page.evaluate(() => window.__GRIAN__.travelTo('cyber'));
await page.waitForTimeout(900);
const cyber = await page.evaluate(async () => {
  const G = window.__GRIAN__;
  const S = G.state;
  const kinds = {};
  for (const m of S.monsters) kinds[m.id] = (kinds[m.id] || 0) + 1;
  let glitch = 0, floor = 0;
  const t = S.world.tiles;
  for (let i = 0; i < t.length; i++) {
    if (t[i] === G.T.GLITCH) glitch++;
    else if (t[i] === G.T.CYBERFLOOR) floor++;
  }
  // ทดสอบรับเควสต์ใหม่ของโซน 3
  G.handlers.onAcceptQuest('q_gpu');
  G.handlers.onAcceptQuest('q_glitch');
  // ทดสอบบ่อบั๊กไฟดูด
  const gi = S.world.tiles.indexOf(G.T.GLITCH);
  let glitchHurt = false;
  if (gi >= 0) {
    const tx = gi % S.world.w, ty = (gi - tx) / S.world.w;
    S.player.x = tx * 16 + 8; S.player.y = ty * 16 + 8;
    S.player.hp = 100; S.player.dead = false;
    await new Promise((r) => setTimeout(r, 1100));
    glitchHurt = S.player.hp < 100;
  }
  return {
    mapId: S.mapId, cyber: S.world.cyber, zone: S.zoneName,
    monsters: S.monsters.length, kinds, npcs: S.npcs.map((n) => n.id),
    glitch, floor, glitchHurt,
    hasQGpu: !!S.player.quests['q_gpu'],
    hasQGlitch: !!S.player.quests['q_glitch'],
  };
});
if (cyber.cyber && cyber.monsters > 0 && cyber.npcs.includes('dev_intern') && cyber.glitchHurt && cyber.hasQGpu && cyber.hasQGlitch) {
  ok(`แดนเซิร์ฟเถื่อน (แมพ 3) ทำงานครบ: มอน ${cyber.monsters} ตัว (botmon ${cyber.kinds.botmon || 0} · glitchbug ${cyber.kinds.glitchbug || 0} · whale ${cyber.kinds.whale || 0}) · บ่อบั๊กไฟดูด ${cyber.glitch} ไทล์ · รับเควสต์ใหม่ครบ`);
} else bad('แดนเซิร์ฟเถื่อน (แมพ 3) ไม่ครบ', JSON.stringify(cyber));
await shot('10-cyber.png');

// กลับแมพแรก
await page.evaluate(() => window.__GRIAN__.travelTo('field'));
await page.waitForTimeout(700);
const backHome = await page.evaluate(() => {
  const S = window.__GRIAN__.state;
  const kinds = {};
  for (const m of S.monsters) kinds[m.id] = (kinds[m.id] || 0) + 1;
  return { hell: S.world.hell, cyber: S.world.cyber, npcs: S.npcs.length, monsters: S.monsters.length, kinds };
});
if (!backHome.hell && !backHome.cyber && backHome.npcs >= 6 && backHome.monsters > 0 && !backHome.kinds.imp && !backHome.kinds.botmon) {
  ok(`เดินทางกลับแมพแรกปกติ (NPC ${backHome.npcs} · มอน ${backHome.monsters} ตัว)`);
} else bad('กลับแมพแรกมีปัญหา', JSON.stringify(backHome));

// ควบคุมแบบแตะ (มือถือ)
await page.evaluate(() => { window.__GRIAN__.Settings.set('touchControls', 'on'); });
await page.waitForTimeout(250);
const touchUi = await page.evaluate(() => ({
  bodyTouch: document.body.classList.contains('touch-mode'),
  uiShown: !document.getElementById('touch-ui').classList.contains('touch-hidden'),
  joystick: !!document.getElementById('joystick'),
  atkBtn: !!document.getElementById('btn-touch-atk'),
}));
if (touchUi.bodyTouch && touchUi.uiShown && touchUi.joystick && touchUi.atkBtn) {
  ok('ปุ่มบังคับแบบแตะแสดงเมื่อเปิดโหมดมือถือ (จอย + ปุ่มโจมตี + AUTO)');
} else bad('ปุ่มแตะไม่แสดง', JSON.stringify(touchUi));
await page.evaluate(() => { window.__GRIAN__.Settings.set('touchControls', 'off'); });
await page.waitForTimeout(200);
const touchOff = await page.evaluate(() => document.body.classList.contains('touch-mode'));
if (!touchOff) ok('ปิดโหมดแตะได้ (UI ซ่อน)');
else bad('โหมดแตะปิดไม่ลง');

/* ── 23.9. บอสเฟส 2 ── */
const bossP2 = await page.evaluate(async () => {
  const G = window.__GRIAN__;
  const S = G.state;
  S.paused = false;
  G.travelTo('field');
  await new Promise((r) => setTimeout(r, 700));
  S.boss.active = false; S.boss.entity = null; S.boss.nextAt = 0;
  await new Promise((r) => setTimeout(r, 600));
  const b = S.boss.entity;
  if (!b) return { ok: false };
  b.hp = b.maxHp * 0.6;
  await new Promise((r) => setTimeout(r, 1100));
  const stillP1 = !b.phase2;
  b.hp = b.maxHp * 0.4;
  await new Promise((r) => setTimeout(r, 400));
  return { ok: true, stillP1, phase2: b.phase2, atk: b.atk };
});
if (bossP2.ok && bossP2.stillP1 && bossP2.phase2) {
  ok(`บอสเฟส 2: เลือด <50% เข้าโหมดโกรธ (ATK ${bossP2.atk}) ท่าใหม่แรงขึ้น`);
} else bad('บอสเฟส 2 ไม่ทำงาน', JSON.stringify(bossP2));

/* ── 24. เต็มจอ · ออโต้เควสต์ · 3D lighting + 3D VFX + 3D Zoom ── */
const full = await page.evaluate(() => {
  const cv = document.getElementById('world');
  const st = document.getElementById('stage');
  const cr = cv.getBoundingClientRect(), sr = st.getBoundingClientRect();
  return {
    cw: Math.round(cr.width), ch: Math.round(cr.height),
    cover: cr.width >= sr.width - 1 && cr.height >= sr.height - 1,
    noScroll: document.documentElement.scrollHeight <= window.innerHeight + 1,
  };
});
if (full.cover && full.noScroll) ok(`เต็มจอ: แคนวาสเต็มจอ (${full.cw}×${full.ch} — ไม่มีขอบดำ/scrollbar)`);
else bad('แคนวาสไม่ได้เต็มจอ', JSON.stringify(full));

const aqBtn = await page.evaluate(() => {
  const G = window.__GRIAN__;
  G.handlers.onToggleAutoQuest();
  return { on: G.AutoQ.on, btn: !document.getElementById('btn-autoquest').classList.contains('hidden') };
});
await page.waitForTimeout(600);
const aqRun = await page.evaluate(() => {
  const G = window.__GRIAN__;
  const S = G.state;
  return {
    on: G.AutoQ.on, st: G.AutoQ.st,
    quests: Object.keys(S.player.quests).length,
  };
});
if (aqBtn.on && (aqRun.quests > 0 || ['accept', 'idle'].includes(aqRun.st))) {
  ok(`ออโต้เควสต์ทำงาน (สถานะ "${aqRun.st}" · เควสต์ที่รับ ${aqRun.quests} ตัว)`);
} else bad('ออโต้เควสต์ไม่ทำงาน', JSON.stringify({ aqBtn, aqRun }));
await page.evaluate(() => window.__GRIAN__.AutoQ.toggle(window.__GRIAN__.state));

const g3 = await page.evaluate(() => {
  const G = window.__GRIAN__;
  const c = document.getElementById('world-3d');
  const r = c.getBoundingClientRect(), s = document.getElementById('stage').getBoundingClientRect();
  return {
    ok: !!G.GFX3D?.ok,
    hasCanvas: !!c,
    cover: r.width >= s.width - 1 && r.height >= s.height - 1,
  };
});
if (g3.hasCanvas && g3.cover) {
  ok(`ชั้น 3D (three.js) สร้างแล้ว${g3.ok ? ' และเปิดใช้งาน — แสง/น้ำ/อากาศ' : ' (ปิดไว้: การ์ดจอ/software — fallback 2D)'}`);
} else bad('ชั้น 3D ไม่ครบ', JSON.stringify(g3));

const gl3 = await page.evaluate(async () => {
  const G = window.__GRIAN__;
  // บังคับเปิด three.js แม้บน software GL เพื่อตรวจ pipeline + 3D VFX + 3D Zoom
  const origSw = G.GFX3D._softwareGL;
  G.GFX3D._softwareGL = () => false;
  G.GFX3D._bench = () => true;
  G.Settings.set('render3d', 'on');
  G.GFX3D.setZoom(-0.15);
  G.VFX.spawn('shockwave', { x: G.state.player.x, y: G.state.player.y, color: '#4ae8ff', size: 48, dur: 0.8 });
  await new Promise((r) => setTimeout(r, 600));
  const res = await new Promise((resolve) => {
    requestAnimationFrame(() => {
      if (!G.GFX3D.ok) return resolve({ ok: false, reason: G.GFX3D.reason });
      const gl = G.GFX3D.renderer.getContext();
      const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
      const px = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      const set = new Set();
      for (let i = 0; i < px.length; i += 4) set.add(`${px[i]},${px[i + 1]},${px[i + 2]}`);
      const activeFx3D = (G.GFX3D.fx3dList || []).filter((f) => f.active).length;
      const sunZValid = !Number.isNaN(G.GFX3D.sun.position.z);
      G.GFX3D.terrain.geometry.computeBoundingBox();
      const bb = G.GFX3D.terrain.geometry.boundingBox;
      const terrainAligned = Math.round(bb.min.x) === 0 && Math.round(bb.max.x) === 1536 && Math.round(bb.min.z) === 0 && Math.round(bb.max.z) === 1088;
      const obsSids = (G.GFX3D.obstacles || []).map((o) => o.g.sid);
      const noFloorBillboards = !obsSids.includes('t_grass') && !obsSids.includes('t_stonepath') && !obsSids.includes('t_cyberfloor');
      resolve({
        ok: true,
        colors: set.size,
        lights: G.GFX3D.lightPool.filter((l) => l.visible).length,
        activeFx3D,
        sunZValid,
        terrainAligned,
        noFloorBillboards,
        zoom: +G.GFX3D.zoom.toFixed(2),
      });
    });
  });
  G.GFX3D._softwareGL = origSw;
  return res;
});
if (gl3.ok && gl3.colors > 40 && gl3.sunZValid && gl3.terrainAligned && gl3.noFloorBillboards) {
  ok(`three.js เรนเดอร์ GL ได้: ${gl3.colors} สี · ไฟจุด ${gl3.lights} · 3D VFX active=${gl3.activeFx3D} · ซูม=${gl3.zoom} · พิกัดพื้น/Cutout/ดวงอาทิตย์ถูกต้อง`);
} else bad('three.js เรนเดอร์ GL ไม่ได้ หรือพิกัดผิด', JSON.stringify(gl3));
await page.evaluate(() => window.__GRIAN__.Settings.set('render3d', 'off'));

/* ── 24b. ทดสอบ v2.0.0: ระบบออนไลน์เรียลไทม์ (Multiplayer API/WS) + ชุดเกราะ 3 ช่อง (Full Set Bonus) + 3D Meshes ── */
const v2Test = await page.evaluate(async () => {
  const G = window.__GRIAN__;
  const S = G.state, p = S.player;

  // 1) ทดสอบสวมใส่อุปกรณ์ครบ 3 ช่อง (weapon + armor + acc) และโบนัสเซ็ต
  p.inv.push({ id: 'sword_cyber', qty: 1 }, { id: 'armor_cyber', qty: 1 }, { id: 'amulet_whale', qty: 1 });
  G.handlers.onEquipItem('sword_cyber');
  G.handlers.onEquipItem('armor_cyber');
  const hpBeforeSet = p.maxHp;
  G.handlers.onEquipItem('amulet_whale');
  const fullSet = G.hasFullSet(p);
  const hpAfterSet = p.maxHp;

  // 2) ทดสอบซิงค์ผู้เล่นออนไลน์จำลองคนอื่นเข้าเซิร์ฟเวอร์ผ่าน /api/sync
  await fetch('/api/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'sync',
      peer: {
        id: 'peer_test_bot2', name: 'เพื่อนออนไลน์จริง', clsId: 'fivestar',
        lvl: 35, mapId: S.mapId, x: p.x + 24, y: p.y, dir: -1, frame: 0, hp: 500, maxHp: 500, auraLvl: 10,
      },
    }),
  });
  await G.Net.sendSync();
  const stRes = await fetch('/api/status').then((r) => r.json());
  const sameMapPeers = G.Net.sameMapPeers(S).length;
  const archMeshes = (G.GFX3D.archMeshes || []).length;
  return {
    fullSet,
    setBoosted: hpAfterSet > hpBeforeSet,
    netConnected: G.Net.connected,
    onlineCount: stRes.onlinePlayers || 0,
    sameMapPeers,
    archMeshes,
  };
});
if (v2Test.fullSet && v2Test.setBoosted && v2Test.netConnected && v2Test.onlineCount >= 2 && v2Test.sameMapPeers >= 1 && v2Test.archMeshes >= 3) {
  ok(`ระบบออนไลน์ v2.0.0 ทำงานครบ: Multiplayer (${v2Test.onlineCount} คนในเซิร์ฟ) · โบนัสเซ็ตอุปกรณ์ 3 ชิ้น · 3D Architecture (${v2Test.archMeshes} กลุ่มโมเดล)`);
} else bad('ระบบ v2.0.0 ไม่ครบ', JSON.stringify(v2Test));

/* ── 25. ปล่อยรันต่อเพื่อจับ error ที่หลุด ── */
await page.keyboard.down('a');
await page.waitForTimeout(700);
await page.keyboard.up('a');
await page.waitForTimeout(1200);

const finalState = await page.evaluate(() => {
  const S = window.__GRIAN__.state;
  return {
    screen: S.screen, lvl: S.player.lvl, gold: Math.floor(S.player.gold),
    monsters: S.monsters.length, bots: S.bots.length, npcs: S.npcs.length,
    chat: S.chat.length, inv: S.player.inv.length,
    unlocked: Object.keys(S.player.unlocked || {}).length,
    particles: window.__GRIAN__.Particles.count(),
    domNodes: document.getElementsByTagName('*').length,
    toasts: document.getElementById('toasts').innerText.replace(/\n/g, ' / '),
  };
});

await browser.close();

console.log('\n══════ ผลการทดสอบ ══════');
console.log(notes.join('\n'));
if (problems.length) console.log('\n' + problems.join('\n'));
else console.log('  (ไม่มีข้อผิดพลาด)');
console.log('\n── สถานะสุดท้าย ──');
console.log('  ' + JSON.stringify(finalState));
console.log(`\n── console error: ${consoleErrors.length} รายการ ──`);
consoleErrors.slice(0, 12).forEach((e) => console.log('  ! ' + e));

const failed = problems.length + consoleErrors.length;
console.log(`\nผลรวม: ${failed === 0 ? 'ผ่านทั้งหมด ✅' : `มีปัญหา ${failed} จุด ❌`}`);
process.exit(failed === 0 ? 0 : 1);
