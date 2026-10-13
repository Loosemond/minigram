// Egg Emergency in the minigames shell (main.js): its scene and cameras, the
// lean controls, its bits of HUD, and its online messages ("lean", "ev",
// "deal"). The rules are in rules.js, the round and its scene in game.js, the
// stage in stage.js, the effects in fx.js.
import * as THREE from "three";
import { loadAssets } from "./assets.js";
import { Game, zoneX, ZONE_W, VIEW_TOP, VIEW_BOTTOM, BACKDROP, PX } from "./game.js";
import { buildStage } from "./stage.js";
import { meMark } from "../mark.js";
import { tintURL } from "../tint.js";

// Sounds (docs/audio.md): what each is in tools/web_assets.py
export const SOUNDS = {
  url: "assets/egg/sound.bin",
  standIns: {
    catch: (tone) => { tone(988, 0, 0.06, { vol: 0.1 }); tone(1480, 0.05, 0.09, { vol: 0.1 }); },
    shock: (tone, noise) => { noise(0, 0.6, { vol: 0.7, freq: 700 }); tone(130, 0, 0.4, { type: "sine", vol: 0.6, to: 35 }); },
    splash: (tone, noise) => noise(0, 0.3, { vol: 0.25, freq: 500 }),
  },
};

// the arrow at your Chansey: under its feet, pointing up (over its head is
// where the eggs come down, and where it holds up the one it's caught)
const FEET = -0.03;
// The HUD's colours (0x868039F8): each player's count in the big digits (image
// bank 429) in its colours (0x86807E40), and the eggs still to come under
// "EGGS" (bank 404) in yellow and orange, at 200 of 255
const UI = "assets/ui/";
const COUNT_COLOURS = [[[0, 0, 155], [170, 245, 255]], [[0, 100, 0], [200, 255, 155]],
  [[120, 0, 0], [255, 160, 190]], [[210, 90, 0], [255, 255, 140]]];
const LEFT_COLOURS = [[255, 255, 155], [255, 100, 0]];

// Landscape: one camera on all four players, like the game. Portrait: your
// Chansey fills the screen (with whatever of your neighbours is in the
// picture, at the edges) and the other three get small boxed views along the
// top, each framed on its own bay. An empty seat's bay (online, the CPUs off)
// stays in the picture with no one in it, and gets no box.
export async function create(shell, onProgress) {
  const assets = await loadAssets("assets/egg/", onProgress);
  const scene = new THREE.Scene();
  // N64-style shade = ambient + N.L x sun (x PI: three's lights are physical units);
  // surfaces facing the camera come out at about the texture's own colour
  scene.add(new THREE.AmbientLight(0xffffff, 0.7 * Math.PI));
  const sun = new THREE.DirectionalLight(0xffffff, 0.42 * Math.PI);
  sun.position.set(-1.5, 3, 4);
  scene.add(sun);
  const stage = buildStage(scene, assets);
  const game = new Game(scene, assets);
  const fx = game.fx;

  // its HUD: the eggs still to come, and the L / R pads
  const hud = document.createElement("div");
  hud.className = "game-hud";
  hud.innerHTML = `<div id="left"><img class="eggs" alt="EGGS"><span class="num"></span></div>
    <div id="pads"><div class="pad" id="padL">L</div><div class="pad" id="padR">R</div></div>`;
  shell.hud.append(hud);
  const left = hud.querySelector("#left"), padL = hud.querySelector("#padL"), padR = hud.querySelector("#padR");
  const mark = meMark(hud, shell.me, { below: true }), under = new THREE.Vector3();
  const pics = {}; // the digits and EGGS, coloured (src/tint.js), as they're made
  const coloured = (key, url, prim, env, opts) => {
    if (!(key in pics)) { pics[key] = null; tintURL(url, prim, env, opts).then((u) => { pics[key] = u; }); }
    return pics[key];
  };
  coloured("EGGS", UI + "eggs.png", ...LEFT_COLOURS, { times: 200 / 255 });
  for (let d = 0; d < 10; d++) {
    coloured("n" + d, UI + "n" + d + ".png", ...LEFT_COLOURS, { times: 200 / 255 });
    COUNT_COLOURS.forEach((c, z) => coloured(z + "big" + d, UI + "big" + d + ".png", ...c));
  }
  const digitsOf = (n, name, cls) => {
    const urls = String(Math.max(0, n)).split("").map((d) => pics[name(d)]);
    return urls.every(Boolean) ? urls.map((u) => `<img class="${cls}" src="${u}" alt="">`).join("") : null;
  };

  const mine = (z) => z === shell.me() && !shell.catchingUp();
  let songDue = false;
  game.on("song", () => { songDue = true; });
  game.on("sound", (name, z) => shell.sound(name, z ?? undefined));
  game.on("catch", (z) => { shell.flash(z, "bump"); if (mine(z)) shell.haptic("light"); });
  game.on("hit", (z) => { shell.flash(z, "hurt"); if (mine(z)) shell.haptic("heavy"); });
  // online, what this device plays goes to the others
  // (kept while offline, and sent on reconnecting, so the server's copy of the leans stays whole)
  game.on("lean", (s, l, f) => shell.send("lean", { s, f, l }));
  game.on("result", (r) => shell.send("ev", r));

  // ---- the lean: like the game's L and R buttons, hold a side to lean; with
  // both keys held, the centre (0x86801EF0); fingers: the last one down
  const held = new Map(); // pointer id or key -> -1 | 1
  let order = [];
  const hold = (id, dir) => { held.set(id, dir); order = order.filter((x) => x !== id); order.push(id); };
  const letGo = (id) => { held.delete(id); order = order.filter((x) => x !== id); };
  const lean = () => {
    const keys = [...held].filter(([id]) => !id.startsWith("p")).map(([, d]) => d);
    if (keys.includes(-1) && keys.includes(1)) return 0;
    return order.length ? held.get(order[order.length - 1]) : 0;
  };
  const sideOf = (x) => (x < shell.app.clientWidth / 2 ? -1 : 1);
  const KEYS = { ArrowLeft: -1, KeyA: -1, KeyQ: -1, KeyL: -1, ArrowRight: 1, KeyD: 1, KeyE: 1, KeyR: 1 };

  let views = [], cardEls = [], portraitCams = null;
  const api = {
    game, scene, fx, stage, assets,
    get views() { return views; },
    label: null, // (the game's cards have no word over the count)
    remoteTypes: ["lean", "ev", "deal"],

    // fit [width] x [bottom, top] around the player(s) in the Chansey's plane, the
    // camera level with the scene and far back with a narrow lens, close to the
    // game's straight-on picture. Extra height goes below (the water), so drops
    // always enter at the top edge; extra width shows more of the building.
    layout(W, H, safe, me, cards, frames) {
      cardEls = cards;
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
      const MINI = { width: ZONE_W + 0.1, bottom: -0.5, top: 2.3 };
      // (the boxes are the seats there: with empty seats, fewer)
      const cams = (portraitCams ||= [0, 1, 2, 3].map(() => new THREE.PerspectiveCamera(22, 1, 0.1, 200)));
      views = shell.miniViews(W, H, safe, me, cams, MINI.width / (MINI.top - MINI.bottom), { width: ZONE_W }, MINI);
      for (const v of views) frameCamera(v);
      shell.frameMinis(views, cards, frames);
      const strip = views[0].y;
      shell.place(cards[me], { left: safe.left + 8 + "px", top: strip + 8 + "px" });
      shell.place(left, { right: W - safe.right + 8 + "px", top: strip + 12 + "px" });
      return portrait;
    },

    // round: { level, seed, me, control, delay, lineup } and, online, the server's "start" message
    reset(round) {
      const m = round.start;
      // (the server's: the seats no one was dealt, but for the empty ones: no one plays those, not even a CPU)
      const cpus = round.online && round.lineup ? [0, 1, 2, 3].map((z) => !round.empty?.[z] && !round.lineup.some((p) => p.seat === z)) : undefined;
      game.reset(round.level, round.seed, { me: round.me, control: round.control, delay: round.delay, cpus, empty: round.empty,
                                            start: m && { c: m.c, human: m.human, leans: m.leans, ups: m.ups, f: m.f } });
      songDue = false;
      held.clear(); order = [];
    },
    idle() { game.reset(game.level || "normal"); game.state = "idle"; },
    go() { game.start(); }, // (its song comes 31 frames on)
    finish() {}, // (no whistle, and the song plays on: 0x868058C0)
    stop() { game.stop(); },
    setControl(z, c) { game.setControl(z, c); },
    get state() { return game.state; },
    get time() { return game.time; },
    step(dt, playing) {
      if (playing) game.held = lean();
      game.catchingUp = shell.catchingUp();
      game.update(dt);
      if (songDue && !shell.catchingUp()) { songDue = false; shell.music("egg"); }
    },
    animate(dt, now) { game.draw(); stage.update(now); },
    score(i) { return game.seats[i].eggs; },
    setScores(scores) { scores.forEach((e, i) => { game.seats[i].eggs = e; }); },
    celebrate() { return game.celebrate(); },
    hud(playing) {
      const n = game.eggsLeft;
      if (n !== left.shown) {
        const html = digitsOf(n, (d) => "n" + d, "eg-n");
        if (html) { left.querySelector(".num").innerHTML = html; left.shown = n; }
      }
      const eggsPic = pics.EGGS;
      if (eggsPic && left.firstElementChild.src !== eggsPic) left.firstElementChild.src = eggsPic;
      // each player's count, in its colours (over the shell's plain digits)
      cardEls.map((c) => c.querySelector(".num")).forEach((el, z) => {
        if (game.empty[z]) return; // (its card's hidden)
        const e = game.seats[z].eggs;
        if (el.firstElementChild?.classList.contains("eg-big") && el.dataset.egg === String(e)) return;
        const html = digitsOf(e, (d) => z + "big" + d, "eg-big");
        if (html) { el.innerHTML = html; el.dataset.egg = e; }
      });
      const l = lean();
      padL.classList.toggle("on", playing && l < 0);
      padR.classList.toggle("on", playing && l > 0);
      // which Chansey is yours (the four look the same): in the big view
      const on = game.state === "play" || game.state === "over";
      mark.place(on && views[0], under.copy(game.chansey[shell.me()].root.position).setY(FEET));
    },
    remote(t, m) {
      if (t === "lean") game.remoteLean(m.s, m.f, m.l);
      else if (t === "ev") game.told(m.s, m.n, { k: m.k, e: m.e, g: m.g });
      else if (t === "deal") game.serverUps(m.ups);
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
