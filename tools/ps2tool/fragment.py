"""Pokemon Stadium 2 FRAGMENT modules: geo layouts, F3DEX2 display lists,
textures and skeletal / texture animation decoding.

Format knowledge comes from the reverse-engineering in
Deftones565/gen1recomp-mod-stadium2-importer (lib/fragment.lua) and the
pret/pokestadium(gs) decompilations.
"""
import struct

BASE = 0x8FF00000

# Geo-layout command sizes (command byte -> length in bytes).
CMD_SIZES = {
    0x00: 0x08, 0x01: 0x04, 0x02: 0x08, 0x03: 0x08, 0x04: 0x04,
    0x05: 0x04, 0x06: 0x04, 0x07: 0x08, 0x08: 0x0C, 0x09: 0x04,
    0x0A: 0x08, 0x0B: 0x18, 0x0C: 0x04, 0x0D: 0x04, 0x0E: 0x04,
    0x0F: 0x04, 0x10: 0x04, 0x11: 0x04, 0x12: 0x04, 0x13: 0x08,
    0x14: 0x0C, 0x15: 0x0C, 0x16: 0x04, 0x17: 0x14, 0x18: 0x08,
    0x19: 0x08, 0x1A: 0x04, 0x1B: 0x10, 0x1C: 0x10, 0x1D: 0x1C,
    0x1E: 0x08, 0x1F: 0x18, 0x20: 0x14, 0x21: 0x10, 0x22: 0x08,
    0x23: 0x10, 0x24: 0x04, 0x25: 0x04, 0x26: 0x14,
    0x28: 0x04, 0x29: 0x04,
}

# Render-time callbacks (fragment26 descriptors) that supply the texture of
# the untextured geometry drawn after them ("phase 5" geometry pipeline). All
# four build the material with 0x810024E0, in modes 0, 1, 2 and 4 (0x81000178:
# the stars of object 190, the cut effects 130 and 131...).
PHASE5_HANDLERS = (0x81000138, 0x81000140, 0x81000148, 0x81000178)
# Shared fire card (Charmander line, Magmar, Moltres): 8 IA16 frames at
# arg+8, rendered as 32x64 IA8 on a 100x200-unit billboard at the bone.
FLAME_HANDLER = 0x81000038
FLAME_CHANNEL_BASE = 100  # texture-animation channel id used for flames

G_CULL_FRONT = 0x200
G_CULL_BACK = 0x400


def s16v(v):
    return v - 0x10000 if v & 0x8000 else v


class Fragment:
    """A relocated FRAGMENT module, viewed as its loaded memory image."""

    def __init__(self, data, name="?", base=BASE):
        if data[8:16] != b"FRAGMENT":
            raise ValueError("%s: not a FRAGMENT module" % name)
        reloc, file_end, mem_end = struct.unpack_from(">III", data, 0x14)
        # The loader consumes the relocation table and zero-fills the range up
        # to the memory end (BSS). Some models point callback data there.
        if file_end == len(data) and reloc <= file_end and mem_end >= reloc:
            data = data[:reloc] + bytes(mem_end - reloc)
        self.d = data
        self.name = name
        self.base = base

    def __len__(self):
        return len(self.d)

    def u8(self, o):
        return self.d[o]

    def s8(self, o):
        v = self.d[o]
        return v - 256 if v >= 128 else v

    def u16(self, o):
        return (self.d[o] << 8) | self.d[o + 1]

    def s16(self, o):
        return s16v(self.u16(o))

    def u32(self, o):
        return struct.unpack_from(">I", self.d, o)[0]

    def s32(self, o):
        return struct.unpack_from(">i", self.d, o)[0]

    def off(self, ptr):
        if ptr == 0:
            return None
        o = ptr - self.base
        if o < 0 or o >= len(self.d):
            return None
        return o

    def ptr(self, o):
        return self.off(self.u32(o))

    def ptr_list(self, o):
        out = []
        while o is not None and o + 4 <= len(self.d):
            p = self.ptr(o)
            if p is None:
                break
            out.append(p)
            o += 4
        return out

    def root(self):
        """Model descriptor, found from the entrypoint's LUI/ADDIU pair."""
        for o in range(0x20, 0x80, 4):
            w = self.u32(o)
            if w >> 26 == 0x0F:  # lui
                reg = (w >> 16) & 0x1F
                w2 = self.u32(o + 4)
                if w2 >> 26 == 0x09 and (w2 >> 21) & 0x1F == reg:  # addiu
                    return self.off((self.u16(o + 2) << 16) + self.s16(o + 6))
        return None

    def stage_root(self):
        """Arena modules return their geo layout from the entrypoint."""
        lui, addiu = self.u32(0x3C), self.u32(0x44)
        if lui >> 16 != 0x3C03 or addiu >> 16 != 0x2462:
            return None
        return self.off((self.u16(0x3E) << 16) + self.s16(0x46))

    def stage_clear_color(self):
        """Background (framebuffer clear) colour of an arena: the entrypoint
        returns it for selector 1 as an RGBA5551 constant (li v1 at +0x30)."""
        w = self.u32(0x30)
        if w >> 16 not in (0x2403, 0x3403):  # addiu / ori v1, zero, imm
            return None
        v = w & 0xFFFF
        return tuple(((v >> sh) & 31) * 255 // 31 for sh in (11, 6, 1))


class Prim:
    """A batch of triangles sharing one material state."""

    def __init__(self, key, tex, tlut, mat, tex_anim, geo_mode, node_color, tex_scale, callback=None):
        self.key = key
        self.callback = callback
        self.tex, self.tlut, self.mat, self.tex_anim = tex, tlut, mat, tex_anim
        self.geo_mode = geo_mode
        self.node_color = node_color
        self.tex_scale = tex_scale
        self.verts = []
        self.remap = {}
        self.tris = []
        self.order = []  # submission number of each triangle (draw order)
        self.layer = 1  # arena render layer (1 opaque, 4 cutout, 5+ translucent)

    def add_tri(self, vbuf, a, b, c, flip, serial=0):
        idx = []
        for k in (a, b, c):
            v = vbuf.get(k)
            if v is None:
                return
            j = self.remap.get(v)
            if j is None:
                j = len(self.verts)
                self.remap[v] = j
                self.verts.append(v)
            idx.append(j)
        if flip:
            idx[0], idx[2] = idx[2], idx[0]
        self.tris.append(tuple(idx))
        self.order.append(serial)


class Bone:
    def __init__(self, parent, bone_id, flags, chan, t, r, s, static=False):
        self.parent, self.id, self.flags, self.chan = parent, bone_id, flags, chan
        self.t, self.r, self.s = t, r, s  # s16 translation, s16 binary angles, float scale
        self.static = static


class Model:
    def __init__(self, frag, layout=None, stage=False, empty=False):
        self.f = frag
        self.stage = stage
        self.species = 0
        self.intensity_alpha = False
        self.virtual = {}  # synthetic texture id -> dict(tex, cb, sampler, scale)
        self.anim_ptrs, self.aux_ptrs, layouts = [], [], []
        if empty:
            pass
        elif layout is None:
            r = frag.root()
            if r is None:
                raise ValueError("%s: no model root" % frag.name)
            self.species = frag.u16(r)
            g, a, x = frag.ptr(r + 8), frag.ptr(r + 0xC), frag.ptr(r + 0x10)
            layouts = frag.ptr_list(g) if g is not None else []
            self.anim_ptrs = frag.ptr_list(a) if a is not None else []
            self.aux_ptrs = frag.ptr_list(x) if x is not None else []
        else:
            layouts = [layout]
        self.layouts = layouts
        self.textures, self.tluts, self.bones = [], [], []
        self.bone_by_id = {}
        self.prims, self.prims_by_key = [], {}
        self.root_scale = (1.0, 1.0, 1.0)
        self.attachments = []
        self.callbacks = []
        self.warnings = []
        if empty:
            self.cur_tex = self.cur_tlut = self.cur_tex_anim = -1
            self.cur_mat, self.cur_color, self.cur_cb = None, None, None
            self.stack, self.vbuf = [-1], {}
            self.geo_mode, self.tex_scale, self.draw_serial = 0, (1.0, 1.0), 0
            self.cb_for_bone = {}

    # ------------------------------------------------------------------ build
    def build(self):
        self.cur_tex = self.cur_tlut = self.cur_tex_anim = -1
        self.cur_mat = None
        self.cur_color = None
        self.stack = [-1]
        self.vbuf = {}
        # RSP state persists across the node lists of one model.
        self.geo_mode = 0x20400  # G_LIGHTING | G_CULL_BACK
        self.tex_scale = (1.0, 1.0)
        self.draw_serial = 0
        self.cb_for_bone = {}
        self.cur_cb = None
        if not self.layouts:
            self.warnings.append("no geo layout")
            return self
        self.future_bones = self._prescan(self.layouts[0])
        self._walk(self.layouts[0], 0)
        return self

    def _cur_bone(self):
        return self.stack[-2] if len(self.stack) >= 2 else -1

    def _read_textures(self, off, count):
        f = self.f
        for i in range(count):
            o = off + i * 0xC
            self.textures.append(dict(fmt=f.u8(o), siz=f.u8(o + 1), w=f.s16(o + 2),
                                      h=f.u16(o + 4), data=f.ptr(o + 8)))

    def _read_tluts(self, off, count):
        f = self.f
        for i in range(count):
            o = off + i * 0xC
            rec = dict(count=f.u16(o + 2), data=f.ptr(o + 4), dl=f.ptr(o + 8))
            dl = rec["dl"]
            if dl is not None:
                for _ in range(16):
                    if dl + 8 > len(f):
                        break
                    w0, w1 = f.u32(dl), f.u32(dl + 4)
                    op = w0 >> 24
                    if op == 0xFD:
                        rec["data"] = f.off(w1)
                    elif op == 0xF0:
                        rec["count"] = ((w1 >> 14) & 0x3FF) + 1
                    elif op == 0xDF:
                        break
                    dl += 8
            self.tluts.append(rec)

    def _prescan(self, o):
        f, by_id, count = self.f, {}, [0]

        def scan(at, depth):
            if depth > 32 or at is None:
                return
            while True:
                cmd = f.u8(at)
                size = CMD_SIZES.get(cmd)
                if size is None or cmd in (0x01, 0x04):
                    return
                if cmd in (0x00, 0x03):
                    scan(f.ptr(at + 4), depth + 1)
                elif cmd == 0x02:
                    at = f.ptr(at + 4)
                    if at is None:
                        return
                    continue
                elif cmd == 0x1D:
                    by_id.setdefault(f.u8(at + 1), count[0])
                    count[0] += 1
                elif cmd == 0x1F and self.stage:
                    count[0] += 1
                at += size

        scan(o, 0)
        return by_id

    def _walk(self, o, depth):
        f = self.f
        if depth > 32 or o is None:
            return
        while True:
            cmd = f.u8(o)
            size = CMD_SIZES.get(cmd)
            if size is None:
                self.warnings.append("unknown geo cmd 0x%02x at 0x%x" % (cmd, o))
                return
            if cmd in (0x01, 0x04):
                return
            elif cmd in (0x00, 0x03):
                self._walk(f.ptr(o + 4), depth + 1)
            elif cmd == 0x02:
                o = f.ptr(o + 4)
                if o is None:
                    return
                continue
            elif cmd == 0x05:
                self.stack.append(self.stack[-1])
            elif cmd == 0x06:
                self.stack.pop()
            elif cmd == 0x17:
                tt = f.ptr(o + 8)
                if tt is not None:
                    self._read_textures(tt, f.s16(o + 2))
                tl = f.ptr(o + 0xC)
                if tl is not None:
                    self._read_tluts(tl, f.s16(o + 4))
            elif cmd == 0x08:
                cb = dict(bone=self._cur_bone(), handler=f.u32(o + 4), arg=f.ptr(o + 8), offset=o)
                self.callbacks.append(cb)
                if cb["handler"] in PHASE5_HANDLERS:
                    self.cb_for_bone[cb["bone"]] = len(self.callbacks) - 1
            elif cmd == 0x1C:
                self.root_scale = (f.s32(o + 4) / 65536.0, f.s32(o + 8) / 65536.0,
                                   f.s32(o + 0xC) / 65536.0)
            elif cmd == 0x1D:
                idx = len(self.bones)
                self.bones.append(Bone(
                    self._cur_bone(), f.u8(o + 1), f.u8(o + 2), f.s8(o + 3),
                    (f.s16(o + 4), f.s16(o + 6), f.s16(o + 8)),
                    (f.s16(o + 0xA), f.s16(o + 0xC), f.s16(o + 0xE)),
                    (f.s32(o + 0x10) / 65536.0, f.s32(o + 0x14) / 65536.0,
                     f.s32(o + 0x18) / 65536.0)))
                self.bone_by_id[f.u8(o + 1)] = idx
                self.stack[-1] = idx
            elif cmd == 0x1F and self.stage:
                # Static arena transform: degrees and percentage scale.
                def angle(deg):
                    v = int(deg * 65536 / 360)  # C truncation toward zero
                    return s16v(v & 0xFFFF)
                idx = len(self.bones)
                self.bones.append(Bone(
                    self._cur_bone(), 0x100 + idx, 0, -1,
                    (f.s16(o + 0xA), f.s16(o + 0xC), f.s16(o + 0xE)),
                    (angle(f.s16(o + 4)), angle(f.s16(o + 6)), angle(f.s16(o + 8))),
                    (f.s16(o + 0x10) / 100.0, f.s16(o + 0x12) / 100.0, f.s16(o + 0x14) / 100.0),
                    static=True))
                self.stack[-1] = idx
            elif cmd == 0x23:
                self.cur_tex = f.s16(o + 8)
                self.cur_tlut = f.s16(o + 0xA)
                self.cur_mat = f.ptr(o + 4)
                self.cur_tex_anim = f.s16(o + 2)
                self.cur_color = (f.u8(o + 0xC), f.u8(o + 0xD), f.u8(o + 0xE), f.u8(o + 0xF))
            elif cmd == 0x22:
                self.cur_layer = f.u8(o + 1)
                self._run_node_dl(f.ptr(o + 4), self._cur_bone())
            elif cmd == 0x18:
                if not any(a["label"] == 100 for a in self.attachments):
                    self.attachments.append(dict(label=100, bone=self._cur_bone()))
            elif cmd == 0x24:
                self.attachments.append(dict(label=f.s16(o + 2), bone=self._cur_bone()))
            elif cmd == 0x1E:
                # Draw attached to a named joint (possibly defined later).
                bid = f.s16(o + 2)
                named = self.bone_by_id.get(bid, self.future_bones.get(bid))
                self._run_node_dl(f.ptr(o + 4), named if named is not None else self._cur_bone())
            elif cmd in (0x20, 0x21):
                self._run_node_dl(f.ptr(o + (0x10 if cmd == 0x20 else 0xC)), self._cur_bone())
            o += size

    def _run_node_dl(self, o, bone):
        self.draw_serial += 1
        b, cb = bone, None
        while b is not None and b >= 0:  # nearest phase-5 callback up the tree
            if b in self.cb_for_bone:
                cb = self.cb_for_bone[b]
                break
            b = self.bones[b].parent if b < len(self.bones) else -1
        if cb is None:
            cb = self.cb_for_bone.get(-1)
        self.cur_cb = cb
        self._run_dl(o, bone, 0)

    def _prim(self):
        key = (self.cur_tex, self.cur_tlut, self.cur_mat, self.cur_tex_anim,
               self.geo_mode, self.cur_color, self.tex_scale, self.cur_cb)
        if self.stage:
            key += (getattr(self, "cur_layer", 1),)
        p = self.prims_by_key.get(key)
        if p is None:
            p = Prim(key, self.cur_tex, self.cur_tlut, self.cur_mat, self.cur_tex_anim,
                     self.geo_mode, self.cur_color, self.tex_scale, self.cur_cb)
            if self.stage:
                p.layer = getattr(self, "cur_layer", 1)
            self.prims_by_key[key] = p
            self.prims.append(p)
        return p

    def _run_dl(self, o, bone, depth):
        f = self.f
        if o is None or depth > 8:
            return
        vbuf = self.vbuf
        steps = 0
        while 0 <= o and o + 8 <= len(f) and steps < 4096:
            steps += 1
            w0, w1 = f.u32(o), f.u32(o + 4)
            op = w0 >> 24
            o += 8
            if op == 0xDF:  # G_ENDDL
                return
            elif op == 0xDE:  # G_DL
                self._run_dl(f.off(w1), bone, depth + 1)
                if (w0 >> 16) & 0xFF:
                    return
            elif op == 0x01:  # G_VTX
                n = (w0 >> 12) & 0xFF
                v0 = ((w0 & 0xFFF) >> 1) - n
                a = f.off(w1)
                if a is None:
                    self.warnings.append("vertex pointer 0x%08X outside module" % w1)
                    continue
                n = min(n, (len(f) - a) // 16)
                for i in range(n):
                    p = a + i * 16
                    x, y, z, _, s, t, c0, c1, c2, c3 = struct.unpack_from(">hhhHhhbbbB", f.d, p)
                    slot = v0 + i
                    if 0 <= slot < 64:
                        vbuf[slot] = (x, y, z, s, t, c0, c1, c2, c3, bone)
            elif op == 0xD9:  # G_GEOMETRYMODE
                self.geo_mode = (self.geo_mode & (w0 & 0xFFFFFF)) | (w1 & 0xFFFFFF)
            elif op == 0xD7:  # G_TEXTURE
                self.tex_scale = ((w1 >> 16) / 65536.0, (w1 & 0xFFFF) / 65536.0)
            elif op in (0x05, 0x06):  # G_TRI1 / G_TRI2
                gm = self.geo_mode
                p = self._prim()
                flip = bool(gm & G_CULL_FRONT) and not (gm & G_CULL_BACK)
                self.tri_serial = getattr(self, "tri_serial", 0) + 1
                p.add_tri(vbuf, ((w0 >> 16) & 0xFF) // 2, ((w0 >> 8) & 0xFF) // 2,
                          (w0 & 0xFF) // 2, flip, self.tri_serial)
                if op == 0x06:
                    self.tri_serial += 1
                    p.add_tri(vbuf, ((w1 >> 16) & 0xFF) // 2, ((w1 >> 8) & 0xFF) // 2,
                              (w1 & 0xFF) // 2, flip, self.tri_serial)

    def flames(self):
        """[(callback index, bone, [8 frame pointers])] for fire cards."""
        out = []
        for ci, cb in enumerate(self.callbacks):
            if cb["handler"] != FLAME_HANDLER or cb["arg"] is None or cb["bone"] < 0:
                continue
            ptrs = [self.f.ptr(cb["arg"] + 8 + i * 4) for i in range(8)]
            if all(p is not None and p + 0x800 <= len(self.f) for p in ptrs):
                out.append((ci, cb["bone"], ptrs))
        return out

    # -------------------------------------------------------------- materials
    def callback_texture(self, cb_index):
        """Static TEXEL0 of a phase-5 callback: arg[0] -> item, item[0] ->
        image config (texels, -, descriptor); descriptor = fmt, siz, cms,
        cmt, masks, maskt, shifts, shiftt, u16 w, u16 h. item[3] -> RSP state
        (geometry mode, texture scale). Returns (texture dict, sampler,
        tex_scale) or None."""
        if cb_index is None:
            return None
        cb = self.callbacks[cb_index]
        f, arg = self.f, cb["arg"]
        if arg is None or cb["handler"] not in PHASE5_HANDLERS:
            return None
        item = f.ptr(arg)
        if item is None or item + 16 > len(f):
            return None
        config = f.ptr(item)
        if config is None or config + 12 > len(f):
            return None
        texels, desc = f.ptr(config), f.ptr(config + 8)
        if texels is None or desc is None or desc + 12 > len(f):
            return None
        fmt, siz, cms, cmt, masks, maskt, shs, sht = f.d[desc:desc + 8]
        w, h = f.u16(desc + 8), f.u16(desc + 10)
        if not (0 < w <= 1024 and 0 < h <= 1024):
            return None
        tex = dict(fmt=fmt, siz=siz, w=w, h=h, data=texels)
        sampler = dict(cms=cms, cmt=cmt, masks=masks, maskt=maskt, shifts=shs, shiftt=sht)
        scale = None
        st = f.ptr(item + 12)
        if st is not None and st + 8 <= len(f):
            sc = f.u32(st + 4)
            if sc:
                scale = ((sc >> 16) / 65536.0, (sc & 0xFFFF) / 65536.0)
        return tex, sampler, scale

    def _item_texture(self, item, pointer=None):
        f = self.f
        if item is None or item + 16 > len(f):
            return None
        config = f.ptr(item)
        if config is None or config + 12 > len(f):
            return None
        texels = f.off(pointer) if pointer is not None else f.ptr(config)
        desc = f.ptr(config + 8)
        if texels is None or desc is None or desc + 12 > len(f):
            return None
        fmt, siz, cms, cmt, masks, maskt, shs, sht = f.d[desc:desc + 8]
        w, h = f.u16(desc + 8), f.u16(desc + 10)
        if not (0 < w <= 1024 and 0 < h <= 1024):
            return None
        return (dict(fmt=fmt, siz=siz, w=w, h=h, data=texels),
                dict(cms=cms, cmt=cmt, masks=masks, maskt=maskt, shifts=shs, shiftt=sht))

    def callback_geometry_mode(self, cb_index):
        """RSP geometry mode a phase-5 callback installs (item[3] -> state)."""
        item, _ = self.callback_items(cb_index)
        if item is None or item + 16 > len(self.f):
            return 0
        st = self.f.ptr(item + 12)
        return self.f.u32(st) if st is not None and st + 8 <= len(self.f) else 0

    def callback_items(self, cb_index):
        cb = self.callbacks[cb_index]
        arg = cb["arg"]
        if arg is None or arg + 8 > len(self.f):
            return None, None
        return self.f.ptr(arg), self.f.ptr(arg + 4)

    def callback_frames(self, cb_index):
        """Flipbook frames of TEXEL0: item[1] -> controller (s16 period,
        s16 mode, tile scroll, colour track, texture table (count, ptrs))."""
        f = self.f
        item, _ = self.callback_items(cb_index)
        if item is None:
            return []
        ctl = f.ptr(item + 4)
        if ctl is None or ctl + 16 > len(f):
            return []
        table = f.ptr(ctl + 12)
        if table is None or table + 8 > len(f):
            return []
        count, arr = f.u32(table), f.ptr(table + 4)
        if not 0 < count <= 256 or arr is None or arr + 4 * count > len(f):
            return []
        out = []
        for i in range(count):
            t = self._item_texture(item, f.u32(arr + i * 4))
            if t is not None:
                out.append(t[0])
        return out

    def callback_material(self, cb_index):
        """(combiner selectors, prim rgba + lod fraction, env rgba) of a
        phase-5 callback: item[2] -> (combiner, primitive, environment)."""
        f = self.f
        item, _ = self.callback_items(cb_index)
        if item is None or item + 12 > len(f):
            return None
        cols = f.ptr(item + 8)
        if cols is None or cols + 12 > len(f):
            return None
        cptr, pptr, eptr = f.ptr(cols), f.ptr(cols + 4), f.ptr(cols + 8)
        mux = list(f.d[cptr:cptr + 16]) if cptr is not None and cptr + 16 <= len(f) else None
        if pptr is None or eptr is None:
            # colours left out here come from the controller's colour track:
            # item[1] -> controller, +8 -> track (u16 mode, u16 period,
            # u16 key count, -, key times, primitive keys (rgba + LOD
            # fraction, 5 bytes), environment keys (rgba)). A static colour
            # has mode 0 / period 1 and one key. Animated tracks mostly pulse
            # a glow: use the brightest key.
            ctl = f.ptr(item + 4) if item + 8 <= len(f) else None
            ct = f.ptr(ctl + 8) if ctl is not None and ctl + 12 <= len(f) else None
            if ct is not None and ct + 20 <= len(f):
                pk, ek = f.ptr(ct + 12), f.ptr(ct + 16)
                n = max(1, min(64, f.u16(ct + 4)))
                keys = [k for k in range(n) if (pk is None or pk + 5 * k + 5 <= len(f))
                        and (ek is None or ek + 4 * k + 4 <= len(f))]

                def score(k):
                    return (sum(f.d[pk + 5 * k:pk + 5 * k + 3]) + f.d[pk + 5 * k + 4] if pk is not None else 0) + (
                        sum(f.d[ek + 4 * k:ek + 4 * k + 4]) if ek is not None else 0)
                k = max(keys, key=score) if keys else 0
                if pptr is None and pk is not None:
                    pptr = pk + 5 * k
                if eptr is None and ek is not None:
                    eptr = ek + 4 * k
        prim = tuple(f.d[pptr:pptr + 5]) if pptr is not None and pptr + 5 <= len(f) else (255, 255, 255, 255, 255)
        env = tuple(f.d[eptr:eptr + 4]) if eptr is not None and eptr + 4 <= len(f) else (255, 255, 255, 255)
        handler = self.callbacks[cb_index]["handler"]
        if handler == 0x81000140:  # mode 1: alpha comes from the live model fade
            prim = prim[:3] + (255,) + prim[4:]
        tint = getattr(self, "tint", None)
        if tint:  # colours a battle-effect program assigns to this particle
            prim, env = tuple(tint[0]) + prim[4:], tuple(tint[1])
        return mux, prim, env

    def callback_texel1(self, cb_index):
        t = self.callback_tile1(cb_index)
        return t[0] if t else None

    def callback_tile1(self, cb_index):
        """(texture dict, sampler) of a phase-5 callback's TEXEL1, or None."""
        _, item2 = self.callback_items(cb_index)
        return self._item_texture(item2)

    def callback_scroll(self, cb_index, which=0):
        """Texture scroll of TEXEL0 (which=0) or TEXEL1: controller +4 ->
        (s16 s, s16 t, s16 speed s, s16 speed t, s16 wrap w, s16 wrap h),
        speeds in 1/4 texel per frame (tile coordinates are 10.2 fixed).
        Returns (texels per frame s, t) or None."""
        f = self.f
        item = self.callback_items(cb_index)[which]
        ctl = f.ptr(item + 4) if item is not None and item + 8 <= len(f) else None
        sc = f.ptr(ctl + 4) if ctl is not None and ctl + 8 <= len(f) else None
        if sc is None or sc + 12 > len(f):
            return None
        ds, dt = f.s16(sc + 4), f.s16(sc + 6)
        return (ds / 4.0, dt / 4.0) if ds or dt else None

    def callback_color_track(self, cb_index):
        """Animated primitive/environment colours of a callback (controller
        +8 -> u16 mode, u16 period, u16 count, -, key times, primitive keys
        (rgba + LOD fraction), environment keys) or None when static."""
        f = self.f
        item = self.callback_items(cb_index)[0]
        ctl = f.ptr(item + 4) if item is not None and item + 8 <= len(f) else None
        ct = f.ptr(ctl + 8) if ctl is not None and ctl + 12 <= len(f) else None
        if ct is None or ct + 20 > len(f) or f.u32(ct) == 1:
            return None
        n, tp, pk, ek = f.u16(ct + 4), f.ptr(ct + 8), f.ptr(ct + 12), f.ptr(ct + 16)
        if not 2 <= n <= 64 or tp is None or tp + 2 * n > len(f):
            return None
        out = dict(mode=f.u16(ct), period=f.u16(ct + 2), times=[f.u16(tp + 2 * i) for i in range(n)])
        if pk is not None and pk + 5 * n <= len(f):
            out["prim"] = [list(f.d[pk + 5 * i:pk + 5 * i + 5]) for i in range(n)]
        if ek is not None and ek + 4 * n <= len(f):
            out["env"] = [list(f.d[ek + 4 * i:ek + 4 * i + 4]) for i in range(n)]
        return out if ("prim" in out or "env" in out) else None

    def callback_flipbook(self, cb_index, which=0):
        """(frame textures, frames per image) of a callback's texture table."""
        f = self.f
        item = self.callback_items(cb_index)[which]
        ctl = f.ptr(item + 4) if item is not None and item + 8 <= len(f) else None
        if ctl is None or ctl + 16 > len(f) or f.ptr(ctl + 12) is None:
            return None
        table = f.ptr(ctl + 12)
        count, arr = f.u32(table), f.ptr(table + 4)
        if not 0 < count <= 256 or arr is None or arr + 4 * count > len(f):
            return None
        frames = [self._item_texture(item, f.u32(arr + i * 4)) for i in range(count)]
        frames = [t[0] for t in frames if t is not None]
        return (frames, max(1, f.s16(ctl))) if frames else None

    def add_shape(self, dl, material, bone=-1):
        """Draw one battle-effect shape entry: its display list, textured by
        the phase-5 style material block `material` (argument offset)."""
        self.callbacks.append(dict(bone=bone, handler=0x81000138, arg=material, offset=None))
        ci = len(self.callbacks) - 1
        self.cur_tex, self.cur_tlut, self.cur_mat, self.cur_tex_anim = -1, -1, None, -1
        self.cur_cb = ci
        tex = self.callback_texture(ci)
        if tex is not None:
            frames = self.callback_frames(ci) or [tex[0]]
            ids = []
            for fr in frames:
                vid = 10000 + ci * 100 + len(ids)
                self.virtual[vid] = dict(tex=fr, cb=ci, sampler=tex[1], scale=tex[2])
                ids.append(vid)
            self.cur_tex = ids[0]
            if len(ids) > 1:
                self.cur_tex_anim = 200 + ci
            self.flipbooks = getattr(self, "flipbooks", {})
            if len(ids) > 1:
                self.flipbooks[200 + ci] = ids
        self.geo_mode = 0
        self._run_dl(dl, bone, 0)
        return ci

    def has_texture(self, t):
        return 0 <= t < len(self.textures) or t in self.virtual

    def tile_state(self, mat):
        """(palette, sampler) of render tile 0 in a material display list.
        The sampler's "size" is the tile's (uls, ult, lrs, lrt) in texels, from
        its last G_SETTILESIZE: the RDP clamps at those edges, and wraps by the
        mask inside them."""
        f, pal, sampler, size = self.f, 0, None, None
        if mat is None:
            return pal, sampler
        for _ in range(16):
            if mat + 8 > len(f):
                break
            w0, w1 = f.u32(mat), f.u32(mat + 4)
            op = w0 >> 24
            if op == 0xF5 and (w1 >> 24) & 7 == 0:  # G_SETTILE, tile 0
                pal = (w1 >> 20) & 0xF
                sampler = dict(cms=(w1 >> 8) & 3, cmt=(w1 >> 18) & 3,
                               masks=(w1 >> 4) & 0xF, maskt=(w1 >> 14) & 0xF,
                               shifts=w1 & 0xF, shiftt=(w1 >> 10) & 0xF)
            elif op == 0xF2 and (w1 >> 24) & 7 == 0:  # G_SETTILESIZE, tile 0 (10.2 fixed point)
                size = (((w0 >> 12) & 0xFFF) / 4, (w0 & 0xFFF) / 4, ((w1 >> 12) & 0xFFF) / 4, (w1 & 0xFFF) / 4)
            elif op == 0xDF:
                break
            mat += 8
        if sampler is not None and size is not None:
            sampler["size"] = size
        return pal, sampler


# ---------------------------------------------------------------- textures
def _rgba5551(p):
    return (((p >> 11) & 31) * 255 // 31, ((p >> 6) & 31) * 255 // 31,
            ((p >> 1) & 31) * 255 // 31, 255 if p & 1 else 0)


def decode_texture(frag, tex, tlut=None, palette=0, w=None, h=None, intensity_alpha=False):
    """Decode an N64 texture into (w, h, RGBA bytes). With intensity_alpha,
    I-format texels also use their intensity as alpha (as the RDP does;
    battle effects rely on it)."""
    w = tex["w"] if w is None else w
    h = tex["h"] if h is None else h
    fmt, siz, addr = tex["fmt"], tex["siz"], tex["data"]
    n = max(0, w * h)
    d = frag.d
    if n == 0 or addr is None:
        return w, h, b"\xff\x00\xff\xff" * n

    def byte(o):
        return d[o] if 0 <= o < len(d) else 0

    def nib(i):
        v = byte(addr + i // 2)
        return v & 0xF if i & 1 else v >> 4

    out = bytearray(n * 4)
    if fmt == 0 and siz == 2:  # RGBA16
        for i in range(n):
            out[i * 4:i * 4 + 4] = bytes(_rgba5551((byte(addr + i * 2) << 8) | byte(addr + i * 2 + 1)))
    elif fmt == 0 and siz == 3:  # RGBA32
        chunk = d[addr:addr + n * 4]
        out[:len(chunk)] = chunk
    elif fmt == 2:  # CI4 / CI8
        np_ = 16 if siz == 0 else 256
        pal = [b"\xff\x00\xff\xff"] * np_
        if tlut is not None and tlut.get("data") is not None:
            base = tlut["data"] + (palette * 32 if siz == 0 else 0)
            pal = [bytes(_rgba5551((byte(base + i * 2) << 8) | byte(base + i * 2 + 1)))
                   for i in range(np_)]
        for i in range(n):
            idx = nib(i) if siz == 0 else byte(addr + i)
            out[i * 4:i * 4 + 4] = pal[idx % np_]
    elif fmt == 3:  # IA
        for i in range(n):
            if siz == 2:
                l, a = byte(addr + i * 2), byte(addr + i * 2 + 1)
            elif siz == 1:
                v = byte(addr + i)
                l, a = (v >> 4) * 17, (v & 0xF) * 17
            else:
                v = nib(i)
                l, a = (v >> 1) * 255 // 7, 255 if v & 1 else 0
            out[i * 4:i * 4 + 4] = bytes((l, l, l, a))
    elif fmt == 4:  # I
        for i in range(n):
            l = byte(addr + i) if siz == 1 else nib(i) * 17
            out[i * 4:i * 4 + 4] = bytes((l, l, l, l if intensity_alpha else 255))
    else:
        out[:] = b"\xff\x00\xff\xff" * n
    return w, h, bytes(out)


# --------------------------------------------------------------- animation
def _bitfield(d, base, index, bits):
    """Signed `bits`-wide value number `index` of a packed big-endian stream."""
    bitpos = index * bits
    word = bitpos // 16
    rem = bitpos - word * 16
    o = base + word * 2
    v = int.from_bytes(d[o:o + 4].ljust(4, b"\0"), "big")
    v = (v << rem) & 0xFFFFFFFF
    v >>= 32 - bits
    if v >= 1 << (bits - 1):
        v -= 1 << bits
    return v


class Anim:
    """Skeletal clip. `off` points at the header; `off_fn` maps stored
    pointers to data offsets (fragment pointers or raw file offsets)."""

    def __init__(self, d, off, off_fn):
        self.d = d
        fl, _, self.start, self.loop, self.nch, self.nframes = struct.unpack_from(">6H", d, off)
        self.flags = fl
        ct, sc, rt, tr = struct.unpack_from(">4I", d, off + 0xC)
        self.chan_table, self.scale_data = off_fn(ct), off_fn(sc)
        self.rot_data, self.trans_data = off_fn(rt), off_fn(tr)
        self.hermite_mode = bool(fl & 8)
        self.wide = bool(fl & 4)

    def chan(self, i):
        o = self.chan_table + i * 0xA
        return struct.unpack_from(">BBBBHHH", self.d, o)  # ns, nr, nt, interp, os, or, ot

    def _s16(self, o):
        return s16v((self.d[o] << 8) | self.d[o + 1])

    # packed samples
    def _trans_packed(self, c, fr):
        nt, ot = c[2], c[6]
        if nt == 0:
            return None
        if nt == 1:
            return float(s16v(ot)) if self.wide else float(s16v((ot << 4) & 0xFFFF) >> 4)
        i = ot + min(fr, nt - 1)
        return float(_bitfield(self.d, self.trans_data, i, 16 if self.wide else 12))

    def _rot_packed(self, c, fr):
        nr, orr = c[1], c[5]
        if nr == 0:
            return None
        if nr == 1:
            return s16v((orr << 4) & 0xFFFF)
        i = orr + min(fr, nr - 1)
        return s16v((_bitfield(self.d, self.rot_data, i, 12) << 4) & 0xFFFF)

    def _scale_packed(self, c, fr):
        ns, os_ = c[0], c[4]
        if ns == 0:
            return None
        if ns == 1:
            return os_ / 1000.0
        i = os_ + min(fr, ns - 1)
        return self._s16(self.scale_data + i * 2) / 1000.0

    # hermite keys
    def _hermite(self, base, n, fr, wide):
        stride = 8 if wide else 6

        def key(i):
            o = base + i * stride
            t, v, ti = self._s16(o), self._s16(o + 2), self._s16(o + 4)
            return t, v, ti, (self._s16(o + 6) if wide else ti)

        k0 = key(0)
        if k0[0] >= fr:
            return float(k0[1])
        kl = key(n - 1)
        if fr >= kl[0]:
            return float(kl[1])
        i = 0
        while i < n - 2 and fr >= key(i + 1)[0]:
            i += 1
        at, av, ao, aw = key(i)
        bt, bv, bo, _ = key(i + 1)
        x = (fr - at) / 30.0
        y = 30.0 / (bt - at)
        x2, x3, y2, y3 = x * x, x * x * x, y * y, y * y * y
        return (av * (2 * x3 * y3 - 3 * x2 * y2 + 1) + bv * (-2 * x3 * y3 + 3 * x2 * y2)
                + (aw if wide else ao) * (x3 * y2 - 2 * x2 * y + x) + bo * (x3 * y2 - x2 * y))

    def _trans_key(self, c, fr):
        if c[2] < 2:
            return float(s16v(c[6]))
        return self._hermite(self.trans_data + c[6] * 2, c[2], fr, bool(c[3] & 1))

    def _rot_key(self, c, fr):
        if c[1] < 2:
            deg = s16v(c[5]) / 10.0
        else:
            deg = self._hermite(self.rot_data + c[5] * 2, c[1], fr, bool(c[3] & 2)) / 10.0
        deg %= 360.0
        return s16v(int(deg / 360.0 * 65536.0) & 0xFFFF)

    def _scale_key(self, c, fr):
        if c[0] < 2:
            return s16v(c[4]) / 100.0
        return self._hermite(self.scale_data + c[4] * 2, c[0], fr, bool(c[3] & 4)) / 100.0

    def has_channel(self, chan):
        return chan >= 0 and chan * 3 + 2 < self.nch

    def sample(self, chan, fr, bt, br, bs):
        """(t, r, s) of logical channel `chan` at frame `fr`; missing
        components fall back to the bind pose."""
        cs = [self.chan(chan * 3 + k) for k in range(3)]
        t, r, s = list(bt), list(br), list(bs)
        for k, c in enumerate(cs):
            if self.hermite_mode:
                tv, rv, sv = self._trans_key(c, fr), self._rot_key(c, fr), self._scale_key(c, fr)
            else:
                tv, rv, sv = self._trans_packed(c, fr), self._rot_packed(c, fr), self._scale_packed(c, fr)
            if tv is not None:
                t[k] = tv
            if rv is not None:
                r[k] = rv
            if sv is not None:
                s[k] = sv
        return t, r, s


class AuxAnim:
    """Texture-selection (eyes / mouth) clip stored in the model FRAGMENT."""

    def __init__(self, frag, off):
        f = frag
        self.flags = f.u16(off)
        self.start, self.loop = f.u16(off + 4), f.u16(off + 6)
        self.nch, self.nframes = f.u16(off + 8), f.u16(off + 0xA)
        self.chan_table, self.data = f.ptr(off + 0xC), f.ptr(off + 0x10)
        self.f = f

    def track(self, chan):
        n = max(1, self.nframes)
        if chan < 0 or chan >= self.nch or self.chan_table is None:
            return [None] * n
        count, base = struct.unpack_from(">HH", self.f.d, self.chan_table + chan * 4)
        if count == 0:
            return [None] * n
        return [self.f.u8(self.data + base + min(fr, count - 1)) for fr in range(n)]


def raw_pose_anim(data):
    """A pose-bank clip: u32 header offset first, pointers are file offsets."""
    hdr = struct.unpack_from(">I", data, 0)[0]
    if hdr % 4 or hdr + 0x1C > len(data):
        raise ValueError("bad raw pose header")
    return Anim(data, hdr, lambda p: p if p else None)


def fragment_anim(frag, off):
    return Anim(frag.d, off, frag.off)
