# Pokémon

Code: `ps2extract.py` (`export_pokemon`), `ps2tool/shiny.py`, `ps2tool/clips.py`.

## Model table (`0x27ED000`, 282 records)

Each record is a model module ([fragments.md](fragments.md)). Its descriptor's
u16 id is the record number.

| Record | Model |
|---|---|
| 0 | a room model (the same look as objects 189/214, "Lab Room"); *by appearance* |
| 1–251 | species 1–251 (Bulbasaur … Celebi); 201 is Unown A |
| 252 | Substitute doll |
| 253 | Egg |
| 254–278 | Unown B–Z |
| 279 | a second Pikachu model with 12 clips of its own (*by appearance*; use *unknown*) |
| 280 | a small 3-joint model (*unknown*) |
| 281 | a second Ho-Oh model with 1 clip (*by appearance*; use *unknown*) |

Pose banks (`0x2D7D000`) and the battle motion table (`0x1718000`) use the
same numbering ([animation.md](animation.md)).

## Names and Pokédex text

String tables ([images-and-text.md](images-and-text.md)): 0 names, 1
categories ("SEED"), 2 heights, 3 weights, 4 and 5 Pokédex entries, 6 move
names, 7 move descriptions, 12 type names.

## Faces and fire

- **Eyes, mouths, cheek sparks** are texture-animation channels: the draws
  switch textures every frame as the texture clips say ([animation.md](animation.md)).
- **Fire** (Charmander line, Magmar, Moltres) is a render callback that draws
  an 8-frame card at a joint ([fragments.md](fragments.md)). The exporter
  cycles its frames every 2 game frames.

## Shiny colours

**Species metadata** (`0x3FED000`, 16 bytes per species, species 1 first):
bytes +4…+7 describe the shiny ("rare") colours.

- Usually: s16 hue shift in 1/64°, s8 saturation shift and s8 lightness
  shift in 1/16 steps. They are applied in HSL to every fully opaque texel.
  Glows, fire and gas keep their colours.
- `FF FF FF FF`: the species has **dedicated shiny textures** instead (e.g.
  red Gyarados). Record *species* of `0x3FD5000` is the raw texels of every
  texture the model uses, concatenated in texture-index order.

Unown B–Z (records 254–278) use Unown's (201) entry.
