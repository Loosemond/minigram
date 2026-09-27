"""General 3D objects table (archive 0x2000000, 227 FRAGMENT models).

Each module has the same root as a Pokemon model: u16 id (= record index),
geo-layout list at +8, skeletal clip list at +0x0C and texture clip list at
+0x10, but the clips live inside the module. It holds minigame props and
characters, menu/intro set pieces, items and other scenery.
"""
import os

from .export import own_clips, write_model
from .fragment import Fragment, Model
from .names import object_name, slug

OBJECT_TABLE = 0x2000000


def export_object(rom, index, outdir, scale=0.01, textures_png=True, subdir="objects", texts=None):
    frag = Fragment(rom.archive(OBJECT_TABLE).get(index), "object_%03d" % index)
    probe = Model(frag)
    written = []
    nl = max(1, len(probe.layouts))
    folder = "%03d_%s" % (index, slug(object_name(index, 0, 1, texts)[0]))
    used = set()
    for li in range(nl):
        model = Model(frag)
        if model.layouts:
            model.layouts = [model.layouts[li]]
        model.build()
        clips, tracks, sets = own_clips(model)
        display, tags = object_name(index, li, nl, texts)
        base = "%03d_%s" % (index, slug(display))
        if base in used:  # layouts sharing a name
            base += "_%d" % li
        used.add(base)
        d = os.path.join(outdir, subdir, folder)
        info = write_model(model, base, d, clips, sets, scale, textures_png=textures_png and li == 0,
                           extra_info=dict(record=index, layout=li, display=display, tags=tags,
                                           source="objects table 0x2000000"))
        written.append((base, info))
    return written
