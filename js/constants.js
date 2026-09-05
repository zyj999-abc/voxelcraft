/* ============================================================
 * VoxelCraft — 全局常量与配置
 * ============================================================ */
"use strict";

const CHUNK_SIZE = 16;            // 区块水平尺寸
const WORLD_HEIGHT = 96;          // 世界高度
const SEA_LEVEL = 32;             // 海平面
const GRAVITY = 30.0;             // 重力 (方块/秒²)
const JUMP_VELOCITY = 8.6;        // 跳跃初速度 (约1.25格高)
const WALK_SPEED = 4.317;         // 行走速度 (MC 相同)
const SPRINT_SPEED = 5.612;       // 疾跑速度
const SNEAK_SPEED = 1.31;         // 潜行速度
const FLY_SPEED = 10.9;           // 飞行速度
const SWIM_SPEED = 2.2;           // 游泳速度
const PLAYER_WIDTH = 0.6;         // 玩家碰撞盒宽
const PLAYER_HEIGHT = 1.8;        // 玩家碰撞盒高
const EYE_HEIGHT = 1.62;          // 视线高度
const REACH_SURVIVAL = 4.5;       // 生存模式触及距离
const REACH_CREATIVE = 5.5;       // 创造模式触及距离
const DAY_LENGTH = 1200;          // 一天周期(秒), MC 为 20 分钟
const MAX_HEALTH = 20;            // 生命值 (10颗心)
const MAX_HUNGER = 20;            // 饥饿值
const ITEM_DROP_TTL = 300;        // 掉落物存活时间(秒)
const MAX_MOBS_HOSTILE = 10;      // 敌对生物上限
const MAX_MOBS_PASSIVE = 14;      // 友好生物上限
const SAVE_KEY_PREFIX = "voxelcraft_world_";
const SETTINGS_KEY = "voxelcraft_settings";
const SAVE_AUTOSAVE_INTERVAL = 30;

// 全局游戏对象
const G = {
  renderer: null,
  scene: null,
  camera: null,
  world: null,
  player: null,
  sky: null,
  entities: null,
  ui: null,
  sound: null,
  save: null,
  state: "title",       // title | loading | playing | dead
  settings: {
    renderDistance: 4,
    fov: 75,
    volume: 60,
    music: "on",
    bobbing: "on",
  },
  paused: false,
  gameTime: 0,          // 世界时间(秒)
  seedStr: "",
  mode: "survival",
};

function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function lerp(a, b, t) { return a + (b - a) * t; }
function smoothstep(a, b, x) { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }

// 字符串 → 32位种子哈希
function hashSeed(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// 坐标 → 确定性随机 (用于树木/装饰等)
function hash2(seed, x, z) {
  let h = seed ^ Math.imul(x, 374761393) ^ Math.imul(z, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function hash3(seed, x, y, z) {
  let h = seed ^ Math.imul(x, 374761393) ^ Math.imul(y, 2246822519) ^ Math.imul(z, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// 度 → 弧度
const DEG = Math.PI / 180;
