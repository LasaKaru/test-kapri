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
    awning1: mk(0x9c3b3b), // market stall awnings (warm reds/blues)
    awning2: mk(0x37587a),
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

// a stone chapel with a small bell tower topped by a cross — the hamlet's centre-piece
function chapel(rnd, pal) {
  const g = new THREE.Group();
  const w = 4.2, d = 6.0, h = 3.4;
  const nave = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), pal.stone);
  nave.position.y = h / 2; nave.castShadow = true; nave.receiveShadow = true; g.add(nave);

  // pitched roof over the nave (two slabs + gable ends)
  const pitch = 1.6;
  const slabLen = Math.hypot(w / 2 + 0.4, pitch) + 0.1;
  const ang = Math.atan2(pitch, w / 2 + 0.4);
  for (const side of [-1, 1]) {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(slabLen, 0.16, d + 0.8), pal.roof2);
    slab.position.set(side * (w / 4), h + pitch / 2, 0);
    slab.rotation.z = side * (Math.PI / 2 - ang) * -1;
    slab.castShadow = true; g.add(slab);
  }
  const triShape = new THREE.Shape();
  triShape.moveTo(-w / 2, 0); triShape.lineTo(w / 2, 0); triShape.lineTo(0, pitch); triShape.lineTo(-w / 2, 0);
  const triGeo = new THREE.ExtrudeGeometry(triShape, { depth: 0.12, bevelEnabled: false });
  for (const sz of [-1, 1]) { const t = new THREE.Mesh(triGeo, pal.stone); t.position.set(0, h, sz * (d / 2)); g.add(t); }

  // bell tower at the front (+z) end
  const tw = 1.8, tH = 6.5;
  const tower = new THREE.Mesh(new THREE.BoxGeometry(tw, tH, tw), pal.stone);
  tower.position.set(0, tH / 2, d / 2 - tw / 2); tower.castShadow = true; g.add(tower);
  const belfry = new THREE.Mesh(new THREE.BoxGeometry(tw + 0.2, 1.0, tw + 0.2), pal.stone);
  belfry.position.set(0, tH, d / 2 - tw / 2); g.add(belfry);
  const spire = new THREE.Mesh(new THREE.ConeGeometry(tw * 0.8, 2.0, 4), pal.roof);
  spire.position.set(0, tH + 1.5, d / 2 - tw / 2); spire.rotation.y = Math.PI / 4; spire.castShadow = true; g.add(spire);
  // cross on top
  const cv = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.7, 0.1), pal.timber);
  cv.position.set(0, tH + 2.9, d / 2 - tw / 2); g.add(cv);
  const chz = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.1, 0.1), pal.timber);
  chz.position.set(0, tH + 3.0, d / 2 - tw / 2); g.add(chz);

  // arched door + tall glowing windows
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.0, 2.0, 0.14), pal.timber);
  door.position.set(0, 1.0, d / 2 + 0.02); g.add(door);
  for (const sx of [-1, 1]) for (const wz of [-1.4, 1.4]) {
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.4, 0.6), pal.win.clone());
    win.material.emissiveIntensity = 0.35 + rnd() * 0.3;
    win.position.set(sx * (w / 2 + 0.01), 1.8, wz); g.add(win);
  }
  g.userData.radius = Math.max(w, d) * 0.5;
  return g;
}

// a market stall: four posts, a plank counter and a striped awning
function stall(rnd, pal, stripe) {
  const g = new THREE.Group();
  const w = 2.2, d = 1.6, h = 2.0;
  const postGeo = new THREE.BoxGeometry(0.12, h, 0.12);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const p = new THREE.Mesh(postGeo, pal.timber);
    p.position.set(sx * w / 2, h / 2, sz * d / 2); g.add(p);
  }
  const counter = new THREE.Mesh(new THREE.BoxGeometry(w, 0.16, d), pal.timber);
  counter.position.y = 0.9; counter.castShadow = true; counter.receiveShadow = true; g.add(counter);
  // sloped striped awning
  const awn = new THREE.Mesh(new THREE.BoxGeometry(w + 0.5, 0.08, d + 0.6), stripe);
  awn.position.set(0, h + 0.2, 0.2); awn.rotation.x = -0.32; awn.castShadow = true; g.add(awn);
  // a few goods on the counter (crates / produce)
  const goods = 2 + (rnd() * 2 | 0);
  for (let i = 0; i < goods; i++) {
    const s = 0.18 + rnd() * 0.14;
    const box = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), rnd() < 0.5 ? pal.hay : pal.roof);
    box.position.set((rnd() - 0.5) * (w - 0.4), 0.98 + s / 2, (rnd() - 0.5) * (d - 0.4)); g.add(box);
  }
  g.userData.radius = Math.max(w, d) * 0.5;
  return g;
}

// a simple two-wheeled hand cart
function cart(pal) {
  const g = new THREE.Group();
  const bed = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.2, 1.1), pal.timber);
  bed.position.y = 0.8; bed.castShadow = true; g.add(bed);
  for (const side of [-1, 1]) {
    const sidePanel = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.4, 0.1), pal.timber);
    sidePanel.position.set(0, 1.0, side * 0.5); g.add(sidePanel);
  }
  const wheelGeo = new THREE.CylinderGeometry(0.45, 0.45, 0.12, 10);
  for (const side of [-1, 1]) {
    const wheel = new THREE.Mesh(wheelGeo, pal.roof2);
    wheel.rotation.x = Math.PI / 2; wheel.position.set(-0.4, 0.45, side * 0.62); wheel.castShadow = true; g.add(wheel);
  }
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.1, 0.1), pal.timber);
  shaft.position.set(1.5, 0.7, 0); g.add(shaft);
  g.userData.radius = 1.2;
  return g;
}

// a timber lantern post: a warm glowing box on a pole (emissive, so bloom
// makes it read as a light at night — no real light, keeps it cheap)
function lanternPost(pal) {
  const g = new THREE.Group();
  const h = 2.4;
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, h, 0.14), pal.timber);
  post.position.y = h / 2; post.castShadow = true; g.add(post);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 0.1), pal.timber);
  arm.position.set(0.2, h - 0.1, 0); g.add(arm);
  const lantMat = new THREE.MeshStandardMaterial({ color: 0x2a1c08, emissive: 0xffb14a, emissiveIntensity: 1.1, roughness: 0.5, flatShading: true });
  const lantern = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.4, 0.28), lantMat);
  lantern.position.set(0.4, h - 0.25, 0); g.add(lantern);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.22, 4), pal.roof2);
  cap.position.set(0.4, h + 0.03, 0); cap.rotation.y = Math.PI / 4; g.add(cap);
  g.userData.radius = 0.3;
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
  // sample terrain over a footprint: returns the lowest/highest ground height so
  // structures can sit flush on the low corner and skip spots too steep to look right
  const slope = (x, z, r) => {
    let min = Infinity, max = -Infinity;
    for (const [dx, dz] of [[0, 0], [-r, -r], [r, -r], [-r, r], [r, r]]) {
      const h = gy(x + dx, z + dz); if (h < min) min = h; if (h > max) max = h;
    }
    return { min, max };
  };

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
    // skip cliff-side spots where a flat-based hut would float or bury a corner
    const s = slope(x, z, 2.4);
    if (s.max - s.min > 2.0) continue;
    const c = cottage(rnd, pal);
    c.position.set(x, s.min, z); // sit on the low corner so nothing floats
    c.rotation.y = Math.atan2(ax - x, az - z) + (rnd() - 0.5) * 0.4; // roughly face the well
    group.add(c);
    colliders.push({ x, z, r: c.userData.radius * 0.85 });
    placed.push({ x, z, a });
  }

  // chapel with bell tower — set just beyond the cottage ring on flat ground
  for (let tries = 0; tries < 6; tries++) {
    const a = rnd() * Math.PI * 2, r = ringR + 4 + rnd() * 2;
    const x = ax + Math.cos(a) * r, z = az + Math.sin(a) * r;
    if (!dry(x, z) || Math.hypot(x, z) > world.bounds - 8) continue;
    const s = slope(x, z, 3.2);
    if (s.max - s.min > 1.6) continue; // the tall tower wants level ground
    const ch = chapel(rnd, pal);
    ch.position.set(x, s.min, z);
    ch.rotation.y = Math.atan2(ax - x, az - z); // door/tower face the well
    group.add(ch);
    colliders.push({ x, z, r: ch.userData.radius * 0.8 });
    break;
  }

  // a couple of market stalls ringing the well, plus a cart
  const stalls = 2 + (rnd() * 2 | 0);
  for (let i = 0; i < stalls; i++) {
    const a = (i / stalls) * Math.PI * 2 + rnd() * 0.6, r = 3.2 + rnd() * 1.5;
    const x = ax + Math.cos(a) * r, z = az + Math.sin(a) * r;
    if (!dry(x, z)) continue;
    const st = stall(rnd, pal, rnd() < 0.5 ? pal.awning1 : pal.awning2);
    st.position.set(x, gy(x, z), z);
    st.rotation.y = Math.atan2(ax - x, az - z); // counter faces the well
    group.add(st);
    colliders.push({ x, z, r: st.userData.radius * 0.7 });
  }
  {
    const a = rnd() * Math.PI * 2, r = 4.5 + rnd() * 1.5;
    const x = ax + Math.cos(a) * r, z = az + Math.sin(a) * r;
    if (dry(x, z)) {
      const ct = cart(pal); ct.position.set(x, gy(x, z), z); ct.rotation.y = rnd() * Math.PI * 2;
      group.add(ct); colliders.push({ x, z, r: ct.userData.radius * 0.7 });
    }
  }

  // lantern posts ringing the market square for warm night-time glow
  const lanterns = 3 + (rnd() * 2 | 0);
  for (let i = 0; i < lanterns; i++) {
    const a = (i / lanterns) * Math.PI * 2 + 0.4, r = 5 + rnd() * 1.5;
    const x = ax + Math.cos(a) * r, z = az + Math.sin(a) * r;
    if (!dry(x, z)) continue;
    const lp = lanternPost(pal); lp.position.set(x, gy(x, z), z); lp.rotation.y = rnd() * Math.PI * 2;
    group.add(lp);
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
