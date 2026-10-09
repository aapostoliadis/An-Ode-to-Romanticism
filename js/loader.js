// Image loading with graceful fallbacks, plus the procedural "study" painter
// used when a reproduction cannot be fetched.

export function loadImage(url, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    const timer = setTimeout(() => {
      img.src = '';
      reject(new Error(`Timed out loading ${url}`));
    }, timeout);
    img.onload = () => {
      clearTimeout(timer);
      resolve(img);
    };
    img.onerror = () => {
      clearTimeout(timer);
      reject(new Error(`Could not load ${url}`));
    };
    img.src = url;
  });
}

export async function loadFirst(urls) {
  let lastError = null;
  for (const url of urls) {
    try {
      return await loadImage(url);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError ?? new Error('No image URL to load');
}

// Large sources are resampled once so every texture fits the GPU budget.
export function fitSource(source, maxDim) {
  const w = source.naturalWidth || source.width;
  const h = source.naturalHeight || source.height;
  const scale = Math.min(1, maxDim / Math.max(w, h));
  if (scale >= 1) return source;
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.round(w * scale));
  cv.height = Math.max(1, Math.round(h * scale));
  // CPU-backed, since analysis and element cutting read the pixels back.
  const cx = cv.getContext('2d', { willReadFrequently: true });
  cx.imageSmoothingQuality = 'high';
  cx.drawImage(source, 0, 0, cv.width, cv.height);
  return cv;
}

// ---------------------------------------------------------------------------
// Procedural study painter. It lays down the composition with gradients and
// simple motifs, then repaints the whole canvas with thousands of oriented
// strokes, so the analysis and animation have real brushwork to follow.

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

function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function hexToRgb(hex) {
  const v = Number.parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

function rgba(hex, a) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

function linear(ctx, x0, y0, x1, y1, stops) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
}

function softEllipse(ctx, cx, cy, rx, ry, color, alpha) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(1, ry / rx);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
  g.addColorStop(0, rgba(color, alpha));
  g.addColorStop(0.6, rgba(color, alpha * 0.6));
  g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, rx, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

const MOTIFS = {
  ship(ctx, m, W, H) {
    const h = m.s * H;
    const w = h * 0.95;
    ctx.save();
    ctx.translate(m.x * W, m.y * H);
    ctx.rotate(m.tilt ?? 0);
    ctx.fillStyle = rgba(m.color, 0.92);
    ctx.beginPath();
    ctx.moveTo(-w * 0.5, -h * 0.08);
    ctx.lineTo(w * 0.48, -h * 0.1);
    ctx.lineTo(w * 0.38, h * 0.06);
    ctx.lineTo(-w * 0.42, h * 0.05);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = rgba(m.color, 0.85);
    const masts = [
      [-0.26, 0.78],
      [0.0, 0.92],
      [0.24, 0.72],
    ];
    for (const [ox, mh] of masts) {
      const x = ox * w;
      ctx.lineWidth = Math.max(1, w * 0.012);
      ctx.beginPath();
      ctx.moveTo(x, -h * 0.08);
      ctx.lineTo(x, -h * mh);
      ctx.stroke();
      for (let k = 1; k <= 4; k++) {
        const y = -h * 0.08 - (h * mh - h * 0.08) * (k / 4.6);
        const half = w * (0.13 - k * 0.022);
        if (m.sails) {
          ctx.fillStyle = rgba(m.sails, 0.75);
          ctx.fillRect(x - half, y, half * 2, h * 0.11);
        }
        ctx.lineWidth = Math.max(1, w * 0.008);
        ctx.beginPath();
        ctx.moveTo(x - half, y);
        ctx.lineTo(x + half, y);
        ctx.stroke();
      }
    }
    ctx.restore();
  },
  tug(ctx, m, W, H) {
    const h = m.s * H;
    const x = m.x * W;
    const y = m.y * H;
    ctx.fillStyle = rgba(m.color, 0.95);
    ctx.beginPath();
    ctx.moveTo(x - h * 0.9, y - h * 0.15);
    ctx.lineTo(x + h * 0.9, y - h * 0.2);
    ctx.lineTo(x + h * 0.7, y + h * 0.15);
    ctx.lineTo(x - h * 0.75, y + h * 0.12);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(x - h * 0.08, y - h * 0.95, h * 0.16, h * 0.8);
    for (let k = 0; k < 7; k++) {
      softEllipse(ctx, x - k * h * 0.15, y - h * (1.05 + k * 0.38), h * (0.25 + k * 0.08), h * 0.2, '#2e2620', 0.55 - k * 0.05);
    }
    softEllipse(ctx, x + h * 0.2, y + h * 0.05, h * 0.18, h * 0.12, '#f08a30', 0.8);
  },
  castle(ctx, m, W, H) {
    const s = m.s * H;
    const x = m.x * W;
    const y = m.y * H;
    ctx.fillStyle = rgba(m.color, 0.85);
    ctx.beginPath();
    ctx.ellipse(x, y + s * 0.15, s * 1.6, s * 0.45, 0, Math.PI, 0);
    ctx.fill();
    ctx.fillRect(x - s * 0.35, y - s * 0.75, s * 0.7, s * 0.8);
    ctx.fillRect(x + s * 0.25, y - s * 0.45, s * 0.35, s * 0.5);
    for (let k = 0; k < 4; k++) ctx.fillRect(x - s * 0.35 + k * s * 0.2, y - s * 0.86, s * 0.1, s * 0.12);
    softEllipse(ctx, x, y + s * 0.6, s * 1.4, s * 0.25, m.color, 0.35);
  },
  fire(ctx, m, W, H) {
    const s = m.s * H;
    const x = m.x * W;
    const y = m.y * H;
    for (let k = 0; k < 9; k++) {
      const yy = y - s * (0.1 + k * 0.17);
      const r = s * (0.55 - k * 0.04);
      softEllipse(ctx, x + Math.sin(k * 1.7) * s * 0.12, yy, r, r * 0.8, k < 3 ? '#fff0a0' : k < 6 ? '#f6a33a' : '#c2502a', 0.7);
    }
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = linear(ctx, x, y, x, y + s * 1.3, [
      [0, 'rgba(255,200,90,0.75)'],
      [1, 'rgba(255,120,40,0)'],
    ]);
    ctx.fillRect(x - s * 0.22, y, s * 0.44, s * 1.3);
    ctx.restore();
  },
  bridge(ctx, m, W, H) {
    const x0 = m.x * W;
    const y0 = m.y * H;
    const x1 = m.x1 * W;
    const y1 = m.y1 * H;
    const t0 = m.s * H * 0.25;
    const t1 = m.s * H;
    ctx.fillStyle = rgba(m.color, 0.9);
    ctx.beginPath();
    ctx.moveTo(x0, y0 - t0);
    ctx.lineTo(x1, y1 - t1);
    ctx.lineTo(x1, y1 + t1 * 1.8);
    ctx.lineTo(x0, y0 + t0 * 1.8);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(214,190,140,0.55)';
    for (let k = 0; k < 7; k++) {
      const t = (k + 0.5) / 7;
      const ax = x0 + (x1 - x0) * t;
      const ay = y0 + (y1 - y0) * t;
      const th = t0 + (t1 - t0) * t;
      ctx.beginPath();
      ctx.ellipse(ax, ay + th * 1.8, th * 1.6, th * 1.3, 0, Math.PI, 0);
      ctx.fill();
    }
  },
  // The locomotive lies along its track (angle, clockwise), its chimney and
  // glowing front toward the viewer, steam trailing back along the line.
  train(ctx, m, W, H) {
    const s = m.s * H;
    const x = m.x * W;
    const y = m.y * H;
    const a = ((m.angle ?? 0) * Math.PI) / 180;
    for (let k = 0; k < 6; k++) {
      const d = -s * (0.6 + k * 0.55);
      softEllipse(ctx, x + Math.cos(a) * d, y + Math.sin(a) * d - s * (0.9 + k * 0.12), s * (0.45 + k * 0.15), s * 0.3, '#ece4d0', 0.45);
    }
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    ctx.fillStyle = rgba(m.color, 0.95);
    ctx.fillRect(-s * 0.65, -s * 0.35, s * 1.45, s * 0.6);
    ctx.fillRect(s * 0.5, -s * 0.45, s * 0.45, s * 0.8);
    ctx.restore();
    // The chimney stays upright, at the front.
    const cx = x + Math.cos(a) * s * 0.7;
    const cy = y + Math.sin(a) * s * 0.7;
    ctx.fillStyle = rgba(m.color, 0.95);
    ctx.fillRect(cx - s * 0.08, cy - s * 0.95, s * 0.16, s * 0.6);
    softEllipse(ctx, x + Math.cos(a) * s * 0.85, y + Math.sin(a) * s * 0.85 + s * 0.15, s * 0.22, s * 0.16, '#ff8a4a', 0.9);
  },
  steamboat(ctx, m, W, H) {
    const s = m.s * H;
    const x = m.x * W;
    const y = m.y * H;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-0.18);
    ctx.fillStyle = rgba(m.color, 0.95);
    ctx.beginPath();
    ctx.moveTo(-s * 0.9, -s * 0.05);
    ctx.lineTo(s * 0.8, -s * 0.12);
    ctx.lineTo(s * 0.6, s * 0.18);
    ctx.lineTo(-s * 0.7, s * 0.16);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(-s * 0.04, -s * 1.6, s * 0.06, s * 1.55);
    ctx.fillRect(s * 0.25, -s * 0.6, s * 0.16, s * 0.55);
    ctx.restore();
    softEllipse(ctx, x + s * 0.5, y - s * 0.1, s * 0.12, s * 0.1, '#f6e2a0', 0.9);
  },
};

export function paintStudy(spec, width = 1600, seedKey = 'turner', options = {}) {
  const aspect = spec.aspect ?? 4 / 3;
  const W = Math.round(width);
  const H = Math.round(width / aspect);
  const base = document.createElement('canvas');
  base.width = W;
  base.height = H;
  const b = base.getContext('2d', { willReadFrequently: true });
  const sunX = spec.sun.x * W;
  const sunY = spec.sun.y * H;

  if (spec.radial) {
    const g = b.createRadialGradient(sunX, sunY, 0, sunX, sunY, Math.hypot(W, H) * 0.6);
    for (const [o, c] of spec.radial) g.addColorStop(o, c);
    b.fillStyle = g;
  } else {
    b.fillStyle = linear(b, 0, 0, 0, H, spec.sky);
  }
  b.fillRect(0, 0, W, H);

  if (spec.sea) {
    const hy = spec.horizon * H;
    b.fillStyle = linear(b, 0, hy, 0, H, spec.sea);
    b.fillRect(0, hy, W, H - hy);
  }

  softEllipse(b, sunX, sunY, spec.sun.halo * W, spec.sun.halo * W * 0.75, spec.sun.color, 0.45);
  for (const m of spec.masses ?? []) softEllipse(b, m.x * W, m.y * H, m.rx * W, m.ry * W, m.color, m.alpha);
  for (const a of spec.arcs ?? []) {
    b.save();
    b.strokeStyle = rgba(a.color, a.alpha);
    b.lineCap = 'round';
    for (let k = 0; k < 6; k++) {
      b.lineWidth = a.width * W * (1 - k * 0.12);
      b.beginPath();
      b.arc(a.x * W, a.y * H, a.r * W * (1 + k * 0.03), a.from + k * 0.05, a.to - k * 0.05);
      b.stroke();
    }
    b.restore();
  }
  for (const m of spec.motifs ?? []) MOTIFS[m.type]?.(b, m, W, H);
  softEllipse(b, sunX, sunY, spec.sun.r * W, spec.sun.r * W, spec.sun.color, 1);

  const out = document.createElement('canvas');
  out.width = W;
  out.height = H;
  const o = out.getContext('2d', { willReadFrequently: true });
  o.drawImage(base, 0, 0);
  const px = b.getImageData(0, 0, W, H).data;
  const rand = rng(hashString(seedKey));
  const count = options.strokes ?? Math.round((W * H) / 150);
  const unit = W / 1600;
  const windRad = ((spec.wind ?? 0) * Math.PI) / 180;
  const sw = spec.swirl;
  for (let k = 0; k < count; k++) {
    const x = rand() * W;
    const y = rand() * H;
    let ang = windRad + (rand() - 0.5) * 0.5;
    if (sw) {
      const dx = (x - sw.x * W) / W;
      const dy = (y - sw.y * H) / W;
      const r = Math.hypot(dx, dy);
      const fall = Math.exp(-(r * r) / 0.12) * sw.strength;
      const tang = Math.atan2(dy, dx) + Math.PI / 2 + 0.25;
      const blend = Math.min(1, fall * 1.5);
      ang = Math.atan2(
        Math.sin(ang) * (1 - blend) + Math.sin(tang) * blend,
        Math.cos(ang) * (1 - blend) + Math.cos(tang) * blend,
      );
    }
    if (spec.sea && y > spec.horizon * H) ang = (rand() - 0.5) * 0.25;
    const i = ((y | 0) * W + (x | 0)) * 4;
    const j = (rand() - 0.5) * 22;
    const r = Math.min(255, Math.max(0, px[i] + j));
    const g = Math.min(255, Math.max(0, px[i + 1] + j));
    const bl = Math.min(255, Math.max(0, px[i + 2] + j * 0.8));
    const len = (7 + rand() * 26) * unit;
    const wid = (1.6 + rand() * 4.2) * unit;
    o.setTransform(Math.cos(ang), Math.sin(ang), -Math.sin(ang), Math.cos(ang), x, y);
    o.globalAlpha = 0.3 + rand() * 0.4;
    o.fillStyle = `rgb(${r | 0},${g | 0},${bl | 0})`;
    o.beginPath();
    o.ellipse(0, 0, len, wid, 0, 0, Math.PI * 2);
    o.fill();
  }
  o.setTransform(1, 0, 0, 1, 0, 0);
  o.globalAlpha = 1;
  o.globalCompositeOperation = 'lighter';
  softEllipse(o, sunX, sunY, spec.sun.r * W * 2.2, spec.sun.r * W * 2.2, spec.sun.color, 0.35);
  o.globalCompositeOperation = 'source-over';
  return out;
}
