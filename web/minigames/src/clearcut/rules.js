// Clear Cut Challenge's rules, as the game's code module (#53) has them
// (docs/minigames.md has where each number is). Everything counts in the
// game's frames: it runs its logic 30 times a second (25 on a PAL console,
// with its speeds scaled by 1.2: the same thing in real time). Units are the
// game's: y up, the ground at 0, a log 389 long.
//
// A round is five logs. Spinarak hauls each one up on its thread and lets it
// drop; it falls with gravity, y = 285 - 4.9 (r f)^2 for its bottom f frames
// after the drop. Pressing A swings the blade, which cuts 2 frames later at
// height 90: a cut counts if the blade meets the log then. The white line is
// where the log is at the blade when you press on the target frame T:
//   T - press = 0          20 points (a perfect cut)
//   early by 1, 2, 3, 4, 5  10, 5, 4, 3, 2; by more, 1
//   late by 1..5 or more    -1..-5 (cutting above the line costs points)
//   a miss, or no cut       -10
// A cut is the log's last swing. After a miss, A works again 45 frames on, and
// the last swing is the one that counts; but a miss while the log's still
// above the blade locks A for the log if it gets to the blade before then. A
// total never goes below 0. Tools/clearcut_rules.py is the rooms server's copy
// of the deal and the judging: keep the two the same. Online with the CPUs
// off, the seats no one plays are empty: no Scyther there, so no cuts, no
// misses and no place (game.js leaves them out; the deal's the same).
//
// The CPU level also sets how fast the logs fall and where the targets are
// (the game uses the COM level for both); with no CPUs it uses its default.

export const FPS = 30;
export const LOGS = 5;
export const Y0 = 285; // the log's bottom when it drops (0x8650C4AC)
export const LENGTH = 389; // the log's length (0x8650C4CC)
export const TOP = 92; // the blade can meet the log from its bottom at this height (0x8650C498)...
export const BOTTOM = TOP - LENGTH - 10; // ...until its bottom is down to here (0x8650C4B4)
export const BLADE = 90; // the white line: where the blade meets the log, as the target is set (0x86501FA0)
export const FALL_FRAMES = 80; // after the drop, a log's cuts are judged and it's put on show
export const POINTS = [20, 10, 5, 4, 3, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]; // by frames early (0x8650D0D4)
export const MISS = -10;
export const LATE_MAX = 5;
export const AGAIN = 45; // after a miss, the frames till A works again (0x86503C90)
// frames between a log hanging ready and its drop, by the log's slot in the
// deal (0x8650C480): the first log always waits 100, the others in a shuffled order
export const WAITS = [100, 40, 0, 70, 150];
// the levels as the game's COM level byte (the menu: Easy 1, Normal 2, Hard 3);
// the code works with 4 - level ("c", 0x8650C45C per player): 1 is the hardest
export const LEVELS = { easy: 1, normal: 2, hard: 3 };
// fall rate r by c (0x86502620): harder, faster. c 0 (no CPUs) falls as c 2
const RATE = { 1: 0.45, 2: 0.4, 3: 0.35, 4: 0.3 };
// where the target may be in the window, by c (0x86501EA0): [first frame, spread from the window's size]
const TARGET = { 0: [2, -4], 1: [1, -3], 2: [2, -4], 3: [4, -6], 4: [4, -7] };
// a CPU keeps its total under about this (0x8650C5CC), by c
const CAP = { 1: 55, 2: 40, 3: 20, 4: 12 };

// Timeline (frames), fixed so every device and the server agree on when each
// log drops. From a log's start: Spinarak goes down its thread (30 frames),
// waits (6), hauls the log up (63) and it bounces at the top (18); it's ready.
// The show after the fall (0x8650515C, its states at 0x8650C610): it starts
// on frame 80 of the fall; the signposts rise with the pieces on them (69
// frames), settle (9), the points come down and count in (71), and the
// signposts fall away (29 frames: their clock goes up 0.15 for each of the
// four as it's moved, 0.6 a frame, 0x865054D4); a frame after they're all
// below -1500 the next log is set up (0x86509AC8), or after the fifth the
// results start (0x86502B88): 180 frames.
export const RISE = 117;
export const SHOW = 180;
export const FETCH = { down: 30, wait: 6, up: 63, bounce: 18 };

const f32 = Math.fround;

// The game's two random number generators: 0x800357EC, the linear
// congruential one (x * 1664525 + 1013904223), and 0x8007B100, a quadratic
// one ((4x + 2)(4x + 3) / 4). Seeded here from the round's seed.
export function lcg(seed) {
  let x = seed >>> 0;
  return () => (x = (Math.imul(x, 1664525) + 1013904223) >>> 0);
}
export function quad(seed) {
  let x = seed >>> 0;
  return () => (x = Math.imul(4 * x + 2, 4 * x + 3) >>> 2); // (4x + 2 wraps like the game's u32 math)
}

// c for a round: 4 - the COM level, or 0 when every seat is a person
export const levelCode = (level, cpus) => (cpus ? 4 - LEVELS[level] : 0);

// The fall for a round's c: r, the first frame to look at (the game's window
// start, w0, is 1 frame before the log reaches the blade's reach), the window's
// size in frames, the log's bottom f frames after the drop (f < 0: it hangs),
// and reach, the first frame its bottom's down to the blade.
export function fall(c) {
  const r = f32(RATE[c || 2]);
  const k = 4.9 * r * r; // (double, as the game multiplies)
  const y = (f) => (f < 0 ? Y0 : f32(Y0 - k * f * f));
  const root = f32(Math.sqrt(f32((Y0 - TOP) / 4.9))); // 0x86502524, in floats
  const w0 = Math.trunc(f32(f32(f32(root / r) + 1) - 2));
  let size = 0; // 0x86501D6C: the frames from w0 + 2 on (100 of them) with the log in reach
  for (let f = w0 + 2; f < w0 + 102; f++) {
    const v = y(f);
    if (!(v < BOTTOM) && !(TOP < v)) size++;
  }
  let reach = 0;
  while (TOP < y(reach)) reach++;
  return { c, r, k, y, w0, size, reach };
}

// The deal: for each log, its wait before the drop and its target frame T
// (frames after the drop; the white line is where the log is at the blade 2
// frames after T). The same numbers as tools/clearcut_rules.py.
export function deal(seed, c) {
  const F = fall(c);
  const L = lcg(seed), Q = quad(seed ^ 0x2545f491);
  // 0x86502A54: slots 0-4, then ten tries at swapping two (slot 0 never moves)
  const slots = [0, 1, 2, 3, 4];
  for (let n = 0; n < 10; n++) {
    const a = Q() % 5;
    let b;
    do b = Q() % 5; while (b === a);
    if (a && b) [slots[a], slots[b]] = [slots[b], slots[a]];
  }
  const [first, spread] = TARGET[c];
  return slots.map((slot) => {
    const at = L() % (F.size + spread + 1) + first; // 0x86501EA0
    const T = F.w0 + at;
    return { wait: WAITS[slot], T, line: f32(BLADE - (Y0 - F.k * (T + 2) * (T + 2))) };
  });
}

// when each log starts, drops and ends, in frames from GO
export function timeline(logs) {
  let t = 0;
  return logs.map((log) => {
    const start = t, ready = start + RISE, drop = ready + log.wait, judged = drop + FALL_FRAMES, end = judged + SHOW;
    t = end;
    return { start, ready, drop, judged, end };
  });
}

// A press f frames after the drop (negative: while the log hangs): what the
// cut comes to. d = T - f: > 0 early, < 0 late. pts: what it adds to the total
// (negative: what it takes off).
export function judge(F, log, f) {
  if (f === null || f === undefined) return { kind: "none", pts: MISS, at: null, d: null };
  const at = F.y(f + 2); // the log's bottom when the blade meets it
  if (at < BOTTOM || TOP < at) return { kind: "miss", pts: MISS, at, d: null };
  const d = log.T - f;
  const pts = d >= 0 ? POINTS[Math.min(d, 15)] : -Math.min(-d, LATE_MAX);
  return { kind: d === 0 ? "perfect" : d > 0 ? "early" : "late", pts, at, d };
}

// a total after a log's result
export const add = (total, pts) => (pts >= 0 ? total + pts : Math.max(0, total + pts));

// After a miss at frame f, the frame A works again from (0x86503C90: a
// counter from the swing, to 46), or Infinity: a miss while the log's still
// above the blade stops the counter when the log gets down to it (0x3c of the
// player, 1 then 2), so A's locked till the next log
export const again = (F, f) => (f < F.reach && F.reach <= f + AGAIN ? Infinity : f + AGAIN);
// ...and so a miss the player may yet follow up: it counts once the log's judged
export const open = (F, kind, f) => kind === "miss" && again(F, f) < FALL_FRAMES;

// ---- the CPUs ----
// 0x86501280, run for every CPU when a log is set up: the frame it will press
// on. By level, it lands on the target or up to 3-5 frames off, sometimes
// late; near the end it avoids ending on 0; above its level's cap it cuts late
// on purpose, so it doesn't run away with the round. brain: {L, Q (the random
// numbers), mood (0x90: 0-4, drawn once a round), streak (0x94: perfect cuts
// in a row), tick (0x8650C5F8: 0-20)}.
export function cpuPlan(F, c, log, logIndex, total, brain) {
  const { L, Q } = brain;
  const w0 = F.w0, T = log.T, size = F.size;
  const s2 = Math.floor(brain.mood / 3);
  const s3 = ((L() % 79) + brain.tick) % 10;
  let s1 = 1, plan = T;
  if (c === 1) {
    if (L() % 201 >= 31) s1 = -1;
    plan = s3 >= s2 + 6 ? T : s3 >= s2 + 4 ? T + s1 : s3 >= s2 + 2 ? T + 2 * s1 : T + 3 * s1;
    if (T < plan) plan = T - (s2 === 0 ? Q() % 2 : Q() % 3) - 1;
    if (plan < w0) plan = w0 + (Q() % 4);
    if (s3 >= 3) {
      if (plan < w0) plan = w0 + (L() % 3);
      if (T < plan) plan = T - (L() % 3) - 1;
    }
    if (plan === T && CAP[c] + 10 < total + 20) plan = T - (Q() % 2) - 1;
  } else if (c === 2) {
    if (L() % 201 >= 41) s1 = -1;
    plan = s3 >= s2 + 8 ? T : s3 > s2 + 6 ? T + s1 : s3 > s2 + 4 ? T + 2 * s1 : s3 > s2 + 2 ? T + 3 * s1 : T + 4 * s1;
    if (s3 >= 2) {
      if (T < plan) plan = T - (Q() % 4) - 1;
      if (plan < w0) plan = w0 + (Q() % 3) + 1;
    }
    if (plan < w0) plan = w0 + (Q() % 3) + 1;
    if (w0 + size < plan) plan = T + (Q() % 3) + 1;
    if (plan === T && CAP[c] + 10 < total + 20) plan = T - (Q() % 2) - 1;
  } else if (c === 3) {
    if (L() % 201 >= 41) s1 = -1;
    plan = !(s3 < s2 + 8) ? T + 1 : !(s3 < s2 + 6) ? T + s1 : !(s3 < s2 + 4) ? T + 2 * s1 : s2 < s3 ? T + 3 * s1 : T + 4 * s1;
    if (s3 >= 3) {
      if (w0 + size < plan) plan = T - (Q() % 2) - 1;
      if (plan < w0) plan = w0 + (Q() % 3) + 1;
    }
  } else {
    if (L() % 201 >= 111) s1 = -1;
    plan = s2 + 9 < s3 ? T + 1 : s2 + 7 < s3 ? T + s1 : s3 >= 6 ? T + 2 * s1 : s3 >= 4 ? T + 3 * s1 : s3 >= 3 ? T + 4 * s1 : T + 5 * s1;
  }
  // the last log: don't end the round at 0 (0x8650123C: what the cut would roughly come to)
  const outcome = (p) => (w0 < p && p < w0 + 10 ? T - p : -10);
  if (logIndex >= LOGS - 1 && outcome(plan) + total <= 0) {
    if (plan < w0) plan = T - (L() & 3) - 1;
    if (T < plan) plan = T - (L() & 3) - 1;
    if (outcome(plan) + total <= 0) {
      if (plan < w0) plan = w0 + 2;
      if (T < plan) plan = T - 2;
    }
  }
  if (CAP[c] < total) plan = T + 2 + (Q() % 6); // over its cap: late on purpose
  return plan;
}
