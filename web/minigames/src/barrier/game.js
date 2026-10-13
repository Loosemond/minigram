// A Barrier Ball game: the world (rules.js) on the round's clock, and the
// scene it drives. The court is the plane z = 0 seen from straight above, as
// the game has it (from (0, 0, 2000), fov 15); the remake turns the view so
// this device's player's corner is at the bottom (the game's own has 1P's at
// the top left), its lane across the screen. In the game's units.
//
// Who plays each seat: "local" (this device's player), "cpu" or "remote"
// (someone on another device, online). The CPUs think in the world, so every
// device runs them alike. This device's player's pad emits "send" as it
// changes (a frame's stick, and a smash); online, the others' come in
// told("pad"), mostly a few frames late: the world runs on guessing they held
// their stick and didn't smash, and runs again from a saved frame when one
// comes in (the Mr. Mime and the balls eased to where they really are). The
// server runs the same world and says how it ended (told("won")).
import * as THREE from "three";
import { makeModel, piece, shutWall, COURT_PIECES } from "./assets.js";
import { combiner, dress } from "../n64fx.js";
import * as R from "./rules.js";
import { leadFor } from "../lag.js";
import { faceOnRender } from "../facing.js";

// frames after the end before the round's over: the results come up over the
// scene, which runs on (0x863024A8: the world's handOver, a frame later if a
// ball went just after the end)
export const AFTER = R.AFTER;
const EYE = 2000;
const MIME = 0.15; // Mr. Mime's scale (0x86301B3C); its barrier is drawn in its place (0x86300FB4)
const COURT = 0.1; // the court's pieces' (0x863006F8)
const BALL_Z = 100; // the balls fly 100 above the court (0x86306D3C)
// the walls' places (0x863005B8: 180 from the middle, at 90, 180, 270 and 360 degrees)
const WALLS = { wall_top: [0, R.HUB], wall_left: [-R.HUB, 0], wall_bottom: [0, -R.HUB], wall_right: [R.HUB, 0] };
// the clips. Mr. Mime in the play (object 218): 0 behind its barrier, 1 a
// smash; in the countdown and at the end (129): 0 miming, 1 putting up its
// barrier, 2 a win, 3 a loss (slower: 0x28 to 0x40). Its barrier (141): 0 a
// smash, 1 coming up, 2 held, 3 and 4 gone (0x863010A8, 0x86301250, 0x863013C8)
const PLAY = { stand: 0, smash: 1 }, SHOW = { mime: 0, up: 1, win: 2, lose: 3 }, BAR = { smash: 0, up: 1, held: 2, win: 3, lose: 4 };
const LOSE_RATE = 0x28 / 0x40;
// a smash's clip starts on its step and goes back to standing (clip 0, from
// its start) on the step its timer's 25 (0x86301814); its last frame is 10
const SMASH_POSE = 25, SMASH_LAST = 10;
// the countdown (module #64's: GO 80 frames after it starts): the Mr. Mime
// come on at its start (0x863035B0) all miming at 2x (0x86301BD0: clip 0's 70
// frames in 35), no barrier yet; on the next frame clip 1, the barrier coming
// up (1) with it, 39 frames (0x863010A8); then the play's (218 standing, the
// barrier held: 0x863011A4), 5 frames before GO, so its standing clip is 6
// frames on in the play's first
export const INTRO = 80;
const MIME_RATE = 2, MIME_FOR = 36, UP_LEN = 39, STAND_AT_GO = 6;
// the end puts texture clip 0 on Mr. Mime's face, winners and losers alike
// (0x86301374): its mouth shut (9) for 40 frames, then open (10)
const FACE = { shut: 9, open: 10, at: 40 };
// a ball's glow, in its last hitter's colours (grey for nobody: 0x86306FB8, 8
// bytes each, prim then env), made with the ball (0x86304544). Each step
// (0x863043E4) it goes where the ball is and leaves a copy there, its trail
// (0x86304318: 0.8 x its size, its hitter's prim), which lives 8 steps
// (0x8630421C: alpha 200 x (1 - its age in steps / 7)); at the end, in the
// first step after it, the glow leaves its last copy and goes (0x8630452C).
// A smashed ball has a colour laid over it (0x863063C0: white for 3 steps,
// then by its hitter, white for none; by 255 - its steps / 60 x 255)
const GLOW_COLOURS = [0xc8c8c8, 0x6987ff, 0x55eb55, 0xff6969, 0xfff555];
const GLOW_PRIM = GLOW_COLOURS.map((c) => new THREE.Color(c));
const GLOW_ENV = [0xc8c8c8, 0x5569cd, 0x4bc34b, 0xcd5555, 0xcdc34b].map((c) => new THREE.Color(c));
const TRAIL_LIFE = 8, TRAIL_ALPHA = 200 / 255;
// how they're drawn: image bank 151 (I8) on a quad (0x87F08E3C) in render
// layer 9 (geo 0x86306F50, 0x86306F84: ZB_CLD_SURF, blended by its alpha),
// through G_SETCOMBINE FC309BFF 5FFEFE38 for the glow (0x86303F50: colour env
// + (prim - env) x its picture, alpha its picture x env's, the glow's own
// alpha, 0xFF: 0x86304544) and FC371BFF 5FFEFE38 for a copy (0x863040C4:
// colour env + (prim - env) x the prim LOD fraction, which it sets to its
// alpha, env white; alpha its picture x env's, its alpha). So a copy is its
// hitter's prim colour by its alpha over white: 78% when new, whiter as it
// fades. Its factor's the same over the whole quad, so it's worked out here
// and handed in as env (TRAIL_SPEC: colour env, alpha its picture x env's)
const glowSpec = (mux) => ({ mux, prim: [255, 255, 255, 255], env: [255, 255, 255, 255],
  textures: [{ file: "glow.png", size: [32, 32], sf: [1, 1], wrap: [2, 2], fmt: 4 }] });
const GLOW_SPEC = glowSpec([3, 5, 1, 5, 1, 7, 5, 7, 15, 15, 31, 0, 7, 7, 7, 0]);
const TRAIL_SPEC = glowSpec([3, 5, 31, 5, 1, 7, 5, 7, 15, 15, 31, 0, 7, 7, 7, 0]);
const FLASH = [0xaaaaff, 0xaaffaa, 0xffaaaa, 0xffffaa].map((c) => new THREE.Color(c));
const WHITE = new THREE.Color(0xffffff);
// a glow's size: bank 151's quad, its picture's 32 units (0x87F08E3C), at 2.6 x the ball's scale
// (0x863043E4: 58 round a full-size ball, 0.7); its trail's 0.8 x that (0x86304318)
const GLOW = 32 * 2.6, TRAIL = 0.8;
const SNAP = 6; // frames between the world's saved states (for running it again)
const KEEP = 20 * R.FPS; // and how far back they go
const SMOOTH = 0.82; // a corrected ball's ease to where it is, a 60th of a second
const SMOOTH_MIME = 0.88; // and a Mr. Mime's (gentler: a stick on its way shifts it a little at a time)
const deg = (a) => (a / 0x10000) * 2 * Math.PI;
// (the remake's) the wall shutting an empty seat's lane at its mouth (rules.js
// SHUT): as high as the court's walls (object 120's, 14 x 0.1 x 100), this thick
const SHUT_HIGH = 140, SHUT_THICK = 24;

export class Game {
  constructor(scene, assets) {
    this.scene = scene;
    this.assets = assets;
    this.listeners = {};
    const add = (o) => { scene.add(o); return o; };
    faceOnRender(scene); // (the ball's glint: its joint drawn facing the camera, however the ball turns)
    // the court
    for (const name of COURT_PIECES) {
      const p = add(piece(assets[name], COURT));
      if (WALLS[name]) p.position.set(WALLS[name][0], WALLS[name][1], 0);
    }
    // the Mr. Mime, each with its two models and its barrier
    this.mimes = R.SEATS.map((s) => {
      const root = add(new THREE.Group());
      const v = { root, play: makeModel(assets.mime, MIME), show: makeModel(assets.mime_show, MIME), bar: makeModel(assets.barrier, MIME) };
      for (const k of ["play", "show", "bar"]) { v[k].model.rotation.x = Math.PI / 2; root.add(v[k].root); }
      v.barMats = dress(assets.fx, v.bar.model, "barrier"); // (its two layers' recipes: 141's callbacks)
      root.rotation.z = (s.angle * Math.PI) / 180;
      return v;
    });
    // the empty seats' lanes' walls (shown in reset())
    this.shut = R.SHUT.map((e) => {
      const len = Math.hypot(e.bx - e.ax, e.by - e.ay), wall = add(shutWall(assets.lines, len, SHUT_THICK, SHUT_HIGH));
      wall.position.set((e.ax + e.bx) / 2, (e.ay + e.by) / 2, 0);
      wall.rotation.z = Math.atan2(e.by - e.ay, e.bx - e.ax); // (its face, +y, the way of n: towards the middle)
      wall.visible = false;
      return wall;
    });
    // the balls and their glows, by the world's ids; the trail's sprites
    this.balls = new Map();
    this.freeBalls = [];
    this.trails = [];
    this.reset("normal");
    this.state = "idle";
  }
  on(name, fn) { (this.listeners[name] ||= []).push(fn); }
  emit(name, ...args) { for (const fn of this.listeners[name] || []) fn(...args); }

  // A game. level: easy / normal / hard; setup: { me, control, cpus (which
  // seats are CPUs), empty (which have no one: no Mr. Mime, the lane shut),
  // told (online, the server's word so far: to rejoin it midway) }
  reset(level, seed = (Math.random() * 2 ** 31) | 0, setup = {}) {
    this.levelName = level;
    this.seed = seed;
    this.me = setup.me ?? 0;
    this.control = setup.control || [0, 1, 2, 3].map((z) => (z === this.me ? "local" : "cpu"));
    this.empty = [0, 1, 2, 3].map((z) => !!setup.empty?.[z] || this.control[z] === "none");
    this.cpus = (setup.cpus || this.control.map((c) => c === "cpu")).map((c, z) => c && !this.empty[z]);
    // (online, with other people: this device's player's pads count this many frames on, src/lag.js)
    this.lead = leadFor(this.control.map((c, z) => c === "remote" && !this.cpus[z]), setup.delay);
    this.stats = { rewinds: 0, again: 0, mimes: 0, balls: 0, most: 0, heard: 0, late: 0 }; // (for the tests: runs again, frames run again, how far things were put right, others' pads heard, late)
    this.world = new R.World(seed, level, this.cpus, this.empty);
    this.mimes.forEach((v, z) => { v.root.visible = !this.empty[z]; });
    this.shut.forEach((wall, z) => { wall.visible = this.empty[z]; });
    this.world.onStep = (t, k) => this.noteStep(t, k);
    // where each ball was after each of its last 16 steps (id -> by step & 15), and the trail's
    // copies ("id:step" -> { g: the step, x, y, s: its size, c: its colour })
    this.trace = new Map();
    this.copies = new Map();
    this.endScores = null; // the points as the play ended (the world's)
    this.dance = null; // at the end, each Mr. Mime's: { at: the frame its end clip starts, win }
    this.inputs = [[], [], [], []]; // each person's pad: [frame, stick x, A 0/1]
    this.snaps = [[0, this.world.save()]]; // the world as it was before a frame
    this.simT = -1; // the last frame the world has run
    this.shownT = -1; // and whose sounds have gone
    this.stick = 0; // this device's player's stick (-64-64, along its lane: + is +x)...
    this.target = null; // ...or the lane x it's heading for (a finger, the mouse)
    this.smashes = 0; // its A presses not yet in a frame
    this.lastX = 0;
    this.result = null; // the server's word on the end: { f, p }
    this.scores = null;
    this.time = 0;
    this.state = "ready";
    this.lastFrame = -1;
    this.intro = 0; // frames since the countdown started
    this.clockS = 0; // s on show (the idle miming, the barrier's shimmer)
    this.endAt = null; // when the end began (s of this.time)
    this.winners = null;
    this.tempoN = 0;
    this.before = null; // where things were before the last frame (to draw between)
    this.offsets = [0, 1, 2, 3].map(() => [0, 0]);
    this.ballOffsets = new Map();
    for (const [, v] of this.balls) this.freeBall(v);
    this.balls.clear();
    for (const s of this.trails) s.sprite.visible = false;
    const told = setup.told;
    if (told?.pads) told.pads.forEach((list, z) => { if (list && !this.cpus[z] && !this.empty[z]) this.inputs[z] = list.map((e) => [...e]); });
    if (told?.done) this.told("won", told.done);
    this.draw(0);
  }
  start() { this.state = "play"; this.intro = Infinity; }
  stop() { this.state = "over"; }
  setControl(z, c) {
    if (this.empty[z] || (c === "cpu" && !this.cpus[z])) return; // (a person who left: their Mr. Mime keeps their last stick)
    this.control[z] = c;
  }

  get frame() { return Math.floor(this.time * R.FPS + 1e-6); }

  // ---- input ----
  // this device's player: the stick (-64-64 along its lane), or a spot in its lane to go to; and a smash (A)
  setStick(x) { this.stick = Math.max(-64, Math.min(64, Math.round(x))); this.target = null; }
  setTarget(x) {
    const m = this.world.m[this.me];
    this.target = x === null ? null : Math.max(m.xmin, Math.min(m.xmax, x));
  }
  smash() { if (this.state === "play") this.smashes = Math.min(2, this.smashes + 1); }
  // seat z's pad on frame t: [stick x, A]
  padAt(z, t) {
    const list = this.inputs[z];
    let i = list.length - 1;
    while (i >= 0 && list[i][0] > t) i--;
    if (i < 0) return [0, false];
    let a = false;
    for (let j = i; j >= 0 && list[j][0] === t; j--) if (list[j][2]) a = true;
    return [list[i][1], a];
  }

  // the server's word: someone's pad ("pad": { s, f, x, a }; to this device's
  // own, o: the frame it said), or the end ("won": { f, p: each one's points })
  told(type, m) {
    if (type === "pad") {
      const z = m.s;
      if (!(z >= 0 && z < 4) || this.cpus[z] || this.empty[z] || !Number.isInteger(m.f) || !Number.isInteger(m.x) || (m.a !== 0 && m.a !== 1)) return;
      const list = this.inputs[z];
      let k = list.length;
      if (this.control[z] === "local") { // one of this device's own, as the server has it (on another frame)
        // (they stay in the order they were made, as the server keeps them: it never puts one on a
        // frame before the last one's, so they're in order again once it's told of each one it moved)
        const j = list.findIndex((e) => e[3] === m.o && e[1] === m.x && e[2] === m.a);
        if (j >= 0) {
          list[j][0] = m.f;
          this.rewind(Math.min(m.f, m.o));
          return;
        }
      } // (else one it never made here: the server has it, from this device's connection)
      while (k > 0 && list[k - 1][0] > m.f) k--;
      list.splice(k, 0, [m.f, m.x, m.a]);
      this.stats.heard++;
      if (m.f <= this.simT) this.stats.late++; // (for a frame already run)
      this.rewind(m.f);
      return;
    }
    if (type === "won") {
      if (!Number.isInteger(m.f) || !Array.isArray(m.p)) return;
      this.result = { f: m.f, p: m.p.map((x) => (Number.isInteger(x) ? x : 0)) };
    }
  }
  // the world again from before frame f (a pad it ran without); where things
  // were is kept, to ease them to where they turn out to be
  rewind(f) {
    if (f > this.simT) return;
    if (!this.was) this.was = { t: this.simT, at: this.positions() };
    while (this.snaps.length > 1 && this.snaps[this.snaps.length - 1][0] > f) this.snaps.pop();
    const [at, state] = this.snaps[this.snaps.length - 1];
    this.stats.rewinds++;
    this.stats.again += this.simT - at + 1;
    this.world.load(state);
    this.simT = at - 1;
    for (const [k, c] of this.copies) if (c.g >= at * R.STEPS) this.copies.delete(k); // (made again as it runs)
  }
  positions() {
    const w = this.world;
    return { m: w.m.map((m) => [m.x, m.y]), b: new Map(w.balls.map((b) => [b.id, [b.x, b.y]])) };
  }
  // run the world up to frame t (on past the end too: the balls slow down, for the show)
  runTo(t) {
    const w = this.world;
    while (this.simT < t) {
      const f = this.simT + 1;
      if (w.end === null && f % SNAP === 0 && f > this.snaps[this.snaps.length - 1][0]) {
        this.snaps.push([f, w.save()]);
        while (this.snaps.length > 2 && this.snaps[1][0] < f - KEEP) this.snaps.shift();
      }
      if (f === t) this.before = this.positions();
      w.step(f, [0, 1, 2, 3].map((z) => (this.cpus[z] || this.empty[z] ? null : this.padAt(z, f))));
      if (w.end === f) this.endScores = w.scores; // (the dance's: not a goal in the first step after, ending())
      this.simT = f;
      if (f > this.shownT) { this.sounds(f); this.shownT = f; }
      w.events = [];
      if (this.was && f === this.was.t) { // (run again to where it was: ease things from there)
        w.m.forEach((m, z) => {
          this.offsets[z][0] += this.was.at.m[z][0] - m.x;
          this.offsets[z][1] += this.was.at.m[z][1] - m.y;
          const moved = Math.hypot(this.was.at.m[z][0] - m.x, this.was.at.m[z][1] - m.y);
          this.stats.mimes += moved;
          this.stats.most = Math.max(this.stats.most, moved);
        });
        for (const b of w.balls) {
          const p = this.was.at.b.get(b.id);
          if (!p) continue;
          const o = this.ballOffsets.get(b.id) || [0, 0];
          this.ballOffsets.set(b.id, [o[0] + p[0] - b.x, o[1] + p[1] - b.y]);
          const moved = Math.hypot(p[0] - b.x, p[1] - b.y);
          this.stats.balls += moved;
          this.stats.most = Math.max(this.stats.most, moved);
        }
        this.was = null;
      }
    }
  }
  // frame f's sounds (once each), and the tune's hurry in the last 30 s
  // (0x80028108(6): a beat a minute faster every 25 frames, up to 18)
  sounds(f) {
    const w = this.world;
    const ballAt = (id) => w.balls.find((b) => b.id === id) || { x: 0, y: 0 };
    for (const [what, z, id, o] of w.events) {
      if (what === "count") { this.emit("sound", "lastCount"); continue; }
      const at = z >= 0 && (what === "smash" || what === "swish") ? w.m[z] : ballAt(id);
      this.emit(what, z, this.pan(at.x, at.y), o);
    }
    if (w.end === null && w.time < R.HURRY - 1) {
      const n = Math.min(18, Math.floor((R.HURRY - 2 - w.time) / 25) + 1);
      if (n !== this.tempoN) { this.tempoN = n; this.emit("tempo", n); }
    }
  }
  // a sound's pan: where it is across this device's screen
  pan(x, y) {
    const n = R.SEATS[this.me].n, across = x * n[1] - y * n[0];
    return Math.round(64 + Math.max(-63, Math.min(63, (across / 375) * 63)));
  }

  // ---- the game, frame by frame ----
  update(dt) {
    if (this.state === "ready") this.intro += dt * R.FPS;
    this.clockS += dt;
    if (this.state === "play") {
      this.time += dt;
      const now = this.frame;
      for (let t = this.lastFrame + 1; t <= now; t++) { this.step(t); this.lastFrame = t; }
      this.runTo(this.lastFrame); // (after a pad that came in late)
      const at = this.handOver();
      if (at !== null && this.frame >= at) { this.state = "over"; this.emit("finish"); }
    } else if (this.state === "over") {
      this.time += dt;
      // (the scene runs on under the results: the balls slowing, the dance)
      for (let t = this.lastFrame + 1; t <= this.frame && this.world.end !== null; t++) { this.runTo(t); this.lastFrame = t; }
    }
    const ended = this.world.end !== null || (this.result && this.lastFrame >= this.result.f);
    if (ended && this.endAt === null) this.ending();
    else if (!ended && this.endAt !== null) { this.endAt = null; this.winners = null; this.dance = null; } // (run again: not over after all)
    this.animate(dt);
  }
  // the frame the play ended on: the server's, else this device's world's
  endFrame() { return this.result ? this.result.f : this.world.end; }
  // and the frame the results come up on: the world's (once it's ended), else 8 after the server's end
  handOver() {
    if (this.world.end !== null) return this.world.handOver;
    return this.result ? this.result.f + AFTER : null;
  }

  // what happens on frame t (from GO): this device's player's pad is kept (and sent) for frame
  // t + LEAD, and the world runs. (Online, the others' devices have it before they get to that
  // frame, mostly, so they needn't run the world again: see LEAD.) Going for a target (the mouse,
  // or a finger), the pad's worked out from where Mr. Mime will be by then
  step(t) {
    const me = this.me, f = t + this.lead;
    if (this.control[me] === "local" && !this.cpus[me] && this.world.end === null) {
      let x = this.stick;
      if (this.target !== null) {
        this.runTo(t - 1); // (as far as it's known)
        const m = this.world.m[me];
        let at = m.x;
        for (let k = t; k < f; k++) at = Math.max(m.xmin, Math.min(m.xmax, at + this.padAt(me, k)[0] * 0.09 * R.STEPS));
        x = Math.max(-64, Math.min(64, Math.round((this.target - at) / (0.09 * R.STEPS))));
      }
      const a = this.smashes > 0 ? 1 : 0;
      if (a) this.smashes--;
      if (x !== this.lastX || a) {
        this.inputs[me].push([f, x, a, f]); // ([frame, x, A, the frame it was sent for])
        this.lastX = x;
        this.emit("send", { s: me, f, x, a });
      }
    }
    this.runTo(t);
  }
  over() { return this.state === "over"; }

  // each one's points: the server's once it's said, else the world's
  pointsOf(z) { return this.result ? this.result.p[z] : this.world.m[z].score; }
  // each one's place by them (an empty seat's none: null)
  places() {
    const p = [0, 1, 2, 3].map((z) => (this.scores ? this.scores[z] : this.pointsOf(z)));
    return p.map((x, z) => (this.empty[z] ? null : 1 + p.filter((y, o) => y > x && !this.empty[o]).length));
  }
  // the time left, in seconds as the game shows it (0x8630271C)
  secondsLeft() {
    const t = this.state === "ready" || this.state === "idle" ? R.TIME : this.world.time;
    return Math.max(0, Math.trunc((t + R.FPS - 1) / R.FPS));
  }

  // ---- the end (0x863024A8, 0x86301250) ----
  // the most points win (none, if all four have the same): they dance, the
  // others flop. Each Mr. Mime turns to its end clip in its first step after
  // the end (before the balls: by the points as the play ended), but one
  // caught in a smash's clip lets it finish first (frame 10: 0x86301274), and
  // goes by the points then (0x86300074)
  ending() {
    this.endAt = this.time;
    this.winners = winnersOf([0, 1, 2, 3].map((z) => this.pointsOf(z)), this.empty);
    const E = this.endFrame(), w = this.world, ran = Math.max(0, w.t - E);
    const first = winnersOf(this.endScores && w.end === E ? this.endScores : [0, 1, 2, 3].map((z) => this.pointsOf(z)), this.empty);
    this.dance = w.m.map((m) => {
      const T = m.timer - R.STEPS * ran, fresh = !m.smash && T === R.STEPS * (E + 1); // (its timer as the play ended)
      if (!(m.smash && T <= SMASH_POSE)) return { at: E + 1, T, fresh, win: first[m.z] };
      // (its clip's frame on frame f is ceil(its timer / 3) - 1: done once its timer's 31 on the frame before)
      return { at: E + 1 + Math.ceil((R.SMASH_FOR - T) / R.STEPS), T, fresh, win: null };
    });
    this.emit("end", this.winners);
  }

  // ---- every rendered frame ----
  animate(dt) {
    const k = Math.pow(SMOOTH, dt * 60);
    const km = Math.pow(SMOOTH_MIME, dt * 60);
    for (const o of this.offsets) { o[0] *= km; o[1] *= km; }
    for (const [id, o] of this.ballOffsets) {
      o[0] *= k; o[1] *= k;
      if (Math.abs(o[0]) + Math.abs(o[1]) < 0.01) this.ballOffsets.delete(id);
    }
    const running = this.state === "play" || this.state === "over";
    const between = running ? Math.max(0, Math.min(1, this.time * R.FPS - this.lastFrame)) : 1;
    this.draw(between, dt);
  }

  // after each of the world's steps: where each ball is, and its glow's copy there
  // (from its first step to the first after the end: 0x863043E4)
  noteStep(t, k) {
    const w = this.world, g = t * R.STEPS + k;
    const glows = w.end === null || g === (w.end + 1) * R.STEPS;
    for (const b of w.balls) {
      let r = this.trace.get(b.id);
      if (!r) this.trace.set(b.id, (r = []));
      r[g & 15] = { g, x: b.x, y: b.y, rot: b.rot, scale: b.scale, alpha: b.alpha, owner: b.owner, timer: b.timer, smashed: b.smashed };
      if (glows) this.copies.set(b.id + ":" + g, { g, x: b.x, y: b.y, s: b.scale * GLOW * TRAIL, c: b.owner + 1 });
    }
  }

  // The scene, a frame behind the world (between, 0-1, from the frame before
  // the last to the last), so nothing steps at the game's 30 a second: the
  // Mr. Mime between their places, the balls between their steps (3 a frame),
  // the trail's copies coming and fading by the step, the clips by the frame
  draw(between, dt = 0) {
    const w = this.world, before = this.before, L = this.lastFrame;
    const lerp = (a, b) => a + (b - a) * between;
    const d = L - 1 + between; // (the frame drawn)
    const s = R.STEPS * d + R.STEPS - 1; // (and the step: the last of frame d)
    this.trailN = (this.trailN || 0) + 1;
    // the Mr. Mime
    w.m.forEach((m, z) => {
      const v = this.mimes[z];
      const was = before?.m[z] || [m.x, m.y];
      v.root.position.set(lerp(was[0], m.x) + this.offsets[z][0], lerp(was[1], m.y) + this.offsets[z][1], 0);
      let show = true, bar = true;
      if (this.state === "idle") { // (behind the title: miming, as at the countdown's start)
        v.show.pose(SHOW.mime, this.clockS * R.FPS * MIME_RATE);
        bar = false;
      } else if (this.state === "ready") { // the countdown: miming, then up goes the barrier; then the play's
        const t = this.intro;
        if (t < MIME_FOR) { v.show.pose(SHOW.mime, t * MIME_RATE, true); bar = false; }
        else if (t < MIME_FOR + UP_LEN) { v.show.pose(SHOW.up, t - MIME_FOR, true); v.bar.pose(BAR.up, t - MIME_FOR, true); }
        else { show = false; v.play.pose(PLAY.stand, t - MIME_FOR - UP_LEN); v.bar.pose(BAR.held, 0); }
      } else if (this.dance) { // the end: a dance, or a flop (its smash done first)
        const e = this.dance[z], E = this.endFrame();
        if (d < e.at - 0.5) { show = false; this.playPose(v, e.T, E, d, e.fresh); }
        else {
          if (e.win === null) e.win = winnersOf([0, 1, 2, 3].map((i) => this.pointsOf(i)), this.empty)[z];
          const f = Math.max(0, d - e.at);
          if (e.win) { v.show.pose(SHOW.win, f); v.bar.pose(BAR.win, f, true); }
          else { v.show.pose(SHOW.lose, f * LOSE_RATE, true); v.bar.pose(BAR.lose, f * LOSE_RATE, true); }
          v.show.face(f < FACE.at ? FACE.shut : FACE.open);
        }
      } else { show = false; this.playPose(v, m.timer, L, d, !m.smash && m.timer === R.STEPS * (L + 1)); } // the play
      v.show.root.visible = show;
      v.play.root.visible = !show;
      v.bar.root.visible = bar;
      if (show && !this.dance) v.show.face(null);
      for (const mat of v.barMats) mat.n64.frame(this.clockS * R.FPS, true); // (its pictures scroll, its glow pulses)
    });
    // the balls, between the steps they were at
    const E = w.end, seen = new Set();
    for (const b of w.balls) {
      const r = this.trace.get(b.id), at = (g) => (r && r[g & 15]?.g === g ? r[g & 15] : null);
      const g0 = Math.floor(s), f = s - g0, r0 = at(g0);
      if (!r0) continue; // (not come yet)
      seen.add(b.id);
      const r1 = at(g0 + 1) || r0, mix = (a, b2) => a + (b2 - a) * f;
      const v = this.ball(b.id), o = this.ballOffsets.get(b.id) || [0, 0];
      const x = mix(r0.x, r1.x) + o[0], y = mix(r0.y, r1.y) + o[1], scale = mix(r0.scale, r1.scale);
      v.model.root.position.set(x, y, BALL_Z);
      v.model.root.scale.setScalar(Math.max(1e-3, scale));
      v.model.root.rotation.z = deg(r0.rot + s16(r1.rot - r0.rot) * f);
      v.model.alpha(mix(r0.alpha, r1.alpha) / 255);
      // its smash's colour over it: set in a step's flight, by the timer and hitter before it (the step before's)
      const lit = (q) => (q && q.smashed && q.timer <= 60 ? q : null), p0 = lit(at(g0 - 1)), p1 = lit(r0);
      const [q, tf] = p0 && p1 && p1.timer === p0.timer + 1 ? [p0, p0.timer + f] : f < 0.5 ? [p0, p0?.timer] : [p1, p1?.timer];
      v.model.fog(q && tf >= 3 ? FLASH[q.owner] || WHITE : WHITE, q ? 1 - tf / 60 : 0);
      // its glow, till the first step after the end
      v.glow.visible = E === null || s < (E + 1) * R.STEPS;
      v.glow.position.set(x, y, BALL_Z - 30);
      const c = GLOW_PRIM[r0.owner + 1], e = GLOW_ENV[r0.owner + 1];
      v.glow.material.n64.prim.set(c.r, c.g, c.b, 1);
      v.glow.material.n64.env.set(e.r, e.g, e.b, 1);
      v.glow.scale.set(scale * GLOW, scale * GLOW, 1);
    }
    for (const [id, v] of this.balls) if (!seen.has(id)) { this.freeBall(v); this.balls.delete(id); }
    for (const id of this.trace.keys()) if (!w.balls.some((b) => b.id === id)) this.trace.delete(id);
    // the trail's copies: each its hitter's prim by its alpha over white (TRAIL_SPEC), fading over 7 steps
    for (const [key, p] of this.copies) {
      const age = s - p.g;
      if (age >= TRAIL_LIFE) { this.copies.delete(key); continue; }
      const a = TRAIL_ALPHA * (1 - age / (TRAIL_LIFE - 1));
      if (age < 0 || a <= 0) continue;
      const sp = this.trailSprite().sprite, c = GLOW_PRIM[p.c];
      sp.position.set(p.x, p.y, BALL_Z - 31);
      sp.material.n64.env.set(1 + (c.r - 1) * a, 1 + (c.g - 1) * a, 1 + (c.b - 1) * a, a);
      sp.scale.set(p.s, p.s, 1);
    }
    for (const p of this.trails) if (p.used !== this.trailN) p.sprite.visible = false;
  }
  // Mr. Mime in the play (218) and its barrier, drawn on frame d: T its timer
  // after frame F (d at most F); fresh, its standing clip's run on from the countdown
  playPose(v, T, F, d, fresh = false) {
    if (T <= SMASH_POSE && !fresh) { // (in its smash clip: frame ceil(T / 3) - 1 on frame F)
      const c = Math.max(0, Math.min(SMASH_LAST, Math.ceil(T / R.STEPS) - 1 + d - F));
      v.play.pose(PLAY.smash, c, true);
      v.bar.pose(BAR.smash, c, true);
      return;
    }
    // (standing: from the step its timer was 25, the frame it was 26-28 after it)
    const c = fresh ? d + STAND_AT_GO : Math.floor((T - SMASH_POSE - 1) / R.STEPS) + d - F;
    v.play.pose(PLAY.stand, Math.max(0, c));
    v.bar.pose(BAR.held, 0);
  }
  // a ball's model and glow, by its id
  ball(id) {
    let v = this.balls.get(id);
    if (v) return v;
    v = this.freeBalls.pop();
    if (!v) {
      const model = makeModel(this.assets.ball, 1);
      this.scene.add(model.root);
      const glow = new THREE.Sprite(combiner(this.assets.fx, GLOW_SPEC, { sprite: true, flipY: true }));
      glow.renderOrder = 2;
      this.scene.add(glow);
      v = { model, glow };
    }
    v.model.root.visible = v.glow.visible = true;
    this.balls.set(id, v);
    return v;
  }
  freeBall(v) {
    v.model.root.visible = v.glow.visible = false;
    this.freeBalls.push(v);
  }
  trailSprite() {
    let p = this.trails.find((q) => q.used !== this.trailN);
    if (!p) {
      const sprite = new THREE.Sprite(combiner(this.assets.fx, TRAIL_SPEC, { sprite: true, flipY: true }));
      sprite.renderOrder = 1;
      this.scene.add(sprite);
      p = { sprite };
      this.trails.push(p);
    }
    p.used = this.trailN;
    p.sprite.visible = true;
    return p;
  }

  // ---- the end ----
  // (the seats there are: an empty one isn't ranked)
  results() {
    const places = this.places();
    return [0, 1, 2, 3].filter((i) => !this.empty[i]).map((i) => ({ i, score: this.scores ? this.scores[i] : this.pointsOf(i), place: places[i] }))
      .sort((a, b) => a.place - b.place || a.i - b.i);
  }
  celebrate() { return this.results(); }
}

// the camera: the game's own, from straight above (its up turned to this
// device's player's: index.js)
export const CAMERA = { eye: [0, 0, EYE], at: [0, 0, 0], fov: 15 };

// who wins on these points: the most (0x86300074), no one if all four have
// them (or all there are: an empty seat has none, and doesn't count)
function winnersOf(p, empty = [false, false, false, false]) {
  const most = Math.max(...p.filter((x, z) => !empty[z])), win = p.map((x, z) => x === most && !empty[z]);
  return win.every((x, z) => x || empty[z]) ? [false, false, false, false] : win;
}
const s16 = (v) => (((v & 0xffff) ^ 0x8000) - 0x8000);
