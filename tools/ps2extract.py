#!/usr/bin/env python3
"""Pokemon Stadium 2 asset extractor.

Exports Pokemon, minigame/object and battle-effect models (skeletons,
textures, animations) and arenas as binary glTF (.glb) for Blender, plus all
2D graphics and game text.

    python3 ps2extract.py ROM info
    python3 ps2extract.py ROM pokemon [25 150 ...]      (default: all)
    python3 ps2extract.py ROM objects [ids]             minigame props/characters, decorations
    python3 ps2extract.py ROM effects [module ids]      battle/move effects
    python3 ps2extract.py ROM images                    sprites, backgrounds, faces, icons
    python3 ps2extract.py ROM stages                    arenas + large scenes
    python3 ps2extract.py ROM text
    python3 ps2extract.py ROM all

Output goes to ./out (change with -o).
"""
import argparse
import json
import os
import re
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from ps2tool import clips as clipmod  # noqa: E402
from ps2tool import shiny as shinymod  # noqa: E402
from ps2tool import objects as objmod  # noqa: E402
from ps2tool import effects as fxmod  # noqa: E402
from ps2tool import images as imgmod  # noqa: E402
from ps2tool import names as namemod  # noqa: E402
from ps2tool import catalog as catmod  # noqa: E402
from ps2tool import text as textmod  # noqa: E402
from ps2tool.fragment import FLAME_CHANNEL_BASE, AuxAnim, Fragment, Model, raw_pose_anim  # noqa: E402
from ps2tool.gltf import build_gltf  # noqa: E402
from ps2tool.png import encode_rgba  # noqa: E402
from ps2tool.fragment import decode_texture  # noqa: E402
from ps2tool.rom import (MODEL_TABLE, POSE_TABLE, STADIUM_MODEL_TABLE, Archive,  # noqa: E402
                         Rom, decompress, is_archive)

SPECIAL = {252: "substitute", 253: "egg"}
for _i, _c in enumerate("BCDEFGHIJKLMNOPQRSTUVWXYZ"):
    SPECIAL[254 + _i] = "unown_" + _c


def slug(s):
    s = s.replace("♀", "_f").replace("♂", "_m").replace("é", "e")
    return re.sub(r"[^a-z0-9_]+", "", s.lower().replace(" ", "_").replace("-", "_").replace(".", "")) or "x"


def record_display(index, names):
    """Readable name of a Pokemon model record ('Pikachu', 'Unown B', ...)."""
    if index == 252:
        return "Substitute"
    if index == 253:
        return "Egg"
    if 254 <= index <= 278:
        return "Unown " + "BCDEFGHIJKLMNOPQRSTUVWXYZ"[index - 254]
    if 1 <= index <= 251 and names and index - 1 < len(names):
        return namemod.title(names[index - 1]).replace("Nidoran♀", "Nidoran ♀").replace("Nidoran♂", "Nidoran ♂")
    return "Record %03d" % index


def _clean(d, pattern):
    """Remove earlier exports in d whose names match pattern (renamed outputs)."""
    import shutil
    if not os.path.isdir(d):
        return
    for n in os.listdir(d):
        if re.match(pattern, n):
            p = os.path.join(d, n)
            shutil.rmtree(p) if os.path.isdir(p) else os.remove(p)


def record_name(index, names):
    if index in SPECIAL:
        return SPECIAL[index]
    if 1 <= index <= 251 and names and index - 1 < len(names):
        nm = names[index - 1]
        nm = nm.replace("\xe9", "e")
        if index == 29:
            nm = "nidoran_f"
        elif index == 32:
            nm = "nidoran_m"
        return slug(nm)
    return "record_%03d" % index


def pose_clips(rom, index):
    """All raw clips in a species' pose bank, in bank order."""
    arc = rom.archive(POSE_TABLE)
    if index >= arc.count:
        return []
    raw = arc.raw(index)
    if not raw:
        return []
    blob = decompress(raw)
    out = []

    def collect(data, depth):
        if is_archive(data) and depth < 4:
            sub = Archive(data, 0)
            for i in range(sub.count):
                d = sub.get(i)
                if d:
                    collect(d, depth + 1)
        else:
            try:
                out.append(raw_pose_anim(data))
            except (ValueError, IndexError):
                pass

    collect(blob, 0)
    return out


def pair_face_clips(anims, meta, aux):
    """Face (texture) clip for each body clip: the battle table's choice when
    its length matches, else an unused face clip of the same length."""
    out = [None] * len(anims)
    used = set()
    for i, (a, md) in enumerate(zip(anims, meta)):
        fc = md["face_clip"]
        if fc is not None and fc < len(aux) and aux[fc].nframes == a.nframes:
            out[i] = fc
            used.add(fc)
    for i, a in enumerate(anims):
        if out[i] is None:
            same = [j for j, x in enumerate(aux) if x.nframes == a.nframes and j not in used]
            if same:
                out[i] = same[0]
                used.add(same[0])
            elif meta[i]["face_clip"] is not None and meta[i]["face_clip"] < len(aux):
                out[i] = meta[i]["face_clip"]
    return out


def export_pokemon(rom, index, outdir, names, moves, scale, textures_png=True, shiny_glb=False):
    frag = Fragment(rom.archive(MODEL_TABLE).get(index), "model_%03d" % index)
    model = Model(frag).build()
    anims = pose_clips(rom, index)
    meta = clipmod.name_clips(rom, frag, index, len(anims), moves)
    aux = [AuxAnim(frag, o) for o in model.aux_ptrs]
    chans = sorted({p.tex_anim for p in model.prims if p.tex_anim >= 0 and p.tris})
    tracks = [{c: a.track(c) for c in chans} for a in aux]
    face_sets = {c: {p.tex for p in model.prims if p.tex_anim == c} for c in chans}
    for tr in tracks:
        for c, vals in tr.items():
            face_sets[c].update(v for v in vals if v is not None)
    faces = pair_face_clips(anims, meta, aux)
    clip_list = []
    for a, md, fc in zip(anims, meta, faces):
        extras = {}
        if md["roles"]:
            extras["roles"] = md["roles"]
        if md["moves"]:
            extras["moves"] = md["moves"]
        n = max(1, a.nframes)
        if fc is not None:
            extras["face_clip"] = fc
            extras["face"] = {str(c): [v[min(f, len(v) - 1)] for f in range(n)]
                              for c, v in tracks[fc].items() if any(x is not None for x in v)}
        for ci, _, _ in model.flames():  # fire card: cycle its 8 frames
            extras.setdefault("face", {})[str(FLAME_CHANNEL_BASE + ci)] = [(f // 2) % 8 for f in range(n)]
        clip_list.append((md["name"], a, extras))
    name = record_name(index, names)
    base = "%03d_%s" % (index, name)
    used = {p.tex for p in model.prims if p.tris and 0 <= p.tex < len(model.textures)}
    for ts in face_sets.values():
        used.update(t for t in ts if 0 <= t < len(model.textures))
    shiny_species = 201 if 254 <= index <= 278 else index  # Unown letters share Unown's
    shiny = shinymod.for_species(rom, shiny_species, model, used)
    glb, info, files = build_gltf(model, base, clip_list, scale=scale, face_sets=face_sets, shiny=shiny)
    d = os.path.join(outdir, "pokemon", base)
    os.makedirs(d, exist_ok=True)
    with open(os.path.join(d, base + ".glb"), "wb") as fh:
        fh.write(glb)
    if shiny is not None and shiny_glb:
        sglb, _, _ = build_gltf(model, base + "_shiny", clip_list, scale=scale, shiny=shiny, shiny_in_glb=True)
        with open(os.path.join(d, base + "_shiny.glb"), "wb") as fh:
            fh.write(sglb)
    for rel, data in files.items():
        os.makedirs(os.path.dirname(os.path.join(d, rel)), exist_ok=True)
        with open(os.path.join(d, rel), "wb") as fh:
            fh.write(data)
    if textures_png:
        # every raw texture of the model (CI textures use TLUT 0, palette 0)
        td = os.path.join(d, "textures")
        os.makedirs(td, exist_ok=True)
        for ti, t in enumerate(model.textures):
            tl = model.tluts[0] if model.tluts else None
            w, h, rgba = decode_texture(frag, t, tl, 0)
            if w > 0 and h > 0:
                with open(os.path.join(td, "tex%02d.png" % ti), "wb") as fh:
                    fh.write(encode_rgba(w, h, rgba))
    info.update(record=index, species_id=model.species, name=name, display=record_display(index, names),
                tags=["Pokémon", "#%03d" % index],
                root_scale=model.root_scale, shiny=shiny.describe() if shiny else None,
                face_clips=[dict(index=i, frames=a.nframes, loop_start=a.loop,
                                 channels={str(c): v for c, v in tracks[i].items()})
                            for i, a in enumerate(aux)],
                attachments=model.attachments, warnings=model.warnings)
    with open(os.path.join(d, base + ".json"), "w") as fh:
        json.dump(info, fh, indent=1)
    return base, info


SCENE_TABLE = 0x449840  # 3 large set pieces with the arena-style entrypoint


def export_stage(rom, index, outdir, scale, table=STADIUM_MODEL_TABLE, prefix="stage", subdir="stages"):
    display = namemod.scene_name(index) if prefix == "scene" else namemod.stage_name(index)
    frag = Fragment(rom.archive(table).get(index), "%s_%02d" % (prefix, index))
    root = frag.stage_root()
    if root is None:
        raise ValueError("no stage root")
    model = Model(frag, layout=root, stage=True).build()
    model.clear = frag.stage_clear_color()
    base = "%s_%02d_%s" % (prefix, index, namemod.slug(display))
    glb, info, files = build_gltf(model, base, (), scale=scale)
    d = os.path.join(outdir, subdir)
    os.makedirs(d, exist_ok=True)
    with open(os.path.join(d, base + ".glb"), "wb") as fh:
        fh.write(glb)
    for rel, data in files.items():  # raw textures for the add-on's live materials
        path = os.path.join(d, rel)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "wb") as fh:
            fh.write(data)
    info.update(name=base, display=display, record=index,
                tags=["Region map"] if prefix == "scene" else ["Arena"] + (
                    ["unconfirmed name"] if prefix == "stage" and 23 <= index <= 25 else []),
                clear_color=list(model.clear) if model.clear else None, clips=[], warnings=model.warnings)
    with open(os.path.join(d, base + ".json"), "w") as fh:
        json.dump(info, fh, indent=1)
    return base, info


def cmd_text(rom, outdir):
    tables = textmod.read_all(rom)
    d = os.path.join(outdir, "text")
    os.makedirs(d, exist_ok=True)
    lines = []
    index = {}
    for i, t in enumerate(tables):
        label = textmod.KNOWN.get(i, "table")
        fname = "%03d_%s.json" % (i, label)
        index[i] = dict(file=fname, count=len(t) if t else 0, label=label)
        with open(os.path.join(d, fname), "w", encoding="utf-8") as fh:
            json.dump(t, fh, indent=1, ensure_ascii=False)
        lines.append("=" * 72)
        lines.append("TABLE %d  (%s, %d strings)" % (i, label, len(t) if t else 0))
        lines.append("=" * 72)
        for k, s in enumerate(t or []):
            lines.append("[%d.%d] %s" % (i, k, s.replace("\n", "\\n")))
    with open(os.path.join(d, "all_text.txt"), "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines) + "\n")
    with open(os.path.join(d, "index.json"), "w") as fh:
        json.dump(index, fh, indent=1)
    print("text: %d tables, %d strings -> %s" % (len(tables), sum(len(t or []) for t in tables), d))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("rom")
    ap.add_argument("what", choices=["info", "text", "pokemon", "stages", "objects", "effects", "images", "all"])
    ap.add_argument("ids", nargs="*", type=int, help="record numbers (pokemon: 1-281)")
    ap.add_argument("-o", "--out", default="out")
    ap.add_argument("--scale", type=float, default=0.01,
                    help="extra scale on top of the model's own root scale (default 0.01)")
    ap.add_argument("--no-png", action="store_true", help="don't write loose texture PNGs")
    ap.add_argument("--shiny-glb", action="store_true",
                    help="also write <name>_shiny.glb (shiny textures are always written as PNGs "
                         "for the Blender add-on's Shiny toggle)")
    args = ap.parse_args()

    rom = Rom(args.rom)
    print("%s [%s] %s md5=%s" % (rom.title, rom.game_code, rom.name, rom.md5))
    if args.what == "info":
        for label, off in (("pokemon models", MODEL_TABLE), ("pokemon poses", POSE_TABLE),
                           ("arena models", STADIUM_MODEL_TABLE)):
            print("  %-15s 0x%07X  %d records" % (label, off, rom.archive(off).count))
        return
    names = moves = texts = None
    try:
        names, moves = textmod.pokemon_names(rom), textmod.move_names(rom)
        texts = textmod.read_all(rom)
    except Exception as e:  # noqa: BLE001
        print("warning: could not read names:", e)
    if args.what in ("text", "all"):
        cmd_text(rom, args.out)
    if args.what in ("pokemon", "all"):
        ids = args.ids or list(range(rom.archive(MODEL_TABLE).count))
        t0 = time.time()
        summary = []
        for i in ids:
            try:
                base, info = export_pokemon(rom, i, args.out, names, moves, args.scale, not args.no_png,
                                            args.shiny_glb)
                summary.append(dict(record=i, file=base, bones=info["bones"],
                                    triangles=info["triangles"], clips=len(info["clips"])))
                print("  %-22s bones=%-3d tris=%-5d clips=%d%s" % (
                    base, info["bones"], info["triangles"], len(info["clips"]),
                    ("  warnings: %s" % "; ".join(info["warnings"][:2])) if info["warnings"] else ""))
            except Exception as e:  # noqa: BLE001
                print("  record %d FAILED: %s" % (i, e))
        os.makedirs(os.path.join(args.out, "pokemon"), exist_ok=True)
        with open(os.path.join(args.out, "pokemon", "index.json"), "w") as fh:
            json.dump(summary, fh, indent=1)
        print("pokemon: %d exported in %.1fs" % (len(summary), time.time() - t0))
    if args.what in ("objects", "all"):
        ids = args.ids if args.what == "objects" and args.ids else list(range(rom.archive(objmod.OBJECT_TABLE).count))
        if not (args.what == "objects" and args.ids):
            _clean(os.path.join(args.out, "objects"), r"^(object_)?\d{3}(_.*)?$")
        n = 0
        for i in ids:
            try:
                for base, info in objmod.export_object(rom, i, args.out, args.scale, not args.no_png, texts=texts):
                    n += 1
                    print("  %-22s bones=%-3d tris=%-5d clips=%d" % (base, info["bones"], info["triangles"],
                                                                    len(info["clips"])))
            except Exception as e:  # noqa: BLE001
                print("  object %d FAILED: %s" % (i, e))
        print("objects: %d models" % n)
    if args.what in ("images", "all"):
        t0 = time.time()
        counts = imgmod.export_all(rom, args.out, names)
        print("images: %s in %.1fs" % (", ".join("%d %s" % (v, k.replace("_", " ")) for k, v in counts.items()),
                                       time.time() - t0))
    if args.what in ("effects", "all"):
        t0 = time.time()
        if not (args.what == "effects" and args.ids):
            _clean(os.path.join(args.out, "effects"), r"^fx_\d{3}(_.*)?$")
        res = fxmod.export_all(rom, args.out, moves, args.ids if args.what == "effects" else None, args.scale)
        errs = [e for s_ in res for e in s_.get("errors", [])]
        print("effects: %d modules, %d particle shapes, %d effect models, %d raw textures/data in %.1fs%s" % (
            len(res), sum(len(s_["shapes"]) for s_ in res), sum(len(s_["models"]) for s_ in res),
            sum(len(s_["raw"]) for s_ in res), time.time() - t0,
            ("\n  errors: " + "\n  ".join(errs[:10])) if errs else ""))
    if args.what in ("stages", "all"):
        ids = args.ids if args.what == "stages" and args.ids else list(range(rom.archive(STADIUM_MODEL_TABLE).count))
        if not (args.what == "stages" and args.ids):
            _clean(os.path.join(args.out, "stages"), r"^stage_\d{2}(_.*)?(\.glb|\.json)?$")
            _clean(os.path.join(args.out, "stages", "textures"), r"^stage_\d{2}")
            _clean(os.path.join(args.out, "scenes"), r"^scene_\d{2}(_.*)?(\.glb|\.json)?$")
            _clean(os.path.join(args.out, "scenes", "textures"), r"^scene_\d{2}")
        for i in ids:
            try:
                base, info = export_stage(rom, i, args.out, args.scale)
                print("  %-10s nodes=%-3d tris=%d" % (base, info["bones"], info["triangles"]))
            except Exception as e:  # noqa: BLE001
                print("  stage %d FAILED: %s" % (i, e))
        for i in range(rom.archive(SCENE_TABLE).count):
            base, info = export_stage(rom, i, args.out, args.scale, SCENE_TABLE, "scene", "scenes")
            print("  %-10s nodes=%-3d tris=%d" % (base, info["bones"], info["triangles"]))
    if args.what in ("pokemon", "objects", "effects", "stages", "all"):
        n = catmod.write_catalog(args.out)
        print("catalog: %d assets -> %s" % (n, os.path.join(args.out, "catalog.json")))


if __name__ == "__main__":
    main()
