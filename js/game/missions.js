import { MAPS } from './world.js';
import { DIFFICULTIES } from './mapselect.js';

// Curated campaign length. Waves beyond this keep coming (endless), but the
// mission board shows 1..MISSION_COUNT, with a boss every 5th and a final stand.
export const MISSION_COUNT = 24;
const KEY = 'verdant_unlocked';

// Checkpoint / mission progression. Progress is tracked per battlefield
// (map + difficulty): the highest wave you've reached is your checkpoint, so
// dying lets you Continue from there instead of grinding back from wave 1.
export class Missions {
  constructor(game) {
    this.game = game;
    this.overlay = document.getElementById('missions');
    this.grid = document.getElementById('mission-grid');
    this.sub = document.getElementById('missions-sub');
    const close = document.getElementById('missions-close');
    if (close) close.addEventListener('click', () => this.close());
  }

  _key() { return `${this.game.world.mapId}:${this.game.difficultyId}`; }
  _all() { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (_) { return {}; } }

  // highest wave unlocked on the current battlefield (>=1)
  maxWave() {
    const v = this._all()[this._key()];
    return (typeof v === 'number' && v > 0) ? v : 1;
  }
  hasProgress() { return this.maxWave() > 1; }

  // record that the player reached (started) a wave here — bumps the checkpoint
  reached(wave) {
    const all = this._all(), k = this._key();
    if (!(all[k] >= wave)) {
      all[k] = wave;
      try { localStorage.setItem(KEY, JSON.stringify(all)); } catch (_) {}
    }
  }

  _build() {
    this.grid.innerHTML = '';
    const max = this.maxWave();
    for (let w = 1; w <= MISSION_COUNT; w++) {
      const boss = w % 5 === 0;
      const final = w === MISSION_COUNT;
      const unlocked = w <= max;
      const el = document.createElement('button');
      el.className = 'mtile' + (boss ? ' boss' : '') + (final ? ' final' : '') + (unlocked ? '' : ' locked');
      const tag = final ? '☠ FINAL STAND' : boss ? '☠ BOSS WAVE' : 'WAVE';
      const state = unlocked ? (w === max ? '◉ CHECKPOINT' : '✓ CLEARED') : '🔒 LOCKED';
      el.innerHTML =
        `<span class="mt-no">${w}</span>` +
        `<span class="mt-lbl">${tag}</span>` +
        `<span class="mt-state">${state}</span>`;
      if (unlocked) el.addEventListener('click', () => { this.close(); this.game.start(w); });
      else el.disabled = true;
      this.grid.appendChild(el);
    }
  }

  open() {
    this._build();
    const mapName = MAPS[this.game.world.mapId].name;
    const diffName = DIFFICULTIES[this.game.difficultyId].name;
    if (this.sub) this.sub.textContent = `${mapName} · ${diffName} — deploy to any unlocked wave`;
    document.getElementById('title').classList.add('hidden');
    this.overlay.classList.remove('hidden');
  }
  close() {
    this.overlay.classList.add('hidden');
    document.getElementById('title').classList.remove('hidden');
  }
}
