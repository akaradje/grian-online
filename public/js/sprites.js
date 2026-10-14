/* ═══════════════════════════════════════════════════════════
   sprites.js — ระบบพิกเซลอาร์ต
   วาดด้วย primitive ลงแคนวาสขนาดจริง (16×16) แล้วค่อยขยาย
   → ได้พิกเซลจริงทุกเม็ด และไม่ต้องโหลดไฟล์ภายนอกเลย
   ═══════════════════════════════════════════════════════════ */

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  return c;
}

function px(g, x, y, c) { g.fillStyle = c; g.fillRect(x | 0, y | 0, 1, 1); }
function rc(g, x, y, w, h, c) { g.fillStyle = c; g.fillRect(x | 0, y | 0, w | 0, h | 0); }

/** วงรีทึบแบบพิกเซล (สูตร midpoint อย่างง่าย) */
function ell(g, cx, cy, rx, ry, c) {
  g.fillStyle = c;
  for (let y = -ry; y <= ry; y++) {
    for (let x = -rx; x <= rx; x++) {
      const v = (x * x) / (rx * rx) + (y * y) / (ry * ry);
      if (v <= 1.02) g.fillRect((cx + x) | 0, (cy + y) | 0, 1, 1);
    }
  }
}

/** เส้นตรงแบบพิกเซล (Bresenham) */
function line(g, x0, y0, x1, y1, c) {
  g.fillStyle = c;
  let dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
  let sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, e = dx - dy;
  for (;;) {
    g.fillRect(x0, y0, 1, 1);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * e;
    if (e2 > -dy) { e -= dy; x0 += sx; }
    if (e2 < dx) { e += dx; y0 += sy; }
  }
}

/** hash เสถียร ใช้ทำ noise ให้ผลเดิมทุกครั้ง */
function hash(x, y, s) {
  let h = (x * 374761393 + y * 668265263 + s * 2246822519) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

/** เติมขอบเข้ม 1px รอบรูปทรงที่วาดไว้ (ทำให้สไปรต์อ่านออกบนพื้นทุกสี) */
export function addOutline(canvas, color) {
  const w = canvas.width, h = canvas.height;
  const g = canvas.getContext('2d');
  const src = g.getImageData(0, 0, w, h).data;
  const out = makeCanvas(w, h);
  const og = out.getContext('2d');
  og.drawImage(canvas, 0, 0);
  og.fillStyle = color;
  const N = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (src[(y * w + x) * 4 + 3] > 0) continue;
      let touch = false;
      for (const [dx, dy] of N) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        if (src[(ny * w + nx) * 4 + 3] > 0) { touch = true; break; }
      }
      if (touch) og.fillRect(x, y, 1, 1);
    }
  }
  return out;
}

/* ─────────────── พาเลตต์ ─────────────── */
const OUT = '#0e0c1a';

export const CLASS_PAL = {
  loot:     { hair: '#6b3f1d', shirt: '#3f6fb5', pants: '#2b3a55', skin: '#f0c49b', eye: '#241d33' },
  debt:     { hair: '#2a2438', shirt: '#6b3fa0', pants: '#2a2438', skin: '#e8b98e', eye: '#241d33' },
  troll:    { hair: '#3d2b1a', shirt: '#b5453f', pants: '#3a2f2a', skin: '#e8b98e', eye: '#241d33' },
  cafe:     { hair: '#141018', shirt: '#2f9e8f', pants: '#2b3a55', skin: '#f0c49b', eye: '#241d33' },
  fivestar: { hair: '#e8c25a', shirt: '#e8e2f0', pants: '#c9a227', skin: '#f5d2ad', eye: '#241d33' },
  admin:    { hair: '#2b2b33', shirt: '#4a5a6b', pants: '#232a33', skin: '#e8b98e', eye: '#241d33' },
};

const NPC_PAL = {
  elder:      { hair: '#d8d8e0', shirt: '#8a7a5c', pants: '#4a4038', skin: '#e0b98e' },
  merchant:   { hair: '#3d2b1a', shirt: '#c9852f', pants: '#5c4430', skin: '#e8b98e' },
  gm:         { hair: '#1a1a22', shirt: '#2f6fb5', pants: '#1e2438', skin: '#f0c49b' },
  guild:      { hair: '#8a3f2f', shirt: '#7a3f8a', pants: '#3a2f4a', skin: '#e8b98e' },
  wizard:     { hair: '#e8e8f0', shirt: '#4a3f8a', pants: '#2a2438', skin: '#e8b98e' },
  afk:        { hair: '#5a5a66', shirt: '#555f6b', pants: '#3a3a44', skin: '#c9b09a' },
  hunter:     { hair: '#2a1c18', shirt: '#8a2f2f', pants: '#332222', skin: '#d9a47c' },
  intern:     { hair: '#1c2b3a', shirt: '#248f8f', pants: '#1e2638', skin: '#f0c49b' },
};

/* ─────────────── มนุษย์ 16×16 ─────────────── */
function drawHuman(g, p, frame, o = {}) {
  const yOff = frame === 1 ? 1 : 0;
  // ผ้าคลุมด้านหลัง (สำหรับสายเทพ/หัวหน้ากิลด์/แอดมิน)
  if (o.cape) {
    rc(g, 3, 8 + yOff, 10, 5, o.cape);
    px(g, 3, 13, o.cape); px(g, 12, 13, o.cape);
  }
  // หัว + แรเงาคาง
  rc(g, 5, 3 + yOff, 6, 5, p.skin);
  rc(g, 6, 7 + yOff, 4, 1, '#d9a57c');
  // ผม + ไฮไลต์เงาผมสไตล์อนิเมะ RPG
  rc(g, 4, 1 + yOff, 8, 2, p.hair);
  rc(g, 4, 3 + yOff, 1, 4, p.hair);
  rc(g, 11, 3 + yOff, 1, 4, p.hair);
  px(g, 6, 3 + yOff, p.hair); px(g, 9, 3 + yOff, p.hair);
  px(g, 6, 2 + yOff, 'rgba(255,255,255,0.28)');
  px(g, 8, 2 + yOff, 'rgba(255,255,255,0.22)');
  // ตา 2 ชั้น (ตาขาว + ตาดำ)
  px(g, 6, 4 + yOff, '#ffffff'); px(g, 9, 4 + yOff, '#ffffff');
  px(g, 6, 5 + yOff, p.eye || OUT); px(g, 9, 5 + yOff, p.eye || OUT);
  // ลำตัว + เกราะไหล่ + เข็มขัดทอง
  rc(g, 5, 8 + yOff, 6, 5, p.shirt);
  rc(g, 4, 8 + yOff, 2, 2, p.shirt);
  rc(g, 10, 8 + yOff, 2, 2, p.shirt);
  px(g, 7, 8 + yOff, '#ffffff'); px(g, 8, 8 + yOff, '#ffffff'); // คอปก
  rc(g, 5, 11 + yOff, 6, 1, '#261c14'); // เข็มขัด
  px(g, 7, 11 + yOff, '#ffc94d'); px(g, 8, 11 + yOff, '#ffc94d'); // หัวเข็มขัดทอง
  // แขน + มือ
  rc(g, 3, 9 + yOff, 1, 3, p.skin);
  rc(g, 12, 9 + yOff, 1, 3, p.skin);
  // ขา + รองเท้าบูต
  if (frame === 0) {
    rc(g, 5, 13, 2, 2, p.pants); rc(g, 9, 13, 2, 2, p.pants);
    rc(g, 5, 15, 2, 1, '#241d33'); rc(g, 9, 15, 2, 1, '#241d33');
  } else {
    rc(g, 4, 13, 2, 2, p.pants); rc(g, 10, 13, 2, 2, p.pants);
    rc(g, 4, 15, 2, 1, '#241d33'); rc(g, 10, 15, 2, 1, '#241d33');
  }
  // หมวก / เครื่องประดับหัว
  if (o.hat === 'wizard') {
    rc(g, 7, 0 + yOff, 2, 1, '#4a3f8a');
    rc(g, 5, 1 + yOff, 6, 1, '#4a3f8a');
    rc(g, 3, 2 + yOff, 10, 1, '#3a2f6a');
    px(g, 7, 1 + yOff, '#ffc94d');
  } else if (o.hat === 'cap') {
    rc(g, 4, 1 + yOff, 8, 2, '#c0392b');
    rc(g, 3, 2 + yOff, 3, 1, '#e74c3c');
  } else if (o.hat === 'crown' || o.crown) {
    rc(g, 5, 1 + yOff, 6, 2, '#ffc94d');
    px(g, 5, 0 + yOff, '#fff2c0'); px(g, 8, 0 + yOff, '#ff4d6b'); px(g, 10, 0 + yOff, '#fff2c0');
  } else if (o.hat === 'headset') {
    rc(g, 3, 3 + yOff, 1, 4, '#4ae8ff');
    rc(g, 12, 3 + yOff, 1, 4, '#4ae8ff');
    rc(g, 4, 1 + yOff, 8, 1, '#2f9e8f');
  }
  if (o.glasses) {
    rc(g, 5, 4 + yOff, 2, 2, '#111');
    rc(g, 9, 4 + yOff, 2, 2, '#111');
    px(g, 6, 4 + yOff, '#7fe0ff'); px(g, 10, 4 + yOff, '#7fe0ff');
    px(g, 7, 5 + yOff, '#111');
  }
  if (o.badge) { rc(g, 6, 9 + yOff, 2, 2, '#ffc94d'); }
  // อาวุธประจำตัวในมือขวา
  if (o.weapon === 'sword') {
    rc(g, 13, 3 + yOff, 2, 7, '#dce6f2');
    px(g, 13, 3 + yOff, '#ffffff');
    rc(g, 12, 9 + yOff, 4, 1, '#ffc94d');
    px(g, 13, 10 + yOff, '#8a5c2e');
  } else if (o.weapon === 'staff') {
    rc(g, 13, 4 + yOff, 1, 9, '#8a5c2e');
    rc(g, 12, 2 + yOff, 3, 3, '#ff5f3c');
    px(g, 13, 3 + yOff, '#fff2c0');
  } else if (o.weapon === 'dagger') {
    rc(g, 13, 6 + yOff, 2, 5, '#ff4d6b');
    px(g, 14, 7 + yOff, '#ffffff');
    rc(g, 1, 7 + yOff, 2, 4, '#ff4d6b');
  } else if (o.weapon === 'cyber') {
    rc(g, 13, 3 + yOff, 2, 8, '#4ae8ff');
    px(g, 14, 4 + yOff, '#ff4d8a'); px(g, 14, 7 + yOff, '#5fe89b');
  } else if (o.weapon === 'rapier') {
    rc(g, 13, 2 + yOff, 1, 8, '#fff2c0');
    rc(g, 12, 9 + yOff, 3, 2, '#ffc94d');
  } else if (o.weapon === 'hammer') {
    rc(g, 13, 5 + yOff, 1, 8, '#6b7280');
    rc(g, 11, 3 + yOff, 4, 3, '#b98bff');
    px(g, 12, 4 + yOff, '#ffffff');
  }
}

/* ─────────────── สร้างสไปรต์ทั้งหมด ─────────────── */
export const SPR = {};

function reg(id, frames, w = 16, h = 16, anim = false) { SPR[id] = { frames, w, h, anim }; }

/* ─────────────── ระบบผสมขอบ (autotile แบบ dither) ─────────────── */
const BAYER4 = [
  [0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5],
];

/* ระดับชั้นของพื้น — เลขมาก = ทับไทล์ที่น้อยกว่า */
export const BLEND_LEVEL = {
  0: 1,   // หญ้า
  1: 1,   // ดอกไม้
  14: 2,  // หญ้าสูง
  5: 3,   // ทราย
  2: 4,   // ดิน
  3: 5,   // ทางเดิน
  15: 6,  // ทางหิน
  4: 7,   // น้ำ
  13: 7,  // น้ำตื้น
  24: 1, 25: 1,   // ก้อนหินเล็ก · เห็ด (เดินผ่านได้)
  36: 2,  // พื้นไซเบอร์
  37: 7,  // สายธารดาต้า
};

/* สีประจำชั้น ใช้เป็นสีของแถบ dither */
export const BLEND_COLOR = {
  0: '#3f8f4a', 1: '#3f8f4a', 14: '#357a3f', 5: '#c9b079',
  2: '#8a6a45', 3: '#a8916b', 15: '#9a9384', 4: '#2f6fb5', 13: '#4d8fc9',
  24: '#3f8f4a', 25: '#3f8f4a',
  36: '#1b2845', 37: '#2ad4ff',
};

/* ลำดับทิศ: 0=N 1=NE 2=E 3=SE 4=S 5=SW 6=W 7=NW */
export const BLEND_DIRS = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]];

export const BLEND = {};   // BLEND[colorHex][dir] = canvas 16×16

function blendMask(dir, color) {
  const c = makeCanvas(16, 16);
  const g = c.getContext('2d');
  g.fillStyle = color;
  const BW = 4;
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      let d = 99, quad = true;
      switch (dir) {
        case 0: d = y; break;
        case 4: d = 15 - y; break;
        case 2: d = 15 - x; break;
        case 6: d = x; break;
        case 7: d = Math.min(x, y); if (x >= 8 || y >= 8) quad = false; break;
        case 1: d = Math.min(15 - x, y); if (x < 8 || y >= 8) quad = false; break;
        case 5: d = Math.min(x, 15 - y); if (x >= 8 || y < 8) quad = false; break;
        case 3: d = Math.min(15 - x, 15 - y); if (x < 8 || y < 8) quad = false; break;
        default: break;
      }
      if (!quad || d >= BW) continue;
      const t = 1 - d / BW;
      if (BAYER4[y & 3][x & 3] / 16 < t * 1.05) g.fillRect(x, y, 1, 1);
    }
  }
  return c;
}

export function buildBlend() {
  const colors = new Set(Object.values(BLEND_COLOR));
  for (const col of colors) {
    BLEND[col] = [];
    for (let d = 0; d < 8; d++) BLEND[col][d] = blendMask(d, col);
  }
}

export function buildSprites() {
  const P = 16;
  const T = 16;

  /* ── ผู้เล่น: 6 อาชีพ × 2 เฟรมเดิน (พร้อมอาวุธและเครื่องประดับประจำคลาส) ── */
  const heroOpts = {
    loot:     { weapon: 'sword' },
    debt:     { hat: 'wizard', weapon: 'staff' },
    troll:    { weapon: 'dagger' },
    cafe:     { hat: 'headset', weapon: 'cyber', glasses: true },
    fivestar: { hat: 'crown', weapon: 'rapier', cape: '#c0392b' },
    admin:    { hat: 'cap', badge: true, weapon: 'hammer', cape: '#2b3a55' },
  };
  for (const [cls, pal] of Object.entries(CLASS_PAL)) {
    const frames = [0, 1].map((f) => {
      const c = makeCanvas(P, P);
      drawHuman(c.getContext('2d'), pal, f, heroOpts[cls] || {});
      return addOutline(c, OUT);
    });
    reg('hero_' + cls, frames);
  }

  /* ── NPC ── */
  const npcCfg = {
    npc_elder: { pal: NPC_PAL.elder, o: {} },
    npc_merchant: { pal: NPC_PAL.merchant, o: { hat: 'cap' } },
    npc_gm: { pal: NPC_PAL.gm, o: { badge: true, hat: 'cap' } },
    npc_guild: { pal: NPC_PAL.guild, o: { hat: 'crown' } },
    npc_wizard: { pal: NPC_PAL.wizard, o: { hat: 'wizard' } },
    npc_afk: { pal: NPC_PAL.afk, o: { glasses: true } },
    npc_hunter: { pal: NPC_PAL.hunter, o: { hat: 'cap', badge: true } },
    npc_intern: { pal: NPC_PAL.intern, o: { hat: 'headset', glasses: true } },
  };
  for (const [id, cfg] of Object.entries(npcCfg)) {
    const frames = [0, 1].map((f) => {
      const c = makeCanvas(P, P);
      drawHuman(c.getContext('2d'), cfg.pal, f, cfg.o);
      return addOutline(c, OUT);
    });
    reg(id, frames);
  }
  // alias ป้องกันโค้ดเก่าอ้างชื่อ npc_guildmaster
  SPR['npc_guildmaster'] = SPR['npc_hunter'];

  /* ── หนูยักษ์ ── */
  reg('rat', [0, 1].map((f) => {
    const c = makeCanvas(P, P), g = c.getContext('2d');
    const fur = '#8a6a45', fur2 = '#6b5033', ear = '#c99a8a';
    ell(g, 7, 10, 5, 3, fur);
    ell(g, 11, 8, 3, 3, fur);
    ell(g, 10, 5, 1, 2, ear);
    ell(g, 13, 5, 1, 2, ear);
    line(g, 2, 9, 5, 11, fur2);
    line(g, 1, 8, 2, 9, fur2);
    px(g, 12, 7, '#e04b4b');
    px(g, 13, 9, '#f0d0c0');
    rc(g, 6, 12, 1, 2, fur2); rc(g, 9, 12, 1, 2, fur2);
    if (f === 1) { rc(g, 6, 11, 1, 2, fur2); rc(g, 10, 12, 1, 2, fur2); }
    return addOutline(c, OUT);
  }));

  /* ── สไลม์ขี้เกียจ ── */
  reg('slime', [0, 1].map((f) => {
    const c = makeCanvas(P, P), g = c.getContext('2d');
    const body = '#4ab86b', hi = '#7fe09b', dark = '#2f8a4c';
    const sq = f === 1 ? 1 : 0;
    ell(g, 8, 11 - sq, 6, 4 + sq, body);
    ell(g, 8, 9 - sq, 4, 2, hi);
    ell(g, 6, 13, 2, 1, dark);
    px(g, 6, 10, '#12331f'); px(g, 10, 10, '#12331f');
    rc(g, 7, 12, 3, 1, '#12331f');
    return addOutline(c, OUT);
  }));

  /* ── มอนปลอม (หุ่นซ้อม ไม่มี AI) ── */
  reg('dummy', [0].map(() => {
    const c = makeCanvas(P, P), g = c.getContext('2d');
    const wood = '#a8824a', dark = '#7a5c33';
    rc(g, 7, 6, 2, 9, dark);
    rc(g, 4, 4, 8, 6, wood);
    rc(g, 3, 5, 1, 4, wood); rc(g, 12, 5, 1, 4, wood);
    ell(g, 8, 3, 3, 2, wood);
    px(g, 7, 3, '#3a2f1a'); px(g, 9, 3, '#3a2f1a');
    rc(g, 4, 10, 8, 1, dark);
    line(g, 4, 5, 12, 8, '#5c4426');
    return addOutline(c, OUT);
  }));

  /* ── ปีศาจเก็บเงิน ── */
  reg('taxman', [0, 1].map((f) => {
    const c = makeCanvas(P, P), g = c.getContext('2d');
    const body = '#7a3f9e', body2 = '#5a2f78', coin = '#ffc94d';
    const y = f === 1 ? 1 : 0;
    rc(g, 5, 4 + y, 6, 5, body);
    ell(g, 4, 3 + y, 1, 2, body2); ell(g, 11, 3 + y, 1, 2, body2);
    px(g, 6, 6 + y, '#ff5f5f'); px(g, 9, 6 + y, '#ff5f5f');
    rc(g, 5, 9 + y, 6, 5, body2);
    rc(g, 4, 10 + y, 1, 3, body); rc(g, 11, 10 + y, 1, 3, body);
    rc(g, 5, 14, 2, 2, body2); rc(g, 9, 14, 2, 2, body2);
    ell(g, 12, 12, 3, 3, coin);
    rc(g, 12, 10, 1, 4, '#b98b1e');
    px(g, 11, 11, '#fff2c0'); px(g, 13, 13, '#b98b1e');
    return addOutline(c, OUT);
  }));

  /* ── ผู้เล่นโปร (สงสัย) ── */
  reg('pro', [0, 1].map((f) => {
    const c = makeCanvas(P, P), g = c.getContext('2d');
    const pal = { hair: '#e8e2f0', shirt: '#f0e6b0', pants: '#c9a227', skin: '#f5d2ad', eye: '#241d33' };
    drawHuman(g, pal, f, { glasses: true, hat: 'crown' });
    px(g, 2, 3, '#7fe0ff'); px(g, 13, 6, '#7fe0ff');
    px(g, 3, 12, '#7fe0ff'); px(g, 12, 13, '#7fe0ff');
    return addOutline(c, OUT);
  }));

  /* ── บอสโลก 24×24 ── */
  reg('boss', [0, 1].map((f) => {
    const c = makeCanvas(24, 24), g = c.getContext('2d');
    const y = f === 1 ? 1 : 0;
    const skin = '#c9855c', coat = '#8a2f2f', coat2 = '#6b2020', hair = '#3a3a44';
    rc(g, 8, 19, 3, 5, coat2); rc(g, 14, 19, 3, 5, coat2);
    rc(g, 7, 23, 4, 1, '#2a2020'); rc(g, 14, 23, 4, 1, '#2a2020');
    rc(g, 6, 10 + y, 12, 10, coat);
    rc(g, 6, 10 + y, 12, 1, coat2);
    rc(g, 3, 11 + y, 3, 8, coat); rc(g, 18, 11 + y, 3, 8, coat);
    rc(g, 3, 18 + y, 3, 2, skin); rc(g, 18, 18 + y, 3, 2, skin);
    rc(g, 8, 3 + y, 8, 8, skin);
    rc(g, 7, 2 + y, 10, 2, hair);
    rc(g, 7, 3 + y, 1, 3, hair); rc(g, 16, 3 + y, 1, 3, hair);
    rc(g, 8, 6 + y, 3, 2, '#111'); rc(g, 13, 6 + y, 3, 2, '#111');
    rc(g, 11, 6 + y, 2, 1, '#111');
    rc(g, 10, 9 + y, 4, 1, '#5a2f2f');
    rc(g, 1, 14 + y, 4, 5, '#e8e2f0');
    rc(g, 1, 14 + y, 4, 1, '#3f6fb5');
    line(g, 20, 8, 23, 3, '#e04b4b');
    rc(g, 19, 8, 2, 2, '#e04b4b');
    return addOutline(c, OUT);
  }), 24, 24);

  /* ── บอสโลกโซน 2 (พญามารทวงหนี้นอกระบบ) 24×24 ── */
  reg('boss_collector', [0, 1].map((f) => {
    const c = makeCanvas(24, 24), g = c.getContext('2d');
    const y = f === 1 ? 1 : 0;
    // ปีกไฟนรก + เกราะมาร
    rc(g, 2, 8 + y, 4, 9, '#5a1818'); rc(g, 18, 8 + y, 4, 9, '#5a1818');
    rc(g, 6, 9 + y, 12, 10, '#8a2418');
    rc(g, 8, 11 + y, 8, 6, '#ffc94d'); // เกราะอกทองคำ
    rc(g, 7, 3 + y, 10, 7, '#c0392b');  // หัวพญามาร
    // เขามารคู่ใหญ่
    line(g, 7, 4 + y, 2, 0 + y, '#ffc94d'); line(g, 16, 4 + y, 21, 0 + y, '#ffc94d');
    rc(g, 8, 6 + y, 3, 2, '#fff2c0'); rc(g, 13, 6 + y, 3, 2, '#fff2c0');
    // ดาบไฟทวงหนี้ + สมุดบัญชีหนังหมา
    rc(g, 20, 2 + y, 3, 14, '#ff8f3c');
    rc(g, 21, 3 + y, 1, 11, '#fff2c0');
    rc(g, 8, 19, 3, 4, '#3a1414'); rc(g, 13, 19, 3, 4, '#3a1414');
    return addOutline(c, OUT);
  }), 24, 24);

  /* ── บอสโลกโซน 3 (AI แอดมินคลั่ง GPT-999) 24×24 ── */
  reg('boss_ai', [0, 1].map((f) => {
    const c = makeCanvas(24, 24), g = c.getContext('2d');
    const y = f === 1 ? 1 : 0;
    // ปีกโดรนไซเบอร์ 4 แฉก
    rc(g, 1, 5 + y, 4, 12, '#1f365c'); rc(g, 19, 5 + y, 4, 12, '#1f365c');
    rc(g, 2, 7 + y, 2, 8, f ? '#4ae8ff' : '#ff4d8a');
    rc(g, 20, 7 + y, 2, 8, f ? '#ff4d8a' : '#4ae8ff');
    // แกนกลางหุ่นรบ AI
    rc(g, 6, 4 + y, 12, 14, '#2a344a');
    rc(g, 7, 5 + y, 10, 6, '#0d121f');
    // ดวงตาเลเซอร์สแกน
    rc(g, 8, 7 + y, 8, 2, '#ff4d6b');
    px(g, 11 + (f ? 2 : -1), 7 + y, '#ffffff');
    // แกนพลังงาน RGB กลางอก
    ell(g, 12, 14 + y, 3, 3, '#4ae8ff');
    px(g, 12, 14 + y, '#ffffff');
    // วงแหวนลอยใต้ฐาน
    rc(g, 7, 20, 10, 2, '#b98bff');
    return addOutline(c, OUT);
  }), 24, 24);

  /* ── ค้างคาวเน็ตหลุด ── */
  reg('bat', [0, 1].map((f) => {
    const c = makeCanvas(P, P), g = c.getContext('2d');
    const body = '#4a3f6a', wing = '#6b5a94', wing2 = '#3a3050';
    const up = f === 0 ? 1 : -1;
    line(g, 7, 7, 1, 6 + up * 2, wing); line(g, 7, 8, 1, 8 + up * 2, wing2);
    line(g, 7, 7, 2, 4 + up, wing); line(g, 2, 4 + up, 2, 9 + up * 2, wing2);
    line(g, 8, 7, 14, 6 + up * 2, wing); line(g, 8, 8, 14, 8 + up * 2, wing2);
    line(g, 8, 7, 13, 4 + up, wing); line(g, 13, 4 + up, 13, 9 + up * 2, wing2);
    ell(g, 8, 8, 2, 3, body);
    px(g, 7, 4, body); px(g, 9, 4, body);
    px(g, 7, 7, '#ff6b6b'); px(g, 9, 7, '#ff6b6b');
    px(g, 7, 10, '#fff'); px(g, 9, 10, '#fff');
    return addOutline(c, OUT);
  }));

  /* ── วิญญาณผู้เล่นที่เลิกเล่น ── */
  reg('ghost', [0, 1].map((f) => {
    const c = makeCanvas(P, P), g = c.getContext('2d');
    const b = 'rgba(190,215,255,0.80)', b2 = 'rgba(140,175,235,0.62)';
    const y = f === 1 ? 1 : 0;
    ell(g, 8, 7 + y, 5, 5, b);
    rc(g, 4, 9 + y, 9, 5, b);
    for (let i = 0; i < 3; i++) {
      rc(g, 4 + i * 3, 13 + y + (i % 2), 3, 2, b2);
    }
    rc(g, 3, 8 + y, 1, 4, b2); rc(g, 12, 8 + y, 1, 4, b2);
    px(g, 6, 6 + y, '#2a3050'); px(g, 10, 6 + y, '#2a3050');
    rc(g, 7, 9 + y, 3, 1, '#2a3050');
    return addOutline(c, 'rgba(20,24,45,0.55)');
  }));

  /* ── มอนโซน 3 (แดนเซิร์ฟเถื่อน): บอทขุดบิตคอยน์ · บั๊กทะลุแมพ · สุลต่านเติมหนัก ── */
  reg('botmon', [0, 1].map((f) => {
    const c = makeCanvas(P, P), g = c.getContext('2d');
    const y = f === 1 ? 1 : 0;
    rc(g, 7, 1 + y, 2, 2, '#4ae8ff');                 // เสาอากาศเรืองแสง
    rc(g, 4, 3 + y, 8, 5, '#3a465e');                 // หัวหุ่นยนต์
    rc(g, 5, 4 + y, 6, 3, '#0e1628');                 // หน้าจอ
    px(g, 6, 5 + y, '#4ae8ff'); px(g, 9, 5 + y, '#4ae8ff');
    rc(g, 4, 8 + y, 8, 5, '#2b3448');                 // ตัวเคสการ์ดจอ
    ell(g, 8, 10 + y, 2, 2, f ? '#ffc94d' : '#4ae8ff'); // พัดลมหมุน
    rc(g, 2, 9 + y, 2, 3, '#56637a'); rc(g, 12, 9 + y, 2, 3, '#56637a');
    rc(g, 5, 13, 2, 2, '#1f2636'); rc(g, 9, 13, 2, 2, '#1f2636');
    return addOutline(c, OUT);
  }));

  reg('glitchbug', [0, 1].map((f) => {
    const c = makeCanvas(P, P), g = c.getContext('2d');
    const s = f === 1 ? 1 : -1;
    ell(g, 8 + s, 8, 5, 4, '#b94aff');
    rc(g, 3, 6 + (f ? 1 : 0), 10, 2, '#4ae8ff');
    rc(g, 5 - s, 10, 7, 2, '#ff4d8a');
    px(g, 6, 7, '#ffffff'); px(g, 10, 7, '#ffffff');
    // ขาแมลงไซเบอร์
    line(g, 4, 9, 1, 12 + f, '#4ae8ff'); line(g, 12, 9, 14, 12 - f, '#ff4d8a');
    line(g, 5, 5, 2, 2 + f, '#b94aff'); line(g, 11, 5, 14, 2 - f, '#4ae8ff');
    return addOutline(c, OUT);
  }));

  reg('whale', [0, 1].map((f) => {
    const c = makeCanvas(P, P), g = c.getContext('2d');
    const y = f === 1 ? 1 : 0;
    // มงกุฎทอง
    rc(g, 5, 1 + y, 6, 2, '#ffc94d');
    px(g, 5, 0 + y, '#fff2c0'); px(g, 8, 0 + y, '#fff2c0'); px(g, 10, 0 + y, '#fff2c0');
    // ตัววาฬสูททอง
    ell(g, 8, 9 + y, 6, 5, '#2b6cb0');
    ell(g, 8, 10 + y, 4, 3, '#e8f4ff');
    px(g, 6, 7 + y, '#111'); px(g, 10, 7 + y, '#111');
    rc(g, 5, 6 + y, 2, 1, '#ffc94d'); rc(g, 9, 6 + y, 2, 1, '#ffc94d'); // แว่นสุลต่าน
    // บัตรเครดิตทองในมือ
    rc(g, 12, 8 + y, 3, 4, '#ffc94d');
    px(g, 13, 9 + y, '#fff2c0');
    return addOutline(c, OUT);
  }));

  /* ══════════ ไทล์พื้น — หลายแบบต่อหนึ่งชนิด เพื่อไม่ให้เห็นลายซ้ำ ══════════ */
  const V = (n, draw) => Array.from({ length: n }, (_, i) => {
    const c = makeCanvas(T, T);
    const g = c.getContext('2d');
    const out = draw(g, i, c);
    return out || c;
  });
  const noise = (g, seed, base, hi, lo, thr = 0.9) => {
    rc(g, 0, 0, T, T, base);
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
      const h = hash(x, y, seed);
      if (h > thr) px(g, x, y, hi);
      else if (h < 1 - thr) px(g, x, y, lo);
    }
  };

  reg('t_grass', V(4, (g, i) => {
    noise(g, 1 + i * 7, '#3f8f4a', '#4aa155', '#357a3f', 0.90);
    for (let k = 0; k < 4; k++) {
      const x = 1 + ((k * 5 + i * 3) % 13);
      const y = 2 + ((k * 7 + i * 5) % 12);
      px(g, x, y, '#5cb865'); px(g, x, y - 1, '#5cb865');
      if (i % 2) px(g, x + 1, y + 1, '#2f7a3d');
    }
    if (i === 2) { px(g, 3, 12, '#c9b079'); px(g, 12, 4, '#c9b079'); }
  }), T, T, false);

  reg('t_flower', V(3, (g, i) => {
    noise(g, 3 + i * 5, '#3f8f4a', '#4aa155', '#357a3f', 0.92);
    const cols = [['#e86a8a', '#ffd23f'], ['#ffd23f', '#c9a2ff'], ['#c9a2ff', '#e86a8a']][i];
    for (let k = 0; k < 3; k++) {
      const x = 3 + k * 4, y = 4 + ((k * 3 + i) % 7);
      px(g, x, y, cols[0]); px(g, x + 1, y, cols[1]);
      px(g, x, y + 1, cols[1]); px(g, x + 1, y + 1, cols[0]);
      px(g, x, y + 2, '#2f7a3d');
    }
  }));

  reg('t_tallgrass', V(3, (g, i) => {
    noise(g, 21 + i * 3, '#357a3f', '#3f8f4a', '#2b6333', 0.93);
    for (let k = 0; k < 11; k++) {
      const x = 1 + ((k * 3 + i * 2) % 14);
      const y = 3 + ((k * 5 + i * 4) % 11);
      const tall = 3 + ((k + i) % 3);
      rc(g, x, y, 1, tall, '#4aa155');
      px(g, x, y - 1, '#5cb865');
      px(g, x + 1, y + 1, '#2f7a3d');
    }
  }));

  reg('t_dirt', V(3, (g, i) => {
    noise(g, 5 + i * 9, '#8a6a45', '#9c7a52', '#75593a', 0.88);
    for (let k = 0; k < 3; k++) {
      px(g, (k * 6 + i * 4) % 16, (k * 9 + i * 3) % 16, '#a98a5f');
    }
  }));

  reg('t_path', V(3, (g, i) => {
    noise(g, 9 + i * 6, '#a8916b', '#bda684', '#8f7a58', 0.90);
    for (let k = 0; k < 3; k++) {
      const x = (k * 7 + i * 5) % 14, y = (k * 5 + i * 7) % 14;
      rc(g, x, y, 2, 1, '#c4b291');
    }
  }));

  reg('t_stonepath', V(2, (g, i) => {
    noise(g, 31 + i * 4, '#9a9384', '#aca595', '#857f72', 0.92);
    rc(g, 0, 7 + i, T, 1, '#7d776b');
    rc(g, 5 + i * 3, 0, 1, 8 + i, '#7d776b');
    rc(g, 11 - i * 2, 8 + i, 1, 8, '#7d776b');
  }));

  reg('t_sand', V(3, (g, i) => {
    noise(g, 7 + i * 11, '#c9b079', '#dcc48d', '#b39a63', 0.90);
    for (let k = 0; k < 4; k++) px(g, (k * 5 + i * 3) % 16, (k * 7 + i * 6) % 16, '#e8d7a6');
  }));

  reg('t_water', [0, 1].map((f) => {
    const c = makeCanvas(T, T), g = c.getContext('2d');
    noise(g, 3, '#2f6fb5', '#3d84cc', '#2a63a3', 0.93);
    const s = f === 1 ? 5 : 0;
    for (let i = 0; i < 3; i++) rc(g, (2 + s + i * 6) % 12, 3 + i * 5, 4, 1, '#7fc0f0');
    return c;
  }), T, T, true);

  reg('t_shallow', [0, 1].map((f) => {
    const c = makeCanvas(T, T), g = c.getContext('2d');
    noise(g, 11, '#4d8fc9', '#63a5dc', '#4483bd', 0.88);
    const s = f === 1 ? 5 : 0;
    for (let i = 0; i < 3; i++) rc(g, (2 + s + i * 6) % 12, 4 + i * 4, 4, 1, '#9ccdf0');
    return c;
  }), T, T, true);

  /* ── ไทล์สิ่งกีดขวาง ── */
  reg('t_tree', V(3, (g, i, c) => {
    rc(g, 0, 0, T, T, '#3f8f4a');
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) if (hash(x, y, 1) > 0.9) px(g, x, y, '#4aa155');
    if (i === 1) {
      rc(g, 7, 11, 2, 5, '#5b3f27');
      for (let k = 0; k < 3; k++) {
        const w = 7 - k * 2, y = 3 + k * 3;
        ell(g, 8, y, w / 2 + 1, 2, '#2b6b35');
        ell(g, 8, y, w / 2, 1.4, '#3f8f4a');
      }
      px(g, 7, 2, '#5cb865');
    } else if (i === 2) {
      rc(g, 7, 6, 2, 10, '#6b5033');
      line(g, 8, 8, 3, 4, '#6b5033'); line(g, 8, 10, 13, 6, '#6b5033');
      line(g, 8, 7, 12, 3, '#6b5033');
    } else {
      rc(g, 6, 9, 4, 7, '#5b3f27');
      rc(g, 6, 9, 1, 7, '#4a3320');
      ell(g, 8, 7, 6, 5, '#245c2e');
      ell(g, 8, 6, 5, 4, '#2f7a3d');
      ell(g, 7, 5, 3, 2, '#3f8f4a');
      px(g, 6, 4, '#5cb865'); px(g, 10, 6, '#5cb865'); px(g, 11, 4, '#3f8f4a');
    }
    return addOutline(c, OUT);
  }));

  reg('t_rock', V(2, (g, i, c) => {
    rc(g, 0, 0, T, T, '#3f8f4a');
    for (let k = 0; k < 8; k++) px(g, (k * 5 + i * 3) % 16, (k * 9 + i) % 16, '#4aa155');
    ell(g, 8, 9, i ? 5 : 6, 5, '#6b7280');
    ell(g, 6, 7, 3, 2, '#8a929e');
    px(g, 10, 11, '#565c66'); px(g, 5, 10, '#565c66');
    return addOutline(c, OUT);
  }));

  const wallTile = (g, i, withWindow) => {
    rc(g, 0, 0, T, T, '#9c8a72');
    rc(g, 0, 0, T, 1, '#b5a48c');
    for (let r = 0; r < 4; r++) {
      const y = r * 4;
      rc(g, 0, y + 3, T, 1, '#7a6b58');
      const off = (r + i) % 2 ? 4 : 0;
      for (let x = off; x < T; x += 8) rc(g, x, y, 1, 4, '#7a6b58');
    }
    if (withWindow) {
      rc(g, 3, 3, 10, 8, '#5b4f3f');
      rc(g, 4, 4, 8, 6, '#2a2438');
      rc(g, 5, 5, 6, 4, '#6fa8d6');
      rc(g, 5, 5, 3, 2, '#a8d4f0');
      rc(g, 7, 5, 1, 4, '#5b4f3f');
      rc(g, 5, 7, 6, 1, '#5b4f3f');
      rc(g, 3, 11, 10, 1, '#7a6b58');
    }
  };
  reg('t_wall', V(2, (g, i) => wallTile(g, i, false)));
  reg('t_wallwin', V(2, (g, i) => wallTile(g, i, true)));

  reg('t_roof', [0].map(() => {
    const c = makeCanvas(T, T), g = c.getContext('2d');
    rc(g, 0, 0, T, T, '#a8433a');
    for (let r = 0; r < 4; r++) {
      const y = r * 4;
      rc(g, 0, y, T, 1, '#c2554a');
      rc(g, 0, y + 3, T, 1, '#7d2f29');
      const off = r % 2 ? 4 : 0;
      for (let x = off; x < T; x += 8) rc(g, x, y + 1, 1, 3, '#8a352e');
      for (let x = off + 2; x < T; x += 8) px(g, x, y + 1, '#b84a40');
    }
    return c;
  }));

  reg('t_rooftop', [0].map(() => {
    const c = makeCanvas(T, T), g = c.getContext('2d');
    rc(g, 0, 0, T, T, '#c2554a');
    rc(g, 0, 0, T, 2, '#d86a5c');
    rc(g, 0, 2, T, 1, '#8a352e');
    rc(g, 0, 3, T, 5, '#a8433a');
    for (let r = 1; r < 2; r++) {
      const y = 3 + r * 4;
      rc(g, 0, y, T, 1, '#c2554a');
      rc(g, 0, y + 3, T, 1, '#7d2f29');
    }
    rc(g, 0, 15, T, 1, '#6b241f');
    return c;
  }));

  reg('t_door', [0].map(() => {
    const c = makeCanvas(T, T), g = c.getContext('2d');
    rc(g, 0, 0, T, T, '#9c8a72');
    rc(g, 0, 0, T, 1, '#b5a48c');
    rc(g, 2, 2, 12, 14, '#5b4f3f');
    rc(g, 3, 3, 10, 12, '#7a5c3a');
    rc(g, 3, 3, 10, 1, '#9a7850');
    rc(g, 7, 3, 1, 12, '#5b4f3f');
    rc(g, 3, 8, 10, 1, '#5b4f3f');
    px(g, 11, 9, '#ffc94d');
    rc(g, 2, 15, 12, 1, '#6b5b4a');
    return c;
  }));

  reg('t_fence', [0].map(() => {
    const c = makeCanvas(T, T), g = c.getContext('2d');
    rc(g, 0, 0, T, T, '#3f8f4a');
    for (let k = 0; k < 8; k++) px(g, (k * 7) % 16, (k * 11) % 16, '#4aa155');
    rc(g, 1, 4, 3, 10, '#8a6a45');
    rc(g, 6, 3, 3, 11, '#8a6a45');
    rc(g, 11, 4, 3, 10, '#8a6a45');
    rc(g, 1, 4, 1, 10, '#a8824a'); rc(g, 6, 3, 1, 11, '#a8824a'); rc(g, 11, 4, 1, 10, '#a8824a');
    rc(g, 0, 6, T, 2, '#9c7a52');
    rc(g, 0, 11, T, 2, '#9c7a52');
    return c;
  }));

  reg('t_sign', [0].map(() => {
    const c = makeCanvas(T, T), g = c.getContext('2d');
    rc(g, 0, 0, T, T, '#3f8f4a');
    for (let k = 0; k < 6; k++) px(g, (k * 6) % 16, (k * 9) % 16, '#4aa155');
    rc(g, 7, 8, 2, 7, '#5b3f27');
    rc(g, 2, 2, 12, 7, '#a8824a');
    rc(g, 2, 2, 12, 1, '#c9a06a');
    rc(g, 2, 8, 12, 1, '#7a5c33');
    rc(g, 4, 4, 8, 1, '#5c4426');
    rc(g, 4, 6, 5, 1, '#5c4426');
    return addOutline(c, OUT);
  }));

  reg('t_bridge', [0].map(() => {
    const c = makeCanvas(T, T), g = c.getContext('2d');
    rc(g, 0, 0, T, T, '#2f6fb5');
    for (let k = 0; k < 5; k++) px(g, (k * 7) % 16, (k * 5) % 16, '#3d84cc');
    rc(g, 0, 2, T, 12, '#a8824a');
    for (let x = 0; x < T; x += 4) rc(g, x, 2, 1, 12, '#8a6a3a');
    rc(g, 0, 2, T, 1, '#c9a06a');
    rc(g, 0, 13, T, 1, '#7a5c33');
    rc(g, 0, 1, T, 1, '#6b5033');
    rc(g, 0, 14, T, 1, '#6b5033');
    rc(g, 0, 0, T, 1, '#2a63a3'); rc(g, 0, 15, T, 1, '#2a63a3');
    return c;
  }));

  reg('t_grave', V(2, (g, i, c) => {
    rc(g, 0, 0, T, T, '#2f6b39');
    for (let k = 0; k < 14; k++) px(g, (k * 7) % 16, (k * 11) % 16, '#3a7d44');
    if (i === 1) {
      g.save(); g.translate(8, 9); g.rotate(0.12); g.translate(-8, -9);
    }
    ell(g, 8, 7, 4, 5, '#8a8f99');
    rc(g, 5, 7, 6, 7, '#8a8f99');
    rc(g, 5, 13, 6, 2, '#6b7280');
    rc(g, 7, 4, 2, 6, '#6b7280');
    rc(g, 5, 6, 6, 1, '#6b7280');
    rc(g, 4, 2, 8, 2, '#6b7280');
    if (i === 1) g.restore();
    return addOutline(c, OUT);
  }));

  reg('t_statue', [0].map(() => {
    const c = makeCanvas(T, T), g = c.getContext('2d');
    rc(g, 0, 0, T, T, '#3f8f4a');
    for (let k = 0; k < 8; k++) px(g, (k * 5) % 16, (k * 13) % 16, '#4aa155');
    rc(g, 2, 12, 12, 4, '#9a9384');
    rc(g, 3, 11, 10, 1, '#aca595');
    rc(g, 2, 12, 12, 1, '#c4bda8');
    ell(g, 8, 6, 3, 4, '#c9cdd6');
    rc(g, 6, 8, 4, 4, '#c9cdd6');
    rc(g, 6, 9, 4, 1, '#a8adb8');
    ell(g, 8, 3, 2, 2, '#c9cdd6');
    rc(g, 4, 6, 2, 3, '#c9cdd6'); rc(g, 10, 6, 2, 3, '#c9cdd6');
    px(g, 7, 3, '#6b7280'); px(g, 9, 3, '#6b7280');
    px(g, 6, 5, '#e8ecf2');
    return addOutline(c, OUT);
  }));

  reg('t_barrel', [0].map(() => {
    const c = makeCanvas(T, T), g = c.getContext('2d');
    rc(g, 0, 0, T, T, '#3f8f4a');
    for (let k = 0; k < 10; k++) px(g, (k * 5) % 16, (k * 13) % 16, '#4aa155');
    ell(g, 8, 5, 4, 2, '#c9a06a');
    rc(g, 4, 5, 8, 10, '#a8824a');
    rc(g, 4, 5, 8, 1, '#c9a06a');
    rc(g, 4, 14, 8, 1, '#7a5c33');
    rc(g, 4, 8, 8, 1, '#6b5033');
    rc(g, 4, 12, 8, 1, '#6b5033');
    rc(g, 6, 5, 1, 10, '#8a6a3a');
    px(g, 5, 6, '#c9a06a');
    return addOutline(c, OUT);
  }));

  reg('t_lamp', [0].map(() => {
    const c = makeCanvas(T, T), g = c.getContext('2d');
    rc(g, 0, 0, T, T, '#3f8f4a');
    for (let k = 0; k < 10; k++) px(g, (k * 9) % 16, (k * 3) % 16, '#4aa155');
    rc(g, 7, 6, 2, 9, '#4a4038');
    rc(g, 5, 14, 6, 2, '#4a4038');
    rc(g, 5, 13, 6, 1, '#6b5f52');
    rc(g, 4, 2, 8, 4, '#3a342c');
    rc(g, 5, 3, 6, 2, '#fff2c0');
    rc(g, 6, 3, 4, 1, '#ffffff');
    rc(g, 5, 6, 6, 1, '#4a4038');
    return addOutline(c, OUT);
  }));

  reg('t_well', [0].map(() => {
    const c = makeCanvas(T, T), g = c.getContext('2d');
    rc(g, 0, 0, T, T, '#a8916b');
    for (let k = 0; k < 10; k++) px(g, (k * 7) % 16, (k * 5) % 16, '#bda684');
    ell(g, 8, 10, 6, 5, '#6b7280');
    ell(g, 8, 10, 4, 3, '#2f6fb5');
    ell(g, 7, 9, 2, 1, '#7fc0f0');
    rc(g, 2, 9, 12, 1, '#8a8f99');
    rc(g, 3, 2, 2, 8, '#5b3f27'); rc(g, 11, 2, 2, 8, '#5b3f27');
    rc(g, 2, 1, 12, 2, '#8a6a45');
    rc(g, 2, 1, 12, 1, '#a8824a');
    return addOutline(c, OUT);
  }));

  reg('t_chest', [0, 1].map((f) => {
    const c = makeCanvas(T, T), g = c.getContext('2d');
    rc(g, 0, 0, T, T, '#3f8f4a');
    for (let k = 0; k < 10; k++) px(g, (k * 11) % 16, (k * 7) % 16, '#4aa155');
    if (f === 0) {
      ell(g, 8, 7, 6, 2, '#8a6a3a');
      rc(g, 2, 7, 12, 7, '#a8824a');
      rc(g, 2, 7, 12, 1, '#c9a06a');
      rc(g, 2, 13, 12, 1, '#6b5033');
      rc(g, 2, 10, 12, 1, '#8a6a3a');
      rc(g, 7, 9, 2, 4, '#ffc94d');
      rc(g, 6, 8, 4, 2, '#e8b93f');
      px(g, 4, 8, '#c9a06a'); px(g, 12, 8, '#c9a06a');
    } else {
      rc(g, 2, 3, 12, 4, '#8a6a3a');
      rc(g, 2, 3, 12, 1, '#a8824a');
      rc(g, 2, 9, 12, 5, '#a8824a');
      rc(g, 2, 9, 12, 1, '#c9a06a');
      rc(g, 4, 10, 8, 3, '#ffd76a');
      px(g, 5, 11, '#fff2c0'); px(g, 10, 11, '#fff2c0'); px(g, 7, 12, '#fff2c0');
      rc(g, 2, 8, 12, 1, '#6b5033');
    }
    return addOutline(c, OUT);
  }));

  reg('t_cave', [0].map(() => {
    const c = makeCanvas(T, T), g = c.getContext('2d');
    rc(g, 0, 0, T, T, '#6b7280');
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
      const h = hash(x, y, 41);
      if (h > 0.9) px(g, x, y, '#8a929e');
      else if (h < 0.1) px(g, x, y, '#565c66');
    }
    rc(g, 3, 3, 10, 3, '#4d545e');
    ell(g, 8, 10, 5, 6, '#12141f');
    rc(g, 3, 10, 10, 6, '#12141f');
    px(g, 6, 8, '#2a2f3a'); px(g, 10, 8, '#2a2f3a');
    px(g, 4, 4, '#a8b0bc'); px(g, 11, 5, '#a8b0bc');
    return addOutline(c, OUT);
  }));

  /* ══════════ ดินแดนมาร (โซน 2) ══════════ */
  reg('t_ash', V(3, (g, i) => {
    noise(g, 51 + i * 9, '#3a3040', '#463a4c', '#2e2634', 0.88);
    for (let k = 0; k < 3; k++) px(g, (k * 6 + i * 4) % 16, (k * 9 + i * 3) % 16, '#544660');
  }));

  reg('t_lava', [0, 1].map((f) => {
    const c = makeCanvas(T, T), g = c.getContext('2d');
    noise(g, 61, '#c23a1e', '#e05530', '#9c2a14', 0.90);
    const s = f === 1 ? 5 : 0;
    for (let i = 0; i < 3; i++) rc(g, (2 + s + i * 6) % 12, 3 + i * 5, 4, 1, '#ffb04d');
    for (let i = 0; i < 2; i++) {
      const bx = (6 + s * 3 + i * 7) % 14, by = 10 + i * 3;
      px(g, bx, by, '#ffd76a'); px(g, bx + 1, by, '#ffb04d');
    }
    return c;
  }), T, T, true);

  reg('t_bone', V(2, (g, i, c) => {
    noise(g, 71 + i * 5, '#3a3040', '#463a4c', '#2e2634', 0.90);
    if (i === 0) {
      ell(g, 6, 8, 3, 3, '#d8d2c0');
      rc(g, 4, 7, 2, 2, '#2a1f1f'); rc(g, 7, 7, 2, 2, '#2a1f1f');
      px(g, 6, 10, '#2a1f1f');
      px(g, 4, 5, '#fff8e8'); px(g, 8, 5, '#fff8e8');
      ell(g, 11, 12, 2, 1, '#b8b2a2');
    } else {
      for (let k = 0; k < 3; k++) ell(g, 4 + k * 3, 8 + (k % 2), 2, 2, '#d8d2c0');
      rc(g, 3, 9, 10, 1, '#b8b2a2');
    }
    return c;
  }));

  reg('t_helltree', [0].map(() => {
    const c = makeCanvas(T, T), g = c.getContext('2d');
    rc(g, 0, 0, T, T, '#3a3040');
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) if (hash(x, y, 7) > 0.9) px(g, x, y, '#463a4c');
    rc(g, 7, 6, 2, 10, '#241d28');
    line(g, 8, 8, 3, 4, '#241d28'); line(g, 8, 10, 13, 6, '#241d28');
    line(g, 8, 7, 12, 3, '#241d28');
    line(g, 8, 8, 3, 4, '#3a3040'); line(g, 8, 10, 13, 6, '#3a3040');
    px(g, 12, 2, '#5c4a66'); px(g, 3, 3, '#5c4a66');
    return addOutline(c, OUT);
  }));

  reg('t_hellrock', [0].map(() => {
    const c = makeCanvas(T, T), g = c.getContext('2d');
    rc(g, 0, 0, T, T, '#3a3040');
    for (let k = 0; k < 8; k++) px(g, (k * 5) % 16, (k * 9) % 16, '#463a4c');
    ell(g, 8, 9, 5, 5, '#4a3a52');
    ell(g, 6, 7, 3, 2, '#5e4a68');
    px(g, 10, 11, '#c2503a'); px(g, 5, 10, '#c2503a');
    return addOutline(c, OUT);
  }));

  /* ══════════ แดนเซิร์ฟเถื่อน (โซน 3 — ใหม่ใน v1.0.0) ══════════ */
  // พื้นแผงวงจรน้ำแข็งไซเบอร์
  reg('t_cyberfloor', V(3, (g, i) => {
    noise(g, 91 + i * 7, '#141d33', '#1c2846', '#0e1526', 0.89);
    rc(g, 0, 7 + (i % 2), T, 1, '#1f365c');
    rc(g, 4 + i * 3, 0, 1, T, '#1f365c');
    px(g, 4 + i * 3, 7 + (i % 2), '#4ae8ff');
    if (i === 1) { rc(g, 9, 3, 4, 1, '#2b547e'); px(g, 12, 3, '#7fe0ff'); }
  }));

  // สายธารดาต้าเรืองแสง (เดินผ่านไม่ได้)
  reg('t_datastream', [0, 1].map((f) => {
    const c = makeCanvas(T, T), g = c.getContext('2d');
    noise(g, 103, '#0e3b5e', '#165584', '#092942', 0.90);
    const s = f === 1 ? 4 : 0;
    for (let i = 0; i < 3; i++) {
      rc(g, (1 + s + i * 5) % 12, 2 + i * 5, 4, 1, '#4ae8ff');
      px(g, (3 + s + i * 5) % 14, 3 + i * 5, '#c8f8ff');
    }
    return c;
  }), T, T, true);

  // เสาตู้แร็คเซิร์ฟเวอร์เถื่อน
  reg('t_cybertree', [0].map(() => {
    const c = makeCanvas(T, T), g = c.getContext('2d');
    rc(g, 0, 0, T, T, '#141d33');
    rc(g, 4, 2, 8, 13, '#1f293d');
    rc(g, 5, 3, 6, 11, '#0d121f');
    for (let y = 4; y <= 12; y += 2) {
      rc(g, 6, y, 4, 1, '#2b3a55');
      px(g, 6, y, (y % 4 === 0) ? '#4ae8ff' : '#5fe89b');
      px(g, 9, y, (y === 8) ? '#ff5f5f' : '#ffc94d');
    }
    return addOutline(c, OUT);
  }));

  // กองสายแลนและแท่นขุดการ์ดจอ
  reg('t_cyberrock', [0].map(() => {
    const c = makeCanvas(T, T), g = c.getContext('2d');
    rc(g, 0, 0, T, T, '#141d33');
    ell(g, 8, 10, 6, 4, '#2a344a');
    rc(g, 4, 6, 8, 5, '#3b4866');
    rc(g, 5, 7, 2, 2, '#4ae8ff'); rc(g, 9, 7, 2, 2, '#b98bff');
    line(g, 2, 13, 13, 11, '#4ae8ff');
    return addOutline(c, OUT);
  }));

  // บ่อบั๊กไฟดูด (เดินทับแล้วโดนดาเมจต่อเนื่อง)
  reg('t_glitch', [0, 1].map((f) => {
    const c = makeCanvas(T, T), g = c.getContext('2d');
    noise(g, 115 + f, '#3b1554', '#581f7a', '#260d38', 0.86);
    const s = f === 1 ? 3 : 0;
    rc(g, 2 + s, 4, 5, 1, '#ff4d8a');
    rc(g, 6 - s, 9, 6, 1, '#4ae8ff');
    px(g, 4 + s, 12, '#ffffff'); px(g, 11 - s, 6, '#ffc94d');
    return c;
  }), T, T, true);

  // ประตู Portal — วงบ้องวนม่วง 2 เฟรม
  reg('t_portal', [0, 1].map((f) => {
    const c = makeCanvas(T, T), g = c.getContext('2d');
    rc(g, 0, 0, T, T, '#3a3040');
    for (let k = 0; k < 8; k++) px(g, (k * 6) % 16, (k * 9) % 16, '#463a4c');
    const rr = 5 + (f ? 1 : 0);
    ell(g, 8, 8, rr, rr + 1, '#1a1030');
    ell(g, 8, 8, rr - 2, rr - 1, '#6b3fb5');
    ell(g, 8, 8, rr - 3, rr - 2, '#b98bff');
    if (f === 0) { ell(g, 8, 8, rr - 4, rr - 3, '#e8d8ff'); } else { ell(g, 8, 7, rr - 4, rr - 3, '#e8d8ff'); }
    px(g, 3, 4, '#b98bff'); px(g, 13, 5, '#b98bff'); px(g, 4, 13, '#b98bff'); px(g, 12, 12, '#b98bff');
    return addOutline(c, OUT);
  }), T, T, true);

  /* ── มอนดินแดนมาร: ปีศาจไฟ + กะโหลกวิญญาณ ── */
  reg('imp', [0, 1].map((f) => {
    const c = makeCanvas(P, P), g = c.getContext('2d');
    const body = '#c0392b', body2 = '#8a2418', horn = '#3a2418', eye = '#ffd23f';
    const y = f === 1 ? 1 : 0;
    ell(g, 8, 5 + y, 3, 3, body);
    line(g, 6, 3 + y, 4, 0 + y, horn); line(g, 10, 3 + y, 12, 0 + y, horn);
    px(g, 6, 5 + y, eye); px(g, 10, 5 + y, eye);
    rc(g, 7, 7 + y, 2, 1, '#3a1010');
    rc(g, 6, 8 + y, 4, 4, body2);
    rc(g, 4, 9 + y, 2, 3, body); rc(g, 10, 9 + y, 2, 3, body);
    rc(g, 6, 12, 2, 2, body2); rc(g, 9, 12, 2, 2, body2);
    line(g, 8, 11 + y, 12, 13 + y, body);
    if (f === 1) line(g, 8, 11 + y, 13, 12 + y, body2);
    return addOutline(c, OUT);
  }));

  reg('skull', [0, 1].map((f) => {
    const c = makeCanvas(P, P), g = c.getContext('2d');
    const bone = '#e8e2d0', dark = '#2a2438';
    const y = f === 1 ? 1 : 0;
    ell(g, 8, 6 + y, 4, 4, bone);
    rc(g, 6, 9 + y, 4, 2, bone);
    rc(g, 4, 5 + y, 2, 2, dark); rc(g, 10, 5 + y, 2, 2, dark);
    px(g, 6, 5 + y, '#ff6b6b'); px(g, 10, 5 + y, '#ff6b6b');
    px(g, 7, 8 + y, dark); px(g, 8, 8 + y, dark); px(g, 9, 8 + y, dark);
    if (f === 0) { px(g, 3, 10, '#8a7ab5'); px(g, 13, 6, '#8a7ab5'); }
    else { px(g, 4, 12, '#8a7ab5'); px(g, 12, 8, '#8a7ab5'); }
    return addOutline(c, OUT);
  }));

  /* ── ของประดับเล็ก ๆ บนพื้นหญ้า ── */
  reg('t_pebble', [0].map(() => {
    const c = makeCanvas(T, T), g = c.getContext('2d');
    noise(g, 1, '#3f8f4a', '#4aa155', '#357a3f', 0.92);
    ell(g, 6, 9, 2, 1, '#9a9384'); ell(g, 11, 12, 2, 1, '#8a8f99');
    px(g, 5, 8, '#b5b0a5'); px(g, 10, 11, '#a8a49a');
    return c;
  }));

  reg('t_mushroom', V(2, (g, i, c) => {
    noise(g, 2, '#3f8f4a', '#4aa155', '#357a3f', 0.92);
    const cap = i ? '#c94f4f' : '#c9852f';
    rc(g, 7, 10, 2, 3, '#e8e2d0');
    ell(g, 8, 9, 3, 2, cap);
    px(g, 7, 8, '#f0d0a0'); px(g, 9, 8, '#f0d0a0');
    rc(g, 6, 9, 5, 1, '#8a352e');
    return c;
  }));

  reg('t_bush', V(2, (g, i, c) => {
    rc(g, 0, 0, T, T, '#3f8f4a');
    for (let k = 0; k < 10; k++) px(g, (k * 6 + i * 2) % 16, (k * 11) % 16, '#4aa155');
    ell(g, 8, 10, 6, 4, '#2b6b35');
    ell(g, 8, 9, 5, 3, '#3f8f4a');
    ell(g, 7, 8, 3, 2, '#4aa155');
    if (i) { px(g, 5, 8, '#e86a8a'); px(g, 11, 10, '#ffd23f'); }
    return addOutline(c, OUT);
  }));

  reg('t_stump', [0].map(() => {
    const c = makeCanvas(T, T), g = c.getContext('2d');
    rc(g, 0, 0, T, T, '#3f8f4a');
    for (let k = 0; k < 10; k++) px(g, (k * 5) % 16, (k * 7) % 16, '#4aa155');
    rc(g, 5, 8, 6, 7, '#5b3f27');
    rc(g, 5, 8, 1, 7, '#4a3320');
    ell(g, 8, 8, 3, 2, '#a8824a');
    ell(g, 8, 8, 2, 1, '#8a6a3a');
    px(g, 8, 8, '#5b3f27');
    return addOutline(c, OUT);
  }));

  reg('drop_bag', [0, 1].map((f) => {
    const c = makeCanvas(12, 12), g = c.getContext('2d');
    const y = f === 1 ? 1 : 0;
    ell(g, 6, 8 + y, 4, 3, '#c9852f');
    rc(g, 4, 3 + y, 4, 2, '#8a5c1f');
    rc(g, 5, 2 + y, 2, 1, '#5c4426');
    px(g, 5, 7 + y, '#ffd76a');
    return addOutline(c, OUT);
  }), 12, 12);

  reg('drop_gem', [0, 1].map((f) => {
    const c = makeCanvas(12, 12), g = c.getContext('2d');
    const y = f === 1 ? 1 : 0;
    const col = '#7fe0ff';
    ell(g, 6, 7 + y, 3, 3, col);
    rc(g, 5, 3 + y, 2, 2, col);
    px(g, 5, 6 + y, '#e8faff');
    return addOutline(c, OUT);
  }), 12, 12);

  /* ── เอฟเฟกต์การโจมตี ── */
  reg('fx_slash', [0, 1, 2].map((f) => {
    const c = makeCanvas(20, 20), g = c.getContext('2d');
    const a = ['#ffffff', '#ffe9a8', '#ffc94d'][f];
    for (let i = 0; i < 3; i++) {
      line(g, 3 + i, 16 - i, 16 - i, 3 + i, a);
    }
    line(g, 4, 15, 15, 4, '#ffffff');
    return c;
  }), 20, 20);

  buildBlend();
  return SPR;
}

export function spriteOf(id) { return SPR[id] || SPR['dummy']; }

/** hash เสถียรต่อไทล์ — ใช้เลือก "แบบ" ของไทล์ให้ดูไม่ซ้ำ */
export function tileHash(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0);
}
