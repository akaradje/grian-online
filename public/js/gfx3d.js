/* ═══════════════════════════════════════════════════════════
   gfx3d.js — โลก 3D จริงด้วย three.js (WebGL2)
   ── อัปเกรดใน v1.0.0 ──
   · แก้บั๊กพิกัดดวงอาทิตย์/ดวงจันทร์ (p.y แทน p.z) ให้เงาและ specular น้ำแม่นยำ
   · รองรับโซน 3 (แดนเซิร์ฟเถื่อน): สายธารดาต้าเรืองแสง · บ่อบั๊กไฟดูด · แสงไฟไซเบอร์
   · เพิ่มเอฟเฟกต์สกิล 3D จริงบนพื้นโลก (3D Shockwave Ring & Light Pillar)
   · รองรับการซูมกล้อง (Mouse Wheel / ตั้งค่าระยะกล้อง) และวงออร่าอาวุธตีบวก
   ═══════════════════════════════════════════════════════════ */

import * as THREE from '../vendor/three.module.min.js';
import { CONFIG } from './data.js';
import { SPR } from './sprites.js';
import { T, SPRITE_OF_TILE } from './world.js';
import { Settings } from './settings.js';
import { VFX } from './vfx.js';

const TS = CONFIG.TILE;
const TILE_H = {
  0: 0, 1: 0, 14: 0, 24: 0, 25: 0, 34: 0, 36: 0,
  5: -1.5, 2: 0, 3: 0, 15: 0.5,
  13: -2, 4: -3, 37: -2.5,
  6: 10, 26: 4, 27: 6, 32: 11, 38: 18,
  7: 7, 33: 8, 39: 9,
  8: 17, 29: 17, 9: 22, 28: 22,
  10: 14, 11: 6, 12: 10, 20: 16,
  17: 3, 18: 13, 19: 8, 21: 3, 22: 8, 23: 10, 35: 6,
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
const NO_BILLBOARD = new Set([T.CHEST, T.PORTAL, T.WATER, T.SHALLOW, T.LAVA, T.DATASTREAM, T.GLITCH]);

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
  zoom: 1.0,       // ซูมกล้อง (0.65 = ใกล้ · 1.0 = ปกติ · 1.4 = มุมกว้าง)
  elev: 0.62,      // มุมก้มเงยกล้อง (เรเดียน)

  setZoom(delta) {
    this.zoom = Math.max(0.65, Math.min(1.4, (this.zoom || 1) + delta));
    return this.zoom;
  },

  /* ═══════════ init ═══════════ */
  init(world) {
    const canvas = document.getElementById('world-3d');
    if (!canvas) { this.reason = 'no-canvas'; return false; }
    if (this._softwareGL()) { this.reason = 'software-gl'; return false; }
    try {
      this.renderer = new THREE.WebGLRenderer({
        canvas, antialias: true, alpha: false,
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

    this.camera = new THREE.PerspectiveCamera(50, 16 / 9, 5, 3000);
    this.camera.position.set(0, 300, 300);
    this.camTarget = new THREE.Vector3();

    this.hemi = new THREE.HemisphereLight(0x99b8ff, 0x1a1410, 0.55);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 1.1);
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
      const L = new THREE.PointLight(0xffb45a, 0, 130, 1.7);
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
    VFX.on3DSpawn = (kind, e) => this.spawn3DFx(kind, e);

    this.build(world);
    this._benchPending = Settings.get('render3d') === 'auto';
    this.ok = true;
    return true;
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
      this.renderer.render(this.scene, this.camera);
      const t0 = performance.now();
      for (let i = 0; i < 12; i++) this.renderer.render(this.scene, this.camera);
      gl.finish();
      const avg = (performance.now() - t0) / 12;
      this.benchMs = Math.round(avg * 10) / 10;
      return avg < 22;
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

    this.mapTex = this._tex(world.groundCanvas);
    const tilesData = new Uint8Array(world.w * world.h);
    for (let i = 0; i < tilesData.length; i++) tilesData[i] = world.tiles[i];
    this.tileTex = new THREE.DataTexture(tilesData, world.w, world.h, THREE.RedFormat);
    this.tileTex.magFilter = THREE.NearestFilter; this.tileTex.minFilter = THREE.NearestFilter;
    this.tileTex.needsUpdate = true;

    const geo = new THREE.PlaneGeometry(W, H, world.w * 2, world.h * 2);
    geo.rotateX(-Math.PI / 2);
    const posA = geo.attributes.position;
    for (let i = 0; i < posA.count; i++) {
      posA.setY(i, this.sampleH(posA.getX(i) + W / 2, posA.getZ(i) + H / 2));
    }
    geo.computeVertexNormals();

    this.terrainMat = new THREE.MeshStandardMaterial({
      map: this.mapTex, roughness: 0.94, metalness: 0,
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
          'vec2 wpos = vMapUv * uMapSize;\n' +
          'vec2 gv = wpos / uGrid;\n' +
          'float id = texture2D(uTiles, floor(gv) / uGrid + 0.5 / uGrid).r * 255.0;\n' +
          'if (abs(id - ' + T.WATER + '.0) < 0.5 || abs(id - ' + T.DATASTREAM + '.0) < 0.5) {\n' +
          '  float k1 = 0.11, k2x = 0.05, k2y = 0.09, k3x = -0.04, k3y = 0.16;\n' +
          '  float p1 = wpos.x * k1 + uTime * 1.6;\n' +
          '  float p2 = wpos.x * k2x + wpos.y * k2y - uTime * 1.1;\n' +
          '  float p3 = wpos.y * k3y + wpos.x * k3x + uTime * 2.3;\n' +
          '  vec2 dh = vec2(k1 * cos(p1) + k2x * cos(p2) + k3x * cos(p3),\n' +
          '                 k2y * cos(p2) + k3y * cos(p3));\n' +
          '  vec3 nrm = normalize(vec3(-dh * 0.9, 1.0));\n' +
          '  vec3 V = normalize(vViewPosition);\n' +
          '  vec3 L = normalize(uSunDir);\n' +
          '  float F = 0.02 + 0.98 * pow(1.0 - max(dot(nrm, V), 0.0), 5.0);\n' +
          '  float spec = pow(max(dot(reflect(-L, nrm), V), 0.0), 64.0) * F;\n' +
          '  diffuseColor.rgb += uSunCol * spec * (0.25 + uSunI * 1.6);\n' +
          '}\n' +
          'if (abs(id - ' + T.LAVA + '.0) < 0.5) {\n' +
          '  float pulse = 0.5 + 0.5 * sin(wpos.x * 0.2 + wpos.y * 0.13 + uTime * 2.4);\n' +
          '  vec3 V = normalize(vViewPosition);\n' +
          '  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.98, 0.36, 0.10), 0.45 + 0.25 * pulse);\n' +
          '  diffuseColor.rgb *= 1.0 + 0.5 * pulse;\n' +
          '  diffuseColor.rgb += vec3(0.9, 0.25, 0.05) * pow(1.0 - max(dot(vec3(0.0, 1.0, 0.0), V), 0.0), 3.0) * 0.6;\n' +
          '}\n' +
          'if (abs(id - ' + T.GLITCH + '.0) < 0.5) {\n' +
          '  float pulse = 0.5 + 0.5 * sin(wpos.x * 0.35 - wpos.y * 0.25 + uTime * 5.0);\n' +
          '  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.35, 0.9, 1.0), 0.35 * pulse);\n' +
          '  diffuseColor.rgb *= 1.0 + 0.45 * pulse;\n' +
          '}');
      this.terrainMat.userData.sh = sh;
    };
    this.terrain = new THREE.Mesh(geo, this.terrainMat);
    this.terrain.receiveShadow = true;
    this.scene.add(this.terrain);

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
        map: this._tex(g.sp.frames[0]), transparent: true, alphaTest: 0.5, side: THREE.FrontSide,
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
        new THREE.PlaneGeometry(g.sp.w, g.sp.h),
        mat,
        g.items.length,
      );
      mesh.frustumCulled = false;
      mesh.castShadow = true;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.scene.add(mesh);
      this.obstacles.push({ g, mesh, mat });
    }

    this.chestMeshes = (world.chests || []).map((c) => {
      const sp = SPR['t_chest'];
      const m = new THREE.Mesh(new THREE.PlaneGeometry(sp.w, sp.h), new THREE.MeshLambertMaterial({
        map: this._tex(sp.frames[0]), transparent: true, alphaTest: 0.5, side: THREE.FrontSide,
      }));
      m.position.set(c.x + 8, this.sampleH(c.x + 8, c.y + 4) + 6, c.y + 4);
      m.userData.chest = c;
      this.scene.add(m);
      return m;
    });
    this.portalMeshes = (world.portals || []).map((pt) => {
      const sp = SPR['t_portal'];
      const m = new THREE.Mesh(new THREE.PlaneGeometry(sp.w, sp.h), new THREE.MeshLambertMaterial({
        map: this._tex(sp.frames[Math.floor(state_time() * 3) % 2]), transparent: true, alphaTest: 0.5, side: THREE.FrontSide,
      }));
      m.position.set(pt.x + 8, this.sampleH(pt.x + 8, pt.y + 6) + 6, pt.y + 6);
      this.scene.add(m);
      return m;
    });

    this.entityPool = {};
    this.frameCache = {};
    this._poolKeys = [];

    this.shadowMesh = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({
        map: this._blobShadowTex(), transparent: true, opacity: 0.5,
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
    for (const o of this.obstacles) { this.scene.remove(o.mesh); o.mesh.geometry.dispose(); o.mesh.material.dispose(); }
    for (const m of this.chestMeshes) { this.scene.remove(m); m.geometry.dispose(); m.material.dispose(); }
    for (const m of this.portalMeshes) { this.scene.remove(m); m.geometry.dispose(); m.material.dispose(); }
    this.scene.remove(this.terrain); this.terrain.geometry.dispose(); this.terrainMat.dispose();
    this.scene.remove(this.points); this.points.geometry.dispose(); this.points.material.dispose();
    if (this.shadowMesh) { this.scene.remove(this.shadowMesh); this.shadowMesh.geometry.dispose(); this.shadowMesh.material.map.dispose(); this.shadowMesh.material.dispose(); this.shadowMesh = null; }
    for (const sid of Object.keys(this.entityPool)) {
      const pool = this.entityPool[sid];
      for (const m of pool.used) this.scene.remove(m);
      for (const m of pool.free) this.scene.remove(m);
    }
    this.obstacles = []; this.chestMeshes = []; this.portalMeshes = []; this.entityPool = {};
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
      const mat = new THREE.MeshLambertMaterial({
        map: this._tex(sp.frames[0]), emissiveMap: this._tex(sp.frames[0]),
        emissive: 0xffffff, emissiveIntensity: 0.25,
        transparent: true, alphaTest: 0.5, side: THREE.FrontSide,
      });
      mesh = new THREE.Mesh(new THREE.PlaneGeometry(sp.w, sp.h), mat);
      mesh.userData.sprId = sprId;
      mesh.userData.frame = -1;
      this.scene.add(mesh);
    }
    pool.used.push(mesh);
    return mesh;
  },

  _frameTex(sprId, frame) {
    const sp = SPR[sprId] || SPR['dummy'];
    if (!sp) return null;
    const key = sprId + ':' + frame;
    if (!this.frameCache[key]) {
      this.frameCache[key] = this._tex(sp.frames[Math.min(frame, sp.frames.length - 1)] || sp.frames[0]);
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
    for (const ent of list) {
      const mesh = this._getEntity(ent.sprId);
      if (!mesh) continue;
      const sp = SPR[ent.sprId] || SPR['dummy'];
      const h = this.heightAt(ent.x, ent.y);
      mesh.position.set(ent.x, h + (ent.headUp || 0) + sp.h * 0.5 - 6, ent.y);
      mesh.quaternion.copy(camQ);
      mesh.scale.x = ent.flip ? -1 : 1;
      if (mesh.userData.frame !== ent.frame) {
        const tex = this._frameTex(ent.sprId, ent.frame);
        mesh.material.map = tex;
        mesh.material.emissiveMap = tex;
        mesh.userData.frame = ent.frame;
      }
      mesh.visible = true;
      if (this.shadowMesh && shN < MAX_SHADOWS) {
        const d = (ent.shadowR || Math.max(9, sp.w * 0.62));
        this._m4.compose(this._v.set(ent.x, h + 0.6, ent.y), this._qi, this._v2.set(d, d, 1));
        this.shadowMesh.setMatrixAt(shN++, this._m4);
      }
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
            this._v.set(it.x, it.h + sp.h * 0.5 - 3, it.z),
            this._q,
            this._one,
          );
          o.mesh.setMatrixAt(n++, this._m4);
        }
        o.mesh.count = n;
        o.mesh.instanceMatrix.needsUpdate = true;
      }
      for (const m of this.chestMeshes) {
        if (!(m.userData.chest && m.userData.chest.opened)) m.quaternion.copy(this.camera.quaternion);
      }
    }
    for (const m of this.chestMeshes) m.visible = !(m.userData.chest && m.userData.chest.opened);
    for (const m of this.portalMeshes) m.quaternion.copy(this.camera.quaternion);
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
    const pz = p.y; // แก้บั๊กเดิมที่ใช้ p.z (undefined -> NaN)

    const dayT = (t % 300) / 300;
    const elev = Math.max(0, Math.sin((dayT - 0.25) * Math.PI * 2));
    const az = (dayT - 0.25) * Math.PI * 2;
    const SX = Math.cos(az) * 420, SZ = Math.sin(az) * 420;
    const SY = Math.max(80, elev * 430);
    this.sun.position.set(p.x + SX, SY, pz + SZ);
    this.sun.target.position.set(p.x, 0, pz);
    const [kr, kg, kb] = world.cyber ? [0.65, 0.88, 1.0] : kelvinToRGB(dark > 0.15 ? 2300 : 6500);
    this.sun.color.setRGB(Math.min(1, kr * 1.05), Math.min(1, kg * 1.05), Math.min(1, kb * 1.05));
    this.sun.intensity = world.cyber ? 0.85 : Math.max(0, 1.15 - dark * 1.35);
    this.sun.castShadow = this.sun.intensity > 0.3;
    this.hemi.intensity = world.cyber ? 0.65 : (0.42 + (1 - dark) * 0.42);
    this.hemi.color.setRGB(0.62 + (1 - dark) * 0.3, 0.72 + (1 - dark) * 0.26, 1);
    this.moon.position.set(p.x - SX * 0.5, 340, pz - SZ * 0.5);
    this.moon.target.position.set(p.x, 0, pz);
    this.moon.intensity = dark * 0.3;

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

    const nightMul = world.cyber ? 0.85 : (0.30 + 0.70 * (1 - dark));
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
    push(p.x, p.y - 4, 34, 0.45, world.cyber ? 0x9fe8ff : 0xffd9a0);
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
    if (!this.ok) return;
    if (this._benchPending) {
      this._benchPending = false;
      if (!this._bench()) { this.ok = false; this.reason = 'slow-gl'; }
    }
    if (!this.ok) return;
    const p = state.player;
    this._t += dt;

    // กล้อง: spring ตามผู้เล่น + รองรับระยะซูม (zoom)
    const fx = p.x + p.dir * 26, fz = p.y + 12;
    const D = 320 * (this.zoom || 1), ELEV = this.elev || 0.62;
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

function state_time() { return performance.now() / 1000; }
