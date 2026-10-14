/* ═══════════════════════════════════════════════════════════
   serve.mjs — เซิร์ฟเวอร์เกม เกรียนออนไลน์ v2.0.0 (All-in-One: Static + Real-Time Multiplayer)
   ใช้:  node serve.mjs [พอร์ต]
   แล้วเปิด http://127.0.0.1:8731

   คุณสมบัติออนไลน์ (Zero External Dependencies — ใช้เฉพาะโมดูลมาตรฐานของ Node.js):
   1) รองรับ Native WebSocket (RFC 6455) ที่ /ws สำหรับซิงค์ผู้เล่นออนไลน์แบบเรียลไทม์
   2) รองรับ HTTP + Server-Sent Events (SSE) ที่ /api/stream, /api/sync, /api/chat, /api/status
      เป็น Fallback อัตโนมัติเมื่อรันหลัง Reverse Proxy ที่บล็อก WebSocket
   3) เสิร์ฟเฉพาะโฟลเดอร์ public/ และป้องกัน Path Traversal
   ═══════════════════════════════════════════════════════════ */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
const FROM_ENV = !!process.env.PORT;
const PORT = Number(process.env.PORT || process.argv[2] || 8731);
const HOST = process.env.HOST || (FROM_ENV ? '0.0.0.0' : '127.0.0.1');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

/* ═══════════ สถานะผู้เล่นออนไลน์ (In-Memory Real-Time Room State) ═══════════ */
const peers = new Map();       // peerId -> { id, name, clsId, advId, lvl, mapId, x, y, dir, frame, hp, maxHp, auraLvl, pvpMode, petId, lastSeen }
const wsClients = new Set();   // Set of raw net.Socket (WebSocket)
const sseClients = new Set();  // Set of http.ServerResponse (SSE)
const recentChats = [];        // เก็บแชทล่าสุด 40 ข้อความให้คนที่เพิ่งเข้าเซิร์ฟเห็น

function prunePeers() {
  const now = Date.now();
  let removed = false;
  for (const [id, p] of peers) {
    if (now - p.lastSeen > 12000) {
      peers.delete(id);
      removed = true;
    }
  }
  if (removed) broadcast({ type: 'peers', list: Array.from(peers.values()) });
}
setInterval(prunePeers, 3000).unref();

/* ── RFC 6455 WebSocket Frame Encoder / Decoder (Zero-Dependency) ── */
function encodeWsFrame(str) {
  const payload = Buffer.from(str, 'utf8');
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x81; // FIN + Text frame
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([header, payload]);
}

function decodeWsFrames(buf) {
  const msgs = [];
  let offset = 0;
  while (offset + 2 <= buf.length) {
    const b0 = buf[offset];
    const b1 = buf[offset + 1];
    const opcode = b0 & 0x0f;
    const masked = (b1 & 0x80) !== 0;
    let len = b1 & 0x7f;
    let hdrLen = 2;
    if (len === 126) {
      if (offset + 4 > buf.length) break;
      len = buf.readUInt16BE(offset + 2);
      hdrLen = 4;
    } else if (len === 127) {
      if (offset + 10 > buf.length) break;
      len = Number(buf.readBigUInt64BE(offset + 2));
      hdrLen = 10;
    }
    const maskLen = masked ? 4 : 0;
    if (offset + hdrLen + maskLen + len > buf.length) break;
    const payload = Buffer.alloc(len);
    if (masked) {
      const mask = buf.subarray(offset + hdrLen, offset + hdrLen + 4);
      const src = buf.subarray(offset + hdrLen + 4, offset + hdrLen + 4 + len);
      for (let i = 0; i < len; i++) payload[i] = src[i] ^ mask[i & 3];
    } else {
      buf.copy(payload, 0, offset + hdrLen, offset + hdrLen + len);
    }
    offset += hdrLen + maskLen + len;
    if (opcode === 0x8) { msgs.push({ close: true }); break; }
    if (opcode === 0x1) msgs.push({ text: payload.toString('utf8') });
  }
  return { msgs, rest: buf.subarray(offset) };
}

function broadcast(obj, excludeSocket = null) {
  const json = JSON.stringify(obj);
  if (wsClients.size > 0) {
    const frame = encodeWsFrame(json);
    for (const sock of wsClients) {
      if (sock === excludeSocket || sock.destroyed) continue;
      try { sock.write(frame); } catch (e) { wsClients.delete(sock); }
    }
  }
  if (sseClients.size > 0) {
    const sseData = `data: ${json}\n\n`;
    for (const res of sseClients) {
      if (res.writableEnded) { sseClients.delete(res); continue; }
      try { res.write(sseData); } catch (e) { sseClients.delete(res); }
    }
  }
}

function handleClientMsg(msg, senderSocket = null) {
  if (!msg || typeof msg !== 'object') return null;
  const now = Date.now();

  if (msg.type === 'sync' && msg.peer && msg.peer.id) {
    const p = msg.peer;
    const clean = {
      id: String(p.id).slice(0, 24),
      name: String(p.name || 'ผู้กล้าออนไลน์').slice(0, 18),
      clsId: String(p.clsId || 'loot').slice(0, 12),
      advId: p.advId ? String(p.advId).slice(0, 16) : null,
      lvl: Math.max(1, Math.min(200, Number(p.lvl) || 1)),
      mapId: ['field', 'hell', 'cyber'].includes(p.mapId) ? p.mapId : 'field',
      x: Number(p.x) || 768,
      y: Number(p.y) || 544,
      dir: p.dir === -1 ? -1 : 1,
      frame: p.frame ? 1 : 0,
      hp: Math.max(0, Number(p.hp) || 100),
      maxHp: Math.max(1, Number(p.maxHp) || 100),
      atk: Math.max(1, Number(p.atk) || 15),
      auraLvl: Math.max(0, Math.min(10, Number(p.auraLvl) || 0)),
      pvpMode: !!p.pvpMode,
      petId: p.petId ? String(p.petId).slice(0, 16) : null,
      lastSeen: now,
    };
    const isNew = !peers.has(clean.id);
    peers.set(clean.id, clean);
    if (senderSocket) senderSocket._peerId = clean.id;
    broadcast({ type: 'peer_update', peer: clean }, senderSocket);
    if (isNew) {
      broadcast({
        type: 'chat',
        ch: 'system',
        name: 'ระบบ',
        text: `🌐 ${clean.name} (Lv.${clean.lvl}) เข้าสู่เซิร์ฟเวอร์ออนไลน์แล้ว!`,
        ts: now,
      });
    }
    return { ok: true, peers: Array.from(peers.values()), onlineCount: peers.size };
  }

  if (msg.type === 'chat' && msg.text) {
    const chatObj = {
      type: 'chat',
      ch: ['world', 'trade', 'party', 'system'].includes(msg.ch) ? msg.ch : 'world',
      name: String(msg.name || 'ผู้กล้า').slice(0, 18),
      text: String(msg.text).slice(0, 140),
      peerId: String(msg.peerId || ''),
      ts: now,
    };
    recentChats.push(chatObj);
    if (recentChats.length > 40) recentChats.shift();
    broadcast(chatObj);
    return { ok: true };
  }

  if (msg.type === 'action') {
    broadcast({
      type: 'action',
      peerId: String(msg.peerId || ''),
      mapId: String(msg.mapId || 'field'),
      kind: String(msg.kind || 'attack'),
      skillId: msg.skillId ? String(msg.skillId) : null,
      x: Number(msg.x) || 0,
      y: Number(msg.y) || 0,
      targetPeerId: msg.targetPeerId ? String(msg.targetPeerId) : null,
      dmg: Number(msg.dmg) || 0,
    }, senderSocket);
    return { ok: true };
  }

  if (msg.type === 'leave' && msg.peerId) {
    peers.delete(String(msg.peerId));
    broadcast({ type: 'peer_leave', peerId: String(msg.peerId) });
    return { ok: true };
  }

  return { ok: false };
}

function readJsonBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 32768) req.destroy();
    });
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); } catch (e) { resolve({}); }
    });
    req.on('error', () => resolve({}));
  });
}

const server = http.createServer(async (req, res) => {
  const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = decodeURIComponent(urlObj.pathname);

  // CORS สำหรับกรณีรันแยกพอร์ตหรือทดสอบข้ามโดเมน
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204).end(); return; }

  /* ── API ออนไลน์ & Health Check ── */
  if (pathname === '/api/health' || pathname === '/api/status') {
    prunePeers();
    const list = Array.from(peers.values());
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({
      ok: true,
      version: '2.0.0',
      onlinePlayers: list.length,
      peers: list,
      recentChats: recentChats.slice(-15),
      uptime: Math.floor(process.uptime()),
    }));
    return;
  }

  if (pathname === '/api/stream' && req.method === 'GET') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    });
    res.write(`data: ${JSON.stringify({ type: 'init', peers: Array.from(peers.values()), recentChats: recentChats.slice(-15) })}\n\n`);
    sseClients.add(res);
    req.on('close', () => sseClients.delete(res));
    return;
  }

  if ((pathname === '/api/sync' || pathname === '/api/chat' || pathname === '/api/action') && req.method === 'POST') {
    const body = await readJsonBody(req);
    if (pathname === '/api/sync' && !body.type) body.type = 'sync';
    if (pathname === '/api/chat' && !body.type) body.type = 'chat';
    if (pathname === '/api/action' && !body.type) body.type = 'action';
    const out = handleClientMsg(body) || { ok: false };
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(out));
    return;
  }

  /* ── เสิร์ฟไฟล์ Static จาก public/ ── */
  let rel = pathname;
  if (rel === '/' || rel === '') rel = '/index.html';
  const full = path.normalize(path.join(ROOT, rel));
  if (!full.startsWith(ROOT)) { res.writeHead(403).end('forbidden'); return; }
  fs.readFile(full, (err, buf) => {
    if (err) { res.writeHead(404).end('not found: ' + rel); return; }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(full).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(buf);
  });
});

/* ── อัปเกรดการเชื่อมต่อเป็น WebSocket (RFC 6455) ที่ /ws ── */
server.on('upgrade', (req, socket) => {
  const key = req.headers['sec-websocket-key'];
  if (!key) { socket.destroy(); return; }
  const accept = crypto
    .createHash('sha1')
    .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
    .digest('base64');

  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\n' +
    'Connection: Upgrade\r\n' +
    `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
  );
  socket.setNoDelay(true);
  wsClients.add(socket);

  // ส่งข้อมูลผู้เล่นออนไลน์ปัจจุบันทันทีที่เชื่อมต่อ
  try {
    socket.write(encodeWsFrame(JSON.stringify({
      type: 'init',
      peers: Array.from(peers.values()),
      recentChats: recentChats.slice(-15),
    })));
  } catch (e) {}

  let rxBuf = Buffer.alloc(0);
  socket.on('data', (chunk) => {
    rxBuf = Buffer.concat([rxBuf, chunk]);
    if (rxBuf.length > 65536) { socket.destroy(); return; }
    const { msgs, rest } = decodeWsFrames(rxBuf);
    rxBuf = rest;
    for (const m of msgs) {
      if (m.close) { socket.end(); return; }
      if (m.text) {
        try {
          const parsed = JSON.parse(m.text);
          handleClientMsg(parsed, socket);
        } catch (e) {}
      }
    }
  });

  const cleanup = () => {
    wsClients.delete(socket);
    if (socket._peerId && peers.has(socket._peerId)) {
      peers.delete(socket._peerId);
      broadcast({ type: 'peer_leave', peerId: socket._peerId });
    }
  };
  socket.on('close', cleanup);
  socket.on('error', cleanup);
});

server.listen(PORT, HOST, () => {
  const shown = HOST === '0.0.0.0' ? '0.0.0.0' : '127.0.0.1';
  console.log(`เกรียนออนไลน์ v2.0.0 (Online Multiplayer Ready) พร้อมเล่นที่ http://${shown}:${PORT}`);
});
