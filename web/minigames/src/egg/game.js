// Egg Emergency rules: four Chansey, each catching in three columns (left,
// centre, right). Holding L or R leans that way; letting go leans back to the
// centre. A Voltorb shocks you and knocks 5 eggs out. Every player gets 100 eggs.
import * as THREE from "three";
import { makeChansey, makeEgg, makeVoltorb, setLayer } from "./assets.js";
import { Lag, LAG } from "../lag.js";

const S = 1 / 11.5; // model units -> world (Chansey = 1)
export const COL_X = 5 * S; // the catch clips reach 5 units left/right
const CATCH_Z = 4 * S; // and 4 units in front
export const ZONE_W = 1.7; // distance between players

// The stage is background picture 19 of the game, rebuilt in 3D (stage.js)
// to the picture's measurements: a building on a bridge, one bay per player
// between lamp poles at x = 13, 86, 159, 233 and 306 (73.25 px apart). Chansey
// stand on the grass along the top of the bridge (row 193 of 240); under the
// bridge, at the picture's bottom edge, is the water a missed egg falls into.
export const BACKDROP = { w: 320, h: 240, firstCentre: 49.6, feet: 193 };
export const PX = ZONE_W / 73.25; // world units per backdrop pixel
export const VIEW_TOP = BACKDROP.feet * PX; // where the picture's top edge is (y = 0 is the grass)
export const WATER_Y = -(BACKDROP.h - BACKDROP.feet) * PX; // its bottom edge
export const VIEW_BOTTOM = WATER_Y - 0.3; // and a strip of the water under the bridge
export const SPAWN_Y = VIEW_TOP + 0.35; // drops come from above the roofs
export const TOTAL_EGGS = 100;
export const VOLTORB_LOSS = 5;
export const STUN = 0.8; // s after a shock with no catching: long enough to miss the next egg, as in the game
const VOLTORB_SIZE = 0.5; // 24 px sprite, about 22 px of the picture
const MOVE_TIME = 0.23; // the lean clips

// Chansey's clips, named by what they do (read from the bone tracks: the body
// leans to x = -1.4 / 0 / +1.4, the held egg sits at x = -5 / 0 / +5)
const CLIP = { wait: 0, idle: 1, idleL: 2, idleR: 3, catchC: 10, catchL: 11, catchR: 12, hurt: 13, win: 14, lose: 15 };
const IDLE = { "-1": CLIP.idleL, 0: CLIP.idle, 1: CLIP.idleR };
const CATCH = { "-1": CLIP.catchL, 0: CLIP.catchC, 1: CLIP.catchR };
const MOVE = { "0>1": 4, "1>0": 5, "0>-1": 6, "-1>0": 7, "-1>1": 8, "1>-1": 9 };

// Each CPU gets its own personality around the level's skill (see Brain).
// Simulated (72 rounds each, eggs per CPU, 10th-90th percentile): easy ~30-55,
// normal ~49-69, hard ~90-97. To win a solo round you beat the best of three:
// on average about 50 on easy, 66 on normal, 96 on hard. A flawless player
// with a 0.3 s reaction gets ~94-98. The easy ones mostly ignore eggs and
// drift off; their reaction stays well under the fastest fall (0.8 s), or they
// couldn't see the late Voltorbs coming and their scores would collapse.
export const LEVELS = {
  easy: { reaction: 0.55, fumble: 0.66, dodgeFail: 0.25, lapse: 0.7 },
  normal: { reaction: 0.42, fumble: 0.45, dodgeFail: 0.2, lapse: 0.3 },
  hard: { reaction: 0.23, fumble: 0.05, dodgeFail: 0.1, lapse: 0.03 },
};

export function zoneX(i) { return (i - 1.5) * ZONE_W; }

export function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The drops for one round, one list per player: [{t, col, kind, fall}].
// Everyone gets the same timeline (when something drops, what pattern, how
// fast), so it's fair, but in their own columns and with a little jitter.
export function makeSchedules(seed) {
  const rnd = mulberry32(seed);
  const timeline = [];
  let t = 0.4, eggs = 0;
  while (eggs < TOTAL_EGGS) {
    const p = eggs / TOTAL_EGGS;
    const fall = 1.3 - 0.5 * p; // seconds from the top to the hands: it speeds up
    const gap = (0.88 - 0.5 * p) * (0.85 + 0.3 * rnd());
    const r = rnd();
    let kind = "single", n = 1, extra = 0;
    if (p > 0.08 && r < 0.12 + 0.1 * p) { kind = "voltorb"; extra = 0.25; } // and an egg elsewhere
    else if (p > 0.3 && r < 0.3) { kind = "double"; n = 2; extra = 0.2; } // only one can be caught
    else if (p > 0.15 && r < 0.45) { kind = "sweep"; n = 3; extra = 0.5; } // across the three columns
    n = Math.min(n, TOTAL_EGGS - eggs);
    timeline.push({ t, kind, n, fall, delay: 0.12 + 0.25 * rnd() });
    eggs += n;
    t += gap + extra;
  }
  return [0, 1, 2, 3].map((z) => {
    const r = mulberry32(seed + 7919 * (z + 1));
    const drops = [];
    const last = { "-1": -9, 0: -9, 1: -9 };
    const add = (at, col, kind, fall) => {
      fall *= 0.94 + 0.12 * r(); // some drops fall a little faster than others
      at = Math.max(0, at + (r() - 0.5) * 0.12);
      while (at + fall - last[col] < 0.32) at += 0.06; // never two in a column at once
      last[col] = at + fall;
      drops.push({ t: at, col, kind, fall });
    };
    const other = (c) => { const o = [-1, 0, 1].filter((x) => x !== c); return o[Math.floor(r() * 2)]; };
    for (const e of timeline) {
      const c = Math.floor(r() * 3) - 1;
      if (e.kind === "voltorb") { add(e.t, c, "voltorb", e.fall); add(e.t + e.delay, other(c), "egg", e.fall); }
      else if (e.kind === "double") { add(e.t, c, "egg", e.fall); if (e.n > 1) add(e.t, other(c), "egg", e.fall); }
      else if (e.kind === "sweep") {
        const dir = r() < 0.5 ? 1 : -1;
        for (let k = 0; k < e.n; k++) add(e.t + k * 0.24, (k - 1) * dir, "egg", e.fall);
      } else add(e.t, c, "egg", e.fall);
    }
    return drops.sort((a, b) => a.t - b.t);
  });
}

class Player {
  constructor(game, i) {
    this.i = i;
    this.ch = makeChansey(game.assets);
    this.ch.root.position.x = zoneX(i);
    this.ch.root.position.y = game.feet; // the rig's origin sits a little above the feet
    setLayer(this.ch.root, i + 1);
    game.scene.add(this.ch.root);
    this.reset();
  }
  reset() {
    this.col = 0; this.want = 0; this.eggs = 0; this.stun = 0; this.anim = "wait";
    this.ch.play(CLIP.wait, { fade: 0.2 });
  }
  ready() { this.anim = "idle"; this.ch.play(IDLE[0]); }
  get x() { return this.ch.root.position.x; }
  catchY(game) { return game.feet + 5 * S; }
  update(dt) {
    const ch = this.ch;
    if (this.anim === "hurt") {
      this.stun -= dt;
      if (this.stun <= 0) { this.anim = "idle"; this.col = 0; ch.play(IDLE[0], { fade: 0.15 }); }
    } else if (this.anim === "idle" || this.anim === "move" || this.anim === "catch") {
      if (this.want !== this.col) {
        ch.play(MOVE[this.col + ">" + this.want], { loop: false, fade: 0.05, restart: true });
        this.col = this.want;
        this.anim = "move";
      } else if (this.anim !== "idle" && ch.done) {
        this.anim = "idle";
        ch.play(IDLE[this.col], { fade: 0.08 });
      }
    }
    ch.update(dt);
  }
  catchEgg() {
    this.eggs++;
    this.anim = "catch";
    this.ch.play(CATCH[this.col], { loop: false, fade: 0.03, restart: true });
  }
  hit() {
    const lost = Math.min(this.eggs, VOLTORB_LOSS);
    this.eggs -= lost;
    this.anim = "hurt";
    this.stun = STUN;
    this.ch.play(CLIP.hurt, { loop: false, fade: 0.03, restart: true });
    return lost;
  }
  end(won, last) {
    this.anim = "end";
    this.ch.play(won ? CLIP.win : last ? CLIP.lose : CLIP.wait, { loop: !won && !last, fade: 0.2 });
  }
}

// A CPU player. Its personality is rolled around the level's skill each round:
// how quickly it notices a drop (with jitter), how long before the catch it
// leans (some go early, some at the last moment), whether it leans back to the
// centre between drops or stays, fidgeting, and short lapses of attention. It
// is slower for a moment after a shock. Fumbles and failed dodges are decided
// once per drop.
function personality(level, rnd) {
  const L = LEVELS[level], f = (a, b) => a + (b - a) * rnd();
  return {
    reaction: L.reaction * f(0.8, 1.25), jitter: f(0.1, 0.35),
    lead: f(0.08, 0.5),
    fumble: L.fumble * f(0.85, 1.15), dodgeFail: L.dodgeFail * f(0.7, 1.3),
    home: rnd() < 0.5,
    fidget: f(0, 0.7),
    lapse: L.lapse * f(0.6, 1.4),
  };
}

class Brain {
  constructor(level, rnd) {
    this.rnd = rnd;
    this.k = personality(level, rnd);
    this.seen = new Map();
    this.away = 0; this.flustered = 0; this.hold = 0;
  }
  think(p, objects, now, dt) {
    const k = this.k, rnd = this.rnd;
    if (p.anim === "hurt") { this.flustered = now + 2; return; }
    if (now < this.away) return;
    if (rnd() < k.lapse * dt) { this.away = now + 0.3 + 0.5 * rnd(); return; }
    const slow = now < this.flustered ? 1.4 : 1;
    const mine = [];
    for (const o of objects) {
      if (o.zone !== p.i || o.state !== "fall" || o.passed) continue;
      let d = this.seen.get(o);
      if (!d) {
        d = { at: o.spawnT + k.reaction * slow * (1 + k.jitter * (2 * rnd() - 1)),
              skip: rnd() < (o.kind === "egg" ? k.fumble : k.dodgeFail) };
        this.seen.set(o, d);
      }
      if (now >= d.at && !d.skip) mine.push(o);
    }
    mine.sort((a, b) => a.arrive - b.arrive);
    const bombs = mine.filter((o) => o.kind === "voltorb" && o.arrive - now < 0.55);
    const unsafe = new Set(bombs.map((b) => b.col));
    const firstBomb = bombs.length ? bombs[0].arrive : Infinity;
    const target = mine.find((o) => o.kind === "egg" && (!unsafe.has(o.col) || o.arrive < firstBomb - 0.25));
    if (target && target.arrive - now <= k.lead + MOVE_TIME) { p.want = target.col; return; }
    if (unsafe.has(p.want)) {
      const safe = [0, -1, 1].filter((c) => !unsafe.has(c));
      p.want = target && safe.includes(target.col) ? target.col : safe[0];
      return;
    }
    if (target && target.arrive - now < 0.7) return; // something's coming: stay ready
    if (now < this.hold) return;
    if (rnd() < k.fidget * dt) { p.want = Math.floor(rnd() * 3) - 1; this.hold = now + 0.2 + 0.4 * rnd(); }
    else if (k.home && !target) p.want = 0;
  }
}

// Who plays each seat: "local" (this device's player), "cpu", or "remote"
// (someone on another device, online). The seats this device plays emit
// "lean" when the lean changes and "result" on every catch and Voltorb hit,
// for sending on. A drop lands (takes()) if its seat leans its way at the
// moment it reaches the hands, going by the leans sent, which is exactly how
// the rooms server judges it (tools/egg_rules.py), so the two agree. A remote
// seat runs a little behind the others (setup.delay, then as late as its
// moves come: src/lag.js), so the leans its device sends arrive before
// they're due, and it isn't judged here: the server says what happened
// (told()), with the egg count, which is the one that counts.
export class Game {
  constructor(scene, assets, fx) {
    this.scene = scene; this.assets = assets; this.fx = fx;
    this.feet = measureFeet(assets);
    this.players = [0, 1, 2, 3].map((i) => new Player(this, i));
    this.objects = [];
    this.pool = { egg: [], voltorb: [] };
    this.listeners = {};
    this.state = "idle";
    this.time = 0;
    this.shake = 0;
    this.me = 0;
  }
  on(name, fn) { (this.listeners[name] ||= []).push(fn); }
  emit(name, ...args) { for (const fn of this.listeners[name] || []) fn(...args); }

  // setup: { me: this device's seat, control: per seat, delay: s per seat } and, online,
  // the server's round: { drops, and to rejoin it midway, each seat's leans
  // (its last so far, [g, l]), hits (its last shock) and settled (how many of
  // its drops are judged, in the order they arrive) }
  reset(level, seed = (Math.random() * 2 ** 31) | 0, setup = {}) {
    for (const o of this.objects) this.release(o);
    this.objects = [];
    this.level = level;
    this.drops = setup.drops || makeSchedules(seed);
    this.arrive = this.drops.map((list) => list.map((d) => d.t + d.fall)); // when each reaches the hands
    this.next = [0, 0, 0, 0];
    this.time = 0;
    this.state = "ready";
    this.me = setup.me ?? 0;
    this.control = setup.control || [0, 1, 2, 3].map((z) => (z === this.me ? "local" : "cpu"));
    this.delay = this.control.map((c, z) => (c === "remote" ? setup.delay?.[z] ?? LAG.fallback : 0));
    this.lag = this.delay.map((d, z) => (this.control[z] === "remote" ? new Lag(d) : null));
    this.ticked = [0, 0, 0, 0];
    this.inputs = [[], [], [], []]; // remote leans, due at their seat's time: {g, l}
    this.leans = [0, 1, 2, 3].map((z) => (setup.leans?.[z] ? [{ g: setup.leans[z][0], l: setup.leans[z][1] }] : [])); // all of them
    this.hitAt = [0, 1, 2, 3].map((z) => setup.hits?.[z] ?? -Infinity); // when the last shock was
    this.known = [0, 1, 2, 3].map(() => new Map()); // told results: drop number -> {k, e}
    this.settled = this.arrive.map((a, z) => { // drops already judged here (or, rejoining, by the server)
      const order = a.map((_, n) => n).sort((i, j) => a[i] - a[j] || i - j);
      return new Set(order.slice(0, setup.settled?.[z] || 0));
    });
    this.rnd = mulberry32(seed ^ 0x5bd1e995);
    this.brains = this.control.map((c) => (c === "cpu" ? new Brain(level, this.rnd) : null));
    for (const p of this.players) p.reset();
    this.sent = this.leans.map((log) => log.at(-1)?.l ?? 0); // the last lean sent (or the server's)
    this.players.forEach((p, z) => { p.want = this.sent[z]; });
  }
  start() {
    this.state = "play";
    for (const p of this.players) p.ready();
  }
  stop() { // the round ends early
    for (const o of this.objects) this.release(o);
    this.objects = [];
    this.state = "over";
  }
  // a seat changes hands mid-round, e.g. a CPU takes over from someone who left
  setControl(z, c) {
    if (this.control[z] === c) return;
    const q = this.inputs[z];
    if (q.length && c !== "remote") this.players[z].want = q[q.length - 1].l; // its leans still due
    this.control[z] = c;
    this.lag[z] = c === "remote" ? new Lag(this.delay[z], LAG.fallback) : null; // (from where it is: it eases back)
    this.brains[z] = c === "cpu" ? new Brain(this.level, this.rnd) : null;
    this.inputs[z] = [];
    this.sent[z] = this.players[z].want;
  }
  zoneTime(z) { return this.time - this.delay[z]; }
  // seat z leans l from time g. Leans are kept in order (a device's clock
  // never runs back, and the server keeps them the same way); returns the time
  logLean(z, g, l) {
    const log = this.leans[z];
    g = Math.max(g, log.length ? log[log.length - 1].g : 0);
    log.push({ g, l });
    return g;
  }
  remoteLean(z, g, l) { // from another device, through the server
    if (this.control[z] !== "remote") return;
    this.lag[z].heard(this.time - g);
    this.inputs[z].push({ g: this.logLean(z, g, l), l });
  }
  leanAt(z, t) {
    const log = this.leans[z];
    for (let k = log.length - 1; k >= 0; k--) if (log[k].g <= t) return log[k].l;
    return 0;
  }
  // drop n of seat z lands (caught, or a Voltorb's shock) if the seat leans its
  // way when it reaches the hands, and it isn't still stunned from a shock
  takes(z, n) {
    const a = this.arrive[z][n], h = this.hitAt[z];
    return this.leanAt(z, a) === this.drops[z][n].col && !(h < a && a <= h + STUN);
  }
  get eggsLeft() { // the player's own
    let n = 0;
    const d = this.drops?.[this.me] || [];
    for (let k = this.next[this.me]; k < d.length; k++) if (d[k].kind === "egg") n++;
    return n;
  }

  get(kind) {
    const o = this.pool[kind].pop() || { mesh: kind === "egg" ? makeEgg(this.assets) : makeVoltorb(this.assets, VOLTORB_SIZE) };
    this.scene.add(o.mesh);
    return o;
  }
  release(o) {
    this.scene.remove(o.mesh);
    for (const b of this.brains || []) b?.seen.delete(o); // pooled: forget the old decisions
    this.pool[o.kind].push(o);
  }

  // drop number n of seat zone
  spawn(d, n, zone) {
    const o = this.get(d.kind);
    const catchY = this.players[zone].catchY(this), t = this.zoneTime(zone);
    Object.assign(o, {
      kind: d.kind, col: d.col, zone, n, state: "fall", passed: false, spawnT: t, arrive: t + d.fall,
      speed: (SPAWN_Y - catchY) / d.fall, spin: Math.random() * 6.28,
    });
    setLayer(o.mesh, zone + 1);
    o.mesh.position.set(zoneX(zone) + d.col * COL_X, SPAWN_Y, CATCH_Z);
    if (d.kind === "egg") o.mesh.rotation.set(0, o.spin, 0);
    this.objects.push(o);
  }

  update(dt) {
    if (this.state === "play") {
      this.time += dt;
      for (let z = 0; z < 4; z++) {
        const was = this.delay[z];
        if (this.lag[z]) this.delay[z] = this.lag[z].step(dt);
        this.ticked[z] = dt - (this.delay[z] - was); // how far its clock went
        const t = this.zoneTime(z), list = this.drops[z], p = this.players[z], q = this.inputs[z];
        while (q.length && q[0].g <= t) p.want = q.shift().l;
        while (this.next[z] < list.length && list[this.next[z]].t <= t) this.spawn(list[this.next[z]], this.next[z]++, z);
        this.brains[z]?.think(p, this.objects, t, dt);
        if (this.control[z] !== "remote" && p.want !== this.sent[z]) {
          this.sent[z] = p.want;
          this.emit("lean", z, p.want, this.logLean(z, t, p.want));
        }
      }
      this.updateObjects(dt);
      if (this.next.every((n, z) => n >= this.drops[z].length) && !this.objects.length) {
        this.state = "over";
        this.emit("finish");
      }
    }
    for (const p of this.players) p.update(dt);
    this.shake = Math.max(0, this.shake - dt);
  }

  updateObjects(dt) {
    for (const o of this.objects) {
      const m = o.mesh, p = this.players[o.zone];
      const catchY = p.catchY(this);
      const y0 = m.position.y;
      m.position.y -= o.speed * this.ticked[o.zone]; // (on its seat's clock, which may run slow or fast a while)
      if (o.kind === "egg") m.rotation.z = Math.sin(this.time * 9 + o.spin) * 0.25;
      else m.material.map = m.userData.frames[Math.floor(this.time * 12 + o.spin) % 6];
      if (!o.passed && y0 > catchY && m.position.y <= catchY) {
        o.passed = true;
        const told = this.known[o.zone].get(o.n);
        if (told) this.resolve(o.zone, o.n, told);
        else if (this.control[o.zone] !== "remote" && this.takes(o.zone, o.n)) this.resolve(o.zone, o.n);
        // (a remote seat's waits for the server's word: see told())
      }
      if (o.state === "fall" && m.position.y <= WATER_Y) { // missed: past the bridge into the water
        o.state = "gone";
        this.fx.splash(new THREE.Vector3(m.position.x, WATER_Y, m.position.z), o.zone);
        this.emit(o.kind === "egg" ? "miss" : "dud", p);
      }
    }
    for (const o of this.objects) if (o.state === "gone") this.release(o);
    this.objects = this.objects.filter((o) => o.state !== "gone");
  }

  // drop n of seat z reached its player's hands: caught (an egg) or a shock (a
  // Voltorb). told: what the server said
  resolve(z, n, told) {
    if (this.settled[z].has(n)) return;
    this.settled[z].add(n);
    const p = this.players[z], catchY = p.catchY(this);
    const o = this.objects.find((x) => x.zone === z && x.n === n && x.state === "fall");
    if (o) o.state = "gone";
    const hands = new THREE.Vector3(p.x, catchY, CATCH_Z);
    const pos = o ? o.mesh.position : hands; // no object: it was already in the water here
    const at = new THREE.Vector3(p.x, catchY + 0.55, CATCH_Z);
    const before = p.eggs;
    if (this.drops[z][n].kind === "egg") {
      p.catchEgg();
      if (told) p.eggs = told.e;
      this.fx.sparkle(pos, z);
      this.fx.popup(1, at, z);
      this.emit("catch", p);
    } else {
      this.hitAt[z] = this.arrive[z][n];
      p.hit();
      if (told) p.eggs = told.e;
      const lost = Math.max(0, before - p.eggs);
      this.fx.explosion(pos, true, z);
      this.fx.lostEggs(hands, lost, z);
      if (lost) this.fx.popup(-lost, at, z);
      if (z === this.me) this.shake = 0.35;
      this.emit("boom", p, lost);
    }
    if (!told) this.emit("result", { s: z, n, k: this.drops[z][n].kind === "egg" ? "c" : "h", e: p.eggs, g: this.zoneTime(z) });
  }

  // the server says what seat z's drop n came to: {k: "c" (caught), "h" (a
  // shock) or "m" (nothing), e: the egg count after}. For a remote seat it
  // usually comes before the drop gets here (the seat runs behind); if late,
  // it's shown when it arrives. For a drop already judged here, or "m", it
  // just sets the count (the server's is the one that counts)
  told(z, n, r) {
    if (this.state !== "play" || !this.drops[z]?.[n] || !Number.isFinite(r.e)) return;
    if (r.k !== "m" && Number.isFinite(r.g)) this.lag[z]?.heard(this.time - r.g); // (its device's word, passed on at once)
    if (this.settled[z].has(n) || r.k === "m") { this.players[z].eggs = r.e; return; }
    this.known[z].set(n, r);
    const o = this.objects.find((x) => x.zone === z && x.n === n && x.state === "fall");
    if (o ? o.passed : n < this.next[z]) this.resolve(z, n, r);
  }

  results() {
    const order = this.players.slice().sort((a, b) => b.eggs - a.eggs);
    return order.map((p) => ({ player: p, eggs: p.eggs, place: 1 + order.filter((q) => q.eggs > p.eggs).length }));
  }
  celebrate() {
    const r = this.results();
    const low = Math.min(...r.map((x) => x.eggs));
    for (const x of r) x.player.end(x.place === 1, x.eggs === low && x.place !== 1);
    return r;
  }
}

// how far the rig's origin is above Chansey's feet, in world units
function measureFeet(assets) {
  const c = makeChansey(assets);
  c.play(CLIP.wait, { fade: 0 });
  c.update(0);
  c.root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(c.root, true);
  return -box.min.y;
}
