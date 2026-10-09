// A Tumbling Togepi game: the four lanes' rules (rules.js) on the round's
// clock, and the scene they drive. Four treadmills side by side on their
// platform (object 60), each belt scrolling the track (image bank 226) and
// carrying the course towards its Togepi; the camera in front, high up, the
// Togepi facing it. In the game's units (y up). The rules run 30 frames a
// second; what moves is drawn between a lane's last two frames, so it's
// smooth at any display rate.
//
// Who plays each seat: "local" (this device's player), "cpu" or "remote"
// (someone on another device, online). A CPU's lane runs from the round's
// seed alone, so every device runs it the same. This device's player's stick
// emits "send" as it changes; online, the others' come in told("stick"), and
// their lanes run a little behind (s.delay), run again from a saved point
// when a stick change comes in late. The server says how it ended (told("won")).
import * as THREE from "three";
import { makeModel } from "./assets.js";
import * as R from "./rules.js";
import { makeBadge, PICTURE } from "../badge.js";
import { dress } from "../n64fx.js";

const angle = (a) => (a / 0x10000) * 2 * Math.PI;
const lerp = (a, b, k) => a + (b - a) * k;
const TAU = 2 * Math.PI;
const turnLerp = (a, b, k) => a + ((((b - a) % TAU) + TAU * 1.5) % TAU - Math.PI) * k; // (the short way round)

// each lane's left edge (0x86710C08) and its belt's shift from the middle (0x8670C084)
export const LANE_X = [0, 1, 2, 3].map((p) => (p * 120 - 240) * 2.3);
const BELT_SHIFT = [-2, -1, 1, 2];
// a belt: four quads, 310 x 325 at y 100 (0x8670B850), 0.8x: the track's rows
// tile * 32 + px + 3 on, 31 a quad
export const BELT = { w: 248, z0: -520, z1: 520, y: 80, rows: 124 };
const PLATFORM = 0.8; // the platform's and the scenery's scale (at the middle)
const TOGEPI = 0.75; // (0x8670BB80)
// what comes along the belts, by type: its model and scale (0x8670BDD8)
const OBSTACLE = {
  [R.FLOWER]: ["flower", 0.8], [R.ROCK_S]: ["rock_s", [0.8, 1, 0.8]], [R.ROCK]: ["rock", [0.8, 1, 0.8]],
  [R.LOG_S]: ["log_s", 0.6], [R.LOG_M]: ["log_m", 0.6], [R.LOG_L]: ["log_l", 0.6], [R.ARROW]: ["arrow", 0.12],
};
const OBSTACLE_Y = 90;
const ARROW_TILT = angle(0x2c00); // (the arrows' 0x1E)
const DIGLETT = 36 * 3.5; // its 36 x 36 pictures, 3.5x
// The render layer of the module's sprites (geo 0x22 09: ZB_CLD_SURF, blended
// over what's drawn, after the translucent layers 6 and 8 that the aura and the
// arrows are in): the shadows, the Diglett, the rank coins and the badges (the
// geo nodes of callbacks 0x86700020, 0x8670018C, 0x86700588 and 0x86700418). A
// translucent draw's renderOrder is its layer.
const SPRITES = 9;
// round each Togepi: its shadow (bank 307's 24 x 24 on a 60 x 60 quad, 1.5x and
// less as it goes up (rules.js, and the end's cheer below); its colour the
// environment's 0C1602 x the picture's grey, its alpha the picture's: 0x86700020,
// DL 0x8670BA40), the dash's aura (object 188: 0.55x and longer with the speed,
// pitched 0x2C0, 0x867043AC) and the rank coin over it (bank 387's 20 x 16 on
// the shared quad at 7x, lying flat (+0x1E -0x4000) at the Togepi's y + 120 and
// z - 50: 0x86706AC8, 0x86706A30)
const SHADOW = { size: 60, y: 90, color: 0x0c1602 };
const AURA = { scale: 0.55, pitch: angle(0x2c0), y: 50 };
const COIN = { w: 20 * 7, h: 16 * 7, y: 120, z: -50, pitch: angle(-0x4000) };
// the others' badges on each belt, where they are along the track (0x86706B88, 0x86706D3C: pool
// sprites, bank 434's 36 x 28 at 3.2x, pitched -0x3000; drawn by DL 0x86700418, alpha its prim's 0x64)
const GHOST = { scale: 3.2, pitch: angle(-0x3000), y: 120, far: 600, alpha: 0x64 / 255 };
// The camera: eye D away at an azimuth and elevation (binary angles), looking at
// `at`, fov up and down (0x8670675C). The play's view, and the opening glide
// to it during the count (0x8670A07C: from the side, low and near, round to
// the front over 76 frames, the scenery round it showing)
const VIEW = { az: 0x4004, el: 0x19d3, d: 7570, at: [0, 40, 0], fov: 7.6 };
const GLIDE = { el: 0xad5, d: 1610, atY: 160, fov: 13.6, frames: 76 };
// The end (0x86709AD0), a frame at a time from the first (the play's view): the
// elevation down (0x1900 - 0xD6D) / 40 = 74 a frame while it stays 0xD6D or over
// (42 frames, to 0xDAF), the distance down to 3380 and what it looks at up to y
// 200 (40 frames each), back along z 5 a frame to the last winner's z, across a
// 40th a frame to the winner's x (two or more: the first and the last one's
// middle); each till it's there. From the frame none moves, round (0x80 a frame).
const END = { el: 0xd6d, elStep: Math.trunc((0x1900 - 0xd6d) / 40), d: 3380, dStep: (7570 - 3380) / 40, atY: 200, yStep: (200 - 40) / 40, zStep: 5, xSteps: 40, spin: 0x80 };
// The end's clips (0x86709AD0 sets them; at a clip's last frame 0x867043AC's
// switch sets the waiting one, clip 0): a winner cheers once (clip 6, its cry at
// frame 20: 0x867044B0), with its shadow 1.5 cos((frame + 1) x 0x51E); the
// others lose (clip 4, then clip 5); then they stand.
const CHEER = R.CLIP_LEN[R.CLIP.win] - 1, LOSE = R.CLIP_LEN[R.CLIP.lose] - 1, SAD = R.CLIP_LEN[R.CLIP.sad] - 1;
// a goal's run (clip 8): the race ends once the last one's is over (0x86705F54, case 12)
const RUN_IN = 30;
// how long after the first one's in a race is called (made for the remake:
// the game waits for all four)
export const CALL = 30 * R.FPS;

export function eyeOf(az, el, d) {
  const t = d * Math.cos(angle(el));
  return [Math.cos(angle(az)) * t + 1, Math.sin(angle(el)) * d, Math.sin(angle(az)) * t];
}

// what's drawn of lane l, kept before it runs a frame (it's drawn between that
// and the frame after): into p
function capture(l, p) {
  p ||= { sx: new Float64Array(60), sz: new Float64Array(60), sk: new Int8Array(60) };
  Object.assign(p, { x: l.x, y: l.y, z: l.z, row: l.tile * 32 + l.px, turn: l.turn, aura: l.auraA, boost: l.boost, shadow: l.shadow });
  l.slots.forEach((o, i) => { p.sx[i] = o.x; p.sz[i] = o.z; p.sk[i] = o.shown ? o.type : -1; });
  return p;
}
// the aura's alpha as drawn: its object's alpha (+0x1D) takes the place of its
// recipe's prim alpha, unless it's 255 (the dash's first frame: the recipe's 95;
// 0x810024E0, mode 0)
const auraAlpha = (a) => (a >= 255 ? 95 : a);

// the end's camera, frame by frame from the first: { path: [{ el, d, at }], still: the frame none moves }
function endPath(xT, zT) {
  const s = { el: VIEW.el, d: VIEW.d, at: [...VIEW.at] }, path = [{ el: s.el, d: s.d, at: [...s.at] }];
  const dx = xT / END.xSteps;
  for (let n = 1; n < 600; n++) {
    let moved = 0, v;
    if (zT <= (v = s.at[2] - END.zStep)) { s.at[2] = v; moved++; }
    if ((v = s.el - END.elStep) >= END.el) { s.el = v; moved++; }
    if ((v = s.d - END.dStep) >= END.d) { s.d = v; moved++; }
    if ((v = s.at[1] + END.yStep) <= END.atY) { s.at[1] = v; moved++; }
    v = s.at[0] + dx;
    if (dx > 0 ? v <= xT : xT <= v) { s.at[0] = v; moved++; }
    path.push({ el: s.el, d: s.d, at: [...s.at] });
    if (!moved) return { path, still: n };
  }
  return { path, still: Infinity }; // (no winner: nothing to look across to, and it never stops)
}

export class Game {
  constructor(scene, assets) {
    this.scene = scene;
    this.assets = assets;
    this.listeners = {};
    this.clock = 0; // s, always running (the arrows' shimmer)
    const add = (o) => { scene.add(o); return o; };
    this.platform = add(makeModel(assets.platform, PLATFORM).root);
    // the scenery: the hills, plants, cacti and grass rings shown while the camera comes in and at the end
    this.scenery = ["hills", "plants", "grass_arc", "cacti", "thin_arc", "ring", "ring_dirt"].map((n) => add(makeModel(assets[n], PLATFORM).root));
    for (const n of ["pieces", "arc"]) add(makeModel(assets[n], PLATFORM).root);
    // the belts
    const track = assets.track;
    track.flipY = false;
    track.magFilter = THREE.LinearFilter;
    track.minFilter = THREE.LinearFilter;
    track.generateMipmaps = false;
    track.wrapS = track.wrapT = THREE.ClampToEdgeWrapping;
    track.needsUpdate = true;
    this.belts = LANE_X.map((x0, p) => {
      const g = new THREE.BufferGeometry();
      const cx = x0 + R.START_X + BELT_SHIFT[p], hw = BELT.w / 2;
      g.setAttribute("position", new THREE.Float32BufferAttribute([cx - hw, BELT.y, BELT.z0, cx + hw, BELT.y, BELT.z0, cx - hw, BELT.y, BELT.z1, cx + hw, BELT.y, BELT.z1], 3));
      g.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 1, 1], 2));
      g.setIndex([0, 2, 1, 1, 2, 3]);
      const mesh = add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: track })));
      mesh.frustumCulled = false;
      return mesh;
    });
    // each lane's Togepi and what goes with it
    const shadowMat = new THREE.MeshBasicMaterial({ color: SHADOW.color, map: assets.shadow, transparent: true, depthWrite: false });
    const shadowGeo = new THREE.PlaneGeometry(SHADOW.size, SHADOW.size).rotateX(-Math.PI / 2);
    const coinGeo = new THREE.PlaneGeometry(COIN.w, COIN.h);
    this.fxMats = []; // the arrows' (their scroll)
    this.lanesView = LANE_X.map((x0, p) => {
      const togepi = makeModel(assets.togepi, TOGEPI);
      add(togepi.root);
      const shadow = add(new THREE.Mesh(shadowGeo, shadowMat));
      shadow.renderOrder = SPRITES;
      const aura = makeModel(assets.aura, AURA.scale);
      const auraMats = this.dressed(aura.model, "aura");
      for (const m of auraMats) m.side = THREE.FrontSide; // (its back faces culled, as the glTF has it: G_CULL_BACK)
      aura.root.rotation.x = AURA.pitch;
      aura.root.visible = false;
      add(aura.root);
      const coin = add(new THREE.Mesh(coinGeo, new THREE.MeshBasicMaterial({ map: assets.rank1, transparent: true, depthWrite: false })));
      coin.rotation.x = COIN.pitch;
      coin.renderOrder = SPRITES;
      const ghosts = [0, 1, 2, 3].filter((q) => q !== p).map((q) => {
        const s = add(makeBadge({}, { size: PICTURE, scale: GHOST.scale, opacity: GHOST.alpha, depthTest: false, flat: true, renderOrder: 4 }));
        s.rotation.x = GHOST.pitch;
        s.visible = false;
        return { q, s };
      });
      const slots = [...Array(60)].map(() => ({ type: -1, obj: null }));
      const digs = [];
      return { x0, togepi, shadow, aura, auraMats, coin, ghosts, slots, digs, pools: {}, off: 0, prev: null };
    });
    this.digTex = assets.diglett;
    this.reset("normal");
    this.state = "idle";
  }
  on(name, fn) { (this.listeners[name] ||= []).push(fn); }
  emit(name, ...args) { for (const fn of this.listeners[name] || []) fn(...args); }

  // root's meshes in their recipes (fx.json's name: src/n64fx.js), each drawn in its render layer's turn
  dressed(root, name) {
    const fx = this.assets.fx, { recipes, prims } = fx.recipes[name];
    const mats = dress(fx, root, name);
    root.traverse((o) => {
      const r = o.isMesh && prims[o.userData.n64prim];
      if (r !== false && r !== null && r !== undefined) o.renderOrder = recipes[r]?.layer ?? 6;
    });
    return mats;
  }

  // the badges the others' markers show (the shell's: 1P-4P, COM in the seat's colour)
  setBadges(textures) {
    this.lanesView.forEach((v) => v.ghosts.forEach((g) => { g.s.material.map = textures[g.q]; g.s.material.needsUpdate = true; }));
  }

  // A game. level: easy / normal / hard; setup: { me, control, cpus (which
  // seats are CPUs), delay (frames each seat runs behind), told (online, the
  // server's word so far: to rejoin it midway) }
  reset(level, seed = (Math.random() * 2 ** 31) | 0, setup = {}) {
    this.levelName = level;
    this.seed = seed;
    this.me = setup.me ?? 0;
    this.control = setup.control || [0, 1, 2, 3].map((z) => (z === this.me ? "local" : "cpu"));
    this.cpus = setup.cpus || this.control.map((c) => c === "cpu");
    this.delay = (setup.delay || [0, 0, 0, 0]).map((d, z) => (z === this.me || this.cpus[z] ? 0 : d));
    this.course = R.course(seed);
    const level0 = R.levelCode(level);
    this.lanes = [0, 1, 2, 3].map((z) => new R.Lane(seed, z, this.course, this.cpus[z] ? level0 : 0));
    this.inputs = [[], [], [], []]; // each person's stick changes: [frame, x, y]
    this.snaps = this.lanes.map((l) => [[0, l.save()]]); // their lanes as they were before a frame (every 15)
    this.simT = [-1, -1, -1, -1]; // the last frame each lane has run
    this.shownT = [-1, -1, -1, -1]; // and whose sounds have gone
    this.stick = [0, 0]; // this device's player's stick (the keys, the touch)
    this.result = null; // the server's word on the end: { f, fin, p, prior }
    this.scores = null;
    this.time = 0;
    this.state = "ready";
    this.lastFrame = -1;
    this.intro = 0; // frames since the countdown started (the camera's glide)
    this.after = -1; // frames since the end began
    this.ended = null; // the frame the end began
    this.endPath = null;
    this.lanesView.forEach((v, z) => {
      v.off = 0;
      v.prev = capture(this.lanes[z], v.prev);
      v.togepi.pose(R.CLIP.idle, Math.random() * 24); // (rand2 % 25)
      v.idleAt = Math.random() * 24;
      for (const s of v.slots) { if (s.obj) { s.obj.visible = false; s.obj.userData.free = true; } s.type = -1; s.obj = null; }
      for (const d of v.digs) d.visible = false;
      v.end = null;
    });
    for (const s of this.scenery) s.visible = true;
    const told = setup.told;
    if (told?.sticks) told.sticks.forEach((list, z) => { if (list && !this.cpus[z]) this.inputs[z] = list.map((e) => [...e]); });
    if (told?.done) this.told("won", told.done);
    this.drawLanes(1);
  }
  start() {
    this.state = "play";
    this.intro = Infinity;
    for (const s of this.scenery) s.visible = false; // (the glide's over: 0x8670A07C)
  }
  stop() { this.state = "over"; }
  setControl(z, c) {
    if (c === "cpu" && !this.cpus[z]) return; // (a person who left: their lane stops where their stick left it)
    this.control[z] = c;
  }

  get frame() { return Math.floor(this.time * R.FPS + 1e-6); }

  // ---- input ----
  // this device's player's stick: x right, y up, -60-60 each
  setStick(x, y) {
    x = Math.max(-60, Math.min(60, Math.round(x)));
    y = Math.max(-60, Math.min(60, Math.round(y)));
    this.stick = [x, y];
  }
  stickAt(z, t) {
    const list = this.inputs[z];
    let s = [0, 0];
    for (let i = list.length - 1; i >= 0; i--) if (list[i][0] <= t) { s = [list[i][1], list[i][2]]; break; }
    return s;
  }

  // the server's word: someone's stick ("stick": { s, f, x, y }; to this
  // device's own, o: the frame it said), or the end ("won": { f (the frame
  // it's called), fin (each one's finish frame, or null), p (how far each got,
  // x10), prior (a finisher's progress the frame before it got in) })
  told(type, m) {
    if (type === "stick") {
      const z = m.s;
      if (!(z >= 0 && z < 4) || this.cpus[z] || !Number.isInteger(m.f) || !Number.isInteger(m.x) || !Number.isInteger(m.y)) return;
      const list = this.inputs[z];
      let k = list.length;
      if (this.control[z] === "local") { // one of this device's own, as the server has it (from another frame)
        // (they stay in the order they were made, as the server keeps them: it never puts one on a
        // frame before the last one's, so they're in order again once it's told of each one it moved)
        const j = list.findIndex((e) => e[3] === m.o && e[1] === m.x && e[2] === m.y);
        if (j >= 0) {
          list[j][0] = m.f;
          this.rewind(z, Math.min(m.f, m.o));
          return;
        }
      } // (else one it never made here: the server has it, from this device's connection)
      while (k > 0 && list[k - 1][0] > m.f) k--;
      list.splice(k, 0, [m.f, m.x, m.y]);
      this.rewind(z, m.f);
      return;
    }
    if (type === "won") {
      if (!Number.isInteger(m.f) || !Array.isArray(m.fin)) return;
      this.result = {
        f: m.f, fin: m.fin.map((x) => (Number.isInteger(x) ? x : null)), p: Array.isArray(m.p) ? m.p.map((x) => +x || 0) : null,
        prior: Array.isArray(m.prior) ? m.prior.map((x) => (typeof x === "number" ? x : null)) : null,
      };
    }
  }
  // lane z again from before frame f (a stick change it ran without)
  rewind(z, f) {
    if (f > this.simT[z]) return;
    const snaps = this.snaps[z];
    while (snaps.length > 1 && snaps[snaps.length - 1][0] > f) snaps.pop();
    const [at, state] = snaps[snaps.length - 1];
    this.lanes[z].load(state);
    this.lanes[z].events = [];
    this.simT[z] = at - 1;
  }
  // lane z's drawn state kept, to draw it between this frame and its next
  keep(z) { const v = this.lanesView[z]; v.prev = capture(this.lanes[z], v.prev); }
  // run lane z up to frame t (a person's: by their stick changes)
  runTo(z, t) {
    const l = this.lanes[z];
    while (this.simT[z] < t) {
      const f = this.simT[z] + 1;
      if (f % 15 === 0 && f > this.snaps[z][this.snaps[z].length - 1][0]) this.snaps[z].push([f, l.save()]);
      const [x, y] = this.stickAt(z, f);
      this.keep(z);
      l.step(f, x, y, true);
      this.simT[z] = f;
      this.sounds(z, f);
    }
  }
  // lane z's sounds and the like from its frame f (once each)
  sounds(z, f) {
    const l = this.lanes[z];
    if (f > this.shownT[z]) {
      for (const [, what, type] of l.events) this.emit(what, z, type);
      this.shownT[z] = f;
    }
    l.events = [];
  }

  // ---- the game, frame by frame ----
  update(dt) {
    this.clock += dt;
    if (this.state === "ready") this.intro += dt * R.FPS;
    if (this.state === "play") {
      this.time += dt;
      for (let t = this.lastFrame + 1; t <= this.frame; t++) { this.step(t); this.lastFrame = t; }
    } else if (this.state === "over") this.time += dt;
    if (this.ended !== null) {
      const k = this.time * R.FPS + 1e-6 - this.ended; // (as frame does)
      for (let n = this.after + 1; n <= Math.floor(k); n++) { this.ending(n); this.after = n; }
      // the play hands over to the results (module #64's banner, 0x87F0A098) as
      // the end begins, as the game does (0x86705F54, case 12: state 14)
      if (this.state === "play") { this.state = "over"; this.emit("finish"); }
    }
    this.animate(dt);
  }

  // what happens on frame t (from GO)
  step(t) {
    // this device's player's stick: a change is kept, and sent
    const me = this.me;
    if (this.control[me] === "local" && !this.cpus[me]) {
      const [x, y] = this.stick, list = this.inputs[me], last = list[list.length - 1];
      if (!last ? x || y : last[1] !== x || last[2] !== y) {
        list.push([t, x, y, t]); // ([frame, x, y, the frame it was sent for])
        this.emit("send", { s: me, f: t, x, y });
      }
    }
    // the CPUs, together (they rank among themselves)
    const cpus = this.lanes.filter((l, z) => this.cpus[z]);
    if (cpus.length) {
      this.lanes.forEach((l, z) => { if (this.cpus[z]) this.keep(z); });
      for (const l of cpus) l.step(t, 0, 0, true);
      R.rankCpus(this.lanes);
      this.lanes.forEach((l, z) => { if (this.cpus[z]) { this.simT[z] = t; this.sounds(z, t); } });
    }
    // the people: this device's now, the others a little behind
    for (let z = 0; z < 4; z++) if (!this.cpus[z]) this.runTo(z, Math.max(-1, t - this.delay[z]));
    // the end: once all four are in (their goal runs over), or the race is called
    const fin = this.finishes();
    if (this.ended === null) {
      const all = fin.every((f) => f !== null) && this.lanes.every((l, z) => l.state === R.DONE || t - fin[z] > RUN_IN);
      const first = Math.min(...fin.map((f) => (f === null ? Infinity : f)));
      if (this.result ? t >= this.result.f : all || t >= first + CALL) this.ended = t;
    }
  }
  // each lane's finish frame (the server's word once it's in), or null
  finishes() {
    if (this.result) return this.result.fin;
    return this.lanes.map((l) => l.finish);
  }

  // n frames after the end began (0x86709AD0): the camera comes down to the
  // winner(s), who cheer; the others lose. The game's winners are the ones it
  // ranks first, unless the last one in is first too (all four together): then
  // no one (0x86705F54, case 12)
  ending(n) {
    if (n !== 0) return;
    const won = this.places().map((p) => p === 1);
    const winners = won.every(Boolean) ? won.map(() => false) : won;
    this.emit("end", winners);
    this.lanesView.forEach((v, z) => { v.end = { win: winners[z], at: this.time }; });
    for (const s of this.scenery) s.visible = true;
    // where it looks: the last winner's z (the second player's if none); across,
    // the winner's x, or the first and last winners' middle (3 if that's 0)
    const zs = [0, 1, 2, 3].filter((z) => winners[z]), last = zs.length ? zs[zs.length - 1] : 1;
    const xOf = (z) => LANE_X[z] + this.lanes[z].x;
    const x = !zs.length ? 0 : zs.length === 1 ? xOf(last) : (xOf(zs[0]) + xOf(last)) / 2 || 3;
    this.endPath = endPath(x, this.lanes[last].z + this.lanesView[last].off);
  }

  // each seat's progress the frame before it got in (the server's word once it's in)
  priors() { return this.result?.prior || this.lanes.map((l) => l.prior); }
  // the places: by the frame each finished (the same frame's by how far each
  // had got the frame before), then by how far each got (rules.js placesOf)
  places() {
    const prog = this.result?.p ? this.result.p.map((x) => x / 10) : this.lanes.map((l) => l.progress);
    return R.placesOf(this.finishes(), this.priors(), prog);
  }
  // seat z's time, in hundredths of a second (null if it didn't get there): the game's sum (rules.js timeOf)
  timeOf(z) {
    const f = this.finishes()[z];
    return f === null || f === undefined ? null : R.timeOf(f, this.seed, z);
  }
  // how far seat z has got, % (the cards)
  progressOf(z) { return Math.max(0, Math.min(100, Math.floor(this.lanes[z].progress))); }

  // ---- every rendered frame ----
  animate(dt) {
    const k = this.state === "play" || this.state === "over" ? Math.max(0, Math.min(1, this.time * R.FPS - this.lastFrame)) : 1;
    this.drawLanes(k);
    const f = this.clock * R.FPS;
    for (const m of this.fxMats) m.n64.frame(f);
  }

  // the lanes, k of the way from each one's last frame but one to its last
  drawLanes(k) {
    const ranks = this.ranks(), ended = this.ended !== null, f = this.clock * R.FPS;
    // each Togepi and its belt's track, between frames
    const at = this.lanes.map((l, z) => {
      const p = this.lanesView[z].prev, row = l.tile * 32 + l.px;
      return { x: lerp(p.x, l.x, k), y: lerp(p.y, l.y, k), z: lerp(p.z, l.z, k) + this.lanesView[z].off, row: Math.abs(row - p.row) < 64 ? lerp(p.row, row, k) : row };
    });
    this.lanesView.forEach((v, z) => {
      const l = this.lanes[z], p = v.prev, d = at[z], x = v.x0 + d.x;
      // the belt's track
      const uv = this.belts[z].geometry.attributes.uv;
      const v0 = (d.row + 3) / 2048, v1 = (d.row + 3 + BELT.rows) / 2048;
      uv.setXY(0, 0, v0); uv.setXY(1, 1, v0); uv.setXY(2, 0, v1); uv.setXY(3, 1, v1);
      uv.needsUpdate = true;
      // the Togepi
      const t = v.togepi;
      t.root.position.set(x, d.y, d.z);
      t.root.rotation.y = turnLerp(p.turn, l.turn, k);
      let clip = l.clip, cf = l.frame + (this.state === "play" ? l.speed * k : 0), shadow = lerp(p.shadow, l.shadow, k);
      if (v.end) { // the end's clips
        const e = (this.time - v.end.at) * R.FPS;
        if (v.end.win) {
          shadow = 1.5 * Math.cos(angle((Math.min(e, CHEER) + 1) * 0x51e)); // (then as its last frame left it)
          if (e >= 20 && !v.end.cried) { v.end.cried = true; this.emit("cheer", z); }
          [clip, cf] = e < CHEER ? [R.CLIP.win, e] : [R.CLIP.idle, e - CHEER];
        } else [clip, cf] = e < LOSE ? [R.CLIP.lose, e] : e < LOSE + SAD ? [R.CLIP.sad, e - LOSE] : [R.CLIP.idle, e - LOSE - SAD];
        t.root.rotation.y = 0;
      } else if (this.state !== "play" && l.finish === null) { clip = R.CLIP.idle; cf = (v.idleAt + this.time * R.FPS) % R.CLIP_LEN[clip]; }
      t.pose(clip, cf);
      v.shadow.position.set(x, SHADOW.y, d.z);
      v.shadow.scale.set(shadow, 1, shadow);
      // the dash's aura
      const a = lerp(auraAlpha(p.aura), auraAlpha(l.auraA), k);
      v.aura.root.visible = a > 0 && !v.end;
      if (v.aura.root.visible) {
        v.aura.root.position.set(x, d.y + AURA.y, d.z);
        v.aura.root.scale.set(1, 1, Math.max(0.01, (lerp(p.boost, l.boost, k) + AURA.scale) / AURA.scale));
        for (const m of v.auraMats) { m.n64.frame(f); m.n64.prim.w = a / 255; }
      }
      // the rank coin
      v.coin.material.map = this.assets["rank" + ranks[z]];
      v.coin.position.set(x, d.y + COIN.y, d.z + COIN.z);
      v.coin.visible = this.state === "play" && !v.end;
      // what's on the belt: gone from the goal on (the goal's state clears its 60 every
      // frame: 0x867049F0; the end, everyone's: 0x86709AD0)
      const gone = ended || l.state === R.GOAL || l.state === R.DONE;
      const was = (i, o) => p.sk[i] === (o.shown ? o.type : -1) && Math.abs(p.sz[i] - o.z) < 500; // (the same one as the frame before)
      l.slots.forEach((o, i) => {
        const s = v.slots[i];
        const type = !gone && o.type >= 0 && o.shown && o.type !== R.DIGLETT ? o.type : -1;
        if (s.type !== type) {
          if (s.obj) { s.obj.visible = false; s.obj.userData.free = true; }
          s.obj = type >= 0 ? this.take(v, type) : null;
          s.type = type;
        }
        if (s.obj) s.obj.position.set(v.x0 + (was(i, o) ? lerp(p.sx[i], o.x, k) : o.x), OBSTACLE_Y, (was(i, o) ? lerp(p.sz[i], o.z, k) : o.z) + v.off);
      });
      // the Diglett, as sprites
      let n = 0;
      if (!gone) {
        l.slots.forEach((o, i) => {
          if (o.type !== R.DIGLETT || !o.shown) return;
          const sp = v.digs[n] || (v.digs[n] = this.diglett());
          sp.visible = true;
          sp.position.set(v.x0 + o.x, OBSTACLE_Y + DIGLETT * 0.35, (was(i, o) ? lerp(p.sz[i], o.z, k) : o.z) + v.off);
          sp.material.map.offset.x = R.Lane.digFrame(o.n) / 6;
          n++;
        });
      }
      for (; n < v.digs.length; n++) v.digs[n].visible = false;
      // the others' markers on this belt (shown whoever's in: hidden only past 600 either way, 0x86706B88)
      for (const g of v.ghosts) {
        const o = at[g.q], dz = (o.row - d.row) / R.SCROLL + o.z - d.z;
        g.s.visible = this.state === "play" && !v.end && Math.abs(dz) <= GHOST.far && !!g.s.material.map;
        g.s.position.set(v.x0 + o.x, GHOST.y, d.z + dz);
      }
    });
  }
  // a model of type for lane view v, free from its pool or new
  take(v, type) {
    const pool = (v.pools[type] ||= []);
    let o = pool.find((p) => p.userData.free);
    if (!o) {
      const [name, s] = OBSTACLE[type];
      o = makeModel(this.assets[name], s).root;
      if (type === R.ARROW) { // its panel (cb01, layer 6) and the chevron's outline (cb00, layer 8): fx.json
        o.children[0].rotation.x = ARROW_TILT;
        this.fxMats.push(...this.dressed(o, "arrow"));
      }
      this.scene.add(o);
      pool.push(o);
    }
    o.userData.free = false;
    o.visible = true;
    return o;
  }
  diglett() {
    const tex = this.digTex.clone();
    tex.repeat.set(1 / 6, 1);
    tex.magFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
    sp.scale.set(DIGLETT, DIGLETT, 1);
    sp.renderOrder = SPRITES;
    this.scene.add(sp);
    return sp;
  }
  // each lane's rank now (the coins): as the places go
  ranks() { return R.placesOf(this.lanes.map((l) => l.finish), this.lanes.map((l) => l.prior), this.lanes.map((l) => l.progress)); }

  // the camera now: { eye, at, fov }
  camera() {
    if (this.ended !== null && this.endPath) { // down to the winner(s), then round them (between frames)
      const { path, still } = this.endPath, n = Math.max(0, this.time * R.FPS - this.ended);
      const i = Math.floor(n), k = n - i, a = path[Math.min(i, path.length - 1)], b = path[Math.min(i + 1, path.length - 1)];
      const spin = Math.max(0, n - still) * END.spin;
      return { eye: eyeOf(VIEW.az - spin, lerp(a.el, b.el, k), lerp(a.d, b.d, k)), at: a.at.map((c, j) => lerp(c, b.at[j], k)), fov: VIEW.fov };
    }
    if (this.state !== "ready") return { eye: eyeOf(VIEW.az, VIEW.el, VIEW.d), at: VIEW.at, fov: VIEW.fov };
    // the count: round from the side (0x8670A07C)
    const n = Math.max(0, Math.min(GLIDE.frames, this.intro));
    const az = n < 65 ? -0x7ffc - n * 256 : VIEW.az;
    const el = Math.min(VIEW.el, GLIDE.el + 59 * n), d = Math.min(VIEW.d, GLIDE.d + 93.125 * n);
    const fov = Math.max(VIEW.fov, GLIDE.fov - 0.09375 * n), atY = Math.max(VIEW.at[1], GLIDE.atY - 10 * n);
    if (n >= GLIDE.frames) for (const s of this.scenery) s.visible = false;
    return { eye: eyeOf(az, el, d), at: [0, atY, 0], fov };
  }

  // ---- the end ----
  results() {
    const places = this.places();
    return [0, 1, 2, 3].map((i) => ({ i, score: this.scores ? this.scores[i] : this.timeOf(i), place: places[i] }));
  }
  celebrate() { return this.results(); }
}
