// Secret codes — type the word on the keyboard (anytime, not in a text field).
// All effects are opt-in and single-player flavoured; nothing here runs unless
// a code is entered.
export class Cheats {
  constructor(game) {
    this.game = game;
    this.buf = '';
    this.codes = {
      ARSENAL: { label: 'SECRET ARSENAL', run: () => this._arsenal() },
      ROCKET:  { label: 'ROCKET LAUNCHER', run: () => this._rocket() },
      TANK:    { label: 'TANK DEPLOYED', run: () => this.game.vehicles.spawnNear('tank') },
      BIKE:    { label: 'BIKE DEPLOYED', run: () => this.game.vehicles.spawnNear('bike') },
      JET:     { label: 'JET DEPLOYED', run: () => this.game.vehicles.spawnNear('jet') },
      GODMODE: { label: () => 'GODMODE ' + (this.game.godmode ? 'OFF' : 'ON'), run: () => { this.game.godmode = !this.game.godmode; } },
    };
    this._maxLen = Math.max(...Object.keys(this.codes).map((c) => c.length));
    window.addEventListener('keydown', (e) => this._onKey(e));
  }

  _onKey(e) {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    if (!/^Key[A-Z]$/.test(e.code)) return;
    this.buf = (this.buf + e.code.slice(3)).slice(-this._maxLen);
    for (const code of Object.keys(this.codes)) {
      if (this.buf.endsWith(code)) {
        this.buf = '';
        const c = this.codes[code];
        c.run();
        this.toast(typeof c.label === 'function' ? c.label() : c.label);
        break;
      }
    }
  }

  toast(text) {
    const el = document.getElementById('cheat-toast');
    if (el) {
      el.textContent = '⚡ ' + text;
      el.classList.add('show');
      clearTimeout(this._t); this._t = setTimeout(() => el.classList.remove('show'), 1900);
    }
    if (this.game.audio) this.game.audio.pickup();
  }

  _rocket() {
    this.game.weapons.unlockSecret('rocket');
    this.game._rebuildWeaponSlots();
  }
  _arsenal() {
    this.game.cheatArsenal = true;
    this.game.weapons.unlockSecret('rocket');
    this.game.weapons.maxAll();
    this.game._rebuildWeaponSlots();
    this.game._syncWeaponHud();
  }
}
