"""Audio: sequences, soundfonts and samples.

Stadium 2 runs Nintendo EAD's audio engine, the one in Zelda: Ocarina of
Time and Majora's Mask (the zeldaret/oot and zeldaret/mm decomps document it;
Stadium 2's sequences use Majora's Mask's command set). There are no
recordings: music and sound effects are sequences (a MIDI-like script, a few
KB each) played on soundfont instruments whose samples are short VADPCM clips
(9 bytes per 16 samples), and the N64's RSP mixes the notes as they play.

Four tables sit back to back in the main program's data (EU: 0x86AC0), each a
16-byte header (u16 count) and 16-byte entries (u32 offset, u32 size, u8
medium, u8 cache policy, u16 x3):

    soundfonts    92  offset into the font data; u16 sample banks (hi, lo),
                      instruments << 8 | drums, sound effects
    sample banks  14  offset into the sample data
    sequences    137  offset into the sequence data (size 0: an alias, the
                      offset is the sequence it stands for)
    then a u16 offset per sequence to a count and that many soundfonts, the
    last being the one it starts with.

Font, sample and sequence data follow each other in that order in the ROM
(EU: 0x4AD7D0, 0x50FB60, 0x14D69E0); the code loads all three addresses as
constants, which is how they're found.

A soundfont: u32 drum list, u32 sound effect list, u32 instrument[count], all
offsets from its start. Instrument (0x20): u8 relocated, u8 normal range lo,
hi, u8 release rate, u32 envelope, then (u32 sample, f32 tuning) for the low,
normal and high range. Drum (0x10): u8 release, u8 pan, u8 relocated, pad,
(sample, tuning), u32 envelope. Sound effect: (sample, tuning). Sample
(0x10): u32 codec << 28 | medium << 26 | size, u32 offset in its bank, u32
loop (u32 start, end, s32 count, u32 sample count, [s16 state x16]), u32
codebook (s32 order, s32 predictors, s16 coefficients[order x predictors x
8]). Envelope: (s16 delay, s16 level) points, ending with delay 0 (off), -1
(hold), -2 (go to point) or -3 (restart).
"""
import json
import struct

ADPCM, SMALL_ADPCM = 0, 3


def _u16(d, o): return struct.unpack(">H", d[o:o + 2])[0]
def _u32(d, o): return struct.unpack(">I", d[o:o + 4])[0]
def _f32(d, o): return struct.unpack(">f", d[o:o + 4])[0]


def _table(d, o):
    n = _u16(d, o)
    if not 0 < n < 1024 or d[o + 2:o + 16] != bytes(14):
        return None
    rows = [struct.unpack(">IIBBHHH", d[o + 16 + 16 * i:o + 32 + 16 * i]) for i in range(n)]
    end = 0
    for a, size, medium, *_ in rows:
        if medium > 4:
            return None
        if size:
            if a != end:
                return None
            end = a + size
    return rows if rows[0][0] == 0 and rows[0][1] else None


def _find_tables(d, lo=0x1000, hi=0x100000):
    """(fonts, banks, seqs, seq font table offset, table offset) by scanning."""
    for o in range(lo, hi, 16):
        if d[o] != 0 or d[o + 2:o + 16] != bytes(14):
            continue
        fonts = _table(d, o)
        if not fonts:
            continue
        p = o + 16 + 16 * len(fonts)
        banks = _table(d, p)
        if not banks:
            continue
        p += 16 + 16 * len(banks)
        seqs = _table(d, p)
        if not seqs:
            continue
        p += 16 + 16 * len(seqs)
        if _u16(d, p) == 2 * len(seqs):
            return fonts, banks, seqs, p, o
    raise ValueError("audio tables not found")


def _constants(code):
    """Every lui + addiu/ori pair's value in a stretch of MIPS code."""
    out, hi = set(), {}
    for k in range(0, len(code) - 3, 4):
        x = _u32(code, k)
        op, rs, rt, imm = x >> 26, (x >> 21) & 31, (x >> 16) & 31, x & 0xFFFF
        if op == 15:
            hi[rt] = imm
        elif op in (9, 13) and rs in hi:
            out.add(((hi[rs] << 16) + (imm - 0x10000 if op == 9 and imm & 0x8000 else imm)) & 0xFFFFFFFF)
    return out


class Sample:
    def __init__(self, font, o):
        d = font.data
        w = _u32(d, o)
        self.codec, self.medium, self.size = (w >> 28) & 7, (w >> 26) & 3, w & 0xFFFFFF
        self.bank = font.bank
        self.addr = _u32(d, o + 4)
        loop, book = _u32(d, o + 8), _u32(d, o + 12)
        self.loop_start, self.loop_end, self.loop_count, self.length = struct.unpack(">IIiI", d[loop:loop + 16])
        self.order, self.predictors = struct.unpack(">ii", d[book:book + 8])
        n = self.order * self.predictors * 8
        self.book = list(struct.unpack(">%dh" % n, d[book + 8:book + 8 + 2 * n]))
        self.key = (self.bank, self.addr)

    def frames(self):
        """Bytes of the frames that play: up to the loop end (the rest never sounds)."""
        per = 9 if self.codec == ADPCM else 5
        return min(self.size, -(-self.loop_end // 16) * per)


class Font:
    """A soundfont. Samples of codec 5 (the announcer's and other voices, in
    banks 4-6) are the game's own compressed format ("MORT" in N64 Sound Tool)
    and aren't decoded here."""

    def __init__(self, audio, index):
        a, size, medium, cache, banks, counts, sfx = audio.fonts[index]
        self.index = index
        self.data = d = audio.rom[audio.font_data + a:audio.font_data + a + size]
        self.bank = banks >> 8
        self.samples = {}
        self.envelopes = {}
        drums_at, sfx_at = _u32(d, 0), _u32(d, 4)
        self.instruments = []
        for i in range(counts >> 8):
            o = _u32(d, 8 + 4 * i)
            self.instruments.append(None if o == 0 else {
                "lo": d[o + 1], "hi": d[o + 2], "release": d[o + 3], "env": self._env(_u32(d, o + 4)),
                "ranges": [self._tuned(o + 8 + 8 * k) for k in range(3)]})
        self.drums = []
        for i in range(counts & 0xFF):
            o = _u32(d, drums_at + 4 * i) if drums_at else 0
            self.drums.append(None if o == 0 else {
                "release": d[o], "pan": d[o + 1], "sample": self._tuned(o + 4), "env": self._env(_u32(d, o + 12))})
        self.sfx = [self._tuned(sfx_at + 8 * i) if sfx_at else None for i in range(sfx)]

    def _tuned(self, o):
        s = _u32(self.data, o)
        if s == 0:
            return None
        if s not in self.samples:
            self.samples[s] = Sample(self, s)
        return (self.samples[s], _f32(self.data, o + 4))

    def _env(self, at):
        if at not in self.envelopes:
            pts, o = [], at
            while o + 4 <= len(self.data) and len(pts) < 64:
                delay, level = struct.unpack(">hh", self.data[o:o + 4])
                pts.append((delay, level))
                o += 4
                if delay in (0, -1, -2, -3):
                    break
            self.envelopes[at] = pts
        return self.envelopes[at]


class Audio:
    def __init__(self, rom):
        self.rom = rom
        self.fonts, self.banks, self.seqs, fontmap, self.tables = _find_tables(rom)
        self.seq_fonts = []
        for i in range(len(self.seqs)):
            p = fontmap + _u16(rom, fontmap + 2 * i)
            self.seq_fonts.append(list(rom[p + 1:p + 1 + rom[p]]))
        font_size = max(a + s for a, s, *_ in self.fonts)
        bank_size = max(a + s for a, s, *_ in self.banks)
        consts = _constants(rom[0x1000:0x100000])
        for c in sorted(consts):
            if c + font_size in consts and c + font_size + bank_size in consts:
                self.font_data, self.sample_data, self.seq_data = c, c + font_size, c + font_size + bank_size
                break
        else:
            raise ValueError("audio data not found")
        self._fonts = {}

    def real_seq(self, i):
        return self.seqs[i][0] if self.seqs[i][1] == 0 else i

    def seq(self, i):
        a, size = self.seqs[self.real_seq(i)][:2]
        return self.rom[self.seq_data + a:self.seq_data + a + size]

    def font(self, i):
        if self.fonts[i][1] == 0:  # an alias, like sequences
            i = self.fonts[i][0]
        if i not in self._fonts:
            self._fonts[i] = Font(self, i)
        return self._fonts[i]

    def sample_bytes(self, sample):
        o = self.sample_data + self.banks[sample.bank][0] + sample.addr
        return self.rom[o:o + sample.frames()]


def decode_adpcm(data, sample):
    """VADPCM (or the 2-bit 'small' kind) to 16-bit PCM, up to the loop end."""
    order, book = sample.order, sample.book
    small = sample.codec == SMALL_ADPCM
    per = 5 if small else 9
    out, hist = [], [0] * 8
    for f in range(0, len(data) - per + 1, per):
        head = data[f]
        scale, pred = 1 << (head >> 4), head & 15
        coef = book[pred * order * 8:(pred + 1) * order * 8]
        if small:
            nib = [(data[f + 1 + i // 4] >> (6 - 2 * (i % 4))) & 3 for i in range(16)]
            ins = [(n - 4 if n >= 2 else n) * scale for n in nib]
        else:
            nib = [(data[f + 1 + i // 2] >> (4 if i % 2 == 0 else 0)) & 15 for i in range(16)]
            ins = [(n - 16 if n >= 8 else n) * scale for n in nib]
        for half in range(2):
            x = ins[half * 8:half * 8 + 8]
            prev = hist[8 - order:]
            res = []
            for k in range(8):
                acc = sum(coef[j * 8 + k] * prev[j] for j in range(order))
                # the last coefficient row, shifted, weighs this half's earlier inputs
                acc += sum(coef[(order - 1) * 8 + k - 1 - j] * x[j] for j in range(k)) if order else 0
                acc = (acc >> 11) + x[k]
                res.append(max(-32768, min(32767, acc)))
            out.extend(res)
            hist = res
    return out[:sample.loop_end]


# --- sequences -----------------------------------------------------------

# Argument sizes of the commands 0xA0-0xFF (1: u8, 2: s16), Majora's Mask's.
_ARGS = ["2", "", "2", "", "1", "", "12", "1", "22", "", "", "", "", "", "", "",
         "2", "", "2", "1", "", "", "", "2", "1", "1", "1", "12", "2", "2", "1", "",
         "", "1", "2", "", "", "", "1", "12", "1", "1", "1", "2", "1", "1", "2", "2",
         "1", "1", "1", "1", "1", "1", "1", "1", "1", "1", "2", "1", "1", "1", "2", "1",
         "1", "111", "111", "1", "", "1", "1", "2", "111", "1", "", "11", "", "1", "1", "21",
         "", "1", "1", "1", "1", "2", "", "", "1", "2", "2", "2", "2", "", "", ""]
ARGS = {0xA0 + i: [int(c) for c in s] for i, s in enumerate(_ARGS)}


def _var(d, p):
    v = d[p]
    return ((((v << 8) & 0x7F00) | d[p + 1]), p + 2) if v & 0x80 else (v, p + 1)


class Uses:
    """What a sequence plays, found by walking its code without running it:
    per channel, the instruments it picks and the notes its layers play, with
    every transposition seen. Enough to pick the samples to ship; the walk
    doesn't follow the tables dyncall picks from unless told where they are."""

    def __init__(self, data, starts=None, large=False):
        self.d = data
        self.chans = []          # [{"inst": set, "trans": set, "fonts": set, "layers": [layer]}]
        self.dynamic = False
        self._seen = set()
        if starts is None:
            self._seq(0)
        for p in starts or []:
            self._chan(p, large)

    def _flow(self, cmd, p):
        """(targets, next pc or None) for the shared control flow commands."""
        d = self.d
        if cmd == 0xFD:
            return [], _var(d, p)[1]
        if cmd in (0xFF,):
            return [], None
        a = ARGS[cmd]
        if a == [2]:
            t = _u16(d, p)
            return [t], (None if cmd == 0xFB else p + 2)
        if a == [1]:
            if cmd in (0xF4, 0xF3, 0xF2):
                t = p + 1 + (d[p] - 256 if d[p] > 127 else d[p])
                return [t], (None if cmd == 0xF4 else p + 1)
            return [], p + 1
        return [], p

    def _seq(self, p):
        d = self.d
        while p is not None and p < len(d) and ("s", p) not in self._seen:
            self._seen.add(("s", p))
            cmd = d[p]
            p += 1
            if cmd >= 0xF2:
                tg, p = self._flow(cmd, p)
                for t in tg:
                    self._seq(t)
                continue
            if cmd >= 0xC0:
                n = {0xDA: 3, 0xD7: 2, 0xD6: 2, 0xD2: 2, 0xD1: 2, 0xCD: 2, 0xC7: 3, 0xC5: 2, 0xEF: 3, 0xC4: 2,
                     0xC6: 0, 0xD4: 0, 0xF0: 0}.get(cmd, 1)
                if cmd == 0xCD:
                    self.dynamic = True
                if cmd == 0xC6:
                    return
                p += n
                continue
            hi, lo = cmd & 0xF0, cmd & 15
            if hi == 0x90:
                self._chan(_u16(d, p), False)
                p += 2
            elif hi == 0xA0:
                self._chan(p + 2 + struct.unpack(">h", d[p:p + 2])[0], False)
                p += 2
            elif hi == 0xB0:
                p += 3
            elif hi == 0x60:
                p += 2

    def _chan(self, p, large):
        ch = {"inst": set(), "trans": {0}, "fonts": set(), "layers": []}
        self.chans.append(ch)
        self._chan_code(p, ch, large)

    def _chan_code(self, p, ch, large):
        d = self.d
        while p is not None and p < len(d) and ("c", p, id(ch)) not in self._seen:
            self._seen.add(("c", p, id(ch)))
            cmd = d[p]
            p += 1
            if cmd >= 0xF2:
                tg, p = self._flow(cmd, p)
                for t in tg:
                    self._chan_code(t, ch, large)
                continue
            if cmd >= 0xA0:
                args = []
                for a in ARGS[cmd]:
                    args.append(d[p] if a == 1 else _u16(d, p))
                    p += a
                if cmd == 0xE8:
                    ch["trans"].add(struct.unpack("b", d[p:p + 1])[0])
                    p += 5
                elif cmd == 0xC1:
                    ch["inst"].add(args[0])
                elif cmd == 0xEB:
                    ch["fonts"].add(args[0])
                    ch["inst"].add(args[1])
                elif cmd == 0xC6:
                    ch["fonts"].add(args[0])
                elif cmd == 0xDB:
                    ch["trans"].add(struct.unpack("b", bytes([args[0]]))[0])
                elif cmd == 0xC4:
                    large = True
                elif cmd == 0xC3:
                    large = False
                elif cmd in (0xE4, 0xC5, 0xB4, 0xB5, 0xB6):
                    self.dynamic = True
                elif cmd == 0xEA:
                    return
                continue
            if cmd >= 0x70:
                hi, lo = cmd & 0xF8, cmd & 7
                if hi == 0x88:
                    ch["layers"].append(self._layer(_u16(d, p), large))
                    p += 2
                elif hi == 0x78:
                    ch["layers"].append(self._layer(p + 2 + struct.unpack(">h", d[p:p + 2])[0], large))
                    p += 2
                elif hi == 0x98:
                    self.dynamic = True
                continue
            hi = cmd & 0xF0
            if hi == 0x20:
                self._chan(_u16(d, p), large)
                p += 2
            elif hi in (0x30, 0x40):
                p += 1

    def _layer(self, p, large):
        lay = {"notes": set()}  # (instrument or None for the channel's, transposition, note)
        self._layer_code(p, lay, large, None, 0)
        return lay

    def _layer_code(self, p, lay, large, inst, trans):
        """Follows the layer's instrument and transposition as it goes (a
        layer starts at transposition 0)."""
        d = self.d
        while p is not None and p < len(d) and ("l", p, id(lay)) not in self._seen:
            self._seen.add(("l", p, id(lay)))
            cmd = d[p]
            p += 1
            if cmd >= 0xF2:
                tg, p = self._flow(cmd, p)
                for t in tg:
                    self._layer_code(t, lay, large, inst, trans)
                continue
            if cmd == 0xC0:
                p = _var(d, p)[1]
            elif cmd < 0xC0:
                lay["notes"].add((inst, trans, cmd & 0x3F))
                kind = cmd & 0xC0
                if large:
                    p = _var(d, p)[1] + 2 if kind == 0 else _var(d, p)[1] + 1 if kind == 0x40 else p + 2
                elif kind == 0:
                    p = _var(d, p)[1]
            elif cmd == 0xC6:
                inst = d[p]
                p += 1
            elif cmd == 0xC2:
                trans = d[p]
                p += 1
            elif cmd in (0xC1, 0xCA, 0xC9, 0xCF, 0xCD, 0xCE, 0xF1):
                p += 1
            elif cmd == 0xC3:
                p = _var(d, p)[1]
            elif cmd == 0xC7:
                mode = d[p]
                lay["notes"].add((inst, trans, d[p + 1]))
                p = p + 3 if mode & 0x80 else _var(d, p + 2)[1]
            elif cmd == 0xCB:
                p += 3
            elif cmd == 0xF0:
                p += 2

    def needs(self, font_of, seq_trans=(0,), sfx=()):
        """{font: {"inst": {(i, range)}, "drums": {n}, "sfx": {n}}} for the
        samples to ship. font_of(channel) gives the fonts a channel may use."""
        need = {}
        for ch in self.chans:
            for font in font_of(ch):
                f = need.setdefault(font.index, {"font": font, "inst": set(), "drums": set(), "sfx": set(sfx)})
                for lay in ch["layers"]:
                    for li, lt, n in lay["notes"]:
                        # (a channel that never sets an instrument plays drums: it starts on them, instOrWave 0)
                        for inst in (ch["inst"] or {127}) if li is None else {li}:
                            for ct in ch["trans"]:
                                if inst == 127:
                                    f["drums"].add((n + ct + lt) & 0xFF)
                                elif inst == 126:
                                    f["sfx"].add(((lt << 6) + n) & 0xFFFF)
                                elif inst < 126:
                                    for st in seq_trans:
                                        f["inst"].add((inst, (n + st + ct + lt) & 0xFF))
        return need


def _range(inst, semitone):
    return 0 if semitone < inst["lo"] else 1 if semitone <= inst["hi"] else 2


def web_pack(audio, songs, sounds, sound_seq):
    """One file for a web minigame: the songs (name -> sequence), the sound
    effect sequence and its sounds (name -> {"n": sound number, and how the
    game plays it}), the soundfonts' instruments, drums and effects they use,
    and those samples as they are in the ROM (VADPCM; the browser decodes
    them). Only the pitch ranges and effects the scripts reach are shipped.
    Layout: "N64A", u32 JSON length (little-endian), the JSON, padding to 4,
    the sample and sequence bytes the JSON points into."""
    blob = bytearray()
    samples, sample_index = [], {}
    envs, env_index = [], {}
    seqs = {}

    def put(b):
        at = len(blob)
        blob.extend(b)
        blob.extend(bytes(-len(blob) % 4))
        return at

    def sample(ts):
        if ts is None:
            return None
        s, tuning = ts
        if s.key not in sample_index:
            if s.codec not in (ADPCM, SMALL_ADPCM):
                return None
            sample_index[s.key] = len(samples)
            samples.append({"at": put(audio.sample_bytes(s)), "codec": s.codec, "loop": [s.loop_start, s.loop_end, s.loop_count],
                            "order": s.order, "book": s.book, "predictors": s.predictors})
        return [sample_index[s.key], round(tuning, 6)]

    def env(pts):
        k = json.dumps(pts)
        if k not in env_index:
            env_index[k] = len(envs)
            envs.append(pts)
        return env_index[k]

    fonts = {}

    def add_seq(i, uses, sfx=()):
        real = audio.real_seq(i)
        fl = audio.seq_fonts[real]
        seqs[str(i)] = {"at": put(audio.seq(i)), "len": len(audio.seq(i)), "fonts": fl}

        def font_of(ch):
            ids = {fl[-1]} | {fl[len(fl) - 1 - k] for k in ch["fonts"] if k < len(fl)}
            return [audio.font(f) for f in ids]
        for fid, need in uses.needs(font_of, sfx=sfx).items():
            font = need["font"]
            out = fonts.setdefault(str(fid), {"inst": [None] * len(font.instruments), "drums": [None] * len(font.drums),
                                              "sfx": [None] * len(font.sfx)})
            wanted = {}
            for inst, semi in need["inst"]:
                if inst < len(font.instruments) and font.instruments[inst]:
                    wanted.setdefault(inst, set()).add(_range(font.instruments[inst], semi))
            if uses.dynamic:
                wanted = {i: {0, 1, 2} for i, x in enumerate(font.instruments) if x}
            for inst, ranges in wanted.items():
                x = font.instruments[inst]
                prev = out["inst"][inst] or [x["lo"], x["hi"], x["release"], env(x["env"]), None, None, None]
                for r in ranges:
                    prev[4 + r] = prev[4 + r] or sample(x["ranges"][r])
                out["inst"][inst] = prev
            for n in need["drums"]:
                if n < len(font.drums) and font.drums[n] and out["drums"][n] is None:
                    dr = font.drums[n]
                    out["drums"][n] = [dr["release"], dr["pan"], env(dr["env"])] + (sample(dr["sample"]) or [None, 1])
            for n in need["sfx"]:
                if n < len(font.sfx) and font.sfx[n] and out["sfx"][n] is None:
                    out["sfx"][n] = sample(font.sfx[n])

    # a song is a sequence, or [sequence, tempo]: the game plays some faster
    # (0x80021EC8: song 101 is 54 at +40 beats a minute)
    tempo = {name: i[1] for name, i in songs.items() if isinstance(i, (list, tuple))}
    songs = {name: i[0] if isinstance(i, (list, tuple)) else i for name, i in songs.items()}
    for name, i in songs.items():
        add_seq(i, Uses(audio.seq(i)))
    if sounds:
        # a sound's "sfx" lists its effects when its script picks them at run time
        data = audio.seq(sound_seq)
        starts = [sound_start(data, s["n"]) for s in sounds.values() if "sfx" not in s]
        add_seq(sound_seq, Uses(data, starts, large=True), [x for s in sounds.values() for x in s.get("sfx", ())])
    head = json.dumps({"songs": songs, "tempo": tempo, "sounds": sounds, "soundSeq": sound_seq, "seqs": seqs, "fonts": fonts,
                       "envelopes": envs, "samples": samples}, separators=(",", ":")).encode()
    head += b" " * (-len(head) % 4)
    return b"N64A" + struct.pack("<I", len(head)) + head + bytes(blob)


def sound_start(data, n):
    """Where sound effect n's script starts in the sound effect sequence: its
    channels look the sound up in one of the tables listed at the operand of
    their 'ldseqtoptr' (bank n >> 7, entry n & 127)."""
    p = data.find(b"\xc9\x7f\xb2")  # and 127; ldseqtoptr <banks>
    if p < 0:
        raise ValueError("no sound table in this sequence")
    banks = _u16(data, p + 3)
    table = _u16(data, banks + 2 * (n >> 7))
    return _u16(data, table + 2 * (n & 127))


# --- extraction -----------------------------------------------------------

# Songs: the game plays song n (0x80021EC8, EU) as sequence n + 39 (a few
# ids are remapped first). The minigames' code modules ask for these:
MINIGAME_SONGS = {
    "Topsy-Turvy": [33], "Gutsy Golbat": [13], "Furret's Frolic": [47], "Barrier Ball": [35],
    "Clear Cut Challenge": [19, 18], "Pichu's Power Plant": [21], "Tumbling Togepi": [46], "Egg Emergency": [45],
    "Streaming Stampede": [30, 31, 32], "Delibird's Delivery": [52], "Eager Eevee": [53, 54],  # (and 101: 54, faster)
}
SEQ_NAMES = {0: "menu sound effects", 6: "stadium sound effects", 9: "sound effects (minigames and more)",
             94: "minigame results fanfare (song 55)", 96: "fanfare (song 57)", 115: "minigame results (song 76)"}
for _game, _songs in MINIGAME_SONGS.items():
    for _k, _n in enumerate(_songs):
        SEQ_NAMES[_n + 39] = "%s%s (song %d)" % (_game, " %d" % (_k + 1) if len(_songs) > 1 else "", _n)


def _wav(pcm, rate, loop=None):
    data = struct.pack("<%dh" % len(pcm), *pcm)
    chunks = b"fmt " + struct.pack("<IHHIIHH", 16, 1, 1, rate, rate * 2, 2, 16)
    chunks += b"data" + struct.pack("<I", len(data)) + data
    if loop:  # a sampler loop, as the game plays it
        chunks += b"smpl" + struct.pack("<I9I", 60, 0, 0, 1000000000 // rate, 60, 0, 0, 0, 1, 0)
        chunks += struct.pack("<6I", 0, 0, loop[0], loop[1] - 1, 0, 0)
    return b"RIFF" + struct.pack("<I", 4 + len(chunks)) + b"WAVE" + chunks


def export(audio, outdir):
    """out/audio: every sequence as it is (.seq), every instrument and sound
    effect sample as a WAV (at the rate it plays at: 32 kHz x its tuning; the
    loop in a 'smpl' chunk), a JSON per soundfont and an index."""
    import os
    for sub in ("sequences", "samples", "fonts"):
        os.makedirs(os.path.join(outdir, sub), exist_ok=True)
    index = {"sequences": {}, "fonts": {}, "note": "sequences use Majora's Mask's command set (zeldaret/mm); "
             "samples of codec 5 (voices) aren't decoded"}
    for i in range(len(audio.seqs)):
        real = audio.real_seq(i)
        entry = {"fonts": audio.seq_fonts[real], "size": audio.seqs[real][1]}
        if real != i:
            entry["same_as"] = real
        else:
            with open(os.path.join(outdir, "sequences", "%03d.seq" % i), "wb") as fh:
                fh.write(audio.seq(i))
        if i in SEQ_NAMES:
            entry["name"] = SEQ_NAMES[i]
        index["sequences"][i] = entry
    written, skipped = {}, 0

    def ref(ts):
        nonlocal skipped
        if ts is None:
            return None
        smp, tuning = ts
        name = "bank_%02d/%06x.wav" % smp.key
        if smp.codec != ADPCM:
            skipped += smp.key not in written
            written.setdefault(smp.key, None)
            return {"sample": None, "codec": smp.codec, "tuning": tuning}
        if smp.key not in written:
            os.makedirs(os.path.join(outdir, "samples", "bank_%02d" % smp.bank), exist_ok=True)
            pcm = decode_adpcm(audio.sample_bytes(smp), smp)
            loop = (smp.loop_start, smp.loop_end) if smp.loop_count and smp.loop_start < smp.loop_end else None
            with open(os.path.join(outdir, "samples", name), "wb") as fh:
                fh.write(_wav(pcm, max(1000, round(32000 * tuning)), loop))
            written[smp.key] = name
        return {"sample": "samples/" + name, "tuning": round(tuning, 6)}

    for i in range(len(audio.fonts)):
        if audio.fonts[i][1] == 0:
            index["fonts"][i] = {"same_as": audio.fonts[i][0]}
            continue
        f = audio.font(i)
        doc = {"sample_bank": f.bank, "instruments": [], "drums": [], "sound_effects": []}
        for x in f.instruments:
            doc["instruments"].append(x and {"range": [x["lo"], x["hi"]], "release": x["release"], "envelope": x["env"],
                                             "low": ref(x["ranges"][0]), "normal": ref(x["ranges"][1]), "high": ref(x["ranges"][2])})
        for x in f.drums:
            doc["drums"].append(x and {"release": x["release"], "pan": x["pan"], "envelope": x["env"], "sample": ref(x["sample"])})
        doc["sound_effects"] = [ref(x) for x in f.sfx]
        with open(os.path.join(outdir, "fonts", "%03d.json" % i), "w") as fh:
            json.dump(doc, fh, indent=1)
        index["fonts"][i] = {"sample_bank": f.bank, "instruments": len(f.instruments), "drums": len(f.drums),
                             "sound_effects": len(f.sfx)}
    with open(os.path.join(outdir, "index.json"), "w") as fh:
        json.dump(index, fh, indent=1)
    return sum(1 for v in written.values() if v), skipped
