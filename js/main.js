import { analysePainting, autoRecipe, resolveRecipe } from './analysis.js';
import { Ambient, BACKGROUND_TRACK } from './audio.js';
import { segmentLayers } from './layers.js';
import {
  ELEMENT_TYPES,
  MAX_ELEMENTS,
  cutElements,
  elementState,
  elementsKey,
  estimateVanishing,
  makeElement,
  resolveElements,
  retypeElement,
  sanitizeElements,
} from './elements.js';
import { fitSource, loadFirst, loadImage, paintStudy } from './loader.js';
import {
  CHAPTERS,
  DEFAULT_RECIPE,
  PAINTINGS,
  TRANSITIONS,
  commonsImageUrls,
  commonsThumbUrl,
} from './paintings.js';
import { Recorder } from './recorder.js';
import { Renderer } from './renderer.js';
import { Handles, buildControlsHelp, buildEditor, buildElementsEditor, buildGallery } from './ui.js';

const $ = (id) => document.getElementById(id);
const canvas = $('stage');
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => t * t * (3 - 2 * t);
const params = new URLSearchParams(location.search);
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const TRANSITION_SECONDS = { brush: 3.4, bleed: 3.8, light: 3.6, flow: 3.4, dark: 3, tiles: 3.6 };
const REVEAL_SECONDS = 8;
// Bumped when the shape of a score changes, so old saved edits do not hide
// new defaults (v3: the train is rotoscoped and sets off from where it is
// painted).
const STORAGE_PREFIX = 'turner-lumieres:recipe:v3:';

let renderer;
try {
  renderer = new Renderer(canvas);
} catch (err) {
  const fatal = document.createElement('div');
  fatal.className = 'fatal';
  fatal.textContent = `${err.message} Try a recent version of Chrome, Edge, Firefox or Safari.`;
  document.body.replaceChildren(fatal);
  throw err;
}

const ambient = new Ambient();
const recorder = new Recorder(canvas);

const state = {
  entries: PAINTINGS.map((p) => ({ ...p })),
  prepared: new Map(),
  index: 0,
  current: null,
  playing: params.get('autoplay') !== '0' && !reducedMotion,
  paintTime: 0,
  // Clock of the moving elements: restarts with each painting and never
  // jumps, so a train always sets off from where it is painted.
  elemTime: 0,
  time: 0,
  reveal: 1,
  trans: 1,
  transType: 'brush',
  transitionOverride: 'auto',
  editing: false,
  quality: 1,
  view: [0, 0, 1, 1],
  mouse: [-10, -10],
  mouseVel: [0, 0],
  mouseSmooth: [0.5, 0.5],
  pointerDown: false,
  textAlpha: 0,
  textRect: [0, 0, 0, 0],
  chapterShown: false,
  busy: false,
  pending: null,
  advancing: false,
  snapshot: false,
  showLayers: false,
};

// ---------------------------------------------------------------------------
// Status and loading feedback

let statusTimer = 0;
function status(text, ms = 4500) {
  const el = $('status');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => el.classList.remove('show'), ms);
}

let loadingTimer = 0;
function showLoading(text) {
  clearTimeout(loadingTimer);
  loadingTimer = setTimeout(() => {
    $('loadingText').textContent = text;
    $('loading').hidden = false;
  }, 250);
}
function hideLoading() {
  clearTimeout(loadingTimer);
  $('loading').hidden = true;
}

// ---------------------------------------------------------------------------
// Preparing paintings: fetch (or paint a study), then analyse.

function prepare(entry) {
  if (state.prepared.has(entry.id)) return state.prepared.get(entry.id);
  const job = (async () => {
    let source = entry.source;
    let isStudy = false;
    if (!source) {
      try {
        const img = await loadFirst(entry.files.flatMap(commonsImageUrls));
        source = fitSource(img, Math.min(3840, renderer.maxTexture));
      } catch (err) {
        if (!entry.study) throw err;
        source = paintStudy(entry.study, 1600, entry.id);
        isStudy = true;
      }
    }
    const prepared = { entry, source, analysis: analysePainting(source), isStudy };
    // Separate the layers and cut the moving elements now, ahead of the
    // transition, so the switch itself does not stall.
    const recipe = buildRecipe(prepared);
    layersFor(prepared.analysis, recipe);
    cutFor(source, recipe.elements);
    return prepared;
  })();
  state.prepared.set(entry.id, job);
  job.catch(() => state.prepared.delete(entry.id));
  return job;
}

function storageKey(prepared) {
  return `${STORAGE_PREFIX}${prepared.entry.id}:${prepared.isStudy ? 'study' : 'image'}`;
}

function baseRecipe(prepared) {
  const authored = prepared.entry.recipe ?? autoRecipe(prepared.analysis);
  const r = resolveRecipe({ ...DEFAULT_RECIPE, ...authored }, prepared.analysis);
  r.elements = resolveElements(r, prepared.analysis);
  return r;
}

function buildRecipe(prepared) {
  const base = baseRecipe(prepared);
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey(prepared)) ?? 'null');
    if (saved && typeof saved === 'object') return completeElements({ ...base, ...pickKnown(saved) }, prepared.analysis);
  } catch {
    // Storage can be unavailable (private mode); the defaults still work.
  }
  return base;
}

// Scores loaded from storage or a file may leave an approach without its
// vanishing point; estimate it from the painting.
function completeElements(recipe, analysis) {
  for (const el of recipe.elements) {
    if (el.type === 'approach' && (typeof el.vx !== 'number' || typeof el.vy !== 'number')) {
      Object.assign(el, estimateVanishing(analysis, el));
    }
  }
  return recipe;
}

// Only accept known keys with the right type, so a stale or hand-edited
// score cannot break the renderer.
function pickKnown(obj) {
  const out = {};
  for (const [key, def] of Object.entries(DEFAULT_RECIPE)) {
    const v = obj?.[key];
    if (Array.isArray(def)) {
      const list = sanitizeElements(v);
      if (list) out[key] = list;
      continue;
    }
    if (typeof def === 'boolean') {
      if (typeof v === 'boolean') out[key] = v;
      continue;
    }
    const numeric = typeof def === 'number' || def === 'auto' || def === 'sun';
    if (numeric ? typeof v === 'number' && Number.isFinite(v) : typeof v === 'string') out[key] = v;
  }
  return out;
}

let saveTimer = 0;
function saveRecipe() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(storageKey(state.current), JSON.stringify(state.current.recipe));
    } catch {
      // Ignore quota or privacy errors.
    }
  }, 300);
}

// ---------------------------------------------------------------------------
// Sequencing

async function goTo(i) {
  const n = state.entries.length;
  state.pending = ((i % n) + n) % n;
  if (state.busy) return;
  state.busy = true;
  try {
    while (state.pending !== null) {
      const target = state.pending;
      state.pending = null;
      const entry = state.entries[target];
      showLoading(`Preparing ${entry.title}`);
      let prepared;
      try {
        prepared = await prepare(entry);
      } catch (err) {
        console.warn(err);
        status(`Could not load ${entry.title}.`);
        continue;
      }
      if (state.pending !== null) continue;
      hideLoading();
      applyPainting(target, prepared);
    }
  } finally {
    hideLoading();
    state.busy = false;
    state.advancing = false;
  }
  const next = state.entries[(state.index + 1) % state.entries.length];
  prepare(next).catch(() => {});
}

function applyPainting(index, prepared) {
  const first = !state.current;
  const prevChapter = state.current?.entry.chapter;
  if (!first) renderer.capturePrev();
  const recipe = buildRecipe(prepared);
  const cut = cutFor(prepared.source, recipe.elements);
  renderer.setPainting(cut ? cut.plate : prepared.source, prepared.analysis);
  renderer.setLayers(cut ? cut.pieces : []);
  renderer.setLayerMaps(layersFor(prepared.analysis, recipe));
  state.current = { ...prepared, recipe };
  state.index = index;
  state.paintTime = 0;
  state.elemTime = 0;
  if (first) {
    state.reveal = 0;
    state.trans = 1;
  } else {
    state.reveal = 1;
    state.trans = 0;
    state.transType = state.transitionOverride === 'auto' ? recipe.transition : state.transitionOverride;
  }
  state.view = targetView(0);
  state.chapterShown = prevChapter !== prepared.entry.chapter;
  drawTitle();
  ambient.setMood(recipe.mood);
  gallery.setCurrent(prepared.entry.id);
  if (state.editing) refreshEditor();
  if (prepared.isStudy) {
    status('Wikimedia Commons could not be reached, so a procedural study stands in for this painting.', 6000);
  }
}

// Cutting elements out takes a few tens of milliseconds, so results are
// kept per painting and per element layout.
const cutCache = new WeakMap();
function cutFor(source, elements) {
  if (!elements.length) return null;
  const key = elementsKey(elements);
  const hit = cutCache.get(source);
  if (hit?.key === key) return hit.cut;
  const cut = cutElements(source, elements);
  cutCache.set(source, { key, cut });
  return cut;
}

// Layer separation depends on the horizon and on whether there is water.
const layerCache = new WeakMap();
function layersFor(analysis, recipe) {
  const key = `${recipe.horizon.toFixed(3)}:${recipe.water > 0.05}:${recipe.landAbove}`;
  const hit = layerCache.get(analysis);
  if (hit?.key === key) return hit.seg;
  const seg = segmentLayers(analysis, { horizon: recipe.horizon, water: recipe.water, landAbove: recipe.landAbove });
  layerCache.set(analysis, { key, seg });
  return seg;
}

let relayerTimer = 0;
function scheduleRelayer() {
  clearTimeout(relayerTimer);
  relayerTimer = setTimeout(() => {
    renderer.setLayerMaps(layersFor(state.current.analysis, state.current.recipe));
  }, 150);
}

let recutTimer = 0;
function scheduleRecut() {
  clearTimeout(recutTimer);
  recutTimer = setTimeout(() => {
    const { source, recipe } = state.current;
    const cut = cutFor(source, recipe.elements);
    renderer.setPlate(cut ? cut.plate : source);
    renderer.setLayers(cut ? cut.pieces : []);
  }, 120);
}

function next() {
  goTo(state.index + 1);
}
function prev() {
  goTo(state.index - 1);
}

// ---------------------------------------------------------------------------
// Camera: a slow push toward the focal point, then an easing pull back.

// 0..1 through the painting's time on the wall; when the show is paused it
// swings back and forth so camera and elements never jump.
function showProgress(tau, dur) {
  const u = state.playing ? tau / dur : 1 - Math.abs(1 - ((tau / dur) % 2));
  return clamp(u, 0, 1);
}

// Zoom at which the whole painting is in view (below 1 when the screen and
// the painting have different shapes; 1 fills the screen).
function fitZoom() {
  const sa = renderer.sceneAspect;
  const pa = state.current.analysis.aspect;
  return Math.min(1, sa > pa ? pa / sa : sa / pa);
}

// Every painting opens fully zoomed out, the whole canvas in view, and holds
// there through its title; then the camera eases in through filling the
// screen to the painting's push, and draws back.
const OPEN_HOLD = 0.1;
function cameraAt(r, tau) {
  const u = showProgress(tau, r.duration);
  const push = Math.max(1, reducedMotion ? 1 + (r.zoom - 1) * 0.3 : r.zoom);
  if (u < 0.72) {
    const k = ease(clamp((u - OPEN_HOLD) / (0.72 - OPEN_HOLD), 0, 1));
    return [lerp(fitZoom(), push, k), lerp(0.5, r.focusX, k), lerp(0.5, r.focusY, k)];
  }
  const k = ease((u - 0.72) / 0.28);
  const endZoom = 1 + (push - 1) * 0.55;
  return [lerp(push, endZoom, k), lerp(r.focusX, lerp(0.5, r.focusX, 0.6), k), lerp(r.focusY, lerp(0.5, r.focusY, 0.6), k)];
}

function targetView(tau) {
  const pa = state.current.analysis.aspect;
  if (state.editing) return editorView(pa);
  return coverView(...cameraAt(state.current.recipe, tau));
}

function coverView(zoom, cx, cy) {
  const sa = renderer.sceneAspect;
  const pa = state.current.analysis.aspect;
  let w = 1;
  let h = 1;
  if (sa > pa) h = pa / sa;
  else w = sa / pa;
  w /= zoom;
  h /= zoom;
  // Wider than the painting: keep it centred.
  const x = w >= 1 ? (1 - w) / 2 : clamp(cx - w / 2, 0, 1 - w);
  const y = h >= 1 ? (1 - h) / 2 : clamp(cy - h / 2, 0, 1 - h);
  return [x, y, w, h];
}

// In edit mode the whole painting is fitted into the space left free by
// the editor panel, so every marker stays reachable.
function editorView(pa) {
  const W = window.innerWidth;
  const H = window.innerHeight;
  const panel = editorEl.getBoundingClientRect();
  let x1 = W;
  let y1 = H - 110;
  if (panel.width && panel.left > W * 0.5) x1 = panel.left - 12;
  else if (panel.height) y1 = Math.min(y1, panel.top - 12);
  const x0 = 12;
  const y0 = 64;
  const rw = Math.max(40, x1 - x0);
  const rh = Math.max(40, y1 - y0);
  let pw = rw;
  let ph = rw / pa;
  if (ph > rh) {
    ph = rh;
    pw = rh * pa;
  }
  const px = x0 + (rw - pw) / 2;
  const py = y0 + (rh - ph) / 2;
  return [-px / pw, -py / ph, W / pw, H / ph];
}

// ---------------------------------------------------------------------------
// Title card, drawn into a texture so recordings include it.

const titleCanvas = document.createElement('canvas');
titleCanvas.width = 1600;
titleCanvas.height = 400;

function drawTitle() {
  const ctx = titleCanvas.getContext('2d');
  const { entry } = state.current;
  ctx.clearRect(0, 0, titleCanvas.width, titleCanvas.height);
  ctx.shadowColor = 'rgba(0,0,0,0.7)';
  ctx.shadowBlur = 28;
  ctx.textBaseline = 'alphabetic';
  const chapter = CHAPTERS[entry.chapter];
  let y = 128;
  if (chapter && state.chapterShown) {
    ctx.font = '500 32px Inter, system-ui, sans-serif';
    if ('letterSpacing' in ctx) ctx.letterSpacing = '7px';
    ctx.fillStyle = 'rgba(242,183,91,0.95)';
    ctx.fillText(`${chapter.numeral} · ${chapter.title.toUpperCase()}`, 8, y);
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  }
  y += 108;
  let size = 100;
  do {
    ctx.font = `italic 500 ${size}px "Cormorant Garamond", Georgia, serif`;
    size -= 4;
  } while (ctx.measureText(entry.title).width > titleCanvas.width - 30 && size > 40);
  ctx.fillStyle = 'rgba(248,240,224,0.98)';
  ctx.fillText(entry.title, 6, y);
  ctx.font = '400 32px Inter, system-ui, sans-serif';
  ctx.fillStyle = 'rgba(243,234,215,0.78)';
  const artist = entry.kind === 'user' ? 'Your painting' : 'J. M. W. Turner';
  const meta = [artist, entry.year, entry.collection].filter(Boolean).join(', ');
  const suffix = state.current.isStudy ? '   (procedural study, image offline)' : '';
  ctx.fillText(meta + suffix, 8, y + 66);
  renderer.setText(titleCanvas);
}

function titleAlpha(tau) {
  if (state.editing) return 0;
  return clamp((tau - 1.2) / 1.4, 0, 1) * clamp((12 - tau) / 2, 0, 1);
}

// ---------------------------------------------------------------------------
// Sizing and adaptive quality

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  renderer.resize(window.innerWidth, window.innerHeight, dpr, state.quality);
  const W = canvas.width;
  const H = canvas.height;
  const hPx = Math.min(H * 0.2, (W * 0.92) / 4);
  state.textRect = [0.035, (window.innerWidth < 860 ? 120 : 132) * dpr / H, (hPx * 4) / W, hPx / H];
  if (state.current) state.view = targetView(state.paintTime);
}
window.addEventListener('resize', resize);

// Lower the internal resolution when the GPU cannot keep up. The first
// seconds are ignored (shader compilation, image decoding) and two slow
// windows in a row are needed before stepping down.
const perf = { acc: 0, frames: 0, since: -4, slow: 0 };
function adaptQuality(dt) {
  perf.since += dt;
  if (perf.since < 0) return;
  perf.acc += dt;
  perf.frames++;
  if (perf.since < 2.5) return;
  const avg = perf.acc / perf.frames;
  perf.acc = 0;
  perf.frames = 0;
  perf.since = 0;
  perf.slow = avg > 1 / 38 ? perf.slow + 1 : 0;
  const steps = [1, 0.8, 0.65, 0.5];
  const i = steps.indexOf(state.quality);
  if (perf.slow >= 2 && i < steps.length - 1) {
    perf.slow = 0;
    state.quality = steps[i + 1];
    resize();
  }
}

// ---------------------------------------------------------------------------
// Frame loop

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  state.time += dt;
  if (state.current) {
    tick(dt);
    const r = state.current.recipe;
    const motion = reducedMotion ? 0.4 : 1;
    const viewTarget = targetView(state.paintTime);
    const k = state.editing || state.trans < 1 ? 1 - Math.exp(-dt * 5) : 1 - Math.exp(-dt * 2.5);
    state.view = state.view.map((v, i) => lerp(v, viewTarget[i], k));
    state.mouseSmooth = state.mouseSmooth.map((v, i) => {
      const m = state.mouse[i] < -1 ? 0.5 : state.mouse[i];
      return lerp(v, m, 1 - Math.exp(-dt * 2));
    });
    const views = layerViews(r, motion);
    const { recipe, elements, smokeScale } = animateElements(r, motion);
    ambient.update(soundScene(recipe, elements, views.land));
    renderer.render({
      recipe,
      elements,
      viewSky: views.sky,
      viewWater: views.water,
      showLayers: state.showLayers,
      smokeScale,
      time: state.time,
      view: views.land,
      mouse: state.mouse,
      mouseVel: state.mouseVel,
      audio: ambient.sample(),
      reveal: clamp(state.reveal, 0, 1),
      transition: clamp(state.trans, 0, 1),
      transitionType: state.transType,
      textRect: state.textRect,
      textAlpha: titleAlpha(state.paintTime),
    });
    state.mouseVel = [0, 0];
    if (state.snapshot) {
      state.snapshot = false;
      recorder.snapshot(fileName());
    }
    if (state.editing) updateHandles();
    gallery.setProgress(state.current.entry.id, state.paintTime / r.duration);
    adaptQuality(dt);
  }
  requestAnimationFrame(frame);
}

// Each plane follows the camera by its own amount: the sky, furthest away,
// moves least as the camera pushes in and pans; the water a little more;
// the land and figures fully. The pointer adds a small sideways look.
function layerViews(r, motion) {
  const v = state.view;
  if (state.editing) return { sky: v, water: v, land: v };
  const depth = clamp(r.parallax * motion, 0, 1.5);
  const base = coverView(1, 0.5, 0.5);
  // Zoomed out further than filling the screen, the planes stay together,
  // so the whole painting is seen as painted; they separate as it pushes in.
  if (v[2] >= base[2] - 1e-6 && v[3] >= base[3] - 1e-6) return { sky: v, water: v, land: v };
  const look = [(state.mouseSmooth[0] - 0.5) * 0.03 * depth, (state.mouseSmooth[1] - 0.5) * 0.02 * depth];
  // The look-around stays on the canvas: with no push there is no margin,
  // so the planes only shift once the camera has pushed in.
  const plane = (follow, lookGain) => {
    const out = v.map((x, i) => base[i] + (x - base[i]) * follow);
    out[0] = clamp(out[0] + look[0] * lookGain, 0, Math.max(0, 1 - out[2]));
    out[1] = clamp(out[1] + look[1] * lookGain, 0, Math.max(0, 1 - out[3]));
    return out;
  };
  return {
    sky: plane(Math.max(0.4, 1 - 0.35 * depth), 0.2),
    water: plane(Math.max(0.6, 1 - 0.18 * depth), 0.55),
    land: plane(1, 1),
  };
}

// Per-frame element transforms. Smoke attached to an element rides with it,
// and an element marked as the light carries the glow and rays along.
function animateElements(r, motion) {
  const progress = showProgress(state.paintTime, r.duration);
  const live = { ...r, flow: r.flow * motion };
  let smokeScale = 1;
  let smokeTaken = false;
  const elements = r.elements.map((el) => {
    const st = elementState(el, state.elemTime, progress, motion);
    const cx = el.x + st.offset[0];
    const cy = el.y + st.offset[1];
    if (el.smoke && !smokeTaken) {
      smokeTaken = true;
      live.smokeX = cx + (r.smokeX - el.x) * st.scale;
      live.smokeY = cy + (r.smokeY - el.y) * st.scale;
      live.smoke = r.smoke * st.alpha;
      smokeScale = st.scale;
    }
    if (el.light) {
      live.sunX = r.sunX + st.offset[0];
      live.sunY = r.sunY + st.offset[1];
    }
    return { x: el.x, y: el.y, ...st };
  });
  return { recipe: live, elements, smokeScale };
}

// What the sound effects need to know: the soundscape, the live weather of
// the score and where on the wall the train is.
function soundScene(live, elements, view) {
  const r = state.current.recipe;
  const i = r.elements.findIndex((el) => el.type === 'approach');
  const train = i < 0
    ? null
    : { x: (elements[i].x + elements[i].offset[0] - view[0]) / view[2], scale: elements[i].scale, alpha: elements[i].alpha };
  return {
    scape: r.sounds,
    mood: r.mood,
    level: r.sfx,
    rain: live.rain,
    snow: live.snow,
    fire: live.fire,
    wind: live.wind,
    water: live.water,
    rocking: r.elements.some((el) => el.type === 'rock' || el.type === 'drift'),
    train,
  };
}

function tick(dt) {
  state.paintTime += dt;
  state.elemTime += dt;
  if (state.reveal < 1) state.reveal += dt / REVEAL_SECONDS;
  if (state.trans < 1) state.trans += dt / (TRANSITION_SECONDS[state.transType] ?? 3.4);
  const r = state.current.recipe;
  if (state.playing && !state.editing && !state.advancing && state.paintTime > r.duration && state.reveal >= 1) {
    state.advancing = true;
    next();
  }
}

function fileName() {
  return `an-ode-to-romanticism-${state.current?.entry.id ?? 'frame'}`;
}

// ---------------------------------------------------------------------------
// Pointer: stir the paint.

function pointerToScene(e) {
  return [e.clientX / window.innerWidth, e.clientY / window.innerHeight];
}

canvas.addEventListener('pointerdown', (e) => {
  state.pointerDown = true;
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  wake();
  const p = pointerToScene(e);
  if (state.mouse[0] > -1) {
    const strength = state.pointerDown ? 1.2 : 0.3;
    state.mouseVel[0] += (p[0] - state.mouse[0]) * strength;
    state.mouseVel[1] += (p[1] - state.mouse[1]) * strength;
  }
  state.mouse = p;
});
const endPointer = () => {
  state.pointerDown = false;
};
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('pointerleave', () => {
  state.mouse = [-10, -10];
});

// Interface fades out during the show.
let idleTimer = 0;
function wake() {
  document.body.classList.remove('idle');
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    const dialogOpen = document.querySelector('dialog[open]');
    if (state.playing && !state.editing && !dialogOpen) document.body.classList.add('idle');
  }, 3500);
}
window.addEventListener('pointermove', wake, { passive: true });
window.addEventListener('pointerdown', wake, { passive: true });

// ---------------------------------------------------------------------------
// Gallery

const gallery = buildGallery($('gallery'), (id) => {
  const i = state.entries.findIndex((e) => e.id === id);
  if (i >= 0 && i !== state.index) goTo(i);
});

function studyThumb(entry) {
  return paintStudy(entry.study, 240, entry.id, { strokes: 1400 }).toDataURL('image/jpeg', 0.8);
}

for (const entry of state.entries) {
  gallery.add(entry, commonsThumbUrl(entry.files[0]), (img) => {
    img.src = studyThumb(entry);
  });
}

// ---------------------------------------------------------------------------
// Controls

const playBtn = $('playBtn');
function setPlaying(v) {
  state.playing = v;
  playBtn.textContent = v ? '❚❚' : '▶';
  playBtn.title = v ? 'Pause the show (space)' : 'Play the show (space)';
  if (v && state.current && state.paintTime > state.current.recipe.duration) state.paintTime = state.current.recipe.duration * 0.6;
  wake();
}
setPlaying(state.playing);
playBtn.addEventListener('click', () => setPlaying(!state.playing));
$('nextBtn').addEventListener('click', next);
$('prevBtn').addEventListener('click', prev);

const transitionSel = $('transitionSel');
for (const t of TRANSITIONS) {
  const o = document.createElement('option');
  o.value = t.id;
  o.textContent = t.label;
  transitionSel.append(o);
}
transitionSel.addEventListener('change', () => {
  state.transitionOverride = transitionSel.value;
});

// Music and effects are on by default; a visitor who turns them off is
// remembered. Browsers only let a page play sound after a click
// or a key press, so until the first one the sound waits, and the Sound
// button pulses to say so.
const SOUND_KEY = 'turner-lumieres:sound';
const soundBtn = $('soundBtn');
let soundWanted = true;
try {
  soundWanted = localStorage.getItem(SOUND_KEY) !== 'off';
} catch {
  // Storage unavailable: keep the default.
}

function updateSoundBtn() {
  soundBtn.classList.toggle('active', soundWanted);
  soundBtn.classList.toggle('waiting', soundWanted && !ambient.on);
  soundBtn.setAttribute('aria-pressed', String(soundWanted));
}

let soundStarting = false;
async function startSound() {
  soundStarting = true;
  try {
    await ambient.start();
    if (state.current) ambient.setMood(state.current.recipe.mood);
    if (!ambient.trackFailed && !ambient.customMusic) status(`Music: ${BACKGROUND_TRACK.title}`, 4000);
  } catch (err) {
    console.warn(err);
    status('Audio could not start in this browser.');
  }
  soundStarting = false;
  updateSoundBtn();
}

// The first click or key press anywhere starts the sound. The Sound button
// and the S key are left to their own handler, which turns it off.
function unlockSound(e) {
  if (e.target?.closest?.('#soundBtn') || (e.type === 'keydown' && e.key.toLowerCase() === 's')) return;
  disarmUnlock();
  if (soundWanted && !ambient.on) startSound();
}
function armUnlock() {
  window.addEventListener('pointerdown', unlockSound, true);
  window.addEventListener('keydown', unlockSound, true);
}
function disarmUnlock() {
  window.removeEventListener('pointerdown', unlockSound, true);
  window.removeEventListener('keydown', unlockSound, true);
}

async function toggleSound() {
  soundWanted = !soundWanted;
  try {
    localStorage.setItem(SOUND_KEY, soundWanted ? 'on' : 'off');
  } catch {
    // Not remembered, still applied.
  }
  disarmUnlock();
  if (soundWanted) await startSound();
  else ambient.stop();
  updateSoundBtn();
}
soundBtn.addEventListener('click', toggleSound);

// At launch: start at once where the browser allows it, otherwise wait for
// the first click or key press.
function initSound() {
  updateSoundBtn();
  if (!soundWanted) return;
  ambient.prepareMusic();
  if (ambient.ctx.state === 'running') {
    startSound();
  } else {
    armUnlock();
    status('Click anywhere or press a key to start the music.', 7000);
    // Some browsers allow sound a moment after the page opens: start then.
    ambient.ctx.resume().then(() => {
      if (soundWanted && !ambient.on && !soundStarting) {
        disarmUnlock();
        startSound();
      }
    });
  }
}

$('musicBtn').addEventListener('click', () => $('musicInput').click());
$('musicInput').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    await ambient.useMusic(file);
    soundWanted = true;
    disarmUnlock();
    updateSoundBtn();
    status(`Playing ${file.name}. The light now follows the music.`);
  } catch (err) {
    console.warn(err);
    status('That audio file could not be played.');
  }
});

const recordBtn = $('recordBtn');
recordBtn.classList.add('rec');
function toggleRecord() {
  if (!recorder.supported) {
    status('Video recording is not supported in this browser.');
    return;
  }
  if (recorder.recording) {
    recorder.stop();
    status('Recording saved.');
  } else {
    recorder.start(ambient.stream, fileName());
    status(ambient.on ? 'Recording video with sound. Press again to stop.' : 'Recording video. Turn sound on to include the music.');
  }
  recordBtn.textContent = recorder.recording ? 'Stop' : 'Record';
  recordBtn.classList.toggle('active', recorder.recording);
}
recordBtn.addEventListener('click', toggleRecord);
$('snapBtn').addEventListener('click', () => {
  state.snapshot = true;
});

$('fullBtn').addEventListener('click', toggleFullscreen);
function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen?.().catch(() => {});
}

$('helpBtn').addEventListener('click', () => $('helpDialog').showModal());

// The help lists the editor's controls from their own definitions, and its
// section links scroll within the dialog.
buildControlsHelp($('helpControls'));
const helpBody = $('helpDialog').querySelector('.help-body');
$('helpDialog').querySelectorAll('.help-nav a').forEach((a) => {
  a.addEventListener('click', (e) => {
    e.preventDefault();
    const target = helpBody.querySelector(a.getAttribute('href'));
    if (target) helpBody.scrollTop += target.getBoundingClientRect().top - helpBody.getBoundingClientRect().top - 8;
  });
});

// ---------------------------------------------------------------------------
// Editor

const editorEl = $('editor');
const editor = buildEditor($('editorGroups'), (key, value) => {
  if (!state.current) return;
  state.current.recipe[key] = value;
  if (key === 'mood') ambient.setMood(value);
  if (key === 'water') scheduleRelayer();
  saveRecipe();
});
const handles = new Handles(
  $('handles'),
  (name, x, y) => {
    const v = state.view;
    const px = clamp(v[0] + (x / window.innerWidth) * v[2], 0, 1);
    const py = clamp(v[1] + (y / window.innerHeight) * v[3], 0, 1);
    const r = state.current.recipe;
    const [kind, index] = name.split('-');
    const el = r.elements[Number(index)];
    if (kind === 'element' && el) {
      // Attached smoke keeps its place on the element.
      if (el.smoke) {
        r.smokeX += px - el.x;
        r.smokeY += py - el.y;
      }
      el.x = px;
      el.y = py;
    } else if (kind === 'vanish' && el) {
      el.vx = px;
      el.vy = py;
    } else if (name === 'horizon') {
      r.horizon = py;
      scheduleRelayer();
    } else {
      const keys = { sun: ['sunX', 'sunY'], vortex: ['vortexX', 'vortexY'], focus: ['focusX', 'focusY'], smoke: ['smokeX', 'smokeY'] };
      r[keys[name][0]] = px;
      r[keys[name][1]] = py;
    }
    saveRecipe();
  },
  (name) => {
    if (name.startsWith('element-')) scheduleRecut();
  },
);

const elementsEditor = buildElementsEditor($('elementsEditor'), {
  onChange(i, key, value) {
    const r = state.current.recipe;
    const el = r.elements[i];
    if (!el) return;
    if (key === 'type') {
      const next = retypeElement(el, value);
      if (next.type === 'approach') Object.assign(next, estimateVanishing(state.current.analysis, next));
      r.elements[i] = next;
      renderElementsEditor();
    } else if (key === 'size') {
      const ratio = el.ry / el.rx;
      el.rx = value;
      el.ry = value * ratio;
      scheduleRecut();
    } else if (key === 'angle') {
      el.angle = value;
      scheduleRecut();
    } else {
      el[key] = value;
    }
    saveRecipe();
  },
  onAdd() {
    const r = state.current.recipe;
    if (r.elements.length >= MAX_ELEMENTS) return;
    const aspect = state.current.analysis.aspect;
    r.elements.push(makeElement({ type: 'drift', x: r.focusX, y: r.focusY, rx: 0.08, ry: 0.08 * aspect }));
    renderElementsEditor();
    scheduleRecut();
    saveRecipe();
    status('Drag the numbered marker onto the object you want to move, then choose how it moves.', 6000);
  },
  onRemove(i) {
    state.current.recipe.elements.splice(i, 1);
    renderElementsEditor();
    scheduleRecut();
    saveRecipe();
  },
});

function renderElementsEditor() {
  elementsEditor.render(state.current.recipe.elements, ELEMENT_TYPES, MAX_ELEMENTS);
}

function updateHandles() {
  const v = state.view;
  handles.update(
    (x, y) => [((x - v[0]) / v[2]) * window.innerWidth, ((y - v[1]) / v[3]) * window.innerHeight],
    state.current.recipe,
    window.innerWidth,
  );
}

function refreshEditor() {
  $('editorTitle').textContent = state.current.entry.title;
  editor.setValues(state.current.recipe);
  renderElementsEditor();
}

function setEditing(v) {
  state.editing = v;
  editorEl.hidden = !v;
  if (!v) {
    state.showLayers = false;
    $('showLayers').checked = false;
  }
  handles.visible = v;
  $('editBtn').classList.toggle('active', v);
  if (v && state.current) refreshEditor();
  wake();
}
$('editBtn').addEventListener('click', () => setEditing(!state.editing));
$('showLayers').addEventListener('change', (e) => {
  state.showLayers = e.target.checked;
});
$('editorClose').addEventListener('click', () => setEditing(false));

$('resetRecipe').addEventListener('click', () => {
  try {
    localStorage.removeItem(storageKey(state.current));
  } catch {
    // Nothing stored.
  }
  state.current.recipe = baseRecipe(state.current);
  refreshEditor();
  scheduleRecut();
  scheduleRelayer();
  status('Animation reset to its original score.');
});
$('reanalyse').addEventListener('click', () => {
  const { sun } = state.current.analysis;
  Object.assign(state.current.recipe, { sunX: sun.x, sunY: sun.y, focusX: sun.x, focusY: sun.y });
  saveRecipe();
  status('Light source placed on the brightest area of the painting.');
});
$('exportRecipe').addEventListener('click', () => {
  const { entry, recipe } = state.current;
  const blob = new Blob([JSON.stringify({ id: entry.id, title: entry.title, recipe }, null, 2)], {
    type: 'application/json',
  });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${entry.id}-score.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
});
$('importRecipe').addEventListener('click', () => $('importInput').click());
$('importInput').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const json = JSON.parse(await file.text());
    Object.assign(state.current.recipe, pickKnown(json.recipe ?? json));
    completeElements(state.current.recipe, state.current.analysis);
    refreshEditor();
    scheduleRecut();
    scheduleRelayer();
    saveRecipe();
    ambient.setMood(state.current.recipe.mood);
    status(`Score applied to ${state.current.entry.title}.`);
  } catch {
    status('That file is not a valid score.');
  }
  e.target.value = '';
});

// ---------------------------------------------------------------------------
// Visitors' own paintings

function prettyName(name) {
  const base = decodeURIComponent(name.split('/').pop() ?? 'Untitled').replace(/\.[a-z0-9]+$/i, '');
  const cleaned = base.replace(/[_-]+/g, ' ').replace(/^\d+px /, '').trim() || 'Untitled';
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

async function addUserPainting({ file, url }) {
  showLoading('Reading your painting');
  try {
    const src = file ? URL.createObjectURL(file) : url;
    const img = await loadImage(src);
    const source = fitSource(img, Math.min(3840, renderer.maxTexture));
    // Throws a SecurityError when the host refuses to share pixels.
    const analysis = analysePainting(source);
    const entry = {
      id: `user-${Date.now().toString(36)}`,
      title: prettyName(file ? file.name : url),
      year: '',
      collection: '',
      chapter: 'user',
      kind: 'user',
      source,
    };
    const prepared = { entry, source, analysis, isStudy: false };
    state.prepared.set(entry.id, Promise.resolve(prepared));
    state.entries.push(entry);
    const thumb = fitSource(source, 240);
    gallery.add(entry, thumb instanceof HTMLCanvasElement ? thumb.toDataURL('image/jpeg', 0.8) : src);
    await goTo(state.entries.length - 1);
    status('Your painting has been analysed. Open Edit to shape its animation.');
  } catch (err) {
    console.warn(err);
    hideLoading();
    status(
      err?.name === 'SecurityError'
        ? 'That site does not allow its images to be animated. Download the image and add it as a file.'
        : 'That image could not be loaded. Some sites block sharing their images, adding the file itself always works.',
      6500,
    );
  }
}

const addDialog = $('addDialog');
$('addBtn').addEventListener('click', () => addDialog.showModal());
$('fileInput').addEventListener('change', (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  addDialog.close();
  addUserPainting({ file });
  e.target.value = '';
});
addDialog.addEventListener('close', () => {
  const url = $('urlInput').value.trim();
  if (addDialog.returnValue === 'url' && url) addUserPainting({ url });
  $('urlInput').value = '';
});

let dragDepth = 0;
window.addEventListener('dragenter', (e) => {
  if (!e.dataTransfer?.types.includes('Files')) return;
  dragDepth++;
  $('dropzone').hidden = false;
});
window.addEventListener('dragleave', () => {
  dragDepth = Math.max(0, dragDepth - 1);
  if (!dragDepth) $('dropzone').hidden = true;
});
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => {
  e.preventDefault();
  dragDepth = 0;
  $('dropzone').hidden = true;
  const file = [...(e.dataTransfer?.files ?? [])].find((f) => f.type.startsWith('image/'));
  if (file) addUserPainting({ file });
});

// ---------------------------------------------------------------------------
// Keyboard

window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
  if (document.querySelector('dialog[open]')) return;
  wake();
  const k = e.key.toLowerCase();
  if (k === 'arrowright') next();
  else if (k === 'arrowleft') prev();
  else if (k === ' ') {
    e.preventDefault();
    setPlaying(!state.playing);
  } else if (k === 'e') setEditing(!state.editing);
  else if (k === 's') toggleSound();
  else if (k === 'r') toggleRecord();
  else if (k === 'f') toggleFullscreen();
  else if (k === 'h') document.body.classList.toggle('hide-ui');
  else if (k === '?') $('helpDialog').showModal();
  else if (k === 'escape' && state.editing) setEditing(false);
});

// ---------------------------------------------------------------------------
// Boot

async function boot() {
  resize();
  try {
    await document.fonts?.load('italic 500 64px "Cormorant Garamond"');
  } catch {
    // Fallback serif is fine.
  }
  requestAnimationFrame(frame);
  const start = state.entries.findIndex((e) => e.id === params.get('painting'));
  await goTo(Math.max(0, start));
  initSound();
  wake();
}

boot();

// Exposed for debugging and automated checks.
window.turnerLumieres = { state, goTo, setEditing, renderer, ambient };
