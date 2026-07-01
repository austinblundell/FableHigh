import * as THREE from 'three';
import { COURT, BALL_RADIUS, GRAVITY } from './constants.js';

// Ball with custom physics: floor bounce, rim torus collision, backboard,
// net drag, spin, and made-basket detection.
export class Ball {
  constructor(scene, audio) {
    this.audio = audio;
    this.radius = BALL_RADIUS;
    this.pos = new THREE.Vector3(0, 1.2, 0);
    this.vel = new THREE.Vector3();
    this.spin = new THREE.Vector3();
    // state: 'held' | 'pass' | 'shot' | 'loose'
    this.state = 'loose';
    this.holder = null;        // player entity when held
    this.passTarget = null;    // player entity during a pass
    this.lastShot = null;      // { shooter, points, team, time }
    this.lastTouchTeam = 0;
    this.rimHitSinceShot = false;
    this.onScore = null;       // callback(points, team, shooter, swish)
    this.onRimHit = null;
    this.time = 0;
    this.prevY = this.pos.y;
    this.scoredThisFlight = false;

    const tex = this.makeTexture();
    const mat = new THREE.MeshStandardMaterial({
      map: tex, roughness: 0.82, metalness: 0.0,
      bumpMap: tex, bumpScale: 0.4,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(this.radius, 32, 24), mat);
    this.mesh.castShadow = true;
    scene.add(this.mesh);

    this.rims = [
      new THREE.Vector3(COURT.RIM_X, COURT.RIM_HEIGHT, 0),
      new THREE.Vector3(-COURT.RIM_X, COURT.RIM_HEIGHT, 0),
    ];
  }

  makeTexture() {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 256;
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#e8722a');
    grad.addColorStop(0.5, '#d95f1e');
    grad.addColorStop(1, '#c65517');
    g.fillStyle = grad;
    g.fillRect(0, 0, 512, 256);
    // pebble grain
    for (let i = 0; i < 4000; i++) {
      g.fillStyle = Math.random() > 0.5 ? 'rgba(0,0,0,0.06)' : 'rgba(255,190,130,0.05)';
      g.fillRect(Math.random() * 512, Math.random() * 256, 1.5, 1.5);
    }
    // seams
    g.strokeStyle = '#2a1608';
    g.lineWidth = 4;
    g.beginPath(); g.moveTo(0, 128); g.lineTo(512, 128); g.stroke();
    g.beginPath(); g.moveTo(128, 0); g.lineTo(128, 256); g.stroke();
    g.beginPath(); g.moveTo(384, 0); g.lineTo(384, 256); g.stroke();
    for (const cx of [256, 0, 512]) {
      g.beginPath(); g.ellipse(cx, 128, 110, 128, 0, 0, Math.PI * 2); g.stroke();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  give(player) {
    this.state = 'held';
    this.holder = player;
    this.passTarget = null;
    this.lastTouchTeam = player.team;
    this.scoredThisFlight = false;
  }

  shoot(from, velocity, shooter, points) {
    this.state = 'shot';
    this.holder = null;
    this.pos.copy(from);
    this.vel.copy(velocity);
    this.lastShot = { shooter, points, team: shooter.team, time: this.time };
    this.lastTouchTeam = shooter.team;
    this.rimHitSinceShot = false;
    this.scoredThisFlight = false;
    this.spin.set(0, 0, 8 * Math.sign(-velocity.x || 1));
  }

  pass(from, velocity, passer, target) {
    this.state = 'pass';
    this.holder = null;
    this.pos.copy(from);
    this.vel.copy(velocity);
    this.passTarget = target;
    this.lastTouchTeam = passer.team;
  }

  makeLoose(kickVel = null) {
    this.state = 'loose';
    this.holder = null;
    this.passTarget = null;
    if (kickVel) this.vel.copy(kickVel);
  }

  update(dt) {
    this.time += dt;
    if (this.state === 'held') {
      // Position handled by game (dribble animation). Just sync mesh.
      this.mesh.position.copy(this.pos);
      return;
    }

    this.prevY = this.pos.y;
    this.vel.y += GRAVITY * dt;
    // near-negligible air drag (the shot solver assumes pure ballistics)
    this.vel.multiplyScalar(1 - 0.002 * dt);
    this.pos.addScaledVector(this.vel, dt);

    this.collideFloor();
    this.collideRims(dt);
    this.collideBoards();
    this.netDrag(dt);
    this.detectScore();

    this.mesh.position.copy(this.pos);
    this.mesh.rotation.x += this.spin.x * dt + this.vel.length() * dt * 1.5;
    this.mesh.rotation.z += this.spin.z * dt;
  }

  collideFloor() {
    if (this.pos.y < this.radius) {
      this.pos.y = this.radius;
      if (this.vel.y < -0.4) {
        this.audio.bounce(Math.min(1, -this.vel.y / 8));
        this.vel.y = -this.vel.y * 0.76;
        this.vel.x *= 0.86;
        this.vel.z *= 0.86;
        if (this.state === 'shot' || this.state === 'pass') this.state = 'loose';
      } else {
        this.vel.y = 0;
        this.vel.x *= 0.965;
        this.vel.z *= 0.965;
        if (this.state === 'shot' || this.state === 'pass') this.state = 'loose';
      }
    }
  }

  collideRims(dt) {
    for (const rim of this.rims) {
      const rel = this.pos.clone().sub(rim);
      const horiz = Math.hypot(rel.x, rel.z);
      if (Math.abs(rel.y) > 0.6 || horiz > 0.7) continue;
      // closest point on the rim circle
      let nx = rel.x, nz = rel.z;
      const hl = Math.hypot(nx, nz) || 1e-6;
      nx /= hl; nz /= hl;
      const cp = new THREE.Vector3(rim.x + nx * COURT.RIM_RADIUS, rim.y, rim.z + nz * COURT.RIM_RADIUS);
      const delta = this.pos.clone().sub(cp);
      const dist = delta.length();
      const minDist = this.radius + COURT.RIM_TUBE;
      if (dist < minDist && dist > 1e-6) {
        const n = delta.multiplyScalar(1 / dist);
        this.pos.copy(cp).addScaledVector(n, minDist + 0.001);
        const vn = this.vel.dot(n);
        if (vn < 0) {
          this.vel.addScaledVector(n, -vn * 1.45); // restitution ~0.45
          this.vel.x += (Math.random() - 0.5) * 0.18;
          this.vel.z += (Math.random() - 0.5) * 0.18;
          // rim contact kills pace so misses die near the hoop
          this.vel.x *= 0.82;
          this.vel.z *= 0.82;
          if (Math.abs(vn) > 1.2) this.audio.rimClank();
          if (this.state === 'shot') this.rimHitSinceShot = true;
          if (this.onRimHit) this.onRimHit();
        }
      }
    }
  }

  collideBoards() {
    for (const side of [1, -1]) {
      const bx = COURT.BOARD_X * side;
      const withinY = this.pos.y > COURT.BOARD_BOTTOM - this.radius &&
                      this.pos.y < COURT.BOARD_BOTTOM + COURT.BOARD_HEIGHT + this.radius;
      const withinZ = Math.abs(this.pos.z) < COURT.BOARD_WIDTH / 2 + this.radius;
      if (!withinY || !withinZ) continue;
      // court-facing plane of the board
      const face = bx - side * 0.02;
      const nearFace = side > 0
        ? this.pos.x > face - this.radius && this.pos.x < bx + 0.1
        : this.pos.x < face + this.radius && this.pos.x > bx - 0.1;
      if (nearFace) {
        const movingIn = side > 0 ? this.vel.x > 0 : this.vel.x < 0;
        if (movingIn) {
          this.pos.x = face - side * this.radius;
          this.vel.x = -this.vel.x * 0.62;
          this.vel.y *= 0.92;
          this.vel.z *= 0.92;
          this.audio.boardThud();
          if (this.state === 'shot') this.rimHitSinceShot = true;
        }
      }
    }
  }

  // Slow the ball inside the net cylinder so swishes read visually.
  netDrag(dt) {
    for (const rim of this.rims) {
      const horiz = Math.hypot(this.pos.x - rim.x, this.pos.z - rim.z);
      if (horiz < COURT.RIM_RADIUS && this.pos.y < rim.y && this.pos.y > rim.y - 0.45) {
        this.vel.x *= 1 - 3.2 * dt;
        this.vel.z *= 1 - 3.2 * dt;
        if (this.vel.y < -1.5) this.vel.y += 7.5 * dt;
      }
    }
  }

  detectScore() {
    if (this.scoredThisFlight) return;
    if (this.vel.y >= 0) return;
    for (let h = 0; h < 2; h++) {
      const rim = this.rims[h];
      if (this.prevY >= rim.y && this.pos.y < rim.y) {
        const horiz = Math.hypot(this.pos.x - rim.x, this.pos.z - rim.z);
        if (horiz < COURT.RIM_RADIUS * 0.9) {
          this.scoredThisFlight = true;
          // team attacking hoop h: hoop 0 is +X (home attacks it)
          const scoringTeam = h === 0 ? 0 : 1;
          const fresh = this.lastShot && (this.time - this.lastShot.time) < 6 && this.lastShot.team === scoringTeam;
          const points = fresh ? this.lastShot.points : 2;
          const shooter = fresh ? this.lastShot.shooter : null;
          const swish = !this.rimHitSinceShot && this.state === 'shot';
          if (swish) this.audio.swish();
          if (this.onScore) this.onScore(points, scoringTeam, shooter, swish);
        }
      }
    }
  }
}
