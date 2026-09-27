# Arenas and region maps

Code: `ps2extract.py` (`export_stage`), `ps2tool/arena.py`,
`ps2tool/combiner.py`, `ps2tool/decals.py`, `ps2tool/gltf.py`.

## Tables

- **Battle arenas:** `0x1638000`, 30 FRAGMENT modules.
- **Region maps:** `0x449840`, 3 modules with the same entry point: 0 Johto,
  1 Johto around Mt. Silver, 2 Kanto.

Arena order comes from the gen1recomp research. 23–25 are *unconfirmed*
stadium arenas.

| # | Arena | # | Arena | # | Arena |
|---|---|---|---|---|---|
| 0 | Falkner (Violet Gym) | 10 | Koga (Elite Four) | 20 | Blaine (Cinnabar Gym) |
| 1 | Bugsy (Azalea Gym) | 11 | Bruno (Elite Four) | 21 | Blue (Viridian Gym) |
| 2 | Whitney (Goldenrod Gym) | 12 | Karen (Elite Four) | 22 | Red (Mt. Silver) |
| 3 | Morty (Ecruteak Gym) | 13 | Champion Lance | 23 | Stadium A |
| 4 | Jasmine (Olivine Gym) | 14 | Brock (Pewter Gym) | 24 | Stadium B |
| 5 | Chuck (Cianwood Gym) | 15 | Misty (Cerulean Gym) | 25 | Stadium C |
| 6 | Pryce (Mahogany Gym) | 16 | Lt. Surge (Vermilion Gym) | 26 | Battle Tower |
| 7 | Clair (Blackthorn Gym) | 17 | Erika (Celadon Gym) | 27 | Indoor (Academy) |
| 8 | Team Rocket | 18 | Janine (Fuchsia Gym) | 28 | Free Battle Park |
| 9 | Will (Elite Four) | 19 | Sabrina (Saffron Gym) | 29 | Rival |

## Entry point

An arena module has no model descriptor. Its entry code returns what the
engine asks for:

- the **geo layout**: `lui v1` at +0x3C, `addiu v0, v1` at +0x44
- selector 1, the **background colour**: `addiu`/`ori v1, zero, imm` at +0x30,
  an RGBA5551 constant. It is the colour the game clears the screen to, so
  it's the sky or void wherever no geometry is drawn.

The geo layout places pieces with static transforms (geo `0x1F`: rotation in
degrees, scale in percent) and draws each display list in a render layer
(geo `0x22`): 1 opaque, 4 alpha-tested, 5 and up translucent.

## Materials

The N64 has no shaders. A surface's look is a recipe:

- a colour-combiner equation (`(a − b) × c + d`, one or two cycles);
- up to two textures, each with its own scale, wrap and scroll;
- primitive and environment colours, possibly animated by a colour track;
- the vertex colour ("shade").

Arenas get most of this from material callbacks. The block layout is in
[fragments.md](fragments.md). The extractor bakes a still texture into the
glTF and records the full recipe in the material's extras (`ps2_combiner`).
The Blender add-on rebuilds it as live shader nodes: textures scroll,
colours animate, and vertex shade is exact.

Texture scroll speeds are stored in 1/4 texel per frame, because tile
coordinates are 10.2 fixed point.

## Overlapping floors (coplanar overlays)

Arenas paint some surfaces over others in exactly the same plane (a stone
ring over the floor, stripes over tiles). The N64 draws them in order and the
later one wins, but a PC renderer z-fights them. The exporter gives every
triangle that overlaps an earlier coplanar one a layer number (1 + the
highest layer it covers). It then lifts each layer slightly along its normal
(`decals.py`).

## Water and other translucent surfaces

A translucent surface with nothing behind it (lakes seen from the battle
camera) shows the background colour through it. The exporter finds these by
casting rays from the arena's centre through the surface: if they hit nothing
else, the surface counts as over the background. It then blends them over the
clear colour, both in the baked texture and in the live material.
