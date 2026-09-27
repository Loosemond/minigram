"""Shared helpers to write a parsed model (+ clips) as .glb, sidecar .json,
face/flame texture frames and loose texture PNGs."""
import json
import os

from .fragment import FLAME_CHANNEL_BASE, AuxAnim, decode_texture, fragment_anim
from .gltf import build_gltf
from .png import encode_rgba


class StaticClip:
    """A clip that holds the bind pose (used for texture-only animations)."""

    def __init__(self, nframes, loop=0):
        self.nframes, self.loop, self.flags = max(1, nframes), loop, 0

    def has_channel(self, chan):
        return False


def face_tracks(model):
    """Texture-animation tracks of the model's own aux clips:
    (list of {channel: [texture per frame]}, {channel: texture set})."""
    aux = [AuxAnim(model.f, o) for o in model.aux_ptrs]
    chans = sorted({p.tex_anim for p in model.prims if p.tex_anim >= 0 and p.tris})
    tracks = [{c: a.track(c) for c in chans} for a in aux]
    sets = {c: {p.tex for p in model.prims if p.tex_anim == c} for c in chans}
    for tr in tracks:
        for c, vals in tr.items():
            sets[c].update(v for v in vals if v is not None)
    return aux, tracks, sets


def face_extras(tracks, index, n):
    return {str(c): [v[min(f, len(v) - 1)] for f in range(n)]
            for c, v in tracks[index].items() if any(x is not None for x in v)}


def add_flames(model, extras, n):
    for ci, _, _ in model.flames():
        extras.setdefault("face", {})[str(FLAME_CHANNEL_BASE + ci)] = [(f // 2) % 8 for f in range(n)]


def own_clips(model, prefix="clip"):
    """Clips stored inside the model module itself (root +0x0C / +0x10):
    skeletal clips paired with same-length texture clips, then texture-only
    clips as bind-pose clips."""
    aux, tracks, sets = face_tracks(model)
    anims = [fragment_anim(model.f, o) for o in model.anim_ptrs]
    used, clips = set(), []
    for i, a in enumerate(anims):
        n = max(1, a.nframes)
        fc = i if i < len(aux) and aux[i].nframes == a.nframes else next(
            (j for j, x in enumerate(aux) if x.nframes == a.nframes and j not in used), None)
        extras = {}
        if fc is not None:
            used.add(fc)
            extras["face_clip"] = fc
            extras["face"] = face_extras(tracks, fc, n)
        add_flames(model, extras, n)
        clips.append(("%s%02d" % (prefix, i), a, extras))
    for j, x in enumerate(aux):
        if j in used:
            continue
        n = max(1, x.nframes)
        extras = {"face_clip": j, "face": face_extras(tracks, j, n)}
        add_flames(model, extras, n)
        clips.append(("texanim%02d" % j, StaticClip(n, x.loop), extras))
    return clips, tracks, sets


def write_model(model, base, d, clips=(), face_sets=None, scale=0.01, shiny=None,
                textures_png=False, extra_info=None):
    os.makedirs(d, exist_ok=True)
    glb, info, files = build_gltf(model, base, clips, scale=scale, face_sets=face_sets, shiny=shiny)
    with open(os.path.join(d, base + ".glb"), "wb") as fh:
        fh.write(glb)
    for rel, data in files.items():
        path = os.path.join(d, rel)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "wb") as fh:
            fh.write(data)
    if textures_png and model.textures:
        td = os.path.join(d, "textures")
        os.makedirs(td, exist_ok=True)
        tl = model.tluts[0] if model.tluts else None
        for ti, t in enumerate(model.textures):
            w, h, rgba = decode_texture(model.f, t, tl, 0)
            if 0 < w <= 1024 and 0 < h <= 1024:
                with open(os.path.join(td, "tex%02d.png" % ti), "wb") as fh:
                    fh.write(encode_rgba(w, h, rgba))
    info.update(extra_info or {})
    info["warnings"] = model.warnings
    with open(os.path.join(d, base + ".json"), "w", encoding="utf-8") as fh:
        json.dump(info, fh, indent=1)
    return info
