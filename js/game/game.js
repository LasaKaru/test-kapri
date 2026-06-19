import * as THREE from 'three';
import { World } from './world.js';
import { Player } from './player.js';
import { WaveManager } from './enemy.js';
import { HUD } from './hud.js';
import { Audio } from './audio.js';
import { WeaponManager, WEAPONS, WEAPON_ORDER } from './weapons.js';
import { Effects } from './effects.js';
import { Pickups } from './pickups.js';

const BASE_FOV = 75;

class Game {
  constructor() {
    this.canvas = document.getElementById('scene');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(BASE_FOV, 1, 0.1, 600);
    this.scene.add(this.camera);

    this.world = new World(this.scene);
    this.player = new Player(this.camera, this.scene, this.world);
    this.weapons = new WeaponManager(this.camera, BASE_FOV);
    this.waves = new WaveManager(this.scene, this.world);
    this.effects = new Effects(this.scene);
    this.pickups = new Pickups(this.scene);
    this.hud = new HUD();
    this.audio = new Audio();
    this.raycaster = new THREE.Raycaster();

    this.state = 'title';
    this.score = 0;
    this.kills = 0;
    this.streak = 0;
    this.firing = false;
    this.shake = 0;

    this.clock = new THREE.Clock();
    this._resize();
    this._bindUI();
    this._bindInput();
    window.addEventListener('resize', () => this._resize());

    requestAnimationFrame(() => {
      document.getElementById('loading').classList.add('hidden');
      this._render();
    });

    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);

    if (typeof window !== 'undefined') window.__verdant = this; // debug handle
  }

  _resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  _bindUI() {
    document.getElementById('start-btn').addEventListener('click', () => this.start());
    document.getElementById('restart-btn').addEventListener('click', () => this.start());
    document.getElementById('restart-btn-pause').addEventListener('click', () => this.start());
    document.getElementById('resume-btn').addEventListener('click', () => this._requestLock());
  }

  _bindInput() {
    document.addEventListener('keydown', (e) => {
      if (this.state !== 'playing') return;
      this.player.onKey(e.code, true);
      if (e.code === 'KeyR' && this.weapons.reload()) this.audio.reload();
      // weapon switch via number keys
      const m = /^Digit([1-4])$/.exec(e.code);
      if (m) {
        const key = WEAPON_ORDER[parseInt(m[1], 10) - 1];
        if (this.weapons.switchTo(key)) { this.audio.swap(); this._syncWeaponHud(); }
      }
    });
    document.addEventListener('keyup', (e) => {
      if (this.state === 'playing') this.player.onKey(e.code, false);
    });

    document.addEventListener('mousemove', (e) => {
      if (this.state === 'playing' && document.pointerLockElement) {
        this.player.addLook(e.movementX, e.movementY);
      }
    });

    document.addEventListener('mousedown', (e) => {
      if (this.state !== 'playing') return;
      if (e.button === 0) this.firing = true;
      if (e.button === 2) this.weapons.setAds(true);
    });
    document.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.firing = false;
      if (e.button === 2) this.weapons.setAds(false);
    });
    document.addEventListener('contextmenu', (e) => { if (this.state === 'playing') e.preventDefault(); });

    document.addEventListener('wheel', (e) => {
      if (this.state !== 'playing') return;
      this.weapons.cycle(e.deltaY > 0 ? 1 : -1);
      this.audio.swap();
      this._syncWeaponHud();
    }, { passive: true });

    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement) {
        if (this.state === 'paused' || this.state === 'title' || this.state === 'over') {
          this.state = 'playing';
          this._hideOverlays();
          this.hud.show();
        }
      } else if (this.state === 'playing') {
        this.state = 'paused';
        this.firing = false;
        this.weapons.setAds(false);
        document.getElementById('pause').classList.remove('hidden');
      }
    });
  }

  _requestLock() { this.canvas.requestPointerLock(); }
  _hideOverlays() { ['title', 'pause', 'gameover'].forEach((id) => document.getElementById(id).classList.add('hidden')); }

  _syncWeaponHud() {
    const live = this.weapons.live;
    this.hud.setActiveWeapon(this.weapons.current);
    this.hud.setWeaponName(this.weapons.def.name);
    this.hud.setAmmo(live.ammo, live.reserve);
  }

  start() {
    this.waves.reset();
    this.player.reset();
    this.weapons.reset();
    this.pickups.reset();
    this.score = 0; this.kills = 0; this.streak = 0; this.firing = false; this.shake = 0;

    this.hud.setScore(0);
    this.hud.setHealth(this.player.hp, this.player.maxHp);
    this.hud.setArmor(this.player.armor, this.player.maxArmor);
    this.hud.setStreak(0);
    this.hud.buildWeaponSlots(WEAPON_ORDER, WEAPONS, this.weapons.current);
    this._syncWeaponHud();

    this._hideOverlays();
    this.hud.show();
    this.state = 'playing';
    this._requestLock();
    this.audio._ensure();

    const n = this.waves.startNextWave();
    this.hud.setWave(n);
    this.hud.popWave(n, 'SURVIVE');
    this.audio.wave();
  }

  _fire() {
    const shot = this.weapons.tryFire();
    if (!shot) {
      const live = this.weapons.live;
      if (live.ammo <= 0 && !this.weapons.reloading) this.audio.empty();
      return;
    }
    this.audio.shoot(this.weapons.def.key);
    this.player.addRecoil(shot.recoil);
    this.shake = Math.min(0.5, this.shake + shot.def.kick * 1.2);

    const origin = new THREE.Vector3();
    this.camera.getWorldPosition(origin);
    const muzzle = new THREE.Vector3();
    this.weapons.muzzleWorldPos(muzzle);

    let anyHit = false, anyKill = false;
    for (const dir of shot.rays) {
      const enemyHit = this.waves.raycastRay(this.raycaster, origin, dir, shot.def.range);

      // ground / world endpoint for tracer + impact
      let endPoint, impactColor = 0xd8c79a, isEnemy = false;
      if (enemyHit) {
        endPoint = enemyHit.point; isEnemy = true; anyHit = true;
        const killed = enemyHit.enemy.hit(shot.def.dmg);
        this.effects.bloodHit(endPoint);
        if (killed) anyKill = true;
      } else {
        // intersect ground plane y=0
        let t = dir.y < -0.001 ? -origin.y / dir.y : shot.def.range;
        t = Math.min(t, shot.def.range);
        endPoint = origin.clone().add(dir.clone().multiplyScalar(t));
        this.effects.impact(endPoint, impactColor, false);
        // barrel check at impact
        const blast = this.world.hitBarrel(endPoint);
        if (blast) this._explode(blast);
      }
      this.effects.tracer(muzzle, endPoint, shot.def.tracer);
    }

    if (anyHit) this.hud.hitMarker();
  }

  _explode(blast) {
    this.audio.explosion();
    this.shake = Math.min(0.8, this.shake + 0.5);
    const center = new THREE.Vector3(blast.x, 1, blast.z);
    this.effects.impact(center, 0xffa040, true);
    this.effects.impact(center.clone().add(new THREE.Vector3(0, 1.5, 0)), 0xff7020, true);
    // damage enemies in radius
    for (const e of this.waves.enemies) {
      if (e.dead) continue;
      const d = Math.hypot(e.group.position.x - blast.x, e.group.position.z - blast.z);
      if (d < blast.radius) {
        if (e.hit(5)) { /* killed by blast, handled in removeDead */ }
        this.effects.bloodHit(e.group.position.clone().add(new THREE.Vector3(0, 1, 0)));
      }
    }
    // damage player if too close
    const pd = Math.hypot(this.player.position.x - blast.x, this.player.position.z - blast.z);
    if (pd < blast.radius) {
      this.player.takeDamage(20 * (1 - pd / blast.radius));
      this.hud.damageFlash();
      this._afterPlayerDamage();
    }
  }

  _onPlayerHit(dmg) {
    this.player.takeDamage(dmg);
    this.hud.damageFlash();
    this.audio.hurt();
    this._afterPlayerDamage();
  }

  _afterPlayerDamage() {
    this.streak = 0;
    this.hud.setStreak(0);
    this.hud.setHealth(this.player.hp, this.player.maxHp);
    this.hud.setArmor(this.player.armor, this.player.maxArmor);
    if (this.player.hp <= 0 && this.state === 'playing') this._gameOver();
  }

  _onKill(enemy) {
    this.kills++;
    this.streak++;
    let pts = enemy.score;
    if (this.streak >= 3) pts += Math.min(200, this.streak * 15); // streak bonus
    this.score += pts;
    this.hud.setScore(this.score);
    this.hud.setStreak(this.streak);
    this.hud.popKill();
    this.hud.killFeed(`▸ ${enemy.type.toUpperCase()}  +${pts}`);
    this.audio.kill();
    // chance to drop a pickup
    this.pickups.maybeDrop(enemy.group.position, this.player.hp / this.player.maxHp);
  }

  _collect(kind) {
    this.audio.pickup();
    if (kind === 'health') { this.player.heal(35); this.hud.killFeed('+ MEDKIT'); }
    else if (kind === 'armor') { this.player.addArmor(50); this.hud.killFeed('+ ARMOR'); }
    else if (kind === 'ammo') { this.weapons.addAmmo(0.4); this.hud.killFeed('+ AMMO'); }
    this.hud.setHealth(this.player.hp, this.player.maxHp);
    this.hud.setArmor(this.player.armor, this.player.maxArmor);
    this._syncWeaponHud();
  }

  _gameOver() {
    this.state = 'over';
    this.firing = false;
    this.hud.hide();
    document.exitPointerLock();
    this.audio.over();

    document.getElementById('final-score').textContent = String(this.score).padStart(4, '0');
    document.getElementById('final-wave').textContent = this.waves.wave;
    document.getElementById('final-kills').textContent = this.kills;

    let scores = [];
    try { scores = JSON.parse(localStorage.getItem('verdant_scores') || '[]'); } catch (_) {}
    const best = scores.reduce((m, r) => Math.max(m, r.score), 0);
    scores.push({ score: this.score, wave: this.waves.wave, kills: this.kills, date: Date.now() });
    scores.sort((a, b) => b.score - a.score);
    scores = scores.slice(0, 10);
    try { localStorage.setItem('verdant_scores', JSON.stringify(scores)); } catch (_) {}

    document.getElementById('over-best').textContent = this.score > best
      ? '★ NEW PERSONAL BEST ★' : `Personal best: ${String(best).padStart(4, '0')}`;
    document.getElementById('gameover').classList.remove('hidden');
  }

  loop() {
    requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, this.clock.getDelta());

    if (this.state === 'playing') {
      if (this.firing && (this.weapons.def.auto || !this._firedThisClick)) {
        const before = this.weapons.fireCd;
        if (before <= 0) {
          this._fire();
          if (!this.weapons.def.auto) this._firedThisClick = true;
        }
      }
      if (!this.firing) this._firedThisClick = false;

      this.player.update(dt);
      this.weapons.update(dt);
      this.player.lookSensMul = this.weapons.ads ? 0.5 : 1;
      this.hud.setScope(this.weapons.def.key === 'sniper' && this.weapons.adsT > 0.6);

      const live = this.weapons.live;
      this.hud.setAmmo(live.ammo, live.reserve);
      this.hud.setReloading(this.weapons.reloading);

      this.waves.update(dt, this.player, this.camera, {
        onPlayerHit: (d) => this._onPlayerHit(d),
        onWaveCleared: (w) => this.hud.popWave(w + 1, 'CLEARED — BRACE'),
        onWaveStart: (n) => {
          this.hud.setWave(n);
          this.hud.popWave(n, 'INCOMING');
          this.audio.wave();
          this.weapons.addAmmo(0.3);
          this.player.addArmor(20);
          this.hud.setArmor(this.player.armor, this.player.maxArmor);
          this._syncWeaponHud();
        },
      });
      this.waves.removeDead((e) => this._onKill(e));
      this.hud.setEnemies(this.waves.remaining);

      // regen-driven HUD refresh
      this.hud.setHealth(this.player.hp, this.player.maxHp);

      this.pickups.update(dt, this.player.position, (kind) => this._collect(kind));
      this.effects.update(dt);
      this.world.update(dt);

      // camera shake
      if (this.shake > 0) {
        this.camera.position.x += (Math.random() - 0.5) * this.shake * 0.3;
        this.camera.position.y += (Math.random() - 0.5) * this.shake * 0.3;
        this.shake *= Math.max(0, 1 - dt * 6);
      }
    } else if (this.state === 'title') {
      this._idleT = (this._idleT || 0) + dt;
      this.camera.position.set(0, this.player.eyeHeight, 30);
      this.camera.rotation.set(0, Math.PI + Math.sin(this._idleT * 0.15) * 0.15, 0);
      this.world.update(dt);
    }

    this._render();
  }

  _render() { this.renderer.render(this.scene, this.camera); }
}

window.addEventListener('error', (e) => {
  const l = document.getElementById('loading');
  if (l && !l.classList.contains('hidden')) {
    l.querySelector('.loading-text').textContent = 'Failed to load: ' + e.message;
  }
});
new Game();
