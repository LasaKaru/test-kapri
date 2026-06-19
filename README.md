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
  - Pointer-lock FPS controls (WASD + mouse), sprint, reload.
  - Procedurally built low-poly forest: rolling terrain, pines, rocks, grass,
    a dirt path, a low golden sun, god-rays and fog.
  - Three enemy archetypes — **Grunt**, **Runner**, **Brute** — with
    billboard health bars and walk/attack animation.
  - Endless, escalating waves with a between-wave breather and ammo top-ups.
  - Raycast gunplay with muzzle flash, hit markers, recoil and head-bob.
  - Procedural WebAudio sound effects (no asset downloads).
  - Damage flash, vitality bar, score, and a **KILL** popup.
  - Local leaderboard persisted in `localStorage`, surfaced on the landing page.

## 🎮 Controls

| Key | Action |
| --- | ------ |
| `W A S D` | Move |
| `Mouse` | Aim |
| `Left Click` | Fire (hold for auto) |
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
  game.js           Entry point, loop, state machine
  world.js          Terrain, trees, lighting, fog, collisions
  player.js         Controls, weapon, shooting, health
  enemy.js          Enemy types + wave manager
  hud.js            HUD updates & popups
  audio.js          Procedural sound effects
assets/favicon.svg
```

## 🛠 Tech

Vanilla HTML/CSS/JS + Three.js (WebGL). No bundler, no framework — drop it on
any static host (GitHub Pages, Netlify, etc.).
