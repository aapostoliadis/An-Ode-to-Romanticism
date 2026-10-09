// Generative score and sound effects. The exhibitions are driven by a
// soundtrack and the image is cut to it; here a small WebAudio ensemble
// (pads, sea or wind noise, bells) plays a mood per painting, inside a long
// synthetic reverb that stands in for the quarry's acoustics. Its level, or
// the level of a track the visitor loads, feeds back into the light.
//
// Over the score sits a soundscape per painting: what you would hear
// standing in the scene. Continuous beds (rain, wind, fire) are shaped
// noise; events (surf, gulls, birdsong, thunder, bells, creaking timber, a
// steam tug, the train) are synthesised as they happen. Their levels follow
// the score of the painting, so turning the rain up in the editor makes it
// louder, and the train is heard setting off, whistling and coming closer
// as it runs toward the viewer.

const MOODS = {
  dawn: { root: 50, chords: [[0, 7, 11, 16], [5, 9, 16, 19], [2, 9, 14, 17], [7, 11, 14, 19]], bright: 1600, noise: 'sea', noiseAmt: 0.05, bells: 0.5 },
  myth: { root: 45, chords: [[0, 7, 14, 18], [2, 9, 14, 21], [7, 11, 18, 23], [4, 11, 16, 19]], bright: 1400, noise: 'sea', noiseAmt: 0.07, bells: 0.45 },
  warm: { root: 41, chords: [[0, 7, 12, 16], [5, 12, 17, 21], [-3, 4, 12, 16], [7, 14, 19, 23]], bright: 1100, noise: 'sea', noiseAmt: 0.08, bells: 0.3 },
  tragic: { root: 37, chords: [[0, 7, 12, 15], [-4, 3, 8, 12], [5, 12, 15, 20], [-2, 5, 10, 14]], bright: 800, noise: 'sea', noiseAmt: 0.14, bells: 0.15 },
  storm: { root: 38, chords: [[0, 7, 10, 15], [-2, 5, 10, 13], [3, 10, 15, 19], [-5, 2, 7, 10]], bright: 700, noise: 'wind', noiseAmt: 0.16, bells: 0.08 },
  fire: { root: 40, chords: [[0, 7, 13, 15], [1, 8, 13, 17], [-2, 5, 12, 15], [0, 7, 10, 15]], bright: 900, noise: 'fire', noiseAmt: 0.06, bells: 0.1 },
  speed: { root: 43, chords: [[0, 7, 14, 16], [5, 12, 16, 21], [-2, 5, 12, 17], [7, 14, 17, 22]], bright: 1200, noise: 'rain', noiseAmt: 0.06, bells: 0.2 },
  radiant: { root: 48, chords: [[0, 7, 11, 16], [2, 9, 14, 18], [4, 11, 16, 19], [9, 16, 19, 23]], bright: 2000, noise: 'sea', noiseAmt: 0.04, bells: 0.7 },
};

// Soundscapes. Each value is the level of one layer of effects.
export const SOUNDSCAPES = [
  { id: 'mood', label: 'Matched to the score' },
  { id: 'sea', label: 'Surf, gulls and timber' },
  { id: 'river', label: 'River at dawn, birdsong' },
  { id: 'harbour', label: 'Calm water, steam tug, ship bell' },
  { id: 'tempest', label: 'Storm at sea, thunder' },
  { id: 'blizzard', label: 'Snow storm, paddle steamer' },
  { id: 'alps', label: 'Mountain storm, horns' },
  { id: 'fire', label: 'Great fire, bells' },
  { id: 'train', label: 'Steam train in the rain' },
  { id: 'light', label: 'Light, water and glass' },
  { id: 'none', label: 'No effects' },
];

const SCAPES = {
  sea: { waves: 0.6, gulls: 0.6, creak: 0.5, lap: 0.25 },
  river: { lap: 0.6, birds: 0.8, drips: 0.25 },
  harbour: { lap: 0.5, gulls: 0.3, paddle: 0.7, shipBell: 0.5 },
  tempest: { waves: 1, wind: 0.6, thunder: 0.6, creak: 0.5 },
  blizzard: { wind: 1, waves: 0.65, paddle: 0.4, shipBell: 0.35 },
  alps: { wind: 0.9, thunder: 0.8, horn: 0.5 },
  fire: { roar: 1, crackle: 1, crash: 0.6, alarm: 0.5, lap: 0.2 },
  train: { train: 1, wind: 0.15 },
  light: { shimmer: 0.8, drips: 0.5, lap: 0.25 },
  none: {},
};
const MOOD_SCAPE = { dawn: 'river', myth: 'sea', warm: 'harbour', tragic: 'tempest', storm: 'blizzard', fire: 'fire', speed: 'train', radiant: 'light' };

// How often each event comes back, in seconds: [shortest, longest].
const EVERY = {
  waves: [4.5, 8.5],
  gulls: [6, 16],
  birds: [1, 3.5],
  lap: [0.35, 1.3],
  drips: [0.8, 3],
  thunder: [9, 24],
  creak: [2.5, 7],
  shipBell: [16, 32],
  horn: [18, 36],
  crash: [8, 20],
  alarm: [22, 38],
  shimmer: [1.8, 4.5],
};

const midiHz = (m) => 440 * 2 ** ((m - 69) / 12);
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

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
    this.setupFx();
  }

  // Effects bus: mostly dry, a little of the quarry reverb.
  setupFx() {
    const { ctx } = this;
    this.fx = ctx.createGain();
    this.fx.gain.value = 0.8;
    this.fx.connect(this.master);
    const send = ctx.createGain();
    send.gain.value = 0.3;
    this.fx.connect(send);
    send.connect(this.reverb);
    // Beds: looping noise, filtered, each with its own level.
    const bed = (filters) => {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      src.loop = true;
      let node = src;
      const nodes = filters.map(([type, hz, q]) => {
        const f = ctx.createBiquadFilter();
        f.type = type;
        f.frequency.value = hz;
        f.Q.value = q;
        node.connect(f);
        node = f;
        return f;
      });
      const g = ctx.createGain();
      g.gain.value = 0;
      node.connect(g);
      g.connect(this.fx);
      src.start(0, Math.random() * 3);
      return { gain: g, filters: nodes };
    };
    this.beds = {
      rain: bed([['highpass', 1400, 0.5], ['lowpass', 9000, 0.4]]),
      rainLow: bed([['lowpass', 500, 0.6]]),
      windLow: bed([['bandpass', 420, 6]]),
      windHigh: bed([['bandpass', 1100, 3]]),
      roar: bed([['lowpass', 340, 0.8]]),
      water: bed([['lowpass', 620, 0.7], ['highpass', 110, 0.7]]),
    };
    this.trainBus = ctx.createGain();
    this.trainBus.gain.value = 0;
    this.trainPan = this.panner(0);
    this.trainBus.connect(this.trainPan);
    this.scape = null;
    this.scapeId = '';
    this.scene = null;
    this.next = {};
    this.lastUpdate = 0;
    this.train = { moving: false, warned: false, nextChuff: 0, beat: 0, nextClack: 0, rate: 2.4, prox: 0 };
  }

  panner(pan) {
    const { ctx } = this;
    if (ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = clamp(pan, -1, 1);
      p.connect(this.fx);
      return p;
    }
    const g = ctx.createGain();
    g.connect(this.fx);
    return g;
  }

  async start() {
    this.setup();
    await this.ctx.resume();
    this.on = true;
    this.master.gain.setTargetAtTime(0.75, this.ctx.currentTime, 1.2);
    this.applyMood();
    this.nextChord = this.ctx.currentTime + 0.1;
    this.next = {};
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
    if (!this.on) return;
    const now = this.ctx.currentTime;
    this.tickFx(now);
    if (this.music) return;
    const { mood } = this;
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
  }

  voice(midi, at, dur, gain = 1) {
    const { ctx } = this;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0, at);
    out.gain.linearRampToValueAtTime(0.036 * gain, at + 3.5);
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

  // A filtered noise burst: a sharp attack and an exponential decay.
  burst(at, dur, type, hz, gain, { q = 1, attack = 0.004, out = this.fx } = {}) {
    const { ctx } = this;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = hz;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), at + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, at + attack + dur);
    src.connect(f);
    f.connect(g);
    g.connect(out);
    src.start(at, Math.random() * 3);
    src.stop(at + attack + dur + 0.05);
    return f;
  }

  // A tone with a quick attack and a long ring, for bells and drops.
  tone(at, hz, gain, decay, { type = 'sine', attack = 0.005, out = this.fx, toHz = 0, glide = 0.05 } = {}) {
    const { ctx } = this;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(hz, at);
    if (toHz) o.frequency.exponentialRampToValueAtTime(toHz, at + glide);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), at + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
    o.connect(g);
    g.connect(out);
    o.start(at);
    o.stop(at + attack + decay + 0.05);
    return o;
  }

  // -------------------------------------------------------------------------
  // Sound effects

  // Called every frame with what is on the wall: the soundscape, the live
  // weather of the score, and where the train is.
  update(scene) {
    this.scene = scene;
    if (!this.ctx || !this.on) return;
    const now = this.ctx.currentTime;
    if (now - this.lastUpdate < 0.1) return;
    this.lastUpdate = now;
    const id = scene.scape === 'mood' || !SCAPES[scene.scape] ? MOOD_SCAPE[scene.mood] ?? 'none' : scene.scape;
    if (id !== this.scapeId) {
      this.scapeId = id;
      this.scape = SCAPES[id];
      // Stagger the first events so a new painting does not open with all of
      // them at once.
      this.next = {};
      for (const key of Object.keys(EVERY)) this.next[key] = now + rand(0.5, EVERY[key][0]);
    }
    const sc = this.scape;
    const lv = clamp(scene.level ?? 0.8, 0, 1.5);
    this.fx.gain.setTargetAtTime(lv * 2.2, now, 0.3);
    const set = (bed, v, hz) => {
      this.beds[bed].gain.gain.setTargetAtTime(v, now, 0.6);
      if (hz) this.beds[bed].filters[0].frequency.setTargetAtTime(hz, now, 0.8);
    };
    // Beds follow the score: rain with the rain, wind with the snow and
    // the soundscape, fire with the flicker.
    const rain = clamp(scene.rain ?? 0, 0, 1);
    set('rain', rain * 0.09);
    set('rainLow', rain * 0.05);
    const wind = Math.max(sc.wind ?? 0, (scene.snow ?? 0) * 0.8) * (0.55 + 0.45 * clamp(scene.wind ?? 0.3, 0, 1));
    this.windLevel = wind;
    if (!sc.wind && !(scene.snow > 0.05)) {
      set('windLow', 0);
      set('windHigh', 0);
    }
    this.waterLevel = (sc.lap ?? 0) * (0.6 + 0.4 * clamp(scene.water ?? 0.4, 0, 1));
    if (this.waterLevel < 0.01) set('water', 0);
    const roar = clamp(scene.fire ?? 0, 0, 1.2) * (sc.roar ? 1 : 0.5);
    this.roarLevel = roar;
    if (roar < 0.01) set('roar', 0);
    this.updateTrain(scene.train, now);
  }

  tickFx(now) {
    const sc = this.scape;
    if (!sc || !this.scene) return;
    const scene = this.scene;
    const due = (key) => {
      if (!sc[key] || now < this.next[key]) return false;
      const [a, b] = EVERY[key];
      this.next[key] = now + rand(a, b);
      return true;
    };
    const at = () => now + rand(0.02, 0.2);
    const water = clamp(scene.water ?? 0.4, 0, 1.5);

    // Gusts: the two bands of the wind wander and swell.
    if (this.windLevel > 0.01) {
      const g = this.windLevel * rand(0.5, 1);
      this.beds.windLow.gain.gain.setTargetAtTime(g * 0.5, now, rand(0.4, 1.2));
      this.beds.windHigh.gain.gain.setTargetAtTime(g * 0.16, now, rand(0.4, 1.2));
      this.beds.windLow.filters[0].frequency.setTargetAtTime(rand(280, 650), now, rand(0.5, 1.5));
      this.beds.windHigh.filters[0].frequency.setTargetAtTime(rand(800, 1700), now, rand(0.5, 1.5));
    }
    // Calm water: a soft wash that rises and falls.
    if (this.waterLevel > 0.01) {
      this.beds.water.gain.gain.setTargetAtTime(this.waterLevel * rand(0.12, 0.26), now, rand(0.3, 0.9));
    }
    // Fire: the roar flutters, embers crack.
    if (this.roarLevel > 0.01) {
      this.beds.roar.gain.gain.setTargetAtTime(this.roarLevel * rand(0.1, 0.2), now, 0.15);
      this.beds.roar.filters[0].frequency.setTargetAtTime(rand(240, 480), now, 0.2);
      const n = Math.round(this.roarLevel * 4 * (sc.crackle ?? 0.5));
      for (let k = 0; k < n; k++) if (Math.random() < 0.6) this.crackle(now + rand(0, 0.2));
    }
    if (due('waves')) this.wave(at(), sc.waves * (0.6 + 0.4 * Math.min(1, water)));
    if (due('lap')) this.lap(at(), sc.lap);
    if (due('drips')) this.drip(at(), sc.drips);
    if (due('gulls')) this.gulls(at(), sc.gulls);
    if (due('birds')) this.birds(at(), sc.birds);
    if (due('thunder')) this.thunder(at(), sc.thunder, Math.random() < 0.35);
    if (due('creak') && (scene.rocking || sc.creak)) this.creak(at(), sc.creak);
    if (due('shipBell')) this.shipBell(at(), sc.shipBell);
    if (due('horn')) this.horn(at(), sc.horn);
    if (due('crash')) this.crash(at(), sc.crash);
    if (due('alarm')) this.alarm(at(), sc.alarm);
    if (due('shimmer')) this.shimmer(at(), sc.shimmer);
    if (sc.paddle) this.paddle(now, sc.paddle);
    if (sc.train) this.tickTrain(now, sc.train);
  }

  // Surf: a swell that rises, breaks and draws back hissing over the sand.
  wave(at, size) {
    const { ctx } = this;
    const rise = rand(1.3, 2.4);
    const fall = rand(2.4, 4.2);
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(220, at);
    f.frequency.linearRampToValueAtTime(700 + 1500 * size, at + rise);
    f.frequency.exponentialRampToValueAtTime(260, at + rise + fall);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(0.2 * size, at + rise);
    g.gain.setTargetAtTime(0.0001, at + rise, fall / 3);
    const out = this.panner(rand(-0.5, 0.5));
    src.connect(f);
    f.connect(g);
    g.connect(out);
    src.start(at, Math.random() * 3);
    src.stop(at + rise + fall + 1);
    // Foam drawing back.
    this.burst(at + rise + 0.15, fall * 0.7, 'highpass', 3200, 0.05 * size, { attack: 0.3, out });
  }

  // Water lapping against a hull or a bank, now and then a drop.
  lap(at, level) {
    const out = this.panner(rand(-0.6, 0.6));
    this.burst(at, rand(0.18, 0.4), 'bandpass', rand(300, 750), 0.22 * level, { q: 1.1, attack: rand(0.03, 0.08), out });
    if (Math.random() < 0.25) this.drip(at + rand(0.05, 0.2), level * 0.6);
  }

  drip(at, level) {
    const hz = rand(900, 2000);
    this.tone(at, hz, 0.08 * level, 0.09, { toHz: hz * 0.45, glide: 0.06, out: this.panner(rand(-0.7, 0.7)) });
  }

  // Herring gulls: a few falling, nasal cries.
  gulls(at, level) {
    const { ctx } = this;
    const out = this.panner(rand(-0.8, 0.8));
    const n = 2 + Math.floor(Math.random() * 3);
    const f0 = rand(1250, 1650);
    for (let i = 0; i < n; i++) {
      const t = at + i * rand(0.34, 0.5);
      const o = ctx.createOscillator();
      o.type = 'triangle';
      const k = i === 0 ? 1.08 : 1;
      o.frequency.setValueAtTime(f0 * 0.85 * k, t);
      o.frequency.linearRampToValueAtTime(f0 * 1.15 * k, t + 0.06);
      o.frequency.exponentialRampToValueAtTime(f0 * 0.68, t + 0.3);
      const vib = ctx.createOscillator();
      vib.frequency.value = rand(22, 32);
      const vg = ctx.createGain();
      vg.gain.value = 35;
      vib.connect(vg);
      vg.connect(o.frequency);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1900;
      bp.Q.value = 1.2;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.12 * level, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.34);
      o.connect(bp);
      bp.connect(g);
      g.connect(out);
      o.start(t);
      vib.start(t);
      o.stop(t + 0.36);
      vib.stop(t + 0.36);
    }
  }

  // Dawn birdsong: a phrase of quick chirps, sometimes a trill.
  birds(at, level) {
    const out = this.panner(rand(-0.8, 0.8));
    const n = 3 + Math.floor(Math.random() * 7);
    const base = rand(2800, 4600);
    const down = Math.random() < 0.5;
    let t = at;
    for (let i = 0; i < n; i++) {
      const hz = base * rand(0.85, 1.2);
      const len = rand(0.04, 0.09);
      this.tone(t, hz, 0.055 * level, len, { toHz: hz * (down ? 0.7 : 1.35), glide: len, out });
      t += len + rand(0.03, 0.1);
    }
    if (Math.random() < 0.3) {
      const { ctx } = this;
      const o = this.tone(t + 0.1, base * 1.1, 0.04 * level, 0.6, { attack: 0.05, out });
      const lfo = ctx.createOscillator();
      lfo.frequency.value = rand(22, 34);
      const lg = ctx.createGain();
      lg.gain.value = base * 0.12;
      lfo.connect(lg);
      lg.connect(o.frequency);
      lfo.start(t + 0.1);
      lfo.stop(t + 0.8);
    }
  }

  // Thunder: a crack when it is near, then a long uneven roll. The low roll
  // makes the light of the painting flare as well.
  thunder(at, level, near) {
    const { ctx } = this;
    const delay = near ? 0 : rand(0.4, 1.4);
    if (near) {
      this.burst(at, 0.35, 'highpass', 900, 0.25 * level);
      this.burst(at + 0.02, 0.9, 'lowpass', 2600, 0.18 * level);
    }
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = near ? 220 : 140;
    const f2 = ctx.createBiquadFilter();
    f2.type = 'lowpass';
    f2.frequency.value = 400;
    const g = ctx.createGain();
    const t0 = at + delay;
    g.gain.setValueAtTime(0.0001, t0);
    const rolls = 5 + Math.floor(Math.random() * 4);
    let t = t0;
    for (let k = 0; k < rolls; k++) {
      g.gain.setTargetAtTime(0.7 * level * rand(0.35, 1) * (1 - k / (rolls + 2)), t, 0.12);
      t += rand(0.35, 0.8);
    }
    g.gain.setTargetAtTime(0.0001, t, 1.2);
    src.connect(f);
    f.connect(f2);
    f2.connect(g);
    g.connect(this.panner(rand(-0.4, 0.4)));
    src.start(t0, Math.random() * 3);
    src.stop(t + 6);
  }

  // Ship's timber straining: a slow stick-slip buzz through a wooden
  // resonance.
  creak(at, level) {
    const { ctx } = this;
    const out = this.panner(rand(-0.5, 0.5));
    const parts = Math.random() < 0.5 ? 1 : 2;
    let t = at;
    for (let i = 0; i < parts; i++) {
      const len = rand(0.45, 1);
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(rand(28, 45), t);
      o.frequency.linearRampToValueAtTime(rand(50, 85), t + len);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = rand(650, 1150);
      bp.Q.value = 7;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.09 * level, t + len * 0.3);
      g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      o.connect(bp);
      bp.connect(g);
      g.connect(out);
      o.start(t);
      o.stop(t + len + 0.05);
      t += len + rand(0.15, 0.5);
    }
  }

  // A steam tug or paddle steamer: a slow chug and the splash of the
  // paddles.
  paddle(now, level) {
    if (!this.next.paddle || this.next.paddle < now) this.next.paddle = now + 0.05;
    while (this.next.paddle < now + 0.25) {
      const t = this.next.paddle;
      this.paddleBeat = (this.paddleBeat ?? 0) + 1;
      this.burst(t, 0.16, 'lowpass', 220, 0.5 * level, { q: 0.8, out: this.panner(-0.15) });
      if (this.paddleBeat % 2 === 0) this.burst(t + 0.12, 0.28, 'bandpass', 1300, 0.09 * level, { q: 0.8, attack: 0.04, out: this.panner(-0.1) });
      this.next.paddle += 1 / 1.55;
    }
  }

  // A ship's bell, struck twice.
  shipBell(at, level) {
    const out = this.panner(rand(-0.3, 0.3));
    for (const t of [at, at + 0.55]) {
      [[1, 1], [2.32, 0.45], [4.25, 0.25], [6.63, 0.12]].forEach(([m, a]) => {
        this.tone(t, 880 * m, 0.06 * level * a, 3.2 / Math.sqrt(m), { attack: 0.003, out });
      });
    }
  }

  // A distant church bell ringing the alarm: a peal of strikes.
  alarm(at, level) {
    const { ctx } = this;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1800;
    lp.connect(this.panner(rand(-0.6, 0.6)));
    const strikes = 4 + Math.floor(Math.random() * 3);
    for (let i = 0; i < strikes; i++) {
      const t = at + i * 2.3;
      [[0.5, 0.6], [1, 1], [1.19, 0.5], [1.5, 0.3], [2, 0.35], [2.52, 0.15]].forEach(([m, a]) => {
        this.tone(t, 310 * m, 0.03 * level * a, 4.5 / Math.sqrt(m + 0.5), { attack: 0.004, out: lp });
      });
    }
  }

  // Timbers giving way in the fire: a low boom, a rush, a spray of sparks.
  crash(at, level) {
    this.tone(at, 75, 0.3 * level, 1.2, { toHz: 34, glide: 0.7, attack: 0.01 });
    this.burst(at, 1.6, 'lowpass', 1400, 0.12 * level, { attack: 0.02 });
    for (let k = 0; k < 12; k++) this.crackle(at + rand(0.05, 1.6));
  }

  crackle(at) {
    this.burst(at, 0.02 + Math.random() * 0.04, 'highpass', 2500 + Math.random() * 3000, 0.05 + Math.random() * 0.08, { attack: 0.002, out: this.fx });
  }

  // Far horns echoing in the mountains.
  horn(at, level) {
    const { ctx } = this;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 650;
    const g = ctx.createGain();
    const len = rand(1.4, 2.2);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.035 * level, at + 0.6);
    g.gain.setTargetAtTime(0.0001, at + len, 0.4);
    lp.connect(g);
    g.connect(this.reverb);
    g.connect(this.panner(rand(-0.7, 0.7)));
    for (const [hz, det] of [[98, -6], [147, 5]]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(hz * 0.94, at);
      o.frequency.exponentialRampToValueAtTime(hz, at + 0.35);
      o.detune.value = det;
      o.connect(lp);
      o.start(at);
      o.stop(at + len + 2);
    }
  }

  // Glass-like tones in the light, taken from the chord of the score.
  shimmer(at, level) {
    const { ctx } = this;
    const chord = this.mood.chords[this.chordIndex % this.mood.chords.length];
    const hz = midiHz(this.mood.root + 36 + chord[Math.floor(Math.random() * chord.length)]);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.03 * level, at + 1.2);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 5);
    g.connect(this.reverb);
    g.connect(this.panner(rand(-0.7, 0.7)));
    for (const [m, a] of [[1, 1], [2, 0.25]]) {
      const o = ctx.createOscillator();
      o.frequency.value = hz * m;
      const og = ctx.createGain();
      og.gain.value = a;
      o.connect(og);
      og.connect(g);
      o.start(at);
      o.stop(at + 5.1);
    }
  }

  // ---- The train

  // The train is heard where it is: quiet in the distance, louder and
  // faster as it comes, panned with it across the wall. It whistles as it
  // sets off and again as it comes near.
  updateTrain(tr, now) {
    const st = this.train;
    if (!this.scape?.train) {
      this.trainBus.gain.setTargetAtTime(0, now, 0.3);
      return;
    }
    if (!tr) {
      // A score with the train sound but no moving train: a steady chug
      // off to one side.
      st.prox = 0.35;
      st.rate = 2.3;
      this.trainBus.gain.setTargetAtTime(0.5, now, 0.5);
      return;
    }
    const prox = clamp((tr.scale - 1) / 3, 0, 1);
    st.prox = prox;
    st.rate = 2.2 + 4.2 * prox;
    // The sound lingers a little as the train passes out of the picture.
    this.trainBus.gain.setTargetAtTime(Math.sqrt(tr.alpha) * (0.35 + 0.65 * prox), now, 0.15);
    if (this.trainPan.pan) this.trainPan.pan.setTargetAtTime(clamp((tr.x - 0.5) * 1.4, -0.85, 0.85), now, 0.2);
    if (tr.alpha < 0.05) {
      st.moving = false;
      st.warned = false;
    } else if (!st.moving && tr.scale > 1.003) {
      st.moving = true;
      this.hiss(now + 0.02, 1.2);
      this.whistle(now + 0.1, 1.1, 0.7);
    } else if (st.moving && !st.warned && prox > 0.3) {
      st.warned = true;
      this.whistle(now + 0.05, 0.6, 1);
      this.whistle(now + 0.85, 1.3, 1);
    }
  }

  tickTrain(now) {
    const st = this.train;
    if (st.nextChuff < now) st.nextChuff = now + 0.02;
    // Four exhausts to a turn of the driving wheels, the first strongest.
    while (st.nextChuff < now + 0.25) {
      this.chuff(st.nextChuff, st.beat % 4 === 0);
      st.beat++;
      st.nextChuff += 1 / st.rate;
    }
    // The wheels click over the rail joints, faster with speed.
    if (st.nextClack < now) st.nextClack = now + 0.1;
    while (st.nextClack < now + 0.25) {
      this.clack(st.nextClack);
      st.nextClack += 3.4 / st.rate;
    }
  }

  chuff(at, accent) {
    const out = this.trainBus;
    this.burst(at, 0.13, 'bandpass', 420, accent ? 0.2 : 0.12, { q: 0.9, attack: 0.006, out });
    this.burst(at, 0.2, 'highpass', 2200, accent ? 0.06 : 0.04, { attack: 0.01, out });
  }

  clack(at) {
    const out = this.trainBus;
    for (const t of [at, at + 0.11]) {
      this.burst(t, 0.03, 'bandpass', 2800, 0.09, { q: 4, attack: 0.002, out });
      this.tone(t, 120, 0.08, 0.06, { attack: 0.002, out });
    }
  }

  // A steam whistle: a bright tone that bends up into pitch, with the
  // breath of the steam through it.
  whistle(at, len, level) {
    const { ctx } = this;
    const hz = 640;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.06 * level, at + 0.07);
    g.gain.setValueAtTime(0.06 * level, at + len);
    g.gain.exponentialRampToValueAtTime(0.0001, at + len + 0.25);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2600;
    lp.connect(g);
    g.connect(this.trainBus);
    g.connect(this.reverb);
    for (const [m, type, a] of [[1, 'triangle', 1], [1.5, 'sine', 0.35], [2, 'sine', 0.25]]) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(hz * m * 0.9, at);
      o.frequency.exponentialRampToValueAtTime(hz * m, at + 0.12);
      o.frequency.setValueAtTime(hz * m, at + len);
      o.frequency.exponentialRampToValueAtTime(hz * m * 0.96, at + len + 0.25);
      const og = ctx.createGain();
      og.gain.value = a;
      o.connect(og);
      og.connect(lp);
      o.start(at);
      o.stop(at + len + 0.3);
    }
    this.burst(at, len + 0.2, 'bandpass', hz * 2, 0.03 * level, { q: 8, attack: 0.06, out: this.trainBus });
  }

  // Steam blown off as the engine sets off.
  hiss(at, len) {
    this.burst(at, len, 'highpass', 2600, 0.09, { attack: 0.05, out: this.trainBus });
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
