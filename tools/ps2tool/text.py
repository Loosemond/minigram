"""Stadium 2 string tables.

Archive at 0x1D70000: every record is a table
    u32 count, u32 offsets[count] (relative to the record), NUL-terminated strings
Strings are Latin-1 with inline markup such as <LINE,n>, <COL1,PUSH,r,g,b,a>,
<FACE,a,b> and #nn placeholders (substituted at runtime).
"""
import struct

from .rom import TEXT_TABLE, Archive

# Tables whose contents were identified by inspection.
KNOWN = {
    0: "pokemon_names", 1: "pokemon_categories", 2: "pokemon_heights",
    3: "pokemon_weights", 4: "pokedex_entries_a", 5: "pokedex_entries_b",
    6: "move_names", 7: "move_descriptions", 8: "item_names",
    9: "item_descriptions_short", 10: "item_names_2", 11: "item_descriptions",
    12: "type_names",
}


def decode_table(blob):
    if len(blob) < 4:
        return []
    n = struct.unpack_from(">I", blob, 0)[0]
    if not 0 < n < 10000 or 4 + 4 * n > len(blob):
        raise ValueError("not a string table")
    offs = struct.unpack_from(">%dI" % n, blob, 4)
    out = []
    for o in offs:
        end = blob.find(b"\0", o)
        if end < 0:
            end = len(blob)
        out.append(blob[o:end].decode("latin-1"))
    return out


def read_all(rom):
    arc = rom.archive(TEXT_TABLE)
    tables = []
    for i in range(arc.count):
        try:
            strings = decode_table(arc.get(i))
        except ValueError:
            strings = None
        tables.append(strings)
    return tables


def table(rom, index):
    return decode_table(rom.archive(TEXT_TABLE).get(index))


def pokemon_names(rom):
    return table(rom, 0)


def move_names(rom):
    return table(rom, 6)
