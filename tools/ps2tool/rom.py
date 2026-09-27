"""ROM access for Pokemon Stadium 2: byte-order normalisation, archive tables
and PERS-SZP / Yay0 decompression.

Archive ("cattbl") format, as documented by pret/pokestadium oldnotes:
    header: u32 tag (0 or 0xEF), u32 zero, u32 total_size, u32 count
    record: u32 relative_offset, u32 size, u32 0, u32 0   (16 bytes each)
"""
import hashlib
import struct

MAGIC_Z64 = b"\x80\x37\x12\x40"
MAGIC_V64 = b"\x37\x80\x40\x12"
MAGIC_N64 = b"\x40\x12\x37\x80"

# Known dumps. Every table offset below was verified on both the US and the
# EU (English, NP3P) ROM: the asset region is laid out identically.
KNOWN_ROMS = {
    "1561c75d11cedf356a8ddb1a4a5f9d5d": "Pokemon Stadium 2 (USA)",
    "b1271db50d6ef8f6b53cc640c3743e4f": "Pokemon Stadium 2 (Europe)",
}

STADIUM_MODEL_TABLE = 0x1638000   # 30 arena/field models
TEXT_TABLE = 0x1D70000            # 331 string tables
MODEL_TABLE = 0x27ED000           # 282 Pokemon models (record N = species N)
POSE_TABLE = 0x2D7D000            # 282 Pokemon animation banks
SHINY_TABLE = 0x3FD5000           # 282 raw shiny texture sets


def normalise(data):
    magic = data[:4]
    if magic == MAGIC_Z64:
        return data
    if magic == MAGIC_V64:
        b = bytearray(data)
        b[0::2], b[1::2] = data[1::2], data[0::2]
        return bytes(b)
    if magic == MAGIC_N64:
        b = bytearray(len(data))
        for k in range(4):
            b[k::4] = data[3 - k::4]
        return bytes(b)
    raise ValueError("not an N64 ROM (unknown byte order)")


class Rom:
    def __init__(self, path):
        with open(path, "rb") as fh:
            self.data = normalise(fh.read())
        self.md5 = hashlib.md5(self.data).hexdigest()
        self.title = self.data[0x20:0x34].decode("ascii", "replace").strip("\0 ")
        self.game_code = self.data[0x3B:0x3F].decode("ascii", "replace")
        self.name = KNOWN_ROMS.get(self.md5, "unknown revision")
        if "STADIUM 2" not in self.title.upper():
            raise ValueError("this does not look like Pokemon Stadium 2: %r" % self.title)

    def archive(self, offset):
        return Archive(self.data, offset)


class Archive:
    def __init__(self, data, offset=0):
        tag, zero, total, count = struct.unpack_from(">4I", data, offset)
        if tag not in (0, 0xEF) or zero != 0 or not 0 < count < 4096:
            raise ValueError("no archive at 0x%X" % offset)
        self.data, self.offset, self.total, self.count = data, offset, total, count
        self.records = []
        for i in range(count):
            rel, size, r1, r2 = struct.unpack_from(">4I", data, offset + 0x10 + i * 16)
            if r1 or r2:
                raise ValueError("bad archive record at 0x%X" % offset)
            self.records.append((rel, size))

    def __len__(self):
        return self.count

    def raw(self, i):
        rel, size = self.records[i]
        start = self.offset + rel
        return self.data[start:start + size]

    def get(self, i):
        """Record bytes, decompressed if needed (b'' for an empty record)."""
        return decompress(self.raw(i))


def is_archive(data, offset=0):
    if len(data) < offset + 16:
        return False
    try:
        a = Archive(data, offset)
    except (ValueError, struct.error):
        return False
    table_end = 0x10 + a.count * 0x10
    if a.total < table_end or offset + a.total > len(data):
        return False
    for rel, size in a.records:
        if size and (rel < table_end or rel + size > a.total):
            return False
    return True


def yay0(src, base=0):
    if src[base:base + 4] != b"Yay0":
        raise ValueError("not Yay0")
    size, link_off, chunk_off = struct.unpack_from(">III", src, base + 4)
    mask_p = base + 0x10
    link_p = base + link_off
    chunk_p = base + chunk_off
    out = bytearray(size)
    pos = 0
    mask = bits = 0
    while pos < size:
        if bits == 0:
            mask = int.from_bytes(src[mask_p:mask_p + 4], "big")
            mask_p += 4
            bits = 32
        if mask & 0x80000000:
            out[pos] = src[chunk_p]
            pos += 1
            chunk_p += 1
        else:
            link = (src[link_p] << 8) | src[link_p + 1]
            link_p += 2
            dist = (link & 0xFFF) + 1
            count = link >> 12
            if count == 0:
                count = src[chunk_p] + 0x12
                chunk_p += 1
            else:
                count += 2
            copy = pos - dist
            count = min(count, size - pos)
            if dist >= count:
                out[pos:pos + count] = out[copy:copy + count]
                pos += count
            else:
                for _ in range(count):
                    out[pos] = out[copy]
                    pos += 1
                    copy += 1
        mask = (mask << 1) & 0xFFFFFFFF
        bits -= 1
    return bytes(out)


def decompress(blob):
    if blob[:8] == b"PERS-SZP":
        return yay0(blob, struct.unpack_from(">I", blob, 8)[0])
    if blob[:4] == b"Yay0":
        return yay0(blob, 0)
    return blob
