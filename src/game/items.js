import { B, BLOCKS, SH } from '../world/blocks.js';

export const I = {
  STICK: 256, COAL: 257, IRON_INGOT: 258, GOLD_INGOT: 259, DIAMOND: 260, APPLE: 261,
  RAW_PORK: 262, COOKED_PORK: 263, ROTTEN_FLESH: 264, BREAD: 265,
};
export const ITEMS = [];

// block items
for (const d of BLOCKS) {
  if (!d || d.id === 0) continue;
  ITEMS[d.id] = {
    id: d.id, name: d.name, stack: 64, block: d.id,
    flat: d.shape === SH.CROSS || d.shape === SH.TORCH,
    hidden: d.id === B.WATER || d.id === B.LAVA,
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

// fuels (seconds)
for (const id of [B.PLANKS, B.BIRCH_PLANKS, B.SPRUCE_PLANKS, B.LOG, B.BIRCH_LOG, B.SPRUCE_LOG, B.CRAFTING_TABLE, B.BOOKSHELF]) ITEMS[id].fuel = 15;
ITEMS[B.COAL_BLOCK].fuel = 800;

export function itemName(id) { return ITEMS[id] ? ITEMS[id].name : '?'; }
export function maxStack(id) { return ITEMS[id] ? ITEMS[id].stack : 64; }

// ---------- drops ----------
export function blockDrops(id, rnd) {
  const d = BLOCKS[id];
  if (!d) return [];
  if (d.leaves) {
    const out = [];
    if (rnd() < 0.06 && id === B.LEAVES) out.push([I.APPLE, 1]);
    if (rnd() < 0.05) out.push([I.STICK, 1 + Math.floor(rnd() * 2)]);
    return out;
  }
  if (id === B.COAL_ORE) return [[I.COAL, 1]];
  if (id === B.DIAMOND_ORE) return [[I.DIAMOND, 1]];
  if (id === B.BOOKSHELF) return [[B.PLANKS, 3]];
  if (id === B.TALL_GRASS || id === B.FERN) return rnd() < 0.08 ? [[I.BREAD, 1]] : [];
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
