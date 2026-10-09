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
| Rampage Rollout | 34, 100 | 73 (30 frames after GO; 100, when the leader starts the final lap, is 34 again 17 beats a minute faster) |
| Egg Emergency | 45 | 84 (122 BPM, a 23.6 s loop, font 49) |
| Tumbling Togepi | 46 | 85 |
| Furret's Frolic | 47 | 86 |
| Delibird's Delivery | 52 | 91 |
| Eager Eevee | 53, 54, 101 | 92 (a held roll, after each prize), 93 (as Aipom calls each round; 101 is 54, 40 beats a minute faster, for the final one) |

Rampage Rollout passes its song in a register (`0x86408CA0`: the song, and
frames to wait, the old one fading meanwhile). After the finish, the
minigame results (module #45) play songs 76 (sequence 115) and 55
(sequence 94, a 3.6 s fanfare; song 57, sequence 96, is another). Each
minigame's own results, module #64's banner ([minigames.md](minigames.md#the-shared-module-64-the-countdown-and-the-results)),
play song 55 with `0xCA0F` when someone won, or song 56 (sequence 95) with the
crowd (`0x1E09`) when no one did, for 36 or 40 frames (`0x80027764`), and song
80 (sequence 119) 120 frames after the banner's down; the remake ships 55 and
56 in every minigame's file, not 80 (`ps2tool/audio.py` can't follow its
script yet).

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
| 13 | flags: bit 0, panned by where it is; bit 1, on a channel of each player's own; the top four, a random pitch (`0x80026980`) |

Bank 7 is Egg Emergency's own, bank 12 is shared by the minigames.

**Who and where** (`0x80027BC4` takes every request; `0x8002701C` fills the
channel's state). The game asks with a player and a place, a pointer to a
byte the game works out (and keeps up to date) for the pan:

| Call | Player, place |
|---|---|
| `0x800279B4(id)` | none, the middle (`0x80090E64`: 0) |
| `0x80027764(id, frames)` | the same; a held sound (below) that lasts that many frames |
| `0x80027A18(id, player)` | the player's column: its byte of the pairs at `0x80090E64`, by the sound's bank (`0x800A3B78`): banks 1, 3, 7, 8 and 9 −50, −10, 10, 50; 2 and 4 −50, −20, 20, 50; 6 −50, 50, −50, 50; 11 0, 60, −60, 0; the others 0. Two ids get the player's pitch too (`0x80027AE4`): `0x3F02` 1.34, 1, 0.85, 0.68 and `0x7F01` 0.97, 1, 0.98, 0.99 |
| `0x8002780C(id, player, place)`, `0x800277E0(id, place)` | the game's place: where the thing is (e.g. `0x87C03B60` projects it to the screen, ±127) |
| `0x800278B0(id, player, place, pitch)` | the same, with a pitch; for `0x4000` (Topsy-Turvy's hum) it's pitch × 0.5 + 0.25, then −0.05, +0.05, 0 and −0.1 for players 1-4 |

An entry with flag bit 0 is panned 64 + the place's byte (from 64 up 127,
under −64 0); one without plays in the middle. Bit 1 gives each player
channels of their own: the entry's channels turned left by the player × how
many there are (`0x80027D00`; a player's turn, shock or hum in Pichu's Power
Plant is on channel p, its hum's on 4 + p), so one player's sound doesn't cut
another's; bank 6's entries keep theirs. The pitch is the entry's times the
one asked for.

An id's middle digit is F for a sound that plays once. Any other is one of 15
**held** sounds' slots (`0x80090DE4`, 8 bytes each; with bit 1 the player is
added to it): asked for again each frame it carries on, its state (pan and
all) brought up to date, and the frame it isn't asked for it's stopped
(`0x80027480`); or it lasts the frames `0x80027764` gives. A held sound's
script plays until it's stopped.

The remake (`web/minigames/src/audio.js`) does the same: `tools/web_assets.py`
puts each sound's id and flags in the game's sound file (found in the table by
its sound number, volume, reverb and channels), `sound(name, seat, how)` plays
one for a player (its channel, its column's pan) or at a place, and
`hold(name, seat, on)` keeps a held one going for each player that asks.

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
| `0x7F03`, `0x7F04` | `0x66`, `0x67` (pitch 1.19) | 79, 80 | each count of module #64's countdown; GO (`0x868066B8`) |
| `0xCF00` | `0x7C` | 96 | a count's 3, 2 and 1 (in Topsy-Turvy's code) |
| `0xCF06` | `0x28` | 33, three times | the same count's 0 (the remake plays it for GO!) |
| `0xCF0B` | `0x86` | 86 | the finish whistle (the song fades out for 40 frames with it) |

The finish whistle's script is shared by sounds `0x85`, `0x86`…: it writes
its note (21 + the sound number − 133) into itself before playing it.

An id's middle digit isn't always `F` (a held sound's slot, above): ids like
`0x1005` or `0x1B06` are bank 1's entries 5 and 6 all the same (the low byte
is the entry), and the game asks for some with `0x80027764(id, frames)`. Clear Cut Challenge's (module #53) are bank
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
| `0x200B` + 0x100 × player | `0x1E` (volume 70) | its own script | every frame a player charges (the hum: it goes on until it's no longer asked for), each on its own channel (4 + the player) |
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

Barrier Ball's (module #51) are bank 6's (`0x6F00`-`0x6F0C`), placed by
where they happen (`0x87C03B60` works out the pan from the position, then
`0x800277E0` plays it); a Mr. Mime's own are panned to its player
(`0x80027A18`). Sounds `0x42`-`0x47` share a script that picks its effect
from the sound number as it plays (effect = sound − 0x42 + 0x29: `c8 42`,
`c7 29 06 3b`), so `tools/web_assets.py` lists those by hand:

| Id | Sound | Effects of font 12 | When (from the code) |
|---|---|---|---|
| `0x6F00` | `0x42` (pitch 1.08) | 41 | a smash |
| `0x6F01` | `0x43` (volume 75) | 42 | a Mr. Mime moving fast (once, till it slows) |
| `0x6F02` | `0x44` | 43 | a ball comes up in the hole |
| `0x6F03` | `0x45` | 44 | a barrier hits a ball (no curl) |
| `0x6F04` | `0x46` | 45 | a ball off a wall |
| `0x6F05`, `0x6F0B` | `0x47`; `0x6D` | 46; 70, 83 | a goal |
| `0x6F06` | `0x48` | instrument 21 | a ball flies off out of the hole |
| `0x6F07` | `0x49` (pitch 0.7) | 44, instrument 21 | a smashing barrier hits a ball (with `0x6F0C`) |
| `0x6F08`-`0x6F0A` | `0x4A`-`0x4C` (pitch 0.9, 0.75, 1.1) | 44, instrument 21 | a hit that curls the ball a little, more, a lot (curl over 0.012, 0.03, 0.057; `0x6F0A` with `0x6F0C`) |
| `0x6F0C` | `0xAF` | 98 | with `0x6F07` and `0x6F0A` |
| `0x2F00`, `0x2F01` | `0x13`, `0x14` | 16, 17 | each count tick; GO (with song 35): Pichu's Power Plant's |
| `0xCF00` | `0x7C` | 96 | 3, 2 and 1 seconds before the time's up |

In the last 30 seconds the module calls `0x80028108(6)` every frame: that
sets `0x80090D14` to 7, which `0x80027628` turns into audio command 0x49
(the song's tempo change, in beats a minute) one higher every 25 frames
(450 / 18, the 7th entry of `0x800A3B30`'s table), for 450 frames: the tune
ends up 18 beats a minute faster. The remake does the same
(`musicTempo` in `web/minigames/src/audio.js`).

Rampage Rollout's (module #52) are bank 5's (`0x5F00`-`0x5F0A`; it also asks
for `0x5001` and `0x5404`, the same entries), placed by where the Donphan is
(`0x87C03B60`, then `0x8002780C`), and `0x4F06` and `0x1C07` (banks 4 and 1).
Rolling and the stun ring on until they're stopped: the game asks for them
again each frame (every 5) while they last; rolling shares the footsteps'
channel. Sound `0x41`'s script works out its effect from the sound number as
`0x42`-`0x47`'s do, so `tools/web_assets.py` lists it by hand:

| Id | Sound | Effects of font 12 | When (from the code) |
|---|---|---|---|
| `0x5F00` | `0x38` (volume 75, pitch 0.49) | | a footstep: each time a Donphan's run comes round |
| `0x5001` | `0x3C` (volume 83) | | rolling (a rocket start's 30 frames, the last lap), every frame of it |
| `0x5F03` | `0x3A` | | sent flying by a dust cloud, or knocked over |
| `0x5404` | `0x3B` (volume 67, pitch 1.24) | | every 5 frames of either |
| `0x4F06` | `0x36` | | a dust cloud dropped |
| `0x5F05`, `0x5F06` | `0x3D` (pitch 0.35), `0x3E` (pitch 0.6) | | at the end: a loser's slump (15 frames into clip 3), a winner's cheer (4 frames into clip 2, twice) |
| `0x5F07`, `0x5F08` | `0x3F`, `0x40` | | each count tick; GO, and each Donphan as it gets in |
| `0x5F09` | `0x41` (volume 105) | 40 | the leader starts a lap |
| `0x5F0A` | `0x2E` | | the leader starts the final lap (with song 100) |
| `0x1C07` | `0x0E` | 13 | the first one in (the crowd) |

`0x5F01` (sound `0x3C`, rolling's) and `0x5F02` (`0x39`) aren't asked for by
module #52 by that id.

Topsy-Turvy's (module #47) are bank 4's (`0x4F00`-`0x4F07`; the hum's
`0x4000` and `0x4401` are its first two entries, held), placed by where the
Hitmontop is on the screen (`0x86001924`: `0x87C03B60`, −64 to 64 across, ×
1.33), and Gutsy Golbat's heart for a point. A bump's (`0x4F03`, `0x4F07`,
`0x4F04`) is handed the place after the one the step works out
(`0x86006164`-`0x86006198`), which nothing writes: it's in the middle. The hum
is asked for every frame each Hitmontop spins (`0x860032DC`: in states 1, 2,
3 and 6; `0x800278B0`, with the player, its place and a pitch): both entries
have flag bit 1, so each player's is on its own channel (0-3, and 4-7 for
`0x4401`), and `0x800278B0` remaps `0x4000`'s pitch, 1.25 (or 1, recharging
and not reeling) to 0.825, 0.925, 0.875 and 0.775 for players 1-4 (0.70,
0.80, 0.75, 0.65). The remake does the same: one `hum` held for each player
at that pitch (changing as it plays), `humSpin` at 1.75, each placed where it
is. Sound `0x36`'s script picks its effect as it plays (40), so
`tools/web_assets.py` lists it by hand. Its count and GO are Pichu's Power
Plant's (`0x2F00`, `0x2F01`); the shared count (`0xCF00`) sounds 3, 2 and 1
seconds before the time's up, `0xCF06` at 0 (the clock's last second). In the
last 30 seconds it calls `0x80028108(4)`: one beat a minute faster every 30
frames (450 / 15, entry 4 of `0x800A3B30`'s table), to 15.

| Id | Sound | Effects of font 12 | When (from the code) |
|---|---|---|---|
| `0x4000` | `0x30` (volume 75; asked for at pitch 1.25, 1 while its RAPID SPIN recharges, then remapped) | | every frame a Hitmontop spins |
| `0x4401` | `0x31` (volume 98, pitch 1.75) | | instead, in a RAPID SPIN |
| `0x4F02` | `0x32` | | a RAPID SPIN |
| `0x4F03`, `0x4F07`, `0x4F04` | `0x33`, `0x37`, `0x34` | | a bump: harder than 700000, 2000000, and 8000000 with a RAPID SPIN |
| `0x4F05` | `0x35` | | knocked out of the ring |
| `0x4F06` | `0x36` | 40 | crouching to jump in |
| `0x0F04` | `0x03` | | a point, panned to the player |

Furret's Frolic's (module #50) are bank 11's (`0xBF00`-`0xBF04`), placed by
where the Furret or the ball is (`0x87C03B60`, then `0x8002780C` or
`0x800277E0`); a goal's is panned to its player (`0x80027A18`). Its count and
GO are Pichu's Power Plant's (`0x2F00`, `0x2F01`), the last three seconds the
shared count (`0xCF00`, `0xCF06` at 0). In the last 30 seconds it calls
`0x80028108(11)`: one beat a minute faster every 15 frames (450 / 30, the
12th entry of `0x800A3B30`'s jump table), to 30. Bank 11's `0xBF05` and
`0xBF06` (sounds `0x79`, `0x7A`) aren't asked for by module #50.

| Id | Sound | Effects of font 12 | When (from the code) |
|---|---|---|---|
| `0xBF00` | `0x74` | | a Furret swings its tail |
| `0xBF01` | `0x75` (volume 110) | | its tail bats a ball |
| `0xBF02` | `0x76` (volume 120) | | a ball over a goal's line |
| `0xBF03` | `0x64` (volume 125, pitch 2) | | a ball comes down hard on the field (deeper than 0.04 of its radius, after more than 55 in a frame) |
| `0xBF04` | `0x78` (volume 80) | | a winner's cry, at frame 69 of its cheer, twice |

Delibird's Delivery's (module #60) are bank 8's (`0x8F00`-`0x8F19`; the
tally's tick asks for `0x8012`, the same entry), a Delibird's placed by
where it is (`0x8002780C`, with the pan worked out from its x and z each
frame: `0x86A05DCC`), a gift through a door's panned to its player
(`0x80027A18`). Its count and GO are Pichu's Power Plant's (`0x2F00`,
`0x2F01`); the shared count (`0xCF00`, `0xCF06` at 0) sounds the last three
seconds. In the last 30 seconds it calls `0x80028108(8)`: entry 8 of
`0x800A3B30`'s jump table is the default, 80 beats a minute, so one faster
every 5 frames (450 / 80, in whole frames) for 450 frames: 90 faster in all.
The strain (`0x8F10`, `0x8F11`) is asked for every frame a Delibird walks
with four or five gifts; it has flag bit 1, so each player's is on two
channels of its own (the remake strains for this device's own).

| Id | Sound | When (from the code) |
|---|---|---|
| `0x8F00` | `0x50` (reverb 20) | a gift through its door |
| `0x8F04` | `0x55` (reverb 20) | instead, a piano or a Snorlax |
| `0x8F01` | `0x52` | a Swinub hits a sack (the Delibird spins round) |
| `0x8F02`, `0x8F03` | `0x53`, `0x54` (volume 110) | a Swinub knocks a Delibird over with no gifts; with gifts, which fly out |
| `0x8F05`-`0x8F09` | `0x56`-`0x5A` | a gift in the sack, by how full it is (1-5) |
| `0x8F0B` | `0x5C` (volume 90) | a gift onto the back belt |
| `0x8F0C` | `0x5D` (volume 53) | a footstep, at two frames of each walk, with fewer than four gifts |
| `0x8F10`, `0x8F11` | `0x51` (volume 75, pitch 0.65; 85, 0.5) | walking with four gifts; five |
| `0x8F12` (`0x8012`) | second table `0x20` | every frame the points count up at the end |
| `0x8F13` | second table `0x21` (volume 120) | a player's points all counted |
| `0x8F14`, `0x8F15` | second table `0x24` (volume 127), `0x25` (120) | a ring comes in on the belt; a piano |
| `0x8F16`-`0x8F19` | second table `0x26`-`0x29` (volume 120) | x2-x5: the same gift through a door again |

`0x8F0A` (sound `0x5B`) and `0x8F0D`-`0x8F0F` (`0x51` at volume 10-30) aren't
asked for by module #60.

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
