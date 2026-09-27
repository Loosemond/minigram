"""Copy the extracted models and images a web minigame needs into its assets/ folder.

    python3 tools/web_assets.py [out] [web]

Run tools/ps2extract.py first. The copies are not in git (like out/).
"""
import os
import shutil
import sys

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(root, "out")
web = sys.argv[2] if len(sys.argv) > 2 else os.path.join(root, "web")


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
sys.exit(1 if missing else 0)
