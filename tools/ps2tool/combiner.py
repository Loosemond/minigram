"""CPU evaluation of the N64 RDP colour combiner, used to bake materials
whose colour comes from primitive/environment colours (battle effects,
render-time callback materials) into plain RGBA textures.

The combiner computes (a - b) * c + d per channel, once or twice (2-cycle).
Selectors are given in ROM order: colour0 a,b,c,d, alpha0 a,b,c,d,
colour1 a,b,c,d, alpha1 a,b,c,d. SHADE is taken as white, because vertex
colour / lighting is applied by the renderer on top of the baked texture.
"""

# inputs are tuples (r, g, b, a) of floats 0..1
_ZERO = (0.0, 0.0, 0.0, 0.0)
_ONE = (1.0, 1.0, 1.0, 1.0)


def _col(sel, role, C, T0, T1, P, S, E, lod, plod):
    if sel == 0:
        return C[:3]
    if sel == 1:
        return T0[:3]
    if sel == 2:
        return T1[:3]
    if sel == 3:
        return P[:3]
    if sel == 4:
        return S[:3]
    if sel == 5:
        return E[:3]
    if role == "a":
        return (1.0, 1.0, 1.0) if sel == 6 else ((0.5, 0.5, 0.5) if sel == 7 else (0.0, 0.0, 0.0))
    if role == "b":
        return (0.5, 0.5, 0.5) if sel == 6 else (0.0, 0.0, 0.0)
    if role == "c":
        v = {6: 1.0, 7: C[3], 8: T0[3], 9: T1[3], 10: P[3], 11: S[3], 12: E[3], 13: lod, 14: plod}.get(sel, 0.0)
        return (v, v, v)
    return (1.0, 1.0, 1.0) if sel == 6 else (0.0, 0.0, 0.0)  # d


def _alp(sel, role, C, T0, T1, P, S, E, lod, plod):
    if role == "c":
        return {0: lod, 1: T0[3], 2: T1[3], 3: P[3], 4: S[3], 5: E[3], 6: plod}.get(sel, 0.0)
    return {0: C[3], 1: T0[3], 2: T1[3], 3: P[3], 4: S[3], 5: E[3], 6: 1.0}.get(sel, 0.0)


def _zero_eq(eq):
    return all(s == 7 or s == 31 for s in eq)


def cycles(mux):
    """1 when the second-cycle equations are all zero (same rule as the
    reference renderer), else 2."""
    c1, a1 = mux[8:12], mux[12:16]

    def czero(sel, role):
        return sel in (31, 7) if role == 2 else (sel == 31 or sel >= 7)

    zc = all(czero(s, k) for k, s in enumerate(c1))
    return 1 if (zc and _zero_eq(a1)) else 2


def evaluate(mux, T0, T1, P, E, S=_ONE, lod=0.0, plod=0.0, cov=None, clamp=True):
    ncy = cycles(mux)
    C = _ZERO
    for cy in range(ncy):
        ce, ae = mux[cy * 8:cy * 8 + 4], mux[cy * 8 + 4:cy * 8 + 8]
        t0, t1 = T0, T1
        a = _col(ce[0], "a", C, t0, t1, P, S, E, lod, plod)
        b = _col(ce[1], "b", C, t0, t1, P, S, E, lod, plod)
        c = _col(ce[2], "c", C, t0, t1, P, S, E, lod, plod)
        d = _col(ce[3], "d", C, t0, t1, P, S, E, lod, plod)
        rgb = tuple((a[k] - b[k]) * c[k] + d[k] for k in range(3))
        aa = _alp(ae[0], "a", C, t0, t1, P, S, E, lod, plod)
        ab = _alp(ae[1], "b", C, t0, t1, P, S, E, lod, plod)
        ac = _alp(ae[2], "c", C, t0, t1, P, S, E, lod, plod)
        ad = _alp(ae[3], "d", C, t0, t1, P, S, E, lod, plod)
        al = (aa - ab) * ac + ad
        C = (rgb[0], rgb[1], rgb[2], al)
    final_alpha = mux[4:8] if ncy == 1 else mux[12:16]
    if _zero_eq(final_alpha):  # opaque submissions leave alpha as 0: keep coverage
        C = (C[0], C[1], C[2], T0[3] if cov is None else cov)
    if not clamp:  # keep colours above 1 (the caller rescales them)
        return tuple(max(0.0, x) for x in C[:3]) + (min(1.0, max(0.0, C[3])),)
    return tuple(min(1.0, max(0.0, x)) for x in C)


def bake(mux, rgba0, w, h, prim, env, rgba1=None, w1=None, h1=None, plod=0.0, cov=None,
         headroom=False):
    """Return RGBA bytes of the combiner output for every texel of TEXEL0.
    cov: coverage to use when the equations leave alpha at 0 (default:
    TEXEL0's alpha). With headroom, return (bytes, gain): colours are
    divided by gain (>= 1) so values above 1 (shade added on top of the
    texture) survive; multiply the vertex colours by gain to undo it."""
    P = tuple(c / 255.0 for c in prim)
    E = tuple(c / 255.0 for c in env)
    out = bytearray(len(rgba0))
    memo = {}
    if headroom:
        vals = {}
        for i in range(0, len(rgba0), 4):
            t0 = bytes(rgba0[i:i + 4])
            if t0 not in vals:
                vals[t0] = evaluate(mux, tuple(c / 255.0 for c in t0), tuple(c / 255.0 for c in t0), P, E,
                                    plod=plod, cov=cov, clamp=False)
        gain = max([1.0] + [max(v[:3]) for v in vals.values()])
        if rgba1 is None and gain > 1.0:
            for i in range(0, len(rgba0), 4):
                v = vals[bytes(rgba0[i:i + 4])]
                out[i:i + 4] = bytes(int(min(1.0, c / gain) * 255 + 0.5) for c in v[:3]) + bytes(
                    (int(v[3] * 255 + 0.5),))
            return bytes(out), gain
    for y in range(h):
        for x in range(w):
            i = (y * w + x) * 4
            t0 = bytes(rgba0[i:i + 4])
            if rgba1 is not None and w1 and h1:
                j = ((y % h1) * w1 + (x % w1)) * 4
                t1 = bytes(rgba1[j:j + 4])
            else:
                t1 = t0
            key = t0 + t1
            v = memo.get(key)
            if v is None:
                r = evaluate(mux, tuple(c / 255.0 for c in t0), tuple(c / 255.0 for c in t1), P, E, plod=plod,
                             cov=cov)
                v = bytes(int(c * 255 + 0.5) for c in r)
                memo[key] = v
            out[i:i + 4] = v
    return (bytes(out), 1.0) if headroom else bytes(out)


def from_words(w0, w1):
    """Selectors (ROM order) from a G_SETCOMBINE command's two words."""
    def bits(v, s, n):
        return (v >> s) & ((1 << n) - 1)
    return [bits(w0, 20, 4), bits(w1, 28, 4), bits(w0, 15, 5), bits(w1, 15, 3),
            bits(w0, 12, 3), bits(w1, 12, 3), bits(w0, 9, 3), bits(w1, 9, 3),
            bits(w0, 5, 4), bits(w1, 24, 4), bits(w0, 0, 5), bits(w1, 6, 3),
            bits(w1, 21, 3), bits(w1, 3, 3), bits(w1, 18, 3), bits(w1, 0, 3)]


def uses_texel1(mux):
    """True when the combiner equations read TEXEL1."""
    for cy in range(cycles(mux)):
        ce, ae = mux[cy * 8:cy * 8 + 4], mux[cy * 8 + 4:cy * 8 + 8]
        if 2 in ce or ce[2] == 9 or 2 in ae:
            return True
    return False


def _wrap_texel(x, size, mask, clamp, mirror):
    """RDP texel addressing on one axis: clamp to the tile, then wrap or
    mirror inside the mask."""
    if clamp:
        x = min(max(x, 0), size - 1)
    if mask:
        m = 1 << mask
        if mirror and (x >> mask) & 1:
            x = m - 1 - (x & (m - 1))
        else:
            x &= m - 1
    return x % size


def bake_tiles(mux, tiles, prim, env, canvas, plod=0.0):
    """Combiner output for TEXEL0/TEXEL1 sampled with their own scale and
    wrap settings (they share the vertex coordinates but not the tile).

    tiles: [(w, h, rgba, sampler, (texels per unit s, texels per unit t), fmt)]
    for TEXEL0 and TEXEL1, decoded with I-format alpha = intensity (what the
    combiner reads); when the equations leave alpha at 0 (opaque draw) an
    I-format TEXEL0 counts as fully covering. canvas: (u0, du, W, v0, dv, H): output texel
    (i, j) samples texture coordinate (u0 + (i + .5) du, v0 + (j + .5) dv),
    in texel units at shift 0. Returns W*H RGBA bytes."""
    import math
    P = tuple(c / 255.0 for c in prim)
    E = tuple(c / 255.0 for c in env)
    u0, du, W, v0, dv, H = canvas

    def lookup(tile, axis):
        w, h, _, smp, sf, _ = tile
        n, start, step = (W, u0, du) if axis == 0 else (H, v0, dv)
        size = w if axis == 0 else h
        mode = smp["cms"] if axis == 0 else smp["cmt"]
        mask = smp["masks"] if axis == 0 else smp["maskt"]
        return [_wrap_texel(int(math.floor((start + (i + 0.5) * step) * sf[axis])), size, mask,
                            mode & 2, mode & 1) for i in range(n)]

    cols = [lookup(t, 0) for t in tiles]
    rows = [lookup(t, 1) for t in tiles]
    out = bytearray(W * H * 4)
    memo = {}
    t0, t1 = tiles
    cov = 1.0 if t0[5] == 4 else None
    for j in range(H):
        r0, r1 = rows[0][j] * t0[0], rows[1][j] * t1[0]
        for i in range(W):
            a, b = (r0 + cols[0][i]) * 4, (r1 + cols[1][i]) * 4
            key = bytes(t0[2][a:a + 4]) + bytes(t1[2][b:b + 4])
            v = memo.get(key)
            if v is None:
                r = evaluate(mux, tuple(c / 255.0 for c in key[:4]), tuple(c / 255.0 for c in key[4:]),
                             P, E, plod=plod, cov=cov)
                v = bytes(int(c * 255 + 0.5) for c in r)
                memo[key] = v
            o = (j * W + i) * 4
            out[o:o + 4] = v
    return bytes(out)
