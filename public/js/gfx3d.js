/* ═══════════════════════════════════════════════════════════
   gfx3d.js — โลก 3D จริงด้วย three.js (WebGL2)
   ── ตามหลักฟิ สิ + มุมมอง ──
   · heightmap: พื้นยก/ทุ่นiefdาตามชนิดไทล์ (น้ำต่ำ ต้นไม้/บ้านสูง)
   · สิ่งกีดขวาง = instanced billboard หมุนเข้าหากล้อง → มีมิติ/paralłắax
   · เอนทิตี (ผู้เล่น/มอน/NPC/สัตว์เลี้ยง/บอท/ของ) = billboard + frame
   · แสง: ดวงอาทิตย์หมุนเงาตามเวลา + ไฟจุด inverse-square + shadow map
   · น้ำ/ลาว: specular คลื่น/เรืองแสงใน shader · อากาศ: หมอก/ดาว/ดวงอาทิตย์
   · particle ใช้ pool เดิม (drag+กระถก) วาดเป็น points 3D
   ── ยังคงพิกเซลาร์ต: nearest filter
   ═══════════════════════════════════════════════════════════ */

import * as THREE from '../vendor/three.module.min.js';
import { CONFIG } from './data.js';
import { SPR } from './sprites.js';
import { T, SPRITE_OF_TILE } from './world.js';
import { Settings } from './settings.js';

const TS = CONFIG.TILE;
const TILE_H = {
  0: 0, 1: 0, 14: 0, 24: 0, 25: 0, 34: 0,
  5: -1.5, 2: 0, 3: 0, 15: 0.5,
  13: -2, 4: -3,
  6: 10, 26: 4, 27: 6, 32: 11,
  7: 7, 33: 8,
  8: 17, 29: 17, 9: 22, 28: 22,
  10: 14, 11: 6, 12: 10, 20: 16,
  17: 3, 18: 13, 19: 8, 21: 3, 22: 8, 23: 10, 35: 6,
  31: -1.6,
};
const hOf = (t) => (TILE_H[t] !== undefined ? TILE_H[t] * 0.18 : 0);
// ความสูงพื้นถูกสเกลให้เป็นเนินนุ่มมาก — sprite (ต้นไม้/บ้าน) คือตัวแบกมิติ upright
// เดิมใช้ค่าตรง ๆ 6–22 → พื้นยกเป็น Mesa มีขอบsudden รอบต้นไม้ทุกต้น · วงแหวน elevation
// ของแผนที่หมู่บ้านอ่านเป็นลอนชัดเกินไปตอน ~0.35 → 0.18 ให้ depth อยู่แต่ไม่บัง

/* ── อุณภาพสี (Kelvin) → RGB ── */
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

const MAX_LIGHTS = 8;        // loop ต่อ fragment — 8 พอสำหรับ pixel world (แสงไกลตัดด้วย distance อยู่แล้ว)
const MAX_PARTICLES = 320;
const MAX_SHADOWS = 96;      // เงาติดพื้น (instanced — 1 draw call)
const NO_BILLBOARD = new Set([T.CHEST, T.PORTAL, T.WATER, T.SHALLOW, T.LAVA]);

/* ── ของที่ใช้ซ้ำทุกเฟรม (ห้าม new ในลูป — GC ทำให้เฟรมกระตุก) ── */
const _skyNight = new THREE.Color(0x080b18);
const _skyDay = new THREE.Color(0x8fc3ff);
const _skyDusk = new THREE.Color(0xd98a52);
const _skyCol = new THREE.Color();
// ไฟจุด: flat arrays + insertion เรียงตามระยะ (ไม่สร้าง object, ไม่ sort)
const _lsX = new Float64Array(MAX_LIGHTS), _lsY = new Float64Array(MAX_LIGHTS);
const _lsR = new Float64Array(MAX_LIGHTS), _lsP = new Float64Array(MAX_LIGHTS);
const _lsCol = new Uint32Array(MAX_LIGHTS), _lsD = new Float64Array(MAX_LIGHTS);

export const GFX3D = {
  ok: false,
  reason: null,

  /* ═══════════ init ═══════════ */
  init(world) {
    const canvas = document.getElementById('world-3d');
    if (!canvas) { this.reason = 'no-canvas'; return false; }
    if (this._softwareGL()) { this.reason = 'software-gl'; return false; }
    try {
      this.renderer = new THREE.WebGLRenderer({
        canvas, antialias: true, alpha: false,
        // ไม่ต้อง preserveDrawingBuffer — ไม่มีโค้ดอ่านพิกเซลกลับจาก GL (screenshot จับหน้าจอคอมโพสิตเตอร์ได้)
        powerPreference: 'high-performance',
      });
    } catch (e) { this.reason = 'no-webgl'; return false; }
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // เงา: geometry โลกแทบไม่ขยับ — อัปเดตตามนโยบายใน render() (ไม่ทุeare— shadow pass ถึกสุด)
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.shadowMap.needsUpdate = true;
    this.renderer.setClearColor(0x0a0e1a, 1);

    this.scene = new THREE.Scene();
    this.scene.background = _skyCol;   // mutable — syncSky แก้ค่าในที่ แทน new ทุกเฟรม
    this.scene.fog = new THREE.Fog(0x0a0e1a, 420, 1200);

    // กล้อง perspective เอียง 35° — มีมิติ แต่เล่นแนว top-down ได้
    this.camera = new THREE.PerspectiveCamera(50, 16 / 9, 5, 3000);
    this.camera.position.set(0, 300, 300);
    this.camTarget = new THREE.Vector3();

    // ── แสง ──
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

    for (let i = 0; i < MAX_LIGHTS; i++) {
      const L = new THREE.PointLight(0xffb45a, 0, 130, 1.7);
      L.visible = false;
      this.scene.add(L);
      this.lightPool = this.lightPool || [];
      this.lightPool.push(L);
    }

    // ดวงอาทิตย์/ดวงจันทร์ + ดาว
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

    this.build(world);
    // lazy: วัดความเร็ว지șิการโลกแรก (camera/เอนทิตีพร้อม) — boot bench ยังจับไม่สุด
    this._benchPending = Settings.get('render3d') === 'auto';
    this.ok = true;
    return true;
  },

  /** วาด 12 เฟรมวัดเวลา — คืน true ถ้าเร็วพอ (กันเครื่องอ่อน/software renderer) */
  _bench() {
    try {
      const gl = this.renderer.getContext();
      this.renderer.render(this.scene, this.camera);          // warm up (compile shader)
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
    // พิกเซลlาร์ต: ใกล้ = nearest (คม) · ไกล = mipmap (กัน moiré)
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
    // เบลอบาง 3×3 — เอาลูกบาร์ขั้นบันไดจากการตั้งความสูงต่อไทล์ออก ทำเนินนุ่ม
    // (ต้นไม้/บ้านยังเป็นก้อนสูง แต่ฐานไม่ได้เป็นเสาเหล็กแล้ว)
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

    // ── 1) พื้นโลก displaced ──
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
      map: this.mapTex, roughness: 0.96, metalness: 0,
    });
    this.terrainMat.userData.sh = null;
    this.terrainMat.onBeforeCompile = (sh) => {
      sh.uniforms.uTiles = { value: this.tileTex };
      sh.uniforms.uGrid = { value: new THREE.Vector2(world.w, world.h) };
      sh.uniforms.uMapSize = { value: new THREE.Vector2(W, H) };
      sh.uniforms.uTime = { value: 0 };
      sh.uniforms.uSunCol = { value: new THREE.Vector3(1, 1, 1) };
      sh.uniforms.uSunI = { value: 1 };
      sh.uniforms.uSunDir = { value: new THREE.Vector3(0.4, 0.8, 0.4) };   // ทิศแดดจริง (syncSky ใส่ทุกเฟรม)
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\n' +
          'uniform sampler2D uTiles; uniform vec2 uGrid; uniform vec2 uMapSize;\n' +
          'uniform float uTime; uniform vec3 uSunCol; uniform float uSunI; uniform vec3 uSunDir;')
        .replace('#include <map_fragment>', '#include <map_fragment>\n' +
          'vec2 wpos = vMapUv * uMapSize;\n' +
          'vec2 gv = wpos / uGrid;\n' +
          'float id = texture2D(uTiles, floor(gv) / uGrid + 0.5 / uGrid).r * 255.0;\n' +
          // ── น้ำ: height field Σคลื่น + normal เชิงเครื่องหมาย (อนุพันธ์จริง) + Fresnel ──
          'if (abs(id - ' + T.WATER + '.0) < 0.5) {\n' +
          '  float k1 = 0.11, k2x = 0.05, k2y = 0.09, k3x = -0.04, k3y = 0.16;\n' +
          '  float p1 = wpos.x * k1 + uTime * 1.6;\n' +
          '  float p2 = wpos.x * k2x + wpos.y * k2y - uTime * 1.1;\n' +
          '  float p3 = wpos.y * k3y + wpos.x * k3x + uTime * 2.3;\n' +
          '  vec2 dh = vec2(k1 * cos(p1) + k2x * cos(p2) + k3x * cos(p3),\n' +
          '                 k2y * cos(p2) + k3y * cos(p3));\n' +      // ∂h/∂x, ∂h/∂y
          '  vec3 nrm = normalize(vec3(-dh * 0.9, 1.0));\n' +
          '  vec3 V = normalize(vViewPosition);\n' +
          '  vec3 L = normalize(uSunDir);\n' +
          '  float F = 0.02 + 0.98 * pow(1.0 - max(dot(nrm, V), 0.0), 5.0);\n' +  // Schlick (F0 น้ำ=0.02)
          '  float spec = pow(max(dot(reflect(-L, nrm), V), 0.0), 64.0) * F;\n' +
          '  diffuseColor.rgb += uSunCol * spec * (0.2 + uSunI * 1.6);\n' +
          '}\n' +
          // ── ลาว: pulse ความร้อน + fresnel เรืองแสงขอบ ──
          'if (abs(id - ' + T.LAVA + '.0) < 0.5) {\n' +
          '  float pulse = 0.5 + 0.5 * sin(wpos.x * 0.2 + wpos.y * 0.13 + uTime * 2.4);\n' +
          '  vec3 V = normalize(vViewPosition);\n' +
          '  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.98, 0.36, 0.10), 0.45 + 0.25 * pulse);\n' +
          '  diffuseColor.rgb *= 1.0 + 0.5 * pulse;\n' +
          '  diffuseColor.rgb += vec3(0.9, 0.25, 0.05) * pow(1.0 - max(dot(vec3(0.0, 1.0, 0.0), V), 0.0), 3.0) * 0.6;\n' +
          '}');
      this.terrainMat.userData.sh = sh;
    };
    this.terrain = new THREE.Mesh(geo, this.terrainMat);
    this.terrain.receiveShadow = true;
    this.scene.add(this.terrain);

    // ── 2) สิ่งกีดขวาง = instanced billboard (CPU matrix ต่อเฟรม) ──
    this.obstacles = [];
    const groups = new Map();
    for (let y = 0; y < world.h; y++) for (let x = 0; x < world.w; x++) {
      const t = world.get(x, y);
      if (NO_BILLBOARD.has(t)) continue;
      const sid = SPRITE_OF_TILE[t];
      if (!sid || !SPR[sid]) continue;
      const g = groups.get(sid) || { sid, sp: SPR[sid], items: [] };
      // เบสต้น = ความสูงพื้นที่เรียบ (ground เบลอบางแล้ว — ไม่ใช้ hOf ตรง ๆ)
      g.items.push({ x: x * TS + TS / 2, z: y * TS + TS / 2, h: this.sampleH(x * TS + TS / 2, y * TS + TS / 2) });
      groups.set(sid, g);
    }
    for (const g of groups.values()) {
      // Basic + uniform คูณค่ากลางคืน (1 multiply/fragment): ต้นไม้มืดตามโลก
      // โดยไม่ต้องรัน light loop 8 ตัว/fragment แบบ Lambert (ต้นไม้เป็นผิวมากสุด)
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

    // ── 3) หีบ + Portal (มีสถานะ/อนิโมชั่น) ──
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

    // ── 4) เอนทิตี pool ──
    this.entityPool = {};
    this.frameCache = {};
    this._poolKeys = [];      // คีย์ pool — เติมเมื่อมี sprite ใหม่ (กัน Object.keys ทุกเฟรม)

    // ── 4b) เงาติดพื้น (blob shadow) — horizontal quad gradient · instanced 1 draw call ──
    // ติดพื้นทำให้ตัวละครไม่ลอยค้าง (shadow map จริงมีแค่สำหรับ obstacle)
    this.shadowMesh = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({
        map: this._blobShadowTex(), transparent: true, opacity: 0.5,
        depthWrite: false, color: 0x000000,
      }),
      MAX_SHADOWS,
    );
    this.shadowMesh.frustumCulled = false;
    this.shadowMesh.renderOrder = -1;        // วาดก่อน sprite — เท้าสไปทับเงา
    this.shadowMesh.count = 0;
    this.scene.add(this.shadowMesh);

    // ── 5) particle ──
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
    this.pickPlane.constant = -this._pickY;
    return this.ray.ray.intersectPlane(this.pickPlane, hit) ? { x: hit.x, y: hit.z } : null;
  },

  /** world → CSS px (สำหรับ DOM overlay และ 2D effects) */
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

  /** ความสูงพื้นแบบ bilinear (ไม่มีขั้นบันได — ใช้กับตัวละคร/billboard ทั้งหมด) */
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
    const sp = SPR[sprId];
    if (!sp) return null;
    let pool = this.entityPool[sprId];
    if (!pool) {
      pool = this.entityPool[sprId] = { sp, used: [], free: [] };
      this._poolKeys.push(sprId);          // sprite ใหม่ — เพิ่มคีย์ครั้งเดียว
    }
    let mesh = pool.free.pop();
    if (!mesh) {
      // Lambert + emissiveMap เบา (0.25): ตอบสนองแสงจริง กลางคืนมืดตามโลก
      // แต่ไม่มืดจนอ่านไม่ออก (sprite พิกเซลต้องเห็นชัดเสมอ)
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
    const sp = SPR[sprId];
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
    const cx = this.camera.position.x, cy = this.camera.position.y, cz = this.camera.position.z;
    let shN = 0;
    for (const ent of list) {
      const mesh = this._getEntity(ent.sprId);
      if (!mesh) continue;
      const sp = SPR[ent.sprId];
      const h = this.heightAt(ent.x, ent.y);
      mesh.position.set(ent.x, h + ent.headUp + sp.h * 0.5 - 6, ent.y);
      mesh.quaternion.copy(camQ);
      mesh.scale.x = ent.flip ? -1 : 1;
      if (mesh.userData.frame !== ent.frame) {
        // สลับ texture เท่ากับ frame ใหม่ (uniform อ่านทุกเฟรม — ไม่ต้อง needsUpdate)
        const tex = this._frameTex(ent.sprId, ent.frame);
        mesh.material.map = tex;
        mesh.material.emissiveMap = tex;
        mesh.userData.frame = ent.frame;
      }
      mesh.visible = true;
      // เงาติดพื้น: กว้าง ~62% ของ sprite · บอส/ใหญ่ ×1.5 · ติดพื้น +0.6 (กัน z-fight)
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

  /** อัปเดต obstacle instances (billboard เข้ากล้อง เฉพาะที่ในจอ) */
  _syncObstacles(state) {
    const cx = this.camera.position.x, cy = this.camera.position.y, cz = this.camera.position.z;
    // บิลบอร์ดกระทบทุกมุม — ถ้ากล้องกับจุดโฟกัสไม่ขยับก็ไม่ต้องคิดใหม่
    if (cx !== this._obCX || cz !== this._obCZ || this._focusX !== this._obFX || this._focusZ !== this._obFZ) {
      this._obCX = cx; this._obCZ = cz; this._obFX = this._focusX; this._obFZ = this._focusZ;
      for (const o of this.obstacles) {
        const items = o.g.items, sp = o.g.sp;
        let n = 0;
        for (let i = 0; i < items.length && n < items.length; i++) {
          const it = items[i];
          // cull ขอบจอ (ประมาณตามระยะจากจุดโฟกัส)
          if (Math.abs(it.x - this._focusX) > 620 || Math.abs(it.z - this._focusZ) > 480) continue;
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
    // หีบเปิดแล้ว → ซ่อน (ตรวจทุกเฟรม — loop สั้น แม่นกว่าแทนค่าค้าง)
    for (const m of this.chestMeshes) m.visible = !(m.userData.chest && m.userData.chest.opened);
    for (const m of this.portalMeshes) m.quaternion.copy(this.camera.quaternion);
  },

  _upAxis: new THREE.Vector3(0, 1, 0),
  _one: new THREE.Vector3(1, 1, 1),
  _qi: new THREE.Quaternion(),      // identity — เงาติดพื้น (geometry หมุนแนวนอนไว้แล้ว)
  _v2: new THREE.Vector3(1, 1, 1),

  /** เงา/แสง/ฟากฟ้า + ไฟจุด ตามเฟสวัน */
  syncSky(state, dt) {
    if (!this.ok) return;
    const dark = state._dnDark || 0;
    const t = state.time;
    const p = state.player;

    // sun: elevation/azimuth จากเวลา
    const dayT = (t % 300) / 300;
    const elev = Math.max(0, Math.sin((dayT - 0.25) * Math.PI * 2));
    const az = (dayT - 0.25) * Math.PI * 2;
    const SX = Math.cos(az) * 420, SZ = Math.sin(az) * 420;
    const SY = Math.max(80, elev * 430);
    this.sun.position.set(p.x + SX, SY, p.z + SZ);
    this.sun.target.position.set(p.x, 0, p.z);
    const [kr, kg, kb] = kelvinToRGB(dark > 0.15 ? 2300 : 6500);
    this.sun.color.setRGB(Math.min(1, kr * 1.05), Math.min(1, kg * 1.05), Math.min(1, kb * 1.05));
    this.sun.intensity = Math.max(0, 1.15 - dark * 1.35);
    this.sun.castShadow = this.sun.intensity > 0.3;
    this.hemi.intensity = 0.42 + (1 - dark) * 0.42;
    this.hemi.color.setRGB(0.62 + (1 - dark) * 0.3, 0.72 + (1 - dark) * 0.26, 1);
    this.moon.position.set(p.x - SX * 0.5, 340, p.z - SZ * 0.5);
    this.moon.target.position.set(p.x, 0, p.z);
    this.moon.intensity = dark * 0.3;

    // ฟากฟ้า/หมอก/ดาว
    const dusk = Math.max(0, 1 - Math.abs(dark - 0.55) * 4);
    _skyCol.copy(_skyNight).lerp(_skyDay, 1 - dark).lerp(_skyDusk, dusk * 0.5);
    this.scene.fog.color.copy(_skyCol);
    this.stars.material.opacity = Math.max(0, dark - 0.22) * 1.5;

    this.sunDisc.position.set(p.x + SX * 2.2, SY * 1.9 + 120, p.z + SZ * 2.2);
    this.sunDisc.material.opacity = Math.max(0, 1 - dark * 1.5);
    this.sunDisc.quaternion.copy(this.camera.quaternion);
    this.moonDisc.position.set(p.x - SX * 2.2, 330, p.z - SZ * 2.2);
    this.moonDisc.material.opacity = Math.max(0, dark - 0.3);
    this.moonDisc.quaternion.copy(this.camera.quaternion);

    // uniform น้ำ/ลาว
    const sh = this.terrainMat.userData.sh;
    if (sh) {
      sh.uniforms.uTime.value = this._t;
      sh.uniforms.uSunCol.value.set(kr, kg, kb);
      sh.uniforms.uSunI.value = Math.max(0, 1 - dark * 1.4);
      // ทิศแดดจริง — จากตำแหน่งดวงอาทิตย์ไปยังเป้าหมาย (ยังไม่ normalize จนถึงใน shader)
      sh.uniforms.uSunDir.value
        .copy(this.sun.position)
        .sub(this.sun.target.position);
    }

    // ต้นไม้/สิ่งกีดขวาง (Basic): คูณความมืดกลางคืนให้เข้ากับโลก (1 multiply/fragment)
    // กลางวัน 1.0 · กลางคืน ~0.30 — sprite ไม่ตัดสีกับพื้นอีก
    const nightMul = 0.30 + 0.70 * (1 - dark);
    for (const o of this.obstacles) {
      const osh = o.mat.userData.sh;
      if (osh) osh.uniforms.uNight.value = nightMul;
    }

    // ไฟจุด — three r160 = physically-correct: intensity เป็น candy (cd)
    // E = I/d² → อยากได้สว่าง power ที่ระยะ r ต้องใช้ I = power·r² (r คือรัศมีอ้างอิง)
    // เดิมใช้ 0.45–1.0 แปลว่ามืดจนเกือบมองไม่เห็น — นี่คือค่าที่แก้เป็นฟิสิกส์จริง
    let ln = 0;
    const push = (x, y, r, power, col) => {
      const d = (x - p.x) ** 2 + (y - p.y) ** 2;
      if (d > 620 * 620) return;
      if (ln === MAX_LIGHTS && d >= _lsD[MAX_LIGHTS - 1]) return;   // ไกลกว่าเท่าที่มี — ทิ้ง
      let i = Math.min(ln, MAX_LIGHTS - 1);
      while (i > 0 && _lsD[i - 1] > d) {
        _lsX[i] = _lsX[i - 1]; _lsY[i] = _lsY[i - 1]; _lsR[i] = _lsR[i - 1];
        _lsP[i] = _lsP[i - 1]; _lsCol[i] = _lsCol[i - 1]; _lsD[i] = _lsD[i - 1]; i--;
      }
      if (ln < MAX_LIGHTS) ln++;
      _lsX[i] = x; _lsY[i] = y; _lsR[i] = r; _lsP[i] = power; _lsCol[i] = col; _lsD[i] = d;
    };
    const world = state.world;
    for (let i = 0; i < world.lightSpots.length; i += 3) {
      const strong = world.lightSpots[i + 2] === 1;
      push(world.lightSpots[i], world.lightSpots[i + 1], strong ? 46 : 26, strong ? 1 : 0.55, 0xffb45a);
    }
    if (world.hell) {
      for (let yy = 2; yy < world.h; yy += 8) for (let xx = 2; xx < world.w; xx += 8) {
        if (world.get(xx, yy) === T.LAVA) push(xx * 16 + 8, yy * 16 + 8, 60, 0.85, 0xff6a22);
      }
    }
    push(p.x, p.y - 4, 34, 0.45, 0xffd9a0);
    for (let i = 0; i < ln; i++) {
      const L = this.lightPool[i];
      L.visible = true;
      L.position.set(_lsX[i], this.heightAt(_lsX[i], _lsY[i]) + 16, _lsY[i]);
      L.distance = _lsR[i] * 2.4;
      // candela: ilight luminance ที่ระยะอ้างอิง r เหมือนกับ power (ตาม falloff 1/d²)
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

    // กล้อง: spring ตามผู้เล่น + มองลัวprintstream
    const fx = p.x + p.dir * 26, fz = p.y + 12;
    const D = 320, ELEV = 0.62;
    this.camera.position.lerp(this._v.set(fx, D * Math.sin(ELEV), fz + D * Math.cos(ELEV)), Math.min(1, dt * 7));
    this.camTarget.lerp(this._v.set(fx, 0, fz), Math.min(1, dt * 7));
    this.camera.lookAt(this.camTarget);
    this._pickY = this.heightAt(p.x, p.y);
    this._focusX = fx; this._focusZ = fz;

    this.syncSky(state, dt);
    this.syncEntities(list || []);
    this._syncObstacles(state);

    // flash
    this.flash = Math.max(0, (this.flash || 0) - dt * 2.4);

    // particle
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

    // ── เงา: geometry แทบไม่ขยับ (โลก/บิลบอร์ดคงที่) — อัปเดตเฉพาะผู้เล่นขยับ
    // หรือแดดหมุนนาฬิกา毁 (~0.35s) แทนที่จะทุกเฟรม (autoUpdate=false ตั้งไว้ init)
    const shDx = p.x - (this._shX ?? -1e9), shDy = p.y - (this._shY ?? -1e9);
    if (shDx * shDx + shDy * shDy > 100 || Math.abs(state.time - (this._shT ?? -99)) > 0.35) {
      this.renderer.shadowMap.needsUpdate = true;
      this._shX = p.x; this._shY = p.y; this._shT = state.time;
    }

    this.renderer.render(this.scene, this.camera);
  },
};

// ตัวช่วยสำหรับ portal frame ตอน build (ยังไม่มี state)
function state_time() { return performance.now() / 1000; }
