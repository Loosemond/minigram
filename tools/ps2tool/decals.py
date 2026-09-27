"""Coplanar overlays ("decals").

Arenas paint some surfaces over others that lie in exactly the same plane
(a stone ring over the floor, stripes over tiles). The N64 draws them in
order and the later one wins; a PC renderer z-fights them. Here every
triangle that overlaps an earlier-submitted coplanar triangle gets a layer
number (1 + the highest layer it covers) so the exporter can lift it a
little along its normal.
"""
import collections
import math


def _plane(a, b, c):
    u = [b[k] - a[k] for k in range(3)]
    v = [c[k] - a[k] for k in range(3)]
    n = (u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0])
    ln = math.sqrt(n[0] * n[0] + n[1] * n[1] + n[2] * n[2])
    if ln < 1e-12:
        return None
    n = (n[0] / ln, n[1] / ln, n[2] / ln)
    return n, n[0] * a[0] + n[1] * a[1] + n[2] * a[2]


def _project(pts, n):
    drop = max(range(3), key=lambda k: abs(n[k]))
    keep = [k for k in range(3) if k != drop]
    return [(p[keep[0]], p[keep[1]]) for p in pts]


def _overlap(t1, t2, eps):
    """Separating-axis test for two 2D triangles; touching edges don't count."""
    for tri in (t1, t2):
        for i in range(3):
            p, q = tri[i], tri[(i + 1) % 3]
            ax = (q[1] - p[1], p[0] - q[0])
            ln = math.hypot(ax[0], ax[1])
            if ln < 1e-12:
                continue
            a = [(ax[0] * x + ax[1] * y) / ln for x, y in t1]
            b = [(ax[0] * x + ax[1] * y) / ln for x, y in t2]
            if max(a) <= min(b) + eps or max(b) <= min(a) + eps:
                return False
    return True


def layers(tris, tol):
    """tris: iterable of (order, key, (a, b, c)) with 3D corner positions.
    tol: plane distance (and overlap margin) treated as coplanar.
    Returns {key: (layer, normal)} for the triangles with layer >= 1."""
    planes = collections.defaultdict(list)  # quantised plane -> [(n, d, 2D tri, bbox, layer)]
    out = {}
    q = 1.0 / 64
    for _, key, pts in sorted(tris, key=lambda t: t[0]):
        pl = _plane(*pts)
        if pl is None:
            continue
        n, d = pl
        qn = (round(n[0] / q), round(n[1] / q), round(n[2] / q))
        qd = round(d / (4 * tol))
        t2 = _project(pts, n)
        box = (min(p[0] for p in t2), min(p[1] for p in t2), max(p[0] for p in t2), max(p[1] for p in t2))
        layer = 0
        for dd in (qd - 1, qd, qd + 1):
            for on, od, ot, ob, ol in planes.get((qn, dd), ()):
                if ol < layer or abs(od - d) > tol or n[0] * on[0] + n[1] * on[1] + n[2] * on[2] < 0.999:
                    continue
                if ob[0] >= box[2] - tol or box[0] >= ob[2] - tol or ob[1] >= box[3] - tol or box[1] >= ob[3] - tol:
                    continue
                if _overlap(t2, ot, tol):
                    layer = ol + 1
        planes[(qn, qd)].append((n, d, t2, box, layer))
        if layer:
            out[key] = (layer, n)
    return out
