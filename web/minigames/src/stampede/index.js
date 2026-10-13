// Streaming Stampede in the minigames shell (main.js): the studio and its
// camera, the taps (count), its HUD (the cards: the question, "Let's count
// ...", the answer; the counts) and its online messages ("count", "ans").
// The rules are in rules.js, the game in game.js.
import * as THREE from "three";
import { loadAssets } from "./assets.js";
import { Game, BOOTH_X } from "./game.js";
import * as R from "./rules.js";
import { meMark } from "../mark.js";
import { tintURL } from "../tint.js";

export const SOUNDS = {
  url: "assets/stampede/sound.bin",
  standIns: {
    press: (tone) => tone(1568, 0, 0.05, { type: "square", vol: 0.05 }),
    card: (tone) => [784, 988, 1175].forEach((f, i) => tone(f, i * 0.08, 0.12, { vol: 0.08 })),
    lastCard: (tone) => [784, 988, 1175, 1568].forEach((f, i) => tone(f, i * 0.08, 0.14, { vol: 0.09 })),
    stop: (tone) => tone(880, 0, 0.3, { type: "square", vol: 0.08 }),
    answer: (tone) => tone(1319, 0, 0.2, { vol: 0.1 }),
    right: (tone) => [1047, 1319, 1568].forEach((f, i) => tone(f, i * 0.06, 0.12, { vol: 0.09 })),
    nobody: (tone) => tone(220, 0, 0.3, { type: "triangle", vol: 0.1, to: 150 }),
    tally: (tone) => tone(1760, 0, 0.04, { vol: 0.05 }),
    rise: (tone) => tone(660, 0, 0.05, { type: "triangle", vol: 0.05 }),
  },
};

// The game's camera (0x86900020): presets (distance d, angle a, height h,
// fov; 0x8690EB4C) give the eye at (0, d sin a + 400 + h, d cos a) looking at
// (0, h, 0), on a 320 x 240 screen. Preset 0 is the opening close-up (it eases
// to 1 over the countdown and on past GO), 1 the game's view, 2 the results'
// (the last answer eases to it); each move (1 - cos)/2 of the way.
const PRESETS = [[1110, -0.48, 100, 15.3996], [1030, -0.17, -40, 23.8997], [890, -0.42, 140, 24.9996]];
const OPEN = { frames: 135, go: 99 }; // the opening move (state 4: 0x86905630), and its frame on GO
const ASPECT = 4 / 3;
const BACKDROP_TOP = { y: 357, z: -99 }; // the circus backdrop's top edge (object 117)
const ease = (x) => (1 - Math.cos(Math.PI * Math.max(0, Math.min(1, x)))) / 2;
// The cards: UI layouts 126 (one kind), 129 (two), 127 (three), 128 (the last
// question: all), 125 "Who is correct?", 133 "The answer is ...", 130 and 131
// (its one or two digits and "Pokemon") (0x86902134), each element at its
// place on the 320 x 240 screen (here x2, the 640 x 480 grid). The game draws
// them still, as they are, on the frames it shows them (0x86907614, 0x86909EAC,
// 0x8690AA64): no board behind (layout 132's isn't drawn).
const BOXES = { 1: [134], 2: [95, 173], 3: [56, 134, 212] }; // PB?C, at y 105 (51 x 52), each kind's name 10 left at y 159
const DIGITS = { 1: { at: [115], pk: 146 }, 2: { at: [103, 126], pk: 157 } }; // PA?M at y 134, "Pokemon" (PP7C) at y 137
// each element's colours (prim, env) through the layouts' combiner, mode 2
// (FC309661 552EFF7F, 0x8004FBF4: (prim - env) x its grey + env, alpha its
// own): set by 0x86907614, 0x8690C6C4, 0x86909EAC and 0x8690CA50
const QUESTION = [0xffffff, 0x9b0078], PERFECT = [0xffffff, 0x006400], PRESS = [0xffffff, 0x000082];
const NAME = [0xffffff, 0x960000], ANSWER = [0xffb400, 0x000096];
const LETS = [0xe6f0ff, 0x000050]; // "Let's count ..." (FC30FE61 55FEF379, the same: 0x86907614)
// "Stop!" (0x8690DF18: bank 416's picture 19, 104 x 26, at (0, 0, 50) made a
// quad as the Pokemon are) is drawn in a scene of its own (geo 0x8690E158,
// after the studio's) whose camera is the node's (0x0B: 1000 from the origin
// at angles 0, 0, a fov of 30, no callback), so it's in the middle of the
// screen, 26 high of the 2 x 950 tan 15 its 240 lines see there: 24.51 of 480
// at 1x (style.css), at most 2.0526x. Its colours FFBEF0 and 460028 (FC30FFFF
// 5FFEF238, 0x8690DF90: the same mode). Here it's in the middle of the stream.
const STOP = [0xffbef0, 0x460028];
// where the cards' words are in portrait (made for the remake): the boxes round
// what they show, fitted to the screen's width below the stream
const FIT = { x: 92, w: 456, top: 58, bottom: 408 };
const HEAD = 62; // the arrow over your Cleffa or Igglybuff (about 55 tall), in its booth
const CROWDS = ["someRight", "allScored", "allPerfect"];

export async function create(shell, onProgress) {
  const assets = await loadAssets("assets/stampede/", onProgress);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x14101c);
  // the game's lights (geo 0x8690EBC0): 0x646464 all round, and two the game
  // turns with the camera each frame (light()), x PI, three's lights being physical
  scene.add(new THREE.AmbientLight(0x646464, Math.PI));
  const sun = new THREE.DirectionalLight(0xffffff, Math.PI), fill = new THREE.DirectionalLight(0x808080, Math.PI);
  scene.add(sun, fill);
  // past the studio's own edges (wider or taller screens than the game's):
  // more of its floor (the ramp's own texture, 75 units a repeat, lit the
  // same), and a dark wall
  let floorMat = null;
  assets.ramp.traverse((o) => { if (o.isMesh && /_tex00$/.test(o.material.name)) floorMat = o.material; });
  const more = floorMat ? floorMat.clone() : new THREE.MeshLambertMaterial({ color: 0x9494a4 });
  if (floorMat) { more.onBeforeCompile = floorMat.onBeforeCompile; more.customProgramCacheKey = floorMat.customProgramCacheKey; }
  if (floorMat?.map) {
    more.map = floorMat.map.clone();
    more.map.wrapS = more.map.wrapT = THREE.RepeatWrapping;
    more.map.repeat.set(6000 / 75, 3000 / 75);
    more.map.needsUpdate = true;
  }
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(6000, 3000), more);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, -48.6, 800);
  scene.add(floor);
  const game = new Game(scene, assets);

  // ---- its HUD ----
  const A = "assets/stampede/";
  const hud = document.createElement("div");
  hud.className = "game-hud ss";
  hud.innerHTML = `
    <div class="ss-screen">
      <div class="ss-card ask" hidden>
        <img class="q" alt="Question"><img class="qn" alt=""><img class="last" alt="Last Question">
        <img class="pts" alt="pts. for perfect"><img class="ptsn" alt="">
        <div class="boxes"></div>
        <img class="press" alt="Press the A Button to count!">
      </div>
      <div class="ss-card tell" hidden>
        <img class="who" alt="Who is correct?"><img class="is" alt="The answer is ..."><div class="answer"></div>
      </div>
      <img class="ss-lets" alt="Let's count ..." hidden>
      <img class="ss-stop" alt="Stop!" hidden>
    </div>
    <div class="ss-counts"></div>
    <div class="ss-pads"><div class="pad ss-count" data-pad="a"><img src="${A}button_a.png" alt="A">Count</div></div>`;
  shell.hud.append(hud);
  const screen = hud.querySelector(".ss-screen");
  const ask = hud.querySelector(".ask"), tell = hud.querySelector(".tell");
  const lets = hud.querySelector(".ss-lets"), stop = hud.querySelector(".ss-stop"), pad = hud.querySelector(".ss-count");
  const mark = meMark(hud, shell.me), over = new THREE.Vector3();
  const countBoxes = [0, 1, 2, 3].map(() => {
    const d = hud.querySelector(".ss-counts").appendChild(document.createElement("div"));
    d.hidden = true;
    return d;
  });
  const at = (el, x, y) => { el.style.left = `calc(${2 * x} * var(--u))`; el.style.top = `calc(${2 * y} * var(--u))`; };
  // a picture tinted as the game draws it (src/tint.js), once it's made
  const show = (img, file, [prim, env]) => {
    const want = file + prim + env;
    if (img.dataset.want === want) return;
    img.dataset.want = want;
    tintURL(A + file, prim, env).then((url) => { if (img.dataset.want === want) img.src = url; }).catch(() => {});
  };
  show(ask.querySelector(".q"), "w17.png", QUESTION);
  show(ask.querySelector(".last"), "w08.png", QUESTION);
  show(ask.querySelector(".pts"), "w12.png", PERFECT);
  show(ask.querySelector(".press"), "w06.png", PRESS);
  show(tell.querySelector(".who"), "w05.png", ANSWER);
  show(tell.querySelector(".is"), "w04.png", ANSWER);
  show(lets, "w18.png", LETS);
  show(stop, "w19.png", STOP);
  // (the rest made now too, so each is ready the frame it's first shown)
  for (const n of [13, 14, 15, 16]) tintURL(`${A}w${n}.png`, ...QUESTION).catch(() => {});
  for (const n of ["09", "10", "11"]) tintURL(`${A}w${n}.png`, ...PERFECT).catch(() => {});
  for (let n = 0; n < 18; n++) tintURL(`${A}name${String(n).padStart(2, "0")}.png`, ...NAME).catch(() => {});
  for (const f of ["w02.png", ...[...Array(10).keys()].map((d) => `a${d}.png`)]) tintURL(A + f, ...ANSWER).catch(() => {});
  at(ask.querySelector(".q"), 93, 29); // PP1C
  at(ask.querySelector(".qn"), 205, 29); // PP1M
  at(ask.querySelector(".last"), 64, 29); // PP4C
  at(ask.querySelector(".pts"), 80, 57); // PP2C
  at(ask.querySelector(".ptsn"), 88, 57); // PP2M (8 into PP2C)
  at(ask.querySelector(".press"), 72, 185); // PP3C
  at(tell.querySelector(".who"), 76, 83); // PP5C
  at(tell.querySelector(".is"), 96, 108); // PP6C

  // the question's card (layout 126, 129, 127 or 128): "Question n" (or "Last
  // Question"), its points for a perfect count, a box with the icon and the name
  // of each kind to count (or the last question's "ALL"), and "Press the A
  // Button to count!" (0x86907614)
  function fillCard(q) {
    const Q = game.qs[q], last = q === R.QUESTIONS - 1;
    ask.querySelector(".q").hidden = ask.querySelector(".qn").hidden = last;
    ask.querySelector(".last").hidden = !last;
    if (!last) show(ask.querySelector(".qn"), `w${13 + q}.png`, QUESTION);
    show(ask.querySelector(".ptsn"), `w${String([9, 9, 10, 10, 11][q]).padStart(2, "0")}.png`, PERFECT);
    const boxes = ask.querySelector(".boxes");
    if (last) {
      boxes.innerHTML = `<div class="box wide"><img src="${A}all.png" alt="ALL"></div><img class="name" alt="ALL">`;
      at(boxes.children[0], 114, 105);
      at(boxes.children[1], 124, 159);
      show(boxes.children[1], "name00.png", NAME);
      return;
    }
    const what = Q.what, xs = BOXES[what.length];
    boxes.innerHTML = what.map((kind) => `<div class="box"><img src="${A}icon${R.DEX[kind]}.png" alt=""></div>` +
      `<img class="name" alt="${R.KINDS[kind].name}">`).join("");
    what.forEach((kind, n) => {
      at(boxes.children[2 * n], xs[n], 105);
      at(boxes.children[2 * n + 1], xs[n] - 10, 159);
      show(boxes.children[2 * n + 1], `name${String(R.NAME[kind]).padStart(2, "0")}.png`, NAME);
    });
  }
  // the answer: its digits (image bank 414) and "Pokemon" (layout 130 or 131: 0x8690CA50)
  function fillAnswer(q) {
    const digits = String(game.qs[q].answer).split(""), L = DIGITS[digits.length];
    const ans = tell.querySelector(".answer");
    ans.innerHTML = digits.map((d) => `<img alt="${d}">`).join("") + `<img class="pk" alt="Pokémon">`;
    const imgs = ans.querySelectorAll("img");
    digits.forEach((d, n) => { at(imgs[n], L.at[n], 134); show(imgs[n], `a${d}.png`, ANSWER); });
    at(imgs[digits.length], L.pk, 137);
    show(imgs[digits.length], "w02.png", ANSWER);
  }

  // ---- sounds and the like, from the game ----
  const mine = (z) => z === shell.me();
  game.on("card", (q) => {
    shell.sound(q === R.QUESTIONS - 1 ? "lastCard" : "card"); // (0x3F0B, 0x3F07)
    if (q === 0) shell.music("main"); // song 30, from the first card on
    fillCard(q);
  });
  game.on("cardOn", () => shell.sound("cardOn")); // (0x3F03)
  game.on("count", (z) => {
    shell.sound("press", z); // (0x3F02, on the player's channel, panned and pitched as theirs)
    if (mine(z)) { shell.haptic("light"); pad.classList.add("on"); setTimeout(() => pad.classList.remove("on"), 90); }
  });
  game.on("press", (m) => shell.send("count", m));
  game.on("stop", () => { shell.sound("stop"); shell.haptic("medium"); }); // (0x3F08)
  game.on("reveal", (q) => fillAnswer(q));
  // the answer (0x3F01) after the drum roll; the last one's only song 32 (0x8690A318)
  game.on("answer", (q) => (q === R.QUESTIONS - 1 ? shell.music("reveal", 0, true) : shell.sound("answer")));
  game.on("results", () => shell.music("results", 0, true)); // song 31
  game.on("judged", (q, v) => {
    if (v.right) shell.sound("right"); else if (!v.scored) shell.sound("nobody"); // (0x3F05, 0x3F04)
    const z = shell.me();
    if (v.pts[z] > 0) { shell.haptic(v.counts[z] === game.qs[q].answer ? "success" : "medium"); shell.flash(z, "bump"); }
  });
  game.on("tally", () => shell.sound("tally")); // (0x3F06)
  game.on("tallyLast", () => shell.sound("tallyLast")); // (0x310A)
  game.on("rise", () => shell.sound("rise")); // (0x3209)
  // what the game asks for every frame it lasts: the drum roll (0x3000) and the crowd
  game.on("hold", ({ drum, crowd }) => {
    shell.hold("drum", undefined, drum);
    for (const c of CROWDS) shell.hold(c, undefined, c === crowd);
  });

  let view = null, portrait = false, frame = null;
  const api = {
    game, scene, assets,
    get views() { return view ? [view] : []; },
    get shake() { return 0; },
    label: null,

    layout(W, H, safe, me, cards) {
      portrait = W / H < 1.1;
      const cam = view?.cam || new THREE.PerspectiveCamera(PRESETS[1][3], 1, 50, 12800);
      view = { cam, x: 0, y: 0, w: W, h: H, shakeScale: 0 };
      aim(view);
      // the cards' words: on the game's screen, or in portrait as wide as the
      // screen, in its bottom third, below the stream
      if (portrait) {
        const B = FIT, u = (W - 12) / (B.w + 32);
        const top = Math.min(H * 0.62, safe.bottom - 12 - (B.bottom - B.top + 16) * u);
        frame = { left: W / 2 - (B.x + B.w / 2) * u, top: top - B.top * u, u };
      } else {
        const sw = Math.min(W, H * ASPECT), sh = sw / ASPECT;
        frame = { left: (W - sw) / 2, top: (H - sh) / 2, u: sw / 640 };
      }
      Object.assign(screen.style, { left: frame.left + "px", top: frame.top + "px" });
      screen.style.setProperty("--u", frame.u + "px");
      // "Stop!" in the middle of the stream (made for the remake: the game's is in the middle of its screen)
      const mid = new THREE.Vector3(0, 0, 360).project(cam);
      stop.style.top = `calc(${(((1 - mid.y) / 2) * H - frame.top) / frame.u} * var(--u))`;
      // the cards above the booths, over the books hanging there
      cards.forEach((c, i) => {
        c.classList.toggle("mini", portrait);
        const p = new THREE.Vector3(BOOTH_X[i], 128, 0).project(cam);
        shell.place(c, { left: ((p.x + 1) / 2) * W + "px", top: Math.max(safe.top + 4, ((1 - p.y) / 2) * H) + "px", transform: "translate(-50%, -100%)" });
      });
      return portrait;
    },

    reset(round) {
      const m = round.start;
      // (online: the seats nobody was dealt are CPUs, as the server has them; one
      // whose player is away, rejoining midway, is still theirs; the empty ones,
      // no one plays, not even a CPU)
      const cpus = !round.online ? [0, 1, 2, 3].map((z) => z !== round.me && !round.empty?.[z])
        : [0, 1, 2, 3].map((z) => !round.empty?.[z] && !(round.lineup || []).some((p) => p.seat === z));
      game.reset(round.level, round.seed, { me: round.me, control: round.control, cpus, empty: round.empty, told: m?.ss?.told });
      shell.stopSound();
      ask.hidden = tell.hidden = lets.hidden = stop.hidden = true;
      // (song 29, the game's opening, comes 26 frames into the countdown: games.js)
    },
    idle() {
      game.reset(game.levelName || "normal");
      game.state = "idle";
      shell.stopSound();
      ask.hidden = tell.hidden = lets.hidden = stop.hidden = true;
    },
    go() { game.start(); },
    // the hand-over: nothing of the game's own (no whistle; its song plays on
    // till the winners' replaces it, and the crowd till it's no longer asked for)
    finish() {},
    stop() { game.stop(); shell.stopSound(); },
    setControl(z, c) { game.setControl(z, c); },
    get state() { return game.state; },
    get time() { return game.time; },
    step(dt) { game.update(dt); },
    animate() {},
    score(i) { return game.players[i].shown; },
    setScores(scores) { scores.forEach((e, i) => { game.players[i].total = game.players[i].shown = e; }); },
    celebrate() { return game.celebrate(); },
    hud(on) { drawHud(on); },
    remote(t, m) {
      if (t === "count") game.told("count", m);
      else if (t === "ans") game.told("ans", m);
    },

    // A: a tap anywhere (or on the Count pad), or the keys
    pointerdown() { game.press(); },
    keydown(e) {
      if (!["Space", "Enter", "KeyA", "KeyZ", "KeyX", "ArrowUp", "ArrowDown"].includes(e.code)) return false;
      if (!e.repeat) game.press();
      return true;
    },
    debug: { count: () => game.press() },
  };

  // ---- the HUD, each frame (as the game's frame being drawn has it: a frame behind) ----
  const tmp = new THREE.Vector3();
  function drawHud(on) {
    hud.classList.toggle("off", !on);
    const playing = game.state === "play" || game.state === "over";
    if (view) aim(view);
    // which booth is yours (Cleffa and Igglybuff, two each): over its player, rising with it
    game.booths[shell.me()].holder.getWorldPosition(over).y += HEAD;
    mark.place(playing && view, over);
    const { q, t, f, k } = game.now, last = q === R.QUESTIONS - 1;
    if (!playing || t < 0 || game.post !== null) {
      ask.hidden = tell.hidden = lets.hidden = stop.hidden = true;
      for (const d of countBoxes) d.hidden = true;
      pad.parentElement.hidden = true;
      return;
    }
    const between = Math.max(0, Math.min(1, game.time * R.FPS - game.lastFrame)); // (of a frame, for the slide)
    // the card: from its first frame to its 84th (0x86907614)
    ask.hidden = !(t >= 1 && t < R.CARD);
    // the answer: "The answer is ..." from frame 30, its digits from 60, to 89
    // (0x86909EAC); in the last, "Who is correct?" with it from state 8's 120,
    // the digits from 180, to 209 (0x8690AA64)
    const n = last ? k - R.LAST_STATE8 : k, from = last ? 120 : 30, digits = last ? 180 : 60, to = last ? 210 : 90;
    tell.hidden = !(k >= 0 && n >= from && n < to);
    if (!tell.hidden) {
      tell.querySelector(".who").hidden = !last;
      tell.querySelector(".answer").hidden = n < digits;
    }
    // "Let's count ..." slides in from the right over frames 12-36 of the
    // card and out to the left over 60-84 (0x869090A0; on the 320 x 240
    // screen at y 76, x 644 to 73 to -500)
    const lt = t + between;
    lets.hidden = !(t >= 12 && t < R.CARD - 1);
    if (!lets.hidden) {
      const x = lt < 36 ? 644 + ((73 - 644) * (lt - 12)) / 24 : lt < 60 ? 73 : 73 + ((-500 - 73) * (lt - 60)) / 24;
      lets.style.transform = `translate(calc(${2 * x} * var(--u)), calc(${2 * 76} * var(--u)))`;
    }
    const s = game.stopSize;
    stop.hidden = s <= 0.01;
    if (!stop.hidden) stop.style.transform = `translate(-50%, -50%) scale(${s})`;
    // the counts at the answer, bigger, over each booth's screen in portrait
    // (made for the remake: they're on the screens too, but small on a phone)
    const counts = last ? k >= R.LAST_STATE8 + 120 && k < R.LAST_JUDGED : k >= 0 && k < R.JUDGED;
    for (let z = 0; z < 4; z++) {
      const d = countBoxes[z];
      d.hidden = !counts || !portrait || !view || game.empty[z];
      if (d.hidden) continue;
      const html = String(game.count(z, q)).split("").map((c) => `<img src="${A}g${c}.png" alt="${c}">`).join("");
      if (d.dataset.html !== html) { d.innerHTML = html; d.dataset.html = html; }
      const b = game.booths[z].group.position;
      tmp.set(b.x, b.y + 6, 40).project(view.cam);
      d.style.left = ((tmp.x + 1) / 2) * view.w + "px";
      d.style.top = ((1 - tmp.y) / 2) * view.h + "px";
    }
    pad.parentElement.hidden = game.state !== "play" || !(f >= 0 && k < 0);
  }

  // The game's camera, as wide as the game's screen: a wider window shows more
  // of the studio at the sides, a narrower one the same width, and more above
  // and below. Where it is: the opening move from preset 0 to 1 (135 frames
  // from the countdown's start, GO on its 99th: it goes on 36 frames past it),
  // or the last answer's from 1 to 2 (state 8's first 120 frames: 0x86909FAC).
  // Portrait (made for the remake) looks down more, so the stream fills the
  // middle of the screen, as wide at the back as the game's screen (the
  // Pokemon go at x -250, at its edge there: none goes before it's out of
  // sight); its opening comes from the booths, close up.
  const PORTRAIT = [
    { pitch: 26, at: [0, -5, 360], fov: 52, fit: [0, -10, 134], half: 248 }, // the game
    { pitch: 14, at: [0, 112, 0], fov: 46, fit: [0, 60, 0], half: 232 }, // the results
    { pitch: -6.5, at: [0, 100, 0], fov: 52, fit: [0, 100, 0], half: 215 }, // the opening: the booths close up, as preset 0
  ];
  function moves() {
    if (game.state === "idle") return { open: 1, results: 0 };
    if (game.state === "ready") { // (the countdown: on the round's clock, GO's due in toGo s)
      const s = shell.toGo?.();
      return { open: s === null || s === undefined ? 0 : ease((OPEN.go - 1 - s * R.FPS) / OPEN.frames), results: 0 };
    }
    const D = game.drawn, T = game.at[R.QUESTIONS - 1];
    return { open: ease((OPEN.go + D) / OPEN.frames),
             results: T ? ease(Math.min(119, D - T.answer - R.LAST_STATE8) / 120) : 0 };
  }
  function aim(v) {
    const cam = v.cam, aspect = v.w / v.h, { open, results } = moves();
    cam.aspect = aspect;
    let eye, look, fov;
    const preset = ([d, a, h, f]) => ({ eye: new THREE.Vector3(0, d * Math.sin(a) + 400 + h, d * Math.cos(a)), at: new THREE.Vector3(0, h, 0),
      fov: aspect >= ASPECT ? f : THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(f / 2)) * ASPECT / aspect)) });
    const mix = (a, b, k) => ({ eye: a.eye.lerp(b.eye, k), at: a.at.lerp(b.at, k), fov: a.fov + (b.fov - a.fov) * k });
    let c;
    if (aspect < 1.1) {
      const [a, b, o] = PORTRAIT.map((P) => portraitView(P, aspect));
      c = open < 1 ? mix(o, a, open) : mix(a, b, results);
    } else {
      const k = open < 1 ? open : results, [p, n] = open < 1 ? [PRESETS[0], PRESETS[1]] : [PRESETS[1], PRESETS[2]];
      c = preset(p.map((x, i) => x + (n[i] - x) * k));
    }
    ({ eye, at: look, fov } = c);
    cam.fov = fov;
    v.base = eye;
    cam.position.copy(eye);
    cam.lookAt(look);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    light(eye, look);
  }
  // The two lights the game turns by the camera each frame (0x869000D0,
  // 0x86900138): from the eye's pitch over where it looks and its yaw
  // (0x80037200), white at pitch + 45 degrees, yaw - 45, and 0x808080 at
  // -45 - pitch, yaw + 135: the other way; a light's way (0x8003AE84) is
  // (sin yaw cos pitch, sin pitch, cos yaw cos pitch), towards it
  function light(eye, look) {
    const dx = eye.x - look.x, dy = eye.y - look.y, dz = eye.z - look.z;
    const pitch = Math.atan2(dy, Math.hypot(dx, dz)), yaw = Math.atan2(dx, dz), q = Math.PI / 4;
    const way = (p, y) => [Math.sin(y) * Math.cos(p), Math.sin(p), Math.cos(y) * Math.cos(p)];
    sun.position.set(...way(pitch + q, yaw - q));
    fill.position.set(...way(-q - pitch, yaw + 3 * q));
  }
  // a portrait camera: looking at P.at from P.pitch degrees down, its fov P.fov
  // up and down, from as far as puts P.half either side of P.fit's depth on screen
  function portraitView(P, aspect) {
    const th = THREE.MathUtils.degToRad(P.pitch), fwd = new THREE.Vector3(0, -Math.sin(th), -Math.cos(th));
    const tanH = Math.tan(THREE.MathUtils.degToRad(P.fov / 2)) * aspect;
    const at = new THREE.Vector3(...P.at), fit = new THREE.Vector3(...P.fit);
    const D = P.half / tanH - fit.clone().sub(at).dot(fwd);
    const eye = at.clone().addScaledVector(fwd, -D);
    // looking down more if its top would be over the backdrop's top edge
    const half = THREE.MathUtils.degToRad(P.fov / 2);
    const up = Math.atan2(BACKDROP_TOP.y - eye.y, eye.z - BACKDROP_TOP.z), pitch = Math.max(th, half - up);
    return { eye, at: eye.clone().add(new THREE.Vector3(0, -Math.sin(pitch), -Math.cos(pitch))), fov: P.fov };
  }

  api.idle();
  return api;
}
