/* ═══════════════════════════════════════════════════════════
   settings.js — การตั้งค่าที่บันทึกถาวร (แยกจากเซฟตัวละคร)
   ═══════════════════════════════════════════════════════════ */

const KEY = 'grian_settings_v1';

export const DEFAULTS = {
  master: 0.7,
  music: 0.42,
  sfx: 0.85,
  muted: false,
  shake: 1,             // 0 = ปิด, 0.5 = เบา, 1 = ปกติ, 1.6 = มาก
  particles: 'high',    // 'low' | 'high'
  damageNumbers: true,
  showNames: true,
  dayNight: true,
  perf: false,          // แสดง HUD วัดประสิทธิภาพ
  hardcore: false,      // ตายแล้วเสีย EXP 1% จริง
  autoSave: true,
  chatFilter: 'all',    // 'all' | 'world' | 'none'
  keyAttack: 'space',   // 'space' | 'click'

  // ── โหมด AUTO ──
  autoSkill: true,      // ใช้สกิลอัตโนมัติ
  autoPotion: true,     // กินยาเมื่อเลือด/มานาน้อย
  autoRange: 260,       // รัศมีการหาเป้า (พิกเซล)
  autoMode: 'balanced', // 'polite' | 'balanced' | 'aggressive'

  // ── ประสิทธิภาพ & มือถือ ──
  autoQuality: true,    // ลดคุณภาพเอฟเฟกต์เองถ้าเฟรมตกต่อเนื่อง
  touchControls: 'auto', // 'auto' (ตรวจอุปกรณ์) | 'on' | 'off'
  render3d: 'auto',      // 'auto' (ตรวจ GL) | 'on' | 'off' — three.js lighting
};

export const Settings = {
  data: { ...DEFAULTS },
  listeners: [],

  load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const d = JSON.parse(raw);
        // รวมแบบระวัง: เอาเฉพาะคีย์ที่รู้จัก เพื่อกันเซฟเก่า/ไฟล์แปลกปลอม
        for (const k of Object.keys(DEFAULTS)) {
          if (k in d) this.data[k] = d[k];
        }
      }
    } catch (e) { /* ใช้ค่าเริ่มต้น */ }
    return this.data;
  },

  save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.data)); return true; }
    catch (e) { return false; }
  },

  set(k, v) {
    if (!(k in DEFAULTS)) return;
    this.data[k] = v;
    this.save();
    for (const fn of this.listeners) fn(k, v, this.data);
  },

  get(k) { return this.data[k]; },

  onChange(fn) { this.listeners.push(fn); },

  reset() {
    this.data = { ...DEFAULTS };
    this.save();
    for (const fn of this.listeners) fn('*', null, this.data);
  },

  /** นำค่าที่โหลดได้ไปใช้กับระบบอื่น */
  apply(Audio) {
    Audio.setVol('master', this.data.master);
    Audio.setVol('music', this.data.music);
    Audio.setVol('sfx', this.data.sfx);
    Audio.setMuted(!!this.data.muted);
  },
};
