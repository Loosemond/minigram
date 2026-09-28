"""Copy the extracted models and images a web minigame needs into its assets/
folder, and make its sound file from the ROM.

    python3 tools/web_assets.py [out] [web] [rom]

Run tools/ps2extract.py first. The copies are not in git (like out/). The ROM
defaults to the one in rom/.
"""
import glob
import os
import shutil
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ps2tool import audio  # noqa: E402
from ps2tool.rom import Rom  # noqa: E402

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(root, "out")
web = sys.argv[2] if len(sys.argv) > 2 else os.path.join(root, "web")
roms = [sys.argv[3]] if len(sys.argv) > 3 else sorted(glob.glob(os.path.join(root, "rom", "*.[zvn]64")))


def bank(b, i):
    return "images/banks/bank_%03d/%02d.png" % (b, i)


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
    "ui/eggs.png": bank(404, 10),  # "EGGS"
    "ui/title.png": bank(403, 0),  # "EGG EMERGENCY"
    "ui/champion.png": bank(358, 0),
    "ui/go.png": bank(360, 3),
    "ui/minus.png": bank(429, 10),
    "ui/plus.png": bank(429, 11),
}
EGG.update({"ui/n%d.png" % i: bank(404, i) for i in range(10)})  # small digits
EGG.update({"ui/big%d.png" % i: bank(429, i) for i in range(10)})  # big digits
EGG.update({"ui/count%d.png" % (i + 1): bank(360, i) for i in range(3)})  # 1, 2, 3
EGG.update({"voltorb%d.png" % i: bank(227, i) for i in range(6)})  # Voltorb is a sprite here
EGG.update({"splash%02d.png" % i: bank(152, i) for i in range(12)})  # a missed egg hits the water
# player badges: grey, COM in blue / green / red / yellow, then 1P-4P
for i, name in enumerate(["blank", "com", "com_blue", "com_green", "com_red", "com_yellow", "1p", "2p", "3p", "4p"]):
    EGG["ui/badge_%s.png" % name] = bank(434, i)

# minigame -> {asset name: file under out/}
GAMES = {"egg-emergency": EGG}

# Sound (docs/audio.md). Egg Emergency asks for song 45, which the game plays
# as sequence 45 + 39; after the finish, the minigame results play song 55
# (sequence 94), a fanfare: the remake plays it when you win. The effects are
# sounds of sequence 9, the one the game runs for them on sequence player 2;
# each comes with what the game's effect table gives it (EU RAM 0x80090E88,
# 16 bytes per effect: sound number, volume, pitch, reverb, pan, channels):
#   catch   0x7F01  an egg caught             (the minigame's own bank, 7)
#   shock   0x7F02  a Voltorb goes off
#   lost    0x7F00  and knocks eggs out (only then)
#   splash  0x7F05  a drop falls in the water
#   count   0xCF00  the countdown's 3, 2, 1   (the minigames' shared bank, 12)
#   go      0xCF06  GO!
#   finish  0xCF0B  the whistle at the end (the song fades out with it)
#   tap     0xCF01  a menu button
# The finish whistle's script writes the note it plays into itself from the
# sound number, so the effect it ends up on (86) is listed by hand.
def _sound(n, vol, rev, chans, **more):
    return dict(n=n, vol=vol, rev=rev, chans=chans, pitch=1.0, **more)


SOUNDS = {"egg-emergency": ({"egg": 84, "win": 94}, {
    "catch": _sound(0x4E, 83, 1, 0x0003),
    "shock": _sound(0x4F, 100, 1, 0x0003),
    "lost": _sound(0x4D, 103, 1, 0x0003),
    "splash": _sound(0x2F, 100, 1, 0x0003),
    "count": _sound(0x7C, 127, 3, 0x0700),
    "go": _sound(0x28, 127, 8, 0x0700),
    "finish": _sound(0x86, 117, 30, 0x0700, sfx=[86]),
    "tap": _sound(0x7D, 100, 3, 0x0030),
})}

missing = 0
for game, files in GAMES.items():
    dst = os.path.join(web, game, "assets")
    for name, rel in files.items():
        src = os.path.join(out, rel)
        if not os.path.exists(src):
            print("missing", src)
            missing += 1
            continue
        os.makedirs(os.path.dirname(os.path.join(dst, name)), exist_ok=True)
        shutil.copyfile(src, os.path.join(dst, name))
    print(game, len(files), "files ->", dst)

if roms:
    sound = audio.Audio(Rom(roms[0]).data)
    for game, (songs, sounds) in SOUNDS.items():
        dst = os.path.join(web, game, "assets", "sound.bin")
        data = audio.web_pack(sound, songs, sounds, 9)
        with open(dst, "wb") as fh:
            fh.write(data)
        print(game, "sound.bin: %d KB ->" % (len(data) // 1024), dst)
else:
    print("no ROM in rom/: no sound (the game plays stand-ins)")
    missing += 1
sys.exit(1 if missing else 0)
