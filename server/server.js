#!/usr/bin/env node
// VERDANT online server — pure Node, ZERO npm dependencies.
// Serves the static client AND a small leaderboard API.
// Run:  node server/server.js   (defaults to http://localhost:8080)
//
// The client treats this as entirely optional: if the server is down, the
// game still runs as full single-player and reports "offline".
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const ws = require('./ws');

const PORT = process.env.PORT || 8080;
const ROOT = path.join(__dirname, '..');           // repo root (static client)
const DATA_DIR = path.join(__dirname, 'data');
const SCORES_FILE = path.join(DATA_DIR, 'scores.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(SCORES_FILE)) fs.writeFileSync(SCORES_FILE, '[]');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon',
};

function readScores() {
  try { return JSON.parse(fs.readFileSync(SCORES_FILE, 'utf8')) || []; } catch (_) { return []; }
}
function writeScores(list) {
  try { fs.writeFileSync(SCORES_FILE, JSON.stringify(list.slice(0, 2000))); } catch (_) {}
}
function clean(s, max) { return String(s == null ? '' : s).replace(/[^A-Za-z0-9_ -]/g, '').slice(0, max); }
function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}
function sendJSON(res, code, obj) { cors(res); res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); }

function handleApi(req, res, parsed) {
  const p = parsed.pathname.replace(/^\/api/, '') || '/';
  if (req.method === 'OPTIONS') { cors(res); res.writeHead(204); return res.end(); }

  if (p === '/health') return sendJSON(res, 200, { ok: true, service: 'verdant', ts: Date.now() });

  if (p === '/leaderboard' && req.method === 'GET') {
    const q = parsed.query || {};
    let list = readScores();
    if (q.map) list = list.filter((s) => s.map === q.map);
    if (q.diff) list = list.filter((s) => s.diff === q.diff);
    list.sort((a, b) => b.score - a.score);
    return sendJSON(res, 200, { scores: list.slice(0, 20) });
  }

  if (p === '/scores' && req.method === 'POST') {
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 4096) req.destroy(); });
    req.on('end', () => {
      let e; try { e = JSON.parse(body); } catch (_) { return sendJSON(res, 400, { error: 'bad json' }); }
      const entry = {
        name: clean(e.name, 12) || 'GHOST',
        score: Math.max(0, Math.min(9_999_999, parseInt(e.score, 10) || 0)),
        wave: Math.max(1, Math.min(9999, parseInt(e.wave, 10) || 1)),
        kills: Math.max(0, Math.min(99999, parseInt(e.kills, 10) || 0)),
        map: clean(e.map, 16), diff: clean(e.diff, 16),
        ts: Date.now(),
      };
      const list = readScores();
      list.push(entry);
      writeScores(list);
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

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url, true);
  if (parsed.pathname.startsWith('/api')) return handleApi(req, res, parsed);
  return serveStatic(req, res, parsed);
});
ws.attach(server, (pathname) => (pathname === '/api/chat' ? handleChat : pathname === '/api/coop' ? handleCoop : null));
server.listen(PORT, () => {
  console.log(`VERDANT server on http://localhost:${PORT}  (API /api, chat ws /api/chat, scores -> server/data/scores.json)`);
});
