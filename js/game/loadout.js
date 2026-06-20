import { WEAPONS, WEAPON_ORDER, ATTACHMENTS, ATTACHMENT_ORDER } from './weapons.js';

// Player classes — applied at run start. `weapon(w,k)` tweaks per-weapon stats
// (via WeaponManager.configure); `apply(game)` does player/game-level bonuses.
export const CLASSES = {
  assault: {
    name: 'Assault', icon: '🎖', desc: 'Balanced — +10 HP, +1 grenade, +20% reserve ammo.',
    weapon: (w) => { w.reserve = Math.round(w.reserve * 1.2); },
    apply: (g) => { g.player.maxHp += 10; g.player.hp = g.player.maxHp; g.nades = Math.min(8, g.nades + 1); g.hud.setGrenades(g.nades); },
  },
  medic: {
    name: 'Medic', icon: '✚', desc: '+30 max HP, faster regen, +50% pickup heals.',
    weapon: () => {},
    apply: (g) => { g.player.maxHp += 30; g.player.hp = g.player.maxHp; g.player.regenRate *= 1.7; g.player.regenDelay = 2.4; g.medicHealMul = 1.5; },
  },
  marksman: {
    name: 'Marksman', icon: '🎯', desc: '3.5× headshots, faster ADS, tighter aim, +40% sniper ammo.',
    weapon: (w, k) => { if (k !== 'shotgun') w.spread *= 0.85; if (k === 'sniper') w.reserve = Math.round(w.reserve * 1.4); },
    apply: (g) => { g.headMul = 3.5; g.weapons.adsLerp = 18; },
  },
};
export const CLASS_ORDER = ['assault', 'medic', 'marksman'];

// Loadout screen: class + per-weapon attachments (max 2 each).
export class Loadout {
  constructor(game) {
    this.game = game;
    this.overlay = document.getElementById('loadout');
    this.classRow = document.getElementById('loadout-class');
    this.grid = document.getElementById('loadout-grid');
    this._built = false;
    document.getElementById('loadout-close').addEventListener('click', () => this.close());
  }

  _build() {
    if (this._built) return;
    this._built = true;
    this.classBtns = {};
    CLASS_ORDER.forEach((id) => {
      const c = CLASSES[id];
      const el = document.createElement('button');
      el.className = 'diff-btn';
      el.innerHTML = `<span class="db-name">${c.icon} ${c.name}</span><span class="db-desc">${c.desc}</span>`;
      el.addEventListener('click', () => { this.game._setClass(id); this._highlight(); });
      this.classRow.appendChild(el);
      this.classBtns[id] = el;
    });

    this.chips = [];
    WEAPON_ORDER.forEach((wk) => {
      const card = document.createElement('div');
      card.className = 'lo-weapon';
      card.innerHTML = `<div class="lo-wname">${WEAPONS[wk].name}</div>`;
      const row = document.createElement('div'); row.className = 'lo-chips';
      ATTACHMENT_ORDER.forEach((aid) => {
        const a = ATTACHMENTS[aid];
        const chip = document.createElement('button');
        chip.className = 'lo-chip';
        chip.innerHTML = `<b>${a.name}</b><span>${a.desc}</span>`;
        chip.addEventListener('click', () => { this.game._toggleAttachment(wk, aid); this._highlight(); });
        row.appendChild(chip);
        this.chips.push({ wk, aid, el: chip });
      });
      card.appendChild(row);
      this.grid.appendChild(card);
    });
  }

  _highlight() {
    const g = this.game;
    for (const [id, el] of Object.entries(this.classBtns)) el.classList.toggle('active', id === g.classId);
    for (const c of this.chips) {
      const list = g.attachments[c.wk] || [];
      c.el.classList.toggle('active', list.includes(c.aid));
    }
  }

  open() { this._build(); this._highlight(); document.getElementById('title').classList.add('hidden'); this.overlay.classList.remove('hidden'); }
  close() { this.overlay.classList.add('hidden'); document.getElementById('title').classList.remove('hidden'); }
}
