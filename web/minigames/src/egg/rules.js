// Egg Emergency's rules, as the game's code module (#56) has them
// (docs/minigames.md has where each number is). Everything counts in the
// game's frames: it runs its logic 30 times a second (0x8680729C; on a PAL
// console 25, with its speeds scaled by 1.4: the same thing in real time).
// Units are the game's: y up, Chansey's feet at -285, its unit U = 3.2 / 0.17.
//
// A round: 100 eggs (and the Voltorbs) come down in hand-made patterns, the
// same ones in the same columns for all four players. Each player's Chansey
// leans left or right while L or R is held, and catches what comes down its
// column; a Voltorb knocks up to 5 eggs out and stuns it. tools/egg_rules.py
// is the rooms server's copy of the deal and the judging: keep the two the
// same (the tests check them against each other). The CPUs (Brain) are only
// here: online, the device that plays them sends their leans.

export const FPS = 30;
const f32 = Math.fround;

// ---- the stage (0x86802740) ----
export const SCALE = f32(0.17); // Chansey's and the egg's (0x86807C50)
export const U = f32(f32(3.2) / SCALE); // the module's unit, 18.82 (0x8682F2FC)
export const FEET = -285; // Chansey's y (0x86807C4C)
export const CATCH = f32(U * 7 + FEET); // the catch line, -153.24 (0x8682F304)
export const CLOSE = 25; // a drop that's this far below it can't be caught any more (0x86807C78)
export const TOP = 550; // drops come in at this height (0x86804EE0)...
export const GONE = -470; // ...and go at this one (0x868048C8)
export const SPLASH_Y = -420, SPLASH_SCALE = 5; // a splash in the water (0x86807CB8, 0x86807CC0)
export const CHANSEY_X = [-24, -8, 8, 24].map((k) => f32(k * U)); // each player's (0x86802740)
export const SIDE_X = f32(5 * U); // a side column's offset (0x86804EE0)
export const DROP_Z = f32(U * 4.39); // the drops' z, in front of Chansey
export const EGGS = 100;
export const LOSS = 5; // the eggs a Voltorb knocks out, at most (0x8680422C)
export const SLOTS = 40; // drop slots per player (0x86804EE0)
export const VOLTORB_SCALE = 3.8; // its 24-square picture's (0x86804EE0)
// the round's start, in frames from GO: its song 31 frames on (0x86806E94),
// and the play on the frame after (its frame 1)
export const SONG_AT = 31, PLAY_AT = 32;
export const END_SOUND = 5, END_AT = 31; // frames once all is clear: 0xCF06, then the end (0x868058C0)
export const HURT = 20; // the hurt clip's frames: nothing's caught meanwhile
export const IMMUNE = 50; // and Voltorbs pass through for this long after one (0x86807CA4)

// ---- the levels ----
// the menu's COM level byte (Easy 1, Normal 2, Hard 3); the code works with
// c = 4 - level (0x86802740), the same for every CPU. With no CPUs it's 3 (as
// Easy) and the speed-up rule is on.
export const LEVELS = { easy: 1, normal: 2, hard: 3 };
export const levelCode = (level, cpus) => (cpus ? 4 - (LEVELS[level] || 2) : 3);
// by c (1 Hard, 2 Normal, 3 Easy, 4 unused): the fall's acceleration and the
// interval a gap unit stands for (0x86800B98), the Voltorb rows erased (in a
// hundred and one, 0x86807E18: c 4 reads on into the next table) and the CPUs'
// dodge (0x86807E28)
const ACCEL = [0, 17, 13, 10, 8];
const INTERVAL = [0, 4.5, 5.1, 5.4, 8].map(f32);
export const ERASE = [0, 0, 20, 60, 92];
export const DODGE = [92, 96, 80, 50, 0];
// by c and phase: the eggs left a phase starts at (0x86807F88), every how
// many patterns there's a break (0x86807FD0) and the patterns' tier (0x86807F10:
// 0-2 that tier, 3 0/1 by turns, 4 1/2 by turns, 5 0/1/2 by turns, 6 at random)
const THRESHOLD = [null, [100, 95, 85, 75, 65, 40], [100, 90, 80, 65, 50, 35], [100, 90, 80, 65, 50, 30], [100, 90, 75, 60, 45, 30]];
const BREAKS = [null, [1, 1, 2, 2, 3, 4], [1, 1, 2, 1, 2, 4], [1, 1, 2, 1, 2, 3], [1, 2, 1, 2, 2, 3]];
const TIERS = [null, [0, 1, 4, 2, 6, 2], [0, 1, 1, 2, 2, 6], [0, 1, 3, 2, 4, 5], [0, 0, 1, 3, 1, 3]];
export const BREAK = 50; // frames of a break (0x86807CA8)
// the CPUs: how sure their aim is, by c and phase (0x86807BDC), and the size of
// the window they look in after a catch (0x868014C0)
const ACCURACY = [null, [93, 90, 90, 85, 85, 75], [93, 90, 85, 80, 80, 80], [90, 90, 85, 70, 65, 60], [55, 45, 35, 25, 25, 20]];
const WINDOW = [null, 200, 150, 120, 80];

// The 62 patterns (0x86807A74 -> 0x86807518-0x86807A73), three digits a row:
// the column (0 centre, 1 and 2 the sides), 1 for a Voltorb, and the gap
// before the row in intervals (the first row's isn't used). 0-19, 20-39 and
// 40-59 are the three tiers; 60 and 61 (empty) only the debug order uses.
export const PATTERNS = ["000", "100", "100003", "000103", "100203001", "100003202", "000103202", "100201003", "100202103",
  "110", "010", "110002102", "110202102", "010102002", "100013203", "100203102202", "100202002215", "000202102211",
  "100001202111002", "000202103210203", "000013102203001", "210110002203102", "110202011213001", "110213101102001",
  "100202102201102", "100002202102001", "100002202102001", "100211001202111001102", "000012002012002",
  "110001102203011002", "100112000202002102010", "100013200202103010", "000001202111102101202",
  "000102010002012200002", "110201103211113201", "100101002111000202011200", "100002210102202001111",
  "200001001012002001102", "110102101211202201", "000201202002101102", "010200201102210111112000210",
  "100202110102012112210001", "110012102210012112210", "110011201212011101012211", "000201101011112211001101201",
  "100101001001201201001001101101", "100202102201101002201", "110101202102210202101002", "110200102010202102010",
  "100111201211101111201211101111", "100001201001101112011201", "100010201111011200212101010101101",
  "010001111101210201011001111101210201", "010112001211011201011111211", "000101001211001201001110001102",
  "100001001201201201001001001101", "110000210012200102210112000210002001",
  "010200011200101101010101010201011200011200101101", "100201101202101201002001", "010112210001012011112000210012",
  "000201011001101002201002", ""].map((s) => s.match(/.../g)?.map((r) => [+r[0], +r[1], +r[2]]) || []);

// The game's two random number generators: 0x800357EC, the linear
// congruential one (x * 1664525 + 1013904223), and 0x8007B100, a quadratic
// one ((4x + 2)(4x + 3) / 4). Seeded here from the round's seed: the game's
// run on through everything, so here each use has its own (the deal's, each
// CPU's), and the drawing's are Math.random.
export function lcg(seed) {
  let x = seed >>> 0;
  return () => (x = (Math.imul(x, 1664525) + 1013904223) >>> 0);
}
export function quad(seed) {
  let x = seed >>> 0;
  return () => (x = Math.imul(4 * x + 2, 4 * x + 3) >>> 2);
}
const DEAL_SEED = 0x2545f491, SETUP_SEED = 0x5bd1e995, CPU_SEED = 0x9e3779b9;

// ---- the fall (0x868044D4) ----
// A drop falls t += 0.2 a frame, y = 550 - t (a t), from the frame it comes in
// (its first step). FALLS[a][n]: its y after n steps (n >= 1), to the step
// that takes it below -470 (its last).
const T_STEP = f32(0.2);
const FALLS = {};
export function fall(a) {
  if (FALLS[a]) return FALLS[a];
  const ys = [TOP];
  for (let t = 0; ;) {
    t = f32(t + T_STEP);
    const y = f32(TOP - f32(t * f32(f32(a) * t)));
    ys.push(y);
    if (y <= GONE) break;
  }
  return (FALLS[a] = ys);
}
// the steps from 550 down to the catch line, for an egg's spin (0x86800508)
function turnFrames(a) {
  let t = 0;
  while (!(f32(TOP - f32(f32(f32(a) * t) * t)) <= CATCH)) t = f32(t + T_STEP);
  return Math.trunc(f32(t / T_STEP));
}

// ---- the deal (0x86800D5C, 0x8680537C, 0x86804EE0) ----
// The drops, frame by frame, the same for every player: each is a row of a
// pattern, in slot (its row's number) mod 40. A Voltorb row that's erased
// (0x868050D0) has a slot but nothing drops. step() runs one frame of the
// play; rows: every row so far {f (the frame it came in), slot, side (-1 left,
// 0 centre, 1 right), code (the game's column: 1 centre, 2 left, 3 right),
// kind ("e", "v", or null: erased), spin, a, n (its number among the drops,
// or -1)}; drops: the rows that drop.
// opts: allHuman (no CPUs: the speed-up rule), want(f, eggs) (the speed-up's
// check, 0x868053BC: every player has at least eggs), decide(f, fast) (a
// pattern end at frame f: whether the speed-up comes, given the check's),
// fixed (a short deal for the tests: [[frame, side, "e" or "v"], ...], a)
export class Deal {
  constructor(seed, c, opts = {}) {
    this.seed = seed;
    this.c = c;
    this.allHuman = !!opts.allHuman;
    this.want = opts.want || null;
    this.decide = opts.decide || null;
    const L = (this.L = lcg(seed)), Q = (this.Q = quad(seed ^ DEAL_SEED));
    void L;
    // the patterns' order (0x86800A7C): 0-19, then swaps of two of them. The
    // game swaps 50 times, plus one for each frame the instructions were up
    // (0x868063CC: 50-150 and round again), so here 50-150
    this.perm = [...Array(20).keys()];
    const swaps = 50 + (Q() % 101);
    for (let n = 0; n < swaps; n++) {
      const i = Q() % 20;
      let j;
      do j = Q() % 20; while (j === i);
      [this.perm[i], this.perm[j]] = [this.perm[j], this.perm[i]];
    }
    this.rates();
    this.turn = turnFrames(this.a); // (once, at the start: 0x86800508)
    this.T = 30 + 1800 - 1; // the clock, down a frame (0x86807C3C: the rate + 1800 - 1)...
    this.N = 1800; // ...and the next row's due when it's down to this (0x8682F2C8)
    this.left = EGGS; // eggs still to come (0x86807C48)
    this.dropped = 0;
    this.count = 1; // patterns so far (0x8682F2D8)
    this.k = 0; // the next of perm (0x8682F2D0)
    this.phase = 0;
    this.fast = false;
    this.mirror = false;
    this.pat = 0; // the first is always pattern 0, one egg in the centre
    this.row = 0;
    this.f = 0;
    this.rows = [];
    this.drops = [];
    this.phases = [0]; // by frame: the phase, the eggs left, c (the CPUs look at the last frame's)
    this.lefts = [EGGS];
    this.cs = [c];
    this.ups = []; // the pattern ends a speed-up came at
    this.ends = []; // and every pattern end
    if (opts.fixed) this.fixed(opts.fixed, opts.a ?? ACCEL[c]);
  }
  rates() { this.a = ACCEL[this.c]; this.interval = INTERVAL[this.c]; }
  // a deal of given rows instead: [frame, side, kind], at a
  fixed(list, a) {
    this.a = a;
    this.turn = turnFrames(a);
    this.list = list.slice().sort((x, y) => x[0] - y[0]);
    this.left = this.list.filter((r) => r[1] !== undefined && r[2] === "e").length;
  }
  get over() { return this.list ? !this.list.length : this.dropped >= EGGS; }

  step() {
    const f = ++this.f;
    this.T--;
    if (this.list) {
      while (this.list.length && this.list[0][0] <= f) {
        const [, side, kind] = this.list.shift();
        this.add(f, side === 0 ? 1 : side < 0 ? 2 : 3, kind, 0);
      }
    } else if (this.dropped < EGGS) this.schedule(f);
    this.phases[f] = this.phase;
    this.lefts[f] = this.left;
    this.cs[f] = this.c;
  }
  // 0x8680537C
  schedule(f) {
    if (this.allHuman && (this.left === 70 || this.left === 40) && this.want?.(f, (EGGS - this.left) * 0.8)) this.fast = true;
    if (this.k >= 19) this.k = 0;
    const thr = THRESHOLD[this.c];
    for (let i = 0; i < 6; i++) if (thr[i] >= this.left) this.phase = i;
    if (this.N < this.T) return;
    const rows = PATTERNS[this.pat];
    if (this.row >= rows.length) { // its end (3, 2, 6)
      this.ends.push(f);
      const up = this.decide ? this.decide(f, this.fast) : this.fast;
      this.fast = false;
      if (up) {
        this.c = Math.max(1, this.c - 1);
        this.rates();
        this.ups.push(f);
      }
      const c = this.c;
      this.count++;
      const b = BREAKS[c][this.phase];
      this.N -= b !== 4 && this.count % b === 0 ? BREAK : 2 * Math.trunc(this.interval);
      const base = this.perm[this.k], cnt = this.count;
      let tier;
      switch (TIERS[c][this.phase]) {
        case 0: tier = 0; break;
        case 1: tier = 1; break;
        case 2: tier = 2; break;
        case 3: tier = cnt & 1 ? 1 : 0; break;
        case 4: tier = cnt & 1 ? 2 : 1; break;
        case 5: tier = cnt % 3; break;
        default: { const r = this.Q() % 100; tier = r >= 67 ? 0 : r >= 34 ? 1 : 2; }
      }
      this.k++;
      this.mirror = this.L() % 101 >= 51; // 0x86805858
      this.pat = base + 20 * tier;
      this.row = 0;
      return;
    }
    // its rows (0x86804EE0), on while the next one's gap is 0 (that doesn't
    // look at the eggs dropped: a round can end on 101)
    for (;;) {
      const [code, kind] = rows[this.row];
      const r = this.L() % 101;
      const col = code === 0 ? 1 : (code === 1) !== this.mirror ? 2 : 3;
      if (kind === 1) this.add(f, col, ERASE[this.cs[0]] < r ? "v" : null, 0, r);
      else {
        this.left--;
        this.dropped++;
        this.add(f, col, "e", (r << 5) << 16 >> 16, r);
      }
      this.row++;
      const next = rows[this.row];
      if (!next) break; // (the end marker's gap, 6, isn't one)
      if (next[2] !== 0) { this.N = Math.trunc(f32(f32(this.N) - f32(f32(next[2]) * this.interval))); break; }
    }
  }
  add(f, code, kind, spin, r = 0) {
    const i = this.rows.length;
    const row = { i, f, slot: i % SLOTS, code, side: SIDE[code], kind, spin, a: this.a, r, n: kind ? this.drops.length : -1 };
    if (this.list && kind === "e") this.left--;
    row.ys = kind ? fall(row.a) : null;
    row.gone = kind ? f + row.ys.length - 2 : f; // the frame it goes at (0x868048C8)
    row.reach = kind ? f + row.ys.findIndex((y) => y <= CATCH) - 1 : f; // the frame it gets to the catch line
    this.rows.push(row);
    if (kind) this.drops.push(row);
  }
  // the last row in by frame g (-1: none)
  lastRow(g) {
    let lo = 0, hi = this.rows.length - 1, best = -1;
    while (lo <= hi) {
      const m = (lo + hi) >> 1;
      if (this.rows[m].f <= g) { best = m; lo = m + 1; } else hi = m - 1;
    }
    return best;
  }
  // slot j's row at frame g (null: none yet)
  slotRow(j, g, last = this.lastRow(g)) {
    if (last < 0) return null;
    const i = last - ((last - j) % SLOTS + SLOTS) % SLOTS;
    return i >= 0 ? this.rows[i] : null;
  }
  // the drops still about (in a slot) after frame g's fall: the CPUs' count (0x8682F2D4)
  inAir(g) {
    const last = this.lastRow(g);
    let n = 0;
    for (let j = 0; j < SLOTS; j++) { const row = this.slotRow(j, g, last); if (row?.kind && row.gone >= g) n++; }
    return n;
  }
  // everything's come down, and gone by frame g (0x868058C0)
  clear(g) { return this.left <= 0 && (!this.list || !this.list.length) && this.rows.every((r) => !r.kind || r.gone <= g); }
}
const SIDE = { 1: 0, 2: -1, 3: 1 };
export const CODE = { 0: 1, "-1": 2, 1: 3 }; // a side's column
// a row's y after frame g (its object's: an erased one sits at 550; 0 none yet)
export function rowY(row, g) {
  if (!row) return 0;
  if (!row.kind) return TOP;
  return row.ys[Math.min(row.ys.length - 1, Math.max(0, g - row.f + 1))];
}

// ---- Chansey (0x86801E8C) ----
// The clips: 0 waits (the instructions'), 1-3 idle in the centre, left and
// right, 4-9 lean from one to another (centre > right, right > centre, centre
// > left, left > centre, left > right, right > left), 10-12 catch in the
// centre, left and right, 13 hurt, 14 a winner's cheer, 15 a loser's.
export const CLIP = { wait: 0, idle: 1, hurt: 13, win: 14, lose: 15 };
export const CLIP_FRAMES = [24, 16, 16, 16, 8, 8, 8, 8, 8, 8, 10, 10, 10, 20, 72, 97];
// the lean (+0x1C): 1 right (R), 2 centre, 3 left (L), 0 none yet (a CPU's
// before it first picks); a column, by the lean
export const LEAN = { "-1": 3, 0: 2, 1: 1 }; // the remake's -1 / 0 / 1 (the wire's)
export const SIDE_OF_LEAN = { 1: 1, 2: 0, 3: -1 };
const COLUMN_OF_LEAN = { 1: 3, 2: 1, 3: 2 };
// a lean's clip from each clip it can leave (0x86801F54; the rest wait)
const TURN = {
  2: { 0: 1, 2: 7, 3: 5, 11: 1, 12: 1 },
  1: { 0: 3, 1: 4, 2: 8, 10: 3, 11: 3 },
  3: { 0: 2, 1: 6, 3: 9, 10: 2, 12: 2 },
};
// and when a clip ends (0x8003ED14): what comes after it
const AFTER = { 5: 1, 7: 1, 10: 1, 4: 3, 8: 3, 12: 3, 6: 2, 9: 2, 11: 2 };
const SPEED = (clip) => (clip >= 4 && clip < 10 ? 4 : clip >= 10 && clip < 13 ? 2 : 1); // (0x868026E4)
const ONE = 0x10000;

// One player's Chansey and drops, frame by frame: what the game does for it
// in its callback (the lean, its clips, the CPU's think) and in the play's
// frame (the fall and the catches, 0x868044D4; the drops gone, 0x868048C8).
// ev(name, ...) hears what happens: "called" (the callback's done: the lean's
// set for the frame, before any catch), "catch" (row), "hit" (row, eggs lost),
// "pass" (row: a Voltorb that hits it while it's immune), "miss" (row: it can't
// be caught any more), "splash" (row: one not caught goes in the water).
export class Seat {
  constructor(z, ev = () => {}) {
    this.z = z;
    this.ev = ev;
    this.eggs = 0;
    this.lean = 0; // (0x86800D5C: none yet)
    this.state = CLIP.idle; // the clip it's in by the game's count (+0x10)...
    this.clip = CLIP.idle; // ...and the one playing (they can differ: 0x868040EC)
    this.frame = -ONE; // 16.16, the clip's frame
    this.speed = ONE;
    this.immune = 0; // (+0x30)
    this.judged = new Map(); // row (its number in the deal) -> 1 (judged) or -1 (closed)
    this.caught = new Set(); // rows caught or hit (no splash)
    this.lost = 0; // eggs knocked out at the last hit
    this.f = 0; // the last frame run
    this.brain = null;
  }
  // the clip playing: from its start unless it's the one on (0x8003F2F0)
  play(clip) {
    if (clip !== this.clip) { this.clip = clip; this.frame = -ONE; }
    this.speed = ONE;
  }
  ended() { return this.frame >= (CLIP_FRAMES[this.clip] - 1) * ONE; }
  // the clip's clock, once a frame as it's drawn (0x8003E7BC): lean and catch
  // clips hold at their end, the rest go round
  advance() {
    this.frame += this.speed;
    const n = CLIP_FRAMES[this.clip];
    if (this.frame >= n * ONE) this.frame = this.clip >= 4 && this.clip <= 13 ? (n - 1) * ONE : this.frame - n * ONE;
  }
  // frame g of the play, with deal (stepped to g); input: the lean held, as the
  // game's code takes it (1 right, 2 centre, 3 left), or (a CPU's, played
  // elsewhere) its lean then
  step(g, deal, input) {
    this.f = g;
    // ---- the callback ----
    if (this.immune > 0) this.immune++;
    if (this.immune > IMMUNE) this.immune = 0;
    if (this.brain) this.brain.think(this, g, deal);
    if (this.state <= 12) {
      if (!this.brain && input) this.lean = input;
      const to = TURN[this.lean]?.[this.state];
      if (to !== undefined) { this.state = to; this.play(to); }
    }
    this.hurt = this.state === CLIP.hurt; // (its red, 0x86802610, and sparks)
    if (this.ended()) {
      if (this.state === CLIP.hurt) { this.lean = 2; this.state = CLIP.idle; this.play(CLIP.idle); }
      else if (AFTER[this.state]) { this.state = AFTER[this.state]; this.play(this.state); }
    }
    this.speed = SPEED(this.state) * ONE;
    this.called = this.lean; // (the lean as the callback leaves it: what a CPU's device sends)
    this.ev("called");
    this.advance();
    // ---- the fall and the catches ----
    const last = deal.lastRow(g);
    for (let j = 0; j < SLOTS; j++) {
      const row = deal.slotRow(j, g, last);
      if (!row?.kind || row.gone < g) continue;
      const y = rowY(row, g);
      if (!(y <= CATCH) || this.state === CLIP.hurt) continue; // (in the hurt, not even closed: it may yet be caught after)
      let judged = this.judged.get(row.i) || 0;
      if (judged === 0 && (row.code === this.state || this.leanMatch(row))) {
        judged = 1;
        if (row.kind === "v") {
          if (this.immune === 0) {
            this.caught.add(row.i);
            this.immune = 1;
            this.state = CLIP.hurt;
            this.lean = 1;
            this.clip = -1; // (from its frame 0: 0x8003EC64)
            this.play(CLIP.hurt);
            this.lost = Math.min(this.eggs, LOSS);
            this.eggs -= this.lost; // (0x8680422C)
            this.ev("hit", row, this.lost);
          } else this.ev("pass", row);
        } else {
          this.caught.add(row.i);
          this.state += 9;
          this.play(this.state);
          this.eggs++;
          this.ev("catch", row);
        }
      }
      // once it's 25 under the line it's closed; till then (the frame after it
      // crossed, if it crossed by less) it may still be caught
      if (y <= f32(CATCH - CLOSE)) {
        if (judged === 0) this.ev("miss", row);
        judged = -1;
      }
      if (judged) this.judged.set(row.i, judged);
    }
    // ---- the drops gone (in the water, if not caught) ----
    for (let j = 0; j < SLOTS; j++) {
      const row = deal.slotRow(j, g, last);
      if (!row?.kind || row.gone !== g) continue;
      if (!this.judged.get(row.i)) { this.judged.set(row.i, -1); this.ev("miss", row); } // (never closed: it went by in a hurt)
      if (!this.caught.has(row.i)) this.ev("splash", row);
    }
  }
  // the lean's column is the drop's (0x868040EC): the idle clip there
  leanMatch(row) {
    if (COLUMN_OF_LEAN[this.lean] !== row.code) return false;
    this.state = row.code;
    return true;
  }
}

// ---- the CPUs (0x868014C0, 0x86800594) ----
// Each picks its personality at the start: F4, how far below the catch line its
// target must be before it looks for the next (x 25), and F8, how near a
// Voltorb over an egg puts it off (x 200). One CPU, the "special" (the highest
// rand2 % 100 at the set-up, 0x86802740), on Hard looks on at once (F4 0.01).
// It looks at what's within its window over the catch line (20 at the start),
// takes the lowest drop as its target and leans for it: for an egg, unless a
// Voltorb's just over it in its column (then it stays put); for a Voltorb it
// dodges with chance DODGE in 101 (the way the row's other drops say), else
// it goes under it. It then misses its column by one with a chance set by its
// level and the phase. Once the target's gone by, its window is WINDOW less
// (rand % 21 x the drops about) / 4.
export class Brain {
  constructor(z, c, seed, special) {
    this.z = z;
    this.c = c;
    this.L = lcg(seed ^ Math.imul(CPU_SEED, z + 1));
    const L = this.L, rand = () => f32(f32(L()) / 4294967296);
    // (+0x100, never used, takes its numbers too)
    if (c === 1) {
      rand();
      this.F4 = f32(f32(rand() * f32(0.2)) + 0.2);
      if (special) this.F4 = f32(0.01);
      this.F8 = f32(f32(rand() * f32(0.3)) + 0.3);
    } else if (c === 2) {
      rand();
      this.F4 = f32(f32(rand() * f32(0.5)) + 0.5);
      this.F8 = f32(f32(rand() * f32(0.5)) + 0.5);
    } else if (c === 3) {
      rand();
      this.F4 = f32(rand() + 1);
      this.F8 = f32(rand() + 1);
    } else {
      rand();
      this.F4 = f32(f32(rand() * f32(1.5)) + 1.5);
      this.F8 = f32(f32(rand() * f32(1.5)) + 1.5);
    }
    this.F0 = 20;
    this.target = -1; // a slot
  }
  // in the callback of frame g: what it sees is how things were after frame g - 1
  think(seat, g, deal) {
    const L = this.L, was = g - 1, last = deal.lastRow(was);
    const row = (j) => (j >= 0 ? deal.slotRow(j, was, last) : null);
    const y = (j) => rowY(row(j), was);
    const kind = (j) => { const r = row(j); return r?.kind && r.gone > was ? (r.kind === "e" ? 0 : 1) : -1; };
    const col = (j) => row(j)?.code ?? 0;
    if (this.target !== -1) {
      if (y(this.target) < f32(CATCH - f32(this.F4 * CLOSE))) {
        const v = (WINDOW[this.c] - (Math.imul(L() % 21, deal.inAir(was)) >>> (this.c === 4 ? 1 : 2))) | 0;
        this.F0 = v < 0 ? f32(f32(v) + 4294967296) : v;
        L(); // (+0xFC, never used)
        this.target = -1;
      }
      return;
    }
    let top = f32(this.F0 + CATCH), best = -1, egg = -1, volt = -1;
    for (let j = 0; j < SLOTS; j++) {
      const yj = y(j), k = kind(j);
      if (yj <= top && f32(CATCH - CLOSE * 5) < yj && k !== -1) {
        top = yj;
        if (k === 0) egg = j; else volt = j;
        best = j;
      }
    }
    if (best === -1) return;
    this.target = best;
    let to = col(best), avoid = 0;
    if (best === egg) {
      // a Voltorb over it in its column, near enough: it stays where it is
      if (volt !== -1 && y(volt) < f32(y(egg) + f32(this.F8 * 200)) && col(egg) === col(volt)) return;
    } else if (L() % 101 < DODGE[deal.cs[0]]) {
      avoid = to;
      to = to - 1 <= 0 ? 2 : to - 1;
      for (let j = 0; j < SLOTS; j++) {
        if (y(j) !== top) continue; // (the row's: the same height)
        if (kind(j) === 1) { if (j !== best) to = 6 - col(j) - col(best); } else to = col(j);
      }
    }
    // its aim (0x86801D60)
    const r1 = L() % 101, r2 = L() % 11;
    if (r2 + ACCURACY[deal.cs[was] ?? deal.c][deal.phases[was] ?? 0] < r1 && avoid === 0) {
      to = to + 1 >= 4 ? 1 : to + 1;
      // (sic: volt != 0; with none it reads the previous player's slot 39, or for 1P a number that's never a column)
      if (volt !== 0) {
        const v = volt >= 0 ? col(volt) : this.z > 0 ? col(SLOTS - 1) : 144;
        if (to === v) to++;
      }
      if (to >= 4) to = 1;
    }
    seat.lean = { 1: 2, 2: 3, 3: 1 }[to];
  }
}
// the special CPU (0x86802740): the highest rand2 % 100 of the CPUs, the first if two are level
export function specialCpu(seed, cpus) {
  const Q = quad(seed ^ SETUP_SEED);
  let best = -1, at = -1;
  cpus.forEach((cpu, z) => { if (cpu) { const r = Q() % 100; if (r > best) { best = r; at = z; } } });
  return at;
}

// ---- the eggs knocked out (0x8680422C, 0x86801160) ----
// n eggs (at most 5) fly out from Chansey's feet, fanned out towards the
// camera: egg i at (180 / (n + 1)) (i + 1) degrees, up 490 and down again.
// Each frame t += 0.5. In the play they're see-through (alpha 100) and go
// without a splash below -470; a winner's (the cheer) are solid, 60 higher,
// and splash below -455.
export function lostAngle(n, i) { return f32(f32((180 / (n + 1)) * (i + 1)) / 360 * f32(6.28)); }
export function lostStep(e, cheer) {
  e.t = f32(e.t + 0.5);
  e.x = f32(e.x + (Math.cos(e.angle) * e.t) / 3);
  e.z = f32(e.z + Math.sin(e.angle) * e.t * 0.5);
  e.y = f32(FEET + (cheer ? 60 : 0) + 4.9 * 10 * 10 - 4.9 * (e.t - 10) * (e.t - 10));
}
