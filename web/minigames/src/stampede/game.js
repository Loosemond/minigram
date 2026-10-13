// A Streaming Stampede game: the rules (rules.js) on the round's clock, and
// the scene they drive. The studio (the circus backdrop, the ramp, the books)
// has the four booths along the back, each with its player (Cleffa or
// Igglybuff) inside, its lamp and a three-digit screen; the Pokemon go by on
// the floor in front, right to left. In the game's units (y up).
//
// Five questions, each a card (what to count), the counting (the stream) and
// the answer (the counts, the right one, the points). A question is made when
// it comes up, from the totals so far (rules.js after()), so the timeline
// grows as the game goes; an answer's length goes by its points
// (rules.js answerFrames), so it's known once it's judged.
//
// The rules tick at the game's 30 frames a second; everything is drawn a frame
// behind, between the last two (the stream, the turns, the booths, "Stop!").
//
// Who plays each seat: "local" (this device's player), "cpu" or "remote"
// (someone on another device, online). The CPUs' presses come from the
// round's seed, so every device runs them the same. The seats this device
// plays emit "press" with the question and the frame, for sending on; online,
// each answer's counts and points are the server's word (told "ans").
import * as THREE from "three";
import { makeModel, makeSprite, makeShadow, makePerfect, copyMaterial } from "./assets.js";
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
const ANGLE = (a) => (a / 65536) * 2 * Math.PI; // (the game's angles: 0x10000 a turn)
const TURN = ANGLE(273), TURN_BACK = ANGLE(0x444); // a frame (0x86901840, 0x86901AB0)
const DIP = [3, 1, 0.5]; // down, on a press and the two frames after
const SPIN = (8 * Math.PI) / 180; // a frame, the losers' booths at the end (0x869004AC)
const STOP_SIZE = 2.0526315789473686; // "Stop!" at its biggest (0x8690DC88)
// after the hand-over (state 9, its frame 290 on: 0x86909FAC): the crowd's
// asked for till 340; then the winners' booths go up to the height of 100
// points and the others' sink back, and once they're all still (from 341)
// PERFECT over a booth on 100
const CELEBRATE = 50, PERFECT_FROM = 51;
// PERFECT (module #2's sign: 0x81900164) over the booth, 36.4 under its height
// (65.2 over for a loser, which 100 can't be), x1.76 (|sin a| + 1) / 2, a up 0x800 a frame
const PERFECT_Y = -36.402622, PERFECT_SCALE = 1.76;
const lerp = (a, b, k) => a + (b - a) * k;

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
    this.signs = [0, 1, 2, 3].map((z) => { const s = makePerfect(assets, z); scene.add(s); return s; });
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
      if (o.isMesh && /_tex04_face0$/.test(o.material.name)) { o.material = copyMaterial(o.material); o.material.map = null; lamp = o.material; }
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
    const b = { i, group, booth, lamp, digits, holder, model, kind, clip: -1 };
    this.still(b);
    this.setLamp(b, false);
    this.setClip(b, CLIP.idle, { from: (Math.random() * 20) | 0 });
    return b;
  }
  // a booth back as the game starts: facing the front, at its height, not turning;
  // yaw, height (in points: RISE a point) and spin as they were the frame before (Was) and now
  still(b) {
    b.yaw = b.yawWas = b.height = b.heightWas = b.spin = b.spinWas = 0;
    b.liftFrom = 0;
    b.liftAt = -Infinity;
    b.win = false;
    b.left = 0;
  }
  // a booth up a point (state 8: a step every other frame), drawn rising over
  // the two frames, so it goes up steadily
  lift(b, t, h) {
    b.liftFrom = this.lifted(b, t);
    b.liftAt = t;
    b.height = h;
  }
  lifted(b, u) { return lerp(b.liftFrom, b.height, Math.max(0, Math.min(1, (u - b.liftAt) / 2))); }

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
    this.sinces = [[3, 3, 3, 3]]; // each CPU's frames since its last press as each counting starts (G+0..0xC)
    this.verdicts = [];
    this.players = [0, 1, 2, 3].map(() => ({ total: 0, shown: 0, presses: [[], [], [], [], []], pressAt: -9, lampAt: -9, risen: 0 }));
    this.time = 0;
    this.state = "ready";
    this.lastFrame = -1;
    this.endFrame = Infinity; // the hand-over (frames from GO), once the last answer's judged
    this.echo = false; // a booth's 0x3209 to ask for again on the next frame (G+0x194)
    this.post = null; // after the hand-over: frames into it (the celebration)
    this.perfectAt = null; // the frame (of post) PERFECT came up on
    this.clearSprites();
    for (const s of this.signs) s.visible = false;
    for (const b of this.booths) {
      this.still(b);
      this.setLamp(b, false);
      this.setClip(b, CLIP.idle, { from: (Math.random() * 20) | 0 });
    }
    (setup.told || []).forEach((v, q) => { if (v) this.told("ans", { n: q, ...v }); });
    this.prepare(0);
    this.showDigits();
  }
  start() { this.state = "play"; }
  stop() { this.state = "over"; }
  setControl(z, c) { this.control[z] = c; }

  get frame() { return Math.floor(this.time * R.FPS + 1e-6); }
  get end() { return this.endFrame / R.FPS; } // (s from GO)
  // question q, made when it comes up (from the totals after the one before)
  prepare(q) {
    if (this.qs[q] || q >= R.QUESTIONS) return this.qs[q];
    if (q > 0) {
      const P = this.qs[q - 1];
      this.states[q] = R.after(P.state, q - 1, this.totals(q - 1), this.people);
      this.sinces[q] = P.cpuPresses.map((p, z) => (p ? R.sinceAfter(P, p, this.sinces[q - 1][z]) : 3));
    }
    const Q = R.question(this.seed, q, this.states[q], this.totals(q - 1), this.comLevel);
    Q.cpuPresses = [0, 1, 2, 3].map((z) => (this.cpus[z] ? R.cpuPresses(Q, this.comLevel, z, this.sinces[q][z]) : null));
    this.qs[q] = Q;
    const start = q ? this.at[q - 1].end : R.OPENING, last = q === R.QUESTIONS - 1;
    const count = start + R.CARD, answer = count + Q.frames;
    this.at[q] = { start, count, answer, judged: answer + (last ? R.LAST_JUDGED : R.JUDGED), end: null };
    this.setEnd(q);
    return Q;
  }
  // question q's end, by its points (the counts so far till it's judged:
  // no sooner than it can end); true if it moved
  setEnd(q) {
    const T = this.at[q], end = T.answer + R.answerFrames(q, this.verdict(q).pts);
    if (T.end === end) return false;
    T.end = end;
    if (q === R.QUESTIONS - 1) this.endFrame = end;
    return true;
  }
  // the question on at frame t (making the next ones as they come)
  qAt(t) {
    let q = this.at.length - 1;
    while (q > 0 && t < this.at[q].start) q--;
    while (t >= this.at[q].end && q < R.QUESTIONS - 1) { this.prepare(q + 1); q++; }
    return q;
  }
  // the question on now, for the HUD: { q, Q, T, t (frames into it: < 0 in
  // the opening), f (into its counting), k (into its answer) }
  get now() {
    const t = Math.max(0, Math.min(this.frame, this.at[this.at.length - 1].end - 1)), q = this.qAt(t), T = this.at[q];
    return { q, Q: this.qs[q], T, t: t - T.start, f: t - T.count, k: t - T.answer };
  }
  // the frame being drawn (a frame behind: between the last two), fractional
  get drawn() { return this.time * R.FPS - 1; }
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
          if (p.risen > p.total) p.risen = this.booths[z].height = this.booths[z].liftFrom = p.total;
        }
      }
      const moved = T ? this.setEnd(q) : false; // (its length goes by its points)
      // the next question, if it was made from other totals or starts at
      // another time, and hasn't begun counting
      const next = this.qs[q + 1];
      if (next && this.lastFrame < this.at[q + 1].count &&
          (moved || JSON.stringify(R.after(this.qs[q].state, q, after, this.people)) !== JSON.stringify(this.states[q + 1]))) {
        this.qs.length = this.at.length = this.states.length = this.sinces.length = q + 1;
        if (q + 1 === R.QUESTIONS - 1) this.endFrame = Infinity;
        this.prepare(q + 1);
        if (this.lastFrame >= this.at[q + 1].start) this.showStream(q + 1);
      }
    }
  }

  get score() { return this.players.map((p) => p.shown); }

  // ---- the game, frame by frame ----
  update(dt) {
    if (this.state === "play") this.time += dt;
    if (this.state === "play" || this.state === "over") {
      // (to now, short of the hand-over: it's known once the last answer's judged)
      for (let t = this.lastFrame + 1; t <= this.frame && t < this.endFrame; t++) { this.step(t); this.lastFrame = t; }
      if (this.state === "play" && this.time * R.FPS >= this.endFrame - 1e-6) { this.state = "over"; this.emit("finish"); }
    }
    if (this.post !== null) this.celebrating(dt);
    this.animate(dt);
  }

  // what happens on frame t (from GO): the game's states 5-8 (0x86901AA8)
  step(t) {
    for (const b of this.booths) { b.yawWas = b.yaw; b.heightWas = b.height; }
    const q = this.qAt(t), Q = this.qs[q], T = this.at[q], last = q === R.QUESTIONS - 1;
    let drum = false, crowd = null; // (the sounds the game asks for every frame they last)
    if (t >= T.start) {
      if (t === T.start) {
        this.showStream(q);
        this.emit("card", q);
      }
      if (t === T.start + 36) this.emit("cardOn", q); // (0x3F03)
      const f = t - T.count;
      if (f >= 0 && t < T.answer) {
        // the CPUs' presses (0x8690B984)
        for (let z = 0; z < 4; z++) if (this.cpus[z] && Q.cpuPresses[z]?.includes(f)) this.pressed(z, t);
        // the players turn to the middle of the Pokemon (where the frame before
        // left them), and on the frame none are left (the stream's last move)
        // and after, back to the front; "Stop!" 50 frames into that (0x3F08)
        const at = this.lookAt(f);
        if (at) this.turn(at);
        if (f >= Q.last) this.turn("back");
        if (f === Q.last + R.STOP) this.emit("stop", q);
      }
      if (t === T.answer) { this.clearSprites(); this.emit("reveal", q); }
      const k = t - T.answer;
      if (k >= 0 && !last) {
        // the answer (state 7: 0x8690941C): a drum roll asked for from its 30th
        // frame to its 58th, the answer at 60, the points at 90 going in every
        // other frame with the lamps, the crowd asked for from then on
        drum = k >= 30 && k < 59;
        if (k === 60) this.emit("answer", q); // (0x3F01)
        if (k === R.JUDGED) this.judge(q);
        if (k >= R.JUDGED) {
          this.tally(q, k - R.JUDGED, t, "tally");
          crowd = this.crowd(q);
        }
        // reactions, a few frames after the judging (0x86909680): a right count
        // cheers, one off by 3 or more is let down
        if (k >= R.JUDGED && k < R.JUDGED + 6) {
          const v = this.verdict(q);
          for (let z = 0; z < 4; z++) {
            if (k !== R.JUDGED + R.reactDelay(this.seed, q, z)) continue;
            const d = Math.abs(v.counts[z] - Q.answer);
            if (d === 0) this.setClip(this.booths[z], CLIP.cheer, { from: 11, loop: false });
            else if (d >= 3) this.setClip(this.booths[z], CLIP.off, { loop: false });
          }
        }
      } else if (k >= R.LAST_STATE8) {
        // the last (state 8: 0x86909FAC): song 31, the camera to the results'
        // view (animate) while the columns go up to the totals so far, a point
        // every other frame; song 32 at 180; at 210 the points, and the crowd
        const s = k - R.LAST_STATE8;
        if (s === 0) this.emit("results", q);
        if (s < 120) this.rise(s, t);
        if (s === 180) this.emit("answer", q);
        if (s === 210) this.judge(q);
        if (s >= 210) {
          this.tally(q, s - 210, t, "tallyLast");
          crowd = this.crowd(q);
        }
      }
    }
    this.emit("hold", { drum, crowd });
  }

  // question q's points (0x869053B4): the server's, online, if they're here
  judge(q) {
    const v = this.verdict(q), Q = this.qs[q];
    this.verdicts[q] ||= v;
    for (let z = 0; z < 4; z++) this.players[z].total += v.pts[z];
    this.setEnd(q);
    const right = v.counts.some((c) => c === Q.answer), scored = v.pts.some((x) => x > 0);
    this.emit("judged", q, { right, scored, counts: v.counts, pts: v.pts });
  }
  // the crowd the game asks for once an answer's judged, if anyone scored:
  // 0x1D08 if someone was right, else 0x1E09; 0x1C07 after the last
  crowd(q) {
    const v = this.verdicts[q];
    if (!v || !v.pts.some((x) => x > 0)) return null;
    return q === R.QUESTIONS - 1 ? "allPerfect" : v.counts.includes(this.qs[q].answer) ? "someRight" : "allScored";
  }
  // the points going in, one a seat every other frame (0x86909900, 0x8690A4B4),
  // its lamp lit (in the last, its booth up a point too: 0x3209, asked for again
  // the frame after); the tick only while some are still to come after it
  tally(q, k, t, sound) {
    const last = q === R.QUESTIONS - 1;
    if (k % 2) {
      if (last && this.echo) { this.echo = false; this.emit("rise"); }
      return;
    }
    let any = false;
    for (let z = 0; z < 4; z++) {
      const p = this.players[z];
      if (p.shown >= p.total) continue;
      p.shown++;
      p.lampAt = t;
      if (last) { p.risen = Math.max(p.risen, p.shown); this.lift(this.booths[z], t, p.risen); }
      any = true;
    }
    if (any && last) { this.emit("rise"); this.echo = true; }
    if (this.players.some((p) => p.shown < p.total)) this.emit(sound); // (0x3F06, 0x310A)
  }
  // the columns up to the totals so far, a point every other frame (state 8's first 120)
  rise(s, t) {
    if (s % 2) {
      if (this.echo) { this.echo = false; this.emit("rise"); }
      return;
    }
    let any = false;
    for (let z = 0; z < 4; z++) {
      const p = this.players[z];
      if (p.risen >= p.total) continue;
      p.risen++;
      p.lampAt = t;
      this.lift(this.booths[z], t, p.risen);
      any = true;
    }
    if (any) { this.emit("rise"); this.echo = true; }
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
      // (its shadow goes on its own frame: a little before or after it)
      const shadowGone = K.pops ? o.gone : Math.floor((o.x - K.dx - R.OFF_LEFT) / o.speed);
      this.shown.push({ o, K, sprite, shadow, shadowGone });
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
  // the rolling ones backwards for odd t2s, Diglett and Dugtrio popping up at t2.
  // (Drawn a frame behind: the picture of the game's frame f - 1, its move between.)
  drawStream(f, between = 0) {
    for (const s of this.shown) {
      const { o, K, sprite, shadow } = s;
      sprite.visible = f < o.gone;
      shadow.visible = f < s.shadowGone && K.shadow > 0;
      const x = K.pops ? o.x : o.x - o.speed * Math.max(0, f + between);
      sprite.position.x = x;
      shadow.position.x = x - K.dx;
      if (!sprite.visible) continue;
      let img;
      if (K.pops) img = f >= o.t2 && f < o.t2 + R.POP.length ? R.POP[f - o.t2] : 0;
      else {
        const n = K.frames.length, i = ((Math.max(0, f) + o.t2) >> 1) % n;
        img = K.frames[K.spins && o.t2 % 2 ? (n - i) % n : i];
      }
      sprite.userData.show(img);
    }
  }
  // where the players look (0x86901840): the middle of every Pokemon still in
  // the stream as the frame before left it (0x8691AB78: each one's spot after
  // its move, on screen or not, a pop-up's before it's up), or none
  lookAt(f) {
    let x = 0, z = 0, n = 0;
    for (const { o } of this.shown) {
      if (f < 1 || f > o.gone) continue;
      x += o.speed ? o.x - o.speed * f : o.x;
      z += o.z;
      n++;
    }
    return n ? { x: x / n, z: z / n } : null;
  }
  // they turn to it, 273/65536 of a turn a frame at most, and back to the
  // front 0x444 a frame ("back"). The game takes the player's x off both the
  // x and the z it aims at (0x869018B4: its z's off, as the game's are).
  turn(at) {
    for (const b of this.booths) {
      const back = at === "back", px = BOOTH_X[b.i];
      const want = back ? 0 : Math.atan2(at.x - px, at.z - px), step = back ? TURN_BACK : TURN;
      b.yaw += Math.max(-step, Math.min(step, want - b.yaw));
    }
  }

  // ---- every rendered frame ----
  animate(dt) {
    const playing = this.state === "play" || this.state === "over";
    const between = playing ? Math.max(0, Math.min(1, this.time * R.FPS - this.lastFrame)) : 0;
    const t = Math.max(0, this.lastFrame);
    if (this.shown.length && playing) {
      const q = this.qAt(t), T = this.at[q];
      if (t >= T.start) this.drawStream(t - T.count, t >= T.count ? between : 0);
    }
    const post = this.post !== null, pk = post ? this.post - Math.floor(this.post) : 0;
    // (the game's blinks: in its states 3, 4 and 6-8, not on a card nor after the hand-over: 0x8690F034)
    const now = playing ? this.now : null;
    const blinks = this.state === "ready" || (playing && !post && (now.t < 0 || now.t >= R.CARD));
    for (const b of this.booths) {
      const p = this.players[b.i];
      // a press dips the player (0x86901640), the lamp lights for a frame
      const k = t - p.pressAt, dip = (n) => DIP[n] ?? 0;
      b.model.root.position.y = this.state === "idle" ? 0 : -lerp(dip(k - 1), dip(k), between);
      b.holder.rotation.y = lerp(b.yawWas, b.yaw, between);
      const flash = b.win && post && this.post >= CELEBRATE && Math.floor((Math.floor(this.post) - CELEBRATE + 1) / 3) % 2 === 1;
      this.setLamp(b, this.state !== "idle" && (t === p.lampAt || flash));
      const h = this.state === "idle" ? 0 : post ? lerp(b.heightWas, b.height, pk) : this.lifted(b, this.time * R.FPS);
      b.group.position.y = BOOTH_Y + RISE * h;
      b.group.rotation.y = post ? lerp(b.spinWas, b.spin, pk) : 0;
      // a reaction over: back to waiting; at the end, their clips held round from frame 10
      if (post && this.post >= CELEBRATE) { if (b.model.done) this.setClip(b, b.clip, { from: 10, loop: false }); }
      else if ((b.clip === CLIP.cheer || b.clip === CLIP.off) && b.model.done) this.setClip(b, CLIP.idle);
      if (blinks && Math.random() < dt * R.FPS / 300) b.model.blink(); // (0x86901B68: 1 in 300 a frame)
      b.model.update(dt);
    }
    this.drawPerfect();
    this.showDigits();
  }
  // "Stop!" (0x8690DC88): how big, as the game's frame being drawn has it (0:
  // not up). 50 frames into the counting's tail it grows to 2.0526 times its
  // size (sin 9 degrees a frame), holds, and 20 frames into the answer
  // shrinks away, (3 - 3 sin) x 0.6842 in 10
  get stopSize() {
    if (!(this.state === "play" || this.state === "over") || this.lastFrame < 0 || this.post !== null) return 0;
    const between = Math.max(0, Math.min(1, this.time * R.FPS - this.lastFrame));
    const q = this.qAt(this.lastFrame), Q = this.qs[q], T = this.at[q];
    const f = this.lastFrame - T.count, k = this.lastFrame - T.answer;
    const tail = f - 1 - Q.last + between; // (the tail's frame drawn)
    if (k < 0) return tail >= R.STOP ? STOP_SIZE * Math.sin((Math.min(10, tail - R.STOP) * 9 * Math.PI) / 180) : 0;
    if (k < 20) return STOP_SIZE;
    return k < 30 ? 0.6842105263157895 * (3 - 3 * Math.sin(((k + between - 20) * 9 * Math.PI) / 180)) : 0;
  }
  // what each booth's screen shows: the total (white), or at an answer the
  // counts (gold: G+0x70, from the answer's start to its 89th frame; in the
  // last, state 8's 120th to 209th)
  showDigits() {
    const playing = this.state === "play" || this.state === "over";
    const { q, T } = playing ? this.now : { q: 0, T: null };
    const t = Math.max(0, this.lastFrame), k = T ? t - T.answer : -1;
    const counts = playing && this.post === null && (q < R.QUESTIONS - 1 ? k >= 0 && k < R.JUDGED
      : k >= R.LAST_STATE8 + 120 && k < R.LAST_JUDGED);
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
  // The hand-over (0x8690B89C: everyone on the top total wins), then the
  // game's own show under the results (0x86909FAC, s 290 on): the crowd for 50
  // frames; then the winners' booths go up a point a frame to the height of
  // 100 (0x3209 each frame), their lamps flashing every 3 frames, cheering;
  // the others' sink back to where they started, 1, 2, 3... points a frame,
  // turning 8 degrees a frame, let down (0x8690A7F0, 0x869004AC); and once
  // they're all still, PERFECT over a booth on 100
  celebrate() {
    const r = this.results();
    for (const x of r) {
      const p = this.players[x.i], b = this.booths[x.i];
      p.shown = p.risen = p.total;
      b.win = x.place === 1;
      if (this.post === null || this.post < CELEBRATE) b.height = b.heightWas = b.liftFrom = p.total;
    }
    if (this.post === null) this.post = 0;
    return r;
  }
  celebrating(dt) {
    const from = Math.floor(this.post);
    this.post += dt * R.FPS;
    for (let n = from + 1; n <= Math.floor(this.post); n++) this.afterStep(n);
  }
  afterStep(n) {
    for (const b of this.booths) { b.heightWas = b.height; b.spinWas = b.spin; }
    this.emit("hold", { drum: false, crowd: n < CELEBRATE ? this.crowd(R.QUESTIONS - 1) : null });
    if (n < CELEBRATE) return;
    const m = n - CELEBRATE + 1; // (the losers sink this many points this frame, 0x8691AD98)
    if (n === CELEBRATE) {
      for (const b of this.booths) {
        const total = this.players[b.i].total;
        b.left = b.win ? 100 - total : total;
        this.setClip(b, b.win ? CLIP.cheer : CLIP.lost, { loop: false });
      }
    }
    let rose = false;
    for (const b of this.booths) {
      if (b.win) {
        if (b.left > 0) { b.left--; b.height++; rose = true; }
      } else {
        const d = Math.min(b.left, m);
        b.left -= d;
        b.height -= d;
        b.spin += SPIN;
      }
    }
    if (rose) this.emit("rise");
    if (this.perfectAt === null && n >= PERFECT_FROM && this.booths.every((b) => b.left === 0)) this.perfectAt = n;
  }
  drawPerfect() {
    for (const b of this.booths) {
      const sign = this.signs[b.i], on = this.perfectAt !== null && this.players[b.i].total === 100;
      sign.visible = on;
      if (!on) continue;
      const a = (Math.max(0, this.post - 1 - this.perfectAt) * 0x800) / 65536 * 2 * Math.PI;
      const sc = PERFECT_SCALE * (Math.abs(Math.sin(a)) + 1) / 2;
      sign.position.set(BOOTH_X[b.i], b.group.position.y + PERFECT_Y, 0);
      sign.scale.set(64 * sc, 26 * sc, 1);
    }
  }
}
