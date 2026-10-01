// Eager Eevee in the minigames shell (main.js): the scene and its camera,
// the taps (dash; the Feint pad, feint), its HUD (each player's prizes and
// reaction time, "ROUND 1" ... "FINAL ROUND", the points) and its online
// messages ("dash", "got"). The rules are in rules.js, the round in game.js.
import * as THREE from "three";
import { loadAssets } from "./assets.js";
import { Game } from "./game.js";
import { Fx } from "./fx.js";
import { buildField } from "./field.js";
import * as R from "./rules.js";

export const SOUNDS = {
  url: "assets/eevee/sound.bin",
  standIns: {
    dash: (tone, noise) => noise(0, 0.12, { vol: 0.25, filter: "bandpass", freq: 1800 }),
    lid: (tone) => tone(660, 0, 0.12, { type: "triangle", vol: 0.12, to: 990 }),
    aipom: (tone) => [880, 1175].forEach((f, i) => tone(f, i * 0.09, 0.1, { vol: 0.08 })),
    call: (tone) => tone(523, 0, 0.18, { type: "square", vol: 0.05 }),
    bonk: (tone, noise) => { tone(180, 0, 0.12, { type: "square", vol: 0.12, to: 90 }); noise(0, 0.06, { vol: 0.2 }); },
    back: (tone) => tone(330, 0, 0.16, { type: "triangle", vol: 0.1, to: 220 }),
    got: (tone) => [1047, 1319, 1568].forEach((f, i) => tone(f, i * 0.06, 0.12, { vol: 0.09 })),
    boom: (tone, noise) => { noise(0, 0.5, { vol: 0.45, filter: "lowpass", freq: 900 }); tone(90, 0, 0.4, { vol: 0.2, to: 40 }); },
    blown: (tone) => tone(700, 0, 0.3, { type: "triangle", vol: 0.1, to: 200 }),
    dazed: (tone) => tone(440, 0, 0.25, { type: "sine", vol: 0.08, to: 880 }),
    munch: (tone, noise) => noise(0, 0.05, { vol: 0.12, filter: "highpass", freq: 2500 }),
  },
};

// The game's camera (0x86B00020): 40 degrees up and down (39.9991), from
// (0, 298.6, 338.9) looking at (0, 20, 0), on a 320 x 240 screen;
// background picture 44 is that screen's view of the field. Here the field is
// rebuilt in 3D from the picture (field.js), so another camera (portrait,
// more from above) sees the same place.
const CAM = { fov: 39.9991, eye: new THREE.Vector3(0, 298.6, 338.9), at: new THREE.Vector3(0, 20, 0), aspect: 4 / 3 };
const T20 = Math.tan(THREE.MathUtils.degToRad(CAM.fov / 2));
const PRIZE_ICON = { grapes: 0, pineco: 1, melon: 2, berries: 3 }; // image bank 389
// the ". sec." box (bank 393, 72 x 17) and where its digits go (bank 394, 8 x 11)
const SECS = { w: 72, h: 17, digits: [7, 19, 28], top: 3 };

export async function create(shell, onProgress) {
  const assets = await loadAssets("assets/eevee/", onProgress);
  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 0.75 * Math.PI));
  const sun = new THREE.DirectionalLight(0xffffff, 0.4 * Math.PI);
  sun.position.set(-1, 3, 2);
  scene.add(sun);
  buildField(scene);
  const game = new Game(scene, assets);
  const fx = new Fx(scene, assets.fx);
  const centre = new THREE.Vector3();

  // ---- its HUD ----
  const hud = document.createElement("div");
  hud.className = "game-hud ee";
  hud.innerHTML = `<img class="ee-round" alt="" hidden><i class="ee-me" hidden></i>
    <div class="ee-pads"><div class="pad ee-feint" data-pad="b">Feint</div><div class="pad ee-dash" data-pad="a">Dash</div></div>`;
  shell.hud.append(hud);
  const roundBanner = hud.querySelector(".ee-round"), meMark = hud.querySelector(".ee-me");
  const pads = { a: hud.querySelector(".ee-dash"), b: hud.querySelector(".ee-feint") };
  const prizeRows = [0, 1, 2, 3].map(() => {
    const d = hud.appendChild(document.createElement("div"));
    d.className = "ee-prizes";
    d.innerHTML = [0, 1, 2, 3, 4].map(() => `<i><img alt="" hidden></i>`).join("");
    return d;
  });
  const secs = [0, 1, 2, 3].map(() => {
    const d = hud.appendChild(document.createElement("div"));
    d.className = "ee-secs";
    d.hidden = true;
    d.innerHTML = `<img class="box" src="assets/eevee/secs.png" alt="">` +
      SECS.digits.map((x) => `<img class="d" style="left:calc(${x}px * var(--k)); top:calc(${SECS.top}px * var(--k))" alt="">`).join("");
    return d;
  });
  const popups = [0, 1, 2, 3].map(() => {
    const d = hud.appendChild(document.createElement("div"));
    d.className = "cc-points ee-points";
    d.hidden = true;
    return d;
  });

  // ---- sounds and the like, from the round ----
  const mine = (z) => z === shell.me();
  game.on("round", (n) => {
    shell.sound("call"); // (0xAF08: Aipom's clip 2 starts; 0xAF00 and the song at its frame 5)
    setTimeout(() => { if (game.state === "play") { shell.sound("aipom"); shell.music(n === R.ROUNDS - 1 ? "final" : "round", 0, true); } }, 170);
    roundBanner.src = `assets/eevee/round${n + 1}.png`;
    roundBanner.dataset.at = String(game.time + 5 / R.FPS);
  });
  // the song stops as the basket goes up (0x86B03308), and 0xAF01 at frame 5
  // of the lift; a fake has no sound, the music and effects hush for it
  game.on("open", () => shell.music(null, 2));
  game.on("up", () => shell.sound("lid"));
  game.on("hush", () => shell.hush(true));
  game.on("unhush", () => shell.hush(false));
  game.on("dash", (z) => { shell.sound("dash", z); if (mine(z)) shell.haptic("light"); fx.dust(game.eevees[z].m.root.position); }); // (0xAF02)
  game.on("feint", (z) => { shell.sound("dash", z); if (mine(z)) shell.haptic("light"); });
  game.on("bonk", (z) => { shell.sound("bonk", z); if (mine(z)) shell.haptic("heavy"); }); // (0xAF04)
  game.on("lost", (z) => shell.sound("back", z)); // (0xAF03)
  game.on("got", (z, pts) => { // (0xAF05)
    shell.sound("got", z);
    if (mine(z)) { shell.haptic("success"); shell.flash(z, "bump"); }
    showPoints(z, pts);
    if (game.now.rd.kind !== R.FRUIT) fx.sparkle(centre); // (the fruit pops up instead: game.js taken)
  });
  let boomed = -1;
  game.on("blown", (z) => { // (0xAF06, the flash and smoke for the first: 0x86B03C40; 0xAF0B for each)
    if (boomed !== game.now.n) { boomed = game.now.n; shell.sound("boom"); fx.blast(centre); }
    shell.sound("dazed", z);
    if (mine(z)) shell.haptic("error");
    shell.flash(z, "hurt");
  });
  game.on("landed", (z) => shell.sound("blown", z)); // (0xAF07)
  let lastMunch = 0;
  game.on("munch", (z) => { if (game.time - lastMunch > 0.25) { lastMunch = game.time; shell.sound("munch", z); } }); // (0xCA0F)
  game.on("press", (m) => shell.send("dash", m));
  // 70 frames after a prize goes, a roll for the next round (song 53: 0x86B01A78; not after the last)
  game.on("decided", (n) => {
    if (n >= R.ROUNDS - 1) return;
    setTimeout(() => { if (game.state === "play" && game.now.n === n) shell.music("main", 0, true); }, (70 / R.FPS) * 1000);
  });

  function showPoints(z, pts) {
    const d = popups[z];
    d.innerHTML = shell.bigDigits(pts, true);
    d.dataset.at = String(game.time);
    d.hidden = false;
  }

  let view = null;
  let portrait = false, cardRects = [];
  const api = {
    game, scene, assets,
    get views() { return view ? [view] : []; },
    get shake() { return game.shake * 30; },
    label: null,

    layout(W, H, safe, me, cards) {
      portrait = W / H < 1;
      const cam = view?.cam || new THREE.PerspectiveCamera(CAM.fov, 1, 50, 12800);
      view = { cam, x: 0, y: 0, w: W, h: H, shakeScale: 1 };
      if (portrait) topCamera(view, safe); else gameCamera(view);
      // the cards in the corners, as the game's badges are (0x86B0990C:
      // 1P top left, 2P top right, 3P bottom left, 4P bottom right)
      const m = 8, lift = portrait ? 70 : 0; // (in portrait the bottom cards go over the pads)
      cards.forEach((c, i) => {
        c.classList.remove("mini");
        const left = i % 2 === 0, top = i < 2;
        shell.place(c, {
          ...(left ? { left: safe.left + m + "px" } : { right: W - safe.right + m + "px" }),
          ...(top ? { top: safe.top + m + "px" } : { bottom: H - safe.bottom + m + lift + "px" }),
        });
      });
      requestAnimationFrame(() => { cardRects = cards.map((c) => c.getBoundingClientRect()); placeRows(); });
      return portrait;
    },

    reset(round) {
      const m = round.start;
      game.reset(round.level, round.seed, { me: round.me, control: round.control, level: m?.ee?.level,
                                            scores: m?.ee?.scores, prizes: m?.ee?.prizes });
      shell.stopSound();
      for (const d of [...secs, ...popups]) d.hidden = true;
      roundBanner.hidden = true;
      pads.a.hidden = pads.b.hidden = false;
      fx.clear();
      boomed = -1;
    },
    idle() {
      game.reset(game.levelName || "normal");
      game.state = "idle";
      shell.stopSound();
      for (const d of [...secs, ...popups]) d.hidden = true;
      roundBanner.hidden = true;
      fx.clear();
    },
    go() { game.start(); },
    finish() { shell.stopSound(); shell.sound("finish"); shell.music(null, 40); },
    stop() { game.stop(); shell.stopSound(); },
    setControl(z, c) { game.setControl(z, c); },
    get state() { return game.state; },
    get time() { return game.time; },
    step(dt) { game.update(dt); fx.update(dt); },
    animate() {},
    score(i) { return game.players[i].shown; },
    setScores(scores) { scores.forEach((e, i) => { game.players[i].total = game.players[i].shown = e; }); },
    celebrate() { return game.celebrate(); },
    hud(on) { drawHud(on); },
    remote(t, m) {
      if (t === "dash") game.told("press", { s: m.s, k: m.k, f: m.f });
      else if (t === "got") game.told("got", m);
    },

    // A: a tap (the Feint pad: B), or the keys
    pointerdown(e) {
      const pad = e.target.closest?.("[data-pad]");
      press(pad?.dataset.pad === "b" ? "b" : "a");
    },
    keydown(e) {
      const k = ["Space", "Enter", "KeyA", "KeyZ", "ArrowUp"].includes(e.code) ? "a"
        : ["KeyB", "KeyX", "ShiftLeft", "ShiftRight", "ArrowDown"].includes(e.code) ? "b" : null;
      if (!k) return false;
      if (!e.repeat) press(k);
      return true;
    },
    debug: { dash: () => press("a"), feint: () => press("b") },
  };
  function press(k) {
    const pad = pads[k];
    pad.classList.add("on");
    setTimeout(() => pad.classList.remove("on"), 120);
    game.press(k);
  }

  // ---- the HUD, each frame ----
  function placeRows() {
    // each player's prizes by their card: the game's five slots a corner (0x86B0DB74)
    prizeRows.forEach((d, i) => {
      const r = cardRects[i];
      if (!r) return;
      const left = i % 2 === 0, top = i < 2;
      Object.assign(d.style, {
        left: left ? r.left + "px" : "auto", right: left ? "auto" : innerWidth - r.right + "px",
        top: top ? r.bottom + 4 + "px" : "auto", bottom: top ? "auto" : innerHeight - r.top + 4 + "px",
        flexDirection: left ? "row" : "row-reverse",
      });
      Object.assign(secs[i].style, {
        left: left ? r.right + 6 + "px" : "auto", right: left ? "auto" : innerWidth - r.left + 6 + "px",
        top: r.top + (r.height - 17 * 1.5) / 2 + "px",
      });
    });
  }
  const tmp = new THREE.Vector3();
  function drawHud(on) {
    const playing = game.state === "play" || game.state === "over";
    hud.classList.toggle("off", !on);
    // the round's banner: from frame 5 of Aipom's call, for a second and a half
    const since = game.time - (+roundBanner.dataset.at || -9);
    roundBanner.hidden = !playing || since < 0 || since > 1.6;
    if (!roundBanner.hidden) roundBanner.style.opacity = String(Math.min(1, (1.6 - since) * 4));
    for (let z = 0; z < 4; z++) {
      const p = game.players[z];
      // prizes so far
      const imgs = prizeRows[z].querySelectorAll("img");
      imgs.forEach((img, n) => {
        const what = playing ? p.prizes[n] : null;
        img.hidden = !what;
        if (what) { const src = `assets/eevee/prize${PRIZE_ICON[what]}.png`; if (img.getAttribute("src") !== src) img.src = src; }
      });
      prizeRows[z].hidden = !playing;
      // the reaction time of its last dash, for two seconds
      const rt = p.reaction, box = secs[z];
      box.hidden = !playing || !rt || game.time - rt.at > 2.2;
      if (!box.hidden) {
        const v = Math.min(999, rt.v), ds = [Math.floor(v / 100), Math.floor(v / 10) % 10, v % 10];
        box.querySelectorAll(".d").forEach((img, k) => { const src = `assets/eevee/t${ds[k]}.png`; if (img.getAttribute("src") !== src) img.src = src; });
      }
      // a prize's points, over its Eevee, going up
      const d = popups[z];
      if (!d.hidden) {
        const k = game.time - +d.dataset.at;
        if (k > 1.4 || !playing || !view) { d.hidden = true; continue; }
        const e = game.eevees[z].m.root.position;
        tmp.set(e.x, 60 + k * 40, e.z).project(view.cam);
        d.style.left = ((tmp.x + 1) / 2) * view.w + "px";
        d.style.top = ((1 - tmp.y) / 2) * view.h + "px";
        d.style.opacity = String(Math.min(1, (1.4 - k) * 3));
      }
    }
    pads.a.parentElement.hidden = game.state !== "play";
    // which Eevee is yours (the remake's: the game's Eevee all look the same)
    meMark.hidden = !playing || !view;
    if (!meMark.hidden) {
      const e = game.eevees[shell.me()].m.root.position;
      tmp.set(e.x, 62, e.z).project(view.cam);
      meMark.style.left = ((tmp.x + 1) / 2) * view.w + "px";
      meMark.style.top = ((1 - tmp.y) / 2) * view.h + "px";
      meMark.style.setProperty("--c", ["#2f5de0", "#23a043", "#dc3030", "#e8a412"][shell.me()]);
    }
  }

  api.idle();
  return api;
}

// The game's camera, as wide as the game's screen at least: narrower windows get a wider lens
function gameCamera(v) {
  const cam = v.cam, aspect = v.w / v.h;
  cam.aspect = aspect;
  cam.fov = aspect >= CAM.aspect ? CAM.fov : THREE.MathUtils.radToDeg(2 * Math.atan(T20 * CAM.aspect / aspect));
  v.base = CAM.eye.clone();
  cam.position.copy(v.base);
  cam.lookAt(CAM.at);
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld();
}

// Portrait: the game's angle (from further back), so the ring (and the Eevee
// blown out of it) fills the width; more from above would squash the Eevee
const PITCH = Math.atan2(CAM.eye.y - CAM.at.y, CAM.eye.z - CAM.at.z); // (39.4 degrees)
function topCamera(v, safe) {
  const cam = v.cam, aspect = v.w / v.h;
  cam.aspect = aspect;
  cam.fov = 50;
  const pitch = PITCH, half = 172; // the ring (130) and the Eevee on it; one blown away (180) at the edge
  const tanH = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) * aspect;
  const d = half / tanH;
  const at = new THREE.Vector3(0, 10, 18);
  v.base = new THREE.Vector3(0, at.y + d * Math.sin(pitch), at.z + d * Math.cos(pitch));
  cam.position.copy(v.base);
  cam.lookAt(at);
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld();
  void safe;
}
