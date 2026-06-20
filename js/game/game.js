import * as THREE from 'three';
import { World, MAPS } from './world.js';
import { MapSelect, DIFFICULTIES } from './mapselect.js';
import { TacMap } from './tacmap.js';
import { Achievements } from './achievements.js';
import { Player } from './player.js';
import { WaveManager } from './enemy.js';
import { HUD } from './hud.js';
import { Audio } from './audio.js';
import { WeaponManager, WEAPONS, WEAPON_ORDER } from './weapons.js';
import { Effects } from './effects.js';
import { Pickups } from './pickups.js';
import { PostFX } from './postfx.js';
import { Minimap } from './minimap.js';
import { Settings } from './settings.js';
import { Shop } from './shop.js';
import { TouchControls } from './touch.js';

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

    let savedMap = 'plains', savedDiff = 'veteran';
    try { savedMap = localStorage.getItem('verdant_map') || 'plains'; savedDiff = localStorage.getItem('verdant_diff') || 'veteran'; } catch (_) {}
    this.difficultyId = DIFFICULTIES[savedDiff] ? savedDiff : 'veteran';
    this.difficulty = DIFFICULTIES[this.difficultyId];
    this.world = new World(this.scene, savedMap);
    this.player = new Player(this.camera, this.scene, this.world);
    this.weapons = new WeaponManager(this.camera, BASE_FOV);
    this.waves = new WaveManager(this.scene, this.world);
    this.effects = new Effects(this.scene);
    this.pickups = new Pickups(this.scene);
    this.postfx = new PostFX(this.renderer, this.scene, this.camera);
    this.hud = new HUD();
    this.audio = new Audio();
    this.raycaster = new THREE.Raycaster();
    this.minimap = new Minimap(document.getElementById('minimap'));
    this.baseFov = BASE_FOV;

    this.state = 'title';
    this.score = 0;
    this.kills = 0;
    this.streak = 0;
    this.firing = false;
    this.shake = 0;

    // progression
    this.credits = 0;
    this.creditMul = 1;
    this.lifesteal = 0;

    // grenades
    this.grenades = [];
    this.nades = 3;
    this.maxNades = 4;
    this._nadeGeo = new THREE.SphereGeometry(0.16, 8, 6);
    this._nadeMat = new THREE.MeshStandardMaterial({ color: 0x2b3320, roughness: 0.6, metalness: 0.4 });

    // enemy projectiles
    this.enemyShots = [];
    this._shotGeo = new THREE.SphereGeometry(0.22, 8, 6);
    this._shotMat = new THREE.MeshBasicMaterial({ color: 0xd86bff });
    this._shotMatBoss = new THREE.MeshBasicMaterial({ color: 0xff5030 });

    this.settings = new Settings(this);
    this.settings.applyAll();
    this.shop = new Shop(this);
    this.mapSelect = new MapSelect(this);
    this.tacmap = new TacMap(this);
    this.ach = new Achievements();
    this.touch = new TouchControls(this);
    this._updateLoadoutLabel();

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
    if (this.postfx) this.postfx.setSize(w, h);
  }

  setBaseFov(fov) {
    this.baseFov = fov;
    this.weapons.baseFov = fov;
    if (!this.weapons.ads) { this.camera.fov = fov; this.camera.updateProjectionMatrix(); }
  }

  _bindUI() {
    document.getElementById('start-btn').addEventListener('click', () => this.start());
    document.getElementById('restart-btn').addEventListener('click', () => this.start());
    document.getElementById('restart-btn-pause').addEventListener('click', () => this.start());
    document.getElementById('resume-btn').addEventListener('click', () => this._requestLock());
    document.getElementById('mapselect-btn').addEventListener('click', () => this.mapSelect.open());
    document.getElementById('open-map').addEventListener('click', () => this._toggleMap());
    // tactical map toggle works from title and in a match
    document.addEventListener('keydown', (e) => {
      if (e.code === 'KeyM' && (this.state === 'playing' || this.state === 'map' || this.state === 'title')) this._toggleMap();
    });

    // settings panel (reachable from pause & title)
    const openSettings = (from) => {
      this._settingsReturn = from;
      this.settings.buildUI(document.getElementById('settings-grid'));
      document.getElementById(from).classList.add('hidden');
      document.getElementById('settings').classList.remove('hidden');
    };
    document.getElementById('settings-btn').addEventListener('click', () => openSettings('pause'));
    const titleSet = document.getElementById('settings-btn-title');
    if (titleSet) titleSet.addEventListener('click', () => openSettings('title'));
    document.getElementById('settings-close').addEventListener('click', () => {
      document.getElementById('settings').classList.add('hidden');
      document.getElementById(this._settingsReturn || 'pause').classList.remove('hidden');
    });
  }

  _bindInput() {
    document.addEventListener('keydown', (e) => {
      if (this.state !== 'playing') return;
      this.player.onKey(e.code, true);
      if (e.code === 'KeyR' && this.weapons.reload()) this.audio.reload();
      if (e.code === 'KeyG') this._throwGrenade();
      if (e.code === 'KeyV' || e.code === 'KeyF') this._melee();
      // weapon switch via number keys
      const m = /^Digit([1-6])$/.exec(e.code);
      if (m) {
        const key = WEAPON_ORDER[parseInt(m[1], 10) - 1];
        if (key && this.weapons.switchTo(key)) { this.audio.swap(); this._syncWeaponHud(); }
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

  _pollGamepad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : null;
    const gp = pads && pads[0];
    if (!gp) return;
    const dz = (v) => (Math.abs(v) < 0.18 ? 0 : v);
    const lxm = dz(gp.axes[0] || 0), lym = dz(gp.axes[1] || 0);
    const rx = dz(gp.axes[2] || 0), ry = dz(gp.axes[3] || 0);
    const b = gp.buttons;
    const any = lxm || lym || rx || ry || b.some((x) => x && x.pressed);
    if (!any && !this._gpActive) return;
    this._gpActive = any;
    // move + look
    this.player.touchVec.set(lxm, -lym);
    if (rx || ry) this.player.addLook(rx * 9, ry * 9);
    // fire / ads
    this.firing = !!(b[7] && b[7].pressed);
    this.weapons.setAds(!!(b[6] && b[6].pressed));
    // edge-triggered actions
    const prev = this._gpPrev || (this._gpPrev = {});
    const hit = (i) => b[i] && b[i].pressed && !prev[i];
    if (hit(2)) { if (this.weapons.reload()) this.audio.reload(); }      // X reload
    if (hit(0)) this._melee();                                          // A melee
    if (hit(3)) this._throwGrenade();                                   // Y grenade
    if (hit(5)) { this.weapons.cycle(1); this.audio.swap(); this._syncWeaponHud(); }  // RB
    if (hit(4)) { this.weapons.cycle(-1); this.audio.swap(); this._syncWeaponHud(); } // LB
    for (let i = 0; i < b.length; i++) prev[i] = b[i] && b[i].pressed;
  }

  _toggleMap() {
    const open = !document.getElementById('tacmap').classList.contains('hidden');
    if (open) {
      this.tacmap.close();
      if (this._mapReturn === 'playing') { this.state = 'playing'; this._requestLock(); }
      else document.getElementById('title').classList.remove('hidden');
    } else {
      this._mapReturn = this.state === 'playing' ? 'playing' : 'title';
      if (this.state === 'playing') { this.state = 'map'; this.firing = false; this.weapons.setAds(false); document.exitPointerLock(); }
      else document.getElementById('title').classList.add('hidden');
      this.tacmap.open();
    }
  }

  _updateLoadoutLabel() {
    const m = document.getElementById('title-map'), d = document.getElementById('title-diff');
    if (m) m.textContent = MAPS[this.world.mapId].name;
    if (d) d.textContent = DIFFICULTIES[this.difficultyId].name;
  }
  _setMap(id) {
    if (!MAPS[id] || id === this.world.mapId) return;
    this.world.rebuild(id);
    this.player.reset();
    try { localStorage.setItem('verdant_map', id); } catch (_) {}
    this._updateLoadoutLabel();
  }
  _setDifficulty(id) {
    if (!DIFFICULTIES[id]) return;
    this.difficultyId = id;
    this.difficulty = DIFFICULTIES[id];
    try { localStorage.setItem('verdant_diff', id); } catch (_) {}
    this._updateLoadoutLabel();
  }
  _hideOverlays() { ['title', 'pause', 'gameover', 'shop', 'settings', 'mapselect'].forEach((id) => document.getElementById(id).classList.add('hidden')); }

  _syncWeaponHud() {
    const live = this.weapons.live;
    this.hud.setActiveWeapon(this.weapons.current);
    this.hud.setWeaponName(this.weapons.def.name, this.weapons.getLevel());
    this.hud.setAmmo(live.ammo, live.reserve);
  }

  start() {
    this.waves.reset();
    this.waves.difficulty = this.difficulty;
    this.player.reset();
    this.weapons.reset();
    this.pickups.reset();
    this._clearGrenades();
    this._clearEnemyShots();
    this.hud.showBoss(false);
    this.nades = 3;
    this.hud.setGrenades(this.nades);
    this.score = 0; this.kills = 0; this.streak = 0; this.firing = false; this.shake = 0;
    this._meleeCd = 0;
    this.credits = 0; this.creditMul = 1; this.lifesteal = 0;
    this.shop.reset();
    this.hud.setCredits(0);

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
    this.audio.startMusic();
    this.ach.playedMap(this.world.mapId);

    const n = this.waves.startNextWave();
    this._applyWaveStart(n, 'SURVIVE');
  }

  _applyWaveStart(n, sub = 'INCOMING') {
    this.hud.setWave(n);
    this.hud.popWave(n, this.waves.isBossWave ? '☠ BOSS WAVE ☠' : sub);
    this.audio.wave();
    this.audio.setIntensity(Math.min(1, 0.2 + n * 0.06 + (this.waves.isBossWave ? 0.35 : 0)));
    if (n >= 5) this.ach.unlock('wave5');
    if (n >= 10) this.ach.unlock('wave10');
    this._syncWeaponHud();
  }

  // wave cleared -> open the between-wave shop
  _openShop(clearedWave) {
    this.state = 'shop';
    this.firing = false;
    this.weapons.setAds(false);
    if (this.difficultyId === 'nightmare') this.ach.unlock('nightmare');
    const bonus = 100 + clearedWave * 50;
    this.credits += bonus;
    this.hud.setCredits(this.credits);
    this.hud.killFeed(`WAVE ${clearedWave} CLEARED  +${bonus}◈`);
    this.hud.popWave(clearedWave + 1, 'REARM');
    document.exitPointerLock();
    this.shop.open(clearedWave + 1);
  }

  _deployNextWave() {
    this.shop.close();
    // free per-wave resupply on top of anything bought
    this.player.addArmor(20);
    this.nades = Math.min(8, this.nades + 2);
    this.hud.setGrenades(this.nades);
    this.hud.setArmor(this.player.armor, this.player.maxArmor);
    const n = this.waves.startNextWave();
    this._applyWaveStart(n, 'INCOMING');
    this.state = 'playing';
    this.hud.show();
    this._requestLock();
  }

  _fire() {
    const shot = this.weapons.tryFire();
    if (!shot) {
      const live = this.weapons.live;
      if (live.ammo <= 0 && !this.weapons.reloading) this.audio.empty();
      return;
    }
    this.audio.shoot(this.weapons.def.key);
    this.player.addRecoil(shot.recoilPitch, shot.recoilYaw);
    this.shake = Math.min(0.5, this.shake + shot.def.kick * 1.2);

    const origin = new THREE.Vector3();
    this.camera.getWorldPosition(origin);
    const muzzle = new THREE.Vector3();
    this.weapons.muzzleWorldPos(muzzle);

    let anyHit = false, anyHead = false;
    const dmgMap = new Map(); // enemy -> {dmg, head, point} for one floating number per target
    for (const dir of shot.rays) {
      const enemyHit = this.waves.raycastRay(this.raycaster, origin, dir, shot.def.range);

      // ground / world endpoint for tracer + impact
      let endPoint, impactColor = 0xd8c79a;
      if (enemyHit) {
        endPoint = enemyHit.point; anyHit = true;
        const head = enemyHit.zone === 'head';
        if (head) anyHead = true;
        const base = shot.dmg * (head ? 2.5 : 1);
        enemyHit.enemy.hit(base, enemyHit.zone);
        const shown = base * (enemyHit.zone === 'shield' ? 0.15 : 1);
        const rec = dmgMap.get(enemyHit.enemy) || { dmg: 0, head: false, point: endPoint };
        rec.dmg += shown; rec.head = rec.head || head; dmgMap.set(enemyHit.enemy, rec);
        if (enemyHit.zone === 'shield') this.effects.impact(endPoint, 0xcfe6ff, false); // clang spark
        else this.effects.bloodBurst(endPoint);
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

    // floating damage numbers (one per enemy hit this shot)
    for (const [, rec] of dmgMap) {
      const s = this._toScreen(rec.point);
      if (s.visible) this.hud.damageNumber(s.x, s.y, rec.dmg, rec.head);
    }

    // muzzle smoke for the bigger guns
    if (shot.def.key === 'shotgun' || shot.def.key === 'sniper' || shot.def.key === 'lmg') {
      this.effects.smoke(muzzle, { color: 0x9a9a9a, size: 0.5, life: 0.5, rise: 0.8, opacity: 0.4 });
    }
    if (anyHit) this.hud.hitMarker();
    if (anyHead) { this.hud.popHeadshot(); this._pendingHeadshot = true; this.ach.unlock('headhunter'); }
  }

  _toScreen(v) {
    const p = v.clone().project(this.camera);
    return { x: (p.x * 0.5 + 0.5) * window.innerWidth, y: (-p.y * 0.5 + 0.5) * window.innerHeight, visible: p.z < 1 };
  }

  _melee() {
    if (this.state !== 'playing' || (this._meleeCd || 0) > 0) return;
    this._meleeCd = 0.55;
    this.weapons.playMelee();
    this.audio.melee();
    this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
    this.raycaster.far = 2.8;
    const hit = this.waves.raycast(this.raycaster);
    if (hit && hit.distance < 2.8) {
      hit.enemy.hit(5);
      this.effects.bloodBurst(hit.point);
      this.hud.hitMarker();
      this.shake = Math.min(0.5, this.shake + 0.15);
    }
  }

  // barrel hit from a bullet
  _explode(blast) { this.ach.unlock('demolition'); this._detonate(blast.x, blast.z, blast.radius || 7, 5, 20); }

  // general explosion: FX + AoE damage + barrel chain reaction
  _detonate(x, z, radius, enemyDmg = 6, playerMax = 24, _chained = false) {
    this.audio.explosion();
    this.shake = Math.min(0.9, this.shake + 0.5);
    this.effects.explosionFX(new THREE.Vector3(x, 1, z));
    this.postfx.pulseBloom(0.7);

    for (const e of this.waves.enemies) {
      if (e.dead) continue;
      const d = Math.hypot(e.group.position.x - x, e.group.position.z - z);
      if (d < radius) {
        e.hit(enemyDmg);
        this.effects.bloodHit(e.group.position.clone().add(new THREE.Vector3(0, 1, 0)));
      }
    }
    const pd = Math.hypot(this.player.position.x - x, this.player.position.z - z);
    if (pd < radius) {
      this.player.takeDamage(playerMax * (1 - pd / radius));
      this.hud.damageFlash();
      this._afterPlayerDamage();
    }

    // chain nearby explosive barrels (one hop)
    if (!_chained) {
      for (const b of this.world.chainBarrels(x, z, radius)) {
        this._detonate(b.x, b.z, b.radius, enemyDmg, playerMax, true);
      }
    }
  }

  _throwGrenade() {
    if (this.state !== 'playing' || this.nades <= 0) return;
    this.nades -= 1;
    this.hud.setGrenades(this.nades);
    this.audio.swap();
    const origin = new THREE.Vector3();
    this.camera.getWorldPosition(origin);
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    const mesh = new THREE.Mesh(this._nadeGeo, this._nadeMat);
    mesh.castShadow = true;
    mesh.position.copy(origin).addScaledVector(dir, 0.6);
    this.scene.add(mesh);
    const vel = dir.clone().multiplyScalar(22);
    vel.y += 4; // arc
    this.grenades.push({ mesh, vel, fuse: 1.7, spin: new THREE.Vector3(Math.random() * 6, Math.random() * 6, Math.random() * 6) });
  }

  _updateGrenades(dt) {
    for (let i = this.grenades.length - 1; i >= 0; i--) {
      const g = this.grenades[i];
      g.vel.y -= 24 * dt;
      const p = g.mesh.position;
      p.addScaledVector(g.vel, dt);
      g.mesh.rotation.x += g.spin.x * dt; g.mesh.rotation.y += g.spin.y * dt;
      // collide with ground / props
      if (p.y <= 0.2) { p.y = 0.2; g.vel.y *= -0.4; g.vel.x *= 0.55; g.vel.z *= 0.55; }
      const r = this.world.resolve(p.x, p.z, 0.2);
      if (r.x !== p.x || r.z !== p.z) { g.vel.x *= -0.4; g.vel.z *= -0.4; p.x = r.x; p.z = r.z; }
      g.fuse -= dt;
      if (g.fuse <= 0) {
        this.scene.remove(g.mesh);
        this.grenades.splice(i, 1);
        this._detonate(p.x, p.z, 8.5, 6, 30);
      }
    }
  }

  _clearGrenades() {
    for (const g of this.grenades) this.scene.remove(g.mesh);
    this.grenades = [];
  }

  _acquireShotMesh(boss) {
    if (!this._shotPool) this._shotPool = [];
    const mesh = this._shotPool.pop() || new THREE.Mesh(this._shotGeo, this._shotMat);
    mesh.material = boss ? this._shotMatBoss : this._shotMat;
    mesh.scale.setScalar(boss ? 1.6 : 1);
    mesh.visible = true;
    this.scene.add(mesh);
    return mesh;
  }
  _releaseShot(s, i) {
    this.scene.remove(s.mesh);
    if (this._shotPool.length < 40) this._shotPool.push(s.mesh);
    this.enemyShots.splice(i, 1);
  }

  _spawnEnemyShot(shot) {
    const mesh = this._acquireShotMesh(shot.boss);
    mesh.position.copy(shot.origin);
    this.enemyShots.push({ mesh, vel: shot.dir.clone().multiplyScalar(shot.speed), dmg: shot.dmg, life: 4, boss: shot.boss });
  }

  _updateEnemyShots(dt) {
    for (let i = this.enemyShots.length - 1; i >= 0; i--) {
      const s = this.enemyShots[i];
      const p = s.mesh.position;
      p.addScaledVector(s.vel, dt);
      s.life -= dt;
      const eye = this.camera.position;
      const hitPlayer = Math.hypot(p.x - eye.x, p.y - eye.y, p.z - eye.z) < 1.2;
      const hitGround = p.y <= 0.2;
      const hitWorld = (() => { const r = this.world.resolve(p.x, p.z, 0.2); return r.x !== p.x || r.z !== p.z; })();
      if (hitPlayer || hitGround || hitWorld || s.life <= 0) {
        if (hitPlayer) { this._onPlayerHit(s.dmg); }
        this.effects.impact(p.clone(), s.boss ? 0xff5030 : 0xd86bff, false);
        this._releaseShot(s, i);
      }
    }
  }

  _clearEnemyShots() {
    for (const s of this.enemyShots) { this.scene.remove(s.mesh); if (this._shotPool && this._shotPool.length < 40) this._shotPool.push(s.mesh); }
    this.enemyShots = [];
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
    const head = this._pendingHeadshot; this._pendingHeadshot = false;
    let pts = enemy.score;
    if (this.streak >= 3) pts += Math.min(200, this.streak * 15); // streak bonus
    if (head) pts += 75; // headshot bonus
    this.score += pts;
    this.hud.setScore(this.score);
    this.hud.setStreak(this.streak);
    if (!head) this.hud.popKill();
    this.hud.killFeed(`▸ ${enemy.type.toUpperCase()}${head ? ' ☠' : ''}  +${pts}`);
    this.audio.kill();
    // credits + lifesteal
    this.credits += Math.round(enemy.score * 0.12 * this.creditMul * this.difficulty.reward);
    this.hud.setCredits(this.credits);
    if (this.lifesteal > 0) {
      this.player.heal(this.lifesteal);
      this.hud.setHealth(this.player.hp, this.player.maxHp);
    }
    this.ach.unlock('firstblood');
    if (enemy.isBoss) this.ach.unlock('slayer');
    // weapon XP / leveling
    const newLvl = this.weapons.addXp(enemy.isBoss ? 200 : 20);
    if (newLvl) {
      this.hud.killFeed(`${this.weapons.def.name} → LV${newLvl}`);
      if (newLvl >= 5) this.ach.unlock('gunsmith');
      this._syncWeaponHud();
    }
    // exploders detonate on death
    if (enemy.explode) {
      this._detonate(enemy.group.position.x, enemy.group.position.z, 7, 6, 28);
    }
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
      this._pollGamepad();
      if (this.firing && (this.weapons.def.auto || !this._firedThisClick)) {
        const before = this.weapons.fireCd;
        if (before <= 0) {
          this._fire();
          if (!this.weapons.def.auto) this._firedThisClick = true;
        }
      }
      if (!this.firing) this._firedThisClick = false;

      if (this._meleeCd > 0) this._meleeCd -= dt;
      this.player.update(dt);
      this.weapons.update(dt);
      this.player.lookSensMul = this.weapons.ads ? 0.5 : 1;
      this.hud.setScope(this.weapons.def.key === 'sniper' && this.weapons.adsT > 0.6);

      const live = this.weapons.live;
      this.hud.setAmmo(live.ammo, live.reserve);
      this.hud.setReloading(this.weapons.reloading);

      this.waves.update(dt, this.player, this.camera, {
        onPlayerHit: (d) => this._onPlayerHit(d),
        onWaveCleared: (w) => this._openShop(w),
        onEnemyShoot: (s) => this._spawnEnemyShot(s),
        onSummon: (e) => { this.effects.smoke(e.group.position.clone().setY(1.2), { color: 0xc080ff, size: 1.0, life: 0.6, rise: 0.8, opacity: 0.6 }); this.audio.swap(); },
      });
      this.waves.removeDead((e) => this._onKill(e));
      this.hud.setEnemies(this.waves.remaining);

      // boss health bar
      const boss = this.waves.boss;
      if (boss && !boss.dead) { this.hud.showBoss(true); this.hud.setBoss(boss.hp, boss.maxHp); }
      else this.hud.showBoss(false);

      this._updateEnemyShots(dt);

      // regen-driven HUD refresh
      this.hud.setHealth(this.player.hp, this.player.maxHp);

      this.pickups.update(dt, this.player.position, (kind) => this._collect(kind));
      // water splash while wading & moving
      if (this.player.wading) {
        this._splashT = (this._splashT || 0) - dt;
        if (this._splashT <= 0) {
          const f = new THREE.Vector3(this.player.position.x, 0.25, this.player.position.z);
          this.effects.smoke(f, { color: 0xbfe6dd, size: 0.5, life: 0.5, rise: 0.5, opacity: 0.45 });
          this._splashT = 0.18;
        }
      }
      this._updateGrenades(dt);
      this.effects.update(dt, this.player.position);
      this.world.update(dt, this.camera);
      this.minimap.update(this.player, this.waves.enemies, this.pickups.items, this.world.lakes);

      // compass (player heading + threat pips)
      const items = [];
      for (const e of this.waves.enemies) {
        if (e.dead) continue;
        const dx = e.group.position.x - this.player.position.x, dz = e.group.position.z - this.player.position.z;
        items.push({ bearing: Math.atan2(dx, -dz), boss: e.isBoss });
      }
      this.hud.drawCompass(-this.player.yaw, items);

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
      this.world.update(dt, this.camera);
      this.effects.update(dt, this.camera.position);
    } else if (this.state === 'shop') {
      // keep the world alive behind the shop overlay
      this.world.update(dt, this.camera);
      this.effects.update(dt, this.player.position);
    }

    // tactical map renders in place of the 3D scene while open
    if (!document.getElementById('tacmap').classList.contains('hidden')) this.tacmap.draw();
    else this._render(dt);
  }

  _render(dt = 0.016) { this.postfx.render(dt); }
}

window.addEventListener('error', (e) => {
  const l = document.getElementById('loading');
  if (l && !l.classList.contains('hidden')) {
    l.querySelector('.loading-text').textContent = 'Failed to load: ' + e.message;
  }
});
new Game();
