# Battle effects

Code: `ps2tool/effects.py`. Research basis: gen1recomp
`lib/stadium2_battle_fx_*.lua`.

## Resource modules (`0x267D000`, 131 FRAGMENT modules)

In these modules the u32 at +0x10 points to an **export table** of 8-byte
entries: u8 kind, pad, u16 symbol, u32 address. Kind 0 ends the table.

| Kind | Resource |
|---|---|
| 1 | raw data, mostly 32×32 I4 (512 bytes) or RGBA16 (2048 bytes) textures used by beams and waves |
| 2 | particle shape: u16 flags, u16 count, pointer → count × 16-byte entries (pointer to a material block, u16, u16 render state, pointer to a display list, u32). The material block is the same as a model's material callback ([fragments.md](fragments.md)): textures with flipbook frames, combiner, primitive and environment colours |
| 3 | compiled layout: a geo layout with joints (a skeletal effect model) |
| 4 | skeletal animation, encoded like Pokémon clips ([animation.md](animation.md)). A model uses the clips whose channel count matches its joints |

Module 0 is the common set every effect can use. Effect textures are often I
format with intensity as alpha, so glows fade out at the edges.

## The effect engine (code module #79)

ROM `0x36FC10`, VRAM `0x84100000`. Effect IDs 1–251 are the moves. IDs
252–301 are other battle effects.

| VRAM | Table |
|---|---|
| `0x84182A5C` | per effect ID, 8-byte rows: u16 route, u16 alternate route, u32 → list of resource module numbers, ended by `0x83` |
| `0x84182154` | 395 pointers to effect programs |
| `0x8416A218` | 18 opcodes × 8 bytes; the u32 at +4 is the instruction length (4, 8 or 16) |
| `0x84182A18` | variants: route `0x4000 + n` → entry *n* (u16 normal, u16 alternate) |
| `0x84182A30` | sequences: route `0x8000 + n` → pointer to a 0-terminated u16 list of routes |

A route below `0x4000` is a program number.

**Particle colours.** Opcodes 4, 8 and 14 emit particles. The pointer at +4
leads to a 24-byte descriptor, and its +20 points to the particle's material.
The material's s16 at +0 is the shape number; its +8 → controller, whose +4
and +8 point to the primary and secondary RGBA colours. A shape number
resolves through module 0 first, then through the move's own resource list;
later modules override earlier ones.

This gives each particle sprite the colours the game actually uses. For
example, the same smoke is white for Acid, orange for Fire Blast and blue for
Surf. The extractor writes every colour variant.

## Not decoded

The **choreography**: where, when and how many particles spawn, how models
move during the move. That is the rest of the effect programs' bytecode
(the other opcodes). All the assets are extracted, but not the timeline.
