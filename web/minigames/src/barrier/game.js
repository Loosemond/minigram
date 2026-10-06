// A Barrier Ball game: the world (rules.js) on the round's clock, and the
// scene it drives. The court is the plane z = 0 seen from straight above, as
// the game has it (from (0, 0, 2000), fov 15); the remake turns the view so
// this device's player's corner is at the bottom (the game's own has 1P's at
// the top left), its lane across the screen. In the game's units.
//
// Who plays each seat: "local" (this device's player), "cpu" or "remote"
// (someone on another device, online). The CPUs think in the world, so every
// device runs them alike. This device's player's pad emits "send" as it
// changes (a frame's stick, and a smash); online, the others' come in
// told("pad"), mostly a few frames late: the world runs on guessing they held
// their stick and didn't smash, and runs again from a saved frame when one
// comes in (the Mr. Mime and the balls eased to where they really are). The
// server runs the same world and says how it ended (told("won")).
import * as THREE from "three";
import { makeModel, piece, COURT_PIECES } from "./assets.js";
import * as R from "./rules.js";

// frames after the end before the round's over (the winners' dance: made for
// the remake, the game shows its results over them)
export const AFTER = 60;
const EYE = 2000;
const MIME = 0.15; // Mr. Mime's scale (0x86301B3C); its barrier is drawn in its place (0x86300FB4)
const COURT = 0.1; // the court's pieces' (0x863006F8)
const BALL_Z = 100; // the balls fly 100 above the court (0x86306D3C)
// the walls' places (0x863005B8: 180 from the middle, at 90, 180, 270 and 360 degrees)
const WALLS = { wall_top: [0, R.HUB], wall_left: [-R.HUB, 0], wall_bottom: [0, -R.HUB], wall_right: [R.HUB, 0] };
// the clips. Mr. Mime in the play (object 218): 0 behind its barrier, 1 a
// smash; in the countdown and at the end (129): 0 miming, 1 putting up its
// barrier, 2 a win, 3 a loss (slower: 0x28 to 0x40). Its barrier (141): 0 a
// smash, 1 coming up, 2 held, 3 and 4 gone (0x863010A8, 0x86301250, 0x863013C8)
const PLAY = { stand: 0, smash: 1 }, SHOW = { mime: 0, up: 1, win: 2, lose: 3 }, BAR = { smash: 0, up: 1, held: 2, win: 3, lose: 4 };
const LOSE_RATE = 0x28 / 0x40;
const SMASH_POSE = 25; // steps of a smash in its clip (then back to standing: 0x863013C8)
// the countdown's frames (main.js's 2.65 s): miming, then the barrier going up as GO comes
const INTRO = 80, UP_LEN = 39;
// a ball's glow, in its last hitter's colour (grey for nobody: 0x86306FB8),
// and its trail (8 steps: 0x8630421C); a smashed ball flashes white, then in
// its hitter's colour, fading over 60 steps (0x863063C0)
const GLOW_COLOURS = [0xc8c8c8, 0x6987ff, 0x55eb55, 0xff6969, 0xfff555];
const FLASH = [0xaaaaff, 0xaaffaa, 0xffaaaa, 0xffffaa].map((c) => new THREE.Color(c));
const WHITE = new THREE.Color(0xffffff);
const GLOW = 76; // a glow's size round a full-size ball (bank 151's, 2.6 x the ball: by eye)
const TRAIL_FOR = 8 / (R.STEPS * R.FPS);
const SNAP = 6; // frames between the world's saved states (for running it again)
const KEEP = 20 * R.FPS; // and how far back they go
const SMOOTH = 0.82; // a corrected Mr. Mime's or ball's ease to where it is, a 60th of a second
const deg = (a) => (a / 0x10000) * 2 * Math.PI;

export class Game {
  constructor(scene, assets) {
    this.scene = scene;
    this.assets = assets;
    this.listeners = {};
    const add = (o) => { scene.add(o); return o; };
    // the court
    for (const name of COURT_PIECES) {
      const p = add(piece(assets[name], COURT));
      if (WALLS[name]) p.position.set(WALLS[name][0], WALLS[name][1], 0);
    }
    // the Mr. Mime, each with its two models and its barrier
    this.mimes = R.SEATS.map((s) => {
      const root = add(new THREE.Group());
      const v = { root, play: makeModel(assets.mime, MIME), show: makeModel(assets.mime_show, MIME), bar: makeModel(assets.barrier, MIME) };
      for (const k of ["play", "show", "bar"]) { v[k].model.rotation.x = Math.PI / 2; root.add(v[k].root); }
      root.rotation.z = (s.angle * Math.PI) / 180;
      v.phase = Math.random() * 70; // (each mimes on its own beat)
      return v;
    });
    // the balls, their glows and trails, by the world's ids
    this.glowTex = assets.glow;
    this.balls = new Map();
    this.freeBalls = [];
    this.trails = [];
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
    this.world = new R.World(seed, level, this.cpus);
    this.inputs = [[], [], [], []]; // each person's pad: [frame, stick x, A 0/1]
    this.snaps = [[0, this.world.save()]]; // the world as it was before a frame
    this.simT = -1; // the last frame the world has run
    this.shownT = -1; // and whose sounds have gone
    this.stick = 0; // this device's player's stick (-64-64, along its lane: + is +x)...
    this.target = null; // ...or the lane x it's heading for (a finger, the mouse)
    this.smashes = 0; // its A presses not yet in a frame
    this.lastX = 0;
    this.result = null; // the server's word on the end: { f, p }
    this.scores = null;
    this.time = 0;
    this.state = "ready";
    this.lastFrame = -1;
    this.intro = 0; // frames since the countdown started
    this.clockS = 0; // s on show (the idle miming, the trails)
    this.endAt = null; // when the end began (s of this.time)
    this.winners = null;
    this.tempoN = 0;
    this.before = null; // where things were before the last frame (to draw between)
    this.offsets = [0, 1, 2, 3].map(() => [0, 0]);
    this.ballOffsets = new Map();
    for (const [, v] of this.balls) this.freeBall(v);
    this.balls.clear();
    for (const s of this.trails) s.sprite.visible = false;
    const told = setup.told;
    if (told?.pads) told.pads.forEach((list, z) => { if (list && !this.cpus[z]) this.inputs[z] = list.map((e) => [...e]); });
    if (told?.done) this.told("won", told.done);
    this.draw(0);
  }
  start() { this.state = "play"; this.intro = Infinity; }
  stop() { this.state = "over"; }
  setControl(z, c) {
    if (c === "cpu" && !this.cpus[z]) return; // (a person who left: their Mr. Mime keeps their last stick)
    this.control[z] = c;
  }

  get frame() { return Math.floor(this.time * R.FPS + 1e-6); }

  // ---- input ----
  // this device's player: the stick (-64-64 along its lane), or a spot in its lane to go to; and a smash (A)
  setStick(x) { this.stick = Math.max(-64, Math.min(64, Math.round(x))); this.target = null; }
  setTarget(x) {
    const m = this.world.m[this.me];
    this.target = x === null ? null : Math.max(m.xmin, Math.min(m.xmax, x));
  }
  smash() { if (this.state === "play") this.smashes = Math.min(2, this.smashes + 1); }
  // seat z's pad on frame t: [stick x, A]
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
  // own, o: the frame it said), or the end ("won": { f, p: each one's points })
  told(type, m) {
    if (type === "pad") {
      const z = m.s;
      if (!(z >= 0 && z < 4) || this.cpus[z] || !Number.isInteger(m.f) || !Number.isInteger(m.x) || (m.a !== 0 && m.a !== 1)) return;
      const list = this.inputs[z];
      if (this.control[z] === "local") { // one of this device's own, as the server has it (on another frame)
        const k = list.findIndex(([f, x, a]) => f === m.o && x === m.x && a === m.a);
        if (k >= 0) list[k][0] = m.f;
        else list.push([m.f, m.x, m.a]); // (one it never made here: the server has it, from this device's connection)
        list.sort((a, b) => a[0] - b[0]);
        this.rewind(Math.min(m.f, k >= 0 ? m.o : m.f));
        return;
      }
      let k = list.length;
      while (k > 0 && list[k - 1][0] > m.f) k--;
      list.splice(k, 0, [m.f, m.x, m.a]);
      this.rewind(m.f);
      return;
    }
    if (type === "won") {
      if (!Number.isInteger(m.f) || !Array.isArray(m.p)) return;
      this.result = { f: m.f, p: m.p.map((x) => (Number.isInteger(x) ? x : 0)) };
    }
  }
  // the world again from before frame f (a pad it ran without); where things
  // were is kept, to ease them to where they turn out to be
  rewind(f) {
    if (f > this.simT) return;
    if (!this.was) this.was = { t: this.simT, at: this.positions() };
    while (this.snaps.length > 1 && this.snaps[this.snaps.length - 1][0] > f) this.snaps.pop();
    const [at, state] = this.snaps[this.snaps.length - 1];
    this.world.load(state);
    this.simT = at - 1;
  }
  positions() {
    const w = this.world;
    return { m: w.m.map((m) => [m.x, m.y]), b: new Map(w.balls.map((b) => [b.id, [b.x, b.y]])) };
  }
  // run the world up to frame t (on past the end too: the balls slow down, for the show)
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
      if (this.was && f === this.was.t) { // (run again to where it was: ease things from there)
        w.m.forEach((m, z) => {
          this.offsets[z][0] += this.was.at.m[z][0] - m.x;
          this.offsets[z][1] += this.was.at.m[z][1] - m.y;
        });
        for (const b of w.balls) {
          const p = this.was.at.b.get(b.id);
          if (!p) continue;
          const o = this.ballOffsets.get(b.id) || [0, 0];
          this.ballOffsets.set(b.id, [o[0] + p[0] - b.x, o[1] + p[1] - b.y]);
        }
        this.was = null;
      }
    }
  }
  // frame f's sounds (once each), and the tune's hurry in the last 30 s
  // (0x80028108(6): a beat a minute faster every 25 frames, up to 18)
  sounds(f) {
    const w = this.world;
    const ballAt = (id) => w.balls.find((b) => b.id === id) || { x: 0, y: 0 };
    for (const [what, z, id, o] of w.events) {
      if (what === "count") { this.emit("sound", "lastCount"); continue; }
      const at = z >= 0 && (what === "smash" || what === "swish") ? w.m[z] : ballAt(id);
      this.emit(what, z, this.pan(at.x, at.y), o);
    }
    if (w.end === null && w.time < R.HURRY - 1) {
      const n = Math.min(18, Math.floor((R.HURRY - 2 - w.time) / 25) + 1);
      if (n !== this.tempoN) { this.tempoN = n; this.emit("tempo", n); }
    }
  }
  // a sound's pan: where it is across this device's screen
  pan(x, y) {
    const n = R.SEATS[this.me].n, across = x * n[1] - y * n[0];
    return Math.round(64 + Math.max(-63, Math.min(63, (across / 375) * 63)));
  }

  // ---- the game, frame by frame ----
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
    else if (!ended && this.endAt !== null) { this.endAt = null; this.winners = null; } // (run again: not over after all)
    this.animate(dt);
  }
  // the frame the play ended on: the server's, else this device's world's
  endFrame() { return this.result ? this.result.f : this.world.end; }

  // what happens on frame t (from GO): this device's player's pad is kept (and sent), and the world runs
  step(t) {
    const me = this.me;
    if (this.control[me] === "local" && !this.cpus[me] && this.world.end === null) {
      let x = this.stick;
      if (this.target !== null) x = Math.max(-64, Math.min(64, Math.round((this.target - this.world.m[me].x) / (0.09 * R.STEPS))));
      const a = this.smashes > 0 ? 1 : 0;
      if (a) this.smashes--;
      if (x !== this.lastX || a) {
        this.inputs[me].push([t, x, a]);
        this.lastX = x;
        this.emit("send", { s: me, f: t, x, a });
      }
    }
    this.runTo(t);
  }
  over() { return this.state === "over"; }

  // each one's points: the server's once it's said, else the world's
  pointsOf(z) { return this.result ? this.result.p[z] : this.world.m[z].score; }
  places() {
    const p = [0, 1, 2, 3].map((z) => (this.scores ? this.scores[z] : this.pointsOf(z)));
    return p.map((x) => 1 + p.filter((y) => y > x).length);
  }
  // the time left, in seconds as the game shows it (0x8630271C)
  secondsLeft() {
    const t = this.state === "ready" || this.state === "idle" ? R.TIME : this.world.time;
    return Math.max(0, Math.trunc((t + R.FPS - 1) / R.FPS));
  }

  // ---- the end (0x863024A8, 0x86301250) ----
  // the most points win (none, if all four have the same): they dance, the others flop
  ending() {
    this.endAt = this.time;
    const p = [0, 1, 2, 3].map((z) => this.pointsOf(z)), most = Math.max(...p);
    const win = p.map((x) => x === most);
    this.winners = win.every((x) => x) ? [false, false, false, false] : win;
    this.emit("end", this.winners);
  }

  // ---- every rendered frame ----
  animate(dt) {
    const k = Math.pow(SMOOTH, dt * 60);
    for (const o of this.offsets) { o[0] *= k; o[1] *= k; }
    for (const [id, o] of this.ballOffsets) {
      o[0] *= k; o[1] *= k;
      if (Math.abs(o[0]) + Math.abs(o[1]) < 0.01) this.ballOffsets.delete(id);
    }
    const between = this.state === "play" ? Math.max(0, Math.min(1, this.time * R.FPS - this.lastFrame)) : 1;
    this.draw(between, dt);
  }

  draw(between, dt = 0) {
    const w = this.world, before = this.before;
    const lerp = (a, b) => a + (b - a) * between;
    this.trailN = (this.trailN || 0) + 1;
    const endN = this.endAt !== null ? (this.time - this.endAt) * R.FPS : null;
    // the Mr. Mime
    w.m.forEach((m, z) => {
      const v = this.mimes[z];
      const was = before?.m[z] || [m.x, m.y];
      v.root.position.set(lerp(was[0], m.x) + this.offsets[z][0], lerp(was[1], m.y) + this.offsets[z][1], 0);
      let show = true;
      if (this.state === "idle") { // (behind the title: miming)
        v.show.pose(SHOW.mime, this.clockS * R.FPS + v.phase);
        v.bar.pose(BAR.win, 0, true);
      } else if (this.state === "ready") { // the countdown: miming, then up goes the barrier
        const t = this.intro, upAt = INTRO - UP_LEN;
        if (t < upAt) { v.show.pose(SHOW.mime, t + v.phase); v.bar.pose(BAR.win, 0, true); }
        else { v.show.pose(SHOW.up, t - upAt, true); v.bar.pose(BAR.up, t - upAt, true); }
      } else if (endN !== null && this.winners) { // the end: a dance, or a flop
        if (this.winners[z]) { v.show.pose(SHOW.win, endN); v.bar.pose(BAR.win, endN, true); }
        else { v.show.pose(SHOW.lose, endN * LOSE_RATE, true); v.bar.pose(BAR.lose, endN * LOSE_RATE, true); }
      } else { // the play
        show = false;
        if (m.smash && m.timer < SMASH_POSE) {
          v.play.pose(PLAY.smash, (m.timer + between * R.STEPS) / R.STEPS, true);
          v.bar.pose(BAR.smash, (m.timer + between * R.STEPS) / R.STEPS, true);
        } else {
          v.play.pose(PLAY.stand, this.clockS * R.FPS + v.phase);
          v.bar.pose(BAR.held, this.clockS * R.FPS + v.phase);
        }
      }
      v.show.root.visible = show;
      v.play.root.visible = !show;
    });
    // the balls
    const seen = new Set();
    for (const b of w.balls) {
      seen.add(b.id);
      const v = this.ball(b.id);
      const was = before?.b.get(b.id) || [b.x, b.y], o = this.ballOffsets.get(b.id) || [0, 0];
      const x = lerp(was[0], b.x) + o[0], y = lerp(was[1], b.y) + o[1];
      v.model.root.position.set(x, y, BALL_Z);
      v.model.root.scale.setScalar(Math.max(1e-3, b.scale));
      v.model.root.rotation.z = deg(b.rot);
      const alpha = b.alpha / 255;
      if (b.smashed && b.owner >= 0 && b.timer < 60) {
        const k = b.timer < 3 ? 1 : 1 - b.timer / 60;
        v.model.tint(b.timer < 3 ? WHITE : FLASH[b.owner], 0.7 * k, alpha);
      } else v.model.tint(WHITE, 0, alpha);
      v.glow.position.set(x, y, BALL_Z - 30);
      v.glow.material.color.set(GLOW_COLOURS[b.owner + 1]);
      v.glow.material.opacity = 0.7 * alpha;
      const s = (GLOW * b.scale) / 0.7;
      v.glow.scale.set(s, s, 1);
      // its trail: where it's been drawn lately
      v.path.push([this.clockS, x, y]);
      while (v.path.length && v.path[0][0] < this.clockS - TRAIL_FOR) v.path.shift();
      if (!b.serving) {
        for (let i = 0; i < v.path.length - 1; i += 2) {
          const [at, px, py] = v.path[i], age = (this.clockS - at) / TRAIL_FOR;
          const p = this.trailSprite();
          p.sprite.position.set(px, py, BALL_Z - 31);
          p.sprite.material.color.set(GLOW_COLOURS[b.owner + 1]);
          p.sprite.material.opacity = 0.6 * (1 - age) * alpha;
          p.sprite.scale.set(s * 0.8, s * 0.8, 1);
        }
      }
    }
    for (const [id, v] of this.balls) if (!seen.has(id)) { this.freeBall(v); this.balls.delete(id); }
    for (const p of this.trails) if (p.used !== this.trailN) p.sprite.visible = false;
  }
  // a ball's model, glow and trail, by its id
  ball(id) {
    let v = this.balls.get(id);
    if (v) return v;
    v = this.freeBalls.pop();
    if (!v) {
      const model = makeModel(this.assets.ball, 1);
      this.scene.add(model.root);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      glow.renderOrder = 1;
      this.scene.add(glow);
      v = { model, glow };
    }
    v.path = [];
    v.model.root.visible = v.glow.visible = true;
    this.balls.set(id, v);
    return v;
  }
  freeBall(v) {
    v.model.root.visible = v.glow.visible = false;
    this.freeBalls.push(v);
  }
  trailSprite() {
    let p = this.trails.find((q) => q.used !== this.trailN);
    if (!p) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      sprite.renderOrder = 1;
      this.scene.add(sprite);
      p = { sprite };
      this.trails.push(p);
    }
    p.used = this.trailN;
    p.sprite.visible = true;
    return p;
  }

  // ---- the end ----
  results() {
    const places = this.places();
    return [0, 1, 2, 3].map((i) => ({ i, score: this.scores ? this.scores[i] : this.pointsOf(i), place: places[i] }))
      .sort((a, b) => a.place - b.place || a.i - b.i);
  }
  celebrate() { return this.results(); }
}

// the camera: the game's own, from straight above (its up turned to this
// device's player's: index.js)
export const CAMERA = { eye: [0, 0, EYE], at: [0, 0, 0], fov: 15 };
