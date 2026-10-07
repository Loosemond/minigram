# Pokémon Stadium 2 asset extraction

Tools that pull the **Pokémon, minigame and battle-effect models (with their
animations), arenas, 2D graphics, all game text and the music's sequences and
samples** out of a Pokémon Stadium 2 ROM, in formats Blender, any image viewer
and any audio editor open directly.

```
rom/ps2_eu.z64                  your own dump of the game (not included)
tools/ps2extract.py             the extractor (Python 3, no dependencies)
tools/ps2tool/                  format code (ROM/archives/Yay0, FRAGMENT models, glTF,
                                colour combiner, effects, images, text, audio)
tools/blender/ps2_import.py     Blender add-on: asset browser, face/flipbook animation, shiny toggle,
                                clip browser, live arena materials
tools/make_previews.py          thumbnails of every model + labelled sheets (needs Blender + Pillow)
tools/web_assets.py, serve_web.py   copy assets into the browser minigames (and make their
                                sound), and serve them (with
                                rooms.py: the online rooms, egg_rules.py: their scoring, and
                                test_rooms.py)
web/                            minigames remade in three.js for the browser / Telegram (web/README.md)
docs/                           game and ROM notes: formats, tables, what's where, open questions
out/                            extracted assets (not in git: re-create with the commands below)
out/catalog.json                every model with its name, category and tags
out/thumbs/                     one thumbnail per model (used by the add-on's browser)
out/previews/                   thumbnail sheets
```

## Extract

```sh
python3 tools/ps2extract.py rom/ps2_eu.z64 all             # everything (~95 s)
python3 tools/ps2extract.py rom/ps2_eu.z64 pokemon 25 150  # or: objects / effects / images / stages / text / audio
python3 tools/make_previews.py out                         # thumbnails for the browser + sheets (~2-3 min)
```

Options: `-o DIR` output folder, `--scale` (default 0.01 — Pikachu ≈ 0.22 m;
models keep their in-game relative sizes), `--shiny-glb` (also write
`<name>_shiny.glb`), `--no-png`. The US ROM should work too (the table
offsets match the US research this is based on), but only the EU ROM was tested.

## What you get

| Folder | Contents |
|---|---|
| `pokemon/` | 282 battle models (`025_pikachu/`): every species, Substitute, Egg, Unown A–Z, 3 extras. Each has all its clips (`00_idle`, `01_entrance`, attacks, `faint`, `hit`) and texture PNGs (incl. `face/` and `shiny/`) |
| `objects/` | **Minigame characters and props**, room decorations and other 3D objects (227 modules, 245 models; `127_delibird/`, `004_squirtle_doll/`, `153_poke_ball/`…), with their own animations |
| `effects/` | **Battle/move effects**: 131 modules named after the moves that use them (`fx_081_ember_flamethrower_dragon_rage/`) → 111 particle sprites (with flipbooks and in-game colours), 203 effect models with their animations, raw effect textures |
| `images/` | 1,836 UI/HUD/minigame sprites (`banks/`), 48 JPEG backgrounds, 59 Pokémon Academy screens, 158 trainer faces, 288 Pokémon icons |
| `stages/` | the 30 battle arenas (`stage_06_pryce_mahogany_gym.glb` + `.json` with the background colour, `textures/` for the live materials) |
| `scenes/` | 3 large 3D maps: Johto, Johto around Mt. Silver, Kanto |
| `text/` | all 331 string tables (21,610 strings) as JSON + `all_text.txt` |
| `audio/` | the 137 sequences as they are (`.seq`, with an index naming the minigames' songs), the 582 instrument and sound-effect samples as WAVs (with their loops), one JSON per soundfont ([docs/audio.md](docs/audio.md)) |

### Names

Every folder and file carries a readable name, and `catalog.json` lists all of
them with category and tags. Where the names come from:

- **Pokémon, moves:** the ROM's own text tables.
- **Room decorations** (dolls, beds, posters, carpets, consoles, big dolls): the
  ROM's decoration names (text table 60). They are matched to the objects by
  appearance, because the table doesn't say which model is which.
- **Arenas:** the gym-leader order found by the
  [gen1recomp importer](https://github.com/Deftones565/gen1recomp-mod-stadium2-importer)
  research: 0–7 Johto leaders, 8 Team Rocket, 9–13 Elite Four and Lance,
  14–21 Kanto leaders, 22 Red, 26 Battle Tower, 27 Academy, 28 Free Battle Park,
  29 Rival. 23–25 are unconfirmed stadium arenas.
- **Effects:** the three moves most specific to each module.
- **Everything else** (minigame props, TV screens, fruit…): named by
  appearance. A few objects draw nothing on their own and keep a number.

### Minigames

The minigames share the general objects table (`objects/`), so their files are
not in per-minigame folders; the catalog (and the add-on's browser) lists them
in their own **Minigames** category, one group per minigame. Which object
belongs to which minigame comes from the game code: each minigame's code
overlay loads its objects through one loader (`0x8004DED4`) with the object
number as a constant, and picks the player's character model the same way.
Names are the game's own (text table 57). Details and method:
[docs/minigames.md](docs/minigames.md).

| Minigame | Objects |
|---|---|
| Gutsy Golbat | Golbat `053`, Jynx `110` |
| Topsy-Turvy | Hitmontop `115` (and `052`); through a list: the shadow `079`, rings `195`–`198`, sparks `199`/`200`, and `123`, `124`, `152`, whirlwinds `191`–`194` (never drawn) |
| Clear Cut Challenge | Scyther `122`, Pinsir `055`, Scizor `179`, signpost `059`, log slices `081`/`111`, `112` (the cut line), effects `130`/`131`, dizzy stars `190` |
| Furret's Frolic | Furret `142` (Girafarig `223` for a Game Pak's), Poké Balls `153`, the field `155` (its shadows and the ramps' boards too), bush `183` |
| Barrier Ball | Mr. Mime `129`/`218`, court pieces `120`, mesh panels `141`, `146`, Poké Balls `154` |
| Pichu's Power Plant | Pichu `107`, Pikachu `201`, the power plant's frame `056`, electrode lamps `057`, dizzy stars `190` |
| Rampage Rollout | Donphan `108` (walking and rolling), track `113` |
| Streaming Stampede | Cleffa `114` (shiny `186`), Igglybuff `119` (shiny `205`), the players' booths `080`/`100`–`102`, ramp `116`, circus backdrop `117`, books `118` |
| Tumbling Togepi | Togepi `109`, Omanyte `206`, course pieces `060`, `062`–`070`, `132`–`140`, ice block `188`, water `202` |
| Delibird's Delivery | Delibird `127` (and its sack), Swinub `082`/`103`, gift boxes `092`/`096`, the stage `147`/`148`, the gifts (`169`, `170`, `174`–`177`, `180`, `181`, `184`) |
| Egg Emergency | Chansey `144`, egg `145`, `185` |
| Eager Eevee | Eevee `143`, field `149`, Aipom `150`, Pineco `151`, `203`/`204`/`207`, fruit `208`–`216` (not `214`) |

The other Hitmontop model (`052`) and four of the fruit are grouped by
appearance: no minigame code loads them by number. The other Pokémon of the
minigames (Voltorb, Spinarak, Diglett, Magnemite, …) are 2D sprites in the
image banks (below). Numbers without a name draw effects
(sparkles, smoke, glows). Room decorations (dolls, beds, posters, plants,
consoles, carpets) are `000`–`058`, and TV screens showing N64/NES games are
`156`–`165` and `224`–`226`.

Minigame 2D graphics (e.g. "GO!", "BLOCKED!", "FACE OFF", "DRAW", "Mini-game
Champion", the minigames' sprites) are in `images/banks/`, a folder per bank:
`bank_NNN_<name>` for the ones whose use is known (`BANKS` in
`tools/ps2tool/names.py`), e.g. `bank_202_streaming_stampede_voltorb`;
`previews/image_banks_*.png` shows every bank.
Minigame instructions are text table 50.

### Battle effects

`effects/fx_NNN_<moves>/` holds one resource module. `fx_NNN.json` lists every
move that loads it (e.g. `fx_081` = fire: Ember, Flamethrower, Fire Blast…;
`fx_082` = electric; `fx_086` = water/ice). `effects/index.json` maps every move
to its modules.

- `shape_NNN.glb` are particle sprites. Their texture flipbooks play as a
  `flipbook` clip with the add-on. They are tinted with the colours the game's
  effect programs assign most often; `sprites/shape_NNN_tintK/` has the frames
  for **every** colour variant, and `shape_NNN.json` lists which moves use each
  one (e.g. smoke is white for Acid, orange for Fire Blast, blue for Surf).
- `model_NNN.glb` are 3D effect models with their matching animations.
- `raw_NNN.png` are 32×32 beam/wave textures.

What isn't reproduced is the choreography: where, when and how many particles
spawn during a move is run by the effect engine's bytecode. The assets are
all here, but not the timeline.

## Play in the browser

`web/minigames/` remakes all twelve minigames in three.js with the game's own
models, backdrops, sprites, HUD graphics, music and sound: Egg Emergency,
Clear Cut Challenge, Eager Eevee, Streaming Stampede, Pichu's Power Plant,
Tumbling Togepi, Gutsy Golbat, Barrier Ball, Rampage Rollout, Topsy-Turvy,
Furret's Frolic and Delibird's Delivery. All but Egg Emergency play by the
game's own rules, read from their code modules
([docs/minigames.md](docs/minigames.md)).
Pick one on the title screen, or in the lobby when playing online: up to four
people in a room, invited with a link, with CPUs in the empty spots. It adapts
to phones (portrait) and PCs (landscape) and runs as a Telegram Mini App.
[web/README.md](web/README.md) covers running, online play and
what's from the ROM.

```sh
python3 tools/web_assets.py && python3 tools/serve_web.py   # http://localhost:8123/
```

## Open in Blender (4.2+, tested on 4.5)

**Quick look:** File ▸ Import ▸ glTF 2.0 ▸ pick a `.glb`. You get the model
and all clips (Action Editor / NLA), but eyes, mouths and flipbooks don't change.

**Recommended — the add-on:** Edit ▸ Preferences ▸ Add-ons ▸ ⌄ ▸ *Install
from Disk…* ▸ `tools/blender/ps2_import.py`, enable it. Then:

- 3D View sidebar (N) ▸ **PS2** tab ▸ **Browser**: every model by name with
  thumbnails, in a list that scrolls with the mouse wheel (drag its bottom
  edge to make it taller). Pick a category (Pokémon, Minigames, Objects,
  Arenas, Maps, Effects) and, for Minigames and Effects, one minigame or
  effect module; type to search (names, moves and tags, e.g. "doll",
  "flamethrower"); click a row to see it large, then **Import**. Set the
  library folder (the `out/` folder) with the folder button once; it is also
  found by itself after you import any file from `out/`.
- File ▸ Import ▸ **Pokemon Stadium 2 (.glb)** — multi-select works; models line up side by side.
- 3D View sidebar (N) ▸ **PS2** tab — click a clip to play it, toggle **Shiny**.
- Eyes, mouths, cheek sparks, fire tails and effect flipbooks animate with each
  clip. The clips key `ps2_face_*` properties on the armature, and the materials
  read them (and the frame, for scrolling arena textures) through Attribute
  nodes. Values are never written into shader nodes, because on macOS every new
  value would compile another shader and playback would stall and eat memory.
  Scenes made with add-on versions before 1.6 are converted when opened.
- The scene switches to 30 fps (the game's rate) and real-time playback (Blender skips
  frames rather than slowing the animation down when the viewport can't keep up);
  untick *Game speed* in the import options if you don't want that.
- The scene's view transform is set to Standard and the materials' specular highlight
  is turned off, so the textures show their own colours: Blender's default (AgX) fades
  saturated colours (Pikachu's yellow drops from 80% to 44% saturation), and the N64
  has no specular. Untick *Game colours* in the import options to keep your settings.
  Details, and a quick fix for scenes imported before 1.7.0: [docs/colours.md](docs/colours.md).
- **Arenas and region maps get live materials.** The N64 has no shaders, but every
  arena surface has a recipe: a colour-combiner equation fed by up to two textures,
  each with its own scale, wrap and scroll speed, plus primitive/environment
  colours (sometimes animated) and the vertex colour. The add-on rebuilds that
  recipe as shader nodes, so water and clouds scroll, glows and tints pulse, and
  vertex shading is exact. Press Play to see it. Plain glTF import shows a baked
  still.
- Each arena gets its own background colour, the colour the game clears the screen
  to (sky blue in stage 28, white in Pryce's gym). It sits on a box around the arena
  (`<name>_background`, a child of the arena's rig) and stays contained: it shows
  only while you look from inside the arena, only to the camera (it lights,
  shadows and reflects nothing), is invisible in Solid mode, hides with the arena
  and is deleted with it. The scene's world and the lighting of other models are
  left alone. **Background** in the PS2 tab switches it off. See-through surfaces
  with nothing behind them (e.g. the lake in stage 28) blend over the same colour
  inside their material. *Also as world colour* in the import dialog (off by
  default) additionally sets the whole scene's world, as older versions did.
- Clicking a model also selects its armature (`<name>_rig`), so G/R/S move the whole
  model. Moving the mesh on its own pulls it off its bones and the animation then
  distorts it. Without the add-on, select the `_rig` object (e.g. in the Outliner)
  to move a model. *Move model as one piece* in the PS2 tab turns this off.

The number of clips differs per species (4–13); that is how the game is. Every
model has idle, entrance, hit and faint. Most also have sleep and 1–9 attack
clips, and the battle table maps each move to one of them.

Use Material Preview / Rendered view to see transparency (wings, fins, particles,
arena floor markings). Solid view ignores it, so arena overlays show as dark squares there.

## How it works (short)

- The ROM holds archive tables (`tag, 0, size, count` + 16-byte records),
  mostly PERS-SZP/Yay0-compressed:

  | Offset | Table |
  |---|---|
  | `0x27ED000` | Pokémon models |
  | `0x2D7D000` | Pokémon animation banks |
  | `0x2000000` | objects |
  | `0x267D000` | effects |
  | `0x1638000` | arenas |
  | `0x449840` | scenes |
  | `0x1898000` | image banks |
  | `0x1E70000`, `0x2230000` | JPEGs |
  | `0x2268000` | faces |
  | `0x258D000` | icons |
  | `0x1D70000` | text |
  | `0x1718000` | battle table |
  | `0x3FD5000`, `0x3FED000` | shiny data |

  Code fragment 79 (the battle-effect engine) maps moves to effect modules and particle colours.
- Models are relocatable FRAGMENT modules (base `0x8FF00000`) with a
  geo-layout command stream (bones, materials, draws) and F3DEX2 display lists.
  Some materials are supplied at draw time by callbacks. Their N64
  colour-combiner equations are evaluated on the CPU and baked into the textures.
- Animation clips are packed 12/16-bit or Hermite-keyed S/R/T channels; bones
  pick their channel explicitly.
- Stadium inherits bone scale along each bone's own axes. Plain glTF would
  shear, so every joint is exported as a rotation/translation bone plus a
  `_scale` leaf bone that carries the accumulated scale. Poses are exact.
- Shiny = per-species HSL shift, except a few species (e.g. red Gyarados) that
  have their own texture set.
- Arenas: each draw carries its render layer (1 opaque, 4 alpha-test, 6 translucent),
  which decides the blend mode. The arena module's entry point also returns the
  background colour (RGBA5551). Each material stores its combiner recipe as JSON
  in the glTF extras (`ps2_combiner`), with a second UV set in raw texel units
  and the raw textures in `stages/textures/<arena>/`.
- Arenas: many surfaces combine two textures at different scales (e.g. a
  Poké Ball logo drawn once × a repeating sand grain). Both are sampled with
  their own scale/wrap and baked into one image. Surfaces the game paints
  over an earlier surface in the same plane (rings, lines, shadows) are
  lifted by ~0.05% of the arena size so they don't z-fight in Blender.
- Colours a callback leaves out come from its controller's colour track
  (glowing lures, water, effect particles). Animated tracks (pulses) are
  exported at their brightest key.

Format research comes from
[gen1recomp-mod-stadium2-importer](https://github.com/Deftones565/gen1recomp-mod-stadium2-importer),
[pret/pokestadiumgs](https://github.com/pret/pokestadiumgs),
[pret/pokestadium](https://github.com/pret/pokestadium) (old ROM map) and
[PokemonStadium2Unity](https://github.com/Manurocker95/PokemonStadium2Unity).
HarbourMasters' Torch has no Stadium support, so the tools here don't use it.

## Known gaps

- **Audio:** the sequences and samples are extracted, but songs aren't
  rendered to audio files (the browser minigames play them with a port of
  the game's sequence player). The voices (announcer, 1,387 samples in banks
  4–6) use a codec that isn't decoded.
- Battle-effect choreography (particle timing and motion) isn't reproduced; see above.
- Other runtime effects: Gastly's gas, Grimer/Muk's scrolling slime, Ponyta/Rapidash's
  flickering mane (static). Fire tails (Charmander line, Magmar, Moltres) are
  crossed quads rather than camera-facing billboards.
- Environment-mapped (metal) surfaces use an approximate sphere mapping.
- Without the add-on, arenas are a still frame. With it, scrolling textures, colour
  tracks and flipbooks animate. Scroll speed assumes 1/4 texel per game frame,
  and colour tracks interpolate linearly.
- Pokémon, objects and effects still use baked materials. Their pulsing glows
  (e.g. Chinchou's lures) are exported at their brightest key.
- The fonts (`0x437AD0`), UI layouts (`0x1E40000`) and a few small data tables
  are not converted.
