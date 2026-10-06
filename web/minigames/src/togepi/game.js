// A Tumbling Togepi game: the four lanes' rules (rules.js) on the round's
// clock, and the scene they drive. Four treadmills side by side on their
// platform (object 60), each belt scrolling the track (image bank 226) and
// carrying the course towards its Togepi; the camera in front, high up, the
// Togepi facing it. In the game's units (y up).
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
const ARROW_TILT = (0x2c00 / 0x10000) * 2 * Math.PI; // (the arrows' 0x1E)
const DIGLETT = 36 * 3.5; // its 36 x 36 pictures, 3.5x
// round each Togepi: its shadow (bank 307's 24 x 24 on a 60 x 60 quad, 1.5x, in
// the environment colour: 0x86700020), the dash's aura (object 188, 0.55x
// and longer with the speed: 0x86710668) and the rank coin over it (bank 387,
// 7x: 0x86706A30)
const SHADOW = { size: 90, y: 10, color: 0x0c1602 };
const AURA = 0.55;
const COIN = { w: 20 * 3.5, h: 16 * 3.5, y: 150, z: -50 }; // (half the game's size here: its quads may be smaller than the pictures)
// the others' badges on each belt, where they are along the track (0x86706B88: 3.2x, alpha 0x8C)
const GHOST = { w: 32 * 3.2, h: 16 * 3.2, y: 120, far: 600, alpha: 0x8c / 255 };
// The camera: eye D away at an azimuth and elevation (binary angles), looking at
// `at`, fov up and down (0x8670675C). The play's view, and the opening glide
// to it during the count (0x8670A07C: from the side, low and near, round to
// the front over 76 frames, the scenery round it showing)
const VIEW = { az: 0x4004, el: 0x19d3, d: 7570, at: [0, 40, 0], fov: 7.6 };
const GLIDE = { el: 0xad5, d: 1610, atY: 160, fov: 13.6, frames: 76 };
// the end (0x86709AD0): over 40 frames down to the winner(s), then round them
const END = { frames: 40, el: 0xd6d, d: 3380, atY: 200, spin: 0x80, after: 30 };
// how long after the first one's in a race is called (made for the remake:
// the game waits for all four)
export const CALL = 30 * R.FPS;

const angle = (a) => (a / 0x10000) * 2 * Math.PI;
export function eyeOf(az, el, d) {
  const t = d * Math.cos(angle(el));
  return [Math.cos(angle(az)) * t + 1, Math.sin(angle(el)) * d, Math.sin(angle(az)) * t];
}

export class Game {
  constructor(scene, assets) {
    this.scene = scene;
    this.assets = assets;
    this.listeners = {};
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
    const shadowMat = new THREE.MeshBasicMaterial({ color: SHADOW.color, alphaMap: assets.shadow, transparent: true, depthWrite: false });
    const shadowGeo = new THREE.PlaneGeometry(SHADOW.size, SHADOW.size).rotateX(-Math.PI / 2);
    const digTex = assets.diglett;
    this.lanesView = LANE_X.map((x0, p) => {
      const togepi = makeModel(assets.togepi, TOGEPI);
      add(togepi.root);
      const shadow = add(new THREE.Mesh(shadowGeo, shadowMat));
      shadow.renderOrder = 1;
      const aura = makeModel(assets.aura, AURA);
      aura.fade(1);
      aura.root.traverse((o) => { if (o.isMesh) o.material.blending = THREE.AdditiveBlending; }); // (a glow)
      aura.root.visible = false;
      add(aura.root);
      const coin = add(new THREE.Sprite(new THREE.SpriteMaterial({ map: assets.rank1, depthTest: false })));
      coin.scale.set(COIN.w, COIN.h, 1);
      coin.renderOrder = 5;
      const ghosts = [0, 1, 2, 3].filter((q) => q !== p).map((q) => {
        const s = add(new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, opacity: GHOST.alpha, depthTest: false })));
        s.scale.set(GHOST.w, GHOST.h, 1);
        s.renderOrder = 4;
        s.visible = false;
        return { q, s };
      });
      const slots = [...Array(60)].map(() => ({ type: -1, obj: null }));
      const digs = [];
      return { x0, togepi, shadow, aura, coin, ghosts, slots, digs, pools: {}, off: 0 };
    });
    this.digTex = digTex;
    this.reset("normal");
    this.state = "idle";
  }
  on(name, fn) { (this.listeners[name] ||= []).push(fn); }
  emit(name, ...args) { for (const fn of this.listeners[name] || []) fn(...args); }

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
    this.result = null; // the server's word on the end: { f, fin, p }
    this.scores = null;
    this.time = 0;
    this.state = "ready";
    this.lastFrame = -1;
    this.intro = 0; // frames since the countdown started (the camera's glide)
    this.after = -1; // frames since the end began
    this.ended = null; // the frame the end began
    for (const v of this.lanesView) {
      v.off = 0;
      v.togepi.pose(R.CLIP.idle, Math.random() * 24); // (rand2 % 25)
      v.idleAt = Math.random() * 24;
      for (const s of v.slots) { if (s.obj) s.obj.visible = false; s.type = -1; s.obj = null; }
      for (const d of v.digs) d.visible = false;
      v.end = null;
    }
    for (const s of this.scenery) s.visible = true;
    const told = setup.told;
    if (told?.sticks) told.sticks.forEach((list, z) => { if (list && !this.cpus[z]) this.inputs[z] = list.map((e) => [...e]); });
    if (told?.done) this.told("won", told.done);
    this.drawLanes(0);
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
  // it's called), fin (each one's finish frame, or null), p (how far each got, x10) })
  told(type, m) {
    if (type === "stick") {
      const z = m.s;
      if (!(z >= 0 && z < 4) || this.cpus[z] || !Number.isInteger(m.f) || !Number.isInteger(m.x) || !Number.isInteger(m.y)) return;
      const list = this.inputs[z];
      if (this.control[z] === "local") { // one of this device's own, as the server has it (from another frame)
        const k = list.findIndex(([f, x, y]) => f === m.o && x === m.x && y === m.y && f >= this.lastFrame - 60);
        if (k >= 0) list[k][0] = m.f;
        else list.push([m.f, m.x, m.y]); // (one it never made here: the server has it, from this device's connection)
        list.sort((a, b) => a[0] - b[0]);
        this.rewind(z, Math.min(m.f, k >= 0 ? m.o : m.f));
        return;
      }
      let k = list.length;
      while (k > 0 && list[k - 1][0] > m.f) k--;
      list.splice(k, 0, [m.f, m.x, m.y]);
      this.rewind(z, m.f);
      return;
    }
    if (type === "won") {
      if (!Number.isInteger(m.f) || !Array.isArray(m.fin)) return;
      this.result = { f: m.f, fin: m.fin.map((x) => (Number.isInteger(x) ? x : null)), p: Array.isArray(m.p) ? m.p.map((x) => +x || 0) : null };
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
  // run lane z up to frame t (a person's: by their stick changes)
  runTo(z, t) {
    const l = this.lanes[z];
    while (this.simT[z] < t) {
      const f = this.simT[z] + 1;
      if (f % 15 === 0 && f > this.snaps[z][this.snaps[z].length - 1][0]) this.snaps[z].push([f, l.save()]);
      const [x, y] = this.stickAt(z, f);
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
    if (this.state === "ready") this.intro += dt * R.FPS;
    if (this.state === "play") {
      this.time += dt;
      for (let t = this.lastFrame + 1; t <= this.frame; t++) { this.step(t); this.lastFrame = t; }
      if (this.over()) { this.state = "over"; this.emit("finish"); }
    } else if (this.state === "over") this.time += dt;
    if (this.ended !== null) {
      const k = this.time * R.FPS - this.ended;
      for (let n = this.after + 1; n <= Math.floor(k); n++) { this.ending(n); this.after = n; }
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
        list.push([t, x, y]);
        this.emit("send", { s: me, f: t, x, y });
      }
    }
    // the CPUs, together (they rank among themselves)
    const cpus = this.lanes.filter((l, z) => this.cpus[z]);
    if (cpus.length) {
      for (const l of cpus) l.step(t, 0, 0, true);
      R.rankCpus(this.lanes);
      this.lanes.forEach((l, z) => { if (this.cpus[z]) { this.simT[z] = t; this.sounds(z, t); } });
    }
    // the people: this device's now, the others a little behind
    for (let z = 0; z < 4; z++) if (!this.cpus[z]) this.runTo(z, Math.max(-1, t - this.delay[z]));
    // the end: once all four are in (their goal runs over), or the race is called
    const fin = this.finishes();
    if (this.ended === null) {
      const all = fin.every((f) => f !== null) && this.lanes.every((l, z) => l.state === R.DONE || t - fin[z] > END.after);
      const first = Math.min(...fin.map((f) => (f === null ? Infinity : f)));
      if (this.result ? t >= this.result.f : all || t >= first + CALL) this.ended = t;
    }
  }
  // each lane's finish frame (the server's word once it's in), or null
  finishes() {
    if (this.result) return this.result.fin;
    return this.lanes.map((l) => l.finish);
  }
  over() { return this.ended !== null && this.after >= END.after; }

  // n frames after the end began: the camera comes down to the winner(s), who
  // cheer (clip 6, and a cry 20 frames in); the others lose (clips 4, then 5)
  ending(n) {
    if (n !== 0) return;
    const places = this.places();
    const winners = places.map((p) => p === 1);
    this.emit("end", winners);
    this.lanesView.forEach((v, z) => { v.end = { win: winners[z], at: this.time }; });
    for (const s of this.scenery) s.visible = true;
    const at = this.lanesView.map((v, z) => [LANE_X[z] + this.lanes[z].x, this.lanes[z].z + v.off]).filter((x, z) => winners[z]);
    const mean = (k) => (at.length ? at.reduce((a, b) => a + b[k], 0) / at.length : 0);
    this.endAt = { x: mean(0), z: mean(1) };
  }

  // the places: by the frame each finished, then by how far each got
  places() {
    const fin = this.finishes(), prog = this.result?.p ? this.result.p.map((x) => x / 10) : this.lanes.map((l) => l.progress);
    const key = (z) => (fin[z] !== null ? [0, fin[z]] : [1, -prog[z]]);
    return [0, 1, 2, 3].map((z) => {
      const [a, b] = key(z);
      return 1 + [0, 1, 2, 3].filter((y) => { const [c, d] = key(y); return c < a || (c === a && d < b); }).length;
    });
  }
  // seat z's time, in hundredths of a second (null if it didn't get there)
  timeOf(z) {
    const f = this.finishes()[z];
    return f === null || f === undefined ? null : Math.round((f * 100) / R.FPS);
  }
  // how far seat z has got, % (the cards)
  progressOf(z) { return Math.max(0, Math.min(100, Math.floor(this.lanes[z].progress))); }

  // ---- every rendered frame ----
  animate(dt) {
    const between = this.state === "play" ? Math.max(0, Math.min(1, this.time * R.FPS - this.lastFrame)) : 0;
    this.drawLanes(between);
  }

  drawLanes(between) {
    const ranks = this.ranks();
    this.lanesView.forEach((v, z) => {
      const l = this.lanes[z];
      const off = v.off; // (0: the game moves a Togepi up or down its belt by its rank; not here, rules.js)
      // the belt's track
      const row = l.tile * 32 + l.px + 3;
      const uv = this.belts[z].geometry.attributes.uv;
      const v0 = row / 2048, v1 = (row + BELT.rows) / 2048;
      uv.setXY(0, 0, v0); uv.setXY(1, 1, v0); uv.setXY(2, 0, v1); uv.setXY(3, 1, v1);
      uv.needsUpdate = true;
      // the Togepi
      const x = v.x0 + l.x, y = l.y, zz = l.z + off;
      const t = v.togepi;
      t.root.position.set(x, y, zz);
      t.root.rotation.y = l.turn || 0;
      let clip = l.clip, f = l.frame + (this.state === "play" ? l.speed * between : 0);
      if (v.end) { // the end's clips
        const k = (this.time - v.end.at) * R.FPS;
        if (v.end.win) { clip = R.CLIP.win; f = k % R.CLIP_LEN[clip]; if (k >= 20 && !v.end.cried) { v.end.cried = true; this.emit("cheer", z); } }
        else if (k < R.CLIP_LEN[R.CLIP.lose]) { clip = R.CLIP.lose; f = k; }
        else { clip = R.CLIP.sad; f = (k - R.CLIP_LEN[R.CLIP.lose]) % R.CLIP_LEN[R.CLIP.sad]; }
        t.root.rotation.y = 0;
      } else if (this.state !== "play" && l.finish === null) { clip = R.CLIP.idle; f = (v.idleAt + this.time * R.FPS) % R.CLIP_LEN[clip]; }
      t.pose(clip, f);
      v.shadow.position.set(x, R.RUNNER_Z === l.z ? 80 + SHADOW.y : 80 + SHADOW.y, zz);
      // the dash's aura
      v.aura.root.visible = l.auraA > 0 && !v.end;
      if (v.aura.root.visible) {
        v.aura.root.position.set(x, y + 50, zz);
        v.aura.root.scale.set(1, 1, Math.max(0.01, (l.boost + AURA) / AURA));
        v.aura.fade(l.auraA / 255);
      }
      // the rank coin
      v.coin.material.map = this.assets["rank" + ranks[z]];
      v.coin.position.set(x, y + COIN.y, zz + COIN.z);
      v.coin.visible = this.state === "play" && !v.end;
      // what's on the belt
      l.slots.forEach((o, i) => {
        const s = v.slots[i];
        const type = o.type >= 0 && o.shown && o.type !== R.DIGLETT ? o.type : -1;
        if (s.type !== type) {
          if (s.obj) { s.obj.visible = false; s.obj.userData.free = true; }
          s.obj = type >= 0 ? this.take(v, type) : null;
          s.type = type;
        }
        if (s.obj) s.obj.position.set(v.x0 + o.x, OBSTACLE_Y, o.z + off);
      });
      // the Diglett, as sprites
      let d = 0;
      for (const o of l.slots) {
        if (o.type !== R.DIGLETT || !o.shown) continue;
        const sp = v.digs[d] || (v.digs[d] = this.diglett());
        sp.visible = true;
        sp.position.set(v.x0 + o.x, OBSTACLE_Y + DIGLETT * 0.35, o.z + off);
        sp.material.map.offset.x = R.Lane.digFrame(o.n) / 6;
        d++;
      }
      for (; d < v.digs.length; d++) v.digs[d].visible = false;
      // the others' markers on this belt
      for (const g of v.ghosts) {
        const o = this.lanes[g.q], dz = ((o.tile * 32 + o.px) - (l.tile * 32 + l.px)) / R.SCROLL + (o.z + this.lanesView[g.q].off) - (l.z + off);
        g.s.visible = this.state === "play" && !v.end && l.finish === null && o.finish === null && Math.abs(dz) <= GHOST.far && !!g.s.material.map;
        g.s.position.set(v.x0 + o.x, GHOST.y, zz + dz);
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
      if (type === R.ARROW) { // its chevron (cb00) over its gradient (cb01), on the same quad
        o.children[0].rotation.x = ARROW_TILT;
        o.traverse((m) => {
          if (!m.isMesh || !/cb00/.test(m.material.name)) return;
          m.material = m.material.clone();
          Object.assign(m.material, { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 });
          m.renderOrder = 1;
        });
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
    this.scene.add(sp);
    return sp;
  }
  // each lane's rank now: finishers by when, the rest by how far
  ranks() {
    const fin = this.lanes.map((l) => l.finish);
    const key = (z) => (fin[z] !== null ? [0, fin[z]] : [1, -this.lanes[z].progress]);
    return [0, 1, 2, 3].map((z) => {
      const [a, b] = key(z);
      return 1 + [0, 1, 2, 3].filter((y) => { const [c, d] = key(y); return c < a || (c === a && d < b); }).length;
    });
  }

  // the camera now: { eye, at, fov }
  camera() {
    if (this.ended !== null && this.endAt) { // down to the winner(s), then round them
      const k = Math.min(1, Math.max(0, (this.time * R.FPS - this.ended) / END.frames));
      const spin = Math.max(0, this.time * R.FPS - this.ended - END.frames) * END.spin;
      const el = VIEW.el + (END.el - VIEW.el) * k, d = VIEW.d + (END.d - VIEW.d) * k;
      return { eye: eyeOf(VIEW.az - spin, el, d), at: [this.endAt.x * k, VIEW.at[1] + (END.atY - VIEW.at[1]) * k, this.endAt.z * k], fov: VIEW.fov };
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
