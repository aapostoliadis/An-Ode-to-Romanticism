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
  water: 0.4,
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
  // Layers: sky drift, foliage sway, drifting light and brush texture
  // shimmer. parallax sets how far apart the layers sit in depth.
  skyDrift: 0.5,
  landSway: 0.3,
  lightDrift: 0.3,
  brush: 0.35,
  // false when nothing solid rises above the horizon (a storm sweeping down
  // to the ground stays one sky).
  landAbove: true,
  zoom: 1.35,
  focusX: 'sun',
  focusY: 'sun',
  parallax: 0.6,
  duration: 38,
  transition: 'brush',
  mood: 'warm',
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
      rays: 0.6,
      sunColor: '#ffd88a',
      water: 0.55,
      mist: 0.3,
      grade: 0.25,
      zoom: 1.4,
      transition: 'light',
      mood: 'myth',
      // The sun climbs out of the sea; the galleon sways from its waterline.
      elements: [
        { type: 'rise', x: 'sun', y: 'sun', rx: 0.07, ry: 0.09, matte: 'light', dy: -0.05, light: true },
        { type: 'rock', x: 0.41, y: 0.48, rx: 0.15, ry: 0.22, bob: 0.002, rock: 0.012, period: 9, pivot: 0.75 },
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
      water: 0.45,
      mist: 0.75,
      skyDrift: 0.25,
      landSway: 0.15,
      lightDrift: 0.35,
      zoom: 1.3,
      transition: 'bleed',
      mood: 'dawn',
      elements: [{ type: 'rise', x: 'sun', y: 'sun', rx: 0.07, ry: 0.09, matte: 'light', dy: -0.06, light: true }],
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
      wind: 0.25,
      glow: 0.85,
      rays: 0.55,
      sunColor: '#ffcf7d',
      water: 0.6,
      mist: 0.3,
      smoke: 0.35,
      smokeX: 0.38,
      smokeY: 0.52,
      smokeColor: '#3a3029',
      skyDrift: 0.3,
      zoom: 1.35,
      transition: 'brush',
      mood: 'warm',
      // The tug chugs with its smoke; the sun sinks toward the horizon.
      elements: [
        {
          type: 'rock',
          x: 0.4,
          y: 0.6,
          rx: 0.06,
          ry: 0.08,
          snap: 'dark',
          snapRadius: 0.1,
          bob: 0.003,
          rock: 0.015,
          period: 3.5,
          smoke: true,
        },
        { type: 'rise', x: 'sun', y: 'sun', rx: 0.05, ry: 0.07, matte: 'light', dy: 0.03, light: true },
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
      water: 0.9,
      mist: 0.2,
      snow: 0.2,
      fire: 0.15,
      grade: 0.3,
      zoom: 1.3,
      transition: 'flow',
      mood: 'tragic',
      // The ship pitches in the swell.
      elements: [
        { type: 'rock', x: 0.22, y: 0.4, rx: 0.11, ry: 0.13, snap: 'dark', snapRadius: 0.1, bob: 0.005, rock: 0.03, period: 5 },
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
      water: 0.3,
      zoom: 1.45,
      focusX: 0.5,
      focusY: 0.5,
      skyDrift: 0.7,
      landAbove: false,
      transition: 'tiles',
      mood: 'storm',
      // The steam-boat rolls in the heart of the vortex.
      elements: [
        { type: 'rock', x: 0.48, y: 0.46, rx: 0.08, ry: 0.16, snap: 'dark', snapRadius: 0.08, bob: 0.006, rock: 0.035, period: 4.5 },
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
      flow: 0.7,
      flowSpeed: 0.15,
      vortex: 0.8,
      vortexX: 'sun',
      vortexY: 'sun',
      vortexRadius: 0.6,
      snow: 0.8,
      mist: 0.3,
      glow: 0.55,
      rays: 0.45,
      sunColor: '#ffd99a',
      water: 0,
      skyDrift: 0.7,
      landAbove: false,
      zoom: 1.3,
      transition: 'dark',
      mood: 'storm',
      // The pale sun sinks as the storm closes over the army.
      elements: [{ type: 'rise', x: 'sun', y: 'sun', rx: 0.06, ry: 0.09, matte: 'light', dy: 0.035, light: true }],
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
      water: 0.6,
      mist: 0.2,
      grade: 0.35,
      zoom: 1.4,
      transition: 'light',
      mood: 'fire',
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
      water: 0.35,
      smoke: 0.35,
      smokeX: 0.7,
      smokeY: 0.6,
      smokeColor: '#e8e0cc',
      zoom: 1.55,
      focusX: 0.6,
      focusY: 0.6,
      transition: 'brush',
      mood: 'speed',
      // The locomotive drives along the viaduct toward the viewer.
      elements: [
        {
          type: 'approach',
          x: 0.7,
          y: 0.63,
          rx: 0.085,
          ry: 0.1,
          snap: 'dark',
          snapRadius: 0.12,
          vx: 'auto',
          vy: 'auto',
          zFar: 3.2,
          zNear: 0.5,
          period: 12,
          phase: 0.35,
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
        { type: 'bridge', x: 0.25, y: 0.6, x1: 1.02, y1: 0.84, s: 0.06, color: '#3a2a1e' },
        { type: 'train', x: 0.7, y: 0.69, s: 0.07, color: '#1a1410' },
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
      zoom: 1.5,
      transition: 'light',
      mood: 'radiant',
      // The heart of the vortex breathes.
      elements: [{ type: 'pulse', x: 'sun', y: 'sun', rx: 0.12, ry: 0.12, matte: 'light', pulse: 0.05, period: 6 }],
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
