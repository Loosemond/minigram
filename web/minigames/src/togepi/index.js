// Tumbling Togepi in the minigames shell (main.js): the treadmills and their
// cameras, the controls (hold on your belt to run, the Togepi going where
// your finger is; or the keys), its HUD (the cards at the belts' near ends)
// and its online messages ("stick", "won"). The rules are in rules.js, the
// game in game.js.
import * as THREE from "three";
import { loadAssets } from "./assets.js";
import { Game, LANE_X, BELT, eyeOf } from "./game.js";
import * as R from "./rules.js";
import { meMark } from "../mark.js";

export const SOUNDS = {
  url: "assets/togepi/sound.bin",
  standIns: {
    bounce: (tone) => tone(660, 0, 0.08, { type: "triangle", vol: 0.08, to: 990 }),
    knock: (tone, noise) => noise(0, 0.15, { vol: 0.15, filter: "lowpass", freq: 900 }),
    cheer: (tone) => [784, 988, 1175].forEach((f, i) => tone(f, i * 0.08, 0.12, { vol: 0.07 })),
    step: (tone, noise) => noise(0, 0.03, { vol: 0.03, filter: "lowpass", freq: 600 }),
    flowerStep: (tone, noise) => noise(0, 0.05, { vol: 0.04, filter: "highpass", freq: 2500 }),
    dash: (tone) => tone(440, 0, 0.25, { type: "sawtooth", vol: 0.06, to: 1320 }),
    crowd: (tone, noise) => noise(0, 1.2, { vol: 0.08, filter: "bandpass", freq: 1200 }),
  },
};

// the game's screen: 320 x 240
const ASPECT = 4 / 3;
// On a phone each belt gets a view of its own (made for the remake): yours
// big, the others small; the same way on as the game's camera, closer
const LANE_FAR = 7570, LANE_SPAN = { w: 300, z0: -560, z1: 600 }, MINI_ASPECT = 0.62;
// where a belt's card goes: below its near end (where the game has the badges: 0x867068EC)
const CARD = { y: 80, z: 600 };
// the touch: hold on your belt to run; the Togepi steers for your finger,
// the stick 3 a unit it's off (in steps of 15, so it changes now and then), none within 5
const STEER = { k: 3, step: 15, dead: 5 };
const UI = "assets/ui/";
const COLOUR_NAMES = ["blue", "green", "red", "yellow"];
const HEAD = 125; // the arrow over your Togepi (113 tall)

export async function create(shell, onProgress) {
  const assets = await loadAssets("assets/togepi/", onProgress);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9cc8f0);
  scene.add(new THREE.AmbientLight(0xffffff, 0.62 * Math.PI));
  const sun = new THREE.DirectionalLight(0xffffff, 0.5 * Math.PI);
  sun.position.set(0.3, 1, 0.8);
  scene.add(sun);
  const game = new Game(scene, assets);
  const loader = new THREE.TextureLoader();
  const badges = {};
  const badge = (name) => badges[name] || (badges[name] = loader.load(UI + "badge_" + name + ".png", (t) => { t.colorSpace = THREE.NoColorSpace; }));

  // ---- its HUD: a hint till GO ----
  const hud = document.createElement("div");
  hud.className = "game-hud tg";
  hud.innerHTML = `<div class="tg-hint" hidden>Hold to run · steer with your finger</div>`;
  shell.hud.append(hud);
  const hint = hud.querySelector(".tg-hint");
  const mark = meMark(hud, shell.me), over = new THREE.Vector3();

  // ---- sounds and the like, from the game ----
  const mine = (z) => z === shell.me();
  let firstIn = false;
  game.on("send", (m) => shell.send("stick", m));
  game.on("dash", (z) => shell.sound("dash", z)); // (0x9F0B)
  game.on("bounce", (z) => shell.sound("bounce", z)); // (0x9F00)
  game.on("knock", (z) => shell.sound("knock", z)); // (0x9F01)
  game.on("step", (z) => shell.sound("step", z)); // (0x9F03)
  game.on("flowerStep", (z) => shell.sound("flowerStep", z)); // (0x9F04)
  game.on("hit", (z) => { if (mine(z)) { shell.haptic("medium"); shell.flash(z, "hurt"); } });
  game.on("arrow", (z) => { if (mine(z)) shell.haptic("light"); });
  // (the ones panned to their player are 0x80027A18's; these the middle's, 0x800279B4 and 0x80027764)
  game.on("goal", (z) => {
    shell.sound("go"); // (0x5F08, again: 0x86705998)
    if (!firstIn) { firstIn = true; shell.sound("crowd", undefined, { frames: 0x44 }); } // (0x1C07 for the first, held 68 frames)
    if (mine(z)) shell.haptic("success");
  });
  game.on("cheer", () => shell.sound("cheer")); // (0x9F02, 20 frames into a winner's clip 6: 0x867044DC)

  // ---- the views ----
  const coarse = window.matchMedia?.("(pointer: coarse)");
  const fullCam = new THREE.PerspectiveCamera(7.6, ASPECT, 100, 12800);
  const laneCams = [0, 1, 2, 3].map(() => new THREE.PerspectiveCamera(5, 1, 100, 12800));
  let views = [], mode = "full", portrait = false, touchArea = null;
  const v3 = new THREE.Vector3();
  function project(v, x, y, z, cam = v.cam) {
    v3.set(x, y, z).project(cam);
    return [v.x + ((v3.x + 1) / 2) * v.w, v.y + ((1 - v3.y) / 2) * v.h];
  }
  const viewOf = (z) => (mode === "full" ? views[0] : views.find((v) => v.zone === z));
  const center = (z) => LANE_X[z] + R.START_X;

  // The game's view, its 4:3 screen as big as fits
  function aimFull(cam, v, { eye, at, fov }) {
    const aspect = v.w / v.h;
    cam.aspect = aspect;
    cam.fov = aspect >= ASPECT ? fov : THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(fov / 2)) * ASPECT / aspect));
    cam.position.set(...eye);
    cam.lookAt(...at);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    v.base = cam.position.clone();
  }
  // a belt's view: the game's way on, the belt as big as fits (the near end low)
  const DIR = new THREE.Vector3(...eyeOf(0x4004, 0x19d3, 1e6)).normalize();
  function aimLane(v) {
    const cam = v.cam, cx = center(v.zone);
    const at = new THREE.Vector3(cx, BELT.y, (LANE_SPAN.z0 + LANE_SPAN.z1) / 2);
    cam.position.copy(at).addScaledVector(DIR, LANE_FAR);
    cam.lookAt(at);
    cam.aspect = v.w / v.h;
    // the fov that fits the belt's corners
    cam.fov = 2;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    let mx = 0, my = 0;
    for (const x of [cx - LANE_SPAN.w / 2, cx + LANE_SPAN.w / 2]) {
      for (const [y, z] of [[BELT.y, LANE_SPAN.z0], [BELT.y + 140, LANE_SPAN.z0], [BELT.y, LANE_SPAN.z1]]) {
        v3.set(x, y, z).project(cam);
        mx = Math.max(mx, Math.abs(v3.x));
        my = Math.max(my, Math.abs(v3.y));
      }
    }
    const k = Math.max(mx, my) * 1.04;
    cam.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(1)) * k));
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    v.base = cam.position.clone();
  }

  // ---- the controls: hold on your belt (the Togepi goes where your finger is), or the keys ----
  const ray = new THREE.Raycaster(), belt = new THREE.Plane(new THREE.Vector3(0, 1, 0), -BELT.y);
  let touch = null; // the finger (or mouse) held: { id, x (where on the belt, lane units) }
  function beltX(cx, cy) {
    const a = touchArea, me = shell.me(), v = viewOf(me);
    if (!a || !v || cx < a.x || cx > a.x + a.w || cy < a.y || cy > a.y + a.h) return null;
    ray.setFromCamera(new THREE.Vector2(((cx - v.x) / v.w) * 2 - 1, 1 - ((cy - v.y) / v.h) * 2), v.cam);
    const p = ray.ray.intersectPlane(belt, new THREE.Vector3());
    if (!p) return null;
    return p.x - LANE_X[me];
  }
  const keys = new Set();
  const KEYS = { ArrowUp: "u", KeyW: "u", ArrowDown: "d", KeyS: "d", ArrowLeft: "l", KeyA: "l", ArrowRight: "r", KeyD: "r" };
  // the stick, from the keys (the D-pad: 60, 45 each on a diagonal) or the finger
  function stick() {
    if (touch) {
      const off = touch.x - game.lanes[shell.me()].x;
      let x = Math.abs(off) <= STEER.dead ? 0 : Math.round((off * STEER.k) / STEER.step) * STEER.step;
      x = Math.max(-60, Math.min(60, x));
      game.setStick(x, -60);
      return;
    }
    let x = (keys.has("r") ? 60 : 0) - (keys.has("l") ? 60 : 0), y = (keys.has("u") ? 60 : 0) - (keys.has("d") ? 60 : 0);
    if (x && y) { x *= 0.75; y *= 0.75; }
    game.setStick(x, y);
  }

  const api = {
    game, scene, assets,
    get views() { return views; },
    get shake() { return 0; },
    label: null,

    // a wide window with a mouse: the game's screen; a phone: your belt big
    // (in portrait under the other three, in landscape beside them)
    layout(W, H, safe, me, cards, framesEl) {
      portrait = W / H < 1.1;
      mode = portrait || coarse?.matches ? "lanes" : "full";
      if (mode === "full") {
        views = [{ cam: fullCam, x: 0, y: 0, w: W, h: H }];
        touchArea = { x: 0, y: 0, w: W, h: H };
        aimFull(fullCam, views[0], game.camera());
        const k = Math.min(W, H * ASPECT) / 320;
        const playCam = new THREE.PerspectiveCamera();
        aimFull(playCam, { ...views[0] }, { eye: eyeOf(0x4004, 0x19d3, 7570), at: [0, 40, 0], fov: 7.6 });
        cards.forEach((c, i) => {
          c.classList.toggle("mini", k < 2);
          const [x, y] = project(views[0], center(i), CARD.y, CARD.z, playCam);
          shell.place(c, { left: x + "px", top: y + "px", transform: "translate(-50%, 0)" });
        });
      } else {
        if (portrait) {
          views = shell.miniViews(W, H, safe, me, [], MINI_ASPECT, {}, {});
          const m = views[0];
          Object.assign(m, { x: 0, w: W, h: Math.round(safe.bottom - 4) - m.y });
        } else {
          const pad = 8, gap = 10, colW = Math.round((safe.bottom - safe.top - 2 * pad) * 0.42);
          const x0 = Math.round(safe.right - pad - 3 * colW - 2 * gap);
          views = [{ zone: me, x: 0, y: 0, w: x0 - gap, h: H }];
          [0, 1, 2, 3].filter((z) => z !== me).forEach((z, k) => views.push({
            zone: z, mini: true, x: x0 + k * (colW + gap), y: Math.round(safe.top + pad), w: colW, h: Math.round(safe.bottom - safe.top - 2 * pad),
          }));
        }
        const m = views[0];
        touchArea = { x: m.x, y: m.y, w: m.w, h: H - m.y };
        for (const v of views) { v.cam = laneCams[v.zone]; aimLane(v); }
        shell.frameMinis(views, cards, framesEl);
        const [x, y] = project(m, center(me), CARD.y, CARD.z);
        shell.place(cards[me], { left: x + "px", top: Math.min(y, m.y + m.h - 40) + "px", transform: "translate(-50%, 0)" });
      }
      return portrait;
    },

    reset(round) {
      // (online: the seats nobody was dealt are CPUs, as the server has them)
      const cpus = !round.online ? [0, 1, 2, 3].map((z) => z !== round.me)
        : [0, 1, 2, 3].map((z) => !(round.lineup || []).some((p) => p.seat === z));
      const delay = (round.delay || [0, 0, 0, 0]).map((sec) => Math.ceil((sec || 0) * R.FPS)); // (src/lag.js: s)
      game.reset(round.level, round.seed, { me: round.me, control: round.control, cpus, delay, told: round.start?.tg });
      game.setBadges([0, 1, 2, 3].map((z) => badge(cpus[z] ? "com_" + COLOUR_NAMES[z] : z + 1 + "p")));
      shell.stopSound();
      keys.clear();
      touch = null;
      firstIn = false;
      stick();
    },
    idle() {
      game.reset(game.levelName || "normal");
      game.state = "idle";
      shell.stopSound();
    },
    go() { game.start(); shell.music("main"); }, // song 46, from GO
    finish() {}, // (song 46 plays on till the results' own: module #55 never fades it there)
    stop() { game.stop(); },
    setControl(z, c) { game.setControl(z, c); },
    get state() { return game.state; },
    get time() { return game.time; },
    step(dt) { game.update(dt); },
    animate() {},
    score(i) { return game.progressOf(i); },
    setScores(scores) { game.scores = scores.map((x) => (Number.isInteger(x) && x >= 0 ? x : null)); },
    celebrate() { return game.celebrate(); },
    hud(on) { drawHud(on); },
    remote(t, m) { if (t === "stick" || t === "won") game.told(t, m); },

    pointerdown(e) {
      const x = beltX(e.clientX, e.clientY);
      if (x === null) return;
      touch = { id: e.pointerId, x };
      stick();
    },
    pointermove(e) {
      if (!touch || e.pointerId !== touch.id) return;
      const x = beltX(e.clientX, e.clientY);
      if (x !== null) touch.x = x;
    },
    pointerup(e) {
      if (!touch || e.pointerId !== touch.id) return;
      touch = null;
      stick();
    },
    keydown(e) {
      if (!KEYS[e.code]) return false;
      keys.add(KEYS[e.code]);
      stick();
      return true;
    },
    keyup(e) {
      if (!KEYS[e.code]) return;
      keys.delete(KEYS[e.code]);
      stick();
    },
    blur() { keys.clear(); touch = null; stick(); },
    debug: {
      stick: (x, y) => game.setStick(x, y),
      beltX,
      // where on the screen this device's belt is at lane x (0-276), z
      tapFor: (x, z = 0) => project(viewOf(shell.me()), LANE_X[shell.me()] + x, BELT.y, z),
      get mode() { return mode; },
      get lanes() { return game.lanes; },
    },
  };

  // ---- the HUD, each frame ----
  function drawHud(on) {
    hud.classList.toggle("off", !on);
    if (mode === "full" && views[0]) aimFull(fullCam, views[0], game.camera());
    // which Togepi is yours (the four look the same): in the game's view, or on your belt
    over.copy(game.lanesView[shell.me()].togepi.root.position).y += HEAD;
    mark.place((game.state === "play" || game.state === "over") && views[0], over);
    if (touch) stick(); // (the Togepi moves: the stick from the finger again)
    hint.hidden = !(game.state === "ready" || (game.state === "play" && game.lastFrame < 90));
    hint.textContent = mode === "full" && !coarse?.matches ? "Hold ↓ to run · ← → to steer (or hold the mouse)" : "Hold to run · steer with your finger";
  }

  api.idle();
  return api;
}
