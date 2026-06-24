import * as THREE from 'three';

const KINDS = {
  health: { color: 0x35e06a, emissive: 0x0d6b28, symbol: 'cross' },
  armor:  { color: 0x4aa3ff, emissive: 0x0d3a6b, symbol: 'shield' },
  ammo:    { color: 0xffcf4a, emissive: 0x6b4f0d, symbol: 'box' },
  meat:    { color: 0xb5532a, emissive: 0x5a1e0d, symbol: 'box' },  // dropped by hunted animals
  hide:    { color: 0x8a6a3a, emissive: 0x3a2a14, symbol: 'box' },  // trade material
  feather: { color: 0xe8e2d0, emissive: 0x6b6450, symbol: 'box' },
  fang:    { color: 0xd8d2c0, emissive: 0x5a564a, symbol: 'shield' },
};
const LOOT_KINDS = ['meat', 'hide', 'feather', 'fang'];

export class Pickups {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
  }

  spawn(kind, pos) {
    const def = KINDS[kind];
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: def.color, emissive: def.emissive, emissiveIntensity: 0.6, roughness: 0.5, metalness: 0.2 });

    let mesh;
    if (def.symbol === 'shield') {
      mesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.32, 0), mat);
    } else if (def.symbol === 'box') {
      mesh = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.5), mat);
    } else {
      // cross: two crossed boxes
      mesh = new THREE.Group();
      mesh.add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.16), mat));
      mesh.add(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.5, 0.16), mat));
    }
    g.add(mesh);

    // glowing base ring
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.4, 0.5, 16),
      new THREE.MeshBasicMaterial({ color: def.color, transparent: true, opacity: 0.5, side: THREE.DoubleSide, fog: false })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = -0.35;
    g.add(ring);

    const light = new THREE.PointLight(def.color, 1.2, 5);
    g.add(light);

    g.position.set(pos.x, 0.9, pos.z);
    this.scene.add(g);
    this.items.push({ group: g, kind, spin: Math.random() * Math.PI, ttl: LOOT_KINDS.includes(kind) ? 60 : 18 });
  }

  // maybe drop something where an enemy died
  maybeDrop(pos, playerHpFrac) {
    const r = Math.random();
    // bias toward health when low
    if (r < (playerHpFrac < 0.5 ? 0.28 : 0.12)) this.spawn('health', pos);
    else if (r < 0.30) this.spawn('ammo', pos);
    else if (r < 0.38) this.spawn('armor', pos);
  }

  update(dt, playerPos, onCollect) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.spin += dt * 2;
      it.ttl -= dt;
      const g = it.group;
      g.rotation.y = it.spin;
      g.position.y = 0.9 + Math.sin(it.spin * 1.5) * 0.12;

      const dx = g.position.x - playerPos.x;
      const dz = g.position.z - playerPos.z;
      if (Math.hypot(dx, dz) < 1.6) {
        onCollect(it.kind);
        this._remove(i);
        continue;
      }
      if (it.ttl <= 0) this._remove(i);
      else if (it.ttl < 4) g.visible = Math.floor(it.ttl * 6) % 2 === 0; // blink before expiring
    }
  }

  _remove(i) {
    const it = this.items[i];
    this.scene.remove(it.group);
    it.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material && o.material.dispose) o.material.dispose(); });
    this.items.splice(i, 1);
  }

  reset() {
    for (let i = this.items.length - 1; i >= 0; i--) this._remove(i);
  }
}
