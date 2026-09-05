/* ============================================================
 * VoxelCraft — 实体系统: 掉落物 / 生物 / TNT / 粒子
 * ============================================================ */
"use strict";

// ==================== 生物纹理 ====================
const _mobTexCache = {};
function mobSkinTexture(key, base, vary) {
  if (_mobTexCache[key]) return _mobTexCache[key];
  const cv = document.createElement("canvas");
  cv.width = 32; cv.height = 32;
  const ctx = cv.getContext("2d");
  const rng = mulberry32(hashSeed(key));
  const [r, g, b] = hexToRgb(base);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const f = 1 + (rng() - 0.5) * vary;
    ctx.fillStyle = `rgb(${clamp(r * f, 0, 255) | 0},${clamp(g * f, 0, 255) | 0},${clamp(b * f, 0, 255) | 0})`;
    ctx.fillRect(x, y, 1, 1);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter;
  _mobTexCache[key] = tex;
  return tex;
}

function mobFaceTexture(type) {
  const key = "face_" + type;
  if (_mobTexCache[key]) return _mobTexCache[key];
  const cv = document.createElement("canvas");
  cv.width = 32; cv.height = 32;
  const ctx = cv.getContext("2d");
  if (type === "pig") {
    ctx.fillStyle = "#eda3a0"; ctx.fillRect(0, 0, 32, 32);
    ctx.fillStyle = "#1c1c1c"; ctx.fillRect(3, 10, 6, 5); ctx.fillRect(23, 10, 6, 5);   // 眼
    ctx.fillStyle = "#d4706d"; ctx.fillRect(9, 20, 14, 9);                              // 鼻
    ctx.fillStyle = "#7a3a38"; ctx.fillRect(11, 23, 3, 4); ctx.fillRect(18, 23, 3, 4);
  } else if (type === "sheep") {
    ctx.fillStyle = "#e6d8c8"; ctx.fillRect(0, 0, 32, 32);
    ctx.fillStyle = "#1c1c1c"; ctx.fillRect(4, 12, 6, 5); ctx.fillRect(22, 12, 6, 5);
    ctx.fillStyle = "#c8a888"; ctx.fillRect(12, 22, 8, 6);
  } else { // zombie
    ctx.fillStyle = "#4a7a3a"; ctx.fillRect(0, 0, 32, 32);
    ctx.fillStyle = "#0a0a0a"; ctx.fillRect(4, 10, 8, 5); ctx.fillRect(20, 10, 8, 5);
    ctx.fillStyle = "#1c2c14"; ctx.fillRect(10, 22, 12, 6);
    ctx.fillStyle = "#3a5a2c"; ctx.fillRect(12, 22, 2, 6); ctx.fillRect(18, 22, 2, 6);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter;
  _mobTexCache[key] = tex;
  return tex;
}

function mobMaterial(sky, key, tex) {
  const m = new THREE.MeshBasicMaterial({ map: tex });
  if (G.sky) G.sky.registerMobMaterial(m);
  return m;
}

// ==================== 生物定义 ====================
const MOB_DEFS = {
  pig: { w: 0.8, h: 0.9, hp: 10, speed: 1.0, hostile: false, model: "quad",
    skin: "#eda3a0", drops: [{ id: I.PORKCHOP, min: 1, max: 3 }] },
  sheep: { w: 0.9, h: 1.15, hp: 8, speed: 0.9, hostile: false, model: "quad",
    skin: "#e8e8e8", drops: [{ id: B.WOOL, min: 1, max: 2 }] },
  zombie: { w: 0.6, h: 1.9, hp: 20, speed: 2.4, hostile: true, damage: 3,
    model: "human", skin: "#4a7a3a", drops: [{ id: I.APPLE, min: 1, max: 1, chance: 0.1 }] },
};

// ==================== 掉落物 ====================
class ItemDrop {
  constructor(mgr, x, y, z, itemId, count, vel, pickupDelay = 0.5) {
    this.mgr = mgr;
    this.type = "drop";
    this.itemId = itemId;
    this.count = count;
    this.age = 0;
    this.pickupDelay = pickupDelay;
    this.dead = false;
    this.pos = { x, y, z };
    this.vel = vel || { x: (Math.random() - 0.5) * 2.5, y: 3.2 + Math.random() * 1.5, z: (Math.random() - 0.5) * 2.5 };
    this.w = 0.25; this.h = 0.25;
    this.onGround = false;

    const item = ITEMS[itemId];
    if (item && item.isBlock && !BLOCKS[itemId].plant) {
      this.mesh = makeMiniBlock(itemId, 0.28);
      this.spin = true;
    } else {
      const tex = new THREE.CanvasTexture(ICONS[itemId]);
      tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter;
      this.mesh = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
      this.mesh.scale.set(0.4, 0.4, 1);
      this.spin = false;
    }
    this.mesh.position.set(x, y, z);
    mgr.scene.add(this.mesh);
  }

  update(dt) {
    this.age += dt;
    this.pickupDelay -= dt;
    if (this.age > ITEM_DROP_TTL) { this.dead = true; return; }

    // 物理
    this.vel.y -= GRAVITY * 0.8 * dt;
    this.vel.x *= (1 - Math.min(1, 3 * dt));
    this.vel.z *= (1 - Math.min(1, 3 * dt));
    const r = stepEntityPhysics(this.mgr.world, this, dt);
    if (r.onGround) { this.vel.x *= 0.6; this.vel.z *= 0.6; }

    // 视觉
    const bob = Math.sin(this.age * 2.2) * 0.06;
    this.mesh.position.set(this.pos.x, this.pos.y + 0.15 + bob + (this.spin ? 0 : 0.05), this.pos.z);
    if (this.spin) this.mesh.rotation.y += dt * 1.5;

    // 与其他掉落物合并
    for (const e of this.mgr.list) {
      if (e === this || e.type !== "drop" || e.dead) continue;
      if (e.itemId !== this.itemId) continue;
      const d = dist3(this.pos, e.pos);
      if (d < 0.6) {
        const max = ITEMS[this.itemId].stack;
        if (this.count + e.count <= max) {
          this.count += e.count; e.dead = true;
        }
      }
    }
  }

  dispose() { this.mgr.scene.remove(this.mesh); }
}

function dist3(a, b) {
  const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// 小方块网格 (掉落物/手持)
const _miniBlockCache = {};
function makeMiniBlock(blockId, size) {
  const key = blockId + "_" + size;
  if (_miniBlockCache[key]) return _miniBlockCache[key].clone();
  const block = BLOCKS[blockId];
  const geo = new THREE.BufferGeometry();
  const p = [], u = [], c = [], idx = [];
  let n = 0;
  for (const f of FACES) {
    const tileName = faceTile(block, f.name);
    const uv = tileUV(TILE[tileName]);
    for (const corner of f.corners) {
      p.push((corner.pos[0] - 0.5) * size, corner.pos[1] * size - size / 2, (corner.pos[2] - 0.5) * size);
      u.push(corner.uv[0] ? uv.u1 : uv.u0, corner.uv[1] ? uv.v1 : uv.v0);
      c.push(f.shade, f.shade, f.shade);
    }
    idx.push(n, n + 1, n + 2, n + 2, n + 1, n + 3);
    n += 4;
  }
  geo.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(u, 2));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(c, 3));
  geo.setIndex(idx);
  const mesh = new THREE.Mesh(geo, matOpaque);
  _miniBlockCache[key] = mesh;
  return mesh;
}

// ==================== 生物 ====================
class Mob {
  constructor(mgr, type, x, y, z) {
    this.mgr = mgr;
    this.type = "mob";
    this.mtype = type;
    const def = MOB_DEFS[type];
    this.def = def;
    this.w = def.w; this.h = def.h;
    this.hp = def.hp;
    this.pos = { x, y, z };
    this.vel = { x: 0, y: 0, z: 0 };
    this.yaw = Math.random() * Math.PI * 2;
    this.dead = false;
    this.onGround = false;

    // AI 状态
    this.state = "wander";
    this.stateTimer = Math.random() * 3;
    this.moveDir = 0;             // -1..1 前进系数
    this.attackCd = 0;
    this.hurtTimer = 0;
    this.soundTimer = Math.random() * 8 + 4;
    this.walkPhase = 0;
    this.burning = false;

    this.buildModel();
    this.mesh.position.set(x, y, z);
    mgr.scene.add(this.mesh);
  }

  buildModel() {
    const g = new THREE.Group();
    const sky = G.sky;
    if (this.def.model === "quad") {
      const skin = mobSkinTexture(this.mtype + "_skin", this.def.skin, 0.18);
      const face = mobFaceTexture(this.mtype);
      const mSkin = mobMaterial(sky, this.mtype + "_skin", skin);
      const mFace = mobMaterial(sky, this.mtype + "_face", face);
      const bodyMat = [mSkin, mSkin, mSkin, mSkin, mSkin, mSkin];

      const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.55, 0.95), bodyMat);
      body.position.y = 0.62;
      g.add(body);

      const headMats = [mSkin, mSkin, mSkin, mSkin, mFace, mSkin];
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.45, 0.4), headMats);
      head.position.set(0, 0.72, 0.62);
      g.add(head);

      this.legs = [];
      const legGeo = new THREE.BoxGeometry(0.18, 0.38, 0.18);
      for (const [lx, lz] of [[-0.2, 0.32], [0.2, 0.32], [-0.2, -0.32], [0.2, -0.32]]) {
        const leg = new THREE.Mesh(legGeo, bodyMat);
        leg.position.set(lx, 0.19, lz);
        g.add(leg);
        this.legs.push(leg);
      }
      this.head = head;
      this.body = body;
    } else {
      // 人形 (僵尸)
      const skin = mobSkinTexture(this.mtype + "_skin", this.def.skin, 0.15);
      const face = mobFaceTexture(this.mtype);
      const mSkin = mobMaterial(sky, this.mtype + "_skin", skin);
      const mFace = mobMaterial(sky, this.mtype + "_face", face);
      const bodyMat = [mSkin, mSkin, mSkin, mSkin, mSkin, mSkin];

      const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.72, 0.26), bodyMat);
      body.position.y = 1.06;
      g.add(body);

      const headMats = [mSkin, mSkin, mSkin, mSkin, mFace, mSkin];
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.45, 0.45), headMats);
      head.position.y = 1.66;
      g.add(head);

      this.arms = [];
      const armGeo = new THREE.BoxGeometry(0.18, 0.62, 0.18);
      for (const side of [-1, 1]) {
        const arm = new THREE.Mesh(armGeo, bodyMat);
        arm.position.set(side * 0.35, 1.32, 0.05);
        arm.rotation.x = -Math.PI / 2 + 0.15;
        g.add(arm);
        this.arms.push(arm);
      }
      this.legs = [];
      const legGeo = new THREE.BoxGeometry(0.2, 0.72, 0.2);
      for (const side of [-1, 1]) {
        const leg = new THREE.Mesh(legGeo, bodyMat);
        leg.position.set(side * 0.13, 0.36, 0);
        g.add(leg);
        this.legs.push(leg);
      }
      this.head = head;
      this.body = body;
    }

    // 受击红闪覆盖层
    const flash = new THREE.Mesh(
      new THREE.BoxGeometry(this.w * 1.15, this.h * 1.08, this.w * 1.15),
      new THREE.MeshBasicMaterial({ color: 0xff3030, transparent: true, opacity: 0.45, depthWrite: false })
    );
    flash.position.y = this.h / 2;
    flash.visible = false;
    g.add(flash);
    this.flashMesh = flash;

    this.mesh = g;
  }

  hurt(dmg, knockFrom) {
    if (this.dead) return;
    this.hp -= dmg;
    this.hurtTimer = 0.25;
    this.flashMesh.visible = true;
    if (knockFrom) {
      const dx = this.pos.x - knockFrom.x, dz = this.pos.z - knockFrom.z;
      const d = Math.sqrt(dx * dx + dz * dz) || 1;
      this.vel.x += (dx / d) * 6; this.vel.z += (dz / d) * 6;
      this.vel.y += 4.2;
    }
    if (!this.def.hostile) { this.state = "flee"; this.stateTimer = 4; }
    else { this.state = "chase"; }
    if (this.mtype === "pig") Sound.pigOink();
    else if (this.mtype === "sheep") Sound.sheepBaa();
    else Sound.zombieGroan();
    if (this.hp <= 0) this.die();
  }

  die() {
    this.dead = true;
    // 掉落
    for (const d of this.def.drops) {
      const chance = d.chance === undefined ? 1 : d.chance;
      if (Math.random() < chance) {
        const count = d.min + Math.floor(Math.random() * (d.max - d.min + 1));
        if (count > 0) this.mgr.spawnDrop(this.pos.x, this.pos.y + 0.4, this.pos.z, d.id, count);
      }
    }
    this.mgr.particles.burstSmoke(this.pos.x, this.pos.y + this.h / 2, this.pos.z, 10);
  }

  update(dt, player) {
    this.stateTimer -= dt;
    this.attackCd -= dt;
    this.hurtTimer -= dt;
    this.soundTimer -= dt;
    if (this.hurtTimer <= 0) this.flashMesh.visible = false;

    const distP = player ? dist3(this.pos, player.pos) : 999;
    const daylight = G.sky ? G.sky.daylight : 1;

    // 僵尸白天燃烧
    if (this.def.hostile && daylight > 0.75 && this.pos.y >= 50) {
      const skyVisible = this.checkSkyVisible();
      if (skyVisible) {
        this.burning = true;
        this.hp -= dt * 2.5;
        if (Math.random() < dt * 8) this.mgr.particles.burstFlame(this.pos.x, this.pos.y + this.h * 0.8, this.pos.z, 2);
        if (this.hp <= 0) { this.die(); return; }
      }
    } else this.burning = false;

    // 环境音
    if (this.soundTimer <= 0) {
      this.soundTimer = 6 + Math.random() * 10;
      if (distP < 18) {
        if (this.mtype === "pig") Sound.pigOink();
        else if (this.mtype === "sheep") Sound.sheepBaa();
        else if (distP < 14) Sound.zombieGroan();
      }
    }

    // ===== AI =====
    let speed = this.def.speed;
    if (this.def.hostile) {
      if (distP < 26 && player && !player.dead) {
        this.state = "chase";
      } else if (this.state === "chase") {
        this.state = "wander"; this.stateTimer = 2;
      }
      if (this.state === "chase" && player) {
        // 朝向玩家
        const dx = player.pos.x - this.pos.x, dz = player.pos.z - this.pos.z;
        this.yaw = Math.atan2(dx, dz);
        this.moveDir = 1;
        // 攻击
        if (distP < 1.7 && this.attackCd <= 0) {
          this.attackCd = 1.0;
          player.hurt(this.def.damage, this.pos);
        }
      } else this.wanderTick(dt);
    } else {
      if (this.state === "flee" && player) {
        const dx = this.pos.x - player.pos.x, dz = this.pos.z - player.pos.z;
        this.yaw = Math.atan2(dx, dz);
        this.moveDir = 1;
        speed *= 1.6;
        if (this.stateTimer <= 0) { this.state = "wander"; this.stateTimer = 3; }
      } else this.wanderTick(dt);
    }

    // ===== 移动与物理 =====
    const mx = Math.sin(this.yaw) * this.moveDir * speed;
    const mz = Math.cos(this.yaw) * this.moveDir * speed;
    const accel = this.onGround ? 8 : 2;
    this.vel.x += (mx - this.vel.x) * Math.min(1, accel * dt);
    this.vel.z += (mz - this.vel.z) * Math.min(1, accel * dt);

    const inWater = entityInWater(this.mgr.world, this, 0.4);
    if (inWater) {
      this.vel.y += (1.5 - this.vel.y) * Math.min(1, 3 * dt);  // 浮起
    } else {
      this.vel.y -= GRAVITY * dt;
    }

    const preX = this.pos.x, preZ = this.pos.z;
    const r = stepEntityPhysics(this.mgr.world, this, dt);
    this.onGround = r.onGround;

    // 被挡自动跳
    if (this.onGround && this.moveDir !== 0) {
      const movedSq = (this.pos.x - preX) ** 2 + (this.pos.z - preZ) ** 2;
      if (movedSq < (speed * dt * 0.25) ** 2) {
        this.vel.y = JUMP_VELOCITY * 0.82;
      }
    }

    // 落水伤害无 / 虚空
    if (this.pos.y < -10) this.dead = true;

    // ===== 动画 =====
    const hSpeed = Math.sqrt(this.vel.x ** 2 + this.vel.z ** 2);
    this.walkPhase += hSpeed * dt * 3.2;
    const swing = Math.min(1, hSpeed / 2) * 0.75;
    if (this.legs) {
      this.legs.forEach((leg, i) => {
        leg.rotation.x = Math.sin(this.walkPhase + (i % 2) * Math.PI) * swing;
      });
    }
    if (this.arms) {
      this.arms.forEach((arm, i) => {
        arm.rotation.x = -Math.PI / 2 + 0.15 + Math.sin(this.walkPhase * 0.7 + i * Math.PI) * 0.18;
      });
    }
    this.mesh.position.set(this.pos.x, this.pos.y, this.pos.z);
    this.mesh.rotation.y = this.yaw;

    // 燃烧时整体泛红闪烁
    if (this.burning && Math.random() < dt * 4) {
      this.mgr.particles.burstFlame(this.pos.x, this.pos.y + this.h * 0.5, this.pos.z, 1);
    }
  }

  wanderTick(dt) {
    if (this.stateTimer <= 0) {
      this.stateTimer = 2 + Math.random() * 4;
      if (Math.random() < 0.45) this.moveDir = 0;         // 停下休息
      else {
        this.moveDir = 0.5 + Math.random() * 0.5;
        this.yaw = Math.random() * Math.PI * 2;
      }
    }
  }

  checkSkyVisible() {
    const w = this.mgr.world;
    for (let y = Math.ceil(this.pos.y + this.h); y < WORLD_HEIGHT; y++) {
      const id = w.getBlock(Math.floor(this.pos.x), y, Math.floor(this.pos.z));
      if (id !== B.AIR && !BLOCKS[id].plant) return false;
    }
    return true;
  }

  dispose() { this.mgr.scene.remove(this.mesh); }
}

// ==================== 已点燃 TNT ====================
class PrimedTNT {
  constructor(mgr, x, y, z, fuse = 4) {
    this.mgr = mgr;
    this.type = "tnt";
    this.pos = { x, y, z };
    this.vel = { x: 0, y: 2.5, z: 0 };
    this.w = 0.98; this.h = 0.98;
    this.fuse = fuse;
    this.dead = false;
    this.age = 0;

    this.mesh = makeMiniBlock(B.TNT, 0.98);
    // 白色闪烁覆盖
    this.flash = new THREE.Mesh(
      new THREE.BoxGeometry(1.0, 1.0, 1.0),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, depthWrite: false })
    );
    this.flash.visible = false;
    this.mesh.add(this.flash);
    mgr.scene.add(this.mesh);
    Sound.fuse();
  }

  update(dt) {
    this.age += dt;
    this.fuse -= dt;
    this.vel.y -= GRAVITY * dt;
    stepEntityPhysics(this.mgr.world, this, dt);
    this.mesh.position.set(this.pos.x, this.pos.y + 0.49, this.pos.z);
    // 闪烁加速
    const rate = this.fuse < 1 ? 8 : 3;
    this.flash.visible = Math.sin(this.age * rate * Math.PI) > 0;
    if (this.fuse <= 0) {
      this.dead = true;
      this.mgr.explode(this.pos.x + 0.5, this.pos.y + 0.5, this.pos.z + 0.5, 4.2);
    }
  }
  dispose() { this.mgr.scene.remove(this.mesh); }
}

// ==================== 粒子系统 ====================
class ParticleSystem {
  constructor(scene) {
    this.scene = scene;
    this.parts = [];

    // 方块碎粒 plane 模板
    this.planeGeo = new THREE.PlaneGeometry(0.14, 0.14);
    // 白点纹理 (烟/火花)
    const cv = document.createElement("canvas");
    cv.width = 16; cv.height = 16;
    const ctx = cv.getContext("2d");
    const g = ctx.createRadialGradient(8, 8, 1, 8, 8, 8);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, 16, 16);
    this.dotTex = new THREE.CanvasTexture(cv);
    this.dotMats = {};
  }

  dotMat(color) {
    if (!this.dotMats[color]) {
      this.dotMats[color] = new THREE.SpriteMaterial({
        map: this.dotTex, color, transparent: true, depthWrite: false,
      });
    }
    return this.dotMats[color];
  }

  // 方块碎粒
  burstBlock(x, y, z, blockId, count = 14) {
    const block = BLOCKS[blockId];
    if (!block) return;
    const tileName = block.tex.all || block.tex.side || block.tex.top;
    const t = tileUV(TILE[tileName]);
    for (let i = 0; i < count; i++) {
      const geo = this.planeGeo.clone();
      // 随机子区域 UV
      const su = t.u0 + Math.random() * (t.u1 - t.u0) * 0.7;
      const sv = t.v0 + Math.random() * (t.v1 - t.v0) * 0.7;
      const uw = (t.u1 - t.u0) * 0.3, vh = (t.v1 - t.v0) * 0.3;
      const uvAttr = geo.attributes.uv;
      uvAttr.setXY(0, su, sv + vh); uvAttr.setXY(1, su + uw, sv + vh);
      uvAttr.setXY(2, su, sv); uvAttr.setXY(3, su + uw, sv);
      const mesh = new THREE.Mesh(geo, matOpaque);
      mesh.position.set(x + (Math.random() - 0.5) * 0.8, y + Math.random() * 0.8, z + (Math.random() - 0.5) * 0.8);
      this.scene.add(mesh);
      this.parts.push({
        kind: "block", mesh, life: 0.5 + Math.random() * 0.5, age: 0,
        vel: { x: (Math.random() - 0.5) * 3.5, y: 2 + Math.random() * 3, z: (Math.random() - 0.5) * 3.5 },
      });
    }
  }

  burstSmoke(x, y, z, count = 10, color = "#aaaaaa") {
    this.burstSprite(x, y, z, count, color, 0.35, 0.6, 2.2);
  }

  burstFlame(x, y, z, count = 4) {
    this.burstSprite(x, y, z, count, "#ff8c1a", 0.18, 0.35, 1.6, true);
  }

  burstSprite(x, y, z, count, color, size, life, spread, rise = false) {
    for (let i = 0; i < count; i++) {
      const s = new THREE.Sprite(this.dotMat(color));
      s.scale.set(size * (0.7 + Math.random() * 0.6), size * (0.7 + Math.random() * 0.6), 1);
      s.position.set(x + (Math.random() - 0.5) * 0.5, y + (Math.random() - 0.5) * 0.5, z + (Math.random() - 0.5) * 0.5);
      this.scene.add(s);
      this.parts.push({
        kind: "sprite", mesh: s, life: life * (0.7 + Math.random() * 0.6), age: 0,
        vel: {
          x: (Math.random() - 0.5) * spread,
          y: rise ? (0.8 + Math.random() * 1.2) : (1 + Math.random() * 1.5),
          z: (Math.random() - 0.5) * spread,
        },
        baseScale: s.scale.x,
      });
    }
  }

  update(dt, camPos) {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.age += dt;
      if (p.age >= p.life) {
        this.scene.remove(p.mesh);
        if (p.kind === "block") p.mesh.geometry.dispose();
        this.parts.splice(i, 1);
        continue;
      }
      p.vel.y -= (p.kind === "block" ? GRAVITY : GRAVITY * 0.12) * dt;
      p.mesh.position.x += p.vel.x * dt;
      p.mesh.position.y += p.vel.y * dt;
      p.mesh.position.z += p.vel.z * dt;
      if (p.kind === "block") {
        p.mesh.rotation.x += dt * 5;
        p.mesh.rotation.y += dt * 4;
        p.mesh.lookAt(camPos.x, camPos.y, camPos.z);
      } else {
        const k = 1 - p.age / p.life;
        p.mesh.scale.set(p.baseScale * k, p.baseScale * k, 1);
      }
    }
  }
}

// ==================== 实体管理器 ====================
class EntityManager {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.list = [];
    this.particles = new ParticleSystem(scene);
    this.spawnTimer = 0;
  }

  spawnDrop(x, y, z, itemId, count, vel) {
    if (!ITEMS[itemId] || count <= 0) return;
    const d = new ItemDrop(this, x, y, z, itemId, count, vel);
    this.list.push(d);
    return d;
  }

  spawnMob(type, x, y, z) {
    const m = new Mob(this, type, x, y, z);
    this.list.push(m);
    return m;
  }

  spawnTNT(x, y, z, fuse) {
    const t = new PrimedTNT(this, x, y, z, fuse);
    this.list.push(t);
    return t;
  }

  countMobs(hostile) {
    let n = 0;
    for (const e of this.list) if (e.type === "mob" && !e.dead && e.def.hostile === hostile) n++;
    return n;
  }

  update(dt, player) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const e = this.list[i];
      if (e.dead) { e.dispose(); this.list.splice(i, 1); continue; }
      e.update(dt, player);
      if (e.dead) { e.dispose(); this.list.splice(i, 1); }
    }

    // 掉落物拾取
    if (player && !player.dead) {
      for (const e of this.list) {
        if (e.type !== "drop" || e.dead || e.pickupDelay > 0) continue;
        const d = dist3(e.pos, { x: player.pos.x, y: player.pos.y + 0.8, z: player.pos.z });
        if (d < 2.0) {
          // 吸附
          const dx = player.pos.x - e.pos.x, dy = player.pos.y + 0.6 - e.pos.y, dz = player.pos.z - e.pos.z;
          e.pos.x += dx / d * 6 * dt; e.pos.y += dy / d * 6 * dt; e.pos.z += dz / d * 6 * dt;
        }
        if (d < 0.55) {
          const remain = player.giveItem(e.itemId, e.count);
          if (remain === 0) { e.dead = true; Sound.pop(); }
          else e.count = remain;
        }
      }
    }

    // 定时刷怪
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0 && player) {
      this.spawnTimer = 3;
      this.trySpawn(player);
    }

    this.particles.update(dt, player ? player.getEyePos() : { x: 0, y: 0, z: 0 });
  }

  trySpawn(player) {
    if (G.state !== "playing") return;
    const daylight = G.sky ? G.sky.daylight : 1;
    const night = daylight < 0.45;

    // 敌对 (夜间)
    if (night && this.countMobs(true) < MAX_MOBS_HOSTILE) {
      for (let attempt = 0; attempt < 3; attempt++) {
        const ang = Math.random() * Math.PI * 2;
        const r = 22 + Math.random() * 18;
        const x = Math.floor(player.pos.x + Math.cos(ang) * r);
        const z = Math.floor(player.pos.z + Math.sin(ang) * r);
        const y = this.world.getSurfaceY(x, z);
        if (this.world.getBlock(x, y, z) !== B.AIR || this.world.getBlock(x, y + 1, z) !== B.AIR) continue;
        if (!isSolid(this.world.getBlock(x, y - 1, z))) continue;
        // 光照简化: 表面暴露即可
        this.spawnMob("zombie", x + 0.5, y, z + 0.5);
        break;
      }
    }

    // 友好 (任何时间, 有上限)
    if (this.countMobs(false) < MAX_MOBS_PASSIVE && Math.random() < 0.4) {
      for (let attempt = 0; attempt < 3; attempt++) {
        const ang = Math.random() * Math.PI * 2;
        const r = 20 + Math.random() * 26;
        const x = Math.floor(player.pos.x + Math.cos(ang) * r);
        const z = Math.floor(player.pos.z + Math.sin(ang) * r);
        const y = this.world.getSurfaceY(x, z);
        const ground = this.world.getBlock(x, y, z);
        if (ground !== B.GRASS && ground !== B.SNOWY_GRASS) continue;
        if (this.world.getBlock(x, y + 1, z) !== B.AIR || this.world.getBlock(x, y + 2, z) !== B.AIR) continue;
        const type = Math.random() < 0.55 ? "sheep" : "pig";
        // 小群
        const n = 1 + (Math.random() * 3 | 0);
        for (let i = 0; i < n; i++) {
          this.spawnMob(type, x + 0.5 + (Math.random() - 0.5) * 2, y + 1, z + 0.5 + (Math.random() - 0.5) * 2);
        }
        break;
      }
    }
  }

  // 攻击射线选择实体
  raypick(origin, dir, maxDist) {
    let best = null, bestT = maxDist;
    for (const e of this.list) {
      if (e.type !== "mob" || e.dead) continue;
      const hw = e.w / 2 + 0.1;
      const box = {
        minX: e.pos.x - hw, maxX: e.pos.x + hw,
        minY: e.pos.y, maxY: e.pos.y + e.h,
        minZ: e.pos.z - hw, maxZ: e.pos.z + hw,
      };
      const t = rayAABB(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, box);
      if (t !== null && t < bestT) { bestT = t; best = e; }
    }
    return best ? { entity: best, dist: bestT } : null;
  }

  // ==================== 爆炸 ====================
  explode(x, y, z, power) {
    Sound.explosion();
    const world = this.world;
    const touched = new Set();
    const chain = [];

    for (let dx = -Math.ceil(power); dx <= Math.ceil(power); dx++) {
      for (let dy = -Math.ceil(power); dy <= Math.ceil(power); dy++) {
        for (let dz = -Math.ceil(power); dz <= Math.ceil(power); dz++) {
          const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (d > power * (0.8 + Math.random() * 0.35)) continue;
          const bx = Math.floor(x) + dx, by = Math.floor(y) + dy, bz = Math.floor(z) + dz;
          const id = world.getBlock(bx, by, bz);
          if (id === B.AIR || id === B.BEDROCK || id === B.OBSIDIAN) continue;
          if (id === B.TNT) {
            world.setBlock(bx, by, bz, B.AIR);
            chain.push([bx, by, bz]);
            continue;
          }
          world.setBlock(bx, by, bz, B.AIR);
          touched.add(world.key(bx >> 4, bz >> 4));
          if (Math.random() < 0.28) {
            const drops = getDrops(id, 0);
            for (const dr of drops) this.spawnDrop(bx + 0.5, by + 0.5, bz + 0.5, dr.id, dr.count);
          }
        }
      }
    }

    // 连锁 TNT
    for (const [bx, by, bz] of chain) {
      this.spawnTNT(bx, by, bz, 0.3 + Math.random() * 0.6);
    }

    // 重建受影响区块
    for (const k of touched) {
      const [cx, cz] = k.split(",").map(Number);
      const c = world.getChunk(cx, cz);
      if (c && c.hasData && world.neighborsReady(c)) world.buildChunkMesh(c);
      else if (c) c.dirty = true;
    }

    // 伤害与击退 (实体)
    for (const e of this.list) {
      if (e.dead || e.type === "tnt") continue;
      const d = dist3(e.pos, { x, y, z });
      if (d < power * 2) {
        const dmg = Math.max(0, (1 - d / (power * 2)) * power * 4);
        const dx = (e.pos.x - x) / (d || 1), dz = (e.pos.z - z) / (d || 1);
        if (e.type === "mob") {
          e.vel.x += dx * 9; e.vel.z += dz * 9; e.vel.y += 6;
          e.hurt(dmg, null);
        } else if (e.type === "drop") {
          e.vel.x += dx * 9; e.vel.z += dz * 9; e.vel.y += 7;
        }
      }
    }

    // 伤害玩家
    const p = G.player;
    if (p && !p.dead) {
      const eye = p.getEyePos();
      const d = dist3({ x: p.pos.x, y: p.pos.y + 0.9, z: p.pos.z }, { x, y, z });
      if (d < power * 2) {
        const dmg = Math.max(0, (1 - d / (power * 2)) * power * 3.6);
        p.hurt(dmg, { x, z });
      }
    }

    // 视觉
    this.particles.burstSmoke(x, y, z, 36, "#555555");
    this.particles.burstFlame(x, y, z, 18);
    this.particles.burstSmoke(x, y, z, 14, "#cccccc");
    if (G.ui && G.ui.shake) G.ui.shake(0.5);
  }

  clearAll() {
    for (const e of this.list) e.dispose();
    this.list = [];
    for (const p of this.particles.parts) this.scene.remove(p.mesh);
    this.particles.parts = [];
  }
}
