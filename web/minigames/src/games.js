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
};
export const ORDER = ["egg", "clearcut"];
