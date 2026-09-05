/* ============================================================
 * VoxelCraft — 世界与区块网格构建
 * 面剔除 + 顶点环境光遮蔽(AO) + 不透明/镂空/半透明三材质组
 * ============================================================ */
"use strict";

// 六个面的几何模板 (顶点相对方块原点, uv 0/1)
const FACES = [
  { name: "west", dir: [-1, 0, 0], shade: 0.6, corners: [
    { pos: [0, 1, 0], uv: [0, 1] }, { pos: [0, 0, 0], uv: [0, 0] },
    { pos: [0, 1, 1], uv: [1, 1] }, { pos: [0, 0, 1], uv: [1, 0] } ] },
  { name: "east", dir: [1, 0, 0], shade: 0.6, corners: [
    { pos: [1, 1, 1], uv: [0, 1] }, { pos: [1, 0, 1], uv: [0, 0] },
    { pos: [1, 1, 0], uv: [1, 1] }, { pos: [1, 0, 0], uv: [1, 0] } ] },
  { name: "bottom", dir: [0, -1, 0], shade: 0.5, corners: [
    { pos: [1, 0, 1], uv: [1, 0] }, { pos: [0, 0, 1], uv: [0, 0] },
    { pos: [1, 0, 0], uv: [1, 1] }, { pos: [0, 0, 0], uv: [0, 1] } ] },
  { name: "top", dir: [0, 1, 0], shade: 1.0, corners: [
    { pos: [0, 1, 1], uv: [1, 1] }, { pos: [1, 1, 1], uv: [0, 1] },
    { pos: [0, 1, 0], uv: [1, 0] }, { pos: [1, 1, 0], uv: [0, 0] } ] },
  { name: "north", dir: [0, 0, -1], shade: 0.8, corners: [
    { pos: [1, 0, 0], uv: [0, 0] }, { pos: [0, 0, 0], uv: [1, 0] },
    { pos: [1, 1, 0], uv: [0, 1] }, { pos: [0, 1, 0], uv: [1, 1] } ] },
  { name: "south", dir: [0, 0, 1], shade: 0.8, corners: [
    { pos: [0, 0, 1], uv: [0, 0] }, { pos: [1, 0, 1], uv: [1, 0] },
    { pos: [0, 1, 1], uv: [0, 1] }, { pos: [1, 1, 1], uv: [1, 1] } ] },
];

const AO_LEVELS = [0.42, 0.62, 0.8, 1.0];

class Chunk {
  constructor(cx, cz) {
    this.cx = cx; this.cz = cz;
    this.data = new Uint8Array(16 * 16 * WORLD_HEIGHT);
    this.hasData = false;
    this.dirty = false;
    this.meshes = [];
  }
  get(lx, y, lz) {
    if (y < 0 || y >= WORLD_HEIGHT) return B.AIR;
    return this.data[(lx * 16 + lz) * WORLD_HEIGHT + y];
  }
  set(lx, y, lz, id) {
    if (y < 0 || y >= WORLD_HEIGHT) return;
    this.data[(lx * 16 + lz) * WORLD_HEIGHT + y] = id;
  }
}

class World {
  constructor(seed, scene) {
    this.seed = seed;
    this.scene = scene;
    this.gen = new WorldGen(seed);
    this.chunks = new Map();
    this.edits = new Map();         // chunkKey -> Map(localIdx -> id)
    this.blockEntities = new Map(); // "x,y,z" -> {type:'furnace', input, fuel, output, burn, burnMax, cook}
    this.daylight = 1;
    this.onBlockChange = null;
  }

  key(cx, cz) { return cx + "," + cz; }
  getChunk(cx, cz) { return this.chunks.get(this.key(cx, cz)); }

  ensureChunk(cx, cz) {
    let c = this.getChunk(cx, cz);
    if (!c) { c = new Chunk(cx, cz); this.chunks.set(this.key(cx, cz), c); }
    return c;
  }

  generateChunkData(cx, cz) {
    const c = this.ensureChunk(cx, cz);
    if (c.hasData) return c;
    this.gen.generateChunk(cx, cz, c.data);
    const ed = this.edits.get(this.key(cx, cz));
    if (ed) for (const [idx, id] of ed) c.data[idx] = id;
    c.hasData = true;
    c.dirty = true;
    return c;
  }

  getBlock(wx, wy, wz) {
    if (wy < 0) return B.BEDROCK;
    if (wy >= WORLD_HEIGHT) return B.AIR;
    wx = Math.floor(wx); wy = Math.floor(wy); wz = Math.floor(wz);
    const c = this.getChunk(wx >> 4, wz >> 4);
    if (!c || !c.hasData) return B.STONE;
    return c.get(wx & 15, wy, wz & 15);
  }

  getBlockForMesh(wx, wy, wz) {
    if (wy < 0) return B.BEDROCK;
    if (wy >= WORLD_HEIGHT) return B.AIR;
    const c = this.getChunk(wx >> 4, wz >> 4);
    if (!c || !c.hasData) return -1;
    return c.get(wx & 15, wy, wz & 15);
  }

  setBlock(wx, wy, wz, id, record = true) {
    if (wy < 0 || wy >= WORLD_HEIGHT) return false;
    wx = Math.floor(wx); wy = Math.floor(wy); wz = Math.floor(wz);
    const cx = wx >> 4, cz = wz >> 4;
    const c = this.getChunk(cx, cz);
    if (!c || !c.hasData) return false;
    const lx = wx & 15, lz = wz & 15;
    const old = c.get(lx, wy, lz);
    if (old === id) return false;
    c.set(lx, wy, lz, id);
    if (record) {
      const k = this.key(cx, cz);
      let ed = this.edits.get(k);
      if (!ed) { ed = new Map(); this.edits.set(k, ed); }
      ed.set((lx * 16 + lz) * WORLD_HEIGHT + wy, id);
    }
    if (!usesBlockEntity(id)) this.blockEntities.delete(`${wx},${wy},${wz}`);
    c.dirty = true;
    if (lx === 0) this.markDirty(cx - 1, cz);
    if (lx === 15) this.markDirty(cx + 1, cz);
    if (lz === 0) this.markDirty(cx, cz - 1);
    if (lz === 15) this.markDirty(cx, cz + 1);
    if (this.onBlockChange) this.onBlockChange(wx, wy, wz, old, id);
    return true;
  }

  markDirty(cx, cz) {
    const c = this.getChunk(cx, cz);
    if (c && c.hasData) c.dirty = true;
  }

  // 立即重建指定世界坐标所在区块(交互即时反馈)
  rebuildAt(wx, wz) {
    const c = this.getChunk(Math.floor(wx) >> 4, Math.floor(wz) >> 4);
    if (c && c.hasData && this.neighborsReady(c)) this.buildChunkMesh(c);
  }

  rebuildNeighbors(wx, wz) {
    const cx = Math.floor(wx) >> 4, cz = Math.floor(wz) >> 4;
    const lx = Math.floor(wx) & 15, lz = Math.floor(wz) & 15;
    const list = [];
    if (lx === 0) list.push([cx - 1, cz]);
    if (lx === 15) list.push([cx + 1, cz]);
    if (lz === 0) list.push([cx, cz - 1]);
    if (lz === 15) list.push([cx, cz + 1]);
    for (const [a, b] of list) {
      const c = this.getChunk(a, b);
      if (c && c.hasData && this.neighborsReady(c)) this.buildChunkMesh(c);
    }
  }

  getSurfaceY(wx, wz) {
    for (let y = WORLD_HEIGHT - 1; y > 0; y--) {
      const b = this.getBlock(wx, y, wz);
      if (b !== B.AIR && !BLOCKS[b].plant && b !== B.WATER && b !== B.ICE) return y;
    }
    return 1;
  }

  // ==================== 区块更新循环 ====================
  update(px, pz, budgetGen = 2, budgetMesh = 3) {
    const pcx = Math.floor(px) >> 4, pcz = Math.floor(pz) >> 4;
    const R = G.settings.renderDistance;

    let generated = 0;
    for (let r = 0; r <= R + 1 && generated < budgetGen; r++) {
      for (let dx = -r; dx <= r && generated < budgetGen; dx++) {
        for (let dz = -r; dz <= r && generated < budgetGen; dz++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const c = this.getChunk(pcx + dx, pcz + dz);
          if (!c || !c.hasData) { this.generateChunkData(pcx + dx, pcz + dz); generated++; }
        }
      }
    }

    let meshed = 0;
    for (let r = 0; r <= R && meshed < budgetMesh; r++) {
      for (let dx = -r; dx <= r && meshed < budgetMesh; dx++) {
        for (let dz = -r; dz <= r && meshed < budgetMesh; dz++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const c = this.getChunk(pcx + dx, pcz + dz);
          if (!c || !c.hasData) continue;
          if ((c.dirty || !c.meshes.length) && this.neighborsReady(c)) {
            this.buildChunkMesh(c); meshed++;
          }
        }
      }
    }

    for (const [k, c] of this.chunks) {
      const d = Math.max(Math.abs(c.cx - pcx), Math.abs(c.cz - pcz));
      if (d > R + 1 && c.meshes.length) this.disposeChunkMesh(c);
      if (d > R + 6 && this.chunks.size > 420) { this.disposeChunkMesh(c); this.chunks.delete(k); }
    }
  }

  neighborsReady(c) {
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = this.getChunk(c.cx + dx, c.cz + dz);
      if (!n || !n.hasData) return false;
    }
    return true;
  }

  countReadyMeshes(px, pz) {
    const R = G.settings.renderDistance;
    const pcx = Math.floor(px) >> 4, pcz = Math.floor(pz) >> 4;
    let ready = 0, total = 0;
    for (let dx = -R; dx <= R; dx++) for (let dz = -R; dz <= R; dz++) {
      total++;
      const c = this.getChunk(pcx + dx, pcz + dz);
      if (c && c.meshes.length && !c.dirty) ready++;
    }
    return { ready, total };
  }

  disposeChunkMesh(c) {
    for (const m of c.meshes) { this.scene.remove(m); m.geometry.dispose(); }
    c.meshes = [];
  }

  setDaylight(v) {
    this.daylight = v;
    matOpaque.color.setScalar(v);
    matCutout.color.setScalar(v);
    matTranslucent.color.setScalar(v);
  }

  // ==================== 网格构建 ====================
  buildChunkMesh(c) {
    this.disposeChunkMesh(c);
    const H = WORLD_HEIGHT;
    const ox = c.cx * 16, oz = c.cz * 16;

    const mkBuf = () => ({ p: [], u: [], c: [], i: [], n: 0 });
    const buf = { opaque: mkBuf(), cutout: mkBuf(), trans: mkBuf() };

    const getB = (x, y, z) => {
      const id = this.getBlockForMesh(ox + x, y, oz + z);
      return id === -1 ? B.STONE : id;
    };

    for (let lx = 0; lx < 16; lx++) {
      for (let lz = 0; lz < 16; lz++) {
        for (let y = 0; y < H; y++) {
          const id = c.get(lx, y, lz);
          if (id === B.AIR) continue;
          const block = BLOCKS[id];
          if (!block) continue;               // 未知ID防御

          if (block.plant) { this.emitCross(buf.cutout, lx, y, lz, block, ox, oz); continue; }

          // 特殊渲染方块(箱子/床/门)
          if (block.renderType) { this.emitSpecial(buf, lx, y, lz, block, ox, oz); continue; }

          const isTrans = block.translucent;      // 水/冰
          const isCut = !block.opaque && !isTrans; // 树叶/玻璃

          // 朝向贴图(熔炉/工作台正面朝向玩家放置方向)
          let frontFace = null;
          if (block.tex.front) {
            const be = this.blockEntities.get(`${ox + lx},${y},${oz + lz}`);
            const facing = (be && be.facing !== undefined) ? be.facing : 2;
            frontFace = ["north", "east", "south", "west"][facing];
          }

          for (const f of FACES) {
            const nid = getB(lx + f.dir[0], y + f.dir[1], lz + f.dir[2]);
            if (nid === id) continue;             // 同类相邻剔除
            const nb = BLOCKS[nid];
            if (nb && nb.opaque) continue;              // 被不透明块遮挡
            if (!block.opaque && nb && nb.translucent && !isTrans) continue; // 不透明块不朝水画面(水自身会画)
            if (isTrans && nb && nb.plant) { /* 水面贴植物仍显示 */ }

            const target = isTrans ? buf.trans : (isCut ? buf.cutout : buf.opaque);
            const tileName = (frontFace && f.name === frontFace) ? block.tex.front : faceTile(block, f.name);
            this.emitFace(target, f, lx, y, lz, tileName, isTrans && f.dir[1] === 1, ox, oz);
          }
        }
      }
    }

    const makeMesh = (b, material, renderOrder) => {
      if (!b.i.length) return;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(b.p, 3));
      geo.setAttribute("uv", new THREE.Float32BufferAttribute(b.u, 2));
      geo.setAttribute("color", new THREE.Float32BufferAttribute(b.c, 3));
      geo.setIndex(b.i);
      const mesh = new THREE.Mesh(geo, material);
      mesh.position.set(ox, 0, oz);
      mesh.renderOrder = renderOrder;
      this.scene.add(mesh);
      c.meshes.push(mesh);
    };
    makeMesh(buf.opaque, matOpaque, 0);
    makeMesh(buf.cutout, matCutout, 1);
    makeMesh(buf.trans, matTranslucent, 2);
    c.dirty = false;
  }

  emitFace(buf, f, x, y, z, tileName, lowerTop, ox, oz) {
    const uv = tileUV(TILE[tileName]);
    const base = buf.n;
    const drop = lowerTop ? 0.12 : 0;
    const aoes = [];
    for (const corner of f.corners) {
      buf.p.push(x + corner.pos[0], y + corner.pos[1] - (corner.pos[1] === 1 ? drop : 0), z + corner.pos[2]);
      buf.u.push(corner.uv[0] ? uv.u1 : uv.u0, corner.uv[1] ? uv.v1 : uv.v0);
      const ao = this.vertexAO(f, x, y, z, corner, ox, oz);
      aoes.push(ao);
      const l = f.shade * AO_LEVELS[ao];
      buf.c.push(l, l, l);
    }
    const a = base, b = base + 1, c = base + 2, d = base + 3;
    if (aoes[0] + aoes[3] > aoes[1] + aoes[2]) {
      // 对角线 0-3 (绕序: 逆时针为正面)
      buf.i.push(a, b, d, a, d, c);
    } else {
      // 对角线 1-2 (保持正面朝外, 修复背面剔除导致地形不可见)
      buf.i.push(a, b, c, c, b, d);
    }
    buf.n += 4;
  }

  vertexAO(f, x, y, z, corner, ox, oz) {
    let ta, tb;
    if (f.dir[0] !== 0) { ta = 1; tb = 2; }
    else if (f.dir[1] !== 0) { ta = 0; tb = 2; }
    else { ta = 0; tb = 1; }
    const sa = corner.pos[ta] === 0 ? -1 : 1;
    const sb = corner.pos[tb] === 0 ? -1 : 1;
    const bp = [ox + x + f.dir[0], y + f.dir[1], oz + z + f.dir[2]];
    const p1 = [bp[0], bp[1], bp[2]]; p1[ta] += sa;
    const p2 = [bp[0], bp[1], bp[2]]; p2[tb] += sb;
    const pc = [bp[0], bp[1], bp[2]]; pc[ta] += sa; pc[tb] += sb;
    const s1 = isOpaque(this.getBlockForMesh(p1[0], p1[1], p1[2])) ? 1 : 0;
    const s2 = isOpaque(this.getBlockForMesh(p2[0], p2[1], p2[2])) ? 1 : 0;
    const cc = isOpaque(this.getBlockForMesh(pc[0], pc[1], pc[2])) ? 1 : 0;
    if (s1 && s2) return 0;
    return 3 - (s1 + s2 + cc);
  }

  emitCross(buf, x, y, z, block, ox, oz) {
    const uv = tileUV(TILE[block.tex.all]);
    const h = hash2(this.seed, ox + x, oz + z);
    const jx = (h - 0.5) * 0.35, jz = (hash2(this.seed ^ 5, ox + x, oz + z) - 0.5) * 0.35;
    const x0 = x + 0.15 + jx, x1 = x + 0.85 + jx;
    const z0 = z + 0.15 + jz, z1 = z + 0.85 + jz;
    const quads = [[[x0, z0], [x1, z1]], [[x0, z1], [x1, z0]]];
    for (const [[ax, az], [bx, bz]] of quads) {
      const base = buf.n;
      const light = 0.95;
      buf.p.push(ax, y + 1, az, ax, y, az, bx, y + 1, bz, bx, y, bz);
      buf.u.push(uv.u1, uv.v1, uv.u1, uv.v0, uv.u0, uv.v1, uv.u0, uv.v0);
      for (let i = 0; i < 4; i++) buf.c.push(light, light, light);
      buf.i.push(base, base + 1, base + 2, base + 2, base + 1, base + 3);
      buf.n += 4;
    }
  }

  // ==================== 特殊形状方块(箱子/床/门) ====================
  // 自定义包围盒单面发射: corner.pos 的 0/1 映射到 b0/b1
  emitBoxFace(buf, f, x, y, z, b0, b1, tileName) {
    const uv = tileUV(TILE[tileName]);
    const base = buf.n;
    for (const corner of f.corners) {
      buf.p.push(
        x + (corner.pos[0] === 0 ? b0[0] : b1[0]),
        y + (corner.pos[1] === 0 ? b0[1] : b1[1]),
        z + (corner.pos[2] === 0 ? b0[2] : b1[2])
      );
      buf.u.push(corner.uv[0] ? uv.u1 : uv.u0, corner.uv[1] ? uv.v1 : uv.v0);
      const l = f.shade;
      buf.c.push(l, l, l);
    }
    const a = base, b = base + 1, c = base + 2, d = base + 3;
    buf.i.push(a, b, c, c, b, d);
    buf.n += 4;
  }

  emitSpecial(buf, x, y, z, block, ox, oz) {
    const be = this.blockEntities.get(`${ox + x},${y},${oz + z}`);
    const facing = (be && be.facing !== undefined) ? be.facing : 2;   // 0北 1东 2南 3西
    const T = 3 / 16;

    if (block.renderType === "chest") {
      // 内缩 14/16 箱体
      const b0 = [1 / 16, 0, 1 / 16], b1 = [15 / 16, 14 / 16, 15 / 16];
      const frontName = ["north", "east", "south", "west"][facing];
      for (const f of FACES) {
        const tile = f.name === frontName ? "chest_front"
          : (f.name === "top" || f.name === "bottom") ? "chest_top" : "chest_side";
        this.emitBoxFace(buf.opaque, f, x, y, z, b0, b1, tile);
      }
    } else if (block.renderType === "bed") {
      // 半高床体
      const b0 = [0, 0, 0], b1 = [1, 9 / 16, 1];
      for (const f of FACES) {
        const tile = f.name === "top" ? "bed_top" : f.name === "bottom" ? "planks" : "bed_side";
        this.emitBoxFace(buf.opaque, f, x, y, z, b0, b1, tile);
      }
    } else if (block.renderType === "door") {
      // 薄门板: 关闭时贴 facing 对侧边缘, 打开时转到侧面
      let b0, b1;
      if (!block.doorOpen) {
        if (facing === 0) { b0 = [0, 0, 0]; b1 = [1, 1, T]; }
        else if (facing === 2) { b0 = [0, 0, 1 - T]; b1 = [1, 1, 1]; }
        else if (facing === 3) { b0 = [0, 0, 0]; b1 = [T, 1, 1]; }
        else { b0 = [1 - T, 0, 0]; b1 = [1, 1, 1]; }
      } else {
        if (facing === 0 || facing === 2) { b0 = [0, 0, 0]; b1 = [T, 1, 1]; }
        else { b0 = [0, 0, 0]; b1 = [1, 1, T]; }
      }
      const tile = block.doorHalf === 0 ? "door_bottom" : "door_top";
      for (const f of FACES) this.emitBoxFace(buf.opaque, f, x, y, z, b0, b1, tile);
    }
  }
}
