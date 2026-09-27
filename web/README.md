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
connections open, since the game loads ~60 small files.

Add `?debug` to the URL to get `window.egg` in the console (`egg.game`,
`egg.paused = true`, `egg.lean(-1 | 0 | 1)`). `clips.html` plays every Chansey
clip side by side (`?t=0.3` freezes them at a time).

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
  water, and the three CPUs get small boxes along the top, apart from each
  other and outlined in their colour. Each box is framed on exactly its own
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
`src/audio.js` the sounds, `src/telegram.js` the Telegram glue, and
`src/main.js` does the layout, input, HUD and game flow.

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
- The player's Telegram first name on their score card.
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

The models are the game's own (Nintendo / Game Freak), which is why `out/` and
`assets/` stay out of git. Anything you host publicly gives them away too.

Tested in Chromium (1280×720 and a 375×812 phone view): full rounds, the CPU
levels (simulated), touch with several fingers, keyboard, and a simulated
Telegram launch (hash parameters, version 8.0) that sent all the calls above.
It hasn't been tried inside the real Telegram apps yet.
