# Fable League Basketball — 3D NBA-style Basketball in the Browser

A full 3D, five-on-five basketball game that runs entirely in the browser with no build
step and no external assets. Built on [Three.js](https://threejs.org/) (vendored in
`lib/`), with custom physics, AI, procedural player animation, and a synthesized
WebAudio soundscape.

## Play

Serve the folder with any static file server and open it in a browser:

```bash
# Python
python3 -m http.server 8000
# or Node
npx serve .
```

Then open <http://localhost:8000>. (ES modules require http:// — opening
`index.html` directly from disk won't work.)

## The game

- **Full NBA-dimension court** — 94×50 ft, real three-point geometry (23'9" arc,
  22' corners), painted keys, restricted areas, and a regulation 10 ft rim.
- **5-on-5 with AI** — teammates space the floor, cut, and shoot; defenders play
  man-to-man, close out, contest shots, and go for steals.
- **Real ball physics** — gravity, bounce, rim (torus) and backboard collisions,
  net drag. Makes and misses are decided by simulation, not dice rolls: shot
  timing, distance, contests, movement, and player skill all feed the release
  error, and the rim decides the rest.
- **Rules** — game clock, quarters, overtime, 24-second shot clock (14 after
  offensive rebounds), out of bounds, shot-clock violations, alternating
  possessions, 2s and 3s judged from the shooter's feet.
- **Presentation** — broadcast camera (plus a behind-the-player cam), arena with
  ~1,800 instanced fans, jumbotron with live score, shot-clock units above each
  backboard, LED ad boards, scorer's table, ceiling light rig, glossy reflective
  hardwood, soft shadows, ACES tone mapping.
- **Sound** — fully procedural: crowd bed that swells on buckets, dribble bounces,
  rim clanks, backboard thuds, swishes, whistles, and buzzers.

## Controls

| Key | Action |
| --- | --- |
| `W A S D` / arrows | Move |
| `Shift` | Sprint |
| `Space` (with ball) | Hold to charge shot, release to shoot — release in the green zone |
| `Space` (on defense) | Jump / contest / block |
| `E` | Pass (aims using your movement direction) |
| `Q` | Attempt steal |
| `Tab` | Switch controlled defender |
| `C` | Toggle broadcast / player camera |
| `P` / `Esc` | Pause |

You always control the ball handler on offense; on defense you control the
switch-highlighted player shown in the bottom-left plate.

## Code layout

```
index.html           shell, HUD, menus, styles
lib/three.module.js  vendored Three.js r160
js/main.js           renderer, lighting, environment, cameras, game loop
js/game.js           rules, possession flow, player AI, shooting/passing models
js/ball.js           ball physics: rim/backboard/floor collisions, score detection
js/player.js         procedural articulated player models + animation
js/arena.js          court, hoops, stands, crowd, jumbotron, ad boards
js/audio.js          synthesized WebAudio sound engine
js/ui.js             DOM HUD bindings
js/input.js          keyboard state with per-step edge events
js/constants.js      court dimensions, teams, rosters, tuning
```

No frameworks, no bundler, no network calls at runtime.
