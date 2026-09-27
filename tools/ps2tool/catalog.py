"""out/catalog.json: every exported model with a readable name, category,
tags and thumbnail path, for browsing (the Blender add-on's asset browser)."""
import glob
import json
import os

CATEGORIES = ["Pokémon", "Objects", "Arenas", "Maps", "Effects"]


def thumb_path(rel):
    """Thumbnail (written by make_previews.py) of an exported .glb."""
    return "thumbs/" + os.path.splitext(rel)[0].replace("/", "__") + ".png"


def _json(path):
    try:
        with open(path) as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return {}


def _entry(out, glb, category, name, tags=(), group=None, **extra):
    rel = os.path.relpath(glb, out).replace(os.sep, "/")
    e = dict(category=category, name=name, path=rel, thumb=thumb_path(rel), tags=list(tags))
    if group:
        e["group"] = group
    e.update(extra)
    return e


def _title(move):
    return " ".join(w.capitalize() for w in move.split())


def build(out):
    items = []
    for glb in sorted(glob.glob(os.path.join(out, "pokemon", "*", "*.glb"))):
        if glb.endswith("_shiny.glb"):
            continue
        info = _json(os.path.splitext(glb)[0] + ".json")
        name = info.get("display") or os.path.basename(os.path.dirname(glb))
        items.append(_entry(out, glb, "Pokémon", name, info.get("tags", ["Pokémon"]),
                            clips=len(info.get("clips", []))))
    for glb in sorted(glob.glob(os.path.join(out, "objects", "*", "*.glb"))):
        info = _json(os.path.splitext(glb)[0] + ".json")
        name = info.get("display") or os.path.splitext(os.path.basename(glb))[0]
        items.append(_entry(out, glb, "Objects", name, info.get("tags", []),
                            clips=len(info.get("clips", [])), record=info.get("record")))
    for glb in sorted(glob.glob(os.path.join(out, "stages", "*.glb"))):
        info = _json(os.path.splitext(glb)[0] + ".json")
        items.append(_entry(out, glb, "Arenas", info.get("display") or os.path.basename(glb)[:-4],
                            info.get("tags", ["Arena"]), record=info.get("record")))
    for glb in sorted(glob.glob(os.path.join(out, "scenes", "*.glb"))):
        info = _json(os.path.splitext(glb)[0] + ".json")
        items.append(_entry(out, glb, "Maps", info.get("display") or os.path.basename(glb)[:-4],
                            info.get("tags", ["Region map"]), record=info.get("record")))
    for d in sorted(glob.glob(os.path.join(out, "effects", "fx_*"))):
        mod = next((_json(p) for p in glob.glob(os.path.join(d, "fx_*.json"))), {})
        group = mod.get("display") or os.path.basename(d)
        moves = [_title(m) for m in mod.get("used_by", []) if not m.startswith("(")]
        for glb in sorted(glob.glob(os.path.join(d, "*.glb"))):
            stem = os.path.basename(glb)[:-4]
            kind, _, num = stem.partition("_")
            label = ("particle %s" if kind == "shape" else "model %s") % num
            items.append(_entry(out, glb, "Effects", "%s · %s" % (group, label),
                                ["Effect", "particle" if kind == "shape" else "effect model"] + moves,
                                group=group, module=mod.get("module")))
    return items


def write_catalog(out):
    items = build(out)
    with open(os.path.join(out, "catalog.json"), "w") as fh:
        json.dump(dict(version=1, categories=CATEGORIES, items=items), fh, indent=1, ensure_ascii=False)
    return len(items)
