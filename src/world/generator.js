import { Simplex, hash2, hash3, mulberry32, fbm2 } from './noise.js';
import { CS, CH, SEA } from './constants.js';
import { B } from './blocks.js';

export const BIOME_NAMES = ['海', '砂浜', '平原', '森林', '白樺の森', '砂漠', 'サバンナ', 'タイガ', '雪原', '山岳', '雪山', '凍った海', '川'];
export const BI = { OCEAN: 0, BEACH: 1, PLAINS: 2, FOREST: 3, BIRCH: 4, DESERT: 5, SAVANNA: 6, TAIGA: 7, SNOWY: 8, MOUNTAIN: 9, PEAKS: 10, FROZEN_OCEAN: 11, RIVER: 12 };

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;

const TREE_DENSITY = [0, 0, 0.003, 0.045, 0.035, 0.008, 0.006, 0.035, 0.006, 0.008, 0, 0, 0];

export class Generator {
  constructor(seed) {
    this.seed = seed | 0;
    const S = (i) => new Simplex((this.seed * 31 + i * 7919) | 0);
    this.nCont = S(1); this.nEros = S(2); this.nPeak = S(3); this.nDet = S(4);
    this.nTemp = S(5); this.nHum = S(6); this.nRiver = S(7);
    this.nC1 = S(8); this.nC2 = S(9); this.nCheese = S(10); this.nFloor = S(11);
  }

  climate(x, z) {
    const t = fbm2(this.nTemp, x / 1100, z / 1100, 3) * 1.7 + this.nDet.noise2(x / 50, z / 50) * 0.03;
    const m = fbm2(this.nHum, x / 900, z / 900, 3) * 1.7;
    return [t, m];
  }

  grassColor(x, z) {
    const [t, m] = this.climate(x, z);
    const t01 = clamp((t + 1) * 0.5, 0, 1);
    const m01 = clamp((m + 1) * 0.5, 0, 1);
    // cold -> temperate -> hot dry / hot wet
    const cold = [0.42, 0.62, 0.50], temp = [0.40, 0.70, 0.26], hotDry = [0.74, 0.70, 0.32], hotWet = [0.26, 0.70, 0.16];
    const hot = [lerp(hotDry[0], hotWet[0], m01), lerp(hotDry[1], hotWet[1], m01), lerp(hotDry[2], hotWet[2], m01)];
    let c;
    if (t01 < 0.5) { const k = t01 / 0.5; c = [lerp(cold[0], temp[0], k), lerp(cold[1], temp[1], k), lerp(cold[2], temp[2], k)]; }
    else { const k = (t01 - 0.5) / 0.5; c = [lerp(temp[0], hot[0], k), lerp(temp[1], hot[1], k), lerp(temp[2], hot[2], k)]; }
    return c;
  }

  column(x, z) {
    const c = fbm2(this.nCont, x / 800, z / 800, 5) * 1.6;
    const e = fbm2(this.nEros, x / 450, z / 450, 3) * 1.6;
    let h;
    if (c < -0.3) h = SEA - 30 + (Math.max(c, -1) + 1) / 0.7 * 25;
    else if (c < -0.08) h = SEA - 5 + (c + 0.3) / 0.22 * 7;
    else h = SEA + 2 + (c + 0.08) * 26;
    const mt = clamp(c * 2.2 + 0.1, 0, 1) * clamp((0.2 - e) * 1.5, 0, 1);
    let r = 1 - Math.abs(fbm2(this.nPeak, x / 280, z / 280, 4) * 1.5);
    r = clamp(r, 0, 1);
    h += mt * (r * r * r * 100 + 12 * r);
    const hill = 3 + clamp(1 - Math.abs(e), 0, 1) * 6;
    h += fbm2(this.nDet, x / 75, z / 75, 3) * (hill + mt * 10);

    let river = 0;
    const rv = Math.abs(fbm2(this.nRiver, x / 600, z / 600, 3));
    if (h > SEA - 4) {
      const w = 0.05;
      if (rv < w) {
        const t = rv / w;
        const k = t * t * (3 - 2 * t);
        const bed = SEA - 4 + t * 3;
        const nh = bed + (h - bed) * k;
        river = 1 - t;
        h = Math.min(h, nh);
      }
    }
    h = clamp(Math.floor(h), 4, CH - 12);
    const [t, m] = this.climate(x, z);

    let b;
    if (river > 0.45 && h <= SEA) b = BI.RIVER;
    else if (h < SEA - 1) b = t < -0.5 ? BI.FROZEN_OCEAN : BI.OCEAN;
    else if (h <= SEA + 1 && c < 0.05 && river < 0.2) b = t < -0.5 ? BI.SNOWY : BI.BEACH;
    else if (h > SEA + 78 || (h > SEA + 58 && t < -0.1)) b = BI.PEAKS;
    else if (mt > 0.4 && h > SEA + 40) b = BI.MOUNTAIN;
    else if (t > 0.42) b = m < -0.15 ? BI.DESERT : (m < 0.3 ? BI.SAVANNA : BI.FOREST);
    else if (t < -0.45) b = m > -0.15 ? BI.TAIGA : BI.SNOWY;
    else if (t < -0.2) b = m > 0.1 ? BI.TAIGA : BI.PLAINS;
    else b = m > 0.4 ? BI.FOREST : (m > 0.12 ? BI.BIRCH : BI.PLAINS);
    return { h, b, t, m, river, mt };
  }

  isCave(x, y, z, h) {
    if (y <= 0) return false;
    const a = this.nC1.noise3(x / 52, y / 30, z / 52);
    const b = this.nC2.noise3(x / 52, y / 30, z / 52);
    const thr = y < 40 ? 0.006 : 0.0035;
    if (a * a + b * b < thr) return true;
    if (y < h - 10 && y < 70) {
      const ch = this.nCheese.noise3(x / 85, y / 38, z / 85);
      if (ch > 0.62 - (y < 30 ? 0.05 : 0)) return true;
    }
    return false;
  }

  generate(cx, cz) {
    const data = new Uint8Array(CS * CS * CH);
    const x0 = cx * CS, z0 = cz * CS;
    const cols = new Array(CS * CS);
    const idx = (x, y, z) => x + z * CS + y * CS * CS;

    for (let z = 0; z < CS; z++) for (let x = 0; x < CS; x++) {
      const wx = x0 + x, wz = z0 + z;
      const col = this.column(wx, wz);
      cols[x + z * CS] = col;
      const { h, b } = col;
      const fd = 3 + Math.floor(hash2(wx, wz, this.seed + 5) * 2);
      let top = B.GRASS, fill = B.DIRT, deep = B.STONE;
      const fl = this.nFloor.noise2(wx / 30, wz / 30);
      switch (b) {
        case BI.OCEAN: case BI.FROZEN_OCEAN:
          top = fl > 0.35 ? B.GRAVEL : (fl < -0.45 ? B.CLAY : (h < SEA - 12 ? B.GRAVEL : B.SAND)); fill = top === B.CLAY ? B.DIRT : top; break;
        case BI.RIVER: top = fl > 0.2 ? B.GRAVEL : (fl < -0.4 ? B.CLAY : B.SAND); fill = B.DIRT; break;
        case BI.BEACH: top = B.SAND; fill = B.SAND; deep = B.SANDSTONE; break;
        case BI.DESERT: top = B.SAND; fill = B.SAND; deep = B.SANDSTONE; break;
        case BI.SNOWY: case BI.TAIGA: top = B.SNOW_GRASS; break;
        case BI.PEAKS: top = h > SEA + 70 || col.t < 0 ? B.SNOW : B.STONE; fill = B.STONE; break;
        case BI.MOUNTAIN: top = fl > 0.3 ? B.GRAVEL : (h > SEA + 62 ? B.STONE : B.GRASS); fill = top === B.GRASS ? B.DIRT : B.STONE; break;
        default: break;
      }
      if (h < SEA && (top === B.GRASS || top === B.SNOW_GRASS)) top = B.DIRT;
      for (let y = 0; y <= h; y++) {
        let id;
        if (y === 0) id = B.BEDROCK;
        else if (y < 4 && hash3(wx, y, wz, this.seed) < 1 - y / 4) id = B.BEDROCK;
        else if (y === h) id = top;
        else if (y > h - fd) id = fill;
        else if (deep === B.SANDSTONE && y > h - fd - 4) id = B.SANDSTONE;
        else id = B.STONE;
        data[idx(x, y, z)] = id;
      }
      for (let y = h + 1; y <= SEA; y++) {
        data[idx(x, y, z)] = (y === SEA && (b === BI.FROZEN_OCEAN || (b === BI.RIVER && col.t < -0.5))) ? B.ICE : B.WATER;
      }

      // caves
      const underwater = h < SEA + 2;
      const maxY = underwater ? h - 6 : h;
      for (let y = 1; y <= maxY; y++) {
        const i = idx(x, y, z);
        if (data[i] === B.BEDROCK) continue;
        if (y > h - 4 && h < SEA + 4) continue;
        if (this.isCave(wx, y, wz, h)) data[i] = y <= 10 ? B.LAVA : B.AIR;
      }
    }

    // ores
    const rng = mulberry32((Math.imul(cx, 73856093) ^ Math.imul(cz, 19349663) ^ this.seed) | 0);
    const vein = (id, count, size, minY, maxY) => {
      for (let n = 0; n < count; n++) {
        let x = Math.floor(rng() * CS), z = Math.floor(rng() * CS), y = Math.floor(minY + rng() * (maxY - minY));
        for (let s = 0; s < size; s++) {
          if (x >= 0 && x < CS && z >= 0 && z < CS && y > 0 && y < CH) {
            const i = idx(x, y, z);
            if (data[i] === B.STONE) data[i] = id;
          }
          const d = Math.floor(rng() * 6);
          if (d === 0) x++; else if (d === 1) x--; else if (d === 2) y++; else if (d === 3) y--; else if (d === 4) z++; else z--;
        }
      }
    };
    vein(B.COAL_ORE, 18, 10, 5, 130);
    vein(B.IRON_ORE, 12, 7, 5, 72);
    vein(B.GRAVEL, 3, 20, 5, 100);
    vein(B.GOLD_ORE, 3, 6, 5, 34);
    vein(B.DIAMOND_ORE, 1 + (rng() < 0.4 ? 1 : 0), 5, 3, 17);

    // trees (deterministic, includes neighbor columns so trees cross chunk borders)
    const set = (x, y, z, id, force) => {
      const lx = x - x0, lz = z - z0;
      if (lx < 0 || lx >= CS || lz < 0 || lz >= CS || y < 1 || y >= CH) return;
      const i = idx(lx, y, lz);
      const cur = data[i];
      if (force) { if (cur === B.AIR || cur === B.LEAVES || cur === B.BIRCH_LEAVES || cur === B.SPRUCE_LEAVES || cur === B.TALL_GRASS || cur === B.SNOW) data[i] = id; }
      else if (cur === B.AIR) data[i] = id;
    };
    for (let wz = z0 - 4; wz < z0 + CS + 4; wz++) for (let wx = x0 - 4; wx < x0 + CS + 4; wx++) {
      const hv = hash2(wx, wz, this.seed + 77);
      if (hv > 0.05) continue;
      const inside = wx >= x0 && wx < x0 + CS && wz >= z0 && wz < z0 + CS;
      const col = inside ? cols[(wx - x0) + (wz - z0) * CS] : this.column(wx, wz);
      if (hv >= TREE_DENSITY[col.b]) continue;
      if (col.h <= SEA || col.river > 0.25) continue;
      if (this.isCave(wx, col.h, wz, col.h)) continue;
      const hr = hash2(wx, wz, this.seed + 78);
      const y = col.h + 1;
      if (col.b === BI.DESERT) {
        if (!inside) continue;
        const ht = 1 + Math.floor(hr * 3);
        for (let k = 0; k < ht; k++) set(wx, y + k, wz, B.CACTUS);
        continue;
      }
      if (col.b === BI.MOUNTAIN && col.h > SEA + 62) continue;
      let type = 'oak';
      if (col.b === BI.TAIGA || col.b === BI.SNOWY) type = 'spruce';
      else if (col.b === BI.BIRCH) type = hr < 0.65 ? 'birch' : 'oak';
      else if (col.b === BI.FOREST) type = hr < 0.2 ? 'birch' : (hr > 0.9 ? 'bigoak' : 'oak');
      else if (col.b === BI.SAVANNA) type = 'acacia';
      this.placeTree(type, wx, y, wz, hr, set);
      set(wx, y - 1, wz, B.DIRT, false);
    }

    // ground plants
    for (let z = 0; z < CS; z++) for (let x = 0; x < CS; x++) {
      const col = cols[x + z * CS];
      const y = col.h + 1;
      if (y >= CH) continue;
      const below = data[idx(x, col.h, z)];
      if (data[idx(x, y, z)] !== B.AIR) continue;
      const hp = hash2(x0 + x, z0 + z, this.seed + 99);
      if (below === B.GRASS) {
        const dens = col.b === BI.PLAINS || col.b === BI.SAVANNA ? 0.22 : (col.b === BI.FOREST || col.b === BI.BIRCH ? 0.10 : 0.05);
        if (hp < dens) data[idx(x, y, z)] = B.TALL_GRASS;
        else if (hp < dens + 0.012) data[idx(x, y, z)] = B.DANDELION;
        else if (hp < dens + 0.022) data[idx(x, y, z)] = B.ROSE;
        else if (hp < dens + 0.026 && col.m > 0.3) data[idx(x, y, z)] = B.BLUE_FLOWER;
      } else if (below === B.SNOW_GRASS) {
        if (hp < 0.05) data[idx(x, y, z)] = B.FERN;
      } else if (below === B.SAND && col.b === BI.DESERT) {
        if (hp < 0.008) data[idx(x, y, z)] = B.DEAD_BUSH;
      }
    }
    return data;
  }

  placeTree(type, x, y, z, r, set) {
    const R = (k) => hash3(x, y, z, this.seed + k);
    if (type === 'oak' || type === 'birch') {
      const log = type === 'oak' ? B.LOG : B.BIRCH_LOG;
      const leaf = type === 'oak' ? B.LEAVES : B.BIRCH_LEAVES;
      const h = (type === 'birch' ? 5 : 4) + Math.floor(r * 37 % 3);
      const top = y + h;
      for (let dy = -3; dy <= 0; dy++) {
        const rad = dy >= -1 ? 1 : 2;
        for (let dx = -rad; dx <= rad; dx++) for (let dz = -rad; dz <= rad; dz++) {
          if (Math.abs(dx) === rad && Math.abs(dz) === rad && (dy === 0 || R(dx * 7 + dz * 13 + dy * 31) < 0.5)) continue;
          set(x + dx, top + dy, z + dz, leaf);
        }
      }
      for (let k = 0; k < h; k++) set(x, y + k, z, log, true);
    } else if (type === 'bigoak') {
      const h = 7 + Math.floor(r * 53 % 3);
      const top = y + h;
      for (let dy = -4; dy <= 1; dy++) {
        const rad = dy === 1 ? 2 : (dy >= -1 ? 3 : (dy >= -3 ? 3 : 2));
        for (let dx = -rad; dx <= rad; dx++) for (let dz = -rad; dz <= rad; dz++) {
          const d = dx * dx + dz * dz + (dy + 1) * (dy + 1) * 0.8;
          if (d > rad * rad + 0.5 + R(dx * 3 + dz * 5 + dy * 7) * 2) continue;
          set(x + dx, top + dy, z + dz, B.LEAVES);
        }
      }
      for (let k = 0; k < h; k++) set(x, y + k, z, B.LOG, true);
      set(x + 1, top - 2, z, B.LOG, true); set(x - 1, top - 3, z, B.LOG, true); set(x, top - 2, z + 1, B.LOG, true);
    } else if (type === 'spruce') {
      const h = 7 + Math.floor(r * 71 % 5);
      const top = y + h;
      let rad = 0;
      for (let yy = top + 1; yy >= y + 2; yy--) {
        const k = top + 1 - yy;
        rad = k === 0 ? 0 : (k % 2 === 1 ? Math.min(1 + (k >> 2), 3) : Math.max(0, Math.min((k >> 2), 2)));
        for (let dx = -rad; dx <= rad; dx++) for (let dz = -rad; dz <= rad; dz++) {
          if (rad > 1 && Math.abs(dx) === rad && Math.abs(dz) === rad) continue;
          set(x + dx, yy, z + dz, B.SPRUCE_LEAVES);
        }
      }
      for (let k = 0; k < h; k++) set(x, y + k, z, B.SPRUCE_LOG, true);
    } else if (type === 'acacia') {
      const h = 4 + Math.floor(r * 17 % 2);
      const dir = Math.floor(R(1) * 4);
      const ddx = [1, -1, 0, 0][dir], ddz = [0, 0, 1, -1][dir];
      let cx = x, cz = z;
      for (let k = 0; k < h; k++) {
        if (k >= h - 2) { cx += ddx; cz += ddz; }
        set(cx, y + k, cz, B.LOG, true);
      }
      const top = y + h;
      for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) {
        if (Math.abs(dx) + Math.abs(dz) > 4) continue;
        set(cx + dx, top, cz + dz, B.LEAVES);
        if (Math.abs(dx) + Math.abs(dz) <= 2) set(cx + dx, top + 1, cz + dz, B.LEAVES);
      }
    }
  }

  findSpawn() {
    for (let r = 0; r < 4000; r += 16) {
      for (let a = 0; a < 8; a++) {
        const x = Math.round(Math.cos(a * Math.PI / 4) * r), z = Math.round(Math.sin(a * Math.PI / 4) * r);
        const c = this.column(x, z);
        if (c.h > SEA + 1 && c.b !== BI.OCEAN && c.b !== BI.PEAKS && c.b !== BI.RIVER) return { x: x + 0.5, y: c.h + 2, z: z + 0.5 };
        if (r === 0) break;
      }
    }
    return { x: 0.5, y: CH - 20, z: 0.5 };
  }
}
