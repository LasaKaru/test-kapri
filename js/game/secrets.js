import * as THREE from 'three';

// Hidden findable caches scattered across the battlefield. Walk up to one and
// press [E] to search it: the lid creaks open and you're rewarded with credits
// and sometimes supplies. Built in-code, no assets, and deliberately unmarked on
// the map so you stumble on them. Reshuffled each mission for fresh discovery.

function disposeGroup(g) {
  g.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) { const m = o.material; (Array.isArray(m) ? m : [m]).forEach((x) => x && x.dispose && x.dispose()); }
  });
}

// a low-poly treasure chest: box base + hinged lid + iron bands + inner glow
function buildChest() {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x5b3a1c, roughness: 1, flatShading: true });
  const iron = new THREE.MeshStandardMaterial({ color: 0x2b2620, roughness: 0.6, metalness: 0.6, flatShading: true });
  const w = 1.1, d = 0.7, h = 0.6;
  const base = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wood);
  base.position.y = h / 2; base.castShadow = true; base.receiveShadow = true; g.add(base);
  for (const bx of [-w / 2 + 0.06, w / 2 - 0.06]) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.08, h + 0.02, d + 0.04), iron);
    band.position.set(bx, h / 2, 0); g.add(band);
  }
  // glowing gold inside (revealed when open)
  const glow = new THREE.Mesh(new THREE.BoxGeometry(w - 0.2, 0.14, d - 0.2),
    new THREE.MeshStandardMaterial({ color: 0xffcf5a, emissive: 0xffb020, emissiveIntensity: 0.9, roughness: 0.5, flatShading: true }));
  glow.position.y = h - 0.02; g.add(glow);
  // hinged lid (pivots from the back edge)
  const lid = new THREE.Group();
  const lidBox = new THREE.Mesh(new THREE.BoxGeometry(w, 0.16, d), wood);
  lidBox.position.set(0, 0, d / 2); lidBox.castShadow = true; lid.add(lidBox);
  const lidBand = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.18, d), iron);
  lidBand.position.set(0, 0, d / 2); lid.add(lidBand);
  lid.position.set(0, h, -d / 2);
  g.add(lid);
  return { group: g, lid };
}

export class Secrets {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.caches = [];
    this.found = 0;
    this.total = 0;
    this._prompt = document.getElementById('interact-prompt');
  }

  _dry(x, z) { return !(this.world.waterAt && this.world.waterAt(x, z)); }
  _groundY(x, z) { return this.world.heightAt ? Math.max(0, this.world.heightAt(x, z)) : 0; }

  // remove existing caches and scatter a fresh set for a new mission
  reset() {
    for (const c of this.caches) { this.scene.remove(c.group); disposeGroup(c.group); }
    this.caches = [];
    this.found = 0;
    const N = 5 + (Math.random() * 4 | 0);
    for (let i = 0; i < N; i++) this._scatterOne();
    this.total = this.caches.length;
  }

  _scatterOne() {
    const B = this.world.bounds || 130;
    for (let t = 0; t < 30; t++) {
      const a = Math.random() * Math.PI * 2, r = 20 + Math.random() * (B - 26);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (!this._dry(x, z)) continue;
      if (Math.abs(x) < 6 && z > -100 && z < 20) continue; // keep the spawn lane clear
      const { group, lid } = buildChest();
      group.position.set(x, this._groundY(x, z) - 0.1, z); // sunk slightly, half-hidden
      group.rotation.y = Math.random() * Math.PI * 2;
      this.scene.add(group);
      // reward: always credits, sometimes a supply drop
      const items = [null, 'health', 'ammo', 'armor', 'ammo'];
      const reward = { credits: 120 + (Math.random() * 200 | 0), item: items[Math.random() * items.length | 0] };
      this.caches.push({ group, lid, x, z, opened: false, _openT: 0, reward });
      return;
    }
  }

  // nearest unopened cache within range of (px,pz), or null
  nearest(px, pz, range = 2.8) {
    let best = null, bd = range;
    for (const c of this.caches) {
      if (c.opened) continue;
      const d = Math.hypot(c.x - px, c.z - pz);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }

  // open a specific cache; invokes cb(reward, found, total, pos)
  open(c, cb) {
    if (!c || c.opened) return false;
    c.opened = true; c._openT = 0;
    this.found++;
    cb(c.reward, this.found, this.total, { x: c.x, z: c.z });
    return true;
  }

  // animate opening lids (the game owns the shared [E] prompt)
  update(dt) {
    for (const c of this.caches) {
      if (c.opened && c._openT < 1) { c._openT = Math.min(1, c._openT + dt * 2.2); c.lid.rotation.x = -c._openT * 1.25; }
    }
  }
}
