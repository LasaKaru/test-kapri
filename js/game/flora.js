import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Procedural flora — our own, in-code, no assets. Each plant is built from
// primitive geometries, baked to one vertex-coloured BufferGeometry, then
// GPU-instanced so hundreds of them cost only a handful of draw calls.
// Flat-shaded to match VERDANT's low-poly look.

// tiny seeded RNG (mulberry32) so a "type" looks consistent but varied
function rng32(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// Make every part non-indexed (mergeGeometries can't mix indexed + non-indexed),
// drop uv, and bake a flat 'color' attribute. Returns the prepared geometry.
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

const _m = new THREE.Matrix4();
const _t = new THREE.Matrix4();

// ---- a branching tree (recursive limbs + leaf clusters) ----
function treeGeometry(seed) {
  const rnd = rng32(seed);
  const parts = [];
  const bark = new THREE.Color().setHSL(0.08 + rnd() * 0.03, 0.45, 0.18 + rnd() * 0.05).getHex();
  const leafHue = 0.25 + rnd() * 0.08;
  const trunkLen = 2.6 + rnd() * 1.8;
  const trunkRad = 0.22 + rnd() * 0.1;

  const leafBlob = (mat) => {
    const r = 0.7 + rnd() * 0.6;
    let g = new THREE.IcosahedronGeometry(r, 0);
    g.scale(1, 0.8, 1);
    g = paint(g, new THREE.Color().setHSL(leafHue, 0.5, 0.22 + rnd() * 0.1).getHex());
    g.applyMatrix4(mat);
    parts.push(g);
  };

  const branch = (mat, len, rad, depth) => {
    let g = new THREE.CylinderGeometry(rad * 0.66, rad, len, 5, 1);
    g.translate(0, len / 2, 0); // base at the joint
    g = paint(g, bark);
    g.applyMatrix4(mat);
    parts.push(g);
    // tip transform
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
    if (depth === 1) leafBlob(tip); // a little extra fullness
  };

  branch(new THREE.Matrix4(), trunkLen, trunkRad, 3);
  const merged = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  return merged;
}

// ---- a flower (stem + center + radial petals) ----
function flowerGeometry(seed) {
  const rnd = rng32(seed);
  const parts = [];
  const stemH = 0.5 + rnd() * 0.5;
  let stem = new THREE.CylinderGeometry(0.02, 0.03, stemH, 4);
  stem.translate(0, stemH / 2, 0);
  stem = paint(stem, new THREE.Color().setHSL(0.27, 0.5, 0.28).getHex());
  parts.push(stem);
  const petalHue = [0.0, 0.08, 0.13, 0.58, 0.83][rnd() * 5 | 0] + rnd() * 0.03;
  const petalCol = new THREE.Color().setHSL(petalHue, 0.75, 0.6).getHex();
  let center = new THREE.IcosahedronGeometry(0.08, 0);
  center.translate(0, stemH, 0);
  center = paint(center, new THREE.Color().setHSL(0.13, 0.8, 0.55).getHex());
  parts.push(center);
  const petals = 5 + (rnd() * 3 | 0);
  for (let i = 0; i < petals; i++) {
    const a = (i / petals) * Math.PI * 2;
    let p = new THREE.BoxGeometry(0.16, 0.04, 0.07);
    p.translate(0.12, 0, 0);
    p.applyMatrix4(new THREE.Matrix4().makeRotationY(a));
    p.applyMatrix4(new THREE.Matrix4().makeTranslation(0, stemH, 0));
    p = paint(p, petalCol);
    parts.push(p);
  }
  const merged = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  return merged;
}

// ---- a fern / leafy tuft (fronds fanning out) ----
function fernGeometry(seed) {
  const rnd = rng32(seed);
  const parts = [];
  const col = new THREE.Color().setHSL(0.26 + rnd() * 0.05, 0.55, 0.24 + rnd() * 0.06).getHex();
  const fronds = 5 + (rnd() * 4 | 0);
  for (let i = 0; i < fronds; i++) {
    const a = (i / fronds) * Math.PI * 2 + rnd() * 0.4;
    const len = 0.7 + rnd() * 0.5;
    let blade = new THREE.ConeGeometry(0.09, len, 4);
    blade.translate(0, len / 2, 0);
    blade.applyMatrix4(new THREE.Matrix4().makeRotationZ(0.5 + rnd() * 0.3));
    blade.applyMatrix4(new THREE.Matrix4().makeRotationY(a));
    blade = paint(blade, col);
    parts.push(blade);
  }
  const merged = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  return merged;
}

const FLORA_MAT = () => new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1, metalness: 0 });

// scatter `count` instances across `templates`, placing via placeFn()->{pos,yaw,scale}|null
function scatter(root, templates, mat, count, placeFn, castShadow) {
  const buckets = templates.map(() => []);
  for (let i = 0; i < count; i++) {
    const p = placeFn();
    if (p) buckets[(Math.random() * templates.length) | 0].push(p);
  }
  const meshes = [];
  const q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), m = new THREE.Matrix4();
  templates.forEach((geo, ti) => {
    const arr = buckets[ti];
    if (!arr.length) return;
    const im = new THREE.InstancedMesh(geo, mat, arr.length);
    arr.forEach((p, idx) => { q.setFromAxisAngle(up, p.yaw); m.compose(p.pos, q, p.scale); im.setMatrixAt(idx, m); });
    im.instanceMatrix.needsUpdate = true;
    im.castShadow = castShadow; im.receiveShadow = false;
    root.add(im);
    meshes.push(im);
  });
  return meshes;
}

// Build & scatter all flora for a map. Returns colliders for the trees.
export function plantFlora(world) {
  const root = world.root;
  const mat = FLORA_MAT();
  const colliders = [];
  const place = (minR, maxR, corridor) => () => {
    const ang = Math.random() * Math.PI * 2;
    const dist = minR + Math.random() * (maxR - minR);
    const x = Math.cos(ang) * dist, z = Math.sin(ang) * dist;
    if (corridor && Math.abs(x) < 5 && z > -100 && z < 40) return null; // keep the spawn lane clear
    if (world.waterAt(x, z)) return null;
    const y = Math.max(0, world.heightAt(x, z));
    return { pos: new THREE.Vector3(x, y, z), yaw: Math.random() * Math.PI * 2, scale: null };
  };

  // detailed branching trees (a few templates, instanced)
  const treeTemplates = [11, 23, 47, 88, 131].map(treeGeometry);
  const treeScale = () => { const s = 0.8 + Math.random() * 0.7; return new THREE.Vector3(s, s, s); };
  scatter(root, treeTemplates, mat, 60, () => { const p = place(14, 135, true)(); if (p) { p.scale = treeScale(); colliders.push({ x: p.pos.x, z: p.pos.z, r: 0.6 * p.scale.x }); } return p; }, true);

  // flowers — clustered, no collision
  const flowerTemplates = [3, 9, 17, 28].map(flowerGeometry);
  scatter(root, flowerTemplates, mat, 260, () => { const p = place(8, 135, true)(); if (p) p.scale = new THREE.Vector3(1, 1, 1).multiplyScalar(0.8 + Math.random() * 0.8); return p; }, false);

  // ferns / tufts
  const fernTemplates = [5, 14, 30].map(fernGeometry);
  scatter(root, fernTemplates, mat, 110, () => { const p = place(8, 135, true)(); if (p) p.scale = new THREE.Vector3(1, 1, 1).multiplyScalar(0.7 + Math.random() * 0.7); return p; }, false);

  // dispose the (now-instanced) template geometries' CPU copies isn't needed;
  // InstancedMesh keeps a reference, so leave them.
  return colliders;
}
