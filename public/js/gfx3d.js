/* ═══════════════════════════════════════════════════════════
   gfx3d.js — โลก 3D คุณภาพสูงด้วย three.js (WebGL2) — v2.0.0
   ── ไฮไลต์กราฟิก v2.0.0 ──
   · สถาปัตยกรรมและพร็อพ 3D จริง (Procedural 3D Meshes):
     บ้าน 3D (ผนังไม้/หิน + หน้าต่างเรืองแสง + หลังคากระเบื้องทรงสูง) ·
     ต้นไม้ 3D (ลำต้น + พุ่มใบ 2 ชั้น) · เสาไฟถนน 3D พร้อม Halo เรืองแสง ·
     ตู้แร็คเซิร์ฟเวอร์ 3D ไฟสถานะ LED · บ่อน้ำ/รูปปั้น/หีบสมบัติ 3D ·
     ประตูมิติ Portal วงแหวน 3D หมุนวน
   · พื้นโลก 3D อบแยกเฉพาะไทล์พื้นสะอาด (ไม่มีภาพต้นไม้/หีบ 2D แบนๆ ติดบนพื้น)
     พร้อม GLSL Micro-Detail Shader (ใบหญ้า · ร่องหิน · คลื่นน้ำ · ลาวา · วงจรไซเบอร์)
   · วงแหวนออร่า 3D หมุนใต้เท้าตัวละครที่ตีบวก (+5/+7/+9/+10) และมอนสเตอร์ Elite/Boss
   · ทริค Pre-Flipped Texture ใน _frameTex(sprId, frame, flip) ให้ใช้ THREE.FrontSide
     ได้ทั้งตัวหันซ้ายและหันขวาโดยไม่เสีย FPS
   ═══════════════════════════════════════════════════════════ */

import * as THREE from '../vendor/three.module.min.js';
import { CONFIG } from './data.js';
import { SPR, tileHash, BLEND, BLEND_LEVEL, BLEND_COLOR, BLEND_DIRS } from './sprites.js';
import { T, SPRITE_OF_TILE } from './world.js';
import { Settings } from './settings.js';
import { VFX } from './vfx.js';

const TS = CONFIG.TILE;
const TILE_H = {
  0: 0, 1: 0, 14: 0, 24: 0, 25: 0, 34: 0, 36: 0,
  5: -1.2, 2: 0, 3: 0.2, 15: 0.6,
  13: -2.0, 4: -3.2, 37: -2.5,
  6: 2, 26: 1, 27: 1, 32: 2, 38: 2,
  7: 2, 33: 2, 39: 2,
  8: 3, 29: 3, 9: 4, 28: 4,
  10: 2, 11: 1, 12: 1, 20: 1.5,
  17: 1, 18: 2, 19: 1, 21: 1, 22: 4, 23: 1.5, 35: 1.5,
  31: -1.6, 40: -1.2,
};
const hOf = (t) => (TILE_H[t] !== undefined ? TILE_H[t] * 0.18 : 0);

/* ── อุณหภูมิสี (Kelvin) → RGB ── */
function kelvinToRGB(k) {
  const t = k / 100;
  let r, g, b;
  if (t <= 66) { r = 255; g = 99.47 * Math.log(t) - 161.12; }
  else { r = 329.7 * Math.pow(t - 60, -0.1332); g = 288.120 * Math.pow(t - 60, -0.0755); }
  if (t >= 66) b = 255;
  else if (t <= 19) b = 0;
  else b = 138.52 * Math.log(t - 10) - 305.04;
  return [Math.min(255, Math.max(0, r)) / 255, Math.min(255, Math.max(0, g)) / 255, Math.min(255, Math.max(0, b)) / 255];
}

const MAX_LIGHTS = 8;
const MAX_PARTICLES = 320;
const MAX_SHADOWS = 96;
const MAX_FX3D = 18;
const MAX_AURAS = 24;

const NO_BILLBOARD = new Set([
  T.GRASS, T.FLOWER, T.DIRT, T.PATH, T.WATER, T.SAND,
  T.SHALLOW, T.TALLGRASS, T.STONEPATH, T.BRIDGE,
  T.PEBBLE, T.MUSHROOM, T.ASH, T.LAVA, T.BONE,
  T.CYBERFLOOR, T.DATASTREAM, T.GLITCH,
  T.WALL, T.ROOF, T.DOOR, T.ROOFTOP, T.WALLWIN, T.CAVE,
  T.CHEST, T.PORTAL,
  T.TREE, T.HELLTREE, T.CYBERTREE,
  T.ROCK, T.HELLROCK, T.CYBERROCK,
  T.LAMP, T.WELL, T.STATUE,
]);

// ไทล์สิ่งปลูกสร้าง/พร็อพที่ต้องการให้พื้นด้านล่างเป็นไทล์พื้นสะอาด (ไม่วาดสไปรต์พร็อพทับลงบนแคนวาสพื้น 3D)
const PROP_ON_GROUND = new Set([
  T.TREE, T.ROCK, T.WALL, T.ROOF, T.DOOR, T.FENCE, T.SIGN,
  T.GRAVE, T.STATUE, T.BARREL, T.LAMP, T.CHEST, T.CAVE, T.WELL,
  T.BUSH, T.STUMP, T.ROOFTOP, T.WALLWIN,
  T.HELLTREE, T.HELLROCK, T.PORTAL, T.CYBERTREE, T.CYBERROCK,
]);

// สีพื้นหลังของไทล์พร็อพที่ต้องการตัดโปร่งใสเมื่อทำเป็น 3D Billboard Cutout
const BG_RGB = new Set([
  '63,143,74', '74,161,85', '53,122,63',
  '47,107,57', '58,125,68',
  '168,145,107', '189,166,132',
  '58,48,64', '70,58,76', '46,38,52', '84,70,96',
  '20,29,51', '28,40,70', '14,21,38',
]);

function makeCutoutCanvas(srcCanvas) {
  const w = srcCanvas.width, h = srcCanvas.height;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.drawImage(srcCanvas, 0, 0);
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  const vis = new Uint8Array(w * h);
  const q = [];
  const pushIfBg = (x, y) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const idx = y * w + x;
    if (vis[idx]) return;
    const p = idx * 4;
    if (BG_RGB.has(`${d[p]},${d[p + 1]},${d[p + 2]}`)) {
      vis[idx] = 1;
      d[p + 3] = 0;
      q.push(x, y);
    }
  };
  for (let x = 0; x < w; x++) { pushIfBg(x, 0); pushIfBg(x, h - 1); }
  for (let y = 0; y < h; y++) { pushIfBg(0, y); pushIfBg(w - 1, y); }
  while (q.length) {
    const y = q.pop(), x = q.pop();
    pushIfBg(x + 1, y); pushIfBg(x - 1, y);
    pushIfBg(x, y + 1); pushIfBg(x, y - 1);
  }
  g.putImageData(img, 0, 0);
  return c;
}

function makeFlippedCanvas(srcCanvas) {
  const w = srcCanvas.width, h = srcCanvas.height;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.translate(w, 0);
  g.scale(-1, 1);
  g.drawImage(srcCanvas, 0, 0);
  return c;
}

/** อบแคนวาสพื้นสำหรับ 3D โดยเฉพาะ (แทนที่ตำแหน่งต้นไม้/บ้าน/เสาไฟ/หีบ ด้วยพื้นหญ้า/หิน/ไซเบอร์สะอาดๆ) */
function bakeCleanGround3D(world) {
  const c = document.createElement('canvas');
  c.width = world.w * TS;
  c.height = world.h * TS;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;

  const baseFloorFor = (x, y, t) => {
    if (!PROP_ON_GROUND.has(t)) return t;
    if (world.cyber) {
      return world.inVillage(x * TS, y * TS) ? T.STONEPATH : T.CYBERFLOOR;
    }
    if (world.hell) {
      return world.inVillage(x * TS, y * TS) ? T.STONEPATH : T.ASH;
    }
    const neighbors = [
      world.get(x - 1, y), world.get(x + 1, y),
      world.get(x, y - 1), world.get(x, y + 1),
    ];
    if (neighbors.includes(T.STONEPATH)) return T.STONEPATH;
    if (neighbors.includes(T.PATH)) return T.PATH;
    if (world.inVillage(x * TS, y * TS)) {
      if (t === T.FENCE) return T.DIRT;
      return T.STONEPATH;
    }
    if (neighbors.includes(T.DIRT)) return T.DIRT;
    return T.GRASS;
  };

  for (let y = 0; y < world.h; y++) {
    for (let x = 0; x < world.w; x++) {
      const ft = baseFloorFor(x, y, world.get(x, y));
      const spr = SPR[SPRITE_OF_TILE[ft]];
      if (!spr) continue;
      const f = spr.anim ? 0 : (tileHash(x, y) % spr.frames.length);
      g.drawImage(spr.frames[f] || spr.frames[0], x * TS, y * TS);
    }
  }

  for (let y = 0; y < world.h; y++) {
    for (let x = 0; x < world.w; x++) {
      const ft = baseFloorFor(x, y, world.get(x, y));
      const lv = BLEND_LEVEL[ft];
      if (!lv) continue;
      for (let d = 0; d < 8; d++) {
        const nx = x + BLEND_DIRS[d][0], ny = y + BLEND_DIRS[d][1];
        const nt = baseFloorFor(nx, ny, world.get(nx, ny));
        const nlv = BLEND_LEVEL[nt];
        if (!nlv || nlv <= lv) continue;
        const m = BLEND[BLEND_COLOR[nt]];
        if (m && m[d]) g.drawImage(m[d], x * TS, y * TS);
      }
    }
  }
  return c;
}

const _skyNight = new THREE.Color(0x080b18);
const _skyDay = new THREE.Color(0x8fc3ff);
const _skyDusk = new THREE.Color(0xd98a52);
const _skyCyber = new THREE.Color(0x091428);
const _skyCol = new THREE.Color();

const _lsX = new Float64Array(MAX_LIGHTS), _lsY = new Float64Array(MAX_LIGHTS);
const _lsR = new Float64Array(MAX_LIGHTS), _lsP = new Float64Array(MAX_LIGHTS);
const _lsCol = new Uint32Array(MAX_LIGHTS), _lsD = new Float64Array(MAX_LIGHTS);

export const GFX3D = {
  ok: false,
  reason: null,
  zoom: 0.92,      // ซูมเริ่มต้นใกล้ขึ้นเล็กน้อยให้เห็นรายละเอียดตัวละครและโมเดล 3D ชัดเจน
  elev: 0.58,      // มุมกล้องก้มกำลังดี เห็นมิติอาคารและต้นไม้ 3D

  setZoom(delta) {
    this.zoom = Math.max(0.60, Math.min(1.45, (this.zoom || 1) + delta));
    return this.zoom;
  },

  /* ═══════════ init ═══════════ */
  init(world) {
    const canvas = document.getElementById('world-3d');
    if (!canvas) { this.reason = 'no-canvas'; return false; }
    if (Settings.get('render3d') !== 'on' && this._softwareGL()) { this.reason = 'software-gl'; return false; }
    try {
      this.renderer = new THREE.WebGLRenderer({
        canvas, antialias: true, alpha: false, preserveDrawingBuffer: true,
        powerPreference: 'high-performance',
      });
    } catch (e) { this.reason = 'no-webgl'; return false; }
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.shadowMap.needsUpdate = true;
    this.renderer.setClearColor(0x0a0e1a, 1);

    this.scene = new THREE.Scene();
    this.scene.background = _skyCol;
    this.scene.fog = new THREE.Fog(0x0a0e1a, 420, 1250);

    this.camera = new THREE.PerspectiveCamera(48, 16 / 9, 5, 3000);
    this.camera.position.set(0, 280, 280);
    this.camTarget = new THREE.Vector3();

    this.hemi = new THREE.HemisphereLight(0xa8c8ff, 0x241c14, 0.65);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 1.2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(768, 768);
    const sc = this.sun.shadow.camera;
    sc.near = 10; sc.far = 1000;
    sc.left = -340; sc.right = 340; sc.top = 340; sc.bottom = -340;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
    this.moon = new THREE.DirectionalLight(0x8fa8ff, 0);
    this.scene.add(this.moon);
    this.scene.add(this.moon.target);

    this.lightPool = [];
    for (let i = 0; i < MAX_LIGHTS; i++) {
      const L = new THREE.PointLight(0xffb45a, 0, 145, 1.65);
      L.visible = false;
      this.scene.add(L);
      this.lightPool.push(L);
    }

    this.sunDisc = this._disc(0xfff2c0, 70, 0.95);
    this.moonDisc = this._disc(0xdfe8ff, 40, 0.9);
    this.scene.add(this.sunDisc); this.scene.add(this.moonDisc);
    this.stars = this._stars();
    this.scene.add(this.stars);

    this.pickPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.ray = new THREE.Raycaster();
    this._m4 = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._v = new THREE.Vector3();

    this._initFx3DPool();
    this._initAuraPool();
    VFX.on3DSpawn = (kind, e) => this.spawn3DFx(kind, e);

    this.build(world);
    this._benchPending = Settings.get('render3d') === 'auto';
    this.ok = true;
    return true;
  },

  /** สร้าง Pool ของวงแหวนออร่า 3D ใต้เท้าตัวละครที่ตีบวกและ Elite/Boss */
  _initAuraPool() {
    this.auraPool = [];
    const ringGeo = new THREE.RingGeometry(6.5, 10.5, 24);
    ringGeo.rotateX(-Math.PI / 2);
    for (let i = 0; i < MAX_AURAS; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffc94d, transparent: true, opacity: 0.72,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(ringGeo, mat);
      mesh.visible = false;
      this.scene.add(mesh);
      this.auraPool.push(mesh);
    }
  },

  /** สร้าง Pool ของเอฟเฟกต์สกิล 3D (วงแหวนคลื่นกระแทก + เสาแสง 3D) */
  _initFx3DPool() {
    this.fx3dList = [];
    const ringGeo = new THREE.RingGeometry(0.65, 1.0, 28);
    ringGeo.rotateX(-Math.PI / 2);
    const cylGeo = new THREE.CylinderGeometry(0.5, 0.85, 90, 16, 1, true);
    cylGeo.translate(0, 45, 0);

    for (let i = 0; i < MAX_FX3D; i++) {
      const isBeam = i >= MAX_FX3D - 4;
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(isBeam ? cylGeo : ringGeo, mat);
      mesh.visible = false;
      this.scene.add(mesh);
      this.fx3dList.push({ mesh, mat, isBeam, active: false, t: 0, dur: 0.5, size: 20, follow: null });
    }
  },

  spawn3DFx(kind, e) {
    if (!this.ok || !this.fx3dList) return;
    if (!['shockwave', 'explosion', 'beam', 'aura', 'implode'].includes(kind)) return;
    const wantBeam = kind === 'beam';
    const slot = this.fx3dList.find((x) => !x.active && x.isBeam === wantBeam)
      || this.fx3dList.find((x) => x.isBeam === wantBeam);
    if (!slot) return;
    slot.active = true;
    slot.kind = kind;
    slot.t = 0;
    slot.dur = e.dur || 0.5;
    slot.size = e.size || 28;
    slot.x = e.x || 0;
    slot.y = e.y || 0;
    slot.follow = e.follow || null;
    slot.mat.color.set(e.color || '#ffffff');
    slot.mesh.visible = true;
    const h = this.heightAt(slot.x, slot.y);
    slot.mesh.position.set(slot.x, h + 1.2, slot.y);
  },

  _updateFx3D(dt) {
    if (!this.fx3dList) return;
    for (const f of this.fx3dList) {
      if (!f.active) continue;
      f.t += dt;
      if (f.t >= f.dur) {
        f.active = false;
        f.mesh.visible = false;
        continue;
      }
      if (f.follow) { f.x = f.follow.x; f.y = f.follow.y; }
      const k = f.t / f.dur;
      const h = this.heightAt(f.x, f.y);
      f.mesh.position.set(f.x, h + 1.2, f.y);
      if (f.isBeam) {
        const w = f.size * (1 - k * 0.4);
        f.mesh.scale.set(w * 0.6, 1, w * 0.6);
        f.mat.opacity = (1 - k) * 0.75;
      } else {
        const r = f.kind === 'implode'
          ? f.size * (1 - k * 0.85)
          : (f.kind === 'aura' ? f.size * (0.85 + 0.15 * Math.sin(f.t * 10)) : f.size * (0.2 + k * 0.95));
        f.mesh.scale.set(r, 1, r);
        f.mat.opacity = (1 - k) * 0.85;
      }
    }
  },

  _bench() {
    try {
      const gl = this.renderer.getContext();
      // Warmup: คอมไพล์ Shader และอัปโหลด Buffer ลงการ์ดจอให้เสร็จก่อนจับเวลาจริง
      this.renderer.render(this.scene, this.camera);
      gl.finish();
      const N = 6;
      const t0 = performance.now();
      for (let i = 0; i < N; i++) this.renderer.render(this.scene, this.camera);
      gl.finish();
      const avg = (performance.now() - t0) / N;
      this.benchMs = Math.round(avg * 10) / 10;
      return avg < 28;
    } catch (e) { return false; }
  },

  _softwareGL() {
    try {
      const c = document.createElement('canvas');
      const gl = c.getContext('webgl2') || c.getContext('webgl');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const s = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
      return /swiftshader|software|llvmpipe|basic render/i.test(s);
    } catch (e) { return true; }
  },

  _disc(color, size, opacity) {
    const mesh = new THREE.Mesh(
      new THREE.CircleGeometry(size, 24),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity, fog: false, depthWrite: false }),
    );
    mesh.renderOrder = -5;
    return mesh;
  },

  _stars() {
    const n = 700, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const e = Math.random() * Math.PI * 0.45;
      pos[i * 3] = Math.cos(a) * Math.cos(e) * 1600;
      pos[i * 3 + 1] = Math.sin(e) * 1600 + 60;
      pos[i * 3 + 2] = Math.sin(a) * Math.cos(e) * 1600;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0xcfe0ff, size: 5, sizeAttenuation: false, transparent: true, opacity: 0, fog: false,
    }));
    return pts;
  },

  _tex(canvas, mip = true) {
    const t = new THREE.CanvasTexture(canvas);
    t.magFilter = THREE.NearestFilter;
    t.minFilter = mip ? THREE.LinearMipmapLinearFilter : THREE.NearestFilter;
    t.generateMipmaps = mip;
    if (mip && this.renderer) t.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    return t;
  },

  /* ═══════════ สร้างโมเดล 3D ของฉาก (บ้าน 3D · ต้นไม้ 3D · เสาไฟ · ตู้เซิร์ฟเวอร์ · บ่อน้ำ) ═══════════ */
  _build3DArchitecture(world) {
    this.archMeshes = [];
    const addInstanced = (geo, mat, matrices, castShadow = false, receiveShadow = false) => {
      if (!matrices.length) return null;
      const im = new THREE.InstancedMesh(geo, mat, matrices.length);
      for (let i = 0; i < matrices.length; i++) im.setMatrixAt(i, matrices[i]);
      im.instanceMatrix.needsUpdate = true;
      im.castShadow = castShadow;
      im.receiveShadow = receiveShadow;
      im.frustumCulled = false;
      this.scene.add(im);
      this.archMeshes.push(im);
      return im;
    };

    const m4 = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const scl = new THREE.Vector3(1, 1, 1);

    const wallMats = [], winMats = [], doorMats = [], roofMats = [], roofTopMats = [];
    const trunkMats = [], foliage1Mats = [], foliage2Mats = [];
    const hellTrunkMats = [], cyberRackMats = [], cyberLedMats = [], cyberRockMats = [];
    const lampPoleMats = [], lampHeadMats = [], rockMats = [], wellBaseMats = [], statueMats = [];

    for (let y = 0; y < world.h; y++) {
      for (let x = 0; x < world.w; x++) {
        const t = world.get(x, y);
        const wx = x * TS + TS / 2;
        const wz = y * TS + TS / 2;
        const h = this.sampleH(wx, wz);

        // เติมหลังคา 3D คลุมพื้นที่ด้านในตัวบ้าน (ทั้ง T.DIRT และ T.WALLWIN ที่อยู่ใต้แนวหลังคา T.ROOF 1-3 ช่อง)
        if ((t === T.DIRT || t === T.WALLWIN) && (world.get(x, y - 1) === T.ROOF || world.get(x, y - 2) === T.ROOF || world.get(x, y - 3) === T.ROOF)) {
          m4.compose(pos.set(wx, h + 8.5, wz), quat, scl.set(1, 1, 1));
          wallMats.push(m4.clone());
          m4.compose(pos.set(wx, h + 21.8, wz), quat, scl.set(1, 1, 1));
          roofTopMats.push(m4.clone());
          continue;
        }
        if (t === T.WALL || t === T.WALLWIN || t === T.DOOR) {
          m4.compose(pos.set(wx, h + 8.5, wz), quat, scl.set(1, 1, 1));
          wallMats.push(m4.clone());
          m4.compose(pos.set(wx, h + 19.2, wz), quat, scl.set(1, 1, 1));
          roofMats.push(m4.clone());
          if (t === T.DOOR) {
            m4.compose(pos.set(wx, h + 6.5, wz + 8.2), quat, scl.set(1, 1, 1));
            doorMats.push(m4.clone());
            m4.compose(pos.set(wx - 24, h + 9.5, wz + 8.2), quat, scl.set(1, 1, 1));
            winMats.push(m4.clone());
            m4.compose(pos.set(wx + 24, h + 9.5, wz + 8.2), quat, scl.set(1, 1, 1));
            winMats.push(m4.clone());
          }
        } else if (t === T.ROOF) {
          m4.compose(pos.set(wx, h + 8.5, wz), quat, scl.set(1, 1, 1));
          wallMats.push(m4.clone());
          m4.compose(pos.set(wx, h + 19.5, wz), quat, scl.set(1, 1, 1));
          roofMats.push(m4.clone());
        } else if (t === T.ROOFTOP) {
          m4.compose(pos.set(wx, h + 8.5, wz), quat, scl.set(1, 1, 1));
          wallMats.push(m4.clone());
          m4.compose(pos.set(wx, h + 22.2, wz), quat, scl.set(1, 1, 1));
          roofTopMats.push(m4.clone());
        } else if (t === T.TREE && x >= 2 && y >= 2 && x < world.w - 2 && y < world.h - 2) {
          const sc = 0.88 + (tileHash(x, y) % 5) * 0.07;
          m4.compose(pos.set(wx, h + 5.5 * sc, wz), quat, scl.set(sc, sc, sc));
          trunkMats.push(m4.clone());
          m4.compose(pos.set(wx, h + 13.5 * sc, wz), quat, scl.set(sc, sc, sc));
          foliage1Mats.push(m4.clone());
          m4.compose(pos.set(wx, h + 19.5 * sc, wz), quat, scl.set(sc * 0.78, sc * 0.85, sc * 0.78));
          foliage2Mats.push(m4.clone());
        } else if (t === T.HELLTREE && x >= 2 && y >= 2 && x < world.w - 2 && y < world.h - 2) {
          const sc = 0.9 + (tileHash(x, y) % 4) * 0.08;
          m4.compose(pos.set(wx, h + 8.0 * sc, wz), quat, scl.set(sc, sc, sc));
          hellTrunkMats.push(m4.clone());
        } else if (t === T.CYBERTREE && x >= 2 && y >= 2 && x < world.w - 2 && y < world.h - 2) {
          m4.compose(pos.set(wx, h + 13.0, wz), quat, scl.set(1, 1, 1));
          cyberRackMats.push(m4.clone());
          m4.compose(pos.set(wx, h + 13.5, wz + 5.7), quat, scl.set(1, 1, 1));
          cyberLedMats.push(m4.clone());
        } else if (t === T.CYBERROCK) {
          m4.compose(pos.set(wx, h + 4.5, wz), quat, scl.set(1, 1, 1));
          cyberRockMats.push(m4.clone());
        } else if (t === T.LAMP) {
          m4.compose(pos.set(wx, h + 7.5, wz), quat, scl.set(1, 1, 1));
          lampPoleMats.push(m4.clone());
          m4.compose(pos.set(wx, h + 15.5, wz), quat, scl.set(1, 1, 1));
          lampHeadMats.push(m4.clone());
        } else if (t === T.ROCK || t === T.HELLROCK) {
          const sc = 0.85 + (tileHash(x, y) % 4) * 0.1;
          m4.compose(pos.set(wx, h + 4.2 * sc, wz), quat, scl.set(sc * 1.15, sc * 0.85, sc));
          rockMats.push(m4.clone());
        } else if (t === T.WELL) {
          m4.compose(pos.set(wx, h + 4.5, wz), quat, scl.set(1, 1, 1));
          wellBaseMats.push(m4.clone());
          m4.compose(pos.set(wx, h + 14.5, wz), quat, scl.set(0.85, 0.85, 0.85));
          roofMats.push(m4.clone());
        } else if (t === T.STATUE) {
          m4.compose(pos.set(wx, h + 8.0, wz), quat, scl.set(1, 1, 1));
          statueMats.push(m4.clone());
        }
      }
    }

    // 1) บ้าน 3D (ผนัง + หน้าต่างไฟอุ่น + ประตูไม้ + หลังคาทรงจั่ว)
    addInstanced(
      new THREE.BoxGeometry(16.1, 17, 16.1),
      new THREE.MeshLambertMaterial({ map: this._tex(SPR['t_wall'].frames[0], false) }),
      wallMats
    );
    addInstanced(
      new THREE.BoxGeometry(7, 6, 0.8),
      new THREE.MeshBasicMaterial({ color: 0xffd88a }),
      winMats, false, false
    );
    addInstanced(
      new THREE.BoxGeometry(8, 12, 0.9),
      new THREE.MeshLambertMaterial({ color: 0x5c3d24 }),
      doorMats, false, true
    );
    addInstanced(
      new THREE.BoxGeometry(17.2, 5.5, 17.2),
      new THREE.MeshLambertMaterial({ map: this._tex(SPR['t_roof'].frames[0], false) }),
      roofMats, true, false
    );
    addInstanced(
      new THREE.BoxGeometry(17.6, 6.5, 17.6),
      new THREE.MeshLambertMaterial({ map: this._tex(SPR['t_rooftop'].frames[0], false) }),
      roofTopMats
    );

    // 2) ต้นไม้ 3D (ลำต้นทรงกระบอก + พุ่มใบ 2 ชั้น)
    addInstanced(
      new THREE.CylinderGeometry(2.0, 2.8, 11, 5),
      new THREE.MeshLambertMaterial({ color: 0x5c3d24 }),
      trunkMats
    );
    addInstanced(
      new THREE.ConeGeometry(8.5, 13, 6),
      new THREE.MeshLambertMaterial({ color: 0x2f7d3d }),
      foliage1Mats, true, false
    );
    addInstanced(
      new THREE.ConeGeometry(7.2, 11, 6),
      new THREE.MeshLambertMaterial({ color: 0x429e50 }),
      foliage2Mats
    );

    // 3) ต้นไม้แห่งความมืด (โซน 2)
    addInstanced(
      new THREE.ConeGeometry(3.2, 17, 6),
      new THREE.MeshLambertMaterial({ color: 0x2d2036 }),
      hellTrunkMats
    );

    // 4) ตู้แร็คเซิร์ฟเวอร์ 3D + แท่นขุดการ์ดจอ (โซน 3)
    addInstanced(
      new THREE.BoxGeometry(11.5, 26, 11.5),
      new THREE.MeshLambertMaterial({ color: 0x182238 }),
      cyberRackMats, true, false
    );
    addInstanced(
      new THREE.BoxGeometry(8.5, 20, 0.6),
      new THREE.MeshBasicMaterial({ map: this._tex(SPR['t_cybertree'].frames[0], false), color: 0x7fe8ff }),
      cyberLedMats, false, false
    );
    addInstanced(
      new THREE.BoxGeometry(12, 8, 9),
      new THREE.MeshLambertMaterial({ color: 0x2b3b5c, emissive: 0x1b4b7a, emissiveIntensity: 0.45 }),
      cyberRockMats
    );

    // 5) เสาไฟถนน 3D + โคมไฟเรืองแสง
    addInstanced(
      new THREE.CylinderGeometry(0.9, 1.3, 15, 6),
      new THREE.MeshLambertMaterial({ color: 0x3b3530 }),
      lampPoleMats
    );
    addInstanced(
      new THREE.BoxGeometry(4.6, 4.2, 4.6),
      new THREE.MeshBasicMaterial({ color: world.cyber ? 0x6ff0ff : 0xffe6a3 }),
      lampHeadMats, false, false
    );

    // 6) โขดหิน 3D + บ่อน้ำ 3D + รูปปั้นผู้กล้า 3D
    addInstanced(
      new THREE.DodecahedronGeometry(6.2, 0),
      new THREE.MeshLambertMaterial({ color: world.hell ? 0x523b58 : 0x737b8c }),
      rockMats
    );
    addInstanced(
      new THREE.CylinderGeometry(6.8, 7.2, 8, 12),
      new THREE.MeshLambertMaterial({ color: 0x7d8494 }),
      wellBaseMats
    );
    addInstanced(
      new THREE.CylinderGeometry(3.2, 4.5, 16, 8),
      new THREE.MeshLambertMaterial({ color: 0xd4dae6 }),
      statueMats
    );
  },

  /* ═══════════ สร้างโลก ═══════════ */
  build(world) {
    const W = world.w * TS, H = world.h * TS;
    this.mapW = W; this.mapH = H;
    this.world = world;
    this.groundH = new Float32Array(world.w * world.h);
    for (let y = 0; y < world.h; y++) for (let x = 0; x < world.w; x++) {
      this.groundH[y * world.w + x] = hOf(world.get(x, y));
    }
    {
      const src = this.groundH, sm = new Float32Array(src.length);
      for (let y = 0; y < world.h; y++) for (let x = 0; x < world.w; x++) {
        let s = 0, n = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= world.w || ny >= world.h) continue;
          s += src[ny * world.w + nx]; n++;
        }
        sm[y * world.w + x] = s / n;
      }
      this.groundH = sm;
    }

    const cleanGroundCanvas = bakeCleanGround3D(world);
    this.mapTex = this._tex(cleanGroundCanvas, true);
    const tilesData = new Uint8Array(world.w * world.h);
    for (let i = 0; i < tilesData.length; i++) tilesData[i] = world.tiles[i];
    this.tileTex = new THREE.DataTexture(tilesData, world.w, world.h, THREE.RedFormat);
    this.tileTex.magFilter = THREE.NearestFilter; this.tileTex.minFilter = THREE.NearestFilter;
    this.tileTex.needsUpdate = true;

    const geo = new THREE.PlaneGeometry(W, H, world.w * 2, world.h * 2);
    geo.rotateX(-Math.PI / 2);
    geo.translate(W / 2, 0, H / 2);
    const posA = geo.attributes.position;
    for (let i = 0; i < posA.count; i++) {
      posA.setY(i, this.sampleH(posA.getX(i), posA.getZ(i)));
    }
    geo.computeVertexNormals();

    this.terrainMat = new THREE.MeshStandardMaterial({
      map: this.mapTex, roughness: 0.90, metalness: 0.02,
    });
    this.terrainMat.userData.sh = null;
    this.terrainMat.onBeforeCompile = (sh) => {
      sh.uniforms.uTiles = { value: this.tileTex };
      sh.uniforms.uGrid = { value: new THREE.Vector2(world.w, world.h) };
      sh.uniforms.uMapSize = { value: new THREE.Vector2(W, H) };
      sh.uniforms.uTime = { value: 0 };
      sh.uniforms.uSunCol = { value: new THREE.Vector3(1, 1, 1) };
      sh.uniforms.uSunI = { value: 1 };
      sh.uniforms.uSunDir = { value: new THREE.Vector3(0.4, 0.8, 0.4) };
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\n' +
          'uniform sampler2D uTiles; uniform vec2 uGrid; uniform vec2 uMapSize;\n' +
          'uniform float uTime; uniform vec3 uSunCol; uniform float uSunI; uniform vec3 uSunDir;')
        .replace('#include <map_fragment>', '#include <map_fragment>\n' +
          'vec2 uvTile = vec2(vMapUv.x, 1.0 - vMapUv.y);\n' +
          'vec2 wpos = uvTile * uMapSize;\n' +
          'float id = texture2D(uTiles, (floor(uvTile * uGrid) + 0.5) / uGrid).r * 255.0;\n' +
          // ── Micro-detail บนพื้นหญ้าและทางหิน ──
          'float micro = sin(wpos.x * 0.85) * cos(wpos.y * 0.85) * 0.035;\n' +
          'diffuseColor.rgb += micro;\n' +
          // ── น้ำ & สายธารดาต้า: คลื่น 3 ความถี่ + Fresnel Specular + ขอบฟองน้ำ ──
          'if (abs(id - ' + T.WATER + '.0) < 0.5 || abs(id - ' + T.SHALLOW + '.0) < 0.5 || abs(id - ' + T.DATASTREAM + '.0) < 0.5) {\n' +
          '  float k1 = 0.11, k2x = 0.05, k2y = 0.09, k3x = -0.04, k3y = 0.16;\n' +
          '  float p1 = wpos.x * k1 + uTime * 1.8;\n' +
          '  float p2 = wpos.x * k2x + wpos.y * k2y - uTime * 1.3;\n' +
          '  float p3 = wpos.y * k3y + wpos.x * k3x + uTime * 2.5;\n' +
          '  vec2 dh = vec2(k1 * cos(p1) + k2x * cos(p2) + k3x * cos(p3),\n' +
          '                 k2y * cos(p2) + k3y * cos(p3));\n' +
          '  vec3 nrm = normalize(vec3(-dh * 0.95, 1.0));\n' +
          '  vec3 V = normalize(vViewPosition);\n' +
          '  vec3 L = normalize(uSunDir);\n' +
          '  float F = 0.04 + 0.96 * pow(1.0 - max(dot(nrm, V), 0.0), 4.0);\n' +
          '  float spec = pow(max(dot(reflect(-L, nrm), V), 0.0), 48.0) * F;\n' +
          '  float caust = 0.5 + 0.5 * sin(p1 + p2);\n' +
          '  diffuseColor.rgb += vec3(0.08, 0.16, 0.24) * caust * 0.35;\n' +
          '  diffuseColor.rgb += uSunCol * spec * (0.35 + uSunI * 1.75);\n' +
          '}\n' +
          // ── พื้นไซเบอร์: เส้นวงจรเรืองแสงวิ่งเป็นจังหวะ ──
          'if (abs(id - ' + T.CYBERFLOOR + '.0) < 0.5) {\n' +
          '  vec2 cell = fract(wpos / 16.0);\n' +
          '  float gridLine = step(0.92, max(cell.x, cell.y));\n' +
          '  float wave = 0.5 + 0.5 * sin((wpos.x + wpos.y) * 0.04 - uTime * 3.2);\n' +
          '  diffuseColor.rgb += vec3(0.06, 0.32, 0.55) * gridLine * (0.35 + 0.65 * wave);\n' +
          '}\n' +
          // ── ลาวา: เพลิงแมกมาเรืองแสง + ขอบ Fresnel ──
          'if (abs(id - ' + T.LAVA + '.0) < 0.5) {\n' +
          '  float pulse = 0.5 + 0.5 * sin(wpos.x * 0.2 + wpos.y * 0.13 + uTime * 2.6);\n' +
          '  vec3 V = normalize(vViewPosition);\n' +
          '  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.42, 0.10), 0.50 + 0.28 * pulse);\n' +
          '  diffuseColor.rgb *= 1.15 + 0.55 * pulse;\n' +
          '  diffuseColor.rgb += vec3(0.95, 0.30, 0.06) * pow(1.0 - max(dot(vec3(0.0, 1.0, 0.0), V), 0.0), 3.0) * 0.65;\n' +
          '}\n' +
          // ── บ่อบั๊กไฟดูด: พัลส์นีออนม่วง-ฟ้า ──
          'if (abs(id - ' + T.GLITCH + '.0) < 0.5) {\n' +
          '  float pulse = 0.5 + 0.5 * sin(wpos.x * 0.35 - wpos.y * 0.25 + uTime * 5.5);\n' +
          '  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.45, 0.92, 1.0), 0.42 * pulse);\n' +
          '  diffuseColor.rgb *= 1.1 + 0.5 * pulse;\n' +
          '}');
      this.terrainMat.userData.sh = sh;
    };
    this.terrain = new THREE.Mesh(geo, this.terrainMat);
    this.terrain.receiveShadow = true;
    this.scene.add(this.terrain);

    // สร้างโมเดลสถาปัตยกรรมและพร็อพ 3D จริง
    this._build3DArchitecture(world);

    // ── พร็อพ Cutout Billboard เสริมรายละเอียด ──
    this.obstacles = [];
    const groups = new Map();
    for (let y = 0; y < world.h; y++) for (let x = 0; x < world.w; x++) {
      const t = world.get(x, y);
      if (NO_BILLBOARD.has(t)) continue;
      const sid = SPRITE_OF_TILE[t];
      if (!sid || !SPR[sid]) continue;
      const g = groups.get(sid) || { sid, sp: SPR[sid], items: [] };
      g.items.push({ x: x * TS + TS / 2, z: y * TS + TS / 2, h: this.sampleH(x * TS + TS / 2, y * TS + TS / 2) });
      groups.set(sid, g);
    }
    for (const g of groups.values()) {
      const mat = new THREE.MeshBasicMaterial({
        map: this._tex(makeCutoutCanvas(g.sp.frames[0]), false), transparent: true, alphaTest: 0.5, side: THREE.FrontSide,
      });
      mat.userData.sh = null;
      mat.onBeforeCompile = (sh) => {
        sh.uniforms.uNight = { value: 1 };
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', '#include <common>\nuniform float uNight;')
          .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= uNight;');
        mat.userData.sh = sh;
      };
      const mesh = new THREE.InstancedMesh(
        new THREE.PlaneGeometry(g.sp.w * 1.15, g.sp.h * 1.15),
        mat,
        g.items.length,
      );
      mesh.frustumCulled = false;
      mesh.castShadow = true;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.scene.add(mesh);
      this.obstacles.push({ g, mesh, mat });
    }

    // ── หีบสมบัติ 3D + ประตูมิติ 3D Torus ──
    this.chestMeshes = (world.chests || []).map((c) => {
      const grp = new THREE.Group();
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(11, 7.5, 8.5),
        new THREE.MeshLambertMaterial({ color: 0xb87d32 })
      );
      const trim = new THREE.Mesh(
        new THREE.BoxGeometry(11.4, 2.0, 8.9),
        new THREE.MeshBasicMaterial({ color: 0xffd76a })
      );
      trim.position.y = 1.5;
      grp.add(box); grp.add(trim);
      const h = this.sampleH(c.x + 8, c.y + 4);
      grp.position.set(c.x + 8, h + 4.2, c.y + 4);
      grp.userData.chest = c;
      this.scene.add(grp);
      return grp;
    });

    this.portalMeshes = (world.portals || []).map((pt) => {
      const grp = new THREE.Group();
      const torus = new THREE.Mesh(
        new THREE.TorusGeometry(8.5, 1.5, 10, 24),
        new THREE.MeshBasicMaterial({ color: world.cyber ? 0x4ae8ff : 0xb98bff })
      );
      const core = new THREE.Mesh(
        new THREE.CircleGeometry(7.2, 20),
        new THREE.MeshBasicMaterial({
          color: world.cyber ? 0x9ff8ff : 0xe6c8ff,
          transparent: true, opacity: 0.78, side: THREE.DoubleSide,
        })
      );
      grp.add(torus); grp.add(core);
      const h = this.sampleH(pt.x + 8, pt.y + 6);
      grp.position.set(pt.x + 8, h + 10, pt.y + 6);
      grp.userData.torus = torus;
      this.scene.add(grp);
      return grp;
    });

    this.entityPool = {};
    this.frameCache = {};
    this._poolKeys = [];

    this.shadowMesh = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({
        map: this._blobShadowTex(), transparent: true, opacity: 0.55,
        depthWrite: false, color: 0x000000,
      }),
      MAX_SHADOWS,
    );
    this.shadowMesh.frustumCulled = false;
    this.shadowMesh.renderOrder = -1;
    this.shadowMesh.count = 0;
    this.scene.add(this.shadowMesh);

    this.pPos = new Float32Array(MAX_PARTICLES * 3);
    this.pCol = new Float32Array(MAX_PARTICLES * 3);
    const pgeo = new THREE.BufferGeometry();
    pgeo.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3));
    pgeo.setAttribute('color', new THREE.BufferAttribute(this.pCol, 3));
    this.points = new THREE.Points(pgeo, new THREE.PointsMaterial({
      size: 7, vertexColors: true, transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
    }));
    this.points.frustumCulled = false;
    this.scene.add(this.points);

    this._t = 0;
  },

  remap(world) {
    if (!this.ok) return;
    for (const o of (this.obstacles || [])) { this.scene.remove(o.mesh); o.mesh.geometry.dispose(); o.mesh.material.dispose(); }
    for (const m of (this.archMeshes || [])) { this.scene.remove(m); m.geometry.dispose(); m.material.dispose(); }
    for (const m of (this.chestMeshes || [])) { this.scene.remove(m); }
    for (const m of (this.portalMeshes || [])) { this.scene.remove(m); }
    this.scene.remove(this.terrain); this.terrain.geometry.dispose(); this.terrainMat.dispose();
    this.scene.remove(this.points); this.points.geometry.dispose(); this.points.material.dispose();
    if (this.shadowMesh) { this.scene.remove(this.shadowMesh); this.shadowMesh.geometry.dispose(); this.shadowMesh.material.map.dispose(); this.shadowMesh.material.dispose(); this.shadowMesh = null; }
    for (const sid of Object.keys(this.entityPool)) {
      const pool = this.entityPool[sid];
      for (const m of pool.used) this.scene.remove(m);
      for (const m of pool.free) this.scene.remove(m);
    }
    this.obstacles = []; this.archMeshes = []; this.chestMeshes = []; this.portalMeshes = []; this.entityPool = {};
    this._poolKeys = [];
    this.build(world);
  },

  resize(w, h) {
    if (!this.ok) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
    this.viewW = w; this.viewH = h;
  },

  _blobShadowTex() {
    const c = document.createElement('canvas');
    c.width = c.height = 32;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(16, 16, 1, 16, 16, 15);
    gr.addColorStop(0, 'rgba(0,0,0,0.9)');
    gr.addColorStop(0.55, 'rgba(0,0,0,0.4)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 32, 32);
    const t = new THREE.CanvasTexture(c);
    t.minFilter = THREE.LinearFilter;
    t.magFilter = THREE.LinearFilter;
    return t;
  },

  /* ═══════════ อินพุต ═══════════ */
  pick(clientX, clientY) {
    if (!this.ok) return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.ray.setFromCamera(ndc, this.camera);
    const hit = new THREE.Vector3();
    this.pickPlane.constant = -(this._pickY || 0);
    return this.ray.ray.intersectPlane(this.pickPlane, hit) ? { x: hit.x, y: hit.z } : null;
  },

  /** world → CSS px (สำหรับ DOM overlay) */
  project(wx, wy, headUp = 0) {
    if (!this.ok) return { sx: 0, sy: 0, depth: 1 };
    this._v.set(wx, this.heightAt(wx, wy) + headUp, wy);
    this._v.project(this.camera);
    return {
      sx: (this._v.x * 0.5 + 0.5) * (this.viewW || 1),
      sy: (-this._v.y * 0.5 + 0.5) * (this.viewH || 1),
      depth: this._v.z,
    };
  },

  sampleH(wx, wy) {
    const w = this.world;
    if (!w || !this.groundH) return 0;
    const fx = wx / TS - 0.5, fy = wy / TS - 0.5;
    const x0 = Math.max(0, Math.min(w.w - 1, Math.floor(fx)));
    const y0 = Math.max(0, Math.min(w.h - 1, Math.floor(fy)));
    const x1 = Math.min(w.w - 1, x0 + 1), y1 = Math.min(w.h - 1, y0 + 1);
    const tx = Math.max(0, Math.min(1, fx - x0)), ty = Math.max(0, Math.min(1, fy - y0));
    const h00 = this.groundH[y0 * w.w + x0], h10 = this.groundH[y0 * w.w + x1];
    const h01 = this.groundH[y1 * w.w + x0], h11 = this.groundH[y1 * w.w + x1];
    return (h00 * (1 - tx) + h10 * tx) * (1 - ty) + (h01 * (1 - tx) + h11 * tx) * ty;
  },

  heightAt(wx, wy) {
    return this.sampleH(wx, wy);
  },

  _getEntity(sprId) {
    const sp = SPR[sprId] || SPR['dummy'];
    if (!sp) return null;
    let pool = this.entityPool[sprId];
    if (!pool) {
      pool = this.entityPool[sprId] = { sp, used: [], free: [] };
      this._poolKeys.push(sprId);
    }
    let mesh = pool.free.pop();
    if (!mesh) {
      const tex0 = this._frameTex(sprId, 0, false);
      const mat = new THREE.MeshLambertMaterial({
        map: tex0, emissiveMap: tex0,
        emissive: 0xffffff, emissiveIntensity: 0.30,
        transparent: true, alphaTest: 0.5, side: THREE.FrontSide,
      });
      // ขยายสเกลตัวละคร 1.2x ในโลก 3D ให้โดดเด่นและเห็นรายละเอียดอาวุธชัดขึ้น
      mesh = new THREE.Mesh(new THREE.PlaneGeometry(sp.w * 1.2, sp.h * 1.2), mat);
      mesh.userData.sprId = sprId;
      mesh.userData.texKey = '';
      this.scene.add(mesh);
    }
    pool.used.push(mesh);
    return mesh;
  },

  /** คืนค่า Texture ของสไปรต์ (รองรับการพลิกซ้าย-ขวาที่แคนวาส เพื่อให้ใช้ THREE.FrontSide ได้เสมอ) */
  _frameTex(sprId, frame, flip = false) {
    const sp = SPR[sprId] || SPR['dummy'];
    if (!sp) return null;
    const fIdx = Math.min(frame || 0, sp.frames.length - 1);
    const key = `${sprId}:${fIdx}:${flip ? 'L' : 'R'}`;
    if (!this.frameCache[key]) {
      const baseCanvas = sp.frames[fIdx] || sp.frames[0];
      const src = flip ? makeFlippedCanvas(baseCanvas) : baseCanvas;
      this.frameCache[key] = this._tex(src, false);
    }
    return this.frameCache[key];
  },

  syncEntities(list) {
    const camQ = this.camera.quaternion;
    for (const sid of this._poolKeys) {
      const pool = this.entityPool[sid];
      for (const m of pool.used) pool.free.push(m);
      pool.used.length = 0;
    }
    let shN = 0;
    let auraIdx = 0;
    for (const ent of list) {
      const mesh = this._getEntity(ent.sprId);
      if (!mesh) continue;
      const sp = SPR[ent.sprId] || SPR['dummy'];
      const h = this.heightAt(ent.x, ent.y);
      mesh.position.set(ent.x, h + (ent.headUp || 0) + sp.h * 0.6 - 0.8, ent.y + 4.2);
      mesh.quaternion.copy(camQ);
      mesh.scale.x = 1; // ใช้ pre-flipped texture แทน scale.x = -1 เพื่อรักษา FrontSide

      const fIdx = Math.min(ent.frame || 0, sp.frames.length - 1);
      const texKey = `${ent.sprId}:${fIdx}:${ent.flip ? 'L' : 'R'}`;
      if (mesh.userData.texKey !== texKey) {
        const tex = this._frameTex(ent.sprId, fIdx, !!ent.flip);
        mesh.material.map = tex;
        mesh.material.emissiveMap = tex;
        mesh.userData.texKey = texKey;
      }
      mesh.visible = true;

      if (this.shadowMesh && shN < MAX_SHADOWS) {
        const d = (ent.shadowR || Math.max(10, sp.w * 0.72));
        this._m4.compose(this._v.set(ent.x, h + 0.6, ent.y), this._qi, this._v2.set(d, d, 1));
        this.shadowMesh.setMatrixAt(shN++, this._m4);
      }

      if (ent.auraColor && this.auraPool && auraIdx < MAX_AURAS) {
        const ring = this.auraPool[auraIdx++];
        ring.visible = true;
        ring.position.set(ent.x, h + 0.9, ent.y);
        const pulse = 0.92 + 0.14 * Math.sin(this._t * 6 + auraIdx);
        ring.scale.set(pulse, 1, pulse);
        ring.material.color.set(ent.auraColor);
      }
    }
    if (this.auraPool) {
      for (let i = auraIdx; i < MAX_AURAS; i++) this.auraPool[i].visible = false;
    }
    if (this.shadowMesh) {
      this.shadowMesh.count = shN;
      this.shadowMesh.instanceMatrix.needsUpdate = true;
      this.shadowMesh.visible = shN > 0;
    }
    for (const sid of this._poolKeys) {
      for (const m of this.entityPool[sid].free) m.visible = false;
    }
  },

  _syncObstacles() {
    const cx = this.camera.position.x, cz = this.camera.position.z;
    if (cx !== this._obCX || cz !== this._obCZ || this._focusX !== this._obFX || this._focusZ !== this._obFZ) {
      this._obCX = cx; this._obCZ = cz; this._obFX = this._focusX; this._obFZ = this._focusZ;
      for (const o of this.obstacles) {
        const items = o.g.items, sp = o.g.sp;
        let n = 0;
        for (let i = 0; i < items.length && n < items.length; i++) {
          const it = items[i];
          if (Math.abs(it.x - this._focusX) > 680 || Math.abs(it.z - this._focusZ) > 520) continue;
          const yaw = Math.atan2(cx - it.x, cz - it.z);
          this._q.setFromAxisAngle(this._upAxis, yaw);
          this._m4.compose(
            this._v.set(it.x, it.h + sp.h * 0.55 - 1.0, it.z),
            this._q,
            this._one,
          );
          o.mesh.setMatrixAt(n++, this._m4);
        }
        o.mesh.count = n;
        o.mesh.instanceMatrix.needsUpdate = true;
      }
    }
    for (const m of this.chestMeshes) m.visible = !(m.userData.chest && m.userData.chest.opened);
    for (const m of this.portalMeshes) {
      m.quaternion.copy(this.camera.quaternion);
      if (m.userData.torus) m.userData.torus.rotation.z = this._t * 2.4;
    }
  },

  _upAxis: new THREE.Vector3(0, 1, 0),
  _one: new THREE.Vector3(1, 1, 1),
  _qi: new THREE.Quaternion(),
  _v2: new THREE.Vector3(1, 1, 1),

  /** เงา/แสง/ฟากฟ้า + ไฟจุด ตามเฟสวันและโซน */
  syncSky(state) {
    if (!this.ok) return;
    const dark = state._dnDark || 0;
    const t = state.time;
    const p = state.player;
    const world = state.world;
    const pz = p.y;

    const dayT = (t % 300) / 300;
    const elev = Math.max(0, Math.sin((dayT - 0.25) * Math.PI * 2));
    const az = (dayT - 0.25) * Math.PI * 2;
    const SX = Math.cos(az) * 420, SZ = Math.sin(az) * 420;
    const SY = Math.max(80, elev * 430);
    this.sun.position.set(p.x + SX, SY, pz + SZ);
    this.sun.target.position.set(p.x, 0, pz);
    const [kr, kg, kb] = world.cyber ? [0.65, 0.88, 1.0] : kelvinToRGB(dark > 0.15 ? 2300 : 6500);
    this.sun.color.setRGB(Math.min(1, kr * 1.05), Math.min(1, kg * 1.05), Math.min(1, kb * 1.05));
    this.sun.intensity = world.cyber ? 0.90 : Math.max(0.15, 1.25 - dark * 1.30);
    this.sun.castShadow = this.sun.intensity > 0.3;
    this.hemi.intensity = world.cyber ? 0.72 : (0.50 + (1 - dark) * 0.45);
    this.hemi.color.setRGB(0.65 + (1 - dark) * 0.3, 0.75 + (1 - dark) * 0.24, 1);
    this.moon.position.set(p.x - SX * 0.5, 340, pz - SZ * 0.5);
    this.moon.target.position.set(p.x, 0, pz);
    this.moon.intensity = dark * 0.35;

    const dusk = Math.max(0, 1 - Math.abs(dark - 0.55) * 4);
    if (world.cyber) {
      _skyCol.copy(_skyCyber);
    } else {
      _skyCol.copy(_skyNight).lerp(_skyDay, 1 - dark).lerp(_skyDusk, dusk * 0.5);
    }
    this.scene.fog.color.copy(_skyCol);
    this.stars.material.opacity = world.cyber ? 0.85 : Math.max(0, dark - 0.22) * 1.5;

    this.sunDisc.position.set(p.x + SX * 2.2, SY * 1.9 + 120, pz + SZ * 2.2);
    this.sunDisc.material.opacity = world.cyber ? 0.2 : Math.max(0, 1 - dark * 1.5);
    this.sunDisc.quaternion.copy(this.camera.quaternion);
    this.moonDisc.position.set(p.x - SX * 2.2, 330, pz - SZ * 2.2);
    this.moonDisc.material.opacity = world.cyber ? 0.8 : Math.max(0, dark - 0.3);
    this.moonDisc.quaternion.copy(this.camera.quaternion);

    const sh = this.terrainMat.userData.sh;
    if (sh) {
      sh.uniforms.uTime.value = this._t;
      sh.uniforms.uSunCol.value.set(kr, kg, kb);
      sh.uniforms.uSunI.value = world.cyber ? 0.9 : Math.max(0, 1 - dark * 1.4);
      sh.uniforms.uSunDir.value
        .copy(this.sun.position)
        .sub(this.sun.target.position);
    }

    const nightMul = world.cyber ? 0.88 : (0.35 + 0.65 * (1 - dark));
    for (const o of this.obstacles) {
      const osh = o.mat.userData.sh;
      if (osh) osh.uniforms.uNight.value = nightMul;
    }

    let ln = 0;
    const push = (x, y, r, power, col) => {
      const d = (x - p.x) ** 2 + (y - p.y) ** 2;
      if (d > 620 * 620) return;
      if (ln === MAX_LIGHTS && d >= _lsD[MAX_LIGHTS - 1]) return;
      let i = Math.min(ln, MAX_LIGHTS - 1);
      while (i > 0 && _lsD[i - 1] > d) {
        _lsX[i] = _lsX[i - 1]; _lsY[i] = _lsY[i - 1]; _lsR[i] = _lsR[i - 1];
        _lsP[i] = _lsP[i - 1]; _lsCol[i] = _lsCol[i - 1]; _lsD[i] = _lsD[i - 1]; i--;
      }
      if (ln < MAX_LIGHTS) ln++;
      _lsX[i] = x; _lsY[i] = y; _lsR[i] = r; _lsP[i] = power; _lsCol[i] = col; _lsD[i] = d;
    };
    for (let i = 0; i < world.lightSpots.length; i += 3) {
      const strong = world.lightSpots[i + 2] === 1;
      const col = world.cyber ? 0x4ae8ff : 0xffb45a;
      push(world.lightSpots[i], world.lightSpots[i + 1], strong ? 46 : 30, strong ? 1 : 0.6, col);
    }
    if (world.hell) {
      for (let yy = 2; yy < world.h; yy += 8) for (let xx = 2; xx < world.w; xx += 8) {
        if (world.get(xx, yy) === T.LAVA) push(xx * 16 + 8, yy * 16 + 8, 60, 0.85, 0xff6a22);
      }
    } else if (world.cyber) {
      for (let yy = 2; yy < world.h; yy += 8) for (let xx = 2; xx < world.w; xx += 8) {
        const tl = world.get(xx, yy);
        if (tl === T.DATASTREAM) push(xx * 16 + 8, yy * 16 + 8, 56, 0.8, 0x2ad4ff);
        else if (tl === T.GLITCH) push(xx * 16 + 8, yy * 16 + 8, 52, 0.85, 0xd05cff);
      }
    }
    push(p.x, p.y - 4, 38, 0.5, world.cyber ? 0x9fe8ff : 0xffd9a0);
    for (let i = 0; i < ln; i++) {
      const L = this.lightPool[i];
      L.visible = true;
      L.position.set(_lsX[i], this.heightAt(_lsX[i], _lsY[i]) + 16, _lsY[i]);
      L.distance = _lsR[i] * 2.4;
      L.intensity = _lsP[i] * _lsR[i] * _lsR[i] * (0.85 + 0.15 * Math.sin(t * 7.3 + i * 1.7) * Math.sin(t * 12.1 + i));
      L.color.setHex(_lsCol[i]);
    }
    for (let i = ln; i < MAX_LIGHTS; i++) this.lightPool[i].visible = false;
  },

  /** เรียกรวมทุกอย่าง — main เรียกต่อเฟรม */
  render(state, alpha, dt, list) {
    if (!this.ok || this._freeze) return;
    if (this._benchPending) {
      this._benchPending = false;
      if (!this._bench()) { this.ok = false; this.reason = 'slow-gl'; }
    }
    if (!this.ok) return;
    const p = state.player;
    this._t += dt;

    const fx = p.x + p.dir * 22, fz = p.y + 10;
    const D = 300 * (this.zoom || 0.92), ELEV = this.elev || 0.58;
    this.camera.position.lerp(this._v.set(fx, D * Math.sin(ELEV), fz + D * Math.cos(ELEV)), Math.min(1, dt * 7));
    this.camTarget.lerp(this._v.set(fx, 0, fz), Math.min(1, dt * 7));
    this.camera.lookAt(this.camTarget);
    this._pickY = this.heightAt(p.x, p.y);
    this._focusX = fx; this._focusZ = fz;

    this.syncSky(state, dt);
    this.syncEntities(list || []);
    this._syncObstacles(state);
    this._updateFx3D(dt);

    this.flash = Math.max(0, (this.flash || 0) - dt * 2.4);

    let cnt = 0;
    const pool = state._gfxParticles;
    if (pool) {
      for (let i = 0; i < pool.length && cnt < MAX_PARTICLES; i++) {
        const q = pool[i];
        if (!q.on) continue;
        const h = this.heightAt(q.x, q.y);
        const up = q.pulse ? 4 + (q.seed % 9) : Math.max(0, Math.min(30, (q.groundY - q.y) * 0.45));
        this.pPos[cnt * 3] = q.x;
        this.pPos[cnt * 3 + 1] = h + up;
        this.pPos[cnt * 3 + 2] = q.y;
        const a = q.pulse ? (0.35 + 0.65 * (0.5 + 0.5 * Math.sin(state.time * 5 + i)))
          : Math.min(1, q.life / q.max * 2.2);
        this.pCol[cnt * 3] = a; this.pCol[cnt * 3 + 1] = a; this.pCol[cnt * 3 + 2] = a;
        cnt++;
      }
    }
    this.points.geometry.setDrawRange(0, cnt);
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
    this.points.visible = cnt > 0;

    const shDx = p.x - (this._shX ?? -1e9), shDy = p.y - (this._shY ?? -1e9);
    if (shDx * shDx + shDy * shDy > 100 || Math.abs(state.time - (this._shT ?? -99)) > 0.35) {
      this.renderer.shadowMap.needsUpdate = true;
      this._shX = p.x; this._shY = p.y; this._shT = state.time;
    }

    this.renderer.render(this.scene, this.camera);
  },
};
