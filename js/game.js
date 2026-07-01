import * as THREE from 'three';
import {
  COURT, RULES, TEAMS, ROSTER, PLAYER_NAMES, OFFENSE_SPOTS,
  attackDir, GRAVITY,
} from './constants.js';
import { PlayerModel } from './player.js';

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();

function gauss() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

class Player {
  constructor(scene, team, index) {
    this.team = team;
    this.index = index;
    this.def = ROSTER[index];
    this.name = PLAYER_NAMES[team][index];
    this.number = [3, 11, 23, 34, 50][index] + team * 4;
    this.model = new PlayerModel(TEAMS[team], this.def, this.number);
    scene.add(this.model.group);
    this.pos = this.model.group.position;
    this.vel = new THREE.Vector3();
    this.facing = new THREE.Vector3(attackDir(team), 0, 0);
    this.py = 0;         // jump height
    this.vy = 0;
    this.stumble = 0;    // failed-steal stagger timer
    this.thinkTimer = Math.random() * 0.3;
    this.target = new THREE.Vector3((Math.random() - 0.5) * 8, 0, (Math.random() - 0.5) * 8);
    this.wantSprint = false;
    this.cpuShot = null; // { t } while CPU winds up a shot
    this.spotJitter = new THREE.Vector3();
  }

  get scale() { return this.def.h / 2.0; }
  chestPos(out) { return out.set(this.pos.x, 1.3 * this.scale + this.py, this.pos.z); }

  face(dirX, dirZ) {
    if (Math.abs(dirX) + Math.abs(dirZ) < 1e-4) return;
    this.facing.set(dirX, 0, dirZ).normalize();
  }

  jump(v = 4.4) {
    if (this.py <= 0.001) { this.vy = v; this.py = 0.002; }
  }

  distTo(p) { return Math.hypot(this.pos.x - p.x, this.pos.z - p.z); }

  update(dt, frozen) {
    if (this.stumble > 0) this.stumble -= dt;
    // steering toward this.target (set by AI or user input each frame)
    const maxSpeed = this.def.speed * (this.wantSprint ? 1.22 : 1) * (this.cpuShot ? 0 : 1) * (this.stumble > 0 ? 0.15 : 1);
    _v1.set(this.target.x - this.pos.x, 0, this.target.z - this.pos.z);
    const dist = _v1.length();
    let desired = 0;
    if (dist > 0.08 && !frozen) desired = Math.min(maxSpeed, dist * 4.5);
    if (dist > 1e-4) _v1.multiplyScalar(desired / dist);
    const accel = this.py > 0 ? 1.5 : 11;
    this.vel.x += (_v1.x - this.vel.x) * Math.min(1, accel * dt);
    this.vel.z += (_v1.z - this.vel.z) * Math.min(1, accel * dt);
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    // stay on the floor area
    this.pos.x = clamp(this.pos.x, -16.2, 16.2);
    this.pos.z = clamp(this.pos.z, -9.4, 9.4);

    // jump physics
    if (this.py > 0 || this.vy !== 0) {
      this.vy += GRAVITY * dt;
      this.py += this.vy * dt;
      if (this.py <= 0) { this.py = 0; this.vy = 0; }
    }
    this.pos.y = this.py;

    // facing: turn smoothly toward movement or explicit facing
    const speed = Math.hypot(this.vel.x, this.vel.z);
    if (speed > 0.6) this.face(this.vel.x, this.vel.z);
    const targetRot = Math.atan2(this.facing.x, this.facing.z);
    let rot = this.model.group.rotation.y;
    let diff = targetRot - rot;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.model.group.rotation.y = rot + diff * Math.min(1, dt * 10);

    this.model.update(dt, speed);
  }
}

export class Game {
  constructor(scene, ball, arena, ui, audio, input) {
    this.scene = scene;
    this.ball = ball;
    this.arena = arena;
    this.ui = ui;
    this.audio = audio;
    this.input = input;

    this.players = [[], []];
    for (let t = 0; t < 2; t++) {
      for (let i = 0; i < 5; i++) this.players[t].push(new Player(scene, t, i));
    }
    this.allPlayers = [...this.players[0], ...this.players[1]];

    this.phase = 'menu'; // menu | freeze | live | dead | gameover
    this.score = [0, 0];
    this.quarter = 1;
    this.quarterSeconds = 180;
    this.gameClock = 180;
    this.shotClock = RULES.SHOT_CLOCK;
    this.possession = 0;
    this.controlled = 0; // index on home team
    this.freezeTimer = 0;
    this.deadTimer = 0;
    this.deadNext = null;
    this.charge = 0;
    this.charging = false;
    this.dribblePhase = 0;
    this.passInfo = null;
    this.stealCooldown = 0;
    this.stealGrace = 0; // CPU can't strip right after a reset / possession change
    this.pendingQuarterEnd = false;
    this.paused = false;
    this.difficulty = { cpuSpeed: 1, cpuShot: 0.79, cpuSteal: 0.1 };

    ball.onScore = (pts, team, shooter, swish) => this.handleScore(pts, team, shooter, swish);

    // park everyone for the menu backdrop
    this.allPlayers.forEach((p, i) => {
      p.pos.set(-8 + i * 1.8, 0, i % 2 ? 4 : -4);
      p.target.copy(p.pos);
    });
    ball.pos.set(0, 1.5, 0);
    ball.vel.set(0, 2, 0);
    ball.makeLoose();
  }

  setDifficulty(level) {
    this.difficulty = {
      Rookie: { cpuSpeed: 0.88, cpuShot: 0.76, cpuSteal: 0.05 },
      Pro: { cpuSpeed: 1.0, cpuShot: 0.82, cpuSteal: 0.09 },
      'All-Star': { cpuSpeed: 1.08, cpuShot: 0.87, cpuSteal: 0.15 },
    }[level] || this.difficulty;
  }

  startGame(quarterMinutes) {
    this.quarterSeconds = quarterMinutes * 60;
    this.score = [0, 0];
    this.quarter = 1;
    this.gameClock = this.quarterSeconds;
    this.pendingQuarterEnd = false;
    this.ui.setScore(0, 0);
    this.ui.hideGameOver();
    this.setupInbound(0, _v1.set(-13.6, 0, 3), `${TEAMS[0].name} BALL`, 'Q1 — TIP');
    this.syncBoards();
  }

  quarterLabel() {
    return this.quarter <= RULES.QUARTERS ? `Q${this.quarter}` : `OT${this.quarter - RULES.QUARTERS > 1 ? this.quarter - RULES.QUARTERS : ''}`;
  }

  hoopPos(team) {
    return _v3.set(COURT.RIM_X * attackDir(team), COURT.RIM_HEIGHT, 0);
  }

  // ---------- flow control ----------
  setupInbound(team, spot, msg, sub = '') {
    this.possession = team;
    this.shotClock = RULES.SHOT_CLOCK;
    this.phase = 'freeze';
    this.freezeTimer = 1.15;
    this.stealGrace = 3.2;
    this.charging = false;
    this.ui.showMeter(false);
    if (msg) this.ui.flash(msg, sub, 1.4);
    this.ui.setPossession(team);

    const d = attackDir(team);
    const rimX = COURT.RIM_X * d;
    const handler = this.players[team][0];
    const sx = clamp(spot.x, -13.8, 13.8), sz = clamp(spot.z, -7, 7);
    handler.pos.set(sx, 0, sz);
    handler.vel.set(0, 0, 0);
    handler.target.set(sx, 0, sz);
    // teammates take their half-court spacing spots around the attacked rim
    for (let i = 1; i < 5; i++) {
      const p = this.players[team][i];
      const spotDef = OFFENSE_SPOTS[i];
      p.pos.set(clamp(rimX - d * (spotDef.dx + 1.5), -13.5, 13.5), 0, spotDef.z);
      p.vel.set(0, 0, 0);
      p.target.copy(p.pos);
      p.cpuShot = null;
    }
    // defense sets up between its mark and the rim it protects
    for (let i = 0; i < 5; i++) {
      const p = this.players[1 - team][i];
      const mark = this.players[team][i];
      _v2.set(rimX - mark.pos.x, 0, -mark.pos.z).normalize();
      p.pos.set(
        clamp(mark.pos.x + _v2.x * 2.2, -13, 13),
        0,
        clamp(mark.pos.z + _v2.z * 2.2, -7, 7)
      );
      p.vel.set(0, 0, 0);
      p.target.copy(p.pos);
      p.cpuShot = null;
    }
    this.ball.give(handler);
    this.dribblePhase = 0;
    if (team === 0) this.controlled = 0;
    else this.controlled = this.nearestHomeToBall();
    this.updateControlledLabel();
  }

  nearestHomeToBall() {
    let best = 0, bd = 1e9;
    this.players[0].forEach((p, i) => {
      const d = p.distTo(this.ball.pos);
      if (d < bd) { bd = d; best = i; }
    });
    return best;
  }

  updateControlledLabel() {
    const p = this.players[0][this.controlled];
    this.ui.setControlled(`${p.name}  •  #${p.number}  •  ${p.def.pos}`);
  }

  handleScore(points, team, shooter) {
    if (this.phase === 'gameover' || this.phase === 'menu') return;
    this.score[team] += points;
    this.ui.setScore(this.score[0], this.score[1]);
    this.audio.cheer(team === 0 ? 1 : 0.5);
    const swish = !this.ball.rimHitSinceShot;
    const label = points === 3 ? 'THREE POINTER!' : 'BUCKET!';
    const who = shooter ? `${shooter.name} (${TEAMS[team].short})` : TEAMS[team].short;
    this.ui.flash(swish && shooter ? 'SWISH! ' + label : label, who, 1.6);
    this.syncBoards();

    this.phase = 'dead';
    this.deadTimer = 1.5;
    const scoredHoopX = COURT.RIM_X * attackDir(team);
    this.deadNext = () => {
      const spot = _v1.set(Math.sign(scoredHoopX) * 13.6, 0, 2.5 * (Math.random() > 0.5 ? 1 : -1));
      this.setupInbound(1 - team, spot, `${TEAMS[1 - team].name} BALL`);
    };
  }

  turnover(newTeam, reason, spot) {
    this.audio.whistle();
    this.phase = 'dead';
    this.deadTimer = 1.1;
    this.charging = false;
    this.ui.showMeter(false);
    this.ui.flash(reason, `${TEAMS[newTeam].name} BALL`, 1.5);
    const s = spot.clone();
    this.deadNext = () => this.setupInbound(newTeam, s, null);
  }

  endQuarter() {
    this.audio.buzzer();
    this.pendingQuarterEnd = false;
    const isLast = this.quarter >= RULES.QUARTERS;
    if (isLast && this.score[0] !== this.score[1]) {
      this.phase = 'gameover';
      this.ui.showMeter(false);
      this.audio.cheer(1);
      this.ui.showGameOver(this.score[0], this.score[1]);
      return;
    }
    this.quarter++;
    this.gameClock = this.quarter > RULES.QUARTERS ? RULES.OT_SECONDS : this.quarterSeconds;
    const label = this.quarter > RULES.QUARTERS ? 'OVERTIME' : `${this.quarterLabel()} START`;
    const team = (this.quarter + 1) % 2; // alternate openings
    this.phase = 'dead';
    this.deadTimer = 2.0;
    this.ui.flash(isLast ? 'OVERTIME!' : 'END OF QUARTER', '', 1.8);
    this.deadNext = () => {
      const d = attackDir(team);
      this.setupInbound(team, _v1.set(-d * 13.6, 0, -2.5), label);
    };
    this.syncBoards();
  }

  syncBoards() {
    this.arena.updateJumbotron({
      home: this.score[0], away: this.score[1],
      quarterLabel: this.quarterLabel(),
      clock: this.ui.fmtClock(this.gameClock),
    });
  }

  // ---------- shooting / passing ----------
  shotPoints(shooter) {
    const rim = this.hoopPos(shooter.team);
    const dx = shooter.pos.x - rim.x, dz = shooter.pos.z - rim.z;
    const dist = Math.hypot(dx, dz);
    const threshold = Math.abs(shooter.pos.z) > 6.4 ? COURT.THREE_CORNER : COURT.THREE_R;
    return dist > threshold ? 3 : 2;
  }

  releaseShot(shooter, quality) {
    const rim = this.hoopPos(shooter.team).clone();
    const start = _v1.set(shooter.pos.x, (2.05 + 0.2) * shooter.scale + shooter.py, shooter.pos.z);
    start.x += shooter.facing.x * 0.15;
    start.z += shooter.facing.z * 0.15;
    const dist = Math.hypot(rim.x - start.x, rim.z - start.z);
    const points = this.shotPoints(shooter);
    const isLayup = dist < 2.4;

    // contest pressure from nearby airborne/close defenders
    let contest = 0;
    for (const d of this.players[1 - shooter.team]) {
      const dd = d.distTo(shooter.pos);
      if (dd < 2.0) contest += (2.0 - dd) * (d.py > 0.15 ? 1.4 : 0.5);
    }
    contest = Math.min(contest, 2.2);
    const moving = Math.hypot(shooter.vel.x, shooter.vel.z);
    const q = clamp(quality, 0, 1);
    let sigma;
    if (isLayup) {
      sigma = (0.03 + (1 - q) * 0.08 + contest * 0.05) * (1.35 - shooter.def.skill * 0.6);
    } else {
      sigma = (0.032 + (1 - q) * 0.34 + dist * 0.0065 + moving * 0.016 + contest * 0.055)
            * (1.5 - shooter.def.skill * 0.8);
    }
    rim.x += gauss() * sigma;
    rim.z += gauss() * sigma;

    const T = isLayup ? 0.62 : clamp(0.78 + dist * 0.085, 0.85, 1.85);
    const vel = _v2.set(
      (rim.x - start.x) / T,
      (rim.y + (isLayup ? 0.28 : 0.05) - start.y) / T - 0.5 * GRAVITY * T,
      (rim.z - start.z) / T
    );
    this.ball.shoot(start, vel, shooter, points);
    shooter.model.setShooting(true);
    shooter.model.triggerRelease();
    shooter.jump(isLayup ? 3.4 : 2.6);
    setTimeout(() => shooter.model.setShooting(false), 420);
    shooter.face(rim.x - shooter.pos.x, rim.z - shooter.pos.z);
  }

  passBall(passer, receiver) {
    const start = passer.chestPos(_v1.clone());
    const T = clamp(0.16 + passer.distTo(receiver.pos) * 0.05, 0.25, 0.85);
    const target = _v2.set(
      receiver.pos.x + receiver.vel.x * T,
      1.3 * receiver.scale,
      receiver.pos.z + receiver.vel.z * T
    );
    const vel = _v3.set(
      (target.x - start.x) / T,
      (target.y - start.y) / T - 0.5 * GRAVITY * T,
      (target.z - start.z) / T
    );
    this.ball.pass(start, vel, passer, receiver);
    this.passInfo = { passer, receiver, t: 0 };
    passer.face(receiver.pos.x - passer.pos.x, receiver.pos.z - passer.pos.z);
  }

  bestPassTarget(passer, moveDir) {
    let best = null, bestScore = -1e9;
    for (const p of this.players[passer.team]) {
      if (p === passer) continue;
      let score = 0;
      // openness
      let nd = 1e9;
      for (const d of this.players[1 - passer.team]) nd = Math.min(nd, d.distTo(p.pos));
      score += Math.min(nd, 4) * 2;
      // distance penalty
      score -= passer.distTo(p.pos) * 0.55;
      // defenders sitting in the passing lane
      const lx = p.pos.x - passer.pos.x, lz = p.pos.z - passer.pos.z;
      const len2 = lx * lx + lz * lz || 1;
      for (const d of this.players[1 - passer.team]) {
        const t = clamp(((d.pos.x - passer.pos.x) * lx + (d.pos.z - passer.pos.z) * lz) / len2, 0, 1);
        const dd = Math.hypot(d.pos.x - (passer.pos.x + lx * t), d.pos.z - (passer.pos.z + lz * t));
        if (dd < 1.2) score -= (1.2 - dd) * 9;
      }
      // toward held movement direction
      if (moveDir && (moveDir.x || moveDir.z)) {
        _v1.set(p.pos.x - passer.pos.x, 0, p.pos.z - passer.pos.z).normalize();
        score += (_v1.x * moveDir.x + _v1.z * moveDir.z) * 5;
      }
      // closer to the attacked rim is useful
      const rim = this.hoopPos(passer.team);
      score += (passer.distTo(rim) - p.distTo(rim)) * 0.4;
      if (score > bestScore) { bestScore = score; best = p; }
    }
    return best;
  }

  // ---------- main update ----------
  update(dt) {
    if (this.phase === 'menu' || this.paused) return;

    if (this.phase === 'dead') {
      this.deadTimer -= dt;
      this.ball.update(dt);
      for (const p of this.allPlayers) p.update(dt, true);
      if (this.deadTimer <= 0 && this.deadNext) {
        const fn = this.deadNext;
        this.deadNext = null;
        fn();
      }
      return;
    }
    if (this.phase === 'gameover') {
      this.ball.update(dt);
      for (const p of this.allPlayers) p.update(dt, true);
      return;
    }

    const frozen = this.phase === 'freeze';
    if (frozen) {
      this.freezeTimer -= dt;
      if (this.freezeTimer <= 0) this.phase = 'live';
    } else {
      // clocks
      this.gameClock -= dt;
      this.shotClock -= dt;
      if (this.gameClock <= 0) {
        this.gameClock = 0;
        if (this.ball.state === 'shot') this.pendingQuarterEnd = true;
        else { this.endQuarter(); return; }
      }
      if (this.pendingQuarterEnd && this.ball.state !== 'shot') { this.endQuarter(); return; }
      if (this.shotClock <= 0 && this.ball.state === 'held') {
        const t = 1 - this.possession;
        this.turnover(t, 'SHOT CLOCK VIOLATION', _v1.set(this.ball.pos.x * 0.5, 0, 7));
        return;
      }
    }

    this.stealCooldown = Math.max(0, this.stealCooldown - dt);
    this.stealGrace = Math.max(0, this.stealGrace - dt);
    this.updateUserControl(dt, frozen);
    this.updateAI(dt, frozen);

    for (const p of this.allPlayers) p.update(dt, frozen);
    this.separatePlayers();

    this.updateHeldBall(dt);
    this.ball.update(dt);
    this.handleCatchesAndPickups(dt);
    this.checkBlocks();
    if (!frozen) this.checkOutOfBounds();

    // HUD
    this.ui.setClocks(this.gameClock, this.shotClock, this.quarterLabel());
    this.arena.updateShotClocks(this.shotClock);
    if (Math.floor(this.gameClock) !== this._lastJumboSec) {
      this._lastJumboSec = Math.floor(this.gameClock);
      this.syncBoards();
    }
  }

  // ---------- user ----------
  updateUserControl(dt, frozen) {
    const input = this.input;
    const me = this.players[0][this.controlled];
    const holder = this.ball.state === 'held' ? this.ball.holder : null;
    const iHaveBall = holder === me;

    if (input.wasPressed('Tab') && !iHaveBall) {
      this.controlled = (this.controlled + 1) % 5;
      this.updateControlledLabel();
    }

    const mv = input.moveVector();
    me.wantSprint = input.isDown('ShiftLeft') || input.isDown('ShiftRight');

    if (this.charging) {
      // locked in shooting stance
      me.target.set(me.pos.x, 0, me.pos.z);
      this.charge += dt / 0.85;
      this.ui.setMeter(Math.min(1, this.charge));
      if (this.charge > 1.12) this.finishShot(me); // held too long
      else if (input.wasReleased('Space')) this.finishShot(me);
      return;
    }

    if (mv.x || mv.z) {
      me.target.set(me.pos.x + mv.x * 3, 0, me.pos.z + mv.z * 3);
    } else {
      me.target.set(me.pos.x, 0, me.pos.z);
    }

    if (iHaveBall && !frozen) {
      if (input.wasPressed('Space')) {
        this.charging = true;
        this.charge = 0;
        me.model.setShooting(true);
        this.ui.showMeter(true);
        this.ui.setMeter(0);
      }
      if (input.wasPressed('KeyE')) {
        const target = this.bestPassTarget(me, mv);
        if (target) this.passBall(me, target);
      }
    } else if (!iHaveBall) {
      if (input.wasPressed('Space')) me.jump(4.6);
      if (input.wasPressed('KeyQ') && this.stealCooldown <= 0 && holder && holder.team === 1) {
        this.stealCooldown = 0.9;
        if (me.distTo(holder.pos) < 1.25) {
          if (Math.random() < 0.34) {
            this.ball.makeLoose(_v1.set(
              (me.pos.x - holder.pos.x) * 2 + (Math.random() - 0.5),
              2.2,
              (me.pos.z - holder.pos.z) * 2 + (Math.random() - 0.5)
            ));
            this.ball.lastTouchTeam = 0;
            this.ui.flash('STEAL!', me.name, 1.2);
          } else {
            me.stumble = 0.7;
          }
        }
      }
    }
  }

  finishShot(me) {
    this.charging = false;
    this.ui.showMeter(false);
    if (this.ball.holder !== me) { me.model.setShooting(false); return; }
    const c = Math.min(this.charge, 1.15);
    const quality = clamp(1 - Math.abs(c - 0.8) * 3.2, 0, 1);
    this.releaseShot(me, quality);
  }

  // ---------- AI ----------
  updateAI(dt, frozen) {
    const holder = this.ball.state === 'held' ? this.ball.holder : null;

    for (const p of this.allPlayers) {
      const isUser = p.team === 0 && p.index === this.controlled;
      if (isUser) continue;
      p.thinkTimer -= dt;
      p.wantSprint = false;

      // everyone chases a live loose ball if close
      if (this.ball.state === 'loose' && !frozen) {
        const d = p.distTo(this.ball.pos);
        if (d < 9) {
          p.target.set(this.ball.pos.x, 0, this.ball.pos.z);
          p.wantSprint = d > 1.5;
          continue;
        }
      }

      if (p.team === this.possession) this.offenseAI(p, holder, dt, frozen);
      else this.defenseAI(p, holder, dt, frozen);
    }

    // CPU shot windup completion
    for (const p of this.allPlayers) {
      if (p.cpuShot) {
        p.cpuShot.t -= dt;
        if (p.cpuShot.t <= 0) {
          p.cpuShot = null;
          p.model.setShooting(false);
          if (this.ball.holder === p) {
            const q = clamp(this.difficulty.cpuShot + gauss() * 0.09, 0.25, 1);
            this.releaseShot(p, q);
          }
        }
      }
    }
  }

  offenseAI(p, holder, dt, frozen) {
    const rim = this.hoopPos(p.team);
    const rimX = rim.x, rimZ = rim.z;
    const d = attackDir(p.team);

    if (holder === p) {
      if (p.cpuShot) { p.target.set(p.pos.x, 0, p.pos.z); return; }
      if (p.thinkTimer <= 0) {
        p.thinkTimer = 0.22;
        const distRim = p.distTo(rim);
        let nearestDef = 1e9, defAhead = null;
        for (const q of this.players[1 - p.team]) {
          const dd = q.distTo(p.pos);
          if (dd < nearestDef) nearestDef = dd;
          _v1.set(rimX - p.pos.x, 0, rimZ - p.pos.z).normalize();
          _v2.set(q.pos.x - p.pos.x, 0, q.pos.z - p.pos.z);
          if (_v2.length() < 1.6 && _v1.dot(_v2.normalize()) > 0.7) defAhead = q;
        }
        const urgent = this.shotClock < 5;
        if (!frozen && (urgent ||
            (distRim < 2.6) ||
            (nearestDef > 1.7 && distRim < 8.6 && Math.random() < 0.4 + p.def.skill * 0.3))) {
          // wind up a shot
          p.cpuShot = { t: 0.38 };
          p.model.setShooting(true);
          p.target.set(p.pos.x, 0, p.pos.z);
          return;
        }
        if (!frozen && nearestDef < 1.5 && this.shotClock > 6 && Math.random() < 0.3) {
          const t = this.bestPassTarget(p, null);
          if (t) { this.passBall(p, t); return; }
        }
        // drive: head to the rim, strafe around a defender in the lane
        _v1.set(rimX - p.pos.x, 0, rimZ - p.pos.z).normalize();
        if (defAhead) {
          const side = Math.sign((defAhead.pos.z - p.pos.z) * -1 || 1);
          p.target.set(
            p.pos.x + _v1.x * 2.2 + _v1.z * -side * 2.0,
            0,
            p.pos.z + _v1.z * 2.2 + _v1.x * side * 2.0
          );
        } else {
          p.target.set(p.pos.x + _v1.x * 3, 0, p.pos.z + _v1.z * 3);
        }
        p.wantSprint = this.shotClock < 10;
      }
      return;
    }

    // off ball: hold spacing spots
    if (p.thinkTimer <= 0) {
      p.thinkTimer = 0.6 + Math.random() * 0.5;
      const spot = OFFENSE_SPOTS[p.index];
      p.spotJitter.set((Math.random() - 0.5) * 1.4, 0, (Math.random() - 0.5) * 1.4);
      p.target.set(
        rimX - d * spot.dx + p.spotJitter.x,
        0,
        rimZ + spot.z + p.spotJitter.z
      );
    }
    if (holder) p.face(this.ball.pos.x - p.pos.x, this.ball.pos.z - p.pos.z);
  }

  defenseAI(p, holder, dt, frozen) {
    const mark = this.players[1 - p.team][p.index];
    // hoopPos(t) is the rim attacked by t, so p defends hoopPos(1 - p.team)
    const defendRim = this.hoopPos(1 - p.team).clone();

    const markHasBall = holder === mark;
    const gap = markHasBall ? 1.2 : 2.6;
    _v1.set(defendRim.x - mark.pos.x, 0, defendRim.z - mark.pos.z);
    const len = _v1.length() || 1;
    _v1.multiplyScalar(gap / len);
    if (p.thinkTimer <= 0) {
      p.thinkTimer = 0.12;
      const speedMul = p.team === 1 ? this.difficulty.cpuSpeed : 1;
      p.target.set(
        mark.pos.x + _v1.x + (this.ball.pos.x - mark.pos.x) * 0.06,
        0,
        mark.pos.z + _v1.z + (this.ball.pos.z - mark.pos.z) * 0.06
      );
      p.wantSprint = p.distTo(mark.pos) > 4 && speedMul >= 1;
    }
    p.face(mark.pos.x - p.pos.x, mark.pos.z - p.pos.z);
    p.model.setDefense(p.distTo(mark.pos) < 3.2 && !frozen);

    // contest a windup (rate is per-second, not per-step)
    if (markHasBall && (mark.cpuShot || (mark.team === 0 && this.charging && mark.index === this.controlled))) {
      if (p.distTo(mark.pos) < 1.7 && Math.random() < 2.0 * dt) p.jump(4.2);
    }
    // CPU steal attempts against the user's team
    if (!frozen && this.stealGrace <= 0 && markHasBall && p.team === 1 && p.distTo(mark.pos) < 0.95) {
      if (Math.random() < this.difficulty.cpuSteal * dt * 2.5) {
        this.ball.makeLoose(_v1.set((p.pos.x - mark.pos.x) * 3, 2.0, (p.pos.z - mark.pos.z) * 3));
        this.ball.lastTouchTeam = 1;
        this.ui.flash('STOLEN!', p.name, 1.2);
      }
    }
  }

  separatePlayers() {
    const R = 0.42;
    for (let i = 0; i < this.allPlayers.length; i++) {
      for (let j = i + 1; j < this.allPlayers.length; j++) {
        const a = this.allPlayers[i], b = this.allPlayers[j];
        let dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
        const dist = Math.hypot(dx, dz);
        if (dist < R * 2 && dist > 1e-5) {
          const push = (R * 2 - dist) / 2;
          dx /= dist; dz /= dist;
          a.pos.x -= dx * push; a.pos.z -= dz * push;
          b.pos.x += dx * push; b.pos.z += dz * push;
        }
      }
    }
  }

  // ---------- ball interaction ----------
  updateHeldBall(dt) {
    if (this.ball.state !== 'held') return;
    const h = this.ball.holder;
    const speed = Math.hypot(h.vel.x, h.vel.z);
    const shooting = h.model.shootBlend > 0.25;

    if (shooting) {
      // ball rises with the shooting form
      h.model.getReleaseWorldPos(_v1);
      const b = h.model.shootBlend;
      this.ball.pos.lerp(_v1, Math.min(1, dt * 14 * b + b * 0.2));
    } else {
      // dribble at the right hand side
      const rate = 7 + speed * 1.6;
      this.dribblePhase += dt * rate;
      const right = _v1.set(-h.facing.z, 0, h.facing.x);
      const hx = h.pos.x + h.facing.x * 0.25 + right.x * 0.32;
      const hz = h.pos.z + h.facing.z * 0.25 + right.z * 0.32;
      const handY = 0.95 * h.scale;
      const y = 0.121 + Math.abs(Math.sin(this.dribblePhase)) * (handY - 0.121);
      // bounce sound each time the arc touches the floor
      if (Math.sin(this.dribblePhase) * Math.sin(this.dribblePhase - dt * rate) < 0) {
        this.audio.bounce(0.4);
      }
      this.ball.pos.set(hx, y, hz);
    }
    this.ball.mesh.position.copy(this.ball.pos);
  }

  handleCatchesAndPickups() {
    const b = this.ball;
    if (b.state === 'pass') {
      // intended receiver gets first claim
      const intended = this.passInfo && this.passInfo.receiver;
      if (intended) {
        intended.chestPos(_v1);
        if (_v1.distanceTo(b.pos) < 0.6) { this.catchBall(intended); return; }
      }
      for (const p of this.allPlayers) {
        if (this.passInfo && (p === this.passInfo.passer || p === intended)) continue;
        p.chestPos(_v1);
        if (_v1.distanceTo(b.pos) < 0.45) {
          if (p.team === b.lastTouchTeam) {
            this.catchBall(p);
          } else if (Math.random() < 0.3) {
            this.catchBall(p);
            this.ui.flash('INTERCEPTED!', p.name, 1.3);
          }
          return;
        }
      }
    } else if (b.state === 'loose') {
      for (const p of this.allPlayers) {
        if (b.pos.y < 1.9 && p.distTo(b.pos) < 0.62 && Math.abs(b.pos.y - p.py) < 2.2) {
          this.catchBall(p);
          return;
        }
      }
    }
  }

  catchBall(p) {
    const b = this.ball;
    const wasShot = b.lastShot && (b.time - b.lastShot.time) < 6;
    const prevPossession = this.possession;
    b.give(p);
    this.passInfo = null;
    this.possession = p.team;
    this.ui.setPossession(p.team);
    if (p.team !== prevPossession) {
      this.shotClock = RULES.SHOT_CLOCK;
      this.stealGrace = Math.max(this.stealGrace, 1.2);
    } else if (wasShot && b.rimHitSinceShot) {
      this.shotClock = Math.max(this.shotClock, RULES.SHOT_CLOCK_ORB); // offensive board
    }
    if (p.team === 0) {
      this.controlled = p.index;
      this.updateControlledLabel();
    }
    p.model.setShooting(false);
    p.cpuShot = null;
  }

  checkBlocks() {
    const b = this.ball;
    if (b.state !== 'shot' || !b.lastShot) return;
    const age = b.time - b.lastShot.time;
    if (age < 0.05 || age > 0.4) return;
    for (const p of this.allPlayers) {
      if (p.team === b.lastShot.team) continue;
      if (p.py < 0.25) continue;
      _v1.set(p.pos.x, 2.3 * p.scale + p.py, p.pos.z);
      if (_v1.distanceTo(b.pos) < 0.4) {
        b.makeLoose(_v2.set(
          b.vel.x * -0.2 + (Math.random() - 0.5) * 3,
          Math.min(b.vel.y, 1),
          b.vel.z * -0.2 + (Math.random() - 0.5) * 3
        ));
        b.lastTouchTeam = p.team;
        this.ui.flash('BLOCKED!', p.name, 1.3);
        this.audio.cheer(p.team === 0 ? 0.7 : 0.3);
        return;
      }
    }
  }

  checkOutOfBounds() {
    const b = this.ball;
    if (this.phase !== 'live') return;
    let outPos = null;
    if (b.state === 'held') {
      const h = b.holder;
      if (Math.abs(h.pos.x) > COURT.HALF_L || Math.abs(h.pos.z) > COURT.HALF_W) outPos = h.pos;
    } else if (b.state === 'loose') {
      if ((Math.abs(b.pos.x) > COURT.HALF_L + 0.6 || Math.abs(b.pos.z) > COURT.HALF_W + 0.6) && b.pos.y < 0.5) {
        outPos = b.pos;
      }
    }
    if (outPos) {
      const newTeam = 1 - b.lastTouchTeam;
      const spot = _v2.set(clamp(outPos.x, -13.6, 13.6), 0, clamp(outPos.z, -7.1, 7.1));
      this.turnover(newTeam, 'OUT OF BOUNDS', spot);
    }
  }

  cameraFocus(out) {
    out.copy(this.ball.pos);
    return out;
  }
}
