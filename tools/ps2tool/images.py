"""2D graphics.

image banks  0x1898000  456 records: u32 count, u32 ptr[count] (0x8FF00000
                         based); each image has an 8-byte descriptor right
                         before its texels: u16 w, u16 h, u8 fmt, u8 siz.
                         CI images are followed by their 16-bit palette.
                         Menus, HUDs, minigame sprites, Pokedex art, etc.
backgrounds  0x1E70000  48 "PRESJPEG" pictures (16-byte header + JPEG)
academy      0x2230000  59 "PRESJPEG" pictures (Pokemon Academy screens)
faces        0x2268000  67 records: u32 count, u32 offset[count], same
                         8-byte descriptor before each image (trainer faces)
Bank and face images are stored the way TMEM holds them after a LoadBlock:
every odd row has its 32-bit words swapped in pairs (64-bit words for 32-bit
texels). _unswap undoes that (measured: all 1,900 such images get smoother
rows; the icons are stored plainly).
icons        0x258D000  279 x 40x40 RGBA16 (+ 9 more at 0x2675000)
"""
import os
import re
import struct

from .fragment import decode_texture
from .png import encode_rgba

BANKS = 0x1898000
BACKGROUNDS = 0x1E70000
ACADEMY = 0x2230000
FACES = 0x2268000
ICONS = 0x258D000
ICONS_EXTRA = 0x2675000


class _Buf:
    def __init__(self, d):
        self.d = d


def _nbytes(w, h, siz):
    return {0: (w * h + 1) // 2, 1: w * h, 2: w * h * 2, 3: w * h * 4}.get(siz, -1)


def _unswap(d, off, w, h, siz):
    row = w * {0: 4, 1: 8, 2: 16, 3: 32}[siz] // 8
    u = 8 if siz == 3 else 4
    b = bytearray(d)
    for y in range(1, h, 2):
        s = off + y * row
        for x in range(s, s + row - 2 * u + 1, 2 * u):
            b[x:x + 2 * u] = b[x + u:x + 2 * u] + b[x:x + u]
    return bytes(b)


def _decode(d, off, w, h, fmt, siz):
    tlut = None
    if fmt == 2:  # CI: palette right after the texels
        tlut = dict(data=off + _nbytes(w, h, siz), count=16 if siz == 0 else 256)
    return decode_texture(_Buf(d), dict(fmt=fmt, siz=siz, w=w, h=h, data=off), tlut, 0)


def _write_png(path, w, h, rgba):
    with open(path, "wb") as fh:
        fh.write(encode_rgba(w, h, rgba))


def _described(d, off):
    w, h, fmt, siz = struct.unpack_from(">HHBB", d, off - 8)
    if not (0 < w <= 1024 and 0 < h <= 1024) or _nbytes(w, h, siz) < 0 \
            or off + _nbytes(w, h, siz) > len(d):
        return None
    return w, h, fmt, siz


def export_banks(rom, outdir):
    arc = rom.archive(BANKS)
    n = 0
    for i in range(arc.count):
        d = arc.get(i)
        if len(d) < 8:
            continue
        cnt = struct.unpack_from(">I", d, 0)[0]
        if not 0 < cnt < 1024:
            continue
        sub = os.path.join(outdir, "images", "banks", "bank_%03d" % i)
        os.makedirs(sub, exist_ok=True)
        for k, p in enumerate(struct.unpack_from(">%dI" % cnt, d, 4)):
            off = p - 0x8FF00000
            desc = _described(d, off) if 8 <= off < len(d) else None
            if desc is None:
                continue
            w, h, fmt, siz = desc
            w_, h_, rgba = _decode(_unswap(d, off, w, h, siz), off, w, h, fmt, siz)
            _write_png(os.path.join(sub, "%02d.png" % k), w_, h_, rgba)
            n += 1
    return n


def export_jpegs(rom, outdir, table, name):
    arc = rom.archive(table)
    sub = os.path.join(outdir, "images", name)
    os.makedirs(sub, exist_ok=True)
    n = 0
    for i in range(arc.count):
        d = arc.get(i)
        if d[:8] != b"PRESJPEG":
            continue
        hdr = struct.unpack_from(">I", d, 8)[0]
        with open(os.path.join(sub, "%02d.jpg" % i), "wb") as fh:
            fh.write(d[hdr:])
        n += 1
    return n


def export_faces(rom, outdir):
    arc = rom.archive(FACES)
    sub = os.path.join(outdir, "images", "faces")
    os.makedirs(sub, exist_ok=True)
    n = 0
    for i in range(arc.count):
        d = arc.get(i)
        cnt = struct.unpack_from(">I", d, 0)[0]
        if not 0 < cnt < 64:
            continue
        for k, off in enumerate(struct.unpack_from(">%dI" % cnt, d, 4)):
            desc = _described(d, off)
            if desc:
                w, h, rgba = _decode(_unswap(d, off, desc[0], desc[1], desc[3]), off, *desc)
                _write_png(os.path.join(sub, "face_%02d_%d.png" % (i, k)), w, h, rgba)
                n += 1
    return n


def export_icons(rom, outdir, names=None):
    sub = os.path.join(outdir, "images", "icons")
    os.makedirs(sub, exist_ok=True)
    n = 0
    for table, first in ((ICONS, 0), (ICONS_EXTRA, 1000)):
        arc = rom.archive(table)
        for i in range(arc.count):
            d = arc.get(i)
            if len(d) != 40 * 40 * 2:
                continue
            w, h, rgba = _decode(d, 0, 40, 40, 0, 2)
            label = ""
            if first == 0 and names and 1 <= i <= len(names):
                name = re.sub(r'[<>:"/\\|?*]', "", names[i - 1].lower().replace(" ", "_"))  # Windows-safe ("???")
                label = "_" + name if name else ""
            _write_png(os.path.join(sub, "icon_%03d%s.png" % (first + i, label)), w, h, rgba)
            n += 1
    return n


def export_all(rom, outdir, names=None):
    return dict(bank_images=export_banks(rom, outdir),
                backgrounds=export_jpegs(rom, outdir, BACKGROUNDS, "backgrounds"),
                academy=export_jpegs(rom, outdir, ACADEMY, "academy"),
                faces=export_faces(rom, outdir),
                icons=export_icons(rom, outdir, names))
