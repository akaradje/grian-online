/* ═══════════════════════════════════════════════════════════
   ui.js — ชั้น UI ทั้งหมด (DOM) เพื่อให้ตัวอักษรไทยคมชัด
   โลกเป็นพิกเซลในแคนวาส แต่ข้อความทุกตัวอยู่บน DOM
   ป้ายชื่อ/ตัวเลขดาเมจ ใช้ transform + dirty-check (ไม่แตะ layout ทุกเฟรม)
   ═══════════════════════════════════════════════════════════ */

import {
  CLASSES, SKILLS, ITEMS, QUESTS, GACHA, NPCS, ADVANCED,
  RANDOM_NAME_A, RANDOM_NAME_B, RANDOM_NAME_C, UPGRADE, GUILD_BUFFS,
} from './data.js';
import { SPR } from './sprites.js';
import {
  addItem, removeItem, countItem, recalcPlayer, effAtk, effSpd, dropBonus,
  playerSkills, playerAura, pvpRank, partyBots,
} from './entities.js';
import {
  acceptQuest, completeQuest, questById, questProgress, doGacha, saveGame,
  wipeSave, listSlots, SAVE_SLOTS, exportSave, importSave, applySave,
} from './systems.js';
import { ACHIEVEMENTS, achievementProgress, achievementSummary } from './achievements.js';
import { DEFAULTS } from './settings.js';
import { activePet, setActivePet, releasePet, renamePet, usePetPotion, petXpFor, PET_MAX } from './pets.js';
import { Auto } from './auto.js';
import { AutoQ } from './autoquest.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

const SETTINGS_SCHEMA = [
  { k: 'master', label: 'เสียงรวม', type: 'range', min: 0, max: 1, step: 0.05, fmt: (v) => Math.round(v * 100) + '%' },
  { k: 'music', label: 'เสียงเพลง', type: 'range', min: 0, max: 1, step: 0.05, fmt: (v) => Math.round(v * 100) + '%' },
  { k: 'sfx', label: 'เสียงเอฟเฟกต์', type: 'range', min: 0, max: 1, step: 0.05, fmt: (v) => Math.round(v * 100) + '%' },
  { k: 'muted', label: 'ปิดเสียงทั้งหมด', type: 'bool' },
  { k: 'shake', label: 'การสั่นของกล้อง', type: 'select', options: [[0, 'ปิด'], [0.5, 'เบา'], [1, 'ปกติ'], [1.6, 'มาก']] },
  { k: 'particles', label: 'คุณภาพเอฟเฟกต์', type: 'select', options: [['low', 'ต่ำ (ประหยัด)'], ['high', 'สูง']] },
  { k: 'damageNumbers', label: 'แสดงตัวเลขดาเมจ', type: 'bool' },
  { k: 'showNames', label: 'แสดงป้ายชื่อ', type: 'bool' },
  { k: 'dayNight', label: 'วัฏจักรกลางวัน-กลางคืน', type: 'bool' },
  { k: 'perf', label: 'แสดงตัววัดประสิทธิภาพ (F3)', type: 'bool' },
  { k: 'autoSave', label: 'เซฟอัตโนมัติทุก 25 วินาที', type: 'bool' },
  { k: 'hardcore', label: 'โหมดโหด (ตายแล้วเสีย EXP 5% + ค่าชุบ)', type: 'bool' },
  { k: 'keyAttack', label: 'ปุ่มโจมตี', type: 'select', options: [['space', 'Space'], ['click', 'คลิกซ้ายเท่านั้น']] },

  // ── โหมด AUTO ──
  { k: 'autoMode', label: 'AUTO: ความดุดัน', type: 'select', options: [['polite', 'สุภาพ (ไม่หาเรื่อง)'], ['balanced', 'สมดุล'], ['aggressive', 'ดุดัน (ไม่ถอย)']] },
  { k: 'autoRange', label: 'AUTO: ระยะหาเป้า', type: 'range', min: 120, max: 480, step: 20, fmt: (v) => v + ' px' },
  { k: 'autoSkill', label: 'AUTO: ใช้สกิลให้เอง', type: 'bool' },
  { k: 'autoPotion', label: 'AUTO: กินยาให้เองเมื่อเลือด/มานาน้อย', type: 'bool' },
  { k: 'chatFilter', label: 'กรองแชท', type: 'select', options: [['all', 'ทั้งหมด'], ['world', 'โลก + ระบบ'], ['none', 'ระบบอย่างเดียว']] },
  { k: 'autoQuality', label: 'ปรับคุณภาพเองถ้าเฟรมตก', type: 'bool' },
  { k: 'touchControls', label: 'ปุ่มบังคับแบบแตะ', type: 'select', options: [['auto', 'อัตโนมัติ (ตรวจอุปกรณ์)'], ['on', 'เปิดเสมอ'], ['off', 'ปิด']] },
  { k: 'render3d', label: 'กราฟิก 3D (แสง/น้ำ/อากาศ)', type: 'select', options: [['auto', 'อัตโนมัติ (ตรวจการ์ดจอ)'], ['on', 'เปิด'], ['off', 'ปิด (2D)']] },
];

export const UI = {
  el: {},
  h: {},
  deps: {},
  state: null,
  tagMap: new Map(),
  floatMap: new Map(),
  lastChatId: 0,
  activeCh: 'world',
  questTick: 0,
  perfTick: 0,
  openPanelName: null,
  selectedInv: null,
  dialogNpc: null,
  dialogLine: 0,
  fatalShown: false,

  /* ───────────── init ───────────── */
  init(state, handlers, deps = {}) {
    this.state = state;
    this.h = handlers;
    this.deps = deps;
    const el = this.el;
    ['scr-title', 'scr-create', 'scr-play', 'boot', 'boot-msg', 'boot-fill', 'boot-pct', 'title-menu',
      'title-online', 'btn-enter', 'btn-wipe', 'slot-list', 'in-name', 'name-hint', 'class-grid',
      'prev-canvas', 'prev-stats', 'btn-random-name', 'btn-back-title', 'btn-start',
      'world', 'nametags', 'floaters', 'pc-face', 'pc-lv', 'pc-name', 'pc-class', 'bar-hp', 'txt-hp',
      'bar-mp', 'txt-mp', 'bar-xp', 'txt-xp', 'pc-gold', 'pc-gem', 'pc-ticket', 'minimap', 'srv-online',
      'srv-ping', 'srv-time', 'boss-timer', 'quest-list', 'chat-log', 'chat-form', 'chat-input',
      'hotbar', 'toasts', 'loot-feed', 'levelup', 'boss-alert', 'dialog', 'dlg-canvas', 'dlg-name',
      'dlg-text', 'dlg-actions', 'death', 'death-by', 'death-quote', 'btn-respawn', 'inv-grid',
      'inv-detail', 'inv-cap', 'skill-list', 'gacha-banner', 'gacha-rates', 'gacha-actions',
      'gacha-result', 'quest-full', 'stats-body', 'perfhud', 'pause', 'btn-resume', 'btn-quit',
      'ach-list', 'ach-summary', 'settings-list', 'btn-reset-settings', 'fatal', 'fatal-msg',
      'btn-fatal-retry', 'btn-import', 'btn-export', 'save-code', 'tooltip',
      'pet-hud', 'pet-face', 'ph-name', 'ph-lv', 'bar-php', 'txt-php',
      'target-box', 'tb-name', 'bar-thp', 'txt-thp',
      'pet-list', 'pet-cap', 'social-body', 'btn-auto', 'auto-status', 'skill-banner', 'zone-banner',
      'btn-autoquest', 'autoquest-status',
      'advance', 'adv-grid', 'adv-title'].forEach((id) => {
        el[id] = document.getElementById(id);
      });

    this.buildClassGrid();
    this.buildSettings();
    this.bindStatic();
    this.bindTitleSlots();
  },

  /* ───────────── ผูกเหตุการณ์ ───────────── */
  bindStatic() {
    const h = this.h;
    const d = this.deps;

    document.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button, .sbtn, .slot, .inv-slot, .ctab, .class-card')) d.Audio?.play('click');
    }, true);

    el_on(this.el['btn-enter'], 'click', () => h.onEnter());
    el_on(this.el['btn-wipe'], 'click', () => {
      if (!confirm('ลบเซฟทั้ง 3 ช่องและความสำเร็จทั้งหมด? ย้อนกลับไม่ได้')) return;
      wipeSave();
      this.refreshTitleMenu();
      this.toast('ลบเซฟทั้งหมดแล้ว', 'bad');
    });
    el_on(this.el['btn-back-title'], 'click', () => this.showScreen('title'));
    el_on(this.el['btn-start'], 'click', () => h.onStart());
    el_on(this.el['btn-random-name'], 'click', () => {
      const n = pick(RANDOM_NAME_A) + pick(RANDOM_NAME_B) + pick(RANDOM_NAME_C);
      this.el['in-name'].value = n.slice(0, 16);
      this.validateName();
    });
    this.el['in-name'].oninput = () => this.validateName();

    this.el['chat-form'].onsubmit = (e) => {
      e.preventDefault();
      const v = this.el['chat-input'].value.trim();
      if (!v) return;
      this.el['chat-input'].value = '';
      h.onChatSend(v);
    };
    this.el['chat-input'].onfocus = () => { this.state.inputLocked = true; };
    this.el['chat-input'].onblur = () => { this.state.inputLocked = false; };

    $$('.ctab').forEach((b) => {
      b.onclick = () => {
        $$('.ctab').forEach((x) => x.classList.remove('active'));
        b.classList.add('active');
        this.activeCh = b.dataset.ch;
        this.rebuildChat();
      };
    });

    $$('[data-panel]').forEach((b) => {
      b.onclick = () => this.togglePanel(b.dataset.panel);
    });
    el_on(document.getElementById('btn-save'), 'click', () => this.h.onSave(0));
    el_on(this.el['btn-auto'], 'click', () => this.h.onToggleAuto());
    el_on(this.el['btn-autoquest'], 'click', () => this.h.onToggleAutoQuest());
    $$('[data-close]').forEach((b) => { b.onclick = () => this.closePanels(); });

    el_on(this.el['btn-respawn'], 'click', () => h.onRespawn());
    el_on(this.el['btn-resume'], 'click', () => d.onPauseToggle());
    el_on(this.el['btn-quit'], 'click', () => d.onQuit());
    el_on(this.el['btn-reset-settings'], 'click', () => {
      this.deps.Settings.reset();
      this.deps.Settings.apply(this.deps.Audio);
      this.buildSettings();
      this.toast('คืนค่าเริ่มต้นการตั้งค่าแล้ว', 'good');
    });
    el_on(this.el['btn-fatal-retry'], 'click', () => {
      this.hideFatal();
      this._fatalRetry?.();
    });
    el_on(this.el['btn-export'], 'click', () => {
      const code = exportSave(this.state);
      if (!code) { this.toast('ส่งออกไม่สำเร็จ', 'bad'); return; }
      this.el['save-code'].value = code;
      this.el['save-code'].select();
      try { document.execCommand('copy'); this.toast('คัดลอกโค้ดเซฟแล้ว', 'good'); }
      catch (e) { this.toast('คัดลอกไม่สำเร็จ — เลือกข้อความแล้วคัดลอกเอง', 'bad'); }
    });
    el_on(this.el['btn-import'], 'click', () => {
      const code = this.el['save-code'].value.trim();
      if (!code) { this.toast('วางโค้ดเซฟก่อน', 'bad'); return; }
      const r = importSave(code);
      if (!r.ok) { this.toast(r.msg, 'bad'); return; }
      this.toast('นำเข้าเซฟสำเร็จ — กด "เล่นต่อ" เพื่อเริ่ม', 'good');
      this.refreshTitleMenu();
    });

    this.el['hotbar'].addEventListener('mouseover', (e) => {
      const s = e.target.closest('.slot');
      if (s) this.showTooltip(s);
    });
    this.el['hotbar'].addEventListener('mouseout', () => this.hideTooltip());
  },

  bindTitleSlots() {
    const box = this.el['slot-list'];
    if (!box) return;
    box.addEventListener('click', (e) => {
      const row = e.target.closest('.slot-row');
      if (!row) return;
      const slot = Number(row.dataset.slot);
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'wipe') {
        if (!confirm(`ลบเซฟช่อง ${slot + 1}?`)) return;
        wipeSave(slot);
        this.refreshTitleMenu();
        return;
      }
      this.h.onContinue(slot);
    });
  },

  refreshTitleMenu() {
    const box = this.el['slot-list'];
    if (!box) return;
    const slots = listSlots();
    const clsName = (id) => CLASSES.find((c) => c.id === id)?.name || '?';
    const icon = (id) => CLASSES.find((c) => c.id === id)?.icon || '❔';
    box.innerHTML = slots.map((s) => {
      if (!s.exists) {
        return `<div class="slot-row empty" data-slot="${s.slot}">
          <div class="sr-idx">ช่อง ${s.slot + 1}</div>
          <div class="sr-main"><div class="sr-name muted">— ว่าง —</div>
          <div class="sr-sub">ยังไม่มีตัวละครในช่องนี้</div></div>
          <div class="sr-act"><button class="btn btn-mini">สร้างใหม่</button></div>
        </div>`;
      }
      const when = s.savedAt ? new Date(s.savedAt).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' }) : '';
      const mins = Math.floor(s.playtime / 60);
      return `<div class="slot-row" data-slot="${s.slot}">
        <div class="sr-idx">ช่อง ${s.slot + 1}</div>
        <div class="sr-main">
          <div class="sr-name">${icon(s.clsId)} ${esc(s.name)} <span class="sr-lv">Lv.${s.lvl}</span></div>
          <div class="sr-sub">${clsName(s.clsId)} · สังหาร ${s.kills} · เล่น ${mins} นาที · ${when}</div>
        </div>
        <div class="sr-act">
          <button class="btn btn-mini btn-primary">เล่นต่อ</button>
          <button class="btn btn-mini btn-ghost" data-act="wipe" title="ลบเซฟช่องนี้">ลบ</button>
        </div>
      </div>`;
    }).join('');
  },

  buildTitleMenu() { this.refreshTitleMenu(); },

  drawPortrait() {
    const p = this.state.player;
    const cv = this.el['pc-face'];
    if (!cv || !p) return;
    const g = cv.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.fillStyle = '#0a0d18'; g.fillRect(0, 0, cv.width, cv.height);
    const sp = SPR['hero_' + p.clsId];
    if (sp) g.drawImage(sp.frames[0], 0, 0, 16, 16, 0, 0, cv.width, cv.height);
  },

  /* ── เลือกอาชีพขั้นสูง (Lv.10) ── */
  showAdvance() {
    const p = this.state.player;
    const box = this.el['adv-grid'];
    if (!p || !p.clsId || p.advId) return;
    const opts = Object.values(ADVANCED).filter((a) => a.from === p.clsId);
    if (opts.length < 2) return;
    this.el['adv-title'].textContent = `${p.cls.icon} ${p.cls.name} — เลือกเส้นทางต่อ`;
    box.innerHTML = opts.map((a) => {
      const sk = SKILLS[a.skill];
      return `<button class="adv-card" data-adv="${a.id}">
        <h4>${a.icon} ${esc(a.name)}</h4>
        <div class="ac-desc">${esc(a.desc)}</div>
        <div class="ac-skill">สกิลใหม่: ${sk.icon} ${esc(sk.name)} (MP ${sk.mp})</div>
        <div class="ac-quote">"${esc(a.quote)}"</div>
      </button>`;
    }).join('');
    box.querySelectorAll('[data-adv]').forEach((b) => {
      b.onclick = () => this.h.onAdvance(b.dataset.adv);
    });
    this.el.advance.classList.remove('hidden');
    this.state.inputLocked = true;
  },

  hideAdvance() {
    this.el.advance?.classList.add('hidden');
    if (this.state) this.state.inputLocked = false;
  },

  /* ───────────── จอ ───────────── */
  showScreen(name) {
    $$('.screen').forEach((s) => s.classList.remove('active'));
    document.getElementById('scr-' + name)?.classList.add('active');
  },

  bootSequence(onDone) {
    const steps = [
      [0, 'กำลังเชื่อมต่อเซิร์ฟเวอร์ ระนาวรก-1...'],
      [11, 'ตรวจสอบเวอร์ชันไคลเอนต์... ไม่ตรง แต่ช่างมัน'],
      [23, 'กำลังโหลดข้อมูลตัวละคร...'],
      [41, 'รอผู้เล่นอื่นตอบสนอง 1/3...'],
      [58, 'เซิร์ฟเวอร์ไม่ตอบสนอง กำลังลองใหม่...'],
      [72, 'กำลังโหลดทรัพยากร 1247 ไฟล์...'],
      [88, 'โหลดเสร็จ 1246/1247 ไฟล์'],
      [99, 'ไฟล์สุดท้ายใช้เวลานานกว่าที่คิด...'],
      [100, 'เชื่อมต่อสำเร็จ! (ครั้งที่ 4)'],
    ];
    let i = 0;
    let ticker = null;
    const tick = () => {
      if (i >= steps.length) {
        clearInterval(ticker);
        setTimeout(() => {
          this.el.boot.classList.add('hidden');
          this.el['title-menu'].classList.remove('hidden');
          onDone?.();
        }, 420);
        return;
      }
      const [pct, msg] = steps[i++];
      this.el['boot-msg'].textContent = msg;
      this.el['boot-fill'].style.width = pct + '%';
      this.el['boot-pct'].textContent = pct + '%';
      setTimeout(tick, pct === 99 ? 900 : 190 + Math.random() * 260);
    };
    tick();
    ticker = setInterval(() => {
      const n = 1247 + Math.floor(Math.random() * 30) - 15;
      this.el['title-online'].textContent = `ออนไลน์ ${n} คน`;
    }, 1400);
  },

  /* ───────────── สร้างตัวละคร ───────────── */
  buildClassGrid() {
    const g = this.el['class-grid'];
    g.innerHTML = '';
    for (const c of CLASSES) {
      const d = document.createElement('button');
      d.className = 'class-card';
      d.dataset.id = c.id;
      d.innerHTML = `
        <h4>${c.icon} ${c.name}</h4>
        <span class="ctag">${c.tag}</span>
        <div class="cdesc">${c.desc}</div>
        <div class="cpass">◆ ${c.passive}</div>
        <div class="cst">
          <span>HP <b>${c.base.hp}</b></span><span>MP <b>${c.base.mp}</b></span>
          <span>ATK <b>${c.base.atk}</b></span><span>DEF <b>${c.base.def}</b></span>
          <span>SPD <b>${c.base.spd}</b></span><span>LUCK <b>${c.base.luck}</b></span>
        </div>`;
      d.onclick = () => {
        $$('.class-card').forEach((x) => x.classList.remove('sel'));
        d.classList.add('sel');
        this.h.onSelectClass(c.id);
        this.updateCreatePreview(c.id);
        this.validateName();
      };
      g.appendChild(d);
    }
  },

  updateCreatePreview(clsId) {
    const c = CLASSES.find((x) => x.id === clsId);
    if (!c) return;
    const cv = this.el['prev-canvas'];
    const g = cv.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, 96, 96);
    g.fillStyle = '#0a0d18'; g.fillRect(0, 0, 96, 96);
    const sp = SPR['hero_' + clsId];
    if (sp) g.drawImage(sp.frames[0], 0, 0, 16, 16, 0, 0, 96, 96);

    const rows = [['HP', c.base.hp], ['MP', c.base.mp], ['ATK', c.base.atk],
      ['DEF', c.base.def], ['SPD', c.base.spd], ['LUCK', c.base.luck]];
    this.el['prev-stats'].innerHTML = rows.map(([k, v]) => `<span>${k}</span><b>${v}</b>`).join('')
      + `<span style="grid-column:1/-1;color:#8d96b4;font-size:12px;margin-top:6px">สกิล: ${c.skills.map((s) => SKILLS[s].name).join(' · ')}</span>`
      + `<span style="grid-column:1/-1;color:#8d96b4;font-size:12px;font-style:italic">"${c.quote}"</span>`;
  },

  validateName() {
    const v = this.el['in-name'].value.trim();
    const hint = this.el['name-hint'];
    const cls = this.state.pendingClass;
    const ok = v.length >= 2 && v.length <= 16;
    if (!ok) { hint.textContent = 'ความยาว 2–16 ตัวอักษร'; hint.className = 'hint' + (v.length ? ' bad' : ''); }
    else { hint.textContent = 'ชื่อนี้ว่าง — ถ้าไม่มีคนใช้ก็ใช้ได้'; hint.className = 'hint'; }
    this.el['btn-start'].disabled = !(ok && cls);
  },

  /* ═══════════════════════════════════════════════════════════
     HUD — เรียกทุกเฟรม จึงต้องเบาที่สุด
     ═══════════════════════════════════════════════════════════ */
  render(state, view, frameDt = 0.016) {
    const p = state.player;
    const el = this.el;

    this._bar(el['bar-hp'], el['txt-hp'], p.hp / p.maxHp, `${Math.round(p.hp)}/${p.maxHp}`, 'hp');
    this._bar(el['bar-mp'], el['txt-mp'], p.mp / p.maxMp, `${Math.round(p.mp)}/${p.maxMp}`, 'mp');
    const need = needXp(p.lvl);
    this._bar(el['bar-xp'], el['txt-xp'], p.exp / need, `${Math.floor((p.exp / need) * 100)}%`, 'xp');

    const danger = p.hp / p.maxHp < 0.25 && !p.dead;
    if (this._hpDanger !== danger) {
      this._hpDanger = danger;
      el['bar-hp'].classList.toggle('danger', danger);
      const card = el['card-player'];
      if (card) card.classList.toggle('lowhp', danger);
      if (danger) this.deps.Audio?.play('warn');
    }

    if (this._lv !== p.lvl) {
      this._lv = p.lvl;
      el['pc-lv'].textContent = p.lvl;
    }
    const idStr = `${p.name}|${p.cls.icon}|${p.cls.name}|${p.advId || ''}|${p.companion ? p.companion.e : ''}|${state.pvpMode ? 'PK' : ''}`;
    if (this._idStr !== idStr) {
      this._idStr = idStr;
      el['pc-name'].textContent = p.name + (state.pvpMode ? ' [PK]' : '');
      el['pc-class'].textContent = p.cls.icon + ' ' + p.cls.name
        + (p.advId && ADVANCED[p.advId] ? ` · ${ADVANCED[p.advId].name}` : '')
        + (p.companion ? ` · ${p.companion.e}` : '');
    }
    this._num(el['pc-gold'], Math.floor(p.gold).toLocaleString(), 'gold');
    this._num(el['pc-gem'], p.gems, 'gem');
    this._num(el['pc-ticket'], p.tickets, 'ticket');

    this._num(el['srv-online'], `ออนไลน์ ${state.onlineCount} คน · ${state.zoneName}`, 'online');
    this._num(el['srv-ping'], `ping ${state.ping}ms`, 'ping');
    if (this.deps.DayNight) {
      const dn = this.deps.DayNight;
      this._num(el['srv-time'], `${dn.icon()} ${dn.label()}`, 'time');
    }
    this._num(el['boss-timer'], state.bossText, 'boss');

    this._minimapTick = (this._minimapTick || 0) - frameDt;
    if (this._minimapTick <= 0) {
      this._minimapTick = 0.1;
      const mc = el['minimap'];
      state.world.drawMinimap(mc.getContext('2d'), mc.width, mc.height, p, {
        monsters: state.monsters, npcs: state.npcs, boss: state.boss.entity, pets: state.pets,
      });
    }

    this.updateHotbar(state);
    this.refreshPetHud(state);
    this.refreshAuto(state);
    this.refreshAutoQuest(state);
    this.updateTarget();
    this.questTick -= frameDt;
    if (this.questTick <= 0) { this.questTick = 0.35; this.renderQuestTracker(state); }

    if (this.deps.Settings.get('showNames')) this.renderNametags(state, view);
    else if (this.tagMap.size) { for (const e of this.tagMap.values()) e.remove(); this.tagMap.clear(); }

    if (this.deps.Settings.get('damageNumbers')) this.renderFloaters(state, view);
    else if (this.floatMap.size) { for (const e of this.floatMap.values()) e.remove(); this.floatMap.clear(); }

    this.renderChat(state);
  },

  _bar(node, txt, ratio, label, key) {
    this._barV = this._barV || {};
    const r = Math.max(0, Math.min(1, ratio));
    const q = Math.round(r * 200) / 200;
    const k = key + '|' + q + '|' + label;
    if (this._barV[key] === k) return;
    this._barV[key] = k;
    node.style.width = (r * 100) + '%';
    txt.textContent = label;
  },

  _num(node, value, key) {
    this._numV = this._numV || {};
    const v = String(value);
    if (this._numV[key] === v) return;
    this._numV[key] = v;
    node.textContent = v;
  },

  /* ── ป้ายชื่อ: transform + dirty-check ── */
  renderNametags(state, view) {
    const p = state.player;
    const { ox, oy, scale, camX, camY, w, h } = view;
    const seen = this._seen || (this._seen = new Set());
    seen.clear();

    const put = (key, wx, wy, html, cls, hpRatio, spriteH) => {
      let sx, sy;
      if (view.project) {
        const pr = view.project(wx, wy, spriteH || 16);
        sx = ox + pr.sx; sy = oy + pr.sy;
      } else {
        sx = ox + (wx - camX) * scale;
        sy = oy + (wy - camY) * scale - (spriteH || 16) * scale - 4;
      }
      if (sx < -80 || sy < -40 || sx > w + 80 || sy > h + 60) return;
      let e = this.tagMap.get(key);
      if (!e) {
        e = document.createElement('div');
        this.tagMap.set(key, e);
        this.el['nametags'].appendChild(e);
      }
      const ratio = (hpRatio === null || hpRatio === undefined) ? -1 : Math.round(hpRatio * 40);
      const sig = cls + '|' + html + '|' + ratio;
      if (e._sig !== sig) {
        e._sig = sig;
        e.className = 'ntag ' + cls;
        const bar = ratio < 0 ? ''
          : `<div class="nbar"><i style="width:${Math.max(0, ratio / 40 * 100)}%"></i></div>`;
        e.innerHTML = `<div class="nn">${html}</div>${bar}`;
      }
      e.style.transform = `translate(-50%,-100%) translate(${Math.round(sx)}px,${Math.round(sy)}px)`;
      seen.add(key);
    };

    for (const m of state.monsters) {
      if (m.dead) continue;
      put('m' + m._uid, m.x, m.y,
        `${esc(m.name)} <span style="color:#9aa4c8">Lv.${m.lvl}</span>`,
        m.boss ? 'boss' : (m.elite ? 'elite' : ''), m.hp / m.maxHp, m.boss ? 24 : 16);
    }
    for (const n of state.npcs) put('n' + n.id, n.x, n.y, esc(n.name), 'npc', null, 16);
    for (const b of state.bots) {
      if (b.koT > 0) continue;
      const bCls = b.inParty ? 'bot party' : (b.hostile || state.pvpMode ? 'bot pk' : 'bot');
      const prefix = b.inParty ? '[ตี้] ' : (b.hostile ? '[PK] ' : '');
      const hpR = b.afk ? null : (b.hp / (b.maxHp || 100));
      put('b' + b._uid, b.x, b.y,
        `${prefix}${esc(b.name)} <span style="color:#9aa4c8">${b.lvl}</span>`, bCls, hpR, 16);
    }
    for (const pt of state.pets) {
      put('p' + pt.uid, pt.x, pt.y,
        `${pt.species.icon} ${esc(pt.nickname)} <span style="color:${pt.rarity.color}">Lv.${pt.lvl}</span>`,
        pt.ko ? 'petko' : 'pet', pt.hp / pt.maxHp, 14);
    }
    const aura = playerAura(p);
    const meLabel = esc(p.name) + (aura ? ` <span style="color:${aura.color}">+${aura.lvl}</span>` : '');
    put('me', p.x, p.y, meLabel, 'me', null, 16);

    for (const [k, e] of this.tagMap) {
      if (!seen.has(k)) { e.remove(); this.tagMap.delete(k); }
    }
  },

  renderFloaters(state, view) {
    const { ox, oy, scale, camX, camY, w, h } = view;
    const seen = this._seenF || (this._seenF = new Set());
    seen.clear();
    for (const f of state.floaters) {
      let sx, sy;
      if (view.project) {
        const pr = view.project(f.x, f.y, 14);
        sx = ox + pr.sx; sy = oy + pr.sy;
      } else {
        sx = ox + (f.x - camX) * scale;
        sy = oy + (f.y - camY) * scale;
      }
      if (sx < -60 || sy < -40 || sx > w + 60 || sy > h + 40) continue;
      let e = this.floatMap.get(f.uid);
      if (!e) {
        e = document.createElement('div');
        e.className = 'flt';
        this.floatMap.set(f.uid, e);
        this.el['floaters'].appendChild(e);
      }
      if (e._txt !== f.text || e._col !== f.color || e._sz !== f.size) {
        e._txt = f.text; e._col = f.color; e._sz = f.size;
        e.textContent = f.text; e.style.color = f.color; e.style.fontSize = (13 * f.size) + 'px';
      }
      e.style.opacity = String(Math.max(0, 1 - f.t / f.dur));
      e.style.transform = `translate(-50%,-50%) translate(${Math.round(sx)}px,${Math.round(sy)}px)`;
      seen.add(f.uid);
    }
    for (const [k, e] of this.floatMap) {
      if (!seen.has(k)) { e.remove(); this.floatMap.delete(k); }
    }
  },

  renderChat(state) {
    const log = this.el['chat-log'];
    const isSys = this.activeCh === 'system';
    const filter = this.deps.Settings.get('chatFilter');
    const show = (m) => {
      if (filter === 'none') return m.ch === 'system';
      if (filter === 'world') return m.ch === 'world' || m.ch === 'system';
      return true;
    };
    const fresh = state.chat.filter((m) => m.id > this.lastChatId
      && (isSys ? m.ch === 'system' : m.ch === this.activeCh)
      && show(m));
    if (!fresh.length) return;
    const frag = document.createDocumentFragment();
    for (const m of fresh) {
      const d = document.createElement('div');
      d.className = 'cl ' + (m.cls || m.ch);
      if (m.ch === 'system') d.textContent = '» ' + m.text;
      else d.innerHTML = `<span class="who">[${esc(m.name)}]</span>${esc(m.text)}`;
      frag.appendChild(d);
    }
    log.appendChild(frag);
    this.lastChatId = state.chat[state.chat.length - 1].id;
    while (log.children.length > 90) log.removeChild(log.firstChild);
    log.scrollTop = log.scrollHeight;
  },

  rebuildChat() {
    this.el['chat-log'].innerHTML = '';
    this.lastChatId = 0;
    this.renderChat(this.state);
  },

  /* ── ฮอตบาร์ ── */
  buildHotbar(state) {
    const bar = this.el['hotbar'];
    bar.innerHTML = '';
    const p = state.player;
    this.slots = [];
    const items = [
      ...playerSkills(p).map((sid) => ({ type: 'skill', id: sid })),
      { type: 'item', id: 'hp_potion' },
      { type: 'item', id: 'mp_potion' },
      { type: 'item', id: 'capture_ball' },
      { type: 'item', id: 'pet_potion' },
    ];
    items.forEach((it, i) => {
      const d = document.createElement('div');
      d.className = 'slot';
      d.dataset.kb = String(i + 1);
      d.onclick = () => this.useSlot(it);
      bar.appendChild(d);
      this.slots.push({ node: d, it });
    });
    this._hotSig = null;
    this.updateHotbar(state);
  },

  updateHotbar(state) {
    if (!this.slots) return;
    const p = state.player;
    for (let i = 0; i < this.slots.length; i++) {
      const { node, it } = this.slots[i];
      if (it.type === 'skill') {
        const sk = SKILLS[it.id];
        const cdq = Math.round((p.cooldowns[it.id] || 0) * 10);
        const nomp = p.mp < sk.mp ? 1 : 0;
        if (node._cdq === cdq && node._nomp === nomp) continue;
        node._cdq = cdq; node._nomp = nomp;
        node.className = 'slot' + (nomp ? ' nomp' : '');
        node.innerHTML = `<span class="kb">${i + 1}</span>${sk.icon}<span class="nm">${sk.name}</span>`
          + (cdq > 0 ? `<span class="cdmask">${(cdq / 10).toFixed(1)}</span>` : '');
      } else {
        const d = ITEMS[it.id];
        const qty = countItem(p, it.id);
        if (node._qty === qty) continue;
        node._qty = qty;
        node.className = 'slot' + (qty <= 0 ? ' nomp' : '');
        node.innerHTML = `<span class="kb">${i + 1}</span>${d.icon}<span class="nm">×${qty}</span>`;
      }
    }
  },

  useSlot(it) {
    if (it.type === 'skill') this.h.onSkill(it.id);
    else this.h.onUseItem(it.id);
  },

  showTooltip(slotNode) {
    const idx = this.slots.findIndex((s) => s.node === slotNode);
    if (idx < 0) return;
    const it = this.slots[idx].it;
    const tt = this.el['tooltip'];
    if (!tt) return;
    let html;
    if (it.type === 'skill') {
      const sk = SKILLS[it.id];
      html = `<b>${sk.icon} ${esc(sk.name)}</b>
        <div class="tt-meta">MP ${sk.mp} · คูลดาวน์ ${sk.cd} วินาที</div>
        <div class="tt-desc">${esc(sk.desc)}</div>`;
    } else {
      const d = ITEMS[it.id];
      const qty = countItem(this.state.player, it.id);
      html = `<b>${d.icon} ${esc(d.name)}</b>
        <div class="tt-meta">มี ${qty} ชิ้น · กด ${idx + 1}</div>
        <div class="tt-desc">${esc(d.desc || '')}</div>`;
    }
    tt.innerHTML = html;
    tt.classList.add('on');
  },
  hideTooltip() { this.el['tooltip']?.classList.remove('on'); },

  renderQuestTracker(state) {
    const p = state.player;
    const list = this.el['quest-list'];
    const active = QUESTS.filter((q) => p.quests[q.id] && p.quests[q.id].state !== 'claimed');
    const sig = active.map((q) => {
      const pr = questProgress(state, q);
      return `${q.id}:${pr.cur}/${pr.need}:${p.quests[q.id].state}`;
    }).join(',');
    if (this._qSig === sig) return;
    this._qSig = sig;

    if (!active.length) {
      list.innerHTML = '<li class="muted small">ยังไม่มีเควสต์ — คุยกับผู้ใหญ่บ้านสมชาย หรือกด Q</li>';
      return;
    }
    list.innerHTML = active.map((q) => {
      const pr = questProgress(state, q);
      const st = p.quests[q.id].state;
      return `<li>
        <div class="qt-name">${q.icon} ${esc(q.title)}</div>
        <div class="qt-obj"><span>${esc(pr.text)}</span>
          <span class="${pr.done ? 'done' : ''}">${pr.cur}/${pr.need}${pr.done ? ' ✓' : ''}</span></div>
        <div class="qt-bar"><i style="width:${(pr.cur / pr.need) * 100}%"></i></div>
        ${st === 'done' ? '<div class="small" style="color:#41d17c">พร้อมส่ง — กด Q</div>' : ''}
      </li>`;
    }).join('');
  },

  /* ── ตัววัดประสิทธิภาพ ── */
  tickPerf(state, Perf, dt) {
    const el = this.el['perfhud'];
    if (!el) return;
    const on = this.deps.Settings.get('perf');
    if (!on) { if (el.classList.contains('on')) el.classList.remove('on'); return; }
    el.classList.add('on');
    this.perfTick -= dt;
    if (this.perfTick > 0) return;
    this.perfTick = 0.25;
    el.innerHTML =
      `<b>${Perf.fps.toFixed(0)}</b> FPS · เฟรม ${Perf.ms.toFixed(1)}ms · p95 ${Perf.p95.toFixed(1)}ms · แย่สุด ${Perf.worst.toFixed(0)}ms<br>`
      + `เอนทิตี ${state.monsters.length + state.bots.length + state.npcs.length} · `
      + `particle ${this.deps.Particles.count()} · เอฟเฟกต์ ${state.effects.length}<br>`
      + `node ใน DOM ${document.getElementsByTagName('*').length} · เฟรมกระตุก ${Perf.longFrames}`;
  },

  refreshAuto() {
    const btn = this.el['btn-auto'];
    if (!btn) return;
    const s = Auto.status();
    const sig = s.cls + '|' + s.label;
    if (this._autoSig === sig) return;
    this._autoSig = sig;
    btn.classList.toggle('on', s.cls === 'on');
    this.el['auto-status'].textContent = s.label.replace(/^AUTO:?\s*/, '') || 'ปิดอยู่';
  },

  refreshAutoQuest(state) {
    const btn = this.el['btn-autoquest'];
    if (!btn) return;
    const s = AutoQ.status(state);
    const sig = s.cls + '|' + s.label;
    if (this._aqSig === sig) return;
    this._aqSig = sig;
    btn.classList.toggle('on', s.cls === 'on');
    this.el['autoquest-status'].textContent = s.label;
  },

  skillBanner(id, sk) {
    const el = this.el['skill-banner'];
    if (!el || !sk) return;
    const colors = {
      slash: '#ffffff', lootbag: '#ffc94d', fire: '#ff8f3c', collect: '#ffc94d',
      steal: '#ff4d6b', feed: '#ff8f8f', shutdown: '#7fe0ff', turbo: '#7fe0ff',
      ult: '#ffd76a', ban: '#b98bff', restart: '#5fe89b',
      dig: '#ffc94d', finisher: '#ff6b6b', fire3: '#ff8f3c', overdraw: '#c9a2ff',
      rally: '#5fe89b', grandfeed: '#ff8f8f', lanfix: '#7fe0ff', lagspike: '#8ad6ff',
      star55: '#ffd76a', reroll: '#b98bff', blacklist: '#b98bff', hotfix: '#5fe89b',
    };
    el.textContent = `${sk.icon} ${sk.name}`;
    el.style.color = colors[id] || '#ffffff';
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
  },

  zoneBanner(name) {
    const e = this.el['zone-banner'];
    if (!e) return;
    e.textContent = name;
    e.classList.remove('hidden');
    e.style.animation = 'none'; void e.offsetWidth; e.style.animation = '';
    clearTimeout(this._zoneT);
    this._zoneT = setTimeout(() => e.classList.add('hidden'), 2200);
  },

  setTarget(m) {
    const box = this.el['target-box'];
    if (!box) return;
    this._targetSig = null;
    box.classList.toggle('hidden', !m);
    this.updateTarget();
  },

  updateTarget() {
    const box = this.el['target-box'];
    if (!box || box.classList.contains('hidden')) return;
    const m = this.state.targetMonster;
    if (!m || m.dead) { box.classList.add('hidden'); return; }
    const ratio = Math.max(0, m.hp / m.maxHp);
    const sig = m._uid + '|' + Math.round(ratio * 100);
    if (this._targetSig === sig) return;
    this._targetSig = sig;
    this.el['tb-name'].textContent = `${m.name} Lv.${m.lvl}`;
    this.el['bar-thp'].style.width = (ratio * 100) + '%';
    this.el['txt-thp'].textContent = `${Math.max(0, Math.round(m.hp))}/${m.maxHp}`;
  },

  refreshPetHud(state) {
    const box = this.el['pet-hud'];
    if (!box) return;
    const pet = activePet(state);
    if (!pet) { box.classList.add('hidden'); this._petSig = null; return; }
    box.classList.remove('hidden');
    const ratio = Math.max(0, pet.hp / pet.maxHp);
    const sig = pet.uid + '|' + pet.lvl + '|' + pet.nickname + '|' + Math.round(ratio * 100) + '|' + (pet.ko ? 1 : 0);
    if (this._petSig === sig) return;
    this._petSig = sig;
    this.el['ph-name'].textContent = pet.nickname;
    this.el['ph-lv'].textContent = pet.ko ? 'สลบ' : `Lv.${pet.lvl}`;
    this.el['ph-lv'].style.color = pet.ko ? 'var(--red)' : pet.rarity.color;
    this.el['bar-php'].style.width = (ratio * 100) + '%';
    this.el['txt-php'].textContent = `${Math.max(0, Math.round(pet.hp))}/${pet.maxHp}`;
    const cv = this.el['pet-face'];
    const g = cv.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.fillStyle = '#0a0d18'; g.fillRect(0, 0, 28, 28);
    const sp = SPR[pet.speciesId];
    if (sp) g.drawImage(sp.frames[0], 0, 0, 16, 16, 0, 0, 28, 28);
    cv.style.borderColor = pet.rarity.color;
  },

  renderPets() {
    const state = this.state;
    const box = this.el['pet-list'];
    if (!box) return;
    const pets = state.pets;
    this.el['pet-cap'].textContent = `${pets.length}/${PET_MAX} ตัว · ลูกแก้วจับมอน ${countItem(state.player, 'capture_ball')} ลูก`;
    if (!pets.length) {
      box.innerHTML = `<div class="muted small" style="padding:16px;text-align:center;line-height:1.9">
        ยังไม่มีสัตว์เลี้ยง<br>
        <b>วิธีจับ:</b> ตีมอนให้เลือดน้อย → คลิกที่มอน → กดช่อง <kbd>5</kbd> (ลูกแก้วจับมอน)<br>
        <span class="tiny">มอนเลือดยิ่งน้อย ยิ่งจับง่าย · มอน elite ให้สัตว์เลี้ยงระดับสูงกว่า</span>
      </div>`;
      return;
    }
    box.innerHTML = pets.map((p) => {
      const act = p.uid === state.player.activePet;
      const ratio = Math.max(0, p.hp / p.maxHp);
      return `<div class="pet-row ${act ? 'active' : ''} ${p.ko ? 'ko' : ''}" data-uid="${p.uid}">
        <div class="pr-icon" style="border-color:${p.rarity.color}">${p.species.icon}</div>
        <div class="pr-main">
          <div class="pr-name">${esc(p.nickname)}
            ${act ? '<span class="pr-badge">ใช้งานอยู่</span>' : ''}
            ${p.ko ? '<span class="pr-badge ko">สลบ</span>' : ''}</div>
          <div class="pr-sub">${esc(p.species.name)} ·
            <span style="color:${p.rarity.color}">${p.rarity.name}</span> · Lv.${p.lvl}</div>
          <div class="bar bar-php"><i style="width:${ratio * 100}%"></i><span>${Math.max(0, Math.round(p.hp))}/${p.maxHp}</span></div>
          <div class="pr-stats">ATK ${p.atk} · สังหาร ${p.kills} · EXP ${Math.floor(p.exp)}/${petXpFor(p.lvl)}</div>
          <div class="pr-stats muted">${esc(p.species.note)}${p.caughtFrom ? ` · จับจาก ${esc(p.caughtFrom)}` : ''}</div>
        </div>
        <div class="pr-act">
          ${act ? '' : '<button class="btn btn-mini" data-act="use">ใช้งาน</button>'}
          ${p.ko ? '<button class="btn btn-mini btn-primary" data-act="revive">ฟื้น</button>' : ''}
          <button class="btn btn-mini" data-act="rename">ตั้งชื่อ</button>
          <button class="btn btn-mini btn-ghost" data-act="release">ปล่อย</button>
        </div>
      </div>`;
    }).join('');

    box.querySelectorAll('[data-act]').forEach((b) => {
      b.onclick = () => {
        const row = b.closest('.pet-row');
        const uid = Number(row.dataset.uid);
        const act = b.dataset.act;
        const pet = state.pets.find((x) => x.uid === uid);
        if (!pet) return;
        if (act === 'use') {
          setActivePet(state, uid);
          this.toast(`${pet.nickname} ออกมาช่วยแล้ว`, 'good');
          this.refreshPetHud(state);
        } else if (act === 'revive') {
          const r = usePetPotion(state);
          if (!r.ok) { this.toast(r.msg, 'bad'); this.deps.Audio?.play('error'); }
          else this.toast(`${r.pet.nickname} ฟื้นแล้ว`, 'good');
          this.refreshPetHud(state);
        } else if (act === 'rename') {
          const n = prompt(`ตั้งชื่อใหม่ให้ ${pet.nickname}`, pet.nickname);
          if (n && renamePet(state, uid, n)) this.toast('เปลี่ยนชื่อแล้ว', 'good');
        } else if (act === 'release') {
          if (!confirm(`ปล่อย ${pet.nickname} กลับป่า? ย้อนกลับไม่ได้`)) return;
          releasePet(state, uid);
          this.toast(`${pet.nickname} หันมามองคุณแล้วเดินจากไป`, 'bad');
          this.refreshPetHud(state);
        }
        this.renderPets();
      };
    });
  },

  /* ── แพเนล ── */
  togglePanel(name) {
    if (this.openPanelName === name) { this.closePanels(); return; }
    this.closePanels();
    this.openPanelName = name;
    const p = document.getElementById('panel-' + name);
    if (!p) return;
    p.classList.add('open');
    if (name === 'inv') this.renderInventory();
    if (name === 'skill') this.renderSkills();
    if (name === 'gacha') this.renderGacha();
    if (name === 'quest') this.renderQuestPanel();
    if (name === 'stats') this.renderStats();
    if (name === 'ach') this.renderAchievements();
    if (name === 'settings') this.buildSettings();
    if (name === 'pet') this.renderPets();
    if (name === 'social') this.renderSocial();
  },

  closePanels() {
    $$('.panel').forEach((p) => p.classList.remove('open'));
    this.openPanelName = null;
  },

  /* ── แพเนลใหม่ v1.0.0: ปาร์ตี้ · ประลอง PvP · หอคอยบั๊ก · วาร์ปโซน ── */
  renderSocial() {
    const state = this.state;
    const p = state.player;
    const box = this.el['social-body'];
    if (!box || !p) return;

    const rank = pvpRank(p);
    const activeWave = state.monsters.filter((m) => !m.dead && m.towerWave).length;
    const nextFloor = (p.ctr.towerFloor || 0) + 1;
    const ptBots = partyBots(state);
    const allBots = (state.bots || []).filter((b) => !b.afk);

    box.innerHTML = `
      <div class="social-sec">
        <h4><span>🗺️ วาร์ปด่วนข้ามแมพ (3 โซน)</span><span class="small muted">อยู่: ${esc(state.world.zoneLabel)}</span></h4>
        <p>ไม่ต้องเดินหาประตู Portal เองให้เมื่อยขา — กดวาร์ปข้ามโซนได้ทันที</p>
        <div class="warp-btns">
          <button class="btn btn-mini ${state.mapId === 'field' ? 'btn-primary' : ''}" data-warp="field">🏞️ หมู่บ้านโนบอดี้ (Lv.1+)</button>
          <button class="btn btn-mini ${state.mapId === 'hell' ? 'btn-primary' : ''}" data-warp="hell">🔥 ดินแดนมาร (Lv.12+)</button>
          <button class="btn btn-mini ${state.mapId === 'cyber' ? 'btn-primary' : ''}" data-warp="cyber">💻 แดนเซิร์ฟเถื่อน (Lv.16+)</button>
        </div>
      </div>

      <div class="social-sec">
        <h4>
          <span>🥊 ประลอง PvP กับบอทเกรียน</span>
          <span class="pvp-badge ${state.pvpMode ? 'on' : ''}">${state.pvpMode ? 'โหมด PK: เปิดอยู่' : 'โหมด PK: ปิดอยู่'}</span>
        </h4>
        <p>ยศปัจจุบัน: <b style="color:var(--gold)">${esc(rank.title)}</b> (ATK +${rank.bonusAtk}) · ชนะประลองสะสม <b>${p.ctr.pvpWins || 0}</b> ครั้ง</p>
        <div class="social-btns">
          <button class="btn btn-mini ${state.pvpMode ? '' : 'btn-primary'}" id="btn-pvp-toggle">
            ${state.pvpMode ? '🛡️ ปิดโหมด PK' : '⚔️ เปิดโหมด PK (ตีบอทได้)'}
          </button>
          <button class="btn btn-mini" id="btn-pvp-duel">📣 เรียกบอทเกรียนมาท้าตีเดี๋ยวนี้!</button>
        </div>
      </div>

      <div class="social-sec">
        <h4>
          <span>🗼 ดันเจี้ยนไต่หอคอยบั๊ก</span>
          <span class="small" style="color:#4ae8ff">สูงสุด: ชั้น ${p.ctr.towerFloor || 0}</span>
        </h4>
        <p>เสกฝูงมอนสเตอร์ประจำชั้น + บอสหัวหน้าชั้นมาล้อมตัว เคลียร์หมดรับเพชร เงิน และยันต์กันแตกทุก 2 ชั้น!</p>
        <div class="social-btns">
          <button class="btn btn-mini btn-primary" id="btn-tower-start" ${activeWave > 0 ? 'disabled' : ''}>
            ${activeWave > 0 ? `กำลังสู้ชั้น ${state.tower?.floor || nextFloor} (เหลือ ${activeWave} ตัว)` : `🚀 ลุยหอคอยบั๊ก ชั้นที่ ${nextFloor}`}
          </button>
        </div>
      </div>

      <div class="social-sec">
        <h4>
          <span>🤝 ปาร์ตี้บอทจำลอง & บัฟกิลด์</span>
          <span class="small" style="color:#e8a3ff">สมาชิกตี้ ${ptBots.length}/2 คน (ATK +${ptBots.length * 10}% · EXP +${ptBots.length * 15}%)</span>
        </h4>
        <p>ชวนบอทในแมพเข้าตี้เพื่อเดินตามและช่วยรุมตีมอนสเตอร์จริง หรือบริจาคเงินรับบัฟกิลด์</p>
        <div class="social-btns" style="margin-bottom:10px">
          ${GUILD_BUFFS.map((gb) => `<button class="btn btn-mini" data-gbuff="${gb.id}" title="${esc(gb.desc)}">${gb.icon} ${esc(gb.name)} (${gb.cost}💰)</button>`).join('')}
        </div>
        <div class="bot-grid">
          ${allBots.slice(0, 8).map((b) => `
            <div class="bot-card ${b.inParty ? 'in-party' : ''}">
              <div>
                <div class="bc-name">${esc(b.name)}</div>
                <div class="bc-sub">Lv.${b.lvl} · HP ${Math.round(b.hp)}/${b.maxHp}</div>
              </div>
              <button class="btn btn-mini ${b.inParty ? 'btn-ghost' : ''}" data-party-uid="${b._uid}">
                ${b.inParty ? 'เตะออก' : 'ชวนเข้าตี้'}
              </button>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    box.querySelectorAll('[data-warp]').forEach((b) => {
      b.onclick = () => {
        this.h.onWarp?.(b.dataset.warp);
        this.closePanels();
      };
    });
    el_on(box.querySelector('#btn-pvp-toggle'), 'click', () => {
      this.h.onTogglePvp?.();
      this.renderSocial();
    });
    el_on(box.querySelector('#btn-pvp-duel'), 'click', () => {
      this.h.onChallengeBot?.();
      this.closePanels();
    });
    el_on(box.querySelector('#btn-tower-start'), 'click', () => {
      this.h.onStartTower?.();
      this.closePanels();
    });
    box.querySelectorAll('[data-gbuff]').forEach((b) => {
      b.onclick = () => {
        this.h.onGuildBuff?.(b.dataset.gbuff);
        this.renderSocial();
      };
    });
    box.querySelectorAll('[data-party-uid]').forEach((b) => {
      b.onclick = () => {
        this.h.onToggleParty?.(Number(b.dataset.partyUid));
        this.renderSocial();
      };
    });
  },

  renderInventory() {
    const p = this.state.player;
    const g = this.el['inv-grid'];
    g.innerHTML = '';
    if (!p.inv.length) g.innerHTML = '<div class="muted small">กระเป๋าว่างเปล่า — ไปตีมอนสิ</div>';
    p.inv.forEach((s) => {
      const d = ITEMS[s.id]; if (!d) return;
      const b = document.createElement('div');
      b.className = 'inv-slot' + (this.selectedInv === s.id ? ' sel' : '');
      b.innerHTML = `<div class="rar r-${d.rarity}"></div>${d.icon}${s.qty > 1 ? `<span class="qty">${s.qty}</span>` : ''}`;
      b.onclick = () => { this.selectedInv = s.id; this.renderInventory(); this.renderInvDetail(s.id); };
      g.appendChild(b);
    });
    this.el['inv-cap'].textContent =
      `ใช้ ${p.inv.length}/40 ช่อง · เงิน ${Math.floor(p.gold).toLocaleString()} · หินอัพเกรด ${countItem(p, UPGRADE.stoneItem)} · ยันต์กันแตก ${countItem(p, UPGRADE.protectItem)}`;
    if (this.selectedInv) this.renderInvDetail(this.selectedInv);
    else this.renderInvDetail(p.inv[0]?.id || null);
  },

  renderInvDetail(id) {
    const d = id ? ITEMS[id] : null;
    const p = this.state.player;
    const box = this.el['inv-detail'];
    const stats = [];
    if (d) {
      if (d.atk) stats.push(`ATK +${d.atk}`);
      if (d.def) stats.push(`DEF +${d.def}`);
      if (d.luck) stats.push(`LUCK +${d.luck}`);
      if (d.heal) stats.push(`ฟื้น HP ${d.heal}`);
      if (d.healMp) stats.push(`ฟื้น MP ${d.healMp}`);
    }
    const acts = [];
    if (d) {
      if (d.kind === 'use') acts.push('<button class="btn btn-mini" data-a="use">ใช้</button>');
      if (d.kind === 'equip') acts.push('<button class="btn btn-mini" data-a="equip">สวมใส่</button>');
      if (d.kind === 'sell') acts.push(`<button class="btn btn-mini" data-a="sell">ขาย ${d.price} เงิน</button>`);
      if (d.kind === 'gacha') acts.push('<span class="small muted">ใช้ที่แพเนลกาชา (G)</span>');
      if (d.kind === 'quest') acts.push('<span class="small muted">ไอเทมเควสต์ ขายไม่ได้</span>');
    }

    // ── ส่วนอัพเกรด + หลอมยันต์กันแตก ──
    let upHtml = '';
    const charms = countItem(p, UPGRADE.protectItem);
    const aura = playerAura(p);
    for (const [slot, label] of [['weapon', 'อาวุธ'], ['acc', 'เครื่องประดับ']]) {
      const eq = p.equip[slot];
      if (!eq) { upHtml += `<div class="up-row empty"><span>${label}</span><em>ไม่ได้สวม</em></div>`; continue; }
      const ed = ITEMS[eq.id];
      const lvl = eq.lvl || 0;
      const per = UPGRADE.statPerLvl?.[slot] || { atk: 2, def: 0, luck: 1 };
      const bonusTxt = `+${lvl * (per.atk || 0)} ATK${per.def ? ` · +${lvl * per.def} DEF` : ''} · +${lvl * (per.luck || 0)} LUCK`;
      const nextRate = UPGRADE.rates[lvl];
      const gold = UPGRADE.goldPerTry(lvl);
      const breakC = lvl >= UPGRADE.breakFrom ? UPGRADE.breakChance[lvl] : 0;
      const maxed = lvl >= UPGRADE.maxLevel;
      upHtml += `<div class="up-row">
        <div class="up-head"><b>${ed.icon} ${esc(ed.name)}</b><span class="up-lv">+${lvl} (${bonusTxt})</span></div>
        <div class="up-body">
          ${maxed ? '<span class="muted">อัพเกรดสูงสุดแล้ว</span>' : `
            <span>โอกาสสำเร็จ <b>${(nextRate * 100).toFixed(0)}%</b></span>
            <span>ใช้เงิน <b>${gold}</b> + หิน 1</span>
            ${breakC ? `<span class="up-risk">เสี่ยงหัก ${(breakC * 100).toFixed(0)}%${charms > 0 ? ' (มียันต์คุ้มครอง!)' : ''}</span>` : ''}
            <button class="btn btn-mini btn-primary" data-up="${slot}">อัพเกรด</button>`}
        </div>
      </div>`;
    }

    const itemHeader = d
      ? `<h4>${d.icon} ${esc(d.name)}</h4>
         <div class="stat">${stats.join(' · ') || 'ไม่มีสเตตัส'}</div>
         <div class="desc">${esc(d.desc || '')}</div>
         <div class="acts">${acts.join('')}</div>`
      : `<div class="muted small">เลือกไอเทมในกระเป๋าเพื่อดูรายละเอียด</div>`;

    box.innerHTML = `
      ${itemHeader}
      <div class="up-title">
        อัพเกรดอุปกรณ์ ${aura ? `<span style="color:${aura.color}">(${esc(aura.name)} +${aura.lvl})</span>` : ''}
        <span class="muted small">— ${esc(UPGRADE.note)}</span>
      </div>
      ${upHtml}
      <div style="margin-top:9px;display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
        <span class="small muted">🧿 ยันต์กันแตกที่มี: <b>${charms}</b> ใบ</span>
        <button class="btn btn-mini" id="btn-craft-charm">🧿 หลอมยันต์กันแตก (หิน ${UPGRADE.craftProtectCost.stones} + ${UPGRADE.craftProtectCost.gold} เงิน)</button>
      </div>`;

    box.querySelectorAll('[data-a]').forEach((b) => {
      b.onclick = () => {
        const a = b.dataset.a;
        if (a === 'use') this.h.onUseItem(id);
        if (a === 'equip') this.h.onEquipItem(id);
        if (a === 'sell') this.h.onSellItem(id);
        this.renderInventory();
      };
    });
    box.querySelectorAll('[data-up]').forEach((b) => {
      b.onclick = () => { this.h.onUpgrade(b.dataset.up); };
    });
    el_on(box.querySelector('#btn-craft-charm'), 'click', () => {
      this.h.onCraftCharm?.();
      this.renderInventory();
    });
  },

  renderSkills() {
    const p = this.state.player;
    const box = this.el['skill-list'];
    box.innerHTML = Object.entries(SKILLS).map(([id, sk]) => {
      const has = playerSkills(p).includes(id);
      const cd = p.cooldowns[id] || 0;
      return `<div class="skill-row ${has ? '' : 'locked'}">
        <div class="si">${sk.icon}</div>
        <div style="flex:1">
          <h4>${esc(sk.name)}
            <span class="meta">MP ${sk.mp}</span>
            <span class="meta">CD ${sk.cd}s</span>
            ${has ? '<span class="meta" style="color:#ffc94d">อาชีพของคุณ</span>' : '<span class="meta">อาชีพอื่น</span>'}
          </h4>
          <p>${esc(sk.desc)}</p>
          ${cd > 0 ? `<p style="color:#ff9d5c">ติดคูลดาวน์อีก ${cd.toFixed(1)} วินาที</p>` : ''}
        </div>
      </div>`;
    }).join('');
  },

  renderGacha() {
    const p = this.state.player;
    const el = this.el;
    el['gacha-banner'].innerHTML = `<h4>${esc(GACHA.banner.title)}</h4><p>${esc(GACHA.banner.sub)}</p>`;
    el['gacha-rates'].innerHTML =
      GACHA.rateText.map(([r, v, note]) => `<div>${r} — ${v} ${note ? `<span class="muted">(${esc(note)})</span>` : ''}</div>`).join('')
      + `<div style="margin-top:8px">สกุลเงินที่มี: 💎 <b>${p.gems}</b> · 🎫 <b>${p.tickets}</b></div>`
      + `<div> pity: <b>${p.pity}</b>/${GACHA.pity} · เปิดไปแล้ว <b>${p.totalPulls}</b> ครั้ง</div>`
      + `<div class="muted">สกุลเงินอื่น: ${GACHA.currencies.filter((c) => c[2] === 'ใช้ไม่ได้').map((c) => `${c[0]} ${c[1]}`).join(' · ')} — ใช้ไม่ได้</div>`;
    el['gacha-actions'].innerHTML = `
      <button class="btn btn-primary" data-n="1">เปิด 1 ครั้ง (🎫 1)</button>
      <button class="btn" data-n="10">เปิด 10 ครั้ง (💎 1,600)</button>
      <button class="btn btn-ghost" data-n="0">ดูอัตราดรอปซ้ำ</button>`;
    el['gacha-actions'].querySelectorAll('[data-n]').forEach((b) => {
      b.onclick = () => {
        const n = Number(b.dataset.n);
        if (n === 0) { this.toast('อัตราดรอปเดิม ไม่มีการเปลี่ยนแปลง (ตามที่เขียนไว้)', 'bad'); return; }
        this.h.onGacha(n);
      };
    });
  },

  renderGachaResult(results) {
    const box = this.el['gacha-result'];
    if (!results.length) { box.innerHTML = '<span class="muted small">ผลการเปิดกาชาจะแสดงที่นี่</span>'; return; }
    box.innerHTML = results.map((r, i) => `
      <div class="pull s${r.rarity}" style="animation-delay:${i * 0.06}s">
        <span class="em">${r.e}</span>
        <div style="color:#ffc94d;font-weight:700">★${r.rarity}</div>
        <div>${esc(r.n)}</div>
        <div class="muted" style="font-size:10px;margin-top:3px">${esc(r.q)}</div>
      </div>`).join('');
  },

  renderQuestPanel() {
    const p = this.state.player;
    const box = this.el['quest-full'];
    box.innerHTML = QUESTS.map((q) => {
      const prog = p.quests[q.id];
      const pr = prog ? questProgress(this.state, q) : null;
      const st = prog ? prog.state : 'none';
      let btn = '';
      if (st === 'none') btn = `<button class="btn btn-mini" data-q="${q.id}" data-a="accept">รับเควสต์</button>`;
      else if (st === 'done') btn = `<button class="btn btn-mini btn-primary" data-q="${q.id}" data-a="claim">ส่งเควสต์</button>`;
      else if (st === 'claimed') btn = '<span class="small" style="color:#41d17c">เสร็จแล้ว ✓</span>';
      else btn = '<span class="small muted">กำลังทำอยู่</span>';
      return `<div class="q-row ${st === 'claimed' ? 'done' : ''}">
        <h4><span>${q.icon} ${esc(q.title)}</span>${btn}</h4>
        <div class="giver">ผู้ให้เควสต์: ${esc(q.giver)}</div>
        <p>${esc(q.brief)}</p>
        ${pr ? `<div class="obj">ความคืบหน้า: <b>${pr.cur}/${pr.need}</b> ${esc(pr.text)} ${pr.done ? '✓' : ''}</div>` : ''}
        <div class="rw">รางวัล: ${q.reward.exp} EXP · ${q.reward.gold} เงิน${(q.reward.items || []).map(([i, n]) => ` · ${ITEMS[i]?.icon || ''}${esc(ITEMS[i]?.name || i)} ×${n}`).join('')}</div>
      </div>`;
    }).join('');
    box.querySelectorAll('[data-a]').forEach((b) => {
      b.onclick = () => {
        if (b.dataset.a === 'accept') this.h.onAcceptQuest(b.dataset.q);
        if (b.dataset.a === 'claim') this.h.onCompleteQuest(b.dataset.q);
        this.renderQuestPanel();
      };
    });
  },

  renderAchievements() {
    const p = this.state.player;
    const s = achievementSummary(p);
    this.el['ach-summary'].innerHTML =
      `<b>${s.got}/${s.total}</b> ปลดล็อกแล้ว (${s.pct}%)<div class="ach-bar"><i style="width:${s.pct}%"></i></div>`;
    this.el['ach-list'].innerHTML = ACHIEVEMENTS.map((a) => {
      const pr = achievementProgress(p, a);
      const done = pr.done;
      return `<div class="ach-row ${done ? 'done' : ''}">
        <div class="ach-icon">${done ? a.icon : '🔒'}</div>
        <div class="ach-main">
          <div class="ach-name">${esc(a.name)}</div>
          <div class="ach-desc">${esc(a.desc)}</div>
          <div class="ach-bar"><i style="width:${Math.min(100, (pr.cur / pr.need || pr.cur / pr.goal) * 100)}%"></i></div>
        </div>
        <div class="ach-prog">${fmtNum(pr.cur)}/${fmtNum(pr.goal)}</div>
      </div>`;
    }).join('');
  },

  buildSettings() {
    const box = this.el['settings-list'];
    if (!box) return;
    const S = this.deps.Settings;
    box.innerHTML = SETTINGS_SCHEMA.map((row) => {
      const v = S.get(row.k);
      let ctl = '';
      if (row.type === 'range') {
        ctl = `<input type="range" min="${row.min}" max="${row.max}" step="${row.step}" value="${v}" data-k="${row.k}">
               <span class="sv" data-v="${row.k}">${row.fmt(v)}</span>`;
      } else if (row.type === 'bool') {
        ctl = `<label class="sw"><input type="checkbox" data-k="${row.k}" ${v ? 'checked' : ''}><span></span></label>`;
      } else if (row.type === 'select') {
        ctl = `<select data-k="${row.k}">${row.options.map(([val, lab]) =>
          `<option value="${val}" ${String(v) === String(val) ? 'selected' : ''}>${lab}</option>`).join('')}</select>`;
      }
      return `<div class="set-row"><div class="set-label">${row.label}</div><div class="set-ctl">${ctl}</div></div>`;
    }).join('');

    box.querySelectorAll('[data-k]').forEach((inp) => {
      const k = inp.dataset.k;
      const commit = () => {
        let v;
        if (inp.type === 'checkbox') v = inp.checked;
        else if (inp.type === 'range') v = Number(inp.value);
        else v = isNaN(Number(inp.value)) ? inp.value : Number(inp.value);
        S.set(k, v);
        S.apply(this.deps.Audio);
        const lab = box.querySelector(`[data-v="${k}"]`);
        if (lab) {
          const row = SETTINGS_SCHEMA.find((r) => r.k === k);
          lab.textContent = row.fmt(v);
        }
        if (k === 'particles') this.deps.Particles.quality = v;
        if (k === 'shake') {
          this.deps.Camera.enabled = v > 0;
          this.deps.Camera.scale = Number(v) || 0;
        }
        if (k === 'dayNight') this.deps.DayNight.enabled = v;
        if (k === 'showNames' && !v && this.tagMap.size) {
          for (const e of this.tagMap.values()) e.remove();
          this.tagMap.clear();
        }
      };
      inp.addEventListener('input', commit);
      inp.addEventListener('change', commit);
    });
  },

  renderStats() {
    const p = this.state.player;
    const s = this.state;
    const need = needXp(p.lvl);
    const mins = Math.floor(s.time / 60);
    const rank = pvpRank(p);
    const rows = [
      ['ชื่อ', esc(p.name)], ['อาชีพ', p.cls.name], ['เลเวล', p.lvl],
      ['ยศประลอง PvP', `${rank.title} (+${rank.bonusAtk} ATK)`],
      ['EXP', `${Math.floor(p.exp)} / ${need}`],
      ['HP', `${Math.round(p.hp)} / ${p.maxHp}`], ['MP', `${Math.round(p.mp)} / ${p.maxMp}`],
      ['ATK (รวมบัฟ/ตีบวก)', Math.round(effAtk(p))], ['DEF', p.def],
      ['SPD (รวมบัฟ)', Math.round(effSpd(p))], ['LUCK', p.luck],
      ['โอกาสดรอป', `×${dropBonus(p).toFixed(2)}`],
      ['', ''], ['sec', '— สถิติตลอดชีพ —'],
      ['สังหารทั้งหมด', p.kills_total], ['ตายทั้งหมด', p.deaths],
      ['ชนะ PvP บอท', p.ctr.pvpWins || 0],
      ['หอคอยบั๊กสูงสุด', `ชั้น ${p.ctr.towerFloor || 0}`],
      ['เก็บไอเทม', p.dropsTotal], ['เปิดกาชา', p.totalPulls],
      ['pity ปัจจุบัน', `${p.pity}/${GACHA.pity}`],
      ['เดินสะสม', `${Math.floor(p.ctr.distance || 0).toLocaleString()} หน่วย`],
      ['ปราบบอสโลก', p.ctr.bossKills || 0],
      ['ขโมยคิลสำเร็จ', p.ctr.stolenKills || 0],
      ['เตะมอนออก', p.ctr.banished || 0],
      ['อัพเกรดสำเร็จ/ล้มเหลว', `${p.ctr.upgradeOk || 0} / ${p.ctr.upgradeFail || 0}`],
      ['เวลาเล่น', `${mins} นาที`],
      ['', ''], ['sec', '— สกุลเงิน —'],
      ['เงิน', Math.floor(p.gold).toLocaleString()],
      ['เงินสูงสุดที่เคยถือ', Math.floor(p.maxGold || 0).toLocaleString()],
      ['เพชร', p.gems], ['ตั๋วกาชา', p.tickets],
      ['หินอัพเกรด', countItem(p, UPGRADE.stoneItem)],
      ['ยันต์กันแตก', countItem(p, UPGRADE.protectItem)],
      ['เปลือกหอย', countItem(p, 'shell')],
    ];
    this.el['stats-body'].innerHTML = rows.map(([k, v]) => {
      if (k === 'sec') return `<div class="sec">${v}</div>`;
      if (!k) return '<hr>';
      return `<span>${k}</span><b>${v}</b>`;
    }).join('');
  },

  /* ── ไดอะล็อก NPC ── */
  showDialog(npc, state) {
    this.dialogNpc = npc;
    this.dialogLine = 0;
    const el = this.el;
    el.dialog.classList.remove('hidden');
    el['dlg-name'].textContent = npc.name + (npc.def.gm ? ' [GM]' : '');
    const cv = el['dlg-canvas'];
    const g = cv.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.fillStyle = '#0a0d18'; g.fillRect(0, 0, 48, 48);
    const sp = SPR[npc.sprite] || SPR['npc_elder'];
    g.drawImage(sp.frames[0], 0, 0, 16, 16, 0, 0, 48, 48);
    this.renderDialogActions(state);
  },

  renderDialogActions(state) {
    const npc = this.dialogNpc;
    if (!npc) return;
    const p = state.player;
    const lines = npc.def.lines || ['...'];
    this.el['dlg-text'].textContent = lines[this.dialogLine % lines.length];

    const acts = [{ a: 'talk', label: 'คุยต่อ' }];
    for (const qid of (npc.def.quests || [])) {
      const q = questById(qid);
      const prog = p.quests[qid];
      if (!prog) acts.push({ a: 'accept', q: qid, label: `รับเควสต์: ${q.title}` });
      else if (prog.state === 'done') acts.push({ a: 'claim', q: qid, label: `ส่งเควสต์: ${q.title}`, primary: true });
    }
    if (npc.def.shop) acts.push({ a: 'shop', label: 'ดูร้านค้า' });
    acts.push({ a: 'close', label: 'ลา' });

    const box = this.el['dlg-actions'];
    box.innerHTML = '';
    acts.forEach((x) => {
      const b = document.createElement('button');
      b.className = 'btn btn-mini' + (x.primary ? ' btn-primary' : '');
      b.textContent = x.label;
      b.onclick = () => {
        if (x.a === 'talk') { this.dialogLine++; this.renderDialogActions(state); }
        else if (x.a === 'accept') { this.h.onAcceptQuest(x.q); this.renderDialogActions(state); }
        else if (x.a === 'claim') { this.h.onCompleteQuest(x.q); this.renderDialogActions(state); }
        else if (x.a === 'shop') this.showShop(state);
        else this.hideDialog();
      };
      box.appendChild(b);
    });
  },

  showShop(state) {
    const p = state.player;
    const stock = [['hp_potion', 45], ['mp_potion', 35], ['exp_drink', 140], ['upgrade_stone', 220],
      ['protect_charm', 550], ['capture_ball', 95], ['pet_potion', 65], ['hp_potion_fake', 3], ['bread_expired', 2]];
    this.el['dlg-text'].innerHTML = 'ร้านค้า (ของแท้ 100% · ของก๊อป 60%)<br><span class="small muted">'
      + stock.map(([id, price]) => `${ITEMS[id].icon} ${esc(ITEMS[id].name)} — ${price} เงิน`).join('<br>')
      + `</span><br><span class="small muted">เงินของคุณ: ${Math.floor(p.gold).toLocaleString()}</span>`;
    const box = this.el['dlg-actions'];
    box.innerHTML = '';
    stock.forEach(([id, price]) => {
      const b = document.createElement('button');
      b.className = 'btn btn-mini';
      b.textContent = `ซื้อ ${ITEMS[id].name} (${price})`;
      b.onclick = () => {
        if (p.gold < price) { this.toast('เงินไม่พอ', 'bad'); this.deps.Audio?.play('error'); return; }
        p.gold -= price; addItem(p, id, 1);
        this.deps.Audio?.play('coin');
        this.toast(`ซื้อ ${ITEMS[id].name} แล้ว`, 'good');
        this.showShop(state);
      };
      box.appendChild(b);
    });
    const back = document.createElement('button');
    back.className = 'btn btn-mini btn-ghost';
    back.textContent = 'กลับ';
    back.onclick = () => this.renderDialogActions(state);
    box.appendChild(back);
  },

  hideDialog() {
    this.el.dialog.classList.add('hidden');
    this.dialogNpc = null;
  },

  /* ── ป๊อปอัป ── */
  toast(text, kind = '') {
    const d = document.createElement('div');
    d.className = 'toast ' + kind;
    d.textContent = text;
    this.el['toasts'].appendChild(d);
    while (this.el['toasts'].children.length > 5) this.el['toasts'].removeChild(this.el['toasts'].firstChild);
    setTimeout(() => d.remove(), 3100);
  },

  lootFeed(itemId, qty) {
    const d = ITEMS[itemId]; if (!d) return;
    const e = document.createElement('div');
    e.className = 'lf';
    e.innerHTML = `${d.icon} <b>${esc(d.name)}</b>${qty > 1 ? ` ×${qty}` : ''}`;
    this.el['loot-feed'].appendChild(e);
    while (this.el['loot-feed'].children.length > 8) this.el['loot-feed'].removeChild(this.el['loot-feed'].firstChild);
    setTimeout(() => e.remove(), 2600);
  },

  floatText(state, x, y, text, color) {
    this._floatSeq = (this._floatSeq || 0) + 1;
    state.floaters.push({
      uid: 'u' + this._floatSeq,
      x, y, text, color, size: 1, t: 0, dur: 0.9, vy: -26,
    });
  },

  levelUp(lvl) {
    const e = this.el['levelup'];
    e.innerHTML = `เลเวลอัพ!<div style="font-size:22px">Lv.${lvl}</div>`;
    e.classList.remove('hidden');
    e.style.animation = 'none'; void e.offsetWidth; e.style.animation = '';
    setTimeout(() => e.classList.add('hidden'), 2000);
  },

  bossAlert(text) {
    const e = this.el['boss-alert'];
    e.textContent = text;
    e.classList.remove('hidden');
    e.style.animation = 'none'; void e.offsetWidth; e.style.animation = '';
    setTimeout(() => e.classList.add('hidden'), 4200);
  },

  showDeath(byName, quote) {
    this.el['death-by'].textContent = `ถูกสังหารโดย ${byName}`;
    this.el['death-quote'].textContent = quote;
    this.el['death'].classList.remove('hidden');
  },
  hideDeath() { this.el['death'].classList.add('hidden'); },

  showPause(on) {
    this.el['pause'].classList.toggle('hidden', !on);
  },

  showFatal(err, retry) {
    this._fatalRetry = retry;
    this.el['fatal-msg'].textContent = String(err && err.message ? err.message : err).slice(0, 220);
    this.el['fatal'].classList.remove('hidden');
  },
  hideFatal() { this.el['fatal'].classList.add('hidden'); },

  resetForNewRun() {
    this.lastChatId = 0;
    this.el['chat-log'].innerHTML = '';
    this.el['floaters'].innerHTML = '';
    this.el['toasts'].innerHTML = '';
    this.el['loot-feed'].innerHTML = '';
    this.el['gacha-result'].innerHTML = '<span class="muted small">ผลการเปิดกาชาจะแสดงที่นี่</span>';
    this.tagMap.clear();
    this.floatMap.clear();
    this._qSig = null; this._barV = {}; this._numV = {}; this._lv = -1; this._idStr = '';
    this._petSig = null; this._targetSig = null; this._autoSig = null;
    this._aqSig = null;
    this._hpDanger = null;
    this._zoneT = null;
    this._floatSeq = 0;
    this.hideAdvance();
    this.hideDeath();
    this.hideDialog();
    this.showPause(false);
    this.closePanels();
  },
};

function needXp(lvl) { return Math.floor(70 * Math.pow(lvl, 1.5)) + 30; }
function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
function fmtNum(n) { return n >= 10000 ? (n / 1000).toFixed(1) + 'k' : String(n); }
function el_on(node, ev, fn) { if (node) node.addEventListener(ev, fn); }
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
