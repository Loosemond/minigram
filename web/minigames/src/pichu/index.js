// Pichu's Power Plant in the minigames shell (main.js): the power plant and
// its camera, the controls (a D-pad held to a direction, and the A and B
// buttons), its HUD (each player's charge gauge) and its online messages
// ("press", "won"). The rules are in rules.js, the game in game.js.
import * as THREE from "three";
import { loadAssets } from "./assets.js";
import { Game } from "./game.js";
import * as R from "./rules.js";

export const SOUNDS = {
  url: "assets/pichu/sound.bin",
  standIns: {
    pop: (tone) => tone(988, 0, 0.08, { type: "triangle", vol: 0.08 }),
    turn0: (tone) => tone(523, 0, 0.05, { vol: 0.05 }),
    turn1: (tone) => tone(587, 0, 0.05, { vol: 0.05 }),
    turn2: (tone) => tone(659, 0, 0.05, { vol: 0.05 }),
    turn3: (tone) => tone(698, 0, 0.05, { vol: 0.05 }),
    shock: (tone, noise) => noise(0, 0.25, { vol: 0.2, filter: "highpass", freq: 2000 }),
    zapA: (tone, noise) => noise(0, 0.5, { vol: 0.25, filter: "bandpass", freq: 3000 }),
    zapB: (tone, noise) => noise(0, 0.5, { vol: 0.25, filter: "bandpass", freq: 2500 }),
    jingle0: (tone) => [784, 988].forEach((f, i) => tone(f, i * 0.1, 0.15, { vol: 0.08 })),
    jingle2: (tone) => tone(1175, 0, 0.15, { vol: 0.08 }),
    jingle3: (tone) => tone(1319, 0, 0.15, { vol: 0.08 }),
    jingle4: (tone) => tone(1568, 0, 0.3, { vol: 0.08 }),
    cry: (tone) => tone(1400, 0, 0.25, { type: "triangle", vol: 0.1, to: 1800 }),
  },
};

// the game's screen: 320 x 240, the camera's fov 30 up and down (0x80038070)
const ASPECT = 4 / 3, FOV = 30;
// the gauges (0x86606E6C: frame bank 410, fill bank 409) on the bars over
// the rooms, and the badges (0x86606E4C) at the rooms' outer top corners, on
// the 320 x 240 screen
const GAUGE = [[40, 19], [210, 19], [40, 123], [210, 123]];
const BADGE = [[41, 39], [280, 39], [41, 143], [280, 143]]; // (2P's and 4P's: their right edges)
const PER = 60 / R.FULL, WON = 61; // a gauge's fill: px a charge (0x8660673C), and a winner's
// portrait: the screen this much wider than the window, so the rooms fill it
// (the hazard stripes at the sides are cut off)
const CROP = 1.12;

export async function create(shell, onProgress) {
  const assets = await loadAssets("assets/pichu/", onProgress);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x101014);
  // the game's lights: an ambient 0x646464 and two that follow the camera (0x866026B8, 0x86602720)
  scene.add(new THREE.AmbientLight(0xffffff, 0.62 * Math.PI));
  const sun = new THREE.DirectionalLight(0xffffff, 0.45 * Math.PI);
  sun.position.set(0.3, 0.8, 1.4);
  const fill = new THREE.DirectionalLight(0x808080, 0.3 * Math.PI);
  fill.position.set(-0.6, -0.4, 1);
  scene.add(sun, fill);
  const game = new Game(scene, assets);

  // ---- its HUD ----
  const A = "assets/pichu/";
  const hud = document.createElement("div");
  hud.className = "game-hud pp";
  hud.innerHTML = `
    <div class="pp-screen">${GAUGE.map(([x, y]) => `
      <div class="pp-gauge" style="left: calc(${x} * var(--u)); top: calc(${y} * var(--u))" hidden>
        <img class="pp-frame" src="${A}gauge.png" alt=""><i class="pp-fill"></i><i class="pp-glow"></i></div>`).join("")}
    </div>
    <div class="pp-pads" hidden>
      <div class="pp-dpad" data-pad="dpad"><i class="pp-up"></i><i class="pp-down"></i><i class="pp-left"></i><i class="pp-right"></i><b></b></div>
      <div class="pp-buttons">
        <div class="pp-btn pp-b" data-pad="b"><img src="${A}button_b.png" alt="B"></div>
        <div class="pp-btn pp-a" data-pad="a"><img src="${A}button_a.png" alt="A"></div>
      </div>
    </div>`;
  shell.hud.append(hud);
  const screen = hud.querySelector(".pp-screen"), padsEl = hud.querySelector(".pp-pads");
  const gauges = [...hud.querySelectorAll(".pp-gauge")].map((g) => ({ el: g, fill: g.querySelector(".pp-fill"), glow: g.querySelector(".pp-glow") }));
  const dpad = hud.querySelector(".pp-dpad");
  const buttons = { [R.A]: hud.querySelector(".pp-a"), [R.B]: hud.querySelector(".pp-b") };

  // ---- sounds and the like, from the game ----
  const mine = (z) => z === shell.me();
  let humming = false;
  const hum = (on) => {
    if (on === humming) return;
    humming = on;
    if (on) shell.sound("hum", shell.me()); else shell.stopSound("hum"); // (0x200B: asked for every frame it charges)
  };
  game.on("send", (m) => shell.send("press", m));
  game.on("pop", () => shell.sound("pop")); // (0x2F03)
  game.on("turn", (z) => shell.sound("turn" + z, z)); // (0x2F04 + the player)
  game.on("hit", (z) => { if (mine(z)) shell.haptic("light"); });
  game.on("shock", (z) => {
    shell.sound("shock", z); // (0x2F08)
    if (mine(z)) { shell.haptic("medium"); shell.flash(z, "hurt"); }
  });
  game.on("full", () => hum(false));
  game.on("zap", (winners) => winners.forEach((w, z) => { if (!w) shell.sound(z === 0 || z === 3 ? "zapA" : "zapB", z); })); // (0x2F09, 0x2F0A)
  game.on("jingle", (k) => { if (k === 0) shell.sound("jingle1"); shell.sound("jingle" + (k ? k + 1 : 0)); }); // (0x2F0C-0x2F10)
  game.on("cheer", (winners) => winners.forEach((w, z) => { if (w) shell.sound("cry", z); })); // (0x2F11, a Pichu's)

  // ---- the controls: the D-pad (held), A and B (pressed) ----
  let held = 0; // the direction held: 1 up, 2 down, 3 right, 4 left (the rules'), 0 none
  let dpadPointer = null;
  const keys = []; // the arrow keys held, the last one wins
  const KEYS = { ArrowUp: 1, KeyW: 1, ArrowDown: 2, KeyS: 2, ArrowRight: 3, KeyD: 3, ArrowLeft: 4, KeyA: 4 };
  const BUTTONS = { KeyX: R.A, KeyK: R.A, Space: R.A, KeyZ: R.B, KeyJ: R.B };
  const NAMES = { 1: "up", 2: "down", 3: "right", 4: "left" };
  function setHeld(d) {
    held = d;
    dpad.dataset.dir = NAMES[d] || "";
  }
  function fromKeys() { setHeld(dpadPointer === null ? keys[keys.length - 1] || 0 : held); }
  function aimDpad(e) {
    const r = dpad.getBoundingClientRect(), x = e.clientX - (r.left + r.width / 2), y = e.clientY - (r.top + r.height / 2);
    if (Math.hypot(x, y) < r.width * 0.12) return setHeld(0); // (the middle: none)
    setHeld(Math.abs(x) > Math.abs(y) ? (x > 0 ? 3 : 4) : y > 0 ? 2 : 1);
  }
  function press(btn) {
    game.press(held, btn);
    const b = buttons[btn];
    b.classList.add("on");
    setTimeout(() => b.classList.remove("on"), 90);
  }

  let view = null, portrait = false, box = null;
  const api = {
    game, scene, assets,
    get views() { return view ? [view] : []; },
    get shake() { return 0; },
    label: null,

    // landscape: the game's screen as big as fits, in the middle (a wider
    // window shows more round it), the pads at the sides over it; portrait:
    // the screen a little wider than the window at the top, the pads below
    layout(W, H, safe, me, cards) {
      portrait = W / H < 1.1;
      const cam = view?.cam || new THREE.PerspectiveCamera(FOV, ASPECT, 100, 12800);
      if (portrait) {
        const w = W * CROP, h = Math.round(w / ASPECT), top = Math.round(safe.top + 4);
        view = { cam, x: 0, y: top, w: W, h, crop: true };
        box = { left: (W - w) / 2, top, w, h };
      } else {
        const sw = Math.min(W, H * ASPECT), sh = sw / ASPECT;
        view = { cam, x: 0, y: 0, w: W, h: H };
        box = { left: (W - sw) / 2, top: (H - sh) / 2, w: sw, h: sh };
      }
      aim();
      const u = box.w / 320;
      Object.assign(screen.style, { left: box.left + "px", top: box.top + "px", width: box.w + "px", height: box.h + "px" });
      screen.style.setProperty("--u", u + "px");
      padsEl.classList.toggle("pp-below", portrait);
      if (portrait) padsEl.style.setProperty("--room", Math.max(160, H - (box.top + box.h) - safe.top) + "px");
      // the cards where the game's badges are
      cards.forEach((c, i) => {
        c.classList.toggle("mini", portrait || u < 2);
        const [x, y] = BADGE[i];
        shell.place(c, { left: box.left + x * u + "px", top: box.top + y * u + "px", transform: i % 2 ? "translateX(-100%)" : "none" });
      });
      return portrait;
    },

    reset(round) {
      const m = round.start;
      // (online: the seats nobody was dealt are CPUs, as the server has them)
      const cpus = !round.online ? [0, 1, 2, 3].map((z) => z !== round.me)
        : [0, 1, 2, 3].map((z) => !(round.lineup || []).some((p) => p.seat === z));
      game.reset(round.level, round.seed, { me: round.me, control: round.control, cpus, told: m?.pp });
      shell.stopSound();
      humming = false;
      setHeld(0);
      keys.length = 0;
      dpadPointer = null;
    },
    idle() {
      game.reset(game.levelName || "normal");
      game.state = "idle";
      shell.stopSound();
      humming = false;
    },
    go() { game.start(); shell.music("main"); }, // song 21, from GO
    finish() { hum(false); shell.music(null, 40); },
    stop() { game.stop(); hum(false); },
    setControl(z, c) { game.setControl(z, c); },
    get state() { return game.state; },
    get time() { return game.time; },
    step(dt) { game.update(dt); },
    animate() {},
    score(i) { return game.charge(i); },
    setScores(scores) { game.scores = scores.map((x) => x | 0); },
    celebrate() { return game.celebrate(); },
    hud(on) { drawHud(on); },
    remote(t, m) { if (t === "press" || t === "won") game.told(t, m); },

    // the D-pad held (and slid), A and B tapped: as many fingers as it takes
    pointerdown(e) {
      const pad = e.target.closest?.("[data-pad]")?.dataset.pad;
      if (pad === "dpad") { dpadPointer = e.pointerId; aimDpad(e); }
      else if (pad === "a") press(R.A);
      else if (pad === "b") press(R.B);
    },
    pointermove(e) { if (e.pointerId === dpadPointer) aimDpad(e); },
    pointerup(e) { if (e.pointerId === dpadPointer) { dpadPointer = null; fromKeys(); } },
    keydown(e) {
      if (KEYS[e.code]) {
        if (!keys.includes(KEYS[e.code])) keys.push(KEYS[e.code]);
        fromKeys();
        return true;
      }
      if (BUTTONS[e.code]) { if (!e.repeat) press(BUTTONS[e.code]); return true; }
      return false;
    },
    keyup(e) {
      if (!KEYS[e.code]) return;
      const k = keys.indexOf(KEYS[e.code]);
      if (k >= 0) keys.splice(k, 1);
      fromKeys();
    },
    blur() { keys.length = 0; dpadPointer = null; setHeld(0); },
    debug: { press: (dir, btn) => game.press(dir, btn === "b" ? R.B : R.A) },
  };

  // ---- the HUD, each frame ----
  function drawHud(on) {
    hud.classList.toggle("off", !on);
    aim();
    const playing = game.state === "play" || game.state === "over";
    const t = Math.max(0, game.lastFrame);
    for (let z = 0; z < 4; z++) {
      const g = gauges[z];
      g.el.hidden = !playing && !(game.state === "ready" && game.glide >= 1);
      if (g.el.hidden) continue;
      const w = game.won(z) ? WON : Math.min(R.FULL, game.charge(z)) * PER;
      g.fill.style.width = `calc(${w} * var(--u))`;
      g.glow.style.width = g.fill.style.width;
      // the fill's pulse: a grey over it, alpha |10 - n| x 20, n 0-20 over and over in the play
      g.glow.style.opacity = game.state === "play" || game.won(z) ? String((Math.abs(10 - (t % 21)) * 20) / 255) : "0";
    }
    padsEl.hidden = game.state !== "play" && game.state !== "ready";
    hum(on && game.charging(shell.me()) && !shell.catchingUp());
  }

  // The camera: the game's view (or the opening glide to it), its 4:3 screen
  // as big as fits; a wider window shows more at the sides, a narrower one more
  // above and below (in portrait, its sides cut off instead)
  function aim() {
    if (!view) return;
    const cam = view.cam, aspect = view.w / view.h, { eye, at } = game.camera();
    cam.aspect = aspect;
    cam.fov = aspect >= ASPECT || view.crop ? FOV : THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(FOV / 2)) * ASPECT / aspect));
    view.base = new THREE.Vector3(...eye);
    cam.position.copy(view.base);
    cam.lookAt(...at);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
  }

  api.idle();
  return api;
}
