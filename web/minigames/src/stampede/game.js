// A Streaming Stampede game: the rules (rules.js) on the round's clock, and
// the scene they drive. The studio (the circus backdrop, the ramp, the books)
// has the four booths along the back, each with its player (Cleffa or
// Igglybuff) inside, its lamp and a three-digit screen; the Pokemon go by on
// the floor in front, right to left. In the game's units (y up).
//
// Five questions, each a card (what to count), the counting (the stream) and
// the answer (the counts, the right one, the points). A question is made when
// it comes up, from the totals so far (rules.js after()), so the timeline
// grows as the game goes.
//
// Who plays each seat: "local" (this device's player), "cpu" or "remote"
// (someone on another device, online). The CPUs' presses come from the
// round's seed, so every device runs them the same. The seats this device
// plays emit "press" with the question and the frame, for sending on; online,
// each answer's counts and points are the server's word (told "ans").
import * as THREE from "three";
import { makeModel, makeSprite, makeShadow } from "./assets.js";
import * as R from "./rules.js";

export const BOOTH_X = [-157.5, -52.5, 52.5, 157.5]; // the booths (0x86900E5C), 1P-4P
const BOOTH_Y = 10;
const PROP = 0.1, PLAYER = 0.075; // their scales (0x86900C30, 0x86900938)
const RISE = 0.61; // a booth goes up this much a point, at the end (0x8690A7F0)
// the lamps: dark and bright, blue, green, red and yellow for 1P-4P (the
// booths' face clip, frames 2i and 2i + 1: 0x8690EBA0)
const LAMP = [[0x205273, 0x52def6], [0x207329, 0x4af64a], [0x8b1818, 0xff3939], [0x7b8318, 0xeeff29]];
// the players' clips (Cleffa 114, Igglybuff 119): 0 idle, 1 lost (at the
// end), 2 a cheer (a right count, and the winners), 3 off by 3 or more
const CLIP = { idle: 0, lost: 1, cheer: 2, off: 3 };
const TURN = (273 / 65536) * 2 * Math.PI, TURN_BACK = (0x444 / 65536) * 2 * Math.PI; // a frame (0x86901640)
const DIP = [3, 1, 0.5]; // down, on a press and the two frames after
const SPIN = (8 * Math.PI) / 180; // a frame, the losers' booths at the end (0x869004AC)

export class Game {
  constructor(scene, assets) {
    this.scene = scene;
    this.assets = assets;
    this.listeners = {};
    for (const name of ["backdrop", "ramp", "books"]) scene.add(makeModel({ scene: assets[name] }, PROP).root);
    this.booths = [0, 1, 2, 3].map((i) => this.makeBooth(i));
    this.sprites = new THREE.Group();
    scene.add(this.sprites);
    this.shown = []; // the Pokemon on show: { o (the question's record), sprite, shadow }
    this.camK = 0; // the camera, from the game's view (0) to the results' (1)
    this.reset("normal");
    this.state = "idle";
  }
  on(name, fn) { (this.listeners[name] ||= []).push(fn); }
  emit(name, ...args) { for (const fn of this.listeners[name] || []) fn(...args); }

  makeBooth(i) {
    const group = new THREE.Group();
    group.position.set(BOOTH_X[i], BOOTH_Y, 0);
    const booth = makeModel({ scene: this.assets.booths[i] }, PROP);
    group.add(booth.root);
    this.scene.add(group);
    group.updateMatrixWorld(true);
    const bone = (name) => {
      let b = null;
      booth.root.traverse((o) => { if (o.name === name) b = o; });
      return b ? group.worldToLocal(b.getWorldPosition(new THREE.Vector3())) : new THREE.Vector3();
    };
    // the lamp on top (its face clip: plain colours)
    let lamp = null;
    booth.root.traverse((o) => {
      if (o.isMesh && /_tex04_face0$/.test(o.material.name)) { o.material = o.material.clone(); o.material.map = null; lamp = o.material; }
    });
    // the screen's three digits, on bones 1-3 (0x8690CCB8)
    const digits = [1, 2, 3].map((k) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(16, 16), new THREE.MeshBasicMaterial({ transparent: true, alphaTest: 0.05 }));
      m.position.copy(bone("bone_0" + k)).add(new THREE.Vector3(0, 0, 0.5));
      group.add(m);
      return m;
    });
    // its player, on bone 4 (0x86900698): Cleffa in 1P and 3P, Igglybuff in 2P and 4P
    const holder = new THREE.Group();
    holder.position.copy(bone("bone_04"));
    group.add(holder);
    const kind = i % 2 ? "igglybuff" : "cleffa";
    const model = makeModel(this.assets[kind], PLAYER);
    holder.add(model.root);
    const b = { i, group, booth, lamp, digits, holder, model, kind, clip: -1, yaw: 0, rise: 0, spin: 0, sink: 0, end: null };
    this.setLamp(b, false);
    this.setClip(b, CLIP.idle, { from: (Math.random() * 20) | 0 });
    return b;
  }

  // A game. level: easy / normal / hard; setup: { me, control, cpus (which
  // seats are CPUs), told (online, the server's answers so far: to rejoin it midway) }
  reset(level, seed = (Math.random() * 2 ** 31) | 0, setup = {}) {
    this.levelName = level;
    this.seed = seed;
    this.me = setup.me ?? 0;
    this.control = setup.control || [0, 1, 2, 3].map((z) => (z === this.me ? "local" : "cpu"));
    this.cpus = setup.cpus || this.control.map((c) => c === "cpu");
    this.people = !this.cpus.some(Boolean); // four people: the game's level 1, going up as they're all perfect
    this.comLevel = R.LEVELS[level] || 2;
    this.online = this.control.includes("remote");
    this.qs = [];
    this.at = [];
    this.states = [R.setup(this.people ? 1 : this.comLevel)];
    this.verdicts = [];
    this.players = [0, 1, 2, 3].map(() => ({ total: 0, shown: 0, presses: [[], [], [], [], []], pressAt: -9, lampAt: -9, risen: 0 }));
    (setup.told || []).forEach((v, q) => { if (v) this.told("ans", { n: q, ...v }); });
    this.time = 0;
    this.state = "ready";
    this.shake = 0;
    this.lastFrame = -1;
    this.end = Infinity;
    this.camK = 0;
    this.clearSprites();
    for (const b of this.booths) {
      b.yaw = b.rise = b.spin = b.sink = 0;
      b.end = null;
      this.setLamp(b, false);
      this.setClip(b, CLIP.idle, { from: (Math.random() * 20) | 0 });
    }
    this.prepare(0);
    this.showDigits();
  }
  start() { this.state = "play"; }
  stop() { this.state = "over"; }
  setControl(z, c) { this.control[z] = c; }

  get frame() { return Math.floor(this.time * R.FPS + 1e-6); }
  // question q, made when it comes up (from the totals after the one before)
  prepare(q) {
    if (this.qs[q] || q >= R.QUESTIONS) return this.qs[q];
    if (q > 0) this.states[q] = R.after(this.qs[q - 1].state, q - 1, this.totals(q - 1), this.people);
    const Q = R.question(this.seed, q, this.states[q], this.totals(q - 1), this.comLevel);
    Q.cpuPresses = [0, 1, 2, 3].map((z) => (this.cpus[z] ? R.cpuPresses(Q, this.comLevel, z) : null));
    this.qs[q] = Q;
    const start = q ? this.at[q - 1].end : 0;
    const count = start + R.CARD, answer = count + Q.frames, last = q === R.QUESTIONS - 1;
    this.at[q] = { start, count, answer, judged: answer + (last ? R.LAST_JUDGED : R.JUDGED), end: answer + (last ? R.LAST_ANSWER : R.ANSWER) };
    if (last) this.end = this.at[q].end / R.FPS;
    return Q;
  }
  // the question on at frame t (making the next ones as they come)
  qAt(t) {
    let q = this.at.length - 1;
    while (q > 0 && t < this.at[q].start) q--;
    while (t >= this.at[q].end && q < R.QUESTIONS - 1) { this.prepare(q + 1); q++; }
    return q;
  }
  // the question on now, for the HUD: { q, Q, T, t (frames into it), k (into its counting, or its answer) }
  get now() {
    const t = Math.max(0, Math.min(this.frame, this.at[this.at.length - 1].end - 1)), q = this.qAt(t), T = this.at[q];
    return { q, Q: this.qs[q], T, t: t - T.start, f: t - T.count, k: t - T.answer };
  }
  // each seat's total after question q (-1: before the first)
  totals(q) {
    return [0, 1, 2, 3].map((z) => {
      let s = 0;
      for (let n = 0; n <= q; n++) s += this.verdict(n)?.pts[z] ?? 0;
      return s;
    });
  }
  // question q's counts and points: the server's (online), or as counted here
  verdict(q) {
    if (this.verdicts[q]) return this.verdicts[q];
    const Q = this.qs[q];
    if (!Q) return null;
    const counts = [0, 1, 2, 3].map((z) => this.count(z, q));
    return { counts, pts: counts.map((c) => R.points(q, c, Q.answer)) };
  }
  // seat z's count for question q so far
  count(z, q, upto = Infinity) {
    const Q = this.qs[q], p = this.players[z];
    if (!Q) return 0;
    const list = this.cpus[z] && Q.cpuPresses[z] ? Q.cpuPresses[z] : p.presses[q];
    let n = 0;
    for (const f of list) if (f <= upto) n++;
    return Math.min(R.MAX_COUNT, n);
  }

  // ---- input ----
  // this device's player pressed A (or tapped): one more, while the counting's on
  press(z = this.me) {
    if (this.state !== "play" || this.control[z] === "remote" || this.cpus[z]) return false;
    const t = this.frame, q = this.qAt(t), T = this.at[q], f = t - T.count;
    if (f < 0 || t >= T.answer) return false;
    const p = this.players[z];
    if (p.presses[q].length >= R.MAX_COUNT || p.presses[q].includes(f)) return false; // (one a frame, as the game reads a new press)
    p.presses[q].push(f);
    this.pressed(z, t);
    this.emit("press", { s: z, n: q, f });
    return true;
  }
  pressed(z, t) {
    const p = this.players[z];
    p.pressAt = p.lampAt = t;
    this.emit("count", z);
  }

  // the server's word: a remote seat's press ("count": { s, n, f }), or an
  // answer's counts and points ("ans": { n, c (counts), p (points), e (totals after) })
  told(type, m) {
    if (type === "count") {
      const z = m.s, q = m.n, p = this.players[z];
      if (!p || this.cpus[z] || this.control[z] === "local" || !(q >= 0 && q < R.QUESTIONS) || !Number.isInteger(m.f)) return;
      if (p.presses[q].includes(m.f) || p.presses[q].length >= R.MAX_COUNT) return;
      p.presses[q].push(m.f);
      const T = this.at[q];
      if (T && this.frame < T.answer + 2) this.pressed(z, this.frame);
      return;
    }
    if (type === "ans") {
      const q = m.n;
      if (!(q >= 0 && q < R.QUESTIONS) || !Array.isArray(m.c) || !Array.isArray(m.p)) return;
      const before = this.totals(q);
      this.verdicts[q] = { counts: m.c.map((x) => x | 0), pts: m.p.map((x) => x | 0), told: true };
      const after = this.totals(q);
      // already judged here: the server's points instead of these
      const T = this.at[q];
      if (T && this.lastFrame >= T.judged) {
        for (let z = 0; z < 4; z++) {
          const p = this.players[z];
          p.total += after[z] - before[z];
          if (p.shown > p.total) p.shown = p.total;
        }
      }
      // the next question, if it was made from other totals and hasn't begun
      const next = this.qs[q + 1];
      if (next && this.lastFrame < this.at[q + 1].count &&
          JSON.stringify(R.after(this.qs[q].state, q, after, this.people)) !== JSON.stringify(this.states[q + 1])) {
        this.qs.length = this.at.length = this.states.length = q + 1;
        this.end = Infinity;
        this.prepare(q + 1);
        if (this.lastFrame >= this.at[q + 1].start) this.showStream(q + 1);
      }
    }
  }

  get score() { return this.players.map((p) => p.shown); }

  // ---- the game, frame by frame ----
  update(dt) {
    if (this.state === "play") {
      this.time += dt;
      if (this.time >= this.end) { this.state = "over"; this.emit("finish"); }
    }
    if (this.state === "play" || this.state === "over") {
      const to = Math.min(this.frame, this.end * R.FPS - 1);
      for (let t = this.lastFrame + 1; t <= to; t++) { this.step(t); this.lastFrame = t; }
    }
    this.animate(dt);
    this.shake = Math.max(0, this.shake - dt);
  }

  // what happens on frame t (from GO)
  step(t) {
    const q = this.qAt(t), Q = this.qs[q], T = this.at[q], last = q === R.QUESTIONS - 1;
    if (t === T.start) {
      this.showStream(q);
      this.emit("card", q);
    }
    if (t === T.start + 36) this.emit("cardOn", q); // (0x3F03)
    const f = t - T.count;
    if (f >= 0 && t < T.answer) {
      // the CPUs' presses (0x8690B984)
      for (let z = 0; z < 4; z++) if (this.cpus[z] && Q.cpuPresses[z]?.includes(f)) this.pressed(z, t);
      if (f === Q.last + 1 + R.STOP) this.emit("stop", q);
      this.turn(f > Q.last + R.STOP ? "back" : this.lookAt(f));
    }
    if (t === T.answer) { this.clearSprites(); this.emit("reveal", q); }
    const k = t - T.answer;
    if (k < 0) return;
    if (!last) {
      if (k === 30) this.emit("answerIs", q);
      if (k === 59) this.emit("drum", q);
      if (k === 60) this.emit("answer", q);
      if (k === R.JUDGED) this.judge(q);
      if (k >= R.JUDGED) this.tally(q, k - R.JUDGED, "tally");
    } else {
      // the last: the columns go up to the totals so far (state 8: 0x86909FAC)
      if (k === 29) this.emit("results", q);
      if (k >= 29 && k < 29 + 120) this.camK = (1 - Math.cos((Math.PI * (k - 29)) / 120)) / 2;
      if (k >= 29 && k < R.LAST_JUDGED && (k - 29) % 2 === 0) {
        const before = this.totals(q - 1);
        let any = false;
        for (let z = 0; z < 4; z++) {
          const p = this.players[z];
          if (p.risen < before[z]) { p.risen++; p.lampAt = t; any = true; }
        }
        if (any) this.emit("rise");
      }
      if (k === R.LAST_COUNTS) this.emit("whoIs", q);
      if (k === R.LAST_COUNTS + 30) this.emit("answerIs", q);
      if (k === 29 + 180) this.emit("answer", q);
      if (k === R.LAST_JUDGED) this.judge(q);
      if (k >= R.LAST_JUDGED) this.tally(q, k - R.LAST_JUDGED, "tallyLast");
    }
    // reactions, a few frames after the judging (0x86909680): a right count
    // cheers, one off by 3 or more is let down
    const judged = last ? R.LAST_JUDGED : R.JUDGED;
    if (!last && k >= judged && k < judged + 6) {
      const v = this.verdict(q);
      for (let z = 0; z < 4; z++) {
        if (k !== judged + R.reactDelay(this.seed, q, z)) continue;
        const d = Math.abs(v.counts[z] - Q.answer);
        if (d === 0) this.setClip(this.booths[z], CLIP.cheer, { from: 11, loop: false });
        else if (d >= 3) this.setClip(this.booths[z], CLIP.off, { loop: false });
      }
    }
  }

  // question q's points (0x869053B4): the server's, online, if they're here
  judge(q) {
    const v = this.verdict(q), Q = this.qs[q];
    this.verdicts[q] ||= v;
    for (let z = 0; z < 4; z++) this.players[z].total += v.pts[z];
    const right = v.counts.some((c) => c === Q.answer), scored = v.pts.some((x) => x > 0);
    this.emit("judged", q, { right, scored, counts: v.counts, pts: v.pts });
  }
  // the points going in, one a seat every other frame (0x86909900), its lamp lit
  tally(q, k, sound) {
    if (k % 2) return;
    let any = false;
    for (let z = 0; z < 4; z++) {
      const p = this.players[z];
      if (p.shown >= p.total) continue;
      p.shown++;
      p.lampAt = this.lastFrame + 1;
      if (q === R.QUESTIONS - 1) p.risen = Math.max(p.risen, p.shown);
      any = true;
    }
    if (any) this.emit(sound);
  }

  // ---- the Pokemon ----
  showStream(q) {
    this.clearSprites();
    for (const o of this.qs[q].stream) {
      const K = R.KINDS[o.kind];
      const sprite = makeSprite(this.assets, K), shadow = makeShadow(this.assets, K);
      sprite.position.set(o.x, 0, o.z);
      shadow.position.set(o.x - K.dx, -K.depth, o.z);
      shadow.renderOrder = 1;
      sprite.renderOrder = 2;
      this.sprites.add(shadow, sprite);
      this.shown.push({ o, K, sprite, shadow });
    }
    this.drawStream(0);
  }
  clearSprites() {
    for (const s of this.shown) {
      this.sprites.remove(s.sprite, s.shadow);
      s.sprite.material.map.dispose();
      s.sprite.material.dispose();
      s.shadow.material.dispose();
    }
    this.shown = [];
  }
  // the stream at counting frame f (and part of the way to the next): where
  // each one is, and its picture (0x8690B2A8): a new one every 2 frames,
  // the rolling ones backwards for odd t2s, Diglett and Dugtrio popping up at t2
  drawStream(f, between = 0) {
    for (const s of this.shown) {
      const { o, K, sprite, shadow } = s;
      const on = f < o.gone;
      sprite.visible = on;
      shadow.visible = on && K.shadow > 0;
      if (!on) continue;
      const x = K.pops ? o.x : o.x - o.speed * Math.max(0, f + between);
      sprite.position.x = x;
      shadow.position.x = x - K.dx;
      let img;
      if (K.pops) img = f >= o.t2 && f < o.t2 + R.POP.length ? R.POP[f - o.t2] : 0;
      else {
        const n = K.frames.length, i = ((Math.max(0, f) + o.t2) >> 1) % n;
        img = K.frames[K.spins && o.t2 % 2 ? (n - i) % n : i];
      }
      sprite.userData.show(img);
    }
  }
  // where the players look: the middle of the Pokemon on show (0x8691AB78)
  lookAt(f) {
    let x = 0, z = 0, n = 0;
    for (const { o } of this.shown) {
      if (f >= o.gone) continue;
      const px = o.speed ? o.x - o.speed * (f + 1) : o.x;
      if (px > 250 || (o.speed === 0 && (f < o.t2 || f >= o.t2 + R.POP.length))) continue;
      x += px; z += o.z; n++;
    }
    return n ? { x: x / n, z: z / n } : null;
  }
  // the players turn to it, a little a frame, and once the stream's over
  // back to the front ("back"); with none on show they stay as they are
  turn(at) {
    if (!at) return;
    for (const b of this.booths) {
      const back = at === "back", want = back ? 0 : Math.atan2(at.x - BOOTH_X[b.i], at.z), step = back ? TURN_BACK : TURN;
      b.yaw += Math.max(-step, Math.min(step, want - b.yaw));
    }
  }

  // ---- every rendered frame ----
  animate(dt) {
    const between = Math.max(0, Math.min(1, this.time * R.FPS - this.lastFrame));
    const t = Math.max(0, this.lastFrame);
    if (this.shown.length && this.state !== "idle") {
      const q = this.qAt(t), T = this.at[q];
      this.drawStream(t - T.count, t >= T.count ? between : 0);
    }
    for (const b of this.booths) {
      const p = this.players[b.i];
      // a press dips the player (0x86901640), the lamp lights for a frame
      const k = t - p.pressAt;
      b.model.root.position.y = this.state === "idle" ? 0 : -(DIP[k] ?? 0);
      b.holder.rotation.y = b.yaw;
      this.setLamp(b, this.state !== "idle" && (t === p.lampAt || (b.end?.win && Math.floor(b.end.k / 3) % 2 === 1)));
      if (b.end) this.ending(b, dt);
      else b.group.position.y = BOOTH_Y + RISE * (this.state === "idle" ? 0 : p.risen);
      b.group.rotation.y = b.spin;
      // a reaction over: back to waiting
      if ((b.clip === CLIP.cheer || b.clip === CLIP.off) && !b.end && b.model.done) this.setClip(b, CLIP.idle);
      if (this.state !== "idle" && Math.random() < dt * R.FPS / 300) b.model.blink(); // (0x86901B68: 1 in 300 a frame)
      b.model.update(dt);
    }
    this.showDigits();
  }
  // what each booth's screen shows: the total (white), or at an answer the counts (gold)
  showDigits() {
    const playing = this.state === "play" || this.state === "over";
    const { q, T } = playing ? this.now : { q: 0, T: null };
    const t = Math.max(0, this.lastFrame), k = T ? t - T.answer : -1;
    const counts = playing && (q < R.QUESTIONS - 1 ? k >= 0 && k < R.JUDGED : k >= R.LAST_COUNTS && k < R.LAST_JUDGED);
    for (const b of this.booths) {
      const p = this.players[b.i];
      const v = counts ? this.count(b.i, q) : p.shown;
      const ds = [v >= 100 ? Math.floor(v / 100) % 10 : null, v >= 10 ? Math.floor(v / 10) % 10 : null, v % 10];
      b.digits.forEach((m, n) => {
        m.visible = ds[n] !== null;
        const tex = ds[n] === null ? null : (counts ? this.assets.gold : this.assets.digits)[ds[n]];
        if (m.material.map !== tex) { m.material.map = tex; m.material.needsUpdate = true; }
      });
    }
  }
  setLamp(b, on) {
    if (!b.lamp) return;
    const c = LAMP[b.i][on ? 1 : 0];
    if (b.lamp.color.getHex() !== c) b.lamp.color.setHex(c);
  }
  setClip(b, c, { from = 0, loop = c === CLIP.idle } = {}) {
    b.clip = c;
    b.model.play(c, { loop, from, restart: true, fade: 0.1 });
  }

  // ---- the end ----
  results() {
    const order = this.players.map((p, i) => ({ i, score: p.total })).sort((a, b) => b.score - a.score);
    return order.map((r) => ({ ...r, place: 1 + order.filter((x) => x.score > r.score).length }));
  }
  // the winners (everyone on the top total) go up to the top, their lamps
  // flashing, and cheer; the others' booths sink, faster and faster, and
  // turn, and they're let down (0x8690A7F0)
  celebrate() {
    const r = this.results();
    for (const x of r) {
      const p = this.players[x.i], b = this.booths[x.i];
      p.shown = p.risen = p.total;
      b.end = { win: x.place === 1, k: 0, n: 0, risen: p.total };
      this.setClip(b, x.place === 1 ? CLIP.cheer : CLIP.lost, { loop: false });
    }
    return r;
  }
  ending(b, dt) {
    const e = b.end;
    const frames = e.k;
    e.k += dt * R.FPS;
    for (let f = Math.floor(frames); f < Math.floor(e.k); f++) {
      if (e.win) e.risen = Math.min(100, e.risen + 1);
      else { e.n++; b.sink += RISE * e.n; b.spin += SPIN; }
    }
    b.group.position.y = BOOTH_Y + RISE * e.risen - b.sink;
    if (b.model.done) this.setClip(b, b.clip, { from: 10, loop: false }); // (held round from frame 10)
  }
}
