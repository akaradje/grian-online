/* ═══════════════════════════════════════════════════════════
   net.js — เคลียนต์ multiplayer แบบเรียลไทม์ (zero dependency)
   · หลัก: WebSocket (/ws) · fallback: SSE (/api/stream) + POST (/api/*)
   · ซิงค์ผู้เล่นข้ามแท็บ/เครื่อง: เดิน ตีมอน ร่ายสกิล แชทโลก PK
   ═══════════════════════════════════════════════════════════ */

export const Net = {
  peers: new Map(),        // peerId -> peer state (จากเซิร์ฟเวอร์)
  connected: false,
  mode: 'ws',              // 'ws' | 'sse'
  myId: null,
  _started: false,
  state: null,

  init(state) {
    if (this._started) return;
    this._started = true;
    this.state = state;
    this.myId = 'p_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    this._syncT = 0;
    this._connectWs();
    // ถ้า WS ต่อไม่ได้ใน 2.5 วิ (reverse proxy บล็อก upgrade) → SSE fallback
    this._sseTimer = setTimeout(() => { if (!this.connected) this._connectSse(); }, 2500);
  },

  /* ── WebSocket (/ws) ── */
  _connectWs() {
    try {
      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${proto}//${location.host}/ws`);
      this.ws = ws;
      ws.onopen = () => {
        this.connected = true;
        this.mode = 'ws';
        clearTimeout(this._sseTimer);
        if (this.state?.screen === 'play') this.sendSync();
      };
      ws.onmessage = (ev) => {
        try { this._onMsg(JSON.parse(ev.data)); } catch (e) {}
      };
      ws.onclose = () => {
        if (this.mode === 'ws') { this.connected = false; this._connectSse(); }
      };
      ws.onerror = () => {};
    } catch (e) {
      this._connectSse();
    }
  },

  /* ── SSE fallback (/api/stream) — EventSource ต่อเองอัตโนมัติ ── */
  _connectSse() {
    if (this.mode === 'sse' && this.sse) return;
    this.mode = 'sse';
    try {
      const sse = new EventSource('/api/stream');
      this.sse = sse;
      sse.onopen = () => { this.connected = true; };
      sse.onmessage = (ev) => {
        try { this._onMsg(JSON.parse(ev.data)); } catch (e) {}
      };
      sse.onerror = () => { this.connected = false; };   // EventSource retry เอง
    } catch (e) {
      this.connected = false;
    }
  },

  /* ── ข้อความจากเซิร์ฟเวอร์ ── */
  _onMsg(m) {
    if (!m || !m.type) return;
    switch (m.type) {
      case 'init':
        this.peers.clear();
        for (const p of m.peers || []) if (p.id !== this.myId) this.peers.set(p.id, p);
        for (const c of m.recentChats || []) this.state?.onNetChat?.(c);
        this.connected = true;
        break;
      case 'peer_update':
        if (m.peer && m.peer.id !== this.myId) {
          const old = this.peers.get(m.peer.id);
          // เก็บ renderX/Y ไว้คั่นฯ (interpolation ไม่กระโดดตอนอัปเดต)
          this.peers.set(m.peer.id, old ? { ...old, ...m.peer } : m.peer);
        }
        break;
      case 'peers':
        this.peers.clear();
        for (const p of m.list || []) if (p.id !== this.myId) this.peers.set(p.id, p);
        break;
      case 'peer_leave':
        this.peers.delete(m.peerId);
        break;
      case 'chat':
        this.state?.onNetChat?.(m);
        break;
      case 'action':
        if (m.peerId && m.peerId !== this.myId) {
          const pr = this.peers.get(m.peerId);
          if (pr) pr.lastAction = m;   // เก็บไว้ (PK/เอฟเฟกต์อนาคต)
        }
        break;
    }
  },

  /* ── เฟรมละครั้ง: sync ตัวเอง ~8 ครั้ง/วินาที + คั่นตำแหน่ง peer ── */
  update(state, dt) {
    this._syncT = (this._syncT || 0) - dt;
    if (state.screen === 'play' && state.player && this._syncT <= 0) {
      this._syncT = 0.125;
      this.sendSync();
    }
    for (const p of this.peers.values()) {
      if (p.renderX === undefined) { p.renderX = p.x; p.renderY = p.y; }
      const k = Math.min(1, dt * 10);
      p.renderX += (p.x - p.renderX) * k;
      p.renderY += (p.y - p.renderY) * k;
    }
  },

  _myPeer(state) {
    const p = state.player;
    return {
      id: this.myId,
      name: p.name || 'ผู้กล้าออนไลน์',
      clsId: p.clsId || 'loot',
      advId: p.advId || null,
      lvl: p.lvl || 1,
      mapId: state.mapId || 'field',
      x: Math.round(p.x), y: Math.round(p.y),
      dir: p.dir === -1 ? -1 : 1,
      frame: p.frame ? 1 : 0,
      hp: Math.max(0, Math.round(p.hp)),
      maxHp: Math.max(1, Math.round(p.maxHp)),
      atk: Math.round(p.atk || 15),
      auraLvl: Math.max(p.equip?.weapon?.lvl || 0, p.equip?.armor?.lvl || 0, p.equip?.acc?.lvl || 0),
      pvpMode: !!state.pvpMode,
      petId: p.activePet || null,
    };
  },

  /* ── ส่งสถานะตัวเองขึ้นเซิร์ฟเวอร์ (ตอบกลับ peers ทั้งหมด) ── */
  sendSync() {
    const state = this.state;
    if (!state || !state.player || state.screen !== 'play') return;
    const body = { type: 'sync', peer: this._myPeer(state) };
    fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
      .then((r) => r.json())
      .then((res) => {
        if (res && res.peers) {
          for (const pr of res.peers) {
            if (pr.id === this.myId) continue;
            const old = this.peers.get(pr.id);
            this.peers.set(pr.id, old ? { ...old, ...pr } : pr);
          }
        }
      })
      .catch(() => {});
  },

  /* ── บroudcast การกระทำ (attack / skill) ── */
  sendAction(kind, opts = {}) {
    const state = this.state;
    if (!state || !state.player) return;
    const p = state.player;
    fetch('/api/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'action', peerId: this.myId, mapId: state.mapId || 'field',
        kind, skillId: opts.skillId || null,
        x: Math.round(p.x), y: Math.round(p.y),
        targetPeerId: opts.targetPeerId || null, dmg: opts.dmg || 0,
      }),
    }).catch(() => {});
  },

  /* ── แชทโลก ── */
  sendChat(ch, name, text) {
    fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'chat', ch, name, text, peerId: this.myId }),
    }).catch(() => {});
  },

  /* ── ผู้เล่นในแมพเดียวกัน (สำหรับเรนเดอร์ + nametag + แผง V) ── */
  sameMapPeers(state) {
    const mid = state?.mapId || 'field';
    const out = [];
    for (const p of this.peers.values()) if (p.mapId === mid) out.push(p);
    return out;
  },
};
