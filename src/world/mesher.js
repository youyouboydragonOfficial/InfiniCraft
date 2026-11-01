import { CS, CH, PAD } from './constants.js';
import { FACE_LAYER, OPAQUE, SHAPE, LIGHT, ATTEN, TINT, HEIGHT, BLOCKS, B } from './blocks.js';

const W = CS + 2 * PAD;
const WW = W * W;
const VOL = WW * CH;

const DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const CORNERS = [
  [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]],
  [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]],
  [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]],
  [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]],
  [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]],
  [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]],
];
const UVS = [[0, 0], [1, 0], [1, 1], [0, 1]];
const off = (x, y, z) => x + z * W + y * WW;
const NOFF = DIRS.map(d => off(d[0], d[1], d[2]));
// AO neighbor offsets per face/corner: [side1, side2, corner]
const AOOFF = DIRS.map((d, f) => {
  const axis = d[0] ? 0 : d[1] ? 1 : 2;
  const tang = [0, 1, 2].filter(a => a !== axis);
  return CORNERS[f].map(c => {
    const s1 = [0, 0, 0], s2 = [0, 0, 0];
    s1[tang[0]] = c[tang[0]] * 2 - 1;
    s2[tang[1]] = c[tang[1]] * 2 - 1;
    const a = off(d[0] + s1[0], d[1] + s1[1], d[2] + s1[2]);
    const b = off(d[0] + s2[0], d[1] + s1[1], d[2] + s2[2]);
    const cc = off(d[0] + s1[0] + s2[0], d[1] + s1[1] + s2[1], d[2] + s1[2] + s2[2]);
    return [a, b, cc];
  });
});
const AO_CURVE = [0.42, 0.62, 0.82, 1.0];

const sky = new Uint8Array(VOL);
const blk = new Uint8Array(VOL);
const queue = new Int32Array(VOL);

class Geo {
  constructor() { this.pos = []; this.nrm = []; this.uv = []; this.data = []; this.tint = []; this.idx = []; this.n = 0; }
  out() {
    return {
      position: new Float32Array(this.pos), normal: new Int8Array(this.nrm), aUv: new Float32Array(this.uv),
      aData: new Float32Array(this.data), aTint: new Uint8Array(this.tint), index: new Uint32Array(this.idx), count: this.n,
    };
  }
}

function propagate(L, head, tail, vol) {
  const QM = VOL;
  while (head !== tail) {
    const i = queue[head]; head++; if (head === QM) head = 0;
    const l = L[i];
    if (l <= 1) continue;
    const x = i % W, z = ((i / W) | 0) % W, y = (i / WW) | 0;
    for (let d = 0; d < 6; d++) {
      let n;
      if (d === 0) { if (x === W - 1) continue; n = i + 1; }
      else if (d === 1) { if (x === 0) continue; n = i - 1; }
      else if (d === 2) { if (y === CH - 1) continue; n = i + WW; }
      else if (d === 3) { if (y === 0) continue; n = i - WW; }
      else if (d === 4) { if (z === W - 1) continue; n = i + W; }
      else { if (z === 0) continue; n = i - W; }
      const id = vol[n];
      if (OPAQUE[id]) continue;
      const nl = l - 1 - ATTEN[id];
      if (nl > L[n]) { L[n] = nl; queue[tail] = n; tail++; if (tail === QM) tail = 0; }
    }
  }
}

export function buildMesh(vol, tintGrid) {
  // find vertical range
  let maxY = 0;
  for (let i = VOL - 1; i >= 0; i--) if (vol[i] !== 0) { maxY = (i / WW) | 0; break; }
  const topY = Math.min(CH - 1, maxY + 1);

  // --- sky light ---
  sky.fill(0); blk.fill(0);
  const colTop = new Int16Array(WW);
  for (let z = 0; z < W; z++) for (let x = 0; x < W; x++) {
    let l = 15, top = -1;
    for (let y = CH - 1; y >= 0; y--) {
      const i = x + z * W + y * WW;
      const id = vol[i];
      if (OPAQUE[id]) { if (top < 0) top = y; l = 0; break; }
      if (ATTEN[id]) { if (top < 0) top = y; l = Math.max(0, l - ATTEN[id]); }
      sky[i] = l;
      if (l === 0) break;
    }
    colTop[x + z * W] = top;
  }
  let tail = 0;
  for (let z = 0; z < W; z++) for (let x = 0; x < W; x++) {
    let m = colTop[x + z * W];
    if (x > 0) m = Math.max(m, colTop[x - 1 + z * W]);
    if (x < W - 1) m = Math.max(m, colTop[x + 1 + z * W]);
    if (z > 0) m = Math.max(m, colTop[x + (z - 1) * W]);
    if (z < W - 1) m = Math.max(m, colTop[x + (z + 1) * W]);
    for (let y = 0; y <= m + 1 && y < CH; y++) {
      const i = x + z * W + y * WW;
      if (sky[i] > 1) queue[tail++] = i;
    }
  }
  propagate(sky, 0, tail, vol);

  // --- block light ---
  tail = 0;
  for (let i = 0; i < WW * (topY + 1); i++) {
    const e = LIGHT[vol[i]];
    if (e) { blk[i] = e; queue[tail++] = i; }
  }
  if (tail) propagate(blk, 0, tail, vol);

  const solid = new Geo(), plants = new Geo(), water = new Geo();
  let minY = CH;

  const tintAt = (lx, lz) => {
    const k = (lx + lz * (CS + 1)) * 3;
    return [tintGrid[k], tintGrid[k + 1], tintGrid[k + 2]];
  };

  for (let y = 0; y <= topY; y++) {
    for (let lz = 0; lz < CS; lz++) {
      for (let lx = 0; lx < CS; lx++) {
        const i = (lx + PAD) + (lz + PAD) * W + y * WW;
        const id = vol[i];
        if (id === 0) continue;
        const shape = SHAPE[id];
        if (y < minY) minY = y;
        if (id === B.DRAGON_EGG) {
          emitEgg(solid, i, lx, y, lz, FACE_LAYER[id * 6]);
        } else if (shape === 1) {
          const def = BLOCKS[id];
          const isLeaf = def.leaves, isGlass = def.glass;
          const tint = TINT[id];
          for (let f = 0; f < 6; f++) {
            if (f === 3 && y === 0) continue;
            const ni = (f === 2 && y === CH - 1) ? -1 : i + NOFF[f];
            const nb = ni < 0 ? 0 : vol[ni];
            if (OPAQUE[nb]) continue;
            if (isGlass && nb === id) continue;
            if (def.cactus && nb === id) continue;
            if (isLeaf && nb === id && (f === 3)) continue;
            emitCube(solid, vol, i, lx, y, lz, f, FACE_LAYER[id * 6 + f], (tint === 1 || (tint === 2 && f === 2)), tintAt, isLeaf);
          }
        } else if (shape === 2) {
          emitCross(plants, i, lx, y, lz, FACE_LAYER[id * 6], TINT[id] === 1, tintAt, id);
        } else if (shape === 3) {
          emitTorch(plants, i, lx, y, lz, FACE_LAYER[id * 6]);
        } else if (shape === 4) {
          const isWater = id === B.WATER;
          const above = y < CH - 1 ? vol[i + WW] : 0;
          const lowered = above !== id;
          for (let f = 0; f < 6; f++) {
            if (f === 3 && y === 0) continue;
            const nb = (f === 2 && y === CH - 1) ? 0 : vol[i + NOFF[f]];
            if (nb === id || OPAQUE[nb]) continue;
            if (f !== 2 && SHAPE[nb] === 4) continue;
            if (isWater && nb === B.ICE) continue;
            emitLiquid(isWater ? water : solid, i, lx, y, lz, f, lowered, isWater ? 0 : FACE_LAYER[id * 6], isWater);
          }
        } else if (shape === 5) {
          const bh = HEIGHT[id];
          for (let f = 0; f < 6; f++) {
            if (f === 3 && y === 0) continue;
            const ni = (f === 2 && y === CH - 1) ? -1 : i + NOFF[f];
            const nb = ni < 0 ? 0 : vol[ni];
            if (f !== 2) {
              if (OPAQUE[nb]) continue;
              if (nb === id && f !== 3) continue;
            }
            emitPartial(solid, i, lx, y, lz, f, bh, FACE_LAYER[id * 6 + f], id === B.END_PORTAL);
          }
        } else if (shape === 6) {
          emitPortal(plants, vol, i, lx, y, lz, FACE_LAYER[id * 6], id);
        }
      }
    }
  }
  return { solid: solid.out(), plants: plants.out(), water: water.out(), minY: minY === CH ? 0 : minY, maxY: topY };
}

function emitCube(g, vol, i, lx, y, lz, f, layer, tinted, tintAt, sway) {
  const d = DIRS[f];
  const ni = i + NOFF[f];
  const outside = (f === 2 && y === CH - 1);
  const base = g.n;
  const aos = [0, 0, 0, 0];
  for (let c = 0; c < 4; c++) {
    const cr = CORNERS[f][c];
    let ao = 3, s = 0, b = 0;
    if (outside) { s = 15; }
    else {
      const o = AOOFF[f][c];
      const ia = i + o[0], ib = i + o[1], ic = i + o[2];
      const va = (ia >= 0 && ia < VOL) ? vol[ia] : 0, vb = (ib >= 0 && ib < VOL) ? vol[ib] : 0, vc = (ic >= 0 && ic < VOL) ? vol[ic] : 0;
      const oa = OPAQUE[va], ob = OPAQUE[vb], oc = OPAQUE[vc];
      ao = (oa && ob) ? 0 : 3 - (oa + ob + oc);
      let n = 1; s = sky[ni]; b = blk[ni];
      if (!oa && ia >= 0 && ia < VOL) { s += sky[ia]; b += blk[ia]; n++; }
      if (!ob && ib >= 0 && ib < VOL) { s += sky[ib]; b += blk[ib]; n++; }
      if (!oc && !(oa && ob) && ic >= 0 && ic < VOL) { s += sky[ic]; b += blk[ic]; n++; }
      s /= n; b /= n;
    }
    aos[c] = ao;
    const px = lx + cr[0], py = y + cr[1], pz = lz + cr[2];
    g.pos.push(px, py, pz);
    g.nrm.push(d[0] * 127, d[1] * 127, d[2] * 127);
    g.uv.push(UVS[c][0], UVS[c][1]);
    g.data.push(sway ? layer + 1000 : layer, s, b, AO_CURVE[ao]);
    if (tinted) { const t = tintAt(px, pz); g.tint.push(t[0] * 255, t[1] * 255, t[2] * 255); }
    else g.tint.push(255, 255, 255);
  }
  if (aos[0] + aos[2] < aos[1] + aos[3]) g.idx.push(base + 1, base + 2, base + 3, base + 1, base + 3, base);
  else g.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  g.n += 4;
}

function emitPartial(g, i, lx, y, lz, f, bh, layer, fullGlow) {
  const d = DIRS[f];
  const ni = i + NOFF[f];
  const outside = f === 2 && y === CH - 1;
  const s = outside ? 15 : Math.max(sky[i], (ni >= 0 && ni < VOL) ? sky[ni] : 0);
  const b = fullGlow ? 15 : Math.max(blk[i], (ni >= 0 && ni < VOL) ? blk[ni] : 0);
  const base = g.n;
  for (let c = 0; c < 4; c++) {
    const cr = CORNERS[f][c];
    const py = cr[1] ? bh : 0;
    g.pos.push(lx + cr[0], y + py, lz + cr[2]);
    g.nrm.push(d[0] * 127, d[1] * 127, d[2] * 127);
    const u = UVS[c][0];
    const v = (f === 2 || f === 3) ? UVS[c][1] : (cr[1] ? 1 : 1 - bh);
    g.uv.push(u, v);
    g.data.push(layer, s, b, 0.96);
    g.tint.push(255, 255, 255);
  }
  g.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  g.n += 4;
}

function emitBox(g, lx, y, lz, x0, y0, z0, x1, y1, z1, layer, s, b, mask = 63) {
  for (let f = 0; f < 6; f++) {
    if (!((mask >> f) & 1)) continue;
    const d = DIRS[f];
    const base = g.n;
    for (let c = 0; c < 4; c++) {
      const cr = CORNERS[f][c];
      g.pos.push(lx + (cr[0] ? x1 : x0), y + (cr[1] ? y1 : y0), lz + (cr[2] ? z1 : z0));
      g.nrm.push(d[0] * 127, d[1] * 127, d[2] * 127);
      g.uv.push(UVS[c][0], UVS[c][1]);
      g.data.push(layer, s, b, 0.95);
      g.tint.push(255, 255, 255);
    }
    g.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    g.n += 4;
  }
}

function emitPortal(g, vol, i, lx, y, lz, layer, id) {
  const xm = vol[i - 1], xp = vol[i + 1], zm = vol[i - W], zp = vol[i + W];
  const alongX = (xm === id || xp === id || xm === B.OBSIDIAN || xp === B.OBSIDIAN) && !(zm === id || zp === id);
  const x0 = alongX ? 0 : 0.375, x1 = alongX ? 1 : 0.625;
  const z0 = alongX ? 0.375 : 0, z1 = alongX ? 0.625 : 1;
  let mask = 63;
  if (y < CH - 1 && vol[i + WW] === id) mask &= ~(1 << 2);
  if (y > 0 && vol[i - WW] === id) mask &= ~(1 << 3);
  if (alongX) {
    if (xp === id) mask &= ~(1 << 0);
    if (xm === id) mask &= ~(1 << 1);
  } else {
    if (zp === id) mask &= ~(1 << 4);
    if (zm === id) mask &= ~(1 << 5);
  }
  emitBox(g, lx, y, lz, x0, 0, z0, x1, 1, z1, layer, sky[i], 15, mask);
}

function emitEgg(g, i, lx, y, lz, layer) {
  const s = sky[i], b = Math.max(8, blk[i]);
  emitBox(g, lx, y, lz, 2 / 16, 0, 2 / 16, 14 / 16, 6 / 16, 14 / 16, layer, s, b);
  emitBox(g, lx, y, lz, 3 / 16, 6 / 16, 3 / 16, 13 / 16, 12 / 16, 13 / 16, layer, s, b);
  emitBox(g, lx, y, lz, 5 / 16, 12 / 16, 5 / 16, 11 / 16, 16 / 16, 11 / 16, layer, s, b);
}

function hashi(x, y, z) {
  let h = (Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(z, 83492791)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return (h & 0xffff) / 65536;
}

function emitCross(g, i, lx, y, lz, layer, tinted, tintAt, id) {
  const s = sky[i], b = blk[i];
  const isCrop = BLOCKS[id] && BLOCKS[id].crop;
  const ox = isCrop ? 0 : (hashi(lx, y, lz) - 0.5) * 0.3;
  const oz = isCrop ? 0 : (hashi(lz, y, lx) - 0.5) * 0.3;
  const t = tinted ? tintAt(lx, lz) : [1, 1, 1];
  const quads = [
    [[0.15, 0, 0.15], [0.85, 0, 0.85]],
    [[0.85, 0, 0.15], [0.15, 0, 0.85]],
  ];
  for (const [a, c] of quads) {
    const base = g.n;
    const pts = [[a[0], 0, a[2]], [c[0], 0, c[2]], [c[0], 1, c[2]], [a[0], 1, c[2]]];
    for (let k = 0; k < 4; k++) {
      const p = pts[k];
      g.pos.push(lx + p[0] + ox, y + p[1] * 0.95, lz + p[2] + oz);
      g.nrm.push(0, 127, 0);
      g.uv.push(UVS[k][0], UVS[k][1]);
      g.data.push(p[1] > 0 ? layer + 1000 : layer, s, b, 0.9);
      g.tint.push(t[0] * 255, t[1] * 255, t[2] * 255);
    }
    g.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    g.n += 4;
  }
}

function emitTorch(g, i, lx, y, lz, layer) {
  const s = sky[i], b = 15;
  const x0 = 7 / 16, x1 = 9 / 16, y1 = 10 / 16;
  for (let f = 0; f < 6; f++) {
    const d = DIRS[f];
    const base = g.n;
    for (let c = 0; c < 4; c++) {
      const cr = CORNERS[f][c];
      const px = cr[0] ? x1 : x0, py = cr[1] ? y1 : 0, pz = cr[2] ? x1 : x0;
      g.pos.push(lx + px, y + py, lz + pz);
      g.nrm.push(d[0] * 127, d[1] * 127, d[2] * 127);
      let u, v;
      if (f === 2 || f === 3) { u = 7 / 16 + UVS[c][0] * 2 / 16; v = 8 / 16 + UVS[c][1] * 2 / 16; }
      else { u = 7 / 16 + UVS[c][0] * 2 / 16; v = UVS[c][1] * y1; }
      g.uv.push(u, v);
      g.data.push(layer, s, b, 1);
      g.tint.push(255, 255, 255);
    }
    g.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    g.n += 4;
  }
}

function emitLiquid(g, i, lx, y, lz, f, lowered, layer, isWater) {
  const d = DIRS[f];
  const ni = i + NOFF[f];
  const outside = f === 2 && y === CH - 1;
  const s = outside ? 15 : Math.max(sky[ni], sky[i]), b = outside ? 0 : Math.max(blk[ni], blk[i]);
  const base = g.n;
  const top = lowered ? 0.875 : 1;
  for (let c = 0; c < 4; c++) {
    const cr = CORNERS[f][c];
    const py = cr[1] ? top : 0;
    g.pos.push(lx + cr[0], y + py, lz + cr[2]);
    g.nrm.push(d[0] * 127, d[1] * 127, d[2] * 127);
    g.uv.push(UVS[c][0], UVS[c][1]);
    g.data.push(isWater ? ((f === 2 && lowered) ? 1 : 0) : layer, s, b, 1);
    g.tint.push(255, 255, 255);
  }
  g.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  g.n += 4;
}
