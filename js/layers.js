// Layer separation: sky, water and land.
//
// The studio splits every painting into planes (skies, water, foliage and
// ground, figures, texture) so each part can move on its own. Here the split
// is estimated from the painting:
//   - a colour and texture model is learnt for the sky from the top of the
//     canvas, and for the water from the band just below the horizon
//   - every pixel is scored against those models; what neither explains is
//     land (cliffs, banks, bridges, buildings, foliage)
//   - water has to sit below the horizon and is favoured where the
//     strokes run horizontally, as Turner paints reflections
//   - land above the horizon has to be connected to the ground, so a dark
//     storm cloud stays in the sky and a castle on its hill does not
//   - each layer gets a "fill": the layer continued behind the others, so
//     when the layers slide apart in parallax there is paint behind them
// Figures are the cut-out moving elements (elements.js). The brush texture
// is animated separately in the shader.

import { boxBlur } from './analysis.js';
import { pushPull } from './elements.js';

const FEATURES = 4;

function fitModel(feats, select, n) {
  const mean = new Float64Array(FEATURES);
  const varr = new Float64Array(FEATURES);
  let count = 0;
  for (let i = 0; i < n; i++) {
    if (!select(i)) continue;
    count++;
    for (let f = 0; f < FEATURES; f++) mean[f] += feats[i * FEATURES + f];
  }
  if (!count) return null;
  for (let f = 0; f < FEATURES; f++) mean[f] /= count;
  for (let i = 0; i < n; i++) {
    if (!select(i)) continue;
    for (let f = 0; f < FEATURES; f++) varr[f] += (feats[i * FEATURES + f] - mean[f]) ** 2;
  }
  // Variance floors keep a flat sky from rejecting every faint variation.
  const floors = [0.004, 0.0015, 0.0015, 0.01];
  for (let f = 0; f < FEATURES; f++) varr[f] = Math.max(floors[f], varr[f] / count);
  return { mean, varr };
}

function distance(feats, i, model) {
  let d = 0;
  for (let f = 0; f < FEATURES; f++) d += (feats[i * FEATURES + f] - model.mean[f]) ** 2 / model.varr[f];
  return d / FEATURES;
}

export function segmentLayers(analysis, { horizon, water, landAbove = true }) {
  const { width: W, height: H, px, energy, ana } = analysis;
  const N = W * H;
  const hasWater = water > 0.05;

  const lum = new Float32Array(N);
  const opA = new Float32Array(N);
  const opB = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const r = px[i * 4] / 255;
    const g = px[i * 4 + 1] / 255;
    const b = px[i * 4 + 2] / 255;
    lum[i] = 0.299 * r + 0.587 * g + 0.114 * b;
    opA[i] = r - g;
    opB[i] = 0.5 * (r + g) - b;
  }
  const feats = new Float32Array(N * FEATURES);
  const smooth = [lum, opA, opB, energy].map((ch) => boxBlur(boxBlur(ch, W, H, 1), W, H, 1));
  for (let i = 0; i < N; i++) for (let f = 0; f < FEATURES; f++) feats[i * FEATURES + f] = smooth[f][i];

  const yOf = (i) => (Math.floor(i / W) + 0.5) / H;
  const xOf = (i) => ((i % W) + 0.5) / W;
  const hRow = Math.min(H - 1, Math.max(0, Math.floor(horizon * H)));

  // Turner's skies change mostly with height (blue overhead, gold at the
  // horizon), so the sky is modelled row by row: the median colour of each
  // row above the horizon, with a spread taken from the top of the canvas.
  const skyTop = horizon > 0.3 ? Math.min(0.22, horizon - 0.12) : horizon * 0.6;
  const topModel = fitModel(feats, (i) => yOf(i) < skyTop, N) ?? fitModel(feats, (i) => yOf(i) < horizon, N);
  const rowMed = new Float32Array(H * FEATURES);
  const rowScale = new Float32Array(H * FEATURES);
  const tmp = new Float32Array(W);
  const floors = [0.06, 0.035, 0.035, 0.1];
  for (let y = 0; y <= hRow; y++) {
    for (let f = 0; f < FEATURES; f++) {
      for (let x = 0; x < W; x++) tmp[x] = feats[(y * W + x) * FEATURES + f];
      tmp.sort();
      const med = tmp[W >> 1];
      let mad = 0;
      for (let x = 0; x < W; x++) mad += Math.abs(tmp[x] - med);
      mad /= W;
      rowMed[y * FEATURES + f] = med;
      const global = topModel ? Math.sqrt(topModel.varr[f]) * 0.6 : 0;
      rowScale[y * FEATURES + f] = Math.max(floors[f], mad * 1.25, global);
    }
  }
  const skyDistance = (i) => {
    const y = Math.min(Math.floor(i / W), hRow);
    let d = 0;
    for (let f = 0; f < FEATURES; f++) d += ((feats[i * FEATURES + f] - rowMed[y * FEATURES + f]) / rowScale[y * FEATURES + f]) ** 2;
    return d / FEATURES;
  };

  // Water is learnt from the calm part of the band below the horizon:
  // smooth, horizontally stroked pixels of the band's own tone, which keeps
  // a viaduct or a dark boat out of the model.
  let wat = null;
  if (hasWater) {
    const y0 = horizon + 0.05;
    const y1 = Math.min(0.97, horizon + 0.3);
    const band = [];
    for (let i = 0; i < N; i++) {
      const y = yOf(i);
      const x = xOf(i);
      if (y > y0 && y < y1 && x > 0.1 && x < 0.9) band.push(i);
    }
    if (band.length) {
      const lums = band.map((i) => feats[i * FEATURES]).sort((a, b) => a - b);
      const ens = band.map((i) => feats[i * FEATURES + 3]).sort((a, b) => a - b);
      const lumMed = lums[lums.length >> 1];
      const enCut = ens[Math.floor(ens.length * 0.65)];
      const calm = new Uint8Array(N);
      for (const i of band) {
        if (Math.abs(feats[i * FEATURES] - lumMed) < 0.16 && feats[i * FEATURES + 3] <= enCut) calm[i] = 1;
      }
      wat = fitModel(feats, (i) => calm[i] === 1, N) ?? fitModel(feats, (i) => band.includes(i), N);
    }
  }

  // Energies: lower is more likely. Land is whatever the others fail to
  // explain, so it has a constant cost.
  const pSky = new Float32Array(N);
  const pWater = new Float32Array(N);
  const pLand = new Float32Array(N);
  const temp = 0.7;
  for (let i = 0; i < N; i++) {
    const y = yOf(i);
    const below = y - horizon;
    const eSky = skyDistance(i) + (below > 0.02 ? 3 + below * 25 : 0);
    let eWater = Number.POSITIVE_INFINITY;
    if (wat) {
      const c2 = ana[i * 4] / 127.5 - 1;
      const horiz = Math.max(0, c2) * (ana[i * 4 + 2] / 255);
      eWater = distance(feats, i, wat) - horiz * 0.8 + (below < -0.01 ? 40 : 0);
    }
    const eLand = 2.4 + (below < 0 ? 0.8 : 0) - (!hasWater && below > 0.03 ? 1.5 : 0);
    const a = Math.exp(-eSky / temp);
    const b = Number.isFinite(eWater) ? Math.exp(-eWater / temp) : 0;
    const c = Math.exp(-eLand / temp);
    const sum = a + b + c + 1e-12;
    pSky[i] = a / sum;
    pWater[i] = b / sum;
    pLand[i] = c / sum;
  }

  // Land above the horizon must stand on the ground or on the water (a
  // castle on its hill, a ship); otherwise it is sky (a dark cloud, a storm
  // arc).
  const reached = new Uint8Array(N);
  const queue = new Int32Array(N);
  let head = 0;
  let tail = 0;
  for (let i = hRow * W; i < N; i++) {
    if (pLand[i] > 0.45 || pWater[i] > 0.45) {
      reached[i] = 1;
      queue[tail++] = i;
    }
  }
  while (head < tail) {
    const i = queue[head++];
    const x = i % W;
    const nbrs = [i - W, i + W, x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1];
    for (const j of nbrs) {
      if (j < 0 || j >= N || reached[j] || pLand[j] < 0.45) continue;
      reached[j] = 1;
      queue[tail++] = j;
    }
  }
  for (let i = 0; i < N; i++) {
    if (pLand[i] > 0.2 && (!reached[i] || !landAbove) && yOf(i) < horizon + 0.02) {
      pSky[i] += pLand[i];
      pLand[i] = 0;
    }
  }

  // Soften, renormalise and pack.
  const r = Math.max(1, Math.round(Math.min(W, H) / 160));
  const sS = boxBlur(boxBlur(pSky, W, H, r), W, H, r);
  const sW = boxBlur(boxBlur(pWater, W, H, r), W, H, r);
  const sL = boxBlur(boxBlur(pLand, W, H, r), W, H, r);
  const masks = new Uint8Array(N * 4);
  const wSky = new Float32Array(N);
  const wWater = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const sum = sS[i] + sW[i] + sL[i] + 1e-6;
    masks[i * 4] = Math.round((sS[i] / sum) * 255);
    masks[i * 4 + 1] = Math.round((sW[i] / sum) * 255);
    masks[i * 4 + 2] = Math.round((sL[i] / sum) * 255);
    masks[i * 4 + 3] = 255;
    wSky[i] = (sS[i] / sum) ** 2;
    wWater[i] = (sW[i] / sum) ** 2;
  }

  // Each layer continued behind the others.
  const rgb = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    rgb[i * 3] = px[i * 4];
    rgb[i * 3 + 1] = px[i * 4 + 1];
    rgb[i * 3 + 2] = px[i * 4 + 2];
  }
  const pack = (fill) => {
    const out = new Uint8Array(N * 4);
    for (let i = 0; i < N; i++) {
      out[i * 4] = fill[i * 3];
      out[i * 4 + 1] = fill[i * 3 + 1];
      out[i * 4 + 2] = fill[i * 3 + 2];
      out[i * 4 + 3] = 255;
    }
    return out;
  };
  const skyFill = pack(pushPull(rgb, wSky, W, H, 3));
  const waterFill = hasWater ? pack(pushPull(rgb, wWater, W, H, 3)) : skyFill;

  return { width: W, height: H, masks, skyFill, waterFill, hasWater };
}
