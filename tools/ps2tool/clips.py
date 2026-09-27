"""Naming of skeletal clips from the per-species battle dispatch table.

The pose bank has no clip names. Stadium 2 keeps a per-species battle table
(archive 0x1718000, record N-1 = species N, 0x1530 bytes = 271 entries of
0x14 bytes). Entries 0..250 are the 251 moves, 251..270 battle contexts.
Byte 0 of an entry selects the body clip, byte 1 the texture (face) clip.
Research: gen1recomp-mod-stadium2-importer lib/animation_dispatch.lua and
lib/animation_semantics.lua.
"""
import struct
from collections import Counter

from .rom import decompress

DISPATCH_TABLE = 0x1718000
ENTRY = 0x14
MOVES = 251
CONTEXTS = {251: "idle", 252: "entrance", 253: "faint", 254: "hit", 268: "sleep"}


def dispatch_rows(rom, species):
    arc = rom.archive(DISPATCH_TABLE)
    if not 1 <= species <= arc.count:
        return None
    blob = decompress(arc.raw(species - 1))
    if len(blob) != 0x1530:
        return None
    rows = []
    for i in range(len(blob) // ENTRY):
        b0, b1 = blob[i * ENTRY], blob[i * ENTRY + 1]
        rows.append((b0, b1 - 256 if b1 >= 128 else b1))
    return rows


def selector_table(frag, species):
    """Model-fragment table mapping dispatch selector -> pose-bank file."""
    tag = struct.pack(">I", (species << 16) | 1)
    d = frag.d
    o = d.find(tag)
    while o >= 0:
        if o % 4 == 0 and o + 16 <= len(d):
            count = d[o + 4]
            at = frag.ptr(o + 12)
            if count and at is not None and at % 2 == 0 and at + count * 4 <= len(d):
                return [struct.unpack_from(">H", d, at + i * 4 + 2)[0] for i in range(count)]
        o = d.find(tag, o + 1)
    return None


def name_clips(rom, frag, species, nclips, move_names=None):
    """Return per-clip dicts: name, roles, moves, aux (face clip index)."""
    info = [dict(roles=[], moves=[], aux=Counter()) for _ in range(nclips)]
    rows = dispatch_rows(rom, species) if 1 <= species <= 251 else None
    if rows:
        table = selector_table(frag, species)
        top = max((r[0] for r in rows if r[0] != 0xFF), default=0)
        base = 0 if top < nclips else 1

        def clip_for(sel):
            if sel == 0xFF:
                return None
            if table is not None:
                if sel >= len(table) or table[sel] >= nclips:
                    return None
                return table[sel]
            c = sel if sel == 0 else sel - base
            return c if 0 <= c < nclips else None

        for i, (sel, aux) in enumerate(rows):
            c = clip_for(sel)
            if c is None:
                continue
            if i < MOVES:
                info[c]["moves"].append(move_names[i] if move_names and i < len(move_names) else i + 1)
            elif i in CONTEXTS:
                info[c]["roles"].append(CONTEXTS[i])
            if aux >= 0:
                info[c]["aux"][aux] += 1
    out = []
    attack = 0
    for c, it in enumerate(info):
        role = next((r for r in ("idle", "entrance", "faint", "hit", "sleep") if r in it["roles"]), None)
        if role is None and it["moves"]:
            attack += 1
            role = "attack%d" % attack
        name = "%02d_%s" % (c, role or "clip")
        aux = it["aux"].most_common(1)[0][0] if it["aux"] else None
        out.append(dict(name=name, roles=sorted(set(it["roles"])), moves=it["moves"], face_clip=aux))
    return out
