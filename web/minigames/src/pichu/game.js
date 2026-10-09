// A Pichu's Power Plant game: the rules (rules.js) on the round's clock, and
// the scene they drive. The power plant's frame (object 56) fills the screen
// head on: four rooms, one a player (1P top left, 2P top right, 3P bottom
// left, 4P bottom right), each with its Pichu in the middle and four Electrode
// lamps (object 57) pointing in at it from the ceiling, the floor and the
// walls, and the B/A sign in the middle. In the game's units (y up).
//
// Who plays each seat: "local" (this device's player), "cpu" or "remote"
// (someone on another device, online). The CPUs' presses come from the
// round's seed (rules.js cpuPresses()), so every device runs them the same.
// This device's player's presses emit "send" for sending on; online, the
// others' come in told("press"), and the server says who finished first
// (told("won")): until then the finish here is the one the presses so far make.
//
// The rules tick at the game's 30 frames a second; what moves is drawn
// between its frames (the lamps, the camera, the clips, the stars' fade, the
// sparks' spin), and the pictures that flip (the sparks', the lightning's) do
// so once a game frame, as the game's do.
import * as THREE from "three";
import { makeModel, makeStrip } from "./assets.js";
import { dress } from "../n64fx.js";
import { faceOnRender } from "../facing.js";
import * as R from "./rules.js";

// the Pichus (0x86606DD4), 0.7x, facing the camera
export const PICHU = [[-345, 100], [345, 100], [-345, -390], [345, -390]];
const PICHU_Z = -200, PICHU_SCALE = 0.7;
// the lamps (0x866068CC), by player and direction (up, down, right, left:
// the rules' 1-4, less one), each turned about z to point in at its Pichu
export const LAMPS = [
  [[-325, 450], [-325, 50], [-50, 250], [-600, 250]],
  [[325, 450], [325, 50], [600, 250], [50, 250]],
  [[-325, -50], [-325, -450], [-50, -250], [-600, -250]],
  [[325, -50], [325, -450], [600, -250], [50, -250]],
];
export const LAMP_Z = -50;
const LAMP_TURN = [Math.PI, 0, Math.PI / 2, -Math.PI / 2];
// the lamp's clip (clip00): frames 0-3 pop it out, 4 is out, 5-8 put it back
// (held there). Its callback (0x866023F4), a direction's four together: an
// Electrode that pops out holds it in at 0 for 4 frames, then lets it out (1-4,
// held at 4); 8 frames before its cycle ends it holds 5 for 4 frames, then
// lets it go back in (6-8)
const OUT = 4, IN = 8, WAIT = 4;
// its face: texanim 0 (blue, A) or 1 (green, B), started once it's let out
// and looped on its first six frames; from the close it plays on to its last,
// red, and holds it (red's also the face when it's dead)
const RED = 2, LAMP_FACE = { [R.A]: [3, 4, 5, 5, 4, 3, 2], [R.B]: [6, 7, 8, 8, 7, 6, 2] }, LOOP = 6;
// at the finish the lamps' and the sign's callbacks stop (state 8), so they
// run on to their clips' ends; 10 frames on, every lamp is put in, red
// (0x86604BE0)
const LAMPS_IN = 10;
// the sign's A and B (object 56's face channels 0 and 1): dim, or pulsing
// while a lamp of that colour is live, restarted every 6 frames (0x86601910)
const SIGN = [[6, 7, 8, 8, 7, 6], [9, 10, 11, 11, 10, 9]];
// Pichu's clips; a turn's clip by direction, held on its frames 11-12 while
// charging (a CPU, or a person whose last press, with a direction, was in
// the last 20 frames: 0x86601B74)
const CLIP = { idle: 0, win: 5, fall: 9, miss: 10, dizzy: 11 };
const TURN = { 1: 3, 2: 4, 3: 1, 4: 2 };
const HOLD = 11, HELD = 19;
// the spark by a Pichu that charges (image bank 224, 6x a 60 x 60 quad), by
// player and direction (0x86606B84, 0x86606BC4), a random picture of 0-6 each frame
const SPARK = [
  [[-280, 274], [-280, 134], [-140, 204], [-420, 204]],
  [[320, 274], [320, 134], [450, 204], [170, 204]],
  [[-280, -186], [-280, -326], [-140, -256], [-420, -256]],
  [[320, -186], [320, -326], [450, -256], [170, -256]],
];
const SPARK_SIZE = 360, SPARK_Z = 150, SPARK_FRAMES = 4; // (shown a few frames after each hit here)
// module #64's particles (made by 0x87F03884, run by 0x87F03730, drawn by
// 0x87F039F0 facing the camera: 0x87F05FB0), placed from their Pichu (its place
// added, not its turn or size), z -260 from it, so just in front of the back
// wall; yellow (prim FFFF00, env white), picture age / 2, living their life
// and a frame. Type 0: bank 224 on a 64 x 64 quad, turning 0x7F a frame; type
// 1: bank 225 (the lightning) on a 32 x 96 one.
const FX = { z: -260, spin: 0x7f, size: { 0: [64, 64], 1: [32, 96] } };
// the charge: a press at a live Electrode, the right button or the wrong
// (0x866018F4), makes two bolts (0x86601408) round a spot by the Pichu's pose
// before the press turns it (0x86606B18: waiting, up, down, right, left), 5
// out at a random angle (kept to some quarters by the pose), each turned to
// point out (its angle - 0x3FFF), rand x 0.7 x 6 big, living rand % 5 + 2
const CHARGE = { at: [[150, 5], [0, 220], [0, -20], [130, 130], [-130, 130]], r: 5, size: 0.7 * 6, n: 2 };
// the losers' crackle, a spark a frame from the finish till they fall
// (0x86601188, from 0x86604D34): at (5, 105) till the zap, rand x 1.5 x 8
// big, living 1-2 frames; then at (45, 200), x 12, 1-3; 28 right for 2P and
// 4P, 18 down for 3P and 4P
const CRACKLE = [{ at: [5, 105], size: 1.5 * 8, life: 2 }, { at: [45, 200], size: 1.5 * 12, life: 3 }];
// the lightning that zaps the losers (bank 225, 12 x 8 times a 30 x 90 quad,
// yellow: 0x86606DF4, 0x86606E14), from the top corner on its side; its
// picture the next of 0-6 each time one's drawn, a random one after 6
// (0x86600040, one count for all of them)
const BOLT = [[-510, 550], [510, 550], [-510, 70], [510, 70]];
const BOLT_TURN = [0x1c00, 0x6c00, 0x1c00, 0x6c00].map((a) => (a / 0x10000) * 2 * Math.PI);
const BOLT_Z = 150;
// the dizzy stars over a fallen loser (object 190, 0x86604AD8): its Pichu's
// place + (-85, 140), 0.33x, tilted 0xFF00 (1P, 2P) or 0x0100 (3P, 4P) about
// x, fading in 10 / 255 a frame from 0 (0x86606EC0-0x86606ECC)
const STARS = { at: [-85, 140], scale: 0.33, tilt: (0x100 / 0x10000) * 2 * Math.PI, fade: 10 / 255 };
// the end (0x866049D4), in frames from the finish: till the zap, a Pichu
// whose clip ends goes back to waiting; at 50 the losers are zapped (sounds
// 0x2F09, 0x2F0A) under the lightning, their clips 7, 8, 6 and 7 from 50, 71,
// 91 and 111 (the finish sets 6, a step adds one, 9 is 6 again: 0x86605874,
// 0x86604E78), held, showing frame 0 at each and then 0 and 1 by turns; the
// jingle's four parts at 51, 71, 91 and 111 (0x86604B54); at 130 (80 if all
// four won, with no zap and no jingle) the winners cheer, and the results
// (R.END); at 132 the losers fall (clip 9, then at its frame 43 clip 11 from
// a random 0-23, jumping back to a random 0-18 at its frame 24) under the
// stars, and the lightning goes
const ZAP = 50, ZAP_STEPS = [50, 71, 91, 111], ZAP_CLIPS = [7, 8, 6, 7], JINGLE = [51, 71, 91, 111];
const CHEER = 130, ALL_CHEER = 80, FALL = 132, FALL_TO = 43, DIZZY_TO = 24;
// the opening glide (0x86605ABC): from preset 1 to the game's view over 50
// frames, from the countdown's first frame on (state 10: 0x866048EC starts the
// countdown, and the glide moves on from the next)
export const VIEW = { eye: [0, 50, 2210], at: [0, 50, 0] };
const START = { eye: [750, 300, 900], at: [60, 60, 50] };
const GLIDE = { from: 1, frames: 50 }; // (frames after the countdown starts)

const AXIS_Z = new THREE.Vector3(0, 0, 1);
const turn = (a) => (a / 0x10000) * 2 * Math.PI; // (the game's angles: 0x10000 a turn)

// the charge's angle (rand_lcg's low 16 bits), kept by the pose (0x86601520-0x86601598)
function chargeAngle(pose, a) {
  switch (pose) {
    case 1: return a < 0x8001 ? a : a - 0x4000;
    case 2: return a < 0x8000 ? a + 0x4000 : a;
    case 3: return a < 0x4001 || a >= 0xc000 ? a : a - 0x4000;
    case 4: return a >= 0x4000 && a < 0xc001 ? a : (a + 0x4000) & 0xffff;
    default: return a;
  }
}
const rand = (n) => Math.floor(Math.random() * n);

export class Game {
  constructor(scene, assets) {
    this.scene = scene;
    this.assets = assets;
    this.listeners = {};
    faceOnRender(scene); // (the lamps' faces, the dizzy stars and the particles: drawn facing the camera)
    this.frame3d = makeModel(assets.frame, 1);
    scene.add(this.frame3d.root);
    this.lamps = LAMPS.map((row) => row.map(([x, y], k) => {
      const m = makeModel(assets.lamp, 1);
      m.root.position.set(x, y, LAMP_Z);
      m.root.rotation.z = LAMP_TURN[k];
      scene.add(m.root);
      return m;
    }));
    this.players = PICHU.map(([x, y], i) => {
      const model = makeModel(assets.pichu, PICHU_SCALE);
      model.root.position.set(x, y, PICHU_Z);
      const spark = makeStrip(assets.spark, 8, SPARK_SIZE, SPARK_SIZE);
      spark.visible = false;
      spark.renderOrder = 2;
      const bolt = makeStrip(assets.bolt, 8, 360, 720);
      bolt.position.set(BOLT[i][0], BOLT[i][1], BOLT_Z);
      bolt.rotation.z = BOLT_TURN[i];
      bolt.visible = false;
      bolt.renderOrder = 3;
      bolt.material.depthTest = false; // (drawn over everything: the game's second scene)
      bolt.material.blending = THREE.AdditiveBlending; // (brighter than the game's plain blend: a thin bolt this big is faint)
      const stars = makeModel(assets.stars, STARS.scale);
      stars.root.position.set(x + STARS.at[0], y + STARS.at[1], PICHU_Z);
      stars.root.rotation.x = i < 2 ? -STARS.tilt : STARS.tilt;
      stars.root.visible = false;
      dress(assets.fx, stars.root, "stars"); // (its halos and stars, each its layer's recipe: 190's callbacks)
      scene.add(model.root, spark, bolt, stars.root);
      return { i, x, y, model, spark, bolt, stars };
    });
    this.fx = []; // the particles about: { mesh, type, born, life, roll, z }
    this.spare = { 0: [], 1: [] }; // (their meshes, kept for the next)
    this.reset("normal");
    this.state = "idle";
  }
  on(name, fn) { (this.listeners[name] ||= []).push(fn); }
  emit(name, ...args) { for (const fn of this.listeners[name] || []) fn(...args); }

  // A game. level: easy / normal / hard; setup: { me, control, cpus (which
  // seats are CPUs), told (online, the server's word so far: to rejoin it
  // midway; w, the CPUs' margins' W in a "play again"), w (solo, the same) }
  reset(level, seed = (Math.random() * 2 ** 31) | 0, setup = {}) {
    this.levelName = level;
    this.seed = seed;
    this.me = setup.me ?? 0;
    this.control = setup.control || [0, 1, 2, 3].map((z) => (z === this.me ? "local" : "cpu"));
    this.cpus = setup.cpus || this.control.map((c) => c === "cpu");
    this.c = R.levelCode(level, this.cpus.some(Boolean));
    this.P = R.pattern(seed, this.c);
    this.cpu = R.cpuPresses(seed, this.c, this.cpus, this.P, setup.told?.w ?? setup.w ?? 30);
    this.runners = [0, 1, 2, 3].map((z) => (this.cpus[z] ? null : new R.Runner(this.P)));
    this.sent = []; // this device's player's presses ([t, dir, btn]), as the server has them once it says
    this.cpuAt = [0, 0, 0, 0]; // each CPU's next press (an index into its list)
    this.cpuCharge = [0, 0, 0, 0];
    this.result = null; // the server's word on the finish: { at, winners, e (the charges then) }
    this.scores = null; // the server's charges at the end
    this.time = 0;
    this.state = "ready";
    this.lastFrame = -1;
    this.intro = 0; // frames since the countdown started (the camera's glide)
    this.after = -1; // frames since the finish (the end), once it's come
    this.boltPic = 0; // (the lightning's picture count)
    for (const p of this.players) {
      Object.assign(p, {
        pose: 0, dir: 0, lastPress: -99, lastDir: 0, shockAt: null, sparkAt: -99, hitAt: -99, sparkPic: [-1, 0], boltPic: 0, end: null,
      });
      p.model.play(CLIP.idle, { from: Math.random() * 24, restart: true, fade: 0 }); // (rand2 % 25)
      p.spark.visible = p.bolt.visible = p.stars.root.visible = false;
    }
    for (const f of this.fx) this.retire(f);
    this.fx = [];
    const told = setup.told;
    if (told?.presses) told.presses.forEach((list, z) => { for (const [f, d, b] of list || []) this.runners[z]?.press(f, d, b); });
    this.sent = (told?.presses?.[this.me] || []).map(([f, d, b]) => [f, d, b]);
    if (told?.done) this.told("won", told.done);
    this.drawLamps(-1);
  }
  start() { this.state = "play"; this.intro = Infinity; }
  stop() { this.state = "over"; }
  setControl(z, c) { this.control[z] = c; }

  get frame() { return Math.floor(this.time * R.FPS + 1e-6); }
  // the finish: the server's word, or what the presses so far make it
  fin() {
    if (this.result) return this.result;
    return R.finish([0, 1, 2, 3].map((z) => (this.cpus[z] ? this.cpuFull(z) : this.runners[z].full)));
  }
  cpuFull(z) { const f = this.cpu[z]?.full; return f !== null && f !== undefined && f <= this.lastFrame ? f : null; }
  // the round's over (the results) 130 frames after the finish
  get end() { const f = this.fin(); return f ? (f.at + R.END) / R.FPS : this.P.frames / R.FPS; }
  // seat z's charge now (after the finish, then)
  charge(z) {
    const f = this.fin();
    if (f && this.result?.e && this.lastFrame >= f.at) return this.result.e[z];
    if (this.scores && this.state === "over") return this.scores[z];
    return this.cpus[z] ? this.cpuCharge[z] : this.runners[z].charge;
  }
  // seat z's Pichu is charging: turned to a direction, till its turn's clip is
  // over (the hum, asked for while its pose is 1-4: 0x86602324)
  charging(z) {
    const p = this.players[z];
    return this.state === "play" && !p.end && p.pose > 0;
  }
  // a winner's gauge is full from the finish (0x86603604: 61 of its 61)
  won(z) { const f = this.fin(); return !!f && this.lastFrame >= f.at && f.winners[z]; }

  // ---- input ----
  // this device's player pressed A or B (R.A, R.B) with the stick held to dir (0: none)
  press(dir, btn, z = this.me) {
    if (this.state !== "play" || this.control[z] === "remote" || this.cpus[z]) return null;
    const t = this.frame, f = this.fin();
    if (f && t > f.at) return null;
    const r = this.runners[z], res = r.press(t, dir, btn);
    if (!res) {
      // (one with no direction that the latch let through: the turn isn't held on, 0x86601DA0)
      if (!dir && r.last === t) Object.assign(this.players[z], { lastPress: t, lastDir: 0 });
      return null;
    }
    this.sent.push([t, dir, btn]);
    this.pressed(z, t, dir, res);
    this.emit("send", { s: z, f: t, d: dir, b: btn });
    return res;
  }
  // a press that worked (its effects, now)
  pressed(z, t, dir, res) {
    const p = this.players[z];
    if (!p.end && R.liveAt(this.P, t, dir)) this.charged(z, t, p.pose); // (before it turns)
    p.lastPress = t;
    p.lastDir = dir;
    if (p.pose !== dir && !p.end) { // turning to it (the same direction: nothing new)
      p.pose = dir;
      p.dir = dir;
      p.model.play(TURN[dir], { loop: false, restart: true, fade: 0 });
      this.emit("turn", z, dir);
    }
    if (res === "hit") {
      if (this.cpus[z]) this.cpuCharge[z]++;
      p.sparkAt = p.hitAt = t;
      p.spark.position.set(SPARK[z][dir - 1][0], SPARK[z][dir - 1][1], SPARK_Z);
      this.emit("hit", z);
    } else {
      p.sparkAt = -99;
      p.shockAt = t; // (it starts the frame after)
    }
  }

  // ---- the particles (module #64's) ----
  // one, of type 0 or 1, by seat z's Pichu at (x, y) from it, made on frame born
  puff(type, z, born, x, y, roll, size, life) {
    const [w, h] = FX.size[type];
    const mesh = this.spare[type].pop() || makeStrip(type ? this.assets.bolt : this.assets.sparkYellow, 8, w, h);
    if (!mesh.parent) {
      mesh.userData.facing = true; // (turned to the camera as it's drawn: src/facing.js)
      this.scene.add(mesh);
    }
    const p = this.players[z];
    mesh.position.set(p.x + x, p.y + y, PICHU_Z + FX.z);
    mesh.scale.set(size, size, 1);
    mesh.visible = false;
    this.fx.push({ mesh, type, born, life, roll });
  }
  retire(f) {
    f.mesh.visible = false;
    this.spare[f.type].push(f.mesh);
  }
  // seat z's charge on frame t, from its pose then: two bolts
  charged(z, t, pose) {
    const at = CHARGE.at[Math.max(0, pose)] || CHARGE.at[0];
    for (let k = 0; k < CHARGE.n; k++) {
      const a = chargeAngle(pose, rand(0x10000));
      this.puff(1, z, t, at[0] + CHARGE.r * Math.cos(turn(a)), at[1] + CHARGE.r * Math.sin(turn(a)),
        a - 0x3fff, Math.random() * CHARGE.size, rand(5) + 2);
    }
  }
  // seat z's crackle on frame n after the finish (at)
  crackle(z, at, n) {
    const c = CRACKLE[n < ZAP ? 0 : 1];
    const x = c.at[0] + (z & 1 ? 28 : 0), y = c.at[1] - (z >= 2 ? 18 : 0);
    this.puff(0, z, at + n, x, y, rand(31) << 9, Math.random() * c.size, rand(c.life) + 1);
  }

  // the server's word: someone else's press ("press": { s, f, d, b }; to
  // this device's own, o: the frame it said, and x: it didn't count), or the
  // finish ("won": { f, w (the winners, 1 or 0), e (the charges then) })
  told(type, m) {
    if (type === "press") {
      const z = m.s, r = this.runners[z];
      if (!r || !Number.isInteger(m.f) || ![0, 1, 2, 3, 4].includes(m.d) || ![R.A, R.B].includes(m.b)) return;
      if (this.control[z] === "local") { // one of this device's own, as the server has it: the charge again from them all
        // (matched among the last 2 s of them: the server answers about now; one
        // it answers about from long before wasn't this device's)
        const list = this.sent, k = list.findIndex(([f]) => f === m.o && f >= this.lastFrame - 60);
        if (m.x && k < 0) return;
        if (m.x) list.splice(k, 1);
        else if (k >= 0) list[k][0] = m.f;
        else list.push([m.f, m.d, m.b]); // (one it never made here: the server has it, from this device's connection)
        list.sort((a, b) => a[0] - b[0]);
        const again = new R.Runner(this.P);
        for (const [f, d, b] of list) again.press(f, d, b);
        this.runners[z] = again;
        return;
      }
      const res = r.press(m.f, m.d, m.b);
      if (res) this.pressed(z, m.f, m.d, res);
      return;
    }
    if (type === "won") {
      if (!Number.isInteger(m.f) || !Array.isArray(m.w)) return;
      this.result = { at: m.f, winners: m.w.map(Boolean), e: Array.isArray(m.e) ? m.e.map((x) => x | 0) : null };
    }
  }

  // ---- the game, frame by frame ----
  update(dt) {
    if (this.state === "ready") this.intro += dt * R.FPS;
    if (this.state === "play") {
      this.time += dt;
      const to = Math.min(this.frame, this.P.frames - 1);
      for (let t = this.lastFrame + 1; t <= to; t++) { this.step(t); this.lastFrame = t; }
      if (this.time >= this.end) { this.state = "over"; this.emit("finish"); }
    } else if (this.state === "over") this.time += dt;
    // the end, from the finish
    const f = this.fin();
    if (f && this.lastFrame >= f.at) {
      const k = this.time * R.FPS - f.at;
      for (let n = this.after + 1; n <= Math.floor(k); n++) { this.ending(n, f); this.after = n; }
    }
    this.animate(dt);
  }

  // what happens on frame t (from GO)
  step(t) {
    const { list } = this.P;
    for (let i = list.length - 1; i >= 0 && list[i].to >= t - 1; i--) if (list[i].from === t) this.emit("pop", list[i]);
    for (let z = 0; z < 4; z++) {
      const c = this.cpu[z];
      if (!c) continue;
      while (this.cpuAt[z] < c.presses.length && c.presses[this.cpuAt[z]].t === t) {
        const p = c.presses[this.cpuAt[z]++];
        const f = this.fin();
        if (!f || t <= f.at) this.pressed(z, t, p.dir, p.hit ? "hit" : "miss");
      }
    }
  }

  // n frames after the finish
  ending(n, f) {
    const all = f.winners.every(Boolean), losers = this.players.filter((p) => !f.winners[p.i]);
    if (n === 0) {
      this.emit("full", f.winners);
      // (no one turns or charges on: what's playing plays out, then they wait)
      for (const p of this.players) Object.assign(p, { end: { win: f.winners[p.i] }, sparkAt: -99, shockAt: null });
      return;
    }
    // (online, the server's word on who won can come after this device's own guess: go by it from now)
    for (const p of this.players) {
      p.end ||= {};
      p.end.win = f.winners[p.i];
      if (p.end.win) { p.end.zap = null; p.bolt.visible = false; }
    }
    // the losers crackle till they fall
    if (n < FALL) for (const p of losers) this.crackle(p.i, f.at, n);
    if (all) {
      if (n === ALL_CHEER) this.cheer(f);
      return;
    }
    // zapped: their clips by turns under the lightning
    if (n === ZAP) this.emit("zap", f.winners);
    if (n >= ZAP && n < FALL) {
      let k = 0;
      while (k + 1 < ZAP_STEPS.length && ZAP_STEPS[k + 1] <= n) k++;
      // (frame 0 as each starts; 131's is 130's: it's set to fall then)
      const zap = { clip: ZAP_CLIPS[k], frame: ZAP_STEPS.includes(n) || n === FALL - 1 ? 0 : n & 1 };
      for (const p of losers) {
        p.end.zap = zap;
        p.bolt.visible = true;
        this.boltPic = this.boltPic + 1 >= 7 ? rand(7) : this.boltPic + 1;
        p.boltPic = this.boltPic;
      }
    }
    if (JINGLE.includes(n)) this.emit("jingle", JINGLE.indexOf(n));
    if (n === CHEER) this.cheer(f);
    if (n === FALL) {
      for (const p of losers) {
        p.bolt.visible = false;
        p.end.zap = null;
        p.end.fall = n;
        p.model.play(CLIP.fall, { loop: false, restart: true, fade: 0 });
        p.stars.root.visible = true;
        p.stars.play(0, { restart: true, fade: 0 });
      }
    }
  }
  cheer(f) {
    this.emit("cheer", f.winners);
    for (const p of this.players) {
      if (!p.end.win) continue;
      p.end.cheer = true;
      p.model.play(CLIP.win, { restart: true, fade: 0 });
    }
  }

  // ---- every rendered frame ----
  animate(dt) {
    const c = this.time * R.FPS, now = Math.floor(c + 1e-6), t = this.lastFrame, f = this.fin();
    const live = this.state === "play" || this.state === "over";
    this.drawLamps(live ? c : -1, f && t >= f.at ? f.at : null);
    for (const p of this.players) {
      const m = p.model;
      if (live && !p.end) {
        // a miss: shocked from the frame after it, for its clip (clip 10)
        if (p.shockAt !== null && t > p.shockAt) {
          m.play(CLIP.miss, { loop: false, restart: true, fade: 0 });
          p.shockAt = null;
          p.pose = -1;
          this.emit("shock", p.i);
        }
        if (p.pose === -1 && m.done) { p.pose = 0; m.play(CLIP.idle, { fade: 0 }); }
        // a turn: held at its frames 11-12 while charging, else back to waiting at its end
        if (p.pose > 0) {
          const holding = this.cpus[p.i] || (p.lastDir > 0 && t - p.lastPress <= HELD);
          if (holding && m.frame() >= HOLD + 1) m.seek(HOLD + ((m.frame() - HOLD) % 1));
          else if (m.done) { p.pose = 0; m.play(CLIP.idle, { fade: 0 }); }
        }
      }
      const e = p.end;
      if (e) {
        if (e.zap) m.pose(e.zap.clip, e.zap.frame); // (its speed 0: 0x86604E70)
        else if (e.fall !== undefined) {
          // fallen (clip 9), then dizzy (clip 11), each jumping on as the game does
          if (m.clip === CLIP.fall && m.frame() >= FALL_TO + 1) m.play(CLIP.dizzy, { from: rand(24) + m.frame() - FALL_TO - 1, restart: true, fade: 0 });
          else if (m.clip === CLIP.dizzy && m.frame() >= DIZZY_TO + 1) m.seek(rand(19) + m.frame() - DIZZY_TO - 1);
        } else if (!e.cheer && m.done) m.play(CLIP.idle, { fade: 0 }); // (a clip that's run out: 0x86604A38)
      }
      // the spark, a few frames after a hit (a new picture each frame); the lightning
      p.spark.visible = live && !e && t - p.sparkAt < SPARK_FRAMES;
      if (p.spark.visible && p.sparkPic[0] !== now) { p.sparkPic = [now, rand(7)]; p.spark.userData.show(p.sparkPic[1]); }
      if (p.bolt.visible) p.bolt.userData.show(p.boltPic);
      m.update(dt);
      if (p.stars.root.visible) {
        const a = Math.max(0, Math.min(1, (c - f.at - e.fall) * STARS.fade));
        p.stars.root.traverse((o) => { if (o.isMesh) o.material.opacity = a; });
        p.stars.update(dt, false);
      }
    }
    // the particles: their pictures by age, type 0's turning
    this.fx = this.fx.filter((x) => {
      const k = now - x.born;
      if (!live || k > x.life || k < -1) { this.retire(x); return false; }
      x.mesh.visible = k >= 0;
      if (!x.mesh.visible) return true;
      x.mesh.userData.show((k >> 1) & 7);
      const roll = x.roll + (x.type ? 0 : FX.spin * (c - x.born));
      x.mesh.quaternion.setFromAxisAngle(AXIS_Z, turn(roll));
      return true;
    });
    this.frame3d.update(dt, false);
  }

  // the lamps and the sign at frame tf (and part of the way to the next);
  // fin: the finish's frame, once it's come
  drawLamps(tf, fin = null) {
    const t = Math.floor(tf), k = tf - t;
    for (let d = 1; d <= 4; d++) {
      const a = this.lampAt(d, t, fin), b = this.lampAt(d, t + 1, fin);
      // (part of the way to the next frame's clip frame, if it's the next or the same)
      const f = Math.abs(b.f - a.f) <= 1 ? a.f + (b.f - a.f) * k : a.f;
      for (let z = 0; z < 4; z++) {
        const m = this.lamps[z][d - 1];
        m.pose(0, f);
        m.face(0, a.face);
        m.update(0, false);
      }
    }
    for (let n = 0; n < 2; n++) this.frame3d.face(n, SIGN[n][this.signAt(n, t, fin)]);
  }
  // the sign's colour n (A, B) on frame t: its texanim's frame (0-5). It's
  // restarted every 6 frames with the colours live then, and otherwise plays
  // on to its end, dim, and stays; from the finish, it isn't restarted
  signAt(n, t, fin = null) {
    if (t < 0) return 0;
    const at = Math.min(t, fin ?? t), from = at - (at % 6), want = n ? R.B : R.A;
    for (let d = 1; d <= 4; d++) if (this.lampAt(d, from).btn === want) return Math.min(5, t - from);
    return 5;
  }
  // direction d's lamp on frame t (whole): its clip's frame, its face, and
  // its button while it's live; fin: the finish's frame, once it's come
  lampAt(d, t, fin = null) {
    if (fin !== null && t > fin) {
      const s = this.lampAt(d, fin), n = t - fin;
      if (n >= LAMPS_IN) return { f: 0, face: RED, btn: 0 };
      return { f: Math.min(IN, s.f + n), face: s.tex === null ? RED : LAMP_FACE[s.btnOf][Math.min(LOOP, s.tex + n)], btn: 0 };
    }
    const list = this.P.list;
    let e = null;
    for (let i = list.length - 1; i >= 0 && t >= 0; i--) {
      const x = list[i];
      if (x.to < t - 200) break;
      if (x.dir === d && x.from < t) { e = x; break; } // (its callback sees it popped from the frame after)
    }
    if (!e) return { f: IN, face: RED, tex: null, btn: 0 };
    const live = t <= e.to, a = t - e.from;
    let f, tex;
    if (t <= e.close) { // popping out (held in for 4 frames, then 1-4), its face looping once it's let out
      f = a <= WAIT ? 0 : Math.min(OUT, a - WAIT);
      tex = a > WAIT ? (a - WAIT - 1) % LOOP : null;
    } else { // going back in: 5 for 4 frames, then 6-8; its face plays on to red
      const b = t - e.close, at = e.close - e.from;
      f = b <= WAIT ? 5 : Math.min(IN, 5 + b - WAIT);
      tex = Math.min(LOOP, (at > WAIT ? (at - WAIT - 1) % LOOP : LOOP) + b);
    }
    return { f, face: tex === null ? RED : LAMP_FACE[e.btn][tex], tex, btnOf: e.btn, btn: live ? e.btn : 0 };
  }

  // the camera: the opening glide's way along (0 at the start, 1 the game's view)
  get glide() {
    if (this.state !== "ready") return 1;
    return Math.max(0, Math.min(1, (this.intro - GLIDE.from) / GLIDE.frames));
  }
  camera() {
    const k = this.glide, lerp = (a, b) => a.map((x, n) => x + (b[n] - x) * k);
    return { eye: lerp(START.eye, VIEW.eye), at: lerp(START.at, VIEW.at) };
  }

  // ---- the end ----
  results() {
    const sc = [0, 1, 2, 3].map((z) => this.charge(z));
    return sc.map((score, i) => ({ i, score, place: 1 + sc.filter((x) => x > score).length }));
  }
  celebrate() { return this.results(); }
}
