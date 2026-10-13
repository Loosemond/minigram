// Eager Eevee in the minigames shell (main.js): the scene and its camera,
// the taps (dash; the Feint pad, feint), its HUD (each player's prizes won
// and reaction time, "ROUND 1" ... "FINAL ROUND", the points at the end) and
// its online messages ("dash", "got", "out"). The rules are in rules.js, the
// round in game.js, the effects in fx.js.
import * as THREE from "three";
import { loadAssets } from "./assets.js";
import { Game } from "./game.js";
import { Fx } from "./fx.js";
import { buildField } from "./field.js";
import * as R from "./rules.js";
import { meMark } from "../mark.js";
import { tintURL } from "../tint.js";

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
    tally: (tone) => tone(1200, 0, 0.03, { type: "square", vol: 0.04 }),
    tallied: (tone) => tone(1568, 0, 0.12, { type: "triangle", vol: 0.08 }),
  },
};

// The game's camera (0x86B00020): 40 degrees up and down (39.9991), from
// (0, 298.6, 338.9) looking at (0, 20, 0), on a 320 x 240 screen; fixed (no
// shake). Background picture 44 is that screen's view of the field. Here the
// field is rebuilt in 3D from the picture (field.js), so another camera
// (portrait, more from above) sees the same place.
const CAM = { fov: 39.9991, eye: new THREE.Vector3(0, 298.6, 338.9), at: new THREE.Vector3(0, 20, 0), aspect: 4 / 3 };
const T20 = Math.tan(THREE.MathUtils.degToRad(CAM.fov / 2));
// the prize slots' pictures (image bank 389: the module loads #2, #0 and #3,
// melon, grapes and strawberries, 0x86B00F2C; a Pineco never gets one)
const PRIZE_ICON = { grapes: 0, melon: 2, berries: 3 };
// the ". sec." box (bank 393, 72 x 17) and where its digits go (bank 394, 8 x 11)
const SECS = { w: 72, h: 17, digits: [7, 19, 28], top: 3, frames: 80 };
// the box and its digits through FC30B261 5566FF7F: (prim - env) x the
// picture + env, prim white and env the player's colour (0x86B0DA94); the
// digits are I8, so clear where they're dark
const PLAYER_ENV = [[96, 104, 205], [92, 164, 77], [205, 96, 115], [209, 163, 71]];
// the round's banner (0x86B0952C, drawn by 0x86B095B4 through FC30B3FF
// 5FFEFE38: (prim - env) x the picture + env, its alpha prim's), each round's
// colours; at scale 2 for 11 frames, then growing 0.06 a frame as it fades 12
// a frame, gone at its 31st (0x86B09480)
const BANNER = [[[150, 230, 255], [40, 80, 124]], [[220, 220, 220], [190, 130, 0]], [[255, 255, 120], [180, 70, 0]],
                [[225, 215, 255], [115, 75, 165]], [[255, 180, 0], [0, 0, 0]]];
const BANNER_FROM = 5, BANNER_HOLD = 10, BANNER_LIFE = 31;
// the points at the end (0x86B0A1FC): the big digits (429) and "Points"
// (430), each player's prim and env (0x86B0DB14); the winners' going round
// six colours on white, a 10th of the way a frame (G+0x338, the colours set
// at 0x86B00ECC)
const TALLY = [[[0, 0, 155], [170, 245, 255]], [[0, 100, 0], [200, 255, 155]], [[120, 0, 0], [255, 160, 190]],
               [[210, 90, 0], [255, 255, 140]]];
const ROUND = [0xb43c3c, 0xb48c28, 0x28a028, 0x289696, 0x5050c8, 0x963c96];
// the strawberries counted into a slot: bank 390's digits in prim 255, 180, 0 x
// their grey (0x86B0ACFC: FC30FE61 FFFFF3F9); the newest slot whitened by 100
// of 255 on alternate frames while its Eevee eats (0x86B0AB6C: FC377E6E 11FCF279)
const COUNT = [255, 180, 0], BLINK = 100 / 255;
const hex = (c) => "#" + Math.round(c).toString(16).padStart(6, "0");
const mix = (a, b, k) => [16, 8, 0].reduce((s, sh) => s + (Math.round((((a >> sh) & 255) * (1 - k)) + (((b >> sh) & 255) * k)) << sh), 0);
const rgb = (c) => `rgb(${c.join(",")})`;

// a picture's colours whitened by k (the prize slot's blink), as a data URL
const whitened = new Map();
function whiten(url, k) {
  if (!whitened.has(url)) {
    whitened.set(url, new Promise((ok) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement("canvas");
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        const g = c.getContext("2d");
        g.drawImage(img, 0, 0);
        const d = g.getImageData(0, 0, c.width, c.height);
        for (let i = 0; i < d.data.length; i += 4) for (let j = 0; j < 3; j++) d.data[i + j] += (255 - d.data[i + j]) * k;
        g.putImageData(d, 0, 0);
        ok(c.toDataURL());
      };
      img.onerror = () => ok(url);
      img.src = url;
    }));
  }
  return whitened.get(url);
}

export async function create(shell, onProgress) {
  const assets = await loadAssets("assets/eevee/", onProgress);
  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 0.75 * Math.PI));
  const sun = new THREE.DirectionalLight(0xffffff, 0.4 * Math.PI);
  sun.position.set(-1, 3, 2);
  scene.add(sun);
  buildField(scene);
  const game = new Game(scene, assets);
  const fx = new Fx(scene, assets);
  const A = "assets/eevee/", UI = "assets/ui/";

  // ---- its HUD ----
  const hud = document.createElement("div");
  hud.className = "game-hud ee";
  hud.innerHTML = `<img class="ee-round" alt="" hidden>
    <div class="ee-pads"><div class="pad ee-feint" data-pad="b">Feint</div><div class="pad ee-dash" data-pad="a">Dash</div></div>`;
  shell.hud.append(hud);
  const roundBanner = hud.querySelector(".ee-round"), mark = meMark(hud, shell.me);
  const pads = { a: hud.querySelector(".ee-dash"), b: hud.querySelector(".ee-feint") };
  const prizeRows = [0, 1, 2, 3].map(() => {
    const d = hud.appendChild(document.createElement("div"));
    d.className = "ee-prizes";
    d.innerHTML = [0, 1, 2, 3, 4].map(() => `<i><img alt="" hidden><b class="ee-n"></b></i>`).join("");
    return d;
  });
  const secs = [0, 1, 2, 3].map(() => {
    const d = hud.appendChild(document.createElement("div"));
    d.className = "ee-secs";
    d.hidden = true;
    d.innerHTML = `<img class="box" alt="">` +
      SECS.digits.map((x) => `<img class="d" style="left:calc(${x}px * var(--k)); top:calc(${SECS.top}px * var(--k))" alt="">`).join("");
    return d;
  });
  // the pictures coloured as the game draws them (src/tint.js), as they're made
  const pics = {};
  const coloured = (key, url, prim, env, opts) => {
    if (!(key in pics)) { pics[key] = null; tintURL(url, prim, env, opts).then((u) => { pics[key] = u; }); }
    return pics[key];
  };
  const blinks = {};
  for (const i of Object.values(PRIZE_ICON)) whiten(`${A}prize${i}.png`, BLINK).then((u) => { blinks[i] = u; });
  BANNER.forEach(([prim, env], n) => coloured("round" + n, `${A}round${n + 1}.png`, prim, env));
  for (let d = 0; d < 10; d++) {
    coloured("s" + d, `${A}s${d}.png`, COUNT, [0, 0, 0]);
    coloured("i" + d, `${UI}big${d}.png`, 0xffffff, 0xffffff, { alpha: "grey" }); // (its grey: a mask for a winner's colour)
    PLAYER_ENV.forEach((env, z) => coloured(`t${z}_${d}`, `${A}t${d}.png`, 0xffffff, env, { alpha: "grey" }));
    TALLY.forEach(([prim, env], z) => coloured(`b${z}_${d}`, `${UI}big${d}.png`, prim, env));
  }
  coloured("ipts", `${A}points.png`, 0xffffff, 0xffffff, { alpha: "grey" });
  TALLY.forEach(([prim, env], z) => coloured("pts" + z, `${A}points.png`, prim, env));
  PLAYER_ENV.forEach((env, z) => coloured("box" + z, `${A}secs.png`, 0xffffff, env));

  // ---- sounds and the like, from the round: an Eevee's on its player's channel,
  // placed by where it is (0x8002780C: its x x 64 / 200, every frame, 0x86B058C8) ----
  const mine = (z) => z === shell.me();
  const at = (z) => ({ x: Math.trunc((game.eevees[z].at.x * 64) / 200) });
  game.on("round", () => shell.sound("call")); // (0xAF08: Aipom's clip 2 starts)
  game.on("calling", (n) => { shell.sound("aipom"); shell.music(n === R.ROUNDS - 1 ? "final" : "round", 0, true); }); // (0xAF00 and the song at its frame 5)
  // the song stops as the basket goes up (0x86B03308), and 0xAF01 at frame 5
  // of the lift; a fake has no sound, the music and effects hush for it
  game.on("open", () => shell.music(null, 2));
  game.on("up", () => shell.sound("lid"));
  game.on("hush", () => shell.hush(true));
  game.on("unhush", () => shell.hush(false));
  game.on("dash", (z) => { shell.sound("dash", z, at(z)); if (mine(z)) shell.haptic("light"); }); // (0xAF02)
  game.on("feint", (z) => { shell.sound("dash", z, at(z)); if (mine(z)) shell.haptic("light"); });
  game.on("dust", (z, t, x, y) => fx.dust(t, x, y));
  game.on("bonk", (z) => { shell.sound("bonk", z, at(z)); if (mine(z)) shell.haptic("heavy"); }); // (0xAF04)
  game.on("lost", (z) => shell.sound("back", z, at(z))); // (0xAF03)
  game.on("got", (z) => { shell.sound("got", z, at(z)); if (mine(z)) shell.haptic("success"); }); // (0xAF05)
  game.on("boom", (t, first) => { // (0xAF06; the flash and 0xAF0B for the first in)
    shell.sound("boom");
    if (!first.length) return;
    fx.blast(t);
    for (const z of first) { shell.sound("dazed", z, at(z)); if (mine(z)) shell.haptic("error"); }
  });
  game.on("smoke", (t, x, y, z) => fx.smoke(t, x, y, z));
  game.on("trail", (z, t, x, y) => fx.smoke(t, x, 0, y));
  game.on("landed", (z) => shell.sound("blown", z, at(z))); // (0xAF07)
  game.on("munch", (on) => shell.hold("munch", undefined, on)); // (0xCA0F, held)
  game.on("song", () => shell.music("main", 0, true)); // (song 53, 70 frames after a prize)
  game.on("tally", (on) => shell.hold("tally", undefined, on)); // (0x8012, held while they count)
  game.on("tallied", () => shell.sound("tallied")); // (0x8F13)
  game.on("press", (m) => shell.send("dash", m));

  let view = null;
  let portrait = false, cardRects = [];
  // the cards' places, again whenever one changes size (its points get another digit)
  const measure = () => { cardRects = cardEls.map((c) => c.getBoundingClientRect()); placeRows(); };
  const sizes = new ResizeObserver(measure);
  let cardEls = [];
  const api = {
    game, scene, assets,
    get views() { return view ? [view] : []; },
    label: null,

    layout(W, H, safe, me, cards) {
      portrait = W / H < 1;
      const cam = view?.cam || new THREE.PerspectiveCamera(CAM.fov, 1, 50, 12800);
      view = { cam, x: 0, y: 0, w: W, h: H };
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
      cardEls = cards;
      sizes.disconnect();
      cards.forEach((c) => sizes.observe(c));
      requestAnimationFrame(measure);
      return portrait;
    },

    reset(round) {
      const m = round.start;
      game.reset(round.level, round.seed, { me: round.me, control: round.control, level: m?.ee?.level,
                                            scores: m?.ee?.scores, prizes: m?.ee?.prizes, outs: m?.ee?.out });
      shell.stopSound();
      for (const d of secs) d.hidden = true;
      roundBanner.hidden = true;
      pads.a.hidden = pads.b.hidden = false;
      fx.clear();
    },
    idle() {
      game.reset(game.levelName || "normal");
      game.state = "idle";
      shell.stopSound();
      for (const d of secs) d.hidden = true;
      roundBanner.hidden = true;
      fx.clear();
    },
    go() { game.start(); },
    // the hand-over: no whistle, and the song isn't faded (the results' takes over: docs/minigames.md)
    finish() {},
    stop() { game.stop(); shell.stopSound(); },
    setControl(z, c) { game.setControl(z, c); },
    get state() { return game.state; },
    get time() { return game.time; },
    step(dt) { game.update(dt); fx.update(game.drawn); },
    animate() {},
    // the points show only at the end (0x86B0A1FC: G+0x19C); the cards' digits are drawn here (drawHud)
    score(i) { return game.players[i].shown ?? 0; },
    setScores(scores) { scores.forEach((e, i) => { game.players[i].total = game.players[i].shown = e; }); },
    celebrate() { return game.celebrate(); },
    hud(on) { drawHud(on); },
    remote(t, m) {
      if (t === "dash") game.told("press", { s: m.s, k: m.k, f: m.f });
      else if (t === "got" || t === "out") game.told(t, m);
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
      // its reaction time: beside the card, or in portrait (no room for two
      // cards and two times across) past the prizes, away from the corner
      Object.assign(secs[i].style, portrait ? {
        left: left ? r.left + "px" : "auto", right: left ? "auto" : innerWidth - r.right + "px",
        top: top ? r.bottom + 4 + 27 + 4 + "px" : r.top - 4 - 27 - 4 - 17 * 1.5 + "px",
      } : {
        left: left ? r.right + 6 + "px" : "auto", right: left ? "auto" : innerWidth - r.left + 6 + "px",
        top: r.top + (r.height - 17 * 1.5) / 2 + "px",
      });
    });
  }
  const src = (img, u) => { if (u && img.getAttribute("src") !== u) img.src = u; };
  // a winner's digit: the env colour through the picture, the prim through its grey (to colour as it goes)
  const masked = (a, i) => `<span class="ee-d" style="--a: url('${a}'); --i: url('${i}')"></span>`;
  const drawn = ["", "", "", ""];
  const tmp = new THREE.Vector3();
  function drawHud(on) {
    const playing = game.state === "play" || game.state === "over";
    const now = game.drawn ?? 0, t = Math.floor(now);
    hud.classList.toggle("off", !on);
    // the round's banner: from frame 5 of Aipom's call, 31 frames
    const { n, T } = game.now, b = now - T.start - BANNER_FROM;
    roundBanner.hidden = !playing || b < 0 || b >= BANNER_LIFE || game.tallyFrom !== null;
    if (!roundBanner.hidden) {
      src(roundBanner, pics["round" + n]);
      const g = Math.max(0, b - BANNER_HOLD);
      roundBanner.style.transform = `translateX(-50%) scale(${(2 + 0.06 * g) / 2})`;
      roundBanner.style.opacity = String(Math.max(0, 255 - 12 * g) / 255);
    }
    for (let z = 0; z < 4; z++) {
      const p = game.players[z], e = game.eevees[z];
      // (an empty seat: nothing of it, its card hidden by the shell)
      if (game.empty[z]) { prizeRows[z].hidden = secs[z].hidden = true; continue; }
      // the prizes won, one slot each in the order they came; the newest blinks
      // while its Eevee eats, the strawberries counted into theirs a frame at a time
      const slots = prizeRows[z].querySelectorAll("i");
      slots.forEach((slot, k) => {
        const w = playing ? p.won[k] : null, img = slot.firstElementChild, num = slot.lastElementChild;
        img.hidden = !w;
        num.hidden = !(w && w.what === "berries");
        if (!w) return;
        const icon = PRIZE_ICON[w.what], newest = k === p.won.length - 1;
        const blink = newest && e.mode === "eat" && e.round === w.n && Math.floor(now - w.at) % 2 === 0;
        src(img, blink && blinks[icon] ? blinks[icon] : `${A}prize${icon}.png`);
        if (w.what === "berries") {
          const c = w.at >= 0 ? Math.max(0, Math.min(game.berriesOf(z, w.n, t), t - w.at + 1)) : 0;
          const urls = String(c).split("").map((d) => pics["s" + d]);
          if (urls.every(Boolean) && num.dataset.c !== String(c)) {
            num.innerHTML = c > 0 ? urls.map((u) => `<img src="${u}" alt="">`).join("") : "";
            num.dataset.c = c;
          }
        }
      });
      prizeRows[z].hidden = !playing;
      // the reaction time of its last dash, 80 frames
      const rt = p.reaction, box = secs[z];
      box.hidden = !playing || !rt || now < rt.at || now - rt.at >= SECS.frames;
      if (!box.hidden) {
        src(box.querySelector(".box"), pics["box" + z]);
        const v = Math.min(999, rt.v), ds = [Math.floor(v / 100), Math.floor(v / 10) % 10, v % 10];
        box.querySelectorAll(".d").forEach((img, k) => src(img, pics[`t${z}_${ds[k]}`]));
      }
      // its points on its card: nothing till the tally, then counting up in its
      // colours (over the shell's plain digits), a winner's going round the colours
      const el = cardEls[z]?.querySelector(".num");
      if (!el) continue;
      let html = "";
      if (p.shown !== null && playing) {
        const s = String(Math.max(0, p.shown)).split("");
        if (game.winners?.[z]) {
          const c = (((now - game.tallyFrom) % 60) + 60) % 60, from = Math.floor(c / 10);
          el.style.setProperty("--prim", hex(mix(ROUND[from], ROUND[(from + 1) % 6], (c % 10) / 10)));
          el.style.setProperty("--env", "#ffffff");
          html = s.every((d) => pics["i" + d]) && pics.ipts
            ? s.map((d) => masked(`${UI}big${d}.png`, pics["i" + d])).join("") + `<span class="ee-d ee-pts" style="--a: url('${A}points.png'); --i: url('${pics.ipts}')"></span>`
            : null;
        } else {
          html = s.every((d) => pics[`b${z}_${d}`]) && pics["pts" + z]
            ? s.map((d) => `<img class="ee-big" src="${pics[`b${z}_${d}`]}" alt="${d}">`).join("") + `<img class="ee-pts" src="${pics["pts" + z]}" alt="Points">`
            : null;
        }
      }
      // (the shell writes its own digits when the number changes: put these back over them)
      const ours = el.childElementCount === 0 ? html === "" : el.firstElementChild.classList.contains("ee-big") || el.firstElementChild.classList.contains("ee-d");
      if (html !== null && (html !== drawn[z] || !ours)) { el.innerHTML = html; drawn[z] = html; }
    }
    pads.a.parentElement.hidden = game.state !== "play" || game.tallyFrom !== null;
    // which Eevee is yours (the remake's: the game's Eevee all look the same)
    const e = game.eevees[shell.me()].m.root.position;
    mark.place(playing && view, tmp.set(e.x, 62, e.z));
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
