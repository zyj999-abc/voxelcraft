/* ============================================================
 * VoxelCraft — 存档管理 (localStorage)
 * ============================================================ */
"use strict";

class SaveManager {
  constructor() {
    this.currentId = null;
  }

  // ==================== 设置 ====================
  loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) Object.assign(G.settings, JSON.parse(raw));
    } catch (e) { console.warn("读取设置失败", e); }
  }

  saveSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(G.settings));
    } catch (e) { console.warn("保存设置失败", e); }
  }

  // ==================== 世界列表 ====================
  listWorlds() {
    const out = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key.startsWith(SAVE_KEY_PREFIX)) continue;
        try {
          const data = JSON.parse(localStorage.getItem(key));
          if (data && data.id) {
            out.push({
              id: data.id,
              name: data.name,
              seedStr: data.seedStr,
              mode: data.mode,
              gameTime: data.gameTime || 0,
              timestamp: data.timestamp || 0,
            });
          }
        } catch (e) { /* 跳过损坏数据 */ }
      }
    } catch (e) { /* localStorage 不可用 */ }
    out.sort((a, b) => b.timestamp - a.timestamp);
    return out;
  }

  loadWorldData(id) {
    try {
      const raw = localStorage.getItem(SAVE_KEY_PREFIX + id);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      console.warn("读取世界失败", e);
      return null;
    }
  }

  deleteWorld(id) {
    try {
      localStorage.removeItem(SAVE_KEY_PREFIX + id);
    } catch (e) { /* ignore */ }
  }

  // ==================== 保存当前游戏 ====================
  saveGame() {
    if (!G.world || !G.player || !G.worldMeta) return false;
    const edits = {};
    for (const [k, m] of G.world.edits) {
      edits[k] = Array.from(m.entries());
    }
    const blockEntities = {};
    for (const [k, f] of G.world.blockEntities) blockEntities[k] = f;

    const data = {
      version: 1,
      id: G.worldMeta.id,
      name: G.worldMeta.name,
      seedStr: G.seedStr,
      mode: G.mode,
      gameTime: Math.floor(G.gameTime),
      timestamp: Date.now(),
      player: {
        pos: { ...G.player.pos },
        yaw: G.player.yaw,
        pitch: G.player.pitch,
        hp: G.player.hp,
        hunger: G.player.hunger,
        saturation: G.player.saturation,
        spawnPoint: G.player.spawnPoint ? { ...G.player.spawnPoint } : null,
        flying: G.player.flying,
        air: G.player.air === undefined ? 10 : G.player.air,
        inventory: G.player.inventory.serialize(),
        selected: G.player.inventory.selected,
      },
      edits,
      blockEntities,
    };

    try {
      localStorage.setItem(SAVE_KEY_PREFIX + data.id, JSON.stringify(data));
      this.currentId = data.id;
      return true;
    } catch (e) {
      console.warn("保存失败(可能超出存储上限)", e);
      if (G.ui) G.ui.toast("保存失败: 存储空间不足");
      return false;
    }
  }
}
