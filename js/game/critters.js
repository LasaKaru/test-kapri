import * as THREE from 'three';

// Ambient wildlife: a flock of flapping birds in the sky and a few low-poly
// animals wandering the field. Purely decorative, cheap to run.
export class Critters {
  constructor(root, world) {
    this.root = root; this.world = world;
    this.birds = []; this.animals = []; this._t = 0;
    this._buildBirds(); this._buildAnimals();
  }

  _buildBirds() {
    const mat = new THREE.MeshStandardMaterial({ color: 0x20201c, roughness: 1, flatShading: true });
    for (let i = 0; i < 18; i++) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.ConeGeometry(0.18, 1.0, 4), mat);
      body.rotation.x = Math.PI / 2; g.add(body);
      const wings = [];
      [-1, 1].forEach((s) => {
        const wing = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.04, 0.5), mat);
        wing.position.set(s * 0.6, 0, 0); g.add(wing); wings.push(wing);
      });
      const cx = (Math.random() - 0.5) * 140, cz = (Math.random() - 0.5) * 140;
      const radius = 18 + Math.random() * 40;
      g.scale.setScalar(0.8 + Math.random() * 0.7);
      this.root.add(g);
      this.birds.push({ g, wings, cx, cz, radius, ang: Math.random() * Math.PI * 2, speed: 0.18 + Math.random() * 0.22, h: 26 + Math.random() * 26, flap: 6 + Math.random() * 5, phase: Math.random() * 6 });
    }
  }

  _buildAnimals() {
    for (let i = 0; i < 7; i++) {
      const g = new THREE.Group();
      const s = 0.8 + Math.random() * 0.5;
      // per-animal materials so a hit can flash just that one
      const bodyMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2a, roughness: 1, flatShading: true });
      const darkMat = new THREE.MeshStandardMaterial({ color: 0x3a2a16, roughness: 1, flatShading: true });
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.7 * s, 0.7 * s, 1.5 * s), bodyMat);
      body.position.y = 1.0 * s; body.castShadow = true; g.add(body);
      const neck = new THREE.Mesh(new THREE.BoxGeometry(0.35 * s, 0.7 * s, 0.35 * s), bodyMat);
      neck.position.set(0, 1.4 * s, 0.8 * s); g.add(neck);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.4 * s, 0.4 * s, 0.6 * s), bodyMat);
      head.position.set(0, 1.7 * s, 1.0 * s); g.add(head);
      const legs = [];
      [[-0.25, 0.6], [0.25, 0.6], [-0.25, -0.6], [0.25, -0.6]].forEach(([lx, lz]) => {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.18 * s, 1.0 * s, 0.18 * s), darkMat);
        leg.position.set(lx * s, 0.5 * s, lz * s); g.add(leg); legs.push(leg);
      });
      let px, pz, tries = 0;
      do { const a = Math.random() * Math.PI * 2, dd = 20 + Math.random() * 80; px = Math.cos(a) * dd; pz = Math.sin(a) * dd; tries++; } while (this.world.waterAt(px, pz) && tries < 8);
      g.position.set(px, 0, pz);
      this.root.add(g);
      this.animals.push({ g, legs, bodyMat, dir: Math.random() * Math.PI * 2, speed: 1.4 + Math.random() * 1.2, turnT: 0, walk: 0, flee: 0, s, hp: 3, dead: false, _flash: 0 });
    }
  }

  // ray vs the wandering animals (for hunting). Returns { animal, point, distance } or null.
  raycastAnimal(raycaster, origin, dir, far) {
    raycaster.set(origin, dir); raycaster.far = far;
    let best = null, bd = Infinity;
    for (const a of this.animals) {
      if (a.dead) continue;
      const hits = raycaster.intersectObject(a.g, true);
      if (hits.length && hits[0].distance < bd) { bd = hits[0].distance; best = { animal: a, point: hits[0].point, distance: hits[0].distance }; }
    }
    return best;
  }

  // apply damage; on death removes the animal and returns { killed:true, pos } so
  // the game can drop meat. Animals also bolt away when shot.
  damageAnimal(animal, dmg) {
    if (!animal || animal.dead) return { killed: false };
    animal.hp -= dmg; animal._flash = 0.12; animal.flee = 2.0;
    if (animal.hp <= 0) {
      animal.dead = true;
      const pos = { x: animal.g.position.x, z: animal.g.position.z };
      this.root.remove(animal.g);
      animal.g.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material && o.material.dispose) o.material.dispose(); });
      const i = this.animals.indexOf(animal); if (i >= 0) this.animals.splice(i, 1);
      return { killed: true, pos };
    }
    return { killed: false };
  }

  update(dt, camera) {
    this._t += dt;
    // birds: circle + bob + wing flap
    for (const b of this.birds) {
      b.ang += b.speed * dt;
      const x = b.cx + Math.cos(b.ang) * b.radius;
      const z = b.cz + Math.sin(b.ang) * b.radius;
      b.g.position.set(x, b.h + Math.sin(this._t * 0.8 + b.phase) * 2.5, z);
      b.g.rotation.y = -b.ang + Math.PI / 2;
      const flap = Math.sin(this._t * b.flap + b.phase) * 0.6;
      b.wings[0].rotation.z = flap; b.wings[1].rotation.z = -flap;
    }
    // animals: wander, flee the player, avoid water/edges
    const cx = camera ? camera.position.x : 0, cz = camera ? camera.position.z : 0;
    for (const a of this.animals) {
      const g = a.g;
      if (a._flash > 0) { a._flash -= dt; const on = a._flash > 0; a.bodyMat.emissive.setHex(on ? 0x661a0a : 0x000000); a.bodyMat.emissiveIntensity = on ? 0.8 : 0; }
      const dToPlayer = Math.hypot(g.position.x - cx, g.position.z - cz);
      a.flee = Math.max(0, a.flee - dt);
      if (dToPlayer < 10) { a.flee = 1.2; a.dir = Math.atan2(g.position.x - cx, g.position.z - cz); }
      a.turnT -= dt;
      if (a.turnT <= 0 && a.flee <= 0) { a.turnT = 1.5 + Math.random() * 3; a.dir += (Math.random() - 0.5) * 1.4; }
      const spd = a.speed * (a.flee > 0 ? 2.4 : 1);
      const nx = g.position.x + Math.sin(a.dir) * spd * dt;
      const nz = g.position.z + Math.cos(a.dir) * spd * dt;
      if (this.world.waterAt(nx, nz) || Math.hypot(nx, nz) > 110) { a.dir += Math.PI * 0.6; }
      else { g.position.x = nx; g.position.z = nz; }
      g.rotation.y = a.dir;
      a.walk += dt * spd * 2;
      const sw = Math.sin(a.walk) * 0.5;
      a.legs[0].rotation.x = sw; a.legs[1].rotation.x = -sw; a.legs[2].rotation.x = -sw; a.legs[3].rotation.x = sw;
    }
  }
}
