import { MAPS } from './world.js';

// Online leaderboard view. Falls back to the local scores when the server is
// unavailable, with a clear banner — single-player is never blocked.
export class OnlineBoard {
  constructor(game) {
    this.game = game;
    this.filterMap = true;
    this.overlay = document.getElementById('online-lb');
    this.list = document.getElementById('olb-list');
    this.banner = document.getElementById('olb-banner');
    const name = document.getElementById('olb-name');
    name.value = game.net.name;
    name.addEventListener('change', () => { game.net.setName(name.value); name.value = game.net.name; });

    document.getElementById('olb-f-map').addEventListener('click', () => this._setFilter(true));
    document.getElementById('olb-f-all').addEventListener('click', () => this._setFilter(false));
    document.getElementById('olb-refresh').addEventListener('click', () => this.refresh());
    document.getElementById('olb-close').addEventListener('click', () => this.close());
  }

  _setFilter(thisMap) {
    this.filterMap = thisMap;
    document.getElementById('olb-f-map').classList.toggle('active', thisMap);
    document.getElementById('olb-f-all').classList.toggle('active', !thisMap);
    this.refresh();
  }

  open() {
    document.getElementById('title').classList.add('hidden');
    this.overlay.classList.remove('hidden');
    this.refresh();
  }
  close() {
    this.overlay.classList.add('hidden');
    document.getElementById('title').classList.remove('hidden');
  }

  async refresh() {
    const g = this.game;
    const map = this.filterMap ? g.world.mapId : '';
    const diff = this.filterMap ? g.difficultyId : '';
    this.list.innerHTML = '<li class="olb-empty">Loading…</li>';
    let scores = null, online = false;
    if (g.net.enabled && g.net.state === 'online') {
      try { const r = await g.net.leaderboard(map, diff); scores = r.scores || []; online = true; } catch (_) { scores = null; }
    }
    if (!online) scores = this._local(map, diff);
    this._banner(online);
    this._render(scores, online);
  }

  _local(map, diff) {
    let s = [];
    try { s = JSON.parse(localStorage.getItem('verdant_scores') || '[]'); } catch (_) {}
    if (map) s = s.filter((x) => (x.map || 'plains') === map);
    if (diff) s = s.filter((x) => (x.diff || 'veteran') === diff);
    return s.sort((a, b) => b.score - a.score).slice(0, 20);
  }

  _banner(online) {
    const b = this.banner;
    b.classList.remove('hidden');
    if (online) { b.classList.add('ok'); b.textContent = '● Online — global rankings'; }
    else { b.classList.remove('ok'); b.textContent = '● Offline — showing your local scores. They\'ll sync when a server is reachable.'; }
  }

  _render(scores, online) {
    if (!scores || !scores.length) { this.list.innerHTML = '<li class="olb-empty">No runs yet — be the first.</li>'; return; }
    this.list.innerHTML = '';
    scores.forEach((s, i) => {
      const li = document.createElement('li');
      const mapName = MAPS[s.map] ? MAPS[s.map].name : (s.map || '—');
      li.innerHTML =
        `<span class="olb-rank">#${i + 1}</span>` +
        `<span class="olb-name">${(s.name || (online ? 'GHOST' : 'YOU'))}</span>` +
        `<span class="olb-score">${String(s.score).padStart(5, '0')}</span>` +
        `<span class="olb-meta">W${s.wave} · ${mapName}</span>`;
      this.list.appendChild(li);
    });
  }
}
