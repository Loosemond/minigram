// Streaming Stampede's rules, as the game's code module (#59) has them
// (docs/minigames.md has where each number is). Everything counts in the
// game's frames, 30 a second. Units are the game's: x across the stage
// (the Pokemon come on at the right and go off at the left), z towards the
// camera, y up.
//
// Five questions. Each one is a stream of Pokemon going by (or popping up out
// of the ground) and something to count in it: one kind, or two or three
// look-alikes, or (the last question) all of them. A press counts one, up to
// 99, while the stream goes by and for 60 frames after the last one's gone.
// Points by how far off the count is:
//   questions 1 and 2   exact 10, off by 1  5, off by 2  1
//   questions 3 and 4   exact 20, off by 1 10, off by 2  5
//   the last question   exact 40, off by 1 20, off by 2 10
// and a count of 0 scores nothing. Tools/stampede_rules.py is the rooms
// server's copy of the questions, the CPUs and the scoring: keep the two the same.
//
// It gets harder as it goes: the more players are perfect after a question,
// the more Pokemon the next ones have, so a question is made when it comes
// up, from the totals so far (setup() and after()).
//
// Online with the CPUs off, the seats no one plays are empty: no one in the
// booth, so no count, no points and no place (game.js leaves them out); the
// "enough of the players perfect" checks look only at the players there
// (after()).

export const FPS = 30;
export const QUESTIONS = 5;
export const MAX_COUNT = 99;
// The game's opening camera move (state 4, 0x86905630) runs over the countdown:
// 136 frames from its start, GO coming on its frame 99 (module #64's 100th, a
// step of 25), so the first card comes 37 frames after GO
export const OPENING = 37;
export const CARD = 85; // a question's card (frames), before the counting (state 5)
export const TAIL = 60; // the counting goes on this long after the last one's gone...
export const STOP = 50; // ..."Stop!" (0x3F08) this far in (the frame it goes is the tail's 0th)
export const JUDGED = 90; // the points are given this far into the answer (state 7)
// the last answer: 30 frames of state 7, then state 8 (0x86909FAC): the columns
// go up to the totals so far (120 frames), the counts and the answer show, and
// at its 210 the points go in
export const LAST_STATE8 = 30;
export const LAST_JUDGED = LAST_STATE8 + 210;
export const POINTS = [[10, 5, 1], [10, 5, 1], [20, 10, 5], [20, 10, 5], [40, 20, 10]];
export const OFF_LEFT = -250; // a Pokemon (or its shadow) is gone once it's left of this...
export const ON_SCREEN = 135; // ...and on screen once it's left of this (0x8690AC48)
export const POP_GONE = 26; // a pop-up's gone this many frames after its t2 (its age, from -25 - t2, past 0)

// How long an answer is, by the most points anyone got in it (pts: each
// seat's). The points go in one every other frame from its 90th (210th of
// state 8 in the last), and once they're all in (0x869099C8) the game skips
// on: a question's answer (state 7) to its frame 129 if it's 96 or more, then
// 61 more to the next card (191 in all when someone got 20); the last (state
// 8) to its frame 289 (0x8690A5AC), the winners on the frame after (0x8690B89C).
export function answerFrames(q, pts) {
  const P = Math.max(0, ...pts);
  return q === QUESTIONS - 1 ? LAST_STATE8 + 210 + 2 * Math.max(P - 1, 0) + 2 : Math.max(96, 88 + 2 * P) + 63;
}

// The 17 kinds that go by (0x8690E438: image bank, frame list; 0x8690E558:
// scale, picture size, speed a + 0..b a frame, z from z0 over zr, x from x0
// over xr; 0x8690E7BC: its shadow's scale, how far left of it the shadow is
// and how far down its feet are). Diglett and Dugtrio don't move: they pop up
// out of the ground where they are.
export const KINDS = [
  ["Pikachu", 218, 1, 64, 64, 9, 5, 217, 280, 300, 800, 1.6, 12, 27],
  ["Pichu", 217, 1, 52, 52, 6, 3, 237, 283, 300, 640, 1, 0, 23],
  ["Psyduck", 210, 1, 64, 64, 7, 5, 232, 271, 300, 1040, 2, -4, 22],
  ["Diglett", 205, 1, 36, 36, 0, 0, 278, 255, -103, 207, 0, 0, 7],
  ["Dugtrio", 208, 0.75, 64, 64, 0, 0, 289, 214, -97, 195, 0, 0, 16],
  ["Voltorb", 202, 0.8, 36, 36, 8, 5, 308, 256, 300, 960, 1.6, 0, 11.2],
  ["Electrode", 211, 0.7, 64, 64, 10, 5, 265, 255, 300, 1200, 2.1, 0, 16.8],
  ["Poké Ball", 212, 0.9, 32, 32, 8, 5, 275, 265, 300, 880, 1.35, 0, 10.8],
  ["Doduo", 206, 1, 64, 64, 8, 4, 229, 279, 300, 1120, 1.6, -6, 24],
  ["Dodrio", 207, 1.1, 80, 80, 12, 4, 205, 264, 300, 1360, 2.2, -6, 38.5],
  ["Slugma", 213, 1, 56, 56, 4, 3, 280, 240, 300, 720, 0, 0, 15],
  ["Magcargo", 203, 1, 64, 48, 4, 3, 272, 252, 300, 720, 0, 0, 15],
  ["Omanyte", 216, 1, 40, 40, 4, 3, 276, 252, 300, 720, 2, 0, 12],
  ["Togepi", 220, 1, 48, 48, 7, 5, 241, 274, 300, 800, 1.5, 0, 20],
  ["Togepi egg", 209, 0.75, 48, 40, 7, 5, 273, 267, 300, 800, 1.3125, 0, 13.5],
  ["Magnemite", 204, 0.8, 64, 40, 5, 5, 176, 311, 300, 720, 1.6, 0, 37.6],
  ["Magneton", 219, 1, 92, 72, 8, 5, 134, 295, 300, 1280, 3.2, 0, 50],
].map(([name, bank, scale, w, h, a, b, z0, zr, x0, xr, shadow, dx, depth], i) => ({
  i, name, bank, scale, w, h, a, b, z0, zr, x0, xr, shadow, dx, depth,
  frames: i === 11 ? [0, 1, 2, 3, 2, 3] : [5, 6, 7, 15, 16].includes(i) ? [0, 1, 2, 3] : [0, 1, 2, 3, 4, 5],
  pops: i === 3 || i === 4,
  spins: [5, 6, 7, 15, 16].includes(i), // (they roll the other way when t2 is odd)
}));
// what the question board shows for a kind: its icon (the icons archive, by
// national dex number) and its name (image bank 413); the Poke Ball and the
// egg are never counted
export const DEX = [25, 172, 54, 50, 51, 100, 101, null, 84, 85, 218, 219, 138, 175, null, 81, 82];
export const NAME = [15, 14, 7, 3, 6, 1, 10, null, 5, 4, 9, 8, 13, 17, null, 2, 16];
// Diglett's and Dugtrio's pop (0x8690E264, 0x8690E2DC): up in 12 frames, down in 12
export const POP = [0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 5, 5, 4, 4, 3, 3, 2, 2, 1, 1, 0, 0];

// Families of look-alikes (a flag each at 0x8691A79C): a question asks about
// one family at most once a game, and some only from a level up
const FAMILY = [0, 0, 0, 1, 1, 2, 2, 2, 3, 3, 4, 4, 4, 5, 5, 6, 6];
const FAMILY_LEVEL = [0, 0, 2, 1, 0, 2, 3];
const Q1_KINDS = [0, 1, 2, 10, 11, 12, 13, 15]; // 0x8690E8CC
const Q2_KINDS = [0, 1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13, 15, 16]; // 0x8690E8EC (and the last question's, 0x8690E954)
const Q3_FAMILIES = [0, 3, 5, 8, 10, 13, 15]; // 0x8690E928: each family's first kind
const Q4_FAMILIES = [0, 3, 5, 8]; // 0x8690E944
const FAMILY_SPREAD = { 0: 1040, 5: 1200, 8: 1360, 10: 720, 13: 800, 15: 1280 }; // 0x8690F31C
// "special" 3rd and 4th questions: unrelated kinds, each asked once a game
const Q3_SPECIAL = [[1, 13], [5, 16], [0, 12]];
const Q4_SPECIAL = [[0, 6, 9], [2, 11, 15], [13, 8, 10]];
const Q3_SPECIAL_SPREAD = [800, 1280, 800];
const Q4_SPECIAL_SPREAD = [1360, 1040, 1120];
// by level (0x86902454, 0x86902684): the chance a 3rd or 4th question is
// special (%), the number of Pokemon, and how spread out and fast they are
const SPECIAL = [70, 50, 30, 10];
const HOW_MANY = [0.6, 0.8, 1, 1];
const SPREAD = [0.7, 0.85, 1, 1.2];
const APART = [169, 169, 169, 100, 49]; // 0x8690EB28: how far apart in depth (squared), by question
// what a code counts (0x86904D48): the roles in the stream it adds up
const COUNTS = [[0], [1], [0, 1], [2], [0, 2], [1, 2], [0, 1, 2]];
const Q4_CODES = [0, 1, 3, 6];

// the CPUs' answers (0x8690C20C): the right one plus an error, drawn from
// rand % 200 against these (0x8690ECD8), by COM level and question; a CPU
// that's been perfect for four questions uses the last row on the fifth
const ERRORS = [0, -1, 1, -2, 2, -3, 3];
const CPU_ODDS = [
  [[60, 90, 120, 140, 160, 180, 200], [20, 40, 60, 80, 100, 150, 200], [10, 20, 30, 45, 60, 130, 200], [0, 30, 30, 60, 60, 200, 200]],
  [[120, 150, 180, 185, 190, 195, 200], [40, 70, 100, 130, 160, 180, 200], [20, 40, 60, 90, 120, 160, 200], [0, 60, 60, 120, 120, 200, 200]],
  [[160, 175, 190, 194, 198, 199, 200], [80, 110, 140, 160, 180, 190, 200], [40, 70, 100, 130, 160, 180, 200], [0, 100, 100, 160, 160, 200, 200]],
  [[190, 192, 194, 196, 198, 199, 200], [120, 145, 170, 180, 190, 195, 200], [60, 90, 120, 150, 180, 190, 200], [0, 100, 100, 160, 160, 200, 200]],
];
// how often a CPU presses as the Pokemon go (0x8690B984): more than this many
// frames apart, by level (NTSC's, 0x8690BB38: PAL's are 25, 21, 18, 14)...
const CPU_GAP = [21, 18, 15, 12];
// ...and then a chance of 1 in D a frame, D by its answer
const cpuOdds = (answer) => (answer < 5 ? 20 : answer < 15 ? 10 : answer < 25 ? 5 : 3);

// the levels as the game's COM level byte (the menu: Easy 1, Normal 2, Hard 3)
export const LEVELS = { easy: 1, normal: 2, hard: 3 };

// The game's random numbers, 0x8007B100: x = ((4x + 2)(4x + 3) mod 2^32) / 4.
export function quad(seed) {
  let x = seed >>> 0;
  return () => (x = Math.imul(4 * x + 2, 4 * x + 3) >>> 2);
}

// A game's running state: what the questions so far have used, and the
// level and extra Pokemon the totals so far have earned. level: the COM
// level (1-3; with four people and no CPUs, 1).
export function setup(level) {
  return { level, bonus: 0, families: 0, specials: 0 };
}

// After question q, with every player's total (and whether all four are
// people): more Pokemon to come if enough are perfect so far (0x86909C14),
// and with four people all perfect after the 1st or 3rd, a level up. empty:
// the seats no one's in (online, with the CPUs off): they aren't players, so
// the totals are those there's, and enough is at most all of them (3 of 4
// perfect with only 2 there: both), as is the level up's "all four"
export function after(state, q, totals, allPeople, empty) {
  const perfect = [10, 20, 40, 60][q], there = totals.filter((t, z) => !empty?.[z]);
  if (perfect === undefined) return state;
  const need = Math.min([3, 3, 2, 1][q], there.length), n = there.filter((t) => t === perfect).length;
  const s = { ...state };
  if (n >= need) s.bonus += 2;
  if (n === there.length && allPeople && (q === 0 || q === 2)) s.level = Math.min(3, s.level + 1);
  return s;
}

// Question q (0-4) of a game with this seed: the stream and its answer.
// state: setup()/after()'s; cpuTotals: each seat's total before it (for the
// CPUs' answers); comLevel: the COM level byte (0 with no CPUs). Returns
// { q, special, k, code, what (the kinds counted), stream: [{kind, role, x,
// z, t2, speed, gone (counting frame it's gone on)}], answer, last (the
// counting frame the last one, or its shadow, is gone on), frames (the
// counting's length), cpu: [each seat's answer if it were a CPU], state (for
// the next question) }.
export function question(seed, q, state, cpuTotals = [0, 0, 0, 0], comLevel = state.level) {
  const r = quad(seed ^ [0x2545f491, 0x6d2b79f5, 0x1b873593, 0x3c6ef372, 0x7f4a7c15][q]);
  const lv = state.level;
  let { families, specials } = state;
  // the question (0x86902640): a kind or a family not asked yet, or a special one
  let special = false, k = 0;
  for (let tries = 0; ; tries++) {
    special = (q === 2 || q === 3) && (r() % 100 < SPECIAL[lv] || tries > 1000);
    if (special) {
      k = r() % 3;
      const bit = 1 << (q === 2 ? k : 3 + k);
      if (specials & bit) continue;
      specials |= bit;
      break;
    }
    if (q === 4) { k = r() % 15; break; }
    k = q === 0 ? r() & 7 : q === 1 ? r() % 15 : q === 2 ? r() % 7 : r() & 3;
    const first = [Q1_KINDS, Q2_KINDS, Q3_FAMILIES, Q4_FAMILIES][q][k], f = FAMILY[first];
    if (lv < FAMILY_LEVEL[f] || families & (1 << f)) continue;
    families |= 1 << f;
    break;
  }
  const members = special ? (q === 2 ? Q3_SPECIAL : Q4_SPECIAL)[k]
    : q === 0 ? [Q1_KINDS[k]] : q === 1 ? [Q2_KINDS[k]] : q === 2 ? [Q3_FAMILIES[k], Q3_FAMILIES[k] + 1]
    : q === 3 ? [0, 1, 2].map((d) => Q4_FAMILIES[k] + d).filter((x) => FAMILY[x] === FAMILY[Q4_FAMILIES[k]]) : null;
  let made;
  while (!(made = stream(r, q, special, k, members, state))); // (a stream that doesn't work is made again)
  const { recs, code, answer } = made;
  // how fast each one goes (0x8690AD3C)
  for (const o of recs) {
    const K = KINDS[o.kind];
    const v = (r() % (K.b + 1)) + K.a;
    o.speed = K.pops ? 0 : Math.max(4, Math.trunc(v * SPREAD[lv]));
    o.gone = K.pops ? POP_GONE + o.t2 : Math.floor((o.x - OFF_LEFT) / o.speed); // (the counting frame it goes on: 0x8690ABCC)
  }
  // (each is two objects, its shadow and itself: the counting goes on till both have gone)
  const last = Math.max(...objects(recs).map((o) => o.gone));
  // the CPUs' answers (0x8690C20C)
  const cpu = cpuTotals.map((total) => {
    const row = q === 4 && total === 60 ? 3 : [0, 0, 1, 1, 2][q];
    const v = r() % 200, i = CPU_ODDS[comLevel][row].findIndex((t) => v < t);
    return Math.max(1, answer + ERRORS[i]);
  });
  const what = q === 4 ? null : COUNTS[code].map((ro) => members[ro]);
  return { q, special, k, code, what, members, stream: recs, answer, last, frames: last + 1 + TAIL, cpu,
           seed, state: { ...state, families, specials } };
}

// The stream (0x869033C8-0x869049E0): how many, each one's kind, where it
// starts (spread out so they don't overlap), and what's counted. null: it
// didn't work (too crowded, or nothing to count): make it again.
function stream(r, q, special, k, members, state) {
  const lv = state.level, f = SPREAD[lv], b = state.bonus;
  const n0 = r();
  const n = Math.trunc([n0 % 6 + 5, n0 % 11 + b + 5, n0 % 11 + b + 10, (n0 & 15) + b + 10, n0 % 11 + b + 20][q] * HOW_MANY[lv]);
  const recs = [];
  let misses = 0;
  for (let i = 0; i < n; i++) {
    let role = 0;
    if (q === 2) role = (r() % 97) % 2;
    else if (q === 3) role = (r() % 97) % (special || members.length === 3 ? 3 : 2);
    const kind = q === 4 ? Q2_KINDS[(r() % 97) % 15] : members[role];
    const K = KINDS[kind];
    const spread = special ? (q === 2 ? Q3_SPECIAL_SPREAD : Q4_SPECIAL_SPREAD)[k]
      : q < 2 ? K.xr : q === 4 ? 1440 : FAMILY_SPREAD[members[0]];
    for (;;) {
      if (misses >= 201) return null;
      let t2 = r() % 197, x;
      if (K.pops) {
        x = (r() % K.xr) + K.x0;
        if (q === 4) t2 = r() % 12;
      } else x = (r() % spread) * f + 300;
      const z = (r() % K.zr) + K.z0;
      // not too close to the ones before it (its shadow's spot, 0x86903B74)
      const ax = Math.trunc(Math.trunc(x) + K.dx), az = Math.trunc(Math.trunc(z) + K.depth * 3);
      const clash = recs.some((o) => {
        const O = KINDS[o.kind];
        const dx = ax - Math.trunc(Math.trunc(o.x) + O.dx), dz = az - Math.trunc(Math.trunc(o.z) + O.depth * 3);
        if (K.pops) return (t2 - o.t2) ** 2 < 576 && dx * dx + dz * dz < 0x2000;
        return dx * dx + dz * dz < 0x400 || (dz * dz < APART[q] && dx * dx < 0x64000);
      });
      if (!clash) { recs.push({ kind, role, x, z, t2 }); break; }
      misses++;
    }
  }
  // what's counted (0x869049E4) and the answer (0x86904D48)
  let code = 0;
  if (special) code = q === 2 ? (r() % 97) % 3 : Q4_CODES[(r() % 97) % 4];
  else if (q === 2) code = members[0] === 13 ? 0 : (r() % 97) % 3;
  else if (q === 3) code = members[0] === 0 ? Q4_CODES[(r() % 97) % 4] : (r() % 97) % 3;
  const roles = q === 4 || q < 2 ? null : COUNTS[code];
  let answer;
  if (!roles) answer = recs.length;
  else {
    const each = roles.map((ro) => recs.filter((o) => o.role === ro).length);
    answer = each.length > 1 && each.includes(0) ? 0 : each.reduce((a, c) => a + c, 0);
  }
  return answer ? { recs, code, answer } : null;
}

// a count's points (0x869053B4)
export function points(q, count, answer) {
  if (!count) return 0;
  const d = Math.abs(count - answer);
  return d < 3 ? POINTS[q][d] : 0;
}

// The objects a question's stream is (0x8690AD3C): each Pokemon's shadow (x -
// dx, its own speed) and itself, each with the counting frame it's gone on
// and (moving ones) the one it's first on screen after (x < 135, 0x8690AC48)
export function objects(stream) {
  const out = [];
  for (const o of stream) {
    const K = KINDS[o.kind];
    for (const x of [o.x - K.dx, o.x]) {
      if (K.pops) out.push({ pop: true, gone: o.gone });
      else out.push({ pop: false, gone: Math.floor((x - OFF_LEFT) / o.speed), on: Math.floor((x - ON_SCREEN) / o.speed) });
    }
  }
  return out;
}

// The CPUs' presses as the stream goes by (0x8690B984): for each seat, the
// counting frames it presses on, to its answer. Each frame it goes by what the
// frame before left (it runs before the stream moves): nothing till an object
// has come on screen (G+0x80: one left of x 135 after its move, or a pop-up
// gone); while some are left, one when more than gap frames have passed since
// its last and rand % D is 0 (once all those left are on screen, G+0x84, when
// 4 have); once none are left, one at once if it's at 0, and one when 4 have
// passed and rand % D < 2; never past its answer. since: the frames since its last press
// as the counting starts (G+0..0xC: 3 as a game starts, then on from question
// to question: sinceAfter). level: the COM level (the game's G+0x78).
export function cpuPresses(Q, level, seat, since = 3) {
  const r = quad(Q.seed ^ 0x51ed270b ^ (Q.q << 8) ^ (seat << 16));
  const answer = Q.cpu[seat], D = cpuOdds(answer), gap = CPU_GAP[level];
  const objs = objects(Q.stream), moving = objs.filter((o) => !o.pop), pops = objs.filter((o) => o.pop);
  const most = (list, k) => list.reduce((m, o) => Math.max(m, o[k]), -Infinity);
  // the first frame it goes by something on screen; the first that all left are
  // (no pop-up left, nor one gone the frame before: they count as gone, not as
  // on screen); and the first with none left
  const from = Math.min(...moving.map((o) => o.on), ...pops.map((o) => o.gone)) + 1;
  const allOn = Math.max(most(moving, "on") + 1, most(pops, "gone") + 2);
  const none = Math.max(...objs.map((o) => o.gone)) + 1;
  const presses = [];
  let count = 0;
  for (let f = 0; f < Q.frames; f++) {
    let press = false;
    if (f >= from) {
      if (f < none) {
        if (f < allOn) press = count !== answer && since > gap && r() % D === 0;
        else press = count !== answer && since >= 4 && r() % D === 0;
      } else {
        if (count === 0) press = true;
        if (count !== answer && since >= 4 && r() % D < 2) press = true;
      }
    }
    since++;
    if (press && count < MAX_COUNT) { presses.push(f); count++; since = 0; }
  }
  return presses;
}
// a CPU's frames since its last press once a question's counting is over
export const sinceAfter = (Q, presses, since) => (presses.length ? Q.frames - 1 - presses[presses.length - 1] : since + Q.frames);

// how long after an answer's judged each seat reacts (0x8691AD80: rand % 6 frames)
export const reactDelay = (seed, q, z) => quad(seed ^ 0x2c1b3c6d ^ (q << 4) ^ (z << 12))() % 6;

// A game's timeline (frames from GO), as the questions come: question q's
// card starts at at[q], its counting at at[q] + CARD and its answer at
// at[q] + CARD + frames; it ends by its points (pts[q]: each seat's).
export function times(questions, pts) {
  const at = [];
  let t = OPENING;
  for (const Q of questions) {
    const start = t, count = start + CARD, answer = count + Q.frames;
    at.push({ start, count, answer, judged: answer + (Q.q === QUESTIONS - 1 ? LAST_JUDGED : JUDGED),
              end: answer + answerFrames(Q.q, pts[Q.q] || []) });
    t = at[at.length - 1].end;
  }
  return at;
}
