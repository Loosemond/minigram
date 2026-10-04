# 2D graphics and text

Code: `ps2tool/images.py`, `ps2tool/text.py`.

## Image archives

| Offset | Records | Format |
|---|---|---|
| `0x1898000` | 456 | **image banks** (menus, HUD, minigame sprites, Pokédex art…). Each record is u32 count + count pointers (`0x8FF00000`-based). Each image has an 8-byte descriptor right before its texels: u16 width, u16 height, u8 format, u8 size. CI images are followed by their 16-bit palette. 1,836 images in all |
| `0x1E70000` | 48 | **backgrounds**: `"PRESJPEG"`, a 16-byte header, then a normal JPEG |
| `0x2230000` | 59 | **Pokémon Academy screens**, the same `PRESJPEG` format |
| `0x2268000` | 67 | **trainer faces**: u32 count + count offsets per record, with the same 8-byte descriptor before each image (158 faces) |
| `0x258D000` | 279 | **Pokémon icons**, 40×40 RGBA16: record i is species i + 1 (0 Bulbasaur … 250 Celebi; the game asks for one by national dex number), then eggs; extracted as `icon_NNN_<name>` by species |
| `0x2675000` | 9 | more 40×40 RGBA16 icons |

Texture formats are the N64 ones listed in [fragments.md](fragments.md).

**Bank and face images are stored row-swapped**, the way TMEM holds a texture
after a `LoadBlock`: in every odd row the 32-bit words are swapped in pairs
(64-bit words for 32-bit texels). Read plainly, they show a striped, combed
pattern. `images.py` undoes the swap (`_unswap`). How this was found: the
Egg Emergency HUD digits (banks 404 and 429) came out combed. Undoing the swap
made rows smoother in all 1,742 bank images and 158 faces where it makes any
difference (76 bank images look the same either way; none looked better
unswapped). The 40×40 icons are stored plainly and are left alone.

## UI layouts

The archive at `0x1E40000` (234 records, not Yay0) holds screens built from
pieces: each record is a `ROOT` and a 640 × 480 container, then elements
(0001 and 0002 push and pop a level; a child's x and y are relative to its
parent), each with a four-letter name the game's code finds it by
(`0x87F0A688` sets an image element's picture, `0x87F0A6C8` its colours):

| Type | Element |
|---|---|
| `0x12` | an image: name, x, y, w, h, image bank, image |
| `0x11` | a box (52 bytes): x, y, w, h, a border, four corner images, border and fill colours |
| `0x13` | a window (36 bytes) |

Streaming Stampede's question board and cards are records 125-133
([minigames.md](minigames.md#streaming-stampede)). The layouts aren't
converted; their animation (how a board comes and goes) isn't read.

## Text

**Archive** `0x1D70000`: 331 records, each a string table (21,610 strings):

```
u32 count, u32 offset[count] (from the record start), NUL-terminated Latin-1 strings
```

The markup is plain text inside the strings:

| Markup | Meaning |
|---|---|
| `<COL1,PUSH,r,g,b,a>` … `<COL1,POP>` | text colour (also `COL2`) |
| `<FACE,face,expression>` | trainer portrait shown with the line |
| `<LINE,n>`, `<DIST,n>`, `<FONT,…>` | layout and font controls (exact effect *unknown*) |
| `<WAZA,…>` | move reference (*waza* = move) |
| `#nn` | placeholder filled at run time (e.g. `#01P` player number, `#20` in "#20's ROOM") |
| `\n` | line break |

### Notable tables

| Table | Contents |
|---|---|
| 0 | Pokémon names (253: 251 species + extras) |
| 1–5 | categories ("SEED"), heights, weights, Pokédex entries (two parts) |
| 6, 7 | move names, move descriptions |
| 8–11 | item names and descriptions |
| 12 | type names |
| 18 | Johto badge names (first 8), then battle UI strings |
| 46 | cup names (Little, Poké, Challenge, Prime Cup) and their level rules |
| 49 | gym, city and tower names ("PEWTER GYM", "TO GIOVANNI's TOWER"…) |
| 50 | minigame instructions (0–11) and control labels ([minigames.md](minigames.md)) |
| 52 | trade service (Game Pak trading) |
| 55 | Earl's Pokémon Academy lessons |
| 57 | academy quizzes; minigame names at 617–628 and their quiz hints at 659–670 |
| 58 | Pokémon quiz |
| 59 | library (Pokémon, moves, type match-ups, items, egg groups) |
| 60 | My Room: its menus and the room decoration names |
| 66 | a leftover debug menu: Model Viewer, Screen Viewer, POKéMON Editor, GB-SRAM Editor, AI Editor, Music Room… |
| 70, 71 | Pokémon names split in two, the capitalised part marking one half ("BULBAsaur" / "bulbaSAUR") |
| 76–330 | trainer dialogue, mostly 40 lines per trainer; `<FACE,…>` selects the portrait |

`out/text/all_text.txt` lists every string as `[table.index]`, and
`out/text/index.json` indexes the tables.
