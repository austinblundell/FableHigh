import * as THREE from 'three';
import { Arena } from './arena.js';
import { Ball } from './ball.js';
import { Game } from './game.js';
import { Input } from './input.js';
import { UI } from './ui.js';
import { AudioEngine } from './audio.js';

// ---------- renderer ----------
const canvas = document.getElementById('game-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x0a0a12, 45, 90);

// ---------- environment reflections (hand-rolled light room) ----------
{
  const envScene = new THREE.Scene();
  envScene.background = new THREE.Color(0x0b0b12);
  const room = new THREE.Mesh(
    new THREE.BoxGeometry(30, 15, 30),
    new THREE.MeshBasicMaterial({ color: 0x141420, side: THREE.BackSide })
  );
  room.position.y = 6;
  envScene.add(room);
  for (let i = -1; i <= 1; i++) {
    const panel = new THREE.Mesh(
      new THREE.PlaneGeometry(6, 3),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    panel.position.set(i * 8, 12, 0);
    panel.rotation.x = Math.PI / 2;
    envScene.add(panel);
  }
  const warm = new THREE.Mesh(
    new THREE.PlaneGeometry(20, 4),
    new THREE.MeshBasicMaterial({ color: 0xffe0b0 })
  );
  warm.position.set(0, 6, -14.5);
  envScene.add(warm);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(envScene, 0.04).texture;
  pmrem.dispose();
}

// ---------- lights ----------
scene.add(new THREE.AmbientLight(0x404055, 0.7));
const hemi = new THREE.HemisphereLight(0xcfd4ff, 0x1a120a, 0.55);
scene.add(hemi);

const key = new THREE.DirectionalLight(0xfff2dd, 2.2);
key.position.set(8, 20, 10);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.left = -20;
key.shadow.camera.right = 20;
key.shadow.camera.top = 14;
key.shadow.camera.bottom = -14;
key.shadow.camera.near = 5;
key.shadow.camera.far = 45;
key.shadow.bias = -0.0004;
scene.add(key);

const fill = new THREE.DirectionalLight(0xbfc8ff, 0.7);
fill.position.set(-10, 16, -8);
scene.add(fill);

for (const x of [-9, 9]) {
  const spot = new THREE.SpotLight(0xffffff, 350, 40, Math.PI / 5, 0.45, 1.8);
  spot.position.set(x, 16.5, 0);
  spot.target.position.set(x, 0, 0);
  scene.add(spot, spot.target);
}

// ---------- world ----------
const ui = new UI();
const audio = new AudioEngine();
const input = new Input();
const arena = new Arena(scene);
const ball = new Ball(scene, audio);
const game = new Game(scene, ball, arena, ui, audio, input);

// ---------- camera ----------
const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(0, 10, 21);
camera.lookAt(0, 2, 0);
let camMode = 0; // 0 broadcast, 1 behind player
const camPos = new THREE.Vector3(0, 10, 21);
const camLook = new THREE.Vector3(0, 2, 0);
const _target = new THREE.Vector3();
const _look = new THREE.Vector3();

function updateCamera(dt) {
  const focus = ball.pos;
  if (camMode === 0) {
    const cx = THREE.MathUtils.clamp(focus.x * 0.72, -9.5, 9.5);
    _target.set(cx, 10.4, 19.6);
    _look.set(focus.x * 0.55, 1.5, focus.z * 0.25 - 0.6);
  } else {
    const me = game.players[0][game.controlled];
    const dir = game.possession === 0 ? 1 : -1;
    _target.set(me.pos.x - dir * 6.5, 4.2, me.pos.z * 0.85 + 2.5);
    _look.set(me.pos.x + dir * 4, 1.6, me.pos.z * 0.6);
  }
  const k = Math.min(1, dt * 4);
  camPos.lerp(_target, k);
  camLook.lerp(_look, k);
  camera.position.copy(camPos);
  camera.lookAt(camLook);
}

// ---------- menu wiring ----------
const menuEl = document.getElementById('menu');
document.getElementById('start-btn').addEventListener('click', () => {
  audio.init();
  audio.resume();
  const q = parseInt(document.querySelector('input[name="qlen"]:checked').value, 10);
  const diff = document.querySelector('input[name="diff"]:checked').value;
  game.setDifficulty(diff);
  ui.showMenu(false);
  ui.showHUD(true);
  game.startGame(q);
});
document.getElementById('restart-btn').addEventListener('click', () => {
  ui.hideGameOver();
  ui.showMenu(true);
  ui.showHUD(false);
  game.phase = 'menu';
});
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyP' || e.code === 'Escape') {
    if (game.phase === 'menu' || game.phase === 'gameover') return;
    game.paused = !game.paused;
    ui.showPause(game.paused);
  }
  if (e.code === 'KeyC') camMode = 1 - camMode;
  audio.resume();
});
window.addEventListener('pointerdown', () => audio.resume());

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- loop ----------
let last = performance.now();
let acc = 0;
const STEP = 1 / 120;

function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.1, (now - last) / 1000);
  last = now;

  acc += dt;
  while (acc >= STEP) {
    game.update(STEP);
    input.endFrame(); // consume key edges exactly once per physics step
    acc -= STEP;
  }
  audio.update(dt);
  ui.update(dt);
  updateCamera(dt);
  renderer.render(scene, camera);
}

ui.hideLoading();
ui.showMenu(true);
requestAnimationFrame(frame);

// debug / testing handle
window.__game = game;
