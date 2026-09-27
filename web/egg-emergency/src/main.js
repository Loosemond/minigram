import * as THREE from "three";
import { loadAssets } from "./assets.js";
import { Game, zoneX, ZONE_W, VIEW_TOP, VIEW_BOTTOM, BACKDROP, PX } from "./game.js";
import { buildStage } from "./stage.js";
import { Effects } from "./fx.js";
import { sfx, unlock, setMuted, isMuted } from "./audio.js";
import { telegram } from "./telegram.js";

const BG = "#4a3a30"; // the brick base of the backdrop, for Telegram's header and the page
const PLAYER_COLOURS = ["#2f5de0", "#23a043", "#dc3030", "#e8a412"]; // 1P-4P, as on the game's badges
const BADGES = ["1p", "com_green", "com_red", "com_yellow"];
telegram.init(BG);

const $ = (s) => document.querySelector(s);
const app = $("#app");
const cards = [...document.querySelectorAll(".card")];
const names = [telegram.userName || "You", "COM", "COM", "COM"];

// ---------------------------------------------------------------- renderer

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas: $("#view"), antialias: true, powerPreference: "high-performance" });
} catch {
  $("#loading p").textContent = "This device can't show 3D graphics (WebGL is off).";
  throw new Error("no WebGL");
}
renderer.outputColorSpace = THREE.LinearSRGBColorSpace; // the colours as they are (see assets.js)
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setClearColor("#17110e"); // behind the CPU boxes
renderer.autoClear = false;

const scene = new THREE.Scene();
// N64-style shade = ambient + N.L x sun (x PI: three's lights are physical units);
// surfaces facing the camera come out at about the texture's own colour
scene.add(new THREE.AmbientLight(0xffffff, 0.7 * Math.PI));
const sun = new THREE.DirectionalLight(0xffffff, 0.42 * Math.PI);
sun.position.set(-1.5, 3, 4);
scene.add(sun);

// ------------------------------------------------------------------ layout
// Landscape: one camera on all four players, like the game. Portrait: your
// Chansey fills the screen and the three CPUs get small boxed views along the
// top, each framed on its own bay.

let views = [];
const frames = $("#frames");

// fit [width] x [bottom, top] around the player(s) in the Chansey's plane, the
// camera level with the scene and far back with a narrow lens, close to the
// game's straight-on picture. Extra height goes below (the water), so drops
// always enter at the top edge; extra width shows more of the building.
function frameCamera(v) {
  const cam = v.cam, top = v.top ?? VIEW_TOP, bottom = v.bottom ?? VIEW_BOTTOM;
  cam.aspect = v.w / v.h;
  const t = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2);
  const d = Math.max((top - bottom) / 2 / t, v.width / 2 / (t * cam.aspect));
  const cy = top - d * t;
  const cx = v.zone === undefined ? 0 : zoneX(v.zone);
  if (v.zone === undefined) cam.layers.enableAll();
  else { cam.layers.set(0); cam.layers.enable(v.zone + 1); }
  v.base = new THREE.Vector3(cx, cy, d);
  cam.position.copy(v.base);
  cam.lookAt(cx, cy, 0);
  cam.updateProjectionMatrix();
}

function place(el, style) { Object.assign(el.style, { left: "auto", right: "auto", top: "auto", bottom: "auto", transform: "none" }, style); }

function layout() {
  const W = app.clientWidth, H = app.clientHeight;
  renderer.setSize(W, H, false);
  const safe = $("#safe").getBoundingClientRect();
  const left = $("#left");
  frames.innerHTML = "";
  app.classList.toggle("portrait", W / H < 1.25);
  if (W / H >= 1.25) {
    const cam = views.find((v) => v.zone === undefined)?.cam || new THREE.PerspectiveCamera(20, 1, 0.1, 200);
    views = [{ cam, x: 0, y: 0, w: W, h: H, width: BACKDROP.w * PX }]; // the game's whole screen
    frameCamera(views[0]);
    for (let i = 0; i < 4; i++) {
      const p = new THREE.Vector3(zoneX(i), 0, 0).project(cam);
      // on the bridge's front, under each Chansey (the roofs are where the eggs come from)
      place(cards[i], { left: ((p.x + 1) / 2) * W + "px", bottom: H - safe.bottom + 8 + "px", transform: "translateX(-50%)" });
    }
    place(left, { right: W - safe.right + 10 + "px", top: safe.top + 10 + "px" });
  } else {
    // each CPU box shows exactly its own bay, pole to pole, from the bridge's
    // front up to where the eggs are a moment from the hands; the boxes keep
    // that shape and sit apart, so each player's area reads on its own
    const MINI = { width: ZONE_W + 0.1, bottom: -0.5, top: 1.95 };
    const aspect = MINI.width / (MINI.top - MINI.bottom);
    const pad = 8, gap = 10, border = 3, room = safe.right - safe.left - 2 * pad;
    let miniH = Math.round(H * 0.22), miniW = Math.round(miniH * aspect);
    if (3 * miniW + 2 * gap > room) { miniW = Math.floor((room - 2 * gap) / 3); miniH = Math.round(miniW / aspect); }
    const strip = safe.top + miniH + 2 * pad;
    const x0 = Math.round((W - 3 * miniW - 2 * gap) / 2);
    const cams = views.length === 4 ? views.map((v) => v.cam) : [0, 1, 2, 3].map(() => new THREE.PerspectiveCamera(22, 1, 0.1, 200));
    views = [{ cam: cams[0], zone: 0, x: 0, y: strip, w: W, h: H - strip, width: ZONE_W }];
    for (let i = 1; i < 4; i++) {
      views.push({ cam: cams[i], zone: i, x: x0 + (i - 1) * (miniW + gap), y: safe.top + pad, w: miniW, h: miniH, ...MINI });
    }
    for (const v of views) {
      frameCamera(v);
      if (v.zone) {
        place(cards[v.zone], { left: v.x + v.w / 2 + "px", top: v.y + v.h - 3 + "px", transform: "translate(-50%, -100%)" });
        const f = frames.appendChild(document.createElement("div"));
        f.className = "frame";
        Object.assign(f.style, {
          left: v.x - border + "px", top: v.y - border + "px", width: v.w + 2 * border + "px", height: v.h + 2 * border + "px",
          borderWidth: border + "px", borderColor: PLAYER_COLOURS[v.zone],
        });
      }
    }
    place(cards[0], { left: safe.left + 8 + "px", top: strip + 8 + "px" });
    place(left, { right: W - safe.right + 8 + "px", top: strip + 12 + "px" });
  }
}

function render() {
  const H = app.clientHeight;
  renderer.setScissorTest(false);
  renderer.clear(); // the whole canvas: the strip behind the CPU boxes
  renderer.setScissorTest(true);
  for (const v of views) {
    const y = H - v.y - v.h;
    renderer.setViewport(v.x, y, v.w, v.h);
    renderer.setScissor(v.x, y, v.w, v.h);
    v.cam.position.copy(v.base);
    if (game.shake && (v.zone === 0 || v.zone === undefined)) {
      v.cam.position.x += (Math.random() - 0.5) * game.shake * 0.25;
      v.cam.position.y += (Math.random() - 0.5) * game.shake * 0.25;
    }
    renderer.clearDepth();
    renderer.render(scene, v.cam);
  }
}

// ------------------------------------------------------------------- input
// Like the game's L and R buttons: hold a side to lean, the last one pressed wins.

const held = new Map(); // pointer id or key -> -1 | 1
let order = [];
function hold(id, dir) { held.set(id, dir); order = order.filter((x) => x !== id); order.push(id); }
function letGo(id) { held.delete(id); order = order.filter((x) => x !== id); }
function lean() { return order.length ? held.get(order[order.length - 1]) : 0; }
const sideOf = (x) => (x < app.clientWidth / 2 ? -1 : 1);
const playing = () => phase === "play" || phase === "countdown";

app.addEventListener("pointerdown", (e) => {
  unlock();
  if (!playing() || e.target.closest("button")) return;
  hold("p" + e.pointerId, sideOf(e.clientX));
  e.preventDefault();
});
app.addEventListener("pointermove", (e) => {
  if (held.has("p" + e.pointerId)) held.set("p" + e.pointerId, sideOf(e.clientX)); // sliding across
});
for (const ev of ["pointerup", "pointercancel", "pointerleave"]) app.addEventListener(ev, (e) => letGo("p" + e.pointerId));
app.addEventListener("contextmenu", (e) => e.preventDefault());

const KEYS = { ArrowLeft: -1, KeyA: -1, KeyQ: -1, KeyL: -1, ArrowRight: 1, KeyD: 1, KeyE: 1, KeyR: 1 };
addEventListener("keydown", (e) => {
  unlock();
  if (e.code in KEYS && playing()) { if (!e.repeat) hold(e.code, KEYS[e.code]); e.preventDefault(); }
  else if ((e.code === "Enter" || e.code === "Space") && !playing()) {
    const b = !$("#title").hidden ? $("#play") : !$("#results").hidden ? $("#again") : null;
    if (b) { e.preventDefault(); b.click(); }
  }
});
addEventListener("keyup", (e) => letGo(e.code));
addEventListener("blur", () => { held.clear(); order = []; });

// --------------------------------------------------------------- game flow

let phase = "loading", level = "normal", round = 0, game, fx, stage;
const best = {};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// the countdown is the game's own 3, 2, 1, GO! (image bank 360)
function banner(what) {
  const b = $("#banner");
  b.innerHTML = what.startsWith("img:") ? `<img src="assets/ui/${what.slice(4)}.png" alt="">` : `<span>${what}</span>`;
  b.classList.remove("show");
  void b.offsetWidth; // restart the animation
  b.classList.add("show");
}

function flash(i, cls) {
  const c = cards[i];
  c.classList.remove(cls);
  void c.offsetWidth;
  c.classList.add(cls);
}

// numbers in the game's small HUD digits (image bank 404)
function digits(n) { return String(n).split("").map((d) => `<img src="assets/ui/n${d}.png" alt="">`).join(""); }

function show(screen) {
  for (const s of ["#title", "#results"]) $(s).hidden = s !== screen;
  $("#hud").hidden = !!screen;
}

function setLevel(l) {
  level = l;
  for (const b of document.querySelectorAll(".levels button")) b.setAttribute("aria-checked", b.dataset.level === l);
  $("#best").textContent = best[l] ? best[l] + " eggs" : "–";
}

function toTitle() {
  round++;
  phase = "title";
  telegram.back(null);
  game.reset(level);
  fx.clear();
  show("#title");
}

async function play() {
  unlock();
  const me = ++round;
  show(null);
  game.reset(level);
  fx.clear();
  held.clear(); order = [];
  phase = "countdown";
  telegram.back(toTitle);
  await wait(400);
  for (const n of [3, 2, 1]) {
    if (round !== me) return;
    banner("img:count" + n); sfx.tick();
    await wait(750);
  }
  if (round !== me) return;
  banner("img:go"); sfx.go(); telegram.haptic("medium");
  game.start();
  phase = "play";
}

async function finish() {
  const me = round;
  phase = "finish";
  banner("FINISH!"); sfx.finish(); telegram.haptic("success");
  await wait(1300);
  if (round !== me) return;
  const results = game.celebrate();
  const mine = results.find((r) => r.player.i === 0);
  if (mine.place === 1) sfx.win(); else sfx.lose();
  await wait(1700);
  if (round !== me) return;
  const tie = results.filter((r) => r.place === 1).length > 1;
  $("#champion").hidden = !(mine.place === 1 && !tie);
  $("#verdict").textContent = mine.place === 1 ? (tie ? "It's a tie!" : "You win!") : ["", "", "2nd place", "3rd place", "4th place"][mine.place];
  $("#ranking").innerHTML = results.map((r) => `
    <li class="${r.player.i === 0 ? "me" : ""}" style="--c: ${PLAYER_COLOURS[r.player.i]}">
      <span class="place">${r.place}${["", "st", "nd", "rd", "th"][r.place]}</span>
      <img class="badge" src="assets/ui/badge_${BADGES[r.player.i]}.png" alt="">
      <span class="n"></span><span class="e"><i class="egg"></i>${r.eggs}</span></li>`).join("");
  [...$("#ranking").children].forEach((li, k) => {
    li.querySelector(".n").textContent = names[results[k].player.i];
    li.querySelector(".badge").alt = results[k].player.i ? "COM" : "1P";
  });
  const isBest = mine.eggs > (best[level] || 0);
  $("#newbest").hidden = !isBest;
  if (isBest) { best[level] = mine.eggs; telegram.set("best_" + level, mine.eggs); setLevel(level); }
  phase = "results";
  telegram.back(toTitle);
  show("#results");
}

const shown = [-1, -1, -1, -1, -1];
function updateHud() {
  for (let i = 0; i < 4; i++) {
    const n = game.players[i].eggs;
    if (n !== shown[i]) { cards[i].querySelector(".num").innerHTML = digits(n); shown[i] = n; }
  }
  const left = game.eggsLeft;
  if (left !== shown[4]) { $("#left .num").innerHTML = digits(left); shown[4] = left; }
  const l = lean();
  $("#padL").classList.toggle("on", playing() && l < 0);
  $("#padR").classList.toggle("on", playing() && l > 0);
}

// -------------------------------------------------------------------- boot

async function boot() {
  cards.forEach((c, i) => {
    c.style.setProperty("--c", PLAYER_COLOURS[i]);
    c.querySelector(".badge").src = `assets/ui/badge_${BADGES[i]}.png`;
    c.querySelector(".badge").alt = i ? "COM" : "1P";
  });
  let assets;
  try {
    assets = await loadAssets("assets/", (k) => { $("#loading .bar i").style.width = k * 100 + "%"; });
  } catch (err) {
    console.error(err);
    $("#loading p").textContent = "Couldn't load the game's files. (Developers: run tools/web_assets.py.)";
    return;
  }
  stage = buildStage(scene, assets);
  fx = new Effects(scene, assets);
  game = new Game(scene, assets, fx);
  game.on("catch", (p) => { flash(p.i, "bump"); if (p.i === 0) { sfx.catch(); telegram.haptic("light"); } });
  game.on("miss", (p) => { if (p.i === 0) sfx.crack(); });
  game.on("boom", (p) => { flash(p.i, "hurt"); if (p.i === 0) { sfx.boom(); telegram.haptic("heavy"); } });
  game.on("dud", (p) => { if (p.i === 0) sfx.dud(); });
  game.on("finish", finish);
  if (new URLSearchParams(location.search).has("debug")) { // for testing from the console
    window.egg = { game, fx, scene, paused: false, phase: () => phase, lean: (d) => (d ? hold("debug", d) : letGo("debug")) };
  }

  const [e, n, h, savedLevel, muted] = await Promise.all(
    ["best_easy", "best_normal", "best_hard", "level", "muted"].map((k) => telegram.get(k)));
  Object.assign(best, { easy: +e || 0, normal: +n || 0, hard: +h || 0 });
  setLevel(savedLevel in best ? savedLevel : "normal");
  setMuted(muted === "1");
  $("#sound").textContent = isMuted() ? "Sound off" : "Sound on";

  for (const b of document.querySelectorAll(".levels button")) {
    b.addEventListener("click", () => { sfx.tap(); telegram.haptic("select"); setLevel(b.dataset.level); telegram.set("level", level); });
  }
  $("#sound").addEventListener("click", () => {
    setMuted(!isMuted());
    $("#sound").textContent = isMuted() ? "Sound off" : "Sound on";
    telegram.set("muted", isMuted() ? "1" : "0");
    sfx.tap();
  });
  $("#play").addEventListener("click", play);
  $("#again").addEventListener("click", play);
  $("#menu").addEventListener("click", toTitle);

  new ResizeObserver(layout).observe(app);
  telegram.onResize(layout);
  layout();
  toTitle();
  $("#loading").hidden = true;

  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const dt = window.egg?.paused ? 0 : Math.min(clock.getDelta(), 0.1); // a hidden tab pauses, it doesn't skip ahead
    if (phase === "play") game.players[0].want = lean();
    game.update(dt);
    fx.update(dt);
    stage.update(performance.now() / 1000);
    updateHud();
    render();
  });
}

boot();
