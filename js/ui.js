import { TEAMS } from './constants.js';

// DOM overlay HUD: scoreboard, clocks, shot meter, messages, menus.
export class UI {
  constructor() {
    this.el = {
      hud: document.getElementById('hud'),
      homeScore: document.getElementById('home-score'),
      awayScore: document.getElementById('away-score'),
      homeName: document.getElementById('home-name'),
      awayName: document.getElementById('away-name'),
      quarter: document.getElementById('quarter'),
      gameClock: document.getElementById('game-clock'),
      shotClock: document.getElementById('shot-clock'),
      possHome: document.getElementById('poss-home'),
      possAway: document.getElementById('poss-away'),
      meterWrap: document.getElementById('meter-wrap'),
      meterFill: document.getElementById('meter-fill'),
      message: document.getElementById('message'),
      submessage: document.getElementById('submessage'),
      menu: document.getElementById('menu'),
      pause: document.getElementById('pause-overlay'),
      gameover: document.getElementById('gameover'),
      finalLine: document.getElementById('final-line'),
      finalScore: document.getElementById('final-score'),
      controlledName: document.getElementById('controlled-name'),
      loading: document.getElementById('loading'),
    };
    this.msgTimer = 0;
    this.el.homeName.textContent = TEAMS[0].short;
    this.el.awayName.textContent = TEAMS[1].short;
    document.getElementById('home-badge').style.background = TEAMS[0].css;
    document.getElementById('away-badge').style.background = TEAMS[1].css;
  }

  hideLoading() { this.el.loading.style.display = 'none'; }
  showMenu(show) { this.el.menu.style.display = show ? 'flex' : 'none'; }
  showHUD(show) { this.el.hud.style.display = show ? 'block' : 'none'; }
  showPause(show) { this.el.pause.style.display = show ? 'flex' : 'none'; }

  showGameOver(homeScore, awayScore) {
    const home = TEAMS[0], away = TEAMS[1];
    const winner = homeScore > awayScore ? home : away;
    this.el.finalLine.textContent = `${winner.name} ${winner.nickname} WIN!`;
    this.el.finalScore.textContent = `${home.short} ${homeScore} — ${awayScore} ${away.short}`;
    this.el.gameover.style.display = 'flex';
  }
  hideGameOver() { this.el.gameover.style.display = 'none'; }

  setScore(home, away) {
    this.el.homeScore.textContent = home;
    this.el.awayScore.textContent = away;
  }

  fmtClock(t) {
    t = Math.max(0, t);
    const m = Math.floor(t / 60);
    const s = t % 60;
    if (m === 0) return s.toFixed(1);
    return `${m}:${String(Math.floor(s)).padStart(2, '0')}`;
  }

  setClocks(gameClock, shotClock, quarterLabel) {
    this.el.gameClock.textContent = this.fmtClock(gameClock);
    const sc = Math.max(0, Math.ceil(shotClock));
    this.el.shotClock.textContent = sc;
    this.el.shotClock.classList.toggle('urgent', shotClock <= 5);
    this.el.quarter.textContent = quarterLabel;
  }

  setPossession(team) {
    this.el.possHome.style.opacity = team === 0 ? 1 : 0;
    this.el.possAway.style.opacity = team === 1 ? 1 : 0;
  }

  setControlled(name) {
    this.el.controlledName.textContent = name || '';
  }

  // Shot meter: charge in [0,1]. Perfect release window drawn in CSS.
  showMeter(show) { this.el.meterWrap.style.display = show ? 'block' : 'none'; }
  setMeter(v) {
    this.el.meterFill.style.height = `${Math.min(100, v * 100)}%`;
    this.el.meterFill.classList.toggle('hot', v > 0.72 && v < 0.9);
  }

  flash(text, sub = '', seconds = 1.8) {
    this.el.message.textContent = text;
    this.el.submessage.textContent = sub;
    this.el.message.style.opacity = 1;
    this.el.submessage.style.opacity = 1;
    this.msgTimer = seconds;
  }

  update(dt) {
    if (this.msgTimer > 0) {
      this.msgTimer -= dt;
      if (this.msgTimer <= 0.6) {
        const a = Math.max(0, this.msgTimer / 0.6);
        this.el.message.style.opacity = a;
        this.el.submessage.style.opacity = a;
      }
    }
  }
}
