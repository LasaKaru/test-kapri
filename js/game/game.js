import * as THREE from 'three';
import { World } from './world.js';
import { Player } from './player.js';
import { WaveManager } from './enemy.js';
import { HUD } from './hud.js';
import { Audio } from './audio.js';

class Game {
  constructor() {
    this.canvas = document.getElementById('scene');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, 1, 0.1, 500);
    this.scene.add(this.camera);

    this.world = new World(this.scene);
    this.player = new Player(this.camera, this.scene, this.world);
    this.waves = new WaveManager(this.scene, this.world);
    this.hud = new HUD();
    this.audio = new Audio();

    this.state = 'title'; // title | playing | paused | over
    this.score = 0;
    this.kills = 0;
    this.firing = false;

    this.clock = new THREE.Clock();
    this._resize();
    this._bindUI();
    this._bindInput();
    window.addEventListener('resize', () => this._resize());

    // hide loading once first frame is ready
    requestAnimationFrame(() => {
      document.getElementById('loading').classList.add('hidden');
      this._render(); // draw title scene behind overlay
    });

    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
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
      if (e.code === 'Escape') return; // handled by pointerlock change
      if (this.state === 'playing') this.player.onKey(e.code, true);
      if (e.code === 'KeyR' && this.state === 'playing') this.audio.reload();
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
      if (e.button === 0 && this.state === 'playing') this.firing = true;
    });
    document.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.firing = false;
    });

    // pointer lock state drives pause
    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement) {
        if (this.state === 'paused' || this.state === 'title' || this.state === 'over') {
          this.state = 'playing';
          this._hideOverlays();
          this.hud.show();
        }
      } else {
        if (this.state === 'playing') {
          this.state = 'paused';
          this.firing = false;
          document.getElementById('pause').classList.remove('hidden');
        }
      }
    });
  }

  _requestLock() {
    this.canvas.requestPointerLock();
  }

  _hideOverlays() {
    ['title', 'pause', 'gameover'].forEach((id) => document.getElementById(id).classList.add('hidden'));
  }

  start() {
    // reset world state
    this.waves.reset();
    this.player.reset();
    this.score = 0;
    this.kills = 0;
    this.firing = false;
    this.hud.setScore(0);
    this.hud.setHealth(this.player.hp, this.player.maxHp);
    this.hud.setAmmo(this.player.ammo, this.player.reserve);

    this._hideOverlays();
    this.hud.show();
    this.state = 'playing';
    this._requestLock();
    this.audio._ensure();

    // first wave
    const n = this.waves.startNextWave();
    this.hud.setWave(n);
    this.hud.popWave(n, 'SURVIVE');
    this.audio.wave();
  }

  _onPlayerHit(dmg) {
    this.player.takeDamage(dmg);
    this.hud.setHealth(this.player.hp, this.player.maxHp);
    this.hud.damageFlash();
    this.audio.hurt();
    if (this.player.hp <= 0) this._gameOver();
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

    // save to local leaderboard
    let scores = [];
    try { scores = JSON.parse(localStorage.getItem('verdant_scores') || '[]'); } catch (_) {}
    const best = scores.reduce((m, r) => Math.max(m, r.score), 0);
    scores.push({ score: this.score, wave: this.waves.wave, kills: this.kills, date: Date.now() });
    scores.sort((a, b) => b.score - a.score);
    scores = scores.slice(0, 10);
    try { localStorage.setItem('verdant_scores', JSON.stringify(scores)); } catch (_) {}

    const bestEl = document.getElementById('over-best');
    bestEl.textContent = this.score > best ? '★ NEW PERSONAL BEST ★'
      : `Personal best: ${String(best).padStart(4, '0')}`;

    document.getElementById('gameover').classList.remove('hidden');
  }

  _addScore(n) {
    this.score += n;
    this.hud.setScore(this.score);
  }

  loop() {
    requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, this.clock.getDelta());

    if (this.state === 'playing') {
      // firing
      if (this.firing) {
        const shot = this.player.tryFire(this.waves);
        if (shot) {
          this.audio.shoot();
          if (shot.hit) this.hud.hitMarker();
          if (shot.killed) {
            this.kills++;
            this._addScore(shot.enemy.score);
            this.hud.popKill();
            this.audio.kill();
          }
        } else if (this.player.ammo <= 0 && !this.player.reloading) {
          this.audio.empty();
        }
      }

      this.player.update(dt);
      this.hud.setAmmo(this.player.ammo, this.player.reserve);
      this.hud.setReloading(this.player.reloading);

      this.waves.update(dt, this.player, this.camera, {
        onPlayerHit: (d) => this._onPlayerHit(d),
        onWaveCleared: (w) => {
          this.hud.popWave(w + 1, 'CLEARED — BRACE');
        },
        onWaveStart: (n) => {
          this.hud.setWave(n);
          this.hud.popWave(n, 'INCOMING');
          this.audio.wave();
          // small reward + ammo top-up each wave
          this.player.reserve += 60;
        },
      });
      this.waves.removeDead();
      this.hud.setEnemies(this.waves.remaining);
    } else if (this.state === 'title') {
      // slow idle camera drift on the title screen
      this._idleT = (this._idleT || 0) + dt;
      this.camera.position.set(0, this.player.eyeHeight, 30);
      this.camera.rotation.set(0, Math.PI + Math.sin(this._idleT * 0.15) * 0.15, 0);
    }

    this._render();
  }

  _render() {
    this.renderer.render(this.scene, this.camera);
  }
}

// boot
window.addEventListener('error', (e) => {
  const l = document.getElementById('loading');
  if (l && !l.classList.contains('hidden')) {
    l.querySelector('.loading-text').textContent = 'Failed to load: ' + e.message;
  }
});
new Game();
