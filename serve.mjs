/* เซิร์ฟเวอร์ไฟล์นิ่งสำหรับรันเกมในเครื่อง
   ใช้:  node serve.mjs [พอร์ต]
   แล้วเปิด http://127.0.0.1:8731

   เสิร์ฟเฉพาะโฟลเดอร์ public/ เพื่อไม่ให้ไฟล์ภายในโปรเจกต์
   (.workbuddy-ai/ · tools/ · shots/) ถูกเปิดเผยออกไป

   เมื่อรันบนแพลตฟอร์มโฮสต์ จะอ่านพอร์ตจาก env PORT และผูกกับ 0.0.0.0
   เมื่อรันในเครื่องจะผูกกับ 127.0.0.1 เท่านั้น (ปลอดภัยกว่า) */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
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

http.createServer((req, res) => {
  let rel = decodeURIComponent(req.url.split('?')[0]);
  if (rel === '/' || rel === '') rel = '/index.html';
  const full = path.normalize(path.join(ROOT, rel));
  // กัน path traversal ออกจากโฟลเดอร์ที่เสิร์ฟ
  if (!full.startsWith(ROOT)) { res.writeHead(403).end('forbidden'); return; }
  fs.readFile(full, (err, buf) => {
    if (err) { res.writeHead(404).end('not found: ' + rel); return; }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(full).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(buf);
  });
}).listen(PORT, HOST, () => {
  const shown = HOST === '0.0.0.0' ? '0.0.0.0' : '127.0.0.1';
  console.log(`เกรียนออนไลน์ พร้อมเล่นที่ http://${shown}:${PORT}`);
});
