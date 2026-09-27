# FRAGMENT modules

Every model (Pokémon, object, arena, region map, effect resource) and every
code overlay is a relocatable "FRAGMENT" module. Code: `ps2tool/fragment.py`.

## Header

| Offset | Field |
|---|---|
| +0x00 | MIPS `j` into the module's code; its target's top 12 bits are the module's link address (`0x8FF00000` for every asset module) |
| +0x04 | `0` |
| +0x08 | `"FRAGMENT"` |
| +0x10 | u32 offset: `0x20` (code starts right after the header) or, in effect resource modules, the export table ([effects.md](effects.md)) |
| +0x14 | u32 offset of the relocation table |
| +0x18 | u32 file size |
| +0x1C | u32 memory size |

The loader applies the relocation table, then zero-fills from the table's
start up to the memory size (BSS). Some models keep callback data in that
BSS. Pointers inside a module are stored already linked to its load address.
So for an asset module, `pointer - 0x8FF00000` is an offset into the file,
with no relocation needed.

## Entry code

The data starts from the module's entry code, so the extractor pattern-matches
it:

- **Model modules** (Pokémon, objects): somewhere in +0x20…+0x80 a
  `lui rX` / `addiu rX, rX` pair loads the model descriptor's address.
- **Arena and region-map modules**: `lui v1` at +0x3C and `addiu v0` at +0x44
  return the geo layout. `addiu`/`ori v1, zero, imm` at +0x30 returns the
  background colour as an RGBA5551 constant (the entry point's selector 1).
  See [arenas.md](arenas.md).

## Model descriptor

| Offset | Field |
|---|---|
| +0x00 | u16 id: the species number (Pokémon) or record number (objects) |
| +0x08 | pointer → NULL-terminated list of geo layouts. Objects use several for variants, e.g. record 153 = Poké, Great, Ultra, Master Ball |
| +0x0C | pointer → list of skeletal clips kept inside the module (objects; Pokémon use pose banks instead) |
| +0x10 | pointer → list of texture (face) clips |

## Geo layout

A byte-coded scene graph. Each command has a fixed size by its first byte:

| Cmd | Size | Meaning |
|---|---|---|
| 0x00, 0x03 | 8 | call a sub-layout (pointer +4) |
| 0x01, 0x04 | 4 | end / return |
| 0x02 | 8 | jump (pointer +4) |
| 0x05 / 0x06 | 4 | push / pop the current joint |
| 0x08 | 0xC | render callback: u32 handler +4, pointer argument +8 (below) |
| 0x17 | 0x14 | texture tables: s16 texture count +2, s16 TLUT count +4, pointer texture table +8, pointer TLUT table +0xC |
| 0x18 | 8 | attachment point, label 100 |
| 0x1C | 0x10 | root scale: 3 × s32 16.16 at +4 |
| 0x1D | 0x1C | joint: u8 id +1, u8 flags +2, s8 animation channel +3, s16 translation ×3 +4, s16 rotation ×3 +0xA (binary angles, 65536 = 360°), s32 16.16 scale ×3 +0x10 |
| 0x1E | 8 | draw a display list (+4) on the joint with id s16 +2, which may be defined later |
| 0x1F | 0x18 | arena static transform: s16 rotation in degrees ×3 +4, s16 translation ×3 +0xA, s16 scale in percent ×3 +0x10 |
| 0x20 | 0x14 | draw display list (pointer +0x10) |
| 0x21 | 0x10 | draw display list (pointer +0xC) |
| 0x22 | 8 | draw display list (pointer +4) in render layer u8 +1 (arenas: 1 opaque, 4 alpha-tested, 5+ translucent) |
| 0x23 | 0x10 | material state: s16 texture-animation channel +2 (−1 none), pointer material display list +4, s16 texture index +8, s16 TLUT index +0xA, RGBA colour +0xC |
| 0x24 | 4 | attachment point, s16 label +2 |

Known sizes of the rest (skipped by the walker): 0x07 8, 0x09 4, 0x0A 8,
0x0B 0x18, 0x0C–0x16 4 each except 0x13 8, 0x14 0xC, 0x15 0xC, 0x19 8,
0x1A 4, 0x1B 0x10, 0x25 4, 0x26 0x14, 0x28 4, 0x29 4.

Attachment points (0x18, 0x24) are joints where the game attaches something
at run time. What each label means is *unknown*.

## Display lists

F3DEX2 microcode. The subset the models use:

| Op | Command | Notes |
|---|---|---|
| 0x01 | G_VTX | count = bits 12–19 of w0; first slot = `((w0 & 0xFFF) >> 1) − count`; 64-slot vertex buffer |
| 0x05 / 0x06 | G_TRI1 / G_TRI2 | vertex indices are stored ×2 |
| 0xD7 | G_TEXTURE | texture coordinate scale, u16 16.16 fractions in w1 |
| 0xD9 | G_GEOMETRYMODE | `mode = (mode & w0) \| w1` |
| 0xDE | G_DL | call, or jump when byte 1 of w0 is set |
| 0xDF | G_ENDDL | end |
| 0xF0 | G_LOADTLUT | palette size = `((w1 >> 14) & 0x3FF) + 1` |
| 0xF5 | G_SETTILE | tile 0: palette `(w1 >> 20) & 0xF`, clamp/mirror, mask, shift per axis |
| 0xFC | G_SETCOMBINE | colour combiner (materials) |
| 0xFD | G_SETTIMG | image / palette address |

Each model starts in geometry mode `G_LIGHTING | G_CULL_BACK` (`0x20400`),
and the mode carries over between display lists. A draw with `G_CULL_FRONT`
(`0x200`) but not `G_CULL_BACK` is inside-out, so its triangles are flipped.

**Vertex (16 bytes):** s16 x, y, z; u16 flag; s16 s, t; then three s8
normal components with lighting on (RGB colour with it off) and a u8 alpha.
Positions are in the space of the joint whose display list draws them.

## Textures

- **Texture table entry (12 bytes):** u8 format, u8 size, s16 width, u16
  height, 2 bytes padding, pointer to texels.
- **Palette table entry (12 bytes):** u16, u16 colour count, pointer to data,
  pointer to a load display list. That list's G_SETTIMG / G_LOADTLUT give the
  real address and count.

| Format | Sizes | Decoding |
|---|---|---|
| 0 RGBA | 16-bit (5551), 32-bit | |
| 2 CI | 4-bit, 8-bit | 16-bit RGBA5551 palette; CI4 palette *n* starts at +32·n bytes |
| 3 IA | 4 (3+1 bits), 8 (4+4), 16 (8+8) | grey + alpha |
| 4 I | 4, 8 | grey. The RDP also uses the intensity as alpha, and effects rely on that |

**Face channels.** Draws whose material state has a texture-animation channel
≥ 0 (eyes, mouths, cheek sparks) change texture every frame. The texture
clips choose which one ([animation.md](animation.md)).

## Render callbacks (geo 0x08)

Handlers live in code module #26 (VRAM `0x81000000`):

| Handler | What it draws |
|---|---|
| `0x81000038` | **fire card** (Charmander line, Magmar, Moltres): argument +8 = 8 frame pointers (IA16), drawn as 32×64 IA8 on a 100×200-unit billboard at the joint. Colour = lerp(environment, primitive, intensity). Magmar and Moltres use their own colours |
| `0x81000138`, `0x81000140`, `0x81000148` | **material callbacks** ("phase 5"): supply the texture and colours for the untextured geometry drawn after them. A draw uses the callback of the nearest joint up the tree. `0x81000140` takes its alpha from the model's live fade |

### Material block (argument of a material callback)

The argument points to two "items": `arg[0]` for TEXEL0, `arg[1]` for
TEXEL1.

```
item      +0  -> image config: +0 -> texels, +8 -> descriptor
                 descriptor: u8 fmt, siz, cms, cmt, masks, maskt, shifts, shiftt; u16 w, h
          +4  -> controller
          +8  -> colours: +0 -> combiner (16 selector bytes)
                          +4 -> primitive colour (RGBA + LOD fraction, 5 bytes)
                          +8 -> environment colour (RGBA)
          +C  -> RSP state: u32 geometry mode, u32 texture scale (two u16 fractions)

controller +0  s16 frames per flipbook image
          +2  s16 mode
          +4  -> scroll: s16 s, t, speed s, speed t (1/4 texel per frame), wrap w, h
          +8  -> colour track
          +C  -> texture table: u32 count, -> count texel pointers (flipbook frames)

colour track  u16 mode, u16 period, u16 key count, u16 -,
              +8 -> key times (u16), +C -> primitive keys (5 bytes), +10 -> environment keys (4 bytes)
              mode 0 / period 1 with one key = a static colour
```

When the colours block leaves the primitive or environment colour out, it
comes from the colour track.

**Colour combiner.** The 16 selector bytes are in ROM order: colour cycle 1
a, b, c, d, then alpha cycle 1, then colour cycle 2, then alpha cycle 2. The
result is `(a − b) × c + d`. A second cycle whose equations are all zero
means one cycle. `ps2tool/combiner.py` evaluates it on the CPU to bake
textures, and `arena.py` records it for the Blender add-on to rebuild live.
