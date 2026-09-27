"""Battle / move effects.

Resource archive 0x267D000: 131 FRAGMENT modules. FRAGMENT +0x10 is an
export table of 8-byte entries (u8 kind, pad, u16 symbol, u32 address),
kind 0 ends it. Kinds:
  1  raw data (mostly 32x32 I4 / RGBA16 textures used by beams and waves)
  2  particle shape: u16 flags, u16 count, ptr -> count x 16-byte entries
     (material ptr, u16, u16 render state, display list ptr, u32)
     where the material is a render-time material block (textures with
     flipbook frames, combiner, primitive/environment colours)
  3  compiled layout: a geo layout with bones (a skeletal effect model)
  4  skeletal animation (same encoding as Pokemon clips)
Code fragment 79 (the battle effect engine) holds, per move / battle effect
ID, the list of resource modules the effect loads (table at VRAM 0x84182A5C,
8-byte rows: u16 route, u16 alt route, u32 -> byte list ended by 0x83).
Research: gen1recomp-mod-stadium2-importer lib/stadium2_battle_fx_*.lua.
"""
import json
import os
import re
import struct

from .export import StaticClip, write_model
from .fragment import Anim, Bone, Fragment, Model, decode_texture
from .names import effect_name, slug
from .png import encode_rgba

FX_TABLE = 0x267D000
FX_VRAM = 0x84100000
MOVE_TABLE_VRAM = 0x84182A5C
EFFECT_IDS = 301


def exports(d):
    cur = struct.unpack_from(">I", d, 0x10)[0]
    out = []
    while 0x20 <= cur <= len(d) - 8:
        kind = d[cur]
        if kind == 0:
            break
        sym, addr = struct.unpack_from(">HI", d, cur + 2)
        out.append(dict(kind=kind, symbol=sym, offset=addr - 0x8FF00000))
        cur += 8
    return out


def find_fragment79(rom):
    """ROM offset of code fragment 79 (the 79th FRAGMENT in the code area)."""
    hits = [m.start() - 8 for m in re.finditer(b"FRAGMENT", rom.data[:0x440000])]
    return hits[78] if len(hits) > 78 else None


def move_resources(rom, move_names=None):
    """{effect id: [resource ids]} for moves 1..251 and battle effects 252..301."""
    base = find_fragment79(rom)
    if base is None:
        return {}
    size = struct.unpack_from(">I", rom.data, base + 0x18)[0]
    frag = rom.data[base:base + size]
    t = MOVE_TABLE_VRAM - FX_VRAM
    out = {}
    for i in range(1, EFFECT_IDS + 1):
        if t + i * 8 + 8 > len(frag):
            break
        p = struct.unpack_from(">I", frag, t + i * 8 + 4)[0] - FX_VRAM
        if not 0 <= p < len(frag):
            continue
        ids = []
        for k in range(64):
            b = frag[p + k]
            if b == 0x83:
                break
            ids.append(b)
        else:
            continue
        out[i] = ids
    return out


def effect_label(i, move_names):
    if i <= 251 and move_names and i - 1 < len(move_names):
        return move_names[i - 1]
    return "battle effect %d" % i


def _flipbook_clip(model):
    books = getattr(model, "flipbooks", {})
    if not books:
        return [], {}
    n = max(len(ids) for ids in books.values()) * 2
    extras = {"face": {str(ch): [ids[(f // 2) % len(ids)] for f in range(n)] for ch, ids in books.items()}}
    sets = {ch: set(ids) for ch, ids in books.items()}
    return [("flipbook", StaticClip(n), extras)], sets


def export_module(rom, index, outdir, users, scale=0.01, tints=None, display=None):
    raw = rom.archive(FX_TABLE).get(index)
    frag = Fragment(raw, "fx_%03d" % index)
    ex = exports(raw)
    display = display or "Effect %03d" % index
    d = os.path.join(outdir, "effects", "fx_%03d_%s" % (index, slug(display)))
    os.makedirs(d, exist_ok=True)
    summary = dict(module=index, display=display, folder=os.path.basename(d), used_by=users,
                   shapes=[], models=[], animations=[], raw=[])
    offsets = sorted(e["offset"] for e in ex)

    def end_of(o):
        nxt = [x for x in offsets if x > o]
        return nxt[0] if nxt else struct.unpack_from(">I", raw, 0x14)[0]

    anims = [(e["symbol"], Anim(frag.d, e["offset"], frag.off)) for e in ex if e["kind"] == 4]
    for e in ex:
        sym, off, kind = e["symbol"], e["offset"], e["kind"]
        try:
            if kind == 2:
                flags, count, lp = struct.unpack_from(">HHI", frag.d, off)
                lo = frag.off(lp)
                model = Model(frag, empty=True)
                model.intensity_alpha = True
                model.keep_visible = True  # runtime-alpha particles: show the raw texture
                shape_tints = (tints or {}).get(sym, [])
                if shape_tints:
                    model.tint = shape_tints[0]["primary"], shape_tints[0]["secondary"]
                # one root bone so the flipbook can be keyed like any clip
                model.bones = [Bone(-1, 0, 0, -1, (0, 0, 0), (0, 0, 0), (1.0, 1.0, 1.0))]
                for j in range(count if lo is not None else 0):
                    mat_p, _, _, dl_p, _ = struct.unpack_from(">IHHII", frag.d, lo + j * 16)
                    if frag.off(dl_p) is not None:
                        model.add_shape(frag.off(dl_p), frag.off(mat_p), bone=0)
                clips, sets = _flipbook_clip(model)
                base = "shape_%03d" % sym
                info = write_model(model, base, d, clips, sets, scale,
                                   extra_info=dict(module=index, symbol=sym, kind="shape",
                                                   tint_used=shape_tints[0] if shape_tints else None,
                                                   tints=shape_tints))
                # flipbook frames as PNG, once per colour variant used in game
                from .gltf import TextureBank
                vids = sorted(model.virtual)
                for ti, tv in enumerate(shape_tints or [None]):
                    model.tint = (tv["primary"], tv["secondary"]) if tv else None
                    bank = TextureBank(model)
                    sd = os.path.join(d, "sprites", "shape_%03d_%s" % (
                        sym, "tint%d" % ti if tv else "raw"))
                    os.makedirs(sd, exist_ok=True)
                    for k, vid in enumerate(vids):
                        w, h, rgba, _ = bank.get(vid, -1, 0)
                        with open(os.path.join(sd, "%02d.png" % k), "wb") as fh:
                            fh.write(encode_rgba(w, h, rgba))
                summary["shapes"].append(dict(file=base + ".glb", symbol=sym, triangles=info["triangles"],
                                              flipbook_frames=max((len(v) for v in getattr(
                                                  model, "flipbooks", {}).values()), default=1)))
            elif kind == 3:
                model = Model(frag, layout=off)
                model.intensity_alpha = True
                model.keep_visible = True
                model.build()
                need = 3 * (max((b.chan for b in model.bones), default=-1) + 1)
                mine = [(s, a) for s, a in anims if need and a.nch == need]
                clips = [("anim_%03d" % s, a, {}) for s, a in mine]
                base = "model_%03d" % sym
                info = write_model(model, base, d, clips, None, scale,
                                   extra_info=dict(module=index, symbol=sym, kind="layout"))
                summary["models"].append(dict(file=base + ".glb", symbol=sym, bones=info["bones"],
                                              triangles=info["triangles"], animations=[s for s, _ in mine]))
            elif kind == 4:
                a = dict(anims)[sym]
                summary["animations"].append(dict(symbol=sym, frames=a.nframes, channels=a.nch))
            elif kind == 1:
                size = end_of(off) - off
                data = frag.d[off:off + size]
                rel = None
                if size in (512, 2048):  # 32x32 I4 / RGBA16
                    tex = dict(fmt=4, siz=0, w=32, h=32, data=off) if size == 512 else \
                        dict(fmt=0, siz=2, w=32, h=32, data=off)
                    w, h, rgba = decode_texture(frag, tex, intensity_alpha=True)
                    rel = "raw_%03d.png" % sym
                    with open(os.path.join(d, rel), "wb") as fh:
                        fh.write(encode_rgba(w, h, rgba))
                else:
                    rel = "raw_%03d.bin" % sym
                    with open(os.path.join(d, rel), "wb") as fh:
                        fh.write(data)
                summary["raw"].append(dict(symbol=sym, bytes=size, file=rel))
        except Exception as err:  # noqa: BLE001
            summary.setdefault("errors", []).append("kind %d symbol %d: %s" % (kind, sym, err))
    with open(os.path.join(d, "fx_%03d.json" % index), "w") as fh:
        json.dump(summary, fh, indent=1)
    return summary


def particle_tints(rom, table, move_names=None):
    """{module: {shape symbol: [dict(primary, secondary, effects)]}}, most
    used colour pair first. A move's shape symbols resolve through module 0
    and then its own resource list, later modules overriding earlier ones."""
    parts = move_particles(rom)
    arc = rom.archive(FX_TABLE)
    symbols = {}
    for m in range(arc.count):
        symbols[m] = {e["symbol"] for e in exports(arc.get(m)) if e["kind"] == 2}
    acc = {}
    for eid, plist in parts.items():
        order = [0] + [r for r in table.get(eid, []) if r != 0]
        for shape, prim, sec in plist:
            if prim is None or sec is None:
                continue
            owner = next((m for m in reversed(order) if shape in symbols.get(m, ())), None)
            if owner is None:
                continue
            key = (prim, sec)
            slot = acc.setdefault(owner, {}).setdefault(shape, {})
            slot.setdefault(key, set()).add(effect_label(eid, move_names))
    out = {}
    for m, shapes in acc.items():
        for shape, pairs in shapes.items():
            ranked = sorted(pairs.items(), key=lambda kv: -len(kv[1]))
            out.setdefault(m, {})[shape] = [dict(primary=list(k[0]), secondary=list(k[1]), effects=sorted(v))
                                            for k, v in ranked]
    return out


def export_all(rom, outdir, move_names=None, ids=None, scale=0.01):
    table = move_resources(rom)
    users = {}
    for eid, res in table.items():
        for r in res:
            users.setdefault(r, []).append(effect_label(eid, move_names))
    tints = particle_tints(rom, table, move_names)
    arc = rom.archive(FX_TABLE)
    labels = {effect_label(e, move_names): r for e, r in table.items()}
    out = []
    for i in (ids if ids else range(arc.count)):
        u = users.get(i, ["(common)"] if i == 0 else [])
        out.append(export_module(rom, i, outdir, u, scale, tints.get(i), display=effect_name(u, labels)))
    index = dict(
        modules=[dict(module=s["module"], display=s["display"], folder=s["folder"], used_by=s["used_by"],
                      shapes=len(s["shapes"]),
                      models=len(s["models"]), animations=len(s["animations"]), raw=len(s["raw"]))
                 for s in out],
        effects={effect_label(e, move_names): r for e, r in sorted(table.items())})
    os.makedirs(os.path.join(outdir, "effects"), exist_ok=True)
    with open(os.path.join(outdir, "effects", "index.json"), "w") as fh:
        json.dump(index, fh, indent=1)
    return out


# ------------------------------------------------------- particle programs
PROGRAM_TABLE_VRAM = 0x84182154
PROGRAM_COUNT = 395
OPCODE_TABLE_VRAM = 0x8416A218
OPCODE_COUNT = 18
SEQUENCE_TABLE_VRAM = 0x84182A30
VARIANT_TABLE_VRAM = 0x84182A18
PARTICLE_OPCODES = (4, 8, 14)  # emitters using the common 24-byte descriptor


class Frag79:
    def __init__(self, rom):
        base = find_fragment79(rom)
        size = struct.unpack_from(">I", rom.data, base + 0x18)[0]
        self.d = rom.data[base:base + size]

    def ok(self, addr, n=4):
        o = addr - FX_VRAM
        return 0 <= o and o + n <= len(self.d)

    def u8(self, a):
        return self.d[a - FX_VRAM]

    def u16(self, a):
        return struct.unpack_from(">H", self.d, a - FX_VRAM)[0]

    def s16(self, a):
        return struct.unpack_from(">h", self.d, a - FX_VRAM)[0]

    def u32(self, a):
        return struct.unpack_from(">I", self.d, a - FX_VRAM)[0]

    def ptr(self, a, off=0):
        if not self.ok(a + off):
            return None
        v = self.u32(a + off)
        return v if self.ok(v) else None

    def rgba(self, a):
        return tuple(self.d[a - FX_VRAM:a - FX_VRAM + 4]) if a and self.ok(a) else None


def _route(f, value, alternate=False, depth=0):
    """Program ids a route value expands to (0x8000 sequences, 0x4000 variants)."""
    if depth > 4:
        return []
    if value >= 0x8000:
        p = f.ptr(SEQUENCE_TABLE_VRAM + (value - 0x8000) * 4)
        out = []
        while p and f.ok(p, 2) and f.u16(p) and len(out) < 256:
            out += _route(f, f.u16(p), alternate, depth + 1)
            p += 2
        return out
    if value >= 0x4000:
        a = VARIANT_TABLE_VRAM + (value - 0x4000) * 4 + (2 if alternate else 0)
        return _route(f, f.u16(a), alternate, depth + 1) if f.ok(a, 2) else []
    return [value] if value < PROGRAM_COUNT else []


def program_particles(f, pid):
    """[(shape id, primary rgba, secondary rgba)] emitted by a program."""
    lengths = {}
    for op in range(OPCODE_COUNT):
        lengths[op] = f.u32(OPCODE_TABLE_VRAM + op * 8 + 4)
    cur = f.ptr(PROGRAM_TABLE_VRAM + pid * 4)
    out = []
    for _ in range(4096):
        if cur is None or not f.ok(cur, 1):
            break
        op = f.u8(cur)
        n = lengths.get(op)
        if n not in (4, 8, 16):
            break
        if op in PARTICLE_OPCODES and n >= 8:
            desc = f.ptr(cur, 4)
            mat = f.ptr(desc, 20) if desc else None
            if mat:
                ctl = f.ptr(mat, 8)
                prim = f.rgba(f.ptr(ctl, 4)) if ctl else None
                sec = f.rgba(f.ptr(ctl, 8)) if ctl else None
                out.append((f.s16(mat), prim, sec))
        if op == 0:
            break
        cur += n
    return out


def move_particles(rom):
    """{effect id: [(shape id, primary, secondary)]} for every move/effect."""
    f = Frag79(rom)
    t = MOVE_TABLE_VRAM
    out = {}
    for i in range(1, EFFECT_IDS + 1):
        prim, alt = f.u16(t + i * 8), f.u16(t + i * 8 + 2)
        seen, parts = set(), []
        for pid in _route(f, prim) + _route(f, alt, True):
            if pid in seen:
                continue
            seen.add(pid)
            parts += program_particles(f, pid)
        out[i] = parts
    return out
