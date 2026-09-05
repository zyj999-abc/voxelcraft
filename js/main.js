/* ============================================================
 * VoxelCraft — 主入口: 初始化 / 游戏循环 / 输入 / 相机 / 手持渲染
 * ============================================================ */
"use strict";

/* ==================== 输入状态 ==================== */
const Input = {
  keys: Object.create(null),
  mouse: { left: false, right: false, middle: false, leftHandled: true, rightHandled: true, middleHandled: true },
  sprintToggle: false,
};

const EMPTY_INPUT = {
  keys: Object.create(null),
  mouse: { left: false, right: false, middle: false, leftHandled: true, rightHandled: true, middleHandled: true },
  sprintToggle: false,
};

const MOUSE_SENS = 0.0024;
let expectUnlock = false;      // 打开界面主动解锁, 不触发暂停
let lastSpaceTap = 0;
let lastWTap = 0;
let debugVisible = false;

// 手持/选框/破坏覆盖
let heldGroup = null;
let selBox = null;
let breakMesh = null;
let breakMat = null;
let breakStage = -1;
let crackTexs = [];
let heldPlaneMat = null;       // 当前手持平面材质(需随昼夜着色)

let autosaveTimer = 0;
const fps = { frames: 0, t: 0, value: 0 };

/* ==================== 启动 ==================== */
window.addEventListener("DOMContentLoaded", boot);

function boot() {
  try {
    initTextures();
  } catch (e) {
    console.error("纹理初始化失败", e);
    alert("资源初始化失败: " + e.message);
    return;
  }

  // 存档 & 设置
  G.save = new SaveManager();
  G.save.loadSettings();

  // UI
  G.ui = new UI();
  G.ui.init();

  // 渲染器
  const container = document.getElementById("game-container");
  try {
    G.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
  } catch (e) {
    alert("无法创建 WebGL 渲染器, 请更换浏览器");
    return;
  }
  G.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  G.renderer.setSize(window.innerWidth, window.innerHeight);
  G.renderer.autoClear = false;
  container.insertBefore(G.renderer.domElement, container.firstChild);

  G.scene = new THREE.Scene();
  G.camera = new THREE.PerspectiveCamera(G.settings.fov, window.innerWidth / window.innerHeight, 0.08, 800);
  G.camera.rotation.order = "YXZ";
  G.scene.add(G.camera);

  setupWorldHelpers();
  bindGameInput();
  wireUICallbacks();

  window.addEventListener("resize", () => {
    G.camera.aspect = window.innerWidth / window.innerHeight;
    G.camera.updateProjectionMatrix();
    G.renderer.setSize(window.innerWidth, window.innerHeight);
  });

  G.ui.showTitle();
  requestAnimationFrame(loop);
}

/* ==================== 选框 / 破坏覆盖 / 手持 ==================== */
function setupWorldHelpers() {
  // 方块选中框
  const boxGeo = new THREE.BoxGeometry(1.002, 1.002, 1.002);
  selBox = new THREE.LineSegments(
    new THREE.EdgesGeometry(boxGeo),
    new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.6 })
  );
  selBox.visible = false;
  selBox.renderOrder = 5;
  G.scene.add(selBox);

  // 破坏裂纹覆盖
  for (let i = 0; i < 10; i++) {
    const tex = new THREE.CanvasTexture(getTileCanvas("crack_" + i));
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    crackTexs.push(tex);
  }
  breakMat = new THREE.MeshBasicMaterial({
    map: crackTexs[0], transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  breakMesh = new THREE.Mesh(new THREE.BoxGeometry(1.004, 1.004, 1.004), breakMat);
  breakMesh.visible = false;
  breakMesh.renderOrder = 4;
  G.scene.add(breakMesh);

  // 手持物品组 (挂在相机上, 单独 pass 渲染)
  heldGroup = new THREE.Group();
  heldGroup.layers.set(1);
  G.camera.add(heldGroup);
}

function clearHeldMesh() {
  while (heldGroup.children.length) {
    const c = heldGroup.children.pop();
    if (c.userData.ownTex) {
      if (c.material.map) c.material.map.dispose();
      c.material.dispose();
      c.geometry.dispose();
    }
  }
  heldPlaneMat = null;
}

function buildHeldMesh() {
  if (!G.player) return;
  clearHeldMesh();
  const held = G.player.inventory.getHeld();
  const item = held ? ITEMS[held.id] : null;

  if (item && item.isBlock && !BLOCKS[held.id].plant) {
    // 方块
    const mesh = makeMiniBlock(held.id, 0.42);
    mesh.layers.set(1);
    mesh.position.set(0.03, -0.02, 0);
    mesh.rotation.set(0.12, -Math.PI / 5, 0.05);
    heldGroup.add(mesh);
  } else if (item) {
    // 物品(工具/食物) 平面
    const tex = new THREE.CanvasTexture(ICONS[held.id]);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    const mat = new THREE.MeshBasicMaterial({
      map: tex, transparent: true, alphaTest: 0.15, side: THREE.DoubleSide,
    });
    heldPlaneMat = mat;
    if (G.sky) G.sky.registerMobMaterial(mat);
    const geo = new THREE.PlaneGeometry(0.52, 0.52);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.layers.set(1);
    mesh.userData.ownTex = true;
    mesh.position.set(0.05, 0, 0);
    mesh.rotation.set(0.1, -0.5, 0.12);
    heldGroup.add(mesh);
  } else {
    // 手臂
    const mat = new THREE.MeshBasicMaterial({ color: 0xe8b08a });
    if (G.sky) G.sky.registerMobMaterial(mat);
    const geo = new THREE.BoxGeometry(0.13, 0.13, 0.52);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.layers.set(1);
    mesh.userData.ownTex = true;
    mesh.position.set(0.06, -0.12, 0.12);
    mesh.rotation.set(0.5, -0.25, 0.2);
    heldGroup.add(mesh);
  }
  G.player.equipT = 0;
}

function updateHeldItem(dt) {
  const p = G.player;
  if (!p) return;
  const held = p.inventory.getHeld();
  const id = held ? held.id : -1;
  if (id !== p.heldItemId) {
    p.heldItemId = id;
    buildHeldMesh();
  }

  const sw = Math.sin(clamp(1 - p.swingT, 0, 1) * Math.PI);   // 挥动 0→1→0
  const eq = clamp(1 - p.equipT, 0, 1);                        // 切换装备下沉
  let eatX = 0, eatY = 0;
  if (p.eating) {
    eatY = Math.sin(performance.now() * 0.028) * 0.02;
    eatX = Math.cos(performance.now() * 0.02) * 0.008;
  }
  heldGroup.position.set(
    0.46 - sw * 0.26 + eatX,
    -0.44 - eq * 0.62 + sw * 0.1 + eatY,
    -0.74 + sw * 0.12
  );
  heldGroup.rotation.set(
    -sw * 1.05 - eq * 0.7,
    0.28 - sw * 0.45,
    sw * 0.3
  );
}

/* ==================== UI 回调 ==================== */
function wireUICallbacks() {
  G.ui.onStartWorld = (meta, isNew) => startWorld(meta, isNew);
  G.ui.onResume = () => resumeGame();
  G.ui.onRespawn = () => {
    const p = G.player;
    if (!p) return;
    p.respawn();
    p.air = 10;
    p.deathCauseText = null;
    G.ui.hideAllScreens();
    G.ui._hud.hp = -1; G.ui._hud.hunger = -1; G.ui._hud.air = -1;
    G.ui.updateHud();
    lockPointer();
  };
  G.ui.onQuitToTitle = () => quitToTitle();
  G.ui.onScreenOpen = () => {
    expectUnlock = true;
    Input.keys = Object.create(null);
    Input.mouse.left = Input.mouse.right = Input.mouse.middle = false;
    Input.mouse.leftHandled = Input.mouse.rightHandled = Input.mouse.middleHandled = true;
    if (document.pointerLockElement) document.exitPointerLock();
  };
  G.ui.onScreenClose = () => {
    if (G.state === "playing" && !G.paused) lockPointer();
  };
}

/* ==================== 世界生命周期 ==================== */
function disposeWorld() {
  if (G.world) {
    for (const [, c] of G.world.chunks) G.world.disposeChunkMesh(c);
  }
  if (G.entities) G.entities.clearAll();
  if (G.sky) {
    G.scene.remove(G.sky.pivot);
    if (G.sky.cloudMesh) {
      G.scene.remove(G.sky.cloudMesh);
      G.sky.cloudMesh.geometry.dispose();
    }
  }
  clearHeldMesh();
  if (selBox) selBox.visible = false;
  if (breakMesh) breakMesh.visible = false;
  G.world = null; G.sky = null; G.entities = null; G.player = null;
  if (G.renderer) G.renderer.setClearColor(0x000000, 1);
}

function findSpawn() {
  const gen = G.world.gen;
  for (let r = 0; r < 32; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const x = dx * 6, z = dz * 6;
        const h = gen.heightAt(x, z);
        if (h <= SEA_LEVEL + 1) continue;
        const biome = gen.biomeAt(x, z, h);
        if (biome === BIOME.OCEAN || biome === BIOME.BEACH) continue;
        return { x, z };
      }
    }
  }
  return { x: 0, z: 0 };
}

async function startWorld(meta, isNew) {
  if (G.state === "loading") return;
  G.state = "loading";
  G.paused = false;

  if (!isNew) {
    meta = G.save.loadWorldData(meta.id) || meta;
  }

  G.ui.closeChat();
  G.ui.closeScreen(true);
  G.ui.hideHud();
  G.ui.showLoading(`正在加载世界 " ${meta.name} "`);

  disposeWorld();

  const seed = hashSeed(meta.seedStr);
  G.seedStr = meta.seedStr;
  G.mode = meta.mode || "survival";
  G.worldMeta = meta;
  G.gameTime = meta.gameTime || DAY_LENGTH * 0.02;

  G.world = new World(seed, G.scene);
  G.sky = new Sky(G.scene, seed);
  if (G.sky.cloudMat) G.sky.cloudMat.fog = false;
  G.entities = new EntityManager(G.scene, G.world);
  G.player = new Player(G.world, G.entities);
  G.player.mode = G.mode;

  // 恢复存档数据
  if (!isNew && meta.edits) {
    for (const k in meta.edits) {
      const m = new Map();
      for (const pair of meta.edits[k]) m.set(pair[0], pair[1]);
      G.world.edits.set(k, m);
    }
    for (const k in (meta.blockEntities || {})) {
      G.world.blockEntities.set(k, meta.blockEntities[k]);
    }
    if (meta.gameTime) G.gameTime = meta.gameTime;
  }

  // 玩家状态
  let spawnXZ = null;
  if (!isNew && meta.player && meta.player.pos) {
    const sp = meta.player;
    G.player.pos = { ...sp.pos };
    G.player.yaw = sp.yaw || 0;
    G.player.pitch = sp.pitch || 0;
    G.player.hp = sp.hp ?? MAX_HEALTH;
    G.player.hunger = sp.hunger ?? MAX_HUNGER;
    G.player.saturation = sp.saturation ?? 5;
    if (sp.spawnPoint) G.player.spawnPoint = { ...sp.spawnPoint };
    G.player.inventory = Inventory.deserialize(sp.inventory);
    G.player.inventory.selected = sp.selected || 0;
    G.player.flying = !!sp.flying && G.mode === "creative";
    G.player.air = sp.air ?? 10;
  } else {
    spawnXZ = findSpawn();
    G.player.pos = { x: spawnXZ.x + 0.5, y: 72, z: spawnXZ.z + 0.5 };
    G.player.spawnPoint = null;
    G.player.air = 10;
  }

  const px = G.player.pos.x, pz = G.player.pos.z;
  const eye = G.player.getEyePos();
  G.camera.position.set(eye.x, eye.y, eye.z);

  G.ui.refreshHotbar();
  G.ui.updateHud();

  // 分帧生成区块
  await loadChunksAround(px, pz);

  // 新世界: 落到地表
  if (spawnXZ) {
    const sy = G.world.getSurfaceY(Math.floor(px), Math.floor(pz));
    G.player.pos.y = sy + 1.02;
    G.player.spawnPoint = { ...G.player.pos };
    const e2 = G.player.getEyePos();
    G.camera.position.set(e2.x, e2.y, e2.z);
  }

  buildHeldMesh();
  G.player.heldItemId = G.player.inventory.getHeld() ? G.player.inventory.getHeld().id : -1;

  autosaveTimer = 0;
  G.state = "playing";
  G.ui.hideAllScreens();
  G.ui.showHud();
  G.ui.refreshHotbar();
  G.ui.showHeldName();
  G.ui.addChat(`欢迎来到 ${meta.name}! 按 T 聊天, /help 查看命令`);

  Sound.init();
  Sound.resume();
  Sound.scheduleMusic(8000);
  lockPointer();
}

function loadChunksAround(px, pz) {
  return new Promise((resolve) => {
    const tips = [
      "正在铺设基岩…", "正在雕刻洞穴…", "正在种植树木…",
      "正在埋藏矿石…", "正在生成生物…", "即将完成…",
    ];
    let frame = 0;
    const step = () => {
      if (G.state !== "loading") { resolve(); return; }
      G.world.update(px, pz, 8, 12);
      const { ready, total } = G.world.countReadyMeshes(px, pz);
      const p = total ? ready / total : 0;
      G.ui.setLoadingProgress(Math.min(0.99, p), tips[Math.min(tips.length - 1, (frame / 8) | 0)] + ` (${ready}/${total})`);
      frame++;
      if (p >= 0.95 || frame > 900) { resolve(); return; }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

function quitToTitle() {
  if (G.state === "playing" || G.state === "dead") G.save.saveGame();
  expectUnlock = true;
  if (document.pointerLockElement) document.exitPointerLock();
  G.state = "title";
  G.paused = false;
  disposeWorld();
  G.ui.showTitle();
}

/* ==================== 暂停 ==================== */
function pauseGame() {
  if (G.state !== "playing" || G.paused) return;
  G.paused = true;
  Input.keys = Object.create(null);
  Input.mouse.left = Input.mouse.right = Input.mouse.middle = false;
  G.ui.closeChat();
  G.ui.showPause();
}

function resumeGame() {
  if (G.state !== "playing") return;
  G.paused = false;
  G.ui.hideAllScreens();
  lockPointer();
}

function lockPointer() {
  if (!G.renderer || G.state !== "playing" || G.paused) return;
  if (G.ui.hasScreenOpen() || G.ui.isChatOpen()) return;
  const el = G.renderer.domElement;
  try {
    const r = el.requestPointerLock();
    if (r && r.catch) r.catch(() => { });
  } catch (e) { /* 浏览器限制, 等待用户点击 */ }
}

/* ==================== 输入 ==================== */
function bindGameInput() {
  const canvas = () => G.renderer.domElement;

  document.getElementById("game-container").addEventListener("mousedown", (e) => {
    Sound.init(); Sound.resume();
    if (G.state !== "playing" || G.paused) return;
    if (G.ui.hasScreenOpen() || G.ui.isChatOpen()) return;
    if (document.pointerLockElement !== canvas()) {
      lockPointer();
      return;
    }
    if (e.button === 0) { Input.mouse.left = true; Input.mouse.leftHandled = false; }
    else if (e.button === 2) { Input.mouse.right = true; Input.mouse.rightHandled = false; }
    else if (e.button === 1) { Input.mouse.middle = true; Input.mouse.middleHandled = false; }
  });

  document.addEventListener("mouseup", (e) => {
    if (e.button === 0) { Input.mouse.left = false; Input.mouse.leftHandled = true; }
    else if (e.button === 2) { Input.mouse.right = false; Input.mouse.rightHandled = true; }
    else if (e.button === 1) { Input.mouse.middle = false; Input.mouse.middleHandled = true; }
  });

  document.addEventListener("pointerlockchange", () => {
    const locked = document.pointerLockElement === canvas();
    if (!locked && G.state === "playing" && !G.paused &&
      !G.ui.hasScreenOpen() && !G.ui.isChatOpen() && !expectUnlock) {
      pauseGame();
    }
    expectUnlock = false;
  });

  document.addEventListener("mousemove", (e) => {
    if (document.pointerLockElement === canvas() && G.player && G.state === "playing" && !G.paused) {
      G.player.yaw -= e.movementX * MOUSE_SENS;
      G.player.pitch = clamp(G.player.pitch - e.movementY * MOUSE_SENS,
        -Math.PI / 2 + 0.01, Math.PI / 2 - 0.01);
    }
  });

  document.addEventListener("contextmenu", (e) => e.preventDefault());

  document.addEventListener("wheel", (e) => {
    if (G.state !== "playing" || G.paused || G.ui.hasScreenOpen() || G.ui.isChatOpen()) return;
    const d = e.deltaY > 0 ? 1 : -1;
    G.ui.setHotbarSelected((G.player.inventory.selected + d + 9) % 9);
  }, { passive: true });

  document.addEventListener("keydown", onKeyDown);
  document.addEventListener("keyup", (e) => {
    Input.keys[e.code] = false;
    if (e.code === "KeyW") Input.sprintToggle = false;
  });

  window.addEventListener("beforeunload", () => {
    if (G.state === "playing" || G.state === "dead") G.save.saveGame();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden && G.state === "playing" && !G.paused) pauseGame();
  });
}

function onKeyDown(e) {
  // 聊天输入时全部交给输入框
  if (G.ui.isChatOpen()) return;

  if (e.code === "F3") {
    e.preventDefault();
    debugVisible = !debugVisible;
    G.ui.setDebugVisible(debugVisible);
    return;
  }
  if (e.code === "F11") {
    e.preventDefault();
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(() => { });
    return;
  }

  // 暂停中: ESC 恢复游戏 / 设置界面返回
  if (G.paused) {
    if (e.code === "Escape" && G.state === "playing") {
      const st = document.getElementById("settings-screen");
      if (st && !st.classList.contains("hidden")) {
        G.save.saveSettings();
        if (G.ui.settingsFrom === "pause") G.ui.showScreen("pause-screen");
        else G.ui.showTitle();
      } else {
        resumeGame();
      }
    }
    return;
  }

  if (G.state !== "playing") return;

  // ESC
  if (e.code === "Escape") {
    if (G.ui.openName) { G.ui.closeScreen(); return; }
    pauseGame();
    return;
  }

  // 界面打开时: E 关闭
  if (G.ui.hasScreenOpen()) {
    if (e.code === "KeyE") { e.preventDefault(); G.ui.closeScreen(); }
    return;
  }

  Input.keys[e.code] = true;

  // 数字键切换快捷栏
  if (/^Digit[1-9]$/.test(e.code)) {
    G.ui.setHotbarSelected(parseInt(e.code[5]) - 1);
    return;
  }

  if (e.code === "KeyE") {
    e.preventDefault();
    G.ui.openScreen("inventory");
    return;
  }

  if (e.code === "KeyQ") {
    if (e.ctrlKey) dropStack();
    else G.player.dropHeld(true);
    return;
  }

  if (e.code === "KeyT") {
    e.preventDefault();
    Input.keys = Object.create(null);
    G.ui.openChat("");
    return;
  }
  if (e.code === "Slash") {
    e.preventDefault();
    Input.keys = Object.create(null);
    G.ui.openChat("/");
    return;
  }

  // 双击空格切换飞行(创造)
  if (e.code === "Space" && !e.repeat) {
    const now = performance.now();
    if (G.player.mode === "creative" && now - lastSpaceTap < 280 && now - lastSpaceTap > 30) {
      G.player.flying = !G.player.flying;
      if (!G.player.flying) G.player.vel.y = Math.min(G.player.vel.y, 0);
      lastSpaceTap = 0;
    } else {
      lastSpaceTap = now;
    }
  }

  // 双击W疾跑
  if (e.code === "KeyW" && !e.repeat) {
    const now = performance.now();
    if (now - lastWTap < 280 && now - lastWTap > 30) Input.sprintToggle = true;
    lastWTap = now;
  }
}

function dropStack() {
  const inv = G.player.inventory;
  const s = inv.getHeld();
  if (!s) return;
  const dir = G.player.getLookDir();
  G.player.entities.spawnDrop(
    G.player.pos.x, G.player.pos.y + 1.3, G.player.pos.z,
    s.id, s.count,
    { x: dir.x * 6, y: dir.y * 6 + 2, z: dir.z * 6 }, 1.2
  );
  inv.slots[inv.selected] = null;
  G.ui.refreshHotbar();
}

/* ==================== 氧气 / 溺水 ==================== */
function updateAirAndDrowning(dt) {
  const p = G.player;
  if (!p || p.dead) return;
  if (p.mode === "creative") { p.air = 10; return; }

  if (p.eyesInWater) {
    p.air = (p.air === undefined ? 10 : p.air) - dt / 1.5;
    if (p.air <= 0) {
      p.air = 0;
      p.drownTimer = (p.drownTimer || 0) + dt;
      if (p.drownTimer >= 1) {
        p.drownTimer = 0;
        p.hurtCooldown = 0;
        p.deathCauseText = "你淹死了";
        p.hurt(2, null);
      }
    }
  } else {
    p.air = Math.min(10, (p.air === undefined ? 10 : p.air) + dt * 3);
    p.drownTimer = 0;
  }
}

/* ==================== 相机 / 天空 ==================== */
function updateCamera(dt) {
  const p = G.player;
  if (!p) return;
  const eye = p.getEyePos();

  // 视角摇晃
  let bx = 0, by = 0;
  if (G.settings.bobbing === "on" && p.onGround && !p.flying) {
    const amt = Math.min(1, Math.hypot(p.vel.x, p.vel.z) / WALK_SPEED);
    bx = Math.sin(p.bobPhase) * 0.05 * amt;
    by = -Math.abs(Math.cos(p.bobPhase)) * 0.055 * amt;
  }

  // 震屏
  let sx = 0, sy = 0;
  const shakeAmt = G.ui.consumeShake(dt);
  if (shakeAmt > 0) {
    sx = (Math.random() - 0.5) * 2 * shakeAmt;
    sy = (Math.random() - 0.5) * 2 * shakeAmt;
  }

  G.camera.position.set(eye.x + bx + sx, eye.y + by + sy, eye.z);
  G.camera.rotation.set(p.pitch, p.yaw, 0);

  // 疾跑 FOV
  const targetFov = G.settings.fov + (p.sprinting ? 8 : 0) + (p.flying && p.sprinting ? 4 : 0);
  if (Math.abs(G.camera.fov - targetFov) > 0.15) {
    G.camera.fov = lerp(G.camera.fov, targetFov, Math.min(1, dt * 9));
    G.camera.updateProjectionMatrix();
  }

  G.ui.setUnderwater(p.eyesInWater);
  if (G.sky) G.sky.setUnderwater(p.eyesInWater);
}

function updateSkyAndLight(dt) {
  if (!G.sky || !G.world) return;
  const light = G.sky.update(dt, G.gameTime, G.camera.position, G.settings.renderDistance);
  G.world.setDaylight(light);
  G.sky.applyMobLighting(light);
}

/* ==================== 选框 / 破坏进度 ==================== */
function updateSelectionAndBreak() {
  const p = G.player;
  if (!p || G.state !== "playing" || p.dead || G.ui.hasScreenOpen() || G.ui.isChatOpen() || G.paused) {
    selBox.visible = false;
    breakMesh.visible = false;
    return;
  }
  const eye = p.getEyePos();
  const dir = p.getLookDir();
  const hit = raycastVoxel(G.world, eye.x, eye.y, eye.z, dir.x, dir.y, dir.z, p.reach);
  if (hit) {
    selBox.visible = true;
    selBox.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
    const key = hit.x + "," + hit.y + "," + hit.z;
    if (p.breakTarget === key && p.breakProgress > 0.02) {
      const stage = Math.min(9, Math.floor(p.breakProgress * 10));
      breakMesh.visible = true;
      breakMesh.position.copy(selBox.position);
      if (breakStage !== stage) {
        breakStage = stage;
        breakMat.map = crackTexs[stage];
      }
    } else {
      breakMesh.visible = false;
    }
  } else {
    selBox.visible = false;
    breakMesh.visible = false;
  }
}

/* ==================== 调试信息 ==================== */
const DIR_NAMES = ["北", "西北", "西", "西南", "南", "东南", "东", "东北"];
function facingName(yaw) {
  // yaw=0 → 北(-Z), 逆时针增大
  let a = ((-yaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2); // 0=北
  const idx = Math.round(a / (Math.PI / 4)) % 8;
  return DIR_NAMES[idx];
}

let debugTick = 0;
function updateDebugInfo(dt) {
  if (!debugVisible || !G.player) return;
  debugTick -= dt;
  if (debugTick > 0) return;
  debugTick = 0.25;

  const p = G.player;
  const px = Math.floor(p.pos.x), py = Math.floor(p.pos.y), pz = Math.floor(p.pos.z);
  const biome = BIOME_NAMES[G.world.gen.biomeAt(px, pz)];
  const dayT = (G.gameTime / DAY_LENGTH) % 1;
  const hh = Math.floor((6 + dayT * 24) % 24);
  const mm = Math.floor(((6 + dayT * 24) % 1) * 60);
  const chunkCount = G.world.chunks.size;
  let meshed = 0;
  for (const [, c] of G.world.chunks) if (c.meshes.length) meshed++;
  let mobCount = 0, dropCount = 0;
  for (const e of G.entities.list) {
    if (e.type === "mob") mobCount++;
    else if (e.type === "drop") dropCount++;
  }

  const lines = [
    `VoxelCraft 1.0 (${fps.value} fps)`,
    `XYZ: ${p.pos.x.toFixed(2)} / ${p.pos.y.toFixed(2)} / ${p.pos.z.toFixed(2)}`,
    `方块: ${px} ${py} ${pz}   区块: ${px >> 4} ${pz >> 4}`,
    `朝向: ${facingName(p.yaw)} (yaw ${(p.yaw / DEG).toFixed(1)}° pitch ${(p.pitch / DEG).toFixed(1)}°)`,
    `生物群系: ${biome}`,
    `时间: ${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}  模式: ${p.mode === "creative" ? "创造" : "生存"}`,
    `种子: ${G.seedStr}`,
    `区块: ${chunkCount} 已建网格 ${meshed}  绘制调用: ${G.renderer.info.render.calls}`,
    `实体: 生物 ${mobCount} 掉落物 ${dropCount} 三角形 ${G.renderer.info.render.triangles}`,
    `手持: ${p.inventory.getHeld() ? ITEMS[p.inventory.getHeld().id].name : "空手"}`,
  ];
  G.ui.updateDebug(lines.join("\n"));
}

/* ==================== 主循环 ==================== */
let lastTime = performance.now();

function loop() {
  requestAnimationFrame(loop);
  const now = performance.now();
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;

  // FPS 统计
  fps.frames++; fps.t += dt;
  if (fps.t >= 0.5) {
    fps.value = Math.round(fps.frames / fps.t);
    fps.frames = 0; fps.t = 0;
  }

  if (G.state === "title" || !G.world) {
    if (G.renderer) {
      G.renderer.clear();
      G.renderer.render(G.scene, G.camera);
    }
    return;
  }

  const active = (G.state === "playing" || G.state === "dead") && !G.paused;

  if (active) {
    G.gameTime += dt;
    const blocked = G.ui.hasScreenOpen() || G.ui.isChatOpen();
    G.player.update(dt, blocked ? EMPTY_INPUT : Input);
    updateAirAndDrowning(dt);
    G.world.update(G.player.pos.x, G.player.pos.z);
    G.entities.update(dt, G.player);
    tickFurnace(G.world, dt);
    G.ui.updateHud();
    G.ui.tickFurnaceLive();

    // 自动存档
    autosaveTimer += dt;
    if (autosaveTimer >= SAVE_AUTOSAVE_INTERVAL) {
      autosaveTimer = 0;
      G.save.saveGame();
    }
  }

  if (G.state === "playing" || G.state === "dead") {
    updateCamera(active ? dt : 0);
    updateSkyAndLight(dt);
    updateSelectionAndBreak();
    updateHeldItem(dt);
    updateDebugInfo(dt);
  }

  // 渲染: 世界(层0) + 手持(层1, 独立深度)
  G.renderer.clear();
  G.camera.layers.set(0);
  G.renderer.render(G.scene, G.camera);
  if (G.state === "playing" && heldGroup && heldGroup.children.length) {
    G.renderer.clearDepth();
    G.camera.layers.set(1);
    G.renderer.render(G.scene, G.camera);
    G.camera.layers.set(0);
  }
}
