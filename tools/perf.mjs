/* วัดประสิทธิภาพของเกมในเบราว์เซอร์จริง
   ใช้:  node tools/perf.mjs [พอร์ต] [วินาที]
   วัด: FPS, เวลาเฟรม (เฉลี่ย/p95), จำนวน DOM mutation ต่อวินาที, จำนวน node */

import path from 'node:path';
import fs from 'node:fs';

const PW = process.env.PLAYWRIGHT_PATH || 'playwright';
let _pw;
try { _pw = await import(PW); } catch (e) { _pw = await import('./webdriver-playwright.mjs'); }
const chromium = _pw.chromium || _pw.default?.chromium;

function findChromium() {
  if (process.env.PLAYWRIGHT_CHROME) return process.env.PLAYWRIGHT_CHROME;
  for (const sysBin of ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome']) {
    if (fs.existsSync(sysBin)) return sysBin;
  }
  const root = path.join(process.env.LOCALAPPDATA || '', 'ms-playwright');
  const c = [];
  for (const d of fs.readdirSync(root)) {
    if (!d.startsWith('chromium-')) continue;
    const p = path.join(root, d, 'chrome-win64', 'chrome.exe');
    if (fs.existsSync(p)) c.push({ p, v: Number(d.split('-')[1]) || 0 });
  }
  c.sort((a, b) => b.v - a.v);
  return c[0]?.p;
}

const PORT = Number(process.argv[2] || 8731);
const ARGS = process.argv.slice(3);            // หลังพอร์ต
const SECS = Number(ARGS.find((a) => /^\d+$/.test(a)) || 10);
const LABEL = ARGS.find((a) => !/^\d+$/.test(a) && !a.startsWith('-')) || 'current';
// --3d บังคับ three.js 3D layer เพื่อวัดโหมด 3D (headless ตรวจ GL ไม่ผ่าน)
const FORCE_3D = process.argv.includes('--3d');

const browser = await chromium.launch({ headless: true, executablePath: findChromium() });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#title-menu:not(.hidden)', { timeout: 25000 });
await page.click('#btn-enter');
await page.waitForSelector('#scr-create.active');
await page.fill('#in-name', 'วัดผลระบบ');
await page.locator('.class-card').nth(0).click();
await page.click('#btn-start');
await page.waitForSelector('#scr-play.active');
await page.waitForTimeout(1200);

// บังคับ 3D (headless ตรวจ software GL ไม่ผ่าน — มือถือ/เครื่องจริงใช้ auto)
if (FORCE_3D) {
  await page.evaluate(() => {
    const G = window.__GRIAN__;
    G.Settings.set('render3d', 'on');
    G.Settings.set('autoQuality', false);
    if (!G.GFX3D.ok) {
      G.GFX3D.init(G.state.world);
      const c3 = document.getElementById('world-3d');
      c3.style.width = document.getElementById('world').style.width;
      c3.style.height = document.getElementById('world').style.height;
      G.GFX3D.resize(G.view.w, G.view.h);
    }
  });
  await page.waitForTimeout(1500);
}

/* เก็บสถิติ */
const result = await page.evaluate(async (secs) => {
  const S = window.__GRIAN__.state;
  const frames = [];
  let mutations = 0;
  let running = true;

  const obs = new MutationObserver((list) => {
    for (const m of list) mutations += (m.addedNodes.length + m.removedNodes.length + (m.type === 'attributes' ? 1 : 0));
  });
  obs.observe(document.getElementById('nametags'), { childList: true, subtree: true, attributes: true, characterData: true });

  let last = performance.now();
  function tick() {
    const now = performance.now();
    frames.push(now - last);
    last = now;
    if (running) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  await new Promise((r) => setTimeout(r, secs * 1000));
  running = false;
  obs.disconnect();

  frames.shift();
  const sorted = frames.slice().sort((a, b) => a - b);
  const avg = frames.reduce((a, b) => a + b, 0) / frames.length;
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  const worst = sorted[sorted.length - 1];

  return {
    frames: frames.length,
    fps: +(1000 / avg).toFixed(1),
    avgMs: +avg.toFixed(2),
    p95Ms: +p95.toFixed(2),
    worstMs: +worst.toFixed(2),
    mutationsPerSec: Math.round(mutations / secs),
    domNodes: document.getElementsByTagName('*').length,
    tagNodes: document.getElementById('nametags').children.length,
    floatNodes: document.getElementById('floaters').children.length,
    entities: S.monsters.length + S.bots.length + S.npcs.length,
    effects: S.effects.length + S.floaters.length,
    g3: (window.__GRIAN__.GFX3D?.ok) ? {
      calls: window.__GRIAN__.GFX3D.renderer.info.render.calls,
      tris: window.__GRIAN__.GFX3D.renderer.info.render.triangles,
      geometries: window.__GRIAN__.GFX3D.renderer.info.memory.geometries,
      programs: window.__GRIAN__.GFX3D.renderer.info.programs?.length || 0,
      lights: window.__GRIAN__.GFX3D.lightPool.filter((l) => l.visible).length,
    } : null,
  };
}, SECS);

await browser.close();

console.log(`\n═══ ประสิทธิภาพ [${LABEL}] — วัด ${SECS} วินาที ═══`);
console.log(`  FPS                 ${result.fps}`);
console.log(`  เวลาเฟรม เฉลี่ย      ${result.avgMs} ms`);
console.log(`  เวลาเฟรม p95        ${result.p95Ms} ms`);
console.log(`  เวลาเฟรม แย่สุด      ${result.worstMs} ms`);
console.log(`  จำนวนเฟรม           ${result.frames}`);
console.log(`  DOM mutation/วินาที  ${result.mutationsPerSec}   ← ยิ่งน้อยยิ่งดี`);
console.log(`  node ใน DOM ทั้งหมด  ${result.domNodes}`);
console.log(`  node ใน #nametags    ${result.tagNodes}`);
console.log(`  node ใน #floaters    ${result.floatNodes}`);
console.log(`  เอนทิตีในโลก         ${result.entities}`);
console.log(`  เอฟเฟกต์ที่ active    ${result.effects}`);
if (result.g3) {
  console.log(`  [3D] draw calls       ${result.g3.calls}`);
  console.log(`  [3D] เส้นสี (tris)     ${result.g3.tris}`);
  console.log(`  [3D] geometry         ${result.g3.geometries} · program ${result.g3.programs}`);
  console.log(`  [3D] ไฟจุดที่เปิด      ${result.g3.lights}`);
}
console.log('');

fs.mkdirSync(path.join(process.cwd(), 'shots'), { recursive: true });
fs.writeFileSync(path.join(process.cwd(), 'shots', `perf-${LABEL}.json`), JSON.stringify(result, null, 2));
