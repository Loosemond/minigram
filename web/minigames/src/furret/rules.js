// Furret's Frolic's rules, as the game's code module (#50) has them
// (docs/minigames.md has where each number is). Everything counts in the
// game's frames, 30 a second, and its units: the field (object 155) lies about
// the middle, y up; the camera looks at it from the +x +z corner, 45 degrees
// round and 50.5 down, so the goals' four lanes go up, down, left and right.
//
// Four Furret stand in the middle of the field, each facing its own goal: a
// checkered lane running out of the field (1P's at the bottom, 2P's on the
// right, 3P's on the left, 4P's at the top). Poké Balls drop onto the ramps
// in the corners and roll down into the middle, a 3 x 3 grid of hollows: the
// D-pad hops a Furret into the hollow that way ("into the grass"), letting go
// hops it back to the middle one, and A swings its tail, which bats a ball it
// touches towards its goal. A ball rolled over a goal's line scores its value
// for that goal's player: a Poké Ball 1, a Great Ball 2, an Ultra Ball 3, a
// Master Ball 5. The most points when the minute's up wins.
//
// The four share one world, so it runs from everyone's pads at once and the
// CPUs think in it as the game's do. Every device and the server run the same
// world from the same pads (online, devices run it again from a saved frame
// when someone's pad comes in late: game.js). So it only ever uses + - * / and
// square roots, in the game's order (in doubles: the game's floats are single,
// but each side's sums come out the same). tools/furret_rules.py is the rooms
// server's copy: keep the two the same.

export const FPS = 30;
export const LEVELS = { easy: 1, normal: 2, hard: 3 };

// The game's tuning (its debug menu's, set at 0x86202C14; speeds a step, as on a 60 Hz TV)
export const STEPS = 3; // "PHYSICS": steps a frame (0x86203C58)
export const TIME = 60 * FPS; // a minute (0x86202AC4)
export const HURRY = 30 * FPS; // the last 30 s: the tune speeds up (0x86204A9C)
const GRAVITY = -120 / 60; // "GRAVITY"
const SP_DEC = 0.9700000286102295; // "SP DEC": what a ball's speed keeps each step
const F_BOUND = 0.6000000238418579; // "F_BOUND": its bounce off the field (it keeps 1 - 2 x this of the speed into it)
const SHOT_PW = 660 / 60; // "SHOT_PW": a tail's bat
const SPD_MX = 2700 / 60; // "SPD MX": a ball's top speed (by its kind: SPEED below)
const EGG_SIZE = 0.800000011920929; // "EGG SIZE": a ball's scale (x 0.75 x its kind's size)
const SO_POS = 1.5, SO_SC = 1; // "SO POS", "SO SC": a Furret's place behind its spot, and its scale
const REACH = 108.5; // a tail reaches this far round its tip (0x8620581C)
const SPAWN_EVERY = 11; // frames between balls (0x86204A9C)...
const GONE = -200; // ...and one that falls below this is gone (0x86201A58)
const C = 0.7071067690849304; // (sqrt(1/2), as the game has it)
const U = 4294967296;

// The balls' kinds (0x86201E70): points, size and how fast they go
export const KINDS = { 1: "poke", 2: "great", 3: "ultra", 5: "master" };
const SIZE = { 1: 1, 2: 1.5, 3: 2, 5: 2.5 };
const SPEED = { 1: 1, 2: 0.949999988079071, 3: 0.8999999761581421, 5: 0.800000011920929 };
export const ballScale = (k) => EGG_SIZE * 0.75 * SIZE[k]; // (the model's: a ball 100 across is this big)
const radius = (k) => EGG_SIZE * 0.75 * 100 * SIZE[k];
export const RADIUS = { 1: radius(1), 2: radius(2), 3: radius(3), 5: radius(5) };
// where they drop in, above the ramps (0x86201E70; in an order shuffled every four: 0x8620169C)
const SPAWNS = [[950, 700, 0], [-950, 700, 0], [0, 700, 950], [0, 700, -950]];

// The spots (0x86208F28): the middle hollow, and the four round it with the
// D-pad buttons that hop there (right, down, up, left on the screen); the way
// a tail bats towards each goal (the same at every spot)
export const SPOTS = [
  { x: 0, z: 0, button: 0x8000 },
  { x: 282.84271240234375, z: -282.84271240234375, button: 0x0100 },
  { x: 282.84271240234375, z: 282.84271240234375, button: 0x0400 },
  { x: -282.84271240234375, z: -282.84271240234375, button: 0x0800 },
  { x: -282.84271240234375, z: 282.84271240234375, button: 0x0200 },
];
export const DIRS = [[-C, 0, -C], [C, 0, -C], [-C, 0, C], [C, 0, C]];
// each player's goal (0x862028F0: 1P blue at the bottom, 2P green on the right, 3P red on the left, 4P yellow
// at the top), and the spot a Furret starts on, across the middle from it (0x86206334)
export const GOALS = [3, 1, 2, 0];
const START = [2, 4, 1, 3]; // (by goal)
export const YAW = [-0x6000, 0x6000, -0x2000, 0x2000]; // (by goal: the way a Furret faces, 65536 to a turn)
// Furret's tail tip through its swing (0x862090C0: clip 2, from frame 4), from where it stands
const TAIL = [
  [0, 5.837299823760986, -0.1022999957203865], [1.0230000019073486, 61.128902435302734, 20.05390167236328],
  [1.1779999732971191, 126.83340454101562, 19.433900833129883], [1.1159999370574951, 152.91371154785156, 6.230999946594238],
  [1.0601999759674072, 141.9862060546875, -1.3174999952316284], [0.9858000874519348, 111.51319885253906, -7.102099895477295],
  [0.8896999955177307, 73.75830078125, -10.282699584960938], [0.7781000137329102, 39.385498046875, -10.425299644470215],
  [0.6571999788284302, 18.816999435424805, -8.810200691223145], [0.536300003528595, 8.915599822998047, -6.810699939727783],
  [0.4122999906539917, 1.8352000713348389, -4.569400310516357], [0.2914000153541565, -3.103100061416626, -2.405600070953369],
  [0.17669999599456787, -6.079100131988525, -0.8586999773979187], [0.07750000059604645, -6.900599956512451, -0.17669999599456787],
  [0.0030999998562037945, -5.285499572753906, -0.15809999406337738], [-0.05270000174641609, -1.4074000120162964, -0.2944999933242798],
  [-0.08060000091791153, 3.8904998302459717, -0.3254999816417694], [-0.08989999443292618, 8.329700469970703, -0.31310001015663147],
  [-0.0868000015616417, 10.614400863647461, -0.26660001277923584], [-0.07440000027418137, 11.206499099731445, -0.2076999843120575],
  [-0.055799998342990875, 10.636100769042969, -0.1394999921321869], [-0.03720000013709068, 9.389900207519531, -0.07750000059604645],
  [-0.01860000006854534, 7.867800235748291, -0.05270000174641609], [-0.0030999998562037945, 6.469700336456299, -0.08060000091791153],
  [0, 5.837299823760986, -0.1022999957203865],
];
// Furret's clips (object 142): 0 popping up, 1 standing, 2 a swing of its tail, 3 a cheer, 4 sad, 5 a hop
// (held at its end), 6 landing (held)
export const CLIP = { up: 0, stand: 1, swing: 2, cheer: 3, sad: 4, hop: 5, land: 6 };
export const CLIP_LEN = [24, 24, 29, 102, 129, 5, 7];
const HOLD = [false, false, false, false, false, true, true];
// the frame a clip that goes round goes back to (its header's +6: 0x8003E7BC). Its own are 0, but
// the show writes the cheer's as 66 and the sulk's as 116 (0x86205FE8, 0x86206190)
export const LOOP = [0, 0, 0, 0x42, 0x74, 0, 0];
// GO comes 80 frames after the Furret pop up (module #64's countdown, a step of 20: they're made,
// 0x86206334, as it starts, 0x86204EB8): clip 0 is at frame 80 % 24 at GO, and the play's first
// frame is the one after
export const COUNTDOWN = 4 * 20;

// The CPUs (0x862026C8): their skills, by the COM level (the first ones go
// to the CPUs, shuffled); and what each skill does (0x86206D20)
const SKILLS = [[0, 0, 0, 0], [1, 1, 0, 0], [2, 2, 1, 0], [3, 3, 3, 2]];

// The field's floor (0x8620DF60): four pieces, each a wedge round one of the
// axes (x -, z -, z +, x +), its corners and its triangles; each triangle's
// plane is worked out as the game does (0x862005B4)
const MESH = [
  [[-1084,336,0,-706,251,-1,-704,260,-51,-1082,345,-51,-1157,119,824,-1124,-128,857,-579,195,269,-578,195,-270,
    -1123,-128,-855,-1154,119,-824,-579,195,269,-1414,201,566,-1157,119,824,-1082,345,51,-704,260,51,-312,114,0,
    -283,74,0,-283,74,0,-312,114,0,-1413,201,-564,-849,257,0,-578,195,-270,-1154,119,-824,0,74,283,283,74,0,0,-46,
    0,-283,74,0,0,74,-283,-283,-46,-283,-290,75,559,-283,-46,283,-290,75,559,-559,75,290,-1124,-128,857,-283,-46,
    283,0,74,283,-283,74,0,-290,75,-559,-559,75,-290,-283,-46,-283,-559,75,290,-559,75,-290,-290,75,-559,-853,
    -128,-1125,-578,195,-270,-559,75,-290,-1123,-128,-855,-290,75,559,0,74,-283,-1124,-128,857,-559,75,290,-579,
    195,269,-1123,-128,-855,-859,-128,1122,-283,74,0,0,-46,0,-849,257,0,-1413,201,-564,-1978,290,1,-579,195,269,
    -312,114,0,-566,160,0,-578,195,-270,-283,74,0,-579,195,269,-559,75,290,-1978,290,1,-1414,201,566,-849,257,0,
    -566,160,0,-579,195,269,-312,114,0,-578,195,-270],
   [0,1,2,0,2,3,4,5,6,7,8,9,10,11,12,0,13,14,0,14,1,15,16,7,6,17,18,19,20,21,22,19,21,23,24,25,26,27,28,25,26,23,
    29,23,30,25,24,27,31,32,33,34,35,36,37,38,39,36,40,34,41,42,43,44,45,46,34,40,47,39,48,37,49,50,51,43,52,41,
    33,53,31,39,38,36,45,44,54,48,36,55,56,57,58,59,60,61,62,56,61,63,64,65,66,67,68,69,68,70,69,71,72,70,68,67]],
  [[0,336,-1084,1,251,-706,51,260,-704,51,345,-1082,0,257,-849,566,201,-1414,1,212,-1978,-51,345,-1082,-51,260,
    -704,268,195,-581,-822,119,-1156,-853,-128,-1125,-271,195,-577,-271,195,-577,-564,201,-1413,-822,119,-1156,0,
    74,283,283,74,0,0,-46,0,-283,74,0,0,74,-283,-283,-46,-283,268,195,-581,859,-128,-1122,826,119,-1155,283,-46,
    -283,-290,75,-559,-559,75,-290,559,75,-290,0,74,-283,0,114,-312,-290,75,-559,283,-46,-283,559,75,-290,290,75,
    -559,-559,75,-290,-290,75,-559,-853,-128,-1125,1124,-128,-857,859,-128,-1122,290,75,-559,1,212,-1978,-564,201,
    -1413,0,257,-849,268,195,-581,290,75,-559,859,-128,-1122,559,75,-290,-283,-46,-283,0,74,-283,-290,75,-559,
    -1123,-128,-855,0,74,-283,-271,195,-577,-290,75,-559,0,74,-283,-559,75,-290,-283,74,0,0,-46,0,0,114,-312,-271,
    195,-577,0,114,-312,0,160,-566,268,195,-581,826,119,-1155,566,201,-1414,268,195,-581,0,160,-566,0,257,-849,
    -271,195,-577,0,114,-312],
   [0,1,2,0,2,3,4,5,6,0,7,8,0,8,1,5,4,9,10,11,12,13,14,15,13,4,14,16,17,18,19,20,21,18,19,16,18,17,20,22,23,24,25,
    20,17,26,27,21,17,28,25,12,29,30,11,31,12,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,40,47,38,48,49,50,37,
    51,35,52,53,54,34,49,32,45,44,55,48,56,57,49,57,58,59,55,44,60,61,62,63,43,62,64,65,66,67,68,69,67,70,66]],
  [[-268,195,581,-859,-128,1122,-826,119,1155,0,336,1084,51,345,1082,51,260,704,-1,251,706,-51,260,704,-51,345,
    1082,-1,212,1978,564,201,1413,0,257,849,0,74,283,283,74,0,0,-46,0,283,-46,283,290,75,559,559,72,290,-283,74,0,
    -290,75,559,-283,-46,283,822,119,1156,853,-128,1125,271,195,577,0,74,283,0,114,312,0,74,-283,0,114,312,0,74,
    283,-290,75,559,-290,75,559,-559,75,290,-1124,-128,857,853,-128,1125,1123,-128,855,559,72,290,-283,-46,283,0,
    74,283,-283,74,0,-268,195,581,-290,75,559,-859,-128,1122,290,75,559,-559,75,290,-290,75,559,283,74,0,283,-46,
    283,853,-128,1125,290,75,559,271,195,577,-859,-128,1122,0,74,-283,0,-46,0,0,160,566,0,114,312,-268,195,581,0,
    257,849,271,195,577,0,74,283,-566,201,1414,-1,212,1978,564,201,1413,-826,119,1155,-566,201,1414,-268,195,581,
    271,195,577,564,201,1413,822,119,1156,0,257,849],
   [0,1,2,3,4,5,3,5,6,3,6,7,3,7,8,9,10,11,12,13,14,15,12,16,15,17,13,14,18,12,19,12,20,21,22,23,23,24,25,14,13,26,
    27,28,0,16,17,15,29,0,28,30,31,32,33,34,35,36,37,38,39,40,41,35,42,33,38,43,36,36,43,44,45,37,46,47,48,49,32,
    50,30,51,38,52,53,54,55,53,56,57,58,49,48,55,56,53,57,54,53,56,59,60,57,56,61,62,63,64,65,66,67,63,68,64]],
  [[1084,336,0,1082,345,-51,704,260,-51,706,251,1,849,257,0,1413,201,564,1978,212,-1,704,260,51,1082,345,51,1157,
    119,-824,1124,-128,-857,579,195,-269,0,74,283,283,74,0,0,-46,0,283,-46,283,290,75,559,559,72,290,283,74,0,312,
    114,0,312,114,0,283,74,0,578,195,270,-283,74,0,0,74,-283,853,-128,1125,1123,-128,855,559,72,290,1123,-128,855,
    1154,119,824,283,-46,-283,290,75,559,283,74,0,559,75,-290,283,-46,-283,578,195,270,559,72,290,1123,-128,855,
    290,75,-559,1124,-128,-857,859,-128,-1122,290,75,-559,1124,-128,-857,559,75,-290,579,195,-269,559,75,-290,0,
    74,283,283,-46,283,0,74,-283,283,74,0,-283,74,0,0,-46,0,566,160,0,312,114,0,578,195,270,849,257,0,579,195,
    -269,283,74,0,1978,212,-1,1414,201,-566,1413,201,564,1154,119,824,1157,119,-824],
   [0,1,2,0,2,3,4,5,6,0,3,7,0,7,8,9,10,11,12,13,14,15,12,16,15,17,13,11,18,19,20,21,22,14,23,12,14,13,24,16,17,15,
    25,26,27,22,28,29,30,24,13,27,31,25,32,33,34,35,36,37,34,33,38,39,40,41,42,43,44,41,45,39,32,46,47,38,48,34,
    49,44,43,48,50,51,52,53,54,52,55,56,54,55,52,36,35,57,56,53,52,58,59,55,60,55,54,61,60,54,56,59,62,56,55,59]],
];
export const PIECES = MESH.map(([v, t]) => {
  const verts = [];
  for (let i = 0; i < v.length; i += 3) verts.push([v[i], v[i + 1], v[i + 2]]);
  const tris = [];
  for (let i = 0; i < t.length; i += 3) {
    const a = verts[t[i]], b = verts[t[i + 1]], c = verts[t[i + 2]];
    // its normal (0x800359D0), made a unit long (0x80035AF0)
    const n = [
      (b[1] - a[1]) * (c[2] - b[2]) - (c[1] - b[1]) * (b[2] - a[2]),
      (b[2] - a[2]) * (c[0] - b[0]) - (c[2] - b[2]) * (b[0] - a[0]),
      (b[0] - a[0]) * (c[1] - b[1]) - (c[0] - b[0]) * (b[1] - a[1]),
    ];
    unit(n);
    const d = -((n[0] * a[0] + n[1] * a[1]) + n[2] * a[2]);
    // (the box round it: no ball further off than its radius can touch it)
    const lo = [0, 1, 2].map((k) => Math.min(a[k], b[k], c[k])), hi = [0, 1, 2].map((k) => Math.max(a[k], b[k], c[k]));
    tris.push({ a, b, c, n, d, lo, hi });
  }
  return tris;
});

// the level the game plays: with four people, the CPUs' don't matter
export function levelCode(level, cpus) { return cpus.some((c) => c) ? LEVELS[level] || 2 : 1; }

// ---- the vector helpers ----
// v a unit long (0x80035AF0: times 1 over its length)
function unit(v) {
  const k = 1 / Math.sqrt((v[0] * v[0] + v[1] * v[1]) + v[2] * v[2]);
  v[0] *= k; v[1] *= k; v[2] *= k;
}
// v a unit long, dividing (module #65's 0x87D005E8): its length was
function unitLen(v) {
  const l = Math.sqrt((v[0] * v[0] + v[1] * v[1]) + v[2] * v[2]);
  if (l !== 0) { v[0] /= l; v[1] /= l; v[2] /= l; }
  return l;
}
// how far along dir from p a plane is (0x86207EB0)
function across(t, p, dir) {
  const k = (t.n[0] * dir[0] + t.n[1] * dir[1]) + t.n[2] * dir[2];
  if (k === 0) return 0;
  return -(((t.n[0] * p[0] + t.n[1] * p[1]) + t.n[2] * p[2]) + t.d) / k;
}
// (x, z) inside a triangle, seen from above (0x86207A80)
function inside(px, pz, x0, z0, x1, z1, x2, z2) {
  const ax = x0 - px, az = z1 - pz, bx = x1 - px, bz = z0 - pz;
  const p = ax * az, q = bx * bz;
  const cz = z2 - pz, cx = x2 - px;
  if (q <= p && 0 <= bx * cz - cx * az && 0 <= cx * bz - ax * cz) return true;
  return p - q <= 0 && bx * cz - cx * az <= 0 && cx * bz - ax * cz <= 0;
}
// where on the segment a-b p is nearest (0x86207BC0): [how far, how far along, the way from p]
function nearest(p, a, b) {
  const ax = a[0] - p[0], ay = a[1] - p[1], az = a[2] - p[2];
  const bx = b[0] - p[0], by = b[1] - p[1], bz = b[2] - p[2];
  const ez = bz - az;
  if (bx === ax && by - ay === 0 && ez === 0) return [0, 0, [0, 0, 0]];
  const ex = bx - ax, ey = by - ay;
  const t = -((ax * ex + ay * ey) + az * ez) / ((ex * ex + ey * ey) + ez * ez);
  const d = [t * ex + ax, t * ey + ay, t * ez + az];
  return [Math.sqrt((d[0] * d[0] + d[1] * d[1]) + d[2] * d[2]), t, d];
}
// a ball of radius r at p against the edge a-b (0x86207F34): [the way out, how deep], or null
function edge(p, r, a, b) {
  const [l, t, d] = nearest(p, a, b);
  if (!(l < r && 0 <= t && t <= 1)) return null;
  unit(d);
  return [[d[0] * -1, d[1] * -1, d[2] * -1], r - l];
}
// and against the corner c (0x86207D40)
function corner(p, r, c) {
  const d = [p[0] - c[0], p[1] - c[1], p[2] - c[2]];
  const abs = (x) => (0 < x ? x : -x);
  if (!(abs(d[0]) <= r && abs(d[1]) <= r && abs(d[2]) <= r)) return null;
  const l = Math.sqrt((d[0] * d[0] + d[1] * d[1]) + d[2] * d[2]);
  if (!(l <= r)) return null;
  if (d[0] === 0 && d[1] === 0 && d[2] === 0) d[0] = 1;
  else unit(d);
  return [d, r - l];
}
// which piece of the floor (x, z) is over (0x862025E0)
function pieceAt(x, z) {
  const a = x * C + z * -C, b = -x * -C + z * C;
  return (0 < a ? 1 : 0) + (0 < b ? 2 : 0);
}
// the floor's height under (x, z) (0x86200870 and 0x86201418; for the shadows), or null off it
export function groundY(x, z) {
  for (const t of PIECES[pieceAt(x, z)]) {
    if (inside(x, z, t.a[0], t.a[2], t.b[0], t.b[2], t.c[0], t.c[2])) return -(t.n[0] * x + t.n[2] * z + t.d) / t.n[1];
  }
  return null;
}

// a ball's or a Furret's clip clock (the main program's: 0x8003F2F0 sets the
// clip, 0x8003EC64 the frame it shows next; it moves on a frame each drawing)
function setClip(f, c) { if (f.clip !== c) { f.clip = c; f.frame = -1; } }
const setFrame = (f, k) => { f.frame = k - 1; };
const atLast = (f) => f.frame >= CLIP_LEN[f.clip] - 1; // (0x8003ED14)
function advance(f) {
  f.frame++;
  if (f.frame >= CLIP_LEN[f.clip]) f.frame = HOLD[f.clip] ? CLIP_LEN[f.clip] - 1 : LOOP[f.clip];
}

// One round's world. cpus: which seats are CPUs; empty: which have no one in
// them at all (the remake's, online with the CPUs off: no Furret there, so it
// takes no part; its goal stays, a ball over its line scoring for no one);
// step() runs a frame from the people's pads. The scene reads it all.
export class World {
  constructor(seed, level = "normal", cpus = [false, true, true, true], empty = [false, false, false, false]) {
    this.level = levelCode(level, cpus);
    this.seed = seed >>> 0; // the game's random numbers' state (rnd())
    this.t = -1; // the last frame run
    this.end = null; // the frame the play ended on
    this.over = false; // (past it: the show)
    this.left = TIME; // frames on the clock
    this.balls = []; // the balls on the field, in the order they came
    this.most = 1; // balls at once (0x86204A9C: one more each third of the minute)
    this.wait = 0; // frames since the last ball
    this.order = [0, 1, 2, 3]; // where the next ones drop
    this.next = 0;
    this.ids = 0;
    this.events = [];
    this.shuffle();
    this.p = [0, 1, 2, 3].map((z) => ({
      z, cpu: !!cpus[z], empty: !!empty[z], goal: GOALS[z], score: 0, won: false, arrived: false, cheer: false,
      skill: 0, ai: { state: 0, timer: 0, held: 0 },
      // its Furret (0x86206334): on its spot, popping up through the countdown (its clip at frame 8 at GO)
      f: { spot: 0, target: 0, pos: [0, 30, 0], tail: [0, 0, 0], clip: CLIP.up, frame: COUNTDOWN % CLIP_LEN[CLIP.up], counter: 0,
        frozen: true, swing: false, redirect: false, hit: false, layout: 0, cry: 0 },
    }));
    for (const p of this.p) {
      p.f.spot = p.f.target = START[p.goal];
      this.place(p, p.f.spot);
      p.f.tail = [...p.f.pos];
    }
    // the CPUs' skills (0x862026C8)
    const cpuList = this.p.filter((p) => p.cpu), list = [...SKILLS[this.level]], n = cpuList.length;
    if (n > 0) {
      for (let k = 0; k < 256; k++) {
        const i = this.rnd() % n, j = this.rnd() % n;
        [list[i], list[j]] = [list[j], list[i]];
      }
    }
    cpuList.forEach((p, k) => { p.skill = list[k]; });
  }
  // the game's random numbers (0x800357EC: x * 1664525 + 1013904223)
  rnd() { return (this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0); }
  // where the next four balls drop (0x8620169C)
  shuffle() {
    this.order = [0, 1, 2, 3];
    const n = this.rnd() % 11;
    for (let k = 0; k < n; k++) {
      this.rnd();
      const i = this.rnd() & 3, j = this.rnd() & 3;
      [this.order[i], this.order[j]] = [this.order[j], this.order[i]];
    }
    this.next = 0;
  }

  // ---- a frame (the play, 0x86204A9C; then the show, 0x86203ED8) ----
  // pads: each person's [spot (0: the middle, 1-4: right, down, up, left), A pressed this frame] (null: none)
  step(t, pads = []) {
    this.t = t;
    if (!this.over) {
      if (++this.wait >= SPAWN_EVERY) {
        this.wait = 0;
        if (this.balls.length < this.most && this.left > 0) {
          const v = (this.rnd() % 34) * this.most;
          this.spawn(v >= 81 ? 5 : v >= 61 ? 3 : v >= 41 ? 2 : 1);
        }
      }
      if ((TIME / 3) * this.most < TIME - this.left) this.most++;
      // the pads, and the CPUs (0x862070B0)
      for (const p of this.p) {
        if (p.empty) continue;
        let v;
        if (p.cpu) v = this.think(p);
        else {
          const [s, a] = pads[p.z] || [0, false];
          v = SPOTS[s].button | (a ? 0x4000 : 0);
        }
        let s = 0;
        for (let k = 0; k < 5; k++) if (SPOTS[k].button & v) { s = k; break; }
        this.move(p, s);
        if (v & 0x4000) this.swing(p);
      }
    } else this.gather();
    for (const b of this.balls) b.start = [...b.pos];
    for (let k = 0; k < STEPS; k++) this.sub();
    for (const b of this.balls) { // (how far it went: 0x86203BEC)
      const dx = b.pos[0] - b.start[0], dy = b.pos[1] - b.start[1], dz = b.pos[2] - b.start[2];
      b.dist = Math.sqrt((dx * dx + dy * dy) + dz * dz);
    }
    if (!this.over) {
      this.left--;
      if (this.left < 0) { this.left = 0; this.finish(); }
    }
    for (const p of this.p) if (!p.empty) advance(p.f); // (drawn)
  }

  // a step (0x86203C58): the Furret, the balls, then (with time left) the
  // tails against the balls; the balls against each other, and the floor
  sub() {
    for (const p of this.p) { if (p.empty) continue; this.furret(p); p.f.counter++; }
    for (const b of [...this.balls]) this.roll(b);
    if (this.left > 0) {
      for (const p of this.p) {
        if (!p.f.swing) continue;
        for (const b of this.balls) {
          b.disp = [0, 0, 0];
          this.bat(p, b);
          b.pos = [b.pos[0] + b.disp[0], b.pos[1] + b.disp[1], b.pos[2] + b.disp[2]];
          b.disp = [0, 0, 0];
        }
      }
    }
    for (let i = 0; i < this.balls.length - 1; i++) {
      for (let j = i + 1; j < this.balls.length; j++) this.knock(this.balls[i], this.balls[j]);
    }
    for (const b of this.balls) this.ground(b);
  }

  // ---- the balls ----
  // one drops in (0x86201E70)
  spawn(kind) {
    const at = SPAWNS[this.order[this.next]];
    const b = { id: this.ids++, kind, pos: [...at], v: [0, 0, 0], prev: [...at], imp: [0, 0, 0], disp: [0, 0, 0], imp2: [0, 0, 0],
      scored: false, alpha: 255, dist: 0, start: [...at] };
    this.next++;
    if (this.next >= 4) this.shuffle();
    this.balls.push(b);
    this.events.push(["spawn", b.id, kind]);
  }
  // a step on (0x86201A58): its pushes, slowing, its top speed, and on
  roll(b) {
    for (let k = 0; k < 3; k++) b.v[k] = b.v[k] + (b.imp[k] + b.imp2[k]);
    for (let k = 0; k < 3; k++) b.v[k] = b.v[k] * SP_DEC;
    const s = Math.sqrt((b.v[0] * b.v[0] + b.v[1] * b.v[1]) + b.v[2] * b.v[2]);
    if (SPD_MX < s) {
      const k = (SPD_MX / s) * SPEED[b.kind];
      b.v = [b.v[0] * k, b.v[1] * k, b.v[2] * k];
    }
    b.prev = [...b.pos];
    for (let k = 0; k < 3; k++) b.pos[k] = b.pos[k] + b.disp[k];
    for (let k = 0; k < 3; k++) b.pos[k] = b.pos[k] + b.v[k];
    b.imp = [0, GRAVITY, 0];
    b.disp = [0, 0, 0];
    b.imp2 = [0, 0, 0];
    this.goal(b);
    if (b.pos[1] < GONE) this.drop(b);
    if (this.left === 0 && !b.scored) { // (the time's up: it fades away)
      if (b.alpha >= 9) b.alpha -= 8;
      else this.drop(b);
    }
  }
  drop(b) {
    const i = this.balls.indexOf(b);
    if (i >= 0) this.balls.splice(i, 1);
  }
  // over a goal's line (0x862017F8): its points to that goal's player
  goal(b) {
    if (!(this.left > 0) || b.scored) return;
    const [x, , z] = b.pos;
    const past = (x0, z0, x1, z1) => (x1 - x) * (z0 - z) <= (x0 - x) * (z1 - z); // (0x86201790)
    let g = -1;
    if (x <= 0 && z < 0 && past(0, -1200, -1200, 0)) g = 0;
    if (0 < x && z <= 0 && past(1200, 0, 0, -1200)) g = 1;
    if (x < 0 && 0 <= z && past(-1200, 0, 0, 1200)) g = 2;
    if (0 <= x && 0 < z && past(0, 1200, 1200, 0)) g = 3;
    if (g < 0) return;
    const p = this.p.find((q) => q.goal === g);
    b.scored = true;
    if (p.empty) return; // (no one's goal: in, for nothing)
    p.score += b.kind;
    this.events.push(["goal", p.z, b.id, b.kind]);
  }
  // two balls that touch (0x8620218C): they push apart, and trade a tenth of their speed towards each other
  knock(a, b) {
    const dx = b.pos[0] - a.pos[0], dy = b.pos[1] - a.pos[1], dz = b.pos[2] - a.pos[2];
    const R = EGG_SIZE * 0.75 * 100, r = R * SIZE[a.kind] + R * SIZE[b.kind];
    const abs = (x) => (0 < x ? x : -x);
    if (!(abs(dx) < r && abs(dy) < r && abs(dz) < r)) return;
    const l = Math.sqrt((dx * dx + dy * dy) + dz * dz);
    if (!(l < r)) return;
    const dv = [b.v[0] - a.v[0], b.v[1] - a.v[1], b.v[2] - a.v[2]];
    let n;
    if (l === 0) { // (on top of each other: any way)
      n = [0, 1, 2].map(() => 2 * (this.rnd() / U) - 1);
      if (n[0] === 0 && n[1] === 0 && n[2] === 0) n[0] = 1;
    } else n = [dx, dy, dz];
    unit(n);
    const j = ((dv[0] * n[0] + dv[1] * n[1]) + dv[2] * n[2]) * 0.10000000149011612;
    for (let k = 0; k < 3; k++) a.imp[k] = a.imp[k] + n[k] * j;
    for (let k = 0; k < 3; k++) b.imp[k] = b.imp[k] - n[k] * j;
    const h = (r - l) * 0.5;
    for (let k = 0; k < 3; k++) a.disp[k] = a.disp[k] - n[k] * h;
    for (let k = 0; k < 3; k++) b.disp[k] = b.disp[k] + n[k] * h;
  }
  // against the floor (0x86201300): each triangle of its piece it touches
  // pushes it out and turns its speed, and it takes the average
  ground(b) {
    const acc = [0, 0, 0];
    let count = 0;
    const r = RADIUS[b.kind];
    for (const t of PIECES[pieceAt(b.pos[0], b.pos[2])]) {
      // (where it went this step, a radius and more round it, as a box: a triangle off it is too far to touch)
      let off = false;
      for (let k = 0; k < 3 && !off; k++) {
        const lo = Math.min(b.prev[k], b.pos[k]) - r - 1, hi = Math.max(b.prev[k], b.pos[k]) + r + 1;
        off = t.hi[k] < lo || hi < t.lo[k];
      }
      if (off) continue;
      const hit = this.touch(b, t, r);
      if (!hit) continue;
      const [n, depth] = hit;
      // pushed out, and its speed into it turned (0x86200AD4)
      for (let k = 0; k < 3; k++) b.pos[k] = b.pos[k] + n[k] * depth;
      const k2 = (F_BOUND * -2) * ((n[0] * b.v[0] + n[1] * b.v[1]) + n[2] * b.v[2]);
      for (let k = 0; k < 3; k++) acc[k] = acc[k] + n[k] * k2;
      if (r * 0.03999999910593033 < depth && b.dist > 55) this.events.push(["bounce", b.id]);
      count++;
    }
    if (count > 0) for (let k = 0; k < 3; k++) b.v[k] = b.v[k] + acc[k] / count;
  }
  // a ball against a triangle (0x86200C30): through its face along the way it
  // went (since the step before: still, straight into it), or within its
  // radius of the face, an edge or a corner: [the way out, how deep]
  touch(b, t, r) {
    const s = b.prev;
    const dir = [b.pos[0] - s[0], b.pos[1] - s[1], b.pos[2] - s[2]];
    if (dir[0] === 0 && dir[1] === 0 && dir[2] === 0) { dir[0] = -t.n[0]; dir[1] = -t.n[1]; dir[2] = -t.n[2]; }
    else unit(dir);
    const from = [s[0] - dir[0] * r, s[1] - dir[1] * r, s[2] - dir[2] * r];
    const seg = [(b.pos[0] + dir[0] * r) - from[0], (b.pos[1] + dir[1] * r) - from[1], (b.pos[2] + dir[2] * r) - from[2]];
    const k = across(t, from, seg);
    const hx = seg[0] * k + from[0], hz = seg[2] * k + from[2];
    const tri = (x, z) => inside(x, z, t.a[0], t.a[2], t.b[0], t.b[2], t.c[0], t.c[2]);
    let face = 0 < k && k < 1 && tri(hx, hz);
    if (!face) { // (0x862009E4: within its radius of the face)
      const down = [-t.n[0], -t.n[1], -t.n[2]], d = across(t, b.pos, down);
      face = 0 <= d && d <= r && tri(b.pos[0] + down[0] * d, b.pos[2] + down[2] * d);
    }
    if (face) {
      const p = [b.pos[0] - t.n[0] * r, b.pos[1] - t.n[1] * r, b.pos[2] - t.n[2] * r];
      const n = [t.n[0], t.n[1], t.n[2]];
      return [n, across(t, p, n)];
    }
    return edge(b.pos, r, t.a, t.b) || edge(b.pos, r, t.b, t.c) || edge(b.pos, r, t.c, t.a)
      || corner(b.pos, r, t.a) || corner(b.pos, r, t.b) || corner(b.pos, r, t.c);
  }

  // ---- the Furret ----
  // on spot s (0x862055F0): behind it, facing its goal
  place(p, s) {
    const d = DIRS[p.goal], sp = SPOTS[s];
    p.f.pos = [sp.x - ((d[0] * 18) * (5 * SO_SC)) * SO_POS, 30, sp.z - ((d[2] * 18) * (5 * SO_SC)) * SO_POS];
  }
  // a step of it (0x862061B0): its tail's tip, and its clips
  furret(p) {
    const f = p.f, i = f.clip === CLIP.swing ? Math.max(0, f.frame - 4) : 0;
    f.tail = [f.pos[0] + TAIL[i][0], f.pos[1] + TAIL[i][1], f.pos[2] + TAIL[i][2]];
    if (this.over) this.show(p);
    else this.clips(p);
  }
  // its clips in the play (0x86205D98)
  clips(p) {
    const f = p.f;
    switch (f.clip) {
      case CLIP.hop: // (it lands on the spot it was hopping to)
        if (atLast(f)) { f.spot = f.target; this.place(p, f.target); setClip(f, CLIP.land); }
        break;
      case CLIP.up:
        if (atLast(f)) setClip(f, CLIP.swing);
        break;
      case CLIP.swing:
        if (f.frame + 1 === 4) setClip(f, CLIP.stand);
        if (atLast(f)) setClip(f, CLIP.stand);
        if (STEPS * 9 < f.counter) { f.swing = false; f.redirect = false; f.hit = false; }
        break;
      case CLIP.land:
        if (atLast(f)) setClip(f, CLIP.stand);
        break;
      case CLIP.stand:
        f.frozen = false;
        break;
    }
  }
  // the D-pad (or a CPU) wants it on spot s (0x86205C8C): it hops there; in
  // its swing's first frames it's put there at once (once)
  move(p, s) {
    const f = p.f;
    if (f.frozen || s === f.spot) return;
    if (f.swing) {
      if (!f.redirect && f.frame < STEPS * 2) {
        f.spot = s;
        this.place(p, s);
        setClip(f, CLIP.swing);
        setFrame(f, 5);
        f.redirect = true;
      }
    } else {
      f.target = s;
      if (f.clip !== CLIP.hop) setClip(f, CLIP.hop);
    }
  }
  // A: a swing of its tail (0x86205B8C), if the last one's over; it stays on its spot
  swing(p) {
    const f = p.f;
    if (f.frozen || f.swing || !(STEPS * 9 < f.counter)) return;
    f.counter = 0;
    f.swing = true;
    setClip(f, CLIP.swing);
    setFrame(f, 5);
    if (f.target !== f.spot) this.place(p, f.spot);
    this.events.push(["swing", p.z]);
  }
  // a swinging tail against a ball (0x8620581C): it pushes the ball out of
  // its reach; the first one it touches, early in the swing, it bats towards
  // its goal, and the rest it stops
  bat(p, b) {
    const f = p.f, d = [f.tail[0] - b.pos[0], f.tail[1] - b.pos[1], f.tail[2] - b.pos[2]];
    const l = unitLen(d), reach = RADIUS[b.kind] + REACH;
    if (!(l < reach)) return;
    const pen = reach - l;
    for (let k = 0; k < 3; k++) b.disp[k] = b.disp[k] + -d[k] * pen;
    if (f.counter < STEPS * 3 - 1 && !f.hit) {
      const dir = DIRS[p.goal];
      bat(b.imp2, dir);
      // (none of its speed back the other way: 0x862057A8)
      const k = (b.v[0] * dir[0] + b.v[1] * dir[1]) + b.v[2] * dir[2];
      if (k < 0) for (let i = 0; i < 3; i++) b.v[i] = b.v[i] - dir[i] * k;
      this.events.push(["shot", p.z, b.id]);
    } else {
      const k = (b.v[0] * d[0] + b.v[1] * d[1]) + b.v[2] * d[2];
      for (let i = 0; i < 3; i++) b.imp2[i] = b.imp2[i] + -d[i] * k;
    }
    f.hit = true;
  }

  // ---- a CPU (0x86206D20): its skill's waits, then a spot to go to, then a swing ----
  think(p) {
    const ai = p.ai;
    let wait, rank, least, swingAfter;
    switch (p.skill) {
      case 0: wait = (this.rnd() % 41) + 40; rank = this.rnd() % 3; least = 0; swingAfter = this.rnd() % 31; break;
      case 1: wait = (this.rnd() % 18) + 17; rank = this.rnd() & 1; least = 0.699999988079071; swingAfter = this.rnd() % 13; break;
      case 2: wait = (this.rnd() & 15) + 15; this.rnd(); rank = 0; least = 0.8500000238418579; swingAfter = this.rnd() % 6; break;
      default: wait = (this.rnd() % 13) + 12; this.rnd(); rank = 0; least = 0.8999999761581421; swingAfter = this.rnd() & 3; break;
    }
    let v = ai.held;
    switch (ai.state) { // (0x86206C34)
      case 0: if (wait < ai.timer) { ai.state = 1; ai.timer = 0; } break;
      case 1: { const c = this.choose(p, rank, least); if (c) { ai.state = 2; ai.timer = 0; v = c; } else v = 0; break; }
      case 2: if (swingAfter < ai.timer) { v |= 0x4000; ai.state = 0; ai.timer = 0; } break;
    }
    ai.timer++;
    ai.held = v & 0xbfff;
    return v;
  }
  // the spot where its tail would bat a ball best (0x86206920): each spot's
  // best ball (how much it would go its goal's way, times its points), the
  // spots shuffled a little and sorted, and the rank-th, if it's worth more than least
  choose(p, rank, least) {
    const dir = DIRS[p.goal], vals = [], ids = [];
    for (let s = 0; s < 5; s++) {
      let best = 0;
      this.balls.forEach((b, i) => {
        let val = -1;
        const d = this.reach(SPOTS[s], dir, b);
        if (d) {
          d[1] = 0;
          d[0] = d[0] + b.v[0];
          d[2] = d[2] + b.v[2];
          const l = Math.sqrt(d[2] * d[2] + d[0] * d[0]); // (module #65's 0x87D0059C)
          if (l !== 0) { d[0] /= l; d[2] /= l; }
          val = (dir[0] * d[0] + d[2] * dir[2]) * b.kind;
        }
        if (best < val || i === 0) best = val;
      });
      vals.push(best);
      ids.push(s);
    }
    const swap = (i, j) => { [vals[i], vals[j]] = [vals[j], vals[i]]; [ids[i], ids[j]] = [ids[j], ids[i]]; };
    for (let k = 0; k < 5; k++) { const i = this.rnd() % 5, j = this.rnd() % 5; swap(i, j); }
    for (let k = 4; k > 0; k--) for (let i = k; i > 0; i--) if (vals[i - 1] < vals[i]) swap(i, i - 1);
    return least < vals[rank] ? SPOTS[ids[rank]].button : 0;
  }
  // would a tail at spot s, at the start of its swing, reach ball b (0x862067B4): the way it'd bat it, or null
  reach(sp, dir, b) {
    const k = 5 * SO_SC;
    const tx = TAIL[0][0] + (sp.x - ((dir[0] * 18) * k) * SO_POS), ty = TAIL[0][1] + 30;
    const tz = TAIL[0][2] + (sp.z - ((dir[2] * 18) * k) * SO_POS);
    const d = [b.pos[0] - tx, b.pos[1] - ty, b.pos[2] - tz];
    const l = unitLen(d);
    if (!(l < RADIUS[b.kind] + REACH)) return null;
    bat(d, dir);
    return d;
  }

  // ---- the end (0x8620392C): the most points win (all four level: nobody) ----
  // (all four: all those there; an empty seat's no part of it)
  finish() {
    const here = this.p.filter((p) => !p.empty);
    let best = here[0].score;
    for (const p of here) if (best < p.score) best = p.score;
    for (const p of here) p.won = p.score === best;
    if (here.every((p) => p.won)) for (const p of here) p.won = false;
    this.end = this.t;
    this.over = true;
    this.events.push(["end"]);
  }
  // once the winners are all in the middle, they cheer (0x86203DE8)
  gather() {
    const w = this.p.filter((p) => p.won).length, a = this.p.filter((p) => p.arrived).length;
    if (w === a) for (const p of this.p) if (p.won) p.cheer = true;
  }
  // a Furret's show (0x86205F34): a winner hops to the middle and cheers, the others sulk
  show(p) {
    const f = p.f;
    if (p.cheer) {
      if (f.clip !== CLIP.cheer) { f.layout = 1; setClip(f, CLIP.cheer); return; }
      if (f.frame + 1 === 69 && f.cry < STEPS * 2) {
        if (f.cry % 3 === 0) this.events.push(["cheer", p.z]);
        f.cry++;
      }
    } else if (atLast(f)) {
      if (p.won) {
        if (f.spot !== 0) { this.move(p, 0); this.clips(p); return; }
        p.arrived = true;
        return;
      }
      if (f.clip !== CLIP.sad) { f.layout = 1; setClip(f, CLIP.sad); }
    }
  }

  // ---- for running a frame again (online) ----
  save() {
    const ball = (b) => ({ ...b, pos: [...b.pos], v: [...b.v], prev: [...b.prev], imp: [...b.imp], disp: [...b.disp], imp2: [...b.imp2], start: [...b.start] });
    const player = (p) => ({ ...p, ai: { ...p.ai }, f: { ...p.f, pos: [...p.f.pos], tail: [...p.f.tail] } });
    return { t: this.t, end: this.end, over: this.over, left: this.left, seed: this.seed, most: this.most, wait: this.wait,
      order: [...this.order], next: this.next, ids: this.ids, balls: this.balls.map(ball), p: this.p.map(player) };
  }
  load(s) {
    Object.assign(this, this.save.call(s));
    this.events = [];
  }

  // each one's points, by seat
  get scores() { return this.p.map((p) => p.score); }
  // the places (1-4) by points (among those there; an empty seat's: null)
  get places() { return this.p.map((p) => (p.empty ? null : 1 + this.p.filter((q) => q.score > p.score && !q.empty).length)); }
  // a fingerprint of the world, exact, to check two runs of it agree (the tests;
  // tools/furret_rules.py's is the same)
  digest() {
    const parts = [this.t, this.seed, this.end ?? -1, +this.over, this.left, this.most, this.wait, this.order.join("."), this.next, this.ids];
    for (const p of this.p) {
      const f = p.f;
      parts.push(p.score, +p.won, +p.arrived, +p.cheer, p.skill, p.ai.state, p.ai.timer, p.ai.held, f.spot, f.target,
        ...f.pos.map(hex), ...f.tail.map(hex), f.clip, f.frame, f.counter, +f.frozen, +f.swing, +f.redirect, +f.hit, f.layout, f.cry);
    }
    for (const b of this.balls) {
      parts.push(b.id, b.kind, ...b.pos.map(hex), ...b.v.map(hex), ...b.prev.map(hex), ...b.imp.map(hex), ...b.disp.map(hex),
        ...b.imp2.map(hex), +b.scored, b.alpha, hex(b.dist), ...b.start.map(hex));
    }
    return parts.join(",");
  }
}

// a tail's bat (0x8620573C): along its goal's way, and up
function bat(v, dir) {
  const x = dir[0] * SHOT_PW;
  v[0] = v[0] + (x + x);
  v[1] = v[1] + SHOT_PW * 4.25;
  const z = dir[2] * SHOT_PW;
  v[2] = v[2] + (z + z);
}

const view = new DataView(new ArrayBuffer(8));
function hex(v) {
  view.setFloat64(0, v + 0); // (-0 as 0: Python's whole numbers have no sign)
  return view.getUint32(0).toString(16).padStart(8, "0") + view.getUint32(4).toString(16).padStart(8, "0");
}
