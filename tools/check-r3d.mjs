/* ตรวจ v1.0: โลก 3D (heightmap/billboard cutout/เงา/กลางคืน/โซน 3) */
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
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#title-menu:not(.hidden)', { timeout: 25000 });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('#title-menu:not(.hidden)', { timeout: 25000 });

await page.click('#btn-enter');
await page.fill('#in-name', 'โลกสามมิติ');
await page.locator('.class-card').nth(0).click();
await page.click('#btn-start');
await page.waitForSelector('#scr-play.active', { timeout: 8000 });
await page.waitForTimeout(800);
await page.evaluate(() => {
  const G = window.__GRIAN__;
  G.GFX3D._softwareGL = () => false;
  G.GFX3D._bench = () => true;
  G.Settings.set('render3d', 'on');
  G.Settings.set('autoQuality', false);
  G.state._aqLo2 = 0;
  if (!G.GFX3D.ok) {
    G.GFX3D.init(G.state.world);
    const c = document.getElementById('world-3d');
    c.style.width = document.getElementById('world').style.width;
    c.style.height = document.getElementById('world').style.height;
    G.GFX3D.resize(G.view.w, G.view.h);
  }
});
await page.waitForTimeout(1800);

// กลางวัน หมู่บ้าน
await page.evaluate(() => {
  const G = window.__GRIAN__;
  const v = G.state.world.village;
  const p = G.state.player;
  p.x = (v.x + 13) * 16; p.y = (v.y + 6) * 16;
  p.prevX = p.x; p.prevY = p.y;
  G.Camera.snap(p.x - 240, p.y - 135);
  G.DayNight.t = 0.45;
});
await page.waitForTimeout(1200);
await page.screenshot({ path: path.join(OUT, 'shot-r3d-day.png') });

// กลางคืน หมู่บ้าน — เงา+แสง
await page.evaluate(() => { window.__GRIAN__.DayNight.t = 0.0; });
await page.waitForTimeout(1200);
await page.screenshot({ path: path.join(OUT, 'shot-r3d-night.png') });

// แดนมาร กลางคืน — ลาว
await page.evaluate(() => {
  const G = window.__GRIAN__;
  G.state.player.maxHp = 999; G.state.player.hp = 999; G.state.player.dead = false; G.UI.hideDeath(); G.travelTo('hell');
  G.DayNight.t = 0.02;
});
await page.waitForTimeout(2000);
await page.screenshot({ path: path.join(OUT, 'shot-r3d-hell.png') });

// แดนเซิร์ฟเถื่อน (โซน 3)
await page.evaluate(() => {
  const G = window.__GRIAN__;
  G.state.player.maxHp = 999; G.state.player.hp = 999; G.state.player.dead = false; G.UI.hideDeath(); G.travelTo('cyber');
  G.DayNight.t = 0.05;
});
await page.waitForTimeout(2000);
await page.screenshot({ path: path.join(OUT, 'shot-r3d-cyber.png') });

// หีบ + เอฟเฟกต์
await page.evaluate(() => {
  const G = window.__GRIAN__;
  G.state.player.maxHp = 999; G.state.player.hp = 999; G.state.player.dead = false; G.UI.hideDeath(); G.travelTo('field');
  G.DayNight.t = 0.45;
  G.state.player.mp = 999;
  setTimeout(() => G.handlers.onSkill('ult'), 100);
});
await page.waitForTimeout(900);
await page.screenshot({ path: path.join(OUT, 'shot-r3d-skill.png') });

const stat = await page.evaluate(() => {
  const G = window.__GRIAN__;
  return {
    ok: !!G.GFX3D.ok,
    obstacles: G.GFX3D.obstacles ? G.GFX3D.obstacles.length : 0,
    obstacleSids: (G.GFX3D.obstacles || []).map((o) => o.g.sid),
    entities: Object.keys(G.GFX3D.entityPool || {}).length,
    lights: G.GFX3D.lightPool.filter((l) => l.visible).length,
    blobShadows: G.GFX3D.shadowMesh ? G.GFX3D.shadowMesh.count : -1,
    sunI: +G.GFX3D.sun.intensity.toFixed(2),
    shadows: G.GFX3D.sun.castShadow,
    drawCalls: G.GFX3D.renderer.info.render.calls,
    tris: G.GFX3D.renderer.info.render.triangles,
    camY: +G.GFX3D.camera.position.y.toFixed(0),
    pick: (() => {
      const r = G.GFX3D.renderer.domElement.getBoundingClientRect();
      const hit = G.GFX3D.pick(r.left + r.width / 2, r.top + r.height / 2);
      return hit ? [Math.round(hit.x), Math.round(hit.y)] : null;
    })(),
  };
});
console.log('3D stats:', JSON.stringify(stat));
console.log('\nerrors:', errors.length);
errors.slice(0, 6).forEach((e) => console.log(' !', e));
await browser.close();
