// A Gutsy Golbat game: the world (rules.js) on the round's clock, and the
// scene it drives. The game's own view: the screen is the plane z = 0, seen
// from (0, 0, 1200) with a fov of 30, the cave's backdrops behind at z = -100;
// the Golbat are models, Magnemite and the hearts sprites. In the game's units.
//
// Who plays each seat: "local" (this device's player), "cpu" or "remote"
// (someone on another device, online). The CPUs think in the world, so every
// device runs them alike. This device's player's pad emits "send" as it
// changes (a frame's stick, and a flap); online, the others' come in
// told("pad"), mostly a few frames late: the world runs on guessing they held
// their stick and didn't flap, and runs again from a saved frame when one
// comes in (their Golbat eased to where it really is). The server runs the
// same world and says how it ended (told("won")).
//
// The show round the world is this device's own (flight.js): the Golbat
// flying in through the countdown, the end's flight, Jynx's hearts and module
// #64's particles. All of it ticks at the game's 30 frames a second, and is
// drawn between its frames: places, spins, clip frames, fades and the
// flipbooks' pages go by the time on show, to the 60th or finer.
import * as THREE from "three";
import { makeModel, n64Look } from "./assets.js";
import * as R from "./rules.js";
import * as F from "./flight.js";
import { leadFor } from "../lag.js";
import { makeBadge } from "../badge.js";

// the frame the play ends on (the cave's stopped). The round's over when the
// game hands over to the results (module #64's, over the scene): as the first
// loser lands (0x86100874), or at once if all four have the same (0x861008E8)
export const END = R.endFrame();
// the camera (geo layout 0x8610A114): fov 30, but showing 92% of it across and
// up, as a TV did (the game's backdrops don't quite reach its screen's edges,
// and leave a gap as the cave stops: things a TV's edge hid)
const EYE = 1200, FOV = (2 * Math.atan(Math.tan(Math.PI / 12) * 0.92) * 180) / Math.PI;
const GOLBAT = 0.04; // its scale (700 x it: 28 across)
// Golbat's clips (object 53): 2 flying (its wingbeat 0x0F03 on its frame 0),
// 4 knocked by a dash, 5 hurt by a Magnemite (0x86102FF0); the end's: flight.js
const CLIP = { fly: 2, knocked: 4, hurt: 5 };
const FLY_LEN = 10;
// a Magnemite: bank 69's 32 x 19 on a 112 x 66 quad, at 0.64 (0x86105C30);
// its frames go 0 1 2 1 0 3 4 3, one every 3 (every one while it flashes:
// 0x86105AD8). Hit, it flashes for 17 frames (0x86105950): its colour black
// at 0x9F over it, white on every third from the hit's
const MAG = { w: 112 * 0.64, h: 66 * 0.64, frames: [0, 1, 2, 1, 0, 3, 4, 3], flash: 17, alpha: 0x9f / 255 };
// a heart: bank 222's 16 x 16 on a 46 x 46 quad, wobbling (0x86106C54);
// red from the course or Jynx, outlined in its Golbat's colour when knocked out
const HEART = 46, GOT_FOR = 6;
// the backdrops (bank 221's 256 x 192, 3.375x: 0x86106044), and Jynx
// (object 110 at 0.2, turned -22.5 degrees: 0x861072AC); her hand (where her
// hearts come from: her node's +0xD0, not traced) by eye
const BACKDROP = { w: 864, h: 648, z: -100 };
const JYNX = { y: -242.92343, z: -100, s: 0.2, yaw: -0xfff, len: 79, throwAt: [8, 47], hand: [-20, 120, 60] };
// the glow behind each Golbat (bank 343's 64 x 64, 2.25x and bigger as it
// goes faster, 20 behind; its alpha 125 +- 25, 15 degrees a frame:
// 0x86109AE0); fading out once the meadow's come
const GLOW = { size: 64, s: 2.25, z: -20 };
// the badge over each (module #64's label, 0x86107D7C: image bank 434, 1P-4P
// or a CPU's COM in its colour), 28 x 1.9 over its middle (flight.js), the
// object 1.75, its env alpha 0xC8 (0x861047CC-0x861048F8); from the countdown
// on, gone from a loser as it falls (0x86104370)
const BADGE = { scale: 1.75, alpha: 0xc8 / 255 };
// the colour over a Golbat (its +0xC4: rgb and how much; assets.js n64Look):
// a dash's, its player's (0x86103A38), red when a dash knocks it (0x86100EDC),
// white flickering while it's hurt (alpha 0x2F less a frame, round and round:
// 0x861037C4) and 0x5F as that's over; fading 7 a frame, and 64 more while
// it's over 0x40 and not dashing (0x861039C0, 0x86103AC0)
const DASH = [[0xc8c8ff, 0xd2], [0x96dc96, 0xbe], [0xff9696, 0xbe], [0xffff64, 0xbe]].map(([c, a]) => [new THREE.Color(c), a]);
const WHITE = new THREE.Color(0xffffff), RED = new THREE.Color(0xff0000);
// module #64's particles, drawn facing the camera through their combiners
// (tools/web_assets.py), blended, each living its life of frames from the
// one after it's made: a Magnemite's hit, bank 224's burst at it + (7, -17),
// 3.7x its 64 x 64, turning 0x7F a frame, its picture its age / 2 (0x861057D8,
// 0x87F03884, 0x87F039F0); the lightning round a hurt Golbat, one every 3rd
// frame (0x86103384): bank 225's 32 x 96 at a random angle out from it, 0.5-2.5
// x 28 off, 100 in front, pointing out, 0.3x as big as it's far, for 8; and
// the stars (bank 147's 32 x 32, 0x87F0328C): 5 where a heart's caught (+-28
// round it, 1-2x, for 10-25 frames, thrown up 1-16 and +-3 across, the scroll
// with them, falling 0.98 a frame faster: 0x861061B0), and from Jynx's
// hearts every 3rd of their first 60 frames (+-30 round it, 1.5x, for 15-30,
// falling 1.5 a frame: 0x86106784), each its size x sin(pi age / life),
// turning 0x3FE a frame (0x87F02F00)
const BURST = { size: 64, scale: 3.7, life: 15, at: [7, -17], spin: 0x7f };
const BOLT = { w: 32, h: 96, life: 8, z: 100, every: 3 };
const STARS = { n: 5, size: 32, spin: 2 * 0x1ff, at: 28, gravity: -0.98, trail: { at: 30, scale: 1.5, fall: 1.5, every: 3, till: 60 } };
// A screen wider than the game's shows more of the cave either side (as far
// as SEEN from the middle, 1100 at the backdrops: a 2.4:1 phone), so what the
// game brings on just past its edge is drawn coming from further off, and
// what it takes off going on off: the course is the same every round, so it's
// known when each Magnemite and heart comes (timeline()). The backdrops there
// are a strip round the meadow's place: the cave to the left of its mouth,
// the meadow, then the meadow mirrored and again to the right
const SEEN = 1100;
const SNAP = 6; // frames between the world's saved states (for running it again)
const KEEP = 20 * R.FPS; // and how far back they go
const SMOOTH = 0.82; // a corrected Golbat's ease to where it is, a 60th of a second
const FLOWN = 60; // countdown frames flown for the Golbat to be eased from there to their places at GO
const LAYER9 = 6; // the hearts and particles (the game's layer 9) drawn after the badges (its 6: src/badge.js's 5)
const deg = (a) => (a / 0x10000) * 2 * Math.PI;
const lerp = (a, b, k) => a + (b - a) * k;
const turnTo = (a, b, k) => a + ((((b - a) % 0x10000) + 0x18000) % 0x10000 - 0x8000) * k; // (an angle the short way)

export class Game {
  constructor(scene, assets) {
    this.scene = scene;
    this.assets = assets;
    this.listeners = {};
    const add = (o) => { scene.add(o); return o; };
    // the backdrops
    for (const k of ["cave", "mouth", "meadow"]) {
      const t = assets[k];
      t.magFilter = t.minFilter = THREE.LinearFilter;
      t.generateMipmaps = false;
    }
    const mirrored = assets.meadow.clone();
    mirrored.repeat.set(-1, 1);
    mirrored.offset.set(1, 0);
    mirrored.needsUpdate = true;
    this.strip = [assets.cave, assets.mouth, assets.meadow, mirrored].map((map) => new THREE.MeshBasicMaterial({ map }));
    this.bgs = [0, 1, 2, 3, 4].map(() => {
      const m = add(new THREE.Mesh(new THREE.PlaneGeometry(BACKDROP.w, BACKDROP.h), this.strip[0]));
      m.position.z = BACKDROP.z;
      m.renderOrder = -2;
      return m;
    });
    this.timeline = timeline();
    this.leaving = []; // sprites the world has taken off at the left, going on off
    // the Golbat, their glows and badges
    this.golbats = [0, 1, 2, 3].map((z) => {
      const model = makeModel(assets.golbat, GOLBAT);
      add(model.root);
      const glow = add(new THREE.Sprite(new THREE.SpriteMaterial({ map: assets["glow" + z], transparent: true, depthWrite: false })));
      glow.renderOrder = -1;
      const badge = add(makeBadge(assets.badges, { scale: BADGE.scale, opacity: BADGE.alpha }));
      return { z, model, glow, badge };
    });
    // Jynx
    this.jynx = makeModel(assets.jynx, JYNX.s);
    this.jynx.root.rotation.y = deg(JYNX.yaw);
    add(this.jynx.root);
    // the sprites: Magnemite and hearts, by the world's ids
    this.magTex = assets.magnemite;
    this.heartTex = assets.hearts;
    for (const t of [this.magTex, this.heartTex]) { t.magFilter = THREE.NearestFilter; t.minFilter = THREE.LinearFilter; }
    this.sprites = new Map();
    this.free = { mag: [], heart: [] };
    // the particles
    for (const k of ["spark", "bolt", "star0", "star1", "star2", "star3", "star_jynx"]) {
      assets[k].magFilter = assets[k].minFilter = THREE.LinearFilter;
      assets[k].generateMipmaps = false;
    }
    this.fx = [];
    this.fxFree = { burst: [], bolt: [], star: [] };
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
    // (online, with other people: this device's player's pads count this many frames on, src/lag.js)
    this.lead = leadFor(this.control.map((c, z) => c === "remote" && !this.cpus[z]), setup.delay);
    this.world = new R.World(seed, level, this.cpus);
    this.inputs = [[], [], [], []]; // each person's pad: [frame, stick x, flap 0/1]
    this.snaps = [[0, this.world.save()]]; // the world as it was before a frame
    this.simT = -1; // the last frame the world has run
    this.shownT = -1; // and whose sounds and effects have gone
    this.stick = 0; // this device's player's stick (-64-64), and its flaps not yet in a frame
    this.flaps = 0;
    this.lastX = 0;
    this.result = null; // the server's word on the end: { f, h }
    this.scores = null;
    this.time = 0;
    this.state = "ready";
    this.lastFrame = -1;
    this.intro = 0; // frames since the countdown started, and those the fly-in's run
    this.flyT = 0;
    this.endAt = null; // when the end began (s of this.time); its frames run, its Golbat, hearts
    this.endN = 0;
    this.ends = null;
    this.endHearts = [];
    this.handed = false; // the results are up (the game's handed over)
    this.winners = null;
    this.offsets = [0, 1, 2, 3].map(() => [0, 0, 0, 0]); // (x, y, z, yaw)
    this.yawWas = null; // each one's yaw before the last frame run
    this.glowClock = 0;
    this.magHit = new Map(); // a Magnemite's id: the frame it last hit
    this.magAt = new Map(); // and where it's drawn
    for (const v of this.golbats) {
      v.wing = v.wingWas = Math.floor(Math.random() * FLY_LEN); // (clip 2 from a random frame: 0x86104CAC)
      v.rate = 1;
      v.off = false;
      v.col = { rgb: WHITE, a: 0, from: 0, to: 0 };
      v.hurtWas = false;
      v.speed = [0, 0];
      v.fly = F.flyStart(v.z);
      v.flyWas = { ...v.fly };
      v.end = v.endWas = null;
      v.glowN = Math.floor(Math.random() * 361);
      v.glowOff = null;
      v.at = [0, 0, 0];
    }
    this.golbats.forEach((g, z) => g.badge.seat(z, this.cpus[z]));
    for (const [, s] of this.sprites) { s.visible = false; this.free[s.userData.kind].push(s); }
    this.sprites.clear();
    for (const p of this.fx) this.retire(p);
    this.fx = [];
    for (const s of this.leaving || []) { s.visible = false; this.free[s.userData.kind].push(s); }
    this.leaving = [];
    const told = setup.told;
    if (told?.pads) told.pads.forEach((list, z) => { if (list && !this.cpus[z]) this.inputs[z] = list.map((e) => [...e]); });
    if (told?.done) this.told("won", told.done);
    this.draw(0);
  }
  // GO: the play's on. The Golbat start it where the fly-in left them (the
  // game's play goes on from there: 0x86104948): drawn from there, eased to
  // where the world has them (their places)
  start() {
    if (this.state === "ready" && this.flyT >= FLOWN) {
      const k = Math.max(0, Math.min(1, this.intro - this.flyT));
      this.golbats.forEach((v, z) => {
        const a = v.flyWas, b = v.fly;
        this.offsets[z] = [lerp(a.x, b.x, k) - R.START[z][0], lerp(a.y, b.y, k) - R.START[z][1], lerp(a.z, b.z, k),
          turnTo(0x3fff, turnTo(a.yaw, b.yaw, k), 1) - 0x3fff];
      });
    }
    this.state = "play";
    this.intro = Infinity;
  }
  stop() { this.state = "over"; }
  setControl(z, c) {
    if (c === "cpu" && !this.cpus[z]) return; // (a person who left: their Golbat keeps their last stick)
    this.control[z] = c;
  }

  get frame() { return Math.floor(this.time * R.FPS + 1e-6); }

  // ---- input ----
  // this device's player: the stick (-64-64) and a flap (A)
  setStick(x) { this.stick = Math.max(-64, Math.min(64, Math.round(x))); }
  flap() { if (this.state === "play") this.flaps = Math.min(2, this.flaps + 1); }
  // seat z's pad on frame t: [stick x, a flap]
  padAt(z, t) {
    const list = this.inputs[z];
    let i = list.length - 1;
    while (i >= 0 && list[i][0] > t) i--;
    if (i < 0) return [0, false];
    let flap = false;
    for (let j = i; j >= 0 && list[j][0] === t; j--) if (list[j][2]) flap = true;
    return [list[i][1], flap];
  }

  // the server's word: someone's pad ("pad": { s, f, x, a }; to this device's
  // own, o: the frame it said), or the end ("won": { f, h: each one's hearts })
  told(type, m) {
    if (type === "pad") {
      const z = m.s;
      if (!(z >= 0 && z < 4) || this.cpus[z] || !Number.isInteger(m.f) || !Number.isInteger(m.x) || (m.a !== 0 && m.a !== 1)) return;
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
      if (!Number.isInteger(m.f) || !Array.isArray(m.h)) return;
      this.result = { f: m.f, h: m.h.map((x) => (Number.isInteger(x) ? x : 0)) };
    }
  }
  // the world again from before frame f (a pad it ran without); where the
  // Golbat were is kept, to ease them to where they turn out to be
  rewind(f) {
    if (f > this.simT) return;
    if (!this.was) this.was = { t: this.simT, at: this.world.g.map((g) => [g.x, g.y]) };
    while (this.snaps.length > 1 && this.snaps[this.snaps.length - 1][0] > f) this.snaps.pop();
    const [at, state] = this.snaps[this.snaps.length - 1];
    this.world.load(state);
    this.simT = at - 1;
  }
  // run the world up to frame t
  runTo(t) {
    const w = this.world;
    while (this.simT < t && w.end === null) {
      const f = this.simT + 1;
      if (f % SNAP === 0 && f > this.snaps[this.snaps.length - 1][0]) {
        this.snaps.push([f, w.save()]);
        while (this.snaps.length > 2 && this.snaps[1][0] < f - KEEP) this.snaps.shift();
      }
      this.yawWas = w.g.map((g) => g.yaw); // (to draw its turn between frames, as its place)
      w.step(f, [0, 1, 2, 3].map((z) => (this.cpus[z] ? null : this.padAt(z, f))));
      this.simT = f;
      if (f > this.shownT) { this.show(f); this.shownT = f; }
      w.events = [];
      if (this.was && f === this.was.t) { // (run again to where it was: ease the Golbat from there)
        w.g.forEach((g, z) => {
          this.offsets[z][0] += this.was.at[z][0] - g.x;
          this.offsets[z][1] += this.was.at[z][1] - g.y;
        });
        this.was = null;
      }
    }
    if (w.end !== null) this.was = null;
  }
  // frame f's sounds, particles and colours (once each, the first time it's run)
  show(f) {
    const w = this.world;
    const bumped = new Set();
    for (const [what, z, id] of w.events) {
      const g = z >= 0 ? w.g[z] : null;
      if (what === "count") this.emit("sound", "lastCount");
      else if (what === "end") this.emit("sound", "lastGo");
      else this.emit(what, z, g ? pan(g.x) : 64);
      if (what === "bump") bumped.add(z);
      if (what === "got") { const h = w.hearts.find((o) => o.id === id); if (h) this.stars(h.x, h.y, 0, z, f, w.scroll); }
      if (what === "zap") { // (the Magnemite flashes, and bursts: 0x861057D8)
        this.magHit.set(id, f);
        this.puff({ kind: "burst", born: f, life: BURST.life, mag: id, roll: 0 });
      }
    }
    for (const g of w.g) {
      const v = this.golbats[g.z];
      // its colour (0x8610362C): the branch it took this frame, and a dash's knock before it or after
      // (its hurt's over: 26 frames up, or another Magnemite's after it; a knock after it zeroes its frames too)
      const c = v.col, hurt = v.hurtWas, over = hurt && (!g.hurt || (g.timer === 0 && !bumped.has(g.z)));
      let a = c.a;
      c.from = a;
      if (bumped.has(g.z) && g.hitT >= 1) { c.rgb = RED; a = 0xaf; } // (knocked by one before it: 0x86100E20)
      if (hurt && !over) { c.rgb = WHITE; c.to = a - 0x2f; a = (c.to + 256) % 256; } // (0x861037C4)
      else if (over) { c.rgb = WHITE; c.to = a = 0x5f; }
      else {
        a = a >= 8 ? a - 7 : 0;
        if (g.dash) [c.rgb, a] = DASH[g.z];
        else if (a > 0x40) a -= 0x40;
        c.to = a;
      }
      if (bumped.has(g.z) && g.hitT === 0) { c.rgb = RED; c.to = a = 0xaf; } // (by one after it)
      c.a = a;
      // the lightning round it, every 3rd frame of its hurt (0x86103384)
      if (hurt && !over && (g.timer - 1) % BOLT.every === 0) {
        const at = Math.floor(Math.random() * 0x10000), r = 2 * Math.random() + 0.5, d = r * 28;
        this.puff({ kind: "bolt", born: f, life: BOLT.life, seat: g.z, dx: Math.cos(deg(at)) * d, dy: Math.sin(deg(at)) * d, roll: at - 0x3fff, scale: r * 0.3 });
      }
      v.hurtWas = g.hurt;
      // its clip: knocked or hurt, else flying, from its frame 0 again after them; its
      // wingbeat as that comes round (it can skip it, played faster after a flap: 0x86102FF0)
      const off = g.hit || (g.hurt && g.timer > 0);
      if (off) { v.wing = v.wingWas = 0; v.rate = 1; }
      else {
        if (v.off) v.wing = 0;
        v.wingWas = v.wing;
        if (Math.floor(v.wing) % FLY_LEN === 0) this.emit("wing", g.z, pan(g.x));
        v.rate = g.flap && g.vy > 0 ? 1 + 2 * (g.vy / 15) : 1;
        v.wing += v.rate;
      }
      v.off = off;
      v.speed = [v.speed[1], Math.sqrt(g.vx * g.vx + g.vy * g.vy)];
    }
  }

  // ---- the countdown: the Golbat fly in (state 3), their wings beating ----
  flyFrame() {
    for (const v of this.golbats) {
      v.flyWas = { ...v.fly };
      F.flyFrame(v.fly);
      v.wingWas = v.wing;
      if (Math.floor(v.wing) % FLY_LEN === 0) this.emit("wing", v.z, pan(v.fly.x));
      v.wing += 1;
    }
  }

  // ---- the game, frame by frame ----
  update(dt) {
    if (this.state === "ready") {
      this.intro += dt * R.FPS;
      while (this.flyT < Math.floor(this.intro)) { this.flyT++; this.flyFrame(); }
    }
    if (this.state === "play" || this.state === "over") this.time += dt;
    if (this.state === "play") {
      const now = Math.min(this.frame, END);
      for (let t = this.lastFrame + 1; t <= now; t++) { this.step(t); this.lastFrame = t; }
      this.runTo(this.lastFrame); // (after a pad that came in late)
    }
    if (this.world.end !== null && this.endAt === null && this.state !== "idle") this.ending();
    if (this.endAt !== null) { // (the end's frames, after the play's)
      const k = this.frame - END - 1;
      while (this.endN <= k) this.endFrame(this.endN++);
    }
    if (this.handed && this.state === "play") { this.state = "over"; this.emit("finish"); }
    this.animate(dt);
  }

  // what happens on frame t (from GO): this device's player's pad is kept (and sent), and the world runs
  step(t) {
    const me = this.me, f = t + this.lead; // (online: a few frames ahead, src/lag.js leadFor)
    if (this.control[me] === "local" && !this.cpus[me]) {
      const x = this.stick, a = this.flaps > 0 ? 1 : 0;
      if (a) this.flaps--;
      if (x !== this.lastX || a) {
        this.inputs[me].push([f, x, a, f]); // ([frame, x, A, the frame it was sent for])
        this.lastX = x;
        this.emit("send", { s: me, f, x, a });
      }
    }
    this.runTo(t);
  }
  over() { return this.state === "over"; }

  // each one's hearts: the server's once it's said, else the world's
  heartsOf(z) { return this.result ? this.result.h[z] : this.world.g[z].hearts; }
  // the places: by hearts
  places() {
    const h = [0, 1, 2, 3].map((z) => (this.scores ? this.scores[z] : this.heartsOf(z)));
    return h.map((x) => 1 + h.filter((y) => y > x).length);
  }

  // ---- the end (state 5: 0x861008E8, 0x86103C48) ----
  // As the cave stops: the most hearts win (none, if all four have the same),
  // the song fades (0x86109404); they're startled, then the winners cheer and
  // the others drop to the floor (flight.js), Jynx throws hearts, and what's
  // left of the play's hearts goes on (no more to count)
  ending() {
    this.endAt = this.time;
    const h = [0, 1, 2, 3].map((z) => this.heartsOf(z)), most = Math.max(...h);
    const win = h.map((x) => x === most);
    this.winners = win.every((x) => x) ? [false, false, false, false] : win;
    this.emit("end", this.winners);
    this.ends = this.world.g.map((g, z) => F.endStart(g, this.winners[z]));
    this.golbats.forEach((v, z) => { v.end = this.ends[z]; v.endWas = { ...v.end }; });
    this.endHearts = this.world.hearts.map((o) => ({ ...o, z: 0, was: [o.x, o.y], timerWas: o.timer - 1 }));
    this.jynxBase = Math.round((R.JYNX_AT - (this.world.jynx ?? R.JYNX_AT)) / 4);
    this.endN = 0;
    if (this.winners.every((x) => !x)) this.handed = true; // (four the same: the results at once, 0x861008E8)
  }
  // end frame k (the game's END + 1 + k)
  endFrame(k) {
    const at = END + 1 + k;
    for (const v of this.golbats) v.endWas = { ...v.end };
    for (let i = 0; i < 4; i++) if (F.endFrame(this.ends, i)) this.handed = true; // (the first loser down: the results, 0x86100874)
    // the hearts (0x86106C54): Jynx's, and what was left of the play's, caught for show (no sound, and no
    // more counted: 0x86106504 only counts in the play)
    for (const h of [...this.endHearts]) {
      h.was = [h.x, h.y];
      h.timerWas = h.timer;
      let gone = false, by = null;
      if (h.got) gone = h.timer >= GOT_FOR;
      else if (h.kind === "thrown") { // (0x86106784: caught where it is, then it drifts off left)
        by = this.endCatch(h);
        if (by !== null) this.stars(h.x, h.y, h.z, by, at, 0);
        h.vx *= 0.97; h.vy *= 0.97;
        h.x += h.vx - 4;
        h.y += h.vy;
        bounce(h);
        if (h.timer < STARS.trail.till && h.timer % STARS.trail.every === 0) this.trail(h, at);
      } else {
        h.vx *= 0.97; h.vy *= 0.97;
        h.x += h.vx;
        h.y += h.vy;
        if (h.kind === "dropped") bounce(h);
        by = this.endCatch(h);
        if (by !== null) this.stars(h.x, h.y, 0, by, at, 0);
      }
      if (h.x < -R.EDGE) gone = true;
      if (by !== null) { h.got = true; h.timer = 0; h.timerWas = 0; h.vx = h.vy = 0; }
      if (gone) this.endHearts.splice(this.endHearts.indexOf(h), 1);
      else h.timer++;
    }
    // Jynx: a heart from her hand on frames 8 and 47 of her clip, -45 to 180 degrees at 10 (0x86107150)
    if (this.world.jynx !== null && JYNX.throwAt.includes(this.jynxClip(at) % JYNX.len)) {
      const a = deg(Math.floor(Math.random() * 40960) - 0x1fff), x = this.world.jynx + JYNX.hand[0];
      const y = JYNX.y + JYNX.hand[1], z = JYNX.z + JYNX.hand[2];
      this.endHearts.push({ id: "j" + k, kind: "thrown", owner: -1, knocked: false, got: false, timer: 0, timerWas: -1,
        x, y, z, vx: Math.cos(a) * 10, vy: Math.sin(a) * 10, was: [x, y] });
    }
  }
  // who catches heart h at the end: the first not lying on the floor that's
  // on it, not its own in its first 16 frames (0x86106504)
  endCatch(h) {
    for (let z = 0; z < 4; z++) {
      const e = this.ends[z];
      if (!e.landed && ((z !== h.owner && !h.knocked) || h.timer >= 16) && Math.abs(h.x - e.x) < 58 && Math.abs(h.y - e.y) < 58) return z;
    }
    return null;
  }
  // Jynx's clip frame after frame t (she came with the meadow; it plays on through the end)
  jynxClip(t) { return this.jynxBase + t - END; }

  // ---- module #64's particles ----
  puff(p) { this.fx.push(p); }
  retire(p) {
    if (!p.sprite) return;
    p.sprite.visible = false;
    this.fxFree[p.kind].push(p.sprite);
    p.sprite = null;
  }
  // 5 stars where a heart's caught, in the catcher's colours (0x861061B0)
  stars(x, y, z, seat, born, scroll) {
    for (let i = 0; i < STARS.n; i++) {
      const r = [Math.random(), Math.random(), Math.random(), Math.random()];
      this.puff({ kind: "star", tex: "star" + seat, born, life: 10 + Math.floor(r[3] * 16), scale: 1 + r[2],
        x: x + (2 * r[0] - 1) * STARS.at, y: y + (2 * r[1] - 1) * STARS.at, z,
        vx: (2 * Math.random() - 1) * 3 + scroll, vy: 2 * Math.random() * 7.5 + 1, ay: STARS.gravity });
    }
  }
  // a star off one of Jynx's hearts (0x86106BD8: mode 1, falling at its size)
  trail(h, born) {
    const t = STARS.trail, r = () => (2 * Math.random() - 1) * t.at;
    this.puff({ kind: "star", tex: "star_jynx", born, life: 15 + Math.floor(Math.random() * 16), scale: t.scale,
      x: h.x + r(), y: h.y + r(), z: h.z + r(), vx: 0, vy: -t.fall, ay: 0 });
  }

  // ---- every rendered frame ----
  animate(dt) {
    const k = Math.pow(SMOOTH, dt * 60);
    for (const o of this.offsets) for (let i = 0; i < 4; i++) o[i] *= k;
    this.glowClock += dt * R.FPS;
    this.draw(dt);
  }

  draw(dt = 0) {
    const w = this.world, ready = this.state === "ready", t = ready ? Math.min(this.intro, R.INTRO) : null;
    const playing = this.state === "play" || this.state === "over";
    const endOn = this.endAt !== null && this.endN > 0; // (the end's own frames have begun)
    const between = playing && !endOn ? Math.max(0, Math.min(1, this.time * R.FPS - this.lastFrame)) : 1;
    // the state on show, as a frame (fractional): the world's is drawn between
    // its places after the last frame and the one before, so this is the
    // frame before the clock's (in the countdown, before GO, the backdrops go by already)
    const D = playing ? (endOn ? this.time * R.FPS - 1 : this.lastFrame - 1 + between)
      : t !== null ? t - R.INTRO - 1 : -R.INTRO - 1;
    const kEnd = endOn ? Math.max(0, Math.min(1, D - (END + this.endN - 1))) : 0; // (between its last two)
    // the backdrops: the strip round where the meadow is (or will be: the
    // world's two are always on it, and the game stops the meadow 4 short of
    // where they'd meet)
    const { meadow } = this.timeline;
    const mx = meadow.x + (R.SCROLL / 2) * (Math.min(D, END - 1) - meadow.t);
    const k0 = Math.floor((-SEEN - mx) / BACKDROP.w + 0.5);
    this.bgs.forEach((m, i) => {
      const k = k0 + i, x = mx + k * BACKDROP.w;
      m.visible = x - BACKDROP.w / 2 < SEEN;
      m.position.x = x;
      m.material = this.strip[k < -1 ? 0 : k === -1 ? 1 : k % 2 ? 3 : 2];
    });
    // Jynx, once the meadow's come: her clip on through the end
    this.jynx.root.visible = w.jynx !== null;
    if (w.jynx !== null) {
      const jx = w.jynx - (w.scroll / 2) * (1 - between);
      this.jynx.root.position.set(jx, JYNX.y, JYNX.z);
      this.jynx.pose(0, ((R.JYNX_AT - jx) / 4 + Math.max(0, D - END)) % JYNX.len);
    }
    // the Golbat
    const intoFly = ready ? Math.max(0, Math.min(1, this.intro - this.flyT)) : 0;
    w.g.forEach((g, z) => {
      const v = this.golbats[z], m = v.model, o = this.offsets[z];
      let x, y, zz = 0, yaw, clip = CLIP.fly, f = lerp(v.wingWas, v.wing, playing ? between : intoFly), s = 1, up = F.LABEL, badge = this.state !== "idle";
      if (ready) { // flying in
        const a = v.flyWas, b = v.fly;
        x = lerp(a.x, b.x, intoFly); y = lerp(a.y, b.y, intoFly); zz = lerp(a.z, b.z, intoFly);
        yaw = turnTo(a.yaw, b.yaw, intoFly);
      } else if (this.state === "idle") {
        x = R.START[z][0]; y = R.START[z][1]; yaw = 0x3fff;
      } else if (endOn) {
        const a = v.endWas, b = v.end;
        x = lerp(a.x, b.x, kEnd); y = lerp(a.y, b.y, kEnd);
        s = lerp(a.s, b.s, kEnd); up = lerp(a.up, b.up, kEnd);
        yaw = b.yaw;
        clip = b.clip;
        f = b.fresh || b.cf !== a.cf + 1 || b.clip !== a.clip ? b.cf : a.cf + kEnd;
        badge = b.label;
      } else {
        x = lerp(g.ox, g.x, between) + o[0];
        y = lerp(g.oy, g.y, between) + o[1];
        zz = o[2];
        yaw = turnTo(this.yawWas?.[z] ?? g.yaw, g.yaw, between) + o[3];
        if (g.hit) { clip = CLIP.knocked; f = g.hitT - 1 + between; }
        else if (g.hurt) { clip = CLIP.hurt; f = g.timer - 1 + between; }
      }
      v.at = [x, y, zz];
      m.root.position.set(x, y, zz);
      m.root.scale.setScalar(s);
      m.root.rotation.y = deg(yaw);
      m.pose(clip, f);
      // its badge (pushed up with it as it grows at the end)
      v.badge.position.set(x, y + up, zz);
      v.badge.visible = badge;
      // its colour (in the play)
      const c = v.col;
      if (playing && !endOn) {
        const a = lerp(c.from, c.to, between);
        m.fog(c.rgb, (((a % 256) + 256) % 256) / 255);
      } else m.fog(WHITE, 0); // (cleared each frame of the end: 0x86103C94)
      // its glow, pulsing (on its own clock), fading once the meadow's come
      const n = v.glowN + this.glowClock;
      if (!w.g[z].glow && v.glowOff === null) v.glowOff = [this.glowClock, glowAlpha(n)];
      if (w.g[z].glow) v.glowOff = null;
      const alpha = v.glowOff ? Math.max(0, v.glowOff[1] - (this.glowClock - v.glowOff[0])) : glowAlpha(n);
      const speed = endOn ? Math.hypot(v.end.vx, v.end.vy) : lerp(v.speed[0], v.speed[1], between);
      v.glow.visible = alpha > 0;
      v.glow.position.set(x, y, zz + GLOW.z);
      const gs = GLOW.size * (GLOW.s + 0.1 * Math.sin(deg(n * 15 * 182.04167)) + GLOW.s * (speed / Math.sqrt(450)) * 0.5) * s;
      v.glow.scale.set(gs, gs, 1);
      v.glow.material.opacity = Math.max(0, Math.min(1, alpha / 255));
    });
    // Magnemite and hearts
    const seen = new Set();
    for (const m of w.mags) {
      seen.add(m.id);
      const s = this.sprite(m.id, "mag");
      const x = lerp(m.ox, m.x, between), y = lerp(m.oy, m.y, between);
      s.position.set(x, y, 0);
      this.magAt.set(m.id, [x, y]);
      const k = m.flash ? 1 : 3, n = Math.max(0, m.n - 1 + between);
      s.material.map.offset.x = MAG.frames[Math.floor((n % (k * 8)) / k)] / 5;
      // (its flash: from the frame it hit, black at 0x9F, white every third)
      const hit = this.magHit.get(m.id), tc = hit === undefined ? -1 : D - hit;
      if (tc >= 0 && tc < MAG.flash) s.userData.fog.value.set(...(Math.floor(tc) % 3 ? [0, 0, 0] : [1, 1, 1]), MAG.alpha);
      else s.userData.fog.value.w = 0;
    }
    const hearts = endOn ? this.endHearts : w.hearts;
    for (const h of hearts) {
      seen.add(h.id);
      const s = this.sprite(h.id, "heart");
      const n = endOn ? lerp(h.timerWas, h.timer, kEnd) - 1 : h.timer - 2 + between; // (its frames, as its wobble had it)
      if (endOn) s.position.set(lerp(h.was[0], h.x, kEnd), lerp(h.was[1], h.y, kEnd), h.z);
      else s.position.set(lerp(h.ox, h.x, between), lerp(h.oy, h.y, between), 0);
      s.material.map.offset.x = (h.kind === "dropped" ? h.owner + 1 : 0) / 5;
      const a = deg(n * 10 * 182.04167);
      let k = 1, op = 1;
      if (h.got) { k = 1.4; op = Math.max(0, 1 - (n + 1) / GOT_FOR); }
      else if (h.kind === "thrown" && n < 15) k = 0.5 + Math.max(0, n) / 30; // (growing as it comes: 0x86106C54)
      s.userData.got = h.got;
      s.scale.set(HEART * (Math.sin(a) * 0.2 + 1) * k, HEART * (Math.cos(a) * 0.2 + 1) * k, 1);
      s.material.opacity = op;
    }
    // what's still to come on, drawn coming (where it'll be: the course's own way)
    for (const c of this.timeline.spawns) {
      if (this.lastFrame >= c.t) continue; // (it's the world's now)
      const n = D - c.t + 1; // (its frames on, by then: it comes on at the edge and goes 8 a frame)
      if (R.EDGE + R.SCROLL * n > SEEN) continue;
      const id = "c" + c.t + c.kind + c.y, s = this.sprite(id, c.kind);
      seen.add(id);
      s.position.set(R.EDGE + R.SCROLL * n, c.kind === "mag" ? Math.sin((n * 2 * Math.PI) / 30) * 10 + c.y : c.y, 0);
      if (c.kind === "mag") {
        s.material.map.offset.x = MAG.frames[Math.floor((((Math.floor(n) % 24) + 24) % 24) / 3)] / 5;
      } else {
        const a = deg((n - 1) * 10 * 182.04167);
        s.material.map.offset.x = 0;
        s.scale.set(HEART * (Math.sin(a) * 0.2 + 1), HEART * (Math.cos(a) * 0.2 + 1), 1);
      }
    }
    // and what's gone off at the left, going on off
    for (const [id, s] of this.sprites) {
      if (seen.has(id)) continue;
      if (typeof id === "number" && s.position.x < -R.EDGE + 16 && !s.userData.got && !endOn) this.leaving.push(s);
      else { s.visible = false; this.free[s.userData.kind].push(s); }
      this.sprites.delete(id);
    }
    this.leaving = this.leaving.filter((s) => {
      s.position.x += (this.state === "play" && this.endAt === null ? R.SCROLL : 0) * dt * R.FPS;
      if (s.position.x > -SEEN && this.state !== "ready") return true;
      s.visible = false;
      this.free[s.userData.kind].push(s);
      return false;
    });
    // the particles, at their age on show
    this.fx = this.fx.filter((p) => {
      const age = D - p.born + 1;
      if (!playing || age >= p.life + 1 || (p.kind === "star" && age > p.life)) { this.retire(p); return false; }
      const s = this.particle(p);
      s.visible = age >= 1;
      if (!s.visible) return true;
      if (p.kind === "star") {
        const k = Math.sin((Math.PI * age) / p.life) * p.scale * STARS.size;
        s.visible = k > 0;
        s.scale.set(k, k, 1);
        s.position.set(p.x + p.vx * age, p.y + p.vy * age + (p.ay * age * (age + 1)) / 2, p.z);
        s.material.rotation = deg(STARS.spin * age);
        return true;
      }
      s.material.map.offset.x = ((Math.floor(age) & 15) >> 1) / 8; // (its picture: age / 2, 0x87F0F660)
      if (p.kind === "burst") {
        const at = this.magAt.get(p.mag) || [0, 0];
        s.position.set(at[0] + BURST.at[0], at[1] + BURST.at[1], 0);
        s.material.rotation = deg(p.roll + BURST.spin * age);
      } else {
        const at = this.golbats[p.seat].at;
        s.position.set(at[0] + p.dx, at[1] + p.dy, at[2] + BOLT.z);
        s.scale.set(BOLT.w * p.scale, BOLT.h * p.scale, 1);
        s.material.rotation = deg(p.roll);
      }
      return true;
    });
  }
  // a sprite for thing id: a Magnemite or a heart
  sprite(id, kind) {
    let s = this.sprites.get(id);
    if (s) return s;
    s = this.free[kind].pop();
    if (!s) {
      const tex = (kind === "mag" ? this.magTex : this.heartTex).clone();
      tex.repeat.set(1 / 5, 1);
      tex.needsUpdate = true;
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, alphaTest: 0.05 });
      s = new THREE.Sprite(mat);
      s.userData.kind = kind;
      if (kind === "heart") s.renderOrder = LAYER9; // (over the badges, as the game's layer 9 is drawn after their 6)
      if (kind === "mag") {
        s.scale.set(MAG.w, MAG.h, 1);
        s.userData.fog = { value: new THREE.Vector4(0, 0, 0, 0) };
        n64Look(mat, s.userData.fog); // (its colour over it, as the models': its flash)
      }
      this.scene.add(s);
    }
    s.visible = true;
    s.material.opacity = 1;
    if (s.userData.fog) s.userData.fog.value.w = 0;
    s.userData.got = false;
    this.sprites.set(id, s);
    return s;
  }
  // particle p's sprite: a strip's (its own texture, to page it) or a star's
  particle(p) {
    if (p.sprite) return p.sprite;
    let s = this.fxFree[p.kind].pop();
    if (!s) {
      let map = this.assets[p.kind === "burst" ? "spark" : p.kind === "bolt" ? "bolt" : "star0"];
      if (p.kind !== "star") {
        map = map.clone();
        map.repeat.set(1 / 8, 1);
        map.needsUpdate = true;
      }
      s = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false }));
      s.renderOrder = LAYER9;
      this.scene.add(s);
    }
    if (p.kind === "star" && s.material.map !== this.assets[p.tex]) { s.material.map = this.assets[p.tex]; s.material.needsUpdate = true; }
    if (p.kind === "burst") s.scale.set(BURST.size * BURST.scale, BURST.size * BURST.scale, 1);
    p.sprite = s;
    return s;
  }

  // ---- the end ----
  results() {
    const places = this.places();
    return [0, 1, 2, 3].map((i) => ({ i, score: this.scores ? this.scores[i] : this.heartsOf(i), place: places[i] }))
      .sort((a, b) => a.place - b.place || a.i - b.i);
  }
  celebrate() { return this.results(); }
}

// a glow's alpha on its frame n (0x86109AE0)
const glowAlpha = (n) => 25 * Math.sin(deg(n * 15 * 182.04167)) + 125;
// a heart off the roof and the floor (0x86106688)
function bounce(h) {
  if (h.y > R.Y_MAX) { h.y = R.Y_MAX; h.vy *= -1; }
  if (h.y < R.FLOOR) { h.y = R.FLOOR; h.vy *= -1; }
}

// The course's timeline, the same every round (it doesn't depend on anyone's
// pads): the frame each Magnemite and heart comes on, and the meadow's (and
// its x once it's on)
function timeline() {
  const w = new R.World(0, "normal", [false, false, false, false]);
  const spawns = [];
  let meadow = null;
  for (let t = 0; w.end === null; t++) {
    w.t = t;
    const was = w.ids;
    if (w.spawning) w.course();
    for (const m of w.mags) if (m.id > was) spawns.push({ t, kind: "mag", y: m.y0 });
    for (const h of w.hearts) if (h.id > was) spawns.push({ t, kind: "heart", y: h.y });
    w.hearts.length = 0;
    for (const m of [...w.mags]) { m.x += w.scroll; if (m.x < -R.EDGE) w.mags.splice(w.mags.indexOf(m), 1); }
    const before = w.bgs.map((b) => b.img);
    w.backdrops();
    w.bgs.forEach((b, i) => { if (b.img === R.MEADOW && before[i] !== R.MEADOW) meadow = { t, x: b.x }; });
  }
  return { spawns, meadow };
}

// a sound's pan from a Golbat's x (0x86100020: across where Golbat can go, -64-63 about the middle)
export function pan(x) {
  const v = Math.trunc(((x - R.X_MIN) / (R.X_MAX - R.X_MIN)) * 127) - 63 - 1;
  return Math.max(0, Math.min(127, 64 + Math.max(-128, Math.min(127, v))));
}

// the camera: the game's own, looking at the screen's middle
export const CAMERA = { eye: [0, 0, EYE], at: [0, 0, 0], fov: FOV };
