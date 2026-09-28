# Pokémon Stadium 2: game and ROM notes

What we know about how Pokémon Stadium 2 stores its data and how the game uses
it, learned while writing the extractor in `tools/`. The code there is the
working reference; these notes explain the formats, say where everything is,
and record how each fact was found, so the next person doesn't have to
rediscover it.

| File | Covers |
|---|---|
| [rom-map.md](rom-map.md) | ROM identification, overall layout, every archive table, archive and compression formats, the code modules |
| [fragments.md](fragments.md) | FRAGMENT modules: header, model descriptor, geo layouts, display lists, textures, render callbacks and materials |
| [animation.md](animation.md) | Skeletal and texture (face) clips, pose banks, the battle motion table, how joints compose |
| [pokemon.md](pokemon.md) | Pokémon model records, special records, shiny colours, faces and fire cards |
| [arenas.md](arenas.md) | Battle arenas and region maps: names, background colour, live materials, overlapping floors |
| [effects.md](effects.md) | Battle effect resources and the effect engine's tables |
| [objects.md](objects.md) | The general objects table: room decorations, props, TV screens, who loads what |
| [minigames.md](minigames.md) | The 12 minigames: code modules, objects, text, and how they were identified |
| [images-and-text.md](images-and-text.md) | 2D graphics archives, text format, markup and the notable string tables |
| [audio.md](audio.md) | The audio engine (Zelda 64's): tables, soundfonts, samples, sequences, which song and sound effects each minigame plays |
| [colours.md](colours.md) | Why models looked washed out in Blender, the *Game colours* fix, and what's left (the game's lighting) |
| [open-questions.md](open-questions.md) | What isn't known yet |

## Conventions

- **Offsets** are ROM offsets in the big-endian `.z64` ROM (Europe, md5
  `b1271db5…`), unless marked as VRAM.
- **VRAM** addresses are where the running game has the data or code
  (`0x80000000` main program, `0x8FF00000` asset modules, one 1 MB slot per
  code module).
- **Code modules** are numbered `#1`–`#88` in ROM order, counting from 1. This
  matches the gen1recomp research's "fragment 79" for the battle effect engine.
- **Confidence.** Unless a line says otherwise, a fact was read from the ROM's
  data or code and the extractor depends on it. Lines marked *by appearance*
  come from looking at the models. *Unknown* means not worked out.

## Sources

- [gen1recomp-mod-stadium2-importer](https://github.com/Deftones565/gen1recomp-mod-stadium2-importer)
  (Deftones565): FRAGMENT format, the animation dispatch table, the battle
  effect engine, shiny palettes, arena order.
- [pret/pokestadiumgs](https://github.com/pret/pokestadiumgs) and
  [pret/pokestadium](https://github.com/pret/pokestadium) (Stadium 1, old ROM
  map): shared engine conventions.
- [PokemonStadium2Unity](https://github.com/Manurocker95/PokemonStadium2Unity).
- Our own reading of the ROM: minigame modules and the object loader, arena
  background colours and materials, render callbacks, text tables, the
  archive scan.
- [zeldaret/oot](https://github.com/zeldaret/oot) and
  [zeldaret/mm](https://github.com/zeldaret/mm): the audio engine, whose
  decomps document the sequence format; the N64 Sound Tool's configs
  ([jombo23/N64-Tools](https://github.com/jombo23/N64-Tools)) for where the
  tables are.
- [Serebii's minigame page](https://www.serebii.net/stadium2/minigames.shtml):
  cross-check of each minigame's characters and props.
