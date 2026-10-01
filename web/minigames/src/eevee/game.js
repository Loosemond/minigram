// An Eager Eevee round: the rules (rules.js) on the round's clock, and the
// scene they drive: Aipom over its basket in the middle of the ring, the four
// Eevee walking round it, and what's under the basket. In the game's units
// (y up, the ground at 0; the ring's angle a at (r cos a, 0, r sin a)).
//
// Who plays each seat: "local" (this device's player), "cpu", or "remote"
// (someone on another device, online). The seats this device plays emit
// "press" with the frame they pressed on, for sending on; a remote seat's
// presses come through the server a little later, and are shown as they get
// here. Online, who gets the prize is the server's word (told "got"): an
// Eevee that's got in waits for it, grabbing, as the game's do (clip 6) till
// the basket's contents say. Solo, the round's judged here.
import * as THREE from "three";
import { makeModel } from "./assets.js";
import * as R from "./rules.js";

const EEVEE_SCALE = 1 / 6, AIPOM_SCALE = 0.5, FRUIT_SCALE = 0.355556, PINECO_SCALE = 0.5; // (0x86B01158, 0x86B01268, 0x86B04500)
// Eevee's clips (object 143), by what the module plays them for (0x86B023FC,
// one per state): 0 waiting outside the ring, 2 walking, 5 the dash (and a
// feint), 6 grabbing, 7 eating (and the winners at the end), 8 bounced back,
// 10 blown up by a Pineco, 11 and 12 coming round, 13 the others at the end
const CLIP = { wait: 0, walk: 2, dash: 5, grab: 6, eat: 7, back: 8, blown: 10, dazed: 11, up: 12, sad: 13 };
const CLIP_FRAMES = [29, 9, 23, 22, 9, 6, 43, 49, 42, 43, 62, 19, 29, 59, 19];
const LOOPS = new Set([CLIP.wait, CLIP.walk]);
// Aipom's (object 150): 0 hangs on, 1 lifts the basket (up from frame 5), 2
// lowers it and calls the round
const AIPOM = { idle: 0, lift: 1, call: 2 };
const CALL_FRAMES = 28, LIFT_FRAMES = 29;
// the dash: in at 28 a frame to 75, where the basket is, then 14 a frame to
// 45. A feint goes out to 100 and walks back in 8 frames (0x86B06674: 3.75 a
// frame). Bounced back, from where it was, in 14 frames (0x86B063A0). Blown
// away: 8.4375 a frame out to 180 (0x86B07234). Back to the ring: 1.23 a frame.
const MOVE = { dash: 28, near: 75, run: 14, feint: 100, back: 3.75, bounce: 14, blown: 8.4375, out: 180, walk: 1.23 };
const CATCH = R.CATCH / R.UNIT, TAU = 2 * Math.PI;
const wrap = (a) => a - TAU * Math.round(a / TAU); // to (-pi, pi]
// the final round's three piles (0x86B04500: offsets in the basket's units)
const PILES = [[0, 0], [-27, -20], [27, -20]];
const COUNT = 25; // points a frame, as they go up on a card

export class Game {
  constructor(scene, assets) {
    this.scene = scene;
    this.assets = assets;
    this.listeners = {};
    this.state = "idle";
    this.time = 0;
    this.shake = 0;
    this.me = 0;
    this.aipom = makeModel(assets.aipom, AIPOM_SCALE);
    scene.add(this.aipom.root);
    this.eevees = [0, 1, 2, 3].map((z) => {
      const m = makeModel(assets.eevee, EEVEE_SCALE);
      scene.add(m.root);
      return { z, m, mode: "walk", r: R.RING_R, off: 0, clip: -1, cf: 0, k: 0 };
    });
    this.contents = new THREE.Group(); // what's under the basket
    scene.add(this.contents);
    this.rounds = R.deal(1, 2);
    this.times = R.timeline(this.rounds);
    this.players = [0, 1, 2, 3].map(() => ({ total: 0, shown: 0, prizes: [], runner: new R.Runner(this.times, this.rounds) }));
    this.verdict = [];
    this.waiting();
  }
  on(name, fn) { (this.listeners[name] ||= []).push(fn); }
  emit(name, ...args) { for (const fn of this.listeners[name] || []) fn(...args); }

  // A round. level: easy / normal / hard; setup: { me, control } and,
  // online, the server's round: { level (its code), scores, prizes } (to rejoin it midway).
  reset(level, seed = (Math.random() * 2 ** 31) | 0, setup = {}) {
    this.levelName = level;
    this.seed = seed;
    this.me = setup.me ?? 0;
    this.control = setup.control || [0, 1, 2, 3].map((z) => (z === this.me ? "local" : "cpu"));
    this.level = setup.level ?? R.levelCode(level, this.control.includes("cpu"));
    this.rounds = R.deal(seed, this.level);
    this.times = R.timeline(this.rounds);
    this.end = this.times[R.ROUNDS - 1].end / R.FPS;
    this.time = 0;
    this.state = "ready";
    this.shake = 0;
    this.online = this.control.includes("remote");
    this.cpuQ = R.quad(seed ^ 0x6d2b79f5); // the CPUs' plans
    this.foolQ = R.quad(seed ^ 0x1b873593); // and their falling for a feint
    this.players = [0, 1, 2, 3].map((z) => ({
      total: setup.scores?.[z] ?? 0,
      shown: setup.scores?.[z] ?? 0, // what the card shows: the points go up
      prizes: (setup.prizes?.[z] || []).slice(), // by round: "melon", "grapes", "berries", "pineco" or null
      runner: new R.Runner(this.times, this.rounds),
      plan: null, // a CPU's, this round
      reaction: null, // { n, v (1/100 s), at (s) }
    }));
    this.verdict = this.rounds.map(() => null); // by round: { pts, got, decided, ... } once it's known
    this.planned = -1;
    this.lastFrame = -1;
    this.waiting();
  }
  // before GO (and behind the title): at their places, waiting
  waiting() {
    for (const e of this.eevees) {
      e.mode = "idle";
      e.r = R.RING_R;
      e.off = 0;
      this.setClip(e, CLIP.wait);
      this.place(e, e.r, R.HOME[e.z]);
    }
    // the basket's up to begin with (G+0x44 starts at 1: 0x86B0D3C8), and the
    // first round's call brings it down
    this.setAipom(AIPOM.lift);
    this.aipom.seek(LIFT_FRAMES);
    this.clearContents();
  }
  start() {
    this.state = "play";
    for (const e of this.eevees) { e.mode = "walk"; this.setClip(e, CLIP.walk); }
  }
  stop() { this.state = "over"; }
  setControl(z, c) { this.control[z] = c; }

  get frame() { return Math.floor(this.time * R.FPS + 1e-6); }
  roundAt(t) { return R.roundAt(this.times, t); }
  // the round on, for the HUD: { n, T, rd, k (frames into it) }
  get now() {
    const t = Math.min(this.frame, this.times[R.ROUNDS - 1].end - 1), n = this.roundAt(t);
    return { n, T: this.times[n], rd: this.rounds[n], t };
  }

  // ---- input ----
  // this device's player pressed A ("a", the dash) or B ("b", the feint)
  press(k, z = this.me) {
    if (this.state !== "play" || this.control[z] === "remote") return false;
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
    if (res.k === "b") {
      this.goMode(e, "feint");
      this.emit("feint", z);
      if (this.control.includes("cpu")) this.fooled(z, res.t);
      return;
    }
    this.goMode(e, "dash");
    e.bonk = !!res.bonk;
    if (!res.bonk) {
      const v = R.reaction(T, res.t, ((this.seed >>> 3) + z * 7 + res.n * 13) % 3);
      if (v >= 0) p.reaction = { n: res.n, v, at: this.time };
    }
    this.emit("dash", z);
  }

  // the server's word: a remote seat's press ("press": { s, k, f }), or a
  // round's prizes ("got": { n, p (points by seat), e (totals after), d (the frame it was decided) })
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
    }
  }

  get score() { return this.players.map((p) => p.shown); }

  // ---- the round, frame by frame ----
  update(dt) {
    if (this.state === "play") {
      this.time += dt;
      if (this.time >= this.end) { this.state = "over"; this.emit("finish"); }
    }
    if (this.state === "play" || this.state === "over") {
      const to = Math.min(this.frame, this.times[R.ROUNDS - 1].end - 1);
      for (let t = this.lastFrame + 1; t <= to; t++) this.step(t);
      this.lastFrame = Math.max(this.lastFrame, to);
    }
    this.animate(dt);
    this.shake = Math.max(0, this.shake - dt);
  }

  // what happens on frame t (from GO)
  step(t) {
    const n = this.roundAt(t), T = this.times[n], rd = this.rounds[n];
    if (t === T.start) {
      this.setAipom(AIPOM.call); // the basket comes down over the next prize
      this.clearContents();
      for (const e of this.eevees) if (!["walk", "blown", "out"].includes(e.mode)) this.goHome(e, t, Math.ceil(Math.abs(R.RING_R - e.r) / MOVE.back) || 1);
      this.emit("round", n);
    }
    if (t === T.play && this.planned < n) this.planCpus(n);
    // a fake: the music and effects hush 5 frames before it (0x86B01838) till
    // the basket's back down, clip 1 played back below its frame 0 (0x86B034A0)
    for (const f of T.fakes) {
      if (t === f - 5) this.emit("hush", n);
      if (t === f) { this.setAipom(AIPOM.lift, true); this.emit("fake", n); }
      if (t === f + 11) this.emit("unhush", n);
    }
    if (t === T.open) {
      this.setAipom(AIPOM.lift);
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
    for (const e of this.eevees) this.move(e, t);
    if (this.gotIn.length) this.taken(this.gotIn, t);
    // who gets the prize (solo; online the server says)
    if (!this.online && !this.verdict[n]) {
      const res = R.judge(rd, T, this.players.map((p) => p.runner.in[n]));
      if (res && t >= res.decided) this.decide(n, res);
    }
    this.drawContents(n, t);
    for (const p of this.players) if (p.shown !== p.total) p.shown += Math.sign(p.total - p.shown) * Math.min(COUNT, Math.abs(p.total - p.shown));
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
    const rd = this.rounds[n];
    for (let z = 0; z < 4; z++) {
      const p = this.players[z];
      if (!res.told) p.total += res.pts[z] - (was ? was.pts[z] : 0);
      if (res.got[z]) p.prizes[n] = rd.kind === R.FRUIT ? (rd.fruit === R.MELON ? "melon" : "grapes") : "berries";
      else if (p.prizes[n] !== "pineco") p.prizes[n] = null;
    }
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
    if (clip !== undefined && !(clip === CLIP.walk && e.clip === CLIP.walk)) this.setClip(e, clip);
  }
  // e's frame t: where it goes, by what it's doing (0x86B057B0's states)
  move(e, t) {
    const z = e.z;
    e.k++;
    switch (e.mode) {
      case "walk": { // round the ring, catching up with its place (0x86B05C84)
        if (e.r > R.RING_R) e.r = Math.max(R.RING_R, e.r - MOVE.walk);
        if (e.r < R.RING_R) e.r = Math.min(R.RING_R, e.r + MOVE.walk);
        const d = wrap(this.spot(z, t) - R.HOME[z] - e.off);
        e.off += Math.abs(d) > CATCH ? Math.sign(d) * CATCH : d;
        break;
      }
      case "dash": // in to the basket; into it, if it's not up yet
        if (e.r > MOVE.near) e.r = Math.max(MOVE.near, e.r - MOVE.dash);
        else if (e.bonk) { this.goBack(e); this.emit("bonk", z); this.shakeIf(z, 0.15); }
        else {
          e.r = Math.max(R.REACH, e.r - MOVE.run);
          if (e.r <= R.REACH) this.arrived(e);
        }
        break;
      case "grab": { // waiting to hear (clip 6); a winner on its own goes in to the middle
        const v = this.verdict[e.round];
        if (!e.won && v) this.heard(e, v);
        if (e.won && e.middle) e.r = Math.max(0.01, e.r - MOVE.run);
        if (e.won && e.cf >= CLIP_FRAMES[CLIP.grab] - 1) this.goMode(e, "eat");
        break;
      }
      case "eat":
        if (e.k <= 25) this.emit("munch", z); // (0xCA0F while it's eating: 0x86B01A24)
        if (e.cf >= CLIP_FRAMES[CLIP.eat] - 1) this.goHome(e, t, Math.ceil((R.RING_R - e.r) / MOVE.back));
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
        if (e.cf >= CLIP_FRAMES[CLIP.back] - 1) this.goMode(e, "walk");
        break;
      case "blown": // thrown out, then coming round (0x86B02D88)
        e.r = Math.min(MOVE.out, e.r + MOVE.blown);
        if (e.cf >= CLIP_FRAMES[e.clip] - 1) {
          if (e.clip === CLIP.blown) { this.setClip(e, CLIP.dazed); this.emit("landed", z); }
          else if (e.clip === CLIP.dazed) this.setClip(e, CLIP.up);
          else this.goMode(e, "out");
        }
        break;
      case "out": // outside the ring till its place comes round (0x86B05A78), then it walks in
        if (t >= e.backAt) { e.off = wrap(e.off - (this.spot(z, t) - R.HOME[z])) + this.spot(z, t) - R.HOME[z]; this.goMode(e, "walk"); }
        break;
    }
    this.place(e, e.r, R.HOME[z] + e.off);
  }
  goBack(e) { e.bounce = (R.RING_R - e.r) / MOVE.bounce; this.goMode(e, "back"); }
  goHome(e, t, span) {
    e.span = Math.max(1, span);
    e.r0 = e.r;
    e.a0 = e.off;
    e.a1 = e.a0 + wrap(this.spot(e.z, t + e.span) - R.HOME[e.z] - e.a0);
    this.goMode(e, "home");
  }
  shakeIf(z, s) { if (z === this.me) this.shake = Math.max(this.shake, s); }
  // e got in to the basket
  arrived(e) {
    e.won = false;
    if (this.rounds[e.round].kind === R.PINECO) { this.blowUp(e); return; }
    if (this.prize?.root.visible && this.contentsRound === e.round) this.gotIn.push(e);
    this.goMode(e, "grab");
    const v = this.verdict[e.round];
    if (v) this.heard(e, v);
  }
  // e, grabbing, hears who's got the prize: it eats (a winner on its own in
  // the middle: 0x86B06430), or bounces back
  heard(e, v) {
    const z = e.z, rd = this.rounds[e.round];
    if (!v.got[z]) { this.goBack(e); this.emit("lost", z); return; }
    e.won = true;
    e.middle = rd.kind === R.FRUIT && v.got.filter(Boolean).length === 1;
    this.emit("got", z, v.pts[z]);
    this.shakeIf(z, 0.1);
  }
  blowUp(e) {
    const z = e.z;
    this.goMode(e, "blown");
    e.backAt = this.players[z].runner.ready - R.WALK_IN; // (when it's back at its place: rules.js Runner)
    this.players[z].prizes[e.round] = "pineco";
    this.emit("blown", z);
    this.shakeIf(z, 0.35);
  }
  place(e, r, ang) {
    const x = r * Math.cos(ang), y = r * Math.sin(ang), root = e.m.root;
    const dx = x - root.position.x, dy = y - root.position.z;
    // which way it faces: where it's going, walking round; the middle in a
    // dash, grabbing, eating, bouncing back; out when it's blown away
    if (["dash", "grab", "eat", "back", "feint", "blown", "out", "idle", "cheer", "sad"].includes(e.mode)) root.rotation.y = Math.atan2(-x, -y);
    else if (dx * dx + dy * dy > 1e-4) root.rotation.y = Math.atan2(dx, dy);
    root.position.set(x, 0, y);
  }

  // ---- Aipom and its basket ----
  setAipom(clip, fake = false) {
    this.aipomClip = clip;
    this.aipomFake = fake;
    this.aipomT = 0;
    this.aipom.play(clip, { loop: clip === AIPOM.idle, restart: true, fade: 0.05 });
  }
  clearContents() {
    if (this.flying) this.land();
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
  // added up, a frame).
  taken(es, t) {
    this.prize.root.visible = false;
    const tie = es.length > 1, m = makeModel(this.prizeAsset, FRUIT_SCALE);
    m.play(1, { loop: false, fade: 0, restart: true });
    m.seek(0);
    m.update(0);
    m.root.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.transparent = true; } });
    this.contents.add(m.root);
    let vx = 0, vz = 0;
    if (tie) for (const e of es) { vx -= (3 * e.m.root.position.x) / 25; vz -= (3 * e.m.root.position.z) / 25; }
    this.flying = { m, t0: t / R.FPS, vx, vz, vy: tie ? 24 : [12, 12.5, 13][(Math.random() * 3) | 0],
                    g: tie ? 2 : 1, fade: tie ? 21 : 5, life: tie ? 12 : 25 };
    this.fly();
  }
  fly() {
    const f = this.flying, k = Math.max(0, (this.time - f.t0) * R.FPS); // (frames since)
    if (k >= f.life) { this.land(); return; }
    f.m.root.position.set(f.vx * k, f.vy * k - (f.g * k * (k - 1)) / 2, f.vz * k);
    const a = Math.max(0, 255 - f.fade * k) / 255;
    f.m.root.traverse((o) => { if (o.isMesh) o.material.opacity = a; });
  }
  land() {
    const f = this.flying;
    this.flying = null;
    this.contents.remove(f.m.root);
    f.m.root.traverse((o) => { if (o.isMesh) o.material.dispose(); });
  }
  showContents(n) {
    this.clearContents();
    this.contentsRound = n;
    const rd = this.rounds[n], a = this.assets;
    const add = (asset, s) => { const m = makeModel(asset, s); m.play(0, { loop: true, restart: true, fade: 0 }); this.contents.add(m.root); return m; };
    if (rd.kind === R.PINECO) this.pineco = add(a.pineco, PINECO_SCALE);
    else if (rd.kind === R.FRUIT) {
      this.prizeAsset = rd.fruit === R.MELON ? a.melon : a.grapes;
      this.prize = add(this.prizeAsset, FRUIT_SCALE);
    }
    else {
      this.piles = [];
      for (let k = 0; k < rd.piles; k++) {
        const m = add(a.strawberries, FRUIT_SCALE);
        if (rd.piles > 1) m.root.position.set(PILES[k][0], 0, PILES[k][1]);
        this.piles.push(m);
      }
    }
  }
  // the prize as the race has it on frame t
  drawContents(n, t) {
    if (this.contentsRound !== n) return;
    const v = this.verdict[n], rd = this.rounds[n];
    // (the fruit goes as an Eevee gets in: taken; this for a winner online whose
    // dash never got here)
    if (this.prize && v?.got.some(Boolean) && t >= v.decided + R.FPS) this.prize.root.visible = false;
    if (this.piles) { // the piles go down as they're eaten
      const left = v && t > v.decided ? this.piles.map(() => 0) : R.eat(rd, this.players.map((p) => p.runner.in[n]), t);
      this.piles.forEach((m, k) => {
        m.root.visible = left[k] > 0;
        m.root.scale.setScalar(0.45 + 0.55 * left[k] / R.PILE);
      });
    }
  }

  // ---- every rendered frame ----
  animate(dt) {
    for (const e of this.eevees) {
      e.cf += dt * R.FPS;
      if (LOOPS.has(e.clip)) e.cf %= CLIP_FRAMES[e.clip];
      e.m.update(dt);
    }
    // Aipom: a fake lifts the basket to frame 5 and drops it (clip 1
    // backwards: 0x86B0346C); the call goes back to hanging on
    this.aipomT += dt * R.FPS;
    if (this.aipomFake) {
      const k = this.aipomT;
      this.aipom.seek(k < 5 ? k : Math.max(0, 10 - k));
      if (k >= 10) this.setAipom(AIPOM.idle);
    } else if (this.aipomClip === AIPOM.call && this.aipomT >= CALL_FRAMES) this.setAipom(AIPOM.idle);
    this.aipom.update(dt);
    for (const m of [this.prize, this.pineco, ...(this.piles || [])]) m?.update(dt);
    if (this.flying) this.fly();
  }
  setClip(e, c) {
    e.clip = c;
    e.cf = 0;
    e.m.play(c, { loop: LOOPS.has(c), restart: true, fade: 0.08 });
  }

  // ---- the end ----
  results() {
    const order = this.players.map((p, i) => ({ i, score: p.total })).sort((a, b) => b.score - a.score);
    return order.map((r) => ({ ...r, place: 1 + order.filter((q) => q.score > r.score).length }));
  }
  // the winners eat, the others are sad (0x86B08F20: a four-way tie has no winner)
  celebrate() {
    const r = this.results();
    const all = r.every((x) => x.place === 1);
    for (const x of r) {
      this.players[x.i].shown = this.players[x.i].total;
      const e = this.eevees[x.i];
      if (e.mode === "blown" || e.mode === "out") continue;
      this.goMode(e, x.place === 1 && !all ? "cheer" : "sad");
      this.place(e, e.r, R.HOME[e.z] + e.off);
    }
    return r;
  }
}
