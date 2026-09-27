# Open questions

What isn't known yet, roughly by how useful it would be.

## Data

- **Battle effect choreography.** Where, when and how many particles spawn
  during a move, and how effect models move. It's the rest of the effect
  programs' bytecode in code module #79 ([effects.md](effects.md)); only the
  particle-emitting opcodes are read.
- **Undecoded archives:** `0x047D690` (598 small records), `0x0493410` (4
  empty), `0x1708000` (72), `0x266B000` (279, mostly empty); and, known but
  not converted, the UI layouts (`0x1E40000`) and fonts (`0x437AD0`)
  ([rom-map.md](rom-map.md)).
- **Audio** (`0x49B780`–`0x1606000`, N64 ADPCM sample banks and sequences)
  isn't extracted.
- **Arenas 23–25:** which stadium each is ("Stadium A/B/C" are placeholders).
- **Battle contexts 255–267, 269, 270** of the battle motion table
  ([animation.md](animation.md)).
- **Attachment labels** (geo `0x18` / `0x24`): what the game attaches at each.
- **Room decoration names** are matched to models by appearance; the table
  that links decoration items to object records hasn't been found.

## Code

- The modules that load objects outside the minigames: #48, #57, #58, #63,
  #67 (menus? My Room? the Pokémon Lab?) and the tiny #62 after the minigame
  slots ([objects.md](objects.md)).
- What `0x8004DFF8` does. It's called on the same objects as the loader
  `0x8004DED4`.
- Where these are loaded: Hitmontop 052 and 123, fruit 208, 210, 212 and 215,
  gift boxes 088–091, 093–095, 097 and 099. No code loads them by a constant
  number.
- Why Gutsy Golbat loads Jynx (110).

## Models

- Pokémon model records 0 (a room), 279 (a second Pikachu), 280 (small,
  3 joints) and 281 (a second Ho-Oh): where the game uses them.
