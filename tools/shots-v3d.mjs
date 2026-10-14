/* ถ่ายชุดภาพ verify 3D physics: กลางวัน · กลางคืน (ไฟจุด) · แดนมาร (ลาว) · แดนเซิร์ฟเถื่อน (ไซเบอร์) ·
   ลูกไฟ ballistic กลางวิถี */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let chromium;
try {
  const PW = process.env.PLAYWRIGHT_PATH || 'playwright';
  const _pw = await import(PW);
  chromium = _pw.chromium || _pw.default?.chromium;
} catch (e) {
  const _wd = await import('./webdriver-playwright.mjs');
  chromium = _wd.chromium;
}

function findChromium() {
  const roots = [
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'ms-playwright'),
    process.env.HOME && path.join(process.env.HOME, '.cache', 'ms-playwright'),
  ].filter(Boolean);
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    for (const d of fs.readdirSync(root)) {
      if (!d.startsWith('chromium-')) continue;
      for (const rel of ['chrome-win64/chrome.exe', 'chrome-linux/chrome']) {
        const p = path.join(root, d, rel);
        if (fs.existsSync(p)) return p;
      }
    }
  }
  if (fs.existsSync('/usr/bin/chromium')) return '/usr/bin/chromium';
  return undefined;
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
await page.locator('.class-card').nth(2).click();
await page.click('#btn-start');
await page.waitForSelector('#scr-play.active', { timeout: 8000 });

await page.evaluate(() => {
  const G = window.__GRIAN__;
  G.GFX3D._softwareGL = () => false;
  G.GFX3D._bench = () => true;
  G.Settings.set('render3d', 'on');
  G.Settings.set('autoQuality', false);
  G.state._aqLo2 = 0; G.state._aqLo = 0;
  if (!G.GFX3D.ok) {
    G.GFX3D.init(G.state.world);
    G.GFX3D.resize(G.view.w, G.view.h);
  }
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

// ลูกไฟ ballistic — หาเป้าแล้วยิงสกิล fire กลางลำ
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
    G.handlers.onSkill('fire');
  }
});
await page.waitForTimeout(120);
await page.screenshot({ path: path.join(OUT, 'v3d-fire.png') });

await page.waitForTimeout(700);
await page.screenshot({ path: path.join(OUT, 'v3d-fire-boom.png') });

// แดนมาร กลางคืน — ลาว + ไฟจุด
await page.evaluate(() => {
  const G = window.__GRIAN__;
  const p = G.state.player;
  p.maxHp = 600; p.hp = 600;
  G.travelTo('hell');
  G.DayNight.t = 0.02;
});
await page.waitForTimeout(2200);
await page.screenshot({ path: path.join(OUT, 'v3d-hell.png') });

// แดนเซิร์ฟเถื่อน (โซน 3) — วงจรไซเบอร์ + สายธารดาต้า + บ่อบั๊กไฟดูด
await page.evaluate(() => {
  const G = window.__GRIAN__;
  const p = G.state.player;
  p.maxHp = 600; p.hp = 600;
  G.travelTo('cyber');
  G.DayNight.t = 0.05;
});
await page.waitForTimeout(2200);
await page.screenshot({ path: path.join(OUT, 'v3d-cyber.png') });

console.log('errors:', errors.length);
errors.slice(0, 5).forEach((e) => console.log(' !', e));
await browser.close();
