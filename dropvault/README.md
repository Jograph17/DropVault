# DropVault — P2P File Sharing

Zero-server-storage file transfer. Files go directly browser → browser via WebRTC.  
The server only brokers the handshake (WebSocket signaling) — it never touches your files.

```
dropvault/
├── server.js          ← Node.js WebSocket signaling + static server
├── package.json
├── public/
│   └── index.html     ← Full frontend (single file, no build step)
└── README.md
```

---

## Run locally

```bash
npm install
npm start
# → open http://localhost:3000
```

---

## Deploy to Railway (free, 2 minutes)

1. Push this folder to a GitHub repo
2. Go to https://railway.app → New Project → Deploy from GitHub
3. Select your repo — Railway auto-detects Node.js
4. Click Deploy — done. Railway gives you a public HTTPS URL.

No environment variables needed.

---

## Deploy to Render (free tier)

1. Push to GitHub
2. https://render.com → New → Web Service → Connect repo
3. Build command: `npm install`
4. Start command: `npm start`
5. Deploy.

Free tier spins down after 15 min idle — upgrade ($7/mo) for always-on.

---

## Deploy to Fly.io

```bash
npm install -g flyctl
fly auth login
fly launch          # follow prompts, pick a region
fly deploy
```

---

## How it works

```
Sender                  Server (signaling only)           Receiver
  |                            |                             |
  |── WS: create ─────────────>|                             |
  |<─ WS: {code: "X7KQ2M"} ───|                             |
  |                            |<── WS: join {code} ─────────|
  |<─ WS: receiver_joined ─────|─── WS: joined ─────────────>|
  |── WS: offer (SDP) ─────────|──────────────────────────── >|
  |<─ WS: answer (SDP) ────────|<────────────────────────────|
  |── WS: ICE candidates ──────|──────────────────────────── >|
  |<─ WS: ICE candidates ──────|<────────────────────────────|
  |                            |                             |
  |════════════ WebRTC DataChannel (direct P2P) ════════════ |
  |──────── file chunks (256 KB each, DTLS encrypted) ──────>|
```

After the handshake the server is no longer involved.

---

## Add TURN (for strict firewalls)

If some users can't connect (corporate NAT, symmetric NAT), add a TURN server.  
Free option — Metered Open Relay:

In `public/index.html`, find `ICE_SERVERS` and add:

```js
{
  urls: 'turn:openrelay.metered.ca:80',
  username: 'openrelayproject',
  credential: 'openrelayproject'
}
```

For production use your own TURN (coturn on a $5 VPS, or Twilio TURN).

---

## Limits

| Thing          | Limit |
|----------------|-------|
| File size      | None (chunked streaming) |
| Room TTL       | 1 hour |
| Simultaneous rooms | Unlimited (RAM-bound) |
| Files per transfer | Unlimited (queue) |

---

## License

MIT
