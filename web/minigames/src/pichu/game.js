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
import * as THREE from "three";
import { makeModel, makeStrip } from "./assets.js";
import { dress } from "../n64fx.js";
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
const OUT = 4, IN = 8;
// its face: red when it's dead, and while it's live blue (A) or green (B),
// pulsing (the face clips' first five frames, looped: 0x866023F4)
const RED = 2, LAMP_FACE = { [R.A]: [3, 4, 5, 5, 4], [R.B]: [6, 7, 8, 8, 7] };
// the sign's A and B (object 56's face channels 0 and 1): dim, or pulsing
// while a lamp of that colour is live, restarted every 6 frames (0x86601910)
const SIGN = [[6, 7, 8, 8, 7, 6], [9, 10, 11, 11, 10, 9]];
// Pichu's clips; a turn's clip by direction, held on its frames 11-12 while
// charging (a CPU, or a person who pressed in the last 20 frames: 0x86601A04)
const CLIP = { idle: 0, win: 5, zap: 6, shock: 9, miss: 10, dizzy: 11 };
const TURN = { 1: 3, 2: 4, 3: 1, 4: 2 };
const HOLD = 11, HELD = 20;
// the spark by a Pichu that charges (image bank 224, 6x a 60 x 60 quad), by
// player and direction (0x86606B80, 0x86606BC0), a random picture of 0-6 each frame
const SPARK = [0, 1, 2, 3].map((p) => [[-280, 274], [-280, 134], [-140, 204], [-420, 204]]
  .map(([x, y]) => [x + (p % 2) * 600, y - (p >= 2 ? 460 : 0)]));
const SPARK_SIZE = 360, SPARK_Z = 150, SPARK_FRAMES = 4; // (shown a few frames after each hit here)
// the lightning that zaps the losers (bank 225, 12 x 8 times a 30 x 90 quad,
// yellow: 0x86606DF4, 0x86606E14), from the top corner on its side
const BOLT = [[-510, 550], [510, 550], [-510, 70], [510, 70]];
const BOLT_TURN = [0x1c00, 0x6c00, 0x1c00, 0x6c00].map((a) => (a / 0x10000) * 2 * Math.PI);
const BOLT_Z = 150;
// the dizzy stars over a loser (object 190), made for the remake: where and how big
const STARS = { y: 230, scale: 0.25 };
// the end (0x866049D4), in frames from the finish: the losers are zapped at
// 50 (the round's end here) with the first of the jingle's four parts (the
// others at 70, 90 and 110), and at 130 (80 if all four won, with no zap and
// no jingle) the winners cheer and the losers are left dizzy
const ZAP = R.END, JINGLE = [ZAP, 70, 90, 110], CHEER = 130, ALL_CHEER = 80;
// the opening glide (0x86605ABC): from preset 1 to the game's view over 50
// frames, during the countdown here
export const VIEW = { eye: [0, 50, 2210], at: [0, 50, 0] };
const START = { eye: [750, 300, 900], at: [60, 60, 50] };
const GLIDE = { from: 18, frames: 50 }; // (frames after the countdown starts)

export class Game {
  constructor(scene, assets) {
    this.scene = scene;
    this.assets = assets;
    this.listeners = {};
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
      stars.root.position.set(x, y + STARS.y, PICHU_Z);
      stars.root.visible = false;
      dress(assets.fx, stars.root, "stars"); // (its halos and stars, each its layer's recipe: 190's callbacks)
      scene.add(model.root, spark, bolt, stars.root);
      return { i, model, spark, bolt, stars };
    });
    this.reset("normal");
    this.state = "idle";
  }
  on(name, fn) { (this.listeners[name] ||= []).push(fn); }
  emit(name, ...args) { for (const fn of this.listeners[name] || []) fn(...args); }

  // A game. level: easy / normal / hard; setup: { me, control, cpus (which
  // seats are CPUs), told (online, the server's word so far: to rejoin it midway) }
  reset(level, seed = (Math.random() * 2 ** 31) | 0, setup = {}) {
    this.levelName = level;
    this.seed = seed;
    this.me = setup.me ?? 0;
    this.control = setup.control || [0, 1, 2, 3].map((z) => (z === this.me ? "local" : "cpu"));
    this.cpus = setup.cpus || this.control.map((c) => c === "cpu");
    this.c = R.levelCode(level, this.cpus.some(Boolean));
    this.P = R.pattern(seed, this.c);
    this.cpu = R.cpuPresses(seed, this.c, this.cpus, this.P);
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
    for (const p of this.players) {
      Object.assign(p, { pose: 0, dir: 0, lastPress: -99, shockAt: null, sparkAt: -99, end: null });
      p.model.play(CLIP.idle, { from: Math.random() * 24, restart: true, fade: 0 }); // (rand2 % 25)
      p.spark.visible = p.bolt.visible = p.stars.root.visible = false;
    }
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
  get end() { const f = this.fin(); return f ? (f.at + R.END) / R.FPS : this.P.frames / R.FPS; }
  // seat z's charge now (after the finish, then)
  charge(z) {
    const f = this.fin();
    if (f && this.result?.e && this.lastFrame >= f.at) return this.result.e[z];
    if (this.scores && this.state === "over") return this.scores[z];
    return this.cpus[z] ? this.cpuCharge[z] : this.runners[z].charge;
  }
  // seat z's Pichu is charging: turned to a direction and pressing (the hum, 0x86602260)
  charging(z) {
    const p = this.players[z];
    return this.state === "play" && !p.end && p.pose > 0 && (this.cpus[z] || this.lastFrame - p.lastPress <= HELD);
  }
  // a winner's gauge is full from the finish (0x86603604: 61 of its 61)
  won(z) { const f = this.fin(); return !!f && this.lastFrame >= f.at && f.winners[z]; }

  // ---- input ----
  // this device's player pressed A or B (R.A, R.B) with the stick held to dir (0: none)
  press(dir, btn, z = this.me) {
    if (this.state !== "play" || this.control[z] === "remote" || this.cpus[z]) return null;
    const t = this.frame, f = this.fin();
    if (f && t > f.at) return null;
    const res = this.runners[z].press(t, dir, btn);
    if (!res) return null;
    this.sent.push([t, dir, btn]);
    this.pressed(z, t, dir, res);
    this.emit("send", { s: z, f: t, d: dir, b: btn });
    return res;
  }
  // a press that worked (its effects, now)
  pressed(z, t, dir, res) {
    const p = this.players[z];
    p.lastPress = t;
    if (p.pose !== dir && !p.end) { // turning to it (the same direction: nothing new)
      p.pose = dir;
      p.dir = dir;
      p.model.play(TURN[dir], { loop: false, restart: true, fade: 0.05 });
      this.emit("turn", z, dir);
    }
    if (res === "hit") {
      if (this.cpus[z]) this.cpuCharge[z]++;
      p.sparkAt = t;
      p.spark.position.set(SPARK[z][dir - 1][0], SPARK[z][dir - 1][1], SPARK_Z);
      this.emit("hit", z);
    } else {
      p.sparkAt = -99;
      p.shockAt = t; // (it starts the frame after)
    }
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
    const all = f.winners.every(Boolean);
    if (n === 0) {
      this.emit("full", f.winners);
      for (const p of this.players) {
        Object.assign(p, { end: { win: f.winners[p.i] }, sparkAt: -99, shockAt: null, pose: 0 });
        p.model.play(CLIP.idle, { fade: 0.15 });
      }
    }
    // the losers zapped: their clip 6 (three frames, over and over) under the lightning
    if (!all && n === ZAP) {
      this.emit("zap", f.winners);
      for (const p of this.players) {
        if (p.end.win) continue;
        p.model.play(CLIP.zap, { restart: true, fade: 0 });
        p.bolt.visible = true;
      }
    }
    if (!all && JINGLE.includes(n)) this.emit("jingle", JINGLE.indexOf(n));
    if (n === (all ? ALL_CHEER : CHEER)) {
      this.emit("cheer", f.winners);
      for (const p of this.players) {
        p.bolt.visible = false;
        if (p.end.win) p.model.play(CLIP.win, { restart: true, fade: 0.1 });
        else {
          p.model.play(CLIP.shock, { loop: false, restart: true, fade: 0.1 });
          p.stars.root.visible = true;
          p.stars.play(0, { restart: true, fade: 0 });
          p.end.dizzy = true;
        }
      }
    }
  }

  // ---- every rendered frame ----
  animate(dt) {
    const between = this.state === "play" ? Math.max(0, Math.min(1, this.time * R.FPS - this.lastFrame)) : 0;
    const t = this.lastFrame, live = this.state === "play" || this.state === "over", f = this.fin();
    // (the lamps and the sign stop at the finish: they move only in the play)
    this.drawLamps(!live ? -1 : f && t >= f.at ? f.at : t + between);
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
        if (p.pose === -1 && m.done) { p.pose = 0; m.play(CLIP.idle, { fade: 0.1 }); }
        // a turn: held at its frames 11-12 while charging, else back to waiting at its end
        if (p.pose > 0) {
          const holding = this.cpus[p.i] || t - p.lastPress <= HELD;
          if (holding && m.frame() >= HOLD + 1) m.seek(HOLD + ((m.frame() - HOLD) % 1));
          else if (m.done) { p.pose = 0; m.play(CLIP.idle, { fade: 0.1 }); }
        }
      }
      if (p.end?.dizzy && m.clip === CLIP.shock && m.done) m.play(CLIP.dizzy, { from: Math.random() * 24, fade: 0.1 });
      // the spark, a few frames after a hit; the bolt flickering
      p.spark.visible = live && !p.end && t - p.sparkAt < SPARK_FRAMES;
      if (p.spark.visible) p.spark.userData.show((Math.random() * 7) | 0);
      if (p.bolt.visible) {
        p.bolt.userData.show((Math.random() * 7) | 0);
        p.bolt.material.opacity = Math.floor(this.time * R.FPS) % 2 ? 1 : 0.55;
      }
      m.update(dt);
      if (p.stars.root.visible) p.stars.update(dt, false);
    }
    this.frame3d.update(dt, false);
  }

  // the lamps and the sign at frame tf (and part of the way to the next)
  drawLamps(tf) {
    const t = Math.floor(tf), lit = [false, false];
    for (let d = 1; d <= 4; d++) {
      const s = this.lampAt(d, tf);
      for (let z = 0; z < 4; z++) {
        const m = this.lamps[z][d - 1];
        m.pose(0, s.f);
        m.face(0, s.face);
        m.update(0, false);
      }
      if (s.btn) lit[s.btn === R.A ? 0 : 1] = true;
    }
    for (let k = 0; k < 2; k++) this.frame3d.face(k, lit[k] ? SIGN[k][((t % 6) + 6) % 6] : SIGN[k][0]);
  }
  // direction d's lamp at frame tf: its clip's frame, its face, and its button while it's live
  lampAt(d, tf) {
    const t = Math.floor(tf), list = this.P.list;
    let e = null;
    for (let i = list.length - 1; i >= 0 && t >= 0; i--) {
      const x = list[i];
      if (x.to < t - 200) break;
      if (x.dir === d && x.from <= t) { e = x; break; }
    }
    if (!e) return { f: IN, face: RED, btn: 0 };
    const f = t >= e.close ? Math.min(IN, 5 + (tf - e.close)) : Math.min(OUT, tf - e.from);
    const live = t <= e.to;
    return { f, face: live ? LAMP_FACE[e.btn][(t - e.from) % 5] : RED, btn: live ? e.btn : 0 };
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
