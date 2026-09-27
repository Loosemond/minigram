"""Shiny ("rare") colours.

Species metadata (0x3FED000, 16 bytes per species, species 1 first) holds
the rare-colour operation at +4: s16 hue shift in 1/64 degree, s8 saturation
and s8 lightness shifts in 1/16 steps, applied in HSL to every fully opaque
texel. FF FF FF FF means the species has dedicated shiny textures instead:
its record in the table at 0x3FD5000 is the raw texels of every texture the
model uses, concatenated in texture-index order (e.g. red Gyarados).
Research: gen1recomp-mod-stadium2-importer lib/palette.lua, lib/extract.lua.
"""
import colorsys
import struct

from .rom import SHINY_TABLE

SPECIES_META = 0x3FED000


def _nbytes(t):
    n = t["w"] * t["h"]
    return {0: (n + 1) // 2, 1: n, 2: n * 2, 3: n * 4}.get(t["siz"], 0)


class Shiny:
    def __init__(self, hue=0.0, sat=0, light=0, payload=None, dedicated=None):
        self.hue, self.sat, self.light = hue, sat, light
        self.payload, self.dedicated = payload, dedicated
        self._memo = {}

    @property
    def kind(self):
        return "dedicated" if self.dedicated is not None else "hsl"

    def describe(self):
        if self.dedicated is not None:
            return {"kind": "dedicated_textures"}
        return {"kind": "hsl_shift", "hue_degrees": self.hue, "saturation_steps": self.sat,
                "lightness_steps": self.light}

    def recolour(self, rgba):
        if self.dedicated is not None or (self.hue == 0 and self.sat == 0 and self.light == 0):
            return rgba
        dh, ds, dl = self.hue / 360.0, self.sat / 16.0, self.light / 16.0
        out = bytearray(rgba)
        memo = self._memo
        for i in range(0, len(out), 4):
            if out[i + 3] != 255:
                continue  # glow / fire / gas FX keep their colours
            key = bytes(out[i:i + 3])
            v = memo.get(key)
            if v is None:
                h, l, s = colorsys.rgb_to_hls(key[0] / 255.0, key[1] / 255.0, key[2] / 255.0)
                r, g, b = colorsys.hls_to_rgb((h + dh) % 1.0, min(1.0, max(0.0, l + dl)),
                                              min(1.0, max(0.0, s + ds)))
                v = bytes(min(255, max(0, int(c * 255 + 0.5))) for c in (r, g, b))
                memo[key] = v
            out[i:i + 3] = v
        return bytes(out)


def for_species(rom, species, model, used_textures):
    """Shiny description for a model record, or None."""
    if not 1 <= species <= 251:
        return None
    rec = rom.data[SPECIES_META + (species - 1) * 16 + 4:SPECIES_META + (species - 1) * 16 + 8]
    if rec == b"\xff\xff\xff\xff":
        arc = rom.archive(SHINY_TABLE)
        payload = arc.get(species) if species < arc.count and arc.raw(species) else b""
        order = sorted(used_textures)
        if sum(_nbytes(model.textures[i]) for i in order) != len(payload):
            return None
        offs, o = {}, 0
        for i in order:
            offs[i] = o
            o += _nbytes(model.textures[i])
        return Shiny(payload=payload, dedicated=offs)
    hue = struct.unpack(">h", rec[:2])[0] / 64.0
    sat = rec[2] - 256 if rec[2] > 127 else rec[2]
    light = rec[3] - 256 if rec[3] > 127 else rec[3]
    return Shiny(hue, sat, light)
