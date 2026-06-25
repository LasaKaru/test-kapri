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
    // Every player gets a stable, unique handle. If they never set one we mint a
    // callsign+id (e.g. RAVEN4821) and persist it — so chat/leaderboard show a
    // real identity instead of a wall of "GHOST".
    this.name = this._ensureName();
    this.country = (this._loadRaw('verdant_country') || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2);
    this._detectCountry();
    if (this.enabled) this._connect();
  }

  // pull a saved name, sanitising it; mint+persist a unique one if absent
  _ensureName() {
    const saved = (this._loadRaw('verdant_name') || '').toUpperCase().replace(/[^A-Z0-9_ -]/g, '').slice(0, 12).trim();
    if (saved && saved !== 'GHOST') return saved;
    const n = this._genName();
    try { localStorage.setItem('verdant_name', n); } catch (_) {}
    return n;
  }
  _genName() {
    const cs = ['VIPER', 'RAVEN', 'WOLF', 'HAWK', 'NOVA', 'ECHO', 'FOX', 'ACE', 'KILO', 'DELTA', 'RECON', 'BLADE', 'STORM', 'ONYX', 'COBRA', 'LYNX'];
    return (cs[Math.floor(Math.random() * cs.length)] + Math.floor(1000 + Math.random() * 9000)).slice(0, 12);
  }

  // best-effort country lookup (2-letter ISO) for the flag icon; fully optional
  // and failure-safe — single-player and chat work fine without it.
  async _detectCountry() {
    if (this.country) return;                       // already known/cached
    if (typeof fetch === 'undefined') return;
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 3500);
      const r = await fetch('https://ipapi.co/country/', { signal: ctrl.signal });
      clearTimeout(t);
      const cc = (await r.text()).trim().toUpperCase().replace(/[^A-Z]/g, '');
      if (cc.length === 2) {
        this.country = cc;
        try { localStorage.setItem('verdant_country', cc); } catch (_) {}
        // refresh our identity on any open chat connection
        if (this._ws && this._ws.readyState === 1) { try { this._ws.send(JSON.stringify({ type: 'join', name: this.name, country: this.country, room: this.chatRoom })); } catch (_) {} }
      }
    } catch (_) { /* offline / blocked — flag simply omitted */ }
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
    const clean = (n || '').toUpperCase().replace(/[^A-Z0-9_ -]/g, '').slice(0, 12).trim();
    // empty/cleared keeps the existing unique handle rather than reverting to GHOST
    this.name = clean || this.name || this._genName();
    try { localStorage.setItem('verdant_name', this.name); } catch (_) {}
    if (this._ws && this._ws.readyState === 1) { try { this._ws.send(JSON.stringify({ type: 'join', name: this.name, country: this.country, room: this.chatRoom })); } catch (_) {} }
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
    const e = { ...entry, name: this.name, country: this.country || '', ts: Date.now() };
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

  // ---- live chat (lazy, failure-safe; never affects single-player) ----
  _chatUrl() { return this.base ? this.base.replace(/^http/, 'ws') + '/chat' : null; }
  onChat(fn) { (this._chatMsg || (this._chatMsg = [])).push(fn); }
  onPresence(fn) { (this._chatPres || (this._chatPres = [])).push(fn); }
  onChatState(fn) { (this._chatStateCb || (this._chatStateCb = [])).push(fn); this._emitChatState(); }
  _emit(list, ...a) { if (list) for (const f of list) { try { f(...a); } catch (_) {} } }
  _emitChatState() { this._emit(this._chatStateCb, this.chatState || 'offline'); }

  connectChat(room) {
    if (!this.enabled || typeof WebSocket === 'undefined') { this.chatState = 'offline'; this._emitChatState(); return; }
    this.chatRoom = room || this.chatRoom || 'global';
    if (this._ws && (this._ws.readyState === 0 || this._ws.readyState === 1)) return; // already connecting/open
    this.chatState = 'connecting'; this._emitChatState();
    let ws;
    try { ws = new WebSocket(this._chatUrl()); } catch (_) { this.chatState = 'offline'; this._emitChatState(); this._scheduleChatReconnect(); return; }
    this._ws = ws;
    ws.onopen = () => { this.chatState = 'online'; this._emitChatState(); this._chatBackoff = 2000; ws.send(JSON.stringify({ type: 'join', name: this.name, country: this.country, room: this.chatRoom })); };
    ws.onmessage = (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch (_) { return; }
      if (m.type === 'history') { for (const msg of (m.messages || [])) this._emit(this._chatMsg, msg); }
      else if (m.type === 'chat') this._emit(this._chatMsg, m);
      else if (m.type === 'presence') this._emit(this._chatPres, m.count);
    };
    ws.onclose = () => { this.chatState = 'offline'; this._emitChatState(); this._scheduleChatReconnect(); };
    ws.onerror = () => { try { ws.close(); } catch (_) {} };
  }
  _scheduleChatReconnect() {
    if (!this._chatWanted) return;
    clearTimeout(this._crc);
    this._chatBackoff = Math.min(30000, (this._chatBackoff || 2000) * 1.7);
    this._crc = setTimeout(() => this.connectChat(this.chatRoom), this._chatBackoff);
  }
  openChat(room) { this._chatWanted = true; this.connectChat(room); }
  sendChat(text) {
    if (this._ws && this._ws.readyState === 1) { try { this._ws.send(JSON.stringify({ type: 'chat', text })); return true; } catch (_) {} }
    return false;
  }

  // ---- co-op (relay; failure-safe, optional) ----
  _coopUrl() { return this.base ? this.base.replace(/^http/, 'ws') + '/coop' : null; }
  onCoop(fn) { (this._coopCb || (this._coopCb = [])).push(fn); }
  onCoopState(fn) { (this._coopStateCb || (this._coopStateCb = [])).push(fn); try { fn(this.coopState || 'offline'); } catch (_) {} }
  _emitCoopState() { this._emit(this._coopStateCb, this.coopState || 'offline'); }

  connectCoop(room) {
    if (!this.enabled || typeof WebSocket === 'undefined') { this.coopState = 'offline'; this._emitCoopState(); return false; }
    this.coopRoom = (room || 'LOBBY').toUpperCase();
    this.coopState = 'connecting'; this._emitCoopState();
    let ws; try { ws = new WebSocket(this._coopUrl()); } catch (_) { this.coopState = 'offline'; this._emitCoopState(); return false; }
    this._coopWs = ws;
    ws.onopen = () => { this.coopState = 'online'; this._emitCoopState(); ws.send(JSON.stringify({ type: 'join', room: this.coopRoom, name: this.name, country: this.country })); };
    ws.onmessage = (ev) => { let m; try { m = JSON.parse(ev.data); } catch (_) { return; } this._emit(this._coopCb, m); };
    ws.onclose = () => { this.coopState = 'offline'; this._emitCoopState(); };
    ws.onerror = () => { try { ws.close(); } catch (_) {} };
    return true;
  }
  sendCoopState(obj) { if (this._coopWs && this._coopWs.readyState === 1) { try { this._coopWs.send(JSON.stringify({ type: 'state', ...obj })); } catch (_) {} } }
  sendCoopEvent(obj) { if (this._coopWs && this._coopWs.readyState === 1) { try { this._coopWs.send(JSON.stringify({ type: 'event', ...obj })); } catch (_) {} } }
  leaveCoop() { if (this._coopWs) { try { this._coopWs.close(); } catch (_) {} this._coopWs = null; } this.coopState = 'offline'; this._emitCoopState(); }

  _loadRaw(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }
  _load(k, d) { try { return JSON.parse(localStorage.getItem(k) || JSON.stringify(d)); } catch (_) { return d; } }
  _save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} }
}
