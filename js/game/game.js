import * as THREE from 'three';
import { World, MAPS } from './world.js';
import { MapSelect, DIFFICULTIES } from './mapselect.js';
import { Missions } from './missions.js';
import { TacMap } from './tacmap.js';
import { Achievements } from './achievements.js';
import { CLASSES, Loadout } from './loadout.js';
import { Meta } from './meta.js';
import { PerksUI } from './perks.js';
import { Models } from './models.js';
import { setEnemyModelFactory, setEnemyModelsEnabled } from './enemy.js';
import { Net } from './net.js';
import { OnlineBoard } from './onlineboard.js';
import { Chat } from './chat.js';
import { Coop } from './coop.js';
import { CoopLobby } from './lobby.js';
import { Player } from './player.js';
import { WaveManager } from './enemy.js';
import { HUD } from './hud.js';
import { Audio } from './audio.js';
import { WeaponManager } from './weapons.js';
import { Effects } from './effects.js';
import { Pickups } from './pickups.js';
import { PostFX } from './postfx.js';
import { Minimap } from './minimap.js';
import { Settings } from './settings.js';
import { Shop } from './shop.js';
import { TouchControls } from './touch.js';
import { Vehicles } from './vehicles.js';
import { Cheats } from './cheats.js';
import { Cinematic } from './cinematic.js';

const BASE_FOV = 75;

class Game {
  constructor() {
    this.canvas = document.getElementById('scene');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' });
    // cap device pixel ratio (retina screens render 4x the pixels at DPR 2 — the
    // single biggest GPU cost). 1.5 is visually near-identical but much faster.
    this._maxDPR = Math.min(window.devicePixelRatio || 1, 1.5);
    this._dpr = this._maxDPR;
    this.renderer.setPixelRatio(this._dpr);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;   // cheaper than PCFSoft
    this._perfMs = 16; this._dprT = 0;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(BASE_FOV, 1, 0.1, 600);
    this.scene.add(this.camera);

    let savedMap = 'plains', savedDiff = 'veteran';
    try { savedMap = localStorage.getItem('verdant_map') || 'plains'; savedDiff = localStorage.getItem('verdant_diff') || 'veteran'; } catch (_) {}
    this.difficultyId = DIFFICULTIES[savedDiff] ? savedDiff : 'veteran';
    this.difficulty = DIFFICULTIES[this.difficultyId];
    let savedClass = 'assault', savedAtt = {};
    try { savedClass = localStorage.getItem('verdant_class') || 'assault'; savedAtt = JSON.parse(localStorage.getItem('verdant_attachments') || '{}'); } catch (_) {}
    this.classId = CLASSES[savedClass] ? savedClass : 'assault';
    this.attachments = (savedAtt && typeof savedAtt === 'object') ? savedAtt : {};
    this.headMul = 2.5;
    this.medicHealMul = 1;
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
    this.coopMode = false;   // shared-waves co-op (single-player never sets these)
    this.coopHost = false;
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
    this.missions = new Missions(this);
    this.tacmap = new TacMap(this);
    this.ach = new Achievements();
    this.loadout = new Loadout(this);
    this.meta = new Meta();          // account-level XP / perks (persistent)
    this.perksUI = new PerksUI(this);
    // optional online layer — single-player never depends on it
    this.net = new Net();
    this.net.onState((s) => this._updateNetPill(s));
    this.board = new OnlineBoard(this);
    this.chat = new Chat(this);
    this.coop = new Coop(this);
    this.coopLobby = new CoopLobby(this);
    this.touch = new TouchControls(this);
    this.vehicles = new Vehicles(this);
    this.cheats = new Cheats(this);
    this.cinematic = new Cinematic(this);
    this.cinematicEnabled = true;
    this.godmode = false;
    this.cheatArsenal = false;
    this.speedRun = false;
    this.thirdPerson = false;
    this._tpBody = this._buildPlayerBody();
    this._tpBody.visible = false;
    this.scene.add(this._tpBody);
    // optional: swap the boxy third-person body for the rigged soldier model
    // when it loads (graceful fallback to the box body if it can't).
    this.models = new Models();
    this.models.load('soldier', 'assets/models/soldier.glb').then((m) => {
      if (!m) return;
      this._setupSoldierBody();
      // let the (humanoid) enemies wear the soldier model too
      const h = this.models.height('soldier') || 1.8;
      setEnemyModelFactory((targetH) => this.models.cloneGroup('soldier', targetH / h));
      if (this.settings) setEnemyModelsEnabled(this.settings.v.detailedEnemies !== false);
    });
    // persistent loot inventory (meat eaten to heal; hides/feathers/fangs traded)
    const INV0 = { meat: 0, hide: 0, feather: 0, fang: 0 };
    try { this.inventory = { ...INV0, ...JSON.parse(localStorage.getItem('verdant_inventory') || '{}') }; } catch (_) { this.inventory = { ...INV0 }; }
    // wolves can bite the player (predator wildlife)
    this.world.onCritterBite = (d) => { if (this.state === 'playing' && !this.vehicles.isMounted()) this._onPlayerHit(d); };
    this._updateLoadoutLabel();
    this._updateContinueUI();

    // crisp UI click on any menu button / card (first click also unlocks audio)
    document.addEventListener('pointerdown', (e) => {
      if (e.target && e.target.closest && e.target.closest('.btn, .map-card, .mtile, .diff-btn, .lo-chip, .olb-filter, .lb-tab, .nav a, .set-toggle')) {
        try { this.audio.ui('click'); } catch (_) {}
      }
    }, true);

    this.clock = new THREE.Clock();
    this._resize();
    this._bindUI();
    this._bindInput();
    window.addEventListener('resize', () => this._resize());

    requestAnimationFrame(() => {
      document.getElementById('loading').classList.add('hidden');
      this._render();
      this._startIntro();
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
    const cont = document.getElementById('continue-btn');
    if (cont) cont.addEventListener('click', () => this.start(this.missions.maxWave()));
    const contOver = document.getElementById('continue-btn-over');
    if (contOver) contOver.addEventListener('click', () => this.start(this.missions.maxWave()));
    const missBtn = document.getElementById('missions-btn');
    if (missBtn) missBtn.addEventListener('click', () => this.missions.open());
    document.getElementById('resume-btn').addEventListener('click', () => this._requestLock());
    document.getElementById('mapselect-btn').addEventListener('click', () => this.mapSelect.open());
    document.getElementById('loadout-btn').addEventListener('click', () => this.loadout.open());
    document.getElementById('perks-btn').addEventListener('click', () => this.perksUI.open());
    document.getElementById('leaderboard-btn').addEventListener('click', () => this.board.open());
    document.getElementById('coop-btn').addEventListener('click', () => this.coopLobby.open());
    document.getElementById('open-map').addEventListener('click', () => this._toggleMap());
    document.getElementById('chat-toggle').addEventListener('click', () => this.chat.toggle());
    // tactical map / chat toggles work from title and in a match
    document.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      if (e.code === 'KeyM' && (this.state === 'playing' || this.state === 'map' || this.state === 'title')) this._toggleMap();
      if (e.code === 'KeyY') this.chat.toggle();
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
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      if (this.state !== 'playing') return;
      this.player.onKey(e.code, true);
      if (e.code === 'KeyE') this.vehicles.toggleMount();
      if (this.vehicles.isMounted()) return; // driving — gun keys disabled
      if (e.code === 'Space') { e.preventDefault(); if (this.player.jump()) this.audio.jump(); }
      if (e.code === 'KeyT') this._toggleThirdPerson();
      if (e.code === 'KeyR' && this.weapons.reload()) this.audio.reload();
      if (e.code === 'KeyG') this._throwGrenade();
      if (e.code === 'KeyV' || e.code === 'KeyF') this._melee();
      if (e.code === 'KeyB') this._eatMeat();   // (C is now crouch)
      // weapon switch via number keys (0 = secret slot, e.g. the rocket)
      const m = /^Digit([0-9])$/.exec(e.code);
      if (m) {
        const dn = parseInt(m[1], 10);
        const key = this.weapons.order[dn === 0 ? 9 : dn - 1];
        if (key && this.weapons.switchTo(key)) { this.audio.swap(); this._syncWeaponHud(); }
      }
    });
    document.addEventListener('keyup', (e) => {
      if (this.state === 'playing') this.player.onKey(e.code, false);
    });

    document.addEventListener('mousemove', (e) => {
      if (this.state === 'playing' && document.pointerLockElement) {
        this.player.addLook(e.movementX, e.movementY);
        const fl = this._frameLook || (this._frameLook = { x: 0, y: 0 });
        fl.x += e.movementX; fl.y += e.movementY;
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
          this.audio.setMuffle(false);     // un-muffle on resume
        }
      } else if (this.state === 'playing') {
        this.state = 'paused';
        this.firing = false;
        this.weapons.setAds(false);
        this.audio.setMuffle(true);        // low-pass "muffle" the whole mix while paused
        document.getElementById('pause').classList.remove('hidden');
      }
    });
  }

  _requestLock() { this.canvas.requestPointerLock(); }

  // simple low-poly soldier body for the third-person camera
  _buildPlayerBody() {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x4a6b2a, roughness: 0.8, flatShading: true });
    const dark = new THREE.MeshStandardMaterial({ color: 0x2a3a18, roughness: 0.9, flatShading: true });
    const add = (geo, m, x, y, z) => { const me = new THREE.Mesh(geo, m); me.position.set(x, y, z); me.castShadow = true; g.add(me); return me; };
    add(new THREE.BoxGeometry(0.6, 0.42, 0.4), dark, 0, 0.95, 0);        // pelvis
    add(new THREE.BoxGeometry(0.7, 0.8, 0.42), mat, 0, 1.45, 0);         // torso
    add(new THREE.BoxGeometry(0.9, 0.22, 0.42), mat, 0, 1.8, 0);         // shoulders
    add(new THREE.BoxGeometry(0.42, 0.42, 0.42), mat, 0, 2.12, 0);       // head
    [-0.13, 0.13].forEach((ex) => add(new THREE.BoxGeometry(0.09, 0.07, 0.05), new THREE.MeshBasicMaterial({ color: 0xffdd33 }), ex, 2.13, 0.22));
    [-1, 1].forEach((s) => add(new THREE.BoxGeometry(0.18, 0.7, 0.2), dark, s * 0.46, 1.45, 0.06)); // arms
    [-1, 1].forEach((s) => add(new THREE.BoxGeometry(0.22, 0.85, 0.24), dark, s * 0.18, 0.5, 0));   // legs
    return g;
  }
  // build the rigged soldier as the third-person avatar (replaces the box body)
  _setupSoldierBody() {
    try {
      const h = this.models.height('soldier') || 1.8;
      const inst = this.models.instance('soldier', 1.8 / h);   // scale to ~1.8m tall
      if (!inst) return;
      inst.group.visible = false;
      this.scene.add(inst.group);
      this._tpModel = inst;
      try { inst.play('Armature|Standing', 0); } catch (_) {}
      // retire the placeholder box body
      if (this._tpBody) { this._tpBody.visible = false; this.scene.remove(this._tpBody); }
    } catch (e) { console.warn('[soldier] setup failed, keeping box body:', e); this._tpModel = null; }
  }
  _activeBody() { return this._tpModel ? this._tpModel.group : this._tpBody; }

  _toggleThirdPerson() {
    this.thirdPerson = !this.thirdPerson;
    try { this.settings.v.thirdPerson = this.thirdPerson; this.settings.save(); } catch (_) {}
    this.hud.killFeed(this.thirdPerson ? 'THIRD-PERSON' : 'FIRST-PERSON');
  }
  // chase cam: keep the camera's look direction, pull it back behind the body.
  // `blend` (0..1) eases the pull-back so the toggle is a smooth dolly, not a cut.
  _applyThirdPerson(blend = 1) {
    const p = this.player, cam = this.camera;
    const body = this._activeBody();
    if (body) {
      body.position.set(p.position.x, p.position.y, p.position.z);
      body.rotation.y = p.yaw + (this._tpModel ? Math.PI : 0); // model faces +Z; flip to look forward
    }
    if (this._tpModel) this._tpModel.update(this._lastDt || 0.016);
    const fwd = new THREE.Vector3(); cam.getWorldDirection(fwd);
    cam.position.addScaledVector(fwd, -4.6 * blend); cam.position.y += 0.7 * blend;
  }

  _updateNetPill(s) {
    const el = document.getElementById('netpill'); if (!el) return;
    el.className = 'netpill ' + s;
    document.getElementById('netpill-text').textContent = s.toUpperCase();
  }

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
    const m = document.getElementById('title-map'), d = document.getElementById('title-diff'), c = document.getElementById('title-class');
    if (m) m.textContent = MAPS[this.world.mapId].name;
    if (d) d.textContent = DIFFICULTIES[this.difficultyId].name;
    if (c) c.textContent = CLASSES[this.classId].name;
    if (this.missions) this._updateContinueUI(); // progress is per map+difficulty
  }
  _setClass(id) {
    if (!CLASSES[id]) return;
    this.classId = id;
    try { localStorage.setItem('verdant_class', id); } catch (_) {}
    this._updateLoadoutLabel();
  }
  _toggleAttachment(wk, aid) {
    const list = this.attachments[wk] || (this.attachments[wk] = []);
    const i = list.indexOf(aid);
    if (i >= 0) list.splice(i, 1);
    else { if (list.length >= 2) list.shift(); list.push(aid); } // cap 2
    try { localStorage.setItem('verdant_attachments', JSON.stringify(this.attachments)); } catch (_) {}
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
  _hideOverlays() { ['title', 'pause', 'gameover', 'shop', 'settings', 'mapselect', 'missions', 'loadout', 'perks', 'online-lb', 'coop'].forEach((id) => document.getElementById(id).classList.add('hidden')); }

  // ---- cinematic studio intro (plays once on load) ----
  _startIntro() {
    const el = document.getElementById('intro');
    if (!el) return;
    if (!this.cinematicEnabled) { el.classList.add('hidden'); return; }
    const studio = el.querySelector('.intro-studio');
    const logo = el.querySelector('.intro-logo');
    el.classList.remove('hidden');
    const skip = () => this._skipIntro();
    this._introSkip = skip;
    el.addEventListener('click', skip);
    window.addEventListener('keydown', skip, { once: true });
    // staged timeline (ms)
    this._introTimers = [
      setTimeout(() => studio.classList.add('show'), 250),
      setTimeout(() => studio.classList.remove('show'), 2200),
      setTimeout(() => logo.classList.add('show'), 2600),
      setTimeout(() => el.classList.add('fade'), 4200),
      setTimeout(() => el.classList.add('hidden'), 4900),
    ];
  }
  _skipIntro() {
    const el = document.getElementById('intro');
    if (!el || el.classList.contains('hidden')) return;
    (this._introTimers || []).forEach(clearTimeout);
    el.classList.add('fade');
    setTimeout(() => el.classList.add('hidden'), 500);
  }

  // show/hide the Continue (checkpoint) buttons on title + game-over
  _updateContinueUI() {
    const has = this.missions.hasProgress();
    const w = this.missions.maxWave();
    ['continue-btn', 'continue-btn-over'].forEach((btnId) => {
      const btn = document.getElementById(btnId);
      if (!btn) return;
      btn.classList.toggle('hidden', !has);
      const span = btn.querySelector('span');
      if (span) span.textContent = w;
    });
  }

  _syncWeaponHud() {
    const live = this.weapons.live;
    this.hud.setActiveWeapon(this.weapons.current);
    this.hud.setWeaponName(this.weapons.def.name, this.weapons.getLevel());
    this.hud.setAmmo(live.ammo, live.reserve);
  }
  _rebuildWeaponSlots() {
    this.hud.buildWeaponSlots(this.weapons.order, this.weapons.allDefs(), this.weapons.current);
  }

  start(startWave = 1, opts = {}) {
    startWave = Math.max(1, Math.floor(startWave) || 1);
    this.startWave = startWave;
    this.coopMode = !!opts.coop;
    this.coopHost = !!opts.host;
    this.pvpMode = !!opts.pvp;
    this.waves.reset();
    this.waves.difficulty = this.difficulty;
    this.player.reset();
    // apply class + attachments to the per-run weapon stats, then reset ammo
    this.classMods = CLASSES[this.classId];
    this.weapons.configure(this.attachments, this.classMods);
    this.weapons.reset();
    this.pickups.reset();
    this.vehicles.reset();
    this.godmode = false; this.cheatArsenal = false; this.speedRun = false;
    this.world._combatActive = true; // predators (wolves) hunt during a run
    this._clearGrenades();
    this._clearEnemyShots();
    this.hud.showBoss(false);
    this.nades = 3;
    this.hud.setGrenades(this.nades);
    this.score = 0; this.kills = 0; this.streak = 0; this.firing = false; this.shake = 0;
    this._meleeCd = 0;
    this.headMul = 2.5; this.medicHealMul = 1;
    this.credits = 0; this.creditMul = 1; this.lifesteal = 0;
    this.xpMul = 1; this.stealthPerk = 0; this._runXp = 0;
    // class-level bonuses (player/game)
    if (this.classMods && this.classMods.apply) this.classMods.apply(this);
    // account-level perks stack on top of the class
    if (this.meta && !this.coopMode && !this.pvpMode) this.meta.apply(this);
    this.shop.reset();
    // resuming mid-campaign from a checkpoint: hand out a credit head-start so
    // the player can rearm to match the wave they're dropping into.
    if (startWave > 1) { this.credits = (startWave - 1) * 60; }
    this.hud.setCredits(this.credits);

    this.hud.setScore(0);
    this.hud.setHealth(this.player.hp, this.player.maxHp);
    this.hud.setArmor(this.player.armor, this.player.maxArmor);
    this.hud.setStreak(0);
    this._rebuildWeaponSlots();
    this._syncWeaponHud();
    this.hud.setMeat(this.inventory.meat || 0);

    this._hideOverlays();
    this.hud.show();
    this._requestLock();
    this.audio._ensure();
    this.audio.startMusic();
    this.ach.playedMap(this.world.mapId);
    // brief cinematic drop-in (skipped in co-op so the squad stays in sync)
    if (this.cinematicEnabled && !this.coopMode) this._beginDeploy();
    else this.state = 'playing';

    if (this.pvpMode) {
      // PvP arena: no enemies — players fight each other.
      this.world._combatActive = false;
      this.hud.setWave('PvP'); this.hud.killFeed('⚔ PVP ARENA — frag the squad!'); this.audio.wave();
    } else if (this.coopMode && !this.coopHost) {
      // co-op client: the host runs the wave sim; we mirror ghost enemies.
      this.coop.clearGhosts();
      this.hud.setWave(1); this.hud.popWave(1, 'CO-OP'); this.audio.wave();
    } else {
      if (this.coopMode) this.coop.clearGhosts();
      this.waves.wave = startWave - 1; // startNextWave() bumps to startWave
      const n = this.waves.startNextWave();
      this._applyWaveStart(n, startWave > 1 ? 'CHECKPOINT' : (this.coopMode ? 'CO-OP' : 'SURVIVE'));
    }
  }

  // short camera sweep from the sky down to the player when a run begins
  _beginDeploy() {
    const p = this.player;
    const fwd = new THREE.Vector3(-Math.sin(p.yaw), 0, -Math.cos(p.yaw));
    this._depT = 0;
    this._depStart = new THREE.Vector3(p.position.x - fwd.x * 10, p.position.y + 24, p.position.z - fwd.z * 10);
    this._depEnd = new THREE.Vector3(p.position.x, p.position.y + p.eyeHeight, p.position.z);
    this._depLook0 = new THREE.Vector3(p.position.x, p.position.y + 1, p.position.z);
    this._depLook1 = this._depEnd.clone().add(fwd.clone().multiplyScalar(20));
    this.state = 'deploy';
    this.audio.wave();
  }
  _updateDeploy(dt) {
    this._depT += dt;
    const k = Math.min(1, this._depT / 1.7);
    const e = k * k * (3 - 2 * k);
    this.camera.position.lerpVectors(this._depStart, this._depEnd, e);
    this.camera.lookAt(this._depLook0.clone().lerp(this._depLook1, e));
    this.world.update(dt, this.camera);
    this.effects.update(dt, this.player.position);
    if (k >= 1) this.state = 'playing';
  }

  // ---- co-op deploy / lifecycle (gated; single-player never reaches here) ----
  startCoop() {
    if (!this.coop.active) { this.start(); return; } // not in a room → solo
    if (this.coop.isHost()) {
      // pull the whole squad into a match on our battlefield
      this.net.sendCoopEvent({ ev: 'start', map: this.world.mapId, diff: this.difficultyId });
      this.start(1, { coop: true, host: true });
    } else {
      // wait for the host's start event; show a holding state on the title
      this._coopWaiting = true;
      this.hud.killFeed && this.hud.killFeed('Waiting for host to deploy…');
    }
  }
  _coopClientStart(m) {
    this._coopWaiting = false;
    if (m.map && m.map !== this.world.mapId) this._setMap(m.map);
    if (m.diff && m.diff !== this.difficultyId) this._setDifficulty(m.diff);
    this.start(1, { coop: true, host: false });
  }
  _coopRemoteOver() {
    if (!this.coopMode || this.coopHost) return;
    this.hud.killFeed('Host fell — match over');
    this._gameOver();
  }

  // ---- PvP arena (experimental; reuses the co-op avatar sync) ----
  startPvp() {
    if (!this.coop.active) { this.hud && this.hud.killFeed && this.hud.killFeed('PvP needs a squad — Quick Match or join a room'); return; }
    this.frags = {};
    if (this.coop.isHost()) {
      this.net.sendCoopEvent({ ev: 'pvpstart', map: this.world.mapId });
      this.start(1, { pvp: true });
    } else { this._coopWaiting = true; this.hud.killFeed && this.hud.killFeed('Waiting for host to start PvP…'); }
  }
  _pvpClientStart(m) {
    this._coopWaiting = false;
    if (m.map && m.map !== this.world.mapId) this._setMap(m.map);
    this.frags = {};
    this.start(1, { pvp: true });
  }
  _pvpName(id) {
    if (id === this.coop.myId) return this.net.name + ' (you)';
    const a = this.coop.peers.get(id); return a ? a.name : 'player ' + id;
  }
  _onPvpHit(d, byId) {
    if (this.godmode || !this.pvpMode) return;
    this.player.takeDamage(d); this.hud.damageFlash(); this.audio.hurt();
    this.hud.setHealth(this.player.hp, this.player.maxHp);
    this.hud.setArmor(this.player.armor, this.player.maxArmor);
    if (this.player.hp <= 0) { this.coop.broadcastFrag(byId); this.hud.killFeed(`☠ ${this._pvpName(byId)} fragged you`); this._pvpRespawn(); }
  }
  _onPvpFrag(by, victim) {
    this.frags = this.frags || {};
    this.frags[by] = (this.frags[by] || 0) + 1;
    if (by !== this.coop.myId) this.hud.killFeed(`▸ ${this._pvpName(by)} fragged ${this._pvpName(victim)}  (${this.frags[by]})`);
    else this.hud.popKill();
  }
  _pvpRespawn() {
    const a = Math.random() * Math.PI * 2, d = 20 + Math.random() * 20;
    this.player.position.set(Math.cos(a) * d, 0, Math.sin(a) * d);
    this.player.hp = this.player.maxHp; this.player.armor = 0; this.player.vy = 0;
    this.hud.setHealth(this.player.hp, this.player.maxHp);
    this.hud.killFeed('↻ RESPAWN');
  }

  _applyWaveStart(n, sub = 'INCOMING') {
    this.missions.reached(n); // unlock this wave / advance the checkpoint
    this.hud.setWave(n);
    this.hud.popWave(n, this.waves.isBossWave ? '☠ BOSS WAVE ☠' : sub);
    this.audio.wave();
    this.audio.announce('wave');
    this.audio.setIntensity(Math.min(1, 0.2 + n * 0.06 + (this.waves.isBossWave ? 0.35 : 0)));
    this.audio.setMusicState(this.waves.isBossWave ? 'boss' : 'combat');
    if (n >= 5) this.ach.unlock('wave5');
    if (n >= 10) this.ach.unlock('wave10');
    this._syncWeaponHud();
  }

  // wave cleared -> open the between-wave shop
  // last enemy of a wave fell: a beat of slow-mo before the shop opens
  _onWaveCleared(w) {
    if (this._pendingShopWave != null) return;   // already handling this clear
    this._triggerKillCam();
    this._awardXp(w * 15);                        // wave-clear XP bonus
    this.audio.setMusicState('calm');
    this._pendingShopWave = w;
    setTimeout(() => {
      if (this.state === 'playing' && this._pendingShopWave != null) {
        const ww = this._pendingShopWave; this._pendingShopWave = null; this._openShop(ww);
      }
    }, 950);
  }

  _openShop(clearedWave) {
    this.audio.setMusicState('calm');
    // co-op: no shop (it would desync the squad) — free resupply and roll on
    if (this.coopMode) {
      this.credits += 100 + clearedWave * 50;
      this.hud.setCredits(this.credits);
      this.hud.killFeed(`WAVE ${clearedWave} CLEARED — REGROUP`);
      this._deployNextWave();
      return;
    }
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
    // gunfire is loud: it alerts nearby enemies (ends stealth)
    if (!this.pvpMode && this.waves.alertNear) this.waves.alertNear(this.player.position, 34);

    const origin = new THREE.Vector3();
    this.camera.getWorldPosition(origin);
    const muzzle = new THREE.Vector3();
    this.weapons.muzzleWorldPos(muzzle);

    // PvP: shots resolve against other players' avatars, reported over the relay
    if (this.pvpMode) {
      let anyHit = false;
      for (const dir of shot.rays) {
        const hit = this.coop.raycastPeers(this.raycaster, origin, dir, shot.def.range);
        let endPoint;
        if (hit) { endPoint = hit.point; anyHit = true; this.coop.sendPvpHit(hit.id, Math.round(shot.dmg * 12)); this.effects.bloodBurst(endPoint); }
        else {
          let t = dir.y < -0.001 ? -origin.y / dir.y : shot.def.range; t = Math.min(t, shot.def.range);
          endPoint = origin.clone().add(dir.clone().multiplyScalar(t));
          this.effects.impact(endPoint, 0xd8c79a, false);
        }
        this.effects.tracer(muzzle, endPoint, shot.def.tracer);
      }
      if (anyHit) this.hud.hitMarker();
      return;
    }

    // secret rocket launcher: fire an explosive projectile instead of hitscan
    if (this.weapons.def.key === 'rocket') {
      const rdir = new THREE.Vector3(); this.camera.getWorldDirection(rdir);
      this.vehicles.launchOrdnance('rocket', muzzle, rdir);
      this.shake = Math.min(0.6, this.shake + 0.25);
      return;
    }

    // co-op client: enemies are host-owned "ghosts"; hits are reported, not applied
    const clientCoop = this.coopMode && !this.coopHost;
    let anyHit = false, anyHead = false;
    const dmgMap = new Map(); // enemy -> {dmg, head, point} for one floating number per target
    for (const dir of shot.rays) {
      const enemyHit = clientCoop
        ? this.coop.raycastGhosts(this.raycaster, origin, dir, shot.def.range)
        : this.waves.raycastRay(this.raycaster, origin, dir, shot.def.range);

      // ground / world endpoint for tracer + impact
      let endPoint, impactColor = 0xd8c79a;
      if (enemyHit) {
        endPoint = enemyHit.point; anyHit = true;
        const head = enemyHit.zone === 'head';
        if (head) anyHead = true;
        if (clientCoop) {
          // report the hit to the host (authoritative damage + score)
          this.coop.sendHit(enemyHit.enemy.id, shot.dmg, head);
          if (enemyHit.zone === 'shield') this.effects.impact(endPoint, 0xcfe6ff, false);
          else this.effects.bloodBurst(endPoint);
        } else {
          // stealth bonus: an unaware enemy takes a heavy opening-shot multiplier
          const sneak = (!enemyHit.enemy.alerted && !enemyHit.enemy.isBoss) ? 2.5 : 1;
          const base = shot.dmg * (head ? this.headMul : 1) * sneak;
          enemyHit.enemy.hit(base, enemyHit.zone);
          const shown = base * (enemyHit.zone === 'shield' ? 0.15 : 1);
          const rec = dmgMap.get(enemyHit.enemy) || { dmg: 0, head: false, point: endPoint };
          rec.dmg += shown; rec.head = rec.head || head; dmgMap.set(enemyHit.enemy, rec);
          if (enemyHit.zone === 'shield') this.effects.impact(endPoint, 0xcfe6ff, false); // clang spark
          else this.effects.bloodBurst(endPoint);
        }
      } else {
        // nearest of: enemy base core, a huntable animal, else the ground
        const bp = this.world.baseHitPoint(origin, dir);
        const ah = (this.world._critters && this.world._critters.raycastAnimal(this.raycaster, origin, dir, shot.def.range)) || null;
        const baseD = bp ? bp.distance : Infinity;
        const animD = ah ? ah.distance : Infinity;
        if (bp && baseD <= animD && baseD < shot.def.range) {
          endPoint = bp.point; anyHit = true;
          if (this.world.damageBase(shot.dmg * 6)) this._onBaseDestroyed();
          this.effects.impact(endPoint, 0xff7040, false);
        } else if (ah && animD < shot.def.range) {
          endPoint = ah.point; anyHit = true;
          this.effects.bloodBurst(endPoint);
          const res = this.world._critters.damageAnimal(ah.animal, shot.dmg);
          if (res && res.killed) this._onAnimalKilled(res.pos, res.drops);
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
    if (pd < radius && !this.godmode) {
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
        if (hitPlayer) { this._onPlayerHit(s.dmg, p); }
        this.effects.impact(p.clone(), s.boss ? 0xff5030 : 0xd86bff, false);
        this._releaseShot(s, i);
      }
    }
  }

  _clearEnemyShots() {
    for (const s of this.enemyShots) { this.scene.remove(s.mesh); if (this._shotPool && this._shotPool.length < 40) this._shotPool.push(s.mesh); }
    this.enemyShots = [];
  }

  _onPlayerHit(dmg, srcPos) {
    if (this.godmode) return;
    this.player.takeDamage(dmg);
    this.hud.damageFlash();
    // directional "screen-space damage" indicator pointing at the source
    let src = srcPos;
    if (!src) {                       // melee / unknown -> nearest live enemy
      let best = 1e9;
      for (const e of this.waves.enemies) {
        if (e.dead) continue;
        const dx = e.group.position.x - this.player.position.x, dz = e.group.position.z - this.player.position.z;
        const d2 = dx * dx + dz * dz; if (d2 < best) { best = d2; src = e.group.position; }
      }
    }
    if (src) {
      const dx = src.x - this.player.position.x, dz = src.z - this.player.position.z;
      this.hud.hitDirection(Math.atan2(dx, -dz) + this.player.yaw);
    }
    this.audio.hurt();
    this._afterPlayerDamage();
  }

  // brief slow-mo + cold cinematic grade on a climactic kill (boss / wave clear)
  _triggerKillCam() {
    this._kcDur = 1.0;
    this._kcT = this._kcDur;
    try { this.audio.duck(0.3, 0.9); } catch (_) {}
  }

  // award meta-progression XP (single-player only); announces level-ups
  _awardXp(amount) {
    if (!this.meta || this.coopMode || this.pvpMode) return;
    amount = Math.round(amount * (this.xpMul || 1));
    if (amount <= 0) return;
    this._runXp = (this._runXp || 0) + amount;
    const r = this.meta.addXp(amount);
    if (r.leveledUp) {
      this.hud.killFeed(`★ LEVEL UP — LV ${r.level} · perk point earned`);
      try { this.audio.announce('streak', 5); } catch (_) {}
    }
  }

  _afterPlayerDamage() {
    this.streak = 0;
    this.hud.setStreak(0);
    this.hud.setHealth(this.player.hp, this.player.maxHp);
    this.hud.setArmor(this.player.armor, this.player.maxArmor);
    if (this.player.hp <= 0 && this.state === 'playing') this._gameOver();
  }

  // named-boss ground-slam shockwave: radial blast that hits the player in range
  _enemyShockwave(sw) {
    const center = new THREE.Vector3(sw.x, 0.4, sw.z);
    try { this.effects.explosionFX(center); } catch (_) {}
    this.shake = Math.max(this.shake, 0.9);
    this.audio.explosion();
    if (this.godmode || this.vehicles.isMounted()) return;
    const dx = this.player.position.x - sw.x, dz = this.player.position.z - sw.z;
    const d = Math.hypot(dx, dz);
    if (d < sw.radius) this._onPlayerHit(sw.dmg * (1 - d / sw.radius), center);
  }

  // named-boss phase escalation feedback
  _onBossPhase(enemy, phase) {
    const msg = phase === 3 ? 'ENRAGED' : phase === 2 ? 'SUMMONING' : '';
    if (msg) { this.hud.killFeed(`⚠ ${enemy.named || 'BOSS'} — ${msg}`); this.audio.voice('boss'); this.postfx.pulseBloom(0.8); this.shake = Math.max(this.shake, 0.5); }
  }

  // throttled enemy voice barks as they close in (bosses roar)
  _enemyBark(enemy) {
    const now = performance.now ? performance.now() : Date.now();
    if (enemy.isBoss) {
      if (now - (this._lastRoar || -9999) < 4000) return;
      this._lastRoar = now;
      this.audio.voice('boss');
      return;
    }
    if (now - (this._lastTaunt || -9999) < 2600) return; // avoid a wall of shouting
    this._lastTaunt = now;
    this.audio.voice('taunt');
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
    if ([3, 5, 7, 10, 15, 20].includes(this.streak)) this.audio.announce('streak', this.streak);
    this._awardXp(enemy.score / 10);             // meta XP per kill (scaled by enemy worth)
    if (enemy.isBoss) this._triggerKillCam();   // climactic boss kill -> slow-mo
    if (!head) this.hud.popKill();
    this.hud.killFeed(`▸ ${enemy.type.toUpperCase()}${head ? ' ☠' : ''}  +${pts}`);
    this.audio.kill();
    // throttled death scream (boss always wails); keeps kills visceral, not noisy
    const now = performance.now ? performance.now() : Date.now();
    if (enemy.isBoss) { this.audio.voice('scream'); this._lastScream = now; }
    else if (now - (this._lastScream || -9999) > 900 && Math.random() < 0.55) {
      this._lastScream = now; this.audio.voice('scream');
    }
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

  // ---- loot / inventory (hunted-animal meat, eaten to heal) ----
  _saveInventory() { try { localStorage.setItem('verdant_inventory', JSON.stringify(this.inventory)); } catch (_) {} }
  _onAnimalKilled(pos, drops) {
    const meat = (drops && drops.meat) || 1;
    for (let i = 0; i < meat; i++) { const a = Math.random() * 6.283; this.pickups.spawn('meat', { x: pos.x + Math.cos(a) * 0.6, z: pos.z + Math.sin(a) * 0.6 }); }
    if (drops && drops.loot) this.pickups.spawn(drops.loot, pos);
    this.hud.killFeed('▸ ANIMAL DOWNED — loot dropped');
    this.audio.kill();
  }
  _eatMeat() {
    if ((this.inventory.meat || 0) <= 0) return;
    if (this.player.hp >= this.player.maxHp) { this.hud.killFeed('Already at full health'); return; }
    this.inventory.meat -= 1; this._saveInventory();
    this.player.heal(30 * (this.medicHealMul || 1));
    this.hud.setHealth(this.player.hp, this.player.maxHp);
    this.hud.setMeat(this.inventory.meat);
    this.hud.killFeed('🍖 ATE MEAL  +30 HP');
    this.audio.pickup();
  }

  _collect(kind) {
    this.audio.pickup();
    if (kind === 'health') { this.player.heal(35 * this.medicHealMul); this.hud.killFeed('+ MEDKIT'); }
    else if (kind === 'armor') { this.player.addArmor(50); this.hud.killFeed('+ ARMOR'); }
    else if (kind === 'ammo') { this.weapons.addAmmo(0.4); this.hud.killFeed('+ AMMO'); }
    else if (kind === 'meat') { this.inventory.meat = (this.inventory.meat || 0) + 1; this._saveInventory(); this.hud.setMeat(this.inventory.meat); this.hud.killFeed('🍖 + MEAT'); }
    else if (kind === 'hide' || kind === 'feather' || kind === 'fang') { this.inventory[kind] = (this.inventory[kind] || 0) + 1; this._saveInventory(); this.hud.killFeed('+ ' + kind.toUpperCase()); }
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
    this.audio.setMusicState('calm');
    this.postfx.setKillcam(0); this._kcT = 0;
    this._awardXp(this.score / 25);   // run-end XP from final score

    // co-op: host tells the squad the run is over; tidy up the shared state
    const coopClient = this.coopMode && !this.coopHost;
    if (this.coopMode && this.coopHost) { try { this.net.sendCoopEvent({ ev: 'over' }); } catch (_) {} }

    const wave = coopClient ? (this.coop._lastWave || 1) : this.waves.wave;
    document.getElementById('final-score').textContent = String(this.score).padStart(4, '0');
    document.getElementById('final-wave').textContent = wave;
    document.getElementById('final-kills').textContent = this.kills;

    let scores = [];
    try { scores = JSON.parse(localStorage.getItem('verdant_scores') || '[]'); } catch (_) {}
    const best = scores.reduce((m, r) => Math.max(m, r.score), 0);
    // co-op clients don't own the run, so they don't write/submit a score
    if (!coopClient) {
      const run = { score: this.score, wave: this.waves.wave, kills: this.kills, map: this.world.mapId, diff: this.difficultyId, name: this.net.name, country: this.net.country || '', date: Date.now() };
      scores.push(run);
      scores.sort((a, b) => b.score - a.score);
      scores = scores.slice(0, 25);
      try { localStorage.setItem('verdant_scores', JSON.stringify(scores)); } catch (_) {}
      try { this.net.submitScore(run); } catch (_) {}
      this.missions.reached(this.waves.wave);
    }

    document.getElementById('over-best').textContent = this.score > best
      ? '★ NEW PERSONAL BEST ★' : `Personal best: ${String(best).padStart(4, '0')}`;
    this._updateContinueUI();
    document.getElementById('gameover').classList.remove('hidden');

    this.vehicles.reset();
    { const b = this._activeBody(); if (b) b.visible = false; }
    this.world._combatActive = false;
    this.pvpMode = false;
    if (this.coopMode) { this.coopMode = false; this.coopHost = false; this.coop.clearGhosts(); }
  }

  _updateBaseBar() {
    const wrap = document.getElementById('base-bar-wrap'); if (!wrap) return;
    const b = this.world.base;
    const d = b ? Math.hypot(this.player.position.x - b.x, this.player.position.z - b.z) : 1e9;
    const show = !!(b && b.alive && (this.vehicles.isMounted() || d < 90));
    wrap.classList.toggle('hidden', !show);
    if (show) { const f = document.getElementById('base-fill'); if (f) f.style.width = (this.world.baseHpFrac() * 100) + '%'; }
  }

  _onBaseDestroyed() {
    this.score += 5000;
    this.hud.setScore(this.score);
    this.hud.popKill();
    this.hud.killFeed('☠ ENEMY BASE DESTROYED  +5000');
    this.audio.announce('base');
    this._triggerKillCam();
    this.ach.unlock('basebuster');
    this._detonate(this.world.base.x, this.world.base.z, 12, 0, 0);
    this.postfx.pulseBloom(1.0);
  }

  loop() {
    requestAnimationFrame(this.loop);
    const rawDt = Math.min(0.05, this.clock.getDelta());

    // adaptive resolution: ease the pixel ratio down when frames run long and
    // back up when there's headroom, so weak GPUs stay smooth automatically.
    this._perfMs += (rawDt * 1000 - this._perfMs) * 0.06;
    this._dprT += rawDt;
    if (this._dprT > 1.5 && this._allowAdaptive !== false) {
      this._dprT = 0;
      let want = this._dpr;
      if (this._perfMs > 26 && this._dpr > 0.8) want = Math.max(0.8, this._dpr - 0.2);          // < ~38fps: downscale
      else if (this._perfMs < 18.5 && this._dpr < this._maxDPR) want = Math.min(this._maxDPR, this._dpr + 0.1); // > ~54fps: upscale
      if (Math.abs(want - this._dpr) > 0.001) {
        this._dpr = want;
        this.renderer.setPixelRatio(this._dpr);
        if (this.postfx) { this.postfx.setPixelRatio(this._dpr); this.postfx.setSize(window.innerWidth, window.innerHeight); }
      }
    }
    // kill-cam slow-mo: scales the sim while real time drives the recovery, so
    // it always returns to normal speed even if a frame is dropped.
    let scale = 1;
    if (this.state === 'playing' && this._kcT > 0) {
      this._kcT -= rawDt;
      const f = Math.max(0, this._kcT / (this._kcDur || 1)); // 1 -> 0
      scale = 0.3 + 0.7 * (1 - f);                           // 0.3x at impact, easing back to 1x
      this.postfx.setKillcam(f);
      if (this._kcT <= 0) { this._kcT = 0; this.postfx.setKillcam(0); }
    }
    this.timeScale = scale;
    const dt = rawDt * scale;
    this._lastDt = dt;

    if (this.state === 'playing') {
      this._pollGamepad();
      const mounted = this.vehicles.isMounted();
      if (this.firing) {
        if (mounted) { this.vehicles.fire(); }
        else if (this.weapons.def.auto || !this._firedThisClick) {
          if (this.weapons.fireCd <= 0) {
            this._fire();
            if (!this.weapons.def.auto) this._firedThisClick = true;
          }
        }
      }
      if (!this.firing) this._firedThisClick = false;
      const clientCoop = this.coopMode && !this.coopHost;

      if (this._meleeCd > 0) this._meleeCd -= dt;
      const wantTp = this.thirdPerson && !mounted;
      // smooth first<->third person blend
      this._tpBlend = (this._tpBlend || 0) + ((wantTp ? 1 : 0) - (this._tpBlend || 0)) * Math.min(1, dt * 8);
      if (this._tpBlend < 0.0015) this._tpBlend = 0;
      if (mounted) { this.player.regenOnly ? this.player.regenOnly(dt) : null; }
      else {
        this.player.update(dt);
        if (this._wasAir && this.player.onGround) this.audio.land();
        this._wasAir = !this.player.onGround;
        if (this._tpBlend > 0) this._applyThirdPerson(this._tpBlend);
      }
      this.weapons.rig.visible = !mounted && this._tpBlend < 0.5;
      { const b = this._activeBody(); if (b) b.visible = this._tpBlend > 0.05; }
      // feed look-sway + walk-bob to the weapon rig, then reset the frame's look delta
      const fl = this._frameLook || (this._frameLook = { x: 0, y: 0 });
      this.weapons.setMotion({ lookX: fl.x, lookY: fl.y, moving: !mounted && this.player.moving, spd: this.player.sprinting ? 11 : 7 });
      fl.x = 0; fl.y = 0;
      this.weapons.update(dt);
      if (this.cheatArsenal) this.weapons.refill();
      this.player.lookSensMul = this.weapons.ads ? 0.5 : 1;
      this.hud.setScope(!mounted && this.weapons.def.key === 'sniper' && this.weapons.adsT > 0.6);

      const live = this.weapons.live;
      this.hud.setAmmo(live.ammo, live.reserve);
      this.hud.setReloading(this.weapons.reloading);

      if (this.pvpMode) {
        // PvP: no enemies — combat is player-vs-player (handled in _fire)
        this.hud.setEnemies(0); this.hud.showBoss(false);
      } else if (!clientCoop) {
        // co-op host: enemies also target connected squadmates; damage to them
        // is routed over the relay so single-player keeps a single target.
        const extra = (this.coopMode && this.coopHost) ? this.coop.coopTargets() : null;
        // stealth: crouching (plus the Ghost perk) shrinks how close enemies detect you
        this.waves.stealth = Math.min(0.85, (this.player.crouching ? 0.62 : 0) + (this.stealthPerk || 0) * (this.player.crouching ? 1 : 0.4));
        this.waves.update(dt, this.player, this.camera, {
          onPlayerHit: (d, tid) => { if (tid) this.coop.sendDmg(tid, d); else this._onPlayerHit(d); },
          onWaveCleared: (w) => this._onWaveCleared(w),
          onEnemyShoot: (s) => this._spawnEnemyShot(s),
          onSummon: (e) => { this.effects.smoke(e.group.position.clone().setY(1.2), { color: 0xc080ff, size: 1.0, life: 0.6, rise: 0.8, opacity: 0.6 }); this.audio.swap(); },
          onBark: (e) => this._enemyBark(e),
          onShockwave: (sw) => this._enemyShockwave(sw),
          onBossPhase: (e, p) => this._onBossPhase(e, p),
        }, extra);
        this.waves.removeDead((e) => this._onKill(e));
        this.hud.setEnemies(this.waves.remaining);

        // boss health bar (+ named-boss arrival announcement)
        const boss = this.waves.boss;
        if (boss && !boss.dead) {
          this.hud.showBoss(true); this.hud.setBoss(boss.hp, boss.maxHp);
          this.hud.setBossName(boss.named || 'EMBER COLOSSUS');
          if (boss.named && this._announcedBoss !== boss) {
            this._announcedBoss = boss;
            this.hud.popWave(this.waves.wave, '☠ ' + boss.named + ' ☠');
            this.hud.killFeed(`⚠ ${boss.named} HAS ARRIVED`);
            this.audio.voice('boss'); this.audio.announce('base'); this.audio.setMusicState('boss');
          }
        } else this.hud.showBoss(false);

        this._updateEnemyShots(dt);

        // host: relay the shared wave state to clients (~10/s)
        if (this.coopMode && this.coopHost) {
          this._snapT = (this._snapT || 0) - dt;
          if (this._snapT <= 0) { this._snapT = 0.1; this.coop.broadcastSnapshot(this.waves, this.score); }
        }
      } else {
        // co-op client: mirror the host's enemies, no local sim
        this.coop.updateGhosts(dt, this.camera);
        this.hud.setEnemies(this.coop.ghosts.size);
        this.hud.showBoss(false);
      }

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
      this.coop.update(dt);
      this.vehicles.update(dt);     // ordnance + driving (sets the camera when mounted)
      this.vehicles.promptTick();
      this._updateBaseBar();
      this.effects.update(dt, this.player.position);
      this.world.update(dt, this.camera);
      const enemySrc = clientCoop ? [...this.coop.ghosts.values()] : this.waves.enemies;
      this.minimap.update(this.player, enemySrc, this.pickups.items, this.world.lakes);

      // compass (player heading + threat pips) + High-Alert threat indicator
      const items = [];
      const fwx = -Math.sin(this.player.yaw), fwz = -Math.cos(this.player.yaw);
      let threat = 0, detected = false;
      for (const e of enemySrc) {
        if (e.dead) continue;
        const dx = e.group.position.x - this.player.position.x, dz = e.group.position.z - this.player.position.z;
        items.push({ bearing: Math.atan2(dx, -dz), boss: e.isBoss });
        const d = Math.hypot(dx, dz);
        if (e.alerted && d < 30) detected = true;
        if (d < 18) {
          const dot = (dx * fwx + dz * fwz) / (d || 1); // 1 = dead ahead, <0.34 = outside ±70°
          if (dot < 0.34) threat = Math.max(threat, 1 - d / 18);
        }
      }
      this.hud.drawCompass(-this.player.yaw, items);
      this.hud.setThreat(mounted ? 0 : threat);
      this.hud.setStealth(this.player.crouching && !mounted, detected);

      // camera shake
      if (this.shake > 0) {
        this.camera.position.x += (Math.random() - 0.5) * this.shake * 0.3;
        this.camera.position.y += (Math.random() - 0.5) * this.shake * 0.3;
        this.shake *= Math.max(0, 1 - dt * 6);
      }
    } else if (this.state === 'title') {
      if (this.cinematicEnabled) {
        this.cinematic.update(dt);
      } else {
        this._idleT = (this._idleT || 0) + dt;
        this.camera.position.set(0, this.player.eyeHeight, 30);
        this.camera.rotation.set(0, Math.PI + Math.sin(this._idleT * 0.15) * 0.15, 0);
      }
      this.world.update(dt, this.camera);
      this.effects.update(dt, this.camera.position);
    } else if (this.state === 'deploy') {
      this._updateDeploy(dt);
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
