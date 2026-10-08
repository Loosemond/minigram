// Delibird's Delivery in the minigames shell (main.js): the stage and its
// camera, the controls (on a phone: a finger anywhere is a stick, the way and
// how far it slides from where it went down; or the keys), its HUD (each
// player's gifts through its door on its card, as the game's, the clock, the
// combo as it scores, and the points counting up at the end) and its online
// messages ("pad", "won"). The rules are in rules.js, the game in game.js.
import * as THREE from "three";
import { loadAssets } from "./assets.js";
import { Game, CAMERA, COLOURS } from "./game.js";
import * as R from "./rules.js";
import { meMark } from "../mark.js";

export const SOUNDS = {
  url: "assets/delibird/sound.bin",
  standIns: {
    in: (tone) => [660, 990].forEach((f, i) => tone(f, i * 0.06, 0.09, { type: "triangle", vol: 0.07 })),
    inBig: (tone) => [520, 780].forEach((f, i) => tone(f, i * 0.08, 0.12, { type: "triangle", vol: 0.08 })),
    combo1: (tone) => [660, 880, 1100].forEach((f, i) => tone(f, i * 0.05, 0.08, { type: "square", vol: 0.05 })),
    spun: (tone) => tone(500, 0, 0.25, { type: "triangle", vol: 0.06, to: 250 }),
    knocked: (tone) => tone(200, 0, 0.2, { type: "square", vol: 0.07, to: 90 }),
    spill: (tone, noise) => { tone(220, 0, 0.25, { type: "square", vol: 0.07, to: 80 }); noise(0, 0.2, { vol: 0.06, freq: 1200 }); },
    sack1: (tone) => tone(700, 0, 0.08, { type: "triangle", vol: 0.06, to: 500 }),
    hand: (tone) => tone(400, 0, 0.08, { type: "triangle", vol: 0.05, to: 600 }),
    step: (tone) => tone(120, 0, 0.04, { type: "square", vol: 0.03 }),
    tick: (tone) => tone(1400, 0, 0.02, { type: "square", vol: 0.02 }),
    counted: (tone) => tone(1100, 0, 0.12, { type: "triangle", vol: 0.06 }),
    ring: (tone) => [1320, 1760].forEach((f, i) => tone(f, i * 0.05, 0.1, { type: "triangle", vol: 0.05 })),
  },
};

const SHOW_HINT = 3 * R.FPS; // frames of the play the hint stays for
const DEAD = 8; // px a finger moves before it pushes
const FULL = 56; // and how far for a full push
// what the view must show: the field and both belts, the doors' feet, the Delibird and the tallest gifts
const FIT = [];
for (const x of [-195, 195]) {
  FIT.push([x, 0, 210], [x, 0, -200], [x, 70, 135]);
  FIT.push([x * 0.8, 40, -256]);
}
// the combo's colours (0x86A095A0: the flash by how many in a row; x2-x5 light and dark)
const FLASH = ["#508cc8", "#64aa00", "#dc50a0", "#f0aa00"];
const POP = [0.58, 0.626666, 0.673333, 0.72, 0.696666, 0.673333, 0.65, 0.626666, 0.603333]; // (its pulse: 0x86A0F344)
const GROW = [0.283333, 0.566666, 0.85]; // (and the x2's: 0x86A0F390)
// the arrow over your Delibird: from the middle of the game's label (18 tall,
// small on a phone), over it and over the FULL that shows above it when the
// sack's full (to 26.5 over the label's middle); riding with the label as it
// hops, and gone with it in the end's show
const OVER_LABEL = 30;

export async function create(shell, onProgress) {
  const assets = await loadAssets("assets/delibird/", onProgress);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xffffff); // (the game's clear colour: 0xFFFF)
  // the scene's lights (its layout, 0x86A0F184: white and grey, at angles from the camera's; 0x646464 all round)
  scene.add(new THREE.AmbientLight(0xffffff, 0.55 * Math.PI));
  const sun = new THREE.DirectionalLight(0xffffff, 0.6 * Math.PI);
  sun.position.set(-0.4, 1, 0.7);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xffffff, 0.25 * Math.PI);
  fill.position.set(0.6, 0.5, -0.4);
  scene.add(fill);
  const game = new Game(scene, assets);

  // ---- its HUD: the clock (0x86A095A0), the combos, the tally at the end, the hint, the stick ----
  const hud = document.createElement("div");
  hud.className = "game-hud dd";
  const A = "assets/delibird/", UI = "assets/ui/";
  hud.innerHTML = `
    <div class="dd-time"><small>TIME</small><b>60</b></div>
    ${[0, 1, 2, 3].map((z) => `<div class="dd-combo" data-z="${z}" hidden><i></i><img alt=""></div>`).join("")}
    <div class="dd-tally" hidden>${[0, 1, 2, 3].map((z) => `<div class="dd-row" data-z="${z}"><img class="dd-badge" alt="">
      <span class="dd-num"></span><img class="dd-pts" src="${A}points.png" alt="Points"></div>`).join("")}</div>
    <div class="dd-hint" hidden></div>
    <div class="dd-pads" hidden><div class="dd-stick rest"><i class="dd-knob"></i></div></div>`;
  shell.hud.append(hud);
  const timeEl = hud.querySelector(".dd-time"), timeNum = timeEl.querySelector("b");
  const combos = [...hud.querySelectorAll(".dd-combo")], tallyEl = hud.querySelector(".dd-tally");
  const rows = [...hud.querySelectorAll(".dd-row")], hint = hud.querySelector(".dd-hint"), pads = hud.querySelector(".dd-pads");
  const stickEl = hud.querySelector(".dd-stick"), knob = hud.querySelector(".dd-knob");
  const mark = meMark(hud, shell.me), over = new THREE.Vector3();

  // ---- sounds and the like, from the game ----
  const mine = (z) => z === shell.me();
  game.on("send", (m) => shell.send("pad", m));
  game.on("tempo", (n) => shell.tempo(n)); // (the last 30 s: the tune speeds up)
  game.on("sound", (name) => shell.sound(name));
  game.on("loop", (name, on) => (on ? shell.sound(name) : shell.stopSound(name)));
  game.on("step", (z, pan) => shell.sound("step", { pan })); // (0x8F0C)
  game.on("sack", (z, n, pan) => { shell.sound("sack" + Math.max(1, Math.min(5, n)), { pan }); if (mine(z)) shell.haptic("light"); }); // (0x8F05-0x8F09)
  game.on("hand", (z, pan) => shell.sound("hand", { pan })); // (0x8F0B)
  game.on("in", (z, kind) => { // (0x8F00, 0x8F04 for a piano or a Snorlax: its player's)
    shell.sound(kind === 1 || kind === 2 ? "inBig" : "in", z);
    shell.flash(z, "bump");
    if (mine(z)) shell.haptic("medium");
  });
  game.on("combo", (z, n) => { // (0x8F16-0x8F19)
    shell.sound("combo" + n, z);
    shell.flash(z, "bump");
    if (mine(z)) shell.haptic("success");
  });
  game.on("knocked", (z, n, pan) => { // (0x8F02; 0x8F03 if it had gifts)
    shell.sound(n ? "spill" : "knocked", { pan });
    shell.flash(z, "hurt");
    if (mine(z)) shell.haptic("heavy");
  });
  game.on("spun", (z, pan) => { shell.sound("spun", { pan }); if (mine(z)) shell.haptic("medium"); }); // (0x8F01)
  game.on("counted", () => shell.sound("counted")); // (0x8F13)

  // ---- the controls ----
  // a finger anywhere is a stick: the way it slides from where it went down,
  // and how far (to FULL px). The keys: ← ↑ → ↓ (or W A S D), as the game
  // takes the D-pad (0x86A0BD34): 64 one way, 45 each way on a diagonal
  const coarse = window.matchMedia?.("(pointer: coarse)");
  let steer = null; // { id, x, y: where the finger went down }
  const keys = new Set();
  const KEYS = { ArrowUp: "u", KeyW: "u", ArrowDown: "d", KeyS: "d", ArrowLeft: "l", KeyA: "l", ArrowRight: "r", KeyD: "r" };
  function fromKeys() {
    if (steer) return;
    let x = 0, y = 0;
    if (keys.has("r")) { x = 64; y = 0; }
    if (keys.has("l")) { x = -64; y = 0; }
    if (keys.has("u")) { x = 0; y = 64; }
    if (keys.has("d")) { x = 0; y = -64; }
    if (keys.has("r") && keys.has("u")) { x = 45; y = 45; }
    if (keys.has("r") && keys.has("d")) { x = 45; y = -45; }
    if (keys.has("l") && keys.has("u")) { x = -45; y = 45; }
    if (keys.has("l") && keys.has("d")) { x = -45; y = -45; }
    game.setStick(x, y);
  }
  function aim(e) {
    const dx = e.clientX - steer.x, dy = e.clientY - steer.y, d = Math.hypot(dx, dy);
    const k = d < DEAD ? 0 : Math.min(1, (d - DEAD) / (FULL - DEAD)) * 64 / (d || 1);
    game.setStick(dx * k, -dy * k);
    const s = Math.min(1, d / FULL);
    knob.style.transform = `translate(${(dx / (d || 1)) * s * 30}px, ${(dy / (d || 1)) * s * 30}px)`;
  }
  function restStick() {
    stickEl.classList.add("rest");
    knob.style.transform = "";
    shell.place(stickEl, rest);
  }
  let rest = {};

  let view = null, portrait = false;
  const api = {
    game, scene, assets,
    get views() { return view ? [view] : []; },
    get shake() { return 0; },
    label: A + "gift.png", // (by each one's count: the gifts through its door)

    // the stage, seen from the game's camera, with the field of view that
    // shows the field and both belts (at least the game's 24.7 degrees), over
    // the whole window: in portrait the picture's moved up under the cards,
    // the stick below it. The cards in a row along the top, as the game's
    // badges (0x86A0F304), the clock between them
    layout(W, H, safe, me, cards) {
      portrait = W / H < 1.1;
      const cam = view?.cam || new THREE.PerspectiveCamera(CAMERA.fov, 1, 10, 5000);
      view = { cam, x: 0, y: 0, w: W, h: H };
      cam.aspect = W / H;
      cam.clearViewOffset();
      game.camera(cam);
      cam.updateMatrixWorld();
      cam.fov = fitFov(cam);
      cam.updateProjectionMatrix();
      let box = screenBox(cam, view, FIT);
      const top = safe.top + (portrait ? 108 : 6);
      if (portrait) {
        const dy = Math.round(box.y - top);
        if (dy > 0) {
          cam.setViewOffset(W, H, 0, dy, W, H);
          cam.updateProjectionMatrix();
          box = screenBox(cam, view, FIT);
        }
      }
      view.base = cam.position.clone();
      const span = Math.min(safe.right - safe.left - 12, portrait ? 9999 : 760), x0 = (safe.left + safe.right - span) / 2;
      cards.forEach((c, z) => {
        c.classList.toggle("mini", portrait);
        if (portrait) shell.place(c, { left: x0 + (span * (z + 0.5)) / 4 + "px", top: safe.top + 6 + "px", transform: "translateX(-50%)" });
        else {
          const k = z < 2 ? z : z + 1; // (the clock in the middle)
          shell.place(c, { left: x0 + (span * (k + 0.5)) / 5 + "px", top: safe.top + 6 + "px", transform: "translateX(-50%)" });
        }
      });
      shell.place(timeEl, portrait ? { left: W / 2 + "px", top: safe.top + 56 + "px", transform: "translateX(-50%)" }
        : { left: W / 2 + "px", top: safe.top + 6 + "px", transform: "translateX(-50%)" });
      api.cards = cards;
      // the tally: in the middle of the field
      const mid = box.y + box.h * 0.42;
      shell.place(tallyEl, { left: W / 2 + "px", top: mid + "px", transform: "translate(-50%, -50%)" });
      const below = box.y + box.h;
      shell.place(hint, portrait ? { left: W / 2 + "px", top: Math.min(safe.bottom - 60, below + 8) + "px", transform: "translateX(-50%)" }
        : { left: "50%", bottom: "calc(var(--safe-b) + 14%)", transform: "translateX(-50%)" });
      const room = Math.max(150, safe.bottom - below - 30);
      pads.style.setProperty("--room", room + "px");
      rest = portrait ? { left: W / 2 + "px", top: safe.bottom - Math.min(room, 260) / 2 + "px" } : { left: "14%", bottom: "22%" };
      if (!steer) restStick();
      return portrait;
    },

    reset(round) {
      const m = round.start;
      // (online: the seats nobody was dealt are CPUs, as the server has them)
      const cpus = !round.online ? [0, 1, 2, 3].map((z) => z !== round.me)
        : [0, 1, 2, 3].map((z) => !(round.lineup || []).some((p) => p.seat === z));
      game.reset(round.level, round.seed, { me: round.me, control: round.control, cpus, told: m?.dd, delay: round.delay });
      shell.stopSound();
      keys.clear();
      steer = null;
      restStick();
      for (let z = 0; z < 4; z++) {
        rows[z].querySelector(".dd-badge").src = `${UI}badge_${cpus[z] ? ["com_blue", "com_green", "com_red", "com_yellow"][z] : `${z + 1}p`}.png`;
      }
    },
    idle() {
      game.reset(game.levelName || "normal");
      game.state = "idle";
      shell.stopSound();
    },
    go() { game.start(); shell.music("main"); }, // (song 52, at GO: 0x86A0167C)
    finish() { shell.music(null, 40); },
    stop() { game.stop(); },
    setControl(z, c) { game.setControl(z, c); },
    get state() { return game.state; },
    get time() { return game.time; },
    step(dt) { game.update(dt); if (view) game.camera(view.cam); },
    animate() {},
    // the cards: the gifts each one's got through its door (the game shows those, and the points only at the end)
    score(i) { return game.delivered()[i]; },
    setScores(scores) { game.scores = scores.map((x) => (Number.isInteger(x) && x >= 0 ? x : 0)); },
    celebrate() { return game.celebrate(); },
    hud(on) { drawHud(on); },
    remote(t, m) { if (t === "pad" || t === "won") game.told(t, m); },

    pointerdown(e) {
      if (steer) return; // (one finger steers)
      if (!(coarse?.matches || e.pointerType === "touch")) return; // (a mouse: the keys steer)
      steer = { id: e.pointerId, x: e.clientX, y: e.clientY };
      stickEl.classList.remove("rest");
      shell.place(stickEl, { left: e.clientX + "px", top: e.clientY + "px" });
      game.setStick(0, 0);
    },
    pointermove(e) { if (steer && e.pointerId === steer.id) aim(e); },
    pointerup(e) {
      if (!steer || e.pointerId !== steer.id) return;
      steer = null;
      game.setStick(0, 0);
      restStick();
      fromKeys();
    },
    keydown(e) {
      if (KEYS[e.code]) { keys.add(KEYS[e.code]); fromKeys(); return true; }
      return false;
    },
    keyup(e) {
      if (!KEYS[e.code]) return;
      keys.delete(KEYS[e.code]);
      fromKeys();
    },
    blur() { keys.clear(); steer = null; game.setStick(0, 0); restStick(); },
    debug: {
      stick: (x, y) => game.setStick(x, y),
      get world() { return game.world; },
      // where on the page a point of the scene (in its units) is
      onScreen(x, y, z) {
        const v = new THREE.Vector3(x, y, z).project(view.cam);
        return [view.x + ((v.x + 1) / 2) * view.w, view.y + ((1 - v.y) / 2) * view.h];
      },
    },
  };

  // ---- the HUD, each frame ----
  const shownTally = [-1, -1, -1, -1];
  function drawHud(on) {
    hud.classList.toggle("off", !on);
    const playing = game.state === "play" || game.state === "ready";
    pads.hidden = !playing || !coarse?.matches;
    const ended = game.endAt !== null;
    timeEl.hidden = !(playing || game.state === "over") || ended;
    // the clock: seconds left, rounded up (0x86A095A0: 60 at GO)
    const s = game.state === "ready" ? R.TIME / R.FPS : game.secondsLeft();
    if (timeNum.textContent !== String(s)) timeNum.textContent = s;
    timeEl.classList.toggle("low", game.state === "play" && s <= 10);
    hint.hidden = !(game.state === "ready" || (game.state === "play" && game.lastFrame < SHOW_HINT));
    hint.textContent = coarse?.matches ? "Slide a finger to walk · take gifts up to your door" : "Arrows to walk · take gifts up to your door";
    // a combo, by its player's card: the flash in its colour, x2-x5 growing (for a second: 0x86A095A0)
    combos.forEach((el, z) => {
      const c = game.combos[z], f = c ? (game.time - c.at) * R.FPS : 99;
      el.hidden = !(c && f < 30) || !api.cards;
      if (el.hidden) return;
      const card = api.cards[z].getBoundingClientRect();
      shell.place(el, { left: card.left + card.width / 2 + "px", top: card.bottom + 2 + "px", transform: "translateX(-50%)" });
      el.querySelector("i").style.background = FLASH[c.n - 1];
      el.querySelector("i").style.transform = `scale(${POP[Math.max(0, Math.floor(f) - 2) % 9] / 0.72})`;
      const img = el.querySelector("img");
      const src = `${A}x${c.n + 1}.png`;
      if (!img.src.endsWith(src)) img.src = src;
      img.style.transform = `scale(${GROW[Math.min(2, Math.floor(f))] / 0.85})`;
    });
    // the tally at the end: each one's points counting up, the winners' rows going round the colours
    tallyEl.hidden = !ended;
    if (ended) {
      const t = game.tally(), wins = game.winners || [];
      rows.forEach((r, z) => {
        const n = game.result && t.counted ? game.result.s[z] : t.shown[z];
        if (n !== shownTally[z]) {
          r.querySelector(".dd-num").innerHTML = String(n).split("").map((d) => `<img src="${UI}big${d}.png" alt="${d}">`).join("");
          shownTally[z] = n;
        }
        r.classList.toggle("won", t.counted && !!wins[z]);
        r.style.setProperty("--c", "#" + COLOURS[z].toString(16).padStart(6, "0"));
      });
    } else shownTally.fill(-1);
    // which Delibird is yours (the four look the same)
    const label = game.birds[shell.me()].label;
    over.copy(label.position).y += OVER_LABEL;
    mark.place((game.state === "play" || game.state === "over") && label.visible && view, over);
  }

  // the field of view (degrees) that shows the FIT points from the camera
  function fitFov(cam) {
    let most = Math.tan((CAMERA.fov * Math.PI) / 360);
    const inv = cam.matrixWorldInverse, v = new THREE.Vector3();
    for (const p of FIT) {
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
