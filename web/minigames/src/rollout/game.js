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
// world and says how it ended (told("won")).
import * as THREE from "three";
import { makeModel, piece } from "./assets.js";
import * as R from "./rules.js";
import { leadFor } from "../lag.js";

// frames after the race is over before the round is (the winners' cheer: made for the remake)
export const AFTER = 90;
const DONPHAN = 0.04; // Donphan's scale (0x864057E0)
const TRACK = 0.37; // the track's (0x86405BEC)
// the cameras (0x86407330, 0x86407290): on the grid in the countdown; once the
// Donphan are on it, over the track in 80 frames (the play's); at the end, to
// the winners in 60
export const CAMERA = { eye: [0, 1049.5, 553], at: [0, 30, 30], fov: 30 };
const START_CAMERA = { eye: [120, 430, 40], at: [120, 0, -210] };
const CAMERA_FOR = 80, END_CAMERA_FOR = 60;
// Donphan's clips (0x86404A0C): walking, 0 standing, 1 running, 2 a winner's
// cheer, 3 a loser's slump; rolling, 4
const CLIP = { stand: 0, run: 1, cheer: 2, slump: 3, roll: 4 };
const INTRO = 80; // the countdown's frames (main.js's 2.65 s)
const SNAP = 6; // frames between the world's saved states (for running it again)
const KEEP = 20 * R.FPS; // and how far back they go
const SMOOTH = 0.88; // a corrected Donphan's ease to where it is, a 60th of a second
// the pictures: a cloud (32 x 32, at 2.5: 0x864012A0), a star (24 x 20, at 1.5:
// 0x8640912C, 110 over a Donphan, 30 apart), a shadow (16 x 16: 2.53 across,
// 5.28 along; round, rolling: 0x86407CE0), the dust (a 64-square, 0x86409880)
const CLOUD = 32 * 2.5, STAR = [24 * 1.5, 20 * 1.5], SHADOW = [16 * 2.5344, 16 * 5.28];
const KNOCKED_RED = new THREE.Color(0xff6464);
const DUST = 64, DUST_FOR = 6, DUST_COLOURS = [0x8c8cc8, 0x8cc88c, 0xdc8c8c, 0xdc8c8c], SAND = 0xc8aa82; // (4P's: 3P's, as the game has it)

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
    // the Donphan: walking and rolling, a shadow, and a star for each cloud it has
    this.donphan = [0, 1, 2, 3].map((z) => {
      const root = add(new THREE.Group());
      const v = { root, walk: makeModel(assets.donphan, DONPHAN), roll: makeModel(assets.donphan_rolling, DONPHAN) };
      root.add(v.walk.root, v.roll.root);
      v.shadow = add(new THREE.Group());
      v.shadow.add(flat(assets.shadow, 16, 16, 0x000000, 0x80 / 255));
      v.stars = [0, 1, 2].map(() => {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: assets["star" + z], transparent: true, depthWrite: false }));
        s.renderOrder = 2;
        add(s);
        return { s, on: false, t: 0 };
      });
      v.anim = Math.random() * 6;
      return v;
    });
    // the clouds, by the world's ids, and the dust
    this.flat = flat;
    this.cloudViews = new Map();
    this.freeClouds = [];
    this.dust = [];
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
    this.shownT = -1; // and whose sounds have gone
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
    this.clockS = 0; // s on show
    this.endAt = null; // when the end began (s of this.time)
    this.winners = null;
    this.camFrom = null; // the end's camera move: { from, to, at (s) }
    this.before = null; // where things were before the last frame (to draw between)
    this.offsets = [0, 1, 2, 3].map(() => [0, 0, 0]);
    if (this.loops) for (const name in this.loops) this.loop(name, false);
    this.loops = {}; // (the looped sounds on: rolling, dizzy)
    for (const [, v] of this.cloudViews) this.freeCloud(v);
    this.cloudViews.clear();
    for (const p of this.dust) p.sprite.visible = false;
    this.dust.forEach((p) => { p.life = 0; });
    for (const v of this.donphan) for (const st of v.stars) { st.on = false; st.t = 99; }
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
  // frame f's sounds (once each), and the dust kicked up (0x86401DBC)
  sounds(f) {
    const w = this.world;
    for (const [what, z, k] of w.events) {
      const d = w.d[z], pan = this.pan(d.x);
      if (what === "final") this.emit("tempo", 17); // (song 100: song 34, 17 beats a minute faster)
      this.emit(what, z, pan, k);
    }
    // the sounds that go on (they loop): rolling, asked for each frame anyone rolls (0x5001: on the
    // footsteps' channel, so it drowns them), and dizzy, every 5 frames anyone's stunned (0x5404)
    this.loop("roll", w.end === null && w.d.some((d) => d.roll > 0 && !d.done));
    this.loop("dizzy", w.end === null && w.d.some((d) => (d.knocked || d.tumble) && d.stun > 0));
    for (const d of w.d) {
      if (d.h <= 0 && Math.random() * R.SPEED < d.speed) {
        const k = d.tumble ? 1 : d.boost > 0 ? 1.5 : 0.75;
        this.kick(d, k * (Math.random() + 0.5));
      }
    }
    for (const p of this.dust) if (p.life > 0) this.dustStep(p);
  }
  loop(name, on) {
    if (this.loops[name] === on) return;
    this.loops[name] = on;
    this.emit("loop", name, on);
  }
  // a sound's pan: where it is across the screen
  pan(x) { return Math.round(64 + Math.max(-63, Math.min(63, (x / 340) * 63))); }

  // ---- the race, frame by frame ----
  update(dt) {
    if (this.state === "ready") this.intro += dt * R.FPS;
    this.clockS += dt;
    if (this.state === "play") {
      this.time += dt;
      const now = this.frame;
      for (let t = this.lastFrame + 1; t <= now; t++) { this.step(t); this.lastFrame = t; }
      this.runTo(this.lastFrame); // (after a pad that came in late)
      const end = this.endFrame();
      if (end !== null && this.frame >= end + AFTER) { this.state = "over"; this.emit("finish"); }
    } else if (this.state === "over") this.time += dt;
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

  // ---- the end (0x8640533C): the winners cheer, the others slump; the camera goes to the winners ----
  ending() {
    this.endAt = this.time;
    this.loop("roll", false);
    this.loop("dizzy", false);
    const p = this.places();
    this.winners = p.map((x) => x === 1);
    this.emit("end", this.winners);
    const won = this.world.d.filter((d, z) => this.winners[z]), on = won.length ? won : this.world.d;
    const c = [0, 1, 2].map((k) => on.reduce((s, d) => s + [d.x, d.h, d.y][k], 0) / on.length);
    this.camFrom = { at: this.time, to: { eye: [c[0] - 200, c[1] + 450, c[2] + 80], at: [c[0] + 90, c[1] - 40, c[2]] } };
  }

  // ---- every rendered frame ----
  animate(dt) {
    const k = Math.pow(SMOOTH, dt * 60);
    for (const o of this.offsets) { o[0] *= k; o[1] *= k; o[2] *= k; }
    const between = this.state === "play" ? Math.max(0, Math.min(1, this.time * R.FPS - this.lastFrame)) : 1;
    this.draw(between, dt);
  }
  // where the camera is: on the grid, over to the track, or to the winners
  camera() {
    const ease = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);
    const cos = (n, of) => (1 - Math.cos((Math.min(n, of) / of) * Math.PI)) / 2;
    if (this.camFrom) {
      const n = (this.time - this.camFrom.at) * R.FPS, k = cos(n, END_CAMERA_FOR);
      return { eye: ease(CAMERA.eye, this.camFrom.to.eye, k), at: ease(CAMERA.at, this.camFrom.to.at, k) };
    }
    if (this.state === "idle") return CAMERA;
    // (the move starts once they're on the grid: 14 frames into the countdown)
    const n = this.intro + (this.state === "play" ? this.time * R.FPS : 0) - RUN_IN;
    if (n <= 0) return START_CAMERA;
    const k = cos(n, CAMERA_FOR);
    return { eye: ease(START_CAMERA.eye, CAMERA.eye, k), at: ease(START_CAMERA.at, CAMERA.at, k) };
  }

  draw(between, dt = 0) {
    const w = this.world, before = this.before;
    const lerp = (a, b) => a + (b - a) * between;
    const endN = this.endAt !== null ? (this.time - this.endAt) * R.FPS : null;
    w.d.forEach((d, z) => {
      const v = this.donphan[z];
      let x = d.x, h = d.h, y = d.y;
      if (this.state === "ready" || this.state === "idle") { // the countdown: running in to the grid
        const n = this.state === "idle" ? 99 : this.intro;
        x = runIn(this.grid[z], n);
      } else {
        const was = before?.[z] || [x, h, y];
        x = lerp(was[0], x) + this.offsets[z][0];
        h = lerp(was[1], h) + this.offsets[z][1];
        y = lerp(was[2], y) + this.offsets[z][2];
      }
      v.root.position.set(x, Math.max(0, h), y);
      v.root.rotation.y = (d.rot / 0x10000) * 2 * Math.PI;
      const rolling = this.state === "play" && d.roll > 0 && !d.done && endN === null;
      v.walk.root.visible = !rolling;
      v.roll.root.visible = rolling;
      let clip = CLIP.run, rate = 1;
      if (this.state === "idle") clip = CLIP.stand;
      else if (this.state === "ready") clip = this.intro < RUN_IN ? CLIP.run : CLIP.stand;
      else if (endN !== null && this.winners) clip = this.winners[z] ? CLIP.cheer : CLIP.slump;
      else if (d.done) clip = CLIP.stand;
      else if (d.knocked) rate = 2;
      const was = v.anim;
      v.anim += dt * R.FPS * rate;
      if (rolling) v.roll.pose(CLIP.roll, v.anim);
      else if (clip === CLIP.cheer || clip === CLIP.slump) v.walk.pose(clip, endN, clip === CLIP.slump);
      else v.walk.pose(clip, v.anim);
      // a footstep each time the run comes round (0x5F00), on the ground
      if (clip === CLIP.run && !rolling && !this.loops.roll && this.state === "play" && h <= 0 && Math.floor(was / 6) !== Math.floor(v.anim / 6)) {
        this.emit("step", z, this.pan(x));
      }
      v.walk.tint(KNOCKED_RED, d.knocked && d.stun >= 18 ? 0.6 : 0); // (0x864028B8: red, its first frames)
      // its shadow (long, walking; round, rolling)
      v.shadow.position.set(x, 0.5, y);
      v.shadow.rotation.y = v.root.rotation.y;
      v.shadow.scale.set(SHADOW[0] / 16, 1, (rolling ? SHADOW[0] : SHADOW[1]) / 16);
      // a star for each cloud it has: popping up, or fading as it's dropped (0x86408D4C)
      v.stars.forEach((st, k) => {
        const want = this.state === "play" && k < d.clouds && endN === null;
        if (want !== st.on) { st.on = want; st.t = 0; }
        st.t += dt * R.FPS;
        const s = st.on ? (st.t < 10 ? (1 - st.t / 10) * 1.5 + 1.5 : 1.5) / 1.5 : 1;
        const alpha = st.on ? 1 : Math.max(0, 1 - st.t / 10);
        st.s.visible = alpha > 0;
        st.s.position.set(x - 30 + 30 * k, Math.max(0, h) + 110, y);
        st.s.scale.set(STAR[0] * s, STAR[1] * s, 1);
        st.s.material.opacity = alpha;
        st.s.material.rotation = st.on ? 0 : st.t * 0.4;
      });
    });
    // the clouds: coming up, there, fading (0x86400DDC)
    const seen = new Set();
    for (const c of w.clouds) {
      seen.add(c.id);
      const v = this.cloud(c);
      v.mesh.position.set(c.x, c.h, c.y);
      const a = c.phase === 0 ? (200 * c.timer) / R.CLOUD_FOR[0] : c.phase === 1 ? 200 : 200 - (200 * c.timer) / R.CLOUD_FOR[2];
      v.mesh.material.opacity = Math.max(0, Math.min(255, a)) / 255;
      v.map.offset.x = (c.frame % 16) / 16;
    }
    for (const [id, v] of this.cloudViews) if (!seen.has(id)) { this.freeCloud(v); this.cloudViews.delete(id); }
    // the dust
    for (const p of this.dust) {
      if (p.life <= 0) { p.sprite.visible = false; continue; }
      p.sprite.visible = true;
      p.sprite.position.set(p.x, p.h, p.y);
      p.sprite.scale.set(DUST * p.s, DUST * p.s, 1);
      p.sprite.material.opacity = Math.max(0, 1 - p.t / DUST_FOR);
      p.sprite.material.rotation = (p.rot / 0x10000) * 2 * Math.PI;
      p.map.offset.x = Math.floor((p.t % 16) / 2) / 8;
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
  // the dust kicked up by d (0x86400804): flying back the way it came, up, growing, fading in 6 frames
  kick(d, s) {
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
    Object.assign(p, {
      x: d.x, h: d.h, y: d.y, s, vx: -d.vx * d.speed, vh: 5, vy: -d.vz * d.speed,
      t: Math.floor(Math.random() * 2), life: 1, rot: 0, coloured: d.drop,
    });
    p.sprite.material.color.set(d.drop ? DUST_COLOURS[d.z] : SAND);
  }
  dustStep(p) { // (0x864002CC)
    p.x += p.vx; p.h += p.vh; p.y += p.vy;
    p.s *= p.coloured ? 1.06 : 1.05;
    p.vx *= 0.8; p.vh *= 0.95; p.vy *= 0.8;
    p.rot += 0xff;
    p.t++;
    if (p.t >= DUST_FOR) p.life = 0;
  }

  // ---- the end ----
  results() {
    const places = this.places();
    return [0, 1, 2, 3].map((i) => ({ i, score: this.scores ? this.scores[i] : this.timeOf(i), place: places[i] }))
      .sort((a, b) => a.place - b.place || a.i - b.i);
  }
  celebrate() { return this.results(); }
}

// in the countdown, frame n: running in to the grid from x0, slowing (0x864055CC)
export const RUN_IN = 14;
function runIn(x0, n) {
  let x = x0, speed = 20;
  for (let k = 0; k < Math.min(n, 20); k++) {
    speed *= 0.8;
    x -= speed;
    if (speed < 1) speed = 0;
  }
  return x;
}
