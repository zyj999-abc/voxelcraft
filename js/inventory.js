/* ============================================================
 * VoxelCraft — 物品栏 / 合成 / 熔炉
 * ============================================================ */
"use strict";

// ==================== 物品栏 ====================
class Inventory {
  constructor() {
    this.slots = new Array(36).fill(null);   // 0-8 快捷栏, 9-35 背包
    this.selected = 0;
  }

  getHeld() { return this.slots[this.selected]; }

  // 存入物品, 返回未容纳数量
  giveItem(id, count) {
    const item = ITEMS[id];
    if (!item) return count;
    // 优先堆叠 (快捷栏优先)
    for (const range of [[0, 9], [9, 36]]) {
      for (let i = range[0]; i < range[1]; i++) {
        const s = this.slots[i];
        if (s && s.id === id && s.count < item.stack) {
          const take = Math.min(item.stack - s.count, count);
          s.count += take; count -= take;
          if (count <= 0) return 0;
        }
      }
    }
    // 空位 (快捷栏优先)
    for (const range of [[0, 9], [9, 36]]) {
      for (let i = range[0]; i < range[1]; i++) {
        if (!this.slots[i]) {
          const take = Math.min(item.stack, count);
          this.slots[i] = { id, count: take };
          if (item.tool) this.slots[i].dur = item.tool.durability;
          count -= take;
          if (count <= 0) return 0;
        }
      }
    }
    return count;
  }

  // 消耗当前手持 1 个
  consumeHeld() {
    const s = this.slots[this.selected];
    if (!s) return;
    s.count--;
    if (s.count <= 0) this.slots[this.selected] = null;
  }

  // 工具磨损, 返回 true 表示已碎裂
  damageHeld() {
    const s = this.slots[this.selected];
    if (!s || !ITEMS[s.id].tool) return false;
    s.dur = (s.dur === undefined ? ITEMS[s.id].tool.durability : s.dur) - 1;
    if (s.dur <= 0) {
      this.slots[this.selected] = null;
      return true;
    }
    return false;
  }

  countOf(id) {
    let n = 0;
    for (const s of this.slots) if (s && s.id === id) n += s.count;
    return n;
  }

  removeItems(id, count) {
    for (let i = 0; i < 36 && count > 0; i++) {
      const s = this.slots[i];
      if (s && s.id === id) {
        const take = Math.min(s.count, count);
        s.count -= take; count -= take;
        if (s.count <= 0) this.slots[i] = null;
      }
    }
  }

  clear() { this.slots.fill(null); }

  serialize() { return this.slots.map(s => s ? [s.id, s.count, s.dur] : null); }
  static deserialize(arr) {
    const inv = new Inventory();
    if (Array.isArray(arr)) {
      arr.forEach((v, i) => {
        if (v && ITEMS[v[0]]) inv.slots[i] = { id: v[0], count: v[1], dur: v[2] };
      });
    }
    return inv;
  }
}

// ==================== 合成配方 ====================
// shaped: pattern + key; shapeless: ingredients
const RECIPES = [];

function addShaped(pattern, key, resultId, resultCount) {
  RECIPES.push({ type: "shaped", pattern, key, result: { id: resultId, count: resultCount } });
}
function addShapeless(ingredients, resultId, resultCount) {
  RECIPES.push({ type: "shapeless", ingredients, result: { id: resultId, count: resultCount } });
}

// 基础
for (const log of [B.OAK_LOG, B.BIRCH_LOG, B.SPRUCE_LOG]) addShapeless([log], B.OAK_PLANKS, 4);
addShaped(["X", "X"], { X: B.OAK_PLANKS }, I.STICK, 4);
addShaped(["XX", "XX"], { X: B.OAK_PLANKS }, B.CRAFTING_TABLE, 1);
addShaped(["XXX", "X.X", "XXX"], { X: B.COBBLESTONE }, B.FURNACE, 1);
addShaped(["XXX", "SSS", "XXX"], { X: B.OAK_PLANKS, S: I.STICK }, B.BOOKSHELF, 1);
addShaped(["XX", "XX"], { X: B.STONE }, B.STONE_BRICKS, 4);
// 火把 (煤 / 木炭)
addShaped(["C", "S"], { C: I.COAL, S: I.STICK }, B.TORCH, 4);
addShaped(["C", "S"], { C: I.CHARCOAL, S: I.STICK }, B.TORCH, 4);
// TNT (以煤代替火药的替代配方)
addShaped(["CSC", "SCS", "CSC"], { C: I.COAL, S: B.SAND }, B.TNT, 1);
addShaped(["CSC", "SCS", "CSC"], { C: I.CHARCOAL, S: B.SAND }, B.TNT, 1);
// 存储块
addShaped(["XXX", "XXX", "XXX"], { X: I.IRON_INGOT }, B.IRON_BLOCK, 1);
addShaped(["XXX", "XXX", "XXX"], { X: I.GOLD_INGOT }, B.GOLD_BLOCK, 1);
addShaped(["XXX", "XXX", "XXX"], { X: I.DIAMOND }, B.DIAMOND_BLOCK, 1);
addShaped(["XXX", "XXX", "XXX"], { X: I.COAL }, B.COAL_BLOCK, 1);
addShapeless([B.IRON_BLOCK], I.IRON_INGOT, 9);
addShapeless([B.GOLD_BLOCK], I.GOLD_INGOT, 9);
addShapeless([B.DIAMOND_BLOCK], I.DIAMOND, 9);
addShapeless([B.COAL_BLOCK], I.COAL, 9);

// 工具 (5 材质 × 4 类型)
const TOOL_MATERIALS = [
  { block: B.OAK_PLANKS, ids: { PICK: I.WOOD_PICK, AXE: I.WOOD_AXE, SHOVEL: I.WOOD_SHOVEL, SWORD: I.WOOD_SWORD } },
  { block: B.COBBLESTONE, ids: { PICK: I.STONE_PICK, AXE: I.STONE_AXE, SHOVEL: I.STONE_SHOVEL, SWORD: I.STONE_SWORD } },
  { block: I.IRON_INGOT, ids: { PICK: I.IRON_PICK, AXE: I.IRON_AXE, SHOVEL: I.IRON_SHOVEL, SWORD: I.IRON_SWORD } },
  { block: I.GOLD_INGOT, ids: { PICK: I.GOLD_PICK, AXE: I.GOLD_AXE, SHOVEL: I.GOLD_SHOVEL, SWORD: I.GOLD_SWORD } },
  { block: I.DIAMOND, ids: { PICK: I.DIAMOND_PICK, AXE: I.DIAMOND_AXE, SHOVEL: I.DIAMOND_SHOVEL, SWORD: I.DIAMOND_SWORD } },
];
for (const m of TOOL_MATERIALS) {
  addShaped(["XXX", ".S.", ".S."], { X: m.block, S: I.STICK }, m.ids.PICK, 1);
  addShaped(["XX.", "XS.", ".S."], { X: m.block, S: I.STICK }, m.ids.AXE, 1);
  addShaped(["X", "S", "S"], { X: m.block, S: I.STICK }, m.ids.SHOVEL, 1);
  addShaped(["X", "X", "S"], { X: m.block, S: I.STICK }, m.ids.SWORD, 1);
}

// 归一化网格 (裁掉空行空列)
function normalizeGrid(grid, w) {
  const h = grid.length / w;
  let minR = 99, maxR = -1, minC = 99, maxC = -1;
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
    if (grid[r * w + c]) {
      minR = Math.min(minR, r); maxR = Math.max(maxR, r);
      minC = Math.min(minC, c); maxC = Math.max(maxC, c);
    }
  }
  if (maxR < 0) return null;
  const rows = [];
  for (let r = minR; r <= maxR; r++) {
    const row = [];
    for (let c = minC; c <= maxC; c++) row.push(grid[r * w + c]);
    rows.push(row);
  }
  return rows;
}

// 在 size x size 网格中匹配配方 (slots: 数组 of stack|null)
function matchRecipe(slots, size) {
  const grid = slots.map(s => s ? s.id : 0);
  const norm = normalizeGrid(grid, size);
  if (!norm) return null;

  // shapeless
  const present = grid.filter(x => x !== 0).sort((a, b) => a - b);
  if (present.length) {
    for (const r of RECIPES) {
      if (r.type !== "shapeless") continue;
      const need = [...r.ingredients].sort((a, b) => a - b);
      if (need.length === present.length && need.every((v, i) => v === present[i])) return r.result;
    }
  }

  // shaped
  for (const r of RECIPES) {
    if (r.type !== "shaped") continue;
    if (r.pattern.length !== norm.length) continue;
    let ok = true;
    for (let row = 0; row < norm.length && ok; row++) {
      const prow = r.pattern[row];
      if (prow.length !== norm[row].length) { ok = false; break; }
      for (let col = 0; col < prow.length; col++) {
        const ch = prow[col];
        const want = ch === "." ? 0 : r.key[ch];
        if ((norm[row][col] || 0) !== (want || 0)) { ok = false; break; }
      }
    }
    if (ok) return r.result;
  }
  return null;
}

// ==================== 熔炉 ====================
const SMELT_RECIPES = {
  [B.IRON_ORE]: { id: I.IRON_INGOT, count: 1 },
  [B.GOLD_ORE]: { id: I.GOLD_INGOT, count: 1 },
  [B.SAND]: { id: B.GLASS, count: 1 },
  [B.COBBLESTONE]: { id: B.STONE, count: 1 },
  [I.PORKCHOP]: { id: I.COOKED_PORKCHOP, count: 1 },
  [B.OAK_LOG]: { id: I.CHARCOAL, count: 1 },
  [B.BIRCH_LOG]: { id: I.CHARCOAL, count: 1 },
  [B.SPRUCE_LOG]: { id: I.CHARCOAL, count: 1 },
};

const FUEL_VALUES = {
  [I.COAL]: 80, [I.CHARCOAL]: 80, [B.COAL_BLOCK]: 800,
  [B.OAK_PLANKS]: 15, [B.OAK_LOG]: 15, [B.BIRCH_LOG]: 15, [B.SPRUCE_LOG]: 15,
  [I.STICK]: 5, [I.WOOD_PICK]: 10, [I.WOOD_AXE]: 10, [I.WOOD_SHOVEL]: 10, [I.WOOD_SWORD]: 10,
  [B.CRAFTING_TABLE]: 15, [B.BOOKSHELF]: 15,
};

const FURNACE_COOK_TIME = 10;

function newFurnaceState() {
  return { type: "furnace", input: null, fuel: null, output: null, burn: 0, burnMax: 1, cook: 0 };
}

function tickFurnace(world, dt) {
  for (const [key, f] of world.blockEntities) {
    if (f.type !== "furnace") continue;
    const smeltable = f.input && SMELT_RECIPES[f.input.id];
    const outOk = smeltable && (!f.output ||
      (f.output.id === smeltable.id && f.output.count + smeltable.count <= ITEMS[smeltable.id].stack));

    if (f.burn > 0) f.burn -= dt;

    if (f.burn <= 0 && smeltable && outOk && f.fuel && FUEL_VALUES[f.fuel.id]) {
      f.burnMax = FUEL_VALUES[f.fuel.id];
      f.burn = f.burnMax;
      f.fuel.count--;
      if (f.fuel.count <= 0) f.fuel = null;
    }

    if (f.burn > 0 && smeltable && outOk) {
      f.cook += dt;
      if (f.cook >= FURNACE_COOK_TIME) {
        f.cook = 0;
        const res = SMELT_RECIPES[f.input.id];
        if (f.output) f.output.count += res.count;
        else f.output = { id: res.id, count: res.count };
        f.input.count--;
        if (f.input.count <= 0) f.input = null;
      }
    } else {
      f.cook = Math.max(0, f.cook - dt * 2);
    }
  }
}
