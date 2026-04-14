// DropVault — WebSocket Signaling Server
// Brokers WebRTC handshakes between peers. Never sees your files.
// Deploy on Railway / Render / Fly.io / any Node host.

const http = require('http');
const { WebSocketServer } = require('ws');
const crypto = require('crypto');
const fs   = require('fs');
const path = require('path');

const PUBLIC = path.join(__dirname, 'public');

const PORT = process.env.PORT || 3000;

// Room map: code → { sender: ws, receiver: ws }
const rooms = new Map();

// Clean up stale rooms every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (now - room.created > 60 * 60 * 1000) {          // 1 hour TTL
      rooms.delete(code);
    }
  }
}, 10 * 60 * 1000);

// ── HTTP server (health check + serve a minimal status page) ──
const MIME = { '.html':'text/html', '.css':'text/css', '.js':'application/javascript', '.ico':'image/x-icon', '.png':'image/png', '.svg':'image/svg+xml' };

const server = http.createServer((req, res) => {
  // Health check
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', rooms: rooms.size, uptime: process.uptime() }));
    return;
  }

  // Serve static files from /public
  let urlPath = req.url.split('?')[0];
  if (urlPath === '/' || urlPath === '') urlPath = '/index.html';
  const filePath = path.join(PUBLIC, urlPath);

  // Security: must stay within PUBLIC dir
  if (!filePath.startsWith(PUBLIC)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      // Fallback to index.html for SPA-style routing
      fs.readFile(path.join(PUBLIC, 'index.html'), (err2, html) => {
        if (err2) { res.writeHead(404); res.end('Not found'); return; }
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(html);
      });
      return;
    }
    const ext  = path.extname(filePath);
    const mime = MIME[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime });
    res.end(data);
  });
});

// ── WebSocket server ──────────────────────────────────────────
const wss = new WebSocketServer({ server });

function genCode() {
  // 6 alphanumeric chars, easy to read/type
  return crypto.randomBytes(4).toString('hex').slice(0, 6).toUpperCase();
}

function send(ws, obj) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj));
}

wss.on('connection', (ws, req) => {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  ws._role = null;
  ws._code = null;

  console.log(`[+] Client connected from ${ip}`);

  ws.on('message', raw => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    // ── SENDER creates a room ─────────────────────────────────
    if (msg.type === 'create') {
      let code;
      // ensure unique code
      do { code = genCode(); } while (rooms.has(code));

      rooms.set(code, { sender: ws, receiver: null, created: Date.now() });
      ws._role = 'sender';
      ws._code = code;

      send(ws, { type: 'created', code });
      console.log(`[room] Created ${code}`);
      return;
    }

    // ── RECEIVER joins a room ─────────────────────────────────
    if (msg.type === 'join') {
      const code = (msg.code || '').toUpperCase().trim();
      const room = rooms.get(code);

      if (!room) {
        send(ws, { type: 'error', message: 'Room not found. Check the code and try again.' });
        return;
      }
      if (room.receiver) {
        send(ws, { type: 'error', message: 'Room is full (someone already joined).' });
        return;
      }

      room.receiver = ws;
      ws._role = 'receiver';
      ws._code = code;

      send(ws, { type: 'joined', code });
      // Tell sender someone joined — trigger offer creation
      send(room.sender, { type: 'receiver_joined' });
      console.log(`[room] ${code} — receiver joined`);
      return;
    }

    // ── RELAY: offer / answer / ice ───────────────────────────
    if (['offer', 'answer', 'ice'].includes(msg.type)) {
      const code = ws._code;
      const room = rooms.get(code);
      if (!room) return;

      if (ws._role === 'sender' && room.receiver) {
        send(room.receiver, msg);
      } else if (ws._role === 'receiver' && room.sender) {
        send(room.sender, msg);
      }
      return;
    }

    // ── TRANSFER COMPLETE notification ────────────────────────
    if (msg.type === 'transfer_complete') {
      const code = ws._code;
      const room = rooms.get(code);
      if (!room) return;
      const other = ws._role === 'sender' ? room.receiver : room.sender;
      send(other, { type: 'transfer_complete' });
    }
  });

  ws.on('close', () => {
    const code = ws._code;
    if (!code) return;
    const room = rooms.get(code);
    if (!room) return;

    const other = ws._role === 'sender' ? room.receiver : room.sender;
    if (other) send(other, { type: 'peer_disconnected' });

    // If sender left, kill the room
    if (ws._role === 'sender') {
      rooms.delete(code);
      console.log(`[room] ${code} closed (sender left)`);
    } else {
      room.receiver = null;
      console.log(`[room] ${code} receiver left`);
    }
  });

  ws.on('error', err => console.error(`[ws error] ${err.message}`));
});

server.listen(PORT, () => {
  console.log(`DropVault signaling server on :${PORT}`);
});
