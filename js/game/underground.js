import * as THREE from 'three';

// Underground vaults. Trapdoor hatches sit on the surface (in the village, by
// enemy bases, out in the wild); press [E] on one to descend into a torch-lit
// stone vault built far outside the surface map (so nothing overlaps it), grab
// the treasure hoard, and climb the ladder to return. Built in-code, no assets.
//
// The world exposes each vault's flat floor via world._vaults so the player
// grounds correctly underground; walls are solid colliders.

function disposeGroup(g) {
  g.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) { const m = o.material; (Array.isArray(m) ? m : [m]).forEach((x) => x && x.dispose && x.dispose()); }
  });
}

const MAT = (c, r = 1, m = 0, flat = true) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m, flatShading: flat });

// a surface trapdoor: stone rim + two timber doors thrown open over a dark hole
function buildHatch() {
  const g = new THREE.Group();
  const stone = MAT(0x7c756a), wood = MAT(0x4a3524), dark = MAT(0x05060a);
  const rim = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.3, 2.4), stone);
  rim.position.y = 0.15; rim.receiveShadow = true; g.add(rim);
  const hole = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.1, 1.7), dark);
  hole.position.y = 0.26; g.add(hole);
  for (const s of [-1, 1]) {
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.1, 1.7), wood);
    door.position.set(s * 0.95, 0.55, 0); door.rotation.y = 0; door.rotation.x = 0;
    door.position.y = 0.9; door.rotation.z = s * 1.15; // flung open
    door.castShadow = true; g.add(door);
  }
  // a faint glow rising from the hole so it's noticeable
  const glow = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.04, 1.4), new THREE.MeshStandardMaterial({ color: 0x241a08, emissive: 0xffa028, emissiveIntensity: 0.7, roughness: 0.6 }));
  glow.position.y = 0.29; g.add(glow);
  g.userData.radius = 1.4;
  return g;
}

// a torch bracket with an emissive flame (flickers)
function buildTorch() {
  const g = new THREE.Group();
  const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.5, 0.12), MAT(0x2b2620, 0.6, 0.6));
  bracket.position.y = 0; g.add(bracket);
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.6, 6),
    new THREE.MeshStandardMaterial({ color: 0xff8a20, emissive: 0xff7a10, emissiveIntensity: 1.6, roughness: 0.5, flatShading: true }));
  flame.position.y = 0.45; g.add(flame);
  g.userData.flame = flame;
  return g;
}

// the treasure hoard: a mound of gold with two chests and a glowing gem
function buildHoard() {
  const g = new THREE.Group();
  const gold = new THREE.MeshStandardMaterial({ color: 0xffcf5a, emissive: 0xffb020, emissiveIntensity: 0.6, roughness: 0.5, metalness: 0.3, flatShading: true });
  const wood = MAT(0x5b3a1c), iron = MAT(0x2b2620, 0.6, 0.6);
  const pile = new THREE.Mesh(new THREE.ConeGeometry(1.6, 0.9, 8), gold);
  pile.position.y = 0.45; pile.castShadow = true; g.add(pile);
  for (let i = 0; i < 12; i++) {
    const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.05, 8), gold);
    coin.position.set((Math.random() - 0.5) * 3, 0.03, (Math.random() - 0.5) * 3); g.add(coin);
  }
  for (const s of [-1, 1]) {
    const chest = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.6, 0.6), wood);
    chest.position.set(s * 1.8, 0.3, -0.6); chest.castShadow = true; g.add(chest);
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.94, 0.12, 0.64), iron);
    band.position.set(s * 1.8, 0.42, -0.6); g.add(band);
  }
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.35, 0),
    new THREE.MeshStandardMaterial({ color: 0x40e0ff, emissive: 0x18b0d8, emissiveIntensity: 1.4, roughness: 0.2, flatShading: true }));
  gem.position.y = 1.15; g.add(gem);
  g.userData.gem = gem;
  return g;
}

// Vault themes so hatches don't all lead to the same stone box. `weight`
// biases the random pick — sanctum is rare and tougher, with better loot.
const THEMES = [
  { id: 'treasury', stone: 0x6a6258, dark: 0x4c463d, floor: 0x585149, weight: 3 },
  { id: 'crypt',     stone: 0x4a4a52, dark: 0x36363e, floor: 0x3a3840, weight: 3 },
  { id: 'mine',      stone: 0x5a4a3a, dark: 0x3e3226, floor: 0x4a3d2e, weight: 3 },
  { id: 'sanctum',   stone: 0x3a2438, dark: 0x241628, floor: 0x2c1a2e, weight: 1 },
];
function pickTheme() {
  const total = THEMES.reduce((s, t) => s + t.weight, 0);
  let r = Math.random() * total;
  for (const t of THEMES) { if ((r -= t.weight) <= 0) return t; }
  return THEMES[0];
}

function dressTreasury(vg, cx, cz, half, floorY, rnd) {
  // rolled rugs + a couple of urns flanking the hoard approach
  const rug = MAT(0x7a2b32, 1, 0);
  for (const s of [-1, 1]) {
    const r = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.06, 0.5), rug);
    r.position.set(cx + s * 2.4, floorY + 0.03, cz - half * 0.4); vg.add(r);
  }
  for (const s of [-1, 1]) {
    const urn = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.24, 0.8, 8), MAT(0x8a7a4a, 0.8, 0.3));
    urn.position.set(cx + s * (half - 2), floorY + 0.4, cz - half + 3.4); urn.castShadow = true; vg.add(urn);
  }
}
function dressCrypt(vg, cx, cz, half, floorY, rnd) {
  // stone coffins along the side walls + a scatter of bones/skulls
  const coffinMat = MAT(0x3a3a40, 0.9, 0.1);
  for (const s of [-1, 1]) {
    const coffin = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 2.2), coffinMat);
    coffin.position.set(cx + s * (half - 1.6), floorY + 0.25, cz + 1.0); coffin.castShadow = true; vg.add(coffin);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.1, 2.3), MAT(0x2e2e34));
    lid.position.set(cx + s * (half - 1.6), floorY + 0.55, cz + 1.0); vg.add(lid);
  }
  const boneMat = MAT(0xd8d0b8, 0.9, 0);
  for (let i = 0; i < 6; i++) {
    const bone = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.09, 0.09), boneMat);
    bone.position.set(cx + (rnd() - 0.5) * (half * 1.4), floorY + 0.05, cz + (rnd() - 0.5) * (half * 1.4));
    bone.rotation.y = rnd() * Math.PI; vg.add(bone);
  }
  const skull = new THREE.Mesh(new THREE.IcosahedronGeometry(0.18, 0), boneMat);
  skull.position.set(cx + 1.2, floorY + 0.18, cz - half * 0.2); vg.add(skull);
}
function dressMine(vg, cx, cz, half, floorY, rnd) {
  // timber support frames along the room + an ore cart on rails
  const timber = MAT(0x4a3524);
  for (let i = -1; i <= 1; i++) {
    const z = cz + i * (half * 0.6);
    const beam = new THREE.Mesh(new THREE.BoxGeometry(half * 2 - 2, 0.2, 0.2), timber);
    beam.position.set(cx, floorY + 5.6, z); vg.add(beam);
    for (const s of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.2, 5.6, 0.2), timber);
      post.position.set(cx + s * (half - 1), floorY + 2.8, z); vg.add(post);
    }
  }
  // rail track + a small ore cart
  const rail = MAT(0x2b2620, 0.5, 0.6);
  for (const s of [-0.35, 0.35]) {
    const track = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, half * 1.6), rail);
    track.position.set(cx + s, floorY + 0.03, cz); vg.add(track);
  }
  const cart = new THREE.Group();
  const bed = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.5, 0.8), MAT(0x3a3226, 0.8, 0.3));
  bed.position.y = 0.4; bed.castShadow = true; cart.add(bed);
  for (const s of [-1, 1]) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.1, 8), rail);
    wheel.rotation.x = Math.PI / 2; wheel.position.set(0, 0.18, s * 0.45); cart.add(wheel);
  }
  const ore = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 0),
    new THREE.MeshStandardMaterial({ color: 0x2a6ea0, emissive: 0x1a4a70, emissiveIntensity: 0.5, roughness: 0.6, flatShading: true }));
  ore.position.y = 0.75; cart.add(ore);
  cart.position.set(cx, floorY, cz + half * 0.35);
  vg.add(cart);
}
function dressSanctum(vg, cx, cz, half, floorY, rnd) {
  // a glowing rune ring on the floor around the hoard, ringed by ritual
  // candles, with hanging chains along the walls — an ominous, guarded feel
  const runeMat = new THREE.MeshStandardMaterial({ color: 0x2a1030, emissive: 0x9a30ff, emissiveIntensity: 0.7, roughness: 0.6, flatShading: true });
  const ring = new THREE.Mesh(new THREE.RingGeometry(2.6, 3.0, 24), runeMat);
  ring.rotation.x = -Math.PI / 2; ring.position.set(cx, floorY + 0.03, cz - half + 4.2); vg.add(ring);
  const ring2 = new THREE.Mesh(new THREE.RingGeometry(1.6, 1.85, 20), runeMat);
  ring2.rotation.x = -Math.PI / 2; ring2.position.set(cx, floorY + 0.03, cz - half + 4.2); vg.add(ring2);
  const candleWax = MAT(0x3a3226), candleFlame = new THREE.MeshStandardMaterial({ color: 0xb040ff, emissive: 0x9a20ff, emissiveIntensity: 1.5, roughness: 0.5, flatShading: true });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const cxx = cx + Math.cos(a) * 3.2, czz = cz - half + 4.2 + Math.sin(a) * 3.2;
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.4, 6), candleWax);
    stick.position.set(cxx, floorY + 0.2, czz); vg.add(stick);
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 5), candleFlame);
    flame.position.set(cxx, floorY + 0.46, czz); vg.add(flame);
  }
  // hanging chains along the side walls
  const chainMat = MAT(0x1c1c20, 0.5, 0.7);
  for (const s of [-1, 1]) {
    for (let i = -1; i <= 1; i++) {
      const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.4, 6), chainMat);
      chain.position.set(cx + s * (half - 0.7), floorY + 3.4, cz + i * (half * 0.55)); vg.add(chain);
    }
  }
}
const DRESS = { treasury: dressTreasury, crypt: dressCrypt, mine: dressMine, sanctum: dressSanctum };

export class Underground {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.hatches = [];       // { group, x, z, y, vault }
    this.vaults = [];        // { group, cx, cz, half, floorY, entry, torches, hoard, hoardObj, looted }
    this.inside = null;      // the vault the player is currently in, or null
    this._colliders = new Set();
    this._time = 0;
    this.looted = 0;
  }

  _dry(x, z) { return !(this.world.waterAt && this.world.waterAt(x, z)); }
  _groundY(x, z) { return this.world.heightAt ? Math.max(0, this.world.heightAt(x, z)) : 0; }

  reset() {
    // tear down old hatches + vaults
    for (const h of this.hatches) { this.scene.remove(h.group); disposeGroup(h.group); }
    for (const v of this.vaults) { this.scene.remove(v.group); disposeGroup(v.group); }
    this.hatches = []; this.vaults = []; this.inside = null; this.looted = 0;
    // remove old vault colliders + floor footprints
    if (this.world.colliders) this.world.colliders = this.world.colliders.filter((c) => !this._colliders.has(c));
    this._colliders.clear();
    this.world._vaults = [];

    const n = 2 + (Math.random() * 2 | 0);
    for (let i = 0; i < n; i++) this._makeOne(i);
  }

  _makeOne(i) {
    const B = this.world.bounds || 130;
    // surface hatch spot: dry, off the spawn lane
    let hx = 0, hz = 0, ok = false;
    for (let t = 0; t < 30; t++) {
      const a = Math.random() * Math.PI * 2, r = 24 + Math.random() * (B - 30);
      hx = Math.cos(a) * r; hz = Math.sin(a) * r;
      if (!this._dry(hx, hz)) continue;
      if (Math.abs(hx) < 6 && hz > -100 && hz < 20) continue;
      ok = true; break;
    }
    if (!ok) return;
    const hatch = buildHatch();
    const hy = this._groundY(hx, hz);
    hatch.position.set(hx, hy + 0.02, hz);
    hatch.rotation.y = Math.random() * Math.PI * 2;
    this.scene.add(hatch);

    // vault far outside the surface map (isolated, flat floor at y=0)
    const half = 11, cx = 1000 + i * 90, cz = 0, floorY = 0;
    const theme = pickTheme();
    const vg = new THREE.Group();
    const stone = MAT(theme.stone), stoneDark = MAT(theme.dark), floorMat = MAT(theme.floor);
    const floor = new THREE.Mesh(new THREE.BoxGeometry(half * 2, 0.4, half * 2), floorMat);
    floor.position.set(cx, floorY - 0.2, cz); floor.receiveShadow = true; vg.add(floor);
    const ceil = new THREE.Mesh(new THREE.BoxGeometry(half * 2, 0.4, half * 2), stoneDark);
    ceil.position.set(cx, floorY + 6.2, cz); vg.add(ceil);
    // four walls (with collider strips)
    const wallH = 6;
    const addWall = (ox, oz, w, d) => {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(w, wallH, d), stone);
      wall.position.set(cx + ox, floorY + wallH / 2, cz + oz); wall.castShadow = true; vg.add(wall);
      // colliders along the inner face
      const along = w > d ? w : d, step = 3.2, n = Math.max(1, Math.round(along / step));
      for (let k = 0; k <= n; k++) {
        const t = -0.5 + k / n;
        const px = cx + ox + (w > d ? t * (w - 1) : 0);
        const pz = cz + oz + (w > d ? 0 : t * (d - 1));
        this._addCollider(px, pz, 0.8);
      }
    };
    addWall(0, -half, half * 2, 1);
    addWall(0, half, half * 2, 1);
    addWall(-half, 0, 1, half * 2);
    addWall(half, 0, 1, half * 2);
    // pillars
    for (const [px, pz] of [[-half * 0.5, -half * 0.5], [half * 0.5, -half * 0.5], [-half * 0.5, half * 0.5], [half * 0.5, half * 0.5]]) {
      const pil = new THREE.Mesh(new THREE.BoxGeometry(0.8, wallH, 0.8), stoneDark);
      pil.position.set(cx + px, floorY + wallH / 2, cz + pz); pil.castShadow = true; vg.add(pil);
      this._addCollider(cx + px, cz + pz, 0.7);
    }
    // torches around the walls
    const torches = [];
    for (const [tx, tz] of [[-half + 1.2, -half + 1.2], [half - 1.2, -half + 1.2], [-half + 1.2, half - 1.2], [half - 1.2, half - 1.2]]) {
      const tor = buildTorch(); tor.position.set(cx + tx, floorY + 3.2, cz + tz); vg.add(tor);
      torches.push(tor.userData.flame);
    }
    // entry ladder (return to surface) near the -z wall
    const entry = { x: cx, z: cz + half - 2.2 };
    const ladder = new THREE.Group();
    for (const s of [-0.3, 0.3]) { const rail = new THREE.Mesh(new THREE.BoxGeometry(0.1, wallH, 0.1), MAT(0x4a3524)); rail.position.set(entry.x + s, floorY + wallH / 2, cz + half - 0.6); ladder.add(rail); }
    for (let r = 0; r < 8; r++) { const rung = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.08, 0.08), MAT(0x4a3524)); rung.position.set(entry.x, floorY + 0.4 + r * 0.7, cz + half - 0.6); ladder.add(rung); }
    const exitGlow = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.04, 1.2), new THREE.MeshStandardMaterial({ color: 0x203018, emissive: 0x8fe04a, emissiveIntensity: 0.9, roughness: 0.6 }));
    exitGlow.position.set(entry.x, floorY + 0.05, cz + half - 1.6); ladder.add(exitGlow);
    vg.add(ladder);
    // theme-specific dressing (rugs/urns, coffins/bones, or mine timbers/cart)
    DRESS[theme.id](vg, cx, cz, half, floorY, Math.random);
    // treasure hoard at the far end
    const hoard = buildHoard(); hoard.position.set(cx, floorY, cz - half + 2.6); vg.add(hoard);

    this.scene.add(vg);
    // guardian(s) spawn partway between the ladder and the hoard the first
    // time the vault is entered — smash-and-grab is possible, but the hoard
    // isn't undefended. The rare sanctum posts two guards instead of one.
    const guardianSpot = { x: cx, z: cz - half * 0.15 };
    const guardianTypes = theme.id === 'sanctum' ? ['shielded', 'lurker'] : ['shielded'];
    const vault = { group: vg, cx, cz, half, floorY, entry, torches, theme: theme.id, hoardObj: hoard.userData.gem, hoardPos: { x: cx, z: cz - half + 2.6 }, looted: false, guardianSpot, guardianTypes, guardianSpawned: false };
    this.vaults.push(vault);
    this.world._vaults.push({ cx, cz, half: half - 0.5, floorY });
    this.hatches.push({ group: hatch, x: hx, z: hz, y: hy, vault });
  }

  _addCollider(x, z, r) { const c = { x, z, r }; this.world.colliders.push(c); this._colliders.add(c); }

  // nearest actionable underground thing to (px,pz): {kind,obj} or null.
  // On the surface → hatches. Inside a vault → the exit ladder or unlooted hoard.
  nearest(px, pz, range = 3.0) {
    if (this.inside) {
      const v = this.inside;
      const dExit = Math.hypot(v.entry.x - px, v.entry.z - pz);
      const dHoard = Math.hypot(v.hoardPos.x - px, v.hoardPos.z - pz);
      if (!v.looted && dHoard < range && dHoard <= dExit) return { kind: 'hoard', obj: v };
      if (dExit < range) return { kind: 'exit', obj: v };
      if (!v.looted && dHoard < range) return { kind: 'hoard', obj: v };
      return null;
    }
    let best = null, bd = range;
    for (const h of this.hatches) {
      const d = Math.hypot(h.x - px, h.z - pz);
      if (d < bd) { bd = d; best = { kind: 'hatch', obj: h }; }
    }
    return best;
  }

  // descend: returns the target position to teleport the player to
  enter(hatch) {
    const v = hatch.vault;
    this.inside = v;
    return { x: v.entry.x, y: v.floorY, z: v.entry.z - 1.2 };
  }
  // ascend: returns the surface hatch position
  exit(vault) {
    const h = this.hatches.find((x) => x.vault === vault) || this.hatches[0];
    this.inside = null;
    return h ? { x: h.x, y: h.y + 0.1, z: h.z + 1.8 } : { x: 0, y: 0, z: 0 };
  }
  // loot the hoard once; returns a reward or null. The sanctum pays out more
  // for the extra risk of its second guardian.
  loot(vault) {
    if (!vault || vault.looted) return null;
    vault.looted = true; this.looted++;
    if (vault.hoardObj) vault.hoardObj.visible = false;
    if (vault.theme === 'sanctum') return { credits: 750 + (Math.random() * 400 | 0), item: 'armor' };
    return { credits: 400 + (Math.random() * 400 | 0), item: Math.random() < 0.6 ? 'armor' : 'ammo' };
  }

  update(dt) {
    this._time += dt;
    const t = this._time;
    // flicker torches + spin the gem
    for (const v of this.vaults) {
      for (const fl of v.torches) {
        const f = 0.75 + Math.sin(t * 12 + v.cx) * 0.15 + Math.sin(t * 27 + v.cx) * 0.1;
        fl.material.emissiveIntensity = 1.6 * f; fl.scale.y = 0.85 + f * 0.3;
      }
      if (v.hoardObj && v.hoardObj.visible) { v.hoardObj.rotation.y += dt * 1.2; v.hoardObj.position.y = v.floorY + 1.15 + Math.sin(t * 2) * 0.08; }
    }
  }
}
