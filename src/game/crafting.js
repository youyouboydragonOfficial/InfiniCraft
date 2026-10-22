import { B } from '../world/blocks.js';
import { I, TOOL_ID } from './items.js';

const RECIPES = [];
function shaped(pattern, keyMap, out, count = 1) {
  RECIPES.push({ pattern, keyMap, out, count, w: Math.max(...pattern.map(r => r.length)), h: pattern.length });
}
const PL = [B.PLANKS, B.BIRCH_PLANKS, B.SPRUCE_PLANKS];

shaped(['L'], { L: [B.LOG] }, B.PLANKS, 4);
shaped(['L'], { L: [B.BIRCH_LOG] }, B.BIRCH_PLANKS, 4);
shaped(['L'], { L: [B.SPRUCE_LOG] }, B.SPRUCE_PLANKS, 4);
shaped(['P', 'P'], { P: PL }, I.STICK, 4);
shaped(['PP', 'PP'], { P: PL }, B.CRAFTING_TABLE);
shaped(['CCC', 'C C', 'CCC'], { C: [B.COBBLE] }, B.FURNACE);
shaped(['C', 'S'], { C: [I.COAL], S: [I.STICK] }, B.TORCH, 4);
shaped(['SS', 'SS'], { S: [B.SAND] }, B.SANDSTONE);
shaped(['SS', 'SS'], { S: [B.STONE] }, B.STONE_BRICKS, 4);
shaped(['PPP', 'SSS', 'PPP'], { P: PL, S: [I.STICK] }, B.BOOKSHELF);
shaped(['GGG', 'GTG', 'GGG'], { G: [B.GLASS], T: [B.TORCH] }, B.LAMP, 2);
shaped(['CL'], { C: [B.COBBLE], L: [B.LEAVES] }, B.MOSSY_COBBLE);
shaped(['SS', 'SS'], { S: [B.SNOW_GRASS] }, B.SNOW);
for (const [ing, blk] of [[I.IRON_INGOT, B.IRON_BLOCK], [I.GOLD_INGOT, B.GOLD_BLOCK], [I.DIAMOND, B.DIAMOND_BLOCK], [I.COAL, B.COAL_BLOCK]]) {
  shaped(['XXX', 'XXX', 'XXX'], { X: [ing] }, blk);
  shaped(['X'], { X: [blk] }, ing, 9);
}
const MATS = [['wood', PL], ['stone', [B.COBBLE]], ['iron', [I.IRON_INGOT]], ['gold', [I.GOLD_INGOT]], ['diamond', [I.DIAMOND]]];
for (const [m, X] of MATS) {
  shaped(['XXX', ' S ', ' S '], { X, S: [I.STICK] }, TOOL_ID[m + '_pickaxe']);
  shaped(['XX', 'XS', ' S'], { X, S: [I.STICK] }, TOOL_ID[m + '_axe']);
  shaped(['X', 'S', 'S'], { X, S: [I.STICK] }, TOOL_ID[m + '_shovel']);
  shaped(['X', 'X', 'S'], { X, S: [I.STICK] }, TOOL_ID[m + '_sword']);
}

// grid: array of slots (null | {id,count}), size n*n
export function matchRecipe(grid, n) {
  let minX = n, minY = n, maxX = -1, maxY = -1;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (grid[x + y * n]) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  if (maxX < 0) return null;
  const w = maxX - minX + 1, h = maxY - minY + 1;
  for (const r of RECIPES) {
    if (r.w !== w || r.h !== h) continue;
    for (const mirror of [false, true]) {
      let ok = true;
      for (let y = 0; y < h && ok; y++) for (let x = 0; x < w && ok; x++) {
        const row = r.pattern[y] || '';
        const ch = row[mirror ? (w - 1 - x) : x] || ' ';
        const s = grid[(minX + x) + (minY + y) * n];
        if (ch === ' ') { if (s) ok = false; }
        else if (!s || !r.keyMap[ch].includes(s.id)) ok = false;
      }
      if (ok) return { id: r.out, count: r.count };
    }
  }
  return null;
}

export const SMELT = {
  [B.IRON_ORE]: I.IRON_INGOT, [B.GOLD_ORE]: I.GOLD_INGOT, [B.SAND]: B.GLASS, [B.COBBLE]: B.STONE,
  [I.RAW_PORK]: I.COOKED_PORK, [B.CLAY]: B.BRICKS, [B.LOG]: I.COAL, [B.BIRCH_LOG]: I.COAL, [B.SPRUCE_LOG]: I.COAL,
  [B.SNOW]: B.ICE,
};
