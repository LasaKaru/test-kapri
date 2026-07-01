import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Loads optional static glTF landmarks (scenery, not characters). Auto-fits the
// model to a target size and grounds it, plays any built-in animation, and is
// fully failure-safe: if a model can't load the game just carries on without it.
export class Props {
  constructor(scene) {
    this.scene = scene;
    this.mixers = [];
    this.objects = [];   // placed wrap groups, for teardown on map change
    this._gen = 0;       // bumped on clear() so in-flight loads don't place stale models
    this._loader = new GLTFLoader();
  }

  // remove every placed landmark (e.g. when the map is rebuilt) and free GPU memory
  clear() {
    for (const wrap of this.objects) {
      this.scene.remove(wrap);
      wrap.traverse((o) => {
        if (o.isMesh) {
          o.geometry && o.geometry.dispose();
          const m = o.material;
          if (Array.isArray(m)) m.forEach((x) => x && x.dispose()); else m && m.dispose();
        }
      });
    }
    this.objects.length = 0;
    this.mixers.length = 0;
    this._gen++;
  }

  // opts: { x, z, groundY, fit (target max footprint), rotX, rotationY, onPlaced }
  loadLandmark(url, opts = {}) {
    const gen = this._gen;
    this._loader.load(url, (g) => {
      if (gen !== this._gen) return; // map changed while loading — drop this model
      try { this._place(g, opts); } catch (e) { console.warn('[props] place failed:', e); }
    }, undefined, (e) => { console.warn('[props] landmark load failed:', url, e && (e.message || e)); });
  }

  _place(g, opts) {
    const root = g.scene || (g.scenes && g.scenes[0]);
    if (!root) return;
    root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = true; } });
    // glTF/GLB is Y-up by spec, and Sketchfab bakes its own Z-up→Y-up matrix
    // into the model's root node, so the model already loads upright. Only
    // rotate if a caller explicitly asks (rotX); adding one by default would
    // double-rotate and tip the model onto its side.
    if (opts.rotX) root.rotation.x = opts.rotX;

    const wrap = new THREE.Group();
    wrap.add(root);
    if (opts.rotationY) wrap.rotation.y = opts.rotationY;
    this.scene.add(wrap);
    this.objects.push(wrap);

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
    // report the grounded world footprint so callers can register a solid
    // collider (the diorama sits on a rock base — you walk up to it and stop)
    if (opts.onPlaced) {
      box = new THREE.Box3().setFromObject(wrap);
      const c = box.getCenter(new THREE.Vector3());
      const s = box.getSize(new THREE.Vector3());
      const footprint = Math.max(s.x, s.z) * 0.5;
      opts.onPlaced(wrap, { cx: c.x, cz: c.z, r: footprint });
    }
  }

  update(dt) { for (const m of this.mixers) m.update(dt); }
}
