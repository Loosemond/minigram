// A Delibird's Delivery round: the world (rules.js) on the round's clock, and
// the scene it drives. The stage is objects 148 (the field, the back belt, the
// doors) and 147 (the front belt, the walls), drawn a ninth of their size at
// the middle of the game's units; the camera looks at it as the game's does
// (0x86A00020): from above the front, towards (0, 130, 50), fov 24.7. The
// world runs 30 frames a second; the scene is drawn between its last two
// frames (a frame behind, so whatever moves moves smoothly however often it's
// drawn): the Delibird, their turns, the gifts, boxes and Swinub, the clips,
// a gift's jump into the sack, the belts.
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
import { faceOnRender } from "../facing.js";
import { makeBadge } from "../badge.js";
import { scrollMaps } from "../n64fx.js";

// the camera (0x86A00020: 550 back from 400 above where it looks, 0.36 rad up; fov 24.69)
const AT = [0, 130, 50], LOOK = 0.3599900007247925;
export const CAMERA = { eye: [0, 550 * Math.sin(LOOK) + 400 + AT[1], 550 * Math.cos(LOOK) + AT[2]], at: AT, fov: 24.689977645874023 };
const ANG = (a) => (a / 65536) * Math.PI * 2;
const s16 = (v) => (((v & 0xffff) ^ 0x8000) - 0x8000);
const SNAP = 6; // frames between the world's saved states (for running it again)
const KEEP = 20 * R.FPS; // and how far back they go
const SMOOTH = 0.88; // a corrected Delibird's ease to where it is, a 60th of a second
const STAGE = 1 / 9; // the stage's scale, and the rest (0x86A004B4)
const DELIBIRD = 0.07923809438943863, GIFT = 0.2222222238779068, BOX = 1 / 9, SWINUB = 0.6;
const SHADOW = 16 * 2.5, SHADOW_A = 0x80 / 255; // the shadows: image bank 307's dot at 2.5, black at 128 (0x86A0B8A4)
// the badge over each (module #64's labels: image bank 434, 1P-4P or a CPU's COM in
// its colour; the object 0.9, 55 up, its env alpha 0xB4: 0x86A004B4, 0x87F02878)
const LABEL_Y = 55, LABEL_SCALE = 0.9, LABEL_A = 0xb4 / 255;
const FULL_Y = 82, FULL = [56, 17], FULL_GROW = 0.05; // FULL over a full sack, growing 0.05 a frame (0x86A0B98C)
// The clips play a frame a frame: the draw (0x86A01EF0) asks for its state's
// clip every frame with 0x8003F2F0, which sets the speed to 1 even when the
// clip's on already (0x8003EBDC), over the 1.5 the set-up gave them. Each
// starts at 0 as it's asked for (the frame its state does); the cheer goes
// round again from frame 9, the sulk from 42, the pick-up, the hand-over and
// a knock-down from 0 (0x8003ED14, 0x8003EC64), the walks and standing by
// themselves (their flag 1: 0x8003E7BC). The Delibird stand at a random
// frame of their clip before the play (0x86A00EC8: % 24).
const RESTART = { [R.ST.cheer]: 9, [R.ST.sulk]: 42 };
// the sack's (11): how far it plays by how full it is (0x86A01EF0; it rocks
// between that frame and the one before, which the clip holds the same), and
// back at 1.5714 a frame through a hand-over (0x86A02974: 0xFFFE6DB7), down a
// gift's worth past its fill's at once; 12 knocked over, 13 and 14 at the end
const SACK_AT = [1, 12, 23, 34, 45, 56];
const SACK_FILL = 11, SACK_HAND = -1.5714263916015625;
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
// A picked-up gift (0x86A02A9C): on the belt for its first 9 frames, then for 9
// on Delibird's hand, lower by its shrink x 100 / 9 and at its shrink x 2 / 9
// (0x86A0F278); then where it was, at the last, till it's gone. The hand is
// the second point Delibird's draw records (object +0xBC, 0x8003C3B8): geo
// 0x24's label 1, on bone 11, as of the frame before
const SHRINK = [1, 1, 0.875, 0.75, 0.625, 0.5, 0.375, 0.25, 0.125];
const HAND = "bone_11";
// each player's colours (their doors: blue, green, red, yellow)
export const COLOURS = [0x5f7dff, 0x50d050, 0xff6464, 0xffd23c];
const lerp = (a, b, k) => a + (b - a) * k;
// a table by a clip's frame, between its frames (past its last, towards the one it goes back to)
const at = (table, f, back = table.length - 1) => {
  const i = Math.max(0, Math.floor(f)), k = f - i, n = table.length - 1;
  return lerp(table[Math.min(i, n)], table[i + 1 > n ? back : i + 1], k);
};

export class Game {
  constructor(scene, assets) {
    this.scene = scene;
    this.assets = assets;
    this.listeners = {};
    const add = (o) => { scene.add(o); return o; };
    faceOnRender(scene); // (the gifts and the Swinub: their joints drawn facing the camera)
    // the stage, its belts' textures moving on a texel a frame (147 the front, 148 the back: 0x81000178)
    this.belts = ["field", "walls"].map((name) => scrollMaps(assets.fx, add(makeModel(assets[name], STAGE).root), name));
    this.shadowMat = new THREE.MeshBasicMaterial({ color: 0, map: assets.shadow, transparent: true, opacity: SHADOW_A, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    const shadow = () => {
      const m = add(new THREE.Mesh(new THREE.PlaneGeometry(SHADOW, SHADOW), this.shadowMat));
      m.rotation.x = -Math.PI / 2;
      m.renderOrder = 1;
      return m;
    };
    this.shadow = shadow;
    // the Delibird: each with its sack, shadow, badge and FULL
    this.birds = [0, 1, 2, 3].map((z) => {
      const v = { bird: makeModel(assets.delibird, DELIBIRD), sack: makeModel(assets.sack, DELIBIRD), shadow: shadow() };
      add(v.bird.root);
      add(v.sack.root);
      v.hand = v.bird.model.getObjectByName(HAND);
      v.label = add(makeBadge(assets.badges, { scale: LABEL_SCALE, opacity: LABEL_A }));
      // (FULL: layer 6, translucent, depth tested: 0x86A0D52C)
      v.full = add(new THREE.Sprite(new THREE.SpriteMaterial({ map: assets.fullFor[z], transparent: true, depthWrite: false })));
      v.full.renderOrder = 6;
      v.full.visible = false;
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
    this.strains = [null, null, null, null]; // each one's strain on (0x8F10, 0x8F11)
    this.before = null; // the world as it was before the last frame (to draw between)
    this.offsets = [0, 1, 2, 3].map(() => [0, 0]); // a corrected Delibird's offset, easing away
    this.combos = [0, 1, 2, 3].map(() => null); // each one's combo on show: { n, at (s) }
    for (const [, v] of this.things) this.drop(v);
    this.things.clear();
    for (const v of this.crumbs) this.drop(v);
    this.crumbs = [];
    const told = setup.told;
    if (told?.pads) told.pads.forEach((list, z) => { if (list && !this.cpus[z]) this.inputs[z] = list.map((e) => [...e]); });
    if (told?.done) this.told("won", told.done);
    // (the standing clip's frame each starts at: a draw of its own, the round's look only)
    let r = (seed >>> 0) || 1;
    for (let z = 0; z < 4; z++) {
      const v = this.birds[z];
      v.label.seat(z, this.cpus[z]);
      v.full.visible = false;
      v.fullAt = null;
      v.clip = { state: R.ST.stand, since: 0, prev: null };
      v.sk = { frame: 0, was: 0 }; // its sack's clip 11, as the game plays it (sackStep)
      r = Math.imul(r ^ (r >>> 15), 0x2c1b3c6d) >>> 0;
      v.phase = (r >>> 8) % 24;
    }
    this.draw(1);
  }
  start() { this.state = "play"; }
  stop() { this.state = "over"; this.quiet(); }
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
  // what's drawn between frames: the Delibird and their turns, the gifts, boxes
  snapshot() {
    const w = this.world;
    return {
      p: w.p.map((p) => [p.x, p.zz, p.yaw, p.sackYaw]),
      gifts: new Map(w.gifts.map((g) => [g.id, g.z])),
      boxes: new Map(w.boxes.map((b) => [b.id, [b.x, b.y, b.z]])),
    };
  }
  // run the world up to frame t
  runTo(t) {
    const w = this.world;
    while (this.simT < t) {
      const f = this.simT + 1;
      if (w.phase === "play" && f % SNAP === 0 && f > this.snaps[this.snaps.length - 1][0]) {
        this.snaps.push([f, w.save()]);
        while (this.snaps.length > 2 && this.snaps[1][0] < f - KEEP) this.snaps.shift();
      }
      if (f === t) this.before = this.snapshot();
      w.step(f, [0, 1, 2, 3].map((z) => (this.cpus[z] ? null : this.padAt(z, f))));
      this.simT = f;
      if (f > this.shownT) { this.sounds(f); this.frameFx(f); this.shownT = f; }
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
      const x = z === undefined ? 0 : this.pan(w.p[z].x);
      if (what === "end") this.emit("over");
      else if (what === "ring" || what === "piano" || what === "tick") this.emit("sound", what);
      else if (what === "sack") this.emit("sack", z, e[2], x);
      else if (what === "hand") this.emit("hand", z, x);
      else if (what === "in") this.emit("in", z, e[2]);
      else if (what === "combo") { this.combos[z] = { n: e[2], at: this.time }; this.emit("combo", z, e[2], x); }
      else if (what === "knocked") this.emit("knocked", z, e[2], x);
      else if (what === "spun") this.emit("spun", z, x);
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
  // where a Delibird's sounds are across the screen: the game's byte for its x
  // (0x86A05DCC: x x 64 / 180, W + 0xE48), 64 more than it the sound's pan
  pan(x) { return Math.trunc((x * 64) / 180); }

  // ---- what each frame does to the scene (once, as the world gets to it) ----
  // the draw's (0x86A01EF0): each one's sack clip, its footsteps and its strain
  frameFx(f) {
    const w = this.world;
    w.p.forEach((p, z) => {
      const v = this.birds[z];
      const c = v.clip;
      if (c.state !== p.state || c.since !== p.since) v.clip = { state: p.state, since: p.since, prev: { ...c, prev: null } };
      this.sackStep(v, p);
      // a footstep at its walk's frames, with fewer than four gifts
      const walking = p.state >= R.ST.walk1 && p.state <= R.ST.walk5;
      if (walking && p.load < 4 && STEPS[p.state].includes((f - p.since) % v.bird.length(p.state))) this.emit("step", z, this.pan(p.x));
      // with four or five, the strain (0x8F10, 0x8F11) every frame it walks or picks a gift up: each player's own
      this.strain(z, (walking || p.state === R.ST.pick) && p.load >= 4 ? "strain" + p.load : null, p.x);
      // FULL from the frame the fifth's in (0x86A0BA80)
      if (p.load === R.SACK_MAX) v.fullAt ??= f;
      else v.fullAt = null;
    });
  }
  // a sack's clip 11 a frame on (states 9, and 0-5 and 8; the rest play their
  // own clips: draw()): the draw's turn (0x86A026F4, 0x86A027C0, 0x86A028D0),
  // then the clip's step, held at its ends (its flag 2: 0x8003E7BC)
  sackStep(v, p) {
    const sk = v.sk, own = p.state === R.ST.knocked || p.state === R.ST.cheer || p.state === R.ST.sulk;
    sk.was = sk.frame;
    if (own) { sk.frame = -1; return; } // (another clip on: back to 11 from its start)
    const target = SACK_AT[p.load], speed = p.state === R.ST.hand ? SACK_HAND : 1;
    let fr = sk.frame;
    if (p.state === R.ST.hand) { if (Math.floor(fr + speed) < target - SACK_FILL) fr = target - 1 - speed; }
    else if (target < Math.floor(fr + speed)) fr = target - 1 - speed;
    fr += speed;
    const i = Math.floor(fr), n = v.sack.length(11);
    if (i >= n) fr += n - 1 - i;
    else if (i < 0) fr -= i;
    sk.frame = fr;
    if (sk.was < 0) sk.was = fr;
  }
  // seat z's strain: name (strain4, strain5) or null; at its Delibird's x
  strain(z, name, x) {
    const was = this.strains[z];
    if (was && was !== name) this.emit("strain", z, was, false);
    this.strains[z] = name;
    if (name) this.emit("strain", z, name, true, this.pan(x));
  }
  quiet() { for (let z = 0; z < 4; z++) this.strain(z, null); }

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
  // and the round's last: the points counted up, the winners cheering, as
  // the results come on (R.SHOW: none after)
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
  // the seconds on the clock (the game's: rounded up, 60 at GO, 0 on at the end: 0x86A095A0)
  secondsLeft() { return Math.max(0, Math.ceil(this.world.clock / R.FPS)); }
  // the points as they count up at the end (the world's tally), whether they're
  // all in, and the frames since it started (a float: its winners' colours)
  tally() {
    const w = this.world;
    return { shown: w.p.map((p) => (w.phase === "play" ? 0 : p.shown)), counted: w.phase === "show" || !!w.counted,
      frames: w.end === null ? 0 : Math.max(0, this.tau() - w.end) };
  }

  // ---- the end: the points count up, then the winners cheer and the others sulk ----
  ending() {
    this.endAt = this.time;
    const p = this.places(), s = this.points();
    this.winners = p.map((x) => x === 1 && !s.every((y) => y === s[0])); // (all level: nobody)
    this.emit("end", this.winners);
    this.quiet();
  }

  // ---- every rendered frame ----
  animate(dt) {
    const k = Math.pow(SMOOTH, dt * 60);
    for (const o of this.offsets) { o[0] *= k; o[1] *= k; }
    this.draw(this.state === "play" || this.state === "over" ? Math.max(0, Math.min(1, this.time * R.FPS - this.lastFrame)) : 1);
  }
  // the moment drawn, in the world's frames: a frame behind its last, and on
  // after the play (the cheering goes on)
  tau() { return this.state === "play" || this.state === "over" ? this.time * R.FPS - 1 : this.lastFrame; }

  // between: how far from the frame before the world's last to its last (0-1)
  draw(between) {
    const w = this.world, before = this.before, tau = this.tau(), idle = this.state === "ready" || this.state === "idle";
    w.p.forEach((p, z) => {
      const v = this.birds[z], was = before?.p[z] || [p.x, p.zz, p.yaw, p.sackYaw], o = this.offsets[z];
      const x = lerp(was[0], p.x, between) + o[0], zz = lerp(was[1], p.zz, between) + o[1];
      // its clip: its state's, from the frame it went into it (the one before it until then)
      let c = v.clip;
      if (c.state !== p.state || c.since !== p.since) c = v.clip = { state: p.state, since: p.since, prev: { ...c, prev: null } };
      if (tau < c.since && c.prev) c = c.prev;
      const n = v.bird.length(c.state);
      let f = Math.max(0, tau - c.since);
      if (idle || (c.state === R.ST.stand && c.since === 0 && !c.prev)) f = (this.clockS * R.FPS + v.phase) % n; // (standing since the start)
      else if (c.state in RESTART) f = f < n ? f : RESTART[c.state] + ((f - RESTART[c.state]) % (n - RESTART[c.state]));
      else f %= n;
      v.bird.root.position.set(x, 0, zz);
      v.bird.root.rotation.y = ANG(lerp(was[2], was[2] + s16(p.yaw - was[2]), between));
      v.pose = [c.state, f];
      v.bird.pose(c.state, f);
      // its sack: clip 11 by its own clock (sackStep), its own clips knocked over and at the end
      let sc = 11, sf;
      if (c.state === R.ST.knocked) { sc = 12; sf = f; }
      else if (c.state === R.ST.cheer || c.state === R.ST.sulk) {
        sc = c.state === R.ST.cheer ? 13 : 14;
        sf = Math.max(0, tau - c.since) % v.sack.length(sc); // (round from 0: its flag 1)
      } else if (idle) sf = 0;
      else sf = Math.abs(v.sk.frame - v.sk.was) > 2 ? v.sk.frame : lerp(v.sk.was, v.sk.frame, between);
      v.sack.root.position.set(x, 0, zz);
      v.sack.root.rotation.y = ANG(lerp(was[3], was[3] + s16(p.sackYaw - was[3]), between));
      v.sack.pose(sc, Math.max(0, sf));
      v.shadow.position.set(x, 1, zz);
      // its badge, riding with it as it hops (0x86A01EF0), on through the tally and the cheer
      let y = LABEL_Y;
      if (c.state === R.ST.cheer) y = at(HOP, f, RESTART[R.ST.cheer]) * DELIBIRD * 100 - 16.154227;
      if (c.state === R.ST.knocked) y = at(FALL, f) * DELIBIRD * 100 - 16.154227;
      v.label.position.set(x, y, zz);
      // FULL over a full sack, growing (0x86A0BA80, 0x86A0B98C)
      const s = v.fullAt === null || idle ? 0 : Math.min(1, Math.max(0, tau - v.fullAt + 1) * FULL_GROW);
      v.full.visible = s > 0;
      v.full.scale.set(FULL[0] * s, FULL[1] * s, 1);
      v.full.position.set(x, FULL_Y, zz);
    });
    // the gifts on the front belt (and one being picked up, jumping to Delibird's hand)
    const seen = new Set();
    for (const g of w.gifts) {
      const v = this.thing(`g${g.id}`, `gift${g.kind}`, GIFT, seen);
      const z0 = before?.gifts.get(g.id), zBelt = z0 === undefined ? g.z : lerp(z0, g.z, between);
      let x = g.x, y = R.BELT_Y, zz = zBelt, s = GIFT;
      if (g.picked) [x, y, zz, s] = this.jump(g, zBelt, between);
      v.model.root.position.set(x, y, zz);
      v.model.root.scale.setScalar(s / GIFT);
      if (g.kind === 0) this.sparkle(v.model, idle ? this.clockS * R.FPS : tau);
    }
    // the gifts going to their doors, in boxes
    for (const b of w.boxes) {
      const v = this.thing(`b${b.id}`, b.big ? "box_big" : "box", BOX, seen), b0 = before?.boxes.get(b.id) || [b.x, b.y, b.z];
      v.model.root.position.set(lerp(b0[0], b.x, between), lerp(b0[1], b.y, between), lerp(b0[2], b.z, between));
    }
    // the Swinub, running across (turned to the camera, with a shadow), each
    // its clip from the frame it came in (0x86A04BB4): the frames it's run
    for (const s of w.swinub) {
      const v = this.thing(`s${s.id}`, s.right ? "swinub_left" : "swinub_right", SWINUB, seen, true);
      const x = s.x + s.vx * (between - 1), ran = Math.round((s.x - (s.right ? R.SWINUB_X : -R.SWINUB_X)) / s.vx);
      v.model.root.position.set(x, 0, s.z + 5);
      v.model.pose(0, Math.max(0, ran - 2 + between) % v.model.length(0));
      v.shadow.position.set(x, 1, s.z);
      v.shadow.scale.set(1, 1.5 / 2.5, 1);
    }
    for (const [id, v] of this.things) if (!seen.has(id)) { this.drop(v); this.things.delete(id); }
    // the gifts flying out of a knocked-over sack, in boxes, fading (each frame:
    // on by its speed, which falls 1, and 7 less seen: 0x86A03D0C; a new one from where it is)
    w.crumbs.forEach((c, i) => {
      let v = this.crumbs[i];
      if (!v || v.kind !== (c.kind === 1 || c.kind === 2 ? "box_big" : "box")) {
        if (v) this.drop(v);
        v = this.crumbs[i] = this.make(c.kind === 1 || c.kind === 2 ? "box_big" : "box", BOX);
      }
      const back = c.alpha < 255 ? 1 - between : 0;
      v.model.root.position.set(c.x - c.vx * back, c.y - (c.vy + 1) * back, c.z - c.vz * back);
      v.model.fade(Math.max(0, c.alpha + 7 * back) / 255);
    });
    while (this.crumbs.length > w.crumbs.length) this.drop(this.crumbs.pop());
    // the belts, a texel a frame (all the time: their callback's, as each draw)
    for (const b of this.belts) b.frame(this.clockS * R.FPS);
  }
  // a picked-up gift, drawn between its frames: [x, y, z, scale]
  jump(g, zBelt, between) {
    const v = this.birds[g.by], k = g.timer - 2 + between, k0 = Math.floor(k);
    const place = (n) => {
      if (n <= 8) return [g.x, R.BELT_Y, zBelt, GIFT];
      const m = Math.min(17, n), shrink = SHRINK[m - 9], h = this.handAt(v, m - 1);
      return [h.x, h.y - (shrink * 100) / 9, h.z, shrink * GIFT];
    };
    const a = place(k0), b = place(k0 + 1), t = k - k0;
    if (v.pose) v.bird.pose(...v.pose); // (back to its own frame)
    return a.map((q, i) => lerp(q, b[i], t));
  }
  // where Delibird's hand is at frame f of its pick-up
  handAt(v, f) {
    v.bird.pose(R.ST.pick, f);
    v.bird.root.updateMatrixWorld(true);
    return v.hand.getWorldPosition(new THREE.Vector3());
  }
  // the ring's sparkle (its texture's 13 frames, then a rest: 25 in all)
  sparkle(model, t) {
    const f = Math.floor(Math.max(0, t)) % 25, map = this.assets.sparkle[f < 13 ? f : 0];
    for (const m of model.mats) if (m.map && m.map !== map) { m.map = map; m.needsUpdate = true; }
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

  // the camera's place: the game's (the gifts and the Swinub turn to it as
  // they're drawn: their joints are flagged to be, src/facing.js)
  camera(cam) {
    cam.position.set(...CAMERA.eye);
    cam.lookAt(...CAMERA.at);
  }

  // ---- the end ----
  results() {
    const places = this.places(), s = this.points();
    return [0, 1, 2, 3].map((i) => ({ i, score: this.scores ? this.scores[i] : s[i], place: places[i] }))
      .sort((a, b) => a.place - b.place || a.i - b.i);
  }
  celebrate() { return this.results(); }
}

// The scene's lights (layout 0x86A0F184): 0x646464 all round, and two the
// game turns by the camera each frame (geo 0x14 with 0x86A000DC and
// 0x86A00144): from the eye's pitch over where it looks and its yaw
// (0x80037200), white at pitch + 0x2000, yaw - 0x2000, and 0x808080 at
// -0x2000 - pitch, yaw + 0x6000; a light node's way (0x8003AE84) is (sin yaw
// cos pitch, sin pitch, cos yaw cos pitch), towards it. With this camera, the
// white one's above and the grey one below.
export function lights() {
  const [ex, ey, ez] = CAMERA.eye, [ax, ay, az] = CAMERA.at, dx = ex - ax, dy = ey - ay, dz = ez - az;
  const pitch = R.angle(Math.sqrt(dx * dx + dz * dz), dy), yaw = R.angle(dz, dx);
  const way = (p, y) => {
    const P = (p & 0xffff) >> 4, Y = (y & 0xffff) >> 4, cp = R.sine(P + 1024);
    return [R.sine(Y) * cp, R.sine(P), R.sine(Y + 1024) * cp];
  };
  return { ambient: 0x646464, lights: [{ colour: 0xffffff, way: way(pitch + 0x2000, yaw - 0x2000) },
    { colour: 0x808080, way: way(-0x2000 - pitch, yaw + 0x6000) }] };
}

export function pack(x, y) { return (x + 64) | ((y + 64) << 8); }
export function unpack(v) { return [(v & 0xff) - 64, ((v >> 8) & 0xff) - 64]; }
function validPad(v) { return Number.isInteger(v) && v >= 0 && v <= 0x8080 && (v & 0xff) <= 128; }
