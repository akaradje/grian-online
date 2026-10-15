/* ═══════════════════════════════════════════════════════════
   net.js — ระบบเครือข่ายผู้เล่นหลายคนแบบเรียลไทม์ (Real-Time Multiplayer Client v2.0.1)
   รองรับ:
   1) Native WebSocket (/ws) สำหรับซิงค์ตำแหน่ง ท่าโจมตี และแชทโลกแบบความหน่วงต่ำ
   2) Server-Sent Events (/api/stream) + HTTP POST (/api/sync, /api/chat, /api/action)
      เป็น Fallback อัตโนมัติเมื่อรันหลัง Reverse Proxy ที่บล็อก WebSocket
   3) การเกลี่ยตำแหน่งผู้เล่นอื่นแบบนุ่มนวล (Smooth Lerp Interpolation)
   ═══════════════════════════════════════════════════════════ */

import { playerAura } from './entities.js';
import { Particles } from './fx.js';

export const Net = {
  state: null,
  peerId: 'p_' + Math.random().toString(36).slice(2, 10),
  peers: new Map(),
  connected: false,
  mode: 'offline', // 'ws' | 'sse' | 'offline'
  ws: null,
  es: null,
  _syncTimer: 0,
  _lastSentKey: '',
  _seenChats: new Set(),
  _reconnTimer: null,

  init(state) {
    this.state = state;
    if (typeof window === 'undefined') return;
    this._connectWS();
    window.addEventListener('beforeunload', () => {
      try {
        const payload = JSON.stringify({ type: 'leave', peerId: this.peerId });
        if (this.ws && this.ws.readyState === 1) this.ws.send(payload);
        else if (navigator.sendBeacon) navigator.sendBeacon('/api/sync', payload);
      } catch (e) {}
    });
  },

  _connectWS() {
    if (typeof WebSocket === 'undefined') {
      this._connectSSE();
      return;
    }
    try {
      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${proto}//${location.host}/ws`);
      this.ws = ws;
      let opened = false;

      const fallbackTimeout = setTimeout(() => {
        if (!opened) {
          try { ws.close(); } catch (e) {}
          this._connectSSE();
        }
      }, 2500);

      ws.addEventListener('open', () => {
        opened = true;
        clearTimeout(fallbackTimeout);
        this.connected = true;
        this.mode = 'ws';
        this.sendSync();
      });

      ws.addEventListener('message', (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          this._handleServerMsg(msg);
        } catch (e) {}
      });

      ws.addEventListener('close', () => {
        clearTimeout(fallbackTimeout);
        if (this.mode === 'ws') {
          this.connected = false;
          this.mode = 'offline';
        }
        if (!opened) {
          this._connectSSE();
        } else {
          clearTimeout(this._reconnTimer);
          this._reconnTimer = setTimeout(() => this._connectWS(), 3000);
        }
      });

      ws.addEventListener('error', () => {
        if (!opened) {
          clearTimeout(fallbackTimeout);
          try { ws.close(); } catch (e) {}
          this._connectSSE();
        }
      });
    } catch (e) {
      this._connectSSE();
    }
  },

  _connectSSE() {
    if (typeof EventSource === 'undefined') return Promise.resolve(false);
    return new Promise((resolve) => {
      try {
        if (this.es) { try { this.es.close(); } catch (e) {} }
        const es = new EventSource('/api/stream');
        this.es = es;
        let resolved = false;
        const done = (ok) => { if (!resolved) { resolved = true; resolve(ok); } };
        setTimeout(() => done(this.connected), 2000);

        es.addEventListener('open', () => {
          this.connected = true;
          this.mode = 'sse';
          this.sendSync().then(() => done(true));
        });
        es.addEventListener('message', (ev) => {
          this.connected = true;
          this.mode = 'sse';
          try {
            const msg = JSON.parse(ev.data);
            this._handleServerMsg(msg);
          } catch (e) {}
          done(true);
        });
        es.addEventListener('error', () => {
          done(false);
        });
      } catch (e) {
        resolve(false);
      }
    });
  },

  /** สลับไปใช้โหมด SSE Fallback ทันที (สำหรับเครือข่ายที่บล็อก WS หรือใช้ทดสอบอัตโนมัติ) */
  async switchToSSE() {
    clearTimeout(this._reconnTimer);
    if (this.ws) {
      this.mode = 'sse';
      try { this.ws.close(); } catch (e) {}
      this.ws = null;
    }
    const ok = await this._connectSSE();
    await this.sendSync();
    return ok;
  },

  _upsertPeer(p) {
    if (!p || !p.id || p.id === this.peerId) return;
    const prev = this.peers.get(p.id);
    if (prev) {
      p.renderX = prev.renderX ?? prev.x ?? p.x;
      p.renderY = prev.renderY ?? prev.y ?? p.y;
      p.hitFlash = prev.hitFlash || 0;
    } else {
      p.renderX = p.x;
      p.renderY = p.y;
      p.hitFlash = 0;
    }
    this.peers.set(p.id, p);
  },

  _handleServerMsg(msg) {
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'init') {
      if (Array.isArray(msg.peers)) {
        for (const p of msg.peers) this._upsertPeer(p);
      }
      if (Array.isArray(msg.recentChats)) {
        for (const c of msg.recentChats) this._deliverChat(c);
      }
      return;
    }
    if (msg.type === 'peers' && Array.isArray(msg.list)) {
      const keep = new Set();
      for (const p of msg.list) {
        if (p.id && p.id !== this.peerId) {
          keep.add(p.id);
          this._upsertPeer(p);
        }
      }
      for (const k of this.peers.keys()) {
        if (!keep.has(k)) this.peers.delete(k);
      }
      return;
    }
    if (msg.type === 'peer_update' && msg.peer) {
      this._upsertPeer(msg.peer);
      return;
    }
    if (msg.type === 'peer_leave' && msg.peerId) {
      this.peers.delete(msg.peerId);
      return;
    }
    if (msg.type === 'chat' && msg.text) {
      this._deliverChat(msg);
      return;
    }
    if (msg.type === 'action' && msg.peerId && msg.peerId !== this.peerId) {
      const peer = this.peers.get(msg.peerId);
      if (peer && this.state && peer.mapId === this.state.mapId) {
        peer.hitFlash = 0.18; peer.swingT = 0.28; peer.swingDur = 0.28;
        Particles.spawn('slash', (peer.renderX ?? peer.x) + (peer.dir || 1) * 12, (peer.renderY ?? peer.y) - 6, { dir: peer.dir || 1 });
      }
    }
  },

  _deliverChat(c) {
    if (!c || !c.text) return;
    if (c.peerId && c.peerId === this.peerId) return;
    const key = `${c.ts || 0}:${c.name}:${c.text}`;
    if (this._seenChats.has(key)) return;
    this._seenChats.add(key);
    if (this._seenChats.size > 120) {
      const first = this._seenChats.values().next().value;
      this._seenChats.delete(first);
    }
    if (this.state && typeof this.state.onNetChat === 'function') {
      this.state.onNetChat(c);
    }
  },

  _buildPeerPayload() {
    const s = this.state;
    const p = s?.player;
    if (!p) return null;
    const aura = playerAura(p);
    return {
      id: this.peerId,
      name: p.name || 'ผู้กล้าออนไลน์',
      clsId: p.clsId || 'loot',
      advId: p.advId || null,
      lvl: p.lvl || 1,
      mapId: s.mapId || 'field',
      x: Math.round(p.x || 768),
      y: Math.round(p.y || 544),
      dir: p.dir === -1 ? -1 : 1,
      frame: p.frame ? 1 : 0,
      hp: Math.round(p.hp || 100),
      maxHp: Math.round(p.maxHp || 100),
      atk: Math.round(p.atk || 15),
      auraLvl: aura ? aura.min : 0,
      pvpMode: !!s.pvpMode,
      petId: p.activePetId || null,
    };
  },

  async sendSync() {
    const peer = this._buildPeerPayload();
    if (!peer) return null;
    const msg = { type: 'sync', peer };
    if (this.ws && this.ws.readyState === 1 && this.mode === 'ws') {
      try { this.ws.send(JSON.stringify(msg)); } catch (e) {}
    }
    try {
      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(msg),
      });
      if (res.ok) {
        const data = await res.json();
        this.connected = true;
        if (this.mode === 'offline') this.mode = 'sse';
        if (Array.isArray(data.peers)) {
          for (const pr of data.peers) this._upsertPeer(pr);
        }
        return data;
      }
    } catch (e) {}
    return null;
  },

  sendChat(ch, name, text) {
    if (!text) return;
    const msg = { type: 'chat', ch: ch || 'world', name: name || 'ผู้กล้า', text, peerId: this.peerId };
    if (this.ws && this.ws.readyState === 1 && this.mode === 'ws') {
      try { this.ws.send(JSON.stringify(msg)); return; } catch (e) {}
    }
    fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(msg),
    }).catch(() => {});
  },

  sendAction(kind, extra = {}) {
    const p = this.state?.player;
    const msg = {
      type: 'action',
      peerId: this.peerId,
      mapId: this.state?.mapId || 'field',
      kind: kind || 'attack',
      x: Math.round(p?.x || 0),
      y: Math.round(p?.y || 0),
      ...extra,
    };
    if (this.ws && this.ws.readyState === 1 && this.mode === 'ws') {
      try { this.ws.send(JSON.stringify(msg)); return; } catch (e) {}
    }
    fetch('/api/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(msg),
    }).catch(() => {});
  },

  sameMapPeers(state) {
    const mapId = (state || this.state)?.mapId || 'field';
    const out = [];
    for (const peer of this.peers.values()) {
      if (peer.id !== this.peerId && (peer.mapId || 'field') === mapId) {
        out.push(peer);
      }
    }
    return out;
  },

  update(state, dt) {
    this.state = state;
    const k = Math.min(1, dt * 12);
    for (const peer of this.peers.values()) {
      const tx = peer.x ?? 768;
      const ty = peer.y ?? 544;
      if (peer.renderX === undefined || Math.hypot(tx - peer.renderX, ty - peer.renderY) > 96) {
        peer.renderX = tx;
        peer.renderY = ty;
      } else {
        peer.renderX += (tx - peer.renderX) * k;
        peer.renderY += (ty - peer.renderY) * k;
      }
      if (peer.hitFlash > 0) peer.hitFlash = Math.max(0, peer.hitFlash - dt);
      if (peer.swingT > 0) peer.swingT = Math.max(0, peer.swingT - dt);
    }

    if (state.screen !== 'play' || !state.player) return;
    this._syncTimer += dt;
    const p = state.player;
    const curKey = `${state.mapId}:${Math.round(p.x)}:${Math.round(p.y)}:${p.dir}:${p.frame}:${Math.round(p.hp)}:${p.lvl}`;
    const moved = curKey !== this._lastSentKey;
    const interval = moved ? 0.14 : 1.5;
    if (this._syncTimer >= interval) {
      this._syncTimer = 0;
      this._lastSentKey = curKey;
      const peer = this._buildPeerPayload();
      if (peer) {
        if (this.ws && this.ws.readyState === 1 && this.mode === 'ws') {
          try { this.ws.send(JSON.stringify({ type: 'sync', peer })); } catch (e) {}
        } else if (this.mode === 'sse') {
          fetch('/api/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'sync', peer }),
          }).catch(() => {});
        }
      }
    }
  },
};
