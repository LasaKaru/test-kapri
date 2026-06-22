#!/usr/bin/env node
// VERDANT online server — pure Node, ZERO npm dependencies.
// Serves the static client AND a small leaderboard API + realtime (chat/co-op).
//
// Built to take load: in-memory cache, atomic append-only writes, per-IP rate
// limiting, and optional multi-core clustering (CLUSTER=auto|<n>).
//   node server/server.js                 # single process (realtime enabled)
//   CLUSTER=auto node server/server.js     # fork one HTTP worker per CPU core
//
// The client treats this as entirely optional: if the server is down, the
// game still runs as full single-player and reports "offline".
'use strict';
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const url = require('url');
const cluster = require('cluster');
const ws = require('./ws');

const PORT = process.env.PORT || 8080;
const ROOT = path.join(__dirname, '..');           // repo root (static client)
const CLUSTERED = !!process.env.CLUSTER;

// Supabase Credentials from Environment Variables
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon',
};

// ---- scores: Remote Database over REST (Zero Dependencies) ----

async function appendScore(entry) {
  if (!SUPABASE_URL) return;
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/leaderboard`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(entry)
    });
  } catch (err) {
    console.error('Supabase Write Error:', err);
  }
}

async function topScores(map, diff) {
  if (!SUPABASE_URL) return [];
  try {
    let query = `${SUPABASE_URL}/rest/v1/leaderboard?select=*&order=score.desc&limit=20`;
    
    if (map) query += `&map=eq.${map}`;
    if (diff) query += `&diff=eq.${diff}`;

    const res = await fetch(query, {
      method: 'GET',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    if (!res.ok) return [];
    return await res.json();
  } catch (err) {
    console.error('Supabase Read Error:', err);
    return [];
  }
}

function clean(s, max) { return String(s == null ? '' : s).replace(/[^A-Za-z0-9_ -]/g, '').slice(0, max); }

// ---- per-IP rate limiter (fixed window; configurable, 0 disables) ----
const RL_WINDOW = parseInt(process.env.RL_WINDOW, 10) || 10000;
const RL_MAX = process.env.RL_MAX != null ? parseInt(process.env.RL_MAX, 10) : 120;
const rl = new Map();
function rateLimited(ip) {
  if (RL_MAX <= 0) return false;
  const now = Date.now();
  let e = rl.get(ip);
  if (!e || now - e.t > RL_WINDOW) { e = { t: now, n: 0 }; rl.set(ip, e); }
  return ++e.n > RL_MAX;
}
setInterval(() => { const now = Date.now(); for (const [k, e] of rl) if (now - e.t > RL_WINDOW) rl.delete(k); }, 30000).unref();
function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}
function sendJSON(res, code, obj) { cors(res); res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); }

// NOTE: handleApi is now an async function
async function handleApi(req, res, parsed) {
  const p = parsed.pathname.replace(/^\/api/, '') || '/';
  if (req.method === 'OPTIONS') { cors(res); res.writeHead(204); return res.end(); }

  if (p === '/health') return sendJSON(res, 200, { ok: true, service: 'verdant', ts: Date.now() });

  if (p === '/leaderboard' && req.method === 'GET') {
    const q = parsed.query || {};
    const scores = await topScores(q.map, q.diff);
    return sendJSON(res, 200, { scores });
  }

  if (p === '/scores' && req.method === 'POST') {
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 4096) req.destroy(); });
    req.on('end', () => {
      let e; try { e = JSON.parse(body); } catch (_) { return sendJSON(res, 400, { error: 'bad json' }); }
      const entry = {
        name: clean(e.name, 12) || 'GHOST',
        score: Math.max(0, Math.min(9999999, parseInt(e.score, 10) || 0)),
        wave: Math.max(1, Math.min(9999, parseInt(e.wave, 10) || 1)),
        kills: Math.max(0, Math.min(99999, parseInt(e.kills, 10) || 0)),
        map: clean(e.map, 16), diff: clean(e.diff, 16),
        ts: Date.now(),
      };
      appendScore(entry);
      return sendJSON(res, 200, { ok: true });
    });
    return;
  }
  return sendJSON(res, 404, { error: 'not found' });
}

function serveStatic(req, res, parsed) {
  let pathname = decodeURIComponent(parsed.pathname);
  if (pathname === '/') pathname = '/index.html';
  const filePath = path.normalize(path.join(ROOT, pathname));
  if (!filePath.startsWith(ROOT)) { res.writeHead(403); return res.end('forbidden'); }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  });
}

// ---- live chat over WebSocket (rooms + short history + presence) ----
const rooms = new Map(); // room -> { clients:Set, history:[] }
function room(name) {
  name = clean(name, 24) || 'global';
  if (!rooms.has(name)) rooms.set(name, { clients: new Set(), history: [] });
  return rooms.get(name);
}
function broadcast(r, obj) { const s = JSON.stringify(obj); for (const c of r.clients) c.send(s); }
function presence(r) { broadcast(r, { type: 'presence', count: r.clients.size }); }

function handleChat(conn) {
  conn.onmessage = (raw) => {
    let m; try { m = JSON.parse(raw); } catch (_) { return; }
    if (m.type === 'join') {
      conn.data.name = clean(m.name, 12) || 'GHOST';
      conn.data.room = clean(m.room, 24) || 'global';
      const r = room(conn.data.room);
      r.clients.add(conn);
      conn.sendJSON({ type: 'history', messages: r.history.slice(-40) });
      presence(r);
    } else if (m.type === 'chat' && conn.data.room) {
      const text = String(m.text == null ? '' : m.text).slice(0, 240).replace(/[\u0000-\u001f]/g, '');
      if (!text.trim()) return;
      const msg = { type: 'chat', name: conn.data.name || 'GHOST', text, ts: Date.now() };
      const r = room(conn.data.room);
      r.history.push(msg); if (r.history.length > 80) r.history.shift();
      broadcast(r, msg);
    }
  };
  conn.onclose = () => {
    if (conn.data.room && rooms.has(conn.data.room)) {
      const r = rooms.get(conn.data.room); r.clients.delete(conn); presence(r);
    }
  };
}

// ---- co-op rooms (state relay; up to 4 players) ----
const coopRooms = new Map(); // code -> { clients:Map(id->conn), seq }
function coopRoom(code) {
  code = (clean(code, 8).toUpperCase()) || 'LOBBY';
  if (!coopRooms.has(code)) coopRooms.set(code, { code, clients: new Map(), seq: 1 });
  return coopRooms.get(code);
}
function coopBroadcast(r, obj, exceptId) { const s = JSON.stringify(obj); for (const c of r.clients.values()) if (c.data.id !== exceptId) c.send(s); }

function handleCoop(conn) {
  conn.onmessage = (raw) => {
    let m; try { m = JSON.parse(raw); } catch (_) { return; }
    if (m.type === 'join') {
      const r = coopRoom(m.room);
      if (r.clients.size >= 4) { conn.sendJSON({ type: 'full' }); conn.close(); return; }
      const id = r.seq++;
      conn.data.id = id; conn.data.room = r; conn.data.name = clean(m.name, 12) || 'GHOST';
      const peers = [...r.clients.values()].map((c) => ({ id: c.data.id, name: c.data.name }));
      r.clients.set(id, conn);
      conn.sendJSON({ type: 'welcome', id, room: r.code, peers });
      coopBroadcast(r, { type: 'peer-join', id, name: conn.data.name }, id);
    } else if (m.type === 'state' && conn.data.room) {
      m.id = conn.data.id;
      coopBroadcast(conn.data.room, m, conn.data.id);
    } else if (m.type === 'event' && conn.data.room) {
      m.id = conn.data.id;
      coopBroadcast(conn.data.room, m, conn.data.id);
    }
  };
  conn.onclose = () => {
    const r = conn.data.room;
    if (r) {
      r.clients.delete(conn.data.id);
      coopBroadcast(r, { type: 'peer-leave', id: conn.data.id });
      if (r.clients.size === 0) coopRooms.delete(r.code);
    }
  };
}

function startWorker() {
  const server = http.createServer(async (req, res) => {
    // per-IP rate limit on the API (static assets are exempt)
    if (req.url.startsWith('/api')) {
      const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
      if (rateLimited(ip)) { cors(res); res.writeHead(429, { 'Content-Type': 'application/json' }); return res.end('{"error":"rate limited"}'); }
    }
    const parsed = url.parse(req.url, true);
    // Added await here for the handleApi response
    if (parsed.pathname.startsWith('/api')) return await handleApi(req, res, parsed);
    return serveStatic(req, res, parsed);
  });
  server.keepAliveTimeout = 15000;
  // realtime (chat/co-op) needs shared in-process state -> single process only.
  if (!CLUSTERED) ws.attach(server, (pn) => (pn === '/api/chat' ? handleChat : pn === '/api/coop' ? handleCoop : null));
  server.listen(PORT, () => {
    const who = cluster.worker ? `worker ${cluster.worker.id}` : 'single process';
    console.log(`VERDANT server (${who}) on http://localhost:${PORT}  [realtime: ${CLUSTERED ? 'use single process' : 'on'}]`);
  });
}

if (CLUSTERED && cluster.isPrimary) {
  const n = process.env.CLUSTER === 'auto' ? os.cpus().length : Math.max(1, parseInt(process.env.CLUSTER, 10) || 1);
  console.log(`VERDANT clustered: forking ${n} HTTP workers (realtime/chat/co-op run a separate single-process instance)`);
  for (let i = 0; i < n; i++) cluster.fork();
  cluster.on('exit', () => cluster.fork()); // auto-restart
} else {
  startWorker();
}
