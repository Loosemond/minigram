# The objects table

`0x2000000`: 227 FRAGMENT model modules (the same model descriptor as
Pokémon, [fragments.md](fragments.md)). The descriptor's u16 id is the record
number. A record can hold several geo layouts, which are variants: record 153
= Poké, Great, Ultra and Master Ball, record 108 = Donphan walking and
rolling. Objects keep their animation clips inside the module. The extractor
writes 245 models from the 227 records. Code: `ps2tool/objects.py`, names in
`ps2tool/names.py`.

## What is in it

| Records | Contents | How it's known |
|---|---|---|
| 000–058 | mostly **room decorations** for My Room: dolls, big dolls, beds, posters, plants, consoles, carpets, walls (plus a few minigame characters: 052, 053, 055) | Names are the game's (text table 60), matched to models *by appearance* (`DECORATIONS` in `names.py`) |
| see [minigames.md](minigames.md) | **minigame characters and props** (118 models across the 12 minigames) | from the minigame code |
| 072–075 | trophies | *by appearance* |
| 083–087 | player signposts 4P, 3P, 1P, 2P, COM | *by appearance* |
| 088–099 | gift boxes (only 092 and 096 are loaded by a minigame) | *by appearance*, code |
| 153, 154 | Poké / Great / Ultra / Master Balls (4 layouts each) | *by appearance*, code |
| 156–165, 224–226 | TV screens showing N64/NES games (Wave Race 64, Super Mario 64, Super Mario Bros., Donkey Kong…) | *by appearance* |
| 169–178, 180–182, 184 | gifts and gadgets: Pikachu N64, GameCube, piano, ring, Snorlax, Game Boy, stocking, candy… | *by appearance*; Delibird's Delivery loads 169, 170, 174–177, 180, 181 and 184 |

Records drawn only by a render callback (sparkles, smoke, glows) show nothing
in a plain viewer and keep a number as their name.

## Who loads what

The main program's function `0x8004DED4` loads an object: `a0` = record
number. Callers usually pass a constant, which shows exactly which code
module uses which object ([minigames.md](minigames.md) has the method).
Outside the minigames:

| Code module | VRAM | Loads |
|---|---|---|
| #48 | `0x87C00000` | 152 (lid box) |
| #57 | `0x83300000` | 187, 189, 214, 217, 219 (the "Lab Room" set) |
| #58 | `0x83400000` | 217, 222 |
| #63 | `0x87E00000` | 152, 220, 221 |
| #67 | `0x82900000` | 166 |
| main program | `0x80000000` | 2 calls with a computed number |

What these modules are (menus, My Room, the Pokémon Lab…) is *unknown*.

The room decorations, trophies, signposts, TV screens and most gift boxes are
never loaded by a constant number. They are probably loaded from tables, for
example by My Room's decoration list.
