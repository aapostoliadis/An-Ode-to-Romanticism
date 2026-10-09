// Music and sound effects. The exhibitions are driven by a soundtrack and
// the image is cut to it. Here the background music is an original track,
// Suspended by Light, looping through the whole show; a visitor can load
// their own in its place. If the track cannot be played, a small WebAudio
// ensemble (pads, sea or wind noise, bells) plays a mood per painting
// instead, inside a long synthetic reverb that stands in for the quarry's
// acoustics. The level of the music feeds back into the light.
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
  { id: 'fire', label: 'Raging fire, bells' },
  { id: 'train', label: 'Steam train in the rain' },
  { id: 'light', label: 'Light, water and glass' },
  { id: 'none', label: 'No effects' },
];

const SCAPES = {
  sea: { waves: 0.6, gulls: 0.6, creak: 0.5, lap: 0.25 },
  river: { lap: 0.6, birds: 0.8, drips: 0.25 },
  harbour: { lap: 0.5, gulls: 0.3, paddle: 0.7, shipBell: 0.5 },
  // A heavy sea: breakers that boom and roar, a deep swell under them, and
  // carried on the storm, cries for help.
  tempest: { waves: 1.6, seaRoar: 1, wind: 0.6, thunder: 0.6, creak: 0.5, cries: 0.75, every: { waves: [2.6, 5.2] } },
  blizzard: { wind: 1, waves: 1.5, seaRoar: 0.9, paddle: 0.4, shipBell: 0.35, every: { waves: [2.8, 5.5] } },
  // The army on the pass: soldiers calling in their own tongue, the column
  // murmuring far off, armour and weapons clinking.
  alps: { wind: 0.9, thunder: 0.8, horn: 0.5, shouts: 0.7, army: 0.55, metal: 0.6 },
  fire: { roar: 0.3, crackle: 1, flare: 1, crash: 0.18, alarm: 0.3, lap: 0.15, people: 0.6 },
  train: { train: 1, wind: 0.15 },
  // After the deluge: grieving voices murmuring and sobbing, people wading.
  light: { shimmer: 0.5, drips: 0.4, lap: 0.25, murmur: 0.6, sobs: 0.55, wade: 0.6 },
  none: {},
};

// Recorded voices for the soundscapes (made by tools/make_voices.py): how
// many clips of each kind there are in audio/fx.
const CLIPS = {
  'burning-cry': 14,
  'hannibal-shout': 10,
  'hannibal-army': 3,
  'slave-wail': 8,
  'deluge-sob': 6,
  'deluge-murmur': 3,
};
// Which clips each voice event plays.
const VOICE_CLIPS = { cries: 'slave-wail', shouts: 'hannibal-shout', army: 'hannibal-army', people: 'burning-cry', sobs: 'deluge-sob', murmur: 'deluge-murmur' };
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
  flare: [1.4, 3.6],
  crash: [6, 14],
  alarm: [22, 38],
  shimmer: [1.8, 4.5],
  cries: [5, 12],
  shouts: [4, 10],
  army: [5.5, 7],
  metal: [1.2, 4.5],
  people: [2.5, 7],
  sobs: [6, 13],
  murmur: [6, 7.5],
  wade: [7, 15],
};

export const BACKGROUND_TRACK = { url: 'audio/suspended-by-light.mp3', title: 'Suspended by Light' };

// Where a pass of the music starts and ends: past the track's own fade-in
// and before its fade-out, where it plays at full voice, so one pass can
// crossfade into the next without a dip. Measured in windows of 0.1 s.
function loopPoints(buffer) {
  const win = Math.round(buffer.sampleRate * 0.1);
  const n = Math.floor(buffer.length / win);
  const chans = Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c));
  const rms = new Float32Array(n);
  for (let w = 0; w < n; w++) {
    let s = 0;
    for (const d of chans) for (let i = w * win; i < (w + 1) * win; i += 4) s += d[i] * d[i];
    rms[w] = Math.sqrt(s / Math.ceil(win / 4) / chans.length);
  }
  // Full voice: within 6 dB of the track's median level.
  const body = Float32Array.from(rms).sort()[n >> 1] * 0.5;
  let a = 0;
  while (a < n && rms[a] < body) a++;
  let b = n - 1;
  while (b > a && rms[b] < body) b--;
  let loopStart = Math.min(a * 0.1, 12);
  let loopEnd = Math.max((b + 1) * 0.1, buffer.duration - 12);
  if (loopEnd - loopStart < 20) {
    loopStart = 0;
    loopEnd = buffer.duration;
  }
  return { loopStart, loopEnd, fade: Math.min(4, (loopEnd - loopStart) / 5) };
}

// Equal-power fade curves for the crossfade between passes.
const FADE_IN = Float32Array.from({ length: 64 }, (_, i) => Math.sin(((i / 63) * Math.PI) / 2));
const FADE_OUT = Float32Array.from({ length: 64 }, (_, i) => Math.cos(((i / 63) * Math.PI) / 2));

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
    this.musicVoices = [];
    this.musicNext = 0;
  }

  setup() {
    if (this.ctx) return;
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.musicBus = ctx.createGain();
    this.musicBus.connect(this.master);
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
    const bed = (filters, out = this.fx) => {
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
      g.connect(out);
      src.start(0, Math.random() * 3);
      return { gain: g, filters: nodes };
    };
    this.beds = {
      rain: bed([['highpass', 1400, 0.5], ['lowpass', 9000, 0.4]]),
      rainLow: bed([['lowpass', 500, 0.6]]),
      windLow: bed([['bandpass', 420, 6]]),
      windHigh: bed([['bandpass', 1100, 3]]),
      // A blaze in three bands: the deep rumble, the roaring body, the hiss.
      fireLow: bed([['lowpass', 150, 0.9]]),
      roar: bed([['lowpass', 520, 0.6], ['highpass', 90, 0.6]]),
      fireHiss: bed([['highpass', 2200, 0.5]]),
      water: bed([['lowpass', 620, 0.7], ['highpass', 110, 0.7]]),
      // The deep, heaving roar of a heavy sea under the breakers.
      seaRoar: bed([['lowpass', 170, 0.7]]),
    };
    // Flames flicker faster than any score: slow noise shakes the level of
    // the rumble and the roar several times a second.
    const flicker = ctx.createBufferSource();
    flicker.buffer = this.noiseBuf;
    flicker.loop = true;
    let fl = flicker;
    for (let i = 0; i < 2; i++) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 9;
      f.Q.value = 0.5;
      fl.connect(f);
      fl = f;
    }
    this.flickerDepth = ctx.createGain();
    this.flickerDepth.gain.value = 0;
    fl.connect(this.flickerDepth);
    this.flickerDepth.connect(this.beds.roar.gain.gain);
    this.flickerDepth.connect(this.beds.fireLow.gain.gain);
    flicker.start(0, Math.random() * 3);
    this.trainBus = ctx.createGain();
    this.trainBus.gain.value = 0;
    this.trainPan = this.panner(0);
    this.trainBus.connect(this.trainPan);
    // An old locomotive is never silent between its beats: the fire roaring
    // in the box, steam leaking, the wheels rumbling on the rails.
    this.trainBeds = {
      boiler: bed([['lowpass', 260, 0.7]], this.trainBus),
      leak: bed([['highpass', 4500, 0.5]], this.trainBus),
      rails: bed([['lowpass', 95, 0.8]], this.trainBus),
    };
    this.clipCache = {};
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
    clearTimeout(this.suspendTimer);
    this.prepareMusic();
    await this.ctx.resume();
    this.on = true;
    this.master.gain.setTargetAtTime(0.75, this.ctx.currentTime, 1.2);
    this.applyMood();
    this.nextChord = this.ctx.currentTime + 0.1;
    this.next = {};
    clearInterval(this.timer);
    this.timer = setInterval(() => this.tick(), 200);
    if (this.music && !this.musicVoices.length) this.playMusic(this.ctx.currentTime + 0.05);
  }

  stop() {
    if (!this.ctx) return;
    this.on = false;
    this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.6);
    clearInterval(this.timer);
    // Once faded out the whole context rests, so the music picks up where
    // it left off when the sound comes back.
    clearTimeout(this.suspendTimer);
    this.suspendTimer = setTimeout(() => {
      if (!this.on) this.ctx.suspend();
    }, 2500);
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
    const amt = this.music || this.musicLoading ? 0 : mood.noiseAmt;
    this.noiseGain.gain.setTargetAtTime(amt, now, 1.5);
    this.lfoGain.gain.setTargetAtTime(amt * 0.8, now, 1.5);
  }

  tick() {
    if (!this.on) return;
    const now = this.ctx.currentTime;
    this.tickFx(now);
    // The next pass of the music is queued well ahead of its start.
    if (this.music && this.musicVoices.length && now > this.musicNext - 60) {
      this.schedulePass(Math.max(this.musicNext, now + 0.05), this.music.loopStart, true);
    }
    if (this.music || this.musicLoading) return;
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
    // Partials above what the output can carry are left out.
    if (hz >= ctx.sampleRate * 0.45) return null;
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
      for (const key of Object.keys(EVERY)) this.next[key] = now + rand(0.5, this.every(key)[0]);
      // Load the recorded voices this soundscape uses.
      for (const key of Object.keys(VOICE_CLIPS)) if (this.scape[key]) this.loadClips(VOICE_CLIPS[key]);
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
    // The fire stays behind the music: a blaze heard across the river.
    const roar = clamp(scene.fire ?? 0, 0, 1.2) * (sc.roar ?? 0.15);
    this.roarLevel = roar;
    this.flickerDepth.gain.setTargetAtTime(roar * 14, now, 0.3);
    if (roar < 0.01) {
      set('fireLow', 0);
      set('roar', 0);
      set('fireHiss', 0);
    }
    this.seaRoarLevel = (sc.seaRoar ?? 0) * (0.6 + 0.4 * clamp(scene.water ?? 0.5, 0, 1.5));
    if (this.seaRoarLevel < 0.01) set('seaRoar', 0);
    this.updateTrain(scene.train, now);
  }

  tickFx(now) {
    const sc = this.scape;
    if (!sc || !this.scene) return;
    const scene = this.scene;
    const due = (key) => {
      if (!sc[key] || now < this.next[key]) return false;
      const [a, b] = this.every(key);
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
    // Fire: the blaze surges and falls back, timber spits and pops.
    if (this.roarLevel > 0.01) {
      const lv = this.roarLevel;
      this.beds.fireLow.gain.gain.setTargetAtTime(lv * rand(0.4, 0.7), now, 0.12);
      this.beds.roar.gain.gain.setTargetAtTime(lv * rand(0.2, 0.36), now, 0.1);
      this.beds.roar.filters[0].frequency.setTargetAtTime(rand(380, 900), now, 0.15);
      this.beds.fireHiss.gain.gain.setTargetAtTime(lv * rand(0.025, 0.06), now, 0.2);
      const n = Math.round(lv * 6 * (sc.crackle ?? 0.5));
      for (let k = 0; k < n; k++) if (Math.random() < 0.7) this.crackle(now + rand(0, 0.2), lv);
      if (Math.random() < lv * 0.35) this.pop(now + rand(0, 0.2), lv);
      if (due('flare')) this.flare(at(), lv * sc.flare);
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
    // A heavy sea heaves under everything.
    if (this.seaRoarLevel > 0.01) {
      this.beds.seaRoar.gain.gain.setTargetAtTime(this.seaRoarLevel * rand(0.35, 0.8), now, rand(0.6, 1.6));
    }
    for (const key of ['cries', 'shouts', 'army', 'people', 'sobs', 'murmur']) {
      if (due(key)) this.playClip(VOICE_CLIPS[key], at(), sc[key], key === 'army' || key === 'murmur');
    }
    if (due('metal')) this.metal(at(), sc.metal);
    if (due('wade')) this.wade(at(), sc.wade);
    if (sc.paddle) this.paddle(now, sc.paddle);
    if (sc.train) this.tickTrain(now, sc.train);
  }

  every(key) {
    return this.scape?.every?.[key] ?? EVERY[key];
  }

  // ---- Recorded voices

  loadClips(group) {
    if (this.clipCache[group]) return;
    const urls = Array.from({ length: CLIPS[group] }, (_, i) => `audio/fx/${group}-${String(i + 1).padStart(2, '0')}.mp3`);
    this.clipCache[group] = { buffers: [], last: -1 };
    for (const url of urls) {
      fetch(url)
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`${url}: ${r.status}`))))
        .then((data) => this.ctx.decodeAudioData(data))
        .then((buffer) => this.clipCache[group].buffers.push(buffer))
        .catch((err) => console.warn(err));
    }
  }

  // A voice from the scene: a little higher or lower each time, placed
  // somewhere across the wall, in the room's reverb. A bed (the army, the
  // murmuring crowd) plays wide and steady.
  playClip(group, at, level, bed = false) {
    const set = this.clipCache[group];
    if (!set || !set.buffers.length) return;
    let i = Math.floor(Math.random() * set.buffers.length);
    if (i === set.last && set.buffers.length > 1) i = (i + 1) % set.buffers.length;
    set.last = i;
    const { ctx } = this;
    const src = ctx.createBufferSource();
    src.buffer = set.buffers[i];
    src.playbackRate.value = rand(0.93, 1.07);
    const g = ctx.createGain();
    g.gain.value = (bed ? 0.35 : 0.5) * level;
    src.connect(g);
    g.connect(this.panner(bed ? rand(-0.3, 0.3) : rand(-0.8, 0.8)));
    const send = ctx.createGain();
    send.gain.value = 0.5;
    g.connect(send);
    send.connect(this.reverb);
    src.start(at);
  }

  // Armour, chain and weapons on the march: small metallic strikes, now and
  // then the long ring of a blade.
  metal(at, level) {
    const out = this.panner(rand(-0.7, 0.7));
    const strikes = 1 + Math.floor(Math.random() * 5);
    let t = at;
    for (let k = 0; k < strikes; k++) {
      const hz = rand(1700, 4200);
      [[1, 1], [2.76, 0.5], [5.4, 0.25]].forEach(([m, a]) => this.tone(t, hz * m, 0.03 * level * a, rand(0.06, 0.25), { attack: 0.001, out }));
      t += rand(0.05, 0.2);
    }
    if (Math.random() < 0.2) {
      const hz = rand(650, 1050);
      [[1, 1], [2.41, 0.6], [3.93, 0.4], [6.1, 0.2]].forEach(([m, a]) => this.tone(t + 0.1, hz * m, 0.035 * level * a, 1.4 / Math.sqrt(m), { attack: 0.002, out }));
    }
  }

  // Someone wading through the flood: a few heavy steps, each a slosh and
  // a swirl of water, passing slowly across the wall.
  wade(at, level) {
    const steps = 3 + Math.floor(Math.random() * 4);
    const from = rand(-0.8, 0.8);
    const to = clamp(from + rand(-0.6, 0.6), -0.9, 0.9);
    for (let k = 0; k < steps; k++) {
      const t = at + k * rand(0.7, 1.0);
      const out = this.panner(from + ((to - from) * k) / steps);
      const f = this.burst(t, rand(0.35, 0.55), 'bandpass', 500, 0.3 * level, { q: 0.9, attack: 0.06, out });
      f.frequency.setValueAtTime(380, t);
      f.frequency.exponentialRampToValueAtTime(1300, t + 0.25);
      this.burst(t + 0.02, 0.18, 'lowpass', 300, 0.3 * level, { attack: 0.02, out });
      for (let d = 0; d < 2; d++) this.drip(t + rand(0.2, 0.6), level * 0.5);
    }
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
    // A heavy sea breaks with a boom you feel, and a roar of white water.
    if (size > 1) {
      const big = size - 1;
      this.tone(at + rise, rand(48, 60), 0.55 * big, 2.2, { toHz: 28, glide: 1.4, attack: 0.03, out });
      this.burst(at + rise - 0.05, rand(1.4, 2.2), 'lowpass', 2600, 0.35 * big, { attack: 0.06, out });
      this.burst(at + rise + 0.2, fall, 'bandpass', 900, 0.12 * big, { q: 0.5, attack: 0.3, out });
    }
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
    const o = Math.random() < 0.3 ? this.tone(t + 0.1, base * 1.1, 0.04 * level, 0.6, { attack: 0.05, out }) : null;
    if (o) {
      const { ctx } = this;
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

  // Timbers giving way in the fire: a heavy boom, a rush of flame, a spray
  // of sparks.
  crash(at, level) {
    this.tone(at, 70, 0.6 * level, 1.6, { toHz: 30, glide: 0.9, attack: 0.008 });
    this.burst(at, 0.5, 'lowpass', 2400, 0.4 * level, { attack: 0.005 });
    this.burst(at + 0.05, 2.2, 'lowpass', 900, 0.35 * level, { attack: 0.15 });
    for (let k = 0; k < 24; k++) this.crackle(at + rand(0.05, 2), level * 1.5);
  }

  // A surge of flame: the blaze draws breath and flares up.
  flare(at, level) {
    const { ctx } = this;
    const rise = rand(0.4, 0.9);
    const fall = rand(1, 2);
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(160, at);
    f.frequency.exponentialRampToValueAtTime(rand(900, 1700), at + rise);
    f.frequency.exponentialRampToValueAtTime(220, at + rise + fall);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.5 * level, at + rise);
    g.gain.exponentialRampToValueAtTime(0.0001, at + rise + fall);
    src.connect(f);
    f.connect(g);
    g.connect(this.panner(rand(-0.5, 0.5)));
    src.start(at, Math.random() * 3);
    src.stop(at + rise + fall + 0.1);
  }

  crackle(at, level = 1) {
    this.burst(at, rand(0.015, 0.06), 'highpass', rand(1800, 5000), rand(0.1, 0.3) * level, { attack: 0.002, out: this.fx });
  }

  // A knot of sap bursting: a short, hard snap.
  pop(at, level) {
    this.burst(at, rand(0.01, 0.025), 'bandpass', rand(600, 1500), rand(0.5, 0.9) * level, { q: 2.5, attack: 0.001, out: this.panner(rand(-0.6, 0.6)) });
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
      for (const b of Object.values(this.trainBeds)) b.gain.gain.setTargetAtTime(0.06, now, 0.5);
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
    this.trainBus.gain.setTargetAtTime(Math.sqrt(tr.alpha) * (0.5 + 0.8 * prox), now, 0.15);
    this.trainBeds.boiler.gain.gain.setTargetAtTime(0.1 + 0.12 * prox, now, 0.3);
    this.trainBeds.leak.gain.gain.setTargetAtTime(0.012 + 0.01 * prox, now, 0.3);
    this.trainBeds.rails.gain.gain.setTargetAtTime(0.12 + 0.3 * prox, now, 0.3);
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
      if (st.beat % 2 === 1) this.rods(st.nextChuff + 0.5 / st.rate);
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

  // One exhaust beat of an old engine: a hard blast of steam up the
  // chimney with a thump of weight under it and a hiss trailing off.
  chuff(at, accent) {
    const out = this.trainBus;
    const k = accent ? 1.15 : 1;
    this.burst(at, 0.18, 'bandpass', 650, 0.75 * k, { q: 0.6, attack: 0.004, out });
    this.burst(at, 0.1, 'lowpass', 350, 0.55 * k, { attack: 0.003, out });
    this.tone(at, 78, 0.3 * k, 0.13, { toHz: 48, glide: 0.1, attack: 0.003, out });
    this.burst(at + 0.02, 0.32, 'highpass', 3200, 0.14 * k, { attack: 0.02, out });
  }

  // The coupling rods knocking at each turn of the wheels.
  rods(at) {
    const out = this.trainBus;
    const hz = rand(1300, 1700);
    [[1, 1], [2.3, 0.4]].forEach(([m, a]) => this.tone(at, hz * m, 0.03 * a, 0.05, { attack: 0.001, out }));
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

  // ---- The music
  //
  // The track is decoded into memory and played through Web Audio, so it
  // loops without a seam in any browser: the first pass plays from the very
  // beginning, and each pass after it skips the track's own fade-in and
  // fade-out, the end of one crossfading into the start of the next.

  // Loads the show's own track, early, so it is ready by the first click.
  prepareMusic() {
    this.setup();
    if (this.music || this.musicLoading || this.trackFailed) return;
    this.loadMusic(BACKGROUND_TRACK.url, BACKGROUND_TRACK.title).catch((err) => {
      console.warn(err);
      // Without the track the generated score plays instead.
      this.trackFailed = true;
      if (this.on) {
        this.applyMood();
        this.nextChord = this.ctx.currentTime + 0.1;
      }
    });
  }

  // Decodes a track (an address or a file) and makes it the music. A later
  // call wins over one still loading.
  async loadMusic(source, title) {
    const token = (this.musicToken = (this.musicToken ?? 0) + 1);
    this.musicLoading = true;
    try {
      const data =
        typeof source === 'string'
          ? await fetch(source).then((r) => {
              if (!r.ok) throw new Error(`Music request failed: ${r.status}`);
              return r.arrayBuffer();
            })
          : await source.arrayBuffer();
      const buffer = await this.ctx.decodeAudioData(data);
      if (token !== this.musicToken) return;
      this.stopMusic();
      this.music = { title, buffer, ...loopPoints(buffer) };
      this.musicLoading = false;
      this.applyMood();
      if (this.on) this.playMusic(this.ctx.currentTime + 0.05);
    } catch (err) {
      if (token === this.musicToken) {
        this.musicLoading = false;
        if (this.on) this.applyMood();
      }
      throw err;
    }
  }

  playMusic(when) {
    this.stopMusic();
    this.schedulePass(when, 0, false);
  }

  // One pass of the music from `offset` to the loop end, fading out into
  // the next pass (and fading in, after the first).
  schedulePass(when, offset, fadeIn) {
    const { ctx } = this;
    const { buffer, loopEnd, fade } = this.music;
    const len = loopEnd - offset;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const g = ctx.createGain();
    if (fadeIn) g.gain.setValueCurveAtTime(FADE_IN, when, fade);
    g.gain.setValueCurveAtTime(FADE_OUT, when + len - fade, fade);
    src.connect(g);
    g.connect(this.musicBus);
    src.start(when, offset, len);
    const voice = { src, g };
    src.onended = () => {
      g.disconnect();
      this.musicVoices = this.musicVoices.filter((v) => v !== voice);
    };
    this.musicVoices.push(voice);
    this.musicNext = when + len - fade;
  }

  stopMusic() {
    for (const { src, g } of this.musicVoices) {
      src.onended = null;
      try {
        src.stop();
      } catch {
        // Not started yet.
      }
      g.disconnect();
    }
    this.musicVoices = [];
  }

  // A track the visitor loads replaces the background music.
  async useMusic(file) {
    await this.start();
    await this.loadMusic(file, file.name);
    this.customMusic = true;
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
