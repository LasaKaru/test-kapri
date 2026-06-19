import * as THREE from 'three';

// Enemy archetypes seen/implied in VERDANT.
const TYPES = {
  grunt:  { hp: 2, speed: 3.2, scale: 1.0, color: 0xe03a2f, score: 100, dmg: 8 },
  runner: { hp: 1, speed: 6.2, scale: 0.85, color: 0xff7a3a, score: 150, dmg: 6 },
  brute:  { hp: 8, speed: 2.0, scale: 1.5, color: 0xb01818, score: 350, dmg: 16 },
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
    this.dead = false;
    this.attackCd = 0;
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
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x5a0d08, roughness: 0.9, flatShading: true });
    const s = def.scale;

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.9 * s, 1.1 * s, 0.55 * s), mat);
    torso.position.y = 1.15 * s; torso.castShadow = true;
    this.group.add(torso);

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.55 * s, 0.55 * s, 0.55 * s), mat);
    head.position.y = 1.95 * s; head.castShadow = true;
    this.group.add(head);

    // glowing eyes
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffdd33 });
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

    this.bodyHeight = 2.3 * s;
    this._mat = mat;
  }

  _buildHealthBar() {
    // Billboarded health bar above head (like the video).
    const w = 1.2;
    const bg = new THREE.Mesh(
      new THREE.PlaneGeometry(w, 0.16),
      new THREE.MeshBasicMaterial({ color: 0x220505, transparent: true, opacity: 0.85 })
    );
    const fill = new THREE.Mesh(
      new THREE.PlaneGeometry(w, 0.16),
      new THREE.MeshBasicMaterial({ color: 0xff3b2f })
    );
    fill.position.z = 0.001;
    this._hbWidth = w;
    this.hbGroup = new THREE.Group();
    this.hbGroup.add(bg);
    this.hbGroup.add(fill);
    this.hbGroup.position.y = this.bodyHeight + 0.35;
    this.hbFill = fill;
    this.group.add(this.hbGroup);
    this._updateHealthBar();
  }

  _updateHealthBar() {
    const frac = Math.max(0, this.hp / this.maxHp);
    this.hbFill.scale.x = frac;
    this.hbFill.position.x = -(this._hbWidth * (1 - frac)) / 2;
    this.hbFill.material.color.setHex(frac > 0.5 ? 0xff3b2f : 0xffa033);
    this.hbGroup.visible = this.hp < this.maxHp; // only show when damaged
  }

  hit(dmg) {
    if (this.dead) return false;
    this.hp -= dmg;
    this._updateHealthBar();
    // flash white
    this._mat.emissive.setHex(0xffffff);
    this._mat.emissiveIntensity = 1;
    this._flash = 0.1;
    if (this.hp <= 0) { this.dead = true; return true; }
    return false;
  }

  update(dt, target, camera, world) {
    if (this._flash > 0) {
      this._flash -= dt;
      if (this._flash <= 0) { this._mat.emissive.setHex(0x300000); this._mat.emissiveIntensity = 0.4; }
    }
    if (this.attackCd > 0) this.attackCd -= dt;

    const g = this.group;
    const dx = target.x - g.position.x;
    const dz = target.z - g.position.z;
    const dist = Math.hypot(dx, dz);

    // face & move toward player
    const ang = Math.atan2(dx, dz);
    g.rotation.y = ang;

    let didAttack = false;
    if (dist > 1.4) {
      let nx = g.position.x + (dx / dist) * this.speed * dt;
      let nz = g.position.z + (dz / dist) * this.speed * dt;
      const r = world.resolve(nx, nz, this.radius);
      g.position.x = r.x; g.position.z = r.z;

      // bob legs while walking
      this._walk = (this._walk || 0) + dt * this.speed * 1.6;
      const swing = Math.sin(this._walk) * 0.4;
      if (this.legs) { this.legs[0].rotation.x = swing; this.legs[1].rotation.x = -swing; }
      if (this.arms) { this.arms[0].rotation.x = -swing; this.arms[1].rotation.x = swing; }
    } else if (this.attackCd <= 0) {
      // in range -> attack
      this.attackCd = 1.0;
      didAttack = true;
      // lunge animation
      if (this.arms) { this.arms.forEach((a) => (a.rotation.x = -1.2)); }
    }

    // billboard the health bar to camera
    if (this.hbGroup.visible) this.hbGroup.quaternion.copy(camera.quaternion);

    return didAttack;
  }

  // Returns world-space targetable boxes/positions for raycasting (we use the group)
  remove() {
    this.scene.remove(this.group);
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose && o.material.dispose();
    });
  }
}

// ---- Wave manager ----
export class WaveManager {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.enemies = [];
    this.wave = 0;
    this.spawnQueue = [];
    this.spawnTimer = 0;
    this.betweenTimer = 0;
    this.state = 'idle'; // idle | spawning | active | between
  }

  startNextWave() {
    this.wave += 1;
    const w = this.wave;
    const grunts = 4 + w * 2;
    const runners = Math.max(0, Math.floor((w - 1) * 1.5));
    const brutes = w >= 3 ? Math.floor(w / 3) : 0;

    this.spawnQueue = [];
    for (let i = 0; i < grunts; i++) this.spawnQueue.push('grunt');
    for (let i = 0; i < runners; i++) this.spawnQueue.push('runner');
    for (let i = 0; i < brutes; i++) this.spawnQueue.push('brute');
    // shuffle
    this.spawnQueue.sort(() => Math.random() - 0.5);

    this.totalThisWave = this.spawnQueue.length;
    this.killedThisWave = 0;
    this.spawnTimer = 0;
    this.state = 'spawning';
    return this.wave;
  }

  _spawnOne() {
    const type = this.spawnQueue.shift();
    // spawn at the edge of the arena, biased toward the path ahead/behind
    const ang = Math.random() * Math.PI * 2;
    const dist = 45 + Math.random() * 30;
    const pos = new THREE.Vector3(Math.cos(ang) * dist, 0, Math.sin(ang) * dist);
    const hpScale = 1 + (this.wave - 1) * 0.08; // tougher each wave
    this.enemies.push(new Enemy(this.scene, type, pos, hpScale));
  }

  get remaining() {
    return this.spawnQueue.length + this.enemies.length;
  }

  update(dt, player, camera, callbacks) {
    if (this.state === 'spawning') {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0 && this.spawnQueue.length) {
        this._spawnOne();
        this.spawnTimer = Math.max(0.35, 1.1 - this.wave * 0.05);
      }
      if (!this.spawnQueue.length) this.state = 'active';
    }

    // update living enemies
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      const attacked = e.update(dt, player.position, camera, this.world);
      if (attacked) callbacks.onPlayerHit(e.dmg);
    }

    // Wave cleared -> hand control to the game (it opens the shop). The next
    // wave is started explicitly via startNextWave() when the player deploys.
    if ((this.state === 'active') && this.enemies.length === 0) {
      this.state = 'between';
      callbacks.onWaveCleared(this.wave);
    }
  }

  // Raycast hit-test: return the first enemy whose body the ray intersects
  raycast(raycaster) {
    let best = null, bestDist = Infinity;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const hits = raycaster.intersectObject(e.group, true);
      if (hits.length && hits[0].distance < bestDist) {
        bestDist = hits[0].distance;
        best = { enemy: e, point: hits[0].point, distance: hits[0].distance };
      }
    }
    return best;
  }

  // Directional raycast from an origin along dir, up to far distance.
  raycastRay(raycaster, origin, dir, far) {
    raycaster.set(origin, dir);
    raycaster.far = far;
    return this.raycast(raycaster);
  }

  removeDead(onKill) {
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      if (this.enemies[i].dead) {
        const e = this.enemies[i];
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
    this.state = 'idle';
  }
}
