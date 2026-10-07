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

# Tumbling Togepi is code module #55. It loads Togepi (109; Omanyte, 206, for
# a Game Pak's Omanyte), the treadmills' platform (60), what comes along the
# belts: flowers (62), rocks (63, 64), logs (65-67), the dash arrows (202) and
# pillars (68-70, on no course), the dash's aura (188), and the scenery round
# it all (132-140, shown while the camera comes in and at the end); and image
# banks 226 (the whole track the belts scroll), 205 (Diglett, popping out of
# the belt: made into a strip below), 387 (the rank coins over the Togepi) and
# 434 (the badges), and 307 (Eager Eevee's effects: the shadows). Its name
# banner is bank 417.
_TG = "objects/%03d_%s/%03d_%s.glb"
TOGEPI = {name: _TG % (n, f, n, f) for name, n, f in (
    ("togepi.glb", 109, "togepi"), ("platform.glb", 60, "treadmill_platform"), ("flower.glb", 62, "flower_patch"),
    ("rock_s.glb", 63, "blue_rock"), ("rock.glb", 64, "blue_rock"), ("log_s.glb", 65, "log"), ("log_m.glb", 66, "log"),
    ("log_l.glb", 67, "log"), ("arrow.glb", 202, "dash_arrow"), ("aura.glb", 188, "dash_aura"),
    ("hills.glb", 132, "rainbow_arc"), ("plants.glb", 133, "small_plants"), ("grass_arc.glb", 134, "grass_arc"),
    ("cacti.glb", 135, "cacti"), ("thin_arc.glb", 136, "thin_arc"), ("ring.glb", 137, "grass_ring"),
    ("ring_dirt.glb", 138, "grass_ring"), ("pieces.glb", 139, "grass_pieces"), ("arc.glb", 140, "grass_arc"))}
TOGEPI["track.png"] = bank(226, 0)
TOGEPI["shadow.png"] = bank(307, 1)  # (the round shadow under each Togepi: Eager Eevee's bank, 0x86700020)
TOGEPI.update({"rank%d.png" % (i + 1): bank(387, i) for i in range(4)})
UI["title_togepi.png"] = bank(417, 0)

# Gutsy Golbat is code module #49. It loads Golbat (53) and Jynx (110: she
# stands at the cave's mouth at the end and throws hearts), and image banks
# 221 (the backdrops: the cave, its mouth, the meadow outside), 69 (Magnemite,
# a sprite in 5 frames) and 222 (the hearts: red, then outlined in 1P-4P's
# colours), both made into strips below, 343 (the glow behind each Golbat,
# coloured below) and 434 (the badges). Its name banner is bank 395.
GOLBAT = {
    "golbat.glb": "objects/053_golbat/053_golbat.glb",
    "jynx.glb": "objects/110_jynx/110_jynx.glb",
    "cave.png": bank(221, 0),
    "mouth.png": bank(221, 1),
    "meadow.png": bank(221, 2),
    "button_a.png": bank(51, 0),  # (the menus' A button: the flap button on a phone)
}
UI["title_golbat.png"] = bank(395, 0)

# Barrier Ball is code module #51. It loads the court (object 120: its floor,
# lines and hole, layouts 0-2, and its four walls, 3-6), Mr. Mime (218 in the
# play, 129 for the countdown and the end: each has its own clips), the
# barrier (141), the Poke Ball (154's first layout) and image bank 151 (the
# glow round a ball and its trail). Its name banner is bank 374.
_BB = "objects/120_court_floor/120_court_%s.glb"
BARRIER = {
    "mime.glb": "objects/218_mr_mime/218_mr_mime.glb",
    "mime_show.glb": "objects/129_mr_mime/129_mr_mime.glb",
    "barrier.glb": "objects/141_barrier/141_barrier.glb",
    "ball.glb": "objects/154_poke_ball/154_poke_ball.glb",
    **{name + ".glb": _BB % name for name in ("floor", "lines", "hole", "wall_top", "wall_left", "wall_bottom", "wall_right")},
    "glow.png": bank(151, 0),
    "button_a.png": bank(51, 0),  # (the menus' A button: the smash button on a phone)
}
UI["title_barrier.png"] = bank(374, 0)

# Rampage Rollout is code module #52. It loads Donphan (108: walking, and
# curled up rolling, layout 1), the track (113: its field, and the red frame
# round it, both at 0.37) and image banks 150 (a dust cloud: a whirlwind, 16
# frames), 159 (the dust a running Donphan kicks up, 8 frames), 384 (the stars
# over a Donphan, one for each cloud it has), all made into strips below (the
# clouds and stars in each player's colours), 307 (Eager Eevee's effects: the
# shadows), 385 (FINAL LAP!), 386 (the LAP gear), 387 (the rank coins) and 434
# (the badges). Its name banner is bank 383.
ROLLOUT = {
    "donphan.glb": "objects/108_donphan/108_donphan.glb",
    "donphan_rolling.glb": "objects/108_donphan/108_donphan_rolling.glb",
    "field.glb": "objects/113_green_field/113_green_field.glb",
    "frame.glb": "objects/113_green_field/113_red_frame.glb",
    "shadow.png": bank(307, 0),
    "final.png": bank(385, 0),
    "lap.png": bank(386, 0),
    "button_a.png": bank(51, 0),  # (the menus' A button: the dust cloud button on a phone)
}
ROLLOUT.update({"rank%d.png" % (i + 1): bank(387, i) for i in range(4)})
UI["title_rollout.png"] = bank(383, 0)
# a cloud's and a star's colours, by player (0x864095D0: the combiner makes
# env + (prim - env) x the picture's grey)
ROLLOUT_COLOURS = [((0xA5, 0xEB, 0xFF), (0x00, 0x23, 0xCD)), ((0xB9, 0xFF, 0xA5), (0x00, 0x69, 0x00)),
                   ((0xFF, 0xB9, 0xC3), (0x9B, 0x0F, 0x23)), ((0xFF, 0xF5, 0x87), (0x7D, 0x41, 0x00))]

# Topsy-Turvy is code module #47. It loads Hitmontop (115, one for each player:
# a Game Pak's shiny one) and, through a list (0x8600D760: 0x80071B20), the
# shadow (79), the rings round a Hitmontop after its RAPID SPIN (195-198, in
# 1P-4P's colours: 197 blue, 198 green, 195 red, 196 yellow), the sparks of a
# bump (199 and 200), and 123, 124, 152 and the whirlwinds 191-194, which
# nothing in it draws; and image banks 223 (the ring: its background picture),
# 401 (the points: a grey dot, then each player's colour; and the clock's
# balloon), 402 (the swirl round the clock), 151 (Barrier Ball's glow: the
# trail behind a Hitmontop sent reeling) and 434 (the badges). Its name banner
# is bank 400.
_HM = "objects/115_hitmontop/"
TOPSY = {
    "hitmontop.glb": _HM + "115_hitmontop.glb",
    "hitmontop.json": _HM + "115_hitmontop.json",  # clip lengths, face tracks
    "shadow.glb": "objects/079_shadow_disc/079_shadow_disc.glb",
    "ring0.glb": "objects/197_ring_blue/197_ring_blue.glb",
    "ring1.glb": "objects/198_ring_green/198_ring_green.glb",
    "ring2.glb": "objects/195_ring_red/195_ring_red.glb",
    "ring3.glb": "objects/196_ring_yellow/196_ring_yellow.glb",
    # (the sparks' own pictures: their models' texture coordinates come out wrong, so the remake draws them itself)
    "spark.png": "objects/199_spark/textures/tex03.png",
    "flash.png": "objects/200_flash/textures/tex01.png",
    "ring.png": bank(223, 0),
    "glow.png": bank(151, 0),  # (Barrier Ball's glow: the trail behind a Hitmontop sent reeling, in its hitter's colour)
    "balloon.png": bank(401, 5),
    "button_a.png": bank(51, 0),  # (the menus' A button: the RAPID SPIN button on a phone)
}
TOPSY.update({"dot%d.png" % i: bank(401, i) for i in range(5)})
TOPSY.update({"face%d.png" % i: _HM + "textures/face/tex%02d.png" % i for i in range(2, 7)})
TOPSY.update({"face%d.png" % i: _HM + "textures/face/tex%02d_ms.png" % i for i in range(8, 11)})
UI["title_topsy.png"] = bank(400, 0)

# folder -> {asset name: file under out/}
FILES = {"ui": UI, "egg": EGG, "clearcut": CLEARCUT, "eevee": EEVEE, "stampede": STAMPEDE, "pichu": PICHU,
         "togepi": TOGEPI, "golbat": GOLBAT, "barrier": BARRIER, "rollout": ROLLOUT, "topsy": TOPSY}

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
    # Tumbling Togepi asks for song 46 (sequence 85) at GO. Its effects are
    # bank 9's (0x9Fxx), its count and GO bank 5's (0x5F07, 0x5F08: the GO
    # again as each Togepi reaches the goal) and the crowd for the first
    # there Clear Cut Challenge's (0x1C07)
    "togepi": ({"main": 85, "win": 94}, {
        "bounce": _sound(0x60, 95, 1, 0x0001),  # 0x9F00, a hop over a log, or off a Diglett coming up
        "knock": _sound(0x61, 110, 1, 0x0001),  # 0x9F01, knocked by a rock or a Diglett, or tripped by a log
        "cheer": _sound(0x62, 110, 1, 0x0001),  # 0x9F02, a winner's cheer (20 frames into clip 6)
        "step": _sound(0x63, 60, 1, 0x0001),  # 0x9F03, a footstep (frames 14 and 32 of the run)
        "flowerStep": _sound(0x64, 85, 1, 0x0001),  # 0x9F04, a footstep in the flowers
        "dash": dict(_sound(0xAE, 110, 3, 0x0001), pitch=1.24),  # 0x9F0B, 3 frames into a dash
        "crowd": _sound(0x0E, 110, 1, 0x4000, sfx=[13]),  # 0x1C07, the first to the goal
        **SHARED,
        "count": _sound(0x3F, 100, 2, 0x0C00),  # 0x5F07
        "go": _sound(0x40, 127, 2, 0x0C00),  # 0x5F08
    }),
    # Gutsy Golbat asks for song 13 (sequence 52) at GO. Its effects are bank
    # 0's (0x0Fxx), panned to the Golbat's x; the shared count (0xCF00) and
    # 0xCF06 sound the play's last three seconds and its end
    "golbat": ({"main": 52, "win": 94}, {
        "bump": _sound(0x00, 110, 2, 0x1000),  # 0x0F01, a dash knocks a heart out of a Golbat
        "zap": _sound(0x01, 110, 2, 0x1000),  # 0x0F02, a Magnemite hits one
        "wing": _sound(0x02, 63, 3, 0x0001),  # 0x0F03, a wingbeat (each time its flying clip comes round)
        "got": _sound(0x03, 110, 3, 0x0100),  # 0x0F04, a heart caught
        "drop": _sound(0x04, 110, 3, 0x0100),  # 0x0F05, a heart knocked out
        **SHARED,
        "lastCount": SHARED["count"],
        "lastGo": SHARED["go"],
        "count": _sound(0x05, 100, 5, 0x0010),  # 0x0F06, the minigame's own count
        "go": _sound(0x06, 127, 5, 0x0010),  # 0x0F07, and GO (with song 13)
    }),
    # Barrier Ball asks for song 35 (sequence 74) at GO. Its effects are bank
    # 6's (0x6Fxx), placed by where they happen; 0x42-0x47 share a script that
    # picks its effect from the sound number as it plays (effect = sound - 25),
    # so those are listed by hand. Its count and GO are Pichu's Power Plant's
    # (0x2F00, 0x2F01); the shared count (0xCF00) sounds the last three seconds
    "barrier": ({"main": 74, "win": 94}, {
        "smash": dict(_sound(0x42, 100, 4, 0x0030, sfx=[41]), pitch=1.08),  # 0x6F00, a smash (panned to the player)
        "swish": _sound(0x43, 75, 4, 0x0030, sfx=[42]),  # 0x6F01, a Mr. Mime moving fast
        "spawn": _sound(0x44, 100, 1, 0x0003, sfx=[43]),  # 0x6F02, a ball comes up in the hole
        "hit": _sound(0x45, 100, 4, 0x0003, sfx=[44]),  # 0x6F03, a barrier hits a ball
        "wall": _sound(0x46, 100, 4, 0x0003, sfx=[45]),  # 0x6F04, a ball off a wall
        "goal": _sound(0x47, 122, 4, 0x0003, sfx=[46]),  # 0x6F05, a goal...
        "goal2": _sound(0x6D, 100, 3, 0x0300),  # 0x6F0B, ...with this
        "serve": _sound(0x48, 95, 1, 0x0003),  # 0x6F06, a ball flies off out of the hole
        "hitSmash": dict(_sound(0x49, 95, 1, 0x0003), pitch=0.7),  # 0x6F07, a smashing barrier hits it
        "hit1": dict(_sound(0x4A, 85, 1, 0x0003), pitch=0.9),  # 0x6F08, a hit that curls it a little
        "hit2": dict(_sound(0x4B, 85, 4, 0x0003), pitch=0.75),  # 0x6F09, more
        "hit3": dict(_sound(0x4C, 93, 4, 0x0003), pitch=1.1),  # 0x6F0A, a lot
        "zing": _sound(0xAF, 100, 4, 0x0030),  # 0x6F0C, with 0x6F07 and 0x6F0A
        **SHARED,
        "lastCount": SHARED["count"],
        "count": _sound(0x13, 100, 5, 0x0100, sfx=[16]),  # 0x2F00
        "go": _sound(0x14, 100, 5, 0x0100, sfx=[17]),  # 0x2F01 (with song 35)
    }),
    # Rampage Rollout asks for song 34 (sequence 73) 30 frames after GO, and
    # song 100 when the leader starts the final lap: that's 34 again, 17 beats a
    # minute faster (the remake speeds the song up). Its effects are bank 5's
    # (0x5Fxx, and 0x5001, 0x5404: the same entries), placed by where they
    # happen; 0x4F06 is bank 4's, 0x1C07 bank 1's (the crowd: the first in)
    "rollout": ({"main": 73, "win": 94}, {
        "step": dict(_sound(0x38, 75, 1, 0x0001), pitch=0.49),  # 0x5F00, a footstep (each time the run comes round)
        "roll": _sound(0x3C, 83, 1, 0x0001),  # 0x5001, rolling (every frame of it)
        "hit": _sound(0x3A, 95, 1, 0x0010),  # 0x5F03, sent flying by a cloud, or knocked over
        "dizzy": dict(_sound(0x3B, 67, 1, 0x1000), pitch=1.24),  # 0x5404, every 5 frames of it
        "slump": dict(_sound(0x3D, 100, 1, 0x0001), pitch=0.35),  # 0x5F05, a loser at the end (15 frames into clip 3)
        "cheer": dict(_sound(0x3E, 100, 4, 0x1000), pitch=0.6),  # 0x5F06, a winner (4 frames into clip 2, twice)
        "lap": _sound(0x41, 105, 3, 0x0100, sfx=[40]),  # 0x5F09, the leader starts a lap (its script works out its effect, as 0x42-0x47's)
        "final": _sound(0x2E, 127, 2, 0x0200),  # 0x5F0A, the leader starts the final lap
        "cloud": _sound(0x36, 103, 1, 0x0010),  # 0x4F06, a dust cloud dropped
        "crowd": _sound(0x0E, 110, 1, 0x4000, sfx=[13]),  # 0x1C07, the first one in
        **SHARED,
        "count": _sound(0x3F, 100, 2, 0x0C00),  # 0x5F07, each count tick
        "go": _sound(0x40, 127, 2, 0x0C00),  # 0x5F08, GO, and each one in
    }),
    # Topsy-Turvy asks for song 33 (sequence 72) as the play starts. Its
    # effects are bank 4's (0x4Fxx; 0x4400 and 0x4401 are its first two
    # entries), placed by where they happen; a point is Gutsy Golbat's heart
    # (0x0F04); its count and GO are Pichu's Power Plant's (0x2F00, 0x2F01),
    # and the shared count (0xCF00, 0xCF06) sounds the last three seconds
    "topsy": ({"main": 72, "win": 94}, {
        # 0x4400, asked for each frame a Hitmontop spins (0x860032DC): at 1.25
        # (1 while its RAPID SPIN recharges); 0x4401 at 1.75 in a RAPID SPIN
        "hum": dict(_sound(0x30, 75, 1, 0x0001), pitch=1.25),
        "humCharge": _sound(0x30, 75, 1, 0x0001),
        "humSpin": dict(_sound(0x31, 98, 1, 0x0010), pitch=1.75),
        "spin": _sound(0x32, 98, 1, 0x1000),  # 0x4F02, a RAPID SPIN
        "hit1": _sound(0x33, 93, 1, 0x0700),  # 0x4F03, a bump (harder than 700000)
        "hit2": _sound(0x37, 93, 1, 0x0700),  # 0x4F07, a hard one (2000000)
        "hit3": _sound(0x34, 88, 1, 0x0700),  # 0x4F04, a RAPID SPIN's (8000000)
        "out": _sound(0x35, 108, 1, 0x0010),  # 0x4F05, knocked out of the ring
        "jump": _sound(0x36, 103, 1, 0x0010, sfx=[40]),  # 0x4F06, jumping in (its script picks its effect as it plays)
        "point": _sound(0x03, 110, 3, 0x0100),  # 0x0F04, a point
        **SHARED,
        "lastCount": SHARED["count"],
        "lastGo": SHARED["go"],
        "count": _sound(0x13, 100, 5, 0x0100, sfx=[16]),  # 0x2F00
        "go": _sound(0x14, 100, 5, 0x0100, sfx=[17]),  # 0x2F01
    }),
}

def flat_picture(glb_path, width, more=(), box=None, top=False):
    """A model drawn front on (looking down -z, no perspective) into a picture
    width pixels wide: (w, h, RGBA). Its parts go where its bones put them,
    and the nearest wins (a depth buffer). For the title's art, where a
    minigame has no background picture (Streaming Stampede's circus backdrop,
    Pichu's Power Plant's frame, Barrier Ball's court). more: other models
    with it, (path, dx, dy) each; box: (x0, y0, x1, y1), the part of it to
    draw (else all of it); top: seen from above (looking down -y, +x right
    and -z up), for a model that lies flat (Rampage Rollout's track)."""
    import json
    import struct
    import zlib

    def parse(path, dx, dy):
        d = open(path, "rb").read()
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
            x, y, z = (m[i][0] * p[0] + m[i][1] * p[1] + m[i][2] * p[2] + m[i][3] for i in range(3))
            if top:
                x, y, z = x, -z, y
            return x + dx, y + dy, z

        parts = []
        for m in j["meshes"]:
            for p in m["primitives"]:
                pos = accessor(p["attributes"]["POSITION"])
                jn = accessor(p["attributes"]["JOINTS_0"]) if "JOINTS_0" in p["attributes"] else [(0,)] * len(pos)
                ps = [place(v, k[0]) for v, k in zip(pos, jn)]
                tx = j["materials"][p["material"]]["pbrMetallicRoughness"].get("baseColorTexture")
                if "TEXCOORD_0" not in p["attributes"] or not tx:
                    parts.append((ps, None))
                    continue
                tex = j["textures"][tx["index"]]
                smp = j["samplers"][tex["sampler"]] if "sampler" in tex else {}
                parts.append((ps, (accessor(p["attributes"]["TEXCOORD_0"]), [i[0] for i in accessor(p["indices"])],
                                   image(tex["source"]), smp.get("wrapS", 10497), smp.get("wrapT", 10497))))
        return parts

    prims = parse(glb_path, 0, 0)
    for path, dx, dy in more:
        prims += parse(path, dx, dy)
    if box:
        x0, y0, x1, y1 = box
    else:
        x0 = min(v[0] for ps, _ in prims for v in ps)
        x1 = max(v[0] for ps, _ in prims for v in ps)
        y0 = min(v[1] for ps, _ in prims for v in ps)
        y1 = max(v[1] for ps, _ in prims for v in ps)
    k = width / (x1 - x0)
    W, H = width, int(round((y1 - y0) * k))
    out = bytearray(W * H * 4)
    depth = [-math.inf] * (W * H)

    def wrap(c, n, mode):
        i = int(math.floor(c * n))
        if mode == 33071:
            return min(n - 1, max(0, i))
        if mode == 33648:
            i %= 2 * n
            return i if i < n else 2 * n - 1 - i
        return i % n
    for ps, drawn in prims:
        if not drawn:
            continue
        uv, idx, (tw, th, texels), wrap_s, wrap_t = drawn
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
                    o = (wrap(v, th, wrap_t) * tw + wrap(u, tw, wrap_s)) * 4
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

# Barrier Ball's art for the title and the lobby: its court from above, as
# the game puts it (the pieces at 0.1, the walls 180 from the middle)
_court = os.path.join(site, "barrier", "floor.glb")
if os.path.exists(_court):
    _walls = [(os.path.join(site, "barrier", name), dx, dy) for name, dx, dy in (
        ("lines.glb", 0, 0), ("hole.glb", 0, 0), ("wall_top.glb", 0, 18), ("wall_left.glb", -18, 0),
        ("wall_bottom.glb", 0, -18), ("wall_right.glb", 18, 0))]
    with open(os.path.join(site, "barrier", "art.png"), "wb") as fh:
        fh.write(png.encode_rgba(*flat_picture(_court, 400, _walls, (-27, -27, 27, 27))))

# Rampage Rollout's art for the title and the lobby: its track from above (and the meadow round it)
_field = os.path.join(site, "rollout", "field.glb")
if os.path.exists(_field):
    with open(os.path.join(site, "rollout", "art.png"), "wb") as fh:
        fh.write(png.encode_rgba(*flat_picture(_field, 400, [(os.path.join(site, "rollout", "frame.glb"), 0, 0)],
                                               (-15, -12.5, 15, 12.5), top=True)))

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
    # Tumbling Togepi's Diglett (bank 205: its hole, then coming up), side by
    # side; and its art for the title and the lobby: the track (bank 226),
    # its eight 256 px lengths side by side, START to GOAL
    frames = images.bank_images(rom, 205)
    w, h = frames[0][1], frames[0][2]
    rows = [b"".join(rgba[y * w * 4:(y + 1) * w * 4] for _, _, _, rgba in frames) for y in range(h)]
    with open(os.path.join(site, "togepi", "diglett.png"), "wb") as fh:
        fh.write(png.encode_rgba(w * len(frames), h, b"".join(rows)))
    (_, tw, th, track), = images.bank_images(rom, 226)
    gap, n = 8, th // 256
    aw = n * tw + (n - 1) * gap
    art = bytearray(aw * 256 * 4)
    for y in range(256):
        for k in range(n):
            o = (y * aw + k * (tw + gap)) * 4
            art[o:o + tw * 4] = track[((k * 256 + y) * tw) * 4:((k * 256 + y) * tw + tw) * 4]
    with open(os.path.join(site, "togepi", "art.png"), "wb") as fh:
        fh.write(png.encode_rgba(aw, 256, bytes(art)))
    print("togepi: the Diglett strip and the art (image banks 205, 226)")
    # Gutsy Golbat's Magnemite (bank 69) and hearts (222), side by side; and the
    # glow behind each Golbat (bank 343, grey: its combiner 0x86109D64 makes a
    # texel env + (prim - env) x its grey, and its alpha 1 - the grey; the prim
    # and env colours each player's, 0x8610A224), one picture a player
    for name, b in (("magnemite", 69), ("hearts", 222)):
        frames = images.bank_images(rom, b)
        w, h = frames[0][1], frames[0][2]
        rows = [b"".join(rgba[y * w * 4:(y + 1) * w * 4] for _, _, _, rgba in frames) for y in range(h)]
        with open(os.path.join(site, "golbat", name + ".png"), "wb") as fh:
            fh.write(png.encode_rgba(w * len(frames), h, b"".join(rows)))
    (_, gw, gh, grey), = images.bank_images(rom, 343)[:1]
    for z, (prim, env) in enumerate((((0, 0, 255), (200, 200, 255)), ((0, 255, 0), (200, 255, 200)),
                                     ((255, 0, 0), (255, 200, 200)), ((255, 255, 0), (255, 255, 200)))):
        px = bytearray()
        for o in range(0, gw * gh * 4, 4):
            i = grey[o]
            px += bytes(e + (p - e) * i // 255 for p, e in zip(prim, env)) + bytes([255 - i])
        with open(os.path.join(site, "golbat", "glow%d.png" % z), "wb") as fh:
            fh.write(png.encode_rgba(gw, gh, bytes(px)))
    print("golbat: the Magnemite and heart strips and the glows (image banks 69, 222, 343)")
    # Rampage Rollout's dust (bank 159) and clouds (150), each a strip of its
    # frames; the clouds and the stars (384) in each player's colours
    def strip(frames):
        w, h = frames[0][1], frames[0][2]
        return w * len(frames), h, b"".join(b"".join(rgba[y * w * 4:(y + 1) * w * 4] for _, _, _, rgba in frames)
                                             for y in range(h))

    def tint(rgba, prim, env):
        px = bytearray(rgba)
        for o in range(0, len(px), 4):
            g = px[o]
            px[o:o + 3] = bytes(e + (p - e) * g // 255 for p, e in zip(prim, env))
        return bytes(px)
    with open(os.path.join(site, "rollout", "dust.png"), "wb") as fh:
        fh.write(png.encode_rgba(*strip(images.bank_images(rom, 159))))
    clouds, star = strip(images.bank_images(rom, 150)), images.bank_images(rom, 384)[0]
    for z, (prim, env) in enumerate(ROLLOUT_COLOURS):
        with open(os.path.join(site, "rollout", "cloud%d.png" % z), "wb") as fh:
            fh.write(png.encode_rgba(clouds[0], clouds[1], tint(clouds[2], prim, env)))
        with open(os.path.join(site, "rollout", "star%d.png" % z), "wb") as fh:
            fh.write(png.encode_rgba(star[1], star[2], tint(star[3], prim, env)))
    print("rollout: the dust and cloud strips and the stars (image banks 159, 150, 384)")
    # Topsy-Turvy's brick floor, to go on past its picture's edges in a window
    # wider or taller than the game's: a strip of it from the picture's top, between the corner rings
    _, rw, rh, ring = images.bank_images(rom, 223)[0]
    x0, y0, cw, ch = 96, 0, 128, 32
    with open(os.path.join(site, "topsy", "bricks.png"), "wb") as fh:
        fh.write(png.encode_rgba(cw, ch, b"".join(ring[((y0 + y) * rw + x0) * 4:((y0 + y) * rw + x0 + cw) * 4] for y in range(ch))))
    # and the swirl round its clock (bank 402, 4 frames): white, as bright as the picture is (0x8600B328)
    for k, (_, sw, sh, rgba) in enumerate(images.bank_images(rom, 402)):
        px = bytearray(rgba)
        for o in range(0, len(px), 4):
            px[o + 3] = px[o + 3] * max(px[o:o + 3]) // 255
            px[o:o + 3] = b"\xff\xff\xff"
        with open(os.path.join(site, "topsy", "swirl%d.png" % k), "wb") as fh:
            fh.write(png.encode_rgba(sw, sh, bytes(px)))
    print("topsy: the brick floor and the clock's swirl (image banks 223, 402)")
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
