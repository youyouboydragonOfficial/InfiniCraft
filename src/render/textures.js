// Procedural texture generation (no external assets).
import * as THREE from 'three';
import { TILES, TILE, BLOCKS, B, SH } from '../world/blocks.js';
import { mulberry32 } from '../world/noise.js';

export const TS = 32; // tile size

// ---------- helpers ----------
function makeTile() { return new Uint8ClampedArray(TS * TS * 4); }
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

function vnoiseFactory(seed, cells) {
  const r = mulberry32(seed);
  const g = new Float32Array(cells * cells);
  for (let i = 0; i < g.length; i++) g[i] = r();
  return (x, y) => {
    const fx = (x / TS) * cells, fy = (y / TS) * cells;
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    const tx = fx - x0, ty = fy - y0;
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const at = (a, b) => g[((a % cells + cells) % cells) + ((b % cells + cells) % cells) * cells];
    const a = at(x0, y0), b = at(x0 + 1, y0), c = at(x0, y0 + 1), d = at(x0 + 1, y0 + 1);
    return (a + (b - a) * sx) + ((c + (d - c) * sx) - (a + (b - a) * sx)) * sy;
  };
}
function fractal(seed) {
  const n1 = vnoiseFactory(seed, 4), n2 = vnoiseFactory(seed + 1, 8), n3 = vnoiseFactory(seed + 2, 16), n4 = vnoiseFactory(seed + 3, 32);
  return (x, y) => n1(x, y) * 0.4 + n2(x, y) * 0.3 + n3(x, y) * 0.2 + n4(x, y) * 0.1;
}

class T {
  constructor(seed) { this.d = makeTile(); this.r = mulberry32(seed * 7919 + 13); this.seed = seed; }
  set(x, y, c, a = 255) {
    x = ((x % TS) + TS) % TS; y = ((y % TS) + TS) % TS;
    const i = (x + y * TS) * 4;
    this.d[i] = c[0]; this.d[i + 1] = c[1]; this.d[i + 2] = c[2]; this.d[i + 3] = a;
  }
  get(x, y) { x = ((x % TS) + TS) % TS; y = ((y % TS) + TS) % TS; const i = (x + y * TS) * 4; return [this.d[i], this.d[i + 1], this.d[i + 2], this.d[i + 3]]; }
  alpha(x, y, a) { x = ((x % TS) + TS) % TS; y = ((y % TS) + TS) % TS; this.d[(x + y * TS) * 4 + 3] = a; }
  fill(base, amp, seed = this.seed) {
    const f = fractal(seed);
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
      const n = (f(x, y) - 0.5) * 2 * amp + (this.r() - 0.5) * amp * 0.6;
      this.set(x, y, [base[0] + n, base[1] + n, base[2] + n]);
    }
    return this;
  }
  shade(x, y, k) { const c = this.get(x, y); this.set(x, y, [c[0] * k, c[1] * k, c[2] * k], c[3]); }
  rect(x0, y0, w, h, c) { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) this.set(x, y, c); }
  blobs(count, rmin, rmax, colorFn) {
    for (let n = 0; n < count; n++) {
      const cx = this.r() * TS, cy = this.r() * TS, rad = rmin + this.r() * (rmax - rmin);
      for (let y = Math.floor(cy - rad); y <= cy + rad; y++) for (let x = Math.floor(cx - rad); x <= cx + rad; x++) {
        const d = Math.hypot(x - cx, y - cy) / rad;
        if (d <= 1 && this.r() > d * 0.5) this.set(x, y, colorFn(d, x, y));
      }
    }
    return this;
  }
}

function voronoi(t, n, colorFn, edge = 1.2, edgeColor = null) {
  const pts = [];
  for (let i = 0; i < n; i++) pts.push([t.r() * TS, t.r() * TS, t.r()]);
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    let d1 = 1e9, d2 = 1e9, best = null;
    for (const p of pts) {
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        const dx = x + 0.5 - (p[0] + ox * TS), dy = y + 0.5 - (p[1] + oy * TS);
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < d1) { d2 = d1; d1 = d; best = p; } else if (d < d2) d2 = d;
      }
    }
    const isEdge = d2 - d1 < edge;
    t.set(x, y, isEdge && edgeColor ? edgeColor(x, y) : colorFn(best[2], d1, x, y));
  }
}

function ore(seed, color, color2) {
  const t = stone(seed);
  const r = t.r;
  const clusters = 4 + Math.floor(r() * 3);
  for (let c = 0; c < clusters; c++) {
    const cx = Math.floor(r() * 28) + 2, cy = Math.floor(r() * 28) + 2;
    const cnt = 4 + Math.floor(r() * 5);
    for (let k = 0; k < cnt; k++) {
      const x = cx + Math.floor((r() - 0.5) * 7), y = cy + Math.floor((r() - 0.5) * 7);
      const s = 1 + Math.floor(r() * 2);
      for (let yy = 0; yy <= s; yy++) for (let xx = 0; xx <= s; xx++) {
        const k2 = 0.8 + r() * 0.4;
        const c0 = (xx + yy === 0) ? color2 : color;
        t.set(x + xx, y + yy, [c0[0] * k2, c0[1] * k2, c0[2] * k2]);
      }
      t.shade(x + s + 1, y + s + 1, 0.6);
    }
  }
  return t;
}

function stone(seed) {
  const t = new T(seed).fill([126, 126, 128], 22);
  const f = vnoiseFactory(seed + 9, 6);
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const v = f(x, y);
    if (v > 0.72) t.shade(x, y, 0.82); else if (v < 0.2) t.shade(x, y, 1.08);
  }
  return t;
}

function cobble(seed, moss) {
  const t = new T(seed);
  const mf = vnoiseFactory(seed + 4, 4);
  voronoi(t, 11, (v, d, x, y) => {
    const g = 95 + v * 60 - d * 2.2 + (t.r() - 0.5) * 14;
    let c = [g, g, g + 2];
    if (moss && mf(x, y) > 0.55) c = [g * 0.55, g * 0.85, g * 0.42];
    return c;
  }, 1.6, () => { const g = 55 + t.r() * 15; return [g, g, g]; });
  return t;
}

function planks(seed, base) {
  const t = new T(seed);
  const f = vnoiseFactory(seed + 2, 16);
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const board = Math.floor(y / 8);
    const grain = Math.sin((x + board * 13) * 0.35 + f(x, y * 4) * 6) * 0.08 + (f(x * 0.5, y * 3) - 0.5) * 0.18;
    let k = 1 + grain + ((board * 37) % 5 - 2) * 0.025;
    if (y % 8 === 7) k = 0.55;
    if (y % 8 === 0) k *= 1.08;
    const seam = (board % 2 === 0 ? 20 : 8);
    if (x === seam && y % 8 !== 7) k *= 0.6;
    t.set(x, y, [base[0] * k, base[1] * k, base[2] * k]);
  }
  return t;
}

function logSide(seed, base, dark, birch) {
  const t = new T(seed);
  const f = vnoiseFactory(seed, 8);
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    if (birch) {
      const n = (f(x, y) - 0.5) * 20;
      t.set(x, y, [base[0] + n, base[1] + n, base[2] + n]);
    } else {
      const groove = Math.sin(x * 1.3 + f(x, y * 0.3) * 5) > 0.55;
      const n = (f(x * 2, y * 0.5) - 0.5) * 30;
      const c = groove ? dark : base;
      t.set(x, y, [c[0] + n, c[1] + n, c[2] + n]);
    }
  }
  if (birch) {
    for (let k = 0; k < 14; k++) {
      const y = Math.floor(t.r() * TS), x = Math.floor(t.r() * TS), w = 2 + Math.floor(t.r() * 6);
      for (let i = 0; i < w; i++) { t.set(x + i, y, dark); if (t.r() < 0.5) t.set(x + i, y + 1, [dark[0] + 30, dark[1] + 30, dark[2] + 30]); }
    }
  }
  return t;
}

function logTop(seed, bark, inner) {
  const t = new T(seed);
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const dx = x - 15.5, dy = y - 15.5;
    const edge = Math.max(Math.abs(dx), Math.abs(dy));
    if (edge > 13.5) { const n = (t.r() - 0.5) * 20; t.set(x, y, [bark[0] + n, bark[1] + n, bark[2] + n]); continue; }
    const d = Math.sqrt(dx * dx + dy * dy);
    const ring = Math.sin(d * 1.4 + t.r() * 0.6) * 0.08;
    const k = 1 + ring - d * 0.006;
    t.set(x, y, [inner[0] * k, inner[1] * k, inner[2] * k]);
  }
  return t;
}

function leaves(seed, base, holes = 0.22) {
  const t = new T(seed);
  const f = vnoiseFactory(seed + 1, 8);
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const n = f(x, y);
    const k = 0.7 + n * 0.5 + (t.r() - 0.5) * 0.25;
    t.set(x, y, [base[0] * k, base[1] * k, base[2] * k]);
    if (t.r() < holes * (1.4 - n)) t.alpha(x, y, 0);
  }
  return t;
}

function plantTile(seed, draw) {
  const t = new T(seed);
  for (let i = 0; i < TS * TS; i++) t.d[i * 4 + 3] = 0;
  draw(t);
  return t;
}

function blades(t, color, count, maxH) {
  for (let n = 0; n < count; n++) {
    let x = 3 + t.r() * 26;
    const h = maxH * (0.5 + t.r() * 0.5);
    const lean = (t.r() - 0.5) * 0.6;
    for (let y = 0; y < h; y++) {
      const k = 0.65 + (y / h) * 0.5;
      t.set(Math.round(x), TS - 1 - y, [color[0] * k, color[1] * k, color[2] * k]);
      x += lean * (y / h);
    }
  }
}

function flower(t, petal, center) {
  for (let y = 0; y < 18; y++) t.set(15 + (y > 10 ? 1 : 0), TS - 1 - y, [60, 120, 40]);
  t.rect(17, 24, 3, 2, [70, 140, 45]); t.rect(12, 26, 3, 2, [70, 140, 45]);
  for (let y = -4; y <= 4; y++) for (let x = -4; x <= 4; x++) {
    const d = Math.hypot(x, y);
    if (d <= 4.2) { const k = 0.8 + t.r() * 0.3; t.set(16 + x, 10 + y, [petal[0] * k, petal[1] * k, petal[2] * k]); }
  }
  t.rect(15, 9, 2, 2, center);
}

function bricks(seed, base, mortar, bw = 16, bh = 8) {
  const t = new T(seed);
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const row = Math.floor(y / bh);
    const ox = (row % 2) * (bw / 2);
    const isM = y % bh === bh - 1 || (x + ox) % bw === bw - 1;
    const id = Math.floor((x + ox) / bw) + row * 7;
    const v = ((id * 2654435761) >>> 0) % 100 / 100;
    const n = (t.r() - 0.5) * 18;
    if (isM) t.set(x, y, [mortar[0] + n * 0.5, mortar[1] + n * 0.5, mortar[2] + n * 0.5]);
    else { const k = 0.85 + v * 0.25; t.set(x, y, [base[0] * k + n, base[1] * k + n, base[2] * k + n]); }
  }
  return t;
}

function metal(seed, base, light, dark) {
  const t = new T(seed).fill(base, 8);
  for (let i = 0; i < TS; i++) {
    t.set(i, 0, light); t.set(0, i, light); t.set(i, 1, light); t.set(1, i, light);
    t.set(i, TS - 1, dark); t.set(TS - 1, i, dark); t.set(i, TS - 2, dark); t.set(TS - 2, i, dark);
  }
  for (let y = 4; y < TS - 4; y++) for (let x = 4; x < TS - 4; x++) if ((x + y) % 11 === 0) t.set(x, y, light);
  return t;
}

// ---------- tile builders ----------
const BUILDERS = {
  stone: (s) => stone(s),
  dirt: (s) => new T(s).fill([128, 92, 62], 20).blobs(10, 0.8, 1.6, () => [96, 68, 44]).blobs(5, 0.6, 1.2, () => [150, 118, 88]),
  grass_top: (s) => { const t = new T(s).fill([190, 190, 190], 30); for (let i = 0; i < 160; i++) t.shade(Math.floor(t.r() * TS), Math.floor(t.r() * TS), 0.78 + t.r() * 0.1); return t; },
  grass_side: (s) => {
    const t = BUILDERS.dirt(s);
    const f = vnoiseFactory(s + 3, 8);
    for (let x = 0; x < TS; x++) {
      const h = 5 + Math.floor(f(x, 0) * 6) + (t.r() < 0.3 ? 2 : 0);
      for (let y = 0; y < h; y++) { const k = 0.85 + t.r() * 0.3 - (y / h) * 0.15; t.set(x, y, [88 * k, 140 * k, 52 * k]); }
    }
    return t;
  },
  snow_grass_side: (s) => {
    const t = BUILDERS.dirt(s);
    const f = vnoiseFactory(s + 3, 8);
    for (let x = 0; x < TS; x++) {
      const h = 6 + Math.floor(f(x, 0) * 6);
      for (let y = 0; y < h; y++) { const k = 0.92 + t.r() * 0.08; t.set(x, y, [240 * k, 246 * k, 252 * k]); }
    }
    return t;
  },
  cobble: (s) => cobble(s, false),
  mossy_cobble: (s) => cobble(s, true),
  planks: (s) => planks(s, [168, 134, 82]),
  birch_planks: (s) => planks(s, [206, 188, 132]),
  spruce_planks: (s) => planks(s, [118, 86, 52]),
  bedrock: (s) => { const t = new T(s); voronoi(t, 14, (v) => { const g = 30 + v * 90; return [g, g, g]; }, 0.8, () => [20, 20, 20]); return t; },
  sand: (s) => new T(s).fill([220, 208, 160], 14).blobs(25, 0.4, 0.9, () => [196, 182, 134]),
  gravel: (s) => { const t = new T(s); voronoi(t, 22, (v, d) => { const g = 105 + v * 70 - d * 4; return [g + v * 10, g, g - v * 8]; }, 1.0, () => [70, 66, 64]); return t; },
  log_side: (s) => logSide(s, [110, 84, 52], [72, 54, 32]),
  log_top: (s) => logTop(s, [96, 74, 44], [176, 142, 88]),
  birch_log_side: (s) => logSide(s, [222, 220, 210], [40, 38, 34], true),
  birch_log_top: (s) => logTop(s, [220, 218, 205], [196, 176, 120]),
  spruce_log_side: (s) => logSide(s, [72, 50, 30], [44, 30, 18]),
  spruce_log_top: (s) => logTop(s, [60, 42, 26], [120, 90, 56]),
  leaves: (s) => leaves(s, [200, 200, 200]),
  birch_leaves: (s) => leaves(s, [130, 168, 84]),
  spruce_leaves: (s) => leaves(s, [62, 98, 64], 0.18),
  glass: (s) => {
    const t = new T(s);
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
      const border = x === 0 || y === 0 || x === TS - 1 || y === TS - 1;
      const streak = (x - y === 6 || x - y === 8 || x - y === -14) && x > 3 && x < 24;
      if (border) t.set(x, y, [200, 225, 235], 255);
      else if (streak) t.set(x, y, [235, 245, 255], 180);
      else t.set(x, y, [200, 225, 240], 0);
    }
    return t;
  },
  coal_ore: (s) => ore(s, [38, 38, 40], [70, 70, 72]),
  iron_ore: (s) => ore(s, [214, 176, 146], [240, 210, 186]),
  gold_ore: (s) => ore(s, [250, 222, 60], [255, 250, 160]),
  diamond_ore: (s) => ore(s, [80, 226, 232], [200, 255, 255]),
  water: (s) => new T(s).fill([40, 100, 190], 16),
  lava: (s) => {
    const t = new T(s);
    const f = fractal(s);
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
      const v = f(x, y);
      t.set(x, y, [255, 90 + v * 150, 20 + Math.max(0, v - 0.6) * 200]);
    }
    return t;
  },
  sandstone_side: (s) => {
    const t = new T(s).fill([216, 202, 150], 10);
    for (let x = 0; x < TS; x++) { t.shade(x, 8, 0.85); t.shade(x, 20, 0.88); t.shade(x, 27, 0.9); t.set(x, 31, [190, 176, 126]); }
    return t;
  },
  sandstone_top: (s) => new T(s).fill([222, 210, 160], 8),
  snow: (s) => new T(s).fill([240, 246, 252], 7),
  ice: (s) => {
    const t = new T(s).fill([150, 186, 245], 10);
    for (let i = 0; i < TS * TS; i++) t.d[i * 4 + 3] = 200;
    for (let k = 0; k < 4; k++) { let x = t.r() * TS, y = t.r() * TS; const a = t.r() * 6.28; for (let i = 0; i < 12; i++) { t.set(Math.floor(x), Math.floor(y), [220, 236, 255], 220); x += Math.cos(a); y += Math.sin(a); } }
    return t;
  },
  cactus_side: (s) => {
    const t = new T(s);
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
      const ridge = (x % 8 === 0) ? 0.75 : (x % 8 === 4 ? 1.15 : 1);
      const n = (t.r() - 0.5) * 0.1;
      t.set(x, y, [78 * (ridge + n), 128 * (ridge + n), 44 * (ridge + n)]);
    }
    for (let i = 0; i < 18; i++) t.set(Math.floor(t.r() * 4) * 8 + 4, Math.floor(t.r() * TS), [230, 230, 190]);
    return t;
  },
  cactus_top: (s) => {
    const t = new T(s);
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
      const d = Math.max(Math.abs(x - 15.5), Math.abs(y - 15.5));
      const k = d > 13 ? 0.75 : (d > 9 ? 1.05 : 0.95);
      t.set(x, y, [90 * k, 140 * k, 50 * k]);
    }
    return t;
  },
  tall_grass: (s) => plantTile(s, (t) => blades(t, [200, 200, 200], 22, 28)),
  fern: (s) => plantTile(s, (t) => {
    for (let n = 0; n < 5; n++) {
      const bx = 6 + n * 5;
      for (let y = 0; y < 26; y++) { t.set(bx + Math.round(Math.sin(y * 0.15) * 2), TS - 1 - y, [170, 180, 170]); if (y % 3 === 0 && y > 4) { t.set(bx - 1 - (y % 2), TS - 1 - y, [190, 200, 190]); t.set(bx + 1 + (y % 2), TS - 1 - y, [190, 200, 190]); } }
    }
  }),
  rose: (s) => plantTile(s, (t) => flower(t, [205, 30, 30], [40, 20, 20])),
  dandelion: (s) => plantTile(s, (t) => flower(t, [250, 220, 40], [230, 160, 20])),
  blue_flower: (s) => plantTile(s, (t) => flower(t, [60, 170, 230], [220, 240, 255])),
  dead_bush: (s) => plantTile(s, (t) => {
    const twig = (x, y, a, len) => { for (let i = 0; i < len; i++) { t.set(Math.round(x), Math.round(y), [120, 80, 40]); x += Math.cos(a); y -= Math.sin(a); } return [x, y]; };
    const [x1, y1] = twig(16, 31, Math.PI / 2, 10);
    twig(x1, y1, 2.2, 10); twig(x1, y1, 0.9, 11); twig(x1, y1, 1.6, 9);
    twig(16, 26, 2.7, 8); twig(16, 24, 0.4, 9);
  }),
  crafting_top: (s) => {
    const t = planks(s, [168, 134, 82]);
    for (let i = 2; i < 30; i++) { t.set(i, 2, [80, 60, 36]); t.set(i, 29, [80, 60, 36]); t.set(2, i, [80, 60, 36]); t.set(29, i, [80, 60, 36]); t.set(i, 15, [100, 76, 46]); t.set(15, i, [100, 76, 46]); }
    return t;
  },
  crafting_side: (s) => {
    const t = planks(s, [150, 116, 70]);
    t.rect(0, 0, 32, 4, [110, 84, 52]);
    t.rect(5, 10, 3, 14, [80, 60, 40]); t.rect(3, 9, 7, 4, [170, 170, 175]);
    t.rect(20, 10, 2, 16, [90, 66, 42]); t.rect(17, 8, 9, 3, [150, 150, 160]);
    return t;
  },
  furnace_side: (s) => { const t = stone(s); for (let i = 0; i < TS; i++) { t.shade(i, 0, 1.2); t.shade(0, i, 1.2); t.shade(i, TS - 1, 0.7); t.shade(TS - 1, i, 0.7); } return t; },
  furnace_top: (s) => new T(s).fill([118, 118, 120], 10),
  furnace_front: (s) => { const t = BUILDERS.furnace_side(s); t.rect(8, 16, 16, 10, [24, 22, 22]); t.rect(8, 15, 16, 1, [70, 70, 70]); t.rect(6, 5, 20, 2, [80, 80, 82]); return t; },
  furnace_front_on: (s) => {
    const t = BUILDERS.furnace_front(s);
    for (let y = 18; y < 26; y++) for (let x = 9; x < 23; x++) if (t.r() < 0.75) t.set(x, y, [255, 120 + t.r() * 120, 20]);
    return t;
  },
  torch: (s) => plantTile(s, (t) => {
    for (let y = 16; y < 32; y++) for (let x = 14; x < 18; x++) t.set(x, y, [120 - (x - 14) * 8, 88 - (x - 14) * 6, 50]);
    for (let y = 11; y < 17; y++) for (let x = 14; x < 18; x++) t.set(x, y, y < 13 ? [255, 250, 200] : [255, 190, 60]);
  }),
  bricks: (s) => bricks(s, [150, 72, 56], [176, 168, 156], 16, 8),
  stone_bricks: (s) => bricks(s, [124, 124, 124], [84, 84, 86], 16, 16),
  lamp: (s) => {
    const t = new T(s);
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
      const frame = x < 3 || y < 3 || x > 28 || y > 28 || x === 15 || x === 16 || y === 15 || y === 16;
      if (frame) t.set(x, y, [90, 70, 50]);
      else { const v = 0.85 + t.r() * 0.15; t.set(x, y, [255 * v, 230 * v, 160 * v]); }
    }
    return t;
  },
  clay: (s) => new T(s).fill([160, 166, 180], 8),
  wool: (s) => { const t = new T(s).fill([232, 232, 232], 10); for (let i = 0; i < 200; i++) t.shade(Math.floor(t.r() * TS), Math.floor(t.r() * TS), 0.88); return t; },
  bookshelf: (s) => {
    const t = planks(s, [168, 134, 82]);
    const cols = [[150, 40, 40], [40, 80, 150], [50, 120, 60], [140, 110, 40], [100, 50, 120], [180, 160, 130]];
    for (const y0 of [3, 18]) {
      let x = 2;
      while (x < 30) {
        const w = 2 + Math.floor(t.r() * 2), h = 9 + Math.floor(t.r() * 3), c = cols[Math.floor(t.r() * cols.length)];
        for (let xx = 0; xx < w && x + xx < 30; xx++) for (let yy = 0; yy < h; yy++) t.set(x + xx, y0 + (11 - h) + yy, [c[0] * (xx === 0 ? 1.15 : 1), c[1], c[2]]);
        x += w;
      }
      t.rect(0, y0 + 11, 32, 2, [96, 72, 44]);
    }
    return t;
  },
  obsidian: (s) => { const t = new T(s).fill([22, 18, 34], 10); t.blobs(12, 0.6, 1.8, () => [60, 40, 90]); return t; },
  iron_block: (s) => metal(s, [220, 220, 224], [250, 250, 252], [160, 160, 168]),
  gold_block: (s) => metal(s, [250, 210, 60], [255, 245, 150], [200, 150, 30]),
  diamond_block: (s) => metal(s, [100, 228, 222], [210, 255, 252], [40, 160, 160]),
  coal_block: (s) => new T(s).fill([26, 26, 28], 10).blobs(10, 0.5, 1, () => [50, 50, 54]),
};

// ---------- atlas building ----------
export const tileCanvases = {}; // name -> canvas (top-origin)

export function buildTextures() {
  const layers = TILES.length;
  const data = new Uint8Array(TS * TS * 4 * layers);
  TILES.forEach((name, li) => {
    const b = BUILDERS[name];
    const t = b ? b(li * 101 + 7) : new T(1).fill([255, 0, 255], 0);
    const d = t.d;
    // canvas for icons
    const cv = document.createElement('canvas'); cv.width = cv.height = TS;
    const ctx = cv.getContext('2d');
    ctx.putImageData(new ImageData(new Uint8ClampedArray(d), TS, TS), 0, 0);
    tileCanvases[name] = cv;
    // flipped for GL (row 0 = bottom)
    for (let y = 0; y < TS; y++) {
      const src = (TS - 1 - y) * TS * 4;
      data.set(d.subarray(src, src + TS * 4), li * TS * TS * 4 + y * TS * 4);
    }
  });
  const tex = new THREE.DataArrayTexture(data, TS, TS, layers);
  tex.format = THREE.RGBAFormat;
  tex.type = THREE.UnsignedByteType;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

export function crackTextures() {
  const out = [];
  const r = mulberry32(42);
  const lines = [];
  for (let i = 0; i < 40; i++) {
    let x = 16 + (r() - 0.5) * 8, y = 16 + (r() - 0.5) * 8;
    const a = r() * Math.PI * 2;
    const seg = [];
    for (let k = 0; k < 14; k++) { seg.push([x, y]); x += Math.cos(a + (r() - 0.5) * 1.2) * 1.6; y += Math.sin(a + (r() - 0.5) * 1.2) * 1.6; }
    lines.push(seg);
  }
  for (let s = 0; s < 10; s++) {
    const cv = document.createElement('canvas'); cv.width = cv.height = 32;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    const n = Math.floor((s + 1) / 10 * lines.length);
    for (let i = 0; i < n; i++) {
      const len = Math.ceil(lines[i].length * Math.min(1, (s + 2) / 8));
      for (let k = 0; k < len; k++) { const [x, y] = lines[i][k]; ctx.fillRect(Math.floor(x), Math.floor(y), 1, 1); }
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    out.push(tex);
  }
  return out;
}

export const DEFAULT_TINT = [0.45, 0.72, 0.30];

export function tintedCanvas(src, rgb) {
  const cv = document.createElement('canvas'); cv.width = src.width; cv.height = src.height;
  const ctx = cv.getContext('2d');
  ctx.drawImage(src, 0, 0);
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = `rgb(${rgb[0] * 255},${rgb[1] * 255},${rgb[2] * 255})`;
  ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(src, 0, 0);
  return cv;
}

export function blockFaceCanvas(id, face) {
  const def = BLOCKS[id];
  const name = TILES[def.faces[face]];
  let cv = tileCanvases[name];
  const tinted = def.tint === 1 || (def.tintTop && face === 2);
  if (tinted) cv = tintedCanvas(cv, DEFAULT_TINT);
  return cv;
}
