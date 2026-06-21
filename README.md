# VERDANT — A HelaO2 Studio production

> A complete, browser-based low-poly **forest survival shooter** built with
> [Three.js](https://threejs.org/). Hold the line against endless waves of
> crimson enemies in a golden, fog-drenched wilderness.

Recreated from the gameplay reference video: a wave-based first-person shooter
set in a stylised low-poly forest at golden hour, with a HUD showing the
current **WAVE**, **SCORE**, **ammo** and **vitality**, billboard health bars
over enemies, and a punchy **KILL** popup on every confirmed takedown.

## 🗺️ Maps & difficulty

Pick your battlefield from the **Select Location** screen — four maps with
distinct **Earth-like topography**, plus three difficulty tiers (saved to
`localStorage`):

| Map | Topography |
| --- | ---------- |
| **Verdant Plains** | Gentle golden grassland, open sightlines |
| **Ashen Highlands** | Raised rugged hills & plateaus, more rock |
| **Mire Lowlands** | Sunken wetlands & broad water, heavy fog |
| **Titan Peaks** | Steep mountain ridges around a fighting valley, snow |

Terrain is generated from **fractal value noise**, giving organic Earth-like
topography (ridgelines, valleys, lowland basins) that differs per map.

Difficulty (**Recruit / Veteran / Nightmare**) scales enemy health, speed,
damage, head-count and rewards.

The world is **alive**: real-time **wind-animated grass** (vertex shader),
a **mixed forest** of layered conifers and clustered-canopy broadleaf trees
with **low scrub undergrowth**, flocks of **birds** wheeling overhead, **animals**
that roam and flee the player, and **enterable buildings** — hollow structures
with a doorway you can walk through and fight inside.

### ⚡ Server scaling

The optional server is built to take load with no dependencies:

- **In-memory cache** over an **append-only JSONL** log — the read hot path
  never touches disk, and single-line appends are atomic/multi-writer safe.
- **Per-IP rate limiting** (configurable via `RL_MAX` / `RL_WINDOW`, `0` disables).
- **Multi-core clustering** — `CLUSTER=auto node server/server.js` forks one HTTP
  worker per core (workers stay consistent through the shared append-only log;
  realtime chat/co-op run a single-process instance or behind a sticky LB).
- Keep-alive, payload caps, auto-restart of crashed workers.

### 🛰️ Tactical map

Press **M** (or the on-screen MAP button) — anytime on the title or mid-match —
to open a **Ghost-Recon-style tactical map**: a relief-shaded top-down render of
the *actual* battlefield (sampled from the same height field), with water,
the road, objective / alert / mission markers, region label, live enemy &
pickup blips, your heading, and pan/zoom. 

## ✨ Features

- **Marketing landing page** (`index.html`) — animated forest backdrop, hero, a
  **gameplay gallery** with a lightbox, feature/arsenal cards, an **achievements
  gallery** (live from your `localStorage` progress), an **online leaderboard
  widget** (global, with a local fallback when offline) and **community reviews**.
  See **[DEPLOY.md](DEPLOY.md)** for hosting (static or full server, Docker, nginx/TLS).
- **Full playable game** (`game.html`):
  - Pointer-lock FPS controls (WASD + mouse), sprint, **aim-down-sights** (zoom).
  - **Arsenal of 9 weapons** — KR-15 Rifle, V-9 SMG, BR-2 Breacher (shotgun),
    LR-7 Marksman (scoped sniper), SD-9 Sidearm (pistol), HG-50 Gatling (LMG),
    **MK-8 DMR** (semi-auto marksman), **AA-12 Auto** (full-auto shotgun) and
    **ARC-9 Railgun** (high-velocity energy slug) — each with its own ammo, fire
    mode, **learnable recoil pattern** and tracers. Switch with `1–9` or the
    scroll wheel.
  - **Checkpoints & missions** — your furthest wave on each battlefield is saved
    as a checkpoint, so on death you can **Continue** instead of restarting from
    wave 1. A **Missions** board shows waves 1→24 (boss waves and a Final Stand
    marked) as **unlocked / locked**, and you can redeploy to any wave you've
    reached, with a credit head-start to match.
  - **Enemy voices** — procedurally-synthesised (formant) shouts: foes **bark**
    when they first close in ("hey you" / "stop there" / "over here"), **scream**
    on death, and bosses **roar** — alongside punchier, layered gun reports.
  - **Melee strike** (`V`) for point-blank kills, with a swing animation.
  - **Headshots** deal 2.5× damage with a HEADSHOT callout and score bonus.
  - **Weapon leveling** — each gun earns XP from kills and levels up (to LV10)
    for more damage; progression persists across runs in `localStorage`.
  - Procedural battlefield: gradient **sky dome** with drifting clouds, **layered
    mountain ranges** with snow caps, rolling terrain, pines, **boulder fields**
    with moss, grass, a dirt path, a low golden sun and fog.
  - **Animated water lakes** — carved basins with a procedural wave shader
    (fresnel reflection + sun specular), reed fringes, and a **wading** slowdown
    with splash spray when you cross them.
  - A **ruined town**: buildings with glowing windows, watchtowers, sandbag
    walls, crate stacks, fences, and **explosive red barrels** you can shoot to
    blow up clustered enemies.
  - **Humanlike, articulated foes** — anatomically-proportioned low-poly bodies
    (head, shoulders, chest vest, segmented arms & legs, boots, glowing eyes)
    with a hip/shoulder-pivoted walk cycle. Eight archetypes —
    **Grunt**, **Runner**, **Brute**, ranged **Spitter**,
    **Exploder** (rushes & detonates), **Shielded** (frontal plate blocks most
    fire — flank, headshot or blast it), **Summoner** (spawns adds), and a
    colossal **Boss** every 5th wave with a top-screen health bar.
  - **Ragdoll-style deaths** (topple, sink &amp; fade) and **basic pathfinding**
    so enemies steer around buildings instead of grinding into them.
  - A **spawn director** paces spawns and caps how many enemies are alive at once.
  - Endless, escalating waves with a between-wave breather, ammo top-ups and
    fresh armor each wave.
  - **Survivability:** vitality bar, regenerating health, an **armor** layer,
    and **pickups** (medkits / armor / ammo) dropped by the fallen.
  - **Frag grenades** (`G`) — physics-arced throw, bounce, fused detonation
    with AoE damage and **chain-reacting** explosive barrels.
  - **Minimap / radar** — rotating top-down view of nearby enemies, pickups
    and lakes, with the player at centre.
  - **Settings menu** (from the title or pause) — master volume, SFX toggle,
    mouse sensitivity, field of view, a **Realism slider (0–100%)**, day/night
    and weather toggles, shadows and detail, all saved to `localStorage`.
  - **Day/night cycle** — sun & moon arc across the sky with dynamic sky
    colours, fog and lighting; enemies hit harder at night.
  - **Weather** — rolling **rain** with falling particles, grayer fog and
    dimmed light.
  - **Progression & shop** — earn **credits** from kills and wave clears, then
    spend them between waves at the **REARM shop** on resupply (ammo / armor /
    health / grenades) and permanent run **perks**: Vitality, Armor Plating,
    Fast Hands, Adrenaline, Lifesteal and Scavenger (multi-level).
  - Raycast gunplay with muzzle flash, **bullet tracers**, impact sparks, blood
    hits, **kill streaks** with bonus scoring, a kill feed, hit markers, recoil,
    head-bob and **camera shake** on explosions.
  - **Cinematic post-processing**: ACES tone mapping, **bloom**, warm color
    grade, vignette, film grain and subtle chromatic aberration — scaled by the
    **Realism slider** (0% = flat natural low-poly look, 100% = full cinematic).
  - **Particle FX**: drifting ambient embers, explosion fireballs &amp; smoke,
    blood bursts and fading ground decals (blood / scorch).
  - Procedural WebAudio sound effects, per-weapon (no asset downloads), plus
    **procedural music** (an ambient pad + beat that escalates with the wave) and
    a wind soundscape — with a separate Music volume slider.
  - **Floating damage numbers** (crit-coloured on headshots) and a **compass**
    HUD strip showing your heading and threat bearings.
  - **Mobile / touch controls** — a left analog joystick, right-side look-drag,
    and on-screen Fire / ADS / Reload / Grenade / Melee / Swap buttons (shown
    automatically on touch devices).
  - **Gamepad support** — sticks to move/look, triggers to fire/aim, face &
    bumper buttons for reload / melee / grenade / weapon swap.
  - **Local achievements** — 9 unlockable feats with toast pop-ups, saved to
    `localStorage`.
  - **Player classes** — Assault (ammo/grenades), Medic (HP & regen) and
    Marksman (headshots/ADS), chosen on the Loadout screen.
  - **Weapon attachments** — up to two per gun (Extended Mag, Foregrip,
    Compensator, Scope, Laser, Lightweight Kit) that modify the per-run stats;
    saved to `localStorage`.
  - Object pooling for FX and projectiles to keep the frame rate steady.
  - Damage flash, low-health vignette, sniper **scope overlay**, and a **KILL** popup.
  - Local leaderboard persisted in `localStorage`, surfaced on the landing page.

## 🌐 Online (optional) — zero single-player dependency

The game is **single-player first**. An optional online layer adds a global
**leaderboard** and **live chat**; if no server is reachable, the game runs
exactly as before and shows an **OFFLINE** status — nothing is blocked or broken.

- **Live chat** (press **Y**) — global room with presence count; connects lazily
  and greys out with "reconnecting…" when offline. Available from the title and
  in-match (typing releases the cursor so movement isn't triggered).
- **Co-op** — host or join a room by code (up to 4); squadmates appear in your
  world as named avatars, position-synced in real time over WebSocket. Lobby
  shows "servers unavailable" with no server; single-player is unaffected.
  *(Foundation: synced players & lobby. Shared waves are the next slice.)*

- A connection-status **pill** (●) shows `online / connecting / offline`.
- Online code lives in one isolated module (`js/game/net.js`) — every call is
  **non-blocking and failure-safe**, with auto-reconnect (exponential backoff).
- Scores are always saved **locally**; when online they also sync to the server
  (queued and retried, never on the critical path).
- The leaderboard view degrades to your **local scores** with a banner when offline.

### Run the server (optional)

A **dependency-free** Node server (`server/`) hosts the client *and* the API:

```bash
node server/server.js          # http://localhost:8080
```

Then open `http://localhost:8080/` — the pill turns **ONLINE**, scores sync and
**chat** goes live (WebSocket at `/api/chat`, implemented in pure Node).
Leaderboard data persists to `server/data/scores.json`. No `npm install` needed.

To point the static client at a remote server, set `window.VERDANT_SERVER` or
`localStorage.verdant_server` to its base URL. With no server, everything still
works offline.

## 🎮 Controls

| Key | Action |
| --- | ------ |
| `W A S D` | Move |
| `Mouse` | Aim |
| `Left Click` | Fire (hold for auto) |
| `Right Click` | Aim down sights (zoom) |
| `1 – 9` / `Wheel` | Switch weapons |
| `G` | Throw frag grenade |
| `R` | Reload |
| `Shift` | Sprint |
| `Esc` | Pause / release cursor |

## 🚀 Run it

It's a fully static site — no build step. Serve the folder over HTTP (ES
modules and pointer-lock require a server, not `file://`):

```bash
# any static server works, e.g.
python3 -m http.server 8000
# then open http://localhost:8000/
```

Three.js is loaded from a CDN via an import map, so an internet connection is
required on first load.

## 🗂 Structure

```
index.html          Landing page
game.html           Game shell + HUD markup
css/style.css       Landing styles
css/game.css        HUD & overlay styles
js/main.js          Landing interactions (particles, reveal, leaderboard)
js/game/
  game.js           Entry point, loop, state machine, combat orchestration
  world.js          Sky, mountains, terrain, town/buildings, props, collisions
  player.js         Controls, movement, health, armor, regen, recoil
  weapons.js        Arsenal definitions, view models, ADS, firing, reload
  enemy.js          Enemy types + wave manager
  effects.js        Tracers, impacts, smoke, embers, blood, ground decals
  postfx.js         Post-processing (bloom, color grade, vignette, grain)
  pickups.js        Health / armor / ammo drops
  hud.js            HUD updates, weapon panel, kill feed, scope, popups
  minimap.js        Rotating top-down radar (enemies, pickups, lakes)
  settings.js       Settings menu (volume, sensitivity, FOV, graphics)
  shop.js           Between-wave shop: credits, resupply & perks
  audio.js          Procedural per-weapon sound effects
assets/favicon.svg
```

## 🛠 Tech

Vanilla HTML/CSS/JS + Three.js (WebGL). No bundler, no framework — drop it on
any static host (GitHub Pages, Netlify, etc.).
