# FableHigh Hoops 🏀

A 3D NBA-style basketball game that runs entirely in the browser — no install, no build step. Built with [Three.js](https://threejs.org/).

**▶ Play it:** https://austinblundell.github.io/FableHigh/

## The game

Score as many points as you can in **2 minutes** against an AI defender, inside a full arena — regulation NBA court with accurate markings, plexiglass backboards, animated crowd, jumbotron, ad boards, and broadcast-style lighting.

- **Shot meter** — hold Space to charge, release inside the green zone. The zone shrinks with distance; a perfect release rewards you.
- **Real ball physics** — gravity, backspin, rim and backboard collisions, bounces, swish detection.
- **Defender AI** — slides to stay between you and the rim; contested shots are harder.
- **NBA rules-lite** — 2s and 3s (corner three counts!), 24-second shot clock, layups at the rim.
- **Crowd energy** — the arena comes alive when you score. Your best score is saved locally.

## Controls

| Key | Action |
|---|---|
| `W A S D` / arrows | Move |
| `Shift` | Sprint |
| `Space` (hold + release) | Shoot — release in the green zone |
| `Enter` | Start / restart |

## Run locally

Any static server works (ES modules need http, not `file://`):

```sh
npx serve .
# or
python3 -m http.server
```

Then open http://localhost:8000 (or the port shown).

## Tech

- Three.js r160 (CDN import map, zero dependencies to install)
- Procedural everything: court texture, ball, characters, and crowd are generated in code
- PBR materials + ACES tone mapping, soft shadows, instanced crowd (~4,000 rendered fans)
- WebAudio synth for bounces, swishes, buzzer, and crowd noise

---

hello world 👋
