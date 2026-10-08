// Barrier Ball in the minigames shell (main.js): the court and its camera,
// turned so this device's player's corner is at the bottom; the controls (on
// a phone: slide a finger anywhere to slide Mr. Mime, the A button to smash;
// with a mouse, Mr. Mime follows it and a click smashes; or the keys); its
// HUD (the clock, the hint and the A button) and its online messages ("pad",
// "won"). The rules are in rules.js, the game in game.js.
import * as THREE from "three";
import { loadAssets } from "./assets.js";
import { Game, CAMERA } from "./game.js";
import { SEATS } from "./rules.js";
import { meMark } from "../mark.js";

export const SOUNDS = {
  url: "assets/barrier/sound.bin",
  standIns: {
    smash: (tone, noise) => noise(0, 0.15, { vol: 0.12, filter: "highpass", freq: 1500 }),
    swish: (tone, noise) => noise(0, 0.08, { vol: 0.05, filter: "bandpass", freq: 1200 }),
    spawn: (tone) => tone(330, 0, 0.25, { type: "triangle", vol: 0.07, to: 660 }),
    serve: (tone) => tone(520, 0, 0.12, { type: "square", vol: 0.05 }),
    wall: (tone) => tone(240, 0, 0.06, { type: "square", vol: 0.06 }),
    hit: (tone) => tone(660, 0, 0.07, { type: "square", vol: 0.07 }),
    hit1: (tone) => tone(700, 0, 0.08, { type: "square", vol: 0.07 }),
    hit2: (tone) => tone(760, 0, 0.09, { type: "square", vol: 0.07 }),
    hit3: (tone) => tone(840, 0, 0.1, { type: "square", vol: 0.07 }),
    hitSmash: (tone) => tone(440, 0, 0.12, { type: "sawtooth", vol: 0.08 }),
    zing: (tone) => tone(1200, 0, 0.2, { type: "triangle", vol: 0.05, to: 2000 }),
    goal: (tone) => [880, 660, 440].forEach((f, i) => tone(f, i * 0.07, 0.1, { type: "triangle", vol: 0.08 })),
    goal2: (tone, noise) => noise(0, 0.3, { vol: 0.06, filter: "lowpass", freq: 900 }),
    lastCount: (tone) => tone(660, 0, 0.12, { vol: 0.12 }),
  },
};

// the court's half-width this device's screen shows across (or up, whichever
// is less): its corners are 354 from the middle
const VIEW_R = 378;
// portrait: the court as wide as the window at the top, this much taller
const TALL = 1.04;
const SHOW_HINT = 90; // frames of the play the hint stays for, after the countdown
// a finger slides Mr. Mime half as far as it goes (its whole lane is only
// about 70 px across a phone: this makes it 140)
const GAIN = 0.5;
// the arrow at your Mr. Mime: from behind it (this far, towards its goal),
// pointing up at it; over it is its barrier, where the balls come
const BEHIND = 35;

export async function create(shell, onProgress) {
  const assets = await loadAssets("assets/barrier/", onProgress);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x101018);
  // the game's lights (geo layout 0x86306EA0): a grey ambient (155) and a white one from above
  scene.add(new THREE.AmbientLight(0xffffff, 0.61 * Math.PI));
  const sun = new THREE.DirectionalLight(0xffffff, 0.55 * Math.PI);
  sun.position.set(0.3, -0.4, 1);
  scene.add(sun);
  const game = new Game(scene, assets);

  // ---- its HUD: the clock, the hint, and on a touch screen the A button ----
  const hud = document.createElement("div");
  hud.className = "game-hud bb";
  hud.innerHTML = `
    <div class="bb-time"><small>TIME</small><b>60</b></div>
    <div class="bb-hint" hidden></div>
    <div class="bb-pads" hidden>
      <div class="bb-smash"><img src="assets/barrier/button_a.png" alt="A"></div>
    </div>`;
  shell.hud.append(hud);
  const timeEl = hud.querySelector(".bb-time"), timeNum = timeEl.querySelector("b");
  const hint = hud.querySelector(".bb-hint"), pads = hud.querySelector(".bb-pads"), smashEl = hud.querySelector(".bb-smash");
  const mark = meMark(hud, shell.me, { below: true }), spot = new THREE.Vector3();

  // ---- sounds and the like, from the game ----
  const mine = (z) => z === shell.me();
  game.on("send", (m) => shell.send("pad", m));
  game.on("sound", (name) => shell.sound(name));
  game.on("tempo", (n) => shell.tempo(n)); // (the last 30 s: the tune speeds up)
  for (const name of ["spawn", "serve", "wall", "swish"]) game.on(name, (z, pan) => shell.sound(name, { pan }));
  game.on("smash", (z, pan) => { // (0x6F00)
    shell.sound("smash", { pan });
    if (mine(z)) shell.haptic("light");
  });
  for (const name of ["hit", "hit1", "hit2", "hit3", "hitSmash"]) {
    game.on(name, (z, pan) => { // (0x6F03, 0x6F07-0x6F0A; 0x6F0C with the hardest)
      shell.sound(name, { pan });
      if (name === "hit3" || name === "hitSmash") shell.sound("zing", { pan });
      if (mine(z)) shell.haptic(name === "hitSmash" ? "medium" : "light");
    });
  }
  game.on("goal", (z, pan, scorer) => { // (0x6F05, 0x6F0B)
    shell.sound("goal", { pan });
    shell.sound("goal2", { pan });
    shell.flash(z, "hurt");
    if (scorer >= 0 && scorer !== z) shell.flash(scorer, "bump");
    if (mine(z)) shell.haptic("heavy");
    else if (mine(scorer)) shell.haptic("light");
  });

  // ---- the controls ----
  // a finger anywhere slides Mr. Mime (half as far as it slides: across the
  // screen: its lane runs across); a mouse leads it; ← → (or A D) move it,
  // Space (and more) smashes
  const coarse = window.matchMedia?.("(pointer: coarse)");
  let steer = null; // { id, at: the lane x the finger's at, base: where Mr. Mime's heading }
  const keys = new Set();
  const KEYS = { ArrowLeft: "l", KeyA: "l", ArrowRight: "r", KeyD: "r" };
  const SMASH = new Set(["Space", "ArrowUp", "KeyW", "KeyX", "KeyK", "KeyJ", "KeyZ", "Enter"]);
  // which way along its lane (+x or -x) is right on this device's screen
  const rightIs = () => {
    const s = SEATS[shell.me()], right = [s.n[1], -s.n[0]];
    return right[0] + right[1] * s.slope > 0 ? 1 : -1;
  };
  function fromKeys() {
    if (steer) return;
    const k = (keys.has("r") ? 1 : 0) - (keys.has("l") ? 1 : 0);
    if (k || game.target === null) game.setStick(64 * k * rightIs());
  }
  // the lane x of a point on the screen: across from Mr. Mime, on the court (z = 0)
  const ray = new THREE.Raycaster(), floor = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), hit = new THREE.Vector3();
  function laneX(clientX) {
    if (!view) return null;
    const z = shell.me(), m = game.world.m[z], s = SEATS[z];
    const at = new THREE.Vector3(m.x, m.y, 0).project(view.cam);
    const nx = ((clientX - view.x) / view.w) * 2 - 1;
    ray.setFromCamera(new THREE.Vector2(nx, at.y), view.cam);
    if (!ray.ray.intersectPlane(floor, hit)) return null;
    return (hit.x + s.slope * (hit.y - m.icpt)) / 2;
  }
  function slide(e) {
    const x = laneX(e.clientX);
    if (x === null) return;
    const m = game.world.m[shell.me()];
    let to = steer.base + (x - steer.at) * GAIN;
    // (past the lane's end: the finger's spot moves on, so coming back moves it at once)
    if (to < m.xmin) { steer.base += m.xmin - to; to = m.xmin; }
    if (to > m.xmax) { steer.base -= to - m.xmax; to = m.xmax; }
    game.setTarget(to);
  }
  function smash() {
    game.smash();
    smashEl.classList.add("on");
    setTimeout(() => smashEl.classList.remove("on"), 90);
  }
  const onButton = (e) => {
    const r = smashEl.getBoundingClientRect();
    return !pads.hidden && r.width && Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2)) < r.width * 0.75;
  };

  let view = null, box = null, portrait = false;
  const api = {
    game, scene, assets,
    get views() { return view ? [view] : []; },
    get shake() { return 0; },
    label: null,

    // the court square: in portrait the window's width at the top (the clock
    // and the A button below it), in landscape as tall as the window in the
    // middle (the screen round it shows the walls on); the cards in its
    // corners, each next to its player's goal
    layout(W, H, safe, me, cards) {
      portrait = W / H < 1.1;
      const cam = view?.cam || new THREE.PerspectiveCamera(CAMERA.fov, 1, 100, 12800);
      if (portrait) {
        const h = Math.round(W * TALL), top = Math.round(safe.top + 4);
        view = { cam, x: 0, y: top, w: W, h };
        box = { left: 0, top, w: W, h };
      } else {
        view = { cam, x: 0, y: 0, w: W, h: H };
        const side = Math.min(W, H);
        box = { left: Math.round((W - side) / 2), top: Math.round((H - side) / 2), w: side, h: side };
      }
      cam.aspect = view.w / view.h;
      const across = view.w < view.h ? VIEW_R * (view.h / view.w) : VIEW_R; // (up and down)
      cam.fov = THREE.MathUtils.radToDeg(2 * Math.atan(across / CAMERA.eye[2]));
      const n = SEATS[me].n;
      cam.up.set(n[0], n[1], 0);
      cam.position.set(...CAMERA.eye);
      cam.lookAt(...CAMERA.at);
      cam.updateProjectionMatrix();
      cam.updateMatrixWorld();
      view.base = cam.position.clone();
      // the clock: below the court in portrait; else beside it (the game's is at its right), or at its top
      const room = W - (box.left + box.w);
      if (portrait) shell.place(timeEl, { left: W / 2 + "px", top: view.y + view.h + 10 + "px", transform: "translateX(-50%)" });
      else if (room > 90) shell.place(timeEl, { left: box.left + box.w + room / 2 + "px", top: H / 2 + "px", transform: "translate(-50%, -50%)" });
      else shell.place(timeEl, { right: safe.right ? W - safe.right + 10 + "px" : "10px", top: safe.top + 10 + "px" });
      pads.classList.toggle("bb-below", portrait);
      pads.style.setProperty("--room", Math.max(150, H - (view.y + view.h)) + "px");
      // each player's card in the court's corner just round from its goal (going clockwise)
      const r = [n[1], -n[0]];
      cards.forEach((c, z) => {
        c.classList.toggle("mini", portrait || box.w < 640);
        const d = SEATS[z].n.map((v) => -v); // (where its goal is)
        const dx = Math.round(d[0] * r[0] + d[1] * r[1]), dy = -Math.round(d[0] * n[0] + d[1] * n[1]); // (on the screen: right, down)
        const cx = dx - dy, cy = dy + dx; // (the corner round from it)
        shell.place(c, {
          ...(cx < 0 ? { left: box.left + 6 + "px" } : { right: W - (box.left + box.w) + 6 + "px" }),
          ...(cy < 0 ? { top: box.top + 6 + "px" } : { bottom: H - (box.top + box.h) + 6 + "px" }),
        });
      });
      return portrait;
    },

    reset(round) {
      const m = round.start;
      // (online: the seats nobody was dealt are CPUs, as the server has them)
      const cpus = !round.online ? [0, 1, 2, 3].map((z) => z !== round.me)
        : [0, 1, 2, 3].map((z) => !(round.lineup || []).some((p) => p.seat === z));
      game.reset(round.level, round.seed, { me: round.me, control: round.control, cpus, told: m?.bb, delay: round.delay });
      shell.stopSound();
      keys.clear();
      steer = null;
      game.setStick(0);
    },
    idle() {
      game.reset(game.levelName || "normal");
      game.state = "idle";
      shell.stopSound();
    },
    go() { game.start(); shell.music("main"); }, // song 35, from GO
    finish() { shell.music(null, 40); },
    stop() { game.stop(); },
    setControl(z, c) { game.setControl(z, c); },
    get state() { return game.state; },
    get time() { return game.time; },
    step(dt) { game.update(dt); },
    animate() {},
    score(i) { return game.pointsOf(i); },
    setScores(scores) { game.scores = scores.map((x) => (Number.isInteger(x) && x >= 0 ? x : 0)); },
    celebrate() { return game.celebrate(); },
    hud(on) { drawHud(on); },
    remote(t, m) { if (t === "pad" || t === "won") game.told(t, m); },

    pointerdown(e) {
      if (coarse?.matches || e.pointerType === "touch") {
        if (onButton(e)) { smash(); return; }
        if (steer) return; // (one finger steers)
        const at = laneX(e.clientX);
        if (at === null) return;
        steer = { id: e.pointerId, at, base: game.target ?? game.world.m[shell.me()].x };
        return;
      }
      // a mouse: a click smashes (and it leads Mr. Mime)
      const x = laneX(e.clientX);
      if (x !== null && !keys.size) game.setTarget(x);
      smash();
    },
    pointermove(e) {
      if (steer && e.pointerId === steer.id) { slide(e); return; }
      if (e.pointerType === "mouse" && !keys.size && !coarse?.matches) {
        const x = laneX(e.clientX);
        if (x !== null) game.setTarget(x);
      }
    },
    pointerup(e) {
      if (steer && e.pointerId === steer.id) { steer = null; game.setStick(0); fromKeys(); return; }
      if (e.type === "pointerleave" && e.pointerType === "mouse" && game.target !== null) game.setStick(0); // (gone off the page)
    },
    keydown(e) {
      if (KEYS[e.code]) { keys.add(KEYS[e.code]); fromKeys(); return true; }
      if (SMASH.has(e.code)) { if (!e.repeat) smash(); return true; }
      return false;
    },
    keyup(e) {
      if (!KEYS[e.code]) return;
      keys.delete(KEYS[e.code]);
      fromKeys();
    },
    blur() { keys.clear(); steer = null; game.setStick(0); },
    debug: {
      stick: (x) => game.setStick(x),
      target: (x) => game.setTarget(x),
      smash: () => game.smash(),
      get world() { return game.world; },
      get box() { return box; },
      laneX: (clientX) => laneX(clientX),
      // where on the page a point of the court (x, y, z in its units) is
      onScreen(x, y, z = 0) {
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
    const s = game.secondsLeft();
    if (timeNum.textContent !== String(s)) timeNum.textContent = s;
    timeEl.classList.toggle("low", game.state === "play" && s <= 10);
    hint.hidden = !(game.state === "ready" || (game.state === "play" && game.lastFrame < SHOW_HINT));
    hint.textContent = coarse?.matches ? "Slide a finger to move · A to smash" : "Mouse or ← → to move · click or Space to smash";
    // which Mr. Mime is yours (the four look the same; yours is at the bottom)
    const m = game.mimes[shell.me()].root.position, n = SEATS[shell.me()].n;
    mark.place((game.state === "play" || game.state === "over") && view, spot.set(m.x - n[0] * BEHIND, m.y - n[1] * BEHIND, 0));
  }

  api.idle();
  return api;
}
