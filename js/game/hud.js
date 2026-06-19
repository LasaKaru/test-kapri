// HUD updates & popups
export class HUD {
  constructor() {
    this.el = {
      hud: document.getElementById('hud'),
      health: document.getElementById('health-fill'),
      armor: document.getElementById('armor-fill'),
      wave: document.getElementById('wave-num'),
      score: document.getElementById('score-num'),
      enemies: document.getElementById('enemies-left'),
      streak: document.getElementById('streak-tag'),
      streakNum: document.getElementById('streak-num'),
      mag: document.getElementById('ammo-mag'),
      reserve: document.getElementById('ammo-reserve'),
      nade: document.getElementById('nade-num'),
      weaponName: document.getElementById('weapon-name'),
      weapons: document.getElementById('hud-weapons'),
      killFeed: document.getElementById('kill-feed'),
      crosshair: document.getElementById('crosshair'),
      pop: document.getElementById('center-pop'),
      dmg: document.getElementById('dmg-flash'),
      lowhp: document.getElementById('lowhp-vignette'),
      reload: document.getElementById('reload-note'),
      scope: document.getElementById('scope'),
    };
  }

  show() { this.el.hud.classList.remove('hidden'); }
  hide() { this.el.hud.classList.add('hidden'); }

  setHealth(hp, max) {
    const f = Math.max(0, hp / max) * 100;
    this.el.health.style.width = f + '%';
    this.el.health.classList.toggle('low', f <= 30);
    this.el.lowhp.classList.toggle('show', f <= 30 && f > 0);
  }
  setArmor(armor, max) {
    this.el.armor.style.width = Math.max(0, armor / max) * 100 + '%';
  }
  setWave(n) { this.el.wave.textContent = n; }
  setScore(s) { this.el.score.textContent = String(s).padStart(4, '0'); }
  setCredits(c) { const el = document.getElementById('credit-num'); if (el) el.textContent = c; }
  setEnemies(n) { this.el.enemies.textContent = n; }
  setAmmo(mag, reserve) {
    this.el.mag.textContent = mag;
    this.el.reserve.textContent = reserve;
    this.el.mag.classList.toggle('empty', mag === 0);
  }
  setReloading(on) { this.el.reload.classList.toggle('show', on); }
  setGrenades(n) { if (this.el.nade) this.el.nade.textContent = n; }
  showBoss(on) { const w = document.getElementById('boss-bar-wrap'); if (w) w.classList.toggle('hidden', !on); }
  setBoss(hp, max) { const f = document.getElementById('boss-fill'); if (f) f.style.width = Math.max(0, hp / max) * 100 + '%'; }
  setScope(on) {
    this.el.scope.classList.toggle('show', on);
    this.el.crosshair.style.opacity = on ? '0' : '1';
  }

  setStreak(n) {
    if (n >= 3) {
      this.el.streak.classList.remove('hidden');
      this.el.streakNum.textContent = n;
    } else {
      this.el.streak.classList.add('hidden');
    }
  }

  setWeaponName(name, level) {
    this.el.weaponName.textContent = level && level > 1 ? `${name} · LV${level}` : name;
  }

  buildWeaponSlots(order, defs, current) {
    this.el.weapons.innerHTML = '';
    this._slotEls = {};
    order.forEach((key) => {
      const d = defs[key];
      const div = document.createElement('div');
      div.className = 'wslot' + (key === current ? ' active' : '');
      div.innerHTML = `<span class="wkey">${d.slot}</span><span>${d.name}</span>`;
      this.el.weapons.appendChild(div);
      this._slotEls[key] = div;
    });
  }
  setActiveWeapon(key) {
    if (!this._slotEls) return;
    Object.entries(this._slotEls).forEach(([k, el]) => el.classList.toggle('active', k === key));
  }

  killFeed(text) {
    const div = document.createElement('div');
    div.className = 'kf';
    div.textContent = text;
    this.el.killFeed.appendChild(div);
    setTimeout(() => div.remove(), 3000);
    // cap entries
    while (this.el.killFeed.children.length > 5) this.el.killFeed.firstChild.remove();
  }

  hitMarker() {
    this.el.crosshair.classList.add('hit');
    clearTimeout(this._hitT);
    this._hitT = setTimeout(() => this.el.crosshair.classList.remove('hit'), 90);
  }

  damageFlash() {
    this.el.dmg.classList.add('show');
    clearTimeout(this._dmgT);
    this._dmgT = setTimeout(() => this.el.dmg.classList.remove('show'), 110);
  }

  popKill() {
    const p = this.el.pop;
    p.className = 'center-pop kill';
    p.textContent = 'KILL';
    void p.offsetWidth;
    p.classList.add('kill');
  }

  popHeadshot() {
    const p = this.el.pop;
    p.className = 'center-pop kill headshot';
    p.textContent = 'HEADSHOT';
    void p.offsetWidth;
    p.classList.add('kill');
  }

  popWave(n, sub) {
    const p = this.el.pop;
    p.className = 'center-pop wave';
    p.innerHTML = `WAVE ${n}<span class="sub">${sub || 'INCOMING'}</span>`;
    void p.offsetWidth;
    p.classList.add('wave');
  }
}
