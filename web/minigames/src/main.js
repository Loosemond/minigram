// The minigames' shell: the title screen with the game picker, rounds (the
// game's countdown and GO, the winners' banner, the results), the online rooms and their
// lobby, where the host picks the game, and the renderer. Each game is a
// module (src/<game>/index.js, listed in games.js) with its own scene,
// controls, HUD and online messages; it's loaded the first time it's picked.
import * as THREE from "three";
import { GAMES, ORDER } from "./games.js";
import { sfx, music, musicTempo, sound, hold, stopSound, hush, unlock, useSounds, setMuted, isMuted, SHARED_STAND_INS, debug as audioDebug } from "./audio.js";
import { telegram } from "./telegram.js";
import { Net } from "./net.js";
import { startDelay } from "./lag.js";
import config from "./config.js";

THREE.ColorManagement.enabled = false; // colours are the game's own values (docs/colours.md)

const PLAYER_COLOURS = ["#2f5de0", "#23a043", "#dc3030", "#e8a412"]; // 1P-4P, as on the game's badges
const COLOUR_NAMES = ["blue", "green", "red", "yellow"];
const FRAME = 1000 / 30; // ms: the minigames run at 30 frames a second
const CODE = /^[A-Za-z]{4,6}$/;
const UI = "assets/ui/";

const $ = (s) => document.querySelector(s);
const app = $("#app");
const cards = [...document.querySelectorAll(".card")];
const params = new URLSearchParams(location.search);
// ?debug and ?server= are for testing: on this computer, or with config.debug
const testing = config.debug || /^(localhost|127\.0\.0\.1|\[::1\])$|\.localhost$|\.test$/.test(location.hostname);
telegram.init(GAMES.egg.color);

// who is in each seat: people get the 1P-4P badges, CPUs "COM" in the seat's colour
let me = 0; // this device's seat
let seats = [];
function soloSeats() { seats = [0, 1, 2, 3].map((i) => (i ? { human: false, name: "COM" } : { human: true, name: telegram.userName || "You" })); }
function roundSeats(lineup) {
  seats = [0, 1, 2, 3].map((i) => {
    const p = lineup.find((x) => x.seat === i && x.here);
    return p ? { human: true, name: p.name } : { human: false, name: "COM" };
  });
}
const badge = (i) => (seats[i].human ? i + 1 + "p" : "com_" + COLOUR_NAMES[i]);
function applySeats() {
  cards.forEach((c, i) => {
    c.style.setProperty("--c", PLAYER_COLOURS[i]);
    const b = c.querySelector(".badge");
    b.src = `${UI}badge_${badge(i)}.png`;
    b.alt = seats[i].human ? i + 1 + "P" : "COM";
    c.querySelector(".who").textContent = current?.online && seats[i].human ? seats[i].name : "";
    c.classList.toggle("me", !!current?.online && i === me);
  });
}
soloSeats();

// ---------------------------------------------------------------- renderer

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas: $("#view"), antialias: true, powerPreference: "high-performance" });
} catch {
  $("#loading p").textContent = "This device can't show 3D graphics (WebGL is off).";
  throw new Error("no WebGL");
}
renderer.outputColorSpace = THREE.LinearSRGBColorSpace; // the colours as they are
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setClearColor("#17110e"); // behind the small boxes
renderer.autoClear = false;
// ?norender (testing): everything runs, the scene and cameras move, but
// nothing's drawn (the tests' extra players, so many can play at once)
if (testing && params.has("norender")) {
  renderer.render = (scene, cam) => {
    scene.updateMatrixWorld();
    if (cam.parent === null) cam.updateMatrixWorld();
  };
}

function place(el, style) { Object.assign(el.style, { left: "auto", right: "auto", top: "auto", bottom: "auto", transform: "none" }, style); }

// Portrait, for the games that use it: your player fills the screen and the
// other three get small boxed views along the top. aspect: a small box's
// width / height; main, mini: extra fields for the big view and the small ones.
function miniViews(W, H, safe, seat, cams, aspect, main, mini) {
  const pad = 8, gap = 10, room = safe.right - safe.left - 2 * pad;
  let miniH = Math.round(H * 0.22), miniW = Math.round(miniH * aspect);
  if (3 * miniW + 2 * gap > room) { miniW = Math.floor((room - 2 * gap) / 3); miniH = Math.round(miniW / aspect); }
  const strip = safe.top + miniH + 2 * pad;
  const x0 = Math.round((W - 3 * miniW - 2 * gap) / 2);
  const others = [0, 1, 2, 3].filter((i) => i !== seat);
  const views = [{ cam: cams[0], zone: seat, x: 0, y: strip, w: W, h: H - strip, ...main }];
  others.forEach((z, k) => views.push({ cam: cams[k + 1], zone: z, mini: true, x: x0 + k * (miniW + gap), y: safe.top + pad, w: miniW, h: miniH, ...mini }));
  return views;
}

// the small boxes' coloured frames, and the cards under them
function frameMinis(views, cardEls, framesEl) {
  const border = 3;
  for (const v of views) {
    cardEls[v.zone].classList.toggle("mini", !!v.mini);
    if (!v.mini) continue;
    place(cardEls[v.zone], { left: v.x + v.w / 2 + "px", top: v.y + v.h - 3 + "px", transform: "translate(-50%, -100%)" });
    const f = framesEl.appendChild(document.createElement("div"));
    f.className = "frame";
    Object.assign(f.style, {
      left: v.x - border + "px", top: v.y - border + "px", width: v.w + 2 * border + "px", height: v.h + 2 * border + "px",
      borderWidth: border + "px", borderColor: PLAYER_COLOURS[v.zone],
    });
  }
}

function layout() {
  const W = app.clientWidth, H = app.clientHeight;
  renderer.setSize(W, H, false);
  app.style.setProperty("--u", Math.min(W / 260, H / 240)); // a pixel of the game's 320 x 240 screen (the results banner)
  if (!game) return;
  const safe = $("#safe").getBoundingClientRect();
  $("#frames").innerHTML = "";
  app.classList.toggle("portrait", !!game.layout(W, H, safe, me, cards, $("#frames")));
}

function render() {
  const H = app.clientHeight;
  renderer.setScissorTest(false);
  renderer.clear(); // the whole canvas: the strip behind the small boxes
  if (!game) return;
  renderer.setScissorTest(true);
  for (const v of game.views) {
    const y = H - v.y - v.h;
    renderer.setViewport(v.x, y, v.w, v.h);
    renderer.setScissor(v.x, y, v.w, v.h);
    v.cam.position.copy(v.base);
    if (game.shake && !v.mini) {
      v.cam.position.x += (Math.random() - 0.5) * game.shake * (v.shakeScale ?? 0.25);
      v.cam.position.y += (Math.random() - 0.5) * game.shake * (v.shakeScale ?? 0.25);
    }
    renderer.clearDepth();
    (v.render || ((r, c) => r.render(game.scene, c)))(renderer, v.cam);
  }
}

// ------------------------------------------------------------------- games
// The game on show (picked on the title, or the room's), loaded on first use.

let gameId = null, game = null; // game: the loaded game's module instance, see src/egg/index.js
let gameOn = null; // the id whose instance game is (gameId is the one picked: it may still be loading)
const loaded = new Map(); // id -> Promise of its instance
const hudOf = new Map(); // id -> its HUD element

const shell = {
  renderer, app, hud: null, place, miniViews, frameMinis,
  me: () => me,
  online: () => !!current?.online,
  catchingUp: () => catchingUp,
  playing: () => playing(),
  flash, digits, bigDigits,
  haptic: (k) => telegram.haptic(k),
  // a sound: seat, whose (0-3: on its channel, panned to its column); how,
  // { pan, x, pitch, frames } (src/audio.js)
  sound: (name, seat, how) => { if (!catchingUp) sound(name, seat, how); },
  // a sound the game asks for every frame it lasts (a hum), on or off, seat's
  hold: (name, seat, on, how) => hold(name, seat, on && !catchingUp, how),
  music: (name, fade, once) => { if (!catchingUp) music(name, fade, once); },
  tempo: (bpm) => musicTempo(bpm), // the song on, this much faster (0: as it is)
  stopSound, // (name, seat)
  hush: (on) => { if (!on || !catchingUp) hush(on); },
  // online: a message for the round, to the others (kept while offline, sent on reconnecting)
  send: (t, data) => { if (current?.online) net.send(t, { r: current.round, ...data }, true); },
  get seats() { return seats; },
  get round() { return current; },
  // s till the round's GO (on its clock: the server's online), < 0 after; null with none dealt
  toGo: () => (current?.goAt === undefined ? null : (current.goAt - (current.online ? net.now() : performance.now())) / 1000),
};

function loadGame(id) {
  if (!loaded.has(id)) {
    const info = GAMES[id];
    const bar = $("#loading .bar i");
    const p = info.load().then(async (mod) => {
      const hud = document.createElement("div");
      hud.className = "game " + id;
      hud.hidden = true;
      $("#hud").append(hud);
      hudOf.set(id, hud);
      const g = await mod.create({ ...shell, hud }, (k) => { if (gameId === id) bar.style.width = k * 100 + "%"; });
      g.sounds = mod.SOUNDS;
      try { sessionStorage.removeItem("egg-reloads"); } catch {} // the page's retries (index.html) start over
      return g;
    });
    p.catch(() => loaded.delete(id)); // try again next time
    loaded.set(id, p);
  }
  return loaded.get(id);
}

// Show game id (loading it first if need be). Resolves once it's on.
async function showGame(id) {
  if (!GAMES[id]) id = "egg";
  if (gameId === id && game && gameOn === id) return game;
  gameId = id;
  const info = GAMES[id];
  telegram.color(info.color);
  document.documentElement.style.setProperty("--sky", info.color);
  app.dataset.game = id;
  for (const b of document.querySelectorAll(".games button")) b.setAttribute("aria-checked", b.dataset.game === id);
  showInfo(id);
  let g = null;
  const pending = loadGame(id);
  const quick = await Promise.race([pending.then(() => true, () => true), new Promise((r) => setTimeout(r, 50, false))]);
  if (!quick) { $("#loading .bar i").style.width = "0%"; $("#loading").hidden = false; }
  try {
    g = await pending;
  } catch (err) {
    console.error(err);
    $("#loading").hidden = false;
    $("#loading p").textContent = "Couldn't load the game's files. (Developers: run tools/web_assets.py.)";
    throw err;
  }
  if (gameId !== id) return g; // picked another meanwhile
  $("#loading").hidden = true;
  game = g;
  gameOn = id;
  g.setControls?.(controlsOf(id));
  if (!playing() && phase !== "end" && phase !== "results") g.idle(); // on show, not playing yet
  for (const [k, el] of hudOf) el.hidden = k !== id;
  const label = g.label;
  for (const c of cards) { const l = c.querySelector(".label"); l.hidden = !label; if (label) l.src = label; }
  shown.fill(-1);
  useSounds(id, g.sounds.url, { ...SHARED_STAND_INS, ...g.sounds.standIns });
  applySeats();
  layout();
  return g;
}

// the title's and the lobby's words for the picked game
function showInfo(id) {
  const info = GAMES[id];
  for (const img of document.querySelectorAll(".logo")) { img.src = info.banner; img.alt = info.name; }
  for (const art of document.querySelectorAll(".art")) art.style.backgroundImage = `url(${info.art})`;
  $("#title h1").textContent = info.name;
  $("#how").innerHTML = typeof info.how === "function" ? info.how(controlsOf(id)) : info.how;
  showControls(id);
  $("#keys").innerHTML = info.keys;
  document.title = info.name;
  showBest();
}

// --------------------------------------------------------------- game flow
// A round: { online, level, seed, me, goAt, control, game } and, online,
// { round, lineup, host, start: the server's message }. Solo, the CPUs play
// here. Online, the server deals the seed and GO time, every device runs the
// round on the server's clock, each plays its own player (the host's also the
// CPUs), and the server sends the ranking.

let phase = "loading", level = "normal", round = 0;
let current = null; // the round being played
let catchingUp = false; // fast-forwarding an online round: no sounds
const best = {}; // "<game>:<level>" -> best score
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = (now, at) => new Promise((r) => setTimeout(r, Math.max(0, at - now())));
const playing = () => phase === "play" || phase === "countdown";

// A game's countdown (games.js): module #64's (0x87F005F0, 0x87F006BC), "3",
// "2" and "1" a step apart, then GO a step on, each with the game's sound
const countdownOf = (id) => ({ step: 20, count: "count", go: "go", song: null, ...GAMES[id].countdown });

// The countdown's pictures, "count3" to "go" (image bank 360), as module #64's
// object moves them (0x87F00138): each pops up in the first sixth of its step
// (sin(min(560t, 90 degrees)) of its size, t going from 0 to 1 over the step)
// with its width and height wobbling, 0.4 of it out of step (the sine and the
// cosine of 1080t, dying away by 1 - sin(90t)), then holds till the next. GO,
// once its step's over (last), is squeezed away in 6 frames: its width x0.55
// a frame, its height +0.1.
function banner(what, steps, last) {
  const b = $("#banner"), d = Math.PI / 180, frames = [];
  b.innerHTML = `<img src="${UI}${what}.png" alt="">`;
  for (let k = 0; k <= steps; k++) {
    const t = k / steps, size = Math.sin(Math.min(560 * t, 90) * d), wobble = 0.4 * (1 - Math.sin(90 * t * d));
    frames.push({ transform: `scale(${size * (1 + wobble * Math.sin(1080 * t * d))}, ${size * (1 + wobble * Math.cos(1080 * t * d))})`, opacity: 1 });
  }
  for (let n = 1; last && n <= 6; n++) frames.push({ transform: `scale(${0.55 ** n}, ${1 + 0.1 * n})`, opacity: n < 6 ? 1 : 0 });
  b.firstChild.animate(frames, { duration: (frames.length - 1) * FRAME, fill: "forwards" });
}

// Module #64's results banner (0x87F0A098): the winners' badges (the big ones,
// image bank 435) in seat order and WINS (UI layouts 93-95: one, two or three
// winners), or DRAW (layout 96) when no one won or all four did; dropped from a
// screen up, falling 58.8 / 60 faster each frame and bouncing back at 0.3 of
// its speed (0x87F0A3E8). Then song 55 and 0xCA0F, or song 56 and the crowd.
const DROP = [-240];
for (let y = -240, v = 0; DROP.length < 60;) {
  v += 58.8 / 60;
  y += v;
  if (y > 0) { y = 0; v *= -0.3; }
  DROP.push(y);
}
const RESULTS_AT = DROP.indexOf(0) + 60; // frames: 60 after it's first down, A goes on to the menu
function showWinners(results, drop) {
  const el = $("#winners"), won = results.filter((r) => r.place === 1).map((r) => r.i).sort((a, b) => a - b);
  const draw = won.length === 0 || won.length === 4, was = el.dataset.draw;
  el.innerHTML = draw ? `<img class="word" src="${UI}draw.png" alt="Draw">`
    : won.map((i) => `<img src="${UI}winner_${badge(i)}.png" alt="${seats[i].human ? i + 1 + "P" : "COM"}">`).join("")
      + `<img class="word" src="${UI}wins.png" alt="wins">`;
  el.dataset.draw = draw;
  el.hidden = false;
  if (drop || was !== String(draw)) sfx.results(draw);
  if (!drop) return;
  const h = app.clientHeight / 240;
  el.animate(DROP.map((y) => ({ transform: `translateY(${y * h}px)` })), { duration: (DROP.length - 1) * FRAME, fill: "forwards" });
}

function flash(i, cls) {
  const c = cards[i];
  c.classList.remove(cls);
  void c.offsetWidth;
  c.classList.add(cls);
}

// numbers in the game's small HUD digits (image bank 404), or its big ones (bank 429)
function digits(n) { return String(n).split("").map((d) => `<img src="${UI}n${d}.png" alt="${d}">`).join(""); }
function bigDigits(n, sign = false) {
  const s = (sign && n > 0 ? "+" : "") + n;
  return s.split("").map((d) => `<img src="${UI}${d === "+" ? "plus" : d === "-" ? "minus" : "big" + d}.png" alt="${d}">`).join("");
}

function show(screen) {
  for (const s of ["#title", "#results", "#lobby"]) $(s).hidden = s !== screen;
  $("#hud").hidden = !!screen;
  if (screen) $("#waiting").hidden = $("#winners").hidden = true;
}

// A game's control schemes, if it has a choice ({ id: label } in games.js):
// each player picks one, kept on this device, on the title and in the lobby
const controls = {}; // game id -> the scheme picked
const controlsKey = (id) => GAMES[id].store + "controls";
const controlsOf = (id) => (GAMES[id].controls && controls[id] in GAMES[id].controls ? controls[id] : Object.keys(GAMES[id].controls || { "": 0 })[0]);
function showControls(id) {
  const info = GAMES[id], c = controlsOf(id);
  for (const group of document.querySelectorAll(".controls")) {
    group.hidden = !info.controls;
    if (!info.controls) continue;
    group.innerHTML = Object.entries(info.controls).map(([k, label]) => `<button role="radio" data-controls="${k}" aria-checked="${k === c}">${label}</button>`).join("");
  }
}
function setControls(id, c) {
  controls[id] = c;
  telegram.set(controlsKey(id), c);
  showInfo(id);
  if (gameOn === id) game?.setControls?.(c);
}

function markLevel(group, l) { for (const b of group.querySelectorAll("button")) b.setAttribute("aria-checked", b.dataset.level === l); }
const bestKey = (id, l) => GAMES[id].store + "best_" + l;
function showBest() {
  const v = best[gameId + ":" + level];
  $("#best").innerHTML = v !== undefined && v !== null ? GAMES[gameId].unit(v) : "–";
}
function setLevel(l) {
  level = l;
  markLevel($("#title .levels:not(.controls)"), l);
  showBest();
}

function toTitle() {
  if (net?.wanted) { net.close(); room = null; setUrlRoom(null); }
  round++;
  phase = "title";
  current = null;
  me = 0;
  soloSeats();
  applySeats();
  layout();
  telegram.back(null);
  game?.idle();
  music(null);
  stopSound();
  show("#title");
}

function play() { startRound({ online: false, game: gameId, level, me: 0 }); }

async function startRound(s) {
  unlock();
  stopSound(); // (anything the last round left going)
  music(null); // (the last one's fanfare)
  const my = ++round;
  current = s;
  me = s.me;
  await showGame(s.game);
  if (round !== my) return;
  if (s.online) roundSeats(s.lineup); else soloSeats();
  applySeats();
  layout();
  s.control = [0, 1, 2, 3].map((z) => (z === me ? "local" : !s.online ? "cpu" : seats[z].human || s.host !== me ? "remote" : "cpu"));
  // how far behind to show each other device's player (Egg Emergency; src/lag.js)
  s.delay = [0, 1, 2, 3].map((z) => startDelay(net?.typical, s.start?.rtt?.[z]));
  if (s.seed === undefined) s.seed = (Math.random() * 2 ** 31) | 0;
  game.reset(s);
  show(null);
  $("#banner").innerHTML = "";
  $("#winners").hidden = true;
  phase = "countdown";
  telegram.back(toTitle);
  const now = s.online ? () => net.now() : () => performance.now();
  // the game's countdown (online, the server says when GO is: tools/rooms.py has the same steps)
  const cd = countdownOf(s.game), step = cd.step * FRAME;
  if (!s.online) s.goAt = now() + 4 * step;
  const marks = [3, 2, 1].map((n) => ({ at: s.goAt - n * step, n }));
  if (cd.song) marks.push({ at: s.goAt - (4 * cd.step - cd.song[0]) * FRAME, song: cd.song[1] }); // (a song it starts in it)
  marks.sort((a, b) => a.at - b.at);
  for (const m of marks) {
    await until(now, m.at);
    if (round !== my || phase !== "countdown") return;
    if (now() > m.at + 500) continue; // (not when rejoining mid-round)
    if (m.song) music(m.song, 0, true);
    else { banner("count" + m.n, cd.step); if (cd.count) sound(cd.count); }
  }
  await until(now, s.goAt);
  if (round !== my || phase !== "countdown") return;
  if (now() < s.goAt + 1000) { banner("go", cd.step, true); if (cd.go) sound(cd.go); telegram.haptic("medium"); }
  game.go();
  phase = "play";
}

// The round's over: when the game says (after its own show, as each game's
// code has it), module #64's results (0x87F0A098) at once, for everyone: the
// winners' banner over the game going on (the winners cheering, the others
// not: celebrate()), with its song and sound; 60 frames after it's down, the
// ranking (the remake's, for the menu the game goes on to with A). There's no
// FINISH: none of the games has one. Online, the server's ranking is the
// word (a device that's behind stops when it comes).
async function finish() {
  const my = round;
  phase = "end";
  current.finishedAt = performance.now();
  game.finish();
  telegram.haptic("success");
  if (current.online) net.send("done", { r: current.round }, true);
  current.results = game.celebrate();
  showWinners(current.results, true);
  await wait(RESULTS_AT * FRAME);
  if (round !== my || phase !== "end") return;
  if (current.online && !current.resultsIn) { $("#waiting").hidden = false; return; } // the server's are on their way
  showResults();
}
const resultsDue = () => performance.now() >= current.finishedAt + RESULTS_AT * FRAME;

function showResults() {
  if (phase !== "end") return;
  $("#waiting").hidden = true;
  const results = current.results;
  const mine = results.find((r) => r.i === me);
  const tie = results.filter((r) => r.place === 1).length > 1;
  const info = GAMES[current.game];
  $("#champion").hidden = !(mine.place === 1 && !tie);
  $("#verdict").textContent = mine.place === 1 ? (tie ? "It's a tie!" : "You win!") : ["", "", "2nd place", "3rd place", "4th place"][mine.place];
  $("#ranking").innerHTML = results.map((r) => `
    <li class="${r.i === me ? "me" : ""}" style="--c: ${PLAYER_COLOURS[r.i]}">
      <span class="place">${r.place}${["", "st", "nd", "rd", "th"][r.place]}</span>
      <img class="badge" src="${UI}badge_${badge(r.i)}.png" alt="">
      <span class="n"></span><span class="e">${info.unit(r.score)}</span></li>`).join("");
  [...$("#ranking").children].forEach((li, k) => {
    const i = results[k].i;
    li.querySelector(".n").textContent = seats[i].name;
    li.querySelector(".badge").alt = seats[i].human ? i + 1 + "P" : "COM";
  });
  // (a game's "lower" scores are times: the less the better; a null score didn't count)
  const key = current.game + ":" + current.level, had = best[key];
  const isBest = mine.score !== null && mine.score !== undefined
    && (info.lower ? !(mine.score >= (had ?? Infinity)) : !(mine.score <= (had ?? -Infinity)));
  $("#newbest").hidden = !isBest;
  if (isBest) { best[key] = mine.score; telegram.set(bestKey(current.game, current.level), mine.score); showBest(); }
  phase = "results";
  resultButtons();
  telegram.back(current.online ? toLobby : toTitle);
  show("#results");
}

const shown = [-1, -1, -1, -1];
function updateHud() {
  for (let i = 0; i < 4; i++) {
    const n = game.score(i);
    if (n !== shown[i]) { cards[i].querySelector(".num").innerHTML = digits(Math.max(0, n)); shown[i] = n; }
  }
  game.hud(playing());
}

// ------------------------------------------------------------------- input
// While a round is on, the game gets the taps and keys (src/<game>/index.js).

app.addEventListener("pointerdown", (e) => {
  unlock();
  if (!playing() || e.target.closest("button")) return;
  game.pointerdown(e);
  e.preventDefault();
});
app.addEventListener("pointermove", (e) => { if (playing()) game.pointermove?.(e); });
for (const ev of ["pointerup", "pointercancel", "pointerleave"]) app.addEventListener(ev, (e) => game?.pointerup?.(e));
app.addEventListener("contextmenu", (e) => e.preventDefault());

addEventListener("keydown", (e) => {
  unlock();
  if (e.target.closest?.("input")) return;
  if (playing() && game.keydown(e)) { e.preventDefault(); return; }
  if ((e.code === "Enter" || e.code === "Space") && !playing()) {
    const b = { title: "#play", results: "#again", lobby: "#start" }[phase];
    if (b && !$(b).hidden && !$(b).disabled) { e.preventDefault(); $(b).click(); }
  }
});
addEventListener("keyup", (e) => game?.keyup?.(e));
addEventListener("blur", () => game?.blur?.());

// ------------------------------------------------------------------ online
// Rooms of up to four, on the server in tools/rooms.py. Invites are links:
// t.me/<bot>?startapp=CODE from inside Telegram (config.telegramApp), or this
// page with ?room=CODE (from a browser, so friends without Telegram can come).

let net = null, room = null, mySeat = 0, status = "", roomError = "";

function serverUrl() {
  const u = (testing && params.get("server")) || config.server;
  return u || (location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/ws";
}

// the same id after a reload keeps the seat (sessionStorage: per tab; ?as=
// tells apart several players in one tab, as in party.html)
function clientId() {
  if (telegram.userId) return "tg" + telegram.userId;
  const key = "egg_id" + (params.get("as") || "");
  try {
    let id = sessionStorage.getItem(key);
    if (!id) sessionStorage.setItem(key, (id = Math.random().toString(36).slice(2, 12)));
    return id;
  } catch { return (window.eggId ||= Math.random().toString(36).slice(2, 12)); }
}

function myName() {
  if (telegram.userName) return telegram.userName;
  try { return params.get("name") || localStorage.getItem("egg_name") || ""; } catch { return params.get("name") || ""; }
}

function setUrlRoom(code) { // so a reload (or a copied address) comes back to the room
  if (telegram.inside) return;
  const u = new URL(location.href);
  if (code) u.searchParams.set("room", code); else u.searchParams.delete("room");
  u.searchParams.delete("create");
  u.searchParams.delete("game");
  history.replaceState(null, "", u);
}

const hostName = () => room?.players.find((p) => p.seat === room.host)?.name || "the host";

function goOnline(code = "", create = false) {
  unlock();
  if (!net) connectNet();
  round++; // cancels a countdown
  room = null; current = null; roomError = "";
  phase = "lobby";
  game?.idle();
  music(null);
  renderLobby();
  show("#lobby");
  telegram.back(toTitle);
  // a new room starts with the game on the title (the server keeps it)
  net.open({ room: code.toUpperCase(), id: clientId(), name: myName(), create, tg: telegram.initData || undefined,
             game: !code || create ? gameId : undefined });
}

function toLobby() {
  round++;
  phase = "lobby";
  current = null;
  music(null);
  stopSound();
  renderLobby();
  show("#lobby");
  telegram.back(toTitle);
}

function connectNet() {
  net = new Net(serverUrl(), testing ? +params.get("lag") || 0 : 0); // (?lag=: a slower connection, to test with)
  net.on("status", (s) => { status = s; renderStatus(); });
  net.on("welcome", (m) => {
    mySeat = m.seat;
    setUrlRoom(m.room);
    if (phase === "end" && current?.online) net.send("done", { r: current.round }); // (in case it was lost)
  });
  net.on("room", (r) => {
    room = r; roomError = "";
    if (current?.online && r.state === "playing" && r.round === current.round) followRound(r);
    if (current?.online && phase === "end" && !current.resultsIn && r.state === "lobby" && r.round >= current.round) {
      current.resultsIn = true; // the results went out while this device was offline: go with its own counts
      if (resultsDue()) showResults();
    }
    if (phase === "lobby") { renderLobby(); if (r.game && r.game !== gameId) showGame(r.game).catch(() => {}); }
    if (phase === "results") resultButtons();
  });
  net.on("start", (m) => {
    if (current?.online && current.round === m.round) return; // already in it (a reconnect)
    if (!m.lineup.some((p) => p.seat === mySeat)) return; // joined mid-round: next one
    startRound({ online: true, game: m.game || "egg", round: m.round, level: m.level, seed: m.seed, goAt: m.go, me: mySeat,
                 lineup: m.lineup, host: m.host, start: m });
  });
  // the games' own messages about the round
  for (const id of ORDER) {
    for (const t of GAMES[id].messages || []) {
      net.on(t, (m) => { if (current?.online && current.game === id && m.r === current.round && game) game.remote(t, m); });
    }
  }
  net.on("results", (m) => {
    if (!current?.online || m.round !== current.round || current.resultsIn) return;
    current.resultsIn = true;
    if (playing()) { game.stop(); game.setScores(m.scores); finish(); return; } // time's up (this device was behind)
    if (phase !== "end") return;
    game.setScores(m.scores);
    if (current.results.some((r) => r.score !== m.scores[r.i])) { // (not what this device made it: the server's ranking)
      current.results = game.celebrate();
      showWinners(current.results, false);
    }
    if (resultsDue()) showResults();
  });
  net.on("error", (m) => { roomError = m.code; room = null; renderLobby(); });
  net.on("notice", (m) => {
    if (m.code !== "name") return;
    try { if (localStorage.getItem("egg_name") === m.name) localStorage.removeItem("egg_name"); } catch { /* private mode */ }
    net.hello.name = undefined; // not again on a reconnect
    showNotice(`"${m.name}" can't be used as a name here.`);
    if (phase === "lobby") renderLobby();
  });
}

let notice = "", noticeTimer = 0;
function showNotice(text) {
  notice = text;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => { notice = ""; renderStatus(); }, 5000);
  renderStatus();
}

// mid-round changes: someone left (a CPU takes their seat, played by the
// host), or the host left (the next one takes over the CPUs)
function followRound(r) {
  current.host = r.host;
  roundSeats(r.lineup);
  for (let z = 0; z < 4; z++) if (z !== me) game.setControl(z, seats[z].human || r.host !== me ? "remote" : "cpu");
  applySeats();
}

function resultButtons() {
  const on = current?.online, host = on && room?.host === mySeat;
  $("#again").disabled = on && !host;
  $("#again").textContent = !on || host ? "Play again" : `Waiting for ${hostName()}…`;
  $("#menu").textContent = on ? "Lobby" : "Menu";
}

function renderStatus() {
  const el = $("#status");
  const text = {
    "no-room": "That room is closed. Make a new one, or check the code.",
    full: "That room is full (4 players).",
    "bad-code": "That isn't a room code.",
    busy: "The game server is busy. Try again in a bit.",
  }[roomError] || notice || (room && status === "online" ? "" : {
    connecting: "Connecting…",
    reconnecting: room ? "Reconnecting…" : "Can't reach the game server. Trying again…",
  }[status] || "");
  el.textContent = text;
  el.classList.toggle("bad", !!roomError || !!notice || (!room && status === "reconnecting"));
}

function renderLobby() {
  renderStatus();
  const r = room, host = !!r && r.host === mySeat, busy = r?.state === "playing";
  $("#code").textContent = r ? r.room : "····";
  $("#invite").hidden = $("#link").hidden = !r;
  const link = r ? inviteLink(r.room) : "";
  if ($("#linkText").value !== link) $("#linkText").value = link;
  $("#note").textContent = !r ? "" : busy ? "A round is on. You'll play in the next one."
    : host ? "Up to 4 players. Empty spots are played by CPUs." : `Waiting for ${hostName()} to start…`;
  $("#start").hidden = r ? !host || busy : !roomError;
  $("#start").textContent = r ? "Start" : "New room";
  markLevel($("#lobby .levels:not(.controls)"), r?.level || "normal");
  for (const group of document.querySelectorAll("#lobby .levels:not(.controls), #lobby .games")) {
    group.classList.toggle("locked", !host);
    group.hidden = !r;
  }
  for (const b of document.querySelectorAll("#lobby .games button")) b.setAttribute("aria-checked", b.dataset.game === (r?.game || gameId));
  const list = $("#seats");
  if (list.contains(document.activeElement)) return; // typing a name: don't pull it away
  list.innerHTML = "";
  list.hidden = !r;
  for (let i = 0; i < 4 && r; i++) {
    const p = r.players.find((x) => x.seat === i);
    const li = list.appendChild(document.createElement("li"));
    li.style.setProperty("--c", PLAYER_COLOURS[i]);
    li.className = (p ? "" : "cpu") + (p && i === mySeat ? " me" : "");
    const img = li.appendChild(document.createElement("img"));
    img.className = "badge";
    img.alt = p ? i + 1 + "P" : "COM";
    img.src = `${UI}badge_${p ? i + 1 + "p" : "com_" + COLOUR_NAMES[i]}.png`;
    let n;
    if (p && i === mySeat && !telegram.userName) { // outside Telegram you can type a name
      n = document.createElement("input");
      n.value = p.name;
      n.maxLength = 16;
      n.setAttribute("aria-label", "Your name");
      n.addEventListener("change", () => {
        const v = n.value.trim();
        if (!v) return;
        try { localStorage.setItem("egg_name", v); } catch { /* private mode */ }
        net.hello.name = v; // and after a reconnect
        net.send("name", { name: v });
      });
      n.addEventListener("keydown", (e) => { if (e.key === "Enter") n.blur(); });
    } else {
      n = document.createElement("span");
      n.textContent = p ? p.name : "CPU";
    }
    n.classList.add("n");
    li.appendChild(n);
    const tags = [];
    if (p?.away) tags.push(["away", "reconnecting"]);
    else if (p && r.host === i) tags.push(["", "host"]);
    if (p && i === mySeat) tags.push(["", "you"]);
    for (const [cls, text] of tags) {
      const t = li.appendChild(document.createElement("span"));
      t.className = "tag " + cls;
      t.textContent = text;
    }
  }
}

function inviteLink(code) {
  if (config.telegramApp && telegram.inside) return `${config.telegramApp}?startapp=${code}`;
  const u = new URL(location.href);
  u.search = "?room=" + code;
  if (testing && params.get("server")) u.searchParams.set("server", params.get("server")); // friends need it too
  return u.href;
}

async function invite() {
  if (!room) return;
  const info = GAMES[room.game] || GAMES[gameId];
  const url = inviteLink(room.room), text = `${info.invite} Room ${room.room}`;
  if (telegram.share(url, text)) return;
  try {
    if (navigator.share) return await navigator.share({ title: info.name, text, url });
  } catch (e) { if (e.name === "AbortError") return; }
  copyLink();
}

// the link box stays selected either way, so a failed copy can be done by hand
async function copyLink() {
  const box = $("#linkText"), button = $("#copy");
  box.focus();
  box.setSelectionRange(0, box.value.length);
  let ok = false;
  try { await navigator.clipboard.writeText(box.value); ok = true; } catch { // none on plain http
    try { ok = document.execCommand("copy"); } catch { /* old browser */ }
  }
  button.textContent = ok ? "Copied!" : "Selected";
  clearTimeout(copyLink.timer);
  copyLink.timer = setTimeout(() => { button.textContent = "Copy"; }, 2000);
}

// -------------------------------------------------------------------- boot

// the game pickers on the title and in the lobby: the games' name banners
function buildPickers() {
  for (const group of document.querySelectorAll(".games")) {
    for (const id of ORDER) {
      const b = group.appendChild(document.createElement("button"));
      b.setAttribute("role", "radio");
      b.dataset.game = id;
      b.style.backgroundImage = `url(${GAMES[id].art})`;
      b.innerHTML = `<img src="${GAMES[id].banner}" alt="${GAMES[id].name}">`;
    }
  }
  for (const b of document.querySelectorAll("#title .games button")) {
    b.addEventListener("click", () => {
      sfx.tap(); telegram.haptic("select");
      telegram.set("game", b.dataset.game);
      showGame(b.dataset.game).catch(() => {});
    });
  }
  for (const b of document.querySelectorAll("#lobby .games button")) {
    b.addEventListener("click", () => {
      if (room?.host !== mySeat) return;
      sfx.tap(); telegram.haptic("select");
      for (const x of document.querySelectorAll("#lobby .games button")) x.setAttribute("aria-checked", x === b);
      net.send("game", { game: b.dataset.game });
    });
  }
}

async function boot() {
  applySeats();
  buildPickers();
  const keys = ["level", "muted", "game"];
  for (const id of ORDER) for (const l of ["easy", "normal", "hard"]) keys.push(bestKey(id, l));
  for (const id of ORDER) if (GAMES[id].controls) keys.push(controlsKey(id));
  const got = await Promise.all(keys.map((k) => telegram.get(k)));
  const saved = Object.fromEntries(keys.map((k, i) => [k, got[i]]));
  for (const id of ORDER) for (const l of ["easy", "normal", "hard"]) {
    const v = saved[bestKey(id, l)];
    if (v !== null && v !== undefined && v !== "" && Number.isFinite(+v)) best[id + ":" + l] = +v;
  }
  for (const id of ORDER) if (GAMES[id].controls && saved[controlsKey(id)] in GAMES[id].controls) controls[id] = saved[controlsKey(id)];
  const code = telegram.startParam || params.get("room");
  const first = params.get("game") in GAMES ? params.get("game") : saved.game in GAMES ? saved.game : "egg";
  try { await showGame(first); } catch { return; }
  setLevel(["easy", "normal", "hard"].includes(saved.level) ? saved.level : "normal");
  setMuted(saved.muted === "1");
  $("#sound").textContent = isMuted() ? "Sound off" : "Sound on";
  if (testing && params.has("debug")) { // for testing from the console
    window.mg = { get game() { return game?.game; }, get mini() { return game; }, paused: false, phase: () => phase,
                  lean: (d) => game?.debug.lean?.(d), cut: () => game?.debug.cut?.(), show: showGame, title: toTitle,
                  net: () => net, room: () => room, me: () => me, sound: audioDebug };
  }

  for (const b of document.querySelectorAll("#title .levels:not(.controls) button")) {
    b.addEventListener("click", () => { sfx.tap(); telegram.haptic("select"); setLevel(b.dataset.level); telegram.set("level", level); });
  }
  for (const b of document.querySelectorAll("#lobby .levels:not(.controls) button")) {
    b.addEventListener("click", () => {
      if (room?.host !== mySeat) return;
      sfx.tap(); telegram.haptic("select");
      markLevel($("#lobby .levels:not(.controls)"), b.dataset.level);
      net.send("level", { level: b.dataset.level });
    });
  }
  for (const group of document.querySelectorAll(".controls")) {
    group.addEventListener("click", (e) => {
      const c = e.target.closest("[data-controls]")?.dataset.controls;
      if (!c) return;
      sfx.tap(); telegram.haptic("select");
      setControls(gameId, c);
    });
  }
  $("#sound").addEventListener("click", () => {
    setMuted(!isMuted());
    $("#sound").textContent = isMuted() ? "Sound off" : "Sound on";
    telegram.set("muted", isMuted() ? "1" : "0");
    sfx.tap();
  });
  $("#play").addEventListener("click", play);
  $("#friends").addEventListener("click", () => { sfx.tap(); goOnline(); });
  $("#again").addEventListener("click", () => (current?.online ? net.send("start") : play()));
  $("#menu").addEventListener("click", () => (current?.online ? toLobby() : toTitle()));
  $("#start").addEventListener("click", () => { sfx.tap(); if (room) net.send("start"); else goOnline(); });
  $("#invite").addEventListener("click", () => { sfx.tap(); invite(); });
  $("#copy").addEventListener("click", () => { sfx.tap(); copyLink(); });
  $("#linkText").addEventListener("click", (e) => e.target.setSelectionRange(0, e.target.value.length));
  $("#leave").addEventListener("click", () => { sfx.tap(); toTitle(); });
  $("#join").addEventListener("submit", (e) => {
    e.preventDefault();
    const c = $("#joinCode").value.trim();
    if (!CODE.test(c)) { roomError = "bad-code"; renderStatus(); return; }
    $("#joinCode").value = "";
    $("#joinCode").blur();
    if (c.toUpperCase() !== room?.room) goOnline(c);
  });

  new ResizeObserver(layout).observe(app);
  telegram.onResize(layout);
  layout();
  if (code && CODE.test(code)) goOnline(code, params.has("create")); // from an invite
  else toTitle();
  $("#loading").hidden = true;

  const clock = new THREE.Clock();
  // (a frame that throws is reported, once, and the next goes on: three.js stops its loop on a throw,
  // and the game would freeze there)
  const said = new Set();
  renderer.setAnimationLoop(() => {
    try {
      tick(window.mg?.paused ? 0 : Math.min(clock.getDelta(), 0.1));
    } catch (e) {
      if (!said.has(e.message)) { said.add(e.message); console.error(e); }
    }
  });
  if (window.mg) window.mg.tick = tick; // (the tests step it by hand while the page is hidden)
}

// one frame: the round on (on the server's clock online), the HUD, the picture
function tick(dt) {
  if (game) {
    const on = phase === "play";
    if (on && current.online) {
      // on the server's clock: catch up in small steps (after a hiccup, or rejoining mid-round)
      let behind = Math.min((net.now() - current.goAt) / 1000 - game.time, 10);
      catchingUp = behind > 0.25;
      while (behind > 1e-4 && game.state === "play") {
        const step = Math.min(behind, 1 / 30);
        game.step(step, true);
        behind -= step;
      }
      catchingUp = false;
    } else game.step(dt, on);
    if (on && game.state === "over" && phase === "play") finish();
    game.animate(dt, performance.now() / 1000);
    updateHud();
  }
  render();
}

boot();
