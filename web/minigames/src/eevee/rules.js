// Eager Eevee's rules, as the game's code module (#61) has them
// (docs/minigames.md has where each number is). The game runs its logic 30
// times a second (NTSC; a PAL console's 25 has its own numbers for the CPUs,
// not used here) and counts in frames; so does this. Angles are in units of
// 1/9000 of a radian, so the ring's turns add up exactly the same here and on
// the rooms server (tools/eevee_rules.py, which keeps a copy of the round's
// script, the presses and the judging: keep the two the same).
//
// Four Eevee walk round a ring with Aipom in the middle, hanging on its rope
// over a basket. Five times, Aipom lifts the basket: under it is a melon
// (1000 points), grapes (500), a pile of ten strawberries (100 each, for
// everyone there while they last) or a Pineco, which blows up whoever gets to
// it. A dashes in, B fakes a dash. Before the real thing Aipom may fake it,
// lifting the basket a little and dropping it again; an Eevee that dashes
// before the basket's up runs into it and has to go back and find its place
// on the ring before it can try again. The first to get there wins it (a tie
// shares it). The last round is three piles of strawberries.

export const FPS = 30;
export const ROUNDS = 5;
export const LEVELS = { easy: 1, normal: 2, hard: 3 }; // the COM level byte (the menu's 1-3)
// the level the module plays at: the COM level, or Normal with four people (0x86B00934)
export const levelCode = (level, cpus) => (cpus ? LEVELS[level] ?? 2 : 2);

export const FRUIT = 0, BERRIES = 1, PINECO = 2; // what's under the basket (0x86B17A84)
export const MELON = 0, GRAPES = 1; // which fruit (0x86B17A88)
export const POINTS = { [MELON]: 1000, [GRAPES]: 500, berry: 100 }; // (0x86B038E0 ...)
export const PILE = 10; // strawberries in a pile (0x86B0B1F8)

// The ring (0x86B0D1FC): the Eevee walk round it at radius 130, each at its
// own place (these angles, plus the ring's turn), and dash in to 45.
export const HOME = [3.92699, 5.49779, 2.35619, 0.785398];
export const RING_R = 130, REACH = 45;
// the ring turns 0.016 radians a frame (0.0191111 in the final round): in units
export const UNIT = 9000; // a radian
export const TURN = 56549; // 2 pi
export const SPIN = [144, 172];
export const CATCH = 288; // an Eevee behind its place catches up 0.032 a frame (0x86B05D2C); A works within that

// A round's frames: Aipom's call (its clip 2), then the race, from the play's
// frame 0. The basket comes up at frame O (the open); a dash on frame f gets
// past it if f >= O + LID (the basket's up: 0x86B018F0) and gets in on frame
// f + RUN (in 28 a frame to 75, 14 a frame to 45: 0x86B0632C). A and B work
// till O + 99 (0x86B0590C), or till the round's won.
export const INTRO = 28;
export const LID = 4, RUN = 4, WINDOW = 99;
export const AFTER = 150; // the round goes on this long after the open: the eating, the walk back (*the remake's*)
// frames till A and B work again: after a feint (out to 100 and back: 0x86B06484,
// 0x86B06674), after running into the basket (bounced back, clip 8, then the
// walk to its place) and after a Pineco (blown away, three clips, then
// waiting outside the ring till its place comes round: 0x86B05A78)
export const FEINT = [11, 12], BONK = [87, 109];
export const BLOWN_CLIPS = 115, WALK_IN = 42;
export const PINECO_CLOSE = 24; // after a Pineco goes off, the race closes (0x86B04244)

// The game's random numbers, 0x8007B100: (4x + 2)(4x + 3) / 4, in 32 bits
export function quad(seed) {
  let x = seed >>> 0;
  return () => (x = Math.imul(4 * x + 2, 4 * x + 3) >>> 2);
}

// ---- the rounds ----
// Each round's script (0x86B0B04C): what's under the basket, when it comes up
// (O), and Aipom's fakes before that (frames). From the round's seed, the same
// as tools/eevee_rules.py.
export function deal(seed, level) {
  const Q = quad(seed);
  const rounds = [];
  let last = [-1, -1];
  for (let n = 0; n < ROUNDS; n++) {
    let kind, fruit = MELON, piles = 1;
    if (n < ROUNDS - 1) {
      const pineco = !(n === 0 && level <= 1); // no Pineco in the first round on Easy
      do kind = pineco ? [FRUIT, FRUIT, BERRIES, PINECO][Q() % 4] : [FRUIT, FRUIT, BERRIES][Q() % 3];
      while (kind === last[0] && kind === last[1]); // never three of a kind in a row
      last = [last[1], kind];
      if (kind === FRUIT) fruit = Q() % 3 ? GRAPES : MELON;
    } else {
      kind = BERRIES;
      piles = 3;
    }
    let open = level <= 1 || Q() % 100 >= 20 ? Q() % 141 + 60 : Q() % 21 + 30;
    // after a Pineco round Aipom waits longer: the game does when an Eevee
    // isn't back yet (0x86B0B2C8; here always after one)
    if (n > 0 && rounds[n - 1].kind === PINECO) open = Q() % 51 + 70;
    const fakes = [];
    if (open >= 60) {
      const r = Q() % 100;
      const N = level <= 1 ? (r < 5 ? 2 : r < 30 ? 1 : 0) : r < 5 ? 3 : r < 15 ? 2 : r < 40 ? 1 : 0;
      const v = Math.trunc((open - 10) / N);
      for (let k = 0; k < N; k++) fakes.push(Q() % (v - 14) + v * k + 10);
    }
    rounds.push({ n, kind, fruit, piles, open, fakes, final: n === ROUNDS - 1 });
  }
  return rounds;
}

// when each round starts (Aipom's call), its race starts (play), the basket
// comes up (open), A stops working (close) and it ends: frames from GO
export function timeline(rounds) {
  let t = 0;
  return rounds.map((rd) => {
    const start = t, play = start + INTRO, open = play + rd.open, end = open + AFTER;
    t = end;
    return { start, play, open, close: open + WINDOW, end, fakes: rd.fakes.map((f) => play + f) };
  });
}

// the round on at frame t (the last one after the end)
export function roundAt(times, t) {
  for (let n = 0; n < times.length; n++) if (t < times[n].end) return n;
  return times.length - 1;
}

// how far the ring has turned by the end of frame t (units)
export function ring(times, t) {
  if (t < 0) return 0;
  const f = times[ROUNDS - 1].start; // the final round turns faster
  return SPIN[0] * Math.min(t + 1, f) + SPIN[1] * Math.max(0, t + 1 - f);
}

// ---- a seat's presses ----
// Whether a press works, and what comes of it. A and B work while the Eevee's
// at its place on the ring (0x86B05960), in the race, till it's won. A dash
// before the basket's up runs into it; one after gets in RUN frames later.
export class Runner {
  constructor(times, rounds) {
    this.times = times;
    this.rounds = rounds;
    this.ready = 0; // A and B work from this frame (from GO)
    this.in = rounds.map(() => null); // the frame it got in, by round
    this.blown = rounds.map(() => null);
  }
  // can it press at frame t? (closed: the frame its round was won, if it has been)
  can(t, closed = null) {
    const n = roundAt(this.times, t), T = this.times[n];
    return t >= this.ready && t >= T.play && t < T.close && this.in[n] === null && (closed === null || t <= closed);
  }
  // press k ("a" or "b") at frame t: null if it doesn't work, or what it comes to:
  // { k, t, n, bonk } or { k, t, n, in: the frame it gets in }
  press(k, t, closed = null) {
    if (!this.can(t, closed)) return null;
    const n = roundAt(this.times, t), T = this.times[n], fin = this.rounds[n].final ? 1 : 0;
    if (k === "b") {
      this.ready = t + FEINT[fin];
      return { k, t, n };
    }
    if (t < T.open + LID) {
      this.ready = t + BONK[fin];
      return { k, t, n, bonk: true };
    }
    this.in[n] = t + RUN;
    if (this.rounds[n].kind === PINECO) this.ready = this.blownBack(t);
    return { k, t, n, in: t + RUN };
  }
  // blown away by a Pineco it dashed at on frame t: back at its place when the
  // ring's been round once since (its place left it there), and it's walked in
  blownBack(t) {
    const from = ring(this.times, t - 1), fin = this.times[ROUNDS - 1].start;
    let u = t + RUN + BLOWN_CLIPS;
    while (ring(this.times, u) - from < TURN - SPIN[u >= fin ? 1 : 0]) u++;
    return u + WALK_IN;
  }
}

// ---- who gets what ----
// A round's race from when each seat got in (frames from GO, or null), as
// the basket's contents see it each frame (0x86B03628; r <= 45: 0x86B05548):
// pts by seat, the frame it was decided (A stops working after it), who got
// there in time (got: a melon or grapes, or strawberries) and who was blown
// up (blown). null while nobody's got there.
export function judge(rd, T, ins) {
  const arrived = ins.map((a) => (a === null || a === undefined ? Infinity : a));
  const first = Math.min(...arrived);
  if (first === Infinity) return null;
  const pts = [0, 0, 0, 0], got = [false, false, false, false], blown = [false, false, false, false];
  if (rd.kind === FRUIT) {
    arrived.forEach((a, s) => { if (a === first) { pts[s] = POINTS[rd.fruit]; got[s] = true; } });
    return { pts, decided: first, got, blown, first };
  }
  if (rd.kind === PINECO) {
    const decided = first + PINECO_CLOSE;
    arrived.forEach((a, s) => { blown[s] = a !== Infinity; });
    return { pts, decided, got, blown, first };
  }
  const left = eat(rd, arrived, Infinity, pts);
  pts.forEach((x, s) => { got[s] = x > 0; });
  return { pts, decided: left.last, got, blown, first };
}

// Strawberries: every frame, everyone there gets one from each pile still
// there (and the pile goes one down for each: 0x86B03A30), till they're gone.
// What's left of each pile at the end of frame t (and in pts, what each seat's had).
export function eat(rd, ins, t = Infinity, pts = [0, 0, 0, 0]) {
  const arrived = ins.map((a) => (a === null || a === undefined ? Infinity : a));
  const left = new Array(rd.piles).fill(PILE);
  let u = Math.min(...arrived);
  for (; u <= t && u !== Infinity && left.some((c) => c > 0); u++) {
    for (let p = 0; p < left.length; p++) {
      if (left[p] <= 0) continue;
      for (let s = 0; s < 4; s++) {
        if (arrived[s] > u) continue;
        pts[s] += POINTS.berry;
        left[p] = Math.max(0, left[p] - 1);
      }
    }
  }
  left.last = u - 1; // the frame the last went
  return left;
}

// what a reaction time shows (the ". sec." box), in hundredths: frames from
// the basket being up (0x86B059C4: 3 (p - O - 5) + a random 0-2, p = f + 1)
export const reaction = (T, t, jitter) => 3 * (t - T.open - LID) + jitter;

// ---- the CPUs ----
// Each round (0x86B0BF2C, for all four seats) a CPU plans its presses: its
// reaction times, and whether it falls for Aipom's fakes (dashes or feints at
// them) or, with none, how it takes the real thing (and a Pineco). Frames are
// the game's frame counter, one ahead of the frame they're pressed on
// (0x86B0BB24 compares them with 0x86B17CFC, counted before the Eevee move).
const REACT = { 1: [17, 11], 2: [14, 9], 3: [13, 7] }; // a reaction: base + Q() % spread
const FAKE = { 1: [[30, 60], [7, 37]], 2: [[20, 60], [5, 45]], 3: [[10, 60], [2, 52]] }; // [last fake, others]: dash below, feint below
const NO_FAKES = { 1: { feint: 10, pDash: 30, pFeint: 40 }, 2: { feint: 0, pDash: 20, pFeint: 20 }, 3: { feint: 0, pDash: 10, pFeint: 10 } };
const AGAIN = { 1: 28, 2: 23, 3: 20 }; // from O + this (+0-3) it presses A every frame, as soon as it can
const HOLD = { 1: 17, 2: 14, 3: 13 }; // never A sooner than this after the open
// when another Eevee feints within this many frames of a fake, a CPU may fall
// for it (0x86B0CB1C): [chance on the last fake, on the others], window, base, spread
const FOOLED = { 1: [60, 15, 24, 21, 11], 2: [40, 10, 18, 14, 9], 3: [20, 5, 14, 11, 7] };

export function cpuPlan(level, rd, Q) {
  const L = REACT[level] ? level : 2;
  const [base, spread] = REACT[L];
  const r1 = [], r2 = [];
  for (let k = 0; k < 4; k++) { r2[k] = (Q() % spread) + base; r1[k] = (Q() % spread) + base; }
  const a = [-1, -1, -1, -1], b = [-1, -1, -1, -1];
  const r = Q() % 100, N = rd.fakes.length, pineco = rd.kind === PINECO;
  for (let k = 0; k < N; k++) {
    const last = k === N - 1, [dash, feint] = FAKE[L][last ? 0 : 1];
    if (r < dash) a[k] = rd.fakes[k] + r1[k];
    else if (r < feint) b[k] = rd.fakes[k] + r1[k];
    else if (last) a[3] = rd.open + r2[k];
  }
  if (N === 0) {
    const t = NO_FAKES[L];
    if (!pineco) {
      if (r < t.feint) b[3] = rd.open + r1[3];
      else a[3] = rd.open + r2[3];
    } else if (r < t.pDash) a[3] = rd.open + r2[3];
    else if (r < t.pFeint) b[3] = rd.open + r1[3];
  }
  const again = pineco ? -1 : rd.open + (Q() & 3) + AGAIN[L];
  return { a, b, fooled: -1, again, level: L };
}

// a CPU's buttons on frame f of the round's play (0x86B0BB24)
export function cpuInput(plan, rd, f) {
  const p = f + 1;
  let A = plan.a.includes(p) || plan.fooled === p || (plan.again > 0 && p >= plan.again);
  const B = plan.b.includes(p);
  if (A && p >= rd.open && p < rd.open + HOLD[plan.level]) A = false;
  return { A, B };
}

// another Eevee feinted on frame g: a CPU may fall for it, if it's soon after
// one of Aipom's fakes, and dash; Q: its random numbers
export function cpuFooled(plan, rd, g, Q) {
  const [onLast, onOthers, w, base, spread] = FOOLED[plan.level];
  const s0 = g + 1, r = Q() % 100;
  rd.fakes.forEach((fk, k) => {
    const last = k === rd.fakes.length - 1;
    if (r < (last ? onLast : onOthers) && fk <= s0 && s0 <= fk + w) plan.fooled = s0 + base + (Q() % spread);
  });
}
