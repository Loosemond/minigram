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
| `0x449840` | region-map archive (first asset archive) |
| `0x47D690`… `0x3FD5000` | asset archives, table below |
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
| `0x1E40000` | 234 | records all starting `000F0100` | *unknown* |
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
| 79 | `0x36FC10` | `0x84100000` | battle effect engine ([effects.md](effects.md)) |

To find module N: search the code region for `FRAGMENT` (at +8 of every
module) and take the Nth hit. Its size is the u32 at +0x18.

### Known main-program functions

| VRAM | Does |
|---|---|
| `0x8004DED4` | load an object from the objects table; `a0` = object number |
| `0x8004DFF8` | used on the same objects right after it; `a1` = object number (*purpose unknown*) |
