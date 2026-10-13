// Pichu's Power Plant's rules, as the game's code module (#54) has them
// (docs/minigames.md has where each number is). Everything counts in the
// game's frames, 30 a second.
//
// Four Electrodes sit round each Pichu, one a direction (1 up, 2 down,
// 3 right, 4 left), the same for every player. One at a time "pops out", blue
// (press A) or green (press B), and stays live through the next cycle; a
// little before each cycle ends the next pops out (another direction), so for
// a while two are live. A press of the right button with the direction held
// towards a live Electrode charges 1; 80 wins (a tie: everyone who gets
// there on the same frame). The wrong button, or a press towards a dead one,
// charges nothing and shocks the Pichu: no input for 10 frames. A press with
// no direction does nothing, and the button has to come up between presses
// (one every other frame at most).
//
// Here the Electrodes' pattern has random numbers of its own (in the game
// the CPUs and the sparks draw from the same ones), so it's the same for
// every device and the server whoever plays; the CPUs have theirs.
// Tools/pichu_rules.py is the rooms server's copy: keep the two the same.
// Online with the CPUs off, the seats no one plays are empty: no Pichu there,
// so no presses (never full: never a winner) and no place (game.js leaves
// them out); the Electrodes and the CPUs' random numbers are the same.

export const FPS = 30;
export const FULL = 80; // charge to win (0x86606720)
// frames without input after a miss: clip 10 (10 frames) starts the frame
// after it (0x86601A9C), and input's back once it's at its last (0x86601B04)
export const SHOCK = 10;
export const GAP = 2; // frames between one press and the next, at least
export const END = 130; // frames from the finish to the results (0x8660429C: 50 + 80, all won or not)
export const A = 5, B = 6; // the buttons, as the game numbers what an Electrode wants
export const DIRS = { up: 1, down: 2, right: 3, left: 4 };
export const LEVELS = { easy: 1, normal: 2, hard: 3 };
// by c (4 - the COM level; 0 with no CPUs: 0x86600EEC): the base cycle
// (0x8660722C), the warning W (0x86606724), the first cycle's pop-out
// (0x86606ADC), the button balance's step (2 for c 0-2, 1 for c 3-4: 0x86600474)
const BASE = { 0: 70, 1: 60, 2: 60, 3: 80, 4: 120 };
export const WARN = { 0: 35, 1: 25, 2: 25, 3: 40, 4: 60 };
const FIRST = [1, 12, 15, 20, 25];
const STICK = { 1: 0, 2: 0, 3: 0, 4: 1 }; // 0x86606ACC[c] (c 0 reads the column counter there)
// the CPUs (0x86600678): x = rand % 399, then x / a0 + add frames to the next press,
// a0 = div - MOOD[mood] + RAMP * the round's speed (0-10)
const CPU_ADD = { 1: 1, 2: 2, 3: 4, 4: 6 };
const CPU_DIV = { 1: 120, 2: 140, 3: 120, 4: 140 };
const MOOD = { 1: [0, 10, 30, 40, 50], 2: [0, 20, 40, 70, 90], 3: [0, 20, 30, 40, 50], 4: [0, 10, 30, 40, 50] };
const RAMP = { 1: 8, 2: 10, 3: 20, 4: 25 };
// the 24 orders of the four directions (0x8660694C), in this order
const ROWS = [];
(function perm(rest, row) {
  if (!rest.length) ROWS.push(row);
  rest.forEach((d, i) => perm([...rest.slice(0, i), ...rest.slice(i + 1)], [...row, d]));
})([1, 2, 3, 4], []);

// The game's random numbers: 0x8007B100 ((4x + 2)(4x + 3) / 4) and
// 0x800357EC (x * 1664525 + 1013904223).
export function quad(seed) {
  let x = seed >>> 0;
  return () => (x = Math.imul(4 * x + 2, 4 * x + 3) >>> 2);
}
export function lcg(seed) {
  let x = seed >>> 0;
  return () => (x = (Math.imul(x, 1664525) + 1013904223) >>> 0);
}

// c for a round: 4 - the COM level, or 0 when every seat is a person
export const levelCode = (level, cpus) => (cpus ? 4 - (LEVELS[level] || 2) : 0);

// The round's Electrodes (the play's state 1, 0x866056B8, and its cycles,
// 0x86600CC4 and 0x86600298) for `frames` frames from GO: list, each { dir,
// btn, from (the frame it pops out), close (it starts going back in), to (the
// frame it goes dead) }; a press on frame t sees it if from < t <= to (the
// players' presses come before each frame's play). And each frame's state
// after its play, for the CPUs: g0 (frames into the cycle), L (the cycle's
// last frame), cur and nxt (indexes into list).
export function pattern(seed, c, frames = 30 * 300) {
  const r2 = quad(seed ^ 0x2545f491), rl = lcg(seed ^ 0x6d2b79f5);
  const W = WARN[c], L0 = BASE[c], step = c < 3 ? 2 : 1;
  const list = [], at = { g0: new Int16Array(frames), L: new Int16Array(frames), cur: new Int16Array(frames), nxt: new Int16Array(frames) };
  let g0 = 0, total = 0, L = 0, event = -100, bal = 0, run = 0, col = 0, row = 0;
  let cur = -1, nxt = -1; // indexes into list
  const setup = (t) => {
    let d;
    for (;;) {
      if (col === 0) row = r2() % 24;
      d = ROWS[row][col];
      col = (col + 1) % 4;
      if (nxt < 0 || d !== list[nxt].dir) break;
    }
    let b;
    if (rl() % 101 < 50 - 15 * bal) { b = A; bal += step; } else { b = B; bal -= step; }
    if (nxt >= 0) {
      if (b === list[nxt].btn) run++;
      else if (run < (c ? STICK[c] : col)) { b = list[nxt].btn; run++; } else run = 0;
    }
    if (nxt < 0) { // the first: one pops out at once, the button the same
      let n;
      do n = (r2() % 4) + 1; while (n === d);
      list.push({ dir: n, btn: b, from: t, close: Infinity, to: Infinity });
      nxt = list.length - 1;
    } else list[cur].to = t;
    cur = nxt;
    list.push({ dir: d, btn: b, from: Infinity, close: Infinity, to: Infinity });
    nxt = list.length - 1;
  };
  for (let t = 0; t < frames; t++) {
    total++;
    g0++;
    if (g0 === event) list[nxt].from = t;
    if (cur >= 0 && g0 + 8 === L) list[cur].close = t;
    if (L < g0) {
      L = L0 - Math.floor(((r2() % 30) + 40) / 5);
      event = total < 10 ? L - W + FIRST[c] : L - W - 5;
      g0 = 0;
      setup(t);
    }
    at.g0[t] = g0; at.L[t] = L; at.cur[t] = cur; at.nxt[t] = nxt;
  }
  return { list, at, frames };
}

// the Electrode live in direction dir for a press on frame t, or null
export function liveAt(P, t, dir) {
  const list = P.list;
  for (let i = list.length - 1; i >= 0; i--) {
    const e = list[i];
    if (e.from >= t) continue;
    if (e.dir === dir && t <= e.to) return e;
    if (e.to < t - 200) break;
  }
  return null;
}

// One person's charge, from their presses in order (a device's own, or the
// server's copy of what it says): press(t, dir, btn) -> "hit", "miss" or
// null (not taken: shocked, too soon after the last, or after the finish).
export class Runner {
  constructor(P) {
    this.P = P;
    this.charge = 0;
    this.last = -99; // the last press (the button has to come up between)
    this.missAt = -99; // the last miss (the shock after it)
    this.full = null; // the frame it got to FULL
    this.presses = []; // [t, dir, btn, result]
  }
  can(t) { return this.full === null && t - this.last >= GAP && !(t > this.missAt && t <= this.missAt + SHOCK); }
  shocked(t) { return t > this.missAt && t <= this.missAt + SHOCK; }
  press(t, dir, btn) {
    if (!this.can(t)) return null;
    this.last = t;
    if (!dir) return null; // (no direction: nothing at all)
    const e = liveAt(this.P, t, dir);
    let res;
    if (e && e.btn === btn) {
      this.charge++;
      if (this.charge >= FULL) this.full = t;
      res = "hit";
    } else {
      this.missAt = t;
      res = "miss";
    }
    this.presses.push([t, dir, btn, res]);
    return res;
  }
}

// The CPUs' presses for the round (0x86600678 plans them, the players'
// callback 0x86602260 makes them): for each seat that's a CPU, [{ t, dir,
// hit }] up to its finish, and its finish frame (or null). They never pick a
// button and don't miss a live Electrode; near a cycle's end, aiming past
// their margin, they go for the next one (with a free pass at it) or, now
// and then, a random direction (a shock if nothing's live there). A miss
// drops the plan (0x86600CB8) and the planner, which doesn't look at the
// shock, plans again that frame; the press waits till the shock's over.
// w: W as it was before the round, which the margin takes (it's drawn before
// the round's init sets W: 0x86600F80): 30 (the data's) in a first round, the
// last round's W[c] in a "play again" (state 13 inits again, 0x866044B8).
export function cpuPresses(seed, c, cpus, P, w = 30) {
  if (!cpus.some(Boolean) || !c) return [0, 1, 2, 3].map(() => null);
  const r2 = quad(seed ^ 0x1b873593), rl = lcg(seed ^ 0x3c6ef372), at = P.at;
  const players = [0, 1, 2, 3].map((i) => ({
    i, cpu: !!cpus[i], off: (r2() % w) - 5, mood: rl() % 5,
    planned: false, at: 0, dir: 0, free: false, missAt: -99, charge: 0, full: null, presses: [],
  }));
  const ramp = rl() % 11;
  for (let t = 0; t < P.frames; t++) {
    const g0 = t ? at.g0[t - 1] : 0; // (as the players' callbacks see it: before this frame's play)
    for (const p of players) {
      if (!p.cpu || p.full !== null) continue;
      if (t > p.missAt && t <= p.missAt + SHOCK) continue; // (shocked: no input, 0x86602324)
      if (!p.planned || !(p.at < g0)) continue;
      const e = liveAt(P, t, p.dir);
      let hit = !!e;
      if (!e && p.free) { hit = true; p.free = false; }
      if (hit) {
        p.charge++;
        if (p.charge >= FULL) p.full = t;
        if (e) p.planned = false; // (a free pass doesn't drop the plan: it presses again next frame)
      } else {
        p.missAt = t;
        p.planned = false;
      }
      p.presses.push({ t, dir: p.dir, hit });
    }
    if (players.every((p) => !p.cpu || p.full !== null)) break;
    // this frame's play: a new cycle drops every plan; then the plans
    if (at.g0[t] === 0) for (const p of players) if (p.cpu) p.planned = false;
    const L = at.L[t], cur = P.list[at.cur[t]], nxt = P.list[at.nxt[t]];
    for (const p of players) {
      if (!p.cpu || p.planned || p.full !== null) continue;
      p.planned = true;
      const x = r2() % 399;
      let add = 0, a0;
      if (c === 3) {
        a0 = CPU_DIV[3] - MOOD[3][p.mood] + RAMP[3] * ramp;
        if (ramp >= 8) { add = -1; a0 -= 150; }
        if (a0 <= 0) a0 = 10;
      } else a0 = CPU_DIV[c] - MOOD[c][p.mood] + RAMP[c] * ramp;
      p.at = at.g0[t] + add + Math.floor(x / a0) + CPU_ADD[c];
      p.dir = cur.dir;
      if (L - p.off < p.at) { // too late for this one
        const wrong = c === 1 ? x < 10 && ramp < 7 : c === 2 ? x < 30 : c === 3 ? x < (ramp < 7 ? 100 : 50) : x < 120;
        if (c !== 4 && !wrong) p.free = true;
        p.dir = wrong ? (rl() & 3) + 1 : nxt.dir;
      }
    }
  }
  return players.map((p) => (p.cpu ? { presses: p.presses, full: p.full } : null));
}

// the finish: the first frame anyone's charge is full, and everyone full then
export function finish(fulls) {
  const at = Math.min(...fulls.map((f) => (f === null || f === undefined ? Infinity : f)));
  return at === Infinity ? null : { at, winners: fulls.map((f) => f === at) };
}
