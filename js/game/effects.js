import * as THREE from 'three';

// Pooled FX: bullet tracers, impact sparks, smoke puffs, ground decals,
// blood bursts and an ambient drifting ember field.
export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.tracers = [];
    this.sparks = [];
    this.smokes = [];
    this.decals = [];
    this._puffTex = this._makePuffTexture();
    this._smokeTex = this._makeSmokeTexture();
    this._initTracers();
    this._initSparks();
    this._initSmoke();
    this._initDecals();
    this._initEmbers();
  }

  // ---------- textures ----------
  _makePuffTexture() {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.4, 'rgba(255,210,120,0.8)');
    g.addColorStop(1, 'rgba(255,150,60,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  }
  _makeSmokeTexture() {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const ctx = c.getContext('2d');
    for (let i = 0; i < 12; i++) {
      const x = 40 + Math.random() * 48, y = 40 + Math.random() * 48, r = 18 + Math.random() * 30;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(255,255,255,0.4)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
    }
    return new THREE.CanvasTexture(c);
  }

  // ---------- tracers ----------
  _initTracers() {
    const geo = new THREE.CylinderGeometry(0.02, 0.02, 1, 5);
    geo.translate(0, -0.5, 0); geo.rotateX(Math.PI / 2);
    for (let i = 0; i < 24; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0, fog: false });
      const m = new THREE.Mesh(geo, mat); m.visible = false;
      this.scene.add(m); this.tracers.push({ mesh: m, life: 0 });
    }
    this._ti = 0;
  }
  tracer(from, to, color) {
    const t = this.tracers[this._ti = (this._ti + 1) % this.tracers.length];
    const m = t.mesh, dist = from.distanceTo(to);
    m.position.copy(from); m.lookAt(to); m.scale.set(1, 1, dist);
    m.material.color.setHex(color || 0xffe08a);
    m.material.opacity = 0.9; m.visible = true; t.life = 0.08;
  }

  // ---------- impact sparks ----------
  _initSparks() {
    for (let i = 0; i < 30; i++) {
      const mat = new THREE.SpriteMaterial({ map: this._puffTex, transparent: true, opacity: 0, depthWrite: false, fog: false });
      const s = new THREE.Sprite(mat); s.visible = false;
      this.scene.add(s); this.sparks.push({ sprite: s, life: 0, max: 0 });
    }
    this._si = 0;
  }
  impact(point, color, big) {
    const s = this.sparks[this._si = (this._si + 1) % this.sparks.length];
    const sp = s.sprite;
    sp.position.copy(point);
    sp.scale.setScalar((big ? 1.6 : 0.8) * (0.7 + Math.random() * 0.5));
    if (color) sp.material.color.setHex(color);
    sp.material.opacity = 1; sp.visible = true;
    s.life = s.max = big ? 0.35 : 0.18;
  }
  bloodHit(point) { this.impact(point, 0xff3b2f, false); }

  // ---------- smoke puffs ----------
  _initSmoke() {
    for (let i = 0; i < 40; i++) {
      const mat = new THREE.SpriteMaterial({ map: this._smokeTex, transparent: true, opacity: 0, depthWrite: false, color: 0x888888 });
      const s = new THREE.Sprite(mat); s.visible = false;
      this.scene.add(s);
      this.smokes.push({ sprite: s, life: 0, max: 0, vy: 0, grow: 0 });
    }
    this._smi = 0;
  }
  smoke(point, { color = 0x6b6b6b, size = 1.2, life = 1.2, rise = 1.0, opacity = 0.6 } = {}) {
    const s = this.smokes[this._smi = (this._smi + 1) % this.smokes.length];
    const sp = s.sprite;
    sp.position.copy(point);
    sp.position.x += (Math.random() - 0.5) * 0.4;
    sp.position.z += (Math.random() - 0.5) * 0.4;
    sp.scale.setScalar(size * (0.6 + Math.random() * 0.5));
    sp.material.color.setHex(color);
    sp.material.opacity = opacity; sp.visible = true;
    s.life = s.max = life; s.vy = rise; s.grow = size * 1.4; s._op = opacity;
    s.spin = (Math.random() - 0.5) * 1.2;
  }

  // ---------- ground decals (blood / scorch) ----------
  _initDecals() {
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);
    for (let i = 0; i < 24; i++) {
      const mat = new THREE.MeshBasicMaterial({ map: this._puffTex, transparent: true, opacity: 0, depthWrite: false, color: 0x550000 });
      mat.polygonOffset = true; mat.polygonOffsetFactor = -2;
      const m = new THREE.Mesh(geo, mat); m.visible = false;
      this.scene.add(m); this.decals.push({ mesh: m, life: 0, max: 0 });
    }
    this._di = 0;
  }
  groundDecal(point, color = 0x4a0a06, size = 1.6, life = 7) {
    const d = this.decals[this._di = (this._di + 1) % this.decals.length];
    const m = d.mesh;
    m.position.set(point.x, 0.06, point.z);
    m.rotation.y = Math.random() * Math.PI;
    m.scale.setScalar(size * (0.8 + Math.random() * 0.5));
    m.material.color.setHex(color);
    m.material.opacity = 0.85; m.visible = true;
    d.life = d.max = life;
  }

  bloodBurst(point) {
    this.bloodHit(point);
    for (let i = 0; i < 3; i++) this.smoke(point, { color: 0x7a0d08, size: 0.6, life: 0.5, rise: 0.6, opacity: 0.5 });
    this.groundDecal(point, 0x4a0a06, 1.3, 8);
  }

  explosionFX(center) {
    this.impact(center, 0xffd070, true);
    this.impact(center.clone().add(new THREE.Vector3(0, 1.4, 0)), 0xff7020, true);
    for (let i = 0; i < 8; i++) {
      const p = center.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2, Math.random() * 2, (Math.random() - 0.5) * 2));
      this.smoke(p, { color: 0x3a3a3a, size: 2.2, life: 1.8, rise: 1.4, opacity: 0.7 });
    }
    this.groundDecal(center, 0x141008, 3.0, 12);
  }

  // ---------- ambient embers ----------
  _initEmbers() {
    const N = 160;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(N * 3);
    this._emberVel = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 120;
      pos[i * 3 + 1] = Math.random() * 18;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 120;
      this._emberVel[i] = 0.4 + Math.random() * 1.2;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const tex = this._puffTex;
    const mat = new THREE.PointsMaterial({
      size: 0.35, map: tex, color: 0xffce6a, transparent: true, opacity: 0.7,
      depthWrite: false, blending: THREE.AdditiveBlending, fog: true, sizeAttenuation: true,
    });
    this._embers = new THREE.Points(geo, mat);
    this._embers.frustumCulled = false;
    this.scene.add(this._embers);
  }

  _updateEmbers(dt, center) {
    const pos = this._embers.geometry.attributes.position;
    const arr = pos.array;
    for (let i = 0; i < this._emberVel.length; i++) {
      arr[i * 3 + 1] += this._emberVel[i] * dt;
      arr[i * 3] += Math.sin((arr[i * 3 + 1] + i) * 0.5) * dt * 0.3;
      if (arr[i * 3 + 1] > 18) {
        arr[i * 3] = center.x + (Math.random() - 0.5) * 120;
        arr[i * 3 + 1] = 0;
        arr[i * 3 + 2] = center.z + (Math.random() - 0.5) * 120;
      }
    }
    pos.needsUpdate = true;
  }

  update(dt, center) {
    for (const t of this.tracers) {
      if (t.life > 0) { t.life -= dt; t.mesh.material.opacity = Math.max(0, (t.life / 0.08) * 0.9); if (t.life <= 0) t.mesh.visible = false; }
    }
    for (const s of this.sparks) {
      if (s.life > 0) { s.life -= dt; const f = s.life / s.max; s.sprite.material.opacity = f; s.sprite.scale.multiplyScalar(1 + dt * 2); if (s.life <= 0) s.sprite.visible = false; }
    }
    for (const s of this.smokes) {
      if (s.life > 0) {
        s.life -= dt; const f = s.life / s.max;
        s.sprite.material.opacity = (s._op || 0.6) * f;
        s.sprite.position.y += s.vy * dt;
        s.sprite.scale.addScalar(s.grow * dt);
        s.sprite.material.rotation += (s.spin || 0) * dt;
        if (s.life <= 0) s.sprite.visible = false;
      }
    }
    for (const d of this.decals) {
      if (d.life > 0) { d.life -= dt; d.mesh.material.opacity = 0.85 * Math.min(1, d.life / 1.5); if (d.life <= 0) d.mesh.visible = false; }
    }
    if (center) this._updateEmbers(dt, center);
  }
}
