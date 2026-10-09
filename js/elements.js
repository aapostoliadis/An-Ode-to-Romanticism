// Moving elements: the cut-out layers of the Lumières shows.
//
// A studio rotoscopes a boat or a train by hand, repaints the background
// behind it, then animates the cut-out. This module does the same in the
// browser:
//   1. snap      find the element near a hinted position (darkest or
//                brightest mass), so a score survives different crops
//   2. matte     a soft silhouette inside an ellipse: pixels that differ
//                from the ring of background around the element
//   3. fill      repaint the hole: a push-pull smooth fill, blended with a
//                directional fill that carries lines (a bridge, the
//                horizon) straight across the gap
//   4. animate   per frame offset, scale, rotation and motion blur, applied
//                in the scene shader

import { boxBlur } from './analysis.js';

export const MAX_ELEMENTS = 3;

export const ELEMENT_TYPES = [
  { id: 'approach', label: 'Comes toward the viewer' },
  { id: 'drift', label: 'Drifts across' },
  { id: 'rock', label: 'Rocks on the waves' },
  { id: 'rise', label: 'Rises or sets' },
  { id: 'pulse', label: 'Pulses' },
];

// pivot: where rotation happens, as a fraction of the half height below
// the centre (0.8 is about the waterline of a boat).
const TYPE_DEFAULTS = {
  approach: { period: 12, vx: 'auto', vy: 'auto', zFar: 3.2, zNear: 0.5, phase: 0.35 },
  drift: { dx: 0.04, dy: 0, bob: 0.003, rock: 0.008, period: 8, pivot: 0.6 },
  rock: { dx: 0, dy: 0, bob: 0.004, rock: 0.03, period: 5, pivot: 0.8 },
  rise: { dx: 0, dy: -0.05, bob: 0, rock: 0, period: 10, pivot: 0 },
  pulse: { pulse: 0.06, period: 7 },
};

const BASE = { type: 'drift', x: 0.5, y: 0.5, rx: 0.08, ry: 0.08, matte: 'auto', amount: 1, smoke: false, light: false };
const NUMBER_KEYS = [
  'x', 'y', 'rx', 'ry', 'amount', 'period', 'vx', 'vy', 'zFar', 'zNear', 'phase', 'dx', 'dy', 'bob', 'rock', 'pivot', 'pulse',
];
const MATTES = ['auto', 'dark', 'light', 'ellipse'];

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

export function makeElement(partial = {}) {
  const type = TYPE_DEFAULTS[partial.type] ? partial.type : 'drift';
  return { ...BASE, ...TYPE_DEFAULTS[type], ...partial, type };
}

// Switching type keeps the region and swaps in that type's motion.
export function retypeElement(el, type) {
  const { x, y, rx, ry, matte, amount, smoke, light } = el;
  return makeElement({ x, y, rx, ry, matte, amount, smoke, light, type });
}

// Validates elements coming from storage or an imported score.
export function sanitizeElements(list) {
  if (!Array.isArray(list)) return null;
  const out = [];
  for (const raw of list.slice(0, MAX_ELEMENTS)) {
    if (!raw || typeof raw !== 'object') continue;
    const el = {};
    for (const k of NUMBER_KEYS) if (typeof raw[k] === 'number' && Number.isFinite(raw[k])) el[k] = raw[k];
    if (typeof el.x !== 'number' || typeof el.y !== 'number') continue;
    if (typeof raw.type === 'string') el.type = raw.type;
    if (MATTES.includes(raw.matte)) el.matte = raw.matte;
    el.smoke = raw.smoke === true;
    el.light = raw.light === true;
    out.push(makeElement(el));
  }
  return out;
}

// Move a hinted position onto the most distinct dark (or bright) mass
// nearby: centre-surround contrast at the element's scale, so a compact
// locomotive wins over the long dark viaduct it stands on.
function snapPosition(analysis, el, mode, radius) {
  const { width: W, height: H, lum } = analysis;
  const rs = Math.max(1, Math.round(el.rx * W * 0.35));
  const rl = Math.max(rs + 1, Math.round(el.rx * W * 1.2));
  const inner = boxBlur(boxBlur(lum, W, H, rs), W, H, rs);
  const outer = boxBlur(boxBlur(lum, W, H, rl), W, H, rl);
  const margin = Math.round(Math.min(W, H) * 0.03);
  const x0 = clamp(Math.floor((el.x - radius) * W), margin, W - 1 - margin);
  const x1 = clamp(Math.ceil((el.x + radius) * W), margin, W - 1 - margin);
  const y0 = clamp(Math.floor((el.y - radius) * H), margin, H - 1 - margin);
  const y1 = clamp(Math.ceil((el.y + radius) * H), margin, H - 1 - margin);
  const sign = mode === 'light' ? 1 : -1;
  let best = Number.NEGATIVE_INFINITY;
  let bx = el.x;
  let by = el.y;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = y * W + x;
      // A mild pull toward the hint keeps the snap from wandering.
      const dist = Math.hypot(x / W - el.x, y / H - el.y) / radius;
      const score = sign * (inner[i] - outer[i]) - dist * 0.02;
      if (score > best) {
        best = score;
        bx = (x + 0.5) / W;
        by = (y + 0.5) / H;
      }
    }
  }
  return { x: bx, y: by };
}

// Where an approaching element comes from: follow the dominant line of the
// strokes around it (a viaduct, a road, a shoreline) up into the distance.
export function estimateVanishing(analysis, el) {
  const { width: W, height: H, ana, aspect } = analysis;
  const R = Math.max(el.rx, el.ry) * 3;
  const x0 = clamp(Math.floor((el.x - R / aspect) * W), 0, W - 1);
  const x1 = clamp(Math.ceil((el.x + R / aspect) * W), 0, W - 1);
  const y0 = clamp(Math.floor((el.y - R) * H), 0, H - 1);
  const y1 = clamp(Math.ceil((el.y + R) * H), 0, H - 1);
  let sx = 0;
  let sy = 0;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const ex = ((x + 0.5) / W - el.x) / el.rx;
      const ey = ((y + 0.5) / H - el.y) / el.ry;
      if (ex * ex + ey * ey < 1.2) continue;
      const i = (y * W + x) * 4;
      const w = ana[i + 2] / 255;
      sx += (ana[i] / 127.5 - 1) * w;
      sy += (ana[i + 1] / 127.5 - 1) * w;
    }
  }
  const a = 0.5 * Math.atan2(sy, sx);
  let dx = Math.cos(a);
  let dy = Math.sin(a);
  if (dy > 0) {
    dx = -dx;
    dy = -dy;
  }
  if (Math.abs(dy) < 0.05) dx = Math.sign(0.5 - el.x) || 1;
  const L = 0.45;
  return { vx: clamp(el.x + (dx * L) / aspect, 0, 1), vy: clamp(el.y + dy * L, 0, 1) };
}

// Resolve authored placeholders ('sun', snapping) once per painting. Moves
// the recipe's smoke source along with an element it is attached to.
export function resolveElements(recipe, analysis) {
  return (recipe.elements ?? []).slice(0, MAX_ELEMENTS).map((raw) => {
    const el = makeElement(raw);
    if (el.x === 'sun') el.x = recipe.sunX;
    if (el.y === 'sun') el.y = recipe.sunY;
    if (el.snap) {
      const p = snapPosition(analysis, el, el.snap, el.snapRadius ?? 0.1);
      if (el.smoke) {
        recipe.smokeX += p.x - el.x;
        recipe.smokeY += p.y - el.y;
      }
      el.x = p.x;
      el.y = p.y;
    }
    if (el.type === 'approach' && (el.vx === 'auto' || el.vy === 'auto')) Object.assign(el, estimateVanishing(analysis, el));
    delete el.snap;
    delete el.snapRadius;
    return el;
  });
}

export function elementsKey(elements) {
  return JSON.stringify(elements.map((e) => [e.x, e.y, e.rx, e.ry, e.matte].map((v) => (typeof v === 'number' ? v.toFixed(4) : v))));
}

// ---------------------------------------------------------------------------
// Cutting

function pushPull(val, wgt, w, h, nc) {
  const levels = [{ w, h, val, wgt }];
  while (levels[levels.length - 1].w > 1 || levels[levels.length - 1].h > 1) {
    const L = levels[levels.length - 1];
    const nw = Math.max(1, Math.ceil(L.w / 2));
    const nh = Math.max(1, Math.ceil(L.h / 2));
    const nv = new Float32Array(nw * nh * nc);
    const nwt = new Float32Array(nw * nh);
    const acc = new Float32Array(nc);
    for (let y = 0; y < nh; y++) {
      for (let x = 0; x < nw; x++) {
        let ws = 0;
        acc.fill(0);
        for (let dy = 0; dy < 2; dy++) {
          const sy = 2 * y + dy;
          if (sy >= L.h) continue;
          for (let dx = 0; dx < 2; dx++) {
            const sx = 2 * x + dx;
            if (sx >= L.w) continue;
            const j = sy * L.w + sx;
            const a = L.wgt[j];
            ws += a;
            for (let c = 0; c < nc; c++) acc[c] += L.val[j * nc + c] * a;
          }
        }
        const i = y * nw + x;
        nwt[i] = Math.min(1, ws);
        if (ws > 1e-6) for (let c = 0; c < nc; c++) nv[i * nc + c] = acc[c] / ws;
      }
    }
    levels.push({ w: nw, h: nh, val: nv, wgt: nwt });
  }
  let up = levels[levels.length - 1].val;
  for (let li = levels.length - 2; li >= 0; li--) {
    const L = levels[li];
    const C = levels[li + 1];
    const out = new Float32Array(L.w * L.h * nc);
    for (let y = 0; y < L.h; y++) {
      const cy = clamp((y + 0.5) / 2 - 0.5, 0, C.h - 1);
      const y0 = Math.floor(cy);
      const y1 = Math.min(C.h - 1, y0 + 1);
      const fy = cy - y0;
      for (let x = 0; x < L.w; x++) {
        const cx = clamp((x + 0.5) / 2 - 0.5, 0, C.w - 1);
        const x0 = Math.floor(cx);
        const x1 = Math.min(C.w - 1, x0 + 1);
        const fx = cx - x0;
        const i = y * L.w + x;
        const a = L.wgt[i];
        for (let c = 0; c < nc; c++) {
          const top = up[(y0 * C.w + x0) * nc + c] * (1 - fx) + up[(y0 * C.w + x1) * nc + c] * fx;
          const bot = up[(y1 * C.w + x0) * nc + c] * (1 - fx) + up[(y1 * C.w + x1) * nc + c] * fx;
          out[i * nc + c] = L.val[i * nc + c] * a + (top * (1 - fy) + bot * fy) * (1 - a);
        }
      }
    }
    up = out;
  }
  return up;
}

// A few representative colours of the ring around the element (k-means).
function ringPalette(samples, k) {
  const n = samples.length / 3;
  const cents = [];
  cents.push([samples[0], samples[1], samples[2]]);
  const dist = new Float32Array(n).fill(Number.POSITIVE_INFINITY);
  while (cents.length < Math.min(k, n)) {
    const c = cents[cents.length - 1];
    let far = 0;
    for (let i = 0; i < n; i++) {
      const d = (samples[i * 3] - c[0]) ** 2 + (samples[i * 3 + 1] - c[1]) ** 2 + (samples[i * 3 + 2] - c[2]) ** 2;
      if (d < dist[i]) dist[i] = d;
      if (dist[i] > dist[far]) far = i;
    }
    cents.push([samples[far * 3], samples[far * 3 + 1], samples[far * 3 + 2]]);
  }
  const sums = cents.map(() => [0, 0, 0, 0]);
  for (let iter = 0; iter < 6; iter++) {
    for (const t of sums) t.fill(0);
    for (let i = 0; i < n; i++) {
      let bi = 0;
      let bd = Number.POSITIVE_INFINITY;
      for (let c = 0; c < cents.length; c++) {
        const d =
          (samples[i * 3] - cents[c][0]) ** 2 + (samples[i * 3 + 1] - cents[c][1]) ** 2 + (samples[i * 3 + 2] - cents[c][2]) ** 2;
        if (d < bd) {
          bd = d;
          bi = c;
        }
      }
      const t = sums[bi];
      t[0] += samples[i * 3];
      t[1] += samples[i * 3 + 1];
      t[2] += samples[i * 3 + 2];
      t[3]++;
    }
    cents.forEach((c, ci) => {
      const t = sums[ci];
      if (t[3]) {
        c[0] = t[0] / t[3];
        c[1] = t[1] / t[3];
        c[2] = t[2] / t[3];
      }
    });
  }
  return cents;
}

// Soft silhouette of the element. A pixel belongs to the element when its
// colour is unlike the background found on its own side of the ring, so the
// viaduct crossing the ring stays behind, and a dark chimney rising into
// pale sky is lifted out with the engine.
const SECTORS = 8;

function computeMatte(data, b) {
  const { bw, bh } = b;
  const n = bw * bh;
  const ell = new Float32Array(n);
  const ang = new Float32Array(n);
  const lum = new Float32Array(n);
  const ring = Array.from({ length: SECTORS }, () => []);
  const ringLum = [];
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      const k = y * bw + x;
      const ex = (b.bx + x + 0.5 - b.cx) / b.rx;
      const ey = (b.by + y + 0.5 - b.cy) / b.ry;
      const d = Math.sqrt(ex * ex + ey * ey);
      ell[k] = d;
      ang[k] = Math.atan2(ey, ex);
      lum[k] = (0.299 * data[k * 4] + 0.587 * data[k * 4 + 1] + 0.114 * data[k * 4 + 2]) / 255;
      if (d > 1.08 && d < 1.38) {
        const sec = Math.floor(((ang[k] / (Math.PI * 2) + 1) % 1) * SECTORS) % SECTORS;
        ring[sec].push(k);
        ringLum.push(lum[k]);
      }
    }
  }
  ringLum.sort((p, q) => p - q);
  const bgLum = ringLum.length ? ringLum[ringLum.length >> 1] : 0.5;
  const palettes = ring.map((list) => {
    const step = Math.max(1, Math.floor(list.length / 400));
    const samples = [];
    for (let i = 0; i < list.length; i += step) {
      const k = list[i];
      samples.push(data[k * 4] / 255, data[k * 4 + 1] / 255, data[k * 4 + 2] / 255);
    }
    return samples.length ? ringPalette(samples, 3) : [];
  });
  // Each pixel is judged against its own sector and the two beside it.
  const near = palettes.map((_, i) =>
    [palettes[(i + SECTORS - 1) % SECTORS], palettes[i], palettes[(i + 1) % SECTORS]].flat(),
  );

  let matte = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    const d = ell[k];
    if (d >= 1) continue;
    let o = 1;
    if (b.matte === 'dark') o = smoothstep(0.02, 0.14, bgLum - lum[k]);
    else if (b.matte === 'light') o = smoothstep(0.02, 0.14, lum[k] - bgLum);
    else if (b.matte !== 'ellipse') {
      const r = data[k * 4] / 255;
      const g = data[k * 4 + 1] / 255;
      const bl = data[k * 4 + 2] / 255;
      const sec = Math.floor(((ang[k] / (Math.PI * 2) + 1) % 1) * SECTORS) % SECTORS;
      let md = Number.POSITIVE_INFINITY;
      for (const c of near[sec]) md = Math.min(md, (r - c[0]) ** 2 + (g - c[1]) ** 2 + (bl - c[2]) ** 2);
      if (!Number.isFinite(md)) md = 1;
      o = smoothstep(0.07, 0.17, Math.sqrt(md));
    }
    matte[k] = o * (1 - smoothstep(0.82, 1, d));
  }
  const r1 = Math.max(1, Math.round(Math.min(bw, bh) / 120));
  matte = boxBlur(boxBlur(matte, bw, bh, r1), bw, bh, r1);
  // Close small gaps inside the silhouette (a lit window, a highlight).
  const rc = Math.max(2, Math.round(Math.min(bw, bh) / 30));
  const closed = boxBlur(boxBlur(matte, bw, bh, rc), bw, bh, rc);
  for (let k = 0; k < n; k++) {
    const inside = 1 - smoothstep(0.85, 1, ell[k]);
    matte[k] = Math.min(1, Math.max(matte[k] * 1.25, smoothstep(0.22, 0.45, closed[k]) * inside));
  }

  // The hole to repaint is a little larger than the matte.
  const r2 = Math.max(2, Math.round(Math.min(bw, bh) / 45));
  const spread = boxBlur(boxBlur(matte, bw, bh, r2), bw, bh, r2);
  const hole = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    hole[k] = Math.max(matte[k], Math.min(1, spread[k] * 3) * (1 - smoothstep(1.05, 1.25, ell[k])));
  }
  return { matte, hole };
}

function fillHole(data, hole, bw, bh, seed) {
  const n = bw * bh;
  const known = new Float32Array(n);
  const rgb = new Float32Array(n * 3);
  const lum = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    known[k] = 1 - hole[k];
    rgb[k * 3] = data[k * 4];
    rgb[k * 3 + 1] = data[k * 4 + 1];
    rgb[k * 3 + 2] = data[k * 4 + 2];
    lum[k] = 0.299 * data[k * 4] + 0.587 * data[k * 4 + 1] + 0.114 * data[k * 4 + 2];
  }
  const smooth = pushPull(rgb, known, bw, bh, 3);

  // Structure of the surroundings, carried into the hole.
  const tensor = new Float32Array(n * 3);
  const tw = new Float32Array(n);
  for (let y = 1; y < bh - 1; y++) {
    for (let x = 1; x < bw - 1; x++) {
      const k = y * bw + x;
      const gx = lum[k + 1] - lum[k - 1];
      const gy = lum[k + bw] - lum[k - bw];
      const w = known[k] ** 4;
      tensor[k * 3] = gx * gx * w;
      tensor[k * 3 + 1] = gy * gy * w;
      tensor[k * 3 + 2] = gx * gy * w;
      tw[k] = w;
    }
  }
  const rs = Math.max(2, Math.round(Math.min(bw, bh) / 40));
  const blurred = [0, 1, 2].map((c) => {
    const ch = new Float32Array(n);
    for (let k = 0; k < n; k++) ch[k] = tensor[k * 3 + c];
    return boxBlur(boxBlur(ch, bw, bh, rs), bw, bh, rs);
  });
  const twb = boxBlur(boxBlur(tw, bw, bh, rs), bw, bh, rs);
  const tnorm = new Float32Array(n * 3);
  const tconf = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    const s = twb[k] > 1e-4 ? 1 / twb[k] : 0;
    tnorm[k * 3] = blurred[0][k] * s;
    tnorm[k * 3 + 1] = blurred[1][k] * s;
    tnorm[k * 3 + 2] = blurred[2][k] * s;
    tconf[k] = Math.min(1, twb[k] * 2);
  }
  const field = pushPull(tnorm, tconf, bw, bh, 3);
  const tx = new Float32Array(n);
  const ty = new Float32Array(n);
  const coh = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    const a = field[k * 3] - field[k * 3 + 1];
    const b = 2 * field[k * 3 + 2];
    const diff = Math.hypot(a, b);
    const phi = 0.5 * Math.atan2(b, a);
    tx[k] = -Math.sin(phi);
    ty[k] = Math.cos(phi);
    coh[k] = diff / (field[k * 3] + field[k * 3 + 1] + 1e-6);
  }

  const maxSteps = Math.round(Math.max(bw, bh) * 0.7);
  const march = (x, y, sign) => {
    let px = x + 0.5;
    let py = y + 0.5;
    const k0 = y * bw + x;
    let dx = tx[k0] * sign;
    let dy = ty[k0] * sign;
    for (let s = 1; s < maxSteps; s++) {
      px += dx;
      py += dy;
      const ix = px | 0;
      const iy = py | 0;
      if (ix < 0 || iy < 0 || ix >= bw || iy >= bh) return null;
      const j = iy * bw + ix;
      if (known[j] > 0.92) return { j, s };
      let ndx = tx[j];
      let ndy = ty[j];
      if (ndx * dx + ndy * dy < 0) {
        ndx = -ndx;
        ndy = -ndy;
      }
      dx = ndx;
      dy = ndy;
    }
    return null;
  };

  let rnd = seed >>> 0;
  const noise = () => {
    rnd = (Math.imul(rnd, 1664525) + 1013904223) >>> 0;
    return rnd / 4294967296 - 0.5;
  };
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      const k = y * bw + x;
      const h = hole[k];
      if (h < 0.01) continue;
      let r = smooth[k * 3];
      let g = smooth[k * 3 + 1];
      let b = smooth[k * 3 + 2];
      const wDir = clamp((coh[k] - 0.2) * 2, 0, 1);
      if (wDir > 0) {
        const A = march(x, y, 1);
        const B = march(x, y, -1);
        if (A || B) {
          let dr;
          let dg;
          let db;
          let agree = 1;
          if (A && B) {
            const t = A.s / (A.s + B.s);
            dr = rgb[A.j * 3] * (1 - t) + rgb[B.j * 3] * t;
            dg = rgb[A.j * 3 + 1] * (1 - t) + rgb[B.j * 3 + 1] * t;
            db = rgb[A.j * 3 + 2] * (1 - t) + rgb[B.j * 3 + 2] * t;
            // A line is only continued when both of its ends agree.
            const gap = Math.sqrt(
              (rgb[A.j * 3] - rgb[B.j * 3]) ** 2 +
                (rgb[A.j * 3 + 1] - rgb[B.j * 3 + 1]) ** 2 +
                (rgb[A.j * 3 + 2] - rgb[B.j * 3 + 2]) ** 2,
            );
            agree = 1 - smoothstep(25, 80, gap);
          } else {
            const P = A ?? B;
            dr = rgb[P.j * 3];
            dg = rgb[P.j * 3 + 1];
            db = rgb[P.j * 3 + 2];
            agree = 0.5;
          }
          const k2 = wDir * agree;
          r += (dr - r) * k2;
          g += (dg - g) * k2;
          b += (db - b) * k2;
        }
      }
      const grain = noise() * 7;
      data[k * 4] = data[k * 4] * (1 - h) + (r + grain) * h;
      data[k * 4 + 1] = data[k * 4 + 1] * (1 - h) + (g + grain) * h;
      data[k * 4 + 2] = data[k * 4 + 2] * (1 - h) + (b + grain) * h;
    }
  }
}

function resample(src, w, h, nw, nh, nc) {
  const out = new Float32Array(nw * nh * nc);
  const sx = w / nw;
  const sy = h / nh;
  for (let y = 0; y < nh; y++) {
    const fy = clamp((y + 0.5) * sy - 0.5, 0, h - 1);
    const y0 = Math.floor(fy);
    const y1 = Math.min(h - 1, y0 + 1);
    const ty = fy - y0;
    for (let x = 0; x < nw; x++) {
      const fx = clamp((x + 0.5) * sx - 0.5, 0, w - 1);
      const x0 = Math.floor(fx);
      const x1 = Math.min(w - 1, x0 + 1);
      const tx = fx - x0;
      for (let c = 0; c < nc; c++) {
        const a = src[(y0 * w + x0) * nc + c] * (1 - tx) + src[(y0 * w + x1) * nc + c] * tx;
        const b = src[(y1 * w + x0) * nc + c] * (1 - tx) + src[(y1 * w + x1) * nc + c] * tx;
        out[(y * nw + x) * nc + c] = a * (1 - ty) + b * ty;
      }
    }
  }
  return out;
}

// Large elements are matted and repainted at a reduced size (the work grows
// with the area), then scaled back up; the layer keeps full-resolution
// colour.
const WORK_PIXELS = 160000;

function cutOne(orig, cur, b, seed) {
  const n = b.bw * b.bh;
  const f = Math.min(1, Math.sqrt(WORK_PIXELS / n));
  const sw = Math.max(8, Math.round(b.bw * f));
  const sh = Math.max(8, Math.round(b.bh * f));
  const small = f < 1;
  const scaledBox = small
    ? { bw: sw, bh: sh, bx: 0, by: 0, cx: (b.cx - b.bx) * (sw / b.bw), cy: (b.cy - b.by) * (sh / b.bh), rx: b.rx * (sw / b.bw), ry: b.ry * (sh / b.bh), matte: b.matte }
    : b;
  const origData = small ? Uint8ClampedArray.from(resample(orig, b.bw, b.bh, sw, sh, 4)) : orig;
  const workData = small ? Uint8ClampedArray.from(resample(cur, b.bw, b.bh, sw, sh, 4)) : cur;
  const { matte, hole } = computeMatte(origData, scaledBox);
  fillHole(workData, hole, sw, sh, seed);
  if (!small) return { matte, filled: workData };
  const matteUp = resample(matte, sw, sh, b.bw, b.bh, 1);
  const holeUp = resample(hole, sw, sh, b.bw, b.bh, 1);
  const fillUp = resample(workData, sw, sh, b.bw, b.bh, 4);
  const filled = new Uint8ClampedArray(n * 4);
  for (let k = 0; k < n; k++) {
    const h = holeUp[k];
    for (let c = 0; c < 3; c++) filled[k * 4 + c] = cur[k * 4 + c] * (1 - h) + fillUp[k * 4 + c] * h;
    filled[k * 4 + 3] = 255;
  }
  return { matte: matteUp, filled };
}

// Returns the painting with the elements removed (the "clean plate") and
// one RGBA layer per element.
export function cutElements(source, elements) {
  const W = source.naturalWidth || source.width;
  const H = source.naturalHeight || source.height;
  const plate = document.createElement('canvas');
  plate.width = W;
  plate.height = H;
  const ctx = plate.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(source, 0, 0, W, H);
  const boxes = elements.map((el) => {
    const rx = Math.max(4, el.rx * W);
    const ry = Math.max(4, el.ry * H);
    const m = 1.42;
    const bx = clamp(Math.floor(el.x * W - rx * m), 0, W - 2);
    const by = clamp(Math.floor(el.y * H - ry * m), 0, H - 2);
    const bx1 = clamp(Math.ceil(el.x * W + rx * m), bx + 2, W);
    const by1 = clamp(Math.ceil(el.y * H + ry * m), by + 2, H);
    return { bx, by, bw: bx1 - bx, bh: by1 - by, cx: el.x * W, cy: el.y * H, rx, ry, matte: el.matte };
  });
  const originals = boxes.map((b) => ctx.getImageData(b.bx, b.by, b.bw, b.bh));
  const pieces = boxes.map((b, i) => {
    const orig = originals[i].data;
    const cur = ctx.getImageData(b.bx, b.by, b.bw, b.bh);
    const { matte, filled } = cutOne(orig, cur.data, b, 1851 + i * 97);
    cur.data.set(filled);
    ctx.putImageData(cur, b.bx, b.by);
    const layer = new ImageData(b.bw, b.bh);
    for (let k = 0; k < b.bw * b.bh; k++) {
      layer.data[k * 4] = orig[k * 4];
      layer.data[k * 4 + 1] = orig[k * 4 + 1];
      layer.data[k * 4 + 2] = orig[k * 4 + 2];
      layer.data[k * 4 + 3] = Math.round(matte[k] * 255);
    }
    return { image: layer, src: [b.bx / W, b.by / H, b.bw / W, b.bh / H] };
  });
  return { plate, pieces };
}

// ---------------------------------------------------------------------------
// Motion

// progress: 0..1 through the painting's time on the wall.
export function elementState(el, time, progress, motion = 1) {
  const amt = (el.amount ?? 1) * motion;
  if (el.type === 'approach') {
    // Perspective approach along the line from the vanishing point through
    // the element: screen position V + (P - V) * s, with s = 1 / depth.
    const period = Math.max(2, el.period / Math.max(0.15, amt));
    const u = (((time / period + (el.phase || 0)) % 1) + 1) % 1;
    const zFar = Math.max(1.05, el.zFar);
    const zNear = clamp(el.zNear, 0.1, 0.95);
    const s = (1 / zFar) * (zFar / zNear) ** u;
    const ds = (s * Math.log(zFar / zNear)) / period;
    let bx = (el.x - el.vx) * ds * 0.08;
    let by = (el.y - el.vy) * ds * 0.08;
    const bl = Math.hypot(bx, by);
    if (bl > 0.05) {
      bx *= 0.05 / bl;
      by *= 0.05 / bl;
    }
    return {
      offset: [(el.x - el.vx) * (s - 1), (el.y - el.vy) * (s - 1)],
      scale: s,
      rot: 0,
      alpha: smoothstep(0, 0.12, u) * (1 - smoothstep(0.86, 1, u)),
      blur: [bx, by],
      pivot: [0, 0],
    };
  }
  const w = (Math.PI * 2) / Math.max(1, el.period);
  if (el.type === 'pulse') {
    return {
      offset: [0, 0],
      scale: 1 + Math.sin(time * w) * el.pulse * amt,
      rot: 0,
      alpha: 1,
      blur: [0, 0],
      pivot: [0, 0],
    };
  }
  const travel = el.type === 'rise' ? progress : progress - 0.5;
  return {
    offset: [travel * el.dx * amt, travel * el.dy * amt + Math.sin(time * w) * el.bob * amt],
    scale: 1,
    rot: Math.sin(time * w * 0.9 + 1.3) * el.rock * amt,
    alpha: 1,
    blur: [0, 0],
    pivot: [0, (el.pivot ?? 0) * el.ry],
  };
}
