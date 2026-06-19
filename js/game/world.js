import * as THREE from 'three';

// Builds the low-poly forest: terrain, trees, rocks, sun, fog, lighting.
export class World {
  constructor(scene) {
    this.scene = scene;
    this.colliders = []; // {x,z,r} for trees/rocks so things don't clip through
    this.bounds = 110;   // playable radius
    this._build();
  }

  _build() {
    const scene = this.scene;

    // --- Sky / fog: golden dusk fading to green ---
    scene.background = new THREE.Color(0x9a8a2a);
    scene.fog = new THREE.Fog(0xb59428, 40, 150);

    // --- Lighting ---
    const ambient = new THREE.HemisphereLight(0xfff0b0, 0x1f3a10, 0.85);
    scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xffe39a, 2.1);
    sun.position.set(-30, 26, -70); // low on the horizon, behind -> long shadows toward player
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const d = 80;
    sun.shadow.camera.left = -d; sun.shadow.camera.right = d;
    sun.shadow.camera.top = d; sun.shadow.camera.bottom = -d;
    sun.shadow.camera.near = 1; sun.shadow.camera.far = 220;
    sun.shadow.bias = -0.0004;
    scene.add(sun);
    this.sun = sun;

    const fill = new THREE.DirectionalLight(0xbce04a, 0.4);
    fill.position.set(40, 20, 40);
    scene.add(fill);

    // --- Visible sun sprite low on horizon ---
    const sunDisc = new THREE.Mesh(
      new THREE.CircleGeometry(26, 32),
      new THREE.MeshBasicMaterial({ color: 0xfff3c0, fog: false, transparent: true, opacity: 0.95 })
    );
    sunDisc.position.set(-34, 22, -120);
    sunDisc.lookAt(0, 10, 0);
    scene.add(sunDisc);
    const glow = new THREE.Mesh(
      new THREE.CircleGeometry(46, 32),
      new THREE.MeshBasicMaterial({ color: 0xffd866, fog: false, transparent: true, opacity: 0.4 })
    );
    glow.position.copy(sunDisc.position); glow.position.z += 1; glow.lookAt(0, 10, 0);
    scene.add(glow);

    // --- Terrain: gently rolling low-poly ground ---
    const size = 300, seg = 60;
    const geo = new THREE.PlaneGeometry(size, size, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const dist = Math.sqrt(x * x + z * z);
      // keep a flat-ish arena in the middle, hills toward edges
      let h = Math.sin(x * 0.05) * Math.cos(z * 0.045) * 2.2
            + Math.sin(x * 0.13 + z * 0.1) * 0.9;
      h *= Math.min(1, dist / 40);
      pos.setY(i, h);
    }
    geo.computeVertexNormals();
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x4f7d1e, roughness: 1, metalness: 0, flatShading: true,
    });
    const ground = new THREE.Mesh(geo, groundMat);
    ground.receiveShadow = true;
    scene.add(ground);
    this.ground = ground;

    // dirt path strip down the middle (matches the video's path)
    const path = new THREE.Mesh(
      new THREE.PlaneGeometry(7, 280, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0x8a6a32, roughness: 1, flatShading: true })
    );
    path.rotation.x = -Math.PI / 2;
    path.position.y = 0.05;
    path.receiveShadow = true;
    scene.add(path);

    // --- Trees ---
    this._plantForest();

    // --- Scattered rocks & grass tufts ---
    this._scatterRocks();
    this._scatterGrass();
  }

  _makeTree() {
    const g = new THREE.Group();
    const trunkH = 1.6 + Math.random() * 1.4;
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.28, trunkH, 5),
      new THREE.MeshStandardMaterial({ color: 0x4a3318, roughness: 1, flatShading: true })
    );
    trunk.position.y = trunkH / 2;
    trunk.castShadow = true;
    g.add(trunk);

    // stacked cones -> pine
    const tiers = 2 + Math.floor(Math.random() * 2);
    const green = new THREE.Color().setHSL(0.26 + Math.random() * 0.06, 0.6, 0.22 + Math.random() * 0.1);
    let y = trunkH;
    let r = 1.4 + Math.random() * 0.6;
    for (let t = 0; t < tiers; t++) {
      const ch = 1.5;
      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(r, ch, 6),
        new THREE.MeshStandardMaterial({ color: green, roughness: 1, flatShading: true })
      );
      cone.position.y = y + ch / 2 - 0.3;
      cone.castShadow = true;
      g.add(cone);
      y += ch * 0.62;
      r *= 0.72;
    }
    return g;
  }

  _plantForest() {
    const count = 150;
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const dist = 12 + Math.random() * 120;
      const x = Math.cos(ang) * dist;
      const z = Math.sin(ang) * dist;
      // keep the central path clearer
      if (Math.abs(x) < 4.5 && Math.abs(z) < 90) continue;
      const tree = this._makeTree();
      const s = 0.8 + Math.random() * 0.9;
      tree.scale.setScalar(s);
      tree.position.set(x, 0, z);
      tree.rotation.y = Math.random() * Math.PI;
      this.scene.add(tree);
      if (dist < this.bounds + 10) this.colliders.push({ x, z, r: 0.6 * s });
    }
  }

  _scatterRocks() {
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x6b6f5a, roughness: 1, flatShading: true });
    for (let i = 0; i < 40; i++) {
      const ang = Math.random() * Math.PI * 2;
      const dist = 8 + Math.random() * 110;
      const x = Math.cos(ang) * dist, z = Math.sin(ang) * dist;
      const r = 0.4 + Math.random() * 1.1;
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), rockMat);
      rock.position.set(x, r * 0.4, z);
      rock.rotation.set(Math.random(), Math.random(), Math.random());
      rock.castShadow = true; rock.receiveShadow = true;
      this.scene.add(rock);
      if (dist < this.bounds) this.colliders.push({ x, z, r: r * 0.7 });
    }
  }

  _scatterGrass() {
    const bladeMat = new THREE.MeshStandardMaterial({ color: 0x86b32a, roughness: 1, flatShading: true, side: THREE.DoubleSide });
    const blade = new THREE.ConeGeometry(0.18, 0.9, 3);
    const mesh = new THREE.InstancedMesh(blade, bladeMat, 600);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < 600; i++) {
      const ang = Math.random() * Math.PI * 2;
      const dist = 4 + Math.random() * 80;
      dummy.position.set(Math.cos(ang) * dist, 0.4, Math.sin(ang) * dist);
      dummy.rotation.y = Math.random() * Math.PI;
      dummy.scale.setScalar(0.6 + Math.random());
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.castShadow = false;
    this.scene.add(mesh);
  }

  // Resolve collision against trees/rocks; returns adjusted position
  resolve(x, z, radius) {
    for (const c of this.colliders) {
      const dx = x - c.x, dz = z - c.z;
      const d = Math.hypot(dx, dz);
      const min = radius + c.r;
      if (d < min && d > 0.0001) {
        const push = (min - d);
        x += (dx / d) * push;
        z += (dz / d) * push;
      }
    }
    // arena bounds
    const dc = Math.hypot(x, z);
    if (dc > this.bounds) { x = (x / dc) * this.bounds; z = (z / dc) * this.bounds; }
    return { x, z };
  }
}
