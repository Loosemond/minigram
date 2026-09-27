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
number (Topsy-Turvy 33, Gutsy Golbat 13, …), maybe the music track
(*unverified*).

The browser remake in `web/egg-emergency/` is built on these findings,
with the backdrop rebuilt in 3D to the picture's measurements
([web/README.md](../web/README.md)).

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
