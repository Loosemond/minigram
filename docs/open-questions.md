# Open questions

What isn't known yet, roughly by how useful it would be.

## Data

- **Battle effect choreography.** Where, when and how many particles spawn
  during a move, and how effect models move. It's the rest of the effect
  programs' bytecode in code module #79 ([effects.md](effects.md)); only the
  particle-emitting opcodes are read.
- **Undecoded archives:** `0x047D690` (598 small records), `0x0493410` (4
  empty), `0x1708000` (72), `0x266B000` (279, mostly empty), `0x23A5000`
  (resource 9); and, known but not converted, the UI layouts (`0x1E40000`:
  their elements are read, not their animation) and fonts (`0x437AD0`)
  ([rom-map.md](rom-map.md)).
- **Streaming Stampede's loose ends** (its rules are read: [minigames.md](minigames.md#streaming-stampede)):
  how its question board comes and goes, and when each card's words show
  (the UI layouts' own animation); whether a player without a Game Pak is
  Cleffa or Igglybuff (decided outside module #59; the remake has both, 1P
  and 3P Cleffa).
- **Barrier Ball's loose ends** (its rules are read: [minigames.md](minigames.md#barrier-ball)):
  object 146 (loaded by module #51, but nothing found draws it); two geo
  layouts in the module that nothing points to (`0x86307088`: a 120 × 60
  quad that flashes red with a smash; `0x86307158`: a big triangle with image
  bank 147's star); how big a ball's glow and trail are drawn (bank 151 on
  `0x87F08E3C`'s quad, which is the image's size in units, centred: what
  scale the module gives it isn't read); and the countdown's length
  (`0x87F00688`).
- **Rampage Rollout's loose ends** (its rules are read: [minigames.md](minigames.md#rampage-rollout)):
  image bank 343 (Gutsy Golbat's glow: loaded by module #52, but nothing
  found draws it); the Donphan that run in from by the camera before the
  countdown (state 2: `0x8640708C`, `0x86406EF0`; the remake starts at the
  countdown); the end's camera move (`0x86405138`: `m2c` garbles the call,
  the remake takes its arguments in order: from the winners, (−200, +450,
  +80), looking at (+90, −40, 0)); and sound `0x5F02` (`0x39`), in bank 5 but
  not asked for.
- **Topsy-Turvy's loose ends** (its rules are read: [minigames.md](minigames.md#topsy-turvy)):
  its frame rate (60 a second is assumed, as the game's numbers suggest: the
  scheduler's retrace count wasn't traced); what its list's 123 (a Hitmontop
  in one piece), 124 (the same, white), 152 and the whirlwinds 191-194 are for
  (nothing in module #47 draws them; 191-194 are hidden every frame,
  `0x86001DBC`); the sparks' size (the list's own scale: the remake guesses);
  how the shadow and the glow are combined (their colours and alpha:
  `0x86000CCC` draws the glow twice, the remake once); the HUD gauge at
  `0x86004544` (a RAPID SPIN's charge, by its look), which nothing calls; and
  the instructions' show (`0x860057D0`), which the remake leaves out.
- **Audio:** the voices' codec (5, in sample banks 4–6), the reverb
  settings, the game's custom sequence function (`0x800275D8`), and the
  0x28-byte records at `0x49B780` ([audio.md](audio.md)).
- **Arenas 23–25:** which stadium each is ("Stadium A/B/C" are placeholders).
- **Battle contexts 255–267, 269, 270** of the battle motion table
  ([animation.md](animation.md)).
- **Attachment labels** (geo `0x18` / `0x24`): what the game attaches at each.
- **Room decoration names** are matched to models by appearance; the table
  that links decoration items to object records hasn't been found.
- **Egg Emergency's numbers:** fall speeds, how the drops are patterned, how
  long a Voltorb stuns, what the CPU players do, where the HUD sits. They're
  in module #56's code, which hasn't been read beyond its calls; the browser
  remake guesses them ([web/README.md](../web/README.md)). Also what image
  bank 429 (big digits with ±) is used for exactly.
- **Clear Cut Challenge's loose ends** (its rules are read: [minigames.md](minigames.md#clear-cut-challenge)):
  the game's frame rate (30 a second is assumed: the scheduler's retrace
  count wasn't traced), how objects 130 and 131 (the cut's effects) are
  coloured as they're drawn, exactly how the cut pieces tumble and the show's
  timings between logs (the remake fixes them), and what the object at `0x8650E6E0`
  (scale 0.095, at height 55) is.
- **Battle lighting:** the ambient and directional lights (directions,
  colours) the battle scene loads for lit models. With them, Blender could
  match the game's shading, not just its texture colours
  ([colours.md](colours.md)).

## Code

- The modules that load objects outside the minigames: #57, #58, #63, #67
  (menus? My Room? the Pokémon Lab?) and the tiny #62 after the minigame
  slots ([objects.md](objects.md)).
- What `0x8004DFF8` does. It's called on the same objects as the loader
  `0x8004DED4`.
- Where these are loaded: Hitmontop 052, fruit 208, 210, 212 and 215, gift
  boxes 088–091, 093–095, 097 and 099. No code loads them by a constant number
  (Hitmontop 123 is in Topsy-Turvy's list).

## Models

- Pokémon model records 0 (a room), 279 (a second Pikachu), 280 (small,
  3 joints) and 281 (a second Ho-Oh): where the game uses them.
