/* A/B probe v3: พิสูจน์ค่า PointLight แบบ candle (I = power·r²) ผ่านเกมลูปจริง
   patch syncSky ให้คูณ intensity ด้วย factor — วัดความสว่างภาพจริง
   NEW (candle ปัจจุบัน) · OLD (power เปล่า ÷ ~676×) · OFF (ปิด) + sanity hemi */
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

await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#title-menu:not(.hidden)', { timeout: 25000 });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('#title-menu:not(.hidden)', { timeout: 25000 });
await page.click('#btn-enter');
await page.fill('#in-name', 'วัดแสง');
await page.locator('.class-card').nth(0).click();
await page.click('#btn-start');
await page.waitForSelector('#scr-play.active', { timeout: 8000 });

const setup = await page.evaluate(() => {
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
  const v = G.state.world;
  const p = G.state.player;
  const ls = v.lightSpots || [];
  p.x = ls.length ? ls[0] : (v.x + 13) * 16;      // ยืนเหนือไฟต้นฉบับของแมพ (ไม่ใช่ village centre)
  p.y = ls.length ? ls[1] : (v.y + 6) * 16;
  G.DayNight.t = 0.0;
  p.prevX = p.x; p.prevY = p.y;
  G.Camera.snap(p.x - 240, p.y - 135);
  G.state._aqLo2 = 0;
  // patch ระดับลูป: เกมเขียน intensity ใหม่ทุกเฟรม → ต้องคูณผ่าน syncSky
  G.__AB__ = { lightScale: 1, hemiMul: 1 };
  const orig = G.GFX3D.syncSky;
  G.GFX3D.syncSky = function (state, dt) {
    orig.call(this, state, dt);
    for (const L of this.lightPool) if (L.visible) L.intensity *= G.__AB__.lightScale;
    this.hemi.intensity *= G.__AB__.hemiMul;
  };
  return { ok: !!G.GFX3D.ok, reason: G.GFX3D.reason, spots: v.lightSpots ? v.lightSpots.length / 3 : 0 };
});
console.log('setup:', JSON.stringify(setup));
await page.waitForTimeout(1800);

async function lum(buf) {
  return page.evaluate(async (b64) => {
    const img = new Image();
    await new Promise((r) => { img.onload = r; img.src = 'data:image/png;base64,' + b64; });
    const W = img.width, H = img.height;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, W, H).data;
    let s = 0;
    for (let i = 0; i < d.length; i += 4) s += (d[i] + d[i + 1] + d[i + 2]) / 3;
    return Math.round((s / (d.length / 4)) * 100) / 100;
  }, buf.toString('base64'));
}

async function setAndShoot(scale, hemi, shotName) {
  await page.evaluate(({ s, h }) => {
    const G = window.__GRIAN__;
    G.__AB__.lightScale = s; G.__AB__.hemiMul = h;
  }, { s: scale, h: hemi });
  await page.waitForTimeout(350);
  await page.screenshot({ path: path.join(OUT, shotName) });
  return lum((await page.screenshot()).toString('base64'));
}

// sanity: hemi ×10 — ภาพทั้งก้อนต้องสว่างขึ้นชัด (พิสูจน์ว่าระบบวัดคือแป๊ะo)
const L_hemi = await setAndShoot(1, 10, 'shot-ab-sanity.png');
const L_base = await setAndShoot(1, 1, 'shot-ab-new.png');
const L_old = await setAndShoot(1 / 676, 1, 'shot-ab-old.png');   // power เปล่า (÷r², r≈26)
const L_off = await setAndShoot(0, 1, 'shot-ab-off.png');

console.log(`ความสว่างภาพทั้งก้อน กลางคืน:`);
console.log(`  NEW (candle I=power·r²)  ${L_base}`);
console.log(`  OLD (power เปล่า)        ${L_old}`);
console.log(`  OFF (ปิดไฟจุด)          ${L_off}`);
console.log(`  sanity hemi×10           ${L_hemi} ${L_hemi > L_base + 2 ? '✅ ภาพตอบสนองแสง' : '❌'}`);
console.log(`  → NEW สว่างกว่า OLD ${(L_base / Math.max(0.01, L_old)).toFixed(1)}× (คาด ~2–6× บริเวณที่มีไฟ) · ไฟมีผลจริง ${L_base > L_off ? '✅' : '❌'}`);
console.log('errors:', errors.length);
await browser.close();
