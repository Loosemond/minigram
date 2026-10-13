// Delibird's Delivery in the minigames shell (main.js): the stage and its
// camera, the controls (on a phone: a finger anywhere is a stick, the way and
// how far it slides from where it went down; or the keys), its HUD (each
// player's gifts through its door on its card, as the game's, the clock, the
// combo as it scores, and the points counting up at the end, all in the
// game's pictures and colours) and its online messages ("pad", "won"). The
// rules are in rules.js, the game in game.js.
import * as THREE from "three";
import { loadAssets } from "./assets.js";
import { Game, CAMERA, lights } from "./game.js";
import * as R from "./rules.js";
import { meMark } from "../mark.js";
import { tintURL } from "../tint.js";

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
// The HUD (0x86A095A0), its grey pictures as the combiner colours them
// (FC30B261 5566FF7F: env to prim by the texel's grey, the alpha its times
// prim's; FC61FEC3 FFFFF3F9: prim, the I texel's grey its alpha; src/tint.js):
// the clock (bank 404's digits) 0x3C3C3C on 0xDCDCDC at 200 of 255; each card's
// box (376) white on the player's dark colour, the count in white (380, an I
// picture); a combo's x2-x5 (377) light on dark, on its flash (398) its
// colour on white
const CLOCK = [0x3c3c3c, 0xdcdcdc, { times: 0xc8 / 255 }];
const PANEL = [0x000858, 0x0d3817, 0x580808, 0x683800];
const FLASH = [0x508cc8, 0x64aa00, 0xdc50a0, 0xf0aa00];
const COMBO = [[0xdce6ff, 0x283278], [0xe6ffc8, 0x3c7800], [0xffdcf0, 0xc81e50], [0xffffc8, 0xc85a00]];
// the flash's size a frame (0x86A0F344: its first two frames 9 and 10, then round 0-8), and x2-x5's (0x86A0F390)
const POP = [0.58, 0.626666, 0.673333, 0.72, 0.696666, 0.673333, 0.65, 0.626666, 0.603333, 0.193333, 0.386666];
const popAt = (f) => POP[f < 2 ? 9 + f : (f - 2) % 9];
const GROW = [0.283333, 0.566666, 0.85];
// the tally (0x86A07334): the big digits (429) and "Points" (430) dark blue
// on light cyan, a winner's going round six colours on white, a 10th of the
// way a frame (0x86A464C0, W + 0xE5C)
const TALLY = ["#00009b", "#aaf5ff"];
const ROUND = [0xb43c3c, 0xb48c28, 0x28a028, 0x289696, 0x5050c8, 0x963c96];
// the arrow over your Delibird: just over its badge, or over the FULL that
// shows above that when its sack's full; riding with the badge as it hops
const OVER_LABEL = 4;
const hex = (c) => "#" + Math.round(c).toString(16).padStart(6, "0");
const mix = (a, b, k) => [16, 8, 0].reduce((s, sh) => s + (Math.round((((a >> sh) & 255) * (1 - k)) + (((b >> sh) & 255) * k)) << sh), 0);

export async function create(shell, onProgress) {
  const assets = await loadAssets("assets/delibird/", onProgress);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xffffff); // (the game's clear colour: 0xFFFF)
  // the scene's lights, the game's (game.js lights()): x PI, three's lights being physical
  const L = lights();
  scene.add(new THREE.AmbientLight(L.ambient, Math.PI));
  for (const { colour, way } of L.lights) {
    const d = new THREE.DirectionalLight(colour, Math.PI);
    d.position.set(...way);
    scene.add(d);
  }
  const game = new Game(scene, assets);

  // ---- its HUD: the clock (0x86A095A0), the combos, the tally at the end, the hint, the stick ----
  const hud = document.createElement("div");
  hud.className = "game-hud dd";
  const A = "assets/delibird/", UI = "assets/ui/";
  hud.innerHTML = `
    <div class="dd-time" aria-label="Time"></div>
    ${[0, 1, 2, 3].map((z) => `<div class="dd-combo" data-z="${z}" hidden><img class="dd-flash" alt=""><img class="dd-x" alt=""></div>`).join("")}
    <div class="dd-tally" hidden>${[0, 1, 2, 3].map((z) => `<div class="dd-row" data-z="${z}"><img class="dd-badge" alt="">
      <span class="dd-num"></span><span class="dd-d dd-pts" role="img" aria-label="Points"></span></div>`).join("")}</div>
    <div class="dd-hint" hidden></div>
    <div class="dd-pads" hidden><div class="dd-stick rest"><i class="dd-knob"></i></div></div>`;
  shell.hud.append(hud);
  const timeEl = hud.querySelector(".dd-time");
  const combos = [...hud.querySelectorAll(".dd-combo")], tallyEl = hud.querySelector(".dd-tally");
  const rows = [...hud.querySelectorAll(".dd-row")], hint = hud.querySelector(".dd-hint"), pads = hud.querySelector(".dd-pads");
  const stickEl = hud.querySelector(".dd-stick"), knob = hud.querySelector(".dd-knob");
  const mark = meMark(hud, shell.me), over = new THREE.Vector3();
  // the pictures coloured (src/tint.js), as they're made
  const pics = {};
  const coloured = (key, url, prim, env, opts) => {
    if (!(key in pics)) { pics[key] = null; tintURL(url, prim, env, opts).then((u) => { pics[key] = u; }); }
    return pics[key];
  };
  for (let d = 0; d < 10; d++) {
    coloured("n" + d, `${UI}n${d}.png`, ...CLOCK);
    coloured("d" + d, `${A}d${d}.png`, 0xffffff, 0xffffff, { alpha: "grey" });
    coloured("i" + d, `${UI}big${d}.png`, 0xffffff, 0xffffff, { alpha: "grey" }); // (its grey, a mask for the prim colour)
  }
  coloured("ipts", `${A}points.png`, 0xffffff, 0xffffff, { alpha: "grey" });
  PANEL.forEach((env, z) => coloured("panel" + z, `${A}panel.png`, 0xffffff, env));
  FLASH.forEach((c, i) => coloured("flash" + i, `${A}flash.png`, c, 0xffffff));
  COMBO.forEach(([prim, env], i) => coloured("x" + i, `${A}x${i + 2}.png`, prim, env));
  // a number in pictures: html, or null till they're all made; one digit drawn 1.2 times as wide (0x86A0B19C)
  const digitsOf = (n, name, cls) => {
    const s = String(Math.max(0, n)), urls = s.split("").map((d) => pics[name + d]);
    return urls.every(Boolean) ? urls.map((u) => `<img class="${cls}${s.length === 1 ? " one" : ""}" src="${u}" alt="">`).join("") : null;
  };
  // the tally's: two layers, the env colour through the picture and the prim through its grey, to colour as it goes
  const masked = (pic, grey) => `<span class="dd-d" style="--a: url('${pic}'); --i: url('${grey}')"></span>`;

  // ---- sounds and the like, from the game: a Delibird's on its player's channel, by its x (0x8002780C) ----
  const mine = (z) => z === shell.me();
  game.on("send", (m) => shell.send("pad", m));
  game.on("tempo", (n) => shell.tempo(n)); // (the last 30 s: the tune speeds up)
  game.on("sound", (name) => shell.sound(name));
  game.on("strain", (z, name, on, x) => shell.hold(name, z, on, { x })); // (0x8F10, 0x8F11: each one's own, while asked for)
  game.on("step", (z, x) => shell.sound("step", z, { x })); // (0x8F0C)
  game.on("sack", (z, n, x) => { shell.sound("sack" + Math.max(1, Math.min(5, n)), z, { x }); if (mine(z)) shell.haptic("light"); }); // (0x8F05-0x8F09)
  game.on("hand", (z, x) => shell.sound("hand", z, { x })); // (0x8F0B)
  game.on("in", (z, kind) => { // (0x8F00, 0x8F04 for a piano or a Snorlax: its player's column, 0x80027A18)
    shell.sound(kind === 1 || kind === 2 ? "inBig" : "in", z);
    shell.flash(z, "bump");
    if (mine(z)) shell.haptic("medium");
  });
  game.on("combo", (z, n, x) => { // (0x8F16-0x8F19, by its Delibird: 0x86A036F4)
    shell.sound("combo" + n, z, { x });
    shell.flash(z, "bump");
    if (mine(z)) shell.haptic("success");
  });
  game.on("knocked", (z, n, x) => { // (0x8F02; 0x8F03 if it had gifts)
    shell.sound(n ? "spill" : "knocked", z, { x });
    shell.flash(z, "hurt");
    if (mine(z)) shell.haptic("heavy");
  });
  game.on("spun", (z, x) => { shell.sound("spun", z, { x }); if (mine(z)) shell.haptic("medium"); }); // (0x8F01)
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
        : { left: W / 2 + "px", top: safe.top + 10 + "px", transform: "translateX(-50%)" });
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
      // (online: the seats nobody was dealt are CPUs, as the server has them; but
      // for the empty ones (the CPUs off): no one plays those, not even a CPU)
      const cpus = !round.online ? [0, 1, 2, 3].map((z) => z !== round.me && !round.empty?.[z])
        : [0, 1, 2, 3].map((z) => !round.empty?.[z] && !(round.lineup || []).some((p) => p.seat === z));
      game.reset(round.level, round.seed, { me: round.me, control: round.control, cpus, empty: round.empty, told: m?.dd, delay: round.delay });
      shell.stopSound();
      keys.clear();
      steer = null;
      restStick();
      for (let z = 0; z < 4; z++) {
        rows[z].hidden = game.empty[z]; // (the tally: only those there)
        rows[z].querySelector(".dd-badge").src = `${UI}badge_${cpus[z] ? ["com_blue", "com_green", "com_red", "com_yellow"][z] : `${z + 1}p`}.png`;
      }
    },
    idle() {
      game.reset(game.levelName || "normal");
      game.state = "idle";
      shell.stopSound();
    },
    go() { game.start(); shell.music("main"); }, // (song 52, at GO: 0x86A0167C)
    finish() {}, // (no whistle, and song 52 plays on till the results' own: nothing fades it, 0x86A014D0)
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
  let shownClock = null;
  function drawHud(on) {
    hud.classList.toggle("off", !on);
    const playing = game.state === "play" || game.state === "ready";
    pads.hidden = !playing || !coarse?.matches;
    const ended = game.endAt !== null;
    // the clock: seconds left, rounded up (0x86A095A0: 60 at GO, and 0 on through the tally and the results)
    timeEl.hidden = !(playing || game.state === "over");
    const s = game.state === "ready" ? R.TIME / R.FPS : game.secondsLeft();
    if (s !== shownClock) {
      const html = digitsOf(s, "n", "dd-n");
      if (html) { timeEl.innerHTML = html; shownClock = s; }
    }
    hint.hidden = !(game.state === "ready" || (game.state === "play" && game.lastFrame < SHOW_HINT));
    hint.textContent = coarse?.matches ? "Slide a finger to walk · take gifts up to your door" : "Arrows to walk · take gifts up to your door";
    // each card: its count in the HUD's digits (380), on its box (376) in the player's colour
    (api.cards || []).forEach((card, z) => {
      if (game.empty[z]) return; // (its card's hidden)
      const num = card.querySelector(".num"), n = game.delivered()[z];
      if (!(num.firstElementChild?.classList.contains("dd-c") && num.dataset.dd === String(n))) {
        const html = digitsOf(n, "d", "dd-c");
        if (html) { num.innerHTML = html; num.dataset.dd = n; }
      }
      const panel = pics["panel" + z], box = card.querySelector(".count");
      if (panel && box.dataset.dd !== "panel" + z) { box.style.setProperty("--dd-panel", `url('${panel}')`); box.dataset.dd = "panel" + z; }
    });
    // a combo, by its player's card: x2-x5 growing on the flash in its colour (for a second: 0x86A095A0),
    // between the game's frames
    combos.forEach((el, z) => {
      const c = game.combos[z], f = c ? (game.time - c.at) * R.FPS : 99;
      el.hidden = !(c && f < 30) || !api.cards;
      if (el.hidden) return;
      const card = api.cards[z].getBoundingClientRect();
      shell.place(el, { left: card.left + card.width / 2 + "px", top: card.bottom + 2 + "px", transform: "translateX(-50%)" });
      const k = Math.floor(f), t = f - k;
      const flash = el.querySelector(".dd-flash"), x = el.querySelector(".dd-x");
      const fsrc = pics["flash" + (c.n - 1)], xsrc = pics["x" + (c.n - 1)] || `${A}x${c.n + 1}.png`;
      if (fsrc && flash.getAttribute("src") !== fsrc) flash.src = fsrc;
      if (x.getAttribute("src") !== xsrc) x.src = xsrc;
      flash.style.transform = `scale(${(popAt(k) + (popAt(k + 1) - popAt(k)) * t) / 0.72})`;
      x.style.transform = `scale(${(GROW[Math.min(2, k)] + (GROW[Math.min(2, k + 1)] - GROW[Math.min(2, k)]) * t) / 0.85})`;
    });
    // the tally at the end: each one's points counting up, the winners' going round the colours
    tallyEl.hidden = !ended;
    if (ended) {
      const t = game.tally(), wins = game.winners || [];
      const c = t.frames % 60, from = Math.floor(c / 10), round = hex(mix(ROUND[from], ROUND[(from + 1) % 6], (c % 10) / 10));
      rows.forEach((r, z) => {
        const n = game.result && t.counted ? game.result.s[z] : t.shown[z];
        if (n !== shownTally[z]) {
          const urls = String(n).split("").map((d) => [`${UI}big${d}.png`, pics["i" + d]]);
          if (urls.every(([, i]) => i)) {
            r.querySelector(".dd-num").innerHTML = urls.map(([a, i]) => masked(a, i)).join("");
            shownTally[z] = n;
          }
        }
        const pts = r.querySelector(".dd-pts");
        if (!pts.style.getPropertyValue("--i") && pics.ipts) {
          pts.style.setProperty("--a", `url('${A}points.png')`);
          pts.style.setProperty("--i", `url('${pics.ipts}')`);
        }
        const won = t.counted && !!wins[z];
        r.style.setProperty("--prim", won ? round : TALLY[0]);
        r.style.setProperty("--env", won ? "#ffffff" : TALLY[1]);
      });
    } else shownTally.fill(-1);
    // which Delibird is yours (the four look the same)
    const { label, full } = game.birds[shell.me()];
    over.copy(label.position).y += label.top() + OVER_LABEL;
    if (full.visible) over.y = Math.max(over.y, full.position.y + full.scale.y / 2 + OVER_LABEL);
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
