// Gutsy Golbat's show round the play, the Golbat's flight in the countdown
// and at the end, as module #49 has it, a game frame (a 30th) at a time.
// It's each device's own: it doesn't touch the world (rules.js), so it draws
// its random numbers from Math.random where the game draws them from its
// own. In the game's units; yaw as the game keeps it (a s16, 0x3FFF facing
// right). game.js draws it, between its frames.
import * as R from "./rules.js";

const UNIT = 28; // a Golbat, 700 x its 0.04
const GRAVITY = -0.58, STICK = 64 * 0.023, FLAP = 9, VMAX = 15, DRAG = 0.97;
const FLOOR_OUT = -192.92343; // the floor outside the play (0x86100BE0: state 5's)
const BUMP = 49;
const s16 = (v) => ((Math.trunc(v) + 0x8000) & 0xffff) - 0x8000;
const roundS16 = (v) => s16(v >= 0 ? v + 0.5 : v - 0.5);
const clamp = (v, m) => (Math.abs(v) > m ? Math.sign(v) * m : v);

// ---- the countdown (state 3) ----
// Each starts by the camera at a corner (0x861034A8: z 1200, going right and
// up at random speeds of up to 100) and flies to its place in the play
// (START, the record's +0x18).
export const FROM = [[0, 99.6771], [160.76952, 0], [0, -104.50018], [-182.20546, 0]];
export function flyStart(z) {
  return {
    x: FROM[z][0], y: FROM[z][1], z: 1200, vx: Math.random() * 100, vy: Math.random() * 100, vz: 0,
    yaw: 0x3fff, tx: R.START[z][0], ty: R.START[z][1], done: false,
  };
}
// a frame of it (0x861049C0, 0x861044EC): far from its place (or still by
// the camera) it faces the way it flies, steers like a CPU (the stick and a
// flap whenever it's below the place) and closes 5% of the way to the
// screen; within 28 of it (and slowing to the screen) it's on the screen,
// still steering, and turns 7.5% of the way a frame to face right; within 5
// degrees of that it's in place, and stays put (0x861048FC)
export function flyFrame(o) {
  if (o.done) return;
  const near = Math.abs(o.tx - o.x) < UNIT && Math.abs(o.ty - o.y) < UNIT && Math.abs(o.vz) < UNIT * 0.25;
  if (near) { o.vz = 0; o.z = 0; } else o.yaw = s16(Math.round((Math.atan2(o.vx, o.vz) / (2 * Math.PI)) * 0x10000)); // (0x8000B390: atan2 of vz, vx)
  steer(o, o.tx - o.x, o.ty - o.y);
  if (!near) o.vz = (0 - o.z) * 0.05;
  move(o);
  if (!near) return;
  const deg = o.yaw * 0.005493248; // (not wrapped to 0-360: from below 0 it goes round the long way, 0x86104690)
  if (Math.abs(deg - 90) < 5) { o.yaw = 0x3fff; o.done = true; return; }
  const to = deg >= 0 && deg <= 280 ? 90 - deg : 450 - deg;
  o.yaw = roundS16((deg + to * 0.075) * 182.04167);
}
// the stick that way (as far as it goes) and a flap if it's up and not rising fast (0x86101E04), kept to 15 (0x861023D4)
function steer(o, dx, dy) {
  o.vx += clamp(dx, STICK);
  if (dy > 0 && o.vy < FLAP) o.vy += FLAP;
  o.vx = clamp(o.vx, VMAX);
  if (o.vy > VMAX) o.vy -= FLAP;
  if (o.vy < -VMAX) o.vy += FLAP;
}
// gravity, held to 15 each way, moved, slowed (0x86103B74)
function move(o) {
  o.vy += GRAVITY;
  o.vx = clamp(o.vx, VMAX);
  o.vy = clamp(o.vy, VMAX);
  o.x += o.vx; o.y += o.vy;
  o.vx *= DRAG; o.vy *= DRAG;
  if (o.vz) { o.z += o.vz; o.vz *= DRAG; } // (the fly-in's: the end's are on the screen)
}

// ---- the end (state 5: 0x861008E8, 0x86103C48) ----
// Golbat g of the world as the play stops, a winner or not. All are startled
// (clip 5 from a random frame of its 12), the winners for 30 frames, the
// others 15: pushed left and kept up, shaking, growing to 1.3x, its badge
// pushed up with it; then the winners fly round the meadow cheering (clip 6,
// from a random frame of its first 26) and the others drop to the floor
// (clip 8, then 9 on it)
export const CLIP = { startle: 5, cheer: 6, fall: 8, down: 9 };
const STARTLE = { win: 30, lose: 15 };
export const LABEL = UNIT * 1.9; // the badge over it, times its size (0x861047CC)
export function endStart(g, win) {
  return {
    x: g.x, y: g.y, vx: g.vx, vy: g.vy, tx: g.tx, ty: g.ty, win, n: 0, startle: true, landed: false,
    s: 1, up: LABEL, label: true, yaw: 0x3fff, clip: CLIP.startle, cf: Math.floor(Math.random() * 12), fresh: true,
  };
}
// a frame of Golbat i of the four (they go in seat order, each bumping the
// others where they've got to); true when it's landed on this one
export function endFrame(all, i) {
  const o = all[i];
  let landed = false;
  o.fresh = false;
  move(o);
  if (o.startle) {
    o.up += UNIT * 0.015;
    if (o.n < 3 || o.vx > 0) o.vx -= 64 * (0.025 + Math.random() * 0.05);
    if (o.y < -104.50018) o.vy += Math.random() * 9;
    else if (o.vy < -GRAVITY) o.vy = -GRAVITY;
    o.x += (2 * Math.random() - 1) * UNIT * 0.1;
    o.y += (2 * Math.random() - 1) * UNIT * 0.1;
    o.vx = clamp(o.vx, VMAX); o.vy = clamp(o.vy, VMAX);
    if (o.s < 1.25) { o.s += 0.1; o.up = o.s * LABEL; } // (0.04 + 0.004 a frame, to 0.052)
    if (o.n > (o.win ? STARTLE.win : STARTLE.lose)) {
      o.startle = false;
      if (o.win) setClip(o, CLIP.cheer, Math.floor(Math.random() * 26));
    }
    o.yaw = 0x3fff;
  } else if (o.win) { // to its spot (the record's +0x18, then random ones: 0x86104BEC), gravity off
    let dx = (o.tx - o.x) * 0.025, dy = (o.ty - o.y) * 0.025;
    if (Math.abs(o.tx - o.x) < UNIT * 4 && Math.abs(o.ty - o.y) < UNIT * 4) {
      o.tx = Math.random() * 685.94995 + R.X_MIN;
      o.ty = Math.random() * 122.50637 - 63.664726;
    }
    dx = clamp(dx, STICK);
    dy = clamp(dy, FLAP);
    o.vx += dx;
    o.vy += dy - GRAVITY;
  } else { // down: three times the gravity (0x861043B0), its badge gone
    o.label = false;
    o.vy += 2 * GRAVITY;
    if (o.landed) {
      if (o.y > FLOOR_OUT) o.y = FLOOR_OUT;
      o.vx *= 0.7;
    } else if (o.y < FLOOR_OUT) { // (it lands: turned any way, lying there, clip 9 played on round its last 8 frames)
      o.y = FLOOR_OUT;
      o.landed = landed = true;
      o.yaw = s16(Math.random() * 0x10000);
      setClip(o, CLIP.down, 0);
    } else if (o.clip !== CLIP.fall) setClip(o, CLIP.fall, 0);
    else if (o.cf >= 29) setClip(o, CLIP.fall, 14); // (its end: from frame 14 again)
  }
  for (let j = 0; j < all.length; j++) if (j !== i) bump(o, all[j]); // (0x86103194)
  bounds(o, o.startle || o.win);
  if (!o.fresh) {
    o.cf++;
    if (o.clip === CLIP.startle) o.cf %= 12;
    else if (o.clip === CLIP.cheer) o.cf %= 100;
    else if (o.clip === CLIP.down && o.cf > 56) o.cf = 49; // (its loop start, set at 49: 0x86104468)
  }
  o.n++;
  return landed;
}
function setClip(o, clip, f) { o.clip = clip; o.cf = f; o.fresh = true; }
// two Golbat bump (0x8610109C): pushed apart and bounced (at the end no one's
// knocked: no heart comes out, the play's over)
function bump(a, b) {
  let dx = a.x - b.x, dy = a.y - b.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (!(d < BUMP)) return;
  if (d !== 0) { dx /= d; dy /= d; } else { dx = 1; dy = 0; }
  const vn = (a.vx - b.vx) * dx + (a.vy - b.vy) * dy, push = (BUMP - d) * 0.5;
  a.x += push * dx; a.y += push * dy;
  b.x -= push * dx; b.y -= push * dy;
  bounds(b, true);
  a.vx -= dx * vn * 1.6 * 0.8; a.vy -= dy * vn * 1.6 * 0.8;
  b.vx += dx * vn * 1.6 * 0.8; b.vy += dy * vn * 1.6 * 0.8;
}
// the edges at the end: the floor outside the play, the roof, and the sides
// too while it's startled or a winner (0x86100BE0; a loser's 0x86100CFC)
function bounds(o, sides) {
  if (o.y < FLOOR_OUT) { o.y = FLOOR_OUT; if (o.vy < 0) o.vy *= -0.5; }
  if (o.y > R.Y_MAX) { o.y = R.Y_MAX; o.vy = 0; }
  if (!sides) return;
  if (o.x < R.X_MIN) { o.x = R.X_MIN; o.vx *= 0.5; }
  if (o.x > R.X_MAX) { o.x = R.X_MAX; o.vx *= 0.5; }
}
