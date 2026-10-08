// Streaming Stampede in the minigames shell (main.js): the studio and its
// camera, the taps (count), its HUD (the question board, "Let's count ...",
// "Stop!", the answer, the counts) and its online messages ("count", "ans").
// The rules are in rules.js, the game in game.js.
import * as THREE from "three";
import { loadAssets } from "./assets.js";
import { Game, BOOTH_X } from "./game.js";
import * as R from "./rules.js";
import { meMark } from "../mark.js";

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
// (0, h, 0), on a 320 x 240 screen. Preset 1 is the game's view, preset 2 the
// results' (the last answer eases to it). Preset 0, the opening close-up, isn't used here.
const PRESETS = [[1110, -0.48, 100, 15.3996], [1030, -0.17, -40, 23.8997], [890, -0.42, 140, 24.9996]];
const ASPECT = 4 / 3;
const BACKDROP_TOP = { y: 357, z: -99 }; // the circus backdrop's top edge (object 117)
// the question board (UI layout 133) and its cards (127-131), on the game's
// 640 x 480 layout grid: the panel, and where each thing on it goes
// the board's panel (x, width, top, bottom): the game's (UI layout 133), and in
// portrait a narrower one round the cards' words, so they can be bigger
const BOARD = {
  // (the last answer's, in the results' view, at the top: the booths are lower down then)
  game: { ask: { x: 82, w: 477, top: 113, bottom: 426 }, tell: { x: 82, w: 477, top: 236, bottom: 352 },
          tellLast: { x: 82, w: 477, top: 150, bottom: 266 }, chain: 713 },
  narrow: { ask: { x: 166, w: 308, top: 138, bottom: 340 }, tell: { x: 166, w: 308, top: 236, bottom: 352 },
            tellLast: { x: 166, w: 308, top: 236, bottom: 352 }, chain: 70 },
};
const CARD = (x, y) => ({ x: 160 + x, y: 120 + y }); // (the cards' 320 x 240 grid is centred on the board's)
const BOXES = { 1: [134], 2: [95, 173], 3: [56, 134, 212] };
// the answer's panel (made for the remake, lower and smaller than the question's,
// so the counts on the booths stay in sight): its top, and its words' and digits' rows
const TELL = { words: 16, answer: 60 }; // (its rows, down from its top)
const HEAD = 62; // the arrow over your Cleffa or Igglybuff (about 55 tall), in its booth

export async function create(shell, onProgress) {
  const assets = await loadAssets("assets/stampede/", onProgress);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x14101c);
  // the game's lights: an ambient 0x646464 and two lights fixed to the camera (0x869000D0, 0x86900138)
  scene.add(new THREE.AmbientLight(0xffffff, 0.62 * Math.PI));
  const sun = new THREE.DirectionalLight(0xffffff, 0.45 * Math.PI);
  sun.position.set(0.2, 1, 1.4);
  scene.add(sun);
  // past the studio's own edges (wider or taller screens than the game's):
  // more of its floor (the ramp's own texture, 75 units a repeat, lit the
  // same), and a dark wall
  let floorMat = null;
  assets.ramp.traverse((o) => { if (o.isMesh && /_tex00$/.test(o.material.name)) floorMat = o.material; });
  const more = floorMat ? floorMat.clone() : new THREE.MeshLambertMaterial({ color: 0x9494a4 });
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
      <div class="ss-board" hidden>
        <i class="chain left"></i><i class="chain right"></i>
        <div class="rod top"></div><div class="rod bottom"></div>
        <div class="ss-panel"></div><img class="btn" src="${A}button_a.png" alt="">
        <div class="ss-card ask">
          <img class="q" src="${A}w17.png" alt="Question"><img class="qn" alt=""><img class="last" src="${A}w08.png" alt="Last Question">
          <img class="pts" src="${A}w12.png" alt="pts. for perfect"><img class="ptsn" alt="">
          <div class="boxes"></div>
          <img class="press" src="${A}w06.png" alt="Press the A Button to count!">
        </div>
        <div class="ss-card tell">
          <img class="who" src="${A}w05.png" alt="Who is correct?">
          <img class="is" src="${A}w04.png" alt="The answer is ...">
          <div class="answer"></div>
        </div>
      </div>
      <img class="ss-lets" src="${A}w18.png" alt="Let's count ..." hidden>
      <img class="ss-stop" src="${A}w19.png" alt="Stop!" hidden>
    </div>
    <div class="ss-counts"></div>
    <div class="ss-pads"><div class="pad ss-count" data-pad="a"><img src="${A}button_a.png" alt="A">Count</div></div>`.replace(/calc\((\d+)u\)/g, "calc($1 * var(--u))");
  shell.hud.append(hud);
  const screen = hud.querySelector(".ss-screen"), board = hud.querySelector(".ss-board");
  const ask = board.querySelector(".ask"), tell = board.querySelector(".tell");
  const lets = hud.querySelector(".ss-lets"), stop = hud.querySelector(".ss-stop"), pad = hud.querySelector(".ss-count");
  const mark = meMark(hud, shell.me), over = new THREE.Vector3();
  const countBoxes = [0, 1, 2, 3].map(() => {
    const d = hud.querySelector(".ss-counts").appendChild(document.createElement("div"));
    d.hidden = true;
    return d;
  });
  const at = (el, x, y) => { el.style.left = `calc(${x} * var(--u))`; el.style.top = `calc(${y} * var(--u))`; };

  // the question's card: "Question n" (or "Last Question"), its points for a
  // perfect count, a box with the icon and the name of each kind to count (or
  // the last question's "ALL"), and "Press the A Button to count!" (0x86907614)
  function fillCard(q) {
    const Q = game.qs[q], last = q === R.QUESTIONS - 1;
    ask.querySelector(".q").hidden = ask.querySelector(".qn").hidden = last;
    ask.querySelector(".last").hidden = !last;
    if (!last) ask.querySelector(".qn").src = `${A}w${13 + q}.png`;
    ask.querySelector(".ptsn").src = `${A}w${String([9, 9, 10, 10, 11][q]).padStart(2, "0")}.png`;
    at(ask.querySelector(".q"), CARD(93, 29).x, CARD(93, 29).y);
    at(ask.querySelector(".qn"), CARD(205, 29).x, CARD(205, 29).y);
    at(ask.querySelector(".last"), CARD(64, 29).x, CARD(64, 29).y);
    at(ask.querySelector(".pts"), CARD(80, 57).x, CARD(80, 57).y);
    at(ask.querySelector(".ptsn"), CARD(88, 57).x, CARD(88, 57).y);
    at(ask.querySelector(".press"), CARD(72, 185).x, CARD(72, 185).y);
    const boxes = ask.querySelector(".boxes");
    if (last) {
      boxes.innerHTML = `<div class="box wide"><img src="${A}all.png" alt="ALL"></div><img class="name" src="${A}name00.png" alt="ALL">`;
      at(boxes.children[0], CARD(114, 105).x, CARD(114, 105).y);
      at(boxes.children[1], CARD(114 + 10, 159).x, CARD(114 + 10, 159).y);
      return;
    }
    const what = Q.what, xs = BOXES[what.length];
    boxes.innerHTML = what.map((kind) => `<div class="box"><img src="${A}icon${R.DEX[kind]}.png" alt=""></div>` +
      `<img class="name" src="${A}name${String(R.NAME[kind]).padStart(2, "0")}.png" alt="${R.KINDS[kind].name}">`).join("");
    what.forEach((kind, n) => {
      at(boxes.children[2 * n], CARD(xs[n], 105).x, CARD(xs[n], 105).y);
      at(boxes.children[2 * n + 1], CARD(xs[n] - 10.5, 159).x, CARD(xs[n] - 10.5, 159).y);
    });
  }
  // the answer: "The answer is ..." and its digits (image bank 414) with
  // "Pokemon" (UI layout 131; "Who is correct?", 126, before the last one's)
  function fillAnswer(q) {
    const digits = String(game.qs[q].answer).split("");
    const ans = tell.querySelector(".answer"), top = shape[q === R.QUESTIONS - 1 ? "tellLast" : "tell"].top;
    ans.innerHTML = digits.map((d) => `<img src="${A}a${d}.png" alt="${d}">`).join("") + `<img class="pk" src="${A}w02.png" alt="Pokémon">`;
    // (laid out here: the digits, then "Pokemon", centred on the board)
    const width = digits.length * 32 + 6 + 56;
    let x = 320 - width / 2;
    ans.querySelectorAll("img").forEach((img) => {
      const pk = img.classList.contains("pk");
      at(img, pk ? x + 6 : x, top + (pk ? TELL.answer + 2 : TELL.answer));
      x += 32;
    });
    at(tell.querySelector(".who"), 320 - 84, top + TELL.words);
    at(tell.querySelector(".is"), 320 - 64, top + TELL.words);
  }

  // ---- sounds and the like, from the game ----
  const mine = (z) => z === shell.me();
  game.on("card", (q) => {
    shell.stopSound("someRight"); shell.stopSound("allScored"); // (the crowd's asked for till the answer's over)
    shell.sound(q === R.QUESTIONS - 1 ? "lastCard" : "card"); // (0x3F0B, 0x3F07)
    if (q === 0) shell.music("main"); // song 30, from the first card on
    fillCard(q);
  });
  game.on("cardOn", () => shell.sound("cardOn")); // (0x3F03)
  game.on("count", (z) => {
    shell.sound("press", z); // (0x3F02, panned to the player)
    if (mine(z)) { shell.haptic("light"); pad.classList.add("on"); setTimeout(() => pad.classList.remove("on"), 90); }
  });
  game.on("press", (m) => shell.send("count", m));
  game.on("stop", () => { shell.sound("stop"); shell.haptic("medium"); }); // (0x3F08)
  game.on("reveal", (q) => fillAnswer(q));
  game.on("drum", () => shell.sound("drum")); // (0x3000)
  game.on("answer", (q) => {
    shell.sound("answer"); // (0x3F01)
    if (q === R.QUESTIONS - 1) shell.music("reveal", 0, true); // song 32
  });
  game.on("results", () => shell.music("results", 0, true)); // song 31
  game.on("judged", (q, v) => {
    if (v.right) shell.sound("right"); else if (!v.scored) shell.sound("nobody"); // (0x3F05, 0x3F04)
    if (v.scored) shell.sound(q === R.QUESTIONS - 1 ? "allPerfect" : v.right ? "someRight" : "allScored"); // the crowd
    const z = shell.me();
    if (v.pts[z] > 0) { shell.haptic(v.counts[z] === game.qs[q].answer ? "success" : "medium"); shell.flash(z, "bump"); }
  });
  game.on("tally", () => shell.sound("tally")); // (0x3F06)
  game.on("tallyLast", () => { shell.sound("tallyLast"); shell.sound("rise"); }); // (0x310A, 0x3209)
  game.on("rise", () => shell.sound("rise")); // (0x3209)

  let view = null, portrait = false, frame = null, shape = BOARD.game;
  const api = {
    game, scene, assets,
    get views() { return view ? [view] : []; },
    get shake() { return 0; },
    label: null,

    layout(W, H, safe, me, cards) {
      portrait = W / H < 1.1;
      const cam = view?.cam || new THREE.PerspectiveCamera(PRESETS[1][3], 1, 50, 12800);
      view = { cam, x: 0, y: 0, w: W, h: H, shakeScale: 0 };
      aim(view, game.camK);
      // the board and the words on it: on the game's screen, or in portrait as
      // wide as the screen, its panel in the bottom third, below the stream
      shape = portrait ? BOARD.narrow : BOARD.game;
      if (portrait) {
        const B = shape.ask, u = (W - 12) / (B.w + 32);
        const top = Math.min(H * 0.62, safe.bottom - 12 - (B.bottom - B.top + 16) * u);
        frame = { left: W / 2 - (B.x + B.w / 2) * u, top: top - B.top * u, u };
      } else {
        const sw = Math.min(W, H * ASPECT), sh = sw / ASPECT;
        frame = { left: (W - sw) / 2, top: (H - sh) / 2, u: sw / 640 };
      }
      board.dataset.mode = "";
      Object.assign(screen.style, { left: frame.left + "px", top: frame.top + "px" });
      screen.style.setProperty("--u", frame.u + "px");
      // "Stop!" in the middle of the stream
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
      // whose player is away, rejoining midway, is still theirs)
      const cpus = !round.online ? [0, 1, 2, 3].map((z) => z !== round.me)
        : [0, 1, 2, 3].map((z) => !(round.lineup || []).some((p) => p.seat === z));
      game.reset(round.level, round.seed, { me: round.me, control: round.control, cpus, told: m?.ss?.told });
      shell.stopSound();
      board.hidden = lets.hidden = stop.hidden = true;
      shell.music("intro", 0, true); // song 29, the game's opening (over the countdown here)
    },
    idle() {
      game.reset(game.levelName || "normal");
      game.state = "idle";
      shell.stopSound();
      board.hidden = lets.hidden = stop.hidden = true;
    },
    go() { game.start(); },
    finish() { shell.stopSound(); shell.sound("finish"); shell.music(null, 40); },
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

  // ---- the HUD, each frame ----
  const tmp = new THREE.Vector3();
  function drawHud(on) {
    hud.classList.toggle("off", !on);
    const playing = game.state === "play" || game.state === "over";
    if (view) { aim(view, game.camK); }
    // which booth is yours (Cleffa and Igglybuff, two each): over its player, rising with it
    game.booths[shell.me()].holder.getWorldPosition(over).y += HEAD;
    mark.place(playing && view, over);
    if (!playing) {
      board.hidden = lets.hidden = stop.hidden = true;
      for (const d of countBoxes) d.hidden = true;
      pad.parentElement.hidden = true;
      return;
    }
    const { q, Q, t, f, k } = game.now, last = q === R.QUESTIONS - 1, fr = game.time * R.FPS - (game.at[q].start + t);
    const between = Math.max(0, Math.min(1, fr)); // (of a frame, for smooth slides)
    // the board: down with the question (the card, 85 frames), and with the answer
    let show = null, from = 0, to = 0;
    if (t < R.CARD) { show = "ask"; from = 0; to = R.CARD - 1; }
    else if (k >= 0) {
      if (!last && k >= 30) { show = "tell"; from = 30; to = R.ANSWER - 12; }
      if (last && k >= R.LAST_COUNTS) { show = "tell"; from = R.LAST_COUNTS; to = R.LAST_ANSWER + 30; }
    }
    board.hidden = !show;
    const mode = show === "tell" && last ? "tellLast" : show;
    if (show && board.dataset.mode !== mode) {
      board.dataset.mode = mode;
      const B = shape[mode];
      if (show === "tell") fillAnswer(q);
      for (const [k, v] of Object.entries({ x: B.x, w: B.w, top: B.top, bottom: B.bottom, chain: shape.chain })) board.style.setProperty("--" + k, v);
    }
    if (show) {
      const local = (show === "ask" ? t : k) + between;
      // (it drops in over 8 frames and goes back up over 8: made for the remake)
      const y = Math.min(0, Math.max(-1, local < from + 8 ? -1 + (local - from) / 8 : local > to - 8 ? -(local - (to - 8)) / 8 : 0));
      board.style.transform = `translateY(calc(${y * 40} * var(--u)))`;
      board.style.opacity = String(1 + y);
      ask.hidden = show !== "ask";
      tell.hidden = show !== "tell";
      if (show === "tell") {
        tell.querySelector(".who").hidden = !last || k >= R.LAST_COUNTS + 30;
        tell.querySelector(".is").hidden = last ? k < R.LAST_COUNTS + 30 : false;
        tell.querySelector(".answer").hidden = k < (last ? 29 + 180 : 60);
      }
    }
    // "Let's count ..." slides in from the right over frames 12-36 of the
    // card and out to the left over 60-84 (0x869090A0; on the 320 x 240
    // screen, x 644 to 73 to -500); here above the board
    const lt = t + between;
    lets.hidden = !(t < R.CARD && lt >= 12);
    if (!lets.hidden) {
      const x = lt < 36 ? 644 + ((73 - 644) * (lt - 12)) / 24 : lt < 60 ? 73 : 73 + ((-500 - 73) * (lt - 60)) / 24;
      lets.style.transform = `translate(calc(${x * 2 - (portrait ? 0 : 0)} * var(--u)), calc(${shape.ask.top - 62} * var(--u)))`;
    }
    // "Stop!": it pops up 50 frames after the last Pokemon's gone, to twice
    // its size over 10 frames, and shrinks away 20-30 frames into the answer (0x8690DC88)
    let s = 0;
    const tail = f - (Q.last + 1) + between;
    if (k < 0 && tail >= R.STOP) s = 2.00658 * Math.sin((Math.min(10, tail - R.STOP) * 9 * Math.PI) / 180);
    else if (k >= 0 && k < 20) s = 2.0526;
    else if (k >= 20 && k < 30) s = 0.6842 * (3 - 3 * Math.sin(((k + between - 20) * 9 * Math.PI) / 180));
    stop.hidden = s <= 0.01;
    if (!stop.hidden) stop.style.transform = `translate(-50%, -50%) scale(${s})`;
    // the counts at the answer, bigger, over each booth's screen (they're on
    // the screens too, but small on a phone)
    const counts = last ? k >= R.LAST_COUNTS && k < R.LAST_JUDGED : k >= 0 && k < R.JUDGED;
    for (let z = 0; z < 4; z++) {
      const d = countBoxes[z];
      d.hidden = !counts || !portrait || !view;
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

  // The game's camera (presets 1 and 2, k of the way from one to the other),
  // as wide as the game's screen: a wider window shows more of the studio at
  // the sides, a narrower one the same width, and more above and below.
  // Portrait (made for the remake) looks down more, so the stream fills the
  // middle of the screen, as wide at the back as the game's screen (the
  // Pokemon go at x -250, at its edge there: none goes before it's out of sight).
  const PORTRAIT = [
    { pitch: 26, at: [0, -5, 360], fov: 52, fit: [0, -10, 134], half: 248 }, // the game
    { pitch: 14, at: [0, 112, 0], fov: 46, fit: [0, 60, 0], half: 232 }, // the results
  ];
  function aim(v, k) {
    const cam = v.cam, aspect = v.w / v.h;
    cam.aspect = aspect;
    let eye, look, fov;
    if (aspect < 1.1) {
      const [a, b] = PORTRAIT.map((P) => portraitView(P, aspect));
      eye = a.eye.lerp(b.eye, k);
      look = a.at.lerp(b.at, k);
      fov = a.fov + (b.fov - a.fov) * k;
    } else {
      const [d, a, h, f] = PRESETS[1].map((x, n) => x + (PRESETS[2][n] - x) * k);
      eye = new THREE.Vector3(0, d * Math.sin(a) + 400 + h, d * Math.cos(a));
      look = new THREE.Vector3(0, h, 0);
      fov = aspect >= ASPECT ? f : THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(f / 2)) * ASPECT / aspect));
    }
    cam.fov = fov;
    v.base = eye;
    cam.position.copy(eye);
    cam.lookAt(look);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
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
