// A Delibird's Delivery round: the world (rules.js) on the round's clock, and
// the scene it drives. The stage is objects 148 (the field, the back belt, the
// doors) and 147 (the front belt, the walls), drawn a ninth of their size at
// the middle of the game's units; the camera looks at it as the game's does
// (0x86A00020): from above the front, towards (0, 130, 50), fov 24.7. 30
// frames a second.
//
// Who plays each seat: "local" (this device's player), "cpu" or "remote"
// (someone on another device, online). The CPUs think in the world, so every
// device runs them alike. This device's player's stick emits "send" as it
// changes, for a few frames on (src/lag.js: online, so it gets to the others
// first); online, the others' come in told("pad"), sometimes late: the world
// runs on guessing they held their stick as it was, and runs again from a
// saved frame when one comes in (the Delibird eased to where they really are).
// The server runs the same world and says how it ended (told("won")).
import * as THREE from "three";
import { makeModel } from "./assets.js";
import * as R from "./rules.js";
import { leadFor } from "../lag.js";

// the camera (0x86A00020: 550 back from 400 above where it looks, 0.36 rad up; fov 24.69)
const AT = [0, 130, 50], LOOK = 0.3599900007247925;
export const CAMERA = { eye: [0, 550 * Math.sin(LOOK) + 400 + AT[1], 550 * Math.cos(LOOK) + AT[2]], at: AT, fov: 24.689977645874023 };
const ANG = (a) => (a / 65536) * Math.PI * 2;
const SNAP = 6; // frames between the world's saved states (for running it again)
const KEEP = 20 * R.FPS; // and how far back they go
const SMOOTH = 0.88; // a corrected Delibird's ease to where it is, a 60th of a second
const STAGE = 1 / 9; // the stage's scale, and the rest (0x86A004B4)
const DELIBIRD = 0.07923809438943863, GIFT = 0.2222222238779068, BOX = 1 / 9, SWINUB = 0.6;
const FACING = /^(gift|swinub)/; // the models drawn facing the camera (see camera())
const CLIP_RATE = 1.5; // Delibird's clips: 1.5 frames a frame (0x18000)
const SHADOW = 16 * 2.5, SHADOW_A = 0x80 / 255; // the shadows: image bank 307's dot at 2.5, black at 128 (0x86A0B8A4)
const LABEL_Y = 55, LABEL = [36, 18], LABEL_A = 0xb4 / 255; // the label over each (the remake's size)
const FULL_Y = 82, FULL = [56, 17], FULL_GROW = 20; // FULL over a full sack, growing (0x86A0B98C)
// the sack's clip (11): how far it plays by how full it is (0x86A01EF0)
const SACK_AT = [1, 12, 23, 34, 45, 56];
// how high Delibird's label rides as it hops (0x86A0D7B8: clip 6; 0x86A0D890: clip 10, knocked over)
const HOP = [8.9798, 8.9086, 8.7724, 8.6916, 9.1159, 10.0218, 10.8433, 11.093, 10.9097, 10.823, 10.8975, 11.0537, 10.7561,
  9.869, 8.9137, 8.4597, 8.5995, 9.0121, 9.5594, 9.9895, 10.1524, 10.0026, 9.631, 9.1129, 8.5947, 8.3508, 8.6511, 9.3499,
  10.1163, 10.6681, 10.7791, 10.5973, 10.4768, 10.5024, 10.6488, 10.3856, 9.5534, 8.6569, 8.2598, 8.4575, 8.9389, 9.548,
  10.0056, 10.1615, 9.9948, 9.6221, 9.1446, 8.7022, 8.523, 9.012, 10.005, 10.8989, 11.1773, 10.9702];
const FALL = [8.9798, 11.2039, 13.5596, 13.6927, 13.6804, 14.175, 14.5525, 14.3443, 13.4184, 12.206, 11.3593, 11.0255,
  10.7884, 10.3594, 9.5294, 8.4231, 7.7059, 7.5827, 7.8008, 8.4454, 9.0449, 9.1364, 9.0639, 8.807, 8.2419, 7.4685, 6.9089,
  6.77, 6.837, 6.9916, 7.1594, 7.3354, 7.5703, 7.9185, 8.361, 8.7379, 8.9303];
// footsteps (0x86A01EF0: at these frames of each walk, with fewer than four gifts)
const STEPS = { 1: [3, 7], 2: [5, 10], 3: [5, 14], 4: [10, 23], 5: [15, 35] };
// a picked-up gift's last frames, shrinking into the sack (0x86A0F278)
const SHRINK = [1, 1, 0.875, 0.75, 0.625, 0.5, 0.375, 0.25, 0.125];
// each player's colours (their doors: blue, green, red, yellow)
export const COLOURS = [0x5f7dff, 0x50d050, 0xff6464, 0xffd23c];

export class Game {
  constructor(scene, assets) {
    this.scene = scene;
    this.assets = assets;
    this.listeners = {};
    const add = (o) => { scene.add(o); return o; };
    // the stage
    for (const name of ["field", "walls"]) add(makeModel(assets[name], STAGE).root);
    this.shadowMat = new THREE.MeshBasicMaterial({ color: 0, map: assets.shadow, transparent: true, opacity: SHADOW_A, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    const shadow = () => {
      const m = add(new THREE.Mesh(new THREE.PlaneGeometry(SHADOW, SHADOW), this.shadowMat));
      m.rotation.x = -Math.PI / 2;
      m.renderOrder = 1;
      return m;
    };
    this.shadow = shadow;
    // the Delibird: each with its sack, shadow, label and FULL
    this.birds = [0, 1, 2, 3].map((z) => {
      const v = { bird: makeModel(assets.delibird, DELIBIRD), sack: makeModel(assets.sack, DELIBIRD), shadow: shadow() };
      add(v.bird.root);
      add(v.sack.root);
      v.label = add(new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, opacity: LABEL_A, depthTest: false })));
      v.label.scale.set(LABEL[0], LABEL[1], 1);
      v.label.renderOrder = 5;
      v.full = add(new THREE.Sprite(new THREE.SpriteMaterial({ map: assets.fullFor[z], transparent: true, depthTest: false })));
      v.full.renderOrder = 6;
      v.full.visible = false;
      v.fullAt = null;
      v.sackFrame = 0;
      return v;
    });
    // the gifts, boxes, Swinub and the gifts flying out of a sack (made as they come)
    this.things = new Map();
    this.spare = {};
    this.crumbs = [];
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
    // (online, with other people: this device's player's sticks count this many frames on)
    this.lead = leadFor(this.control.map((c, z) => c === "remote" && !this.cpus[z]), setup.delay);
    this.world = new R.World(seed, level, this.cpus);
    this.inputs = [[], [], [], []]; // each person's stick: [frame, packed stick, 0]
    this.snaps = [[0, this.world.save()]]; // the world as it was before a frame
    this.simT = -1; // the last frame the world has run
    this.shownT = -1; // and whose sounds have gone
    this.stick = [0, 0]; // this device's player's stick
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
    this.straining = 0;
    this.before = null; // where the Delibird were before the last frame (to draw between)
    this.offsets = [0, 1, 2, 3].map(() => [0, 0]); // a corrected Delibird's offset, easing away
    this.combos = [0, 1, 2, 3].map(() => null); // each one's combo on show: { n, at (s) }
    this.anim = [0, 1, 2, 3].map(() => ({ state: -1, at: 0 })); // each Delibird's clip: since when (s)
    for (const [, v] of this.things) this.drop(v);
    this.things.clear();
    for (const v of this.crumbs) this.drop(v);
    this.crumbs = [];
    const told = setup.told;
    if (told?.pads) told.pads.forEach((list, z) => { if (list && !this.cpus[z]) this.inputs[z] = list.map((e) => [...e]); });
    if (told?.done) this.told("won", told.done);
    for (let z = 0; z < 4; z++) {
      const v = this.birds[z];
      v.label.material.map = this.assets[`label${this.cpus[z] ? 4 : z}`];
      v.label.material.needsUpdate = true;
      v.full.visible = false;
      v.fullAt = null;
      v.sackFrame = 0;
    }
    this.draw(0);
  }
  start() { this.state = "play"; }
  stop() { this.state = "over"; this.strain(0); }
  setControl(z, c) {
    if (c === "cpu" && !this.cpus[z]) return; // (a person who left: their Delibird stands where it was)
    this.control[z] = c;
  }

  get frame() { return Math.floor(this.time * R.FPS + 1e-6); }

  // ---- input ----
  // this device's player: the stick (-64 to 64 each way; up is +y)
  setStick(x, y) {
    const c = (v) => Math.max(-64, Math.min(64, Math.round(v)));
    this.stick = [c(x), c(y)];
  }
  // seat z's stick on frame t: [x, y]
  padAt(z, t) {
    const list = this.inputs[z];
    let i = list.length - 1;
    while (i >= 0 && list[i][0] > t) i--;
    return i < 0 ? [0, 0] : unpack(list[i][1]);
  }

  // the server's word: someone's stick ("pad": { s, f, x }; to this device's
  // own, o: the frame it said), or the end ("won": { f, s: each one's points })
  told(type, m) {
    if (type === "pad") {
      const z = m.s;
      if (!(z >= 0 && z < 4) || this.cpus[z] || !Number.isInteger(m.f) || !validPad(m.x)) return;
      const list = this.inputs[z];
      let k = list.length;
      if (this.control[z] === "local") { // one of this device's own, as the server has it (on another frame)
        const j = list.findIndex((e) => e[3] === m.o && e[1] === m.x);
        if (j >= 0) {
          list[j][0] = m.f;
          this.rewind(Math.min(m.f, m.o));
          return;
        }
      }
      while (k > 0 && list[k - 1][0] > m.f) k--;
      list.splice(k, 0, [m.f, m.x, 0]);
      this.rewind(m.f);
      return;
    }
    if (type === "won") {
      if (!Number.isInteger(m.f) || !Array.isArray(m.s)) return;
      this.result = { f: m.f, s: [0, 1, 2, 3].map((z) => (Number.isInteger(m.s[z]) ? m.s[z] : 0)) };
    }
  }
  // the world again from before frame f (a stick it ran without); where the
  // Delibird were is kept, to ease them to where they turn out to be
  rewind(f) {
    if (f > this.simT) return;
    if (!this.was) this.was = { t: this.simT, at: this.positions() };
    while (this.snaps.length > 1 && this.snaps[this.snaps.length - 1][0] > f) this.snaps.pop();
    const [at, state] = this.snaps[this.snaps.length - 1];
    this.world.load(state);
    this.simT = at - 1;
  }
  positions() { return this.world.p.map((p) => [p.x, p.zz]); }
  // run the world up to frame t
  runTo(t) {
    const w = this.world;
    while (this.simT < t) {
      const f = this.simT + 1;
      if (w.phase === "play" && f % SNAP === 0 && f > this.snaps[this.snaps.length - 1][0]) {
        this.snaps.push([f, w.save()]);
        while (this.snaps.length > 2 && this.snaps[1][0] < f - KEEP) this.snaps.shift();
      }
      if (f === t) this.before = this.positions();
      w.step(f, [0, 1, 2, 3].map((z) => (this.cpus[z] ? null : this.padAt(z, f))));
      this.simT = f;
      if (f > this.shownT) { this.sounds(f); this.shownT = f; }
      w.events = [];
      if (this.was && f === this.was.t) { // (run again to where it was: ease them from there)
        w.p.forEach((p, z) => {
          this.offsets[z][0] += this.was.at[z][0] - p.x;
          this.offsets[z][1] += this.was.at[z][1] - p.zz;
        });
        this.was = null;
      }
    }
  }
  // frame f's sounds (once each), the last seconds and the tune's hurry
  sounds(f) {
    const w = this.world;
    for (const e of w.events) {
      const [what, z] = e;
      const pan = z === undefined ? 64 : this.pan(w.p[z].x);
      if (what === "end") this.emit("over");
      else if (what === "ring" || what === "piano" || what === "tick") this.emit("sound", what);
      else if (what === "sack") this.emit("sack", z, e[2], pan);
      else if (what === "hand") this.emit("hand", z, pan);
      else if (what === "in") this.emit("in", z, e[2]);
      else if (what === "combo") { this.combos[z] = { n: e[2], at: this.time }; this.emit("combo", z, e[2]); }
      else if (what === "knocked") this.emit("knocked", z, e[2], pan);
      else if (what === "spun") this.emit("spun", z, pan);
      else if (what === "counted") this.emit("counted", z);
    }
    if (w.phase === "play" && f <= R.TIME) {
      // the clock's last three seconds (0xCF00), and its 0 (0xCF06: the time's up)
      const before = R.TIME - f;
      if (before === 3 * R.FPS || before === 2 * R.FPS || before === R.FPS) this.emit("sound", "lastCount");
      if (before === 0) this.emit("sound", "lastGo");
    }
    // the tune's hurry from the last 30 s (0x80028108(8): a beat a minute faster every 5 frames, 90 in all)
    if (w.phase === "play" && f >= R.TIME - R.HURRY) {
      const n = Math.min(90, Math.floor((f - (R.TIME - R.HURRY)) / 5) + 1);
      if (n !== this.tempoN) { this.tempoN = n; this.emit("tempo", n); }
    }
  }
  // a sound's pan: where it is across the screen (0x86A05DCC: x / 180 x 64)
  pan(x) { return Math.round(64 + Math.max(-63, Math.min(63, (x * 64) / 180))); }
  // walking with a heavy sack: the strain, for this device's player's (0x8F10, 0x8F11: on while asked for)
  strain(n) {
    if (n === this.straining) return;
    if (this.straining) this.emit("loop", "strain" + this.straining, false);
    this.straining = n;
    if (n) this.emit("loop", "strain" + n, true);
  }

  // ---- the round, frame by frame ----
  update(dt) {
    this.clockS += dt;
    if (this.state === "play") {
      this.time += dt;
      const now = this.frame;
      for (let t = this.lastFrame + 1; t <= now; t++) { this.step(t); this.lastFrame = t; }
      this.runTo(this.lastFrame); // (after a stick that came in late)
      const done = this.doneFrame();
      if (done !== null && this.frame >= done) { this.stop(); this.emit("finish"); }
    } else if (this.state === "over") this.time += dt;
    const ended = this.world.end !== null || (this.result && this.lastFrame >= this.result.f);
    if (ended && this.endAt === null) this.ending();
    this.animate(dt);
  }
  // the frame the play ended on: the server's, else this device's world's
  endFrame() { return this.result ? this.result.f : this.world.end; }
  // and the round's last (the points counted up, the winners cheered)
  doneFrame() {
    const end = this.endFrame();
    return end === null ? null : end + R.tallyFrames(this.points()) + R.SHOW;
  }

  // what happens on frame t (from GO): this device's player's stick is kept
  // (and sent) for frame t + lead, and the world runs
  step(t) {
    const me = this.me, f = t + this.lead;
    if (this.control[me] === "local" && !this.cpus[me] && this.world.phase === "play") {
      const x = pack(...this.stick);
      if (x !== this.lastPad) {
        this.inputs[me].push([f, x, 0, f]); // ([frame, stick, 0, the frame it was sent for])
        this.lastPad = x;
        this.emit("send", { s: me, f, x, a: 0 });
      }
    }
    this.runTo(t);
  }
  over() { return this.state === "over"; }

  // each one's points: the server's once it's said, else the world's
  points() { return this.result ? this.result.s : this.world.scores; }
  // the places (1-4) by points
  places() { const s = this.points(); return s.map((x) => 1 + s.filter((y) => y > x).length); }
  // the gifts each one's got through its door
  delivered() { return this.world.p.map((p) => p.got.length); }
  // the seconds on the clock (the game's: rounded up, 60 at GO: 0x86A095A0)
  secondsLeft() { return Math.max(0, Math.ceil(this.world.clock / R.FPS)); }
  // the points as they count up at the end (the world's tally), and whether they're all in
  tally() {
    const w = this.world;
    return { shown: w.p.map((p) => (w.phase === "play" ? 0 : p.shown)), counted: w.phase === "show" || !!w.counted };
  }

  // ---- the end: the points count up, then the winners cheer and the others sulk ----
  ending() {
    this.endAt = this.time;
    const p = this.places(), s = this.points();
    this.winners = p.map((x) => x === 1 && !s.every((y) => y === s[0])); // (all level: nobody)
    this.emit("end", this.winners);
    this.strain(0);
  }

  // ---- every rendered frame ----
  animate(dt) {
    const k = Math.pow(SMOOTH, dt * 60);
    for (const o of this.offsets) { o[0] *= k; o[1] *= k; }
    const between = this.state === "play" ? Math.max(0, Math.min(1, this.time * R.FPS - this.lastFrame)) : 1;
    this.draw(between, dt);
  }

  draw(between, dt = 0) {
    const w = this.world, before = this.before, now = this.state === "play" || this.state === "over" ? this.time : this.clockS;
    w.p.forEach((p, z) => {
      const v = this.birds[z], was = before?.[z] || [p.x, p.zz], o = this.offsets[z];
      const x = was[0] + (p.x - was[0]) * between + o[0], zz = was[1] + (p.zz - was[1]) * between + o[1];
      // its clip: its state's, from when it went into it (1.5 frames a frame)
      const a = this.anim[z];
      if (a.state !== p.state) { a.state = p.state; a.at = now; a.last = -1; }
      const n = v.bird.length(p.state);
      let f = (now - a.at) * R.FPS * CLIP_RATE;
      if (p.state === R.ST.cheer) f = f < n ? f : 9 + ((f - 9) % (n - 9)); // (round again from frame 9)
      else if (p.state === R.ST.sulk) f = f < n ? f : 42 + ((f - 42) % (n - 42)); // (from 42)
      else f %= n;
      if (this.state === "ready" || this.state === "idle") f = (this.clockS * R.FPS * CLIP_RATE) % v.bird.length(0);
      v.bird.root.position.set(x, 0, zz);
      v.bird.root.rotation.y = ANG(p.yaw);
      v.bird.pose(this.state === "ready" || this.state === "idle" ? 0 : p.state, f);
      this.footsteps(z, p, f, dt);
      // its sack: filling as gifts go in (clip 11 to how full it is), its own clips knocked over and at the end
      const sackClip = p.state === R.ST.knocked ? 12 : p.state === R.ST.cheer ? 13 : p.state === R.ST.sulk ? 14 : 11;
      let sf = f;
      if (sackClip === 11) {
        const to = SACK_AT[p.load] - 1;
        v.sackFrame = v.sackFrame < to ? Math.min(to, v.sackFrame + dt * R.FPS * CLIP_RATE)
          : Math.max(to, v.sackFrame - dt * R.FPS * 1.5714263916015625);
        sf = v.sackFrame;
      }
      v.sack.root.position.set(x, 0, zz);
      v.sack.root.rotation.y = ANG(p.sackYaw);
      v.sack.pose(sackClip, sf);
      v.shadow.position.set(x, 1, zz);
      // its label, riding with it as it hops (0x86A01EF0)
      let y = LABEL_Y;
      if (p.state === R.ST.cheer) y = HOP[Math.min(HOP.length - 1, Math.floor(f))] * DELIBIRD * 100 - 16.154227;
      if (p.state === R.ST.knocked) y = FALL[Math.min(FALL.length - 1, Math.floor(f))] * DELIBIRD * 100 - 16.154227;
      v.label.position.set(x, y + LABEL[1] / 2, zz);
      v.label.visible = w.phase !== "show";
      // FULL over a full sack, growing (0x86A0BA80, 0x86A0B98C)
      if (p.load === R.SACK_MAX) {
        if (v.fullAt === null) v.fullAt = now;
        const s = Math.min(1, (now - v.fullAt) * R.FPS * 0.05);
        v.full.visible = s > 0;
        v.full.scale.set(FULL[0] * s, FULL[1] * s, 1);
        v.full.position.set(x, FULL_Y, zz);
      } else { v.full.visible = false; v.fullAt = null; }
    });
    // the gifts on the front belt (and one being picked up, going into the sack)
    const seen = new Set();
    for (const g of w.gifts) {
      const v = this.thing(`g${g.id}`, `gift${g.kind}`, GIFT, seen);
      let x = g.x, y = R.BELT_Y, zz = g.z, s = GIFT;
      if (g.picked) {
        const p = w.p[g.by], k = Math.max(0, Math.min(1, (g.timer - 9) / 9));
        const i = ((p.sackYaw + 0x8000) & 0xffff) / 65536 * Math.PI * 2, back = 30;
        const sx = p.x + Math.sin(i) * back, sz = p.zz + Math.cos(i) * back;
        x = x + (sx - x) * k;
        zz = zz + (sz - zz) * k;
        y = y + (35 - y) * k;
        s = g.timer < 9 ? GIFT : g.timer < 18 ? SHRINK[g.timer - 9] * GIFT : 0;
      }
      v.model.root.visible = s > 0;
      v.model.root.position.set(x, y, zz);
      v.model.root.scale.setScalar(s / GIFT);
      if (g.kind === 0) this.sparkle(v.model, now);
    }
    // the gifts going to their doors, in boxes
    for (const b of w.boxes) {
      const v = this.thing(`b${b.id}`, b.big ? "box_big" : "box", BOX, seen);
      v.model.root.position.set(b.x, b.y, b.z);
    }
    // the Swinub, running across (turned to the camera, with a shadow)
    for (const s of w.swinub) {
      const v = this.thing(`s${s.id}`, s.right ? "swinub_left" : "swinub_right", SWINUB, seen, true);
      const x = s.x + s.vx * (between - 1);
      v.model.root.position.set(x, 0, s.z + 5);
      v.model.pose(0, (now * R.FPS * CLIP_RATE) % v.model.length(0));
      v.shadow.position.set(x, 1, s.z);
      v.shadow.scale.set(1, 1.5 / 2.5, 1);
    }
    for (const [id, v] of this.things) if (!seen.has(id)) { this.drop(v); this.things.delete(id); }
    // the gifts flying out of a knocked-over sack, in boxes, fading
    w.crumbs.forEach((c, i) => {
      let v = this.crumbs[i];
      if (!v || v.kind !== (c.kind === 1 || c.kind === 2 ? "box_big" : "box")) {
        if (v) this.drop(v);
        v = this.crumbs[i] = this.make(c.kind === 1 || c.kind === 2 ? "box_big" : "box", BOX);
      }
      v.model.root.position.set(c.x, c.y, c.z);
      v.model.fade(Math.max(0, c.alpha) / 255);
    });
    while (this.crumbs.length > w.crumbs.length) this.drop(this.crumbs.pop());
  }
  // the ring's sparkle (its texture's 13 frames, then a rest: 25 in all)
  sparkle(model, now) {
    const f = Math.floor(now * R.FPS) % 25, map = this.assets.sparkle[f < 13 ? f : 0];
    for (const m of model.mats) if (m.map && m.map !== map) { m.map = map; m.needsUpdate = true; }
  }
  // a footstep at its walk's frames, with fewer than four gifts; this device's
  // player's strain with four or five (0x86A01EF0)
  footsteps(z, p, f, dt) {
    const a = this.anim[z], walking = this.state === "play" && p.state >= 1 && p.state <= 5;
    const k = Math.floor(f);
    if (walking && p.load < 4 && a.last >= 0 && k !== a.last) {
      for (const s of STEPS[p.state]) if ((a.last < s && s <= k) || (k < a.last && (s > a.last || s <= k))) this.emit("step", z, this.pan(p.x));
    }
    a.last = walking ? k : -1;
    if (z === this.me && this.control[z] === "local") this.strain(walking && p.load >= 4 ? p.load : 0);
  }
  // a model kept by its id (one of each kind is made again, as needed)
  thing(id, kind, scale, seen, withShadow = false) {
    seen.add(id);
    let v = this.things.get(id);
    if (!v) {
      v = this.make(kind, scale);
      if (withShadow) { v.shadow = this.shadow(); }
      this.things.set(id, v);
    }
    return v;
  }
  make(kind, scale) {
    const list = (this.spare[kind] ||= []);
    let v = list.pop();
    if (!v) v = { kind, model: makeModel(this.assets[kind], scale) };
    v.model.root.visible = true;
    v.model.root.scale.setScalar(1);
    v.model.fade(1);
    this.scene.add(v.model.root);
    return v;
  }
  drop(v) {
    this.scene.remove(v.model.root);
    if (v.shadow) { this.scene.remove(v.shadow); v.shadow = null; }
    (this.spare[v.kind] ||= []).push(v);
  }

  // the camera's place: the game's, the gifts and the Swinub turned to it (flat
  // pictures on joints flagged to be drawn at the camera's turn: 0x8003B858)
  camera(cam) {
    cam.position.set(...CAMERA.eye);
    cam.lookAt(...CAMERA.at);
    for (const [, v] of this.things) if (FACING.test(v.kind)) v.model.root.quaternion.copy(cam.quaternion);
  }

  // ---- the end ----
  results() {
    const places = this.places(), s = this.points();
    return [0, 1, 2, 3].map((i) => ({ i, score: this.scores ? this.scores[i] : s[i], place: places[i] }))
      .sort((a, b) => a.place - b.place || a.i - b.i);
  }
  celebrate() { return this.results(); }
}

export function pack(x, y) { return (x + 64) | ((y + 64) << 8); }
export function unpack(v) { return [(v & 0xff) - 64, ((v >> 8) & 0xff) - 64]; }
function validPad(v) { return Number.isInteger(v) && v >= 0 && v <= 0x8080 && (v & 0xff) <= 128; }
