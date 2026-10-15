/* ═══════════════════════════════════════════════════════════
   webdriver-playwright.mjs — ตัวแปลง Playwright API → W3C WebDriver (ChromeDriver)
   ใช้เมื่อสภาพแวดล้อมไม่มีแพ็กเกจ npm 'playwright' แต่มี chromium + chromedriver ในเครื่อง
   ไม่พึ่งไลบรารีภายนอก (ใช้ fetch ของ Node 18+ และ child_process)
   ═══════════════════════════════════════════════════════════ */

import { spawn } from 'node:child_process';
import fs from 'node:fs';

async function req(baseUrl, method, endpoint, body) {
  const res = await fetch(`${baseUrl}${endpoint}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.value?.error) {
    const msg = data.value?.message || data.value?.error || res.statusText;
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return data.value;
}

class WDPage {
  constructor(baseUrl, sessionId) {
    this.base = `${baseUrl}/session/${sessionId}`;
    this.listeners = { console: [], pageerror: [] };
    this.keyboard = {
      down: async (k) => {
        await this.evaluate((key) => {
          window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
        }, k);
      },
      up: async (k) => {
        await this.evaluate((key) => {
          window.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }));
        }, k);
      },
      press: async (k) => {
        await this.evaluate((key) => {
          window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
          window.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }));
        }, k);
      },
    };
  }

  on(ev, fn) {
    if (!this.listeners[ev]) this.listeners[ev] = [];
    this.listeners[ev].push(fn);
  }

  async _installHooks() {
    await req(this.base, 'POST', '/execute/sync', {
      script: `
        if (!window.__WD_ERRORS__) {
          window.__WD_ERRORS__ = [];
          const origErr = console.error.bind(console);
          console.error = (...args) => {
            window.__WD_ERRORS__.push({ type: 'console', text: args.map(String).join(' ') });
            origErr(...args);
          };
          window.addEventListener('error', (e) => {
            window.__WD_ERRORS__.push({ type: 'pageerror', text: e.message || String(e) });
          });
          window.addEventListener('unhandledrejection', (e) => {
            window.__WD_ERRORS__.push({ type: 'pageerror', text: String(e.reason?.message || e.reason || e) });
          });
        }
      `,
      args: [],
    }).catch(() => {});
  }

  async _flushErrors() {
    try {
      const list = await req(this.base, 'POST', '/execute/sync', {
        script: `
          const out = window.__WD_ERRORS__ ? window.__WD_ERRORS__.splice(0) : [];
          return out;
        `,
        args: [],
      });
      if (Array.isArray(list)) {
        for (const item of list) {
          if (item.type === 'console') {
            for (const fn of this.listeners.console) fn({ type: () => 'error', text: () => item.text });
          } else if (item.type === 'pageerror') {
            for (const fn of this.listeners.pageerror) fn(new Error(item.text));
          }
        }
      }
    } catch (e) { /* ignore */ }
  }

  async goto(url) {
    const safeUrl = url.replace('//127.0.0.1', '//local.game').replace('//localhost', '//local.game');
    await req(this.base, 'POST', '/url', { url: safeUrl });
    await this._installHooks();
  }

  async reload() {
    await req(this.base, 'POST', '/refresh', {});
    await this._installHooks();
  }

  async waitForSelector(selector, opts = {}) {
    const timeout = opts.timeout || 10000;
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      await this._installHooks();
      const ok = await this.evaluate((sel) => !!document.querySelector(sel), selector).catch(() => false);
      if (ok) return true;
      await this.waitForTimeout(100);
    }
    throw new Error(`Timeout waiting for selector: ${selector}`);
  }

  async waitForTimeout(ms) {
    await new Promise((r) => setTimeout(r, ms));
    await this._flushErrors();
  }

  locator(selector) {
    return {
      count: async () => this.evaluate((sel) => document.querySelectorAll(sel).length, selector),
      nth: (idx) => ({
        click: async () => {
          await this.evaluate(({ sel, i }) => {
            const el = document.querySelectorAll(sel)[i];
            if (!el) throw new Error(`Element not found: ${sel}[${i}]`);
            el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
            el.click();
          }, { sel: selector, i: idx });
        },
      }),
    };
  }

  async click(selector) {
    await this.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) throw new Error(`Element not found: ${sel}`);
      el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      el.click();
    }, selector);
    await this._flushErrors();
  }

  async fill(selector, value) {
    await this.evaluate(({ sel, val }) => {
      const el = document.querySelector(sel);
      if (!el) throw new Error(`Element not found: ${sel}`);
      el.focus();
      el.value = val;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.blur();
    }, { sel: selector, val: value });
    await this._flushErrors();
  }

  async evaluate(fn, arg) {
    const fnStr = fn.toString();
    const res = await req(this.base, 'POST', '/execute/async', {
      script: `
        const done = arguments[arguments.length - 1];
        const arg = arguments[0];
        Promise.resolve((${fnStr})(arg)).then(
          (val) => done({ ok: true, val }),
          (err) => done({ ok: false, err: String(err && err.stack || err) })
        );
      `,
      args: [arg === undefined ? null : arg],
    });
    await this._flushErrors();
    if (res && !res.ok) throw new Error(res.err);
    return res ? res.val : undefined;
  }

  async screenshot(opts = {}) {
    await this.evaluate(() => {
      const G = window.__GRIAN__;
      if (G && G.state) { G.__wasPaused = G.state.paused; G.state.paused = true; }
      if (G && G.GFX3D && G.GFX3D.ok) { G.GFX3D._freeze = true; }
    }).catch(() => {});
    const b64 = await req(this.base, 'GET', '/screenshot');
    await this.evaluate(() => {
      const G = window.__GRIAN__;
      if (G && G.GFX3D) { G.GFX3D._freeze = false; }
      if (G && G.state && G.__wasPaused !== undefined) { G.state.paused = G.__wasPaused; }
    }).catch(() => {});
    if (opts.path && b64) {
      fs.writeFileSync(opts.path, Buffer.from(b64, 'base64'));
    }
  }
}

export const chromium = {
  async launch(opts = {}) {
    const port = 9515 + Math.floor(Math.random() * 400);
    const proc = spawn('chromedriver', [`--port=${port}`], { stdio: 'ignore' });
    const baseUrl = `http://127.0.0.1:${port}`;

    for (let i = 0; i < 40; i++) {
      try {
        const st = await req(baseUrl, 'GET', '/status');
        if (st && st.ready) break;
      } catch (e) { /* wait */ }
      await new Promise((r) => setTimeout(r, 100));
    }

    const bin = opts.executablePath || '/usr/bin/chromium';
    const chromeArgs = [
      '--headless=new',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--no-proxy-server',
      '--host-resolver-rules=MAP local.game 127.0.0.1',
      '--disable-gpu-compositing',
      '--enable-webgl',
      '--ignore-gpu-blocklist',
      '--autoplay-policy=no-user-gesture-required',
    ];
    const sess = await req(baseUrl, 'POST', '/session', {
      capabilities: {
        alwaysMatch: {
          browserName: 'chrome',
          'goog:chromeOptions': {
            binary: fs.existsSync(bin) ? bin : undefined,
            args: chromeArgs,
          },
        },
      },
    });
    const sessionId = sess.sessionId;
    await req(`${baseUrl}/session/${sessionId}`, 'POST', '/timeouts', {
      script: 60000,
      pageLoad: 30000,
      implicit: 0,
    });

    return {
      async newPage(pageOpts = {}) {
        const w = pageOpts.viewport?.width || 1600;
        const h = pageOpts.viewport?.height || 900;
        await req(`${baseUrl}/session/${sessionId}`, 'POST', '/window/rect', { width: w, height: h }).catch(() => {});
        return new WDPage(baseUrl, sessionId);
      },
      async close() {
        await req(`${baseUrl}/session/${sessionId}`, 'DELETE', '').catch(() => {});
        try { proc.kill(); } catch (e) { /* ignore */ }
      },
    };
  },
};
export default { chromium };
