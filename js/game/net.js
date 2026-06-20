// Isolated, optional online layer. Single-player NEVER depends on this:
// every call is non-blocking and failure-safe. If no server is reachable the
// game runs exactly as before and simply reports "offline".
export class Net {
  constructor() {
    this.state = 'offline';            // offline | connecting | online
    this.base = this._resolveBase();
    this.enabled = !!this.base;
    this.listeners = [];
    this._backoff = 2000;
    this._queue = this._load('verdant_score_queue', []);
    this.name = (this._loadRaw('verdant_name') || 'GHOST').slice(0, 12);
    if (this.enabled) this._connect();
  }

  // server base URL: explicit override, else same-origin /api (works when the
  // bundled Node server hosts the client; 404s harmlessly on static hosting)
  _resolveBase() {
    try { const s = localStorage.getItem('verdant_server'); if (s) return s.replace(/\/$/, ''); } catch (_) {}
    if (typeof window !== 'undefined' && window.VERDANT_SERVER) return String(window.VERDANT_SERVER).replace(/\/$/, '');
    if (typeof location !== 'undefined' && /^https?:$/.test(location.protocol)) return location.origin + '/api';
    return null;
  }

  onState(fn) { this.listeners.push(fn); try { fn(this.state); } catch (_) {} }
  _setState(s) { if (s !== this.state) { this.state = s; this.listeners.forEach((f) => { try { f(s); } catch (_) {} }); } }

  setName(n) {
    this.name = (n || 'GHOST').toUpperCase().replace(/[^A-Z0-9_ -]/g, '').slice(0, 12) || 'GHOST';
    try { localStorage.setItem('verdant_name', this.name); } catch (_) {}
  }

  async _fetch(path, opts = {}, timeout = 4000) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeout);
    try {
      const r = await fetch(this.base + path, {
        ...opts, signal: ctrl.signal,
        headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
      });
      clearTimeout(t);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } catch (e) { clearTimeout(t); throw e; }
  }

  async _connect() {
    if (!this.enabled) return;
    this._setState('connecting');
    try {
      await this._fetch('/health', {}, 3000);
      this._setState('online');
      this._backoff = 2000;
      this._flushQueue();
    } catch (_) {
      this._setState('offline');
      this._scheduleReconnect();
    }
  }
  _scheduleReconnect() {
    clearTimeout(this._rc);
    this._rc = setTimeout(() => this._connect(), this._backoff);
    this._backoff = Math.min(60000, Math.round(this._backoff * 1.8));
  }

  // ---- leaderboard ----
  async leaderboard(map, diff) {
    if (!this.enabled) throw new Error('offline');
    return this._fetch(`/leaderboard?map=${encodeURIComponent(map || '')}&diff=${encodeURIComponent(diff || '')}`);
  }

  // best-effort, queued, never throws into the game
  submitScore(entry) {
    const e = { ...entry, name: this.name, ts: Date.now() };
    this._queue.push(e); this._save('verdant_score_queue', this._queue);
    this._flushQueue();
  }
  async _flushQueue() {
    if (this.state !== 'online' || !this._queue.length) return;
    for (const it of [...this._queue]) {
      try {
        await this._fetch('/scores', { method: 'POST', body: JSON.stringify(it) });
        this._queue = this._queue.filter((x) => x !== it); this._save('verdant_score_queue', this._queue);
      } catch (_) { this._setState('offline'); this._scheduleReconnect(); break; }
    }
  }

  _loadRaw(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }
  _load(k, d) { try { return JSON.parse(localStorage.getItem(k) || JSON.stringify(d)); } catch (_) { return d; } }
  _save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} }
}
