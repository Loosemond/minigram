"""Bigger textures for the web: a model's (.glb) textures resampled from the
game's own, for phones' screens.

The N64's textures are tiny (a 4 x 32 book spine, a 32 x 32 floor), and a
phone's GPU magnifies them a long way with low-precision bilinear filtering,
which shows as banding and blocks. Here each texture is resampled up to a few
times its size (Catmull-Rom bicubic, separable, with the texture's own wrap at
its edges, so tiles still meet; colours weighted by alpha, so cut-outs keep
clean edges): the same picture, smoother up close. The samplers get mipmaps
too, so a repeated floor doesn't shimmer far away. Standard library only.
"""
import json
import struct
import zlib

from .png import encode_rgba

REPEAT, MIRROR, CLAMP = 10497, 33648, 33071
LINEAR_MIPMAP_LINEAR = 9987


def decode_png(data):
    """(w, h, RGBA bytes) of an 8-bit RGBA or RGB PNG."""
    w, h, depth, ctype = struct.unpack_from(">IIBB", data, 16)
    if depth != 8 or ctype not in (2, 6):
        raise ValueError("not an 8-bit RGB(A) PNG")
    bpp = 4 if ctype == 6 else 3
    o, idat = 8, b""
    while o < len(data):
        ln, typ = struct.unpack_from(">I4s", data, o)
        if typ == b"IDAT":
            idat += data[o + 8:o + 8 + ln]
        o += 12 + ln
    raw, stride = zlib.decompress(idat), w * bpp
    out, prev = bytearray(), bytearray(stride)
    for y in range(h):
        f, line = raw[y * (stride + 1)], bytearray(raw[y * (stride + 1) + 1:(y + 1) * (stride + 1)])
        for i in range(stride):
            a = line[i - bpp] if i >= bpp else 0
            b, c = prev[i], prev[i - bpp] if i >= bpp else 0
            if f == 1:
                line[i] = (line[i] + a) & 255
            elif f == 2:
                line[i] = (line[i] + b) & 255
            elif f == 3:
                line[i] = (line[i] + (a + b) // 2) & 255
            elif f == 4:
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                line[i] = (line[i] + (a if pa <= pb and pa <= pc else b if pb <= pc else c)) & 255
        out += line
        prev = line
    if bpp == 3:
        out = b"".join(out[i:i + 3] + b"\xff" for i in range(0, len(out), 3))
    return w, h, bytes(out)


def _cubic(t):
    """Catmull-Rom weights for the 4 texels round a sample t of the way between the middle two."""
    t2, t3 = t * t, t * t * t
    return (-0.5 * t3 + t2 - 0.5 * t, 1.5 * t3 - 2.5 * t2 + 1, -1.5 * t3 + 2 * t2 + 0.5 * t, 0.5 * t3 - 0.5 * t2)


def _index(i, n, wrap):
    if wrap == REPEAT:
        return i % n
    if wrap == MIRROR:
        i %= 2 * n
        return i if i < n else 2 * n - 1 - i
    return min(n - 1, max(0, i))


def _resample(rows, n_in, n_out, wrap):
    """Resample each row (lists of premultiplied [r, g, b, a] texels) from n_in to n_out."""
    k = n_in / n_out
    taps = []
    for x in range(n_out):
        s = (x + 0.5) * k - 0.5  # (texel centres line up, as filtering does)
        i = int(s // 1)
        taps.append([(_index(i - 1 + j, n_in, wrap), wt) for j, wt in enumerate(_cubic(s - i))])
    out = []
    for row in rows:
        line = []
        for tp in taps:
            r = g = b = a = 0.0
            for idx, wt in tp:
                px = row[idx]
                r += px[0] * wt
                g += px[1] * wt
                b += px[2] * wt
                a += px[3] * wt
            line.append([r, g, b, a])
        out.append(line)
    return out


def _yuv(p):
    r, g, b = p[0], p[1], p[2]
    return (0.299 * r + 0.587 * g + 0.114 * b, -0.169 * r - 0.331 * g + 0.5 * b, 0.5 * r - 0.419 * g - 0.081 * b, p[3])


def _df(a, b):
    """xBR's colour distance (Hyllian's YUV weights; alpha counts as luma)."""
    return 48 * abs(a[0] - b[0]) + 7 * abs(a[1] - b[1]) + 6 * abs(a[2] - b[2]) + 48 * abs(a[3] - b[3])


def xbr2x(w, h, rgba, wrap_s=CLAMP, wrap_t=CLAMP):
    """(2w, 2h, RGBA): xBR level 2 at 2x (Hyllian's), which reshapes stepped
    edges into smooth ones and leaves the rest as it is; the texture's wrap
    gives the texels past its edges."""
    P = [[tuple(rgba[(y * w + x) * 4:(y * w + x) * 4 + 4]) for x in range(w)] for y in range(h)]
    Y = [[_yuv(p) for p in row] for row in P]

    def at(x, y):
        return _index(x, w, wrap_s), _index(y, h, wrap_t)
    W2 = 2 * w
    out = [[None] * W2 for _ in range(2 * h)]

    def blend(a, b, k):
        return tuple(a[c] + (b[c] - a[c]) * k for c in range(4))

    for y in range(h):
        for x in range(w):
            n = {}
            for name, (dx, dy) in {"a1": (-1, -2), "b1": (0, -2), "c1": (1, -2), "a0": (-2, -1), "pa": (-1, -1), "pb": (0, -1),
                                   "pc": (1, -1), "c4": (2, -1), "d0": (-2, 0), "pd": (-1, 0), "pe": (0, 0), "pf": (1, 0),
                                   "f4": (2, 0), "g0": (-2, 1), "pg": (-1, 1), "ph": (0, 1), "pi": (1, 1), "i4": (2, 1),
                                   "g5": (-1, 2), "h5": (0, 2), "i5": (1, 2)}.items():
                xx, yy = at(x + dx, y + dy)
                n[name] = (P[yy][xx], Y[yy][xx])
            e = [P[y][x]] * 4  # the 2x2 block: 0 top left, 1 top right, 2 bottom left, 3 bottom right

            def filt(PE, PI, PH, PF, PG, PC, PD, PB, PA, G5, C4, G0, D0, C1, B1, F4, I4, H5, I5, A0, A1, N0, N1, N2, N3):
                c = lambda k: n[k][0]  # noqa: E731
                d = lambda a, b: _df(n[a][1], n[b][1])  # noqa: E731
                eq = lambda a, b: d(a, b) < 155  # noqa: E731
                if c(PE) == c(PH) or c(PE) == c(PF):
                    return
                ee = d(PE, PC) + d(PE, PG) + d(PI, H5) + d(PI, F4) + 4 * d(PH, PF)
                ii = d(PH, PD) + d(PH, I5) + d(PF, I4) + d(PF, PB) + 4 * d(PE, PI)
                px = c(PF) if d(PE, PF) <= d(PE, PH) else c(PH)
                if ee < ii and ((not eq(PF, PB) and not eq(PH, PD)) or (eq(PE, PI) and not eq(PF, I4) and not eq(PH, I5))
                                or eq(PE, PG) or eq(PE, PC)):
                    ke, ki = d(PF, PG), d(PH, PC)
                    ex2 = c(PE) != c(PC) and c(PB) != c(PC)
                    ex3 = c(PE) != c(PG) and c(PD) != c(PG)
                    if 2 * ke <= ki and ex3 and ke >= 2 * ki and ex2:
                        e[N3] = blend(e[N3], px, 0.75)
                        e[N2] = blend(e[N2], px, 0.25)
                        e[N1] = blend(e[N1], px, 0.25)
                    elif 2 * ke <= ki and ex3:
                        e[N3] = blend(e[N3], px, 0.75)
                        e[N2] = blend(e[N2], px, 0.25)
                    elif ke >= 2 * ki and ex2:
                        e[N3] = blend(e[N3], px, 0.75)
                        e[N1] = blend(e[N1], px, 0.25)
                    else:
                        e[N3] = blend(e[N3], px, 0.5)
                elif ee <= ii:
                    e[N3] = blend(e[N3], px, 0.5)

            filt("pe", "pi", "ph", "pf", "pg", "pc", "pd", "pb", "pa", "g5", "c4", "g0", "d0", "c1", "b1", "f4", "i4", "h5", "i5", "a0", "a1", 0, 1, 2, 3)
            filt("pe", "pc", "pf", "pb", "pi", "pa", "ph", "pd", "pg", "i4", "a1", "i5", "h5", "a0", "d0", "b1", "c1", "f4", "c4", "g5", "g0", 2, 0, 3, 1)
            filt("pe", "pa", "pb", "pd", "pc", "pg", "pf", "ph", "pi", "c1", "g0", "c4", "f4", "g5", "h5", "d0", "a0", "b1", "a1", "i4", "i5", 3, 2, 1, 0)
            filt("pe", "pg", "pd", "ph", "pa", "pi", "pb", "pf", "pc", "a0", "i5", "a1", "b1", "i4", "f4", "h5", "g5", "d0", "g0", "c1", "c4", 1, 3, 0, 2)
            out[2 * y][2 * x], out[2 * y][2 * x + 1], out[2 * y + 1][2 * x], out[2 * y + 1][2 * x + 1] = e
    return W2, 2 * h, bytes(min(255, max(0, int(v + 0.5))) for row in out for p in row for v in p)


def upscale(w, h, rgba, sx, sy, wrap_s=CLAMP, wrap_t=CLAMP):
    """(W, H, RGBA) of a texture sx by sy times its size: xBR's 2x first
    where it's twice or more both ways (the edges), then bicubic for the rest
    (the "hybrid" emulators use for textures)."""
    if sx == sy and sx >= 2 and sx % 2 == 0:
        w, h, rgba = xbr2x(w, h, rgba, wrap_s, wrap_t)
        sx = sy = sx // 2
        if sx == 1:
            return w, h, rgba
    px = [[[rgba[(y * w + x) * 4 + c] for c in range(4)] for x in range(w)] for y in range(h)]
    for row in px:  # premultiply
        for p in row:
            a = p[3] / 255.0
            p[0] *= a
            p[1] *= a
            p[2] *= a
    W, H = w * sx, h * sy
    px = _resample(px, w, W, wrap_s) if sx > 1 else px
    cols = [[px[y][x] for y in range(h)] for x in range(W)]
    cols = _resample(cols, h, H, wrap_t) if sy > 1 else cols
    out = bytearray(W * H * 4)
    for x, col in enumerate(cols):
        for y, (r, g, b, a) in enumerate(col):
            a = min(255.0, max(0.0, a))
            k = 255.0 / a if a > 0.5 else 0.0
            o = (y * W + x) * 4
            out[o] = min(255, max(0, int(r * k + 0.5)))
            out[o + 1] = min(255, max(0, int(g * k + 0.5)))
            out[o + 2] = min(255, max(0, int(b * k + 0.5)))
            out[o + 3] = int(a + 0.5)
    return W, H, bytes(out)


def upscale_glb(src, dst, largest=128, most=4):
    """Write src (a .glb) to dst with every texture resampled to up to `most`
    times its size, no side over `largest` (whole times; a side already that
    big stays), and mipmapped samplers."""
    d = open(src, "rb").read()
    n = struct.unpack_from("<I", d, 12)[0]
    j = json.loads(d[20:20 + n])
    blob = d[28 + n:28 + n + struct.unpack_from("<I", d, 20 + n)[0]]
    # each image's wrap: from the samplers of the textures that use it
    wraps = {}
    for t in j.get("textures", []):
        s = j["samplers"][t["sampler"]] if "sampler" in t else {}
        wraps.setdefault(t["source"], (s.get("wrapS", REPEAT), s.get("wrapT", REPEAT)))
    for s in j.get("samplers", []):
        s["minFilter"] = LINEAR_MIPMAP_LINEAR
    views = [blob[v.get("byteOffset", 0):v.get("byteOffset", 0) + v["byteLength"]] for v in j["bufferViews"]]
    for i, im in enumerate(j.get("images", [])):
        if "bufferView" not in im or im.get("mimeType", "image/png") != "image/png":
            continue
        w, h, rgba = decode_png(views[im["bufferView"]])
        sx = max(1, min(most, largest // w)) if w < largest else 1
        sy = max(1, min(most, largest // h)) if h < largest else 1
        k = min(sx, sy)  # (the same both ways, so texels stay square)
        if k > 1:
            ws, wt = wraps.get(i, (CLAMP, CLAMP))
            views[im["bufferView"]] = encode_rgba(*upscale(w, h, rgba, k, k, ws, wt))
    out = bytearray()
    for v, data in zip(j["bufferViews"], views):
        v["byteOffset"] = len(out)
        v["byteLength"] = len(data)
        out += data
        out += bytes(-len(out) % 4)
    j["buffers"] = [{"byteLength": len(out)}]
    head = json.dumps(j, separators=(",", ":")).encode()
    head += b" " * (-len(head) % 4)
    glb = struct.pack("<III", 0x46546C67, 2, 28 + len(head) + len(out))
    glb += struct.pack("<I4s", len(head), b"JSON") + head + struct.pack("<I4s", len(out), b"BIN\x00") + bytes(out)
    with open(dst, "wb") as fh:
        fh.write(glb)
