# JP Kong 3D — The Rescue of Baby Kong

A 3D platformer built with **Three.js** and vanilla JavaScript, designed by my son Joshua and developed together as a father-and-son project.

The villainous B-Kong has locked Baby Kong in a cage deep in the jungle. Play as JP Kong across **20 procedurally generated levels**: collect bananas to open the cage, smash rocks, dig up treasure, fight enemies, and face boss battles on levels 5, 12, 15, and 20.

## Play it live

**Demo:** https://homeproxpress-game-test.henriquebrq.workers.dev/resgate-73f5969b/

## Features

- 20 levels generated from seeds (new layout every run)
- Boss fights on levels 5, 12, 15, and 20, with a boss health bar
- Collectibles, breakable rocks, hidden treasure, and healing items
- Upgrades between levels
- Full HUD: bananas, health, level progress, heals
- Mobile/touch support
- Real-time 3D rendering with Three.js (WebGL, soft shadows)

## Tech

- **Three.js** (WebGL) for 3D rendering
- Vanilla JavaScript — no build step, no framework
- HTML5 Canvas + CSS for HUD and overlays

## Run locally

Just serve the folder with any static server, e.g.:

```bash
npx serve .
# or
python3 -m http.server 8000
```

Then open `index.html` in your browser.

## About

Original game concept and level design by Joshua (age 10), from his handwritten design notes — characters, bosses, and the rescue storyline are his. We built and playtest it together.

*Game UI is in Portuguese (pt-BR), the language of its original design team.*
