// Player-facing settings: persisted to localStorage and applied to the game.
const KEY = 'verdant_settings';
const DEFAULTS = { volume: 70, music: 32, sfx: true, sensitivity: 100, fov: 75, realism: 75, daynight: true, weather: true, shadows: true, highDetail: true, flora: 100, cinematic: true };

export class Settings {
  constructor(game) {
    this.game = game;
    try { this.v = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; }
    catch (_) { this.v = { ...DEFAULTS }; }
    this._built = false;
  }

  save() { try { localStorage.setItem(KEY, JSON.stringify(this.v)); } catch (_) {} }

  applyAll() {
    const g = this.game;
    g.audio.master = this.v.volume / 100;
    g.audio.setMusicVolume(this.v.music / 100);
    g.audio.enabled = this.v.sfx;
    g.player.sensitivity = this.v.sensitivity / 100;
    g.setBaseFov(this.v.fov);
    g.postfx.setRealism(this.v.realism / 100);
    g.world.setDayNight(this.v.daynight);
    g.world.setWeatherEnabled(this.v.weather);
    g.renderer.shadowMap.enabled = this.v.shadows;
    g.renderer.shadowMap.needsUpdate = true;
    g.renderer.setPixelRatio(this.v.highDetail ? Math.min(window.devicePixelRatio, 2) : 1);
    g.world.setFloraDensity(this.v.flora / 100);
    g.cinematicEnabled = this.v.cinematic;
  }

  buildUI(container) {
    if (this._built) return;
    this._built = true;
    const mk = (html) => { const d = document.createElement('div'); d.className = 'set-row'; d.innerHTML = html; return d; };

    const slider = (label, key, min, max, suffix, onApply) => {
      const row = mk(`<label>${label}</label><div class="set-control"><input type="range" min="${min}" max="${max}" value="${this.v[key]}"><span class="set-val"></span></div>`);
      const input = row.querySelector('input'), val = row.querySelector('.set-val');
      const refresh = () => { val.textContent = this.v[key] + (suffix || ''); };
      refresh();
      input.addEventListener('input', () => { this.v[key] = parseInt(input.value, 10); refresh(); onApply(); this.save(); });
      container.appendChild(row);
    };

    const toggle = (label, key, onApply) => {
      const row = mk(`<label>${label}</label><button class="set-toggle"></button>`);
      const btn = row.querySelector('button');
      const refresh = () => { btn.textContent = this.v[key] ? 'ON' : 'OFF'; btn.classList.toggle('off', !this.v[key]); };
      refresh();
      btn.addEventListener('click', () => { this.v[key] = !this.v[key]; refresh(); onApply(); this.save(); });
      container.appendChild(row);
    };

    const g = this.game;
    slider('Master Volume', 'volume', 0, 100, '%', () => { g.audio.master = this.v.volume / 100; });
    slider('Music', 'music', 0, 100, '%', () => { g.audio.setMusicVolume(this.v.music / 100); });
    toggle('Sound Effects', 'sfx', () => { g.audio.enabled = this.v.sfx; });
    slider('Mouse Sensitivity', 'sensitivity', 30, 250, '%', () => { g.player.sensitivity = this.v.sensitivity / 100; });
    slider('Field of View', 'fov', 65, 100, '°', () => { g.setBaseFov(this.v.fov); });
    slider('Realism', 'realism', 0, 100, '%', () => { g.postfx.setRealism(this.v.realism / 100); });
    toggle('Day / Night Cycle', 'daynight', () => { g.world.setDayNight(this.v.daynight); });
    toggle('Weather', 'weather', () => { g.world.setWeatherEnabled(this.v.weather); });
    toggle('Shadows', 'shadows', () => { g.renderer.shadowMap.enabled = this.v.shadows; g.renderer.shadowMap.needsUpdate = true; });
    toggle('High Detail', 'highDetail', () => { g.renderer.setPixelRatio(this.v.highDetail ? Math.min(window.devicePixelRatio, 2) : 1); });
    slider('Foliage Density', 'flora', 0, 150, '%', () => { g.world.setFloraDensity(this.v.flora / 100); });
    toggle('Cinematic Menu', 'cinematic', () => { g.cinematicEnabled = this.v.cinematic; });
  }
}
