// Block definitions shared by main thread and workers.

export const TILES = [
  'stone', 'dirt', 'grass_top', 'grass_side', 'cobble', 'planks', 'bedrock', 'sand', 'gravel',
  'log_side', 'log_top', 'leaves', 'glass', 'coal_ore', 'iron_ore', 'gold_ore', 'diamond_ore',
  'water', 'lava', 'sandstone_side', 'sandstone_top', 'snow', 'ice', 'birch_log_side', 'birch_log_top',
  'birch_leaves', 'spruce_log_side', 'spruce_log_top', 'spruce_leaves', 'cactus_side', 'cactus_top',
  'tall_grass', 'rose', 'dandelion', 'crafting_top', 'crafting_side', 'furnace_front', 'furnace_side',
  'furnace_top', 'torch', 'bricks', 'lamp', 'snow_grass_side', 'clay', 'wool', 'stone_bricks', 'bookshelf',
  'dead_bush', 'mossy_cobble', 'obsidian', 'iron_block', 'gold_block', 'diamond_block', 'coal_block',
  'birch_planks', 'spruce_planks', 'furnace_front_on', 'blue_flower', 'fern'
];
export const TILE = Object.fromEntries(TILES.map((n, i) => [n, i]));

export const B = {
  AIR: 0, STONE: 1, GRASS: 2, DIRT: 3, COBBLE: 4, PLANKS: 5, BEDROCK: 6, SAND: 7, GRAVEL: 8, LOG: 9,
  LEAVES: 10, GLASS: 11, COAL_ORE: 12, IRON_ORE: 13, GOLD_ORE: 14, DIAMOND_ORE: 15, WATER: 16, LAVA: 17,
  SANDSTONE: 18, SNOW: 19, ICE: 20, BIRCH_LOG: 21, BIRCH_LEAVES: 22, SPRUCE_LOG: 23, SPRUCE_LEAVES: 24,
  CACTUS: 25, TALL_GRASS: 26, ROSE: 27, DANDELION: 28, CRAFTING_TABLE: 29, FURNACE: 30, TORCH: 31,
  BRICKS: 32, LAMP: 33, SNOW_GRASS: 34, CLAY: 35, WOOL: 36, STONE_BRICKS: 37, BOOKSHELF: 38,
  DEAD_BUSH: 39, MOSSY_COBBLE: 40, OBSIDIAN: 41, IRON_BLOCK: 42, GOLD_BLOCK: 43, DIAMOND_BLOCK: 44,
  COAL_BLOCK: 45, BIRCH_PLANKS: 46, SPRUCE_PLANKS: 47, BLUE_FLOWER: 48, FERN: 49,
};

// shape: 0 none, 1 cube, 2 cross, 3 torch, 4 liquid
export const SH = { NONE: 0, CUBE: 1, CROSS: 2, TORCH: 3, LIQUID: 4 };

export const BLOCKS = [];
function def(id, name, o) {
  const d = Object.assign({
    id, name, solid: true, opaque: true, shape: SH.CUBE, hardness: 1, tool: null, tier: 0,
    light: 0, atten: 0, tint: 0, sound: 'stone', drop: id, needsTool: false, replaceable: false,
  }, o);
  let t = d.tex;
  if (typeof t === 'string') t = { top: t, bottom: t, side: t };
  t = Object.assign({ top: t.side, bottom: t.side, side: t.top }, t);
  // faces: +X,-X,+Y,-Y,+Z,-Z
  d.faces = [t.side, t.side, t.top, t.bottom, t.front || t.side, t.front || t.side].map(n => TILE[n] ?? 0);
  BLOCKS[id] = d;
}

const transparent = { opaque: false };
const plant = { solid: false, opaque: false, shape: SH.CROSS, hardness: 0, sound: 'grass', drop: 0, replaceable: true };

def(B.AIR, '空気', { solid: false, opaque: false, shape: SH.NONE, tex: 'stone', drop: 0 });
def(B.STONE, '石', { tex: 'stone', hardness: 1.5, tool: 'pickaxe', needsTool: true, drop: B.COBBLE });
def(B.GRASS, '草ブロック', { tex: { top: 'grass_top', bottom: 'dirt', side: 'grass_side' }, hardness: 0.6, tool: 'shovel', sound: 'grass', drop: B.DIRT, tintTop: true });
def(B.DIRT, '土', { tex: 'dirt', hardness: 0.5, tool: 'shovel', sound: 'gravel' });
def(B.COBBLE, '丸石', { tex: 'cobble', hardness: 2, tool: 'pickaxe', needsTool: true });
def(B.PLANKS, 'オークの板材', { tex: 'planks', hardness: 2, tool: 'axe', sound: 'wood' });
def(B.BEDROCK, '岩盤', { tex: 'bedrock', hardness: -1, drop: 0 });
def(B.SAND, '砂', { tex: 'sand', hardness: 0.5, tool: 'shovel', sound: 'sand' });
def(B.GRAVEL, '砂利', { tex: 'gravel', hardness: 0.6, tool: 'shovel', sound: 'gravel' });
def(B.LOG, 'オークの原木', { tex: { top: 'log_top', side: 'log_side' }, hardness: 2, tool: 'axe', sound: 'wood' });
def(B.LEAVES, 'オークの葉', { ...transparent, tex: 'leaves', hardness: 0.2, tool: 'hoe', sound: 'grass', atten: 1, tint: 1, drop: 0, leaves: true });
def(B.GLASS, 'ガラス', { ...transparent, tex: 'glass', hardness: 0.3, sound: 'glass', drop: 0, glass: true });
def(B.COAL_ORE, '石炭鉱石', { tex: 'coal_ore', hardness: 3, tool: 'pickaxe', tier: 1, needsTool: true });
def(B.IRON_ORE, '鉄鉱石', { tex: 'iron_ore', hardness: 3, tool: 'pickaxe', tier: 2, needsTool: true });
def(B.GOLD_ORE, '金鉱石', { tex: 'gold_ore', hardness: 3, tool: 'pickaxe', tier: 3, needsTool: true });
def(B.DIAMOND_ORE, 'ダイヤモンド鉱石', { tex: 'diamond_ore', hardness: 3, tool: 'pickaxe', tier: 3, needsTool: true });
def(B.WATER, '水', { solid: false, opaque: false, shape: SH.LIQUID, tex: 'water', hardness: -1, atten: 2, drop: 0, liquid: true });
def(B.LAVA, '溶岩', { solid: false, opaque: false, shape: SH.LIQUID, tex: 'lava', hardness: -1, light: 15, drop: 0, liquid: true });
def(B.SANDSTONE, '砂岩', { tex: { top: 'sandstone_top', side: 'sandstone_side' }, hardness: 0.8, tool: 'pickaxe', needsTool: true });
def(B.SNOW, '雪ブロック', { tex: 'snow', hardness: 0.2, tool: 'shovel', sound: 'snow' });
def(B.ICE, '氷', { ...transparent, tex: 'ice', hardness: 0.5, tool: 'pickaxe', sound: 'glass', atten: 1, drop: 0, glass: true });
def(B.BIRCH_LOG, '白樺の原木', { tex: { top: 'birch_log_top', side: 'birch_log_side' }, hardness: 2, tool: 'axe', sound: 'wood' });
def(B.BIRCH_LEAVES, '白樺の葉', { ...transparent, tex: 'birch_leaves', hardness: 0.2, sound: 'grass', atten: 1, drop: 0, leaves: true });
def(B.SPRUCE_LOG, 'トウヒの原木', { tex: { top: 'spruce_log_top', side: 'spruce_log_side' }, hardness: 2, tool: 'axe', sound: 'wood' });
def(B.SPRUCE_LEAVES, 'トウヒの葉', { ...transparent, tex: 'spruce_leaves', hardness: 0.2, sound: 'grass', atten: 1, drop: 0, leaves: true });
def(B.CACTUS, 'サボテン', { tex: { top: 'cactus_top', side: 'cactus_side' }, hardness: 0.4, sound: 'grass', opaque: false, cactus: true });
def(B.TALL_GRASS, '草', { ...plant, tex: 'tall_grass', tint: 1 });
def(B.ROSE, 'ポピー', { ...plant, tex: 'rose', drop: B.ROSE, replaceable: false });
def(B.DANDELION, 'タンポポ', { ...plant, tex: 'dandelion', drop: B.DANDELION, replaceable: false });
def(B.CRAFTING_TABLE, '作業台', { tex: { top: 'crafting_top', bottom: 'planks', side: 'crafting_side' }, hardness: 2.5, tool: 'axe', sound: 'wood' });
def(B.FURNACE, 'かまど', { tex: { top: 'furnace_top', bottom: 'furnace_top', side: 'furnace_side', front: 'furnace_front' }, hardness: 3.5, tool: 'pickaxe', needsTool: true });
def(B.TORCH, '松明', { solid: false, opaque: false, shape: SH.TORCH, tex: 'torch', hardness: 0, light: 14, sound: 'wood' });
def(B.BRICKS, 'レンガ', { tex: 'bricks', hardness: 2, tool: 'pickaxe', needsTool: true });
def(B.LAMP, 'ランプ', { tex: 'lamp', hardness: 0.3, light: 15, sound: 'glass' });
def(B.SNOW_GRASS, '雪の積もった草', { tex: { top: 'snow', bottom: 'dirt', side: 'snow_grass_side' }, hardness: 0.6, tool: 'shovel', sound: 'snow', drop: B.DIRT });
def(B.CLAY, '粘土', { tex: 'clay', hardness: 0.6, tool: 'shovel', sound: 'gravel' });
def(B.WOOL, '白い羊毛', { tex: 'wool', hardness: 0.8, sound: 'cloth' });
def(B.STONE_BRICKS, '石レンガ', { tex: 'stone_bricks', hardness: 1.5, tool: 'pickaxe', needsTool: true });
def(B.BOOKSHELF, '本棚', { tex: { top: 'planks', side: 'bookshelf' }, hardness: 1.5, tool: 'axe', sound: 'wood', drop: B.PLANKS });
def(B.DEAD_BUSH, '枯れ木', { ...plant, tex: 'dead_bush' });
def(B.MOSSY_COBBLE, '苔むした丸石', { tex: 'mossy_cobble', hardness: 2, tool: 'pickaxe', needsTool: true });
def(B.OBSIDIAN, '黒曜石', { tex: 'obsidian', hardness: 50, tool: 'pickaxe', tier: 4, needsTool: true });
def(B.IRON_BLOCK, '鉄ブロック', { tex: 'iron_block', hardness: 5, tool: 'pickaxe', tier: 2, needsTool: true, sound: 'metal' });
def(B.GOLD_BLOCK, '金ブロック', { tex: 'gold_block', hardness: 3, tool: 'pickaxe', tier: 3, needsTool: true, sound: 'metal' });
def(B.DIAMOND_BLOCK, 'ダイヤモンドブロック', { tex: 'diamond_block', hardness: 5, tool: 'pickaxe', tier: 3, needsTool: true, sound: 'metal' });
def(B.COAL_BLOCK, '石炭ブロック', { tex: 'coal_block', hardness: 5, tool: 'pickaxe', needsTool: true });
def(B.BIRCH_PLANKS, '白樺の板材', { tex: 'birch_planks', hardness: 2, tool: 'axe', sound: 'wood' });
def(B.SPRUCE_PLANKS, 'トウヒの板材', { tex: 'spruce_planks', hardness: 2, tool: 'axe', sound: 'wood' });
def(B.BLUE_FLOWER, '青いラン', { ...plant, tex: 'blue_flower', drop: B.BLUE_FLOWER, replaceable: false });
def(B.FERN, 'シダ', { ...plant, tex: 'fern', tint: 1 });

for (let i = 0; i < 256; i++) if (!BLOCKS[i]) BLOCKS[i] = null;

export const FACE_LAYER = new Int16Array(256 * 6);
export const OPAQUE = new Uint8Array(256);
export const SOLID = new Uint8Array(256);
export const SHAPE = new Uint8Array(256);
export const LIGHT = new Uint8Array(256);
export const ATTEN = new Uint8Array(256);
export const TINT = new Uint8Array(256); // 1 = all faces tinted, 2 = top only
for (const d of BLOCKS) {
  if (!d) continue;
  for (let f = 0; f < 6; f++) FACE_LAYER[d.id * 6 + f] = d.faces[f];
  OPAQUE[d.id] = d.opaque ? 1 : 0;
  SOLID[d.id] = d.solid ? 1 : 0;
  SHAPE[d.id] = d.shape;
  LIGHT[d.id] = d.light;
  ATTEN[d.id] = d.atten;
  TINT[d.id] = d.tintTop ? 2 : d.tint;
}
// cactus is not "opaque" (so neighbors draw) but is solid
