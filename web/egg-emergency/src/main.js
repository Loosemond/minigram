import * as THREE from "three";
import { loadAssets } from "./assets.js";
import { Game, zoneX, ZONE_W, VIEW_TOP, VIEW_BOTTOM, BACKDROP, PX } from "./game.js";
import { buildStage } from "./stage.js";
import { Effects } from "./fx.js";
import { sfx, music, unlock, setMuted, isMuted, debug as sound } from "./audio.js";
import { telegram } from "./telegram.js";
import { Net } from "./net.js";
import config from "./config.js";

const BG = "#4a3a30"; // the brick base of the backdrop, for Telegram's header and the page
const PLAYER_COLOURS = ["#2f5de0", "#23a043", "#dc3030", "#e8a412"]; // 1P-4P, as on the game's badges
const COLOUR_NAMES = ["blue", "green", "red", "yellow"];
const COUNTDOWN = 2650; // ms from the countdown's start to GO (online, the server says when GO is)
const REMOTE_DELAY = 0.3; // s: other devices' players are shown this far behind, so their leans arrive in time
const CODE = /^[A-Za-z]{4,6}$/;
telegram.init(BG);

const $ = (s) => document.querySelector(s);
const app = $("#app");
const cards = [...document.querySelectorAll(".card")];
const params = new URLSearchParams(location.search);
// ?debug and ?server= are for testing: on this computer, or with config.debug
const testing = config.debug || /^(localhost|127\.0\.0\.1|\[::1\])$|\.localhost$|\.test$/.test(location.hostname);

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
    b.src = `assets/ui/badge_${badge(i)}.png`;
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
renderer.outputColorSpace = THREE.LinearSRGBColorSpace; // the colours as they are (see assets.js)
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setClearColor("#17110e"); // behind the small boxes
renderer.autoClear = false;

const scene = new THREE.Scene();
// N64-style shade = ambient + N.L x sun (x PI: three's lights are physical units);
// surfaces facing the camera come out at about the texture's own colour
scene.add(new THREE.AmbientLight(0xffffff, 0.7 * Math.PI));
const sun = new THREE.DirectionalLight(0xffffff, 0.42 * Math.PI);
sun.position.set(-1.5, 3, 4);
scene.add(sun);

// ------------------------------------------------------------------ layout
// Landscape: one camera on all four players, like the game. Portrait: your
// Chansey fills the screen and the other three get small boxed views along
// the top, each framed on its own bay.

let views = [];
const frames = $("#frames");

// fit [width] x [bottom, top] around the player(s) in the Chansey's plane, the
// camera level with the scene and far back with a narrow lens, close to the
// game's straight-on picture. Extra height goes below (the water), so drops
// always enter at the top edge; extra width shows more of the building.
function frameCamera(v) {
  const cam = v.cam, top = v.top ?? VIEW_TOP, bottom = v.bottom ?? VIEW_BOTTOM;
  cam.aspect = v.w / v.h;
  const t = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2);
  const d = Math.max((top - bottom) / 2 / t, v.width / 2 / (t * cam.aspect));
  const cy = top - d * t;
  const cx = v.zone === undefined ? 0 : zoneX(v.zone);
  if (v.zone === undefined) cam.layers.enableAll();
  else { cam.layers.set(0); cam.layers.enable(v.zone + 1); }
  v.base = new THREE.Vector3(cx, cy, d);
  cam.position.copy(v.base);
  cam.lookAt(cx, cy, 0);
  cam.updateProjectionMatrix();
}

function place(el, style) { Object.assign(el.style, { left: "auto", right: "auto", top: "auto", bottom: "auto", transform: "none" }, style); }

function layout() {
  const W = app.clientWidth, H = app.clientHeight;
  renderer.setSize(W, H, false);
  const safe = $("#safe").getBoundingClientRect();
  const left = $("#left");
  frames.innerHTML = "";
  app.classList.toggle("portrait", W / H < 1.25);
  if (W / H >= 1.25) {
    const cam = views.find((v) => v.zone === undefined)?.cam || new THREE.PerspectiveCamera(20, 1, 0.1, 200);
    views = [{ cam, x: 0, y: 0, w: W, h: H, width: BACKDROP.w * PX }]; // the game's whole screen
    frameCamera(views[0]);
    for (let i = 0; i < 4; i++) {
      const p = new THREE.Vector3(zoneX(i), 0, 0).project(cam);
      // on the bridge's front, under each Chansey (the roofs are where the eggs come from)
      place(cards[i], { left: ((p.x + 1) / 2) * W + "px", bottom: H - safe.bottom + 8 + "px", transform: "translateX(-50%)" });
      cards[i].classList.remove("mini");
    }
    place(left, { right: W - safe.right + 10 + "px", top: safe.top + 10 + "px" });
  } else {
    // each small box shows exactly its own bay, pole to pole, from the bridge's
    // front up to where the eggs are a moment from the hands; the boxes keep
    // that shape and sit apart, so each player's area reads on its own
    const MINI = { width: ZONE_W + 0.1, bottom: -0.5, top: 1.95 };
    const aspect = MINI.width / (MINI.top - MINI.bottom);
    const pad = 8, gap = 10, border = 3, room = safe.right - safe.left - 2 * pad;
    let miniH = Math.round(H * 0.22), miniW = Math.round(miniH * aspect);
    if (3 * miniW + 2 * gap > room) { miniW = Math.floor((room - 2 * gap) / 3); miniH = Math.round(miniW / aspect); }
    const strip = safe.top + miniH + 2 * pad;
    const x0 = Math.round((W - 3 * miniW - 2 * gap) / 2);
    const cams = views.length === 4 ? views.map((v) => v.cam) : [0, 1, 2, 3].map(() => new THREE.PerspectiveCamera(22, 1, 0.1, 200));
    const others = [0, 1, 2, 3].filter((i) => i !== me);
    views = [{ cam: cams[0], zone: me, x: 0, y: strip, w: W, h: H - strip, width: ZONE_W }];
    others.forEach((z, k) => {
      views.push({ cam: cams[k + 1], zone: z, mini: true, x: x0 + k * (miniW + gap), y: safe.top + pad, w: miniW, h: miniH, ...MINI });
    });
    for (const v of views) {
      frameCamera(v);
      cards[v.zone].classList.toggle("mini", !!v.mini);
      if (!v.mini) continue;
      place(cards[v.zone], { left: v.x + v.w / 2 + "px", top: v.y + v.h - 3 + "px", transform: "translate(-50%, -100%)" });
      const f = frames.appendChild(document.createElement("div"));
      f.className = "frame";
      Object.assign(f.style, {
        left: v.x - border + "px", top: v.y - border + "px", width: v.w + 2 * border + "px", height: v.h + 2 * border + "px",
        borderWidth: border + "px", borderColor: PLAYER_COLOURS[v.zone],
      });
    }
    place(cards[me], { left: safe.left + 8 + "px", top: strip + 8 + "px" });
    place(left, { right: W - safe.right + 8 + "px", top: strip + 12 + "px" });
  }
}

function render() {
  const H = app.clientHeight;
  renderer.setScissorTest(false);
  renderer.clear(); // the whole canvas: the strip behind the small boxes
  renderer.setScissorTest(true);
  for (const v of views) {
    const y = H - v.y - v.h;
    renderer.setViewport(v.x, y, v.w, v.h);
    renderer.setScissor(v.x, y, v.w, v.h);
    v.cam.position.copy(v.base);
    if (game.shake && !v.mini) {
      v.cam.position.x += (Math.random() - 0.5) * game.shake * 0.25;
      v.cam.position.y += (Math.random() - 0.5) * game.shake * 0.25;
    }
    renderer.clearDepth();
    renderer.render(scene, v.cam);
  }
}

// ------------------------------------------------------------------- input
// Like the game's L and R buttons: hold a side to lean, the last one pressed wins.

const held = new Map(); // pointer id or key -> -1 | 1
let order = [];
function hold(id, dir) { held.set(id, dir); order = order.filter((x) => x !== id); order.push(id); }
function letGo(id) { held.delete(id); order = order.filter((x) => x !== id); }
function lean() { return order.length ? held.get(order[order.length - 1]) : 0; }
const sideOf = (x) => (x < app.clientWidth / 2 ? -1 : 1);
const playing = () => phase === "play" || phase === "countdown";

app.addEventListener("pointerdown", (e) => {
  unlock();
  if (!playing() || e.target.closest("button")) return;
  hold("p" + e.pointerId, sideOf(e.clientX));
  e.preventDefault();
});
app.addEventListener("pointermove", (e) => {
  if (held.has("p" + e.pointerId)) held.set("p" + e.pointerId, sideOf(e.clientX)); // sliding across
});
for (const ev of ["pointerup", "pointercancel", "pointerleave"]) app.addEventListener(ev, (e) => letGo("p" + e.pointerId));
app.addEventListener("contextmenu", (e) => e.preventDefault());

const KEYS = { ArrowLeft: -1, KeyA: -1, KeyQ: -1, KeyL: -1, ArrowRight: 1, KeyD: 1, KeyE: 1, KeyR: 1 };
addEventListener("keydown", (e) => {
  unlock();
  if (e.target.closest?.("input")) return;
  if (e.code in KEYS && playing()) { if (!e.repeat) hold(e.code, KEYS[e.code]); e.preventDefault(); }
  else if ((e.code === "Enter" || e.code === "Space") && !playing()) {
    const b = { title: "#play", results: "#again", lobby: "#start" }[phase];
    if (b && !$(b).hidden && !$(b).disabled) { e.preventDefault(); $(b).click(); }
  }
});
addEventListener("keyup", (e) => letGo(e.code));
addEventListener("blur", () => { held.clear(); order = []; });

// --------------------------------------------------------------- game flow
// A round: { online, level, seed, me, goAt } and, online, { round, lineup,
// host, scores }. Solo, the CPUs play here. Online, the server deals the seed
// and GO time, every device runs the round on the server's clock, each plays
// its own Chansey (the host's also the CPUs), and the server sends the ranking.

let phase = "loading", level = "normal", round = 0, game, fx, stage;
let current = null; // the round being played
let catchingUp = false; // fast-forwarding an online round: no sounds
const best = {};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = (now, at) => new Promise((r) => setTimeout(r, Math.max(0, at - now())));

// the countdown is the game's own 3, 2, 1, GO! (image bank 360)
function banner(what) {
  const b = $("#banner");
  b.innerHTML = what.startsWith("img:") ? `<img src="assets/ui/${what.slice(4)}.png" alt="">` : `<span>${what}</span>`;
  b.classList.remove("show");
  void b.offsetWidth; // restart the animation
  b.classList.add("show");
}

function flash(i, cls) {
  const c = cards[i];
  c.classList.remove(cls);
  void c.offsetWidth;
  c.classList.add(cls);
}

// numbers in the game's small HUD digits (image bank 404)
function digits(n) { return String(n).split("").map((d) => `<img src="assets/ui/n${d}.png" alt="">`).join(""); }

function show(screen) {
  for (const s of ["#title", "#results", "#lobby"]) $(s).hidden = s !== screen;
  $("#hud").hidden = !!screen;
  if (screen) $("#waiting").hidden = true;
}

function markLevel(group, l) { for (const b of group.querySelectorAll("button")) b.setAttribute("aria-checked", b.dataset.level === l); }
function setLevel(l) {
  level = l;
  markLevel($("#title .levels"), l);
  $("#best").textContent = best[l] ? best[l] + " eggs" : "–";
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
  game.reset(level);
  fx.clear();
  music(null);
  show("#title");
}

function play() { startRound({ online: false, level, me: 0 }); }

async function startRound(s) {
  unlock();
  const my = ++round;
  current = s;
  me = s.me;
  if (s.online) roundSeats(s.lineup); else soloSeats();
  applySeats();
  layout();
  const control = s.online ? [0, 1, 2, 3].map((z) => (z === me ? "local" : seats[z].human || s.host !== me ? "remote" : "cpu")) : undefined;
  game.reset(s.level, s.seed, { me, control, delay: REMOTE_DELAY, drops: s.drops, leans: s.leans, hits: s.hits, settled: s.settled });
  fx.clear();
  held.clear(); order = [];
  show(null);
  phase = "countdown";
  telegram.back(toTitle);
  const now = s.online ? () => net.now() : () => performance.now();
  if (!s.online) s.goAt = now() + COUNTDOWN;
  for (const n of [3, 2, 1]) {
    const at = s.goAt - n * 750;
    await until(now, at);
    if (round !== my) return;
    if (now() < at + 500) { banner("img:count" + n); sfx.count(); } // (not when rejoining mid-round)
  }
  await until(now, s.goAt);
  if (round !== my) return;
  if (now() < s.goAt + 1000) { banner("img:go"); sfx.go(); telegram.haptic("medium"); }
  music("egg");
  game.start();
  if (s.scores) s.scores.forEach((e, i) => { game.players[i].eggs = e; }); // rejoining: the eggs so far
  phase = "play";
}

async function finish() {
  const my = round;
  phase = "finish";
  current.finishedAt = performance.now();
  banner("FINISH!"); sfx.finish(); music(null, 40); telegram.haptic("success");
  if (current.online) {
    net.send("done", { r: current.round }, true);
    await wait(1300);
    if (round === my && phase === "finish") $("#waiting").hidden = false; // the results come from the server
    return;
  }
  await wait(1300);
  if (round === my) showResults();
}

async function showResults() {
  const my = round;
  $("#waiting").hidden = true;
  const results = game.celebrate();
  const mine = results.find((r) => r.player.i === me);
  if (mine.place === 1) sfx.win();
  await wait(1700);
  if (round !== my) return;
  const tie = results.filter((r) => r.place === 1).length > 1;
  $("#champion").hidden = !(mine.place === 1 && !tie);
  $("#verdict").textContent = mine.place === 1 ? (tie ? "It's a tie!" : "You win!") : ["", "", "2nd place", "3rd place", "4th place"][mine.place];
  $("#ranking").innerHTML = results.map((r) => `
    <li class="${r.player.i === me ? "me" : ""}" style="--c: ${PLAYER_COLOURS[r.player.i]}">
      <span class="place">${r.place}${["", "st", "nd", "rd", "th"][r.place]}</span>
      <img class="badge" src="assets/ui/badge_${badge(r.player.i)}.png" alt="">
      <span class="n"></span><span class="e"><i class="egg"></i>${r.eggs}</span></li>`).join("");
  [...$("#ranking").children].forEach((li, k) => {
    const i = results[k].player.i;
    li.querySelector(".n").textContent = seats[i].name;
    li.querySelector(".badge").alt = seats[i].human ? i + 1 + "P" : "COM";
  });
  const lvl = current.level, isBest = mine.eggs > (best[lvl] || 0);
  $("#newbest").hidden = !isBest;
  if (isBest) { best[lvl] = mine.eggs; telegram.set("best_" + lvl, mine.eggs); setLevel(level); }
  phase = "results";
  resultButtons();
  telegram.back(current.online ? toLobby : toTitle);
  show("#results");
}

const shown = [-1, -1, -1, -1, -1];
function updateHud() {
  for (let i = 0; i < 4; i++) {
    const n = game.players[i].eggs;
    if (n !== shown[i]) { cards[i].querySelector(".num").innerHTML = digits(n); shown[i] = n; }
  }
  const left = game.eggsLeft;
  if (left !== shown[4]) { $("#left .num").innerHTML = digits(left); shown[4] = left; }
  const l = lean();
  $("#padL").classList.toggle("on", playing() && l < 0);
  $("#padR").classList.toggle("on", playing() && l > 0);
}

// ------------------------------------------------------------------ online
// Rooms of up to four, on the server in tools/rooms.py. Invites are links:
// t.me/<bot>/<app>?startapp=CODE in Telegram (config.telegramApp), or this
// page with ?room=CODE.

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
  history.replaceState(null, "", u);
}

const hostName = () => room?.players.find((p) => p.seat === room.host)?.name || "the host";

function goOnline(code = "", create = false) {
  unlock();
  if (!net) connectNet();
  round++; // cancels a countdown
  room = null; current = null; roomError = "";
  phase = "lobby";
  game.reset(level);
  fx.clear();
  music(null);
  renderLobby();
  show("#lobby");
  telegram.back(toTitle);
  net.open({ room: code.toUpperCase(), id: clientId(), name: myName(), create, tg: telegram.initData || undefined });
}

function toLobby() {
  round++;
  phase = "lobby";
  current = null;
  renderLobby();
  show("#lobby");
  telegram.back(toTitle);
}

function connectNet() {
  net = new Net(serverUrl());
  net.on("status", (s) => { status = s; renderStatus(); });
  net.on("welcome", (m) => {
    mySeat = m.seat;
    setUrlRoom(m.room);
    if (phase === "finish" && current?.online) net.send("done", { r: current.round }); // (in case it was lost)
  });
  net.on("room", (r) => {
    room = r; roomError = "";
    if (current?.online && r.state === "playing" && r.round === current.round) followRound(r);
    if (current?.online && phase === "finish" && !current.resultsIn && r.state === "lobby" && r.round >= current.round) {
      current.resultsIn = true; // the results went out while this device was offline: go with its own counts
      showResults();
    }
    if (phase === "lobby") renderLobby();
    if (phase === "results") resultButtons();
  });
  net.on("start", (m) => {
    if (current?.online && current.round === m.round) return; // already in it (a reconnect)
    if (!m.lineup.some((p) => p.seat === mySeat)) return; // joined mid-round: next one
    const drops = m.drops.map((seat) => seat.map(([t, col, k, fall]) => ({ t, col, kind: k === "v" ? "voltorb" : "egg", fall })));
    startRound({ online: true, round: m.round, level: m.level, seed: m.seed, goAt: m.go, me: mySeat,
                 lineup: m.lineup, host: m.host, scores: m.scores, drops, leans: m.leans, hits: m.hits, settled: m.settled });
  });
  net.on("lean", (m) => { if (current?.online && m.r === current.round) game.remoteLean(m.s, m.g, m.l); });
  net.on("ev", (m) => { if (current?.online && m.r === current.round) game.told(m.s, m.n, { k: m.k, e: m.e }); });
  net.on("results", (m) => {
    if (!current?.online || m.round !== current.round || current.resultsIn) return;
    current.resultsIn = true;
    if (game.state === "play") { game.stop(); banner("FINISH!"); current.finishedAt = performance.now(); } // time's up
    m.scores.forEach((e, i) => { game.players[i].eggs = e; });
    phase = "finish";
    const my = round;
    setTimeout(() => { if (round === my) showResults(); }, Math.max(0, current.finishedAt + 1300 - performance.now()));
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
  markLevel($("#lobby .levels"), r?.level || "normal");
  $("#lobby .levels").classList.toggle("locked", !host);
  $("#lobby .levels").hidden = !r;
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
    img.src = `assets/ui/badge_${p ? i + 1 + "p" : "com_" + COLOUR_NAMES[i]}.png`;
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
  if (config.telegramApp) return `${config.telegramApp}?startapp=${code}`;
  const u = new URL(location.href);
  u.search = "?room=" + code;
  if (testing && params.get("server")) u.searchParams.set("server", params.get("server")); // friends need it too
  return u.href;
}

async function invite() {
  if (!room) return;
  const url = inviteLink(room.room), text = `Catch eggs with me in Egg Emergency! Room ${room.room}`;
  if (telegram.share(url, text)) return;
  try {
    if (navigator.share) return await navigator.share({ title: "Egg Emergency", text, url });
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

async function boot() {
  applySeats();
  let assets;
  try {
    assets = await loadAssets("assets/", (k) => { $("#loading .bar i").style.width = k * 100 + "%"; });
  } catch (err) {
    console.error(err);
    $("#loading p").textContent = "Couldn't load the game's files. (Developers: run tools/web_assets.py.)";
    return;
  }
  try { sessionStorage.removeItem("egg-reloads"); } catch {} // the page's retries (index.html) start over
  stage = buildStage(scene, assets);
  fx = new Effects(scene, assets);
  game = new Game(scene, assets, fx);
  const mine = (p) => p.i === me && !catchingUp;
  game.on("catch", (p) => { flash(p.i, "bump"); if (mine(p)) { sfx.catch(p.i); telegram.haptic("light"); } });
  game.on("miss", (p) => { if (mine(p)) sfx.splash(p.i); });
  game.on("boom", (p, lost) => { flash(p.i, "hurt"); if (mine(p)) { sfx.shock(p.i); if (lost) sfx.lost(p.i); telegram.haptic("heavy"); } });
  game.on("dud", (p) => { if (mine(p)) sfx.splash(p.i); });
  game.on("finish", finish);
  // online, what this device plays goes to the others
  // (kept while offline, and sent on reconnecting, so the server's copy of the leans stays whole)
  game.on("lean", (s, l, g) => { if (current?.online) net.send("lean", { r: current.round, s, g, l }, true); });
  game.on("result", (r) => { if (current?.online) net.send("ev", { r: current.round, ...r }, true); });
  if (testing && params.has("debug")) { // for testing from the console
    window.egg = { game, fx, scene, paused: false, phase: () => phase, lean: (d) => (d ? hold("debug", d) : letGo("debug")),
                   net: () => net, room: () => room, me: () => me, sound };
  }

  const [e, n, h, savedLevel, muted] = await Promise.all(
    ["best_easy", "best_normal", "best_hard", "level", "muted"].map((k) => telegram.get(k)));
  Object.assign(best, { easy: +e || 0, normal: +n || 0, hard: +h || 0 });
  setLevel(savedLevel in best ? savedLevel : "normal");
  setMuted(muted === "1");
  $("#sound").textContent = isMuted() ? "Sound off" : "Sound on";

  for (const b of document.querySelectorAll("#title .levels button")) {
    b.addEventListener("click", () => { sfx.tap(); telegram.haptic("select"); setLevel(b.dataset.level); telegram.set("level", level); });
  }
  for (const b of document.querySelectorAll("#lobby .levels button")) {
    b.addEventListener("click", () => {
      if (room?.host !== mySeat) return;
      sfx.tap(); telegram.haptic("select");
      markLevel($("#lobby .levels"), b.dataset.level);
      net.send("level", { level: b.dataset.level });
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
    const code = $("#joinCode").value.trim();
    if (!CODE.test(code)) { roomError = "bad-code"; renderStatus(); return; }
    $("#joinCode").value = "";
    $("#joinCode").blur();
    if (code.toUpperCase() !== room?.room) goOnline(code);
  });

  new ResizeObserver(layout).observe(app);
  telegram.onResize(layout);
  layout();
  const code = telegram.startParam || params.get("room");
  if (code && CODE.test(code)) goOnline(code, params.has("create")); // from an invite
  else toTitle();
  $("#loading").hidden = true;

  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const dt = window.egg?.paused ? 0 : Math.min(clock.getDelta(), 0.1);
    if (phase === "play") game.players[me].want = lean();
    if (phase === "play" && current.online) {
      // on the server's clock: catch up in small steps (after a hiccup, or rejoining mid-round)
      let behind = Math.min((net.now() - current.goAt) / 1000 - game.time, 10);
      catchingUp = behind > 0.25;
      while (behind > 1e-4 && game.state === "play") {
        const step = Math.min(behind, 1 / 30);
        game.update(step);
        behind -= step;
      }
      catchingUp = false;
    } else game.update(dt);
    fx.update(dt);
    stage.update(performance.now() / 1000);
    updateHud();
    render();
  });
}

boot();
