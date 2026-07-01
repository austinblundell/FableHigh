// FableHigh Hoops — 3D basketball in the browser (Three.js)
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// ---------------------------------------------------------------- constants
const COURT_L = 28.65, COURT_W = 15.24;          // NBA court, meters
const APRON_L = 30.8, APRON_W = 16.8;            // floor incl. apron
const RIM_H = 3.048, RIM_R = 0.2286, BALL_R = 0.121;
const HOOP_X = COURT_L / 2 - 1.575;              // rim center from mid court
const BOARD_X = COURT_L / 2 - 1.22;              // backboard face
const GRAV = -9.81;
const GAME_LEN = 120, SHOT_CLOCK = 24;

// ---------------------------------------------------------------- renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05060a);
scene.fog = new THREE.Fog(0x05060a, 40, 95);

const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.1, 200);
camera.position.set(-6, 4, 10);

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ---------------------------------------------------------------- lighting
scene.add(new THREE.HemisphereLight(0xbdd3ff, 0x30241a, 0.5));

function courtSpot(x, z, castShadow) {
  const s = new THREE.SpotLight(0xfff2dd, 900, 60, Math.PI / 4.4, 0.45, 1.6);
  s.position.set(x, 15, z);
  s.target.position.set(x * 0.35, 0, z * 0.35);
  s.castShadow = castShadow;
  if (castShadow) {
    s.shadow.mapSize.set(2048, 2048);
    s.shadow.bias = -0.0003;
    s.shadow.camera.near = 5; s.shadow.camera.far = 40;
  }
  scene.add(s, s.target);
}
courtSpot(-8, 0, true);
courtSpot(8, 0, true);
courtSpot(0, 6, false);
courtSpot(0, -6, false);

// ---------------------------------------------------------------- canvas texture helpers
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// -------- court floor texture (planks + NBA markings)
function makeCourtTexture() {
  const W = 2048, H = Math.round(W * APRON_W / APRON_L);
  const sx = W / APRON_L, sy = H / APRON_W;
  const px = m => (m + APRON_L / 2) * sx;
  const py = m => (m + APRON_W / 2) * sy;

  return canvasTex(W, H, ctx => {
    // apron (painted navy, NBA-floor style)
    ctx.fillStyle = '#152447';
    ctx.fillRect(0, 0, W, H);

    // hardwood inside boundary
    const bx = px(-COURT_L / 2), by = py(-COURT_W / 2);
    const bw = COURT_L * sx, bh = COURT_W * sy;
    ctx.fillStyle = '#c08a4a';
    ctx.fillRect(bx, by, bw, bh);
    // planks (run lengthwise)
    for (let z = -COURT_W / 2; z < COURT_W / 2; z += 0.16) {
      const shade = 0.9 + Math.random() * 0.2;
      ctx.fillStyle = `rgb(${192 * shade | 0},${138 * shade | 0},${74 * shade | 0})`;
      ctx.fillRect(bx, py(z), bw, 0.16 * sy + 1);
      // plank joints
      ctx.fillStyle = 'rgba(90,55,25,0.25)';
      let off = Math.random() * 2;
      for (let x = -COURT_L / 2 + off; x < COURT_L / 2; x += 2.4) {
        ctx.fillRect(px(x), py(z), 2, 0.16 * sy);
      }
    }
    ctx.strokeStyle = 'rgba(90,55,25,0.18)';
    ctx.lineWidth = 1;
    for (let z = -COURT_W / 2; z < COURT_W / 2; z += 0.16) {
      ctx.beginPath(); ctx.moveTo(bx, py(z)); ctx.lineTo(bx + bw, py(z)); ctx.stroke();
    }

    ctx.lineWidth = Math.max(3, 0.05 * sx);
    ctx.strokeStyle = '#f5f2ea';

    // boundary
    ctx.strokeRect(bx, by, bw, bh);
    // half-court line + center circles
    ctx.beginPath(); ctx.moveTo(px(0), by); ctx.lineTo(px(0), by + bh); ctx.stroke();
    ctx.beginPath(); ctx.arc(px(0), py(0), 1.83 * sx, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#152447';
    ctx.beginPath(); ctx.arc(px(0), py(0), 1.83 * sx, 0, Math.PI * 2); ctx.fill();
    ctx.stroke();
    // center logo
    ctx.fillStyle = '#ffd23f';
    ctx.font = `900 ${1.1 * sx}px Arial`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.save();
    ctx.translate(px(0), py(0)); ctx.rotate(Math.PI / 2);
    ctx.fillText('FH', 0, 0);
    ctx.restore();

    // per-end markings
    for (const s of [1, -1]) {
      const hoopPx = px(s * HOOP_X), basePx = px(s * COURT_L / 2);
      // painted key: 4.88 wide, 5.79 long from baseline
      const keyNearX = px(s * (COURT_L / 2 - 5.79));
      ctx.fillStyle = 'rgba(21,36,71,0.92)';
      ctx.fillRect(Math.min(basePx, keyNearX), py(-2.44), Math.abs(basePx - keyNearX), 4.88 * sy);
      ctx.strokeStyle = '#f5f2ea';
      ctx.strokeRect(Math.min(basePx, keyNearX), py(-2.44), Math.abs(basePx - keyNearX), 4.88 * sy);
      // free-throw circle
      ctx.beginPath(); ctx.arc(keyNearX, py(0), 1.8 * sx, 0, Math.PI * 2); ctx.stroke();
      // restricted arc
      ctx.beginPath();
      ctx.arc(hoopPx, py(0), 1.22 * sx, s > 0 ? Math.PI / 2 : -Math.PI / 2, s > 0 ? Math.PI * 1.5 : Math.PI / 2, false);
      ctx.stroke();
      // three-point line: arc r=7.24 clipped at |z|=6.71, straight corner lines
      const a = Math.asin(6.71 / 7.24);
      ctx.beginPath();
      if (s > 0) ctx.arc(hoopPx, py(0), 7.24 * sx, Math.PI - a, Math.PI + a);
      else ctx.arc(hoopPx, py(0), 7.24 * sx, -a, a);
      ctx.stroke();
      const cornerEndX = px(s * (HOOP_X - Math.cos(a) * 7.24));
      for (const zc of [6.71, -6.71]) {
        ctx.beginPath();
        ctx.moveTo(basePx, py(zc));
        ctx.lineTo(cornerEndX, py(zc));
        ctx.stroke();
      }
    }
  });
}

const courtTex = makeCourtTexture();
const court = new THREE.Mesh(
  new THREE.PlaneGeometry(APRON_L, APRON_W),
  new THREE.MeshPhysicalMaterial({
    map: courtTex, roughness: 0.32, metalness: 0.0,
    clearcoat: 0.55, clearcoatRoughness: 0.35,
  })
);
court.rotation.x = -Math.PI / 2;
court.receiveShadow = true;
scene.add(court);

// dark surround floor
const surround = new THREE.Mesh(
  new THREE.PlaneGeometry(220, 220),
  new THREE.MeshStandardMaterial({ color: 0x0b0d13, roughness: 0.95 })
);
surround.rotation.x = -Math.PI / 2;
surround.position.y = -0.02;
surround.receiveShadow = true;
scene.add(surround);

// ---------------------------------------------------------------- ad boards
const adTex = canvasTex(1024, 64, (ctx, w, h) => {
  ctx.fillStyle = '#12203f'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#ffd23f';
  ctx.font = '900 40px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('FABLEHIGH HOOPS   ★   FABLEHIGH HOOPS   ★   FABLEHIGH HOOPS', w / 2, h / 2 + 2);
});
const adMat = new THREE.MeshStandardMaterial({ map: adTex, emissive: 0xffffff, emissiveMap: adTex, emissiveIntensity: 0.55 });
function adBoard(len, x, z, rotY) {
  const b = new THREE.Mesh(new THREE.BoxGeometry(len, 0.85, 0.12), adMat);
  b.position.set(x, 0.45, z);
  b.rotation.y = rotY;
  scene.add(b);
}
adBoard(APRON_L, 0, APRON_W / 2 + 0.35, 0);
adBoard(APRON_L, 0, -APRON_W / 2 - 0.35, 0);
adBoard(APRON_W - 4, APRON_L / 2 + 0.35, 0, Math.PI / 2);
adBoard(APRON_W - 4, -APRON_L / 2 - 0.35, 0, Math.PI / 2);

// ---------------------------------------------------------------- stands + crowd
const arena = new THREE.Group();
scene.add(arena);

const crowdSeats = [];
{
  const standMat = new THREE.MeshStandardMaterial({ color: 0x171a22, roughness: 0.95 });
  const ROWS = 10, DEPTH = 1.15, RISE = 0.58;
  const addRows = (side, axis) => {
    for (let i = 0; i < ROWS; i++) {
      const off = (axis === 'z' ? APRON_W / 2 : APRON_L / 2) + 2.4 + i * DEPTH;
      const y = 0.5 + i * RISE;
      const len = (axis === 'z' ? COURT_L + 8 : COURT_W + 6) + i * 1.6;
      const step = new THREE.Mesh(new THREE.BoxGeometry(axis === 'z' ? len : DEPTH, RISE, axis === 'z' ? DEPTH : len), standMat);
      if (axis === 'z') step.position.set(0, y - RISE / 2, side * off);
      else step.position.set(side * off, y - RISE / 2, 0);
      arena.add(step);
      const n = Math.floor(len / 0.72);
      for (let k = 0; k < n; k++) {
        if (Math.random() < 0.12) continue; // some empty seats
        const along = -len / 2 + 0.4 + k * 0.72 + (Math.random() * 0.24 - 0.12);
        const seat = { phase: Math.random() * Math.PI * 2 };
        if (axis === 'z') { seat.x = along; seat.z = side * off; }
        else { seat.x = side * off; seat.z = along; }
        seat.y = y + 0.34;
        crowdSeats.push(seat);
      }
    }
  };
  addRows(1, 'z'); addRows(-1, 'z'); addRows(1, 'x'); addRows(-1, 'x');
}

const CROWD_N = crowdSeats.length;
const bodyGeo = new THREE.CapsuleGeometry(0.155, 0.34, 3, 8);
const bodyMat = new THREE.MeshStandardMaterial({ roughness: 0.9 });
const crowdBodies = new THREE.InstancedMesh(bodyGeo, bodyMat, CROWD_N);
const headGeo = new THREE.SphereGeometry(0.105, 8, 8);
const headMat = new THREE.MeshStandardMaterial({ roughness: 0.7 });
const crowdHeads = new THREE.InstancedMesh(headGeo, headMat, CROWD_N);
{
  const shirt = [0xffd23f, 0x1b3f8f, 0xdedede, 0x8f1b1b, 0x223344, 0x3c7a3c, 0x666a77, 0xe28b2b];
  const skin = [0xf0c8a0, 0xc89060, 0x8a5a34, 0x5e3a20, 0xe8b48a];
  const c = new THREE.Color();
  for (let i = 0; i < CROWD_N; i++) {
    crowdBodies.setColorAt(i, c.setHex(shirt[(Math.random() * shirt.length) | 0]).multiplyScalar(0.5 + Math.random() * 0.5));
    crowdHeads.setColorAt(i, c.setHex(skin[(Math.random() * skin.length) | 0]));
  }
  crowdBodies.instanceColor.needsUpdate = true;
  crowdHeads.instanceColor.needsUpdate = true;
}
arena.add(crowdBodies, crowdHeads);

const dummy = new THREE.Object3D();
let excitement = 0;
function updateCrowd(t) {
  const amp = 0.02 + excitement * 0.13;
  for (let i = 0; i < CROWD_N; i++) {
    const s = crowdSeats[i];
    const bob = Math.abs(Math.sin(t * (3 + excitement * 5) + s.phase)) * amp;
    dummy.position.set(s.x, s.y + bob, s.z);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    crowdBodies.setMatrixAt(i, dummy.matrix);
    dummy.position.y += 0.33;
    dummy.updateMatrix();
    crowdHeads.setMatrixAt(i, dummy.matrix);
  }
  crowdBodies.instanceMatrix.needsUpdate = true;
  crowdHeads.instanceMatrix.needsUpdate = true;
}

// arena shell (dark walls behind stands)
{
  const wall = new THREE.Mesh(
    new THREE.CylinderGeometry(46, 46, 22, 32, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x090b11, roughness: 1, side: THREE.BackSide })
  );
  wall.position.y = 10;
  scene.add(wall);
  // light rigs
  const rigMat = new THREE.MeshStandardMaterial({ color: 0x0c0e14, emissive: 0xf5f0e0, emissiveIntensity: 1.2 });
  for (const [x, z] of [[-8, 0], [8, 0], [0, 6], [0, -6]]) {
    const rig = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.18, 3.2), rigMat);
    rig.position.set(x, 15.2, z);
    scene.add(rig);
  }
}

// ---------------------------------------------------------------- jumbotron
const boardCanvas = document.createElement('canvas');
boardCanvas.width = 512; boardCanvas.height = 256;
const bctx = boardCanvas.getContext('2d');
const boardTex = new THREE.CanvasTexture(boardCanvas);
boardTex.colorSpace = THREE.SRGBColorSpace;
{
  const jumbo = new THREE.Group();
  const frame = new THREE.Mesh(new THREE.BoxGeometry(4.6, 2.6, 4.6), new THREE.MeshStandardMaterial({ color: 0x14161d, roughness: 0.6 }));
  jumbo.add(frame);
  const scrMat = new THREE.MeshBasicMaterial({ map: boardTex });
  for (let i = 0; i < 4; i++) {
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 2.1), scrMat);
    scr.rotation.y = i * Math.PI / 2;
    scr.translateZ(2.32);
    jumbo.add(scr);
  }
  jumbo.position.set(0, 9.6, 0);
  scene.add(jumbo);
}
function drawJumbotron() {
  bctx.fillStyle = '#04050a'; bctx.fillRect(0, 0, 512, 256);
  bctx.strokeStyle = '#2a3350'; bctx.lineWidth = 6; bctx.strokeRect(4, 4, 504, 248);
  bctx.textAlign = 'center';
  bctx.fillStyle = '#ffd23f'; bctx.font = '900 84px Arial';
  bctx.fillText(String(score), 140, 118);
  bctx.fillStyle = '#8fa3c8'; bctx.font = '700 26px Arial';
  bctx.fillText('POINTS', 140, 158);
  bctx.fillStyle = '#ffffff'; bctx.font = '900 64px Arial';
  bctx.fillText(fmtTime(gameClock), 370, 108);
  bctx.fillStyle = '#ff5a4e'; bctx.font = '900 52px Arial';
  bctx.fillText(String(Math.ceil(shotClock)), 370, 190);
  bctx.fillStyle = '#8fa3c8'; bctx.font = '700 20px Arial';
  bctx.fillText('FABLEHIGH HOOPS', 140, 220);
  boardTex.needsUpdate = true;
}

// ---------------------------------------------------------------- hoops
const hoops = [];
function makeHoop(s) {
  const g = new THREE.Group();
  const rimC = new THREE.Vector3(s * HOOP_X, RIM_H, 0);

  // stanchion
  const padMat = new THREE.MeshStandardMaterial({ color: 0x16305e, roughness: 0.7 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x8a8f99, roughness: 0.35, metalness: 0.8 });
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.85, 1.1), padMat);
  base.position.set(s * (COURT_L / 2 + 1.35), 0.43, 0);
  base.castShadow = true;
  g.add(base);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 3.4, 12), steel);
  pole.position.set(s * (COURT_L / 2 + 1.35), 2.4, 0);
  g.add(pole);
  const armLen = s * (COURT_L / 2 + 1.35) - s * BOARD_X;
  const arm = new THREE.Mesh(new THREE.BoxGeometry(Math.abs(armLen) + 0.2, 0.12, 0.12), steel);
  arm.position.set((s * (COURT_L / 2 + 1.35) + s * BOARD_X) / 2, 3.95, 0);
  g.add(arm);

  // backboard (plexiglass) — 1.83 x 1.07, bottom at 2.90
  const board = new THREE.Mesh(
    new THREE.BoxGeometry(0.05, 1.07, 1.83),
    new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.28, roughness: 0.05, transmission: 0.4 })
  );
  board.position.set(s * BOARD_X, 2.9 + 1.07 / 2, 0);
  board.castShadow = true;
  g.add(board);
  // board frame + shooter square
  const frameMat = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.4 });
  const mkBar = (w, h, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.06, h, w), frameMat);
    m.position.set(s * BOARD_X, y, z);
    g.add(m);
  };
  mkBar(1.83, 0.05, 2.9 + 1.07, 0); mkBar(1.83, 0.05, 2.9, 0);
  mkBar(0.05, 1.07, 2.9 + 0.535, 0.915); mkBar(0.05, 1.07, 2.9 + 0.535, -0.915);
  const sqMat = new THREE.MeshStandardMaterial({ color: 0xdd3322, roughness: 0.5 });
  const mkSq = (w, h, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.062, h, w), sqMat);
    m.position.set(s * BOARD_X, y, z);
    g.add(m);
  };
  mkSq(0.59, 0.04, RIM_H + 0.45, 0); mkSq(0.59, 0.04, RIM_H, 0);
  mkSq(0.04, 0.45, RIM_H + 0.225, 0.295); mkSq(0.04, 0.45, RIM_H + 0.225, -0.295);

  // rim
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(RIM_R, 0.02, 10, 32),
    new THREE.MeshStandardMaterial({ color: 0xe8481c, roughness: 0.35, metalness: 0.6 })
  );
  rim.position.copy(rimC);
  rim.rotation.x = Math.PI / 2;
  rim.castShadow = true;
  g.add(rim);
  const bracket = new THREE.Mesh(new THREE.BoxGeometry(Math.abs(s * BOARD_X - s * HOOP_X) , 0.05, 0.1), sqMat);
  bracket.position.set((s * BOARD_X + s * HOOP_X) / 2, RIM_H - 0.03, 0);
  g.add(bracket);

  // net (line segments, diamond pattern)
  const netPts = [];
  const SEG = 12, netDepth = 0.42, botR = 0.13;
  for (let i = 0; i < SEG; i++) {
    const a1 = (i / SEG) * Math.PI * 2;
    const a2 = ((i + 0.5) / SEG) * Math.PI * 2;
    const a3 = ((i + 1) / SEG) * Math.PI * 2;
    const top1 = new THREE.Vector3(Math.cos(a1) * RIM_R, 0, Math.sin(a1) * RIM_R);
    const mid = new THREE.Vector3(Math.cos(a2) * (RIM_R + botR) / 2, -netDepth * 0.55, Math.sin(a2) * (RIM_R + botR) / 2);
    const top2 = new THREE.Vector3(Math.cos(a3) * RIM_R, 0, Math.sin(a3) * RIM_R);
    const bot = new THREE.Vector3(Math.cos(a3) * botR, -netDepth, Math.sin(a3) * botR);
    const bot0 = new THREE.Vector3(Math.cos(a1) * botR, -netDepth, Math.sin(a1) * botR);
    netPts.push(top1, mid, mid, top2, mid, bot0, mid, bot);
  }
  const netGeo = new THREE.BufferGeometry().setFromPoints(netPts);
  const net = new THREE.LineSegments(netGeo, new THREE.LineBasicMaterial({ color: 0xf5f5f5 }));
  net.position.copy(rimC);
  g.add(net);

  scene.add(g);
  hoops.push({ s, rim: rimC, net, boardX: s * BOARD_X });
}
makeHoop(1);
makeHoop(-1);
const ATTACK = hoops[0]; // player always attacks +x hoop

// ---------------------------------------------------------------- ball
const ballTex = canvasTex(256, 256, (ctx, w, h) => {
  const g = ctx.createRadialGradient(w * 0.4, h * 0.35, 20, w / 2, h / 2, w * 0.7);
  g.addColorStop(0, '#e8703a'); g.addColorStop(1, '#b34a1e');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#2a1408'; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(w / 2, 0); ctx.lineTo(w / 2, h); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(-w * 0.15, h / 2, w * 0.42, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(w * 1.15, h / 2, w * 0.42, 0, Math.PI * 2); ctx.stroke();
});
const ball = new THREE.Mesh(
  new THREE.SphereGeometry(BALL_R, 24, 24),
  new THREE.MeshStandardMaterial({ map: ballTex, roughness: 0.65 })
);
ball.castShadow = true;
scene.add(ball);
const ballVel = new THREE.Vector3();
let ballState = 'held'; // held | flight | loose

// ---------------------------------------------------------------- characters
function makeHumanoid({ jersey, trim, shorts, skin }) {
  const g = new THREE.Group();
  const jerseyMat = new THREE.MeshStandardMaterial({ color: jersey, roughness: 0.75 });
  const trimMat = new THREE.MeshStandardMaterial({ color: trim, roughness: 0.75 });
  const shortsMat = new THREE.MeshStandardMaterial({ color: shorts, roughness: 0.75 });
  const skinMat = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.6 });
  const shoeMat = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.45 });

  const body = new THREE.Group(); // everything that crouches
  g.add(body);

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.42, 4, 12), jerseyMat);
  torso.position.y = 1.28;
  torso.castShadow = true;
  body.add(torso);
  const hips = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.17, 0.24, 12), shortsMat);
  hips.position.y = 0.95;
  hips.castShadow = true;
  body.add(hips);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.115, 16, 16), skinMat);
  head.position.y = 1.74;
  head.castShadow = true;
  body.add(head);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.1, 8), skinMat);
  neck.position.y = 1.62;
  body.add(neck);
  const headband = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.022, 6, 16), trimMat);
  headband.position.y = 1.77;
  headband.rotation.x = Math.PI / 2 - 0.25;
  body.add(headband);

  const limbs = {};
  const mkArm = side => {
    const shoulder = new THREE.Group();
    shoulder.position.set(0.24 * side, 1.5, 0);
    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.24, 3, 8), skinMat);
    upper.position.y = -0.16;
    upper.castShadow = true;
    shoulder.add(upper);
    const elbow = new THREE.Group();
    elbow.position.y = -0.3;
    const fore = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.22, 3, 8), skinMat);
    fore.position.y = -0.14;
    fore.castShadow = true;
    elbow.add(fore);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 8), skinMat);
    hand.position.y = -0.28;
    elbow.add(hand);
    shoulder.add(elbow);
    body.add(shoulder);
    return { shoulder, elbow };
  };
  const mkLeg = side => {
    const hip = new THREE.Group();
    hip.position.set(0.1 * side, 0.9, 0);
    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.3, 3, 8), shortsMat);
    thigh.position.y = -0.2;
    thigh.castShadow = true;
    hip.add(thigh);
    const knee = new THREE.Group();
    knee.position.y = -0.42;
    const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.3, 3, 8), skinMat);
    shin.position.y = -0.2;
    shin.castShadow = true;
    knee.add(shin);
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.09, 0.26), shoeMat);
    shoe.position.set(0, -0.44, 0.05);
    shoe.castShadow = true;
    knee.add(shoe);
    hip.add(knee);
    body.add(hip);
    return { hip, knee };
  };
  limbs.armL = mkArm(-1); limbs.armR = mkArm(1);
  limbs.legL = mkLeg(-1); limbs.legR = mkLeg(1);
  return { group: g, body, limbs, runPhase: 0 };
}

const player = makeHumanoid({ jersey: 0x1b3f8f, trim: 0xffd23f, shorts: 0x12275c, skin: 0x8a5a34 });
player.group.position.set(0, 0, 0);
scene.add(player.group);

const defender = makeHumanoid({ jersey: 0x8f1b1b, trim: 0xffffff, shorts: 0x5c1212, skin: 0xc89060 });
defender.group.position.set(6, 0, 0);
scene.add(defender.group);

// ---------------------------------------------------------------- audio (tiny synth)
let AC = null;
function audio() {
  if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { } }
  if (AC && AC.state === 'suspended') AC.resume();
  return AC;
}
function noiseBurst(dur, vol, freq, q = 1) {
  const ac = audio(); if (!ac) return;
  const n = ac.createBufferSource();
  const len = Math.max(1, (dur * ac.sampleRate) | 0);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  n.buffer = buf;
  const f = ac.createBiquadFilter();
  f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
  const g = ac.createGain();
  g.gain.setValueAtTime(vol, ac.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
  n.connect(f).connect(g).connect(ac.destination);
  n.start();
}
function tone(freq, dur, vol, type = 'square') {
  const ac = audio(); if (!ac) return;
  const o = ac.createOscillator();
  o.type = type; o.frequency.value = freq;
  const g = ac.createGain();
  g.gain.setValueAtTime(vol, ac.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
  o.connect(g).connect(ac.destination);
  o.start(); o.stop(ac.currentTime + dur);
}
const sfx = {
  bounce: () => noiseBurst(0.07, 0.25, 220, 0.8),
  rim: () => tone(320, 0.18, 0.12, 'triangle'),
  swish: () => noiseBurst(0.28, 0.3, 2400, 0.6),
  cheer: () => { noiseBurst(1.3, 0.35, 900, 0.4); noiseBurst(1.1, 0.2, 1600, 0.4); },
  buzzer: () => tone(210, 0.9, 0.3, 'sawtooth'),
  release: () => noiseBurst(0.08, 0.12, 1200, 1),
};

// ---------------------------------------------------------------- HUD
const $ = id => document.getElementById(id);
const hud = $('hud'), menu = $('menu');
const scoreEl = $('score').querySelector('.value');
const clockEl = $('clock').querySelector('.value');
const shotEl = $('shotclock').querySelector('.value');
const bestEl = $('best').querySelector('.value');
const meterWrap = $('meterwrap'), meterFill = $('meterfill'), meterZone = $('meterzone');
const msgEl = $('msg');

let best = 0;
try { best = parseInt(localStorage.getItem('fablehigh_best') || '0', 10) || 0; } catch (e) { }
bestEl.textContent = best;

let msgTimer = 0;
function showMsg(text, color = '#ffd23f', dur = 1.4) {
  msgEl.textContent = text;
  msgEl.style.color = color;
  msgEl.style.opacity = 1;
  msgTimer = dur;
}
function fmtTime(t) {
  t = Math.max(0, Math.ceil(t));
  return `${(t / 60) | 0}:${String(t % 60).padStart(2, '0')}`;
}

// ---------------------------------------------------------------- input
const keys = {};
addEventListener('keydown', e => {
  if (e.code === 'Space') e.preventDefault();
  audio();
  if (e.code === 'Enter' && phase !== 'playing') startGame();
  if (!keys[e.code] && e.code === 'Space' && phase === 'playing' && ballState === 'held' && !charging) beginCharge();
  keys[e.code] = true;
});
addEventListener('keyup', e => {
  keys[e.code] = false;
  if (e.code === 'Space' && charging) releaseShot();
});

// ---------------------------------------------------------------- game state
let phase = 'menu'; // menu | playing | over
let score = 0, gameClock = GAME_LEN, shotClock = SHOT_CLOCK;
let charging = false, chargeT = 0, chargeIdeal = 0.6, chargeWin = 0.07;
let playerVy = 0, playerAirY = 0;
let shotFollow = 0;           // arms-up follow-through timer
let attempt = null;           // {points, rimHit, released, swish}
let netPulse = 0;
const camTarget = new THREE.Vector3(0, 2, 0);
const camPos = new THREE.Vector3(-8, 5, 10);

function resetPossession(msg) {
  // ball checks up at a random spot in the frontcourt
  const ang = (Math.random() * 1.6 - 0.8);
  const r = 7.8 + Math.random() * 2.5;
  const bx = THREE.MathUtils.clamp(HOOP_X - Math.cos(ang) * r, -2, HOOP_X - 4);
  const bz = THREE.MathUtils.clamp(Math.sin(ang) * r * 1.2, -6.5, 6.5);
  ball.position.set(bx, BALL_R + 0.9, bz);
  ballVel.set(0, 0, 0);
  ballState = 'loose';
  attempt = null;
  shotClock = SHOT_CLOCK;
  // defender resets between ball and hoop
  const d = defender.group.position;
  d.set((bx + HOOP_X) / 2 + 1.2, 0, bz * 0.5);
  if (msg) showMsg(msg, '#7fd4ff', 1.1);
}

function startGame() {
  score = 0; gameClock = GAME_LEN; shotClock = SHOT_CLOCK;
  charging = false; attempt = null; excitement = 0;
  player.group.position.set(HOOP_X - 9, 0, 0);
  ball.position.set(player.group.position.x, 1, 0);
  ballState = 'held';
  defender.group.position.set(HOOP_X - 5, 0, 0.5);
  menu.style.display = 'none';
  hud.style.display = 'block';
  phase = 'playing';
  showMsg('GAME ON!', '#7fd4ff', 1.2);
}

function endGame() {
  phase = 'over';
  charging = false;
  meterWrap.style.opacity = 0;
  sfx.buzzer();
  if (score > best) {
    best = score;
    try { localStorage.setItem('fablehigh_best', String(best)); } catch (e) { }
  }
  bestEl.textContent = best;
  $('finalscore').style.display = 'block';
  $('finalscore').textContent = `FINAL SCORE: ${score}  ·  BEST: ${best}`;
  $('press').textContent = 'PRESS ENTER TO PLAY AGAIN';
  menu.querySelector('h2').textContent = 'GAME OVER';
  menu.style.display = 'flex';
}

// ---------------------------------------------------------------- shooting
function hoopDist() {
  const p = player.group.position;
  return Math.hypot(ATTACK.rim.x - p.x, ATTACK.rim.z - p.z);
}
function isThree(p) {
  const d = Math.hypot(ATTACK.rim.x - p.x, ATTACK.rim.z - p.z);
  const corner = Math.abs(p.z) > 6.4;
  return d > (corner ? 6.71 : 7.24) && Math.abs(p.x) < COURT_L / 2 && Math.abs(p.z) < COURT_W / 2;
}
function beginCharge() {
  charging = true;
  chargeT = 0;
  const d = hoopDist();
  chargeIdeal = THREE.MathUtils.clamp(0.34 + d / 15.5, 0.34, 0.94);
  chargeWin = Math.max(0.035, 0.085 - d * 0.0038);
  meterZone.style.left = `${(chargeIdeal - chargeWin) * 100}%`;
  meterZone.style.width = `${chargeWin * 2 * 100}%`;
  meterWrap.style.opacity = 1;
}
function contestFactor() {
  const p = player.group.position, d = defender.group.position;
  const dist = Math.hypot(p.x - d.x, p.z - d.z);
  if (dist > 1.9) return 0;
  // defender must be roughly between player and hoop
  const toHoop = new THREE.Vector2(ATTACK.rim.x - p.x, ATTACK.rim.z - p.z).normalize();
  const toDef = new THREE.Vector2(d.x - p.x, d.z - p.z).normalize();
  const facing = Math.max(0, toHoop.dot(toDef));
  return (1.9 - dist) / 1.9 * facing;
}
function releaseShot() {
  charging = false;
  meterWrap.style.opacity = 0;
  if (phase !== 'playing' || ballState !== 'held') return;

  const p = player.group.position;
  const d = hoopDist();
  const three = isThree(p);
  const layup = d < 2.3;
  const powerErr = THREE.MathUtils.clamp(chargeT - chargeIdeal, -0.5, 0.5);
  const inZone = Math.abs(powerErr) <= chargeWin;
  const contest = contestFactor();
  const moveSpeed = Math.hypot(pVel.x, pVel.z);

  // launch from above the player's head
  const from = new THREE.Vector3(p.x, 2.05, p.z);
  const target = ATTACK.rim.clone();
  target.y = RIM_H + 0.12;

  // error model
  let err = Math.abs(powerErr) * (inZone ? 0.35 : 1.0);
  err += contest * 0.09 + moveSpeed * 0.008 + d * 0.004;
  if (layup) err *= 0.3;
  const dir = new THREE.Vector2(target.x - from.x, target.z - from.z).normalize();
  const lat = new THREE.Vector2(-dir.y, dir.x);
  const depthOff = powerErr * d * 0.85 + (Math.random() - 0.5) * err * d * 0.5;
  const latOff = (Math.random() - 0.5) * 2 * err * d * 0.55;
  target.x += dir.x * depthOff + lat.x * latOff;
  target.z += dir.y * depthOff + lat.y * latOff;

  // ballistic solve for a chosen flight time
  const T = layup ? 0.62 : 0.78 + d * 0.062;
  ballVel.set(
    (target.x - from.x) / T,
    (target.y - from.y - 0.5 * GRAV * T * T) / T,
    (target.z - from.z) / T
  );
  ball.position.copy(from);
  ballState = 'flight';
  attempt = { points: three ? 3 : 2, rimHit: false, boardHit: false, layup };
  shotClock = SHOT_CLOCK;
  playerVy = layup ? 3.4 : 2.9;
  shotFollow = 0.55;
  sfx.release();
  if (layup) showMsg('LAYUP!', '#ffffff', 0.7);
  else if (inZone && Math.abs(powerErr) < chargeWin * 0.45) showMsg('PERFECT RELEASE', '#50dc78', 0.8);
}

// ---------------------------------------------------------------- physics
function updateBall(dt) {
  if (ballState === 'held') {
    // dribble in the player's right hand
    const p = player.group.position, ry = player.group.rotation.y;
    const fwd = new THREE.Vector3(Math.sin(ry), 0, Math.cos(ry));
    const right = new THREE.Vector3(fwd.z, 0, -fwd.x);
    dribbleT += dt * (6 + Math.hypot(pVel.x, pVel.z) * 0.8);
    let by = Math.abs(Math.sin(dribbleT)) * 0.55 + BALL_R;
    if (charging) by = 1.55; // gathered for the shot
    ball.position.set(p.x + fwd.x * 0.22 + right.x * 0.34, by, p.z + fwd.z * 0.22 + right.z * 0.34);
    if (!charging && Math.abs(Math.sin(dribbleT)) < 0.06 && dribbleT - lastBounceT > 0.4) {
      lastBounceT = dribbleT;
      sfx.bounce();
    }
    return;
  }

  // integrate
  ballVel.y += GRAV * dt;
  ball.position.addScaledVector(ballVel, dt);

  // spin (visual)
  const sp = ballVel.length();
  if (sp > 0.1) {
    spinAxis.set(ballVel.z, 0, -ballVel.x).normalize();
    ball.rotateOnWorldAxis(spinAxis, sp * dt / BALL_R * 0.5);
  }

  // floor
  if (ball.position.y < BALL_R) {
    ball.position.y = BALL_R;
    if (Math.abs(ballVel.y) > 0.8) {
      ballVel.y = -ballVel.y * 0.72;
      ballVel.x *= 0.86; ballVel.z *= 0.86;
      sfx.bounce();
    } else {
      ballVel.y = 0;
      ballVel.x *= 0.975; ballVel.z *= 0.975;
    }
    if (ballState === 'flight') ballState = 'loose';
  }

  for (const h of hoops) {
    // backboard
    const bx = h.boardX, s = h.s;
    const inBoard = ball.position.y > 2.85 && ball.position.y < 4.02 && Math.abs(ball.position.z) < 0.95;
    if (inBoard) {
      const faceX = bx - s * (BALL_R + 0.026);
      if (s > 0 ? (ball.position.x > faceX && ballVel.x > 0 && ball.position.x < bx + 0.2)
                : (ball.position.x < faceX && ballVel.x < 0 && ball.position.x > bx - 0.2)) {
        ball.position.x = faceX;
        ballVel.x = -ballVel.x * 0.62;
        ballVel.y *= 0.88; ballVel.z *= 0.88;
        if (attempt) attempt.boardHit = true;
        sfx.rim();
      }
    }
    // rim (collide with the torus ring)
    if (Math.abs(ball.position.y - RIM_H) < 0.35) {
      relXZ.set(ball.position.x - h.rim.x, 0, ball.position.z - h.rim.z);
      if (relXZ.lengthSq() > 1e-6) {
        ringPt.copy(h.rim).addScaledVector(relXZ.normalize(), RIM_R);
        const dist = ball.position.distanceTo(ringPt);
        const minD = BALL_R + 0.022;
        if (dist < minD) {
          rimN.copy(ball.position).sub(ringPt).normalize();
          const vn = ballVel.dot(rimN);
          if (vn < 0) {
            ballVel.addScaledVector(rimN, -vn * 1.65);
            ballVel.multiplyScalar(0.82);
            ball.position.copy(ringPt).addScaledVector(rimN, minD + 0.002);
            if (attempt) attempt.rimHit = true;
            sfx.rim();
          }
        }
      }
    }
  }

  // scoring — ball crossing the rim plane downward inside the ring
  if (attempt && !attempt.released) {
    const prevY = ball.position.y - ballVel.y * dt;
    if (ballVel.y < 0 && prevY > RIM_H && ball.position.y <= RIM_H) {
      const dx = ball.position.x - ATTACK.rim.x, dz = ball.position.z - ATTACK.rim.z;
      if (dx * dx + dz * dz < (RIM_R - BALL_R * 0.45) ** 2) {
        const swish = !attempt.rimHit && !attempt.boardHit;
        score += attempt.points;
        scoreEl.textContent = score;
        netPulse = 1;
        excitement = 1;
        sfx.swish();
        sfx.cheer();
        showMsg(
          attempt.layup ? 'AND IN!' : swish ? `SWISH! +${attempt.points}` : `BUCKETS! +${attempt.points}`,
          attempt.points === 3 ? '#ffd23f' : '#50dc78', 1.5
        );
        attempt.released = true;
        // squeeze the ball through the net
        ballVel.x *= 0.15; ballVel.z *= 0.15; ballVel.y = Math.min(ballVel.y, -1.5);
        setTimeout(() => { if (phase === 'playing') resetPossession('CHECK BALL'); }, 900);
        return;
      }
    }
    if (ball.position.y < RIM_H - 0.8 && ballVel.y < 0) attempt.released = true; // miss confirmed
  }

  // pickup
  if (ballState === 'loose' && phase === 'playing') {
    const p = player.group.position;
    if (Math.hypot(ball.position.x - p.x, ball.position.z - p.z) < 0.85 && ball.position.y < 1.7) {
      ballState = 'held';
      attempt = null;
      shotClock = Math.min(shotClock, SHOT_CLOCK);
    }
  }

  // out of bounds → check it up
  if (Math.abs(ball.position.x) > APRON_L / 2 + 1.5 || Math.abs(ball.position.z) > APRON_W / 2 + 1.5) {
    if (phase === 'playing') resetPossession('OUT OF BOUNDS');
  }
}
let dribbleT = 0, lastBounceT = -1;
const spinAxis = new THREE.Vector3();
const relXZ = new THREE.Vector3(), ringPt = new THREE.Vector3(), rimN = new THREE.Vector3();

// ---------------------------------------------------------------- player + defender movement
const pVel = new THREE.Vector3();
function updatePlayer(dt) {
  const p = player.group.position;
  // camera-relative input
  let ix = 0, iz = 0;
  if (keys.KeyW || keys.ArrowUp) iz -= 1;
  if (keys.KeyS || keys.ArrowDown) iz += 1;
  if (keys.KeyA || keys.ArrowLeft) ix -= 1;
  if (keys.KeyD || keys.ArrowRight) ix += 1;

  let move = new THREE.Vector3();
  if (ix || iz) {
    const camF = new THREE.Vector3();
    camera.getWorldDirection(camF);
    camF.y = 0; camF.normalize();
    const camR = new THREE.Vector3(-camF.z, 0, camF.x);
    move.addScaledVector(camF, -iz).addScaledVector(camR, ix).normalize();
  }
  const sprint = keys.ShiftLeft || keys.ShiftRight;
  let speed = sprint ? 6.1 : 4.3;
  if (charging) speed *= 0.22;
  pVel.lerp(move.multiplyScalar(speed), 1 - Math.pow(0.0001, dt));
  p.x = THREE.MathUtils.clamp(p.x + pVel.x * dt, -APRON_L / 2 + 0.4, APRON_L / 2 - 0.4);
  p.z = THREE.MathUtils.clamp(p.z + pVel.z * dt, -APRON_W / 2 + 0.4, APRON_W / 2 - 0.4);

  // jump arc from shooting
  if (playerVy !== 0 || playerAirY > 0) {
    playerVy += GRAV * 1.6 * dt;
    playerAirY = Math.max(0, playerAirY + playerVy * dt);
    if (playerAirY === 0 && playerVy < 0) playerVy = 0;
  }
  p.y = playerAirY;

  // facing: hoop while charging/shooting, else movement direction
  const spd = Math.hypot(pVel.x, pVel.z);
  let targetRot = player.group.rotation.y;
  if (charging || shotFollow > 0) targetRot = Math.atan2(ATTACK.rim.x - p.x, ATTACK.rim.z - p.z);
  else if (spd > 0.4) targetRot = Math.atan2(pVel.x, pVel.z);
  let dr = targetRot - player.group.rotation.y;
  while (dr > Math.PI) dr -= Math.PI * 2;
  while (dr < -Math.PI) dr += Math.PI * 2;
  player.group.rotation.y += dr * Math.min(1, dt * 12);

  animateHumanoid(player, dt, spd, {
    dribbling: ballState === 'held' && !charging && shotFollow <= 0,
    charging, follow: shotFollow > 0,
  });
  if (shotFollow > 0) shotFollow -= dt;
  if (charging) {
    chargeT += dt / 1.15;
    if (chargeT >= 1.04) { chargeT = 1.04; releaseShot(); } // held too long — forced release
    meterFill.style.width = `${Math.min(100, chargeT * 100)}%`;
  }
}

function updateDefender(dt) {
  const d = defender.group.position, p = player.group.position;
  // stay between the ball-handler and the hoop
  const toHoop = new THREE.Vector3(ATTACK.rim.x - p.x, 0, ATTACK.rim.z - p.z);
  const dist = toHoop.length();
  toHoop.normalize();
  const guardDist = Math.min(1.35, Math.max(0.9, dist - 0.6));
  const target = new THREE.Vector3(p.x, 0, p.z).addScaledVector(toHoop, guardDist);
  const to = target.sub(d);
  to.y = 0;
  const gap = to.length();
  if (gap > 0.05) {
    const sp = Math.min(5.6, gap * 6);
    d.addScaledVector(to.normalize(), sp * dt);
  }
  // don't overlap the player
  const sep = new THREE.Vector3(d.x - p.x, 0, d.z - p.z);
  if (sep.length() < 0.55) {
    sep.setLength(0.55);
    d.x = p.x + sep.x; d.z = p.z + sep.z;
  }
  d.x = THREE.MathUtils.clamp(d.x, -APRON_L / 2 + 0.4, APRON_L / 2 - 0.4);
  d.z = THREE.MathUtils.clamp(d.z, -APRON_W / 2 + 0.4, APRON_W / 2 - 0.4);

  defender.group.rotation.y = Math.atan2(p.x - d.x, p.z - d.z);
  const spd = gap > 0.2 ? Math.min(5.6, gap * 6) : 0;
  animateHumanoid(defender, dt, spd, { armsUp: charging && contestFactor() > 0.05 });
}

function animateHumanoid(h, dt, speed, o = {}) {
  h.runPhase += dt * (3 + speed * 2.6);
  const L = h.limbs, run = Math.min(1, speed / 4);
  const sw = Math.sin(h.runPhase) * 0.75 * run;
  L.legL.hip.rotation.x = sw;
  L.legR.hip.rotation.x = -sw;
  L.legL.knee.rotation.x = Math.max(0, -Math.sin(h.runPhase)) * 0.9 * run;
  L.legR.knee.rotation.x = Math.max(0, Math.sin(h.runPhase)) * 0.9 * run;
  h.body.position.y = Math.abs(Math.sin(h.runPhase)) * 0.04 * run;

  const lerpRot = (obj, x, z = 0) => {
    obj.rotation.x += (x - obj.rotation.x) * Math.min(1, dt * 14);
    obj.rotation.z += (z - obj.rotation.z) * Math.min(1, dt * 14);
  };
  if (o.charging) {
    // gather: crouch, ball raised to set point
    h.body.position.y = -0.16;
    lerpRot(L.armR.shoulder, -2.1, 0.25);
    lerpRot(L.armL.shoulder, -1.9, -0.35);
    L.armR.elbow.rotation.x += (-1.4 - L.armR.elbow.rotation.x) * Math.min(1, dt * 14);
    L.armL.elbow.rotation.x += (-1.2 - L.armL.elbow.rotation.x) * Math.min(1, dt * 14);
    L.legL.hip.rotation.x = 0.5; L.legR.hip.rotation.x = 0.5;
    L.legL.knee.rotation.x = 0.9; L.legR.knee.rotation.x = 0.9;
  } else if (o.follow) {
    // follow-through: arms extended overhead, wrist flick
    lerpRot(L.armR.shoulder, -2.9, 0.1);
    lerpRot(L.armL.shoulder, -2.5, -0.3);
    L.armR.elbow.rotation.x += (-0.15 - L.armR.elbow.rotation.x) * Math.min(1, dt * 16);
    L.armL.elbow.rotation.x += (-0.3 - L.armL.elbow.rotation.x) * Math.min(1, dt * 16);
  } else if (o.armsUp) {
    lerpRot(L.armR.shoulder, -2.9, 0.5);
    lerpRot(L.armL.shoulder, -2.9, -0.5);
    L.armR.elbow.rotation.x *= 0.8; L.armL.elbow.rotation.x *= 0.8;
  } else if (o.dribbling) {
    // right arm pumps with the ball, left arm shields
    const pump = Math.abs(Math.sin(dribbleT));
    lerpRot(L.armR.shoulder, -0.45 - pump * 0.35, -0.15);
    L.armR.elbow.rotation.x += (-0.5 + pump * 0.3 - L.armR.elbow.rotation.x) * Math.min(1, dt * 18);
    lerpRot(L.armL.shoulder, Math.sin(h.runPhase) * 0.5 * run, -0.25);
    L.armL.elbow.rotation.x += (-0.4 - L.armL.elbow.rotation.x) * Math.min(1, dt * 10);
  } else {
    lerpRot(L.armR.shoulder, -Math.sin(h.runPhase) * 0.55 * run, 0.12);
    lerpRot(L.armL.shoulder, Math.sin(h.runPhase) * 0.55 * run, -0.12);
    L.armR.elbow.rotation.x += (-0.35 * run - L.armR.elbow.rotation.x) * Math.min(1, dt * 10);
    L.armL.elbow.rotation.x += (-0.35 * run - L.armL.elbow.rotation.x) * Math.min(1, dt * 10);
  }
}

// ---------------------------------------------------------------- camera
function updateCamera(dt) {
  const p = player.group.position;
  const toHoop = new THREE.Vector3(ATTACK.rim.x - p.x, 0, ATTACK.rim.z - p.z).normalize();
  const desired = new THREE.Vector3(p.x, 0, p.z).addScaledVector(toHoop, -5.6);
  desired.y = 3.1;
  const look = new THREE.Vector3().lerpVectors(
    new THREE.Vector3(p.x, 1.6, p.z), new THREE.Vector3(ATTACK.rim.x, RIM_H, ATTACK.rim.z), 0.42
  );
  if (ballState === 'flight') look.lerp(ball.position, 0.45);
  const k = 1 - Math.pow(0.001, dt);
  camPos.lerp(desired, k);
  camTarget.lerp(look, k);
  camera.position.copy(camPos);
  camera.lookAt(camTarget);
}

// ---------------------------------------------------------------- main loop
let last = performance.now(), hudTick = 0;
function animate(now) {
  requestAnimationFrame(animate);
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;
  const t = now / 1000;

  if (phase === 'playing') {
    gameClock -= dt;
    if (ballState === 'held') {
      shotClock -= dt;
      if (shotClock <= 0) {
        sfx.buzzer();
        resetPossession('SHOT CLOCK VIOLATION');
      }
    }
    if (gameClock <= 0) { gameClock = 0; endGame(); }
    updatePlayer(dt);
    updateDefender(dt);
    updateBall(dt);
  } else {
    // idle attract mode: slow camera orbit
    const a = t * 0.08;
    camPos.set(Math.cos(a) * 16, 6.5, Math.sin(a) * 16);
    camTarget.set(0, 2, 0);
    camera.position.copy(camPos);
    camera.lookAt(camTarget);
    updateBall(dt * 0);
  }

  if (phase === 'playing') updateCamera(dt);

  // ambience + FX
  excitement = Math.max(0, excitement - dt * 0.45);
  updateCrowd(t);
  if (netPulse > 0) {
    netPulse = Math.max(0, netPulse - dt * 2.2);
    const sQ = 1 + Math.sin(netPulse * Math.PI * 3) * 0.12 * netPulse;
    for (const h of hoops) h.net.scale.set(1, sQ, 1);
  }
  if (msgTimer > 0) {
    msgTimer -= dt;
    if (msgTimer <= 0) msgEl.style.opacity = 0;
  }

  hudTick -= dt;
  if (hudTick <= 0) {
    hudTick = 0.2;
    clockEl.textContent = fmtTime(gameClock);
    shotEl.textContent = Math.max(0, Math.ceil(shotClock));
    shotEl.style.color = shotClock < 6 ? '#ff5a4e' : '#fff';
    scoreEl.textContent = score;
    drawJumbotron();
  }

  renderer.render(scene, camera);
}
drawJumbotron();
requestAnimationFrame(animate);
