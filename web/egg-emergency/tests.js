// Regression tests (see tests.html). They use real games in frames
// (index.html?debug, through window.egg): the game's rules and CPU levels,
// played headless in one; and online, two players in a room on the rooms
// server, playing a round with scripted leans while one of them meddles with
// it from the console the way a cheater would.

const $ = (s) => document.querySelector(s);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = (window.results = []);

// makeSchedules() digests: the same as JS_SCHEDULES in tools/test_rooms.py,
// which checks the server's copy of the drops against them
const SCHEDULES = { 1: "ba64e35664b2591f", 12345: "36b3b248013c25c9", 2147483647: "9812a4cb6c5a99c7" };
// what it takes to win a solo round: the best of the three CPUs, on average
// over 20 simulated rounds (the tuning in LEVELS in game.js)
const LEVEL_TARGETS = { easy: [42, 58], normal: [59, 73], hard: [92, 99] };
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

// Browsers pause a hidden page's animation frames, and with them the games, so
// the tests that play in real time (live) wait for the page to show, and don't
// count as failed if it was hidden while they ran.
let hidden = false;
document.addEventListener("visibilitychange", () => { hidden ||= document.hidden; });
async function shown() {
  if (!document.hidden) return;
  $("#wait").hidden = false;
  await new Promise((r) => document.addEventListener("visibilitychange", function f() {
    if (!document.hidden) { document.removeEventListener("visibilitychange", f); r(); }
  }));
  $("#wait").hidden = true;
}

async function test(name, fn, { live = false } = {}) {
  const li = $("#list").appendChild(document.createElement("li"));
  li.className = "run";
  li.append(name);
  const detail = li.appendChild(document.createElement("div"));
  detail.className = "detail";
  if (live) await shown();
  hidden = false;
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
    detail.textContent = e.message + (unsure ? " (the page was hidden while it ran: run the tests again with it showing)" : "");
    results.push({ name, ok: unsure ? null : false, detail: detail.textContent });
    console.error(unsure ? "INCONCLUSIVE" : "FAIL", name, e);
  }
}

// a game in a frame, once it has loaded
async function frame(query) {
  const f = $("#frames").appendChild(document.createElement("iframe"));
  f.src = "index.html?debug&" + query;
  await until(() => f.contentWindow.egg && f.contentWindow.egg.phase() !== "loading", "the game to load", 30000);
  return f.contentWindow; // (it stays the frame's window across reloads)
}

// the frame's own game.js module
const gameModule = (w) => new w.Function("return import('./src/game.js')")();

// run the frame's game flat out, with its page's hooks and effects off
function headless(w, fn) {
  const e = w.egg, g = e.game, saved = { listeners: g.listeners, fx: g.fx };
  e.paused = true;
  g.listeners = {};
  g.fx = new Proxy({}, { get: () => () => {} });
  try { return fn(g); } finally {
    Object.assign(g, saved);
    g.reset("normal");
    e.paused = false;
  }
}

// a scripted player: leans toward its next egg (and walks into Voltorbs)
function autoplay(w) {
  const id = w.setInterval(() => {
    const e = w.egg;
    if (e?.phase() !== "play") return;
    const g = e.game, z = e.me(), t = g.time;
    let next = -1;
    g.drops[z].forEach((d, n) => { if (d.kind === "egg" && g.arrive[z][n] > t && (next < 0 || g.arrive[z][n] < g.arrive[z][next])) next = n; });
    e.lean(next < 0 ? 0 : g.drops[z][next].col);
  }, 50);
  return () => { w.clearInterval(id); w.egg?.lean(0); };
}

// the server's word on the seats this device plays: only when it disagrees
function watch(w) {
  const e = w.egg, rec = { off: [], judged: new Map() };
  e.game.on("result", (r) => rec.judged.set(r.s + ":" + r.n, r));
  e.net().on("ev", (m) => {
    if (e.game.control[m.s] === "remote") return;
    const mine = rec.judged.get(m.s + ":" + m.n);
    if (m.k === "m" || (mine && (mine.k !== m.k || mine.e !== m.e))) rec.off.push(m);
  });
  return rec;
}

const eggs = (w) => w.egg.game.players.map((p) => p.eggs);
function same(a, b, when, slack = 2) { // (each shows the other 0.3 s behind)
  const ea = eggs(a), eb = eggs(b);
  assert(ea.every((x, i) => Math.abs(x - eb[i]) <= slack), `${when}: Ann's device shows ${ea}, Bob's ${eb}`);
}
const ranking = (w) => [...w.document.querySelectorAll("#ranking li")].map((li) => li.textContent.replace(/\s+/g, " ").trim()).join(" | ");

// ------------------------------------------------------------------ the tests

const solo = await frame("");

await test("the drops are the same as the server's copy of them", async () => {
  const { makeSchedules } = await gameModule(solo);
  const dv = new DataView(new ArrayBuffer(8));
  const hex = (x) => { dv.setFloat64(0, x); return dv.getBigUint64(0).toString(16).padStart(16, "0"); };
  for (const [seed, want] of Object.entries(SCHEDULES)) {
    const s = makeSchedules(+seed).flat().map((d) => `${hex(d.t)},${d.col},${d.kind[0]},${hex(d.fall)};`).join("");
    const sha = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
    const got = [...sha].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
    assert(got === want, `seed ${seed}: ${got}; tools/egg_rules.py expects ${want} (update both, and the digests)`);
  }
});

await test("a drop lands by the lean when it reaches the hands, as the server judges it", async () => {
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

await test("CPU levels: what it takes to win a solo round", async () => {
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

await test("the game's music and sound effects play from sound.bin", async () => {
  const n64 = await import("./src/n64audio.js");
  const audio = await import("./src/audio.js");
  const bank = await n64.loadBank("assets/sound.bin");
  // the engine flat out into an offline context: setup(engine), then at 0.15 s later(engine)
  async function render(secs, setup, later = () => {}) {
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
    while (e.time() < secs) e.step();
    const buf = await ctx.startRendering(), x = buf.getChannelData(0), y = buf.getChannelData(1);
    let peak = 0, bad = 0, tail = 0;
    for (let i = 0; i < x.length; i++) {
      const v = Math.max(Math.abs(x[i]), Math.abs(y[i]));
      if (!(v <= 1e3)) bad++;
      peak = Math.max(peak, v);
      if (i >= x.length - 64000) tail += x[i] * x[i];
    }
    assert(!bad, `${bad} samples aren't numbers`);
    assert(!e.missing.size, "not in sound.bin: " + [...e.missing].join(", "));
    return { e, notes, peak, tail: Math.sqrt(tail / 64000) };
  }
  const song = await render(26, (e) => audio.startSong(e, "egg"));
  assert(song.notes > 500 && song.peak > 0.1 && song.peak < 1, `the song: ${song.notes} notes, peak ${song.peak.toFixed(2)}`);
  assert(song.tail > 0.01, "the song stopped instead of looping");
  const win = await render(6, (e) => audio.startSong(e, "win"));
  assert(win.notes > 20 && !win.e.players[0].enabled, `the fanfare: ${win.notes} notes, still going: ${win.e.players[0].enabled}`);
  const quiet = [];
  for (const name of Object.keys(bank.sounds)) {
    const r = await render(3, (e) => audio.startEffects(e), (e) => assert(audio.trigger(e, name, 1), name + " didn't start"));
    if (!r.notes || r.peak < 0.02) quiet.push(`${name} (${r.notes} notes, peak ${r.peak.toFixed(3)})`);
  }
  assert(!quiet.length, "silent: " + quiet.join(", "));
  return `the song: ${song.notes} notes in 26 s; the fanfare: ${win.notes}; ${Object.keys(bank.sounds).length} effects`;
});

await test("a solo round starts and plays", async () => {
  solo.document.querySelector("#play").click();
  await until(() => solo.egg.phase() === "play" && solo.egg.game.time > 4, "the round to be under way");
  const g = solo.egg.game;
  assert(g.control.join() === "local,cpu,cpu,cpu", "seats " + g.control);
  assert(g.players.some((p) => p.eggs > 0), "no one has caught anything");
  solo.frameElement.remove();
}, { live: true });

const code = Array.from({ length: 4 }, () => "BCDFGHJKLMNPQRSTVWXZ"[Math.floor(Math.random() * 20)]).join("");
const ann = await frame(`create&room=${code}&as=t0&name=Ann`);
const bob = await frame(`create&room=${code}&as=t1&name=Bob`);

await test("online: a room, its lobby and the invite link", async () => {
  await until(() => ann.egg.room()?.players.length === 2 && bob.egg.room()?.players.length === 2, "both in the room");
  const r = ann.egg.room();
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
  bob.egg.net().emit("notice", { code: "name", name: "Rude" });
  assert(bob.document.querySelector("#status").textContent.includes("can't be used"), "a turned-down name isn't shown");
  return "room " + code;
});

await test("online: a round, the same on both devices, and cheating doesn't work", async () => {
  let recA = watch(ann), recB = watch(bob);
  const stop = [autoplay(ann), autoplay(bob)];
  try {
    ann.egg.net().send("start");
    await until(() => ann.egg.phase() === "play" && bob.egg.phase() === "play" && ann.egg.game.time > 6, "the round", 20000);
    const r = ann.egg.room().round, net = bob.egg.net();
    same(ann, bob, "6 s in");

    // Bob stands still for a while, then says he caught an egg he missed, with a made-up count
    stop[1]();
    await sleep(3000);
    const gb = bob.egg.game, t = gb.time;
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
    assert(ann.egg.phase() === "play" && ann.egg.room().state === "playing", "the round ended early");

    // Bob reloads mid-round: back in the same round, with the same counts
    bob.location.reload();
    await until(() => bob.egg?.phase() === "play" && Math.abs(bob.egg.game.time - ann.egg.game.time) < 0.5, "Bob back in the round", 20000);
    const lost = recB.off;
    recB = watch(bob);
    recB.off = lost;
    stop[1] = autoplay(bob);
    await sleep(2000);
    same(ann, bob, "after Bob's reload");

    await until(() => ann.egg.phase() === "results" && bob.egg.phase() === "results", "the results", 90000);
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

const passed = results.filter((r) => r.ok).length, failed = results.filter((r) => r.ok === false).length;
const verdict = failed ? "FAIL" : passed < results.length ? "INCONCLUSIVE" : "PASS";
document.title = `${verdict} ${passed}/${results.length}: Egg Emergency tests`;
$("#report h1").textContent = `${verdict}: ${passed}/${results.length} passed`;
window.finished = true;
