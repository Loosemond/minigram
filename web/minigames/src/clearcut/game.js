// A Clear Cut Challenge round: the rules (rules.js) on the round's clock, and
// the scene they drive. Each lane has its Scyther, its log (hauled up by
// Spinarak, dropped, cut into two pieces) and its signpost, where the pieces
// are shown after the fall. In the game's units (y up, the ground at 0).
//
// Who plays each seat: "local" (this device's player), "cpu", or "remote"
// (someone on another device, online). Every lane is on the round's clock, so
// the four logs fall together, as on the game's one screen; a remote seat's
// swings come through the server a little after they happened, and are shown
// as they get here: a cut's pieces are where the game's would be by then,
// and one that gets here after the fall goes straight up on the signpost. Its
// results are the server's word (told()). The seats this device plays emit
// "cut" with the frame they pressed on, for sending on.
//
// The game's logic runs 30 times a second; everything here is drawn from the
// round's clock (frames, fractional), so nothing moves in 30ths of a second:
// the falls, the pieces, the signposts and the particles are worked out for
// the moment drawn, and the HUD's points too (pointsAt()).
import * as THREE from "three";
import { makeModel, makeLogPiece, makeLine, makeSpinarak, picture } from "./assets.js";
import { dress } from "../n64fx.js";
import { faceOnRender } from "../facing.js";
import { tint } from "../tint.js";
import * as R from "./rules.js";

export const LANE = [0, 1, 2, 3].map((i) => (i * 120 - 180) * 1.6); // the game's x of each Scyther (0x865020D8)
const Z = { scyther: -35, log: 40, spinarak: 48, fx: 50, sign: 100, sparks: 150 }; // (0x86505EA8, 0x86502D80)
const SCYTHER_SCALE = 0.25, SIGN_SCALE = 0.6;
const deg = (a) => (a / 0x10000) * Math.PI * 2; // a binary angle (65536 a turn), in radians
const lerp = (a, b, k) => a + (b - a) * k;
// The log from its set-up to the show is turned -0x200 on its +0x1E (0x865028D8:
// about x, as the objects' +0x1E is; 0 again as the show starts, 0x86505280),
// about its middle (its object's place)
const PITCH = deg(-0x200);
const HALF = R.LENGTH >> 1; // (the module's length / 2, in whole units)
// Scyther's clips (object 122; the code module's numbers): 0 waits, 1 holds
// ready, 2 gets ready, 3 the cut, 4 a swing that misses, 5 the winners' cheer
// at the end, 6 the others' fall at the end, 7 lowers its scythes after a log.
// Their frames (the clips' headers) and whether they loop: 0 and 1 do (flag
// 1), the others play once and hold their last frame. What comes next when a
// clip gets to its last frame is the module's (0x86503938): see clipDone().
const CLIP = { wait: 0, ready: 1, getReady: 2, cut: 3, whiff: 4, win: 5, lose: 6, lower: 7 };
const LOOPS = [true, true, false, false, false, false, false, false];
const FADE = [0.2, 0.1, 0.12, 0.03, 0.05, 0.2, 0.2, 0.1]; // (the game switches at once; a little blend here)
// The Pokemon each seat plays (0x86505BF8): by the species of its Game Pak's
// Pokemon (the minigame's record of the player, +8, then +4), Pinsir (127) as
// object 55, Scyther (123) as 122, and any other as Scizor (179). The remake
// has no Game Pak: Scyther, unless the round says (setup.species). The same
// clips, their own lengths; the stars go round their attachment point
// (geo 0x24, label 1); a Pinsir also plays 0x1F04 at frames of its clips
// (0x86503D50-0x86503E24: getting ready, cheering, lowering its arms).
export const MONS = {
  scyther: { frames: [35, 40, 39, 6, 44, 79, 90, 30], head: "bone_11" },
  pinsir: { frames: [35, 40, 39, 6, 44, 64, 80, 30], head: "bone_03", cries: { 2: [33], 5: [53, 60], 7: [16, 22] } },
  scizor: { frames: [35, 40, 39, 6, 44, 84, 65, 30], head: "bone_08" },
};
export const monOf = (species) => (species === 127 ? "pinsir" : species === 123 ? "scyther" : "scizor");
const SCYTHER = 123;
// each Scyther's waiting clip starts at a random frame, 15-29 (0x8650A320,
// and again as the intro ends: 0x8650892C), so they don't move in step
const IDLE_FROM = 15, IDLE_SPREAD = 15;
// From frame 60 of a fallen Scyther's clip, stars (object 190, 0.15x, tilted
// 0x600 on its +0x1E) go round over its head (its attachment point's x and z,
// +0xAC and +0xB4: MONS' head), 108 over its feet, fading in 5/255 a frame
// (0x86509318)
const STARS = { at: 60, y: 108, scale: 0.15, tilt: deg(0x600), fade: 5 / 255 };
// Spinarak goes down its thread from 400-500 (0x86504140), then hauls the log
// up at 18 a frame (0x865042A0) and bounces at the top (0x8650D13C)
const BOUNCE = [698, 705, 710, 714, 717, 718, 717, 716, 715, 713, 710, 706, 702, 698, 693, 687, 680, 674];
const HANG_TOP = R.Y0 + R.LENGTH; // 674: the log's top while it hangs ready
// song 18 as each log comes up: a frame after its set-up the sign's state
// goes to 0 and its count to 0, and at 30 the song (0x865095C4-0x865095F8)
const SONG_AT = 31;
// a table of a value a frame, at frame x: between two frames, part of the way
// to the next (the screen shows 60 or more a second, the game's frames are 30)
const tableAt = (T, x) => {
  const i = Math.min(T.length - 1, Math.max(0, Math.floor(x))), j = Math.min(T.length - 1, i + 1);
  return T[i] + (T[j] - T[i]) * Math.min(1, Math.max(0, x - i));
};

// The flash at the blade (0x86503F18): on the frame the blade meets the log
// (the press + 2) object 131 for a perfect cut, else 130, at (x, 92, 50)
// 0.25x, its clip from frame 0 at its own speed, and gone at its frame 15
// (0x8650404C); coloured by its callbacks' colour tracks (fx.json)
const SLASH = { scale: 0.25, frames: 15 };
// The pieces (0x86503178 as the cut's judged, 0x86504EB0 each frame they're
// drawn till the show starts): each piece's object is at its middle. The
// lower one falls from rest, y0 - 4.9 t^2; the upper one, from its place
// y1, goes up and down again, y1 + 5 v^2 - 5 (t - v)^2, towards the camera,
// z + 4.9 t^2 / zdiv, turning 128 x spin a frame on its +0x1E and 256 x
// spin x side on its +0x22 (about x and z); t is 0.6 the first frame they're
// drawn and goes up 0.6 a frame while the lower one's above -3000. Drawn
// the frame the blade meets the log, which goes the frame after
// (0x86504070); a perfect cut's pieces are drawn white for 3 frames from
// then (the bark's callback: env white, colour env, 0x865006C8).
const PIECES = { dt: 0.6, g: 4.9, low: -3000, flash: 3 };
const WHITE = new THREE.MeshBasicMaterial({ color: 0xffffff });
// the show after the fall (0x8650515C): the signposts come up from -1500 at
// 20 a frame (states 1 and 2), then settle through the 2nd-9th of
// 0x8650D1B4 and stop at -100 (state 3 from frame 78: the points, 71
// frames, 0x8650549C); from frame 150 they fall away (state 4,
// 0x865054D4): -100 - 4.9 t^2, t going up 0.15 for each signpost moved in
// turn (lane i's 0.6 (n - 1) + 0.15 (i + 1) on its nth frame), till they're
// below -1500 (29 frames). On it the whole log or the lower piece stands on
// the lane 27 over the signpost, the upper piece 20 to the left, 5 down into
// the lower one's top (0x86505604).
const SIGN_BOUNCE = [-99, -95, -90, -86, -83, -83, -86, -90, -99]; // (0x8650D1B4)
const SHOW = { up: 69, settled: 78, tally: 71, away: 150, awayFrames: 29, on: 27, x: -20, overlap: 5 };
function signAt(s, i) {
  if (s <= 0) return -1500;
  if (s <= SHOW.up) return -1500 + 20 * s;
  if (s < SHOW.settled) return SIGN_BOUNCE[s - SHOW.up];
  if (s < SHOW.away) return -100;
  const n = Math.min(s - SHOW.away + 1, SHOW.awayFrames), t = 0.6 * (n - 1) + 0.15 * (i + 1);
  return -100 - 4.9 * t * t;
}
const signY = (sk, i) => { const s = Math.floor(sk), a = signAt(s, i); return lerp(a, signAt(s + 1, i), sk - s); };

// The points, on the game's 320 x 240 screen (0x86507AFC, the HUD, in the
// show's state 3; 0x86506E78 draws them): each player's start, the cut on the
// signpost, 178 - 146 x (the lower piece's length) / 389 (25 with no cut:
// 0x86505260), still till the tally's 16th frame, then down 10 a frame; the
// frame it would get to 190 it's in (0x1F0B, for each player, every log) and
// gone. From the tally's 21st frame, once it's 161 down, the card counts it in
// one a frame. Image bank 429's digits at 0.57 (14 x 18) in its player's
// column, their places by how many there are (0x8650D2EC, 0x8650D2FC).
export const HUD = {
  column: [29, 107, 185, 263],
  places: { 1: [7], 2: [1, 14], 3: [-6, 5, 18] }, // (a loss: "-n" as two, "-10" as three)
  digit: [14, 18],
  move: 16, step: 10, landed: 190, counts: 21, near: 161,
};
// ...and a perfect cut's, while its points come down (0x86506B2C, from
// 0x865080B0): bank 398 behind them, its scale and prim the next of ten a
// frame (0x8650D320, 0x8650D348; env white), in a box 19 left of and 16 over
// the number, 1.9x its 56 x 42 (0x86506D74); and two of module #64's star
// particles a frame (0x86502D80, below)
export const BURST = {
  scale: [1.2, 1.15, 1.1, 1.05, 1.0, 0.95, 0.9, 1.0, 1.1, 1.2],
  prim: [[200, 100, 155], [209, 108, 171], [218, 116, 187], [227, 124, 203], [236, 132, 219],
         [245, 140, 235], [255, 150, 255], [237, 134, 222], [219, 118, 189], [200, 100, 155]],
  size: [56, 42], box: 1.9, at: [-18, -16],
};
// The sparkles (0x86502D80): two a frame, bank 147's star (assets.js) as
// module #64's particles (0x87F0328C: type 0, 0x87F02F00 each frame), each at
// its Scyther's x + 40, 20, -20 or -40 by the lane, +-28 x a random, the
// height the points are at, (152 - y) x 319 / 146, + 42 x a random, z 150;
// moving +-2.8 x a random across and 2.8 x 1.6 x a random up a frame; for 10
// frames, 32 x (1 + 1.2 x a random) x sin(pi age / 10) big, turning 0x1FF a frame
const SPARKS = { per: 2, life: 10, size: 32, grow: 1.2, spin: 0x1ff, dx: [40, 20, -20, -40], spread: 28, rise: 42, v: 2.8, up: 1.6 };
// PERFECT over a Scyther with all 100 points at the end (0x86502CD4: module
// #2's 0x81900164 at its x, 26 up): 64 x 26, x 3.1 (|sin a| + 1) / 2 with a up
// 0x800 a frame, in its player's colours through (prim - env) x its grey + env
// (0x81900784: as Egg Emergency's)
const PERFECT_END = { score: 100, up: 26, scale: 3.1, spin: 0x800, size: [64, 26] };
const PERFECT_COLOURS = [[[200, 200, 255], [0, 80, 200]], [[200, 255, 200], [0, 80, 0]],
  [[255, 200, 200], [200, 0, 70]], [[255, 240, 190], [230, 90, 0]]];

// A log whose player swung too early and can't swing again hits the scythes
// held out, and is knocked up and away (0x865048D0): its object (198 above its
// bottom, 0x8650C4C4) at 388.4 - 5.88 (s - 6)^2, s going up 0.6 a frame till
// it's below -3000; each frame it goes by y/100 at an angle, outwards (lanes 0
// and 3 at 60 degrees, 1 and 2 at 10, in the game's rough radians: 6.14 a
// turn), and towards the camera
const KNOCK = { top: 388.4, k: 5.88, peak: 6, ds: 0.6, low: -3000, above: 198,
                turn: [-60, -10, 10, 60].map((a) => (a / 360) * 6.14) };

// a cut that met the log (one judged a miss, or none, leaves it whole)
const hits = (c) => !!c && c.at !== null && c.f !== null && (c.kind === "perfect" || c.kind === "early" || c.kind === "late");

// each lane's things are on layer lane + 1, so a lane's own view can leave the others out
export function onLayer(obj, i) { obj.traverse((o) => o.layers.set(i + 1)); return obj; }

export class Game {
  constructor(scene, assets) {
    this.scene = scene;
    this.assets = assets;
    this.listeners = {};
    faceOnRender(scene); // (the dizzy stars and the flash at the blade: their joints drawn facing the camera)
    this.lanes = [0, 1, 2, 3].map((i) => this.makeLane(i));
    this.state = "idle";
    this.time = 0;
    this.me = 0;
    this.players = [0, 1, 2, 3].map(() => ({ total: 0, shown: 0, burst: 0 }));
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
    const slashes = [[a.slash, "slash"], [a.slashPerfect, "slash_perfect"]].map(([m, name]) => {
      const s = makeModel(m, SLASH.scale);
      s.root.position.set(x, R.TOP, Z.fx);
      s.root.visible = false;
      s.mats = dress(a.fx, s.root, name); // (its layers' recipes and colour tracks: 130's and 131's callbacks)
      return s;
    });
    const stars = makeModel(a.stars, STARS.scale);
    stars.root.position.set(x, STARS.y, Z.scyther);
    stars.root.rotation.x = STARS.tilt;
    stars.root.visible = false;
    dress(a.fx, stars.root, "stars"); // (its halos and stars, each its layer's recipe: 190's callbacks)
    const perfect = new THREE.Sprite(new THREE.SpriteMaterial({ map: picture(tint(a.perfect, ...PERFECT_COLOURS[i])), transparent: true,
                                                                depthWrite: false, depthTest: false }));
    perfect.renderOrder = 10; // (module #2 draws it from a list of its own, after the scene)
    perfect.visible = false;
    for (const o of [scyther.root, log, spinarak, sign.root, ...slashes.map((s) => s.root), stars.root, perfect]) onLayer(o, i);
    this.scene.add(scyther.root, log, spinarak, sign.root, ...slashes.map((s) => s.root), stars.root, perfect);
    const lane = { i, x, scyther, mon: "scyther", frames: MONS.scyther.frames, head: scyther.root.getObjectByName(MONS.scyther.head),
                   log, spinarak, sign, slashes, stars, perfect,
                   whole: null, pieces: null, sparks: [], free: [], clip: -1, cf: 0, end: 0, perfectT: null };
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
    this.players = [0, 1, 2, 3].map((z) => ({
      total: setup.scores?.[z] ?? 0, // (the server's, rejoining)
      shown: setup.scores?.[z] ?? 0, // what the card shows: the points count up as the game's do
      cuts: [0, 1, 2, 3, 4].map((n) => { // (rejoining: [f, points], or [f, points, 1] for an open miss)
        const c = setup.cuts?.[z]?.[n], j = c && R.judge(this.fall, this.logs[n], c[0]);
        return c ? { f: c[0], pts: c[1], kind: c[2] ? "miss" : j.kind, at: j.at, open: !!c[2], told: true, done: true } : null;
      }),
      plans: [], // a CPU's frames to press on, by log
      streak: 0,
      burst: 0, // (0x8C: a perfect cut's burst, the next of its ten)
      told: new Map(), // the server's word on its logs, till they get there: n -> [{f, p, e, a}]
    }));
    // each seat's Pokemon (fetched if it isn't in yet: it takes over once it is), and the waiting
    // clips' random starts, from the round's seed so each device has the same
    this.species = [0, 1, 2, 3].map((z) => setup.species?.[z] ?? SCYTHER);
    const idle = R.quad(seed ^ 0x5bd1e995);
    for (const l of this.lanes) {
      const name = monOf(this.species[l.i]), from = IDLE_FROM + (idle() % IDLE_SPREAD);
      if (name !== l.mon) {
        const data = name === "scyther" ? this.assets.scyther : null;
        if (data) this.useMon(l, name, data);
        else {
          this.assets.loadMon(name).then((d) => {
            if (monOf(this.species[l.i]) !== name || l.mon === name) return;
            const { clip, cf } = l;
            this.useMon(l, name, d);
            this.setClip(l, clip, cf, 0); // (on where its clips were)
          }, () => {});
        }
      }
      this.resetLane(l, from);
    }
    this.lastFrame = [-1, -1, -1, -1];
    this.planned = -1;
  }
  resetLane(l, idleFrom = 0) {
    l.end = 0;
    l.perfectT = null;
    l.perfect.visible = false;
    this.setClip(l, CLIP.wait, idleFrom, 0);
    this.clearLog(l);
    l.spinarak.visible = false;
    l.sign.root.position.y = -1500;
    for (const s of l.slashes) s.root.visible = false;
    for (const p of l.sparks) this.retire(l, p);
    l.sparks = [];
  }
  // lane l's Pokemon as name's model (data: its loaded glTF)
  useMon(l, name, data) {
    if (l.mon === name) return;
    const m = makeModel(data, SCYTHER_SCALE), M = MONS[name];
    m.root.position.copy(l.scyther.root.position);
    this.scene.remove(l.scyther.root);
    this.scene.add(onLayer(m.root, l.i));
    Object.assign(l, { scyther: m, mon: name, frames: M.frames, head: m.root.getObjectByName(M.head) });
    l.clip = -1;
  }
  clearLog(l) {
    if (l.whole) l.log.remove(l.whole);
    if (l.pieces) l.log.remove(l.pieces.lo, l.pieces.up);
    l.whole = l.pieces = null;
    l.log.position.set(l.x, 0, Z.log);
    l.log.visible = false;
    l.logIndex = -1;
  }
  start() {
    this.state = "play";
  }
  stop() { this.state = "over"; }
  setControl(z, c) { this.control[z] = c; }

  // which log is on at frame fr, and where in it: {n, t (the log's timeline)}
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
  }

  updateLane(z, dt) {
    const l = this.lanes[z], p = this.players[z];
    if (this.state !== "play" && this.state !== "over") return;
    const fr = Math.min(this.time, this.end) * R.FPS, at = this.logAt(fr);
    // events on the frames passed since the last update
    const from = this.lastFrame[z], to = Math.floor(fr);
    for (let f = from + 1; f <= to; f++) this.frameEvent(z, f);
    this.lastFrame[z] = Math.max(from, to);
    this.drawSparks(l, fr);
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
    if (z === 0 && fr === t.start + SONG_AT) this.emit("hang", n); // (song 18)
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
    // the tally (the show's state 3): the points come down, are in, and count in
    const d = fr - t.judged - SHOW.settled, pts = d >= 0 && d < SHOW.tally ? this.pointsInfo(z, n) : null;
    if (!pts) return;
    if (d < pts.land && pts.perfect) { // (0x86508098: a perfect cut's burst, the next of its ten, and its sparkles)
      if (d === 0) pts.burstFrom = p.burst;
      p.burst = (p.burst + 1) % BURST.scale.length;
      this.sparkle(z, pts.y0 + HUD.step * Math.max(0, d - HUD.move + 1), fr);
    }
    if (d === pts.land) this.emit("tallied", z, n); // (0x1F0B)
    if (d >= pts.counts && p.shown !== p.total) p.shown += p.shown < p.total ? 1 : -1;
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

  // Scyther swings at log n (c: the cut, judged): its clip and the sound at
  // the press (0x865033AC); the blade meets the log 2 frames on (drawLane)
  swing(z, n, c) {
    const l = this.lanes[z];
    if (c.kind === "none") return;
    if (c.kind === "miss") {
      this.setClip(l, CLIP.whiff);
      this.emit("whiff", z, c);
      return;
    }
    this.setClip(l, CLIP.cut);
    this.emit("swing", z, c);
  }

  // ---- the points ----
  // Where seat z's points for log n come down from on the game's screen,
  // when they're in and when the card counts them (HUD, above); null before
  // its log's judged. (Worked out from the cut as it stands: the server's word
  // on one may come after.)
  pointsInfo(z, n) {
    const p = this.players[z], c = p.cuts[n];
    if (!c || c.pts === null || c.pts === undefined) return null;
    let info = p.info?.[n];
    if (info && info.c === c && info.pts === c.pts && info.kind === c.kind) return info;
    const h = hits(c) ? Math.trunc(R.TOP - c.at) : R.LENGTH + 20; // (+0x38: the lower piece's length, the log's + 20 with none)
    const y0 = 178 - Math.trunc((h * 146) / R.LENGTH);
    const land = Math.max(HUD.move, HUD.move - 1 + Math.ceil((HUD.landed - y0) / HUD.step));
    const near = y0 >= HUD.near ? 0 : HUD.move - 1 + Math.ceil((HUD.near - y0) / HUD.step);
    info = { c, pts: c.pts, kind: c.kind, y0, land, counts: Math.max(HUD.counts, near), perfect: c.pts === 20, burstFrom: info?.burstFrom ?? p.burst };
    (p.info ||= [])[n] = info;
    return info;
  }

  // The points over seat z's lane at frame fr (fractional) of the round, as
  // the HUD draws them then: null, or { pts, colours (0-3: the player's, 4 a
  // loss, 5 a perfect cut's: 0x8650C680), x, y (the number's top left on the
  // game's screen), burst: null or { k: the burst's (fractional) frame of
  // its ten } }
  pointsAt(z, fr) {
    if (this.state !== "play" && this.state !== "over") return null;
    const at = this.logAt(Math.floor(fr));
    if (!at) return null;
    const d = fr - at.t.judged - SHOW.settled, info = d >= 0 ? this.pointsInfo(z, at.n) : null;
    if (!info || d >= info.land) return null;
    const y = info.y0 + HUD.step * Math.max(0, d - HUD.move + 1);
    const colours = info.pts === 20 ? 5 : info.pts < 0 ? 4 : z;
    return { pts: info.pts, colours, x: HUD.column[z], y, burst: info.perfect ? { k: info.burstFrom + 1 + d } : null };
  }

  // two of module #64's stars round seat z's falling points (at y on the
  // game's screen), made on frame fr (0x86502D80; a particle's first frame on
  // show is the one after)
  sparkle(z, y, fr) {
    const l = this.lanes[z], S = SPARKS;
    for (let k = 0; k < S.per; k++) {
      // (0x86502EAC: the side by rand2: + for its numbers 0-1 mod 4, and any the game reads as negative; - for 2-3)
      const r = (Math.random() * 2 ** 32) >>> 0, side = (r | 0) < 0 || (r & 3) < 2 ? 1 : -1;
      l.sparks.push({ born: fr, scale: 1 + S.grow * Math.random(),
                      x: l.x + S.dx[z] + side * S.spread * Math.random(), y: ((152 - y) * 319) / 146 + S.rise * Math.random(),
                      vx: side * S.v * Math.random(), vy: S.v * S.up * Math.random(), sprite: null });
    }
  }
  drawSparks(l, fr) {
    const S = SPARKS;
    l.sparks = l.sparks.filter((p) => {
      const age = fr - p.born;
      if (age >= S.life || age < 0 || (this.state !== "play" && this.state !== "over")) { this.retire(l, p); return false; }
      const s = p.sprite || (p.sprite = this.sprite(l));
      const k = S.size * p.scale * Math.sin((Math.PI * age) / S.life);
      s.visible = k > 0;
      s.scale.set(k, k, 1);
      s.position.set(p.x + p.vx * age, p.y + p.vy * age, Z.sparks);
      s.material.rotation = deg(S.spin * age);
      return true;
    });
  }
  sprite(l) {
    let s = l.free.pop();
    if (!s) {
      s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.assets.sparkle, transparent: true, depthWrite: false }));
      s.renderOrder = 9; // (the game's layer 9)
      onLayer(s, l.i);
      this.scene.add(s);
    }
    return s;
  }
  retire(l, p) {
    if (!p.sprite) return;
    p.sprite.visible = false;
    l.free.push(p.sprite);
    p.sprite = null;
  }

  // ---- the lane's scene at frame fr (fractional) of its clock ----
  drawLane(l, p, { n, t }, fr) {
    const k = fr - t.start;
    if (l.logIndex !== n) this.setUpLog(l, p, n);
    // Spinarak: down its thread, then hauling the log up, and a bounce
    const F = R.FETCH;
    const top = k < R.RISE ? this.haulTop(l.i, k) : null;
    l.spinarak.visible = top !== null;
    if (top !== null) {
      l.spinarak.position.y = top - 5;
      l.spinarak.userData.mat.map = l.spinarak.userData.frames[[0, 1, 2, 1][Math.floor(fr / 6) % 4]];
    }
    const log = l.log, whole = l.whole, c = p.cuts[n], cut = hits(c) && c.done ? c : null;
    const contact = cut ? t.drop + cut.f + 2 : Infinity; // (the blade meets the log: the pieces, the flash)
    this.drawSlash(l, cut, fr - contact);
    log.visible = true;
    if (fr < t.drop) { // hauled up, then hanging ready
      log.visible = k >= F.down + F.wait;
      this.place(whole, (fr < t.ready ? top ?? HANG_TOP : HANG_TOP) - R.LENGTH, PITCH);
      return;
    }
    if (fr < t.judged) { // the fall
      const f = fr - t.drop, y = R.Y0 - this.fall.k * f * f;
      if (fr >= contact) {
        if (!l.pieces) this.split(l, cut, n);
        this.tumble(l, fr - contact);
        whole.visible = fr < contact + 1;
        this.place(whole, y, PITCH);
      } else if (c && c.done && c.kind === "miss" && R.again(this.fall, c.f) === Infinity && f >= this.fall.reach) {
        const b = this.knocked(l.i, f - this.fall.reach + 1); // swung too early: knocked away
        log.position.set(l.x + b.x, 0, Z.log + b.z);
        whole.visible = true;
        this.place(whole, b.y, PITCH);
      } else {
        whole.visible = true;
        this.place(whole, y, PITCH);
      }
      return;
    }
    // the show: the signpost comes up with the log (or its two pieces) on it
    const sk = fr - t.judged, sy = signY(sk, l.i);
    l.sign.root.position.y = sy;
    log.position.set(l.x, 0, Z.log);
    if (!l.pieces && cut) this.split(l, cut, n); // (a remote cut that got here late)
    if (l.pieces) {
      const P = l.pieces, low = sy + SHOW.on + (P.h >> 1);
      whole.visible = false;
      P.lo.position.set(0, low, 0);
      P.up.position.set(SHOW.x, low + HALF - SHOW.overlap, 0);
      P.up.rotation.set(0, 0, 0);
      this.whiten(P, false);
    } else {
      whole.visible = true;
      this.place(whole, sy + SHOW.on, 0);
    }
  }
  // the whole log with its bottom at y, pitched (its object's at its middle)
  place(whole, y, pitch) {
    whole.position.y = y + HALF;
    whole.rotation.x = pitch;
  }
  // log n's log and its white line, as it's set up (0x86502720)
  setUpLog(l, p, n) {
    this.clearLog(l);
    l.logIndex = n;
    p.shown = p.total; // (the last log's points are all counted by now)
    const whole = onLayer(new THREE.Group(), l.i), piece = onLayer(makeLogPiece(this.assets.log, 0, R.LENGTH), l.i);
    piece.position.y = -HALF;
    const line = onLayer(makeLine(this.assets.log), l.i);
    line.position.y = this.logs[n].line - HALF;
    whole.add(piece, line);
    l.whole = whole;
    l.log.add(whole);
  }

  // the flash at the blade, f frames after the blade met the log
  drawSlash(l, c, f) {
    const on = f >= 0 && f < SLASH.frames;
    l.slashes.forEach((s, k) => {
      s.root.visible = on && (k === 1) === (c.kind === "perfect");
      if (!s.root.visible) return;
      s.pose(0, f);
      for (const m of s.mats) m.n64.frame(f);
    });
  }

  // the log comes apart where the blade met it (0x86503178): the lower piece
  // (its bottom to the cut) and the upper one, each its object at its middle,
  // and their random ways (from the round's seed, so each device has the same)
  split(l, c, n) {
    const hf = R.TOP - c.at, h = Math.trunc(hf); // (+0x38)
    const len = Math.max(1, Math.min(R.LENGTH - 1, hf));
    const rnd = R.lcg(this.seed ^ Math.imul(n * 4 + l.i + 1, 0x9e3779b1)), u = () => rnd() / 2 ** 32;
    const frac = h / R.LENGTH;
    const lower = onLayer(makeLogPiece(this.assets.log, 0, len), l.i), upper = onLayer(makeLogPiece(this.assets.log, len, R.LENGTH), l.i);
    const lo = onLayer(new THREE.Group(), l.i), up = onLayer(new THREE.Group(), l.i);
    lower.position.y = -len / 2;
    upper.position.y = -(len + R.LENGTH) / 2;
    lo.add(lower);
    up.add(upper);
    // the line stays on whichever piece it's on
    const line = onLayer(makeLine(this.assets.log), l.i), at = this.logs[n].line;
    if (at < len) { line.position.y = at - len / 2; lo.add(line); } else { line.position.y = at - (len + R.LENGTH) / 2; up.add(line); }
    l.log.add(lo, up);
    const y0 = Math.trunc(c.at + hf / 2), y1 = Math.trunc(R.TOP + (R.LENGTH - hf) / 2); // (+0x30, +0x34: their middles)
    l.pieces = {
      lo, up, h, y0, y1,
      v: 5 + frac + 0.5 * u(), // (+0x70: 0x86503520)
      zdiv: 70 + 5 * frac + (rnd() % 31), // (+0x74)
      spin: 1 + 4 * frac - 0.5 * u(), // (+0x68)
      side: rnd() & 1 ? 1 : -1, // (+0x78, rand2 as the log's set up)
      // (the frames t goes up for: while the lower one's above -3000)
      runs: Math.ceil(Math.sqrt((y0 - PIECES.low) / PIECES.g) / PIECES.dt),
      white: c.kind === "perfect", barks: [lower.children[0], upper.children[0]],
    };
  }
  // the pieces f frames after the blade met the log (0x86504EB0)
  tumble(l, f) {
    const P = l.pieces, runs = f + 1, t = PIECES.dt * Math.min(runs, P.runs), g = PIECES.g * t * t;
    P.lo.position.set(0, P.y0 - g, 0);
    P.up.position.set(0, P.y1 + 5 * P.v * P.v - 5 * (t - P.v) ** 2, g / P.zdiv);
    P.up.rotation.set(deg(128 * P.spin * runs), 0, deg(256 * P.spin * P.side * runs));
    this.whiten(P, P.white && f < PIECES.flash);
  }
  whiten(P, on) {
    for (const b of P.barks) {
      if (on && b.material !== WHITE) { b.userData.bark = b.material; b.material = WHITE; }
      else if (!on && b.material === WHITE) b.material = b.userData.bark;
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
  // clip c from its frame from
  setClip(l, c, from = 0, fade = FADE[c]) {
    l.clip = c;
    l.cf = from;
    l.scyther.play(c, { loop: LOOPS[c], restart: true, fade });
    if (from) l.scyther.seek(from);
    if (c !== CLIP.lose) l.stars.root.visible = false;
  }
  // a clip's frames go by; at its last one, what comes next
  animate(l, dt) {
    const clip0 = l.clip, cf0 = l.cf;
    l.cf += dt * R.FPS;
    for (let k = 0; k < 4; k++) {
      const last = l.frames[l.clip] - 1, was = l.clip;
      if (l.cf < last) break;
      this.clipDone(l);
      if (l.clip !== was || l.cf === 0) continue;
      if (LOOPS[l.clip]) l.cf -= last;
      else { l.cf = last; break; }
    }
    l.scyther.update(dt);
    // a Pinsir's cries, on the frames of its clips it reaches (0x1F04)
    const cries = MONS[l.mon].cries?.[l.clip];
    if (cries && (this.state === "play" || this.state === "over")) {
      const from = l.clip === clip0 ? Math.floor(cf0) : -1;
      for (const f of cries) if (from < f && f <= Math.floor(l.cf)) this.emit("pinsir", l.i);
    }
    // stars over a fallen Scyther, over its head
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
      if (l.head) {
        l.scyther.root.updateMatrixWorld(true);
        const at = l.head.getWorldPosition(st.root.position);
        st.root.position.set(at.x, STARS.y, at.z);
      }
    }
    // PERFECT over a Scyther with all 100 points (from the results on: the game's clock has stopped)
    if (l.perfectT !== null) {
      l.perfectT += dt * R.FPS;
      const a = deg(PERFECT_END.spin * l.perfectT);
      const s = (PERFECT_END.scale * (Math.abs(Math.sin(a)) + 1)) / 2;
      l.perfect.visible = true;
      l.perfect.position.set(l.x, PERFECT_END.up, 0);
      l.perfect.scale.set(PERFECT_END.size[0] * s, PERFECT_END.size[1] * s, 1);
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

  // ---- the end ----
  results() {
    const order = this.players.map((p, i) => ({ i, score: p.total })).sort((a, b) => b.score - a.score);
    return order.map((r) => ({ ...r, place: 1 + order.filter((q) => q.score > r.score).length }));
  }
  celebrate() {
    const r = this.results();
    const all = r.every((x) => x.place === 1);
    for (const x of r) {
      const l = this.lanes[x.i];
      // the winners cheer, the others fall, when their waiting clip next comes
      // round (0x86502B88, 0x86503A50: a four-way tie has no winner)
      l.end = x.place === 1 && !all ? 2 : 1;
      this.players[x.i].shown = this.players[x.i].total;
      if (x.score === PERFECT_END.score && l.perfectT === null) l.perfectT = 0; // (0x86502CD4)
    }
    return r;
  }
}
