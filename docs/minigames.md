# Minigames

Stadium 2 has 12 minigames. Each one is a code module of its own. Their
models are not in a separate archive: they are records of the general objects
table ([objects.md](objects.md)), and a minigame's code loads them by
number. The extractor groups them in the catalog's **Minigames** category
(`MINIGAMES` in `tools/ps2tool/names.py`).

## The 12 minigames

In the game's own order and spelling (text table 57, entries 617–628). The
code modules run in 12 consecutive 1 MB slots, `0x86000000`–`0x86B00000`.

| Minigame | Quiz hint (57.659–670) | Instructions | Module | ROM | VRAM |
|---|---|---|---|---|---|
| Gutsy Golbat | explores a cave | 50.0 | #49 | `0x25A9F0` | `0x86100000` |
| Topsy-Turvy | spins like a top | 50.9 | #47 | `0x2469A0` | `0x86000000` |
| Clear Cut Challenge | uses CUT | 50.8 | #53 | `0x289830` | `0x86500000` |
| Furret's Frolic | bounces a ball | 50.1 | #50 | `0x266DC0` | `0x86200000` |
| Barrier Ball | plays BARRIER BALL | 50.10 | #51 | `0x2761A0` | `0x86300000` |
| Pichu's Power Plant | charges electricity | 50.2 | #54 | `0x299CA0` | `0x86600000` |
| Rampage Rollout | runs a track race | 50.6 | #52 | `0x27E840` | `0x86400000` |
| Streaming Stampede | counts other POKéMON | 50.4 | #59 | `0x2CD730` | `0x86900000` |
| Tumbling Togepi | rolls around | 50.3 | #55 | `0x2A2860` | `0x86700000` |
| Delibird's Delivery | delivers gifts | 50.7 | #60 | `0x2E1400` | `0x86A00000` |
| Egg Emergency | catches eggs | 50.11 | #56 | `0x2B18C0` | `0x86800000` |
| Eager Eevee | dashes toward fruit | 50.5 | #61 | `0x2F32D0` | `0x86B00000` |

- **Instructions** are entries of text table 50, matched by content (e.g.
  50.8: "cut falling logs at the white line"). Entries 50.12 onwards are the
  control labels ("Start game", "Move", "Fly up", "Hit", "Zap", "Feint"…).
- **Quiz hints** are the answers to the quiz question "Which POKéMON … in
  a Mini-Game?" and follow the same order as the names.
- The HUD and title graphics ("GO!", "BLOCKED!", "FACE OFF", "Mini-game
  Champion"…) are in the image banks (`0x1898000`).

## Models per minigame

Object numbers (records of `0x2000000`). "Player" lists the playable
characters' models.

| Minigame | Player | Other objects the code loads |
|---|---|---|
| Gutsy Golbat | Golbat 053 | Jynx 110 (she stands in the meadow at the end and throws hearts) |
| Topsy-Turvy | Hitmontop 115 (one for each player: a Game Pak's shiny one) | through a list (`0x8600D760`, loaded by `0x80071B20`): the shadow 079, the rings round a Hitmontop after its RAPID SPIN 195-198 (in 1P-4P's colours), the sparks of a bump 199 and 200; and 123, 124 (a white Hitmontop), 152 and the whirlwinds 191-194, which nothing in it draws (Hitmontop 052 *by appearance*) |
| Clear Cut Challenge | Scyther 122, Pinsir 055, Scizor 179 | signpost 059, log slices 081 and 111, cut line 112, effects 130 and 131, dizzy stars 190 |
| Furret's Frolic | Furret 142 (both layouts: 1 for the end), Girafarig 223 (for a Game Pak's Girafarig) | Poké Balls 153 (Poké, Great, Ultra, Master), the field 155 (layout 0 the field, 1 the shadows along its edges, 2 the boards on its ramps; named leaf pile / shards / chips by appearance before), bush 183 (the instructions' show) |
| Barrier Ball | Mr. Mime 218 (the play), 129 (the countdown and the end) | the court 120 (7 layouts: its floor, lines and hole, and its four walls), the barrier 141 (named mesh panels by appearance before), 146 (loaded; nothing found draws it), Poké Ball 154 |
| Pichu's Power Plant | Pichu 107, Pikachu 201 | the power plant's frame 056 (a window of four rooms by appearance before), the electrode lamps 057, dizzy stars 190 (wall pieces by appearance before) |
| Rampage Rollout | Donphan 108 (walking; rolling, layout 1) | the track 113 (layout 0 its field: the dirt track round a grass block, in a meadow; layout 1 the wooden fence round it, named Red Frame by appearance) |
| Streaming Stampede | Cleffa 114 (186 shiny), Igglybuff 119 (205 shiny) | the players' booths 080 and 100–102 (named Game Paks by appearance before), ramp 116, circus backdrop 117, books 118; the Pokémon that go by are sprites (image banks 201–220) |
| Tumbling Togepi | Togepi 109, Omanyte 206 | the treadmills' platform 060, flower patch 062, rocks 063–064, logs 065–067, pillars 068–070 (on no course), the scenery round it 132–140, the dash's aura 188, the dash arrow 202 (named an ice block and a water plane by appearance before) |
| Delibird's Delivery | Delibird 127 | Swinub 082 and 103, gift boxes 092 and 096, factory 147 and 148, gifts 169, 170, 174–177, 180, 181, 184 |
| Egg Emergency | Chansey 144 | egg 145, 185 |
| Eager Eevee | Eevee 143 | field 149, Aipom 150, Pineco 151, effects 203, 204, 207, fruit 209, 211, 213, 216 (and 208, 210, 212, 215 *by appearance*) |

Worth knowing:

- Several names came out of this: object 053, first named Zubat, is
  Golbat; "Striped Shell" 082/103 is Swinub; "Green Spiky Head" 151 is
  Pineco; 145 is the egg; and 186, named Hoppip by appearance, is a shiny
  Cleffa (green ears), as 205 is a shiny Igglybuff: Streaming Stampede's code
  loads them for a Game Pak's shiny Cleffa or Igglybuff. 155, named leaf
  pile, shards and chips by appearance, is Furret's Frolic's field.
- The appearance-based guesses before this were partly wrong. The grass/hill
  course pieces 132–140 are Tumbling Togepi's, not Furret's Frolic's. The
  "Lab Room" (189/214) isn't a minigame's. Only two of the twelve gift boxes
  are Delibird's.
- Other Pokémon in the minigames (per Serebii: Magnemite, Spinarak, Electrode,
  Diglett, Voltorb) are not in the objects table. They're 2D sprites in the
  image banks: Egg Emergency's Voltorb (bank 227, below), Clear Cut
  Challenge's Spinarak (397), Gutsy Golbat's Magnemite (69), and the Pokémon
  that go by in Streaming Stampede (201–220). The extractor names the banks whose use is known
  (`BANKS` in `tools/ps2tool/names.py`: `images/banks/bank_NNN_<name>/`).
- Gutsy Golbat loads Jynx for its end: she stands in the meadow outside the
  cave and throws hearts (below).

## Egg Emergency: Chansey's clips

Chansey (object 144) has 16 unnamed clips. What each does was read from its
bone tracks: the body bone (`bone_02`) sits at x = 0, −1.4 or +1.4, and the
held egg (`bone_01`) appears at x = 0, −5 or +5 (5 up, 4 in front) and shrinks
to nothing. So Chansey doesn't walk. It stays on its spot and catches in three
columns, 5 model units apart: the game's "use the L and R Buttons" means hold
L to lean left, hold R to lean right, and let go to come back to the centre.
That explains the six transition clips, including left ↔ right.

| Clip | Length | What it does |
|---|---|---|
| 00 | 0.77 s | waiting, centre |
| 01 | 0.50 s | idle, centre |
| 02, 03 | 0.50 s | idle, leaning left / right |
| 04, 06 | 0.23 s | centre → right / left |
| 05, 07 | 0.23 s | right / left → centre |
| 08, 09 | 0.23 s | left → right / right → left |
| 10, 11, 12 | 0.30 s | catch in the centre / left / right column: an egg in the hands shrinks into the pouch |
| 13 | 0.63 s | hurt: jumps with the pained face (face 3) and a dust cloud; the Voltorb hit |
| 14 | 2.37 s | big jump (celebrating, *by appearance*) |
| 15 | 3.20 s | sits back with face 4 (disappointed, *by appearance*) |

### What else module #56 loads

Listing every call from the module into the main program with constant
arguments (the same method as for the object loader, below) shows the rest of
the minigame:

| Call | Argument | What it is |
|---|---|---|
| `0x8004D770` (show background picture) | 19 | the backdrop: a building on a bridge, with blue, green, red and yellow roofs and one column of windows per player (lamp poles at x = 13, 86, 159, 233, 306 of 320). The Chansey stand on the grass along the top of the bridge (rows 188–193), each under its colour; below the bridge's arches is the water |
| `0x8004CA70` (load image bank) | 227 | **Voltorb**, a 24×24 sprite in 6 frames: in this minigame it isn't a 3D model |
| | 434 | player badges: blank, "COM" in grey / blue / green / red / yellow, "1P"–"4P" (blue, green, red, yellow: the player colours) |
| | 404 | small digits 0–9 and "EGGS": each player's counter |
| | 429 | big digits 0–9, "−" and "+": presumably the "+1" / "−5" that show on a catch and a Voltorb hit (*by appearance*) |
| | 152 | the splash, 12 frames of 32×32: a missed egg falls past the bridge into the water |
| `0x8004DED4` (load object) | 145, 185 | the egg and the effect object |

Object 185 carries three effect textures (a smoke noise, a flame burst and
sparkles). Its own mesh is a four-triangle strip with a 12-frame clip, and
what it's drawn as is *unknown*. The countdown "1", "2", "3", "GO!" is image
bank 360, and the minigame's name banner is bank 403; both are loaded outside
the module. Other sources agree on the rules: a Voltorb costs five eggs and
stuns you long enough to miss the next one.

Only Clear Cut Challenge (15), Egg Emergency (19) and Eager Eevee (44) call
`0x8004D770`, so the others build their scene from objects. The module also
calls `0x80021EC8` once with 45; every minigame calls it with a different
number (Topsy-Turvy 33, Gutsy Golbat 13, …): the song, which the game plays as
sequence 45 + 39 = 84 ([audio.md](audio.md), with the sound effects the
module plays).

The browser remake in `web/minigames/src/egg/` is built on these findings,
with the backdrop rebuilt in 3D to the picture's measurements
([web/README.md](../web/README.md)).

## Clear Cut Challenge

Module #53 (ROM `0x289830`, linked at `0x86500000`; 0xD9A0 bytes of code and
data, then BSS to 0x119D0) was read instruction by instruction, so the remake
(`web/minigames/src/clearcut/`) plays by its rules. Addresses below are the
module's (EU); variables are in its data (`0x8650C4xx`–`0x8650C6xx`) and BSS
(`0x8650D9xx`…). The instructions (text 50.8) agree: "cut falling logs at the
white line. There are five logs in all. Time your cuts--cutting above the
white line will cost you points."

**Frames and speeds.** The logic runs once a frame and counts in frames. It
asks the main program for the TV's rate (`0x80001FC0`: 50 on PAL, 60 on NTSC)
and scales its speeds by 1.2 on PAL (`0x8650C508`), so a PAL console's 25
frames a second play as NTSC's 30. The remake uses 30 (*assumed*: the
scheduler's frame rate wasn't traced, but the 30 fps clips match it).

**The fall** (`0x86501D6C`, `0x86502524`, `0x86503178`). A log's bottom is at
`y = 285 − 4.9 (r f)²` f frames after its drop (`0x8650C4AC` = 285,
the log 389 long, `0x8650C4CC`), with r (`0x8650C4B8`) set per level
(`0x86502620`: 0.45, 0.4, 0.35, 0.3 for the level codes 1-4; code 0, no CPUs,
falls as 2). Pressing A at frame f swings the blade, which meets the log at
frame f + 2: it cuts if the log's bottom is then between `0x8650C4B4` = −307
and `0x8650C498` = 92, i.e. the blade (at 90-92) is somewhere along the log.
The window starts at w0 + 2 (`0x8650D9D4`, from the height difference and r)
and lasts 11-16 frames (`0x8650C4D4`).

**The target** (`0x86501EA0`, `0x86501FA0`). Each log gets a frame T = w0 +
a random offset in the window, by the level code c (`0x8650C634`): c 0 and 2
from 2 to size − 2, c 1 from 1 to size − 2, c 3 from 4 to size − 2, c 4 from 4
to size − 3. The white line is where the log is at the blade 2 frames after T
(`0x8650C4D8` = 90 − y(T + 2)); the log's callback (`0x86500020`) draws the
band there.

**The score** (`0x86503178`). d = T − the frame pressed: points by |d| from
the table at `0x8650D0D4`: 20, 10, 5, 4, 3, 2, then 1 up to 15 frames off. If
d < 0 (late: the cut is above the line) the player gets −|d| (at most −5)
instead of the points; a swing outside the window,
or none by frame 80 (`0x865098F4`), is −10. The points go onto the total one a
frame after the log's show starts (`0x86507F9C`), and a penalty takes them off
one a frame while the total is above 0. A does nothing until the log hangs
ready, and a swing while it hangs is a miss.

**Swinging again** (`0x86503C90`, `0x86503EB8`). A cut is the log's last
swing (A stays off till the next log). A miss takes the player's points to 0
and starts a counter (`0x20` of the player); A works again when it gets to 46,
45 frames on, and the last swing is the one that counts (`0x80`, the result,
is set again). But a miss while the log's still at or above the blade (its
bottom at 92 or more: `0x3c` = 1) stops the counter once the log gets down to
the blade (`0x3c` = 2): A's then off till the next log's show starts
(`0x8650C610`). On Normal the log gets there 16 frames after the drop, so a
swing 30 or more frames before the drop can be followed up, and one after
that can't. That log then hits the scythes held out and is knocked away
(`0x865048D0`): its object (198 above its bottom) goes to 388.4 − 5.88 (s −
6)², s going up 0.6 a frame (till it's below −3000), and each frame it moves
by y/100 outwards and towards the camera, at 60° for the outer lanes and 10°
for the inner ones (in the game's rough radians, 6.14 a turn: sin `0x800740D0`
for x, cos `0x8007EB20` for z). It would also spin if `0x8650C4F0` were 1
(a debug switch, 0 in the game).

**The deal** (`0x86502958`). A permutation of the five log slots (`0x8650D9E0`:
0-4, then ten swaps of two random slots, skipping any swap with slot 0) picks
each log's wait before its drop from `0x8650C480`: 100, 40, 0, 70, 150 frames.
So the first log always waits 100. Random numbers come from the main
program's two generators: `0x800357EC` (x · 1664525 + 1013904223) and
`0x8007B100` ((4x + 2)(4x + 3) / 4, in 32 bits).

**The level.** The COM level byte (`+0x2181` of the minigame's context; the
menu, module #63, writes 1 for Easy, 2 Normal, 3 Hard) gives each CPU's code
c = 4 − level (`0x8650C45C` per player; humans 0), and c also becomes the
round's (`0x8650C634`): so the level sets the logs' speed and targets as well
as how well the CPUs cut. Rooms with no CPU use c 0.

**The CPUs** (`0x86501280`, when each log is set up). For each CPU, with s3 =
(a random number mod 79 + a frame counter) mod 10 and s2 = its mood (random,
0 or 1): c 1 (Hard) presses on T when s3 ≥ s2 + 6, else 1-3 frames off (late
only 15% of the time, then pulled back to 1-2 early); c 2 (Normal) on T for s3
≥ s2 + 8, else 1-4 off (late 20%); c 3 (Easy) never quite on T (one late at
best), 1-4 off; c 4, 1-5 off (late 55%). Then: on the last log, if the cut
would leave it at 0 or less, it moves to the early side; and a CPU whose total
is over its cap (`0x8650C5CC`: 55, 40, 20, 12 for c 1-4) presses 2-7 frames
late on purpose; on Hard and Normal, one about to cut a perfect one within 10
of its cap cuts 1-2 frames early instead.

**A log's round** (`0x8650952C`, `0x865040E4`, `0x86505604`): Spinarak (image
bank 397 on a sprite quad, 2.4×) goes down its thread from 400-500 (under
gravity, 30 frames), and hauls the next log up from below at 18 a frame to
689, then it bounces (`0x8650D13C`) and settles at 674, the log's top when it
hangs; meanwhile a 2D Spinarak comes down the screen with "1st CUT" … "FINAL
CUT" (bank 399). The log waits, drops, and at frame 50 the crowd reacts to the
best cut (0x1C07 for a perfect one, 0x1E09 for any points). At frame 80 the
show starts (`0x8650C610`): a signpost (object 59, 0.6×) rises in front of
each Scyther from −1500 at 20 a frame with the log's pieces stacked on it (or
the whole log: it and the lower piece stand on the lane's line, the upper
piece on top 20 to the left, `0x86505604`), settles (`0x8650D1B4`), the
points drop from the cut to the
score card and count in (71 frames), and the pieces fall away. Song 19 plays
for the show; song 18 starts 30 frames into each log's haul. After the fifth,
the winners play Scyther's clip 5 and the rest clip 6 (`0x86502B88`: a
four-way tie has no winner); from frame 60 of clip 6, stars (object 190,
0.15×, tilted `0x600`) go round 108 above each fallen Scyther, fading in by
5/255 a frame (`0x86509318`).

**Scene** (`0x86505EA8`, `0x865020D8`, the camera callback `0x86505858`): the
camera looks straight ahead from (0, 110, 760), 45° up and down, over
background picture 15. Scyther (object 122, 0.25×, z −35, not turned) stands
at x = −288, −96, 96, 288 (`(i · 120 − 180) · 1.6`), right behind its log:
its head, held forward to z 60 in its ready clip, goes into the log (7.6 to
72.4), and the log's front hides it. The log is the module's own model
(geo layout `0xC760`: a hexagonal prism, radius 125 and 2000 long, scaled 0.3
across and 389/2060 along, z 40), with its pieces (`0xC884`…) and the thread
(`0xCEE0`); its textures are at `0xA5E0` (bark, RGBA16 32×64, wrapping twice
each way), `0xB5E0` (end rings, 32×32) and `0xBDE0` (the line, IA8 32×8); its
lists cull back faces (`G_CULL_BACK`), and its faces go anticlockwise seen
from outside. The cut's effects are objects 130 and 131 (a perfect cut) at
the blade.

**Scyther's clips** (35, 40, 39, 6, 44, 79, 90 and 30 frames; 0 and 1 loop,
flag 1 in their headers, the others play once and hold): 0 waits, 1 holds
ready, 2 gets ready, 3 the cut, 4 a swing that misses, 5 the winners' cheer,
6 the others' fall at the end, 7 lowers its scythes after a log. The module
changes clip when one gets to its last frame (`0x86503938`, by a jump table
at `0x8650D70C`), looking at the log's bottom (`0x86511690`):

| At the end of | Next |
|---|---|
| 0, waiting | 2 (and sound 0x1F0A) if Spinarak is hauling the log up (`0x8650C624` = 2) and its bottom is above the ground; after the last log, 5 for the winners, 6 for the rest (`0x84` of the player) |
| 1, ready | 7 (and 0x1F0A) once the log's bottom is below 100 |
| 2, getting ready | 1 |
| 3, the cut | 1 |
| 4, a miss | 7 (and 0x1F0A) if the log's bottom is below 100, else 1 |
| 5, the cheer | 0 |
| 6, the fall | nothing after the last log (it stays down), else 0 |
| 7 | 0 |

So after every log, cut or not, each Scyther lowers its scythes and waits,
each at its own moment (a cut goes back to ready first, and lowers at the end
of that loop). The code that plays clip 6 for everyone after each log
(`0x86509A30`) only runs when `0x8650C4C8` is 1, and nothing sets it: it's 0
in the game.

**Sounds** (bank 1 of the effect table, [audio.md](audio.md)): 0x1F00 a cut,
0x1F01 a miss, 0x1F0A getting ready and lowering the scythes, 0x1F0B the points in, 0x1F0C a perfect
cut, 0x1F0D and 0x1F0E the count and GO, 0x1005 the crowd while a log hangs,
0x1B06 as a log comes up, and 0x1C07-0x1E09 the crowd after a cut. 0x1F04
plays at three frames of Pinsir's clips. The crowd's sounds repeat until
they're stopped: 0x1005 stops when the game stops asking for it, 50 frames
after the drop; 0x1B06 and the reactions share a channel, each taking over
from the last, and nothing stops them in the round (the module stops every
sound as it leaves, `0x80027ED0(0xFFE)`). The remake stops them at the
finish.

**Pinsir and Scizor.** The object comes from the player's Pokémon
(`0x865059A0`): Pinsir (species 127) plays as object 55, Scyther (123) as 122,
anything else as Scizor (179). The Game Pak's Pokémon decides (text 50.39);
the remake is Scyther for everyone.

**Left over from development:** a debug menu (`0x865064B0`, its labels in
Japanese at `0x8650D490`) sets the log's height and length, the fall rate,
the number of logs, the camera, the effects' scale, and a "game type"
(`0x8650C470`: normal, logs that change length, very close, and the one
shipped, 3, "ねらいうち": aiming), a spin for missed logs, and whether the
drops' waits are random or dealt (dealt). The game types set up the logs
(`0x865020D8`): type 1 takes each log's length, drop height and scale from a
table at `0x8650C50C`, one row a log: 375, 297, 205, 127 and 65 long, from
258, 231, 258, 289 and 361; type 2 hangs a 375-long log from 138, just above
the blade, and drops it faster (r 0.6). Only type 3 plans the CPUs' cuts
(`0x86501384`).

## Eager Eevee

Module #61 (ROM `0x2F32D0`, linked at `0x86B00000`; code to `0xD158`, data to
0xE070, BSS to 0x18220) was read the same way, and the remake
(`web/minigames/src/eevee/`) plays by its rules. Its variables are a block at
`0x86B17A78` (G below), set up from a copy at `0x86B0D384`. The instructions
(text 50.5): "When AIPOM opens the lid, dash to the fruit with the A Button.
Press the B Button to fake a dash. The race is run five times."

**The field.** Background picture 44 is the field from the game's camera
(`0x86B00020`: 40° up and down, 39.9991, from (0, 298.6, 338.9) looking at
(0, 20, 0)): a ring of coloured stripes in a clearing. Aipom (object 150,
0.5×) hangs on its rope in the middle over a basket. The four Eevee (object
143, 1/6×) walk round the ring at radius 130, each at its own place
(`0x86B0D1FC`: 3.92699, 5.49779, 2.35619, 0.785398 radians, so 1P back left,
2P back right, 3P front left, 4P front right, as their badges are on the
screen), and the places go round: G+0xF8 goes down 0.016 a frame (0.0191111
in the final round). An Eevee that's fallen behind its place catches up 0.032
a frame (`0x86B05C84`). Object 149, a field, is loaded, but the module never
gets its model (no `0x8004DFF8` for it), so presumably it isn't drawn
(*unverified*); it's the clearing from above, without the ring (24 tiles of
64 × 32). Measured from the picture (its pixels put back on the ground
through that camera): dirt in the middle to radius 63, 30 stripes of 12°
(mauve, blue, green, red, yellow, over and over; green faces the camera) to
108, a pale band to 131, a yellow one to 151 and a rim in the stripes'
colours, darker, to 157; five trunks at the back, 184-224 from the middle,
under leaves that come down to 20-35 over the ground there. The remake builds
the field in 3D from these (`web/minigames/src/eevee/field.js`).

**A round's script** (`0x86B0B04C`, from the main program's random numbers
`0x8007B100`). What's under the basket, G+0xC: in rounds 1-4 a draw of four,
fruit (two in four), strawberries or a Pineco, never three of a kind in a row
(no Pineco in the first round on Easy, a draw of three); fruit is a melon
(object 209) one time in three, grapes (213) otherwise; strawberries are a
pile of ten (216). The final round is three piles (`0x86B0B1FC`). The basket
comes up at frame O of the race: 60-200 (`Q % 141 + 60`), but on Normal and
Hard one time in five 30-50; after a round in which an Eevee isn't back at its
place yet (blown away by a Pineco), 70-120. If O is 60 or more, Aipom may fake
it first: on Easy one fake 25% of the time, two 5%; on Normal and Hard one
25%, two 10%, three 5%; fake k at `Q % (v − 14) + v k + 10`, v = (O − 10) / N.
A fake lifts the basket to frame 5 of Aipom's clip 1 and plays it back down
(`0x86B03404`, `0x86B0346C`), without a sound: 5 frames before it the game
hushes (`0x800280B0`, sound 0xFFE: the song's volume to 0, command `0x4B`,
and the effects' sequence faded out over 20 updates and stopped, `0x83`), and
once the clip's back below its frame 0 it starts the effects again and puts
the song back (`0x800280DC`, 0xFFF: `0x80027E20` and `0x4C`). The real thing
plays clip 1 to its end: the song fades out over 2 frames as it starts
(`0x86B03308`), and the basket's clear of the ground from its frame 5 (0xAF01
then). Clip 2 brings
the basket down over the next round's prize, with Aipom's call (0xAF08, 0xAF00
and song 54, or 101 in the final round) and "ROUND 1" … "FINAL ROUND" (image
bank 392).

**A and B** (`0x86B057B0`) work while an Eevee's at its place (radius 130,
within 0.032 of its place's angle), till frame O + 99 or the race is decided.
A: the dash (state 6), in at 28 a frame to 75, where the basket is, then 14 a
frame to 45 (`0x86B0632C`, `0x86B063D8`). If the basket's not up yet (G+0x33C,
set on frame O + 4) the Eevee runs into it (0xAF04) and bounces back (clip 8,
then it walks on to its place): A works again 87 frames later (109 in the final
round). B: the feint (state 12), out to 100 and back in 8 frames (`0x86B06484`,
`0x86B06674`): A works again 11 frames later (12). A dash on frame f gets in
(radius 45 or less, `0x86B05548`) on frame f + 4. The reaction time shown in
the ". sec." box (banks 393, 394) is 3 (f + 1 − O − 5) + a random 0-2
hundredths (NTSC; 4 (…) + 0-3 on PAL).

**Who gets it** (`0x86B03628`, the basket's contents, every frame). Fruit: the
Eevee that get in on the first frame anyone does get it, each the whole prize:
1000 for the melon, 500 for the grapes (in a tie, each gets the whole prize). One
winner on its own goes in to the middle (state 11) and eats (clip 7); the
others still dashing bounce back (0xAF03). Strawberries: every frame, every
Eevee there gets one from each pile, 100 points (the pile one less for each,
`0x86B03A30`), till they're gone; a pile can go a little over ten that way.
A Pineco blows up whoever gets in (state 16, clip 10, 0xAF06 and 0xAF0B): no
points lost, but the Eevee is thrown out to radius 180 and comes round (clips
11 and 12), then waits outside the ring till its place comes round again
(`0x86B05A78`: about 13 s) and walks back in. So it usually misses the next
race. A Pineco closes the race 24 frames after it goes off (`0x86B04244`). A
race ends from O + 100, once every Eevee's back at its place or blown away,
and the Pineco's done (G+0x344 at 141).

**The CPUs** (`0x86B0BF2C`, for all four seats each round) plan their
presses: two reaction times each for the fakes and the real thing (Easy 17-27
frames, Normal 14-22, Hard 13-19 after it; level 0, not in the menu, 23-33),
and one draw of 100 for how they take the fakes: on the last fake they dash
(Easy 30%, Normal 20%, Hard 10%) or feint (up to 60%), on the others less
often; with no fakes, Easy feints 10% of the time instead of dashing, and at a
Pineco Easy dashes 30% (and feints 10%), Normal 20%, Hard 10%. From O + 28
(Easy), 23 (Normal), 20 (Hard) plus 0-3 a CPU presses A every frame till it's
in (not at a Pineco), and never sooner than 17, 14 or 13 frames after the
open (`0x86B0BB24`). When another Eevee feints soon after one of Aipom's
fakes, a CPU may fall for it and dash (`0x86B0CB1C`): on the last fake 60%,
40%, 20%, within 24, 18, 14 frames of it. Simulated, the CPUs get in about
25 frames after the open on Easy, 20 on Normal and 17 on Hard, and run into
the basket after a fake 24%, 22% and 10% of the time.

**Eevee's clips** (object 143, 15; the module plays one per state,
`0x86B023FC`): 0 waiting outside the ring, 2 walking, 5 the dash and the
feint, 6 grabbing, 7 eating (and the winners at the end), 8 bouncing back, 10
blown away, 11 and 12 coming round, 13 and 14 the others at the end
(`0x86B08F20`; a four-way tie has no winner).

**Sounds**, bank 10 of the effect table: 0xAF00 Aipom's call (sound 0x68),
0xAF01 the basket coming up (0x69), 0xAF02 a dash or a feint (0x6A), 0xAF03
bouncing back without the prize (0x6B), 0xAF04 into the basket (0x6C), 0xAF05
the prize (0x6D), 0xAF06 a Pineco going off (0x6F), 0xAF07 a blown-away Eevee
coming down (0x70), 0xAF08 the call starting (0x71), 0xAF0B for each Eevee a
Pineco blows up (0x6E, at half pitch); and 0xCA0F (bank 12) while an Eevee
eats. Song 53 (sequence 92, 64 bytes: two held notes, about 5 s) plays 70
frames after each prize goes, before the next round; song 54 (sequence 93) as
Aipom calls each round, and 101 (54 again, 40 beats a minute faster) for the
final one.

**The HUD**: each player's badge in its corner (22, 16), (270, 16), (22,
203), (270, 203); five slots by each for its prizes so far (`0x86B0DB74`,
image bank 389: grapes, Pineco, melon, strawberries); "Points" (430).

**The fruit and the effects**: the basket's contents are at the middle,
0.355556× (the Pineco 0.5×; `0x86B04500`), the final round's three piles at
(0, 0, 0), (−4.46, −10, 0) and (4.46, −10, 0) in the contents' own units. The
fruit goes on the frame an Eevee gets in (the contents object is removed:
`0x86B05548` counts the Eevee within 45 and makes a mask of them), and a pile
of strawberries when it's empty. What was got flies off as a copy
(`0x86B04970`, moved by `0x86B04870`): the melon or grapes (clip 1, held;
0.355556×), a strawberry for each one eaten (object 211, 0.248889×, off to
its Eevee over 25 frames) or the Pineco (0.5×, clip 2). It goes up 12, 12.5
or 13 a frame, less 1 a frame, and fades from 255, 5 a frame, for 25 frames;
in a tie at the fruit 24 up, less 2, fading 21, for 12 frames, and off away
from the winners (−3/25 of their positions, added up, a frame). Objects 203, 204 and 207 are
the Pineco's smoke and sparks (`0x86B052BC`, `0x86B05484`), with image bank
307 (puffs, glows, streaks).

The PAL timings (`0x86B0E0A0`, set when the TV's at 50 Hz) are numbers of their
own for 25 frames a second, rather than Clear Cut Challenge's 1.2× scaling;
the remake uses the NTSC ones.

## Streaming Stampede

Module #59 (ROM `0x2CD730`, linked at `0x86900000`; code to `0xE0A0`, data
to 0xF920, BSS to 0x1ADC0) was read instruction by instruction, and the
remake (`web/minigames/src/stampede/`) plays by its rules. Its variables are
two blocks in BSS: G at `0x8691A2A0` (reset from `0x8690E990` at the start
of each game, `0x869001AC`) and Q at `0x8691A448`, the question being played
(reset from `0x8691A7D8` before each one, keeping what's been asked). The
minigame's context is at `*0x8691AD58`: +0 its state, +0xC the menu's data
(`+0x2180` the mode, 4 = the COM plays alone; `+0x2181` the COM level, 1
Easy, 2 Normal, 3 Hard; `+0x2182` a bit per human seat). The instructions
(text 50.4): "Press the A Button and count the POKéMON visiting the studio.
There are five questions. Even if you don't get the right answer, you could
still earn points for getting close."

**The states** (`0x86901AA8`, switch at `0x8690F04C`; the drawing
`0x86901414`): 0-2 the instructions (`0xCF0B` as you start), 4 the opening
camera move (136 frames, song 29 at frame 25), 5 a question's card (85
frames, `0x8690581C`), 6 the counting (`0x86901640`), 7 the answer
(`0x8690941C`), 8-10 the last answer, the results and the menu
(`0x86909FAC`). The logic runs once a frame and counts in frames; on PAL
(`0x8690F998` = 0) the speeds are 1.2× and the CPUs' gaps their own. The
remake uses 30 frames a second (*assumed*, as for the others).

**The level** (G+0x78) is the COM level byte; with four people (all four bits
of `+0x2182`, G+0x7C = 1) it starts at 1. It sets how many Pokémon (×0.6,
0.8, 1, 1 for levels 0-3: `0x8690241C`), how spread out and fast they are
(×0.7, 0.85, 1, 1.2: `0x8690F098`, `0x8690F770`), the chance that the 3rd or
4th question is a "special" one (70, 50, 30, 10%) and how fast the CPUs press.
After each question (`0x86909C14`) the game counts the players whose total is
perfect so far (10, 20, 40, 60): at least 3, 3, 2, 1 of them (after the 1st,
2nd, 3rd, 4th) and the later streams get 2 more Pokémon each (G+0x74); all
four, with four people, after the 1st or the 3rd, and the level goes up by 1.

**The question** (`0x86902640`, made on the card's first frame). The 17 kinds
that go by (`0x8690E438`: image bank, frame list, frame count) form 7
families of look-alikes, each asked at most once a game (a flag each at
`0x8691A79C`), some only from a level up:

| Family | Kinds (image bank) | From level |
|---|---|---|
| A | Pikachu (218), Pichu (217), Psyduck (210) | 0 |
| B | Diglett (205), Dugtrio (208): they pop up out of the ground where they are | 0 |
| C | Voltorb (202), Electrode (211), Poké Ball (212) | 2 |
| D | Doduo (206), Dodrio (207) | 1 |
| E | Slugma (213), Magcargo (203), Omanyte (216) | 0 |
| F | Togepi (220), Togepi egg (209) | 2 |
| G | Magnemite (204), Magneton (219) | 3 |

- Question 1: one kind of eight (`0x8690E8CC`: Pikachu, Pichu, Psyduck,
  Slugma, Magcargo, Omanyte, Togepi, Magnemite), all of the stream; count them.
- Question 2: the same, of 15 (`0x8690E8EC`: all but the Poké Ball and the egg).
- Question 3: a family's first two kinds (`0x8690E928`), each Pokémon one or
  the other at random; count the first, the second or both (Togepi's family:
  always Togepi, the eggs are decoys).
- Question 4: family A, B, C or D (`0x8690E944`), all its kinds; A asks for
  Pikachu, Pichu, Psyduck or all three, the others the first, the second or
  both (in C the Poké Balls are decoys).
- The last question: a mix of the 15 kinds; count all of them.
- A special 3rd or 4th question (`0x8691A7D0`; each of the six once a game)
  mixes kinds that aren't alike: Pichu and Togepi, Voltorb and Magneton, or
  Pikachu and Omanyte; Pikachu, Electrode and Dodrio, Psyduck, Magcargo and
  Magnemite, or Togepi, Doduo and Slugma.
- How many (`0x8690241C`): 5-10, then 5-15, 10-20, 10-25 and 20-30 (plus G+0x74
  from the 2nd on), times the level's factor. What's counted is a code
  (`0x86904D48`: the roles it adds up); if the answer would be 0, or a "both"
  question lacks one of them, the stream is made again.

**The stream** (`0x869033C8`-`0x869049E0`, 20 bytes a Pokémon at Q): each
starts at x = 300 + rand % R × the level's spread (R the kind's own range, or
the family's widest, or 1440 in the last question) and z = z0 + rand % zr
(`0x8690E558`: 36 bytes a kind: scale, picture size, speed a + 0..b, z0, zr,
x0, xr), and t2 = rand % 197. Diglett and Dugtrio stand at x −103..103 and
pop up at t2 (in the last question t2 < 12). A Pokémon closer than 32 to one
before it, or too close in depth (13, 13, 13, 10, 7 by question,
`0x8690EB28`) within 640 across, is placed again; 201 tries and the question
starts over. In the counting each moves left by its speed every frame
(`0x8690ABCC`: rand % (b + 1) + a, times the level's factor, at least 4) and
is gone once x < −250; a pop-up is gone 25 frames after its t2 (its age, from
−25 − t2). Each is an upright quad of its picture's size and its kind's scale
at (x, 0, z), facing the camera's way, with a shadow (image bank 201, grey at
half strength, flat) at (x − dx, −depth, z) (`0x8690E7BC`: its scale, dx and
depth; some have none). Its picture changes every 2 frames (`0x8690B2A8`:
((frame + t2) / 2) mod n of its frame list; Magcargo's is 0, 1, 2, 3, 2, 3);
Voltorb, Electrode, the Poké Ball, Magnemite and Magneton play theirs
backwards for odd t2s, so they roll both ways; Diglett and Dugtrio show
`0x8690E264` / `0x8690E2DC` (0 0 1 1 … 5 5 5 5 … 1 1 0 0: up in 12 frames,
down in 12) from t2, and their picture 0, empty, otherwise. Xatu and Natu
(banks 214, 215) have pictures and names but are never loaded.

**Counting** (state 6). A new A press (`0x800CE1C0` + 0x28 i, +8 bit `0x8000`)
adds 1 up to 99, plays `0x3F02` panned to the player and lights its booth's
lamp for the frame; B does nothing, and there's no wait between presses. The
player dips 3, then 1, then 0.5 on the frames after. The counts aren't shown
while counting (the booths show the totals). The players turn towards the
middle of the Pokémon on show (`0x8691AB78`), 273/65536 of a turn a frame at
most (the code subtracts the player's x from both averages: its z is off).
Once none are left: 50 frames on, `0x3F08` ("Stop!"), and at 60 the answer
(state 7). Presses count till then.

**The points** (`0x869053B4`), by how far off the count is: 10, 5, 1 on the
1st and 2nd questions, 20, 10, 5 on the 3rd and 4th, 40, 20, 10 on the last;
3 or more off, nothing, and a count of 0 scores nothing. The most is 100.

**The answer** (state 7, 190 frames): the booths show the counts in gold
(G+0x70, `0x8690D000`: prim `FFC800FF`); at 30 "The answer is …" (UI layout
131's PP6C); `0x3000` at 59; at 60 `0x3F01` and the answer's digits (image
bank 414) with "Pokémon"; at 90 the points: `0x3F05` if anyone's count is
right, `0x3F04` if no one scored, and each player, after a random 0-5 frames
(`0x8691AD80`), cheers (clip 2 from frame 11) if right or is let down (clip 3,
an Igglybuff with face 2) if 3 or more off. The points go in one every other
frame, the lamp lit, with `0x3F06`; the crowd (`0x1D08` if anyone was right,
else `0x1E09`) is asked for every frame from 90 to 189. At 190 the next card.
The last question's answer: 29 frames, then state 8: song 31, the camera
eases to the results view over 120 frames while the booths go up 0.61 a point
to the totals so far (`0x3209`); from 120 the counts and "Who is correct?"
(layout 126); song 32 at 180 with the answer's digits; at 210 the points,
going up a point every other frame (`0x310A`, `0x3209`), the crowd `0x1C07`;
at 290 the winners: everyone on the top total (`0x8690B89C`). From 340 their
booths go up to the height of 100 points, their lamps flashing every 3 frames,
cheering (clip 2 from frame 10); the others' sink, faster and faster, and spin
8° a frame (`0x869004AC`), let down (clip 1, face 1).

**The CPUs.** Their answer is set when the question's made (`0x8690C20C`):
the right one plus an error of 0, −1, +1, −2, +2, −3, +3 (`0x8690EF78`) drawn
with rand % 200 against a row of `0x8690ECD8` by COM level and question; a CPU
on 60 before the last question (perfect so far) uses a row that's never right:

| Level | Questions 1-2 right | 3-4 | The last |
|---|---|---|---|
| Easy | 60% | 20% | 10% |
| Normal | 80% | 40% | 20% |
| Hard | 95% | 60% | 30% |

Their presses (`0x8690B984`): nothing till a Pokémon has gone; while some are
left, one when more than 21, 18, 14 frames (Easy, Normal, Hard; 25 at level
0) have passed since the last and rand % D is 0 (D 20 for an answer under 5,
10 under 15, 5 under 25, else 3); once none are left, one straight away if at
0, then when 4 or more frames have passed and rand % D < 2; never past its
answer. A CPU with a big answer can run out of time and end lower, so on the
whole the best of three CPUs makes about 58 of 100 on Easy, 60 on Normal and
71 on Hard (simulated).

**The scene** (`0x8690073C`, geo layout `0x8690EBC0`). The camera
(`0x86900020`) is three presets at `0x8690EB4C` (distance d, angle a, height
h, fov): the eye at (0, d sin a + 400 + h, d cos a) looking at (0, h, 0).
Preset 0 (1110, −0.48, 100, 15.4°) is the opening close-up, 1 (1030, −0.17,
−40, 23.9°) the game's view, 2 (890, −0.42, 140, 25°) the results'; the moves
ease all four numbers by (1 − cos)/2. The props stand at the origin at 0.1×:
the circus backdrop (117, a wall at z −99 up to 357), the ramp (116: the floor
at y −48 from z 60 to 810, a wooden stage at the back) and the books (118:
steps at the stage's front, and four hanging over the booths). The booths
(80, 100, 101, 102: blue, green, purple, yellow) stand at x −157.5, −52.5,
52.5, 157.5, y 10, 0.1×; each has a lamp (its face clip: dark and bright
blue, green, red and yellow for 1P-4P, so the purple booth's is red), three
digit places on bones 1-3 (the screen: the total in white, 16×16 digits of
image bank 415, or the count in gold) and its player's spot on bone 4. The
players stand in them at 0.075×: Cleffa (114, or 186 if shiny) or Igglybuff
(119, or 205) by the Game Pak's Pokémon (species 173, 174; which one a player
gets without one is decided outside the module, *unknown*); their clips are 0
idle, 1 let down, 2 a cheer, 3 off. A 1-in-300 chance a frame of a blink
(`0x8003F028`, *by appearance*).

**The words.** The cards are UI layouts (`0x1E40000` records 125-133, loaded
by `0x8004DD4C`; see [images-and-text.md](images-and-text.md)): a board hung on
two chains (133), the question about one, two or three kinds (127, 130, 128)
or all of them (129: the ALL picture, bank 412), each box showing the
Pokémon's icon (the icons archive, by dex number: the module asks for 25,
172, 54…) and its name (bank 413), "Question 1"-"4" or "Last Question", "10",
"20" or "40" "pts. for perfect" and "Press the A Button to count!" (bank 416).
"Let's count …" (bank 416) slides in from the right over frames 12-36 of the
card and out to the left over 60-84 (`0x869090A0`, y 76 on the 320 × 240
screen); "Stop!" pops up to twice its size over 10 frames, 50 frames after the
last Pokémon's gone, and shrinks away 20-30 frames into the answer
(`0x8690DC88`). How the board comes and goes is in the layouts' own animation
(*not read*), as is when each card shows.

**Sounds** (bank 3 of the effect table: [audio.md](audio.md)): `0x3F02` a
press, `0x3F07` a card (`0x3F0B` the last one's), `0x3F03` 36 frames into it,
`0x3F08` "Stop!", `0x3000` and `0x3F01` the answer, `0x3F05` someone's right,
`0x3F04` no one scored, `0x3F06` the points going in (`0x310A` on the last
question), `0x3209` a booth going up; the crowd is bank 1's (Clear Cut
Challenge's). Songs 29 (the opening), 30 (from the first card), 31 (the
results) and 32 (before the last answer).

## Pichu's Power Plant

Module #54 (ROM `0x299CA0`, linked at `0x86600000`; code to `0x6514`, data
from `0x6518`) was read instruction by instruction, and the remake
(`web/minigames/src/pichu/`) plays by its rules. Its variables: G at
`0x86606788` (+4 the state), the players at `0x8660A990` + 0x58·p, the
Electrodes' buttons at `0x8660AAF0` + 4·(d − 1). The minigame's context is at
`*0x86607230` (`+0x2180` the mode, 4 = the COM plays alone; `+0x2181` the COM
level; `+0x2182` a bit per human seat). The instructions (text 50.2): "When an
electrode pops out, press and hold the + Control Pad in the same direction. If
the lamp is blue, repeatedly tap the A Button. If the lamp is green, tap the B
Button. The first to fully charge wins."

**In short.** Four Electrode lamps sit round each player's Pichu, one a
direction (1 up, 2 down, 3 right, 4 left), and every player has the same
pattern. One at a time an Electrode pops out, blue (A) or green (B), and
stays live through the next cycle; a little before each cycle ends the next one
pops out (another direction), so for the last 30-65 frames of a cycle two are
live. Each press of the right button with the D-pad (or stick) held towards a
live one charges 1; 80 wins, and everyone who gets there on the same frame
wins. The wrong button, or a press towards one that isn't live, charges
nothing and shocks the Pichu (no input till its clip 10 ends, 9 frames). A
press with no direction does nothing; the button has to come up between presses.

**The states** (switch `0x8660715C`): 0 and 4 the instructions (`0xCF0B` as
you start), 11 the instruction screen's Pichus turning and charging during the
fade, 10 and 12 the count and the camera's glide (play starts once both GO
has come and the glide is over), 1 the play (`0x866056B8`), 8 the results
(`0x866049D4`), 7 the menu, 13-14 play again (the instructions again), 2 the
end, 9 a debug menu nothing reaches (its items: the end score 80, the input
mode, the random type, the overlap time, the demo wait, the switch time,
Pikachu's scale, the miss animation).

**Per level** (c = 4 − the COM level, 0 with no CPU; G+0x94):

| c | Level | Base cycle `0x8660722C` | W `0x86606724` | First pop-out `0x86606ADC` | CPU add `0x8660670C` | CPU div `0x86606710` | Button step |
|---|---|---|---|---|---|---|---|
| 0 | no CPU | 70 | 35 | +1 | – | – | 1 |
| 1 | Hard | 60 | 25 | +12 | 1 | 120 | 1 |
| 2 | Normal | 60 | 25 | +15 | 2 | 140 | 1 |
| 3 | Easy | 80 | 40 | +20 | 4 | 120 | 2 |
| 4 | (level 0) | 120 | 60 | +25 | 6 | 140 | 2 |

**The play**, each frame (after the players' callbacks): the time and G0 (the
frame in the cycle) go up; anyone at 80 finishes; at the event frame the next
Electrode pops out (sound `0x2F03`); 8 frames before the cycle's last frame L
the current one starts going back in (it stays live); past L a new cycle
(`0x86600CC4`): L = base − (rand2 % 30 + 40) / 5, the event at L − W +
first pop-out in the first cycle and L − W − 5 after, the CPUs' plans dropped,
and the setup (`0x86600298`):

- the direction: from the 24 orders of 1-4 (`0x8660694C`, lexicographic): a
  new row (rand2 % 24) every four, its columns in turn, skipping one equal to
  the next Electrode's; so each run of four has every direction, and never the
  same twice in a row;
- the button: A if rand_lcg % 101 < 50 − 15 × the balance (which goes up a
  step for an A, down for a B), else B; then, from the second on, a run rule
  (G+0x98 against `0x86606ACC[c]`: 0 for c 1-3, 1 for c 4, and for c 0 the
  column counter, a quirk of the table sharing that word);
- the first time, one more Electrode (another direction, the same button)
  pops out at once; after that the current one goes dead; the next one becomes
  the current one, and the pick the next.

So an Electrode pops out W + 6 frames before the end of the cycle before its
own, is the current one for its cycle (48-53 frames on Normal and Hard, 68-73
on Easy, 58-63 with no CPU), goes back in 8 frames before that ends, and
goes dead when the next cycle starts. A press on frame t sees it if it popped
out before t and goes dead at t or later.

**The players** (`0x86602260`). Input (`0x86601C98`): the D-pad if any of it
is held (up first, then down, right, left), else the stick past ±10; a press
is A or B going down with the latch clear (it clears when neither is held: one
press per press-and-release, every other frame at most; A wins if both). A
press (`0x866017E0`, `0x86601F70`): no direction, nothing; the right button at
a live Electrode a hit (charge +1, sparks); the wrong one, or a dead
Electrode, a miss (`0x86600C70`: no charge, and a shock: clip 10 from the next
frame, sound `0x2F08`, no input till it ends). A press towards a new direction
turns the Pichu (clips 3 up, 4 down, 1 right, 2 left, with their face clips,
texanim01-04, and sound `0x2F04` + the player); it holds the clip's frames
11-12 while it charges (a CPU, or a person who pressed in the last 20 frames)
with the hum `0x200B` (+ 0x100 × the player) asked for every frame.

**The CPUs** (`0x86600678`, after the play each frame). A CPU without a plan
draws x = rand2 % 399 and presses on the first frame G0 passes G0 + x / a0 +
add (add from the table above, a0 = div − its mood's (rand_lcg % 5, once a
round) + a round-wide speed (rand_lcg % 11) times 8, 10, 20 or 25 for c 1-4;
c 3 with a speed of 8 or more takes 150 off a0, and 1 off the frames). Its
mood tables: c 1 (0, 10, 30, 40, 50), c 2 (0, 20, 40, 70, 90), c 3 (0, 20, 30,
40, 50), c 4 (0, 10, 30, 40, 50). It aims at the current Electrode and never
picks a wrong button. If it would press past its margin before the cycle's end
(L − (rand2 % W − 5), once a round), it goes for the next one with a free
pass (a hit even if it's dead), or, now and then, a random direction (c 1: x
< 10 with a speed under 7; c 2: x < 30; c 3: x < 100, or 50 with a speed of 7
or more; c 4: x < 120 and no pass): a shock if nothing's live there. A free
pass doesn't drop the plan, so the next frame it presses again. The code's
"late" and "wrong" flags are uninitialised locals only ever set to 1; the
remake (and the simulation) take them per CPU, as clearly meant.

**Finishing and the results.** Everyone at 80 on the same frame wins (all
four: G+0xA4, everyone wins). The time from GO is kept (minutes, seconds,
hundredths + rand_lcg % 3) but nothing in the module shows it. From the
finish: at 50 the losers are zapped (clip 6, a lightning bolt over them,
sounds `0x2F09` for 1P and 4P, `0x2F0A` for 2P and 3P) with the jingle's
first part (`0x2F0C`, `0x2F0D`), its others at 70, 90 and 110 (`0x2F0E`-
`0x2F10`); at 130 (80 if all four won, with no zap and no jingle) the winners
play clip 5 (and a Pichu cries, `0x2F11`), and the menu follows.

**The scene.** One screen, not one a player: the power plant's frame (object
56) head on, a 2×2 grid of rooms (1P top left, 2P top right, 3P bottom left,
4P bottom right), the B/A sign in the middle.

- The camera: fov 30 (the camera node's own: `0x80038070`), 320 × 240, eye
  (0, 50, 2210) looking at (0, 50, 0). In states 5, 10 and 12 it glides from
  (750, 300, 900) looking at (60, 60, 50) to there over 50 frames
  (`0x86605ABC`, table `0x86606830`), and the HUD comes on.
- The Pichus (object 107; Pikachu, 201, at 0.6 if the seat's Game Pak
  Pokémon is one) at 0.7, at (∓345, 100) and (∓345, −390), z −200 (`0x86606DD4`).
- The Electrode lamps (object 57, 16 of them) at z −50 round each Pichu
  (`0x866068CC`): 1P's at (−325, 450) up, (−325, 50) down, (−50, 250) right,
  (−600, 250) left, the others the same about their rooms; turned 180° (up),
  0 (down), +90° and −90° about z, so all point in. Its clip 00 pops it out
  (frames 0-3, out at 4) and puts it back (5-8); its face is red (2) when
  dead and loops [3, 4, 5, 5, 4] (blue A) or [6, 7, 8, 8, 7] (green B) while
  live (`0x866023F4`). All four players' lamps in a direction move together.
- The B/A sign (object 56's face channels 0 and 1, `0x86601910`): every 6
  frames it restarts texanim 0 (A lit), 1 (B lit) or 2 (both), from which
  colours are live; dim (6 and 9) otherwise.
- The sparks (image bank 224, 64 × 64, white): 6 times a ±30 quad at z 150,
  by player and direction (`0x86606B80`, `0x86606BC0`: 1P's (−280, 274) up,
  (−280, 134) down, (−140, 204) right, (−420, 204) left; 2P's 600 to the
  right, 3P's and 4P's 460 down), a random picture of 0-6 each frame. The
  lightning (bank 225, 32 × 96, yellow) 12 × 8 times a ±15 × ±45 quad at
  (∓510, 550) and (∓510, 70), turned `0x1C00` (1P, 3P) or `0x6C00` (2P, 4P),
  drawn after the HUD. Both are grey (I8) pictures: the colour is prim + (1 −
  prim) × the grey, the alpha the grey. The dizzy stars (object 190) come out
  in the results (`0x86604FB4`).
- The HUD (`0x86603604`): each player's badge (bank 434) big over its Pichu,
  shrinking to its room's corner as the glide ends (1P (41, 39), 2P (255, 39),
  3P (41, 143), 4P (255, 143)), and a gauge on the bar over each room
  (`0x86606E6C`: (40, 19), (210, 19), (40, 123), (210, 123)), 70 × 14: bank
  410's cap, its last column stretched, and the cap mirrored; the fill (bank
  409's first column) charge × 60/80 pixels long (`0x8660673C`), 61 for a
  winner, with a grey over it pulsing (alpha |10 − n| × 20, n 0-20).

**Random numbers.** rand2 (`0x8007B100`) for the cycles, the rows, the first
Electrode, the CPUs' x and margins; rand_lcg (`0x800357EC`) for the buttons,
the moods, the round's CPU speed, the late CPUs' random direction, the sparks
and the time's hundredths. The drawing takes rand2 every frame too, so a real
game can't be replayed from the module alone; the remake gives the pattern
and the CPUs random numbers of their own.

**Played out** (`web/minigames/tests.js`, three CPUs): the first CPU is full
at about frame 535 on Easy, 395 on Normal and 316 on Hard (the middle of 41
rounds); a person tapping the right button every 3 frames beats three Hard
CPUs every time, every 4 frames about 40% of the time, every 5 never.

**Sounds** (bank 2 of the effect table: [audio.md](audio.md)): `0x2F00` and
`0x2F01` the count and GO, `0x2F03` a pop-out, `0x2F04`-`0x2F07` a turn,
`0x2F08` a shock, `0x200B` the hum, `0x2F09`-`0x2F11` the results. Song 21
from GO.

## Tumbling Togepi

Module #55 (ROM `0x2A2860`, linked at `0x86700000`; code to `0xAB5C`, data
from `0xAB60`) was read with the help of a decompiler (`m2c`, on a
`spimdisasm` listing of the module), checked against the instructions, and
the remake (`web/minigames/src/togepi/`) plays by its rules. Its variables: G
at `0x8670BB48` (+0 the state), the players at `0x86728408` + 0xAC·p, the
CPUs at `0x86728328` + 0x38·p, the obstacles' records at `0x8670C980` +
0x3C0·p (60 of 16 bytes: the type, a column for the CPUs) and their objects at
`0x86711760` + 0x5460·p (60 of 0x168), the Togepi at `0x86710C20` + 0x168·p.
The instructions (text 50.3): "Run downward, using the Control Stick to avoid
flowers, boulders and logs. Step on an arrow to speed up. You can jump over
logs, but you will slow down. The first one to the goal wins."

**In short.** Four treadmills stand side by side on a platform (object 60, at
0.8x), each a lane 276 units wide (lane p's left edge at (120p − 240) × 2.3;
its belt 248 wide, x = the Togepi's start + −2, −1, 1, 2). Each Togepi
(0.75x) stands near the far end of its belt, at z = −280, facing the camera,
which is high in front (below). Holding the stick down runs: the belt's
texture scrolls and everything on the belt moves towards the Togepi and past
it. The belt draws the **track** (image bank 226, one picture 32 × 2048:
START, the 10 to 90 marks and GOAL, on grass, dirt, sand and brick): four
quads, 310 × 325 at y 100 (`0x8670B850`), showing four of its 32 × 32 tiles,
from tile *tile* and *px* rows down (`0x867007B4`: rows tile·32 + px + 3 to
+127, 31 to a quad). The course comes along the belt as **rows** of
obstacles; everyone's belt has the same course, and nothing on one belt
touches another.

**The course** (`0x8670211C`): five sections of four rows. Each section picks
one of 20 patterns (`0x8670B464`: 80 row pointers) from 0-4, 0-14, 5-14, 5-19
and 15-19 in turn (`rand2 % n + base`, again if it was picked already), and
is mirrored (column → 18 − column) if `rand2 % 100 >= 51`. A row is a list of
6-byte entries ending in type 12: [column 0-18, depth, type, and three
columns for a CPU's way round it]. An obstacle goes at x = the lane's left
edge + 13 + 13.8 × column (13.8 = 6 × 2.3; 13 is that truncated), z = base
+ 18 × depth: base 400 for the first row, 702 (18 × 39) after. Row k comes on
once the track has scrolled 83.5·k px (`0x86702E50`), one row a frame at
most; obstacles are drawn (and a Diglett's clock runs) once nearer than z 450,
and dropped past −600. The types, with their models and scales
(`0x8670BDD8`) and half sizes in columns (`0x8670BAE8`):

| Type | What | Model, scale | Half size (across, along) | Running into it | Dashing into it |
|---|---|---|---|---|---|
| 0 | flowers | 62, 0.8 | 3.5, 3.5 | state 1: slowed to 0.3 while in them | slowed while in them (and, if the hop ends there, a 32-frame spin that ends the dash) |
| 1 | small rock | 63, 0.8/1/0.8 | 1, 1.5 | state 3: knocked (on no course) | knocked: the dash ends |
| 2 | rock | 64, 0.8/1/0.8 | 2, 2.5 | state 4: knocked | knocked: the dash ends |
| 3-5 | logs, 1, 1.5 and 2 long | 65-67, 0.6 | 3-5, 3 | state 2: tripped | a bounce (`0x68`: 10 frames over it, untouchable), and the dash's speed down to 0.05 |
| 6-8 | pillars | 68-70, 0.4 | 3-5, 3.2 | blocked (on no course) | |
| 9 | Voltorb, rolling side to side | sprite, bank 227 | 4, 1 | (on no course) | |
| 10 | dash arrow | 202, 0.12 | 3, 3 | a dash starts next frame | more speed (below) |
| 11 | Diglett | sprite, bank 205, 3.5x | 3, 3 | its clock 7-12 (coming up): a bounce; 13-26 (up): knocked; else (in its hole) nothing | the same |

What's run into is gone, except flowers, and a Diglett unless it was a dash
that hit it. Every row ends with an arrow (or two) at depth 37, in column 3,
9 or 15 (a few patterns have one more). A
Diglett's clock (`0x8670018C`) counts frames from a start of 0, 18 or 36
(cycling, a random step); its picture is clock / 3 (0-5 coming up, 6-11 the
same back down), and from 36 to 71 it's in its hole and the clock gains a
random extra frame now and then; at 72 it starts again.

**Running** (`0x867043AC`, each frame in the play's state 1, while the
Togepi is running, in flowers, or hopping in a dash): the stick (or the
D-pad: ±60, ×0.75 each on a diagonal) is clamped to ±60 and scaled by 0.75. A
step forward is (0.32 + boost) × the stick's down × slow (`0x8670BD9C`), across
(0.2 + side boost) × the stick's side (`0x8670BD98`); below 5 either way is
nothing. Running scrolls the track 0.12 px a unit (`0x8670B384`). Before it
moves, a Togepi checks the point twice its step ahead against everything
within 144 units ahead (`0x867037B8`): what it runs into does its thing (the
table) and stops the step for that frame, except flowers. Its x stays 63.75
(85 × 0.75) in from its lane's edges. The progress the HUD uses is the track
scrolled over the course's length, (tile·32 − 1 + px) / (58·32 − 1 + (−280 −
z) × 0.12) × 100, with a quirk: below 66% it also adds in half of what it had
(so it runs a little ahead). Past tile 56 and 20 px the belt stops and the
Togepi runs on off its end; at z −155 it's at the goal (state 12, clip 8),
then waits (state 11).

- **Knocked** (states 3 and 4, clip 2 at speed 2): for its frames below 5 it's
  thrown on 75 × (0.32 + boost) a frame (the belt scrolls on: the obstacle
  is gone), then 7 till frame 24, and aside by its facing (the sine of its
  turn × that); then running again at the clip's end.
- **Tripped** (state 2, clip 3 at speed 2): thrown on 180 a frame for frames
  below 3, 18 till 13, running again at frame 40.
- **A dash** (an arrow, `0x74`, `0x38`): the boost goes up 0.09 and the side
  boost 0.028; the Togepi hops along (clip 7, at speed 1 + boost; state 10) at
  45 forward whatever the stick, with 15 and 30 more on its first two frames,
  until its progress passes the progress at the arrow + 5.6. Another arrow
  while dashing adds 0.09 more (if the speed's under 0.75; past it the boost
  goes back to 0.3) and starts the 5.6 again. When it ends, the boost runs
  down 0.01 a frame (from −0.01: so the speed fades out) unless the stick's
  held down. The aura (object 188, 0.55x, longer with the boost) fades in
  over it (alpha 255 down to 70) and out at the end.
- The Togepi faces the way it runs (`0x86703D98`: a quarter turn from the
  stick's angle, the stick's up taken as level).

**The CPUs** (`0x86702434` sets them up, `0x86701C6C` steers): by level (1
Hard - 4; the COM level's 4 − level) a look-ahead (250-299 units on Hard,
200-249 Normal, 150-195 Easy, 120-165), a steering gain and a threshold
(with a mood 0-3 that scales them), and a 1-in-4 chance of being "lazy". They
always run (the stick down by 60 − |steer| / 4) and steer for the column the
obstacle ahead was given for them when it came on (one of its three CPU
columns: the first mostly, the third with a chance by level and mood
(`0x8670B3E4`, `0x8670B424`), by a choice made at the row in patterns 7 and 8,
the third if lazy, the first once anyone's in), with the game's own sums: to
the right with a steer of gain × (that column's x + its own x), to the left
gain × the distance. Close to it they snap to the column. While dashing they
look for the nearest thing, an arrow only now and then (less often the better
placed they are and the harder; `0x8670BD84`, `0x8670BD74`). A quirk: when a
CPU's first choice loses, the second goes on the obstacle in slot *p* (its
player number) instead of the new one.

**The camera** (`0x8670675C`): eye D away at an azimuth and elevation
(binary angles, `0x8670BE80` and `0x8670BE84`), at (cos az · D cos el + 1,
D sin el, sin az · D cos el), looking at G+0x20-0x28, fovy `0x8670BE7C`, near
100, far 12800. In the countdown (state 5, `0x8670A07C`) it starts at the side
(az −180°, el 15°, D 1610, fov 13.6, looking at y 160), with the scenery
(objects 132-138) on, and over 76 frames comes round to the front and up:
az +90°, el 36.3° (`0x19D3`), D 7570, fov 7.6, looking at (0, 40, 0); then the
scenery's taken off (139 and 140, the ground round the platform, stay). At the
end (`0x86709AD0`) it comes down over 40 frames to the winner (el 18.9°, D
3380, looking at the winner from y 200), then turns round it (0x80 a frame).

**The HUD** (sprites in the scene): each player's badge at both ends of its
belt (bank 434, 4.2x, z 570 and −580), a rank coin over each Togepi (bank
387, `0x86706A30`), and on each belt the other three's badges where they are
along the track (`0x86706B88`, alpha 0x8C, hidden past ±600 units). The
others: a shadow under each Togepi (Eager Eevee's bank 307 picture 1, a 60 ×
60 quad at 1.5x, in the environment colour 0x0C1602), the dust when one's
knocked.

**The play's end**: the race is over when the last one's goal clip ends;
the winners are the first in (a tie: everyone in on that frame). The time
shown is frames / 30 with random hundredths (`0x86703F9C`). The song is
46 (sequence 85), from GO (state 5 → 1, with the count's 0x5F07 and GO's
0x5F08); the effects are bank 9's ([audio.md](audio.md)). As each one gets
in: 0x5F08 again, and for the first the crowd (0x1C07).

**The states** (switch `0x8670C68C`): 0 and 4 the instructions, 10 the
Togepi running in from far off during them, 12 and 13/5 the countdown with
the camera coming round, 1 the race, 14 the results, 8 the menu after, 9 a
debug menu nothing reaches (the course's patterns and mirrors, by hand).

The browser remake follows this, with a few changes for online play: each
lane has random numbers of its own (the game's are shared), the Togepi stay
put on their belts (the game moves each up or down by its rank, −300 to 100,
3 a frame), the CPUs rank among themselves, and the race is called 30 s after
the first one's in ([web/README.md](../web/README.md#tumbling-togepi)).

## Gutsy Golbat

Module #49 (ROM `0x25A9F0`, linked at `0x86100000`; code to `0xA09C`, data
from `0xA0A0`, constants and strings from `0xAA10`) was read with `m2c` on a
`spimdisasm` listing, and the remake (`web/minigames/src/golbat/`) plays by
its rules. Its variables: W at `0x8610AD28` (a pointer to it at
`0x8610AD20`; +0x3C the state), and in it object pools (`0x87F025B8` takes a
free slot and puts it at the end of the pool's list; each object's +0x1C
counts its frames, after its update): the Golbat at +0x6E8 (4 of 0x18C), the
Magnemite at +0xD2C (16), the hearts at +0x2600 (64), the backdrops at
+0x8914 (2), Jynx at +0x8C40 (1). Each player's record is at +0x8DE0 + 0x2C·p:
+0 its Golbat, +4 its hearts, +8 a CPU's ways (below), +0xC a direction, +0x18
a spot to fly to, +0x24 which way it faces, +0x26 last frame's buttons. The
instructions (text 50.0): "Tap the A Button repeatedly to go up. Use the
Control Stick to move from side to side. The one with the most hearts wins.
Your hearts will scatter if you hit a MAGNEMITE or get hit hard by an
opponent."

**Its tuning** has names: a debug menu (`0x861075DC`, unreachable) lists them
with the module's strings, and `0x86107360` sets them: SCROLL SPD −8, FLAP TYPE
0, FLAP SPD 9, SPD X 0.023, ENEMY BND 20.5, PLAYER BND 0.6, GRAVITY −0.58,
DROP RATE 0.5, TIME 1200 (frames) and GOLBAT SC 1 (a Golbat's scale is 0.04 ×
it, and its size 700 × that: 28).

**The scene** (geo layout `0x8610A114`). The camera node (command 0x0B,
`0x8003FF98`) puts the eye 1200 from (0, 0, 0) at angles 0, 0: at (0, 0,
1200), fov 30 (vertical), 320 × 240, near 100, far 12800. So the play is the
plane z = 0, and the module's odd constants are screen pixels × 2.6795
(1200 tan 15° / 120): a Golbat stays within x −364.41 (−136 px) to 321.54
(120 px) and y −209 (−78 px; −192.92 outside the play) to 199.35; things
come on at x 464.85 (just past the right edge) and go past −464.85. Two
lights follow the camera (white and grey, `0x86100ACC`, `0x86100B34`).

- **The backdrops** (`0x86106044`, `0x86105CD8`): image bank 221's three
  256 × 192 pictures (the cave, the cave's mouth, the meadow outside),
  3.375x (864 × 648), side by side at z −100, from x −100 and 764, going by
  at half the scroll (4 a frame; also through the countdown). One that goes
  past −864 moves on 1728. Once the clock's run out, the next to move on
  becomes the cave's mouth, the one after the meadow (with Jynx, and the
  players' glows off). Once the meadow is past 0.95 × 864 no more of the
  course comes; once it's past 10 the scroll stops: the play is over. The
  last three seconds sound the shared count (0xCF00) and the end 0xCF06.
- **Golbat** (object 53 at 0.04): clip 2 flying (played faster after a flap:
  1 + 2 × its upward speed / 15), 4 knocked by a dash, 5 hurt by a Magnemite,
  6 cheering, 8 falling, 9 down; its wingbeat (0x0F03) each time clip 2 comes
  round. It turns 15% of the way a frame to face right, or left while its
  stick's pushed that way (`0x8610362C`). Behind it, a glow in its player's
  colour (bank 343, a grey disc the combiner makes env + (prim − env) × grey,
  alpha 1 − grey; `0x86109AE0`, colours `0x8610A224`), pulsing.
- **Magnemite** (bank 69, five 32 × 19 frames, 0, 1, 2, 1, 0, 3, 4, 3, one
  every three frames; on a 112 × 66 quad at 0.64: `0x86105C30`) bob 10 up and
  down, 12° a frame.
- **Hearts** (bank 222, 16 × 16 on a 46 × 46 quad, wobbling; red from the
  course, outlined in the colour of the Golbat they were knocked out of).
- **Jynx** (object 110 at 0.2, turned −22.5°, at y −242.92, z −100) comes with
  the meadow, 1.35 × 864 to its right; once the scroll stops she throws a
  heart on frames 8 and 47 of her clip, which the winners catch (for show).

**The course** (`0x86100418`): the scroll counts 8 a frame through sections of
1000; a section is a list of [where /255, height /255, what] (`0x8610A250`,
42 of them listed at `0x8610A7A0`): what 0 is a Magnemite at y = 213.69 −
444.18 × height/255, 1 one on every level, 2 one on Normal and Hard, 3 a heart
at y = 213.69 − 427.37 × height/255. Their order (`0x861001A0`) is 6, 0, 7, 1,
12, 18, 13, 19, 24, 30, 25, 31, 36, 37…: two of one six, two of another. The
code draws random numbers for each six as if to shuffle them, but swaps
nothing, so every round's course is the same.

**A Golbat in the play** (`0x8610362C`), each frame: its speed × 0.97, gravity
added; a person's stick across (−64 to 64, the D-pad ±64) adds 0.023 × it
(`0x8610320C`); A pressed (FLAP TYPE 0: a press, not held) adds 9 up. A CPU
does the same from what it decides (below). Faster than √450 × 0.7 (14.85) is
a **dash** (it shows in its player's colour). It moves, bumps the others,
its speed is kept within ±15 each way, and the edges stop it (it bounces off
the floor at half its speed). Two Golbat closer than 49 (`0x8610109C`) are
pushed apart and bounce (by 1.6 × 0.8 of their speed towards each other); a
dashing one into one that isn't knocks a heart out of it (0x0F01; no one can
catch that heart for 16 frames) and bounces less (0.5).

A **Magnemite** closer than 30.68 to a Golbat (`0x861056C0`) knocks it back
20.5 and out go half its hearts, rounded up (DROP RATE × (hearts + 1)),
each towards a random spot at 15 (`0x86100F1C`, 0x0F05); the Golbat is hurt
for 26 frames (no Magnemite can hit it again meanwhile, and it flashes), 0x0F02;
a Golbat can't catch back a heart knocked out of it for 16 frames. A **heart** is caught (`0x86106504`: 0x0F04, up to
99) by the first Golbat within 58 across and up, except the one it came out
of (or anyone, if a dash knocked it out) in its first 16 frames. Hearts from
the course go by with the scroll; knocked-out ones fly off, slow down
(× 0.97) and bounce off the floor and the roof.

**The CPUs** (`0x86109318`, each frame) are ranked by hearts (after three
random swaps each) and given ways from a table by level (`0x8610A0A0`,
`0x8610A0B0`, `0x8610A0C0`): Easy 0xC10, 1, 1, 1; Normal 0x120, 0x210, 1, 1;
Hard 0x120, 1, 0x182, 0x140 (the best first). On Easy one with 5 hearts (on
Normal 9) just roams. And when a person leads (Easy: 9 hearts and three times
the best CPU's; Normal 6, Hard 4, and more than it), the CPU with the fewest
goes after them: aiming 12 Golbat past them (bit 4) if they have twice the
best CPU's (2.33 times on Hard), else following them (bit 2) and going for
hearts once close. The bits (`0x86102E8C`): 4 / 0x2000 chase, 2 follow, 0x1000
roam, 1 roam round the Magnemite, else go for hearts (`0x86102D50`): the one
that's near, far left (0x10: not minding), among others (0x40: twice as
much) and with no Magnemite between (0x80: twice), as far right as 464.85
(0x100), 393.19 (0x200) or 321.54, even ones it can't reach in time (0x800).
It steers round Magnemite within 52.16 first, brakes for one in its way, and
works its stick and A as a person would: a frame's change of speed is its
buttons, and it can't flap two frames running.

**The end** (state 5, `0x861008E8`): the most hearts win (a four-way tie: no
one); for half a second all are startled (clip 5, pushed left), then the
winners fly round the meadow cheering (clip 6) and the others drop to the
floor (clips 8, 9), while Jynx throws hearts.

**The HUD** (`0x86108018`): the badges (bank 434 at 0.8) at x 28, 97, 166 and
235, y 16, each player's hearts beside them in its colour. The song is 13
(sequence 52), from GO; the count is 0x0F06 and GO 0x0F07 ([audio.md](audio.md)).

**The states** (`0x861095EC`): 0-2 the instructions and the fade, 3 the
Golbat flying in from by the camera (to a zigzag on the left: x −160.77 and
−272.77, y 117.68 down 81.67 each) with the countdown, 4 the play (the clock
counts down 1200 frames), 5 the end, 6 the results, 7 the menu after.

The browser remake runs this world in every device and on the server, from
everyone's pads (the CPUs think in it), and shows the screen at 92% of the
game's width and height, as a TV did, and more of the cave either side on a
wide screen ([web/README.md](../web/README.md#gutsy-golbat)).

## Barrier Ball

Module #51 (ROM `0x2761A0`, linked at `0x86300000`; code to `0x6E9C`, data
from `0x6EA0`, constants and strings from `0x7490`) was read with `m2c` on a
`spimdisasm` listing (given the shared vector helpers' prototypes, module #65
at `0x87D00000`: `0x87D0059C` normalises x, y in place and returns the length,
`0x87D00648` a segment's perpendicular, `0x87D00670` where two lines meet,
`0x87D00720` how far a point is from a line), and the remake
(`web/minigames/src/barrier/`) plays by its rules. Its variables: W at
`0x863075E0` (a pointer to it at `0x863075D8`; +0 the state), and in it object
pools: Mr. Mime at +0x12C (4), their barriers at +0x770, the balls at +0xDB4
(4; +0xDB8 how many), each ball's glow at +0x8298 and its trail at +0x1F84
(64). Each player's record (`0x863072F8` + 0x4C·p) holds its corner: +4 the
way Mr. Mime faces (45°, 315°, 135°, 225°), +8 its lane's slope (±1), +0xC
where the lane crosses x = 0, +0x10/+0x14 how far it may slide, +0x18 the
barrier's way along, +0x20 its normal (towards the middle), +0x28 where it was
a step ago, +0x30 a CPU's spot to go to, +0x34/+0x38 a CPU's aim, +0x3C its
points. The instructions (text 50.10): "Use the Control Stick to move and hit
the ball back. Press the A Button to hit a smash. Earn a point for getting
the ball in an opponent's court, and lose a point when scored on. Get five
points to win."

**Its tuning** (a debug menu, `0x86303C00`): TIME 60 s, GOAL SCORE 5, BALL
SPEED 4 (the most a ball goes in a step), SMASH DEC 1 (what a smash's push
keeps each step); the scoring is type 2 (below).

**The scene** (geo layout `0x86306EA0`): the camera (command 0x0B) 2000
straight above the middle, fov 15, 320 × 240: the court is the plane z = 0,
seen from above (x −351 to 351, y −263 to 263), and the models stand up out
of it (Mr. Mime turned up by a fixed matrix, `0x86300EF8`). A white light and
a grey (155) ambient one.

- **The court** (object 120 at 0.1, `0x863006F8`): its floor, lines and the
  hole in the middle (layouts 0-2), and four walls (3-6), wedges pointing in
  with their tips 180 from the middle (top, left, bottom, right). Between them
  run the four corners' lanes, 254.6 wide: a corner past x or y ±250 is a
  goal.
- **Mr. Mime** (`0x86301B3C`, at 0.15): 220 from the middle, facing in, its
  barrier (object 141, drawn in Mr. Mime's place) 57.87 in front; it slides
  across its lane, 67.3 either way. In the play it's object 218 (clip 0
  behind its barrier, 1 a smash); for the countdown and the end, object 129
  (0 miming, 1 putting up its barrier, 2 a win, 3 a loss at 0x28/0x40 of the
  speed). The barrier's clips: 0 a smash, 1 coming up, 2 held, 3 and 4 gone.
- **A ball** (object 154's Poké Ball) flies 100 above the court, with a glow
  (image bank 151 at 2.6 × the ball) in its last hitter's colour (grey for
  nobody: `0x86306FB8`) and a trail of 8 fading copies.

**The play runs three steps a frame** (`0x86302404`): the Mr. Mime, then the
balls, then the balls off each barrier. Each frame (`0x8630352C`): with time
left, a counter adds one; past 90, the balls wanted go up by one (to three)
and it starts again; with fewer balls than wanted, one comes (`0x86306D3C`,
0x6F02); then the steps; then the clock goes down (`0x8630328C`), and the play
ends when it's run out or someone has 5 points. The last three seconds sound
the shared count (0xCF00). In the last 30 seconds the tune speeds up
(`0x80028108(6)`: the main program's `0x80027628` sends audio command 0x49 with
one beat a minute more every 25 frames, up to 18).

**A ball** comes up in the hole spinning (`0x863060FC`): 7.5° a step (from
−45°; one about to point within 5° of a corner or a side is nudged on to 5°
past it), growing to 0.7, for 96-144 steps, then flies off the way it faces
at 2.3 (the main program's sine table, `0x80087FB0`; 0x6F06). In flight
(`0x86306710`) its curl (× 0.998 a step) turns it, a smash's push adds on, and
it bounces off the walls' edges (or, missing those, off a post at each tip:
a circle of 21), each bounce off a normal give or take 0.0025 and faster by 1
(to BALL SPEED; 0x6F04). Past ±250 it's a goal (`0x863001BC`, 0x6F05 and
0x6F0B): in the scoring the game uses (type 2), the corner's player loses a
point (not below 0) and the ball's last hitter, if someone else, gets one; the
ball fades for 16 steps and goes, and the balls wanted go back to one. A hit
counts as its hitter's only once the ball's in the middle diamond (tips
(0, 180), (−180, 0), (0, −180), (180, 0): `0x86306690`).

**A barrier** (`0x86305A04`) is 120 across. A ball about to cross it (from the
side it was on) is brought to touch it and goes off (`0x86305144`) from Mr.
Mime (or from its mirror image, for one hit from behind) through the spot
t × 1.3 − 0.15 along it, faster by 1; the barrier's slide (and its normal)
give it curl. A ball within 21 of its ends does the same from there, and one
behind it, at Mr. Mime, is pushed out to the side and sent back. The sound is
by the curl (0x6F03, 0x6F08-0x6F0A) or 0x6F07 for a smash. **A smash** (A:
`0x863013C8`, 0x6F00) lasts 31 steps: the barrier pushes out (to 81.7 at its
most, over 11 steps: `0x86307464`), and a ball it hits in steps 3-23 gets a
push of 2 on top of its speed (halved with each hit after).

**Mr. Mime** (`0x863013C8`): a step's slide is 0.09 × the stick (−64 to 64:
the stick across, or up and down, whichever is pushed more; the D-pad 48 and
64), and moving more than 4.032 in a step sounds 0x6F01 once. **The CPUs**
(`0x86300DD4`), each step, go for the ball they reckon reaches their line
soonest (by where its path crosses it, `0x86300818`), of those coming their
way that they can handle: no faster than their level's reach (Easy 4.8, Normal
5.4, Hard 6, × 0.83, 0.93, 0.98 for each other ball on the court; level 0,
5.4, × 0.1 for a ball a person hit, isn't reachable), or already past; aiming
a little off its middle (a random aim after each hit; the game's sum for y
uses x's numbers). Near one (within 42 of the line) they smash with a chance
of 0.4, 0.7 or 1. With none to go for they wander to a random spot in their
lane and wait there. With four people the level is Easy.

**The end** (state 5, `0x863024A8`): the steps run on (the balls slow, × 0.975
a step); 8 frames on, the results. The most points win (a four-way tie: no
one): they dance (clip 2), the others flop (clip 3).

**The HUD** (`0x8630271C`): the badges (bank 434 at 0.8) in the screen's
corners, each player's points beside them in its colour, and the seconds left
at the right. The song is 35 (sequence 74), from GO; the count and GO are
0x2F00 and 0x2F01 ([audio.md](audio.md)). Its name banner is image bank 374
(by appearance; 375 is Delibird's Delivery's).

**The states** (`0x863036FC`): 0-2 the instructions and the fade, 3 the
countdown (Mr. Mime mimes, then puts up its barrier), 4 the play, 5 the end,
6 the results, 7 the menu after.

The browser remake runs this world on every device and on the server, from
everyone's pads (the CPUs think in it), and turns the view so each player's
own corner is at the bottom ([web/README.md](../web/README.md#barrier-ball)).

## Rampage Rollout

Module #52 (ROM `0x27E840`, linked at `0x86400000`; code to `0x95D0`, data
from `0x95D0`, constants and strings from `0x9990`) was read with `m2c` on a
`spimdisasm` listing, checked against the instructions where `m2c` got lost,
and the remake (`web/minigames/src/rollout/`) plays by its rules. Its context
is at `0x86409CB8` (`*0x86416C00`): +0 SPEED, +4 ACCELE, +8 LAP (below), +0x10
the state, +0x14-0x60 the camera and its move, +0x70 the menu's data (+0x2180
the mode, +0x2181 the COM level, 1 Easy, 2 Normal, 3 Hard, +0x2182 a bit per
person), +0x7D0 the four Donphan (objects, 0x18C each), +0xE00 the dust clouds
(24), +0x3334 the dust a Donphan kicks up (80), +0xB554 the stars, +0xCB8C
the players' records (0x5C each), +0xCDFC the leader's. A record: +0 the
player, +4 the part of the track it's in (below), +0xC the laps to go, +0x10
how far round it is, +0x14 its place (0-3), +0x18 its speed and +0x1C a boost
on top, +0x20 frames of rolling, +0x2C a bump's push, +0x38 frames stunned,
+0x40 frames since a CPU's last cloud, +0x44 the clouds it holds, +0x48 the
way it's to face and +0x4C the way it faces, +0x50 how old a cloud must be
before a CPU steers round it, +0x54 a CPU's line. A Donphan's flags (+0xC):
0x80000000 sent flying by a cloud, 0x20000000 knocked over, 0x10000000 just
off a wall, 0x08000000 a cloud ready, 0x02000000 a rocket start still
possible, 0x01000000 just dropped a cloud, 0xF00000 the four corners passed
this lap, 0x40000 in, 0x10000 a winner. The instructions (text 50.6): "Use
the + Control Pad to run around the track. The first to complete nine laps
wins. Press the A Button to leave a dust cloud. You can earn and save up to
three dust clouds per lap, depending on your rank."

**Its tuning** (a debug menu, `0x86407610`): SPEED 556.8/60 (9.28 a frame),
ACCELE 51/60, LAP 9, and the camera's.

**The scene**: the track (object 113 at 0.37, `0x86405BEC`: layout 0 the
field, the dirt track round a grass block in a meadow; layout 1 the wooden
fence round the track) lies in the plane y = 0, seen from (0, 1049.5, 553)
towards (0, 30, 30) with a fov of 30 (geo layout `0x86409734`). A Donphan
(object 108 at 0.04, walking; layout 1 curled up, rolling) has a radius of
23.2: its middle stays within x ±309.8 and z ±254.3 (the fence) and out of
the block, x ±148 by z ±92.5 (its edges and its corners, which a Donphan
slides round as round a post: `0x86400028`, `0x86401550`). Sprites drawn on
the shared module's quad (`0x87F08E3C`: the image's size in units, centred):
a dust cloud, image bank 150 (a whirlwind, 16 frames, at 2.5, lying flat: the
camera's steep enough that it stands up), the dust a running Donphan kicks up
(bank 159, 8 frames, on a 64 square), the stars over a Donphan, one for each
cloud it holds (bank 384 at 1.5, 110 above it, 30 apart), clouds and stars
in each player's colours (`0x864095D0`: the combiner makes env + (prim − env)
× the picture's grey), and its shadow (bank 307, Eager Eevee's effects: 2.53
across and 5.28 along, round while it rolls).

**The race** goes the other way from a clock seen from above: along the top
to the left, down the left side, along the bottom to the right, up the right
side. The track is in eight parts (`0x86404824`): the corners (past x ±124.8
and z ±69.3: top left, bottom left, bottom right, top right, each passed
setting its bit) and the four sides; a part's D-pad directions back the way
the race goes don't count (`0x86402158`). Each frame (`0x86404D8C`), for
each Donphan in turn: its part, its input (a person's D-pad held, and A
pressed; a CPU's, below), its update; then the bumps; then, for each, the
bumps' push, its lap, its place; then the clouds; then the walls.

**A Donphan** (`0x86402B1C`) runs on by itself, the way it last turned: the
D-pad turns it (up, then down, left, right, the first held: only a quarter
turn, never back the way it's going, and not into a wall it's against,
`0x86401F60`), and it turns to face that way half the rest each frame (its
wrap is the game's: 65535 − d past 32767). On the ground it speeds up by
ACCELE × 0.22 a frame, to SPEED × 0.85 for the leader, 0.9, 0.95, and all of
it for the last: the further back, the faster. A boost on top dies away ×
0.9 a frame. A wall it runs into (`0x864013A8`) turns it the way the track
goes (the fence: down at the left, up at the right, left at the top, right at
the bottom; the block's edges along them), and for a moment (2 × (1 − its
speed/SPEED) frames) it can't turn. Its laps (`0x86404D8C`): how far round it
is is its angle about the middle, 23.2 ahead of it (the main program's
`0x8000B390`, atan2 by a 1025-entry table at `0x8008CFB0`, 65536 to a turn,
in 65535ths), counted from the top's middle; once round all four corners,
crossing that line is a lap. So the race is the start to the line, then nine
laps. **Places** (`0x864033AC`) go by the laps done plus how far round,
ties to the lower seat (a bubble sort); once in, by the place it came in.

**A rocket start** (`0x86402688`): A within 10 frames of GO adds SPEED × 0.8
× (1 − frames/10) and rolls it for 30 frames; A in the countdown loses it
(`0x864068A4`). On the last lap it rolls all the way.

**Clouds** (`0x864012A0`, `0x864009D4`): a Donphan holding any, not stunned
and on the ground drops one where it is with A (0x4F06), and gets a boost:
SPEED × 0.9 × 0.3, or on the last lap its full SPEED and a boost of SPEED ×
0.9. A cloud comes up for 5 frames, stays 175, fades over 10. Someone else's
cloud (up, within 30) sends a Donphan flying (`0x86402304`, 0x5F03): up to
92.8 and spinning, stopped, for 20 frames if it's leading, 14 second, 8
third or last; the cloud fades. At each lap a Donphan gets clouds by its
place (none for the leader, 1, 2, 3 for the last; up to 3 held), and the
leader's lap sounds 0x5F09, the last one 0x5F0A (and song 100: song 34, 17
beats a minute faster).

**Bumps** (`0x86401920`): two Donphan closer than 46.4 (in 3D) are pushed
apart, half each; one with a boost over SPEED × 0.9 × 0.5 (only a last lap's
cloud gives that) running into one without knocks it over (`0x864018B0`,
0x5F03): stunned for 20 frames, sliding, slowing × 0.9 (leader) to 0.95 a
frame, and it can't drop a cloud. Its test of which way it's going takes its
z speed with the height's part of the way between them, as it is.

**The CPUs** (`0x86403F5C`), each frame: a line round the track in from the
block's edge by 23.2 and a lane (`0x86404724`, new in each part: Easy up to
46.4 either way, Normal and Hard right along it); in each corner they turn
once past that line's turn; along a side, if a cloud's in the way, they steer
for the line moved off the clouds ahead (`0x864037C0`: from its intersection
with each cloud's crossing, 30 to either side; never more than 138.6 off).
They only see clouds older than 52-87 frames (Easy), 35-87 (Normal), any
(Hard; on its first lap it always steers to its line). A cloud of their own
(`0x86403CDC`), 6 frames or more after the last, with a chance a frame by the
part of the track (`0x86409648`: the corners 0.05, 0.1, 0.2, 0.5 at the top
right, before the line; the sides 0.001-0.01), times 0.7 for Easy (Hard: in
the corners only). A rocket start: Easy one frame in 11, Normal one in 3, Hard
at once.

**The start** (`0x864057E0`): the four places are shuffled (it swaps two at
random while a counter's below a new random number × 4 each time, so with the
game's random numbers some orders don't come up), and they run in from the
right along the top, each further in and lower down than the last, and slow
to a stop (× 0.8 a frame) on the grid, facing left, while the camera (from
(120, 430, 40) towards (120, 0, −210)) moves over the track in 80 frames.
**The end** (`0x8640633C`): the first in wins (several, in on the same
frame); the race is over the frame after the last one's in. Those in coast to
a stop (× 0.97 − 0.025 × place a frame); at the end each slows × 0.94, then
the winners cheer (clip 2), the others slump (clip 3), and the camera moves
to the winners.

**The HUD** (`0x864082A8`): in the block's middle, the rank coins (bank 387)
with each place's badge (434), and the leader's laps to go on the LAP gear
(386), or FINAL LAP! (385) flashing. The song is 34 (sequence 73), 30 frames
after GO; the count and GO are 0x5F07 and 0x5F08, which also sounds as each
one gets in ([audio.md](audio.md)). Its name banner is image bank 383.

**The states** (`0x864069DC`): 0-2 the instructions and the fade, 3 the
countdown, 4 the race, 5 the end, 6 the results, 7 the menu after.

The browser remake runs this world on every device and on the server, from
everyone's pads (the CPUs think in it) ([web/README.md](../web/README.md#rampage-rollout)).

## Topsy-Turvy

Module #47 (ROM `0x2469A0`, linked at `0x86000000`; code to `0xD150`, data
from `0xD150`, constants and strings from `0xD450`) was read with `m2c` on a
`spimdisasm` listing, checked against the instructions where `m2c` lost the
doubles passed on the stack, and the remake (`web/minigames/src/topsy/`)
plays by its rules. Its physics leans on module #48 (`0x87C00000`), a library
of vectors and quaternions in doubles: `0x87C00160` subtracts, `0x87C00198`
adds, `0x87C00208` a dot product, `0x87C00238` a cross product, `0x87C002A8`
scales, `0x87C003BC` takes away a vector's part along another, `0x87C0068C` a
length (by `sqrtf`: in floats), `0x87C00718` sets a length (nothing under
0.0001 squared), `0x87C00D14` an arctangent by a continued fraction (14
terms), `0x87C00020` an angle to ±π, `0x87C00090` steps a value towards
another, and quaternions (w first) from `0x87C008B0`. The world is W (the
module's first argument): four players at W + 0x1998 × p, the ring's spheres
at W + 0x6668, the clock at +0x6888 (seconds), a frame's length at +0x6890,
the state at +0x7518, the menu's data at +0x7580 (+0x2180 the mode, +0x2181
the COM level, +0x2182 a bit per person). A player: +0 a ball (its middle,
+0x18 its speed, +0x30 its spin, +0x78 its turn, +0xC8 its radius, +0xE0 its
weight, +0xE8 its top speed, +0xF0 and +0x108 the pushes and turns on it this
step), +0x1800 its stick, +0x1814 its points, +0x1818 who hit it last, +0x1820
times out of the ring, +0x1824 its CPU (a function), +0x1828 its state,
+0x1838 how it leans (only drawn), +0x1868 in the play, +0x186C solid,
+0x17D0 a timer (reeling; crouched; waiting), +0x17E0 its RAPID SPIN, +0x17E8
its recharge, +0x17F0 the hit's glow, +0x17F8 a hit that counts, +0x1890 its
sound's place, +0x1894 its CPU's part, +0x1990 whom it knocked out. The
instructions (text 50.9): "Use the Control Stick to strike the opponent.
Knock your opponent out of the ring five times to win. Press the A Button to
use RAPID SPIN. Use this move to knock your opponent out of the ring."

**Its tuning** (a debug menu, the values set at `0x8600B610`, the variables
from `0x8600DE30`): CALICULATION REPEAT 6 (steps a frame), BALL RADIUS 135, a
weight of 100 (× IMPACT WEIGHT 5 in a RAPID SPIN, × DAMAGE WEIGHT 0.25
reeling), GRAVITY CONSTANT 20000, STICK POWER 16000, MAX SPEED 3400 (MAX
SPEED DAMAGED 10000), MIN BOUND 600000 and MAX BOUND 260000000 (the least and
most push of a bump), BOUND FACTOR 3, IMPACT BOUND FACTOR 5, IMPACT IMPACT
BOUND 0, OUTER BOUND 0.5 and FRICTION 0.1, INNER BOUND 0.2 and FRICTION 0.04
(DAMAGE INNER and OUTER: 0), IMPACT TIME 0.4, AFTER IMPACT 1.5, DAMAGE TIME
1.2, TOUCH TIME 0.5, START CHARGE 0, INITIAL OFFSET 160, INITIAL SPEED H 800
and V 4000, LEAN BY STICK −0.3, POSTURE RESPONSE 0.5, ROTATION 0.5,
IMPACT ROTATION 67, DAMAGE ROTATION 0, SPIN SIZE 6, CHARGE SIZE 6, MIN 1.5,
LAST 5.5, MIN TIME 0.4, SPARK on, SPARK TIME 16/30, WINNERS POINT 5, DAMAGE TO
DEATH 0 (off), TIME LIMIT 60, NUM PLAYERS 4. Times are in seconds: the game
takes a frame's length from the retraces since the last (`0x80008950` /
`0x80001FC0`). The remake runs it 60 frames a second: only then does a
Hitmontop knocked out come to rest (its test, below, needs a step's gravity
under 100), and a Hitmontop's drawn spin, 0.5 a frame, is its 27 a second.

**The ring** (`0x86004BD4`) is two caps of spheres (`0x86009D7C`; +0 the
sphere's radius, +8 the cap's, +0x10 its middle, +0x28 and +0x38 its bounce
and friction, +0x48 1 for a dome): the rim, 1800 across and 85° steep (a
sphere of 2664 whose middle is 1964 up, so the rim is at y = 0), and the
floor, inside 90% of it and 10° (a sphere of 18587; 222 deep in the middle).
Past the rim is the floor round it, the plane y = 0 (bounce and friction 0).
There are three sets: the play's, the reeling one's (bounce and friction 0)
and the losers' at the end (0.1 and 0.95). The ring is drawn as a picture
(image bank 223, 320 × 240, the whole screen: `0x8004D27C`), seen from
(0, 3878, 4979) towards (0, −300, 0), 40° up and 6500 away, with a fov of 30
(`0x86004840`).

**A step** (`0x86005CB4`, six a frame, each a sixth of the frame's time):
the players in the play (+0x1868) that aren't solid and aren't reeling
barely bounce off the others (`0x860086A4`: 0.1, and only they are moved
apart); each player's stick (`0x86005A00`: the Control Stick, or the D-pad's
64, 45 on a diagonal) or CPU, if it's on the ground (no higher than its
radius and 10) and in control, pushes it (`0x86007D98`: STICK POWER × the
stick × the step × its weight, at its middle); A pressed is a RAPID SPIN
(`0x860022F8`); then each against the ring (`0x86008F4C`, `0x86008D2C`: the
floor's sphere, then the rim's past the floor's edge; or the floor round it);
then the solid pairs bump (`0x8600853C`); then each moves (`0x86009674`:
gravity, its pushes, its top speed, and its spin). **A bump** between two
balls closer than their radii and 1 (`0x86008038`): a push along the line
between them, −(1 + bounce) × their closing speed / (the step × (1/m₁ + 1/m₂
+ r₁²/I₁ + r₂²/I₂)), at least MIN BOUND, and they're put just touching; the
bounce is BOUND FACTOR, IMPACT BOUND FACTOR if one is in a RAPID SPIN, IMPACT
IMPACT BOUND if both. Against the ring (`0x86008BB4`): a push of −(1 +
bounce) × its speed into it × its weight / the step, and a rub of friction ×
that along the way it slides (its spin counts: each frame starts with none,
and coming in it has 27 about y), and it's put back on the surface.

**A Hitmontop's states** (`0x86003EFC`; each frame, `0x860033E8`): 0
waiting outside the ring; 1 crouched (0.35 s; A jumps at once), placed on the
floor at its corner (`0x86001FCC`: at its angle, 1960 out; the players'
corners, `0x8600D1C8`: 1P top left, 2P top right, 3P bottom left, 4P bottom
right) and launched in (800 in, 4000 up: the floor under it takes the 4000
back, so it slides in); 2 in the play but not solid for 1.4 s, then till no
one is within 50 of touching; 3 in the ring; 4 knocked out (`0x86003B10`:
past the rim; a point to whoever hit it last, if that was within a second and
they're in the ring, 0x0F04), landing on the floor (moving down under 100 and
no higher than its radius and 10: stopped), 1.4 s there, then back to 1; 5
and 6 a winner (driven to its spot, `0x86000AE0`, then standing); 7 and 8 a
loser (8: three times as big, slowing ×0.4 a frame). **A RAPID SPIN**
(`0x860022F8`, 0x4F02): only in the ring, charged and not reeling; for 0.4 s
it weighs 500 and can't be hurt, then recharges for 1.5 s. **A bump** in the
play (`0x86003868`, at each step they touch): each counts as hit by the other
(for a point, for a second) and, if it isn't in a RAPID SPIN, reels: out of
control, weighing 25 and as fast as 10000, for 0.5 s; for 1.2 s if the other
was in one, and then the ring under it has no friction or bounce. Its sound
by the push: over 700000 0x4F03, 2000000 0x4F07, 8000000 with a RAPID SPIN
0x4F04.

**The end** (`0x86005434`): someone has 5 points, the minute's up, or three
are out of it for good (never, with DAMAGE TO DEATH off). All with the same
points: nobody wins (all 8). Else those with the most win (6: those out of the
ring jump back in at once) and go to their spots, side by side 30° apart in
front, 1170 out (`0x86005740`); the others lose (8, then 7).

**The CPUs** (`0x8600062C`, a step at a time; their parts by level and by
where they stand among the CPUs, best first: `0x860076EC`, `0x8600D2CC`,
`0x8600D800`): a RAPID SPIN when another (people, CPUs, as the part says) is
about to touch it within 0.08 s (`0x86000170`: where they'll be nearest, going
as they go), wrong a part's chance a step (0-4%); in its part's share of the
floor, at whoever comes nearest within 0.3 s (or 0.02), aiming at the side of
them nearer the middle, with the part's push (20-60 of the stick's 64)
(`0x8600050C`); recharging, away from whoever's coming; past its share,
back to the middle. Its "lowest scorer" pick (`0x860003DC`) never picks
anyone: it wants fewer than 0 points.

**What's drawn** (`0x86006F20`): the picture; each Hitmontop at its ball's
bottom (scale radius/200), leaning on the ring and the way it's pushed (half
way a frame), spun about its up; its shadow on the ring under it (079); its
ring (195-198, its player's) round its top while it spins and recharges,
shrinking from 6 to 1.5 and growing to 5.5 for the last 0.4 s
(`0x86001DCC`); a red tint reeling from a RAPID SPIN; a glow (image bank
151, Barrier Ball's) trailing it while it reels or flies out, in its hitter's
colour (`0x86000C6C`, `0x86000CCC`: its last 10 places); the sparks of a bump
(199, and 200 with a RAPID SPIN: `0x86005B3C`); each player's points by its
badge, a dot in the colour of each one it knocked out (image bank 401: grey,
then 1P-4P; `0x8600AE6C`); the clock, whole seconds, in a balloon (401) in a
swirl (402) at the top (`0x8600B474`). The song is 33 (sequence 72), from
GO; in the last 30 s it speeds up (`0x80028108(4)`: a beat a minute every
30 frames, to 15); the shared count sounds at 3, 2 and 1 seconds and 0xCF06
at 0 ([audio.md](audio.md)). Its name banner is image bank 400. Hitmontop's
clips (`0x8600D540`, played in sequences, `0x8600D5DC`-`0x8600D61C`): 0
spinning, 1 a RAPID SPIN, 7 hit, 6 hopping into a spin, 8 landing on its
feet, 3 standing sadly, 4 and 5 standing, 9 a cheer, 11 and 12 falling over.

**The states** (`0x86006D64`): 0 and 1 the instructions (a show of four
Hitmontop rolling on a tilted floor, `0x860057D0`), 2 the countdown, 3 the
play, 4 the end, 5 and 6 the results and the menu after.

The browser remake runs this world on every device and on the server, from
everyone's pads (the CPUs think in it) ([web/README.md](../web/README.md#topsy-turvy)).

## Furret's Frolic

Module #50 (ROM `0x266DC0`, linked at `0x86200000`; code to `0x8030`, data
from `0x8030`, constants and strings from `0xDFA0`) was read with `m2c` on a
`spimdisasm` listing, checked against the instructions for the order of each
sum, and the remake (`web/minigames/src/furret/`) plays by its rules. Like
Gutsy Golbat and Barrier Ball it runs on module #64's framework (`0x87F00000`:
object pools, the countdown, the results) and module #65's vector helpers
(`0x87D005E8` divides x, y, z by their length and returns it, `0x87D0059C`
the same for x, z); `0x87C03B60` (module #48) only works out where on the
screen a ball or a Furret is, for its sound. The world is W (`0x8620E1A0`; a
pointer to it at `0x8620E198`): the tuning from +0, the camera at +0x70 (+0
the eye, +0xC where it looks, +0x18 how far, +0x1C and +0x1E its pitch and
yaw), the state at +0xE8, the menu's data at +0xF4 (+0x2180 the mode, +0x2181
the COM level, +0x2182 a bit per person), the balls at +0x174 (a pool of 128;
each one's own record at +0xC788 + 0x4C·i: +0 where it was a step ago, +0xC
the push on it, +0x18 the shove out of others, +0x24 a tail's, +0x30 its
points, +0x34 its size, +0x3C where it was at the frame's start, +0x48 how far
it went in the frame), the shadows at +0xED88 (1024, a frame each), the field
at +0x71D9C (3), the Furret at +0x72264 (4; each one's record: +0 its player,
+4 its spot, +8 the spot it's hopping to, +0xC its tail's tip, +0x1A its cries
at the end), the labels over them from +0x728C0, the clock at +0x73BAC
(frames), the spawn counter at +0x73BB0, where the next balls drop at +0x73BB4,
the players from +0x73BBC (0x18 each: +0 who and how it did, +4 its points,
+8 a CPU's timer, +0xC its skill, +0x10 the buttons it holds, +0x13 its state,
+0x16 its goal). The instructions (text 50.1): "Press the + Control Pad to
move into the grass. Release it to move back to the center. Press the A
Button to shoot the ball forward. Get the most points to win."

**Its tuning** (a debug menu, the values set at `0x86202C14`, the names among
the module's strings): GRAVITY −120, SP DEC 0.97 (0.963 at 50 Hz), F_BOUND
0.6, PHYSICS 3 (steps a frame), SHOT_PW 660, SPD MX 2700 (the speeds over the
TV's rate: 60 on NTSC, so −2, 11 and 45 a step), EGGS 1 (balls at once, to
start with), EGG SIZE 0.8, SO POS 1.5, SO SC 1, OPERATION 2 (the D-pad as
described; 0, 1 and 3 other controls), the camera (CAM LOK X/Y/Z, DIST, AG_X,
AG_Y) and SHUFFLE 0 (off: shuffling the goals). The names (EGGS, EGG SIZE)
and two unused models in the module's data, a beach ball and a small
diamond of a field (geo layouts `0x8620C644` and `0x8620B564`, which nothing
points to), suggest it began with eggs. The clock is a minute (`0x86202AC4`:
the TV's rate / 2 × 60 frames).

**The field** is drawn by object 155 (its three layouts at the middle: the
field, a 3 × 3 grid of hollows with a checkered lane out of each side and
ramps with boards in the corners, its shadows, its boards), and the balls
roll on the module's own mesh (`0x8620DF60`: four pieces of 38 triangles,
wedges round the axes, their corners whole numbers; each triangle's plane
worked out at the start, `0x862005B4`, with the main program's
`0x800359D0` and `0x80035AF0`). Its callback that would draw the mesh
(`0x86200344`) is in a geo layout nothing uses. The hollows' bottoms are 46
down, the lanes slope away from 75 to −128, the ramps are 336 high at the
corners. Each player's goal is a lane: past the line through (0, −1200) and
(−1200, 0) with x ≤ 0 and z < 0, goal 0 (yellow, at the top of the game's
view); goal 1 (green, x > 0, z ≤ 0) on the right, goal 2 (red, x < 0, z ≥ 0)
on the left, goal 3 (blue) at the bottom (`0x862017F8`, `0x86201790`). 1P's
is goal 3, 2P's 1, 3P's 2, 4P's 0 (`0x862028F0`). The camera looks from 2708
away at (56, 47, 56), 0x2000 round (45°) and 0x23E1 down (50.5°:
`0x87F0C094`), with a fov of 30; the frame is cleared to `0xA579` (165, 173,
231, a light blue); two lights, white and grey, at angles from the camera's
(`0x86200794`, `0x862007FC`), and grey all round (0xA0).

**The balls** (`0x86204A9C`, each frame): a counter goes to 11, then, with
fewer balls than wanted and time left, one comes: its points by (a random
number % 34) × the balls wanted, 81 and over a Master Ball (5 points), 61 an
Ultra Ball (3), 41 a Great Ball (2), else a Poké Ball (1). The balls wanted
start at 1 and go up by one each third of the minute (2 from 20 s in, 3 from
40 s). A ball (`0x86201E70`) drops in at 700 above a ramp: (950, 0), (−950,
0), (0, 950), (0, −950), in an order shuffled every four (`0x8620169C`); its
size 1, 1.5, 2 or 2.5 by its points (its radius 0.8 × 0.75 × 100 × that),
its top speed × 1, 0.95, 0.9 or 0.8. **A step** (`0x86203C58`, three a
frame): the Furret's and the balls' updates; with time left, the tails
against the balls (`0x86205A7C`); the balls against each other
(`0x86202574`) and against the field (`0x862025E0`). A ball's update
(`0x86201A58`): its pushes added to its speed, × 0.97, its speed cut to 45 ×
its kind's if over, then on by what it was shoved and its speed; gravity −2
is the push for the next step; over a goal's line (with time left, once) its
points to that goal's player (0xBF02); below −200 it's gone; after the time's
up it fades out. Two balls closer than their radii (`0x8620218C`) trade a
tenth of their speed towards each other and are shoved apart, half each.
Against the field (`0x86201300`, `0x86200C30`, each triangle of the piece
under it): through a triangle along the way it moved (a radius further each
end), or within its radius of it, of an edge or of a corner, it's pushed out
and its speed into it turned: −1.2 × its speed along the normal, averaged
over the triangles it touched (0xBF03 if it went in deeper than 0.04 of its
radius and moved more than 55 that frame).

**The Furret** (`0x86206334`) stand on five spots (`0x86208F28`): the middle
hollow and those at (±282.84, ±282.84), each 135 behind its spot from its
goal (`0x862055F0`: 18 × 5 × SO SC × SO POS), facing it; they start on the
spot across the middle from their goal, popping up (clip 0) through the
countdown, and can move once they're standing (clip 1). The D-pad (`0x862070B0`,
`0x86206EF8`: left, then right, up, down; none the middle) picks a spot:
D-right the hollow on the screen's right, (282.84, −282.84), and so on. To a
new spot it hops (`0x86205C8C`: clip 5, then on its last frame it's there and
lands, clip 6). **A**, at least 27 steps after the last swing
(`0x86205B8C`, 0xBF00): a swing (clip 2 from frame 5), staying on its spot
(a hop's called off); in the swing's first 6 frames the D-pad puts it on
another spot at once, once. Its tail's tip is where it stands plus a table
(`0x862090C0`, clip 2's frames 4-28; up to 153 high). While it swings (27
steps), a ball within 108.5 of the tip and its radius (`0x8620581C`) is
shoved out of its reach; the first one it touches in the swing's first 8
steps is batted (0xBF01): 2 × 11 towards its goal and 11 × 4.25 up, and none
of its speed left the other way (`0x8620573C`, `0x862057A8`); the rest have
their speed into the tail taken away.

**The CPUs** (`0x86206D20`, `0x86206C34`) get a skill each (`0x862026C8`: by
the COM level the list 1, 1, 0, 0 on Easy, 2, 2, 1, 0 on Normal, 3, 3, 3, 2
on Hard, shuffled among the CPUs, the first ones theirs). Each frame, by skill
(0-3): a wait of 40-80, 17-34, 15-30 or 12-24 frames; a rank of 1st-3rd,
1st-2nd, 1st or 1st; a least worth of 0, 0.7, 0.85 or 0.9; and a delay before
the swing of 0-30, 0-12, 0-5 or 0-3 frames (all drawn anew each frame). Past
its wait it picks a spot (`0x86206920`): for each spot, each ball its tail
would reach there at the swing's start, how much the bat and the ball's speed
would send it its goal's way (across the ground, a unit long) × its points,
the best of them; the spots shuffled a little and sorted, and the one of its
rank, if it's worth more than its least; else the middle, and it tries again
next frame. It holds the spot, and after its delay swings.

**The end** (`0x8620392C`): the most points win; all four level, nobody.
The winners hop back to the middle and, once all of them are there, cheer
(layout 1, clip 3; a cry, 0xBF04, at its frame 69, twice); the others sulk
(layout 1, clip 4; `0x86205F34`, `0x86203DE8`). The camera moves over 60
frames to 1400 away and 45° down, looking past the middle, and then goes round
(`0x86203D50`: 0x2E a frame).

**What's drawn**: the field; the Furret (scale 0.4); each ball (object 153's
layout by its points, scale 0.6 × its size), rolling, and its shadow (image
bank 307's dot, black at 128) on the field under it (`0x86201620`); each
player's label (image bank 260: 1P-4P, or COM) above its Furret's tail
(`0x86205500`); each player's badge (image bank 434) over its goal, on the
field's attachments 1-4, tilted to the camera (`0x86207874`); at the top the
badges and points (`0x862040AC`: digits in each player's colours), and at the
bottom right the seconds left (rounded up). The song is 47 (sequence 86), from
GO (`0x86204F20`); in the last 30 s it speeds up (`0x80028108(11)`: a beat a
minute faster every 15 frames, to 30); the count is Pichu's Power Plant's
(0x2F00, 0x2F01), and the last three seconds the shared one (0xCF00, 0xCF06 at
0). Its name banner is image bank 405. Furret's clips (object 142): 0 popping
up, 1 standing, 2 a swing, 3 a cheer, 4 sulking, 5 a hop and 6 landing (5 and
6 held at their ends). The instructions' show (states 1 and 2) has a small
Furret in a bush (183) for each player.

**The states** (`0x86204FEC`): 0 and 1 the instructions, 2 the fade in (the
Furret pop up), 3 the countdown (`0x87F006BC`: 4 s, GO at its last), 4 the
play, 5 the end, 6 and 7 the results and the menu after.

The browser remake runs this world on every device and on the server, from
everyone's pads (the CPUs think in it) ([web/README.md](../web/README.md#furrets-frolic)).

## How this was found

1. **Find the loader.** Scanning the code modules for `jal` targets that
   receive Eager Eevee's fruit numbers as `a0` constants turned up
   `0x8004DED4` in the main program. Every other minigame module calls it
   too.
2. **Read every call.** For each `jal 0x8004DED4` in a module, take `a0`
   from the delay slot (`addiu a0, zero, N`) or trace it back through
   `or a0, rX, zero` to `addiu rX, zero, N`. Egg Emergency (#56), for
   example:

   ```
   addiu fp, zero, 144        ; Chansey
   sw    fp, 0(v1)
   jal   0x8004DED4
   or    a0, fp, zero
   jal   0x8004DED4
   addiu a0, zero, 145        ; egg (delay slot)
   jal   0x8004DED4
   addiu a0, zero, 185
   ```

3. **Player characters** are loaded with a register value, not a constant.
   The constants sit a few instructions earlier, where the selection code
   picks by species, e.g. `addiu t4, zero, 179` / `addiu t3, zero, 122`
   (Scizor / Scyther) in Clear Cut Challenge. Searching each module for
   `addiu rX, zero, N` with the candidate numbers finds them.
4. **Which module is which minigame** follows from what it loads (Chansey →
   Egg Emergency). The result is cross-checked by the 12 modules running in
   consecutive slots `0x86000000`–`0x86B00000`, and against Serebii's rosters.

Modules #57, #58, #63 and #67 also load objects but aren't minigames
([objects.md](objects.md)). Topsy-Turvy loads most of its objects through a
list (`0x80071B20`), which a search for `0x8004DED4` misses. Module #48
(`0x87C00000`) is a library Topsy-Turvy's code uses: vectors and quaternions
in doubles, and a clip player. #62 (`0x86C00000`, 0x460 bytes) sits right after
the minigame slots and loads nothing (*unknown*).
