import * as THREE from 'three';

// Procedural medieval hamlet — our own, in-code, no assets. A ring of
// timber-and-plaster cottages with pitched roofs around a central stone well,
// dressed with hay bales and a low fence. Flat-shaded low-poly to match the
// world, grounded to terrain, and returned as { group, colliders } so the
// world can add it to its disposable root and register solid colliders.
//
// Cottages are decorative shells (solid, not enterable), in keeping with the
// medieval landmark they cluster around.

function rng32(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// shared flat-shaded palette (one material each → few extra draw calls)
function palette() {
  const mk = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 1, metalness: 0, flatShading: true });
  return {
    plaster: mk(0xd8cdb0), // wattle-and-daub walls
    plaster2: mk(0xc9b78f),
    timber: mk(0x4a3524),  // framing beams / posts
    roof: mk(0x7a3b2a),    // clay tile / thatch-brown
    roof2: mk(0x6a5030),
    stone: mk(0x8a8378),   // well ring
    hay: mk(0xc9a94e),
    win: new THREE.MeshStandardMaterial({ color: 0x120c06, emissive: 0xffb14a, emissiveIntensity: 0.5, roughness: 0.6, flatShading: true }),
  };
}

// one cottage centred at local origin, footprint w×d, wall height h
function cottage(rnd, pal) {
  const g = new THREE.Group();
  const w = 3.4 + rnd() * 1.8, d = 3.0 + rnd() * 1.6, h = 2.4 + rnd() * 0.7;
  const wallMat = rnd() < 0.5 ? pal.plaster : pal.plaster2;

  const walls = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
  walls.position.y = h / 2; walls.castShadow = true; walls.receiveShadow = true; g.add(walls);

  // corner + mid timber posts for the half-timbered look
  const postGeo = new THREE.BoxGeometry(0.22, h, 0.22);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const p = new THREE.Mesh(postGeo, pal.timber);
    p.position.set(sx * (w / 2 - 0.11), h / 2, sz * (d / 2 - 0.11)); g.add(p);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(w, 0.2, 0.22), pal.timber);
  beam.position.set(0, h - 0.1, d / 2 - 0.11); g.add(beam);

  // pitched gable roof — two slabs meeting at a ridge, overhanging the eaves
  const roofMat = rnd() < 0.5 ? pal.roof : pal.roof2;
  const pitch = 1.3 + rnd() * 0.5, over = 0.4;
  const slabLen = Math.hypot(w / 2 + over, pitch) + 0.1;
  const ang = Math.atan2(pitch, w / 2 + over);
  for (const side of [-1, 1]) {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(slabLen, 0.16, d + over * 2), roofMat);
    slab.position.set(side * (w / 4), h + pitch / 2, 0);
    slab.rotation.z = side * (Math.PI / 2 - ang) * -1;
    slab.castShadow = true; g.add(slab);
  }
  // gable triangles fill the ends under the ridge
  const triShape = new THREE.Shape();
  triShape.moveTo(-w / 2, 0); triShape.lineTo(w / 2, 0); triShape.lineTo(0, pitch); triShape.lineTo(-w / 2, 0);
  const triGeo = new THREE.ExtrudeGeometry(triShape, { depth: 0.12, bevelEnabled: false });
  for (const sz of [-1, 1]) {
    const tri = new THREE.Mesh(triGeo, wallMat);
    tri.position.set(0, h, sz * (d / 2)); tri.castShadow = true; g.add(tri);
  }

  // door on +z, a couple of glowing windows
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.7, 0.12), pal.timber);
  door.position.set((rnd() - 0.5) * (w - 1.4), 0.85, d / 2 + 0.02); g.add(door);
  const winCount = 1 + (rnd() * 2 | 0);
  for (let i = 0; i < winCount; i++) {
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.8, 0.1), pal.win.clone());
    win.material.emissiveIntensity = 0.3 + rnd() * 0.5;
    const face = rnd() < 0.5 ? 1 : -1;
    win.position.set((rnd() - 0.5) * (w - 1.4), 1.4, face * (d / 2 + 0.01)); g.add(win);
  }

  // a small chimney sometimes
  if (rnd() < 0.6) {
    const ch = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.1 + rnd() * 0.6, 0.5), pal.stone);
    ch.position.set((rnd() - 0.5) * (w * 0.4), h + pitch * 0.6, (rnd() - 0.5) * (d * 0.4));
    ch.castShadow = true; g.add(ch);
  }

  g.userData.radius = Math.max(w, d) * 0.5;
  return g;
}

// central stone well with a little shingled canopy
function well(pal) {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.0, 1.1, 10), pal.stone);
  ring.position.y = 0.55; ring.castShadow = true; ring.receiveShadow = true; g.add(ring);
  const inner = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 1.05, 10), new THREE.MeshStandardMaterial({ color: 0x05070a, roughness: 1 }));
  inner.position.y = 0.58; g.add(inner);
  for (const sx of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, 2.0, 0.18), pal.timber);
    post.position.set(sx * 0.9, 1.0, 0); post.castShadow = true; g.add(post);
  }
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 2.0, 6), pal.timber);
  beam.rotation.z = Math.PI / 2; beam.position.y = 1.95; g.add(beam);
  for (const side of [-1, 1]) {
    const roof = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.12, 1.4), pal.roof);
    roof.position.set(side * 0.42, 2.25, 0); roof.rotation.z = side * -0.5; roof.castShadow = true; g.add(roof);
  }
  g.userData.radius = 1.1;
  return g;
}

function hayBale(pal, rnd) {
  const g = new THREE.Group();
  const b = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.9, 8), pal.hay);
  b.rotation.z = Math.PI / 2; b.position.y = 0.5; b.castShadow = true; b.receiveShadow = true; g.add(b);
  if (rnd() < 0.5) { const b2 = b.clone(); b2.position.set(0.1, 1.3, 0.2); g.add(b2); }
  g.userData.radius = 0.6;
  return g;
}

// low fence run of posts + two rails between two points
function fenceRun(pal, x0, z0, x1, z1, y0, y1) {
  const g = new THREE.Group();
  const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz);
  const n = Math.max(1, Math.round(len / 1.6));
  const postGeo = new THREE.BoxGeometry(0.14, 1.0, 0.14);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const p = new THREE.Mesh(postGeo, pal.timber);
    p.position.set(x0 + dx * t, (y0 + (y1 - y0) * t) + 0.5, z0 + dz * t); g.add(p);
  }
  const ang = Math.atan2(dz, dx);
  for (const ry of [0.35, 0.75]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(len, 0.08, 0.08), pal.timber);
    rail.position.set((x0 + x1) / 2, (y0 + y1) / 2 + ry, (z0 + z1) / 2);
    rail.rotation.y = -ang; g.add(rail);
  }
  return g;
}

// Build the hamlet around (ax, az). Returns { group, colliders }.
export function plantVillage(world, ax, az, seed = 7) {
  const rnd = rng32(seed);
  const group = new THREE.Group();
  const pal = palette();
  const colliders = [];
  const gy = (x, z) => (world.heightAt ? Math.max(0, world.heightAt(x, z)) : 0);
  const dry = (x, z) => !(world.waterAt && world.waterAt(x, z));

  // central well
  const wy = gy(ax, az);
  const wl = well(pal); wl.position.set(ax, wy, az); group.add(wl);
  colliders.push({ x: ax, z: az, r: wl.userData.radius });

  // ring of cottages
  const houses = 6 + (rnd() * 3 | 0);
  const ringR = 9 + rnd() * 3;
  const placed = [];
  for (let i = 0; i < houses; i++) {
    const a = (i / houses) * Math.PI * 2 + rnd() * 0.5;
    const r = ringR + (rnd() - 0.5) * 4;
    const x = ax + Math.cos(a) * r, z = az + Math.sin(a) * r;
    if (!dry(x, z) || Math.hypot(x, z) > world.bounds - 6) continue;
    const c = cottage(rnd, pal);
    c.position.set(x, gy(x, z), z);
    c.rotation.y = Math.atan2(ax - x, az - z) + (rnd() - 0.5) * 0.4; // roughly face the well
    group.add(c);
    colliders.push({ x, z, r: c.userData.radius * 0.85 });
    placed.push({ x, z, a });
  }

  // hay bales scattered between houses
  const bales = 4 + (rnd() * 4 | 0);
  for (let i = 0; i < bales; i++) {
    const a = rnd() * Math.PI * 2, r = 3 + rnd() * (ringR - 2);
    const x = ax + Math.cos(a) * r, z = az + Math.sin(a) * r;
    if (!dry(x, z)) continue;
    const b = hayBale(pal, rnd); b.position.set(x, gy(x, z), z);
    b.rotation.y = rnd() * Math.PI; group.add(b);
  }

  // a partial fence stitched between adjacent cottages (skips gaps for paths)
  placed.sort((p, q) => p.a - q.a);
  for (let i = 0; i < placed.length; i++) {
    if (rnd() < 0.4) continue; // leave openings
    const p = placed[i], q = placed[(i + 1) % placed.length];
    const inset = 1.6;
    const x0 = ax + (p.x - ax) * (1 - inset / ringR), z0 = az + (p.z - az) * (1 - inset / ringR);
    const x1 = ax + (q.x - ax) * (1 - inset / ringR), z1 = az + (q.z - az) * (1 - inset / ringR);
    if (Math.hypot(x1 - x0, z1 - z0) > 12) continue; // don't span the whole clearing
    group.add(fenceRun(pal, x0, z0, x1, z1, gy(x0, z0), gy(x1, z1)));
  }

  group.userData.villagePalette = pal;
  return { group, colliders };
}
