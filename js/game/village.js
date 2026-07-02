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
    metal: new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.5, metalness: 0.7, flatShading: true }), // anvil / fittings
    canvas: mk(0xdcd3bc),  // windmill sails
    crop: mk(0x6f8f3a),    // field rows
    soil: mk(0x4a3a28),    // tilled earth
    banner1: mk(0xa52832), // heraldic cloth
    banner2: mk(0x2f5aa0),
    banner3: mk(0x2f7d4a),
    wool: mk(0xe8e4da),    // sheep
    pig: mk(0xc98a86),     // pig
    dark: mk(0x2b2620),    // hooves / snouts / iron
    grass: mk(0x5f8038),   // pen turf / target rings
    cloth1: mk(0xcaa15a),  // hanging laundry
    cloth2: mk(0xb7c2cc),
    target: mk(0xd8c9a0),  // archery butt straw
    win: new THREE.MeshStandardMaterial({ color: 0x120c06, emissive: 0xffb14a, emissiveIntensity: 0.5, roughness: 0.6, flatShading: true }),
    fire: new THREE.MeshStandardMaterial({ color: 0xff7a1a, emissive: 0xff6a10, emissiveIntensity: 1.6, roughness: 0.5, flatShading: true }),
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

  // a small chimney sometimes — record its top so the village can vent smoke
  if (rnd() < 0.6) {
    const chH = 1.1 + rnd() * 0.6;
    const cx = (rnd() - 0.5) * (w * 0.4), cz = (rnd() - 0.5) * (d * 0.4), cy = h + pitch * 0.6;
    const ch = new THREE.Mesh(new THREE.BoxGeometry(0.5, chH, 0.5), pal.stone);
    ch.position.set(cx, cy, cz); ch.castShadow = true; g.add(ch);
    g.userData.chimney = { x: cx, y: cy + chH / 2, z: cz }; // local top of the flue
  }

  g.userData.radius = Math.max(w, d) * 0.5;
  return g;
}

// shared gable-roof helper: two pitched slabs + filled gable ends
function gableRoof(g, w, d, h, pitch, over, roofMat, gableMat) {
  const slabLen = Math.hypot(w / 2 + over, pitch) + 0.1;
  const ang = Math.atan2(pitch, w / 2 + over);
  for (const side of [-1, 1]) {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(slabLen, 0.16, d + over * 2), roofMat);
    slab.position.set(side * (w / 4), h + pitch / 2, 0);
    slab.rotation.z = side * (Math.PI / 2 - ang) * -1;
    slab.castShadow = true; g.add(slab);
  }
  const triShape = new THREE.Shape();
  triShape.moveTo(-w / 2, 0); triShape.lineTo(w / 2, 0); triShape.lineTo(0, pitch); triShape.lineTo(-w / 2, 0);
  const triGeo = new THREE.ExtrudeGeometry(triShape, { depth: 0.12, bevelEnabled: false });
  for (const sz of [-1, 1]) {
    const tri = new THREE.Mesh(triGeo, gableMat);
    tri.position.set(0, h, sz * (d / 2)); tri.castShadow = true; g.add(tri);
  }
}
const glowWin = (pal, rnd) => { const m = pal.win.clone(); m.emissiveIntensity = 0.3 + rnd() * 0.5; return m; };

// a two-storey timber townhouse with a jettied (overhanging) upper floor
function townhouse(rnd, pal) {
  const g = new THREE.Group();
  const w = 3.0 + rnd() * 1.2, d = 2.6 + rnd() * 0.9, h = 2.4, h2 = 1.9, over = 0.3;
  const wallMat = rnd() < 0.5 ? pal.plaster : pal.plaster2;
  const gf = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
  gf.position.y = h / 2; gf.castShadow = true; gf.receiveShadow = true; g.add(gf);
  const uf = new THREE.Mesh(new THREE.BoxGeometry(w + over * 2, h2, d + over * 2), rnd() < 0.5 ? pal.plaster2 : pal.plaster);
  uf.position.y = h + h2 / 2; uf.castShadow = true; g.add(uf);
  for (const sx of [-1, 1]) { // corner timbers on both floors
    const p1 = new THREE.Mesh(new THREE.BoxGeometry(0.2, h, 0.2), pal.timber); p1.position.set(sx * (w / 2 - 0.1), h / 2, d / 2 - 0.1); g.add(p1);
    const p2 = new THREE.Mesh(new THREE.BoxGeometry(0.2, h2, 0.2), pal.timber); p2.position.set(sx * (w / 2 + over - 0.1), h + h2 / 2, d / 2 + over - 0.1); g.add(p2);
  }
  const jetty = new THREE.Mesh(new THREE.BoxGeometry(w + over * 2, 0.18, 0.22), pal.timber);
  jetty.position.set(0, h - 0.05, d / 2 + over - 0.11); g.add(jetty);
  gableRoof(g, w + over * 2, d + over * 2, h + h2, 1.4 + rnd() * 0.3, 0.4, rnd() < 0.5 ? pal.roof : pal.roof2, wallMat);
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.8, 0.12), pal.timber);
  door.position.set((rnd() - 0.5) * (w - 1.4), 0.9, d / 2 + 0.02); g.add(door);
  for (const [wy, wz] of [[1.4, d / 2 + 0.01], [h + 0.9, d / 2 + over + 0.01], [h + 0.9, -(d / 2 + over) - 0.01]]) {
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.75, 0.1), glowWin(pal, rnd));
    win.position.set((rnd() - 0.5) * (w - 1.2), wy, wz); g.add(win);
  }
  const chH = 1.3 + rnd() * 0.5, cx = (rnd() - 0.5) * w * 0.4, cz = (rnd() - 0.5) * d * 0.4, cy = h + h2 + 0.9;
  const ch = new THREE.Mesh(new THREE.BoxGeometry(0.5, chH, 0.5), pal.stone); ch.position.set(cx, cy, cz); ch.castShadow = true; g.add(ch);
  g.userData.chimney = { x: cx, y: cy + chH / 2, z: cz };
  g.userData.radius = Math.max(w + over * 2, d + over * 2) * 0.5;
  return g;
}

// a round wattle-and-daub hut with a conical thatch roof
function roundhut(rnd, pal) {
  const g = new THREE.Group();
  const rr = 1.5 + rnd() * 0.7, h = 1.7 + rnd() * 0.4;
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(rr, rr + 0.15, h, 10), rnd() < 0.5 ? pal.plaster : pal.plaster2);
  wall.position.y = h / 2; wall.castShadow = true; wall.receiveShadow = true; g.add(wall);
  const thatchH = 1.6 + rnd() * 0.6;
  const roof = new THREE.Mesh(new THREE.ConeGeometry(rr + 0.5, thatchH, 10), rnd() < 0.5 ? pal.hay : pal.roof2);
  roof.position.y = h + thatchH / 2; roof.castShadow = true; g.add(roof);
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.4, 0.14), pal.timber);
  door.position.set(0, 0.7, rr + 0.02); g.add(door);
  const win = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.12), glowWin(pal, rnd));
  win.position.set(rr * 0.7, 1.1, rr * 0.7); win.rotation.y = -0.8; g.add(win);
  // smoke vents through the thatch apex
  g.userData.chimney = { x: 0, y: h + thatchH, z: 0 };
  g.userData.radius = rr + 0.4;
  return g;
}

// a long timber barn with big double doors and a hayloft opening
function longBarn(rnd, pal) {
  const g = new THREE.Group();
  const w = 6 + rnd() * 2.5, d = 3.2 + rnd() * 1.0, h = 2.8 + rnd() * 0.4;
  const wallMat = rnd() < 0.5 ? pal.roof2 : pal.timber; // darker weathered plank
  const walls = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
  walls.position.y = h / 2; walls.castShadow = true; walls.receiveShadow = true; g.add(walls);
  // vertical plank battens
  for (let i = -w / 2 + 0.5; i < w / 2; i += 1.0) {
    const batten = new THREE.Mesh(new THREE.BoxGeometry(0.1, h, 0.08), pal.timber);
    batten.position.set(i, h / 2, d / 2 + 0.02); g.add(batten);
  }
  gableRoof(g, w, d, h, 1.5 + rnd() * 0.4, 0.5, pal.roof2, wallMat);
  // big double doors
  for (const s of [-1, 1]) {
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.2, 0.14), pal.timber);
    leaf.position.set(s * 0.62, 1.1, d / 2 + 0.04); g.add(leaf);
  }
  // hayloft opening high in the gable, with a hoist beam
  const loft = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.0, 0.1), new THREE.MeshStandardMaterial({ color: 0x120c06, roughness: 1 }));
  loft.position.set(0, h + 0.5, d / 2 + 0.02); g.add(loft);
  const hoist = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 1.0), pal.timber);
  hoist.position.set(0, h + 1.0, d / 2 + 0.4); g.add(hoist);
  g.userData.radius = Math.max(w, d) * 0.5;
  return g;
}

// an L-shaped manor house with a small square tower at the crook
function manor(rnd, pal) {
  const g = new THREE.Group();
  const wingW = 5.0, wingD = 3.4, h = 3.0;
  const wallMat = pal.plaster2;
  // two perpendicular wings
  const a = new THREE.Mesh(new THREE.BoxGeometry(wingW, h, wingD), wallMat);
  a.position.set(-wingW * 0.25, h / 2, wingD * 0.35); a.castShadow = true; a.receiveShadow = true; g.add(a);
  const b = new THREE.Mesh(new THREE.BoxGeometry(wingD, h, wingW), wallMat);
  b.position.set(wingW * 0.35, h / 2, -wingD * 0.25); b.castShadow = true; b.receiveShadow = true; g.add(b);
  gableRoof(g, wingW + 0.6, wingD, h, 1.4, 0.4, pal.roof, wallMat);
  // wing B roof (rotated)
  const rb = new THREE.Group();
  gableRoof(rb, wingW + 0.6, wingD, h, 1.4, 0.4, pal.roof, wallMat);
  rb.rotation.y = Math.PI / 2; rb.position.set(wingW * 0.35 + 0, 0, -wingD * 0.25); g.add(rb);
  // square corner tower with a pyramidal cap
  const tw = 1.8, tH = h + 2.2;
  const tower = new THREE.Mesh(new THREE.BoxGeometry(tw, tH, tw), pal.stone);
  tower.position.set(wingW * 0.1, tH / 2, wingD * 0.1); tower.castShadow = true; g.add(tower);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(tw * 0.85, 1.6, 4), pal.roof);
  cap.position.set(wingW * 0.1, tH + 0.8, wingD * 0.1); cap.rotation.y = Math.PI / 4; cap.castShadow = true; g.add(cap);
  // rows of glowing windows
  for (let i = 0; i < 5; i++) {
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.9, 0.1), glowWin(pal, rnd));
    win.position.set(-wingW * 0.5 + i * 1.1, 1.5, wingD * 0.85 + 0.01); g.add(win);
  }
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.0, 0.14), pal.timber);
  door.position.set(-wingW * 0.25, 1.0, wingD * 0.85 + 0.02); g.add(door);
  const chH = 1.6, cx = wingW * 0.35, cz = -wingD * 0.45, cy = h + 1.3;
  const ch = new THREE.Mesh(new THREE.BoxGeometry(0.6, chH, 0.6), pal.stone); ch.position.set(cx, cy, cz); ch.castShadow = true; g.add(ch);
  g.userData.chimney = { x: cx, y: cy + chH / 2, z: cz };
  g.userData.radius = wingW * 0.62;
  return g;
}

// a bakery: a cottage with an external domed stone oven venting smoke
function bakery(rnd, pal) {
  const g = new THREE.Group();
  const w = 3.6, d = 3.0, h = 2.4;
  const walls = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), pal.plaster);
  walls.position.y = h / 2; walls.castShadow = true; walls.receiveShadow = true; g.add(walls);
  gableRoof(g, w, d, h, 1.3, 0.4, pal.roof, pal.plaster);
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.7, 0.12), pal.timber);
  door.position.set(-0.8, 0.85, d / 2 + 0.02); g.add(door);
  const win = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.7, 0.1), glowWin(pal, rnd));
  win.position.set(0.9, 1.4, d / 2 + 0.01); g.add(win);
  // domed stone oven on the side, glowing mouth
  const oven = new THREE.Mesh(new THREE.SphereGeometry(0.9, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), pal.stone);
  oven.scale.set(1, 0.9, 1); oven.position.set(w / 2 + 0.7, 0.4, 0); oven.castShadow = true; g.add(oven);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.0, 0.5, 8), pal.stone);
  base.position.set(w / 2 + 0.7, 0.25, 0); g.add(base);
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.35, 0.2), pal.fire.clone());
  mouth.position.set(w / 2 + 0.7, 0.55, 0.85); g.add(mouth);
  const flue = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 1.4, 6), pal.stone);
  flue.position.set(w / 2 + 0.7, 1.4, -0.3); g.add(flue);
  g.userData.chimney = { x: w / 2 + 0.7, y: 2.1, z: -0.3 };
  g.userData.ovenGlow = mouth; // registered as a flicker target by the caller
  g.userData.radius = (w / 2 + 1.6);
  return g;
}

// pick a random regular dwelling for the cottage ring (weighted toward cottages)
function houseVariant(rnd, pal) {
  const r = rnd();
  if (r < 0.55) return cottage(rnd, pal);
  if (r < 0.82) return townhouse(rnd, pal);
  return roundhut(rnd, pal);
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

// Build a small pool of drifting smoke puffs above the given chimney tops.
// Adds the meshes to `group` (so they dispose with it) and returns per-puff
// state the world animates each frame. Capped so cost stays tiny.
function buildSmoke(group, chimneys, rnd) {
  const puffs = [];
  const geo = new THREE.IcosahedronGeometry(0.5, 0);
  const used = chimneys.slice(0, 4); // only a few plumes — plenty for the look
  for (const c of used) {
    const perPuff = 3;
    for (let i = 0; i < perPuff; i++) {
      const mat = new THREE.MeshStandardMaterial({ color: 0x9a938a, roughness: 1, transparent: true, opacity: 0, depthWrite: false, flatShading: true });
      const m = new THREE.Mesh(geo, mat);
      m.frustumCulled = true; group.add(m);
      puffs.push({ mesh: m, ox: c.x, oy: c.y + 0.3, oz: c.z, t: i / perPuff, speed: 0.28 + rnd() * 0.12, sway: rnd() * Math.PI * 2 });
    }
  }
  return puffs;
}

// A tower windmill: stone base, timber cap, and four sails on a hub that spins.
// Returns { group, blades } — the world rotates `blades` each frame.
function windmill(pal) {
  const g = new THREE.Group();
  const baseH = 6.5, topR = 1.6, botR = 2.2;
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(topR, botR, baseH, 8), pal.plaster2);
  tower.position.y = baseH / 2; tower.castShadow = true; tower.receiveShadow = true; g.add(tower);
  // timber bands
  for (const yy of [0.15, 0.55, 0.9]) {
    const band = new THREE.Mesh(new THREE.CylinderGeometry(botR - (botR - topR) * yy + 0.06, botR - (botR - topR) * yy + 0.06, 0.18, 8), pal.timber);
    band.position.y = baseH * yy; g.add(band);
  }
  const cap = new THREE.Mesh(new THREE.ConeGeometry(topR + 0.3, 1.6, 8), pal.roof);
  cap.position.y = baseH + 0.7; cap.castShadow = true; g.add(cap);
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.7, 0.2), pal.timber);
  door.position.set(0, 0.85, botR - 0.1); g.add(door);

  // sail assembly on a hub, mounted on the +z face near the cap
  const blades = new THREE.Group();
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.5, 8), pal.timber);
  hub.rotation.x = Math.PI / 2; blades.add(hub);
  for (let i = 0; i < 4; i++) {
    const arm = new THREE.Group();
    const spar = new THREE.Mesh(new THREE.BoxGeometry(0.14, 4.2, 0.14), pal.timber);
    spar.position.y = 2.1; arm.add(spar);
    const sail = new THREE.Mesh(new THREE.BoxGeometry(1.0, 3.4, 0.06), pal.canvas);
    sail.position.set(0.62, 2.2, 0); sail.castShadow = true; arm.add(sail);
    arm.rotation.z = (i / 4) * Math.PI * 2;
    blades.add(arm);
  }
  blades.position.set(0, baseH + 0.4, topR + 0.4);
  g.add(blades);
  g.userData.radius = botR;
  return { group: g, blades };
}

// A blacksmith: open timber-framed forge with a glowing hearth and an anvil.
function forge(rnd, pal) {
  const g = new THREE.Group();
  const w = 4.0, d = 3.4, h = 2.6;
  // back + side walls (open front), stone lower course
  const back = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.3), pal.stone);
  back.position.set(0, h / 2, -d / 2); back.castShadow = true; g.add(back);
  for (const sx of [-1, 1]) {
    const side = new THREE.Mesh(new THREE.BoxGeometry(0.3, h, d), pal.plaster);
    side.position.set(sx * w / 2, h / 2, 0); side.castShadow = true; g.add(side);
  }
  // lean-to roof
  const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 0.16, d + 0.6), pal.roof2);
  roof.position.set(0, h + 0.35, 0.1); roof.rotation.x = -0.28; roof.castShadow = true; g.add(roof);
  // support posts at the open front
  for (const sx of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.18, h, 0.18), pal.timber);
    p.position.set(sx * (w / 2 - 0.2), h / 2, d / 2 - 0.2); g.add(p);
  }
  // stone forge hearth with glowing coals + a small flame
  const hearth = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.0, 1.2), pal.stone);
  hearth.position.set(-w / 4, 0.5, -d / 4); hearth.castShadow = true; g.add(hearth);
  const coals = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.2, 0.8), pal.fire.clone());
  coals.position.set(-w / 4, 1.05, -d / 4); g.add(coals);
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.7, 5), pal.fire.clone());
  flame.position.set(-w / 4, 1.4, -d / 4); g.add(flame);
  // anvil: block + horn on a stump
  const stump = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 0.7, 8), pal.timber);
  stump.position.set(w / 4, 0.35, d / 5); g.add(stump);
  const anvil = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.28, 0.34), pal.metal);
  anvil.position.set(w / 4, 0.84, d / 5); anvil.castShadow = true; g.add(anvil);
  const horn = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.4, 6), pal.metal);
  horn.rotation.z = -Math.PI / 2; horn.position.set(w / 4 + 0.5, 0.84, d / 5); g.add(horn);
  g.userData.radius = Math.max(w, d) * 0.5;
  g.userData.flames = [{ mesh: flame, base: 1.0 }, { mesh: coals, base: 1.6 }]; // flicker targets
  return g;
}

// The tavern: the biggest building in the hamlet — two-storey half-timbered
// inn with an overhanging upper floor, a hanging sign, a chimney, and an
// outdoor bench-and-table area for the ale-swilling crowd (decorative).
function tavern(rnd, pal) {
  const g = new THREE.Group();
  const w = 6.2, d = 4.6, h = 2.7, h2 = 2.2;
  const wallMat = pal.plaster2;

  // ground floor
  const gf = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
  gf.position.y = h / 2; gf.castShadow = true; gf.receiveShadow = true; g.add(gf);
  // upper floor, overhanging on all sides (classic Tudor jetty)
  const over = 0.35;
  const uf = new THREE.Mesh(new THREE.BoxGeometry(w + over * 2, h2, d + over * 2), pal.plaster);
  uf.position.y = h + h2 / 2; uf.castShadow = true; uf.receiveShadow = true; g.add(uf);
  // timber framing on both floors
  for (const yy of [h * 0.5, h + h2 * 0.5]) {
    for (const sx of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.2, yy === h * 0.5 ? h : h2, 0.2), pal.timber);
      p.position.set(sx * (w / 2 - 0.1), yy, d / 2 - 0.1); g.add(p);
    }
  }
  const jettyBeam = new THREE.Mesh(new THREE.BoxGeometry(w + over * 2, 0.2, 0.22), pal.timber);
  jettyBeam.position.set(0, h - 0.05, d / 2 + over - 0.11); g.add(jettyBeam);

  // pitched roof over the upper floor
  const pitch = 1.8, roofOver = 0.5;
  const slabLen = Math.hypot(w / 2 + over + roofOver, pitch) + 0.1;
  const ang = Math.atan2(pitch, w / 2 + over + roofOver);
  for (const side of [-1, 1]) {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(slabLen, 0.18, d + (over + roofOver) * 2), pal.roof);
    slab.position.set(side * (w / 4), h + h2 + pitch / 2, 0);
    slab.rotation.z = side * (Math.PI / 2 - ang) * -1;
    slab.castShadow = true; g.add(slab);
  }
  const triShape = new THREE.Shape();
  triShape.moveTo(-(w + over * 2) / 2, 0); triShape.lineTo((w + over * 2) / 2, 0); triShape.lineTo(0, pitch); triShape.lineTo(-(w + over * 2) / 2, 0);
  const triGeo = new THREE.ExtrudeGeometry(triShape, { depth: 0.12, bevelEnabled: false });
  for (const sz of [-1, 1]) {
    const tri = new THREE.Mesh(triGeo, pal.plaster);
    tri.position.set(0, h + h2, sz * (d + over * 2) / 2); tri.castShadow = true; g.add(tri);
  }
  // chimney
  const ch = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.6, 0.6), pal.stone);
  ch.position.set(w / 3, h + h2 + pitch * 0.7, 0); ch.castShadow = true; g.add(ch);

  // double door + glowing windows on both floors
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.9, 0.14), pal.timber);
  door.position.set(0, 0.95, d / 2 + 0.02); g.add(door);
  const winPositions = [[-w / 3, 1.7, d / 2 + 0.01], [w / 3, 1.7, d / 2 + 0.01], [-w / 3, h + 1.1, d / 2 + over + 0.01], [w / 3, h + 1.1, d / 2 + over + 0.01]];
  for (const [wx, wy, wz] of winPositions) {
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.8, 0.1), pal.win.clone());
    win.material.emissiveIntensity = 0.4 + rnd() * 0.4;
    win.position.set(wx, wy, wz); g.add(win);
  }
  // hanging sign on a bracket above the door
  const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 1.1), pal.metal);
  bracket.position.set(0, h - 0.1, d / 2 + 0.6); g.add(bracket);
  const sign = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.7, 0.06), pal.roof2);
  sign.position.set(0, h - 0.55, d / 2 + 1.1); g.add(sign);
  const signGlyph = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.07, 8), pal.hay);
  signGlyph.rotation.x = Math.PI / 2; signGlyph.position.set(0, h - 0.55, d / 2 + 1.14); g.add(signGlyph);

  g.userData.radius = Math.max(w + over * 2, d + over * 2) * 0.5;
  g.userData.benchAnchor = { x: 0, z: -(d / 2 + 1.5) }; // where the outdoor seating goes (local space)
  return g;
}

// outdoor bench-and-table set for the tavern yard
function benchTable(pal) {
  const g = new THREE.Group();
  const top = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.1, 0.7), pal.timber);
  top.position.y = 0.7; top.castShadow = true; g.add(top);
  for (const sx of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.7, 0.6), pal.timber);
    leg.position.set(sx * 0.65, 0.35, 0); g.add(leg);
  }
  for (const sz of [-1, 1]) {
    const bench = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.08, 0.3), pal.timber);
    bench.position.set(0, 0.42, sz * 0.55); g.add(bench);
    for (const sx of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.42, 0.08), pal.timber);
      leg.position.set(sx * 0.6, 0.21, sz * 0.55); g.add(leg);
    }
  }
  // a couple of mugs on the table
  for (let i = 0; i < 2; i++) {
    const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.14, 8), pal.metal);
    mug.position.set((i - 0.5) * 0.5, 0.82, 0.1); g.add(mug);
  }
  g.userData.radius = 1.0;
  return g;
}

// A tall pole flying a heraldic pennant that ripples in the wind (animated).
function banner(pal, clothMat) {
  const g = new THREE.Group();
  const poleH = 5.0;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, poleH, 6), pal.timber);
  pole.position.y = poleH / 2; pole.castShadow = true; g.add(pole);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), pal.metal);
  knob.position.y = poleH + 0.1; g.add(knob);
  // triangular pennant built from segments so it can ripple along its length
  const cloth = new THREE.Group();
  const segs = 5, segW = 0.44;
  for (let i = 0; i < segs; i++) {
    const hgt = 1.0 * (1 - i / segs) + 0.25;
    const seg = new THREE.Mesh(new THREE.BoxGeometry(segW, hgt, 0.04), clothMat);
    seg.position.set(segW / 2 + i * segW, 0, 0);
    seg.userData.baseX = seg.position.x; seg.userData.i = i;
    cloth.add(seg);
  }
  cloth.position.set(0.1, poleH - 0.8, 0);
  g.add(cloth);
  g.userData.radius = 0.4;
  return { group: g, cloth };
}

// A wrought-iron brazier: a bowl of embers on legs with a flame (flickers).
function brazier(pal) {
  const g = new THREE.Group();
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.32, 0.4, 8), pal.metal);
  bowl.position.y = 1.0; bowl.castShadow = true; g.add(bowl);
  for (let i = 0; i < 3; i++) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.07, 1.0, 0.07), pal.metal);
    const a = (i / 3) * Math.PI * 2;
    leg.position.set(Math.cos(a) * 0.3, 0.5, Math.sin(a) * 0.3); leg.rotation.z = Math.cos(a) * 0.18; leg.rotation.x = -Math.sin(a) * 0.18; g.add(leg);
  }
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.9, 6), pal.fire.clone());
  flame.position.y = 1.5; g.add(flame);
  g.userData.radius = 0.5;
  g.userData.flames = [{ mesh: flame, base: 1.6 }];
  return g;
}

// A stone-and-timber gateway arch marking the entrance to the hamlet.
function gateArch(pal) {
  const g = new THREE.Group();
  const pierH = 4.0, gap = 4.0;
  for (const sx of [-1, 1]) {
    const pier = new THREE.Mesh(new THREE.BoxGeometry(1.0, pierH, 1.0), pal.stone);
    pier.position.set(sx * (gap / 2 + 0.5), pierH / 2, 0); pier.castShadow = true; g.add(pier);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.4, 1.3), pal.stone);
    cap.position.set(sx * (gap / 2 + 0.5), pierH + 0.2, 0); g.add(cap);
  }
  // timber lintel beam across the top
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(gap + 1.4, 0.5, 0.6), pal.timber);
  lintel.position.set(0, pierH + 0.1, 0); lintel.castShadow = true; g.add(lintel);
  const sign = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.7, 0.1), pal.plaster);
  sign.position.set(0, pierH - 0.6, 0.35); g.add(sign);
  g.userData.piers = [{ x: -(gap / 2 + 0.5), r: 0.6 }, { x: (gap / 2 + 0.5), r: 0.6 }];
  return g;
}

// A tilled crop field: dark soil bed with rows of green plants.
function cropField(rnd, pal) {
  const g = new THREE.Group();
  const w = 5 + rnd() * 3, d = 4 + rnd() * 2;
  const bed = new THREE.Mesh(new THREE.BoxGeometry(w, 0.14, d), pal.soil);
  bed.position.y = 0.07; bed.receiveShadow = true; g.add(bed);
  const rows = Math.max(3, Math.round(w / 0.7));
  for (let r = 0; r < rows; r++) {
    const rx = -w / 2 + 0.5 + r * (w - 1) / (rows - 1);
    const row = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.4 + rnd() * 0.2, d - 0.6), pal.crop);
    row.position.set(rx, 0.3, 0); g.add(row);
  }
  g.userData.radius = Math.max(w, d) * 0.5;
  return g;
}

// Advance every animated village element (smoke, windmill sails, banners,
// flickering fires) one frame. `time` is the world clock for phase coherence.
export function updateVillage(anim, dt, time) {
  // drifting chimney smoke
  for (const p of anim.smoke) {
    p.t += dt * p.speed;
    if (p.t >= 1) p.t -= 1;
    const k = p.t;
    p.mesh.position.set(p.ox + Math.sin(k * 6 + p.sway) * 0.35, p.oy + k * 3.6, p.oz + Math.cos(k * 5 + p.sway) * 0.3);
    p.mesh.scale.setScalar(0.3 + k * 1.3);
    p.mesh.material.opacity = Math.max(0, 0.45 * (1 - k) * Math.min(1, k * 6));
  }
  // turning windmill sails
  for (const wm of anim.windmills) wm.blades.rotation.z += dt * wm.speed;
  // rippling banners — each segment lags the one before it for a wave
  for (const b of anim.banners) {
    for (const seg of b.cloth.children) {
      const i = seg.userData.i;
      const wave = Math.sin(time * 3 + i * 0.9 + b.phase);
      seg.position.z = wave * 0.12 * (i + 1);
      seg.rotation.y = wave * 0.18;
    }
  }
  // flickering forge/brazier fires
  for (const f of anim.flames) {
    const flick = 0.75 + Math.sin(time * 11 + f.phase) * 0.15 + Math.sin(time * 23 + f.phase) * 0.1;
    f.mesh.material.emissiveIntensity = f.base * flick;
    if (f.mesh.geometry.type === 'ConeGeometry') f.mesh.scale.y = 0.85 + flick * 0.3;
  }
  // gently swaying hung laundry
  for (const g of (anim.laundry || [])) g.mesh.rotation.x = Math.sin(time * 1.6 + g.phase) * 0.22;
}

// A small country graveyard: leaning tombstones, a stone cross and a wispy rail.
function graveyard(rnd, pal) {
  const g = new THREE.Group();
  const rows = 2, cols = 3;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    if (rnd() < 0.15) continue;
    const gx = (c - (cols - 1) / 2) * 1.3, gz = (r - (rows - 1) / 2) * 1.4;
    const kind = rnd();
    let stone;
    if (kind < 0.6) { // rounded headstone
      stone = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.8, 0.14), pal.stone);
      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.14, 8, 1, false, 0, Math.PI), pal.stone);
      top.rotation.z = -Math.PI / 2; top.position.set(gx, 0.8, gz); g.add(top);
    } else if (kind < 0.85) { // cross
      stone = new THREE.Group();
      const v = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.9, 0.16), pal.stone); v.position.y = 0.45; stone.add(v);
      const h = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.16), pal.stone); h.position.y = 0.62; stone.add(h);
    } else { // plain slab
      stone = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.14), pal.stone);
    }
    if (stone.isMesh) stone.position.set(gx, 0.4, gz); else stone.position.set(gx, 0, gz);
    stone.rotation.z = (rnd() - 0.5) * 0.18; // a little lean
    stone.castShadow = true; g.add(stone);
  }
  g.userData.radius = 2.6;
  return g;
}

// A simple low-poly farm animal (sheep or pig), standing.
function animal(pal, kind) {
  const g = new THREE.Group();
  const body = kind === 'sheep'
    ? new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 0), pal.wool)
    : new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 0.45), pal.pig);
  body.scale.set(kind === 'sheep' ? 1.3 : 1, 0.85, 1); body.position.y = 0.55; body.castShadow = true; g.add(body);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.26, 0.3), kind === 'sheep' ? pal.dark : pal.pig);
  head.position.set(kind === 'sheep' ? 0.5 : 0.55, 0.6, 0); g.add(head);
  if (kind === 'sheep') { // ears
    for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.14), pal.dark); e.position.set(0.5, 0.66, s * 0.16); g.add(e); }
  }
  const legGeo = new THREE.BoxGeometry(0.09, 0.35, 0.09);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const leg = new THREE.Mesh(legGeo, pal.dark);
    leg.position.set(sx * 0.28, 0.18, sz * 0.16); g.add(leg);
  }
  return g;
}

// A fenced livestock pen with a patch of turf and a couple of animals.
function pen(rnd, pal) {
  const g = new THREE.Group();
  const w = 5.5, d = 4.5;
  const turf = new THREE.Mesh(new THREE.BoxGeometry(w, 0.06, d), pal.grass);
  turf.position.y = 0.03; turf.receiveShadow = true; g.add(turf);
  // rail fence around the perimeter (gap on +x for a gate)
  const railMat = pal.timber;
  const seg = (x0, z0, x1, z1) => {
    const len = Math.hypot(x1 - x0, z1 - z0), ang = Math.atan2(z1 - z0, x1 - x0);
    const posts = Math.max(2, Math.round(len / 1.3));
    for (let i = 0; i <= posts; i++) {
      const t = i / posts, p = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.9, 0.12), railMat);
      p.position.set(x0 + (x1 - x0) * t, 0.45, z0 + (z1 - z0) * t); g.add(p);
    }
    for (const ry of [0.35, 0.7]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(len, 0.07, 0.07), railMat);
      rail.position.set((x0 + x1) / 2, ry, (z0 + z1) / 2); rail.rotation.y = -ang; g.add(rail);
    }
  };
  seg(-w / 2, -d / 2, w / 2, -d / 2);
  seg(-w / 2, d / 2, w / 2, d / 2);
  seg(-w / 2, -d / 2, -w / 2, d / 2);
  seg(w / 2, -d / 2, w / 2, -0.8); seg(w / 2, 0.8, w / 2, d / 2); // gap = gate
  const n = 2 + (rnd() * 2 | 0);
  for (let i = 0; i < n; i++) {
    const a = animal(pal, rnd() < 0.5 ? 'sheep' : 'pig');
    a.position.set((rnd() - 0.5) * (w - 1.5), 0.06, (rnd() - 0.5) * (d - 1.5));
    a.rotation.y = rnd() * Math.PI * 2; g.add(a);
  }
  g.userData.radius = Math.max(w, d) * 0.5;
  g.userData.fence = { w, d }; // for perimeter colliders
  return g;
}

// A wooden signpost with a couple of directional arms.
function signpost(rnd, pal) {
  const g = new THREE.Group();
  const h = 2.6;
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, h, 0.16), pal.timber);
  post.position.y = h / 2; post.castShadow = true; g.add(post);
  const arms = 2 + (rnd() * 2 | 0);
  for (let i = 0; i < arms; i++) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.24, 0.08), pal.plaster);
    arm.position.set(0.5, h - 0.3 - i * 0.4, 0); arm.rotation.y = rnd() * Math.PI * 2;
    // point: shift so one end is at the post
    arm.position.x = Math.cos(arm.rotation.y) * 0.55; arm.position.z = -Math.sin(arm.rotation.y) * 0.55;
    g.add(arm);
  }
  g.userData.radius = 0.4;
  return g;
}

// A stacked pile of firewood logs.
function logPile(rnd, pal) {
  const g = new THREE.Group();
  const geo = new THREE.CylinderGeometry(0.16, 0.16, 1.6, 7);
  const rows = 2 + (rnd() * 2 | 0);
  for (let r = 0; r < rows; r++) {
    const n = 4 - r;
    for (let i = 0; i < n; i++) {
      const log = new THREE.Mesh(geo, i % 2 ? pal.timber : pal.roof2);
      log.rotation.x = Math.PI / 2;
      log.position.set((i - (n - 1) / 2) * 0.34 + (r % 2) * 0.17, 0.16 + r * 0.31, 0);
      log.castShadow = true; g.add(log);
    }
  }
  g.userData.radius = 0.9;
  return g;
}

// A cluster of barrels and a sack or two.
function barrelCluster(rnd, pal) {
  const g = new THREE.Group();
  const n = 2 + (rnd() * 3 | 0);
  for (let i = 0; i < n; i++) {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.28, 0.9, 9), pal.roof2);
    b.position.set((rnd() - 0.5) * 1.4, 0.45, (rnd() - 0.5) * 1.4); b.castShadow = true; g.add(b);
    const hoop = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.08, 9), pal.metal);
    hoop.position.copy(b.position); hoop.position.y = 0.6; g.add(hoop);
  }
  g.userData.radius = 1.1;
  return g;
}

// A clothesline strung between two posts with a few hanging garments (sway).
function clothesline(pal) {
  const g = new THREE.Group();
  const span = 4.0;
  for (const sx of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.0, 0.1), pal.timber);
    post.position.set(sx * span / 2, 1.0, 0); g.add(post);
  }
  const line = new THREE.Mesh(new THREE.BoxGeometry(span, 0.03, 0.03), pal.dark);
  line.position.y = 1.9; g.add(line);
  const garments = [];
  const n = 3;
  for (let i = 0; i < n; i++) {
    const gx = -span / 2 + span * (i + 1) / (n + 1);
    const cloth = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.9, 0.04), i % 2 ? pal.cloth1 : pal.cloth2);
    // pivot from the top edge so it swings like hung fabric
    cloth.geometry.translate(0, -0.45, 0);
    cloth.position.set(gx, 1.88, 0); g.add(cloth);
    garments.push(cloth);
  }
  g.userData.radius = span * 0.5;
  g.userData.garments = garments;
  return g;
}

// A straw archery butt with painted rings on a low stand.
function archeryButt(pal) {
  const g = new THREE.Group();
  const butt = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.3, 12), pal.target);
  butt.rotation.x = Math.PI / 2; butt.position.y = 1.0; butt.castShadow = true; g.add(butt);
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.32, 12), pal.awning1);
  ring.rotation.x = Math.PI / 2; ring.position.set(0, 1.0, 0.01); g.add(ring);
  const bull = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.34, 10), pal.hay);
  bull.rotation.x = Math.PI / 2; bull.position.set(0, 1.0, 0.02); g.add(bull);
  for (const sx of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.4, 0.1), pal.timber);
    leg.position.set(sx * 0.4, 0.55, -0.1); leg.rotation.z = sx * 0.14; g.add(leg);
  }
  g.userData.radius = 0.8;
  return g;
}

// A hollowed-log water trough.
function trough(pal) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.5, 0.7), pal.timber);
  body.position.y = 0.35; body.castShadow = true; g.add(body);
  const water = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.06, 0.55), new THREE.MeshStandardMaterial({ color: 0x2f5d6b, roughness: 0.3, metalness: 0.1 }));
  water.position.y = 0.56; g.add(water);
  g.userData.radius = 1.1;
  return g;
}

// A reverent ring of lantern posts and heraldic banners marking a special
// landmark (the Medieval Fantasy Book diorama) as a place worth finding —
// a "preserved relic" look, not a full building cluster. Returns
// { group, anim } so the caller can animate the banners via updateVillage.
export function plantLandmarkRing(world, cx, cz, r, seed = 1) {
  const rnd = rng32(seed);
  const group = new THREE.Group();
  const pal = palette();
  const gy = (x, z) => (world.heightAt ? Math.max(0, world.heightAt(x, z)) : 0);
  const dry = (x, z) => !(world.waterAt && world.waterAt(x, z));
  const ring = r + 3.5;

  const lanterns = 5 + (rnd() * 3 | 0);
  for (let i = 0; i < lanterns; i++) {
    const a = (i / lanterns) * Math.PI * 2 + rnd() * 0.3;
    const x = cx + Math.cos(a) * ring, z = cz + Math.sin(a) * ring;
    if (!dry(x, z)) continue;
    const lp = lanternPost(pal); lp.position.set(x, gy(x, z), z);
    lp.rotation.y = a + Math.PI; group.add(lp);
  }

  const banners = [];
  const nBanners = 3 + (rnd() * 2 | 0);
  const clothMats = [pal.banner1, pal.banner2, pal.banner3];
  for (let i = 0; i < nBanners; i++) {
    const a = (i / nBanners) * Math.PI * 2 + 0.9;
    const x = cx + Math.cos(a) * (ring + 1.2), z = cz + Math.sin(a) * (ring + 1.2);
    if (!dry(x, z)) continue;
    const { group: bn, cloth } = banner(pal, clothMats[i % clothMats.length]);
    bn.position.set(x, gy(x, z), z); bn.rotation.y = a + Math.PI / 2;
    group.add(bn);
    banners.push({ cloth, phase: rnd() * Math.PI * 2 });
  }

  return { group, anim: { smoke: [], windmills: [], banners, flames: [], laundry: [] } };
}

// Build the hamlet around (ax, az). Returns { group, colliders, anim }.
// opts.small builds a modest satellite hamlet — fewer cottages and none of the
// big landmark buildings (chapel/tavern/windmill/forge/gate) — so a second one
// elsewhere on the map reads as an outlying farmstead, not a rival town.
export function plantVillage(world, ax, az, seed = 7, opts = {}) {
  const small = !!opts.small;
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
  const houses = small ? 2 + (rnd() * 2 | 0) : 6 + (rnd() * 3 | 0);
  const ringR = small ? 6 + rnd() * 2 : 9 + rnd() * 3;
  const placed = [];
  const chimneys = [];
  for (let i = 0; i < houses; i++) {
    const a = (i / houses) * Math.PI * 2 + rnd() * 0.5;
    const r = ringR + (rnd() - 0.5) * 4;
    const x = ax + Math.cos(a) * r, z = az + Math.sin(a) * r;
    if (!dry(x, z) || Math.hypot(x, z) > world.bounds - 6) continue;
    // skip cliff-side spots where a flat-based hut would float or bury a corner
    const s = slope(x, z, 2.4);
    if (s.max - s.min > 2.0) continue;
    const c = houseVariant(rnd, pal);
    c.position.set(x, s.min, z); // sit on the low corner so nothing floats
    c.rotation.y = Math.atan2(ax - x, az - z) + (rnd() - 0.5) * 0.4; // roughly face the well
    group.add(c);
    colliders.push({ x, z, r: c.userData.radius * 0.85 });
    placed.push({ x, z, a });
    // resolve the chimney top into world space (mirrors the collider rotation)
    if (c.userData.chimney) {
      const lc = c.userData.chimney, cs = Math.cos(c.rotation.y), sn = Math.sin(c.rotation.y);
      chimneys.push({ x: x + lc.x * cs + lc.z * sn, y: s.min + lc.y, z: z - lc.x * sn + lc.z * cs });
    }
  }

  // chapel with bell tower — set just beyond the cottage ring on flat ground
  if (!small) for (let tries = 0; tries < 6; tries++) {
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
  const stalls = small ? (rnd() * 2 | 0) : 2 + (rnd() * 2 | 0);
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

  // animation registers, filled as animated structures are placed
  const windmills = [], banners = [], flames = [], laundry = [];
  const addFlames = (obj, ox, oz) => { // register flicker targets (phase varies by position)
    if (!obj.userData.flames) return;
    for (const f of obj.userData.flames) flames.push({ mesh: f.mesh, base: f.base, phase: (ox + oz) * 0.7 });
  };
  // find a dry, sufficiently flat spot on a ring around the anchor
  const findSpot = (rMin, rMax, flatR, maxSlope, tries = 8) => {
    for (let t = 0; t < tries; t++) {
      const a = rnd() * Math.PI * 2, r = rMin + rnd() * (rMax - rMin);
      const x = ax + Math.cos(a) * r, z = az + Math.sin(a) * r;
      if (!dry(x, z) || Math.hypot(x, z) > world.bounds - 8) continue;
      const s = slope(x, z, flatR);
      if (s.max - s.min > maxSlope) continue;
      return { x, z, y: s.min, a };
    }
    return null;
  };

  // a windmill on the edge of the hamlet (tall — wants flat, open ground)
  if (!small) {
    const sp = findSpot(ringR + 6, ringR + 12, 2.6, 1.4);
    if (sp) {
      const { group: wm, blades } = windmill(pal);
      wm.position.set(sp.x, sp.y, sp.z); wm.rotation.y = Math.atan2(ax - sp.x, az - sp.z);
      group.add(wm); colliders.push({ x: sp.x, z: sp.z, r: wm.userData.radius });
      windmills.push({ blades, speed: 0.5 + rnd() * 0.4 });
    }
  }

  // a blacksmith forge just off the square
  if (!small) {
    const sp = findSpot(ringR - 2, ringR + 3, 2.4, 1.6);
    if (sp) {
      const fg = forge(rnd, pal);
      fg.position.set(sp.x, sp.y, sp.z); fg.rotation.y = Math.atan2(ax - sp.x, az - sp.z);
      group.add(fg); colliders.push({ x: sp.x, z: sp.z, r: fg.userData.radius * 0.85 });
      addFlames(fg, sp.x, sp.z);
    }
  }

  // the tavern — the biggest building, fronting the square — plus its yard
  if (!small) {
    const sp = findSpot(ringR - 3, ringR + 2, 3.4, 1.6);
    if (sp) {
      const tv = tavern(rnd, pal);
      tv.position.set(sp.x, sp.y, sp.z); tv.rotation.y = Math.atan2(ax - sp.x, az - sp.z);
      group.add(tv); colliders.push({ x: sp.x, z: sp.z, r: tv.userData.radius * 0.85 });
      // outdoor bench-and-table set out front, rotated into world space
      const ba = tv.userData.benchAnchor, cs2 = Math.cos(tv.rotation.y), sn2 = Math.sin(tv.rotation.y);
      const bx = sp.x + ba.x * cs2 + ba.z * sn2, bz = sp.z - ba.x * sn2 + ba.z * cs2;
      if (dry(bx, bz)) {
        const bt = benchTable(pal); bt.position.set(bx, gy(bx, bz), bz); bt.rotation.y = tv.rotation.y;
        group.add(bt); colliders.push({ x: bx, z: bz, r: bt.userData.radius * 0.6 });
      }
    }
  }

  // a barn out toward the fields (a working farmstead building)
  if (!small) {
    const sp = findSpot(ringR + 2, ringR + 9, 3.6, 1.6);
    if (sp) {
      const bn = longBarn(rnd, pal);
      bn.position.set(sp.x, sp.y, sp.z); bn.rotation.y = Math.atan2(ax - sp.x, az - sp.z) + (rnd() - 0.5) * 0.6;
      group.add(bn); colliders.push({ x: sp.x, z: sp.z, r: bn.userData.radius * 0.8 });
    }
  }

  // a manor house — the grandest dwelling, set a little apart from the square
  if (!small && rnd() < 0.85) {
    const sp = findSpot(ringR + 1, ringR + 7, 3.4, 1.4);
    if (sp) {
      const mn = manor(rnd, pal);
      mn.position.set(sp.x, sp.y, sp.z); mn.rotation.y = Math.atan2(ax - sp.x, az - sp.z);
      group.add(mn); colliders.push({ x: sp.x, z: sp.z, r: mn.userData.radius * 0.8 });
      if (mn.userData.chimney) {
        const lc = mn.userData.chimney, cs = Math.cos(mn.rotation.y), sn = Math.sin(mn.rotation.y);
        chimneys.push({ x: sp.x + lc.x * cs + lc.z * sn, y: sp.y + lc.y, z: sp.z - lc.x * sn + lc.z * cs });
      }
    }
  }

  // a bakery with a wood-fired oven (glowing mouth flickers like the forge)
  if (!small && rnd() < 0.8) {
    const sp = findSpot(ringR - 2, ringR + 3, 2.6, 1.6);
    if (sp) {
      const bk = bakery(rnd, pal);
      bk.position.set(sp.x, sp.y, sp.z); bk.rotation.y = Math.atan2(ax - sp.x, az - sp.z);
      group.add(bk); colliders.push({ x: sp.x, z: sp.z, r: bk.userData.radius * 0.75 });
      if (bk.userData.ovenGlow) flames.push({ mesh: bk.userData.ovenGlow, base: 1.6, phase: (sp.x + sp.z) * 0.7 });
      if (bk.userData.chimney) {
        const lc = bk.userData.chimney, cs = Math.cos(bk.rotation.y), sn = Math.sin(bk.rotation.y);
        chimneys.push({ x: sp.x + lc.x * cs + lc.z * sn, y: sp.y + lc.y, z: sp.z - lc.x * sn + lc.z * cs });
      }
    }
  }

  // a gateway arch on the approach side (facing the map centre / spawn)
  if (!small) {
    const toC = Math.atan2(-az, -ax); // direction from anchor toward origin
    const gr = ringR + 9;
    const x = ax + Math.cos(toC) * gr, z = az + Math.sin(toC) * gr;
    if (dry(x, z) && Math.hypot(x, z) < world.bounds - 6) {
      const s = slope(x, z, 3.0);
      if (s.max - s.min < 1.8) {
        const ga = gateArch(pal);
        ga.position.set(x, s.min, z); ga.rotation.y = toC + Math.PI / 2; // arch spans across the path
        group.add(ga);
        const cs = Math.cos(ga.rotation.y), sn = Math.sin(ga.rotation.y);
        for (const p of ga.userData.piers) colliders.push({ x: x + p.x * cs, z: z - p.x * sn, r: p.r });
      }
    }
  }

  // heraldic banners flanking the square + on the gate approach
  const nBanners = small ? (rnd() * 2 | 0) : 3 + (rnd() * 2 | 0);
  const clothMats = [pal.banner1, pal.banner2, pal.banner3];
  for (let i = 0; i < nBanners; i++) {
    const a = (i / nBanners) * Math.PI * 2 + 0.7, r = 6 + rnd() * 2;
    const x = ax + Math.cos(a) * r, z = az + Math.sin(a) * r;
    if (!dry(x, z)) continue;
    const { group: bn, cloth } = banner(pal, clothMats[i % clothMats.length]);
    bn.position.set(x, gy(x, z), z); bn.rotation.y = rnd() * Math.PI * 2;
    group.add(bn);
    banners.push({ cloth, phase: rnd() * Math.PI * 2 });
  }

  // fire braziers for light + warmth around the square
  const nBraz = 2 + (rnd() * 2 | 0);
  for (let i = 0; i < nBraz; i++) {
    const a = (i / nBraz) * Math.PI * 2 + 1.3, r = 4 + rnd() * 1.5;
    const x = ax + Math.cos(a) * r, z = az + Math.sin(a) * r;
    if (!dry(x, z)) continue;
    const br = brazier(pal); br.position.set(x, gy(x, z), z);
    group.add(br); colliders.push({ x, z, r: br.userData.radius * 0.6 });
    addFlames(br, x, z);
  }

  // a couple of crop fields on the outskirts
  const nFields = 2 + (rnd() * 2 | 0);
  for (let i = 0; i < nFields; i++) {
    const sp = findSpot(ringR + 4, ringR + 14, 3.0, 1.2);
    if (!sp) continue;
    const fld = cropField(rnd, pal);
    fld.position.set(sp.x, sp.y, sp.z); fld.rotation.y = rnd() * Math.PI * 2;
    group.add(fld); // fields are low — no collider, you can walk through the rows
  }

  // a small graveyard tucked beyond the ring (near the chapel, ideally)
  if (!small) {
    const sp = findSpot(ringR + 3, ringR + 9, 2.8, 1.4);
    if (sp) {
      const gv = graveyard(rnd, pal);
      gv.position.set(sp.x, sp.y, sp.z); gv.rotation.y = rnd() * Math.PI * 2;
      group.add(gv); colliders.push({ x: sp.x, z: sp.z, r: gv.userData.radius * 0.7 });
    }
  }

  // a livestock pen with a rail fence and a couple of animals
  {
    const sp = findSpot(ringR + 2, ringR + 8, 3.0, 1.2);
    if (sp) {
      const pn = pen(rnd, pal);
      pn.position.set(sp.x, sp.y, sp.z); pn.rotation.y = rnd() * Math.PI * 2;
      group.add(pn);
      // perimeter colliders (four corner posts) so you bump the fence, not the animals
      const { w, d } = pn.userData.fence, cs = Math.cos(pn.rotation.y), sn = Math.sin(pn.rotation.y);
      for (const [lx, lz] of [[-w / 2, 0], [w / 2, 0], [0, -d / 2], [0, d / 2]])
        colliders.push({ x: sp.x + lx * cs + lz * sn, z: sp.z - lx * sn + lz * cs, r: 0.6 });
    }
  }

  // scattered utility props: signpost, log piles, barrels, clothesline, trough
  const propAt = (rMin, rMax, build, colliderR) => {
    const a = rnd() * Math.PI * 2, r = rMin + rnd() * (rMax - rMin);
    const x = ax + Math.cos(a) * r, z = az + Math.sin(a) * r;
    if (!dry(x, z) || Math.hypot(x, z) > world.bounds - 6) return null;
    const o = build(); o.position.set(x, gy(x, z), z); o.rotation.y = rnd() * Math.PI * 2;
    group.add(o);
    if (colliderR) colliders.push({ x, z, r: colliderR });
    return { obj: o, x, z };
  };
  propAt(ringR - 3, ringR + 2, () => signpost(rnd, pal), 0.4);
  for (let i = 0; i < 2 + (rnd() * 2 | 0); i++) propAt(ringR - 1, ringR + 6, () => logPile(rnd, pal), 0.8);
  for (let i = 0; i < 2 + (rnd() * 2 | 0); i++) propAt(4, ringR + 3, () => barrelCluster(rnd, pal), 1.0);
  for (let i = 0; i < 2; i++) propAt(ringR - 2, ringR + 4, () => archeryButt(pal), 0.6);
  propAt(4, ringR, () => trough(pal), 1.0);
  // clotheslines — register their garments for sway
  for (let i = 0; i < 1 + (rnd() * 2 | 0); i++) {
    const p = propAt(ringR - 3, ringR + 3, () => clothesline(pal), 0);
    if (p) for (const gm of p.obj.userData.garments) laundry.push({ mesh: gm, phase: rnd() * Math.PI * 2 });
  }

  // drifting smoke from a few chimneys
  const smoke = buildSmoke(group, chimneys, rnd);

  group.userData.villagePalette = pal;
  return { group, colliders, anim: { smoke, windmills, banners, flames, laundry } };
}
