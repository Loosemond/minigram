// Short-lived effects: Voltorb explosions (the textures of object 185, the
// minigame's effect object), the splash of a missed egg in the water (image
// bank 152), "+1" / "-5" in the game's big digits (bank 429), eggs knocked
// out by a Voltorb, and catch sparkles. Object 185's textures are intensity
// maps (opaque, grey = strength).
import * as THREE from "three";
import { makeEgg, setLayer } from "./assets.js";
import { WATER_Y } from "./game.js";

// the smoke texture is noise over the whole square: fade it to a round puff
function puffTexture(src) {
  const img = src.image, n = img.width;
  const c = document.createElement("canvas");
  c.width = c.height = n;
  const g = c.getContext("2d");
  g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, n, n);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const r = Math.hypot(x - n / 2 + 0.5, y - n / 2 + 0.5) / (n / 2);
      const k = Math.max(0, 1 - r * r);
      const i = (y * n + x) * 4;
      d.data[i] = d.data[i + 1] = d.data[i + 2] = d.data[i + 1] * k;
    }
  }
  g.putImageData(d, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

export class Effects {
  constructor(scene, assets) {
    this.scene = scene;
    this.assets = assets;
    this.items = [];
    this.eggPool = [];
    this.puff = puffTexture(assets.fx.smoke);
    this.numbers = new Map();
  }

  // "+1", "-5": a texture made of the game's big digits
  number(n) {
    const key = n > 0 ? "+" + n : String(n);
    if (this.numbers.has(key)) return this.numbers.get(key);
    const d = this.assets.digits;
    const glyphs = [n > 0 ? d.plus : d.minus, ...String(Math.abs(n)).split("").map((c) => d.big[+c])];
    const c = document.createElement("canvas");
    c.width = glyphs.reduce((w, g) => w + g.width, 0);
    c.height = 32;
    const g = c.getContext("2d");
    let x = 0;
    for (const img of glyphs) { g.drawImage(img, x, 0); x += img.width; }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.NoColorSpace;
    const v = { tex: t, aspect: c.width / c.height };
    this.numbers.set(key, v);
    return v;
  }

  add(obj, dur, step, zone) {
    setLayer(obj, zone + 1);
    this.scene.add(obj);
    this.items.push({ obj, t: 0, dur, step });
  }

  sprite(tex, { additive = false, color = 0xffffff, opacity = 1 }) {
    const mat = new THREE.SpriteMaterial({
      color, transparent: true, depthWrite: false, opacity,
      ...(additive ? { map: tex, blending: THREE.AdditiveBlending } : { alphaMap: tex }),
    });
    return new THREE.Sprite(mat);
  }

  explosion(pos, big, zone) {
    const { burst, sparks } = this.assets.fx;
    const s = big ? 1 : 0.6;
    const flash = this.sprite(burst, { additive: true, color: 0xffc030 });
    flash.position.copy(pos);
    this.add(flash, 0.35, (k, o) => {
      o.scale.setScalar(s * (0.3 + 0.8 * k));
      o.material.opacity = 1 - k;
      o.material.rotation = k * 0.8;
    }, zone);
    const puff = this.sprite(this.puff, { color: 0x6a625a, opacity: 0.9 });
    puff.position.copy(pos);
    this.add(puff, 0.7, (k, o) => {
      o.scale.setScalar(s * (0.4 + 0.9 * k));
      o.position.y = pos.y + 0.3 * k;
      o.material.opacity = 0.9 * (1 - k);
    }, zone);
    const spark = this.sprite(sparks, { additive: true, color: 0xfff0a0 });
    spark.position.copy(pos);
    this.add(spark, 0.45, (k, o) => {
      o.scale.setScalar(s * (0.5 + 1.3 * k));
      o.material.opacity = 1 - k * k;
    }, zone);
  }

  popup(n, pos, zone) {
    const { tex, aspect } = this.number(n);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, color: n > 0 ? 0xffffff : 0xff7060 }));
    s.renderOrder = 5;
    s.position.copy(pos);
    const h = 0.42;
    this.add(s, 0.8, (k, o) => {
      o.scale.set(h * aspect * (k < 0.15 ? 0.6 + k * 2.7 : 1), h * (k < 0.15 ? 0.6 + k * 2.7 : 1), 1);
      o.position.y = pos.y + 0.45 * k;
      o.material.opacity = k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4;
    }, zone);
  }

  // image bank 152: a column of water rising and falling back, 12 frames of
  // 32x32, standing on the water line
  splash(pos, zone, size = 1) {
    const frames = this.assets.fx.splash;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: frames[0], transparent: true, depthWrite: false }));
    s.center.set(0.5, 0);
    s.position.copy(pos);
    s.scale.set(0.9 * size, 0.9 * size, 1);
    s.renderOrder = 4;
    this.add(s, 0.55, (k, o) => { o.material.map = frames[Math.min(frames.length - 1, Math.floor(k * frames.length))]; }, zone);
  }

  sparkle(pos, zone) {
    const spark = this.sprite(this.assets.fx.sparks, { additive: true, color: 0xfff6c0 });
    spark.position.copy(pos);
    this.add(spark, 0.3, (k, o) => {
      o.scale.setScalar(0.25 + 0.35 * k);
      o.material.opacity = 1 - k;
    }, zone);
  }

  // eggs knocked out by a Voltorb fly off and drop into the water
  lostEggs(pos, n, zone) {
    for (let i = 0; i < n; i++) {
      const egg = this.eggPool.pop() || makeEgg(this.assets);
      const a = (i / Math.max(1, n - 1) - 0.5) * 2.4;
      const v = new THREE.Vector3(Math.sin(a) * 1.1, 2.4 + Math.random() * 0.6, 0.3 + Math.random() * 0.3);
      egg.position.copy(pos);
      egg.visible = true;
      egg.userData.pooled = true;
      this.add(egg, 3, (k, o, dt) => {
        v.y -= 7.5 * dt;
        o.position.addScaledVector(v, dt);
        o.rotation.z += dt * 8;
        if (o.position.y > WATER_Y) return false;
        this.splash(new THREE.Vector3(o.position.x, WATER_Y, o.position.z), zone, 0.7);
        return true; // done
      }, zone);
    }
  }

  update(dt) {
    for (const it of this.items) {
      it.t += dt;
      if (it.step(Math.min(1, it.t / it.dur), it.obj, dt) === true) it.t = it.dur; // finished early
    }
    const done = this.items.filter((it) => it.t >= it.dur);
    if (!done.length) return;
    for (const it of done) {
      this.scene.remove(it.obj);
      if (it.obj.isSprite) it.obj.material.dispose();
      else if (it.obj.userData.pooled) this.eggPool.push(it.obj);
    }
    this.items = this.items.filter((it) => it.t < it.dur);
  }

  clear() {
    for (const it of this.items) { it.t = it.dur; }
    this.update(0);
  }
}
