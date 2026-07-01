import * as THREE from 'three';

// Shared box-geometry cache. Enemies are built from ~20 boxes each; without this
// every spawn allocated fresh geometries (heavy GC + GPU upload, the main cause
// of wave-spawn hitches). Cached geometries are reused and never disposed.
const _boxGeoCache = new Map();
function boxGeo(w, h, d) {
  const k = w.toFixed(3) + ',' + h.toFixed(3) + ',' + d.toFixed(3);
  let g = _boxGeoCache.get(k);
  if (!g) { g = new THREE.BoxGeometry(w, h, d); g.userData.shared = true; _boxGeoCache.set(k, g); }
  return g;
}

// Enemy archetypes.
const TYPES = {
  grunt:   { hp: 2,   speed: 3.2, scale: 1.0,  color: 0xe03a2f, score: 100,  dmg: 8 },
  runner:  { hp: 1,   speed: 6.2, scale: 0.85, color: 0xff7a3a, score: 150,  dmg: 6 },
  brute:   { hp: 8,   speed: 2.0, scale: 1.5,  color: 0xb01818, score: 350,  dmg: 16 },
  // ranged: keeps its distance and spits projectiles
  spitter: { hp: 3,   speed: 2.8, scale: 0.95, color: 0xc23ad0, score: 220,  dmg: 11,
             ranged: true, prefDist: 17, fireCd: 2.2, projSpeed: 30 },
  // rushes the player and detonates on contact or death
  exploder:{ hp: 2,   speed: 5.0, scale: 1.0,  color: 0xd0e03a, score: 250,  dmg: 0, explode: true },
  // frontal shield plate blocks most damage; flank, headshot or blast it
  shielded:{ hp: 5,   speed: 2.4, scale: 1.15, color: 0x4a7ab0, score: 300,  dmg: 12, shield: true },
  // hangs back and summons grunts
  summoner:{ hp: 5,   speed: 2.2, scale: 1.1,  color: 0x9a40d0, score: 320,  dmg: 8,
             prefDist: 22, summonCd: 6 },
  // fast flanker that periodically lunges in for a vicious melee
  stalker: { hp: 2,   speed: 5.4, scale: 0.9,  color: 0x7a2fc0, score: 220,  dmg: 14, lunge: true },
  // long-range marksman: a slow, telegraphed, high-damage single shot
  sniper:  { hp: 3,   speed: 2.3, scale: 1.0,  color: 0x2f8a5a, score: 300,  dmg: 26,
             ranged: true, sniper: true, prefDist: 30, fireCd: 3.6, projSpeed: 64, volley: 1 },
  // ---- undead horde ----
  zombie:  { hp: 3,   speed: 2.2, scale: 1.0,  color: 0x6f8a3f, score: 130,  dmg: 12, zombie: true },
  feral:   { hp: 2,   speed: 6.0, scale: 0.92, color: 0x7d9a4a, score: 180,  dmg: 9,  zombie: true, lunge: true },
  lurker:  { hp: 14,  speed: 1.7, scale: 1.55, color: 0x53702f, score: 420,  dmg: 22, zombie: true },
  // ---- armed raiders: carry a rifle and fire aimed bullets ----
  gunner:  { hp: 4,   speed: 2.6, scale: 1.0,  color: 0x4a5a30, score: 280,  dmg: 9,
             ranged: true, gun: true, prefDist: 20, fireCd: 1.5, projSpeed: 72, volley: 1 },
  raider:  { hp: 6,   speed: 2.2, scale: 1.05, color: 0x5a4a2a, score: 360,  dmg: 11,
             ranged: true, gun: true, prefDist: 16, fireCd: 0.9, projSpeed: 70, volley: 3 },
  // boss: huge, tanky, heavy melee + ranged volleys
  boss:    { hp: 110, speed: 1.8, scale: 3.0,  color: 0x8a1020, score: 3000, dmg: 32,
             ranged: true, prefDist: 9, fireCd: 3.0, projSpeed: 26, volley: 3, boss: true },
  // NAMED BOSS — three escalating phases: volleys -> summons -> enraged slams
  warden:  { hp: 260, speed: 1.9, scale: 3.5,  color: 0x6a0d8a, score: 6000, dmg: 36,
             ranged: true, prefDist: 11, fireCd: 2.6, projSpeed: 28, volley: 3,
             boss: true, phases: true, named: 'THE WARDEN' },
};

export class Enemy {
  constructor(scene, type, pos, hpScale = 1, mods = null) {
    this.scene = scene;
    this.type = type;
    const def = TYPES[type];
    this.def = def;
    const md = mods || { speed: 1, dmg: 1 };
    this.hp = Math.ceil(def.hp * hpScale);
    this.maxHp = this.hp;
    this.speed = def.speed * md.speed;
    this.dmg = def.dmg * md.dmg;
    this.score = def.score;
    this.ranged = !!def.ranged;
    this.isBoss = !!def.boss;
    this.explode = !!def.explode;
    this.shield = !!def.shield;
    this.isSummoner = !!def.summonCd;
    this.lunge = !!def.lunge;
    this.sniper = !!def.sniper;
    this.zombie = !!def.zombie;
    this.gun = !!def.gun;
    this.phases = !!def.phases;
    this.named = def.named || null;
    this.phase = 1;
    this.alerted = false;   // stealth: enemies start unaware until they detect/are shot
    this._lungeCd = 1 + Math.random() * 2;
    this._lungeT = 0; this._charge = 0; this._enraged = false;
    this._wSummonCd = 6; this._slamCd = 4; this._slamT = 0;
    this.prefDist = def.prefDist || 0;
    this.projSpeed = def.projSpeed || 0;
    this.volley = def.volley || 1;
    this.dead = false;
    this.scored = false;
    this.dyingT = 0;
    this.wantsSummon = false;
    this.attackCd = 0;
    this.fireCd = (def.fireCd || 0) * (0.5 + Math.random());
    this.summonCd = (def.summonCd || 0) * (0.6 + Math.random() * 0.6);
    this.radius = 0.6 * def.scale;

    this.group = new THREE.Group();
    this._buildBody(def);
    this.group.position.copy(pos);
    this.group.position.y = 0;
    scene.add(this.group);

    this._buildHealthBar();
  }

  _buildBody(def) {
    const mat = new THREE.MeshStandardMaterial({ color: def.color, roughness: this.zombie ? 0.97 : 0.8, flatShading: true, emissive: this.zombie ? 0x0a1500 : 0x300000, emissiveIntensity: this.zombie ? 0.12 : 0.4 });
    const darkMat = new THREE.MeshStandardMaterial({ color: this.isBoss ? 0x2a0608 : this.zombie ? 0x2e3a1e : 0x5a0d08, roughness: 0.9, flatShading: true });
    const gearMat = new THREE.MeshStandardMaterial({ color: this.isBoss ? 0x140305 : this.zombie ? 0x44371f : 0x3a3026, roughness: 0.85, flatShading: true, metalness: 0.2 });
    const s = def.scale;
    const box = (w, h, d, m) => new THREE.Mesh(boxGeo(w * s, h * s, d * s), m);

    // ---- torso: pelvis + chest + a strapped vest, with a slight forward hunch
    const upper = new THREE.Group();
    upper.position.y = 0.98 * s;
    this._restLean = this.zombie ? 0.24 : 0.06;   // zombies hunch forward
    upper.rotation.x = this._restLean;
    this.group.add(upper);
    this._upper = upper;
    this._upperBaseY = 0.98 * s;

    const pelvis = box(0.6, 0.42, 0.42, darkMat); pelvis.position.y = 0.02 * s; upper.add(pelvis);
    const torso = box(0.8, 0.86, 0.48, mat); torso.position.y = 0.5 * s; torso.castShadow = true; upper.add(torso);
    const vest = box(0.7, 0.5, 0.16, gearMat); vest.position.set(0, 0.52 * s, 0.27 * s); upper.add(vest); // chest plate
    const shoulders = box(1.0, 0.26, 0.42, mat); shoulders.position.y = 0.86 * s; shoulders.castShadow = true; upper.add(shoulders);
    const neck = box(0.2, 0.18, 0.2, darkMat); neck.position.y = 1.0 * s; upper.add(neck);

    // ---- head (carries the headshot zone) + brow + glowing eyes
    const head = box(0.5, 0.5, 0.5, mat);
    head.position.y = 1.28 * s; head.castShadow = true; head.userData.zone = 'head';
    upper.add(head);
    const brow = box(0.54, 0.12, 0.12, gearMat); brow.position.set(0, 1.4 * s, 0.22 * s); upper.add(brow);
    const eyeHex = this.zombie ? 0xcdec4f : this.ranged ? (this.isBoss ? 0xff5050 : 0xff66ff) : 0xffdd33;
    const eyeMat = new THREE.MeshBasicMaterial({ color: eyeHex });
    [-0.12, 0.12].forEach((ex) => {
      const eye = new THREE.Mesh(new THREE.BoxGeometry(0.11 * s, 0.09 * s, 0.05), eyeMat);
      eye.position.set(ex * s, 1.26 * s, 0.26 * s);
      upper.add(eye);
    });

    // ---- articulated arms: shoulder group -> upper arm -> elbow group (forearm + hand)
    this.arms = []; this.elbows = [];
    [-1, 1].forEach((side) => {
      const arm = new THREE.Group();
      arm.position.set(side * 0.55 * s, 0.84 * s, 0);
      const up = box(0.2, 0.5, 0.22, darkMat); up.position.y = -0.25 * s; arm.add(up);
      const elbow = new THREE.Group(); elbow.position.y = -0.5 * s; arm.add(elbow);
      const fore = box(0.17, 0.46, 0.19, mat); fore.position.set(0, -0.23 * s, 0.04 * s); elbow.add(fore);
      const hand = box(0.18, 0.18, 0.18, gearMat); hand.position.set(0, -0.48 * s, 0.06 * s); elbow.add(hand);
      upper.add(arm);
      this.arms.push(arm); this.elbows.push(elbow);
    });

    // ---- articulated legs: hip group -> thigh -> knee group (shin + boot)
    this.legs = []; this.knees = [];
    [-1, 1].forEach((side) => {
      const leg = new THREE.Group();
      leg.position.set(side * 0.2 * s, 0, 0); // hip ~= upper origin (y 0.98s)
      const thigh = box(0.28, 0.5, 0.3, darkMat); thigh.position.y = -0.27 * s; leg.add(thigh);
      const knee = new THREE.Group(); knee.position.y = -0.52 * s; leg.add(knee);
      const shin = box(0.22, 0.48, 0.24, darkMat); shin.position.y = -0.22 * s; knee.add(shin);
      const boot = box(0.26, 0.16, 0.44, gearMat); boot.position.set(0, -0.48 * s, 0.1 * s); knee.add(boot);
      upper.add(leg);
      this.legs.push(leg); this.knees.push(knee);
    });

    // ranged casters (spitter/summoner/boss) carry a glowing orb (cast origin)
    if ((this.ranged || this.isSummoner) && !this.gun) {
      const orbHex = this.isBoss ? 0xff4030 : this.isSummoner ? 0xc080ff : 0xd86bff;
      const orb = new THREE.Mesh(
        new THREE.SphereGeometry(0.18 * s, 8, 6),
        new THREE.MeshBasicMaterial({ color: orbHex })
      );
      orb.position.set(0.62 * s, 1.0 * s, 0.4 * s);
      this.group.add(orb);
      this._orb = orb;
      this._orbHex = orbHex;
    }

    // armed raiders carry a rifle, held forward in both hands, with a muzzle flash
    if (this.gun) {
      this.arms[0].rotation.x = -1.2; this.arms[1].rotation.x = -1.25;
      if (this.elbows) { this.elbows[0].rotation.x = 0.7; this.elbows[1].rotation.x = 0.55; }
      const gunMat = new THREE.MeshStandardMaterial({ color: 0x202320, roughness: 0.5, metalness: 0.5, flatShading: true });
      const gun = new THREE.Group();
      const body = new THREE.Mesh(boxGeo(0.12 * s, 0.13 * s, 0.7 * s), gunMat); body.position.z = 0.18 * s; gun.add(body);
      const barrel = new THREE.Mesh(boxGeo(0.06 * s, 0.06 * s, 0.46 * s), gunMat); barrel.position.z = 0.56 * s; gun.add(barrel);
      const mag = new THREE.Mesh(boxGeo(0.08 * s, 0.24 * s, 0.12 * s), gunMat); mag.position.set(0, -0.15 * s, 0.16 * s); gun.add(mag);
      gun.position.set(0.16 * s, 0.96 * s, 0.42 * s);
      this.group.add(gun); this._gun = gun;
      const flash = new THREE.Mesh(new THREE.SphereGeometry(0.17 * s, 6, 5), new THREE.MeshBasicMaterial({ color: 0xffd86b, transparent: true, opacity: 0, depthWrite: false }));
      flash.position.set(0.16 * s, 0.96 * s, 1.22 * s);
      this.group.add(flash);
      this._muzzleFlash = flash; this._orb = flash; // shots originate from the muzzle
    }

    // exploder: glowing volatile core
    if (this.explode) {
      const core = new THREE.Mesh(
        new THREE.SphereGeometry(0.3 * s, 10, 8),
        new THREE.MeshBasicMaterial({ color: 0xffff66 })
      );
      core.position.y = 1.45 * s;
      this.group.add(core);
      this._core = core;
    }

    // shielded: a thick frontal plate that absorbs damage (its own hit zone)
    if (this.shield) {
      const shieldMat = new THREE.MeshStandardMaterial({ color: 0x9fc4f0, roughness: 0.4, metalness: 0.6, flatShading: true });
      const plate = new THREE.Mesh(new THREE.BoxGeometry(1.2 * s, 1.5 * s, 0.18 * s), shieldMat);
      plate.position.set(0, 1.2 * s, 0.5 * s);
      plate.userData.zone = 'shield';
      plate.castShadow = true;
      this.group.add(plate);
    }

    // boss shoulder plates
    if (this.isBoss) {
      [-1, 1].forEach((side) => {
        const plate = new THREE.Mesh(new THREE.BoxGeometry(0.5 * s, 0.3 * s, 0.7 * s), darkMat);
        plate.position.set(side * 0.7 * s, 1.7 * s, 0); plate.castShadow = true;
        this.group.add(plate);
      });
    }
    // named/phased boss: a glowing crown of horns marks the apex threat
    if (this.phases) {
      const crestMat = new THREE.MeshBasicMaterial({ color: 0xc451ff });
      [-0.34, 0, 0.34].forEach((cx, idx) => {
        const horn = new THREE.Mesh(new THREE.ConeGeometry(0.12 * s, (0.5 + (idx === 1 ? 0.25 : 0)) * s, 6), crestMat);
        horn.position.set(cx * s, 1.7 * s, 0);
        this.group.add(horn);
      });
      this._crestMat = crestMat;
    }

    this.bodyHeight = 2.5 * s;
    this._mat = mat;
  }

  _buildHealthBar() {
    const w = this.isBoss ? 3.2 : 1.2;
    const bg = new THREE.Mesh(
      new THREE.PlaneGeometry(w, this.isBoss ? 0.3 : 0.16),
      new THREE.MeshBasicMaterial({ color: 0x220505, transparent: true, opacity: 0.85 })
    );
    const fill = new THREE.Mesh(
      new THREE.PlaneGeometry(w, this.isBoss ? 0.3 : 0.16),
      new THREE.MeshBasicMaterial({ color: 0xff3b2f })
    );
    fill.position.z = 0.001;
    this._hbWidth = w;
    this.hbGroup = new THREE.Group();
    this.hbGroup.add(bg);
    this.hbGroup.add(fill);
    this.hbGroup.position.y = this.bodyHeight + (this.isBoss ? 0.6 : 0.35);
    this.hbFill = fill;
    this.group.add(this.hbGroup);
    this._updateHealthBar();
  }

  _updateHealthBar() {
    const frac = Math.max(0, this.hp / this.maxHp);
    this.hbFill.scale.x = frac;
    this.hbFill.position.x = -(this._hbWidth * (1 - frac)) / 2;
    this.hbFill.material.color.setHex(frac > 0.5 ? 0xff3b2f : 0xffa033);
    this.hbGroup.visible = this.isBoss || this.hp < this.maxHp;
  }

  hit(dmg, zone) {
    if (this.dead) return false;
    this.alerted = true;     // taking fire instantly alerts them
    let d = dmg;
    if (zone === 'shield') d *= 0.15;       // frontal plate absorbs most of it
    this.hp -= d;
    this._updateHealthBar();
    this._mat.emissive.setHex(0xffffff);
    this._mat.emissiveIntensity = 1;
    this._flash = 0.1;
    this._flinch = 0.18; // brief hit reaction (upper-body jerk)
    if (this.hp <= 0) { this._startDeath(); return true; }
    return false;
  }

  _startDeath() {
    this.dead = true;
    this.dyingT = 0.9;
    this.hbGroup.visible = false;
    // topple direction
    this._fallAxis = Math.random() < 0.5 ? 'x' : 'z';
    this._fallDir = Math.random() < 0.5 ? 1 : -1;
    // crumple the limbs so the body folds rather than toppling rigid
    if (this.knees) { this.knees[0].rotation.x = 1.2; this.knees[1].rotation.x = 0.7; }
    if (this.elbows) { this.elbows[0].rotation.x = 1.0; this.elbows[1].rotation.x = 1.3; }
    if (this.arms) { this.arms[0].rotation.x = -0.6; this.arms[1].rotation.x = 0.9; }
  }

  // returns { melee, shots, summon, bark, shockwave, phaseChange }
  // `detect` is the range at which this enemy notices the player (shrunk by the
  // player's stealth/crouch). Until alerted it just drifts in slowly, no attacks.
  update(dt, target, camera, world, detect = 16) {
    const result = { melee: false, shots: null, summon: false, bark: false };

    // ---- death / ragdoll animation ----
    if (this.dead) {
      this.dyingT -= dt;
      const g = this.group;
      // topple over and sink, then fade
      const fall = Math.min(1, (0.9 - this.dyingT) / 0.5);
      g.rotation[this._fallAxis] = this._fallDir * fall * Math.PI * 0.5;
      g.position.y = -0.2 * Math.max(0, (0.4 - this.dyingT) / 0.4);
      if (this.dyingT < 0.4) {
        const o = Math.max(0, this.dyingT / 0.4);
        this.group.traverse((m) => {
          if (m.material && 'opacity' in m.material) { m.material.transparent = true; m.material.opacity = o; }
        });
      }
      return result;
    }

    if (this._flash > 0) {
      this._flash -= dt;
      if (this._flash <= 0) { this._mat.emissive.setHex(this.zombie ? 0x0a1500 : 0x300000); this._mat.emissiveIntensity = this.zombie ? 0.12 : 0.4; }
    }
    // muzzle flash decay for armed raiders
    if (this._muzzleFlash && this._flashT > 0) {
      this._flashT -= dt;
      this._muzzleFlash.material.opacity = Math.max(0, this._flashT / 0.05);
    }
    // hit flinch — brief upper-body jerk back, easing to the resting lean
    if (this._upper) {
      if (this._flinch > 0) { this._flinch -= dt; this._upper.rotation.x = this._restLean - 0.28 * (this._flinch / 0.18); }
      else this._upper.rotation.x = this._restLean;
    }
    if (this.attackCd > 0) this.attackCd -= dt;
    if (this.fireCd > 0) this.fireCd -= dt;
    if (this.summonCd > 0) this.summonCd -= dt;

    const g = this.group;
    const dx = target.x - g.position.x;
    const dz = target.z - g.position.z;
    const dist = Math.hypot(dx, dz);
    g.rotation.y = Math.atan2(dx, dz);

    // stealth: notice the player within `detect` range; bosses are always aware
    if (!this.alerted && (this.isBoss || dist < detect)) this.alerted = true;
    const aware = this.alerted || this.isBoss;

    // first time this enemy closes to engagement range, it barks at the player
    if (aware && !this._barked && dist < 16) { this._barked = true; result.bark = true; }

    if (this._core) this._core.scale.setScalar(1 + Math.sin(this._time = (this._time || 0) + dt * 8) * 0.15);

    let moveDir = 0; // +1 approach, -1 retreat, 0 hold

    if (!aware) {
      // unaware — creep toward the player's last seen spot, no attacks
      moveDir = dist > 2.4 ? 1 : 0;
    } else {

    // ---- named-boss phase machine: volleys -> summons -> enraged slams ----
    if (this.phases) {
      const frac = this.hp / this.maxHp;
      const np = frac > 0.6 ? 1 : frac > 0.3 ? 2 : 3;
      if (np !== this.phase) {
        this.phase = np; result.phaseChange = np;
        if (np === 2) this.volley = 5;
        if (np === 3) { this.volley = 6; this._enraged = true; }
        if (this._crestMat) this._crestMat.color.setHex(np === 3 ? 0xff3b2f : np === 2 ? 0xff8a3a : 0xc451ff);
      }
      if (this.phase >= 2) {
        this._wSummonCd -= dt;
        if (this._wSummonCd <= 0) { this._wSummonCd = 8; result.summon = true; this.wantsSummon = true; }
      }
      if (this.phase >= 3) {
        this._slamCd -= dt;
        if (this._slamT > 0) {
          this._slamT -= dt;
          if (this._slamT <= 0) result.shockwave = { x: g.position.x, z: g.position.z, radius: 10, dmg: this.dmg * 0.8 };
        } else if (this._slamCd <= 0 && dist < 16) {
          this._slamCd = 5.5; this._slamT = 0.7; // telegraph window before the slam lands
        }
      }
    }

    if (this.isSummoner) {
      if (dist > this.prefDist * 1.2) moveDir = 1;
      else if (dist < this.prefDist * 0.8) moveDir = -1;
      if (this.summonCd <= 0) { this.summonCd = this.def.summonCd; result.summon = true; this.wantsSummon = true; }
    } else if (this.sniper) {
      // marksman: hold range, charge a telegraphed shot (orb swells), then fire
      if (dist > this.prefDist * 1.1) moveDir = 1;
      else if (dist < this.prefDist * 0.7) moveDir = -1;
      if (this._charge > 0) {
        this._charge -= dt; moveDir = 0;
        if (this._orb) this._orb.scale.setScalar(1 + (0.7 - this._charge) * 3);
        if (this._charge <= 0) { result.shots = this._buildShots(target); if (this._orb) this._orb.scale.setScalar(1); }
      } else if (this.fireCd <= 0 && dist < this.prefDist * 2.4 && dist > 5) {
        this.fireCd = this.def.fireCd; this._charge = 0.7;
      }
    } else if (this.ranged) {
      if (dist > this.prefDist * 1.25) moveDir = 1;
      else if (dist < this.prefDist * 0.8) moveDir = -1;
      if (this.fireCd <= 0 && dist < this.prefDist * 2.2) {
        this.fireCd = this.def.fireCd;
        result.shots = this._buildShots(target);
        if (this._muzzleFlash) { this._flashT = 0.05; this._muzzleFlash.material.opacity = 1; }
      }
    } else if (this.explode) {
      moveDir = 1; // always rush
      if (dist <= 1.8) { this._startDeath(); this._exploded = true; } // detonate on contact
    } else {
      // melee rusher; the stalker periodically lunges for a speed burst
      if (this.lunge) {
        if (this._lungeCd > 0) this._lungeCd -= dt;
        if (this._lungeT > 0) this._lungeT -= dt;
        if (this._lungeCd <= 0 && this._lungeT <= 0 && dist < 13 && dist > 2.5) { this._lungeCd = 3.5; this._lungeT = 0.55; }
      }
      moveDir = dist > 1.4 ? 1 : 0;
      if (moveDir === 0 && this.attackCd <= 0) {
        this.attackCd = 1.0;
        result.melee = true;
        if (this.arms) this.arms.forEach((a) => (a.rotation.x = -1.2));
      }
    }
    if (this.isBoss && dist <= this.prefDist + 1 && this.attackCd <= 0) {
      this.attackCd = 1.2; result.melee = true;
    }
    } // end aware

    if (moveDir !== 0 && dist > 0.001 && !this.dead) {
      // desired direction + obstacle-avoidance steering (basic pathfinding)
      let ddx = (dx / dist) * moveDir, ddz = (dz / dist) * moveDir;
      const steer = world.steerAround(g.position.x, g.position.z, ddx, ddz, this.radius);
      ddx += steer.x * 1.6; ddz += steer.z * 1.6;
      const dl = Math.hypot(ddx, ddz) || 1;
      const step = this._moveSpeed() * dt;
      const r = world.resolve(g.position.x + (ddx / dl) * step, g.position.z + (ddz / dl) * step, this.radius);
      g.position.x = r.x; g.position.z = r.z;
      this._animWalk(dt);
    } else if (!this.dead) {
      this._animIdle(dt);
    }

    if (this.hbGroup.visible) this.hbGroup.quaternion.copy(camera.quaternion);
    return result;
  }

  // jointed walk cycle — full stride with knee flex on the recovery, swinging
  // bent arms, a vertical bounce, hip sway and a torso counter-twist for a
  // natural, weighty human gait.
  _animWalk(dt) {
    this._walk = (this._walk || 0) + dt * this.speed * (this.zombie ? 1.3 : 1.7);
    const w = this._walk, sc = this.def.scale;
    const swing = Math.sin(w) * (this.zombie ? 0.42 : 0.6);
    this.legs[0].rotation.x = swing; this.legs[1].rotation.x = -swing;
    if (this.knees) {
      const kb = this.zombie ? 0.6 : 1.05;
      this.knees[0].rotation.x = Math.max(0, Math.sin(w + Math.PI * 0.5)) * kb;
      this.knees[1].rotation.x = Math.max(0, Math.sin(w - Math.PI * 0.5)) * kb;
    }
    if (this.zombie) {
      // arms outstretched, reaching, with a slow side-to-side loll
      const loll = Math.sin(w * 0.7) * 0.12;
      this.arms[0].rotation.x = -1.35 + Math.sin(w) * 0.08; this.arms[1].rotation.x = -1.4 - Math.sin(w) * 0.08;
      this.arms[0].rotation.z = 0.2 + loll; this.arms[1].rotation.z = -0.2 + loll;
      if (this.elbows) { this.elbows[0].rotation.x = 0.5; this.elbows[1].rotation.x = 0.45; }
    } else if (!this.ranged) {
      this.arms[0].rotation.x = -swing * 0.95; this.arms[1].rotation.x = swing * 0.95;
      this.arms[0].rotation.z = 0.06; this.arms[1].rotation.z = -0.06; // slight outward set
      if (this.elbows) {
        this.elbows[0].rotation.x = 0.45 + Math.max(0, swing) * 0.6;
        this.elbows[1].rotation.x = 0.45 + Math.max(0, -swing) * 0.6;
      }
    }
    if (this._upper) {
      this._upper.position.y = this._upperBaseY + Math.abs(Math.sin(w)) * (this.zombie ? 0.05 : 0.07) * sc;
      this._upper.position.x = Math.sin(w) * 0.03 * sc;
      this._upper.rotation.y = Math.sin(w * (this.zombie ? 0.6 : 1)) * (this.zombie ? 0.13 : 0.09);
      this._upper.rotation.z = Math.sin(w + Math.PI / 2) * (this.zombie ? 0.07 : 0.045);
    }
  }

  // standing idle — gentle breathing bob and limbs easing back to rest
  _animIdle(dt) {
    this._idle = (this._idle || 0) + dt;
    const sc = this.def.scale, k = Math.min(1, dt * 8);
    if (this._upper) {
      this._upper.position.y = this._upperBaseY + Math.sin(this._idle * 2) * 0.025 * sc;
      this._upper.position.x += (0 - this._upper.position.x) * k;
      this._upper.rotation.y += (0 - this._upper.rotation.y) * k;
      this._upper.rotation.z += (0 - this._upper.rotation.z) * k;
    }
    const ease = (o, t) => { if (o) o.rotation.x += (t - o.rotation.x) * k; };
    ease(this.legs[0], 0); ease(this.legs[1], 0);
    if (this.knees) { ease(this.knees[0], 0.05); ease(this.knees[1], 0.05); }
    if (this.zombie) {
      ease(this.arms[0], -1.35); ease(this.arms[1], -1.4);   // keep reaching while idle
      if (this.elbows) { ease(this.elbows[0], 0.5); ease(this.elbows[1], 0.45); }
    } else if (!this.ranged) {
      ease(this.arms[0], 0); ease(this.arms[1], 0);
      if (this.elbows) { ease(this.elbows[0], 0.3); ease(this.elbows[1], 0.3); }
    }
  }

  // effective move speed including stalker lunge bursts and boss enrage
  _moveSpeed() {
    let s = this.speed;
    if (!this.alerted && !this.isBoss) s *= 0.5;   // creep while unaware
    if (this._lungeT > 0) s *= 2.3;
    if (this._enraged) s *= 1.4;
    return s;
  }

  _buildShots(target) {
    const orb = this._orb;
    const origin = new THREE.Vector3();
    if (orb) orb.getWorldPosition(origin); else origin.copy(this.group.position).setY(1.4);
    const aim = new THREE.Vector3(target.x, this.group.position.y + 1.4, target.z).sub(origin).normalize();
    const shots = [];
    const n = this.volley;
    for (let i = 0; i < n; i++) {
      const dir = aim.clone();
      if (n > 1) {
        const spread = (i - (n - 1) / 2) * 0.12;
        dir.x += spread; dir.normalize();
      }
      shots.push({ origin: origin.clone(), dir, dmg: this.dmg, speed: this.projSpeed, boss: this.isBoss });
    }
    return shots;
  }

  remove() {
    this.scene.remove(this.group);
    this.group.traverse((o) => {
      if (o.geometry && !(o.geometry.userData && o.geometry.userData.shared)) o.geometry.dispose();
      if (o.material) o.material.dispose && o.material.dispose();
    });
  }
}

// ---- Wave manager (spawn director) ----
export class WaveManager {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.enemies = [];
    this.wave = 0;
    this.spawnQueue = [];
    this.spawnTimer = 0;
    this.state = 'idle'; // idle | spawning | active | between
    this.boss = null;
    this._eid = 0; // stable per-enemy id (used by co-op snapshots)
    this.stealth = 0; // 0..0.85 — player's current stealth (shrinks detection)
    this.difficulty = { hp: 1, speed: 1, dmg: 1, spawn: 1, reward: 1 };
  }

  get isBossWave() { return this.wave > 0 && this.wave % 5 === 0; }

  startNextWave() {
    this.purgeDead(); // clear any lingering corpses from the last wave
    this.wave += 1;
    const w = this.wave;
    this.spawnQueue = [];
    this.boss = null;

    if (this.isBossWave) {
      // every 10th wave the named boss (THE WARDEN) appears; otherwise the
      // standard boss. Either way a light escort spawns alongside.
      const bossType = (w % 10 === 0) ? 'warden' : 'boss';
      this.spawnQueue.push(bossType);
      for (let i = 0; i < 3 + w; i++) this.spawnQueue.push('grunt');
      for (let i = 0; i < 3 + w; i++) this.spawnQueue.push('zombie');
      for (let i = 0; i < Math.floor(w / 3); i++) this.spawnQueue.push('spitter');
      for (let i = 0; i < Math.floor(w / 4); i++) this.spawnQueue.push('gunner');
      if (bossType === 'warden') for (let i = 0; i < Math.floor(w / 5); i++) this.spawnQueue.push('stalker');
    } else {
      const grunts = 3 + w;
      const zombies = 4 + Math.floor(w * 1.6);          // the bulk of the horde
      const runners = Math.max(0, Math.floor((w - 1) * 1.2));
      const ferals = w >= 3 ? Math.floor((w - 2) / 2) : 0;
      const brutes = w >= 3 ? Math.floor(w / 3) : 0;
      const lurkers = w >= 5 ? Math.floor((w - 4) / 3) : 0;
      const spitters = w >= 2 ? Math.floor(w / 2) : 0;
      const gunners = w >= 3 ? Math.floor((w - 2) / 2) : 0;
      const raiders = w >= 6 ? Math.floor((w - 5) / 3) : 0;
      const exploders = w >= 3 ? Math.floor((w - 2) / 2) : 0;
      const shielded = w >= 4 ? Math.floor((w - 3) / 2) : 0;
      const stalkers = w >= 4 ? Math.floor((w - 3) / 2) : 0;
      const snipers = w >= 5 ? Math.floor((w - 4) / 3) : 0;
      const summoners = w >= 6 ? Math.floor(w / 6) : 0;
      const add = (type, n) => { for (let i = 0; i < n; i++) this.spawnQueue.push(type); };
      add('grunt', grunts); add('zombie', zombies); add('runner', runners); add('feral', ferals);
      add('brute', brutes); add('lurker', lurkers); add('spitter', spitters);
      add('gunner', gunners); add('raider', raiders); add('exploder', exploders);
      add('shielded', shielded); add('stalker', stalkers); add('sniper', snipers); add('summoner', summoners);
    }
    // difficulty scales the head-count; the boss (if any) is always kept first
    const sp = this.difficulty.spawn;
    const hasBoss = this.spawnQueue[0] === 'boss';
    let pool = hasBoss ? this.spawnQueue.slice(1) : this.spawnQueue.slice();
    if (sp > 1) {
      const extra = Math.round(pool.length * (sp - 1));
      for (let i = 0; i < extra; i++) pool.push(pool[i % pool.length]);
    } else if (sp < 1) {
      pool = pool.slice(0, Math.max(1, Math.round(pool.length * sp)));
    }
    pool.sort(() => Math.random() - 0.5);
    this.spawnQueue = hasBoss ? ['boss', ...pool] : pool;

    // spawn director: cap how many can be alive at once
    this.maxAlive = Math.min(28, 8 + w * 2 + Math.round((sp - 1) * 6));
    this.totalThisWave = this.spawnQueue.length;
    this.killedThisWave = 0;
    this.spawnTimer = 0;
    this.state = 'spawning';
    return this.wave;
  }

  _hpScale() {
    const nf = this.world.nightFactor ? this.world.nightFactor() : 1;
    return (1 + (this.wave - 1) * 0.08) * nf * this.difficulty.hp;
  }
  _mods() { return { speed: this.difficulty.speed, dmg: this.difficulty.dmg }; }

  _spawnOne() {
    const type = this.spawnQueue.shift();
    const ang = Math.random() * Math.PI * 2;
    const dist = 42 + Math.random() * 34;
    const pos = new THREE.Vector3(Math.cos(ang) * dist, 0, Math.sin(ang) * dist);
    const e = new Enemy(this.scene, type, pos, this._hpScale(), this._mods());
    e.id = ++this._eid;
    if (e.isBoss) this.boss = e;
    this.enemies.push(e);
  }

  spawnAt(type, x, z) {
    const e = new Enemy(this.scene, type, new THREE.Vector3(x, 0, z), this._hpScale(), this._mods());
    e.id = ++this._eid;
    this.enemies.push(e);
  }

  // gunfire / loud events alert every enemy within `r` of `pos`
  alertNear(pos, r) {
    const r2 = r * r;
    for (const e of this.enemies) {
      if (e.dead || e.alerted) continue;
      const dx = e.group.position.x - pos.x, dz = e.group.position.z - pos.z;
      if (dx * dx + dz * dz < r2) e.alerted = true;
    }
  }

  get liveCount() { let n = 0; for (const e of this.enemies) if (!e.dead) n++; return n; }
  get remaining() { return this.spawnQueue.length + this.liveCount; }

  // `extraTargets` (co-op only) is an array of { id, position } for the other
  // players; each enemy then targets the NEAREST player. Single-player passes
  // nothing, so the only target is the local player (id 0) — behaviour unchanged.
  update(dt, player, camera, callbacks, extraTargets) {
    if (this.state === 'spawning') {
      this.spawnTimer -= dt;
      const aliveOk = this.liveCount < this.maxAlive;
      if (this.spawnTimer <= 0 && this.spawnQueue.length && aliveOk) {
        this._spawnOne();
        this.spawnTimer = Math.max(0.3, 1.1 - this.wave * 0.05);
      }
      if (!this.spawnQueue.length) this.state = 'active';
    }

    // target list (reused arrays to avoid per-frame allocation)
    const pos = this._tpos || (this._tpos = []);
    const ids = this._tids || (this._tids = []);
    pos.length = 0; ids.length = 0;
    pos.push(player.position); ids.push(0);
    if (extraTargets) for (const t of extraTargets) { if (t && t.position) { pos.push(t.position); ids.push(t.id); } }
    const multi = pos.length > 1;

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      let ti = 0;
      if (multi && !e.dead) {
        let bd = Infinity;
        for (let k = 0; k < pos.length; k++) {
          const dx = pos[k].x - e.group.position.x, dz = pos[k].z - e.group.position.z;
          const d = dx * dx + dz * dz;
          if (d < bd) { bd = d; ti = k; }
        }
      }
      const detect = 16 * (1 - Math.min(0.85, this.stealth || 0));
      const r = e.update(dt, pos[ti], camera, this.world, detect);
      if (r.melee) callbacks.onPlayerHit(e.dmg, ids[ti]);
      if (r.shots) for (const s of r.shots) callbacks.onEnemyShoot(s, ids[ti]);
      if (r.bark && callbacks.onBark) callbacks.onBark(e);
      if (r.shockwave && callbacks.onShockwave) callbacks.onShockwave(r.shockwave, e);
      if (r.phaseChange && callbacks.onBossPhase) callbacks.onBossPhase(e, r.phaseChange);
      if (r.summon && e.wantsSummon) {
        e.wantsSummon = false;
        if (this.liveCount < this.maxAlive) {
          const adds = 1 + (Math.random() < 0.5 ? 1 : 0);
          for (let k = 0; k < adds; k++) {
            this.spawnAt('grunt', e.group.position.x + (Math.random() - 0.5) * 4, e.group.position.z + (Math.random() - 0.5) * 4);
          }
          callbacks.onSummon && callbacks.onSummon(e);
        }
      }
    }

    if (this.state === 'active' && this.liveCount === 0) {
      this.state = 'between';
      callbacks.onWaveCleared(this.wave);
    }
  }

  raycast(raycaster) {
    let best = null, bestDist = Infinity;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const hits = raycaster.intersectObject(e.group, true);
      if (hits.length && hits[0].distance < bestDist) {
        bestDist = hits[0].distance;
        best = { enemy: e, point: hits[0].point, distance: hits[0].distance, zone: hits[0].object.userData.zone || 'body' };
      }
    }
    return best;
  }

  raycastRay(raycaster, origin, dir, far) {
    raycaster.set(origin, dir);
    raycaster.far = far;
    return this.raycast(raycaster);
  }

  removeDead(onKill) {
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (!e.dead) continue;
      // score once, the moment it dies (body lingers for the death animation)
      if (!e.scored) { e.scored = true; this.killedThisWave++; onKill && onKill(e); }
      // remove after the topple/fade finishes
      if (e.dyingT <= 0) {
        if (e === this.boss) this.boss = null;
        e.remove();
        this.enemies.splice(i, 1);
      }
    }
  }

  // drop any still-animating corpses (called between waves)
  purgeDead() {
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      if (this.enemies[i].dead) {
        if (this.enemies[i] === this.boss) this.boss = null;
        this.enemies[i].remove();
        this.enemies.splice(i, 1);
      }
    }
  }

  reset() {
    this.enemies.forEach((e) => e.remove());
    this.enemies = [];
    this.spawnQueue = [];
    this.wave = 0;
    this.boss = null;
    this.state = 'idle';
  }
}
