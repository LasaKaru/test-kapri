# VERDANT — Deploy Guide

VERDANT has **two independent pieces**:

1. **The game (static client)** — `index.html`, `game.html`, `css/`, `js/`,
   `assets/`. Pure static files. This is the whole single-player game.
2. **The online server (optional)** — `server/`. A pure-Node service that adds
   the **leaderboard**, **live chat**, and **co-op**. Zero npm dependencies.

> **Key promise:** the client never depends on the server. If you deploy *only*
> the static files, everything works — it just shows **OFFLINE** for the online
> bits. Add the server whenever you want online features.

Pick the path that fits you.

---

## Option A — Static only (fastest, free)

Host the repo's static files anywhere. Online features show "offline".

### GitHub Pages
1. Push the repo to GitHub.
2. **Settings → Pages → Build and deployment → Source: Deploy from a branch**,
   pick `main` / root.
3. Open `https://<user>.github.io/<repo>/`. Done.

### Netlify / Vercel / Cloudflare Pages
1. "Add new site → Import from Git", select the repo.
2. **Build command:** *(none)* · **Publish directory:** `/` (repo root).
3. Deploy.

> Drag-and-drop also works: zip the repo root (excluding `server/`) and drop it
> onto Netlify.

---

## Option B — Full server (leaderboard + chat + co-op)

The server **also serves the static client**, so one process gives you the whole
thing at `http://<host>:8080/`.

### 1. Run it locally
```bash
node server/server.js          # http://localhost:8080
```
No install step — there are no dependencies. Requires Node 16+.

### 2. Docker (recommended for servers)
```bash
docker build -t verdant .
docker run -d --name verdant -p 80:8080 \
  -v verdant-data:/app/server/data \
  --restart unless-stopped verdant
```
- `-v verdant-data:/app/server/data` persists the leaderboard across restarts.
- Visit `http://<host>/`.

### 3. A bare VPS with systemd
```bash
# as a deploy user, with the repo in /opt/verdant
sudo tee /etc/systemd/system/verdant.service >/dev/null <<'UNIT'
[Unit]
Description=VERDANT server
After=network.target
[Service]
WorkingDirectory=/opt/verdant
ExecStart=/usr/bin/node server/server.js
Environment=PORT=8080
Restart=always
User=deploy
[Install]
WantedBy=multi-user.target
UNIT
sudo systemctl enable --now verdant
```

### 4. PaaS (Render / Railway / Fly.io)
- **Start command:** `node server/server.js`
- **No build command.** **Port:** `8080` (or read `$PORT` — the server already does).
- Add a **persistent disk/volume** mounted at `server/data` for the leaderboard.
- WebSockets (chat/co-op) work out of the box on these platforms.

---

## HTTPS + WebSockets behind nginx

For a custom domain with TLS, terminate HTTPS at nginx and proxy to the Node
process. **The `Upgrade` headers are required** for chat/co-op WebSockets:

```nginx
server {
  listen 443 ssl;
  server_name verdant.example.com;
  # ssl_certificate ... ; ssl_certificate_key ... ;

  location / {
    proxy_pass http://127.0.0.1:8080;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;       # WebSocket
    proxy_set_header Connection "upgrade";        # WebSocket
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $remote_addr; # used by rate limiter
  }
}
```

---

## Configuration (env vars)

| Var | Default | Purpose |
| --- | ------- | ------- |
| `PORT` | `8080` | Listen port |
| `RL_MAX` | `120` | Max API requests / window per IP (`0` disables) |
| `RL_WINDOW` | `10000` | Rate-limit window in ms |
| `CLUSTER` | *(off)* | `auto` (one HTTP worker per core) or a number |

### Scaling for heavy traffic
- The leaderboard API is the hot path. It serves from an **in-memory cache** over
  an **append-only log**, so reads never hit disk.
- **Vertically:** `CLUSTER=auto node server/server.js` forks one HTTP worker per
  core; workers stay consistent via the shared append-only file.
- **Horizontally:** run multiple instances behind a load balancer. For the
  leaderboard, point them at a shared volume (or swap the JSONL store for a DB).
  **Realtime (chat/co-op) must use sticky sessions** (or a single realtime
  instance) because room state is in-process — run one non-clustered instance for
  `/api/chat` + `/api/coop`, and clustered instances for the rest.

---

## Pointing a separately-hosted client at your server

If the game is on a static host (Option A) and the server is elsewhere, tell the
client where the API is — set **either** before `js/game/game.js` loads:

```html
<script>window.VERDANT_SERVER = 'https://verdant.example.com/api';</script>
```
or from the browser console / your own settings:
```js
localStorage.setItem('verdant_server', 'https://verdant.example.com/api');
```

With nothing set, the client tries the **same origin** `/api` (which is exactly
what Option B serves), and otherwise falls back to **offline** — never breaking
single-player.
