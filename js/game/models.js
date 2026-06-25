import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

// Optional glTF character loader. Loads a model once and hands out animated,
// independently-skinned clones. Fully failure-safe: if a model can't load (no
// network, static host, bad file) every caller gets null and the game falls
// back to its built-in procedural soldiers — nothing breaks.
export class Models {
  constructor() {
    this.ready = {};                 // name -> { scene, clips }
    this._promises = {};
    this._loader = new GLTFLoader();
  }

  load(name, url) {
    if (this._promises[name]) return this._promises[name];
    this._promises[name] = new Promise((resolve) => {
      try {
        this._loader.load(url, (g) => {
          const root = g.scene || g.scenes[0];
          root.traverse((o) => {
            if (o.isMesh || o.isSkinnedMesh) {
              o.castShadow = true; o.receiveShadow = false; o.frustumCulled = true;
              // geometries are shared across every clone — tag them so per-enemy
              // disposal never frees a geometry another soldier is still using
              if (o.geometry) { o.geometry.userData = o.geometry.userData || {}; o.geometry.userData.shared = true; }
            }
          });
          this.ready[name] = { scene: root, clips: g.animations || [] };
          resolve(this.ready[name]);
        }, undefined, (err) => { console.warn('[models] load failed:', name, err && (err.message || err)); resolve(null); });
      } catch (e) { console.warn('[models] loader threw:', e); resolve(null); }
    });
    return this._promises[name];
  }

  has(name) { return !!this.ready[name]; }

  // Returns an animated instance, or null if the model isn't loaded:
  //   { group, mixer, clips, play(clipName, fade), update(dt) }
  instance(name, scale = 1) {
    const m = this.ready[name];
    if (!m) return null;
    const group = cloneSkinned(m.scene);
    group.scale.setScalar(scale);
    const mixer = new THREE.AnimationMixer(group);
    const byName = {}; for (const c of m.clips) byName[c.name] = c;
    let current = null;
    return {
      group, mixer, clips: m.clips,
      play(clipName, fade = 0.25) {
        const clip = byName[clipName] || m.clips[0];
        if (!clip) return;
        const act = mixer.clipAction(clip);
        if (current && current !== act) current.fadeOut(fade);
        act.reset().fadeIn(fade).play();
        current = act;
      },
      update(dt) { mixer.update(dt); },
    };
  }

  // A plain skinned clone (no mixer) with per-clone materials so each instance
  // can flash/fade independently. For procedurally-posed characters (enemies).
  cloneGroup(name, scale = 1) {
    const m = this.ready[name];
    if (!m) return null;
    const g = cloneSkinned(m.scene);
    g.scale.setScalar(scale);
    g.traverse((o) => { if ((o.isMesh || o.isSkinnedMesh) && o.material) o.material = Array.isArray(o.material) ? o.material.map((x) => x.clone()) : o.material.clone(); });
    return g;
  }

  // Measured world-space height of a loaded model (for auto-scaling to fit)
  height(name) {
    const m = this.ready[name];
    if (!m) return 0;
    const box = new THREE.Box3().setFromObject(m.scene);
    return Math.max(0.001, box.max.y - box.min.y);
  }
}
