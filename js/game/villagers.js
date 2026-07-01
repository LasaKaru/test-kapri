import * as THREE from 'three';

// Peaceful villager NPCs that wander the hamlet — pure ambience, not huntable,
// not interactive. They stroll a loop around the village well, pause to look
// around, and duck indoors (crouch near the nearest cottage) when a wave goes
// hostile, so the place feels lived-in rather than a static diorama.

function disposeGroup(g) {
  g.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) { const m = o.material; (Array.isArray(m) ? m : [m]).forEach((x) => x && x.dispose && x.dispose()); }
  });
}

const SKIN = [0xc7986b, 0xd8b088, 0xa87858];
const TUNIC = [0x6b5a3a, 0x4f5f6a, 0x7a4a3a, 0x556b4a, 0x8a6a8a, 0x9c8a4a];

function buildVillager(rnd) {
  const g = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: SKIN[rnd() * SKIN.length | 0], roughness: 1, flatShading: true });
  const tunic = new THREE.MeshStandardMaterial({ color: TUNIC[rnd() * TUNIC.length | 0], roughness: 1, flatShading: true });
  const s = 0.85 + rnd() * 0.3;

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.4 * s, 0.6 * s, 0.24 * s), tunic);
  torso.position.y = 1.0 * s; torso.castShadow = true; g.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.26 * s, 0.28 * s, 0.26 * s), skin);
  head.position.y = 1.44 * s; head.castShadow = true; g.add(head);
  // simple conical hat sometimes (peasant look)
  if (rnd() < 0.4) {
    const hat = new THREE.Mesh(new THREE.ConeGeometry(0.22 * s, 0.28 * s, 6), tunic);
    hat.position.y = 1.72 * s; g.add(hat);
  }
  const legs = [];
  for (const sx of [-1, 1]) {
    const leg = new THREE.Group();
    const limb = new THREE.Mesh(new THREE.BoxGeometry(0.14 * s, 0.55 * s, 0.14 * s), skin);
    limb.position.y = -0.275 * s; leg.add(limb);
    leg.position.set(sx * 0.11 * s, 0.55 * s, 0);
    g.add(leg); legs.push(leg);
  }
  const arms = [];
  for (const sx of [-1, 1]) {
    const arm = new THREE.Group();
    const limb = new THREE.Mesh(new THREE.BoxGeometry(0.1 * s, 0.5 * s, 0.1 * s), skin);
    limb.position.y = -0.25 * s; arm.add(limb);
    arm.position.set(sx * 0.27 * s, 1.28 * s, 0);
    g.add(arm); arms.push(arm);
  }
  return { group: g, legs, arms, s };
}

function rng32(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export class Villagers {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.list = [];
  }

  _groundY(x, z) { return this.world.heightAt ? Math.max(0, this.world.heightAt(x, z)) : 0; }
  _dry(x, z) { return !(this.world.waterAt && this.world.waterAt(x, z)); }

  reset() {
    for (const v of this.list) { this.scene.remove(v.group); disposeGroup(v.group); }
    this.list = [];
    // populate every hamlet on the map (a bigger crowd in the main village, a
    // few folk in the smaller satellite); fall back to villageAnchor if no zones
    const zones = (this.world._villageZones && this.world._villageZones.length)
      ? this.world._villageZones
      : (this.world.villageAnchor ? [{ x: this.world.villageAnchor.x, z: this.world.villageAnchor.z, r: 28 }] : []);
    if (!zones.length) return; // no village on this map layout — skip quietly
    const rnd = rng32((this.world._seed || 1) * 7 + 3);
    zones.forEach((zone, zi) => {
      const anchor = { x: zone.x, z: zone.z };
      const wanderR = Math.min(9, zone.r * 0.4);
      const n = zone.r > 22 ? 4 + (rnd() * 4 | 0) : 2 + (rnd() * 2 | 0); // fewer in a small hamlet
      for (let i = 0; i < n; i++) {
        const a = rnd() * Math.PI * 2, r = 3 + rnd() * wanderR;
        const x = anchor.x + Math.cos(a) * r, z = anchor.z + Math.sin(a) * r;
        if (!this._dry(x, z)) continue;
        const { group, legs, arms, s } = buildVillager(rnd);
        group.position.set(x, this._groundY(x, z), z);
        const homeR = 4 + rnd() * (wanderR - 1), homeA = rnd() * Math.PI * 2;
        this.scene.add(group);
        this.list.push({
          group, legs, arms, s, wanderR,
          homeX: anchor.x + Math.cos(homeA) * homeR, homeZ: anchor.z + Math.sin(homeA) * homeR,
          anchor, dir: rnd() * Math.PI * 2, walk: 0, pauseT: rnd() * 3, cower: 0,
        });
      }
    });
  }

  update(dt) {
    if (!this.list.length) return;
    const hostile = !!this.world._combatActive;
    for (const v of this.list) {
      const g = v.group;
      if (hostile) {
        // hurry toward "home" (their assigned spot) and crouch there
        const dx = v.homeX - g.position.x, dz = v.homeZ - g.position.z, d = Math.hypot(dx, dz);
        if (d > 0.3) {
          const spd = 2.6 * dt;
          g.position.x += (dx / d) * spd; g.position.z += (dz / d) * spd;
          g.rotation.y = Math.atan2(dx, dz);
          v.walk += dt * 9;
        } else {
          v.cower = Math.min(1, v.cower + dt * 2);
        }
        g.position.y = this._groundY(g.position.x, g.position.z) - v.cower * 0.35 * v.s;
        for (const arm of v.arms) arm.rotation.x = -0.6 * v.cower;
        continue;
      }
      v.cower = Math.max(0, v.cower - dt * 2);
      g.position.y = this._groundY(g.position.x, g.position.z) - v.cower * 0.35 * v.s;
      // gentle wander loop around their home spot
      v.pauseT -= dt;
      if (v.pauseT <= 0) {
        if (v.walking) { v.walking = false; v.pauseT = 1 + Math.random() * 2.5; }
        else {
          v.walking = true; v.pauseT = 2 + Math.random() * 3;
          const a = Math.random() * Math.PI * 2, r = 1.5 + Math.random() * Math.max(1.5, v.wanderR - 1);
          v.tx = v.anchor.x + Math.cos(a) * r; v.tz = v.anchor.z + Math.sin(a) * r;
        }
      }
      if (v.walking) {
        const dx = v.tx - g.position.x, dz = v.tz - g.position.z, d = Math.hypot(dx, dz);
        if (d > 0.15) {
          const spd = 1.1 * dt;
          g.position.x += (dx / d) * spd; g.position.z += (dz / d) * spd;
          g.rotation.y += (Math.atan2(dx, dz) - g.rotation.y) * Math.min(1, dt * 4);
          v.walk += dt * 5;
        }
      }
      // idle leg/arm swing while walking, still while paused
      const swing = v.walking ? Math.sin(v.walk) * 0.5 : 0;
      v.legs[0].rotation.x = swing; v.legs[1].rotation.x = -swing;
      v.arms[0].rotation.x = -swing * 0.6; v.arms[1].rotation.x = swing * 0.6;
    }
  }
}
