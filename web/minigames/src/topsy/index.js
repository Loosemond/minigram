// Topsy-Turvy in the minigames shell (main.js): the ring and its camera, the
// controls (on a phone: a finger anywhere is a stick, the way and how far it
// slides from where it went down, and the A button is the RAPID SPIN; or the
// keys), its HUD (the clock in its balloon at the top and each player's points
// by their card, as the game has them, the hint and the buttons) and its online
// messages ("pad", "won"). The rules are in rules.js, the game in game.js.
import * as THREE from "three";
import { loadAssets } from "./assets.js";
import { Game, CAMERA } from "./game.js";
import * as R from "./rules.js";
import { meMark } from "../mark.js";

export const SOUNDS = {
  url: "assets/topsy/sound.bin",
  standIns: {
    hum: (tone) => tone(110, 0, 0.3, { type: "sawtooth", vol: 0.015 }),
    humCharge: (tone) => tone(90, 0, 0.3, { type: "sawtooth", vol: 0.015 }),
    humSpin: (tone) => tone(160, 0, 0.3, { type: "sawtooth", vol: 0.02 }),
    spin: (tone) => tone(300, 0, 0.3, { type: "sawtooth", vol: 0.06, to: 900 }),
    hit1: (tone) => tone(220, 0, 0.08, { type: "square", vol: 0.06, to: 120 }),
    hit2: (tone) => tone(180, 0, 0.12, { type: "square", vol: 0.08, to: 90 }),
    hit3: (tone, noise) => { tone(140, 0, 0.2, { type: "square", vol: 0.09, to: 60 }); noise(0, 0.2, { vol: 0.08, freq: 900 }); },
    out: (tone) => tone(500, 0, 0.4, { type: "triangle", vol: 0.07, to: 150 }),
    jump: (tone) => tone(300, 0, 0.18, { type: "triangle", vol: 0.06, to: 700 }),
    point: (tone) => [880, 1320].forEach((f, i) => tone(f, i * 0.07, 0.1, { type: "triangle", vol: 0.08 })),
  },
};

const SHOW_HINT = 3 * R.FPS; // frames of the play the hint stays for
const DEAD = 8; // px a finger moves before it pushes
const FULL = 56; // and how far for a full push
// what the view must show: the ring's rim (and the Hitmontop on it), all round
const RIM = R.RIM + 150;
// the arrow over your Hitmontop: from its middle (255 up it, as it leans) this
// far straight up (its feet, spinning on its head, are 510 up it)
const MIDDLE = 255, HEAD = 285;

export async function create(shell, onProgress) {
  const assets = await loadAssets("assets/topsy/", onProgress);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x8a4636); // (the brick floor, past the mirrored picture)
  scene.add(new THREE.AmbientLight(0xffffff, 0.62 * Math.PI));
  const sun = new THREE.DirectionalLight(0xffffff, 0.55 * Math.PI);
  sun.position.set(0.2, 1, 0.5);
  scene.add(sun);
  const game = new Game(scene, assets);

  // ---- its HUD: the clock (0x8600B474), each player's points (0x8600AE6C), the hint, the buttons ----
  const hud = document.createElement("div");
  hud.className = "game-hud tt";
  const A = "assets/topsy/";
  hud.innerHTML = `
    <div class="tt-clock"><img class="tt-swirl" src="${A}swirl0.png" alt=""><img class="tt-balloon" src="${A}balloon.png" alt=""><b>60</b></div>
    ${[0, 1, 2, 3].map((z) => `<div class="tt-points tt-p${z}">${[0, 1, 2, 3, 4].map(() => `<img src="${A}dot0.png" alt="">`).join("")}</div>`).join("")}
    <div class="tt-hint" hidden></div>
    <div class="tt-pads" hidden>
      <div class="tt-stick rest"><i class="tt-knob"></i></div>
      <div class="tt-a"><img src="${A}button_a.png" alt="A"></div>
    </div>`;
  shell.hud.append(hud);
  const clock = hud.querySelector(".tt-clock"), clockNum = clock.querySelector("b"), swirl = clock.querySelector(".tt-swirl");
  const points = [...hud.querySelectorAll(".tt-points")];
  const hint = hud.querySelector(".tt-hint"), pads = hud.querySelector(".tt-pads"), stickEl = hud.querySelector(".tt-stick"),
    knob = hud.querySelector(".tt-knob"), aEl = hud.querySelector(".tt-a");
  const mark = meMark(hud, shell.me), over = new THREE.Vector3();

  // ---- sounds and the like, from the game ----
  const mine = (z) => z === shell.me();
  game.on("send", (m) => shell.send("pad", m));
  game.on("tempo", (n) => shell.tempo(n)); // (the last 30 s: the tune speeds up)
  game.on("sound", (name) => shell.sound(name));
  game.on("loop", (name, z, on, pan) => shell.hold(name, z, on, { pan }));
  game.on("jump", (z, pan) => shell.sound("jump", { pan })); // (0x4F06)
  game.on("spin", (z, pan) => { shell.sound("spin", { pan }); if (mine(z)) shell.haptic("medium"); }); // (0x4F02)
  game.on("hit", (a, b, k, pan) => { // (0x4F03, 0x4F07, 0x4F04)
    shell.sound("hit" + k, { pan });
    if (mine(a) || mine(b)) shell.haptic(k >= 2 ? "heavy" : "light");
  });
  game.on("out", (z, pan) => { // (0x4F05)
    shell.sound("out", { pan });
    shell.flash(z, "hurt");
    if (mine(z)) shell.haptic("heavy");
  });
  game.on("point", (z) => { // (0x0F04)
    shell.sound("point", z);
    shell.flash(z, "bump");
    if (mine(z)) shell.haptic("success");
  });

  // ---- the controls ----
  // a finger anywhere (but the A button) is a stick: the way it slides from
  // where it went down, and how far (to FULL px); the A button is the RAPID
  // SPIN. The keys: ← ↑ → ↓ (or W A S D) push (the D-pad's 64, or 45 on a
  // diagonal: 0x86005A00), Space (and more) for A
  const coarse = window.matchMedia?.("(pointer: coarse)");
  let steer = null; // { id, x, y: where the finger went down }
  const keys = new Set();
  const KEYS = { ArrowUp: "u", KeyW: "u", ArrowDown: "d", KeyS: "d", ArrowLeft: "l", KeyA: "l", ArrowRight: "r", KeyD: "r" };
  const PRESS = new Set(["Space", "KeyX", "KeyK", "KeyJ", "KeyZ", "Enter"]);
  function fromKeys() {
    if (steer) return;
    const x = (keys.has("r") ? 1 : 0) - (keys.has("l") ? 1 : 0), y = (keys.has("u") ? 1 : 0) - (keys.has("d") ? 1 : 0);
    const k = x && y ? 45 : 64;
    game.setStick(x * k, y * k);
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

  let view = null, portrait = false, theCards = [];
  const api = {
    game, scene, assets,
    get views() { return view ? [view] : []; },
    get shake() { return 0; },
    label: null,

    // the ring, seen from the game's camera with the field of view that shows
    // all of it (at least the game's 30 degrees), over the whole window: in
    // portrait the picture's moved up, the ring under the top cards, the
    // buttons below it. The cards in the corners, each one's points by it; the
    // clock at the top
    layout(W, H, safe, me, cards) {
      portrait = W / H < 1.1;
      const cam = view?.cam || new THREE.PerspectiveCamera(CAMERA.fov, 1, 64, 32768);
      view = { cam, x: 0, y: 0, w: W, h: H };
      cam.aspect = W / H;
      cam.clearViewOffset();
      cam.position.set(...CAMERA.eye);
      cam.lookAt(...CAMERA.at);
      cam.updateMatrixWorld();
      cam.fov = fitFov(cam);
      cam.updateProjectionMatrix();
      let ring = screenBox(cam, view, rim());
      if (portrait) {
        const dy = Math.round(ring.y - (safe.top + 92));
        if (dy > 0) {
          cam.setViewOffset(W, H, 0, dy, W, H);
          cam.updateProjectionMatrix();
          ring = screenBox(cam, view, rim());
        }
      }
      view.base = cam.position.clone();
      const below = ring.y + ring.h;
      const u = Math.max(9, Math.min(16, ring.w / 34));
      hud.style.setProperty("--u", u + "px");
      cards.forEach((c, z) => {
        c.classList.toggle("mini", true);
        const top = z < 2, left = z % 2 === 0;
        shell.place(c, {
          ...(left ? { left: safe.left + 6 + "px" } : { right: W - safe.right + 6 + "px" }),
          ...(top ? { top: safe.top + 6 + "px" } : portrait ? { top: below + 6 + "px" } : { bottom: H - safe.bottom + 6 + "px" }),
        });
        points[z].classList.toggle("right", !left);
      });
      theCards = cards;
      shell.place(clock, { left: W / 2 + "px", top: safe.top + 8 + "px", transform: "translateX(-50%)" });
      const room = Math.max(150, H - below - 70); // (in portrait, below the ring and its bottom cards)
      pads.classList.toggle("tt-below", portrait);
      pads.style.setProperty("--room", room + "px");
      rest = portrait ? { left: "28%", top: H - room / 2 + "px" } : { left: "16%", bottom: "24%" };
      if (!steer) restStick();
      return portrait;
    },

    reset(round) {
      const m = round.start;
      // (online: the seats nobody was dealt are CPUs, as the server has them)
      const cpus = !round.online ? [0, 1, 2, 3].map((z) => z !== round.me)
        : [0, 1, 2, 3].map((z) => !(round.lineup || []).some((p) => p.seat === z));
      game.reset(round.level, round.seed, { me: round.me, control: round.control, cpus, told: m?.tt, delay: round.delay });
      shell.stopSound();
      keys.clear();
      steer = null;
      game.setStick(0, 0);
      restStick();
    },
    idle() {
      game.reset(game.levelName || "normal");
      game.state = "idle";
      shell.stopSound();
    },
    go() { game.start(); shell.music("main"); }, // (song 33, as the play starts: 0x860075A8)
    finish() { shell.music(null, 40); },
    stop() { game.stop(); },
    setControl(z, c) { game.setControl(z, c); },
    get state() { return game.state; },
    get time() { return game.time; },
    step(dt) { game.update(dt); },
    animate() {},
    score(i) { return game.points()[i]; },
    setScores(scores) { game.scores = scores.map((x) => (Number.isInteger(x) && x >= 0 ? x : 0)); },
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
      if (PRESS.has(e.code)) { if (!e.repeat) press(); return true; }
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
      press: () => game.press(),
      get world() { return game.world; },
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
    const showing = game.state === "play" || game.state === "over";
    clock.hidden = !showing && game.state !== "ready";
    // the clock: whole seconds left, in its balloon, the swirl round it going round (0x8600B100, 0x8600B328)
    const s = game.state === "ready" ? R.TIME_LIMIT / R.FPS : game.secondsLeft();
    if (clockNum.textContent !== String(s)) clockNum.textContent = s;
    const k = Math.floor(game.clockS * 30) % 6, frame = [0, 1, 2, 3, 2, 1][k];
    const src = `${A}swirl${frame}.png`;
    if (!swirl.src.endsWith(src)) swirl.src = src;
    clock.style.setProperty("--pulse", 1 + 0.2 * Math.abs(((game.clockS * 30) % 32) - 16) / 16);
    // each one's points: a dot in the colour of each one it knocked out, then grey ones up to five, by its
    // card (under the top ones, over the bottom ones in landscape), running in from its side
    const w = game.world;
    for (let z = 0; z < 4; z++) {
      const got = w.p[z].victims, imgs = points[z].children, c = theCards[z];
      points[z].hidden = !(showing || game.state === "ready");
      if (c && !points[z].hidden) {
        const r = c.getBoundingClientRect(), left = z % 2 === 0, under = z < 2 || portrait;
        const at = `${left ? r.left + 2 : r.right - 2}|${under ? r.bottom + 3 : r.top - 3}`;
        if (points[z].dataset.at !== at) {
          points[z].dataset.at = at;
          points[z].style.left = left ? r.left + 2 + "px" : "";
          points[z].style.right = left ? "" : window.innerWidth - r.right + 2 + "px";
          points[z].style.top = under ? r.bottom + 3 + "px" : "";
          points[z].style.bottom = under ? "" : window.innerHeight - r.top + 3 + "px";
        }
      }
      for (let k2 = 0; k2 < 5; k2++) {
        const src2 = `${A}dot${k2 < got.length ? got[k2] + 1 : 0}.png`;
        if (!imgs[k2].src.endsWith(src2)) imgs[k2].src = src2;
      }
    }
    hint.hidden = !(game.state === "ready" || (game.state === "play" && game.lastFrame < SHOW_HINT));
    hint.textContent = coarse?.matches ? "Slide a finger to push · A: RAPID SPIN" : "Arrows to push · Space: RAPID SPIN";
    // which Hitmontop is yours (the four look the same), knocked out onto the floor too
    const top = game.tops[shell.me()];
    over.set(0, MIDDLE, 0).applyQuaternion(top.posture).add(top.model.root.position).y += HEAD;
    mark.place(showing && view, over);
  }

  // the rim, all round (and as high as a Hitmontop on it)
  function rim() {
    const pts = [];
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      for (const y of [0, 300]) pts.push([Math.cos(a) * RIM, y, Math.sin(a) * RIM]);
    }
    return pts;
  }
  // the field of view (degrees) that shows the whole ring from the camera
  function fitFov(cam) {
    let most = Math.tan((CAMERA.fov * Math.PI) / 360);
    const inv = cam.matrixWorldInverse, v = new THREE.Vector3();
    for (const p of rim()) {
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

