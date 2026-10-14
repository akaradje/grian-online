/* ถ่ายชุดภาพ verify 3D physics: กลางวัน · กลางคืน (ไฟจุด) · แดนมาร์ (ลาว) ·
   ลูกไฟ ballistic กลางวิ้ง + ซ้ำ 2D (เทียบว่าทรง peril ทำงาน) */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PW = process.env.PLAYWRIGHT_PATH || 'playwright';
const _pw = await import(PW);
const chromium = _pw.chromium || _pw.default?.chromium;

function findChromium() {
  const root = path.join(process.env.LOCALAPPDATA, 'ms-playwright');
  for (const d of fs.readdirSync(root)) {
    if (!d.startsWith('chromium-')) continue;
    for (const rel of ['chrome-win64/chrome.exe', 'chrome-linux/chrome']) {
      const p = path.join(root, d, rel);
      if (fs.existsSync(p)) return p;
    }
  }
  return null;
}

const PORT = Number(process.argv[2] || 8731);
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'shots');
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true, executablePath: findChromium() });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#title-menu:not(.hidden)', { timeout: 25000 });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('#title-menu:not(.hidden)', { timeout: 25000 });
await page.click('#btn-enter');
await page.fill('#in-name', 'ช่างภาพ');
await page.locator('.class-card').nth(2).click();       // ults mage
await page.click('#btn-start');
await page.waitForSelector('#scr-play.active', { timeout: 8000 });

await page.evaluate(() => {
  const G = window.__GRIAN__;
  G.Settings.set('render3d', 'on');
  G.Settings.set('autoQuality', false);
  G.state._aqLo2 = 0; G.state._aqLo = 0;
  if (!G.GFX3D.ok) G.GFX3D.init(G.state.world);
  G.DayNight.t = 0.45;
  const p = G.state.player;
  p.hp = p.maxHp; p.mp = 999; p.prevX = p.x; p.prevY = p.y;
});
await page.waitForTimeout(2200);
await page.screenshot({ path: path.join(OUT, 'v3d-day.png') });

// กลางคืน — หมู่บ้านมีไฟจุด (candle)
await page.evaluate(() => { window.__GRIAN__.DayNight.t = 0.0; });
await page.waitForTimeout(1500);
await page.screenshot({ path: path.join(OUT, 'v3d-night.png') });

// ลูกไฟ ballistic — หาเป้าหัยไกลแล้วยิงสกิล fire กลางลำ尽头
await page.evaluate(() => {
  const G = window.__GRIAN__;
  G.DayNight.t = 0.45;
  const S = G.state, p = S.player;
  const m = S.monsters.find((x) => !x.dead && !x.boss);
  if (m) {
    S.targetMonster = m;
    m.x = p.x + 150; m.y = p.y + 20; m.prevX = m.x; m.prevY = m.y; m.hp = m.maxHp;
    p.dir = 1;
    p.cooldowns.fire = 0; p.mp = p.maxMp;
    G.handlers.onSkill('fire');        // ลูกไฟบีนมี ballistic จริง
  }
});
await page.waitForTimeout(120);        // กลางการบิน (dur 0.3s)
await page.screenshot({ path: path.join(OUT, 'v3d-fire.png') });

// ปล่อยให้ลูกไฟลงเป้าหมาย + ระเบิด
await page.waitForTimeout(700);
await page.screenshot({ path: path.join(OUT, 'v3d-fire-boom.png') });

// แดนมาร์ กลางคืน — ลาว + ไฟเหล (เลี้ยงเลือดก่อน กัน modal ความตายบังภาพ)
await page.evaluate(() => {
  const G = window.__GRIAN__;
  const p = G.state.player;
  p.maxHp = 600; p.hp = 600;
  G.travelTo('hell');
  G.DayNight.t = 0.02;
});
await page.waitForTimeout(2500);
await page.screenshot({ path: path.join(OUT, 'v3d-hell.png') });

console.log('errors:', errors.length);
errors.slice(0, 5).forEach((e) => console.log(' !', e));
await browser.close();
