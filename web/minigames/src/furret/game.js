// A Furret's Frolic round: the world (rules.js) on the round's clock, and the
// scene it drives. The field is object 155 (the field, the shadows along its
// edges, the boards on its ramps), at the middle of the game's units; the
// camera looks at it as the game's does: from 2708 away towards (56, 47, 56),
// 45 degrees round and 50.5 down (0x86202E94), fov 30. 30 frames a second.
//
// Who plays each seat: "local" (this device's player), "cpu" or "remote"
// (someone on another device, online). The CPUs think in the world, so every
// device runs them alike. This device's player's pad emits "send" as it
// changes (the spot the D-pad holds, and an A press), for a few frames on
// (src/lag.js: online, so it gets to the others first); online, the others'
// come in told("pad"), sometimes late: the world runs on guessing they held
// the D-pad as they did and didn't press A, and runs again from a saved frame
// when one comes in (the balls eased to where they really are). The server
// runs the same world and says how it ended (told("won")).
import * as THREE from "three";
import { makeModel } from "./assets.js";
import * as R from "./rules.js";
import { leadFor } from "../lag.js";
import { faceOnRender } from "../facing.js";
import { makeBadge } from "../badge.js";

// frames after the play's over before the round is (the winners hop to the middle and cheer)
export const AFTER = 120;
// the camera (0x87F0C094: from its look-at point, dist away, pitch down and yaw round; 65536 to a turn)
const ANG = (a) => (a / 65536) * Math.PI * 2;
function eyeFrom(at, dist, pitch, yaw) {
  const c = Math.cos(ANG(pitch));
  return [Math.sin(ANG(yaw)) * c * dist + at[0], -Math.sin(ANG(pitch)) * dist + at[1], Math.cos(ANG(yaw)) * c * dist + at[2]];
}
const AT = [56, 47, 56], DIST = 2708, PITCH = -0x23e1;
export const CAMERA = { eye: eyeFrom(AT, DIST, PITCH, 0x2000), at: AT, fov: 30 };
// at the end (0x8620392C, 0x86203D50): over 2 s to 1400 away, 45 degrees down, looking past the middle; then round
const SHOW_DIST = 1400, SHOW_PITCH = -0x2000, SHOW_MOVE = 60, SHOW_TURN = 0x2e;
const SNAP = 6; // frames between the world's saved states (for running it again)
const KEEP = 20 * R.FPS; // and how far back they go
const SMOOTH = 0.88; // a corrected ball's ease to where it is, a 60th of a second
const FURRET = 0.4; // Furret's scale (0x862055F0: 0.4 "SO SC")
const LABEL_UP = 180; // the label over a Furret, above its tail's tip (0x86205500)
const LABEL = [96, 48]; // (its size: made for the remake)
// the badges over the goals (0x86207874: on the field's attachments 1-4, tilted to the camera), by goal
const BADGE_AT = [[-460, 64, -460], [457, 64, -462], [-462, 64, 457], [460, 64, 460]];
const BADGE = [150, 117]; // (their size: made for the remake, the badges' 36 x 28)
const BADGE_A = 0x96 / 255; // (their env alpha: 0x86207760)
const SHADOW_A = 0x80 / 255; // a ball's shadow (0x862014B8: the dot, black at 128)
// each player's colours (0x862040AC: their points' digits)
export const COLOURS = [0x5f7dff, 0x50d050, 0xff6464, 0xffd23c];

export class Game {
  constructor(scene, assets) {
    this.scene = scene;
    this.assets = assets;
    this.listeners = {};
    const add = (o) => { scene.add(o); return o; };
    faceOnRender(scene); // (the balls' glint: its joint drawn facing the camera, however the ball rolls)
    // the field
    this.field = ["field", "field_shadows", "boards"].map((name) => {
      const m = makeModel(assets[name], 1);
      if (name === "field_shadows") {
        m.root.renderOrder = 1;
        for (const mat of m.mats) { mat.depthWrite = false; mat.transparent = true; }
      }
      return add(m.root);
    });
    // the Furret: in the play, and at the end (its other layout), each with its label
    this.furret = [0, 1, 2, 3].map(() => {
      const v = { play: makeModel(assets.furret, FURRET), end: makeModel(assets.furret_end, FURRET) };
      add(v.play.root);
      add(v.end.root);
      v.end.root.visible = false;
      v.label = add(new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, opacity: 0x96 / 255, depthTest: false })));
      v.label.scale.set(LABEL[0], LABEL[1], 1);
      v.label.renderOrder = 5;
      return v;
    });
    // the badges over the goals
    this.badges = [0, 1, 2, 3].map(() => {
      const m = add(makeBadge(assets.badges, { size: BADGE, opacity: BADGE_A, flat: true, renderOrder: 2 }));
      m.rotation.order = "YXZ";
      m.rotation.x = ANG(-0x3777);
      return m;
    });
    // the balls (made as they come) and their shadows
    this.balls = new Map();
    this.turn(0x2000);
    this.shadowMat = new THREE.MeshBasicMaterial({ color: 0, map: assets.shadow, transparent: true, opacity: SHADOW_A, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    this.reset("normal");
    this.state = "idle";
  }
  on(name, fn) { (this.listeners[name] ||= []).push(fn); }
  emit(name, ...args) { for (const fn of this.listeners[name] || []) fn(...args); }

  // A round. level: easy / normal / hard; setup: { me, control, cpus (which
  // seats are CPUs), told (online, the server's word so far: to rejoin it
  // midway), delay (each seat's, src/lag.js) }
  reset(level, seed = (Math.random() * 2 ** 31) | 0, setup = {}) {
    this.levelName = level;
    this.seed = seed;
    this.me = setup.me ?? 0;
    this.control = setup.control || [0, 1, 2, 3].map((z) => (z === this.me ? "local" : "cpu"));
    this.cpus = setup.cpus || this.control.map((c) => c === "cpu");
    // (online, with other people: this device's player's pads count this many frames on)
    this.lead = leadFor(this.control.map((c, z) => c === "remote" && !this.cpus[z]), setup.delay);
    this.world = new R.World(seed, level, this.cpus);
    this.inputs = [[], [], [], []]; // each person's pad: [frame, spot, A 0/1]
    this.snaps = [[0, this.world.save()]]; // the world as it was before a frame
    this.simT = -1; // the last frame the world has run
    this.shownT = -1; // and whose sounds have gone
    this.spot = 0; // this device's player's D-pad (the spot it holds)...
    this.presses = 0; // ...and its A presses not yet in a frame
    this.lastPad = 0;
    this.result = null; // the server's word on the end: { f, s }
    this.scores = null;
    this.time = 0;
    this.state = "ready";
    this.lastFrame = -1;
    this.clockS = 0;
    this.endAt = null;
    this.winners = null;
    this.tempoN = 0;
    this.lastSecond = null;
    this.bounceAt = {}; // (each ball's last bounce sound)
    this.before = null; // where the balls were before the last frame (to draw between)
    this.offsets = new Map(); // a corrected ball's offset, easing away
    for (const [, v] of this.balls) this.drop(v);
    this.balls.clear();
    const told = setup.told;
    if (told?.pads) told.pads.forEach((list, z) => { if (list && !this.cpus[z]) this.inputs[z] = list.map((e) => [...e]); });
    if (told?.done) this.told("won", told.done);
    // the badges: each goal's player's (1P-4P; a CPU's COM in its colour)
    for (let z = 0; z < 4; z++) {
      const m = this.badges[R.GOALS[z]].seat(z, this.cpus[z]);
      m.position.set(...BADGE_AT[R.GOALS[z]]);
      const v = this.furret[z];
      v.label.material.map = this.assets[`label${this.cpus[z] ? 4 : z}`];
      v.label.material.needsUpdate = true;
    }
    this.draw(0);
  }
  start() { this.state = "play"; }
  stop() { this.state = "over"; }
  setControl(z, c) {
    if (c === "cpu" && !this.cpus[z]) return; // (a person who left: their Furret stays where it was)
    this.control[z] = c;
  }

  get frame() { return Math.floor(this.time * R.FPS + 1e-6); }

  // ---- input ----
  // this device's player: the spot the D-pad holds (0: none, the middle; 1-4: right, down, up, left), and A
  setSpot(s) { this.spot = s >= 0 && s <= 4 ? s : 0; }
  press() { if (this.state === "play") this.presses = Math.min(2, this.presses + 1); }
  // seat z's pad on frame t: [spot, A]
  padAt(z, t) {
    const list = this.inputs[z];
    let i = list.length - 1;
    while (i >= 0 && list[i][0] > t) i--;
    if (i < 0) return [0, false];
    let a = false;
    for (let j = i; j >= 0 && list[j][0] === t; j--) if (list[j][2]) a = true;
    return [list[i][1], a];
  }

  // the server's word: someone's pad ("pad": { s, f, x: the spot, a }; to this
  // device's own, o: the frame it said), or the end ("won": { f, s: each one's points })
  told(type, m) {
    if (type === "pad") {
      const z = m.s;
      if (!(z >= 0 && z < 4) || this.cpus[z] || !Number.isInteger(m.f) || !(Number.isInteger(m.x) && m.x >= 0 && m.x <= 4)
        || (m.a !== 0 && m.a !== 1)) return;
      const list = this.inputs[z];
      let k = list.length;
      if (this.control[z] === "local") { // one of this device's own, as the server has it (on another frame)
        const j = list.findIndex((e) => e[3] === m.o && e[1] === m.x && e[2] === m.a);
        if (j >= 0) {
          list[j][0] = m.f;
          this.rewind(Math.min(m.f, m.o));
          return;
        }
      }
      while (k > 0 && list[k - 1][0] > m.f) k--;
      list.splice(k, 0, [m.f, m.x, m.a]);
      this.rewind(m.f);
      return;
    }
    if (type === "won") {
      if (!Number.isInteger(m.f) || !Array.isArray(m.s)) return;
      this.result = { f: m.f, s: [0, 1, 2, 3].map((z) => (Number.isInteger(m.s[z]) ? m.s[z] : 0)) };
    }
  }
  // the world again from before frame f (a pad it ran without); where the
  // balls were is kept, to ease them to where they turn out to be
  rewind(f) {
    if (f > this.simT) return;
    if (!this.was) this.was = { t: this.simT, at: this.positions() };
    while (this.snaps.length > 1 && this.snaps[this.snaps.length - 1][0] > f) this.snaps.pop();
    const [at, state] = this.snaps[this.snaps.length - 1];
    this.world.load(state);
    this.simT = at - 1;
  }
  positions() { return new Map(this.world.balls.map((b) => [b.id, [...b.pos]])); }
  // run the world up to frame t
  runTo(t) {
    const w = this.world;
    while (this.simT < t) {
      const f = this.simT + 1;
      if (!w.over && f % SNAP === 0 && f > this.snaps[this.snaps.length - 1][0]) {
        this.snaps.push([f, w.save()]);
        while (this.snaps.length > 2 && this.snaps[1][0] < f - KEEP) this.snaps.shift();
      }
      if (f === t) this.before = this.positions();
      w.step(f, [0, 1, 2, 3].map((z) => (this.cpus[z] ? null : this.padAt(z, f))));
      this.simT = f;
      if (f > this.shownT) { this.sounds(f); this.shownT = f; }
      w.events = [];
      if (this.was && f === this.was.t) { // (run again to where it was: ease the balls from there)
        for (const b of w.balls) {
          const old = this.was.at.get(b.id);
          if (!old) continue;
          const o = this.offsets.get(b.id) || [0, 0, 0];
          for (let k = 0; k < 3; k++) o[k] += old[k] - b.pos[k];
          this.offsets.set(b.id, o);
        }
        this.was = null;
      }
    }
  }
  // frame f's sounds (once each), the last seconds and the tune's hurry
  sounds(f) {
    const w = this.world;
    for (const e of w.events) {
      const [what, z] = e;
      if (what === "end") { this.emit("over"); continue; }
      if (what === "spawn") continue;
      if (what === "bounce") {
        const b = w.balls.find((x) => x.id === z);
        if (b && !(f - (this.bounceAt[z] ?? -99) < 4)) { this.bounceAt[z] = f; this.emit("bounce", this.pan(b.pos)); }
        continue;
      }
      if (what === "goal") { this.emit("goal", z, e[3]); continue; }
      if (what === "shot") { this.emit("shot", z, this.pan(w.p[z].f.pos)); continue; }
      this.emit(what, z, this.pan(w.p[z].f.pos)); // (swing, cheer)
    }
    if (!w.over) {
      // the clock's last three seconds (0xCF00), and its 0 (0xCF06: the time's up)
      const s = Math.ceil(w.left / R.FPS);
      if (w.left % R.FPS === 0 && s < 4 && s !== this.lastSecond) {
        this.emit("sound", s === 0 ? "lastGo" : "lastCount");
        this.lastSecond = s;
      }
      // the tune's hurry in the last 30 s (0x80028108(11): a beat a minute faster every 15 frames, up to 30)
      if (w.left < R.HURRY) {
        const n = Math.min(30, Math.floor((R.HURRY - w.left) / 15) + 1);
        if (n !== this.tempoN) { this.tempoN = n; this.emit("tempo", n); }
      }
    } else if (w.end === f) this.emit("sound", "lastGo");
  }
  // a sound's pan: where it is across the screen
  pan(p) { return Math.round(64 + Math.max(-63, Math.min(63, ((p[0] - p[2]) / 2 / 1400) * 63))); }

  // ---- the round, frame by frame ----
  update(dt) {
    this.clockS += dt;
    if (this.state === "play") {
      this.time += dt;
      const now = this.frame;
      for (let t = this.lastFrame + 1; t <= now; t++) { this.step(t); this.lastFrame = t; }
      this.runTo(this.lastFrame); // (after a pad that came in late)
      const end = this.endFrame();
      if (end !== null && this.frame >= end + AFTER) { this.stop(); this.emit("finish"); }
    } else if (this.state === "over") this.time += dt;
    const ended = this.world.end !== null || (this.result && this.lastFrame >= this.result.f);
    if (ended && this.endAt === null) this.ending();
    this.animate(dt);
  }
  // the frame the play ended on: the server's, else this device's world's
  endFrame() { return this.result ? this.result.f : this.world.end; }

  // what happens on frame t (from GO): this device's player's pad is kept (and sent) for frame
  // t + lead, and the world runs
  step(t) {
    const me = this.me, f = t + this.lead;
    if (this.control[me] === "local" && !this.cpus[me] && !this.world.over) {
      const a = this.presses > 0 ? 1 : 0;
      if (a) this.presses--;
      const x = this.spot;
      if (x !== this.lastPad || a) {
        this.inputs[me].push([f, x, a, f]); // ([frame, spot, A, the frame it was sent for])
        this.lastPad = x;
        this.emit("send", { s: me, f, x, a });
      }
    }
    this.runTo(t);
  }
  over() { return this.state === "over"; }

  // each one's points: the server's once it's said, else the world's
  points() { return this.result ? this.result.s : this.world.scores; }
  // the places (1-4) by points
  places() { const s = this.points(); return s.map((x) => 1 + s.filter((y) => y > x).length); }
  // the seconds on the clock (the game's: rounded up, 60 at GO: 0x862040AC)
  secondsLeft() { return Math.ceil(this.world.left / R.FPS); }

  // ---- the end: the winners hop to the middle and cheer, the others sulk ----
  ending() {
    this.endAt = this.time;
    const p = this.places(), s = this.points();
    this.winners = p.map((x) => x === 1 && !s.every((y) => y === s[0])); // (all level: nobody)
    this.emit("end", this.winners);
  }

  // ---- every rendered frame ----
  animate(dt) {
    const k = Math.pow(SMOOTH, dt * 60);
    for (const o of this.offsets.values()) { o[0] *= k; o[1] *= k; o[2] *= k; }
    const between = this.state === "play" ? Math.max(0, Math.min(1, this.time * R.FPS - this.lastFrame)) : 1;
    this.draw(between, dt);
  }

  draw(between, dt = 0) {
    const w = this.world, before = this.before;
    // the Furret (where the world has them: they hop from spot to spot as their clips land)
    w.p.forEach((p, z) => {
      const v = this.furret[z], f = p.f, end = f.layout === 1;
      v.play.root.visible = !end;
      v.end.root.visible = end;
      const m = end ? v.end : v.play;
      m.root.position.set(...f.pos);
      m.root.rotation.y = ANG(R.YAW[p.goal]);
      // its clip: before GO popping up (its clip 0 going round), then the world's, between frames
      let frame = f.frame + 1 + (this.state === "play" ? between - 1 : 0);
      if (this.state === "ready" || this.state === "idle") frame = (this.clockS * R.FPS) % R.CLIP_LEN[R.CLIP.up];
      const hold = f.clip === R.CLIP.hop || f.clip === R.CLIP.land;
      m.pose(f.clip, Math.max(0, Math.min(frame, R.CLIP_LEN[f.clip] - (hold ? 1 : 0))), hold);
      v.label.position.set(f.tail[0], f.tail[1] + LABEL_UP, f.tail[2]);
      v.label.visible = !w.over;
    });
    // the balls: rolling on the field, a shadow under each while the clock runs (0x86201620)
    const seen = new Set();
    for (const b of w.balls) {
      seen.add(b.id);
      let v = this.balls.get(b.id);
      if (!v || v.kind !== b.kind) {
        if (v) this.drop(v);
        v = this.ball(b.kind);
        this.balls.set(b.id, v);
        v.at = null;
      }
      const was = before?.get(b.id) || b.pos, o = this.offsets.get(b.id) || [0, 0, 0];
      const x = was[0] + (b.pos[0] - was[0]) * between + o[0];
      const y = was[1] + (b.pos[1] - was[1]) * between + o[1];
      const zz = was[2] + (b.pos[2] - was[2]) * between + o[2];
      // (rolling: turned about the level line across its way, as far as it went over its radius)
      if (v.at) {
        const dx = x - v.at[0], dz = zz - v.at[2], d = Math.hypot(dx, dz);
        if (d > 0.01 && d < 400) {
          const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(dz / d, 0, -dx / d), d / R.RADIUS[b.kind]);
          v.model.root.quaternion.premultiply(q);
        }
      }
      v.at = [x, y, zz];
      v.model.root.position.set(x, y, zz);
      v.model.fade(b.alpha / 255);
      const g = w.left > 0 ? R.groundY(x, zz) : null;
      v.shadow.visible = g !== null && y - g < 2000;
      if (v.shadow.visible) v.shadow.position.set(x, g + 6, zz);
    }
    for (const [id, v] of this.balls) if (!seen.has(id)) { this.drop(v); this.balls.delete(id); this.offsets.delete(id); }
  }
  // a ball's model and shadow, kept for when it's gone (a few of each kind)
  ball(kind) {
    this.spare ||= {};
    const list = (this.spare[kind] ||= []);
    let v = list.pop();
    if (!v) {
      const model = makeModel(this.assets[`ball${kind}`], R.ballScale(kind));
      const shadow = new THREE.Mesh(new THREE.PlaneGeometry(2 * R.RADIUS[kind], 2 * R.RADIUS[kind]), this.shadowMat);
      shadow.rotation.x = -Math.PI / 2;
      shadow.renderOrder = 1;
      v = { kind, model, shadow };
    }
    this.scene.add(v.model.root);
    this.scene.add(v.shadow);
    return v;
  }
  drop(v) {
    this.scene.remove(v.model.root);
    this.scene.remove(v.shadow);
    (this.spare ||= {})[v.kind] ||= [];
    this.spare[v.kind].push(v);
  }

  // the view turned to yaw (65536 to a turn: the game's is 0x2000, 1P's goal at the bottom); the
  // badges turned with it, to read
  turn(yaw) {
    this.yaw = yaw;
    for (const m of this.badges) m.rotation.y = ANG(yaw); // (their tops away from the camera)
  }
  // the camera's place now: the game's in the play (turned); at the end, closer and going round (0x86203D50).
  // play: the play's place whatever the round's at (the view's framed by it, and a layout can come
  // while the last round's end is still on)
  camera(cam, play = false) {
    const r = Math.hypot(AT[0], AT[2]), a = ANG(this.yaw);
    let at = [Math.sin(a) * r, AT[1], Math.cos(a) * r], eye = eyeFrom(at, DIST, PITCH, this.yaw);
    if (this.endAt !== null && !play) {
      const f = (this.time - this.endAt) * R.FPS, k = Math.min(1, f / SHOW_MOVE), e = k * k * (3 - 2 * k);
      const yaw = this.yaw + Math.max(0, f - SHOW_MOVE) * SHOW_TURN;
      const at2 = [Math.sin(ANG(yaw)) * -400, 0, Math.cos(ANG(yaw)) * -400];
      const eye2 = eyeFrom(at2, SHOW_DIST, SHOW_PITCH, yaw);
      eye = eye.map((v, i) => v + (eye2[i] - v) * e);
      at = at.map((v, i) => v + (at2[i] - v) * e);
    }
    cam.position.set(...eye);
    cam.lookAt(...at);
  }

  // ---- the end ----
  results() {
    const places = this.places(), s = this.points();
    return [0, 1, 2, 3].map((i) => ({ i, score: this.scores ? this.scores[i] : s[i], place: places[i] }))
      .sort((a, b) => a.place - b.place || a.i - b.i);
  }
  celebrate() { return this.results(); }
}
