// CPU analysis of a painting. This is the step that replaces the hand
// rotoscoping done by the studio: instead of cutting layers by hand, we
// estimate what the renderer needs directly from the pixels.
//
//   orientation  brushstroke direction from the smoothed structure tensor,
//                stored as a doubled angle so it filters without sign flips
//   coherence    how strongly the strokes agree locally (0..1)
//   LIC          line-integral-convolution of noise along the strokes; a
//                grayscale "stroke map" used for paint-in reveals
//   depth        pseudo depth (Turner's aerial perspective: bright, hazy and
//                high = far; dark, contrasty and low = near) for parallax
//   sun          brightest diffuse spot, the light source of the scene
//   horizon      strongest horizontal luminance break in the middle band

const MAX_DIM = 384;

export function boxBlur(src, w, h, r) {
  if (r < 1) return src.slice();
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  const norm = 1 / (2 * r + 1);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let acc = 0;
    for (let k = -r; k <= r; k++) acc += src[row + Math.min(w - 1, Math.max(0, k))];
    for (let x = 0; x < w; x++) {
      tmp[row + x] = acc * norm;
      const add = src[row + Math.min(w - 1, x + r + 1)];
      const sub = src[row + Math.max(0, x - r)];
      acc += add - sub;
    }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let k = -r; k <= r; k++) acc += tmp[Math.min(h - 1, Math.max(0, k)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = acc * norm;
      const add = tmp[Math.min(h - 1, y + r + 1) * w + x];
      const sub = tmp[Math.max(0, y - r) * w + x];
      acc += add - sub;
    }
  }
  return out;
}

function gaussianish(src, w, h, r) {
  return boxBlur(boxBlur(src, w, h, r), w, h, r);
}

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function analysePainting(source) {
  const sw = source.naturalWidth || source.videoWidth || source.width;
  const sh = source.naturalHeight || source.videoHeight || source.height;
  const scale = MAX_DIM / Math.max(sw, sh);
  const W = Math.max(16, Math.round(sw * scale));
  const H = Math.max(16, Math.round(sh * scale));
  const N = W * H;

  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  cx.drawImage(source, 0, 0, W, H);
  const px = cx.getImageData(0, 0, W, H).data;

  const lum = new Float32Array(N);
  const sat = new Float32Array(N);
  const warm = new Float32Array(N);
  let warmCount = 0;
  let lumSum = 0;
  for (let i = 0; i < N; i++) {
    const r = px[i * 4] / 255;
    const g = px[i * 4 + 1] / 255;
    const b = px[i * 4 + 2] / 255;
    const l = 0.299 * r + 0.587 * g + 0.114 * b;
    lum[i] = l;
    sat[i] = Math.max(r, g, b) - Math.min(r, g, b);
    warm[i] = r - b;
    lumSum += l;
    if (r - b > 0.25 && l > 0.45) warmCount++;
  }
  const meanLum = lumSum / N;

  // Structure tensor of the lightly blurred luminance.
  const L = boxBlur(lum, W, H, 1);
  const jxx = new Float32Array(N);
  const jyy = new Float32Array(N);
  const jxy = new Float32Array(N);
  for (let y = 0; y < H; y++) {
    const ym = Math.max(0, y - 1) * W;
    const y0 = y * W;
    const yp = Math.min(H - 1, y + 1) * W;
    for (let x = 0; x < W; x++) {
      const xm = Math.max(0, x - 1);
      const xp = Math.min(W - 1, x + 1);
      const gx =
        L[ym + xp] + 2 * L[y0 + xp] + L[yp + xp] - L[ym + xm] - 2 * L[y0 + xm] - L[yp + xm];
      const gy =
        L[yp + xm] + 2 * L[yp + x] + L[yp + xp] - L[ym + xm] - 2 * L[ym + x] - L[ym + xp];
      const i = y0 + x;
      jxx[i] = gx * gx;
      jyy[i] = gy * gy;
      jxy[i] = gx * gy;
    }
  }
  const sr = Math.max(2, Math.round(MAX_DIM / 90));
  const sxx = gaussianish(jxx, W, H, sr);
  const syy = gaussianish(jyy, W, H, sr);
  const sxy = gaussianish(jxy, W, H, sr);

  let energySum = 0;
  for (let i = 0; i < N; i++) energySum += sxx[i] + syy[i];
  const meanEnergy = energySum / N + 1e-6;

  const tx = new Float32Array(N);
  const ty = new Float32Array(N);
  const ana = new Uint8Array(N * 4);
  for (let i = 0; i < N; i++) {
    const a = sxx[i] - syy[i];
    const b = 2 * sxy[i];
    const diff = Math.sqrt(a * a + b * b);
    const trace = sxx[i] + syy[i] + 1e-9;
    let c2 = 0;
    let s2 = 0;
    if (diff > 1e-9) {
      c2 = a / diff;
      s2 = b / diff;
    }
    // Gradient angle phi; strokes run along the tangent phi + 90deg.
    const phi = 0.5 * Math.atan2(s2, c2);
    tx[i] = -Math.sin(phi);
    ty[i] = Math.cos(phi);
    const coherence = diff / trace;
    const energy = Math.min(1, trace / (meanEnergy * 1.5));
    const conf = Math.pow(coherence, 0.8) * Math.sqrt(energy);
    // Doubled tangent angle = 2*phi + pi, so both components flip sign.
    ana[i * 4] = Math.round((0.5 - 0.5 * c2) * 255);
    ana[i * 4 + 1] = Math.round((0.5 - 0.5 * s2) * 255);
    ana[i * 4 + 2] = Math.round(Math.min(1, conf) * 255);
  }

  // Line integral convolution: smear 2x2 block noise along the strokes.
  const rand = rng(1851);
  const noise = new Float32Array(N);
  for (let y = 0; y < H; y += 2) {
    for (let x = 0; x < W; x += 2) {
      const v = rand();
      for (let dy = 0; dy < 2 && y + dy < H; dy++) {
        for (let dx = 0; dx < 2 && x + dx < W; dx++) noise[(y + dy) * W + x + dx] = v;
      }
    }
  }
  const STEPS = 14;
  const lic = new Float32Array(N);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      let sum = noise[i];
      let wsum = 1;
      for (let dir = -1; dir <= 1; dir += 2) {
        let pxp = x + 0.5;
        let pyp = y + 0.5;
        let dx = tx[i] * dir;
        let dy = ty[i] * dir;
        for (let s = 1; s <= STEPS; s++) {
          pxp += dx;
          pyp += dy;
          const ix = pxp | 0;
          const iy = pyp | 0;
          if (ix < 0 || iy < 0 || ix >= W || iy >= H) break;
          const j = iy * W + ix;
          let ndx = tx[j];
          let ndy = ty[j];
          if (ndx * dx + ndy * dy < 0) {
            ndx = -ndx;
            ndy = -ndy;
          }
          dx = ndx;
          dy = ndy;
          const wgt = 1 - s / (STEPS + 1);
          sum += noise[j] * wgt;
          wsum += wgt;
        }
      }
      lic[i] = sum / wsum;
    }
  }
  let mean = 0;
  for (let i = 0; i < N; i++) mean += lic[i];
  mean /= N;
  let variance = 0;
  for (let i = 0; i < N; i++) variance += (lic[i] - mean) ** 2;
  const std = Math.sqrt(variance / N) + 1e-6;
  for (let i = 0; i < N; i++) {
    const v = 0.5 + (lic[i] - mean) / (std * 4.5);
    ana[i * 4 + 3] = Math.round(Math.min(1, Math.max(0, v)) * 255);
  }

  // Pseudo depth from aerial perspective.
  const lb = gaussianish(lum, W, H, 3);
  const lsq = new Float32Array(N);
  for (let i = 0; i < N; i++) lsq[i] = lum[i] * lum[i];
  const lsqb = gaussianish(lsq, W, H, 3);
  const satb = gaussianish(sat, W, H, 3);
  const rawDepth = new Float32Array(N);
  for (let y = 0; y < H; y++) {
    const yn = y / (H - 1);
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const contrast = Math.sqrt(Math.max(0, lsqb[i] - lb[i] * lb[i])) * 4;
      const haze = lb[i] * (1 - satb[i] * 0.8);
      rawDepth[i] = 0.55 * Math.pow(yn, 1.4) + 0.3 * (1 - haze) + 0.15 * Math.min(1, contrast);
    }
  }
  const depthB = gaussianish(rawDepth, W, H, Math.round(MAX_DIM / 40));
  let dmin = Number.POSITIVE_INFINITY;
  let dmax = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < N; i++) {
    dmin = Math.min(dmin, depthB[i]);
    dmax = Math.max(dmax, depthB[i]);
  }
  const depth = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    depth[i] = Math.round(((depthB[i] - dmin) / (dmax - dmin + 1e-6)) * 255);
  }

  // Light source: brightest diffuse region, slightly favouring the sky.
  const glow = gaussianish(lum, W, H, Math.max(2, Math.round(W * 0.03)));
  let best = -1;
  let sunI = 0;
  for (let y = 0; y < H; y++) {
    const bias = 1 - 0.25 * (y / H);
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const edge = Math.min(x, W - 1 - x, y, H - 1 - y) < W * 0.03 ? 0.85 : 1;
      const score = glow[i] * bias * edge;
      if (score > best) {
        best = score;
        sunI = i;
      }
    }
  }
  const sunX = ((sunI % W) + 0.5) / W;
  const sunY = (Math.floor(sunI / W) + 0.5) / H;
  const sp = sunI * 4;
  const sunRgb = [px[sp], px[sp + 1], px[sp + 2]];

  // Horizon: strongest smoothed change in row brightness.
  const rows = new Float32Array(H);
  for (let y = 0; y < H; y++) {
    let s = 0;
    for (let x = 0; x < W; x++) s += lb[y * W + x];
    rows[y] = s / W;
  }
  let hBest = 0;
  let hY = Math.round(H * 0.62);
  let dSum = 0;
  let dCount = 0;
  const k = Math.max(2, Math.round(H * 0.02));
  for (let y = Math.round(H * 0.35); y < Math.round(H * 0.82); y++) {
    const d = Math.abs(rows[Math.min(H - 1, y + k)] - rows[Math.max(0, y - k)]);
    const score = d * (1 - Math.abs(y / H - 0.6) * 0.8);
    dSum += d;
    dCount++;
    if (score > hBest) {
      hBest = score;
      hY = y;
    }
  }
  const hConfidence = hBest / (dSum / Math.max(1, dCount) + 1e-6);
  const horizon = hConfidence > 1.6 ? hY / H : 0.62;

  return {
    width: W,
    height: H,
    ana,
    depth,
    sun: { x: sunX, y: sunY, strength: best, rgb: sunRgb },
    horizon: { y: horizon, confidence: hConfidence },
    stats: { meanLum, warmFraction: warmCount / N },
    aspect: sw / sh,
    lum: lb,
    px,
    energy: Float32Array.from(sxx, (v, i) => Math.min(1, (v + syy[i]) / (meanEnergy * 3))),
  };
}

function toHex(rgb) {
  return `#${rgb.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`;
}

// A sensible starting score for a painting nobody has tuned yet.
export function autoRecipe(analysis) {
  const { sun, horizon, stats } = analysis;
  const light = sun.rgb.map((v) => v * 0.45 + 255 * 0.55);
  const fiery = stats.warmFraction > 0.05;
  return {
    flow: 0.5,
    flowSpeed: 0.12,
    wind: 0.3,
    windAngle: fiery ? -70 : 0,
    vortex: 0,
    vortexX: sun.x,
    vortexY: sun.y,
    sunX: sun.x,
    sunY: sun.y,
    sunColor: toHex(light),
    glow: Math.min(0.9, Math.max(0.25, (sun.strength - 0.45) * 1.8)),
    rays: 0.35,
    horizon: horizon.y,
    water: horizon.confidence > 2.2 ? 0.45 : 0.15,
    mist: 0.35,
    fire: fiery ? 0.5 : 0,
    embers: stats.warmFraction > 0.08 ? 0.4 : 0,
    focusX: sun.x,
    focusY: sun.y,
    zoom: 1.3,
    transition: 'brush',
    mood: fiery ? 'fire' : stats.meanLum > 0.55 ? 'dawn' : 'warm',
  };
}

// Fill 'auto' / 'sun' placeholders of a recipe from the analysis.
export function resolveRecipe(recipe, analysis) {
  const r = { ...recipe };
  if (r.sunX === 'auto' || r.sunX == null) r.sunX = analysis.sun.x;
  if (r.sunY === 'auto' || r.sunY == null) r.sunY = analysis.sun.y;
  if (r.horizon === 'auto' || r.horizon == null) r.horizon = analysis.horizon.y;
  if (r.vortexX === 'sun') r.vortexX = r.sunX;
  if (r.vortexY === 'sun') r.vortexY = r.sunY;
  if (r.focusX === 'sun') r.focusX = r.sunX;
  if (r.focusY === 'sun') r.focusY = r.sunY;
  return r;
}
