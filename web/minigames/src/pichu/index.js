// Pichu's Power Plant in the minigames shell (main.js): the power plant and
// its cameras, the controls (a tap on an Electrode in your room, or the
// keys), its HUD (each player's charge gauge) and its online messages
// ("press", "won"). The rules are in rules.js, the game in game.js.
import * as THREE from "three";
import { loadAssets } from "./assets.js";
import { Game, LAMPS, LAMP_Z, VIEW } from "./game.js";
import * as R from "./rules.js";

export const SOUNDS = {
  url: "assets/pichu/sound.bin",
  standIns: {
    pop: (tone) => tone(988, 0, 0.08, { type: "triangle", vol: 0.08 }),
    turn0: (tone) => tone(523, 0, 0.05, { vol: 0.05 }),
    turn1: (tone) => tone(587, 0, 0.05, { vol: 0.05 }),
    turn2: (tone) => tone(659, 0, 0.05, { vol: 0.05 }),
    turn3: (tone) => tone(698, 0, 0.05, { vol: 0.05 }),
    shock: (tone, noise) => noise(0, 0.25, { vol: 0.2, filter: "highpass", freq: 2000 }),
    zapA: (tone, noise) => noise(0, 0.5, { vol: 0.25, filter: "bandpass", freq: 3000 }),
    zapB: (tone, noise) => noise(0, 0.5, { vol: 0.25, filter: "bandpass", freq: 2500 }),
    jingle0: (tone) => [784, 988].forEach((f, i) => tone(f, i * 0.1, 0.15, { vol: 0.08 })),
    jingle2: (tone) => tone(1175, 0, 0.15, { vol: 0.08 }),
    jingle3: (tone) => tone(1319, 0, 0.15, { vol: 0.08 }),
    jingle4: (tone) => tone(1568, 0, 0.3, { vol: 0.08 }),
    cry: (tone) => tone(1400, 0, 0.25, { type: "triangle", vol: 0.1, to: 1800 }),
  },
};

// the game's screen: 320 x 240, the camera's fov 30 up and down (0x80038070)
const ASPECT = 4 / 3, FOV = 30;
// The HUD, as places on the frame's front (z 64, where the game's camera
// has 4.79 units to a pixel of its 320 x 240 screen), so it goes where the
// game's does in any view: the gauges (0x86606E6C: frame bank 410, fill
// bank 409), 70 x 14 on the bars over the rooms, and the badges (0x86606E4C)
// at the rooms' outer top corners, where the cards go
const FRONT = 64, UNIT = (2 * (2210 - FRONT) * Math.tan(Math.PI / 12)) / 240;
const onFront = (sx, sy) => [(sx - 160) * UNIT, 50 + (120 - sy) * UNIT];
const GAUGE = [[40, 19], [210, 19], [40, 123], [210, 123]].map(([x, y]) => [onFront(x, y), onFront(x + 70, y + 14)]);
const BADGE = [[41, 39], [280, 39], [41, 143], [280, 143]].map(([x, y]) => onFront(x, y)); // (2P's and 4P's: their right edges)
const PER = 60 / R.FULL, WON = 61; // a gauge's fill: px a charge (0x8660673C), and a winner's
// On a phone (portrait, or a touch screen) each room has a view of its own
// (made for the remake): yours big, the others small. A room's view frames
// it and the bar over it with its gauge, head on, from about as far as the
// game's camera; yours shows what's round it too, dimmed, with the room low
// down in portrait (where the thumbs are)
const ROOMS = LAMPS.map((row) => ({ x: row[0][0], y: row[0][1] > 0 ? 295 : -205, w: 600, h: 530 }));
const ROOM_FAR = 2300, MINI_ASPECT = 1.13;
// The controls: tap your room where the Electrode is. The room is in four
// parts, by which lamp is nearest (up, down, left or right of Pichu); the
// left of the lamp is B, the right A (as on the sign in the middle: B, A).
// Where each lamp's face is when it's out (clip00 frame 4: 122 in from its base)
const REACH = 122, INWARD = [[0, -1], [0, 1], [-1, 0], [1, 0]];
const TARGETS = LAMPS.map((row) => row.map(([x, y], k) => [x + INWARD[k][0] * REACH, y + INWARD[k][1] * REACH]));
const HINT = { gap: 46, frames: 120 }; // the B and A hints: how far either side of a lamp, and till what frame of the play

export async function create(shell, onProgress) {
  const assets = await loadAssets("assets/pichu/", onProgress);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x101014);
  // the game's lights: an ambient 0x646464 and two that follow the camera (0x866026B8, 0x86602720)
  scene.add(new THREE.AmbientLight(0xffffff, 0.62 * Math.PI));
  const sun = new THREE.DirectionalLight(0xffffff, 0.45 * Math.PI);
  sun.position.set(0.3, 0.8, 1.4);
  const fill = new THREE.DirectionalLight(0x808080, 0.3 * Math.PI);
  fill.position.set(-0.6, -0.4, 1);
  scene.add(sun, fill);
  const game = new Game(scene, assets);

  // ---- its HUD ----
  const A = "assets/pichu/";
  const hud = document.createElement("div");
  hud.className = "game-hud pp";
  hud.innerHTML = `<div class="pp-dim" hidden><i></i></div>` + GAUGE.map(() => `
      <div class="pp-gauge" hidden><img class="pp-frame" src="${A}gauge.png" alt=""><i class="pp-fill"></i><i class="pp-glow"></i></div>`).join("") +
    [0, 1, 2, 3].map(() => `<img class="pp-hint" src="${A}button_b.png" alt="B"><img class="pp-hint" src="${A}button_a.png" alt="A">`).join("");
  shell.hud.append(hud);
  const gauges = [...hud.querySelectorAll(".pp-gauge")].map((g) => ({ el: g, fill: g.querySelector(".pp-fill"), glow: g.querySelector(".pp-glow") }));
  const hints = [...hud.querySelectorAll(".pp-hint")];
  const dim = hud.querySelector(".pp-dim"), focus = dim.firstElementChild;
  // a mark where you tap, the button's colour (a few, reused)
  const marks = [...Array(6)].map(() => { const d = document.createElement("i"); d.className = "pp-tap"; hud.append(d); return d; });
  let nextMark = 0;
  function mark(x, y, btn) {
    const d = marks[nextMark++ % marks.length];
    d.className = "pp-tap";
    Object.assign(d.style, { left: x + "px", top: y + "px" });
    void d.offsetWidth; // (the animation again)
    d.className = "pp-tap " + (btn === R.A ? "pp-a" : "pp-b");
  }

  // ---- sounds and the like, from the game ----
  const mine = (z) => z === shell.me();
  let humming = false;
  const hum = (on) => {
    if (on === humming) return;
    humming = on;
    if (on) shell.sound("hum", shell.me()); else shell.stopSound("hum"); // (0x200B: asked for every frame it charges)
  };
  game.on("send", (m) => shell.send("press", m));
  game.on("pop", () => shell.sound("pop")); // (0x2F03)
  game.on("turn", (z) => shell.sound("turn" + z, z)); // (0x2F04 + the player)
  game.on("hit", (z) => { if (mine(z)) shell.haptic("light"); });
  game.on("shock", (z) => {
    shell.sound("shock", z); // (0x2F08)
    if (mine(z)) { shell.haptic("medium"); shell.flash(z, "hurt"); }
  });
  game.on("full", () => hum(false));
  game.on("zap", (winners) => winners.forEach((w, z) => { if (!w) shell.sound(z === 0 || z === 3 ? "zapA" : "zapB", z); })); // (0x2F09, 0x2F0A)
  game.on("jingle", (k) => { if (k === 0) shell.sound("jingle1"); shell.sound("jingle" + (k ? k + 1 : 0)); }); // (0x2F0C-0x2F10)
  game.on("cheer", (winners) => winners.forEach((w, z) => { if (w) shell.sound("cry", z); })); // (0x2F11, a Pichu's)

  // ---- the views ----
  // "full": the game's one screen (a wide window with a mouse); "rooms": a
  // view a room (a phone)
  const coarse = window.matchMedia?.("(pointer: coarse)");
  const fullCam = new THREE.PerspectiveCamera(FOV, ASPECT, 100, 12800);
  const roomCams = [0, 1, 2, 3].map(() => new THREE.PerspectiveCamera(14, 1, 100, 12800));
  const finalCam = new THREE.PerspectiveCamera(FOV, ASPECT, 100, 12800); // (the game's view, for placing the cards during the glide)
  let views = [], mode = "full", portrait = false, tapArea = null;
  const v3 = new THREE.Vector3();
  // a point (on the frame's front, or z) on the screen, in view v (or with camera cam)
  function project(v, x, y, z = FRONT, cam = v.cam) {
    v3.set(x, y, z).project(cam);
    return [v.x + ((v3.x + 1) / 2) * v.w, v.y + ((1 - v3.y) / 2) * v.h];
  }
  const viewOf = (z) => (mode === "full" ? views[0] : views.find((v) => v.zone === z));

  // The game's view (or the opening glide to it), its 4:3 screen as big as
  // fits: a wider window shows more at the sides, a narrower one more above and below
  function aimFull(cam, v, eye, at) {
    const aspect = v.w / v.h;
    cam.aspect = aspect;
    cam.fov = aspect >= ASPECT ? FOV : THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(FOV / 2)) * ASPECT / aspect));
    cam.position.set(...eye);
    cam.lookAt(...at);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
  }
  // a room's view: the room and its bar as big as fit, head on, in the
  // middle of the view or (low) as low as they go (its lens shifted, so it's
  // still seen straight on)
  function aimRoom(v, low = false) {
    const cam = v.cam, r = ROOMS[v.zone];
    const u = Math.max(r.w / v.w, r.h / v.h) * 1.02; // (units a pixel)
    const mid = low ? Math.max(v.h / 2, v.h - r.h / u / 2 - 6) : v.h / 2; // (where the room's middle goes, px down)
    const full = 2 * Math.max(mid, v.h - mid);
    cam.fov = THREE.MathUtils.radToDeg(2 * Math.atan((full / 2) * u / ROOM_FAR));
    cam.aspect = v.w / full;
    cam.position.set(r.x, r.y, FRONT + ROOM_FAR);
    cam.lookAt(r.x, r.y, 0);
    cam.setViewOffset(v.w, full, 0, full / 2 - mid, v.w, v.h);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    v.base = cam.position.clone();
  }

  // ---- the controls: a tap in your room (as many fingers as it takes), or the keys ----
  // the press a tap at (x, y) on the screen makes: { dir, btn }, or null (not in your room)
  const ray = new THREE.Raycaster(), lamps = new THREE.Plane(new THREE.Vector3(0, 0, 1), -LAMP_Z);
  function tapAt(x, y) {
    const a = tapArea, me = shell.me(), v = viewOf(me);
    if (!a || !v || x < a.x || x > a.x + a.w || y < a.y || y > a.y + a.h) return null;
    ray.setFromCamera(new THREE.Vector2(((x - v.x) / v.w) * 2 - 1, 1 - ((y - v.y) / v.h) * 2), v.cam);
    const p = ray.ray.intersectPlane(lamps, new THREE.Vector3());
    const r = ROOMS[me];
    if (!p || (mode === "full" && (Math.abs(p.x - r.x) > r.w / 2 || Math.abs(p.y - r.y) > r.h / 2))) return null;
    let k = 0, best = Infinity;
    TARGETS[me].forEach(([tx, ty], i) => {
      const d = (p.x - tx) ** 2 + (p.y - ty) ** 2;
      if (d < best) { best = d; k = i; }
    });
    return { dir: k + 1, btn: p.x < TARGETS[me][k][0] ? R.B : R.A };
  }
  let held = 0; // the direction the keys hold: 1 up, 2 down, 3 right, 4 left (the rules'), 0 none
  const keys = []; // the arrow keys held, the last one wins
  const KEYS = { ArrowUp: 1, KeyW: 1, ArrowDown: 2, KeyS: 2, ArrowRight: 3, KeyD: 3, ArrowLeft: 4, KeyA: 4 };
  const BUTTONS = { KeyX: R.A, KeyK: R.A, Space: R.A, KeyZ: R.B, KeyJ: R.B };
  const fromKeys = () => { held = keys[keys.length - 1] || 0; };

  const api = {
    game, scene, assets,
    get views() { return views; },
    get shake() { return 0; },
    label: null,

    // a wide window with a mouse: the game's screen as big as fits, in the
    // middle; a phone: your room big (in portrait under the other three, in
    // landscape beside them)
    layout(W, H, safe, me, cards, framesEl) {
      portrait = W / H < 1.1;
      mode = portrait || coarse?.matches ? "rooms" : "full";
      dim.hidden = mode === "full";
      if (mode === "full") {
        views = [{ cam: fullCam, x: 0, y: 0, w: W, h: H }];
        tapArea = { x: 0, y: 0, w: W, h: H };
        aimFull(finalCam, views[0], VIEW.eye, VIEW.at);
        const { eye, at } = game.camera();
        aimFull(fullCam, views[0], eye, at);
        views[0].base = fullCam.position.clone();
        const k = Math.min(W, H * ASPECT) / 320;
        cards.forEach((c, i) => {
          c.classList.toggle("mini", k < 2);
          const [x, y] = project(views[0], ...BADGE[i], FRONT, finalCam);
          shell.place(c, { left: x + "px", top: y + "px", transform: i % 2 ? "translateX(-100%)" : "none" });
        });
      } else {
        if (portrait) { // yours under the small ones, to the bottom
          views = shell.miniViews(W, H, safe, me, [], MINI_ASPECT, {}, {});
          const m = views[0], bottom = Math.round(safe.bottom - 4);
          Object.assign(m, { x: 0, w: W, h: bottom - m.y });
        } else { // yours, and the small ones in a column on the right
          const pad = 8, gap = 10, colH = (safe.bottom - safe.top - 2 * pad - 2 * gap) / 3, colW = Math.round(colH * MINI_ASPECT);
          const x0 = Math.round(safe.right - pad - colW);
          views = [{ zone: me, x: 0, y: 0, w: x0 - gap, h: H }];
          [0, 1, 2, 3].filter((z) => z !== me).forEach((z, k) => views.push({
            zone: z, mini: true, x: x0, y: Math.round(safe.top + pad + k * (colH + gap)), w: colW, h: Math.round(colH),
          }));
        }
        const m = views[0];
        tapArea = { x: m.x, y: m.y, w: m.w, h: H - m.y };
        for (const v of views) { v.cam = roomCams[v.zone]; aimRoom(v, v === m && portrait); }
        // round your room: dimmed
        const r = ROOMS[me], [l, t] = project(m, r.x - r.w / 2, r.y + r.h / 2), [rr, b] = project(m, r.x + r.w / 2, r.y - r.h / 2);
        Object.assign(dim.style, { left: m.x + "px", top: m.y + "px", width: m.w + "px", height: m.h + "px" });
        Object.assign(focus.style, { left: l - m.x + "px", top: t - m.y + "px", width: rr - l + "px", height: b - t + "px" });
        shell.frameMinis(views, cards, framesEl);
        const [x, y] = project(views[0], ...BADGE[me]);
        shell.place(cards[me], { left: x + "px", top: y + "px", transform: me % 2 ? "translateX(-100%)" : "none" });
      }
      return portrait;
    },

    reset(round) {
      const m = round.start;
      // (online: the seats nobody was dealt are CPUs, as the server has them)
      const cpus = !round.online ? [0, 1, 2, 3].map((z) => z !== round.me)
        : [0, 1, 2, 3].map((z) => !(round.lineup || []).some((p) => p.seat === z));
      game.reset(round.level, round.seed, { me: round.me, control: round.control, cpus, told: m?.pp });
      shell.stopSound();
      humming = false;
      keys.length = 0;
      held = 0;
    },
    idle() {
      game.reset(game.levelName || "normal");
      game.state = "idle";
      shell.stopSound();
      humming = false;
    },
    go() { game.start(); shell.music("main"); }, // song 21, from GO
    finish() { hum(false); shell.music(null, 40); },
    stop() { game.stop(); hum(false); },
    setControl(z, c) { game.setControl(z, c); },
    get state() { return game.state; },
    get time() { return game.time; },
    step(dt) { game.update(dt); },
    animate() {},
    score(i) { return game.charge(i); },
    setScores(scores) { game.scores = scores.map((x) => x | 0); },
    celebrate() { return game.celebrate(); },
    hud(on) { drawHud(on); },
    remote(t, m) { if (t === "press" || t === "won") game.told(t, m); },

    pointerdown(e) {
      const t = tapAt(e.clientX, e.clientY);
      if (!t) return;
      mark(e.clientX, e.clientY, t.btn);
      game.press(t.dir, t.btn);
    },
    keydown(e) {
      if (KEYS[e.code]) {
        if (!keys.includes(KEYS[e.code])) keys.push(KEYS[e.code]);
        fromKeys();
        return true;
      }
      if (BUTTONS[e.code]) { if (!e.repeat) game.press(held, BUTTONS[e.code]); return true; }
      return false;
    },
    keyup(e) {
      if (!KEYS[e.code]) return;
      const k = keys.indexOf(KEYS[e.code]);
      if (k >= 0) keys.splice(k, 1);
      fromKeys();
    },
    blur() { keys.length = 0; held = 0; },
    debug: {
      press: (dir, btn) => game.press(dir, btn === "b" ? R.B : R.A),
      // where on the screen to tap for this device's player's lamp dir (1-4), its B or A side
      tapFor: (dir, btn) => {
        const [x, y] = TARGETS[shell.me()][dir - 1];
        return project(viewOf(shell.me()), x + (btn === "b" ? -30 : 30), y, LAMP_Z);
      },
      tapAt,
      get mode() { return mode; },
    },
  };

  // ---- the HUD, each frame ----
  function drawHud(on) {
    hud.classList.toggle("off", !on);
    if (mode === "full" && views[0]) {
      const { eye, at } = game.camera();
      aimFull(fullCam, views[0], eye, at);
      views[0].base = fullCam.position.clone();
    }
    const playing = game.state === "play" || game.state === "over";
    const t = Math.max(0, game.lastFrame), ready = playing || (game.state === "ready" && (mode === "rooms" || game.glide >= 1));
    for (let z = 0; z < 4; z++) {
      const g = gauges[z], v = viewOf(z);
      g.el.hidden = !ready || !v;
      if (g.el.hidden) continue;
      const [[x0, y0], [x1, y1]] = GAUGE[z], [l, tp] = project(v, x0, y0), [r] = project(v, x1, y1);
      Object.assign(g.el.style, { left: l + "px", top: tp + "px" });
      g.el.style.setProperty("--u", (r - l) / 70 + "px");
      const w = game.won(z) ? WON : Math.min(R.FULL, game.charge(z)) * PER;
      g.fill.style.width = `calc(${w} * var(--u))`;
      g.glow.style.width = g.fill.style.width;
      // the fill's pulse: a grey over it, alpha |10 - n| x 20, n 0-20 over and over in the play
      g.glow.style.opacity = game.state === "play" || game.won(z) ? String((Math.abs(10 - (t % 21)) * 20) / 255) : "0";
    }
    // the B and A sides of your lamps, through the countdown and the play's first seconds
    const me = shell.me(), v = viewOf(me), show = !!v && ready && !(playing && (game.state !== "play" || t > HINT.frames));
    hints.forEach((h, n) => {
      h.classList.toggle("on", show);
      if (!show) return;
      const [x, y] = TARGETS[me][n >> 1], [sx, sy] = project(v, x + (n % 2 ? HINT.gap : -HINT.gap), y, LAMP_Z);
      Object.assign(h.style, { left: sx + "px", top: sy + "px" });
    });
    hum(on && game.charging(me) && !shell.catchingUp());
  }

  api.idle();
  return api;
}
