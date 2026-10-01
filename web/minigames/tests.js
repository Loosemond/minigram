// Regression tests (see tests.html). They use real games in frames
// (index.html?debug, through window.mg): each game's rules and CPU levels,
// played headless; its sound; and online, two players in a room on the rooms
// server, picking the game in the lobby and playing rounds while one of them
// meddles with it from the console the way a cheater would.

const $ = (s) => document.querySelector(s);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = (window.results = []);

// makeSchedules() digests: the same as JS_SCHEDULES in tools/test_rooms.py,
// which checks the server's copy of the drops against them
const SCHEDULES = { 1: "ba64e35664b2591f", 12345: "36b3b248013c25c9", 2147483647: "9812a4cb6c5a99c7" };
// Clear Cut Challenge's deal() for every level code: the same as JS_DEALS in tools/test_rooms.py
const DEALS = { 1: "845261658a294406", 12345: "dcaad7cc4c79a603", 2147483647: "8c853818348d493e" };
// what it takes to win a solo round: the best of the three CPUs, on average
// over simulated rounds (Egg Emergency: the tuning in LEVELS in its game.js;
// Clear Cut Challenge: the game's own CPUs, rules.js cpuPlan)
const LEVEL_TARGETS = { easy: [42, 58], normal: [59, 73], hard: [92, 99] };
const CUT_TARGETS = { easy: [15, 26], normal: [35, 47], hard: [53, 65] };
// a short round, the same one tools/test_rooms.py plays on the server: they
// reach the hands at 0.5, 0.8, 1.1 (the Voltorb), 1.4 and 2.1
const SHORT = [[0.0, 0, "egg", 0.5], [0.3, 1, "egg", 0.5], [0.6, 1, "voltorb", 0.5], [0.9, 1, "egg", 0.5], [1.6, -1, "egg", 0.5]]
  .map(([t, col, kind, fall]) => ({ t, col, kind, fall }));

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
let hidden = false;
document.addEventListener("visibilitychange", () => { hidden ||= document.hidden; });
function pump(w) {
  let last = performance.now();
  setInterval(() => {
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
  hidden = document.hidden;
  const t0 = performance.now();
  try {
    const d = (await fn()) || "";
    li.className = "pass";
    detail.textContent = `${d} (${((performance.now() - t0) / 1000).toFixed(1)} s)`.trim();
    results.push({ name, ok: true, detail: d });
    console.log("ok  ", name, d);
  } catch (e) {
    const unsure = live && hidden;
    li.className = unsure ? "skip" : "fail";
    detail.textContent = e.message + (unsure ? " (the page was hidden while it ran: run the tests again with it showing to be sure)" : "");
    results.push({ name, ok: unsure ? null : false, detail: detail.textContent });
    console.error(unsure ? "INCONCLUSIVE" : "FAIL", name, e);
  }
}

// a game in a frame, once it has loaded
async function frame(query) {
  const f = $("#frames").appendChild(document.createElement("iframe"));
  f.src = "index.html?debug&" + query;
  await until(() => f.contentWindow.mg && f.contentWindow.mg.phase() !== "loading", "the game to load", 30000);
  pump(f.contentWindow);
  return f.contentWindow; // (it stays the frame's window across reloads)
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
    const g = e.game, z = e.me(), t = g.time;
    let next = -1;
    g.drops[z].forEach((d, n) => { if (d.kind === "egg" && g.arrive[z][n] > t && (next < 0 || g.arrive[z][n] < g.arrive[z][next])) next = n; });
    e.lean(next < 0 ? 0 : g.drops[z][next].col);
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

await test("Egg Emergency: the drops are the same as the server's copy of them", async () => {
  const { makeSchedules } = await moduleOf(solo, "./src/egg/game.js");
  const dv = new DataView(new ArrayBuffer(8));
  const hex = (x) => { dv.setFloat64(0, x); return dv.getBigUint64(0).toString(16).padStart(16, "0"); };
  for (const [seed, want] of Object.entries(SCHEDULES)) {
    const got = await sha16(makeSchedules(+seed).flat().map((d) => `${hex(d.t)},${d.col},${d.kind[0]},${hex(d.fall)};`).join(""));
    assert(got === want, `seed ${seed}: ${got}; tools/egg_rules.py expects ${want} (update both, and the digests)`);
  }
});

await test("Egg Emergency: a drop lands by the lean when it reaches the hands, as the server judges it", async () => {
  const got = [];
  const end = headless(solo, (g) => {
    g.reset("normal", 1, { me: 0, control: ["local", "cpu", "cpu", "cpu"], drops: [SHORT, SHORT, SHORT, SHORT] });
    g.on("result", (r) => { if (r.s === 0) got.push([r.n, r.k, r.e].join()); });
    g.start();
    const script = [[0, 0], [0.6, 1], [1.5, -1]]; // right for the second egg, stays for the Voltorb, left for the last
    while (g.state === "play" && g.time < 8) {
      g.players[0].want = script.filter(([t]) => t <= g.time).at(-1)[1];
      g.update(1 / 60);
    }
    return { state: g.state, eggs: g.players[0].eggs };
  });
  // the same verdicts as the server's in tools/test_rooms.py: the stunned egg (3) doesn't count
  assert(got.join(" ") === "0,c,1 1,c,2 2,h,0 4,c,1", "got " + got.join(" "));
  assert(end.state === "over" && end.eggs === 1, JSON.stringify(end));
});

await test("Egg Emergency: CPU levels, what it takes to win a solo round", async () => {
  const report = [];
  headless(solo, (g) => {
    for (const level of ["easy", "normal", "hard"]) {
      const best = [], all = [];
      for (let s = 1; s <= 20; s++) {
        g.reset(level, s * 7717 + 3, { me: 0, control: ["cpu", "cpu", "cpu", "cpu"] });
        g.start();
        for (let n = 0; g.state === "play" && n < 60 * 400; n++) g.update(1 / 60);
        const e = g.players.map((p) => p.eggs);
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
    for (let k = 0; k < 60; k++) g.update(1 / 60);
    g.remoteLean(1, g.time - 0.3, 1); // 0.3 s old when it gets here
    const early = g.players[1].want;
    for (let k = 0; k < 120; k++) g.update(1 / 60);
    return { early, want: g.players[1].want, behind: g.time - g.zoneTime(1) };
  });
  assert(end.early === 0 && end.want === 1, `the lean: ${end.early}, then ${end.want}`);
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
    assert(Math.abs(l.pieces[1].obj.position.y - l.pieces[0].obj.position.y - l.pieces.cutAt - 4) < 1e-6, "the pieces on the signpost");
  } finally {
    g.listeners = saved;
    g.reset("normal");
    g.state = "idle";
    e.paused = false;
    await e.show("egg");
  }
});

await test("a solo round starts and plays, in both games", async () => {
  solo.document.querySelector("#play").click();
  await until(() => solo.mg.phase() === "play" && solo.mg.game.time > 4, "Egg Emergency's round to be under way");
  let g = solo.mg.game;
  assert(g.control.join() === "local,cpu,cpu,cpu", "seats " + g.control);
  assert(g.players.some((p) => p.eggs > 0), "no one has caught anything");
  solo.mg.title(); // (as Telegram's back button does)
  await solo.mg.show("clearcut");
  solo.document.querySelector("#play").click();
  const stop = autocut(solo, 1);
  try {
    await until(() => solo.mg.phase() === "play" && solo.mg.game.logs && solo.mg.game.time > (solo.mg.game.times[0].judged + 30) / 30,
                "Clear Cut Challenge's first log", 30000);
  } finally { stop(); }
  g = solo.mg.game;
  const first = g.players.map((p) => p.cuts[0]?.pts);
  assert(g.control.join() === "local,cpu,cpu,cpu", "seats " + g.control);
  assert(first[0] === 10, "cut a frame early, the first log gave " + first[0]);
  assert(first.every((x) => Number.isInteger(x)), "a seat's first log wasn't judged: " + first);
  solo.frameElement.remove();
  return "Clear Cut's first log: " + first.join(", ");
}, { live: true });

const code = Array.from({ length: 4 }, () => "BCDFGHJKLMNPQRSTVWXZ"[Math.floor(Math.random() * 20)]).join("");
const ann = await frame(`create&room=${code}&as=t0&name=Ann&game=egg`);
const bob = await frame(`create&room=${code}&as=t1&name=Bob&game=egg`);

await test("online: a room, its lobby and the invite link", async () => {
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

    // Bob stands still for a while, then says he caught an egg he missed, with a made-up count
    stop[1]();
    await sleep(3000);
    const gb = bob.mg.game, t = gb.time;
    const missed = gb.drops[1].findIndex((d, n) => d.kind === "egg" && d.col !== 0 && gb.arrive[1][n] < t - 0.5 && !gb.settled[1].has(n));
    assert(missed >= 0, "Bob didn't miss an egg");
    gb.players[1].eggs = 99;
    net.send("ev", { r, s: 1, n: missed, k: "c", e: 99 });
    await sleep(800);
    assert(eggs(bob)[1] < 90 && Math.abs(eggs(bob)[1] - eggs(ann)[1]) <= 2, `the server didn't correct Bob: ${eggs(bob)} / ${eggs(ann)}`);
    assert(recB.off.some((m) => m.n === missed && m.k === "m"), "no correction for the egg Bob missed");
    recB.off = [];
    // ...claims a catch for Ann, leans for her, a drop still to come, says he's done, and tries to start
    const annCaught = [...recA.judged.values()].find((x) => x.s === 0 && x.k === "c");
    net.send("ev", { r, s: 0, n: annCaught.n, k: "c", e: 99 });
    for (let k = 1; k <= 10; k++) net.send("lean", { r, s: 0, g: t + 0.3 * k, l: k % 2 ? 1 : -1 });
    const ahead = gb.arrive[1].findIndex((a, n) => gb.drops[1][n].kind === "egg" && a > t + 5);
    net.send("ev", { r, s: 1, n: ahead, k: "c", e: 99 });
    net.send("done", { r });
    net.send("start");
    stop[1] = autoplay(bob);
    await sleep(2000);
    assert(eggs(ann)[0] < 90 && eggs(bob)[0] < 90 && eggs(ann)[1] < 90, `a claim got through: ${eggs(ann)} / ${eggs(bob)}`);
    assert(ann.mg.phase() === "play" && ann.mg.room().state === "playing", "the round ended early");

    // Bob reloads mid-round: back in the same round, with the same counts
    bob.location.reload();
    await until(() => bob.mg?.phase() === "play" && Math.abs(bob.mg.game.time - ann.mg.game.time) < 0.5, "Bob back in the round", 20000);
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

await test("online: a Clear Cut Challenge round, the same on both devices, and cheating doesn't work", async () => {
  ann.document.querySelector("#menu").click(); // back to the lobby
  bob.document.querySelector("#menu").click();
  ann.document.querySelector(`#lobby .games button[data-game="clearcut"]`).click();
  await until(() => bob.mg.room()?.game === "clearcut" && bob.mg.mini?.game?.logs !== undefined, "Clear Cut Challenge in the lobby");
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
}, { live: true });

const passed = results.filter((r) => r.ok).length, failed = results.filter((r) => r.ok === false).length;
const verdict = failed ? "FAIL" : passed < results.length ? "INCONCLUSIVE" : "PASS";
document.title = `${verdict} ${passed}/${results.length}: minigames tests`;
$("#report h1").textContent = `${verdict}: ${passed}/${results.length} passed`;
window.finished = true;
