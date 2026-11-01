import { Simplex, hash2, hash3, mulberry32, fbm2 } from './noise.js';
import { CS, CH, SEA } from './constants.js';
import { B } from './blocks.js';

export const BIOME_NAMES = ['海', '砂浜', '平原', '森林', '白樺の森', '砂漠', 'サバンナ', 'タイガ', '雪原', '山岳', '雪山', '凍った海', '川', 'ネザーの荒地', 'ソウルサンドの谷', 'ネザー要塞', 'ジ・エンド'];
export const BI = {
  OCEAN: 0, BEACH: 1, PLAINS: 2, FOREST: 3, BIRCH: 4, DESERT: 5, SAVANNA: 6, TAIGA: 7,
  SNOWY: 8, MOUNTAIN: 9, PEAKS: 10, FROZEN_OCEAN: 11, RIVER: 12,
  NETHER_WASTES: 13, SOUL_VALLEY: 14, NETHER_FORTRESS: 15, THE_END: 16,
};

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;

const TREE_DENSITY = [0, 0, 0.003, 0.045, 0.035, 0.008, 0.006, 0.035, 0.006, 0.008, 0, 0, 0];

export function strongholdPositions(seed) {
  const rng = mulberry32((seed ^ 0x5f3759df) | 0);
  const baseA = rng() * Math.PI * 2;
  const out = [];
  for (let i = 0; i < 3; i++) {
    const a = baseA + (i * Math.PI * 2) / 3 + (rng() - 0.5) * 0.35;
    const dist = 280 + rng() * 140;
    const cx = Math.round((Math.cos(a) * dist) / CS);
    const cz = Math.round((Math.sin(a) * dist) / CS);
    out.push({ cx, cz, x: cx * CS + 8, y: 29, z: cz * CS + 8 });
  }
  return out;
}

export function nearestStronghold(seed, x, z) {
  const list = strongholdPositions(seed);
  let best = list[0], bd = Infinity;
  for (const s of list) {
    const d = (s.x - x) ** 2 + (s.z - z) ** 2;
    if (d < bd) { bd = d; best = s; }
  }
  return best;
}

export function endPillars(seed) {
  const rng = mulberry32((seed ^ 0x9e3779b9) | 0);
  const hs = [76, 79, 82, 85, 88, 91, 94, 97, 100, 84];
  for (let i = hs.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [hs[i], hs[j]] = [hs[j], hs[i]];
  }
  const out = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const r = 38;
    out.push({
      x: Math.round(Math.cos(a) * r),
      z: Math.round(Math.sin(a) * r),
      rad: i % 3 === 0 ? 3 : 2,
      topY: hs[i],
    });
  }
  return out;
}

export function fortressCenterForRegion(seed, rx, rz) {
  if (rx === 0 && rz === 0) return { cx: 4, cz: 0 };
  const h = hash2(rx, rz, (seed ^ 0x13579bdf) | 0);
  const h2 = hash2(rz, rx, (seed ^ 0x2468ace0) | 0);
  return { cx: rx * 14 + 3 + Math.floor(h * 8), cz: rz * 14 + 3 + Math.floor(h2 * 8) };
}

export function isFortressChunk(seed, cx, cz) {
  const rx = Math.floor(cx / 14), rz = Math.floor(cz / 14);
  const fc = fortressCenterForRegion(seed, rx, rz);
  const dx = cx - fc.cx, dz = cz - fc.cz;
  if (Math.abs(dx) <= 2 && dz === 0) return { center: dx === 0 && dz === 0, bridgeX: true, fc };
  if (Math.abs(dz) <= 2 && dx === 0) return { center: false, bridgeZ: true, fc };
  return null;
}

export class Generator {
  constructor(seed, dim = 'overworld') {
    this.seed = seed | 0;
    this.dim = dim;
    const S = (i) => new Simplex((this.seed * 31 + i * 7919) | 0);
    this.nCont = S(1); this.nEros = S(2); this.nPeak = S(3); this.nDet = S(4);
    this.nTemp = S(5); this.nHum = S(6); this.nRiver = S(7);
    this.nC1 = S(8); this.nC2 = S(9); this.nCheese = S(10); this.nFloor = S(11);
    this.strongholds = strongholdPositions(this.seed);
    this.pillars = endPillars(this.seed);
  }

  climate(x, z) {
    const t = fbm2(this.nTemp, x / 1100, z / 1100, 3) * 1.7 + this.nDet.noise2(x / 50, z / 50) * 0.03;
    const m = fbm2(this.nHum, x / 900, z / 900, 3) * 1.7;
    return [t, m];
  }

  grassColor(x, z) {
    if (this.dim !== 'overworld') return [0.55, 0.65, 0.45];
    const [t, m] = this.climate(x, z);
    const t01 = clamp((t + 1) * 0.5, 0, 1);
    const m01 = clamp((m + 1) * 0.5, 0, 1);
    const cold = [0.42, 0.62, 0.50], temp = [0.40, 0.70, 0.26], hotDry = [0.74, 0.70, 0.32], hotWet = [0.26, 0.70, 0.16];
    const hot = [lerp(hotDry[0], hotWet[0], m01), lerp(hotDry[1], hotWet[1], m01), lerp(hotDry[2], hotWet[2], m01)];
    let c;
    if (t01 < 0.5) { const k = t01 / 0.5; c = [lerp(cold[0], temp[0], k), lerp(cold[1], temp[1], k), lerp(cold[2], temp[2], k)]; }
    else { const k = (t01 - 0.5) / 0.5; c = [lerp(temp[0], hot[0], k), lerp(temp[1], hot[1], k), lerp(temp[2], hot[2], k)]; }
    return c;
  }

  column(x, z) {
    if (this.dim === 'nether') {
      const cx = Math.floor(x / CS), cz = Math.floor(z / CS);
      if (isFortressChunk(this.seed, cx, cz)) return { h: 55, b: BI.NETHER_FORTRESS, t: 1, m: 0, river: 0, mt: 0 };
      const sv = this.nTemp.noise2(x / 200, z / 200);
      return { h: 48, b: sv < -0.25 ? BI.SOUL_VALLEY : BI.NETHER_WASTES, t: 1, m: 0, river: 0, mt: 0 };
    }
    if (this.dim === 'end') {
      return { h: 60, b: BI.THE_END, t: 0, m: 0, river: 0, mt: 0 };
    }
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
    if (this.dim === 'nether') return this.generateNether(cx, cz);
    if (this.dim === 'end') return this.generateEnd(cx, cz);
    return this.generateOverworld(cx, cz);
  }

  generateOverworld(cx, cz) {
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

    // trees
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

    // ground plants + pumpkin/melon patches
    const patchRng = hash2(cx, cz, this.seed + 313);
    const hasPumpkin = patchRng < 0.035;
    const hasMelon = patchRng > 0.965;
    const px0 = Math.floor(hash2(cx, cz, this.seed + 314) * 10) + 3;
    const pz0 = Math.floor(hash2(cz, cx, this.seed + 315) * 10) + 3;

    for (let z = 0; z < CS; z++) for (let x = 0; x < CS; x++) {
      const col = cols[x + z * CS];
      const y = col.h + 1;
      if (y >= CH) continue;
      const below = data[idx(x, col.h, z)];
      if (data[idx(x, y, z)] !== B.AIR) continue;
      const hp = hash2(x0 + x, z0 + z, this.seed + 99);
      if (below === B.GRASS) {
        if (hasPumpkin && Math.abs(x - px0) <= 2 && Math.abs(z - pz0) <= 2 && hp < 0.28) {
          data[idx(x, y, z)] = B.PUMPKIN; continue;
        }
        if (hasMelon && col.m > 0.15 && Math.abs(x - px0) <= 2 && Math.abs(z - pz0) <= 2 && hp < 0.3) {
          data[idx(x, y, z)] = B.MELON; continue;
        }
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

    // strongholds (End Portal room + Stone Brick library & stairwell)
    for (const sh of this.strongholds) {
      if (cx === sh.cx && cz === sh.cz) this.buildPortalRoom(data, idx);
      else if (cx === sh.cx - 1 && cz === sh.cz) this.buildStrongholdHall(data, idx, 'east');
      else if (cx === sh.cx && cz === sh.cz - 1) this.buildStrongholdHall(data, idx, 'south');
    }

    return data;
  }

  buildPortalRoom(data, idx) {
    const y0 = 26;
    const brick = (x, y, z) => (hash3(x, y, z, this.seed + 501) < 0.22 ? B.MOSSY_COBBLE : B.STONE_BRICKS);
    for (let y = y0; y <= y0 + 9; y++) {
      for (let z = 2; z <= 13; z++) for (let x = 2; x <= 13; x++) {
        const wall = x === 2 || x === 13 || z === 2 || z === 13 || y === y0 || y === y0 + 9;
        data[idx(x, y, z)] = wall ? brick(x, y, z) : B.AIR;
      }
    }
    // doorway to west & north halls
    for (let y = y0 + 1; y <= y0 + 3; y++) {
      for (let z = 7; z <= 8; z++) data[idx(2, y, z)] = B.AIR;
      for (let x = 7; x <= 8; x++) data[idx(x, y, 2)] = B.AIR;
    }
    // raised dais + lava pool under portal
    for (let z = 5; z <= 10; z++) for (let x = 5; x <= 10; x++) {
      data[idx(x, y0 + 1, z)] = B.STONE_BRICKS;
      data[idx(x, y0 + 2, z)] = B.STONE_BRICKS;
    }
    for (let z = 7; z <= 9; z++) for (let x = 7; x <= 9; x++) {
      data[idx(x, y0 + 1, z)] = B.STONE_BRICKS;
      data[idx(x, y0 + 2, z)] = B.LAVA;
      data[idx(x, y0 + 3, z)] = B.AIR;
    }
    // stairs up to portal ring
    for (let z = 7; z <= 9; z++) {
      data[idx(4, y0 + 1, z)] = B.STONE_SLAB;
      data[idx(5, y0 + 2, z)] = B.STONE_BRICKS;
      data[idx(5, y0 + 3, z)] = B.STONE_SLAB;
    }
    // 12 End Portal Frames around (7..9, y0+3=29, 7..9)
    const frames = [
      [7, 6], [8, 6], [9, 6],
      [7, 10], [8, 10], [9, 10],
      [6, 7], [6, 8], [6, 9],
      [10, 7], [10, 8], [10, 9],
    ];
    frames.forEach(([fx, fz], fi) => {
      data[idx(fx, y0 + 2, fz)] = B.STONE_BRICKS;
      const eye = hash2(fx + fi, fz, this.seed + 509) < 0.25;
      data[idx(fx, y0 + 3, fz)] = eye ? B.END_PORTAL_FRAME_EYE : B.END_PORTAL_FRAME;
    });
    // torches
    data[idx(3, y0 + 4, 3)] = B.TORCH;
    data[idx(12, y0 + 4, 3)] = B.TORCH;
    data[idx(3, y0 + 4, 12)] = B.TORCH;
    data[idx(12, y0 + 4, 12)] = B.TORCH;
  }

  buildStrongholdHall(data, idx, dir) {
    const y0 = 26;
    for (let y = y0; y <= y0 + 6; y++) {
      for (let z = 4; z <= 11; z++) for (let x = 4; x <= 15; x++) {
        const rx = dir === 'east' ? x : z, rz = dir === 'east' ? z : x;
        if (rx < 4 || rx > 15 || rz < 4 || rz > 11) continue;
        const wall = rx === 4 || rz === 4 || rz === 11 || y === y0 || y === y0 + 6;
        data[idx(rx, y, rz)] = wall ? B.STONE_BRICKS : B.AIR;
      }
    }
    // bookshelves library Touch
    for (let y = y0 + 1; y <= y0 + 3; y++) {
      if (dir === 'east') {
        for (let x = 6; x <= 11; x += 2) { data[idx(x, y, 5)] = B.BOOKSHELF; data[idx(x, y, 10)] = B.BOOKSHELF; }
      }
    }
    data[idx(8, y0 + 1, 8)] = B.TORCH;
  }

  generateNether(cx, cz) {
    const data = new Uint8Array(CS * CS * CH);
    const x0 = cx * CS, z0 = cz * CS;
    const idx = (x, y, z) => x + z * CS + y * CS * CS;
    const NH = 128, LAVA_SEA = 31;

    for (let z = 0; z < CS; z++) for (let x = 0; x < CS; x++) {
      const wx = x0 + x, wz = z0 + z;
      const soul = this.nTemp.noise2(wx / 200, wz / 200) < -0.25;
      for (let y = 0; y < NH; y++) {
        if (y === 0 || y === NH - 1) { data[idx(x, y, z)] = B.BEDROCK; continue; }
        if (y < 4 && hash3(wx, y, wz, this.seed + 11) < 1 - y / 4) { data[idx(x, y, z)] = B.BEDROCK; continue; }
        if (y > NH - 5 && hash3(wx, y, wz, this.seed + 12) < 1 - (NH - 1 - y) / 4) { data[idx(x, y, z)] = B.BEDROCK; continue; }

        // 3D cavern density: solid floor & ceiling, open mid-halls around y=34..92
        const n1 = this.nC1.noise3(wx / 64, y / 28, wz / 64);
        const n2 = this.nCheese.noise3(wx / 32, y / 20, wz / 32) * 0.45;
        let bias = 0;
        if (y < 26) bias = (26 - y) / 18;
        else if (y > 98) bias = (y - 98) / 22;
        else bias = -0.26 + Math.abs(y - 60) * 0.004;
        const solid = (n1 + n2 + bias) > 0.05;
        if (solid) data[idx(x, y, z)] = B.NETHERRACK;
        else if (y <= LAVA_SEA) data[idx(x, y, z)] = B.LAVA;
      }

      // Soul sand / gravel surface passes
      for (let y = LAVA_SEA; y < 95; y++) {
        if (data[idx(x, y, z)] === B.NETHERRACK && data[idx(x, y + 1, z)] === B.AIR) {
          if (soul) {
            data[idx(x, y, z)] = B.SOUL_SAND;
            if (data[idx(x, y - 1, z)] === B.NETHERRACK) data[idx(x, y - 1, z)] = B.SOUL_SAND;
          } else if (y <= LAVA_SEA + 2 && this.nFloor.noise2(wx / 28, wz / 28) > 0.25) {
            data[idx(x, y, z)] = B.GRAVEL;
          }
        }
      }
    }

    // Quartz & Gold veins + Glowstone ceiling clusters
    const rng = mulberry32((Math.imul(cx, 73856093) ^ Math.imul(cz, 19349663) ^ (this.seed + 909)) | 0);
    const vein = (id, count, size, minY, maxY) => {
      for (let n = 0; n < count; n++) {
        let x = Math.floor(rng() * CS), z = Math.floor(rng() * CS), y = Math.floor(minY + rng() * (maxY - minY));
        for (let s = 0; s < size; s++) {
          if (x >= 0 && x < CS && z >= 0 && z < CS && y > 1 && y < NH - 2) {
            const i = idx(x, y, z);
            if (data[i] === B.NETHERRACK) data[i] = id;
          }
          const d = Math.floor(rng() * 6);
          if (d === 0) x++; else if (d === 1) x--; else if (d === 2) y++; else if (d === 3) y--; else if (d === 4) z++; else z--;
        }
      }
    };
    vein(B.QUARTZ_ORE, 22, 8, 10, 118);
    vein(B.GOLD_ORE, 8, 6, 15, 110);

    // Glowstone clusters hanging from Netherrack ceilings
    for (let c = 0; c < 10; c++) {
      const gx = 2 + Math.floor(rng() * (CS - 4)), gz = 2 + Math.floor(rng() * (CS - 4));
      for (let y = NH - 3; y > 42; y--) {
        if (data[idx(gx, y, gz)] === B.NETHERRACK && data[idx(gx, y - 1, gz)] === B.AIR) {
          const len = 2 + Math.floor(rng() * 4);
          for (let dy = 1; dy <= len; dy++) {
            const rad = dy === 1 ? 2 : (dy < len ? 1 : 0);
            for (let dz = -rad; dz <= rad; dz++) for (let dx = -rad; dx <= rad; dx++) {
              if (Math.abs(dx) + Math.abs(dz) > rad + (rng() < 0.4 ? 1 : 0)) continue;
              const xx = gx + dx, zz = gz + dz, yy = y - dy;
              if (xx >= 0 && xx < CS && zz >= 0 && zz < CS && data[idx(xx, yy, zz)] === B.AIR) data[idx(xx, yy, zz)] = B.GLOWSTONE;
            }
          }
          break;
        }
      }
    }

    // Nether Fortress bridges & central courtyard
    const fort = isFortressChunk(this.seed, cx, cz);
    if (fort) {
      const fy = 54;
      if (fort.center) {
        for (let z = 1; z < CS - 1; z++) for (let x = 1; x < CS - 1; x++) {
          for (let y = fy + 1; y <= fy + 8; y++) data[idx(x, y, z)] = B.AIR;
          data[idx(x, fy, z)] = B.NETHER_BRICKS;
          data[idx(x, fy - 1, z)] = B.NETHER_BRICKS;
          const rim = x === 1 || x === CS - 2 || z === 1 || z === CS - 2;
          if (rim) {
            data[idx(x, fy + 1, z)] = B.NETHER_BRICKS;
            if ((x + z) % 2 === 0) data[idx(x, fy + 2, z)] = B.NETHER_BRICKS;
          }
        }
        // Corner towers + support pillars down to solid/floor
        for (const [px, pz] of [[2, 2], [13, 2], [2, 13], [13, 13]]) {
          for (let y = fy - 2; y >= 1; y--) {
            if (data[idx(px, y, pz)] === B.NETHERRACK || data[idx(px, y, pz)] === B.BEDROCK) break;
            for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) data[idx(px + dx, y, pz + dz)] = B.NETHER_BRICKS;
          }
          data[idx(px, fy + 2, pz)] = B.TORCH;
        }
        // Central Blaze altar
        for (let z = 6; z <= 9; z++) for (let x = 6; x <= 9; x++) data[idx(x, fy + 1, z)] = B.NETHER_BRICKS;
        data[idx(7, fy + 2, 7)] = B.GLOWSTONE;
      } else {
        for (let i = 0; i < CS; i++) {
          for (let w = 5; w <= 10; w++) {
            const x = fort.bridgeX ? i : w;
            const z = fort.bridgeX ? w : i;
            for (let y = fy + 1; y <= fy + 5; y++) data[idx(x, y, z)] = B.AIR;
            data[idx(x, fy, z)] = B.NETHER_BRICKS;
            data[idx(x, fy - 1, z)] = B.NETHER_BRICKS;
            if (w === 5 || w === 10) {
              data[idx(x, fy + 1, z)] = B.NETHER_BRICKS;
              if (i % 2 === 0) data[idx(x, fy + 2, z)] = B.NETHER_BRICKS;
            }
          }
        }
        // Support pillar in middle of chunk
        for (let y = fy - 2; y >= 1; y--) {
          if (data[idx(8, y, 8)] === B.NETHERRACK || data[idx(8, y, 8)] === B.BEDROCK) break;
          for (let dz = 7; dz <= 8; dz++) for (let dx = 7; dx <= 8; dx++) data[idx(dx, y, dz)] = B.NETHER_BRICKS;
        }
      }
    }

    return data;
  }

  generateEnd(cx, cz) {
    const data = new Uint8Array(CS * CS * CH);
    const x0 = cx * CS, z0 = cz * CS;
    const idx = (x, y, z) => x + z * CS + y * CS * CS;

    for (let z = 0; z < CS; z++) for (let x = 0; x < CS; x++) {
      const wx = x0 + x, wz = z0 + z;
      const dist = Math.hypot(wx, wz);
      // Central End Island
      const rim = 57 + this.nDet.noise2(wx / 22, wz / 22) * 6;
      if (dist < rim) {
        const t = dist / rim;
        const top = Math.round(60 + this.nDet.noise2(wx / 30, wz / 30) * 2.5 - t * t * 3);
        const bot = Math.round(24 + t * t * 34 + Math.abs(this.nEros.noise2(wx / 18, wz / 18)) * 8);
        for (let y = Math.max(8, bot); y <= top; y++) data[idx(x, y, z)] = B.END_STONE;
      } else if (dist > 155) {
        // Outer floating End islands
        const isl = fbm2(this.nCont, wx / 90, wz / 90, 3);
        if (isl > 0.25) {
          const th = (isl - 0.25) * 26;
          const top = Math.round(58 + this.nDet.noise2(wx / 24, wz / 24) * 3);
          const bot = Math.max(30, Math.round(top - th));
          for (let y = bot; y <= top; y++) data[idx(x, y, z)] = B.END_STONE;
        }
      }

      // Obsidian Pillars
      for (const p of this.pillars) {
        const dx = wx - p.x, dz = wz - p.z;
        if (dx * dx + dz * dz <= p.rad * p.rad + 0.5) {
          for (let y = 46; y <= p.topY; y++) data[idx(x, y, z)] = B.OBSIDIAN;
          if (wx === p.x && wz === p.z) data[idx(x, p.topY, z)] = B.BEDROCK;
        }
      }

      // Center Bedrock Exit Portal fountain (unlit initially)
      if (Math.abs(wx) <= 3 && Math.abs(wz) <= 3) {
        const adx = Math.abs(wx), adz = Math.abs(wz);
        if (adx + adz <= 4) {
          for (let y = 60; y <= 68; y++) data[idx(x, y, z)] = B.AIR;
          data[idx(x, 58, z)] = B.END_STONE;
          data[idx(x, 59, z)] = B.BEDROCK;
          const isRim = (adx === 2 && adz <= 1) || (adz === 2 && adx <= 1) || (adx === 2 && adz === 2 && false);
          if (isRim || (adx === 2 && adz <= 1) || (adz === 2 && adx <= 1)) data[idx(x, 60, z)] = B.BEDROCK;
          if (wx === 0 && wz === 0) {
            for (let y = 60; y <= 63; y++) data[idx(x, y, z)] = B.BEDROCK;
          }
        }
      }
      if (Math.abs(wx) + Math.abs(wz) === 1) data[idx(x, 62, z)] = B.TORCH;

      // Obsidian arrival platform at (48..52, 58, -2..2)
      if (wx >= 48 && wx <= 52 && wz >= -2 && wz <= 2) {
        data[idx(x, 58, z)] = B.OBSIDIAN;
        for (let y = 59; y <= 63; y++) data[idx(x, y, z)] = B.AIR;
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
    if (this.dim === 'end') return { x: 50.5, y: 59.05, z: 0.5 };
    if (this.dim === 'nether') return { x: 64.5, y: 56, z: 8.5 };
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
