import * as THREE from 'three';

const COLORS = [0x4aa3ff, 0xffcf4a, 0xff6ad5, 0x6affb0];

// Co-op: relays the local player's state and shows remote players as avatars.
// Fully optional & isolated — if the server is unreachable nothing happens.
export class Coop {
  constructor(game) {
    this.game = game;
    this.active = false;
    this.myId = null;
    this.room = '';
    this.peers = new Map(); // id -> { group, target, tyaw, name, hp, color }
    this._sendT = 0;
    this.onRoster = null;    // lobby callback
    const net = game.net;
    net.onCoop((m) => this._onMsg(m));
    net.onCoopState((s) => { this.state = s; this._notifyRoster(); });
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
    } else if (m.type === 'full') {
      this.full = true; this._notifyRoster();
    }
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
