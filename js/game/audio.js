// Lightweight procedural sound effects via WebAudio (no asset files needed).
export class Audio {
  constructor() {
    this.ctx = null;
    this.enabled = true;
  }
  _ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) this.ctx = new AC();
    }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }
  _blip(freq, dur, type = 'square', vol = 0.15, slideTo = null) {
    const ctx = this._ensure();
    if (!ctx || !this.enabled) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, ctx.currentTime);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + dur);
    g.gain.setValueAtTime(vol, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    o.connect(g); g.connect(ctx.destination);
    o.start(); o.stop(ctx.currentTime + dur);
  }
  shoot() {
    const ctx = this._ensure();
    if (!ctx || !this.enabled) return;
    // noise burst
    const dur = 0.09;
    const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.25, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass'; filt.frequency.value = 1800;
    src.connect(filt); filt.connect(g); g.connect(ctx.destination);
    src.start();
  }
  empty() { this._blip(180, 0.06, 'square', 0.08); }
  kill() { this._blip(660, 0.12, 'triangle', 0.18, 1100); }
  hurt() { this._blip(150, 0.25, 'sawtooth', 0.2, 60); }
  reload() { this._blip(300, 0.08, 'square', 0.1); setTimeout(() => this._blip(420, 0.08, 'square', 0.1), 140); }
  wave() {
    this._blip(440, 0.18, 'triangle', 0.2, 660);
    setTimeout(() => this._blip(660, 0.25, 'triangle', 0.2, 880), 180);
  }
  over() { this._blip(330, 0.5, 'sawtooth', 0.22, 80); }
}
