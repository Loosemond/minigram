"""Convert a parsed Stadium 2 model (+ skeletal clips) into a binary glTF.

Skeleton representation
-----------------------
Stadium composes joints as
    pivot_i = pivot_parent * [R(r_i) | t_i * acc_parent]
    acc_i   = acc_parent * s_i                     (component-wise)
    draw_i  = pivot_i * diag(acc_i)
i.e. accumulated scale is applied along each joint's *own* axes (Blender
calls this "Aligned" scale inheritance). Plain glTF TRS inheritance would
shear under non-uniform scale (Pikachu's ears, for example), so each joint is
exported as two nodes:
    <name>        rotation/translation only, forms the hierarchy
    <name>_scale  child leaf carrying the accumulated scale; this is the
                  skin joint the vertices are bound to.
That reproduces the game's pose exactly for every frame.
"""
import json
import math
import struct
from fractions import Fraction

from .combiner import bake as bake_combiner, bake_tiles, uses_texel1
from .decals import layers as decal_layers
from . import arena
from .fragment import FLAME_CHANNEL_BASE, decode_texture
from .png import encode_rgba, mirror_double

FPS = 30.0

G_LIGHTING = 0x20000
G_TEXTURE_GEN = 0x40000
G_CULL_BACK = 0x400

WRAP_REPEAT, WRAP_MIRROR, WRAP_CLAMP = 10497, 33648, 33071


# ------------------------------------------------------------------ math
def _ang(v):
    return v / 32768.0 * math.pi


def euler_quat(r):
    """Stadium rotation R = Rz * Ry * Rx as a glTF quaternion [x, y, z, w]."""
    hx, hy, hz = _ang(r[0]) * 0.5, _ang(r[1]) * 0.5, _ang(r[2]) * 0.5
    cx, sx, cy, sy, cz, sz = (math.cos(hx), math.sin(hx), math.cos(hy),
                              math.sin(hy), math.cos(hz), math.sin(hz))
    return [sx * cy * cz - cx * sy * sz,
            cx * sy * cz + sx * cy * sz,
            cx * cy * sz - sx * sy * cz,
            cx * cy * cz + sx * sy * sz]


def euler_mat3(r):
    x, y, z = _ang(r[0]), _ang(r[1]), _ang(r[2])
    sx, cx, sy, cy, sz, cz = math.sin(x), math.cos(x), math.sin(y), math.cos(y), math.sin(z), math.cos(z)
    return [[cy * cz, sx * sy * cz - cx * sz, cx * sy * cz + sx * sz],
            [cy * sz, sx * sy * sz + cx * cz, cx * sy * sz - sx * cz],
            [-sy, sx * cy, cx * cy]]


def rigid(rot, t):
    """3x4 [R|t] as a list of rows."""
    return [rot[0] + [t[0]], rot[1] + [t[1]], rot[2] + [t[2]]]


def mul34(a, b):
    out = []
    for r in range(3):
        ar = a[r]
        out.append([ar[0] * b[0][c] + ar[1] * b[1][c] + ar[2] * b[2][c] + (ar[3] if c == 3 else 0.0)
                    for c in range(4)])
    return out


IDENT34 = [[1.0, 0, 0, 0], [0, 1.0, 0, 0], [0, 0, 1.0, 0]]


def inv_rigid_col(m):
    """Column-major 4x4 inverse of a rigid 3x4 (rotation + translation)."""
    rt = [[m[c][r] for c in range(3)] for r in range(3)]  # transpose of R
    t = [m[0][3], m[1][3], m[2][3]]
    it = [-(rt[r][0] * t[0] + rt[r][1] * t[1] + rt[r][2] * t[2]) for r in range(3)]
    return [rt[0][0], rt[1][0], rt[2][0], 0.0,
            rt[0][1], rt[1][1], rt[2][1], 0.0,
            rt[0][2], rt[1][2], rt[2][2], 0.0,
            it[0], it[1], it[2], 1.0]


def pose(bones, trs, k=1.0):
    """Stadium pivots/accumulated scales for per-bone (t, r, s); translations
    are multiplied by the uniform export scale k."""
    pivots, accs, locals_ = [], [], []
    for i, b in enumerate(bones):
        t, r, s = trs[i]
        pa = accs[b.parent] if b.parent >= 0 else (1.0, 1.0, 1.0)
        pm = pivots[b.parent] if b.parent >= 0 else IDENT34
        lt = (t[0] * pa[0] * k, t[1] * pa[1] * k, t[2] * pa[2] * k)
        pivots.append(mul34(pm, rigid(euler_mat3(r), lt)))
        accs.append((pa[0] * s[0], pa[1] * s[1], pa[2] * s[2]))
        locals_.append(lt)
    return pivots, accs, locals_


def _shift_factor(v):
    v &= 15
    return 1.0 / (1 << v) if v <= 10 else float(1 << (16 - v))


# --------------------------------------------------------------- builder
class Gltf:
    def __init__(self):
        self.j = {"asset": {"version": "2.0", "generator": "ps2tool (Pokemon Stadium 2 extractor)"},
                  "scenes": [{"nodes": []}], "scene": 0, "nodes": [], "meshes": [],
                  "materials": [], "textures": [], "images": [], "samplers": [],
                  "accessors": [], "bufferViews": [], "buffers": [], "skins": [], "animations": []}
        self.bin = bytearray()
        self._samplers = {}

    def view(self, data, target=None):
        while len(self.bin) % 4:
            self.bin.append(0)
        bv = {"buffer": 0, "byteOffset": len(self.bin), "byteLength": len(data)}
        if target:
            bv["target"] = target
        self.bin += data
        self.j["bufferViews"].append(bv)
        return len(self.j["bufferViews"]) - 1

    def accessor(self, values, typ, ctype=5126, target=None, minmax=False, normalized=False):
        width = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}[typ]
        fmt = {5126: "f", 5121: "B", 5123: "H", 5125: "I"}[ctype]
        flat = [x for v in values for x in v] if width > 1 else list(values)
        data = struct.pack("<%d%s" % (len(flat), fmt), *flat)
        if ctype in (5121, 5123) and target == 34962:  # vertex attrs need 4-byte stride
            size = struct.calcsize(fmt) * width
            if size % 4:
                pad = 4 - size % 4
                rows = [data[i:i + size] + b"\0" * pad for i in range(0, len(data), size)]
                data = b"".join(rows)
                bvi = self.view(data, target)
                self.j["bufferViews"][bvi]["byteStride"] = size + pad
            else:
                bvi = self.view(data, target)
        else:
            bvi = self.view(data, target)
        acc = {"bufferView": bvi, "componentType": ctype, "count": len(values), "type": typ}
        if normalized:
            acc["normalized"] = True
        if minmax:
            cols = list(zip(*values)) if width > 1 else [values]
            acc["min"] = [min(c) for c in cols]
            acc["max"] = [max(c) for c in cols]
        self.j["accessors"].append(acc)
        return len(self.j["accessors"]) - 1

    def node(self, **kw):
        self.j["nodes"].append(kw)
        return len(self.j["nodes"]) - 1

    def sampler(self, ws, wt):
        key = (ws, wt)
        if key not in self._samplers:
            self.j["samplers"].append({"magFilter": 9729, "minFilter": 9729, "wrapS": ws, "wrapT": wt})
            self._samplers[key] = len(self.j["samplers"]) - 1
        return self._samplers[key]

    def image(self, png, name):
        bvi = self.view(png)
        self.j["images"].append({"bufferView": bvi, "mimeType": "image/png", "name": name})
        return len(self.j["images"]) - 1

    def glb(self):
        j = {k: v for k, v in self.j.items() if v != []}
        if any("KHR_materials_unlit" in m.get("extensions", {}) for m in self.j["materials"]):
            j["extensionsUsed"] = ["KHR_materials_unlit"]
        while len(self.bin) % 4:
            self.bin.append(0)
        j["buffers"] = [{"byteLength": len(self.bin)}]
        js = json.dumps(j, separators=(",", ":")).encode()
        js += b" " * (-len(js) % 4)
        total = 12 + 8 + len(js) + 8 + len(self.bin)
        return (struct.pack("<III", 0x46546C67, 2, total)
                + struct.pack("<II", len(js), 0x4E4F534A) + js
                + struct.pack("<II", len(self.bin), 0x004E4942) + bytes(self.bin))


# ------------------------------------------------------------- materials
class _Bytes:
    def __init__(self, d):
        self.d = d


class TextureBank:
    """Decodes each (source, tlut, palette, mirror axes) combination once.
    A source is a model texture index or ("cb", callback index).
    `variant` selects shiny colours (see ps2tool.shiny)."""

    def __init__(self, model, variant=None):
        self.m = model
        self.variant = variant
        self.cache = {}
        self.gains = {}  # key -> vertex colour gain that undoes the headroom scaling

    def source(self, src):
        if not isinstance(src, tuple) and src in self.m.virtual:
            return self.m.virtual[src]["tex"]
        if isinstance(src, tuple):
            if src[0] == "flame":
                ptrs = dict((ci, p) for ci, _, p in self.m.flames())[src[1]]
                return dict(fmt=3, siz=1, w=32, h=64, data=ptrs[src[2]])
            if src[0] == "texcb":
                return self.m.textures[src[1]]
            return self.m.callback_texture(src[1])[0]
        return self.m.textures[src]

    def _bake(self, rgba, w, h, cb, cov=None, headroom=False):
        """Apply a render-time material's colour combiner (prim/env colours)."""
        m = self.m
        mat = m.callback_material(cb)
        if not mat or not mat[0]:
            return (rgba, 1.0) if headroom else rgba
        mux, prim, env = mat
        t1 = m.callback_texel1(cb)
        rgba1 = w1 = h1 = None
        if t1 is not None:
            w1, h1, rgba1 = decode_texture(m.f, t1, None, 0, intensity_alpha=m.intensity_alpha)
        out = bake_combiner(mux, rgba, w, h, prim[:4], env, rgba1, w1, h1,
                            plod=prim[4] / 255.0 if len(prim) > 4 else 0.0, cov=cov, headroom=headroom)
        if headroom:
            return out
        if getattr(m, "keep_visible", False) and not any(out[3::4]) and any(rgba[3::4]):
            # alpha comes from a colour only set at runtime: keep the raw texture visible
            return rgba
        return out

    def get(self, src, tlut, pal, mirror_s=False, mirror_t=False):
        key = (src, tlut, pal, mirror_s, mirror_t)
        if key not in self.cache:
            m, var = self.m, self.variant
            tl = m.tluts[tlut] if 0 <= tlut < len(m.tluts) else None
            if isinstance(src, tuple) and src[0] == "flame":
                w, h, rgba = decode_texture(m.f, self.source(src), None, 0)
                rgba = _flame_colour(rgba, m.species)
            elif isinstance(src, tuple) and src[0] == "texcb":
                # authored texture drawn through its callback's combiner; the
                # combiner reads I-format alpha as the intensity
                tex = self.source(src)
                w, h, rgba = decode_texture(m.f, tex, tl, pal, intensity_alpha=True)
                cov = 1.0 if tex["fmt"] == 4 else None
                if src[3]:  # vertex-coloured: shade added on top may exceed 1
                    rgba, self.gains[key] = self._bake(rgba, w, h, src[2], cov=cov, headroom=True)
                else:
                    rgba = self._bake(rgba, w, h, src[2], cov=cov)
            elif var is not None and var.dedicated is not None and src in var.dedicated:
                tex = dict(self.source(src), data=var.dedicated[src])
                w, h, rgba = decode_texture(_Bytes(var.payload), tex, tl, pal)
            else:
                w, h, rgba = decode_texture(m.f, self.source(src), tl, pal,
                                            intensity_alpha=m.intensity_alpha)
                cb = src[1] if isinstance(src, tuple) and src[0] == "cb" else (
                    m.virtual[src]["cb"] if not isinstance(src, tuple) and src in m.virtual else None)
                if cb is not None:
                    rgba = self._bake(rgba, w, h, cb)
                if var is not None:
                    rgba = var.recolour(rgba)
            if mirror_s:
                w, h, rgba = mirror_double(w, h, rgba, 0)
            if mirror_t:
                w, h, rgba = mirror_double(w, h, rgba, 1)
            alphas = rgba[3::4]
            mode = "OPAQUE"
            if any(0 < a < 255 for a in alphas):
                mode = "BLEND"
            elif 0 in alphas:
                mode = "MASK"
            self.cache[key] = (w, h, rgba, mode)
        return self.cache[key]

    def gain(self, src, tlut, pal, mirror_s=False, mirror_t=False):
        self.get(src, tlut, pal, mirror_s, mirror_t)
        return self.gains.get((src, tlut, pal, mirror_s, mirror_t), 1.0)


def _flame_colour(rgba, species):
    """Bake the fire card combiner: lerp(env, prim, I), alpha = A * prim.a
    (func_80070A4C colours; Magmar and Moltres have their own)."""
    prim, env = (255, 255, 255, 255), (180, 32, 0)
    if species == 126:
        prim, env = (255, 255, 5, 255), (255, 32, 0)
    elif species == 146:
        prim, env = (255, 255, 255, 200), (255, 32, 0)
    out = bytearray(len(rgba))
    for i in range(0, len(rgba), 4):
        t, a = rgba[i] / 255.0, rgba[i + 3]
        for c in range(3):
            out[i + c] = int(env[c] + (prim[c] - env[c]) * t + 0.5)
        out[i + 3] = a * prim[3] // 255
    return bytes(out)


# Fire card: literal Vtx order of the shared object (x, y, s, t, blue).
FLAME_VERTS = [(-50, 200, 0, 0, 0), (-50, 150, 0, 512, 0), (50, 150, 1024, 512, 0),
               (50, 200, 1024, 0, 0), (-50, 100, 0, 1024, 0), (50, 100, 1024, 1024, 0),
               (-50, 50, 0, 1536, 192), (50, 50, 1024, 1536, 192), (-50, 0, 0, 2048, 128),
               (50, 0, 1024, 2048, 128)]
FLAME_TRIS = [(0, 1, 2), (0, 2, 3), (1, 4, 5), (1, 5, 2), (4, 6, 7), (4, 7, 5), (6, 8, 9), (6, 9, 7)]


class _FlamePrim:
    """Synthesised fire card: two crossed upright quads (it is a camera
    billboard in game) placed at the bone and skinned to it."""

    def __init__(self, ci, bone, pivot, acc):
        self.tex, self.tlut, self.mat = -1, -1, None
        self.tex_anim = FLAME_CHANNEL_BASE + ci
        self.flame = ci
        self.geo_mode = 0
        self.tex_scale = (1.0, 1.0)
        self.callback = None
        self.verts, self.tris = [], []
        r = pivot  # rows of the bind rotation
        size = (abs(acc[0]) + abs(acc[1]) + abs(acc[2])) / 3.0
        if min(abs(a) for a in acc) < 1e-6:
            return
        for quad in (0, 1):
            base = len(self.verts)
            for x, y, s, t, blue in FLAME_VERTS:
                o = (x * size, y * size, 0.0) if quad == 0 else (0.0, y * size, x * size)
                # model-space offset -> bone-local (R^T o / acc)
                lx = (r[0][0] * o[0] + r[1][0] * o[1] + r[2][0] * o[2]) / acc[0]
                ly = (r[0][1] * o[0] + r[1][1] * o[1] + r[2][1] * o[2]) / acc[1]
                lz = (r[0][2] * o[0] + r[1][2] * o[1] + r[2][2] * o[2]) / acc[2]
                b = blue - 256 if blue > 127 else blue
                self.verts.append((lx, ly, lz, s, t, -1, -1, b, 255, bone))
            self.tris += [(base + a, base + b, base + c) for a, b, c in FLAME_TRIS]


def _wrap(mode):
    if mode == 3:
        return WRAP_CLAMP, True  # mirror once, then clamp: bake the mirror
    if mode & 2:
        return WRAP_CLAMP, False
    if mode & 1:
        return WRAP_MIRROR, False
    return WRAP_REPEAT, False


def _classify_normals(verts):
    ok = 0
    for v in verts:
        n = math.sqrt(v[5] * v[5] + v[6] * v[6] + v[7] * v[7]) / 127.0
        if 0.85 <= n <= 1.05:
            ok += 1
    return ok >= 0.5 * max(1, len(verts))


def _tile_setup(m, cbi, verts, tex_scale, limit=1024):
    """Two-texture callback material whose TEXEL1 uses its own scale/wrap:
    bake both into one canvas. Returns (tiles, canvas, wraps, uv map,
    material) or None. Axes where every texture repeats get one common
    period (REPEAT); axes with a clamped texture cover the geometry's own
    coordinate range (CLAMP)."""
    mat = m.callback_material(cbi)
    t0, t1 = m.callback_texture(cbi), m.callback_tile1(cbi)
    if not mat or not mat[0] or t0 is None or t1 is None or not uses_texel1(mat[0]):
        return None
    tiles = []
    for tex, smp in ((t0[0], t0[1]), t1):
        w, h, rgba = decode_texture(m.f, tex, None, 0, intensity_alpha=True)
        tiles.append((w, h, rgba, smp, (_shift_factor(smp["shifts"]), _shift_factor(smp["shiftt"])),
                      tex["fmt"]))
    canvas, wraps, uvmap = [], [], []
    for axis in (0, 1):
        cm, mk = ("cms", "masks") if axis == 0 else ("cmt", "maskt")
        dens = max(t[4][axis] for t in tiles)  # output texels per coordinate unit
        if not any(t[3][cm] & 2 for t in tiles):
            period = None
            for t in tiles:
                n = (1 << t[3][mk]) if t[3][mk] else (t[0] if axis == 0 else t[1])
                pr = Fraction(n * (2 if t[3][cm] & 1 else 1)) / Fraction(t[4][axis])
                period = pr if period is None else Fraction(
                    math.lcm(period.numerator, pr.numerator), math.gcd(period.denominator, pr.denominator))
            origin, span, wrap = 0.0, float(period), WRAP_REPEAT
        else:
            vals = [v[3 + axis] / 32.0 * tex_scale[axis] for v in verts]
            origin = math.floor(min(vals))
            span, wrap = max(1.0, math.ceil(max(vals)) - origin), WRAP_CLAMP
        n = max(1, min(limit, int(math.ceil(span * dens))))
        canvas += [origin, span / n, n]
        wraps.append(wrap)
        uvmap.append((tex_scale[axis] / (32.0 * span), -origin / span))  # uv = coord * a + b
    return tiles, tuple(canvas), wraps, uvmap, mat


def _world_tris(m, pivots, k):
    """{prim index: [(a, b, c)]} bind-pose triangle corners (glTF units)."""
    out = {}
    for pi, p in enumerate(m.prims):
        if not p.tris:
            continue
        pts = []
        for x, y, z, _, _, _, _, _, _, bone in p.verts:
            pm = pivots[bone] if bone >= 0 else IDENT34
            lx, ly, lz = x * k, y * k, z * k
            pts.append(tuple(pm[r][0] * lx + pm[r][1] * ly + pm[r][2] * lz + pm[r][3] for r in range(3)))
        out[pi] = [tuple(pts[i] for i in tri) for tri in p.tris]
    return out


def _decal_lifts(m, pivots, k):
    """{prim index: {tri index: (layer, lift vector)}} for coplanar overlays."""
    tris, ext = [], [[math.inf] * 3, [-math.inf] * 3]
    for pi, p in enumerate(m.prims):
        order = getattr(p, "order", None)
        if not p.tris or not order:
            continue
        pts = []
        for x, y, z, _, _, _, _, _, _, bone in p.verts:
            pm = pivots[bone] if bone >= 0 else IDENT34
            lx, ly, lz = x * k, y * k, z * k
            w = tuple(pm[r][0] * lx + pm[r][1] * ly + pm[r][2] * lz + pm[r][3] for r in range(3))
            pts.append(w)
            for c in range(3):
                ext[0][c], ext[1][c] = min(ext[0][c], w[c]), max(ext[1][c], w[c])
        for ti, tri in enumerate(p.tris):
            tris.append((order[ti], (pi, ti), tuple(pts[i] for i in tri)))
    if not tris:
        return {}
    size = math.sqrt(sum((ext[1][c] - ext[0][c]) ** 2 for c in range(3)))
    found = decal_layers(tris, tol=0.75 * k)
    step = max(size * 5e-4, 1.0 * k)  # ~5 cm on a 90 m arena
    lifts = {}
    for (pi, ti), (layer, n) in found.items():
        lifts.setdefault(pi, {})[ti] = (layer, tuple(c * layer * step for c in n))
    return lifts


# ----------------------------------------------------------------- export
def build_gltf(model, name, clips=(), scale=0.01, bone_names=None, face_sets=None,
               shiny=None, shiny_in_glb=False):
    """clips: list of (clip_name, Anim, extras dict).
    face_sets: {texture-animation channel: texture indices it can show}.
    shiny: a ps2tool.shiny.Shiny; its textures are written as side PNGs
    (textures/shiny/...) or, with shiny_in_glb, used for the glb itself.
    Returns (glb bytes, info, extra files {relative path: bytes})."""
    m = model
    g = Gltf()
    rs = m.root_scale
    k = rs[0] * scale
    if abs(rs[0] - rs[1]) > 1e-6 or abs(rs[0] - rs[2]) > 1e-6:
        m.warnings.append("non-uniform root scale %r approximated" % (rs,))
    bones = m.bones
    nb = len(bones)
    bind = [(b.t, b.r, b.s) for b in bones]
    pivots, accs, local_t = pose(bones, bind, k)
    names = bone_names or ["bone_%02d" % i for i in range(nb)]

    # ---- skeleton nodes
    rig = g.node(name=name + "_rig", children=[])
    pivot_nodes, scale_nodes = [], []
    for i, b in enumerate(bones):
        pn = g.node(name=names[i], translation=list(local_t[i]), rotation=euler_quat(b.r), children=[])
        sn = g.node(name=names[i] + "_scale", scale=list(accs[i]))
        g.j["nodes"][pn]["children"].append(sn)
        pivot_nodes.append(pn)
        scale_nodes.append(sn)
        parent = pivot_nodes[b.parent] if b.parent >= 0 else rig
        g.j["nodes"][parent]["children"].append(pn)
    for i in pivot_nodes + [rig]:
        if not g.j["nodes"][i]["children"]:
            del g.j["nodes"][i]["children"]

    # ---- geometry
    bank = TextureBank(m, shiny if shiny_in_glb else None)
    sbank = TextureBank(m, shiny) if shiny is not None and not shiny_in_glb else None
    used_root = False
    prims_out = []
    mat_index = {}
    info_textures = []
    tex_index = {}
    files = {}
    face_sets = face_sets or {}
    flame_prims = [_FlamePrim(ci, bone, pivots[bone], accs[bone]) for ci, bone, _ in m.flames()]
    lifts = _decal_lifts(m, pivots, k) if m.stage else {}
    clear = getattr(m, "clear", None)
    over_bg = set()
    if m.stage and clear is not None:  # translucent surfaces with only the background behind
        over_bg = arena.over_background(_world_tris(m, pivots, k),
                                        [pi for pi, p in enumerate(m.prims) if p.tris and p.layer >= 5])
    tile_cache = {}
    inherited_cb = None
    for pi, p in enumerate(list(m.prims) + flame_prims):
        if not p.tris:
            continue
        pal, sampler = m.tile_state(p.mat)
        sampler = sampler or dict(cms=0, cmt=0, shifts=0, shiftt=0)
        tex_scale = p.tex_scale
        src = p.tex if m.has_texture(p.tex) else None
        if src is not None and src in m.virtual:
            sampler = m.virtual[src]["sampler"] or sampler
            tex_scale = m.virtual[src]["scale"] or tex_scale
            pal = 0
        if getattr(p, "flame", None) is not None:
            src, sampler, pal = ("flame", p.flame, 0), dict(cms=2, cmt=2, shifts=0, shiftt=0), 0
        elif src is None:
            # untextured draws use the render-time callback's texture; with no
            # callback of their own they inherit the last one in draw order
            cbi = p.callback if p.callback is not None else inherited_cb
            cbt = m.callback_texture(cbi)
            if cbt is not None:  # texture supplied by a render-time callback
                src, sampler = ("cb", cbi), cbt[1]
                tex_scale = cbt[2] or tex_scale
                pal = 0
                inherited_cb = cbi
        elif not isinstance(src, tuple) and src not in m.virtual:
            inherited_cb = None  # an authored texture ends the inheritance
        has_tex = src is not None
        ws, mir_s = _wrap(sampler["cms"])
        wt, mir_t = _wrap(sampler["cmt"])
        lit = _classify_normals(p.verts)
        if m.stage and not isinstance(src, tuple) and src is not None and src not in m.virtual \
                and p.callback is not None:
            cm = m.callback_material(p.callback)
            if cm and cm[0]:  # arenas colour/fade authored textures in callbacks
                src = ("texcb", src, p.callback, not lit)
        texgen = bool(p.geo_mode & G_TEXTURE_GEN)
        if isinstance(src, tuple) and src[0] == "cb":  # callback state can enable env mapping
            texgen = texgen or bool(m.callback_geometry_mode(src[1]) & G_TEXTURE_GEN)
        tile = tkey_tile = None
        if isinstance(src, tuple) and src[0] == "cb" and not texgen and m.stage:
            tile = _tile_setup(m, src[1], p.verts, tex_scale)
        tw = th = 32
        alpha_mode = "OPAQUE"
        uo = vo = 0.0
        if tile:  # TEXEL0 x TEXEL1 at their own scales, baked into one canvas
            tiles, canvas, (ws, wt), ((us, uo), (vs, vo)), tmat = tile
            mir_s = mir_t = False
            tkey_tile = ("tile", src[1], canvas)
            if tkey_tile not in tile_cache:
                rgba = bake_tiles(tmat[0], tiles, tmat[1][:4], tmat[2], canvas,
                                  plod=tmat[1][4] / 255.0 if len(tmat[1]) > 4 else 0.0)
                al = rgba[3::4]
                mode = "BLEND" if any(0 < a < 255 for a in al) else ("MASK" if 0 in al else "OPAQUE")
                tile_cache[tkey_tile] = (canvas[2], canvas[5], rgba, mode, len(tile_cache))
            alpha_mode = tile_cache[tkey_tile][3]
        elif has_tex:
            srcd = bank.source(src)
            tw, th = srcd["w"], srcd["h"]
            alpha_mode = bank.get(src, p.tlut, pal, mir_s, mir_t)[3]
        if not tile:
            us = tex_scale[0] * _shift_factor(sampler["shifts"]) / (tw * 32.0) * (0.5 if mir_s else 1.0)
            vs = tex_scale[1] * _shift_factor(sampler["shiftt"]) / (th * 32.0) * (0.5 if mir_t else 1.0)
        layer = getattr(p, "layer", 1)
        over = None
        combo = None
        if m.stage and has_tex:
            # the arena's render layer decides blending: 1 opaque, 4 alpha test, 5+ translucent
            if layer == 1:
                alpha_mode = "OPAQUE"
            elif layer == 4:
                alpha_mode = "MASK" if alpha_mode != "OPAQUE" else alpha_mode
            elif layer >= 5:
                alpha_mode = "BLEND"
            if pi in over_bg:
                cols = [v[5:8] for v in p.verts] if not lit else [(255, 255, 255)]
                over = (tuple(clear), tuple(int(sum(c[i] & 0xFF for c in cols) / len(cols)) for i in range(3)))
                alpha_mode = "OPAQUE"
            if isinstance(src, tuple) and src[0] in ("texcb", "cb") and not texgen:
                combo = arena.combiner_spec(m, p, src, sampler, tex_scale, files, "textures/%s/tex" % name)
                if combo is not None and over:
                    combo["clear"] = list(clear)

        # material
        double = not (p.geo_mode & G_CULL_BACK)
        face = sorted(t for t in face_sets.get(p.tex_anim, ()) if m.has_texture(t)) \
            if has_tex and not isinstance(src, tuple) and p.tex_anim >= 0 else []
        if isinstance(src, tuple) and src[0] == "flame":
            face = list(range(8))
        for t in face:  # the material must allow the alpha of every face frame
            if t == src:
                continue
            fa = bank.get(t, p.tlut, pal, mir_s, mir_t)[3]
            if fa == "BLEND" or (fa == "MASK" and alpha_mode == "OPAQUE"):
                alpha_mode = fa
        mkey = (tkey_tile or src, p.tlut, pal, ws, wt, mir_s, mir_t, double, lit,
                p.tex_anim if face else -1, layer, over) if has_tex else ("flat", double, lit)
        if mkey not in mat_index:
            mat = {"name": "%s_flat%02d" % (name, len(g.j["materials"])),
                   "pbrMetallicRoughness": {"metallicFactor": 0.0, "roughnessFactor": 0.9},
                   "doubleSided": double}
            if has_tex:
                tkey = (tkey_tile or src, p.tlut, pal, mir_s, mir_t, ws, wt, over)
                label = ("tex%02d" % src) if not isinstance(src, tuple) else (
                    "flame%02d" % src[1] if src[0] == "flame" else
                    "tex%02d_cb%02d" % src[1:3] if src[0] == "texcb" else "cb%02d" % src[1])
                if tile:
                    label += "_tile%d" % tile_cache[tkey_tile][4]
                if tkey not in tex_index:
                    w, h, rgba = tile_cache[tkey_tile][:3] if tile else bank.get(src, p.tlut, pal, mir_s, mir_t)[:3]
                    if over:  # plain glTF: pre-blend over the background colour
                        rgba = arena.composite_over(rgba, over[0], over[1])
                    img_name = label + ("_pal%d" % pal if pal else "") + (
                        "_tlut%d" % p.tlut if p.tlut >= 0 else "") + ("_bg" if over else "")
                    img = g.image(encode_rgba(w, h, rgba), img_name)
                    g.j["textures"].append({"source": img, "sampler": g.sampler(ws, wt), "name": img_name})
                    tex_index[tkey] = len(g.j["textures"]) - 1
                    srcd = bank.source(src)
                    info_textures.append(dict(name=img_name, w=w, h=h, fmt=srcd["fmt"], siz=srcd["siz"]))
                mat["pbrMetallicRoughness"]["baseColorTexture"] = {"index": tex_index[tkey]}
                if sbank is not None and not tile:
                    img_name = g.j["textures"][tex_index[tkey]]["name"]
                    rel = "textures/shiny/%s%s%s.png" % (img_name, "_ms" if mir_s else "", "_mt" if mir_t else "")
                    if rel not in files:
                        sw, sh_, srgba, _ = sbank.get(src, p.tlut, pal, mir_s, mir_t)
                        files[rel] = encode_rgba(sw, sh_, srgba)
                    mat.setdefault("extras", {})["ps2_shiny"] = rel
                mat["name"] = "%s_%s" % (name, label) + ("_face%d" % p.tex_anim if face else "")
                if face:
                    sfx = ("_pal%d" % pal if pal else "") + ("_tlut%d" % p.tlut if p.tlut >= 0 else "") + (
                        "_ms" if mir_s else "") + ("_mt" if mir_t else "")
                    fmap = {}
                    for t in face:
                        fsrc = ("flame", src[1], t) if isinstance(src, tuple) else t
                        rel = ("textures/face/flame%02d_f%d.png" % (src[1], t)) if isinstance(src, tuple) \
                            else "textures/face/tex%02d%s.png" % (t, sfx)
                        if rel not in files:
                            fw, fh_, frgba, _ = bank.get(fsrc, p.tlut, pal, mir_s, mir_t)
                            files[rel] = encode_rgba(fw, fh_, frgba)
                            if sbank is not None:
                                fw, fh_, frgba, _ = sbank.get(fsrc, p.tlut, pal, mir_s, mir_t)
                                files[rel.replace("textures/face/", "textures/shiny/face/")] = \
                                    encode_rgba(fw, fh_, frgba)
                        fmap[str(t)] = rel
                    mat.setdefault("extras", {})["ps2_face"] = {
                        "channel": p.tex_anim, "default": 0 if isinstance(src, tuple) else p.tex,
                        "files": fmap}
                if alpha_mode != "OPAQUE":
                    mat["alphaMode"] = alpha_mode
                    if alpha_mode == "MASK":
                        mat["alphaCutoff"] = 0.5
                if combo is not None:  # a JSON string: Blender custom properties can't hold nulls in lists
                    combo["lit"] = lit
                    mat.setdefault("extras", {})["ps2_combiner"] = json.dumps(combo, separators=(",", ":"))
            if not lit:
                mat.setdefault("extensions", {})["KHR_materials_unlit"] = {}
            g.j["materials"].append(mat)
            mat_index[mkey] = len(g.j["materials"]) - 1

        pos, nrm, uv, col, joints = [], [], [], [], []
        raw = [] if combo is not None else None  # texture coordinates in texels (TEXCOORD_1)
        gain = bank.gain(src, p.tlut, pal, mir_s, mir_t) if isinstance(src, tuple) and src[0] == "texcb" else 1.0
        for v in p.verts:
            x, y, z, s, t, c0, c1, c2, c3, bone = v
            if bone >= 0:
                pm = pivots[bone]
                j = bone
            else:
                pm = IDENT34
                j = nb
                used_root = nb > 0
            lx, ly, lz = x * k, y * k, z * k
            pos.append((pm[0][0] * lx + pm[0][1] * ly + pm[0][2] * lz + pm[0][3],
                        pm[1][0] * lx + pm[1][1] * ly + pm[1][2] * lz + pm[1][3],
                        pm[2][0] * lx + pm[2][1] * ly + pm[2][2] * lz + pm[2][3]))
            if lit:
                nx, ny, nz = c0 / 127.0, c1 / 127.0, c2 / 127.0
                wx = pm[0][0] * nx + pm[0][1] * ny + pm[0][2] * nz
                wy = pm[1][0] * nx + pm[1][1] * ny + pm[1][2] * nz
                wz = pm[2][0] * nx + pm[2][1] * ny + pm[2][2] * nz
                ln = math.sqrt(wx * wx + wy * wy + wz * wz) or 1.0
                nrm.append((wx / ln, wy / ln, wz / ln))
                if texgen:
                    # environment-mapped: approximate a sphere map from the normal
                    uv.append((wx / ln * 0.5 + 0.5, -wy / ln * 0.5 + 0.5))
                else:
                    uv.append((s * us + uo, t * vs + vo))
            else:
                if gain > 1.0:
                    col.append(tuple(min(255, int((c & 0xFF) * gain + 0.5)) for c in (c0, c1, c2)) + (c3,))
                else:
                    col.append((c0 & 0xFF, c1 & 0xFF, c2 & 0xFF, c3))
                uv.append((s * us + uo, t * vs + vo))
            joints.append((j, 0, 0, 0))
            if raw is not None:
                raw.append((s / 32.0 * tex_scale[0], t / 32.0 * tex_scale[1]))
        idx = [i for tri in p.tris for i in tri]
        lift = lifts.get(pi) if pi < len(m.prims) else None
        if lift:  # coplanar overlay: lift its triangles (split shared vertices)
            keymap, order, idx = {}, [], []
            for ti, tri in enumerate(p.tris):
                lv = lift.get(ti)
                for vi in tri:
                    key = (vi, lv[0] if lv else 0)
                    if key not in keymap:
                        keymap[key] = len(order)
                        order.append((vi, lv[1] if lv else None))
                    idx.append(keymap[key])
            pos = [tuple(pos[vi][c] + (d[c] if d else 0.0) for c in range(3)) for vi, d in order]
            nrm, uv, col, joints, raw = ([a[vi] for vi, _ in order] if a else a
                                         for a in (nrm, uv, col, joints, raw))
        attrs = {"POSITION": g.accessor(pos, "VEC3", target=34962, minmax=True)}
        if lit:
            attrs["NORMAL"] = g.accessor(nrm, "VEC3", target=34962)
        else:
            attrs["COLOR_0"] = g.accessor(col, "VEC4", 5121, target=34962, normalized=True)
        if has_tex:
            attrs["TEXCOORD_0"] = g.accessor(uv, "VEC2", target=34962)
        if raw is not None:
            attrs["TEXCOORD_1"] = g.accessor(raw, "VEC2", target=34962)
        if nb:
            attrs["JOINTS_0"] = g.accessor(joints, "VEC4", 5121 if nb < 255 else 5123, target=34962)
            attrs["WEIGHTS_0"] = g.accessor([(1.0, 0.0, 0.0, 0.0)] * len(joints), "VEC4", target=34962)
        ind = g.accessor(idx, "SCALAR", 5123 if len(pos) < 65536 else 5125, target=34963)
        prim = {"attributes": attrs, "indices": ind, "material": mat_index[mkey]}
        prims_out.append(prim)

    mesh = None
    if prims_out:
        g.j["meshes"].append({"name": name, "primitives": prims_out})
        mesh = g.node(name=name, mesh=0)
    # ---- skin
    joint_nodes = list(scale_nodes)
    ibms = []
    for i in range(nb):
        ibms.append(inv_rigid_col(pivots[i]))
    if used_root:
        joint_nodes.append(rig)
        ibms.append([1.0, 0, 0, 0, 0, 1.0, 0, 0, 0, 0, 1.0, 0, 0, 0, 0, 1.0])
    if mesh is not None and joint_nodes:
        ibm = g.accessor(ibms, "MAT4")
        g.j["skins"].append({"joints": joint_nodes, "inverseBindMatrices": ibm, "skeleton": rig,
                             "name": name + "_skin"})
        g.j["nodes"][mesh]["skin"] = 0
    g.j["scenes"][0]["nodes"] = [rig] + ([mesh] if mesh is not None else [])

    # ---- animations
    info_clips = []
    for clip_name, anim, extras in clips:
        n = max(1, anim.nframes)
        times = [f / FPS for f in range(n)]
        tr_keys = [[] for _ in range(nb)]
        rot_keys = [[] for _ in range(nb)]
        sc_keys = [[] for _ in range(nb)]
        for fr in range(n):
            trs = []
            for b in bones:
                if b.chan >= 0 and anim.has_channel(b.chan):
                    trs.append(anim.sample(b.chan, fr, b.t, b.r, b.s))
                else:
                    trs.append((b.t, b.r, b.s))
            _, f_accs, f_local = pose(bones, trs, k)
            for i in range(nb):
                tr_keys[i].append(f_local[i])
                q = euler_quat(trs[i][1])
                if rot_keys[i]:
                    pq = rot_keys[i][-1]
                    if pq[0] * q[0] + pq[1] * q[1] + pq[2] * q[2] + pq[3] * q[3] < 0:
                        q = [-c for c in q]
                rot_keys[i].append(q)
                sc_keys[i].append(f_accs[i])
        channels, samplers = [], []
        t_all = g.accessor(times, "SCALAR", minmax=True)
        t_one = None

        def add(node, path, keys, typ):
            nonlocal t_one
            const = all(max(abs(a - b) for a, b in zip(key, keys[0])) < 1e-6 for key in keys)
            if const:
                if t_one is None:
                    t_one = g.accessor([0.0], "SCALAR", minmax=True)
                inp, keys = t_one, keys[:1]
            else:
                inp = t_all
            samplers.append({"input": inp, "output": g.accessor(keys, typ), "interpolation": "LINEAR"})
            channels.append({"sampler": len(samplers) - 1, "target": {"node": node, "path": path}})

        for i in range(nb):
            add(pivot_nodes[i], "translation", tr_keys[i], "VEC3")
            add(pivot_nodes[i], "rotation", rot_keys[i], "VEC4")
            add(scale_nodes[i], "scale", sc_keys[i], "VEC3")
        if channels:
            a = {"name": clip_name, "channels": channels, "samplers": samplers}
            if extras:
                a["extras"] = extras
            g.j["animations"].append(a)
        info_clips.append(dict(name=clip_name, frames=n, seconds=round(n / FPS, 3),
                               loop_start=anim.loop, **(extras or {})))

    info = dict(bones=nb, primitives=len(prims_out), textures=info_textures, clips=info_clips,
                triangles=sum(len(p.tris) for p in m.prims))
    info["face_materials"] = [dict(material=mt["name"], **mt["extras"]["ps2_face"])
                              for mt in g.j["materials"] if "ps2_face" in mt.get("extras", {})]
    return g.glb(), info, files
