// A Topsy-Turvy round: the world (rules.js) on the round's clock, and the
// scene it drives. The ring is the game's background picture (image bank 223:
// a bowl sunk in a brick floor), drawn behind the scene; the Hitmontop spin in
// front of it, seen as the game sees them: from (0, 3878, 4979) towards
// (0, -300, 0), fov 30 (0x86004840). In the game's units.
//
// The world runs at the game's 30 frames a second; the scene is drawn at the
// screen's rate, between the last two frames the world ran (by the time gone
// since): where each Hitmontop is and how it's turned, the trail of glow
// behind one sent reeling, the ring round one recharging; and what the game
// moves a frame at a time, by the time gone: how it leans, its stretch in a
// RAPID SPIN, its clips, the sparks.
//
// Who plays each seat: "local" (this device's player), "cpu" or "remote"
// (someone on another device, online). The CPUs think in the world, so every
// device runs them alike. This device's player's pad emits "send" as it
// changes (the stick, and an A press), for a few frames on (src/lag.js:
// online, so it gets to the others first); online, the others' come in
// told("pad"), sometimes late: the world runs on guessing they held their
// stick and didn't press A, and runs again from a saved frame when one comes
// in (the Hitmontop eased to where they really are). The server runs the same
// world and says how it ended (told("won")). Frames count from the play's
// start, a countdown step after GO (rules.js START).
import * as THREE from "three";
import { makeModel } from "./assets.js";
import { combiner, dress } from "../n64fx.js";
import * as R from "./rules.js";
import { leadFor } from "../lag.js";
import { faceOnRender } from "../facing.js";

// frames after the play's over before the round is: the show's first frame hands over to the results,
// and the show goes on under them (0x86006964: 0x86006B74-0x86006BC8, 0x8600688C)
export const AFTER = 1;
const SCALE = R.RADIUS / 200; // Hitmontop's scale (0x86002470)
const ANGLE = (3.1415927410125732 * 40) / 180; // the camera's (0x86004840: 40 degrees up, 6500 away)
export const CAMERA = { eye: [0, Math.fround(R.sinf(ANGLE) * 6500 + -300), Math.fround(R.cosf(ANGLE) * 6500)], at: [0, -300, 0], fov: 30 };
// (the game's own view of it, 4:3: for where a sound is)
const VIEW = new THREE.PerspectiveCamera(CAMERA.fov, 4 / 3, 64, 32768);
VIEW.position.set(...CAMERA.eye);
VIEW.lookAt(...CAMERA.at);
VIEW.updateMatrixWorld();
const SNAP = 6; // frames between the world's saved states (for running it again)
const KEEP = 20 * R.FPS; // and how far back they go
const SMOOTH = 0.88; // a corrected Hitmontop's ease to where it is, a 60th of a second
const LEAN = -0.3 * 0.01; // "LEAN BY STICK": how far it leans the way it's pushed
const POSTURE = 0.5; // "POSTURE RESPONSE": how far it eases to that a frame (0x860033E8)
// stretched tall in a RAPID SPIN, as thin as it keeps its size (0x86002780: 1.5, 0.2 a frame)
const STRETCH = 1.5, STRETCH_STEP = 0.2;
const GHOST = 100 / 255; // passing through the others, coming in (0x86003C68: the object's alpha)
// Hitmontop's clips (object 115): 0 spinning, 1 a RAPID SPIN, 2 a wobble, 3 standing sadly, 4 and 5
// standing, 6 hopping into a spin, 7 hit, 8 landing on its feet, 9 a cheer, 11 falling over, 12 lying
// there. Which loop (their flags' bit 0, 0x87C02040: 6, 8, 10 and 11 play once)
const LOOPS = [1, 1, 1, 1, 1, 1, 0, 1, 0, 1, 0, 0, 1];
// the face each may play (0x8600D540, rolled by 0x87C01910 as each starts, and again as that face
// ends): its texture clip, whether at the clip's own frame (else from its start), and the chance
const FACE = { 3: [0, 1, 0.3], 4: [0, 0, 0.2], 5: [0, 1, 0.3], 7: [1, 1, 1], 9: [2, 1, 1], 11: [3, 1, 1], 12: [4, 1, 1] };
// the sequences the game plays them in (0x8600D5DC-0x8600D60C): -2 holds the last, -3 - k goes back to the k-th
const SEQ = {
  idle: [[5, 5, 5, 4, -3], [4, 4, 4, 5, -4]], // (one of them, from a random place in it: 0x86003A0C)
  jump: [6, -2], won: [2, 2, 8, 9, 9, 9, -6], landed: [8, 3, -4], lost: [11, 12, 12, 12, 12, 12, -4],
};
const REELING_RED = new THREE.Color(1, 127 / 255, 127 / 255); // (0x86002780: env 255, 127, 127 at 150)
// a RAPID SPIN's ring round the top (0x86001DCC): its size while it spins, then shrinking as it recharges,
// and growing again its last 0.4 s
const SPIN_SIZE = 6, CHARGE_SIZE = 6, CHARGE_SIZE_MIN = 1.5, CHARGE_SIZE_LAST = 5.5, MIN_TIME = 0.4, AFTER_IMPACT = 1.5;
const SPARK_TIME = 16 / 30; // a spark's life (16 frames of its clip)
// the sparks' size: their own (the module sets only their place, +0x24; their scale, +0x30, stays as
// 0x8003F11C made it, 1: 0x80094A44)
const SPARK_SCALE = 1;
const TRAIL = 10; // the glow behind a Hitmontop sent reeling: its last 10 places, a frame apart (0x86000C6C)
// its size: texture rectangles 36 of the game's 240 rows square (its white middle 12), whatever the
// depth (0x86000CCC); here sprites a fixed size on the screen, as tall as that of the ring's picture
// (which fills the game's 30 degrees)
const GLOW = (36 / 240) * 2 * Math.tan((15 * Math.PI) / 180);
// the glow's colours (0x8600D1A0: a grey for nobody, then 1P-4P): prim, and env (at 0x50)
export const COLOURS = [0x6987ff, 0x55eb55, 0xff6969, 0xfff555];
const GLOW_PRIM = [0xc8c8c8, ...COLOURS].map((c) => new THREE.Color(c));
const GLOW_ENV = [0xc8c8c8, 0x5569cd, 0x4bc34b, 0xcd5555, 0xcdc34b].map((c) => new THREE.Color(c));
// the glow's recipe (0x86000CCC: image bank 151, I8, through G_SETCOMBINE FC30D261 55A6FF7F: colour
// env + (prim - env) x its picture, alpha env's x its picture; in G_RM_AA_ZB_XLU_SURF), drawn ten times
// in its hitter's colours, each place fainter, then ten times white (prim and env) at 0x80, a third the size
const GLOW_SPEC = { mux: [3, 5, 1, 5, 5, 7, 1, 7, 3, 5, 1, 5, 5, 7, 1, 7], prim: [255, 255, 255, 255], env: [255, 255, 255, 128],
  textures: [{ file: "glow.png", size: [32, 32], sf: [1, 1], wrap: [2, 2], fmt: 4 }] };
const PAIRS = [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]];
const HIT_GAP = 4; // frames a pair's bump sound waits before another (the remake's: the game asks at each step they touch)
// the hum's pitch as 0x800278B0 hands on 0x4000's: half the one asked for, + 0.25, then each player's own
const HUM_PITCH = [-0.05, 0.05, 0, -0.1];
const humPitch = (k, z) => Math.fround(Math.fround(k * 0.5 + 0.25) + HUM_PITCH[z]);
const wrapAngle = (a) => a - 2 * Math.PI * Math.round(a / (2 * Math.PI));

// A Hitmontop's clips, as module #48 runs them (0x87C01A90: a frame at a time; here by the time gone,
// so they run smooth): a clip, or a sequence of them; each one's face (0x87C01CBC)
class Clips {
  constructor(model, faces) {
    this.m = model;
    this.faces = faces; // (each texture clip's length)
    this.speed = 0.99 + Math.random() * 0.02; // (each its own: 0x860021C4)
    this.seq = null;
    this.k = 0;
    this.clip = -1;
    this.f = 0;
    this.held = false;
    this.face = false;
    this.faceT = 0;
  }
  len(c) { return this.m.length(c); }
  // clip c on (0x87C019B0), its face rolled for (0x87C01910)
  pick(c) {
    this.clip = c;
    const e = FACE[c];
    this.face = !!e && Math.random() <= e[2];
    this.faceT = 0;
  }
  // a clip on its own (0x87C01DB8): from its start if it's another (or again)
  play(c, again = false) {
    if (again || c !== this.clip) this.f = 0;
    this.pick(c);
    this.seq = null;
    this.held = false;
  }
  // a sequence (0x87C01E30), unless it's the one on (or again)
  run(seq, again = false) {
    if (!again && seq === this.seq) return;
    this.seq = seq;
    this.k = 0;
    this.pick(seq[0]);
    this.f = 0;
    this.held = false;
  }
  // from somewhere in it (0x87C01E98)
  from(r1, r2) {
    const n = this.seq.findIndex((c) => c < 0);
    this.k = Math.min(n - 1, Math.floor(n * r1));
    this.pick(this.seq[this.k]);
    const L = this.len(this.clip);
    this.f = Math.min(L - 1, L * r2);
  }
  // its next clip (0x87C019DC): false at its end
  next() {
    if (this.seq[this.k] === -2) return false;
    let c = this.seq[++this.k];
    if (c === -2) { this.k--; return false; }
    if (c < -2) { this.k = -3 - c; c = this.seq[this.k]; }
    this.pick(c);
    return true;
  }
  // n frames on
  step(n) {
    if (this.clip < 0 || this.held) return;
    this.f += this.speed * n;
    if (this.face) {
      this.faceT += this.speed * n;
      if (this.faceT >= this.faces[FACE[this.clip][0]]) this.pick(this.clip);
    }
    for (let guard = 0; guard < 8 && !this.held; guard++) {
      const L = this.len(this.clip);
      if (this.f < L) break;
      if (LOOPS[this.clip]) {
        if (!this.seq) { this.f -= L; this.pick(this.clip); } else if (this.next()) this.f -= L; else break;
      } else if (!this.seq || !this.next()) { this.f = L - 1; this.held = true; }
      // (one that plays once leaves the next in its sequence at the frame it got to: 0x87C01A90 takes
      // its length off only for one that loops)
    }
  }
  // the face to show: [texture clip, its frame], or none
  get faceAt() {
    if (!this.face) return null;
    const [tex, own] = FACE[this.clip];
    return [tex, Math.floor(own ? this.f : this.faceT)];
  }
}

export class Game {
  constructor(scene, assets) {
    this.scene = scene;
    this.assets = assets;
    this.listeners = {};
    const add = (o) => { scene.add(o); return o; };
    faceOnRender(scene); // (the sparks, and bits of Hitmontop: their joints drawn facing the camera)
    // the ring: the game's picture, where the camera sees it (a quad 4:3 across the game's view, far
    // off), and its brick floor going on round it for a window wider or taller than the game's
    const dir = new THREE.Vector3(...CAMERA.at).sub(new THREE.Vector3(...CAMERA.eye)).normalize();
    const D = 20000, h = 2 * D * Math.tan((CAMERA.fov * Math.PI) / 360), w = (h * 4) / 3;
    const flat = (map, pw, ph, order) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), new THREE.MeshBasicMaterial({ map, depthWrite: false, depthTest: false }));
      m.position.copy(new THREE.Vector3(...CAMERA.eye).addScaledVector(dir, D));
      m.lookAt(...CAMERA.eye);
      m.renderOrder = order;
      m.frustumCulled = false;
      return add(m);
    };
    const bricks = assets.bricks.clone();
    bricks.wrapS = bricks.wrapT = THREE.MirroredRepeatWrapping;
    bricks.repeat.set((20 * 320) / 128, (20 * 240) / 32); // (its pixels the picture's size)
    bricks.needsUpdate = true;
    flat(bricks, w * 20, h * 20, -11);
    flat(assets.ring, w, h, -10);
    // the Hitmontop, each with its shadow, its RAPID SPIN's ring and the glow behind it when it reels
    const faces = assets.hitmontop.texanims.map((t) => Math.max(1, ...Object.values(t).map((v) => v.length)));
    this.tops = [0, 1, 2, 3].map((z) => {
      const v = { model: makeModel(assets.hitmontop, SCALE), shadow: makeModel(assets.shadow, SCALE), ring: makeModel(assets[`ring${z}`], 1) };
      add(v.model.root);
      add(v.shadow.root);
      add(v.ring.root);
      v.shadow.root.renderOrder = -1;
      // (the shadow's picture is its darkness: 0x86002470)
      v.shadow.model.traverse((o) => {
        if (o.isMesh) o.material = new THREE.MeshBasicMaterial({ color: 0, alphaMap: o.material.map, transparent: true, depthWrite: false });
      });
      v.ringMats = dress(assets.fx, v.ring.model, `ring${z}`);
      v.trail = [];
      const glow = (size, order) => {
        const s = new THREE.Sprite(combiner(assets.fx, GLOW_SPEC, { sprite: true, flipY: true }));
        s.material.sizeAttenuation = false; // (a size on the screen)
        s.scale.set(size, size, 1);
        s.renderOrder = order;
        s.visible = false;
        return add(s);
      };
      v.glows = [...Array(TRAIL)].map(() => glow(GLOW, 2));
      v.middles = [...Array(TRAIL)].map(() => glow(GLOW / 3, 3));
      v.posture = new THREE.Quaternion();
      v.clips = new Clips(v.model, faces);
      v.state = -1;
      v.stretch = 1;
      return v;
    });
    // the sparks, one of each kind for each pair (0x86005B3C): object 199, six streaks flying out of
    // where they bumped, and 200 with a RAPID SPIN, a flash; facing the camera (their joints' flag 2: src/facing.js)
    this.sparks = PAIRS.map(() => {
      const s = { spark: makeModel(assets.spark, SPARK_SCALE), flash: makeModel(assets.flash, SPARK_SCALE), t: 0, flashT: 0, at: new THREE.Vector3() };
      s.sparkMats = dress(assets.fx, s.spark.model, "spark");
      s.flashMats = dress(assets.fx, s.flash.model, "flash");
      for (const m of [s.spark, s.flash]) { m.root.renderOrder = 4; m.root.visible = false; add(m.root); }
      return s;
    });
    this.reset("normal");
    this.state = "idle";
  }
  on(name, fn) { (this.listeners[name] ||= []).push(fn); }
  emit(name, ...args) { for (const fn of this.listeners[name] || []) fn(...args); }

  // A round. level: easy / normal / hard; setup: { me, control, cpus (which
  // seats are CPUs), told (online, the server's word so far: to rejoin it
  // midway), delay (each seat's, src/lag.js) }
  reset(level, seed = (Math.random() * 2 ** 31) | 0, setup = {}) {
    this.levelName = level;
    this.seed = seed;
    this.me = setup.me ?? 0;
    this.control = setup.control || [0, 1, 2, 3].map((z) => (z === this.me ? "local" : "cpu"));
    this.cpus = setup.cpus || this.control.map((c) => c === "cpu");
    // (online, with other people: this device's player's pads count this many frames on, src/lag.js)
    this.lead = leadFor(this.control.map((c, z) => c === "remote" && !this.cpus[z]), setup.delay, R.FPS);
    this.world = new R.World(seed, level, this.cpus);
    this.inputs = [[], [], [], []]; // each person's pad: [frame, stick (packed), A 0/1]
    this.snaps = [[0, this.world.save()]]; // the world as it was before a frame
    this.simT = -1; // the last frame the world has run
    this.shownT = -1; // and whose sounds have gone
    this.stick = [0, 0]; // this device's player's stick (-64 to 64, up +y)...
    this.presses = 0; // ...and its A presses not yet in a frame
    this.lastPad = pack(0, 0);
    this.result = null; // the server's word on the end: { f, s }
    this.scores = null;
    this.time = 0; // s from GO
    this.state = "ready";
    this.lastFrame = -1;
    this.clockS = 0;
    this.endAt = null;
    this.winners = null;
    this.tempoN = 0;
    this.lastSecond = null;
    this.before = null; // how things were before the last frame (to draw between)
    this.offsets = [0, 1, 2, 3].map(() => [0, 0, 0]);
    this.quiet();
    this.loops = {};
    this.hitAt = {}; // (each pair's last bump sound, so a long one doesn't drone)
    for (const s of this.sparks) { s.t = 0; s.flashT = 0; }
    for (const v of this.tops) { v.trail = []; v.state = -1; v.landed = false; v.stretch = 1; v.posture.identity(); }
    const told = setup.told;
    if (told?.pads) told.pads.forEach((list, z) => { if (list && !this.cpus[z]) this.inputs[z] = list.map((e) => [...e]); });
    if (told?.done) this.told("won", told.done);
    this.draw(1);
  }
  start() { this.state = "play"; }
  // the round's over: the show goes on (the winners to their spots, cheering), its hums too
  stop() { this.state = "over"; if (!this.world.over) this.quiet(); }
  setControl(z, c) {
    if (c === "cpu" && !this.cpus[z]) return; // (a person who left: their Hitmontop spins on, unsteered)
    this.control[z] = c;
  }

  // the world's frame now (the play's: a countdown step after GO)
  get frame() { return Math.floor(this.time * R.FPS + 1e-6) - R.START; }

  // ---- input ----
  // this device's player: the stick (-64 to 64 each way; up is +y), and A
  setStick(x, y) {
    const c = (v) => Math.max(-64, Math.min(64, Math.round(v)));
    this.stick = [c(x), c(y)];
  }
  press() { if (this.state === "play") this.presses = Math.min(2, this.presses + 1); }
  // seat z's pad on frame t: [stick x, stick y, A]
  padAt(z, t) {
    const list = this.inputs[z];
    let i = list.length - 1;
    while (i >= 0 && list[i][0] > t) i--;
    if (i < 0) return [0, 0, false];
    let a = false;
    for (let j = i; j >= 0 && list[j][0] === t; j--) if (list[j][2]) a = true;
    return [...unpack(list[i][1]), a];
  }

  // the server's word: someone's pad ("pad": { s, f, x, a }; to this device's
  // own, o: the frame it said), or the end ("won": { f, s: each one's points })
  told(type, m) {
    if (type === "pad") {
      const z = m.s;
      if (!(z >= 0 && z < 4) || this.cpus[z] || !Number.isInteger(m.f) || !validPad(m.x) || (m.a !== 0 && m.a !== 1)) return;
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
      this.rewind(m.f);
      return;
    }
    if (type === "won") {
      if (!Number.isInteger(m.f) || !Array.isArray(m.s)) return;
      this.result = { f: m.f, s: [0, 1, 2, 3].map((z) => (Number.isInteger(m.s[z]) ? m.s[z] : 0)) };
    }
  }
  // the world again from before frame f (a pad it ran without); where they
  // were is kept, to ease them to where they turn out to be
  rewind(f) {
    if (f > this.simT) return;
    if (!this.was) this.was = { t: this.simT, at: this.positions() };
    while (this.snaps.length > 1 && this.snaps[this.snaps.length - 1][0] > f) this.snaps.pop();
    const [at, state] = this.snaps[this.snaps.length - 1];
    this.world.load(state);
    this.simT = at - 1;
  }
  positions() { return this.world.p.map((p) => [...p.pos]); }
  // how each one is, to draw between frames
  poses() { return this.world.p.map((p) => ({ pos: [...p.pos], heading: p.heading, state: p.state, spin: p.spin, cool: p.cool })); }
  // run the world up to frame t
  runTo(t) {
    const w = this.world;
    while (this.simT < t) {
      const f = this.simT + 1;
      if (!w.over && f % SNAP === 0 && f > this.snaps[this.snaps.length - 1][0]) {
        this.snaps.push([f, w.save()]);
        while (this.snaps.length > 2 && this.snaps[1][0] < f - KEEP) this.snaps.shift();
      }
      if (f === t) this.before = this.poses();
      w.step(f, [0, 1, 2, 3].map((z) => (this.cpus[z] ? null : this.padAt(z, f))));
      this.simT = f;
      if (f > this.shownT) { this.sounds(f); this.shownT = f; }
      w.events = [];
      if (this.was && f === this.was.t) { // (run again to where it was: ease them from there)
        w.p.forEach((p, z) => { for (let k = 0; k < 3; k++) this.offsets[z][k] += this.was.at[z][k] - p.pos[k]; });
        this.was = null;
      }
    }
  }
  // frame f's sounds (once each), the sparks, the clips a bump starts, the glows, the last seconds and the tune's hurry
  sounds(f) {
    const w = this.world;
    for (const e of w.events) {
      const [what, z] = e;
      if (what === "hit") {
        const [, a, b, k, x, y, zz, spun] = e, pair = PAIRS.findIndex(([i, j]) => i === a && j === b);
        const s = this.sparks[pair];
        if (s) { s.t = SPARK_TIME; s.at.set(x, y, zz); if (spun) s.flashT = SPARK_TIME; }
        // (each one it sends reeling: clip 7 from its start, at each step they touch: 0x860037D8)
        for (const q of [a, b]) if (w.p[q].hold > 0) this.tops[q].clips.play(7, true);
        if (k > 0 && !(f - (this.hitAt[pair] ?? -99) < HIT_GAP)) { this.hitAt[pair] = f; this.emit("hit", a, b, k); }
        else if (k > 0) this.hitAt[pair] = f;
        continue;
      }
      if (what === "end") { this.emit("over"); continue; }
      if (what === "point") { this.emit("point", z, e[2]); continue; }
      this.emit(what, z, this.place(w.p[z].pos));
    }
    // the glow behind each one sent reeling, in its hitter's colour, by how hard it was hit (0x86006F20)
    for (const [z, p] of w.p.entries()) {
      const v = this.tops[z];
      const on = (p.state === 4 && !p.landed) || (p.state === 3 && p.touch > 0);
      v.trail.unshift(on ? { at: [...p.pos], c: p.hitBy + 1, k: Math.fround(p.touch / R.TOUCH_TIME) } : null);
      v.trail.length = Math.min(v.trail.length, TRAIL + 1);
    }
    if (!w.over) {
      // the clock's last three seconds (0xCF00), and its 0 (0xCF06: a second before the time's up)
      const s = Math.floor(w.left / R.FPS);
      if (s !== this.lastSecond) {
        if (this.lastSecond !== null && s >= 1 && s <= 3) this.emit("sound", "lastCount");
        if (this.lastSecond !== null && s === 0) this.emit("sound", "lastGo");
        this.lastSecond = s;
      }
      // the tune's hurry in the last 30 s (0x80028108(4): a beat a minute faster every 30 frames, up to 15)
      if (w.left <= 30 * R.FPS) {
        const n = Math.min(15, Math.floor((30 * R.FPS - w.left) / 30) + 1);
        if (n !== this.tempoN) { this.tempoN = n; this.emit("tempo", n); }
      }
    }
    // every Hitmontop's hum while it spins, asked for each frame (0x860032DC: in states 1, 2, 3 and 6),
    // each on its own channel, placed where it is: 0x4401 in a RAPID SPIN (1.75), else 0x4000 at 1.25,
    // or 1 while it recharges (not reeling), its pitch as 0x800278B0 hands it on
    for (let z = 0; z < 4; z++) {
      const p = w.p[z], spinning = [1, 2, 3, 6].includes(p.state), x = this.place(p.pos);
      const rapid = spinning && p.spin > 0, charging = p.cool > 0 && !(p.state === 3 && p.hold > 0);
      this.loop("humSpin", z, rapid, { x });
      this.loop("hum", z, spinning && !rapid, { x, pitch: humPitch(charging ? 1 : 1.25, z) });
    }
  }
  loop(name, z, on, how) {
    if (!on && !this.loops[name + "/" + z]) return;
    this.loops[name + "/" + z] = on;
    this.emit("loop", name, z, on, how);
  }
  quiet() { for (const k in this.loops || {}) if (this.loops[k]) this.loop(k.split("/")[0], +k.split("/")[1], false); }
  // where a sound is (0x86001924): its place on the game's screen, -64 to 64 across (0x87C03B60: the
  // view's matrix, x 64), then x 1.33, held to -127 to 127
  place(pos) {
    const s8 = (v) => Math.trunc(Math.max(-127, Math.min(127, v)));
    const v = new THREE.Vector3(...pos).project(VIEW);
    return s8(Math.fround(s8(v.x * 64) * 1.33));
  }

  // ---- the round, frame by frame ----
  update(dt) {
    this.clockS += dt;
    if (this.state === "play") {
      this.time += dt;
      const now = this.frame;
      for (let t = this.lastFrame + 1; t <= now; t++) { this.step(t); this.lastFrame = t; }
      this.runTo(this.lastFrame); // (after a pad that came in late)
      const end = this.endFrame();
      if (end !== null && this.frame >= end + AFTER) { this.stop(); this.emit("finish"); }
    } else if (this.state === "over") {
      this.time += dt;
      this.runTo(this.lastFrame); // (after a pad that came in late)
      // (the show: the winners going to their spots and cheering, the others fallen over)
      for (let t = this.lastFrame + 1; t <= this.frame && this.world.over; t++) { this.runTo(t); this.lastFrame = t; }
    }
    const ended = this.world.end !== null || (this.result && this.lastFrame >= this.result.f);
    if (ended && this.endAt === null) this.ending();
    this.animate(dt);
  }
  // the frame the play ended on: the server's, else this device's world's
  endFrame() { return this.result ? this.result.f : this.world.end; }

  // what happens on frame t (of the play): this device's player's pad is kept (and sent) for frame
  // t + lead, and the world runs
  step(t) {
    const me = this.me, f = t + this.lead;
    if (this.control[me] === "local" && !this.cpus[me] && !this.world.over) {
      const a = this.presses > 0 ? 1 : 0;
      if (a) this.presses--;
      const x = pack(...this.stick);
      if (x !== this.lastPad || a) {
        this.inputs[me].push([f, x, a, f]); // ([frame, stick, A, the frame it was sent for])
        this.lastPad = x;
        this.emit("send", { s: me, f, x, a });
      }
    }
    this.runTo(t);
  }
  over() { return this.state === "over"; }

  // each one's points: the server's once it's said, else the world's
  points() { return this.result ? this.result.s : this.world.scores; }
  // the places (1-4) by points
  places() { const s = this.points(); return s.map((x) => 1 + s.filter((y) => y > x).length); }
  // the seconds left on the clock (the game's: whole ones, down to 0 a second before the end)
  secondsLeft() { return Math.floor(this.world.left / R.FPS); }

  // ---- the end: the winners go to their spots and cheer, the others fall over ----
  ending() {
    this.endAt = this.time;
    const p = this.places(), s = this.points();
    this.winners = p.map((x) => x === 1 && !s.every((y) => y === s[0])); // (a draw: nobody)
    this.emit("end", this.winners);
  }

  // ---- every rendered frame ----
  animate(dt) {
    const k = Math.pow(SMOOTH, dt * 60);
    for (const o of this.offsets) { o[0] *= k; o[1] *= k; o[2] *= k; }
    // (how far it is from the last frame the world ran to the next)
    const running = this.state === "play" || this.state === "over";
    const between = running ? Math.max(0, Math.min(1, this.time * R.FPS - R.START - this.lastFrame)) : 1;
    this.draw(between, dt);
  }

  draw(between, dt = 0) {
    const w = this.world, before = this.before;
    const lerp = (a, b) => a + (b - a) * between;
    const up = new THREE.Vector3(), q = new THREE.Quaternion(), spinQ = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0);
    w.p.forEach((p, z) => {
      const v = this.tops[z];
      const was = before?.[z] || { pos: p.pos, heading: p.heading, state: p.state, spin: p.spin, cool: p.cool };
      const x = lerp(was.pos[0], p.pos[0]) + this.offsets[z][0];
      const y = lerp(was.pos[1], p.pos[1]) + this.offsets[z][1];
      const zz = lerp(was.pos[2], p.pos[2]) + this.offsets[z][2];
      // its posture (0x860033E8): upright on the ring under it, leaning the way it's pushed; eased half way a frame
      const at = [x, y, zz], n = R.upAt(at);
      const target = new THREE.Quaternion().setFromUnitVectors(Y, new THREE.Vector3(...n));
      if (R.steerable(p)) {
        const lean = new THREE.Vector3(p.stick[1] * LEAN, 0, p.stick[0] * LEAN), a = lean.length();
        if (a > 0) target.multiply(new THREE.Quaternion().setFromAxisAngle(lean.normalize(), a));
      }
      v.posture.slerp(target, 1 - Math.pow(1 - POSTURE, dt * R.FPS));
      up.set(0, 1, 0).applyQuaternion(v.posture);
      // the model: at the ball's bottom, spun about its posture's up (0x86003FDC); waiting to jump in, standing on the floor
      const r = p.state <= 1 ? 0 : p.r;
      v.model.root.position.set(x - up.x * r, y - up.y * r, zz - up.z * r);
      // (its turn: the way it went from the last frame to this, the shorter way round, as a 30th of a second shows it)
      spinQ.setFromAxisAngle(Y, was.heading + wrapAngle(p.heading - was.heading) * between);
      v.model.root.quaternion.copy(q.copy(v.posture).multiply(spinQ));
      // stretched in a RAPID SPIN (0x86002780: x and z by the square root of 1 / it, y by it)
      v.stretch = R.approach(v.stretch, p.spin > 0 ? STRETCH : 1, STRETCH_STEP * R.FPS * dt);
      const thin = Math.sqrt(1 / v.stretch);
      v.model.root.scale.set(thin, v.stretch, thin);
      this.animateTop(v, p, dt);
      v.model.tint(REELING_RED, p.state === 3 && p.hold > 0 && p.hard ? 150 / 255 : 0);
      v.model.alpha(p.state === 2 ? GHOST : 1);
      // its shadow, on the ring (or the floor) under it (0x860043B4)
      const S = R.RING.INNER, O = R.RING.OUTER, inner = Math.hypot(x, zz) < S.r, outer = Math.hypot(x, zz) < O.r;
      const sy = inner ? R.surfaceY(S, x, zz) : outer ? R.surfaceY(O, x, zz) : 0;
      v.shadow.root.position.set(x, sy + 2, zz);
      v.shadow.root.quaternion.setFromUnitVectors(Y, new THREE.Vector3(...R.upAt([x, sy, zz])));
      // its RAPID SPIN's ring, round its top (0x86001DCC): spinning, and recharging
      const ringSize = (o) => {
        if (o.state !== 3) return 0;
        if (o.spin > 0) return SPIN_SIZE;
        if (!(o.cool > 0)) return 0;
        return MIN_TIME < o.cool ? ((CHARGE_SIZE - CHARGE_SIZE_MIN) * (o.cool - MIN_TIME)) / (AFTER_IMPACT - MIN_TIME) + CHARGE_SIZE_MIN
          : ((CHARGE_SIZE_LAST - CHARGE_SIZE_MIN) * (MIN_TIME - o.cool)) / MIN_TIME + CHARGE_SIZE_MIN;
      };
      const now = ringSize(p), then = ringSize(was), size = now > 0 && then > 0 ? lerp(then, now) : now;
      v.ring.root.visible = size > 0;
      if (size > 0) {
        v.ring.root.position.set(x + up.x * p.r, y + up.y * p.r, zz + up.z * p.r);
        v.ring.root.quaternion.copy(v.posture);
        v.ring.root.scale.setScalar(SCALE * size);
        for (const m of v.ringMats) m.n64.frame(this.clockS * 30, true); // (its tiles scroll, its colours pulse)
      }
      // the glow behind it, sent reeling (0x86000CCC): its places from the last frame and the one before,
      // drawn between; each as bright as how hard it was hit (+0x17F0 / 0.5, up to 2.4 after a RAPID
      // SPIN), by 0x50 in its colours and 0x80 in white, kept to a byte (so the white wraps round past 255)
      v.glows.forEach((s, k) => {
        const g = v.trail[k], o = v.trail[k + 1], wm = v.middles[k], e = g || o;
        s.visible = wm.visible = !!e;
        if (!e) return;
        // (a glow starting, or the last going: faded in or out)
        const by = g && o ? lerp(o.k, g.k) : e.k, keep = g && o ? 1 : g ? between : 1 - between;
        if (g && o) s.position.set(lerp(o.at[0], g.at[0]), lerp(o.at[1], g.at[1]), lerp(o.at[2], g.at[2]));
        else s.position.set(...e.at);
        wm.position.copy(s.position);
        const fade = 1 - k / TRAIL, c = GLOW_PRIM[e.c] || GLOW_PRIM[0], en = GLOW_ENV[e.c] || GLOW_ENV[0];
        s.material.n64.prim.set(c.r, c.g, c.b, 1);
        s.material.n64.env.set(en.r, en.g, en.b, ((Math.trunc(0x50 * fade * by) & 0xff) / 255) * keep);
        wm.material.n64.env.w = ((Math.trunc(0x80 * fade * by) & 0xff) / 255) * keep;
      });
    });
    // the sparks: their clips and colour tracks from the bump (0x860049B8: 16 frames), facing the camera
    for (const s of this.sparks) {
      for (const [m, t, mats] of [[s.spark, s.t, s.sparkMats], [s.flash, s.flashT, s.flashMats]]) {
        m.root.visible = t > 0;
        if (t <= 0) continue;
        const f = 16 - (t * 16) / SPARK_TIME;
        m.root.position.copy(s.at);
        m.pose(0, f, true);
        for (const mat of mats) mat.n64.frame(f);
      }
      s.t -= dt;
      s.flashT -= dt;
    }
  }
  // its clips, as its state calls for them (0x86003EFC, each state's own; 0x87C01A90 runs them, 30 frames a second)
  animateTop(v, p, dt) {
    const a = v.clips;
    if (p.state !== v.state) {
      switch (p.state) {
        case 0: a.run(SEQ.idle[Math.random() > 0.5 ? 1 : 0], true); a.from(Math.random(), Math.random()); break; // (0x86003A0C)
        case 1: a.run(SEQ.jump); break; // (0x86003A98)
        case 2: case 3: a.play(0); break; // (0x86003C68, 0x86003CFC)
        case 5: a.run(SEQ.won); break; // (0x86003D54)
        case 6: if (v.state !== 3) a.play(0); break; // (out of the ring at the end: in through 1, 2 and 3 at once)
        case 7: a.run(SEQ.lost); break; // (0x86003DD0)
        case 8: a.run(SEQ.lost, true); break; // (0x86003E5C)
        default: if (a.clip < 0) a.play(0); // (first seen out of the ring: rejoining a round)
      }
      v.state = p.state;
      v.landed = false;
    }
    // in the ring and not reeling, spinning (0x86002D50, each frame: in a RAPID SPIN too, so its own clip 1,
    // which 0x860022F8 starts, is never seen); landed out of it, landing (0x86002DA8)
    if (p.state === 3 && !(p.hold > 0)) a.play(0);
    if (p.state === 4 && p.landed && !v.landed) { a.run(SEQ.landed); v.landed = true; }
    a.step(dt * 30);
    v.model.pose(a.clip, a.f, !LOOPS[a.clip], a.faceAt);
  }

  // ---- the end ----
  results() {
    const places = this.places(), s = this.points();
    return [0, 1, 2, 3].map((i) => ({ i, score: this.scores ? this.scores[i] : s[i], place: places[i] }))
      .sort((a, b) => a.place - b.place || a.i - b.i);
  }
  celebrate() { return this.results(); }
}

// a pad's stick, as it's sent: (x + 64) | (y + 64) << 8
export function pack(x, y) { return (x + 64) | ((y + 64) << 8); }
export function unpack(v) { return [(v & 0xff) - 64, ((v >> 8) & 0xff) - 64]; }
function validPad(v) { return Number.isInteger(v) && v >= 0 && v <= 0x8080 && (v & 0xff) <= 128; }
