// Barrier Ball's rules, as the game's code module (#51) has them
// (docs/minigames.md has where each number is). Everything counts in the
// game's frames, 30 a second, and its units: the court is the plane z = 0
// seen from straight above, (0, 0, 2000) with a fov of 15, so the middle is
// 0 and the screen shows x -351 to 351, y -263 to 263 (y up).
//
// Four Mr. Mime stand in the four corners of a square court, each in a lane
// between two of the walls that point in from its sides; each holds a barrier
// across its lane and slides it from side to side. Poké Balls come up out of
// the hole in the middle, spin, and fly off; they bounce off the walls and
// the barriers, speeding up with each bounce. A ball past a Mr. Mime into its
// corner is a goal: that player loses a point, and the last one to hit it
// back (if someone else) gets one. Press A to smash: the barrier pushes out,
// and a ball it hits flies off faster. First to 5 points, or the most when
// the minute's up, wins.
//
// The four share one world, so it runs from everyone's pads at once and the
// CPUs think in it as the game's do. Every device and the server run the same
// world from the same pads (online, devices run it again from a saved frame
// when someone's pad comes in late: game.js). So it never uses Math.sin and
// the like, whose last bits can differ between browsers and Python, only
// + - * / and sqrt in the same order. Tools/barrier_rules.py is the rooms
// server's copy: keep the two the same.

export const FPS = 30;
export const LEVELS = { easy: 1, normal: 2, hard: 3 };

// The game's tuning (its debug menu's, set at 0x86303C00)
export const TIME = 60 * FPS; // "TIME": a minute
export const GOAL = 5; // "GOAL SCORE": the points that win
const BALL_SPEED = 4; // "BALL SPEED": the most a ball goes in a step (each bounce adds 1)
const SMASH_DEC = 1; // "SMASH DEC": what a smash's push keeps each step

export const STEPS = 3; // the play runs three steps a frame (0x86302404)
export const HURRY = 30 * FPS; // the last 30 s: the tune speeds up (0x8630352C)
const MORE_AFTER = 3 * FPS; // after 3 s with too few balls, one more may come (0x863031A4)...
const MOST_BALLS = 3; // ...up to three at once
export const BALL_R = 21; // a ball's radius
export const COURT = 250; // a ball past this, either way, is in a goal (0x86306710)
const GONE = 350; // and taken away past this (or once it's faded)
export const HUB = 180; // the walls' tips: the middle diamond, where a hit counts as its hitter's
export const STAND = 220; // a Mr. Mime's distance from the middle
export const BARRIER = 60; // half a barrier's width
const BARRIER_OUT = [385.8, 536.54, 544.73, 536.77, 522.505]; // its distance out (x 0.15) as a smash pushes it (0x86307464)
export const SMASH_FOR = 31; // steps a smash lasts (its push counts from 3 to 23)
const SERVE_SPIN = 1365.3125; // a ball in the hole turns 7.5 degrees a step...
const SERVE_SPEED = 2.3; // ...and flies off its way at this
const S = 0.70710677; // (sqrt(1/2) as the game has it)

// The CPUs, by level (0x86307428): the fastest ball they go for (that times
// the next for each other ball on the court), the chance they smash a ball
// near their barrier, and how far ahead they reckon a ball's curl (0x86300818)
const CPU = { 1: [4.8, 0.83, 0.4, 0.25], 2: [5.4, 0.93, 0.7, 5], 3: [6, 0.98, 1, 1] };

// The players' corners (0x863072F8): the way Mr. Mime faces (degrees), its
// lane's slope, the barrier's way along (its ends are -60 and +60 that way)
// and its normal (out of the lane, towards the middle)
export const SEATS = [
  { angle: 45, slope: 1, dir: [-S, -S], n: [S, -S] }, // 1P, top left
  { angle: 315, slope: -1, dir: [-S, S], n: [-S, -S] }, // 2P, top right
  { angle: 135, slope: -1, dir: [S, -S], n: [S, S] }, // 3P, bottom left
  { angle: 225, slope: 1, dir: [S, S], n: [-S, S] }, // 4P, bottom right
];
// The walls (0x86307190, placed by 0x863003DC): four wedges pointing in, their
// tips 180 from the middle, their arms out to the court's edge; the edges a
// ball bounces off (0x86307254: two from each tip, their normals made at
// 0x86300120) and the tips' posts (0x863072B8: a ball bounces off a tip as off
// a circle there)
const WEDGE = [[0, 0], [-1000, 1000], [1000, 1000], [0, 0], [-1000, -1000], [-1000, 1000],
  [0, 0], [1000, -1000], [-1000, -1000], [0, 0], [1000, 1000], [1000, -1000]];
const TIPS = [[0, HUB], [-HUB, 0], [0, -HUB], [HUB, 0]];
export const VERTS = WEDGE.map(([x, y], i) => [x + TIPS[Math.floor(i / 3)][0], y + TIPS[Math.floor(i / 3)][1]]);
const EDGES = [[0, 1], [2, 0], [3, 4], [5, 3], [6, 7], [8, 6], [9, 10], [11, 9]].map(([a, b]) => {
  const n = norm(-(VERTS[b][1] - VERTS[a][1]), VERTS[b][0] - VERTS[a][0]);
  return { a, b, n };
});
const POSTS = [[0, [0, -1]], [3, [1, 0]], [6, [0, 1]], [9, [-1, 0]]];

const U = 4294967296;

// the level the game plays (0x863039DC): with four people, easy
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
// the main program's sine table (0x80087FB0: 4096 to a turn, and a quarter
// more for the cosines), made the same way everywhere and as floats
export function sine(i) {
  const q = (i >> 10) & 3, x = (i & 1023) * (Math.PI / 2048), x2 = x * x;
  let term = q % 2 === 0 ? x : 1, sum = term;
  for (let k = 1; k < 10; k++) {
    term = (-term * x2) / (q % 2 === 0 ? 2 * k * (2 * k + 1) : (2 * k - 1) * (2 * k));
    sum += term;
  }
  return Math.fround(q >= 2 ? (sum === 0 ? 0 : -sum) : sum);
}
const s16 = (v) => (((v & 0xffff) ^ 0x8000) - 0x8000);

// One round's world. cpus: which seats are CPUs; step() runs a frame from the
// people's pads. The scene reads it all.
export class World {
  constructor(seed, level = "normal", cpus = [false, true, true, true]) {
    this.level = levelCode(level, cpus);
    this.seed = seed >>> 0; // the game's random numbers' state (rnd())
    this.t = -1; // the last frame run
    this.end = null; // the frame the play ended on
    this.ids = 0;
    this.events = [];
    this.time = TIME; // frames left
    this.clock = 0; // frames since the number of balls wanted last went up
    this.want = 1; // how many balls there should be
    this.balls = [];
    // the Mr. Mime, with what the game keeps for each player (0x863072F8): its
    // lane (where the barrier's middle can go: 67 either way), its points, and
    // a CPU's aim (0x86301B3C)
    const half = (2 * HUB * S - 2 * BARRIER) * S * 0.5;
    this.m = SEATS.map((s, z) => {
      const x = -s.n[0] * STAND, y = -s.n[1] * STAND;
      return {
        z, human: !cpus[z], x, y, prevx: x, prevy: y, icpt: y - s.slope * x, xmin: x - half, xmax: x + half,
        timer: 0, smash: false, moving: false, wander: true, target: 0.5, aimSide: 0, score: 0,
      };
    });
    for (const m of this.m) m.aimSide = this.u() - 0.5;
  }
  // the game's random numbers (0x800357EC: x * 1664525 + 1013904223)
  rnd() { return (this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0); }
  u() { return this.rnd() / U; }

  // ---- a frame (0x8630352C; after the end 0x863024A8, which only runs the steps) ----
  // pads: each person's [stick (-64-64, along their lane: + is +x), A pressed this frame] (null: none)
  step(t, pads = []) {
    this.t = t;
    const playing = this.end === null;
    if (playing && this.time > 0) { // more balls as the play goes on (0x863031A4)
      this.clock++;
      if (this.clock > MORE_AFTER) { this.want = Math.min(this.want + 1, MOST_BALLS); this.clock = 0; }
      if (this.balls.length < this.want) this.addBall();
    }
    for (let k = 0; k < STEPS; k++) this.substep(pads, playing);
    if (!playing) return;
    // the clock and the points (0x8630328C)
    this.time--;
    if (this.time < 0) { this.time = 0; this.clock = 0; this.end = t; }
    for (const m of this.m) if (m.score >= GOAL) { this.clock = 0; this.end = t; }
    if (this.time % FPS === FPS - 1 && Math.trunc((this.time + FPS - 1) / FPS) < 4) this.events.push(["count", -1]);
  }
  // a step: the Mr. Mime, the balls, then the balls off the barriers (0x86302404)
  substep(pads, playing) {
    for (const m of this.m) { if (playing) this.mime(m, pads[m.z]); m.timer++; }
    for (const b of [...this.balls]) { this.ball(b, playing); b.timer++; }
    for (const m of this.m) this.barrier(m, playing);
  }

  // ---- a Mr. Mime (0x863013C8) ----
  mime(m, pad) {
    const s = SEATS[m.z];
    let [x, a] = m.human ? pad || [0, false] : this.cpu(m);
    x = Math.max(-64, Math.min(64, x));
    m.prevx = m.x;
    m.prevy = m.y;
    m.x += x * 0.09;
    if (m.x < m.xmin) m.x = m.xmin;
    if (m.xmax < m.x) m.x = m.xmax;
    m.y = s.slope * m.x + m.icpt;
    if (Math.abs(m.x - m.prevx) > 4.032) { // (going fast: a swish, once: 0x6F01)
      if (!m.moving) { this.events.push(["swish", m.z]); m.moving = true; }
    } else m.moving = false;
    if (m.smash) { if (m.timer >= SMASH_FOR) m.smash = false; }
    else if (a) { m.timer = 0; m.smash = true; this.events.push(["smash", m.z]); } // (0x6F00)
  }
  // where its barrier's middle is: out in front, further while a smash pushes it (0x86304DF0)
  barrierAt(m) {
    let out = BARRIER_OUT[0];
    if (m.smash && m.timer < 11) {
      const lo = Math.trunc(m.timer / 3), k = (m.timer % 3) / 3;
      out = BARRIER_OUT[lo + 1] * k + BARRIER_OUT[lo] * (1 - k);
    }
    const n = SEATS[m.z].n;
    return [m.x + n[0] * out * 0.15, m.y + n[1] * out * 0.15];
  }

  // ---- a CPU (0x86300DD4): after the ball it reckons will come to it first, else wandering ----
  cpu(m) {
    const [, decay, smash] = CPU[this.level];
    let reach = CPU[this.level][0];
    for (let k = 0; k < this.balls.length - 1; k++) reach *= decay;
    const aim = this.reckon(m, reach);
    if (aim) {
      const x = Math.trunc(aim[0] - m.x);
      return [x, this.u() < smash && aim[2] < 42];
    }
    return [this.wander(m), false];
  }
  // where a ball coming its way will cross its barrier's line (0x86300818):
  // [x, y, how far the ball is from the line], for the ball soonest there
  // (by the crossing's distance from the middle over its speed), of those it
  // can handle: no faster than reach, or already past; crossing the lane
  // (or close). Then off to one side by its aim (the game's, y's too, uses x's numbers)
  reckon(m, reach) {
    const s = SEATS[m.z], ahead = CPU[this.level][3];
    let best = 3.4028234663852886e38, out = null;
    for (const b of this.balls) {
      const lx = b.vx + b.spinx * ahead, ly = b.vy + b.spiny * ahead;
      if (!(s.n[0] * lx + s.n[1] * ly < 0)) continue;
      const cx = m.x + s.n[0] * 50.54625, cy = m.y + s.n[1] * 50.54625;
      const d = apart(b.x, b.y, cx, cy, s.dir[0], s.dir[1]);
      const speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
      const at = meet(cx, cy, s.dir[0], s.dir[1], b.lastx, b.lasty, lx, ly);
      if (!at) continue;
      const [along, when] = at;
      if (!(b.smashV + speed <= reach || when < 0)) continue;
      const w = HUB * 1.4142135;
      if (!((-w < along && along < w) || d < 63)) continue;
      const px = b.lastx + lx * when, py = b.lasty + ly * when;
      if (speed === 0) continue;
      const q = Math.sqrt(px * px + py * py) / speed;
      if (q < best) { best = q; out = [px, py, d]; }
    }
    if (out) {
      const k = -s.n[0] * (101.0925 * 0.5) + s.dir[0] * 120 * m.aimSide;
      out[0] += k;
      out[1] += k;
    }
    return out;
  }
  // with no ball to go for: to a random spot in its lane, then wait there a while (0x86300C74)
  wander(m) {
    if (m.wander) { m.target = this.u() * (m.xmax - m.xmin) + m.xmin; m.wander = false; return 0; }
    const d = Math.trunc(m.target - m.x);
    if (Math.abs(d) < 5) {
      if (this.rnd() % 101 < 5) m.wander = true;
      return d;
    }
    return d > 0 ? 16 : -16;
  }

  // ---- a ball (0x86306CC4) ----
  // one comes up in the hole (0x86306D3C): spinning, growing, for 96-144 steps
  addBall() {
    const b = {
      id: ++this.ids, x: 0, y: 0, vx: 0, vy: 0, rot: -0x2000, scale: 0, timer: Math.trunc((this.u() + 2) * -48),
      serving: true, slow: false, out: false, smashed: false, alpha: 255,
      lastx: 0, lasty: 0, dx: 0, dy: 0, spinx: 0, spiny: 0, smashV: 0, owner: -1, pending: -1,
    };
    this.balls.push(b);
    this.events.push(["spawn", -1, b.id]); // (0x6F02)
  }
  ball(b, playing) {
    if (b.serving) this.serve(b, playing);
    else if (b.slow) this.fly(b, playing, true);
    else this.fly(b, playing, false);
  }
  // in the hole (0x863060FC): it turns (not quite straight at a corner or a
  // side: those get nudged 5 degrees on), then flies off the way it faces
  serve(b, playing) {
    if (b.timer > 0) {
      if (playing) {
        const i = ((b.rot + 0x3fff) & 0xffff) >> 4;
        b.vx = sine(i + 1024) * SERVE_SPEED;
        b.vy = sine(i) * SERVE_SPEED;
        b.serving = false;
        this.events.push(["serve", -1, b.id]); // (0x6F06)
      } else { b.vx = 0; b.vy = 0; }
      return;
    }
    if (!playing) return;
    const deg = b.rot * 0.005493248;
    if (deg > -5 && deg < 5) b.rot = 0x38e;
    if (deg > 85 && deg < 95) b.rot = 0x438e;
    if (deg > -95 && deg < -85) b.rot = -0x3c72;
    b.rot = s16(Math.trunc(b.rot + SERVE_SPIN));
    b.scale = Math.min(b.scale + 0.014583333, 0.7);
  }
  // on its way (0x86306710; once the play's over, slowing: 0x86306AC0): its
  // curl turns it, a smash's push adds on, then the walls; past the court,
  // a goal (it fades and goes); a hit counts once it's in the middle
  fly(b, playing, slow) {
    b.lastx = b.x;
    b.lasty = b.y;
    const speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy) * (slow ? 0.975 : 1);
    if (speed > 0) { b.vx /= speed; b.vy /= speed; }
    b.smashV *= slow ? SMASH_DEC * 0.975 : SMASH_DEC;
    const sx = b.vx * b.smashV, sy = b.vy * b.smashV;
    b.spinx *= 0.998;
    b.spiny *= 0.998;
    b.vx += b.spinx;
    b.vy += b.spiny;
    [b.vx, b.vy] = norm(b.vx, b.vy);
    b.vx *= speed;
    b.vy *= speed;
    b.rot = s16(Math.trunc(b.rot + (b.vx * b.spiny - b.spinx * b.vy) * 50000));
    b.x += b.vx + sx;
    b.y += b.vy + sy;
    this.walls(b, playing);
    if (!slow) {
      if (b.out) {
        b.alpha = b.alpha >= 17 ? b.alpha - 16 : 0;
        if (b.x < -GONE || b.x > GONE || b.y < -GONE || b.y > GONE || b.alpha === 0) {
          this.balls.splice(this.balls.indexOf(b), 1);
          this.want = 1;
          this.clock = 0;
        }
      } else if (playing && (b.x < -COURT || b.x > COURT || b.y < -COURT || b.y > COURT)) {
        this.goal(b);
        b.out = true;
        b.spinx = 0;
        b.spiny = 0;
      }
      if (!playing) b.slow = true;
      if (b.pending !== -1 && inHub(b.x, b.y)) { b.owner = b.pending; b.pending = -1; } // (0x86306690)
    }
    b.dx = b.x - b.lastx;
    b.dy = b.y - b.lasty;
  }
  // a goal (0x863001BC): the corner's player loses a point (not below 0), the
  // ball's hitter, if someone else, gets one
  goal(b) {
    const q = b.x <= 0 ? (b.y > 0 ? 0 : 2) : b.y > 0 ? 1 : 3;
    const o = b.owner;
    this.m[q].score--;
    if (o !== -1 && o !== q) this.m[o].score++;
    if (this.m[q].score < 0) this.m[q].score = 0;
    this.events.push(["goal", q, b.id, o]); // (0x6F05, 0x6F0B)
  }
  // off the walls' edges (0x86305E70); if none, the tips' posts (0x86305FD8)
  walls(b, playing) {
    const rx = b.x - b.lastx, ry = b.y - b.lasty;
    let hit = false;
    for (const e of EDGES) {
      const [ax, ay] = VERTS[e.a], [bx, by] = VERTS[e.b];
      const r = sweep(b, rx, ry, ax, ay, bx - ax, by - ay, e.n[0], e.n[1]);
      if (!r) continue;
      hit = true;
      b.x += e.n[0] * r[1];
      b.y += e.n[1] * r[1];
      this.bounce(b, e.n[0], e.n[1], playing);
    }
    if (hit) return;
    for (const [v, [nx, ny]] of POSTS) {
      let ox = b.x - VERTS[v][0], oy = b.y - VERTS[v][1];
      const d = Math.sqrt(ox * ox + oy * oy);
      if (!(d < BALL_R)) continue;
      if (d === 0) { ox = nx; oy = ny; } else [ox, oy] = norm(ox, oy);
      const depth = BALL_R - d;
      if (ox * nx + oy * ny >= 0) { b.x += ox * depth; b.y += oy * depth; }
      else { b.x -= ox * depth; b.y -= ox * depth; } // (the game's: y by x's)
      this.bounce(b, ox, oy, playing);
    }
  }
  // a bounce off normal n (0x86305C78: give or take a little), faster by 1 (0x86305D88)
  bounce(b, nx, ny, playing) {
    const jx = this.u() * 0.005 + nx - 0.0025;
    const jy = this.u() * 0.005 + ny - 0.0025;
    const k = (b.vx * nx + b.vy * ny) * -2;
    b.vx = b.vx + jx * k;
    b.vy = b.vy + jy * k;
    this.speedUp(b);
    if (playing) this.events.push(["wall", -1, b.id]); // (0x6F04)
  }
  speedUp(b) {
    const s = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
    if (s > 0) {
      let k = s + 1;
      b.vx /= s;
      b.vy /= s;
      if (BALL_SPEED < k) k = BALL_SPEED;
      b.vx *= k;
      b.vy *= k;
    }
  }

  // ---- the balls off a Mr. Mime's barrier (0x86305A04) ----
  barrier(m, playing) {
    const s = SEATS[m.z], [cx, cy] = this.barrierAt(m);
    const ax = cx - s.dir[0] * BARRIER, ay = cy - s.dir[1] * BARRIER, bx = cx + s.dir[0] * BARRIER, by = cy + s.dir[1] * BARRIER;
    const bar = { ax, ay, bx, by, abx: bx - ax, aby: by - ay };
    for (const b of this.balls) {
      const px = b.x, py = b.y;
      if (!this.face(m, b, bar, playing)) this.ends(m, b, bar, playing);
      this.body(m, b, px, py, cx, cy, bar);
    }
  }
  // its face (0x86305448): from the side the ball was on, a ball about to
  // reach it comes to touch it and goes off
  face(m, b, bar, playing) {
    const n = SEATS[m.z].n, lx = b.lastx, ly = b.lasty;
    const front = (bar.bx - lx) * (bar.ay - ly) <= (bar.ax - lx) * (bar.by - ly);
    const nx = front ? n[0] : -n[0], ny = front ? n[1] : -n[1];
    const r = sweep(b, b.dx, b.dy, bar.ax, bar.ay, bar.abx, bar.aby, nx, ny);
    if (!r) return false;
    b.x += nx * r[1];
    b.y += ny * r[1];
    this.hit(m, b, !front, bar, r[0], playing);
    return true;
  }
  // or its ends (0x86305694): a ball within 21 of one
  ends(m, b, bar, playing) {
    const n = SEATS[m.z].n;
    for (const [t, ex, ey, fx, fy] of [[0, bar.ax, bar.ay, -bar.abx, -bar.aby], [1, bar.bx, bar.by, bar.abx, bar.aby]]) {
      let ox = b.x - ex, oy = b.y - ey;
      const d = Math.sqrt(ox * ox + oy * oy);
      if (!(d < BALL_R)) continue;
      if (d === 0) { ox = fx; oy = fy; }
      [ox, oy] = norm(ox, oy);
      b.x += ox * (BALL_R - d);
      b.y += oy * (BALL_R - d);
      this.hit(m, b, ox * n[0] + oy * n[1] < 0, bar, t, playing);
      return;
    }
  }
  // a hit at t along the barrier (0x86305144): the ball goes off from Mr.
  // Mime (or from its mirror image, for one from behind) through the spot
  // t * 1.3 - 0.15 along, faster by 1; the barrier's moving gives it curl; a
  // smash in its middle pushes it on
  hit(m, b, back, bar, t, playing) {
    const s = SEATS[m.z], k = t * 1.3 - 0.15;
    const tx = bar.ax + bar.abx * k, ty = bar.ay + bar.aby * k;
    const speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
    let dx, dy;
    if (back) { dx = tx - (2 * (bar.ax + bar.abx * 0.5) - m.x); dy = ty - (2 * (bar.ay + bar.aby * 0.5) - m.y); }
    else { dx = tx - m.x; dy = ty - m.y; }
    [dx, dy] = norm(dx, dy);
    let v = speed + 1;
    if (BALL_SPEED < v) v = BALL_SPEED;
    b.vx = dx * v;
    b.vy = dy * v;
    b.spinx = ((m.prevx - m.x + s.n[0]) / 8.14587) * 0.06;
    b.spiny = ((m.prevy - m.y + s.n[1]) / 8.14587) * 0.06;
    if (m.smash && m.timer >= 3 && m.timer < 24) { b.smashV = 2; b.smashed = true; b.timer = 0; }
    else { b.smashV *= 0.5; b.smashed = false; }
    m.aimSide = (this.u() - 0.5) * 0.5;
    if (!back) b.pending = m.z;
    if (playing) { // its sound: by its curl, or a smash (0x86305038)
      const c = Math.sqrt(b.spinx * b.spinx + b.spiny * b.spiny);
      const kind = c > 0.056999996 ? "hit3" : m.smash ? "hitSmash" : c > 0.03 ? "hit2" : c > 0.012 ? "hit1" : "hit";
      this.events.push([kind, m.z, b.id]);
    }
  }
  // and Mr. Mime itself, behind it (0x86305840): a ball there is pushed out to the side and sent back
  body(m, b, px, py, cx, cy, bar) {
    const n = SEATS[m.z].n;
    const [ux, uy] = norm(bar.abx, bar.aby);
    const at = meet(px, py, ux, uy, cx, cy, -n[0], -n[1]);
    if (!at) return;
    const [side, behind] = at;
    if (!(behind > 21 && behind < 85 && side > -22 && side < 22)) return;
    const speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
    const k = side > 0 ? side - 22 : side + 22;
    b.x += ux * k;
    b.y += uy * k;
    const [dx, dy] = norm(ux + 2 * -n[0], uy + 2 * -n[1]);
    b.vx = dx * speed;
    b.vy = dy * speed;
  }

  // ---- for running a frame again (online) ----
  save() {
    const copy = (o) => ({ ...o });
    return {
      t: this.t, end: this.end, ids: this.ids, seed: this.seed, time: this.time, clock: this.clock, want: this.want,
      m: this.m.map(copy), balls: this.balls.map(copy),
    };
  }
  load(s) {
    Object.assign(this, this.save.call(s));
    this.events = [];
  }

  // the points so far
  get scores() { return this.m.map((m) => m.score); }
  // a fingerprint of the world, exact, to check two runs of it agree (the tests;
  // tools/barrier_rules.py's is the same)
  digest() {
    const parts = [this.t, this.seed, this.time, this.clock, this.want, this.ids, this.end ?? -1];
    for (const m of this.m) parts.push(hex(m.x), hex(m.y), m.timer, +m.smash, +m.moving, +m.wander, hex(m.target), hex(m.aimSide), m.score);
    for (const b of this.balls) {
      parts.push(b.id, hex(b.x), hex(b.y), hex(b.vx), hex(b.vy), b.rot, hex(b.scale), b.timer, +b.serving, +b.slow, +b.out,
        b.alpha, hex(b.spinx), hex(b.spiny), hex(b.smashV), b.owner, b.pending);
    }
    return parts.join(",");
  }
}

// a ball about to cross the line from a (along ab, its normal n towards the
// ball) or overlapping it (0x86304CA8, 0x86304B98): [t along it, how far to
// push the ball along n], or null
function sweep(b, rx, ry, ax, ay, abx, aby, nx, ny) {
  const qx = ax + nx * BALL_R, qy = ay + ny * BALL_R;
  const at = meet(b.x, b.y, rx, ry, qx, qy, abx, aby);
  if (at && at[0] > 0 && at[0] < 1 && at[1] > 0 && at[1] < 1) {
    const to = meet(b.x, b.y, nx, ny, qx, qy, abx, aby);
    return to && [to[1], to[0]];
  }
  const on = meet(b.x, b.y, nx, ny, ax, ay, abx, aby);
  if (!on) return null;
  const d = -on[0];
  if (!(d > -BALL_R && d < BALL_R && on[1] > 0 && on[1] < 1)) return null;
  return [on[1], d > 0 ? BALL_R - d : d + BALL_R];
}
// inside the middle diamond (0x86304920, round (0, 180), (-180, 0), (0, -180), (180, 0))
function inHub(px, py) {
  const ax = 0, ay = HUB, bx = -HUB, by = 0, cx = 0, cy = -HUB, dx = HUB, dy = 0;
  const f0 = (ax - px) * (by - py), f2 = (bx - px) * (ay - py);
  const e1 = (bx - px) * (cy - py) - (cx - px) * (by - py);
  const e2 = (cx - px) * (dy - py) - (dx - px) * (cy - py);
  const e3 = (dx - px) * (ay - py) - (ax - px) * (dy - py);
  return (f2 <= f0 && e1 >= 0 && e2 >= 0 && e3 >= 0) || (f0 - f2 <= 0 && e1 <= 0 && e2 <= 0 && e3 <= 0);
}

const view = new DataView(new ArrayBuffer(8));
function hex(v) {
  view.setFloat64(0, v);
  return view.getUint32(0).toString(16).padStart(8, "0") + view.getUint32(4).toString(16).padStart(8, "0");
}
