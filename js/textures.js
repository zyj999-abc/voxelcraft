/* ============================================================
 * VoxelCraft — 程序化纹理生成
 * 所有方块材质 / 物品图标均为运行时像素级绘制(原创, 无外部资源)
 * ============================================================ */
"use strict";

const TILE_SIZE = 16;
const ATLAS_TILES = 16;               // 16x16 = 256 tiles
const ATLAS_PX = TILE_SIZE * ATLAS_TILES;

const TILE = {};                      // 名称 -> tile 序号
let atlasCanvas = null;
let atlasTexture = null;
const ICONS = {};                     // 物品id -> canvas (32x32)

// ---- 材质 ----
let matOpaque = null, matCutout = null, matTranslucent = null;

// ==================== 颜色工具 ====================
function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function shadeColor(hex, f) {
  const [r, g, b] = hexToRgb(hex);
  return `rgb(${clamp(Math.round(r * f), 0, 255)},${clamp(Math.round(g * f), 0, 255)},${clamp(Math.round(b * f), 0, 255)})`;
}

// ==================== 图集绘制 ====================
let _tileCursor = 0;
let _actx = null;

function tileUV(index) {
  const c = index % ATLAS_TILES, r = Math.floor(index / ATLAS_TILES);
  const e = 0.5 / ATLAS_PX;
  return {
    u0: c / ATLAS_TILES + e, v0: 1 - (r + 1) / ATLAS_TILES + e,
    u1: (c + 1) / ATLAS_TILES - e, v1: 1 - r / ATLAS_TILES - e,
  };
}

// 注册一个 tile, fn(set, rng) 在 16x16 像素坐标内绘制
function defTile(name, fn) {
  const index = _tileCursor++;
  TILE[name] = index;
  const c = index % ATLAS_TILES, r = Math.floor(index / ATLAS_TILES);
  const ox = c * TILE_SIZE, oy = r * TILE_SIZE;
  const rng = mulberry32(hashSeed("tile_" + name));
  const set = (x, y, color) => {
    if (x < 0 || y < 0 || x >= TILE_SIZE || y >= TILE_SIZE) return;
    _actx.fillStyle = color;
    _actx.fillRect(ox + x, oy + y, 1, 1);
  };
  fn(set, rng);
  return index;
}

// 基础噪声填充
function fillNoise(set, rng, base, vary) {
  for (let y = 0; y < TILE_SIZE; y++)
    for (let x = 0; x < TILE_SIZE; x++)
      set(x, y, shadeColor(base, 1 + (rng() - 0.5) * vary));
}

// 混合两种颜色的斑点噪声
function fillSpeckle(set, rng, base, spot, vary, chance) {
  fillNoise(set, rng, base, vary);
  for (let y = 0; y < TILE_SIZE; y++)
    for (let x = 0; x < TILE_SIZE; x++)
      if (rng() < chance) set(x, y, shadeColor(spot, 1 + (rng() - 0.5) * vary));
}

// ==================== 方块材质定义 ====================
function buildBlockTiles() {
  // --- 自然 ---
  defTile("grass_top", (s, r) => fillNoise(s, r, "#7fb238", 0.22));
  defTile("dirt", (s, r) => fillSpeckle(s, r, "#8b6547", "#79553a", 0.18, 0.5));
  defTile("grass_side", (s, r) => {
    fillSpeckle(s, r, "#8b6547", "#79553a", 0.18, 0.5);
    for (let x = 0; x < 16; x++) {
      const h = 2 + Math.floor(r() * 3);
      for (let y = 0; y < h; y++) s(x, y, shadeColor("#7fb238", 1 + (r() - 0.5) * 0.22));
    }
  });
  defTile("stone", (s, r) => {
    fillSpeckle(s, r, "#7d7d7d", "#8f8f8f", 0.12, 0.4);
    for (let i = 0; i < 5; i++) {
      let x = (r() * 16) | 0, y = (r() * 16) | 0;
      const len = 2 + (r() * 3) | 0;
      for (let j = 0; j < len; j++) { s(x, y, "#6b6b6b"); x += r() < 0.5 ? 1 : 0; y += 1; }
    }
  });
  defTile("cobblestone", (s, r) => {
    fillNoise(s, r, "#5d5d5d", 0.1);
    const stones = [[0, 0, 7, 5], [8, 0, 7, 3], [8, 4, 3, 4], [12, 4, 3, 6], [0, 6, 4, 5],
    [5, 6, 6, 4], [0, 12, 6, 3], [7, 11, 4, 5], [12, 11, 3, 4], [5, 11, 1, 3]];
    for (const [x, y, w, h] of stones) {
      const base = 1 + (r() - 0.5) * 0.35;
      for (let yy = y; yy < y + h; yy++)
        for (let xx = x; xx < x + w; xx++)
          s(xx, yy, shadeColor("#828282", base + (r() - 0.5) * 0.18));
    }
  });
  defTile("bedrock", (s, r) => fillSpeckle(s, r, "#565656", "#2b2b2b", 0.35, 0.6));
  defTile("sand", (s, r) => fillSpeckle(s, r, "#dbd3a0", "#cfc289", 0.12, 0.5));
  defTile("gravel", (s, r) => fillSpeckle(s, r, "#847d78", "#655e5a", 0.3, 0.65));
  defTile("log_side", (s, r) => {
    fillNoise(s, r, "#6b511f", 0.15);
    for (let x = 0; x < 16; x += 2 + (r() * 2) | 0) {
      const f = 0.8 + r() * 0.35;
      for (let y = 0; y < 16; y++) s(x, y, shadeColor("#5a4419", f + (r() - 0.5) * 0.2));
    }
  });
  defTile("log_top", (s, r) => {
    fillNoise(s, r, "#6b511f", 0.12);
    const cx = 7.5, cy = 7.5;
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const d = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      const ring = Math.sin(d * 2.1) > 0.25 ? "#a08050" : "#7d6231";
      s(x, y, shadeColor(ring, 1 + (r() - 0.5) * 0.15));
    }
    s(7, 7, "#5a4419"); s(8, 8, "#5a4419");
  });
  defTile("birch_log_side", (s, r) => {
    fillNoise(s, r, "#d5d0c5", 0.08);
    for (let i = 0; i < 9; i++) {
      const x = (r() * 14) | 0, y = (r() * 15) | 0, w = 2 + (r() * 3) | 0;
      for (let xx = x; xx < x + w; xx++) s(xx, y, "#2e2e28");
    }
  });
  defTile("spruce_log_side", (s, r) => {
    fillNoise(s, r, "#4a3620", 0.15);
    for (let x = 0; x < 16; x += 3) for (let y = 0; y < 16; y++) s(x, y, shadeColor("#3a2a18", 0.9 + r() * 0.3));
  });
  defTile("leaves", (s, r) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      if (r() < 0.12) { /* 透明孔 */ }
      else s(x, y, shadeColor("#3e7a1f", 0.7 + r() * 0.7));
    }
  });
  defTile("birch_leaves", (s, r) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      if (r() < 0.12) { }
      else s(x, y, shadeColor("#6ba633", 0.7 + r() * 0.7));
    }
  });
  defTile("spruce_leaves", (s, r) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      if (r() < 0.1) { }
      else s(x, y, shadeColor("#2d5a2d", 0.7 + r() * 0.7));
    }
  });
  defTile("planks", (s, r) => {
    fillNoise(s, r, "#9c7f4e", 0.1);
    for (let y = 0; y < 16; y += 4) {
      for (let x = 0; x < 16; x++) s(x, y, "#6b511f");
      const nx = (r() * 14 + 1) | 0;
      for (let yy = y + 1; yy < Math.min(y + 4, 16); yy++) s(nx, yy, "#7d6231");
    }
  });
  defTile("glass", (s, r) => {
    for (let i = 0; i < 16; i++) { s(i, 0, "#dfeff2"); s(i, 15, "#dfeff2"); s(0, i, "#dfeff2"); s(15, i, "#dfeff2"); }
    for (let i = 2; i < 7; i++) s(i, 9 - i + 2, "#ffffffcc");
    for (let i = 4; i < 10; i++) s(i, 16 - i + 1, "#ffffff88");
  });
  defTile("water", (s, r) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++)
      s(x, y, shadeColor("#3f66d4", 0.85 + r() * 0.35));
  });
  defTile("ice", (s, r) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++)
      s(x, y, shadeColor("#9fc3f5", 0.9 + r() * 0.2));
    for (let i = 0; i < 4; i++) {
      let x = (r() * 16) | 0, y = (r() * 16) | 0;
      for (let j = 0; j < 6; j++) { s(x, y, "#c8defc"); x += (r() * 3 - 1) | 0; y += (r() * 3 - 1) | 0; }
    }
  });
  defTile("snow", (s, r) => fillNoise(s, r, "#f2f5f5", 0.05));
  defTile("snowy_grass_side", (s, r) => {
    fillSpeckle(s, r, "#8b6547", "#79553a", 0.18, 0.5);
    for (let x = 0; x < 16; x++) {
      const h = 3 + Math.floor(r() * 2);
      for (let y = 0; y < h; y++) s(x, y, shadeColor("#eef2f2", 1 - r() * 0.06));
    }
  });
  defTile("cactus_side", (s, r) => {
    fillNoise(s, r, "#58822c", 0.12);
    for (let y = 0; y < 16; y++) { s(0, y, "#3f611e"); s(15, y, "#3f611e"); }
    for (let i = 0; i < 7; i++) {
      const x = 2 + ((r() * 12) | 0), y = (r() * 16) | 0;
      s(x, y, "#d7e8a0"); s(x, y + 1, "#d7e8a0");
    }
  });
  defTile("cactus_top", (s, r) => {
    fillNoise(s, r, "#6b9839", 0.12);
    for (let i = 0; i < 16; i++) { s(i, 0, "#3f611e"); s(i, 15, "#3f611e"); s(0, i, "#3f611e"); s(15, i, "#3f611e"); }
  });

  // --- 矿石 ---
  const oreTile = (name, color) => defTile(name, (s, r) => {
    fillSpeckle(s, r, "#7d7d7d", "#8f8f8f", 0.12, 0.4);
    const clusters = 3 + (r() * 2) | 0;
    for (let i = 0; i < clusters; i++) {
      const cx = 2 + (r() * 11) | 0, cy = 2 + (r() * 11) | 0;
      s(cx, cy, color); s(cx + 1, cy, shadeColor(color, 0.8));
      s(cx, cy + 1, shadeColor(color, 1.15)); s(cx + 1, cy + 1, shadeColor(color, 0.9));
      if (r() < 0.6) s(cx - 1, cy + 1, shadeColor(color, 0.85));
    }
  });
  oreTile("coal_ore", "#2c2c2c");
  oreTile("iron_ore", "#d8af93");
  oreTile("gold_ore", "#f5d93f");
  oreTile("diamond_ore", "#4aedd9");

  // --- 人造 ---
  defTile("table_top", (s, r) => {
    fillNoise(s, r, "#9c7f4e", 0.1);
    for (let i = 0; i < 16; i++) { s(i, 0, "#6b511f"); s(i, 15, "#6b511f"); s(0, i, "#6b511f"); s(15, i, "#6b511f"); }
    for (let i = 3; i < 13; i++) { s(i, 3, "#7d6231"); s(i, 12, "#7d6231"); s(3, i, "#7d6231"); s(12, i, "#7d6231"); }
    s(7, 7, "#5a4419"); s(8, 8, "#5a4419"); s(7, 8, "#7d6231"); s(8, 7, "#7d6231");
  });
  defTile("table_side", (s, r) => {
    fillNoise(s, r, "#9c7f4e", 0.1);
    for (let x = 0; x < 16; x++) s(x, 0, "#6b511f");
    for (let y = 1; y < 5; y++) { for (let x = 2; x < 7; x++) s(x, y, shadeColor("#8a6f42", 0.95 + r() * 0.1)); for (let x = 9; x < 14; x++) s(x, y, shadeColor("#8a6f42", 0.95 + r() * 0.1)); }
    for (let y = 9; y < 16; y++) { s(3, y, "#6b511f"); s(12, y, "#6b511f"); }
  });
  defTile("table_front", (s, r) => {
    fillNoise(s, r, "#9c7f4e", 0.1);
    for (let x = 0; x < 16; x++) s(x, 0, "#6b511f");
    // 像素工具图案
    for (let y = 3; y < 7; y++) for (let x = 3; x < 6; x++) s(x, y, "#c8c8c8");
    for (let y = 3; y < 9; y++) s(4, y, "#8f8f8f");
    for (let y = 4; y < 8; y++) for (let x = 9; x < 13; x++) s(x, y, y < 6 ? "#8a6f42" : "#6b511f");
  });
  defTile("sandstone", (s, r) => {
    fillNoise(s, r, "#d8cf9a", 0.08);
    for (let y = 0; y < 16; y += 5) for (let x = 0; x < 16; x++) s(x, y + (x % 3 === 0 ? 1 : 0), "#c4b980");
  });
  defTile("sandstone_top", (s, r) => fillNoise(s, r, "#d8cf9a", 0.08));
  defTile("bricks", (s, r) => {
    fillNoise(s, r, "#9a5540", 0.12);
    for (let y = 0; y < 16; y += 4) for (let x = 0; x < 16; x++) s(x, y, "#d3cfc6");
    for (let y = 0; y < 16; y += 4) {
      const off = (y / 4) % 2 === 0 ? 0 : 4;
      for (let yy = y + 1; yy < y + 4; yy++) s((off + 7) % 16, yy, "#d3cfc6");
    }
  });
  defTile("stone_bricks", (s, r) => {
    fillNoise(s, r, "#7a7a7a", 0.1);
    for (let y = 0; y < 16; y += 8) for (let x = 0; x < 16; x++) { s(x, y, "#5d5d5d"); s(x, y + 1, "#8f8f8f"); }
    for (let y = 0; y < 16; y += 8) {
      const off = (y / 8) % 2 === 0 ? 7 : 15;
      for (let yy = y + 1; yy < y + 8; yy++) s(off % 16, yy, "#5d5d5d");
    }
  });
  defTile("torch", (s, r) => {
    for (let y = 6; y < 16; y++) for (let x = 7; x < 9; x++) s(x, y, shadeColor("#8a6f42", 0.9 + r() * 0.2));
    for (let y = 3; y < 6; y++) for (let x = 6; x < 10; x++) s(x, y, y === 3 ? "#ffd83f" : "#ff9d2e");
    s(7, 2, "#fff3b0"); s(8, 2, "#fff3b0");
  });
  defTile("bookshelf", (s, r) => {
    fillNoise(s, r, "#9c7f4e", 0.1);
    for (let x = 0; x < 16; x++) { s(x, 0, "#6b511f"); s(x, 7, "#6b511f"); s(x, 8, "#6b511f"); s(x, 15, "#6b511f"); }
    const bookColors = ["#a03030", "#3a5f9f", "#3f8a3f", "#a08030", "#7a4f9f", "#c07030"];
    for (const yy of [1, 9]) {
      let x = 1;
      while (x < 15) {
        const w = 1 + (r() * 2) | 0;
        const col = bookColors[(r() * bookColors.length) | 0];
        for (let xx = x; xx < Math.min(x + w, 15); xx++)
          for (let y = yy; y < yy + 6; y++) s(xx, y, shadeColor(col, 0.85 + r() * 0.3));
        x += w + 1;
      }
    }
  });
  defTile("furnace_top", (s, r) => {
    fillSpeckle(s, r, "#7a7a7a", "#8b8b8b", 0.12, 0.4);
  });
  defTile("furnace_side", (s, r) => {
    fillSpeckle(s, r, "#7a7a7a", "#8b8b8b", 0.12, 0.4);
    for (let i = 0; i < 16; i++) { s(i, 0, "#5d5d5d"); s(i, 15, "#5d5d5d"); s(0, i, "#5d5d5d"); s(15, i, "#5d5d5d"); }
  });
  defTile("furnace_front", (s, r) => {
    fillSpeckle(s, r, "#7a7a7a", "#8b8b8b", 0.12, 0.4);
    for (let i = 0; i < 16; i++) { s(i, 0, "#5d5d5d"); s(i, 15, "#5d5d5d"); s(0, i, "#5d5d5d"); s(15, i, "#5d5d5d"); }
    for (let y = 8; y < 14; y++) for (let x = 4; x < 12; x++) s(x, y, "#1c1c1c");
    for (let x = 5; x < 11; x += 2) { s(x, 12, "#ff9d2e"); s(x, 13, "#ffd83f"); }
  });
  defTile("tnt_side", (s, r) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++)
      s(x, y, shadeColor(y < 5 || y > 10 ? "#c33b2c" : "#e8e2d5", 1 + (r() - 0.5) * 0.15));
    // "TNT" 像素字
    const T = ["############", ".....##.....", ".....##.....", ".....##....."];
    const N = ["##.......##", "###......##", "##.#.....##", "##..#....##", "##...#...##", "##........##"];
    const drawWord = (rows, ox) => rows.forEach((row, yy) => {
      for (let i = 0; i < row.length; i++) if (row[i] === "#") s(ox + i, 6 + yy, "#2c2c2c");
    });
    drawWord(T.map(w => w.replace(/#/g, "#").slice(0, 4)), 1);
    // 简化: 画三个字母区域
    for (let i = 0; i < 4; i++) { s(1 + i, 6, "#2c2c2c"); s(2 + i - 1 + 0, 7, "#2c2c2c"); }
    // T N T 逐字
    const put = (ch, ox) => {
      const glyphs = {
        T: ["####", ".##.", ".##.", ".##.", ".##."],
        N: ["#..#", "##.#", "#.##", "#..#", "#..#"],
      };
      glyphs[ch].forEach((row, yy) => { for (let i = 0; i < 4; i++) if (row[i] === "#") s(ox + i, 6 + yy, "#2c2c2c"); });
    };
    put("T", 1); put("N", 6); put("T", 11);
  });
  defTile("tnt_top", (s, r) => {
    fillNoise(s, r, "#c33b2c", 0.12);
    for (let y = 6; y < 10; y++) for (let x = 6; x < 10; x++) s(x, y, "#e8e2d5");
    for (let y = 7; y < 9; y++) for (let x = 7; x < 9; x++) s(x, y, "#3f3f3f");
  });
  defTile("tnt_bottom", (s, r) => fillNoise(s, r, "#c33b2c", 0.12));
  defTile("obsidian", (s, r) => {
    fillSpeckle(s, r, "#1a1226", "#2c2140", 0.3, 0.5);
    for (let i = 0; i < 4; i++) s((r() * 16) | 0, (r() * 16) | 0, "#4a3a6b");
  });
  defTile("pumpkin_side", (s, r) => {
    fillNoise(s, r, "#c87f1e", 0.1);
    for (let x = 0; x < 16; x += 3) for (let y = 0; y < 16; y++) s(x, y, "#a56514");
  });
  defTile("pumpkin_top", (s, r) => {
    fillNoise(s, r, "#c87f1e", 0.1);
    for (let y = 6; y < 10; y++) for (let x = 6; x < 10; x++) s(x, y, "#5f7233");
  });
  defTile("wool", (s, r) => fillSpeckle(s, r, "#e8e8e8", "#d8d8d8", 0.08, 0.6));
  defTile("mossy_cobblestone", (s, r) => {
    // 先画圆石
    const idx = TILE["cobblestone"];
    const c = idx % ATLAS_TILES, rr = Math.floor(idx / ATLAS_TILES);
    const data = _actx.getImageData(c * 16, rr * 16, 16, 16);
    const oc = TILE["mossy_cobblestone"] % ATLAS_TILES;
    // (此 tile 在 defTile 内尚未定位—改用 set 重绘近似)
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) s(x, y, "transparent");
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const d = data.data, i = (y * 16 + x) * 4;
      s(x, y, `rgba(${d[i]},${d[i + 1]},${d[i + 2]},${d[i + 3] / 255})`);
    }
    for (let i = 0; i < 26; i++) {
      const x = (r() * 16) | 0, y = (r() * 16) | 0;
      s(x, y, shadeColor("#5a7a3a", 0.8 + r() * 0.4));
    }
  });
  defTile("coal_block", (s, r) => fillSpeckle(s, r, "#232323", "#161616", 0.25, 0.55));
  defTile("iron_block", (s, r) => {
    fillNoise(s, r, "#d8d8d8", 0.05);
    for (let i = 0; i < 16; i++) { s(i, 0, "#f5f5f5"); s(0, i, "#f5f5f5"); s(i, 15, "#a8a8a8"); s(15, i, "#a8a8a8"); }
  });
  defTile("gold_block", (s, r) => {
    fillNoise(s, r, "#f0c832", 0.06);
    for (let i = 0; i < 16; i++) { s(i, 0, "#fbe88c"); s(0, i, "#fbe88c"); s(i, 15, "#c8a020"); s(15, i, "#c8a020"); }
  });
  defTile("diamond_block", (s, r) => {
    fillNoise(s, r, "#3fd8c8", 0.06);
    for (let i = 0; i < 16; i++) { s(i, 0, "#9ff8ec"); s(0, i, "#9ff8ec"); s(i, 15, "#2aa89c"); s(15, i, "#2aa89c"); }
    s(4, 4, "#c8fff8"); s(11, 6, "#c8fff8"); s(6, 11, "#c8fff8");
  });

  // --- 植物(交叉面片) ---
  defTile("tall_grass", (s, r) => {
    for (let i = 0; i < 9; i++) {
      const x0 = 1 + (r() * 14) | 0, h = 6 + (r() * 8) | 0;
      for (let y = 15; y > 15 - h; y--) {
        const xx = clamp(x0 + Math.round((15 - y) * (r() - 0.5) * 0.6), 0, 15);
        s(xx, y, shadeColor("#5a9c2e", 0.8 + r() * 0.4));
      }
    }
  });
  defTile("poppy", (s, r) => {
    for (let y = 8; y < 16; y++) s(7, y, "#3e7a1f");
    s(6, 10, "#3e7a1f"); s(8, 12, "#3e7a1f");
    const petals = [[6, 4], [7, 4], [8, 4], [5, 5], [6, 5], [7, 5], [8, 5], [9, 5], [6, 6], [7, 6], [8, 6]];
    for (const [x, y] of petals) s(x, y, shadeColor("#d43a2c", 0.9 + r() * 0.2));
    s(7, 5, "#2c2c2c");
  });
  defTile("dandelion", (s, r) => {
    for (let y = 8; y < 16; y++) s(8, y, "#3e7a1f");
    s(7, 11, "#3e7a1f");
    const petals = [[7, 4], [8, 4], [9, 4], [7, 5], [8, 5], [9, 5], [8, 6]];
    for (const [x, y] of petals) s(x, y, shadeColor("#f5d93f", 0.9 + r() * 0.2));
    s(8, 5, "#c8a020");
  });
  defTile("dead_bush", (s, r) => {
    for (let i = 0; i < 7; i++) {
      let x = 3 + (r() * 10) | 0, y = 15;
      const h = 5 + (r() * 7) | 0;
      for (let j = 0; j < h; j++) {
        s(x, y, shadeColor("#8a6534", 0.8 + r() * 0.3));
        y--; x += (r() * 3 - 1) | 0;
        x = clamp(x, 0, 15);
      }
    }
  });

  // --- 破坏裂纹 10 阶段 ---
  for (let stage = 0; stage < 10; stage++) {
    defTile("crack_" + stage, (s, r) => {
      const lines = 2 + stage * 1.6;
      for (let i = 0; i < lines; i++) {
        let x = 8 + (r() - 0.5) * 4, y = 8 + (r() - 0.5) * 4;
        const len = 3 + stage * 0.9 + r() * 3;
        let dx = r() < 0.5 ? 1 : -1, dy = r() < 0.5 ? 1 : -1;
        for (let j = 0; j < len; j++) {
          s(Math.round(x), Math.round(y), "rgba(20,16,12,0.85)");
          if (r() < 0.5) x += dx; else y += dy;
          if (r() < 0.15) { dx = -dx; }
        }
      }
    });
  }
}

// ==================== 像素画物品图标 ====================
const PALETTE = {
  "#": "MAT", "+": "MAT_L", "-": "MAT_D",
  "w": "#6b511f", "W": "#8a6f42",
  "k": "#1c1c1c", "K": "#3a3a3a",
  "g": "#5a9c2e", "r": "#d43a2c", "R": "#a02818",
  "y": "#f5d93f", "o": "#ff9d2e",
  "p": "#e89a9a", "P": "#c87070", "c": "#c85540", "C": "#8a4a30",
  "s": "#f0f0f0", "b": "#3f66d4",
};

const ART = {
  pickaxe: [
    "................",
    "....########....",
    "..##++++++++##..",
    ".#+##......##+#.",
    ".#+#........+##.",
    ".#+#.....ww..#..",
    ".##....wwWw.....",
    "......wwWw......",
    ".....wwWw.......",
    "....wwWw........",
    "...wwWw.........",
    "..wwWw..........",
    ".wwWw...........",
    ".ww.............",
    "................",
    "................",
  ],
  axe: [
    "................",
    "....######......",
    "..##++++++##....",
    "..#+#....+##....",
    "..#+#....+#.....",
    "..#+#..wwW#.....",
    "..##.wwWw.......",
    "...wwWw.........",
    "..wwWw..........",
    ".wwWw...........",
    ".ww.............",
    "................",
    "................",
    "................",
    "................",
    "................",
  ],
  shovel: [
    "................",
    ".....######.....",
    "....#++++++#....",
    "....#+####+#....",
    "....#+#..#+#....",
    "....#+#wwW##....",
    "....###wwWw.....",
    "......wwWw......",
    ".....wwWw.......",
    "....wwWw........",
    "...wwWw.........",
    "..wwWw..........",
    "..ww............",
    "................",
    "................",
    "................",
  ],
  sword: [
    "................",
    "............##..",
    "...........#++#.",
    "..........#+++#.",
    ".........#+++#..",
    "........#+++#...",
    ".......#+++#....",
    "......#+++#.....",
    ".....#+++#......",
    "..w.#+###.......",
    ".wWw#w..........",
    "wW..wW..........",
    "w..wW...........",
    "..wW............",
    ".ww.............",
    "................",
  ],
  stick: [
    "................",
    "...........wW...",
    "..........wWw...",
    ".........wWw....",
    "........wWw.....",
    ".......wWw......",
    "......wWw.......",
    ".....wWw........",
    "....wWw.........",
    "...wWw..........",
    "...ww...........",
    "................",
    "................",
    "................",
    "................",
    "................",
  ],
  coal: [
    "................",
    "................",
    "....######......",
    "..##kkkkkk#.....",
    ".#kkkKkkkkk#....",
    ".#kkkkkkKkk#....",
    "#kkKkkkkkkkk#...",
    "#kkkkkKkkkkk#...",
    "#kkKkkkkkKkk#...",
    ".#kkkkKkkkk#....",
    ".##kkkkkkk#.....",
    "...#######......",
    "................",
    "................",
    "................",
    "................",
  ],
  ingot: [
    "................",
    "................",
    "................",
    "......#######...",
    "....##++++++##..",
    "...#+++++++++##.",
    "..#+++++++++++#.",
    ".#++++++++++++#.",
    ".#++++++++++++#.",
    ".##############.",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
  ],
  diamond: [
    "................",
    "................",
    "....########....",
    "...#++++++++#...",
    "..#++##++##++#..",
    "..#+##++++##+#..",
    "..############..",
    "...#+######+#...",
    "....#+####+#....",
    ".....#+##+#.....",
    "......#+#.......",
    ".......#........",
    "................",
    "................",
    "................",
    "................",
  ],
  apple: [
    "................",
    ".......ww.......",
    "......wW........",
    "...##g.##.......",
    "..#rr##rr#......",
    ".#rrrrrrrrr#....",
    ".#rRrrrrrrr#....",
    ".#rrrrrRrrr#....",
    ".#rrrrrrrrr#....",
    "..#rrrrrrr#.....",
    "...##rrr##......",
    ".....###........",
    "................",
    "................",
    "................",
    "................",
  ],
  porkchop: [
    "................",
    "................",
    ".....######.....",
    "...##pppppp##...",
    "..#pppppppppp#..",
    "..#pPPppppPPp#..",
    ".#pPPppppppPPp#.",
    ".#pppppppppppp#.",
    ".#ppPPppppPPpp#.",
    "..#pppppppppp#..",
    "...##pppppp##...",
    ".....######.....",
    "................",
    "................",
    "................",
    "................",
  ],
};

function drawPixelArt(ctx, art, matColor, matLight, matDark, scale, ox, oy) {
  for (let y = 0; y < art.length; y++) {
    const row = art[y];
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === "." || ch === " ") continue;
      let color = PALETTE[ch];
      if (color === "MAT") color = matColor;
      else if (color === "MAT_L") color = matLight;
      else if (color === "MAT_D") color = matDark;
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(ox + x * scale, oy + y * scale, scale, scale);
    }
  }
}

// 方块等距图标 (32x32)
function makeBlockIcon(blockId) {
  const b = BLOCKS[blockId];
  const cv = document.createElement("canvas");
  cv.width = 32; cv.height = 32;
  const ctx = cv.getContext("2d");
  ctx.imageSmoothingEnabled = false;

  const tileCanvas = (name) => {
    const idx = TILE[name];
    const c = idx % ATLAS_TILES, r = Math.floor(idx / ATLAS_TILES);
    return { sx: c * 16, sy: r * 16 };
  };

  const drawFace = (texName, m, darken) => {
    const { sx, sy } = tileCanvas(texName);
    ctx.save();
    ctx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
    ctx.drawImage(atlasCanvas, sx, sy, 16, 16, 0, 0, 16, 16);
    if (darken > 0) {
      ctx.fillStyle = `rgba(0,0,0,${darken})`;
      ctx.fillRect(0, 0, 16, 16);
    }
    ctx.restore();
  };

  const top = b.tex.top || b.tex.all, side = b.tex.side || b.tex.all;
  // 顶面 (菱形), 左面, 右面
  drawFace(top, [0.75, -0.375, 0.75, 0.375, 4, 10], 0);
  drawFace(side, [0.75, 0.375, 0, 0.75, 4, 10], 0.36);
  drawFace(side, [0.75, -0.375, 0, 0.75, 16, 16], 0.18);
  return cv;
}

// 平面贴图图标 (植物/物品)
function makeFlatIcon(tileName) {
  const cv = document.createElement("canvas");
  cv.width = 32; cv.height = 32;
  const ctx = cv.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  const idx = TILE[tileName];
  const c = idx % ATLAS_TILES, r = Math.floor(idx / ATLAS_TILES);
  ctx.drawImage(atlasCanvas, c * 16, r * 16, 16, 16, 0, 0, 32, 32);
  return cv;
}

function makeArtIcon(art, matColor, matLight, matDark) {
  const cv = document.createElement("canvas");
  cv.width = 32; cv.height = 32;
  const ctx = cv.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  drawPixelArt(ctx, art, matColor, matLight, matDark, 2, 0, 0);
  return cv;
}

function buildItemIcons() {
  // 工具
  const mats = {
    WOOD: ["#9c7f4e", "#b59768", "#7d6231"],
    STONE: ["#8f8f8f", "#a8a8a8", "#6b6b6b"],
    IRON: ["#d8d8d8", "#f0f0f0", "#a8a8a8"],
    GOLD: ["#f0c832", "#fbe88c", "#c8a020"],
    DIAMOND: ["#3fd8c8", "#9ff8ec", "#2aa89c"],
  };
  const types = { PICK: "pickaxe", AXE: "axe", SHOVEL: "shovel", SWORD: "sword" };
  for (const mk of ["WOOD", "STONE", "IRON", "GOLD", "DIAMOND"]) {
    for (const tk of ["PICK", "AXE", "SHOVEL", "SWORD"]) {
      ICONS[I[mk + "_" + tk]] = makeArtIcon(ART[types[tk]], ...mats[mk]);
    }
  }
  // 材料
  ICONS[I.STICK] = makeArtIcon(ART.stick, "#8a6f42", "#a08553", "#6b511f");
  ICONS[I.COAL] = makeArtIcon(ART.coal, "#2c2c2c", "#3a3a3a", "#161616");
  ICONS[I.CHARCOAL] = makeArtIcon(ART.coal, "#3a2f28", "#4a3f38", "#241c16");
  ICONS[I.IRON_INGOT] = makeArtIcon(ART.ingot, "#d8d8d8", "#f0f0f0", "#a8a8a8");
  ICONS[I.GOLD_INGOT] = makeArtIcon(ART.ingot, "#f0c832", "#fbe88c", "#c8a020");
  ICONS[I.DIAMOND] = makeArtIcon(ART.diamond, "#3fd8c8", "#9ff8ec", "#2aa89c");
  ICONS[I.APPLE] = makeArtIcon(ART.apple, "#d43a2c", "#e85a4a", "#a02818");
  // 肉排: 生/熟 换色
  const mkMeat = (light, mid, dark) => {
    const cv = document.createElement("canvas");
    cv.width = 32; cv.height = 32;
    const ctx = cv.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    const art = ART.porkchop;
    const pal = { p: mid, P: dark, "#": light };
    for (let y = 0; y < art.length; y++) for (let x = 0; x < art[y].length; x++) {
      const ch = art[y][x];
      if (ch === "." || !pal[ch]) continue;
      ctx.fillStyle = pal[ch];
      ctx.fillRect(x * 2, y * 2, 2, 2);
    }
    return cv;
  };
  ICONS[I.PORKCHOP] = mkMeat("#e89a9a", "#d47070", "#b05050");
  ICONS[I.COOKED_PORKCHOP] = mkMeat("#c88a50", "#a86a38", "#8a5228");

  // 方块物品
  for (let id = 1; id < BLOCKS.length; id++) {
    if (!BLOCKS[id]) continue;
    const b = BLOCKS[id];
    if (b.plant) ICONS[id] = makeFlatIcon(b.tex.all);
    else ICONS[id] = makeBlockIcon(id);
  }
}

// ==================== HUD 图标 ====================
function makeHeartIcon(kind) { // full | half | empty
  const cv = document.createElement("canvas");
  cv.width = 18; cv.height = 18;
  const ctx = cv.getContext("2d");
  const shape = [
    ".XX..XX.",
    "XXXXXXXX",
    "XXXXXXXX",
    "XXXXXXXX",
    ".XXXXXX.",
    "..XXXX..",
    "...XX...",
  ];
  const draw = (fill, hl) => {
    for (let y = 0; y < shape.length; y++) for (let x = 0; x < 8; x++) {
      if (shape[y][x] !== "X") continue;
      let c = fill;
      if (y === 0 || (y === 1 && x < 2)) c = hl;
      ctx.fillStyle = c;
      ctx.fillRect(1 + x * 2, 2 + y * 2, 2, 2);
    }
  };
  if (kind === "empty") draw("#3a0c0c", "#5a1818");
  else {
    draw("#e02222", "#ff6a6a");
    if (kind === "half") {
      ctx.fillStyle = "#3a0c0c";
      ctx.fillRect(10, 0, 10, 18);
      // 重新描边
      ctx.fillStyle = "#00000066";
    }
  }
  return cv;
}

function makeHungerIcon(kind) { // full | half | empty
  const cv = document.createElement("canvas");
  cv.width = 18; cv.height = 18;
  const ctx = cv.getContext("2d");
  const shape = [
    "....XXXX",
    "...XXXXX",
    "...XXXXX",
    "..XXXXX.",
    ".XXXXX..",
    "XXXXX...",
    "XXX.X...",
    "XX......",
  ];
  for (let y = 0; y < shape.length; y++) for (let x = 0; x < 8; x++) {
    if (shape[y][x] !== "X") continue;
    let c = kind === "empty" ? "#3a2a10" : "#c8863c";
    if (kind !== "empty" && y < 2) c = "#e8b070";
    ctx.fillStyle = c;
    ctx.fillRect(1 + x * 2, 1 + y * 2, 2, 2);
  }
  if (kind === "half") {
    ctx.fillStyle = "#3a2a10";
    ctx.fillRect(10, 0, 10, 18);
  }
  return cv;
}

function makeBubbleIcon() {
  const cv = document.createElement("canvas");
  cv.width = 18; cv.height = 18;
  const ctx = cv.getContext("2d");
  for (let y = 0; y < 18; y++) for (let x = 0; x < 18; x++) {
    const d = Math.sqrt((x - 9) ** 2 + (y - 9) ** 2);
    if (d < 8) {
      ctx.fillStyle = (x < 7 && y < 7) ? "#cfe8ff" : "#5f9fff";
      ctx.fillRect(x, y, 1, 1);
    }
  }
  return cv;
}

// ==================== 主初始化 ====================
function initTextures() {
  atlasCanvas = document.createElement("canvas");
  atlasCanvas.width = ATLAS_PX; atlasCanvas.height = ATLAS_PX;
  _actx = atlasCanvas.getContext("2d", { willReadFrequently: true });

  buildBlockTiles();
  buildItemIcons();

  atlasTexture = new THREE.CanvasTexture(atlasCanvas);
  atlasTexture.magFilter = THREE.NearestFilter;
  atlasTexture.minFilter = THREE.NearestFilter;
  atlasTexture.generateMipmaps = false;

  matOpaque = new THREE.MeshBasicMaterial({ map: atlasTexture, vertexColors: true });
  matCutout = new THREE.MeshBasicMaterial({
    map: atlasTexture, vertexColors: true, alphaTest: 0.4, side: THREE.DoubleSide,
  });
  matTranslucent = new THREE.MeshBasicMaterial({
    map: atlasTexture, vertexColors: true, transparent: true, opacity: 0.72, side: THREE.DoubleSide,
  });
}

// 获取方块某面的 tile 名
function faceTile(block, face) {
  const t = block.tex;
  if (t.all) return t.all;
  if (face === "top") return t.top || t.side;
  if (face === "bottom") return t.bottom || t.side;
  if (face === "front") return t.front || t.side;
  return t.side;
}

// 供图标等使用: 获取 tile canvas
function getTileCanvas(name) {
  const idx = TILE[name];
  const c = idx % ATLAS_TILES, r = Math.floor(idx / ATLAS_TILES);
  const cv = document.createElement("canvas");
  cv.width = 16; cv.height = 16;
  cv.getContext("2d").drawImage(atlasCanvas, c * 16, r * 16, 16, 16, 0, 0, 16, 16);
  return cv;
}
