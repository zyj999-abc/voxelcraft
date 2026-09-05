/* ============================================================
 * VoxelCraft — 方块与物品注册表
 * 硬度 / 工具 / 掉落规则参照经典沙盒数值
 * ============================================================ */
"use strict";

// ---- 方块 ID ----
const B = {
  AIR: 0, GRASS: 1, DIRT: 2, STONE: 3, COBBLESTONE: 4, BEDROCK: 5,
  SAND: 6, GRAVEL: 7, OAK_LOG: 8, OAK_LEAVES: 9, OAK_PLANKS: 10, GLASS: 11,
  WATER: 12, COAL_ORE: 13, IRON_ORE: 14, GOLD_ORE: 15, DIAMOND_ORE: 16,
  CRAFTING_TABLE: 17, SANDSTONE: 18, SNOWY_GRASS: 19, SNOW_BLOCK: 20, CACTUS: 21,
  TALL_GRASS: 22, POPPY: 23, DANDELION: 24, DEAD_BUSH: 25, BRICKS: 26,
  STONE_BRICKS: 27, TORCH: 28, BOOKSHELF: 29, FURNACE: 30, TNT: 31,
  OBSIDIAN: 32, ICE: 33, PUMPKIN: 34, BIRCH_LOG: 35, BIRCH_LEAVES: 36,
  SPRUCE_LOG: 37, SPRUCE_LEAVES: 38, WOOL: 39, MOSSY_COBBLESTONE: 40,
  COAL_BLOCK: 41, IRON_BLOCK: 42, GOLD_BLOCK: 43, DIAMOND_BLOCK: 44,
};

// ---- 物品 ID (>=100) ----
const I = {
  STICK: 100, COAL: 101, CHARCOAL: 102, IRON_INGOT: 103, GOLD_INGOT: 104,
  DIAMOND: 105, APPLE: 106, PORKCHOP: 107, COOKED_PORKCHOP: 108,
  WOOD_PICK: 110, STONE_PICK: 111, IRON_PICK: 112, GOLD_PICK: 113, DIAMOND_PICK: 114,
  WOOD_AXE: 115, STONE_AXE: 116, IRON_AXE: 117, GOLD_AXE: 118, DIAMOND_AXE: 119,
  WOOD_SHOVEL: 120, STONE_SHOVEL: 121, IRON_SHOVEL: 122, GOLD_SHOVEL: 123, DIAMOND_SHOVEL: 124,
  WOOD_SWORD: 125, STONE_SWORD: 126, IRON_SWORD: 127, GOLD_SWORD: 128, DIAMOND_SWORD: 129,
};

// ---- 注册表 ----
const BLOCKS = [];   // id -> 定义
const ITEMS = {};    // id -> 定义 (含方块物品)

// 材质等级: 1木/金 2石 3铁 4钻
const TIER_NAMES = ["", "木", "石", "铁", "钻"];

function defBlock(id, name, opt) {
  BLOCKS[id] = Object.assign({
    id, name,
    solid: true,          // 有碰撞
    opaque: true,         // 完全不透明(遮挡相邻面)
    fluid: false,         // 液体
    plant: false,         // 交叉面片植物
    translucent: false,   // 半透明(水/冰)
    hardness: 1,          // 硬度; -1 = 不可破坏
    tool: null,           // 最佳工具: pickaxe/axe/shovel
    needsTool: false,     // 不用正确工具不掉落
    minTier: 0,           // 最低工具等级才掉落
    drops: null,          // 自定义掉落 [{id, min, max, chance}]
    lightEmit: 0,
    interact: null,       // 右键交互: 'craft2'|'craft3'|'furnace'|'tnt'
    tex: {},              // {all|top,bottom,side,front} tile 名
  }, opt);
  ITEMS[id] = { id, name, isBlock: true, stack: 64 };
  return BLOCKS[id];
}

function defItem(id, name, opt) {
  ITEMS[id] = Object.assign({ id, name, isBlock: false, stack: 64 }, opt);
  return ITEMS[id];
}

// ==================== 方块定义 ====================
// 空气必须注册, 否则网格构建时 BLOCKS[0] 为 undefined 导致崩溃
defBlock(B.AIR, "空气", { solid: false, opaque: false, hardness: 0, drops: [] });
defBlock(B.GRASS, "草方块", {
  tex: { top: "grass_top", bottom: "dirt", side: "grass_side" },
  hardness: 0.6, tool: "shovel", drops: [{ id: B.DIRT, min: 1, max: 1, chance: 1 }],
});
defBlock(B.DIRT, "泥土", { tex: { all: "dirt" }, hardness: 0.5, tool: "shovel" });
defBlock(B.STONE, "石头", {
  tex: { all: "stone" }, hardness: 1.5, tool: "pickaxe", needsTool: true, minTier: 1,
  drops: [{ id: B.COBBLESTONE, min: 1, max: 1, chance: 1 }],
});
defBlock(B.COBBLESTONE, "圆石", { tex: { all: "cobblestone" }, hardness: 2, tool: "pickaxe", needsTool: true, minTier: 1 });
defBlock(B.BEDROCK, "基岩", { tex: { all: "bedrock" }, hardness: -1 });
defBlock(B.SAND, "沙子", { tex: { all: "sand" }, hardness: 0.5, tool: "shovel" });
defBlock(B.GRAVEL, "沙砾", { tex: { all: "gravel" }, hardness: 0.6, tool: "shovel" });
defBlock(B.OAK_LOG, "橡木原木", { tex: { top: "log_top", bottom: "log_top", side: "log_side" }, hardness: 2, tool: "axe" });
defBlock(B.OAK_LEAVES, "橡树树叶", {
  tex: { all: "leaves" }, hardness: 0.2, opaque: false,
  drops: [{ id: I.APPLE, min: 1, max: 1, chance: 0.05 }],
});
defBlock(B.OAK_PLANKS, "橡木木板", { tex: { all: "planks" }, hardness: 2, tool: "axe" });
defBlock(B.GLASS, "玻璃", { tex: { all: "glass" }, hardness: 0.3, opaque: false, drops: [] });
defBlock(B.WATER, "水", { tex: { all: "water" }, solid: false, opaque: false, fluid: true, translucent: true, hardness: -1 });
defBlock(B.COAL_ORE, "煤矿石", {
  tex: { all: "coal_ore" }, hardness: 3, tool: "pickaxe", needsTool: true, minTier: 1,
  drops: [{ id: I.COAL, min: 1, max: 1, chance: 1 }],
});
defBlock(B.IRON_ORE, "铁矿石", { tex: { all: "iron_ore" }, hardness: 3, tool: "pickaxe", needsTool: true, minTier: 2 });
defBlock(B.GOLD_ORE, "金矿石", { tex: { all: "gold_ore" }, hardness: 3, tool: "pickaxe", needsTool: true, minTier: 3 });
defBlock(B.DIAMOND_ORE, "钻石矿石", {
  tex: { all: "diamond_ore" }, hardness: 3, tool: "pickaxe", needsTool: true, minTier: 3,
  drops: [{ id: I.DIAMOND, min: 1, max: 1, chance: 1 }],
});
defBlock(B.CRAFTING_TABLE, "工作台", {
  tex: { top: "table_top", bottom: "planks", side: "table_side", front: "table_front" },
  hardness: 2.5, tool: "axe", interact: "craft3",
});
defBlock(B.SANDSTONE, "砂岩", { tex: { top: "sandstone_top", bottom: "sandstone_top", side: "sandstone" }, hardness: 0.8, tool: "pickaxe", needsTool: true, minTier: 1 });
defBlock(B.SNOWY_GRASS, "积雪草方块", {
  tex: { top: "snow", bottom: "dirt", side: "snowy_grass_side" },
  hardness: 0.6, tool: "shovel", drops: [{ id: B.DIRT, min: 1, max: 1, chance: 1 }],
});
defBlock(B.SNOW_BLOCK, "雪块", { tex: { all: "snow" }, hardness: 0.2, tool: "shovel" });
defBlock(B.CACTUS, "仙人掌", { tex: { top: "cactus_top", bottom: "cactus_top", side: "cactus_side" }, hardness: 0.4, opaque: false });
defBlock(B.TALL_GRASS, "草", { tex: { all: "tall_grass" }, solid: false, opaque: false, plant: true, hardness: 0, drops: [] });
defBlock(B.POPPY, "虞美人", { tex: { all: "poppy" }, solid: false, opaque: false, plant: true, hardness: 0 });
defBlock(B.DANDELION, "蒲公英", { tex: { all: "dandelion" }, solid: false, opaque: false, plant: true, hardness: 0 });
defBlock(B.DEAD_BUSH, "枯灌木", { tex: { all: "dead_bush" }, solid: false, opaque: false, plant: true, hardness: 0, drops: [{ id: I.STICK, min: 1, max: 2, chance: 0.5 }] });
defBlock(B.BRICKS, "砖块", { tex: { all: "bricks" }, hardness: 2, tool: "pickaxe", needsTool: true, minTier: 1 });
defBlock(B.STONE_BRICKS, "石砖", { tex: { all: "stone_bricks" }, hardness: 1.5, tool: "pickaxe", needsTool: true, minTier: 1 });
defBlock(B.TORCH, "火把", { tex: { all: "torch" }, solid: false, opaque: false, plant: true, hardness: 0, lightEmit: 14 });
defBlock(B.BOOKSHELF, "书架", { tex: { top: "planks", bottom: "planks", side: "bookshelf" }, hardness: 1.5, tool: "axe" });
defBlock(B.FURNACE, "熔炉", {
  tex: { top: "furnace_top", bottom: "furnace_top", side: "furnace_side", front: "furnace_front" },
  hardness: 3.5, tool: "pickaxe", needsTool: true, minTier: 1, interact: "furnace",
});
defBlock(B.TNT, "TNT", { tex: { top: "tnt_top", bottom: "tnt_bottom", side: "tnt_side" }, hardness: 0, interact: "tnt" });
defBlock(B.OBSIDIAN, "黑曜石", { tex: { all: "obsidian" }, hardness: 50, tool: "pickaxe", needsTool: true, minTier: 4 });
defBlock(B.ICE, "冰", { tex: { all: "ice" }, hardness: 0.5, tool: "pickaxe", opaque: false, translucent: true, drops: [] });
defBlock(B.PUMPKIN, "南瓜", { tex: { top: "pumpkin_top", bottom: "pumpkin_top", side: "pumpkin_side" }, hardness: 1, tool: "axe" });
defBlock(B.BIRCH_LOG, "白桦原木", { tex: { top: "log_top", bottom: "log_top", side: "birch_log_side" }, hardness: 2, tool: "axe" });
defBlock(B.BIRCH_LEAVES, "白桦树叶", {
  tex: { all: "birch_leaves" }, hardness: 0.2, opaque: false,
  drops: [{ id: I.APPLE, min: 1, max: 1, chance: 0.05 }],
});
defBlock(B.SPRUCE_LOG, "云杉原木", { tex: { top: "log_top", bottom: "log_top", side: "spruce_log_side" }, hardness: 2, tool: "axe" });
defBlock(B.SPRUCE_LEAVES, "云杉树叶", {
  tex: { all: "spruce_leaves" }, hardness: 0.2, opaque: false,
  drops: [{ id: I.APPLE, min: 1, max: 1, chance: 0.03 }],
});
defBlock(B.WOOL, "羊毛", { tex: { all: "wool" }, hardness: 0.8 });
defBlock(B.MOSSY_COBBLESTONE, "苔石", { tex: { all: "mossy_cobblestone" }, hardness: 2, tool: "pickaxe", needsTool: true, minTier: 1 });
defBlock(B.COAL_BLOCK, "煤炭块", { tex: { all: "coal_block" }, hardness: 5, tool: "pickaxe", needsTool: true, minTier: 1 });
defBlock(B.IRON_BLOCK, "铁块", { tex: { all: "iron_block" }, hardness: 5, tool: "pickaxe", needsTool: true, minTier: 2 });
defBlock(B.GOLD_BLOCK, "金块", { tex: { all: "gold_block" }, hardness: 3, tool: "pickaxe", needsTool: true, minTier: 3 });
defBlock(B.DIAMOND_BLOCK, "钻石块", { tex: { all: "diamond_block" }, hardness: 5, tool: "pickaxe", needsTool: true, minTier: 3 });

// ==================== 物品定义 ====================
defItem(I.STICK, "木棍", {});
defItem(I.COAL, "煤炭", {});
defItem(I.CHARCOAL, "木炭", {});
defItem(I.IRON_INGOT, "铁锭", {});
defItem(I.GOLD_INGOT, "金锭", {});
defItem(I.DIAMOND, "钻石", {});
defItem(I.APPLE, "苹果", { food: 4 });
defItem(I.PORKCHOP, "生猪排", { food: 3 });
defItem(I.COOKED_PORKCHOP, "熟猪排", { food: 8 });

// 工具: {type, tier, speed, durability, damage}
const TOOL_MATS = [
  { key: "WOOD", tier: 1, speed: 2, durability: 59, dmgBonus: 0, zh: "木" },
  { key: "STONE", tier: 2, speed: 4, durability: 131, dmgBonus: 1, zh: "石" },
  { key: "IRON", tier: 3, speed: 6, durability: 250, dmgBonus: 2, zh: "铁" },
  { key: "GOLD", tier: 1, speed: 12, durability: 32, dmgBonus: 0, zh: "金" },
  { key: "DIAMOND", tier: 4, speed: 8, durability: 1561, dmgBonus: 3, zh: "钻石" },
];
const TOOL_TYPES = [
  { key: "PICK", zh: "镐", type: "pickaxe", baseDmg: 2 },
  { key: "AXE", zh: "斧", type: "axe", baseDmg: 3 },
  { key: "SHOVEL", zh: "锹", type: "shovel", baseDmg: 1.5 },
  { key: "SWORD", zh: "剑", type: "sword", baseDmg: 4 },
];
for (const mat of TOOL_MATS) {
  for (const tt of TOOL_TYPES) {
    defItem(I[(mat.key + "_" + tt.key)], mat.zh + tt.zh, {
      stack: 1,
      tool: {
        type: tt.type, tier: mat.tier, speed: mat.speed,
        durability: mat.durability,
        damage: tt.baseDmg + mat.dmgBonus,
      },
    });
  }
}

// ==================== 工具函数 ====================
function getBlock(id) { return BLOCKS[id] || BLOCKS[0]; }
function getItem(id) { return ITEMS[id] || null; }
function isSolid(id) { const b = BLOCKS[id]; return b ? b.solid : false; }
function isOpaque(id) { const b = BLOCKS[id]; return b ? b.opaque : false; }

// 破坏所需时间(秒) — 参照经典公式简化
function breakTime(blockId, heldItemId) {
  const b = getBlock(blockId);
  if (b.hardness < 0) return Infinity;
  if (b.hardness === 0) return 0.05;
  const item = heldItemId ? ITEMS[heldItemId] : null;
  const tool = item && item.tool;
  let canHarvest = !b.needsTool;
  let speedMult = 1;
  if (tool && b.tool && tool.type === b.tool) {
    speedMult = tool.speed;
    if (tool.tier >= b.minTier) canHarvest = true;
  } else if (!b.needsTool) {
    canHarvest = true;
  }
  let time;
  if (canHarvest) time = b.hardness * 1.5 / speedMult;
  else time = b.hardness * 5;
  return Math.max(0.05, time);
}

// 是否能收获掉落
function canHarvest(blockId, heldItemId) {
  const b = getBlock(blockId);
  if (!b.needsTool) return true;
  const item = heldItemId ? ITEMS[heldItemId] : null;
  if (item && item.tool && item.tool.type === b.tool && item.tool.tier >= b.minTier) return true;
  return false;
}

// 掉落列表
function getDrops(blockId, heldItemId) {
  const b = getBlock(blockId);
  if (!canHarvest(blockId, heldItemId)) return [];
  if (b.drops !== null) {
    const out = [];
    for (const d of b.drops) {
      if (Math.random() < d.chance) {
        out.push({ id: d.id, count: d.min + Math.floor(Math.random() * (d.max - d.min + 1)) });
      }
    }
    return out;
  }
  return [{ id: blockId, count: 1 }];
}

// 创造模式物品栏顺序
const CREATIVE_ITEMS = [
  B.GRASS, B.DIRT, B.STONE, B.COBBLESTONE, B.MOSSY_COBBLESTONE, B.STONE_BRICKS, B.BRICKS,
  B.SAND, B.SANDSTONE, B.GRAVEL, B.SNOWY_GRASS, B.SNOW_BLOCK, B.ICE,
  B.OAK_LOG, B.BIRCH_LOG, B.SPRUCE_LOG, B.OAK_PLANKS, B.OAK_LEAVES, B.BIRCH_LEAVES, B.SPRUCE_LEAVES,
  B.CACTUS, B.PUMPKIN, B.WOOL, B.BOOKSHELF, B.GLASS, B.OBSIDIAN, B.BEDROCK,
  B.COAL_ORE, B.IRON_ORE, B.GOLD_ORE, B.DIAMOND_ORE,
  B.COAL_BLOCK, B.IRON_BLOCK, B.GOLD_BLOCK, B.DIAMOND_BLOCK,
  B.CRAFTING_TABLE, B.FURNACE, B.TNT, B.TORCH,
  B.TALL_GRASS, B.POPPY, B.DANDELION, B.DEAD_BUSH,
  I.STICK, I.COAL, I.CHARCOAL, I.IRON_INGOT, I.GOLD_INGOT, I.DIAMOND,
  I.APPLE, I.PORKCHOP, I.COOKED_PORKCHOP,
  I.WOOD_PICK, I.STONE_PICK, I.IRON_PICK, I.GOLD_PICK, I.DIAMOND_PICK,
  I.WOOD_AXE, I.STONE_AXE, I.IRON_AXE, I.GOLD_AXE, I.DIAMOND_AXE,
  I.WOOD_SHOVEL, I.STONE_SHOVEL, I.IRON_SHOVEL, I.GOLD_SHOVEL, I.DIAMOND_SHOVEL,
  I.WOOD_SWORD, I.STONE_SWORD, I.IRON_SWORD, I.GOLD_SWORD, I.DIAMOND_SWORD,
];
