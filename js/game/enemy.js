import * as THREE from 'three';

// Enemy archetypes.
const TYPES = {
  grunt:   { hp: 2,   speed: 3.2, scale: 1.0,  color: 0xe03a2f, score: 100,  dmg: 8 },
  runner:  { hp: 1,   speed: 6.2, scale: 0.85, color: 0xff7a3a, score: 150,  dmg: 6 },
  brute:   { hp: 8,   speed: 2.0, scale: 1.5,  color: 0xb01818, score: 350,  dmg: 16 },
  // ranged: keeps its distance and spits projectiles
  spitter: { hp: 3,   speed: 2.8, scale: 0.95, color: 0xc23ad0, score: 220,  dmg: 11,
             ranged: true, prefDist: 17, fireCd: 2.2, projSpeed: 30 },
  // boss: huge, tanky, heavy melee + ranged volleys
  boss:    { hp: 110, speed: 1.8, scale: 3.0,  color: 0x8a1020, score: 3000, dmg: 32,
             ranged: true, prefDist: 9, fireCd: 3.0, projSpeed: 26, volley: 3, boss: true },
};

export class Enemy {
  constructor(scene, type, pos, hpScale = 1) {
    this.scene = scene;
    this.type = type;
    const def = TYPES[type];
    this.def = def;
    this.hp = Math.ceil(def.hp * hpScale);
    this.maxHp = this.hp;
    this.speed = def.speed;
    this.dmg = def.dmg;
    this.score = def.score;
    this.ranged = !!def.ranged;
    this.isBoss = !!def.boss;
    this.prefDist = def.prefDist || 0;
    this.projSpeed = def.projSpeed || 0;
    this.volley = def.volley || 1;
    this.dead = false;
    this.attackCd = 0;
    this.fireCd = (def.fireCd || 0) * (0.5 + Math.random());
    this.radius = 0.6 * def.scale;

    this.group = new THREE.Group();
    this._buildBody(def);
    this.group.position.copy(pos);
    this.group.position.y = 0;
    scene.add(this.group);

    this._buildHealthBar();
  }

  _buildBody(def) {
    const mat = new THREE.MeshStandardMaterial({ color: def.color, roughness: 0.8, flatShading: true, emissive: 0x300000, emissiveIntensity: 0.4 });
    const darkMat = new THREE.MeshStandardMaterial({ color: this.isBoss ? 0x2a0608 : 0x5a0d08, roughness: 0.9, flatShading: true });
    const s = def.scale;

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.9 * s, 1.1 * s, 0.55 * s), mat);
    torso.position.y = 1.15 * s; torso.castShadow = true;
    this.group.add(torso);

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.55 * s, 0.55 * s, 0.55 * s), mat);
    head.position.y = 1.95 * s; head.castShadow = true;
    head.userData.zone = 'head';
    this.group.add(head);

    // glowing eyes (boss/spitter glow a different hue)
    const eyeHex = this.ranged ? (this.isBoss ? 0xff5050 : 0xff66ff) : 0xffdd33;
    const eyeMat = new THREE.MeshBasicMaterial({ color: eyeHex });
    [-0.13, 0.13].forEach((ex) => {
      const eye = new THREE.Mesh(new THREE.BoxGeometry(0.1 * s, 0.1 * s, 0.05), eyeMat);
      eye.position.set(ex * s, 1.97 * s, 0.28 * s);
      this.group.add(eye);
    });

    // arms
    this.arms = [];
    [-1, 1].forEach((side) => {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.24 * s, 0.95 * s, 0.24 * s), darkMat);
      arm.position.set(side * 0.62 * s, 1.2 * s, 0.1 * s);
      arm.castShadow = true;
      this.group.add(arm);
      this.arms.push(arm);
    });

    // legs
    this.legs = [];
    [-1, 1].forEach((side) => {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.3 * s, 0.9 * s, 0.3 * s), darkMat);
      leg.position.set(side * 0.24 * s, 0.45 * s, 0);
      leg.castShadow = true;
      this.group.add(leg);
      this.legs.push(leg);
    });

    // ranged enemies carry a glowing orb (the muzzle origin)
    if (this.ranged) {
      const orbHex = this.isBoss ? 0xff4030 : 0xd86bff;
      const orb = new THREE.Mesh(
        new THREE.SphereGeometry(0.18 * s, 8, 6),
        new THREE.MeshBasicMaterial({ color: orbHex })
      );
      orb.position.set(0.62 * s, 1.0 * s, 0.4 * s);
      this.group.add(orb);
      this._orb = orb;
      this._orbHex = orbHex;
    }

    // boss shoulder plates
    if (this.isBoss) {
      [-1, 1].forEach((side) => {
        const plate = new THREE.Mesh(new THREE.BoxGeometry(0.5 * s, 0.3 * s, 0.7 * s), darkMat);
        plate.position.set(side * 0.7 * s, 1.7 * s, 0); plate.castShadow = true;
        this.group.add(plate);
      });
    }

    this.bodyHeight = 2.3 * s;
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

  hit(dmg) {
    if (this.dead) return false;
    this.hp -= dmg;
    this._updateHealthBar();
    this._mat.emissive.setHex(0xffffff);
    this._mat.emissiveIntensity = 1;
    this._flash = 0.1;
    if (this.hp <= 0) { this.dead = true; return true; }
    return false;
  }

  // returns { melee: bool, shots: [{origin, dir}] }
  update(dt, target, camera, world) {
    const result = { melee: false, shots: null };
    if (this._flash > 0) {
      this._flash -= dt;
      if (this._flash <= 0) { this._mat.emissive.setHex(0x300000); this._mat.emissiveIntensity = 0.4; }
    }
    if (this.attackCd > 0) this.attackCd -= dt;
    if (this.fireCd > 0) this.fireCd -= dt;

    const g = this.group;
    const dx = target.x - g.position.x;
    const dz = target.z - g.position.z;
    const dist = Math.hypot(dx, dz);
    g.rotation.y = Math.atan2(dx, dz);

    let moveDir = 0; // +1 approach, -1 retreat, 0 hold
    if (this.ranged) {
      if (dist > this.prefDist * 1.25) moveDir = 1;
      else if (dist < this.prefDist * 0.8) moveDir = -1;
      // shoot when roughly in range and cooled down (needs line of sight-ish)
      if (this.fireCd <= 0 && dist < this.prefDist * 2.2) {
        this.fireCd = this.def.fireCd;
        result.shots = this._buildShots(target);
        if (this._orb) { this._mat && null; }
      }
    } else {
      moveDir = dist > 1.4 ? 1 : 0;
      if (moveDir === 0 && this.attackCd <= 0) {
        this.attackCd = 1.0;
        result.melee = true;
        if (this.arms) this.arms.forEach((a) => (a.rotation.x = -1.2));
      }
    }
    // boss also melees when adjacent
    if (this.isBoss && dist <= this.prefDist + 1 && this.attackCd <= 0) {
      this.attackCd = 1.2; result.melee = true;
    }

    if (moveDir !== 0 && dist > 0.001) {
      const step = this.speed * dt * moveDir;
      const nx = g.position.x + (dx / dist) * step;
      const nz = g.position.z + (dz / dist) * step;
      const r = world.resolve(nx, nz, this.radius);
      g.position.x = r.x; g.position.z = r.z;
      this._walk = (this._walk || 0) + dt * this.speed * 1.6;
      const swing = Math.sin(this._walk) * 0.4;
      if (this.legs) { this.legs[0].rotation.x = swing; this.legs[1].rotation.x = -swing; }
      if (this.arms && !this.ranged) { this.arms[0].rotation.x = -swing; this.arms[1].rotation.x = swing; }
    }

    if (this.hbGroup.visible) this.hbGroup.quaternion.copy(camera.quaternion);
    return result;
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
      if (o.geometry) o.geometry.dispose();
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
  }

  get isBossWave() { return this.wave > 0 && this.wave % 5 === 0; }

  startNextWave() {
    this.wave += 1;
    const w = this.wave;
    this.spawnQueue = [];
    this.boss = null;

    if (this.isBossWave) {
      // boss + a light escort
      this.spawnQueue.push('boss');
      for (let i = 0; i < 3 + w; i++) this.spawnQueue.push('grunt');
      for (let i = 0; i < Math.floor(w / 3); i++) this.spawnQueue.push('spitter');
    } else {
      const grunts = 4 + w * 2;
      const runners = Math.max(0, Math.floor((w - 1) * 1.5));
      const brutes = w >= 3 ? Math.floor(w / 3) : 0;
      const spitters = w >= 2 ? Math.floor(w / 2) : 0;
      for (let i = 0; i < grunts; i++) this.spawnQueue.push('grunt');
      for (let i = 0; i < runners; i++) this.spawnQueue.push('runner');
      for (let i = 0; i < brutes; i++) this.spawnQueue.push('brute');
      for (let i = 0; i < spitters; i++) this.spawnQueue.push('spitter');
    }
    // keep the boss first, shuffle the rest
    const boss = this.spawnQueue[0] === 'boss' ? this.spawnQueue.shift() : null;
    this.spawnQueue.sort(() => Math.random() - 0.5);
    if (boss) this.spawnQueue.unshift(boss);

    // spawn director: cap how many can be alive at once
    this.maxAlive = Math.min(24, 8 + w * 2);
    this.totalThisWave = this.spawnQueue.length;
    this.killedThisWave = 0;
    this.spawnTimer = 0;
    this.state = 'spawning';
    return this.wave;
  }

  _spawnOne() {
    const type = this.spawnQueue.shift();
    const nf = this.world.nightFactor ? this.world.nightFactor() : 1;
    const hpScale = (1 + (this.wave - 1) * 0.08) * nf;
    // spread spawns around the player rather than clumping
    const ang = Math.random() * Math.PI * 2;
    const dist = 42 + Math.random() * 34;
    const pos = new THREE.Vector3(Math.cos(ang) * dist, 0, Math.sin(ang) * dist);
    const e = new Enemy(this.scene, type, pos, hpScale);
    if (e.isBoss) this.boss = e;
    this.enemies.push(e);
  }

  get remaining() { return this.spawnQueue.length + this.enemies.length; }

  update(dt, player, camera, callbacks) {
    if (this.state === 'spawning') {
      this.spawnTimer -= dt;
      const aliveOk = this.enemies.length < this.maxAlive;
      if (this.spawnTimer <= 0 && this.spawnQueue.length && aliveOk) {
        this._spawnOne();
        this.spawnTimer = Math.max(0.3, 1.1 - this.wave * 0.05);
      }
      if (!this.spawnQueue.length) this.state = 'active';
    }

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      const r = e.update(dt, player.position, camera, this.world);
      if (r.melee) callbacks.onPlayerHit(e.dmg);
      if (r.shots) for (const s of r.shots) callbacks.onEnemyShoot(s);
    }

    if (this.state === 'active' && this.enemies.length === 0) {
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
      if (this.enemies[i].dead) {
        const e = this.enemies[i];
        if (e === this.boss) this.boss = null;
        e.remove();
        this.enemies.splice(i, 1);
        this.killedThisWave++;
        onKill && onKill(e);
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
