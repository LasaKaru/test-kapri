// Lightweight procedural sound effects via WebAudio (no asset files needed).
export class Audio {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.master = 0.7;
    this.musicVol = 0.5;
    this._musicOn = false;
    this._intensity = 0;
    this._beat = 0;
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
    vol *= this.master;
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
  _noise(dur, vol, cutoff) {
    const ctx = this._ensure();
    if (!ctx || !this.enabled) return;
    const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol * this.master, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass'; filt.frequency.value = cutoff;
    src.connect(filt); filt.connect(g); g.connect(ctx.destination);
    src.start();
  }
  shoot(kind = 'rifle') {
    switch (kind) {
      case 'smg': this._noise(0.06, 0.18, 2400); this._blip(150, 0.05, 'square', 0.05, 70); break;
      case 'shotgun':
      case 'autoshotgun':
        this._noise(0.16, 0.32, 1400); this._blip(90, 0.13, 'square', 0.15, 46); this._blip(58, 0.18, 'sine', 0.12, 30); break;
      case 'sniper': this._noise(0.22, 0.35, 1100); this._blip(120, 0.18, 'sawtooth', 0.16, 60); this._blip(48, 0.3, 'sine', 0.15, 26); break;
      case 'dmr': this._noise(0.12, 0.28, 1600); this._blip(130, 0.1, 'sawtooth', 0.13, 58); this._blip(60, 0.16, 'sine', 0.1, 30); break;
      case 'railgun': this._blip(1300, 0.16, 'sawtooth', 0.16, 180); this._noise(0.12, 0.2, 3200); this._blip(70, 0.28, 'sine', 0.16, 30); break;
      case 'lmg': this._noise(0.07, 0.22, 2000); this._blip(115, 0.05, 'square', 0.06, 60); break;
      default: this._noise(0.09, 0.25, 1800); this._blip(125, 0.05, 'square', 0.05, 60);
    }
  }
  explosion() {
    this._noise(0.5, 0.45, 700);
    this._blip(70, 0.5, 'sawtooth', 0.3, 30);
  }
  pickup() { this._blip(660, 0.1, 'sine', 0.18, 990); setTimeout(() => this._blip(990, 0.1, 'sine', 0.15, 1320), 80); }
  swap() { this._blip(300, 0.05, 'square', 0.08); }
  melee() { this._noise(0.12, 0.16, 2600); this._blip(220, 0.1, 'square', 0.08, 120); }
  empty() { this._blip(180, 0.06, 'square', 0.08); }
  kill() { this._blip(660, 0.12, 'triangle', 0.18, 1100); }
  hurt() { this._blip(150, 0.25, 'sawtooth', 0.2, 60); }
  reload() { this._blip(300, 0.08, 'square', 0.1); setTimeout(() => this._blip(420, 0.08, 'square', 0.1), 140); }
  wave() {
    this._blip(440, 0.18, 'triangle', 0.2, 660);
    setTimeout(() => this._blip(660, 0.25, 'triangle', 0.2, 880), 180);
  }
  over() { this._blip(330, 0.5, 'sawtooth', 0.22, 80); }

  // ---- procedural voice (formant synthesis) ----
  // A glottal sawtooth (with pitch contour + vibrato) shaped by bandpass
  // "formant" filters to fake a shouted vowel. Cheap, no audio assets.
  _formant(o) {
    const ctx = this._ensure();
    if (!ctx || !this.enabled) return;
    const t0 = ctx.currentTime, dur = o.dur;
    const out = ctx.createGain();
    out.gain.value = (o.vol || 0.3) * this.master;
    out.connect(ctx.destination);

    const src = ctx.createOscillator();
    src.type = 'sawtooth';
    src.frequency.setValueAtTime(o.f0, t0);
    if (o.f1 != null) src.frequency.linearRampToValueAtTime(o.f1, t0 + dur);

    // vibrato for a wavering, organic shout
    const vib = ctx.createOscillator(), vibg = ctx.createGain();
    vib.frequency.value = o.vib || 16; vibg.gain.value = o.vibDepth || 8;
    vib.connect(vibg); vibg.connect(src.frequency);
    vib.start(t0); vib.stop(t0 + dur + 0.02);

    // amplitude envelope: quick attack, sustain, decay
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(1, t0 + 0.03);
    env.gain.setValueAtTime(1, t0 + dur * 0.55);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(env);

    (o.formants || [[700, 8, 1]]).forEach(([f, q, g]) => {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q;
      const fg = ctx.createGain(); fg.gain.value = g;
      env.connect(bp); bp.connect(fg); fg.connect(out);
    });
    src.start(t0); src.stop(t0 + dur + 0.02);
  }

  // type: 'taunt' (short enemy bark) | 'scream' (death) | 'boss' (deep roar)
  voice(type) {
    if (!this.enabled) return;
    if (type === 'scream') {
      this._noise(0.05, 0.1, 2600); // breath onset
      this._formant({ f0: 440, f1: 170, dur: 0.7, vol: 0.3, vib: 13, vibDepth: 24,
        formants: [[820, 8, 1], [1150, 9, 0.7], [2800, 10, 0.3]] });
    } else if (type === 'boss') {
      this._formant({ f0: 95, f1: 60, dur: 1.0, vol: 0.4, vib: 7, vibDepth: 9,
        formants: [[300, 6, 1], [620, 7, 0.6], [1400, 9, 0.25]] });
    } else { // taunt — two barked syllables ("hey you" / "stop there" / "over here")
      const phrases = [
        [{ f0: 165, fm: [[600, 9, 1], [1700, 10, 0.5]], d: 0.15 }, { f0: 140, fm: [[400, 9, 1], [900, 10, 0.5]], d: 0.2 }],
        [{ f0: 150, fm: [[600, 8, 1], [1000, 9, 0.6]], d: 0.17 }, { f0: 138, fm: [[560, 9, 1], [1800, 10, 0.5]], d: 0.22 }],
        [{ f0: 175, fm: [[500, 9, 1], [900, 9, 0.5]], d: 0.15 }, { f0: 150, fm: [[300, 9, 1], [2200, 11, 0.4]], d: 0.2 }],
      ];
      const ph = phrases[(Math.random() * phrases.length) | 0];
      let delay = 0;
      ph.forEach((syl) => {
        setTimeout(() => this._formant({ f0: syl.f0, f1: syl.f0 * 0.85, dur: syl.d, vol: 0.24, vib: 15, vibDepth: 6, formants: syl.fm }), delay);
        delay += syl.d * 850;
      });
    }
  }

  // ---- procedural music + ambience ----
  setMusicVolume(v) { this.musicVol = v; if (this._musicGain) this._musicGain.gain.value = v; }
  setIntensity(level) { this._intensity = Math.max(0, Math.min(1, level)); }

  startMusic() {
    const ctx = this._ensure();
    if (!ctx || this._musicOn) return;
    this._musicOn = true;
    this._beat = 0;

    this._musicGain = ctx.createGain();
    this._musicGain.gain.value = this.musicVol;
    this._musicGain.connect(ctx.destination);

    // ambient pad: two detuned drones through a slowly sweeping low-pass
    this._droneFilter = ctx.createBiquadFilter();
    this._droneFilter.type = 'lowpass';
    this._droneFilter.frequency.value = 500;
    const padGain = ctx.createGain(); padGain.gain.value = 0.12;
    this._droneFilter.connect(padGain); padGain.connect(this._musicGain);
    this._drones = [];
    [55, 82.5].forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f * (i ? 1.005 : 1);
      o.connect(this._droneFilter); o.start();
      this._drones.push(o);
    });
    // wind ambience: filtered looping noise
    const wbuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const wd = wbuf.getChannelData(0);
    for (let i = 0; i < wd.length; i++) wd[i] = Math.random() * 2 - 1;
    this._wind = ctx.createBufferSource(); this._wind.buffer = wbuf; this._wind.loop = true;
    const wf = ctx.createBiquadFilter(); wf.type = 'bandpass'; wf.frequency.value = 600; wf.Q.value = 0.5;
    const wg = ctx.createGain(); wg.gain.value = 0.04;
    this._wind.connect(wf); wf.connect(wg); wg.connect(this._musicGain); this._wind.start();

    this._scheduleBeat();
  }

  stopMusic() {
    this._musicOn = false;
    if (this._musicTimer) clearTimeout(this._musicTimer);
    try { this._drones && this._drones.forEach((o) => o.stop()); } catch (_) {}
    try { this._wind && this._wind.stop(); } catch (_) {}
    if (this._musicGain) { try { this._musicGain.disconnect(); } catch (_) {} }
    this._drones = null; this._wind = null; this._musicGain = null;
  }

  _mnote(freq, dur, type, vol) {
    const ctx = this.ctx; if (!ctx || !this._musicGain) return;
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.type = type; o.frequency.value = freq;
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this._musicGain);
    o.start(t); o.stop(t + dur + 0.02);
  }

  _scheduleBeat() {
    if (!this._musicOn || !this.ctx) return;
    const i = this._intensity;
    const root = 110; // A
    const scale = [0, 3, 5, 7, 10]; // minor pentatonic
    // filter opens up with intensity
    if (this._droneFilter) this._droneFilter.frequency.value = 450 + i * 1400;

    // bassline every beat
    this._mnote(root / 2 * (this._beat % 4 === 2 ? 1.5 : 1), 0.22, 'triangle', 0.18 + i * 0.06);
    // backbeat pulse
    if (this._beat % 2 === 1) this._noiseTick(0.05 + i * 0.05);
    // melodic arpeggio grows with intensity
    if (i > 0.25 && this._beat % 2 === 0) {
      const n = scale[(this._beat / 2) % scale.length | 0];
      this._mnote(root * Math.pow(2, n / 12), 0.18, 'square', 0.05 + i * 0.05);
    }
    if (i > 0.6) {
      const n = scale[(this._beat + 2) % scale.length];
      this._mnote(root * 2 * Math.pow(2, n / 12), 0.12, 'sawtooth', 0.04 + i * 0.04);
    }

    this._beat++;
    const interval = (0.5 - i * 0.18) * 1000;
    this._musicTimer = setTimeout(() => this._scheduleBeat(), interval);
  }

  _noiseTick(vol) {
    const ctx = this.ctx; if (!ctx || !this._musicGain) return;
    const dur = 0.08;
    const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let k = 0; k < d.length; k++) d[k] = (Math.random() * 2 - 1) * (1 - k / d.length);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const g = ctx.createGain(); g.gain.value = vol;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1200;
    src.connect(f); f.connect(g); g.connect(this._musicGain); src.start();
  }
}
