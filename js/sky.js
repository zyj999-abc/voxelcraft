/* ============================================================
 * VoxelCraft — 天空系统: 昼夜循环 / 日月星辰 / 云层
 * ============================================================ */
"use strict";

class Sky {
  constructor(scene, seed) {
    this.scene = scene;
    this.time = 0;               // 天内时间 0..1
    this.cloudNoise = new SimplexNoise(mulberry32(seed ^ 0xC10D));
    this.mobMaterials = [];      // 需要随日光变暗的材质

    this.pivot = new THREE.Group();
    scene.add(this.pivot);

    // 太阳 / 月亮
    this.sunTex = this.makeGlowTexture("#ffe777", "#fff5c0");
    this.moonTex = this.makeGlowTexture("#e8e8e8", "#c8c8d8");
    this.sun = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.sunTex, fog: false, transparent: true, depthWrite: false,
    }));
    this.sun.scale.set(55, 55, 1);
    this.sun.position.set(420, 0, 0);
    this.pivot.add(this.sun);

    this.moon = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.moonTex, fog: false, transparent: true, depthWrite: false,
    }));
    this.moon.scale.set(38, 38, 1);
    this.moon.position.set(-420, 0, 0);
    this.pivot.add(this.moon);

    // 星星
    const starGeo = new THREE.BufferGeometry();
    const starPos = [];
    const rng = mulberry32(seed ^ 0x57A25);
    for (let i = 0; i < 600; i++) {
      // 球面均匀分布
      const u = rng() * 2 - 1, ph = rng() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      starPos.push(460 * r * Math.cos(ph), 460 * u, 460 * r * Math.sin(ph));
    }
    starGeo.setAttribute("position", new THREE.Float32BufferAttribute(starPos, 3));
    this.stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
      color: 0xffffff, size: 1.6, sizeAttenuation: false,
      transparent: true, opacity: 0, fog: false, depthWrite: false,
    }));
    this.pivot.add(this.stars);

    // 云
    this.cloudMat = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false,
    });
    this.cloudMesh = null;
    this.cloudTimer = 0;
    this.cloudDrift = 0;

    // 颜色
    this.skyDay = new THREE.Color(0.48, 0.66, 1.0);
    this.skyNight = new THREE.Color(0.015, 0.02, 0.05);
    this.skySunset = new THREE.Color(1.0, 0.48, 0.22);
    this._skyColor = new THREE.Color();

    scene.fog = new THREE.Fog(0x87ceeb, 10, 100);
    this._underwater = false;
  }

  makeGlowTexture(core, edge) {
    const cv = document.createElement("canvas");
    cv.width = 64; cv.height = 64;
    const ctx = cv.getContext("2d");
    // 像素方块太阳
    const g = ctx.createRadialGradient(32, 32, 4, 32, 32, 30);
    g.addColorStop(0, core);
    g.addColorStop(0.55, core);
    g.addColorStop(0.62, edge);
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(cv);
    tex.magFilter = THREE.NearestFilter;
    return tex;
  }

  // time 0..1 (0=日出)
  update(dt, gameTime, camPos, renderDist) {
    const dayT = (gameTime / DAY_LENGTH) % 1;
    this.time = dayT;

    const sunAngle = dayT * Math.PI * 2;
    const elev = Math.sin(sunAngle);          // 太阳仰角 -1..1
    const daylight = smoothstep(-0.10, 0.22, elev);

    // 天空颜色
    this._skyColor.copy(this.skyNight).lerp(this.skyDay, daylight);
    const sunsetAmt = Math.max(0, 1 - Math.abs(elev) / 0.22) * 0.55;
    if (sunsetAmt > 0) this._skyColor.lerp(this.skySunset, sunsetAmt);
    // 注意: 不能用 scene.background(Color) — 那样每次 render() 都会 forceClear,
    // 手持物第二遍渲染时会清掉地形。改用 clear color + autoClear=false 的手动清屏。
    this.scene.background = null;
    if (G.renderer) G.renderer.setClearColor(this._skyColor, 1);

    // 光照
    const light = 0.24 + 0.76 * daylight;
    this.daylight = light;

    // 天体旋转 (太阳东升西落)
    this.pivot.rotation.z = sunAngle;
    this.pivot.position.copy(camPos);
    this.stars.material.opacity = clamp(1 - daylight * 1.6, 0, 1) * 0.9;
    this.sun.material.opacity = clamp(elev * 6 + 0.6, 0, 1);
    this.moon.material.opacity = clamp(-elev * 6 + 0.6, 0, 1);

    // 雾
    const far = renderDist * 16;
    if (!this._underwater) {
      this.scene.fog.color.copy(this._skyColor);
      this.scene.fog.near = far * 0.62;
      this.scene.fog.far = far * 0.98;
    }

    // 云 (跟随 + 漂移, 周期重建)
    this.cloudDrift += dt * 1.2;
    this.cloudTimer -= dt;
    if (this.cloudTimer <= 0 || !this.cloudMesh) {
      this.cloudTimer = 2.5;
      this.rebuildClouds(camPos);
    }
    if (this.cloudMesh) this.cloudMesh.position.x = this.cloudDrift;

    return light;
  }

  setUnderwater(on) {
    this._underwater = on;
    if (on) {
      this.scene.fog.color.setRGB(0.08, 0.2, 0.45);
      this.scene.fog.near = 0.1;
      this.scene.fog.far = 14;
    }
  }

  rebuildClouds(camPos) {
    if (this.cloudMesh) {
      this.scene.remove(this.cloudMesh);
      this.cloudMesh.geometry.dispose();
      this.cloudMesh = null;
    }
    const CELL = 14, RANGE = 15;
    const cx = Math.round(camPos.x / CELL), cz = Math.round(camPos.z / CELL);
    const cells = [];
    const t = this.cloudDrift / CELL;
    for (let i = -RANGE; i <= RANGE; i++) {
      for (let j = -RANGE; j <= RANGE; j++) {
        const wx = cx + i, wz = cz + j;
        const n = this.cloudNoise.noise2D((wx + t) * 0.11, wz * 0.11);
        if (n > 0.32) cells.push([wx * CELL, wz * CELL]);
      }
    }
    if (!cells.length) return;
    const geo = new THREE.BoxGeometry(CELL - 0.5, 4, CELL - 0.5);
    const mesh = new THREE.InstancedMesh(geo, this.cloudMat, cells.length);
    const m = new THREE.Matrix4();
    cells.forEach(([x, z], i) => {
      m.setPosition(x, 108 + this.cloudNoise.noise2D(x * 0.05, z * 0.05) * 2, z);
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = false;
    this.cloudMesh = mesh;
    this.scene.add(mesh);
  }

  // 注册需要随昼夜变暗的材质(生物等)
  registerMobMaterial(mat) { this.mobMaterials.push(mat); return mat; }
  applyMobLighting(light) {
    for (const m of this.mobMaterials) m.color.setScalar(light);
  }
}
