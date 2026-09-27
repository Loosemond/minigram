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
`egg.paused = true`, `egg.lean(-1 | 0 | 1)`, `egg.net()`, `egg.room()`).
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
The code can also be typed into the lobby. Up to four people join; the empty
spots are CPUs. Everyone gets the next free seat and its colour (1P blue, 2P
green, 3P red, 4P yellow). The host (whoever has been in the room longest)
picks the CPU level and starts. On a phone your own bay is the big view,
whichever seat you have, and names show over the cards.

How it works:

- **Each device plays its own Chansey**, with no network delay, and decides
  its own catches; the host's device also plays the CPUs. Players never
  touch each other's eggs, so there's nothing to reconcile: each device sends
  its leans and its results (a catch or a shock, with its egg count), and the
  server passes them on. The server keeps the counts and sends the ranking at
  the end, so everyone sees the same result.
- **Same round, same moment.** The server deals the seed (everyone gets the
  same drops) and a GO time on its own clock. Clients sync to it with
  ping/pong (the lowest-delay round trip of the last 12) and run the round
  on that clock, catching up in small steps after a hiccup.
- **Other players are shown 0.3 s behind**, so their leans arrive before
  they're due. Their catches come from their own device, not from what this
  device sees; if a result is late, the egg falls on and the catch shows when
  it arrives.
- **Dropping out.** A dropped connection keeps its seat for 8 s: a reload or a
  network blip rejoins the same seat and round, with its eggs. After that the
  seat becomes a CPU, played by the host; if the host goes, the next player
  takes over. Someone who joins mid-round waits in the lobby for the next
  one. After the first player finishes, the server waits up to 10 s for the
  rest (a phone in the background), then sends the ranking.

**Testing.** `party.html?n=2` (up to 4) opens that many players in one tab,
each in a frame, all in one room (`&room=CODE` picks it). The first frame is
the host. The frames stack on a tall window and sit side by side on a wide one.

The server trusts what players send: it only checks that each device sends
for its own seat, and the host for the CPUs. That's fine among friends. It
doesn't check Telegram's signed `initData`, which would need the bot's token
on the server.

Messages are JSON objects with their type in `t`. From the client:

| `t` | Fields | |
|---|---|---|
| `hello` | `room`, `id`, `name`, `create` | join `room` (none: a new one; `create`: make it if it's missing). The same `id` gets the same seat back |
| `ping` | `c` | the client's clock; answered with `pong` |
| `name` | `name` | rename |
| `level` | `level` | host, in the lobby: `easy`, `normal` or `hard` |
| `start` | | host, in the lobby |
| `lean` | `s`, `g`, `l` | seat `s` leans `l` (−1, 0, 1) at round time `g` (s) |
| `ev` | `s`, `g`, `n`, `k`, `e` | seat `s` caught its drop `n` (`k: "c"`) or was shocked by it (`"h"`); `e` is its egg count after |
| `done` | | this device's round is over |
| `leave` | | |

From the server: `welcome` (`room`, `seat`, `now`); `room`, the room's
state (`state` lobby or playing, `round`, `level`, `host`, `players` with
`away`, and during a round the `lineup`, with `here` for who's still in it);
`start` (`round`, `seed`, `level`, `at` on the server's clock, `host`,
`lineup`, `scores`: the countdown starts at `at`, GO is 2.65 s later);
`pong` (`c`, `s`); `lean` and `ev` as above, plus the round `r`; `left`
(`seat`); `results` (`round`, `scores`, `lineup`); and `error` (`no-room`,
`full`, `bad-code`).

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
  their Telegram id as their player id (another device rejoins the same seat).
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

The models are the game's own (Nintendo / Game Freak), which is why `out/` and
`assets/` stay out of git. Anything you host publicly gives them away too.

Tested in Chromium (1280×720 and a 375×812 phone view): full rounds, the CPU
levels (simulated), touch with several fingers, keyboard, and a simulated
Telegram launch (hash parameters, version 8.0) that sent all the calls above.
Online: full rounds with two players (both devices showed the same ranking),
a reload mid-round (it rejoined with its eggs), the host closing mid-round
(the other player took over the CPUs and the host's seat), joining mid-round
from a simulated `startapp` launch, and a closed room's code. The server's
protocol has a scripted test of its own (12 checks). It hasn't been tried
inside the real Telegram apps or over a mobile network yet.
