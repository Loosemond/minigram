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
import { tintURL } from "../tint.js";

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
// The HUD (0x862040AC) in module #64's big digits (image bank 429, 0x87F06240) through FC30B261
// 5566FF7F (env + (prim - env) x the texel's grey: src/tint.js): the seconds left in green at 0.82,
// whatever's left (prim C8FF73, env 004600); each one's points at 0.57 in its player's prim and env
// (0x86203F50: 1P 00009B and AAF5FF, 2P 006400 and C8FF9B, 3P 780000 and FFA0BE, 4P D25A00 and FFFF8C)
const CLOCK = [0xc8ff73, 0x004600];
const POINTS = [[0x00009b, 0xaaf5ff], [0x006400, 0xc8ff9b], [0x780000, 0xffa0be], [0xd25a00, 0xffff8c]];
// the arrow over your Furret: over the game's label (48 tall, 180 over its
// tail's tip; small on a phone), clear of it, and gone with it in the end's show
const OVER_LABEL = 40;

export async function create(shell, onProgress) {
  const assets = await loadAssets("assets/furret/", onProgress);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(165 / 255, 173 / 255, 231 / 255); // (the game's clear colour: 0xA579)
  // the scene's lights (its layout, 0x86208038): 0xA0A0A0 all round, and a white light node and a grey
  // one (0x86208070, 0x86208088) that the game turns with the camera each frame (0x86200794,
  // 0x862007FC): from the eye's pitch over where it looks and its yaw (0x80037200), the white one at
  // pitch + 0x2000 and yaw - 0x2000, the grey one at -0x2000 - pitch and yaw + 0x6000; a node's way
  // (0x8003AE84) is (sin yaw cos pitch, sin pitch, cos yaw cos pitch), towards it. x PI: three's
  // lights are physical (and the shade's held to 1: assets.js)
  scene.add(new THREE.AmbientLight(0xa0a0a0, Math.PI));
  const white = new THREE.DirectionalLight(0xffffff, Math.PI), grey = new THREE.DirectionalLight(0x808080, Math.PI);
  scene.add(white, grey);
  const ANGLE = 65536 / (2 * Math.PI), way = (p, y) => {
    const P = p / ANGLE, Y = y / ANGLE;
    return [Math.sin(Y) * Math.cos(P), Math.sin(P), Math.cos(Y) * Math.cos(P)];
  };
  function light(eye, at) {
    const dx = eye.x - at[0], dy = eye.y - at[1], dz = eye.z - at[2];
    const pitch = Math.atan2(dy, Math.hypot(dx, dz)) * ANGLE, yaw = Math.atan2(dx, dz) * ANGLE;
    white.position.set(...way(pitch + 0x2000, yaw - 0x2000));
    grey.position.set(...way(-0x2000 - pitch, yaw + 0x6000));
  }
  const game = new Game(scene, assets);
  game.toGo = shell.toGo; // (before GO they pop up as the countdown goes: game.js)

  // ---- its HUD: the clock (0x862040AC), the hint, the buttons ----
  const hud = document.createElement("div");
  hud.className = "game-hud fu";
  hud.innerHTML = `
    <div class="fu-time" role="img" aria-label="Time"></div>
    <div class="fu-hint" hidden></div>
    <div class="fu-pads" hidden>
      <div class="fu-dpad rest"><i class="u"></i><i class="r"></i><i class="d"></i><i class="l"></i></div>
      <div class="fu-a"><img src="assets/furret/button_a.png" alt="A"></div>
    </div>`;
  shell.hud.append(hud);
  const timeEl = hud.querySelector(".fu-time");
  const hint = hud.querySelector(".fu-hint"), pads = hud.querySelector(".fu-pads"), dpad = hud.querySelector(".fu-dpad"),
    aEl = hud.querySelector(".fu-a");
  const mark = meMark(hud, shell.me), over = new THREE.Vector3();
  const clockPics = [], pointPics = POINTS.map(() => []); // (the digits coloured, as they come)
  for (let d = 0; d < 10; d++) {
    tintURL(`assets/ui/big${d}.png`, ...CLOCK).then((url) => { clockPics[d] = url; });
    POINTS.forEach(([prim, env], z) => tintURL(`assets/ui/big${d}.png`, prim, env).then((url) => { pointPics[z][d] = url; }));
  }

  // ---- sounds and the like, from the game ----
  // A placed sound goes by where its ball or Furret is across this device's view, as the game works it
  // out (0x87C03B60): through the view's matrix (0x87C037C0: the camera's, fov 30 on the 4:3 screen),
  // x 64, held to -127-127; 0x8002780C, 0x800277E0 pan it 64 + that
  const ear = new THREE.PerspectiveCamera(CAMERA.fov, 4 / 3, 50, 20000), place = new THREE.Vector3();
  game.placeOf = (p) => {
    if (!view) return 0;
    ear.position.copy(view.cam.position);
    ear.quaternion.copy(view.cam.quaternion);
    ear.updateMatrixWorld();
    return Math.trunc(Math.max(-127, Math.min(127, place.set(...p).project(ear).x * 64)));
  };
  const mine = (z) => z === shell.me();
  game.on("send", (m) => shell.send("pad", m));
  game.on("tempo", (n) => shell.tempo(n)); // (the last 30 s: the tune speeds up)
  game.on("sound", (name) => shell.sound(name));
  game.on("swing", (z, x) => { shell.sound("swing", z, { x }); if (mine(z)) shell.haptic("light"); }); // (0xBF00: on its player's channel)
  game.on("shot", (z, x) => { shell.sound("shot", z, { x }); if (mine(z)) shell.haptic("medium"); }); // (0xBF01, by the ball)
  game.on("bounce", (x) => shell.sound("bounce", { x })); // (0xBF03: no one's, 0x800277E0)
  game.on("cheer", (z, x) => shell.sound("cheer", { x })); // (0xBF05: no one's, by the Furret, 0x86206094)
  // the time's up: song 47 fades over 40 frames (0x8620392C), and the results' song comes at once (the shell's)
  game.on("end", () => shell.music(null, 40));
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

  let view = null, portrait = false, cardEls = [];
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
      light(cam.position, game.camera(cam, true)); // (the play's, not the end's: the shell lays out before it resets the round)
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
      cardEls = cards;
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
      const empty = round.empty || [false, false, false, false];
      // (but not the empty seats, with the CPUs off: no Furret there)
      const cpus = !round.online ? [0, 1, 2, 3].map((z) => z !== round.me && !empty[z])
        : [0, 1, 2, 3].map((z) => !empty[z] && !(round.lineup || []).some((p) => p.seat === z));
      game.reset(round.level, round.seed, { me: round.me, control: round.control, cpus, empty, told: m?.fu, delay: round.delay });
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
    finish() {}, // (its song's faded at the time's up: "end", above)
    stop() { game.stop(); },
    setControl(z, c) { game.setControl(z, c); },
    get state() { return game.state; },
    get time() { return game.time; },
    // (the camera moves at the end, and the shell puts it at view.base each frame: the base goes with it)
    step(dt) {
      game.update(dt);
      if (!view) return;
      light(view.cam.position, game.camera(view.cam));
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
  // n in coloured digits (pics: 0-9's) into el, once they're all made
  function showDigits(el, n, pics, cls) {
    const t = String(Math.max(0, n));
    if (el.dataset.fu === t && el.firstElementChild?.classList.contains(cls)) return;
    const urls = t.split("").map((d) => pics[d]);
    if (urls.some((u) => !u)) return;
    el.innerHTML = urls.map((u) => `<img class="${cls}" src="${u}" alt="">`).join("");
    el.dataset.fu = t;
    if (el === timeEl) el.setAttribute("aria-label", t + " seconds");
  }
  function drawHud(on) {
    hud.classList.toggle("off", !on);
    const playing = game.state === "play" || game.state === "ready";
    pads.hidden = !playing || !coarse?.matches;
    timeEl.hidden = !(playing || game.state === "over");
    // the clock: seconds left, rounded up (0x862040AC: 60 at GO), its digits only
    showDigits(timeEl, game.state === "ready" ? R.TIME / R.FPS : game.secondsLeft(), clockPics, "fu-clock");
    // each one's points on its card, in its colours (over the shell's plain digits)
    cardEls.forEach((c, z) => { if (!game.empty[z]) showDigits(c.querySelector(".num"), game.points()[z], pointPics[z], "fu-big"); });
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
