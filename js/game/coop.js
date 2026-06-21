import * as THREE from 'three';
import { Enemy } from './enemy.js';

const COLORS = [0x4aa3ff, 0xffcf4a, 0xff6ad5, 0x6affb0];
// a no-op "world" so a ghost's death animation can run without any AI/collision
const NULL_WORLD = { steerAround() { return { x: 0, z: 0 }; }, resolve(x, z) { return { x, z }; } };

// Co-op: relays the local player's state and shows remote players as avatars.
// Fully optional & isolated — if the server is unreachable nothing happens.
export class Coop {
  constructor(game) {
    this.game = game;
    this.active = false;
    this.myId = null;
    this.room = '';
    this.peers = new Map(); // id -> { group, target, tyaw, name, hp, color }
    this.ghosts = new Map(); // shared-wave enemies mirrored from the host (id -> Enemy)
    this._sendT = 0;
    this.onRoster = null;    // lobby callback
    const net = game.net;
    net.onCoop((m) => this._onMsg(m));
    net.onCoopState((s) => { this.state = s; this._notifyRoster(); });
  }

  // host = the lowest connected id in the room (deterministic, survives leaves)
  isHost() {
    if (!this.active || this.myId == null) return true;
    let min = this.myId;
    for (const id of this.peers.keys()) if (id < min) min = id;
    return this.myId === min;
  }

  host() { const code = this._code(); this.join(code); return code; }
  join(room) {
    this.room = (room || 'LOBBY').toUpperCase();
    this.active = true;
    this.game.net.connectCoop(this.room);
  }
  leave() {
    this.active = false;
    this.game.net.leaveCoop();
    for (const id of [...this.peers.keys()]) this._remove(id);
    this.clearGhosts();
    this.myId = null;
    this._notifyRoster();
  }
  _code() { let s = ''; for (let i = 0; i < 4; i++) s += 'ABCDEFGHJKLMNPRSTUVWXYZ23456789'[Math.floor(Math.random() * 30)]; return s; }

  _onMsg(m) {
    if (m.type === 'welcome') {
      this.myId = m.id; this.room = m.room;
      (m.peers || []).forEach((p) => this._add(p.id, p.name));
      this._notifyRoster();
    } else if (m.type === 'peer-join') { this._add(m.id, m.name); this._notifyRoster(); }
    else if (m.type === 'peer-leave') { this._remove(m.id); this._notifyRoster(); }
    else if (m.type === 'state') {
      const a = this.peers.get(m.id);
      if (a) { a.target.set(m.x, 0, m.z); a.tyaw = m.yaw; a.hp = m.hp; a.group.visible = true; }
    } else if (m.type === 'event') {
      this._onEvent(m);
    } else if (m.type === 'full') {
      this.full = true; this._notifyRoster();
    }
  }

  // ---- shared waves (host-authoritative) ----
  _onEvent(m) {
    const host = this.isHost();
    if (m.ev === 'start' && !host) this.game._coopClientStart(m);
    else if (m.ev === 'snap' && !host) this._applySnap(m);
    else if (m.ev === 'hit' && host) this._applyClientHit(m);
    else if (m.ev === 'over' && !host) this.game._coopRemoteOver();
  }

  // HOST: pack the live enemies + shared score/wave and relay to clients (~10/s)
  broadcastSnapshot(waves, score) {
    if (!this.active || !this.isHost()) return;
    const en = [];
    for (const e of waves.enemies) {
      en.push([e.id, e.type,
        Math.round(e.group.position.x * 10) / 10, Math.round(e.group.position.z * 10) / 10,
        Math.round(e.group.rotation.y * 100) / 100,
        Math.round((e.hp / e.maxHp) * 100) / 100, e.dead ? 1 : 0]);
    }
    this.game.net.sendCoopEvent({ ev: 'snap', w: waves.wave, s: score, en });
  }

  // CLIENT: reconcile local ghost enemies against the host's snapshot
  _applySnap(m) {
    this.game.score = m.s;
    this.game.hud.setScore(m.s);
    if (m.w !== this._lastWave) { this._lastWave = m.w; this.game.hud.setWave(m.w); }
    const seen = new Set();
    for (const a of m.en) {
      const [id, t, x, z, yaw, hpf, dead] = a;
      seen.add(id);
      let gh = this.ghosts.get(id);
      if (!gh) {
        gh = new Enemy(this.game.scene, t, new THREE.Vector3(x, 0, z), 1, null);
        gh.id = id; gh._ghost = true;
        this.ghosts.set(id, gh);
      }
      if (dead) { if (!gh.dead) gh._startDeath(); }
      else { gh._tx = x; gh._tz = z; gh._tyaw = yaw; gh.hp = hpf * gh.maxHp; gh._updateHealthBar(); }
    }
    // drop ghosts the host no longer reports (unless mid-death animation)
    for (const [id, gh] of this.ghosts) {
      if (!seen.has(id) && !gh.dead) { gh.remove(); this.ghosts.delete(id); }
    }
  }

  // HOST: a client reported a hit — apply it to the authoritative enemy
  _applyClientHit(m) {
    const e = this.game.waves.enemies.find((x) => x.id === m.e && !x.dead);
    if (!e) return;
    const head = !!m.h;
    e.hit(m.d * (head ? this.game.headMul : 1), head ? 'head' : 'body');
    this.game.effects.bloodBurst(e.group.position.clone().setY(e.bodyHeight * 0.6));
    if (head) this.game._pendingHeadshot = true;
  }

  // CLIENT: shoot a ghost — send the hit to the host (authoritative damage)
  sendHit(id, dmg, head) { this.game.net.sendCoopEvent({ ev: 'hit', e: id, d: dmg, h: head ? 1 : 0 }); }

  raycastGhosts(raycaster, origin, dir, far) {
    raycaster.set(origin, dir); raycaster.far = far;
    let best = null, bd = Infinity;
    for (const gh of this.ghosts.values()) {
      if (gh.dead) continue;
      const hits = raycaster.intersectObject(gh.group, true);
      if (hits.length && hits[0].distance < bd) {
        bd = hits[0].distance;
        best = { enemy: gh, point: hits[0].point, zone: hits[0].object.userData.zone || 'body' };
      }
    }
    return best;
  }

  // CLIENT: drive the ghosts (interpolate live ones, animate the dying ones)
  updateGhosts(dt, camera) {
    for (const [id, gh] of [...this.ghosts]) {
      if (gh.dead) {
        gh.update(dt, gh.group.position, camera, NULL_WORLD); // death anim only
        if (gh.dyingT <= 0) { gh.remove(); this.ghosts.delete(id); }
        continue;
      }
      const k = Math.min(1, dt * 10);
      const p = gh.group.position;
      if (gh._tx != null) { p.x += (gh._tx - p.x) * k; p.z += (gh._tz - p.z) * k; }
      let d = (gh._tyaw || 0) - gh.group.rotation.y;
      while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
      gh.group.rotation.y += d * k;
      gh._animWalk(dt);
      if (gh.hbGroup.visible) gh.hbGroup.quaternion.copy(camera.quaternion);
    }
  }

  clearGhosts() {
    for (const gh of this.ghosts.values()) gh.remove();
    this.ghosts.clear();
    this._lastWave = -1;
  }

  _notifyRoster() {
    if (this.onRoster) {
      const list = [...this.peers.values()].map((a) => a.name);
      this.onRoster({ state: this.state, room: this.room, peers: list, me: this.game.net.name, full: this.full });
    }
  }

  _add(id, name) {
    if (this.peers.has(id)) return;
    const color = COLORS[id % COLORS.length];
    const group = this._buildAvatar(color, name);
    group.visible = false;
    this.game.scene.add(group);
    this.peers.set(id, { group, target: new THREE.Vector3(0, 0, 30), tyaw: 0, name, hp: 100, color });
  }
  _remove(id) {
    const a = this.peers.get(id); if (!a) return;
    this.game.scene.remove(a.group);
    a.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material && o.material.dispose) o.material.dispose(); });
    this.peers.delete(id);
  }

  _buildAvatar(color, name) {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.7, flatShading: true });
    const dark = new THREE.MeshStandardMaterial({ color: 0x222a18, roughness: 0.9 });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.0, 0.4), mat); torso.position.y = 1.1; torso.castShadow = true; g.add(torso);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), mat); head.position.y = 1.85; head.castShadow = true; g.add(head);
    [-1, 1].forEach((s) => { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.85, 0.24), dark); leg.position.set(s * 0.18, 0.42, 0); g.add(leg); });
    [-1, 1].forEach((s) => { const arm = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.8, 0.2), dark); arm.position.set(s * 0.5, 1.1, 0); g.add(arm); });
    // name label
    const label = this._label(name, color);
    label.position.y = 2.5; g.add(label);
    g.userData.head = head;
    return g;
  }
  _label(text, color) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 64;
    const ctx = c.getContext('2d');
    ctx.fillStyle = 'rgba(8,16,4,0.7)'; ctx.fillRect(0, 0, 256, 64);
    ctx.font = 'bold 30px Orbitron, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#' + color.toString(16).padStart(6, '0'); ctx.fillText(text.slice(0, 12), 128, 34);
    const tex = new THREE.CanvasTexture(c);
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
    spr.scale.set(2.6, 0.65, 1);
    return spr;
  }

  update(dt) {
    if (!this.active) return;
    // throttled state send (~12/s)
    this._sendT -= dt;
    if (this._sendT <= 0 && this.game.net.coopState === 'online') {
      this._sendT = 0.08;
      const p = this.game.player;
      this.game.net.sendCoopState({ x: +p.position.x.toFixed(2), z: +p.position.z.toFixed(2), yaw: +p.yaw.toFixed(2), hp: Math.round(p.hp) });
    }
    // interpolate peers
    for (const a of this.peers.values()) {
      if (!a.group.visible) continue;
      a.group.position.lerp(a.target, Math.min(1, dt * 10));
      let d = a.tyaw - a.group.rotation.y;
      while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
      a.group.rotation.y += d * Math.min(1, dt * 10);
    }
  }
}
