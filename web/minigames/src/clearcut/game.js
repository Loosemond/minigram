// A Clear Cut Challenge round: the rules (rules.js) on the round's clock, and
// the scene they drive. Each lane has its Scyther, its log (hauled up by
// Spinarak, dropped, cut into two pieces) and its signpost, where the pieces
// are shown after the fall. In the game's units (y up, the ground at 0).
//
// Who plays each seat: "local" (this device's player), "cpu", or "remote"
// (someone on another device, online). Every lane is on the round's clock, so
// the four logs fall together, as on the game's one screen; a remote seat's
// swings come through the server a little after they happened, and are shown
// as they get here: a cut splits the log where the blade met it, a little up
// from the blade by then, and the pieces go up on the signpost as they were
// cut. Its results are the server's word (told()). The seats this device
// plays emit "cut" with the frame they pressed on, for sending on.
import * as THREE from "three";
import { makeModel, makeLogPiece, makeLine, makeSpinarak, makeSlash } from "./assets.js";
import { dress } from "../n64fx.js";
import * as R from "./rules.js";

export const LANE = [0, 1, 2, 3].map((i) => (i * 120 - 180) * 1.6); // the game's x of each Scyther (0x865020D8)
const Z = { scyther: -35, log: 40, spinarak: 48, fx: 50, sign: 100 }; // (0x86505EA8)
const SCYTHER_SCALE = 0.25, SIGN_SCALE = 0.6;
// on the signpost, a whole log and the lower piece stand on the lane, the upper
// piece a little to the left (0x86505604)
const PIECE_X = -20;
// Scyther's clips (object 122; the code module's numbers): 0 waits, 1 holds
// ready, 2 gets ready, 3 the cut, 4 a swing that misses, 5 the winners' cheer
// at the end, 6 the others' fall at the end, 7 lowers its scythes after a log.
// Their frames (the clips' headers) and whether they loop: 0 and 1 do (flag
// 1), the others play once and hold their last frame. What comes next when a
// clip gets to its last frame is the module's (0x86503938): see clipDone().
const CLIP = { wait: 0, ready: 1, getReady: 2, cut: 3, whiff: 4, win: 5, lose: 6, lower: 7 };
const CLIP_FRAMES = [35, 40, 39, 6, 44, 79, 90, 30];
const LOOPS = [true, true, false, false, false, false, false, false];
const FADE = [0.2, 0.1, 0.12, 0.03, 0.05, 0.2, 0.2, 0.1]; // (the game switches at once; a little blend here)
// From frame 60 of a fallen Scyther's clip, stars (object 190, 0.15x, tilted
// 0x600) go round over it, 108 up, fading in 5/255 a frame (0x86509318)
const STARS = { at: 60, y: 108, scale: 0.15, tilt: (0x600 / 0x10000) * Math.PI * 2, fade: 5 / 255 };
// Spinarak goes down its thread from 400-500 (0x86504140), then hauls the log
// up at 18 a frame (0x865042A0) and bounces at the top (0x8650D13C)
const BOUNCE = [698, 705, 710, 714, 717, 718, 717, 716, 715, 713, 710, 706, 702, 698, 693, 687, 680, 674];
const HANG_TOP = R.Y0 + R.LENGTH; // 674: the log's top while it hangs ready
const SIGN_BOUNCE = [-99, -95, -90, -86, -83, -83, -86, -90, -99]; // the signpost settling (0x8650D1B4)
// a table of a value a frame, at frame x: between two frames, part of the way
// to the next (the screen shows 60 or more a second, the game's frames are 30)
const tableAt = (T, x) => {
  const i = Math.min(T.length - 1, Math.max(0, Math.floor(x))), j = Math.min(T.length - 1, i + 1);
  return T[i] + (T[j] - T[i]) * Math.min(1, Math.max(0, x - i));
};
// the show after a log's fall (frames): the signpost comes up at 20 a frame
// from -1500 (0x86505324), settles, the points count up (71 frames,
// 0x8650549C; from frame 21 of it, one a frame: 0x86507AFC), and the pieces fall away
const SHOW = { up: 69, settle: 9, tally: 71, count: 21 };
// A log whose player swung too early and can't swing again hits the scythes
// held out, and is knocked up and away (0x865048D0): its object (198 above its
// bottom, 0x8650C4C4) at 388.4 - 5.88 (s - 6)^2, s going up 0.6 a frame till
// it's below -3000; each frame it goes by y/100 at an angle, outwards (lanes 0
// and 3 at 60 degrees, 1 and 2 at 10, in the game's rough radians: 6.14 a
// turn), and towards the camera
const KNOCK = { top: 388.4, k: 5.88, peak: 6, ds: 0.6, low: -3000, above: 198,
                turn: [-60, -10, 10, 60].map((a) => (a / 360) * 6.14) };

// each lane's things are on layer lane + 1, so a lane's own view can leave the others out
export function onLayer(obj, i) { obj.traverse((o) => o.layers.set(i + 1)); return obj; }

export class Game {
  constructor(scene, assets) {
    this.scene = scene;
    this.assets = assets;
    this.listeners = {};
    this.lanes = [0, 1, 2, 3].map((i) => this.makeLane(i));
    this.state = "idle";
    this.time = 0;
    this.shake = 0;
    this.me = 0;
    this.players = [0, 1, 2, 3].map(() => ({ total: 0, shown: 0 }));
  }
  on(name, fn) { (this.listeners[name] ||= []).push(fn); }
  emit(name, ...args) { for (const fn of this.listeners[name] || []) fn(...args); }

  makeLane(i) {
    const a = this.assets, x = LANE[i];
    const scyther = makeModel(a.scyther, SCYTHER_SCALE);
    scyther.root.position.set(x, 0, Z.scyther);
    const log = new THREE.Group();
    log.position.set(x, 0, Z.log);
    const spinarak = makeSpinarak(a);
    spinarak.position.set(x + [-2, -5, 5, 2][i], 0, 0);
    const sign = makeModel({ scene: a.signpost }, SIGN_SCALE);
    sign.root.position.set(x, -1500, Z.sign);
    const slash = makeSlash(a);
    slash.position.set(x, R.TOP, Z.fx);
    const stars = makeModel(a.stars, STARS.scale);
    stars.root.position.set(x, STARS.y, Z.scyther);
    stars.root.rotation.x = STARS.tilt;
    stars.root.visible = false;
    dress(a.fx, stars.root, "stars"); // (its halos and stars, each its layer's recipe: 190's callbacks)
    this.scene.add(scyther.root, log, spinarak, sign.root, slash, stars.root);
    const lane = { i, x, scyther, log, spinarak, sign, slash, stars, pieces: null, whole: null, line: null, clip: -1, cf: 0, end: 0 };
    this.setClip(lane, CLIP.wait);
    return lane;
  }

  // A round. level: easy / normal / hard; setup: { me, control } and,
  // online, the server's round: { c, scores, cuts } (to rejoin it midway).
  reset(level, seed = (Math.random() * 2 ** 31) | 0, setup = {}) {
    this.level = level;
    this.seed = seed;
    this.me = setup.me ?? 0;
    this.control = setup.control || [0, 1, 2, 3].map((z) => (z === this.me ? "local" : "cpu"));
    const cpus = this.control.some((c) => c === "cpu") || (setup.c === undefined ? false : setup.c !== 0);
    this.c = setup.c ?? R.levelCode(level, cpus);
    this.fall = R.fall(this.c);
    this.logs = R.deal(seed, this.c);
    this.times = R.timeline(this.logs);
    this.end = this.times[R.LOGS - 1].end / R.FPS;
    // the CPUs' random numbers and moods (0x86502958); tick: 0x8650C5F8
    const L = R.lcg(seed ^ 0x6d2b79f5), Q = R.quad(seed ^ 0x1b873593);
    this.brain = { L, Q, tick: L() % 21, moods: [0, 1, 2, 3].map(() => L() % 5) };
    this.time = 0;
    this.state = "ready";
    this.shake = 0;
    this.players = [0, 1, 2, 3].map((z) => ({
      total: setup.scores?.[z] ?? 0, // (the server's, rejoining)
      shown: setup.scores?.[z] ?? 0, // what the card shows: the points count up as the game's do
      cuts: [0, 1, 2, 3, 4].map((n) => { // (rejoining: [f, points], or [f, points, 1] for an open miss)
        const c = setup.cuts?.[z]?.[n], j = c && R.judge(this.fall, this.logs[n], c[0]);
        return c ? { f: c[0], pts: c[1], kind: c[2] ? "miss" : j.kind, at: j.at, open: !!c[2], told: true, done: true } : null;
      }),
      plans: [], // a CPU's frames to press on, by log
      streak: 0,
      told: new Map(), // the server's word on its logs, till they get there: n -> [{f, p, e, a}]
    }));
    for (const l of this.lanes) this.resetLane(l);
    this.lastFrame = [-1, -1, -1, -1];
    this.planned = -1;
  }
  resetLane(l) {
    l.end = 0;
    this.setClip(l, CLIP.wait);
    this.clearLog(l);
    l.spinarak.visible = false;
    l.sign.root.position.y = -1500;
    l.slash.visible = false;
  }
  clearLog(l) {
    for (const k of ["whole", "pieces"]) {
      const o = l[k];
      if (!o) continue;
      for (const p of Array.isArray(o) ? o : [o]) l.log.remove(p.obj || p);
      l[k] = null;
    }
    if (l.line) { l.log.remove(l.line); l.line = null; }
    l.log.position.set(l.x, 0, Z.log);
    l.log.rotation.set(0, 0, 0);
    l.log.visible = false;
    l.logIndex = -1;
  }
  start() {
    this.state = "play";
  }
  stop() { this.state = "over"; }
  setControl(z, c) { this.control[z] = c; }

  // which log is on at frame fr, and where in it: {n, t (the log's timeline), k (frames into it)}
  logAt(fr) {
    for (let n = 0; n < R.LOGS; n++) if (fr < this.times[n].end) return { n, t: this.times[n] };
    return null;
  }

  // ---- input ----
  // this device's player pressed A (the tap): a swing, if the log is up and A
  // works: till they've cut it, and after a miss once it works again (R.again)
  press(z = this.me) {
    if (this.state !== "play" || this.control[z] === "remote") return false;
    const fr = this.time * R.FPS, at = this.logAt(fr);
    if (!at || fr < at.t.ready || fr >= at.t.judged) return false; // (the game ignores A while the log comes up, and after)
    const f = Math.floor(fr - at.t.drop); // (negative: while it hangs, a miss)
    const had = this.players[z].cuts[at.n];
    if (had && !(had.kind === "miss" && f >= R.again(this.fall, had.f))) return false;
    this.cut(z, at.n, f);
    this.emit("cut", { s: z, n: at.n, f });
    return true;
  }

  // seat z's swing at frame f of log n (this device's judgement, or the
  // server's word: told). A miss it may follow up is open: it counts when the
  // log's judged, unless a swing after it does.
  cut(z, n, f, told) {
    const p = this.players[z], log = this.logs[n];
    const j = R.judge(this.fall, log, f);
    const pts = told ? told.p : j.pts;
    const kind = told && told.p !== j.pts ? (told.p === R.MISS ? "miss" : j.kind) : j.kind;
    const open = told ? !!told.a : R.open(this.fall, kind, f);
    p.cuts[n] = { f, pts, kind, at: j.at, open, told: !!told, done: false };
    if (told) p.total = told.e; else if (!open) p.total = R.add(p.total, pts);
    if (j.kind === "perfect") p.streak++; else p.streak = 0;
  }

  // the server's word on seat z's log n: {f (null: no swing), p (points), e
  // (the total after), a (an open miss: it doesn't count yet)}
  told(z, n, m) {
    if (this.state === "idle" || !this.players[z] || n < 0 || n >= R.LOGS || !Number.isFinite(m.e)) return;
    const p = this.players[z], had = p.cuts[n];
    if (had && this.control[z] !== "remote") { // a seat this device plays: it's judged it too
      if (m.a) { if (had.f === m.f) had.told = true; return; } // (it keeps it open, or has swung again since)
      if (had.f !== m.f || had.pts !== m.p) { // this device counted it differently: the server's count stands
        had.pts = m.p;
        if (m.f === null) had.kind = "miss";
      }
      had.told = true;
      had.open = false;
      p.total = m.e;
      return;
    }
    if (!p.told.has(n)) p.told.set(n, []);
    p.told.get(n).push(m); // someone else's: shown when its log gets there
  }

  get score() { return this.players.map((p) => p.shown); }

  // ---- the round, frame by frame ----
  update(dt) {
    if (this.state === "play") {
      this.time += dt;
      if (this.time >= this.end) { this.state = "over"; this.emit("finish"); }
    }
    for (let z = 0; z < 4; z++) this.updateLane(z, dt);
    for (const l of this.lanes) this.animate(l, dt);
    this.shake = Math.max(0, this.shake - dt);
  }

  updateLane(z, dt) {
    const l = this.lanes[z], p = this.players[z];
    if (this.state !== "play" && this.state !== "over") return;
    const fr = Math.min(this.time, this.end) * R.FPS, at = this.logAt(fr);
    // events on the frames passed since the last update
    const from = this.lastFrame[z], to = Math.floor(fr);
    for (let f = from + 1; f <= to; f++) this.frameEvent(z, f);
    this.lastFrame[z] = Math.max(from, to);
    if (!at) return;
    this.drawLane(l, p, at, fr);
  }

  // the moments that count for seat z (whole frames from GO)
  frameEvent(z, fr) {
    const at = this.logAt(fr);
    if (!at) return;
    const { n, t } = at, p = this.players[z];
    if (fr === t.start) {
      if (z === 0 && this.planned < n) this.planCpus(n); // (all four at once, as the game does: 0x86501280)
      this.emit("log", z, n);
    }
    if (fr === t.ready) this.emit("hanging", z, n);
    if (this.control[z] === "cpu" && !p.cuts[n] && p.plans[n] !== undefined && fr === t.drop + p.plans[n]) {
      this.cut(z, n, p.plans[n]);
      this.emit("cut", { s: z, n, f: p.plans[n] });
    }
    // a remote seat's swings, as they get here (or when its log gets there, if they're early)
    const q = p.told.get(n);
    while (q?.length && fr >= (q[0].f === null ? t.judged : t.drop + q[0].f)) {
      const m = q.shift(), had = p.cuts[n];
      if (had && had.f === m.f) { // one it's shown: now it counts
        had.pts = m.p; had.open = !!m.a; had.told = true;
        p.total = m.e;
      } else this.cut(z, n, m.f, m);
    }
    const c = p.cuts[n];
    if (c && !c.done && c.f !== null && fr >= t.drop + c.f) {
      c.done = true;
      if (fr < t.judged) this.swing(z, n, c); // (one that gets here after the fall just shows on the signpost)
    }
    if (fr === t.drop + 50) this.emit("verdict", z, n); // the crowd, for the best cut (0x8650952C)
    if (fr === t.judged) {
      if (!c) { // no swing: -10 (the server counts it too; for a remote seat its word, or a late swing, takes over)
        this.cut(z, n, null);
        p.cuts[n].done = true;
        if (this.control[z] !== "remote") this.emit("missed", z, n);
      } else if (c.open) { // a miss it didn't follow up: it counts now
        c.open = false;
        p.total = R.add(p.total, c.pts);
      }
      this.emit("show", z, n);
    }
  }

  // the CPUs pick the frame they'll press on for log n (rules.js cpuPlan)
  planCpus(n) {
    this.planned = n;
    for (let z = 0; z < 4; z++) {
      if (this.control[z] !== "cpu") continue;
      const p = this.players[z];
      p.plans[n] = R.cpuPlan(this.fall, this.c || 2, this.logs[n], n, p.total,
                             { L: this.brain.L, Q: this.brain.Q, mood: this.brain.moods[z], tick: this.brain.tick, streak: p.streak });
    }
  }

  // Scyther swings at log n (c: the cut, judged)
  swing(z, n, c) {
    const l = this.lanes[z];
    if (c.kind === "none") return;
    if (c.kind === "miss") {
      this.setClip(l, CLIP.whiff);
      this.emit("whiff", z, c);
      return;
    }
    this.setClip(l, CLIP.cut);
    l.slash.visible = true; // (the game shows object 131 for a perfect cut, 130 otherwise: 0x86503F18)
    l.slash.userData = { from: this.time, big: c.kind === "perfect" ? 1.6 : 1 };
    if (z === this.me) this.shake = c.kind === "perfect" ? 0.25 : 0.12;
    this.emit("swing", z, c);
  }

  // ---- the lane's scene at frame fr (fractional) of its clock ----
  drawLane(l, p, { n, t }, fr) {
    const k = fr - t.start;
    if (l.slash.visible) { // a streak across the log, fading
      const k = (this.time - l.slash.userData.from) / 0.35, big = l.slash.userData.big;
      if (k > 1 || k < 0) l.slash.visible = false;
      else {
        l.slash.scale.set(big * 190 * Math.min(1, k * 4), big * 26 * (1 - 0.5 * k), 1);
        l.slash.material.opacity = 1 - k;
      }
    }

    // the log: set up for this log
    if (l.logIndex !== n) {
      this.clearLog(l);
      l.logIndex = n;
      l.counted = 0;
      p.shown = p.total; // (the last log's points are all counted by now)
      l.whole = onLayer(makeLogPiece(this.assets.log, 0, R.LENGTH), l.i);
      l.line = onLayer(makeLine(this.assets.log), l.i);
      l.line.position.y = this.logs[n].line;
      l.log.add(l.whole, l.line);
    }
    // Spinarak: down its thread, then hauling the log up, and a bounce
    const F = R.FETCH;
    const top = k < R.RISE ? this.haulTop(l.i, k) : null;
    l.spinarak.visible = top !== null;
    if (top !== null) {
      l.spinarak.position.y = top - 5;
      l.spinarak.userData.mat.map = l.spinarak.userData.frames[[0, 1, 2, 1][Math.floor(fr / 6) % 4]];
    }
    const log = l.log, c = p.cuts[n];
    if (fr < t.drop) { // hauled up, then hanging ready
      log.visible = k >= F.down + F.wait;
      log.position.y = (fr < t.ready ? top ?? HANG_TOP : HANG_TOP) - R.LENGTH;
      return;
    }
    if (fr < t.judged) { // the fall
      const f = fr - t.drop, y = R.Y0 - this.fall.k * f * f;
      log.visible = true;
      if (c && c.done && c.at !== null && c.kind !== "miss" && c.kind !== "none") {
        if (!l.pieces) this.split(l, c, n, fr);
        // the lower piece falls on with the log; the upper one tumbles off it (0x86504EB0)
        const ft = (fr - l.pieces.at) * 0.6;
        const [lo, up] = l.pieces;
        lo.obj.position.y = y;
        up.obj.position.y = y + l.pieces.cutAt + 4 * ft;
        up.obj.position.x = l.pieces.side * ft * 7;
        up.obj.rotation.z = l.pieces.side * ft * 0.22;
        log.position.y = 0;
      } else if (c && c.done && c.kind === "miss" && R.again(this.fall, c.f) === Infinity && f >= this.fall.reach) {
        const b = this.knocked(l.i, f - this.fall.reach + 1); // swung too early: knocked away
        log.position.set(l.x + b.x, b.y, Z.log + b.z);
      } else log.position.y = y;
      return;
    }
    // the show: the signpost comes up with the log (or its two pieces) on it
    const sk = fr - t.judged, settled = SHOW.up + SHOW.settle, over = settled + SHOW.tally;
    let sy;
    if (sk < SHOW.up) sy = -1500 + sk * 20;
    else if (sk < settled) sy = tableAt(SIGN_BOUNCE, sk - SHOW.up);
    else sy = -100;
    const away = sk > over ? 4.9 * (0.25 * (sk - over)) ** 2 : 0; // then it falls away (0x865054D4)
    l.sign.root.position.y = sy - away;
    log.visible = true;
    log.rotation.set(0, 0, 0);
    if (!l.pieces && c && c.done && c.at !== null && c.kind !== "miss" && c.kind !== "none") this.split(l, c, n, fr); // (a remote cut that got here late)
    if (l.pieces) {
      log.position.set(l.x, 0, Z.log);
      const [lo, up] = l.pieces;
      lo.obj.position.set(0, sy + 27 - away, 0);
      up.obj.position.set(PIECE_X, sy + 27 + l.pieces.cutAt + 4 - away * 1.15, 0);
      up.obj.rotation.set(0, 0, 0);
    } else {
      log.position.set(l.x, sy + 27 - away, Z.log);
    }
    // the points count up on the card, one a frame (a cut's loss counts down)
    if (sk >= settled + SHOW.count && p.shown !== p.total) {
      const steps = Math.floor(sk - settled - SHOW.count) + 1 - (l.counted || 0);
      for (let k = 0; k < steps && p.shown !== p.total; k++) p.shown += p.shown < p.total ? 1 : -1;
      l.counted = (l.counted || 0) + steps;
      if (p.shown === p.total) this.emit("tallied", l.i, n);
    }
  }

  // lane i's log t frames after it was knocked away (KNOCK): its bottom and
  // how far it's gone from its lane, to the side and forwards
  knocked(i, t) {
    const K = KNOCK, a = K.turn[i];
    let s = 0, y = 0, x = 0, z = 0;
    for (let k = 1; k <= Math.ceil(t); k++) {
      const part = Math.min(1, t - k + 1); // (the frame under way, in part)
      if (y > K.low) s += K.ds * part;
      y = K.top - K.k * (s - K.peak) ** 2;
      x += (part * y / 100) * Math.sin(a);
      z += (part * y / 100) * Math.cos(a);
    }
    return { y: y - K.above, x, z };
  }

  // the log's top k frames into its round, while Spinarak brings it: down the
  // thread (Spinarak), hauled up, the bounce; then it hangs ready
  haulTop(i, k) {
    const F = R.FETCH;
    if (k < F.down) return this.spinarakStart(i) - 4.9 * (0.45 * k) ** 2;
    if (k < F.down + F.wait) return -460;
    if (k < F.down + F.wait + F.up) return -460 + ((k - F.down - F.wait) / F.up) * (689 + 460);
    if (k < R.RISE) return tableAt(BOUNCE, k - F.down - F.wait - F.up);
    return HANG_TOP;
  }

  // ---- Scyther ----
  // Lane z's log as Scyther's clips look at it: its bottom (0x86511690), and
  // whether Spinarak's hauling it up (0x8650C624 = 2)
  logNow(z) {
    const fr = Math.min(this.time, this.end) * R.FPS, at = this.state === "idle" ? null : this.logAt(fr);
    if (!at) return { y: this.state === "idle" ? Infinity : -800, hauling: false }; // (-800 after the last: 0x86509D48)
    const k = fr - at.t.start, F = R.FETCH;
    if (fr < at.t.drop) return { y: this.haulTop(z, k) - R.LENGTH, hauling: k >= F.down + F.wait && k < R.RISE };
    return { y: R.Y0 - this.fall.k * (fr - at.t.drop) ** 2, hauling: false };
  }
  setClip(l, c) {
    l.clip = c;
    l.cf = 0;
    l.scyther.play(c, { loop: LOOPS[c], restart: true, fade: FADE[c] });
    if (c !== CLIP.lose) l.stars.root.visible = false;
  }
  // a clip's frames go by; at its last one, what comes next
  animate(l, dt) {
    l.cf += dt * R.FPS;
    for (let k = 0; k < 4; k++) {
      const last = CLIP_FRAMES[l.clip] - 1, was = l.clip;
      if (l.cf < last) break;
      this.clipDone(l);
      if (l.clip !== was || l.cf === 0) continue;
      if (LOOPS[l.clip]) l.cf -= last;
      else { l.cf = last; break; }
    }
    l.scyther.update(dt);
    // stars over a fallen Scyther
    const st = l.stars;
    if (l.clip === CLIP.lose && l.cf >= STARS.at && !st.root.visible) {
      st.root.visible = true;
      st.play(0, { loop: true, restart: true, fade: 0 });
      l.starsT = 0;
    }
    if (st.root.visible) {
      l.starsT += dt * R.FPS;
      const a = Math.min(1, l.starsT * STARS.fade);
      st.root.traverse((o) => { if (o.isMesh) o.material.opacity = a; });
      st.update(dt);
    }
  }
  // Scyther's clip is at its last frame (0x86503938)
  clipDone(l) {
    const z = l.i, log = this.logNow(z);
    switch (l.clip) {
      case CLIP.wait: { // gets ready once the log's bottom is up above the ground; the end, after the last log
        let to = log.hauling && log.y > 0 ? CLIP.getReady : null;
        if (l.end) to = l.end === 2 ? CLIP.win : CLIP.lose;
        if (to !== null) this.setClip(l, to);
        if (to === CLIP.getReady) this.emit("cry", z); // (0x1F0A)
        break;
      }
      case CLIP.ready: // held ready till the log's gone by: it lowers its scythes
        if (log.y < 100) { this.setClip(l, CLIP.lower); this.emit("cry", z); }
        break;
      case CLIP.getReady:
      case CLIP.cut:
        this.setClip(l, CLIP.ready);
        break;
      case CLIP.whiff:
        if (log.y < 100) { this.setClip(l, CLIP.lower); this.emit("cry", z); } else this.setClip(l, CLIP.ready);
        break;
      case CLIP.win: // once, then back to waiting
        l.end = 0;
        this.setClip(l, CLIP.wait);
        break;
      case CLIP.lose: // stays down (the module only lets it up if there are logs left)
        break;
      case CLIP.lower:
        this.setClip(l, CLIP.wait);
        break;
    }
  }

  spinarakStart(i) { return 400 + ((this.seed >>> (i * 5)) % 101); } // (0x86502958: 400 + a random 0-100)

  // the log comes apart at the cut: a lower piece (its bottom to the cut) and an upper one
  split(l, c, n, fr) {
    const cutAt = R.TOP - c.at; // where the blade met it, from its bottom (0x86503178)
    const h = Math.max(1, Math.min(R.LENGTH - 1, cutAt));
    l.log.remove(l.whole);
    l.whole = null;
    const lo = onLayer(makeLogPiece(this.assets.log, 0, h), l.i), up = onLayer(makeLogPiece(this.assets.log, h, R.LENGTH), l.i);
    const loObj = onLayer(new THREE.Group(), l.i), upObj = onLayer(new THREE.Group(), l.i);
    loObj.add(lo);
    up.position.y = -h;
    upObj.add(up);
    // the line stays on whichever piece it's on
    const line = l.line;
    l.log.remove(line);
    if (this.logs[n].line < h) loObj.add(line);
    else { line.position.y = this.logs[n].line - h; upObj.add(line); }
    l.log.add(loObj, upObj);
    const y0 = R.Y0 - this.fall.k * (fr - this.times[n].drop) ** 2;
    l.pieces = [{ obj: loObj }, { obj: upObj }];
    l.pieces.at = fr;
    l.pieces.y0 = y0;
    l.pieces.upY = y0 + h;
    l.pieces.cutAt = h;
    l.pieces.side = l.i < 2 ? -1 : 1;
    upObj.position.y = y0 + h;
    loObj.position.y = y0;
  }

  // ---- the end ----
  results() {
    const order = this.players.map((p, i) => ({ i, score: p.total })).sort((a, b) => b.score - a.score);
    return order.map((r) => ({ ...r, place: 1 + order.filter((q) => q.score > r.score).length }));
  }
  celebrate() {
    const r = this.results();
    const all = r.every((x) => x.place === 1);
    for (const x of r) {
      // the winners cheer, the others fall, when their waiting clip next comes
      // round (0x86502B88, 0x86503A50: a four-way tie has no winner)
      this.lanes[x.i].end = x.place === 1 && !all ? 2 : 1;
      this.players[x.i].shown = this.players[x.i].total;
    }
    return r;
  }
}
