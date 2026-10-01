// Clear Cut Challenge in the minigames shell (main.js): the scene and its
// cameras, the tap to cut, its HUD (the log's sign, the points) and its
// online messages ("cut"). The rules are in rules.js, the round in game.js.
import * as THREE from "three";
import { loadAssets } from "./assets.js";
import { Game, LANE, onLayer } from "./game.js";
import * as R from "./rules.js";

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

export async function create(shell, onProgress) {
  const assets = await loadAssets("assets/clearcut/", onProgress);
  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 0.7 * Math.PI));
  const sun = new THREE.DirectionalLight(0xffffff, 0.42 * Math.PI);
  sun.position.set(-1.5, 3, 4);
  scene.add(sun);
  scene.add(backdrop(assets.backdrop));
  const game = new Game(scene, assets);
  // each lane on its own layer, so a lane's view can leave the others out
  game.lanes.forEach((l, i) => { for (const o of [l.scyther.root, l.log, l.spinarak, l.sign.root, l.slash, l.stars.root]) onLayer(o, i); });

  // ---- its HUD: the log's sign on Spinarak's thread, and the points ----
  const hud = document.createElement("div");
  hud.className = "game-hud";
  hud.innerHTML = `<div class="cc-screen"><div class="cc-sign"><i class="thread"></i><img class="spin" alt=""><img class="cut" alt=""></div></div>`;
  shell.hud.append(hud);
  const screen = hud.querySelector(".cc-screen"), sign = hud.querySelector(".cc-sign");
  const popups = [0, 1, 2, 3].map(() => { const d = document.createElement("div"); d.className = "cc-points"; d.hidden = true; hud.append(d); return d; });
  const flashes = [0, 1, 2, 3].map(() => { const d = document.createElement("img"); d.className = "cc-flash"; d.src = "assets/clearcut/flash.png"; d.hidden = true; hud.append(d); return d; });

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
    setTimeout(() => { if (game.state === "play" && lastLogSound === n) shell.music("hang"); }, 1000); // song 18, 30 frames in
  });
  game.on("cry", (z) => shell.sound("ready", z)); // (0x1F0A: Scyther getting ready, and lowering its scythes after a log)
  game.on("hanging", (z) => { if (mine(z)) shell.sound("hanging"); });
  game.on("swing", (z, c) => {
    shell.sound(c.kind === "perfect" ? "perfect" : "cut", z);
    if (mine(z)) { shell.haptic(c.kind === "perfect" ? "heavy" : "medium"); shell.flash(z, "bump"); }
    if (c.kind === "perfect") showFlash(z, c);
  });
  game.on("whiff", (z) => { shell.sound("whiff", z); if (mine(z)) shell.haptic("light"); });
  game.on("verdict", (z, n) => { // the crowd, for the best cut of the log (0x86509834)
    if (z !== shell.me()) return;
    shell.stopSound("hanging");
    if (lastVerdict === n) return;
    lastVerdict = n;
    const pts = game.players.map((p) => p.cuts[n]?.pts ?? 0);
    if (pts.some((x) => x === 20)) shell.sound("allPerfect");
    else if (pts.some((x) => x > 0)) shell.sound("allScored");
  });
  game.on("show", (z, n) => {
    if (z === shell.me() && lastShow !== n) { lastShow = n; shell.music("show", 0, true); } // song 19
  });
  game.on("tallied", (z) => shell.sound("tallied", z));
  game.on("cut", (m) => shell.send("cut", m));

  function showFlash(z, c) {
    const f = flashes[z];
    f.hidden = false;
    f.dataset.at = String(game.time);
    f.style.animation = "none";
    void f.offsetWidth;
    f.style.animation = "";
  }

  let views = [];
  let portrait = false;
  const api = {
    game, scene, assets,
    get views() { return views; },
    get shake() { return game.shake * 40; },
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
        const LANE_VIEW = { width: 330, bottom: -200, top: 440 };
        const MINI = { width: 250, bottom: -90, top: 400 };
        const cams = views.length === 4 ? views.map((v) => v.cam) : [0, 1, 2, 3].map(() => new THREE.PerspectiveCamera(CAM.fov, 1, 100, 12800));
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
      game.reset(round.level, round.seed, { me: round.me, control: round.control,
                                            c: m?.c, scores: m?.scores, cuts: m?.cuts });
      lastLogSound = lastVerdict = lastShow = -1;
      quiet();
      for (const d of popups) d.hidden = true;
      for (const f of flashes) f.hidden = true;
      sign.hidden = true;
    },
    idle() { game.reset(game.level || "normal"); game.state = "idle"; quiet(); sign.hidden = true; for (const d of popups) d.hidden = true; },
    go() { game.start(); },
    finish() { quiet(); shell.sound("finish"); shell.music(null, 40); },
    stop() { game.stop(); quiet(); },
    setControl(z, c) { game.setControl(z, c); },
    get state() { return game.state; },
    get time() { return game.time; },
    step(dt) { game.update(dt); },
    animate() {},
    score(i) { return game.players[i].shown; },
    setScores(scores) { scores.forEach((e, i) => { game.players[i].total = game.players[i].shown = e; }); },
    celebrate() { return game.celebrate(); },
    hud() { drawSign(); drawPoints(); },
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

  // A log's points, over its lane once its pieces are up on the signpost,
  // going down to the card (0x86505324: from where it was cut, 10 a frame).
  const tmp = new THREE.Vector3();
  function drawPoints() {
    for (let z = 0; z < 4; z++) {
      const d = popups[z], f = flashes[z];
      if (!f.hidden && game.time - +f.dataset.at > 0.6) f.hidden = true;
      if (game.state !== "play") { d.hidden = true; continue; }
      const fr = game.time * R.FPS, at = game.logAt(fr), c = at && game.players[z].cuts[at.n];
      const sk = at ? fr - at.t.judged : -1;
      if (!c || sk < 78 || sk > 78 + 45) { d.hidden = true; continue; } // (down to the card, then gone)
      const view = views.find((v) => v.zone === z) || views.find((v) => v.zone === undefined);
      if (!view) { d.hidden = true; continue; }
      const y = -100 + 27 + (c.at !== null && c.kind !== "miss" && c.kind !== "none" ? R.TOP - c.at : R.LENGTH / 2);
      tmp.set(LANE[z], y - Math.min(1, (sk - 78) / 20) * (y + 170), 60).project(view.cam);
      d.hidden = tmp.z > 1;
      const html = shell.bigDigits(c.pts, true);
      if (d.dataset.html !== html) { d.innerHTML = html; d.dataset.html = html; }
      d.className = "cc-points" + (c.pts < 0 ? " lost" : c.pts === 20 ? " perfect" : "") + (view.mini ? " mini" : "");
      d.style.left = view.x + ((tmp.x + 1) / 2) * view.w + "px";
      d.style.top = view.y + ((1 - tmp.y) / 2) * view.h + "px";
    }
    // a perfect cut's flash, at the blade
    for (let z = 0; z < 4; z++) {
      const f = flashes[z];
      if (f.hidden) continue;
      const view = views.find((v) => v.zone === z) || views.find((v) => v.zone === undefined);
      if (!view) continue;
      tmp.set(LANE[z], R.TOP, 60).project(view.cam);
      f.style.left = view.x + ((tmp.x + 1) / 2) * view.w + "px";
      f.style.top = view.y + ((1 - tmp.y) / 2) * view.h + "px";
      f.classList.toggle("mini", !!view.mini);
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
