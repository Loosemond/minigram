"""Copy the extracted models and images the web minigames need into
web/minigames/assets/, and make their sound files from the ROM.

    python3 tools/web_assets.py [out] [web] [rom]

Run tools/ps2extract.py first. The copies are not in git (like out/). The ROM
defaults to the one in rom/. assets/ui/ has the HUD pictures the games share,
assets/<game>/ each game's own files (a player only downloads the games they
play).
"""
import glob
import os
import shutil
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ps2tool import audio, minigames, png  # noqa: E402
from ps2tool.rom import Rom  # noqa: E402

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(root, "out")
web = sys.argv[2] if len(sys.argv) > 2 else os.path.join(root, "web")
roms = [sys.argv[3]] if len(sys.argv) > 3 else sorted(glob.glob(os.path.join(root, "rom", "*.[zvn]64")))
site = os.path.join(web, "minigames", "assets")


def bank(b, i):
    return "images/banks/bank_%03d/%02d.png" % (b, i)


# The HUD pieces the minigames share: player badges (image bank 434: grey, COM
# in blue / green / red / yellow, then 1P-4P), the countdown (bank 360), small
# digits (404) and big ones with - and + (429), the champion title (358), and
# each game's name banner (403 Egg Emergency, 396 Clear Cut Challenge).
UI = {
    "title_egg.png": bank(403, 0),
    "title_clearcut.png": bank(396, 0),
    "champion.png": bank(358, 0),
    "go.png": bank(360, 3),
    "minus.png": bank(429, 10),
    "plus.png": bank(429, 11),
    "eggs.png": bank(404, 10),  # "EGGS", over Egg Emergency's counts
}
UI.update({"n%d.png" % i: bank(404, i) for i in range(10)})
UI.update({"big%d.png" % i: bank(429, i) for i in range(10)})
UI.update({"count%d.png" % (i + 1): bank(360, i) for i in range(3)})  # 1, 2, 3
for _i, _name in enumerate(["blank", "com", "com_blue", "com_green", "com_red", "com_yellow", "1p", "2p", "3p", "4p"]):
    UI["badge_%s.png" % _name] = bank(434, _i)

# Egg Emergency is code module #56. Besides objects 144 (Chansey), 145 (egg)
# and 185 (effect textures) it loads background picture 19 (0x8004D770) and
# image banks 152, 227, 404, 429 and 434 (0x8004CA70). The countdown is the
# shared bank 360. See docs/minigames.md.
EGG = {
    "chansey.glb": "objects/144_chansey/144_chansey.glb",
    "chansey.json": "objects/144_chansey/144_chansey.json",  # clip lengths, face frames
    "chansey_face2.png": "objects/144_chansey/textures/face/tex02.png",
    "chansey_face3.png": "objects/144_chansey/textures/face/tex03.png",
    "chansey_face4.png": "objects/144_chansey/textures/face/tex04.png",
    "egg.glb": "objects/145_egg/145_egg.glb",
    "fx_smoke.png": "objects/185_object_185/textures/tex01.png",
    "fx_burst.png": "objects/185_object_185/textures/tex02.png",
    "fx_sparks.png": "objects/185_object_185/textures/tex03.png",
    "backdrop.jpg": "images/backgrounds/19.jpg",  # the building, one column per player
}
EGG.update({"voltorb%d.png" % i: bank(227, i) for i in range(6)})  # Voltorb is a sprite here
EGG.update({"splash%02d.png" % i: bank(152, i) for i in range(12)})  # a missed egg hits the water

# Clear Cut Challenge is code module #53. It loads objects 122 (Scyther; 55
# Pinsir and 179 Scizor for players whose Game Pak Pokemon is one), 59 (the
# signpost the pieces are shown on), 130 and 131 (the cut's effects: flat
# shapes coloured as they're drawn, not used here), 190 (stars going round the
# head of a Scyther that's lost, at the end), 81, 111 and 112 (log
# slices, also unused: the log is the module's own, see ps2tool/minigames.py),
# background picture 15 and image banks 397 (Spinarak, 3 frames), 398 (a
# flash) and 399 ("1st CUT" ... "FINAL CUT").
CLEARCUT = {
    "backdrop.jpg": "images/backgrounds/15.jpg",  # the castle, behind a curtain
    "scyther.glb": "objects/122_scyther/122_scyther.glb",
    "signpost.glb": "objects/059_signpost/059_signpost.glb",
    "stars.glb": "objects/190_wall_pieces/190_wall_pieces.glb",
    "flash.png": bank(398, 0),
}
CLEARCUT.update({"spinarak%d.png" % i: bank(397, i) for i in range(3)})
CLEARCUT.update({"cut%d.png" % (i + 1): bank(399, i) for i in range(5)})

# Eager Eevee is code module #61. It loads objects 143 (Eevee), 149 (a
# field, not drawn: the remake's is src/eevee/field.js, built from background
# picture 44), 150 (Aipom on its rope, with the basket), 151 (Pineco), the
# fruit 209 (melon), 213 (grapes), 216 (a pile of strawberries) and 211 (one
# strawberry), the effects 203, 204 and 207, background picture 44 and image
# banks 307 (sparkles and puffs), 389 (each round's prize, for the tally:
# grapes, Pineco, melon, strawberries), 390 and 394 (digits), 392 ("ROUND 1"
# ... "FINAL ROUND"), 393 (the reaction time's ". sec." box) and 430 ("Points").
EEVEE = {
    "backdrop.jpg": "images/backgrounds/44.jpg",  # the field from the game's camera (for the title and lobby)
    "eevee.glb": "objects/143_eevee/143_eevee.glb",
    "aipom.glb": "objects/150_aipom_on_a_rope/150_aipom_on_a_rope.glb",
    "pineco.glb": "objects/151_pineco/151_pineco.glb",
    "melon.glb": "objects/209_melon/209_melon.glb",
    "grapes.glb": "objects/213_grapes/213_grapes.glb",
    "strawberries.glb": "objects/216_strawberries/216_strawberries.glb",
    "secs.png": bank(393, 0),
    "points.png": bank(430, 1),
    "dot.png": bank(430, 0),
}
EEVEE.update({"prize%d.png" % i: bank(389, i) for i in range(4)})
EEVEE.update({"round%d.png" % (i + 1): bank(392, i) for i in range(5)})
EEVEE.update({"t%d.png" % i: bank(394, i) for i in range(10)})
EEVEE.update({"s%d.png" % i: bank(390, i) for i in range(10)})
EEVEE.update({"fx%d.png" % i: bank(307, i) for i in range(10)})
UI["title_eevee.png"] = bank(388, 0)

# folder -> {asset name: file under out/}
FILES = {"ui": UI, "egg": EGG, "clearcut": CLEARCUT, "eevee": EEVEE}

# Sound (docs/audio.md). A game asks for song n, which the game plays as
# sequence n + 39. The effects are sounds of sequence 9, the one the game runs
# for them on sequence player 2; each comes with what the game's effect table
# gives it (EU RAM 0x80090E88, 16 bytes per effect: sound number (bit 7: the
# second table), volume, pitch, reverb, pan, channels).
def _sound(n, vol, rev, chans, **more):
    return dict(n=n, vol=vol, rev=rev, chans=chans, pitch=1.0, **more)


SHARED = {  # the minigames' bank (12)
    "count": _sound(0x7C, 127, 3, 0x0700),  # 0xCF00, a count's 3, 2, 1 (in Topsy-Turvy's code)
    "go": _sound(0x28, 127, 8, 0x0700),  # 0xCF06, its 0
    # 0xCF0B, the whistle at the end: its script writes the note it plays into
    # itself from the sound number, so the effect it ends up on (86) is listed by hand
    "finish": _sound(0x86, 117, 30, 0x0700, sfx=[86]),
    "tap": _sound(0x7D, 100, 3, 0x0030),  # 0xCF01, a menu button
}
SOUNDS = {
    # Egg Emergency asks for song 45 (sequence 84); after the finish, the
    # minigame results play song 55 (sequence 94), a fanfare: the remake plays
    # it when you win. Its effects are bank 7's:
    "egg": ({"egg": 84, "win": 94}, {
        "catch": _sound(0x4E, 83, 1, 0x0003),  # 0x7F01, an egg caught
        "shock": _sound(0x4F, 100, 1, 0x0003),  # 0x7F02, a Voltorb goes off
        "lost": _sound(0x4D, 103, 1, 0x0003),  # 0x7F00, and knocks eggs out (only then)
        "splash": _sound(0x2F, 100, 1, 0x0003),  # 0x7F05, a drop falls in the water
        **SHARED,
    }),
    # Clear Cut Challenge asks for song 18 (sequence 57) 30 frames into each
    # log, while Spinarak hauls it up, and song 19 (sequence 58) when the cut
    # logs are put on show. Its effects are bank 1's (0x1Fxx and the like):
    "clearcut": ({"hang": 57, "show": 58, "win": 94}, {
        "cut": _sound(0x07, 115, 1, 0x0001),  # 0x1F00, a cut
        "whiff": _sound(0x08, 105, 1, 0x0001),  # 0x1F01, a swing that misses
        "hanging": _sound(0x0C, 100, 1, 0x0200),  # 0x1005, held from the log's hanging ready to 50 frames after its drop
        # the crowd: these pick their effect from the sound number as they play
        # (as the finish whistle does), so it's listed by hand; 0x1D08 (0x0F,
        # effect 14) is left out: the code plays it for 14-19 points, which a cut can't score
        "next": _sound(0x0D, 90, 1, 0x4000, sfx=[12]),  # 0x1B06, a log comes up
        "allPerfect": _sound(0x0E, 110, 1, 0x4000, sfx=[13]),  # 0x1C07, someone cut it perfectly
        "allScored": _sound(0x10, 110, 1, 0x4000, sfx=[15]),  # 0x1E09, someone scored
        "ready": _sound(0x11, 110, 1, 0x0010),  # 0x1F0A, a Scyther gets ready, or lowers its scythes after a log
        "tallied": _sound(0x12, 127, 1, 0x0001),  # 0x1F0B, a log's points are in
        "perfect": _sound(0x2D, 127, 1, 0x0001),  # 0x1F0C, a perfect cut
        # 0x1F0D and 0x1F0E, the minigame's own count and GO
        **SHARED,
        "count": _sound(0xA2, 127, 5, 0x1000),
        "go": _sound(0xA3, 127, 5, 0x1000),
    }),
    # Eager Eevee asks for song 53 (sequence 92) for the races, 54 (93) as
    # Aipom calls each round and 101 for the final one (54 again, 40 beats a
    # minute faster: docs/audio.md). Its effects are bank 10's (0xAFxx):
    "eevee": ({"main": 92, "round": 93, "final": [93, 40], "win": 94}, {
        "aipom": _sound(0x68, 100, 2, 0x0010),  # 0xAF00, frame 5 of Aipom's call
        "lid": _sound(0x69, 100, 2, 0x0010),  # 0xAF01, frame 5 of Aipom's lift (the basket's up)
        "dash": _sound(0x6A, 127, 2, 0x0001),  # 0xAF02, a dash or a feint
        "back": _sound(0x6B, 100, 2, 0x0001),  # 0xAF03, bouncing back without the prize
        "bonk": _sound(0x6C, 100, 2, 0x0001),  # 0xAF04, into the basket before it's up
        "got": _sound(0x6D, 100, 2, 0x0001),  # 0xAF05, got the prize
        "boom": _sound(0x6F, 100, 2, 0x0010),  # 0xAF06, a Pineco goes off
        "blown": _sound(0x70, 100, 2, 0x0001),  # 0xAF07, a blown-up Eevee comes down
        "call": _sound(0x71, 110, 2, 0x0020),  # 0xAF08, Aipom's call starts
        "dazed": dict(_sound(0x6E, 127, 3, 0x0020), pitch=0.5),  # 0xAF0B, for each Eevee a Pineco blows up
        "munch": _sound(0x8A, 107, 7, 0x8000),  # 0xCA0F (bank 12), while an Eevee eats
        **SHARED,
    }),
}

missing = 0
for folder, files in FILES.items():
    dst = os.path.join(site, folder)
    for name, rel in files.items():
        src = os.path.join(out, rel)
        if not os.path.exists(src):
            print("missing", src)
            missing += 1
            continue
        os.makedirs(os.path.dirname(os.path.join(dst, name)), exist_ok=True)
        shutil.copyfile(src, os.path.join(dst, name))
    print(folder, len(files), "files ->", dst)

if roms:
    rom = Rom(roms[0])
    for name, (w, h, rgba) in minigames.clearcut_textures(rom).items():
        with open(os.path.join(site, "clearcut", name + ".png"), "wb") as fh:
            fh.write(png.encode_rgba(w, h, rgba))
    print("clearcut: the log's textures from code module #53")
    sound = audio.Audio(rom.data)
    for game, (songs, sounds) in SOUNDS.items():
        dst = os.path.join(site, game, "sound.bin")
        data = audio.web_pack(sound, songs, sounds, 9)
        with open(dst, "wb") as fh:
            fh.write(data)
        print(game, "sound.bin: %d KB ->" % (len(data) // 1024), dst)
else:
    print("no ROM in rom/: no sound, and no log for Clear Cut Challenge (the games play stand-ins)")
    missing += 1
sys.exit(1 if missing else 0)
