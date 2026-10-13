// Rampage Rollout's rules, as the game's code module (#52) has them
// (docs/minigames.md has where each number is). Everything counts in the
// game's frames, 30 a second, and its units: the track lies in the plane
// y = 0 (x across, z towards the camera), round a block in the middle.
//
// Four Donphan race round the track, the other way round from a clock seen
// from above: along the top to the left, down the left side, along the
// bottom to the right and up the right side. The D-pad turns a Donphan
// (only a quarter turn at a time, and never back the way it came); it runs
// on by itself, faster the further back it is. A wall it runs into turns it
// the way the track goes. A drops a dust cloud: a whirlwind that sends
// whoever runs into it flying (not its owner). A Donphan earns clouds at each
// lap by its place (none for the leader, up to three for the last), and on
// the final lap a cloud also sends it off at full tilt, knocking over those
// it runs into. Nine laps; the first in wins.
//
// The four share one world, so it runs from everyone's pads at once and the
// CPUs think in it as the game's do. Every device and the server run the same
// world from the same pads (online, devices run it again from a saved frame
// when someone's pad comes in late: game.js). So it never uses Math.atan and
// the like, whose last bits can differ between browsers and Python, only
// + - * / and sqrt in the same order. tools/rollout_rules.py is the rooms
// server's copy: keep the two the same.

export const FPS = 30;
export const LEVELS = { easy: 1, normal: 2, hard: 3 };

// The game's tuning (its debug menu's, set at 0x86407610)
export const SPEED = 556.8 / 60; // "SPEED": the most a Donphan runs in a frame (the last one's)
const ACCELE = 51 / 60; // "ACCELE"
export const LAPS = 9; // "LAP"
const ACCEL = (ACCELE * 0.22 * 60) / 60; // what it speeds up by in a frame (0x86402B1C)
const TOP = [0.85, 0.9, 0.95, 1]; // its top speed, by its place (SPEED times this)
const KNOCKED_SLOW = [0.9, 0.92, 0.95, 0.95]; // a knocked-over one slows by this, by place
const DIZZY_FOR = [20, 14, 8, 8]; // frames a cloud sends it flying for, by place (20, x0.7, x0.4)
const KNOCKED_FOR = 20; // and a bump at full tilt knocks it over for

export const R = 23.2; // a Donphan's radius
export const INNER = [148, 92.5]; // the block in the middle: x and z either way
export const OUTER = [309.8, 254.3]; // how far a Donphan's middle goes: the walls less R
const CORNER = [124.8, 69.3]; // the four corners' zones (past these, both ways)
export const CLOUD_R = 30; // a cloud catches a Donphan whose middle is closer than this
export const CLOUD_FOR = [5, 175, 10]; // frames a cloud comes up, stays, and fades for
const START_FOR = 10; // frames after GO a press of A is a rocket start
const ROLL_FOR = 30; // frames it rolls after one
export const LONGEST = 200 * FPS; // (made for the remake: the race is called by then, if it isn't over)

// Each D-pad direction (0x864095F8-0x8640961C: the way, and the angle it faces):
// up (-z), down (+z), left (-x), right (+x), in the order the game picks them
export const UP = 8, DOWN = 4, LEFT = 2, RIGHT = 1, A = 0x8000; // (the pad's bits, >> 8)
const DIRS = [[UP, 0, -1, 0x7fff], [DOWN, 0, 1, 0], [LEFT, -1, 0, 0xbfff], [RIGHT, 1, 0, 0x3fff]];
const WAY = { [UP]: DIRS[0], [DOWN]: DIRS[1], [LEFT]: DIRS[2], [RIGHT]: DIRS[3] };
// The track's parts (0x86404824): 0-3 the corners (top left, bottom left,
// bottom right, top right), 4-7 the sides (left, right, top, bottom). In each,
// the directions that would go back (0x86402158), and the way the race goes
// (0x86409628)
const NOT = [UP | RIGHT, UP | LEFT, DOWN | LEFT, DOWN | RIGHT, UP, DOWN, RIGHT, LEFT];
export const ALONG = [DOWN, RIGHT, UP, LEFT, DOWN, UP, LEFT, RIGHT].map((d) => [WAY[d][1], WAY[d][2]]);
const CORNER_BIT = [1, 2, 8, 4]; // (0x100000, 0x200000, 0x800000, 0x400000: each corner passed this lap)

// The block's edges (0x86409688: from one corner to the next, their normals
// out, and the way a Donphan running into one is turned) and its corners
// (0x864096E8), which a Donphan slides round as round a post
const BLOCK = [[-148, -92.5], [-148, 92.5], [148, 92.5], [148, -92.5]];
const EDGES = [[0, 1, DOWN], [1, 2, RIGHT], [2, 3, UP], [3, 0, LEFT]].map(([a, b, turn]) => {
  const dx = BLOCK[b][0] - BLOCK[a][0], dz = BLOCK[b][1] - BLOCK[a][1];
  return { a, dx, dz, n: norm(-dz, dx), turn };
});
const POSTS = BLOCK.map((p, i) => ({ i, n: norm(p[0], p[1]) }));

// The CPUs, by level (the COM level byte: 1 Easy, 2 Normal, 3 Hard): how
// likely they are to drop a cloud in each part of the track (0x86409648,
// times this: 0x86403CDC)
const DROP = [0.05, 0.1, 0.2, 0.5, 0.001, 0.01, 0.01, 0.01];
const DROP_LEVEL = [0.2, 0.7, 1, 1];

const U = 4294967296;

// the level the game plays (with four people, the CPUs' don't matter)
export function levelCode(level, cpus) { return cpus.some((c) => c) ? LEVELS[level] || 2 : 1; }

function norm(x, y) {
  const d = Math.sqrt(y * y + x * x);
  return d !== 0 ? [x / d, y / d] : [x, y];
}
// where p + t d1 meets q + s d2 (0x87D00670): [t, s], or null if they're parallel
function meet(px, py, d1x, d1y, qx, qy, d2x, d2y) {
  const a = d1y * d2x, b = d1x * d2y;
  if (a === b) return null;
  const s = (d1y * (px - qx) + d1x * (qy - py)) / (a - b);
  const t = (d2x * (py - qy) + d2y * (qx - px)) / (b - a);
  return [t, s];
}
// how far p is from the line through q along d (0x87D00720)
function apart(px, py, qx, qy, dx, dy) {
  const ex = qx - px, ey = qy - py, l2 = dx * dx + dy * dy;
  let ox = ex, oy = ey;
  if (l2 !== 0) {
    const t = -(dx * ex + ey * dy) / l2;
    ox = dx * t + ex;
    oy = dy * t + ey;
  }
  return Math.sqrt(ox * ox + oy * oy);
}
// The main program's arctangent table (0x8008CFB0: atan(i / 1024) in 65536ths
// of a turn, for i 0-1024), made the same way everywhere: atan halved twice
// (with sqrt), then its series
const ATAN = [];
for (let i = 0; i <= 1024; i++) {
  let x = i / 1024, k = 1;
  for (let j = 0; j < 2; j++) { x = x / (1 + Math.sqrt(1 + x * x)); k *= 2; }
  let term = x, sum = x;
  const x2 = x * x;
  for (let n = 1; n < 12; n++) { term = -term * x2; sum += term / (2 * n + 1); }
  ATAN.push(Math.round(((sum * k) / (2 * 3.141592653589793)) * 65536));
}
export { ATAN };
const look = (y, x) => (x === 0 ? ATAN[0] : ATAN[Math.trunc((y / x) * 1024 + 0.5)]);
// The main program's sine table (0x80087FB0: float32s, 4096 to a turn, 5120 of
// them, so 1024 on is the cosine), made the same way everywhere: by its series
// in a quarter turn, to the nearest float32 (it's the table, every entry)
export function sine(i) {
  const q = (i >> 10) & 3, x = ((i & 1023) * (2 * 3.141592653589793)) / 4096, x2 = x * x;
  const s = q % 2 === 0 ? 1 : 0; // (the sine's series in the 1st and 3rd quarters, the cosine's in the others)
  let term = s ? x : 1, sum = term;
  for (let n = 1; n < 14; n++) {
    const k = 2 * n + s;
    term = (-term * x2) / ((k - 1) * k);
    sum += term;
  }
  const v = Math.fround(q < 2 ? sum : -sum);
  return v === 0 ? 0 : v;
}
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
const s16 = (v) => (((v & 0xffff) ^ 0x8000) - 0x8000);

// One race's world. cpus: which seats are CPUs; empty: which have no one in
// them at all (the remake's, online with the CPUs off: no Donphan there, so it
// takes no part, and the places, and what goes by them, are among those there);
// step() runs a frame from the people's pads. The scene reads it all.
export class World {
  constructor(seed, level = "normal", cpus = [false, true, true, true], empty = [false, false, false, false]) {
    this.level = levelCode(level, cpus);
    this.seed = seed >>> 0; // the game's random numbers' state (rnd())
    this.t = -1; // the last frame run
    this.end = null; // the frame the race ended on: everyone's in (or it's called)
    this.ids = 0;
    this.clouds = [];
    this.events = [];
    // the starting grid (0x864057E0): the four places shuffled, each one in
    // further and lower down than the last, along the top
    // (it swaps two at random while k < a new random number each time)
    const slots = [0, 1, 2, 3];
    if ((this.rnd() % 101) * 4 !== 0) {
      let k = 0;
      do {
        const i = this.rnd() & 3, j = this.rnd() & 3, s = slots[i];
        slots[i] = slots[j];
        slots[j] = s;
        k++;
      } while (k < (this.rnd() % 101) * 4);
    }
    // each Donphan, with what the game keeps for each player (0x8641778C); its
    // rank at first its seat's (among those there: an empty seat's after them)
    const n = [0, 1, 2, 3].filter((z) => !empty[z]).length;
    this.first = [0, 1, 2, 3].find((z) => !empty[z]) ?? 0; // (the seat whose stop moves the camera at the end: 1P's, if there)
    this.d = slots.map((slot, z) => ({
      z, human: !cpus[z], slot, empty: !!empty[z],
      x: slot * 37.12 + 116, h: 0, y: slot * 41.76 + -254.3, // (y: the game's z, down the screen)
      vx: -1, vz: 0, vh: 0, rot: -0x4001, timer: 0,
      start: true, tumble: false, knocked: false, bounce: false, ready: false, drop: false, done: false, won: false, fin: null,
      corners: 0, seg: 0, laps: LAPS, progress: 0, speed: 20,
      rank: empty[z] ? n + empty.slice(0, z).filter((e) => e).length : empty.slice(0, z).filter((e) => !e).length, boost: 0, roll: 0, stun: 0, wait: 0,
      clouds: 0, out: 0, target: -16385, angle: -16385, notice: 0, lane: 0, px: 0, ph: 0, py: 0,
      halt: null, // (the frame it came to a stop once it was over: 0x20000)
    }));
    for (const d of this.d) { d.lane = this.laneRoll(); d.notice = this.noticeRoll(); }
    // the countdown: they run in to their places and stop (0x864055CC)
    for (let k = 0; k < 20; k++) this.runIn();
  }
  // the game's random numbers (0x800357EC: x * 1664525 + 1013904223)
  rnd() { return (this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0); }
  u() { return this.rnd() / U; }

  // a CPU's line round the track: off the inside by this, new in each part of
  // the track (0x86404724: Easy up to 2R either way, Normal and Hard right
  // along it), and how old a cloud must be before it steers round it
  // (0x86403550: Easy 52-87 frames, Normal 35-87, Hard any)
  laneRoll() {
    return this.level === 1 ? 2 * ((2 * this.u() - 1) * R) : 0;
  }
  noticeRoll() {
    let k = 0;
    if (this.level === 1) k = this.u() * 0.2 + 0.3;
    else if (this.level === 2) k = this.u() * 0.3 + 0.2;
    return Math.trunc(175 * k);
  }
  // in the countdown, before frame 0: slowing to a stop on the grid
  runIn() {
    for (const d of this.d) {
      if (d.empty) continue;
      d.speed *= 0.8;
      d.x += d.vx * d.speed;
      if (d.speed < 1) d.speed = 0;
    }
  }

  // ---- a frame of the race (0x86404D8C, then the clouds and the walls, 0x864066B4) ----
  // pads: each person's [D-pad (UP | DOWN | LEFT | RIGHT, held; + 16: A was
  // pressed in the countdown), A pressed this frame] (null: none)
  step(t, pads = []) {
    this.t = t;
    if (this.end !== null) { this.coast(); return; }
    for (const d of this.d) {
      if (d.empty) continue;
      this.segment(d);
      let input;
      if (d.human) {
        const [dpad, a] = pads[d.z] || [0, false];
        if (dpad & 16) d.start = false; // (a false start: A before GO, 0x864068A4)
        input = ((dpad & 15) << 8) | (a ? A : 0);
      } else input = this.cpu(d);
      this.donphan(d, input);
      d.timer++;
    }
    this.bumps();
    const lapped = [];
    for (const d of this.d) {
      if (d.empty) continue;
      d.x += d.px; d.h += d.ph; d.y += d.py;
      d.px = 0; d.ph = 0; d.py = 0;
      // how far round the lap it is: its angle about the middle, a little
      // ahead of it, counted from the top's middle (0 there, round to 1)
      const [ax, ay] = ALONG[d.seg];
      let f = angle(d.x + ax * R, -(d.y + ay * R)) / 65535 - 0.25;
      if (f < 0) f += 1;
      if (f > 1) f -= 1;
      if (f < 0.25 && d.corners === 15) { // (round all four corners, then past the line)
        d.laps--;
        d.corners = 0;
        d.notice = this.noticeRoll();
        lapped.push(d);
      }
      if (!d.done) d.progress = LAPS - d.laps + f;
    }
    this.placings();
    for (const d of lapped) {
      if (d.laps > 0) { // (the further back, the more; and the stars it holds pop up again: 0x86409378)
        d.clouds = Math.min(3, d.clouds + d.rank);
        this.events.push(["stars", d.z]);
      } else d.clouds = 0;
      if (d.rank === 0 && d.laps >= 1) this.events.push([d.laps === 1 ? "final" : "lap", d.z]);
    }
    for (const c of [...this.clouds]) { this.cloud(c); c.timer++; }
    for (const d of this.d) if (!d.empty) this.walls(d);
    this.finish(t);
  }

  // which part of the track it's in, and each corner it's been round (0x86404824)
  segment(d) {
    const was = d.seg;
    if (d.x <= -CORNER[0] && d.y <= -CORNER[1]) { d.seg = 0; d.corners |= CORNER_BIT[0]; }
    else if (d.x <= -CORNER[0] && d.y >= CORNER[1]) { d.seg = 1; d.corners |= CORNER_BIT[1]; }
    else if (d.x >= CORNER[0] && d.y >= CORNER[1]) { d.seg = 2; d.corners |= CORNER_BIT[2]; }
    else if (d.x >= CORNER[0] && d.y <= -CORNER[1]) { d.seg = 3; d.corners |= CORNER_BIT[3]; }
    else if (d.y <= -INNER[1]) d.seg = 6;
    else if (d.y >= INNER[1]) d.seg = 7;
    else if (d.x <= -INNER[0]) d.seg = 4;
    else if (d.x >= INNER[0]) d.seg = 5;
    if (d.seg !== was) d.lane = this.laneRoll();
  }

  // ---- a Donphan (0x86402B1C) ----
  donphan(d, input) {
    if (d.laps >= 2) { d.roll--; if (d.roll <= 0) d.roll = 0; } else d.roll = 1; // (rolling on the last lap)
    if (d.start) { // a rocket start (0x86402688)
      if (START_FOR < d.timer) d.start = false;
      else if (input & A) {
        d.speed += SPEED * 0.8 * (1 - d.timer / START_FOR);
        d.start = false;
        d.roll = ROLL_FOR;
        this.events.push(["rocket", d.z]);
      }
    }
    if (d.bounce && 2 < d.timer) d.bounce = false;
    if (d.done) { // in: coasting to a stop
      const k = 0.97 - 0.025 * d.rank;
      d.speed *= k;
      d.boost *= k * 0.5;
      input = 0;
      this.cloudHits(d);
    } else {
      this.turn(d, input);
      if (d.h <= 0) {
        const top = SPEED * TOP[d.rank];
        d.speed += ACCEL;
        if (top < d.speed) d.speed = top;
      }
      d.boost *= 0.9;
      if (d.boost < SPEED * 0.9 * 0.1) d.boost = 0;
    }
    d.x += d.vx * (d.speed + d.boost);
    d.y += d.vz * (d.speed + d.boost);
    this.height(d);
    if (this.knock(d)) {
      if (d.tumble) { // sent flying by a cloud: spinning, stopped (0x86402F14)
        d.stun--;
        if (d.stun > 0) {
          if (d.stun % 5 === 0) this.events.push(["dizzy", d.z]);
          d.rot = s16(d.rot + 0x1fff);
          d.angle = d.rot;
          d.speed = 0;
        } else d.tumble = false;
      } else { // turning to face its way, half the rest each frame (the game's wrap, as it is)
        let diff = d.target - d.angle;
        if (diff > 32767) diff = 65535 - diff;
        if (diff < -32767) diff += 65535;
        d.angle += diff * 0.5;
        if (d.angle < 0) d.angle += 65535;
        if (d.angle > 65535) d.angle -= 65535;
        d.rot = s16(Math.trunc(d.angle));
        this.cloudHits(d);
      }
    }
    // a cloud: dropped where it is, and off it goes (0x86403150)
    if (d.clouds > 0 && !d.knocked && !d.tumble && d.h <= 0) {
      d.ready = true;
      if (input & A) {
        d.wait = 0;
        if (d.laps >= 2) d.boost = SPEED * 0.9 * 0.3;
        else { d.speed = SPEED; d.boost = SPEED * 0.9; } // (on the last lap, full tilt)
        this.clouds.push({ id: ++this.ids, owner: d.z, x: d.x, h: d.h + R, y: d.y, timer: 0, phase: 0, frame: 0 });
        d.out++;
        d.timer = 0;
        d.drop = true;
        d.clouds--;
        this.events.push(["drop", d.z, this.ids]);
      }
    } else d.ready = false;
    if (d.drop && 8 < d.timer) d.drop = false;
  }
  // the D-pad: a quarter turn, not back the way it came, not into a wall (0x86402158)
  turn(d, input) {
    if (d.tumble || d.bounce) input = 0;
    let bits = (input >> 8) & 15 & ~this.against(d) & ~NOT[d.seg];
    const dir = DIRS.find(([b]) => bits & b);
    if (dir && d.vx * dir[1] + d.vz * dir[2] >= 0) {
      d.target = dir[3];
      d.vx = dir[1];
      d.vz = dir[2];
    }
  }
  // the walls it's up against (0x86401F60)
  against(d) {
    let bits = 0;
    const { x, y } = d;
    if (x <= -OUTER[0]) bits = LEFT;
    if (x >= OUTER[0]) bits |= RIGHT;
    if (y <= -OUTER[1]) bits |= UP;
    if (y >= OUTER[1]) bits |= DOWN;
    if (x <= -INNER[0] && x >= -INNER[0] - R && y > -INNER[1] && y < INNER[1]) bits |= RIGHT;
    if (x >= INNER[0] && x <= INNER[0] + R && y > -INNER[1] && y < INNER[1]) bits |= LEFT;
    if (y <= -INNER[1] && y >= -INNER[1] - R && x > -INNER[0] && x < INNER[0]) bits |= DOWN;
    if (y >= INNER[1] && y <= INNER[1] + R && x > -INNER[0] && x < INNER[0]) bits |= UP;
    return bits;
  }
  // up and down: a bounce, flying (0x86402A2C)
  height(d) {
    if (d.tumble && !d.done) {
      if (d.h < 92.8) {
        d.vh += 9.28;
        if (d.vh > 34.8) d.vh = 34.8;
      } else d.vh -= 9.28;
    } else d.vh -= 9.28;
    d.h += d.vh;
    if (d.h < 0) {
      d.h = 0;
      d.vh *= -0.75;
    }
  }
  // knocked over: sliding, stunned, till it's back up (0x864028B8); false while it is
  knock(d) {
    if (!d.knocked) return true;
    d.tumble = false;
    d.stun--;
    if (d.stun > 0) {
      if (d.stun % 5 === 0) this.events.push(["dizzy", d.z]);
      d.speed *= KNOCKED_SLOW[d.rank];
      return false;
    }
    d.vh = 0;
    d.knocked = false;
    d.h = 0;
    return true;
  }
  // a cloud it runs into (someone else's): it flies, and the cloud goes (0x86402304)
  cloudHits(d) {
    for (const c of this.clouds) {
      if (c.owner === d.z || c.phase !== 1) continue;
      const dx = d.x - c.x, dy = d.y - c.y;
      if (!(Math.sqrt(dx * dx + dy * dy) < CLOUD_R)) continue;
      if (!d.done && !d.tumble) {
        d.boost = 0;
        d.vh = 34.8;
        d.stun = DIZZY_FOR[d.rank];
        d.tumble = true;
        this.events.push(["hit", d.z, c.id]);
      }
      c.phase = 2;
      c.timer = 0;
    }
  }
  // a cloud: coming up, there a while, fading (0x864009D4)
  cloud(c) {
    c.frame++;
    if (c.phase === 0) {
      if (c.timer >= CLOUD_FOR[0]) { c.phase = 1; c.timer = 0; }
    } else if (c.phase === 2) {
      if (c.timer >= CLOUD_FOR[2]) {
        this.d[c.owner].out--;
        this.clouds.splice(this.clouds.indexOf(c), 1);
      }
    } else if (c.timer >= CLOUD_FOR[1]) { c.phase = 2; c.timer = 0; }
  }

  // ---- two Donphan too close: apart, and one at full tilt knocks the other over (0x86401920) ----
  bumps() {
    for (let i = 0; i < 3; i++) for (let j = i + 1; j < 4; j++) if (!this.d[i].empty && !this.d[j].empty) this.bump(this.d[i], this.d[j]);
  }
  bump(a, b) {
    let nx = b.x - a.x, nh = b.h - a.h, ny = b.y - a.y;
    const dist = Math.sqrt(nx * nx + nh * nh + ny * ny);
    if (!(dist < 2 * R)) return;
    const over = 2 * R - dist;
    if (dist > 0) {
      nx /= dist;
      nh /= dist;
      ny /= dist;
    } else {
      nx = 2 * this.u() - 1;
      nh = 2 * this.u() - 1;
      ny = 2 * this.u() - 1;
      const l = Math.sqrt(nx * nx + nh * nh + ny * ny);
      if (l !== 0) { nx /= l; nh /= l; ny /= l; }
    }
    a.px += -nx * over * 0.5;
    a.ph += -nh * over * 0.5;
    a.py += -ny * over * 0.5;
    b.px += nx * over * 0.5;
    b.ph += nh * over * 0.5;
    b.py += ny * over * 0.5;
    // (the game's test of which way it's going takes its z speed with the height's part, as it is)
    const fast = SPEED * 0.9 * 0.5;
    if (fast < a.boost && a.vx * nx + a.vz * nh >= 0 && b.boost < fast) this.knockOver(b);
    if (fast < b.boost && b.vx * -nx + b.vz * -nh >= 0 && a.boost < fast) this.knockOver(a);
    if (a.tumble && !b.tumble) a.vh = 34.8;
    if (b.tumble && !a.tumble) b.vh = 34.8;
  }
  knockOver(d) { // (0x864018B0)
    if (d.knocked) return;
    d.stun = KNOCKED_FOR;
    d.boost = 0;
    d.knocked = true;
    d.vh = 46.4;
    this.events.push(["knocked", d.z]);
  }

  // ---- the walls (0x86401550): the block's edges and corners, and the outside ----
  walls(d) {
    for (const e of EDGES) {
      const [ax, ay] = BLOCK[e.a];
      const dist = apart(d.x, d.y, ax, ay, e.dx, e.dz);
      if (!(dist < R)) continue;
      const at = meet(d.x, d.y, e.n[0], e.n[1], ax, ay, e.dx, e.dz);
      if (!at || !(at[1] >= 0 && at[1] <= 1)) continue;
      const depth = R - dist;
      d.x += e.n[0] * depth;
      d.y += e.n[1] * depth;
      if (e.n[0] * d.vx + e.n[1] * d.vz < 0) this.wallTurn(d, e.turn);
    }
    for (const p of POSTS) {
      let ox = d.x - BLOCK[p.i][0], oy = d.y - BLOCK[p.i][1];
      const l = Math.sqrt(ox * ox + oy * oy);
      if (!(l < R)) continue;
      if (l === 0) { ox = p.n[0]; oy = p.n[1]; } else { ox /= l; oy /= l; }
      const depth = ox * p.n[0] + oy * p.n[1] >= 0 ? R - l : R + l;
      d.x += ox * depth;
      d.y += oy * depth;
    }
    if (d.x < -OUTER[0]) { d.x = -OUTER[0]; if (d.vx < 0) this.wallTurn(d, DOWN); }
    if (d.x > OUTER[0]) { d.x = OUTER[0]; if (d.vx * -1 < 0) this.wallTurn(d, UP); }
    if (d.y < -OUTER[1]) { d.y = -OUTER[1]; if (d.vz < 0) this.wallTurn(d, LEFT); }
    if (d.y > OUTER[1]) { d.y = OUTER[1]; if (-1 * d.vz < 0) this.wallTurn(d, RIGHT); }
  }
  // off a wall: turned along it, for a moment no turning (0x864013A8); once in, bounced back
  wallTurn(d, way) {
    d.bounce = true;
    d.timer = Math.trunc(2 * (1 - d.speed / SPEED));
    if (d.done) { d.vx *= -0.1; d.vz *= -0.1; return; }
    const w = WAY[way];
    d.target = w[3];
    d.vx = w[1];
    d.vz = w[2];
  }

  // the places, by how far round each is (0x864033AC: in seat order, the
  // furthest first; once in, by the place they came in). (The remake's: only
  // those there, an empty seat after them)
  placings() {
    const order = this.d.filter((d) => !d.empty), n = order.length;
    for (let k = 0; k < n - 1; k++) {
      for (let i = 0; i < n - 1 - k; i++) {
        if (order[i].progress < order[i + 1].progress) [order[i], order[i + 1]] = [order[i + 1], order[i]];
      }
    }
    order.push(...this.d.filter((d) => d.empty));
    order.forEach((d, i) => { d.rank = i; });
  }
  // who's in (0x8640633C): the first in wins (together, on the same frame);
  // once all four are in, the race is over (and if all four won, none did: 0x864067B8).
  // (All four: all there are, an empty seat taking no part)
  finish(t) {
    const here = this.d.filter((d) => !d.empty), before = here.filter((d) => d.done).length;
    let over = false;
    for (const d of here) {
      if (d.laps > 0) continue;
      if (before === here.length) over = true;
      if (before === 0) d.won = true;
      if (!d.done) {
        d.done = true;
        d.fin = t;
        d.progress = 10000 - d.rank;
        this.events.push(["in", d.z, +d.won]); // (not "finish": that's the game's own, the round over)
      }
    }
    if (over || t >= LONGEST) {
      this.end = t;
      if (here.every((d) => d.won)) for (const d of here) d.won = false;
      for (const c of this.clouds) { c.phase = 2; c.timer = 0; } // (0x86406710)
    }
  }

  // ---- once it's over (state 5, 0x8640533C: the show, under the winners' banner) ----
  // Each slows x0.94 a frame to a stop where it's going; when it's slower than 1
  // it's stopped (halt): a winner stays (game.js: it cheers), a loser is turned a
  // quarter turn from the way it faces and walks off slumped, 0.13 faster a frame
  // for 20 frames, then x0.9. 1P's Donphan stopping moves the camera to the
  // winners (0x86405138: an event). They still bump (0x86401D1C), and the clouds
  // fade and the walls hold (0x864066B4). (An empty seat's not there: the
  // camera moves as the first seat there stops)
  coast() {
    for (const d of this.d) {
      if (d.empty) continue;
      this.segment(d);
      d.roll = 0;
      if (d.halt !== null) {
        d.timer++;
        if (d.timer < 20) d.speed += 0.13;
        else d.speed *= 0.9;
      } else d.speed *= 0.94;
      d.x += d.vx * d.speed;
      d.y += d.vz * d.speed;
      this.height(d);
    }
    this.bumps();
    for (const d of this.d) {
      if (d.empty) continue;
      d.x += d.px; d.h += d.ph; d.y += d.py;
      d.px = 0; d.ph = 0; d.py = 0;
      if (!(d.speed < 1) || d.halt !== null) continue;
      d.halt = this.t;
      if (d.z === this.first) { // (where the winners are, or all four with none; the others not pushed yet this frame)
        const here = this.d.filter((e) => !e.empty), on = here.some((e) => e.won) ? here.filter((e) => e.won) : here;
        let x = 0, h = 0, y = 0;
        for (const e of on) { x += e.x; h += e.h; y += e.y; }
        if (on.length >= 2) { x /= on.length; h /= on.length; y /= on.length; }
        this.events.push(["camera", x, h, y]);
      }
      if (!d.won) { // (its way off from the table at 0x80087FB0, +1024 the cosine)
        d.timer = 0;
        const i = (d.rot & 0xffff) >> 4;
        d.vx = sine(i + 1024);
        d.vz = -sine(i);
        d.speed = 0;
      }
      this.events.push(["halt", d.z, +d.won]);
    }
    for (const c of [...this.clouds]) { this.cloud(c); c.timer++; }
    for (const d of this.d) if (!d.empty) this.walls(d);
  }

  // ---- a CPU (0x86403F5C): its line round the track, round the clouds in the way ----
  cpu(d) {
    const s = d.seg;
    let px, py, d1, d2, dist, ahead;
    if (s === 0 || s === 4) { // down the left side: its line in from the block's left edge
      d1 = [-1, 0]; d2 = [0, 1];
      px = -148 - (d.lane + R); py = d.y;
      dist = Math.abs(d.x - px);
      ahead = 122.5 - d.y;
    } else if (s === 1 || s === 7) { // along the bottom
      d1 = [0, 1]; d2 = [1, 0];
      px = d.x; py = d.lane + R + 92.5;
      dist = Math.abs(d.y - py);
      ahead = 178 - d.x;
    } else if (s === 2 || s === 5) { // up the right side
      d1 = [1, 0]; d2 = [0, -1];
      px = d.lane + R + 148; py = d.y;
      dist = Math.abs(d.x - px);
      ahead = d.y - -122.5;
    } else { // along the top
      d1 = [0, -1]; d2 = [-1, 0];
      px = d.x; py = -92.5 - (d.lane + R);
      dist = Math.abs(d.y - py);
      ahead = d.laps === 1 ? d.x - 45 : d.x - -178;
    }
    const p = [px, py];
    let wary = this.wary(d, dist, p, d1, d2, ahead);
    if (this.level === 3 && d.laps === LAPS) wary = true;
    [px, py] = p;
    let bits = 0;
    if (s === 0) bits = d.x < px ? DOWN : LEFT;
    else if (s === 1) bits = py < d.y ? RIGHT : DOWN;
    else if (s === 3) bits = d.y < py ? LEFT : UP;
    else if (s === 2) bits = px < d.x ? UP : RIGHT;
    else if (s === 4 || s === 5) {
      if (wary) bits = d.x < px - SPEED ? RIGHT : px + SPEED < d.x ? LEFT : s === 4 ? DOWN : UP;
      else bits = s === 4 ? DOWN : UP;
    } else if (d.laps === 0 && s === 6) bits = LEFT;
    else if (wary) bits = d.y < py - SPEED ? DOWN : py + SPEED < d.y ? UP : s === 6 ? LEFT : RIGHT;
    else bits = s === 6 ? LEFT : RIGHT;
    let input = bits << 8;
    if (d.start) { // a rocket start: Hard always, Normal a third of the frames, Easy an eleventh
      let go = false;
      if (this.level === 1) go = this.rnd() % 11 === 0;
      else if (this.level === 2) go = this.rnd() % 3 === 0;
      else if (this.level === 3) go = true;
      if (go) input |= A;
    } else if (d.wait++ >= 6) { // a cloud now and then, likelier near the corners (0x86403CDC)
      if (this.level !== 3 || s < 4) {
        if (this.u() < DROP[s] * DROP_LEVEL[this.level]) input |= A;
      }
    }
    return input;
  }
  // the clouds near its line ahead (0x864037C0): moves its line's point p off
  // them; true if one's in its way
  wary(d, dist, p, d1, d2, ahead) {
    const p0 = [p[0], p[1]];
    let near = false;
    for (const c of this.clouds) {
      if (c.owner === d.z || c.phase === 2 || !(d.notice < c.timer)) continue;
      const at = meet(p[0], p[1], d1[0], d1[1], c.x, c.y, d2[0], d2[1]);
      if (!at) continue;
      const [t, s] = at;
      if (Math.abs(t - dist) < 30 && s < 30) near = true;
      if (!(s < 30) || !(-(ahead + 30) < s)) continue;
      const lo = t - 30, hi = t + 30;
      if (Math.abs(s) < 30) {
        if (0 < hi && hi < dist) dist = this.shift(d, p, d1, hi);
        if (lo < dist && dist < hi) dist = this.shift(d, p, d1, dist - lo < hi - dist ? lo : hi);
      } else if (lo < 0 && 0 < hi) dist = this.shift(d, p, d1, hi);
    }
    if (p[0] !== p0[0] || p[1] !== p0[1]) {
      const ex = p0[0] - p[0], ey = p0[1] - p[1];
      if (Math.sqrt(ex * ex + ey * ey) > 138.6) { p[0] = p0[0]; p[1] = p0[1]; }
    }
    return near;
  }
  shift(d, p, d1, k) {
    p[0] += d1[0] * k;
    p[1] += d1[1] * k;
    const ex = d.x - p[0], ey = d.y - p[1];
    return Math.sqrt(ey * ey + ex * ex);
  }

  // ---- for running a frame again (online) ----
  save() {
    const copy = (o) => ({ ...o });
    return { t: this.t, end: this.end, ids: this.ids, seed: this.seed, d: this.d.map(copy), clouds: this.clouds.map(copy) };
  }
  load(s) {
    Object.assign(this, this.save.call(s));
    this.events = [];
  }

  // the places so far (1-4), by seat: all in on the first frame anyone was are
  // first (the game's winners, or a draw if that's all four); the rest by rank
  // (an empty seat: none, null)
  get places() {
    let first = null;
    for (const d of this.d) if (d.fin !== null && (first === null || d.fin < first)) first = d.fin;
    return this.d.map((d) => (d.empty ? null : d.fin !== null && d.fin === first ? 1 : d.rank + 1));
  }
  // a fingerprint of the world, exact, to check two runs of it agree (the tests;
  // tools/rollout_rules.py's is the same)
  digest() {
    const parts = [this.t, this.seed, this.ids, this.end ?? -1];
    for (const d of this.d) {
      parts.push(hex(d.x), hex(d.h), hex(d.y), hex(d.vx), hex(d.vz), hex(d.vh), d.rot, d.timer, +d.start, +d.tumble, +d.knocked,
        +d.bounce, +d.ready, +d.drop, +d.done, +d.won, d.fin ?? -1, d.corners, d.seg, d.laps, hex(d.progress), d.rank, hex(d.speed),
        hex(d.boost), d.roll, d.stun, d.wait, d.clouds, d.out, hex(d.target), hex(d.angle), d.notice, hex(d.lane), d.halt ?? -1);
    }
    for (const c of this.clouds) parts.push(c.id, c.owner, hex(c.x), hex(c.h), hex(c.y), c.timer, c.phase, c.frame);
    return parts.join(",");
  }
}

const view = new DataView(new ArrayBuffer(8));
function hex(v) {
  view.setFloat64(0, v);
  return view.getUint32(0).toString(16).padStart(8, "0") + view.getUint32(4).toString(16).padStart(8, "0");
}
