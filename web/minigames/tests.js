// Regression tests (see tests.html). They use real games in frames
// (index.html?debug, through window.mg): each game's rules and CPU levels,
// played headless; its sound; and online, two players in a room on the rooms
// server, picking the game in the lobby and playing rounds while one of them
// meddles with it from the console the way a cheater would.

const $ = (s) => document.querySelector(s);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = (window.results = []);

// Egg Emergency's deals (src/egg/rules.js Deal: c 1-3, and 3 with no CPUs and
// everyone always over 80 %, the patterns' order and the falls), and a round on
// one of them with eggScript()'s leans (what came of every seat's drops): the
// same as JS_EGG_DEALS and JS_EGG_ROUNDS in tools/test_rooms.py, which checks
// the server's copy against them
const EGG_DEALS = { 1: "9485f9543049d735", 12345: "db9cf57a6206a50a", 2147483647: "2d5f99435a6e52fc" };
const EGG_ROUNDS = { 1: "b18f7fd09f89d7e1", 12345: "bc1c8b3550f4dcb3", 2147483647: "84e70798d4fdfd23" };
// (seat 0 goes for the next drop to come, Voltorbs too; seat 1 for the next egg; seats 2 and 3 a pattern)
function eggScript(z, g, d) {
  if (z >= 2) return [-1, 0, 1][((g >> (z + 2)) + z) % 3];
  let best = null;
  for (const r of d.drops) if (r.reach >= g && (z === 0 || r.kind === "e") && (!best || r.reach < best.reach)) best = r;
  return best ? best.side : 0;
}
// Clear Cut Challenge's deal() for every level code: the same as JS_DEALS in tools/test_rooms.py
const DEALS = { 1: "845261658a294406", 12345: "dcaad7cc4c79a603", 2147483647: "8c853818348d493e" };
// Eager Eevee's deal() for levels 1-3, with no one outside and with EEVEE_OUTS: the same as JS_EEVEE in tools/test_rooms.py
const EEVEE = { 1: "1d47aa9501e2a387", 12345: "d330183e33ae66eb", 2147483647: "708a50a8a21e7b38" };
const EEVEE_OUTS = [0, 1, 9, 6, 15];
// Streaming Stampede's questions (and the CPUs' answers and presses) for levels 1-3: the same as JS_STAMPEDE in tools/test_rooms.py
const STAMPEDE = { 1: "c33c69d5058f2c41", 12345: "8bad5c3faf1e1fa4", 2147483647: "ff29a0ea8c1ddc98" };
// Pichu's Power Plant's Electrodes and CPUs for c 0-3: the same as JS_PICHU in tools/test_rooms.py
const PICHU = { 1: "85b689e086341c65", 12345: "7a2d41e41a9793ae", 2147483647: "2f91d5687bee0e4b" };
// Tumbling Togepi: a race with seat 0 on TOGEPI_SCRIPT ([frame, x, y]) and three normal CPUs, every lane
// every 50 frames: the same as JS_TOGEPI in tools/test_rooms.py
const TOGEPI = { 1: "efcaeb571cb83ba1", 12345: "98649f14c45fb285", 2147483647: "897e6c53dd29b182" };
const TOGEPI_SCRIPT = [[0, 0, -60], [100, 45, -60], [160, 0, -60], [260, -60, -45], [300, 0, -60], [500, 30, 0], [530, 0, -60],
  [700, -45, -45], [760, 60, -60], [800, 0, -60]];
// Gutsy Golbat: a round with seats 0 and 2 on golbatPad() and two CPUs (normal, hard, easy), the
// world's digest() every 50 frames, the end and the hearts: the same as JS_GOLBAT in tools/test_rooms.py
const GOLBAT = { 1: "ef999629c57bfe9c", 12345: "fd9fbc24e01eae26", 2147483647: "a1db3b0f2ef6720e" };
const GOLBAT_LEVEL = { 1: "normal", 12345: "hard", 2147483647: "easy" };
// Barrier Ball: a round with seats 0 and 2 on barrierPad() and two CPUs (normal, hard, easy), the
// world's digest() every 50 frames on to the results, the end, the results' frame and the points;
// and two with four CPUs (normal): one with a goal after the end, one whose results come a frame
// later (a ball went just after it): the same as JS_BARRIER and JS_BARRIER_CPU in tools/test_rooms.py
const BARRIER = { 1: "baed3467350c0520", 12345: "46d69816c8c7591b", 2147483647: "7181b8b79a86077e" };
const BARRIER_CPU = { 22: "66c104cfdcadda70", 250: "420c8089c67e52e1" };
const BARRIER_LEVEL = { 1: "normal", 12345: "hard", 2147483647: "easy", 22: "normal", 250: "normal" };
const barrierPad = (z, t) => (z === 0 ? [[64, 0, -64, 32, -32, 0][Math.floor(t / 40) % 6], t % 23 === 0 || t % 61 === 7]
  : [[-64, 64][Math.floor(t / 70) % 2], t % 19 === 0]);
const golbatPad = (z, t) => (z === 0 ? [[64, 0, -64, 32, -32, 0][Math.floor(t / 90) % 6], t % 12 === 0 || t % 47 === 5]
  : [[-64, 64][Math.floor(t / 70) % 2], t % 9 === 0]);
// Rampage Rollout: a race with seats 0 and 2 on rolloutPad() and two CPUs (normal, hard, easy), the
// world's digest() every 50 frames, the end, the places and the frames in: the same as JS_ROLLOUT in tools/test_rooms.py
const ROLLOUT = { 1: "54a4ecbd48f149ad", 12345: "0478f9cb5f8a5194", 2147483647: "fb2a806822e44641" };
const ROLLOUT_LEVEL = { 1: "normal", 12345: "hard", 2147483647: "easy" };
// (seat 0 round the track, turning at the corners, with a false start; seat 2 a pattern)
const rolloutWay = (d) => (d.y < -150 && d.x > -200 ? 2 : d.x < -200 && d.y < 150 ? 4 : d.y > 150 && d.x < 200 ? 1 : 8);
// (and a quicker one, for the live tests: the CPUs' line, in tight round the block, src/rollout/rules.js cpu())
const rolloutDrive = (d) => [d.x < -171.2 ? 4 : 2, d.y > 115.7 ? 1 : 4, d.x > 171.2 ? 8 : 1, d.y < -115.7 ? 2 : 8, 4, 8, 2, 1][d.seg];
const rolloutPad = (z, t, w) => (z === 0 ? [rolloutWay(w.d[0]) | (t === 0 ? 16 : 0), t % 47 === 3]
  : [[8, 4, 2, 1, 0, 2][Math.floor(t / 40) % 6], t % 61 === 11]);
// Topsy-Turvy: a round with seats 0 and 2 on topsyPad() and two CPUs (normal, hard, easy), the world's
// digest() every 100 frames (the hard one to its end and the show after, the others 600 frames), the end,
// the points and the places: the same as JS_TOPSY in tools/test_rooms.py
const TOPSY = { 1: "787fac9096d5b8ba", 157: "272f45629a21406c", 2147483647: "a9b0c75e0b95888e" };
const TOPSY_LEVEL = { 1: "normal", 157: "hard", 2147483647: "easy" };
// (seat 0 at whoever's nearest, a RAPID SPIN now and then; seat 2 a pattern)
function topsyPad(z, t, w) {
  if (z !== 0) return [...[[64, 0], [0, 64], [-45, -45], [0, 0]][Math.floor(t / 60) % 4], t % 71 === 13];
  const me = w.p[0];
  let best = null, bd = Infinity;
  for (const q of w.p) {
    if (q === me) continue;
    const dx = q.pos[0] - me.pos[0], dz = q.pos[2] - me.pos[2];
    if (dx * dx + dz * dz < bd) { bd = dx * dx + dz * dz; best = [dx, dz]; }
  }
  const [dx, dz] = best;
  return [dx > 50 ? 64 : dx < -50 ? -64 : 0, dz < -50 ? 64 : dz > 50 ? -64 : 0, t % 53 === 5];
}
// Furret's Frolic: a round with seats 0 and 2 on furretPad() and two CPUs (normal, hard, easy), the world's
// digest() every 100 frames (the hard one to its end and the show after, the others 600 frames), the end,
// the points and the places: the same as JS_FURRET in tools/test_rooms.py
const FURRET = { 1: "71f7890a4652fb1b", 157: "5d54951a1f163b23", 2147483647: "1c343168cb41c113" };
const FURRET_LEVEL = { 1: "normal", 157: "hard", 2147483647: "easy" };
// (seat 0 at the first ball's hollow, a swing now and then; seat 2 a pattern)
function furretPad(z, t, w) {
  if (z !== 0) return [[1, 2, 0, 3, 4, 0][Math.floor(t / 45) % 6], t % 29 === 7];
  let s = 0;
  if (w.balls.length) {
    const [x, , zz] = w.balls[0].pos;
    s = x > 150 && zz < -150 ? 1 : x > 150 && zz > 150 ? 2 : x < -150 && zz < -150 ? 3 : x < -150 && zz > 150 ? 4 : 0;
  }
  return [s, t % 13 === 3];
}
// Delibird's Delivery: a round with seats 0 and 2 on deliPad() and two CPUs (normal, hard, easy), the world's
// digest() every 100 frames (the hard one to its end, the tally and a second of the show, the others 600
// frames), the end, the points and the places: the same as JS_DELIBIRD in tools/test_rooms.py
const DELIBIRD = { 1: "ed072f802be05f26", 157: "1172bf54263dbb00", 2147483647: "093aaa33d9bd2928" };
const DELIBIRD_LEVEL = { 1: "normal", 157: "hard", 2147483647: "easy" };
// (down to a gift on the belt, each in turn; up with two, or one now and then)
function deliPad(z, t, w) {
  const p = w.p[z];
  if (p.load >= 2 || (p.load > 0 && t % 300 > 200)) return [((t * 7 + z * 13) % 41) - 20, 64];
  if (!w.onBelt.length) return [0, 0];
  const g = w.onBelt[(z + Math.floor(t / 90)) % w.onBelt.length];
  const dx = g.x - p.x, dz = g.z - p.zz, l = Math.sqrt(dx * dx + dz * dz) || 1;
  return [Math.max(-64, Math.min(64, Math.round((dx / l) * 64))), Math.max(-64, Math.min(64, Math.round((-dz / l) * 64)))];
}
// the frame the first of three CPUs gets to full charge, the middle of 41 rounds (rules.js cpuPresses)
const CHARGE_TARGETS = { easy: [500, 590], normal: [365, 420], hard: [295, 345] };
// the best of the three CPUs' totals in a game, on average (Streaming Stampede: rules.js cpuPresses)
const COUNT_TARGETS = { easy: [54, 63], normal: [67, 76], hard: [74, 83] };
// how soon after the basket comes up the CPUs dash (frames, on average), by level (rules.js cpuPlan)
const DASH_TARGETS = { easy: [23.5, 26.5], normal: [18.5, 21.5], hard: [15.5, 18.5] };
// what it takes to win a solo round: the best of the three CPUs, on average
// over simulated rounds (Egg Emergency: the game's own CPUs, rules.js Brain:
// 56, 66 and 86 on these 20 rounds; Clear Cut Challenge: the game's own CPUs, rules.js cpuPlan)
const LEVEL_TARGETS = { easy: [50, 62], normal: [60, 72], hard: [80, 92] };
const CUT_TARGETS = { easy: [15, 26], normal: [35, 47], hard: [53, 65] };
// a short round, the same one tools/test_rooms.py plays on the server: [frame it
// comes in, side, kind], falling fast (17); they get to the hands on frames 33,
// 42, 51 (the Voltorb), 60 (in the hurt after it: it goes by at 66) and 82
const SHORT = [[1, 0, "e"], [10, 1, "e"], [19, 1, "v"], [28, 1, "e"], [50, -1, "e"]];

function assert(ok, msg) { if (!ok) throw new Error(msg); }

async function until(fn, what, timeout = 15000) {
  const end = performance.now() + timeout;
  for (;;) {
    let v;
    try { v = fn(); } catch { v = undefined; }
    if (v) return v;
    if (performance.now() > end) throw new Error("timed out waiting for " + what);
    await sleep(100);
  }
}

// Browsers pause a hidden page's animation frames, and with them the games:
// while this page is hidden, the tests step each frame's game themselves
// (window.mg.tick, a frame at a time: a hidden page's timers only run about
// once a second). The tests that play in real time (live) note if the page
// was hidden while they ran, in case that's why one failed.
let hides = 0; // (times the page has been hidden)
document.addEventListener("visibilitychange", () => { if (document.hidden) hides++; });
function pump(w) {
  let last = performance.now();
  const id = setInterval(() => {
    if (!w.frameElement) return clearInterval(id); // (its frame's gone)
    const now = performance.now(), dt = Math.min(5, (now - last) / 1000);
    last = now;
    if (!document.hidden || !w.mg?.tick) return;
    for (let k = 0; k < Math.round(dt * 30); k++) w.mg.tick(1 / 30);
  }, 100);
}

async function test(name, fn, { live = false } = {}) {
  const li = $("#list").appendChild(document.createElement("li"));
  li.className = "run";
  li.append(name);
  const detail = li.appendChild(document.createElement("div"));
  detail.className = "detail";
  const wasHidden = document.hidden, hides0 = hides;
  const t0 = performance.now();
  try {
    const d = (await fn()) || "";
    li.className = "pass";
    detail.textContent = `${d} (${((performance.now() - t0) / 1000).toFixed(1)} s)`.trim();
    results.push({ name, ok: true, detail: d });
    console.log("ok  ", name, d);
  } catch (e) {
    const unsure = live && (wasHidden || hides > hides0);
    li.className = unsure ? "skip" : "fail";
    detail.textContent = e.message + (unsure ? " (the page was hidden while it ran: run the tests again with it showing to be sure)" : "");
    results.push({ name, ok: unsure ? null : false, detail: detail.textContent });
    console.error(unsure ? "INCONCLUSIVE" : "FAIL", name, e);
  }
}

// a game in a frame, once it has loaded (into: a list to put its frame in)
async function frame(query, into) {
  const f = $("#frames").appendChild(document.createElement("iframe"));
  into?.push(f);
  f.src = "index.html?debug&" + query;
  await until(() => f.contentWindow.mg && f.contentWindow.mg.phase() !== "loading", "the game to load", 30000);
  pump(f.contentWindow);
  return f.contentWindow; // (it stays the frame's window across reloads)
}

// The live tests run in lanes, side by side, each with frames of its own:
// as many at once as MAX_FRAMES lets (each frame is a WebGL context, and a
// page gets 16: two spare), in the order they're given, each lane's closed when it ends.
const MAX_FRAMES = 14;
function lanesFrames() {
  const opened = [];
  return {
    open: (query) => frame(query, opened),
    // Ann (the host) and Bob in a new room on game id, in its lobby; their frames don't draw
    // (more: more for their URLs, e.g. "&lag=80")
    async pair(id, more = "") {
      const code = Array.from({ length: 4 }, () => "BCDFGHJKLMNPQRSTVWXZ"[Math.floor(Math.random() * 20)]).join("");
      const ann = await this.open(`norender&create&room=${code}&as=t-${id}-0&name=Ann&game=${id}${more}`);
      await until(() => ann.mg.room()?.room === code, "Ann's room");
      const bob = await this.open(`norender&create&room=${code}&as=t-${id}-1&name=Bob&game=${id}${more}`);
      const { GAMES } = await moduleOf(ann, "./src/games.js");
      await until(() => [ann, bob].every((w) => w.mg.room()?.players.length === 2 && w.mg.room().game === id && w.document.title === GAMES[id].name),
                  `Ann and Bob in the lobby, on ${GAMES[id].name}`, 30000);
      return { ann, bob, code };
    },
    close: () => opened.forEach((f) => f.remove()),
  };
}
function runLanes(lanes) {
  const waiting = [...lanes];
  let free = MAX_FRAMES, running = 0;
  return new Promise((done) => {
    const next = () => {
      while (waiting.length && waiting[0].frames <= free) {
        const l = waiting.shift(), f = lanesFrames();
        free -= l.frames;
        running++;
        Promise.resolve().then(() => l.fn(f)).catch((e) => console.error("FAIL a lane", e)).finally(() => {
          f.close();
          free += l.frames;
          running--;
          next();
        });
      }
      if (!waiting.length && !running) done();
    };
    next();
  });
}

// a module of the frame's own, e.g. "./src/egg/game.js"
const moduleOf = (w, path) => new w.Function(`return import('${path}')`)();
const sha16 = async (s) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))]
  .map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);

// run the frame's Egg Emergency flat out, with its page's hooks and effects off
function headless(w, fn) {
  const e = w.mg, g = e.game, saved = { listeners: g.listeners, fx: g.fx };
  e.paused = true;
  g.listeners = {};
  g.fx = new Proxy({}, { get: () => () => {} });
  try { return fn(g); } finally {
    Object.assign(g, saved);
    g.reset("normal");
    e.paused = false;
  }
}

// a scripted Egg Emergency player: leans toward its next egg (and walks into Voltorbs)
function autoplay(w) {
  const id = w.setInterval(() => {
    const e = w.mg;
    if (e?.phase() !== "play") return;
    const g = e.game, f = g.frame;
    let next = null;
    for (const d of g.drops) if (d.kind === "e" && d.reach >= f && (!next || d.reach < next.reach)) next = d;
    e.lean(next ? next.side : 0);
  }, 50);
  return () => { w.clearInterval(id); w.mg?.lean(0); };
}

// a scripted Clear Cut Challenge player: cuts early by `early` frames (0: on the
// target), from inside the game's steps, so it cuts on the frame even when the
// page catches up in big steps
function autocut(w, early) {
  const api = w.mg.mini, step = api.step;
  api.step = function (dt, on) {
    step.call(api, dt, on);
    const g = api.game, z = w.mg.me(), fr = g.time * 30, at = on && g.logAt(fr);
    if (at && !g.players[z].cuts[at.n] && fr >= at.t.drop + g.logs[at.n].T - early) g.press();
  };
  return () => { api.step = step; };
}

// a scripted Eager Eevee player: dashes `after` frames after the basket comes
// up (not at a Pineco), from inside the game's steps
function autodash(w, after) {
  const api = w.mg.mini, step = api.step;
  api.step = function (dt, on) {
    step.call(api, dt, on);
    const g = api.game, z = w.mg.me();
    if (!on || g.state !== "play") return;
    const { T, rd, t } = g.now;
    if (rd.kind !== 2 && t >= T.open + after && g.players[z].runner.can(t)) g.press("a");
  };
  return () => { api.step = step; };
}

// a scripted Streaming Stampede player: counts each question's answer (and
// `off` more), a press every 3 frames from the counting's start, from inside the game's steps
function autocount(w, off = 0) {
  const api = w.mg.mini, step = api.step;
  api.step = function (dt, on) {
    step.call(api, dt, on);
    const g = api.game, z = w.mg.me();
    if (!on || g.state !== "play") return;
    const { q, Q, f, k } = g.now;
    if (f >= 0 && k < 0 && f % 3 === 0 && g.players[z].presses[q].length < Q.answer + off) g.press();
  };
  return () => { api.step = step; };
}

// a scripted Pichu's Power Plant player: taps the button the current Electrode
// wants, held towards it, every `every` frames, from inside the game's steps
function autopress(w, every) {
  const api = w.mg.mini, step = api.step;
  let last = -99;
  api.step = function (dt, on) {
    step.call(api, dt, on);
    const g = api.game, t = g.frame;
    if (!on || g.state !== "play" || t - last < every || t < 1) return;
    const e = g.P.list[g.P.at.cur[t - 1]];
    if (e && e.from < t) { g.press(e.dir, e.btn); last = t; }
  };
  return () => { api.step = step; };
}

// a scripted Tumbling Togepi player: holds down, steering round what's
// ahead of it and for the arrows, from inside the game's steps
function steerFor(l, BOX) {
  let next = null;
  for (const o of l.slots) if (o.type >= 0 && o.z > l.z - 20 && o.z < l.z + 320 && (!next || o.z < next.z)) next = o;
  if (!next) return l.x < 128 ? 30 : l.x > 148 ? -30 : 0;
  if (next.type === 10) return Math.max(-60, Math.min(60, (next.x - l.x) * 2)); // (an arrow: on to it)
  const reach = BOX[next.type][0] * 13.8 + 22;
  if (Math.abs(next.x - l.x) > reach) return 0;
  return (l.x < next.x && next.x - reach > 66) || next.x + reach > 206 ? -60 : 60;
}
async function autorun(w) {
  const api = w.mg.mini, step = api.step, { BOX } = await moduleOf(w, "./src/togepi/rules.js");
  api.step = function (dt, on) {
    const g = api.game, z = w.mg.me();
    if (on && g.state === "play") g.setStick(steerFor(g.lanes[z], BOX), -60);
    step.call(api, dt, on);
  };
  return () => { api.step = step; };
}

// a Gutsy Golbat player: flies left and right, flapping every 10 frames or so
function autoflap(w) {
  const api = w.mg.mini, step = api.step;
  api.step = function (dt, on) {
    const g = api.game;
    if (on && g.state === "play") {
      const t = g.lastFrame + 1;
      g.setStick(Math.round(Math.sin(t / 37 + w.mg.me()) * 4) * 16);
      if (t % 10 === w.mg.me() % 10 && g.flaps === 0) g.flap();
    }
    step.call(api, dt, on);
  };
  return () => { api.step = step; };
}

// a Barrier Ball player: slides along its lane and back, smashing every 20 frames or so
function autoslide(w) {
  const api = w.mg.mini, step = api.step;
  api.step = function (dt, on) {
    const g = api.game;
    if (on && g.state === "play") {
      const t = g.lastFrame + 1;
      g.setStick(Math.round(Math.sin(t / 23 + w.mg.me()) * 4) * 16);
      if (t % 20 === w.mg.me() * 5 && g.smashes === 0) g.smash();
    }
    step.call(api, dt, on);
  };
  return () => { api.step = step; };
}

// a Rampage Rollout player: round the track, turning at the corners, a cloud every 40 frames or so
function autodrive(w) {
  const api = w.mg.mini, step = api.step;
  api.step = function (dt, on) {
    const g = api.game;
    if (on && g.state === "play") {
      g.setDpad(rolloutDrive(g.world.d[g.me]));
      if ((g.lastFrame + 1) % 40 === w.mg.me() * 7) g.press();
    }
    step.call(api, dt, on);
  };
  return () => { api.step = step; };
}

// a Topsy-Turvy player: at whoever's nearest, a RAPID SPIN when they're close
function autospin(w) {
  const api = w.mg.mini, step = api.step;
  api.step = function (dt, on) {
    const g = api.game;
    if (on && g.state === "play") {
      const [x, y, a] = topsyPad(0, g.lastFrame + 1, { p: [g.world.p[g.me], ...g.world.p.filter((q) => q !== g.world.p[g.me])] });
      g.setStick(x, y);
      if (a || (g.lastFrame + 1) % 29 === w.mg.me() * 3) g.press();
    }
    step.call(api, dt, on);
  };
  return () => { api.step = step; };
}

// a Furret's Frolic player: at the first ball's hollow, a swing now and then
function autobat(w) {
  const api = w.mg.mini, step = api.step;
  api.step = function (dt, on) {
    const g = api.game;
    if (on && g.state === "play") {
      const [s, a] = furretPad(0, g.lastFrame + 1, g.world);
      g.setSpot(s);
      if (a || (g.lastFrame + 1) % 17 === w.mg.me() * 3) g.press();
    }
    step.call(api, dt, on);
  };
  return () => { api.step = step; };
}

// a Delibird's Delivery player: down to the gifts, up with them (deliPad)
function autodeliver(w) {
  const api = w.mg.mini, step = api.step;
  api.step = function (dt, on) {
    const g = api.game;
    if (on && g.state === "play") g.setStick(...deliPad(g.me, g.lastFrame + 1, g.world));
    step.call(api, dt, on);
  };
  return () => { api.step = step; };
}

// the server's word on the seats this device plays: only when it disagrees
function watch(w) {
  const e = w.mg, rec = { off: [], judged: new Map() };
  e.game.on("result", (r) => rec.judged.set(r.s + ":" + r.n, r));
  e.net().on("ev", (m) => {
    if (e.game.control[m.s] === "remote") return;
    const mine = rec.judged.get(m.s + ":" + m.n);
    if (m.k === "m" || (mine && (mine.k !== m.k || mine.e !== m.e))) rec.off.push(m);
  });
  return rec;
}

const eggs = (w) => w.mg.game.players.map((p) => p.eggs);
function same(a, b, when, slack = 2) { // (each shows the other a little behind)
  const ea = eggs(a), eb = eggs(b);
  assert(ea.every((x, i) => Math.abs(x - eb[i]) <= slack), `${when}: Ann's device shows ${ea}, Bob's ${eb}`);
}
const ranking = (w) => [...w.document.querySelectorAll("#ranking li")].map((li) => li.textContent.replace(/\s+/g, " ").trim()).join(" | ");

// ------------------------------------------------------------------ the tests

const solo = await frame("game=egg");

await test("Egg Emergency: the deal and the judging are the same as the server's copy of them", async () => {
  const R = await moduleOf(solo, "./src/egg/rules.js");
  const dv = new DataView(new ArrayBuffer(4));
  const hex = (x) => { dv.setFloat32(0, x); return dv.getUint32(0).toString(16).padStart(8, "0"); };
  for (const [seed, want] of Object.entries(EGG_DEALS)) {
    let s = "";
    for (const [c, human] of [[1, false], [2, false], [3, false], [3, true]]) {
      const d = new R.Deal(+seed, c, { allHuman: human, want: () => true });
      while (!d.over) d.step();
      for (const r of d.rows) s += `${r.f},${r.slot},${r.code},${r.kind ?? "-"},${r.spin},${r.a};`;
      s += `|${d.ups.join(",")}|${d.perm.join(",")}|`;
    }
    for (const a of [17, 13, 10, 8]) s += R.fall(a).map(hex).join("") + "/";
    const got = await sha16(s);
    assert(got === want, `seed ${seed}: ${got}; tools/egg_rules.py expects ${want} (update both, and the digests)`);
  }
  const K = { catch: "c", hit: "h", pass: "m", miss: "m" };
  for (const [seed, want] of Object.entries(EGG_ROUNDS)) {
    const d = new R.Deal(+seed, [2, 1, 3][seed % 3]), out = [[], [], [], []];
    const seats = [0, 1, 2, 3].map((z) => new R.Seat(z, (what, row) => { if (K[what]) out[z].push(`${row.n}:${K[what]}:${seats[z].eggs}:${seats[z].f}`); }));
    for (let g = 1; ; g++) {
      d.step();
      seats.forEach((st, z) => st.step(g, d, R.LEAN[eggScript(z, g, d)]));
      if (d.clear(g)) break;
    }
    const got = await sha16(out.map((o) => o.join(";")).join("|"));
    assert(got === want, `round ${seed}: ${got}; tools/egg_rules.py expects ${want} (update both, and the digests)`);
  }
  // the patterns' numbers, as the audit and docs/minigames.md have them: Voltorbs and the last drop by level
  const stats = [1, 2, 3].map((c) => {
    const v = [], last = [];
    for (let s = 0; s < 40; s++) {
      const d = new R.Deal(s * 7919 + 1, c);
      while (!d.over) d.step();
      v.push(d.drops.filter((r) => r.kind === "v").length);
      last.push(d.rows.at(-1).f);
    }
    const med = (a) => a.sort((x, y) => x - y)[a.length >> 1];
    return [med(v), med(last)];
  });
  assert(stats[0][0] > stats[1][0] && stats[1][0] > stats[2][0] && stats[0][1] < stats[1][1] && stats[1][1] < stats[2][1], "by level: " + JSON.stringify(stats));
  return stats.map(([v, f], c) => `${["hard", "normal", "easy"][c]} ${v} Voltorbs, ${(f / 30).toFixed(0)} s`).join(", ");
});

await test("Egg Emergency: a drop lands by the lean when it reaches the hands, as the server judges it", async () => {
  const got = [];
  const end = headless(solo, (g) => {
    g.reset("normal", 1, { me: 0, control: ["local", "cpu", "cpu", "cpu"], fixed: SHORT, a: 17 });
    g.on("result", (r) => { if (r.s === 0) got.push([r.n, r.k, r.e].join()); });
    g.start();
    const script = [[0, 0], [35, 1], [60, -1]]; // right for the second egg, stays for the Voltorb, left for the last
    while (g.state === "play" && g.time < 10) {
      g.held = script.filter(([f]) => f <= g.frame + 1).at(-1)[1];
      g.update(1 / 60);
    }
    return { state: g.state, eggs: g.seats[0].eggs, frame: g.frame };
  });
  // the same verdicts as the server's in tools/test_rooms.py: the stunned egg (3) doesn't count
  assert(got.join(" ") === "0,c,1 1,c,2 2,h,0 4,c,1", "got " + got.join(" "));
  assert(end.state === "over" && end.eggs === 1, JSON.stringify(end));
});

await test("Egg Emergency: with no CPUs, it speeds up at the server's word, dealt again from there", async () => {
  const R = await moduleOf(solo, "./src/egg/rules.js");
  // the server's deal when everyone's over 80 % (rules.js Deal with want, as tools/egg_rules.py runs it)
  const ref = new R.Deal(77, 3, { allHuman: true, want: () => true });
  while (ref.f < 1500) ref.step();
  assert(ref.ups.length === 2 && ref.cs.at(-1) === 1, "the speed-ups: " + ref.ups);
  const got = headless(solo, (g) => {
    g.reset("easy", 77, { me: 0, control: ["local", "remote", "remote", "remote"], start: { c: 3, human: true, leans: [[], [], [], []], ups: [] } });
    g.start();
    while (g.frame < ref.ups[1] + 40) g.update(1 / 30); // (the word comes late: it's gone by both)
    const before = g.deal.ups.length;
    g.serverUps(ref.ups);
    while (g.frame < 1500) g.update(1 / 30);
    const same = g.deal.rows.length === ref.rows.length && g.deal.rows.every((r, i) => r.f === ref.rows[i].f && r.code === ref.rows[i].code && r.kind === ref.rows[i].kind);
    return { before, ups: g.deal.ups.join(), same, c: g.deal.c };
  });
  assert(got.before === 0 && got.ups === ref.ups.join() && got.same && got.c === 1, JSON.stringify(got));
  return `faster at frames ${ref.ups.join(" and ")}`;
});

await test("Egg Emergency: CPU levels, what it takes to win a solo round", async () => {
  const report = [];
  headless(solo, (g) => {
    for (const level of ["easy", "normal", "hard"]) {
      const best = [], all = [];
      for (let s = 1; s <= 20; s++) {
        g.reset(level, s * 7717 + 3, { me: 0, control: ["cpu", "cpu", "cpu", "cpu"] });
        g.start();
        for (let n = 0; g.state === "play" && n < 30 * 120; n++) g.update(1 / 30);
        const e = g.seats.map((p) => p.eggs);
        all.push(...e);
        best.push(Math.max(e[1], e[2], e[3]));
      }
      const mean = Math.round(best.reduce((a, b) => a + b) / best.length), low = Math.min(...all);
      const [lo, hi] = LEVEL_TARGETS[level];
      report.push(`${level} ${mean}`);
      assert(mean >= lo && mean <= hi, `${level}: the best CPU averages ${mean} eggs, expected ${lo}-${hi}`);
      assert(low >= 5, `${level}: a CPU ended a round with ${low} eggs`);
    }
  });
  return report.join(", ");
});

// render a game's sound file offline: its songs and every effect
async function soundTest(bankUrl, songs, more) {
  const n64 = await import("./src/n64audio.js");
  const audio = await import("./src/audio.js");
  const bank = await n64.loadBank(bankUrl);
  // the engine flat out into an offline context: setup(engine), then at 0.15 s
  // later(engine), and at: [s, fn(engine)]
  async function render(secs, setup, later = () => {}, at = null) {
    const ctx = new OfflineAudioContext(2, 32000 * secs, 32000);
    const e = new n64.Engine(ctx, bank, ctx.destination);
    e.t0 = 0;
    let notes = 0;
    const add = e.voices.add.bind(e.voices);
    e.voices.add = (v) => { notes++; return add(v); };
    setup(e);
    while (e.time() < 0.15) e.step();
    later(e);
    clearInterval(e.timer);
    e.timer = null;
    while (e.time() < secs) {
      if (at && e.time() >= at[0]) { at[1](e); at = null; }
      e.step();
    }
    const buf = await ctx.startRendering(), x = buf.getChannelData(0), y = buf.getChannelData(1);
    let peak = 0, bad = 0, tail = 0;
    for (let i = 0; i < x.length; i++) {
      const v = Math.max(Math.abs(x[i]), Math.abs(y[i]));
      if (!(v <= 1e3)) bad++;
      peak = Math.max(peak, v);
      if (i >= x.length - 64000) tail += x[i] * x[i];
    }
    assert(!bad, `${bad} samples aren't numbers`);
    assert(!e.missing.size, "not in the sound file: " + [...e.missing].join(", "));
    return { e, notes, peak, tail: Math.sqrt(tail / 64000) };
  }
  const out = [];
  for (const [name, secs, check] of songs) {
    const r = await render(secs, (e) => audio.startSong(e, name));
    check(r);
    out.push(`${name}: ${r.notes} notes`);
  }
  const quiet = [];
  for (const name of Object.keys(bank.sounds)) {
    const r = await render(3, (e) => audio.startEffects(e), (e) => assert(audio.trigger(e, name, 1), name + " didn't start"));
    if (!r.notes || r.peak < 0.02) quiet.push(`${name} (${r.notes} notes, peak ${r.peak.toFixed(3)})`);
  }
  assert(!quiet.length, "silent: " + quiet.join(", "));
  if (more) out.push(await more(render, audio));
  return `${out.join("; ")}; ${Object.keys(bank.sounds).length} effects`;
}

await test("Egg Emergency: its music and sound effects play from sound.bin", () => soundTest("assets/egg/sound.bin", [
  ["egg", 26, (r) => {
    assert(r.notes > 500 && r.peak > 0.1 && r.peak < 1, `the song: ${r.notes} notes, peak ${r.peak.toFixed(2)}`);
    assert(r.tail > 0.01, "the song stopped instead of looping");
  }],
  ["win", 6, (r) => assert(r.notes > 20 && !r.e.players[0].enabled, `the fanfare: ${r.notes} notes, still going: ${r.e.players[0].enabled}`)],
]));

await test("Clear Cut Challenge: the logs are the same as the server's copy of them", async () => {
  const R = await moduleOf(solo, "./src/clearcut/rules.js");
  const dv = new DataView(new ArrayBuffer(4));
  const hex = (x) => { dv.setFloat32(0, x); return dv.getUint32(0).toString(16).padStart(8, "0"); };
  for (const [seed, want] of Object.entries(DEALS)) {
    let s = "";
    for (let c = 0; c < 5; c++) for (const log of R.deal(+seed, c)) s += `${log.T},${log.wait},${hex(log.line)};`;
    const got = await sha16(s);
    assert(got === want, `seed ${seed}: ${got}; tools/clearcut_rules.py expects ${want} (update both, and the digests)`);
  }
  // the falls, as the game's code works them out (normal: frames 16-27 after the drop)
  const falls = [0, 1, 2, 3, 4].map((c) => { const F = R.fall(c); return `${F.w0}+${F.size}`; }).join(" ");
  assert(falls === "14+12 12+11 14+12 16+14 19+16", "the windows: " + falls);
});

await test("Clear Cut Challenge: a cut scores as in the game", async () => {
  const R = await moduleOf(solo, "./src/clearcut/rules.js");
  const F = R.fall(2), log = { T: 20 };
  const pts = (f) => R.judge(F, log, f).pts;
  // on the target 20; early 10, 5, 4, 3, 2 then 1; late -1 to -5; out of reach, or no cut, -10
  const got = [20, 19, 18, 17, 16, 15, 14, 13, 21, 22, 23, 24, 25, 26, 0, null].map(pts).join(" ");
  assert(got === "20 10 5 4 3 2 1 -10 -1 -2 -3 -4 -5 -10 -10 -10", "got " + got);
  assert(R.add(3, -5) === 0 && R.add(3, 20) === 23, "a total below 0");
});

await test("Clear Cut Challenge: after a miss, A works again 45 frames on, unless it swung too early", async () => {
  const R = await moduleOf(solo, "./src/clearcut/rules.js");
  const F = R.fall(2); // (the log's down to the blade 16 frames after the drop)
  const again = [-100, -30, -29, -20, 30, 35].map((f) => { const a = R.again(F, f); return a === Infinity ? "locked" : a; }).join(" ");
  assert(F.reach === 16 && again === "-55 15 locked locked 75 80", `reach ${F.reach}, again: ${again}`);
  // a miss while the log hangs is open (it counts when the log's judged), and so is a late one while A can work again
  const open = [-100, -20, 30, 35, 20].map((f) => (R.open(F, R.judge(F, { T: 20 }, f).kind, f) ? 1 : 0)).join("");
  assert(open === "10100", "open: " + open);
});

await test("Clear Cut Challenge: CPU levels, what it takes to win a solo round", async () => {
  const R = await moduleOf(solo, "./src/clearcut/rules.js");
  const report = [];
  for (const level of ["easy", "normal", "hard"]) {
    const c = R.levelCode(level, true), F = R.fall(c), best = [];
    for (let s = 1; s <= 200; s++) {
      const seed = s * 7717 + 3, logs = R.deal(seed, c);
      const L = R.lcg(seed ^ 0x6d2b79f5), Q = R.quad(seed ^ 0x1b873593); // (as in game.js)
      const tick = L() % 21, moods = [0, 1, 2, 3].map(() => L() % 5), totals = [0, 0, 0], streak = [0, 0, 0];
      logs.forEach((log, n) => {
        for (let z = 0; z < 3; z++) {
          const plan = R.cpuPlan(F, c, log, n, totals[z], { L, Q, mood: moods[z + 1], tick, streak: streak[z] });
          const j = R.judge(F, log, plan);
          totals[z] = R.add(totals[z], j.pts);
          streak[z] = j.kind === "perfect" ? streak[z] + 1 : 0;
        }
      });
      best.push(Math.max(...totals));
    }
    const mean = Math.round(best.reduce((a, b) => a + b) / best.length), [lo, hi] = CUT_TARGETS[level];
    report.push(`${level} ${mean}`);
    assert(mean >= lo && mean <= hi, `${level}: the best CPU averages ${mean} points, expected ${lo}-${hi}`);
  }
  return report.join(", ");
});

await test("Clear Cut Challenge: its music and sound effects play from sound.bin", () => soundTest("assets/clearcut/sound.bin", [
  ["hang", 6, (r) => assert(r.notes > 10 && r.peak > 0.05 && r.peak < 1, `song 18: ${r.notes} notes, peak ${r.peak.toFixed(2)}`)],
  ["show", 6, (r) => assert(r.notes > 10 && r.peak > 0.05 && r.peak < 1, `song 19: ${r.notes} notes, peak ${r.peak.toFixed(2)}`)],
], async (render, audio) => {
  // the crowd goes on until it's stopped, and stops when it is (even before it started)
  const crowd = (e) => assert(audio.trigger(e, "hanging") && audio.trigger(e, "next"), "the crowd didn't start");
  const effects = (e) => audio.startEffects(e);
  const on = await render(9, effects, crowd);
  const off = await render(9, effects, crowd, [3, (e) => audio.stopEffect(e)]);
  const early = await render(9, effects, (e) => { crowd(e); audio.stopEffect(e); });
  assert(on.tail > 0.001, `the crowd stopped by itself (${on.tail.toFixed(4)} at the end)`);
  assert(off.tail < on.tail / 20, `the crowd didn't stop (${off.tail.toFixed(4)} at the end, ${on.tail.toFixed(4)} not stopped)`);
  assert(early.tail < on.tail / 20, `the crowd stopped before it started played anyway (${early.tail.toFixed(4)})`);
  return "the crowd stops";
}));

await test("Eager Eevee: the rounds are the same as the server's copy of them", async () => {
  const R = await moduleOf(solo, "./src/eevee/rules.js");
  for (const [seed, want] of Object.entries(EEVEE)) {
    let s = "";
    for (const level of [1, 2, 3]) for (const outs of [[], EEVEE_OUTS]) for (const rd of R.deal(+seed, level, outs)) s += `${rd.kind},${rd.fruit},${rd.piles},${rd.open},${rd.fakes.join("/")};`;
    const got = await sha16(s);
    assert(got === want, `seed ${seed}: ${got}; tools/eevee_rules.py expects ${want} (update both, and the digests)`);
  }
  for (let s = 0; s < 50; s++) assert(R.deal(s, 1)[0].kind !== R.PINECO, "a Pineco in the first round on Easy");
  const last = R.deal(12345, 2)[4];
  assert(last.kind === R.BERRIES && last.piles === 3, "the final round isn't three piles of strawberries");
});

await test("Eager Eevee: a dash, a feint, the basket and a Pineco, as in the game", async () => {
  const R = await moduleOf(solo, "./src/eevee/rules.js");
  const rs = R.deal(12345, 2), times = R.timeline(rs), T = times[1], r = new R.Runner(times, rs);
  assert(!r.press("a", T.play - 1), "A works in Aipom's call");
  assert(r.press("b", T.play + 5) && r.ready === T.play + 16, "a feint: back 11 frames on, got " + (r.ready - T.play - 5));
  assert(!r.press("a", T.play + 10), "A works in a feint");
  assert(r.press("a", T.play + 16).bonk && r.ready === T.play + 103, "into the basket: back 87 frames on");
  const o = T.open, d = r.press("a", o + 4);
  assert(d && !d.bonk && d.in === o + 8, "the basket's up 4 frames after it starts up, and in 4 frames later");
  const r3 = new R.Runner(times, rs), P = times[3];
  r3.press("a", P.open + 6);
  assert(r3.ready > P.end + 200 && r3.ready === r3.blownBack(P.open + 6), "blown away: back at " + r3.ready);
  const melon = { kind: R.FRUIT, fruit: R.MELON, piles: 1 };
  const tie = R.judge(melon, null, [30, 30, 31, null]);
  assert(tie.pts.join() === "1000,1000,0,0" && tie.decided === 30, "a tie: " + tie.pts);
  const berries = R.judge({ kind: R.BERRIES, piles: 1 }, null, [40, 42, null, null]);
  assert(berries.pts.join() === "600,400,0,0" && berries.decided === 45, "strawberries: " + berries.pts + " till " + berries.decided);
  const three = R.judge({ kind: R.BERRIES, piles: 3 }, null, [null, 50, null, null]);
  assert(three.pts.join() === "0,3000,0,0" && three.decided === 59, "three piles: " + three.pts);
  assert(R.reaction(T, o + 10, 1) === 19, "the reaction time's 3 (f - O - 4) + its random 0-2");
});

await test("Eager Eevee: Aipom waits for an Eevee outside the ring, and the tally at the end", async () => {
  const R = await moduleOf(solo, "./src/eevee/rules.js");
  // round 1's call 16 frames after GO (0x86B08B74)
  const rs = R.deal(12345, 2), times = R.timeline(rs);
  assert(times[0].start === 16 && R.ring(times, 15) === 0 && R.ring(times, 16) === 144, "the first call, and the ring's first turn: " + times[0].start);
  // the Pineco (round 4): blown away, outside as round 5 starts, so its open is drawn again: 70-120
  const r = new R.Runner(times, rs), P = times[3];
  r.press("a", P.open + 6);
  assert(!r.outside(P.open + 9) && r.outside(P.open + 10) && r.outside(times[4].start) && !r.outside(r.back()), "outside: from in at the Pineco to " + r.back());
  const others = [0, 1, 2].map(() => new R.Runner(times, rs)), mask = R.outsideMask([...others, r], times[4].start);
  assert(mask === 8, "the mask of who's outside: " + mask);
  for (let s = 0; s < 40; s++) for (const level of [1, 2, 3]) {
    const plain = R.deal(s, level), outs = R.deal(s, level, [0, 0, 0, 5]);
    assert(plain.slice(0, 3).every((rd, n) => rd.open === outs[n].open), "an earlier round changed");
    assert(outs[3].open >= 70 && outs[3].open <= 120, `seed ${s}: an open of ${outs[3].open} with two outside`);
  }
  // the tally: k more a frame, the hand-over the frame it's all in (0x86B08F20)
  assert(R.tallyFrames(0) === 0 && R.tallyFrames(1) === 1 && R.tallyFrames(1000) === 45 && R.tallyFrames(7000) === 118, "the tally's frames");
  assert(R.tallied(500, 3) === 6 && R.tallied(5, 3) === 5, "a total as the tally shows it");
  assert(R.handover(times, 3000) === times[4].end + 1 + 77, "the hand-over: " + R.handover(times, 3000));
  return `round 5's open with 4P outside: ${R.deal(12345, 2, [0, 0, 0, 0, 8])[4].open} (else ${rs[4].open})`;
});

await test("Eager Eevee: CPU levels, how soon after the basket's up they dash", async () => {
  const R = await moduleOf(solo, "./src/eevee/rules.js");
  const report = [];
  for (const level of ["easy", "normal", "hard"]) {
    const L = R.levelCode(level, true), after = [];
    let fooled = 0, fakes = 0;
    for (let s = 1; s <= 300; s++) {
      const seed = s * 7717 + 3, rs = R.deal(seed, L), times = R.timeline(rs), Q = R.quad(seed ^ 0x6d2b79f5);
      rs.forEach((rd, n) => {
        const T = times[n], plan = R.cpuPlan(L, rd, Q), r = new R.Runner(times, rs);
        r.ready = T.play;
        fakes += rd.fakes.length ? 1 : 0;
        let fell = false;
        for (let f = 0; T.play + f < T.close; f++) {
          const { A, B } = R.cpuInput(plan, rd, f), t = T.play + f;
          const res = A ? r.press("a", t) : B ? r.press("b", t) : null;
          if (res?.bonk) fell = true;
          if (res?.in) { if (rd.kind !== R.PINECO) after.push(t - T.open); break; }
          if (A && t >= T.open && t < T.open + 12) throw new Error(`${level}: a dash ${t - T.open} frames after the open`);
        }
        if (fell && rd.fakes.length) fooled++;
      });
    }
    const mean = after.reduce((a, b) => a + b) / after.length, [lo, hi] = DASH_TARGETS[level];
    report.push(`${level} ${mean.toFixed(1)} frames, ${Math.round((100 * fooled) / fakes)}% fooled`);
    assert(mean >= lo && mean <= hi, `${level}: the CPUs dash ${mean.toFixed(1)} frames after the open, expected ${lo}-${hi}`);
  }
  return report.join(", ");
});

await test("Eager Eevee: its music and sound effects play from sound.bin", () => soundTest("assets/eevee/sound.bin", [
  ["main", 4, (r) => assert(r.notes >= 2 && r.peak > 0.05 && r.peak < 1 && r.tail > 0.01, `song 53 (a held roll): ${r.notes} notes, peak ${r.peak.toFixed(2)}`)],
  ["round", 4, (r) => assert(r.notes > 5 && r.peak > 0.05 && r.peak < 1, `song 54: ${r.notes} notes, peak ${r.peak.toFixed(2)}`)],
]));

await test("Eager Eevee: a solo game, played headless: a quick player beats the CPUs", async () => {
  await solo.mg.show("eevee");
  const api = solo.mg.mini, g = api.game, saved = g.listeners;
  solo.mg.paused = true;
  g.listeners = {};
  const tally = [0, 0, 0, 0];
  try {
    for (let s = 1; s <= 6; s++) {
      g.reset("hard", s * 9973, { me: 0, control: ["local", "cpu", "cpu", "cpu"] });
      g.start();
      while (g.state === "play") {
        g.update(1 / 30);
        const { T, rd, t } = g.now;
        if (rd.kind !== 2 && t >= T.open + 7 && g.players[0].runner.can(t)) g.press("a"); // (0.23 s: a good reaction)
      }
      g.players.forEach((p, z) => { tally[z] += p.total; });
    }
  } finally {
    g.listeners = saved;
    solo.mg.paused = false;
    api.idle();
    await solo.mg.show("egg");
  }
  assert(tally[0] > Math.max(...tally.slice(1)), "the quick player didn't win: " + tally);
  return "totals over 6 games on Hard: " + tally.join(", ");
});

await test("Streaming Stampede: the questions are the same as the server's copy of them", async () => {
  const R = await moduleOf(solo, "./src/stampede/rules.js");
  const hex = (x) => { const d = new DataView(new ArrayBuffer(8)); d.setFloat64(0, x); return [...new Uint8Array(d.buffer)].map((b) => b.toString(16).padStart(2, "0")).join(""); };
  for (const [seed, want] of Object.entries(STAMPEDE)) {
    let s = "";
    for (const level of [1, 2, 3]) {
      let st = R.setup(level), since = [3, 3, 3, 3];
      const totals = [0, 0, 0, 0];
      for (let q = 0; q < R.QUESTIONS; q++) {
        const Q = R.question(+seed, q, st, totals, level), presses = [0, 1, 2, 3].map((z) => R.cpuPresses(Q, level, z, since[z]));
        since = presses.map((p, z) => R.sinceAfter(Q, p, since[z]));
        s += `${Q.answer},${Q.frames},${Q.code},${Q.cpu.join("/")},${presses.map((p) => p.length).join("/")};`;
        s += Q.stream.map((o) => `${o.kind},${o.role},${hex(o.x)},${o.z},${o.t2},${o.speed},${o.gone};`).join("");
        presses.forEach((p, z) => { totals[z] += R.points(q, p.length, Q.answer); });
        st = R.after(Q.state, q, totals, false);
      }
    }
    const got = await sha16(s);
    assert(got === want, `seed ${seed}: ${got}; tools/stampede_rules.py expects ${want} (update both, and the digests)`);
  }
});

await test("Streaming Stampede: a count scores as in the game; CPU levels", async () => {
  const R = await moduleOf(solo, "./src/stampede/rules.js");
  const pts = [5, 4, 6, 3, 7, 2, 0].map((c) => R.points(0, c, 5)).join();
  assert(pts === "10,5,5,1,1,0,0", "question 1, answer 5: " + pts);
  assert(R.points(2, 9, 9) === 20 && R.points(4, 27, 25) === 10 && R.points(4, 0, 1) === 0, "questions 3 and 5");
  // an answer's length by its points (the same as tools/test_rooms.py has)
  const lengths = [[0, [0, 0, 0, 0]], [1, [10, 5, 0, 1]], [3, [20, 0, 0, 0]], [4, [0, 0, 0, 0]], [4, [40, 20, 0, 0]]].map(([q, p]) => R.answerFrames(q, p)).join();
  assert(lengths === "159,171,191,242,320", "the answers' lengths: " + lengths);
  // the questions: one kind, then look-alikes, then all of them; never a family twice
  const Q = [];
  let st = R.setup(2);
  for (let q = 0; q < 5; q++) { Q.push(R.question(4242, q, st)); st = R.after(Q[q].state, q, [0, 0, 0, 0], false); }
  assert(new Set(Q[0].stream.map((o) => o.kind)).size === 1 && Q[4].what === null && Q[4].answer === Q[4].stream.length, "question 1 or 5");
  const report = [];
  for (const level of ["easy", "normal", "hard"]) {
    const L = R.LEVELS[level];
    let best = 0;
    for (let s = 1; s <= 300; s++) {
      const seed = s * 7717 + 3, totals = [0, 0, 0, 0], since = [3, 3, 3, 3];
      let state = R.setup(L);
      for (let q = 0; q < 5; q++) {
        const qq = R.question(seed, q, state, totals, L);
        for (let z = 1; z < 4; z++) {
          const p = R.cpuPresses(qq, L, z, since[z]);
          since[z] = R.sinceAfter(qq, p, since[z]);
          totals[z] += R.points(q, p.length, qq.answer);
        }
        state = R.after(qq.state, q, totals, false);
      }
      best += Math.max(totals[1], totals[2], totals[3]);
    }
    const mean = best / 300, [lo, hi] = COUNT_TARGETS[level];
    report.push(`${level} ${mean.toFixed(1)}`);
    assert(mean >= lo && mean <= hi, `${level}: the best CPU averages ${mean.toFixed(1)}, expected ${lo}-${hi}`);
  }
  return "the best CPU's total, on average: " + report.join(", ") + " (of 100)";
});

await test("Streaming Stampede: its music and sound effects play from sound.bin", () => soundTest("assets/stampede/sound.bin", [
  ["main", 6, (r) => assert(r.notes > 10 && r.peak > 0.05 && r.peak < 1, `song 30: ${r.notes} notes, peak ${r.peak.toFixed(2)}`)],
  ["results", 4, (r) => assert(r.notes > 5 && r.peak > 0.05 && r.peak < 1, `song 31: ${r.notes} notes, peak ${r.peak.toFixed(2)}`)],
]));

await test("Streaming Stampede: a solo game, played headless: a player who counts right beats the CPUs", async () => {
  await solo.mg.show("stampede");
  const api = solo.mg.mini, g = api.game, saved = g.listeners;
  solo.mg.paused = true;
  g.listeners = {};
  const tally = [0, 0, 0, 0];
  try {
    for (let s = 1; s <= 4; s++) {
      g.reset("hard", s * 9973, { me: 0, control: ["local", "cpu", "cpu", "cpu"] });
      g.start();
      while (g.state === "play") {
        g.update(1 / 30);
        const { q, Q, f, k } = g.now;
        if (f >= 0 && k < 0 && f % 3 === 0 && g.players[0].presses[q].length < Q.answer) g.press();
      }
      assert(g.players[0].total === 100, `counting right should make 100: ${g.players[0].total}`);
      g.players.forEach((p, z) => { tally[z] += p.total; });
    }
  } finally {
    g.listeners = saved;
    solo.mg.paused = false;
    api.idle();
    await solo.mg.show("egg");
  }
  assert(tally[0] > Math.max(...tally.slice(1)), "the player who counted right didn't win: " + tally);
  return "totals over 4 games on Hard: " + tally.join(", ");
});

await test("Pichu's Power Plant: the Electrodes and the CPUs are the same as the server's copy of them", async () => {
  const R = await moduleOf(solo, "./src/pichu/rules.js");
  for (const [seed, want] of Object.entries(PICHU)) {
    let s = "";
    for (const c of [0, 1, 2, 3]) {
      const P = R.pattern(+seed, c, 3000);
      s += P.list.map((e) => `${e.dir},${e.btn},${e.from},${e.close},${e.to};`).join("");
      s += R.cpuPresses(+seed, c, [false, true, true, true], P)
        .map((x) => (x ? x.full + ":" + x.presses.map((p) => `${p.t}/${p.dir}/${p.hit ? 1 : 0}`).join(",") : "-")).join("|");
    }
    const got = await sha16(s);
    assert(got === want, `seed ${seed}: ${got}; tools/pichu_rules.py expects ${want} (update both, and the digests)`);
  }
});

await test("Pichu's Power Plant: the presses and the shocks; CPU levels", async () => {
  const R = await moduleOf(solo, "./src/pichu/rules.js");
  // two at a time: from each pop-out to the end of the cycle before it's the current one
  const P = R.pattern(99, 2);
  let two = 0, none = 0;
  for (let t = 1; t < 2000; t++) {
    const n = [1, 2, 3, 4].filter((d) => R.liveAt(P, t, d)).length;
    if (n === 2) two++; else if (n !== 1) none++;
  }
  assert(!none && two > 900 && two < 1500, `${two} of 2000 frames with two out, ${none} with none or more`);
  const e = P.list[0], other = e.btn === R.A ? R.B : R.A, r = new R.Runner(P);
  const got = [r.press(1, e.dir, e.btn), r.press(2, e.dir, e.btn), r.press(4, e.dir, other), r.press(4 + R.SHOCK, e.dir, e.btn),
               r.press(5 + R.SHOCK, e.dir, e.btn), r.press(8 + R.SHOCK, 0, e.btn)].join();
  assert(got === "hit,,miss,,hit," && r.charge === 2, "presses: " + got);
  const report = [];
  for (const level of ["easy", "normal", "hard"]) {
    const c = R.levelCode(level, true), firsts = [];
    for (let s = 1; s <= 41; s++) {
      const P = R.pattern(s * 7717, c);
      firsts.push(R.finish(R.cpuPresses(s * 7717, c, [false, true, true, true], P).map((x) => x?.full ?? null)).at);
    }
    const mid = firsts.sort((a, b) => a - b)[20], [lo, hi] = CHARGE_TARGETS[level];
    report.push(`${level} ${mid}`);
    assert(mid >= lo && mid <= hi, `${level}: the first CPU is full at frame ${mid} (the middle round), expected ${lo}-${hi}`);
  }
  return "the first CPU full at frame: " + report.join(", ");
});

await test("Pichu's Power Plant: its music and sound effects play from sound.bin", () => soundTest("assets/pichu/sound.bin", [
  ["main", 6, (r) => assert(r.notes > 10 && r.peak > 0.05 && r.peak < 1, `song 21: ${r.notes} notes, peak ${r.peak.toFixed(2)}`)],
], async (render, audio) => {
  // the hum while a Pichu charges goes on until it's stopped
  const hum = (e) => assert(audio.trigger(e, "hum", 0), "the hum didn't start");
  const effects = (e) => audio.startEffects(e);
  const on = await render(6, effects, hum);
  const off = await render(6, effects, hum, [3, (e) => audio.stopEffect(e, "hum")]);
  assert(on.tail > 0.001, `the hum stopped by itself (${on.tail.toFixed(4)} at the end)`);
  assert(off.tail < on.tail / 20, `the hum didn't stop (${off.tail.toFixed(4)} at the end, ${on.tail.toFixed(4)} not stopped)`);
  return "the hum stops";
}));

await test("Pichu's Power Plant, \"Tap to aim\": a tap in your room aims at the lamp nearest it, and stays", async () => {
  await solo.mg.show("pichu");
  const api = solo.mg.mini, d = api.debug, got = [];
  try {
    api.setControls("tap");
    for (const dir of [1, 2, 3, 4]) {
      const [x, y] = d.tapFor(dir);
      got.push(d.aimAt(x, y));
    }
    const [x, y] = d.tapFor(3);
    got.push(d.aimAt(x + 2000, y)); // (outside your room: none)
    api.setControls("dpad");
  } finally { await solo.mg.show("egg"); }
  assert(got.join() === "1,2,3,4,0", "taps at the lamps aimed at " + got.join());
});

await test("Pichu's Power Plant: a solo game, played headless: a quick, right player beats the CPUs", async () => {
  await solo.mg.show("pichu");
  const api = solo.mg.mini, g = api.game, saved = g.listeners;
  solo.mg.paused = true;
  g.listeners = {};
  const wins = [0, 0, 0, 0], at = [];
  try {
    for (let s = 1; s <= 4; s++) {
      g.reset("hard", s * 9973, { me: 0, control: ["local", "cpu", "cpu", "cpu"] });
      g.start();
      let last = -9;
      while (g.state === "play") {
        g.update(1 / 30);
        const t = g.frame, e = g.P.list[g.P.at.cur[Math.max(0, t - 1)]];
        if (t - last >= 3 && e.from < t && g.press(e.dir, e.btn)) last = t;
      }
      const f = g.fin();
      assert(f, "no one got to full charge");
      f.winners.forEach((w, z) => { wins[z] += w ? 1 : 0; });
      at.push(f.at);
    }
  } finally {
    g.listeners = saved;
    solo.mg.paused = false;
    api.idle();
    await solo.mg.show("egg");
  }
  assert(wins[0] === 4, "the player who tapped right every 3 frames didn't always win: " + wins);
  return `wins over 4 games on Hard: ${wins.join(", ")}; full at frames ${at.join(", ")}`;
});

await test("Tumbling Togepi: the lanes and the CPUs are the same as the server's copy of them", async () => {
  const R = await moduleOf(solo, "./src/togepi/rules.js");
  const q = (v) => Math.floor(v * 1000 + 0.5);
  for (const [seed, want] of Object.entries(TOGEPI)) {
    const C = R.course(+seed), lanes = [0, 1, 2, 3].map((z) => new R.Lane(+seed, z, C, z ? 2 : 0));
    let s = C.pattern.join(",") + "/" + C.flip.join(",") + ";", k = 0, stick = [0, 0];
    for (let t = 0; t < 3000; t++) {
      while (k < TOGEPI_SCRIPT.length && TOGEPI_SCRIPT[k][0] <= t) stick = TOGEPI_SCRIPT[k++].slice(1);
      for (const l of lanes.slice(1)) l.step(t);
      R.rankCpus(lanes);
      lanes[0].step(t, stick[0], stick[1]);
      if (t % 50 === 0) s += lanes.map((l) => (l.finish !== null ? "F" : [q(l.x), q(l.z), l.tile, q(l.px), q(l.progress), l.state].join(","))).join("|") + ";";
      if (lanes.every((l) => l.finish !== null)) break;
    }
    s += lanes.map((l) => l.finish).join(",");
    const got = await sha16(s);
    assert(got === want, `seed ${seed}: ${got}; tools/togepi_rules.py expects ${want} (update both, and the digests)`);
  }
  // let go of the stick, a Togepi turns back to about straight on (the game's (1, -45): 0x86705F40);
  // its push aside when knocked goes by it (tools/test_rooms.py checks the server's the same)
  const l = new R.Lane(5, 0, R.course(5));
  for (let t = 0; t < 8; t++) l.step(t, 60, 0);
  const steered = l.side;
  l.step(8, 0, 0);
  assert(steered === 1 && l.side === 1 / Math.sqrt(2026), `facing aside: ${steered}, let go: ${l.side}`);
});

await test("Tumbling Togepi: its music and sound effects play from sound.bin", () => soundTest("assets/togepi/sound.bin", [
  ["main", 6, (r) => assert(r.notes > 10 && r.peak > 0.05 && r.peak < 1, `song 46: ${r.notes} notes, peak ${r.peak.toFixed(2)}`)],
]));

await test("Tumbling Togepi: a finger on your belt steers your Togepi to it", async () => {
  await solo.mg.show("togepi");
  const d = solo.mg.mini.debug, got = [];
  try {
    for (const x of [70, 138, 200]) {
      const [sx, sy] = d.tapFor(x, -100), at = d.beltX(sx, sy);
      got.push(at === null ? "-" : Math.round(at));
    }
  } finally { await solo.mg.show("egg"); }
  assert(got.join() === "70,138,200", `belt x for taps at 70, 138, 200 (${d.mode}): ${got.join()}`);
  return "the view: " + d.mode;
});

await test("Tumbling Togepi: a solo race, played headless: all four get there, and the places go by time", async () => {
  await solo.mg.show("togepi");
  const api = solo.mg.mini, g = api.game, saved = g.listeners, { BOX, timeOf } = await moduleOf(solo, "./src/togepi/rules.js");
  solo.mg.paused = true;
  g.listeners = {};
  const out = [];
  try {
    for (const [seed, level] of [[11, "easy"], [22, "hard"]]) {
      g.reset(level, seed, { me: 0, control: ["local", "cpu", "cpu", "cpu"] });
      g.start();
      while (g.state === "play" && g.frame < 2400) { g.setStick(steerFor(g.lanes[0], BOX), -60); g.update(1 / 30); }
      const fin = g.finishes(), res = g.results();
      assert(fin.every((f) => f !== null), `${level}: not all in: ${fin}`);
      const order = [...res].sort((a, b) => a.place - b.place).map((r) => fin[r.i]);
      assert(order.every((f, k) => !k || order[k - 1] <= f), `${level}: places ${res.map((r) => r.place)} for finishes ${fin}`);
      // (the game's sum: whole seconds, the frames past x 100 / 30 cut, and 0-2 hundredths more)
      assert(res.every((r) => r.score === timeOf(fin[r.i], seed, r.i) && r.score - Math.floor((fin[r.i] * 100) / 30) in { 0: 1, 1: 1, 2: 1 }),
        "the times: " + res.map((r) => r.score));
      out.push(`${level}: ${fin.join(", ")}`);
    }
  } finally {
    g.listeners = saved;
    solo.mg.paused = false;
    api.idle();
    await solo.mg.show("egg");
  }
  return "finish frames: " + out.join("; ");
});

await test("Gutsy Golbat: the world and the CPUs are the same as the server's copy of them", async () => {
  const R = await moduleOf(solo, "./src/golbat/rules.js");
  for (const [seed, want] of Object.entries(GOLBAT)) {
    const w = new R.World(+seed, GOLBAT_LEVEL[seed], [false, true, false, true]), parts = [];
    for (let t = 0; w.end === null; t++) {
      w.step(t, [golbatPad(0, t), null, golbatPad(2, t), null]);
      w.events = [];
      if (t % 50 === 0) parts.push(w.digest());
    }
    parts.push(w.end + ":" + w.scores.join(","));
    const got = await sha16(parts.join(";"));
    assert(got === want, `seed ${seed}: ${got}; tools/golbat_rules.py expects ${want} (update both, and the digests)`);
  }
});

await test("Gutsy Golbat: its music and sound effects play from sound.bin", () => soundTest("assets/golbat/sound.bin", [
  ["main", 6, (r) => assert(r.notes > 10 && r.peak > 0.05 && r.peak < 1, `song 13: ${r.notes} notes, peak ${r.peak.toFixed(2)}`)],
]));

await test("Gutsy Golbat: online, the others' pads coming in late run the world again to the same place", async () => {
  await solo.mg.show("golbat");
  const api = solo.mg.mini, g = api.game, saved = g.listeners, R = await moduleOf(solo, "./src/golbat/rules.js");
  solo.mg.paused = true;
  g.listeners = {};
  try {
    // seat 0 here, seat 2 someone else whose pads come in 4-12 frames late, 1 and 3 CPUs
    g.reset("normal", 77, { me: 0, control: ["local", "cpu", "remote", "cpu"], cpus: [false, true, false, true] });
    g.start();
    const late = [];
    let lastX = null;
    for (let t = 0; t < 1000; t++) {
      const [x, a] = golbatPad(2, t);
      if (x !== lastX || a) { late.push({ at: t + 4 + (t % 9), e: [t, x, a ? 1 : 0] }); lastX = x; }
      for (const l of late.filter((l) => l.at === t)) g.told("pad", { s: 2, f: l.e[0], x: l.e[1], a: l.e[2] });
      const [mx, ma] = golbatPad(0, t);
      g.setStick(mx);
      g.flaps = ma ? 1 : 0;
      g.step(t);
      g.lastFrame = t;
    }
    for (const l of late.filter((l) => l.at >= 1000)) g.told("pad", { s: 2, f: l.e[0], x: l.e[1], a: l.e[2] });
    g.runTo(g.lastFrame);
    // the same world with every pad on time
    // (this device's own count g.lead frames after they're made)
    const w = new R.World(77, "normal", [false, true, false, true]), L = g.lead;
    assert(L === 3, "this device's pads lead by " + L);
    for (let t = 0; t <= g.lastFrame; t++) w.step(t, [t < L ? [0, false] : golbatPad(0, t - L), null, [golbatPad(2, t)[0], golbatPad(2, t)[1]], null]);
    assert(g.world.digest() === w.digest(), `at frame ${g.lastFrame}: hearts ${g.world.scores} here, ${w.scores} on time`);
    return `frame ${g.lastFrame}: hearts ${w.scores.join(", ")}; ${g.snaps.length} saved frames`;
  } finally {
    g.listeners = saved;
    solo.mg.paused = false;
    api.idle();
    await solo.mg.show("egg");
  }
});

await test("Gutsy Golbat: a solo round, played headless: it ends when the meadow's in place, places by hearts, hands over as a loser lands", async () => {
  await solo.mg.show("golbat");
  const api = solo.mg.mini, g = api.game, saved = g.listeners, { END } = await moduleOf(solo, "./src/golbat/game.js");
  solo.mg.paused = true;
  g.listeners = {};
  const out = [];
  try {
    for (const [seed, level] of [[11, "easy"], [22, "hard"]]) {
      g.reset(level, seed, { me: 0, control: ["local", "cpu", "cpu", "cpu"] });
      g.start();
      while (g.state === "play" && g.frame < 2500) {
        const t = g.lastFrame + 1;
        g.setStick(Math.round(Math.sin(t / 30) * 4) * 16);
        if (t % 9 === 0) g.flap();
        g.update(1 / 30);
      }
      const res = g.results(), h = g.world.scores;
      assert(g.state === "over" && g.world.end === END, `${level}: over ${g.state}, the end at ${g.world.end}`);
      assert(res.every((r, k) => r.score === h[r.i] && (!k || res[k - 1].place <= r.place)), `${level}: results ${JSON.stringify(res)} for hearts ${h}`);
      assert(res.every((r) => r.place === 1 + h.filter((x) => x > h[r.i]).length), `${level}: places ${JSON.stringify(res)}`);
      assert(h.slice(1).some((x) => x > 0), `${level}: the CPUs caught nothing: ${h}`);
      // (the results come as the first loser lands on the floor, as the game's do: 0x86100874; at once if all four tie)
      const down = g.ends.filter((e) => e.landed).length, after = g.frame - END;
      assert(g.winners.every((x) => !x) ? after <= 1 : down >= 1 && after > 20 && after < 100, `${level}: handed over ${after} frames after the stop, ${down} down`);
      out.push(`${level}: ${h.join(", ")} (handed over ${after} frames after the stop)`);
    }
  } finally {
    g.listeners = saved;
    solo.mg.paused = false;
    api.idle();
    await solo.mg.show("egg");
  }
  return "hearts: " + out.join("; ");
});

await test("Gutsy Golbat: a finger on the left steers, a tap on the right flaps", async () => {
  await solo.mg.show("golbat");
  const api = solo.mg.mini, g = api.game, W = solo.innerWidth, H = solo.innerHeight;
  const got = [];
  try {
    g.state = "play";
    g.flaps = 0;
    api.pointerdown({ pointerId: 1, clientX: W * 0.2, clientY: H * 0.7 });
    api.pointermove({ pointerId: 1, clientX: W * 0.2 + 30, clientY: H * 0.7 });
    got.push(g.stick);
    api.pointermove({ pointerId: 1, clientX: W * 0.2 - 200, clientY: H * 0.7 }); // (past the stick's reach: full left)
    got.push(g.stick);
    api.pointerdown({ pointerId: 2, clientX: W * 0.8, clientY: H * 0.7 }); // (another finger, on the right)
    got.push(g.flaps);
    api.pointerup({ pointerId: 1 });
    got.push(g.stick);
  } finally {
    api.idle();
    await solo.mg.show("egg");
  }
  assert(got.join() === "48,-64,1,0", "stick, stick, flaps, stick: " + got.join());
});

await test("Barrier Ball: the world and the CPUs are the same as the server's copy of them", async () => {
  const R = await moduleOf(solo, "./src/barrier/rules.js");
  const late = {};
  for (const [seed, want, cpus] of [...Object.entries(BARRIER).map(([s, d]) => [s, d, [false, true, false, true]]),
    ...Object.entries(BARRIER_CPU).map(([s, d]) => [s, d, [true, true, true, true]])]) {
    const w = new R.World(+seed, BARRIER_LEVEL[seed], cpus), parts = [];
    late[seed] = 0;
    for (let t = 0; w.handOver === null; t++) {
      w.step(t, cpus[0] ? [] : [barrierPad(0, t), null, barrierPad(2, t), null]);
      if (w.end !== null && t > w.end) late[seed] += w.events.filter((e) => e[0] === "goal").length;
      w.events = [];
      if (t % 50 === 0) parts.push(w.digest());
    }
    parts.push(`${w.end}:${w.handOver}:${w.scores.join(",")}`);
    const got = await sha16(parts.join(";"));
    assert(got === want, `seed ${seed}: ${got}; tools/barrier_rules.py expects ${want} (update both, and the digests)`);
    assert(w.handOver - w.end === (+seed === 250 ? R.AFTER + 1 : R.AFTER), `seed ${seed}: the results ${w.handOver - w.end} frames on`);
  }
  // a goal in the first step after the end still counts (0x86306710 doesn't check the play)
  assert(late[22] === 1, "goals after the end: " + JSON.stringify(late));
  // its sines are the main program's table's (0x80087FB0), to the last bit
  const s = [0, 1024, 2048, 3072, 512].map((i) => R.sine(i));
  assert(s.join() === `0,1,0,-1,${Math.fround(Math.SQRT1_2)}`, "sines " + s);
});

await test("Barrier Ball: its music and sound effects play from sound.bin", () => soundTest("assets/barrier/sound.bin", [
  ["main", 6, (r) => assert(r.notes > 10 && r.peak > 0.05 && r.peak < 1, `song 35: ${r.notes} notes, peak ${r.peak.toFixed(2)}`)],
]));

await test("Barrier Ball: online, the others' pads coming in late run the world again to the same place", async () => {
  await solo.mg.show("barrier");
  const api = solo.mg.mini, g = api.game, saved = g.listeners, R = await moduleOf(solo, "./src/barrier/rules.js");
  solo.mg.paused = true;
  g.listeners = {};
  try {
    // seat 0 here, seat 2 someone else whose pads come in 4-12 frames late, 1 and 3 CPUs
    g.reset("normal", 77, { me: 0, control: ["local", "cpu", "remote", "cpu"], cpus: [false, true, false, true] });
    g.start();
    const late = [];
    let lastX = null, t = 0;
    for (; t < 1000 && g.world.end === null; t++) {
      const [x, a] = barrierPad(2, t);
      if (x !== lastX || a) { late.push({ at: t + 4 + (t % 9), e: [t, x, a ? 1 : 0] }); lastX = x; }
      for (const l of late.filter((l) => l.at === t)) g.told("pad", { s: 2, f: l.e[0], x: l.e[1], a: l.e[2] });
      const [mx, ma] = barrierPad(0, t);
      g.setStick(mx);
      g.smashes = ma ? 1 : 0;
      g.step(t);
      g.lastFrame = t;
    }
    for (const l of late.filter((l) => l.at >= t)) g.told("pad", { s: 2, f: l.e[0], x: l.e[1], a: l.e[2] });
    g.runTo(g.lastFrame);
    // the same world with every pad on time (this device's own count g.lead frames after they're made)
    const w = new R.World(77, "normal", [false, true, false, true]), L = g.lead;
    for (let f = 0; f <= g.lastFrame; f++) w.step(f, [f < L ? [0, false] : barrierPad(0, f - L), null, barrierPad(2, f), null]);
    assert(L === 3, "this device's pads lead by " + L); // (no round trips known: the most)
    assert(g.world.digest() === w.digest(), `at frame ${g.lastFrame}: points ${g.world.scores} here, ${w.scores} on time`);
    return `frame ${g.lastFrame}: points ${w.scores.join(", ")}; ${g.snaps.length} saved frames`;
  } finally {
    g.listeners = saved;
    solo.mg.paused = false;
    api.idle();
    await solo.mg.show("egg");
  }
});

await test("Barrier Ball: a solo round, played headless: it ends at 5 points or the minute, places by points", async () => {
  await solo.mg.show("barrier");
  const api = solo.mg.mini, g = api.game, saved = g.listeners, { AFTER } = await moduleOf(solo, "./src/barrier/game.js");
  const R = await moduleOf(solo, "./src/barrier/rules.js");
  solo.mg.paused = true;
  g.listeners = {};
  const out = [];
  try {
    for (const [seed, level] of [[11, "easy"], [22, "hard"]]) {
      g.reset(level, seed, { me: 0, control: ["local", "cpu", "cpu", "cpu"] });
      g.start();
      while (g.state === "play" && g.frame < 2500) {
        const t = g.lastFrame + 1;
        g.setStick(Math.round(Math.sin(t / 30) * 4) * 16);
        if (t % 17 === 0) g.smash();
        g.update(1 / 30);
      }
      const res = g.results(), p = g.world.scores, end = g.world.end;
      assert(g.state === "over" && (end === R.TIME || Math.max(...p) === R.GOAL), `${level}: over ${g.state}, the end at ${end}, points ${p}`);
      assert(g.frame >= end + AFTER && g.winners, `${level}: over at frame ${g.frame}, winners ${g.winners}`);
      assert(res.every((r, k) => r.score === p[r.i] && (!k || res[k - 1].place <= r.place)), `${level}: results ${JSON.stringify(res)} for points ${p}`);
      assert(res.every((r) => r.place === 1 + p.filter((x) => x > p[r.i]).length), `${level}: places ${JSON.stringify(res)}`);
      assert(p.some((x) => x > 0), `${level}: no one scored: ${p}`);
      out.push(`${level}: ${p.join(", ")} at frame ${end}`);
    }
  } finally {
    g.listeners = saved;
    solo.mg.paused = false;
    api.idle();
    await solo.mg.show("egg");
  }
  return "points: " + out.join("; ");
});

await test("Barrier Ball: a finger slides Mr. Mime the way it goes on the screen, half as far", async () => {
  await solo.mg.show("barrier");
  const api = solo.mg.mini, g = api.game, H = solo.innerHeight, { SEATS } = await moduleOf(solo, "./src/barrier/rules.js");
  const got = [];
  try {
    g.reset("normal", 5, { me: 0, control: ["local", "cpu", "cpu", "cpu"] });
    g.state = "play";
    const m = g.world.m[0], at = (x) => api.debug.onScreen(x, SEATS[0].slope * x + m.icpt)[0], sx = at(m.x);
    api.pointerdown({ pointerId: 1, clientX: sx, clientY: H * 0.8, pointerType: "touch" });
    api.pointermove({ pointerId: 1, clientX: sx + 20, clientY: H * 0.8, pointerType: "touch" });
    got.push(Math.round(at(g.target) - sx)); // (10 px right on the screen)
    api.pointermove({ pointerId: 1, clientX: sx - 400, clientY: H * 0.8, pointerType: "touch" }); // (past the lane's end)
    got.push(g.target === m.xmin || g.target === m.xmax ? "end" : g.target);
    api.pointermove({ pointerId: 1, clientX: sx - 380, clientY: H * 0.8, pointerType: "touch" }); // (and back a little: it comes back at once)
    got.push(Math.round(at(g.target) - at(g.target === m.xmin ? m.xmin : m.xmax)));
    api.pointerup({ pointerId: 1, pointerType: "touch" });
    got.push(g.target === null && g.stick === 0 ? "stop" : "on");
  } finally {
    api.idle();
    await solo.mg.show("egg");
  }
  assert(got.join() === "10,end,10,stop", "10 px, past the end, back 20 px, let go: " + got.join());
});

await test("Rampage Rollout: the world and the CPUs are the same as the server's copy of them", async () => {
  const R = await moduleOf(solo, "./src/rollout/rules.js");
  for (const [seed, want] of Object.entries(ROLLOUT)) {
    const w = new R.World(+seed, ROLLOUT_LEVEL[seed], [false, true, false, true]), parts = [];
    for (let t = 0; w.end === null; t++) {
      w.step(t, [rolloutPad(0, t, w), null, rolloutPad(2, t, w), null]);
      w.events = [];
      if (t % 50 === 0) parts.push(w.digest());
    }
    parts.push(`${w.end}:${w.places.join()}:${w.d.map((d) => d.fin).join()}`);
    const got = await sha16(parts.join(";"));
    assert(got === want, `seed ${seed}: ${got}; tools/rollout_rules.py expects ${want} (update both, and the digests)`);
  }
  // the main program's arctangent table (0x8008CFB0), and its angles
  const a = [0, 1, 512, 1023, 1024].map((i) => R.ATAN[i]), b = [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1]].map(([x, y]) => R.angle(x, y));
  assert(a.join() === "0,10,4836,8187,8192" && b.join() === "0,16384,-32768,-16384,8192", `atan ${a}; angles ${b}`);
});

await test("Rampage Rollout: its music and sound effects play from sound.bin", () => soundTest("assets/rollout/sound.bin", [
  ["main", 6, (r) => assert(r.notes > 10 && r.peak > 0.05 && r.peak < 1, `song 34: ${r.notes} notes, peak ${r.peak.toFixed(2)}`)],
]));

await test("Rampage Rollout: online, the others' pads coming in late run the world again to the same place", async () => {
  await solo.mg.show("rollout");
  const api = solo.mg.mini, g = api.game, saved = g.listeners, R = await moduleOf(solo, "./src/rollout/rules.js");
  solo.mg.paused = true;
  g.listeners = {};
  const pattern = (t) => [[8, 4, 2, 1, 0, 2][Math.floor(t / 37) % 6], t % 53 === 9];
  try {
    // seat 0 here, seat 2 someone else whose pads come in 4-12 frames late, 1 and 3 CPUs
    g.reset("normal", 77, { me: 0, control: ["local", "cpu", "remote", "cpu"], cpus: [false, true, false, true] });
    g.start();
    const late = [];
    let lastX = null, t = 0;
    for (; t < 1200; t++) {
      const [x, a] = rolloutPad(2, t);
      if (x !== lastX || a) { late.push({ at: t + 4 + (t % 9), e: [t, x, a ? 1 : 0] }); lastX = x; }
      for (const l of late.filter((l) => l.at === t)) g.told("pad", { s: 2, f: l.e[0], x: l.e[1], a: l.e[2] });
      const [mx, ma] = pattern(t);
      g.setDpad(mx);
      g.presses = ma ? 1 : 0;
      g.step(t);
      g.lastFrame = t;
    }
    for (const l of late.filter((l) => l.at >= t)) g.told("pad", { s: 2, f: l.e[0], x: l.e[1], a: l.e[2] });
    g.runTo(g.lastFrame);
    // the same world with every pad on time (this device's own count g.lead frames after they're made)
    const w = new R.World(77, "normal", [false, true, false, true]), L = g.lead;
    for (let f = 0; f <= g.lastFrame; f++) w.step(f, [f < L ? [0, false] : pattern(f - L), null, rolloutPad(2, f), null]);
    assert(g.world.digest() === w.digest(), `at frame ${g.lastFrame}: laps ${g.world.d.map((d) => d.laps)} here, ${w.d.map((d) => d.laps)} on time`);
    return `frame ${g.lastFrame}: places ${w.places.join(", ")}; ${g.snaps.length} saved frames`;
  } finally {
    g.listeners = saved;
    solo.mg.paused = false;
    api.idle();
    await solo.mg.show("egg");
  }
});

await test("Rampage Rollout: a solo race, played headless: everyone gets in, places by who's in first", async () => {
  await solo.mg.show("rollout");
  const api = solo.mg.mini, g = api.game, saved = g.listeners, { AFTER } = await moduleOf(solo, "./src/rollout/game.js");
  solo.mg.paused = true;
  g.listeners = {};
  const out = [];
  try {
    for (const [seed, level] of [[11, "easy"], [22, "hard"]]) {
      g.reset(level, seed, { me: 0, control: ["local", "cpu", "cpu", "cpu"] });
      g.start();
      while (g.state === "play" && g.frame < 4000) {
        g.setDpad(rolloutWay(g.world.d[0]));
        if ((g.lastFrame + 1) % 47 === 3) g.press();
        g.update(1 / 30);
      }
      const res = g.results(), fin = g.world.d.map((d) => d.fin), end = g.world.end;
      assert(g.state === "over" && end === Math.max(...fin) + 1 && g.frame >= end + AFTER, `${level}: ${g.state}, the end at ${end}, in at ${fin}`);
      assert(res.every((r) => r.score === Math.round((fin[r.i] * 100) / 30)), `${level}: results ${JSON.stringify(res)} for frames ${fin}`);
      assert(res.every((r, k) => !k || fin[res[k - 1].i] <= fin[r.i]) && g.winners[res[0].i], `${level}: places ${JSON.stringify(res)}, winners ${g.winners}`);
      out.push(`${level}: ${fin.join(", ")}`);
    }
  } finally {
    g.listeners = saved;
    solo.mg.paused = false;
    api.idle();
    await solo.mg.show("egg");
  }
  return "frames in: " + out.join("; ");
});

await test("Rampage Rollout: a finger is a D-pad: the way it slides from where it went down", async () => {
  await solo.mg.show("rollout");
  const api = solo.mg.mini, g = api.game, R = await moduleOf(solo, "./src/rollout/rules.js");
  const got = [];
  try {
    g.reset("normal", 5, { me: 0, control: ["local", "cpu", "cpu", "cpu"] });
    g.state = "play";
    const at = (x, y) => ({ pointerId: 1, clientX: x, clientY: y, pointerType: "touch" });
    api.pointerdown(at(200, 300));
    for (const [x, y] of [[205, 303], [240, 310], [210, 260], [170, 305], [200, 340]]) {
      api.pointermove(at(x, y));
      got.push(g.dpad);
    }
    api.pointerup(at(200, 340));
    got.push(g.dpad);
  } finally {
    api.idle();
    await solo.mg.show("egg");
  }
  const want = [0, R.RIGHT, R.UP, R.LEFT, R.DOWN, 0];
  assert(got.join() === want.join(), "still, right, up, left, down, let go: " + got.join());
});

await test("Topsy-Turvy: the world and the CPUs are the same as the server's copy of them", async () => {
  const R = await moduleOf(solo, "./src/topsy/rules.js");
  for (const [seed, want] of Object.entries(TOPSY)) {
    const w = new R.World(+seed, TOPSY_LEVEL[seed], [false, true, false, true]), parts = [];
    for (let t = 0; seed === "157" ? !(w.over && t > w.end + 120) : t < 600; t++) {
      w.step(t, [topsyPad(0, t, w), null, topsyPad(2, t, w), null]);
      w.events = [];
      if (t % 100 === 0) parts.push(w.digest());
    }
    parts.push(`${w.end ?? -1}:${w.scores.join()}:${w.places.join()}`);
    const got = await sha16(parts.join(";"));
    assert(got === want, `seed ${seed}: ${got}; tools/topsy_rules.py expects ${want} (update both, and the digests)`);
  }
  // the game's sine, cosine and arctangent: close to the browser's own
  const far = Math.max(...[0, 0.3, -1.2, 2.5, 3.1, -3.14, 7, 40].map((x) => Math.max(Math.abs(R.sinf(x) - Math.sin(x)), Math.abs(R.cosf(x) - Math.cos(x)))),
    ...[[1, 2], [-3, 1], [2, -5], [-1, -1], [5, 0]].map(([y, x]) => Math.abs(R.atan2(y, x) - Math.atan2(y, x))));
  assert(far < 2e-6, `sin, cos, atan2: ${far} out`);
});

await test("Topsy-Turvy: the harder CPUs are better (the round's over sooner, fewer RAPID SPINs wasted)", async () => {
  const R = await moduleOf(solo, "./src/topsy/rules.js");
  const play = (level) => {
    let end = 0, spins = 0, out = 0;
    for (let seed = 0; seed < 6; seed++) {
      const w = new R.World(seed, level, [false, true, true, true]);
      for (let t = 0; w.end === null; t++) {
        w.step(t, [[0, 0, false]]); // (seat 0 sits still)
        spins += w.events.filter((e) => e[0] === "spin").length;
        out += w.events.filter((e) => e[0] === "out" && e[1] === 0).length;
        w.events = [];
      }
      end += w.end;
    }
    return { end: Math.round(end / 6), spins, out };
  };
  const easy = play("easy"), hard = play("hard");
  assert(hard.end < easy.end * 0.7 && hard.spins < easy.spins, `easy ${JSON.stringify(easy)}, hard ${JSON.stringify(hard)}`);
  return `the end, on average: frame ${easy.end} easy, ${hard.end} hard; RAPID SPINs ${easy.spins}, ${hard.spins}`;
});

await test("Topsy-Turvy: its music and sound effects play from sound.bin", () => soundTest("assets/topsy/sound.bin", [
  ["main", 6, (r) => assert(r.notes > 10 && r.peak > 0.05 && r.peak < 1, `song 33: ${r.notes} notes, peak ${r.peak.toFixed(2)}`)],
]));

await test("Topsy-Turvy: online, the others' pads coming in late run the world again to the same place", async () => {
  await solo.mg.show("topsy");
  const api = solo.mg.mini, g = api.game, saved = g.listeners, R = await moduleOf(solo, "./src/topsy/rules.js");
  const { pack } = await moduleOf(solo, "./src/topsy/game.js");
  solo.mg.paused = true;
  g.listeners = {};
  const pattern = (t) => [[64, 0], [-45, 45], [0, -64], [0, 0]][Math.floor(t / 37) % 4].concat([t % 53 === 9]);
  try {
    // seat 0 here, seat 2 someone else whose pads come in 4-12 frames late, 1 and 3 CPUs
    g.reset("normal", 77, { me: 0, control: ["local", "cpu", "remote", "cpu"], cpus: [false, true, false, true] });
    g.start();
    const late = [];
    let lastX = null, t = 0;
    const theirs = (t) => topsyPad(2, t);
    for (; t < 1500; t++) {
      const [sx, sy, a] = theirs(t), x = pack(sx, sy);
      if (x !== lastX || a) { late.push({ at: t + 4 + (t % 9), e: [t, x, a ? 1 : 0] }); lastX = x; }
      for (const l of late.filter((l) => l.at === t)) g.told("pad", { s: 2, f: l.e[0], x: l.e[1], a: l.e[2] });
      const [mx, my, ma] = pattern(t);
      g.setStick(mx, my);
      g.presses = ma ? 1 : 0;
      g.step(t);
      g.lastFrame = t;
    }
    for (const l of late.filter((l) => l.at >= t)) g.told("pad", { s: 2, f: l.e[0], x: l.e[1], a: l.e[2] });
    g.runTo(g.lastFrame);
    // the same world with every pad on time (this device's own count g.lead frames after they're made)
    const w = new R.World(77, "normal", [false, true, false, true]), L = g.lead;
    for (let f = 0; f <= g.lastFrame; f++) w.step(f, [f < L ? [0, 0, false] : pattern(f - L), null, theirs(f), null]);
    assert(g.world.digest() === w.digest(), `at frame ${g.lastFrame}: points ${g.world.scores} here, ${w.scores} on time`);
    return `frame ${g.lastFrame}: points ${w.scores.join(", ")}; ${g.snaps.length} saved frames`;
  } finally {
    g.listeners = saved;
    solo.mg.paused = false;
    api.idle();
    await solo.mg.show("egg");
  }
});

await test("Topsy-Turvy: a solo round, played headless: it ends by points or the clock, places by points", async () => {
  await solo.mg.show("topsy");
  const api = solo.mg.mini, g = api.game, saved = g.listeners, { AFTER } = await moduleOf(solo, "./src/topsy/game.js");
  const R = await moduleOf(solo, "./src/topsy/rules.js");
  solo.mg.paused = true;
  g.listeners = {};
  const out = [];
  try {
    for (const [seed, level] of [[11, "easy"], [22, "hard"]]) {
      g.reset(level, seed, { me: 0, control: ["local", "cpu", "cpu", "cpu"] });
      g.start();
      while (g.state === "play" && g.frame < R.TIME_LIMIT + AFTER + 60) {
        const [x, y, a] = topsyPad(0, g.lastFrame + 1, g.world);
        g.setStick(x, y);
        if (a) g.press();
        g.update(1 / 60);
      }
      const res = g.results(), s = g.world.scores, end = g.world.end;
      assert(g.state === "over" && end !== null && g.frame >= end + AFTER, `${level}: ${g.state}, the end at ${end}`);
      assert(end === R.TIME_LIMIT - 1 || Math.max(...s) === R.WINNERS_POINT, `${level}: over at ${end} with ${s}`);
      assert(res.every((r) => r.score === s[r.i]) && res.every((r, k) => !k || res[k - 1].score >= r.score), `${level}: results ${JSON.stringify(res)} for ${s}`);
      assert(g.winners.every((w, z) => w === (s[z] === Math.max(...s) && !s.every((x) => x === s[0]))), `${level}: winners ${g.winners} for ${s}`);
      out.push(`${level}: ${s.join(", ")} at frame ${end}`);
    }
  } finally {
    g.listeners = saved;
    solo.mg.paused = false;
    api.idle();
    await solo.mg.show("egg");
  }
  return "points: " + out.join("; ");
});

await test("Topsy-Turvy: a finger is a stick: the way and how far it slides from where it went down", async () => {
  await solo.mg.show("topsy");
  const api = solo.mg.mini, g = api.game;
  const got = [];
  try {
    g.reset("normal", 5, { me: 0, control: ["local", "cpu", "cpu", "cpu"] });
    g.state = "play";
    const at = (x, y) => ({ pointerId: 1, clientX: x, clientY: y, pointerType: "touch" });
    api.pointerdown(at(200, 300));
    for (const [x, y] of [[205, 303], [256, 300], [200, 244], [172, 300], [200, 400]]) {
      api.pointermove(at(x, y));
      got.push(g.stick.join(" "));
    }
    api.pointerup(at(200, 400));
    got.push(g.stick.join(" "));
  } finally {
    api.idle();
    await solo.mg.show("egg");
  }
  // (8 px still; 56 px or more a full push, 64; up is +y)
  const want = ["0 0", "64 0", "0 64", "-27 0", "0 -64", "0 0"];
  assert(got.join() === want.join(), "still, right, up, a little left, down, let go: " + got.join());
});

await test("Furret's Frolic: the world and the CPUs are the same as the server's copy of them", async () => {
  const R = await moduleOf(solo, "./src/furret/rules.js");
  for (const [seed, want] of Object.entries(FURRET)) {
    const w = new R.World(+seed, FURRET_LEVEL[seed], [false, true, false, true]), parts = [];
    for (let t = 0; seed === "157" ? !(w.over && t > w.end + 120) : t < 600; t++) {
      w.step(t, [furretPad(0, t, w), null, furretPad(2, t, w), null]);
      w.events = [];
      if (t % 100 === 0) parts.push(w.digest());
    }
    parts.push(`${w.end ?? -1}:${w.scores.join()}:${w.places.join()}`);
    const got = await sha16(parts.join(";"));
    assert(got === want, `seed ${seed}: ${got}; tools/furret_rules.py expects ${want} (update both, and the digests)`);
  }
  // the floor (module #50's own mesh): 4 pieces of 38 triangles; the middle hollow 46 down, a spot's too
  const mid = R.groundY(0, 0), spot = R.groundY(282.84, 282.84);
  assert(R.PIECES.every((p) => p.length === 38) && Math.round(mid) === -46 && Math.round(spot) === -46, `the hollows at ${mid}, ${spot}`);
});

await test("Furret's Frolic: the harder CPUs are better (more points in the minute)", async () => {
  const R = await moduleOf(solo, "./src/furret/rules.js");
  const play = (level) => {
    let points = 0, swings = 0;
    for (let seed = 0; seed < 8; seed++) {
      const w = new R.World(seed, level, [false, true, true, true]);
      for (let t = 0; w.end === null; t++) {
        w.step(t, [[0, false]]); // (seat 0 stands in the middle)
        swings += w.events.filter((e) => e[0] === "swing").length;
        w.events = [];
      }
      points += w.scores[1] + w.scores[2] + w.scores[3];
    }
    return { points: points / 8, swings };
  };
  const easy = play("easy"), hard = play("hard");
  assert(hard.points > easy.points * 1.2, `easy ${JSON.stringify(easy)}, hard ${JSON.stringify(hard)}`);
  return `the CPUs' points a round, on average: ${easy.points} easy, ${hard.points} hard; swings ${easy.swings}, ${hard.swings}`;
});

await test("Furret's Frolic: its music and sound effects play from sound.bin", () => soundTest("assets/furret/sound.bin", [
  ["main", 6, (r) => assert(r.notes > 10 && r.peak > 0.05 && r.peak < 1, `song 47: ${r.notes} notes, peak ${r.peak.toFixed(2)}`)],
]));

await test("Furret's Frolic: online, the others' pads coming in late run the world again to the same place", async () => {
  await solo.mg.show("furret");
  const api = solo.mg.mini, g = api.game, saved = g.listeners, R = await moduleOf(solo, "./src/furret/rules.js");
  solo.mg.paused = true;
  g.listeners = {};
  const pattern = (t) => [[1, 0, 3, 0, 2, 4][Math.floor(t / 37) % 6], t % 23 === 9];
  try {
    // seat 0 here, seat 2 someone else whose pads come in 4-12 frames late, 1 and 3 CPUs
    g.reset("normal", 77, { me: 0, control: ["local", "cpu", "remote", "cpu"], cpus: [false, true, false, true] });
    g.start();
    const late = [];
    let lastX = null, t = 0;
    const theirs = (t) => furretPad(2, t);
    for (; t < 1500; t++) {
      const [x, a] = theirs(t);
      if (x !== lastX || a) { late.push({ at: t + 4 + (t % 9), e: [t, x, a ? 1 : 0] }); lastX = x; }
      for (const l of late.filter((l) => l.at === t)) g.told("pad", { s: 2, f: l.e[0], x: l.e[1], a: l.e[2] });
      const [mx, ma] = pattern(t);
      g.setSpot(mx);
      g.presses = ma ? 1 : 0;
      g.step(t);
      g.lastFrame = t;
    }
    for (const l of late.filter((l) => l.at >= t)) g.told("pad", { s: 2, f: l.e[0], x: l.e[1], a: l.e[2] });
    g.runTo(g.lastFrame);
    // the same world with every pad on time (this device's own count g.lead frames after they're made)
    const w = new R.World(77, "normal", [false, true, false, true]), L = g.lead;
    for (let f = 0; f <= g.lastFrame; f++) w.step(f, [f < L ? [0, false] : pattern(f - L), null, theirs(f), null]);
    assert(g.world.digest() === w.digest(), `at frame ${g.lastFrame}: points ${g.world.scores} here, ${w.scores} on time`);
    return `frame ${g.lastFrame}: points ${w.scores.join(", ")}; ${g.snaps.length} saved frames`;
  } finally {
    g.listeners = saved;
    solo.mg.paused = false;
    api.idle();
    await solo.mg.show("egg");
  }
});

await test("Furret's Frolic: a solo round, played headless: it ends on the clock, places by points", async () => {
  await solo.mg.show("furret");
  const api = solo.mg.mini, g = api.game, saved = g.listeners, { AFTER } = await moduleOf(solo, "./src/furret/game.js");
  const R = await moduleOf(solo, "./src/furret/rules.js");
  solo.mg.paused = true;
  g.listeners = {};
  const out = [];
  try {
    for (const [seed, level] of [[11, "easy"], [22, "hard"]]) {
      g.reset(level, seed, { me: 0, control: ["local", "cpu", "cpu", "cpu"] });
      g.start();
      while (g.state === "play" && g.frame < R.TIME + AFTER + 60) {
        const [s, a] = furretPad(0, g.lastFrame + 1, g.world);
        g.setSpot(s);
        if (a) g.press();
        g.update(1 / 30);
      }
      const res = g.results(), s = g.world.scores, end = g.world.end;
      assert(g.state === "over" && end === R.TIME && g.frame >= end + AFTER, `${level}: ${g.state}, the end at ${end}`);
      assert(res.every((r) => r.score === s[r.i]) && res.every((r, k) => !k || res[k - 1].score >= r.score), `${level}: results ${JSON.stringify(res)} for ${s}`);
      assert(g.winners.every((w, z) => w === (s[z] === Math.max(...s) && !s.every((x) => x === s[0]))), `${level}: winners ${g.winners} for ${s}`);
      // (the winners hop to the middle and cheer; the others sulk)
      const clips = g.world.p.map((p) => p.f.clip);
      assert(g.world.p.every((p, z) => clips[z] === (g.winners[z] ? R.CLIP.cheer : R.CLIP.sad) && (!g.winners[z] || p.f.spot === 0)),
        `${level}: at the end their clips are ${clips} for winners ${g.winners}`);
      out.push(`${level}: ${s.join(", ")}`);
    }
  } finally {
    g.listeners = saved;
    solo.mg.paused = false;
    api.idle();
    await solo.mg.show("egg");
  }
  return "points: " + out.join("; ");
});

await test("Furret's Frolic: a finger is the D-pad, the way it slides; the view turned to each player's goal", async () => {
  await solo.mg.show("furret");
  const api = solo.mg.mini, g = api.game;
  const got = [];
  try {
    g.reset("normal", 5, { me: 0, control: ["local", "cpu", "cpu", "cpu"] });
    g.state = "play";
    const at = (x, y) => ({ pointerId: 1, clientX: x, clientY: y, pointerType: "touch" });
    api.pointerdown(at(200, 300));
    for (const [x, y] of [[205, 303], [260, 300], [200, 360], [200, 240], [150, 310]]) {
      api.pointermove(at(x, y));
      got.push(g.spot);
    }
    api.pointerup(at(150, 310));
    got.push(g.spot);
    // (2P's goal is on the right of the game's view: turned so it's at the bottom, the D-pad turns with it)
    const r = solo.document.documentElement.getBoundingClientRect();
    api.layout(r.width, r.height, { top: 0, left: 0, right: r.width, bottom: r.height }, 1, []);
    api.debug.way("d");
    got.push(g.spot);
    api.debug.way(null);
    api.layout(r.width, r.height, { top: 0, left: 0, right: r.width, bottom: r.height }, 0, []);
  } finally {
    api.idle();
    await solo.mg.show("egg");
  }
  // (14 px still; then right, down, up, left: spots 1, 2, 3, 4; let go: the middle. For 2P, down is its goal's way: spot 1)
  const want = [0, 1, 2, 3, 4, 0, 1];
  assert(got.join() === want.join(), "still, right, down, up, left, let go; 2P's down: " + got.join());
});

await test("Furret's Frolic: Play again has the first round's camera (the end's show moves it, and doesn't stay)", async () => {
  await solo.mg.show("furret");
  const api = solo.mg.mini, g = api.game, saved = g.listeners;
  // the shell's Play again: it lays out, then resets the round
  const play = (W, H, seed) => {
    api.layout(W, H, { top: 0, left: 0, right: W, bottom: H }, 0, []);
    api.reset({ online: false, level: "normal", seed, me: 0, control: ["local", "cpu", "cpu", "cpu"] });
    api.step(0);
  };
  // the camera: where it is (the shell puts it at the view's base each frame), its turn, its field of view and the picture's shift
  const camera = () => {
    const v = api.views[0], c = v.cam, f = (a) => a.map((x) => x.toFixed(2)).join();
    return { at: f(v.base.toArray()), all: f([...v.base.toArray(), ...c.quaternion.toArray(), c.fov, c.view?.enabled ? c.view.offsetY : 0]), fov: c.fov };
  };
  const out = [];
  solo.mg.paused = true;
  g.listeners = {};
  try {
    for (const [W, H] of [[1400, 900], [390, 844]]) { // (landscape, and a phone: the picture moved up)
      play(W, H, 1);
      const first = camera();
      g.start();
      for (let k = 0; g.state === "play" && k < 3000; k++) api.step(1 / 30); // (to the end, and its show)
      const end = camera();
      play(W, H, 2);
      const second = camera();
      assert(end.at !== first.at, `${W} x ${H}: the end's camera stayed where the play's was`);
      assert(second.all === first.all, `${W} x ${H}: round 1's camera ${first.all}, round 2's ${second.all}`);
      out.push(`${W} x ${H}: fov ${first.fov.toFixed(1)}`);
    }
  } finally {
    g.listeners = saved;
    solo.mg.paused = false;
    api.idle();
    await solo.mg.show("egg");
  }
  return out.join("; ");
});

await test("Delibird's Delivery: the world and the CPUs are the same as the server's copy of them", async () => {
  const R = await moduleOf(solo, "./src/delibird/rules.js");
  for (const [seed, want] of Object.entries(DELIBIRD)) {
    const w = new R.World(+seed, DELIBIRD_LEVEL[seed], [false, true, false, true]), parts = [];
    for (let t = 0; seed === "157" ? !(w.phase === "show" && t > w.shown + 30) : t < 600; t++) {
      w.step(t, [deliPad(0, t, w), null, deliPad(2, t, w), null]);
      w.events = [];
      if (t % 100 === 0) parts.push(w.digest());
    }
    parts.push(`${w.end ?? -1}:${w.scores.join()}:${w.places.join()}`);
    const got = await sha16(parts.join(";"));
    assert(got === want, `seed ${seed}: ${got}; tools/delibird_rules.py expects ${want} (update both, and the digests)`);
  }
  // the tally: the points count up by 0, 1, 2... a frame; the world's as long
  const w = new R.World(9, "hard", [true, true, true, true]);
  for (let t = 0; w.phase !== "show"; t++) { w.step(t, []); w.events = []; }
  assert(w.shown - w.end === R.tallyFrames(w.scores) && R.tallyFrames([0, 0, 0, 0]) === 2, `the tally: ${w.end} to ${w.shown} for ${w.scores}`);
});

await test("Delibird's Delivery: the harder CPUs are better (more points, and the Swinub get them less)", async () => {
  const R = await moduleOf(solo, "./src/delibird/rules.js");
  const play = (level) => {
    let points = 0, knocked = 0;
    for (let seed = 0; seed < 8; seed++) {
      const w = new R.World(seed, level, [false, true, true, true]);
      for (let t = 0; w.end === null; t++) {
        w.step(t, [[0, 0]]); // (seat 0 stands at its door)
        knocked += w.events.filter((e) => e[0] === "knocked").length;
        w.events = [];
      }
      points += w.scores[1] + w.scores[2] + w.scores[3];
    }
    return { points: points / 8, knocked };
  };
  const easy = play("easy"), hard = play("hard");
  assert(hard.points > easy.points && hard.knocked * 1.5 < easy.knocked, `easy ${JSON.stringify(easy)}, hard ${JSON.stringify(hard)}`);
  return `the CPUs' points a round, on average: ${easy.points} easy, ${hard.points} hard; knocked over ${easy.knocked}, ${hard.knocked} times`;
});

await test("Delibird's Delivery: its music and sound effects play from sound.bin", () => soundTest("assets/delibird/sound.bin", [
  ["main", 6, (r) => assert(r.notes > 10 && r.peak > 0.05 && r.peak < 1, `song 52: ${r.notes} notes, peak ${r.peak.toFixed(2)}`)],
]));

await test("Delibird's Delivery: online, the others' sticks coming in late run the world again to the same place", async () => {
  await solo.mg.show("delibird");
  const api = solo.mg.mini, g = api.game, saved = g.listeners, R = await moduleOf(solo, "./src/delibird/rules.js");
  const { pack } = await moduleOf(solo, "./src/delibird/game.js");
  solo.mg.paused = true;
  g.listeners = {};
  const pattern = (t) => [[64, 0, -45, 0, 0, 45][Math.floor(t / 37) % 6], [0, -64, 45, 64, 0, -45][Math.floor(t / 37) % 6]];
  try {
    // seat 0 here, seat 2 someone else whose sticks come in 4-12 frames late, 1 and 3 CPUs
    g.reset("normal", 77, { me: 0, control: ["local", "cpu", "remote", "cpu"], cpus: [false, true, false, true] });
    g.start();
    const late = [], theirs = new Map();
    let lastX = null, t = 0;
    for (; t < 1500; t++) {
      const x = pack(...deliPad(2, t, g.world));
      theirs.set(t, x);
      if (x !== lastX) { late.push({ at: t + 4 + (t % 9), f: t, x }); lastX = x; }
      for (const l of late.filter((l) => l.at === t)) g.told("pad", { s: 2, f: l.f, x: l.x, a: 0 });
      g.setStick(...pattern(t));
      g.step(t);
      g.lastFrame = t;
    }
    for (const l of late.filter((l) => l.at >= t)) g.told("pad", { s: 2, f: l.f, x: l.x, a: 0 });
    g.runTo(g.lastFrame);
    // the same world with every stick on time (this device's own count g.lead frames after they're made)
    const w = new R.World(77, "normal", [false, true, false, true]), L = g.lead;
    const held = (f) => { let x = null; for (const l of late) if (l.f <= f) x = l.x; return x === null ? [0, 0] : [(x & 0xff) - 64, (x >> 8) - 64]; };
    for (let f = 0; f <= g.lastFrame; f++) w.step(f, [f < L ? [0, 0] : pattern(f - L), null, held(f), null]);
    assert(g.world.digest() === w.digest(), `at frame ${g.lastFrame}: points ${g.world.scores} here, ${w.scores} on time`);
    return `frame ${g.lastFrame}: points ${w.scores.join(", ")}; ${g.snaps.length} saved frames`;
  } finally {
    g.listeners = saved;
    solo.mg.paused = false;
    api.idle();
    await solo.mg.show("egg");
  }
});

await test("Delibird's Delivery: a solo round, played headless: the clock, the tally, places by points", async () => {
  await solo.mg.show("delibird");
  const api = solo.mg.mini, g = api.game, saved = g.listeners;
  const R = await moduleOf(solo, "./src/delibird/rules.js");
  solo.mg.paused = true;
  g.listeners = {};
  const out = [];
  try {
    for (const [seed, level] of [[11, "easy"], [22, "hard"]]) {
      g.reset(level, seed, { me: 0, control: ["local", "cpu", "cpu", "cpu"] });
      g.start();
      while (g.state === "play" && g.frame < 3000) {
        g.setStick(...deliPad(0, g.lastFrame + 1, g.world));
        g.update(1 / 30);
      }
      const res = g.results(), s = g.world.scores, w = g.world;
      // (the play's over once the clock's out and nothing's on its way, a second after at the most)
      assert(g.state === "over" && w.end >= R.TIME && w.end <= R.TIME + 62 && g.frame >= w.shown + R.SHOW, `${level}: ${g.state}, the end at ${w.end}`);
      assert(res.every((r) => r.score === s[r.i]) && res.every((r, k) => !k || res[k - 1].score >= r.score), `${level}: results ${JSON.stringify(res)} for ${s}`);
      assert(g.winners.every((x, z) => x === (s[z] === Math.max(...s) && !s.every((y) => y === s[0]))), `${level}: winners ${g.winners} for ${s}`);
      // (the winners cheer, the others sulk; the points all counted up; the cards show the gifts through each door)
      assert(w.p.every((p, z) => p.state === (g.winners[z] ? R.ST.cheer : R.ST.sulk) && p.shown === p.score),
        `${level}: at the end their states are ${w.p.map((p) => p.state)} for winners ${g.winners}`);
      assert([0, 1, 2, 3].every((z) => api.score(z) === w.p[z].got.length) && s[0] > 0, `${level}: the cards ${[0, 1, 2, 3].map(api.score)}, points ${s}`);
      out.push(`${level}: ${s.join(", ")} (gifts ${w.p.map((p) => p.got.length).join(", ")})`);
    }
  } finally {
    g.listeners = saved;
    solo.mg.paused = false;
    api.idle();
    await solo.mg.show("egg");
  }
  return "points: " + out.join("; ");
});

await test("Delibird's Delivery: a finger is a stick, the way and how far it slides; the keys the D-pad", async () => {
  await solo.mg.show("delibird");
  const api = solo.mg.mini, g = api.game;
  const got = [];
  try {
    g.reset("normal", 5, { me: 0, control: ["local", "cpu", "cpu", "cpu"] });
    g.state = "play";
    const at = (x, y) => ({ pointerId: 1, clientX: x, clientY: y, pointerType: "touch" });
    api.pointerdown(at(200, 300));
    for (const [x, y] of [[204, 303], [280, 300], [200, 220], [170, 300], [200, 400]]) {
      api.pointermove(at(x, y));
      got.push(g.stick.join(" "));
    }
    api.pointerup(at(200, 400));
    got.push(g.stick.join(" "));
    // (the keys: right and up together are the D-pad's diagonal, 45 each way; left and right, left)
    const key = (code, down) => (down ? api.keydown : api.keyup)({ code, repeat: false });
    key("ArrowRight", true); key("ArrowUp", true);
    got.push(g.stick.join(" "));
    key("ArrowLeft", true); key("ArrowUp", false);
    got.push(g.stick.join(" "));
    key("ArrowLeft", false); key("ArrowRight", false);
    got.push(g.stick.join(" "));
  } finally {
    api.idle();
    await solo.mg.show("egg");
  }
  const want = ["0 0", "64 0", "0 64", "-29 0", "0 -64", "0 0", "45 45", "-64 0", "0 0"];
  assert(got.join() === want.join(), "still, right, up, a little left, down, let go; keys: " + got.join());
});

await test("online: the server moving this device's own moves to later frames keeps them in its order", async () => {
  // (Gutsy Golbat, Barrier Ball, Tumbling Togepi, Rampage Rollout, Topsy-Turvy, Furret's Frolic and Delibird's Delivery: two of them the
  // server got late, both put on frame 15. Rampage Rollout's are D-pads: 20 is LEFT | DOWN... 40 the same, made
  // up for here; Furret's Frolic's are spots, 0-4)
  const out = [];
  try {
    for (const [id, type] of [["golbat", "pad"], ["barrier", "pad"], ["togepi", "stick"], ["rollout", "pad"], ["topsy", "pad"], ["furret", "pad"],
      ["delibird", "pad"]]) {
      await solo.mg.show(id);
      const api = solo.mg.mini, g = api.game, saved = g.listeners, other = type === "pad" ? "a" : "y";
      solo.mg.paused = true;
      g.listeners = {};
      try {
        g.reset("normal", 5, { me: 0, control: ["local", "cpu", "cpu", "cpu"], cpus: [false, true, true, true] });
        g.start();
        const [x1, x2] = id === "rollout" ? [2, 4] : id === "furret" ? [1, 2] : [20, 40];
        for (let t = 0; t <= 12; t++) {
          if (t === 10 || t === 11) {
            if (id === "rollout") g.setDpad(t === 10 ? x1 : x2);
            else if (id === "furret") g.setSpot(t === 10 ? x1 : x2);
            else g.setStick(t === 10 ? x1 : x2, 0);
          }
          g.step(t);
          g.lastFrame = t;
        }
        const sent = (x) => (id === "topsy" || id === "delibird" ? (x + 64) | (64 << 8) : x); // (Topsy-Turvy's and Delibird's Delivery's sticks go packed: (x + 64) | (y + 64) << 8)
        g.told(type, { s: 0, f: 15, o: 10, x: sent(x1), [other]: 0 });
        g.told(type, { s: 0, f: 15, o: 11, x: sent(x2), [other]: 0 });
        const x = (t) => (type === "pad" ? g.padAt(0, t) : g.stickAt(0, t))[0];
        out.push(`${id}: ${x(14)}, ${x(15)}, ${x(20)}`);
      } finally {
        g.listeners = saved;
        solo.mg.paused = false;
        api.idle();
      }
    }
  } finally { await solo.mg.show("egg"); }
  // (the server's: the one it got last counts on frame 15)
  const want = (o) => (o.startsWith("rollout") ? ": 0, 4, 4" : o.startsWith("furret") ? ": 0, 2, 2" : ": 0, 40, 40");
  assert(out.every((o) => o.endsWith(want(o))), "the stick on frames 14, 15 and 20: " + out.join("; "));
});

await test("online: rejoining a round, a seat whose player is away is still theirs, not a CPU", async () => {
  // (the server's CPUs are the seats nobody was dealt: a device that took one more would count it itself)
  const round = { online: true, level: "normal", seed: 7, me: 0, control: ["local", "remote", "remote", "cpu"],
                  lineup: [{ seat: 0, here: true }, { seat: 1, here: false }, { seat: 2, here: true }] };
  const out = [];
  try {
    for (const id of ["egg", "stampede", "pichu", "togepi", "golbat", "barrier", "rollout", "topsy", "furret", "delibird"]) {
      await solo.mg.show(id);
      solo.mg.mini.reset(round);
      out.push(`${id}: ${solo.mg.mini.game.cpus.join()}`);
      solo.mg.mini.idle();
    }
  } finally { await solo.mg.show("egg"); }
  assert(out.every((c) => c.endsWith(": false,false,false,true")), "the CPUs: " + out.join("; "));
});

await test("online: another device's player is shown as far behind as its moves take to get here", async () => {
  const { Lag, LAG, startDelay } = await moduleOf(solo, "./src/lag.js");
  const start = startDelay(40, 120); // (80 ms each way, and the spare)
  assert(Math.abs(start - 0.13) < 1e-9 && startDelay(undefined, 50) === LAG.fallback, `it starts at ${start}`);
  const lag = new Lag(start);
  lag.heard(0.35);
  lag.heard(5); // (a stale one: doesn't count)
  for (let k = 0; k < 60; k++) lag.step(1 / 60);
  const up = lag.delay;
  for (let k = 0; k < 60 * 30; k++) lag.step(1 / 60);
  assert(up > 0.37 && up < 0.39 && lag.delay === LAG.min, `a late move: ${up.toFixed(3)} s a second on, ${lag.delay.toFixed(3)} s 30 s after`);
  // in Egg Emergency: the seat's clock slows till its leans are on time
  const end = headless(solo, (g) => {
    g.reset("normal", 1, { me: 0, control: ["local", "remote", "cpu", "cpu"], delay: [0, 0.1, 0, 0] });
    g.start();
    for (let k = 0; k < 120; k++) g.update(1 / 60);
    g.remoteLean(1, Math.floor((g.time - 0.3) * 30) - 31, 1); // 0.3 s old when it gets here (in frames of the play)
    const early = g.seats[1].lean;
    for (let k = 0; k < 120; k++) g.update(1 / 60);
    return { early, want: g.seats[1].lean, behind: g.delay[1] };
  });
  assert(end.early !== 1 && end.want === 1, `the lean: ${end.early}, then ${end.want}`);
  assert(end.behind > 0.28 && end.behind < 0.36, `the seat's ${end.behind.toFixed(3)} s behind`);
  return `${up.toFixed(2)} s for a move 0.35 s late`;
});

await test("online: Clear Cut Challenge's logs fall together, and a late cut goes up on the signpost as it was cut", async () => {
  await solo.mg.show("clearcut");
  const e = solo.mg, g = e.game, saved = g.listeners;
  e.paused = true;
  g.listeners = {};
  try {
    g.reset("normal", 5, { me: 0, control: ["local", "remote", "cpu", "cpu"] });
    g.start();
    const to = (fr) => { while (g.time * 30 < fr) g.update(1 / 30); };
    const [t0, t1] = g.times, T0 = g.logs[0].T, T1 = g.logs[1].T, bob = g.players[1];
    to(t0.drop + 10);
    const ys = g.lanes.map((l) => Math.round(l.log.position.y));
    assert(ys[0] === ys[1], `the logs at ${ys}`);
    to(t0.drop + T0 + 6); // Bob cut on the target, and it gets here 6 frames later
    g.told(1, 0, { f: T0, p: 20, e: 20 });
    to(t0.drop + T0 + 8);
    assert(g.lanes[1].pieces && bob.cuts[0].pts === 20 && bob.total === 20, "the late cut didn't split the log");
    // the next log: no word by the end of the fall shows the miss; a cut that gets here after goes up on the signpost
    to(t1.judged + 2);
    const before = bob.cuts[1]?.kind;
    g.told(1, 1, { f: T1, p: 20, e: 40 });
    to(t1.judged + 100);
    const c = bob.cuts[1], l = g.lanes[1];
    assert(before === "none", "at the end of the fall: " + before);
    assert(c.kind === "perfect" && c.done && l.pieces && bob.total === 40, `after: ${c.kind}, ${!!l.pieces}, ${bob.total}`);
    // (each piece's place its middle: the upper one 20 to the left, its middle half the log over the lower one's, less 5: 0x86505604)
    const { lo, up } = l.pieces;
    assert(up.position.x === -20 && up.position.y - lo.position.y === (389 >> 1) - 5, `the pieces on the signpost: ${up.position.x}, ${up.position.y - lo.position.y}`);
  } finally {
    g.listeners = saved;
    g.reset("normal");
    g.state = "idle";
    e.paused = false;
    await e.show("egg");
  }
});

// ------------------------------------------------------------ the live tests
// Real games in real time, side by side: each lane opens frames of its own
// (an online one a room of its own, with two players) and closes them when
// it's done, as many lanes at once as MAX_FRAMES lets: the long ones first
// (secs: about how long each takes, at the most, so they end at about the same time), then
// in this order.
solo.frameElement.remove();
const lanes = [];
const lane = (frames, fn, secs = 0) => lanes.push({ frames, fn, secs });

lane(2, async (f) => {
  let ann, bob, code;
  await test("online: a room, its lobby and the invite link", async () => {
    ({ ann, bob, code } = await f.pair("egg"));
    await until(() => ann.mg.room()?.players.length === 2 && bob.mg.room()?.players.length === 2, "both in the room");
    // (with TypeSafe checking names, a name shows once the check's answered: "Player 1" till then)
    await until(() => [ann, bob].every((w) => w.mg.room().players.every((p) => !/^Player \d$/.test(p.name))), "the name checks", 15000);
    const r = ann.mg.room();
    assert(r.room === code && r.host === 0, `room ${r.room}, host ${r.host}`);
    assert(r.players.map((p) => p.name).join() === "Ann,Bob", "players " + r.players.map((p) => p.name));
    const box = ann.document.querySelector("#linkText"), link = new URL(`index.html?room=${code}`, ann.location.href).href;
    assert(box.value === link, "invite link " + box.value);
    let copied = null; // (not the real clipboard)
    Object.defineProperty(ann.navigator, "clipboard", { configurable: true, value: { writeText: async (t) => { copied = t; } } });
    ann.document.querySelector("#copy").click();
    await sleep(200);
    assert(copied === link && ann.document.querySelector("#copy").textContent === "Copied!", "Copy copied " + copied);
    assert(box.selectionStart === 0 && box.selectionEnd === link.length, "the link isn't selected");
    bob.mg.net().emit("notice", { code: "name", name: "Rude" });
    assert(bob.document.querySelector("#status").textContent.includes("can't be used"), "a turned-down name isn't shown");
    return "room " + code;
  });

  await test("online: the host picks the game in the lobby, and only the host", async () => {
    const pick = (w, id) => w.document.querySelector(`#lobby .games button[data-game="${id}"]`).click();
    pick(bob, "clearcut"); // not the host: nothing happens
    await sleep(1200);
    assert(ann.mg.room().game === "egg", "Bob changed the game");
    pick(ann, "clearcut");
    await until(() => bob.mg.room()?.game === "clearcut" && bob.document.title === "Clear Cut Challenge", "Bob's lobby to show Clear Cut Challenge");
    await sleep(700);
    pick(ann, "egg");
    await until(() => bob.mg.room()?.game === "egg" && bob.document.title === "Egg Emergency", "Bob's lobby back on Egg Emergency");
  });

  await test("online: an Egg Emergency round, the same on both devices, and cheating doesn't work", async () => {
    let recA = watch(ann), recB = watch(bob);
    const stop = [autoplay(ann), autoplay(bob)];
    try {
      ann.mg.net().send("start");
      await until(() => ann.mg.phase() === "play" && bob.mg.phase() === "play" && ann.mg.game.time > 6, "the round", 20000);
      const r = ann.mg.room().round, net = bob.mg.net();
      same(ann, bob, "6 s in");

      // Bob stands still till he's missed an egg (one not in the middle: some rounds have none for a
      // few seconds), then says he caught it, with a made-up count
      stop[1]();
      const gb = bob.mg.game;
      const missedEgg = () => gb.drops.find((d) => d.kind === "e" && d.side !== 0 && d.reach < gb.seats[1].f - 15
        && gb.seats[1].judged.get(d.i) === -1 && !gb.seats[1].caught.has(d.i))?.n ?? -1;
      await until(() => missedEgg() >= 0, "Bob to miss an egg", 12000);
      const f = gb.frame, missed = missedEgg();
      assert(missed >= 0, "Bob didn't miss an egg");
      gb.seats[1].eggs = 99;
      net.send("ev", { r, s: 1, n: missed, k: "c", e: 99, g: f });
      await sleep(800);
      assert(eggs(bob)[1] < 90 && Math.abs(eggs(bob)[1] - eggs(ann)[1]) <= 2, `the server didn't correct Bob: ${eggs(bob)} / ${eggs(ann)}`);
      assert(recB.off.some((m) => m.n === missed && m.k === "m"), "no correction for the egg Bob missed");
      recB.off = [];
      // ...claims a catch for Ann, leans for her, a drop still to come, says he's done, and tries to start
      const annCaught = [...recA.judged.values()].find((x) => x.s === 0 && x.k === "c");
      net.send("ev", { r, s: 0, n: annCaught.n, k: "c", e: 99, g: f });
      for (let k = 1; k <= 10; k++) net.send("lean", { r, s: 0, f: f + 9 * k, l: k % 2 ? 1 : -1 });
      const ahead = gb.drops.length + 10; // (one not even dealt yet)
      net.send("ev", { r, s: 1, n: ahead, k: "c", e: 99, g: f + 150 });
      net.send("done", { r });
      net.send("start");
      stop[1] = autoplay(bob);
      await sleep(2000);
      assert(eggs(ann)[0] < 90 && eggs(bob)[0] < 90 && eggs(ann)[1] < 90, `a claim got through: ${eggs(ann)} / ${eggs(bob)}`);
      assert(ann.mg.phase() === "play" && ann.mg.room().state === "playing", "the round ended early");

      // Bob reloads mid-round: back in the same round, with the same counts
      const before = bob.mg;
      bob.location.reload();
      await until(() => bob.mg !== before && bob.mg?.phase() === "play" && Math.abs(bob.mg.game.time - ann.mg.game.time) < 0.5, "Bob back in the round", 20000);
      const lost = recB.off;
      recB = watch(bob);
      recB.off = lost;
      stop[1] = autoplay(bob);
      await sleep(2000);
      same(ann, bob, "after Bob's reload");

      await until(() => ann.mg.phase() === "results" && bob.mg.phase() === "results", "the results", 90000);
    } finally {
      stop.forEach((s) => s());
    }
    assert(ranking(ann) && ranking(ann) === ranking(bob), `the rankings differ: ${ranking(ann)} / ${ranking(bob)}`);
    assert(eggs(ann).join() === eggs(bob).join(), `final counts: ${eggs(ann)} / ${eggs(bob)}`);
    // honest play: the devices judged every drop as the server did (Ann also for the CPUs)
    assert(!recA.off.length, "the server disagreed with Ann's device: " + JSON.stringify(recA.off));
    assert(!recB.off.length, "the server disagreed with Bob's device: " + JSON.stringify(recB.off));
    return ranking(ann);
  }, { live: true });
}, 64);

lane(2, (f) => test("online: a Gutsy Golbat round, the same on both devices, and cheating doesn't work", async () => {
  const { ann, bob } = await f.pair("golbat");
  const stop = [];
  try {
    ann.mg.net().send("start");
    await until(() => ann.mg.phase() === "play" && bob.mg.phase() === "play", "the round", 20000);
    stop.push(autoflap(ann), autoflap(bob));
    const net = bob.mg.net(), r = ann.mg.room().round, g = bob.mg.game;
    await until(() => g.frame > 60, "two seconds in", 20000);
    // Bob flies Ann's Golbat, says a pad he didn't press was long ago, and sends one off the stick's range
    net.send("pad", { r, s: 0, f: g.frame, x: -64, a: 1 });
    net.send("pad", { r, s: 1, f: 5, x: 64, a: 1 });
    net.send("pad", { r, s: 1, f: g.frame + 1, x: 90, a: 0 });
    await until(() => [ann, bob].every((w) => w.mg.game.result), "the end, on both devices", 120000);
    const res = (w) => JSON.stringify(w.mg.game.result);
    assert(res(ann) === res(bob), `the end: ${res(ann)} / ${res(bob)}`);
    const f = ann.mg.game.result;
    // each device's run of the world comes to the server's hearts: so the server took the same
    // pads (Bob's made-up old one on the frame it counts on, as told back to him)
    const hearts = (w) => w.mg.game.world.scores.join();
    assert(hearts(ann) === f.h.join() && hearts(bob) === f.h.join(), `hearts: Ann's ${hearts(ann)}, Bob's ${hearts(bob)}, the server's ${f.h}`);
    await until(() => ann.mg.phase() === "results" && bob.mg.phase() === "results", "the results", 30000);
    assert(ranking(ann) === ranking(bob), `the rankings differ: ${ranking(ann)} / ${ranking(bob)}`);
    return `hearts ${f.h.join(", ")} at frame ${f.f}`;
  } finally {
    stop.forEach((s) => s());
  }
}, { live: true }), 69);

lane(2, (f) => test("online: a Barrier Ball round, the same on both devices, and cheating doesn't work", async () => {
  const { ann, bob } = await f.pair("barrier");
  const stop = [];
  try {
    ann.mg.net().send("start");
    await until(() => ann.mg.phase() === "play" && bob.mg.phase() === "play", "the round", 20000);
    stop.push(autoslide(ann), autoslide(bob));
    const net = bob.mg.net(), r = ann.mg.room().round, g = bob.mg.game;
    await until(() => g.frame > 60, "two seconds in", 20000);
    // Bob slides Ann's Mr. Mime, says a pad he didn't press was long ago, and sends one off the stick's range
    net.send("pad", { r, s: 0, f: g.frame, x: -64, a: 1 });
    net.send("pad", { r, s: 1, f: 5, x: 64, a: 1 });
    net.send("pad", { r, s: 1, f: g.frame + 1, x: 90, a: 0 });
    await until(() => [ann, bob].every((w) => w.mg.game.result), "the end, on both devices", 120000);
    const res = (w) => JSON.stringify(w.mg.game.result);
    assert(res(ann) === res(bob), `the end: ${res(ann)} / ${res(bob)}`);
    const f = ann.mg.game.result;
    // each device's run of the world comes to the server's points: so the server took the same
    // pads (Bob's made-up old one on the frame it counts on, as told back to him)
    const points = (w) => w.mg.game.world.scores.join();
    assert(points(ann) === f.p.join() && points(bob) === f.p.join(), `points: Ann's ${points(ann)}, Bob's ${points(bob)}, the server's ${f.p}`);
    await until(() => ann.mg.phase() === "results" && bob.mg.phase() === "results", "the results", 30000);
    assert(ranking(ann) === ranking(bob), `the rankings differ: ${ranking(ann)} / ${ranking(bob)}`);
    return `points ${f.p.join(", ")} at frame ${f.f}`;
  } finally {
    stop.forEach((s) => s());
  }
}, { live: true }), 70);

lane(2, (f) => test("online: a Rampage Rollout race, the same on both devices, and cheating doesn't work", async () => {
  const { ann, bob } = await f.pair("rollout");
  const stop = [];
  try {
    ann.mg.net().send("level", { level: "hard" }); // (the race is over once everyone's in: the CPUs quicker)
    await until(() => bob.mg.room()?.level === "hard", "Hard, in the lobby");
    ann.mg.net().send("start");
    await until(() => ann.mg.phase() === "play" && bob.mg.phase() === "play", "the race", 20000);
    stop.push(autodrive(ann), autodrive(bob));
    const net = bob.mg.net(), r = ann.mg.room().round, g = bob.mg.game;
    await until(() => g.frame > 60, "two seconds in", 20000);
    // Bob turns Ann's Donphan, says a pad he didn't press was long ago, and sends one that's no D-pad
    net.send("pad", { r, s: 0, f: g.frame, x: 4, a: 1 });
    net.send("pad", { r, s: 1, f: 5, x: 8, a: 1 });
    net.send("pad", { r, s: 1, f: g.frame + 1, x: 40, a: 0 });
    await until(() => [ann, bob].every((w) => w.mg.game.result), "the end, on both devices", 150000);
    const res = (w) => JSON.stringify(w.mg.game.result);
    assert(res(ann) === res(bob), `the end: ${res(ann)} / ${res(bob)}`);
    const f = ann.mg.game.result;
    // each device's run of the world comes to the server's: so the server took the same pads
    const fins = (w) => w.mg.game.world.d.map((d) => d.fin).join();
    assert(fins(ann) === f.fin.join() && fins(bob) === f.fin.join(), `in at: Ann's ${fins(ann)}, Bob's ${fins(bob)}, the server's ${f.fin}`);
    await until(() => ann.mg.phase() === "results" && bob.mg.phase() === "results", "the results", 30000);
    assert(ranking(ann) === ranking(bob), `the rankings differ: ${ranking(ann)} / ${ranking(bob)}`);
    return `places ${f.p.join(", ")}, in at frames ${f.fin.join(", ")}`;
  } finally {
    stop.forEach((s) => s());
  }
}, { live: true }), 72);

lane(2, (f) => test("online: a Delibird's Delivery round, the same on both devices, and cheating doesn't work", async () => {
  const { ann, bob } = await f.pair("delibird");
  const stop = [];
  try {
    ann.mg.net().send("start");
    await until(() => ann.mg.phase() === "play" && bob.mg.phase() === "play", "the round", 20000);
    stop.push(autodeliver(ann), autodeliver(bob));
    const net = bob.mg.net(), r = ann.mg.room().round, g = bob.mg.game;
    await until(() => g.frame > 60, "two seconds in", 20000);
    // Bob steers Ann's Delibird, says a stick of his was long ago, and sends a stick that's no stick
    net.send("pad", { r, s: 0, f: g.frame, x: 0x4080, a: 0 });
    net.send("pad", { r, s: 1, f: 5, x: 0x8040, a: 0 });
    net.send("pad", { r, s: 1, f: g.frame + 1, x: 0x9000, a: 0 });
    await until(() => [ann, bob].every((w) => w.mg.game.result), "the end, on both devices", 120000);
    const res = (w) => JSON.stringify(w.mg.game.result);
    assert(res(ann) === res(bob), `the end: ${res(ann)} / ${res(bob)}`);
    const f = ann.mg.game.result;
    // each device's run of the world comes to the server's: so the server took the same sticks
    const pts = (w) => w.mg.game.world.scores.join();
    await until(() => ann.mg.game.lastFrame >= f.f && bob.mg.game.lastFrame >= f.f, "both at the end", 20000);
    assert(pts(ann) === f.s.join() && pts(bob) === f.s.join(), `points: Ann's ${pts(ann)}, Bob's ${pts(bob)}, the server's ${f.s}`);
    await until(() => ann.mg.phase() === "results" && bob.mg.phase() === "results", "the results", 30000);
    assert(ranking(ann) === ranking(bob), `the rankings differ: ${ranking(ann)} / ${ranking(bob)}`);
    return `points ${f.s.join(", ")}, over at frame ${f.f}`;
  } finally {
    stop.forEach((s) => s());
  }
}, { live: true }), 74);

lane(2, (f) => test("online: a Furret's Frolic round, the same on both devices, and cheating doesn't work", async () => {
  const { ann, bob } = await f.pair("furret");
  const stop = [];
  try {
    ann.mg.net().send("start");
    await until(() => ann.mg.phase() === "play" && bob.mg.phase() === "play", "the round", 20000);
    stop.push(autobat(ann), autobat(bob));
    const net = bob.mg.net(), r = ann.mg.room().round, g = bob.mg.game;
    await until(() => g.frame > 60, "two seconds in", 20000);
    // Bob hops Ann's Furret, says a swing of his was long ago, and sends a spot that's no spot
    net.send("pad", { r, s: 0, f: g.frame, x: 1, a: 1 });
    net.send("pad", { r, s: 1, f: 5, x: 2, a: 1 });
    net.send("pad", { r, s: 1, f: g.frame + 1, x: 9, a: 0 });
    await until(() => [ann, bob].every((w) => w.mg.game.result), "the end, on both devices", 120000);
    const res = (w) => JSON.stringify(w.mg.game.result);
    assert(res(ann) === res(bob), `the end: ${res(ann)} / ${res(bob)}`);
    const f = ann.mg.game.result;
    // each device's run of the world comes to the server's: so the server took the same pads
    const pts = (w) => w.mg.game.world.scores.join();
    await until(() => ann.mg.game.lastFrame >= f.f && bob.mg.game.lastFrame >= f.f, "both at the end", 20000);
    assert(pts(ann) === f.s.join() && pts(bob) === f.s.join(), `points: Ann's ${pts(ann)}, Bob's ${pts(bob)}, the server's ${f.s}`);
    await until(() => ann.mg.phase() === "results" && bob.mg.phase() === "results", "the results", 30000);
    assert(ranking(ann) === ranking(bob), `the rankings differ: ${ranking(ann)} / ${ranking(bob)}`);
    return `points ${f.s.join(", ")}, over at frame ${f.f}`;
  } finally {
    stop.forEach((s) => s());
  }
}, { live: true }), 71);

lane(2, (f) => test("online: a Topsy-Turvy round, the same on both devices, and cheating doesn't work", async () => {
  const { ann, bob } = await f.pair("topsy");
  const stop = [];
  try {
    ann.mg.net().send("level", { level: "hard" }); // (the round's over once someone has 5 points: the CPUs quicker)
    await until(() => bob.mg.room()?.level === "hard", "Hard, in the lobby");
    ann.mg.net().send("start");
    await until(() => ann.mg.phase() === "play" && bob.mg.phase() === "play", "the round", 20000);
    stop.push(autospin(ann), autospin(bob));
    const net = bob.mg.net(), r = ann.mg.room().round, g = bob.mg.game;
    await until(() => g.frame > 60, "two seconds in", 20000);
    // Bob steers Ann's Hitmontop, says a RAPID SPIN of his was long ago, and sends a stick that's no stick
    net.send("pad", { r, s: 0, f: g.frame, x: 0x4080, a: 1 });
    net.send("pad", { r, s: 1, f: 5, x: 0x4040, a: 1 });
    net.send("pad", { r, s: 1, f: g.frame + 1, x: 0x9000, a: 0 });
    await until(() => [ann, bob].every((w) => w.mg.game.result), "the end, on both devices", 90000);
    const res = (w) => JSON.stringify(w.mg.game.result);
    assert(res(ann) === res(bob), `the end: ${res(ann)} / ${res(bob)}`);
    const f = ann.mg.game.result;
    // each device's run of the world comes to the server's: so the server took the same pads
    const pts = (w) => w.mg.game.world.scores.join();
    await until(() => ann.mg.game.lastFrame >= f.f && bob.mg.game.lastFrame >= f.f, "both at the end", 20000);
    assert(pts(ann) === f.s.join() && pts(bob) === f.s.join(), `points: Ann's ${pts(ann)}, Bob's ${pts(bob)}, the server's ${f.s}`);
    await until(() => ann.mg.phase() === "results" && bob.mg.phase() === "results", "the results", 30000);
    assert(ranking(ann) === ranking(bob), `the rankings differ: ${ranking(ann)} / ${ranking(bob)}`);
    return `points ${f.s.join(", ")}, over at frame ${f.f}`;
  } finally {
    stop.forEach((s) => s());
  }
}, { live: true }), 60);

lane(2, (f) => test("online: Barrier Ball on slow connections: each device sends its pads a few frames ahead", async () => {
  // (80 ms there and back on each: a phone's, about. Two pages alone, Bob's pads all get to Ann
  // before they're due, so she never runs the world again (web/README.md). Here, with a dozen
  // games in the page, its one thread holds them up, so this only checks they're sent ahead)
  const { ann, bob } = await f.pair("barrier", "&lag=80");
  await sleep(3000); // (in the lobby a while: the pings)
  const stop = [], ahead = [];
  try {
    ann.mg.net().send("start");
    await until(() => ann.mg.phase() === "play" && bob.mg.phase() === "play", "the round", 20000);
    for (const [w, k] of [[ann, 2.1], [bob, 2.4]]) {
      const api = w.mg.mini, step = api.step;
      api.step = function (dt, on) {
        if (on && api.game.state === "play") api.game.setStick([64, 0, -64, 0][Math.floor((performance.now() / 1000) * k) % 4]);
        step.call(api, dt, on);
      };
      stop.push(() => { api.step = step; });
    }
    const gb = bob.mg.game, emit = gb.emit;
    gb.emit = function (type, m) {
      if (type === "send") ahead.push(m.f - (gb.lastFrame + 1)); // (made on frame lastFrame + 1)
      return emit.call(this, type, m);
    };
    stop.push(() => { gb.emit = emit; });
    const g = ann.mg.game;
    await until(() => g.lastFrame > 60, "two seconds in", 20000);
    const zero = { ...g.stats };
    await sleep(6000);
    assert(g.lead === 3 && gb.lead === 3, `the leads: ${g.lead}, ${gb.lead}`);
    assert(ahead.length > 10 && ahead.every((d) => d === 3), "Bob's pads, frames ahead: " + ahead.join());
    const heard = g.stats.heard - zero.heard, late = g.stats.late - zero.late;
    return `lead 3: ${late} of Bob's ${heard} pads came in late; Mr. Mime put right by ${((g.stats.mimes - zero.mimes) / 6).toFixed(1)} a second`;
  } finally {
    stop.forEach((s) => s());
  }
}, { live: true }), 15);

lane(2, (f) => test("online: an Eager Eevee game, the same on both devices, and cheating doesn't work", async () => {
  const { ann, bob } = await f.pair("eevee");
  const stop = [];
  try {
    ann.mg.net().send("start");
    await until(() => ann.mg.phase() === "play" && bob.mg.phase() === "play", "the round", 20000);
    stop.push(autodash(ann, 6), autodash(bob, 9)); // Ann's quicker than Bob
    const net = bob.mg.net(), r = ann.mg.room().round, g = bob.mg.game, T = g.times[0];
    // Bob dashes for Ann's seat, and later says he dashed on the open's first frame
    net.send("dash", { r, s: 0, k: "a", f: T.open + 4 });
    await until(() => g.verdict[0] || g.lastFrame > T.end - 10, "the first race, judged on Bob's device", 30000);
    net.send("dash", { r, s: 1, k: "a", f: T.open + 4 }); // (in already, or too old by far)
    await until(() => [ann, bob].every((w) => w.mg.game.lastFrame > w.mg.game.times[1].open + 40), "the second race", 30000);
    await sleep(1000);
    const totals = (w) => w.mg.game.players.map((p) => p.total).join();
    const prizes = (w) => w.mg.game.players.map((p) => p.won.map((x) => x.what).join("/")).join(" ");
    assert(totals(ann) === totals(bob), `totals: ${totals(ann)} / ${totals(bob)}`);
    // the rounds as dealt so far: who was outside, and the opens (the server's word on both)
    const dealt = (w) => w.mg.game.rounds.slice(0, 3).map((rd, n) => `${w.mg.game.outs[n]}:${rd.open}`).join(" ");
    assert(dealt(ann) === dealt(bob), `the rounds dealt: ${dealt(ann)} / ${dealt(bob)}`);
    const rd = g.rounds[0], v = ann.mg.game.verdict[0];
    // the fruit is Ann's; strawberries are shared, but Ann's had some before Bob got there
    if (rd.kind === 0) assert(v && v.got[0] && !v.got[1], `the fruit should be Ann's: ${JSON.stringify(v)}; a claim got through?`);
    if (rd.kind === 1) assert(v && v.pts[0] > v.pts[1] && v.pts[1] > 0, `Ann should have had more strawberries than Bob: ${JSON.stringify(v)}; a claim got through?`);
    return `after two races: ${totals(ann)} (${prizes(ann)})`;
  } finally {
    stop.forEach((s) => s());
  }
}, { live: true }), 19);

lane(2, (f) => test("online: a Streaming Stampede game, the same on both devices, and cheating doesn't work", async () => {
  const { ann, bob } = await f.pair("stampede");
  const stop = [];
  try {
    ann.mg.net().send("start");
    await until(() => ann.mg.phase() === "play" && bob.mg.phase() === "play", "the round", 20000);
    stop.push(autocount(ann), autocount(bob, -1)); // Ann counts right, Bob one short
    const net = bob.mg.net(), r = ann.mg.room().round, g = bob.mg.game;
    // Bob counts for Ann's seat, and for a CPU's
    await until(() => g.now.f > 5, "the counting", 30000);
    net.send("count", { r, s: 0, n: 0, f: g.now.f });
    net.send("count", { r, s: 2, n: 0, f: g.now.f });
    await until(() => [ann, bob].every((w) => w.mg.game.verdicts[0]?.told), "the first answer, on both devices", 40000);
    const v = (w) => JSON.stringify(w.mg.game.verdicts[0].counts) + " " + JSON.stringify(w.mg.game.verdicts[0].pts);
    assert(v(ann) === v(bob), `the first answer: ${v(ann)} / ${v(bob)}`);
    const a = ann.mg.game.verdicts[0], Q = ann.mg.game.qs[0];
    assert(a.counts[0] === Q.answer && a.counts[1] === Q.answer - 1, `counts ${a.counts} for an answer of ${Q.answer}: a claim got through?`);
    assert(a.pts[0] === 10 && a.pts[1] === (Q.answer - 1 ? 5 : 0), "points " + a.pts);
    return `the first answer (${Q.answer}): counts ${a.counts}, points ${a.pts}`;
  } finally {
    stop.forEach((s) => s());
  }
}, { live: true }), 12);

lane(2, (f) => test("online: a Tumbling Togepi race, the same on both devices, and cheating doesn't work", async () => {
  const { ann, bob } = await f.pair("togepi");
  const stop = [];
  try {
    ann.mg.net().send("start");
    await until(() => ann.mg.phase() === "play" && bob.mg.phase() === "play", "the round", 20000);
    stop.push(await autorun(ann), await autorun(bob));
    const net = bob.mg.net(), r = ann.mg.room().round, g = bob.mg.game;
    await until(() => g.frame > 60, "two seconds in", 20000);
    // Bob steers Ann's Togepi, says a change he didn't make was long ago, and sends one off the stick's range
    net.send("stick", { r, s: 0, f: g.frame, x: 60, y: 0 });
    net.send("stick", { r, s: 1, f: 5, x: -60, y: 0 });
    net.send("stick", { r, s: 1, f: g.frame + 1, x: 90, y: -60 });
    await until(() => [ann, bob].every((w) => w.mg.game.result), "the end, on both devices", 90000);
    const res = (w) => JSON.stringify(w.mg.game.result);
    assert(res(ann) === res(bob), `the end: ${res(ann)} / ${res(bob)}`);
    const f = ann.mg.game.result;
    // each device's run of each lane comes to the server's finishes: so the server took the same
    // sticks (Bob's made-up old one at the frame it counts from, as told back to him)
    const fins = (w) => w.mg.game.lanes.map((l) => l.finish).join();
    assert(fins(ann) === f.fin.join() && fins(bob) === f.fin.join(), `finishes: Ann's ${fins(ann)}, Bob's ${fins(bob)}, the server's ${f.fin}`);
    assert(f.fin[0] !== null && f.fin[1] !== null, "someone didn't get there: " + f.fin);
    await until(() => ann.mg.phase() === "results" && bob.mg.phase() === "results", "the results", 30000);
    assert(ranking(ann) === ranking(bob), `the rankings differ: ${ranking(ann)} / ${ranking(bob)}`);
    return `finishes ${f.fin.join(", ")}`;
  } finally {
    stop.forEach((s) => s());
  }
}, { live: true }), 36);

lane(2, (f) => test("online: a Clear Cut Challenge round, the same on both devices, and cheating doesn't work", async () => {
  const { ann, bob } = await f.pair("clearcut");
  await until(() => bob.mg.mini?.game?.logs !== undefined, "Clear Cut Challenge loaded");
  const stop = [];
  try {
    ann.mg.net().send("start");
    await until(() => ann.mg.phase() === "play" && bob.mg.phase() === "play", "the round", 20000);
    stop.push(autocut(ann, 0), autocut(bob, 2)); // Ann cuts on the line (20), Bob 2 frames early (5)
    const net = bob.mg.net(), r = ann.mg.room().round, g = bob.mg.game;
    // Bob claims a perfect cut for Ann's seat, a cut for a log that hasn't come up yet, and a second cut
    net.send("cut", { r, s: 0, n: 0, f: g.logs[0].T });
    net.send("cut", { r, s: 1, n: 3, f: g.logs[3].T });
    await until(() => g.players.every((p) => p.cuts[1]?.told), "the second log, judged on Bob's device", 60000);
    net.send("cut", { r, s: 1, n: 1, f: g.logs[1].T });
    await sleep(1000);
    const cuts = (w) => w.mg.game.players.map((p) => p.cuts.slice(0, 2).map((c) => c && `${c.f}/${c.pts}`).join(" "));
    assert(cuts(ann).join() === cuts(bob).join(), `the cuts differ: ${cuts(ann)} / ${cuts(bob)}`);
    const pts = (w, z) => w.mg.game.players[z].cuts.slice(0, 2).map((c) => c.pts).join();
    assert(pts(ann, 0) === "20,20" && pts(ann, 1) === "5,5", `Ann ${pts(ann, 0)}, Bob ${pts(ann, 1)}: a claim got through`);
    const totals = (w) => w.mg.game.players.map((p) => p.total).join();
    await sleep(3000);
    assert(totals(ann) === totals(bob), `totals: ${totals(ann)} / ${totals(bob)}`);
    return `after two logs: ${totals(ann)}`;
  } finally {
    stop.forEach((s) => s());
  }
}, { live: true }), 34);

lane(2, (f) => test("online: a Pichu's Power Plant game, the same on both devices, and cheating doesn't work", async () => {
  const { ann, bob } = await f.pair("pichu");
  const stop = [];
  try {
    ann.mg.net().send("start");
    await until(() => ann.mg.phase() === "play" && bob.mg.phase() === "play", "the round", 20000);
    stop.push(autopress(ann, 3), autopress(bob, 5)); // Ann's quicker than Bob
    const net = bob.mg.net(), r = ann.mg.room().round, g = bob.mg.game;
    await until(() => g.frame > 60, "two seconds in", 20000);
    // Bob presses for Ann's seat, says a press he didn't make was long ago, and presses three times in a frame
    const e = g.P.list[g.P.at.cur[g.frame - 1]];
    net.send("press", { r, s: 0, f: g.frame, d: e.dir, b: e.btn });
    for (const f of [5, 6, 7]) net.send("press", { r, s: 1, f, d: e.dir, b: e.btn });
    for (let k = 0; k < 3; k++) net.send("press", { r, s: 1, f: g.frame + 2, d: e.dir, b: e.btn });
    await until(() => [ann, bob].every((w) => w.mg.game.result), "the finish, on both devices", 60000);
    const res = (w) => JSON.stringify(w.mg.game.result);
    assert(res(ann) === res(bob), `the finish: ${res(ann)} / ${res(bob)}`);
    const f = ann.mg.game.result;
    assert(f.winners.join() === "true,false,false,false" && f.e[0] === 80 && f.e[1] < 80, "the finish " + res(ann) + ": a claim got through?");
    // the presses each device has from the server (and Ann's own) come to the server's charges, by the
    // rules there: so the server took none that breaks them (Bob's view of himself is off after his own
    // made-up presses, which is his lookout)
    const hits = (w, z) => w.mg.game.runners[z].presses.filter((p) => p[3] === "hit" && p[0] <= f.at).length;
    const seen = `${hits(ann, 0)},${hits(ann, 1)},${hits(bob, 0)}`;
    assert(seen === `${f.e[0]},${f.e[1]},${f.e[0]}`, `charges (Ann's of Ann and Bob, Bob's of Ann): ${seen}, the server's ${f.e}`);
    await until(() => ann.mg.phase() === "results" && bob.mg.phase() === "results", "the results", 20000);
    assert(ranking(ann) === ranking(bob), `the rankings differ: ${ranking(ann)} / ${ranking(bob)}`);
    return `full at frame ${f.at}: ${f.e.join(", ")} (Bob's device has him at ${hits(bob, 1)})`;
  } finally {
    stop.forEach((s) => s());
  }
}, { live: true }), 16);

lane(1, (f) => test("a solo round starts and plays: Egg Emergency", async () => {
  const solo = await f.open("game=egg");
  solo.document.querySelector("#play").click();
  await until(() => solo.mg.phase() === "play" && solo.mg.game.time > 4, "Egg Emergency's round to be under way");
  const g = solo.mg.game;
  assert(g.control.join() === "local,cpu,cpu,cpu", "seats " + g.control);
  assert(g.players.some((p) => p.eggs > 0), "no one has caught anything");
  solo.mg.title(); // (as Telegram's back button does)
  assert(solo.mg.phase() === "title", "back to the title: " + solo.mg.phase());
}, { live: true }));

lane(1, (f) => test("a solo round starts and plays: Clear Cut Challenge", async () => {
  const solo = await f.open("game=clearcut");
  solo.document.querySelector("#play").click();
  const stop = autocut(solo, 1);
  try {
    await until(() => solo.mg.phase() === "play" && solo.mg.game.logs && solo.mg.game.time > (solo.mg.game.times[0].judged + 30) / 30,
                "Clear Cut Challenge's first log", 30000);
  } finally { stop(); }
  const g = solo.mg.game;
  const first = g.players.map((p) => p.cuts[0]?.pts);
  assert(g.control.join() === "local,cpu,cpu,cpu", "seats " + g.control);
  assert(first[0] === 10, "cut a frame early, the first log gave " + first[0]);
  assert(first.every((x) => Number.isInteger(x)), "a seat's first log wasn't judged: " + first);
  return "the first log: " + first.join(", ");
}, { live: true }));

lane(1, (f) => test("a solo round starts and plays: Eager Eevee", async () => {
  const solo = await f.open("game=eevee");
  solo.document.querySelector("#play").click();
  const stopDash = autodash(solo, 6);
  try {
    await until(() => solo.mg.phase() === "play" && solo.mg.game.lastFrame > solo.mg.game.times[0].open + 60,
                "Eager Eevee's first race", 30000);
  } finally { stopDash(); }
  const g = solo.mg.game;
  const rd = g.rounds[0], v = g.verdict[0];
  assert(rd.kind === 2 ? !v || v.pts.every((x) => x === 0) : v && v.got[0], `the first race (kind ${rd.kind}): ${JSON.stringify(v)}`);
  return `the first race: ${v ? v.pts.join(", ") : "no one"}`;
}, { live: true }));

lane(1, (f) => test("a solo round starts and plays: Streaming Stampede", async () => {
  const solo = await f.open("game=stampede");
  solo.document.querySelector("#play").click();
  const stopCount = autocount(solo);
  try {
    await until(() => solo.mg.phase() === "play" && solo.mg.game.at && solo.mg.game.lastFrame > solo.mg.game.at[0].judged + 5,
                "Streaming Stampede's first answer", 40000);
  } finally { stopCount(); }
  const g = solo.mg.game;
  const answer = g.verdicts[0];
  assert(g.cpus.join() === "false,true,true,true", "CPUs " + g.cpus);
  assert(answer && answer.counts[0] === g.qs[0].answer && answer.pts[0] === 10, "counting right, the first answer gave " + JSON.stringify(answer));
  return "the first answer: " + answer.pts.join(", ");
}, { live: true }));

lane(1, (f) => test("a solo round starts and plays: Pichu's Power Plant", async () => {
  const solo = await f.open("game=pichu");
  solo.document.querySelector("#play").click();
  const stopPress = autopress(solo, 3);
  try {
    await until(() => solo.mg.phase() === "play" && solo.mg.game.lastFrame > 120, "Pichu's Power Plant's first 4 s", 30000);
  } finally { stopPress(); }
  const g = solo.mg.game;
  const charges = [0, 1, 2, 3].map((z) => g.charge(z));
  assert(g.cpus.join() === "false,true,true,true", "CPUs " + g.cpus);
  assert(charges[0] >= 30 && charges.slice(1).every((x) => x > 5 && x < charges[0]), "4 s in, the charges are " + charges);
  return "the charges 4 s in: " + charges.join(", ");
}, { live: true }));

lane(1, (f) => test("a solo round starts and plays: Tumbling Togepi", async () => {
  const solo = await f.open("game=togepi");
  solo.document.querySelector("#play").click();
  const stopRun = await autorun(solo);
  try {
    await until(() => solo.mg.phase() === "play" && solo.mg.game.lastFrame > 120, "Tumbling Togepi's first 4 s", 30000);
  } finally { stopRun(); }
  const g = solo.mg.game;
  const far = [0, 1, 2, 3].map((z) => g.progressOf(z));
  assert(g.cpus.join() === "false,true,true,true", "CPUs " + g.cpus);
  assert(far.every((x) => x >= 5 && x < 30), "4 s in, the progress is " + far);
  return `the progress 4 s in: ${far.join(", ")}%`;
}, { live: true }));

lane(1, (f) => test("a solo round starts and plays: Gutsy Golbat", async () => {
  const solo = await f.open("game=golbat");
  solo.document.querySelector("#play").click();
  const stopFlap = autoflap(solo);
  try {
    await until(() => solo.mg.phase() === "play" && solo.mg.game.lastFrame > 120, "Gutsy Golbat's first 4 s", 30000);
  } finally { stopFlap(); }
  const g = solo.mg.game;
  const { START } = await moduleOf(solo, "./src/golbat/rules.js");
  const moved = g.world.g.map((o, z) => Math.round(Math.hypot(o.x - START[z][0], o.y - START[z][1])));
  assert(g.cpus.join() === "false,true,true,true", "CPUs " + g.cpus);
  assert(moved.every((d) => d > 20) && g.world.mags.length + g.world.hearts.length > 0, `4 s in, the Golbat have moved ${moved}, with ${g.world.mags.length} Magnemite`);
  return "moved 4 s in: " + moved.join(", ");
}, { live: true }));

lane(1, (f) => test("a solo round starts and plays: Barrier Ball", async () => {
  const solo = await f.open("game=barrier");
  solo.document.querySelector("#play").click();
  const stopSlide = autoslide(solo);
  try {
    await until(() => solo.mg.phase() === "play" && solo.mg.game.lastFrame > 120, "Barrier Ball's first 4 s", 30000);
  } finally { stopSlide(); }
  const g = solo.mg.game;
  const R = await moduleOf(solo, "./src/barrier/rules.js");
  const slid = g.world.m.map((m) => Math.round(Math.abs(m.x - -R.SEATS[m.z].n[0] * R.STAND)));
  // (balls flown off: or one's already gone in, and the next is still in the hole)
  const served = g.world.balls.filter((b) => !b.serving).length || g.world.ids - 1;
  assert(g.cpus.join() === "false,true,true,true", "CPUs " + g.cpus);
  // (a CPU wanders to a random spot in its lane, which may be next to where it started)
  assert(slid[0] > 5 && slid.slice(1).some((d) => d > 5) && served > 0, `4 s in, the Mr. Mime have slid ${slid}, with ${served} balls in play`);
  return "slid 4 s in: " + slid.join(", ");
}, { live: true }));

lane(1, (f) => test("a solo Rampage Rollout race, run on to the end, gets to the results", async () => {
  // (through the shell, as a person plays it, but quicker: from GO this test runs the frames itself)
  const solo = await f.open("norender&game=rollout");
  solo.document.querySelector("#play").click();
  await until(() => solo.mg.phase() === "play", "GO", 15000);
  const g = solo.mg.game;
  solo.mg.paused = true;
  try {
    for (let k = 0; k < 4000 && solo.mg.phase() === "play"; k++) {
      g.setDpad(rolloutDrive(g.world.d[g.me]));
      if (k % 40 === 0) g.press();
      solo.mg.tick(1 / 30);
    }
  } finally { solo.mg.paused = false; }
  await until(() => solo.mg.phase() === "results", `the results (the race over at frame ${g.world.end}, ${solo.mg.phase()})`, 20000);
  const rows = ranking(solo).split(" | ");
  assert(rows.length === 4, "the ranking: " + ranking(solo));
  return ranking(solo);
}, { live: true }));

lane(1, (f) => test("a solo round starts and plays: Topsy-Turvy", async () => {
  const solo = await f.open("game=topsy");
  solo.document.querySelector("#play").click();
  const stop = autospin(solo);
  try {
    await until(() => solo.mg.phase() === "play" && solo.mg.game.lastFrame > 120, "Topsy-Turvy's first 4 s", 30000); // (30 frames a second)
  } finally { stop(); }
  const g = solo.mg.game, states = g.world.p.map((p) => p.state);
  assert(g.cpus.join() === "false,true,true,true", "CPUs " + g.cpus);
  // (at GO they jump in: 4 s on, they're in the ring, or one knocked out already)
  assert(states.every((s) => s >= 2 && s <= 4) && states.filter((s) => s === 3).length >= 2, `4 s in, their states: ${states}`);
  return "states 4 s in: " + states.join(", ");
}, { live: true }));

lane(1, (f) => test("a solo round starts and plays: Furret's Frolic", async () => {
  const solo = await f.open("game=furret");
  solo.document.querySelector("#play").click();
  const stop = autobat(solo);
  try {
    await until(() => solo.mg.phase() === "play" && solo.mg.game.lastFrame > 150, "Furret's Frolic's first 5 s", 30000);
  } finally { stop(); }
  const g = solo.mg.game, w = g.world, clips = w.p.map((p) => p.f.clip);
  assert(g.cpus.join() === "false,true,true,true", "CPUs " + g.cpus);
  // (at GO they pop up; 5 s on, they're up and about, and a ball's come)
  assert(w.p.every((p) => !p.f.frozen) && w.ids >= 1 && w.left === 1800 - 1 - w.t, `5 s in: clips ${clips}, ${w.ids} balls, ${w.left} left`);
  return `5 s in: clips ${clips.join(", ")}; ${w.balls.length} ball(s) on the field`;
}, { live: true }));

lane(1, (f) => test("a solo round starts and plays: Delibird's Delivery", async () => {
  const solo = await f.open("game=delibird");
  solo.document.querySelector("#play").click();
  const stop = autodeliver(solo);
  try {
    await until(() => solo.mg.phase() === "play" && solo.mg.game.lastFrame > 240, "Delibird's Delivery's first 8 s", 30000);
  } finally { stop(); }
  const g = solo.mg.game, w = g.world;
  assert(g.cpus.join() === "false,true,true,true", "CPUs " + g.cpus);
  // (8 s in: gifts on the belt, Swinub about, someone's picked a gift up; the clock down by the frames)
  assert(w.onBelt.length > 0 && w.ids > 10 && w.p.some((p) => p.load > 0 || p.got.length > 0) && w.clock === 1800 - 1 - w.t,
    `8 s in: ${w.onBelt.length} gifts on the belt, ${w.swinub.length} Swinub, loads ${w.p.map((p) => p.load)}, clock ${w.clock}`);
  return `8 s in: ${w.onBelt.length} gift(s) on the belt, ${w.swinub.length} Swinub; sacks ${w.p.map((p) => p.load).join(", ")}`;
}, { live: true }));

lane(1, (f) => test("a solo round starts and plays: Rampage Rollout", async () => {
  const solo = await f.open("game=rollout");
  solo.document.querySelector("#play").click();
  const stop = autodrive(solo);
  try {
    await until(() => solo.mg.phase() === "play" && solo.mg.game.lastFrame > 120, "Rampage Rollout's first 4 s", 30000);
  } finally { stop(); }
  const g = solo.mg.game, far = g.world.d.map((d) => Math.round(d.progress * 100));
  assert(g.cpus.join() === "false,true,true,true", "CPUs " + g.cpus);
  // (on the grid they're about 0.9 of the way round to the line; 4 s on, past it and on round)
  assert(g.world.d.every((d) => d.speed > 5 && d.progress > 0.1 && d.progress < 0.8), `4 s in, the progress is ${far}`);
  return "progress 4 s in: " + far.join(", ");
}, { live: true }));

await runLanes(lanes.sort((a, b) => b.secs - a.secs)); // (a stable sort: the rest keep their order)

const passed = results.filter((r) => r.ok).length, failed = results.filter((r) => r.ok === false).length;
const verdict = failed ? "FAIL" : passed < results.length ? "INCONCLUSIVE" : "PASS";
document.title = `${verdict} ${passed}/${results.length}: minigames tests`;
$("#report h1").textContent = `${verdict}: ${passed}/${results.length} passed`;
window.finished = true;
