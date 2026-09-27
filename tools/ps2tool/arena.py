"""Arena material data for live (animated) rendering.

The N64 has no shaders: a surface's look is its colour-combiner equation fed
by up to two textures (each with its own scale, wrap and scroll), primitive
and environment colours (possibly animated by a colour track) and the vertex
colour ("shade"). The glTF gets a baked still of that; this module also
describes the recipe in the material extras ("ps2_combiner") so the Blender
add-on can rebuild it as shader nodes with scrolling textures, animated
colours and the exact per-vertex shade.

Translucent surfaces with nothing behind them (lakes) blend over the arena's
background colour, which the game clears the screen to.
"""
import math

from .fragment import decode_texture
from .png import encode_rgba


def _shift_factor(v):
    v &= 15
    return 1.0 / (1 << v) if v <= 10 else float(1 << (16 - v))


def _png(m, tex, tlut=None, pal=0):
    w, h, rgba = decode_texture(m.f, tex, tlut, pal, intensity_alpha=True)
    return w, h, encode_rgba(w, h, rgba)


def combiner_spec(m, prim, src, sampler, tex_scale, files, prefix):
    """Material recipe for an arena draw whose colours come from a callback.
    src: ("texcb", texture, callback, ...) or ("cb", callback).
    Writes the raw textures into `files` under `prefix`. Returns a dict or None."""
    cb = src[2] if src[0] == "texcb" else src[1]
    mat = m.callback_material(cb)
    if not mat or not mat[0]:
        return None
    mux, pc, ec = mat
    tl = m.tluts[prim.tlut] if 0 <= prim.tlut < len(m.tluts) else None
    pal = 0
    if src[0] == "texcb":
        t0 = m.textures[src[1]]
        pal, smp = m.tile_state(prim.mat)
        smp = smp or dict(cms=0, cmt=0, masks=0, maskt=0, shifts=0, shiftt=0)
        s0 = (t0, smp)
    else:
        s0 = m.callback_texture(cb)
        s0 = (s0[0], s0[1]) if s0 else None
        tl = None
    s1 = m.callback_tile1(cb)
    textures = []
    for which, st in enumerate((s0, s1)):
        if st is None:
            textures.append(None)
            continue
        tex, smp = st
        rel = "%s_cb%02d_t%d.png" % (prefix, cb, which)
        if rel not in files:
            w, h, data = _png(m, tex, tl if which == 0 else None, pal if which == 0 else 0)
            files[rel] = data
        entry = dict(file=rel, size=[tex["w"], tex["h"]],
                     sf=[_shift_factor(smp.get("shifts", 0)), _shift_factor(smp.get("shiftt", 0))],
                     wrap=[smp.get("cms", 0), smp.get("cmt", 0)], fmt=tex["fmt"])
        scroll = m.callback_scroll(cb, which)
        if scroll:
            entry["scroll"] = list(scroll)
        fb = m.callback_flipbook(cb, which)
        if fb and len(fb[0]) > 1:
            names = []
            for i, ft in enumerate(fb[0]):
                frel = "%s_cb%02d_t%d_%03d.png" % (prefix, cb, which, i)
                if frel not in files:
                    files[frel] = _png(m, ft)[2]
                names.append(frel)
            entry["frames"] = names
            entry["frame_time"] = fb[1]
        textures.append(entry)
    spec = dict(mux=list(mux), prim=list(pc[:4]), lod=pc[4] if len(pc) > 4 else 255, env=list(ec[:4]),
                textures=textures, cov=bool(s0 and s0[0]["fmt"] == 4), layer=prim.layer,
                tex_scale=list(tex_scale))
    track = m.callback_color_track(cb)
    if track:
        spec["track"] = track
    return spec


# ------------------------------------------------------------ over background
def _ray_hits(orig, d, tri, eps=1e-9):
    """Moller-Trumbore; returns the distance along d or None."""
    a, b, c = tri
    e1 = [b[i] - a[i] for i in range(3)]
    e2 = [c[i] - a[i] for i in range(3)]
    p = (d[1] * e2[2] - d[2] * e2[1], d[2] * e2[0] - d[0] * e2[2], d[0] * e2[1] - d[1] * e2[0])
    det = e1[0] * p[0] + e1[1] * p[1] + e1[2] * p[2]
    if abs(det) < eps:
        return None
    inv = 1.0 / det
    s = [orig[i] - a[i] for i in range(3)]
    u = (s[0] * p[0] + s[1] * p[1] + s[2] * p[2]) * inv
    if u < 0 or u > 1:
        return None
    q = (s[1] * e1[2] - s[2] * e1[1], s[2] * e1[0] - s[0] * e1[2], s[0] * e1[1] - s[1] * e1[0])
    v = (d[0] * q[0] + d[1] * q[1] + d[2] * q[2]) * inv
    if v < 0 or u + v > 1:
        return None
    return (e2[0] * q[0] + e2[1] * q[1] + e2[2] * q[2]) * inv


def over_background(world_tris, candidates, samples=48, share=0.8):
    """world_tris: {prim index: [(a, b, c), ...]} in one space (y up).
    candidates: translucent prim indices. A candidate is 'over the
    background' when, seen from the arena's centre (where the battle camera
    looks from), rays continuing behind its triangles hit nothing else for at
    least `share` of the samples. Returns the set of such prims."""
    others_all = [(pi, t) for pi, ts in world_tris.items() for t in ts]
    pts = [p for _, t in others_all for p in t]
    if not pts:
        return set()
    lo = [min(p[i] for p in pts) for i in range(3)]
    hi = [max(p[i] for p in pts) for i in range(3)]
    eye = [(lo[i] + hi[i]) / 2.0 for i in range(3)]
    out = set()
    for pi in candidates:
        tris = world_tris.get(pi) or []
        if not tris:
            continue
        step = max(1, len(tris) // samples)
        free = total = 0
        for tri in tris[::step]:
            a, b, c = tri
            e1 = [b[i] - a[i] for i in range(3)]
            e2 = [c[i] - a[i] for i in range(3)]
            n = (e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0])
            ln = math.sqrt(sum(x * x for x in n))
            if ln < 1e-12:
                continue
            o = tuple((a[i] + b[i] + c[i]) / 3.0 for i in range(3))
            # "behind" = the side facing away from the viewer (winding is not
            # reliable on double-sided decals)
            d = [x / ln for x in n]
            if sum(d[i] * (o[i] - eye[i]) for i in range(3)) < 0:
                d = [-x for x in d]
            hit = False
            for pj, t in others_all:
                if pj == pi:
                    continue
                r = _ray_hits(o, d, t)
                if r is not None and r > -1e-4:
                    hit = True
                    break
            total += 1
            free += not hit
        if total and free >= share * total:
            out.add(pi)
    return out


def composite_over(rgba, clear, shade):
    """Pre-blend a translucent texture over the background colour for plain
    glTF viewers: result * shade ~= alpha * shade * texel + (1 - alpha) * clear,
    using the surface's average shade. Returns opaque RGBA bytes."""
    out = bytearray(len(rgba))
    for i in range(0, len(rgba), 4):
        a = rgba[i + 3] / 255.0
        for c in range(3):
            s = max(shade[c], 1) / 255.0
            v = a * rgba[i + c] / 255.0 + (1 - a) * clear[c] / 255.0 / s
            out[i + c] = min(255, int(v * 255 + 0.5))
        out[i + 3] = 255
    return bytes(out)
