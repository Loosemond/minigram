// An Egg Emergency round: the rules (rules.js) on the round's clock, and the
// scene they drive. The rules run 30 frames a second, as the game's do; the
// scene is drawn between the last two of them, so it moves at any rate.
//
// From GO, 31 frames on the song starts and the frame after the play does
// (its frame 1, 0x86806E94). Each frame the drops come (the deal, the same
// for everyone), then each player's Chansey leans, catches and gets hurt
// (a Seat each). Once all 100 eggs have come and everything's gone, 5 frames on
// 0xCF06 sounds, and 31 frames on the round's over (0x868058C0): the winners
// cheer and throw their eggs up, the others sit back, and over a Chansey with
// all 100 PERFECT pulses (0x86804C5C, 0x86806CD8).
//
// Who plays each seat: "local" (this device's player), "cpu", or "remote"
// (someone on another device, online). The seats this device plays emit
// "lean" (seat, lean -1 / 0 / 1, frame) as the lean held changes (a CPU's: as
// its code leaves it) and "result" on every catch and Voltorb hit, for sending
// on. A remote seat runs a little behind the others (setup.delay, then as late
// as its leans come: src/lag.js), so they get here before they're due; its
// Chansey runs on them here too, and the server's word on its drops
// (told()) sets its count, which is the one that counts. The rooms server runs
// every seat the same way from the same leans (tools/egg_rules.py).
import * as THREE from "three";
import * as R from "./rules.js";
import { makeChansey, makeEgg, makeVoltorb, setLayer } from "./assets.js";
import { Effects } from "./fx.js";
import { Lag, LAG } from "../lag.js";

// The stage is background picture 19 of the game, rebuilt in 3D (stage.js)
// to the picture's measurements: a building on a bridge, one bay per player
// between lamp poles at x = 13, 86, 159, 233 and 306 (73.25 px apart). Chansey
// stand on the grass along the top of the bridge (row 193 of 240); under the
// bridge, at the picture's bottom edge, is the water a missed egg falls into.
export const ZONE_W = 1.7; // distance between players
export const BACKDROP = { w: 320, h: 240, firstCentre: 49.6, feet: 193 };
export const PX = ZONE_W / 73.25; // world units per backdrop pixel
export const VIEW_TOP = BACKDROP.feet * PX; // where the picture's top edge is (y = 0 is the grass)
export const WATER_Y = -(BACKDROP.h - BACKDROP.feet) * PX; // its bottom edge
export const VIEW_BOTTOM = WATER_Y - 0.3; // and a strip of the water under the bridge
// The game's units in the scene: its players stand 16 U apart, the bays.
// The models are at the game's 0.17 (the glTF's units are 100 of the model's).
export const K = ZONE_W / (16 * R.U);
export const MODEL = R.SCALE * 100 * K;
export const COL_X = R.SIDE_X * K; // the side columns, from the middle
export const CATCH_UP = (R.CATCH - R.FEET) * K; // the catch line, over Chansey's place (its feet)
const VOLTORB_SIZE = 24 * R.VOLTORB_SCALE * K;
const RED = new THREE.Color(1, 0, 0); // a hurt Chansey's colour (0x8680649C), half over it (0x86802610)
const HURT_RED = 0x80 / 255;
const ONE = 0x10000;

export function zoneX(i) { return (i - 1.5) * ZONE_W; }

export class Game {
  constructor(scene, assets) {
    this.scene = scene;
    this.assets = assets;
    this.feet = measureFeet(assets);
    this.fx = new Effects(scene, assets, (v, z, x, y, zz) => this.place(v, x, y, zz), K, MODEL);
    this.chansey = [0, 1, 2, 3].map((z) => {
      const c = makeChansey(assets, MODEL);
      c.root.position.set(zoneX(z), this.feet, 0);
      setLayer(c.root, z + 1);
      scene.add(c.root);
      return c;
    });
    this.pool = { e: [], v: [] };
    this.shown = [0, 1, 2, 3].map(() => new Map()); // each seat's drops on show: row -> object
    this.listeners = {};
    this.idleT = 0; // frames of the countdown's idling (and the title's)
    this.held = 0; // this device's player's lean (index.js)
    this.catchingUp = false; // (index.js: the shell's running the round on to where it is)
    this.reset("normal");
    this.state = "idle";
  }
  on(name, fn) { (this.listeners[name] ||= []).push(fn); }
  emit(name, ...args) { for (const fn of this.listeners[name] || []) fn(...args); }

  // a place of the game's (its x, y, z) in the scene
  place(v, x, y, z) { return v.set(x * K, this.feet + (y - R.FEET) * K, z * K); }

  // setup: { me: this device's seat, control: per seat, delay: s per seat, cpus:
  // which seats are CPUs (online: the room's), start: the server's word on the
  // round, { c, human, leans: each seat's so far, ups, f: the frame it's at
  // (rejoining) }, fixed and a: a short deal (the tests) }
  reset(level, seed = (Math.random() * 2 ** 31) | 0, setup = {}) {
    for (let z = 0; z < 4; z++) this.hideDrops(z, 0);
    this.fx.clear();
    this.level = level;
    this.seed = seed;
    this.setup = setup;
    this.me = setup.me ?? 0;
    this.control = setup.control || [0, 1, 2, 3].map((z) => (z === this.me ? "local" : "cpu"));
    this.cpus = setup.cpus || this.control.map((c) => c === "cpu");
    const start = setup.start;
    this.c = start?.c ?? R.levelCode(level, this.cpus.some(Boolean));
    this.allHuman = start ? !!start.human : !this.cpus.some(Boolean);
    this.ups = new Set(start?.ups || []); // the server's speed-ups
    this.deal = this.makeDeal();
    this.logs = [0, 1, 2, 3].map((z) => (start?.leans?.[z] || []).map(([f, l]) => [f, l])); // each seat's leans: [frame, lean]
    this.liveFrom = start?.f ?? 0; // (rejoining: till this frame, the leans are the server's)
    this.special = R.specialCpu(seed, this.cpus);
    this.seats = [0, 1, 2, 3].map((z) => new R.Seat(z, (what, row, lost) => this.event(z, what, row, lost)));
    this.seats.forEach((s, z) => { if (this.control[z] === "cpu") s.brain = this.brain(z); });
    this.delay = this.control.map((c, z) => (c === "remote" ? setup.delay?.[z] ?? LAG.fallback : 0));
    this.lag = this.delay.map((d, z) => (this.control[z] === "remote" ? new Lag(d) : null));
    this.sent = [null, null, null, null];
    this.outcomes = [0, 1, 2, 3].map(() => new Map()); // drop -> { k, e }, as judged here
    this.word = [0, 1, 2, 3].map(() => new Map()); // and the server's word, if it comes before that
    this.ledger = [0, 1, 2, 3].map(() => []); // each seat's catches and hits here: { f, d (eggs) }
    this.tint = [0, 1, 2, 3].map(() => [0, 0]); // the red, [was, now]
    this.idle = [0, 1, 2, 3].map(() => Math.floor(Math.random() * 10)); // (their idling, from frame rand2 % 10: 0x8680649C)
    this.images = [0, 1, 2, 3].map(() => new Map()); // each Voltorb's picture
    this.voltorbs = 0; // their count, going up as each is drawn (0x86800298)
    this.cheer = null;
    this.endCount = 0;
    this.ended = false;
    this.iter = -1; // the last frame from GO this device has run
    this.frameSounds = new Set();
    this.time = 0;
    this.state = "ready";
    this.draw();
  }
  makeDeal() {
    const s = this.setup || {};
    return new R.Deal(this.seed, this.c, {
      allHuman: this.allHuman, fixed: s.fixed, a: s.a,
      decide: this.allHuman ? (f) => this.ups.has(f) : null,
    });
  }
  brain(z) { return new R.Brain(z, R.levelCode(this.level, true), this.seed, z === this.special); }
  start() { this.state = "play"; this.time = 0; }
  stop() { this.state = "over"; this.ended = true; }
  // a seat changes hands mid-round, e.g. a CPU takes over from someone who left
  setControl(z, c) {
    if (this.control[z] === c) return;
    this.control[z] = c;
    this.lag[z] = c === "remote" ? new Lag(this.delay[z], LAG.fallback) : null; // (from where it is: it eases back)
    if (c !== "remote") this.delay[z] = 0;
    this.seats[z].brain = c === "cpu" ? this.brain(z) : null;
    this.sent[z] = c === "cpu" ? R.SIDE_OF_LEAN[this.seats[z].called] ?? null : null;
  }
  // seat z's frame now (fractional: between frames)
  frameOf(z) { return (this.time - this.delay[z]) * R.FPS - (R.PLAY_AT - 1); }
  get frame() { return Math.max(0, this.iter - (R.PLAY_AT - 1)); }
  get players() { return this.seats; }
  get drops() { return this.deal.drops; }
  get eggsLeft() { return this.deal.lefts[Math.min(this.deal.f, this.frame)] ?? R.EGGS; }

  // ---- leans ----
  // seat z's lean at frame g from its log (the game's 1-3; 0: none yet)
  logLean(z, g) {
    const log = this.logs[z];
    for (let k = log.length - 1; k >= 0; k--) if (log[k][0] <= g) return R.LEAN[log[k][1]];
    return 0;
  }
  remoteLean(z, f, l) { // from another device, through the server
    if (this.control[z] !== "remote" || !Number.isInteger(f) || !(l in R.LEAN)) return;
    this.lag[z]?.heard(this.time - (f + R.PLAY_AT - 1) / R.FPS);
    const log = this.logs[z];
    let k = log.length;
    while (k > 0 && log[k - 1][0] > f) k--;
    log.splice(k, 0, [f, l]);
  }
  // the server's speed-ups (no CPUs): if this device's deal went by one, it's dealt again
  serverUps(ups) {
    const had = this.ups.size;
    for (const f of ups || []) if (Number.isInteger(f)) this.ups.add(f);
    if (this.ups.size === had) return;
    const d = this.deal, missed = [...this.ups].some((f) => f <= d.f && !d.ups.includes(f));
    if (missed) this.redeal();
  }
  redeal() {
    const old = this.deal, deal = this.makeDeal();
    while (deal.f < old.f) deal.step();
    let i = 0;
    const same = (a, b) => a.f === b.f && a.code === b.code && a.kind === b.kind;
    while (i < old.rows.length && i < deal.rows.length && same(old.rows[i], deal.rows[i])) i++;
    this.deal = deal;
    for (let z = 0; z < 4; z++) {
      this.hideDrops(z, i);
      for (const r of [...this.seats[z].judged.keys()]) if (r >= i) this.seats[z].judged.delete(r);
      for (const r of [...this.seats[z].caught]) if (r >= i) this.seats[z].caught.delete(r);
    }
  }

  // ---- the server's word ----
  // what seat z's drop n came to: { k: "c" (caught), "h" (a Voltorb's hit) or
  // "m" (nothing), e: the eggs then, g: its frame }. If it isn't what this
  // device made it, the count's the server's, and what's happened here since
  told(z, n, r) {
    if (this.state === "idle" || !(z >= 0 && z < 4) || !Number.isInteger(n) || !Number.isFinite(r.e) || !Number.isFinite(r.g)) return;
    if (r.k !== "m") this.lag[z]?.heard(this.time - (r.g + R.PLAY_AT - 1) / R.FPS);
    const mine = this.outcomes[z].get(n);
    if (!mine) { this.word[z].set(n, r); return; }
    // (for its own seats the server only says when it disagrees: its count, at its frame g)
    if (mine.k === r.k && mine.e === r.e && this.control[z] === "remote") return;
    let since = 0;
    for (const x of this.ledger[z]) if (x.f > r.g) since += x.d;
    this.seats[z].eggs = Math.max(0, r.e + since);
    mine.k = r.k;
    mine.e = r.e;
  }

  // ---- the round ----
  update(dt) {
    this.idleT += dt * R.FPS;
    if (this.state === "play" || this.state === "over") {
      this.time += dt;
      for (let z = 0; z < 4; z++) if (this.lag[z]) this.delay[z] = this.lag[z].step(dt);
      const now = Math.floor(this.time * R.FPS + 1e-6);
      while (this.iter < now) this.tick(++this.iter);
      // the other devices' players, a little behind
      for (let z = 0; z < 4; z++) {
        if (this.control[z] !== "remote") continue;
        const to = Math.min(this.frame, Math.floor(this.frameOf(z) + 1e-6));
        while (this.seats[z].f < to && !this.ended) this.stepSeat(z, this.seats[z].f + 1);
      }
    }
    this.draw();
  }
  sound(name, z) {
    if (this.frameSounds.has(name)) return; // (each once a frame, for the first that has it)
    this.frameSounds.add(name);
    this.emit("sound", name, z);
  }
  // frame i from GO
  tick(i) {
    this.frameSounds.clear();
    if (i === R.SONG_AT) this.emit("song");
    const g = i - (R.PLAY_AT - 1);
    if (this.ended) { this.cheerFrame(); return; }
    if (g < 1) return;
    if (this.deal.f < g) this.deal.step();
    for (let z = 0; z < 4; z++) if (this.control[z] !== "remote") while (this.seats[z].f < g) this.stepSeat(z, this.seats[z].f + 1);
    this.countVoltorbs();
    // once all the eggs have come and everything's gone (0x868058C0)
    const clear = this.seats.every((s, z) => this.deal.clear(s.f) && !this.fx.lostOn(z));
    if (this.deal.left > 0) this.endCount = 0;
    else if (clear) this.endCount++;
    if (this.endCount === R.END_SOUND) this.sound("end", null);
    if (this.endCount >= R.END_AT && this.state === "play") {
      this.ended = true;
      this.state = "over";
      this.emit("finish");
    }
  }
  // seat z's frame g
  stepSeat(z, g) {
    const seat = this.seats[z], fx = this.fx, ctl = this.control[z], live = this.live(g);
    if (g === 1) seat.frame = (this.idle[z] + Math.floor(this.idleT)) % R.CLIP_FRAMES[1] * ONE; // (idling on)
    fx.stepSplashes(z);
    fx.stepLost(z, false);
    let input = 0;
    if (ctl === "local" && live) input = R.LEAN[this.held] ?? 2;
    else if (ctl !== "cpu" || !live) input = this.logLean(z, g);
    const brain = seat.brain;
    if (brain && !live) { brain.think({ lean: 0 }, g, this.deal); seat.brain = null; } // (its moves were the server's)
    seat.step(g, this.deal, input);
    seat.brain = brain;
    fx.dropLost(z);
    fx.spark(z, seat.hurt);
    this.tint[z] = [this.tint[z][1], seat.hurt ? HURT_RED : 0];
  }
  // frame g is played here as it comes (not run again from the leans so far:
  // rejoining, or catching up after a hiccup)
  live(g) { return g > this.liveFrom && !this.catchingUp; }
  // seat z's lean for frame g, if this device plays it and it's changed: out
  // before anything it catches on the frame (the server runs it to there)
  sendLean(z, g) {
    const ctl = this.control[z];
    if (!this.live(g) || (ctl !== "local" && ctl !== "cpu")) return;
    const l = ctl === "local" ? this.held : R.SIDE_OF_LEAN[this.seats[z].called];
    if (l === undefined || l === this.sent[z]) return;
    this.sent[z] = l;
    this.logs[z].push([g, l]);
    this.emit("lean", z, l, g);
  }
  // what happens to seat z's drops (rules.js Seat)
  event(z, what, row, lost) {
    const seat = this.seats[z], g = seat.f;
    if (what === "called") { this.sendLean(z, g); return; }
    if (what === "splash") {
      this.fx.splash(z, R.CHANSEY_X[z] + row.side * R.SIDE_X, R.DROP_Z);
      this.sound("splash", 2); // (always on 3P's side: 0x86804A7C)
      return;
    }
    const k = what === "catch" ? "c" : what === "hit" ? "h" : "m";
    if (what === "catch") { this.sound("catch", z); this.emit("catch", z); }
    if (what === "hit") {
      if (lost) this.sound("lost", z);
      this.sound("shock", z);
      this.fx.knock(z, R.CHANSEY_X[z], lost, false);
      this.emit("hit", z, lost);
    }
    const mine = { k, e: seat.eggs };
    this.outcomes[z].set(row.n, mine);
    if (k !== "m") this.ledger[z].push({ f: g, d: k === "c" ? 1 : -lost });
    const said = this.word[z].get(row.n);
    if (said) { this.word[z].delete(row.n); this.told(z, row.n, said); }
    if (k !== "m" && this.live(g) && this.control[z] !== "remote") this.emit("result", { s: z, n: row.n, k, e: mine.e, g });
  }
  // Voltorb's picture: a count that goes up for each one drawn, a picture every 4 (0x86800298)
  countVoltorbs() {
    for (let z = 0; z < 4; z++) {
      const g = this.seats[z].f, last = this.deal.lastRow(g);
      for (let j = 0; j < R.SLOTS; j++) {
        const row = this.deal.slotRow(j, g, last);
        if (row?.kind !== "v" || row.gone <= g || this.seats[z].caught.has(row.i)) continue;
        this.voltorbs = this.voltorbs + 1 >= 21 ? 0 : this.voltorbs + 1;
        this.images[z].set(row.i, this.voltorbs >> 2);
      }
    }
  }

  // ---- the end (0x86804C5C): the most eggs cheer (clip 14), the rest sit back
  // (15), all four if they're level; PERFECT over all 100
  results() {
    const eggs = this.seats.map((s) => s.eggs);
    return [0, 1, 2, 3].map((i) => ({ i, score: eggs[i], place: 1 + eggs.filter((e) => e > eggs[i]).length }))
      .sort((a, b) => a.place - b.place || a.i - b.i);
  }
  celebrate() {
    const eggs = this.seats.map((s) => s.eggs), most = Math.max(...eggs);
    const won = eggs.map((e) => e === most), all = won.every(Boolean);
    this.cheer = this.seats.map((s, z) => {
      const clip = won[z] && !all ? R.CLIP.win : R.CLIP.lose;
      s.state = clip;
      s.clip = -1;
      s.play(clip);
      this.tint[z] = [0, 0];
      this.fx.spark(z, false);
      this.fx.perfect(z, eggs[z] === R.EGGS);
      return { n: 0 };
    });
    this.hideAll();
    return this.results();
  }
  // a frame of the cheering (0x86806CD8)
  cheerFrame() {
    if (!this.cheer) return;
    this.fx.stepPerfect();
    this.seats.forEach((s, z) => {
      const c = this.cheer[z];
      s.advance();
      this.fx.stepSplashes(z);
      c.n++;
      if (s.ended()) {
        if (s.state === R.CLIP.lose) { c.n = 49; s.frame = 49 * ONE - s.speed; }
        if (s.state === R.CLIP.win) { s.play(R.CLIP.win); s.frame = 14 * ONE - s.speed; c.n = 14; }
      }
      if (s.state !== R.CLIP.win) return;
      if (s.frame >> 16 === 37) { // its throw
        this.sound("lost", z);
        this.fx.clearSplashes(z);
        this.fx.knock(z, R.CHANSEY_X[z], Math.min(s.eggs, R.LOSS), true);
      }
      if (this.fx.stepLost(z, true)) this.sound("splash", z);
      if (c.n >= 70) { s.play(R.CLIP.win); s.frame = 14 * ONE - s.speed; c.n = 14; }
    });
  }

  // ---- the scene ----
  draw() {
    const playing = this.state === "play" || this.state === "over";
    for (let z = 0; z < 4; z++) {
      const seat = this.seats[z], ch = this.chansey[z];
      const k = playing && !this.ended ? Math.max(0, Math.min(1, this.frameOf(z) - seat.f)) : this.ended ? Math.max(0, Math.min(1, this.time * R.FPS - this.iter)) : 1;
      // Chansey: idling till its play starts, then its clip, between its last two frames
      if (!playing || seat.f === 0) ch.pose(R.CLIP.idle, (this.idle[z] + this.idleT) % R.CLIP_FRAMES[1]);
      else {
        const n = R.CLIP_FRAMES[seat.clip], f = seat.frame / ONE - (seat.speed / ONE) * (1 - k);
        ch.pose(seat.clip, seat.clip <= 3 ? ((f % n) + n) % n : Math.max(0, Math.min(n - 1, f)));
      }
      const [was, now] = this.tint[z];
      ch.tint(RED, was + (now - was) * k);
      if (playing && !this.ended) this.drawDrops(z, k);
      this.fx.draw(z, k, R.CHANSEY_X[z], ch.headY());
    }
  }
  // seat z's drops between its last two frames (k): from 550 down to -470, unless caught
  drawDrops(z, k) {
    const seat = this.seats[z], g = seat.f, shown = this.shown[z], seen = new Set();
    for (let i = this.deal.lastRow(g); i >= 0; i--) {
      const row = this.deal.rows[i];
      if (row.gone + 60 < g) break;
      if (!row.kind || row.gone <= g || seat.caught.has(row.i)) continue;
      seen.add(row.i);
      let o = shown.get(row.i);
      if (!o) {
        o = this.pool[row.kind].pop() || (row.kind === "e" ? makeEgg(this.assets, MODEL) : makeVoltorb(this.assets, VOLTORB_SIZE));
        setLayer(o, z + 1);
        this.scene.add(o);
        shown.set(row.i, o);
        o.userData.kind = row.kind;
      }
      const steps = g - row.f + k, n = Math.floor(steps), ys = row.ys;
      const y = ys[Math.min(ys.length - 1, n)] + (ys[Math.min(ys.length - 1, n + 1)] - ys[Math.min(ys.length - 1, n)]) * (steps - n);
      this.place(o.position, R.CHANSEY_X[z] + row.side * R.SIDE_X, y, R.DROP_Z);
      if (row.kind === "e") { // its spin, back to 0 as it gets to the hands (0x868051E8)
        const a = ((row.spin * (steps - this.deal.turn)) / 65536) * 2 * Math.PI;
        o.rotation.set(a, a, a);
      } else o.material.map = this.assets.voltorb[this.images[z].get(row.i) ?? 0];
    }
    for (const [i] of shown) if (!seen.has(i)) this.hideDrops(z, i, i + 1);
  }
  // put away seat z's drop objects for rows from i (to end)
  hideDrops(z, i, end = Infinity) {
    for (const [r, o] of this.shown[z]) {
      if (r < i || r >= end) continue;
      this.scene.remove(o);
      this.pool[o.userData.kind].push(o);
      this.shown[z].delete(r);
    }
  }
  hideAll() { for (let z = 0; z < 4; z++) this.hideDrops(z, 0); }
}

// how far the rig's origin is above Chansey's feet, in world units
function measureFeet(assets) {
  const c = makeChansey(assets, MODEL);
  c.pose(R.CLIP.idle, 0);
  c.root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(c.root, true);
  return -box.min.y;
}
