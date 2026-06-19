# VERDANT — A Heleo2 Studio production

> A complete, browser-based low-poly **forest survival shooter** built with
> [Three.js](https://threejs.org/). Hold the line against endless waves of
> crimson enemies in a golden, fog-drenched wilderness.

Recreated from the gameplay reference video: a wave-based first-person shooter
set in a stylised low-poly forest at golden hour, with a HUD showing the
current **WAVE**, **SCORE**, **ammo** and **vitality**, billboard health bars
over enemies, and a punchy **KILL** popup on every confirmed takedown.

## ✨ Features

- **Marketing landing page** (`index.html`) — animated forest backdrop, hero,
  feature cards, controls guide, enemy bestiary, and a local hall-of-fame.
- **Full playable game** (`game.html`):
  - Pointer-lock FPS controls (WASD + mouse), sprint, **aim-down-sights** (zoom).
  - **Arsenal of 4 weapons** — KR-15 Rifle, V-9 SMG, BR-2 Breacher (shotgun),
    LR-7 Marksman (scoped sniper) — each with its own ammo, fire mode, spread,
    recoil and tracers. Switch with `1–4` or the scroll wheel.
  - Procedural battlefield: gradient **sky dome** with drifting clouds, a ring
    of **distant mountains**, rolling terrain, pines, rocks, grass, a dirt path,
    a low golden sun and fog.
  - A **ruined town**: buildings with glowing windows, watchtowers, sandbag
    walls, crate stacks, fences, and **explosive red barrels** you can shoot to
    blow up clustered enemies.
  - Three enemy archetypes — **Grunt**, **Runner**, **Brute** — with billboard
    health bars, walk/attack animation and per-wave HP scaling.
  - Endless, escalating waves with a between-wave breather, ammo top-ups and
    fresh armor each wave.
  - **Survivability:** vitality bar, regenerating health, an **armor** layer,
    and **pickups** (medkits / armor / ammo) dropped by the fallen.
  - Raycast gunplay with muzzle flash, **bullet tracers**, impact sparks, blood
    hits, **kill streaks** with bonus scoring, a kill feed, hit markers, recoil,
    head-bob and **camera shake** on explosions.
  - **Cinematic post-processing**: ACES tone mapping, **bloom**, warm color
    grade, vignette, film grain and subtle chromatic aberration.
  - **Particle FX**: drifting ambient embers, explosion fireballs &amp; smoke,
    blood bursts and fading ground decals (blood / scorch).
  - Procedural WebAudio sound effects, per-weapon (no asset downloads).
  - Damage flash, low-health vignette, sniper **scope overlay**, and a **KILL** popup.
  - Local leaderboard persisted in `localStorage`, surfaced on the landing page.

## 🎮 Controls

| Key | Action |
| --- | ------ |
| `W A S D` | Move |
| `Mouse` | Aim |
| `Left Click` | Fire (hold for auto) |
| `Right Click` | Aim down sights (zoom) |
| `1 – 4` / `Wheel` | Switch weapons |
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
  audio.js          Procedural per-weapon sound effects
assets/favicon.svg
```

## 🛠 Tech

Vanilla HTML/CSS/JS + Three.js (WebGL). No bundler, no framework — drop it on
any static host (GitHub Pages, Netlify, etc.).
