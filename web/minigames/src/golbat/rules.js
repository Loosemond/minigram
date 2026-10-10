// Gutsy Golbat's rules, as the game's code module (#49) has them
// (docs/minigames.md has where each number is). Everything counts in the
// game's frames, 30 a second, and its units: the screen is the plane z = 0
// seen from (0, 0, 1200), fov 30, so 320 x 240 px of it are 857.4 x 643.1
// units (x right, y up, the middle 0).
//
// Four Golbat fly through a cave that scrolls by from the right. Push left
// or right to fly that way, press A to flap up; gravity pulls you down. The
// course brings hearts to catch and Magnemite to dodge: a Magnemite that
// touches you knocks you back and knocks out half your hearts (at least one),
// which fall where the others can catch them. Fly fast enough (a dash) into
// another Golbat and you knock one of theirs out. When the clock runs out
// the cave's mouth comes, then the meadow outside; once it's in place the
// most hearts wins.
//
// Unlike the other games the four share one world (they bump each other and
// catch each other's hearts), so it runs from everyone's pads at once; the
// CPUs think in it as the game's do. Every device and the server run the same
// world from the same pads (online, devices run it again from a saved frame
// when someone's pad comes in late: game.js). So it never uses Math.sin and
// the like, whose last bits can differ between browsers and Python, only + - *
// / and sqrt in the same order. Tools/golbat_rules.py is the rooms server's
// copy: keep the two the same.

export const FPS = 30;
export const LEVELS = { easy: 1, normal: 2, hard: 3 };

// The game's tuning (its debug menu's, set at 0x86107360)
export const SCROLL = -8; // "SCROLL SPD": the cave goes by 8 a frame (the backdrops half that)
const FLAP = 9; // "FLAP SPD": what a flap adds up
const SPD_X = 0.023; // "SPD X": what the stick adds across, per unit of it (-64-64)
const ENEMY_BND = 20.5; // "ENEMY BND": how hard a Magnemite knocks you back
const PLAYER_BND = 0.6; // "PLAYER BND": how much two Golbat bounce off each other
const GRAVITY = -0.58; // "GRAVITY"
const DROP_RATE = 0.5; // "DROP RATE": the share of your hearts a Magnemite knocks out
export const TIME = 1200; // "TIME": frames of play before the cave's mouth may come
// Sizes: a Golbat is 28 across (700 x its scale, 0.04)
const UNIT = 28;
const BUMP = 49; // two Golbat touch within 49 (28 x 1.75: 0x8610109C)
const HIT = 30.68; // a Magnemite touches a Golbat within (28 + 19.2) x 0.65 (0x861056C0)
const NEAR = 52.156; // the CPUs keep this far from Magnemite (x 1.7)
const GRAB = 58; // a heart's caught within 58 across and up (28 + 30: 0x861060F8)
const CROWD = 174; // the CPUs like hearts with others within this (58 x 3: 0x861015AC)
const DRAG = 0.97;
const VMAX = 15;
const DASH = Math.sqrt(450) * 0.7; // faster than this is a dash (0x8610362C)
const STICK = 64 * SPD_X; // the most the stick (or a CPU) adds across in a frame
// Where a Golbat can go (0x86100BE0): the floor is lower in the play
export const X_MIN = -364.41092, X_MAX = 321.53903, Y_MAX = 199.3542, FLOOR = -209.00037;
export const EDGE = 464.8498; // things come on at x 464.85 and go past -464.85
const HURT_FOR = 26; // frames a Golbat a Magnemite knocked is hurt for (it can't be knocked again)
const FLAP_FOR = 9; // and a flap's clip plays fast for
export const HIT_FOR = 36; // and the knock's clip (clip 4) lasts, after a dash hit
const GOT_FOR = 6; // a caught heart pops for 6 frames
const FLASH_FOR = 16; // a Magnemite flashes for 16 after it hits
const MINE_FOR = 16; // a dropped heart can't be caught back by its Golbat this soon
const HEARTS_MAX = 99;
// The pools the game keeps them in: 16 Magnemite, 64 hearts
const MAGS = 16, HEARTS = 64;

// The course (0x8610A7A0): 42 sections of 1000 units of scroll (126 frames),
// each a list of [where (/255 of the section), height (/255), what]: 0 a
// Magnemite, 1 one on every level, 2 one on normal and hard, 3 a heart
export const MAGNEMITE = 0, HEART = 3;
const SECTIONS = [
  [[38,242,0],[63,140,3],[102,38,3],[127,229,0],[178,242,0],[204,89,3]],
  [[51,204,0],[63,242,0],[102,165,3],[153,25,3],[153,242,0],[204,76,3]],
  [[38,242,0],[51,153,3],[140,89,3],[153,229,0],[165,178,3],[216,63,3],[216,242,0]],
  [[38,229,0],[51,25,3],[63,178,3],[89,127,3],[114,242,0],[127,165,1],[204,242,0],[229,51,3]],
  [[38,242,0],[63,114,3],[114,51,3],[140,178,3],[178,38,3],[178,229,0],[216,242,0]],
  [[38,76,3],[51,229,0],[89,216,3],[140,25,3],[140,242,0],[153,102,1],[165,51,3],[204,229,0],[216,165,3]],
  [[89,229,0],[140,102,1],[178,242,0],[216,216,0]],
  [[25,229,0],[127,242,0],[165,216,0],[191,12,1]],
  [[76,242,0],[127,89,1],[178,242,0],[204,216,0]],
  [[63,216,0],[127,229,0],[140,76,1],[242,216,0]],
  [[51,216,0],[127,242,0],[140,51,1],[191,114,3],[216,242,0]],
  [[63,204,0],[89,242,0],[127,63,3],[140,12,1],[178,242,0],[204,216,0]],
  [[63,102,3],[63,242,0],[89,25,3],[102,229,0],[114,178,1],[191,165,3],[191,242,0]],
  [[63,153,3],[63,242,0],[89,12,3],[114,242,0],[140,204,3],[178,63,3],[178,127,1],[229,242,0]],
  [[51,89,3],[63,204,0],[63,242,0],[102,165,3],[114,76,1],[140,229,0],[153,12,3],[153,102,3]],
  [[25,229,0],[38,25,3],[51,242,0],[76,153,3],[127,242,0],[140,89,3],[165,153,1],[178,12,3],[229,178,3]],
  [[12,140,1],[63,153,3],[63,242,0],[140,51,3],[140,242,0],[178,229,0],[191,204,3]],
  [[63,38,3],[63,242,0],[102,140,3],[114,204,0],[114,242,0],[178,12,3],[216,165,3],[229,242,0]],
  [[51,12,0],[51,242,0],[102,229,0],[140,76,2],[216,242,0]],
  [[38,242,0],[51,63,2],[76,229,0],[165,12,0],[165,242,0]],
  [[38,216,0],[63,242,0],[140,127,1],[191,242,0],[204,204,0]],
  [[63,229,0],[76,12,0],[127,76,2],[127,242,0],[204,242,0]],
  [[38,165,2],[76,38,0],[102,229,0],[140,63,3],[178,242,0],[229,242,0]],
  [[63,229,0],[76,76,2],[127,63,3],[127,242,0],[191,12,0],[229,242,0]],
  [[51,25,3],[89,114,3],[89,229,0],[127,102,1],[140,191,3],[140,242,0],[191,63,3],[216,216,0]],
  [[63,191,0],[76,51,3],[114,242,0],[165,76,1],[165,114,3],[191,12,3],[191,242,0],[216,191,3],[216,229,0]],
  [[63,153,3],[63,229,0],[102,25,3],[102,127,1],[153,178,3],[178,102,3],[204,12,3],[204,242,0],[229,216,0]],
  [[25,178,0],[51,165,3],[76,63,3],[89,114,3],[114,242,0],[165,89,1],[165,242,0],[204,229,0],[216,102,3]],
  [[25,76,3],[51,12,3],[63,242,0],[114,89,1],[153,242,0],[165,127,3],[165,216,0],[178,25,3]],
  [[25,140,3],[38,242,0],[102,38,3],[114,178,1],[165,102,3],[191,242,0],[229,51,3]],
  [[38,242,0],[51,89,1],[127,242,0],[153,216,0],[165,12,0],[191,114,2]],
  [[63,242,0],[89,89,2],[140,242,0],[204,12,0],[229,153,1]],
  [[38,204,0],[63,51,2],[153,242,0],[191,191,1],[229,12,0]],
  [[51,242,0],[76,63,1],[114,229,0],[178,12,0],[178,242,0],[229,165,2]],
  [[25,242,0],[38,216,0],[63,12,0],[114,51,1],[114,191,2],[153,25,3],[191,229,0],[216,242,0]],
  [[38,12,0],[38,165,3],[38,242,0],[76,140,2],[127,229,0],[140,63,3],[204,51,1],[204,242,0]],
  [[38,0,0],[51,63,3],[51,216,0],[102,38,1],[102,114,3],[127,242,0],[140,178,3],[165,51,3],[178,140,2],[178,242,0],[229,114,3]],
  [[51,229,0],[63,165,3],[76,25,3],[89,242,0],[114,102,3],[127,12,0],[140,178,2],[165,38,3],[165,153,3],[191,89,1],[191,242,0]],
  [[38,165,3],[51,12,3],[51,242,0],[89,51,1],[89,242,0],[140,127,2],[191,38,3],[191,242,0],[204,127,3]],
  [[51,51,1],[63,178,3],[89,242,0],[102,114,3],[127,229,0],[140,38,3],[153,114,2],[165,165,3],[204,63,3],[204,242,0]],
  [[51,102,3],[51,165,1],[63,12,0],[102,165,3],[114,51,3],[153,242,0],[165,127,2],[204,229,0],[216,12,3],[229,114,3]],
  [[38,216,0],[51,12,0],[51,242,0],[76,127,3],[89,38,3],[140,242,0],[165,38,2],[165,114,3],[178,191,1],[216,178,3]],
];
// The order they come in (0x861001A0). The game draws random numbers to shuffle
// each six, but never swaps any: every round's course is the same. It
// alternates two of one six with two of another; from the 13th on (past what
// a round reaches) they'd run off the table, so they go round 36-41 here.
export const ORDER = [6, 0, 7, 1, 12, 18, 13, 19, 24, 30, 25, 31, 36, 37, 38, 39, 40, 41];
const SECTION = 1000;
// A Magnemite bobs 10 up and down, 12 degrees a frame (sin(n x 0.2094395):
// 0x86105950): sin of 0, 12, 24... degrees
const BOB = [0, 0.207912, 0.406737, 0.587785, 0.743145, 0.866025, 0.951057, 0.994522, 0.994522, 0.951057,
  0.866025, 0.743145, 0.587785, 0.406737, 0.207912, 0, -0.207912, -0.406737, -0.587785, -0.743145,
  -0.866025, -0.951057, -0.994522, -0.994522, -0.951057, -0.866025, -0.743145, -0.587785, -0.406737, -0.207912];

// The backdrops (image bank 221: the cave, its mouth, the meadow), two side by
// side 864 across, going by at half the scroll (0x86105CD8). They go by in the
// countdown too: its 100 frames (a step of 25, 0x86107DF0; state 3 runs them,
// 0x86100790, GO on its 100th: 0x87F006BC), and the play's clock starts at GO.
export const BACKDROP = 864, INTRO = 100;
export const CAVE = 0, MOUTH = 1, MEADOW = 2;
const BACKDROPS_AT = [-100, 764];
// The end: as the meadow comes, no more come on (it's past 0.95 x 864) and the
// cave stops once it's in place (x < 10); Jynx stands to its right, at 1.35 x 864
export const MEADOW_STOP = 10, JYNX_AT = BACKDROP * 1.35;
// Where they start (0x86104CAC): a zigzag down the left
export const START = [0, 1, 2, 3].map((z) => [-160.76952 - UNIT * 4 * (z % 2), Y_MAX - (z + 1) * 81.67091]);
// The CPUs (0x86109318): each frame they're ranked by hearts and given a way
// to play by level, from the best (the bits below; 0x8610A0A0, 0x8610A0B0,
// 0x8610A0C0); on easy and normal one that has this many hearts just roams
const AI_TABLE = [null, [0xc10, 1, 1, 1], [0x120, 0x210, 1, 1], [0x120, 1, 0x182, 0x140]];
const AI_ENOUGH = [null, 5, 9, null];
// what the bits mean (0x86102E8C): chase the leading person (4: aiming 12
// Golbat past them; 0x2000: 7), follow them (2), roam (0x1000: through the
// Magnemite; 1: round them), or go for hearts: as far right as 464.85
// (0x100) or 393.19 (0x200, else 321.54), even ones it can't reach in time
// (0x800), not minding how far left (0x10), minding crowds of hearts (0x40)
// or Magnemite in the way (0x80) twice as much
const CHASE = 4, CHASE_NEAR = 0x2000, FOLLOW = 2, ROAM = 0x1000, ROAM_SAFE = 1;
const FAR = 0x100, MID = 0x200, ANY = 0x800, NO_LEFT = 0x10, CROWDS = 0x40, MAGS_X2 = 0x80;
// where they roam (0x86104B2C): x from -158.63 (480.16 across), y from -127.33
// (245.01 up), and the box they're kept in on the way (0x86102B64)
const ROAM_X = -158.62593, ROAM_W = 480.16498, ROAM_Y = -127.32945, ROAM_H = 245.01274, ROAM_TOP = 117.68329;

const U = 4294967296;

// the level the game plays (0x861098CC): easy if all four are people
export function levelCode(level, cpus) { return cpus.some((c) => c) ? LEVELS[level] || 2 : 1; }

// The frame the play ends on (the cave stops): it doesn't depend on anything
// anyone does, only on the clock and the backdrops going by
export function endFrame() {
  const w = new World(0, "normal", [false, false, false, false]);
  for (let t = 0; w.end === null; t++) { w.t = t; w.backdrops(); }
  return w.end;
}

const sign = (v) => (v > 0 ? 1 : -1);
const clamp = (v, m) => (Math.abs(v) > m ? sign(v) * m : v);
function norm(x, y) {
  const d = Math.sqrt(y * y + x * x);
  return d !== 0 ? [x / d, y / d] : [x, y];
}
// the point at t along a -> b nearest p, and how far it is (0x8610167C)
function along(ax, ay, bx, by, px, py) {
  const a = ax - px, b = ay - py, ex = bx - px - a, ey = by - py - b;
  const l2 = ex * ex + ey * ey;
  const t = l2 !== 0 ? -((a * ex + b * ey) / l2) : 0;
  const cx = t * ex + a, cy = t * ey + b;
  return [Math.sqrt(cx * cx + cy * cy), t];
}

// One round's world. seats: which are people (the others are CPUs); step()
// runs a frame from the people's pads. The scene reads it all.
export class World {
  constructor(seed, level = "normal", cpus = [false, true, true, true]) {
    this.level = levelCode(level, cpus);
    this.seed = seed >>> 0; // the game's random numbers' state (rnd())
    this.t = -1; // the last frame run
    this.end = null; // the frame the play ended on
    this.ids = 0;
    this.events = [];
    // the Golbat, and what the game keeps for each player (0x8610AD20 + 0x8DE0): its hearts, a CPU's ways
    this.g = [0, 1, 2, 3].map((z) => ({
      z, human: !cpus[z], x: START[z][0], y: START[z][1], vx: 0, vy: 0,
      dash: false, flap: false, hurt: false, hit: false, timer: 0, hitT: HIT_FOR, glow: true,
      yaw: 0x3fff, face: 0, last: 0, hearts: 0, ai: cpus[z] ? 0x1000 : 0,
      dx: 1, dy: 0, tx: START[z][0], ty: START[z][1], ox: START[z][0], oy: START[z][1],
    }));
    this.mags = [];
    this.hearts = [];
    this.bgs = BACKDROPS_AT.map((x) => ({ x: x + (SCROLL / 2) * INTRO, img: CAVE }));
    this.mouth = false; // the cave's mouth has come
    this.jynx = null; // her x, once the meadow's come
    this.scroll = SCROLL;
    this.spawning = true;
    this.time = TIME;
    this.sec = 0; // the section (in ORDER), its next entry, and how far into it
    this.entry = 0;
    this.dist = 0;
    // each player's way to go (0x86104CAC: its own random numbers), then at GO a place to roam to (0x86104948)
    for (const g of this.g) {
      const a = (this.rnd() % 201) / 100 - 1, b = (this.rnd() % 201) / 100 - 1;
      [g.dx, g.dy] = a === 0 && b === 0 ? [1, 0] : norm(a, b);
    }
    for (const g of this.g) this.roamTo(g);
  }
  // the game's random numbers (0x800357EC: x * 1664525 + 1013904223)
  rnd() { return (this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0); }
  u() { return this.rnd() / U; }

  // ---- a frame (0x86109404) ----
  // pads: each person's [stick x (-64-64), a flap pressed this frame] (null: none)
  step(t, pads = []) {
    if (this.end !== null) return;
    this.t = t;
    this.cpus();
    if (this.spawning) this.course();
    for (const g of this.g) { this.golbat(g, pads[g.z]); g.timer++; g.hitT++; }
    for (const m of [...this.mags]) { if (this.magnemite(m)) m.timer++; }
    for (const h of [...this.hearts]) { if (this.heart(h)) h.timer++; }
    this.backdrops();
  }

  // the backdrops (0x86105CD8), Jynx (0x86107208) and the clock
  backdrops() {
    for (const b of this.bgs) {
      if (b.img === MEADOW) {
        if (b.x < BACKDROP * 0.95) this.spawning = false;
        if (b.x < MEADOW_STOP) this.scroll = 0;
        if (this.scroll !== 0) { // the last seconds: 3, 2, 1 (0xCF00) and the end (0xCF06)
          const left = Math.trunc((MEADOW_STOP - b.x) / (this.scroll / 2));
          if (left === 3 * FPS || left === 2 * FPS || left === FPS) this.events.push(["count", -1]);
          if (left === 0) this.events.push(["end", -1]);
        }
      }
      b.x += this.scroll / 2;
      if (b.x < -BACKDROP) {
        b.x += 2 * BACKDROP;
        if (this.time < 0) {
          if (!this.mouth) { b.img = MOUTH; this.mouth = true; continue; }
          b.img = MEADOW;
          this.jynx = JYNX_AT;
          for (const g of this.g) g.glow = false;
        }
      }
    }
    if (this.jynx !== null) this.jynx += this.scroll / 2;
    this.time--;
    if (this.scroll === 0 && this.end === null) this.end = this.t;
  }

  // ---- the course (0x86100418) ----
  course() {
    this.dist -= this.scroll;
    if (this.dist > SECTION) { this.dist = 0; this.sec++; this.entry = 0; }
    const list = SECTIONS[ORDER[this.sec < ORDER.length ? this.sec : 12 + ((this.sec - 12) % 6)]];
    while (this.entry < list.length) {
      const [at, h, what] = list[this.entry];
      if (!(at * SECTION < this.dist * 255)) break; // ((at / 255) x 1000 < dist)
      if (what === MAGNEMITE || what === 1 || (what === 2 && this.level >= 2)) this.addMagnemite(-(h / 255) * 444.18225 + 213.68527);
      else if (what === HEART) this.addHeart({ x: EDGE, y: 2 * (-(h / 255) * 213.68527) + 213.68527, kind: "course" });
      this.entry++;
    }
  }
  addMagnemite(y) {
    if (this.mags.length >= MAGS) return;
    this.mags.push({ id: ++this.ids, x: EDGE, y, y0: y, n: 0, timer: 0, flash: false, ox: EDGE, oy: y });
  }
  // a heart: kind "course" (it came with the course), "dropped" (knocked out of a
  // Golbat, which is its owner) or "thrown" (Jynx's, at the end)
  addHeart({ x, y, vx = 0, vy = 0, kind, owner = -1, knocked = false }) {
    if (this.hearts.length >= HEARTS) return;
    this.hearts.push({ id: ++this.ids, x, y, vx, vy, kind, owner, knocked, got: false, timer: 0, ox: x, oy: y });
  }

  // ---- the CPUs' ways (0x86109318: 0x86108C90, 0x86108EE4, 0x8610916C) ----
  cpus() {
    const list = this.g.filter((g) => !g.human), n = list.length;
    if (!n) return;
    for (let i = 0; i < 3 * n; i++) { // (shuffled, then sorted by hearts: ties any way)
      const a = this.rnd() % n, b = this.rnd() % n;
      [list[a], list[b]] = [list[b], list[a]];
    }
    for (let k = n - 1; k > 0; k--) {
      for (let j = 0; j < k; j++) if (list[j].hearts < list[j + 1].hearts) [list[j], list[j + 1]] = [list[j + 1], list[j]];
    }
    const enough = AI_ENOUGH[this.level];
    list.forEach((g, i) => {
      g.ai = AI_TABLE[this.level][i];
      if (enough !== null && g.hearts >= enough) g.ai = (g.ai | ROAM) & ~(CHASE_NEAR | CHASE | FOLLOW);
    });
    // one ahead of them all: the CPU with the fewest goes after them
    const lead = this.leader(null), last = list[n - 1];
    if (!lead || n < 2) return;
    const h = lead.hearts, best = list[0].hearts;
    let chase = null;
    if (this.level === 1) { if (h >= 9 && best * 3 < h) chase = false; }
    else if (this.level === 2) { if (h >= 6 && best < h) chase = best * 2 < h; }
    else if (h >= 4 && best < h) chase = best * 2.33 < h;
    if (chase === true) last.ai = (last.ai | CHASE) & ~FOLLOW;
    else if (chase === false) last.ai = (last.ai | FOLLOW) & ~CHASE;
  }
  // the person with the most hearts (any), not `but` (0x86102630)
  leader(but) {
    let best = null, most = 0;
    for (const g of this.g) if (g !== but && g.human && g.hearts > most) { most = g.hearts; best = g; }
    return best;
  }

  // ---- a Golbat in the play (0x8610362C) ----
  golbat(g, pad) {
    g.ox = g.x; g.oy = g.y;
    g.vx *= DRAG;
    g.vy *= DRAG;
    g.vy += GRAVITY;
    const pads = g.human ? this.pad(g, pad) : this.think(g);
    if (pads & 0x8000) this.flag(g, "flap");
    if (g.hurt) {
      if (g.timer >= HURT_FOR) g.hurt = false;
      else g.yaw = 0x3fff;
    } else {
      if (pads & 0x100) g.face = 0;
      else if (pads & 0x200) g.face = 1;
      else if (Math.abs(g.vx) < 1) g.face = 0;
      this.turn(g);
      g.dash = Math.sqrt(g.vx * g.vx + g.vy * g.vy) > DASH;
    }
    g.x += g.vx;
    g.y += g.vy;
    for (const o of this.g) if (o !== g) this.bump(g, o);
    g.vx = clamp(g.vx, VMAX);
    g.vy = clamp(g.vy, VMAX);
    this.bounds(g);
    if (g.flap && g.timer >= FLAP_FOR) g.flap = false; // (0x86102FF0)
    if (g.hit && g.hitT >= HIT_FOR) g.hit = false;
    g.last = pads;
  }
  // a person's pad (0x8610320C): the stick across, A to flap
  pad(g, pad) {
    const x = pad ? Math.max(-64, Math.min(64, pad[0] | 0)) : 0;
    let pads = 0;
    g.vx += x * SPD_X;
    if (pad && pad[1]) { g.vy += FLAP; pads = 0x8000; }
    if (x > 0) pads |= 0x100;
    else if (x < 0) pads |= 0x200;
    return pads;
  }
  // which way it faces: right, or left while it's pushed that way (turning 15% of the way a frame)
  turn(g) {
    let deg = g.yaw * 0.005493248, to = 0;
    if (deg < 0) deg += 360;
    if (g.face === 0) to = deg >= 0 && deg <= 280 ? 90 - deg : 450 - deg;
    else to = deg >= 100 ? 270 - deg : -90 - deg;
    const v = (deg + to * 0.15) * 182.04167;
    g.yaw = ((Math.trunc(v >= 0 ? v + 0.5 : v - 0.5) + 0x8000) & 0xffff) - 0x8000;
  }
  // set a Golbat's state (0x86100E20)
  flag(g, what) {
    if (what === "flap") { if (!g.hurt) { g.flap = true; g.timer = 0; } }
    else if (what === "hurt") { g.flap = false; g.hit = false; g.hurt = true; g.timer = 0; }
    else if (what === "hit") { g.hit = true; g.timer = 0; g.hitT = 0; }
  }
  // the edges (0x86100BE0): it bounces off the floor, stops at the roof and slows at the sides
  bounds(g) {
    if (g.y < FLOOR) { g.y = FLOOR; if (g.vy < 0) g.vy *= -0.5; }
    if (g.y > Y_MAX) { g.y = Y_MAX; g.vy *= 0; }
    if (g.x < X_MIN) { g.x = X_MIN; g.vx *= 0.5; }
    if (g.x > X_MAX) { g.x = X_MAX; g.vx *= 0.5; }
  }
  // two Golbat bump (0x8610109C): pushed apart and bounced; one dashing into
  // one that isn't knocks a heart out of it
  bump(a, b) {
    let dx = a.x - b.x, dy = a.y - b.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (!(d < BUMP)) return;
    if (d !== 0) { dx /= d; dy /= d; } else { dx = 1; dy = 0; }
    const rx = a.vx - b.vx, ry = a.vy - b.vy;
    const vn = rx * dx + ry * dy;
    let ka = 0.8, kb = 0.8;
    if (a.dash && !b.dash) { ka = 0.5; this.knock(b); }
    else if (b.dash && !a.dash) { kb = 0.5; this.knock(a); }
    const push = BUMP - d;
    const px = push * dx * 0.5, py = push * dy * 0.5;
    a.x += px; a.y += py;
    b.x -= px; b.y -= py;
    this.bounds(b);
    const ax = dx * vn, ay = dy * vn;
    a.vx += ax * -(1 + PLAYER_BND) * ka;
    a.vy += ay * -(1 + PLAYER_BND) * ka;
    b.vx += ax * (1 + PLAYER_BND) * kb;
    b.vy += ay * (1 + PLAYER_BND) * kb;
  }
  knock(g) {
    this.events.push(["bump", g.z]); // (0xF01)
    this.drop(g, true);
    this.flag(g, "hit");
  }
  // a heart knocked out of g (0x86100F1C), off towards a random spot
  drop(g, knocked) {
    if (g.hearts <= 0) return;
    const [dx, dy] = norm((this.u() * 685.94995 + X_MIN) * 0.7 - g.x, (this.u() * 408.35455 + FLOOR) * 0.7 - g.y);
    this.addHeart({ x: g.x, y: g.y, vx: dx * 15 - this.scroll, vy: dy * 15, kind: "dropped", owner: g.z, knocked });
    g.hearts--;
    this.events.push(["drop", g.z]); // (0xF05)
  }

  // ---- a Magnemite (0x86105950): false once it's gone ----
  magnemite(m) {
    m.ox = m.x; m.oy = m.y;
    m.n++;
    m.x += this.scroll;
    m.y = BOB[m.n % 30] * 10 + m.y0;
    for (const g of this.g) {
      if (g.hurt) continue;
      let dx = g.x - m.x, dy = g.y - m.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (!(d < HIT)) continue;
      m.timer = 0;
      m.flash = true;
      if (d !== 0) { dx /= d; dy /= d; } else { dx = 0; dy = -1; }
      g.vx += dx * ENEMY_BND;
      g.vy += dy * ENEMY_BND;
      const n = Math.trunc((g.hearts + 1) * DROP_RATE) || 1;
      for (let i = 0; i < n; i++) this.drop(g, false);
      this.flag(g, "hurt");
      this.events.push(["zap", g.z, m.id]); // (0xF02)
    }
    if (m.x < -EDGE) { this.mags.splice(this.mags.indexOf(m), 1); return false; }
    if (m.flash && m.timer >= FLASH_FOR) m.flash = false;
    return true;
  }

  // ---- a heart (0x86106C54): false once it's gone ----
  heart(h) {
    h.ox = h.x; h.oy = h.y;
    let got = false, gone = false;
    if (h.got) gone = h.timer >= GOT_FOR;
    else if (h.kind === "dropped" || h.kind === "course") {
      h.vx *= DRAG; // (0x86106710)
      h.vy *= DRAG;
      h.x += h.vx + this.scroll;
      h.y += h.vy;
      if (h.kind === "dropped") { // (0x86106688)
        if (h.y > Y_MAX) { h.y = Y_MAX; h.vy *= -1; }
        if (h.y < FLOOR) { h.y = FLOOR; h.vy *= -1; }
      }
      got = this.catch(h);
    }
    if (h.x < -EDGE) gone = true;
    if (got) { h.got = true; h.timer = 0; h.vx = 0; h.vy = 0; }
    if (gone) { this.hearts.splice(this.hearts.indexOf(h), 1); return false; }
    return true;
  }
  // who catches heart h (0x86106504): the first that's on it, but not the one
  // it was knocked out of (nor anyone, if a dash knocked it) for 16 frames
  catch(h) {
    for (const g of this.g) {
      if (!(((g.z !== h.owner && !h.knocked) || h.timer >= MINE_FOR) && Math.abs(h.x - g.x) < GRAB && Math.abs(h.y - g.y) < GRAB)) continue;
      g.hearts = Math.min(HEARTS_MAX, g.hearts + 1);
      this.events.push(["got", g.z, h.id]); // (0xF04)
      return true;
    }
    return false;
  }

  // ---- a CPU (0x86102E8C): what it does, as the pad it'd take to do it ----
  think(g) {
    const vx = g.vx, vy = g.vy, f = g.ai;
    if (f & CHASE) this.chase(g, 12);
    else if (f & CHASE_NEAR) this.chase(g, 7);
    else if (f & FOLLOW) this.follow(g);
    else if (f & ROAM) this.roam(g, false);
    else if (f & ROAM_SAFE) this.roam(g, true);
    else this.seek(g);
    let pads = 0;
    if (g.vx < vx) pads = 0x200;
    else if (vx < g.vx) pads = 0x100;
    if (vy <= g.vy) { // a flap (or none, which counts as one): not two frames running
      if (g.last & 0x8000) g.vy = vy;
      else pads |= 0x8000;
    }
    return pads;
  }
  // go for the best heart (0x86102D50)
  seek(g) {
    const f = g.ai;
    const right = f & FAR ? 464.8498 : f & MID ? 393.1944 : X_MAX;
    const weights = f & NO_LEFT ? [1, 0, 1, 1] : f & CROWDS ? [1, 1, 2, 1] : f & MAGS_X2 ? [1, 1, 1, 2] : [1, 1, 1, 1];
    const h = this.pick(g, right, !(f & ANY), ...weights);
    let dx = 0, dy = 0, d = 0;
    if (h) { // (0x86101AEC: a little ahead of it)
      dx = h.x + this.scroll * 4 - g.x;
      dy = h.y - g.y;
      d = Math.sqrt(dy * dy + dx * dx);
      [dx, dy] = norm(dx, dy);
    }
    this.steer(g, dx * 0.3, dy * 0.3, d);
  }
  // the heart it likes best (0x86101964): near, far to the left, among others, no Magnemite on the way
  pick(g, right, reach, wNear, wLeft, wCrowd, wMags) {
    let best = 3.4028235e38, out = null;
    for (const h of this.hearts) {
      if (!(h.x < right + 30) || !(!reach || this.reachable(g, h.x, h.y))) continue;
      const dx = g.x - h.x, dy = g.y - h.y;
      let s = Math.sqrt(dx * dx + dy * dy) * wNear + (EDGE - h.x) * 0.2 * wLeft;
      s -= this.crowd(h.x, h.y) * wCrowd;
      s += this.inTheWay(g, h.x, h.y) * wMags;
      if (s < best) { best = s; out = h; }
    }
    return out;
  }
  // whether it can get to a heart at x, y before it's gone (0x861018D8)
  reachable(g, x, y) {
    if (x < X_MIN) return false;
    if (x < g.x) {
      const dx = g.x - x, dy = g.y - y;
      if (2 * (x - X_MIN) < Math.sqrt(dx * dx + dy * dy)) return false;
    }
    return true;
  }
  crowd(x, y) { // (0x861015AC)
    let n = 0;
    for (const h of this.hearts) {
      const dx = x - h.x, dy = y - h.y, v = CROWD - Math.sqrt(dx * dx + dy * dy);
      if (v > 0) n += v;
    }
    return n;
  }
  inTheWay(g, x, y) { // (0x86101758)
    let n = 0;
    for (const m of this.mags) {
      const [d, t] = along(g.x, g.y, m.x, m.y, x, y);
      if (t > 0 && t < 1 && d < NEAR) n += 70;
    }
    return n;
  }
  // head along dx, dy (0x861024C8): round any Magnemite near, else on its way
  // (braking for one in the way), else roam
  steer(g, dx, dy, d) {
    [g.dx, g.dy] = norm(g.dx + dx, g.dy + dy);
    let [ax, ay] = this.dodge(g);
    if (ax !== 0 || ay !== 0) {
      [ax, ay] = norm(ax, ay);
      [g.dx, g.dy] = norm(g.dx + ax * 1.5, g.dy + ay * 1.5);
      return;
    }
    if (d > 0) {
      const [bx, by] = this.brake(g);
      this.push(g, bx + ((g.dx * d) / 5 - g.vx), by + ((g.dy * d) / 5 - g.vy));
      this.cap(g);
      return;
    }
    this.roam(g, true);
  }
  // away from the Magnemite near (0x86101F60, 0x86101BD8): [0, 0] if there are none, else done
  dodge(g) {
    let ax = 0, ay = 0;
    for (const m of this.mags) {
      let dx = g.x - m.x, dy = g.y - m.y;
      if (!(Math.abs(dx) < NEAR) || !(Math.abs(dy) < NEAR)) continue;
      const d = Math.sqrt(dx * dx + dy * dy);
      [dx, dy] = norm(dx, dy);
      if (d < NEAR) { ax += dx * (NEAR - d); ay += dy * (NEAR - d); }
    }
    if (ax === 0 && ay === 0) return [0, 0];
    ax = clamp(ax, STICK);
    g.vx += ax;
    if (ay > 0) g.vy += FLAP;
    return [ax, ay];
  }
  // slow for a Magnemite on the way (0x861021A8): where it'll be in 20 frames, cut short
  brake(g) {
    const px = g.x + g.vx * 20, py = g.y + g.vy * 20;
    let tmin = 1;
    for (const m of this.mags) {
      const [d, t] = along(g.x, g.y, px, py, m.x, m.y);
      if (d < NEAR && t > 0 && t < 1 && t < tmin) tmin = t;
    }
    return [((px - g.x) * tmin) / 20 - g.vx, ((py - g.y) * tmin) / 20 - g.vy];
  }
  // the stick that way, and a flap if it's up and it's not rising fast (0x86101E04)
  push(g, dx, dy) {
    g.vx += clamp(dx, STICK);
    if (dy > 0 && g.vy < FLAP) g.vy += FLAP;
  }
  cap(g) { // (0x861023D4)
    g.vx = clamp(g.vx, VMAX);
    if (g.vy > VMAX) g.vy -= FLAP;
    if (g.vy < -VMAX) g.vy += FLAP;
  }
  // roam to its spot, a new one once it's there (0x86102C08); safe: round the Magnemite
  roam(g, safe) {
    let dx = 0, dy = 0;
    if (safe) [dx, dy] = this.dodge(g);
    if (!safe || (dx === 0 && dy === 0)) {
      dx = g.x < ROAM_X ? ROAM_X - g.x : g.tx - g.x; // (0x86102B64)
      dy = g.y < ROAM_Y ? ROAM_Y - g.y : g.y > ROAM_TOP ? ROAM_TOP - g.y : g.ty - g.y;
    }
    if (Math.abs(g.tx - g.x) < UNIT && Math.abs(g.ty - g.y) < UNIT) this.roamTo(g);
    this.push(g, dx, dy);
    this.cap(g);
  }
  roamTo(g) { // (0x86104B2C)
    g.tx = this.u() * ROAM_W + ROAM_X;
    g.ty = this.u() * ROAM_H + ROAM_Y;
  }
  // after the leading person, aiming k Golbat past them (0x86102720)
  chase(g, k) {
    const l = this.leader(g);
    if (!l) return this.seek(g);
    const [ax, ay] = this.dodge(g);
    if (ax !== 0 || ay !== 0) return;
    const [nx, ny] = norm(l.x - g.x, l.y - g.y);
    const tx = ax + (l.x + nx * UNIT * k - g.x), ty = ay + (l.y + ny * UNIT * k - g.y);
    g.vx += sign(tx) * STICK;
    if (ty > 0) g.vy += FLAP;
    this.cap(g);
  }
  // follow the leading person; close to them, go for hearts (0x86102908)
  follow(g) {
    const l = this.leader(g);
    if (!l) return this.seek(g);
    const ex = l.x - g.x, ey = l.y - g.y;
    if (!(UNIT * 3 < Math.abs(ex)) && !(UNIT * 3 < Math.abs(ey))) return this.seek(g);
    const [ax, ay] = this.dodge(g);
    if (ax !== 0 || ay !== 0) return;
    g.vx += clamp(ax + ex, STICK);
    if (ay + ey > 0) g.vy += FLAP;
    this.cap(g);
  }

  // ---- for running a frame again (online) ----
  save() {
    const copy = (o) => ({ ...o });
    return {
      t: this.t, end: this.end, ids: this.ids, seed: this.seed,
      g: this.g.map(copy), mags: this.mags.map(copy), hearts: this.hearts.map(copy), bgs: this.bgs.map(copy),
      mouth: this.mouth, jynx: this.jynx, scroll: this.scroll, spawning: this.spawning, time: this.time,
      sec: this.sec, entry: this.entry, dist: this.dist,
    };
  }
  load(s) {
    Object.assign(this, this.save.call(s));
    this.events = [];
  }

  // the scores so far: each player's hearts
  get scores() { return this.g.map((g) => g.hearts); }
  // a fingerprint of the world, exact, to check two runs of it agree (the tests;
  // tools/golbat_rules.py's is the same)
  digest() {
    const parts = [this.t, this.seed, this.sec, this.entry, hex(this.dist), this.time, this.ids];
    for (const g of this.g) parts.push(hex(g.x), hex(g.y), hex(g.vx), hex(g.vy), g.hearts, +g.dash, +g.hurt, g.timer, g.ai, g.last);
    for (const m of this.mags) parts.push(m.id, hex(m.x), hex(m.y), m.timer);
    for (const h of this.hearts) parts.push(h.id, hex(h.x), hex(h.y), hex(h.vx), hex(h.vy), +h.got, h.owner, h.timer);
    for (const b of this.bgs) parts.push(hex(b.x), b.img);
    return parts.join(",");
  }
}

const view = new DataView(new ArrayBuffer(8));
function hex(v) {
  view.setFloat64(0, v);
  return view.getUint32(0).toString(16).padStart(8, "0") + view.getUint32(4).toString(16).padStart(8, "0");
}
