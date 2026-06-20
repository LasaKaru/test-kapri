import * as THREE from 'three';

export class Player {
  constructor(camera, scene, world) {
    this.camera = camera;
    this.scene = scene;
    this.world = world;

    this.position = new THREE.Vector3(0, 0, 30);
    this.eyeHeight = 1.7;
    this.radius = 0.5;

    this.yaw = Math.PI;
    this.pitch = 0;

    this.speed = 7;
    this.sprintMul = 1.6;
    this.keys = {};
    this.sprinting = false;
    this.touchVec = new THREE.Vector2(0, 0); // analog move from a touch joystick (x=strafe, y=forward)

    // survivability (COD-style)
    this.maxHp = 100; this.hp = 100;
    this.maxArmor = 100; this.armor = 0;
    this.hurtCd = 0;            // time since last damage
    this.regenDelay = 4.0;      // seconds before regen kicks in
    this.regenRate = 14;        // hp per second

    // look/recoil
    this.recoilPitch = 0;
    this.lookSensMul = 1;       // reduced while ADS
    this.sensitivity = 1;       // user setting multiplier

    this._bob = 0;
  }

  onKey(code, down) { this.keys[code] = down; }

  addLook(dx, dy) {
    const sens = 0.0022 * this.lookSensMul * this.sensitivity;
    this.yaw -= dx * sens;
    this.pitch -= dy * sens;
    const lim = Math.PI / 2 - 0.05;
    this.pitch = Math.max(-lim, Math.min(lim, this.pitch));
  }

  addRecoil(pitch, yaw = 0) {
    this.recoilPitch += pitch;
    this.yaw += yaw;
  }

  takeDamage(dmg) {
    if (this.hurtCd > 0 && this.hurtCd > this.regenDelay - 0.35) {
      // brief i-frame right after a hit to avoid instant melt
    }
    let remaining = dmg;
    if (this.armor > 0) {
      const absorbed = Math.min(this.armor, remaining * 0.65);
      this.armor -= absorbed;
      remaining -= absorbed;
    }
    this.hp = Math.max(0, this.hp - remaining);
    this.hurtCd = this.regenDelay; // reset regen timer
  }

  heal(amount) { this.hp = Math.min(this.maxHp, this.hp + amount); }
  addArmor(amount) { this.armor = Math.min(this.maxArmor, this.armor + amount); }

  update(dt) {
    // regen
    if (this.hurtCd > 0) this.hurtCd -= dt;
    else if (this.hp < this.maxHp) this.hp = Math.min(this.maxHp, this.hp + this.regenRate * dt);

    // recoil recover
    this.recoilPitch *= Math.max(0, 1 - dt * 7);

    // movement
    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const move = new THREE.Vector3();
    if (this.keys['KeyW']) move.add(forward);
    if (this.keys['KeyS']) move.sub(forward);
    if (this.keys['KeyD']) move.add(right);
    if (this.keys['KeyA']) move.sub(right);
    // analog touch joystick
    if (this.touchVec.x || this.touchVec.y) {
      move.add(forward.clone().multiplyScalar(this.touchVec.y));
      move.add(right.clone().multiplyScalar(this.touchVec.x));
    }

    let spd = this.speed;
    this.sprinting = (this.keys['ShiftLeft'] || this.keys['ShiftRight']) && move.lengthSq() > 0 && this.keys['KeyW'];
    if (this.sprinting) spd *= this.sprintMul;
    // wading through water slows you down
    this.wading = this.world.waterAt(this.position.x, this.position.z);
    if (this.wading) spd *= 0.5;

    if (move.lengthSq() > 0) {
      move.normalize().multiplyScalar(spd * dt);
      const r = this.world.resolve(this.position.x + move.x, this.position.z + move.z, this.radius);
      this.position.x = r.x; this.position.z = r.z;
      this._bob += dt * spd * 1.3;
    }

    this._updateCamera();
  }

  _updateCamera() {
    const bob = Math.sin(this._bob) * 0.05;
    this.camera.position.set(this.position.x, this.position.y + this.eyeHeight + bob, this.position.z);
    const euler = new THREE.Euler(this.pitch - this.recoilPitch, this.yaw, 0, 'YXZ');
    this.camera.quaternion.setFromEuler(euler);
  }

  reset() {
    this.position.set(0, 0, 30);
    this.yaw = Math.PI; this.pitch = 0;
    // restore base stats (perks from a previous run are cleared)
    this.maxHp = 100; this.maxArmor = 100; this.speed = 7;
    this.hp = this.maxHp; this.armor = 0;
    this.hurtCd = 0; this.recoilPitch = 0; this._bob = 0;
    this._updateCamera();
  }
}
