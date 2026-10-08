// Generative score. The exhibitions are driven by a soundtrack and the image
// is cut to it; here a small WebAudio ensemble (pads, sea or wind noise,
// bells, fire crackle, train pulse) plays a mood per painting, inside a long
// synthetic reverb that stands in for the quarry's acoustics. Its level, or
// the level of a track the visitor loads, feeds back into the light.

const MOODS = {
  dawn: { root: 50, chords: [[0, 7, 11, 16], [5, 9, 16, 19], [2, 9, 14, 17], [7, 11, 14, 19]], bright: 1600, noise: 'sea', noiseAmt: 0.05, bells: 0.5 },
  myth: { root: 45, chords: [[0, 7, 14, 18], [2, 9, 14, 21], [7, 11, 18, 23], [4, 11, 16, 19]], bright: 1400, noise: 'sea', noiseAmt: 0.07, bells: 0.45 },
  warm: { root: 41, chords: [[0, 7, 12, 16], [5, 12, 17, 21], [-3, 4, 12, 16], [7, 14, 19, 23]], bright: 1100, noise: 'sea', noiseAmt: 0.08, bells: 0.3 },
  tragic: { root: 37, chords: [[0, 7, 12, 15], [-4, 3, 8, 12], [5, 12, 15, 20], [-2, 5, 10, 14]], bright: 800, noise: 'sea', noiseAmt: 0.14, bells: 0.15 },
  storm: { root: 38, chords: [[0, 7, 10, 15], [-2, 5, 10, 13], [3, 10, 15, 19], [-5, 2, 7, 10]], bright: 700, noise: 'wind', noiseAmt: 0.16, bells: 0.08 },
  fire: { root: 40, chords: [[0, 7, 13, 15], [1, 8, 13, 17], [-2, 5, 12, 15], [0, 7, 10, 15]], bright: 900, noise: 'fire', noiseAmt: 0.06, bells: 0.1 },
  speed: { root: 43, chords: [[0, 7, 14, 16], [5, 12, 16, 21], [-2, 5, 12, 17], [7, 14, 17, 22]], bright: 1200, noise: 'rain', noiseAmt: 0.1, bells: 0.2, pulse: 2.3 },
  radiant: { root: 48, chords: [[0, 7, 11, 16], [2, 9, 14, 18], [4, 11, 16, 19], [9, 16, 19, 23]], bright: 2000, noise: 'sea', noiseAmt: 0.04, bells: 0.7 },
};

const midiHz = (m) => 440 * 2 ** ((m - 69) / 12);

function impulse(ctx, seconds, decay) {
  const len = Math.round(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** decay;
  }
  return buf;
}

export class Ambient {
  constructor() {
    this.ctx = null;
    this.on = false;
    this.mood = MOODS.warm;
    this.level = 0;
    this.music = null;
  }

  setup() {
    if (this.ctx) return;
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 512;
    this.freq = new Uint8Array(this.analyser.frequencyBinCount);
    this.streamDest = ctx.createMediaStreamDestination();
    this.master.connect(comp);
    comp.connect(ctx.destination);
    comp.connect(this.analyser);
    comp.connect(this.streamDest);

    this.reverb = ctx.createConvolver();
    this.reverb.buffer = impulse(ctx, 5, 2.6);
    const wet = ctx.createGain();
    wet.gain.value = 0.55;
    this.reverb.connect(wet);
    wet.connect(this.master);

    this.bus = ctx.createGain();
    this.bus.gain.value = 1;
    this.bus.connect(this.master);
    this.bus.connect(this.reverb);

    const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
    const nd = noiseBuf.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    this.noiseBuf = noiseBuf;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    this.noiseFilter = ctx.createBiquadFilter();
    this.noiseGain = ctx.createGain();
    this.noiseGain.gain.value = 0;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.075;
    this.lfoGain = ctx.createGain();
    this.lfoGain.gain.value = 0;
    lfo.connect(this.lfoGain);
    this.lfoGain.connect(this.noiseGain.gain);
    src.connect(this.noiseFilter);
    this.noiseFilter.connect(this.noiseGain);
    this.noiseGain.connect(this.bus);
    src.start();
    lfo.start();
    this.nextChord = 0;
    this.chordIndex = 0;
    this.nextPulse = 0;
  }

  async start() {
    this.setup();
    await this.ctx.resume();
    this.on = true;
    this.master.gain.setTargetAtTime(0.75, this.ctx.currentTime, 1.2);
    this.applyMood();
    this.nextChord = this.ctx.currentTime + 0.1;
    clearInterval(this.timer);
    this.timer = setInterval(() => this.tick(), 200);
    if (this.music) this.music.play().catch(() => {});
  }

  stop() {
    if (!this.ctx) return;
    this.on = false;
    this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.6);
    clearInterval(this.timer);
    if (this.music) this.music.pause();
  }

  setMood(name) {
    this.mood = MOODS[name] ?? MOODS.warm;
    this.chordIndex = 0;
    if (this.ctx && this.on) {
      this.applyMood();
      this.nextChord = Math.min(this.nextChord, this.ctx.currentTime + 1.5);
    }
  }

  applyMood() {
    const { ctx, mood } = this;
    const now = ctx.currentTime;
    const f = this.noiseFilter;
    const kinds = {
      sea: ['lowpass', 520, 0.7],
      wind: ['bandpass', 700, 0.9],
      rain: ['highpass', 2600, 0.5],
      fire: ['bandpass', 1800, 0.6],
    };
    const [type, hz, q] = kinds[mood.noise] ?? kinds.sea;
    f.type = type;
    f.frequency.setTargetAtTime(hz, now, 1);
    f.Q.value = q;
    const amt = this.music ? 0 : mood.noiseAmt;
    this.noiseGain.gain.setTargetAtTime(amt, now, 1.5);
    this.lfoGain.gain.setTargetAtTime(amt * 0.8, now, 1.5);
  }

  tick() {
    if (!this.on || this.music) return;
    const { ctx, mood } = this;
    const now = ctx.currentTime;
    if (now >= this.nextChord - 0.05) {
      const chord = mood.chords[this.chordIndex % mood.chords.length];
      this.chordIndex++;
      const dur = 9 + Math.random() * 2;
      for (const n of chord) this.voice(mood.root + n, this.nextChord, dur);
      this.voice(mood.root - 12 + chord[0], this.nextChord, dur, 0.6);
      this.nextChord += dur - 1.5;
    }
    if (Math.random() < mood.bells * 0.06) {
      const chord = mood.chords[(this.chordIndex + 3) % mood.chords.length];
      const n = chord[Math.floor(Math.random() * chord.length)];
      this.bell(mood.root + 24 + n, now + Math.random() * 0.2);
    }
    if (mood.noise === 'fire') {
      for (let k = 0; k < 3; k++) if (Math.random() < 0.5) this.crackle(now + Math.random() * 0.2);
    }
    if (mood.pulse) {
      if (this.nextPulse < now) this.nextPulse = now;
      while (this.nextPulse < now + 0.25) {
        this.chuff(this.nextPulse);
        this.nextPulse += 1 / mood.pulse;
      }
    }
  }

  voice(midi, at, dur, gain = 1) {
    const { ctx } = this;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0, at);
    out.gain.linearRampToValueAtTime(0.045 * gain, at + 3.5);
    out.gain.setTargetAtTime(0, at + dur - 3, 1.4);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(this.mood.bright * 0.5, at);
    lp.frequency.linearRampToValueAtTime(this.mood.bright, at + dur * 0.5);
    lp.frequency.linearRampToValueAtTime(this.mood.bright * 0.4, at + dur);
    lp.connect(out);
    out.connect(this.bus);
    for (const [type, det] of [
      ['sawtooth', -7],
      ['triangle', 6],
    ]) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = midiHz(midi);
      o.detune.value = det;
      o.connect(lp);
      o.start(at);
      o.stop(at + dur + 4);
    }
  }

  bell(midi, at) {
    const { ctx } = this;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(0.035, at + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 4);
    g.connect(this.reverb);
    g.connect(this.bus);
    for (const mult of [1, 2.76]) {
      const o = ctx.createOscillator();
      o.frequency.value = midiHz(midi) * mult;
      o.connect(g);
      o.start(at);
      o.stop(at + 4.2);
    }
  }

  burst(at, dur, type, hz, gain) {
    const { ctx } = this;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = hz;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.bus);
    src.start(at, Math.random() * 3);
    src.stop(at + dur + 0.05);
  }

  crackle(at) {
    this.burst(at, 0.02 + Math.random() * 0.04, 'highpass', 2500 + Math.random() * 3000, 0.05 + Math.random() * 0.08);
  }

  chuff(at) {
    this.burst(at, 0.16, 'bandpass', 380, 0.09);
  }

  async useMusic(file) {
    this.setup();
    if (this.music) {
      this.music.pause();
      URL.revokeObjectURL(this.music.src);
    }
    const el = new Audio();
    el.src = URL.createObjectURL(file);
    el.loop = true;
    this.music = el;
    const src = this.ctx.createMediaElementSource(el);
    src.connect(this.master);
    await this.start();
    this.applyMood();
    await el.play();
  }

  // Smoothed low-band energy, 0..1, used to make the light breathe.
  sample() {
    if (!this.ctx || !this.on) {
      this.level *= 0.95;
      return this.level;
    }
    this.analyser.getByteFrequencyData(this.freq);
    let s = 0;
    const bins = 24;
    for (let i = 1; i <= bins; i++) s += this.freq[i];
    const v = Math.min(1, (s / bins / 255) * 1.6);
    this.level += (v - this.level) * (v > this.level ? 0.35 : 0.06);
    return this.level;
  }

  get stream() {
    return this.ctx && this.on ? this.streamDest.stream : null;
  }
}
