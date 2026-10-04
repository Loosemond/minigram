# ROM map

## Identification

| Release | MD5 | Notes |
|---|---|---|
| Europe (English) | `b1271db50d6ef8f6b53cc640c3743e4f` | game code `NP3P`; the one in `rom/`, all testing done on it |
| USA | `1561c75d11cedf356a8ddb1a4a5f9d5d` | the table offsets below match the US-based research, but the extractor was only tested on the EU ROM |

The internal title (header +0x20) contains `POKEMON STADIUM 2`. Dumps come in
three byte orders; `ps2tool/rom.py` normalises them to big-endian:

| Magic (first 4 bytes) | Format |
|---|---|
| `80 37 12 40` | `.z64`, big-endian (native) |
| `37 80 40 12` | `.v64`, 16-bit byte-swapped |
| `40 12 37 80` | `.n64`, 32-bit word-swapped |

## Layout

| ROM range | Contents |
|---|---|
| `0x000000`–`0x001000` | N64 header and boot code |
| `0x001000`–`0x0A8BE0` | main program (runs at `0x80000000`), including the object loader `0x8004DED4` |
| `0x0A8BE0`–`0x437990` | 88 code modules (FRAGMENT overlays), see below |
| `0x437AD0` | fonts (not converted) |
| `0x449840`, `0x47D690`, `0x493410` | first asset archives (table below) |
| `0x49B780`–`0x1606000` | audio, ~17 MB: soundfonts from `0x4AD7D0`, sample banks from `0x50FB60`, sequences `0x14D69E0`–`0x154F530`; the tables are in the main program at `0x86AC0` ([audio.md](audio.md)) |
| `0x1638000`–`0x3FD5000` | the other asset archives (table below) |
| `0x3FED000` | species metadata: 16 bytes per species (not an archive) |

## Asset archives

Every archive found by scanning the ROM for the archive header. "Decoded"
means the extractor reads it.

| Offset | Records | Contents | Decoded by |
|---|---|---|---|
| `0x0449840` | 3 | FRAGMENT: region maps (Johto, Johto around Mt. Silver, Kanto) | `ps2extract.py` (`stages`) |
| `0x047D690` | 598 | small records, first words `0x80000039` / `0x8000003A` | *unknown* |
| `0x0493410` | 4 | empty records | *unknown* |
| `0x1638000` | 30 | FRAGMENT: battle arenas ([arenas.md](arenas.md)) | `ps2extract.py` |
| `0x1708000` | 72 | records starting `01000000`, `08000000`, `03000000`… | *unknown* |
| `0x1718000` | 279 | battle motion dispatch, one per species ([animation.md](animation.md)) | `clips.py` |
| `0x1898000` | 456 | image banks: menus, HUD, minigame sprites | `images.py` |
| `0x1D70000` | 331 | string tables ([images-and-text.md](images-and-text.md)) | `text.py` |
| `0x1E40000` | 234 | UI layouts: screens of images, boxes and windows on a 640 × 480 grid ([images-and-text.md](images-and-text.md#ui-layouts)) | not converted |
| `0x1E70000` | 48 | `PRESJPEG` background pictures | `images.py` |
| `0x2000000` | 227 | FRAGMENT: general 3D objects ([objects.md](objects.md)) | `objects.py` |
| `0x2230000` | 59 | `PRESJPEG` Pokémon Academy screens | `images.py` |
| `0x2268000` | 67 | trainer faces | `images.py` |
| `0x258D000` | 279 | Pokémon icons, 40×40 RGBA16 | `images.py` |
| `0x266B000` | 279 | mostly empty; 8 icon-like records | *unknown* |
| `0x2675000` | 9 | more icons, 40×40 RGBA16 | `images.py` |
| `0x267D000` | 131 | FRAGMENT: battle effect resources ([effects.md](effects.md)) | `effects.py` |
| `0x27ED000` | 282 | FRAGMENT: Pokémon models, record N = species N ([pokemon.md](pokemon.md)) | `ps2extract.py` |
| `0x2D7D000` | 282 | Pokémon pose banks (skeletal clips) | `ps2extract.py` |
| `0x3FD5000` | 282 | dedicated shiny texture sets | `shiny.py` |

All five model archives (region maps, arenas, objects, effects, Pokémon) are
decoded. Minigames have no model archive of their own: their models are in
the objects table.

## Archive format

```
header   u32 tag (0 or 0xEF), u32 0, u32 total size, u32 record count
records  count x { u32 offset (from the archive start), u32 size, u32 0, u32 0 }
```

A record of size 0 is empty. Record data may be compressed, and pose banks
nest archives inside records.

## Compression

- **Yay0**: `"Yay0"`, u32 decompressed size, u32 link-table offset, u32
  chunk offset, then 32-bit mask words. Mask bit 1 copies one byte from the
  chunk stream. Mask bit 0 reads a u16 link: distance `(link & 0xFFF) + 1`,
  length `link >> 12`. Length 0 means the next chunk byte + 0x12; otherwise
  the length is +2.
- **PERS-SZP**: `"PERS-SZP"`, u32 at +8 = offset of a Yay0 stream inside the
  record.

## Code modules

88 relocatable FRAGMENT modules sit back to back from `0x0A8BE0` (same header
as the asset modules, see [fragments.md](fragments.md)). The first word of
each is a MIPS `j` into its code; the target gives the module's VRAM. Each
module owns a 1 MB slot.

| # | ROM | VRAM | Role |
|---|---|---|---|
| 26 | `0x15EA20` | `0x81000000` | render callbacks used by models: fire card `0x81000038`, material callbacks `0x81000138` / `0x81000140` / `0x81000148` |
| 47, 49–56, 59–61 | `0x2469A0`–`0x2F32D0` | `0x86000000`–`0x86B00000` | the 12 minigames, in 12 consecutive slots ([minigames.md](minigames.md)); #48, #57 and #58 in between run elsewhere |
| 62 | `0x303890` | `0x86C00000` | tiny module next to the minigames (*unknown*) |
| 63 | `0x303CF0` | `0x87E00000` | the Mini-Game Park's menus: it writes the COM level (Easy 1, Normal 2, Hard 3) the minigames read |
| 64 | `0x322FF0` | `0x87F00000` | code the minigames share: their countdown, and more (*by usage*) |
| 79 | `0x36FC10` | `0x84100000` | battle effect engine ([effects.md](effects.md)) |

To find module N: search the code region for `FRAGMENT` (at +8 of every
module) and take the Nth hit. Its size is the u32 at +0x18.

### Resources

The main program finds its archives through a table of 19 ROM addresses (ROM
`0x4379A0`, copied to `0x80124E60` at boot: `0x80035700`), and keeps the open
ones at `*0x80097280` (+0x1C resource 3, +0x20 13, +0x24 12…). By index:

| # | ROM | | # | ROM |
|---|---|---|---|---|
| 0 | `0x1718000` battle motion dispatch | | 10 | `0x3FED000` species metadata |
| 1 | `0x1898000` image banks | | 11 | `0x1708000` |
| 2 | `0x1D70000` string tables | | 12 | `0x2000000` objects |
| 3 | `0x1E40000` UI layouts | | 13 | `0x2230000` Academy screens |
| 4 | `0x258D000` Pokémon icons | | 14 | `0x3FD5000` shiny textures |
| 5 | `0x267D000` battle effect resources | | 15 | `0x2268000` trainer faces |
| 6 | `0x27ED000` Pokémon models | | 16 | `0x1638000` arenas |
| 7 | `0x2D7D000` pose banks | | 17 | `0x266B000` |
| 8 | `0x1E70000` background pictures | | 18 | `0x2675000` more icons |
| 9 | `0x23A5000` | | | |

The main program runs from ROM `0x1000` at `0x80000400` (so VRAM = ROM +
`0x7FFFF400`).

### Known main-program functions

| VRAM | Does |
|---|---|
| `0x8004DED4` | load an object from the objects table; `a0` = object number |
| `0x8004DD4C` | load UI layout `a0` (`0x1E40000`); `0x8004DDDC` gets it ready to draw (Streaming Stampede passes 125-133) |
| `0x800357AC` | the ROM address of resource `a0` (0-18), from a table the boot code copies from ROM `0x4379A0` (below) |
| `0x8004DFF8` | used on the same objects right after it; `a1` = object number (*purpose unknown*) |
| `0x8004D770` | show background picture `a0` from `0x1E70000`. Eager Eevee passes 44 (its round rainbow field) and Egg Emergency 19 (its building) |
| `0x8004CA70` | load image bank `a0` from `0x1898000` (`a1` = image, *by usage*); every minigame passes its HUD banks, e.g. 434 (player badges) |
| `0x8004C9A0` | called with the same banks as `0x8004CA70`, presumably to free them (*unverified*) |
| `0x800357EC` | random number: `x = x · 1664525 + 1013904223` (state at `0x80124EB0`) |
| `0x8007B100` | random number: `x = ((4x + 2)(4x + 3) mod 2³²) / 4` (state at `0x800A1590`) |
| `0x80001FC0` | the TV's rate: 50 on PAL, 60 on NTSC (from `osTvType`); the minigames scale their speeds by 1.2 on PAL |
| `0x800279B4`, `0x80027764`, `0x80027A18` | play sound effect `a0` (centred; with pan `a1`; panned to player `a1`) ([audio.md](audio.md)) |
| `0x80021EC8`, `0x800225B4` | play song `a0`; fade it out over `a0` frames ([audio.md](audio.md)) |
