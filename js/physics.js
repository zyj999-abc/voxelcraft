/* ============================================================
 * VoxelCraft — 物理: AABB 碰撞 / DDA 体素射线 / 射线-AABB
 * ============================================================ */
"use strict";

const PHYS_EPS = 1e-4;

// 单轴移动并碰撞 (pos 为实体底面中心, w 宽 h 高)
// 返回是否发生碰撞
function moveAxis(world, ent, axis, amount) {
  if (amount === 0) return false;
  const p = ent.pos;
  p[axis] += amount;
  const hw = ent.w / 2, h = ent.h;
  const x0 = Math.floor(p.x - hw), x1 = Math.floor(p.x + hw - 1e-7);
  const y0 = Math.floor(p.y), y1 = Math.floor(p.y + h - 1e-7);
  const z0 = Math.floor(p.z - hw), z1 = Math.floor(p.z + hw - 1e-7);
  let collided = false;
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      for (let z = z0; z <= z1; z++) {
        if (!isSolid(world.getBlock(x, y, z))) continue;
        collided = true;
        if (axis === "y") {
          if (amount > 0) p.y = Math.min(p.y, y - h - PHYS_EPS);
          else p.y = Math.max(p.y, y + 1 + PHYS_EPS);
        } else if (axis === "x") {
          if (amount > 0) p.x = Math.min(p.x, x - hw - PHYS_EPS);
          else p.x = Math.max(p.x, x + 1 + hw + PHYS_EPS);
        } else {
          if (amount > 0) p.z = Math.min(p.z, z - hw - PHYS_EPS);
          else p.z = Math.max(p.z, z + 1 + hw + PHYS_EPS);
        }
      }
    }
  }
  return collided;
}

// 完整物理步进: 重力 + 分轴碰撞。返回 {onGround, hitHead}
function stepEntityPhysics(world, ent, dt) {
  const maxStep = 0.4;
  const maxV = Math.max(Math.abs(ent.vel.x), Math.abs(ent.vel.y), Math.abs(ent.vel.z));
  const steps = Math.max(1, Math.ceil((maxV * dt) / maxStep));
  const sdt = dt / steps;
  let onGround = false, hitHead = false;

  for (let s = 0; s < steps; s++) {
    if (moveAxis(world, ent, "y", ent.vel.y * sdt)) {
      if (ent.vel.y < 0) onGround = true; else hitHead = true;
      ent.vel.y = 0;
    }
    if (moveAxis(world, ent, "x", ent.vel.x * sdt)) ent.vel.x = 0;
    if (moveAxis(world, ent, "z", ent.vel.z * sdt)) ent.vel.z = 0;
  }
  // 站立检测(贴地)
  if (!onGround && ent.vel.y <= 0) {
    const hw = ent.w / 2;
    const p = ent.pos;
    const x0 = Math.floor(p.x - hw), x1 = Math.floor(p.x + hw - 1e-7);
    const z0 = Math.floor(p.z - hw), z1 = Math.floor(p.z + hw - 1e-7);
    const yb = Math.floor(p.y - 0.02);
    outer:
    for (let x = x0; x <= x1; x++)
      for (let z = z0; z <= z1; z++)
        if (isSolid(world.getBlock(x, yb, z))) { onGround = true; break outer; }
  }
  return { onGround, hitHead };
}

// 实体某一高度处是否在水中
function entityInWater(world, ent, ratio = 0.5) {
  return world.getBlock(ent.pos.x, ent.pos.y + ent.h * ratio, ent.pos.z) === B.WATER;
}

// 实体眼部是否在水下
function entityEyesInWater(world, ent) {
  return world.getBlock(ent.pos.x, ent.pos.y + ent.h * 0.9, ent.pos.z) === B.WATER;
}

// ==================== DDA 体素射线 ====================
// 返回 {x,y,z,id,face:[nx,ny,nz],dist} 或 null
function raycastVoxel(world, ox, oy, oz, dx, dy, dz, maxDist, hitFluid = false) {
  let x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz);
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
  dx /= len; dy /= len; dz /= len;

  const stepX = dx > 0 ? 1 : -1, stepY = dy > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;
  const tDeltaX = dx !== 0 ? Math.abs(1 / dx) : Infinity;
  const tDeltaY = dy !== 0 ? Math.abs(1 / dy) : Infinity;
  const tDeltaZ = dz !== 0 ? Math.abs(1 / dz) : Infinity;
  let tMaxX = dx !== 0 ? (dx > 0 ? (x + 1 - ox) : (ox - x)) * tDeltaX : Infinity;
  let tMaxY = dy !== 0 ? (dy > 0 ? (y + 1 - oy) : (oy - y)) * tDeltaY : Infinity;
  let tMaxZ = dz !== 0 ? (dz > 0 ? (z + 1 - oz) : (oz - z)) * tDeltaZ : Infinity;

  let face = [0, 0, 0];
  let t = 0;
  for (let i = 0; i < 256; i++) {
    if (t > maxDist) return null;
    const id = world.getBlock(x, y, z);
    if (id !== B.AIR) {
      const b = BLOCKS[id];
      if (hitFluid || !b.fluid) return { x, y, z, id, face, dist: t };
    }
    if (tMaxX < tMaxY && tMaxX < tMaxZ) {
      x += stepX; t = tMaxX; tMaxX += tDeltaX; face = [-stepX, 0, 0];
    } else if (tMaxY < tMaxZ) {
      y += stepY; t = tMaxY; tMaxY += tDeltaY; face = [0, -stepY, 0];
    } else {
      z += stepZ; t = tMaxZ; tMaxZ += tDeltaZ; face = [0, 0, -stepZ];
    }
  }
  return null;
}

// ==================== 射线 vs AABB (实体选择) ====================
function rayAABB(ox, oy, oz, dx, dy, dz, box) {
  let tmin = 0, tmax = Infinity;
  const o = [ox, oy, oz], d = [dx, dy, dz];
  const bmin = [box.minX, box.minY, box.minZ], bmax = [box.maxX, box.maxY, box.maxZ];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) {
      if (o[i] < bmin[i] || o[i] > bmax[i]) return null;
    } else {
      let t1 = (bmin[i] - o[i]) / d[i];
      let t2 = (bmax[i] - o[i]) / d[i];
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }
  }
  return tmin;
}
