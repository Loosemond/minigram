// The minigames. The title screen and the lobby list these; a game's code and
// files are only loaded once it's picked (import() and its own assets/<id>/),
// so a player downloads just the games they play. The id is also the rooms
// server's name for the game (tools/rooms.py).
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
    messages: ["lean", "ev"], // its messages about a round, through the rooms server
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
    messages: ["dash", "got"],
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
    load: () => import("./stampede/index.js"),
  },
  pichu: {
    id: "pichu",
    name: "Pichu's Power Plant",
    banner: "assets/ui/title_pichu.png", // image bank 408
    art: "assets/pichu/art.png", // (its frame, drawn flat: tools/web_assets.py)
    color: "#2f2a40",
    how: `When an Electrode pops out, hold the <b>D-pad</b> towards it and tap the button
      its lamp shows: <b class="blue">A</b> for blue, <b class="green">B</b> for green. Each
      right tap charges your Pichu; the wrong button, or a tap towards an Electrode that's
      gone back in, <b class="volt">shocks</b> it for a moment. The first to fully charge wins!`,
    keys: "Keyboard: <kbd>←</kbd> <kbd>↑</kbd> <kbd>↓</kbd> <kbd>→</kbd> hold, <kbd>X</kbd> A, <kbd>Z</kbd> B",
    unit: (n) => `${n}<small>/80</small>`,
    invite: "Charge up with me in Pichu's Power Plant!",
    store: "pichu_",
    messages: ["press", "won"],
    load: () => import("./pichu/index.js"),
  },
};
export const ORDER = ["egg", "clearcut", "eevee", "stampede", "pichu"];
