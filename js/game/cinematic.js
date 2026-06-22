import * as THREE from 'three';

// Cinematic menu flythrough — a looping multi-shot camera tour of the map,
// played behind the title screen. Each shot eases between two camera poses
// (position + look target), then cuts to the next. Purely visual.
export class Cinematic {
  constructor(game) {
    this.game = game;
    this._look = new THREE.Vector3();
    this.i = 0;
    this.t = 0;
    this._build();
  }

  // shots tuned to the world: meadow, mountains, ruined town, water, the
  // enemy base far to the north, then a sweeping hero orbit.
  _build() {
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const shot = (p0, p1, l0, l1, dur, fov0 = 70, fov1 = 70) => ({ p0, p1, l0, l1, dur, fov0, fov1 });
    this.shots = [
      // 1 — low dawn sweep forward over the meadow
      shot(V(-70, 6, 95), V(-22, 7, 38), V(0, 5, 25), V(0, 6, -34), 7, 64, 70),
      // 2 — rise and tilt up to the mountains
      shot(V(-22, 7, 36), V(2, 24, 8), V(0, 6, -30), V(0, 22, -95), 6.5, 70, 74),
      // 3 — slow orbit around the ruined town
      shot(V(46, 17, -14), V(-38, 19, -32), V(0, 4, -46), V(0, 5, -46), 8, 72, 72),
      // 4 — glide across the water & forest
      shot(V(-44, 9, -8), V(24, 7, 28), V(-10, 3, 12), V(12, 3, 30), 7, 68, 68),
      // 5 — reveal the enemy base, then pull up high
      shot(V(0, 14, -86), V(0, 50, -178), V(0, 5, -118), V(0, 9, -118), 8, 66, 78),
      // 6 — sweeping hero orbit high above the valley
      shot(V(95, 58, 44), V(-95, 62, 44), V(0, 8, -18), V(0, 8, -18), 9, 74, 74),
    ];
  }

  reset() { this.i = 0; this.t = 0; }

  update(dt) {
    const cam = this.game.camera;
    const s = this.shots[this.i];
    this.t += dt;
    let k = Math.min(1, this.t / s.dur);
    const e = k * k * (3 - 2 * k);              // smoothstep ease
    cam.position.lerpVectors(s.p0, s.p1, e);
    // subtle handheld drift so static-ish shots still feel alive
    const tt = this._tt = (this._tt || 0) + dt;
    cam.position.x += Math.sin(tt * 0.5) * 0.25;
    cam.position.y += Math.sin(tt * 0.7) * 0.18;
    this._look.lerpVectors(s.l0, s.l1, e);
    cam.lookAt(this._look);
    const fov = s.fov0 + (s.fov1 - s.fov0) * e;
    if (Math.abs(cam.fov - fov) > 0.05) { cam.fov = fov; cam.updateProjectionMatrix(); }
    if (this.t >= s.dur) { this.t = 0; this.i = (this.i + 1) % this.shots.length; }
  }
}
