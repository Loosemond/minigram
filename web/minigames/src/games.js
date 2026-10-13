// The minigames. The title screen and the lobby list these; a game's code and
// files are only loaded once it's picked (import() and its own assets/<id>/),
// so a player downloads just the games they play. The id is also the rooms
// server's name for the game (tools/rooms.py).
//
// countdown: the game's own, if not the usual (module #64's, 0x87F006BC: docs/
// minigames.md): step, the frames between "3", "2", "1" and GO (20, unless the
// game sets its own: 0x87F00020; tools/rooms.py has the same); count and go,
// its sounds on them ("count" and "go"; null: none); song, [frame, name]: a
// song it starts during it.
export const GAMES = {
  egg: {
    id: "egg",
    name: "Egg Emergency",
    banner: "assets/ui/title_egg.png", // the game's name banner (image bank 403)
    art: "assets/egg/backdrop.jpg", // behind the banner on the title and in the lobby
    color: "#4a3a30", // the page and Telegram's header while it's on
    how: `Catch the falling eggs! Hold the <b>left</b> or <b>right</b> side of the
      screen to lean that way; let go to lean back. Dodge the <b class="volt">Voltorb</b>,
      or you'll drop some of your eggs. There are 100 eggs in all: catch the most to win!`,
    keys: "Keyboard: <kbd>←</kbd> <kbd>→</kbd>",
    unit: (n) => `<i class="egg"></i>${n}`, // a score in the results
    invite: "Catch eggs with me in Egg Emergency!",
    store: "", // Telegram / local storage keys: Egg Emergency's are the old unprefixed ones
    messages: ["lean", "ev", "deal"], // its messages about a round, through the rooms server
    load: () => import("./egg/index.js"),
  },
  clearcut: {
    id: "clearcut",
    name: "Clear Cut Challenge",
    banner: "assets/ui/title_clearcut.png", // image bank 396
    art: "assets/clearcut/backdrop.jpg",
    color: "#27353a",
    how: `Tap the screen to make Scyther cut the falling log at the <b>white line</b>.
      The closer your cut, the more points: a perfect cut scores 20. Cut early and you
      score less; cut late, above the line, and you <b class="volt">lose</b> points.
      There are five logs: the highest total wins!`,
    keys: "Keyboard: <kbd>Space</kbd>",
    unit: (n) => `${n}<small>pts</small>`,
    invite: "Cut logs with me in Clear Cut Challenge!",
    store: "clearcut_",
    messages: ["cut"],
    load: () => import("./clearcut/index.js"),
  },
  eevee: {
    id: "eevee",
    name: "Eager Eevee",
    banner: "assets/ui/title_eevee.png", // image bank 388
    art: "assets/eevee/backdrop.jpg",
    color: "#2f4a24",
    how: `When Aipom lifts the basket, tap to make Eevee <b>dash</b> to what's under it:
      a melon (1000 points), grapes (500) or strawberries (100 each, shared). Tap <b>Feint</b>
      to fake a dash. Dash too soon and Eevee runs into the basket; dash at a
      <b class="volt">Pineco</b> and it blows up! Five races: the highest score wins.`,
    keys: "Keyboard: <kbd>Space</kbd> dash, <kbd>B</kbd> feint",
    unit: (n) => `${n}<small>pts</small>`,
    invite: "Race to the fruit with me in Eager Eevee!",
    store: "eevee_",
    messages: ["dash", "got", "out"],
    // Pichu's Power Plant's count (0x2F00), no GO sound, and song 53 at frame 65 (0x86B01BB0-0x86B01BF0)
    countdown: { go: null, song: [65, "main"] },
    load: () => import("./eevee/index.js"),
  },
  stampede: {
    id: "stampede",
    name: "Streaming Stampede",
    banner: "assets/ui/title_stampede.png", // image bank 411
    art: "assets/stampede/backdrop.png", // (its circus backdrop, drawn flat: tools/web_assets.py)
    color: "#3a2a5a",
    how: `Count the Pokémon that go by! The board says which to count: tap (or the
      <b>Count</b> pad) once for each one. You won't see your count till the answer. Exact
      scores 10 points (20 on questions 3 and 4, 40 on the last); one or two off still
      scores. Five questions: the highest total wins!`,
    keys: "Keyboard: <kbd>Space</kbd>",
    unit: (n) => `${n}<small>pts</small>`,
    invite: "Count Pokémon with me in Streaming Stampede!",
    store: "stampede_",
    messages: ["count", "ans"],
    // (0x869055FC; no sounds: neither module asks for any; song 29 on the opening move's
    // frame 25, the countdown's 26th: 0x86905630)
    countdown: { step: 25, count: null, go: null, song: [26, "intro"] },
    load: () => import("./stampede/index.js"),
  },
  pichu: {
    id: "pichu",
    name: "Pichu's Power Plant",
    banner: "assets/ui/title_pichu.png", // image bank 408
    art: "assets/pichu/art.png", // (its frame, drawn flat: tools/web_assets.py)
    color: "#2f2a40",
    // two ways to play on a screen: the D-pad held towards the Electrode, or a
    // tap on the Electrode to aim at it; both with the A and B buttons
    controls: { dpad: "D-pad", tap: "Tap to aim" },
    how: (c) => `When an Electrode pops out, ${c === "tap" ? "<b>tap it</b> in your room to aim at it" : "hold the <b>D-pad</b> towards it"}
      and press the button its lamp shows: <b class="blue">A</b> for blue, <b class="green">B</b> for green. Each
      right press charges your Pichu; the wrong button, or one at an Electrode that's
      gone back in, <b class="volt">shocks</b> it for a moment. The first to fully charge wins!`,
    keys: "Keyboard: <kbd>←</kbd> <kbd>↑</kbd> <kbd>↓</kbd> <kbd>→</kbd> hold, <kbd>X</kbd> A, <kbd>Z</kbd> B",
    unit: (n) => `${n}<small>/80</small>`,
    invite: "Charge up with me in Pichu's Power Plant!",
    store: "pichu_",
    messages: ["press", "won"],
    load: () => import("./pichu/index.js"),
  },
  togepi: {
    id: "togepi",
    name: "Tumbling Togepi",
    banner: "assets/ui/title_togepi.png", // image bank 417
    art: "assets/togepi/art.png", // (its track, START to GOAL: image bank 226)
    color: "#2f4a2a",
    how: `Race your Togepi down its treadmill! <b>Hold</b> on your belt to run: Togepi heads for
      your finger. Run round the <b>flowers</b> (they slow you), the rocks and the logs (they knock
      you down), and the Diglett. Step on a <b class="blue">blue arrow</b> to dash: faster, hopping
      over most things. The first to the goal wins!`,
    keys: "Or the keyboard: hold <kbd>↓</kbd> to run, <kbd>←</kbd> <kbd>→</kbd> to steer",
    unit: (n) => (n === null || n === undefined ? "–" : `${(n / 100).toFixed(2)}<small>s</small>`),
    lower: true, // (a time: the less the better)
    invite: "Race me in Tumbling Togepi!",
    store: "togepi_",
    messages: ["stick", "won"],
    load: () => import("./togepi/index.js"),
  },
  golbat: {
    id: "golbat",
    name: "Gutsy Golbat",
    banner: "assets/ui/title_golbat.png", // image bank 395
    art: "assets/golbat/cave.png", // (its cave: image bank 221)
    color: "#2a2433",
    how: `Fly your Golbat through the cave and catch the <b class="heart-word">hearts</b>! Slide a finger
      on the left side to fly left and right; tap the right side to <b>flap</b> up. Dodge the
      <b class="volt">Magnemite</b>: they knock your hearts out. Fly fast into another Golbat to knock
      one of theirs out! The most hearts when you reach the meadow wins.`,
    keys: "Keyboard: <kbd>←</kbd> <kbd>→</kbd> fly, <kbd>Space</kbd> flap",
    unit: (n) => `<i class="heart"></i>${n}`,
    invite: "Fly through the cave with me in Gutsy Golbat!",
    store: "golbat_",
    messages: ["pad", "won"],
    countdown: { step: 25 }, // (0x86107DF0; its own count and GO, 0x0F06 and 0x0F07)
    load: () => import("./golbat/index.js"),
  },
  barrier: {
    id: "barrier",
    name: "Barrier Ball",
    banner: "assets/ui/title_barrier.png", // image bank 374
    art: "assets/barrier/art.png", // (its court, drawn flat: tools/web_assets.py)
    color: "#22232e",
    how: `Guard your corner with Mr. Mime's <b>barrier</b>! Slide a finger to move it across your lane, and
      press <b>A</b> to <b>smash</b>: the ball flies back faster. Each bounce speeds a ball up. Let one past
      and you <b class="volt">lose</b> a point; knock one into someone else's corner and you get one.
      First to 5 points, or the most when the minute's up, wins!`,
    keys: "Mouse or <kbd>←</kbd> <kbd>→</kbd> move, click or <kbd>Space</kbd> smash",
    unit: (n) => `${n}<small>pts</small>`,
    invite: "Play Barrier Ball with me!",
    store: "barrier_",
    messages: ["pad", "won"],
    load: () => import("./barrier/index.js"),
  },
  rollout: {
    id: "rollout",
    name: "Rampage Rollout",
    banner: "assets/ui/title_rollout.png", // image bank 383
    art: "assets/rollout/art.png", // (its track from above: tools/web_assets.py)
    color: "#3b2a1c",
    how: `Race your Donphan round the track! It runs by itself: <b>slide a finger</b> (or the D-pad) to turn
      it at the corners, a quarter turn at a time. Press <b>A</b> to drop a <b class="volt">dust cloud</b>:
      whoever runs into it goes flying. You earn clouds each lap, more the further back you are; on the
      final lap a cloud sends you off at full tilt. Press A at GO for a rocket start. First of nine laps wins!`,
    keys: "Keyboard: <kbd>←</kbd> <kbd>↑</kbd> <kbd>→</kbd> <kbd>↓</kbd> turn, <kbd>Space</kbd> a dust cloud",
    unit: (n) => (n === null || n === undefined ? "–" : `${(n / 100).toFixed(2)}<small>s</small>`),
    lower: true, // (a time: the less the better)
    invite: "Race me in Rampage Rollout!",
    store: "rollout_",
    messages: ["pad", "won"],
    load: () => import("./rollout/index.js"),
  },
  topsy: {
    id: "topsy",
    name: "Topsy-Turvy",
    banner: "assets/ui/title_topsy.png", // image bank 400
    art: "assets/topsy/ring.png", // (its ring: image bank 223)
    color: "#4a2a24",
    how: `Spin your Hitmontop round the ring and knock the others out of it! <b>Slide a finger</b> (or the arrows) to
      push it about. Press <b>A</b> for a <b>RAPID SPIN</b>: harder and heavier for a moment, it sends whoever it hits
      <b class="volt">reeling</b>; then it takes a moment to charge again. Knock someone out and the point's yours.
      First to 5 points, or the most when the minute's up, wins!`,
    keys: "Keyboard: <kbd>←</kbd> <kbd>↑</kbd> <kbd>→</kbd> <kbd>↓</kbd> push, <kbd>Space</kbd> RAPID SPIN",
    unit: (n) => `${n}<small>pts</small>`,
    invite: "Spin with me in Topsy-Turvy!",
    store: "topsy_",
    messages: ["pad", "won"],
    load: () => import("./topsy/index.js"),
  },
  furret: {
    id: "furret",
    name: "Furret's Frolic",
    banner: "assets/ui/title_furret.png", // image bank 405
    art: "assets/furret/art.png", // (its field from above: tools/web_assets.py)
    color: "#2f4a24",
    how: `Bat the Poké Balls into your goal with Furret's tail! Your goal is the lane at the bottom. <b>Slide a
      finger</b> (or the arrows) and hold to hop into the grass that way; let go to hop back to the middle. Press
      <b>A</b> to swing your tail: it bats the ball it touches towards your goal. A Poké Ball scores 1, a Great Ball 2,
      an Ultra Ball 3 and a <b class="volt">Master Ball</b> 5. The most points when the minute's up wins!`,
    keys: "Keyboard: <kbd>←</kbd> <kbd>↑</kbd> <kbd>→</kbd> <kbd>↓</kbd> hop, <kbd>Space</kbd> swing",
    unit: (n) => `${n}<small>pts</small>`,
    invite: "Bat Poké Balls with me in Furret's Frolic!",
    store: "furret_",
    messages: ["pad", "won"],
    load: () => import("./furret/index.js"),
  },
  delibird: {
    id: "delibird",
    name: "Delibird's Delivery",
    banner: "assets/ui/title_delibird.png", // image bank 375
    art: "assets/delibird/art.png", // (the back of its stage, flat: tools/web_assets.py)
    color: "#4a2430",
    how: `Fill Delibird's sack with gifts and carry it up to your door! <b>Slide a finger</b> (or the arrows) to walk.
      Walk down to the gifts on the belt, facing one, to put it in your sack: five at most, and the heavier it is, the
      slower you go. Walk up to the top to hand them over; each one scores once it's through your door. The same gift
      as the last one through scores <b class="volt">double</b>, then three, four and five times! Watch out for the
      Swinub: one that runs into you knocks your gifts out. The most points when the minute's up wins!`,
    keys: "Keyboard: <kbd>←</kbd> <kbd>↑</kbd> <kbd>→</kbd> <kbd>↓</kbd> walk",
    unit: (n) => `${n}<small>pts</small>`,
    invite: "Deliver gifts with me in Delibird's Delivery!",
    store: "delibird_",
    messages: ["pad", "won"],
    load: () => import("./delibird/index.js"),
  },
};
export const ORDER = ["egg", "clearcut", "eevee", "stampede", "pichu", "togepi", "golbat", "barrier", "rollout", "topsy", "furret",
  "delibird"];
