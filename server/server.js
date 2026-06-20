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

http.createServer((req, res) => {
  const parsed = url.parse(req.url, true);
  if (parsed.pathname.startsWith('/api')) return handleApi(req, res, parsed);
  return serveStatic(req, res, parsed);
}).listen(PORT, () => {
  console.log(`VERDANT server on http://localhost:${PORT}  (API at /api, leaderboard persisted to server/data/scores.json)`);
});
