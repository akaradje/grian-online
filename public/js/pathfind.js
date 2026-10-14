/* ═══════════════════════════════════════════════════════════
   pathfind.js — A* บนกริดไทล์ สำหรับการคลิกเดิน
   ใช้ binary heap + ทำ path smoothing ด้วย line-of-sight
   ═══════════════════════════════════════════════════════════ */

import { CONFIG } from './data.js';

/* ── binary min-heap ขนาดเล็ก (ไม่พึ่ง library) ── */
class Heap {
  constructor(cap = 1024) {
    this.a = new Int32Array(cap);   // เก็บ index ของโหนด
    this.p = new Float32Array(cap); // เก็บ priority
    this.n = 0;
  }
  clear() { this.n = 0; }
  push(i, pr) {
    if (this.n >= this.a.length) return;   // heap เต็ม — ปล่อยผ่าน
    let k = this.n++;
    this.a[k] = i; this.p[k] = pr;
    while (k > 0) {
      const par = (k - 1) >> 1;
      if (this.p[par] <= this.p[k]) break;
      this._swap(par, k); k = par;
    }
  }
  pop() {
    if (this.n === 0) return -1;
    const top = this.a[0];
    this.n--;
    if (this.n > 0) {
      this.a[0] = this.a[this.n]; this.p[0] = this.p[this.n];
      let k = 0;
      for (;;) {
        const l = k * 2 + 1, r = l + 1;
        let m = k;
        if (l < this.n && this.p[l] < this.p[m]) m = l;
        if (r < this.n && this.p[r] < this.p[m]) m = r;
        if (m === k) break;
        this._swap(m, k); k = m;
      }
    }
    return top;
  }
  _swap(i, j) {
    const ai = this.a[i]; this.a[i] = this.a[j]; this.a[j] = ai;
    const pi = this.p[i]; this.p[i] = this.p[j]; this.p[j] = pi;
  }
}

/* หน่วยความจำที่ใช้ซ้ำระหว่างการเรียก (เลี่ยงการสร้างอาเรย์ใหม่ทุกครั้ง) */
const DIRS = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, 1.4142], [1, -1, 1.4142], [-1, 1, 1.4142], [-1, -1, 1.4142],
];

export function createFinder(world) {
  const W = world.w, H = world.h, N = W * H;
  return {
    world,
    g: new Float32Array(N),
    f: new Float32Array(N),
    from: new Int32Array(N),
    stamp: new Int32Array(N),   // ใช้เลขรอบแทนการล้างอาเรย์ทุกครั้ง
    closed: new Uint8Array(N),
    round: 0,
    heap: new Heap(4096),
    open: new Uint8Array(N),

    /** ค้นหาเส้นทาง คืนอาเรย์จุด (พิกเซล) หรือ null ถ้าไปไม่ได้ */
    find(sx, sy, tx, ty, maxNodes = 6000) {
      const world = this.world;
      const TS = CONFIG.TILE;
      const sxT = Math.floor(sx / TS), syT = Math.floor(sy / TS);
      let txT = Math.floor(tx / TS), tyT = Math.floor(ty / TS);

      if (sxT === txT && syT === tyT) return [{ x: tx, y: ty }];

      // ถ้าปลายทางเป็นกำแพง ให้หาช่องว่างที่ใกล้ที่สุดแทน (ผู้ใช้คลิกถูกกำแพงได้)
      if (world.isSolidTile(world.get(txT, tyT))) {
        const alt = this._nearestFree(txT, tyT, 6);
        if (!alt) return null;
        txT = alt.x; tyT = alt.y;
      }

      this.round++;
      const { g, f, from, stamp, closed, open, heap } = this;
      heap.clear();
      open.fill(0);

      const start = syT * W + sxT;
      const goal = tyT * W + txT;
      const h = (x, y) => {
        const dx = Math.abs(x - txT), dy = Math.abs(y - tyT);
        return (dx + dy) + (1.4142 - 2) * Math.min(dx, dy);   // octile
      };

      stamp[start] = this.round; g[start] = 0; f[start] = h(sxT, syT);
      from[start] = -1; open[start] = 1;
      heap.push(start, f[start]);

      let expanded = 0, found = false;
      while (heap.n > 0) {
        const cur = heap.pop();
        if (open[cur] !== 1) continue;      // ข้อมูลเก่าในกอง
        open[cur] = 0;
        if (cur === goal) { found = true; break; }
        if (++expanded > maxNodes) break;

        const cx = cur % W, cy = (cur - cx) / W;
        for (let d = 0; d < 8; d++) {
          const nx = cx + DIRS[d][0], ny = cy + DIRS[d][1];
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          if (world.isSolidTile(world.get(nx, ny))) continue;
          // ห้ามตัดมุมทแยง: ช่องข้างทั้งสองต้องว่างด้วย
          if (DIRS[d][2] > 1) {
            if (world.isSolidTile(world.get(cx + DIRS[d][0], cy))) continue;
            if (world.isSolidTile(world.get(cx, cy + DIRS[d][1]))) continue;
          }
          const ni = ny * W + nx;
          const ng = g[cur] + DIRS[d][2];
          if (stamp[ni] !== this.round || ng < g[ni]) {
            stamp[ni] = this.round;
            g[ni] = ng;
            f[ni] = ng + h(nx, ny);
            from[ni] = cur;
            open[ni] = 1;
            heap.push(ni, f[ni]);
          }
        }
      }

      if (!found) return null;

      // ย้อนกลับเส้นทาง
      const tiles = [];
      let c = goal;
      let guard = 0;
      while (c !== -1 && guard++ < N) {
        const x = c % W, y = (c - x) / W;
        tiles.push({ x: x * TS + TS / 2, y: y * TS + TS / 2 });
        c = from[c];
      }
      tiles.reverse();
      tiles[tiles.length - 1] = { x: tx, y: ty };   // จุดหมายจริงตามที่คลิก

      return smooth(world, tiles);
    },

    _nearestFree(tx, ty, r) {
      const world = this.world;
      for (let rad = 1; rad <= r; rad++) {
        for (let dy = -rad; dy <= rad; dy++) {
          for (let dx = -rad; dx <= rad; dx++) {
            if (Math.abs(dx) !== rad && Math.abs(dy) !== rad) continue;
            const x = tx + dx, y = ty + dy;
            if (x < 1 || y < 1 || x >= world.w - 1 || y >= world.h - 1) continue;
            if (!world.isSolidTile(world.get(x, y))) return { x, y };
          }
        }
      }
      return null;
    },
  };
}

/** ตรวจว่าจาก a ไป b เป็นเส้นตรงที่ไม่ชนกำแพงหรือไม่ (เดินตามเส้นได้)
 *  สุ่มถี่ 3px — ถ้าห่างกว่านี้จะ "ก้าวข้าม" ไทล์แคบ ๆ ได้ แล้วผู้เล่นจะไปติดกลางทาง */
export function lineClear(world, ax, ay, bx, by) {
  const dist = Math.hypot(bx - ax, by - ay);
  const steps = Math.max(2, Math.ceil(dist / 3));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const x = ax + (bx - ax) * t, y = ay + (by - ay) * t;
    if (world.solidAtPx(x, y)) return false;
  }
  return true;
}

/** ตัดจุดหักเลี้ยวที่ไม่จำเป็นออก โดยยังคงความปลอดภัยของเส้นทาง */
function smooth(world, pts) {
  if (pts.length <= 2) return pts;
  const out = [pts[0]];
  let i = 0;
  while (i < pts.length - 1) {
    let j = pts.length - 1;
    // หาจุดไกลสุดที่ยังเดินตรงได้
    while (j > i + 1 && !lineClear(world, pts[i].x, pts[i].y, pts[j].x, pts[j].y)) j--;
    out.push(pts[j]);
    i = j;
  }
  return out;
}
