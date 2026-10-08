import { TRANSITIONS } from './paintings.js';

const MOOD_OPTIONS = [
  { id: 'dawn', label: 'Dawn, airy' },
  { id: 'myth', label: 'Myth, golden' },
  { id: 'warm', label: 'Warm sunset' },
  { id: 'tragic', label: 'Tragic sea' },
  { id: 'storm', label: 'Storm wind' },
  { id: 'fire', label: 'Fire crackle' },
  { id: 'speed', label: 'Rain and rhythm' },
  { id: 'radiant', label: 'Radiant light' },
];

export const CONTROL_GROUPS = [
  {
    title: 'Motion',
    items: [
      { key: 'flow', label: 'Brushstroke flow', min: 0, max: 1.5, step: 0.01 },
      { key: 'flowSpeed', label: 'Flow speed', min: 0.02, max: 0.5, step: 0.01 },
      { key: 'flowFollow', label: 'Follow painted strokes', min: 0, max: 1, step: 0.01 },
      { key: 'wind', label: 'Wind', min: 0, max: 1, step: 0.01 },
      { key: 'windAngle', label: 'Wind direction', min: -180, max: 180, step: 1, unit: '°' },
      { key: 'vortex', label: 'Vortex', min: 0, max: 1.5, step: 0.01 },
      { key: 'vortexRadius', label: 'Vortex size', min: 0.1, max: 1, step: 0.01 },
    ],
  },
  {
    title: 'Light',
    items: [
      { key: 'sunColor', label: 'Light colour', type: 'color' },
      { key: 'glow', label: 'Glow', min: 0, max: 1.5, step: 0.01 },
      { key: 'rays', label: 'Light rays', min: 0, max: 1.5, step: 0.01 },
      { key: 'breathe', label: 'Breathing', min: 0, max: 1, step: 0.01 },
      { key: 'grade', label: 'Warmth', min: 0, max: 1, step: 0.01 },
    ],
  },
  {
    title: 'Water and air',
    items: [
      { key: 'water', label: 'Water ripples', min: 0, max: 1.5, step: 0.01 },
      { key: 'mist', label: 'Mist', min: 0, max: 1.2, step: 0.01 },
      { key: 'smoke', label: 'Smoke or steam', min: 0, max: 1, step: 0.01 },
      { key: 'smokeColor', label: 'Smoke colour', type: 'color' },
    ],
  },
  {
    title: 'Weather and fire',
    items: [
      { key: 'rain', label: 'Rain', min: 0, max: 1, step: 0.01 },
      { key: 'rainAngle', label: 'Rain angle', min: -45, max: 45, step: 1, unit: '°' },
      { key: 'snow', label: 'Snow and spray', min: 0, max: 1, step: 0.01 },
      { key: 'fire', label: 'Fire flicker', min: 0, max: 1.2, step: 0.01 },
      { key: 'embers', label: 'Embers', min: 0, max: 1.2, step: 0.01 },
    ],
  },
  {
    title: 'Camera and show',
    items: [
      { key: 'zoom', label: 'Camera push', min: 1, max: 2.5, step: 0.01 },
      { key: 'parallax', label: 'Parallax depth', min: 0, max: 1.5, step: 0.01 },
      { key: 'duration', label: 'Time on the wall', min: 12, max: 120, step: 1, unit: 's' },
      { key: 'transition', label: 'Arrives with', type: 'select', options: TRANSITIONS },
      { key: 'mood', label: 'Score', type: 'select', options: MOOD_OPTIONS },
    ],
  },
];

function format(item, v) {
  if (item.step >= 1) return `${Math.round(v)}${item.unit ?? ''}`;
  return Number(v).toFixed(2);
}

export function buildEditor(container, onChange) {
  const inputs = new Map();
  for (const group of CONTROL_GROUPS) {
    const section = document.createElement('section');
    section.className = 'group';
    const h = document.createElement('h3');
    h.textContent = group.title;
    section.append(h);
    for (const item of group.items) {
      const row = document.createElement('div');
      const id = `ctl-${item.key}`;
      const label = document.createElement('label');
      label.htmlFor = id;
      const name = document.createElement('span');
      name.textContent = item.label;
      label.append(name);
      let input;
      let out = null;
      if (item.type === 'color') {
        row.className = 'row color';
        input = document.createElement('input');
        input.type = 'color';
        input.addEventListener('input', () => onChange(item.key, input.value));
      } else if (item.type === 'select') {
        row.className = 'row';
        input = document.createElement('select');
        for (const opt of item.options) {
          const o = document.createElement('option');
          o.value = opt.id;
          o.textContent = opt.label;
          input.append(o);
        }
        input.addEventListener('change', () => onChange(item.key, input.value));
      } else {
        row.className = 'row';
        input = document.createElement('input');
        input.type = 'range';
        input.min = item.min;
        input.max = item.max;
        input.step = item.step;
        out = document.createElement('output');
        label.append(out);
        input.addEventListener('input', () => {
          const v = Number(input.value);
          out.textContent = format(item, v);
          onChange(item.key, v);
        });
      }
      input.id = id;
      row.append(label, input);
      section.append(row);
      inputs.set(item.key, { input, out, item });
    }
    container.append(section);
  }
  return {
    setValues(recipe) {
      for (const [key, { input, out, item }] of inputs) {
        const v = recipe[key];
        if (v == null) continue;
        input.value = v;
        if (out) out.textContent = format(item, v);
      }
    },
  };
}

export function buildGallery(container, onSelect) {
  const tiles = new Map();
  return {
    add(entry, thumbSrc, onThumbError) {
      const tile = document.createElement('button');
      tile.type = 'button';
      tile.className = 'tile';
      tile.setAttribute('role', 'listitem');
      tile.title = entry.year ? `${entry.title}, ${entry.year}` : entry.title;
      const img = document.createElement('img');
      img.alt = '';
      img.loading = 'lazy';
      img.decoding = 'async';
      if (onThumbError) img.addEventListener('error', () => onThumbError(img), { once: true });
      img.src = thumbSrc;
      const label = document.createElement('span');
      label.className = 'tile-label';
      label.textContent = entry.title;
      const progress = document.createElement('span');
      progress.className = 'progress';
      tile.append(img, label, progress);
      tile.addEventListener('click', () => onSelect(entry.id));
      container.append(tile);
      tiles.set(entry.id, { tile, progress });
    },
    setCurrent(id) {
      for (const [key, { tile, progress }] of tiles) {
        tile.classList.toggle('current', key === id);
        if (key !== id) progress.style.width = '0';
      }
      tiles.get(id)?.tile.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    },
    setProgress(id, f) {
      const t = tiles.get(id);
      if (t) t.progress.style.width = `${Math.min(100, f * 100).toFixed(1)}%`;
    },
  };
}

// Draggable markers on top of the canvas, used by the editor.
export class Handles {
  constructor(root, onDrag) {
    this.root = root;
    this.els = {};
    for (const el of root.querySelectorAll('[data-handle]')) this.els[el.dataset.handle] = el;
    for (const [name, el] of Object.entries(this.els)) {
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        el.setPointerCapture(e.pointerId);
        const move = (ev) => onDrag(name, ev.clientX, ev.clientY);
        const up = () => {
          el.removeEventListener('pointermove', move);
          el.removeEventListener('pointerup', up);
          el.removeEventListener('pointercancel', up);
        };
        el.addEventListener('pointermove', move);
        el.addEventListener('pointerup', up);
        el.addEventListener('pointercancel', up);
      });
    }
  }

  set visible(v) {
    this.root.hidden = !v;
  }

  update(toScreen, recipe, width) {
    const place = (name, x, y, show = true) => {
      const el = this.els[name];
      el.hidden = !show;
      if (!show) return;
      const [sx, sy] = toScreen(x, y);
      el.style.left = `${sx}px`;
      el.style.top = `${sy}px`;
    };
    place('sun', recipe.sunX, recipe.sunY);
    place('vortex', recipe.vortexX, recipe.vortexY, recipe.vortex > 0.01);
    place('focus', recipe.focusX, recipe.focusY);
    place('smoke', recipe.smokeX, recipe.smokeY, recipe.smoke > 0.01);
    const [x0, hy] = toScreen(0, recipe.horizon);
    const [x1] = toScreen(1, recipe.horizon);
    const line = this.els.horizon;
    line.style.left = `${Math.max(0, x0)}px`;
    line.style.width = `${Math.min(width, x1) - Math.max(0, x0)}px`;
    line.style.top = `${hy}px`;
  }
}
