// Rampage Rollout in the minigames shell (main.js): the track and its camera,
// the controls (on a phone: a finger anywhere is a D-pad, the way it slides
// from where it went down, and the A button drops a dust cloud; or the keys),
// its HUD (the places and the laps, in the middle of the track as the game has
// them, moving as the game moves them; the hint and the buttons), its sounds
// and song, and its online messages ("pad", "won"). The rules are in
// rules.js, the game in game.js.
import * as THREE from "three";
import { loadAssets } from "./assets.js";
import { Game, CAMERA } from "./game.js";
import * as R from "./rules.js";
import { meMark } from "../mark.js";
import { paint, tintURL } from "../tint.js";

export const SOUNDS = {
  url: "assets/rollout/sound.bin",
  standIns: {
    step: (tone) => tone(90, 0, 0.05, { type: "triangle", vol: 0.04 }),
    roll: (tone, noise) => noise(0, 0.25, { vol: 0.03, filter: "lowpass", freq: 400 }),
    hit: (tone) => tone(300, 0, 0.15, { type: "square", vol: 0.08, to: 120 }),
    dizzy: (tone) => tone(1200, 0, 0.06, { type: "triangle", vol: 0.04 }),
    cloud: (tone, noise) => noise(0, 0.35, { vol: 0.06, filter: "bandpass", freq: 700 }),
    lap: (tone) => [660, 880].forEach((f, i) => tone(f, i * 0.08, 0.1, { type: "triangle", vol: 0.08 })),
    final: (tone) => [660, 880, 1100].forEach((f, i) => tone(f, i * 0.08, 0.12, { type: "triangle", vol: 0.09 })),
    cheer: (tone) => tone(520, 0, 0.3, { type: "triangle", vol: 0.06, to: 780 }),
    slump: (tone) => tone(300, 0, 0.4, { type: "triangle", vol: 0.06, to: 150 }),
    crowd: (tone, noise) => noise(0, 0.8, { vol: 0.05, filter: "bandpass", freq: 1500 }),
  },
};

const SHOW_HINT = 90; // frames of the race the hint stays for, after the countdown
const DEAD = 14; // px a finger moves before it's a direction
// the track's outer corners and the frame's top (what the view must show)
const TRACK = [340, 60, 285];
const COLOUR_NAMES = ["blue", "green", "red", "yellow"];
const HEAD = 78; // the arrow over your Donphan (55 tall; the camera's steep, so a little more)...
const OVER_LABEL = 4; // ...or just over its badge, while it has one
// the HUD's moves (0x86407E2C: from where it is to a place in so many frames,
// eased (1 - cos)/2, on the game's 320 x 240 screen): at GO the rank coins come
// up from below (114, 240 + 64k) to their column (110, 79 + 15k) and the LAP
// sign in from the right (320) to its place (156), in 40 frames (0x864080A0,
// 0x86408148); once the first one's in the LAP sign goes off to the left
// (-70), in 20 (0x8640826C); once the race is over the coins line up in a row
// along the bottom, (64 + 52k, 198), in 20 (0x864081E8): placed on the window
// as the shell places the winners' banner over them (its screen's 69 / 240
// down). Where the remake has the board, a pixel of the game's screen is a
// 12th of its unit (its rows are 1.25 units apart, the game's 15 pixels)
const SLIDE_IN = 40, LAP_OFF = 20, ROW_UP = 20, PX = 1 / 12;
// the laps to go in module #64's big digits (image bank 429) at 0.7, (20, 20)
// into the LAP gear, through FC30B261 5566FF7F with prim E1F0FF and env black
// (0x86408798-0x86408828): light blue with a dark rim
const DIGIT = { prim: 0xe1f0ff, env: 0x000000 };

export async function create(shell, onProgress) {
  const assets = await loadAssets("assets/rollout/", onProgress);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x97d91d); // (the meadow's grass, where the meadow ends: a tall phone sees past it)
  scene.add(new THREE.AmbientLight(0xffffff, 0.62 * Math.PI));
  const sun = new THREE.DirectionalLight(0xffffff, 0.55 * Math.PI);
  sun.position.set(0.2, 1, 0.5);
  scene.add(sun);
  const game = new Game(scene, assets);

  // ---- its HUD: the places and the laps (in the track's middle), the hint, the buttons ----
  const hud = document.createElement("div");
  hud.className = "game-hud rr";
  const A = "assets/rollout/";
  hud.innerHTML = `
    <div class="rr-board">
      <ol class="rr-places">${[0, 1, 2, 3].map((k) => `<li><img class="rr-rank" src="${A}rank${k + 1}.png" alt="${k + 1}"><img class="rr-badge" alt=""></li>`).join("")}</ol>
      <div class="rr-lap"><img class="rr-gear" src="${A}lap.png" alt="Laps"><img class="rr-num" alt=""><canvas class="rr-final" hidden></canvas></div>
    </div>
    <div class="rr-hint" hidden></div>
    <div class="rr-pads" hidden>
      <div class="rr-stick rest"><i class="rr-knob"></i></div>
      <div class="rr-a"><img src="${A}button_a.png" alt="A"></div>
    </div>`;
  shell.hud.append(hud);
  const board = hud.querySelector(".rr-board"), rows = [...hud.querySelectorAll(".rr-places li")];
  const lapEl = hud.querySelector(".rr-lap"), lapNum = lapEl.querySelector(".rr-num"), gear = lapEl.querySelector(".rr-gear"), finalEl = lapEl.querySelector(".rr-final");
  const hint = hud.querySelector(".rr-hint"), pads = hud.querySelector(".rr-pads"), stickEl = hud.querySelector(".rr-stick"),
    knob = hud.querySelector(".rr-knob"), aEl = hud.querySelector(".rr-a");
  const mark = meMark(hud, shell.me), over = new THREE.Vector3();
  // the HUD's pictures as the game colours them: FINAL LAP! (grey, bank 385) times
  // its colour of the moment (ENV x the texel: FC50D2A1 FFA7FFFF), the digits
  const finalPic = new Image();
  finalPic.src = A + "final.png";
  const digitPics = [];
  for (let d = 0; d < 10; d++) tintURL(`assets/ui/big${d}.png`, DIGIT.prim, DIGIT.env).then((url) => { digitPics[d] = url; });

  // ---- sounds and the like, from the game ----
  // (each Donphan's on its player's own channel, placed where it is: 0x8002780C; the
  // leader's lap, the final lap and each one in, in the middle: 0x800279B4)
  const mine = (z) => z === shell.me();
  game.on("send", (m) => shell.send("pad", m));
  game.on("step", (z, pan) => shell.sound("step", z, { pan })); // (0x5F00)
  game.on("hold", (name, z, on, pan) => shell.hold(name, z, on, { pan })); // (rolling, 0x5001: each frame of it)
  game.on("dizzy", (z, pan) => shell.sound("dizzy", z, { pan, frames: 1 })); // (0x5404: asked for every 5 frames, held a frame)
  game.on("drop", (z, pan) => { shell.sound("cloud", z, { pan }); if (mine(z)) shell.haptic("light"); }); // (0x4F06)
  for (const name of ["hit", "knocked"]) {
    game.on(name, (z, pan) => { // (0x5F03)
      shell.sound("hit", z, { pan });
      shell.flash(z, "hurt");
      if (mine(z)) shell.haptic("heavy");
    });
  }
  game.on("rocket", (z) => { if (mine(z)) shell.haptic("medium"); });
  game.on("lap", () => shell.sound("lap")); // (0x5F09: the leader's)
  game.on("final", () => shell.sound("final")); // (0x5F0A; the song fades and comes back faster: game.js)
  game.on("in", (z, pan, won) => { // someone's in (0x5F08; the first in, the crowd for 68 frames: 0x80027764(0x1C07, 0x44))
    shell.sound("go");
    if (won) shell.sound("crowd", undefined, { frames: 0x44 });
    shell.flash(z, "bump");
    if (mine(z)) shell.haptic(won ? "success" : "light");
  });
  game.on("cheer", (z, pan) => shell.sound("cheer", z, { pan })); // (0x5F06, at the end)
  game.on("slump", (z, pan) => shell.sound("slump", z, { pan })); // (0x5F05)
  // the song the game has on (game.tune: 34 from 31 frames after GO; faded, and 100, on the
  // final lap), as soon as it's not catching up (so a device that rejoins has it too)
  let tune = null;
  function music() {
    const t = game.tune;
    if (!t || t.key === tune || game.state !== "play" || shell.catchingUp?.()) return;
    tune = t.key;
    if (t.name) shell.music(t.name);
    else shell.music(null, t.fade);
  }

  // ---- the controls ----
  // a finger anywhere (but the A button) is a D-pad: the way it slides from
  // where it went down, up, down, left or right (the most of the two); the A
  // button drops a dust cloud. The keys: ← ↑ → ↓ (or W A S D), Space (and more) for A
  const coarse = window.matchMedia?.("(pointer: coarse)");
  let steer = null; // { id, x, y: where the finger went down }
  const keys = new Set();
  const KEYS = { ArrowUp: R.UP, KeyW: R.UP, ArrowDown: R.DOWN, KeyS: R.DOWN, ArrowLeft: R.LEFT, KeyA: R.LEFT, ArrowRight: R.RIGHT, KeyD: R.RIGHT };
  const PRESS = new Set(["Space", "KeyX", "KeyK", "KeyJ", "KeyZ", "Enter"]);
  function fromKeys() {
    if (steer) return;
    let bits = 0;
    for (const b of keys) bits |= b;
    game.setDpad(bits);
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
  function aim(e) {
    const dx = e.clientX - steer.x, dy = e.clientY - steer.y, d = Math.hypot(dx, dy);
    let bits = 0;
    if (d >= DEAD) bits = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? R.RIGHT : R.LEFT) : dy > 0 ? R.DOWN : R.UP;
    game.setDpad(bits);
    const k = Math.min(1, d / 40);
    knob.style.transform = `translate(${(dx / (d || 1)) * k * 28}px, ${(dy / (d || 1)) * k * 28}px)`;
  }
  function restStick() {
    stickEl.classList.add("rest");
    knob.style.transform = "";
    shell.place(stickEl, rest);
  }
  let rest = {};

  let view = null, portrait = false, inner = null, screen = { W: 1, H: 1, u: 8 };
  const api = {
    game, scene, assets,
    get views() {
      if (!view) return [];
      // (the camera moves: on the grid in the countdown, then over the track; at the end, to the winners)
      const c = game.camera();
      view.cam.position.set(...c.eye);
      view.cam.lookAt(...c.at);
      view.cam.updateMatrixWorld();
      view.base.copy(view.cam.position);
      return [view];
    },
    get shake() { return 0; },
    label: null,

    // the track, seen from the game's camera with the field of view that shows
    // all of it (at least the game's 30 degrees), over the whole window: in
    // portrait the picture's moved up, the track under the top cards, the
    // buttons below it (over the meadow). The places and the laps in the
    // track's middle, the cards in the corners (in portrait, the bottom two
    // under the track)
    layout(W, H, safe, me, cards) {
      portrait = W / H < 1.1;
      const cam = view?.cam || new THREE.PerspectiveCamera(CAMERA.fov, 1, 10, 6000);
      view = { cam, x: 0, y: 0, w: W, h: H };
      cam.aspect = W / H;
      cam.clearViewOffset();
      cam.position.set(...CAMERA.eye);
      cam.lookAt(...CAMERA.at);
      cam.updateMatrixWorld();
      cam.fov = fitFov(cam);
      cam.updateProjectionMatrix();
      const corners = [];
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) corners.push([sx * TRACK[0], 0, sz * TRACK[2]]);
      let track = screenBox(cam, view, corners);
      if (portrait) {
        const dy = Math.round(track.y - (safe.top + 56));
        if (dy > 0) {
          cam.setViewOffset(W, H, 0, dy, W, H);
          cam.updateProjectionMatrix();
          track = screenBox(cam, view, corners);
        }
      }
      view.base = cam.position.clone();
      // the middle of the track on the screen: the places on its left, the laps on its right (as the game has them)
      inner = screenBox(cam, view, [[-R.INNER[0], 0, -R.INNER[1]], [R.INNER[0], 0, -R.INNER[1]], [-R.INNER[0], 0, R.INNER[1]], [R.INNER[0], 0, R.INNER[1]]]);
      const u = Math.max(8, Math.min(inner.h / 6.5, inner.w / 9));
      screen = { W, H, u };
      board.style.setProperty("--u", u + "px");
      shell.place(board, { left: inner.x + "px", top: inner.y + "px" });
      board.style.width = inner.w + "px";
      board.style.height = inner.h + "px";
      const below = track.y + track.h;
      cards.forEach((c, z) => {
        c.classList.toggle("mini", true);
        shell.place(c, {
          ...(z % 2 === 0 ? { left: safe.left + 6 + "px" } : { right: W - safe.right + 6 + "px" }),
          ...(z < 2 ? { top: safe.top + 6 + "px" } : portrait ? { top: below + 6 + "px" } : { bottom: H - safe.bottom + 6 + "px" }),
        });
      });
      const room = Math.max(150, H - below - 40); // (in portrait, below the track and its bottom cards)
      pads.classList.toggle("rr-below", portrait);
      pads.style.setProperty("--room", room + "px");
      rest = portrait ? { left: "28%", top: H - room / 2 + "px" } : { left: "18%", bottom: "22%" };
      if (!steer) restStick();
      return portrait;
    },

    reset(round) {
      const m = round.start;
      // (online: the seats nobody was dealt are CPUs, as the server has them)
      const cpus = !round.online ? [0, 1, 2, 3].map((z) => z !== round.me)
        : [0, 1, 2, 3].map((z) => !(round.lineup || []).some((p) => p.seat === z));
      game.reset(round.level, round.seed, { me: round.me, control: round.control, cpus, told: m?.rr, delay: round.delay });
      tune = null;
      shell.stopSound();
      keys.clear();
      steer = null;
      game.setDpad(0);
      restStick();
    },
    idle() {
      game.reset(game.levelName || "normal");
      game.state = "idle";
      tune = null;
      shell.stopSound();
    },
    go() { game.start(); },
    finish() {}, // (the song plays on: the results' takes its place)
    stop() { game.stop(); },
    setControl(z, c) { game.setControl(z, c); },
    get state() { return game.state; },
    get time() { return game.time; },
    step(dt) { game.update(dt); music(); },
    animate() {},
    score(i) { return game.lapOf(i); },
    setScores(scores) { game.scores = scores.map((x) => (Number.isInteger(x) && x >= 0 ? x : null)); },
    celebrate() { return game.celebrate(); },
    hud(on) { drawHud(on); },
    remote(t, m) { if (t === "pad" || t === "won") game.told(t, m); },

    pointerdown(e) {
      if (onButton(e)) { press(); return; }
      if (steer) return; // (one finger steers)
      if (!(coarse?.matches || e.pointerType === "touch")) { press(); return; } // (a mouse: a click is A)
      steer = { id: e.pointerId, x: e.clientX, y: e.clientY };
      stickEl.classList.remove("rest");
      shell.place(stickEl, { left: e.clientX + "px", top: e.clientY + "px" });
      game.setDpad(0);
    },
    pointermove(e) { if (steer && e.pointerId === steer.id) aim(e); },
    pointerup(e) {
      if (!steer || e.pointerId !== steer.id) return;
      steer = null;
      game.setDpad(0);
      restStick();
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
    blur() { keys.clear(); steer = null; game.setDpad(0); restStick(); },
    debug: {
      dpad: (bits) => game.setDpad(bits),
      press: () => game.press(),
      get world() { return game.world; },
      get inner() { return inner; },
      // where on the page a point of the track (x, height, y in its units) is
      onScreen(x, h, y) {
        const v = new THREE.Vector3(x, h, y).project(view.cam);
        return [view.x + ((v.x + 1) / 2) * view.w, view.y + ((1 - v.y) / 2) * view.h];
      },
    },
  };

  // ---- the HUD, each frame ----
  function drawHud(on) {
    hud.classList.toggle("off", !on);
    const playing = game.state === "play" || game.state === "ready";
    pads.hidden = !playing || !coarse?.matches;
    board.hidden = !(game.state === "play" || game.state === "over");
    // each rank's coin and who has it (0x864082A8: the players' ranks, 1st to 4th)
    const w = game.world;
    for (let k = 0; k < 4; k++) {
      const z = w.d.findIndex((d) => d.rank === k), img = rows[k].querySelector(".rr-badge");
      rows[k].hidden = z < 0;
      if (z < 0) continue;
      const src = `assets/ui/badge_${game.cpus[z] ? "com_" + COLOUR_NAMES[z] : z + 1 + "p"}.png`;
      if (img.getAttribute("src") !== src) img.setAttribute("src", src);
    }
    // the leader's laps to go on the gear; FINAL LAP! on its last, in its colour of the moment
    const lead = w.d.find((d) => d.rank === 0) || w.d[0], last = lead.laps < 2;
    gear.hidden = last;
    lapNum.hidden = last;
    finalEl.hidden = !last;
    if (last) {
      const c = game.finalColour() || [255, 255, 255], key = c.join();
      if (key !== painted && finalPic.naturalWidth) { paint(finalEl, finalPic, c, 0); painted = key; }
    } else if (digitPics[lead.laps % 10] && lapNum.getAttribute("src") !== digitPics[lead.laps % 10]) {
      lapNum.src = digitPics[lead.laps % 10];
      lapNum.alt = lead.laps;
    }
    if (!board.hidden) moves();
    hint.hidden = !(game.state === "ready" || (game.state === "play" && game.lastFrame < SHOW_HINT));
    hint.textContent = coarse?.matches ? "Slide a finger to turn · A: a dust cloud" : "Arrows to turn · Space: a dust cloud";
    // which Donphan is yours (the four look the same): over its badge, or its head once
    // that's gone; (the views' getter moves the camera to now first)
    const v = game.donphan[shell.me()];
    if (v.label.visible) over.copy(v.label.position).y += v.label.top() + OVER_LABEL;
    else over.copy(v.root.position).y += HEAD;
    mark.place((game.state === "play" || game.state === "over") && api.views[0], over);
  }
  let painted = null;

  // the HUD's moves, drawn between the game's frames: the coins and the LAP sign in at GO,
  // the sign off once the first one's in, the coins in a row once it's over
  function moves() {
    const ease = (n, of) => (1 - Math.cos((Math.max(0, Math.min(n, of)) / of) * Math.PI)) / 2;
    const px = screen.u * PX, shown = game.shown, first = game.firstIn(), end = game.endFrame();
    const unit = Math.min(screen.W / 260, screen.H / 240); // (the banner's pixel: main.js)
    const k = ease(game.time * R.FPS, SLIDE_IN), row = end === null ? 0 : ease(shown - end, ROW_UP);
    rows.forEach((li, n) => {
      const x = inner.x + li.offsetLeft, y = inner.y + li.offsetTop;
      let dx = 4 * px * (1 - k), dy = (screen.H + 64 * n * px - y) * (1 - k); // (from below, staggered)
      if (row > 0) { // (to the game's (64 + 52k, 198), on the window as the banner is)
        dx += (screen.W / 2 + (64 + 52 * n - 160) * unit - x) * row;
        dy += ((screen.H * 198) / 240 - y) * row;
      }
      li.style.transform = dx || dy ? `translate(${dx}px, ${dy}px)` : "";
    });
    const x = inner.x + lapEl.offsetLeft;
    let dx = (screen.W - x) * (1 - k); // (in from the right edge)
    if (first !== null) dx += (-lapEl.offsetWidth - 14 * px - x) * ease(shown - first, LAP_OFF); // (to -70: off the left edge)
    lapEl.style.transform = dx ? `translateX(${dx}px)` : "";
  }

  // the field of view (degrees) that shows the whole track from the camera
  function fitFov(cam) {
    let most = Math.tan((CAMERA.fov * Math.PI) / 360);
    const inv = cam.matrixWorldInverse, v = new THREE.Vector3();
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const y of [0, TRACK[1]]) {
      v.set(sx * TRACK[0], y, sz * TRACK[2]).applyMatrix4(inv);
      most = Math.max(most, Math.abs(v.y / v.z) * 1.04, Math.abs(v.x / v.z / cam.aspect) * 1.04);
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
