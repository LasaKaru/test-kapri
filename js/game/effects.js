import * as THREE from 'three';

// Pooled bullet tracers, impact sparks and hit particles.
export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.tracers = [];
    this.sparks = [];
    this._initTracers();
    this._initSparks();
  }

  _initTracers() {
    const N = 24;
    const geo = new THREE.CylinderGeometry(0.02, 0.02, 1, 5);
    geo.translate(0, -0.5, 0); // pivot at top so we can scale length downward
    geo.rotateX(Math.PI / 2);  // align along -Z
    for (let i = 0; i < N; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0, fog: false });
      const m = new THREE.Mesh(geo, mat);
      m.visible = false;
      this.scene.add(m);
      this.tracers.push({ mesh: m, life: 0 });
    }
    this._ti = 0;
  }

  _initSparks() {
    // small impact puff using a sprite
    const N = 30;
    const tex = this._makePuffTexture();
    for (let i = 0; i < N; i++) {
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false, fog: false });
      const s = new THREE.Sprite(mat);
      s.visible = false;
      this.scene.add(s);
      this.sparks.push({ sprite: s, life: 0, max: 0 });
    }
    this._si = 0;
  }

  _makePuffTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.4, 'rgba(255,210,120,0.8)');
    g.addColorStop(1, 'rgba(255,150,60,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c);
    return t;
  }

  tracer(from, to, color) {
    const t = this.tracers[this._ti = (this._ti + 1) % this.tracers.length];
    const m = t.mesh;
    const dist = from.distanceTo(to);
    m.position.copy(from);
    m.lookAt(to);
    m.scale.set(1, 1, dist);
    m.material.color.setHex(color || 0xffe08a);
    m.material.opacity = 0.9;
    m.visible = true;
    t.life = 0.08;
  }

  impact(point, color, big) {
    const s = this.sparks[this._si = (this._si + 1) % this.sparks.length];
    const sp = s.sprite;
    sp.position.copy(point);
    const size = big ? 1.6 : 0.8;
    sp.scale.setScalar(size * (0.7 + Math.random() * 0.5));
    if (color) sp.material.color.setHex(color);
    sp.material.opacity = 1;
    sp.visible = true;
    s.life = s.max = big ? 0.35 : 0.18;
  }

  bloodHit(point) { this.impact(point, 0xff3b2f, false); }

  update(dt) {
    for (const t of this.tracers) {
      if (t.life > 0) {
        t.life -= dt;
        t.mesh.material.opacity = Math.max(0, (t.life / 0.08) * 0.9);
        if (t.life <= 0) t.mesh.visible = false;
      }
    }
    for (const s of this.sparks) {
      if (s.life > 0) {
        s.life -= dt;
        const f = s.life / s.max;
        s.sprite.material.opacity = f;
        s.sprite.scale.multiplyScalar(1 + dt * 2);
        if (s.life <= 0) s.sprite.visible = false;
      }
    }
  }
}
