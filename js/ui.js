/* ============================================================
 * VoxelCraft — UI 管理器
 * HUD / 物品栏 / 合成 / 熔炉 / 聊天 / 菜单 / 设置
 * ============================================================ */
"use strict";

const SPLASHES = [
  "100% 原创!", "纯 JavaScript!", "无需安装!", "也有夜晚!", "警惕僵尸!",
  "不要挖正下方!", "水是湿的!", "由程序生成!", "试试 TNT!", "寻找钻石!",
  "含铁量达标!", "支持创造模式!", "昼夜循环!", "可合成工具!", "掉落物会旋转!",
];

// /give 英文别名
const EN_ALIAS = {
  stone: B.STONE, dirt: B.DIRT, grass: B.GRASS, cobblestone: B.COBBLESTONE, cobble: B.COBBLESTONE,
  sand: B.SAND, gravel: B.GRAVEL, log: B.OAK_LOG, oak_log: B.OAK_LOG, wood: B.OAK_LOG,
  planks: B.OAK_PLANKS, glass: B.GLASS, coal: I.COAL, charcoal: I.CHARCOAL,
  iron: I.IRON_INGOT, iron_ingot: I.IRON_INGOT, gold: I.GOLD_INGOT, gold_ingot: I.GOLD_INGOT,
  diamond: I.DIAMOND, apple: I.APPLE, stick: I.STICK, torch: B.TORCH, tnt: B.TNT,
  furnace: B.FURNACE, table: B.CRAFTING_TABLE, crafting_table: B.CRAFTING_TABLE,
  bedrock: B.BEDROCK, obsidian: B.OBSIDIAN, snow: B.SNOW_BLOCK, ice: B.ICE,
  bricks: B.BRICKS, brick: B.BRICKS, sword: I.IRON_SWORD, pickaxe: I.IRON_PICK,
  porkchop: I.PORKCHOP, cooked_porkchop: I.COOKED_PORKCHOP, wool: B.WOOL, pumpkin: B.PUMPKIN,
  bookshelf: B.BOOKSHELF, sandstone: B.SANDSTONE, cactus: B.CACTUS, obsidian: B.OBSIDIAN,
};

function iconCanvasFor(id) {
  const cv = document.createElement("canvas");
  cv.width = 32; cv.height = 32;
  const src = ICONS[id];
  if (src) cv.getContext("2d").drawImage(src, 0, 0);
  return cv;
}

class UI {
  constructor() {
    this.$ = (id) => document.getElementById(id);

    this.cursorStack = null;        // 鼠标手持
    this.craft2 = new Array(4).fill(null);   // 2x2 合成格
    this.craft3 = new Array(9).fill(null);   // 3x3 合成格
    this.openName = null;           // inventory | table | furnace
    this.furnaceKey = null;
    this.deathCause = "none";       // player.js 引用(需 truthy)
    this.creativeFilter = "";

    // 震屏
    this._shakeT = 0; this._shakeDur = 0; this._shakeAmp = 0;

    // HUD 缓存
    this._hud = { hp: -1, hunger: -1, air: -1 };
    this._hotbarSel = -1;

    // 聊天
    this._chatHistory = [];
    this._chatHistIdx = -1;

    // 熔炉界面缓存
    this._furnSnap = "";
    this._furnEls = null;

    // 设置返回来源
    this.settingsFrom = "title";

    // 主循环回调(由 main 注入)
    this.onStartWorld = null;
    this.onResume = null;
    this.onRespawn = null;
    this.onQuitToTitle = null;
    this.onScreenOpen = null;
    this.onScreenClose = null;
  }

  // ==================== 初始化 ====================
  init() {
    // 状态图标 dataURL
    this.heartIcons = {
      full: makeHeartIcon("full").toDataURL(),
      half: makeHeartIcon("half").toDataURL(),
      empty: makeHeartIcon("empty").toDataURL(),
    };
    this.hungerIcons = {
      full: makeHungerIcon("full").toDataURL(),
      half: makeHungerIcon("half").toDataURL(),
      empty: makeHungerIcon("empty").toDataURL(),
    };
    this.bubbleIcon = makeBubbleIcon().toDataURL();
    this.$("hunger").style.flexDirection = "row-reverse";
    this.$("air").style.flexDirection = "row-reverse";

    this.buildHotbarDom();
    this.bindMenus();
    this.bindSettings();
    this.bindChat();
    this.bindCursorFollow();

    // 随机 splash
    this.$("splash").textContent = SPLASHES[(Math.random() * SPLASHES.length) | 0];
  }

  // ==================== 快捷栏 ====================
  buildHotbarDom() {
    const bar = this.$("hotbar");
    bar.innerHTML = "";
    this.hotbarSlots = [];
    for (let i = 0; i < 9; i++) {
      const el = document.createElement("div");
      el.className = "hotbar-slot";
      bar.appendChild(el);
      this.hotbarSlots.push(el);
    }
  }

  refreshHotbar() {
    if (!G.player || !this.hotbarSlots) return;
    const inv = G.player.inventory;
    for (let i = 0; i < 9; i++) {
      const el = this.hotbarSlots[i];
      el.classList.toggle("selected", i === inv.selected);
      this.fillSlotEl(el, inv.slots[i], false);
    }
    this._hotbarSel = inv.selected;
  }

  setHotbarSelected(i) {
    if (!G.player) return;
    G.player.inventory.selected = i;
    this.refreshHotbar();
    this.showHeldName();
  }

  showHeldName() {
    if (!G.player) return;
    const s = G.player.inventory.getHeld();
    const el = this.$("held-item-name");
    el.textContent = s ? ITEMS[s.id].name : "";
    el.classList.add("show");
    clearTimeout(this._heldNameTimer);
    this._heldNameTimer = setTimeout(() => el.classList.remove("show"), 1400);
  }

  // ==================== HUD ====================
  updateHud() {
    const p = G.player;
    if (!p) return;
    const hearts = this.$("hearts"), hunger = this.$("hunger");

    if (this._hud.hp !== p.hp) {
      this._hud.hp = p.hp;
      hearts.innerHTML = "";
      const visible = p.mode === "survival";
      hearts.style.display = visible ? "flex" : "none";
      for (let i = 0; i < 10; i++) {
        const img = document.createElement("img");
        const v = p.hp - i * 2;
        img.src = v >= 2 ? this.heartIcons.full : v >= 1 ? this.heartIcons.half : this.heartIcons.empty;
        hearts.appendChild(img);
      }
    }
    if (this._hud.hunger !== p.hunger) {
      this._hud.hunger = p.hunger;
      hunger.innerHTML = "";
      const visible = p.mode === "survival";
      hunger.style.display = visible ? "flex" : "none";
      for (let i = 0; i < 10; i++) {
        const img = document.createElement("img");
        const v = p.hunger - i * 2;
        img.src = v >= 2 ? this.hungerIcons.full : v >= 1 ? this.hungerIcons.half : this.hungerIcons.empty;
        hunger.appendChild(img);
      }
    }
    const air = p.air === undefined ? 10 : p.air;
    if (this._hud.air !== air) {
      this._hud.air = air;
      const row = this.$("air-row");
      if (air < 9.99 && p.mode === "survival") {
        row.style.minHeight = "21px";
        const el = this.$("air");
        el.innerHTML = "";
        const n = Math.ceil(air);
        for (let i = 0; i < n; i++) {
          const img = document.createElement("img");
          img.src = this.bubbleIcon;
          el.appendChild(img);
        }
      } else {
        row.style.minHeight = "0";
        this.$("air").innerHTML = "";
      }
    }
  }

  damageFlash() {
    const el = this.$("damage-overlay");
    el.classList.add("hit");
    clearTimeout(this._dmgTimer);
    this._dmgTimer = setTimeout(() => el.classList.remove("hit"), 120);
  }

  shake(dur, amp = 0.12) {
    this._shakeT = dur; this._shakeDur = dur; this._shakeAmp = amp;
  }

  consumeShake(dt) {
    if (this._shakeT <= 0) return 0;
    this._shakeT -= dt;
    return this._shakeAmp * Math.max(0, this._shakeT / this._shakeDur);
  }

  setUnderwater(on) {
    this.$("underwater-overlay").classList.toggle("hidden", !on);
  }

  showHud() { this.$("hud").classList.remove("hidden"); }
  hideHud() { this.$("hud").classList.add("hidden"); }

  // ==================== 死亡 ====================
  showDeath(cause) {
    this.$("death-cause").textContent = cause || "";
    this.showScreen("death-screen");
    // 死亡时掉落合成格与鼠标物品
    this.dropCraftAndCursor();
  }

  dropCraftAndCursor() {
    const p = G.player;
    if (!p || !p.entities) { this.cursorStack = null; return; }
    const drop = (s) => {
      if (s) p.entities.spawnDrop(p.pos.x, p.pos.y + 0.8, p.pos.z, s.id, s.count);
    };
    for (let i = 0; i < this.craft2.length; i++) { drop(this.craft2[i]); this.craft2[i] = null; }
    for (let i = 0; i < this.craft3.length; i++) { drop(this.craft3[i]); this.craft3[i] = null; }
    drop(this.cursorStack);
    this.cursorStack = null;
    this.hideCursorItem();
  }

  // ==================== 屏幕管理 ====================
  showScreen(id) {
    for (const s of document.querySelectorAll(".screen")) s.classList.add("hidden");
    const el = this.$(id);
    if (el) el.classList.remove("hidden");
  }

  hideAllScreens() {
    for (const s of document.querySelectorAll(".screen")) s.classList.add("hidden");
  }

  hasScreenOpen() {
    if (this.openName) return true;
    // 暂停/设置/死亡等也阻断输入(main 自行判断 G.paused)
    return false;
  }

  openScreen(name) {
    if (G.state !== "playing") return;
    this.closeScreen(true);
    this.openName = name;
    this.renderActiveScreen();
    if (name === "inventory") this.showScreen("inventory-screen");
    else if (name === "table") this.showScreen("table-screen");
    else if (name === "furnace") this.showScreen("furnace-screen");
    if (this.onScreenOpen) this.onScreenOpen();
  }

  openFurnace(x, y, z) {
    this.furnaceKey = `${x},${y},${z}`;
    let f = G.world.blockEntities.get(this.furnaceKey);
    if (!f) { f = newFurnaceState(); G.world.blockEntities.set(this.furnaceKey, f); }
    this.openScreen("furnace");
  }

  closeScreen(silent = false) {
    if (!this.openName) return;
    // 归还合成格物品
    this.returnCraftItems();
    this.openName = null;
    this.furnaceKey = null;
    this._furnEls = null;
    this.hideAllScreens();
    this.hideTooltip();
    if (!silent) {
      // 归还鼠标物品
      if (this.cursorStack && G.player) {
        const remain = G.player.inventory.giveItem(this.cursorStack.id, this.cursorStack.count);
        if (remain > 0 && G.player.entities) {
          G.player.entities.spawnDrop(G.player.pos.x, G.player.pos.y + 1, G.player.pos.z, this.cursorStack.id, remain);
        }
        this.cursorStack = null;
      }
      this.hideCursorItem();
      this.refreshHotbar();
      if (this.onScreenClose) this.onScreenClose();
    }
  }

  returnCraftItems() {
    const p = G.player;
    if (!p) return;
    const grids = [this.craft2, this.craft3];
    for (const grid of grids) {
      for (let i = 0; i < grid.length; i++) {
        const s = grid[i];
        if (!s) continue;
        const remain = p.inventory.giveItem(s.id, s.count);
        if (remain > 0 && p.entities) {
          p.entities.spawnDrop(p.pos.x, p.pos.y + 1, p.pos.z, s.id, remain);
        }
        grid[i] = null;
      }
    }
  }

  // ==================== 通用槽位 ====================
  fillSlotEl(el, stack, interactive = true) {
    el.innerHTML = "";
    if (!stack) return;
    el.appendChild(iconCanvasFor(stack.id));
    if (stack.count > 1) {
      const c = document.createElement("div");
      c.className = "slot-count";
      c.textContent = stack.count;
      el.appendChild(c);
    }
    const item = ITEMS[stack.id];
    if (item && item.tool && stack.dur !== undefined && stack.dur < item.tool.durability) {
      const frac = clamp(stack.dur / item.tool.durability, 0, 1);
      const bar = document.createElement("div");
      bar.style.cssText = "position:absolute;left:3px;right:3px;bottom:2px;height:3px;background:#111;";
      const fill = document.createElement("div");
      fill.style.cssText = `height:100%;width:${(frac * 100).toFixed(1)}%;background:${frac > 0.5 ? "#5ae05a" : frac > 0.25 ? "#e0c33a" : "#e05a5a"};`;
      bar.appendChild(fill);
      el.appendChild(bar);
    }
  }

  // 生成一个可交互槽位
  // ctx: {get, set, quickMove?, result?, outputOnly?, creativeSource?, trash?}
  makeSlot(ctx) {
    const el = document.createElement("div");
    el.className = "inv-slot" + (ctx.result ? " result-slot" : "");
    this.fillSlotEl(el, ctx.get());
    el.addEventListener("mousedown", (e) => {
      e.preventDefault(); e.stopPropagation();
      this.slotClick(e, ctx);
    });
    el.addEventListener("mouseenter", () => this.showTooltipFor(ctx.get()));
    el.addEventListener("mouseleave", () => this.hideTooltip());
    return el;
  }

  slotClick(e, ctx) {
    if (G.state !== "playing" && G.state !== "dead") return;
    const cur = this.cursorStack;

    // 垃圾槽(创造)
    if (ctx.trash) {
      this.cursorStack = null;
      this.hideCursorItem();
      this.renderActiveScreen();
      return;
    }

    // 创造物品源
    if (ctx.creativeSource) {
      const src = ctx.get();
      if (!src) return;
      if (e.button === 0) {
        this.cursorStack = { id: src.id, count: ITEMS[src.id].stack };
        if (ITEMS[src.id].tool) this.cursorStack.dur = ITEMS[src.id].tool.durability;
      } else if (e.button === 2) {
        this.cursorStack = { id: src.id, count: 1 };
        if (ITEMS[src.id].tool) this.cursorStack.dur = ITEMS[src.id].tool.durability;
      }
      this.showCursorItem();
      return;
    }

    // 合成结果槽
    if (ctx.result) {
      this.takeResult(e.shiftKey);
      return;
    }

    const stack = ctx.get();

    // 只出不进(熔炉产物)
    if (ctx.outputOnly) {
      if (!stack) return;
      if (e.button === 2) return;
      if (e.shiftKey) {
        // 全部移入背包
        const remain = G.player.inventory.giveItem(stack.id, stack.count);
        ctx.set(remain > 0 ? { ...stack, count: remain } : null);
      } else if (!cur) {
        this.cursorStack = stack; ctx.set(null);
      } else if (cur.id === stack.id && cur.count + stack.count <= ITEMS[stack.id].stack) {
        cur.count += stack.count; ctx.set(null);
      }
      this.afterSlotChange();
      return;
    }

    if (e.button === 0) {
      if (e.shiftKey && stack && ctx.quickMove) {
        ctx.quickMove();
      } else if (!cur) {
        if (stack) { this.cursorStack = stack; ctx.set(null); }
      } else if (!stack) {
        if (!ctx.canPut || ctx.canPut(cur)) { ctx.set(cur); this.cursorStack = null; }
      } else if (cur.id === stack.id) {
        const max = ITEMS[stack.id].stack;
        const take = Math.min(max - stack.count, cur.count);
        if (take > 0) {
          stack.count += take; cur.count -= take;
          if (cur.count <= 0) this.cursorStack = null;
          ctx.set(stack);
        } else if (!ctx.canPut || ctx.canPut(cur)) {
          this.cursorStack = stack; ctx.set(cur); // 交换
        }
      } else {
        if (!ctx.canPut || ctx.canPut(cur)) { this.cursorStack = stack; ctx.set(cur); }
      }
    } else if (e.button === 2) {
      if (!cur) {
        if (stack) {
          const take = Math.ceil(stack.count / 2);
          const rest = stack.count - take;
          this.cursorStack = { ...stack, count: take };
          ctx.set(rest > 0 ? { ...stack, count: rest } : null);
        }
      } else {
        if (!stack) {
          if (!ctx.canPut || ctx.canPut(cur)) {
            ctx.set({ ...cur, count: 1 });
            cur.count--;
            if (cur.count <= 0) this.cursorStack = null;
          }
        } else if (stack.id === cur.id && stack.count < ITEMS[stack.id].stack) {
          if (!ctx.canPut || ctx.canPut(cur)) {
            stack.count++; cur.count--;
            if (cur.count <= 0) this.cursorStack = null;
            ctx.set(stack);
          }
        }
      }
    }
    this.afterSlotChange();
  }

  afterSlotChange() {
    this.showCursorItem();
    this.renderActiveScreen();
    this.refreshHotbar();
  }

  // ==================== 合成 ====================
  activeCraft() {
    return this.openName === "table"
      ? { slots: this.craft3, size: 3 }
      : { slots: this.craft2, size: 2 };
  }

  currentCraftResult() {
    if (this.openName !== "inventory" && this.openName !== "table") return null;
    const { slots, size } = this.activeCraft();
    return matchRecipe(slots, size);
  }

  consumeCraftGrid(slots) {
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i];
      if (s) { s.count--; if (s.count <= 0) slots[i] = null; }
    }
  }

  takeResult(toInventory) {
    const { slots, size } = this.activeCraft();
    let result = matchRecipe(slots, size);
    if (!result) return;

    if (toInventory) {
      let crafted = 0;
      while (result && crafted < 64) {
        const remain = G.player.inventory.giveItem(result.id, result.count);
        if (remain > 0) break;
        this.consumeCraftGrid(slots);
        result = matchRecipe(slots, size);
        crafted++;
      }
      if (crafted) Sound.craft();
    } else {
      const cur = this.cursorStack;
      if (!cur) {
        this.cursorStack = { id: result.id, count: result.count };
        if (ITEMS[result.id].tool) this.cursorStack.dur = ITEMS[result.id].tool.durability;
      } else if (cur.id === result.id && cur.count + result.count <= ITEMS[result.id].stack) {
        cur.count += result.count;
      } else return;
      this.consumeCraftGrid(slots);
      Sound.craft();
    }
    this.afterSlotChange();
  }

  // ==================== 面板渲染 ====================
  renderActiveScreen() {
    if (!this.openName || !G.player) return;
    if (this.openName === "inventory") {
      if (G.player.mode === "creative") this.renderCreativePanel();
      else this.renderCraftPanel("inv-panel", 2);
    } else if (this.openName === "table") {
      this.renderCraftPanel("table-panel", 3);
    } else if (this.openName === "furnace") {
      this.renderFurnacePanel();
    }
  }

  // 玩家物品栏区(27 背包 + 9 快捷栏)
  buildPlayerInvSection(container) {
    const inv = G.player.inventory;
    const mk = (i) => this.makeSlot({
      get: () => inv.slots[i],
      set: (v) => { inv.slots[i] = v; },
      quickMove: () => this.quickMoveInv(i),
    });
    const back = document.createElement("div");
    back.className = "inv-grid";
    back.style.gridTemplateColumns = "repeat(9, 44px)";
    for (let i = 9; i < 36; i++) back.appendChild(mk(i));
    container.appendChild(back);

    const sp = document.createElement("div");
    sp.style.height = "10px";
    container.appendChild(sp);

    const hot = document.createElement("div");
    hot.className = "inv-grid";
    hot.style.gridTemplateColumns = "repeat(9, 44px)";
    for (let i = 0; i < 9; i++) hot.appendChild(mk(i));
    container.appendChild(hot);
  }

  quickMoveInv(i) {
    const inv = G.player.inventory;
    const s = inv.slots[i];
    if (!s) return;

    // 熔炉界面: 优先放入输入/燃料
    if (this.openName === "furnace") {
      const f = G.world && G.world.blockEntities.get(this.furnaceKey);
      if (f) {
        const tryInto = (slot) => {
          if (!slot) { return { ...s }; }
          if (slot.id === s.id && slot.count + s.count <= ITEMS[s.id].stack) {
            return { ...slot, count: slot.count + s.count };
          }
          return null;
        };
        if (SMELT_RECIPES[s.id]) {
          const merged = tryInto(f.input);
          if (merged) { f.input = merged; inv.slots[i] = null; return; }
        }
        if (FUEL_VALUES[s.id]) {
          const merged = tryInto(f.fuel);
          if (merged) { f.fuel = merged; inv.slots[i] = null; return; }
        }
      }
    }

    if (i < 9) this.moveRange(inv, i, 9, 36);
    else this.moveRange(inv, i, 0, 9);
  }

  moveRange(inv, i, a, b) {
    const s = inv.slots[i];
    if (!s) return;
    const max = ITEMS[s.id].stack;
    for (let j = a; j < b; j++) {
      const t = inv.slots[j];
      if (t && t.id === s.id && t.count < max) {
        const take = Math.min(max - t.count, s.count);
        t.count += take; s.count -= take;
        if (s.count <= 0) { inv.slots[i] = null; return; }
      }
    }
    for (let j = a; j < b; j++) {
      if (!inv.slots[j]) { inv.slots[j] = s; inv.slots[i] = null; return; }
    }
  }

  // 背包(生存)/工作台
  renderCraftPanel(panelId, size) {
    const panel = this.$(panelId);
    panel.innerHTML = "";

    const title = document.createElement("h3");
    title.textContent = size === 3 ? "工作台" : "物品栏";
    panel.appendChild(title);

    const grid = size === 3 ? this.craft3 : this.craft2;
    const row = document.createElement("div");
    row.className = "inv-craft-row";

    const gridEl = document.createElement("div");
    gridEl.className = "inv-grid";
    gridEl.style.gridTemplateColumns = `repeat(${size}, 44px)`;
    for (let i = 0; i < size * size; i++) {
      gridEl.appendChild(this.makeSlot({
        get: () => grid[i],
        set: (v) => { grid[i] = v; },
        quickMove: () => {
          const s = grid[i];
          if (!s) return;
          const remain = G.player.inventory.giveItem(s.id, s.count);
          grid[i] = remain > 0 ? { ...s, count: remain } : null;
        },
      }));
    }
    row.appendChild(gridEl);

    const arrow = document.createElement("div");
    arrow.className = "arrow-icon";
    row.appendChild(arrow);

    const result = this.currentCraftResult();
    row.appendChild(this.makeSlot({
      get: () => result ? { id: result.id, count: result.count } : null,
      set: () => { },
      result: true,
    }));
    panel.appendChild(row);

    this.buildPlayerInvSection(panel);
  }

  // 创造物品栏
  renderCreativePanel() {
    const panel = this.$("inv-panel");
    panel.innerHTML = "";

    const title = document.createElement("h3");
    title.textContent = "创造物品栏";
    panel.appendChild(title);

    // 搜索行 + 垃圾槽
    const searchRow = document.createElement("div");
    searchRow.className = "search-row";
    searchRow.style.display = "flex";
    searchRow.style.gap = "8px";
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "搜索物品…";
    input.value = this.creativeFilter;
    input.addEventListener("input", () => {
      this.creativeFilter = input.value;
      this.renderCreativePanel();
      const ni = this.$("inv-panel").querySelector("input");
      if (ni) { ni.focus(); ni.setSelectionRange(ni.value.length, ni.value.length); }
    });
    input.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.code === "Escape") this.closeScreen();
    });
    searchRow.appendChild(input);
    const trash = this.makeSlot({ get: () => null, set: () => { }, trash: true });
    trash.style.background = "#7a4040";
    trash.style.fontSize = "20px";
    trash.style.color = "#fff";
    trash.textContent = "✕";
    searchRow.appendChild(trash);
    panel.appendChild(searchRow);

    // 物品网格
    const grid = document.createElement("div");
    grid.className = "inv-grid creative-grid";
    grid.style.gridTemplateColumns = "repeat(9, 44px)";
    const filter = this.creativeFilter.trim().toLowerCase();
    for (const id of CREATIVE_ITEMS) {
      const item = ITEMS[id];
      if (!item) continue;
      if (filter && !item.name.toLowerCase().includes(filter) &&
        !(EN_ALIAS[filter] === id)) continue;
      grid.appendChild(this.makeSlot({
        get: () => ({ id, count: 1 }),
        set: () => { },
        creativeSource: true,
      }));
    }
    panel.appendChild(grid);

    const sp = document.createElement("div");
    sp.style.height = "10px";
    panel.appendChild(sp);

    // 快捷栏
    const inv = G.player.inventory;
    const hot = document.createElement("div");
    hot.className = "inv-grid";
    hot.style.gridTemplateColumns = "repeat(9, 44px)";
    for (let i = 0; i < 9; i++) {
      hot.appendChild(this.makeSlot({
        get: () => inv.slots[i],
        set: (v) => { inv.slots[i] = v; },
      }));
    }
    panel.appendChild(hot);
  }

  // 熔炉
  currentFurnace() {
    if (!G.world || !this.furnaceKey) return null;
    return G.world.blockEntities.get(this.furnaceKey) || null;
  }

  renderFurnacePanel() {
    const f = this.currentFurnace();
    if (!f) { this.closeScreen(); return; }
    const panel = this.$("furnace-panel");
    panel.innerHTML = "";

    const title = document.createElement("h3");
    title.textContent = "熔炉";
    panel.appendChild(title);

    const row = document.createElement("div");
    row.className = "inv-craft-row";

    // 左列: 输入 + 火焰 + 燃料
    const left = document.createElement("div");
    left.style.display = "flex";
    left.style.flexDirection = "column";
    left.style.alignItems = "center";

    left.appendChild(this.makeSlot({
      get: () => f.input,
      set: (v) => { f.input = v; },
      canPut: (s) => !!SMELT_RECIPES[s.id],
    }));

    const flameWrap = document.createElement("div");
    flameWrap.className = "furnace-flame";
    const flameCv = document.createElement("canvas");
    flameCv.width = 28; flameCv.height = 28;
    flameWrap.appendChild(flameCv);
    left.appendChild(flameWrap);

    left.appendChild(this.makeSlot({
      get: () => f.fuel,
      set: (v) => { f.fuel = v; },
      canPut: (s) => !!FUEL_VALUES[s.id],
    }));
    row.appendChild(left);

    // 中: 进度箭头
    const arrow = document.createElement("div");
    arrow.className = "arrow-icon";
    const fill = document.createElement("div");
    fill.className = "arrow-fill";
    arrow.appendChild(fill);
    row.appendChild(arrow);

    // 右: 产物
    row.appendChild(this.makeSlot({
      get: () => f.output,
      set: (v) => { f.output = v; },
      outputOnly: true,
    }));

    panel.appendChild(row);
    this._furnEls = { flameCv, fill };
    this.updateFurnaceVisuals(f);

    this.buildPlayerInvSection(panel);
  }

  updateFurnaceVisuals(f) {
    if (!this._furnEls) return;
    const { flameCv, fill } = this._furnEls;
    const ctx = flameCv.getContext("2d");
    ctx.clearRect(0, 0, 28, 28);
    // 底色
    ctx.fillStyle = "#3a3a3a";
    ctx.fillRect(4, 4, 20, 20);
    const ratio = f.burn > 0 ? clamp(f.burn / (f.burnMax || 1), 0, 1) : 0;
    if (ratio > 0) {
      const h = Math.round(20 * ratio);
      for (let y = 0; y < h; y++) {
        const w = 4 + Math.round(12 * (y / 20) ** 0.7);
        ctx.fillStyle = y > h * 0.7 ? "#ffd83f" : y > h * 0.3 ? "#ff9d2e" : "#e8641a";
        ctx.fillRect(14 - w / 2, 23 - y, w, 1);
      }
    }
    fill.style.width = `${Math.round(clamp(f.cook / FURNACE_COOK_TIME, 0, 1) * 100)}%`;
  }

  tickFurnaceLive() {
    if (this.openName !== "furnace") return;
    const f = this.currentFurnace();
    if (!f) return;
    this.updateFurnaceVisuals(f);
    const snap = JSON.stringify([f.input, f.fuel, f.output]);
    if (snap !== this._furnSnap) {
      this._furnSnap = snap;
      this.renderFurnacePanel();
    }
  }

  // ==================== 鼠标物品 / 提示 ====================
  bindCursorFollow() {
    document.addEventListener("mousemove", (e) => {
      this._mx = e.clientX; this._my = e.clientY;
      const cur = this.$("cursor-item");
      if (!cur.classList.contains("hidden")) {
        cur.style.left = (e.clientX - 20) + "px";
        cur.style.top = (e.clientY - 20) + "px";
      }
      const tip = this.$("tooltip");
      if (!tip.classList.contains("hidden")) {
        tip.style.left = Math.min(e.clientX + 14, innerWidth - 180) + "px";
        tip.style.top = Math.min(e.clientY + 12, innerHeight - 90) + "px";
      }
    });
  }

  showCursorItem() {
    const el = this.$("cursor-item");
    if (!this.cursorStack) { this.hideCursorItem(); return; }
    el.innerHTML = "";
    el.appendChild(iconCanvasFor(this.cursorStack.id));
    if (this.cursorStack.count > 1) {
      const c = document.createElement("div");
      c.className = "slot-count";
      c.textContent = this.cursorStack.count;
      el.appendChild(c);
    }
    el.classList.remove("hidden");
    if (this._mx !== undefined) {
      el.style.left = (this._mx - 20) + "px";
      el.style.top = (this._my - 20) + "px";
    }
  }

  hideCursorItem() {
    this.$("cursor-item").classList.add("hidden");
  }

  showTooltipFor(stack) {
    if (!stack) { this.hideTooltip(); return; }
    const item = ITEMS[stack.id];
    if (!item) return;
    let text = item.name;
    if (item.tool) {
      const dur = stack.dur === undefined ? item.tool.durability : stack.dur;
      text += `\n耐久 ${dur} / ${item.tool.durability}`;
    }
    if (item.food) text += `\n恢复 ${item.food} 点饥饿`;
    if (item.isBlock && BLOCKS[stack.id] && BLOCKS[stack.id].interact === "furnace") text += "\n右键打开";
    const tip = this.$("tooltip");
    tip.textContent = text;
    tip.classList.remove("hidden");
  }

  hideTooltip() {
    this.$("tooltip").classList.add("hidden");
  }

  // ==================== Toast ====================
  toast(msg) {
    const wrap = this.$("toast");
    const el = document.createElement("div");
    el.className = "toast-msg";
    el.textContent = msg;
    wrap.appendChild(el);
    setTimeout(() => el.remove(), 2600);
  }

  // ==================== 聊天 ====================
  bindChat() {
    const input = this.$("chat-input");
    input.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.code === "Enter") { this.submitChat(); }
      else if (e.code === "Escape") { this.closeChat(); }
      else if (e.code === "ArrowUp") {
        if (this._chatHistory.length) {
          this._chatHistIdx = Math.max(0, this._chatHistIdx - 1);
          input.value = this._chatHistory[this._chatHistIdx];
        }
        e.preventDefault();
      } else if (e.code === "ArrowDown") {
        if (this._chatHistory.length) {
          this._chatHistIdx = Math.min(this._chatHistory.length - 1, this._chatHistIdx + 1);
          input.value = this._chatHistory[this._chatHistIdx];
        }
        e.preventDefault();
      }
    });
  }

  addChat(text) {
    const area = this.$("chat-area");
    const line = document.createElement("div");
    line.className = "chat-line";
    line.textContent = text;
    area.appendChild(line);
    while (area.children.length > 8) area.firstChild.remove();
    setTimeout(() => {
      line.style.opacity = "0";
      setTimeout(() => line.remove(), 1100);
    }, 6500);
  }

  isChatOpen() {
    return !this.$("chat-wrap").classList.contains("hidden");
  }

  openChat(prefix = "") {
    if (G.state !== "playing") return;
    const wrap = this.$("chat-wrap");
    wrap.classList.remove("hidden");
    const input = this.$("chat-input");
    input.value = prefix;
    this._chatHistIdx = this._chatHistory.length;
    setTimeout(() => input.focus(), 0);
  }

  closeChat() {
    this.$("chat-wrap").classList.add("hidden");
    this.$("chat-input").blur();
    this.$("chat-input").value = "";
  }

  submitChat() {
    const input = this.$("chat-input");
    const text = input.value.trim();
    this.closeChat();
    if (!text) return;
    this._chatHistory.push(text);
    if (this._chatHistory.length > 32) this._chatHistory.shift();
    if (text.startsWith("/")) this.runCommand(text);
    else this.addChat("<Steve> " + text);
  }

  // ==================== 命令 ====================
  runCommand(line) {
    const parts = line.slice(1).trim().split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1);
    const p = G.player;

    const ok = (msg) => this.addChat(msg);
    const err = (msg) => this.addChat("§ " + msg);

    if (cmd === "help") {
      ok("/gamemode <生存|创造>  切换模式");
      ok("/time set <day|noon|night|midnight|0-24000>");
      ok("/give <物品名> [数量]");
      ok("/tp <x> <y> <z>  传送");
      ok("/spawn 设置重生点  /heal 治疗  /kill 自杀");
      ok("/seed 种子  /clear 清空背包");
      return;
    }
    if (cmd === "gamemode" || cmd === "gm") {
      const m = args[0] || "";
      let mode = null;
      if (m === "creative" || m === "c" || m === "1" || m === "创造") mode = "creative";
      if (m === "survival" || m === "s" || m === "0" || m === "生存") mode = "survival";
      if (!mode) { err("用法: /gamemode <survival|creative>"); return; }
      G.mode = mode; p.mode = mode;
      if (mode === "survival") p.flying = false;
      this._hud.hp = -1; this._hud.hunger = -1; this._hud.air = -1;
      this.updateHud();
      ok("已将游戏模式设置为" + (mode === "creative" ? "创造模式" : "生存模式"));
      return;
    }
    if (cmd === "time") {
      if (args[0] === "set") {
        const v = args[1] || "";
        const map = { day: 0.02, noon: 0.25, night: 0.55, midnight: 0.75, sunrise: 0.0, sunset: 0.5, 白天: 0.02, 正午: 0.25, 夜晚: 0.55, 午夜: 0.75 };
        let dayT = map[v.toLowerCase ? v.toLowerCase() : v];
        if (dayT === undefined && !isNaN(parseFloat(v))) dayT = (parseFloat(v) / 24000) % 1;
        if (dayT === undefined || dayT < 0) { err("用法: /time set <day|noon|night|midnight|数字>"); return; }
        G.gameTime = Math.floor(G.gameTime / DAY_LENGTH) * DAY_LENGTH + dayT * DAY_LENGTH;
        ok("已设置时间");
        return;
      }
      err("用法: /time set <值>");
      return;
    }
    if (cmd === "give") {
      if (!args[0]) { err("用法: /give <物品名> [数量]"); return; }
      const name = args[0].toLowerCase();
      const count = clamp(parseInt(args[1] || "1") || 1, 1, 999);
      let id = EN_ALIAS[name];
      if (id === undefined) {
        // 中文名精确/模糊
        for (const k in ITEMS) {
          if (ITEMS[k].name === args[0]) { id = ITEMS[k].id; break; }
        }
      }
      if (id === undefined) {
        for (const k in ITEMS) {
          if (ITEMS[k].name.includes(args[0])) { id = ITEMS[k].id; break; }
        }
      }
      if (id === undefined || !ITEMS[id]) { err(`找不到物品 "${args[0]}"`); return; }
      const remain = p.giveItem(id, count);
      this.refreshHotbar();
      ok(`已给予 ${ITEMS[id].name} × ${count - remain}` + (remain ? " (背包已满)" : ""));
      return;
    }
    if (cmd === "tp") {
      const x = parseFloat(args[0]), y = parseFloat(args[1]), z = parseFloat(args[2]);
      if (isNaN(x) || isNaN(y) || isNaN(z)) { err("用法: /tp <x> <y> <z>"); return; }
      p.pos = { x, y, z };
      p.vel = { x: 0, y: 0, z: 0 };
      p.fallStartY = null;
      ok(`已传送到 ${x}, ${y}, ${z}`);
      return;
    }
    if (cmd === "kill") {
      p.hurtCooldown = 0;
      p.deathCauseText = "你自杀了";
      p.hurt(1000, null);
      return;
    }
    if (cmd === "heal") {
      p.hp = MAX_HEALTH; p.hunger = MAX_HUNGER; p.saturation = 5;
      this._hud.hp = -1; this.updateHud();
      ok("已治疗");
      return;
    }
    if (cmd === "seed") {
      ok("种子: " + G.seedStr);
      return;
    }
    if (cmd === "clear") {
      p.inventory.clear();
      this.refreshHotbar();
      ok("已清空背包");
      return;
    }
    if (cmd === "spawn") {
      p.spawnPoint = { ...p.pos };
      ok("已将重生点设置为当前位置");
      return;
    }
    err(`未知命令: /${cmd} (输入 /help 查看帮助)`);
  }

  // ==================== 菜单绑定 ====================
  bindMenus() {
    const $ = this.$;
    // 标题
    $("btn-play").addEventListener("click", () => { Sound.init(); Sound.click(); this.showWorldScreen(); });
    $("btn-about").addEventListener("click", () => { Sound.init(); Sound.click(); this.showScreen("about-screen"); });
    $("btn-about-back").addEventListener("click", () => { Sound.click(); this.showTitle(); });
    $("btn-settings-title").addEventListener("click", () => { Sound.init(); Sound.click(); this.openSettings("title"); });
    $("btn-world-back").addEventListener("click", () => { Sound.click(); this.showTitle(); });

    // 创建世界
    for (const btn of document.querySelectorAll("#new-world-form .seg-btn")) {
      btn.addEventListener("click", () => {
        for (const b of document.querySelectorAll("#new-world-form .seg-btn")) b.classList.remove("active");
        btn.classList.add("active");
        Sound.click();
      });
    }
    $("btn-create-world").addEventListener("click", () => {
      Sound.click();
      const name = $("world-name").value.trim() || "新的世界";
      let seedStr = $("world-seed").value.trim();
      if (!seedStr) seedStr = String((Math.random() * 1e9) | 0);
      const modeEl = document.querySelector("#new-world-form .seg-btn.active");
      const mode = modeEl ? modeEl.dataset.mode : "survival";
      const meta = {
        id: "w" + Date.now().toString(36),
        name, seedStr, mode,
        gameTime: DAY_LENGTH * 0.02,
        isNew: true,
      };
      if (this.onStartWorld) this.onStartWorld(meta, true);
    });

    // 暂停
    $("btn-resume").addEventListener("click", () => { Sound.click(); if (this.onResume) this.onResume(); });
    $("btn-settings-pause").addEventListener("click", () => { Sound.click(); this.openSettings("pause"); });
    $("btn-quit").addEventListener("click", () => { Sound.click(); if (this.onQuitToTitle) this.onQuitToTitle(); });

    // 死亡
    $("btn-respawn").addEventListener("click", () => { Sound.click(); if (this.onRespawn) this.onRespawn(); });
    $("btn-death-title").addEventListener("click", () => { Sound.click(); if (this.onQuitToTitle) this.onQuitToTitle(); });

    // 设置返回
    $("btn-settings-back").addEventListener("click", () => {
      Sound.click();
      G.save.saveSettings();
      if (this.settingsFrom === "pause") this.showScreen("pause-screen");
      else this.showTitle();
    });
  }

  showTitle() {
    this.hideHud();
    this.closeChat();
    this.closeScreen(true);
    this.$("splash").textContent = SPLASHES[(Math.random() * SPLASHES.length) | 0];
    this.showScreen("title-screen");
  }

  showWorldScreen() {
    this.renderWorldList();
    this.showScreen("world-screen");
  }

  renderWorldList() {
    const list = this.$("world-list");
    list.innerHTML = "";
    const worlds = G.save ? G.save.listWorlds() : [];
    if (!worlds.length) {
      const hint = document.createElement("div");
      hint.className = "empty-hint";
      hint.textContent = "还没有世界，在下方创建一个吧！";
      list.appendChild(hint);
      return;
    }
    for (const w of worlds) {
      const entry = document.createElement("div");
      entry.className = "world-entry";

      const icon = document.createElement("img");
      icon.className = "we-icon";
      icon.src = ICONS[B.GRASS] ? this._iconURL(B.GRASS) : "";
      entry.appendChild(icon);

      const info = document.createElement("div");
      info.className = "we-info";
      const nm = document.createElement("div");
      nm.className = "we-name";
      nm.textContent = w.name;
      const meta = document.createElement("div");
      meta.className = "we-meta";
      const dt = new Date(w.timestamp || 0);
      meta.textContent = `${w.mode === "creative" ? "创造" : "生存"} · 种子 ${w.seedStr} · ${dt.toLocaleDateString()} ${dt.toLocaleTimeString().slice(0, 5)}`;
      info.appendChild(nm); info.appendChild(meta);
      entry.appendChild(info);

      const actions = document.createElement("div");
      actions.className = "we-actions";
      const playBtn = document.createElement("button");
      playBtn.className = "mc-btn primary";
      playBtn.textContent = "进入世界";
      playBtn.addEventListener("click", () => {
        Sound.click();
        if (this.onStartWorld) this.onStartWorld(w, false);
      });
      actions.appendChild(playBtn);

      const delBtn = document.createElement("button");
      delBtn.className = "mc-btn danger";
      delBtn.textContent = "删除";
      let armed = false, armTimer = 0;
      delBtn.addEventListener("click", () => {
        Sound.click();
        if (!armed) {
          armed = true;
          delBtn.textContent = "确认删除?";
          armTimer = setTimeout(() => { armed = false; delBtn.textContent = "删除"; }, 2600);
        } else {
          clearTimeout(armTimer);
          G.save.deleteWorld(w.id);
          this.renderWorldList();
        }
      });
      actions.appendChild(delBtn);
      entry.appendChild(actions);
      list.appendChild(entry);
    }
  }

  _iconURL(id) {
    if (!this._iconCache) this._iconCache = {};
    if (!this._iconCache[id]) this._iconCache[id] = iconCanvasFor(id).toDataURL();
    return this._iconCache[id];
  }

  // ==================== 设置 ====================
  bindSettings() {
    const $ = this.$;
    const rd = $("opt-renderdist"), fov = $("opt-fov"), vol = $("opt-volume");

    const refresh = () => {
      $("rd-val").textContent = G.settings.renderDistance;
      $("fov-val").textContent = G.settings.fov;
      $("vol-val").textContent = G.settings.volume;
      rd.value = G.settings.renderDistance;
      fov.value = G.settings.fov;
      vol.value = G.settings.volume;
      for (const b of document.querySelectorAll("#opt-music .seg-btn"))
        b.classList.toggle("active", b.dataset.v === G.settings.music);
      for (const b of document.querySelectorAll("#opt-bob .seg-btn"))
        b.classList.toggle("active", b.dataset.v === G.settings.bobbing);
    };

    rd.addEventListener("input", () => {
      G.settings.renderDistance = parseInt(rd.value);
      $("rd-val").textContent = rd.value;
    });
    fov.addEventListener("input", () => {
      G.settings.fov = parseInt(fov.value);
      $("fov-val").textContent = fov.value;
      if (G.camera) { G.camera.fov = G.settings.fov; G.camera.updateProjectionMatrix(); }
    });
    vol.addEventListener("input", () => {
      G.settings.volume = parseInt(vol.value);
      $("vol-val").textContent = vol.value;
      Sound.setVolume(G.settings.volume);
    });
    for (const b of document.querySelectorAll("#opt-music .seg-btn")) {
      b.addEventListener("click", () => {
        G.settings.music = b.dataset.v;
        Sound.setMusic(G.settings.music === "on");
        refresh();
        Sound.click();
      });
    }
    for (const b of document.querySelectorAll("#opt-bob .seg-btn")) {
      b.addEventListener("click", () => {
        G.settings.bobbing = b.dataset.v;
        refresh();
        Sound.click();
      });
    }
    this._refreshSettings = refresh;
  }

  openSettings(from) {
    this.settingsFrom = from;
    if (this._refreshSettings) this._refreshSettings();
    this.showScreen("settings-screen");
  }

  // ==================== 加载 / 暂停 / 调试 ====================
  showLoading(title) {
    this.$("loading-title").textContent = title || "正在加载…";
    this.$("progress-bar").style.width = "0%";
    this.showScreen("loading-screen");
  }

  setLoadingProgress(p, tip) {
    this.$("progress-bar").style.width = `${Math.round(clamp(p, 0, 1) * 100)}%`;
    if (tip) this.$("loading-tip").textContent = tip;
  }

  showPause() { this.showScreen("pause-screen"); }

  setDebugVisible(on) {
    this.$("debug-screen").classList.toggle("hidden", !on);
  }

  isDebugVisible() {
    return !this.$("debug-screen").classList.contains("hidden");
  }

  updateDebug(text) {
    this.$("debug-screen").textContent = text;
  }
}
