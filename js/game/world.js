import * as THREE from 'three';

// Builds the low-poly forest battlefield: sky, mountains, terrain, a ruined
// town (buildings, crates, barrels, watchtower, sandbags), trees and props.
export class World {
  constructor(scene) {
    this.scene = scene;
    this.colliders = []; // {x,z,r}
    this.barrels = [];    // explosive barrels {group,x,z,hp,dead}
    this.bounds = 130;
    this._clouds = [];
    this._time = 0;
    this._waterMats = [];
    // lake basins (kept off the path & town); carved into the terrain
    this.lakes = [
      { x: -58, z: 38, r: 20 },
      { x: 62, z: 8, r: 24 },
      { x: 34, z: 64, r: 17 },
    ];
    this._build();
  }

  _build() {
    this._buildSky();
    this._buildLights();
    this._buildTerrain();
    this._buildMountains();
    this._plantForest();
    this._buildTown();
    this._buildWater();
    this._scatterRocks();
    this._scatterGrass();
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
    scene.add(sky);

    scene.fog = new THREE.Fog(0xc09a3a, 55, 230);

    // sun disc + glow low on the horizon
    const sunDisc = new THREE.Mesh(
      new THREE.CircleGeometry(28, 32),
      new THREE.MeshBasicMaterial({ color: 0xfff3c0, fog: false })
    );
    sunDisc.position.set(-50, 30, -260);
    sunDisc.lookAt(0, 10, 0);
    scene.add(sunDisc);
    const glow = new THREE.Mesh(
      new THREE.CircleGeometry(70, 32),
      new THREE.MeshBasicMaterial({ color: 0xffd866, transparent: true, opacity: 0.4, fog: false })
    );
    glow.position.set(-50, 30, -259); glow.lookAt(0, 10, 0);
    scene.add(glow);

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
      scene.add(s);
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
    scene.add(new THREE.HemisphereLight(0xfff0b0, 0x1f3a10, 0.8));
    const sun = new THREE.DirectionalLight(0xffe39a, 2.2);
    sun.position.set(-40, 34, -90);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const d = 90;
    sun.shadow.camera.left = -d; sun.shadow.camera.right = d;
    sun.shadow.camera.top = d; sun.shadow.camera.bottom = -d;
    sun.shadow.camera.near = 1; sun.shadow.camera.far = 260;
    sun.shadow.bias = -0.0004;
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0xbce04a, 0.4);
    fill.position.set(40, 20, 40);
    scene.add(fill);
  }

  // ---------- Terrain ----------
  _buildTerrain() {
    const size = 360, seg = 70;
    const geo = new THREE.PlaneGeometry(size, size, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const dist = Math.sqrt(x * x + z * z);
      let h = Math.sin(x * 0.05) * Math.cos(z * 0.045) * 2.4 + Math.sin(x * 0.13 + z * 0.1) * 0.9;
      h *= Math.min(1, dist / 40);
      // carve lake basins (smooth bowl down to ~ -2.6)
      for (const lk of this.lakes) {
        const d = Math.hypot(x - lk.x, z - lk.z);
        if (d < lk.r * 1.25) {
          const t = 1 - Math.min(1, d / (lk.r * 1.25)); // 0 at rim -> 1 at center
          const bowl = t * t * (3 - 2 * t); // smoothstep
          h = h * (1 - bowl) + (-2.6) * bowl;
        }
      }
      pos.setY(i, h);
    }
    geo.computeVertexNormals();
    const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x4f7d1e, roughness: 1, flatShading: true }));
    ground.receiveShadow = true;
    this.scene.add(ground);

    const path = new THREE.Mesh(
      new THREE.PlaneGeometry(8, 320),
      new THREE.MeshStandardMaterial({ color: 0x8a6a32, roughness: 1, flatShading: true })
    );
    path.rotation.x = -Math.PI / 2; path.position.y = 0.05;
    path.receiveShadow = true;
    this.scene.add(path);
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
    this.scene.add(ring);
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
      this.scene.add(mesh);
      this._waterMats.push(mat);

      // reedy ring around the lake
      const reedMat = new THREE.MeshStandardMaterial({ color: 0x5f7a26, roughness: 1, flatShading: true });
      for (let i = 0; i < 26; i++) {
        const a = Math.random() * Math.PI * 2;
        const rr = lk.r * (1.05 + Math.random() * 0.12);
        const reed = new THREE.Mesh(new THREE.ConeGeometry(0.12, 1.6 + Math.random(), 4), reedMat);
        reed.position.set(lk.x + Math.cos(a) * rr, 0.4, lk.z + Math.sin(a) * rr);
        this.scene.add(reed);
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
  _makeTree() {
    const g = new THREE.Group();
    const trunkH = 1.6 + Math.random() * 1.4;
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.28, trunkH, 5),
      new THREE.MeshStandardMaterial({ color: 0x4a3318, roughness: 1, flatShading: true })
    );
    trunk.position.y = trunkH / 2; trunk.castShadow = true; g.add(trunk);
    const tiers = 2 + Math.floor(Math.random() * 2);
    const green = new THREE.Color().setHSL(0.26 + Math.random() * 0.06, 0.6, 0.22 + Math.random() * 0.1);
    let y = trunkH, r = 1.4 + Math.random() * 0.6;
    for (let t = 0; t < tiers; t++) {
      const ch = 1.5;
      const cone = new THREE.Mesh(new THREE.ConeGeometry(r, ch, 6), new THREE.MeshStandardMaterial({ color: green, roughness: 1, flatShading: true }));
      cone.position.y = y + ch / 2 - 0.3; cone.castShadow = true; g.add(cone);
      y += ch * 0.62; r *= 0.72;
    }
    return g;
  }

  _plantForest() {
    for (let i = 0; i < 170; i++) {
      const ang = Math.random() * Math.PI * 2;
      const dist = 12 + Math.random() * 130;
      const x = Math.cos(ang) * dist, z = Math.sin(ang) * dist;
      if (Math.abs(x) < 5 && Math.abs(z) < 100) continue;
      if (this.waterAt(x, z)) continue;
      const tree = this._makeTree();
      const s = 0.8 + Math.random() * 0.9;
      tree.scale.setScalar(s);
      tree.position.set(x, 0, z);
      tree.rotation.y = Math.random() * Math.PI;
      this.scene.add(tree);
      if (dist < this.bounds + 10) this.colliders.push({ x, z, r: 0.6 * s });
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

  _building(x, z, w, h, d, color, rot = 0) {
    const g = new THREE.Group();
    const wallMat = new THREE.MeshStandardMaterial({ color, roughness: 1, flatShading: true });
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
    body.position.y = h / 2; body.castShadow = true; body.receiveShadow = true; g.add(body);

    // broken roofline (a couple of offset slabs)
    const roof = new THREE.Mesh(new THREE.BoxGeometry(w * 1.05, 0.5, d * 1.05), new THREE.MeshStandardMaterial({ color: 0x3a352c, roughness: 1, flatShading: true }));
    roof.position.y = h + 0.2; roof.castShadow = true; g.add(roof);

    // glowing windows
    const winMat = new THREE.MeshStandardMaterial({ color: 0x120c06, emissive: 0xffb14a, emissiveIntensity: 0.7, roughness: 0.6 });
    const rows = Math.max(1, Math.floor(h / 3)), cols = Math.max(1, Math.floor(w / 2.5));
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (Math.random() < 0.25) continue; // some dark/broken
        const win = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.2, 0.1), winMat.clone());
        win.material.emissiveIntensity = 0.3 + Math.random() * 0.7;
        const wx = -w / 2 + 1.3 + c * (w - 2.6) / Math.max(1, cols - 1);
        const wy = 1.6 + r * 2.6;
        win.position.set(wx, wy, d / 2 + 0.01);
        g.add(win);
        const win2 = win.clone(); win2.position.z = -d / 2 - 0.01; g.add(win2);
      }
    }
    g.position.set(x, 0, z); g.rotation.y = rot;
    this.scene.add(g);
    // collider (approximate radius)
    this.colliders.push({ x, z, r: Math.max(w, d) * 0.55 });
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
    this.scene.add(g);
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
    this.scene.add(g);
    this.colliders.push({ x, z, r: 2.0 });
  }

  _crateStack(x, z) {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x8a6a3a, roughness: 1, flatShading: true });
    const layout = [[0, 0, 0], [1.05, 0, 0], [0.5, 1.05, 0.2], [0, 0, 1.05]];
    layout.forEach(([cx, cy, cz]) => {
      const s = 0.9 + Math.random() * 0.2;
      const crate = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), mat);
      crate.position.set(cx, cy + s / 2, cz);
      crate.rotation.y = Math.random() * 0.3;
      crate.castShadow = true; crate.receiveShadow = true; g.add(crate);
    });
    g.position.set(x, 0, z);
    this.scene.add(g);
    this.colliders.push({ x, z, r: 1.4 });
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
    this.scene.add(g);
    this.colliders.push({ x, z, r: 0.6 });
    if (explosive) this.barrels.push({ group: g, x, z, hp: 3, dead: false });
  }

  _fencePost(x, z) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.6, 0.18), new THREE.MeshStandardMaterial({ color: 0x4a3a22, roughness: 1, flatShading: true }));
    post.position.set(x, 0.8, z); post.castShadow = true;
    this.scene.add(post);
  }

  _rock(x, z, r, mat, mossMat) {
    if (this.waterAt(x, z)) return;
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), mat);
    // squash + jitter verts a touch for a less uniform look
    rock.scale.set(1, 0.7 + Math.random() * 0.5, 1);
    rock.position.set(x, r * 0.35, z);
    rock.rotation.set(Math.random(), Math.random(), Math.random());
    rock.castShadow = true; rock.receiveShadow = true;
    this.scene.add(rock);
    // mossy cap on bigger boulders
    if (r > 0.9 && mossMat) {
      const moss = new THREE.Mesh(new THREE.DodecahedronGeometry(r * 0.92, 0), mossMat);
      moss.scale.set(1, 0.35, 1);
      moss.position.set(x, r * 0.6, z);
      moss.rotation.copy(rock.rotation);
      this.scene.add(moss);
    }
    if (Math.hypot(x, z) < this.bounds) this.colliders.push({ x, z, r: r * 0.7 });
  }

  _scatterRocks() {
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x6b6f5a, roughness: 1, flatShading: true });
    const darkRock = new THREE.MeshStandardMaterial({ color: 0x52564a, roughness: 1, flatShading: true });
    const mossMat = new THREE.MeshStandardMaterial({ color: 0x4f7d1e, roughness: 1, flatShading: true });

    // scattered singles
    for (let i = 0; i < 50; i++) {
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
    const bladeMat = new THREE.MeshStandardMaterial({ color: 0x86b32a, roughness: 1, flatShading: true, side: THREE.DoubleSide });
    const blade = new THREE.ConeGeometry(0.18, 0.9, 3);
    const mesh = new THREE.InstancedMesh(blade, bladeMat, 700);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < 700; i++) {
      const ang = Math.random() * Math.PI * 2, dist = 4 + Math.random() * 90;
      const gx = Math.cos(ang) * dist, gz = Math.sin(ang) * dist;
      dummy.position.set(gx, 0.4, gz);
      dummy.rotation.y = Math.random() * Math.PI;
      dummy.scale.setScalar(this.waterAt(gx, gz) ? 0 : 0.6 + Math.random());
      dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
    }
    this.scene.add(mesh);
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
          this.scene.remove(b.group);
          // remove its collider
          this.colliders = this.colliders.filter((c) => !(Math.abs(c.x - b.x) < 0.01 && Math.abs(c.z - b.z) < 0.01));
          return { x: b.x, z: b.z, radius: 7 };
        }
      }
    }
    return null;
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
    for (const c of this._clouds) {
      c.s.position.x += c.speed * dt;
      if (c.s.position.x > 320) c.s.position.x = -320;
    }
    for (const m of this._waterMats) {
      m.uniforms.uTime.value = this._time;
      if (camera) m.uniforms.uCam.value.copy(camera.position);
    }
  }
}
