/* ============================================================
 * VoxelCraft — 世界生成器
 * 大陆噪声 + 山脊噪声 + 洞穴雕刻 + 矿脉 + 植被
 * ============================================================ */
"use strict";

const BIOME = { OCEAN: 0, BEACH: 1, PLAINS: 2, FOREST: 3, DESERT: 4, TAIGA: 5, MOUNTAIN: 6 };
const BIOME_NAMES = ["海洋", "沙滩", "平原", "森林", "沙漠", "针叶林", "山地"];

class WorldGen {
  constructor(seed) {
    this.seed = seed >>> 0;
    this.nContinent = new SimplexNoise(mulberry32(this.seed ^ 0xA53A9D));
    this.nRidge = new SimplexNoise(mulberry32(this.seed ^ 0x1B56C4));
    this.nDetail = new SimplexNoise(mulberry32(this.seed ^ 0x66DC3E));
    this.nTemp = new SimplexNoise(mulberry32(this.seed ^ 0x2F8E01));
    this.nHumid = new SimplexNoise(mulberry32(this.seed ^ 0x74F3A2));
    this.nCave1 = new SimplexNoise(mulberry32(this.seed ^ 0x9C21B7));
    this.nCave2 = new SimplexNoise(mulberry32(this.seed ^ 0x3E77C1));
    this.nCheese = new SimplexNoise(mulberry32(this.seed ^ 0x5D1F88));
  }

  heightAt(x, z) {
    const cont = fbm2(this.nContinent, x * 0.0011, z * 0.0011, 4);
    const ridge = 1 - Math.abs(fbm2(this.nRidge, x * 0.0042, z * 0.0042, 4));
    const detail = fbm2(this.nDetail, x * 0.02, z * 0.02, 3);
    // 山地掩码: 大陆值偏高处形成山脉
    const mMask = smoothstep(0.18, 0.55, cont);
    let h = SEA_LEVEL + 2 + cont * 24;
    h += mMask * mMask * ridge * 44;
    h += detail * 4;
    return clamp(Math.floor(h), 4, WORLD_HEIGHT - 12);
  }

  biomeAt(x, z, h) {
    if (h === undefined) h = this.heightAt(x, z);
    const temp = fbm2(this.nTemp, x * 0.0016, z * 0.0016, 3);
    const humid = fbm2(this.nHumid, x * 0.0016, z * 0.0016, 3);
    if (h < SEA_LEVEL - 2) return BIOME.OCEAN;
    if (h <= SEA_LEVEL + 1) return BIOME.BEACH;
    if (h > 64) return BIOME.MOUNTAIN;
    if (temp > 0.38 && humid < -0.05) return BIOME.DESERT;
    if (temp < -0.38) return BIOME.TAIGA;
    if (humid > 0.16) return BIOME.FOREST;
    return BIOME.PLAINS;
  }

  // 是否被洞穴穿透
  isCave(x, y, z) {
    const n1 = this.nCave1.noise3D(x * 0.024, y * 0.05, z * 0.024);
    const n2 = this.nCave2.noise3D(x * 0.024, y * 0.05, z * 0.024);
    if (n1 * n1 + n2 * n2 < 0.0075) return true;   // 蚯蚓型隧道
    if (y < 34 && this.nCheese.noise3D(x * 0.02, y * 0.032, z * 0.02) > 0.7) return true; // 奶酪型空洞
    return false;
  }

  // 填充一个区块 (data: Uint8Array, 索引 = (lx*16+lz)*H + y)
  generateChunk(cx, cz, data) {
    const H = WORLD_HEIGHT;
    const bedrockRand = mulberry32(this.seed ^ (cx * 341873128) ^ (cz * 132897987));

    for (let lx = 0; lx < 16; lx++) {
      for (let lz = 0; lz < 16; lz++) {
        const wx = cx * 16 + lx, wz = cz * 16 + lz;
        const h = this.heightAt(wx, wz);
        const biome = this.biomeAt(wx, wz, h);
        const base = (lx * 16 + lz) * H;

        for (let y = 0; y <= h; y++) {
          let id = B.STONE;
          if (y === 0 || (y < 4 && bedrockRand() < 0.55 - y * 0.12)) id = B.BEDROCK;
          else if (y > h - 4) {
            // 表层
            switch (biome) {
              case BIOME.OCEAN: id = (hash3(this.seed, wx, y, wz) < 0.3) ? B.GRAVEL : B.SAND; break;
              case BIOME.BEACH: id = B.SAND; break;
              case BIOME.DESERT: id = y === h ? B.SAND : (y > h - 3 ? B.SAND : B.SANDSTONE); break;
              case BIOME.TAIGA: id = y === h ? B.SNOWY_GRASS : B.DIRT; break;
              case BIOME.MOUNTAIN:
                if (h > 74) id = B.SNOW_BLOCK;
                else if (y === h && hash3(this.seed, wx, y, wz) < 0.35) id = B.SNOWY_GRASS;
                else id = B.STONE;
                break;
              default: id = y === h ? B.GRASS : B.DIRT;
            }
          }

          // 洞穴雕刻 (保护海底与基岩)
          if (id !== B.BEDROCK && y > 2 && y < h - 2) {
            if (h <= SEA_LEVEL + 2 && y > h - 8) {
              // 浅水下不挖洞, 防止漏水
            } else if (this.isCave(wx, y, wz)) {
              id = B.AIR;
            }
          }
          data[base + y] = id;
        }

        // 水填充
        if (h < SEA_LEVEL) {
          for (let y = h + 1; y <= SEA_LEVEL; y++) {
            data[base + y] = (biome === BIOME.TAIGA && y === SEA_LEVEL) ? B.ICE : B.WATER;
          }
        }
      }
    }

    this.generateOres(cx, cz, data);
    this.generateDecorations(cx, cz, data);
  }

  // 矿脉
  generateOres(cx, cz, data) {
    const H = WORLD_HEIGHT;
    const rng = mulberry32(this.seed ^ (cx * 0x9E3779B1) ^ (cz * 0x85EBCA77) ^ 0x51AF);
    const veins = [
      { id: B.COAL_ORE, tries: 16, minY: 6, maxY: 58, size: [4, 9] },
      { id: B.IRON_ORE, tries: 12, minY: 4, maxY: 46, size: [3, 7] },
      { id: B.GRAVEL, tries: 5, minY: 8, maxY: 50, size: [6, 14] },
      { id: B.DIRT, tries: 6, minY: 8, maxY: 55, size: [6, 14] },
      { id: B.GOLD_ORE, tries: 5, minY: 4, maxY: 28, size: [3, 6] },
      { id: B.DIAMOND_ORE, tries: 6, minY: 4, maxY: 14, size: [3, 6] },
    ];
    const get = (lx, y, lz) => data[((lx & 15) * 16 + (lz & 15)) * H + y];
    const set = (lx, y, lz, id) => {
      if (lx < 0 || lx > 15 || lz < 0 || lz > 15 || y < 0 || y >= H) return;
      const i = (lx * 16 + lz) * H + y;
      if (data[i] === B.STONE) data[i] = id;
    };
    for (const v of veins) {
      for (let t = 0; t < v.tries; t++) {
        let x = (rng() * 16) | 0, z = (rng() * 16) | 0;
        let y = v.minY + ((rng() * (v.maxY - v.minY)) | 0);
        const size = v.size[0] + ((rng() * (v.size[1] - v.size[0] + 1)) | 0);
        for (let i = 0; i < size; i++) {
          set(x, y, z, v.id);
          x += (rng() * 3 - 1) | 0; y += (rng() * 3 - 1) | 0; z += (rng() * 3 - 1) | 0;
          x = clamp(x, 0, 15); z = clamp(z, 0, 15); y = clamp(y, 1, H - 2);
        }
      }
    }
  }

  // 植被与结构 (含跨区块树冠, 通过确定性哈希保证一致)
  generateDecorations(cx, cz, data) {
    const H = WORLD_HEIGHT;
    const setLocal = (lx, y, lz, id, replaceOnly) => {
      if (lx < 0 || lx > 15 || lz < 0 || lz > 15 || y < 1 || y >= H) return;
      const i = (lx * 16 + lz) * H + y;
      if (replaceOnly && data[i] !== B.AIR) return;
      if (!replaceOnly && data[i] !== B.AIR && data[i] !== B.TALL_GRASS) return;
      data[i] = id;
    };

    for (let lx = -3; lx <= 18; lx++) {
      for (let lz = -3; lz <= 18; lz++) {
        const wx = cx * 16 + lx, wz = cz * 16 + lz;
        const h = this.heightAt(wx, wz);
        if (h < SEA_LEVEL) continue;
        const biome = this.biomeAt(wx, wz, h);
        const r = hash2(this.seed, wx, wz);

        switch (biome) {
          case BIOME.FOREST: {
            if (r < 0.014) this.placeTree(setLocal, lx, h + 1, lz, "oak", wx, wz);
            else if (r < 0.022) this.placeTree(setLocal, lx, h + 1, lz, "birch", wx, wz);
            else if (r < 0.10) setLocal(lx, h + 1, lz, B.TALL_GRASS, true);
            else if (r < 0.115) setLocal(lx, h + 1, lz, r < 0.108 ? B.POPPY : B.DANDELION, true);
            break;
          }
          case BIOME.PLAINS: {
            if (r < 0.0022) this.placeTree(setLocal, lx, h + 1, lz, "oak", wx, wz);
            else if (r < 0.09) setLocal(lx, h + 1, lz, B.TALL_GRASS, true);
            else if (r < 0.102) setLocal(lx, h + 1, lz, r < 0.096 ? B.POPPY : B.DANDELION, true);
            break;
          }
          case BIOME.TAIGA: {
            if (r < 0.02) this.placeTree(setLocal, lx, h + 1, lz, "spruce", wx, wz);
            else if (r < 0.05) setLocal(lx, h + 1, lz, B.TALL_GRASS, true);
            break;
          }
          case BIOME.DESERT: {
            if (r < 0.006) {
              const ch = 1 + (hash2(this.seed ^ 7, wx, wz) * 3 | 0);
              for (let i = 0; i < ch; i++) setLocal(lx, h + 1 + i, lz, B.CACTUS, false);
            } else if (r < 0.016) setLocal(lx, h + 1, lz, B.DEAD_BUSH, true);
            break;
          }
          case BIOME.MOUNTAIN: {
            if (r < 0.002 && h < 68) this.placeTree(setLocal, lx, h + 1, lz, "spruce", wx, wz);
            break;
          }
        }
      }
    }
  }

  placeTree(setLocal, lx, groundY, lz, type, wx, wz) {
    const H = WORLD_HEIGHT;
    if (type === "spruce") {
      const th = 6 + (hash2(this.seed ^ 11, wx, wz) * 4 | 0);
      if (groundY + th + 3 >= H) return;
      for (let i = 0; i < th; i++) setLocal(lx, groundY + i, lz, B.SPRUCE_LOG, false);
      // 锥形树冠
      let radius = 2;
      for (let y = groundY + 2; y < groundY + th + 2; y++) {
        const prog = (y - groundY - 2) / th;
        const rr = Math.max(0, Math.round(2.6 - prog * 2.6));
        for (let dx = -rr; dx <= rr; dx++)
          for (let dz = -rr; dz <= rr; dz++) {
            if (dx === 0 && dz === 0 && y < groundY + th) continue;
            if (Math.abs(dx) === rr && Math.abs(dz) === rr && rr > 1) continue;
            setLocal(lx + dx, y, lz + dz, B.SPRUCE_LEAVES, true);
          }
      }
      setLocal(lx, groundY + th + 2, lz, B.SPRUCE_LEAVES, true);
      return;
    }
    // oak / birch
    const isBirch = type === "birch";
    const logId = isBirch ? B.BIRCH_LOG : B.OAK_LOG;
    const leafId = isBirch ? B.BIRCH_LEAVES : B.OAK_LEAVES;
    const th = (isBirch ? 5 : 4) + (hash2(this.seed ^ 13, wx, wz) * 3 | 0);
    if (groundY + th + 2 >= H) return;
    for (let i = 0; i < th; i++) setLocal(lx, groundY + i, lz, logId, false);
    const topY = groundY + th - 1;
    for (let dy = -2; dy <= 1; dy++) {
      const rr = dy <= -1 ? 2 : (dy === 0 ? 2 : 1);
      for (let dx = -rr; dx <= rr; dx++)
        for (let dz = -rr; dz <= rr; dz++) {
          if (dx === 0 && dz === 0 && dy <= 0) continue;
          if (Math.abs(dx) === rr && Math.abs(dz) === rr) {
            if (hash2(this.seed ^ (dx * 31 + dz * 17), wx + dx, wz + dz) < 0.5) continue;
          }
          setLocal(lx + dx, topY + dy, lz + dz, leafId, true);
        }
    }
    setLocal(lx, topY + 2, lz, leafId, true);
    setLocal(lx + 1, topY + 1, lz, leafId, true);
    setLocal(lx - 1, topY + 1, lz, leafId, true);
  }
}
