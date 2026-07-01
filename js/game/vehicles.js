import * as THREE from 'three';

// Arcade vehicles you can ride: a tank, a bike and a jet. Spawned via secret
// codes (see cheats.js). Fully opt-in — none of this runs unless you mount one,
// so single-player and co-op are unaffected.
const DEFS = {
  tank: { name: 'TANK', speed: 12, hp: 800, camBack: 11, camHigh: 6, fly: false, radius: 2.4,
          weapon: 'shell', fireCd: 1.1, auto: false, ramDmg: 30 },
  bike: { name: 'BIKE', speed: 30, hp: 140, camBack: 6, camHigh: 2.8, fly: false, radius: 1.0,
          weapon: 'mg', fireCd: 0.08, auto: true, ramDmg: 12 },
  jet:  { name: 'JET',  speed: 52, hp: 260, camBack: 13, camHigh: 4, fly: true, radius: 1.6,
          weapon: 'rocket', fireCd: 0.45, auto: false, ramDmg: 0 },
};

export class Vehicles {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.mounted = null;
    this.ord = [];           // in-flight ordnance (shells / rockets)
    this._ordGeo = new THREE.SphereGeometry(0.35, 8, 6);
    this._ordMat = new THREE.MeshBasicMaterial({ color: 0xffd070 });
    // cache hot-path DOM refs once — avoids a getElementById lookup every frame
    this._promptEl = document.getElementById('vehicle-prompt');
    this._hudEl = document.getElementById('vehicle-hud');
    this._promptShown = null; // last shown text, so we only touch the DOM on change
  }

  // ---- spawning ----
  spawn(kind, x, z) {
    if (!DEFS[kind]) return null;
    const def = DEFS[kind];
    const group = buildModel(kind);
    const y = def.fly ? 0 : Math.max(0, this.game.world.heightAt(x, z));
    group.position.set(x, y, z);
    this.game.scene.add(group);
    const v = { kind, def, group, yaw: this.game.player.yaw, speed: 0, hp: def.hp, maxHp: def.hp, fireCd: 0, alt: def.fly ? 0 : y };
    this.list.push(v);
    return v;
  }
  spawnNear(kind) {
    const p = this.game.player.position;
    const a = this.game.player.yaw;
    const fx = p.x - Math.sin(a) * -8, fz = p.z - Math.cos(a) * -8; // ~8m ahead
    const v = this.spawn(kind, fx, fz);
    if (v) { this.game.hud.killFeed(`${DEFS[kind].name} deployed — press E to ride`); this.game.audio && this.game.audio.pickup(); }
    return v;
  }

  // ---- mount / dismount ----
  nearest(maxD) {
    const p = this.game.player.position; let best = null, bd = maxD * maxD;
    for (const v of this.list) {
      const dx = v.group.position.x - p.x, dz = v.group.position.z - p.z;
      const d = dx * dx + dz * dz;
      if (d < bd) { bd = d; best = v; }
    }
    return best;
  }
  toggleMount() {
    if (this.mounted) return this.dismount();
    const v = this.nearest(6);
    if (v) this.mount(v);
  }
  mount(v) {
    this.mounted = v;
    this.game.weapons.rig.visible = false;
    this.game.player.yaw = v.yaw;
    this._hud(true);
  }
  dismount() {
    const v = this.mounted; if (!v) return;
    this.mounted = null;
    this.game.weapons.rig.visible = true;
    // step the player out beside the vehicle, on the ground
    const a = v.yaw + Math.PI / 2;
    const px = v.group.position.x + Math.cos(a) * (v.def.radius + 1.2);
    const pz = v.group.position.z + Math.sin(a) * (v.def.radius + 1.2);
    this.game.player.position.set(px, 0, pz);
    this._hud(false);
  }

  isMounted() { return !!this.mounted; }

  // ---- firing (called while mounted) ----
  fire() {
    const v = this.mounted; if (!v || v.fireCd > 0) return;
    v.fireCd = v.def.fireCd;
    const origin = new THREE.Vector3(); this.game.camera.getWorldPosition(origin);
    const dir = new THREE.Vector3(); this.game.camera.getWorldDirection(dir);
    const muzzle = v.group.position.clone().add(dir.clone().multiplyScalar(v.def.radius + 1)).setY(v.group.position.y + 1);
    if (v.def.weapon === 'mg') {
      // hitscan machine gun
      this.game.audio && this.game.audio.shoot('lmg');
      const hit = this.game.waves.raycastRay(this.game.raycaster, origin, dir, 160);
      const bp = this.game.world.baseHitPoint(origin, dir);
      this.game.effects.tracer(muzzle, hit ? hit.point : (bp ? bp.point : origin.clone().addScaledVector(dir, 120)), 0xffd070);
      if (hit) { hit.enemy.hit(2, hit.zone); this.game.effects.bloodBurst(hit.point); }
      else if (bp) { if (this.game.world.damageBase(6, bp.base)) this.game._onBaseDestroyed(bp.base); this.game.effects.impact(bp.point, 0xff7040, false); }
    } else {
      // launch ordnance (tank shell / jet rocket)
      this.launchOrdnance(v.def.weapon, muzzle, dir);
      this.game.audio && this.game.audio.shoot(v.def.weapon === 'shell' ? 'sniper' : 'railgun');
      this.game.shake = Math.min(0.6, this.game.shake + 0.25);
    }
  }

  // shared explosive projectile (also used by the handheld rocket launcher)
  launchOrdnance(kind, origin, dir, opts = {}) {
    const mesh = new THREE.Mesh(this._ordGeo, this._ordMat);
    mesh.scale.setScalar(kind === 'shell' ? 1.3 : 1);
    mesh.position.copy(origin);
    this.game.scene.add(mesh);
    const speed = kind === 'shell' ? 90 : 70;
    this.ord.push({ mesh, vel: dir.clone().multiplyScalar(speed), life: 4,
      radius: kind === 'shell' ? 9 : 7, baseDmg: kind === 'shell' ? 180 : 230, kind });
  }

  _explodeOrd(o) {
    const p = o.mesh.position;
    this.game.scene.remove(o.mesh);
    this.game._detonate(p.x, p.z, o.radius, 8, 30);
    // big damage to any base the blast lands on
    for (const b of (this.game.world.bases || [])) {
      if (b.alive && Math.hypot(p.x - b.x, p.z - b.z) < o.radius + b.r) {
        if (this.game.world.damageBase(o.baseDmg, b)) this.game._onBaseDestroyed(b);
      }
    }
  }

  // ---- per-frame ----
  update(dt) {
    // ordnance flight
    for (let i = this.ord.length - 1; i >= 0; i--) {
      const o = this.ord[i];
      o.vel.y -= 12 * dt; // slight drop
      o.mesh.position.addScaledVector(o.vel, dt);
      o.life -= dt;
      const p = o.mesh.position;
      const b = this.game.world._nearestBase ? this.game.world._nearestBase(p.x, p.z) : this.game.world.base;
      const hitBase = b && b.alive && Math.hypot(p.x - b.x, p.y - (b.coreY || 3.6), p.z - b.z) < b.r + 0.6;
      if (p.y <= 0.2 || o.life <= 0 || hitBase) { this._explodeOrd(o); this.ord.splice(i, 1); }
    }
    if (this.mounted) this._drive(dt);
  }

  _drive(dt) {
    const v = this.mounted, d = v.def, keys = this.game.player.keys, ply = this.game.player;
    if (v.fireCd > 0) v.fireCd -= dt;
    v.yaw = ply.yaw; // steer by looking

    let thr = 0;
    if (keys['KeyW']) thr += 1;
    if (keys['KeyS']) thr -= 1;
    if (ply.touchVec && ply.touchVec.y) thr += ply.touchVec.y;
    const targetSpeed = thr * d.speed;
    v.speed += (targetSpeed - v.speed) * Math.min(1, dt * 3);

    const fwd = new THREE.Vector3(-Math.sin(v.yaw), 0, -Math.cos(v.yaw));
    const np = v.group.position.clone().addScaledVector(fwd, v.speed * dt);

    if (d.fly) {
      // climb/dive by looking up/down, plus boosters
      let climb = -ply.pitch * Math.abs(v.speed) * 1.1 * dt;
      if (keys['Space']) climb += d.speed * 0.5 * dt;
      if (keys['ControlLeft'] || keys['ShiftLeft'] || keys['KeyC']) climb -= d.speed * 0.5 * dt;
      v.alt = Math.max(2, Math.min(140, v.alt + climb));
      np.y = v.alt;
      const dc = Math.hypot(np.x, np.z); if (dc > 220) { np.x = np.x / dc * 220; np.z = np.z / dc * 220; }
    } else {
      const r = this.game.world.resolve(np.x, np.z, d.radius);
      np.x = r.x; np.z = r.z;
      np.y = Math.max(0, this.game.world.heightAt(np.x, np.z));
      v.group.rotation.z = -ply.yaw && v.kind === 'bike' ? 0 : 0; // (lean handled below)
    }
    v.group.position.copy(np);
    v.group.rotation.y = v.yaw;
    // bike leans into speed; tank/jet pitch slightly with motion
    if (v.kind === 'bike') v.group.rotation.z = THREE.MathUtils.clamp(-thr * 0.0, -0.3, 0.3);
    if (d.fly) v.group.rotation.x = THREE.MathUtils.clamp(ply.pitch * 0.5, -0.5, 0.5);

    // ramming (tank/bike) — flatten enemies you drive into
    if (d.ramDmg && Math.abs(v.speed) > 6) {
      for (const e of this.game.waves.enemies) {
        if (e.dead) continue;
        if (Math.hypot(e.group.position.x - np.x, e.group.position.z - np.z) < d.radius + 0.8) {
          e.hit(d.ramDmg); this.game.effects.bloodBurst(e.group.position.clone().setY(1.2));
        }
      }
    }

    // keep the player rig under the vehicle (enemy targeting + dismount point)
    ply.position.set(np.x, 0, np.z);

    // chase camera
    const cam = this.game.camera;
    const back = fwd.clone().multiplyScalar(-d.camBack);
    cam.position.set(np.x + back.x, np.y + d.camHigh, np.z + back.z);
    cam.lookAt(np.x + fwd.x * 4, np.y + 1.2, np.z + fwd.z * 4);

    this._hudUpdate(v);
  }

  _hud(on) {
    const el = this._hudEl;
    if (el) el.classList.toggle('hidden', !on);
    this._hudKey = null; // force a fresh write on the next _hudUpdate
    if (!on) { if (this._promptEl) this._promptEl.classList.add('hidden'); this._promptShown = null; }
  }
  _hudUpdate(v) {
    const el = this._hudEl; if (!el) return;
    const spd = Math.round(Math.abs(v.speed) * 3.6);
    const alt = v.def.fly ? Math.round(v.alt) : 0;
    // the rounded readout usually holds steady frame-to-frame — skip the
    // string rebuild + DOM write unless something the player would see changed
    const key = spd + ':' + alt;
    if (key === this._hudKey) return;
    this._hudKey = key;
    el.textContent = v.def.fly
      ? `✈ ${v.def.name}  ·  ${spd} km/h  ·  ALT ${alt}m  ·  [Click] Rockets  ·  [E] Exit`
      : `▣ ${v.def.name}  ·  ${spd} km/h  ·  [Click] Fire  ·  [E] Exit`;
  }

  // prompt shown when on foot near a ridable vehicle. Only touches the DOM
  // when the shown text actually changes, instead of writing every frame.
  promptTick() {
    if (this.mounted) return;
    const el = this._promptEl; if (!el) return;
    const v = this.nearest(6);
    const next = v ? `[E] Ride ${v.def.name}` : null;
    if (next === this._promptShown) return;
    this._promptShown = next;
    if (next) { el.textContent = next; el.classList.remove('hidden'); }
    else el.classList.add('hidden');
  }

  reset() {
    for (const v of this.list) this.game.scene.remove(v.group);
    for (const o of this.ord) this.game.scene.remove(o.mesh);
    this.list = []; this.ord = []; this.mounted = null;
    if (this.game.weapons) this.game.weapons.rig.visible = true;
    this._hud(false);
  }
}

// ---- low-poly vehicle models ----
function buildModel(kind) {
  const g = new THREE.Group();
  const M = (c, r = 0.7, m = 0.3) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m, flatShading: true });
  const add = (geo, mat, x, y, z, ry = 0) => { const me = new THREE.Mesh(geo, mat); me.position.set(x, y, z); me.rotation.y = ry; me.castShadow = true; g.add(me); return me; };

  if (kind === 'tank') {
    const body = M(0x46502f), tread = M(0x1c1c18, 0.95, 0.1), turret = M(0x3c4528);
    add(new THREE.BoxGeometry(2.6, 0.9, 3.8), body, 0, 0.9, 0);
    add(new THREE.BoxGeometry(0.7, 0.7, 4.2), tread, -1.4, 0.5, 0);
    add(new THREE.BoxGeometry(0.7, 0.7, 4.2), tread, 1.4, 0.5, 0);
    add(new THREE.BoxGeometry(1.7, 0.7, 1.9), turret, 0, 1.6, -0.2);
    add(new THREE.CylinderGeometry(0.16, 0.16, 2.6, 8), turret, 0, 1.7, -1.9, 0).rotation.x = Math.PI / 2;
  } else if (kind === 'bike') {
    const frame = M(0xb01818, 0.5, 0.5), wheel = M(0x111111, 0.9, 0.1), chrome = M(0x999999, 0.3, 0.8);
    add(new THREE.BoxGeometry(0.5, 0.4, 2.2), frame, 0, 0.9, 0);
    const w1 = add(new THREE.TorusGeometry(0.55, 0.18, 8, 14), wheel, 0, 0.6, 1.2); w1.rotation.y = Math.PI / 2;
    const w2 = add(new THREE.TorusGeometry(0.55, 0.18, 8, 14), wheel, 0, 0.6, -1.2); w2.rotation.y = Math.PI / 2;
    add(new THREE.BoxGeometry(0.7, 0.16, 0.4), chrome, 0, 1.15, 1.0);
    add(new THREE.BoxGeometry(0.45, 0.5, 0.7), frame, 0, 1.15, -0.4);
  } else { // jet
    const body = M(0x9aa3ad, 0.5, 0.6), wing = M(0x7c8590, 0.5, 0.5), glass = M(0x223344, 0.2, 0.9);
    add(new THREE.CylinderGeometry(0.5, 0.5, 4.4, 10), body, 0, 1.5, 0).rotation.x = Math.PI / 2;
    add(new THREE.ConeGeometry(0.5, 1.4, 10), body, 0, 1.5, -2.8).rotation.x = -Math.PI / 2;
    add(new THREE.BoxGeometry(6.2, 0.16, 1.4), wing, 0, 1.45, 0.2);
    add(new THREE.BoxGeometry(2.0, 0.14, 1.0), wing, 0, 1.45, 2.0);
    add(new THREE.BoxGeometry(0.14, 1.0, 1.0), wing, 0, 2.0, 2.2);
    add(new THREE.SphereGeometry(0.45, 10, 8), glass, 0, 1.8, -0.6);
  }
  return g;
}
