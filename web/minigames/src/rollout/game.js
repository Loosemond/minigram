// A Rampage Rollout race: the world (rules.js) on the round's clock, and the
// scene it drives. The track lies in the plane y = 0 (the world's x and y are
// the scene's x and z), seen as the game sees it: from (0, 1049.5, 553)
// towards (0, 30, 30), fov 30. In the game's units.
//
// Who plays each seat: "local" (this device's player), "cpu" or "remote"
// (someone on another device, online). The CPUs think in the world, so every
// device runs them alike. This device's player's pad emits "send" as it
// changes (the D-pad held, and an A press), for a few frames on (src/lag.js:
// online, so it gets to the others first); online, the others' come in
// told("pad"), sometimes late: the world runs on guessing they held their
// D-pad and didn't press A, and runs again from a saved frame when one comes
// in (the Donphan eased to where they really are). The server runs the same
// world and says how it ended (told("won")). Once it's over the world runs on
// for the game's show (rules.js coast(): each stops, the winners cheer, the
// others slump and walk off), under the shell's winners' banner.
//
// The world runs at the game's 30 frames a second; everything is drawn
// between its last two frames (a frame behind), so nothing steps at 30: the
// Donphan, the camera, the dust, the clouds' fades, the stars' spin, the
// FINAL LAP! colours and the HUD's moves (src/rollout/index.js).
import * as THREE from "three";
import { makeModel, piece } from "./assets.js";
import * as R from "./rules.js";
import { leadFor } from "../lag.js";
import { makeBadge } from "../badge.js";

// frames after the race is over before the round is: none, the game calls its
// results (module #64's winners' banner) on the frame the race is over
// (0x8640687C); its show goes on under them
export const AFTER = 0;
const DONPHAN = 0.04; // Donphan's scale (0x864057E0)
const TRACK = 0.37; // the track's (0x86405BEC)
// the cameras (0x86407330, 0x86407290): on the grid in the countdown; once the
// Donphan are on it, over the track in 80 frames (the play's); at the end, as
// 1P's Donphan stops, to the winners in 60 (0x86405138)
export const CAMERA = { eye: [0, 1049.5, 553], at: [0, 30, 30], fov: 30 };
const START_CAMERA = { eye: [120, 430, 40], at: [120, 0, -210] };
const CAMERA_FOR = 80, END_CAMERA_FOR = 60;
// Donphan's clips (0x86404A0C): walking, 0 standing, 1 running, 2 a winner's
// cheer, 3 a loser's slump; rolling, 4. At the end (0x86404C20) each stands
// till it stops, then cheers (76 frames, round and round) or slumps (71 frames,
// then its frames 50-70 over and over: the game sets the clip's loop start to
// 50, 0x86404CFC); the cheer's sound at its frame 4, its first two times round,
// the slump's at its frame 15
const CLIP = { stand: 0, run: 1, cheer: 2, slump: 3, roll: 4 };
const CHEER_FOR = 76, SLUMP_FOR = 71, SLUMP_LOOP = 50, CHEER_AT = 4, CHEERS = 2, SLUMP_AT = 15;
const INTRO = 80; // the countdown's frames (module #64's: 20 a step, GO on the 4th: 0x87F00050)
const SNAP = 6; // frames between the world's saved states (for running it again)
const KEEP = 20 * R.FPS; // and how far back they go
const SMOOTH = 0.88; // a corrected Donphan's ease to where it is, a 60th of a second
// the pictures: a cloud (32 x 32, at 2.5: 0x864012A0), a star (24 x 20, at 1.5:
// 0x8640912C, 110 over a Donphan, 30 apart), a shadow (16 x 16: 2.53 across,
// 5.28 along; round, rolling: 0x86407CE0), the dust (a 64-square, 0x86409880)
const CLOUD = 32 * 2.5, STAR = [24 * 1.5, 20 * 1.5], SHADOW = [16 * 2.5344, 16 * 5.28];
const KNOCKED_RED = new THREE.Color(0xff6464);
const DUST = 64, DUST_FOR = 6, DUST_COLOURS = [0x8c8cc8, 0x8cc88c, 0xdc8c8c, 0xdc8c8c], SAND = 0xc8aa82; // (4P's: 3P's, as the game has it)
// the stars (0x86408D4C): popping up from 3 to 1.5 in 10 frames, fading in 10;
// turning 0xFFF a frame while they're on, and another 0xFFF as they fade
const STAR_FOR = 10, SPIN = 0xfff;
// the badge over each (module #64's label: image bank 434, 1P-4P or a CPU's COM
// in its colour), 75 over it at 1.5, its alpha 0xAF (0x86405AE4-0x86405B7C);
// gone once it's stopped at the end (0x8640551C)
const LABEL_Y = 75, LABEL = { scale: 1.5, opacity: 0xaf / 255 };
// the music (0x86408CA0, 0x86408C1C): song 34 31 frames after GO; on the
// leader's final lap the song fades over 30 frames, and song 100 (34, 17 beats
// a minute faster) starts 31 frames on
const SONG_AT = 31, FADE = 30, SONG_AFTER = 31;
// FINAL LAP!'s colour (0x86408334): each frame a tenth of the way from the last
// colour to the next; every 10 frames a new random one (from white, white)
const FLASH_FOR = 10;

export class Game {
  constructor(scene, assets) {
    this.scene = scene;
    this.assets = assets;
    this.listeners = {};
    const add = (o) => { scene.add(o); return o; };
    add(piece(assets.field, TRACK));
    add(piece(assets.frame, TRACK));
    const flat = (map, w, h, color, opacity) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map, color, transparent: true, opacity, depthWrite: false }));
      m.rotation.x = -Math.PI / 2;
      m.renderOrder = 1;
      return m;
    };
    // the Donphan: walking and rolling, a shadow, a badge, and a star for each cloud it has
    this.donphan = [0, 1, 2, 3].map((z) => {
      const root = add(new THREE.Group());
      const v = { root, walk: makeModel(assets.donphan, DONPHAN), roll: makeModel(assets.donphan_rolling, DONPHAN) };
      root.add(v.walk.root, v.roll.root);
      v.shadow = add(new THREE.Group());
      v.shadow.add(flat(assets.shadow, 16, 16, 0x000000, 0x80 / 255));
      v.label = add(makeBadge(assets.badges, LABEL));
      v.stars = [0, 1, 2].map(() => {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: assets["star" + z], transparent: true, depthWrite: false }));
        s.renderOrder = 2;
        add(s);
        return { s, on: false, pop: false, fade: false, t: 0, rot: 0, now: [0, 1, 0], was: [0, 1, 0] };
      });
      v.anim = Math.random() * 6;
      return v;
    });
    // the clouds, by the world's ids, and the dust
    this.flat = flat;
    this.cloudViews = new Map();
    this.freeClouds = [];
    this.dust = [];
    this.rolling = [false, false, false, false];
    this.reset("normal");
    this.state = "idle";
  }
  on(name, fn) { (this.listeners[name] ||= []).push(fn); }
  emit(name, ...args) { for (const fn of this.listeners[name] || []) fn(...args); }

  // A race. level: easy / normal / hard; setup: { me, control, cpus (which
  // seats are CPUs), told (online, the server's word so far: to rejoin it
  // midway), delay (each seat's, src/lag.js) }
  reset(level, seed = (Math.random() * 2 ** 31) | 0, setup = {}) {
    this.levelName = level;
    this.seed = seed;
    this.me = setup.me ?? 0;
    this.control = setup.control || [0, 1, 2, 3].map((z) => (z === this.me ? "local" : "cpu"));
    this.cpus = setup.cpus || this.control.map((c) => c === "cpu");
    // (online, with other people: this device's player's pads count this many frames on, src/lag.js)
    this.lead = leadFor(this.control.map((c, z) => c === "remote" && !this.cpus[z]), setup.delay);
    this.world = new R.World(seed, level, this.cpus);
    this.grid = this.world.d.map((d) => d.slot * 37.12 + 116); // (where they start running in from)
    this.inputs = [[], [], [], []]; // each person's pad: [frame, D-pad, A 0/1]
    this.snaps = [[0, this.world.save()]]; // the world as it was before a frame
    this.simT = -1; // the last frame the world has run
    this.shownT = -1; // and whose sounds (and the like) have gone
    this.dpad = 0; // this device's player's D-pad (R.UP | R.DOWN | R.LEFT | R.RIGHT)...
    this.presses = 0; // ...its A presses not yet in a frame...
    this.early = false; // ...and A in the countdown (a false start: no rocket start)
    this.lastPad = 0;
    this.result = null; // the server's word on the end: { f, fin, p }
    this.scores = null;
    this.time = 0;
    this.state = "ready";
    this.lastFrame = -1;
    this.intro = 0; // frames since the countdown started
    this.endAt = null; // when the end began (s of this.time)
    this.winners = null;
    this.camTo = null; // the end's camera move: { f (its first frame), eye, at }
    this.before = null; // where things were before the last frame (to draw between)
    this.offsets = [0, 1, 2, 3].map(() => [0, 0, 0]);
    for (let z = 0; z < 4; z++) this.hold(z, false);
    this.tune = null; // the song the game has on: { key, name, fade } (index.js plays it)
    this.tuneAt = null; // [frame, name]: the next
    this.flash = { n: 0, from: [255, 255, 255], to: [255, 255, 255], was: [255, 255, 255], now: [255, 255, 255], on: false };
    for (const [, v] of this.cloudViews) this.freeCloud(v);
    this.cloudViews.clear();
    for (const p of this.dust) { p.sprite.visible = false; p.life = 0; }
    this.donphan.forEach((v, z) => {
      v.label.seat(z, this.cpus[z]);
      for (const st of v.stars) Object.assign(st, { on: false, pop: false, fade: false, t: 0, now: [0, 1, 0], was: [0, 1, 0] });
    });
    const told = setup.told;
    if (told?.pads) told.pads.forEach((list, z) => { if (list && !this.cpus[z]) this.inputs[z] = list.map((e) => [...e]); });
    if (told?.done) this.told("won", told.done);
    this.draw(0);
  }
  start() { this.state = "play"; this.intro = INTRO; }
  stop() { this.state = "over"; }
  setControl(z, c) {
    if (c === "cpu" && !this.cpus[z]) return; // (a person who left: their Donphan runs on by itself)
    this.control[z] = c;
  }

  get frame() { return Math.floor(this.time * R.FPS + 1e-6); }
  // the frame drawn (fractional: between the last two the world has run, a frame behind)
  get shown() { return this.state === "play" || this.state === "over" ? this.time * R.FPS - 1 : -1; }

  // ---- input ----
  // this device's player: the D-pad held (R.UP | R.DOWN | R.LEFT | R.RIGHT), and A
  setDpad(bits) { this.dpad = bits & 15; }
  press() {
    if (this.state === "ready") this.early = true; // (before GO: no rocket start)
    else if (this.state === "play") this.presses = Math.min(2, this.presses + 1);
  }
  // seat z's pad on frame t: [D-pad, A]
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
  // own, o: the frame it said), or the end ("won": { f, fin: each one's frame
  // in (or null), p: their places })
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
      if (!Number.isInteger(m.f) || !Array.isArray(m.p) || !Array.isArray(m.fin)) return;
      this.result = {
        f: m.f,
        fin: [0, 1, 2, 3].map((z) => (Number.isInteger(m.fin[z]) ? m.fin[z] : null)),
        p: [0, 1, 2, 3].map((z) => (Number.isInteger(m.p[z]) ? m.p[z] : 4)),
      };
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
  positions() { return this.world.d.map((d) => [d.x, d.h, d.y]); }
  // run the world up to frame t
  runTo(t) {
    const w = this.world;
    while (this.simT < t) {
      const f = this.simT + 1;
      if (w.end === null && f % SNAP === 0 && f > this.snaps[this.snaps.length - 1][0]) {
        this.snaps.push([f, w.save()]);
        while (this.snaps.length > 2 && this.snaps[1][0] < f - KEEP) this.snaps.shift();
      }
      if (f === t) this.before = this.positions();
      w.step(f, [0, 1, 2, 3].map((z) => (this.cpus[z] ? null : this.padAt(z, f))));
      this.simT = f;
      if (f > this.shownT) { this.sounds(f); this.shownT = f; }
      w.events = [];
      if (this.was && f === this.was.t) { // (run again to where it was: ease them from there)
        w.d.forEach((d, z) => {
          this.offsets[z][0] += this.was.at[z][0] - d.x;
          this.offsets[z][1] += this.was.at[z][1] - d.h;
          this.offsets[z][2] += this.was.at[z][2] - d.y;
        });
        this.was = null;
      }
    }
  }
  // frame f's sounds (once each), and what the scene keeps frame by frame: the
  // camera's move, the stars, the dust kicked up (0x86401DBC), the song, FINAL LAP!'s colour
  sounds(f) {
    const w = this.world;
    for (const e of w.events) {
      const [what, z] = e;
      if (what === "camera") { this.camTo = { f, eye: [e[1] - 200, e[2] + 450, e[3] + 80], at: [e[1] + 90, e[2] - 40, e[3]] }; continue; }
      if (what === "stars") { this.donphan[z].stars.forEach((st, k) => { if (k < w.d[z].clouds) this.popStar(st); }); continue; }
      if (what === "final" && w.end === null) { this.tune = { key: "fade" + f, name: null, fade: FADE }; this.tuneAt = [f + SONG_AFTER, "final"]; }
      if (what === "halt") continue; // (its sounds come with its clip, below)
      this.emit(what, z, this.pan(w.d[z].x), e[2]);
    }
    // the song: 34 after GO, 100 after the final lap's fade
    if (w.end === null) {
      if (f === SONG_AT && !this.tune) this.tune = { key: "main", name: "main" };
      if (this.tuneAt && f >= this.tuneAt[0]) { this.tune = { key: this.tuneAt[1] + f, name: this.tuneAt[1] }; this.tuneAt = null; }
    }
    // rolling, asked for each frame a Donphan rolls (0x5001: each one's own, on its footsteps' channel)
    w.d.forEach((d, z) => this.hold(z, w.end === null && d.roll > 0 && !d.done));
    // at the end, as each one's clip comes round: a winner's cheer, twice, a loser's slump
    w.d.forEach((d, z) => {
      if (d.halt === null) return;
      const n = f - d.halt;
      if (d.won ? n % CHEER_FOR === CHEER_AT && n < CHEER_FOR * CHEERS : n === SLUMP_AT) this.emit(d.won ? "cheer" : "slump", z, this.pan(d.x));
    });
    // the stars (0x86408D4C)
    w.d.forEach((d, z) => this.donphan[z].stars.forEach((st, k) => this.starStep(st, k < d.clouds)));
    // the dust: each one on the ground kicks some up now and then, the faster the likelier
    for (const p of this.dust) if (p.life > 0) this.dustStep(p);
    for (const d of w.d) if (d.h <= 0 && Math.random() * R.SPEED < d.speed) this.kick(d, d.tumble ? 1 : d.boost > 0 ? 1.5 : 0.75);
    // FINAL LAP!, while the leader has fewer than 2 laps to go (0x86408328)
    const lead = w.d.find((d) => d.rank === 0), fl = this.flash;
    fl.was = fl.now;
    if (lead && lead.laps < 2) {
      if (!fl.on) { fl.on = true; fl.was = fl.now = mix(fl.from, fl.to, fl.n / FLASH_FOR); }
      if (++fl.n >= FLASH_FOR) {
        fl.n = 0;
        fl.from = fl.to;
        fl.to = [0, 0, 0].map(() => Math.floor(Math.random() * 256));
      }
      fl.now = mix(fl.from, fl.to, fl.n / FLASH_FOR);
    }
  }
  // a Donphan's rolling sound on or off (its own, panned to it as it goes)
  hold(z, on) {
    if (!on && !this.rolling[z]) return;
    this.rolling[z] = on;
    this.emit("hold", "roll", z, on, on ? this.pan(this.world.d[z].x) : 64);
  }
  // a sound's pan: where it is across the screen
  pan(x) { return Math.round(64 + Math.max(-63, Math.min(63, (x / 340) * 63))); }

  // ---- the race, frame by frame ----
  update(dt) {
    if (this.state === "ready") { // (the countdown: they run in to the grid, kicking up dust: 0x864055CC)
      const was = Math.floor(this.intro);
      this.intro += dt * R.FPS;
      for (let n = was + 1; n <= Math.min(Math.floor(this.intro), RUN_IN); n++) this.runInDust(n);
    }
    if (this.state === "play" || this.state === "over") { // (and on, over: the show)
      this.time += dt;
      const now = this.frame;
      for (let t = this.lastFrame + 1; t <= now; t++) { this.step(t); this.lastFrame = t; }
      this.runTo(this.lastFrame); // (after a pad that came in late)
      const end = this.endFrame();
      if (this.state === "play" && end !== null && this.frame >= end + AFTER) { this.state = "over"; this.emit("finish"); }
    }
    const ended = this.world.end !== null || (this.result && this.lastFrame >= this.result.f);
    if (ended && this.endAt === null) this.ending();
    this.animate(dt);
  }
  // the frame the race ended on: the server's, else this device's world's
  endFrame() { return this.result ? this.result.f : this.world.end; }

  // what happens on frame t (from GO): this device's player's pad is kept (and sent) for frame
  // t + lead, and the world runs
  step(t) {
    const me = this.me, f = t + this.lead;
    if (this.control[me] === "local" && !this.cpus[me] && this.world.end === null) {
      const a = this.presses > 0 ? 1 : 0;
      if (a) this.presses--;
      const x = this.dpad | (this.early ? 16 : 0);
      if (x !== this.lastPad || a || t === 0 && this.early) {
        this.inputs[me].push([f, x, a, f]); // ([frame, D-pad, A, the frame it was sent for])
        this.lastPad = x;
        this.emit("send", { s: me, f, x, a });
      }
      this.early = false;
    }
    this.runTo(t);
  }
  over() { return this.state === "over"; }

  // each one's place (1-4): the server's once it's said, else the world's
  places() { return this.result ? this.result.p : this.world.places; }
  // the lap each is on (1-9), for the cards
  lapOf(z) { const d = this.world.d[z]; return Math.min(R.LAPS, R.LAPS - d.laps + 1); }
  // the frame each came in on (null: not in)
  finOf(z) { return this.result ? this.result.fin[z] : this.world.d[z].fin; }
  // a time in hundredths of a second (the cards' and the results'), or null
  timeOf(z) { const f = this.finOf(z); return f === null ? null : Math.round((f * 100) / R.FPS); }
  // the frame the first one got in on (the LAP sign goes then), or null
  firstIn() {
    let f = null;
    for (let z = 0; z < 4; z++) { const x = this.finOf(z); if (x !== null && (f === null || x < f)) f = x; }
    return f;
  }
  // FINAL LAP!'s colour, as drawn ([r, g, b]), or null when it's not on
  finalColour() {
    const fl = this.flash;
    return fl.on ? mix(fl.was, fl.now, this.between()) : null;
  }

  // ---- the end: the show's in the world (rules.js coast()) and its clips (draw()) ----
  ending() {
    this.endAt = this.time;
    for (let z = 0; z < 4; z++) this.hold(z, false);
    this.winners = this.world.d.map((d) => d.won);
    this.emit("end", this.winners);
  }

  // ---- every rendered frame ----
  between() {
    return this.state === "play" || this.state === "over" ? Math.max(0, Math.min(1, this.time * R.FPS - this.lastFrame)) : 1;
  }
  animate(dt) {
    const k = Math.pow(SMOOTH, dt * 60);
    for (const o of this.offsets) { o[0] *= k; o[1] *= k; o[2] *= k; }
    this.draw(this.between(), dt);
  }
  // where the camera is: on the grid, over to the track, or to the winners
  camera() {
    const ease = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);
    const cos = (n, of) => (1 - Math.cos((Math.max(0, Math.min(n, of)) / of) * Math.PI)) / 2;
    if (this.camTo) {
      const k = cos(this.shown - this.camTo.f, END_CAMERA_FOR);
      return { eye: ease(CAMERA.eye, this.camTo.eye, k), at: ease(CAMERA.at, this.camTo.at, k) };
    }
    if (this.state === "idle") return CAMERA;
    // (the move starts once they're on the grid: 14 frames into the countdown)
    const n = this.intro + (this.state === "play" || this.state === "over" ? this.time * R.FPS : 0) - RUN_IN;
    if (n <= 0) return START_CAMERA;
    const k = cos(n, CAMERA_FOR);
    return { eye: ease(START_CAMERA.eye, CAMERA.eye, k), at: ease(START_CAMERA.at, CAMERA.at, k) };
  }

  draw(between, dt = 0) {
    const w = this.world, before = this.before, shown = this.shown;
    const lerp = (a, b) => a + (b - a) * between;
    const live = this.state === "play" || this.state === "over";
    w.d.forEach((d, z) => {
      const v = this.donphan[z];
      let x = d.x, h = d.h, y = d.y;
      if (!live) x = runIn(this.grid[z], this.state === "idle" ? 99 : this.intro); // (the countdown: running in to the grid)
      else {
        const was = before?.[z] || [x, h, y];
        x = lerp(was[0], x) + this.offsets[z][0];
        h = lerp(was[1], h) + this.offsets[z][1];
        y = lerp(was[2], y) + this.offsets[z][2];
      }
      v.root.position.set(x, Math.max(0, h), y);
      v.root.rotation.y = (d.rot / 0x10000) * 2 * Math.PI;
      const rolling = live && d.roll > 0 && !d.done && w.end === null;
      v.walk.root.visible = !rolling;
      v.roll.root.visible = rolling;
      const stopped = live && d.halt !== null && shown >= d.halt;
      let clip = CLIP.run, rate = 1;
      if (this.state === "idle") clip = CLIP.stand;
      else if (this.state === "ready") clip = this.intro < RUN_IN ? CLIP.run : CLIP.stand;
      else if (stopped) clip = d.won ? CLIP.cheer : CLIP.slump;
      else if (d.done || w.end !== null) clip = CLIP.stand;
      else if (d.knocked) rate = 2;
      const was = v.anim;
      v.anim += dt * R.FPS * rate;
      if (rolling) v.roll.pose(CLIP.roll, v.anim);
      else if (stopped) { // (from its stop: the cheer round and round; the slump, then its last 21 frames)
        const n = shown - d.halt;
        v.walk.pose(clip, d.won ? n % CHEER_FOR : n < SLUMP_FOR ? n : SLUMP_LOOP + ((n - SLUMP_FOR) % (SLUMP_FOR - SLUMP_LOOP)), true);
      } else v.walk.pose(clip, v.anim);
      // a footstep each time the run comes round (0x5F00), on the ground
      if (clip === CLIP.run && !rolling && this.state === "play" && h <= 0 && Math.floor(was / 6) !== Math.floor(v.anim / 6)) {
        this.emit("step", z, this.pan(x));
      }
      v.walk.tint(KNOCKED_RED, d.knocked && d.stun >= 18 ? 0.6 : 0); // (0x864028B8: red, its first frames)
      // its shadow (long, walking; round, rolling)
      v.shadow.position.set(x, 0.5, y);
      v.shadow.rotation.y = v.root.rotation.y;
      v.shadow.scale.set(SHADOW[0] / 16, 1, (rolling ? SHADOW[0] : SHADOW[1]) / 16);
      // its badge, over it till it stops at the end
      v.label.position.set(x, Math.max(0, h) + LABEL_Y, y);
      v.label.visible = this.state !== "idle" && !stopped;
      // a star for each cloud it has: popping up, or fading as it's dropped, turning (0x86408D4C)
      v.stars.forEach((st, k) => {
        const [rot, s, alpha] = [0, 1, 2].map((i) => st.was[i] + (st.now[i] - st.was[i]) * between);
        st.s.visible = live && alpha > 0;
        st.s.position.set(x - 30 + 30 * k, Math.max(0, h) + 110, y);
        st.s.scale.set(STAR[0] * s, STAR[1] * s, 1);
        st.s.material.opacity = alpha;
        st.s.material.rotation = (rot / 0x10000) * 2 * Math.PI;
      });
    });
    // the clouds: coming up, there, fading (0x86400DDC; drawn between frames too)
    const seen = new Set(), back = 1 - between;
    for (const c of w.clouds) {
      seen.add(c.id);
      const v = this.cloud(c);
      v.mesh.position.set(c.x, c.h, c.y);
      const t = c.timer - back;
      const a = c.phase === 0 ? (200 * Math.max(0, t)) / R.CLOUD_FOR[0] : c.phase === 1 ? 200 : 200 - (200 * t) / R.CLOUD_FOR[2];
      v.mesh.material.opacity = Math.max(0, Math.min(200, a)) / 255;
      v.map.offset.x = (c.frame % 16) / 16;
    }
    for (const [id, v] of this.cloudViews) if (!seen.has(id)) { this.freeCloud(v); this.cloudViews.delete(id); }
    // the dust (between its last two frames: the countdown's, or the world's)
    const k = live ? between : this.intro - Math.floor(this.intro);
    for (const p of this.dust) {
      if (p.life <= 0) { p.sprite.visible = false; continue; }
      const [x, h, y, s, rot, t] = p.now.map((n, i) => p.was[i] + (n - p.was[i]) * k);
      p.sprite.visible = true;
      p.sprite.position.set(x, h, y);
      p.sprite.scale.set(DUST * s, DUST * s, 1);
      p.sprite.material.opacity = Math.max(0, 1 - t / DUST_FOR);
      p.sprite.material.rotation = (rot / 0x10000) * 2 * Math.PI;
      p.map.offset.x = Math.floor((p.now[5] % 16) / 2) / 8; // (its picture: the game's, 2 frames each)
    }
  }
  // a cloud's picture, by the world's id: lying flat (as the game has it: the
  // camera looks down steeply enough that the whirlwind stands up)
  cloud(c) {
    let v = this.cloudViews.get(c.id);
    if (v) return v;
    v = this.freeClouds.pop();
    if (!v) {
      const maps = [0, 1, 2, 3].map((z) => {
        const m = this.assets["cloud" + z].clone();
        m.repeat.set(1 / 16, 1);
        m.needsUpdate = true;
        return m;
      });
      v = { maps, mesh: this.flat(maps[0], CLOUD, CLOUD, 0xffffff, 0) };
      this.scene.add(v.mesh);
    }
    v.map = v.maps[c.owner];
    v.mesh.material.map = v.map;
    v.mesh.visible = true;
    this.cloudViews.set(c.id, v);
    return v;
  }
  freeCloud(v) {
    v.mesh.visible = false;
    this.freeClouds.push(v);
  }

  // a star's frame (0x86408D4C): on as it's earned (popping), fading as its cloud's
  // dropped; [its turn, its size (of 1.5), its alpha] before and after
  starStep(st, want) {
    if (want && !st.on) this.popStar(st);
    else if (!want && st.on && !st.fade) Object.assign(st, { pop: false, fade: true, t: 0 }); // (0x864094BC)
    st.was = st.now;
    if (!st.on) return;
    let rot = st.now[0] + SPIN, s = st.now[1], alpha = 1;
    if (st.pop) { // (3 to 1.5: 2 to 1 of its size)
      if (st.t >= STAR_FOR + 1) st.pop = false;
      else s = 2 - st.t / STAR_FOR;
    }
    if (st.fade) {
      if (st.t >= STAR_FOR + 1) { st.on = st.fade = false; alpha = 0; } else { rot += SPIN; alpha = 1 - st.t / STAR_FOR; }
    }
    st.now = [rot, s, alpha];
    st.t++;
  }
  popStar(st) { Object.assign(st, { on: true, pop: true, fade: false, t: 0 }); } // (0x86409378: popping up, again if it's on)

  // the countdown's frame n (0x864055CC): the dust they kick up running in, as they slow
  runInDust(n) {
    for (const p of this.dust) if (p.life > 0) this.dustStep(p);
    this.world.d.forEach((d, z) => {
      const speed = runSpeed(n);
      if (Math.random() * R.SPEED < speed) this.kick({ x: runIn(this.grid[z], n), h: 0, y: d.y, vx: -1, vz: 0, speed, drop: false, z }, 0.75);
    });
  }
  // the dust kicked up by d (0x86400804): flying back the way it came, up,
  // growing, fading in 6 frames; k its size by how it goes (x a random 0.5-1.5)
  kick(d, k) {
    let p = this.dust.find((q) => q.life <= 0);
    if (!p) {
      const map = this.assets.dust.clone();
      map.repeat.set(1 / 8, 1);
      map.needsUpdate = true;
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false }));
      sprite.renderOrder = 1;
      this.scene.add(sprite);
      p = { sprite, map };
      this.dust.push(p);
    }
    const now = [d.x, d.h, d.y, k * (Math.random() + 0.5), 0, Math.floor(Math.random() * 2)];
    Object.assign(p, { vx: -d.vx * d.speed, vh: 5, vy: -d.vz * d.speed, life: 1, sand: !d.drop, now, was: now });
    p.sprite.material.color.set(d.drop ? DUST_COLOURS[d.z] : SAND);
    this.dustStep(p);
  }
  dustStep(p) { // (0x864002CC: plain sand grows x1.06 a frame, the coloured after a cloud x1.05)
    const [x, h, y, s, rot, t] = p.now;
    p.was = p.now;
    p.now = [x + p.vx, h + p.vh, y + p.vy, s * (p.sand ? 1.06 : 1.05), rot + 0xff, t + 1];
    p.vx *= 0.8; p.vh *= 0.95; p.vy *= 0.8;
    if (t + 1 >= DUST_FOR) p.life = 0;
  }

  // ---- the end ----
  results() {
    const places = this.places();
    return [0, 1, 2, 3].map((i) => ({ i, score: this.scores ? this.scores[i] : this.timeOf(i), place: places[i] }))
      .sort((a, b) => a.place - b.place || a.i - b.i);
  }
  celebrate() { return this.results(); }
}

const mix = (a, b, k) => a.map((v, i) => Math.trunc(v + (b[i] - v) * k));

// in the countdown, frame n: running in to the grid from x0, slowing x0.8 a
// frame from 20 (0x864055CC); between frames for a fractional n
export const RUN_IN = 14;
function runIn(x0, n) {
  const m = Math.max(0, Math.min(n, 20));
  let x = x0, speed = 20;
  for (let k = 0; k < Math.floor(m); k++) {
    speed *= 0.8;
    x -= speed;
    if (speed < 1) speed = 0;
  }
  return x - speed * 0.8 * (m - Math.floor(m));
}
function runSpeed(n) {
  let speed = 20;
  for (let k = 0; k < n; k++) { speed *= 0.8; if (speed < 1) speed = 0; }
  return speed;
}
