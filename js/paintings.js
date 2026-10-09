// Catalogue of J. M. W. Turner paintings used by the show.
//
// Images are public-domain reproductions hosted on Wikimedia Commons and are
// loaded at runtime (upload.wikimedia.org sends CORS headers, so WebGL can
// read them). Each entry carries:
//   files   Commons file name + md5 hash path, used to build thumbnail URLs
//   recipe  the "animation score" for the painting (see DEFAULT_RECIPE)
//   study   a description used to paint a procedural stand-in when the real
//           image cannot be fetched (offline, blocked network)

const COMMONS = 'https://upload.wikimedia.org/wikipedia/commons';

// MediaWiki keeps a few punctuation characters literal in file URLs.
function encodeCommonsName(name) {
  return encodeURIComponent(name.replace(/ /g, '_'))
    .replace(/%2C/g, ',')
    .replace(/%3A/g, ':')
    .replace(/'/g, '%27');
}

export function commonsImageUrls(file) {
  const enc = encodeCommonsName(file.name);
  const urls = [];
  for (const w of [1920, 1280]) {
    if (!file.width || file.width > w) {
      urls.push(`${COMMONS}/thumb/${file.hash}/${enc}/${w}px-${enc}`);
    }
  }
  // Full-size originals are only worth fetching when they are not enormous.
  if (!file.width || file.width <= 6600) urls.push(`${COMMONS}/${file.hash}/${enc}`);
  return urls;
}

export function commonsThumbUrl(file, width = 330) {
  const enc = encodeCommonsName(file.name);
  return `${COMMONS}/thumb/${file.hash}/${enc}/${width}px-${enc}`;
}

export function commonsPageUrl(file) {
  return `https://commons.wikimedia.org/wiki/File:${encodeCommonsName(file.name)}`;
}

// Every knob the renderer understands. Coordinates are painting UVs
// (0..1, origin top-left). 'auto' values are filled in by image analysis.
export const DEFAULT_RECIPE = {
  flow: 0.5, // brushstroke advection amount
  flowSpeed: 0.12, // cycles per second of the flow map
  flowFollow: 0.85, // 0 = pure wind, 1 = follow the painted strokes
  wind: 0.3,
  windAngle: 0, // degrees, 0 = to the right, -90 = upwards
  vortex: 0,
  vortexX: 0.5,
  vortexY: 0.5,
  vortexRadius: 0.45,
  sunX: 'auto',
  sunY: 'auto',
  sunColor: '#ffe2a8',
  glow: 0.6,
  rays: 0.35,
  breathe: 0.5,
  grade: 0.15,
  horizon: 'auto',
  water: 0.6,
  sea: 0.4, // 0 a calm river, 1 an open sea of crossing waves
  foam: 0, // whitecaps on the crests
  mist: 0.3,
  smoke: 0,
  smokeX: 0.5,
  smokeY: 0.6,
  smokeColor: '#4a4038',
  rain: 0,
  rainAngle: -15,
  snow: 0,
  embers: 0,
  fire: 0,
  // Fire only above the horizon (not in reflections on the water).
  fireAbove: false,
  // A plume of painted smoke that streams the way it rises (angle on the
  // screen, -90 straight up); plumeSnap finds the dark mass near the hint.
  plume: 0,
  plumeX: 0.5,
  plumeY: 0.5,
  plumeR: 0.15,
  plumeAngle: -50,
  // Layers: sky drift, foliage sway, drifting light and brush texture
  // shimmer. parallax sets how far apart the layers sit in depth.
  skyDrift: 0.5,
  landSway: 0.3,
  lightDrift: 0.3,
  brush: 0.35,
  // false when nothing solid rises above the horizon (a storm sweeping down
  // to the ground stays one sky).
  landAbove: true,
  zoom: 1.15,
  focusX: 'sun',
  focusY: 'sun',
  parallax: 0.6,
  duration: 38,
  transition: 'brush',
  mood: 'warm',
  // Sound effects: a soundscape from audio.js, or 'mood' to match the score.
  sounds: 'mood',
  sfx: 0.8,
  // Cut-out elements that move (see elements.js). x/y may be 'sun'; snap
  // moves the hint onto the darkest or brightest mass within snapRadius.
  elements: [],
};

export const TRANSITIONS = [
  { id: 'brush', label: 'Brushstroke wipe' },
  { id: 'bleed', label: 'Watercolour bleed' },
  { id: 'light', label: 'Flood of light' },
  { id: 'flow', label: 'Paint flows away' },
  { id: 'dark', label: 'Through darkness' },
  { id: 'tiles', label: 'Mosaic tiles' },
];

export const CHAPTERS = {
  dawn: { numeral: 'I', title: 'Dawn' },
  sea: { numeral: 'II', title: 'The sea' },
  storm: { numeral: 'III', title: 'Tempest' },
  fire: { numeral: 'IV', title: 'Fire and speed' },
  light: { numeral: 'V', title: 'Light and colour' },
};

export const PAINTINGS = [
  {
    id: 'ulysses',
    title: 'Ulysses Deriding Polyphemus',
    year: '1829',
    collection: 'National Gallery, London',
    chapter: 'dawn',
    files: [
      { name: 'Turner - Ulysses deriding Polyphemus 1829.jpg', hash: 'd/de', width: 6493 },
    ],
    recipe: {
      flow: 0.4,
      wind: 0.35,
      windAngle: -10,
      glow: 0.85,
      rays: 0.95,
      sunColor: '#ffd88a',
      // The sun is just above the sea on the right; the bright clouds at the
      // top left would otherwise be taken for it.
      sunX: 0.78,
      sunY: 0.63,
      water: 0.9,
      sea: 0.85,
      foam: 0.3,
      mist: 0.3,
      grade: 0.25,
      zoom: 1.15,
      transition: 'light',
      mood: 'myth',
      sounds: 'sea',
      // The sun climbs out of the sea. The galleon, traced whole with its
      // oars, rocks about its waterline with white water at its bow and its
      // red flags flying. The ship on the right sets off from where it is
      // painted and slides slowly to the left, the way its prow points; its
      // stern, cut off by the edge of the canvas, fades into the haze.
      elements: [
        { type: 'rise', x: 'sun', y: 'sun', rx: 0.05, ry: 0.06, matte: 'light', dy: -0.05, light: true },
        {
          type: 'rock',
          x: 0.3802, y: 0.5583, rx: 0.1542, ry: 0.34,
          onStudy: false,
          soft: 2,
          bob: 0.004,
          rock: 0.012,
          dx: 0.015,
          anchor: 0,
          period: 7,
          pivot: 0.82,
          foam: 0.9,
          foamAt: 0.84,
          foamX: 0.55,
          foamW: 0.5,
          flags: 1.2,
          flagLine: 0.62,
          shape: [
            [0.155, -1.0], [0.223, -1.0], [0.304, -0.966], [0.466, -0.912], [0.551, -0.755], [0.48, -0.672],
            [0.358, -0.657], [0.345, -0.539], [0.459, -0.422], [0.561, -0.373], [0.581, -0.172], [0.946, -0.593],
            [1.0, -0.574], [0.635, -0.044], [0.723, 0.201], [0.757, 0.355], [0.689, 0.377], [0.608, 0.422],
            [0.649, 0.525], [0.649, 0.716], [0.601, 0.804], [0.422, 0.838], [-0.166, 0.848], [-0.459, 0.828],
            [-0.52, 0.877], [-0.865, 1.0], [-1.0, 0.985], [-0.993, 0.863], [-0.757, 0.745], [-0.696, 0.686],
            [-0.723, 0.441], [-0.73, -0.289], [-0.666, -0.333], [-0.615, -0.353], [-0.439, -0.061], [-0.412, -0.083],
            [-0.196, -0.078], [-0.155, 0.074], [-0.142, -0.417], [-0.047, -0.426], [-0.027, -0.49], [-0.014, -0.588],
            [0.068, -0.799], [0.142, -0.949],
          ],
        },
        {
          type: 'drift',
          x: 0.9156, y: 0.695, rx: 0.0865, ry: 0.2567,
          onStudy: false,
          soft: 2,
          dx: -0.06,
          dy: 0,
          anchor: 0,
          bob: 0.003,
          rock: 0.008,
          period: 9,
          pivot: 0.75,
          shape: [
            [-0.018, -1.0], [0.078, -1.0], [0.114, -0.808], [0.151, -0.63], [0.169, -0.565], [0.235, -0.614],
            [0.349, -0.753], [0.458, -0.805], [0.542, -0.847], [0.645, -0.795], [0.753, -0.711], [0.849, -0.604],
            [0.916, -0.468], [0.958, -0.321], [1.0, -0.256], [1.0, 1.0], [0.675, 0.994], [0.313, 0.974],
            [-0.048, 0.948], [-0.38, 0.906], [-0.663, 0.847], [-0.867, 0.773], [-0.97, 0.669], [-1.0, 0.506],
            [-1.0, 0.312], [-0.988, 0.149], [-0.904, 0.091], [-0.783, 0.039], [-0.669, -0.003], [-0.572, 0.006],
            [-0.476, 0.052], [-0.518, 0.104], [-0.639, 0.104], [-0.687, 0.136], [-0.651, 0.192], [-0.518, 0.208],
            [-0.41, 0.188], [-0.398, 0.052], [-0.434, -0.162], [-0.349, -0.24], [-0.217, -0.279], [-0.084, -0.344],
            [-0.054, -0.429], [-0.108, -0.679], [-0.036, -0.695], [0.012, -0.513], [0.072, -0.552], [0.054, -0.727],
            [0.018, -0.89],
          ],
        },
      ],
    },
    study: {
      sky: [[0, '#34425a'], [0.28, '#a9855a'], [0.45, '#f2c66e'], [0.6, '#e0a347'], [1, '#5b3a22']],
      sun: { x: 0.8, y: 0.38, r: 0.035, color: '#fff3c0', halo: 0.4 },
      horizon: 0.6,
      sea: [[0, '#e8b85e'], [1, '#3a2a1c']],
      wind: -8,
      masses: [
        { x: 0.12, y: 0.25, rx: 0.3, ry: 0.22, color: '#3d3226', alpha: 0.75 },
        { x: 0.05, y: 0.62, rx: 0.16, ry: 0.2, color: '#2b2118', alpha: 0.9 },
        { x: 0.86, y: 0.2, rx: 0.25, ry: 0.08, color: '#f6dc9a', alpha: 0.45 },
      ],
      motifs: [{ type: 'ship', x: 0.42, y: 0.63, s: 0.42, color: '#c98a3a', sails: '#b2452a' }],
    },
  },
  {
    id: 'norham',
    title: 'Norham Castle, Sunrise',
    year: 'c. 1845',
    collection: 'Tate Britain, London',
    chapter: 'dawn',
    files: [
      { name: 'Joseph Mallord William Turner - Norham Castle, Sunrise - WGA23182.jpg', hash: '3/33', width: 1536 },
    ],
    recipe: {
      flow: 0.35,
      flowSpeed: 0.07,
      wind: 0.25,
      glow: 0.75,
      rays: 0.35,
      breathe: 0.7,
      grade: 0.08,
      sunColor: '#fff4d6',
      water: 0.65,
      sea: 0,
      mist: 0.75,
      skyDrift: 0.25,
      landSway: 0.15,
      lightDrift: 0.35,
      zoom: 1.15,
      transition: 'bleed',
      mood: 'dawn',
      sounds: 'river',
      elements: [{ type: 'rise', x: 'sun', y: 'sun', rx: 0.07, ry: 0.09, matte: 'light', dy: -0.09, light: true }],
    },
    study: {
      sky: [[0, '#e3d7aa'], [0.35, '#f4e7b8'], [0.55, '#efe0a5'], [1, '#c4bb98']],
      sun: { x: 0.58, y: 0.43, r: 0.035, color: '#fffbe8', halo: 0.45 },
      horizon: 0.6,
      sea: [[0, '#eadb9f'], [1, '#a9a88f']],
      wind: 0,
      masses: [
        { x: 0.18, y: 0.55, rx: 0.25, ry: 0.1, color: '#8fa0a8', alpha: 0.55 },
        { x: 0.82, y: 0.58, rx: 0.2, ry: 0.06, color: '#c9bf8f', alpha: 0.5 },
      ],
      motifs: [{ type: 'castle', x: 0.42, y: 0.6, s: 0.2, color: '#5f7ea6' }],
    },
  },
  {
    id: 'temeraire',
    title: 'The Fighting Temeraire',
    year: '1839',
    collection: 'National Gallery, London',
    chapter: 'sea',
    files: [
      {
        name: 'Turner, J. M. W. - The Fighting Téméraire tugged to her last Berth to be broken.jpg',
        hash: '9/94',
        width: 6000,
      },
    ],
    recipe: {
      flow: 0.35,
      wind: 0.45,
      windAngle: 205,
      glow: 0.85,
      rays: 0.95,
      sunColor: '#ffcf7d',
      water: 0.85,
      sea: 0.25,
      mist: 0.3,
      smoke: 0.65,
      smokeX: 0.38,
      smokeY: 0.52,
      smokeColor: '#3a3029',
      skyDrift: 0.3,
      zoom: 1.15,
      transition: 'brush',
      mood: 'warm',
      sounds: 'harbour',
      // The tug chugs with white water at its bow, its smoke trailing off to
      // the upper left; the sun sinks toward the horizon in a fan of rays.
      elements: [
        {
          type: 'rock',
          x: 0.4,
          y: 0.6,
          rx: 0.06,
          ry: 0.08,
          snap: 'dark',
          snapRadius: 0.1,
          bob: 0.007,
          rock: 0.035,
          period: 3.2,
          foam: 0.9,
          smoke: true,
        },
        { type: 'rise', x: 'sun', y: 'sun', rx: 0.05, ry: 0.07, matte: 'light', dy: 0.05, light: true },
      ],
    },
    study: {
      sky: [[0, '#58778f'], [0.35, '#a9b7b5'], [0.5, '#e8c27c'], [0.64, '#f0a24a'], [1, '#6a3f22']],
      sun: { x: 0.78, y: 0.62, r: 0.03, color: '#fff1c4', halo: 0.4 },
      horizon: 0.66,
      sea: [[0, '#dca45c'], [1, '#2f2a26']],
      wind: 0,
      masses: [
        { x: 0.78, y: 0.45, rx: 0.28, ry: 0.12, color: '#e0682e', alpha: 0.55 },
        { x: 0.9, y: 0.3, rx: 0.2, ry: 0.1, color: '#b9442a', alpha: 0.45 },
        { x: 0.12, y: 0.16, rx: 0.02, ry: 0.02, color: '#f4f0dc', alpha: 0.9 },
      ],
      motifs: [
        { type: 'ship', x: 0.26, y: 0.67, s: 0.5, color: '#d9d4c6' },
        { type: 'tug', x: 0.4, y: 0.69, s: 0.12, color: '#2a211a' },
      ],
    },
  },
  {
    id: 'slave-ship',
    title: 'The Slave Ship',
    year: '1840',
    collection: 'Museum of Fine Arts, Boston',
    chapter: 'sea',
    files: [{ name: 'Slave-ship.jpg', hash: '2/26', width: 2152 }],
    recipe: {
      flow: 0.7,
      flowSpeed: 0.14,
      wind: 0.45,
      windAngle: -10,
      vortex: 0.35,
      vortexX: 'sun',
      vortexY: 'sun',
      vortexRadius: 0.5,
      glow: 0.9,
      rays: 0.5,
      sunColor: '#ffcf70',
      water: 1.3,
      sea: 1,
      foam: 0.8,
      mist: 0.2,
      snow: 0.2,
      fire: 0.15,
      grade: 0.3,
      zoom: 1.15,
      transition: 'flow',
      mood: 'tragic',
      sounds: 'tempest',
      // The ship pitches in the swell, its masts and rigging cut from the
      // sky by their darker paint, foam breaking at its bow. The pale gull
      // over the water to the right of the sun flies off to the left.
      elements: [
        {
          type: 'rock',
          x: 0.31, y: 0.491, rx: 0.12, ry: 0.1082,
          matte: 'dark',
          onStudy: false,
          bob: 0.01,
          rock: 0.05,
          period: 4.2,
          pivot: 0.85,
          foam: 1,
          foamAt: 1.28,
          foamX: -0.3,
          foamW: 0.9,
          shape: [
            [-1.0, 0.262], [-0.75, 0.138], [-0.417, -0.292], [-0.25, -0.477], [-0.146, -0.938], [-0.033, -0.938],
            [-0.083, -0.477], [0.083, -0.292], [0.333, -0.6], [0.5, -1.0], [0.604, -0.982], [0.479, -0.538],
            [0.708, -0.662], [0.75, -0.569], [0.5, -0.108], [0.417, 0.138], [0.75, 0.138], [1.0, 0.2],
            [0.958, 0.385], [0.75, 0.631], [0.667, 0.877], [0.333, 0.969], [-0.083, 1.0], [-0.5, 0.969],
            [-0.792, 0.877], [-0.958, 0.569],
          ],
        },
        {
          type: 'fly',
          x: 0.7, y: 0.7154, rx: 0.012, ry: 0.017,
          onStudy: false,
          soft: 2,
          dx: -0.28,
          dy: -0.045,
          bob: 0.004,
          period: 15,
          delay: 2,
          flap: 1.2,
          shape: [
            [-1.0, 0.137], [-0.583, -0.098], [-0.167, -0.333], [0.083, -0.882], [0.417, -1.0], [0.5, -0.647],
            [0.25, -0.176], [0.667, -0.098], [1.0, 0.137], [0.917, 0.529], [0.417, 0.765], [-0.083, 1.0],
            [-0.5, 0.765], [-0.917, 0.529],
          ],
        },
      ],
    },
    study: {
      sky: [[0, '#7a3a24'], [0.25, '#c8662e'], [0.42, '#f6d37a'], [0.55, '#e8a55a'], [1, '#3b2a20']],
      sun: { x: 0.52, y: 0.42, r: 0.05, color: '#fff2b8', halo: 0.5 },
      horizon: 0.5,
      sea: [[0, '#f0b860'], [0.4, '#9a5a3a'], [1, '#2a2622']],
      wind: -10,
      swirl: { x: 0.52, y: 0.5, strength: 0.6 },
      masses: [
        { x: 0.88, y: 0.4, rx: 0.2, ry: 0.3, color: '#3a2a24', alpha: 0.7 },
        { x: 0.6, y: 0.8, rx: 0.3, ry: 0.12, color: '#c0502a', alpha: 0.5 },
      ],
      motifs: [{ type: 'ship', x: 0.2, y: 0.47, s: 0.26, color: '#4a3226', tilt: -0.12 }],
    },
  },
  {
    id: 'steam-boat',
    title: "Snow Storm, Steam-Boat off a Harbour's Mouth",
    year: '1842',
    collection: 'Tate Britain, London',
    chapter: 'storm',
    files: [
      {
        name: "Joseph Mallord William Turner - Snow Storm - Steam-Boat off a Harbour's Mouth - WGA23178.jpg",
        hash: '3/30',
        width: 2510,
      },
    ],
    recipe: {
      flow: 0.85,
      flowSpeed: 0.18,
      flowFollow: 0.9,
      wind: 0.2,
      vortex: 1,
      vortexX: 0.5,
      vortexY: 0.48,
      vortexRadius: 0.55,
      snow: 0.75,
      mist: 0.35,
      glow: 0.3,
      rays: 0.15,
      sunColor: '#f3ead2',
      water: 0.85,
      sea: 1,
      foam: 0.7,
      zoom: 1.15,
      focusX: 0.5,
      focusY: 0.5,
      skyDrift: 0.7,
      landAbove: false,
      transition: 'tiles',
      mood: 'storm',
      sounds: 'blizzard',
      // The steam-boat rolls in the heart of the vortex.
      elements: [
        {
          type: 'rock',
          x: 0.48,
          y: 0.46,
          rx: 0.08,
          ry: 0.16,
          snap: 'dark',
          snapRadius: 0.08,
          bob: 0.013,
          rock: 0.075,
          period: 3.6,
          // The white water churns along the bottom of the dark hull, found
          // in the painting below the mast the cut is centred on.
          foam: 1,
          foamAt: 'hull',
          foamX: 0.6,
          foamW: 1.8,
        },
      ],
    },
    study: {
      sky: [[0, '#2b2a26'], [0.4, '#6f6a5c'], [0.55, '#cbc3ac'], [1, '#3a3a34']],
      sun: { x: 0.6, y: 0.35, r: 0.02, color: '#f2ead2', halo: 0.2 },
      horizon: 0.62,
      sea: [[0, '#8a8470'], [1, '#252421']],
      wind: 0,
      swirl: { x: 0.5, y: 0.5, strength: 1 },
      arcs: [
        { x: 0.5, y: 0.5, r: 0.32, from: 3.6, to: 6.2, width: 0.08, color: '#1f1e1a', alpha: 0.6 },
        { x: 0.5, y: 0.5, r: 0.2, from: 0.4, to: 2.6, width: 0.06, color: '#e6dfc8', alpha: 0.5 },
      ],
      motifs: [{ type: 'steamboat', x: 0.48, y: 0.54, s: 0.16, color: '#1d1c19' }],
    },
  },
  {
    id: 'hannibal',
    title: 'Snow Storm, Hannibal and his Army Crossing the Alps',
    year: '1812',
    collection: 'Tate Britain, London',
    chapter: 'storm',
    files: [
      {
        name: 'Joseph Mallord William Turner - Snow Storm, Hannibal and his Army Crossing the Alps - WGA23167.jpg',
        hash: '6/60',
      },
    ],
    recipe: {
      // The black storm arc wheels around the sun along its own curve: the
      // paint follows its strokes, steered by the vortex, with no sideways
      // drift to pull it out of shape.
      flow: 1,
      flowSpeed: 0.18,
      flowFollow: 1,
      vortex: 1.2,
      vortexX: 'sun',
      vortexY: 'sun',
      vortexRadius: 0.75,
      snow: 0.8,
      mist: 0.3,
      glow: 0.55,
      rays: 0.45,
      sunColor: '#ffd99a',
      water: 0,
      skyDrift: 0.15,
      landAbove: false,
      zoom: 1.15,
      transition: 'dark',
      mood: 'storm',
      sounds: 'alps',
      // The pale sun sinks as the storm closes over the army.
      elements: [{ type: 'rise', x: 'sun', y: 'sun', rx: 0.06, ry: 0.09, matte: 'light', dy: 0.055, light: true }],
    },
    study: {
      aspect: 1.63,
      sky: [[0, '#1e1c18'], [0.35, '#4a4232'], [0.5, '#c6a35a'], [0.7, '#5a4a32'], [1, '#2a241c']],
      sun: { x: 0.62, y: 0.4, r: 0.035, color: '#ffe9b0', halo: 0.35 },
      horizon: 0.78,
      sea: [[0, '#5a4a34'], [1, '#1e1a14']],
      wind: 10,
      swirl: { x: 0.6, y: 0.42, strength: 0.9 },
      arcs: [
        { x: 0.6, y: 0.45, r: 0.42, from: 2.6, to: 5.9, width: 0.16, color: '#16140f', alpha: 0.8 },
        { x: 0.6, y: 0.45, r: 0.22, from: 3.2, to: 5.2, width: 0.06, color: '#e7d6a6', alpha: 0.45 },
      ],
      motifs: [],
    },
  },
  {
    id: 'burning',
    title: 'The Burning of the Houses of Lords and Commons',
    year: '1834',
    collection: 'Cleveland Museum of Art',
    chapter: 'fire',
    files: [
      {
        name: 'Joseph Mallord William Turner - The Burning of the Houses of Lords and Commons, 16 October 1834 - 1942.647 - Cleveland Museum of Art.jpg',
        hash: 'e/e5',
        width: 15155,
      },
      { name: 'Turner-The Burning of the Houses of Lords and Commons.jpg', hash: '8/88' },
    ],
    recipe: {
      flow: 0.45,
      wind: 0.35,
      windAngle: -75,
      fire: 0.9,
      embers: 0.8,
      glow: 0.6,
      rays: 0.35,
      sunColor: '#ffb560',
      water: 0.8,
      sea: 0.15,
      mist: 0.2,
      grade: 0.35,
      zoom: 1.15,
      transition: 'light',
      mood: 'fire',
      sounds: 'fire',
      // Only the blaze above the bridge burns, not its reflection in the
      // river below.
      fireAbove: true,
    },
    study: {
      sky: [[0, '#141826'], [0.3, '#3a2c3a'], [0.5, '#c06a2a'], [0.62, '#f2b04a'], [1, '#1e1812']],
      sun: { x: 0.42, y: 0.52, r: 0.05, color: '#fff0a0', halo: 0.5 },
      horizon: 0.62,
      sea: [[0, '#e09a40'], [0.5, '#6a3a1c'], [1, '#141210']],
      wind: -80,
      masses: [
        { x: 0.38, y: 0.3, rx: 0.25, ry: 0.18, color: '#7a3a24', alpha: 0.55 },
        { x: 0.55, y: 0.2, rx: 0.3, ry: 0.12, color: '#2a1e22', alpha: 0.6 },
      ],
      motifs: [
        { type: 'fire', x: 0.42, y: 0.62, s: 0.32 },
        { type: 'bridge', x: 0.58, y: 0.6, x1: 1.02, y1: 0.7, s: 0.05, color: '#1f1712' },
      ],
    },
  },
  {
    id: 'rain-steam-speed',
    title: 'Rain, Steam and Speed, The Great Western Railway',
    year: '1844',
    collection: 'National Gallery, London',
    chapter: 'fire',
    files: [{ name: 'Rain Steam and Speed the Great Western Railway.jpg', hash: '3/35', width: 3567 }],
    recipe: {
      flow: 0.55,
      flowSpeed: 0.16,
      wind: 0.45,
      windAngle: 200,
      rain: 0.7,
      rainAngle: -18,
      skyDrift: 0.6,
      mist: 0.55,
      glow: 0.4,
      rays: 0.25,
      sunColor: '#fff0c8',
      water: 0.5,
      sea: 0.1,
      smoke: 0.35,
      smokeX: 0.669,
      smokeY: 0.545,
      smokeColor: '#e8e0cc',
      zoom: 1.15,
      focusX: 0.6,
      focusY: 0.6,
      transition: 'brush',
      mood: 'speed',
      sounds: 'train',
      // The locomotive, its chimney and its lamps, lying along the viaduct.
      // It sets off from where Turner painted it and runs down the line,
      // diagonally toward the viewer, coming from the point where the
      // viaduct vanishes into the rain behind it. The engine is painted in
      // the same dark tones as the viaduct under it, so a colour cut would
      // leave its front behind; it is rotoscoped instead, with an outline
      // traced around the boiler, chimney, lamps and buffer beam. The dark
      // haze trailing behind the engine stays where it is painted.
      elements: [
        {
          type: 'approach',
          x: 0.626,
          y: 0.598,
          rx: 0.116,
          ry: 0.089,
          angle: 24,
          shape: [
            [-0.753, 0.115], [-0.628, 0.099], [-0.464, -0.116], [-0.214, -0.365], [0.014, -0.575], [0.154, -0.662],
            [0.135, -0.789], [0.25, -0.878], [0.302, -0.722], [0.4, -0.657], [0.5, -0.483], [0.639, -0.285],
            [0.772, -0.082], [0.855, 0.268], [0.823, 0.512], [0.602, 0.749], [0.353, 0.877], [0.156, 0.889],
            [0.022, 0.61], [-0.099, 0.65], [-0.215, 0.61], [-0.388, 0.468], [-0.582, 0.268],
          ],
          vx: 0.505,
          vy: 0.526,
          zNear: 0.25,
          period: 13,
          delay: 3,
          smoke: true,
        },
      ],
    },
    study: {
      sky: [[0, '#5d6d78'], [0.3, '#c9c2a2'], [0.45, '#efe2b4'], [0.6, '#c4a46a'], [1, '#4a3a26']],
      sun: { x: 0.45, y: 0.35, r: 0.06, color: '#fffbe6', halo: 0.5 },
      horizon: 0.6,
      sea: [[0, '#c9b88a'], [1, '#4a4030']],
      wind: 195,
      masses: [{ x: 0.15, y: 0.3, rx: 0.25, ry: 0.2, color: '#6f7a78', alpha: 0.45 }],
      motifs: [
        { type: 'bridge', x: 0.4, y: 0.51, x1: 1.02, y1: 0.88, s: 0.06, color: '#3a2a1e' },
        { type: 'train', x: 0.626, y: 0.598, s: 0.07, angle: 24, color: '#1a1410' },
      ],
    },
  },
  {
    id: 'light-and-colour',
    title: "Light and Colour (Goethe's Theory), The Morning after the Deluge",
    year: '1843',
    collection: 'Tate Britain, London',
    chapter: 'light',
    files: [
      { name: 'Joseph Mallord William Turner - The Morning after the Deluge - WGA23180.jpg', hash: '3/39' },
    ],
    recipe: {
      flow: 0.6,
      flowSpeed: 0.12,
      vortex: 0.8,
      vortexX: 'sun',
      vortexY: 'sun',
      vortexRadius: 0.5,
      glow: 1,
      rays: 0.7,
      sunColor: '#fff0b5',
      skyDrift: 0.15,
      lightDrift: 0.2,
      landAbove: false,
      mist: 0.25,
      water: 0,
      breathe: 0.9,
      grade: 0.2,
      zoom: 1.15,
      transition: 'light',
      mood: 'radiant',
      sounds: 'light',
      // The dark smoke in the lower half streams up and to the right as it
      // rises; it is found as the darkest mass near the hint.
      plume: 1.5,
      plumeX: 0.44,
      plumeY: 0.72,
      plumeR: 0.17,
      plumeAngle: -50,
      plumeSnap: 0.12,
      // The heart of the vortex breathes.
      elements: [{ type: 'pulse', x: 'sun', y: 'sun', rx: 0.12, ry: 0.12, matte: 'light', pulse: 0.09, period: 6 }],
    },
    study: {
      aspect: 1,
      radial: [[0, '#fff6c8'], [0.18, '#f6d36a'], [0.42, '#e08a3a'], [0.62, '#9a3a24'], [1, '#2a1a14']],
      sun: { x: 0.5, y: 0.45, r: 0.06, color: '#fffbe0', halo: 0.6 },
      horizon: 0.8,
      wind: 0,
      swirl: { x: 0.5, y: 0.47, strength: 1 },
      arcs: [{ x: 0.5, y: 0.47, r: 0.3, from: 0, to: 6.28, width: 0.05, color: '#f8e8a0', alpha: 0.35 }],
      motifs: [],
    },
  },
];
