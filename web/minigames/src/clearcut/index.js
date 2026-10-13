// Clear Cut Challenge in the minigames shell (main.js): the scene and its
// cameras, the tap to cut, its HUD (the log's sign, the points) and its
// online messages ("cut"). The rules are in rules.js, the round in game.js.
import * as THREE from "three";
import { loadAssets } from "./assets.js";
import { Game, LANE, HUD, BURST } from "./game.js";
import * as R from "./rules.js";
import { meMark } from "../mark.js";
import { tintURL } from "../tint.js";

export const SOUNDS = {
  url: "assets/clearcut/sound.bin",
  standIns: {
    cut: (tone, noise) => { noise(0, 0.12, { vol: 0.4, filter: "highpass", freq: 2500 }); tone(220, 0, 0.1, { type: "triangle", vol: 0.2, to: 110 }); },
    perfect: (tone) => [1319, 1760, 2637].forEach((f, i) => tone(f, i * 0.07, 0.14, { vol: 0.09 })),
    whiff: (tone, noise) => noise(0, 0.25, { vol: 0.25, filter: "bandpass", freq: 1200 }),
    tallied: (tone) => tone(1568, 0, 0.08, { vol: 0.06 }),
  },
};

// The game's camera (0x86505858): 45 degrees up and down, from (0, 110, 760)
// looking straight ahead, on a 320 x 240 screen; the background picture (15)
// fills that screen behind the scene.
const CAM = { fov: 45, y: 110, z: 760, aspect: 4 / 3 };
const BACK_Z = -80; // the picture, as a plane just behind the logs (its fence row is the ground)
const T45 = Math.tan(THREE.MathUtils.degToRad(CAM.fov / 2));
// the arrow at your Scyther: under its feet, pointing up (over it is where
// its log comes down, and is cut)
const FEET = -4;
// The HUD's points are on the game's 320 x 240 screen; here a point of it is
// put in the scene where the game's camera sees it, at z 150 (where the
// sparkles round a perfect cut's points are), and drawn where each view sees
// that: so on the game's screen (landscape) where the game has them, and in a
// lane's own view (portrait) over its lane.
const SCREEN_Z = 150, SCREEN_K = ((CAM.z - SCREEN_Z) * T45) / 120; // (the scene's units a pixel of the game's screen there)
// the points' colours (0x8650C680: prim, then env): 1P-4P's, a loss's, a perfect cut's
const COLOURS = [[[0, 0, 155], [170, 245, 255]], [[0, 100, 0], [200, 255, 155]], [[120, 0, 0], [255, 160, 190]],
  [[210, 90, 0], [255, 255, 140]], [[20, 0, 40], [160, 120, 255]], [[200, 0, 0], [255, 255, 0]]];

export async function create(shell, onProgress) {
  const assets = await loadAssets("assets/clearcut/", onProgress);
  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 0.7 * Math.PI));
  const sun = new THREE.DirectionalLight(0xffffff, 0.42 * Math.PI);
  sun.position.set(-1.5, 3, 4);
  scene.add(sun);
  scene.add(backdrop(assets.backdrop));
  const game = new Game(scene, assets); // (each lane on its own layer, so a lane's view can leave the others out: game.js)

  // ---- its HUD: the log's sign on Spinarak's thread, and the points ----
  const hud = document.createElement("div");
  hud.className = "game-hud";
  hud.innerHTML = `<div class="cc-screen"><div class="cc-sign"><i class="thread"></i><img class="spin" alt=""><img class="cut" alt=""></div></div>`;
  shell.hud.append(hud);
  const screen = hud.querySelector(".cc-screen"), sign = hud.querySelector(".cc-sign");
  const el = (cls, html = "") => { const d = document.createElement("div"); d.className = cls; d.hidden = true; d.innerHTML = html; hud.append(d); return d; };
  // a perfect cut's burst (bank 398) behind its points: two of its colours, the next fading in
  const bursts = [0, 1, 2, 3].map(() => el("cc-burst", "<img alt=''><img alt=''>"));
  const popups = [0, 1, 2, 3].map(() => el("cc-points"));
  const mark = meMark(hud, shell.me, { below: true }), under = new THREE.Vector3();
  // bank 429's digits and minus in each set of colours (src/tint.js: the
  // combiner FC30B261 5566FF7F, (prim - env) x the texel + env), and the
  // burst in each of its ten
  const pics = COLOURS.map(() => ({}));
  COLOURS.forEach(([prim, env], k) => {
    for (const ch of "0123456789-") {
      const url = `assets/ui/${ch === "-" ? "minus" : "big" + ch}.png`;
      tintURL(url, prim, env).then((u) => { pics[k][ch] = u; }, () => {});
    }
  });
  const burstPics = [];
  BURST.prim.forEach((prim, i) => tintURL("assets/clearcut/flash.png", prim, [255, 255, 255]).then((u) => { burstPics[i] = u; }, () => {}));

  // ---- sounds and the like, from the round ----
  // The crowd's sounds go on until they're stopped (their scripts repeat one
  // long note): 0x1005 while a log hangs (the game asks for it every frame from
  // the log hanging ready to 50 frames after its drop, and it stops when the
  // asking does), and on one channel of their own, 0x1B06 as each log comes up
  // and then the crowd's reaction to the cuts (0x1C07-0x1E09), each taking over
  // from the last. The game never stops that one in the round (it stops every
  // sound as it leaves the minigame); here it stops at the finish.
  const quiet = () => shell.stopSound();
  const mine = (z) => z === shell.me();
  let lastLogSound = -1, lastVerdict = -1, lastShow = -1;
  game.on("log", (z, n) => {
    if (z !== shell.me() || lastLogSound === n) return;
    lastLogSound = n;
    shell.sound("next"); // 0x1B06
  });
  game.on("hang", () => shell.music("hang")); // song 18, 30 frames into the log's sign (game.js)
  game.on("cry", (z) => shell.sound("ready", z)); // (0x1F0A: Scyther getting ready, and lowering its scythes after a log)
  game.on("pinsir", (z) => shell.sound("pinsir", z)); // (0x1F04)
  game.on("hanging", (z) => { if (mine(z)) shell.sound("hanging"); });
  game.on("swing", (z, c) => {
    shell.sound(c.kind === "perfect" ? "perfect" : "cut", z);
    if (mine(z)) { shell.haptic(c.kind === "perfect" ? "heavy" : "medium"); shell.flash(z, "bump"); }
  });
  game.on("whiff", (z) => { shell.sound("whiff", z); if (mine(z)) shell.haptic("light"); });
  game.on("verdict", (z, n) => { // the crowd, for the best cut of the log (0x86509830)
    if (z !== shell.me()) return;
    shell.stopSound("hanging");
    if (lastVerdict === n) return;
    lastVerdict = n;
    // (a cut's points are kept for this even when it's late: +8, set before the late cut's loss, 0x86503374)
    const cuts = game.players.map((p) => p.cuts[n]);
    if (cuts.some((c) => c?.kind === "perfect")) shell.sound("allPerfect");
    else if (cuts.some((c) => c && (c.kind === "early" || c.kind === "late"))) shell.sound("allScored");
  });
  game.on("show", (z, n) => {
    if (z === shell.me() && lastShow !== n) { lastShow = n; shell.music("show", 0, true); } // song 19
  });
  game.on("tallied", (z) => shell.sound("tallied", z)); // (0x1F0B: each player's points in, every log)
  game.on("cut", (m) => shell.send("cut", m));

  // Each seat's Pokemon is its Game Pak's in the game (Scyther without one,
  // game.js); the remake has none, so it's Scyther, unless a test asks
  // (?debug&species=127,123,212,123: Pinsir, Scyther, Scizor)
  const query = new URLSearchParams(location.search);
  const species = query.has("debug") && query.get("species") ? query.get("species").split(",").map(Number) : undefined;

  let views = [], portraitCams = null;
  let portrait = false;
  const api = {
    game, scene, assets,
    get views() { return views; },
    label: null,

    layout(W, H, safe, me, cards, frames) {
      portrait = W / H < 1.1;
      if (!portrait) {
        const cam = views.find((v) => v.zone === undefined)?.cam || new THREE.PerspectiveCamera(CAM.fov, 1, 100, 12800);
        views = [{ cam, x: 0, y: 0, w: W, h: H, shakeScale: 1 }];
        gameCamera(views[0]);
        // under each Scyther, on the curtain's hem
        for (let i = 0; i < 4; i++) {
          const p = new THREE.Vector3(LANE[i], -150, 0).project(cam);
          shell.place(cards[i], { left: ((p.x + 1) / 2) * W + "px", top: Math.min(((1 - p.y) / 2) * H, safe.bottom - 64) + "px", transform: "translateX(-50%)" });
          cards[i].classList.remove("mini");
        }
      } else {
        // your lane big (and what's in the picture of the lanes by it), the others in small boxes along the top
        // (the seats there: an empty seat's lane, online with the CPUs off, gets none)
        const LANE_VIEW = { width: 330, bottom: -200, top: 440 };
        const MINI = { width: 250, bottom: -90, top: 400 };
        const cams = (portraitCams ||= [0, 1, 2, 3].map(() => new THREE.PerspectiveCamera(CAM.fov, 1, 100, 12800)));
        views = shell.miniViews(W, H, safe, me, cams, MINI.width / (MINI.top - MINI.bottom), LANE_VIEW, MINI);
        for (const v of views) laneCamera(v);
        shell.frameMinis(views, cards, frames);
        shell.place(cards[me], { left: safe.left + 8 + "px", top: views[0].y + 8 + "px" });
      }
      // the game's 320 x 240 screen, for the sign: the main view's picture area
      const v = views[0];
      const screenRect = portrait ? { left: v.x, top: v.y, width: v.w, height: v.w * 0.75 } : fitScreen(W, H);
      Object.assign(screen.style, { left: screenRect.left + "px", top: screenRect.top + "px", width: screenRect.width + "px", height: screenRect.height + "px" });
      screen.style.setProperty("--k", screenRect.width / 320);
      return portrait;
    },

    reset(round) {
      const m = round.start;
      game.reset(round.level, round.seed, { me: round.me, control: round.control, empty: round.empty,
                                            c: m?.c, scores: m?.scores, cuts: m?.cuts, species: round.species ?? species });
      lastLogSound = lastVerdict = lastShow = -1;
      quiet();
      for (const d of [...popups, ...bursts]) d.hidden = true;
      sign.hidden = true;
    },
    idle() { game.reset(game.level || "normal"); game.state = "idle"; quiet(); sign.hidden = true; for (const d of [...popups, ...bursts]) d.hidden = true; },
    go() { game.start(); },
    // (no whistle and no fade: the game's last show leads straight to the
    // results, 0x86502B88, and song 19 plays on till theirs takes over)
    finish() { quiet(); },
    stop() { game.stop(); quiet(); },
    setControl(z, c) { game.setControl(z, c); },
    get state() { return game.state; },
    get time() { return game.time; },
    step(dt) { game.update(dt); },
    animate() {},
    score(i) { return game.players[i].shown; },
    setScores(scores) { scores.forEach((e, i) => { game.players[i].total = game.players[i].shown = e; }); },
    celebrate() { return game.celebrate(); },
    hud() {
      drawSign();
      drawPoints();
      // which Scyther is yours (the four look the same): in the big view
      const on = game.state === "play" || game.state === "over";
      mark.place(on && views[0], under.copy(game.lanes[shell.me()].scyther.root.position).setY(FEET));
    },
    remote(t, m) { if (t === "cut") game.told(m.s, m.n, { f: m.f, p: m.p, e: m.e, a: !!m.a }); },

    // A: a tap anywhere, or Space
    pointerdown() { game.press(); },
    keydown(e) {
      if (!["Space", "Enter", "KeyA", "KeyZ", "KeyX", "ArrowDown", "ArrowUp"].includes(e.code)) return false;
      if (!e.repeat) game.press();
      return true;
    },
    debug: { cut: () => game.press() },
  };

  // ---- the HUD, each frame ----
  // The sign: Spinarak comes down its thread with "1st CUT" ... "FINAL CUT" as
  // each log comes up (0x8650952C: from y -70 to 20 on the 320 x 240 screen
  // at 2 a frame, a pause of 16, back up at 4; Spinarak at x 140, the sign at
  // x 120, 31 under it).
  function drawSign() {
    if (game.state !== "play") { sign.hidden = true; return; }
    const fr = game.time * R.FPS, at = game.logAt(fr);
    if (!at) { sign.hidden = true; return; }
    const k = fr - at.t.start;
    let y = null;
    if (k < 45) y = -70 + 2 * k;
    else if (k < 61) y = 20;
    else if (k < 84) y = 20 - 4 * (k - 61);
    sign.hidden = y === null;
    if (y === null) return;
    const cut = sign.querySelector(".cut"), spin = sign.querySelector(".spin");
    const want = `assets/clearcut/cut${at.n + 1}.png`;
    if (cut.getAttribute("src") !== want) cut.src = want;
    const frame = `assets/clearcut/spinarak${[0, 1, 2, 1][Math.floor(fr / 6) % 4]}.png`;
    if (spin.getAttribute("src") !== frame) spin.src = frame;
    sign.style.transform = `translateY(calc(${y}px * var(--k)))`;
  }

  // A log's points, from where it was cut on the signpost down to the card,
  // in bank 429's digits in the player's colours (a loss's purple, a perfect
  // cut's red and yellow, and no "+": 0x86506E78), and a perfect cut's burst
  // behind them (0x86506B2C), as game.pointsAt() has them for the moment drawn.
  const tmp = new THREE.Vector3(), at0 = { x: 0, y: 0, z: 0 }, at1 = { x: 0, y: 0, z: 0 };
  // a point of the game's screen as view v draws it (x, y on the page; z > 1: behind the camera)
  function onScreen(v, gx, gy, out) {
    tmp.set((gx - 160) * SCREEN_K, CAM.y - (gy - 120) * SCREEN_K, SCREEN_Z).project(v.cam);
    out.x = v.x + ((tmp.x + 1) / 2) * v.w;
    out.y = v.y + ((1 - tmp.y) / 2) * v.h;
    out.z = tmp.z;
    return out;
  }
  function drawPoints() {
    const fr = game.time * R.FPS;
    for (let z = 0; z < 4; z++) {
      const d = popups[z], b = bursts[z], pts = game.pointsAt(z, fr);
      const view = views.find((v) => v.zone === z) || views.find((v) => v.zone === undefined);
      const text = pts ? String(pts.pts) : "", key = text + "/" + pts?.colours;
      if (!pts || !view || ![...text].every((ch) => pics[pts.colours][ch])) { d.hidden = b.hidden = true; continue; }
      onScreen(view, pts.x, pts.y, at0);
      const s = Math.abs(onScreen(view, pts.x + 1, pts.y, at1).x - at0.x); // (the page's pixels a pixel of the game's screen)
      d.hidden = at0.z > 1;
      if (d.dataset.key !== key) {
        const places = HUD.places[text.length];
        d.innerHTML = [...text].map((ch, k) => `<img src="${pics[pts.colours][ch]}" style="left: calc(var(--s) * ${places[k]}px)" alt="${ch}">`).join("");
        d.dataset.key = key;
      }
      d.style.setProperty("--s", s);
      d.style.transform = `translate(${at0.x}px, ${at0.y}px)`;
      // the burst: its scale and colour the next of its ten each frame, between them here
      b.hidden = d.hidden || !pts.burst || !burstPics[0];
      if (b.hidden) continue;
      const k = pts.burst.k, i0 = Math.floor(k) % BURST.scale.length, i1 = (i0 + 1) % BURST.scale.length, part = k - Math.floor(k);
      const sc = BURST.scale[i0] + (BURST.scale[i1] - BURST.scale[i0]) * part, [w, h] = BURST.size;
      const [a, c] = b.children;
      if (a.getAttribute("src") !== burstPics[i0]) a.src = burstPics[i0];
      if (c.getAttribute("src") !== burstPics[i1]) c.src = burstPics[i1];
      c.style.opacity = part;
      onScreen(view, pts.x + BURST.at[0] + (w * (BURST.box - sc)) / 2, pts.y + BURST.at[1] + (h * (BURST.box - sc)) / 2, at1);
      b.style.transform = `translate(${at1.x}px, ${at1.y}px)`;
      b.style.width = w * sc * s + "px";
      b.style.height = h * sc * s + "px";
    }
  }

  api.idle();
  return api;
}

// The game's screen fitted in W x H: whole and centred (a wider window shows
// more at the sides, a narrower one crops the top and bottom).
function fitScreen(W, H) {
  if (W / H >= CAM.aspect) return { left: (W - H * CAM.aspect) / 2, top: 0, width: H * CAM.aspect, height: H };
  return { left: 0, top: (H - W / CAM.aspect) / 2, width: W, height: W / CAM.aspect };
}

function gameCamera(v) {
  const cam = v.cam, aspect = v.w / v.h;
  cam.aspect = aspect;
  // as wide as the game's screen at least: narrower windows get a wider lens
  cam.fov = aspect >= CAM.aspect ? CAM.fov : THREE.MathUtils.radToDeg(2 * Math.atan(T45 * CAM.aspect / aspect));
  cam.layers.enableAll();
  v.base = new THREE.Vector3(0, CAM.y, CAM.z);
  cam.position.copy(v.base);
  cam.lookAt(0, CAM.y, 0);
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld(); // (for project(), before it's rendered)
}

// a lane's view: [width] x [bottom, top] around it, the camera straight on
// like the game's. The big one shows every lane in the picture (the ones next
// to it, at its edges), as the game's screen does; a small box only its own.
function laneCamera(v) {
  const cam = v.cam, aspect = v.w / v.h;
  cam.aspect = aspect;
  cam.fov = CAM.fov;
  const d = Math.max((v.top - v.bottom) / 2 / T45, v.width / 2 / (T45 * aspect));
  const cx = LANE[v.zone], cy = (v.top + v.bottom) / 2;
  if (!v.mini) cam.layers.enableAll();
  else { cam.layers.set(0); cam.layers.enable(v.zone + 1); }
  v.base = new THREE.Vector3(cx, cy, d);
  cam.position.copy(v.base);
  cam.lookAt(cx, cy, 0);
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld();
}

// Background picture 15 on a plane that fills the game's camera exactly; past
// its sides it carries on mirrored, for wider screens.
function backdrop(tex) {
  const h = 2 * (CAM.z - BACK_Z) * T45, w = h * CAM.aspect;
  tex.wrapS = THREE.MirroredRepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  const geo = new THREE.PlaneGeometry(w * 3, h * 1.6);
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 3 - 1, uv.getY(i) * 1.6 - 0.3);
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, depthWrite: false }));
  mesh.position.set(0, CAM.y, BACK_Z);
  mesh.renderOrder = -1;
  return mesh;
}
