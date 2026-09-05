/* ============================================================
 * VoxelCraft — 玩家: 控制 / 交互 / 生存机制 / 第一人称视图
 * ============================================================ */
"use strict";

class Player {
  constructor(world, entities) {
    this.world = world;
    this.entities = entities;
    this.pos = { x: 8.5, y: 70, z: 8.5 };
    this.vel = { x: 0, y: 0, z: 0 };
    this.w = PLAYER_WIDTH; this.h = PLAYER_HEIGHT;
    this.yaw = 0; this.pitch = 0;
    this.mode = G.mode;                  // survival | creative
    this.hp = MAX_HEALTH;
    this.hunger = MAX_HUNGER;
    this.saturation = 5;
    this.exhaustion = 0;
    this.dead = false;
    this.onGround = false;
    this.inWater = false;
    this.eyesInWater = false;
    this.flying = false;
    this.sprinting = false;
    this.sneaking = false;
    this.fallStartY = null;
    this.hurtCooldown = 0;
    this.regenTimer = 0;
    this.starveTimer = 0;
    this.spawnPoint = null;
    this.inventory = new Inventory();
    this.swimSoundCd = 0;
    // 盔甲: 0头盔 1胸甲 2护腿 3靴子
    this.armor = [null, null, null, null];

    // 挖掘/放置/食用
    this.breakTarget = null;
    this.breakProgress = 0;
    this.breakSoundCd = 0;
    this.placeCd = 0;
    this.attackCd = 0;
    this.eating = false;
    this.eatProgress = 0;
    this.lastSpaceTap = 0;
    this.lastWTap = 0;
    this.stepDist = 0;

    // 视觉
    this.heldGroup = null;              // 由 main 创建后注入
    this.swingT = 1;                    // 1 = 静止
    this.equipT = 1;
    this.bobPhase = 0;
    this.heldItemId = -1;
  }

  getEyePos() {
    return { x: this.pos.x, y: this.pos.y + (this.sneaking ? 1.35 : EYE_HEIGHT), z: this.pos.z };
  }

  getLookDir() {
    const cp = Math.cos(this.pitch);
    return { x: -Math.sin(this.yaw) * cp, y: Math.sin(this.pitch), z: -Math.cos(this.yaw) * cp };
  }

  get reach() { return this.mode === "creative" ? REACH_CREATIVE : REACH_SURVIVAL; }

  // ==================== 盔甲 ====================
  armorPoints() {
    let pts = 0;
    for (const s of this.armor) {
      if (s && ITEMS[s.id] && ITEMS[s.id].armor) pts += ITEMS[s.id].armor.defense;
    }
    return Math.min(ARMOR_POINTS_MAX, pts);
  }

  damageArmor(amount) {
    let broke = false;
    for (let i = 0; i < 4; i++) {
      const s = this.armor[i];
      if (!s || !ITEMS[s.id].armor) continue;
      s.dur = (s.dur === undefined ? ITEMS[s.id].armor.durability : s.dur) - amount;
      if (s.dur <= 0) { this.armor[i] = null; broke = true; }
    }
    if (broke) Sound.tone && Sound.tone({ freq: 320, dur: 0.25, gain: 0.22, type: "square", slide: -180 });
    if (G.ui) G.ui.updateHud();
  }

  // ==================== 伤害 / 生存 ====================
  hurt(dmg, fromPos) {
    if (this.dead || this.mode === "creative") return;
    if (this.hurtCooldown > 0) return;
    this.hurtCooldown = 0.5;
    // 盔甲减伤 (每点 4%, 上限 80%)
    const pts = this.armorPoints();
    if (pts > 0) {
      dmg = dmg * (1 - Math.min(0.8, pts * 0.04));
      this.damageArmor(1);
    }
    this.hp -= dmg;
    Sound.hurt();
    if (G.ui) { G.ui.damageFlash(); G.ui.shake(0.25); }
    if (fromPos) {
      const dx = this.pos.x - fromPos.x, dz = this.pos.z - fromPos.z;
      const d = Math.sqrt(dx * dx + dz * dz) || 1;
      this.vel.x += (dx / d) * 5; this.vel.z += (dz / d) * 5; this.vel.y += 3.5;
    }
    if (this.hp <= 0) this.die("你受到了致命伤害");
  }

  die(cause) {
    if (this.dead) return;
    this.dead = true;
    this.hp = 0;
    // 掉落全部物品
    for (let i = 0; i < 36; i++) {
      const s = this.inventory.slots[i];
      if (s) {
        this.entities.spawnDrop(this.pos.x, this.pos.y + 0.8, this.pos.z, s.id, s.count);
        this.inventory.slots[i] = null;
      }
    }
    // 掉落盔甲
    for (let i = 0; i < 4; i++) {
      const s = this.armor[i];
      if (s) {
        this.entities.spawnDrop(this.pos.x, this.pos.y + 0.8, this.pos.z, s.id, 1);
        this.armor[i] = null;
      }
    }
    if (G.ui) G.ui.showDeath(cause || "你死了");
    G.state = "dead";
  }

  respawn() {
    this.dead = false;
    this.hp = MAX_HEALTH;
    this.hunger = MAX_HUNGER;
    this.saturation = 5;
    this.vel = { x: 0, y: 0, z: 0 };
    if (this.spawnPoint) {
      this.pos = { ...this.spawnPoint };
    }
    this.fallStartY = null;
    G.state = "playing";
  }

  giveItem(id, count) {
    const remain = this.inventory.giveItem(id, count);
    if (G.ui) G.ui.refreshHotbar();
    return remain;
  }

  // ==================== 主更新 ====================
  update(dt, input) {
    if (this.dead) return;
    this.hurtCooldown -= dt;
    this.placeCd -= dt;
    this.attackCd -= dt;
    this.swimSoundCd -= dt;

    this.sneaking = input.keys["ShiftLeft"] && !this.flying;
    const wantSprint = (input.keys["ControlLeft"] || input.sprintToggle) &&
      (input.keys["KeyW"] || input.keys["KeyA"] || input.keys["KeyS"] || input.keys["KeyD"]);
    this.sprinting = wantSprint && !this.sneaking && (this.hunger > 6 || this.mode === "creative");

    this.inWater = entityInWater(this.world, this, 0.4);
    const wasEyesInWater = this.eyesInWater;
    this.eyesInWater = entityEyesInWater(this.world, this);

    // ===== 移动 =====
    let ix = 0, iz = 0;
    if (input.keys["KeyW"]) iz += 1;
    if (input.keys["KeyS"]) iz -= 1;
    if (input.keys["KeyA"]) ix -= 1;
    if (input.keys["KeyD"]) ix += 1;
    const len = Math.sqrt(ix * ix + iz * iz);
    if (len > 0) { ix /= len; iz /= len; }

    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    let wishX = fx * iz + rx * ix, wishZ = fz * iz + rz * ix;

    let speed;
    if (this.flying) speed = this.sprinting ? FLY_SPEED * 2 : FLY_SPEED;
    else if (this.inWater) speed = SWIM_SPEED;
    else if (this.sneaking) speed = SNEAK_SPEED;
    else if (this.sprinting) speed = SPRINT_SPEED;
    else speed = WALK_SPEED;

    // 加速度模型
    const accel = this.flying ? 6 : (this.onGround ? 11 : (this.inWater ? 4 : 2.2));
    this.vel.x += (wishX * speed - this.vel.x) * Math.min(1, accel * dt);
    this.vel.z += (wishZ * speed - this.vel.z) * Math.min(1, accel * dt);

    // 垂直
    if (this.flying) {
      let vy = 0;
      if (input.keys["Space"]) vy += FLY_SPEED;
      if (input.keys["ShiftLeft"]) vy -= FLY_SPEED;
      this.vel.y += (vy - this.vel.y) * Math.min(1, 8 * dt);
    } else if (this.inWater) {
      this.vel.y -= GRAVITY * 0.28 * dt;
      this.vel.y *= (1 - Math.min(1, 2.2 * dt));
      if (input.keys["Space"]) this.vel.y += 18 * dt;
      if (this.vel.y > 3.2) this.vel.y = 3.2;
      if (this.swimSoundCd <= 0 && Math.abs(this.vel.y) > 1.5) {
        this.swimSoundCd = 1.2; Sound.splash();
      }
    } else {
      if (input.keys["Space"] && this.onGround) {
        this.vel.y = JUMP_VELOCITY;
        this.addExhaustion(0.05);
      }
      this.vel.y -= GRAVITY * dt;
      if (this.vel.y < -60) this.vel.y = -60;
    }

    // ===== 碰撞 (分轴 + 潜行防坠) =====
    const groundedAtStart = this.onGround;
    const maxStep = 0.4;
    const maxV = Math.max(Math.abs(this.vel.x), Math.abs(this.vel.y), Math.abs(this.vel.z));
    const steps = Math.max(1, Math.ceil(maxV * dt / maxStep));
    const sdt = dt / steps;
    let landed = false;
    this.onGround = false;

    for (let s = 0; s < steps; s++) {
      // Y
      if (moveAxis(this.world, this, "y", this.vel.y * sdt)) {
        if (this.vel.y < 0) { this.onGround = true; landed = true; }
        this.vel.y = 0;
      }
      // X
      const oldX = this.pos.x;
      if (moveAxis(this.world, this, "x", this.vel.x * sdt)) this.vel.x = 0;
      if (this.sneaking && groundedAtStart && !this.flying && !this.groundBelow() && this.vel.y <= 0) {
        this.pos.x = oldX; this.vel.x = 0;
      }
      // Z
      const oldZ = this.pos.z;
      if (moveAxis(this.world, this, "z", this.vel.z * sdt)) this.vel.z = 0;
      if (this.sneaking && groundedAtStart && !this.flying && !this.groundBelow() && this.vel.y <= 0) {
        this.pos.z = oldZ; this.vel.z = 0;
      }
    }

    // 贴地检测
    if (!this.onGround && this.vel.y <= 0.01 && this.groundBelow(0.05)) this.onGround = true;
    if (this.onGround && this.flying && !input.keys["Space"]) this.flying = false;

    // 摔落伤害
    if (this.inWater || this.flying) {
      this.fallStartY = null;
    } else if (this.vel.y > 0 || !this.onGround) {
      if (this.fallStartY === null || this.pos.y > this.fallStartY) this.fallStartY = this.pos.y;
    }
    if (landed && this.fallStartY !== null) {
      const fallDist = this.fallStartY - this.pos.y;
      this.fallStartY = null;
      if (fallDist > 3.5 && this.mode === "survival") {
        this.hurtCooldown = 0;
        this.hurt(Math.floor(fallDist - 3), null);
        if (this.dead) G.ui && G.ui.deathCause && (G.player.deathCauseText = "你摔死了");
      }
    }

    // 虚空
    if (this.pos.y < -12) {
      if (this.mode === "creative") { this.pos.y = WORLD_HEIGHT - 4; this.vel.y = 0; }
      else { this.hurtCooldown = 0; this.hurt(4, null); this.die("你掉出了世界"); }
    }

    // ===== 脚步声 =====
    const hSpeed = Math.sqrt(this.vel.x ** 2 + this.vel.z ** 2);
    if (this.onGround && hSpeed > 0.5) {
      this.stepDist += hSpeed * dt;
      if (this.stepDist > 2.2) {
        this.stepDist = 0;
        const under = this.world.getBlock(this.pos.x, this.pos.y - 0.3, this.pos.z);
        if (under !== B.AIR) Sound.step(under);
      }
      this.bobPhase += hSpeed * dt * 1.6;
      this.addExhaustion(this.sprinting ? 0.02 * hSpeed * dt : 0.004 * hSpeed * dt);
    }

    // ===== 生存: 饥饿与生命 =====
    if (this.mode === "survival") {
      if (this.exhaustion >= 4) {
        this.exhaustion -= 4;
        if (this.saturation > 0) this.saturation = Math.max(0, this.saturation - 1);
        else this.hunger = Math.max(0, this.hunger - 1);
      }
      if (this.hunger >= 18 && this.hp < MAX_HEALTH) {
        this.regenTimer += dt;
        if (this.regenTimer >= 2.2) {
          this.regenTimer = 0;
          this.hp = Math.min(MAX_HEALTH, this.hp + 1);
          this.addExhaustion(3);
        }
      } else this.regenTimer = 0;
      if (this.hunger <= 0) {
        this.starveTimer += dt;
        if (this.starveTimer >= 4) {
          this.starveTimer = 0;
          if (this.hp > 1) { this.hp--; Sound.hurt(); G.ui && G.ui.damageFlash(); }
        }
      }
    }

    // ===== 交互 =====
    this.updateInteraction(dt, input);

    // ===== 手持动画状态 =====
    this.swingT = Math.min(1, this.swingT + dt * 4.5);
    this.equipT = Math.min(1, this.equipT + dt * 3.5);
  }

  groundBelow(offset = 0.06) {
    const hw = this.w / 2;
    const x0 = Math.floor(this.pos.x - hw), x1 = Math.floor(this.pos.x + hw - 1e-7);
    const z0 = Math.floor(this.pos.z - hw), z1 = Math.floor(this.pos.z + hw - 1e-7);
    const y = Math.floor(this.pos.y - offset);
    for (let x = x0; x <= x1; x++)
      for (let z = z0; z <= z1; z++)
        if (isSolid(this.world.getBlock(x, y, z))) return true;
    return false;
  }

  addExhaustion(v) { if (this.mode === "survival") this.exhaustion += v; }

  // ==================== 交互: 破坏/放置/攻击/食用 ====================
  updateInteraction(dt, input) {
    const eye = this.getEyePos();
    const dir = this.getLookDir();
    const reach = this.reach;

    // ---- 攻击实体 (左键边沿) ----
    if (input.mouse.left && !input.mouse.leftHandled) {
      input.mouse.leftHandled = true;
      const hit = this.entities.raypick(eye, dir, reach);
      const blockHit = raycastVoxel(this.world, eye.x, eye.y, eye.z, dir.x, dir.y, dir.z, reach);
      if (hit && (!blockHit || hit.dist < blockHit.dist)) {
        if (this.attackCd <= 0) {
          this.attackCd = 0.35;
          const held = this.inventory.getHeld();
          let dmg = 1;
          if (held && ITEMS[held.id].tool) dmg = ITEMS[held.id].tool.damage;
          hit.entity.hurt(dmg, this.pos);
          this.swingT = 0;
          this.addExhaustion(0.1);
          if (held && ITEMS[held.id].tool) this.inventory.damageHeld();
        }
      }
    }

    // ---- 破坏方块 (按住左键) ----
    if (input.mouse.left) {
      const hit = raycastVoxel(this.world, eye.x, eye.y, eye.z, dir.x, dir.y, dir.z, reach);
      if (hit) {
        const key = hit.x + "," + hit.y + "," + hit.z;
        if (this.breakTarget !== key) {
          this.breakTarget = key;
          this.breakProgress = 0;
        }
        const held = this.inventory.getHeld();
        if (this.mode === "creative") {
          if (this.attackCd <= 0) {
            this.attackCd = 0.25;
            this.breakBlock(hit.x, hit.y, hit.z, false);
            this.swingT = 0;
          }
        } else {
          const bt = breakTime(hit.id, held ? held.id : 0);
          this.breakProgress += dt / bt;
          this.breakSoundCd -= dt;
          if (this.breakSoundCd <= 0) {
            this.breakSoundCd = 0.22;
            Sound.blockSound(hit.id, "dig");
            this.entities.particles.burstBlock(hit.x + 0.5, hit.y, hit.z + 0.5, hit.id, 2);
          }
          if (this.breakProgress >= 1) {
            this.breakBlock(hit.x, hit.y, hit.z, true);
            this.breakTarget = null;
            this.breakProgress = 0;
            this.swingT = 0;
          }
        }
        this.swingT = Math.min(this.swingT, 0.6); // 持续摆动
      } else {
        this.breakTarget = null;
        this.breakProgress = 0;
      }
    } else {
      this.breakTarget = null;
      this.breakProgress = 0;
    }

    // ---- 右键: 使用/放置/吃 ----
    const held = this.inventory.getHeld();
    const heldItem = held ? ITEMS[held.id] : null;

    if (input.mouse.right) {
      // 进食 (按住)
      if (heldItem && heldItem.food && this.mode === "survival" && this.hunger < MAX_HUNGER) {
        this.eating = true;
        this.eatProgress += dt;
        if (Math.random() < dt * 6) {
          Sound.eat();
          this.entities.particles.burstSprite(
            eye.x + dir.x * 0.5, eye.y - 0.2 + dir.y * 0.5, eye.z + dir.z * 0.5,
            2, "#c86a3a", 0.1, 0.3, 1.2);
        }
        if (this.eatProgress >= 1.6) {
          this.eatProgress = 0;
          this.hunger = Math.min(MAX_HUNGER, this.hunger + heldItem.food);
          this.saturation = Math.min(this.hunger, this.saturation + heldItem.food * 0.6);
          this.inventory.consumeHeld();
          Sound.burp();
          if (G.ui) G.ui.refreshHotbar();
        }
      } else if (this.eating) {
        this.eating = false; this.eatProgress = 0;
      }

      // 放置 / 交互 (边沿 + 重复)
      if (!this.eating && this.placeCd <= 0) {
        input.mouse.rightHandled = true;
        this.placeCd = 0.24;
        this.tryUseOrPlace(eye, dir);
      }
    } else {
      this.eating = false;
      this.eatProgress = 0;
    }

    // 中键选取 (创造)
    if (input.mouse.middle && !input.mouse.middleHandled) {
      input.mouse.middleHandled = true;
      if (this.mode === "creative") {
        const hit = raycastVoxel(this.world, eye.x, eye.y, eye.z, dir.x, dir.y, dir.z, reach);
        if (hit) {
          this.inventory.slots[this.inventory.selected] = { id: hit.id, count: 64 };
          if (G.ui) G.ui.refreshHotbar();
        }
      }
    }
  }

  tryUseOrPlace(eye, dir) {
    const hit = raycastVoxel(this.world, eye.x, eye.y, eye.z, dir.x, dir.y, dir.z, this.reach);
    if (!hit) return;
    const held = this.inventory.getHeld();
    const heldItem = held ? ITEMS[held.id] : null;

    // ---- 食物/工具对作物与土地的使用 (优先于放置) ----
    // 骨粉: 催熟小麦
    if (heldItem && heldItem.boneMeal) {
      if (hit.id >= B.WHEAT_0 && hit.id < B.WHEAT_2) {
        this.world.setBlock(hit.x, hit.y, hit.z, hit.id + 1);
        this.world.rebuildAt(hit.x, hit.z);
        this.entities.particles.burstSprite(
          hit.x + 0.5, hit.y + 0.5, hit.z + 0.5, 14, "#8ad04a", 0.07, 0.28, 1.6);
        Sound.blockSound(hit.id + 1, "place");
        this.swingT = 0;
        if (this.mode === "survival") { this.inventory.consumeHeld(); if (G.ui) G.ui.refreshHotbar(); }
        return;
      }
    }
    // 锄头: 耕地
    if (heldItem && heldItem.tool && heldItem.tool.type === "hoe") {
      const t = hit.id;
      if ((t === B.GRASS || t === B.DIRT || t === B.SNOWY_GRASS) &&
        this.world.getBlock(hit.x, hit.y + 1, hit.z) === B.AIR) {
        this.world.setBlock(hit.x, hit.y, hit.z, B.FARMLAND);
        this.world.rebuildAt(hit.x, hit.z);
        this.entities.particles.burstBlock(hit.x + 0.5, hit.y + 1, hit.z + 0.5, B.DIRT, 8);
        Sound.blockSound(B.FARMLAND, "dig");
        this.swingT = 0;
        if (this.mode === "survival") this.inventory.damageHeld();
        return;
      }
    }
    // 种子: 播种在耕地上
    if (heldItem && heldItem.plantSeed !== undefined && hit.id === B.FARMLAND &&
      this.world.getBlock(hit.x, hit.y + 1, hit.z) === B.AIR) {
      this.world.setBlock(hit.x, hit.y + 1, hit.z, heldItem.plantSeed);
      this.world.rebuildAt(hit.x, hit.z);
      this.world.blockEntities.set(`${hit.x},${hit.y + 1},${hit.z}`, { type: "crop", t: 0 });
      Sound.blockSound(heldItem.plantSeed, "place");
      this.swingT = 0;
      if (this.mode === "survival") { this.inventory.consumeHeld(); if (G.ui) G.ui.refreshHotbar(); }
      return;
    }

    // ---- 方块交互 ----
    const block = BLOCKS[hit.id];
    if (block.interact) {
      this.swingT = 0;
      if (block.interact === "craft3") {
        G.ui.openScreen("table");
      } else if (block.interact === "furnace") {
        G.ui.openFurnace(hit.x, hit.y, hit.z);
      } else if (block.interact === "chest") {
        G.ui.openChest(hit.x, hit.y, hit.z);
      } else if (block.interact === "door") {
        this.toggleDoor(hit.x, hit.y, hit.z);
      } else if (block.interact === "bed") {
        this.trySleep(hit.x, hit.y, hit.z);
      } else if (block.interact === "tnt") {
        this.world.setBlock(hit.x, hit.y, hit.z, B.AIR);
        this.world.rebuildAt(hit.x, hit.z);
        this.entities.spawnTNT(hit.x, hit.y, hit.z, 4);
        Sound.fuse();
      }
      return;
    }

    // ---- 放置 ----
    if (!held || !heldItem || !heldItem.isBlock) return;
    const px = hit.x + hit.face[0], py = hit.y + hit.face[1], pz = hit.z + hit.face[2];
    if (py < 0 || py >= WORLD_HEIGHT) return;

    const existing = this.world.getBlock(px, py, pz);
    if (existing !== B.AIR && existing !== B.WATER && !BLOCKS[existing].plant) return;

    const placeBlock = BLOCKS[held.id];
    // 门: 需要两格空间
    if (held.id === B.OAK_DOOR) {
      if (py + 1 >= WORLD_HEIGHT) return;
      const upper = this.world.getBlock(px, py + 1, pz);
      if (upper !== B.AIR && !BLOCKS[upper].plant) return;
    }
    // 不能放进自己身体
    if (placeBlock.solid) {
      const hw = this.w / 2;
      if (px + 1 > this.pos.x - hw && px < this.pos.x + hw &&
        py + 1 > this.pos.y && py < this.pos.y + this.h &&
        pz + 1 > this.pos.z - hw && pz < this.pos.z + hw) return;
      // 不能放进生物
      for (const e of this.entities.list) {
        if (e.type !== "mob" || e.dead) continue;
        const ehw = e.w / 2;
        if (px + 1 > e.pos.x - ehw && px < e.pos.x + ehw &&
          py + 1 > e.pos.y && py < e.pos.y + e.h &&
          pz + 1 > e.pos.z - ehw && pz < e.pos.z + ehw) return;
      }
    }
    // 植物附着规则
    if (placeBlock.plant) {
      const below = this.world.getBlock(px, py - 1, pz);
      if (held.id === B.CACTUS) { if (below !== B.SAND && below !== B.CACTUS) return; }
      else if (held.id === B.DEAD_BUSH) { if (below !== B.SAND) return; }
      else if (held.id === B.TORCH) {
        const ok = isSolid(below) || isSolid(this.world.getBlock(px + 1, py, pz)) ||
          isSolid(this.world.getBlock(px - 1, py, pz)) ||
          isSolid(this.world.getBlock(px, py, pz + 1)) || isSolid(this.world.getBlock(px, py, pz - 1));
        if (!ok) return;
      } else {
        if (below !== B.GRASS && below !== B.DIRT && below !== B.SNOWY_GRASS) return;
      }
    }

    this.world.setBlock(px, py, pz, held.id);
    this.world.rebuildAt(px, pz);
    this.world.rebuildNeighbors(px, pz);
    Sound.place(held.id);
    this.swingT = 0;
    this.addExhaustion(0.005);

    // 放置朝向 (方块相对玩家的方位): 0北(-Z) 1东(+X) 2南(+Z) 3西(-X)
    const fdx = this.pos.x - (px + 0.5), fdz = this.pos.z - (pz + 0.5);
    const facing = Math.abs(fdx) > Math.abs(fdz) ? (fdx > 0 ? 1 : 3) : (fdz > 0 ? 2 : 0);

    if (held.id === B.FURNACE) {
      this.world.blockEntities.set(`${px},${py},${pz}`, newFurnaceState());
    } else if (held.id === B.CHEST) {
      this.world.blockEntities.set(`${px},${py},${pz}`, { type: "chest", items: new Array(27).fill(null), facing });
    } else if (held.id === B.BED) {
      this.world.blockEntities.set(`${px},${py},${pz}`, { type: "bed", facing });
    } else if (held.id === B.OAK_DOOR) {
      this.world.setBlock(px, py + 1, pz, B.OAK_DOOR_UPPER);
      this.world.blockEntities.set(`${px},${py},${pz}`, { type: "door", facing, half: 0 });
      this.world.blockEntities.set(`${px},${py + 1},${pz}`, { type: "door", facing, half: 1 });
    }

    if (this.mode === "survival") {
      this.inventory.consumeHeld();
      if (G.ui) G.ui.refreshHotbar();
    }
  }

  // ==================== 门 / 床 ====================
  toggleDoor(x, y, z) {
    const id = this.world.getBlock(x, y, z);
    if (!isDoorBlock(id)) return;
    const lowerY = BLOCKS[id].doorHalf === 0 ? y : y - 1;
    const lowerId = this.world.getBlock(x, lowerY, z);
    if (!isDoorBlock(lowerId) || BLOCKS[lowerId].doorHalf !== 0) return;
    const open = !BLOCKS[lowerId].doorOpen;
    this.world.setBlock(x, lowerY, z, open ? B.OAK_DOOR_OPEN : B.OAK_DOOR);
    this.world.setBlock(x, lowerY + 1, z, open ? B.OAK_DOOR_UPPER_OPEN : B.OAK_DOOR_UPPER);
    this.world.rebuildAt(x, z);
    if (open) Sound.doorOpen(); else Sound.doorClose();
  }

  trySleep(x, y, z) {
    const dayT = (G.gameTime / DAY_LENGTH) % 1;
    const isNight = dayT > 0.52 || dayT < 0.005;
    const storm = G.sky && G.sky.isThundering();
    if (!isNight && !storm) {
      G.ui.addChat("你只能在夜晚或雷雨天睡觉");
      return;
    }
    // 床边重生点
    this.spawnPoint = { x: x + 0.5, y: y + 0.75, z: z + 0.5 };
    G.ui.showSleepFade(() => {
      // 跳到次日清晨
      G.gameTime = (Math.floor(G.gameTime / DAY_LENGTH) + 1) * DAY_LENGTH;
      if (G.sky && G.sky.clearWeather) G.sky.clearWeather();
      G.ui.addChat("你睡了一觉, 早上好!");
    });
  }

  breakBlock(x, y, z, withDrops) {
    const id = this.world.getBlock(x, y, z);
    if (id === B.AIR || BLOCKS[id].hardness < 0) return;
    const held = this.inventory.getHeld();

    // 箱子: 先取出内容物
    let chestItems = null;
    if (id === B.CHEST) {
      const be = this.world.blockEntities.get(`${x},${y},${z}`);
      if (be && be.items) chestItems = be.items.slice();
    }

    this.world.setBlock(x, y, z, B.AIR);
    this.world.rebuildAt(x, z);
    this.world.rebuildNeighbors(x, z);

    // 门: 联动移除另一半
    if (isDoorBlock(id)) {
      const otherY = BLOCKS[id].doorHalf === 0 ? y + 1 : y - 1;
      if (isDoorBlock(this.world.getBlock(x, otherY, z))) {
        this.world.setBlock(x, otherY, z, B.AIR);
        this.world.rebuildAt(x, z);
      }
    }

    // 上方依附方块塌落
    const above = this.world.getBlock(x, y + 1, z);
    if (above !== B.AIR && BLOCKS[above].plant) {
      this.world.setBlock(x, y + 1, z, B.AIR);
      this.world.rebuildAt(x, z);
      if (withDrops) {
        for (const d of getDrops(above, held ? held.id : 0))
          this.entities.spawnDrop(x + 0.5, y + 1.3, z + 0.5, d.id, d.count);
      }
    }
    // 上方是门上半: 一并移除
    if (isDoorBlock(this.world.getBlock(x, y + 1, z))) {
      this.world.setBlock(x, y + 1, z, B.AIR);
      this.world.rebuildAt(x, z);
      if (withDrops) this.entities.spawnDrop(x + 0.5, y + 1.3, z + 0.5, B.OAK_DOOR, 1);
    }

    Sound.breakBlock(id);
    this.entities.particles.burstBlock(x + 0.5, y, z + 0.5, id, 14);
    this.addExhaustion(0.03);

    if (withDrops) {
      const drops = getDrops(id, held ? held.id : 0);
      for (const d of drops) {
        this.entities.spawnDrop(x + 0.5, y + 0.3, z + 0.5, d.id, d.count);
      }
      // 箱子内容物
      if (chestItems) {
        for (const s of chestItems) {
          if (s) this.entities.spawnDrop(x + 0.5, y + 0.5, z + 0.5, s.id, s.count);
        }
      }
      // 工具磨损
      if (held && ITEMS[held.id].tool) {
        if (this.inventory.damageHeld()) Sound.tone && Sound.tone({ freq: 500, dur: 0.15, gain: 0.2, type: "square", slide: -200 });
      }
      if (G.ui) G.ui.refreshHotbar();
    }
  }

  dropHeld(throwItem = true) {
    const s = this.inventory.getHeld();
    if (!s) return;
    const count = 1;
    const dir = this.getLookDir();
    const vel = throwItem ? { x: dir.x * 6, y: dir.y * 6 + 2, z: dir.z * 6 } : null;
    this.entities.spawnDrop(this.pos.x, this.pos.y + 1.3, this.pos.z, s.id, count, vel, 1.2);
    s.count -= count;
    if (s.count <= 0) this.inventory.slots[this.inventory.selected] = null;
    if (G.ui) G.ui.refreshHotbar();
  }
}
