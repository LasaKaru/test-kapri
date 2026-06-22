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
      if (AC) { this.ctx = new AC(); this._buildBus(); }
    }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }
  // master bus + a short algorithmic reverb (generated impulse) for space/punch
  _buildBus() {
    const ctx = this.ctx;
    this._bus = ctx.createGain(); this._bus.connect(ctx.destination);
    this._verb = ctx.createConvolver(); this._verb.buffer = this._makeIR(0.5, 2.8);
    this._wet = ctx.createGain(); this._wet.gain.value = 0.8;
    this._verb.connect(this._wet); this._wet.connect(ctx.destination);
  }
  _makeIR(dur, decay) {
    const ctx = this.ctx, len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = buf.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay); }
    return buf;
  }
  _dest() { return this._bus || this.ctx.destination; }
  _send(node, amt) { if (!this._verb || !amt) return; const g = this.ctx.createGain(); g.gain.value = amt; node.connect(g); g.connect(this._verb); }

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
    o.connect(g); g.connect(this._dest());
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
    src.connect(filt); filt.connect(g); g.connect(this._dest());
    src.start();
  }

  // ---- realistic SFX building blocks ----
  // sharp high-frequency transient (the "crack" / mechanical snap)
  _click(vol = 0.2, hp = 2600) {
    const ctx = this._ensure(); if (!ctx || !this.enabled) return;
    const t0 = ctx.currentTime, len = Math.floor(ctx.sampleRate * 0.012);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp;
    const g = ctx.createGain(); g.gain.value = vol * this.master;
    src.connect(f); f.connect(g); g.connect(this._dest());
    src.start(t0);
  }
  // low sine "punch" that drops in pitch — the body/weight of a shot or blast
  _thump(f0, f1, dur, vol) {
    const ctx = this._ensure(); if (!ctx || !this.enabled) return;
    const t0 = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(f0, t0);
    o.frequency.exponentialRampToValueAtTime(Math.max(18, f1), t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol * this.master, t0 + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(this._dest());
    o.start(t0); o.stop(t0 + dur + 0.02);
  }
  // filtered noise body with an optional cutoff sweep and reverb send
  _burst(o) {
    const ctx = this._ensure(); if (!ctx || !this.enabled) return;
    const t0 = ctx.currentTime, dur = o.dur, len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const filt = ctx.createBiquadFilter(); filt.type = o.type || 'lowpass';
    filt.frequency.setValueAtTime(o.cut, t0);
    if (o.slideCut) filt.frequency.exponentialRampToValueAtTime(Math.max(60, o.slideCut), t0 + dur);
    if (o.q) filt.Q.value = o.q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(o.vol * this.master, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filt); filt.connect(g); g.connect(this._dest());
    this._send(g, o.verb || 0);
    src.start(t0);
  }
  _mech(freq, dur, vol) { this._burst({ dur, vol, cut: freq, q: 1.6, type: 'bandpass', verb: 0.05 }); }
  _toneVerb(freq, dur, type, vol, verb, slideTo) {
    const ctx = this._ensure(); if (!ctx || !this.enabled) return;
    const t0 = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(vol * this.master, t0 + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(lp); lp.connect(g); g.connect(this._dest()); this._send(g, verb || 0);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }

  // ---- weapons & combat ----
  shoot(kind = 'rifle') {
    if (!this._ensure() || !this.enabled) return;
    if (kind === 'railgun') {
      this._click(0.32, 3000);
      const ctx = this.ctx, t0 = ctx.currentTime;
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(1900, t0); o.frequency.exponentialRampToValueAtTime(210, t0 + 0.18);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.3 * this.master, t0 + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.2);
      o.connect(g); g.connect(this._dest()); this._send(g, 0.4);
      o.start(t0); o.stop(t0 + 0.22);
      this._thump(70, 30, 0.3, 0.4);
      return;
    }
    const TABLE = {
      rifle:       { cut: 3600, dur: 0.10, vol: 0.34, sub: 95, subV: 0.32, verb: 0.16 },
      smg:         { cut: 4300, dur: 0.06, vol: 0.26, sub: 120, subV: 0.20, verb: 0.10 },
      lmg:         { cut: 3000, dur: 0.08, vol: 0.34, sub: 80, subV: 0.34, verb: 0.18 },
      pistol:      { cut: 3800, dur: 0.08, vol: 0.30, sub: 110, subV: 0.24, verb: 0.12 },
      dmr:         { cut: 2900, dur: 0.13, vol: 0.40, sub: 78, subV: 0.40, verb: 0.24 },
      sniper:      { cut: 2300, dur: 0.20, vol: 0.50, sub: 58, subV: 0.52, verb: 0.42 },
      shotgun:     { cut: 1700, dur: 0.18, vol: 0.50, sub: 62, subV: 0.52, verb: 0.30 },
      autoshotgun: { cut: 1900, dur: 0.13, vol: 0.40, sub: 70, subV: 0.38, verb: 0.20 },
    };
    const p = TABLE[kind] || TABLE.rifle;
    this._click(0.16 + p.vol * 0.35);
    this._burst({ dur: p.dur, vol: p.vol, cut: p.cut, slideCut: p.cut * 0.35, verb: p.verb });
    this._thump(p.sub, p.sub * 0.45, p.dur * 1.5, p.subV);
  }
  explosion() {
    if (!this._ensure() || !this.enabled) return;
    this._thump(130, 26, 0.8, 0.85);
    this._burst({ dur: 0.7, vol: 0.5, cut: 1000, slideCut: 180, verb: 0.6 });
    this._click(0.25, 1800);
    for (let i = 0; i < 5; i++) setTimeout(() => this._burst({ dur: 0.05, vol: 0.14, cut: 2600, verb: 0.2 }), 60 + i * 70 + Math.random() * 40);
  }
  pickup() { this._blip(720, 0.09, 'sine', 0.13, 1080); setTimeout(() => this._blip(1080, 0.1, 'sine', 0.11, 1440), 70); }
  swap() { this._mech(2000, 0.04, 0.12); }
  melee() { this._burst({ dur: 0.14, vol: 0.22, cut: 3200, slideCut: 600, type: 'bandpass', q: 0.8, verb: 0.1 }); this._thump(170, 70, 0.12, 0.2); }
  empty() { this._click(0.12, 3200); setTimeout(() => this._click(0.07, 3200), 55); }
  kill() { this._thump(240, 120, 0.12, 0.18); this._burst({ dur: 0.05, vol: 0.1, cut: 1800 }); }
  hurt() { this._burst({ dur: 0.18, vol: 0.26, cut: 900, slideCut: 300 }); this._thump(150, 70, 0.18, 0.24); }
  reload() {
    this._mech(1800, 0.05, 0.2);                                   // mag release
    setTimeout(() => this._mech(1300, 0.06, 0.22), 165);           // mag seated
    setTimeout(() => { this._mech(2300, 0.05, 0.18); this._click(0.1); }, 345); // charging handle
  }
  wave() {
    this._toneVerb(294, 0.5, 'sawtooth', 0.16, 0.4);
    setTimeout(() => this._toneVerb(392, 0.6, 'sawtooth', 0.16, 0.4), 200);
  }
  over() { this._toneVerb(220, 0.9, 'sawtooth', 0.2, 0.5, 90); this._thump(120, 42, 0.9, 0.3); }

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
