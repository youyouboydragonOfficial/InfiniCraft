import { B, BLOCKS, SH } from '../world/blocks.js';

export const I = {
  STICK: 256, COAL: 257, IRON_INGOT: 258, GOLD_INGOT: 259, DIAMOND: 260, APPLE: 261,
  RAW_PORK: 262, COOKED_PORK: 263, ROTTEN_FLESH: 264, BREAD: 265,
  FLINT: 266, FLINT_AND_STEEL: 267, GUNPOWDER: 268, STRING: 269, FEATHER: 270, BONE: 271, LEATHER: 272,
  RAW_BEEF: 273, STEAK: 274, RAW_CHICKEN: 275, COOKED_CHICKEN: 276, RAW_MUTTON: 277, COOKED_MUTTON: 278,
  BOW: 279, ARROW: 280, BUCKET: 281, WATER_BUCKET: 282, LAVA_BUCKET: 283, WHEAT_SEEDS: 284, WHEAT: 285,
  ENDER_PEARL: 286, BLAZE_ROD: 287, BLAZE_POWDER: 288, EYE_OF_ENDER: 289, QUARTZ: 290, MELON_SLICE: 291,
  GOLDEN_APPLE: 292, BONE_MEAL: 293,
};
export const ITEMS = [];

// block items
for (const d of BLOCKS) {
  if (!d || d.id === 0) continue;
  ITEMS[d.id] = {
    id: d.id, name: d.name, stack: 64, block: d.id,
    flat: d.shape === SH.CROSS || d.shape === SH.TORCH,
    hidden: d.id === B.WATER || d.id === B.LAVA || d.id === B.NETHER_PORTAL || d.id === B.END_PORTAL ||
      d.id === B.END_PORTAL_FRAME_EYE || (d.crop && d.id !== B.WHEAT0) || d.id === B.WHEAT0 || d.id === B.FARMLAND,
  };
}

function item(id, name, o = {}) { ITEMS[id] = Object.assign({ id, name, stack: 64 }, o); }
item(I.STICK, '棒', { draw: 'stick', fuel: 5 });
item(I.COAL, '石炭', { draw: 'coal', fuel: 80 });
item(I.IRON_INGOT, '鉄インゴット', { draw: 'ingot', color: '#dcdcdc' });
item(I.GOLD_INGOT, '金インゴット', { draw: 'ingot', color: '#f8d248' });
item(I.DIAMOND, 'ダイヤモンド', { draw: 'gem', color: '#5ee6dc' });
item(I.APPLE, 'リンゴ', { draw: 'apple', food: 4, sat: 2.4 });
item(I.RAW_PORK, '生の豚肉', { draw: 'meat', color: '#f09a9a', food: 3, sat: 1.8 });
item(I.COOKED_PORK, '焼き豚', { draw: 'meat', color: '#b0643a', food: 8, sat: 12.8 });
item(I.ROTTEN_FLESH, '腐った肉', { draw: 'meat', color: '#7a8a3a', food: 4, sat: 0.8 });
item(I.BREAD, 'パン', { draw: 'bread', food: 5, sat: 6 });
item(I.FLINT, '火打石', { draw: 'flint' });
item(I.FLINT_AND_STEEL, '火打石と打ち金', { draw: 'flintsteel', stack: 1, durability: 64 });
item(I.GUNPOWDER, '火薬', { draw: 'dust', color: '#555559' });
item(I.STRING, '糸', { draw: 'string' });
item(I.FEATHER, '羽根', { draw: 'feather' });
item(I.BONE, '骨', { draw: 'bone' });
item(I.LEATHER, '革', { draw: 'leather' });
item(I.RAW_BEEF, '生の牛肉', { draw: 'steak', color: '#d04848', food: 3, sat: 1.8 });
item(I.STEAK, 'ステーキ', { draw: 'steak', color: '#8a4a26', food: 8, sat: 12.8 });
item(I.RAW_CHICKEN, '生の鶏肉', { draw: 'drumstick', color: '#f2c8b0', food: 2, sat: 1.2 });
item(I.COOKED_CHICKEN, '焼き鳥', { draw: 'drumstick', color: '#c07a3a', food: 6, sat: 7.2 });
item(I.RAW_MUTTON, '生の羊肉', { draw: 'meat', color: '#d86060', food: 2, sat: 1.2 });
item(I.COOKED_MUTTON, '焼き羊肉', { draw: 'meat', color: '#9a5030', food: 6, sat: 9.6 });
item(I.BOW, '弓', { draw: 'bow', stack: 1, durability: 384 });
item(I.ARROW, '矢', { draw: 'arrow' });
item(I.BUCKET, 'バケツ', { draw: 'bucket', stack: 16 });
item(I.WATER_BUCKET, '水入りバケツ', { draw: 'bucket', fill: '#3a7ad8', stack: 1 });
item(I.LAVA_BUCKET, '溶岩入りバケツ', { draw: 'bucket', fill: '#f07020', stack: 1, fuel: 1000 });
item(I.WHEAT_SEEDS, '小麦の種', { draw: 'seeds' });
item(I.WHEAT, '小麦', { draw: 'wheat' });
item(I.ENDER_PEARL, 'エンダーパール', { draw: 'orb', color: '#1f8a78', stack: 16 });
item(I.BLAZE_ROD, 'ブレイズロッド', { draw: 'rod', color: '#f8c030', fuel: 120 });
item(I.BLAZE_POWDER, 'ブレイズパウダー', { draw: 'dust', color: '#f8a020' });
item(I.EYE_OF_ENDER, 'エンダーアイ', { draw: 'eye', stack: 64 });
item(I.QUARTZ, 'ネザークォーツ', { draw: 'gem', color: '#efe8de' });
item(I.MELON_SLICE, 'スイカの薄切り', { draw: 'melon', food: 2, sat: 1.2 });
item(I.GOLDEN_APPLE, '金のリンゴ', { draw: 'apple', color: '#f8d248', food: 4, sat: 9.6, regen: true });
item(I.BONE_MEAL, '骨粉', { draw: 'dust', color: '#f0f0f0' });

export const MATERIALS = [
  { key: 'wood', name: '木', color: '#a87a44', tier: 1, speed: 2, dur: 59, dmg: 0 },
  { key: 'stone', name: '石', color: '#8a8a8a', tier: 2, speed: 4, dur: 131, dmg: 1 },
  { key: 'iron', name: '鉄', color: '#e2e2e2', tier: 3, speed: 6, dur: 250, dmg: 2 },
  { key: 'gold', name: '金', color: '#f8d248', tier: 1, speed: 12, dur: 32, dmg: 0 },
  { key: 'diamond', name: 'ダイヤ', color: '#5ee6dc', tier: 4, speed: 8, dur: 1561, dmg: 3 },
];
const TOOL_TYPES = [
  { key: 'pickaxe', name: 'のツルハシ', baseDmg: 2 },
  { key: 'axe', name: 'の斧', baseDmg: 4 },
  { key: 'shovel', name: 'のシャベル', baseDmg: 1.5 },
  { key: 'sword', name: 'の剣', baseDmg: 4 },
];
export const TOOL_ID = {};
let tid = 300;
for (const m of MATERIALS) for (const t of TOOL_TYPES) {
  const id = tid++;
  TOOL_ID[m.key + '_' + t.key] = id;
  item(id, m.name + t.name, {
    stack: 1, draw: t.key, color: m.color,
    tool: { type: t.key, tier: m.tier, speed: m.speed, dur: m.dur, dmg: t.baseDmg + m.dmg + (t.key === 'sword' ? 1 : 0) },
    fuel: m.key === 'wood' ? 10 : 0,
  });
}
tid = 330;
for (const m of MATERIALS) {
  const id = tid++;
  TOOL_ID[m.key + '_hoe'] = id;
  item(id, m.name + 'のクワ', { stack: 1, draw: 'hoe', color: m.color, tool: { type: 'hoe', tier: m.tier, speed: m.speed, dur: m.dur, dmg: 1 }, fuel: m.key === 'wood' ? 10 : 0 });
}

// armor
export const ARMOR_SLOTS = ['helmet', 'chestplate', 'leggings', 'boots'];
const ARMOR_NAMES = { helmet: 'のヘルメット', chestplate: 'のチェストプレート', leggings: 'のレギンス', boots: 'のブーツ' };
const ARMOR_MATS = [
  { key: 'leather', name: '革', color: '#9a6a3a', pts: [1, 3, 2, 1], dur: 80 },
  { key: 'iron', name: '鉄', color: '#d8d8d8', pts: [2, 6, 5, 2], dur: 240 },
  { key: 'gold', name: '金', color: '#f8d248', pts: [2, 5, 3, 1], dur: 112 },
  { key: 'diamond', name: 'ダイヤ', color: '#5ee6dc', pts: [3, 8, 6, 3], dur: 528 },
];
export const ARMOR_ID = {};
tid = 340;
for (const m of ARMOR_MATS) ARMOR_SLOTS.forEach((slot, si) => {
  const id = tid++;
  ARMOR_ID[m.key + '_' + slot] = id;
  item(id, m.name + ARMOR_NAMES[slot], { stack: 1, draw: slot, color: m.color, armor: { slot: si, pts: m.pts[si], dur: m.dur } });
});

// fuels (seconds)
for (const id of [B.PLANKS, B.BIRCH_PLANKS, B.SPRUCE_PLANKS, B.LOG, B.BIRCH_LOG, B.SPRUCE_LOG, B.CRAFTING_TABLE, B.BOOKSHELF, B.CHEST, B.OAK_SLAB]) ITEMS[id].fuel = 15;
for (const id of [B.OAK_SAPLING, B.BIRCH_SAPLING, B.SPRUCE_SAPLING]) ITEMS[id].fuel = 5;
ITEMS[B.COAL_BLOCK].fuel = 800;

export function itemName(id) { return ITEMS[id] ? ITEMS[id].name : '?'; }
export function maxStack(id) { return ITEMS[id] ? ITEMS[id].stack : 64; }
export function maxDurability(id) {
  const it = ITEMS[id];
  if (!it) return 0;
  if (it.tool) return it.tool.dur;
  if (it.armor) return it.armor.dur;
  return it.durability || 0;
}

// ---------- drops ----------
const SAPLING_OF = { [B.LEAVES]: B.OAK_SAPLING, [B.BIRCH_LEAVES]: B.BIRCH_SAPLING, [B.SPRUCE_LEAVES]: B.SPRUCE_SAPLING };
export function blockDrops(id, rnd) {
  const d = BLOCKS[id];
  if (!d) return [];
  if (d.leaves) {
    const out = [];
    if (rnd() < 0.07) out.push([SAPLING_OF[id], 1]);
    if (rnd() < 0.05 && id === B.LEAVES) out.push([I.APPLE, 1]);
    if (rnd() < 0.04) out.push([I.STICK, 1 + Math.floor(rnd() * 2)]);
    return out;
  }
  switch (id) {
    case B.COAL_ORE: return [[I.COAL, 1]];
    case B.DIAMOND_ORE: return [[I.DIAMOND, 1]];
    case B.QUARTZ_ORE: return [[I.QUARTZ, 1]];
    case B.BOOKSHELF: return [[B.PLANKS, 3]];
    case B.TALL_GRASS: case B.FERN: return rnd() < 0.15 ? [[I.WHEAT_SEEDS, 1]] : [];
    case B.GRAVEL: return rnd() < 0.12 ? [[I.FLINT, 1]] : [[B.GRAVEL, 1]];
    case B.WHEAT3: return [[I.WHEAT, 1], [I.WHEAT_SEEDS, 1 + Math.floor(rnd() * 3)]];
    case B.WHEAT0: case B.WHEAT1: case B.WHEAT2: return [[I.WHEAT_SEEDS, 1]];
    case B.MELON: return [[I.MELON_SLICE, 3 + Math.floor(rnd() * 5)]];
  }
  if (d.drop) return [[d.drop, 1]];
  return [];
}

export function breakTime(blockId, heldId) {
  const d = BLOCKS[blockId];
  if (!d || d.hardness < 0) return Infinity;
  if (d.hardness === 0) return 0.05;
  const it = ITEMS[heldId];
  const tool = it && it.tool;
  let speed = 1;
  const right = tool && d.tool && tool.type === d.tool;
  if (right) speed = tool.speed;
  if (tool && tool.type === 'sword' && (d.leaves || d.cactus)) speed = 1.5;
  const canHarvest = !d.needsTool || (right && tool.tier >= Math.max(1, d.tier));
  return (d.hardness * (canHarvest ? 1.5 : 5)) / speed;
}

export function canHarvest(blockId, heldId) {
  const d = BLOCKS[blockId];
  if (!d.needsTool) return true;
  const it = ITEMS[heldId];
  const tool = it && it.tool;
  return !!(tool && tool.type === d.tool && tool.tier >= Math.max(1, d.tier));
}
