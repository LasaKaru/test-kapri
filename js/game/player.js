import * as THREE from 'three';

export class Player {
  constructor(camera, scene, world) {
    this.camera = camera;
    this.scene = scene;
    this.world = world;

    this.position = new THREE.Vector3(0, 0, 30);
    this.eyeHeight = 1.7;
    this.radius = 0.5;

    // look angles
    this.yaw = Math.PI;   // facing -Z (into the forest / toward the sun)
    this.pitch = 0;

    // movement
    this.velocity = new THREE.Vector3();
    this.speed = 7;
    this.sprintMul = 1.6;
    this.keys = {};

    // weapon
    this.magSize = 30;
    this.ammo = 30;
    this.reserve = 120;
    this.reloading = false;
    this.reloadTime = 1.6;
    this.reloadTimer = 0;
    this.fireCd = 0;
    this.fireRate = 0.11; // seconds between shots
    this.damage = 1;
    this.recoil = 0;

    // health
    this.maxHp = 100;
    this.hp = 100;
    this.hurtCd = 0;

    this.raycaster = new THREE.Raycaster();
    this._buildViewModel();
    this._updateCamera();
  }

  _buildViewModel() {
    // simple rifle attached to the camera (view model)
    const gun = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.6, metalness: 0.3 });
    const accentMat = new THREE.MeshStandardMaterial({ color: 0x2f3a1a, roughness: 0.8 });

    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, 0.6), bodyMat);
    receiver.position.set(0.28, -0.26, -0.55);
    gun.add(receiver);

    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.7, 8), bodyMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0.28, -0.24, -0.95);
    gun.add(barrel);

    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.22, 0.12), accentMat);
    mag.position.set(0.28, -0.42, -0.5);
    gun.add(mag);

    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.13, 0.28), accentMat);
    stock.position.set(0.28, -0.27, -0.25);
    gun.add(stock);

    // muzzle flash sprite
    const flashMat = new THREE.SpriteMaterial({ color: 0xffe08a, transparent: true, opacity: 0, fog: false, depthTest: false });
    const flash = new THREE.Sprite(flashMat);
    flash.scale.set(0.5, 0.5, 0.5);
    flash.position.set(0.28, -0.24, -1.35);
    gun.add(flash);
    this.muzzleFlash = flash;

    // muzzle light
    const light = new THREE.PointLight(0xffd070, 0, 8);
    light.position.copy(flash.position);
    gun.add(light);
    this.muzzleLight = light;

    this.camera.add(gun);
    this.gun = gun;
    this._gunRestY = gun.position.y;
  }

  onKey(code, down) {
    this.keys[code] = down;
    if (down && code === 'KeyR') this.reload();
  }

  reload() {
    if (this.reloading || this.ammo === this.magSize || this.reserve <= 0) return;
    this.reloading = true;
    this.reloadTimer = this.reloadTime;
  }

  // attempt to fire; returns shot info or null
  tryFire(waveManager) {
    if (this.reloading || this.fireCd > 0) return null;
    if (this.ammo <= 0) { this.reload(); return null; }
    this.ammo -= 1;
    this.fireCd = this.fireRate;
    this.recoil = Math.min(0.06, this.recoil + 0.025);

    // muzzle flash
    this.muzzleFlash.material.opacity = 1;
    this.muzzleFlash.scale.setScalar(0.4 + Math.random() * 0.3);
    this.muzzleLight.intensity = 4;
    this._flashTime = 0.05;

    // raycast from camera center
    this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
    const hit = waveManager.raycast(this.raycaster);
    let killed = false;
    if (hit) killed = hit.enemy.hit(this.damage);
    return { hit: !!hit, killed, enemy: hit ? hit.enemy : null };
  }

  takeDamage(dmg) {
    if (this.hurtCd > 0) return;
    this.hp = Math.max(0, this.hp - dmg);
    this.hurtCd = 0.4;
  }

  addLook(dx, dy) {
    const sens = 0.0022;
    this.yaw -= dx * sens;
    this.pitch -= dy * sens;
    const lim = Math.PI / 2 - 0.05;
    this.pitch = Math.max(-lim, Math.min(lim, this.pitch));
  }

  update(dt) {
    if (this.fireCd > 0) this.fireCd -= dt;
    if (this.hurtCd > 0) this.hurtCd -= dt;

    // reload
    if (this.reloading) {
      this.reloadTimer -= dt;
      // bob the gun while reloading
      this.gun.position.y = this._gunRestY - 0.12 * Math.sin((1 - this.reloadTimer / this.reloadTime) * Math.PI);
      if (this.reloadTimer <= 0) {
        const need = this.magSize - this.ammo;
        const take = Math.min(need, this.reserve);
        this.ammo += take;
        this.reserve -= take;
        this.reloading = false;
        this.gun.position.y = this._gunRestY;
      }
    }

    // muzzle flash decay
    if (this._flashTime > 0) {
      this._flashTime -= dt;
      if (this._flashTime <= 0) { this.muzzleFlash.material.opacity = 0; this.muzzleLight.intensity = 0; }
    }
    // recoil recover
    this.recoil *= Math.max(0, 1 - dt * 8);

    // movement input (camera-relative on the XZ plane)
    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const move = new THREE.Vector3();
    if (this.keys['KeyW']) move.add(forward);
    if (this.keys['KeyS']) move.sub(forward);
    if (this.keys['KeyD']) move.add(right);
    if (this.keys['KeyA']) move.sub(right);

    let spd = this.speed;
    const sprinting = this.keys['ShiftLeft'] || this.keys['ShiftRight'];
    if (sprinting && move.lengthSq() > 0) spd *= this.sprintMul;

    if (move.lengthSq() > 0) {
      move.normalize().multiplyScalar(spd * dt);
      let nx = this.position.x + move.x;
      let nz = this.position.z + move.z;
      const r = this.world.resolve(nx, nz, this.radius);
      this.position.x = r.x;
      this.position.z = r.z;
      // head bob
      this._bob = (this._bob || 0) + dt * spd * 1.3;
    }

    this._updateCamera(sprinting);
  }

  _updateCamera(sprinting) {
    const bob = this._bob ? Math.sin(this._bob) * 0.05 : 0;
    this.camera.position.set(
      this.position.x,
      this.position.y + this.eyeHeight + bob,
      this.position.z
    );
    const euler = new THREE.Euler(this.pitch - this.recoil, this.yaw, 0, 'YXZ');
    this.camera.quaternion.setFromEuler(euler);
  }

  reset() {
    this.position.set(0, 0, 30);
    this.yaw = Math.PI; this.pitch = 0;
    this.hp = this.maxHp;
    this.ammo = this.magSize; this.reserve = 120;
    this.reloading = false; this.fireCd = 0; this.recoil = 0;
    this._updateCamera();
  }
}
