import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Procedural flora — our own, in-code, no assets. Each plant is built from
// primitive geometries, baked to one vertex-coloured (non-indexed)
// BufferGeometry, then GPU-instanced so hundreds cost only a few draw calls.
// Flat-shaded + wind-swayed to match VERDANT's low-poly world.

// per-biome palette: leaf [hue,sat,light], flower hue choices, snow dusting
const BIOME = {
  plains:    { leaf: [0.26, 0.55, 0.30], flowers: [0.0, 0.08, 0.13, 0.58, 0.83], snow: 0 },
  highlands: { leaf: [0.09, 0.55, 0.34], flowers: [0.06, 0.09, 0.11, 0.0],       snow: 0 }, // autumn
  lowlands:  { leaf: [0.31, 0.55, 0.24], flowers: [0.58, 0.83, 0.5, 0.13],        snow: 0 }, // lush + blue
  mountains: { leaf: [0.33, 0.42, 0.22], flowers: [0.0, 0.58],                    snow: 0.6 },
};

function rng32(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// non-index + drop uv + bake flat vertex colour (mergeGeometries can't mix
// indexed and non-indexed, and flat shading wants per-face verts anyway)
function paint(geo, color) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  g.deleteAttribute('uv');
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  const c = new THREE.Color(color);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}
const leafHex = (rnd, pal) => new THREE.Color().setHSL(
  pal.leaf[0] + (rnd() - 0.5) * 0.05,
  pal.leaf[1],
  pal.leaf[2] + (rnd() - 0.5) * 0.08 + (rnd() < pal.snow ? 0.4 : 0)
).getHex();

const _t = new THREE.Matrix4();
const _m = new THREE.Matrix4();

function treeGeometry(seed, pal) {
  const rnd = rng32(seed);
  const parts = [];
  const bark = new THREE.Color().setHSL(0.08 + rnd() * 0.03, 0.45, 0.18 + rnd() * 0.05).getHex();
  const trunkLen = 2.6 + rnd() * 1.8, trunkRad = 0.22 + rnd() * 0.1;
  const leafBlob = (mat) => {
    let g = new THREE.IcosahedronGeometry(0.7 + rnd() * 0.6, 0); g.scale(1, 0.8, 1);
    g = paint(g, leafHex(rnd, pal)); g.applyMatrix4(mat); parts.push(g);
  };
  const branch = (mat, len, rad, depth) => {
    let g = new THREE.CylinderGeometry(rad * 0.66, rad, len, 5, 1); g.translate(0, len / 2, 0);
    g = paint(g, bark); g.applyMatrix4(mat); parts.push(g);
    const tip = mat.clone().multiply(_t.makeTranslation(0, len, 0));
    if (depth <= 0) { leafBlob(tip); return; }
    const n = 2 + (rnd() * 2 | 0);
    for (let i = 0; i < n; i++) {
      const child = mat.clone()
        .multiply(_t.makeTranslation(0, len * (0.55 + rnd() * 0.4), 0))
        .multiply(_m.makeRotationY(rnd() * Math.PI * 2))
        .multiply(_t.makeRotationX(0.35 + rnd() * 0.5));
      branch(child, len * (0.62 + rnd() * 0.16), rad * 0.66, depth - 1);
    }
    if (depth === 1) leafBlob(tip);
  };
  branch(new THREE.Matrix4(), trunkLen, trunkRad, 3);
  const merged = mergeGeometries(parts, false); parts.forEach((p) => p.dispose()); return merged;
}

function flowerGeometry(seed, pal) {
  const rnd = rng32(seed);
  const parts = [];
  const stemH = 0.5 + rnd() * 0.5;
  let stem = new THREE.CylinderGeometry(0.02, 0.03, stemH, 4); stem.translate(0, stemH / 2, 0);
  parts.push(paint(stem, new THREE.Color().setHSL(0.27, 0.5, 0.28).getHex()));
  const hue = pal.flowers[rnd() * pal.flowers.length | 0] + (rnd() - 0.5) * 0.04;
  const petalCol = new THREE.Color().setHSL(hue, 0.78, 0.6).getHex();
  let center = new THREE.IcosahedronGeometry(0.08, 0); center.translate(0, stemH, 0);
  parts.push(paint(center, new THREE.Color().setHSL(0.13, 0.85, 0.55).getHex()));
  const petals = 5 + (rnd() * 3 | 0);
  for (let i = 0; i < petals; i++) {
    let p = new THREE.BoxGeometry(0.16, 0.04, 0.07); p.translate(0.12, 0, 0);
    p.applyMatrix4(_m.makeRotationY((i / petals) * Math.PI * 2));
    p.applyMatrix4(_t.makeTranslation(0, stemH, 0));
    parts.push(paint(p, petalCol));
  }
  const merged = mergeGeometries(parts, false); parts.forEach((p) => p.dispose()); return merged;
}

function fernGeometry(seed, pal) {
  const rnd = rng32(seed);
  const parts = [];
  const col = leafHex(rnd, pal);
  const fronds = 5 + (rnd() * 4 | 0);
  for (let i = 0; i < fronds; i++) {
    const len = 0.7 + rnd() * 0.5;
    let blade = new THREE.ConeGeometry(0.09, len, 4); blade.translate(0, len / 2, 0);
    blade.applyMatrix4(_m.makeRotationZ(0.5 + rnd() * 0.3));
    blade.applyMatrix4(_t.makeRotationY((i / fronds) * Math.PI * 2 + rnd() * 0.4));
    parts.push(paint(blade, col));
  }
  const merged = mergeGeometries(parts, false); parts.forEach((p) => p.dispose()); return merged;
}

function mushroomGeometry(seed) {
  const rnd = rng32(seed);
  const parts = [];
  const h = 0.18 + rnd() * 0.25;
  let stem = new THREE.CylinderGeometry(0.04, 0.05, h, 5); stem.translate(0, h / 2, 0);
  parts.push(paint(stem, 0xe8e0cf));
  const capHue = rnd() < 0.5 ? 0.0 : 0.07; // red or brown
  let cap = new THREE.SphereGeometry(0.12 + rnd() * 0.06, 7, 5, 0, Math.PI * 2, 0, Math.PI / 2);
  cap.scale(1, 0.7, 1); cap.translate(0, h, 0);
  parts.push(paint(cap, new THREE.Color().setHSL(capHue, 0.7, 0.42).getHex()));
  const merged = mergeGeometries(parts, false); parts.forEach((p) => p.dispose()); return merged;
}

function berryBushGeometry(seed, pal) {
  const rnd = rng32(seed);
  const parts = [];
  const blobs = 2 + (rnd() * 2 | 0);
  for (let i = 0; i < blobs; i++) {
    let b = new THREE.IcosahedronGeometry(0.4 + rnd() * 0.3, 0);
    b.translate((rnd() - 0.5) * 0.6, 0.4 + rnd() * 0.3, (rnd() - 0.5) * 0.6);
    parts.push(paint(b, leafHex(rnd, pal)));
  }
  const berries = 5 + (rnd() * 5 | 0);
  for (let i = 0; i < berries; i++) {
    let br = new THREE.IcosahedronGeometry(0.06, 0);
    br.translate((rnd() - 0.5) * 0.9, 0.3 + rnd() * 0.5, (rnd() - 0.5) * 0.9);
    parts.push(paint(br, rnd() < 0.5 ? 0xcc2030 : 0x4422aa));
  }
  const merged = mergeGeometries(parts, false); parts.forEach((p) => p.dispose()); return merged;
}

function cattailGeometry(seed) {
  const rnd = rng32(seed);
  const parts = [];
  const stalks = 2 + (rnd() * 2 | 0);
  for (let s = 0; s < stalks; s++) {
    const h = 1.2 + rnd() * 0.8;
    const ox = (rnd() - 0.5) * 0.3, oz = (rnd() - 0.5) * 0.3;
    let stalk = new THREE.CylinderGeometry(0.025, 0.035, h, 4); stalk.translate(ox, h / 2, oz);
    parts.push(paint(stalk, 0x4f7d2a));
    let spike = new THREE.CylinderGeometry(0.06, 0.06, 0.32, 6); spike.translate(ox, h - 0.18, oz);
    parts.push(paint(spike, 0x5a3a1a));
    let blade = new THREE.ConeGeometry(0.05, h * 0.8, 3);
    blade.translate(0, h * 0.4, 0);
    blade.applyMatrix4(_m.makeRotationZ(0.2 + rnd() * 0.2));
    blade.applyMatrix4(_t.makeTranslation(ox, 0, oz));
    parts.push(paint(blade, 0x5b8a30));
  }
  const merged = mergeGeometries(parts, false); parts.forEach((p) => p.dispose()); return merged;
}

// material with the same wind sway as the grass (shares world._windTime)
function floraMaterial(world) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1, metalness: 0 });
  mat.onBeforeCompile = (sh) => {
    world._windTime = world._windTime || { value: 0 };
    sh.uniforms.uTime = world._windTime;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       vec4 wpos = instanceMatrix * vec4(0.0,0.0,0.0,1.0);
       float h = max(0.0, position.y);
       float sway = sin(uTime*1.3 + wpos.x*0.2 + wpos.z*0.18)*0.045 + sin(uTime*2.1 + wpos.z*0.35)*0.02;
       transformed.x += sway * h;
       transformed.z += sway * h * 0.4;`
    );
  };
  return mat;
}

function scatter(group, templates, mat, count, placeFn, castShadow) {
  const buckets = templates.map(() => []);
  for (let i = 0; i < count; i++) { const p = placeFn(); if (p) buckets[(Math.random() * templates.length) | 0].push(p); }
  const q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), m = new THREE.Matrix4();
  templates.forEach((geo, ti) => {
    const arr = buckets[ti]; if (!arr.length) return;
    const im = new THREE.InstancedMesh(geo, mat, arr.length);
    arr.forEach((p, idx) => { q.setFromAxisAngle(up, p.yaw); m.compose(p.pos, q, p.scale); im.setMatrixAt(idx, m); });
    im.instanceMatrix.needsUpdate = true; im.castShadow = castShadow; im.receiveShadow = false;
    group.add(im);
  });
}

// Build & scatter all flora for a map. Returns { group, colliders }.
export function plantFlora(world, density = 1) {
  const group = new THREE.Group();
  const mat = floraMaterial(world);
  const pal = BIOME[world.mapId] || BIOME.plains;
  const colliders = [];
  const N = (n) => Math.max(0, Math.round(n * density));
  const sc = (lo, hi) => new THREE.Vector3(1, 1, 1).multiplyScalar(lo + Math.random() * (hi - lo));

  const place = () => {
    const ang = Math.random() * Math.PI * 2, dist = 8 + Math.random() * 127;
    const x = Math.cos(ang) * dist, z = Math.sin(ang) * dist;
    if (Math.abs(x) < 5 && z > -100 && z < 40) return null; // keep the spawn lane clear
    if (world.waterAt(x, z)) return null;
    return { pos: new THREE.Vector3(x, Math.max(0, world.heightAt(x, z)), z), yaw: Math.random() * Math.PI * 2, scale: null };
  };
  const placeEdge = () => {
    for (let t = 0; t < 6; t++) {
      const ang = Math.random() * Math.PI * 2, dist = 8 + Math.random() * 120;
      const x = Math.cos(ang) * dist, z = Math.sin(ang) * dist;
      if (world.waterAt(x, z)) continue;
      if (world.waterAt(x + 1.6, z) || world.waterAt(x - 1.6, z) || world.waterAt(x, z + 1.6) || world.waterAt(x, z - 1.6))
        return { pos: new THREE.Vector3(x, Math.max(0, world.heightAt(x, z)), z), yaw: Math.random() * Math.PI * 2, scale: sc(0.9, 1.4) };
    }
    return null;
  };

  // Instanced foliage — all one draw call per template, so dense = still cheap.
  // Bumped hard for a wild, overgrown forest floor.
  scatter(group, [11, 23, 47, 88, 131].map((s) => treeGeometry(s, pal)), mat, N(130),
    () => { const p = place(); if (p) { p.scale = sc(0.8, 1.5); colliders.push({ x: p.pos.x, z: p.pos.z, r: 0.6 * p.scale.x }); } return p; }, true);
  scatter(group, [3, 9, 17, 28].map((s) => flowerGeometry(s, pal)), mat, N(360),
    () => { const p = place(); if (p) p.scale = sc(0.8, 1.6); return p; }, false);
  scatter(group, [5, 14, 30].map((s) => fernGeometry(s, pal)), mat, N(220),
    () => { const p = place(); if (p) p.scale = sc(0.7, 1.5); return p; }, false);
  scatter(group, [2, 19, 41].map(mushroomGeometry), mat, N(130),
    () => { const p = place(); if (p) p.scale = sc(0.8, 1.6); return p; }, false);
  scatter(group, [7, 33].map((s) => berryBushGeometry(s, pal)), mat, N(80),
    () => { const p = place(); if (p) { p.scale = sc(0.8, 1.3); colliders.push({ x: p.pos.x, z: p.pos.z, r: 0.5 * p.scale.x }); } return p; }, true);
  scatter(group, [13, 27].map(cattailGeometry), mat, N(90), placeEdge, false);

  group.userData.floraMat = mat;
  return { group, colliders };
}
