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

  // ---- floating damage numbers (pooled DOM) ----
  damageNumber(sx, sy, amount, crit) {
    const host = document.getElementById('dmg-numbers');
    if (!host) return;
    if (!this._dnPool) { this._dnPool = []; this._dnIdx = 0; }
    let el;
    if (this._dnPool.length < 28) { el = document.createElement('span'); host.appendChild(el); this._dnPool.push(el); }
    else { el = this._dnPool[this._dnIdx = (this._dnIdx + 1) % this._dnPool.length]; }
    el.className = 'dn' + (crit ? ' crit' : '');
    el.textContent = (crit ? '✖' : '') + Math.round(amount);
    el.style.left = sx + 'px';
    el.style.top = sy + 'px';
    // restart animation
    el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
  }

  // ---- compass (canvas) ----
  drawCompass(bearing, items) {
    const cv = document.getElementById('compass');
    if (!cv) return;
    const ctx = cv.getContext('2d');
    const W = cv.width, H = cv.height, cx = W / 2;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(8,16,4,0.5)';
    ctx.fillRect(0, 0, W, H);
    const halfFov = Math.PI / 3; // show ±60°
    const pxPer = (W / 2) / halfFov;
    const wrap = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
    // cardinal + tick marks every 30°
    ctx.font = '11px Orbitron, sans-serif';
    ctx.textAlign = 'center';
    const cards = { '0.0000': 'N', '1.5708': 'E', '3.1416': 'S', '4.7124': 'W' };
    for (let deg = 0; deg < 360; deg += 15) {
      const a = deg * Math.PI / 180;
      const d = wrap(a - bearing);
      if (Math.abs(d) > halfFov) continue;
      const x = cx + d * pxPer;
      const label = cards[a.toFixed(4)];
      if (label) {
        ctx.fillStyle = label === 'N' ? '#ff6a5a' : '#bce04a';
        ctx.fillText(label, x, 14);
        ctx.fillRect(x - 0.5, 18, 1, 8);
      } else {
        ctx.fillStyle = 'rgba(188,224,74,0.4)';
        ctx.fillRect(x - 0.5, 22, 1, 5);
      }
    }
    // centre marker
    ctx.fillStyle = '#d8ff5e';
    ctx.beginPath(); ctx.moveTo(cx, 30); ctx.lineTo(cx - 5, 34); ctx.lineTo(cx + 5, 34); ctx.fill();
    // threat pips
    if (items) for (const it of items) {
      const d = wrap(it.bearing - bearing);
      const clamped = Math.max(-halfFov, Math.min(halfFov, d));
      const x = cx + clamped * pxPer;
      ctx.fillStyle = it.boss ? '#ffd54a' : '#ff3b2f';
      ctx.beginPath(); ctx.arc(x, 6, Math.abs(d) > halfFov ? 2 : 3.5, 0, 7); ctx.fill();
    }
  }
  // High-Alert: level 0..1 of the nearest unseen (behind/flank) threat
  setThreat(level) {
    const el = document.getElementById('threat-vignette'); if (!el) return;
    el.style.opacity = level > 0.02 ? Math.min(0.9, level) : 0;
    el.classList.toggle('show', level > 0.02);
  }
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
