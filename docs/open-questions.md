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
  bank 147's star); the trail's colour (its combiner takes K5, the convert
  constant, which nothing seems to set: the remake takes it as 0, so env's
  colour); and the barrier panel's shade (its recipe takes the lit vertex's
  colour, which the remake takes as white: the battle lighting below). (The
  countdown's length is settled: module #64's 20 frames a count, GO at 80,
  [minigames.md](minigames.md#the-shared-module-64-the-countdown-and-the-results).)
- **Rampage Rollout's loose ends** (its rules are read: [minigames.md](minigames.md#rampage-rollout)):
  image bank 343 (Gutsy Golbat's glow: loaded by module #52, but nothing
  found draws it); the Donphan that run in from by the camera before the
  countdown (state 2: `0x8640708C`, `0x86406EF0`; the remake starts at the
  countdown); the end's camera move (`0x86405138`: `m2c` garbles the call,
  the remake takes its arguments in order: from the winners, (−200, +450,
  +80), looking at (+90, −40, 0)); and sound `0x5F02` (`0x39`), in bank 5 but
  not asked for.
- **Topsy-Turvy's loose ends** (its rules are read: [minigames.md](minigames.md#topsy-turvy);
  its frame rate is settled, 30 a second): what the audio thread does with a
  bump's sound asked for again at each step the two touch (`0x80026C70`
  queues it; the remake lets a pair's sound go again 4 frames on); how a
  texture clip shows a frame past its end (`0x8003F028`: the remake shows its
  last, so clips 3 and 5 blink only as they start); that W (the module's
  `.bss`) is zeroed, so the bumps' sounds, handed a place nothing writes, are
  in the middle; a crouched Hitmontop's spin-up once its clip is held
  (`0x86002B20`: at most a frame, not in the remake); the frame being 3
  retraces when one runs over (not modelled); what its list's 123 (a Hitmontop
  in one piece), 124 (the same, white), 152 and the whirlwinds 191-194 are for
  (nothing in module #47 draws them; 191-194 are hidden every frame,
  `0x86001DBC`); what clock the sparks' and rings' colour tracks and scrolls
  run on, and what their mode 1 means (the remake runs the sparks' with
  their clip, held at the last key, and the rings' round and round at 30
  frames a second); which render-mode variant the scene uses (`0x80126300`,
  from the view's +2: one with the Z-buffer is assumed); the HUD gauge at
  `0x86004544` (a RAPID SPIN's charge, by its look), which nothing calls; and
  the instructions' show (`0x860057D0`), which the remake leaves out.
- **Furret's Frolic's loose ends** (its rules are read: [minigames.md](minigames.md#furrets-frolic)):
  the Furret's popping up (the countdown is module #64's, 20 frames a count
  and GO at 80, so a clip started with it is at frame 80 at GO, not 0: which
  frame the game starts it at wasn't traced); the size of the labels over the Furret and the badges over the goals
  (the game scales the badges' 200-unit quad by 9, too big to be the units
  the remake has, so it picks a size; and the labels are drawn by module #64,
  not read); the lights' ways (worked out from the camera's angles at
  `0x86200794` and `0x862007FC`; the remake places them by eye); the balls'
  roll (`0x87D00354` turns each ball by how it moved: the remake turns it by
  the same rule, not that code); Girafarig, whom the code loads for a Game
  Pak's Girafarig (the remake has Furret for all); and the instructions' show
  (a Furret in a bush for each player), which the remake leaves out.
- **Delibird's Delivery's loose ends** (its rules are read: [minigames.md](minigames.md#delibirds-delivery)):
  how the save's flags that swap in the Game Boy Advance and the GameCube
  get set (module #63's `0x87E07CB0` and `0x87E07C90` set them, reached
  through pointers not followed; the remake plays without); where a gift being
  picked up goes (to a point of Delibird's model, `+0xBC` of its object, read
  as it's drawn: the remake takes it to the sack); the sack's reach, looked up
  by the player where its table goes by the fill (the remake goes by the
  fill); the labels' size (module #64's); the lights' ways (by eye, as in
  Furret's Frolic); what image banks 378 and 382 (the gifts and their points,
  by appearance) are for; and the instructions' show (state 2: the
  Delibird walk in), which the remake leaves out.
- **Pichu's Power Plant's loose ends** (its rules are read: [minigames.md](minigames.md#pichus-power-plant)):
  the lights' ways (`0x866026B8` and `0x86602720` turn the two lights by the
  camera's angles, + `0x2000` and the like, but how a light node's angles
  make its direction wasn't traced: the remake lights it by eye, flatter
  than the game's ambient `0x646464` with a white and a grey light); what
  `+0xAC`-`+0xB4` of the Pichu's node are, which the dizzy stars are placed
  from (taken as its place in the world, the last row of a matrix at `+0x7C`:
  not traced); the frame order the lamps' and the shock's timings rest on
  (that a node's clip moves on after its callback each frame, as
  `0x8003EC64`'s "frame − speed" and the other modules have it: the 4 frames
  a lamp is held in, and the shock's 10 frames, follow from it); how many
  frames module #64's particles are drawn for (the remake: their life and
  one, from the frame they're made); whether the CPUs' "late" and "wrong"
  flags (locals of `0x86600678`, only ever set to 1) carry from one CPU to the
  next or from frame to frame (the remake takes them per CPU); and the
  instruction screen's show (state 11: four small Pichus turning, humming and
  sparking as it fades out), which the remake leaves out.
- **Tumbling Togepi's loose ends** (its rules are read: [minigames.md](minigames.md#tumbling-togepi)):
  where the dash's aura is (`0x867043AC` takes its x and y from `+0xAC` and
  `+0xB0` of the Togepi's node, the place a matrix at `+0x7C` holds, as with
  Pichu's dizzy stars: whose matrix wasn't traced; the remake puts it 50 over
  the Togepi, about where its body's joint is); the Diglett's quad (upright,
  `+0x1E` 0, where the remake turns a sprite to the camera); the end of a goal
  run slower than 1 (the game ends the race at the last one's goal clip's
  end, the remake 30 frames after it's in at the latest); the end's camera
  when no one wins (its step across is the last round's, from statics); and
  the instructions' run-in (state 10: four small Togepi running at the camera
  as the screen fades, [minigames.md](minigames.md#tumbling-togepi)): how long
  the fade is (`0x80007B14(0x14)`, read by the screen's own code) and the
  instructions' camera (`0x8670A404`: what its +0x14 and +0x18 do), which the
  remake leaves out, as the other games' instructions shows.
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
  timings between logs (the remake fixes them), what the object at `0x8650E6E0`
  (scale 0.095, at height 55) is, and how the dizzy stars' fade-in (5/255 a
  frame) reaches their material callbacks (mode 4 of `0x810024E0` is passed a
  byte of the model's: `0x810034C0`): the remake fades them whole.
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
