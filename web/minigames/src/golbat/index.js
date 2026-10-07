// Gutsy Golbat in the minigames shell (main.js): the cave and its camera, the
// controls (on a phone: slide a finger on the left half to fly left and
// right, tap the right half to flap; or the keys), its HUD (the hint, the
// stick and the A button) and its online messages ("pad", "won"). The rules
// are in rules.js, the game in game.js.
import * as THREE from "three";
import { loadAssets } from "./assets.js";
import { Game, CAMERA } from "./game.js";

export const SOUNDS = {
  url: "assets/golbat/sound.bin",
  standIns: {
    bump: (tone, noise) => noise(0, 0.12, { vol: 0.15, filter: "lowpass", freq: 700 }),
    zap: (tone, noise) => noise(0, 0.3, { vol: 0.18, filter: "highpass", freq: 2200 }),
    wing: (tone, noise) => noise(0, 0.04, { vol: 0.03, filter: "lowpass", freq: 500 }),
    got: (tone) => [988, 1319].forEach((f, i) => tone(f, i * 0.06, 0.1, { type: "triangle", vol: 0.08 })),
    drop: (tone) => tone(880, 0, 0.18, { type: "triangle", vol: 0.07, to: 440 }),
    lastCount: (tone) => tone(660, 0, 0.12, { vol: 0.12 }),
    lastGo: (tone) => tone(1320, 0, 0.35, { vol: 0.12 }),
  },
};

// the game's screen: 320 x 240, as tall as the window in landscape and wider
// if the window is (more of the cave either side: game.js); in portrait the
// window's width
const ASPECT = 4 / 3;
// its badges (0x86108018: bank 434 at 0.8, the hearts beside them), on the 320 x 240 screen
const BADGE = [[28, 16], [97, 16], [166, 16], [235, 16]];
// the touch (made for the remake): a finger on the left half is a stick, full
// left or right RANGE px from where it went down (in steps of 16 of the
// game's 64, none within DEAD px); a tap on the right half flaps
const RANGE = 44, DEAD = 6, STEP = 16;
// portrait: the screen this much wider than the window, so it's bigger (its
// sides, where things only come on and go, are cut off)
const CROP = 1.05;
const SHOW_HINT = 90; // frames of the play the hint stays for, after the countdown

export async function create(shell, onProgress) {
  const assets = await loadAssets("assets/golbat/", onProgress);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  // the game's lights: one from the front and above, a dimmer one from below (0x86100ACC, 0x86100B34)
  scene.add(new THREE.AmbientLight(0xffffff, 0.62 * Math.PI));
  const sun = new THREE.DirectionalLight(0xffffff, 0.45 * Math.PI);
  sun.position.set(0.4, 0.8, 1.2);
  const fill = new THREE.DirectionalLight(0x808080, 0.3 * Math.PI);
  fill.position.set(-0.5, -0.6, 1);
  scene.add(sun, fill);
  const game = new Game(scene, assets);

  // ---- its HUD: the hint, and on a touch screen the stick and the A button ----
  const hud = document.createElement("div");
  hud.className = "game-hud gb";
  hud.innerHTML = `
    <div class="gb-hint" hidden></div>
    <div class="gb-pads" hidden>
      <div class="gb-stick rest"><b>◀</b><b>▶</b><i class="gb-knob"></i></div>
      <div class="gb-flap"><img src="assets/golbat/button_a.png" alt="A"></div>
    </div>`;
  shell.hud.append(hud);
  const hint = hud.querySelector(".gb-hint"), pads = hud.querySelector(".gb-pads");
  const stickEl = hud.querySelector(".gb-stick"), knob = hud.querySelector(".gb-knob"), flapEl = hud.querySelector(".gb-flap");

  // ---- sounds and the like, from the game ----
  const mine = (z) => z === shell.me();
  game.on("send", (m) => shell.send("pad", m));
  game.on("sound", (name) => shell.sound(name));
  game.on("wing", (z, pan) => shell.sound("wing", { pan })); // (0x0F03)
  game.on("got", (z, pan) => { // (0x0F04)
    shell.sound("got", { pan });
    if (mine(z)) { shell.haptic("light"); shell.flash(z, "bump"); }
  });
  game.on("drop", (z, pan) => shell.sound("drop", { pan })); // (0x0F05)
  game.on("zap", (z, pan) => { // (0x0F02)
    shell.sound("zap", { pan });
    if (mine(z)) { shell.haptic("medium"); shell.flash(z, "hurt"); }
  });
  game.on("bump", (z, pan) => { // (0x0F01)
    shell.sound("bump", { pan });
    if (mine(z)) { shell.haptic("medium"); shell.flash(z, "hurt"); }
  });

  // ---- the controls: a finger on the left half steers, one on the right flaps; or the keys ----
  const coarse = window.matchMedia?.("(pointer: coarse)");
  let stickTouch = null; // { id, x0, y0 }: where the steering finger went down (the stick's middle)
  const keys = new Set();
  const KEYS = { ArrowLeft: "l", KeyA: "l", ArrowRight: "r", KeyD: "r" };
  const FLAPS = new Set(["Space", "ArrowUp", "KeyW", "KeyX", "KeyK", "KeyJ", "KeyZ", "Enter"]);
  function fromKeys() {
    if (stickTouch) return;
    game.setStick((keys.has("r") ? 64 : 0) - (keys.has("l") ? 64 : 0));
  }
  function steer(e) {
    let dx = e.clientX - stickTouch.x0;
    if (Math.abs(dx) > RANGE) { stickTouch.x0 = e.clientX - Math.sign(dx) * RANGE; dx = Math.sign(dx) * RANGE; } // (the middle follows the finger)
    const x = Math.abs(dx) <= DEAD ? 0 : Math.round((dx / RANGE) * 64 / STEP) * STEP;
    game.setStick(x);
    Object.assign(stickEl.style, { left: stickTouch.x0 + "px", top: stickTouch.y0 + "px" });
    knob.style.transform = `translateX(${dx}px)`;
  }
  // the stick at rest, when no finger's on it: bottom left, across from the A button
  function rest() {
    if (stickTouch) return;
    stickEl.classList.add("rest");
    knob.style.transform = "";
    const r = flapEl.getBoundingClientRect();
    if (!r.width) return;
    Object.assign(stickEl.style, { left: innerWidth - (r.left + r.width / 2) + "px", top: r.top + r.height / 2 + "px" });
  }
  function flap() {
    game.flap();
    flapEl.classList.add("on");
    setTimeout(() => flapEl.classList.remove("on"), 90);
  }

  let view = null, box = null, portrait = false;
  const api = {
    game, scene, assets,
    get views() { return view ? [view] : []; },
    get shake() { return 0; },
    label: null,

    // landscape: the whole window, the game's screen as tall as it in the
    // middle (as wide as it, if the window's narrower), the stick and the A
    // button over it; portrait: the window's width at the top, the stick and
    // the button below it
    layout(W, H, safe, me, cards) {
      portrait = W / H < 1.1;
      const cam = view?.cam || new THREE.PerspectiveCamera(CAMERA.fov, ASPECT, 100, 12800);
      if (portrait) {
        const w = Math.round(W * CROP), h = Math.round(w / ASPECT), top = Math.round(safe.top + 4);
        box = { left: Math.round((W - w) / 2), top, w, h };
        view = { cam, x: 0, y: top, w: W, h, crop: true };
      } else {
        const sw = Math.min(W, H * ASPECT), sh = sw / ASPECT;
        box = { left: Math.round((W - sw) / 2), top: Math.round((H - sh) / 2), w: Math.round(sw), h: Math.round(sh) };
        view = { cam, x: 0, y: 0, w: W, h: H };
      }
      cam.aspect = view.w / view.h;
      // (the game's fov is up and down: a window narrower than its screen gets more up and down instead)
      const k = Math.max(1, ASPECT / cam.aspect);
      cam.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(CAMERA.fov / 2)) * (portrait ? 1 : k)));
      cam.position.set(...CAMERA.eye);
      cam.lookAt(...CAMERA.at);
      cam.updateProjectionMatrix();
      cam.updateMatrixWorld();
      view.base = cam.position.clone();
      const u = box.w / 320;
      pads.classList.toggle("gb-below", portrait);
      pads.style.setProperty("--room", Math.max(150, H - (box.top + box.h)) + "px");
      rest();
      // the cards where the game's badges are
      cards.forEach((c, i) => {
        c.classList.toggle("mini", portrait || u < 2);
        const [x, y] = BADGE[i];
        shell.place(c, { left: Math.max(4, box.left + x * u) + "px", top: box.top + y * u + "px", transform: "none" });
      });
      return portrait;
    },

    reset(round) {
      const m = round.start;
      // (online: the seats nobody was dealt are CPUs, as the server has them)
      const cpus = !round.online ? [0, 1, 2, 3].map((z) => z !== round.me)
        : [0, 1, 2, 3].map((z) => !(round.lineup || []).some((p) => p.seat === z));
      game.reset(round.level, round.seed, { me: round.me, control: round.control, cpus, told: m?.gb, delay: round.delay });
      shell.stopSound();
      keys.clear();
      stickTouch = null;
      rest();
      game.setStick(0);
    },
    idle() {
      game.reset(game.levelName || "normal");
      game.state = "idle";
      shell.stopSound();
    },
    go() { game.start(); shell.music("main"); }, // song 13, from GO
    finish() { shell.music(null, 40); },
    stop() { game.stop(); },
    setControl(z, c) { game.setControl(z, c); },
    get state() { return game.state; },
    get time() { return game.time; },
    step(dt) { game.update(dt); },
    animate() {},
    score(i) { return game.heartsOf(i); },
    setScores(scores) { game.scores = scores.map((x) => (Number.isInteger(x) && x >= 0 ? x : 0)); },
    celebrate() { return game.celebrate(); },
    hud(on) { drawHud(on); },
    remote(t, m) { if (t === "pad" || t === "won") game.told(t, m); },

    pointerdown(e) {
      if (e.clientX < innerWidth / 2) {
        stickTouch = { id: e.pointerId, x0: e.clientX, y0: e.clientY };
        stickEl.classList.remove("rest");
        steer(e);
      } else flap();
    },
    pointermove(e) { if (stickTouch && e.pointerId === stickTouch.id) steer(e); },
    pointerup(e) {
      if (!stickTouch || e.pointerId !== stickTouch.id) return;
      stickTouch = null;
      rest();
      fromKeys();
    },
    keydown(e) {
      if (KEYS[e.code]) { keys.add(KEYS[e.code]); fromKeys(); return true; }
      if (FLAPS.has(e.code)) { if (!e.repeat) flap(); return true; }
      return false;
    },
    keyup(e) {
      if (!KEYS[e.code]) return;
      keys.delete(KEYS[e.code]);
      fromKeys();
    },
    blur() { keys.clear(); stickTouch = null; rest(); game.setStick(0); },
    debug: {
      stick: (x) => game.setStick(x),
      flap: () => game.flap(),
      get world() { return game.world; },
      get box() { return box; },
      // where on the page a point of the game's screen (x, y in its units, z 0) is
      onScreen(x, y) {
        const v = new THREE.Vector3(x, y, 0).project(view.cam);
        return [view.x + ((v.x + 1) / 2) * view.w, view.y + ((1 - v.y) / 2) * view.h];
      },
    },
  };

  // ---- the HUD, each frame ----
  function drawHud(on) {
    hud.classList.toggle("off", !on);
    const playing = game.state === "play" || game.state === "ready";
    const was = pads.hidden;
    pads.hidden = !playing || !coarse?.matches;
    if (was && !pads.hidden) rest();
    hint.hidden = !(game.state === "ready" || (game.state === "play" && game.lastFrame < SHOW_HINT));
    hint.textContent = coarse?.matches ? "Slide on the left to fly ← → · tap the right to flap" : "← → to fly · Space to flap";
  }

  api.idle();
  return api;
}
