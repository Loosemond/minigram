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
import * as THREE from "three";
import { makeModel } from "./assets.js";
import * as R from "./rules.js";
import { leadFor } from "../lag.js";

// the frame the play ends on (the cave's stopped), and how long the winners
// cheer before the round's over (made for the remake: the game shows its
// results over them)
export const END = R.endFrame();
export const AFTER = 30;
// the camera (geo layout 0x8610A114): fov 30, but showing 92% of it across and
// up, as a TV did (the game's backdrops don't quite reach its screen's edges,
// and leave a gap as the cave stops: things a TV's edge hid)
const EYE = 1200, FOV = (2 * Math.atan(Math.tan(Math.PI / 12) * 0.92) * 180) / Math.PI;
const GOLBAT = 0.04; // its scale (700 x it: 28 across)
// Golbat's clips (object 53): 1 after a knock, 2 flying, 4 knocked by a dash,
// 5 hurt by a Magnemite, 6 cheering, 8 falling, 9 down (0x86102FF0, 0x86103C48)
const CLIP = { after: 1, fly: 2, knocked: 4, hurt: 5, cheer: 6, fall: 8, down: 9 };
const FLY_LEN = 10;
// a Magnemite: bank 69's 32 x 19 on a 112 x 66 quad, at 0.64 (0x86105C30);
// its frames go 0 1 2 1 0 3 4 3, one every 3 (every one while it flashes:
// 0x86105AD8)
const MAG = { w: 112 * 0.64, h: 66 * 0.64, frames: [0, 1, 2, 1, 0, 3, 4, 3] };
// a heart: bank 222's 16 x 16 on a 46 x 46 quad, wobbling (0x86106C54);
// red from the course, outlined in its Golbat's colour when knocked out
const HEART = 46;
// the backdrops (bank 221's 256 x 192, 3.375x: 0x86106044), and Jynx
// (object 110 at 0.2, turned -22.5 degrees: 0x861072AC)
const BACKDROP = { w: 864, h: 648, z: -100 };
const JYNX = { y: -242.92343, z: -100, s: 0.2, yaw: -0xfff, len: 79, throwAt: [8, 47] };
// the glow behind each Golbat (bank 343's 64 x 64, 2.25x and bigger as it
// goes faster, 20 behind; its alpha 125 +- 25, 15 degrees a frame:
// 0x86109AE0); fading out once the meadow's come
const GLOW = { size: 64, s: 2.25, z: -20 };
// the players' colours: a dashing Golbat's tint (0x8610362C)
const DASH_TINT = [0xc8c8ff, 0x96dc96, 0xff9696, 0xffff64].map((c) => new THREE.Color(c));
const WHITE = new THREE.Color(0xffffff), RED = new THREE.Color(0xff0000);
// where each one comes from in the countdown, flying in from by the camera
// (0x861034A8: z 1200, then 5% of the way a frame)
const FROM = [[0, 99.6771], [160.76952, 0], [0, -104.50018], [-182.20546, 0]];
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
const deg = (a) => (a / 0x10000) * 2 * Math.PI;

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
    // the Golbat and their glows
    this.golbats = [0, 1, 2, 3].map((z) => {
      const model = makeModel(assets.golbat, GOLBAT);
      add(model.root);
      const glow = add(new THREE.Sprite(new THREE.SpriteMaterial({ map: assets["glow" + z], transparent: true, depthWrite: false })));
      glow.renderOrder = -1;
      return { model, glow, ox: 0, oy: 0, wing: 0, rate: 1, end: null };
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
    // sparkles
    this.sparks = [];
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
    this.shownT = -1; // and whose sounds have gone
    this.stick = 0; // this device's player's stick (-64-64), and its flaps not yet in a frame
    this.flaps = 0;
    this.lastX = 0;
    this.result = null; // the server's word on the end: { f, h }
    this.scores = null;
    this.time = 0;
    this.state = "ready";
    this.lastFrame = -1;
    this.intro = 0; // frames since the countdown started
    this.endAt = null; // when the end began (s of this.time), and its frames since
    this.endN = -1;
    this.winners = null;
    this.jynxHearts = [];
    this.offsets = [0, 1, 2, 3].map(() => [0, 0]);
    for (const g of this.golbats) { g.end = null; g.wing = Math.random() * FLY_LEN; g.glowA = 125; g.glowN = Math.floor(Math.random() * 361); }
    for (const [, s] of this.sprites) { s.visible = false; this.free[s.userData.kind].push(s); }
    this.sprites.clear();
    for (const s of this.sparks) s.sprite.visible = false;
    for (const s of this.leaving || []) { s.visible = false; this.free[s.userData.kind].push(s); }
    this.leaving = [];
    const told = setup.told;
    if (told?.pads) told.pads.forEach((list, z) => { if (list && !this.cpus[z]) this.inputs[z] = list.map((e) => [...e]); });
    if (told?.done) this.told("won", told.done);
    this.draw(0);
  }
  start() { this.state = "play"; this.intro = Infinity; }
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
      w.step(f, [0, 1, 2, 3].map((z) => (this.cpus[z] ? null : this.padAt(z, f))));
      this.simT = f;
      if (f > this.shownT) { this.sounds(f); this.shownT = f; }
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
  // frame f's sounds and sparkles (once each)
  sounds(f) {
    const w = this.world;
    for (const [what, z, id] of w.events) {
      const g = z >= 0 ? w.g[z] : null;
      if (what === "count") this.emit("sound", "lastCount");
      else if (what === "end") this.emit("sound", "lastGo");
      else this.emit(what, z, g ? pan(g.x) : 64);
      if (what === "got") this.sparkle(g.x, g.y, COLOURS[z]); // (0x861061B0)
      if (what === "zap") { const m = w.mags.find((o) => o.id === id); if (m) this.sparkle(m.x, m.y, 0xffffff, 3); }
    }
    for (const g of w.g) {
      const v = this.golbats[g.z];
      // the wingbeats: each time a Golbat's flying clip comes round (0x86102FF0)
      const was = Math.floor(v.wing / FLY_LEN);
      v.rate = g.flap && g.vy > 0 ? 1 + 2 * (g.vy / 15) : 1;
      v.wing += v.rate;
      if (Math.floor(v.wing / FLY_LEN) !== was && !g.hurt && !g.hit) this.emit("wing", g.z, pan(g.x));
      // a hurt one sparkles (0x86103384)
      if (g.hurt && g.timer % 3 === 0) this.sparkle(g.x, g.y, 0xffffff, 1);
    }
  }

  // ---- the game, frame by frame ----
  update(dt) {
    if (this.state === "ready") this.intro += dt * R.FPS;
    if (this.state === "play") {
      this.time += dt;
      const now = Math.min(this.frame, END);
      for (let t = this.lastFrame + 1; t <= now; t++) { this.step(t); this.lastFrame = t; }
      this.runTo(this.lastFrame); // (after a pad that came in late)
      if (this.frame >= END + AFTER) { this.state = "over"; this.emit("finish"); }
    } else if (this.state === "over") this.time += dt;
    if (this.world.end !== null && this.endAt === null) this.ending();
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

  // ---- the end (0x861008E8, 0x86103C48) ----
  // the most hearts win (none, if all four have the same); they cheer, the
  // others drop to the floor, and Jynx throws hearts
  ending() {
    this.endAt = this.time;
    const h = [0, 1, 2, 3].map((z) => this.heartsOf(z)), most = Math.max(...h);
    const win = h.map((x) => x === most);
    this.winners = win.every((x) => x) ? [false, false, false, false] : win;
    this.emit("end", this.winners);
    this.world.g.forEach((g, z) => {
      const v = this.golbats[z];
      v.end = { win: this.winners[z], x: g.x, y: g.y, vx: g.vx, vy: g.vy, n: 0, landed: false, s: 1, clipAt: Math.random() * 26, tx: 0, ty: 0 };
      this.target(v.end);
    });
    this.jynxT = 0;
  }
  target(e) { // a spot to fly to (0x86104BEC)
    e.tx = Math.random() * 685.94995 + R.X_MIN;
    e.ty = Math.random() * 122.50637 - 63.664726;
  }
  // a frame of the end, for Golbat view v
  endFrame(v) {
    const e = v.end;
    e.n++;
    e.vx *= 0.97; e.vy *= 0.97; e.vy += -0.58;
    if (e.n <= (e.win ? 30 : 15)) { // a moment's shock: off to the left, growing a little
      if (e.n < 3 || e.vx > 0) e.vx -= 64 * (0.025 + Math.random() * 0.05);
      if (e.y < -104.50018) e.vy += Math.random() * 9;
      else if (e.vy < 0.58) e.vy = 0.58;
      e.x += (2 * Math.random() - 1) * 2.8;
      e.y += (2 * Math.random() - 1) * 2.8;
      if (e.s < 1.25) e.s += 0.1;
    } else if (e.win) { // round the cave, cheering
      let dx = (e.tx - e.x) * 0.025, dy = (e.ty - e.y) * 0.025;
      if (Math.abs(e.tx - e.x) < 112 && Math.abs(e.ty - e.y) < 112) this.target(e);
      dx = Math.max(-1.472, Math.min(1.472, dx));
      dy = Math.max(-9, Math.min(9, dy));
      e.vx += dx;
      e.vy += dy + 0.58;
    } else { // down to the floor
      e.vy += -0.58;
      if (e.landed) { e.y = -192.92343; e.vx *= 0.7; e.vy = 0; }
      else if (e.y < -192.92343) { e.y = -192.92343; e.landed = true; }
    }
    e.vx = Math.max(-15, Math.min(15, e.vx));
    e.vy = Math.max(-15, Math.min(15, e.vy));
    e.x = Math.max(R.X_MIN, Math.min(R.X_MAX, e.x + e.vx));
    e.y = Math.min(R.Y_MAX, e.y + e.vy);
  }

  // ---- every rendered frame ----
  animate(dt) {
    // the end's frames, on its own clock
    if (this.endAt !== null) {
      const n = Math.floor((this.time - this.endAt) * R.FPS);
      while ((this.endN ?? -1) < n) {
        this.endN = (this.endN ?? -1) + 1;
        for (const v of this.golbats) this.endFrame(v);
        this.jynxFrame();
      }
    } else this.endN = -1;
    const k = Math.pow(SMOOTH, dt * 60);
    for (const o of this.offsets) { o[0] *= k; o[1] *= k; }
    const between = this.state === "play" && this.endAt === null ? Math.max(0, Math.min(1, this.time * R.FPS - this.lastFrame)) : 1;
    this.draw(between, dt);
  }

  draw(between, dt = 0) {
    const w = this.world, t = this.state === "ready" ? Math.min(this.intro, R.INTRO) : null;
    const lerp = (a, b) => a + (b - a) * between;
    // the frame whose end is on show, to the 60th (the world's things are drawn
    // between their places after the last frame and the one before; in the
    // countdown, before GO, the backdrops go by already)
    const tau = t !== null ? t - R.INTRO - 1 : this.state === "idle" ? -R.INTRO - 1 : this.lastFrame - 1 + between;
    // the backdrops: the strip round where the meadow is (or will be: the
    // world's two are always on it, and the game stops the meadow 4 short of
    // where they'd meet)
    const { meadow } = this.timeline;
    const mx = meadow.x + (R.SCROLL / 2) * (Math.min(tau, END - 1) - meadow.t);
    const k0 = Math.floor((-SEEN - mx) / BACKDROP.w + 0.5);
    this.bgs.forEach((m, i) => {
      const k = k0 + i, x = mx + k * BACKDROP.w;
      m.visible = x - BACKDROP.w / 2 < SEEN;
      m.position.x = x;
      m.material = this.strip[k < -1 ? 0 : k === -1 ? 1 : k % 2 ? 3 : 2];
    });
    // Jynx, once the meadow's come
    this.jynx.root.visible = w.jynx !== null;
    if (w.jynx !== null) {
      this.jynx.root.position.set(w.jynx - (w.scroll / 2) * (1 - between), JYNX.y, JYNX.z);
      this.jynx.pose(0, this.jynxClock() % JYNX.len);
    }
    // the Golbat
    w.g.forEach((g, z) => {
      const v = this.golbats[z], m = v.model;
      let x, y, zz = 0, clip = CLIP.fly, f = v.wing + (this.state === "play" ? v.rate * between : 0), s = 1;
      if (t !== null) { // flying in
        const k = Math.pow(0.95, t), e = 1 - k;
        x = FROM[z][0] + (R.START[z][0] - FROM[z][0]) * e;
        y = FROM[z][1] + (R.START[z][1] - FROM[z][1]) * e;
        zz = EYE * k;
        f = (v.wing + this.intro) % FLY_LEN;
      } else if (v.end) {
        x = v.end.x; y = v.end.y; s = v.end.s;
        const n = this.endN + v.end.clipAt;
        if (v.end.n <= (v.end.win ? 30 : 15)) { clip = CLIP.hurt; f = n; }
        else if (v.end.win) { clip = CLIP.cheer; f = n; }
        else if (v.end.landed) { clip = CLIP.down; f = Math.min(56, v.end.n); }
        else { clip = CLIP.fall; f = 14 + (v.end.n % 16); }
      } else {
        x = lerp(g.ox, g.x) + this.offsets[z][0];
        y = lerp(g.oy, g.y) + this.offsets[z][1];
        if (g.hit) { clip = CLIP.knocked; f = g.hitT; }
        else if (g.hurt) { clip = CLIP.hurt; f = g.timer; }
      }
      m.root.position.set(x, y, zz);
      m.root.scale.setScalar(s);
      m.root.rotation.y = v.end ? deg(0x3fff) : deg(g.yaw);
      m.pose(clip, f);
      // its colour: a dash's tint, red when knocked, flashing white when hurt
      if (t === null && !v.end && g.hurt) m.tint(WHITE, 0.7, (Math.floor(g.timer / 2) % 2) ? 0.45 : 1);
      else if (t === null && !v.end && g.hit && g.hitT < 8) m.tint(RED, 0.6);
      else if (t === null && !v.end && g.dash) m.tint(DASH_TINT[z], 0.55);
      else m.tint(WHITE, 0);
      // its glow
      const speed = v.end ? 0 : Math.sqrt(g.vx * g.vx + g.vy * g.vy);
      v.glow.visible = v.glowA > 0;
      v.glow.position.set(x, y, zz + GLOW.z);
      const gs = GLOW.size * (GLOW.s + 0.1 * Math.sin(deg(v.glowN * 15 * 182.04167)) + GLOW.s * (speed / Math.sqrt(450)) * 0.5) * s;
      v.glow.scale.set(gs, gs, 1);
      v.glow.material.opacity = Math.max(0, Math.min(1, v.glowA / 255));
    });
    // the glows' pulse, a frame at a time
    this.glowClock = (this.glowClock || 0) + dt * R.FPS;
    while (this.glowClock >= 1) {
      this.glowClock--;
      this.golbats.forEach((v, z) => {
        v.glowN++;
        if (w.g[z].glow) v.glowA = 25 * Math.sin(deg(v.glowN * 15 * 182.04167)) + 125;
        else v.glowA = Math.max(0, v.glowA - 1);
      });
    }
    // Magnemite and hearts
    const seen = new Set();
    for (const m of w.mags) {
      seen.add(m.id);
      const s = this.sprite(m.id, "mag");
      s.position.set(lerp(m.ox, m.x), lerp(m.oy, m.y), 0);
      const k = m.flash ? 1 : 3;
      s.material.map.offset.x = MAG.frames[Math.floor((m.n % (k * 8)) / k)] / 5;
      s.material.color.setScalar(m.flash && m.timer % 3 !== 0 ? 0.45 : 1);
    }
    for (const h of w.hearts) {
      seen.add(h.id);
      const s = this.sprite(h.id, "heart");
      s.position.set(lerp(h.ox, h.x), lerp(h.oy, h.y), 0);
      s.material.map.offset.x = (h.kind === "dropped" ? h.owner + 1 : 0) / 5;
      const a = deg(h.timer * 10 * 182.04167);
      let sx = Math.sin(a) * 0.2 + 1, sy = Math.cos(a) * 0.2 + 1, op = 1;
      if (h.got) { sx *= 1.4; sy *= 1.4; op = Math.max(0, 1 - h.timer / 6); }
      s.userData.got = h.got;
      s.scale.set(HEART * sx, HEART * sy, 1);
      s.material.opacity = op;
    }
    for (const h of this.jynxHearts) {
      seen.add(h.id);
      const s = this.sprite(h.id, "heart");
      s.position.set(h.x, h.y, h.z);
      s.material.map.offset.x = 0;
      const a = deg(h.n * 10 * 182.04167);
      const k = h.got ? Math.max(0, 1 - h.gotN / 6) : Math.min(1, 0.5 + h.n / 30);
      s.scale.set(HEART * (Math.sin(a) * 0.2 + 1) * k, HEART * (Math.cos(a) * 0.2 + 1) * k, 1);
      s.material.opacity = h.got ? k : 1;
    }
    // what's still to come on, drawn coming (where it'll be: the course's own way)
    for (const c of this.timeline.spawns) {
      if (this.lastFrame >= c.t) continue; // (it's the world's now)
      const n = tau - c.t + 1; // (its frames on, by then: it comes on at the edge and goes 8 a frame)
      if (R.EDGE + R.SCROLL * n > SEEN) continue;
      const id = "c" + c.t + c.kind + c.y, s = this.sprite(id, c.kind);
      seen.add(id);
      s.position.set(R.EDGE + R.SCROLL * n, c.kind === "mag" ? Math.sin((n * 2 * Math.PI) / 30) * 10 + c.y : c.y, 0);
      if (c.kind === "mag") {
        s.material.map.offset.x = MAG.frames[Math.floor((((Math.floor(n) % 24) + 24) % 24) / 3)] / 5;
      } else {
        const a = deg(n * 10 * 182.04167);
        s.material.map.offset.x = 0;
        s.scale.set(HEART * (Math.sin(a) * 0.2 + 1), HEART * (Math.cos(a) * 0.2 + 1), 1);
      }
    }
    // and what's gone off at the left, going on off
    for (const [id, s] of this.sprites) {
      if (seen.has(id)) continue;
      if (typeof id === "number" && s.position.x < -R.EDGE + 16 && !s.userData.got) this.leaving.push(s);
      else { s.visible = false; this.free[s.userData.kind].push(s); }
      this.sprites.delete(id);
    }
    this.leaving = this.leaving.filter((s) => {
      s.position.x += (this.state === "play" ? R.SCROLL : 0) * dt * R.FPS;
      if (s.position.x > -SEEN && this.state !== "ready") return true;
      s.visible = false;
      this.free[s.userData.kind].push(s);
      return false;
    });
    // sparkles
    for (const p of this.sparks) {
      if (!p.sprite.visible) continue;
      p.life -= dt * R.FPS;
      if (p.life <= 0) { p.sprite.visible = false; continue; }
      p.vy -= 0.98 * dt * R.FPS * 0.3;
      p.sprite.position.x += p.vx * dt * R.FPS;
      p.sprite.position.y += p.vy * dt * R.FPS;
      p.sprite.material.opacity = Math.min(1, p.life / 8);
    }
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
      s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, alphaTest: 0.05 }));
      s.userData.kind = kind;
      if (kind === "mag") s.scale.set(MAG.w, MAG.h, 1);
      this.scene.add(s);
    }
    s.visible = true;
    s.material.opacity = 1;
    s.material.color.setScalar(1);
    s.userData.got = false;
    this.sprites.set(id, s);
    return s;
  }
  // a few sparkles at x, y in a colour (a caught heart's: 0x861061B0)
  sparkle(x, y, color, n = 5) {
    for (let i = 0; i < n; i++) {
      let p = this.sparks.find((q) => !q.sprite.visible);
      if (!p) {
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xffffff, map: this.glowDot(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
        this.scene.add(sprite);
        p = { sprite };
        this.sparks.push(p);
      }
      p.sprite.visible = true;
      p.sprite.material.color.set(color);
      p.sprite.position.set(x + (2 * Math.random() - 1) * 28, y + (2 * Math.random() - 1) * 28, 10);
      const k = 10 + Math.random() * 16;
      p.sprite.scale.set(k, k, 1);
      p.vx = (2 * Math.random() - 1) * 3 + (this.state === "play" ? R.SCROLL / 4 : 0);
      p.vy = 1 + Math.random() * 8;
      p.life = 10 + Math.random() * 15;
    }
  }
  glowDot() {
    if (this.dot) return this.dot;
    const c = document.createElement("canvas");
    c.width = c.height = 32;
    const g = c.getContext("2d"), r = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    r.addColorStop(0, "rgba(255,255,255,1)");
    r.addColorStop(0.35, "rgba(255,255,255,0.7)");
    r.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = r;
    g.fillRect(0, 0, 32, 32);
    this.dot = new THREE.CanvasTexture(c);
    this.dot.colorSpace = THREE.NoColorSpace;
    return this.dot;
  }

  // ---- Jynx at the end: she throws hearts on frames 8 and 47 of her clip (0x86107208) ----
  // her clip's frames since she came (with the meadow)
  jynxClock() {
    const w = this.world;
    return w.jynx === null ? 0 : Math.round((R.JYNX_AT - w.jynx) / 4) + Math.max(0, this.endN);
  }
  jynxFrame() {
    const w = this.world;
    if (w.jynx === null) return;
    if (JYNX.throwAt.includes(this.jynxClock() % JYNX.len)) {
      const a = deg(Math.floor(Math.random() * 40960) - 0x1fff);
      this.jynxHearts.push({ id: "j" + this.endN, x: w.jynx - 20, y: JYNX.y + 120, z: JYNX.z + 60, vx: Math.cos(a) * 10, vy: Math.sin(a) * 10, n: 0, got: false, gotN: 0 });
    }
    for (const h of this.jynxHearts) { // (0x86106784: no one to go to, so they drift off left, bouncing)
      h.n++;
      if (h.got) { h.gotN++; continue; }
      h.vx *= 0.97; h.vy *= 0.97;
      h.x += h.vx - 4;
      h.y += h.vy;
      h.z = Math.max(0, h.z - 3);
      if (h.y > R.Y_MAX) { h.y = R.Y_MAX; h.vy *= -1; }
      if (h.y < R.FLOOR) { h.y = R.FLOOR; h.vy *= -1; }
      const g = this.golbats.find((v) => v.end && !v.end.landed && Math.abs(v.end.x - h.x) < 58 && Math.abs(v.end.y - h.y) < 58);
      if (g && h.n > 6) {
        h.got = true;
        const z = this.golbats.indexOf(g);
        this.sparkle(h.x, h.y, COLOURS[z]);
        this.emit("got", z, pan(h.x));
      }
    }
    this.jynxHearts = this.jynxHearts.filter((h) => (h.got ? h.gotN < 6 : h.x > -R.EDGE));
  }

  // ---- the end ----
  results() {
    const places = this.places();
    return [0, 1, 2, 3].map((i) => ({ i, score: this.scores ? this.scores[i] : this.heartsOf(i), place: places[i] }))
      .sort((a, b) => a.place - b.place || a.i - b.i);
  }
  celebrate() { return this.results(); }
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

// the players' colours (sparkles: 0x861061B0)
export const COLOURS = [0x8080ff, 0x60ff60, 0xff6060, 0xffff40];

// a sound's pan from a Golbat's x (0x86100020: across where Golbat can go, -64-63 about the middle)
export function pan(x) {
  const v = Math.trunc(((x - R.X_MIN) / (R.X_MAX - R.X_MIN)) * 127) - 63 - 1;
  return Math.max(0, Math.min(127, 64 + Math.max(-128, Math.min(127, v))));
}

// the camera: the game's own, looking at the screen's middle
export const CAMERA = { eye: [0, 0, EYE], at: [0, 0, 0], fov: FOV };
