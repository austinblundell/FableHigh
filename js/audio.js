// Procedural WebAudio sound engine: no assets needed.
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.crowdGain = null;
    this.cheerLevel = 0;
  }

  init() {
    if (this.ctx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(this.ctx.destination);
    this.startCrowd();
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  noiseBuffer(seconds = 1) {
    const rate = this.ctx.sampleRate;
    const buf = this.ctx.createBuffer(1, rate * seconds, rate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i++) {
      // brown-ish noise
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5;
    }
    return buf;
  }

  startCrowd() {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer(3);
    src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 900;
    this.crowdGain = this.ctx.createGain();
    this.crowdGain.gain.value = 0.10;
    src.connect(filter).connect(this.crowdGain).connect(this.master);
    src.start();
  }

  update(dt) {
    if (!this.ctx || !this.crowdGain) return;
    this.cheerLevel = Math.max(0, this.cheerLevel - dt * 0.35);
    const target = 0.10 + this.cheerLevel * 0.5;
    const g = this.crowdGain.gain;
    g.setTargetAtTime(target, this.ctx.currentTime, 0.1);
  }

  cheer(amount = 1) { this.cheerLevel = Math.min(1, this.cheerLevel + amount); }

  env(gainNode, t0, attack, decay, peak = 1) {
    const g = gainNode.gain;
    g.setValueAtTime(0.0001, t0);
    g.exponentialRampToValueAtTime(peak, t0 + attack);
    g.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
  }

  bounce(intensity = 1) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(160, t);
    osc.frequency.exponentialRampToValueAtTime(60, t + 0.08);
    const g = this.ctx.createGain();
    this.env(g, t, 0.005, 0.09, 0.35 * Math.min(1, intensity));
    osc.connect(g).connect(this.master);
    osc.start(t); osc.stop(t + 0.12);
  }

  rimClank() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (const f of [317, 476, 692]) {
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = f;
      const g = this.ctx.createGain();
      this.env(g, t, 0.002, 0.22, 0.16);
      osc.connect(g).connect(this.master);
      osc.start(t); osc.stop(t + 0.3);
    }
  }

  boardThud() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(120, t);
    osc.frequency.exponentialRampToValueAtTime(70, t + 0.1);
    const g = this.ctx.createGain();
    this.env(g, t, 0.003, 0.12, 0.2);
    osc.connect(g).connect(this.master);
    osc.start(t); osc.stop(t + 0.15);
  }

  swish() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer(0.4);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 3200;
    filter.Q.value = 1.2;
    const g = this.ctx.createGain();
    this.env(g, t, 0.01, 0.3, 0.5);
    src.connect(filter).connect(g).connect(this.master);
    src.start(t); src.stop(t + 0.45);
  }

  whistle() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(2350, t);
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 28;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 320;
    lfo.connect(lfoGain).connect(osc.frequency);
    const g = this.ctx.createGain();
    this.env(g, t, 0.02, 0.45, 0.25);
    osc.connect(g).connect(this.master);
    osc.start(t); osc.stop(t + 0.55);
    lfo.start(t); lfo.stop(t + 0.55);
  }

  buzzer() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 178;
    const osc2 = this.ctx.createOscillator();
    osc2.type = 'square';
    osc2.frequency.value = 180.5;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.28, t);
    g.gain.setValueAtTime(0.28, t + 0.9);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.05);
    osc.connect(g); osc2.connect(g); g.connect(this.master);
    osc.start(t); osc.stop(t + 1.1);
    osc2.start(t); osc2.stop(t + 1.1);
  }
}
