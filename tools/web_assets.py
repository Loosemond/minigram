"""Copy the extracted models and images the web minigames need into
web/minigames/assets/, and make their sound files from the ROM.

    python3 tools/web_assets.py [out] [web] [rom]

Run tools/ps2extract.py first. The copies are not in git (like out/). The ROM
defaults to the one in rom/. assets/ui/ has the HUD pictures the games share,
assets/<game>/ each game's own files (a player only downloads the games they
play).
"""
import glob
import math
import os
import shutil
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ps2tool import audio, images, minigames, names, png, upscale  # noqa: E402
from ps2tool.rom import Rom  # noqa: E402

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(root, "out")
web = sys.argv[2] if len(sys.argv) > 2 else os.path.join(root, "web")
roms = [sys.argv[3]] if len(sys.argv) > 3 else sorted(glob.glob(os.path.join(root, "rom", "*.[zvn]64")))
site = os.path.join(web, "minigames", "assets")


def bank(b, i):
    folder = names.bank_folder(b)
    if not os.path.isdir(os.path.join(out, "images", "banks", folder)):
        folder = "bank_%03d" % b  # (extracted before the bank had a name)
    return "images/banks/%s/%02d.png" % (folder, i)


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
    "stars.glb": "objects/190_dizzy_stars/190_dizzy_stars.glb",
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

# Streaming Stampede is code module #59. It loads the players' Cleffa (object
# 114; 186 is a shiny one, for a Game Pak's shiny Cleffa) and Igglybuff (119;
# 205 shiny), the studio: 117 (the circus backdrop), 116 (the ramp), 118
# (books), the players' booths (80 blue, 100 green, 101 purple, 102 yellow:
# each with a lamp, a three-digit counter and its player's spot), UI layouts 125-133 (0x8004DD4C, archive 0x1E40000),
# and image banks 201-220 (the Pokemon that go by, each a sprite in a few
# frames: made into one strip a bank below), 415 (digits) and 416 (its
# words: "Question", "Let's count ...", "Stop!", "The answer is ..."...).
STAMPEDE = {
    "cleffa.glb": "objects/114_cleffa/114_cleffa.glb",
    "igglybuff.glb": "objects/119_igglybuff/119_igglybuff.glb",
    "backdrop.glb": "objects/117_circus_backdrop/117_circus_backdrop.glb",
    "ramp.glb": "objects/116_ramp/116_ramp.glb",
    "books.glb": "objects/118_books/118_books.glb",
    "booth0.glb": "objects/080_booth_blue/080_booth_blue.glb",
    "booth1.glb": "objects/100_booth_green/100_booth_green.glb",
    "booth2.glb": "objects/101_booth_purple/101_booth_purple.glb",
    "booth3.glb": "objects/102_booth_yellow/102_booth_yellow.glb",
    "cleffa.json": "objects/114_cleffa/114_cleffa.json",  # clip lengths, face tracks
    "igglybuff.json": "objects/119_igglybuff/119_igglybuff.json",
    "cleffa_face2.png": "objects/114_cleffa/textures/face/tex02.png",
    "cleffa_face3.png": "objects/114_cleffa/textures/face/tex03.png",
}
STAMPEDE.update({"igglybuff_face%d.png" % i: "objects/119_igglybuff/textures/face/tex%02d.png" % i for i in range(4)})
STAMPEDE.update({"d%d.png" % i: bank(415, i) for i in range(11)})  # 0-9 and a dot
STAMPEDE.update({"w%02d.png" % i: bank(416, i) for i in range(2, 20) if i not in (3, 7)})
# the question board (UI layouts 127-131 and 133): the "ALL" picture (412),
# the Pokemon's names (413), the answer's digits (414), the A button (51), the
# rod it hangs from, its caps and chain (165) and the arrow on it (345)
STAMPEDE.update({"name%02d.png" % i: bank(413, i) for i in range(18)})
STAMPEDE.update({"a%d.png" % i: bank(414, i) for i in range(10)})
STAMPEDE.update({"all.png": bank(412, 0), "button_a.png": bank(51, 0), "rod.png": bank(165, 0),
                 "rod_end.png": bank(165, 4), "chain.png": bank(165, 3), "arrow.png": bank(345, 4)})
# the question board shows what to count by the Pokemon's icon (the icons
# archive, by national dex number: the module asks for 25 for Pikachu, 172
# Pichu, ...; 0x8690581C)
STAMPEDE_DEX = [25, 172, 54, 50, 51, 100, 101, 84, 85, 218, 219, 138, 175, 81, 82]
for _d in STAMPEDE_DEX:
    _icon = glob.glob(os.path.join(out, "images", "icons", "icon_%03d_*.png" % _d))
    STAMPEDE["icon%d.png" % _d] = os.path.relpath(_icon[0], out) if _icon else "images/icons/icon_%03d.png" % _d
STAMPEDE_SPRITES = [b for b in range(201, 221) if b not in (214, 215)]  # (Xatu and Natu have pictures but never go by)
UI["title_stampede.png"] = bank(411, 0)

# Pichu's Power Plant is code module #54. It loads the power plant's frame
# (object 56: the four rooms and the B/A sign), the Electrode lamps (57),
# Pichu (107; Pikachu, 201, for a Game Pak's Pikachu), the dizzy stars (190),
# and image banks 224 (the sparks), 225 (the losers' lightning), 409 and 410
# (the gauges) and 434 (the badges, the shell's own). The sparks and the
# lightning are grey pictures the game colours as it draws them: made into
# strips below, coloured; the gauges are made from their pieces there too.
PICHU = {
    "frame.glb": "objects/056_power_plant_frame/056_power_plant_frame.glb",
    "lamp.glb": "objects/057_electrode_lamp/057_electrode_lamp.glb",
    "pichu.glb": "objects/107_pichu/107_pichu.glb",
    "stars.glb": "objects/190_dizzy_stars/190_dizzy_stars.glb",
    "pichu.json": "objects/107_pichu/107_pichu.json",  # its face tracks
    "button_a.png": bank(51, 0),
    "button_b.png": bank(51, 1),
}
PICHU.update({"frame_face%d.png" % i: "objects/056_power_plant_frame/textures/face/tex%02d.png" % i for i in range(6, 12)})
PICHU.update({"lamp_face%d.png" % i: "objects/057_electrode_lamp/textures/face/tex%02d.png" % i for i in range(2, 9)})
PICHU.update({"pichu_face%d.png" % i: "objects/107_pichu/textures/face/tex%02d%s.png" % (i, "_ms" if i in (2, 3) else "")
              for i in range(28)})
UI["title_pichu.png"] = bank(408, 0)

# folder -> {asset name: file under out/}
FILES = {"ui": UI, "egg": EGG, "clearcut": CLEARCUT, "eevee": EEVEE, "stampede": STAMPEDE, "pichu": PICHU}

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
    # Streaming Stampede asks for song 29 (sequence 68) in its opening, 30
    # (69, its tune) from the first question, 31 (70) for the results and 32
    # (71) before the last answer. Its effects are bank 3's (0x3xxx), and the
    # crowd is Clear Cut Challenge's (bank 1):
    "stampede": ({"intro": 68, "main": 69, "results": 70, "reveal": 71, "win": 94}, {
        # 0x21-0x28 share a script that picks its effect from the sound
        # number as it plays (effect = sound - 7), so they're listed by hand
        "press": _sound(0x22, 110, 7, 0x0004, sfx=[27]),  # 0x3F02, a count, panned to the player
        "card": _sound(0x27, 105, 8, 0x0001, sfx=[32]),  # 0x3F07, a question's card
        "lastCard": _sound(0x73, 127, 8, 0x0001),  # 0x3F0B, the last question's
        "cardOn": _sound(0x23, 105, 4, 0x0002, sfx=[28]),  # 0x3F03, 36 frames into the card
        "stop": _sound(0x28, 105, 8, 0x0001, sfx=[33]),  # 0x3F08, "Stop!"
        "drum": _sound(0x20, 105, 5, 0x0002),  # 0x3000, a frame before the answer shows
        "answer": _sound(0x21, 105, 5, 0x0002, sfx=[26]),  # 0x3F01, the answer shows
        "right": _sound(0x25, 105, 4, 0x0010, sfx=[30]),  # 0x3F05, someone's count is right
        "nobody": _sound(0x24, 105, 0, 0x0010, sfx=[29]),  # 0x3F04, nobody scored
        "tally": _sound(0x26, 108, 8, 0x000E, sfx=[31]),  # 0x3F06, the points counting in
        "tallyLast": _sound(0x5F, 110, 8, 0x0002),  # 0x310A, the last question's
        "rise": _sound(0x5E, 90, 8, 0x0100),  # 0x3209, a booth going up
        # the crowd (as in Clear Cut Challenge: these pick their effect as they play)
        "allPerfect": _sound(0x0E, 110, 1, 0x4000, sfx=[13]),  # 0x1C07, after the last answer
        "someRight": _sound(0x0F, 110, 1, 0x4000, sfx=[14]),  # 0x1D08, someone was right
        "allScored": _sound(0x10, 110, 1, 0x4000, sfx=[15]),  # 0x1E09, someone scored
        **SHARED,
    }),
    # Pichu's Power Plant asks for song 21 (sequence 60) at GO. Its effects
    # are bank 2's (0x2Fxx); 0x13-0x1B share a script that picks its effect
    # from the sound number as it plays (effect = sound - 3), so those are
    # listed by hand
    "pichu": ({"main": 60, "win": 94}, {
        "pop": _sound(0x16, 100, 4, 0x1000, sfx=[19]),  # 0x2F03, an Electrode pops out
        **{"turn%d" % i: _sound(0x17 + i, 90, 2, 0x0001, sfx=[20 + i]) for i in range(4)},  # 0x2F04-0x2F07, a player turns
        "shock": _sound(0x1B, 90, 2, 0x0001, sfx=[24]),  # 0x2F08, a miss
        "zapA": _sound(0x1C, 90, 2, 0x0001),  # 0x2F09, 1P's and 4P's lightning, if they lost
        "zapB": _sound(0x1D, 90, 2, 0x0001),  # 0x2F0A, 2P's and 3P's
        "hum": _sound(0x1E, 70, 5, 0x0010),  # 0x200B, while a player charges
        "jingle0": _sound(0x1F, 100, 5, 0x0100),  # 0x2F0C, 50 frames after the finish (unless all four won)
        "jingle1": _sound(0x29, 100, 5, 0x0010),  # 0x2F0D, with it
        "jingle2": _sound(0x2A, 100, 5, 0x0010),  # 0x2F0E, at 70
        "jingle3": _sound(0x2B, 100, 5, 0x0010),  # 0x2F0F, at 90
        "jingle4": _sound(0x2C, 100, 5, 0x0010),  # 0x2F10, at 110
        "cry": _sound(0x15, 100, 2, 0x0001),  # 0x2F11, a Pichu winner's cry
        **SHARED,
        "count": _sound(0x13, 100, 5, 0x0100, sfx=[16]),  # 0x2F00, the minigame's own count
        "go": _sound(0x14, 100, 5, 0x0100, sfx=[17]),  # 0x2F01, and GO
    }),
}

def flat_picture(glb_path, width):
    """A model drawn front on (looking down -z, no perspective) into a picture
    width pixels wide: (w, h, RGBA). Its parts go where its bones put them,
    and the nearest wins (a depth buffer). For the title's art, where a
    minigame has no background picture (Streaming Stampede's circus backdrop,
    Pichu's Power Plant's frame)."""
    import json
    import struct
    import zlib
    d = open(glb_path, "rb").read()
    n = struct.unpack_from("<I", d, 12)[0]
    j = json.loads(d[20:20 + n])
    blob = d[28 + n:]

    def view(i):
        bv = j["bufferViews"][i]
        return blob[bv.get("byteOffset", 0):bv.get("byteOffset", 0) + bv["byteLength"]]

    def accessor(i):
        a = j["accessors"][i]
        size = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}[a["type"]]
        fmt = {5126: "f", 5123: "H", 5121: "B"}[a["componentType"]]
        raw = view(a["bufferView"])[a.get("byteOffset", 0):]
        vals = struct.unpack_from("<%d%s" % (a["count"] * size, fmt), raw)
        return [vals[k:k + size] for k in range(0, len(vals), size)]

    def image(i):  # the extractor's own PNGs: RGBA, filter 0 on every row
        png = view(j["images"][i]["bufferView"])
        w, h = struct.unpack_from(">II", png, 16)
        o, idat = 8, b""
        while o < len(png):
            ln, typ = struct.unpack_from(">I4s", png, o)
            if typ == b"IDAT":
                idat += png[o + 8:o + 8 + ln]
            o += 12 + ln
        raw = zlib.decompress(idat)
        assert all(raw[y * (w * 4 + 1)] == 0 for y in range(h))
        return w, h, b"".join(raw[y * (w * 4 + 1) + 1:(y + 1) * (w * 4 + 1)] for y in range(h))

    # each node's place: translation, rotation (a quaternion) and scale, down the tree
    def local(nd):
        tx, ty, tz = nd.get("translation", (0, 0, 0))
        qx, qy, qz, qw = nd.get("rotation", (0, 0, 0, 1))
        sx, sy, sz = nd.get("scale", (1, 1, 1))
        r = [[1 - 2 * (qy * qy + qz * qz), 2 * (qx * qy - qz * qw), 2 * (qx * qz + qy * qw)],
             [2 * (qx * qy + qz * qw), 1 - 2 * (qx * qx + qz * qz), 2 * (qy * qz - qx * qw)],
             [2 * (qx * qz - qy * qw), 2 * (qy * qz + qx * qw), 1 - 2 * (qx * qx + qy * qy)]]
        return [[r[i][0] * sx, r[i][1] * sy, r[i][2] * sz, (tx, ty, tz)[i]] for i in range(3)]

    def mul(a, b):
        return [[sum(a[i][k] * b[k][jj] for k in range(3)) + (a[i][3] if jj == 3 else 0) for jj in range(4)] for i in range(3)]
    world = {}

    def walk(i, parent):
        world[i] = mul(parent, local(j["nodes"][i]))
        for ch in j["nodes"][i].get("children", []):
            walk(ch, world[i])
    ident = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0]]
    for root in j["scenes"][j.get("scene", 0)]["nodes"]:
        walk(root, ident)
    joints = j["skins"][0]["joints"] if j.get("skins") else []

    def place(p, jn):
        m = world[joints[jn]] if joints else ident
        return tuple(m[i][0] * p[0] + m[i][1] * p[1] + m[i][2] * p[2] + m[i][3] for i in range(3))

    prims = []
    for m in j["meshes"]:
        for p in m["primitives"]:
            pos = accessor(p["attributes"]["POSITION"])
            jn = accessor(p["attributes"]["JOINTS_0"]) if "JOINTS_0" in p["attributes"] else [(0,)] * len(pos)
            prims.append((p, [place(v, k[0]) for v, k in zip(pos, jn)]))
    x0 = min(v[0] for _, ps in prims for v in ps)
    x1 = max(v[0] for _, ps in prims for v in ps)
    y0 = min(v[1] for _, ps in prims for v in ps)
    y1 = max(v[1] for _, ps in prims for v in ps)
    k = width / (x1 - x0)
    W, H = width, int(round((y1 - y0) * k))
    out = bytearray(W * H * 4)
    depth = [-math.inf] * (W * H)
    for p, ps in prims:
        if "TEXCOORD_0" not in p["attributes"]:
            continue
        uv = accessor(p["attributes"]["TEXCOORD_0"])
        idx = [i[0] for i in accessor(p["indices"])]
        mat = j["materials"][p["material"]]
        tx = mat["pbrMetallicRoughness"].get("baseColorTexture")
        if not tx:
            continue
        tex = j["textures"][tx["index"]]
        smp = j["samplers"][tex["sampler"]] if "sampler" in tex else {}
        tw, th, texels = image(tex["source"])

        def wrap(c, n, mode):
            i = int(math.floor(c * n))
            if mode == 33071:
                return min(n - 1, max(0, i))
            if mode == 33648:
                i %= 2 * n
                return i if i < n else 2 * n - 1 - i
            return i % n
        for t in range(0, len(idx), 3):
            a, b, c = idx[t:t + 3]
            (ax, ay), (bx, by), (cx, cy) = [((ps[i][0] - x0) * k, (y1 - ps[i][1]) * k) for i in (a, b, c)]
            den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
            if abs(den) < 1e-9:
                continue
            for py in range(max(0, int(min(ay, by, cy))), min(H, int(max(ay, by, cy)) + 1)):
                for px in range(max(0, int(min(ax, bx, cx))), min(W, int(max(ax, bx, cx)) + 1)):
                    sx, sy = px + 0.5, py + 0.5
                    wa = ((by - cy) * (sx - cx) + (cx - bx) * (sy - cy)) / den
                    wb = ((cy - ay) * (sx - cx) + (ax - cx) * (sy - cy)) / den
                    wc = 1 - wa - wb
                    if wa < -1e-6 or wb < -1e-6 or wc < -1e-6:
                        continue
                    z = wa * ps[a][2] + wb * ps[b][2] + wc * ps[c][2]
                    if z < depth[py * W + px]:
                        continue
                    u = wa * uv[a][0] + wb * uv[b][0] + wc * uv[c][0]
                    v = wa * uv[a][1] + wb * uv[b][1] + wc * uv[c][1]
                    o = (wrap(v, th, smp.get("wrapT", 10497)) * tw + wrap(u, tw, smp.get("wrapS", 10497))) * 4
                    if texels[o + 3] < 128:
                        continue
                    depth[py * W + px] = z
                    out[(py * W + px) * 4:(py * W + px) * 4 + 4] = texels[o:o + 4]
    return W, H, bytes(out)


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

# Streaming Stampede's circus backdrop, up close on a phone: its textures
# resampled from the game's to up to 4 times their size (ps2tool/upscale.py),
# and mipmapped. Only the backdrop: its painted colour edges are where it
# shows; the floor, stage, books and booths looked the same for 4-20 times the
# memory, so they keep the game's own
_glb = os.path.join(site, "stampede", "backdrop.glb")
if os.path.exists(_glb):
    upscale.upscale_glb(_glb, _glb)

# Streaming Stampede's art for the title and the lobby: its circus backdrop, flat
_backdrop = os.path.join(site, "stampede", "backdrop.glb")
if os.path.exists(_backdrop):
    with open(os.path.join(site, "stampede", "backdrop.png"), "wb") as fh:
        fh.write(png.encode_rgba(*flat_picture(_backdrop, 400)))

# Pichu's Power Plant's art for the title and the lobby: its frame, flat
_frame = os.path.join(site, "pichu", "frame.glb")
if os.path.exists(_frame):
    with open(os.path.join(site, "pichu", "art.png"), "wb") as fh:
        fh.write(png.encode_rgba(*flat_picture(_frame, 400)))

if roms:
    rom = Rom(roms[0])
    for name, (w, h, rgba) in minigames.clearcut_textures(rom).items():
        with open(os.path.join(site, "clearcut", name + ".png"), "wb") as fh:
            fh.write(png.encode_rgba(w, h, rgba))
    print("clearcut: the log's textures from code module #53")
    # each Pokemon that goes by in Streaming Stampede: its bank's pictures side by side
    for b in STAMPEDE_SPRITES:
        frames = images.bank_images(rom, b)
        w, h = frames[0][1], frames[0][2]
        assert all(f[1:3] == (w, h) for f in frames), b
        rows = [b"".join(rgba[y * w * 4:(y + 1) * w * 4] for _, _, _, rgba in frames) for y in range(h)]
        with open(os.path.join(site, "stampede", "s%d.png" % b), "wb") as fh:
            fh.write(png.encode_rgba(w * len(frames), h, b"".join(rows)))
    print("stampede: %d sprite strips (image banks %d-%d)" % (len(STAMPEDE_SPRITES), STAMPEDE_SPRITES[0], STAMPEDE_SPRITES[-1]))
    # the booths' digits in gold, as the counts show at an answer (prim colour FFC800: 0x8690D000)
    for k, w, h, rgba in images.bank_images(rom, 415)[:10]:
        px = bytearray(rgba)
        for o in range(0, len(px), 4):
            px[o + 1] = px[o + 1] * 200 // 255
            px[o + 2] = 0
        with open(os.path.join(site, "stampede", "g%d.png" % k), "wb") as fh:
            fh.write(png.encode_rgba(w, h, bytes(px)))
    # Pichu's Power Plant's sparks (bank 224, drawn white) and lightning (225,
    # yellow): the game's combiner makes a texel's colour prim + (1 - prim) x
    # its grey, and its alpha the grey (0x86600160, 0x86600020)
    for name, b, prim in (("spark", 224, (255, 255, 255)), ("bolt", 225, (255, 255, 0))):
        frames = images.bank_images(rom, b)
        w, h = frames[0][1], frames[0][2]
        rows = []
        for y in range(h):
            row = bytearray()
            for _, _, _, rgba in frames:
                for x in range(w):
                    i = rgba[(y * w + x) * 4]
                    row += bytes(c + (255 - c) * i // 255 for c in prim) + bytes([i])
            rows.append(bytes(row))
        with open(os.path.join(site, "pichu", name + ".png"), "wb") as fh:
            fh.write(png.encode_rgba(w * len(frames), h, b"".join(rows)))
    # its gauges' frame (0x86603604): bank 410's cap, its last column across
    # 54 pixels, and the cap again, mirrored: 70 x 14
    _, cw, ch, cap = images.bank_images(rom, 410)[0]
    rows = []
    for y in range(ch):
        row = [cap[(y * cw + x) * 4:(y * cw + x) * 4 + 4] for x in range(cw)]
        rows.append(b"".join(row + [row[-1]] * (70 - 2 * cw) + row[::-1]))
    with open(os.path.join(site, "pichu", "gauge.png"), "wb") as fh:
        fh.write(png.encode_rgba(70, ch, b"".join(rows)))
    # and its fill and the pulse over it: bank 409's pictures' first column
    # (the rest is clear), stretched as long as the charge
    for name, (_, fw, fh_, px) in zip(("gauge_fill", "gauge_glow"), images.bank_images(rom, 409)):
        with open(os.path.join(site, "pichu", name + ".png"), "wb") as fh:
            fh.write(png.encode_rgba(1, fh_, b"".join(px[y * fw * 4:y * fw * 4 + 4] for y in range(fh_))))
    print("pichu: the sparks, the lightning and the gauge (image banks 224, 225, 409, 410)")
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
