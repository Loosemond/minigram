"""Minimal dependency-free PNG encoder for RGBA8 images."""
import struct
import zlib


def _chunk(tag, data):
    c = struct.pack(">I", len(data)) + tag + data
    return c + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)


def encode_rgba(w, h, rgba):
    stride = w * 4
    raw = b"".join(b"\0" + rgba[y * stride:(y + 1) * stride] for y in range(h))
    return (b"\x89PNG\r\n\x1a\n"
            + _chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
            + _chunk(b"IDAT", zlib.compress(raw, 9))
            + _chunk(b"IEND", b""))


def mirror_double(w, h, rgba, axis):
    """Append a mirrored copy along axis 0 (S/x) or 1 (T/y)."""
    stride = w * 4
    rows = [rgba[y * stride:(y + 1) * stride] for y in range(h)]
    if axis == 0:
        out = []
        for r in rows:
            px = [r[i:i + 4] for i in range(0, stride, 4)]
            out.append(r + b"".join(reversed(px)))
        return w * 2, h, b"".join(out)
    return w, h * 2, b"".join(rows + rows[::-1])
