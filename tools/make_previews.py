#!/usr/bin/env python3
"""Render labelled thumbnail sheets of everything ps2extract.py exported.

    python3 tools/make_previews.py [out] [--blender PATH]

Writes out/previews/<category>_<page>.png and one thumbnail per model in
out/thumbs/ (used by the Blender add-on's asset browser; paths match
out/catalog.json). Needs Blender and Pillow.
Categories: pokemon, objects, effect_sprites, effect_models, stages, scenes.
"""
import glob
import os
import subprocess
import sys

from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ps2tool.catalog import thumb_path  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
# absolute: Blender on Windows resolves relative render paths against the drive root
out = os.path.abspath(next((a for a in sys.argv[1:] if not a.startswith("--")), "out"))
blender = "/Applications/Blender.app/Contents/MacOS/Blender"
if "--blender" in sys.argv:
    blender = sys.argv[sys.argv.index("--blender") + 1]

only = [a for a in sys.argv[1:] if a.startswith("--only=")]
CATS = {
    "pokemon": ("pokemon/*/*.glb", 12, "exclude_shiny"),
    "objects": ("objects/*/*.glb", 20, None),
    "effect_sprites": ("effects/*/shape_*.glb", 10, None),
    "effect_models": ("effects/*/model_*.glb", 20, None),
    "stages": ("stages/*.glb", 40, None),
    "scenes": ("scenes/*.glb", 30, None),
}
PAGE, CELL, COLS, THUMB = 100, 128, 10, 192
pdir = os.path.join(out, "previews")
os.makedirs(pdir, exist_ok=True)
for cat, (pattern, pitch, flt) in CATS.items():
    if only and cat not in only[0][7:].split(","):
        continue
    files = sorted(glob.glob(os.path.join(out, pattern)))
    if flt == "exclude_shiny":
        files = [f for f in files if not f.endswith("_shiny.glb")]
    for page in range(0, len(files), PAGE):
        chunk = files[page:page + PAGE]
        tmp = os.path.join(pdir, ".tmp_%s_%d.png" % (cat, page // PAGE))
        env = dict(os.environ, EEVEE="1", PITCH=str(pitch))
        subprocess.run([blender, "-b", "--python", os.path.join(HERE, "blender_contact_sheet.py"), "--",
                        tmp, str(THUMB)] + chunk, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        cells_dir = os.path.splitext(tmp)[0] + "_cells"
        rowsl = [ln.split("\t") for ln in open(os.path.splitext(tmp)[0] + ".txt", encoding="utf-8").read().split("\n") if ln]
        cellfiles = [r[0] for r in rowsl]
        names = []
        for pth in [r[1] for r in rowsl]:
            base = os.path.splitext(os.path.basename(pth))[0]
            parent = os.path.basename(os.path.dirname(pth))
            names.append(parent + "/" + base if parent.startswith("fx_") else base)
        rows = (len(names) + COLS - 1) // COLS
        sheet = Image.new("RGB", (COLS * CELL, rows * (CELL + 14)), (40, 44, 52))
        dr = ImageDraw.Draw(sheet)
        for i, name in enumerate(names):
            x, y = (i % COLS) * CELL, (i // COLS) * (CELL + 14)
            im = Image.open(cellfiles[i]).convert("RGB")
            th = os.path.join(out, thumb_path(os.path.relpath(rowsl[i][1], out).replace(os.sep, "/")))
            os.makedirs(os.path.dirname(th), exist_ok=True)
            im.save(th)
            sheet.paste(im.resize((CELL, CELL), Image.LANCZOS), (x, y + 14))
            dr.text((x + 2, y + 1), name[:21], fill=(255, 230, 90))
        path = os.path.join(pdir, "%s_%02d.png" % (cat, page // PAGE))
        sheet.save(path)
        for f in glob.glob(os.path.join(cells_dir, "*")):
            os.remove(f)
        os.rmdir(cells_dir)
        for f in (tmp, os.path.splitext(tmp)[0] + ".txt"):
            if os.path.exists(f):
                os.remove(f)
        print(path, len(names))
