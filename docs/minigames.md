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
| Clear Cut Challenge | Scyther 122, Pinsir 055, Scizor 179 | signpost 059, log slices 081 and 111, cut line 112, effects 130 and 131, wall pieces 190 |
| Furret's Frolic | Furret 142, Girafarig 223 | Poké Balls 153, leaf pile / shards / chips 155, bush 183 |
| Barrier Ball | Mr. Mime 129, 218 | court pieces 120 (7 layouts), mesh panels 141, 146, Poké Balls 154 |
| Pichu's Power Plant | Pichu 107, Pikachu 201 | window 056, red orb lamp 057, wall pieces 190 |
| Rampage Rollout | Donphan 108 (walking, rolling) | track 113 (2 layouts) |
| Streaming Stampede | Cleffa 114, Igglybuff 119 and 205 | Hoppip 186, Game Paks 080 and 100–102, ramp 116, circus backdrop 117, books 118 |
| Tumbling Togepi | Togepi 109, Omanyte 206 | platform 060, flower patch 062, rocks 063–064, logs 065–067, pillars 068–070, course pieces 132–140, ice block 188, water 202 |
| Delibird's Delivery | Delibird 127 | Swinub 082 and 103, gift boxes 092 and 096, factory 147 and 148, gifts 169, 170, 174–177, 180, 181, 184 |
| Egg Emergency | Chansey 144 | egg 145, 185 |
| Eager Eevee | Eevee 143 | field 149, Aipom 150, Pineco 151, effects 203, 204, 207, fruit 209, 211, 213, 216 (and 208, 210, 212, 215 *by appearance*) |

Worth knowing:

- Several names came out of this: object 053, first named Zubat, is
  Golbat; "Striped Shell" 082/103 is Swinub; "Green Spiky Head" 151 is
  Pineco; and 145 is the egg.
- The appearance-based guesses before this were partly wrong. The grass/hill
  course pieces 132–140 are Tumbling Togepi's, not Furret's Frolic's. The
  "Lab Room" (189/214) isn't a minigame's. Only two of the twelve gift boxes
  are Delibird's.
- Other Pokémon in the minigames (per Serebii: Magnemite, Spinarak, Electrode,
  Diglett, Voltorb) are not in the objects table. Egg Emergency's Voltorb is a
  2D sprite (image bank 227, below); the others may be sprites too, or their
  battle models (*unverified*).
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
