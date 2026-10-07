// A Topsy-Turvy round: the world (rules.js) on the round's clock, and the
// scene it drives. The ring is the game's background picture (image bank 223:
// a bowl sunk in a brick floor), drawn behind the scene; the Hitmontop spin in
// front of it, seen as the game sees them: from (0, 3878, 4979) towards
// (0, -300, 0), fov 30 (0x86004840). In the game's units, 60 frames a second.
//
// Who plays each seat: "local" (this device's player), "cpu" or "remote"
// (someone on another device, online). The CPUs think in the world, so every
// device runs them alike. This device's player's pad emits "send" as it
// changes (the stick, and an A press), for a few frames on (src/lag.js:
// online, so it gets to the others first); online, the others' come in
// told("pad"), sometimes late: the world runs on guessing they held their
// stick and didn't press A, and runs again from a saved frame when one comes
// in (the Hitmontop eased to where they really are). The server runs the same
// world and says how it ended (told("won")).
import * as THREE from "three";
import { makeModel } from "./assets.js";
import * as R from "./rules.js";
import { leadFor } from "../lag.js";

// frames after the play's over before the round is (the winners going to their spots)
export const AFTER = 3 * R.FPS;
const SCALE = R.RADIUS / 200; // Hitmontop's scale (0x86002470)
const ANGLE = (3.1415927410125732 * 40) / 180; // the camera's (0x86004840: 40 degrees up, 6500 away)
export const CAMERA = { eye: [0, Math.fround(R.sinf(ANGLE) * 6500 + -300), Math.fround(R.cosf(ANGLE) * 6500)], at: [0, -300, 0], fov: 30 };
const SNAP = 12; // frames between the world's saved states (for running it again)
const KEEP = 20 * R.FPS; // and how far back they go
const SMOOTH = 0.88; // a corrected Hitmontop's ease to where it is, a 60th of a second
const LEAN = -0.3 * 0.01; // "LEAN BY STICK": how far it leans the way it's pushed
// Hitmontop's clips (0x8600D540): 0 spinning, 1 a RAPID SPIN, 2 a wobble, 3
// standing sadly, 4 and 5 standing, 6 hopping into a spin, 7 hit, 8 landing on
// its feet, 9 a cheer, 11 falling over, 12 lying there; and the sequences the
// game plays them in (0x8600D5DC-0x8600D61C: the last one in each loops on)
const SEQ = {
  idle: [5, 5, 4], jump: [6], spin: [0], rapid: [1], hit: [7], landed: [8, 3], won: [2, 2, 8, 9], lost: [11, 12],
};
const LOOP_ALL = new Set(["idle", "spin", "rapid", "hit"]);
const REELING_RED = new THREE.Color(1, 127 / 255, 127 / 255); // (0x86002780: env 255, 127, 127 at 150)
// a RAPID SPIN's ring round the top (0x86001DCC): its size while it spins, then shrinking as it recharges,
// and growing again its last 0.4 s
const SPIN_SIZE = 6, CHARGE_SIZE = 6, CHARGE_SIZE_MIN = 1.5, CHARGE_SIZE_LAST = 5.5, MIN_TIME = 0.4, AFTER_IMPACT = 1.5;
const SPARK_TIME = 16 / 30; // a spark's life (16 frames of its clip)
const SPARK_SCALE = 0.35; // (made for the remake: the module leaves the sparks at the list's own scale)
const TRAIL = 10; // the glow behind a Hitmontop sent reeling: its last 10 places (0x86000C6C)
const GLOW = 270; // (36 of the game's 320 columns across: about a Hitmontop)
// each player's colours (0x8600D1A0): the glow's
export const COLOURS = [0x6987ff, 0x55eb55, 0xff6969, 0xfff555];
const PAIRS = [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]];

export class Game {
  constructor(scene, assets) {
    this.scene = scene;
    this.assets = assets;
    this.listeners = {};
    const add = (o) => { scene.add(o); return o; };
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
      for (const m of v.ring.mats) { m.depthWrite = false; m.transparent = true; m.blending = THREE.AdditiveBlending; } // (a glow: its picture's black adds nothing)
      v.trail = [];
      v.glows = [...Array(TRAIL)].map(() => {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: assets.glow, transparent: true, depthWrite: false }));
        s.scale.set(GLOW, GLOW, 1);
        s.renderOrder = 2;
        s.visible = false;
        return add(s);
      });
      v.posture = new THREE.Quaternion();
      v.seq = null;
      v.blink = -1;
      return v;
    });
    // the sparks, one of each kind for each pair (0x86005B3C)
    this.sparks = PAIRS.map(() => {
      const s = { spark: makeModel(assets.spark, SPARK_SCALE), flash: makeModel(assets.flash, SPARK_SCALE), t: 0, flashT: 0, at: new THREE.Vector3() };
      for (const m of [s.spark, s.flash]) {
        add(m.root);
        m.root.renderOrder = 3;
        for (const mat of m.mats) { mat.depthWrite = false; mat.transparent = true; mat.blending = THREE.AdditiveBlending; }
        m.root.visible = false;
      }
      return s;
    });
    this.camQ = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(new THREE.Vector3(...CAMERA.eye), new THREE.Vector3(...CAMERA.at), new THREE.Vector3(0, 1, 0)));
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
    // (online, with other people: this device's player's pads count this many frames on, src/lag.js's in 60ths)
    this.lead = 2 * leadFor(this.control.map((c, z) => c === "remote" && !this.cpus[z]), setup.delay);
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
    this.time = 0;
    this.state = "ready";
    this.lastFrame = -1;
    this.clockS = 0;
    this.endAt = null;
    this.winners = null;
    this.tempoN = 0;
    this.lastSecond = null;
    this.before = null; // where things were before the last frame (to draw between)
    this.offsets = [0, 1, 2, 3].map(() => [0, 0, 0]);
    if (this.loops) for (const name in this.loops) this.loop(name, false);
    this.loops = {};
    this.hitAt = {}; // (each pair's last bump sound, so a long one doesn't drone)
    for (const s of this.sparks) { s.t = 0; s.flashT = 0; }
    for (const v of this.tops) { v.trail = []; v.seq = null; v.posture.identity(); }
    const told = setup.told;
    if (told?.pads) told.pads.forEach((list, z) => { if (list && !this.cpus[z]) this.inputs[z] = list.map((e) => [...e]); });
    if (told?.done) this.told("won", told.done);
    this.draw(0);
  }
  start() { this.state = "play"; }
  stop() { this.state = "over"; this.loop("hum", false); this.loop("humCharge", false); this.loop("humSpin", false); }
  setControl(z, c) {
    if (c === "cpu" && !this.cpus[z]) return; // (a person who left: their Hitmontop spins on, unsteered)
    this.control[z] = c;
  }

  get frame() { return Math.floor(this.time * R.FPS + 1e-6); }

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
  // run the world up to frame t
  runTo(t) {
    const w = this.world;
    while (this.simT < t) {
      const f = this.simT + 1;
      if (!w.over && f % SNAP === 0 && f > this.snaps[this.snaps.length - 1][0]) {
        this.snaps.push([f, w.save()]);
        while (this.snaps.length > 2 && this.snaps[1][0] < f - KEEP) this.snaps.shift();
      }
      if (f === t) this.before = this.positions();
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
  // frame f's sounds (once each), the sparks, the glows, the last seconds and the tune's hurry
  sounds(f) {
    const w = this.world;
    for (const e of w.events) {
      const [what, z] = e;
      if (what === "hit") {
        const [, a, b, k, x, y, zz, spun] = e, pair = PAIRS.findIndex(([i, j]) => i === a && j === b);
        const s = this.sparks[pair];
        if (s) { s.t = SPARK_TIME; s.at.set(x, y, zz); if (spun) s.flashT = SPARK_TIME; }
        if (k > 0 && !(f - (this.hitAt[pair] ?? -99) < 8)) { this.hitAt[pair] = f; this.emit("hit", a, b, k, this.pan(x)); }
        else if (k > 0) this.hitAt[pair] = f;
        continue;
      }
      if (what === "end") { this.emit("over"); continue; }
      if (what === "point") { this.emit("point", z, e[2], this.pan(w.p[e[2]].pos[0])); continue; }
      this.emit(what, z, this.pan(w.p[z].pos[0]));
    }
    // the glow behind each one sent reeling, in its hitter's colour (0x86006F20)
    for (const [z, p] of w.p.entries()) {
      const v = this.tops[z];
      const on = (p.state === 4 && !p.landed) || (p.state === 3 && p.touch > 0);
      v.trail.unshift(on && p.hitBy >= 0 ? { at: [...p.pos], c: p.hitBy, k: Math.min(1, p.touch / R.TOUCH_TIME) } : null);
      v.trail.length = Math.min(v.trail.length, TRAIL);
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
    // the hum of this device's own Hitmontop spinning (0x4400 and 0x4401, asked for each frame: 0x860032DC)
    const p = w.p[this.me], spinning = !w.over && [1, 2, 3, 6].includes(p.state);
    this.loop("humSpin", spinning && p.spin > 0);
    this.loop("humCharge", spinning && !(p.spin > 0) && p.cool > 0 && p.state === 3);
    this.loop("hum", spinning && !(p.spin > 0) && !(p.cool > 0 && p.state === 3));
  }
  loop(name, on) {
    if (!!this.loops[name] === on) return;
    this.loops[name] = on;
    this.emit("loop", name, on);
  }
  // a sound's pan: where it is across the screen
  pan(x) { return Math.round(64 + Math.max(-63, Math.min(63, (x / 2300) * 63))); }

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
    } else if (this.state === "over") this.time += dt;
    const ended = this.world.end !== null || (this.result && this.lastFrame >= this.result.f);
    if (ended && this.endAt === null) this.ending();
    this.animate(dt);
  }
  // the frame the play ended on: the server's, else this device's world's
  endFrame() { return this.result ? this.result.f : this.world.end; }

  // what happens on frame t (from GO): this device's player's pad is kept (and sent) for frame
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
    const between = this.state === "play" ? Math.max(0, Math.min(1, this.time * R.FPS - this.lastFrame)) : 1;
    this.draw(between, dt);
  }

  draw(between, dt = 0) {
    const w = this.world, before = this.before;
    const lerp = (a, b) => a + (b - a) * between;
    const up = new THREE.Vector3(), q = new THREE.Quaternion(), spinQ = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0);
    w.p.forEach((p, z) => {
      const v = this.tops[z];
      const was = before?.[z] || p.pos;
      const x = lerp(was[0], p.pos[0]) + this.offsets[z][0];
      const y = lerp(was[1], p.pos[1]) + this.offsets[z][1];
      const zz = lerp(was[2], p.pos[2]) + this.offsets[z][2];
      // its posture (0x860033E8): upright on the ring under it, leaning the way it's pushed; eased half way a frame
      const at = [x, y, zz], n = R.upAt(at);
      const target = new THREE.Quaternion().setFromUnitVectors(Y, new THREE.Vector3(...n));
      if (R.steerable(p)) {
        const lean = new THREE.Vector3(p.stick[1] * LEAN, 0, p.stick[0] * LEAN), a = lean.length();
        if (a > 0) target.multiply(new THREE.Quaternion().setFromAxisAngle(lean.normalize(), a));
      }
      v.posture.slerp(target, 1 - Math.pow(0.5, dt * 60));
      up.set(0, 1, 0).applyQuaternion(v.posture);
      // the model: at the ball's bottom, spun about its posture's up (0x86003FDC); waiting to jump in, standing on the floor
      const r = p.state <= 1 ? 0 : p.r;
      v.model.root.position.set(x - up.x * r, y - up.y * r, zz - up.z * r);
      spinQ.setFromAxisAngle(Y, p.heading);
      v.model.root.quaternion.copy(q.copy(v.posture).multiply(spinQ));
      this.animateTop(v, p, dt);
      v.model.tint(REELING_RED, p.state === 3 && p.hold > 0 && p.hard ? 150 / 255 : 0);
      // its shadow, on the ring (or the floor) under it (0x860043B4)
      const S = R.RING.INNER, O = R.RING.OUTER, inner = Math.hypot(x, zz) < S.r, outer = Math.hypot(x, zz) < O.r;
      const sy = inner ? R.surfaceY(S, x, zz) : outer ? R.surfaceY(O, x, zz) : 0;
      v.shadow.root.position.set(x, sy + 2, zz);
      v.shadow.root.quaternion.setFromUnitVectors(Y, new THREE.Vector3(...R.upAt([x, sy, zz])));
      // its RAPID SPIN's ring, round its top (0x86001DCC): spinning, and recharging
      let size = 0;
      if (p.state === 3) {
        if (p.spin > 0) size = SPIN_SIZE;
        else if (p.cool > 0) {
          size = MIN_TIME < p.cool ? ((CHARGE_SIZE - CHARGE_SIZE_MIN) * (p.cool - MIN_TIME)) / (AFTER_IMPACT - MIN_TIME) + CHARGE_SIZE_MIN
            : ((CHARGE_SIZE_LAST - CHARGE_SIZE_MIN) * (MIN_TIME - p.cool)) / MIN_TIME + CHARGE_SIZE_MIN;
        }
      }
      v.ring.root.visible = size > 0;
      if (size > 0) {
        v.ring.root.position.set(x + up.x * p.r, y + up.y * p.r, zz + up.z * p.r);
        v.ring.root.quaternion.copy(v.posture);
        v.ring.root.scale.setScalar(SCALE * size);
      }
      // the glow behind it, sent reeling
      v.glows.forEach((s, k) => {
        const g = v.trail[k];
        s.visible = !!g;
        if (!g) return;
        s.position.set(g.at[0], g.at[1], g.at[2]);
        s.material.color.setHex(COLOURS[g.c]);
        s.material.opacity = 0.6 * (1 - k / TRAIL) * g.k;
      });
    });
    // the sparks: their clip as they fade (0x860049B8), facing the camera
    for (const s of this.sparks) {
      for (const [m, t] of [[s.spark, s.t], [s.flash, s.flashT]]) {
        m.root.visible = t > 0;
        if (t <= 0) continue;
        m.root.position.copy(s.at);
        m.root.quaternion.copy(this.camQ);
        m.pose(0, 16 - (t * 16) / SPARK_TIME, true);
      }
      s.t -= dt;
      s.flashT -= dt;
    }
  }
  // its clips: the sequence its state calls for, from its start (the game's, 0x87C01A90: 30 frames a second)
  animateTop(v, p, dt) {
    let want;
    switch (p.state) {
      case 0: want = "idle"; break;
      case 1: want = "jump"; break;
      case 3: want = p.spin > 0 ? "rapid" : p.hold > 0 ? "hit" : "spin"; break;
      case 4: want = p.landed ? "landed" : v.seq === "hit" ? "hit" : "spin"; break;
      case 5: want = "won"; break;
      case 7: case 8: want = "lost"; break;
      default: want = "spin";
    }
    if (want !== v.seq) { v.seq = want; v.k = 0; v.t = 0; }
    const list = SEQ[want], m = v.model;
    v.t += dt * 30;
    while (v.t >= m.length(list[v.k]) && (v.k < list.length - 1 || LOOP_ALL.has(want))) {
      v.t -= m.length(list[v.k]);
      v.k = (v.k + 1) % list.length;
    }
    // (a blink now and then: texanim00)
    if (v.blink < 0 && Math.random() < dt / 3) v.blink = 0;
    if (v.blink >= 0) { v.blink += dt * 30; if (v.blink >= 7) v.blink = -1; }
    m.pose(list[v.k], v.t, !LOOP_ALL.has(want) && v.k === list.length - 1 && want === "jump", v.blink >= 0 ? Math.floor(v.blink) : -1);
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
