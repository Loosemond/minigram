// Topsy-Turvy's rules, as the game's code module (#47) has them
// (docs/minigames.md has where each number is). The game counts time in
// seconds, and runs the play six steps a frame, 30 frames a second (it asks
// the scheduler for a frame every 2 retraces, 0x8600D01C, and takes its
// frame's length from them, 0x86006D7C); its units: the ring is a bowl sunk
// in the floor (the plane y = 0), x across, z towards the camera, seen from
// (0, 3878, 4979) towards (0, -300, 0).
//
// Four Hitmontop spin in the ring: a ball each (radius 135), pushed about by
// its player's stick, bouncing off the others (hard: a bounce gives more than
// it gets) and off the bowl, which rises steeply at its rim. A knocked into
// another sends it reeling: light and out of control for a moment, and if it
// was a RAPID SPIN (A: harder, heavier, for 0.4 s, then 1.5 s to recharge),
// with the ring under it slippery. Knocked over the rim onto the floor, a
// Hitmontop jumps back in; whoever hit it last (within a second) scores. Five
// points, or the most when the minute's up, wins.
//
// The four share one world, so it runs from everyone's pads at once and the
// CPUs think in it as the game's do. Every device and the server run the same
// world from the same pads (online, devices run it again from a saved frame
// when someone's pad comes in late: game.js). So it never uses Math.sin and
// the like, whose last bits can differ between browsers and Python: the
// game's own sine, cosine and arctangent are made here from + - * / alone, and
// its float square roots with Math.fround. tools/topsy_rules.py is the rooms
// server's copy: keep the two the same.

export const FPS = 30; // (frames a second: 2 retraces of 60 each, 0x80008950 / 0x80001FC0)
// frames from GO to the play: the countdown's over a step after GO, and only
// then does the play start (0x8600674C: module #64's step, 20 frames)
export const START = 20;
export const LEVELS = { easy: 1, normal: 2, hard: 3 };
const f32 = Math.fround;

// The game's tuning (its debug menu's, set at 0x8600B610)
const REPEAT = 6; // "CALICULATION REPEAT": steps a frame
export const DT = 1 / 30; // a frame, in s
const DTS = DT / REPEAT; // a step
const MASS = 100; // a Hitmontop's weight...
const IMPACT_WEIGHT = 5; // ...times this in a RAPID SPIN...
const DAMAGE_WEIGHT = 0.25; // ...and this while reeling
const MIN_BOUND = 100 * 6000; // the least push two Hitmontop that touch get
const MAX_BOUND = 100 * 2600000; // and the most (any)
const STICK_POWER = 100 * 160; // the stick's push
const MAX_SPEED = 3400, MAX_SPEED_DAMAGED = 10000;
const GRAVITY = 20000;
export const SPIN = 27; // a Hitmontop's spin, for friction (rad/s about y)
const IMPACT_TIME = 0.4; // a RAPID SPIN's length...
const AFTER_IMPACT = 1.5; // ...and its recharge
const DAMAGE_TIME = 1.2; // reeling from a RAPID SPIN...
export const TOUCH_TIME = 0.5; // ...or a bump
export const RADIUS = 135; // "BALL RADIUS"
const BOUND_FACTOR = 3; // how hard two bounce off each other (1 + this)...
const IMPACT_BOUND_FACTOR = 5; // ...one of them in a RAPID SPIN...
const IMPACT_IMPACT_BOUND = 0; // ...both
const BOUNDS = [ // the bowl's bounce and friction (outer: the rim; inner: the floor), and reeling from a RAPID SPIN
  { outer: [0.5, 0.1], inner: [0.2, 0.04] },
  { outer: [0, 0], inner: [0, 0] },
  { outer: [f32(0.1), f32(0.95)], inner: [f32(0.1), f32(0.95)] }, // (the losers', at the end)
];
// the floor round the ring's (the plane at W + 0x6848: tuning +0x238 and +0x260, 0x86004E38)
const FLOOR = [0.8, 0.2];
const FRICTION = 0; // between two Hitmontop
const INITIAL_OFFSET = 160, INITIAL_SPEED_H = 800, INITIAL_SPEED_V = 4000; // jumping in: from this far out, at this speed
const WAIT_IN = 0.35; // crouched before the jump (0x86003A98)
const GHOST = 1.4; // and passing through the others after it (0x86003C68)
const ROOM = 50; // until none is nearer than this (0x86002A58)
const LANDED = 1.4; // out on the floor, before jumping back in (0x86002DA8)
const AIR = 10; // higher than its radius and this above the ring, it's in the air
const RECENT = 1; // a hit counts this long for a point (0x86003868)
export const WINNERS_POINT = 5;
export const TIME_LIMIT = 60 * FPS; // frames
export const RIM = 1800; // the bowl's rim (its radius)
const FLOOR_SHARE = 90 * 0.01; // the bowl's floor: this of it across, 10 degrees deep; the rim, 85 (0x86004BD4)

// The CPUs (0x8600D2CC: by level, then by where they stand among the CPUs,
// best first; 0x8600D800): how near the middle they keep (of the floor's
// radius), the chance a step they get a RAPID SPIN wrong, their stick's push,
// and who they mind (bits: about to hit, for a RAPID SPIN, people then CPUs;
// to run from while recharging; to go for)
const CPU_RECS = [
  [0.85, 0.01, 24, 0x8fc0], [0.9, 0.0115, 20, 0x0dc0], [0.9, 0.01, 24, 0x3dc0], [0.8, 0.0405, 55, 0x29c0], // Easy
  [0.8, 0.0065, 45, 0xcbc0], [0.85, 0.0065, 45, 0xebc0], [0.85, 0.006, 45, 0xc9c0], [0.65, 0.04, 50, 0x3600], // Normal
  [0.5, 0, 60, 0xf200], [0.9, 0.001, 50, 0xa200], [0.65, 0.001, 50, 0xea40], [0, 0, 0, 0], // Hard
  [0.65, 0.00605, 28, 0xf3c0], // (before they're given parts: 0x8600D188)
].map(([near, wrong, power, bits]) => ({ near: f32(near), wrong: f32(wrong), power: f32(power), bits: bits << 16 }));
const CPU_ORDER = [[2], [2, 3], [1, 2, 3], [1, 2, 3, 4]];
const cpuRec = (level, k) => CPU_RECS[(level - 1) * 4 + k - 1];
const bit = (rec, b) => (rec.bits >>> b) & 1;

// The players' corners (0x8600D1C8): each one's way out from the middle
const START_ANGLE = [-2.35619455575943, 2.35619455575943, -0.7853981852531433, 0.7853981852531433];

const PI = 3.1415927410125732, TWO_PI = 6.2831854820251465, HALF_PI = 1.5707963705062866; // (the game's, floats)
const TEN_PI = 31.41592788696289; // (0x86002B20's)
const U = 4294967296;

// the level the game plays (with four people, the CPUs' don't matter)
export function levelCode(level, cpus) { return cpus.some((c) => c) ? LEVELS[level] || 2 : 1; }

// ---- the game's maths (the main program's sinf and cosf, 0x800740D0 and 0x8007EB20: libultra's) ----
const SP = [1, -0.16666659550427756, 0.008333066246082155, -0.0001980960290193795, 2.605780637968037e-6];
const RPI = 0.3183098861837907, PIHI = 3.1415926218032837, PILO = 3.178650954705639e-8;
const poly = (dx) => {
  const xsq = dx * dx;
  return dx * xsq * (SP[1] + ((SP[4] * xsq + SP[3]) * xsq + SP[2]) * xsq) + dx;
};
const floatBits = new DataView(new ArrayBuffer(4));
function exponent(x) { floatBits.setFloat32(0, x); return (floatBits.getInt32(0) >> 22) & 0x1ff; }
export function sinf(x) {
  x = f32(x);
  const xpt = exponent(x);
  if (xpt < 0xff) return xpt >= 0xe6 ? f32(poly(x)) : x;
  if (xpt < 0x136) {
    const dn0 = x * RPI;
    const n = Math.trunc(dn0 >= 0 ? dn0 + 0.5 : dn0 - 0.5);
    const dx = x - n * PIHI - n * PILO;
    const r = f32(poly(dx));
    return n & 1 ? -r : r;
  }
  return x !== x ? x : 0;
}
export function cosf(x) {
  x = f32(x);
  if (exponent(x) < 0x136) {
    const ax = x > 0 ? x : -x;
    const dn0 = ax * RPI + 0.5;
    const n = Math.trunc(dn0 >= 0 ? dn0 + 0.5 : dn0 - 0.5);
    const dn = n - 0.5;
    const dx = ax - dn * PIHI - dn * PILO;
    const r = f32(poly(dx));
    return n & 1 ? -r : r;
  }
  return x !== x ? x : 0;
}
// module #48's (a shared library of vectors and quaternions, in doubles): the
// angle of (y, x) by a continued fraction (0x87C00D14)...
export function atan2(y, x) {
  if (x === 0) return y === 0 ? 0 : 0 < y ? HALF_PI : -HALF_PI;
  const t = y / x, at = t > 0 ? t : -t, s = at <= 1 ? t : 1 / t;
  let f = 0;
  for (let k = 14; k >= 1; k--) f = (k * k * s * s) / (2 * k + 1 + f);
  let r = s / (1 + f);
  if (1 < t) r = HALF_PI - r;
  if (t < -1) r = -HALF_PI - r;
  if (0 < x) return r;
  return 0 < y ? r + PI : r - PI;
}
// ...an angle to -pi..pi (0x87C00020)...
function wrap(a) {
  while (PI <= a) a -= TWO_PI;
  while (a <= -PI) a += TWO_PI;
  return a;
}
// ...x towards to by step (0x87C00090)...
export function approach(x, to, step) {
  if (x < to - step) return x + step;
  if (to + step < x) return x - step;
  return to;
}
// ...and the vector ones it needs (lengths by float square roots)
const sqrtf = (x) => f32(Math.sqrt(f32(x)));
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len2 = (a) => a[0] * a[0] + a[1] * a[1] + a[2] * a[2];
const cross = (a, b) => [a[1] * b[2] - b[1] * a[2], a[2] * b[0] - b[2] * a[0], a[0] * b[1] - b[0] * a[1]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
function setLength(a, l) { // (0x87C00718)
  const d2 = len2(a);
  return 0.0001 < d2 ? scale(a, l / sqrtf(d2)) : [0, 0, 0];
}
function reject(v, n) { const d = dot(v, n); return [v[0] - n[0] * d, v[1] - n[1] * d, v[2] - n[2] * d]; }

// ---- the ring: two spheres' caps, the bowl's floor and its rim (0x86009D7C) ----
// r: across, R: the sphere's radius, c: its middle (above it)
function cap(y0, r, angle) {
  const half = f32((PI - angle) * 0.5);
  const R = r / cosf(half);
  return { R, r, c: [0, y0 + sinf(half) * R, 0] };
}
const OUTER = cap(0, RIM, (PI * 85) / 180);
const INNER = (() => {
  const r = OUTER.r * FLOOR_SHARE, t = r / OUTER.R;
  return cap(sqrtf(1 - t * t) * -OUTER.R + OUTER.c[1], r, (PI * 10) / 180);
})();
export const RING = { OUTER, INNER };
// inside its rim, seen from above (0x86009C08)
function within(S, p) {
  const dx = S.c[0] - p[0], dz = S.c[2] - p[2];
  return dx * dx + dz * dz < S.r * S.r;
}
// its height at (x, z) (past its rim, the rim's: 0x86009C98)
export function surfaceY(S, x, z) {
  const dx = S.c[0] - x, dz = S.c[2] - z;
  const r2 = S.r * S.r, d2 = dx * dx + dz * dz;
  return d2 > r2 ? sqrtf(S.R * S.R - r2) * -1 + S.c[1] : sqrtf(S.R * S.R - dx * dx - dz * dz) * -1 + S.c[1];
}
// its normal at p, up out of the bowl (0x86009FB8)
function normalAt(S, p) { return setLength(sub(p, S.c), -1); }
// how far p is above the ring (or the floor round it: 0x86004EA8)
export function heightAt(p) {
  if (within(INNER, p)) return INNER.R - sqrtf(len2(sub(INNER.c, p)));
  if (within(OUTER, p)) return OUTER.R - sqrtf(len2(sub(OUTER.c, p)));
  return p[1];
}
// the way down there, for a loser at the end (0x86004F2C)
export function upAt(p) {
  if (within(INNER, p)) return normalAt(INNER, p);
  if (within(OUTER, p)) return normalAt(OUTER, p);
  return [0, 1, 0];
}

// One round's world. cpus: which seats are CPUs; empty: which have no one in
// them at all (the remake's, online with the CPUs off: no Hitmontop there, so
// it never comes into the ring, and isn't counted in the end's checks);
// step() runs a frame from the people's pads. The scene reads it all.
export class World {
  constructor(seed, level = "normal", cpus = [false, true, true, true], empty = [false, false, false, false]) {
    this.level = levelCode(level, cpus);
    this.seed = seed >>> 0; // the game's random numbers' state (rnd())
    this.t = -1; // the last frame run
    this.end = null; // the frame the play ended on
    this.over = false; // (past it: the show)
    this.first = this.rnd() % 4; // where the CPUs' order starts, for their parts (0x86007428)
    this.events = [];
    // each Hitmontop (0x86002070: a ball, and what the game keeps for its player)
    this.p = [0, 1, 2, 3].map((z) => {
      const p = {
        z, cpu: !!cpus[z], empty: !!empty[z], rec: null, auto: false,
        pos: [0, 0, 0], vel: [0, 0, 0], w: [0, 0, 0], F: [0, 0, 0], T: [0, 0, 0],
        r: RADIUS, m: MASS, I: 0, maxV: MAX_SPEED,
        state: 0, on: false, solid: false, hold: 0, spin: 0, cool: 0, touch: 0, recent: -1, hard: false, landed: false,
        score: 0, falls: 0, hitBy: -1, victims: [], angle: START_ANGLE[z], stick: [0, 0], spot: [0, 0, OUTER.r * 0.6],
        heading: 0, turn: 0,
      };
      setMass(p, MASS);
      launch(p);
      return p;
    });
    for (const p of this.p) this.enter(p, 0);
  }
  // the game's random numbers (0x800357EC: x * 1664525 + 1013904223)
  rnd() { return (this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0); }
  u() { return this.rnd() / U; }

  // ---- a frame (the play, 0x86006774; then the show, 0x86006964) ----
  // pads: each person's [stick x, stick y (-64 to 64: up is +y), A pressed this frame] (null: none)
  step(t, pads = []) {
    this.t = t;
    if (!this.over) this.parts();
    for (let k = 0; k < REPEAT; k++) this.sub(pads, !this.over);
    if (!this.over && this.done(t)) { this.end = t; this.over = true; this.events.push(["end"]); }
    // (the show's first frame: nobody's in the play, so the losers drop out of it, and the results
    // start: 0x86006B74-0x86006BC8)
    if (this.over && t === this.end + 1) for (const p of this.p) if (p.state === 8) this.enter(p, 7);
    for (const p of this.p) this.update(p);
  }

  // the CPUs' parts, by their points (0x860076EC): best first
  parts() {
    const list = [];
    for (let k = 0; k < 4; k++) { const p = this.p[(this.first + k) % 4]; if (p.cpu) list.push(p); }
    const n = list.length;
    for (let i = 0; i < n - 1; i++) {
      for (let j = n - 1; j > i; j--) if (list[j - 1].score < list[j].score) [list[j - 1], list[j]] = [list[j], list[j - 1]];
    }
    list.forEach((p, k) => { p.rec = cpuRec(this.level, CPU_ORDER[n - 1][k]); });
  }

  // a step (0x86005CB4): the ghosts, the sticks, the ring, the bumps, and on
  sub(pads, scoring) {
    const on = this.p.filter((p) => p.on);
    for (let i = 0; i < on.length; i++) { // (passing through: barely bouncing, and only a ghost moved)
      for (let j = i + 1; j < on.length; j++) {
        const a = on[i], b = on[j];
        const fa = !a.solid && a.hold <= 0, fb = !b.solid && b.hold <= 0;
        if (fa || fb) bump(a, b, 0.1, fa, fb);
      }
    }
    for (const p of this.p) {
      if (p.empty) continue;
      let x = 0, y = 0, press = false;
      if (!p.cpu && !p.auto) [x, y, press] = pads[p.z] || [0, 0, false];
      if (steerable(p)) {
        if (p.auto) [x, y, press] = this.drive(p);
        else if (p.cpu) [x, y, press] = this.cpu(p);
        push(p, x, y);
        p.stick = [x, y];
      }
      if (press) this.rapidSpin(p);
    }
    for (const p of on) {
      const set = BOUNDS[p.state >= 7 ? 2 : p.state === 3 && p.hold > 0 && p.hard ? 1 : 0];
      if (within(OUTER, p.pos)) {
        bowl(p, INNER, set.inner, 0);
        bowl(p, OUTER, set.outer, INNER.r);
      } else floor(p);
    }
    for (let i = 0; i < on.length; i++) {
      for (let j = i + 1; j < on.length; j++) {
        const a = on[i], b = on[j];
        if (!a.solid || !b.solid) continue;
        let e = BOUND_FACTOR;
        if (a.spin > 0 || b.spin > 0) e = IMPACT_BOUND_FACTOR;
        if (a.spin > 0 && b.spin > 0) e = IMPACT_IMPACT_BOUND;
        const at = [0, 0, 0], j0 = bump(a, b, e, true, true, at);
        if (j0 > 0 && scoring) this.hit(a, b, j0, at);
      }
    }
    for (const p of on) integrate(p, p.state >= 7 ? scale(upAt(p.pos), -GRAVITY) : [0, -GRAVITY, 0]);
  }

  // A pressed (0x860022F8): a RAPID SPIN, if it's charged; crouched to jump, it jumps
  rapidSpin(p) {
    if (p.cool <= 0 && p.spin <= 0 && p.state === 3 && p.hold <= 0) {
      p.spin = IMPACT_TIME;
      this.events.push(["spin", p.z]);
    } else if (p.state === 1) this.enter(p, 2);
  }

  // two Hitmontop bumped (0x86003868): each reels (if not in a RAPID SPIN), and
  // each counts as hit by the other (for a point, if it goes out)
  hit(a, b, j, at) {
    const spun = a.spin > 0 || b.spin > 0;
    for (const [p, q] of [[a, b], [b, a]]) {
      p.hitBy = q.z;
      if (p.spin > 0) continue;
      if (q.spin > 0) { p.hard = true; p.hold = DAMAGE_TIME; }
      else { p.hold = TOUCH_TIME; p.hard = false; }
    }
    const k = j > 8000000 && spun ? 3 : j > 2000000 ? 2 : j > 700000 ? 1 : 0;
    this.events.push(["hit", a.z, b.z, k, at[0], at[1], at[2], +spun]);
    for (const p of [a, b]) {
      p.touch = p.hold < TOUCH_TIME ? TOUCH_TIME : p.hold;
      p.recent = RECENT;
    }
  }

  // ---- each Hitmontop, once a frame (0x860033E8) ----
  update(p) {
    if (p.empty) return; // (no one: it stays where it waits, out of it)
    p.w = [0, 0, 0];
    if (p.recent > 0) { p.recent -= DT; if (p.recent <= 0) p.recent = -1; }
    const spinTo = (to, k = 1) => { p.turn = approach(p.turn, to, DT * 80 * k); };
    switch (p.state) {
      case 0: // waiting outside the ring (0x860029D0)
        if (this.t >= 0) { this.enter(p, 1); break; }
        spinTo(0);
        p.heading = atan2(-p.pos[0], -p.pos[2]);
        break;
      case 1: // crouched to jump in, facing the middle (0x86002B20: its spin 10 pi a frame, which looks still)
        p.hold -= DT;
        if (p.hold <= 0) { p.hold = 0; this.enter(p, 2); break; }
        p.turn = TEN_PI;
        p.heading = atan2(-p.pos[0], -p.pos[2]);
        break;
      case 2: // in, a ghost, till there's room (0x86002A58)
        p.hold -= DT;
        if (p.hold <= 0) {
          p.hold = 0;
          if (this.roomy(p)) this.enter(p, 3);
        } else spinTo(0.5);
        p.heading = wrap(p.heading + p.turn);
        break;
      case 3: { // in the ring (0x86002BF0)
        if (p.touch > 0) p.touch -= DT;
        if (p.touch < 0) p.touch = 0;
        if (p.hold > 0) { p.hold -= DT; spinTo(0); }
        else { p.hold = 0; spinTo(p.spin > 0 ? 67 : (67 - 0.5) * (p.cool / AFTER_IMPACT) + 0.5); }
        p.heading = wrap(p.heading + p.turn);
        if (!within(OUTER, p.pos)) this.enter(p, 4);
        break;
      }
      case 4: { // out on the floor (0x86002DA8)
        const h = heightAt(p.pos);
        spinTo(0);
        p.heading = atan2(-p.pos[0], -p.pos[2]);
        if (within(OUTER, p.pos)) { p.angle = atan2(p.pos[0], p.pos[2]); placeOut(p); } // (it stays out)
        if (p.touch > 0) p.touch -= DT;
        if (p.touch < 0) p.touch = 0;
        const vy = p.vel[1] > 0 ? p.vel[1] : -p.vel[1];
        if (vy < 100 && h <= p.r + AIR) {
          p.vel = [0, 0, 0];
          if (!p.landed) { p.landed = true; p.hold = LANDED; break; }
          p.hold -= DT;
          if (p.hold <= 0) { p.hold = 0; this.enter(p, 1); }
        }
        break;
      }
      case 5: // a winner, on its spot (0x86002F5C)
        spinTo(0);
        p.heading = 0;
        break;
      case 6: { // a winner, going to its spot (0x86002FB4)
        spinTo(0.5);
        const d = sub(p.pos, p.spot);
        d[1] = 0;
        if (sqrtf(len2(d)) < RADIUS * 0.5) this.enter(p, 5);
        p.heading = wrap(p.heading + p.turn);
        break;
      }
      case 7: case 8: // a loser (0x86003124, 0x86003080)
        p.vel = scale(p.vel, 0.4);
        spinTo(0, 10);
        p.heading = wrap(p.heading + p.turn);
        break;
    }
    p.maxV = MAX_SPEED;
    if (p.spin > 0) {
      p.hold = 0;
      p.spin -= DT;
      p.cool = AFTER_IMPACT;
      setMass(p, MASS * IMPACT_WEIGHT);
      if (p.spin <= 0) { p.spin = 0; p.cool = AFTER_IMPACT; }
    } else {
      p.spin = 0;
      setMass(p, MASS);
      if (p.state === 3 && p.hold > 0) { setMass(p, MASS * DAMAGE_WEIGHT); p.maxV = MAX_SPEED_DAMAGED; }
      p.cool -= DT;
      if (p.cool < 0) p.cool = 0;
    }
  }

  // to state s (0x86003EFC)
  enter(p, s) {
    p.state = s;
    p.spin = 0;
    switch (s) {
      case 0: // waiting at its corner (0x86003A0C), facing the middle (0x860029D0, each frame of the countdown)
        p.on = false; p.solid = false;
        p.heading = atan2(-p.pos[0], -p.pos[2]);
        break;
      case 1: // crouch, ready to jump in from the floor where it is (0x86003A98)
        p.on = false; p.solid = false;
        this.events.push(["jump", p.z]);
        p.hold = WAIT_IN;
        p.angle = atan2(p.pos[0], p.pos[2]);
        launch(p);
        break;
      case 2: // in the air, coming in (0x86003C68)
        p.on = true; p.solid = false;
        p.heading = atan2(-p.pos[0], -p.pos[2]);
        p.w = [0, SPIN, 0];
        p.hold = GHOST;
        break;
      case 3: p.on = true; p.solid = true; p.hold = 0; break;
      case 4: { // knocked out of the ring (0x86003B10): a point to whoever hit it last, lately
        p.on = true; p.solid = false; p.landed = false;
        p.falls++;
        this.events.push(["out", p.z]);
        p.angle = atan2(-p.pos[0], -p.pos[2]);
        p.pos[1] += AIR;
        if (p.recent > 0) {
          const q = this.p[p.hitBy];
          if (q && q.state === 3) {
            q.victims.push(p.z);
            q.score++;
            this.events.push(["point", q.z, p.z]);
          }
          p.recent = -1;
        }
        break;
      }
      case 5: p.on = false; p.solid = true; p.heading = 0; break;
      case 6: p.on = true; p.solid = true; p.auto = true; break;
      case 7: p.on = false; p.solid = true; p.vel = [0, 0, 0]; p.w = [0, 0, 0]; break;
      case 8: p.on = true; p.solid = true; p.vel = [0, 0, 0]; p.w = [0, 0, 0]; p.r *= 3; break; // (big: the others keep off)
    }
  }
  // none of the others too near to turn solid (0x86004494)
  roomy(p) {
    for (const q of this.p) {
      if (q.z !== p.z && !q.empty && sqrtf(len2(sub(p.pos, q.pos))) < RADIUS + RADIUS + ROOM) return false;
    }
    return true;
  }

  // ---- the end (0x86005434): five points, a minute, or (never, as it's set) three out of it ----
  // (an empty seat's no part of it: the draw is all those there level)
  done(t) {
    const here = this.p.filter((p) => !p.empty);
    let best = 0, out = 0;
    for (const p of here) {
      if (p.state >= 7) out++;
      else if (p.score >= best) best = p.score;
    }
    if (t + 1 < TIME_LIMIT && out < 3 && best < WINNERS_POINT) return false;
    if (here.every((p) => p.score === here[0].score)) { // (a draw: nobody wins)
      for (const p of here) { p.hold = 0; if (p.state < 7) this.enter(p, 8); }
    } else {
      for (const p of here) { p.hold = 0; if (p.state < 7 && p.score < best) this.enter(p, 8); }
      for (const p of here) {
        if (p.state >= 7) continue;
        if (p.state !== 3) { this.enter(p, 1); this.enter(p, 2); this.enter(p, 3); }
        this.enter(p, 6);
      }
    }
    // the winners' spots: side by side, 30 degrees apart, in front
    const won = this.p.filter((p) => p.state === 6), n = won.length;
    won.forEach((p, k) => {
      const a = f32(f32(f32(f32(k - f32(f32(n - 1) * 0.5)) * f32(PI)) * 30) / 180);
      const d = OUTER.r * 0.65;
      p.spot = [sinf(a) * d, 0, cosf(a) * d];
      p.spot[1] += RADIUS - heightAt(p.spot);
    });
    return true;
  }

  // ---- a CPU (0x8600062C): a RAPID SPIN when it's about to hit someone, and
  // a push at whoever's nearest (from the middle side), or back to the middle;
  // recharging, away from whoever's coming ----
  cpu(p) {
    const rec = p.rec || CPU_RECS[12];
    if (p.state !== 3) return [0, 0, false];
    const rxz = sqrtf(p.pos[0] * p.pos[0] + p.pos[2] * p.pos[2]);
    const out = rxz / INNER.r;
    const near = this.threat(p, bit(rec, 31), bit(rec, 30), 0.08);
    const press = (this.u() < rec.wrong) !== near;
    let target = null;
    if (out < rec.near) {
      if (p.cool > 0) {
        const th = this.nearest(p, bit(rec, 29), bit(rec, 28), 0.3);
        if (th && p.pos[0] * p.pos[0] + p.pos[2] * p.pos[2] > 0.01) {
          const a = wrap(wrap(f32(f32(atan2(th.pos[0] - p.pos[0], th.pos[2] - p.pos[2])) + f32(PI))) * (1 - 0) + 0);
          return [f32(sinf(a) * rec.power), f32(-cosf(a) * rec.power), press];
        }
      } else {
        target = this.nearest(p, bit(rec, 25), bit(rec, 24), 0.3) || this.nearest(p, bit(rec, 23), bit(rec, 22), 0.02);
      }
    }
    let aim = [0, 0, 0], aimV = [0, 0, 0];
    if (target) {
      aim = add(target.pos, setLength([target.pos[0], 0, target.pos[2]], -RADIUS));
      aimV = target.vel;
    }
    const [x, y] = steer(p, aim, aimV, rec.power);
    return [x, y, press];
  }
  // a winner going to its spot, at the end (0x86000AE0): nudged there, and steered
  drive(p) {
    p.pos = add(p.pos, scale(sub(p.spot, p.pos), f32(0.02)));
    const [x, y] = steer(p, p.spot, [0, 0, 0], f32(250));
    return [x, y, false];
  }
  // whom a CPU minds: people (humans), CPUs (cpus), in the ring
  minds(p, q, humans, cpus) {
    return q.z !== p.z && q.state === 3 && (humans || q.cpu) && (cpus || !q.cpu);
  }
  // one it's about to hit within T s (0x86000170)
  threat(p, humans, cpus, T) {
    if (!humans && !cpus || p.state !== 3) return false;
    for (const q of this.p) if (this.minds(p, q, humans, cpus) && closest(p, q, T) < RADIUS + RADIUS + 3) return true;
    return false;
  }
  // and the one that comes nearest within T s (0x860002A8)
  nearest(p, humans, cpus, T) {
    if (!humans && !cpus || p.state !== 3) return null;
    let best = 10000000, who = null;
    for (const q of this.p) {
      if (!this.minds(p, q, humans, cpus)) continue;
      const d = closest(p, q, T);
      if (d < best) { best = d; who = q; }
    }
    return who;
  }

  // ---- for running a frame again (online) ----
  save() {
    const copy = (p) => ({ ...p, pos: [...p.pos], vel: [...p.vel], w: [...p.w], F: [...p.F], T: [...p.T], stick: [...p.stick],
      spot: [...p.spot], victims: [...p.victims] });
    return { t: this.t, end: this.end, over: this.over, seed: this.seed, first: this.first, p: this.p.map(copy) };
  }
  load(s) {
    Object.assign(this, this.save.call(s));
    this.events = [];
  }

  // each one's points, by seat
  get scores() { return this.p.map((p) => p.score); }
  // the places (1-4) by points (among those there; an empty seat's: null)
  get places() { return this.p.map((p) => (p.empty ? null : 1 + this.p.filter((q) => q.score > p.score && !q.empty).length)); }
  // the frames left on the clock
  get left() { return Math.max(0, TIME_LIMIT - ((this.end ?? this.t) + 1)); }
  // a fingerprint of the world, exact, to check two runs of it agree (the tests;
  // tools/topsy_rules.py's is the same)
  digest() {
    const parts = [this.t, this.seed, this.first, this.end ?? -1, +this.over];
    for (const p of this.p) {
      parts.push(...p.pos.map(hex), ...p.vel.map(hex), ...p.w.map(hex), hex(p.r), hex(p.m), hex(p.I), hex(p.maxV), p.state, +p.on,
        +p.solid, hex(p.hold), hex(p.spin), hex(p.cool), hex(p.touch), hex(p.recent), +p.hard, +p.landed, p.score, p.falls,
        p.hitBy, p.victims.join("."), hex(p.angle), +p.auto, ...p.spot.map(hex), ...p.stick.map(hex));
    }
    return parts.join(",");
  }
}

// ---- a Hitmontop's ball ----
// its weight, and so how it turns (0x86007A80)
function setMass(p, m) {
  p.m = m;
  p.I = (((m + m) / 3) * p.r) * p.r * 5;
}
// on the floor out past the rim at its angle, jumping in (0x86001FCC)
function placeOut(p) {
  p.pos[0] = sinf(p.angle) * (OUTER.r + INITIAL_OFFSET);
  p.pos[2] = cosf(p.angle) * (OUTER.r + INITIAL_OFFSET);
}
function launch(p) {
  placeOut(p);
  p.pos[1] = surfaceY(OUTER, p.pos[0], p.pos[2]);
  p.vel = [sinf(p.angle) * -INITIAL_SPEED_H, INITIAL_SPEED_V, cosf(p.angle) * -INITIAL_SPEED_H];
}
// pushed at point at by f (0x86007E4C)
function force(p, at, f) {
  p.F = add(p.F, f);
  p.T = add(p.T, cross(sub(at, p.pos), f));
}
// its stick (0x86007D98)
function push(p, x, y) {
  force(p, p.pos, [STICK_POWER * x * DTS * p.m, 0, -y * STICK_POWER * DTS * p.m]);
}
// on the ground (or near it) and in control (0x860031C8)
export function steerable(p) {
  if (p.r + AIR < heightAt(p.pos)) return false;
  if (p.state === 6) return true;
  if (p.state === 1 || p.state === 2 || p.state === 3) return p.hold <= 0;
  return false;
}
// two balls that touch bounce apart (0x86008038, 0x8600853C; 0x860086A4 for the
// ghosts, which only moves those that are): returns the push, 0 if they don't
function bump(a, b, e, moveA, moveB, at = [0, 0, 0]) {
  const s = a.r + b.r + 1, d = sub(a.pos, b.pos);
  if (s * s < len2(d)) return 0;
  const n = setLength(d, 1);
  const k = a.r / (a.r + b.r);
  const p = [(b.pos[0] - a.pos[0]) * k + a.pos[0], (b.pos[1] - a.pos[1]) * k + a.pos[1], (b.pos[2] - a.pos[2]) * k + a.pos[2]];
  at[0] = p[0]; at[1] = p[1]; at[2] = p[2];
  const spin = [0, SPIN, 0];
  const va = add(cross(spin, sub(p, a.pos)), a.vel), vb = add(cross(spin, sub(p, b.pos)), b.vel);
  const t = setLength(reject(sub(vb, va), n), 1);
  // (0x86007F6C: as if they were hard balls, then more)
  const dn = dot(sub(a.vel, b.vel), n);
  let j = (-(1 + e) * dn) / ((b.r * b.r / b.I + (1 / a.m + 1 / b.m + a.r * a.r / a.I)) * DTS);
  if (j < MIN_BOUND) j = MIN_BOUND;
  if (0 < MAX_BOUND && MAX_BOUND < j) j = MAX_BOUND;
  const imp = add(scale(n, j), scale(t, FRICTION * j));
  force(a, p, imp);
  force(b, p, scale(imp, -1));
  if (moveA) a.pos = add(p, scale(n, a.r));
  if (moveB) b.pos = add(p, scale(n, -b.r));
  return j;
}
// against the ring or the floor at p (normal n): it bounces, and rubs (0x86008BB4)
function rub(p, at, n, [e, fr]) {
  const v = add(cross(p.w, sub(at, p.pos)), p.vel);
  let j = (dot(n, v) * -(1 + e) * p.m) / DTS;
  if (0 < MAX_BOUND && MAX_BOUND < j) j = MAX_BOUND;
  const t = setLength(reject(v, n), 1);
  force(p, at, add(scale(n, j), scale(t, -j * fr)));
  return j;
}
// into the bowl's sphere S (inside its rim, past skip from the middle: 0x86008F4C)
function bowl(p, S, bound, skip) {
  const d = sub(S.c, p.pos), l = sqrtf(len2(d));
  const pen = l - S.R + p.r;
  if (pen <= 0 || 10000 < pen) return;
  const at = [S.c[0] - (d[0] * S.R) / l, S.c[1] - (d[1] * S.R) / l, S.c[2] - (d[2] * S.R) / l];
  if (!within(S, at)) return;
  const dx = at[0] - S.c[0], dz = at[2] - S.c[2];
  if (dx * dx + dz * dz < skip * skip) return;
  if (!(at[1] < S.c[1])) return;
  const n = normalAt(S, at);
  rub(p, at, n, bound);
  p.pos = add(p.pos, scale(n, pen));
}
// onto the floor round the ring (0x86008D2C: 0x86009260 asks for its bounce and friction, +0x20 and +0x30)
function floor(p) {
  const d = p.pos[1] - p.r;
  if (0 < d) return;
  rub(p, [p.pos[0], 0, p.pos[2]], [0, 1, 0], FLOOR);
  p.pos = [p.pos[0], p.pos[1] - d, p.pos[2]];
}
// a step on (0x86009674): its weight, its pushes, gravity g
function integrate(p, g) {
  force(p, p.pos, scale(g, p.m));
  p.vel = add(p.vel, scale(p.F, DTS / p.m));
  if (p.maxV * p.maxV < len2(p.vel)) p.vel = setLength(p.vel, p.maxV);
  p.pos = add(p.pos, scale(p.vel, DTS));
  p.w = add(p.w, scale(p.T, DTS / p.I));
  p.F = [0, 0, 0];
  p.T = [0, 0, 0];
}
// how near q comes to p within T s, as they're going (0x86000020; across the ground)
function closest(p, q, T) {
  const d = [q.pos[0] - p.pos[0], 0, q.pos[2] - p.pos[2]];
  const dv = [q.vel[0] - p.vel[0], 0, q.vel[2] - p.vel[2]];
  const dd = dot(d, dv), vv = len2(dv);
  if (vv < 0.01) return sqrtf(len2(d));
  const t = -dd / vv;
  if (t <= 0.05) return sqrtf(len2(d));
  if (T <= t) return sqrtf(len2(add(d, scale(dv, T))));
  return sqrtf(len2(d) - (-dd / vv) * dd);
}
// a stick towards aim, as far as power (0x8600050C)
function steer(p, aim, aimV, power) {
  const dv = [aimV[0] - p.vel[0], 0, aimV[2] - p.vel[2]];
  let d = [aim[0] - p.pos[0], 0, aim[2] - p.pos[2]];
  d = sub(d, scale(dv, (DT / REPEAT) * 1));
  if (f32(power * power) < len2(d)) d = setLength(d, power);
  return [f32(d[0]), f32(-d[2])];
}

const view = new DataView(new ArrayBuffer(8));
function hex(v) {
  view.setFloat64(0, v + 0); // (-0 as 0: Python's whole numbers have no sign)
  return view.getUint32(0).toString(16).padStart(8, "0") + view.getUint32(4).toString(16).padStart(8, "0");
}
