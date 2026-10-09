import { TRANSITIONS } from './paintings.js';
import { SOUNDSCAPES } from './audio.js';

const MOOD_OPTIONS = [
  { id: 'dawn', label: 'Dawn, airy' },
  { id: 'myth', label: 'Myth, golden' },
  { id: 'warm', label: 'Warm sunset' },
  { id: 'tragic', label: 'Tragic sea' },
  { id: 'storm', label: 'Storm wind' },
  { id: 'fire', label: 'Fire, smouldering' },
  { id: 'speed', label: 'Rain and speed' },
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
    title: 'Layers',
    items: [
      { key: 'skyDrift', label: 'Clouds drift', min: 0, max: 1.5, step: 0.01 },
      { key: 'landSway', label: 'Foliage stirs', min: 0, max: 1.5, step: 0.01 },
      { key: 'brush', label: 'Brush texture lives', min: 0, max: 1.2, step: 0.01 },
      { key: 'lightDrift', label: 'Drifting light', min: 0, max: 1.2, step: 0.01 },
      { key: 'parallax', label: 'Depth between layers', min: 0, max: 1.5, step: 0.01 },
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
      { key: 'duration', label: 'Time on the wall', min: 12, max: 120, step: 1, unit: 's' },
      { key: 'transition', label: 'Arrives with', type: 'select', options: TRANSITIONS },
    ],
  },
  {
    title: 'Sound',
    items: [
      { key: 'mood', label: 'Score', type: 'select', options: MOOD_OPTIONS },
      { key: 'sounds', label: 'Sound effects', type: 'select', options: SOUNDSCAPES },
      { key: 'sfx', label: 'Effects level', min: 0, max: 1.5, step: 0.01 },
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
  constructor(root, onDrag, onDragEnd = () => {}) {
    this.root = root;
    this.onDrag = onDrag;
    this.onDragEnd = onDragEnd;
    this.els = {};
    for (const el of root.querySelectorAll('[data-handle]')) this.bindDrag(el, el.dataset.handle);
    this.elementEls = [];
  }

  bindDrag(el, name) {
    this.els[name] = el;
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      el.setPointerCapture(e.pointerId);
      const move = (ev) => this.onDrag(name, ev.clientX, ev.clientY);
      const up = () => {
        el.removeEventListener('pointermove', move);
        el.removeEventListener('pointerup', up);
        el.removeEventListener('pointercancel', up);
        this.onDragEnd(name);
      };
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
    });
  }

  set visible(v) {
    this.root.hidden = !v;
  }

  // One outline, one marker and (for approaching elements) one vanishing
  // point marker per moving element.
  syncElements(count) {
    while (this.elementEls.length < count) {
      const i = this.elementEls.length;
      const outline = document.createElement('div');
      outline.className = 'element-outline';
      const marker = document.createElement('button');
      marker.type = 'button';
      marker.className = 'handle element';
      marker.title = `Moving element ${i + 1}: drag onto the object`;
      marker.textContent = String(i + 1);
      const vanish = document.createElement('button');
      vanish.type = 'button';
      vanish.className = 'handle vanish';
      vanish.title = `Element ${i + 1}: the point it comes from`;
      vanish.textContent = '⊙';
      this.root.append(outline, marker, vanish);
      this.bindDrag(marker, `element-${i}`);
      this.bindDrag(vanish, `vanish-${i}`);
      this.elementEls.push({ outline, marker, vanish });
    }
    this.elementEls.forEach((set, i) => {
      const show = i < count;
      set.outline.hidden = !show;
      set.marker.hidden = !show;
      if (!show) set.vanish.hidden = true;
    });
  }

  update(toScreen, recipe, width) {
    const place = (el, x, y, show = true) => {
      el.hidden = !show;
      if (!show) return;
      const [sx, sy] = toScreen(x, y);
      el.style.left = `${sx}px`;
      el.style.top = `${sy}px`;
    };
    place(this.els.sun, recipe.sunX, recipe.sunY);
    place(this.els.vortex, recipe.vortexX, recipe.vortexY, recipe.vortex > 0.01);
    place(this.els.focus, recipe.focusX, recipe.focusY);
    place(this.els.smoke, recipe.smokeX, recipe.smokeY, recipe.smoke > 0.01);
    const [x0, hy] = toScreen(0, recipe.horizon);
    const [x1] = toScreen(1, recipe.horizon);
    const line = this.els.horizon;
    line.style.left = `${Math.max(0, x0)}px`;
    line.style.width = `${Math.min(width, x1) - Math.max(0, x0)}px`;
    line.style.top = `${hy}px`;

    const elements = recipe.elements ?? [];
    this.syncElements(elements.length);
    elements.forEach((el, i) => {
      const { outline, marker, vanish } = this.elementEls[i];
      place(marker, el.x, el.y);
      place(vanish, el.vx, el.vy, el.type === 'approach');
      const [ax, ay] = toScreen(el.x - el.rx, el.y - el.ry);
      const [bx, by] = toScreen(el.x + el.rx, el.y + el.ry);
      outline.style.left = `${(ax + bx) / 2}px`;
      outline.style.top = `${(ay + by) / 2}px`;
      outline.style.width = `${bx - ax}px`;
      outline.style.height = `${by - ay}px`;
      outline.style.transform = `translate(-50%, -50%) rotate(${el.angle ?? 0}deg)`;
    });
  }
}

// Editor section listing the moving elements of the current painting.
export function buildElementsEditor(container, { onChange, onAdd, onRemove }) {
  const list = document.createElement('div');
  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'add-element';
  add.textContent = '+ Add moving element';
  add.addEventListener('click', onAdd);
  container.append(list, add);

  const slider = (label, value, min, max, step, onInput) => {
    const row = document.createElement('div');
    row.className = 'row';
    const lab = document.createElement('label');
    const name = document.createElement('span');
    name.textContent = label;
    const out = document.createElement('output');
    const digits = step >= 1 ? 0 : 2;
    out.textContent = Number(value).toFixed(digits);
    lab.append(name, out);
    const input = document.createElement('input');
    input.type = 'range';
    input.min = min;
    input.max = max;
    input.step = step;
    input.value = value;
    input.setAttribute('aria-label', label);
    input.addEventListener('input', () => {
      out.textContent = Number(input.value).toFixed(digits);
      onInput(Number(input.value));
    });
    row.append(lab, input);
    return row;
  };

  return {
    render(elements, types, max) {
      list.replaceChildren();
      elements.forEach((el, i) => {
        const card = document.createElement('div');
        card.className = 'element-card';
        const head = document.createElement('div');
        head.className = 'element-head';
        const title = document.createElement('span');
        title.textContent = `Element ${i + 1}`;
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.textContent = 'Remove';
        remove.addEventListener('click', () => onRemove(i));
        head.append(title, remove);
        const typeRow = document.createElement('div');
        typeRow.className = 'row';
        const select = document.createElement('select');
        select.setAttribute('aria-label', `Element ${i + 1} motion`);
        for (const t of types) {
          const o = document.createElement('option');
          o.value = t.id;
          o.textContent = t.label;
          select.append(o);
        }
        select.value = el.type;
        select.addEventListener('change', () => onChange(i, 'type', select.value));
        typeRow.append(select);
        card.append(
          head,
          typeRow,
          slider('Motion', el.amount ?? 1, 0, 2, 0.01, (v) => onChange(i, 'amount', v)),
          slider('Size', el.rx, 0.02, 0.35, 0.005, (v) => onChange(i, 'size', v)),
          slider('Tilt', el.angle ?? 0, -75, 75, 1, (v) => onChange(i, 'angle', v)),
        );
        list.append(card);
      });
      add.hidden = elements.length >= max;
    },
  };
}
