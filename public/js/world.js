/* ═══════════════════════════════════════════════════════════
   world.js — แผนที่โลก การชน กล้อง และมินิแมป
   สร้างแบบ deterministic (seed คงที่) → แผนที่เดิมทุกครั้ง
   ═══════════════════════════════════════════════════════════ */

import { CONFIG, ZONE_NAMES, HELL_ZONE_NAMES } from './data.js';
import { SPR, tileHash, BLEND, BLEND_LEVEL, BLEND_COLOR, BLEND_DIRS } from './sprites.js';

/* ไทล์พื้น */
export const T = {
  GRASS: 0, FLOWER: 1, DIRT: 2, PATH: 3, WATER: 4, SAND: 5,
  TREE: 6, ROCK: 7, WALL: 8, ROOF: 9, DOOR: 10, FENCE: 11, SIGN: 12,
  SHALLOW: 13, TALLGRASS: 14, STONEPATH: 15, BRIDGE: 16,
  GRAVE: 17, STATUE: 18, BARREL: 19, LAMP: 20, CHEST: 21, CAVE: 22, WELL: 23,
  PEBBLE: 24, MUSHROOM: 25, BUSH: 26, STUMP: 27, ROOFTOP: 28, WALLWIN: 29,
  ASH: 30, LAVA: 31, HELLTREE: 32, HELLROCK: 33, BONE: 34, PORTAL: 35,
};

const SOLID = new Set([
  T.WATER, T.TREE, T.ROCK, T.WALL, T.ROOF, T.FENCE, T.SIGN,
  T.GRAVE, T.STATUE, T.BARREL, T.LAMP, T.CHEST, T.CAVE, T.WELL,
  T.BUSH, T.STUMP, T.ROOFTOP, T.WALLWIN,
  T.HELLTREE, T.HELLROCK,
]);

/** ไทล์ที่ทำดาเมจจึงยืนทับ (ลาว) */
export const HURT_TILES = new Set([T.LAVA]);

export const SPRITE_OF_TILE = {
  [T.GRASS]: 't_grass', [T.FLOWER]: 't_flower', [T.DIRT]: 't_dirt', [T.PATH]: 't_path',
  [T.WATER]: 't_water', [T.SAND]: 't_sand', [T.TREE]: 't_tree', [T.ROCK]: 't_rock',
  [T.WALL]: 't_wall', [T.ROOF]: 't_roof', [T.DOOR]: 't_door', [T.FENCE]: 't_fence',
  [T.SIGN]: 't_sign', [T.SHALLOW]: 't_shallow', [T.TALLGRASS]: 't_tallgrass',
  [T.STONEPATH]: 't_stonepath', [T.BRIDGE]: 't_bridge', [T.GRAVE]: 't_grave',
  [T.STATUE]: 't_statue', [T.BARREL]: 't_barrel', [T.LAMP]: 't_lamp',
  [T.CHEST]: 't_chest', [T.CAVE]: 't_cave', [T.WELL]: 't_well',
  [T.PEBBLE]: 't_pebble', [T.MUSHROOM]: 't_mushroom', [T.BUSH]: 't_bush',
  [T.STUMP]: 't_stump', [T.ROOFTOP]: 't_rooftop', [T.WALLWIN]: 't_wallwin',
  [T.ASH]: 't_ash', [T.LAVA]: 't_lava', [T.HELLTREE]: 't_helltree',
  [T.HELLROCK]: 't_hellrock', [T.BONE]: 't_bone', [T.PORTAL]: 't_portal',
};

const MINI_COLOR = {
  [T.GRASS]: '#2f6b39', [T.FLOWER]: '#3a7d44', [T.DIRT]: '#6b5235', [T.PATH]: '#8a7454',
  [T.WATER]: '#2b5f9e', [T.SAND]: '#a89263', [T.TREE]: '#1f5429', [T.ROCK]: '#4d545e',
  [T.WALL]: '#8a7a63', [T.ROOF]: '#8a352e', [T.DOOR]: '#4a3020', [T.FENCE]: '#7a6240',
  [T.SIGN]: '#8a6a45', [T.SHALLOW]: '#4d8fc9', [T.TALLGRASS]: '#245c2e',
  [T.STONEPATH]: '#9a9384', [T.BRIDGE]: '#a8824a', [T.GRAVE]: '#8a8f99',
  [T.STATUE]: '#c9cdd6', [T.BARREL]: '#a8824a', [T.LAMP]: '#ffd76a',
  [T.CHEST]: '#ffc94d', [T.CAVE]: '#12141f', [T.WELL]: '#6b7280',
  [T.PEBBLE]: '#2f6b39', [T.MUSHROOM]: '#2f6b39', [T.BUSH]: '#1f5429', [T.STUMP]: '#1f5429',
  [T.ROOFTOP]: '#a8433a', [T.WALLWIN]: '#7fb6ff',
  [T.ASH]: '#463a4c', [T.LAVA]: '#e05530', [T.HELLTREE]: '#241d28', [T.HELLROCK]: '#4a3a52',
  [T.BONE]: '#d8d2c0', [T.PORTAL]: '#b98bff',
};

/* ── RNG แบบ deterministic ── */
export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class World {
  /** @param {{hell?: boolean}} [opts] hell = true → สร้างดินแดนมารแทนพืดหญ้า */
  constructor(opts = {}) {
    this.w = CONFIG.MAP_W;
    this.h = CONFIG.MAP_H;
    this.tiles = new Uint8Array(this.w * this.h);
    this.npcSpots = [];
    this.signs = [];
    this.chests = [];
    this.portals = [];          // ประตูกลางแมพ — เดินเข้าแล้วเด้งไปอีกแมพ
    this.spawn = { x: 0, y: 0 };
    this.bossSpot = { x: 0, y: 0 };
    this.graveCenter = { x: 0, y: 0 };
    this.caveSpot = { x: 0, y: 0 };
    this.hell = !!opts.hell;
    this.zoneLabel = this.hell ? 'ดินแดนมาร' : 'หมู่บ้านโนบอดี้';
    this.rng = mulberry32(this.hell ? CONFIG.HELL_SEED : CONFIG.SEED);
    this.generate();
    this.bakeGround();
    this.buildMinimap();
  }

  /* ═══════════ อบพื้นทั้งแผนที่เป็นแคนวาสเดียว ═══════════
     เหตุผลด้านประสิทธิภาพ: การผสมขอบต้องเรียก drawImage เพิ่มหลายพันครั้งต่อเฟรม
     วัดแล้วทำให้ FPS ตกจาก 128 → 46 การอบครั้งเดียวแล้วบลิตทีละเฟรมแก้ปัญหานี้
     ส่วนไทล์ที่มีอนิเมชัน (น้ำ) จะถูกวาดทับทีละเฟรมจากรายการที่เตรียมไว้ */
  bakeGround() {
    const TS = CONFIG.TILE;
    const c = document.createElement('canvas');
    c.width = this.w * TS;
    c.height = this.h * TS;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;

    // ชั้นที่ 1 — ไทล์พื้น (อนิเมชันใช้เฟรม 0 ไว้ก่อน)
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const spr = SPR[SPRITE_OF_TILE[this.get(x, y)]];
        if (!spr) continue;
        const f = spr.anim ? 0 : (tileHash(x, y) % spr.frames.length);
        g.drawImage(spr.frames[f] || spr.frames[0], x * TS, y * TS);
      }
    }

    // ชั้นที่ 2 — ผสมขอบกับไทล์ข้างเคียงที่อยู่ชั้นสูงกว่า
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const lv = BLEND_LEVEL[this.get(x, y)];
        if (!lv) continue;
        for (let d = 0; d < 8; d++) {
          const n = this.get(x + BLEND_DIRS[d][0], y + BLEND_DIRS[d][1]);
          const nlv = BLEND_LEVEL[n];
          if (!nlv || nlv <= lv) continue;
          const m = BLEND[BLEND_COLOR[n]];
          if (m && m[d]) g.drawImage(m[d], x * TS, y * TS);
        }
      }
    }
    this.groundCanvas = c;

    // จุดไฟในโลก (ตะเกียง · หน้าต่างบ้าน) — ใช้เป็นแหล่งแสงอุ่นตอนกลางคืน
    // เก็บแบบอาเรย์แบน [x, y, ความแรง] เพื่อลดภาระ GC
    this.lightSpots = [];
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const t = this.get(x, y);
        if (t === T.LAMP) this.lightSpots.push(x * TS + 8, y * TS + 9, 1);
        else if (t === T.WALLWIN) this.lightSpots.push(x * TS + 8, y * TS + 8, 0.55);
      }
    }

    // รายการไทล์อนิเมชัน (เก็บแบบอาเรย์แบน เพื่อลดภาระ GC)
    this.animatedTiles = [];
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const spr = SPR[SPRITE_OF_TILE[this.get(x, y)]];
        if (spr && spr.anim) this.animatedTiles.push(x, y);
      }
    }
  }

  /** วาดพื้นช่วงหนึ่งใหม่ในแคนวาสที่อบไว้ (ใช้เมื่อไทล์เปลี่ยนกลางเกม เช่นเปิดหีบ) */
  repaintRegion(rx, ry, rw, rh) {
    const TS = CONFIG.TILE;
    const g = this.groundCanvas.getContext('2d');
    const x0 = Math.max(0, rx), y0 = Math.max(0, ry);
    const x1 = Math.min(this.w - 1, rx + rw - 1), y1 = Math.min(this.h - 1, ry + rh - 1);
    if (x1 < x0 || y1 < y0) return;
    g.clearRect(x0 * TS, y0 * TS, (x1 - x0 + 1) * TS, (y1 - y0 + 1) * TS);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const spr = SPR[SPRITE_OF_TILE[this.get(x, y)]];
        if (!spr) continue;
        const f = spr.anim ? 0 : (tileHash(x, y) % spr.frames.length);
        g.drawImage(spr.frames[f] || spr.frames[0], x * TS, y * TS);
      }
    }
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const lv = BLEND_LEVEL[this.get(x, y)];
        if (!lv) continue;
        for (let d = 0; d < 8; d++) {
          const n = this.get(x + BLEND_DIRS[d][0], y + BLEND_DIRS[d][1]);
          const nlv = BLEND_LEVEL[n];
          if (!nlv || nlv <= lv) continue;
          const m = BLEND[BLEND_COLOR[n]];
          if (m && m[d]) g.drawImage(m[d], x * TS, y * TS);
        }
      }
    }
  }

  idx(x, y) { return y * this.w + x; }
  get(x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return T.TREE;
    return this.tiles[y * this.w + x];
  }
  set(x, y, v) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.tiles[y * this.w + x] = v;
  }
  isSolidTile(v) { return SOLID.has(v); }
  solidAtPx(px, py) {
    return this.isSolidTile(this.get(Math.floor(px / CONFIG.TILE), Math.floor(py / CONFIG.TILE)));
  }

  /* ═══════════ สร้างแผนที่ ═══════════ */
  generate() {
    const r = this.rng;
    const { w, h } = this;
    if (this.hell) { this.generateHell(r); return; }

    // 1. พื้นฐานหญ้า + ดอกไม้
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) this.set(x, y, r() > 0.93 ? T.FLOWER : T.GRASS);
    }

    // 2. ขอบแผนที่เป็นป่า
    for (let x = 0; x < w; x++) {
      this.set(x, 0, T.TREE); this.set(x, 1, T.TREE);
      this.set(x, h - 1, T.TREE); this.set(x, h - 2, T.TREE);
    }
    for (let y = 0; y < h; y++) {
      this.set(0, y, T.TREE); this.set(1, y, T.TREE);
      this.set(w - 1, y, T.TREE); this.set(w - 2, y, T.TREE);
    }

    // 3. บึงน้ำ 2 แห่ง
    this.blob(Math.floor(w * 0.20), Math.floor(h * 0.32), 9, 6, T.WATER);
    this.blob(Math.floor(w * 0.78), Math.floor(h * 0.70), 8, 7, T.WATER);

    // 4. แม่น้ำพาดผ่านแนวเหนือ-ใต้ (เส้นโค้ง)
    const riverX = Math.floor(w * 0.62);
    for (let y = 3; y < h - 3; y++) {
      const off = Math.round(Math.sin(y * 0.16) * 3);
      const width = 2 + (Math.sin(y * 0.09) > 0.6 ? 1 : 0);
      for (let d = 0; d < width; d++) this.set(riverX + off + d, y, T.WATER);
    }

    // 5. ปรับชายฝั่งเป็น 3 ชั้น: น้ำ → น้ำตื้น → ทราย (ดูเป็นธรรมชาติกว่าเดิมมาก)
    this.ringAround(T.WATER, T.SHALLOW, 1);
    this.ringAround(T.SHALLOW, T.SAND, 1);

    // 6. ป่าทึบ 5 กลุ่ม
    for (let i = 0; i < 5; i++) {
      this.blob(
        6 + Math.floor(r() * (w - 12)),
        6 + Math.floor(r() * (h - 12)),
        3 + Math.floor(r() * 4), 3 + Math.floor(r() * 3), T.TREE,
      );
    }

    // 7. ทุ่งหญ้าสูง 7 แห่ง — ที่มอนชุม (เดินผ่านได้)
    for (let i = 0; i < 7; i++) {
      this.blob(
        5 + Math.floor(r() * (w - 10)),
        5 + Math.floor(r() * (h - 10)),
        3 + Math.floor(r() * 3), 3 + Math.floor(r() * 2), T.TALLGRASS,
      );
    }

    // 8. หินกระจัดกระจาย
    for (let i = 0; i < 80; i++) {
      const x = 4 + Math.floor(r() * (w - 8));
      const y = 4 + Math.floor(r() * (h - 8));
      const t = this.get(x, y);
      if (t === T.GRASS || t === T.FLOWER) this.set(x, y, T.ROCK);
    }

    // 9. หมู่บ้าน
    this.buildVillage(Math.floor(w / 2) - 13, Math.floor(h / 2) - 9);

    // 10. เขตสุสาน (ตะวันตกเฉียงเหนือ)
    this.buildGraveyard(8, 6);

    // 11. ปากถ้ำ (ตะวันออกเฉียงใต้)
    this.buildCave(Math.floor(w * 0.84), Math.floor(h * 0.74));

    // 12. ลานบอส (ตะวันออก) + สะพานข้ามแม่น้ำไปถึง
    const bx = Math.floor(w * 0.76), by = Math.floor(h * 0.28);
    this.clearRect(bx - 6, by - 5, 13, 11, T.DIRT);
    this.set(bx - 3, by - 2, T.STATUE);
    this.bossSpot = { x: bx * CONFIG.TILE, y: by * CONFIG.TILE };
    this.buildBridge(riverX, by);

    // 13. หีบสมบัติ 7 จุด ในที่ที่ต้องออกไปหาจริง ๆ
    this.placeChests();

    // 14. ของประดับเล็ก ๆ กระจายบนหญ้า — ทำให้โลกไม่โล่งและไม่ซ้ำ
    for (let i = 0; i < 760; i++) {
      const x = 3 + Math.floor(r() * (w - 6));
      const y = 3 + Math.floor(r() * (h - 6));
      const t = this.get(x, y);
      if (t !== T.GRASS && t !== T.FLOWER) continue;
      const roll = r();
      if (roll < 0.58) this.set(x, y, T.PEBBLE);
      else if (roll < 0.80) this.set(x, y, T.MUSHROOM);
      else if (roll < 0.93) this.set(x, y, T.BUSH);
      else this.set(x, y, T.STUMP);
    }

    // 15. ป้ายบอกทาง
    this.signs = [
      { x: this.village.x + 13, y: this.village.y + this.village.h + 1, zone: 'หมู่บ้านโนบอดี้' },
      { x: Math.floor(w / 2), y: 4, zone: 'เขตสุสาน' },
      { x: Math.floor(w * 0.82), y: Math.floor(h * 0.72), zone: 'ปากถ้ำ' },
      { x: bx, y: by + 6, zone: 'ลานบอสโลก' },
    ];
    for (const s of this.signs) this.set(s.x, s.y, T.SIGN);

    // 16. ประตูไปดินแดนมาร์ — เอียงตะวันออกเฉียงใต้ของแมพ (ต้องเดินไปเจอเอง)
    const portalX = Math.floor(w * 0.88), portalY = Math.floor(h * 0.40);
    let tries = 0;
    while (this.isSolidTile(this.get(portalX, portalY)) && tries++ < 30) {
      this.set(portalX, portalY, T.DIRT);
    }
    this.set(portalX, portalY, T.PORTAL);
    this.portals = [{
      tx: portalX, ty: portalY, x: portalX * CONFIG.TILE, y: portalY * CONFIG.TILE,
      to: 'hell', spawn: null,
    }];
  }

  blob(cx, cy, rx, ry, v) {
    for (let y = -ry - 1; y <= ry + 1; y++) {
      for (let x = -rx - 1; x <= rx + 1; x++) {
        const d = (x * x) / (rx * rx) + (y * y) / (ry * ry);
        if (d > 1 + (this.rng() - 0.5) * 0.55) continue;
        this.set(cx + x, cy + y, v);
      }
    }
  }

  /* ═══════════ ดินแดนมาร์ (โซน 2) ═══════════
     พื้นเถ้าภูเขา + ทะเลสาปลาว + ต้นไม้ตาย
     seed คงที่ → แมพเดิมทุกครั้ง ตรวจซ้ำได้เหมือนแมพแรก */
  generateHell(r) {
    const { w, h } = this;

    // 1. พื้นทั้งหมดเป็นเถ้า
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) this.set(x, y, T.ASH);

    // 2. กรอบแผนที่เป็นต้นไม้ตาย
    for (let x = 0; x < w; x++) {
      this.set(x, 0, T.HELLTREE); this.set(x, 1, T.HELLTREE);
      this.set(x, h - 1, T.HELLTREE); this.set(x, h - 2, T.HELLTREE);
    }
    for (let y = 0; y < h; y++) {
      this.set(0, y, T.HELLTREE); this.set(1, y, T.HELLTREE);
      this.set(w - 1, y, T.HELLTREE); this.set(w - 2, y, T.HELLTREE);
    }

    // 3. ทะเลสาปลาว 2 แห่ง (มีอนิเมชัน + โดนดาเมจ)
    this.blob(Math.floor(w * 0.22), Math.floor(h * 0.70), 8, 6, T.LAVA);
    this.blob(Math.floor(w * 0.72), Math.floor(h * 0.26), 7, 5, T.LAVA);
    // หลงลาวเล็ก ๆ กระเจิง
    for (let i = 0; i < 26; i++) {
      const x = 6 + Math.floor(r() * (w - 12)), y = 6 + Math.floor(r() * (h - 12));
      const t = this.get(x, y);
      if (t === T.ASH || t === T.HELLROCK || t === T.BONE) this.set(x, y, T.LAVA);
    }

    // 4. ป่าตาย 6 กลุ่ม
    for (let i = 0; i < 6; i++) {
      this.blob(6 + Math.floor(r() * (w - 12)), 6 + Math.floor(r() * (h - 12)),
        3 + Math.floor(r() * 4), 3 + Math.floor(r() * 3), T.HELLTREE);
    }

    // 5. หินนรกกระจ่าง
    for (let i = 0; i < 90; i++) {
      const x = 4 + Math.floor(r() * (w - 8)), y = 4 + Math.floor(r() * (h - 8));
      const t = this.get(x, y);
      if (t === T.ASH || t === T.HELLTREE) this.set(x, y, T.HELLROCK);
    }

    // 6. กะโหลกร่างกระจัด
    for (let i = 0; i < 120; i++) {
      const x = 3 + Math.floor(r() * (w - 6)), y = 3 + Math.floor(r() * (h - 6));
      const t = this.get(x, y);
      if (t === T.ASH) this.set(x, y, T.BONE);
    }

    // 7. ลานกลาง + ประตูกลับไปหมู่บ้าน
    const cx = Math.floor(w * 0.5), cy = Math.floor(h * 0.52);
    this.clearRect(cx - 6, cy - 5, 13, 11, T.PATH);
    this.set(cx - 3, cy - 2, T.STATUE);
    this.bossSpot = { x: cx * CONFIG.TILE, y: cy * CONFIG.TILE };
    const portalX = cx, portalY = cy + 4;
    this.set(portalX, portalY, T.PORTAL);
    this.portals = [{
      tx: portalX, ty: portalY, x: portalX * CONFIG.TILE, y: portalY * CONFIG.TILE,
      to: 'field', spawn: { tx: Math.floor(w * 0.60), ty: Math.floor(h * 0.58) },
    }];

    // 8. หินนรกตกแต่งรอบลาน
    for (const [dx, dy] of [[-4, -4], [4, -4], [-4, 4], [4, 4]]) this.set(cx + dx, cy + dy, T.HELLROCK);

    // 9. จุดเกิดผู้เล่น + NPC นักล่า
    this.spawn = { x: (cx + 2) * CONFIG.TILE, y: (cy - 3) * CONFIG.TILE };
    this.npcSpots = [{
      id: 'hunter', x: (cx - 4) * CONFIG.TILE, y: (cy + 1) * CONFIG.TILE,
    }];
    this.village = { x: cx - 8, y: cy - 6, w: 17, h: 12 };
    this.hellCenter = { x: cx * CONFIG.TILE, y: cy * CONFIG.TILE };
  }

  ringAround(target, fill, depth) {
    const { w, h } = this;
    const copy = this.tiles.slice();
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        if (copy[y * w + x] !== target) continue;
        for (let dy = -depth; dy <= depth; dy++) {
          for (let dx = -depth; dx <= depth; dx++) {
            const nx = x + dx, ny = y + dy;
            if (nx < 1 || ny < 1 || nx >= w - 1 || ny >= h - 1) continue;
            const cur = copy[ny * w + nx];
            if (cur === T.GRASS || cur === T.FLOWER || cur === T.TALLGRASS
              || cur === T.PEBBLE || cur === T.MUSHROOM) this.set(nx, ny, fill);
          }
        }
      }
    }
  }

  clearRect(x, y, w, h, v) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, v);
  }

  house(x, y, w = 8, h = 7) {
    // สันหลังคา + กระเบื้อง
    for (let i = 0; i < w; i++) this.set(x + i, y, T.ROOFTOP);
    for (let j = 1; j <= 2; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, T.ROOF);
    // กำแพง (ตรงกลางเป็นพื้นภายใน เดินเข้าไปได้ทางประตู)
    for (let j = 3; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const edge = i === 0 || i === w - 1 || j === h - 1;
        this.set(x + i, y + j, edge ? T.WALL : T.DIRT);
      }
    }
    this.set(x + 1, y + 4, T.WALLWIN);
    this.set(x + w - 2, y + 4, T.WALLWIN);
    this.set(x + Math.floor(w / 2), y + h - 1, T.DOOR);
    this.set(x + w + 1, y + h - 1, T.SIGN);
  }

  buildVillage(vx, vy) {
    const VW = 26, VH = 19;
    this.clearRect(vx, vy, VW, VH, T.DIRT);
    // ถนนหินหลัก
    for (let i = 0; i < VW; i++) this.set(vx + i, vy + Math.floor(VH / 2), T.STONEPATH);
    for (let j = 0; j < VH; j++) this.set(vx + Math.floor(VW / 2), vy + j, T.STONEPATH);
    // ลานกลางหมู่บ้าน + บ่อน้ำ
    this.clearRect(vx + 10, vy + 7, 7, 5, T.STONEPATH);
    this.set(vx + 13, vy + 8, T.WELL);

    // รั้วล้อม (เว้นช่องทางเข้า 4 ช่อง)
    for (let i = 0; i < VW; i++) {
      if ((i > 3 && i < 8) || (i > 15 && i < 20)) continue;
      this.set(vx + i, vy, T.FENCE);
      this.set(vx + i, vy + VH - 1, T.FENCE);
    }
    for (let j = 0; j < VH; j++) {
      if ((j > 5 && j < 10) || (j > 12 && j < 16)) continue;
      this.set(vx, vy + j, T.FENCE);
      this.set(vx + VW - 1, vy + j, T.FENCE);
    }

    // บ้าน 4 หลัง
    this.house(vx + 3, vy + 2);
    this.house(vx + 16, vy + 2);
    this.house(vx + 3, vy + 12);
    this.house(vx + 16, vy + 12);

    // ของประดับรอบลานกลาง
    for (const [dx, dy] of [[9, 7], [9, 11], [17, 7], [17, 11]]) this.set(vx + dx, vy + dy, T.BARREL);
    for (const [dx, dy] of [[11, 6], [15, 6], [11, 12], [15, 12]]) this.set(vx + dx, vy + dy, T.LAMP);
    this.set(vx + 12, vy + 3, T.STATUE);

    this.npcSpots = [
      { id: 'elder', x: (vx + 13) * CONFIG.TILE, y: (vy + 6) * CONFIG.TILE },
      { id: 'merchant', x: (vx + 7) * CONFIG.TILE, y: (vy + 9) * CONFIG.TILE },
      { id: 'gm', x: (vx + 19) * CONFIG.TILE, y: (vy + 9) * CONFIG.TILE },
      { id: 'guildmaster', x: (vx + 13) * CONFIG.TILE, y: (vy + 15) * CONFIG.TILE },
      { id: 'wizard', x: (vx + 3) * CONFIG.TILE, y: (vy + 15) * CONFIG.TILE },
      { id: 'afk_guy', x: (vx + 22) * CONFIG.TILE, y: (vy + 3) * CONFIG.TILE },
    ];

    this.spawn = { x: (vx + 13) * CONFIG.TILE, y: (vy + 10) * CONFIG.TILE };
    this.village = { x: vx, y: vy, w: VW, h: VH };
  }

  buildGraveyard(gx, gy) {
    const GW = 16, GH = 11;
    this.clearRect(gx, gy, GW, GH, T.DIRT);
    for (let i = 0; i < GW; i++) this.set(gx + i, gy + Math.floor(GH / 2), T.STONEPATH);
    for (let j = 0; j < GH; j++) this.set(gx + Math.floor(GW / 2), gy + j, T.STONEPATH);
    // หลุมศพเรียงเป็นแถว (เว้นบ้างให้ดูไม่เป็นตารางเป๊ะ)
    for (let j = 1; j < GH - 1; j += 2) {
      for (let i = 1; i < GW - 1; i += 2) {
        if (Math.abs(j - Math.floor(GH / 2)) < 1) continue;
        if (Math.abs(i - Math.floor(GW / 2)) < 1) continue;
        if (this.rng() < 0.22) continue;
        this.set(gx + i, gy + j, T.GRAVE);
      }
    }
    this.set(gx + Math.floor(GW / 2), gy + 1, T.STATUE);
    for (const [dx, dy] of [[2, 1], [GW - 3, 1], [2, GH - 2], [GW - 3, GH - 2]]) {
      this.set(gx + dx, gy + dy, T.LAMP);
    }
    this.graveCenter = { x: (gx + GW / 2) * CONFIG.TILE, y: (gy + GH / 2) * CONFIG.TILE };
  }

  buildCave(cx, cy) {
    this.blob(cx, cy, 6, 4, T.ROCK);
    this.blob(cx, cy, 4, 2, T.DIRT);
    this.set(cx, cy, T.CAVE);
    for (const [dx, dy] of [[-4, -2], [4, -2], [-4, 3], [4, 3]]) this.set(cx + dx, cy + dy, T.LAMP);
    this.caveSpot = { x: cx * CONFIG.TILE, y: cy * CONFIG.TILE };
  }

  buildBridge(riverX, ty) {
    const y0 = ty;
    for (let x = riverX - 7; x <= riverX + 8; x++) {
      const t = this.get(x, y0);
      if (t === T.WATER || t === T.SHALLOW || t === T.SAND) {
        this.set(x, y0, T.BRIDGE);
        this.set(x, y0 + 1, T.BRIDGE);
      }
    }
    // ทางเดินดินเชื่อมสะพานทั้งสองฝั่ง
    for (let x = riverX - 15; x <= riverX - 7; x++) {
      if (!this.isSolidTile(this.get(x, y0))) this.set(x, y0, T.PATH);
      if (!this.isSolidTile(this.get(x, y0 + 1))) this.set(x, y0 + 1, T.PATH);
    }
    for (let x = riverX + 9; x <= riverX + 18; x++) {
      if (!this.isSolidTile(this.get(x, y0))) this.set(x, y0, T.PATH);
      if (!this.isSolidTile(this.get(x, y0 + 1))) this.set(x, y0 + 1, T.PATH);
    }
  }

  placeChests() {
    const r = this.rng;
    const spots = [
      [Math.floor(this.w * 0.14), Math.floor(this.h * 0.16)],
      [Math.floor(this.w * 0.10), Math.floor(this.h * 0.62)],
      [Math.floor(this.w * 0.42), Math.floor(this.h * 0.14)],
      [Math.floor(this.w * 0.86), Math.floor(this.h * 0.44)],
      [Math.floor(this.w * 0.30), Math.floor(this.h * 0.82)],
      [Math.floor(this.w * 0.55), Math.floor(this.h * 0.56)],
      [Math.floor(this.w * 0.74), Math.floor(this.h * 0.22)],
    ];
    for (const [x, y] of spots) {
      let px = x, py = y, tries = 0;
      while (tries++ < 40 && this.isSolidTile(this.get(px, py))) {
        px = x + Math.floor(r() * 7) - 3;
        py = y + Math.floor(r() * 7) - 3;
      }
      if (this.isSolidTile(this.get(px, py))) continue;
      this.set(px, py, T.CHEST);
      this.chests.push({
        id: 'chest' + this.chests.length,
        x: px * CONFIG.TILE, y: py * CONFIG.TILE,
        tx: px, ty: py, opened: false,
      });
    }
  }

  inVillage(px, py) {
    const v = this.village;
    const tx = Math.floor(px / CONFIG.TILE), ty = Math.floor(py / CONFIG.TILE);
    return tx >= v.x - 1 && tx < v.x + v.w + 1 && ty >= v.y - 1 && ty < v.y + v.h + 1;
  }

  inGraveyard(px, py) {
    const g = this.graveCenter;
    return Math.hypot(px - g.x, py - g.y) < 9 * CONFIG.TILE;
  }

  inCaveArea(px, py) {
    const c = this.caveSpot;
    return Math.hypot(px - c.x, py - c.y) < 7 * CONFIG.TILE;
  }

  /** โซนปัจจุบัน — ใช้ทั้งแสดงชื่อและเลือกชนิดมอนที่จะเกิด */
  regionAt(px, py) {
    if (this.hell) {
      if (this.inVillage(px, py)) return 'village';
      if (Math.hypot(px - this.hellCenter.x, py - this.hellCenter.y) < 9 * CONFIG.TILE) return 'hellcore';
      return 'hellfield';
    }
    if (this.inVillage(px, py)) return 'village';
    if (this.inGraveyard(px, py)) return 'graveyard';
    if (this.inCaveArea(px, py)) return 'cave';
    const tx = Math.floor(px / CONFIG.TILE), ty = Math.floor(py / CONFIG.TILE);
    const t = this.get(tx, ty);
    if (t === T.TALLGRASS) return 'tallgrass';
    if (t === T.SAND || t === T.SHALLOW) return 'shore';
    return 'field';
  }

  zoneNameAt(px, py) {
    const r = this.regionAt(px, py);
    if (this.hell) {
      if (r === 'village') return 'ค่ายนักล่าอาคม';
      if (r === 'hellcore') return 'ดอนผู้นอบอุ่น';
      return HELL_ZONE_NAMES[(Math.floor(px / (CONFIG.TILE * 24)) + Math.floor(py / (CONFIG.TILE * 18))) % HELL_ZONE_NAMES.length];
    }
    if (r === 'village') return 'หมู่บ้านโนบอดี้';
    if (r === 'graveyard') return 'เขตสุสาน';
    if (r === 'cave') return 'เนินถ้ำ';
    if (r === 'tallgrass') return 'ทุ่งหญ้าสูง';
    if (r === 'shore') return 'ริมบึง';
    const tx = Math.floor(px / CONFIG.TILE), ty = Math.floor(py / CONFIG.TILE);
    const n = ZONE_NAMES.length;
    const i = ((Math.floor(tx / 22) * 3 + Math.floor(ty / 16) * 7) % n + n) % n;
    return ZONE_NAMES[i];
  }

  chestNear(px, py, range = 30) {
    let best = null, bd = range * range;
    for (const c of this.chests) {
      if (c.opened) continue;
      const d = (c.x + 8 - px) ** 2 + (c.y + 8 - py) ** 2;
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }

  signNear(px, py, range = 34) {
    for (const s of this.signs) {
      const d = Math.hypot(s.x * CONFIG.TILE + 8 - px, s.y * CONFIG.TILE + 8 - py);
      if (d < range) return s;
    }
    return null;
  }

  randomSpot(rng, opts = {}) {
    const { awayFrom = null, minDist = 0, outsideVillage = false, region = null, tries = 80 } = opts;
    for (let i = 0; i < tries; i++) {
      const x = 3 + Math.floor(rng() * (this.w - 6));
      const y = 3 + Math.floor(rng() * (this.h - 6));
      if (this.isSolidTile(this.get(x, y))) continue;
      const px = x * CONFIG.TILE + CONFIG.TILE / 2;
      const py = y * CONFIG.TILE + CONFIG.TILE / 2;
      if (outsideVillage && this.inVillage(px, py)) continue;
      if (region && this.regionAt(px, py) !== region) continue;
      if (awayFrom && Math.hypot(px - awayFrom.x, py - awayFrom.y) < minDist) continue;
      return { x: px, y: py };
    }
    return { ...this.spawn };
  }

  /* ── มินิแมป (วาดครั้งเดียว) ── */
  buildMinimap() {
    const c = document.createElement('canvas');
    c.width = this.w; c.height = this.h;
    const g = c.getContext('2d');
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        g.fillStyle = MINI_COLOR[this.get(x, y)] || '#000';
        g.fillRect(x, y, 1, 1);
      }
    }
    this.minimapCanvas = c;
  }

  drawMinimap(g, cw, ch, player, others) {
    g.imageSmoothingEnabled = false;
    g.fillStyle = '#070a12';
    g.fillRect(0, 0, cw, ch);
    g.drawImage(this.minimapCanvas, 0, 0, this.w, this.h, 0, 0, cw, ch);
    const sx = cw / (this.w * CONFIG.TILE);
    const sy = ch / (this.h * CONFIG.TILE);

    g.fillStyle = '#ffc94d';
    for (const c of this.chests) {
      if (c.opened) continue;
      g.fillRect(c.x * sx - 1, c.y * sy - 1, 3, 3);
    }
    g.fillStyle = '#ff6b6b';
    for (const m of others.monsters) {
      if (m.dead) continue;
      g.fillRect(m.x * sx - 1, m.y * sy - 1, 2, 2);
    }
    g.fillStyle = '#7fe6c0';
    for (const n of others.npcs) g.fillRect(n.x * sx - 1, n.y * sy - 1, 2, 2);
    if (others.pets) {
      for (const pt of others.pets) {
        g.fillStyle = pt.rarity.color;
        g.fillRect(pt.x * sx - 1, pt.y * sy - 1, 2, 2);
      }
    }
    if (others.boss && !others.boss.dead) {
      g.fillStyle = '#ffc94d';
      g.fillRect(others.boss.x * sx - 2, others.boss.y * sy - 2, 4, 4);
    }
    g.fillStyle = (performance.now() % 900) < 600 ? '#ffffff' : '#ffe9a8';
    g.fillRect(player.x * sx - 2, player.y * sy - 2, 4, 4);
    g.strokeStyle = 'rgba(255,255,255,.35)';
    g.lineWidth = 1;
    g.strokeRect(player.x * sx - 3.5, player.y * sy - 3.5, 7, 7);
  }
}
