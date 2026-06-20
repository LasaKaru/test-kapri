// On-screen controls for touch devices: left analog joystick (move),
// right-half drag (look), and action buttons.
export class TouchControls {
  constructor(game) {
    this.game = game;
    this.enabled = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
    if (!this.enabled) return;
    document.getElementById('touch').classList.remove('hidden');
    this._bind();
  }

  _playing() { return this.game.state === 'playing'; }

  _bind() {
    const g = this.game;
    const joy = document.getElementById('touch-joy');
    const knob = document.getElementById('touch-knob');
    const look = document.getElementById('touch-look');

    // joystick
    let joyId = null, cx = 0, cy = 0;
    const R = 52;
    joy.addEventListener('pointerdown', (e) => {
      joyId = e.pointerId; const r = joy.getBoundingClientRect();
      cx = r.left + r.width / 2; cy = r.top + r.height / 2;
      joy.setPointerCapture(e.pointerId); e.preventDefault();
    });
    joy.addEventListener('pointermove', (e) => {
      if (e.pointerId !== joyId) return;
      let dx = e.clientX - cx, dy = e.clientY - cy;
      const d = Math.hypot(dx, dy) || 1;
      if (d > R) { dx = dx / d * R; dy = dy / d * R; }
      knob.style.left = `calc(50% + ${dx}px)`; knob.style.top = `calc(50% + ${dy}px)`;
      g.player.touchVec.set(dx / R, -dy / R);
    });
    const joyEnd = (e) => {
      if (e.pointerId !== joyId) return;
      joyId = null; knob.style.left = '50%'; knob.style.top = '50%';
      g.player.touchVec.set(0, 0);
    };
    joy.addEventListener('pointerup', joyEnd);
    joy.addEventListener('pointercancel', joyEnd);

    // look drag
    let lookId = null, lx = 0, ly = 0;
    look.addEventListener('pointerdown', (e) => { lookId = e.pointerId; lx = e.clientX; ly = e.clientY; look.setPointerCapture(e.pointerId); e.preventDefault(); });
    look.addEventListener('pointermove', (e) => {
      if (e.pointerId !== lookId || !this._playing()) return;
      const dx = e.clientX - lx, dy = e.clientY - ly; lx = e.clientX; ly = e.clientY;
      g.player.addLook(dx * 1.3, dy * 1.3);
    });
    const lookEnd = (e) => { if (e.pointerId === lookId) lookId = null; };
    look.addEventListener('pointerup', lookEnd);
    look.addEventListener('pointercancel', lookEnd);

    // buttons
    const hold = (id, down, up) => {
      const el = document.getElementById(id);
      el.addEventListener('pointerdown', (e) => { e.preventDefault(); if (this._playing()) down(); });
      if (up) { el.addEventListener('pointerup', (e) => { e.preventDefault(); up(); }); el.addEventListener('pointercancel', up); }
    };
    hold('touch-fire', () => { g.firing = true; }, () => { g.firing = false; });
    hold('touch-ads', () => g.weapons.setAds(true), () => g.weapons.setAds(false));
    hold('touch-reload', () => { if (g.weapons.reload()) g.audio.reload(); });
    hold('touch-nade', () => g._throwGrenade());
    hold('touch-melee', () => g._melee());
    hold('touch-swap', () => { g.weapons.cycle(1); g.audio.swap(); g._syncWeaponHud(); });
  }
}
