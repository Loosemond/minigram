// Egg Emergency's effects, as module #56 (and the shared ones it calls) draws
// them, each on its player's frames (game.js steps them) and drawn between two
// of them: the splash of a drop that wasn't caught (image bank 152), the eggs
// a Voltorb knocks out (see-through) and a winner's thrown at the end (solid),
// the sparks round a hurt Chansey (module #64's particle: bank 224), and
// "PERFECT" over a Chansey with all 100 eggs (module #2: bank 433).
// Positions are the game's (rules.js); game.js gives where they go in the scene.
import * as THREE from "three";
import * as R from "./rules.js";
import { makeEgg, setLayer } from "./assets.js";
import { tint } from "../tint.js";

const lerp = (a, b, k) => a + (b - a) * k;

// ---- a splash in the water (0x868000AC): a picture a frame, 0-10, its alpha
// 255 - 11f (to frame 7), then 407 - 37f; centred 135 under Chansey's feet, x5
const SPLASH_FRAMES = 11;
const splashAlpha = (f) => (f < 8 ? 255 - 11 * f : 407 - 37 * f) / 255;

// ---- a hurt Chansey's spark (0x8680105C, 0x87F03884): one a frame, at
// Chansey's (x + 20, its head (its attachment point, 0x87F0F8E8) + 30); a
// +-32 quad turned to the camera, x rand 7.2, rolled (rand % 31) << 9; drawn
// the one frame (bank 224's first picture, 0x87F039F0)
const SPARK_HALF = 32, SPARK_SCALE = 7.2, SPARK_X = 20, SPARK_UP = 30;

// ---- PERFECT (0x81900164, 0x81900214): 64 x 26 (the picture), 30 over
// Chansey, x 4.6 (|sin a| + 1) / 2, a up 0x800 a frame; coloured prim and env
// by player (0x81900784) through (prim - env) x its grey + env
const PERFECT_UP = 30, PERFECT_SCALE = 4.6;
const PERFECT_COLOURS = [[[200, 200, 255], [0, 80, 200]], [[200, 255, 200], [0, 80, 0]],
  [[255, 200, 200], [200, 0, 70]], [[255, 240, 190], [230, 90, 0]]];

export class Effects {
  // place: the game's position -> the scene (game.js's); scale: game units -> the scene's
  constructor(scene, assets, place, scale, eggScale) {
    this.scene = scene;
    this.assets = assets;
    this.place = place;
    this.k = scale;
    this.eggScale = eggScale;
    this.seats = [0, 1, 2, 3].map((z) => {
      const spark = new THREE.Sprite(new THREE.SpriteMaterial({ map: assets.fx.spark, transparent: true, depthWrite: false }));
      spark.visible = false;
      spark.renderOrder = 3;
      setLayer(spark, z + 1);
      scene.add(spark);
      const pic = new THREE.CanvasTexture(tint(assets.perfect, ...PERFECT_COLOURS[z]));
      pic.colorSpace = THREE.NoColorSpace;
      // (module #2 draws it from an object list of its own, 0x81900DE0: over the scene here)
      const perfect = new THREE.Sprite(new THREE.SpriteMaterial({ map: pic, transparent: true, depthWrite: false, depthTest: false }));
      perfect.visible = false;
      perfect.renderOrder = 10;
      setLayer(perfect, z + 1);
      scene.add(perfect);
      return {
        splashes: [], free: [],
        lost: [...Array(20)].map(() => ({ on: false })), lostMeshes: [],
        spark, sparkOn: false,
        perfect, perfectOn: false, phase: 0, was: 0,
      };
    });
  }

  // ---- splashes ----
  splash(z, x, zz) {
    const s = this.seats[z];
    let o = s.free.pop();
    if (!o) {
      o = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.assets.fx.splash[0], transparent: true, depthWrite: false }));
      o.renderOrder = 2;
      setLayer(o, z + 1);
    }
    o.visible = true;
    this.scene.add(o);
    s.splashes.push({ o, f: 0, x, z: zz });
  }
  // a frame of player z's (in the play, or a winner's cheer): the splashes on
  stepSplashes(z) {
    const s = this.seats[z];
    for (const p of s.splashes) p.f++;
    for (const p of s.splashes) if (p.f >= SPLASH_FRAMES) { this.scene.remove(p.o); s.free.push(p.o); }
    s.splashes = s.splashes.filter((p) => p.f < SPLASH_FRAMES);
  }
  clearSplashes(z) { // (a winner's throw, 0x86806CD8)
    const s = this.seats[z];
    for (const p of s.splashes) { this.scene.remove(p.o); s.free.push(p.o); }
    s.splashes = [];
  }

  // ---- the eggs knocked out (0x8680422C): n of them from Chansey's feet; a
  // winner's are solid (and none of its eggs go)
  knock(z, x, n, cheer) {
    const s = this.seats[z];
    for (let i = 0; i < n; i++) {
      Object.assign(s.lost[i], { on: true, cheer, x, y: R.FEET, z: 0, t: 0, angle: R.lostAngle(n, i),
        spin: (Math.floor(Math.random() * 17) << 8), rx: 0, rz: 0 });
      Object.assign(s.lost[i], { was: [s.lost[i].x, s.lost[i].y, s.lost[i].z, 0, 0] });
    }
  }
  // a frame of player z's: they fly (0x86801160); in the play they go below -470
  // (0x868048C8), a winner's splash below -455. Returns whether one splashed.
  stepLost(z, cheer) {
    const s = this.seats[z];
    let splashed = false;
    for (const e of s.lost) {
      if (!e.on || e.cheer !== cheer) continue;
      e.was = [e.x, e.y, e.z, e.rx, e.rz];
      R.lostStep(e, cheer);
      e.rx += e.spin;
      e.rz += e.spin;
      if (cheer && e.y < R.FEET - 170) {
        e.on = false;
        this.splash(z, e.x, e.z);
        splashed = true;
      }
    }
    return splashed;
  }
  dropLost(z) { for (const e of this.seats[z].lost) if (e.on && !e.cheer && e.y <= R.GONE) e.on = false; }
  lostOn(z) { return this.seats[z].lost.some((e) => e.on); }

  // ---- the spark: one this frame, or none ----
  spark(z, on) {
    const s = this.seats[z];
    s.sparkOn = on;
    if (on) { s.sparkScale = Math.random() * SPARK_SCALE; s.sparkRoll = (Math.floor(Math.random() * 31) << 9) / 65536 * 2 * Math.PI; }
  }

  // ---- PERFECT ----
  perfect(z, on) {
    const s = this.seats[z];
    s.perfectOn = on;
    s.phase = s.was = 0;
  }
  stepPerfect() {
    for (const s of this.seats) if (s.perfectOn) { s.was = s.phase; s.phase += 0x800; }
  }

  // ---- drawing: between player z's last two frames (k from 0 to 1); chansey:
  // its x in the game, and the scene's height of its head
  draw(z, k, chanseyX, headY) {
    const s = this.seats[z], K = this.k;
    for (const p of s.splashes) {
      const f = Math.min(10, p.f);
      p.o.material.map = this.assets.fx.splash[f];
      p.o.material.opacity = Math.max(0, lerp(splashAlpha(f), splashAlpha(f + 1), k));
      this.place(p.o.position, z, p.x, R.SPLASH_Y, p.z);
      p.o.scale.set(32 * R.SPLASH_SCALE * K, 32 * R.SPLASH_SCALE * K, 1);
    }
    s.lost.forEach((e, i) => {
      let m = s.lostMeshes[i];
      if (!e.on) { if (m) m.visible = false; return; }
      const cheer = e.cheer ? 1 : 0;
      if (!m || m.userData.cheer !== cheer) {
        if (m) this.scene.remove(m);
        m = s.lostMeshes[i] = makeEgg(this.assets, this.eggScale, cheer ? 1 : 100 / 255);
        m.userData.cheer = cheer;
        setLayer(m, z + 1);
        this.scene.add(m);
      }
      m.visible = true;
      const w = e.was;
      this.place(m.position, z, lerp(w[0], e.x, k), lerp(w[1], e.y, k), lerp(w[2], e.z, k));
      const a = (v) => (v / 65536) * 2 * Math.PI;
      m.rotation.set(a(lerp(w[3], e.rx, k)), 0, a(lerp(w[4], e.rz, k)));
    });
    s.spark.visible = s.sparkOn && s.sparkScale > 0;
    if (s.spark.visible) {
      this.place(s.spark.position, z, chanseyX + SPARK_X, 0, 0);
      s.spark.position.y = headY + SPARK_UP * K;
      const w = 2 * SPARK_HALF * s.sparkScale * K;
      s.spark.scale.set(w, w, 1);
      s.spark.material.rotation = s.sparkRoll;
    }
    s.perfect.visible = s.perfectOn;
    if (s.perfectOn) {
      const ph = lerp(s.was, s.phase, k);
      const sc = PERFECT_SCALE * (Math.abs(Math.sin((ph / 65536) * 2 * Math.PI)) + 1) / 2;
      this.place(s.perfect.position, z, chanseyX, R.FEET + PERFECT_UP, 0);
      s.perfect.scale.set(64 * sc * K, 26 * sc * K, 1);
    }
  }

  clear() {
    for (let z = 0; z < 4; z++) {
      this.clearSplashes(z);
      const s = this.seats[z];
      for (const e of s.lost) e.on = false;
      for (const m of s.lostMeshes) if (m) m.visible = false;
      s.sparkOn = false;
      s.spark.visible = false;
      s.perfectOn = false;
      s.perfect.visible = false;
    }
  }
}
