// Local achievements, persisted to localStorage, with a HUD toast on unlock.
export const ACH_LIST = [
  { id: 'firstblood', name: 'First Blood', desc: 'Get your first kill' },
  { id: 'headhunter', name: 'Headhunter', desc: 'Land a headshot' },
  { id: 'demolition', name: 'Demolition', desc: 'Detonate an explosive barrel' },
  { id: 'wave5', name: 'Survivor', desc: 'Reach Wave 5' },
  { id: 'wave10', name: 'Hardened', desc: 'Reach Wave 10' },
  { id: 'slayer', name: 'Boss Slayer', desc: 'Defeat a Boss' },
  { id: 'gunsmith', name: 'Gunsmith', desc: 'Level a weapon to LV5' },
  { id: 'globetrotter', name: 'Globetrotter', desc: 'Fight on every map' },
  { id: 'nightmare', name: 'Nightmare', desc: 'Clear a wave on Nightmare' },
];

export class Achievements {
  constructor() {
    this.unlocked = this._load('verdant_ach');
    this.maps = this._load('verdant_maps_played');
  }
  _load(key) { try { return new Set(JSON.parse(localStorage.getItem(key) || '[]')); } catch (_) { return new Set(); } }
  _save(key, set) { try { localStorage.setItem(key, JSON.stringify([...set])); } catch (_) {} }

  has(id) { return this.unlocked.has(id); }

  unlock(id) {
    if (this.unlocked.has(id)) return;
    const a = ACH_LIST.find((x) => x.id === id);
    if (!a) return;
    this.unlocked.add(id);
    this._save('verdant_ach', this.unlocked);
    this._toast(a);
  }

  playedMap(id) {
    this.maps.add(id);
    this._save('verdant_maps_played', this.maps);
    if (['plains', 'highlands', 'lowlands', 'mountains'].every((m) => this.maps.has(m))) this.unlock('globetrotter');
  }

  _toast(a) {
    const host = document.getElementById('ach-toast');
    if (!host) return;
    const el = document.createElement('div');
    el.className = 'ach';
    el.innerHTML = `<span class="ach-ic">🏆</span><span class="ach-tx"><b>ACHIEVEMENT — ${a.name}</b><br>${a.desc}</span>`;
    host.appendChild(el);
    setTimeout(() => el.remove(), 4200);
  }
}
