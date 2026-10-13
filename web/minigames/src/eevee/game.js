// An Eager Eevee round: the rules (rules.js) on the round's clock, and the
// scene they drive: Aipom over its basket in the middle of the ring, the four
// Eevee walking round it, and what's under the basket. In the game's units
// (y up, the ground at 0; the ring's angle a at (r cos a, 0, r sin a)).
//
// Who plays each seat: "local" (this device's player), "cpu", "remote"
// (someone on another device, online) or "none" (an empty seat, online with
// the CPUs off: no Eevee there at all; its place on the ring goes round
// unused, as the ring's places are the game's). The seats this device plays emit
// "press" with the frame they pressed on, for sending on; a remote seat's
// presses come through the server a little later, and are shown as they get
// here. Online, who gets the prize is the server's word (told "got"): an
// Eevee that's got in waits for it, grabbing, as the game's do (clip 6) till
// the basket's contents say; and so is who was outside as each round started
// (told "out": its open hangs on it). Solo, the round's judged here.
//
// The rules run at the game's 30 frames a second; everything is drawn between
// frames (each Eevee, Aipom, the fruit, the effects, the clips' frames), so
// nothing steps at 30 on a faster screen.
import * as THREE from "three";
import { makeModel } from "./assets.js";
import * as R from "./rules.js";
import { faceOnRender } from "../facing.js";

const EEVEE_SCALE = 1 / 6, AIPOM_SCALE = 0.5, FRUIT_SCALE = 0.355556, PINECO_SCALE = 0.5; // (0x86B01158, 0x86B01268, 0x86B04500)
const STRAWBERRY_SCALE = 0.248889; // a strawberry flying off a pile (object 211: 0x86B04970)
// Eevee's clips (object 143), by what the module plays them for (0x86B023FC,
// one per state, table 0x86B0DCBC): 0 waiting outside the ring, 2 walking, 5
// the dash and a feint, 6 grabbing, 7 eating (and the winners at the end), 8
// bounced back, 10 blown up by a Pineco, 11 and 12 coming round, 13 then 14
// the others at the end
const CLIP = { wait: 0, walk: 2, dash: 5, grab: 6, eat: 7, back: 8, blown: 10, dazed: 11, up: 12, sad: 13, sulk: 14 };
const CLIP_FRAMES = [29, 9, 23, 22, 9, 6, 43, 49, 42, 43, 62, 19, 29, 59, 19]; // (their last frames)
const LOOPS = new Set([CLIP.wait, CLIP.walk, CLIP.sulk]);
// its face's texture clips (0x8003F49C): 2 (eyes closing, then shut) with
// clip 13, 3 (shut) with clip 14 (0x86B02F20, 0x86B02FA0); with the others 0,
// eyes open
const FACE = { [CLIP.sad]: 2, [CLIP.sulk]: 3 };
// a clip's speed (0x8003EC54; 1 unless set): the grab 1.5 (0x86B02A44, 0x86B02B38);
// the walk 1.25 x the way moved this frame / the ring's step at 130, 0.016
// radians (0x86B02564-0x86B026B0, 81920 in 16.16; also on the way home, 0x86B027E8)
const GRAB_SPEED = 1.5, WALK_SPEED = 1.25 / (2 * 130 * Math.sin(0.008));
// Aipom's (object 150): 0 hangs on, 1 lifts the basket (up from frame 5), 2
// lowers it and calls the round; its texture clip 0 a blink, one frame in 300
// (0x86B0324C)
const AIPOM = { idle: 0, lift: 1, call: 2 };
const CALL_FRAMES = 28, LIFT_FRAMES = 29, BLINK = 1 / 300, BLINK_FRAMES = 10;
// the dash: in at 28 a frame to 75, where the basket is (the grab from there,
// if it's up: 0x86B06378), then 14 a frame to 45. A feint goes out to 100 and
// walks back in 8 frames (0x86B06674: 3.75 a frame). Bounced back, from where
// it was, in 14 frames (0x86B063A0). Blown away: 8.4375 a frame out to 180
// (0x86B07234). Back to the ring: 1.23 a frame. At the end the winners walk
// in to 87.5 (0x86B073D0) and hop (clip 5, 0x86B03030)
const MOVE = { dash: 28, near: 75, run: 14, feint: 100, back: 3.75, bounce: 14, blown: 8.4375, out: 180, walk: 1.23, cheer: 87.5 };
const CATCH = R.CATCH / R.UNIT, TAU = 2 * Math.PI;
const wrap = (a) => a - TAU * Math.round(a / TAU); // to (-pi, pi]
// the final round's three piles (0x86B04500: offsets in the basket's units)
const PILES = [[0, 0], [-27, -20], [27, -20]];
// The shadows (0x86B0B608, 0x86B0B9A0): bank 307's 16 x 16 dot on the shared
// quad (its size), lying flat, black (env 0, combiner FCFFD3FF FFFEFE38: its
// alpha env's x the picture's). Each Eevee's at 2.5, alpha 128 (0x86B0B6CC),
// on the ground under it (0x86B0355C); the basket's at 7 while it's down,
// 7 to 3.5 as Aipom lifts it (clip 1, frame f: k = (f - 1) / 30) and back as it
// calls (clip 2: (f - 1) / 27), its alpha 128 to 64 in the lift (0x86B0B7B4; the
// call and the rest set the model's own alpha byte, which this draw doesn't
// read, so the lift's last stays: docs/open-questions.md)
const SHADOW = { size: 16, eevee: 2.5, alpha: 128 / 255, down: 7, up: 3.5 };
// a Pineco's smoke (0x86B04244-0x86B043F8): on its count's 25th, 28th, 31st,
// 40th and 43rd frames (the frame it went off its 1st), 35 up, within 36 of the middle
const SMOKE_AT = [24, 27, 30, 39, 42], SMOKE_Y = 35, SMOKE_SPREAD = 36;
// the munch (0xCA0F) is asked for while anyone eats, the round's first 25 frames of it (0x86B01A24)
const MUNCH = 25;

export class Game {
  constructor(scene, assets) {
    this.scene = scene;
    this.assets = assets;
    this.listeners = {};
    faceOnRender(scene); // (the fruit and Pineco's face, the effects: their joints drawn facing the camera)
    this.state = "idle";
    this.time = 0;
    this.me = 0;
    this.aipom = makeModel(assets.aipom, AIPOM_SCALE);
    scene.add(this.aipom.root);
    const shadow = (size) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: 0x000000, map: assets.shadow, transparent: true, depthWrite: false }));
      m.position.y = 0.5;
      m.renderOrder = -0.5; // (on the ground, before the translucent prizes: they write their depth)
      scene.add(m);
      return m;
    };
    this.eevees = [0, 1, 2, 3].map((z) => {
      const m = makeModel(assets.eevee, EEVEE_SCALE);
      scene.add(m.root);
      const sh = shadow(SHADOW.size * SHADOW.eevee);
      sh.material.opacity = SHADOW.alpha;
      return { z, m, shadow: sh, mode: "walk", r: R.RING_R, off: 0, clip: -1, cf: 0, cf0: 0, speed: 1, k: 0 };
    });
    this.basketShadow = shadow(SHADOW.size);
    this.contents = new THREE.Group(); // what's under the basket
    scene.add(this.contents);
    this.flying = [];
    this.spare = [];
    this.rounds = R.deal(1, 2);
    this.times = R.timeline(this.rounds);
    this.empty = [false, false, false, false];
    this.players = [0, 1, 2, 3].map(() => ({ total: 0, shown: 0, prizes: [], runner: new R.Runner(this.times, this.rounds) }));
    this.verdict = [];
    this.blasted = [];
    this.waiting();
  }
  on(name, fn) { (this.listeners[name] ||= []).push(fn); }
  emit(name, ...args) { for (const fn of this.listeners[name] || []) fn(...args); }

  // A round. level: easy / normal / hard; setup: { me, control } and,
  // online, the server's round: { level (its code), scores, prizes, outs } (to rejoin it midway).
  reset(level, seed = (Math.random() * 2 ** 31) | 0, setup = {}) {
    this.levelName = level;
    this.seed = seed;
    this.me = setup.me ?? 0;
    this.control = setup.control || [0, 1, 2, 3].map((z) => (z === this.me ? "local" : "cpu"));
    this.empty = this.control.map((c) => c === "none");
    this.level = setup.level ?? R.levelCode(level, this.control.includes("cpu"));
    // who's outside the ring as each round starts (its open hangs on it: rules.js
    // deal): null till it has (round 1's: no one); online the server's word
    this.outs = [0, 1, 2, 3, 4].map((n) => (n === 0 ? 0 : Number.isInteger(setup.outs?.[n]) ? setup.outs[n] : null));
    this.rounds = R.deal(seed, this.level, this.outs);
    this.times = R.timeline(this.rounds);
    this.time = 0;
    this.state = "ready";
    this.stopped = false;
    this.online = this.control.includes("remote");
    this.cpuQ = R.quad(seed ^ 0x6d2b79f5); // the CPUs' plans
    this.foolQ = R.quad(seed ^ 0x1b873593); // and their falling for a feint
    this.players = [0, 1, 2, 3].map((z) => ({
      total: setup.scores?.[z] ?? 0,
      shown: null, // what the card shows: nothing till the tally at the end
      // the prizes won, in the order they came (0x86B0AB14: G+0x1B4 slots): { what, count (strawberries), at (frame) }
      won: (setup.prizes?.[z] || []).filter((w) => w && w !== "pineco").map((what) => ({ what, count: null, at: -99 })),
      runner: new R.Runner(this.times, this.rounds),
      plan: null, // a CPU's, this round
      reaction: null, // { n, v (1/100 s), at (frame) }
    }));
    this.verdict = this.rounds.map(() => null); // by round: { pts, got, decided, ... } once it's known
    this.planned = -1;
    this.lastFrame = -1;
    this.munched = 0;
    this.munching = false;
    this.ticking = false;
    this.tallyFrom = null;
    this.handedOver = null;
    this.blasted = this.rounds.map(() => null); // by round: the frame its Pineco went off
    this.winners = null;
    this.waiting();
  }
  // before GO (and behind the title): at their places, waiting
  waiting() {
    for (const e of this.eevees) {
      e.mode = "idle";
      e.r = R.RING_R;
      e.off = 0;
      Object.assign(e, { round: -1, slotted: -1, in: false, heard: false, eats: false, dust: false });
      this.setClip(e, CLIP.wait);
      this.place(e, e.r, R.HOME[e.z], true);
      e.m.root.visible = e.shadow.visible = !this.empty[e.z]; // (an empty seat's: none)
    }
    // the basket's up to begin with (G+0x44 starts at 1: 0x86B0D3C8), and the
    // first round's call brings it down
    this.setAipom(AIPOM.lift, false, -1000);
    this.blink = null;
    this.basketAlpha = this.liftAlpha(LIFT_FRAMES);
    this.clearContents();
    for (const f of this.flying) this.land(f);
    this.flying = [];
  }
  start() { this.state = "play"; }
  stop() { this.state = "over"; this.stopped = true; }
  setControl(z, c) { this.control[z] = c; }

  get frame() { return Math.floor(this.time * R.FPS + 1e-6); }
  roundAt(t) { return R.roundAt(this.times, t); }
  // the round on, for the HUD: { n, T, rd, t }
  get now() {
    const t = Math.min(this.frame, this.times[R.ROUNDS - 1].end - 1), n = this.roundAt(t);
    return { n, T: this.times[n], rd: this.rounds[n], t };
  }

  // ---- input ----
  // this device's player pressed A ("a", the dash) or B ("b", the feint)
  press(k, z = this.me) {
    if (this.state !== "play" || this.control[z] === "remote" || this.empty[z]) return false;
    return this.act(z, k, this.frame);
  }
  // seat z presses k on frame t, if it works then: a seat this device plays
  act(z, k, t) {
    const v = this.verdict[this.roundAt(t)];
    const res = this.players[z].runner.press(k, t, v ? v.decided : null);
    if (!res) return false;
    this.pressed(z, res);
    this.emit("press", { s: z, k, f: t });
    return true;
  }
  // a press that worked (res: Runner.press's), on show from now
  pressed(z, res) {
    const e = this.eevees[z], p = this.players[z], T = this.times[res.n];
    e.round = res.n;
    e.dust = true; // (its dust, 0x86B06578: as it sets off)
    e.in = false;
    if (res.k === "b") {
      this.goMode(e, "feint");
      this.emit("feint", z);
      if (this.control.includes("cpu")) this.fooled(z, res.t);
      return;
    }
    this.goMode(e, "dash");
    e.bonk = !!res.bonk;
    e.got = false;
    if (!res.bonk) {
      // its reaction time, shown 80 frames (0x86B0660C) if it's one (0x86B08288: p - O - 5 >= 0)
      const v = R.reaction(T, res.t, ((this.seed >>> 3) + z * 7 + res.n * 13) % 3);
      if (v >= 0) p.reaction = { n: res.n, v, at: res.t };
    }
    this.emit("dash", z);
  }

  // the server's word: a remote seat's press ("press": { s, k, f }), a
  // round's prizes ("got": { n, p (points by seat), e (totals after), d (the
  // frame it was decided) }) or who was outside as a round started ("out": { n, m })
  told(type, m) {
    if (this.state === "idle") return;
    if (type === "press") {
      const z = m.s;
      if (!(z >= 0 && z < 4) || this.control[z] !== "remote" || !Number.isFinite(m.f)) return;
      const res = this.players[z].runner.press(m.k === "b" ? "b" : "a", m.f, null);
      if (res) this.pressed(z, res);
      return;
    }
    if (type === "got") {
      const n = m.n;
      if (!(n >= 0 && n < R.ROUNDS) || this.verdict[n]?.told) return;
      const pts = [0, 1, 2, 3].map((z) => m.p?.[z] | 0);
      this.decide(n, { pts, got: pts.map((x) => x > 0), decided: Number.isFinite(m.d) ? m.d : this.frame, told: true });
      if (Array.isArray(m.e)) m.e.forEach((x, z) => { if (Number.isFinite(x) && this.players[z]) this.players[z].total = x; });
      return;
    }
    if (type === "out") {
      const n = m.n;
      if (!(n >= 1 && n < R.ROUNDS) || !Number.isInteger(m.m)) return;
      this.dealOut(n, m.m & 15);
    }
  }
  // round n dealt with mask m outside (and the rounds after it again)
  dealOut(n, m) {
    const was = this.outs[n] ?? 0;
    this.outs[n] = m;
    if (was === m) return;
    this.rounds = R.deal(this.seed, this.level, this.outs);
    this.times = R.timeline(this.rounds);
    for (const p of this.players) p.runner.retime(this.times, this.rounds);
  }

  get score() { return this.players.map((p) => p.shown); }

  // ---- the round, frame by frame ----
  update(dt) {
    if (this.state === "play" || (this.state === "over" && !this.stopped)) this.time += dt;
    if (this.state === "play" || this.state === "over") {
      for (let t = this.lastFrame + 1; t <= this.frame; t++) {
        this.step(t);
        this.lastFrame = t;
        if (this.state === "play" && this.handedOver !== null && t >= this.handedOver) { this.state = "over"; this.emit("finish"); }
      }
    }
    this.animate(dt);
  }

  // what happens on frame t (from GO)
  step(t) {
    const last = this.times[R.ROUNDS - 1];
    if (t >= last.end) { this.end(t); return; }
    if (t === R.WALK_FROM) for (const e of this.eevees) this.goMode(e, "walk");
    // a round's script, as it starts (0x86B0B04C): who's outside the ring then
    // decides its open; online the server says (and may say otherwise)
    for (let n = 1; n < R.ROUNDS; n++) {
      if (t === this.times[n].start && this.outs[n] === null) this.dealOut(n, R.outsideMask(this.players.map((p) => p.runner), t));
    }
    const n = this.roundAt(t), T = this.times[n], rd = this.rounds[n];
    if (t === T.start) {
      this.setAipom(AIPOM.call, false, t); // the basket comes down over the next prize
      this.clearContents();
      this.munched = 0;
      for (const e of this.eevees) if (!["walk", "blown", "out", "idle"].includes(e.mode)) this.goHome(e, t - 1, Math.ceil(Math.abs(R.RING_R - e.r) / MOVE.back) || 1);
      this.emit("round", n);
    }
    if (t === T.start + 5) this.emit("calling", n); // (frame 5 of the call: 0xAF00, the song, the banner)
    if (t === T.play && this.planned < n) this.planCpus(n);
    // a fake: the music and effects hush 5 frames before it (0x86B01838) till
    // the basket's back down, clip 1 played back below its frame 0 (0x86B034A0)
    for (const f of T.fakes) {
      if (t === f - 5) this.emit("hush", n);
      if (t === f) { this.setAipom(AIPOM.lift, true, t); this.emit("fake", n); }
      if (t === f + 11) this.emit("unhush", n);
    }
    if (t === T.open) {
      this.setAipom(AIPOM.lift, false, t);
      this.showContents(n);
      this.emit("open", n);
    }
    if (t === T.open + 5) this.emit("up", n); // frame 5 of the lift: the basket's off the ground
    // the CPUs' buttons
    if (t >= T.play && t < T.close) {
      for (let z = 0; z < 4; z++) {
        const p = this.players[z];
        if (this.control[z] !== "cpu" || !p.plan) continue;
        const { A, B } = R.cpuInput(p.plan, rd, t - T.play);
        if (A) this.act(z, "a", t); else if (B) this.act(z, "b", t);
      }
    }
    this.gotIn = [];
    this.blownNow = [];
    for (const e of this.eevees) this.move(e, t);
    if (this.gotIn.length) this.taken(this.gotIn, t);
    // a Pineco: 0xAF06 each frame a new Eevee's in; the first frame the flash and
    // 0xAF0B for each one in then (0x86B03C38-0x86B03C9C), and its smoke after
    if (this.blownNow.length) {
      const first = this.blasted[n] === null;
      if (first) this.blasted[n] = t;
      this.emit("boom", t, first ? this.blownNow : []);
    }
    if (this.blasted[n] !== null && SMOKE_AT.includes(t - this.blasted[n])) {
      const a = Math.random() * TAU, d = Math.floor(Math.random() * SMOKE_SPREAD);
      this.emit("smoke", t, Math.sin(a) * d, SMOKE_Y, Math.cos(a) * d);
    }
    // who gets the prize (solo; online the server says)
    if (!this.online && !this.verdict[n]) {
      const res = R.judge(rd, T, this.players.map((p) => p.runner.in[n]));
      if (res && t >= res.decided) this.decide(n, res);
    }
    // ... and the ones in, grabbing, hear it now (0x86B03628: the frame it's taken)
    for (const e of this.eevees) if (e.mode === "grab" && e.in && !e.heard && this.verdict[e.round]) this.heard(e, this.verdict[e.round], t);
    this.drawContents(n, t);
    this.aipomStep(t);
    // the munch: asked for while anyone eats, the round's first 25 frames of it (0x86B019F0-0x86B01A38)
    const eating = t >= T.play && this.eevees.some((e) => e.mode === "eat");
    const munch = eating && this.munched < MUNCH;
    if (eating) this.munched++;
    if (munch !== this.munching) { this.munching = munch; this.emit("munch", munch); }
    // song 53, 70 frames after a prize goes (0x86B01A40-0x86B01A78; not in the final round)
    const v = this.verdict[n];
    if (v && n < R.ROUNDS - 1 && t === v.decided + 70) this.emit("song", n);
  }

  // The end (0x86B08F20): the frame after the last race ends, the points show
  // and count up (rules.js tallyFrames), a tick each frame they do (0x8012)
  // and 0x8F13 as each one's in; the frame they all are, the hand-over
  // (0x86B09148); the Eevee go on round the ring meanwhile, and after it the
  // winners eat and the others sulk (celebrate)
  end(t) {
    const last = this.times[R.ROUNDS - 1];
    if (t === last.end) {
      if (this.munching) { this.munching = false; this.emit("munch", false); }
      this.tallyFrom = t + 1;
      this.handedOver = R.handover(this.times, Math.max(...this.players.map((p) => p.total)));
    }
    const k = t - this.tallyFrom;
    let ticking = false;
    if (k >= 0 && this.handedOver !== null && t <= this.handedOver) {
      this.players.forEach((p, z) => {
        const was = k > 0 ? R.tallied(p.total, k - 1) : 0;
        p.shown = R.tallied(p.total, k);
        if (was < p.total) {
          ticking = true;
          if (p.shown >= p.total) this.emit("tallied", z);
        }
      });
    }
    if (ticking !== this.ticking) { this.ticking = ticking; this.emit("tally", ticking); }
    for (const e of this.eevees) this.move(e, t);
    this.aipomStep(t);
  }

  // the CPUs plan the round's presses (rules.js cpuPlan): for all four, as the game does
  planCpus(n) {
    this.planned = n;
    for (let z = 0; z < 4; z++) {
      const plan = R.cpuPlan(this.level, this.rounds[n], this.cpuQ);
      this.players[z].plan = this.control[z] === "cpu" ? plan : null;
    }
  }
  // seat z feinted on frame t: the CPUs may fall for it (0x86B0CB1C)
  fooled(z, t) {
    const n = this.roundAt(t), rd = this.rounds[n], T = this.times[n];
    if (!rd.fakes.length) return;
    for (let c = 0; c < 4; c++) {
      const p = this.players[c];
      if (c === z || this.control[c] !== "cpu" || !p.plan) continue;
      R.cpuFooled(p.plan, rd, t - T.play, this.foolQ);
      // (one that got here late: a dash as soon as it can be)
      const soonest = this.frame - T.play + 2;
      if (p.plan.fooled > 0 && p.plan.fooled < soonest) p.plan.fooled = soonest;
    }
  }

  // round n's prizes are known (res: rules.js judge's, or the server's)
  decide(n, res) {
    if (this.verdict[n]?.told) return;
    const was = this.verdict[n];
    this.verdict[n] = res;
    if (!res.told) this.players.forEach((p, z) => { p.total += res.pts[z] - (was ? was.pts[z] : 0); });
    this.emit("decided", n, res);
  }

  // ---- an Eevee ----
  // where its place on the ring is at frame t (radians)
  spot(z, t) { return R.HOME[z] - R.ring(this.times, t) / R.UNIT; }
  goMode(e, mode) {
    e.mode = mode;
    e.k = 0;
    const clip = { walk: CLIP.walk, dash: CLIP.dash, feint: CLIP.dash, grab: CLIP.grab, eat: CLIP.eat, home: CLIP.walk,
                   back: CLIP.back, blown: CLIP.blown, out: CLIP.wait, cheer: CLIP.eat, sad: CLIP.sad }[mode];
    if (clip !== undefined && !(clip === e.clip && (clip === CLIP.walk || clip === CLIP.grab))) this.setClip(e, clip);
  }
  // e's frame t: where it goes, by what it's doing (0x86B057B0's states),
  // in the state its clip's end left it in (0x86B023FC: the frame before's)
  move(e, t) {
    const z = e.z;
    this.ended(e, t);
    e.k++;
    switch (e.mode) {
      case "walk": this.walk(e, t); break;
      case "dash": // in to the basket (0x86B06308): at 75 into it, if it's not up (state 14), else grabbing (10)
        e.r = Math.max(MOVE.near, e.r - MOVE.dash);
        if (e.r <= MOVE.near) {
          if (e.bonk) { this.goBack(e); this.emit("bonk", z); }
          else this.goMode(e, "grab");
        }
        break;
      case "grab": // grabbing (clip 6 at 1.5), in to 45, the prize then (0x86B063D8)
        if (e.in) break;
        e.r = Math.max(R.REACH, e.r - MOVE.run);
        if (e.r <= R.REACH) this.arrived(e, t);
        break;
      case "middle": // a lone winner, in to the middle grabbing (state 11, 0x86B02B00)
        e.r = Math.max(0.01, e.r - MOVE.run);
        break;
      case "feint":
        if (e.r > MOVE.feint) e.r = Math.max(MOVE.feint, e.r - MOVE.dash);
        else this.goHome(e, t, 8);
        break;
      case "home": { // back to its place, there in e.span frames (0x86B068B4)
        const k = Math.min(1, e.k / e.span);
        e.r = e.r0 + (R.RING_R - e.r0) * k;
        e.off = e.a0 + (e.a1 - e.a0) * k;
        if (e.k >= e.span) this.goMode(e, "walk");
        break;
      }
      case "back": // bounced back, from the basket or from the middle (0x86B070E8)
        e.r = Math.min(R.RING_R, e.r + e.bounce);
        break;
      case "blown": // thrown out, then coming round (0x86B02D88)
        e.r = Math.min(MOVE.out, e.r + MOVE.blown);
        break;
      case "out": { // outside the ring till its place comes round (0x86B05A78), then it walks in
        const back = this.players[z].runner.back();
        if (back === null || t < back) break;
        e.off = wrap(e.off - (this.spot(z, t) - R.HOME[z])) + this.spot(z, t) - R.HOME[z];
        this.goMode(e, "walk");
        this.walk(e, t);
        break;
      }
      case "cheer": // the end: a winner walks in to 87.5 (states 21, 22) and hops (23), following its place
        if (e.clip === CLIP.walk) {
          e.r = e.r0 + (MOVE.cheer - e.r0) * Math.min(1, e.k / e.span);
          if (e.k >= e.span) this.setClip(e, CLIP.dash);
        }
        if (e.clip !== CLIP.eat) e.off = this.spot(z, t) - R.HOME[z];
        break;
    }
    this.place(e, e.r, R.HOME[z] + e.off);
    // its clip on a frame, none on the frame it's set: the walk's by the way it
    // went (0x86B02564), the grab's 1.5, the others' 1 (0x8003F2F0 sets 1)
    if (e.clip === CLIP.walk) {
      const dx = e.at.x - (e.was?.x ?? e.at.x), dy = e.at.y - (e.was?.y ?? e.at.y);
      e.speed = WALK_SPEED * Math.hypot(dx, dy);
    } else e.speed = e.clip === CLIP.grab ? GRAB_SPEED : 1;
    e.cf0 = e.cf;
    if (e.set) e.set = false;
    else e.cf += e.speed;
    // a blown-away Eevee trails smoke, every 3rd frame of its clip till it's out at 180 (0x86B035BC-0x86B0360C)
    if (e.mode === "blown" && e.clip === CLIP.blown && e.r < MOVE.out && Math.round(e.cf) % 3 === 0) this.emit("trail", z, t, e.at.x, e.at.y);
    // a press's dust, on its first frame out (0x86B06560)
    if (e.dust) { e.dust = false; this.emit("dust", z, t, e.at.x, e.at.y); }
  }
  // round the ring, catching up with its place (0x86B05C84)
  walk(e, t) {
    if (t < R.LEAD) return;
    if (e.r > R.RING_R) e.r = Math.max(R.RING_R, e.r - MOVE.walk);
    if (e.r < R.RING_R) e.r = Math.min(R.RING_R, e.r + MOVE.walk);
    const d = wrap(this.spot(e.z, t) - R.HOME[e.z] - e.off);
    e.off += Math.abs(d) > CATCH ? Math.sign(d) * CATCH : d;
  }
  // e's clip over by the frame before (0x8003ED14, read as it's drawn): the
  // state it goes on in, this frame
  ended(e, t) {
    const z = e.z, v = this.verdict[e.round];
    if (e.mode === "grab" && e.in && !e.heard && v) this.heard(e, v, t);
    if (e.cf < CLIP_FRAMES[e.clip]) return;
    const home = () => this.goHome(e, t - 1, Math.ceil((R.RING_R - e.r) / MOVE.back));
    switch (e.mode) {
      case "grab": // the next state (0x86B02A70): eat, if it's got some; strawberries all
        if (!e.in) break; // gone, back home (state 7); fruit the server hasn't told yet: on grabbing
        if (e.eats) this.goMode(e, "eat");
        else if (e.heard || this.rounds[e.round].kind !== R.FRUIT) home();
        else e.cf = CLIP_FRAMES[CLIP.grab];
        break;
      case "middle": this.goMode(e, "eat"); break;
      case "eat": home(); break; // (state 7)
      case "back": this.goMode(e, "walk"); break;
      case "blown": // 0xAF07 as clip 10 ends (0x86B02E00), then 11 and 12, then outside
        if (e.clip === CLIP.blown) { this.setClip(e, CLIP.dazed); this.emit("landed", z); }
        else if (e.clip === CLIP.dazed) this.setClip(e, CLIP.up);
        else this.goMode(e, "out");
        break;
      case "cheer": // eaten (state 13: 0x86B02C90), it walks in (21, 22: 0x86B07354), then hops
        if (e.clip === CLIP.eat) {
          Object.assign(e, { span: Math.max(1, Math.trunc(Math.abs(e.r - MOVE.cheer) / MOVE.walk)), r0: e.r, k: 0 });
          this.setClip(e, CLIP.walk);
        } else if (e.clip === CLIP.dash) this.setClip(e, CLIP.dash);
        break;
      case "sad": if (e.clip === CLIP.sad) this.setClip(e, CLIP.sulk); break; // (states 19, 20: 0x86B02F28)
    }
  }
  goBack(e) { e.bounce = (R.RING_R - e.r) / MOVE.bounce; this.goMode(e, "back"); }
  // back to its place in span frames, the first the one after frame t
  goHome(e, t, span) {
    e.span = Math.max(1, span);
    e.r0 = e.r;
    e.a0 = e.off;
    e.a1 = e.a0 + wrap(this.spot(e.z, t + e.span) - R.HOME[e.z] - e.a0);
    this.goMode(e, "home");
  }
  // e got in to the basket (45 from the middle) on frame t
  arrived(e, t) {
    const rd = this.rounds[e.round];
    Object.assign(e, { in: true, heard: false, eats: false });
    if (rd.kind === R.PINECO) { this.blowUp(e); return; }
    if (this.prize?.root.visible && this.contentsRound === e.round) this.gotIn.push(e);
    if (rd.kind === R.BERRIES) {
      // strawberries: it eats one from each pile still there this frame, 0xAF05 at its
      // first (0x86B03B40) and on to eating once its grab's over (next state 13: 0x86B03B48)
      const ins = this.players.map((p) => p.runner.in[e.round]), before = R.eat(rd, ins, t - 1);
      if (before.some((c) => c > 0)) {
        e.eats = true;
        this.emit("got", e.z, 0);
      }
    }
  }
  // e, grabbing in the basket, hears who's got the fruit on frame t: a lone
  // winner goes in to the middle (state 11, 0x86B03924), a tie eats where it
  // is; a loser (next state 14) bounces back at once, from 45 (0x86B02A94-0x86B02AEC)
  heard(e, v, t) {
    const z = e.z, rd = this.rounds[e.round];
    e.heard = true;
    if (rd.kind !== R.FRUIT) return;
    if (!v.got[z]) { e.r = R.REACH; this.goBack(e); this.emit("lost", z); return; }
    e.eats = true;
    this.emit("got", z, v.pts[z]);
    if (v.got.filter(Boolean).length === 1) { e.mode = "middle"; e.k = 0; }
  }
  blowUp(e) {
    this.goMode(e, "blown");
    this.blownNow.push(e.z);
  }
  // e starts eating: its prize gets a slot by its badge (0x86B02BE4: at the eat's
  // frame 0), the newest blinking while it eats; strawberries counted into it,
  // one a frame (0x86B02C08)
  ate(e, t) {
    const n = e.round, rd = this.rounds[n], p = this.players[e.z];
    if (e.slotted === n) return;
    e.slotted = n;
    const what = rd.kind === R.FRUIT ? (rd.fruit === R.MELON ? "melon" : "grapes") : "berries";
    p.won.push({ what, n, at: t, z: e.z });
  }
  // how many strawberries seat z's had in round n by frame t (the server's word, or the piles as they go here)
  berriesOf(z, n, t) {
    const v = this.verdict[n];
    if (v?.told) return Math.round(v.pts[z] / R.POINTS.berry);
    const pts = [0, 0, 0, 0];
    R.eat(this.rounds[n], this.players.map((p) => p.runner.in[n]), t, pts);
    return pts[z] / R.POINTS.berry;
  }
  // e's place on this frame (at = { x, y, face }). The screen shows it on
  // its way there from the last frame's (pose), as the round runs at 30 frames
  // a second and the screen at 60 or more; snap: straight there.
  place(e, r, ang, snap = false) {
    const x = r * Math.cos(ang), y = r * Math.sin(ang), was = e.at || { x, y, face: 0 };
    const dx = x - was.x, dy = y - was.y;
    // which way it faces: where it's going, walking round; the middle in a
    // dash, grabbing, eating, bouncing back; out when it's blown away
    let face = was.face;
    if (["dash", "grab", "middle", "eat", "back", "feint", "blown", "out", "idle", "cheer", "sad"].includes(e.mode)) face = Math.atan2(-x, -y);
    else if (dx * dx + dy * dy > 1e-4) face = Math.atan2(dx, dy);
    e.was = snap ? null : was;
    e.at = { x, y, face };
  }
  // e k of the way from the last frame's place to this one's, and its clip
  // and face that far between frames
  pose(e, k) {
    const a = e.was || e.at, b = e.at, root = e.m.root;
    root.position.set(a.x + (b.x - a.x) * k, 0, a.y + (b.y - a.y) * k);
    root.rotation.y = a.face + wrap(b.face - a.face) * k;
    e.shadow.position.set(root.position.x, 0.5, root.position.z);
    const f = e.cf0 + (e.cf - e.cf0) * k;
    e.m.pose(e.clip, f, LOOPS.has(e.clip) || e.clip === CLIP.dash && e.mode === "cheer");
    e.m.texanim(FACE[e.clip] ?? 0, LOOPS.has(e.clip) ? f % (CLIP_FRAMES[e.clip] + 1) : f);
  }
  setClip(e, c) {
    e.clip = c;
    e.cf = e.cf0 = 0;
    e.set = true;
    if (c === CLIP.eat && e.mode === "eat") this.ate(e, this.lastFrame + 1);
  }

  // ---- Aipom and its basket ----
  // clip 0 hangs on, 1 lifts (a fake: to its frame 5 and back down, 0x86B03404,
  // 0x86B0346C), 2 calls; from frame t
  setAipom(clip, fake, t) {
    this.aipomClip = clip;
    this.aipomFake = fake;
    this.aipomFrom = t;
  }
  // Aipom's frame t: back to hanging on after a fake or the call; a blink now and then
  aipomStep(t) {
    const k = t - this.aipomFrom;
    if (this.aipomFake && k >= 10) this.setAipom(AIPOM.idle, false, t);
    else if (this.aipomClip === AIPOM.call && k >= CALL_FRAMES) this.setAipom(AIPOM.idle, false, t);
    if (this.blink === null && Math.random() < BLINK) this.blink = t;
    if (this.blink !== null && t - this.blink >= BLINK_FRAMES) this.blink = null;
    // the basket's shadow fades as it's lifted (only then: 0x86B0B820)
    if (this.aipomClip === AIPOM.lift && !this.aipomFake) this.basketAlpha = this.liftAlpha(Math.min(LIFT_FRAMES, k));
  }
  liftAlpha(f) { return Math.trunc(128 * (1 - (f - 1) / 30) + 64 * ((f - 1) / 30)) / 255; }
  // Aipom and the basket's shadow at the game's frame now
  drawAipom(now) {
    const k = now - this.aipomFrom;
    let clip = this.aipomClip, f = Math.max(0, k);
    if (this.aipomFake) f = k < 5 ? Math.max(0, k) : Math.max(0, 10 - k);
    this.aipom.pose(clip, f, clip === AIPOM.idle);
    const b = this.blink === null ? -1 : now - this.blink;
    this.aipom.texanim(0, b >= 0 && b < BLINK_FRAMES ? b : 9);
    // (its size: the shared quad, the picture's 16, at 7 down; in the lift 7 to 3.5, in the call back)
    let s = SHADOW.down;
    if (clip === AIPOM.lift && !this.aipomFake) { const q = (Math.min(LIFT_FRAMES, f) - 1) / 30; s = SHADOW.down * (1 - q) + SHADOW.up * q; }
    if (clip === AIPOM.call) { const q = (Math.min(CALL_FRAMES, f) - 1) / 27; s = SHADOW.up * (1 - q) + SHADOW.down * q; }
    this.basketShadow.scale.set(s, 1, s);
    this.basketShadow.material.opacity = this.basketAlpha;
  }
  clearContents() {
    this.contents.clear();
    this.piles = null;
    this.pineco = null;
    this.prize = null;
    this.contentsRound = -1;
  }
  // The fruit's taken: it goes on the frame an Eevee gets in (0x86B03628), and
  // a copy of it (clip 1, held) pops up and fades out, from 255 (0x86B04970,
  // moved by 0x86B04870): for one Eevee straight up, 12, 12.5 or 13 a frame,
  // less 1 a frame, fading 5 a frame, for 25 frames; for a tie, 24 up, less 2,
  // fading 21, for 12 frames, and off away from them (-3/25 of where they are,
  // added up, a frame). A strawberry eaten flies the same way from its place on
  // the pile to its Eevee, 1/25 of the way a frame (object 211).
  taken(es, t) {
    this.prize.root.visible = false;
    const tie = es.length > 1;
    let vx = 0, vz = 0;
    if (tie) for (const e of es) { vx -= (3 * e.at.x) / 25; vz -= (3 * e.at.y) / 25; }
    this.fly(this.prizeAsset, FRUIT_SCALE, 1, t, new THREE.Vector3(), vx, vz, tie);
  }
  fly(asset, scale, clip, t, from, vx, vz, tie = false) {
    let f = this.spare.find((s) => s.asset === asset);
    if (f) this.spare.splice(this.spare.indexOf(f), 1);
    else {
      const m = makeModel(asset, scale);
      m.root.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.transparent = true; } });
      f = { asset, m };
    }
    f.m.pose(clip, 0);
    Object.assign(f, { t0: t, from: from.clone(), vx, vz, vy: tie ? 24 : [12, 12.5, 13][(Math.random() * 3) | 0],
                       g: tie ? 2 : 1, fade: tie ? 21 : 5, life: tie ? 12 : 25 });
    this.scene.add(f.m.root);
    this.flying.push(f);
  }
  land(f) {
    this.scene.remove(f.m.root);
    this.spare.push(f);
  }
  showContents(n) {
    this.clearContents();
    this.contentsRound = n;
    const rd = this.rounds[n], a = this.assets;
    const add = (asset, s) => { const m = makeModel(asset, s); m.pose(0, 0, true); this.contents.add(m.root); return m; };
    if (rd.kind === R.PINECO) this.pineco = add(a.pineco, PINECO_SCALE);
    else if (rd.kind === R.FRUIT) {
      this.prizeAsset = rd.fruit === R.MELON ? a.melon : a.grapes;
      this.prize = add(this.prizeAsset, FRUIT_SCALE);
    } else {
      this.piles = [];
      for (let k = 0; k < rd.piles; k++) {
        const m = add(a.strawberries, FRUIT_SCALE);
        if (rd.piles > 1) m.root.position.set(PILES[k][0], 0, PILES[k][1]);
        m.left = R.PILE;
        this.piles.push(m);
      }
    }
    this.openedAt = this.times[n].open;
  }
  // the prize as the race has it on frame t
  drawContents(n, t) {
    if (this.contentsRound !== n) return;
    const v = this.verdict[n], rd = this.rounds[n];
    // (the fruit goes as an Eevee gets in: taken; this for a winner online whose
    // dash never got here)
    if (this.prize && v?.got.some(Boolean) && t >= v.decided + R.FPS) this.prize.root.visible = false;
    if (this.piles) {
      // the piles go down as they're eaten: one off each a frame for each Eevee
      // there, flying to it; a pile shows fewer (its texture clip's frame 9 - left,
      // held: 0x86B04450), and goes once it's empty
      const ins = this.players.map((p) => p.runner.in[n]);
      const left = R.eat(rd, ins, t - 1), from = new THREE.Vector3();
      this.piles.forEach((m, k) => {
        if (left[k] <= 0) { m.root.visible = false; return; }
        for (let z = 0; z < 4; z++) {
          if (ins[z] === null || ins[z] > t) continue;
          left[k] = Math.max(0, left[k] - 1);
          const to = this.eevees[z].at; // (the strawberry that went, from its place on the pile: 0x86B03A68)
          m.bone("bone_" + String(left[k] + 1).padStart(2, "0"), from);
          this.fly(this.assets.strawberry, STRAWBERRY_SCALE, 0, t, from, (to.x - from.x) / 25, (to.y - from.z) / 25);
        }
        m.root.visible = left[k] > 0;
        m.texanim(0, Math.max(0, 8 - left[k]));
      });
    }
  }

  // ---- every rendered frame: all as the game has it between its frames ----
  animate(dt = 0) {
    const since = this.time * R.FPS - this.lastFrame, k = since > 0 ? Math.min(1, since) : 0;
    const now = this.lastFrame - 1 + k; // (the game's frame shown: the last one's on its way to this one)
    // (before GO the clips go on, as the game draws them every frame)
    if (this.state === "ready" || this.state === "idle") for (const e of this.eevees) e.cf = e.cf0 = e.cf + dt * R.FPS;
    for (const e of this.eevees) this.pose(e, k);
    this.drawAipom(now);
    for (const m of [this.prize, this.pineco, ...(this.piles || [])]) m?.pose(0, now - (this.openedAt ?? 0), true);
    for (let i = this.flying.length - 1; i >= 0; i--) {
      const f = this.flying[i], a = Math.max(0, now - f.t0);
      if (a >= f.life) { this.land(f); this.flying.splice(i, 1); continue; }
      f.m.root.visible = now >= f.t0;
      f.m.root.position.set(f.from.x + f.vx * a, f.from.y + f.vy * a - (f.g * a * (a - 1)) / 2, f.from.z + f.vz * a);
      const alpha = Math.max(0, 255 - f.fade * a) / 255;
      f.m.root.traverse((o) => { if (o.isMesh) o.material.opacity = alpha; });
    }
    this.drawn = now;
  }

  // ---- the end ----
  // the seats there ranked (an empty seat isn't: tools/eevee_rules.py places())
  results() {
    const order = this.players.map((p, i) => ({ i, score: p.total })).filter((r) => !this.empty[r.i]).sort((a, b) => b.score - a.score);
    return order.map((r) => ({ ...r, place: 1 + order.filter((q) => q.score > r.score).length }));
  }
  // The hand-over (0x86B09158-0x86B091DC): the top scorers eat (state 13; no one
  // if all four are: 0x86B0B5A8, here all those there), the others sulk (19),
  // wherever they are, the one outside the ring too
  celebrate() {
    const r = this.results();
    const all = r.every((x) => x.place === 1);
    this.winners = [0, 1, 2, 3].map((z) => !all && r.find((x) => x.i === z)?.place === 1);
    for (const x of r) {
      this.players[x.i].shown = this.players[x.i].total;
      const e = this.eevees[x.i];
      this.goMode(e, this.winners[x.i] ? "cheer" : "sad");
    }
    return r;
  }
}
