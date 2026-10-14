/* ถ่ายภาพหน้าจอบังคับ: title · create · game (กลางวัน/กลางคืน) · AUTO · บอส */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PW = process.env.PLAYWRIGHT_PATH || 'playwright';
const _pw = await import(PW);
const chromium = _pw.chromium || _pw.default?.chromium;

const PORT = Number(process.argv[2] || 8731);
const BASE = `http://127.0.0.1:${PORT}/`;
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'shots');
fs.mkdirSync(OUT, { recursive: true });

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

const browser = await chromium.launch({ headless: true, executablePath: findChromium() });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#title-menu:not(.hidden)', { timeout: 25000 });
await page.screenshot({ path: path.join(OUT, 'shot-title.png') });

await page.click('#btn-enter');
await page.waitForSelector('#scr-create.active');
await page.screenshot({ path: path.join(OUT, 'shot-create.png') });

await page.fill('#in-name', 'ทีมงานทดสอบ');
await page.locator('.class-card').nth(3).click();
await page.click('#btn-start');
await page.waitForSelector('#scr-play.active', { timeout: 8000 });
await page.waitForTimeout(2500);
await page.screenshot({ path: path.join(OUT, 'shot-game-day.png') });

// กลางคืนจริง (ถูกวิธี: ข้าม DayNight.t ไม่ใช่ state.time)
await page.evaluate(() => { window.__GRIAN__.DayNight.t = 0.0; });
await page.waitForTimeout(1200);
await page.screenshot({ path: path.join(OUT, 'shot-game-night.png') });

// หมู่บ้านกลางคืน — มีแสงตะเกียง/หน้าต่าง
await page.evaluate(() => {
  const G = window.__GRIAN__;
  const v = G.state.world.village;
  G.state.player.x = (v.x + 13) * 16; G.state.player.y = (v.y + 6) * 16;
  G.state.player.prevX = G.state.player.x; G.state.player.prevY = G.state.player.y;
});
await page.waitForTimeout(900);
await page.screenshot({ path: path.join(OUT, 'shot-village-night.png') });

// กลับมายังกลางวัน
await page.evaluate(() => { window.__GRIAN__.DayNight.t = 0.34; });
await page.waitForTimeout(300);
await page.screenshot({ path: path.join(OUT, 'shot-game-day.png') });

// บอสโลก + แสงสกิล
await page.evaluate(() => window.__GRIAN__.handlers.onSkill('ult'));
await page.waitForTimeout(400);
await page.screenshot({ path: path.join(OUT, 'shot-skill.png') });

// ตั้งเวลาให้บอสเกิดแล้วถ่าย
await page.evaluate(async () => {
  const G = window.__GRIAN__;
  G.state.boss.nextAt = 1;
});
await page.waitForTimeout(3000);
await page.screenshot({ path: path.join(OUT, 'shot-boss.png') });

// เปิดแพเนล HUD ทั้งหมด
await page.evaluate(() => {
  const G = window.__GRIAN__;
  G.state.player.gold = 99999; G.state.player.gems = 5000;
});
await page.keyboard.press('i');
await page.waitForTimeout(400);
await page.screenshot({ path: path.join(OUT, 'shot-inv.png') });
await page.keyboard.press('Escape');
await page.keyboard.press('k');
await page.waitForTimeout(400);
await page.screenshot({ path: path.join(OUT, 'shot-skills.png') });
await page.keyboard.press('Escape');
await page.keyboard.press('g');
await page.waitForTimeout(400);
await page.screenshot({ path: path.join(OUT, 'shot-gacha.png') });

console.log('ถ่ายภาพครบ');
await browser.close();
