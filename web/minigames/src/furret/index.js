// Furret's Frolic in the minigames shell (main.js): the field and its camera,
// the controls (on a phone: a finger anywhere is the D-pad, the way it slides
// from where it went down, held; and the A button swings the tail; or the
// keys), its HUD (the clock, the hint and the buttons) and its online messages
// ("pad", "won"). The rules are in rules.js, the game in game.js.
//
// The game shows 1P's goal at the bottom; the remake turns the view a quarter
// at a time so this device's player's goal is at the bottom (the D-pad goes
// the way it looks), and each player's card sits by its goal.
import * as THREE from "three";
import { loadAssets } from "./assets.js";
import { Game, CAMERA } from "./game.js";
import * as R from "./rules.js";
import { meMark } from "../mark.js";

export const SOUNDS = {
  url: "assets/furret/sound.bin",
  standIns: {
    swing: (tone) => tone(500, 0, 0.12, { type: "triangle", vol: 0.05, to: 900 }),
    shot: (tone) => tone(300, 0, 0.1, { type: "square", vol: 0.07, to: 150 }),
    goal: (tone) => [660, 880, 1320].forEach((f, i) => tone(f, i * 0.07, 0.1, { type: "triangle", vol: 0.08 })),
    bounce: (tone) => tone(160, 0, 0.06, { type: "square", vol: 0.05, to: 90 }),
    cheer: (tone) => tone(700, 0, 0.3, { type: "triangle", vol: 0.06, to: 1100 }),
  },
};

const SHOW_HINT = 3 * R.FPS; // frames of the play the hint stays for
const DEAD = 14; // px a finger moves before it holds the D-pad
// what the view must show: the goals' lanes to past their lines, and the ramps the balls drop onto
const FIT = [];
for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) FIT.push([x * 700, 0, z * 700], [x * 700, 250, z * 700]);
for (const [x, z] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) FIT.push([x * 950, 760, z * 950]);
// the D-pad's ways on the screen, and the spots they hop to with the game's view (right, down, up, left)
const WAYS = { r: [1, 0], d: [0, 1], u: [0, -1], l: [-1, 0] };
// the arrow over your Furret: over the game's label (48 tall, 180 over its
// tail's tip; small on a phone), clear of it, and gone with it in the end's show
const OVER_LABEL = 40;

export async function create(shell, onProgress) {
  const assets = await loadAssets("assets/furret/", onProgress);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(165 / 255, 173 / 255, 231 / 255); // (the game's clear colour: 0xA579)
  // the scene's lights (its layout, 0x86208038: white and grey, at angles from the camera; 0xA0A0A0 all round)
  scene.add(new THREE.AmbientLight(0xffffff, 0.63 * Math.PI));
  const sun = new THREE.DirectionalLight(0xffffff, 0.55 * Math.PI);
  sun.position.set(-0.3, 1, 0.6);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xffffff, 0.2 * Math.PI);
  fill.position.set(0.6, 0.4, -0.3);
  scene.add(fill);
  const game = new Game(scene, assets);

  // ---- its HUD: the clock (0x862040AC), the hint, the buttons ----
  const hud = document.createElement("div");
  hud.className = "game-hud fu";
  hud.innerHTML = `
    <div class="fu-time"><small>TIME</small><b>60</b></div>
    <div class="fu-hint" hidden></div>
    <div class="fu-pads" hidden>
      <div class="fu-dpad rest"><i class="u"></i><i class="r"></i><i class="d"></i><i class="l"></i></div>
      <div class="fu-a"><img src="assets/furret/button_a.png" alt="A"></div>
    </div>`;
  shell.hud.append(hud);
  const timeEl = hud.querySelector(".fu-time"), timeNum = timeEl.querySelector("b");
  const hint = hud.querySelector(".fu-hint"), pads = hud.querySelector(".fu-pads"), dpad = hud.querySelector(".fu-dpad"),
    aEl = hud.querySelector(".fu-a");
  const mark = meMark(hud, shell.me), over = new THREE.Vector3();

  // ---- sounds and the like, from the game ----
  const mine = (z) => z === shell.me();
  game.on("send", (m) => shell.send("pad", m));
  game.on("tempo", (n) => shell.tempo(n)); // (the last 30 s: the tune speeds up)
  game.on("sound", (name) => shell.sound(name));
  game.on("swing", (z, pan) => { shell.sound("swing", { pan }); if (mine(z)) shell.haptic("light"); }); // (0xBF00)
  game.on("shot", (z, pan) => { shell.sound("shot", { pan }); if (mine(z)) shell.haptic("medium"); }); // (0xBF01)
  game.on("bounce", (pan) => shell.sound("bounce", { pan })); // (0xBF03)
  game.on("cheer", (z, pan) => shell.sound("cheer", { pan })); // (0xBF04)
  game.on("goal", (z, points) => { // (0xBF02, for the goal's player)
    shell.sound("goal", z);
    shell.flash(z, "bump");
    if (mine(z)) shell.haptic(points >= 3 ? "success" : "medium");
  });

  // ---- the controls ----
  // a finger anywhere (but the A button) is the D-pad: held the way it slid
  // from where it went down, let go for the middle; the A button swings. The
  // keys: ← ↑ → ↓ (or W A S D: the game takes left, then right, up, down,
  // 0x86206EF8), Space (and more) for A
  const coarse = window.matchMedia?.("(pointer: coarse)");
  let finger = null; // { id, x, y: where the finger went down, way }
  const keys = new Set();
  const KEYS = { ArrowUp: "u", KeyW: "u", ArrowDown: "d", KeyS: "d", ArrowLeft: "l", KeyA: "l", ArrowRight: "r", KeyD: "r" };
  const PRESS = new Set(["Space", "KeyX", "KeyK", "KeyJ", "KeyZ", "Enter"]);
  let yaw = 0x2000; // the view's (game.js: this device's player's goal at the bottom)
  // the spot a way on the screen hops to, as the view's turned
  function spotFor(way) {
    if (!way) return 0;
    const [sx, sy] = WAYS[way], a = (yaw / 65536) * Math.PI * 2;
    const right = [Math.cos(a), -Math.sin(a)], down = [Math.sin(a), Math.cos(a)]; // (in x, z)
    const w = [right[0] * sx + down[0] * sy, right[1] * sx + down[1] * sy];
    let best = 0, most = -Infinity;
    R.SPOTS.forEach((s, k) => {
      if (!k) return;
      const d = s.x * w[0] + s.z * w[1];
      if (d > most) { most = d; best = k; }
    });
    return best;
  }
  function hold(way) {
    game.setSpot(spotFor(way));
    for (const el of dpad.children) el.classList.toggle("on", el.className.startsWith(way || "-"));
  }
  function fromKeys() {
    if (finger) return;
    hold(["l", "r", "u", "d"].find((k) => keys.has(k)) || null);
  }
  function press() {
    game.press();
    aEl.classList.add("on");
    setTimeout(() => aEl.classList.remove("on"), 90);
  }
  const onButton = (e) => {
    const r = aEl.getBoundingClientRect();
    return !pads.hidden && r.width && Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2)) < r.width * 0.75;
  };
  function slide(e) {
    const dx = e.clientX - finger.x, dy = e.clientY - finger.y;
    const way = Math.hypot(dx, dy) < DEAD ? null : Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "r" : "l") : (dy > 0 ? "d" : "u");
    if (way !== finger.way) { finger.way = way; hold(way); }
  }
  function restPad() {
    dpad.classList.add("rest");
    shell.place(dpad, rest);
    hold(null);
  }
  let rest = {};

  let view = null, portrait = false;
  const api = {
    game, scene, assets,
    get views() { return view ? [view] : []; },
    get shake() { return 0; },
    label: null,

    // the field, seen from the game's camera turned for this device's player,
    // with the field of view that shows the lanes and ramps (at least the
    // game's 30 degrees), over the whole window: in portrait the picture's
    // moved up under the top cards, the buttons below it. Each card in the
    // corner just round from its player's goal (going clockwise)
    layout(W, H, safe, me, cards) {
      portrait = W / H < 1.1;
      yaw = R.YAW[R.GOALS[me]]; // (from its goal's side: the way its Furret faces)
      game.turn(yaw);
      const cam = view?.cam || new THREE.PerspectiveCamera(CAMERA.fov, 1, 50, 20000);
      view = { cam, x: 0, y: 0, w: W, h: H };
      cam.aspect = W / H;
      cam.clearViewOffset();
      game.camera(cam, true); // (the play's, not the end's: the shell lays out before it resets the round)
      cam.updateMatrixWorld();
      cam.fov = fitFov(cam);
      cam.updateProjectionMatrix();
      let box = screenBox(cam, view, fit());
      if (portrait) {
        const dy = Math.round(box.y - (safe.top + 70));
        if (dy > 0) {
          cam.setViewOffset(W, H, 0, dy, W, H);
          cam.updateProjectionMatrix();
          box = screenBox(cam, view, fit());
        }
      }
      view.base = cam.position.clone();
      const below = box.y + box.h;
      cards.forEach((c, z) => {
        c.classList.toggle("mini", true);
        // where its goal is on the screen (0 bottom, 1 right, 2 top, 3 left), and the corner round from it
        const k = (((R.YAW[R.GOALS[z]] - R.YAW[R.GOALS[me]]) / 0x4000) % 4 + 4) % 4;
        const left = k === 0 || k === 3, top = k === 2 || k === 3;
        shell.place(c, {
          ...(left ? { left: safe.left + 6 + "px" } : { right: W - safe.right + 6 + "px" }),
          ...(top ? { top: safe.top + 6 + "px" } : portrait ? { top: below + 6 + "px" } : { bottom: H - safe.bottom + 6 + "px" }),
        });
      });
      shell.place(timeEl, { left: W / 2 + "px", top: safe.top + 8 + "px", transform: "translateX(-50%)" });
      // the hint: in portrait under the field and its bottom cards, clear of the buttons
      shell.place(hint, portrait ? { left: W / 2 + "px", top: below + 44 + "px", transform: "translateX(-50%)" }
        : { left: "50%", bottom: "calc(var(--safe-b) + 14%)", transform: "translateX(-50%)" });
      const room = Math.max(150, H - below - 70); // (in portrait, below the field and its bottom cards)
      pads.classList.toggle("fu-below", portrait);
      pads.style.setProperty("--room", room + "px");
      rest = portrait ? { left: "28%", top: H - room / 2 + "px" } : { left: "16%", bottom: "24%" };
      if (!finger) restPad();
      return portrait;
    },

    reset(round) {
      const m = round.start;
      // (online: the seats nobody was dealt are CPUs, as the server has them)
      const cpus = !round.online ? [0, 1, 2, 3].map((z) => z !== round.me)
        : [0, 1, 2, 3].map((z) => !(round.lineup || []).some((p) => p.seat === z));
      game.reset(round.level, round.seed, { me: round.me, control: round.control, cpus, told: m?.fu, delay: round.delay });
      shell.stopSound();
      keys.clear();
      finger = null;
      restPad();
    },
    idle() {
      game.reset(game.levelName || "normal");
      game.state = "idle";
      shell.stopSound();
    },
    go() { game.start(); shell.music("main"); }, // (song 47, at GO: 0x86204F20)
    finish() { shell.music(null, 40); },
    stop() { game.stop(); },
    setControl(z, c) { game.setControl(z, c); },
    get state() { return game.state; },
    get time() { return game.time; },
    // (the camera moves at the end, and the shell puts it at view.base each frame: the base goes with it)
    step(dt) {
      game.update(dt);
      if (!view) return;
      game.camera(view.cam);
      view.base.copy(view.cam.position);
    },
    animate() {},
    score(i) { return game.points()[i]; },
    setScores(scores) { game.scores = scores.map((x) => (Number.isInteger(x) && x >= 0 ? x : 0)); },
    celebrate() { return game.celebrate(); },
    hud(on) { drawHud(on); },
    remote(t, m) { if (t === "pad" || t === "won") game.told(t, m); },

    pointerdown(e) {
      if (onButton(e)) { press(); return; }
      if (finger) return; // (one finger holds the D-pad)
      if (!(coarse?.matches || e.pointerType === "touch")) { press(); return; } // (a mouse: a click is A)
      finger = { id: e.pointerId, x: e.clientX, y: e.clientY, way: null };
      dpad.classList.remove("rest");
      shell.place(dpad, { left: e.clientX + "px", top: e.clientY + "px" });
      hold(null);
    },
    pointermove(e) { if (finger && e.pointerId === finger.id) slide(e); },
    pointerup(e) {
      if (!finger || e.pointerId !== finger.id) return;
      finger = null;
      restPad();
      fromKeys();
    },
    keydown(e) {
      if (KEYS[e.code]) { keys.add(KEYS[e.code]); fromKeys(); return true; }
      if (PRESS.has(e.code)) { if (!e.repeat) press(); return true; }
      return false;
    },
    keyup(e) {
      if (!KEYS[e.code]) return;
      keys.delete(KEYS[e.code]);
      fromKeys();
    },
    blur() { keys.clear(); finger = null; restPad(); },
    debug: {
      spot: (s) => game.setSpot(s),
      way: (w) => hold(w),
      press: () => game.press(),
      get world() { return game.world; },
      get spot() { return game.spot; },
      // where on the page a point of the scene (in its units) is
      onScreen(x, y, z) {
        const v = new THREE.Vector3(x, y, z).project(view.cam);
        return [view.x + ((v.x + 1) / 2) * view.w, view.y + ((1 - v.y) / 2) * view.h];
      },
    },
  };

  // ---- the HUD, each frame ----
  function drawHud(on) {
    hud.classList.toggle("off", !on);
    const playing = game.state === "play" || game.state === "ready";
    pads.hidden = !playing || !coarse?.matches;
    timeEl.hidden = !(playing || game.state === "over");
    // the clock: seconds left, rounded up (0x862040AC: 60 at GO)
    const s = game.state === "ready" ? R.TIME / R.FPS : game.secondsLeft();
    if (timeNum.textContent !== String(s)) timeNum.textContent = s;
    timeEl.classList.toggle("low", game.state === "play" && s <= 10);
    hint.hidden = !(game.state === "ready" || (game.state === "play" && game.lastFrame < SHOW_HINT));
    hint.textContent = coarse?.matches ? "Slide to hop into the grass · A: swing your tail" : "Arrows: hop into the grass · Space: swing your tail";
    // which Furret is yours (the four look the same)
    const label = game.furret[shell.me()].label;
    over.copy(label.position).y += OVER_LABEL;
    mark.place((game.state === "play" || game.state === "over") && label.visible && view, over);
  }

  // the points the view must show (the same a quarter turn round)
  const fit = () => FIT;
  // the field of view (degrees) that shows them from the camera
  function fitFov(cam) {
    let most = Math.tan((CAMERA.fov * Math.PI) / 360);
    const inv = cam.matrixWorldInverse, v = new THREE.Vector3();
    for (const p of fit()) {
      v.set(...p).applyMatrix4(inv);
      most = Math.max(most, Math.abs(v.y / v.z) * 1.03, Math.abs(v.x / v.z / cam.aspect) * 1.03);
    }
    return (360 / Math.PI) * Math.atan(most);
  }

  api.idle();
  return api;
}

// the screen box round some points of the scene (px, in the page)
function screenBox(cam, view, points) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const v = new THREE.Vector3();
  for (const p of points) {
    v.set(...p).project(cam);
    const x = view.x + ((v.x + 1) / 2) * view.w, y = view.y + ((1 - v.y) / 2) * view.h;
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  return { x: Math.round(x0), y: Math.round(y0), w: Math.round(x1 - x0), h: Math.round(y1 - y0) };
}
