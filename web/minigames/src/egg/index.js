// Egg Emergency in the minigames shell (main.js): its scene and cameras, the
// lean controls, its bits of HUD, and its online messages ("lean", "ev").
// The rules are in game.js, the stage in stage.js, the effects in fx.js.
import * as THREE from "three";
import { loadAssets } from "./assets.js";
import { Game, zoneX, ZONE_W, VIEW_TOP, VIEW_BOTTOM, BACKDROP, PX } from "./game.js";
import { buildStage } from "./stage.js";
import { Effects } from "./fx.js";

// Sounds (docs/audio.md): what each is in tools/web_assets.py
export const SOUNDS = {
  url: "assets/egg/sound.bin",
  standIns: {
    catch: (tone) => { tone(988, 0, 0.06, { vol: 0.1 }); tone(1480, 0.05, 0.09, { vol: 0.1 }); },
    shock: (tone, noise) => { noise(0, 0.6, { vol: 0.7, freq: 700 }); tone(130, 0, 0.4, { type: "sine", vol: 0.6, to: 35 }); },
    splash: (tone, noise) => noise(0, 0.3, { vol: 0.25, freq: 500 }),
  },
};

// Landscape: one camera on all four players, like the game. Portrait: your
// Chansey fills the screen (with whatever of your neighbours is in the
// picture, at the edges) and the other three get small boxed views along the
// top, each framed on its own bay.
export async function create(shell, onProgress) {
  const assets = await loadAssets("assets/egg/", "assets/ui/", onProgress);
  const scene = new THREE.Scene();
  // N64-style shade = ambient + N.L x sun (x PI: three's lights are physical units);
  // surfaces facing the camera come out at about the texture's own colour
  scene.add(new THREE.AmbientLight(0xffffff, 0.7 * Math.PI));
  const sun = new THREE.DirectionalLight(0xffffff, 0.42 * Math.PI);
  sun.position.set(-1.5, 3, 4);
  scene.add(sun);
  const stage = buildStage(scene, assets);
  const fx = new Effects(scene, assets);
  const game = new Game(scene, assets, fx);

  // its HUD: the drops left, and the L / R pads
  const hud = document.createElement("div");
  hud.className = "game-hud";
  hud.innerHTML = `<div id="left"><span class="num"></span><span>left</span></div>
    <div id="pads"><div class="pad" id="padL">L</div><div class="pad" id="padR">R</div></div>`;
  shell.hud.append(hud);
  const left = hud.querySelector("#left"), padL = hud.querySelector("#padL"), padR = hud.querySelector("#padR");

  const mine = (p) => p.i === shell.me() && !shell.catchingUp();
  game.on("catch", (p) => { shell.flash(p.i, "bump"); if (mine(p)) { shell.sound("catch", p.i); shell.haptic("light"); } });
  game.on("miss", (p) => { if (mine(p)) shell.sound("splash", p.i); });
  game.on("boom", (p, lost) => { shell.flash(p.i, "hurt"); if (mine(p)) { shell.sound("shock", p.i); if (lost) shell.sound("lost", p.i); shell.haptic("heavy"); } });
  game.on("dud", (p) => { if (mine(p)) shell.sound("splash", p.i); });
  // online, what this device plays goes to the others
  // (kept while offline, and sent on reconnecting, so the server's copy of the leans stays whole)
  game.on("lean", (s, l, g) => shell.send("lean", { s, g, l }));
  game.on("result", (r) => shell.send("ev", r));

  // ---- the lean: like the game's L and R buttons, hold a side to lean, the last one pressed wins
  const held = new Map(); // pointer id or key -> -1 | 1
  let order = [];
  const hold = (id, dir) => { held.set(id, dir); order = order.filter((x) => x !== id); order.push(id); };
  const letGo = (id) => { held.delete(id); order = order.filter((x) => x !== id); };
  const lean = () => (order.length ? held.get(order[order.length - 1]) : 0);
  const sideOf = (x) => (x < shell.app.clientWidth / 2 ? -1 : 1);
  const KEYS = { ArrowLeft: -1, KeyA: -1, KeyQ: -1, KeyL: -1, ArrowRight: 1, KeyD: 1, KeyE: 1, KeyR: 1 };

  let views = [];
  const api = {
    game, scene, fx, stage, assets,
    get views() { return views; },
    get shake() { return game.shake; },
    label: "assets/ui/eggs.png", // on the players' cards, over their count
    remoteTypes: ["lean", "ev"],

    // fit [width] x [bottom, top] around the player(s) in the Chansey's plane, the
    // camera level with the scene and far back with a narrow lens, close to the
    // game's straight-on picture. Extra height goes below (the water), so drops
    // always enter at the top edge; extra width shows more of the building.
    layout(W, H, safe, me, cards, frames) {
      const portrait = W / H < 1.25;
      if (!portrait) {
        const cam = views.find((v) => v.zone === undefined)?.cam || new THREE.PerspectiveCamera(20, 1, 0.1, 200);
        views = [{ cam, x: 0, y: 0, w: W, h: H, width: BACKDROP.w * PX }]; // the game's whole screen
        frameCamera(views[0]);
        for (let i = 0; i < 4; i++) {
          const p = new THREE.Vector3(zoneX(i), 0, 0).project(cam);
          // on the bridge's front, under each Chansey (the roofs are where the eggs come from)
          shell.place(cards[i], { left: ((p.x + 1) / 2) * W + "px", bottom: H - safe.bottom + 8 + "px", transform: "translateX(-50%)" });
          cards[i].classList.remove("mini");
        }
        shell.place(left, { right: W - safe.right + 10 + "px", top: safe.top + 10 + "px" });
        return portrait;
      }
      // each small box shows exactly its own bay, pole to pole, from the bridge's
      // front up to where the eggs are a moment from the hands; the boxes keep
      // that shape and sit apart, so each player's area reads on its own
      const MINI = { width: ZONE_W + 0.1, bottom: -0.5, top: 1.95 };
      const cams = views.length === 4 ? views.map((v) => v.cam) : [0, 1, 2, 3].map(() => new THREE.PerspectiveCamera(22, 1, 0.1, 200));
      views = shell.miniViews(W, H, safe, me, cams, MINI.width / (MINI.top - MINI.bottom), { width: ZONE_W }, MINI);
      for (const v of views) frameCamera(v);
      shell.frameMinis(views, cards, frames);
      const strip = views[0].y;
      shell.place(cards[me], { left: safe.left + 8 + "px", top: strip + 8 + "px" });
      shell.place(left, { right: W - safe.right + 8 + "px", top: strip + 12 + "px" });
      return portrait;
    },

    // round: { level, seed, me, control, delay } and, online, the server's "start" message
    reset(round) {
      const m = round.start;
      const drops = m?.drops.map((seat) => seat.map(([t, col, k, fall]) => ({ t, col, kind: k === "v" ? "voltorb" : "egg", fall })));
      game.reset(round.level, round.seed, { me: round.me, control: round.control, delay: round.delay, drops,
                                            leans: m?.leans, hits: m?.hits, settled: m?.settled });
      if (m?.scores) m.scores.forEach((e, i) => { game.players[i].eggs = e; }); // rejoining: the eggs so far
      fx.clear();
      held.clear(); order = [];
    },
    idle() { game.reset(game.level || "normal"); fx.clear(); },
    go() { shell.music("egg"); game.start(); },
    finish() { shell.sound("finish"); shell.music(null, 40); },
    stop() { game.stop(); },
    setControl(z, c) { game.setControl(z, c); },
    get state() { return game.state; },
    get time() { return game.time; },
    step(dt, playing) {
      if (playing) game.players[shell.me()].want = lean();
      game.update(dt);
    },
    animate(dt, now) { fx.update(dt); stage.update(now); },
    score(i) { return game.players[i].eggs; },
    setScores(scores) { scores.forEach((e, i) => { game.players[i].eggs = e; }); },
    celebrate() {
      return game.celebrate().map((r) => ({ i: r.player.i, score: r.eggs, place: r.place }));
    },
    hud(playing) {
      const n = game.eggsLeft;
      if (n !== left.shown) { left.querySelector(".num").innerHTML = shell.digits(n); left.shown = n; }
      const l = lean();
      padL.classList.toggle("on", playing && l < 0);
      padR.classList.toggle("on", playing && l > 0);
    },
    remote(t, m) {
      if (t === "lean") game.remoteLean(m.s, m.g, m.l);
      else if (t === "ev") game.told(m.s, m.n, { k: m.k, e: m.e, g: m.g });
    },

    // input while a round is on (the shell passes these only then)
    pointerdown(e) { hold("p" + e.pointerId, sideOf(e.clientX)); },
    pointermove(e) { if (held.has("p" + e.pointerId)) held.set("p" + e.pointerId, sideOf(e.clientX)); }, // sliding across
    pointerup(e) { letGo("p" + e.pointerId); },
    keydown(e) { if (!(e.code in KEYS)) return false; if (!e.repeat) hold(e.code, KEYS[e.code]); return true; },
    keyup(e) { letGo(e.code); },
    blur() { held.clear(); order = []; },
    // for the tests and the console
    debug: { lean: (d) => (d ? hold("debug", d) : letGo("debug")) },
  };
  return api;
}

function frameCamera(v) {
  const cam = v.cam, top = v.top ?? VIEW_TOP, bottom = v.bottom ?? VIEW_BOTTOM;
  cam.aspect = v.w / v.h;
  const t = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2);
  const d = Math.max((top - bottom) / 2 / t, v.width / 2 / (t * cam.aspect));
  const cy = top - d * t;
  const cx = v.zone === undefined ? 0 : zoneX(v.zone);
  // the big view shows whoever's in it, as the game's screen does; a small box only its own bay
  if (!v.mini) cam.layers.enableAll();
  else { cam.layers.set(0); cam.layers.enable(v.zone + 1); }
  v.base = new THREE.Vector3(cx, cy, d);
  cam.position.copy(v.base);
  cam.lookAt(cx, cy, 0);
  cam.updateProjectionMatrix();
}
