import * as THREE from 'three';

// ---- Arsenal ----
// dmg is in "hit points"; enemy HP is tuned around the rifle dealing 1/shot.
export const WEAPONS = {
  rifle: {
    key: 'rifle', name: 'KR-15 RIFLE', slot: 1, auto: true,
    dmg: 1, fireRate: 0.10, mag: 30, reserveMax: 180, reserve: 120,
    spread: 0.012, adsSpread: 0.003, recoil: 0.022, recoilYaw: 0.006, kick: 0.03,
    pellets: 1, reload: 1.6, zoom: 1.4, range: 200, tracer: 0xffe08a,
  },
  smg: {
    key: 'smg', name: 'V-9 SMG', slot: 2, auto: true,
    dmg: 0.7, fireRate: 0.062, mag: 40, reserveMax: 280, reserve: 160,
    spread: 0.026, adsSpread: 0.012, recoil: 0.016, recoilYaw: 0.009, kick: 0.022,
    pellets: 1, reload: 1.4, zoom: 1.25, range: 140, tracer: 0xaef0ff,
  },
  shotgun: {
    key: 'shotgun', name: 'BR-2 BREACHER', slot: 3, auto: false,
    dmg: 0.9, fireRate: 0.72, mag: 7, reserveMax: 56, reserve: 35,
    spread: 0.085, adsSpread: 0.06, recoil: 0.06, recoilYaw: 0.02, kick: 0.07,
    pellets: 9, reload: 2.2, zoom: 1.15, range: 60, tracer: 0xffd070,
  },
  sniper: {
    key: 'sniper', name: 'LR-7 MARKSMAN', slot: 4, auto: false,
    dmg: 6, fireRate: 1.05, mag: 5, reserveMax: 40, reserve: 25,
    spread: 0.002, adsSpread: 0.0, recoil: 0.09, recoilYaw: 0.0, kick: 0.11,
    pellets: 1, reload: 2.4, zoom: 3.2, range: 300, tracer: 0xff9d5c,
  },
  pistol: {
    key: 'pistol', name: 'SD-9 SIDEARM', slot: 5, auto: false,
    dmg: 1.5, fireRate: 0.17, mag: 12, reserveMax: 120, reserve: 60,
    spread: 0.009, adsSpread: 0.002, recoil: 0.03, recoilYaw: 0.004, kick: 0.035,
    pellets: 1, reload: 1.2, zoom: 1.25, range: 120, tracer: 0xfff0b0,
  },
  lmg: {
    key: 'lmg', name: 'HG-50 GATLING', slot: 6, auto: true,
    dmg: 1.1, fireRate: 0.07, mag: 80, reserveMax: 320, reserve: 160,
    spread: 0.022, adsSpread: 0.011, recoil: 0.02, recoilYaw: 0.013, kick: 0.03,
    pellets: 1, reload: 3.0, zoom: 1.2, range: 175, tracer: 0xffc060,
  },
  dmr: {
    key: 'dmr', name: 'MK-8 DMR', slot: 7, auto: false,
    dmg: 3, fireRate: 0.26, mag: 12, reserveMax: 96, reserve: 60,
    spread: 0.006, adsSpread: 0.001, recoil: 0.05, recoilYaw: 0.006, kick: 0.06,
    pellets: 1, reload: 1.9, zoom: 2.2, range: 260, tracer: 0xfff0b0,
  },
  autoshotgun: {
    key: 'autoshotgun', name: 'AA-12 AUTO', slot: 8, auto: true,
    dmg: 0.8, fireRate: 0.22, mag: 20, reserveMax: 120, reserve: 80,
    spread: 0.075, adsSpread: 0.055, recoil: 0.04, recoilYaw: 0.018, kick: 0.05,
    pellets: 7, reload: 2.6, zoom: 1.1, range: 55, tracer: 0xffb060,
  },
  railgun: {
    key: 'railgun', name: 'ARC-9 RAILGUN', slot: 9, auto: false,
    dmg: 9, fireRate: 1.25, mag: 4, reserveMax: 32, reserve: 16,
    spread: 0.0, adsSpread: 0.0, recoil: 0.1, recoilYaw: 0.0, kick: 0.12,
    pellets: 1, reload: 2.8, zoom: 2.0, range: 320, tracer: 0x66e0ff,
  },
};

export const WEAPON_ORDER = ['rifle', 'smg', 'shotgun', 'sniper', 'pistol', 'lmg', 'dmr', 'autoshotgun', 'railgun'];
const LEVEL_KEY = 'verdant_weapon_levels';
const MAX_LEVEL = 10;

// Weapon attachments — modify per-run effective stats. Up to 2 per weapon.
export const ATTACHMENTS = {
  extmag: { name: 'Extended Mag', desc: '+40% magazine', apply: (w) => { w.mag = Math.round(w.mag * 1.4); } },
  grip:   { name: 'Foregrip', desc: '−30% recoil', apply: (w) => { w.recoil *= 0.7; w.recoilYaw *= 0.55; } },
  comp:   { name: 'Compensator', desc: '−30% spread', apply: (w) => { w.spread *= 0.7; w.adsSpread *= 0.7; } },
  scope:  { name: 'Scope', desc: 'More zoom, tighter ADS', apply: (w) => { w.zoom *= 1.45; w.adsSpread *= 0.6; } },
  laser:  { name: 'Laser Sight', desc: '−25% hip spread', apply: (w) => { w.spread *= 0.75; } },
  light:  { name: 'Lightweight Kit', desc: '−15% reload', apply: (w) => { w.reload *= 0.85; } },
};
export const ATTACHMENT_ORDER = ['extmag', 'grip', 'comp', 'scope', 'laser', 'light'];

// Builds a distinct low-poly view model for each weapon.
function buildModel(kind) {
  const g = new THREE.Group();
  const black = new THREE.MeshStandardMaterial({ color: 0x161616, roughness: 0.55, metalness: 0.4 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x26301a, roughness: 0.8 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x4a4a4a, roughness: 0.4, metalness: 0.6 });

  const add = (geo, mat, x, y, z, rx = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z); m.rotation.x = rx; g.add(m); return m;
  };

  if (kind === 'rifle') {
    add(new THREE.BoxGeometry(0.12, 0.16, 0.6), black, 0, 0, 0);
    add(new THREE.CylinderGeometry(0.025, 0.025, 0.7, 8), black, 0, 0.02, -0.45, Math.PI / 2);
    add(new THREE.BoxGeometry(0.07, 0.22, 0.12), dark, 0, -0.16, 0.05);
    add(new THREE.BoxGeometry(0.09, 0.12, 0.28), dark, 0, -0.01, 0.3);
  } else if (kind === 'smg') {
    add(new THREE.BoxGeometry(0.11, 0.15, 0.4), black, 0, 0, 0);
    add(new THREE.CylinderGeometry(0.022, 0.022, 0.34, 8), black, 0, 0.02, -0.3, Math.PI / 2);
    add(new THREE.BoxGeometry(0.06, 0.26, 0.1), dark, 0, -0.18, 0.04);
    add(new THREE.BoxGeometry(0.05, 0.1, 0.16), steel, 0, 0.02, 0.24);
  } else if (kind === 'shotgun') {
    add(new THREE.BoxGeometry(0.13, 0.15, 0.7), dark, 0, 0, 0);
    add(new THREE.CylinderGeometry(0.04, 0.04, 0.78, 10), black, 0, 0.03, -0.5, Math.PI / 2);
    add(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 8), steel, 0, -0.05, -0.36, Math.PI / 2);
    add(new THREE.BoxGeometry(0.1, 0.14, 0.3), dark, 0, -0.02, 0.34);
  } else if (kind === 'sniper') {
    add(new THREE.BoxGeometry(0.1, 0.14, 0.9), black, 0, 0, 0);
    add(new THREE.CylinderGeometry(0.022, 0.022, 1.0, 8), black, 0, 0.01, -0.6, Math.PI / 2);
    add(new THREE.CylinderGeometry(0.045, 0.045, 0.3, 10), steel, 0, 0.12, -0.1, Math.PI / 2);
    add(new THREE.BoxGeometry(0.08, 0.24, 0.12), dark, 0, -0.17, 0.06);
    add(new THREE.BoxGeometry(0.09, 0.12, 0.34), dark, 0, -0.01, 0.42);
  } else if (kind === 'pistol') {
    add(new THREE.BoxGeometry(0.09, 0.14, 0.26), black, 0, 0, 0);
    add(new THREE.CylinderGeometry(0.018, 0.018, 0.24, 8), black, 0, 0.03, -0.2, Math.PI / 2);
    add(new THREE.BoxGeometry(0.07, 0.18, 0.1), dark, 0, -0.15, 0.06);
  } else if (kind === 'dmr') {
    add(new THREE.BoxGeometry(0.11, 0.15, 0.78), black, 0, 0, 0);
    add(new THREE.CylinderGeometry(0.024, 0.024, 0.95, 8), black, 0, 0.01, -0.55, Math.PI / 2);
    add(new THREE.CylinderGeometry(0.035, 0.035, 0.22, 10), steel, 0, 0.1, -0.05, Math.PI / 2); // optic
    add(new THREE.BoxGeometry(0.08, 0.22, 0.12), dark, 0, -0.16, 0.06);
    add(new THREE.BoxGeometry(0.09, 0.12, 0.32), dark, 0, -0.01, 0.4);
  } else if (kind === 'autoshotgun') {
    add(new THREE.BoxGeometry(0.15, 0.18, 0.62), dark, 0, 0, 0);
    add(new THREE.CylinderGeometry(0.045, 0.045, 0.7, 10), black, 0, 0.04, -0.45, Math.PI / 2);
    add(new THREE.BoxGeometry(0.16, 0.2, 0.2), steel, 0, -0.04, 0.18); // drum mag
    add(new THREE.BoxGeometry(0.09, 0.24, 0.14), dark, 0, -0.18, 0.06);
  } else if (kind === 'railgun') {
    const glow = new THREE.MeshStandardMaterial({ color: 0x0a2230, roughness: 0.3, metalness: 0.8, emissive: 0x1090c0, emissiveIntensity: 0.6 });
    add(new THREE.BoxGeometry(0.13, 0.17, 0.7), black, 0, 0, 0);
    // twin rails
    add(new THREE.BoxGeometry(0.03, 0.03, 1.0), steel, -0.05, 0.06, -0.5);
    add(new THREE.BoxGeometry(0.03, 0.03, 1.0), steel, 0.05, 0.06, -0.5);
    add(new THREE.CylinderGeometry(0.06, 0.06, 0.2, 12), glow, 0, 0.02, 0.12, Math.PI / 2); // energy coil
    add(new THREE.BoxGeometry(0.08, 0.22, 0.12), dark, 0, -0.16, 0.08);
  } else { // lmg
    add(new THREE.BoxGeometry(0.16, 0.2, 0.7), black, 0, 0, 0);
    // rotary barrels
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      add(new THREE.CylinderGeometry(0.02, 0.02, 0.8, 6), steel, Math.cos(a) * 0.05, 0.02 + Math.sin(a) * 0.05, -0.55, Math.PI / 2);
    }
    add(new THREE.BoxGeometry(0.09, 0.26, 0.16), dark, 0, -0.2, 0.06);
    add(new THREE.BoxGeometry(0.18, 0.22, 0.18), dark, 0, 0.02, 0.34); // ammo drum
  }

  const flashMat = new THREE.SpriteMaterial({ color: 0xffe08a, transparent: true, opacity: 0, fog: false, depthTest: false });
  const flash = new THREE.Sprite(flashMat);
  flash.scale.set(0.5, 0.5, 0.5);
  const muzzleZ = kind === 'sniper' ? -1.1 : kind === 'railgun' ? -1.05 : kind === 'dmr' ? -1.0
    : (kind === 'shotgun' || kind === 'lmg' || kind === 'autoshotgun') ? -0.9 : kind === 'pistol' ? -0.35 : -0.8;
  flash.position.set(0, 0.02, muzzleZ);
  g.add(flash);
  g.userData.flash = flash;
  g.userData.muzzleZ = muzzleZ;

  const light = new THREE.PointLight(0xffd070, 0, 9);
  light.position.copy(flash.position);
  g.add(light);
  g.userData.light = light;

  return g;
}

export class WeaponManager {
  constructor(camera, baseFov) {
    this.camera = camera;
    this.baseFov = baseFov;

    this.attachments = {};   // { weaponKey: [attachmentId,...] }
    this.classMods = null;
    this.configure(null, null); // builds this.defs

    this.state = {};
    this.owned = {};
    for (const k of WEAPON_ORDER) {
      this.state[k] = { ammo: this.defs[k].mag, reserve: this.defs[k].reserve };
      this.owned[k] = true;
    }

    this._loadLevels();

    this.current = 'rifle';
    this.reloading = false;
    this.reloadTimer = 0;
    this.fireCd = 0;
    this.ads = false;
    this.adsT = 0;
    this.reloadMul = 1;
    this._shotIndex = 0;
    this._sinceShot = 99;
    this._meleeAnim = 0;

    this.rig = new THREE.Group();
    this.rig.position.set(0.26, -0.26, -0.55);
    this.models = {};
    for (const k of WEAPON_ORDER) {
      const m = buildModel(k);
      m.visible = k === this.current;
      this.models[k] = m;
      this.rig.add(m);
    }
    camera.add(this.rig);
    this._restPos = this.rig.position.clone();
  }

  // ---- leveling (persists across runs) ----
  _loadLevels() {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(LEVEL_KEY) || '{}'); } catch (_) {}
    this.levels = {};
    for (const k of WEAPON_ORDER) {
      const s = saved[k] || {};
      this.levels[k] = { xp: s.xp || 0, level: Math.min(MAX_LEVEL, s.level || 1) };
    }
  }
  _saveLevels() { try { localStorage.setItem(LEVEL_KEY, JSON.stringify(this.levels)); } catch (_) {} }
  getLevel(key = this.current) { return this.levels[key].level; }
  damageMult(key = this.current) { return 1 + (this.levels[key].level - 1) * 0.05; }
  // returns new level if leveled up, else 0
  addXp(amount) {
    const L = this.levels[this.current];
    if (L.level >= MAX_LEVEL) return 0;
    L.xp += amount;
    let leveled = 0;
    while (L.level < MAX_LEVEL && L.xp >= L.level * 120) {
      L.xp -= L.level * 120; L.level += 1; leveled = L.level;
    }
    if (leveled) this._saveLevels();
    return leveled;
  }

  get def() { return this.defs[this.current]; }
  get live() { return this.state[this.current]; }

  // build per-run effective stats from base + class + attachments
  configure(attachments, classMods) {
    this.attachments = attachments || {};
    this.classMods = classMods || null;
    this.defs = {};
    for (const k of WEAPON_ORDER) {
      const w = { ...WEAPONS[k] };
      if (this.classMods && this.classMods.weapon) this.classMods.weapon(w, k);
      for (const id of (this.attachments[k] || [])) { const a = ATTACHMENTS[id]; if (a) a.apply(w); }
      this.defs[k] = w;
    }
  }

  switchTo(key) {
    if (!this.owned[key] || key === this.current || this.reloading) return false;
    this.models[this.current].visible = false;
    this.current = key;
    this.models[key].visible = true;
    this.fireCd = Math.max(this.fireCd, 0.25);
    this._swapAnim = 0.25;
    return true;
  }

  cycle(dir) {
    const i = WEAPON_ORDER.indexOf(this.current);
    let n = i;
    for (let s = 0; s < WEAPON_ORDER.length; s++) {
      n = (n + dir + WEAPON_ORDER.length) % WEAPON_ORDER.length;
      if (this.owned[WEAPON_ORDER[n]]) break;
    }
    this.switchTo(WEAPON_ORDER[n]);
  }

  setAds(on) { this.ads = on && !this.reloading; }

  reload() {
    const w = this.def, s = this.live;
    if (this.reloading || s.ammo >= w.mag || s.reserve <= 0) return false;
    this.reloading = true;
    this.reloadTimer = w.reload * this.reloadMul;
    this.ads = false;
    return true;
  }

  playMelee() { this._meleeAnim = 0.3; }

  // returns { rays, def, dmg, recoilPitch, recoilYaw } or null
  tryFire() {
    if (this.reloading || this.fireCd > 0) return null;
    const w = this.def, s = this.live;
    if (s.ammo <= 0) { this.reload(); return null; }
    s.ammo -= 1;
    this.fireCd = w.fireRate;

    const model = this.models[this.current];
    const flash = model.userData.flash, light = model.userData.light;
    flash.material.opacity = 1;
    flash.scale.setScalar(0.35 + Math.random() * 0.35);
    light.intensity = w.key === 'shotgun' ? 6 : 4;
    this._flashTime = 0.05;
    this._kick = w.kick;

    // deterministic, learnable recoil pattern (resets after a firing gap)
    if (this._sinceShot > 0.35) this._shotIndex = 0;
    this._sinceShot = 0;
    const idx = this._shotIndex++;
    const recoilPitch = w.recoil * (0.6 + 0.5 * Math.min(idx, 8) / 8);
    const recoilYaw = (w.recoilYaw || 0) * Math.sin(idx * 1.7);

    const spread = this.ads ? w.adsSpread : w.spread;
    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);
    const rays = [];
    for (let p = 0; p < w.pellets; p++) {
      const dir = forward.clone();
      if (spread > 0) {
        dir.x += (Math.random() - 0.5) * spread * 2;
        dir.y += (Math.random() - 0.5) * spread * 2;
        dir.z += (Math.random() - 0.5) * spread * 2;
        dir.normalize();
      }
      rays.push(dir);
    }
    return { rays, def: w, dmg: w.dmg * this.damageMult(), recoilPitch, recoilYaw };
  }

  muzzleWorldPos(out) { return this.models[this.current].userData.flash.getWorldPosition(out); }

  reset() {
    for (const k of WEAPON_ORDER) {
      this.state[k] = { ammo: this.defs[k].mag, reserve: this.defs[k].reserve };
    }
    this.current = 'rifle';
    for (const k of WEAPON_ORDER) this.models[k].visible = k === 'rifle';
    this.reloading = false; this.fireCd = 0; this.ads = false; this.adsT = 0;
    this.reloadMul = 1; this._shotIndex = 0; this._sinceShot = 99; this.adsLerp = 12;
    this.camera.fov = this.baseFov; this.camera.updateProjectionMatrix();
  }

  addAmmo(fraction) {
    for (const k of WEAPON_ORDER) {
      if (!this.owned[k]) continue;
      const w = WEAPONS[k], s = this.state[k];
      s.reserve = Math.min(w.reserveMax, s.reserve + Math.ceil(w.reserveMax * fraction));
    }
  }

  update(dt) {
    if (this.fireCd > 0) this.fireCd -= dt;
    this._sinceShot += dt;

    if (this.reloading) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) {
        const w = this.def, s = this.live;
        const need = w.mag - s.ammo;
        const take = Math.min(need, s.reserve);
        s.ammo += take; s.reserve -= take;
        this.reloading = false;
      }
    }

    if (this._flashTime > 0) {
      this._flashTime -= dt;
      if (this._flashTime <= 0) {
        const m = this.models[this.current];
        m.userData.flash.material.opacity = 0;
        m.userData.light.intensity = 0;
      }
    }

    const target = this.ads ? 1 : 0;
    this.adsT += (target - this.adsT) * Math.min(1, dt * (this.adsLerp || 12));
    const w = this.def;
    const fov = this.baseFov / (1 + (w.zoom - 1) * this.adsT);
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov = fov; this.camera.updateProjectionMatrix();
    }

    const hip = this._restPos;
    const aimX = 0, aimY = -0.14, aimZ = -0.4;
    let px = THREE.MathUtils.lerp(hip.x, aimX, this.adsT);
    let py = THREE.MathUtils.lerp(hip.y, aimY, this.adsT);
    let pz = THREE.MathUtils.lerp(hip.z, aimZ, this.adsT);

    if (this._kick > 0) { pz += this._kick; this._kick *= Math.max(0, 1 - dt * 9); if (this._kick < 0.001) this._kick = 0; }
    if (this.reloading) py -= 0.12 * Math.sin((1 - this.reloadTimer / (w.reload * this.reloadMul)) * Math.PI);
    if (this._swapAnim > 0) { this._swapAnim -= dt; py -= 0.3 * (this._swapAnim / 0.25); }

    // melee swing animation
    let rollZ = 0;
    if (this._meleeAnim > 0) {
      this._meleeAnim -= dt;
      const k = 1 - this._meleeAnim / 0.3;
      pz += -0.25 * Math.sin(k * Math.PI);
      rollZ = 0.5 * Math.sin(k * Math.PI);
    }
    this.rig.position.set(px, py, pz);
    this.rig.rotation.z = rollZ;
  }
}
