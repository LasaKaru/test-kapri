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
  // master bus + a short algorithmic reverb (generated impulse) for space/punch.
  // Everything funnels through a master low-pass so we can "muffle" the whole
  // mix while paused (a film-style underwater duck).
  _buildBus() {
    const ctx = this.ctx;
    this._outLP = ctx.createBiquadFilter(); this._outLP.type = 'lowpass';
    this._outLP.frequency.value = 20000; this._outLP.Q.value = 0.4;
    this._outLP.connect(ctx.destination);
    this._bus = ctx.createGain(); this._bus.connect(this._outLP);
    this._verb = ctx.createConvolver(); this._verb.buffer = this._makeIR(0.5, 2.8);
    this._wet = ctx.createGain(); this._wet.gain.value = 0.8;
    this._verb.connect(this._wet); this._wet.connect(this._outLP);
  }
  _makeIR(dur, decay) {
    const ctx = this.ctx, len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = buf.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay); }
    return buf;
  }
  _dest() { return this._bus || this.ctx.destination; }
  _out() { return this._outLP || this.ctx.destination; }

  // muffle the entire mix (paused) by collapsing the master low-pass
  setMuffle(on) {
    const ctx = this._ensure(); if (!ctx || !this._outLP) return;
    const t = ctx.currentTime, f = this._outLP.frequency;
    f.cancelScheduledValues(t); f.setValueAtTime(f.value, t);
    f.exponentialRampToValueAtTime(on ? 430 : 20000, t + 0.25);
  }
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
    this.duck(0.5, 0.7);                       // dynamic ducking: music dips under the blast
    this._thump(130, 26, 0.8, 0.85);
    this._burst({ dur: 0.7, vol: 0.5, cut: 1000, slideCut: 180, verb: 0.6 });
    this._click(0.25, 1800);
    for (let i = 0; i < 5; i++) setTimeout(() => this._burst({ dur: 0.05, vol: 0.14, cut: 2600, verb: 0.2 }), 60 + i * 70 + Math.random() * 40);
  }
  pickup() { this._blip(720, 0.09, 'sine', 0.13, 1080); setTimeout(() => this._blip(1080, 0.1, 'sine', 0.11, 1440), 70); }
  swap() { this._mech(2000, 0.04, 0.12); }
  melee() { this._burst({ dur: 0.14, vol: 0.22, cut: 3200, slideCut: 600, type: 'bandpass', q: 0.8, verb: 0.1 }); this._thump(170, 70, 0.12, 0.2); }
  empty() { this._click(0.12, 3200); setTimeout(() => this._click(0.07, 3200), 55); }
  jump() { this._burst({ dur: 0.16, vol: 0.12, cut: 1600, slideCut: 600, type: 'bandpass', q: 0.7 }); }
  land() { this._thump(120, 55, 0.12, 0.18); this._burst({ dur: 0.08, vol: 0.12, cut: 1400 }); }
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
    // optional "radio" colouring for announcer comms (band-limited + crunch)
    if (o.radio) {
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1700; bp.Q.value = 0.9;
      out.connect(bp); bp.connect(this._out());
    } else {
      out.connect(this._out());
    }

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

  // ---- announcer (formant "voice" with a comms beep + radio colour) ----
  // Not real words — an authoritative, band-limited shout that reads as an
  // in-game announcer. Deeper f0 + steady (low-vibrato) formants vs enemy barks.
  _commsBeep() { this._blip(1320, 0.05, 'sine', 0.06, 1320); }
  // syls: [{f0, fm:[[freq,q,gain]...], d}] spoken in sequence
  _say(syls, vol = 0.34) {
    let delay = 0;
    syls.forEach((s) => {
      setTimeout(() => this._formant({
        f0: s.f0, f1: s.f0 * 0.9, dur: s.d, vol, vib: 7, vibDepth: 4,
        radio: true, formants: s.fm,
      }), delay);
      delay += s.d * 900 + 30;
    });
  }
  announce(type, n = 0) {
    if (!this._ensure() || !this.enabled) return;
    // a couple of vowel formant sets to vary the "syllables"
    const A = [[720, 8, 1], [1100, 9, 0.6], [2600, 10, 0.25]]; // "ah"
    const E = [[500, 8, 1], [1700, 9, 0.6], [2500, 10, 0.25]]; // "eh"
    const O = [[450, 8, 1], [800, 9, 0.6], [2400, 10, 0.2]];   // "oh"
    this._commsBeep();
    setTimeout(() => {
      if (type === 'wave') {
        this._say([{ f0: 150, fm: E, d: 0.18 }, { f0: 140, fm: A, d: 0.16 }, { f0: 120, fm: O, d: 0.26 }], 0.32);
      } else if (type === 'base') {
        this._say([{ f0: 135, fm: O, d: 0.2 }, { f0: 128, fm: E, d: 0.16 }, { f0: 110, fm: A, d: 0.3 }], 0.4);
      } else if (type === 'streak') {
        // higher & more syllables the bigger the streak
        const lvl = n >= 10 ? 4 : n >= 7 ? 3 : n >= 5 ? 2 : 1;
        const base = 150 + lvl * 14;
        const syls = [];
        for (let i = 0; i <= lvl; i++) syls.push({ f0: base + i * 10, fm: [A, E, O][i % 3], d: 0.15 });
        this._say(syls, 0.3 + lvl * 0.02);
      }
    }, 90);
  }

  // ---- procedural music + ambience ----
  setMusicVolume(v) { this.musicVol = v; if (this._musicGain) this._musicGain.gain.value = v; }
  setIntensity(level) { this._intensity = Math.max(0, Math.min(1, level)); }

  // Crossfade between three musical stems. 'calm' (exploration/shop),
  // 'combat' (a live wave) and 'boss' (boss wave). Layers run continuously and
  // only their gains crossfade, so transitions are seamless.
  setMusicState(state) {
    this._pendingState = state;
    if (!this._musicOn || !this._layers || !this.ctx) return;
    this._state = state;
    const t = this.ctx.currentTime, R = 2.4;
    const ramp = (g, v) => { g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t); g.gain.linearRampToValueAtTime(v, t + R); };
    ramp(this._layers.calm, state === 'calm' ? 1 : 0.14);          // pad never fully vanishes
    ramp(this._layers.combat, state === 'combat' ? 1 : (state === 'boss' ? 0.45 : 0));
    ramp(this._layers.boss, state === 'boss' ? 1 : 0);
    this._drive = state === 'calm' ? 0.25 : state === 'combat' ? 0.75 : 1;
  }

  // duck the music under a loud event (explosion); recovers over `dur`
  duck(amount = 0.5, dur = 0.6) {
    if (!this._duckGain || !this.ctx) return;
    const t = this.ctx.currentTime, g = this._duckGain.gain;
    g.cancelScheduledValues(t); g.setValueAtTime(Math.max(0.0001, g.value), t);
    g.linearRampToValueAtTime(Math.max(0.05, 1 - amount), t + 0.04);
    g.linearRampToValueAtTime(1, t + dur);
  }

  startMusic() {
    const ctx = this._ensure();
    if (!ctx || this._musicOn) return;
    this._musicOn = true;
    this._beat = 0;
    this._drive = 0.25;
    this._state = 'calm';
    this._stems = [];

    // music sub-master -> ducking gain -> master out (through the muffle LP)
    this._musicGain = ctx.createGain();
    this._musicGain.gain.value = this.musicVol;
    this._duckGain = ctx.createGain(); this._duckGain.gain.value = 1;
    this._musicGain.connect(this._duckGain); this._duckGain.connect(this._out());
    // gentle reverb send so the music sits in the same space as the SFX
    this._musicVerb = ctx.createGain(); this._musicVerb.gain.value = 0.16;
    if (this._verb) this._musicVerb.connect(this._verb);

    // three crossfading stem layers
    this._layers = {};
    const layer = (name, start) => { const g = ctx.createGain(); g.gain.value = start; g.connect(this._musicGain); g.connect(this._musicVerb); this._layers[name] = g; return g; };
    const gCalm = layer('calm', 1), gCombat = layer('combat', 0), gBoss = layer('boss', 0);
    this._padLayer(ctx, gCalm, [55, 82.5, 110], 0.065, 460, 0.06, 170);          // warm exploration pad
    this._padLayer(ctx, gCombat, [110, 165, 220], 0.05, 900, 0.12, 360);         // brighter, tense fifths
    this._padLayer(ctx, gBoss, [55, 58.27, 110], 0.06, 360, 0.05, 90);           // dissonant minor-2nd dread

    // wind ambience (routed to the calm layer so it ducks naturally)
    const wbuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const wd = wbuf.getChannelData(0);
    for (let i = 0; i < wd.length; i++) wd[i] = Math.random() * 2 - 1;
    this._wind = ctx.createBufferSource(); this._wind.buffer = wbuf; this._wind.loop = true;
    const wf = ctx.createBiquadFilter(); wf.type = 'bandpass'; wf.frequency.value = 600; wf.Q.value = 0.5;
    const wg = ctx.createGain(); wg.gain.value = 0.022;
    this._wind.connect(wf); wf.connect(wg); wg.connect(gCalm); this._wind.start();

    if (this._pendingState) this.setMusicState(this._pendingState);
    this._scheduleBeat();
  }

  // detuned-saw pad through a resonant low-pass swept by a slow LFO, into `dest`
  _padLayer(ctx, dest, freqs, gain, cut, lfoRate, lfoDepth) {
    const filt = ctx.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = cut; filt.Q.value = 3;
    const pad = ctx.createGain(); pad.gain.value = gain;
    filt.connect(pad); pad.connect(dest);
    freqs.forEach((f, i) => { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f * (1 + (i - 1) * 0.004); o.connect(filt); o.start(); this._stems.push(o); });
    const lfo = ctx.createOscillator(), lg = ctx.createGain();
    lfo.frequency.value = lfoRate; lg.gain.value = lfoDepth;
    lfo.connect(lg); lg.connect(filt.frequency); lfo.start();
    this._stems.push(lfo);
  }

  stopMusic() {
    this._musicOn = false;
    if (this._musicTimer) clearTimeout(this._musicTimer);
    try { this._stems && this._stems.forEach((o) => { try { o.stop(); } catch (_) {} }); } catch (_) {}
    try { this._wind && this._wind.stop(); } catch (_) {}
    if (this._musicGain) { try { this._musicGain.disconnect(); } catch (_) {} }
    if (this._duckGain) { try { this._duckGain.disconnect(); } catch (_) {} }
    this._stems = null; this._wind = null; this._musicGain = null; this._duckGain = null; this._layers = null;
  }

  // a tuned musical note with attack/decay, optional low-pass body + verb send
  _mnote(freq, dur, type, vol, cut, verb) {
    const ctx = this.ctx; if (!ctx || !this._musicGain) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = o;
    if (cut) { const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = cut; o.connect(lp); node = lp; }
    node.connect(g); g.connect(this._musicGain);
    if (verb && this._musicVerb) g.connect(this._musicVerb);
    o.start(t); o.stop(t + dur + 0.02);
  }
  _bass(freq, dur, vol) { this._mnote(freq, dur, 'triangle', vol, 320); this._mnote(freq, dur, 'sine', vol * 0.7, null); }
  _kick(vol) {
    const ctx = this.ctx; if (!ctx || !this._musicGain) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    o.connect(g); g.connect(this._musicGain); o.start(t); o.stop(t + 0.18);
  }
  _perc(vol, cut, dur, hp) {
    const ctx = this.ctx; if (!ctx || !this._musicGain) return;
    const t = ctx.currentTime, len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let k = 0; k < len; k++) d[k] = (Math.random() * 2 - 1) * (1 - k / len);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = hp ? 'highpass' : 'bandpass'; f.frequency.value = cut;
    const g = ctx.createGain(); g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(this._musicGain); src.start(t);
  }

  // 16-step groove: pad + sub bass + kick/hat/snare and a lead, all building
  // with the wave intensity for a cinematic escalation.
  // Calm by default (just the pad + an occasional sub bass); percussion and
  // the lead only build in as the wave intensity climbs, so it never feels busy.
  _scheduleBeat() {
    if (!this._musicOn || !this.ctx) return;
    const i = Math.max(this._drive || 0, this._intensity || 0), step = this._beat % 16;
    const boss = this._state === 'boss';
    const root = 55; // A1
    if ([0, 6, 8, 14].includes(step)) this._bass(root * (step === 8 ? 1.5 : 1), 0.32, 0.14 + i * 0.05);
    if (i > 0.15 && step % 4 === 0) this._kick(0.38 + i * 0.18);
    if (boss && step % 8 === 0) this._kick(0.6);                                            // boss: heavy downbeat
    if (i > 0.4 && step % 4 === 2) this._perc(0.04 + i * 0.05, 8200, 0.03, true);          // hat (sparse)
    if (i > 0.5 && (step === 4 || step === 12)) this._perc(0.1 + i * 0.07, 1900, 0.12, false); // snare
    if (i > 0.6 && step % 4 === 0) {                                                       // lead (only when intense)
      const motif = boss ? [0, 1, 6, 8] : [0, 3, 7, 10];                                   // boss: dissonant motif
      this._mnote(220 * Math.pow(2, motif[(step / 4) % motif.length] / 12), 0.34, 'triangle', 0.04 + i * 0.05, 2200, true);
    }
    this._beat++;
    const bpm = (boss ? 96 : 78) + i * 36;
    this._musicTimer = setTimeout(() => this._scheduleBeat(), (60 / bpm / 2) * 1000);
  }

  // ---- UI feedback ----
  ui(kind = 'click') {
    if (!this._ensure() || !this.enabled) return;
    if (kind === 'hover') { this._blip(1000, 0.03, 'sine', 0.03, 1200); return; }
    if (kind === 'back') { this._click(0.05, 3500); this._blip(360, 0.05, 'sine', 0.05, 260); return; }
    this._click(0.06, 4200); this._blip(840, 0.04, 'sine', 0.05, 1200);
  }
}
