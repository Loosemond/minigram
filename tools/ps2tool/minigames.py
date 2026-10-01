"""What the minigames keep in their own code modules (docs/minigames.md).

Clear Cut Challenge (module #53, linked at 0x86500000) draws its log from its
own vertex arrays and display lists rather than from the objects table: a
hexagonal prism, radius 125 and 2000 tall (the game scales it to the log's
length, 389), with three textures of its own. This takes those textures out.
"""
import re
import struct

from .fragment import Fragment, decode_texture

CODE_AREA = (0x0A8BE0, 0x437990)
CLEARCUT_MODULE = 53
CLEARCUT_VRAM = 0x86500000

# (name, offset in the module, format, size, width, height): the texture table
# at 0xBEE0 and the tiles the display lists set (0xBF08, 0xBF48, 0xBF80)
CLEARCUT_TEXTURES = [
    ("log_bark", 0xA5E0, 0, 2, 32, 64),  # RGBA16; the bark wraps twice round the log and twice along it
    ("log_end", 0xB5E0, 0, 2, 32, 32),  # RGBA16: the rings on the log's ends (and a cut)
    ("log_line", 0xBDE0, 3, 1, 32, 8),  # IA8: the white line
]


def code_module(rom, n):
    """Code module n (1-based) as a Fragment at its link address."""
    hits = [m.start() - 8 for m in re.finditer(b"FRAGMENT", rom.data[CODE_AREA[0]:CODE_AREA[1]])]
    start = CODE_AREA[0] + hits[n - 1]
    j = struct.unpack_from(">I", rom.data, start)[0]
    size = struct.unpack_from(">I", rom.data, start + 0x18)[0]
    base = (0x80000000 | ((j & 0x3FFFFFF) << 2)) & 0xFFF00000
    return Fragment(rom.data[start:start + size], "module %d" % n, base=base)


def clearcut_textures(rom):
    """{name: (w, h, RGBA bytes)} for the log's textures."""
    f = code_module(rom, CLEARCUT_MODULE)
    assert f.base == CLEARCUT_VRAM, hex(f.base)
    return {name: decode_texture(f, dict(fmt=fmt, siz=siz, w=w, h=h, data=off))
            for name, off, fmt, siz, w, h in CLEARCUT_TEXTURES}
