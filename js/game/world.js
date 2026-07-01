import * as THREE from 'three';
import { Critters } from './critters.js';
import { plantFlora } from './flora.js';
import { plantVillage } from './village.js';

// --- seeded value noise / fbm for organic, Earth-like terrain ---
function hash2(ix, iz, seed) {
  let h = Math.imul(ix | 0, 374761393) ^ Math.imul(iz | 0, 668265263) ^ Math.imul(seed | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function vnoise(x, z, seed) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz, seed), b = hash2(ix + 1, iz, seed), c = hash2(ix, iz + 1, seed), d = hash2(ix + 1, iz + 1, seed);
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}
function fbm(x, z, seed) {
  let s = 0, amp = 0.5, fr = 1, norm = 0;
  for (let o = 0; o < 4; o++) { s += vnoise(x * fr, z * fr, seed + o * 101) * amp; norm += amp; fr *= 2; amp *= 0.5; }
  return s / norm; // 0..1
}
const MAP_SEEDS = { plains: 11, highlands: 23, lowlands: 37, mountains: 53 };

// Selectable battlefields, each with distinct Earth-like topography.
export const MAPS = {
  plains: {
    name: 'Verdant Plains', topo: 'Plains',
    desc: 'Gentle golden grassland. Open sightlines and light cover — a fair fight.',
    ground: 0x4f7d1e, amp: 1.8, freq: 0.05, ridge: 0, lift: 0,
    treeDensity: 220, rockDensity: 60, grass: 1200, fogFar: 205,
    lakes: [{ x: -58, z: 38, r: 18 }, { x: 60, z: -10, r: 16 }],
    preview: ['#1b2c08', '#7d7a1c', '#4f7d1e'],
  },
  highlands: {
    name: 'Ashen Highlands', topo: 'Highlands',
    desc: 'Raised rugged hills and broken plateaus. More rock, less cover, rolling elevation.',
    ground: 0x6a6a3a, amp: 6.5, freq: 0.055, ridge: 0.35, lift: 2.5,
    treeDensity: 130, rockDensity: 110, grass: 560, fogFar: 215,
    lakes: [{ x: 64, z: 30, r: 14 }],
    preview: ['#3a4426', '#8a7a3a', '#6a6a3a'],
  },
  lowlands: {
    name: 'Mire Lowlands', topo: 'Lowlands',
    desc: 'Sunken wetlands and broad water. Heavy fog, close quarters, plenty of wading.',
    ground: 0x3c5a26, amp: 1.3, freq: 0.05, ridge: 0, lift: -1.1,
    treeDensity: 185, rockDensity: 40, grass: 980, fogFar: 150,
    lakes: [{ x: -40, z: 30, r: 26 }, { x: 45, z: 20, r: 24 }, { x: 8, z: 70, r: 22 }, { x: -55, z: -32, r: 20 }],
    preview: ['#1a2614', '#2f5a4a', '#3c5a26'],
  },
  mountains: {
    name: 'Titan Peaks', topo: 'Mountains',
    desc: 'Steep ridges ringing a fighting valley. Verticality, chokepoints and snow.',
    ground: 0x5a5e52, amp: 12, freq: 0.07, ridge: 0.7, lift: 1.5,
    treeDensity: 105, rockDensity: 140, grass: 420, fogFar: 205,
    lakes: [{ x: 58, z: -40, r: 14 }],
    preview: ['#2a3550', '#8a90a0', '#5a5e52'],
  },
};
export const MAP_ORDER = ['plains', 'highlands', 'lowlands', 'mountains'];

// Builds the low-poly battlefield: sky, mountains, terrain, a ruined town,
// trees, water and props — all under a single root group so maps can be swapped.
export class World {
  constructor(scene, mapId) {
    this.scene = scene;
    this.mapId = MAPS[mapId] ? mapId : 'plains';
    this.map = MAPS[this.mapId];
    this._seed = MAP_SEEDS[this.mapId] || 11;
    this.colliders = []; // {x,z,r}
    this.climbVolumes = []; // {x,z,r,baseY,top} — ladder zones on watchtowers
    this.platforms = [];    // {x,z,hw,y} — climbable tower decks you can stand on
    this.barrels = [];    // explosive barrels {group,x,z,hp,dead}
    this.destructibles = []; // crate stacks {group,x,z,collider,crates:Set}
    this._crateMeshes = []; // flat list of crate meshes for raycasting
    this.bounds = 130;
    this._clouds = [];
    this._time = 0;
    this._waterMats = [];
    this._fogFar = this.map.fogFar;
    // lake basins (from the map); carved into the terrain
    this.lakes = this.map.lakes.map((l) => ({ ...l }));
    this.root = new THREE.Group();
    this.scene.add(this.root);
    this._build();
  }

  dispose() {
    this.scene.remove(this.root);
    this.root.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) { const m = o.material; (Array.isArray(m) ? m : [m]).forEach((x) => x && x.dispose && x.dispose()); }
    });
  }

  rebuild(mapId) {
    this.dispose();
    this.mapId = MAPS[mapId] ? mapId : 'plains';
    this.map = MAPS[this.mapId];
    this._seed = MAP_SEEDS[this.mapId] || 11;
    this._fogFar = this.map.fogFar;
    this.lakes = this.map.lakes.map((l) => ({ ...l }));
    this.colliders = []; this.climbVolumes = []; this.platforms = []; this.barrels = []; this.destructibles = []; this._crateMeshes = []; this._clouds = []; this._waterMats = []; this._time = 0;
    this.root = new THREE.Group();
    this.scene.add(this.root);
    this._build();
  }

  _build() {
    this._buildSky();
    this._buildLights();
    this._buildTerrain();
    this._buildMountains();
    this._plantForest();
    this._buildTown();
    this._buildVillage();
    this._buildWater();
    this._scatterRocks();
    this._scatterGrass();
    this._scatterFlora();
    this._buildBase();
    this._buildTowers();
    this._buildAtmosphere();
    this._critters = new Critters(this.root, this);
  }

  // ---------- Atmospheric set-dressing (ported from the HELA reference) ----------
  // A distant ruined-city skyline lost in the haze, mossy stone monoliths for
  // cover, drooping cables, and drifting low mist planes — all tuned for depth.
  _buildAtmosphere() {
    this._mist = [];
    this._buildSkyline(50);    // distant towers fading into the fog
    this._buildMonoliths(12);  // moss-capped stone blocks (cover)
    this._buildCables(9);      // drooping power lines
    this._buildMist(12);       // low drifting volumetric haze
  }

  // 50 distant non-colliding towers in a far ring; the fog fades them to silhouettes
  _buildSkyline(n) {
    const greys = [0x8a9088, 0x7e857b, 0x959c92, 0x747b71];
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true });
    const inst = new THREE.InstancedMesh(geo, mat, n);
    const dummy = new THREE.Object3D(), col = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = this.bounds * 1.15 + Math.random() * this.bounds * 0.5; // ~150..215, deep in the haze
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const h = 38 + Math.random() * 80, w = 8 + Math.random() * 16, d = 8 + Math.random() * 16;
      dummy.position.set(x, h / 2, z); dummy.scale.set(w, h, d); dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
      inst.setColorAt(i, col.setHex(greys[i % greys.length]));
    }
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    inst.frustumCulled = false; inst.castShadow = false; inst.receiveShadow = false;
    this.root.add(inst);
  }

  // 12 big moss-capped concrete monoliths scattered as cover (colliders)
  _buildMonoliths(n) {
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x5a6356, roughness: 1, flatShading: true });
    const mossMat = new THREE.MeshStandardMaterial({ color: 0x4f7236, roughness: 1, flatShading: true });
    let made = 0, guard = 0;
    while (made < n && guard < 200) {
      guard++;
      const x = (Math.random() - 0.5) * this.bounds * 1.5, z = (Math.random() - 0.5) * this.bounds * 1.5;
      if (Math.hypot(x, z - 30) < 18) continue;          // keep the spawn clearing open
      if (this.waterAt(x, z)) continue;
      const w = 3.5 + Math.random() * 4, h = 4 + Math.random() * 7, d = 3.5 + Math.random() * 4;
      const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = (Math.random() - 0.5) * 0.7;
      const block = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), stoneMat);
      block.position.y = h / 2; block.castShadow = true; block.receiveShadow = true; g.add(block);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(w * 0.98, 0.5, d * 0.98), mossMat);
      cap.position.y = h + 0.2; cap.castShadow = true; g.add(cap);
      this.root.add(g);
      this.colliders.push({ x, z, r: Math.max(w, d) * 0.5 });
      made++;
    }
  }

  // 9 drooping cables strung between tall anchors (watchtowers + a few pylons)
  _buildCables(n) {
    const anchors = (this.towers || []).map((t) => new THREE.Vector3(t.x, t.topY + 0.2, t.z));
    // a couple of utility pylons to give the cables something to span
    const pylonMat = new THREE.MeshStandardMaterial({ color: 0x3a352c, roughness: 1, flatShading: true });
    const pyspots = [[-58, 10], [-30, -40], [40, -60], [62, 10], [10, 64]];
    for (const [px, pz] of pyspots) {
      if (this.waterAt(px, pz)) continue;
      const base = Math.max(0, this.heightAt(px, pz)), ph = 13;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.32, ph, 5), pylonMat);
      pole.position.set(px, base + ph / 2, pz); pole.castShadow = true; this.root.add(pole);
      const cross = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.2, 0.2), pylonMat);
      cross.position.set(px, base + ph - 1, pz); this.root.add(cross);
      this.colliders.push({ x: px, z: pz, r: 0.5 });
      anchors.push(new THREE.Vector3(px, base + ph - 1, pz));
    }
    const cableMat = new THREE.LineBasicMaterial({ color: 0x14140f });
    let made = 0;
    for (let i = 0; i < anchors.length && made < n; i++) {
      const a = anchors[i], b = anchors[(i + 1) % anchors.length];
      if (a.equals(b) || a.distanceTo(b) > 80) continue;
      const sag = 2.5 + Math.random() * 2.5, pts = [];
      for (let s = 0; s <= 12; s++) { const t = s / 12; const p = a.clone().lerp(b, t); p.y -= Math.sin(t * Math.PI) * sag; pts.push(p); }
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), cableMat);
      line.frustumCulled = false; this.root.add(line);
      made++;
    }
  }

  // 12 drifting low haze sprites — the signature "hazy" depth layer
  _buildMist(n) {
    if (!this._mistTex) {
      const c = document.createElement('canvas'); c.width = c.height = 128;
      const ctx = c.getContext('2d');
      const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
      g.addColorStop(0, 'rgba(226,224,206,0.85)'); g.addColorStop(1, 'rgba(226,224,206,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
      this._mistTex = new THREE.CanvasTexture(c);
    }
    for (let i = 0; i < n; i++) {
      const mat = new THREE.SpriteMaterial({ map: this._mistTex, transparent: true, opacity: 0.42, depthWrite: false, fog: true });
      const sp = new THREE.Sprite(mat);
      const size = 26 + Math.random() * 34;
      sp.scale.set(size, size * 0.55, 1);
      sp.position.set((Math.random() - 0.5) * this.bounds * 1.7, 2.5 + Math.random() * 5, (Math.random() - 0.5) * this.bounds * 1.7);
      sp.frustumCulled = false;
      this.root.add(sp);
      this._mist.push({ sp, drift: (Math.random() - 0.5) * 0.6 + 0.4, phase: Math.random() * 6.28, sy: 0.4 + Math.random() * 0.6 });
    }
  }

  // Wooden towers with a ladder you climb (hold W / Space in the ladder zone)
  // up to a railed deck — a tactical sniping perch enemies can't follow you onto.
  _buildTowers() {
    this.climbVolumes = this.climbVolumes || [];
    this.platforms = this.platforms || [];
    this.towers = [];
    const wood = new THREE.MeshStandardMaterial({ color: 0x6b4a2a, roughness: 0.95, flatShading: true });
    const deckMat = new THREE.MeshStandardMaterial({ color: 0x7d5836, roughness: 0.9, flatShading: true });
    const spots = [[-46, -22], [52, 28], [-32, 56], [58, -50]];
    for (const [x, z] of spots) {
      if (this.waterAt(x, z)) continue;
      const base = Math.max(0, this.heightAt(x, z));
      const H = 8, topY = base + H, hw = 1.7;
      const g = new THREE.Group(); g.position.set(x, 0, z);
      // four corner legs (thin colliders so you can walk between them at ground)
      const legGeo = new THREE.BoxGeometry(0.28, H, 0.28);
      for (const [lx, lz] of [[-hw, -hw], [hw, -hw], [-hw, hw], [hw, hw]]) {
        const leg = new THREE.Mesh(legGeo, wood); leg.position.set(lx, base + H / 2, lz); leg.castShadow = true; g.add(leg);
        this.colliders.push({ x: x + lx, z: z + lz, r: 0.4 });
      }
      // deck
      const deck = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + 0.4, 0.3, hw * 2 + 0.4), deckMat);
      deck.position.set(0, topY, 0); deck.castShadow = true; deck.receiveShadow = true; g.add(deck);
      // railings on three sides (ladder face at +z stays open)
      g.add(this._railing(0, topY + 0.55, -hw - 0.1, hw * 2 + 0.4, 0.12, wood));
      g.add(this._railing(-hw - 0.1, topY + 0.55, 0, 0.12, hw * 2 + 0.4, wood));
      g.add(this._railing(hw + 0.1, topY + 0.55, 0, 0.12, hw * 2 + 0.4, wood));
      // ladder rungs + rails on the +z face
      for (let yy = base + 0.5; yy < topY; yy += 0.55) {
        const rung = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.09, 0.09), wood); rung.position.set(0, yy, hw + 0.05); g.add(rung);
      }
      [-0.5, 0.5].forEach((rx) => { const sr = new THREE.Mesh(new THREE.BoxGeometry(0.1, H, 0.1), wood); sr.position.set(rx, base + H / 2, hw + 0.05); g.add(sr); });
      this.root.add(g);
      // ladder zone sits just inside the deck edge so the top of the climb lands
      // you on the deck even if you climb straight up with Space
      this.climbVolumes.push({ x, z: z + hw - 0.15, r: 1.4, baseY: base, top: topY + 0.1 });
      this.platforms.push({ x, z, hw, y: topY + 0.15 });
      this.towers.push({ x, z, topY });
    }
  }
  _railing(px, py, pz, w, d, mat) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.7, d), mat); m.position.set(px, py, pz); return m; }

  // climbable ladder volume at (x,z), or null
  climbAt(x, z) {
    for (const c of this.climbVolumes) if (Math.hypot(x - c.x, z - c.z) <= c.r) return c;
    return null;
  }
  // ground height incl. tower decks (only when the player is near deck height)
  groundHeight(x, z, y) {
    let h = Math.max(0, this.heightAt(x, z));
    for (const p of this.platforms) {
      if (Math.abs(x - p.x) <= p.hw && Math.abs(z - p.z) <= p.hw && (y == null || y > p.y - 2.2)) h = Math.max(h, p.y);
    }
    return h;
  }

  _scatterFlora() {
    if (this._floraDensity == null) this._floraDensity = 1;
    const { group, colliders } = plantFlora(this, this._floraDensity);
    this._floraGroup = group;
    this._floraColliders = new Set();
    this.root.add(group);
    for (const c of colliders) if (Math.hypot(c.x, c.z) < this.bounds) { this.colliders.push(c); this._floraColliders.add(c); }
  }

  // density: 0..1.5 (Foliage Density setting). Rebuilds the instanced flora.
  setFloraDensity(factor) {
    factor = Math.max(0, factor);
    if (this._floraGroup && this._floraDensity === factor) return; // no change
    this._floraDensity = factor;
    clearTimeout(this._floraT);
    this._floraT = setTimeout(() => this._rebuildFlora(), 120);
  }
  _rebuildFlora() {
    if (this._floraGroup) {
      this.root.remove(this._floraGroup);
      this._floraGroup.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
      const mat = this._floraGroup.userData.floraMat; if (mat) mat.dispose();
    }
    if (this._floraColliders) this.colliders = this.colliders.filter((c) => !this._floraColliders.has(c));
    this._scatterFlora();
  }

  // ---------- Enemy base (vehicle attack objective) ----------
  _buildBase() {
    const bx = 0, bz = -118;
    const g = new THREE.Group();
    const wall = new THREE.MeshStandardMaterial({ color: 0x3a3f33, roughness: 0.9, metalness: 0.2, flatShading: true });
    const metal = new THREE.MeshStandardMaterial({ color: 0x55303a, roughness: 0.5, metalness: 0.6, flatShading: true });
    const R = 14;
    // perimeter walls (visual) + corner towers (solid)
    for (const [dx, dz, w, d] of [[0, -R, 2 * R, 2], [0, R, 2 * R, 2], [-R, 0, 2, 2 * R], [R, 0, 2, 2 * R]]) {
      const seg = new THREE.Mesh(new THREE.BoxGeometry(w, 4, d), wall);
      seg.position.set(bx + dx, 2, bz + dz); seg.castShadow = true; g.add(seg);
    }
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const t = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.9, 7, 6), wall);
      t.position.set(bx + sx * R, 3.5, bz + sz * R); t.castShadow = true; g.add(t);
      this.colliders.push({ x: bx + sx * R, z: bz + sz * R, r: 2 });
    }
    // central reactor core — the destructible target
    const core = new THREE.Mesh(
      new THREE.IcosahedronGeometry(3.2, 0),
      new THREE.MeshStandardMaterial({ color: 0xff5530, emissive: 0xff3010, emissiveIntensity: 0.85, roughness: 0.4, flatShading: true })
    );
    core.position.set(bx, 3.6, bz); core.castShadow = true; g.add(core);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(4.4, 0.4, 6, 16), metal);
    ring.position.set(bx, 3.6, bz); ring.rotation.x = Math.PI / 2; g.add(ring);
    this.colliders.push({ x: bx, z: bz, r: 4 });
    this.root.add(g);
    this.base = { group: g, core, ring, hp: 2600, maxHp: 2600, x: bx, z: bz, r: 3.8, alive: true, _flash: 0 };
  }

  baseHpFrac() { return this.base && this.base.alive ? this.base.hp / this.base.maxHp : 0; }

  // apply damage; returns true the moment it is destroyed
  damageBase(amount) {
    const b = this.base;
    if (!b || !b.alive) return false;
    b.hp -= amount; b._flash = 0.12;
    if (b.hp <= 0) { b.hp = 0; b.alive = false; return true; }
    return false;
  }

  // ray–sphere test against the core (for direct bullet hits)
  baseHitPoint(origin, dir) {
    const b = this.base;
    if (!b || !b.alive) return null;
    const ox = origin.x - b.x, oy = origin.y - 3.6, oz = origin.z - b.z, R = b.r + 0.4;
    const proj = ox * dir.x + oy * dir.y + oz * dir.z;
    const disc = proj * proj - (ox * ox + oy * oy + oz * oz - R * R);
    if (disc < 0) return null;
    const t = -proj - Math.sqrt(disc);
    if (t < 0) return null;
    return { point: new THREE.Vector3(origin.x + dir.x * t, origin.y + dir.y * t, origin.z + dir.z * t), distance: t };
  }

  // ---------- Sky ----------
  _buildSky() {
    const scene = this.scene;
    // gradient sky dome
    const uniforms = {
      top: { value: new THREE.Color(0x2a4a6e) },
      mid: { value: new THREE.Color(0xb59428) },
      bot: { value: new THREE.Color(0xe8951f) },
    };
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false, uniforms,
      vertexShader: `varying vec3 vP; void main(){ vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
      fragmentShader: `
        varying vec3 vP; uniform vec3 top; uniform vec3 mid; uniform vec3 bot;
        void main(){
          float h = normalize(vP).y;
          vec3 c = h>0.0 ? mix(mid, top, pow(h,0.6)) : mix(mid, bot, pow(-h,0.5));
          gl_FragColor = vec4(c,1.0);
        }`,
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 24, 16), skyMat);
    this.root.add(sky);
    this._skyU = uniforms;

    scene.fog = new THREE.Fog(0xdccaa2, 40, 205);   // pale warm haze, brought in for depth
    this._fog = scene.fog;

    // sun disc + glow
    const sunDisc = new THREE.Mesh(
      new THREE.CircleGeometry(28, 32),
      new THREE.MeshBasicMaterial({ color: 0xfff3c0, fog: false })
    );
    this.root.add(sunDisc);
    this._sunDisc = sunDisc;
    const glow = new THREE.Mesh(
      new THREE.CircleGeometry(70, 32),
      new THREE.MeshBasicMaterial({ color: 0xffd866, transparent: true, opacity: 0.4, fog: false })
    );
    this.root.add(glow);
    this._sunGlow = glow;

    // moon (shown at night)
    const moon = new THREE.Mesh(
      new THREE.CircleGeometry(20, 32),
      new THREE.MeshBasicMaterial({ color: 0xdfe6ff, fog: false, transparent: true, opacity: 0 })
    );
    this.root.add(moon);
    this._moon = moon;

    // clouds (soft sprites)
    const tex = this._cloudTexture();
    for (let i = 0; i < 14; i++) {
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.5 + Math.random() * 0.3, depthWrite: false, fog: false, color: 0xffe9b0 });
      const s = new THREE.Sprite(mat);
      const ang = Math.random() * Math.PI * 2;
      const r = 180 + Math.random() * 120;
      s.position.set(Math.cos(ang) * r, 60 + Math.random() * 60, Math.sin(ang) * r);
      const sc = 60 + Math.random() * 80;
      s.scale.set(sc, sc * 0.55, 1);
      this.root.add(s);
      this._clouds.push({ s, speed: 0.6 + Math.random() * 1.2 });
    }
  }

  _cloudTexture() {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const ctx = c.getContext('2d');
    for (let i = 0; i < 18; i++) {
      const x = 24 + Math.random() * 80, y = 40 + Math.random() * 48, r = 14 + Math.random() * 26;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(255,255,255,0.5)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
    }
    return new THREE.CanvasTexture(c);
  }

  // ---------- Lights ----------
  _buildLights() {
    const scene = this.scene;
    const hemi = new THREE.HemisphereLight(0xfff3c8, 0x3a5520, 0.8);  // warm sky + brighter green bounce
    this.root.add(hemi);
    this._hemi = hemi;
    const sun = new THREE.DirectionalLight(0xffe39a, 2.2);
    sun.position.set(-40, 34, -90);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);   // 1/4 the shadow texels of 2048 — big GPU saving
    const d = 70;                          // tighter shadow frustum = sharper + cheaper
    sun.shadow.camera.left = -d; sun.shadow.camera.right = d;
    sun.shadow.camera.top = d; sun.shadow.camera.bottom = -d;
    sun.shadow.camera.near = 1; sun.shadow.camera.far = 260;
    sun.shadow.bias = -0.0004;
    this.root.add(sun);
    this._sunLight = sun;
    const fill = new THREE.DirectionalLight(0xbce04a, 0.4);
    fill.position.set(40, 20, 40);
    this.root.add(fill);

    // day/night + weather state
    this.dayNightEnabled = true;
    this.weatherEnabled = true;
    this.phase = 0.03;          // 0..1 (starts at golden morning)
    this.dayLen = 160;          // seconds per full cycle
    this.weather = 'clear';
    this._weatherTimer = 14 + Math.random() * 14;
    this._rainAmt = 0;
    this._elev = 0.2;
    this._buildRain();
    this._applyTimeOfDay(this._sunElevation(this.phase));
  }

  // ---------- Rain ----------
  _buildRain() {
    const N = 1400;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(N * 3);
    this._rainArea = { w: 70, h: 45, d: 70 };
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (Math.random() - 0.5) * this._rainArea.w;
      pos[i * 3 + 1] = Math.random() * this._rainArea.h;
      pos[i * 3 + 2] = (Math.random() - 0.5) * this._rainArea.d;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ color: 0xaebfcf, size: 0.18, transparent: true, opacity: 0, depthWrite: false, fog: true });
    this._rain = new THREE.Points(geo, mat);
    this._rain.frustumCulled = false;
    this._rain.visible = false;
    this.root.add(this._rain);
  }

  _sunElevation(phase) { return Math.sin(phase * Math.PI * 2); }

  // e in [-1,1]: 1 = noon, 0 = dawn/dusk (golden), -1 = deep night
  _applyTimeOfDay(e) {
    this._elev = e;
    const lerp = (a, b, t) => a + (b - a) * t;
    const C = (hex) => new THREE.Color(hex);

    // keyframe palettes — tuned for a bright, hazy, warm-morning forest look:
    // pale warm haze on the horizon, luminous fill light, soft bright shadows.
    const goldT = { top: C(0x6f8db0), mid: C(0xd9c293), bot: C(0xf2dcad), fog: C(0xdccaa2), light: C(0xffe9bb), li: 2.15, hemi: 1.2 };
    const dayK = { top: C(0x6fa6dd), mid: C(0xd2e7f4), bot: C(0xeff7ff), fog: C(0xdde8ec), light: C(0xfff5e6), li: 2.5, hemi: 1.25 };
    // Night keeps a bright blue moonlight floor so you can still see & fight.
    const nightK = { top: C(0x16264f), mid: C(0x33507f), bot: C(0x5a7aa8), fog: C(0x33486f), light: C(0xbcd4ff), li: 1.85, hemi: 1.05 };

    let k;
    if (e >= 0) { const t = e * e; k = this._blendK(goldT, dayK, t); }
    else { const t = (-e) * (-e); k = this._blendK(goldT, nightK, t); }

    this._skyU.top.value.copy(k.top);
    this._skyU.mid.value.copy(k.mid);
    this._skyU.bot.value.copy(k.bot);
    this._fog.color.copy(k.fog);
    // weather darkens & pulls fog in
    const rain = this._rainAmt;
    if (rain > 0) {
      this._fog.color.lerp(C(0x6c7682), rain * 0.6);
      this._fog.far = lerp(this._fogFar, this._fogFar * 0.5, rain);
      this._skyU.top.value.lerp(C(0x5a6470), rain * 0.5);
      this._skyU.mid.value.lerp(C(0x6c7682), rain * 0.5);
    } else {
      this._fog.far = this._fogFar;
    }

    this._sunLight.color.copy(k.light);
    this._sunLight.intensity = k.li * (1 - rain * 0.4);
    this._hemi.intensity = k.hemi * (1 - rain * 0.3);

    // position the light & celestial bodies along the arc
    const az = -0.9; // azimuth bias
    const horiz = Math.cos(this.phase * Math.PI * 2);
    const sx = Math.cos(az) * horiz * 80;
    const sy = e * 70 + 6;
    const sz = -90 + Math.sin(az) * 30;
    this._sunLight.position.set(sx, Math.max(8, sy + 28), sz);

    const place = (m, sign) => { m.position.set(sign * sx * 3, sign * (e * 70) + 30, -260); m.lookAt(0, 10, 0); };
    place(this._sunDisc, 1);
    place(this._sunGlow, 1);
    this._sunGlow.position.z = -259;
    place(this._moon, -1);
    const dayVis = Math.max(0, Math.min(1, e + 0.25));
    this._sunDisc.material.opacity = dayVis;
    this._sunDisc.visible = dayVis > 0.02;
    this._sunGlow.material.opacity = 0.4 * dayVis;
    this._sunGlow.visible = dayVis > 0.02;
    const nightVis = Math.max(0, Math.min(1, -e + 0.05));
    this._moon.material.opacity = nightVis;
    this._moon.visible = nightVis > 0.02;
  }

  _blendK(a, b, t) {
    const C = () => new THREE.Color();
    return {
      top: C().copy(a.top).lerp(b.top, t),
      mid: C().copy(a.mid).lerp(b.mid, t),
      bot: C().copy(a.bot).lerp(b.bot, t),
      fog: C().copy(a.fog).lerp(b.fog, t),
      light: C().copy(a.light).lerp(b.light, t),
      li: a.li + (b.li - a.li) * t,
      hemi: a.hemi + (b.hemi - a.hemi) * t,
    };
  }

  setDayNight(on) {
    this.dayNightEnabled = on;
    if (!on) { this.phase = 0.03; this._applyTimeOfDay(this._sunElevation(this.phase)); }
  }

  setWeatherEnabled(on) {
    this.weatherEnabled = on;
    if (!on) { this.weather = 'clear'; }
  }

  // 1.0 in daylight, up to ~1.25 deep at night (enemies tougher)
  nightFactor() { return 1 + Math.max(0, -this._elev) * 0.25; }

  _updateWeather(dt) {
    this._weatherTimer -= dt;
    if (this._weatherTimer <= 0) {
      if (this.weatherEnabled && this.weather === 'clear' && Math.random() < 0.4) {
        this.weather = 'rain'; this._weatherTimer = 18 + Math.random() * 20;
      } else {
        this.weather = 'clear'; this._weatherTimer = 16 + Math.random() * 22;
      }
    }
    const target = this.weather === 'rain' ? 1 : 0;
    this._rainAmt += (target - this._rainAmt) * Math.min(1, dt * 0.7);
    const m = this._rain.material;
    m.opacity = this._rainAmt * 0.55;
    this._rain.visible = this._rainAmt > 0.02;
  }

  _updateRainParticles(dt, camera) {
    if (!this._rain.visible || !camera) return;
    const pos = this._rain.geometry.attributes.position;
    const a = pos.array;
    const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z;
    const A = this._rainArea;
    for (let i = 0; i < a.length; i += 3) {
      a[i + 1] -= 38 * dt;
      a[i] += 4 * dt; // slight slant
      if (a[i + 1] < cy - 6) {
        a[i] = cx + (Math.random() - 0.5) * A.w;
        a[i + 1] = cy + A.h * 0.6;
        a[i + 2] = cz + (Math.random() - 0.5) * A.d;
      }
    }
    pos.needsUpdate = true;
  }

  // ---------- Terrain ----------
  // shared height field so the tactical map matches the real terrain
  heightAt(x, z) {
    const m = this.map, f = m.freq, amp = m.amp, seed = this._seed;
    const dist = Math.sqrt(x * x + z * z);
    // organic fractal terrain (-amp..amp)
    let h = (fbm(x * f, z * f, seed) - 0.5) * 2 * amp;
    if (m.ridge > 0) {
      // ridged noise for highlands & mountains -> sharp ridgelines and valleys
      const rn = 1 - Math.abs((fbm(x * f * 1.3 + 19, z * f * 1.3 - 7, seed + 7) - 0.5) * 2);
      h = h * (1 - m.ridge) + rn * rn * amp * 1.9 * m.ridge;
    }
    h += m.lift;
    h *= Math.min(1, dist / 42);
    for (const lk of this.lakes) {
      const d = Math.hypot(x - lk.x, z - lk.z);
      if (d < lk.r * 1.25) {
        const t = 1 - Math.min(1, d / (lk.r * 1.25));
        const bowl = t * t * (3 - 2 * t);
        h = h * (1 - bowl) + (-2.6) * bowl;
      }
    }
    return h;
  }

  _buildTerrain() {
    const size = 360, seg = 90;
    const geo = new THREE.PlaneGeometry(size, size, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      pos.setY(i, this.heightAt(pos.getX(i), pos.getZ(i)));
    }
    geo.computeVertexNormals();
    const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: this.map.ground, roughness: 1, flatShading: true }));
    ground.receiveShadow = true;
    this.root.add(ground);

    const path = new THREE.Mesh(
      new THREE.PlaneGeometry(8, 320),
      new THREE.MeshStandardMaterial({ color: 0x8a6a32, roughness: 1, flatShading: true })
    );
    path.rotation.x = -Math.PI / 2; path.position.y = 0.05;
    path.receiveShadow = true;
    this.root.add(path);
  }

  // ---------- Distant mountains (layered ranges + snow caps) ----------
  _buildMountains() {
    const ring = new THREE.Group();
    // three depth layers: nearer & darker -> farther & hazier
    const layers = [
      { r: 175, count: 26, baseR: 36, h: [34, 70], color: 0x35491f, snow: false },
      { r: 235, count: 30, baseR: 46, h: [55, 105], color: 0x2a3a22, snow: true },
      { r: 300, count: 32, baseR: 58, h: [80, 150], color: 0x33405a, snow: true },
    ];
    const snowMat = new THREE.MeshStandardMaterial({ color: 0xeaf2ff, roughness: 1, flatShading: true });
    for (const L of layers) {
      const mat = new THREE.MeshStandardMaterial({ color: L.color, roughness: 1, flatShading: true });
      for (let i = 0; i < L.count; i++) {
        const ang = (i / L.count) * Math.PI * 2 + Math.random() * 0.1;
        const r = L.r + Math.random() * 40;
        const h = L.h[0] + Math.random() * (L.h[1] - L.h[0]);
        const baseR = L.baseR + Math.random() * 24;
        const peak = new THREE.Mesh(new THREE.ConeGeometry(baseR, h, 5 + (Math.random() * 3 | 0)), mat);
        peak.position.set(Math.cos(ang) * r, h / 2 - 8, Math.sin(ang) * r);
        peak.rotation.y = Math.random() * Math.PI;
        ring.add(peak);
        if (L.snow && h > 70) {
          const capH = h * 0.28;
          const cap = new THREE.Mesh(new THREE.ConeGeometry(baseR * (capH / h) * 1.05, capH, 5), snowMat);
          cap.position.set(peak.position.x, h - 8 - capH / 2, peak.position.z);
          cap.rotation.y = peak.rotation.y;
          ring.add(cap);
        }
      }
    }
    this.root.add(ring);
  }

  // ---------- Water (procedural animated lakes) ----------
  _buildWater() {
    const sun = new THREE.Vector3(-40, 34, -90).normalize();
    for (const lk of this.lakes) {
      const mat = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false,
        uniforms: {
          uTime: { value: 0 },
          uSun: { value: sun },
          uCam: { value: new THREE.Vector3() },
          uDeep: { value: new THREE.Color(0x12303f) },
          uShallow: { value: new THREE.Color(0x2f8f86) },
          uSky: { value: new THREE.Color(0xe8b85a) },
        },
        vertexShader: `
          varying vec3 vW; varying vec3 vN; uniform float uTime;
          void main(){
            vec3 p = position;
            float w = sin(position.x*0.25 + uTime*1.3)*0.10 + sin(position.z*0.33 + uTime*1.0)*0.08
                    + sin((position.x+position.z)*0.5 + uTime*1.8)*0.04;
            p.y += w;
            float dx = cos(position.x*0.25+uTime*1.3)*0.10*0.25 + cos((position.x+position.z)*0.5+uTime*1.8)*0.04*0.5;
            float dz = cos(position.z*0.33+uTime*1.0)*0.08*0.33 + cos((position.x+position.z)*0.5+uTime*1.8)*0.04*0.5;
            vN = normalize(vec3(-dx, 1.0, -dz));
            vec4 wp = modelMatrix * vec4(p,1.0);
            vW = wp.xyz;
            gl_Position = projectionMatrix * viewMatrix * wp;
          }`,
        fragmentShader: `
          varying vec3 vW; varying vec3 vN;
          uniform vec3 uSun; uniform vec3 uCam; uniform vec3 uDeep; uniform vec3 uShallow; uniform vec3 uSky;
          void main(){
            vec3 N = normalize(vN);
            vec3 V = normalize(uCam - vW);
            float fres = pow(1.0 - max(dot(N,V),0.0), 3.0);
            vec3 base = mix(uDeep, uShallow, 0.45);
            // keep the lake reading as water — cap how much sky it mirrors
            vec3 col = mix(base, uSky, clamp(fres,0.0,1.0) * 0.6);
            vec3 H = normalize(uSun + V);
            float spec = pow(max(dot(N,H),0.0), 140.0);
            col += vec3(1.0,0.93,0.78) * spec * 1.8;
            gl_FragColor = vec4(col, 0.86);
          }`,
      });
      const geo = new THREE.CircleGeometry(lk.r * 1.12, 48);
      geo.rotateX(-Math.PI / 2);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(lk.x, -0.15, lk.z);
      this.root.add(mesh);
      this._waterMats.push(mat);

      // reedy ring around the lake
      const reedMat = new THREE.MeshStandardMaterial({ color: 0x5f7a26, roughness: 1, flatShading: true });
      for (let i = 0; i < 26; i++) {
        const a = Math.random() * Math.PI * 2;
        const rr = lk.r * (1.05 + Math.random() * 0.12);
        const reed = new THREE.Mesh(new THREE.ConeGeometry(0.12, 1.6 + Math.random(), 4), reedMat);
        reed.position.set(lk.x + Math.cos(a) * rr, 0.4, lk.z + Math.sin(a) * rr);
        this.root.add(reed);
      }
    }
  }

  // true if (x,z) is over open water (used for wading)
  waterAt(x, z) {
    for (const lk of this.lakes) {
      if (Math.hypot(x - lk.x, z - lk.z) < lk.r) return true;
    }
    return false;
  }

  // ---------- Trees ----------
  // Conifer: root flare + tapered bark trunk + irregular needle tiers that
  // lighten toward the crown — reads far more like a real pine than a stack.
  _makeTree() {
    const g = new THREE.Group();
    const trunkH = 1.8 + Math.random() * 1.6;
    const barkMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(0.07 + Math.random() * 0.03, 0.45, 0.17 + Math.random() * 0.06),
      roughness: 1, flatShading: true,
    });
    const flare = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.5, 0.5, 6), barkMat);
    flare.position.y = 0.24; flare.castShadow = true; g.add(flare);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.26, trunkH, 6), barkMat);
    trunk.position.y = trunkH / 2; trunk.castShadow = true; g.add(trunk);

    const tiers = 3 + Math.floor(Math.random() * 2);
    const hue = 0.27 + Math.random() * 0.05;
    let y = trunkH * 0.6, r = 1.5 + Math.random() * 0.7;
    for (let t = 0; t < tiers; t++) {
      const ch = 1.45 - t * 0.12;
      const light = 0.15 + t * 0.035 + Math.random() * 0.04; // crown catches more sun
      const cone = new THREE.Mesh(new THREE.ConeGeometry(r, ch, 7),
        new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(hue, 0.55, light), roughness: 1, flatShading: true }));
      cone.position.set((Math.random() - 0.5) * 0.18, y + ch / 2 - 0.3, (Math.random() - 0.5) * 0.18);
      cone.rotation.y = Math.random() * Math.PI;
      cone.castShadow = true; g.add(cone);
      y += ch * 0.6; r *= 0.74;
    }
    return g;
  }

  // Broadleaf: forked trunk under a cluster of overlapping leaf blobs.
  _makeBroadleaf() {
    const g = new THREE.Group();
    const trunkH = 2.2 + Math.random() * 1.4;
    const barkMat = new THREE.MeshStandardMaterial({ color: 0x5b4126, roughness: 1, flatShading: true });
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.3, trunkH, 6), barkMat);
    trunk.position.y = trunkH / 2; trunk.castShadow = true; g.add(trunk);
    for (let i = 0; i < 2; i++) {
      const a = Math.random() * Math.PI * 2;
      const br = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.12, 1.0, 5), barkMat);
      br.position.set(Math.cos(a) * 0.3, trunkH * 0.8, Math.sin(a) * 0.3);
      br.rotation.z = (0.3 + Math.random() * 0.5) * (Math.cos(a) >= 0 ? 1 : -1);
      g.add(br);
    }
    const hue = 0.25 + Math.random() * 0.07;
    const blobs = 4 + Math.floor(Math.random() * 3);
    for (let i = 0; i < blobs; i++) {
      const rr = 0.9 + Math.random() * 0.7;
      const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(rr, 0),
        new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(hue, 0.5, 0.23 + Math.random() * 0.08), roughness: 1, flatShading: true }));
      leaf.position.set((Math.random() - 0.5) * 1.6, trunkH + 0.3 + (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 1.6);
      leaf.castShadow = true; g.add(leaf);
    }
    return g;
  }

  // Low scrub bush — a couple of small leaf blobs for ground cover.
  _makeBush() {
    const g = new THREE.Group();
    const hue = 0.24 + Math.random() * 0.08;
    const n = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const rr = 0.4 + Math.random() * 0.4;
      const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(rr, 0),
        new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(hue, 0.5, 0.2 + Math.random() * 0.08), roughness: 1, flatShading: true }));
      blob.position.set((Math.random() - 0.5) * 0.7, rr * 0.7, (Math.random() - 0.5) * 0.7);
      blob.castShadow = true; g.add(blob);
    }
    return g;
  }

  // a mossy fallen log lying on the forest floor (cheap cover detail)
  _makeLog() {
    const g = new THREE.Group();
    const len = 2.6 + Math.random() * 3.2, r = 0.26 + Math.random() * 0.2;
    const bark = new THREE.MeshStandardMaterial({ color: Math.random() > 0.5 ? 0x5c3d24 : 0x4a3320, roughness: 1, flatShading: true });
    const log = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.12, len, 7), bark);
    log.rotation.z = Math.PI / 2; log.position.y = r; log.castShadow = true; log.receiveShadow = true; g.add(log);
    // moss patch along the top
    const moss = new THREE.Mesh(new THREE.BoxGeometry(len * 0.78, 0.1, r * 1.5), new THREE.MeshStandardMaterial({ color: 0x4f7236, roughness: 1, flatShading: true }));
    moss.position.y = r + r * 0.55; g.add(moss);
    // a couple of broken branch stubs
    for (let i = 0; i < 2; i++) {
      const br = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.6 + Math.random() * 0.5, 5), bark);
      br.position.set((Math.random() - 0.5) * len * 0.7, r + 0.2, 0); br.rotation.set(Math.random(), 0, Math.random() * 0.8 - 0.4); g.add(br);
    }
    return g;
  }

  _plantForest() {
    // mix of conifers and broadleaf trees, weighted by biome
    const broadleafChance = { plains: 0.4, lowlands: 0.5, highlands: 0.15, mountains: 0.08 }[this.mapId] ?? 0.3;
    for (let i = 0; i < this.map.treeDensity; i++) {
      const ang = Math.random() * Math.PI * 2;
      const dist = 12 + Math.random() * 130;
      const x = Math.cos(ang) * dist, z = Math.sin(ang) * dist;
      if (Math.abs(x) < 5 && Math.abs(z) < 100) continue;
      if (this.waterAt(x, z)) continue;
      const broad = Math.random() < broadleafChance;
      const tree = broad ? this._makeBroadleaf() : this._makeTree();
      const s = (broad ? 0.7 : 0.8) + Math.random() * 0.9;
      tree.scale.setScalar(s);
      tree.position.set(x, 0, z);
      tree.rotation.y = Math.random() * Math.PI;
      this.root.add(tree);
      if (dist < this.bounds + 10) this.colliders.push({ x, z, r: 0.6 * s });
    }
    // scatter low bushes for ground cover (no collision — you can push through)
    const bushes = Math.round(this.map.treeDensity * 0.9);
    for (let i = 0; i < bushes; i++) {
      const ang = Math.random() * Math.PI * 2;
      const dist = 10 + Math.random() * 135;
      const x = Math.cos(ang) * dist, z = Math.sin(ang) * dist;
      if (Math.abs(x) < 4 && Math.abs(z) < 100) continue;
      if (this.waterAt(x, z)) continue;
      const bush = this._makeBush();
      bush.scale.setScalar(0.7 + Math.random() * 0.9);
      bush.position.set(x, 0, z);
      this.root.add(bush);
    }
    // mossy fallen logs strewn about (wild, overgrown feel)
    const logs = 14;
    for (let i = 0; i < logs; i++) {
      const ang = Math.random() * Math.PI * 2, dist = 14 + Math.random() * 120;
      const x = Math.cos(ang) * dist, z = Math.sin(ang) * dist;
      if ((Math.abs(x) < 5 && Math.abs(z) < 100) || this.waterAt(x, z)) continue;
      const log = this._makeLog();
      log.position.set(x, Math.max(0, this.heightAt(x, z)), z);
      log.rotation.y = Math.random() * Math.PI;
      this.root.add(log);
    }
  }

  // ---------- Ruined town ----------
  _buildTown() {
    // a cluster of buildings off to the sides + scattered cover
    this._building(-26, -34, 10, 7, 9, 0x6b6357);
    this._building(-40, -20, 8, 9, 7, 0x5a5246, Math.PI / 8);
    this._building(28, -40, 12, 6, 8, 0x70685a);
    this._building(34, -16, 7, 10, 7, 0x615a4d, -Math.PI / 10);
    this._building(-18, -64, 9, 8, 10, 0x6b6357, Math.PI / 12);
    this._building(22, -70, 11, 7, 9, 0x5a5246);

    this._watchtower(-8, -88);
    this._watchtower(14, -52);

    // tactical-map points of interest (Ghost-Recon style markers)
    this.pois = [
      { x: 0, z: 18, kind: 'mission', label: 'MISSION START' },
      { x: -33, z: -27, kind: 'objective', label: 'COMPOUND' },
      { x: 28, z: -55, kind: 'objective', label: 'OUTPOST' },
      { x: -8, z: -88, kind: 'alert', label: 'WATCHTOWER' },
      { x: 14, z: -52, kind: 'alert', label: 'WATCHTOWER' },
    ];
    if (this.lakes[0]) this.pois.push({ x: this.lakes[0].x, z: this.lakes[0].z, kind: 'poi', label: 'WATER' });

    // sandbag walls flanking the path (cover)
    this._sandbagWall(-7, -24, 0);
    this._sandbagWall(7, -44, 0);
    this._sandbagWall(-6, -60, Math.PI / 10);

    // crate stacks + barrels as destructible/blocking cover
    this._crateStack(-12, -18);
    this._crateStack(11, -30);
    this._crateStack(-15, -48);
    this._crateStack(18, -58);

    this._barrel(-9, -20); this._barrel(9, -28); this._barrel(13, -32);
    this._barrel(-14, -46); this._barrel(16, -56); this._barrel(-5, -78);

    // perimeter fence posts here and there
    for (let i = 0; i < 18; i++) {
      const ang = Math.random() * Math.PI * 2, r = 40 + Math.random() * 70;
      const fx = Math.cos(ang) * r, fz = Math.sin(ang) * r;
      if (!this.waterAt(fx, fz)) this._fencePost(fx, fz);
    }
  }

  // A procedural medieval hamlet clustered around a dry anchor point. Grounds
  // to terrain, registers solid colliders, and exposes its centre as
  // this.villageAnchor so the medieval landmark can be dropped in its midst.
  _buildVillage() {
    const cands = [[-66, -70], [70, -66], [-78, 44], [62, 60], [-58, 78]];
    let anchor = null;
    for (const [x, z] of cands) {
      if (this.waterAt(x, z) || this.waterAt(x + 12, z) || this.waterAt(x, z + 12)) continue;
      anchor = { x, z }; break;
    }
    if (!anchor) anchor = { x: cands[0][0], z: cands[0][1] };
    this.villageAnchor = anchor;
    const { group, colliders } = plantVillage(this, anchor.x, anchor.z, this._seed * 3 + 17);
    this.root.add(group);
    for (const c of colliders) if (Math.hypot(c.x, c.z) < this.bounds) this.colliders.push(c);
  }

  // hollow, enterable building: 4 walls (doorway gap on the +z side), floor, roof
  _building(x, z, w, h, d, color, rot = 0) {
    const g = new THREE.Group();
    const wallMat = new THREE.MeshStandardMaterial({ color, roughness: 1, flatShading: true });
    const t = 0.4, door = 2.6;

    const floor = new THREE.Mesh(new THREE.BoxGeometry(w, 0.2, d), new THREE.MeshStandardMaterial({ color: 0x2a2620, roughness: 1, flatShading: true }));
    floor.position.y = 0.1; floor.receiveShadow = true; g.add(floor);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(w * 1.06, 0.5, d * 1.06), new THREE.MeshStandardMaterial({ color: 0x3a352c, roughness: 1, flatShading: true }));
    roof.position.y = h + 0.2; roof.castShadow = true; g.add(roof);

    const mkWall = (gw, gd, px, pz) => { const m = new THREE.Mesh(new THREE.BoxGeometry(gw, h, gd), wallMat); m.position.set(px, h / 2, pz); m.castShadow = true; m.receiveShadow = true; g.add(m); };
    mkWall(w, t, 0, -d / 2);          // back
    mkWall(t, d, -w / 2, 0);          // left
    mkWall(t, d, w / 2, 0);           // right
    const seg = (w - door) / 2;       // front split around the doorway
    mkWall(seg, t, -(door / 2 + seg / 2), d / 2);
    mkWall(seg, t, (door / 2 + seg / 2), d / 2);
    // lintel above the doorway
    const lintH = Math.max(0.6, h - 2.6);
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(door, lintH, t), wallMat);
    lintel.position.set(0, h - lintH / 2, d / 2); g.add(lintel);

    // glowing windows on the back & side walls
    const winMat = new THREE.MeshStandardMaterial({ color: 0x120c06, emissive: 0xffb14a, emissiveIntensity: 0.6, roughness: 0.6 });
    const cols = Math.max(1, Math.floor(w / 3));
    for (let c = 0; c < cols; c++) {
      if (Math.random() < 0.3) continue;
      const wx = -w / 2 + 1.6 + c * (w - 3.2) / Math.max(1, cols - 1);
      const win = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.2, 0.12), winMat.clone());
      win.material.emissiveIntensity = 0.3 + Math.random() * 0.6;
      win.position.set(wx, 1.7, -d / 2); g.add(win);
    }

    g.position.set(x, 0, z); g.rotation.y = rot;
    this.root.add(g);

    // wall colliders (skip the doorway) — local->world rotated by rot
    const cs = Math.cos(rot), sn = Math.sin(rot);
    const place = (lx, lz) => this.colliders.push({ x: x + lx * cs + lz * sn, z: z - lx * sn + lz * cs, r: 0.7 });
    for (let i = -w / 2; i <= w / 2 + 0.01; i += 1.3) { place(i, -d / 2); if (Math.abs(i) > door / 2) place(i, d / 2); }
    for (let j = -d / 2 + 1.3; j <= d / 2 - 1.3; j += 1.3) { place(-w / 2, j); place(w / 2, j); }
  }

  _watchtower(x, z) {
    const g = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: 0x4a3a22, roughness: 1, flatShading: true });
    const legH = 8;
    [[-1.4, -1.4], [1.4, -1.4], [-1.4, 1.4], [1.4, 1.4]].forEach(([lx, lz]) => {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.4, legH, 0.4), wood);
      leg.position.set(lx, legH / 2, lz); leg.castShadow = true; g.add(leg);
    });
    const platform = new THREE.Mesh(new THREE.BoxGeometry(4, 0.4, 4), wood);
    platform.position.y = legH; platform.castShadow = true; g.add(platform);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(4, 1.2, 0.2), wood);
    rail.position.set(0, legH + 0.8, 2); g.add(rail);
    const rail2 = rail.clone(); rail2.position.z = -2; g.add(rail2);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(3.4, 2, 4), new THREE.MeshStandardMaterial({ color: 0x3a352c, roughness: 1, flatShading: true }));
    roof.position.y = legH + 2.2; roof.rotation.y = Math.PI / 4; roof.castShadow = true; g.add(roof);
    g.position.set(x, 0, z);
    this.root.add(g);
    this.colliders.push({ x, z, r: 2.2 });
  }

  _sandbagWall(x, z, rot) {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x7a6f4a, roughness: 1, flatShading: true });
    for (let row = 0; row < 2; row++) {
      const n = 5 - row;
      for (let i = 0; i < n; i++) {
        const bag = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.45, 0.6), mat);
        bag.position.set((i - (n - 1) / 2) * 0.85 + (row ? 0.4 : 0), 0.25 + row * 0.45, 0);
        bag.castShadow = true; bag.receiveShadow = true; g.add(bag);
      }
    }
    g.position.set(x, 0, z); g.rotation.y = rot;
    this.root.add(g);
    this.colliders.push({ x, z, r: 2.0 });
  }

  _crateStack(x, z) {
    const g = new THREE.Group();
    const layout = [[0, 0, 0], [1.05, 0, 0], [0.5, 1.05, 0.2], [0, 0, 1.05]];
    const collider = { x, z, r: 1.4 };
    const entry = { group: g, x, z, collider, crates: new Set() };
    layout.forEach(([cx, cy, cz]) => {
      const s = 0.9 + Math.random() * 0.2;
      // per-crate material so a hit/break can tint just that crate
      const mat = new THREE.MeshStandardMaterial({ color: 0x8a6a3a, roughness: 1, flatShading: true });
      const crate = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), mat);
      crate.position.set(cx, cy + s / 2, cz);
      crate.rotation.y = Math.random() * 0.3;
      crate.castShadow = true; crate.receiveShadow = true; g.add(crate);
      crate.userData.dx = { hp: 5, maxHp: 5, stack: entry, size: s };
      entry.crates.add(crate); this._crateMeshes.push(crate);
    });
    g.position.set(x, 0, z);
    this.root.add(g);
    this.colliders.push(collider);
    this.destructibles.push(entry);
  }

  // raycast the player's bullets against crate meshes (nearest hit), or null
  raycastDestructibles(raycaster, origin, dir, far) {
    if (!this._crateMeshes.length) return null;
    raycaster.set(origin, dir); raycaster.far = far;
    const hits = raycaster.intersectObjects(this._crateMeshes, false);
    if (hits.length) return { mesh: hits[0].object, point: hits[0].point, distance: hits[0].distance };
    return null;
  }

  // damage a crate; returns { broken, x, y, z } when it shatters (else null)
  damageCrate(mesh, dmg) {
    const d = mesh.userData.dx; if (!d) return null;
    d.hp -= dmg;
    mesh.material.emissive = mesh.material.emissive || new THREE.Color();
    mesh.material.color.offsetHSL(0, 0, -0.04 * dmg / d.maxHp); // darken as it takes damage
    if (d.hp > 0) return null;
    return this._breakCrate(mesh);
  }

  _breakCrate(mesh) {
    const d = mesh.userData.dx, st = d.stack;
    const wp = new THREE.Vector3(); mesh.getWorldPosition(wp);
    if (mesh.parent) mesh.parent.remove(mesh);
    if (mesh.geometry) mesh.geometry.dispose();
    if (mesh.material) mesh.material.dispose();
    const i = this._crateMeshes.indexOf(mesh); if (i >= 0) this._crateMeshes.splice(i, 1);
    st.crates.delete(mesh);
    // once the whole stack is gone, drop its collider so you can walk/run through
    if (st.crates.size === 0) {
      const ci = this.colliders.indexOf(st.collider); if (ci >= 0) this.colliders.splice(ci, 1);
    }
    return { broken: true, x: wp.x, y: wp.y, z: wp.z };
  }

  // blast damage to crates within radius of a point (chained from explosions)
  damageCratesInRadius(x, z, r, dmg) {
    const out = [];
    const r2 = r * r;
    for (const m of this._crateMeshes.slice()) {
      const wp = new THREE.Vector3(); m.getWorldPosition(wp);
      const dx = wp.x - x, dz = wp.z - z;
      if (dx * dx + dz * dz <= r2) { const br = this.damageCrate(m, dmg); if (br) out.push(br); }
    }
    return out;
  }

  _barrel(x, z) {
    const g = new THREE.Group();
    const explosive = Math.random() < 0.6;
    const mat = new THREE.MeshStandardMaterial({ color: explosive ? 0xb33020 : 0x55603a, roughness: 0.7, metalness: 0.3, flatShading: true });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1.4, 10), mat);
    body.position.y = 0.7; body.castShadow = true; g.add(body);
    if (explosive) {
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.52, 0.18, 10), new THREE.MeshStandardMaterial({ color: 0xffcf4a, emissive: 0x6b4f0d, emissiveIntensity: 0.4 }));
      band.position.y = 0.7; g.add(band);
    }
    g.position.set(x, 0, z);
    this.root.add(g);
    this.colliders.push({ x, z, r: 0.6 });
    if (explosive) this.barrels.push({ group: g, x, z, hp: 3, dead: false });
  }

  _fencePost(x, z) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.6, 0.18), new THREE.MeshStandardMaterial({ color: 0x4a3a22, roughness: 1, flatShading: true }));
    post.position.set(x, 0.8, z); post.castShadow = true;
    this.root.add(post);
  }

  _rock(x, z, r, mat, mossMat) {
    if (this.waterAt(x, z)) return;
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), mat);
    // squash + jitter verts a touch for a less uniform look
    rock.scale.set(1, 0.7 + Math.random() * 0.5, 1);
    rock.position.set(x, r * 0.35, z);
    rock.rotation.set(Math.random(), Math.random(), Math.random());
    rock.castShadow = true; rock.receiveShadow = true;
    this.root.add(rock);
    // mossy cap on bigger boulders
    if (r > 0.9 && mossMat) {
      const moss = new THREE.Mesh(new THREE.DodecahedronGeometry(r * 0.92, 0), mossMat);
      moss.scale.set(1, 0.35, 1);
      moss.position.set(x, r * 0.6, z);
      moss.rotation.copy(rock.rotation);
      this.root.add(moss);
    }
    if (Math.hypot(x, z) < this.bounds) this.colliders.push({ x, z, r: r * 0.7 });
  }

  _scatterRocks() {
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x6b6f5a, roughness: 1, flatShading: true });
    const darkRock = new THREE.MeshStandardMaterial({ color: 0x52564a, roughness: 1, flatShading: true });
    const mossMat = new THREE.MeshStandardMaterial({ color: 0x4f7d1e, roughness: 1, flatShading: true });

    // scattered singles
    for (let i = 0; i < this.map.rockDensity; i++) {
      const ang = Math.random() * Math.PI * 2, dist = 8 + Math.random() * 118;
      this._rock(Math.cos(ang) * dist, Math.sin(ang) * dist, 0.4 + Math.random() * 1.0,
        Math.random() < 0.5 ? rockMat : darkRock, mossMat);
    }
    // boulder clusters (cover)
    for (let c = 0; c < 9; c++) {
      const ang = Math.random() * Math.PI * 2, dist = 20 + Math.random() * 95;
      const cx = Math.cos(ang) * dist, cz = Math.sin(ang) * dist;
      const n = 3 + (Math.random() * 4 | 0);
      for (let k = 0; k < n; k++) {
        this._rock(cx + (Math.random() - 0.5) * 5, cz + (Math.random() - 0.5) * 5,
          0.7 + Math.random() * 1.7, Math.random() < 0.5 ? rockMat : darkRock, mossMat);
      }
    }
  }

  _scatterGrass() {
    const bladeMat = new THREE.MeshStandardMaterial({ color: 0x8cba36, roughness: 1, flatShading: true, side: THREE.DoubleSide });
    // real-time wind: sway each blade's top by world position + time
    bladeMat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = this._windTime = (this._windTime || { value: 0 });
      sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         vec4 wpos = instanceMatrix * vec4(0.0,0.0,0.0,1.0);
         float sway = sin(uTime*1.6 + wpos.x*0.25 + wpos.z*0.2) * 0.18 + sin(uTime*2.7 + wpos.z*0.4)*0.07;
         transformed.x += sway * max(0.0, position.y);`
      );
    };
    const blade = new THREE.ConeGeometry(0.2, 1.5, 3);   // taller, lusher blades
    blade.translate(0, 0.75, 0); // pivot at base so the top sways
    const mesh = new THREE.InstancedMesh(blade, bladeMat, this.map.grass);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < this.map.grass; i++) {
      const ang = Math.random() * Math.PI * 2, dist = 4 + Math.random() * 90;
      const gx = Math.cos(ang) * dist, gz = Math.sin(ang) * dist;
      dummy.position.set(gx, 0, gz);
      dummy.rotation.y = Math.random() * Math.PI;
      dummy.scale.set(0.8 + Math.random() * 0.6, this.waterAt(gx, gz) ? 0 : 0.75 + Math.random() * 1.25, 0.8 + Math.random() * 0.6);
      dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.frustumCulled = false;
    this.root.add(mesh);
  }

  // explosive barrel hit -> returns {x,z} blast center if it explodes
  hitBarrel(point) {
    for (const b of this.barrels) {
      if (b.dead) continue;
      const dx = point.x - b.x, dz = point.z - b.z;
      if (Math.hypot(dx, dz) < 1.0) {
        b.hp -= 1;
        if (b.hp <= 0) {
          b.dead = true;
          this.root.remove(b.group);
          // remove its collider
          this.colliders = this.colliders.filter((c) => !(Math.abs(c.x - b.x) < 0.01 && Math.abs(c.z - b.z) < 0.01));
          return { x: b.x, z: b.z, radius: 7 };
        }
      }
    }
    return null;
  }

  // detonate all explosive barrels within radius (one chain hop); returns blast centers
  chainBarrels(x, z, radius) {
    const res = [];
    for (const b of this.barrels) {
      if (b.dead) continue;
      if (Math.hypot(b.x - x, b.z - z) < radius) {
        b.dead = true;
        this.root.remove(b.group);
        this.colliders = this.colliders.filter((c) => !(Math.abs(c.x - b.x) < 0.01 && Math.abs(c.z - b.z) < 0.01));
        res.push({ x: b.x, z: b.z, radius: 7 });
      }
    }
    return res;
  }

  // Lightweight steering: returns a perpendicular nudge away from obstacles
  // that lie ahead, so enemies arc around buildings instead of grinding them.
  steerAround(x, z, dx, dz, radius) {
    let sx = 0, sz = 0;
    for (const c of this.colliders) {
      const ox = c.x - x, oz = c.z - z;
      const d = Math.hypot(ox, oz);
      const reach = c.r + radius + 3;
      if (d > 0.001 && d < reach) {
        const ahead = (ox * dx + oz * dz) / d; // how directly in front (cos)
        if (ahead > 0.25) {
          const px = -dz, pz = dx;               // perpendicular to travel
          const side = (ox * px + oz * pz) > 0 ? -1 : 1; // turn away from it
          const w = ((reach - d) / reach) * ahead;
          sx += px * side * w; sz += pz * side * w;
        }
      }
    }
    return { x: sx, z: sz };
  }

  resolve(x, z, radius) {
    for (const c of this.colliders) {
      const dx = x - c.x, dz = z - c.z;
      const d = Math.hypot(dx, dz);
      const min = radius + c.r;
      if (d < min && d > 0.0001) {
        const push = (min - d);
        x += (dx / d) * push; z += (dz / d) * push;
      }
    }
    const dc = Math.hypot(x, z);
    if (dc > this.bounds) { x = (x / dc) * this.bounds; z = (z / dc) * this.bounds; }
    return { x, z };
  }

  update(dt, camera) {
    this._time += dt;
    if (this._windTime) this._windTime.value = this._time;
    if (this._critters) this._critters.update(dt, camera);
    // drifting low haze — wraps around the play area
    if (this._mist) {
      const lim = this.bounds * 0.95;
      for (const m of this._mist) {
        m.sp.position.x += m.drift * dt;
        m.sp.position.y += Math.sin(this._time * m.sy + m.phase) * 0.004;
        if (m.sp.position.x > lim) m.sp.position.x = -lim;
        else if (m.sp.position.x < -lim) m.sp.position.x = lim;
      }
    }
    // enemy base: spin the core, flash on hit, collapse when destroyed
    const b = this.base;
    if (b) {
      b.core.rotation.y += dt * 0.6;
      if (b._flash > 0) { b._flash -= dt; b.core.material.emissiveIntensity = 0.85 + 4 * Math.max(0, b._flash / 0.12); }
      else if (b.alive) b.core.material.emissiveIntensity = 0.85 + Math.sin(this._time * 3) * 0.15;
      if (!b.alive && b.group.scale.y > 0.05) {
        b.group.scale.y = Math.max(0.05, b.group.scale.y - dt * 0.5);
        b.core.material.emissiveIntensity *= Math.max(0, 1 - dt * 2);
      }
    }
    for (const c of this._clouds) {
      c.s.position.x += c.speed * dt;
      if (c.s.position.x > 320) c.s.position.x = -320;
    }
    for (const m of this._waterMats) {
      m.uniforms.uTime.value = this._time;
      if (camera) m.uniforms.uCam.value.copy(camera.position);
    }
    // weather
    this._updateWeather(dt);
    this._updateRainParticles(dt, camera);
    // day/night
    if (this.dayNightEnabled) {
      this.phase = (this.phase + dt / this.dayLen) % 1;
      this._applyTimeOfDay(this._sunElevation(this.phase));
    } else if (this._rainAmt > 0.001 || this._lastRain) {
      // keep fog/sky responsive to weather even with a fixed time of day
      this._applyTimeOfDay(this._elev);
    }
    this._lastRain = this._rainAmt > 0.001;
  }
}
