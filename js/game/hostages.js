import * as THREE from 'three';

// Captive villagers held around the battlefield — some tucked away, some near
// enemy bases. Walk up and press [E] to free one: they throw their arms up in
// thanks and hurry off. Reward is credits + XP. Built in-code, no assets, and
// reshuffled each mission. The game owns the shared [E] prompt.

function disposeGroup(g) {
  g.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) { const m = o.material; (Array.isArray(m) ? m : [m]).forEach((x) => x && x.dispose && x.dispose()); }
  });
}

// a captive figure lashed to a stake: stake + slumped low-poly villager
function buildCaptive() {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x4a3524, roughness: 1, flatShading: true });
  const skin = new THREE.MeshStandardMaterial({ color: 0xc7986b, roughness: 1, flatShading: true });
  const tunicCols = [0x6b5a3a, 0x4f5f6a, 0x7a4a3a, 0x556b4a];
  const tunic = new THREE.MeshStandardMaterial({ color: tunicCols[Math.random() * tunicCols.length | 0], roughness: 1, flatShading: true });

  const stake = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 2.6, 6), wood);
  stake.position.y = 1.3; stake.castShadow = true; g.add(stake);
  const rope = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.05, 5, 10), new THREE.MeshStandardMaterial({ color: 0x8a7a4a, roughness: 1 }));
  rope.position.set(0, 1.3, 0.1); rope.rotation.x = Math.PI / 2; g.add(rope);

  // the villager — a small figure we can animate (freed => arms up)
  const fig = new THREE.Group();
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.6, 0.26), tunic);
  torso.position.y = 1.0; torso.castShadow = true; fig.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.28, 0.26), skin);
  head.position.y = 1.45; fig.add(head);
  const arms = [];
  for (const s of [-1, 1]) {
    const arm = new THREE.Group();
    const limb = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.5, 0.1), skin);
    limb.position.y = -0.25; arm.add(limb);
    arm.position.set(s * 0.26, 1.28, 0);
    arm.rotation.z = s * 0.3; arm.rotation.x = 0.9; // bound behind the stake
    fig.add(arm); arms.push(arm);
  }
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.6, 0.13), wood);
    leg.position.set(s * 0.12, 0.3, 0); fig.add(leg);
  }
  fig.position.z = -0.18; // leaning back against the stake
  fig.rotation.x = -0.12;
  g.add(fig);
  return { group: g, fig, arms };
}

export class Hostages {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.list = [];
    this.freed = 0;
    this.total = 0;
  }

  _dry(x, z) { return !(this.world.waterAt && this.world.waterAt(x, z)); }
  _groundY(x, z) { return this.world.heightAt ? Math.max(0, this.world.heightAt(x, z)) : 0; }

  reset() {
    for (const h of this.list) { this.scene.remove(h.group); disposeGroup(h.group); }
    this.list = [];
    this.freed = 0;
    const N = 2 + (Math.random() * 3 | 0);
    for (let i = 0; i < N; i++) this._scatterOne();
    this.total = this.list.length;
  }

  _scatterOne() {
    const B = this.world.bounds || 130;
    // half near an enemy base (guarded), half out in the wild
    const nearBase = Math.random() < 0.5 && this.world.bases && this.world.bases.length;
    for (let t = 0; t < 30; t++) {
      let x, z;
      if (nearBase) {
        const b = this.world.bases[Math.random() * this.world.bases.length | 0];
        const a = Math.random() * Math.PI * 2, r = 16 + Math.random() * 10;
        x = b.x + Math.cos(a) * r; z = b.z + Math.sin(a) * r;
      } else {
        const a = Math.random() * Math.PI * 2, r = 25 + Math.random() * (B - 30);
        x = Math.cos(a) * r; z = Math.sin(a) * r;
      }
      if (!this._dry(x, z) || Math.hypot(x, z) > B - 8) continue;
      if (Math.abs(x) < 6 && z > -100 && z < 20) continue; // spawn lane clear
      const { group, fig, arms } = buildCaptive();
      group.position.set(x, this._groundY(x, z), z);
      group.rotation.y = Math.random() * Math.PI * 2;
      this.scene.add(group);
      this.list.push({ group, fig, arms, x, z, freed: false, _t: 0, dir: Math.random() * Math.PI * 2 });
      return;
    }
  }

  nearest(px, pz, range = 2.8) {
    let best = null, bd = range;
    for (const h of this.list) {
      if (h.freed) continue;
      const d = Math.hypot(h.x - px, h.z - pz);
      if (d < bd) { bd = d; best = h; }
    }
    return best;
  }

  // free a specific captive; invokes cb(reward, freed, total, pos)
  free(h, cb) {
    if (!h || h.freed) return false;
    h.freed = true; h._t = 0;
    this.freed++;
    const reward = { credits: 150 + (Math.random() * 150 | 0), xp: 60 };
    cb(reward, this.freed, this.total, { x: h.x, z: h.z });
    return true;
  }

  update(dt) {
    for (const h of this.list) {
      if (!h.freed) continue;
      h._t += dt;
      // first ~0.8s: throw arms up in thanks; then hurry off and fade
      if (h._t < 0.9) {
        const k = Math.min(1, h._t / 0.5);
        h.fig.rotation.x = -0.12 * (1 - k);
        for (const arm of h.arms) arm.rotation.x = 0.9 * (1 - k) - 2.4 * k; // swing up
      } else {
        const walk = h._t - 0.9;
        h.group.position.x += Math.cos(h.dir) * dt * 2.4;
        h.group.position.z += Math.sin(h.dir) * dt * 2.4;
        h.fig.position.y = Math.abs(Math.sin(walk * 8)) * 0.06; // little bob
        if (walk > 3 && !h._gone) { this.scene.remove(h.group); disposeGroup(h.group); h._gone = true; }
      }
    }
    if (this.list.some((h) => h._gone)) this.list = this.list.filter((h) => !h._gone);
  }
}
