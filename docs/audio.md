# Audio

Stadium 2 runs **Nintendo EAD's audio engine**, the one in *Zelda: Ocarina of
Time* and *Majora's Mask* ([zeldaret/oot](https://github.com/zeldaret/oot),
[zeldaret/mm](https://github.com/zeldaret/mm) document it; the N64 Sound
Tool's configs in [jombo23/N64-Tools](https://github.com/jombo23/N64-Tools)
list the game as the "Zelda" type). Its sequences use *Majora's Mask*'s
version of the command set: layer commands `0xF0` (s16) and `0xF1` (u8),
channel commands `0xA0`–`0xA8`, `0xBD` (one s16) and `0xBE` (u8) all appear.

There are no recordings. A song or a sound effect is a **sequence**, a
MIDI-like script of a few KB (a top level that starts up to 16 channels, each
running up to 4 note layers), played on **soundfont** instruments whose
samples are short **VADPCM** clips (9 bytes per 16 samples, about 4.5 bits a
sample). The N64's RSP mixes the notes as they play. `tools/ps2tool/audio.py`
reads all of it; `web/minigames/src/n64audio.js` plays it in the browser.

## Where it is

| ROM (EU) | What |
|---|---|
| `0x086AC0` | four tables back to back in the main program's data: soundfonts (92), sample banks (14), sequences (137), then each sequence's soundfonts |
| `0x49B780`–`0x4AD7D0` | 0x28-byte records numbered from 0x0E (*unknown*) |
| `0x4AD7D0`–`0x50FB60` | soundfont data (400 KB) |
| `0x50FB60`–`0x14D69E0` | sample data (16 MB, 14 banks) |
| `0x14D69E0`–`0x154F530` | sequence data (484 KB) |

The US ROM has the same layout elsewhere (N64 Sound Tool: tables at
`0x86960`, data from `0x4AD450`). The tools don't use fixed offsets: they
scan for the four tables, and take the three data addresses from the code,
which loads each as a constant (the font data address, plus the fonts' total
size and then the banks', are all constants).

**Tables:** a 16-byte header (u16 count, then zeros) and 16-byte entries: u32
offset into the data, u32 size, u8 medium, u8 cache policy, u16 ×3. For
soundfonts the u16s are the sample banks (hi, lo; `0xFF` for none),
instruments << 8 | drums, and sound effects. A size of 0 makes an entry an
alias: its offset is the entry it stands for (sequences 129, 130, 132; fonts
76, 79). The sequence font table is a u16 offset per sequence to a count and
that many font numbers; the last is the one the sequence starts with.

**Soundfonts, samples, envelopes** are laid out as in *Ocarina of Time*
(instruments of 0x20 bytes with three pitch ranges, drums of 0x10, sound
effects of 8, samples of 0x10 with a loop and a VADPCM codebook); the
docstring of `tools/ps2tool/audio.py` has the fields. One detail: envelopes
here start with a point of delay −4, which the engine treats as an ordinary
step that changes nothing.

**Sample banks:** bank 13 holds the music's instruments (every song's font
uses it). Banks 4–6 hold voices (the announcer and others) in codec 5, the
game's own compression ("MORT" in the N64 Sound Tool); they're not decoded.
`python3 tools/ps2extract.py ROM audio` writes every sequence, every other
sample as a WAV (at the rate it plays: 32 kHz × its tuning, with its loop)
and a JSON per soundfont to `out/audio/`.

## Songs

The game plays **song n** with `0x80021EC8(n)` (EU VRAM), which remaps a few
ids (100 → 34 with the tempo +17, 101 → 54 with +40, 102 → 62, 103 → 7,
104 → 76) and starts **sequence n + 39** on sequence player 0: audio command
`0x82000000 | (n + 39) << 8`. Its volume is the song's entry in a table at
`0x80090297` (128 and up: an entry of a second table at `0x80091958`) / 127,
times 0.81 (the float at `0x800A27C0`), sent as command `0x41000000`.
`0x800225B4(frames)` fades it out (command `0x83000000`, frames × 3 audio
updates).

What each minigame's code module asks for:

| Minigame | Song | Sequence |
|---|---|---|
| Gutsy Golbat | 13 | 52 |
| Clear Cut Challenge | 19, 18 | 58, 57 (18: while each log is hauled up; 19: when the pieces are shown) |
| Pichu's Power Plant | 21 | 60 |
| Streaming Stampede | 29, 30, 31, 32 | 68 (its opening), 69 (from the first question), 70 (the results), 71 (before the last answer) |
| Topsy-Turvy | 33 | 72 |
| Barrier Ball | 35 | 74 |
| Egg Emergency | 45 | 84 (122 BPM, a 23.6 s loop, font 49) |
| Tumbling Togepi | 46 | 85 |
| Furret's Frolic | 47 | 86 |
| Delibird's Delivery | 52 | 91 |
| Eager Eevee | 53, 54, 101 | 92 (a held roll, after each prize), 93 (as Aipom calls each round; 101 is 54, 40 beats a minute faster, for the final one) |

Rampage Rollout passes its song in a register. After the finish, the
minigame results (module #45) play songs 76 (sequence 115) and 55
(sequence 94, a 3.6 s fanfare; song 57, sequence 96, is another).

## Sound effects

The game plays sound effect **id** with `0x800279B4(id)`, or
`0x80027A18(id, player)` for one of the four players (panned to their
column). An id is bank << 12 | 0xF00 | index; the 13 banks (sizes
`8, 15, 18, 12, 8, 11, 13, 6, 26, 12, 12, 7, 25` at `0x800A3AF0`) are laid end
to end in an effect table at `0x80090E88`, 16 bytes each:

| Offset | |
|---|---|
| 0 | sound number (bit 7: the second of the script's tables) |
| 1 | volume |
| 4 | f32 pitch |
| 8 | reverb |
| 9 | pan (64) |
| 10 | u16 the channels it may use |
| 13 | flags; bit 0: pan by the player's position |

Bank 7 is Egg Emergency's own, bank 12 is shared by the minigames.

They play on **sequence player 2, running sequence 9** (`0x80027E20` starts
it, at volume 0.648), whose 16 channels each wait for a sound. To play one the
game picks a free channel among the allowed ones, fills that channel's 12-byte
state (`0x80090D18` + 12 × channel: volume, reverb, pan, and the pitch as a
float at +4; the audio thread gets the array with command `0x10`), and sets
its IO ports: 1 = the sound number, 3 = its table, 0 = 1 to start. The channel
script (from `0x82`) looks the sound up in the table listed at `0x13A` (128 and
53 entries), calls its script, and each update copies the state's volume,
reverb and pan into its own commands and calls the game's custom function 0
(`0x800275D8`, command `0xE4` registers it; *not read*: it presumably applies
the pitch). The sound's script plays sound effects of font 12 (instrument
126: effect number (transposition << 6) + note).

Egg Emergency's (`0x7F0x`, called from module #56) and the shared ones it
uses:

| Id | Sound | Effects of font 12 | When (from the code) |
|---|---|---|---|
| `0x7F01` | `0x4E` | 37 | an egg is caught |
| `0x7F02` | `0x4F` | 38, 6, 18 | a Voltorb goes off (Chansey plays clip 13, hurt) |
| `0x7F00` | `0x4D` | 36, twice | with it, if Chansey had eggs to lose (*by context*) |
| `0x7F05` | `0x2F` | 81, instrument 35 | a drop falls in the water (*by context*) |
| `0x7F03`, `0x7F04` | `0x66`, `0x67` | 79, 80 | on what a function of module #64 returns (*unknown*) |
| `0xCF00` | `0x7C` | 96 | a count's 3, 2 and 1 (in Topsy-Turvy's code) |
| `0xCF06` | `0x28` | 33, three times | the same count's 0 (the remake plays it for GO!) |
| `0xCF0B` | `0x86` | 86 | the finish whistle (the song fades out for 40 frames with it) |

The finish whistle's script is shared by sounds `0x85`, `0x86`…: it writes
its note (21 + the sound number − 133) into itself before playing it.

An id's middle digit isn't always `F`: the game calls `0x80027764(id, pan)`
too, and ids like `0x1005` or `0x1B06` are bank 1's entries 5 and 6 all the
same (the low byte is the entry). Clear Cut Challenge's (module #53) are bank
1's, and the shared ones it uses:

| Id | Sound | Effects of font 12 | When (from the code) |
|---|---|---|---|
| `0x1F00` | `0x07` | | a cut |
| `0x1F01` | `0x08` | | a swing that misses |
| `0x1005` | `0x0C` | 11 (4.8 s: a crowd, *by context*) | every frame from a log hanging ready to 50 frames after its drop |
| `0x1B06` | `0x0D` | 12 (3 s) | as each log comes up |
| `0x1C07`, `0x1D08`, `0x1E09` | `0x0E`, `0x0F`, `0x10` | 13, 14, 15 (2-4 s: the crowd reacting, *by context*) | 50 frames after a drop, for the best cut: a perfect one, 14-19 points (a cut can't score that), any points |
| `0x1F0A` | `0x11` | | a Scyther gets ready, or lowers its scythes after a log |
| `0x1F0B` | `0x12` | | a player's points are in |
| `0x1F0C` | `0x2D` | | a perfect cut |
| `0x1F0D`, `0x1F0E` | second table `0x22`, `0x23` | | the count and GO |
| `0x1F04` | `0x0B` | | at three frames of Pinsir's clips |
| `0xCF0B` | `0x86` | 86 | the finish whistle (the song fades out for 40 frames with it) |

These five share a script that picks the effect from the sound number as it
plays (effect = sound − 1), so `tools/web_assets.py` lists them by hand. It
repeats one long note until the sound is stopped (0 on port 0 of its
channel): `0x0C` has channel 9 to itself, and the game's sound manager stops
it once it's no longer asked for; `0x0D`-`0x10` share channel 14, each
taking over from the last, and carry on until the module stops every sound as
it leaves (`0x80027ED0(0xFFE)`).

Pichu's Power Plant's (module #54) are bank 2's, the minigame's own:

| Id | Sound | Effects of font 12 | When (from the code) |
|---|---|---|---|
| `0x2F00`, `0x2F01` | `0x13`, `0x14` | 16, 17 | each count tick; GO (with song 21) |
| `0x2F03` | `0x16` | 19 | an Electrode pops out |
| `0x2F04`-`0x2F07` | `0x17`-`0x1A` | 20-23 | player 1-4 turns to a new direction, panned |
| `0x2F08` | `0x1B` | 24 | a shock (a miss) starts |
| `0x200B` + 0x100 × player | `0x1E` (volume 70) | its own script | every frame a player charges (the hum: it goes on until it's no longer asked for) |
| `0x2F09`, `0x2F0A` | `0x1C`, `0x1D` | instruments | a loser zapped, 50 frames after the finish (1P and 4P; 2P and 3P) |
| `0x2F0C`, `0x2F0D` | `0x1F`, `0x29` | instruments | 50 frames after the finish, unless all four won |
| `0x2F0E`-`0x2F10` | `0x2A`-`0x2C` | instruments | 70, 90 and 110 frames after it |
| `0x2F11` | `0x15` | 82 | a Pichu winner's cry |

Sounds `0x13`-`0x1B` share a script that writes its note into itself from the
sound number (effect = sound − 3), so `tools/web_assets.py` lists their
effects by hand. `0x2F02` (sound `0x15`) isn't used.

Streaming Stampede's (module #59) are bank 3's, the minigame's own
(entries 0-8 are sounds `0x20`-`0x28`, 9 `0x5E`, 10 `0x5F`, 11 `0x73`):

| Id | Sound | Effects of font 12 | When (from the code) |
|---|---|---|---|
| `0x3F02` | `0x22` | 27 | a count (an A press), panned to the player (`0x80027A18`) |
| `0x3F07`, `0x3F0B` | `0x27`, `0x73` | 32; instrument 43 | a question's card; the last question's |
| `0x3F03` | `0x23` | 28 | 36 frames into the card |
| `0x3F08` | `0x28` | 33 | "Stop!", 50 frames after the last Pokémon's gone |
| `0x3000`, `0x3F01` | `0x20`, `0x21` | 25, 26 | the frame before the answer shows, and as it does |
| `0x3F05`, `0x3F04` | `0x25`, `0x24` | 30, 29 | someone's count is right; no one scored |
| `0x3F06`, `0x310A` | `0x26`, `0x5F` | 31, 30 | the points going in (the last question's) |
| `0x3209` | `0x5E` | 66 | a booth going up a point |

Sounds `0x21`-`0x28` share a script (at `0x43F` of sequence 9) that reads
the sound number from its channel's IO port 5 and writes its note into itself
(effect = sound − 0x21 + 0x1A, `c7 1a 04 53`): the effects above are read off
that, and `tools/web_assets.py` lists them by hand. The crowd after an answer
is bank 1's (`0x1C07`-`0x1E09`, above). A channel that never sets an
instrument plays drums (it starts on them: instOrWave 0); song 30 (sequence 69)
has five such channels, so the web pack takes their notes as drums.

Tumbling Togepi's (module #55) are bank 9's, the minigame's own (entries
0-11: sounds `0x60`-`0x65`, `0x72`, and `0x2A`-`0x2E` of the second table),
with bank 5's count and GO and bank 1's crowd:

| Id | Sound | Effects of font 12 | When (from the code) |
|---|---|---|---|
| `0x9F00` | `0x60` | 62 | a hop over a log, or off a Diglett coming up, while dashing (panned to the player) |
| `0x9F01` | `0x61` | 63, 64 | knocked by a rock or a Diglett, or tripped by a log (frame 2 of the clip) |
| `0x9F02` | `0x62` | 65 | a winner's cheer, 20 frames into its clip 6 |
| `0x9F03` | `0x63` (volume 60) | instrument 24 | a footstep: frames 14 and 32 of the run |
| `0x9F04` | `0x64` | instrument 24 | a footstep in the flowers |
| `0x9F0B` | second table `0x2E` (pitch 1.24) | 65, 89 | 3 frames into a dash |
| `0x5F07`, `0x5F08` | `0x3F`, `0x40` | | each count tick; GO (with song 46), and again as each Togepi gets in |
| `0x1C07` | `0x0E` | 13 | the first one in (the crowd, as in Clear Cut Challenge) |

`0x9F05`-`0x9F0A` (sounds `0x65`, `0x72`, `0x2A`-`0x2D` of the second table)
aren't asked for by module #55.

Gutsy Golbat's (module #49) are bank 0's (entries 1-7: sounds `0x00`-`0x06`),
played with `0x800277B4` panned by the Golbat's x across where Golbat can
go (`0x86100020`), and the shared count for the play's last seconds:

| Id | Sound | Effects of font 12 | When (from the code) |
|---|---|---|---|
| `0x0F01` | `0x00` | instrument 1 | a dashing Golbat knocks a heart out of another |
| `0x0F02` | `0x01` | 1, instrument 2 | a Magnemite hits a Golbat |
| `0x0F03` | `0x02` (volume 63, channel 0 only) | 2 | a wingbeat: each time a Golbat's flying clip comes round |
| `0x0F04` | `0x03` | 3 | a heart caught |
| `0x0F05` | `0x04` | instrument 0 | a heart knocked out (one each) |
| `0x0F06`, `0x0F07` | `0x05`, `0x06` | 4, 5 | each count tick; GO (with song 13) |
| `0xCF00`, `0xCF06` | `0x7C`, `0x28` | 96; 33 | 3, 2 and 1 seconds before the cave stops; as it stops |

`0x0F00` (sound `0x2F`) isn't asked for by module #49.

## Timing

What `n64audio.js` uses, from the decomp (`AudioHeap_ResetStep`), for an
NTSC console mixing at 32 kHz (Stadium 2's own rate isn't known): 3 audio
updates a 60 Hz frame, 180 a second; every update runs the sequence players,
and a player's script ticks when its tempo (beats a minute × 48) adds up past
the maximum tempo, 10770 (so at most once an update). Envelope delays count
quarter frames (a delay of 4 is one frame); release rates count frames. A PAL
console's frames are 50 Hz, so there envelopes and releases take 20% longer;
the tempo comes out the same.

Not known: the reverb settings (the engine's audio spec: delay, feedback);
`n64audio.js` uses a plain feedback delay instead.
