# Minigames in the browser

Remakes of the Stadium 2 minigames in three.js, made from the extracted models
and pictures. They run in any browser and as Telegram Mini Apps.

| Minigame | Folder |
|---|---|
| Egg Emergency | [egg-emergency/](egg-emergency/) |

## Run it

```sh
python3 tools/ps2extract.py rom/ps2_eu.z64 all   # once: the models and images
python3 tools/web_assets.py                      # copy what the minigames use into web/*/assets/
python3 tools/serve_web.py                       # http://localhost:8123/egg-emergency/
```

There is no build step. three.js (0.170.0) comes from jsDelivr through an import map
in `index.html`. The `assets/` folders aren't in git, like `out/`. `serve_web.py`
exists because Python's built-in server can send `.js` with the wrong MIME type
on Windows, and browsers then refuse to load the modules; it also keeps
connections open, since the game loads ~60 small files. It also runs the
online rooms (`tools/rooms.py`) at `/ws`. Both are standard library only.

Add `?debug` to the URL to get `window.egg` in the console (`egg.game`,
`egg.paused = true`, `egg.lean(-1 | 0 | 1)`, `egg.net()`, `egg.room()`). It
works on localhost only, unless `debug` is true in `src/config.js`.
`clips.html` plays every Chansey clip side by side (`?t=0.3` freezes them at a
time). `party.html` runs several online players in one tab
([below](#online-play)).

## Egg Emergency

Four Chansey stand on a bridge in front of a building, each under their own
coloured roof (1P blue, 2P green, 3P red, 4P yellow), and catch falling
eggs. Hold the left or right side of the screen (or ← →) to lean that way;
let go to lean back. A missed egg falls past the bridge into the water and
splashes. A Voltorb shocks you and knocks 5 eggs out. Each player gets 100
eggs, and whoever catches the most wins. The CPUs come in three levels.

- **Landscape (PC, tablets):** one camera on all four players, framed like
  the game's screen, with a strip of the water under the bridge. Wider
  screens show more of the building, then its ends, the river and the far
  bank.
- **Portrait (phones):** your bay fills the screen, from the roof down to the
  water, and the other three players get small boxes along the top, apart
  from each other and outlined in their colour. Each box is framed on exactly its own
  bay, pole to pole, from the bridge up to where the eggs are about to land,
  and draws only its own player (the players' objects are on separate
  three.js layers).

**The stage.** In the game it's a pre-rendered picture (background 19).
`src/stage.js` rebuilds it in 3D to that picture's measurements: four
three-sided brick bays (73.25 px apart, one per player), fish-scale roofs in
the player colours with a scalloped eave, the dark band under the roofs, two
windows per bay with frames, sills and ivy-covered balconies, lamp posts
between the bays (a Poké Ball lamp, then a lantern), and a brick bridge with
an arch under each bay, stone coping and grass along the top, over animated
water. Colours are sampled from the picture; the textures (bricks, tiles,
railings, curtains) are drawn at load time, so everything is sharp at any
resolution. The players' windows show the Pokémon from the picture's own
window paintings, peeking over the balconies. The building carries on with
two bays on each side (the picture's edges show the roof colours going on),
then ends. It's merged into about 20 meshes, so every view draws it in a few
calls. Because it's one 3D world, each camera, the CPU views included, lines
up with its bay and bridge by itself.

**Variety.** Everyone gets the same timeline: when something drops, what
kind of pattern (single egg, two at once, a sweep across the columns, a
Voltorb with an egg to go for elsewhere) and how fast, so the round stays
fair. But each player's drops land in their own columns, with a little
timing jitter and some eggs falling faster than others. Each CPU also rolls
a personality around its level's skill every round: how quickly it notices a
drop, whether it leans early or at the last moment, whether it goes back to
the centre between drops, how much it fidgets, lapses of attention, and being
slower for a moment after a shock. In a simulated round one CPU leaned 42
times and another 135.

What comes from the ROM and what is made up
([docs/minigames.md](../docs/minigames.md#what-else-module-56-loads) has how
each asset was found):

| From the game | Made for the remake |
|---|---|
| Chansey (object 144) with its clips and face textures, the egg (145) | fall speeds, drop patterns and the CPU players (module #56's code isn't read yet) |
| the stage's layout, sizes and colours (background picture 19), the window paintings' Pokémon, Voltorb's 6-frame sprite (bank 227) | the 3D stage itself and its textures, the bays beyond the players', the far bank |
| the three-column lean-and-catch, read from Chansey's clips | where the HUD sits |
| the rules: L/R, Voltorb costs 5 eggs and a stun, 100 eggs (text 50.11) | sound effects (synthesised: the game's audio isn't extracted) |
| HUD: player badges (434), "EGGS" and digits (404), "+1" / "−5" (429), countdown 3-2-1-GO! (360), the name banner (403), "The Champion!" (358) | "FINISH!", the menus |
| effects: the splash (152), explosion textures (object 185) | how the effects move |

Colours follow [docs/colours.md](../docs/colours.md): the textures are used
without sRGB conversion, lighting is Lambert (ambient + one sun, no specular)
on the display values, and the frame is written as it is. That is close to how
the N64 shades.

Code: `src/game.js` has the rules, drop schedules, CPU players and Chansey's
clip map. `src/assets.js` loads the models and pictures. `src/fx.js` has the effects,
`src/audio.js` the sounds, `src/telegram.js` the Telegram glue, `src/net.js`
the connection to the rooms server, `src/config.js` the online settings, and
`src/main.js` does the layout, input, HUD, lobby and game flow.

## Online play

**Play with friends** on the title screen makes a room with a four-letter
code. **Invite friends** sends a link: in Telegram it opens the share picker
(with `telegramApp` set in `src/config.js`, the link opens the game straight
in Telegram, `t.me/<bot>/<app>?startapp=CODE`; without it, it's this page with
`?room=CODE`); in a browser it uses the system share sheet or copies the link.
The link is also shown under the button, with a Copy button.
The code can also be typed into the lobby. Up to four people join; the empty
spots are CPUs. Everyone gets the next free seat and its colour (1P blue, 2P
green, 3P red, 4P yellow). The host (whoever has been in the room longest)
picks the CPU level and starts. On a phone your own bay is the big view,
whichever seat you have, and names show over the cards.

How it works:

- **Each device plays its own Chansey**, with no network delay; the host's
  device also plays the CPUs. Devices send their players' leans (which
  column, from which moment of the round), and the server passes them on
  and **keeps the score itself** from them (`tools/egg_rules.py`): a drop
  counts if the player leans its way when it reaches the hands, and isn't
  still stunned from a shock. The game judges its own players the same way
  from the same leans (`Game.takes()`), so it shows a catch at once and the
  server agrees. Devices also report their catches and shocks as they
  happen, so the others see them straight away; the server checks each one
  and passes on its own verdict, with the egg count.
- **Same round, same moment.** The server deals the drops (the game's own
  schedule, from a seed; `egg_rules.py` has a copy of `makeSchedules()` that
  matches it bit for bit) and a GO time on its own clock. Clients sync to it
  with ping/pong (the lowest-delay round trip of the last 12) and run the
  round on that clock, catching up in small steps after a hiccup.
- **Other players are shown 0.3 s behind**, so their leans arrive before
  they're due. Their catches come from the server, not from what this device
  sees; if one is late, the egg falls on and the catch shows when it arrives.
- **Dropping out.** A dropped connection keeps its seat for 8 s: a reload or a
  network blip rejoins the same seat and round, with its eggs, and the leans
  made while offline go out once it's back. After that the seat becomes a
  CPU, played by the host; if the host goes, the next player takes over.
  Someone who joins mid-round waits in the lobby for the next one. Once the
  last drop has fallen, the server waits for every device to finish, up to
  5 s (a phone in the background), then sends the ranking.

**Cheating.** What the server does about it:

- **The score is the server's.** A device can't count a catch its player
  didn't make, give itself eggs, or skip a Voltorb's shock: the server works
  it all out from the leans, and a device that says otherwise is corrected.
  That goes for the CPUs too, whose leans come from the host's device.
- **Each device plays only its own seat** (the host also the CPUs), only in
  the current round; only the host picks the level and starts.
- **"Done" counts only once the last drop has fallen**, so no one can cut a
  round short.
- **Limits:** 60 messages a second per connection (400 at once, for catching
  up after a hiccup); a flood closes the connection. Two renames or level
  changes a second, and 500 rooms at most.
- **Telegram logins** are checked when the server has the bot's token
  (`TELEGRAM_BOT_TOKEN`): Telegram signs the Mini App's `initData` with it,
  so the server knows the player is who Telegram says (and that the login is
  less than a day old). Their id and name then come from Telegram, and no one
  else can get a Telegram player's id, so no one can take their seat.
  Browser players get a random id per tab, which the server never shows
  anyone.
- **Names** are checked when the server has a TypeSafe key
  (`TYPESAFE_API_KEY`): each new name goes to TypeSafe's Jev model ("fine to
  show in a family-friendly game?") before anyone sees it, and one it's less
  than 50% sure of is turned down (the player stays "Player 2"). In a test,
  ordinary names scored 0.9 or more and rude words, slurs and "Hitler" 0.03
  or less; mild ones like "Poop" (and the real name "Dick") were near 0.1, so
  they're turned down too. Answers are remembered; if TypeSafe can't be
  reached, the name goes through.
- `?debug` and `?server=` work on localhost only.

What it can't stop: a script that plays perfectly by the rules (it can know
the drops), which looks just like a flawless player; a modified host making
the CPUs play badly (it can't make them score, though); and best scores,
which are kept on each device.

**Testing.** `party.html?n=2` (up to 4) opens that many players in one tab,
each in a frame, all in one room (`&room=CODE` picks it). The first frame is
the host. The frames stack on a tall window and sit side by side on a wide one.
`python3 tools/test_rooms.py` tests the server: the protocol, the scoring and
the cheats it stops, rejoining, Telegram logins, names and limits (about half
a minute, no network).

Give the server `TELEGRAM_BOT_TOKEN` (from @BotFather) and `TYPESAFE_API_KEY`
as environment variables to turn on the login and name checks; it says at
start which are on. Neither goes to the pages.

Messages are JSON objects with their type in `t`. From the client:

| `t` | Fields | |
|---|---|---|
| `hello` | `room`, `id`, `name`, `create`, `tg` | join `room` (none: a new one; `create`: make it if it's missing). The same `id` gets the same seat back. `tg`: Telegram's `initData` |
| `ping` | `c` | the client's clock; answered with `pong` |
| `name` | `name` | rename |
| `level` | `level` | host, in the lobby: `easy`, `normal` or `hard` |
| `start` | | host, in the lobby |
| `lean` | `r`, `s`, `g`, `l` | in round `r`, seat `s` leans `l` (−1, 0, 1) from round time `g` (s) |
| `ev` | `r`, `s`, `g`, `n`, `k`, `e` | seat `s` caught its drop `n` (`k: "c"`) or was shocked by it (`"h"`), as this device judged it; `e` is its egg count after. The server answers only if it disagrees |
| `done` | `r` | this device's round is over |
| `leave` | | |

From the server: `welcome` (`room`, `seat`, `now`); `room`, the room's
state (`state` lobby or playing, `round`, `level`, `host`, `players` with
`away`, and during a round the `lineup`, with `here` for who's still in it);
`start` (`round`, `seed`, `level`, `host`, `lineup`; `at` and `go` on the
server's clock: the countdown starts at `at`, GO is at `go`; `drops`, each
seat's `[t, col, "e" or "v", fall]`; and, to rejoin midway, `scores`, each
seat's last lean `leans` `[g, l]`, last shock `hits` and how many of its
drops are judged, `settled`, in the order they arrive); `pong` (`c`, `s`);
`lean` as above (with the time the server kept: never before the seat's last
lean); `ev` (`r`, `s`, `n`, `k`, `e`, `g`), the server's verdict on a drop:
`c` caught, `h` a shock, or `m`, not a catch after all, with the egg count
`e`; `left` (`seat`); `results` (`round`, `scores`, `lineup`); `notice`
(`code: "name"`, `name`: a name turned down); and `error` (`no-room`, `full`,
`bad-code`, `busy`).

## Telegram

The page works as a Mini App as it is. `telegram.js` does this when Telegram
opens it (and nothing in a normal browser):

- `ready()`, `expand()` to full height, and `disableVerticalSwipes()` (so a
  swipe down doesn't close the game mid-round).
- Header, background and bottom-bar colours matched to the building.
- The Telegram **back button** leaves a round.
- **Haptics** on a catch, a Voltorb hit, GO and FINISH.
- **CloudStorage** keeps the best score per level, the level and the sound
  setting, so they follow the player across devices; localStorage is the
  fallback. Reads time out after 1.5 s, so a slow answer can't block loading.
- The player's Telegram first name on their score card and in rooms, and
  their Telegram id as their player id (another device rejoins the same
  seat), checked by the server when it has the bot's token.
- **Invites** through Telegram's share picker, and `startapp` links that open
  the game in a room ([Online play](#online-play)).
- Safe areas (notches, full-screen mode) through Telegram's
  `--tg-safe-area-inset-*` and `--tg-content-safe-area-inset-*` CSS variables.

Each call checks `isVersionAtLeast` first, so older clients skip what they don't support.

To put it in Telegram:

1. Telegram opens Mini Apps only over HTTPS, so the page (with its
   `assets/`) needs an HTTPS address.
2. In [@BotFather](https://t.me/BotFather): `/newbot` if you don't have a bot,
   then `/newapp`, pick the bot, and give it the URL. The game then opens from
   `t.me/<bot>/<app name>`. Or set it as the bot's menu button: `/mybots` ▸
   Bot Settings ▸ Menu Button.
3. Put that `t.me/<bot>/<app name>` link in `telegramApp` in
   `src/config.js`, so invites open the game in Telegram.
4. Start the server with the bot's token in `TELEGRAM_BOT_TOKEN`, so it
   checks logins ([Cheating](#online-play)).

The models are the game's own (Nintendo / Game Freak), which is why `out/` and
`assets/` stay out of git. Anything you host publicly gives them away too.

Tested in Chromium (1280×720 and a 375×812 phone view): full rounds, the CPU
levels (simulated), touch with several fingers, keyboard, and a simulated
Telegram launch (hash parameters, version 8.0) that sent all the calls above.
Online: full rounds with two players (both devices showed the same ranking),
a reload mid-round (it rejoined with its eggs, and the ranking still
matched), the host closing mid-round (the other player took over the CPUs
and the host's seat), joining mid-round from a simulated `startapp` launch,
a closed room's code, and a device claiming an egg its player missed (the
server corrected it within half a second, and no one else saw it).
`tools/test_rooms.py` passes its 10 checks. It hasn't been tried inside the
real Telegram apps or over a mobile network yet.
