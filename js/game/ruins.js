import * as THREE from 'three';

// Procedural medieval ruins — crumbling towers, broken curtain walls, a lone
// standing archway and scattered rubble, all weathered mossy stone. Our own,
// in-code, no assets. Returns { group, colliders } so the world can add it to
// its disposable root and register solid colliders. Purely atmospheric — a
// reminder that something older stood here before the current battle.

function rng32(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function palette() {
  const mk = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 1, metalness: 0, flatShading: true });
  return {
    stone: mk(0x8a857a),
    stone2: mk(0x767066),
    dark: mk(0x4a463e),
    moss: mk(0x5f7d34),
    wood: mk(0x3e2f1e),
  };
}

// a crumbling round tower: tapered shaft with a jagged, half-missing battlement
function ruinedTower(rnd, pal) {
  const g = new THREE.Group();
  const h = 6 + rnd() * 4, rTop = 1.8 + rnd() * 0.6, rBot = rTop + 0.6;
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, 9), rnd() < 0.5 ? pal.stone : pal.stone2);
  shaft.position.y = h / 2; shaft.castShadow = true; shaft.receiveShadow = true; g.add(shaft);
  // a vertical crack/gap gouged out of the wall
  const crack = new THREE.Mesh(new THREE.BoxGeometry(0.5, h * 0.6, 0.6), pal.dark);
  crack.position.set(rTop * 0.7, h * 0.55, 0); g.add(crack);
  // broken battlements — a ring of merlons with a random half missing
  const merlons = 9;
  for (let i = 0; i < merlons; i++) {
    if (rnd() < 0.45) continue; // crumbled away
    const a = (i / merlons) * Math.PI * 2;
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.5 + rnd() * 0.5, 0.5), pal.stone2);
    m.position.set(Math.cos(a) * rTop, h + 0.25, Math.sin(a) * rTop);
    m.rotation.y = a; m.castShadow = true; g.add(m);
  }
  // moss patches clinging to the base
  for (let i = 0; i < 3; i++) {
    const patch = new THREE.Mesh(new THREE.IcosahedronGeometry(0.4 + rnd() * 0.3, 0), pal.moss);
    patch.scale.y = 0.4;
    patch.position.set((rnd() - 0.5) * rBot * 1.6, 0.3 + rnd() * 1.5, (rnd() - 0.5) * rBot * 1.6); g.add(patch);
  }
  g.userData.radius = rBot;
  return g;
}

// a broken curtain-wall segment: a run of wall with a crumbled, sloping top
function ruinedWall(rnd, pal, len) {
  const g = new THREE.Group();
  const h = 2.5 + rnd() * 2, th = 0.8;
  const segs = Math.max(2, Math.round(len / 1.4));
  const colliders = [];
  for (let i = 0; i < segs; i++) {
    if (rnd() < 0.2) continue; // a gap where the wall has fallen
    const sh = h * (0.5 + rnd() * 0.5); // uneven, crumbled height
    const seg = new THREE.Mesh(new THREE.BoxGeometry(len / segs + 0.05, sh, th), rnd() < 0.5 ? pal.stone : pal.stone2);
    const px = -len / 2 + (i + 0.5) * (len / segs);
    seg.position.set(px, sh / 2, 0); seg.rotation.z = (rnd() - 0.5) * 0.06; seg.castShadow = true; g.add(seg);
    colliders.push({ lx: px, lz: 0, r: 0.7 });
  }
  g.userData.colliders = colliders;
  return g;
}

// a lone standing archway (a doorway that outlived its wall)
function ruinedArch(rnd, pal) {
  const g = new THREE.Group();
  const h = 3.4, gap = 2.0;
  for (const s of [-1, 1]) {
    const pier = new THREE.Mesh(new THREE.BoxGeometry(0.7, h, 0.7), pal.stone);
    pier.position.set(s * (gap / 2 + 0.35), h / 2, 0); pier.castShadow = true; g.add(pier);
  }
  // stepped voussoir top (a crude arch from stacked, offset blocks)
  for (const s of [-1, 1]) {
    const spring = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 0.7), pal.stone2);
    spring.position.set(s * (gap / 2 + 0.1), h + 0.2, 0); spring.rotation.z = s * 0.5; g.add(spring);
  }
  const key = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.5, 0.7), pal.stone2);
  key.position.set(0, h + 0.55, 0); g.add(key);
  g.userData.piers = [{ x: -(gap / 2 + 0.35), r: 0.5 }, { x: (gap / 2 + 0.35), r: 0.5 }];
  return g;
}

// scattered rubble: broken stone chunks strewn across the ground
function rubble(rnd, pal, spread) {
  const g = new THREE.Group();
  const n = 6 + (rnd() * 8 | 0);
  for (let i = 0; i < n; i++) {
    const s = 0.3 + rnd() * 0.7;
    const chunk = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 0), rnd() < 0.7 ? pal.stone : pal.dark);
    chunk.position.set((rnd() - 0.5) * spread, s * 0.4, (rnd() - 0.5) * spread);
    chunk.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
    chunk.scale.y = 0.6 + rnd() * 0.4; chunk.castShadow = true; g.add(chunk);
  }
  return g;
}

// Build a ruin cluster around (cx, cz). Returns { group, colliders }.
export function plantRuins(world, cx, cz, seed = 5) {
  const rnd = rng32(seed);
  const group = new THREE.Group();
  const pal = palette();
  const colliders = [];
  const gy = (x, z) => (world.heightAt ? Math.max(0, world.heightAt(x, z)) : 0);
  const dry = (x, z) => !(world.waterAt && world.waterAt(x, z));

  // one or two crumbling towers
  const nTowers = 1 + (rnd() * 2 | 0);
  const placed = [];
  for (let i = 0; i < nTowers; i++) {
    const a = rnd() * Math.PI * 2, r = i === 0 ? 0 : 6 + rnd() * 5;
    const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
    if (!dry(x, z)) continue;
    const tw = ruinedTower(rnd, pal); tw.position.set(x, gy(x, z), z); tw.rotation.y = rnd() * Math.PI * 2;
    group.add(tw); colliders.push({ x, z, r: tw.userData.radius });
    placed.push({ x, z });
  }

  // broken curtain walls linking / radiating from the towers
  const nWalls = 2 + (rnd() * 2 | 0);
  for (let i = 0; i < nWalls; i++) {
    const a = rnd() * Math.PI * 2, r = 4 + rnd() * 6, len = 5 + rnd() * 6;
    const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
    if (!dry(x, z) || Math.hypot(x, z) > world.bounds - 6) continue;
    const wall = ruinedWall(rnd, pal, len);
    wall.position.set(x, gy(x, z), z); wall.rotation.y = a + Math.PI / 2 + (rnd() - 0.5);
    group.add(wall);
    const cs = Math.cos(wall.rotation.y), sn = Math.sin(wall.rotation.y);
    for (const c of wall.userData.colliders) colliders.push({ x: x + c.lx * cs, z: z - c.lx * sn, r: c.r });
  }

  // a lone standing archway
  {
    const a = rnd() * Math.PI * 2, r = 5 + rnd() * 5;
    const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
    if (dry(x, z) && Math.hypot(x, z) < world.bounds - 6) {
      const arch = ruinedArch(rnd, pal);
      arch.position.set(x, gy(x, z), z); arch.rotation.y = rnd() * Math.PI * 2;
      group.add(arch);
      const cs = Math.cos(arch.rotation.y), sn = Math.sin(arch.rotation.y);
      for (const p of arch.userData.piers) colliders.push({ x: x + p.x * cs, z: z - p.x * sn, r: p.r });
    }
  }

  // rubble scattered through the whole site
  const rb = rubble(rnd, pal, 16); rb.position.set(cx, gy(cx, cz), cz); group.add(rb);

  return { group, colliders };
}
