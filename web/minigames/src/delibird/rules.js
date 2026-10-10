// Delibird's Delivery's rules, as the game's code module (#60) has them
// (docs/minigames.md has where each number is). Everything counts in the
// game's frames, 30 a second, and its units: the stage (objects 147 and 148,
// drawn a ninth of their size) lies about the middle, y up, -z away from the
// camera, which looks down on it from the front.
//
// Four Delibird stand at the back of a green field, each under its own door
// (1P's blue on the left, then 2P's green, 3P's red, 4P's yellow). Gifts ride
// in on a belt along the front: walk down to one, facing it, and Delibird puts
// it in its sack (five at most; the heavier the sack, the slower it walks).
// Walk back up to the top and it hands them over, one by one, onto the belt
// at the back, which carries each to its door: a gift's points count once it's
// through. The same gift as the last one through scores double, then three,
// four and five times. Swinub run across the middle: one that runs into a
// Delibird knocks it over and its gifts fly out of the sack; one that hits the
// sack spins it round. The most points when the minute's up wins.
//
// The four share one world, so it runs from everyone's sticks at once and the
// CPUs think in it as the game's do. Every device and the server run the same
// world from the same sticks (online, devices run it again from a saved frame
// when someone's stick comes in late: game.js). So it only ever uses + - * /
// and square roots, in the game's order (in doubles: the game's floats are
// single, but each side's sums come out the same; a Swinub's speed is rounded
// to a single, as its spin's length depends on it). tools/delibird_rules.py
// is the rooms server's copy: keep the two the same.

export const FPS = 30;
export const LEVELS = { easy: 1, normal: 2, hard: 3 };

export const TIME = 60 * FPS; // a minute (0x86A001B0: the TV's rate / 2 x 60)
export const HURRY = 30 * FPS; // the last 30 s: the tune speeds up (0x86A014D0)
const LAST = 3 * FPS; // no gifts or Swinub come in the last 3 s (0x86A06D04)...
const FIRST = TIME - FPS; // ...and no Swinub in the first second
const WAIT = 60; // after the time's up, at most this long for gifts on their way (0x86A014D0)
// the end: the frame the tally's done the winners cheer and module #64's
// results come on (0x86A07124 calls 0x87F0A098 then): no wait after it
export const SHOW = 0;

// The gifts (0x86A0D560): points, how much they weigh in the sack, and how
// big they are on the belt (half their width and their depth); the objects
// they're drawn with. Every gift takes one of the sack's five places.
export const KINDS = [
  { name: "ring", object: 175, points: 1000, weight: 1, half: 1.2799999713897705, depth: 1.600000023841858 },
  { name: "piano", object: 176, points: 600, weight: 3, half: 2.9066667556762695, depth: 4.013333320617676 },
  { name: "snorlax", object: 181, points: 350, weight: 3, half: 3.246666669845581, depth: 3.2799999713897705 },
  { name: "n64", object: 169, points: 250, weight: 2, half: 2, depth: 2.7200000286102295 },
  { name: "gameboy", object: 180, points: 100, weight: 1, half: 0.8933333158493042, depth: 1.600000023841858 },
  { name: "stocking", object: 174, points: 50, weight: 1, half: 2.0799999237060547, depth: 2.133333444595337 },
  { name: "candy", object: 184, points: 20, weight: 0.5, half: 1.4533333778381348, depth: 1.1066666841506958 },
  { name: "gba", object: 177, points: 100, weight: 1, half: 1.6066666841506958, depth: 0.8999999761581421 },
  { name: "gamecube", object: 170, points: 250, weight: 1, half: 1.346666693687439, depth: 2.940000057220459 },
];
export const SACK_MAX = 5;

// Where things are (0x86A0D924 and the module's data, as floats)
export const START = [[-141.6666717529297, -140], [-47.22222137451172, -140], [47.22222137451172, -140], [141.6666717529297, -140]];
export const DOORS = [-1275, -425, 425, 1275].map((x) => [x * 0.1111111111111111, 100 * 0.1111111111111111, -2312 * 0.1111111111111111]);
export const LANES = [-70.83333587646484, -40.27777862548828, -20.83333396911621, 4.166666507720947]; // the Swinub's (0x86A0F29C)
const FIELD = { x0: -170, x1: 170, z0: -150, z1: 125 }; // where a Delibird can stand (0x86A06740)
const TOP = -140; // past this (its z, in whole units) a Delibird hands its gifts over (0x86A0585C)
export const BELT_Z = 135; // the front belt's gifts stop at this z (they come in from 235)...
const BELT_IN = 235;
export const BELT_Y = 5.55555534362793; // ...on it, at this height
const BELT_SLOTS = 340; // ...across it, in whole units from x -170 (0x86A03234)
export const BACK_Z = -175; // the back belt: where a gift goes on it (bigger ones at BACK_BIG)
const BACK_BIG = -183.3333282470703;
export const SWINUB_X = 270; // the Swinub run in from (and out past) x 270 either side

// A Delibird's reach (0x86A059AC: picking a gift up) and its body (0x86A05B4C,
// 0x86A05C94: gifts in its way); its size against the others (0x86A05678,
// 0x86A06A1C) and the Swinub's (0x86A05344, 0x86A05504)
const REACH = 19.349998474121094, BODY = 11.84999942779541;
const GIFT_W = 8.333333015441895, GIFT_K = 0.800000011920929;
const APART = 31.19999885559082, SQRT2 = 1.4142135381698608, PUSH = 0.10999999940395355, PUSH_D = 62.39999771118164;
const SWINUB = 19.19999885559082, AVOID_X = 36.19999694824219;
// the sack behind it (0x86A0F2D4: by how full it is, at its own angle) and how
// near a Swinub has to come to hit it, squared, by player: 1P's the least, 4P's
// twice as far (0x86A0F2BC: two more follow it, 4602.38 and 5681.95, which
// nothing reads; see sackHit)
const SACK = [[0, -27.733333587646484], [-1.426285743713379, -30.585905075073242], [-2.852571487426758, -32.646095275878906],
  [-4.595809459686279, -34.38933181762695], [-6.180571556091309, -37.241905212402344], [-7.92380952835083, -39.619049072265625]];
const SACK_R2 = [799.0242919921875, 1420.4876708984375, 2219.511962890625, 3196.09716796875];

// A Delibird's states (W + 0x24 + 4 x player; its clip is the same number):
// standing, walking (1 the fastest, 5 the slowest), picking a gift up,
// handing its gifts over, knocked over; 6 and 7 cheering and sulking at the end
export const ST = { stand: 0, walk1: 1, walk5: 5, cheer: 6, sulk: 7, pick: 8, hand: 9, knocked: 10 };
const PICK_TIME = 27; // a pick-up's frames (0x86A02A9C)...
const PICK_IN = 12, PICK_DONE = 26; // ...the gift goes in the sack on its 12th, and is gone by its 26th
const HAND_TIME = 40; // handing over (0x86A06C3C); a gift goes at these frames left (0x86A0B5CC)
const HAND_AT = [36, 29, 22, 15, 8];
const KNOCKED = 37, KNOCK_GRACE = 10; // knocked over (0x86A041D8): this long, then can't be again for this long
const KNOCK_SLIDE = 21; // (it slides till this many frames are left: 0x86A05DCC)

// The CPUs: the ways they try, best first (0x86A0F004: x, z; a gift's way
// takes the first place of 2 and 3): handing over from the right of the
// middle (0), from the left (1); going for a gift from the right (2), the left (3)
const WAYS = [
  [[0, -1], [-1, -1], [1, -1], [0, 0], [0, 1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
  [[0, -1], [1, -1], [-1, -1], [0, 0], [0, 1], [1, 0], [-1, 0], [1, 1], [-1, 1]],
  [[0, 1], [-1, 1], [1, 1], [0, 0], [0, -1], [-1, 0], [1, 0], [-1, -1], [1, -1]],
  [[0, 1], [1, 1], [-1, 1], [0, 0], [0, -1], [1, 0], [-1, 0], [1, -1], [-1, -1]],
];
// the 24 orders of four (0x86A0D638): who goes first each frame, picked at random
const ORDERS = [[0, 1, 2, 3], [0, 1, 3, 2], [0, 2, 1, 3], [0, 2, 3, 1], [0, 3, 1, 2], [0, 3, 2, 1], [1, 0, 2, 3], [1, 0, 3, 2],
  [1, 2, 0, 3], [1, 2, 3, 0], [1, 3, 0, 2], [1, 3, 2, 0], [2, 1, 0, 3], [2, 1, 3, 0], [2, 0, 1, 3], [2, 0, 3, 1],
  [2, 3, 1, 0], [2, 3, 0, 1], [3, 1, 2, 0], [3, 1, 0, 2], [3, 2, 1, 0], [3, 2, 0, 1], [3, 0, 1, 2], [3, 0, 2, 1]];

// the level the game plays: with four people, the CPUs' don't matter
export function levelCode(level, cpus) { return cpus.some((c) => c) ? LEVELS[level] || 2 : 1; }
// frames from the play's end to the cheering, for these points: they count
// up by 0, 1, 2... a frame (0x86A07124), and the frame after they're all in
export function tallyFrames(scores) {
  const shown = scores.map(() => 0);
  for (let step = 0, k = 2; ; step++, k++) {
    scores.forEach((s, i) => { if (shown[i] < s) shown[i] = Math.min(s, shown[i] + step); });
    if (shown.every((v, i) => v === scores[i])) return k;
  }
}

// The main program's arctangent table (0x8008CFB0: atan(i / 1024) in 65536ths
// of a turn, for i 0-1024), made the same way everywhere: atan halved twice
// (with sqrt), then its series (as src/rollout/rules.js)
const ATAN = [];
for (let i = 0; i <= 1024; i++) {
  let x = i / 1024, k = 1;
  for (let j = 0; j < 2; j++) { x = x / (1 + Math.sqrt(1 + x * x)); k *= 2; }
  let term = x, sum = x;
  const x2 = x * x;
  for (let n = 1; n < 12; n++) { term = -term * x2; sum += term / (2 * n + 1); }
  ATAN.push(Math.round(((sum * k) / (2 * 3.141592653589793)) * 65536));
}
const look = (y, x) => (x === 0 ? ATAN[0] : ATAN[Math.trunc((y / x) * 1024 + 0.5)]);
const s16 = (v) => (((v & 0xffff) ^ 0x8000) - 0x8000);
// the angle of the point (a, b) from the +a axis towards +b, in 65536ths of a
// turn, -32768 to 32767 (0x8000B390)
export function angle(a, b) {
  let v;
  if (b >= 0) {
    if (a >= 0) v = b <= a ? look(b, a) : 0x4000 - look(a, b);
    else { a = -a; v = a < b ? look(a, b) + 0x4000 : 0x8000 - look(b, a); }
  } else {
    b = -b;
    if (a < 0) { a = -a; v = b <= a ? look(b, a) + 0x8000 : 0xc000 - look(a, b); }
    else v = a < b ? look(a, b) + 0xc000 : -look(b, a);
  }
  return s16(v);
}
// the main program's sine table (0x80087FB0: 4096 to a turn, and a quarter
// more for the cosines at 0x80088FB0), made the same way everywhere and as
// floats (as src/barrier/rules.js)
export function sine(i) {
  const q = (i >> 10) & 3, x = (i & 1023) * (Math.PI / 2048), x2 = x * x;
  let term = q % 2 === 0 ? x : 1, sum = term;
  for (let k = 1; k < 10; k++) {
    term = (-term * x2) / (q % 2 === 0 ? 2 * k * (2 * k + 1) : (2 * k - 1) * (2 * k));
    sum += term;
  }
  return Math.fround(q >= 2 ? (sum === 0 ? 0 : -sum) : sum);
}
const cosine = (i) => sine(i + 1024);
// a heading the way (x, z) goes (0x86A0638C: the way a Delibird faces; +x is 0x4000)
const heading = (x, z) => s16((angle(x, -z) + 0x3fff) % 0xffff);
// how far apart two headings are, 0 to 0x7FFF (0x86A066F4)
function apart(a, b) {
  let v = a < b ? b - a : a - b;
  if (v >= 0x8000) v = 0xffff - v;
  return v;
}
// a heading turned by step towards another, or onto it if that's nearer (0x86A06650)
function turn(to, from, step) {
  if (!(step < apart(to, from))) return to;
  const a = s16(from + step), b = s16(from - step);
  return apart(to, a) < apart(to, b) ? a : b;
}
// the stick (-64 to 64 each way) as a Delibird's step, by how heavy its sack is (0x86A0BD34)
function stride(sx, sy, weight) {
  if (weight > 5) return [(sx * 2) * 0.015625, -((sy * 2) * 0.015625)];
  return [(sx * (7 - weight)) * 0.015625, -((sy * (7 - weight)) * 0.015625)];
}
// a way (x, z) as a full stick (0x86A0CED8)
function stickFor(x, z) {
  if (x === 0 && z === 0) return [0, 0];
  let l = Math.sqrt(x * x + z * z);
  if (l < 0.009999999776482582) l = 0.009999999776482582;
  return [(x * 64) / l, -((z * 64) / l)];
}

// One round's world. cpus: which seats are CPUs; step() runs a frame from the
// people's sticks. The scene reads it all.
export class World {
  constructor(seed, level = "normal", cpus = [false, true, true, true]) {
    this.level = levelCode(level, cpus); // 1-3 (0x86A001B0)
    this.everyone = !cpus.some((c) => c); // four people: Easy, with a third Swinub
    this.cpuLevel = LEVELS[level] || 2; // (the CPUs' own: 0x86A0BD34)
    this.seed = seed >>> 0; // the game's random numbers' state (rnd())
    this.t = -1; // the last frame run
    this.clock = TIME; // frames on the clock (0x86A443F0); below 0 while gifts are still on their way
    this.phase = "play"; // then "tally" (the points counting up: 0x86A07124), then "show"
    this.end = null; // the frame the play ended on
    this.shown = null; // the frame the cheering started (the tally's done)
    this.step_ = 0; // the tally's next step
    this.ids = 0;
    this.slots = new Array(BELT_SLOTS).fill(0); // where the front belt's taken (0x86A45F20)
    this.gifts = []; // on the front belt, or being picked up (0x86A41490 and pool 0x86A11190)
    this.boxes = []; // handed over, going to their doors (pool 0x86A1AAD0)
    this.crumbs = []; // knocked out of a sack, flying off (pool 0x86A2DD40)
    this.swinub = []; // (pool 0x86A40FA0)
    this.lanes = [0, 0, 0, 0]; // which lanes have a Swinub (0x86A45AD0)
    this.onBelt = []; // the gifts on the front belt, as of the last frame (W + 0xEC4)
    this.running = []; // and the Swinub (W + 0xE84)
    this.events = [];
    this.p = [0, 1, 2, 3].map((z) => ({
      z, cpu: !!cpus[z],
      x: START[z][0], zz: START[z][1], vx: 0, vz: 0,
      state: ST.stand, since: 0, // (since: the frame it went into its state: the scene's clips)
      busy: 0, grace: 0, spin: 0, // frames it can't move for; can't be knocked over for; spinning (+1/-1)
      yaw: 0, aim: 0, sackYaw: 0, // the way it faces, the way it's turning to, its sack's (it lags behind)
      sack: [], load: 0, weight: 0, last: -1, // its gifts (first in, first out), places taken, weight, the last in
      score: 0, shown: 0, got: [], combo: 0, comboShow: 0, // points; the gifts through its door; the same in a row
      mode: 0, wait: 0, // a CPU's: 0 going for gifts, 1 handing them over; frames with a few in its sack
      pushA: [0, 0], pushB: [0, 0], pushed: false, won: false,
    }));
  }
  // the game's random numbers, as every draw in module #60 takes them
  // (0x8007B100: x = (4x + 2)(4x + 3) >> 2, in 32 bits; never negative, under 2^30)
  rnd() { return (this.seed = Math.imul(((this.seed << 2) + 2) | 0, ((this.seed << 2) + 3) | 0) >>> 2); }

  // ---- a frame (the play, 0x86A014D0; the tally, 0x86A07124) ----
  // pads: each person's stick [x, y], -64 to 64 each (null: none)
  step(t, pads = []) {
    this.t = t;
    if (this.phase === "play") {
      const c = this.clock;
      if (c > 0) {
        this.clock = c - 1;
        this.players(pads);
        if (LAST < this.clock) {
          this.giftIn();
          if (this.clock < FIRST) this.swinubIn();
        }
        this.pools();
      } else if (this.pending()) {
        this.players(pads);
        this.pools();
        this.clock = c - 1;
        if (this.clock < -WAIT) this.finish();
      } else this.finish();
    } else if (this.phase === "tally") {
      this.pools();
      if (this.counted) { this.cheer(); return; }
      this.players(pads);
      this.pools();
      let counting = false;
      for (const p of this.p) {
        if (p.shown < p.score) {
          counting = true;
          p.shown += this.step_;
          if (p.shown >= p.score) { p.shown = p.score; this.events.push(["counted", p.z]); }
        }
      }
      if (counting) this.events.push(["tick"]);
      this.counted = this.p.every((p) => p.shown === p.score);
      this.step_++;
    }
  }
  // anything still on its way: a gift being picked up, one going to its door, a Delibird handing over (0x86A04100)
  pending() {
    return this.gifts.some((g) => g.picked) || this.boxes.length > 0 || this.p.some((p) => p.state === ST.hand);
  }
  finish() {
    this.phase = "tally";
    this.end = this.t;
    this.counted = false;
    this.step_ = 0;
    this.events.push(["end"]);
  }
  // the most points win (all four level: nobody); the winners cheer, the others sulk (0x86A0B49C)
  cheer() {
    let best = -1;
    for (const p of this.p) if (best < p.score) best = p.score;
    for (const p of this.p) p.won = p.score === best;
    if (this.p.every((p) => p.won)) for (const p of this.p) p.won = false;
    for (const p of this.p) {
      p.yaw = 0;
      p.sackYaw = 0;
      this.setState(p, p.won ? ST.cheer : ST.sulk);
    }
    this.phase = "show";
    this.shown = this.t;
  }
  setState(p, s) { if (p.state !== s) { p.state = s; p.since = this.t; } }

  // ---- the Delibird (0x86A05DCC) ----
  players(pads) {
    const order = ORDERS[this.rnd() % 24];
    for (const p of this.p) {
      let left = p.busy;
      if (left > 0) {
        if (p.spin !== 0) {
          // spinning (hit on the sack): round by less each frame
          const v = s16(((left * 0xffff + p.sackYaw) + Math.trunc((p.spin * 0xffff) / 64) * left) % 0xffff);
          p.sackYaw = p.yaw = p.aim = v;
        }
        if (p.state === ST.hand) this.hand(p);
        left = --p.busy;
      }
      if (left === 0 && p.grace > 0) p.grace--;
      if (left === 0) {
        let v = [0, 0];
        if (this.clock > 0) v = this.stick(p, pads[p.z]);
        p.vx = v[0];
        p.vz = v[1];
        if (v[0] !== 0 || v[1] !== 0) p.aim = heading(v[0], v[1]);
        if (v[0] === 0 && v[1] === 0) this.setState(p, p.aim !== p.yaw ? 3 : ST.stand);
        else {
          const s = Math.sqrt(v[0] * v[0] + v[1] * v[1]);
          this.setState(p, s <= 3 ? 5 : s <= 4 ? 4 : s <= 5 ? 3 : s <= 6 ? 2 : 1);
        }
      }
    }
    for (const p of this.p) {
      if (p.busy === 0) p.spin = 0;
      if (p.state >= ST.pick) p.spin = 0;
      if (p.state === ST.knocked && p.busy < KNOCK_SLIDE) { p.vx = 0; p.vz = 0; }
      p.pushed = false;
      p.pushA = [0, 0];
      p.pushB = [0, 0];
    }
    const free = (p) => p.state <= ST.walk5 && p.spin === 0;
    for (const z of order) if (free(this.p[z])) this.shove(this.p[z]);
    for (const z of order) {
      const p = this.p[z];
      if (free(p) && p.pushed) {
        p.vx = p.vx + (p.pushA[0] + p.pushB[0]);
        p.vz = p.vz + (p.pushA[1] + p.pushB[1]);
        p.pushed = false;
      }
    }
    for (const z of order) {
      const p = this.p[z];
      if (p.state <= ST.walk5 || p.state === ST.knocked) this.move(p, p.vx, p.vz);
    }
    for (const p of this.p) if (p.spin === 0) this.face(p);
    // at the top with gifts: hand them over (0x86A06C3C)
    for (const p of this.p) {
      if (Math.trunc(p.zz) < TOP && p.state !== ST.hand && p.load !== 0) {
        this.setState(p, ST.hand);
        p.busy = HAND_TIME;
      }
    }
  }
  // its stick: the pad's, or a CPU's (0x86A0BD34)
  stick(p, pad) {
    if (!p.cpu) {
      const [sx, sy] = pad || [0, 0];
      return stride(sx, sy, p.weight);
    }
    return stride(...this.think(p), p.weight);
  }
  // pushed apart from the others it's against (0x86A06A1C)
  shove(p) {
    for (const q of this.p) {
      if (q === p) continue;
      const dx = q.x - p.x, dz = q.zz - p.zz, r = SQRT2 * APART;
      if (q.x - r < p.x && p.x < r + q.x && q.zz - r < p.zz && p.zz < r + q.zz) {
        const d = Math.sqrt(dx * dx + dz * dz);
        const k = d < 0.01 ? 11 : PUSH / d;
        const ux = dx * k, uz = dz * k;
        p.pushed = true;
        const s = Math.sqrt(q.vz * q.vz + q.vx * q.vx);
        p.pushA[0] = p.pushA[0] - ux * s;
        p.pushA[1] = p.pushA[1] - uz * s;
        const f = PUSH_D - d;
        p.pushB[0] = p.pushB[0] - ux * f;
        p.pushB[1] = p.pushB[1] - uz * f;
      }
    }
  }
  // a step, if it can go there: else along x, else along z (0x86A06740)
  move(p, dx, dz) {
    const x = p.x + dx, z = p.zz + dz;
    const ok = (nx, nz) => {
      const w = this.inWay(nx, nz);
      return w + p.load < 6 && (p.state !== ST.knocked || this.inWay(nx, nz) === 0) && !this.blocked(nx, nz);
    };
    if (!this.against(p, x, z) && ok(x, z) && FIELD.x0 < x && x < FIELD.x1 && FIELD.z0 < z && z < FIELD.z1) {
      p.x = x;
      p.zz = z;
      return;
    }
    if (!this.against(p, x, p.zz) && ok(x, p.zz) && FIELD.x0 < x && x < FIELD.x1) { p.x = x; return; }
    if (!this.against(p, p.x, z) && ok(p.x, z) && FIELD.z0 < z && z < FIELD.z1) p.zz = z;
  }
  // another Delibird right there (0x86A05678)
  against(p, x, z) {
    return this.p.some((q) => q !== p && q.x - APART < x && x < q.x + APART && q.zz - APART < z && z < q.zz + APART);
  }
  // gifts on the front belt in the way at (x, z): how many places they'd take (0x86A05B4C), any (0x86A05C94)
  inWay(x, z) {
    let n = 0;
    for (const g of this.onBelt) if (overGift(g, x, z, BODY)) n += 1;
    return n;
  }
  blocked(x, z) { return this.onBelt.some((g) => overGift(g, x, z, BODY)); }
  // turning: its sack follows the way it faces, which follows the way it's going (0x86A06474)
  face(p) {
    const gap = apart(p.sackYaw, p.yaw);
    p.sackYaw = turn(p.yaw, p.sackYaw, gap > 16383.75 ? 0x1332 : gap > 8191.875 ? 0xccc : gap > 4095.9375 ? 0x666 : 0x199);
    let s = Math.sqrt(p.vx * p.vx + p.vz * p.vz);
    if (s > 3.5) s = 3.5;
    if (s < 2) s = 2;
    p.yaw = turn(p.aim, p.yaw, s16(Math.trunc(1638 * s)));
  }
  // its turn at the top: a gift onto the back belt every 7 frames (0x86A0B5CC)
  hand(p) {
    if (!HAND_AT.includes(p.busy)) return;
    const k = this.take(p);
    if (k < 0) return;
    const big = k === 1 || k === 2;
    this.boxes.push({ id: ++this.ids, p: p.z, kind: k, x: p.x, y: BELT_Y, z: big ? BACK_BIG : BACK_Z, big });
    this.events.push(["hand", p.z]);
  }
  // a gift into its sack (0x86A03F48)
  put(p, k) {
    if (p.sack.length === SACK_MAX || 1 + p.load >= 6) return false;
    p.sack.push(k);
    p.load += 1;
    p.last = k;
    p.weight = p.weight + KINDS[k].weight;
    return true;
  }
  // and out of it, the first one in (0x86A0405C): -1 when it's empty
  take(p) {
    if (p.sack.length === 0) return -1;
    const k = p.sack.shift();
    p.load -= 1;
    p.weight = p.weight - KINDS[k].weight;
    return k;
  }
  // does a Swinub at (x, z) hit its sack? (0x86A0588C: where the sack is goes
  // by how full it is, how near it has to come by the player: 0x86A0F2BC[p])
  sackHit(p, x, z) {
    const [ox, oz] = SACK[p.load];
    const i = ((p.sackYaw + angle(ox, oz)) & 0xffff) >> 4;
    const r = Math.sqrt(ox * ox + oz * oz);
    const dx = (p.x + -cosine(i) * r) - x, dz = (p.zz + sine(i) * r) - z;
    return dx * dx + dz * dz < SACK_R2[p.z];
  }

  // ---- the CPUs (0x86A0BD34): go for a gift; with enough, take them up to the top ----
  think(p) {
    const lvl = this.cpuLevel;
    if (lvl === 3 && this.clock < 40 * FPS) p.mode = 1; // (the last 40 s: up with whatever it has)
    if (p.mode === 0) {
      const n = p.load;
      if (n === 0) p.mode = 0;
      else if (lvl === 1) {
        if (n >= 3) p.mode = 1;
        else if (this.rnd() % 100 < 10 && p.wait === 0) p.mode = 1;
      } else {
        const few = lvl === 3 ? 3 : 2;
        if (n > few) p.mode = 1;
        else {
          if (p.wait++ >= 31) p.mode = 1;
          if (this.clock < LAST) p.mode = 1;
        }
      }
    } else if (p.mode === 1) {
      p.wait = 0;
      if (p.load === 0) p.mode = 0;
    }
    if (p.mode === 0) {
      const g = this.target(p);
      if (!g) return [0, 0];
      const w = this.way(p, 0, [g[0] - p.x, g[1] - p.zz]);
      return stickFor(w[0], w[1]);
    }
    const w = this.way(p, 1, null);
    return stickFor(w[0], w[1]);
  }
  // which gift it goes for (0x86A0CF80): Easy the closest; Normal the most
  // points (the closest of those); Hard, if it has gifts or got some through,
  // one worth the same as its last (for the points in a row; not candy) or
  // else the most points
  target(p) {
    const list = this.onBelt;
    if (list.length === 0) return null;
    const lvl = this.cpuLevel;
    let best = list[0], pts = KINDS[best.kind].points;
    let d = (p.x - best.x) * (p.x - best.x) + (p.zz - best.z) * (p.zz - best.z);
    let want = 0;
    if (lvl === 3) {
      if (p.load !== 0) want = KINDS[p.last].points;
      else if (p.got.length > 0) want = KINDS[p.got[p.got.length - 1]].points;
      if (want === 20) want = 0;
    }
    for (let i = 1; i < list.length; i++) {
      const g = list[i], q = KINDS[g.kind].points;
      const e = (p.x - g.x) * (p.x - g.x) + (p.zz - g.z) * (p.zz - g.z);
      let take = false;
      if (lvl === 1) take = e < d;
      else if (lvl === 3 && want !== 0) take = (pts === want && e < d) || (pts !== want && pts < q);
      else take = pts < q || (pts === q && e < d);
      if (take) { best = g; pts = q; d = e; }
    }
    return d > 0 ? [best.x, best.z] : null;
  }
  // the first of its ways (to a gift: mode 0; up to the top: 1) that no
  // Swinub will run into for as far ahead as it looks (0x86A0C9B4: Hard
  // looks 130 frames ahead, the others one)
  way(p, mode, toGift) {
    const set = mode === 1 ? (p.x > 0 ? 0 : 1) : (p.x > 0 ? 2 : 3);
    const ways = WAYS[set].map((w, i) => (i === 0 && toGift ? toGift : w));
    const steps = ways.map(([x, z]) => {
      const [sx, sy] = stickFor(x, z);
      return stride(sx, sy, p.weight);
    });
    let alive = ways.map(() => true), before = alive;
    const ahead = this.cpuLevel === 3 ? 130 : 1;
    const seen = this.running.map((s) => [s.x, s.z, s.vx]);
    for (let k = 1; k <= ahead && alive.some((a) => a); k++) {
      before = [...alive];
      for (const s of seen) s[0] = s[0] + s[2];
      for (let c = 0; c < 9; c++) {
        if (!alive[c]) continue;
        let x = steps[c][0] * k + p.x;
        const z = steps[c][1] * k + p.zz;
        if (x < FIELD.x0) x = FIELD.x0;
        if (FIELD.x1 < x) x = FIELD.x1;
        if (z < FIELD.z0) { if (mode === 1) break; continue; }
        if (FIELD.z1 < z) { if (mode === 0) break; continue; }
        if (this.near(seen, x, z)) alive[c] = false;
      }
    }
    if (!alive.some((a) => a)) alive = before;
    const i = alive.indexOf(true);
    return ways[i < 0 ? 0 : i];
  }
  // a Swinub (as it'll be) right there (0x86A05504: Hard keeps further off)
  near(seen, x, z) {
    const wx = this.cpuLevel === 3 ? AVOID_X : SWINUB, wz = this.cpuLevel === 3 ? APART : SWINUB;
    return seen.some(([sx, sz]) => x < sx + wx && sx - wx < x && z < sz + wz && sz - wz < z);
  }

  // ---- what comes in (0x86A06D04) ----
  // a gift onto the front belt, somewhere it's free (0x86A03234)
  giftIn() {
    const r = this.rnd() % 100;
    let k = r < 3 ? 0 : r < 16 ? 1 : r < 32 ? 2 : r < 46 ? 3 : r < 62 ? 4 : r < 80 ? 5 : 6;
    if (k === 6 && this.onBelt.filter((g) => g.kind === 6).length >= 2) return; // (two candies at most)
    const w = Math.trunc(KINDS[k].half * 10 + 1) + 8;
    const at = (this.rnd() % (BELT_SLOTS - w * 2)) + w;
    for (let i = at - w; i < at + w; i++) if (this.slots[i]) return;
    for (let i = at - w; i < at + w; i++) this.slots[i] = 1;
    this.gifts.push({ id: ++this.ids, kind: k, at, w, x: at - BELT_SLOTS / 2, z: BELT_IN, picked: false, by: -1, timer: 0 });
    if (k === 0) this.events.push(["ring"]);
    if (k === 1) this.events.push(["piano"]);
  }
  // a Swinub into a free lane, from the side the next lanes' aren't heading (0x86A046A4)
  swinubIn() {
    const a = this.rnd(), b = this.rnd();
    let right = ((b % 97) + (a % 97)) % 2 !== 0;
    if (!(this.rnd() % 97 < 61)) return;
    const most = this.level === 1 ? (this.everyone ? 3 : 2) : 3;
    if (this.swinub.length >= most) return;
    const lane = this.rnd() % 4;
    if (this.lanes[lane]) return;
    const side = this.side(lane);
    if (side === 2) return;
    right = side === 1;
    let v = this.rnd() % 97 >= 11 ? 5 + (this.rnd() % 3) : 8 + (this.rnd() % 3);
    if (right) v = -v;
    // (by the level, as a single: 0x86A04A9C, mul.s; 10 x 0.9 is 9 then, and spins a Delibird 9 frames)
    v = Math.fround(v * [0.800000011920929, 0.8999999761581421, 1, 1.2000000476837158][this.level]);
    this.lanes[lane] = 1;
    this.swinub.push({ id: ++this.ids, lane, x: right ? SWINUB_X : -SWINUB_X, z: LANES[lane], vx: v, right });
  }
  // which side a lane's Swinub comes from (0x86A04C04): 0 the left, 1 the
  // right, 2 not now; by the Swinub in the lanes next to it
  side(lane) {
    const find = (l) => {
      let got = null;
      for (const s of this.running) if (LANES[l] - 5.55555534362793 < s.z && s.z < LANES[l] + 5.55555534362793) { got = s; if (l !== 3 || lane !== 2) break; }
      return got;
    };
    const coin = () => {
      const a = this.rnd(), b = this.rnd();
      return ((b % 97) + (a % 97)) % 2 !== 0 ? 1 : 0;
    };
    if (lane === 0 || lane === 3) {
      const s = find(lane === 0 ? 1 : 2);
      if (!s) return coin();
      return s.vx > 0 ? 1 : 0;
    }
    const s1 = find(lane === 1 ? 0 : 1), s2 = find(lane === 1 ? 2 : 3);
    if (!s1 && !s2) return coin();
    if (s1 && !s2) return s1.vx > 0 ? 1 : 0;
    if (!s1 && s2) return s2.vx > 0 ? 1 : 0;
    if (s1.vx > 0 && s2.vx > 0) return 1;
    if (s1.vx < 0 && s2.vx < 0) return 0;
    if (s1.vx > 0 && s2.vx < 0) return 0 < s1.x ? 0 : s2.x < 0 ? 1 : 2;
    return 0 < s2.x ? 0 : s1.x < 0 ? 1 : 2;
  }

  // ---- the things on the stage, each frame, in the game's order (0x86A06D88) ----
  pools() {
    const belt = [], running = [];
    const order = this.gifts.slice();
    for (const g of order) this.gift(g, belt);
    this.onBelt = belt;
    for (const b of this.boxes.slice()) this.box(b);
    for (const c of this.crumbs.slice()) {
      c.x = c.x + c.vx;
      c.y = c.y + c.vy;
      c.z = c.z + c.vz;
      c.vy = c.vy - 1;
      c.alpha -= 7;
      if (c.y < -11.11111111111111) this.crumbs.splice(this.crumbs.indexOf(c), 1);
    }
    for (const s of this.swinub.slice()) this.run(s, running);
    this.running = running;
  }
  // a gift (0x86A02A9C): on the belt it comes in (unless a Delibird that can't
  // take it is in the way) and the first Delibird reaching for it, facing it,
  // with room in its sack, picks it up; picked up, it goes in the sack
  gift(g, belt) {
    const order = ORDERS[this.rnd() % 24];
    if (!g.picked) {
      const z0 = g.z, lo = z0 - 3;
      const next = BELT_Z < lo ? lo : z0 + 3 < BELT_Z ? z0 + 3 : BELT_Z;
      let stop = false;
      for (const p of this.p) {
        if (!reaches(p, g, g.x, next)) continue;
        if (p.state === ST.pick || p.state === ST.knocked || 1 + p.load >= 6 || !facing(p, g.x, next)) { stop = true; break; }
      }
      if (!stop) g.z = next;
      for (const z of order) {
        const p = this.p[z];
        if (reaches(p, g, g.x, z0) && facing(p, g.x, z0) && 1 + p.load < 6 && p.busy === 0) {
          this.setState(p, ST.pick);
          p.busy = PICK_TIME;
          g.timer = 0;
          if (g.x - p.x !== 0 || z0 - p.zz !== 0) p.aim = heading(g.x - p.x, z0 - p.zz);
          if (g.x - p.x !== 0 || z0 - p.zz !== 0) p.yaw = heading(g.x - p.x, z0 - p.zz);
          g.picked = true;
          g.by = z;
          p.wait = 0;
          break;
        }
      }
      belt.push({ x: g.x, z: z0, kind: g.kind });
    } else {
      if (g.timer >= PICK_DONE) {
        for (let i = g.at - g.w; i < g.at + g.w; i++) this.slots[i] = 0;
        this.gifts.splice(this.gifts.indexOf(g), 1);
        this.events.push(["sack", g.by, this.p[g.by].load]);
        return;
      }
      if (g.timer === PICK_IN) this.put(this.p[g.by], g.kind);
    }
    g.timer++;
  }
  // a gift on the back belt (0x86A036F4): along to its door, up, in; then its points
  box(b) {
    const [tx, ty, tz] = DOORS[b.p];
    if (tx < b.x - 8) b.x = b.x - 8;
    else if (b.x + 8 < tx) b.x = b.x + 8;
    else {
      b.x = tx;
      if (ty < b.y - 8) b.y = b.y - 8;
      else if (b.y + 8 < ty) b.y = b.y + 8;
      else {
        b.y = ty;
        if (tz < b.z - 8) b.z = b.z - 8;
        else if (b.z + 8 < tz) b.z = b.z + 8;
        else b.z = tz;
      }
    }
    if (b.x !== tx || b.y !== ty || b.z !== tz) return;
    this.boxes.splice(this.boxes.indexOf(b), 1);
    const p = this.p[b.p], n = p.got.length, pts = KINDS[b.kind].points;
    p.got.push(b.kind);
    if (n > 0 && p.got[n - 1] === b.kind) {
      p.combo = Math.min(p.combo + 1, 4);
      p.score = Math.min(p.score + pts * (p.combo + 1), 99999);
      p.comboShow = 30;
      p.comboAt = this.t;
      this.events.push(["combo", p.z, p.combo]);
    } else {
      p.comboShow = 0;
      p.score = Math.min(p.score + pts, 99999);
      p.combo = 0;
      this.events.push(["in", p.z, b.kind]);
    }
  }
  // a Swinub (0x86A041D8): across its lane; running into a Delibird knocks it
  // over (its gifts fly out), into its sack spins it round
  run(s, running) {
    s.x = s.x + s.vx;
    const x = s.x, z = s.z;
    for (const p of this.p) {
      if (!(p.x < x + SWINUB && x - SWINUB < p.x && p.zz < z + SWINUB && z - SWINUB < p.zz)) continue;
      if (p.grace !== 0 || p.state === ST.hand || p.state === ST.pick) continue;
      const dz = p.zz - z, dx = p.x - x;
      let d = Math.sqrt(dz * dz + dx * dx);
      if (d < 0.01) d = 0.009999999776482582;
      p.vx = ((dx * s.vx) / d) / 10 + s.vx * 0.5;
      p.vz = ((dz * s.vx) / d) / 10;
      p.spin = 0;
      this.setState(p, ST.knocked);
      let n = 0;
      for (let k = this.take(p); k >= 0; k = this.take(p)) {
        const a = (this.rnd() % 65535) >> 4;
        this.crumbs.push({ kind: k, x: p.x, y: 1, z: p.zz, vx: cosine(a) * 4 + p.vx, vy: 8, vz: sine(a) * 4 + p.vz, alpha: 255 });
        n++;
      }
      this.events.push(["knocked", p.z, n]);
      p.busy = KNOCKED;
      p.grace = KNOCK_GRACE;
    }
    for (const p of this.p) {
      if (p.state === ST.knocked || p.state === ST.pick || p.state === ST.hand) continue;
      if (!this.sackHit(p, x, z) || p.busy !== 0) continue;
      this.events.push(["spun", p.z]);
      p.busy = Math.abs(Math.trunc(s.vx));
      p.vx = 0;
      p.vz = 0;
      p.spin = z < p.zz ? (s.vx > 0 ? -1 : 1) : (s.vx > 0 ? 1 : -1);
    }
    if (x < -SWINUB_X || x > SWINUB_X) {
      this.swinub.splice(this.swinub.indexOf(s), 1);
      this.lanes[s.lane] = 0;
      return;
    }
    running.push({ x, z, vx: s.vx });
  }

  // ---- for running a frame again (online) ----
  save() {
    const player = (p) => ({ ...p, sack: [...p.sack], got: [...p.got], pushA: [...p.pushA], pushB: [...p.pushB] });
    return {
      t: this.t, seed: this.seed, clock: this.clock, phase: this.phase, end: this.end, shown: this.shown, step_: this.step_,
      counted: this.counted, ids: this.ids, slots: [...this.slots], lanes: [...this.lanes],
      gifts: this.gifts.map((g) => ({ ...g })), boxes: this.boxes.map((b) => ({ ...b })), crumbs: this.crumbs.map((c) => ({ ...c })),
      swinub: this.swinub.map((s) => ({ ...s })), onBelt: this.onBelt.map((g) => ({ ...g })), running: this.running.map((s) => ({ ...s })),
      p: this.p.map(player),
    };
  }
  load(s) {
    Object.assign(this, this.save.call(s));
    this.events = [];
  }

  // each one's points, by seat
  get scores() { return this.p.map((p) => p.score); }
  // the places (1-4) by points
  get places() { return this.p.map((p) => 1 + this.p.filter((q) => q.score > p.score).length); }
  // a fingerprint of the world, exact, to check two runs of it agree (the tests;
  // tools/delibird_rules.py's is the same)
  digest() {
    const parts = [this.t, this.seed, this.clock, this.phase, this.end ?? -1, this.shown ?? -1, this.step_, +!!this.counted,
      this.ids, this.slots.join(""), this.lanes.join("")];
    for (const p of this.p) {
      parts.push(hex(p.x), hex(p.zz), hex(p.vx), hex(p.vz), p.state, p.since, p.busy, p.grace, p.spin, p.yaw, p.aim, p.sackYaw,
        p.sack.join("."), p.load, hex(p.weight), p.last, p.score, p.shown, p.got.join("."), p.combo, p.comboShow, p.mode, p.wait, +p.won);
    }
    for (const g of this.gifts) parts.push(g.id, g.kind, g.at, hex(g.x), hex(g.z), +g.picked, g.by, g.timer);
    for (const b of this.boxes) parts.push(b.id, b.p, b.kind, hex(b.x), hex(b.y), hex(b.z));
    for (const c of this.crumbs) parts.push(c.kind, hex(c.x), hex(c.y), hex(c.z), hex(c.vx), hex(c.vy), hex(c.vz), c.alpha);
    for (const s of this.swinub) parts.push(s.id, s.lane, hex(s.x), hex(s.vx));
    return parts.join(",");
  }
}

// can a Delibird reach a gift at (x, z) (0x86A059AC)? its reach round the
// gift's front, wider by its width and further back by its depth
function reaches(p, g, x, z) {
  const k = KINDS[g.kind], w = k.half * GIFT_W * GIFT_K + REACH;
  return p.x < w + x && x - w < p.x && p.zz < 0 + REACH + z && z - ((2 * (k.depth * GIFT_W)) * 0.800000011920929 + REACH) < p.zz;
}
// the same for a gift in its way (0x86A05B4C)
function overGift(g, x, z, r) {
  const k = KINDS[g.kind], w = k.half * GIFT_W * GIFT_K + r;
  return x < w + g.x && g.x - w < x && z < 0 + r + g.z && g.z - ((2 * (k.depth * GIFT_W)) * 0.800000011920929 + r) < z;
}
// is it facing (x, z)? (0x86A05AAC: the game only checks one way round, so
// most ways count but a quarter turn or so the one way)
function facing(p, x, z) {
  const a = s16((angle(x - p.x, -(z - p.zz)) + 0x3fff) % 0xffff);
  return p.yaw - a < 0x2000;
}

const view = new DataView(new ArrayBuffer(8));
function hex(v) {
  view.setFloat64(0, v + 0); // (-0 as 0: Python's whole numbers have no sign)
  return view.getUint32(0).toString(16).padStart(8, "0") + view.getUint32(4).toString(16).padStart(8, "0");
}
