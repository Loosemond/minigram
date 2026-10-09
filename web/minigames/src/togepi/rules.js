// Tumbling Togepi's rules, as the game's code module (#55) has them
// (docs/minigames.md has where each number is). Everything counts in the
// game's frames, 30 a second.
//
// Four Togepi run on four treadmills side by side. Each treadmill's belt
// carries the same course towards its Togepi: hold down to run (the belt
// scrolls), left and right to steer round what comes. Flowers slow you while
// you're in them; a rock or a Diglett that's up knocks you; a log trips you;
// a blue arrow starts a dash: faster, hopping over most things (a log or a
// Diglett coming up bounces you, and costs some of the speed). The first to
// the goal wins.
//
// Each belt is a lane of its own, in its own units: x 0-276 across it (the
// game's lanes are 276 apart), z along it (its Togepi at -280, what's ahead
// at bigger z). In the game the Togepi also move up and down their belts by
// rank, and the CPUs look at the ranks; here a lane depends on nothing but
// its own player (so every device and the server can run it from that
// player's stick alone): the rank shift is only drawn (game.js), and the
// CPUs rank among themselves. Each lane has random numbers of its own too.
// Tools/togepi_rules.py is the rooms server's copy: keep the two the same.

export const FPS = 30;
export const LEVELS = { easy: 1, normal: 2, hard: 3 };

// The course: five sections (0x8670211C), each one of 20 patterns of four
// rows (0x8670B464); a row's obstacles: [column (0-18 across the belt), depth
// (18 units each), type, and three columns for the CPUs]. A section can be
// mirrored. The patterns a section picks from: 0-4, 0-14, 5-14, 5-19, 15-19
// (the later ones are harder), never one picked already.
export const FLOWER = 0, ROCK_S = 1, ROCK = 2, LOG_S = 3, LOG_M = 4, LOG_L = 5, ARROW = 10, DIGLETT = 11;
export const PATTERNS = [
  [[[3,18,0,15,9,5],[15,37,10,15,15,13]],[[15,18,4,10,4,14],[15,37,10,15,15,15]],[[10,20,0,3,15,9],[3,37,10,3,3,3]],[[9,20,4,3,15,9],[9,37,10,9,9,9]]],
  [[[9,15,0,3,15,7],[3,37,10,3,3,3]],[[9,16,0,3,15,12],[9,37,10,9,9,9]],[[3,15,4,9,15,4],[15,37,10,15,15,13]],[[9,30,2,15,3,7],[15,37,10,15,3,13]]],
  [[[15,17,0,9,4,14],[15,37,10,15,15,15]],[[15,17,4,3,9,12],[3,37,10,3,3,5]],[[4,18,5,11,15,8],[9,37,10,9,9,9]],[[9,16,0,3,15,6],[3,37,10,3,3,3]]],
  [[[15,19,0,3,9,12],[3,37,10,3,3,5]],[[9,23,0,15,3,9],[15,37,10,15,15,15]],[[9,30,2,3,15,11],[3,37,10,3,15,5]],[[3,16,0,15,9,6],[15,37,10,15,15,15]]],
  [[[3,16,0,9,14,6],[3,37,10,3,3,3]],[[15,17,4,3,9,12],[3,37,10,3,3,5]],[[9,14,4,3,15,9],[9,37,10,9,9,9]],[[9,18,0,15,3,11],[15,37,10,15,15,15]]],
  [[[3,14,0,8,11,14],[15,23,0,7,10,13],[12,34,0,3,7,9],[3,37,10,3,3,5]],[[10,4,0,3,3,6],[10,15,0,4,3,5],[14,27,0,9,5,3],[9,37,10,9,9,7]],[[3,3,0,11,10,8],[7,12,0,13,15,10],[8,22,0,13,15,11],[5,31,0,11,13,15],[9,37,10,9,9,11]],[[15,8,0,6,9,12],[13,19,0,6,8,3],[3,31,0,12,12,6],[15,37,10,15,15,13]]],
  [[[4,16,0,10,15,7],[15,29,0,6,10,8],[10,36,0,3,5,7],[3,37,10,3,3,5]],[[9,4,0,3,3,5],[14,12,0,7,4,3],[3,19,0,11,9,6],[8,26,0,14,15,13],[9,37,10,9,9,11]],[[3,3,0,9,12,6],[14,12,0,6,4,3],[10,20,0,3,4,7],[5,33,0,12,10,15],[15,37,10,15,15,15]],[[9,3,0,15,13,14],[6,11,0,12,13,9],[15,18,0,9,7,12],[3,19,0,9,7,12],[15,37,10,15,15,15]]],
  [[[3,16,0,15,9,12],[9,35,0,15,3,6],[3,37,10,15,3,6],[15,37,10,15,3,5]],[[9,4,0,15,3,3],[9,14,0,15,3,3],[9,23,0,15,3,3],[9,33,0,15,15,3],[15,37,10,15,15,3]],[[9,36,0,3,15,12],[3,37,10,3,15,13],[15,37,10,3,15,13]],[[9,5,0,3,15,15],[9,14,0,3,15,15],[9,24,0,3,15,15],[9,34,0,3,3,15],[3,37,10,3,3,15]]],
  [[[3,18,0,9,15,12],[9,35,0,3,15,12],[3,37,10,3,15,13],[15,37,10,3,15,13]],[[9,4,0,3,15,15],[9,13,0,3,15,15],[9,24,0,3,15,15],[9,34,0,3,3,15],[3,37,10,3,3,15]],[[9,35,0,3,15,12],[3,37,10,3,15,13],[15,37,10,3,15,13]],[[9,4,0,3,15,15],[9,14,0,3,15,15],[9,24,0,3,15,15],[9,33,0,3,3,15],[3,37,10,3,3,15]]],
  [[[2,17,2,7,12,3],[3,37,10,3,3,3]],[[9,17,2,4,15,11],[9,37,10,9,9,9]],[[2,17,2,6,15,9],[6,17,10,6,15,9],[10,17,2,6,15,9],[9,37,10,9,9,9]],[[15,17,2,9,4,15],[15,37,10,15,15,15]]],
  [[[16,18,2,10,5,14],[15,37,10,15,15,15]],[[8,18,2,12,3,14],[12,18,10,12,3,14],[16,18,2,12,3,14],[9,37,10,9,9,9]],[[9,18,2,15,3,11],[15,37,10,15,15,15]],[[9,30,2,3,15,11],[3,37,10,3,15,3]]],
  [[[3,17,2,9,14,3],[3,37,10,3,3,3]],[[15,17,2,3,9,13],[3,37,10,3,3,5]],[[9,16,2,3,15,7],[9,37,10,9,9,9]],[[9,19,2,3,15,11],[15,37,10,15,15,15]]],
  [[[15,18,2,9,4,15],[15,37,10,15,15,15]],[[15,20,2,3,9,13],[3,37,10,3,3,5]],[[3,20,2,9,14,5],[9,37,10,9,9,9]],[[9,20,2,3,15,11],[3,37,10,3,3,3]]],
  [[[3,15,4,14,10,8],[9,21,3,14,3,11],[9,37,10,9,9,9]],[[9,15,3,15,3,11],[15,37,10,15,15,15]],[[3,10,4,10,15,13],[9,26,3,3,14,7],[3,37,10,3,3,3]],[[9,18,4,3,15,7],[3,37,10,3,3,3]]],
  [[[3,15,4,14,10,6],[9,37,10,9,9,9]],[[9,15,3,14,3,3],[3,23,4,10,13,5],[3,37,10,3,3,3]],[[9,20,3,14,3,11],[9,37,10,9,9,9]],[[9,12,4,4,15,9],[15,21,4,8,5,9],[15,37,10,15,15,15]]],
  [[[3,16,4,9,14,3],[3,37,10,3,3,3]],[[9,18,4,3,15,6],[9,37,10,9,9,9]],[[2,18,2,9,14,3],[3,37,10,3,3,3]],[[3,17,11,15,9,3],[9,17,11,15,9,3],[15,17,11,15,9,3],[15,37,10,15,15,15]]],
  [[[3,17,4,9,14,6],[3,37,10,3,3,3]],[[3,17,4,15,3,9],[2,20,2,15,3,9],[6,20,2,15,3,9],[10,20,2,15,3,9],[3,37,10,3,3,3]],[[3,16,2,15,9,5],[15,37,10,15,15,15]],[[9,16,2,15,3,9],[9,37,10,9,9,9]]],
  [[[9,18,4,3,15,9],[3,37,10,3,3,3]],[[15,12,11,11,6,3],[9,18,11,15,9,3],[3,24,11,15,11,3],[15,37,10,15,15,13]],[[3,18,4,15,3,9],[2,21,2,15,3,9],[6,21,2,15,3,9],[10,21,2,15,3,9],[3,37,10,3,3,3]],[[3,18,2,9,14,3],[3,37,10,3,3,3]]],
  [[[9,17,4,3,15,7],[3,37,10,3,3,3]],[[3,18,2,9,15,5],[9,37,10,9,9,9]],[[9,17,4,15,3,10],[15,37,10,15,15,15]],[[3,17,11,3,9,15],[9,17,11,3,9,15],[15,17,11,3,9,15],[3,37,10,3,3,5]]],
  [[[15,17,4,3,9,12],[3,37,10,3,3,5]],[[15,12,11,3,9,15],[9,18,11,4,9,15],[3,24,11,8,9,15],[3,37,10,3,3,5]],[[15,18,4,3,15,9],[8,21,2,3,15,9],[12,21,2,3,15,9],[16,21,2,3,15,9],[15,37,10,15,15,15]],[[16,17,2,3,9,15],[3,37,10,3,3,5]]],
];
// An obstacle's half size across and along the belt, in columns, by type
// (0x8670BAE8; 6-9 are pillars and a Voltorb no course has)
export const BOX = [[3.5, 3.5], [1, 1.5], [2, 2.5], [3, 3], [4, 3], [5, 3], [3, 3.2], [4, 3.2], [5, 3.2], [4, 1], [3, 3], [3, 3]];

// The lane (0x86702B28 and the players' callback 0x867043AC)
export const COLUMN = 13.8; // 6 x 2.3 (0x8670C890)
export const LANE = 276; // 120 x 2.3, a belt and the gap to the next
const X0 = 13; // where column 0 is (the column's width, truncated: 0x8670C854)
const MARGIN = 63.75; // how near a belt's edge a Togepi gets (85 x 0.75: 0x8670B3CC)
export const START_X = 138; // the middle
export const RUNNER_Z = -280;
const FRONT = 144; // what's this far ahead is looked at (8 x 18: 0x8670C89C)
const DEPTH = 18; // a row's depth unit (0x8670B3C8)
const ROW_GAP = 702; // where a row comes on (18 x 39: 0x8670C8A0); the first at 400
const FIRST_ROW = 400;
const ROW_EVERY = 83.5; // px of track between one row and the next
const ROWS = 20;
export const SHOWN = 450; // an obstacle is drawn (and a Diglett's clock runs) once it's nearer than this
const GONE = -600; // and dropped past this
const SPEED = 0.32; // units a frame for each of the stick's down (0x8670BD9C)
const SIDE = 0.2; // and across (0x8670BD98)
export const SCROLL = 0.12; // px of track for each unit run (0x8670B384)
// The track (image bank 226, 32 x 2048: 64 tiles of 32 x 32): the belt shows
// four tiles from tile, px down; past END_TILE tiles and END_PX px the belt
// stops and the Togepi runs on off its end, to the goal at GOAL_Z
export const END_TILE = 56, END_PX = 20, GOAL_Z = -155;
const BOOST = 0.09, BOOST_SIDE = 0.028, BOOST_MAX = 0.75, BOOST_CAP = 0.3; // a dash (0x8670B350, 0x8670B354)
const DASH = 5.6; // % of the course a dash lasts
// Togepi's clips (object 109), frames: 0 waiting, 1 running, 2 knocked, 3
// tripped, 4 and 5 losing, 6 winning, 7 a dash's hop, 8 the goal
export const CLIP_LEN = [30, 35, 27, 59, 15, 25, 50, 11, 30];
export const CLIP = { idle: 0, run: 1, knock: 2, trip: 3, lose: 4, sad: 5, win: 6, hop: 7, goal: 8 };
// a Togepi's states (the player's 0x2C)
export const RUN = 0, FLOWERS = 1, TRIP = 2, KNOCK_S = 3, KNOCK = 4, JUMP = 10, DONE = 11, GOAL = 12;
const NONE = 1000;
// the CPUs (0x86702434, 0x86701C6C): by level (1 hard - 4) and mood (0-3)
const MOOD_SCALE = [5, 4, 3, 2]; // 0x8670BDC8
const PICK_FIRST = [null, [80, 75, 70, 65], [65, 55, 50, 45], [40, 35, 25, 20], [20, 17, 13, 10]]; // 0x8670B3E4
const PICK_LAST = [null, [15, 20, 20, 25], [20, 25, 30, 35], [30, 35, 40, 45], [60, 70, 80, 90]]; // 0x8670B424
const ARROW_RANK = [90, 70, 35, 25, 15]; // 0x8670BD84 (by rank 1-4)
const ARROW_LEVEL = [3, 25, 35, 60]; // 0x8670BD74 (by level 1-3)

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

// a COM level for the CPUs (easy, normal, hard): the game's 4 - the level
export const levelCode = (level) => 4 - (LEVELS[level] || 2);

// The round's course (0x8670211C): each section's pattern, and whether it's mirrored.
export function course(seed) {
  const r = quad(seed ^ 0x2545f491);
  const pattern = [], flip = [];
  const pick = [() => r() % 5, () => r() % 15, () => (r() % 10) + 5, () => (r() % 15) + 5, () => (r() % 5) + 15];
  for (let i = 0; i < 5; i++) {
    flip.push(r() % 100 >= 51 ? 1 : 0);
    let p;
    do p = pick[i](); while (pattern.includes(p));
    pattern.push(p);
  }
  return { pattern, flip };
}

// (s32) of a float, as the game's trunc.w.s
const trunc = (v) => Math.trunc(v);
// the sine of a binary angle (65536 a turn; for what's drawn)
const sine = (a) => Math.sin(((a & 0xffff) / 65536) * 2 * Math.PI);
// The way a Togepi faces for a stick x, y (0x86703D98): the stick's angle, its up
// taken as level (0x8000B390: atan2), a quarter turn on (+0xFFFF4000 as an s16 is
// +0x4000), so 0 is straight down the belt, to the camera. [the sine of that turn
// (the knocks' push aside: x / r), the turn]
export function facing(x, y) {
  y = Math.min(y, 0);
  const r = Math.sqrt(x * x + y * y);
  return [r ? x / r : 0, Math.atan2(y, x) + Math.PI / 2];
}

// One lane: a Togepi on its belt, from its player's stick frame by frame
// (step()), or a CPU's (level 1 hard - 4; seat: which belt, for a quirk of the
// game's). The scene reads it all.
export class Lane {
  constructor(seed, seat, course, level = 0) {
    this.seat = seat;
    this.course = course;
    this.level = level;
    const k = Math.imul(seat + 1, 0x9e3779b1);
    this.s2 = (seed ^ 0x5bd1e995 ^ k) >>> 0; // its random numbers' states (r2(), rl())
    this.sl = (seed ^ 0x27d4eb2f ^ k) >>> 0;
    this.x = START_X;
    this.z = RUNNER_Z;
    this.tile = 1; // the track, as the belt shows it
    this.px = 2;
    this.progress = 0; // % of the way (as the game works it out)
    this.state = RUN;
    this.jumpT = 0; // a dash's hops (0x38): frames into the hop, 0 when not dashing
    this.jumpEnd = 0; // the progress the dash ends at (0x84)
    this.boost = 0; // the dash's speed (0x5C; below 0 while it slows back down)
    this.boostSide = 0; // and across (0x58)
    this.slow = 1; // 0.3 in the flowers, back up to 1 (0x80)
    this.inFlowers = 0; // dashing through flowers (0x7C)
    this.arrow = 0; // stepped on an arrow: a dash next frame (0x64)
    this.dashT = 0; // frames into a dash's start (0x74)
    this.hop = 0; // a bounce over a log or a Diglett (0x68)
    this.spin = 0; // a somersault after a dash into the flowers (0x08)
    this.spinning = 0; // (0x48)
    this.side = 0; // the way the Togepi faces: sin of its turn (0 straight on, to the camera)
    this.turn = 0; // (and the turn, drawn: the game's +0x20, 0 the way it runs, down the belt)
    this.restart = 0; // the clip to set for the state (0x30)
    this.aura = 0; // the dash's glow fading in (1) or out (-1) (0x94)
    this.clip = CLIP.idle;
    this.frame = 0; // its clock, 1 a frame at speed 1
    this.speed = 1;
    this.animSpeed = 1; // the run's clip speed, by the stick (0x0C)
    this.row = 0; // the next row of the course (0x18)
    this.ring = 0; // the next obstacle slot (0x14)
    this.cycle = 0; // the Diglett' start times (0xA0)
    this.corridor = 0; // the CPU's way through patterns 7 and 8 (0xA4)
    this.finish = null; // the frame it reached the goal
    this.prior = null; // and its progress the frame before (the game ranks the ones in on the same frame by it)
    this.y = 80; // (drawn: the bounce)
    this.shadow = 1.5; // (drawn: its shadow's scale, smaller as it goes up)
    this.slots = [...Array(60)].map(() => ({ type: -1, x: 0, z: 3000, col: 0, n: 0, shown: false }));
    this.events = []; // [frame, what] for the scene and the sounds
    this.steps = 0; // (the footsteps' sounds this time round the clip)
    this.auraA = 0; // the dash's glow (alpha)
    this.glide = 0; // to the middle of the belt after the goal
    this.cpu = level ? this.cpuSetup() : null;
    this.rank = seat + 1; // (a CPU's, among the CPUs)
    this.finishers = 0; // (CPUs that have finished, for the CPUs)
    this.spawnRow(); // the first row's on before GO (0 px <= the 34 the track starts at)
  }

  // its random numbers: the game's two kinds (quad(), lcg())
  r2() { return (this.s2 = Math.imul(4 * this.s2 + 2, 4 * this.s2 + 3) >>> 2); }
  rl() { return (this.sl = (Math.imul(this.sl, 1664525) + 1013904223) >>> 0); }
  // all it is, to go back to (load())
  save() {
    const o = { ...this, slots: this.slots.map((s) => ({ ...s })), cpu: this.cpu && { ...this.cpu } };
    delete o.events;
    return o;
  }
  load(o) { Object.assign(this, o, { slots: o.slots.map((s) => ({ ...s })), cpu: o.cpu && { ...o.cpu } }); }

  // ---- the clip clock (the game's object animation: 0x8003F2F0 sets the
  // clip, 0x8003EC64 the frame the next one shows, 0x8003EC54 the speed;
  // 0x8003ED14 says it's at its last frame) ----
  setClip(c) { if (c !== this.clip) { this.clip = c; this.frame = 0; } }
  setFrame(f) { this.frame = f - this.speed; }
  done() { return this.frame >= CLIP_LEN[this.clip] - 1; }
  advance() {
    this.frame += this.speed;
    const len = CLIP_LEN[this.clip];
    if (this.frame >= len) this.frame -= len;
  }

  // A frame (t, from GO; playing: the race is on). sx, sy: the stick, -60-60 each
  // (right and up), a person's; a CPU steers itself.
  step(t, sx = 0, sy = 0, playing = true) {
    // the aura's alpha (0x8670427C): down 10 a frame to 70, or out; never over 200
    if (this.aura === 1 && (this.auraA -= 10) < 71) { this.auraA = 70; this.aura = 0; }
    else if (this.aura === -1 && (this.auraA -= 10) < 21) { this.auraA = 0; this.aura = 0; }
    if (this.auraA > 200) this.auraA = 200;
    if (this.auraA < 5) this.auraA = 0;
    if (this.cpu) this.think(playing);
    if (this.state === GOAL) { // running on off the belt (drawn)
      const f = Math.floor(this.frame + 1e-9);
      // gliding to the middle, turned the way it goes (0x867048B8: 0x86703D98(glide x 5, -45))
      this.turn = this.frame < 8 && this.glide ? facing(trunc(this.glide * 5), -45)[1] : 0;
      if (this.frame < 8 && this.glide) this.x += this.glide;
      if (this.frame < 12) {
        this.z += 30 * (SPEED + 1.6 * this.boost);
        this.shadow = 1.5 - 1.5 * sine((f + 1) * 0xaaa); // (its goal's jump: 0x86704948)
      }
    }
    let v = this.dashT;
    if (v > 0) {
      if (v === 3) this.events.push([t, "dash"]);
      v = ++this.dashT;
    }
    if (v >= 11) this.dashT = 0;
    // a bounce (0x86704A50): up and down, its shadow smaller; its last frame (11) sets it a
    // little lower than it started, and it stays there till a dash runs into something
    v = this.hop;
    if (v > 0) {
      v = ++this.hop;
      this.y = sine(v * 0xccc) * 60 + 80;
      this.shadow = 1.5 - 1.5 * sine(v * 0xccc);
    }
    if (v >= 11) v = this.hop = 0;
    if (v === 5) { this.boost = 0.05; this.boostSide = 0.01; }
    if (playing && (this.state === RUN || this.state === FLOWERS || this.state === JUMP)) this.move(t, sx, sy);
    // the state's clip
    if (this.restart) {
      switch (this.state) {
        case JUMP: this.restart = 0; break;
        case RUN: this.shadow = 1.5; // (its shadow back: 0x86706024)
        // fallthrough
        case FLOWERS: this.setClip(CLIP.run); this.speed = this.animSpeed; break;
        case KNOCK_S: case KNOCK: this.setClip(CLIP.knock); this.speed = 2; this.setFrame(0); this.restart = 0; break;
        case TRIP: this.setClip(CLIP.trip); this.speed = 2; this.setFrame(0); this.restart = 0; break;
      }
    }
    // knocked back (by the clip's frame): thrown on along the belt, and aside
    let a1 = 0, a2 = 0;
    const f = Math.floor(this.frame + 1e-9);
    if ((this.state === KNOCK_S || this.state === KNOCK) && !this.spinning) {
      if (f === 2 || f === 3) this.events.push([t, "knock"]);
      a2 = f < 5 ? -75 : f < 24 ? -7 : 0;
      a1 = trunc(this.side * a2);
    }
    if (this.state === TRIP && !this.spinning) {
      if (f === 2) this.events.push([t, "knock"]);
      if (f < 3) a2 = -180;
      else if (f < 13) a2 = -18;
      else if (f === 40) { this.restart = 1; this.state = RUN; }
      this.side = this.turn = 0;
    }
    if (a1 || a2) {
      const d = a2 * (this.boost + SPEED) * this.slow;
      for (const o of this.slots) o.z += d;
      this.px += -a2 * (this.boost + SPEED) * SCROLL * this.slow;
      this.rollTrack();
      this.x -= a1 * (SIDE + this.boostSide);
      if (this.x < MARGIN) this.x = MARGIN;
      if (this.x > LANE - MARGIN - 10) this.x = LANE - MARGIN - 10;
    }
    // a clip's end
    if (this.done()) {
      switch (this.state) {
        case JUMP: this.state = RUN; this.restart = 1; break;
        case FLOWERS: if (this.jumpT) this.spin = 1; this.state = RUN; break;
        case GOAL: this.restart = 1; this.y = 80; this.setClip(CLIP.idle); this.state = DONE; this.events.push([t, "done"]); break;
        case RUN: this.setClip(CLIP.idle); this.restart = 0; break;
        case DONE: break;
        default: this.setClip(CLIP.idle); this.restart = 0; if (!this.spin) this.spin = 1;
      }
    }
    // the next row of the course, when the belt gets there
    if (this.row * ROW_EVERY <= this.tile * 32 + this.px && this.row < ROWS) this.spawnRow();
    if (this.spin) this.spinOn();
    this.advance();
    this.tick(playing);
  }

  // what the stick does (the play's part of 0x867043AC)
  move(t, sx, sy) {
    let D0 = sx, CC = sy;
    if (this.cpu) D0 = this.cpu.steer;
    let a = this.jumpT;
    if (a > 0) a = ++this.jumpT;
    else this.boostSide = 0;
    if (a === 0 && this.arrow && this.state === RUN) { // an arrow: a dash
      this.dashT = 1;
      this.jumpT = a = 1;
      this.jumpEnd = this.progress + DASH;
      this.boost += BOOST;
      this.boostSide += BOOST_SIDE;
      this.aura = 1;
      this.auraA = 255;
      this.arrow = 0;
      this.events.push([t, "arrow"]);
    }
    if (D0 > 60) D0 = 60;
    if (D0 < -60) D0 = -60;
    if (this.cpu) CC = (Math.abs(D0) * 15) / 60 - 60;
    if (CC < -60) CC = -60;
    CC *= 0.75;
    D0 *= 0.75;
    if (a !== 0) {
      if (this.jumpEnd < this.progress) { // the dash is over
        this.aura = -1;
        this.boost = -0.01;
        this.boostSide = 0;
        if (this.done()) this.jumpT = 0;
      } else if (this.done()) this.jumpT = 1;
    }
    if (this.boost < 0) { // slowing back down (unless running anyway)
      if (this.done()) { this.state = RUN; this.restart = 1; }
      if (this.boost + SPEED <= 0.01) this.boost = 0;
      else this.boost -= 0.01;
      if (CC * SPEED <= (this.boost + SPEED) * -35) this.boost = 0;
      else CC = -35;
    }
    const dashT = this.dashT;
    if (this.jumpT) { this.side = this.turn = 0; CC = -45; }
    if (dashT < 3) CC -= dashT * 15;
    let fwd = 0, lat = 0;
    if (CC < -5) fwd = 1; else CC = 0;
    if (D0 > 5 || D0 < -5) lat = 1; else D0 = 0;
    if (this.collide(t, (this.boostSide + SIDE) * D0 * lat, (this.boost + SPEED) * fwd * CC) > 0) {
      if (this.jumpT === 1) { this.state = JUMP; this.setClip(CLIP.hop); this.setFrame(0); this.speed = this.boost + 1; }
      if (this.state === FLOWERS && this.jumpT === 0) this.slow = 0.3;
      if (this.inFlowers === 1) this.slow = 0.3;
      if (this.slow < 1) {
        if (this.jumpT === 0 && this.state === RUN) this.slow = 1;
        if (this.inFlowers === 0) this.slow += 0.1;
        if (this.slow > 1) this.slow = 1;
      }
      if (fwd) {
        const d = CC * (SPEED + this.boost) * this.slow;
        if (this.tile > END_TILE && this.px > END_PX) this.z -= d; // off the belt's end
        else this.px -= d * SCROLL;
        for (const o of this.slots) o.z += d;
        this.rollTrack();
        const was = this.progress;
        this.measure();
        for (const o of this.slots) if (o.z < GONE) Object.assign(o, { type: -1, z: 3000, shown: false });
        if (this.finish === null && this.tile > END_TILE && this.px >= END_PX && this.z >= GOAL_Z) {
          this.finish = t;
          this.prior = was;
          if (this.cpu) this.progress = 120 - 3 * this.rank; // (keeping its place)
          this.side = this.turn = 0;
          this.glide = Math.abs(this.x - START_X) > LANE / 2 - MARGIN - 30 ? (START_X - this.x) / 10 : 0;
          this.setClip(CLIP.goal);
          this.state = GOAL;
          this.aura = -1;
          this.events.push([t, "goal"]);
        }
      }
      if (lat) {
        this.x += D0 * (SIDE + this.boostSide) * this.slow;
        if (this.x < MARGIN) this.x = MARGIN;
        if (this.x > LANE - MARGIN - 4) this.x = LANE - MARGIN - 4;
      }
    }
    if (this.jumpT === 0) this.restart = 1;
    this.animSpeed = this.state === JUMP ? 1 : Math.max(1, trunc(Math.max(Math.abs(CC), Math.abs(D0)) / 9));
    // facing the way it runs; or, the stick let go, back to about straight on, as the
    // game's (1, -45) gives (0x86705DC0-0x86705F48)
    if (this.jumpT === 0) [this.side, this.turn] = CC < -5 || D0 > 5 || D0 < -5 ? facing(trunc(D0), trunc(CC)) : facing(1, -45);
    if ((this.state === RUN || this.state === FLOWERS) && (this.clip === CLIP.run)) { // footsteps (0x8670408C)
      const f = Math.floor(this.frame + 1e-9);
      if (f < 10) this.steps = 0;
      if (f >= 14 && !(this.steps & 1)) { this.steps |= 1; this.events.push([t, this.state === FLOWERS ? "flowerStep" : "step"]); }
      if (f >= 32 && !(this.steps & 2)) { this.steps |= 2; this.events.push([t, this.state === FLOWERS ? "flowerStep" : "step"]); }
    }
  }

  // the belt's track: a tile's 32 px on (0x867007B4)
  rollTrack() {
    while (this.px >= 32) {
      this.tile++;
      this.px -= 32;
      if (this.tile >= END_TILE && END_PX <= this.px) this.px = END_PX + 1;
      if (this.tile >= 62) this.tile = 0;
    }
  }
  // the progress, as the game works it out (it halves in what it had, below 66%)
  measure() {
    let f0 = (RUNNER_Z - this.z) * SCROLL, n = 58;
    while (f0 < 0) { f0 += 32; n--; }
    const denom = n * 32 - 1 + f0, at = this.tile * 32 - 1 + this.px;
    this.progress = this.progress <= 66 ? ((this.progress / 2 + at - 33) / denom) * 100 : (at / denom) * 100;
  }

  // Would moving dx, dz bump into something? (0x867037B8) 1: move; -1: not
  // this frame. What it bumps into does its thing (and is gone, mostly).
  collide(t, dx, dz) {
    if (this.hop > 0) return 1;
    if (this.state !== JUMP) this.state = RUN;
    this.inFlowers = 0;
    const front = this.z + FRONT, px = this.x + dx * 2, pz = this.z - dz * 2;
    for (const o of this.slots) {
      const type = o.type;
      if (type < 0 || o.z > front) continue;
      const hx = BOX[type][0] * COLUMN, hz = BOX[type][1] * COLUMN;
      if (!(pz < hz + o.z && o.z - hz < pz && px < hx + o.x && o.x - hx < px)) continue;
      if (this.jumpT > 0) { // dashing
        if (type === ARROW) { // on into another
          this.aura = 1;
          this.auraA = 255;
          this.dashT = 1;
          this.jumpEnd = this.progress + DASH;
          let s = this.boost + SPEED;
          if (s < BOOST_MAX) { this.boost += BOOST; s = this.boost + SPEED; }
          if (s > BOOST_MAX) this.boost = BOOST_CAP;
          else this.boostSide += BOOST_SIDE;
          this.events.push([t, "arrow"]);
        } else if (type === DIGLETT) {
          if (o.n < 7 || o.n >= 27) return 1; // in its hole
          if (o.n < 13) { this.events.push([t, "bounce"]); this.hop = 1; } // coming up: bounced over
          else this.knocked(); // up: knocked
        } else if (type === ROCK_S || type === ROCK) this.knocked();
        else if (type === LOG_S || type === LOG_M || type === LOG_L) { this.events.push([t, "bounce"]); this.hop = 1; }
        if (type !== FLOWER) Object.assign(o, { type: -1, shown: false }); // (gone)
        else this.inFlowers = 1;
        this.y = 80;
        return 1;
      }
      switch (type) { // running
        case FLOWER: this.state = RUN === this.state ? FLOWERS : this.state; break;
        case ROCK_S: this.state = KNOCK_S; break;
        case ROCK: this.state = KNOCK; break;
        case DIGLETT:
          if (o.n < 7 || o.n >= 27) return 1;
          if (o.n < 13) { this.events.push([t, "bounce"]); this.hop = 1; } else this.state = KNOCK;
          break;
        case LOG_S: case LOG_M: case LOG_L: this.state = TRIP; break;
        case ARROW: this.arrow = 1; break;
      }
      if (this.state === FLOWERS) return 1; // (slowed, not stopped)
      if (type !== DIGLETT) Object.assign(o, { type: -1, shown: false });
      if (this.state === KNOCK || this.state === KNOCK_S || this.state === TRIP) this.events.push([t, "hit", type]);
      if (this.cpu) this.cpu.target = this.nearest(1);
      return -1;
    }
    return 1;
  }
  knocked() {
    this.state = KNOCK;
    this.jumpT = 0;
    this.aura = -1;
    this.boost = 0;
    this.boostSide = 0;
  }

  // a somersault: a dash into the flowers (0x86703DF4)
  spinOn() {
    let most = 0;
    if (this.jumpT) { this.spinning = 1; most = 32; }
    this.spin++;
    if (most < this.spin) {
      this.spin = 0;
      this.state = RUN;
      this.jumpT = 0;
      this.spinning = 0;
      return;
    }
    this.side = 0;
    this.turn = this.spin * Math.PI / 8; // (a somersault: 0x1000 a frame)
  }

  // the course's next row onto the belt (0x86702E50)
  spawnRow() {
    const base = this.row === 0 ? FIRST_ROW : ROW_GAP, sec = this.row >> 2;
    const idx = this.course.pattern[sec] * 4 + (this.row - 4 * sec), flip = this.course.flip[sec];
    const cpu = this.cpu, level = this.level, mood = cpu ? cpu.mood : -1;
    if (idx === 28 || idx === 32) this.corridor = this.rl() % 3;
    for (const e of PATTERNS[idx >> 2][idx & 3]) {
      const o = this.slots[this.ring];
      let [col, depth, type, a, b, c] = e;
      if (flip) { col = 18 - col; a = 18 - a; b = 18 - b; c = 18 - c; }
      // which way a CPU means to go round it (a column), with a quirk: the
      // second choice lands on the obstacle in slot <seat> instead
      o.col = a;
      const r = this.rl() % 101;
      if (r >= (level ? PICK_FIRST[level][mood] : 0)) this.slots[this.seat].col = b;
      if (r < (level ? PICK_LAST[level][mood] : 20)) o.col = c;
      if (idx >= 28 && idx < 36) o.col = [a, b, c][this.corridor];
      if (cpu?.lazy) o.col = this.progress > 50 ? a : c;
      if (this.finishers) o.col = a;
      o.type = type;
      if (type === DIGLETT) {
        let v = this.cycle + (this.rl() & 1) + 1;
        this.cycle = v;
        if (v >= 3) this.cycle = v = 0;
        o.n = v * 18;
      } else o.n = 0;
      o.z = depth * DEPTH + base;
      o.x = X0 + col * COLUMN;
      o.shown = o.z < SHOWN;
      this.ring = (this.ring + 1) % 60;
    }
    this.row++;
  }

  // after the frame's drawing: the Diglett' clocks (0x8670018C), and what's come near enough to draw
  tick(playing) {
    for (const o of this.slots) {
      if (o.type === DIGLETT && o.shown) {
        if (o.n >= 72) o.n = 0;
        if (o.n / 3 >= 12 && playing) o.n += this.rl() & 1;
        o.n++;
      }
      if (o.type >= 0 && !o.shown && o.z < SHOWN) o.shown = true;
    }
  }
  // a Diglett's picture (image bank 205: 0 its hole, 5 all the way up), by its clock
  static digFrame(n) {
    const k = Math.floor(n / 3);
    return k >= 12 ? 0 : k >= 6 ? 11 - k : k;
  }

  // ---- a CPU ----
  // its ways, by its level (0x86702434)
  cpuSetup() {
    const L = this.level, u = () => this.rl() / 4294967296;
    const c = { mood: this.r2() % 4, mode: 0, side: 0, sideCopy: 0, steer: 0, target: 0, pref: 0 };
    c.lazy = (this.rl() & 3) < 3 ? 0 : 1;
    const s = () => MOOD_SCALE[c.mood];
    if (L === 1) {
      c.look = (this.r2() % 50) + 250; c.margin = 25 - (this.r2() % 10); c.count = 4;
      c.gain = s() * (u() * 0.3) + 1.5; c.thr = s() * (u() * 0.5) + 4.0;
    } else if (L === 2) {
      c.look = (this.r2() % 50) + 200; c.margin = 25 - (this.r2() % 10); c.count = 3;
      c.gain = s() * (u() * 0.2) + 1.3; c.thr = s() * (u() * 0.2) + 3.5;
    } else if (L === 3) {
      c.look = (this.r2() % 10) * 5 + 150; c.margin = 30 - (this.r2() % 10); c.count = 2;
      c.gain = s() * (u() * 0.15) + 1.15; c.thr = s() * (u() * 0.15) + 2.8;
    } else {
      c.look = (this.r2() % 10) * 5 + 120; c.margin = 30 - (this.r2() % 10); c.count = 1;
      c.gain = s() * (u() * 0.15) + 1.0; c.thr = s() * (u() * 0.15) + 2.2;
    }
    c.pref = this.r2() % 100 >= 51 ? 1 : -1;
    return c;
  }
  slot(i) { return i >= 0 && i < 60 ? this.slots[i] : { type: -1, z: Infinity, x: 0, col: 0 }; }
  // the nearest obstacle ahead (0x86700FD4): within 30 columns (any: 1),
  // else (0) the one it had
  nearest(any) {
    let lim = any ? 1000 : this.z + 30 * COLUMN, best = NONE;
    this.slots.forEach((o, i) => { if (o.z <= lim && this.z <= o.z && o.type >= 0) { best = i; lim = o.z; } });
    return !any && best === NONE ? this.cpu.target : best;
  }
  // what to go for while dashing (0x8670122C): the nearest thing, an arrow
  // only now and then (less often the better it's placed)
  dashTarget() {
    const c = this.cpu;
    let lim = c.look + this.z - (this.rank === 1 ? 150 : 0), best = NONE;
    for (let i = 0; i < 60; i++) {
      const o = this.slots[i];
      if (!(o.z <= lim && this.z <= o.z) || o.type < 0) continue;
      if (this.level === 4) return i;
      if (o.type === ARROW) {
        let r = this.rl() % 101;
        if (c.lazy && this.progress > 50) r = 100;
        if (ARROW_RANK[this.rank] + ARROW_LEVEL[this.level] < r || this.finishers !== 0) { best = i; lim = o.z; }
      } else { best = i; lim = o.z; }
    }
    return best === NONE ? c.target : best;
  }
  // its stick, each frame (0x86701C6C)
  think(playing) {
    const c = this.cpu;
    if (!playing) return;
    if (this.jumpT > 0 && c.mode < 2) c.target = this.dashTarget();
    let a = c.target;
    if ((a === NONE || this.slot(a).type < 0) && this.jumpT === 0) a = c.target = this.nearest(0);
    if (a === NONE || this.slot(a).type < 0) { c.steer = 0; return; }
    c.steer = 0;
    const o = this.slot(a), x1 = this.x;
    let rz = this.z;
    if (o.z < c.look + rz) { // near: round it
      c.pref = this.r2() % 100 >= 51 ? 1 : -1;
      c.side = 0;
      if (this.avoid(a, o.z, x1)) { c.target = this.nearest(0); c.side = 0; c.steer = 0; }
      rz = this.z;
    } else { // far: drift, off the edges
      let v = (3 - c.mode) * 10;
      if (x1 < v + MARGIN) { c.pref = 1; v = c.mode * -10 + 30; }
      if (LANE - MARGIN - v < x1) c.pref = -1;
      c.steer = (c.mode + 1) * c.pref * 10;
    }
    if (this.slot(c.target).z < rz) { // gone by
      c.steer = 0;
      if (this.jumpT === 0 || rz < 100) c.target = this.nearest(1);
    }
  }
  // steer for the column it chose round obstacle i (0x86701874; the game's
  // own sums, odd ones and all); true when it's there (it puts itself there)
  avoid(i, z0, x1) {
    const c = this.cpu, o = this.slots[i], cx = o.col * COLUMN;
    if (x1 < cx) c.side = 1; else if (cx < x1) c.side = -1;
    let dz = z0 - this.z;
    if (dz === 0) dz = 1;
    c.sideCopy = c.side;
    if (c.side > 0) {
      if (-c.thr < (cx - x1) / dz) c.steer = trunc(c.gain * Math.abs(o.col * COLUMN + x1));
    } else if ((o.col * COLUMN + x1) / dz < c.thr) c.steer = trunc(c.gain * -Math.abs(cx - x1));
    if (this.z <= (BOX[o.type][1] + 1) * COLUMN + z0) {
      if (c.sideCopy === 1 ? cx < x1 : x1 < cx) { this.x = cx; return true; }
    }
    return false;
  }
}

// The CPUs' ranks among themselves (0x867097D8), from their progress; and how many have finished.
export function rankCpus(lanes) {
  const cpus = lanes.filter((l) => l && l.cpu);
  const done = cpus.filter((l) => l.finish !== null).length;
  for (const l of cpus) {
    l.rank = 1 + cpus.filter((m) => m.progress > l.progress).length;
    l.finishers = done;
  }
}
// The places: by the frame each finished, the ones in on the same frame by their
// progress the frame before (the game's ranks then: 0x867097D8, which the finish
// keeps as 120 - 3 x rank, 0x86705960), then (if the race was called) by how far
// each got; ties share a place. fin, prior and prog: each seat's.
export function placesOf(fin, prior, prog) {
  const key = (z) => (fin[z] !== null ? [0, fin[z], -(prior[z] ?? 0)] : [1, -prog[z], 0]);
  const before = (a, b) => a[0] < b[0] || (a[0] === b[0] && (a[1] < b[1] || (a[1] === b[1] && a[2] < b[2])));
  return fin.map((f, z) => 1 + fin.filter((g, y) => before(key(y), key(z))).length);
}
export const places = (lanes) => placesOf(lanes.map((l) => l.finish), lanes.map((l) => l.prior), lanes.map((l) => l.progress));

// A finish's time in hundredths of a second, as the game works out the first
// one's (0x86703F9C): its frames in whole seconds, the rest x 100 / 30 (cut), and
// 0-2 more at random (rand_lcg % 3; here from the round's seed and the seat, so
// the same everywhere)
export function timeOf(f, seed, seat) {
  const r = (Math.imul((seed ^ 0x68e31da4 ^ Math.imul(seat + 1, 0x9e3779b1)) >>> 0, 1664525) + 1013904223) >>> 0;
  return Math.floor(f / FPS) * 100 + Math.floor(((f % FPS) * 100) / FPS) + (r % 3);
}
