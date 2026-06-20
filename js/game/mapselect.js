import { MAPS, MAP_ORDER } from './world.js';

export const DIFFICULTIES = {
  recruit:   { name: 'Recruit',   desc: 'Forgiving. Fewer, weaker foes.', hp: 0.8, speed: 0.9, dmg: 0.7, spawn: 0.85, reward: 0.9 },
  veteran:   { name: 'Veteran',   desc: 'The intended challenge.',        hp: 1.0, speed: 1.0, dmg: 1.0, spawn: 1.0,  reward: 1.0 },
  nightmare: { name: 'Nightmare', desc: 'More, faster, deadlier. Big rewards.', hp: 1.5, speed: 1.2, dmg: 1.4, spawn: 1.3, reward: 1.45 },
};

// Location & difficulty picker (title screen).
export class MapSelect {
  constructor(game) {
    this.game = game;
    this.overlay = document.getElementById('mapselect');
    this.grid = document.getElementById('map-grid');
    this.diffRow = document.getElementById('diff-row');
    this._built = false;
    document.getElementById('mapselect-close').addEventListener('click', () => this.close());
  }

  _build() {
    if (this._built) return;
    this._built = true;
    this.mapCards = {};
    MAP_ORDER.forEach((id) => {
      const m = MAPS[id];
      const el = document.createElement('button');
      el.className = 'map-card';
      el.innerHTML =
        `<span class="mc-preview" style="background:linear-gradient(180deg,${m.preview[0]},${m.preview[1]} 60%,${m.preview[2]})"></span>` +
        `<span class="mc-topo">${m.topo}</span>` +
        `<span class="mc-name">${m.name}</span>` +
        `<span class="mc-desc">${m.desc}</span>`;
      el.addEventListener('click', () => this._pickMap(id));
      this.grid.appendChild(el);
      this.mapCards[id] = el;
    });

    this.diffBtns = {};
    Object.keys(DIFFICULTIES).forEach((id) => {
      const d = DIFFICULTIES[id];
      const el = document.createElement('button');
      el.className = 'diff-btn';
      el.innerHTML = `<span class="db-name">${d.name}</span><span class="db-desc">${d.desc}</span>`;
      el.addEventListener('click', () => this._pickDiff(id));
      this.diffRow.appendChild(el);
      this.diffBtns[id] = el;
    });
  }

  _pickMap(id) {
    this.game._setMap(id);
    this._highlight();
  }
  _pickDiff(id) {
    this.game._setDifficulty(id);
    this._highlight();
  }
  _highlight() {
    const g = this.game;
    for (const [id, el] of Object.entries(this.mapCards)) el.classList.toggle('active', id === g.world.mapId);
    for (const [id, el] of Object.entries(this.diffBtns)) el.classList.toggle('active', id === g.difficultyId);
  }

  open() {
    this._build();
    this._highlight();
    document.getElementById('title').classList.add('hidden');
    this.overlay.classList.remove('hidden');
  }
  close() {
    this.overlay.classList.add('hidden');
    document.getElementById('title').classList.remove('hidden');
  }
}
