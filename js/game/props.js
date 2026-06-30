import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Loads optional static glTF landmarks (scenery, not characters). Auto-fits the
// model to a target size and grounds it, plays any built-in animation, and is
// fully failure-safe: if a model can't load the game just carries on without it.
export class Props {
  constructor(scene) {
    this.scene = scene;
    this.mixers = [];
    this._loader = new GLTFLoader();
  }

  // opts: { x, z, groundY, fit (target max footprint), rotX, rotationY, onPlaced }
  loadLandmark(url, opts = {}) {
    this._loader.load(url, (g) => {
      try { this._place(g, opts); } catch (e) { console.warn('[props] place failed:', e); }
    }, undefined, (e) => { console.warn('[props] landmark load failed:', url, e && (e.message || e)); });
  }

  _place(g, opts) {
    const root = g.scene || (g.scenes && g.scenes[0]);
    if (!root) return;
    root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = true; } });
    // Sketchfab/FBX exports are Z-up — rotate to Y-up
    root.rotation.x = (opts.rotX != null ? opts.rotX : -Math.PI / 2);

    const wrap = new THREE.Group();
    wrap.add(root);
    if (opts.rotationY) wrap.rotation.y = opts.rotationY;
    this.scene.add(wrap);

    // auto-fit: scale so the largest horizontal dimension ≈ opts.fit
    wrap.updateMatrixWorld(true);
    let box = new THREE.Box3().setFromObject(wrap);
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.z) || 1;
    const fit = opts.fit || 40;
    wrap.scale.setScalar(fit / maxDim);

    // ground it: drop so the model's base sits at groundY
    wrap.position.set(opts.x || 0, 0, opts.z || 0);
    wrap.updateMatrixWorld(true);
    box = new THREE.Box3().setFromObject(wrap);
    wrap.position.y = (opts.groundY || 0) - box.min.y + (opts.lift || 0);

    // play built-in animation (windmill/waterfall) if present
    if (g.animations && g.animations.length) {
      const mixer = new THREE.AnimationMixer(root);
      g.animations.forEach((c) => mixer.clipAction(c).play());
      this.mixers.push(mixer);
    }
    if (opts.onPlaced) opts.onPlaced(wrap);
  }

  update(dt) { for (const m of this.mixers) m.update(dt); }
}
