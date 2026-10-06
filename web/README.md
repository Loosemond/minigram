# Minigames in the browser

Remakes of the Stadium 2 minigames in three.js, made from the extracted models,
pictures and sound, in one app ([minigames/](minigames/)) that runs in any
browser and as a Telegram Mini App. The title screen and the online lobby
have a game picker; a game's code and files load the first time it's picked.

| Minigame | Code | Its rules |
|---|---|---|
| Egg Emergency | [minigames/src/egg/](minigames/src/egg/) | made for the remake, from the game's text and Chansey's clips |
| Clear Cut Challenge | [minigames/src/clearcut/](minigames/src/clearcut/) | the game's own, read from its code ([docs/minigames.md](../docs/minigames.md#clear-cut-challenge)) |
| Eager Eevee | [minigames/src/eevee/](minigames/src/eevee/) | the game's own, read from its code ([docs/minigames.md](../docs/minigames.md#eager-eevee)) |
| Streaming Stampede | [minigames/src/stampede/](minigames/src/stampede/) | the game's own, read from its code ([docs/minigames.md](../docs/minigames.md#streaming-stampede)) |
| Pichu's Power Plant | [minigames/src/pichu/](minigames/src/pichu/) | the game's own, read from its code ([docs/minigames.md](../docs/minigames.md#pichus-power-plant)) |
| Tumbling Togepi | [minigames/src/togepi/](minigames/src/togepi/) | the game's own, read from its code ([docs/minigames.md](../docs/minigames.md#tumbling-togepi)) |

## Run it

```sh
python3 tools/ps2extract.py rom/ps2_eu.z64 all   # once: the models and images
python3 tools/web_assets.py                      # copy what the minigames use into web/minigames/assets/, and make their sound from the ROM
python3 tools/serve_web.py                       # http://localhost:8123/ (?game=clearcut opens on that game)
```

There is no build step. three.js (0.170.0) comes from jsDelivr through an import map
in `index.html`. `assets/` isn't in git, like `out/`: `assets/ui/` has the HUD
pictures the games share, `assets/<game>/` each game's own. `serve_web.py`
exists because Python's built-in server can send `.js` with the wrong MIME type
on Windows, and browsers then refuse to load the modules; it also keeps
connections open, since a game loads dozens of small files, and gzips scripts,
pages, models and the sound files: a first visit to Egg Emergency downloads
284 KB instead of 742 (the Chansey model goes from 446 KB to 96), one to Clear
Cut Challenge about 180 KB (Scyther: 224 KB, 89 gzipped), one to Eager Eevee
about 260 KB. It also runs the
online rooms (`tools/rooms.py`) at `/ws`, and sends `/` and the old
`/egg-emergency/` address to the app. Both are standard library only.

Add `?debug` to the URL to get `window.mg` in the console: `mg.game` (the
game's round), `mg.mini` (the game's module), `mg.paused = true`, `mg.tick(dt)`
(one frame by hand, for a hidden page), `mg.lean(-1 | 0 | 1)`, `mg.cut()`,
`mg.mini.debug.dash()` and `.feint()` (Eager Eevee), `mg.mini.debug.count()` (Streaming Stampede),
`mg.mini.debug.press(dir, "a" | "b")` (Pichu's Power Plant: dir 1 up, 2 down, 3 right, 4 left),
`mg.mini.debug.stick(x, y)` (Tumbling Togepi: -60-60 each, x right, y up; `mg.mini.debug.lanes` the four lanes),
`mg.show("clearcut")`, `mg.title()`, `mg.net()`, `mg.room()`,
`mg.sound.engine` (the audio engine, once it's loaded). It works on localhost
only, unless `debug` is true in `src/config.js`. `clips.html` plays every clip
of a model side by side (`?model=assets/clearcut/scyther.glb`; `?t=0.3`
freezes them at a time). `party.html` runs several online players in one tab,
and `tests.html` runs the regression tests ([below](#online-play)).

**The shell** (`src/main.js`) has the title with the game picker, the rounds
(the countdown, GO, the finish and the results), the online rooms and their
lobby, the players' cards and the renderer. A game is a module
(`src/<game>/index.js`, listed in `src/games.js` with its name, banner,
instructions and colour) with its own scene, cameras, controls, bits of HUD,
sounds (`assets/<game>/sound.bin`) and online messages; the shell gives it the
taps and keys while a round is on, and passes on its messages.

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
  water, with whatever of the bays next to it fits at the edges (your
  neighbours and their eggs, as on the game's one screen; how much depends on
  the screen's shape, the zoom stays on your bay), and the other three
  players get small boxes along the top, apart
  from each other and outlined in their colour. Each box is framed on exactly its own
  bay, pole to pole, from the bridge up to where the eggs are about to land,
  and draws only its own player (the players' objects are on separate
  three.js layers).

**The stage.** In the game it's a pre-rendered picture (background 19).
`src/egg/stage.js` rebuilds it in 3D to that picture's measurements: four
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

**Sound.** The music and sound effects are the game's own, played the way
the N64 plays them. There are no recordings in the ROM: a song is a sequence,
a MIDI-like script of a few KB, whose notes play instruments made of short
VADPCM samples, and the console mixes them as it goes. So the remake ships
the same things, the sequences and just the samples they use, as they are in
the ROM (`assets/egg/sound.bin`, made by `web_assets.py`), and
`src/n64audio.js` plays them: a port of the sequence player of the game's
audio engine (Nintendo EAD's, from *Ocarina of Time* and *Majora's Mask*;
the zeldaret decomps document it), with Web Audio doing the mixing. It runs
the scripts 180 times a second like the console, and turns notes,
envelopes, vibrato and pans into Web Audio events a little ahead. What plays
([docs/audio.md](../docs/audio.md) has how each was found):

- Egg Emergency's song (song 45, a 23.6 s loop) from GO! until the finish,
  when it fades out with the finish whistle as in the game.
- The effects the minigame's code plays, with the game's volumes, reverbs
  and pans (yours to your column): a catch, a Voltorb's shock and the eggs
  it knocks out, a drop falling in the water, the countdown, GO! and the
  whistle; and a menu sound for the buttons.
- The fanfare the minigame results play (song 55), when you win.

Egg Emergency's file is 372 KB (322 KB gzipped): the song's samples are 138 KB, the
fanfare's another 97, the effects' 159, and the scripts 10 KB. It's fetched
after the first tap with the sound on, so with the sound off it's never
downloaded; until it's in, simple Web Audio tones stand in. For comparison,
the same half minute of sound recorded would be about as big (Opus at 64
kbit/s: ~280 KB).

What comes from the ROM and what is made up
([docs/minigames.md](../docs/minigames.md#what-else-module-56-loads) has how
each asset was found):

| From the game | Made for the remake |
|---|---|
| Chansey (object 144) with its clips and face textures, the egg (145) | fall speeds, drop patterns and the CPU players (module #56's code isn't read yet) |
| the stage's layout, sizes and colours (background picture 19), the window paintings' Pokémon, Voltorb's 6-frame sprite (bank 227) | the 3D stage itself and its textures, the bays beyond the players', the far bank |
| the three-column lean-and-catch, read from Chansey's clips | where the HUD sits |
| the rules: L/R, Voltorb costs 5 eggs and a stun, 100 eggs (text 50.11) | the reverb (the game's settings aren't known) |
| HUD: player badges (434), "EGGS" and digits (404), "+1" / "−5" (429), countdown 3-2-1-GO! (360), the name banner (403), "The Champion!" (358) | "FINISH!", the menus |
| effects: the splash (152), explosion textures (object 185) | how the effects move |
| the song, the fanfare and the sound effects (sequences 84, 94 and 9; fonts 49, 54 and 12's samples) | when the song starts (at GO!), and that the fanfare plays only for the winner |

Colours follow [docs/colours.md](../docs/colours.md): the textures are used
without sRGB conversion, lighting is Lambert (ambient + one sun, no specular)
on the display values, and the frame is written as it is. That is close to how
the N64 shades.

Code: `src/egg/game.js` has the rules, drop schedules, CPU players and
Chansey's clip map, `src/egg/assets.js` loads the models and pictures,
`src/egg/fx.js` has the effects, and `src/egg/index.js` the cameras, the lean
controls and its HUD. Shared: `src/audio.js` the sounds (`src/n64audio.js` the
engine that plays them), `src/telegram.js` the Telegram glue, `src/net.js` the
connection to the rooms server, `src/retry.js` tries failed loads again,
`src/config.js` the online settings.

## Clear Cut Challenge

Four Scyther stand in front of a castle's curtain. Spinarak hauls a log up on
its thread and drops it; tap the screen (or Space) to swing, and the blade
cuts the log where it is. The white line on the log marks the perfect cut.
Five logs; after a miss you can swing again 45 frames later, unless you
swung too early and the log reached the blade first. The highest total wins. This one follows the
game's own code (module #53, read from the ROM:
[docs/minigames.md](../docs/minigames.md#clear-cut-challenge) has where each
number is):

- **The fall.** A log's bottom is at `285 − 4.9 (r f)²` f frames after the
  drop (the game runs its logic 30 times a second), with r 0.35 on Easy, 0.4
  on Normal (and with no CPUs), 0.45 on Hard. The blade cuts 2 frames after
  you press, at height 90, and only if the log is there: on Normal, from frame
  16 to 27 after the drop, 0.4 s.
- **The score** is how many frames early or late you pressed, against the
  frame the line is dealt for: on it 20, early by 1-5 frames 10, 5, 4, 3, 2,
  more 1; late (the cut above the line) −1 to −5 instead of the points; a
  miss, or no swing, −10. A total never goes below 0. Pressing while the log
  hangs is a miss.
- **The logs.** Each round deals every log a target frame, somewhere in the
  window (where depends on the level), and a wait before the drop: the first
  log always waits 100 frames, the others 0, 40, 70 and 150 in a shuffled
  order. The game's two random number generators do it, seeded from the round.
- **The CPUs** are the game's: for each log they pick the frame they'll press
  on, on the target or a few frames off (early more often than late), by
  level, and once a CPU is over its level's cap (20 Easy, 40 Normal, 55 Hard)
  it cuts late on purpose, so it doesn't run away with the round; on the last
  log it avoids ending on 0. What it takes to win a solo round, simulated: the
  best of the three CPUs scores about 20 on Easy, 41 on Normal, 59 on Hard, of
  a possible 100.
- **A log's round**, as the game plays it: Spinarak goes down its thread and
  hauls the log up from below, it bounces at the top, and the "1st CUT" …
  "FINAL CUT" sign comes down on a thread; after the wait the log drops;
  Scyther gets ready as it comes up, swings, and misses or cuts; then the log's
  two pieces come up on a signpost in front of each Scyther, the points come
  down onto the cards and count up one at a time, and the pieces fall away.

The camera is the game's (45°, from 760 in front at height 110, straight on),
with background picture 15 behind; wider screens see the picture carry on
mirrored at the sides. Portrait shows your lane big (with the lanes next to
it at its edges) and the others in small boxes, like Egg Emergency.

**The log** isn't one of the objects: the game draws it from its own code
module, a hexagonal prism with three textures (bark, the rings on its ends and
the white line). `tools/ps2tool/minigames.py` takes the textures out;
`src/clearcut/assets.js` builds the prism from the module's numbers, so a cut
can split it anywhere, with the bark wrapping as the module's tiles have it.

**Sound**: the game's (`assets/clearcut/sound.bin`, 706 KB, 627 gzipped,
fetched only with the sound on): song 18 while each log is hauled up, song 19
when the pieces are shown, the crowd (by the sound of it: while a log hangs,
as each comes up and for the best cut), the cut, a perfect cut, a swing
that misses, Scyther getting ready, the points in, the minigame's own
countdown and GO, the shared finish whistle, and the fanfare when you win.
The crowd's samples are 238 KB of it and the fanfare 131.

What comes from the ROM and what is made up:

| From the game | Made for the remake |
|---|---|
| the rules, the timings, the scoring, the deal and the CPUs (module #53's code) | the timeline between logs, fixed (the game's varies a little, e.g. it waits for every Scyther to be ready before a drop) so every device agrees |
| Scyther (object 122), its clips and what follows each, the signpost (59), the log (the module's own), Spinarak (image bank 397) and its thread, the stars over the losers (190) | the streak of light at the cut (the game shows objects 130 and 131, whose colours its code sets as it draws them), a perfect cut's flash (bank 398) |
| the camera, background picture 15, the lanes, the heights, the sign (bank 399), the cards and digits (434, 404, 429) | how the cut pieces tumble (close to the game's), the portrait layout |
| songs 18 and 19, the fanfare, the effects (bank 1 of the effect table) | the crowd while a log hangs is started once and stopped 50 frames after the drop (the game asks for it every frame until then), and the crowd stops at the finish (the game's carries on until it leaves the minigame) |

Not in the remake: the game lets a player whose Game Boy Game Pak has a Pinsir
or a Scizor play as that Pokémon (objects 55 and 179), and it has debug
settings for other game types (logs that change length, and more).

Code: `src/clearcut/rules.js` has the rules (and `tools/clearcut_rules.py`,
the server's copy, the deal and the judging), `src/clearcut/game.js` the round
and its scene, `src/clearcut/assets.js` the models, the log and Spinarak,
`src/clearcut/index.js` the cameras, the tap, its HUD and its online messages.

## Eager Eevee

Four Eevee walk round a ring of coloured stripes; in the middle Aipom hangs
on its rope over a basket. When Aipom lifts the basket, tap (or Space) to
dash to what's under it; the **Feint** pad (or B) fakes a dash. Five races:
a melon is 1000 points, grapes 500, a pile of strawberries 100 each for
everyone there while they last, and a Pineco blows up whoever gets to it.
The last race is three piles of strawberries. The highest total wins. This
one follows the game's own code too (module #61:
[docs/minigames.md](../docs/minigames.md#eager-eevee) has where each number
is):

- **The race.** The basket comes up at a random moment, 2-7 s into the race
  (1-2 s, now and then, on Normal and Hard), and before that Aipom may fake
  it, lifting the basket a little and dropping it again. A dash goes in at
  once and gets there 4 frames (0.13 s) later; the first there gets the prize,
  and a tie gives it to both. Dash before the basket's up and Eevee runs into
  it and bounces back: A works again 2.9 s later, after it's walked on to its
  place on the ring. A feint costs 0.37 s. A Pineco costs no points, but the
  Eevee it blows up waits outside the ring till its place comes round again,
  about 13 s: it usually misses the next race.
- **The reaction time** of each dash shows by the player's card, as the
  game's ". sec." box has it: from the moment the basket's up.
- **The CPUs** are the game's: each round they plan their reaction times and
  whether they fall for Aipom's fakes (dashing into the basket, or feinting),
  and they can be fooled into a dash by someone else's feint soon after a
  fake. Simulated, they dash about 0.83 s after the basket starts up on Easy,
  0.67 s on Normal and 0.57 s on Hard, and run into the basket
  after a fake 24%, 22% and 10% of the time. A quick player (0.23 s) wins
  most games on Hard.

The camera is the game's (40°, from (0, 299, 339) looking down at the middle).
Background picture 44 is that camera's view of the field; here the field is
built in 3D from it (`src/eevee/field.js`), as Egg Emergency's stage is: the
ring's bands and its 30 stripes, measured from the picture's pixels put back
on the ground through that camera, the dirt, the grass and its flowers, and
the trees, whose five trunks at the back are the picture's. The game draws
the Eevee over its picture, and here they're drawn over the field the same
way (the leaves hang low, and a blown-away Eevee waits under them). Portrait
looks from the game's angle, further back, with the ring across the screen
(from more above, the Eevee looked squashed), so the forest goes on round the
front of the clearing and Aipom's rope goes on up out of sight (in the game it
ends just above the screen). A small arrow in your colour marks
your Eevee (the game's four look the same).

**Sound**: the game's (`assets/eevee/sound.bin`, 350 KB): song 54 as Aipom
calls each round (song 101, the same 40 beats a minute faster, for the final
one), song 53 (a held roll) after each prize, the effects of bank 10 (the
dash, the basket, running into it, the prize, bouncing back, a Pineco, a
blown-away Eevee coming down), the eating, the shared count, GO and finish
whistle, and the fanfare when you win. As in the game, the basket's sound is
for the real lift only (frame 5), when the song stops; for a fake the music
and the effects hush, from 5 frames before it till the basket's back down.

What comes from the ROM and what is made up:

| From the game | Made for the remake |
|---|---|
| the rules, the timings, the scoring, the rounds' scripts, the presses and the CPUs (module #61's code) | each round's length, fixed (the race goes on 150 frames after the basket's up; the game's ends once every Eevee's back), so every device agrees; after a Pineco round the next basket always waits 70-120 frames (the game does when an Eevee's still away) |
| Eevee (object 143) and which clip it plays for what, Aipom and its basket (150), the fruit (209, 213, 216), Pineco (151); the fruit going as an Eevee gets in, a copy of it popping up | the effects (the game's are objects 203, 204 and 207, drawn by its code, and image bank 307; these use bank 307), a strawberry flying off a pile isn't shown, the piles shrink instead, and a sparkle as they're got |
| the camera, the field (background picture 44: its ring, ground and trees, measured), the Eevee's places, the prize slots (bank 389), "ROUND 1" … (392), the ". sec." box (393, 394) | the field in 3D (the forest round the front of the clearing, which the game's camera never sees, is made up), the rope's top, the portrait camera, the arrow over your Eevee, the Dash and Feint pads |
| songs 53, 54 and 101, the effects (bank 10 of the effect table) | |

Code: `src/eevee/rules.js` has the rules (and `tools/eevee_rules.py`, the
server's copy: the rounds' scripts, the presses and the judging),
`src/eevee/game.js` the round and its scene, `src/eevee/field.js` the field,
`src/eevee/assets.js` the models, `src/eevee/fx.js` the effects and
`src/eevee/index.js` the camera, the taps, its HUD and its online messages.

## Streaming Stampede

Four players stand in their booths at the back of a TV studio, under a
circus backdrop, and Pokémon go by on the floor in front of them. Before each
question a board says what to count; tap (or the **Count** pad, Space) once
for each one that goes by. Your count isn't shown till the answer, when every
booth's screen shows its count in gold and the board gives the right one.
Exact is 10 points on the 1st and 2nd questions, 20 on the 3rd and 4th and 40
on the last; one or two off still score (5, 1; 10, 5; 20, 10). Five
questions, 100 points at most; the highest total wins, and the winners'
booths go up to the top. This one follows the game's own code too (module
#59: [docs/minigames.md](../docs/minigames.md#streaming-stampede) has where
each number is):

- **The questions.** The first two are one kind (Pikachu, Pichu, Psyduck,
  Slugma, Magcargo, Omanyte, Togepi, Magnemite, and on the 2nd also Diglett,
  Dugtrio, Voltorb, Electrode, Doduo, Dodrio, Magneton); the 3rd and 4th mix
  look-alikes (Voltorb, Electrode and Poké Balls; Togepi and Togepi eggs;
  Doduo and Dodrio…) or, more often on Easy, kinds that aren't alike, and ask
  for one of them, two or three; the last is a mix of everything, and you
  count them all. Diglett and Dugtrio don't walk past: they pop up out of the
  ground. A family of look-alikes comes up once a game, some only on Normal
  or Hard.
- **Harder as it goes.** If enough players are perfect after a question, the
  next ones have two more Pokémon (and with four people all perfect, the
  level goes up), as the game does: so a question is made only when it comes
  up, from the totals so far (on every device the same, and on the server).
- **The CPUs** are the game's: each question they get the right answer, or
  one to three off (on Normal, right 80% of the time on the first two
  questions, 40% on the 3rd and 4th, 20% on the last), and press as the
  Pokémon leave the screen, catching up after the last one; with a big
  answer they can run out of time. The best of three makes about 58 points
  of 100 on Easy, 60 on Normal and 71 on Hard.

The camera is the game's (preset 1 of three: 24°, from (0, 186, 1015)
looking down at the stage), and the last answer eases to its results view,
where the booths go up a little a point to show the totals. Portrait looks
down more, so the stream fills the middle of the screen, and sees as far
across at the back as the game's screen (the Pokémon go at its edge there, so
none goes before it's out of sight); the board goes below the stream.

**Sound**: the game's (`assets/stampede/sound.bin`, 640 KB): song 29 over
the countdown (the game's opening), song 30 from the first question, 31 for
the results and 32 before the last answer; the effects of bank 3 (a count,
the cards, "Stop!", the answer, right, no one, the points, a booth going up)
and the crowd of bank 1.

What comes from the ROM and what is made up:

| From the game | Made for the remake |
|---|---|
| the questions, the streams (every Pokémon's kind, place, speed and timing), the counting, the scoring, how it gets harder, the CPUs' answers and presses (module #59's code) | each answer's points are given 90 frames into it whatever happens online (the server's word, by then), and the game's opening camera move isn't played (song 29 plays over the countdown instead) |
| the studio (objects 116, 117, 118), the booths (80, 100-102) and their lamps, Cleffa and Igglybuff (114, 119) and their clips and faces, the sprites (image banks 201-220) with their shadows, the camera's presets | Cleffa in 1P and 3P and Igglybuff in 2P and 4P (the game's comes from the Game Pak), the portrait camera, more of the studio's floor and a dark wall past its edges, the title's art (the circus backdrop drawn flat), the backdrop's textures at up to 4 times their size (below) |
| the board's words and pictures (banks 412-416, the icons, layouts 125-133), the booths' digits (bank 415, gold at the answer), "Let's count …" and "Stop!" and their timing | how the board comes and goes (the layouts' own animation isn't read), its panel (drawn here), the answer's smaller panel, the counts over the booths in portrait, the Count pad |
| songs 29-32, the effects of bank 3 and the crowd (bank 1) | |

**Textures.** All are the game's. The circus backdrop's are resampled bigger
when the assets are made (`tools/ps2tool/upscale.py`): xBR at 2x (the
edge-directed filter emulators use for textures: stepped colour edges come out
smooth, the rest as it is), then bicubic, up to 4 times and 128 texels a side,
with each texture's own wrap at its edges so the tiles still meet; and
mipmaps. Its painted rings are where the original's texels show as stair steps
up close on a phone; the floor, stage, books and booths looked the same
upscaled, for several times the memory, so they're left as they are. The
backdrop's costs about 90 KB more to download and 0.75 MB of GPU memory.
The floor, the stage and the books repeat as the game's do (the tile's area,
`G_SETTILESIZE`: [docs/fragments.md](../docs/fragments.md)).

Code: `src/stampede/rules.js` has the rules (and `tools/stampede_rules.py`, the
server's copy: the questions, the CPUs and the scoring), `src/stampede/game.js`
the game and its scene, `src/stampede/assets.js` the models and pictures and
`src/stampede/index.js` the camera, the taps, its HUD and its online messages.

## Pichu's Power Plant

Four Pichus charge up in the four rooms of a power plant, each with four
Electrode lamps pointing in at it from the ceiling, the floor and the walls.
When an Electrode pops out, tap it in your room: on its left side for **B**
if its lamp is green, on its right side for **A** if it's blue (as on the sign
in the middle, which lights up with the colours that are out). Each right tap
charges your Pichu one; the wrong button, or a tap at an Electrode that's gone
dead, shocks it for 9 frames. With a keyboard, hold the arrow keys towards it
and press X for A, Z for B, as on the N64's D-pad and buttons. The first to 80
wins: the others are zapped. This one follows the game's own code too (module #54:
[docs/minigames.md](../docs/minigames.md#pichus-power-plant) has where each
number is):

- **The Electrodes.** One pops out a cycle (every 1.6-1.8 s on Normal and
  Hard, 2.3-2.4 s on Easy), each direction once in every four, and stays live
  through the next cycle, so for about a second two are out; blue and green
  come about as often, with runs kept short. Everyone has the same ones.
- **The CPUs** are the game's: they tap the current Electrode every few frames
  (4 apart on average on Hard, 5 on Normal, 7 on Easy, each with a mood of its
  own and the round a speed), never with the wrong button, and near a cycle's
  end go for the next one, or now and then a random direction, which can shock
  them. The first of three is full after about 18 s on Easy, 13 on Normal and
  10.5 on Hard; tapping right ten times a second beats them.

With a mouse, the screen is the game's one screen (the frame of four rooms,
its camera, which glides in from the side during the countdown), as big as
fits, and a click in your room works as a tap. On a phone each room has a
view of its own: yours big (in portrait under the other three and low, where
the thumbs are; in landscape beside them), what's round it dimmed, and the
other three small. A tap anywhere in it counts: your room is in four parts,
by which lamp is nearest (above Pichu, below it, left or right), and a tap
left of that lamp is B, right of it A; the B and A buttons show either side
of each lamp through the countdown and the first seconds, and a ring of the
button's colour where you tap. Taps work with as many fingers as it takes.
The cards sit where the game's badges do, with each player's charge; the
gauges are the game's.

**Sound**: the game's (`assets/pichu/sound.bin`, 310 KB): song 21 from GO,
and bank 2's effects: its own count and GO, an Electrode popping out, a turn
(a sound for each player), a shock, the hum while your Pichu charges, the
losers' zap, the jingle after the finish and the winner's cry.

What comes from the ROM and what is made up:

| From the game | Made for the remake |
|---|---|
| the Electrodes' pattern, the presses, hits, misses and shocks, the CPUs, the finish (module #54's code) | the pattern and the CPUs draw from random numbers of their own (in the game the sparks' flicker takes from the same ones), so every device and the server have the same; the round ends 50 frames after the finish |
| the frame (object 56) and its B/A sign, the Electrode lamps (57) and their faces, Pichu (107) and its clips and faces, the dizzy stars (190), the sparks and the lightning (banks 224, 225, coloured as the game draws them), the gauges (banks 409, 410), the camera and its glide | Pichu in every seat (the game's Pikachu comes from a Game Pak), the sparks shown a few frames after each hit, the lightning drawn brighter (it's thin and faint at its size), the stars' place, the portrait screen, the title's art (the frame drawn flat), the badges' intro (not played), the taps (a room's four parts, B left and A right), a view a room on phones |
| song 21, the effects of bank 2 | |

Code: `src/pichu/rules.js` has the rules (and `tools/pichu_rules.py`, the
server's copy: the Electrodes, the presses, the CPUs and the finish),
`src/pichu/game.js` the game and its scene, `src/pichu/assets.js` the models
and pictures and `src/pichu/index.js` the camera, the controls, its HUD and
its online messages.

## Tumbling Togepi

Four Togepi race down four treadmills side by side. Each belt scrolls the
same course towards its Togepi, which faces you: hold down to run (the belt
moves), steer left and right round what comes. Flowers slow you while you're
in them; a rock, or a Diglett that's up, knocks you over; a log trips you (you
tumble on along the belt, but slower than running). A blue arrow starts a
dash: faster, hopping along, over most things; a log, or a Diglett coming
up, bounces you and takes some of the speed off; another arrow speeds it up
more. The first to the goal wins. It follows the game's own code (module #55:
[docs/minigames.md](../docs/minigames.md#tumbling-togepi) has where each
number is):

- **The course**: five sections, each one of the game's 20 patterns of four
  rows (later sections pick from harder ones), sometimes mirrored; everyone
  has the same. The belt shows the game's track picture (image bank 226: START,
  the 10-90 marks, GOAL) moving under the Togepi as it runs.
- **Running**: speed by how far the stick is down (the D-pad and the keys are
  full), and across by how far it's to the side. A dash adds speed for about
  5.6% of the course, more with each arrow on the way.
- **The CPUs** are the game's: they look ahead (further the harder they are),
  pick a side of each obstacle (more often the better one when they're harder),
  run round it, and now and then go for an arrow while dashing. On Normal the
  first of three gets there in about 27 s; running straight through takes
  about 36 s.

With a mouse, the screen is the game's one screen (its camera comes round from
the side during the countdown, over the scenery the game shows then), as big
as fits; hold ↓ to run and ← → to steer (or hold the mouse button on your
belt: as a finger). On a phone your belt has the big view (under the other
three in portrait, beside them in landscape): hold anywhere on it to run, and
your Togepi heads for your finger. The cards sit below each belt's near end,
with how far each has got; a rank coin floats over each Togepi, and on each
belt the others' badges show where they are along the track, as in the game.
The end: the camera comes down to the winner, who cheers, and goes round.

**Sound**: the game's (`assets/togepi/sound.bin`, 343 KB): song 46 from GO,
bank 9's effects (footsteps, in the flowers too, a knock, a bounce, the dash,
the winner's cry), bank 5's count and GO (again as each one reaches the goal)
and Clear Cut Challenge's crowd for the first in.

What comes from the ROM and what is made up:

| From the game | Made for the remake |
|---|---|
| the course (its 20 patterns, how they're picked and mirrored), the running, the obstacles and what each does, the dashes, the Diglett's timing, the CPUs, the finish, the progress (module #55's code) | each lane draws from random numbers of its own, the CPUs rank among themselves, and a Togepi stays where it is on its belt (in the game it moves up or down by its rank, and the CPUs look at the ranks): so a lane depends on nothing but its own player, and every device and the server can run it; the race is called 30 s after the first one's in (the game waits for all four) |
| Togepi (109) and its clips, the platform (60), the flowers, rocks, logs and arrows (62-67, 202), the dash's aura (188), the scenery (132-140), the track (bank 226), the Diglett (205), the rank coins (387), the shadows (307), the badges (434), the camera, its glide in and its end | Togepi in every seat (the game's Omanyte comes from a Game Pak), the aura drawn as a glow, the rank coins half the size, the touch steering, a view a belt on phones, the title's art (the track, side by side) |
| song 46, the effects of banks 9, 5 and 1 | |

Code: `src/togepi/rules.js` has the rules (and `tools/togepi_rules.py`, the
server's copy: the course, the lanes, the CPUs and the end),
`src/togepi/game.js` the game and its scene, `src/togepi/assets.js` the
models and pictures and `src/togepi/index.js` the cameras, the controls, its
HUD and its online messages.

## Online play

**Play with friends** on the title screen makes a room with a four-letter
code, on the game picked there. **Invite friends** sends a link: in Telegram it opens the share picker
(with `telegramApp` set in `src/config.js`, the link opens the game straight
in Telegram, `t.me/<bot>?startapp=CODE`; without it, it's this page with
`?room=CODE`); in a browser it uses the system share sheet or copies the link,
always this page's (so friends without Telegram can come too).
The link is also shown under the button, with a Copy button.
The code can also be typed into the lobby. Up to four people join; the empty
spots are CPUs. Everyone gets the next free seat and its colour (1P blue, 2P
green, 3P red, 4P yellow). The host (whoever has been in the room longest)
picks the game and the CPU level, and starts; everyone's lobby switches with
it (loading the game if they haven't yet). On a phone your own bay is the big view,
whichever seat you have, and names show over the cards.

How it works:

- **Each device plays its own player**, with no network delay; the host's
  device also plays the CPUs. In Egg Emergency (Clear Cut Challenge below): Devices send their players' leans (which
  column, from which moment of the round), and the server passes them on
  and **keeps the score itself** from them (`tools/egg_rules.py`): a drop
  counts if the player leans its way when it reaches the hands, and isn't
  still stunned from a shock. The game judges its own players the same way
  from the same leans (`Game.takes()`), so it shows a catch at once and the
  server agrees. Devices also report their catches and shocks as they
  happen, so the others see them straight away; the server checks each one
  and passes on its own verdict, with the egg count.
- **Clear Cut Challenge**: devices send each cut, the frame their player
  pressed on after the log's drop, and the server judges it
  (`tools/clearcut_rules.py`, the same deal and judging as
  `src/clearcut/rules.js`, bit for bit) and tells everyone the points and the
  total. As in the game, a cut is a log's last swing, and after a miss a seat
  may swing again 45 frames on, unless it swung before the log got to the
  blade and the log got there first; the server holds a miss that may be
  followed up (it tells everyone with `a: 1`) till the log's judged. Swings
  count from the log's hanging to its end (with 2 s for clocks off), and a
  seat that doesn't cut scores the miss.
- **Streaming Stampede**: devices send each press, with the question and
  the frame of its counting it was on; the server passes them on, checks
  each could have happened then (in the counting, not in the future, not
  older than the way here allows, one a frame, 99 at most), counts the CPUs'
  itself (from the seed, as every device does), and gives each answer's
  counts and points (`ans`) once no press still on its way could change them:
  the devices show its word at the answer, and make the next question from
  its totals.
- **Pichu's Power Plant**: devices send each press (the frame, the direction
  and the button) and the server checks it as Eager Eevee's (no older than
  the way here allows, not in the future: one outside counts as that old, or
  as now), and by the rules (not while shocked, not too soon after the last,
  not after the finish: `tools/pichu_rules.py`, the same as
  `src/pichu/rules.js`, bit for bit); it passes it on, tells its own device
  if it counts on another frame or not at all (the device works its charge out
  again), plays the CPUs itself from the seed, and says who finished first
  (`won`) once no press still on its way could make someone full sooner.
- **Tumbling Togepi**: devices send their player's stick as it changes (the
  frame, x and y); the server keeps the changes in order (no older than the
  way here allows, not in the future), passes them on, tells the sender's
  device if one counts from another frame, and runs every lane itself
  (`tools/togepi_rules.py`, the same as `src/togepi/rules.js`, bit for bit,
  the CPUs too, from the seed) as far as no change still on its way could
  alter; it says how the race ended (`won`: all four in, or called 30 s after
  the first) once that's decided. A device runs the others' lanes from their
  changes a little behind (as in Egg Emergency), and again from a saved point
  when one comes in late.
- **Eager Eevee**: devices send each dash and feint, with the frame their
  player pressed on, and the server checks it could have happened then (the
  Eevee at its place, not bouncing back or blown away: `tools/eevee_rules.py`,
  the same as `src/eevee/rules.js`, bit for bit) and passes it on. It gives
  each prize itself, once no press still on its way could change who got
  there first: a press may be at most as old as its device's way here (half
  its round trip and 0.1 s, 0.2-0.5 s); an older one counts as that old. So
  the prize's word comes about that long after the winner gets there, while
  the Eevee are still grabbing at it, and a device can't claim a quicker dash
  than its player made by more than that.
- **Same round, same moment.** The server deals the drops (the game's own
  schedule, from a seed; `egg_rules.py` has a copy of `makeSchedules()` that
  matches it bit for bit) and a GO time on its own clock. Clients sync to it
  with ping/pong (the lowest-delay round trip of the last 12) and run the
  round on that clock, catching up in small steps after a hiccup.
- **Egg Emergency shows the other players a little behind**, so their leans
  arrive before they're due: as far behind as their moves take to get here
  and a little more (`src/lag.js`). A round starts from both devices' round
  trips to the server (each ping tells the server the device's, a round trip
  three in four of its last few beat, and `start` passes them on, `rtt`; 0.3
  s if they're not known), and then each seat's delay follows how old its
  leans and catches are when they get here: up quickly to cover a late one
  (the seat's clock runs at 3/4 speed meanwhile), and back down slowly, from
  0.05 s to 0.6 s. Their catches come from the server, not from what this
  device sees; if one is late, the egg falls on and the catch shows when it
  arrives.
- **Eager Eevee shows the others' dashes as they get here**, a little after
  they happened; who gets the prize is the server's word, and an Eevee that's
  got there grabs at it till then (as the game's do, for a second and a half).
- **Clear Cut Challenge shows every lane on the round's clock**, so the four
  logs come up and fall together, as on the game's one screen. The others'
  swings are shown as they get here, a little after they happened: a late
  cut splits the log where the blade met it, which has fallen on a bit by
  then, so it looks a little high, but the pieces go up on the signpost as
  they were cut, and the points are the server's. One that gets here after
  the fall shows only on the signpost; a seat with no swing yet at the end of
  the fall shows the miss till the server's word comes.
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
  the current round; only the host picks the game and the level, and starts.
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
the drops, or the frame to cut on, or count the stream it's dealt), which looks just like a flawless player; a modified host making
the CPUs play badly (it can't make them score, though); and best scores,
which are kept on each device.

**Testing.** `party.html?n=2` (up to 4) opens that many players in one tab,
each in a frame, all in one room (`&room=CODE` picks it, `&game=clearcut` the
game). The first frame is the host. The frames stack on a tall window and sit
side by side on a wide one. `python3 tools/test_rooms.py` tests the server:
the protocol, the games' scoring (Clear Cut Challenge's deal, Eager
Eevee's rounds and Streaming Stampede's questions against the browser's, bit
for bit) and the cheats it stops, picking the game, rejoining,
Telegram logins, names and limits (about half a minute, no network).
`tests.html`, with `serve_web.py` running, tests the games with it, in real
games in frames: each game's deal against the server's copy, the catching
rule (the same short round `test_rooms.py` plays), the cut scoring and
Eager Eevee's dashes, feints and prizes, Streaming Stampede's questions and
scoring, the CPU levels (what it takes to win, simulated; how soon Eager Eevee's
dash; Streaming Stampede's CPUs' totals), headless games of Eager Eevee and
Streaming Stampede, each game's sound (every song
and effect rendered offline: they play, and nothing they need is missing from
the file), a solo round of each, the lobby, the invite link and the game
picker (only the host's counts), and an online round of each with two
scripted players. In Egg Emergency one of them meddles from the console
partway through: he claims an egg he missed, with a made-up count, claims a
catch for the other player and leans for her, claims a drop still to come,
says he's done and tries to start the next round, then reloads mid-round. In
Clear Cut Challenge he claims a perfect cut for the other player, a cut for a
log that isn't up yet, and a second swing at one. In Eager Eevee he dashes
for the other player, and says he dashed on the first frame the basket was
up, after seeing her go. In Streaming Stampede he counts for the other
player and for a CPU. Both devices have to agree
with each other throughout and end with the same ranking, and the server
must never correct an honest device. It takes about three minutes. A hidden
page steps the games itself (browsers pause hidden pages' animation), and a
real-time test that fails while it's hidden says so.

Give the server `TELEGRAM_BOT_TOKEN` (from @BotFather) and `TYPESAFE_API_KEY`
as environment variables to turn on the login and name checks; it says at
start which are on. Neither goes to the pages.

Messages are JSON objects with their type in `t`. From the client:

| `t` | Fields | |
|---|---|---|
| `hello` | `room`, `id`, `name`, `create`, `tg`, `game` | join `room` (none: a new one; `create`: make it if it's missing). The same `id` gets the same seat back. `tg`: Telegram's `initData`. `game`: a new room's game (`egg`, `clearcut`, `eevee`, `stampede`, `pichu`, `togepi`) |
| `ping` | `c`, `rtt` | the client's clock; answered with `pong`. `rtt`: a round trip it can count on, ms (from the last pongs) |
| `name` | `name` | rename |
| `level` | `level` | host, in the lobby: `easy`, `normal` or `hard` |
| `game` | `game` | host, in the lobby: `egg`, `clearcut`, `eevee`, `stampede`, `pichu` or `togepi` |
| `start` | | host, in the lobby |
| `lean` | `r`, `s`, `g`, `l` | in round `r`, seat `s` leans `l` (−1, 0, 1) from round time `g` (s) |
| `ev` | `r`, `s`, `g`, `n`, `k`, `e` | seat `s` caught its drop `n` (`k: "c"`) or was shocked by it (`"h"`), as this device judged it; `e` is its egg count after. The server answers only if it disagrees |
| `cut` | `r`, `s`, `n`, `f` | Clear Cut Challenge: seat `s` pressed `f` frames after log `n`'s drop (negative: while it hung) |
| `dash` | `r`, `s`, `k`, `f` | Eager Eevee: seat `s` pressed A (`k: "a"`, a dash) or B (`"b"`, a feint) on frame `f` from GO |
| `count` | `r`, `s`, `n`, `f` | Streaming Stampede: seat `s` pressed (counted one) on frame `f` of question `n`'s counting |
| `press` | `r`, `s`, `f`, `d`, `b` | Pichu's Power Plant: seat `s` pressed A (`b: 5`) or B (`6`) on frame `f` from GO, held towards `d` (1 up, 2 down, 3 right, 4 left) |
| `stick` | `r`, `s`, `f`, `x`, `y` | Tumbling Togepi: seat `s`'s stick is at `x`, `y` (-60-60 each, right and up) from frame `f` from GO |
| `done` | `r` | this device's round is over |
| `leave` | | |

From the server: `welcome` (`room`, `seat`, `now`); `room`, the room's
state (`state` lobby or playing, `round`, `level`, `game`, `host`, `players`
with `away`, and during a round the `lineup`, with `here` for who's still in
it); `start` (`game`, `round`, `seed`, `level`, `host`, `lineup`, `rtt`, the
round trip of the device playing each seat, ms or null; `at` and
`go` on the server's clock: the countdown starts at `at`, GO is at `go`. Egg
Emergency: `drops`, each
seat's `[t, col, "e" or "v", fall]`; and, to rejoin midway, `scores`, each
seat's last lean `leans` `[g, l]`, last shock `hits` and how many of its
drops are judged, `settled`, in the order they arrive. Clear Cut Challenge:
`c`, the level code the logs are dealt for (the devices deal them from the
seed), and to rejoin, `scores` and `cuts`, each seat's `[f, points]` by log, `[f, points, 1]` for a miss it may still follow up.
Eager Eevee: `ee`, with `level` (the level code the rounds are dealt for) and,
to rejoin, `scores` and `prizes`, each seat's by round. Streaming Stampede:
`ss`, with `told`, the answers so far as `ans` gives them, to rejoin. Pichu's
Power Plant: `pp`, with `done`, the finish as `won` gives it (null till then),
and `presses`, the people's so far, `[f, d, b]` by seat, to rejoin. Tumbling
Togepi: `tg`, with `done`, the end as `won` gives it (null till then), and
`sticks`, the people's stick changes so far, `[f, x, y]` by seat, to rejoin);
`pong` (`c`, `s`); `cut` (`r`, `s`, `n`, `f`, `p`, `e`), the server's word on
a seat's swing at a log: the frame (null: no swing), the points and the
total after, and `a: 1` for a miss that doesn't count yet (the seat may swing
again; the total leaves it out); `dash` as above, passed on to the others
(back to its own device too if it counts on a later frame than it said);
`got` (`r`, `n`, `p`, `e`, `d`), Eager Eevee's prize for round `n`: the
points by seat, the totals after, and the frame it was decided (A stops
working after it); `count` as above, passed on to the others; `ans` (`r`,
`n`, `c`, `p`, `e`), Streaming Stampede's answer to question `n`: each seat's
count, points and total after; `press` as above, passed on to the others, and
to its own device with `o`, the frame it said, if it counts on another one
(`f`), or `x: 1` if it doesn't count; `won` (`r`, `f`, `w`, `e`), Pichu's
Power Plant's finish: its frame, the winners (1 or 0 by seat) and each seat's
charge then; `stick` as above, passed on to the others, and to its own
device with `o`, the frame it said, if it counts from another one; `won`
(`r`, `f`, `fin`, `p`), Tumbling Togepi's end: the frame it ended on, each
seat's finish frame (null: not in) and how far each got (‰);
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
- Header, background and bottom-bar colours matched to the game on show.
- The Telegram **back button** leaves a round.
- **Haptics** on a catch, a Voltorb hit, a cut, a count, GO and FINISH.
- **CloudStorage** keeps the best score per game and level, the last game,
  the level and the sound setting, so they follow the player across devices; localStorage is the
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
   then `/mybots` ▸ the bot ▸ Bot Settings ▸ Configure Mini App, and give it
   the URL (`https://…/minigames/`). That's the bot's main Mini App: its
   profile gets a button that opens the game, and `t.me/<bot>?startapp=CODE`
   opens it in a room. (Or `/newapp`, for a `t.me/<bot>/<app name>` link with
   its own title and picture.) The chat's menu button can open it too: Bot
   Settings ▸ Menu Button, or the Bot API's `setChatMenuButton`.
3. Put that link, `t.me/<bot>` (or `t.me/<bot>/<app name>`), in `telegramApp`
   in `src/config.js`, so invites sent from Telegram open the game there.
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
Clear Cut Challenge: solo rounds at 1280×720 and 375×812, and an online round
with two players (both devices showed the same cuts, totals and ranking, the
CPUs played by the host's). Eager Eevee: solo games at 960×640 and 375×812,
headless games against the CPUs, and an online game with two players (both
devices showed the same prizes and totals). `tools/test_rooms.py` passes its
16 checks and `tests.html` its 22. It hasn't been tried inside the real Telegram apps or
over a mobile network yet.
