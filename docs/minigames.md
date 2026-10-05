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
| Gutsy Golbat | Golbat 053 | Jynx 110 |
| Topsy-Turvy | Hitmontop 115 | (Hitmontop 052 and 123 *by appearance*: no code loads them by number) |
| Clear Cut Challenge | Scyther 122, Pinsir 055, Scizor 179 | signpost 059, log slices 081 and 111, cut line 112, effects 130 and 131, dizzy stars 190 |
| Furret's Frolic | Furret 142, Girafarig 223 | Poké Balls 153, leaf pile / shards / chips 155, bush 183 |
| Barrier Ball | Mr. Mime 129, 218 | court pieces 120 (7 layouts), mesh panels 141, 146, Poké Balls 154 |
| Pichu's Power Plant | Pichu 107, Pikachu 201 | the power plant's frame 056 (a window of four rooms by appearance before), the electrode lamps 057, dizzy stars 190 (wall pieces by appearance before) |
| Rampage Rollout | Donphan 108 (walking, rolling) | track 113 (2 layouts) |
| Streaming Stampede | Cleffa 114 (186 shiny), Igglybuff 119 (205 shiny) | the players' booths 080 and 100–102 (named Game Paks by appearance before), ramp 116, circus backdrop 117, books 118; the Pokémon that go by are sprites (image banks 201–220) |
| Tumbling Togepi | Togepi 109, Omanyte 206 | platform 060, flower patch 062, rocks 063–064, logs 065–067, pillars 068–070, course pieces 132–140, ice block 188, water 202 |
| Delibird's Delivery | Delibird 127 | Swinub 082 and 103, gift boxes 092 and 096, factory 147 and 148, gifts 169, 170, 174–177, 180, 181, 184 |
| Egg Emergency | Chansey 144 | egg 145, 185 |
| Eager Eevee | Eevee 143 | field 149, Aipom 150, Pineco 151, effects 203, 204, 207, fruit 209, 211, 213, 216 (and 208, 210, 212, 215 *by appearance*) |

Worth knowing:

- Several names came out of this: object 053, first named Zubat, is
  Golbat; "Striped Shell" 082/103 is Swinub; "Green Spiky Head" 151 is
  Pineco; 145 is the egg; and 186, named Hoppip by appearance, is a shiny
  Cleffa (green ears), as 205 is a shiny Igglybuff: Streaming Stampede's code
  loads them for a Game Pak's shiny Cleffa or Igglybuff.
- The appearance-based guesses before this were partly wrong. The grass/hill
  course pieces 132–140 are Tumbling Togepi's, not Furret's Frolic's. The
  "Lab Room" (189/214) isn't a minigame's. Only two of the twelve gift boxes
  are Delibird's.
- Other Pokémon in the minigames (per Serebii: Magnemite, Spinarak, Electrode,
  Diglett, Voltorb) are not in the objects table. They're 2D sprites in the
  image banks: Egg Emergency's Voltorb (bank 227, below), Clear Cut
  Challenge's Spinarak (397), and the Pokémon that go by in Streaming
  Stampede (201–220). The extractor names the banks whose use is known
  (`BANKS` in `tools/ps2tool/names.py`: `images/banks/bank_NNN_<name>/`).
- Why Gutsy Golbat loads Jynx is *unknown*.

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

Modules #48, #57, #58, #63 and #67 also load objects but aren't minigames
([objects.md](objects.md)). #62 (`0x86C00000`, 0x460 bytes) sits right after
the minigame slots and loads nothing (*unknown*).
