import * as THREE from 'three';

// ---- Arsenal ----
// dmg is in "hit points"; enemy HP is tuned around the rifle dealing 1/shot.
export const WEAPONS = {
  rifle: {
    key: 'rifle', name: 'KR-15 RIFLE', slot: 1, auto: true,
    dmg: 1, fireRate: 0.10, mag: 30, reserveMax: 180, reserve: 120,
    spread: 0.014, adsSpread: 0.004, recoil: 0.022, kick: 0.03,
    pellets: 1, reload: 1.6, zoom: 1.4, range: 200, tracer: 0xffe08a,
  },
  smg: {
    key: 'smg', name: 'V-9 SMG', slot: 2, auto: true,
    dmg: 0.7, fireRate: 0.062, mag: 40, reserveMax: 280, reserve: 160,
    spread: 0.03, adsSpread: 0.014, recoil: 0.016, kick: 0.022,
    pellets: 1, reload: 1.4, zoom: 1.25, range: 140, tracer: 0xaef0ff,
  },
  shotgun: {
    key: 'shotgun', name: 'BR-2 BREACHER', slot: 3, auto: false,
    dmg: 0.9, fireRate: 0.72, mag: 7, reserveMax: 56, reserve: 35,
    spread: 0.085, adsSpread: 0.06, recoil: 0.06, kick: 0.07,
    pellets: 9, reload: 2.2, zoom: 1.15, range: 60, tracer: 0xffd070,
  },
  sniper: {
    key: 'sniper', name: 'LR-7 MARKSMAN', slot: 4, auto: false,
    dmg: 6, fireRate: 1.05, mag: 5, reserveMax: 40, reserve: 25,
    spread: 0.002, adsSpread: 0.0, recoil: 0.09, kick: 0.11,
    pellets: 1, reload: 2.4, zoom: 3.2, range: 300, tracer: 0xff9d5c,
  },
};

export const WEAPON_ORDER = ['rifle', 'smg', 'shotgun', 'sniper'];

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
  } else { // sniper
    add(new THREE.BoxGeometry(0.1, 0.14, 0.9), black, 0, 0, 0);
    add(new THREE.CylinderGeometry(0.022, 0.022, 1.0, 8), black, 0, 0.01, -0.6, Math.PI / 2);
    // scope
    add(new THREE.CylinderGeometry(0.045, 0.045, 0.3, 10), steel, 0, 0.12, -0.1, Math.PI / 2);
    add(new THREE.BoxGeometry(0.08, 0.24, 0.12), dark, 0, -0.17, 0.06);
    add(new THREE.BoxGeometry(0.09, 0.12, 0.34), dark, 0, -0.01, 0.42);
  }

  // muzzle flash + light shared
  const flashMat = new THREE.SpriteMaterial({ color: 0xffe08a, transparent: true, opacity: 0, fog: false, depthTest: false });
  const flash = new THREE.Sprite(flashMat);
  flash.scale.set(0.5, 0.5, 0.5);
  const muzzleZ = kind === 'sniper' ? -1.1 : kind === 'shotgun' ? -0.9 : -0.8;
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

    // per-weapon live ammo state (cloned so resets are easy)
    this.state = {};
    for (const k of WEAPON_ORDER) {
      const w = WEAPONS[k];
      this.state[k] = { ammo: w.mag, reserve: w.reserve };
    }
    this.owned = { rifle: true, smg: true, shotgun: true, sniper: true };

    this.current = 'rifle';
    this.reloading = false;
    this.reloadTimer = 0;
    this.fireCd = 0;
    this.ads = false;
    this.adsT = 0; // 0..1 aim progress

    // build & mount all models, hide inactive
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

  get def() { return WEAPONS[this.current]; }
  get live() { return this.state[this.current]; }

  switchTo(key) {
    if (!this.owned[key] || key === this.current || this.reloading) return false;
    this.models[this.current].visible = false;
    this.current = key;
    this.models[key].visible = true;
    this.fireCd = Math.max(this.fireCd, 0.25); // small swap delay
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
    this.reloadTimer = w.reload;
    this.ads = false;
    return true;
  }

  // returns { rays:[dir...], def } or null
  tryFire() {
    if (this.reloading || this.fireCd > 0) return null;
    const w = this.def, s = this.live;
    if (s.ammo <= 0) { this.reload(); return null; }
    s.ammo -= 1;
    this.fireCd = w.fireRate;

    // muzzle flash
    const model = this.models[this.current];
    const flash = model.userData.flash, light = model.userData.light;
    flash.material.opacity = 1;
    flash.scale.setScalar(0.35 + Math.random() * 0.35);
    light.intensity = w.key === 'shotgun' ? 6 : 4;
    this._flashTime = 0.05;

    // recoil kick on the rig
    this._kick = w.kick;

    // build pellet directions from camera forward with spread
    const spread = (this.ads ? w.adsSpread : w.spread);
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
    return { rays, def: w, recoil: w.recoil };
  }

  muzzleWorldPos(out) {
    const model = this.models[this.current];
    return model.userData.flash.getWorldPosition(out);
  }

  reset() {
    for (const k of WEAPON_ORDER) {
      this.state[k] = { ammo: WEAPONS[k].mag, reserve: WEAPONS[k].reserve };
    }
    this.current = 'rifle';
    for (const k of WEAPON_ORDER) this.models[k].visible = k === 'rifle';
    this.reloading = false; this.fireCd = 0; this.ads = false; this.adsT = 0;
    this.camera.fov = this.baseFov; this.camera.updateProjectionMatrix();
  }

  addAmmo(fraction) {
    // top up reserve for ALL owned weapons by a fraction of their max
    for (const k of WEAPON_ORDER) {
      if (!this.owned[k]) continue;
      const w = WEAPONS[k], s = this.state[k];
      s.reserve = Math.min(w.reserveMax, s.reserve + Math.ceil(w.reserveMax * fraction));
    }
  }

  update(dt) {
    if (this.fireCd > 0) this.fireCd -= dt;

    // reload
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

    // flash decay
    if (this._flashTime > 0) {
      this._flashTime -= dt;
      if (this._flashTime <= 0) {
        const m = this.models[this.current];
        m.userData.flash.material.opacity = 0;
        m.userData.light.intensity = 0;
      }
    }

    // ADS interpolation
    const target = this.ads ? 1 : 0;
    this.adsT += (target - this.adsT) * Math.min(1, dt * 12);
    const w = this.def;
    const fov = this.baseFov / (1 + (w.zoom - 1) * this.adsT);
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov = fov; this.camera.updateProjectionMatrix();
    }

    // rig position: hip -> centered when ADS; plus recoil kick & reload dip
    const hip = this._restPos;
    const aimX = 0, aimY = -0.14, aimZ = -0.4;
    let px = THREE.MathUtils.lerp(hip.x, aimX, this.adsT);
    let py = THREE.MathUtils.lerp(hip.y, aimY, this.adsT);
    let pz = THREE.MathUtils.lerp(hip.z, aimZ, this.adsT);

    if (this._kick > 0) { pz += this._kick; this._kick *= Math.max(0, 1 - dt * 9); if (this._kick < 0.001) this._kick = 0; }
    if (this.reloading) py -= 0.12 * Math.sin((1 - this.reloadTimer / w.reload) * Math.PI);
    if (this._swapAnim > 0) { this._swapAnim -= dt; py -= 0.3 * (this._swapAnim / 0.25); }

    this.rig.position.set(px, py, pz);
  }
}
