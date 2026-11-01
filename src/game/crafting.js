import { B } from '../world/blocks.js';
import { I, TOOL_ID, ARMOR_ID } from './items.js';

export const RECIPES = [];
function shaped(pattern, keyMap, out, count = 1) {
  RECIPES.push({ pattern, keyMap, out, count, w: Math.max(...pattern.map(r => r.length)), h: pattern.length });
}
const PL = [B.PLANKS, B.BIRCH_PLANKS, B.SPRUCE_PLANKS];
const WOOL = [B.WOOL, B.RED_WOOL, B.BLUE_WOOL, B.YELLOW_WOOL, B.GREEN_WOOL, B.BLACK_WOOL];
const S = [I.STICK];

// basics
shaped(['L'], { L: [B.LOG] }, B.PLANKS, 4);
shaped(['L'], { L: [B.BIRCH_LOG] }, B.BIRCH_PLANKS, 4);
shaped(['L'], { L: [B.SPRUCE_LOG] }, B.SPRUCE_PLANKS, 4);
shaped(['P', 'P'], { P: PL }, I.STICK, 4);
shaped(['PP', 'PP'], { P: PL }, B.CRAFTING_TABLE);
shaped(['CCC', 'C C', 'CCC'], { C: [B.COBBLE] }, B.FURNACE);
shaped(['PPP', 'P P', 'PPP'], { P: PL }, B.CHEST);
shaped(['C', 'S'], { C: [I.COAL], S }, B.TORCH, 4);
shaped(['WWW', 'PPP'], { W: WOOL, P: PL }, B.BED);
// building
shaped(['SS', 'SS'], { S: [B.SAND] }, B.SANDSTONE);
shaped(['SS', 'SS'], { S: [B.STONE] }, B.STONE_BRICKS, 4);
shaped(['SSS'], { S: [B.STONE] }, B.STONE_SLAB, 6);
shaped(['PPP'], { P: PL }, B.OAK_SLAB, 6);
shaped(['PPP', 'SSS', 'PPP'], { P: PL, S }, B.BOOKSHELF);
shaped(['GGG', 'GTG', 'GGG'], { G: [B.GLASS], T: [B.TORCH] }, B.LAMP, 2);
shaped(['CL'], { C: [B.COBBLE], L: [B.LEAVES] }, B.MOSSY_COBBLE);
shaped(['SS', 'SS'], { S: [B.SNOW_GRASS] }, B.SNOW);
shaped(['SS', 'SS'], { S: [I.STRING] }, B.WOOL);
shaped(['QQ', 'QQ'], { Q: [I.QUARTZ] }, B.QUARTZ_BLOCK);
shaped(['P', 'T'], { P: [B.PUMPKIN], T: [B.TORCH] }, B.JACK_O_LANTERN);
shaped(['MMM', 'MMM', 'MMM'], { M: [I.MELON_SLICE] }, B.MELON);
shaped(['WD'], { W: [B.WOOL], D: [B.ROSE] }, B.RED_WOOL);
shaped(['WD'], { W: [B.WOOL], D: [B.BLUE_FLOWER] }, B.BLUE_WOOL);
shaped(['WD'], { W: [B.WOOL], D: [B.DANDELION] }, B.YELLOW_WOOL);
shaped(['WD'], { W: [B.WOOL], D: [B.CACTUS] }, B.GREEN_WOOL);
shaped(['WD'], { W: [B.WOOL], D: [I.COAL] }, B.BLACK_WOOL);
for (const [ing, blk] of [[I.IRON_INGOT, B.IRON_BLOCK], [I.GOLD_INGOT, B.GOLD_BLOCK], [I.DIAMOND, B.DIAMOND_BLOCK], [I.COAL, B.COAL_BLOCK]]) {
  shaped(['XXX', 'XXX', 'XXX'], { X: [ing] }, blk);
  shaped(['X'], { X: [blk] }, ing, 9);
}
// redstone-free explosives & gear
shaped(['GSG', 'SGS', 'GSG'], { G: [I.GUNPOWDER], S: [B.SAND] }, B.TNT);
shaped(['I ', ' F'], { I: [I.IRON_INGOT], F: [I.FLINT] }, I.FLINT_AND_STEEL);
shaped([' SR', 'S R', ' SR'], { S, R: [I.STRING] }, I.BOW);
shaped(['F', 'S', 'E'], { F: [I.FLINT], S, E: [I.FEATHER] }, I.ARROW, 4);
shaped(['I I', ' I '], { I: [I.IRON_INGOT] }, I.BUCKET);
shaped(['WWW'], { W: [I.WHEAT] }, I.BREAD);
shaped(['B'], { B: [I.BONE] }, I.BONE_MEAL, 3);
shaped(['B'], { B: [I.BLAZE_ROD] }, I.BLAZE_POWDER, 2);
shaped(['PB'], { P: [I.ENDER_PEARL], B: [I.BLAZE_POWDER] }, I.EYE_OF_ENDER);
shaped(['GGG', 'GAG', 'GGG'], { G: [I.GOLD_INGOT], A: [I.APPLE] }, I.GOLDEN_APPLE);
shaped(['M'], { M: [B.MELON] }, I.MELON_SLICE, 9);
shaped(['W'], { W: [I.WHEAT] }, I.WHEAT_SEEDS, 1);
// tools
const MATS = [['wood', PL], ['stone', [B.COBBLE]], ['iron', [I.IRON_INGOT]], ['gold', [I.GOLD_INGOT]], ['diamond', [I.DIAMOND]]];
for (const [m, X] of MATS) {
  shaped(['XXX', ' S ', ' S '], { X, S }, TOOL_ID[m + '_pickaxe']);
  shaped(['XX', 'XS', ' S'], { X, S }, TOOL_ID[m + '_axe']);
  shaped(['X', 'S', 'S'], { X, S }, TOOL_ID[m + '_shovel']);
  shaped(['X', 'X', 'S'], { X, S }, TOOL_ID[m + '_sword']);
  shaped(['XX', ' S', ' S'], { X, S }, TOOL_ID[m + '_hoe']);
}
// armor
for (const [m, X] of [['leather', [I.LEATHER]], ['iron', [I.IRON_INGOT]], ['gold', [I.GOLD_INGOT]], ['diamond', [I.DIAMOND]]]) {
  shaped(['XXX', 'X X'], { X }, ARMOR_ID[m + '_helmet']);
  shaped(['X X', 'XXX', 'XXX'], { X }, ARMOR_ID[m + '_chestplate']);
  shaped(['XXX', 'X X', 'X X'], { X }, ARMOR_ID[m + '_leggings']);
  shaped(['X X', 'X X'], { X }, ARMOR_ID[m + '_boots']);
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
  [I.RAW_PORK]: I.COOKED_PORK, [I.RAW_BEEF]: I.STEAK, [I.RAW_CHICKEN]: I.COOKED_CHICKEN, [I.RAW_MUTTON]: I.COOKED_MUTTON,
  [B.CLAY]: B.BRICKS, [B.LOG]: I.COAL, [B.BIRCH_LOG]: I.COAL, [B.SPRUCE_LOG]: I.COAL,
  [B.SNOW]: B.ICE, [B.NETHERRACK]: B.NETHER_BRICKS, [B.QUARTZ_ORE]: I.QUARTZ, [B.STONE]: B.STONE_SLAB,
};
