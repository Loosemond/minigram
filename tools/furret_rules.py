"""The rules of a Furret's Frolic round, for the rooms server (tools/rooms.py).

The same world as web/minigames/src/furret/rules.js, which has the rules and
where each number comes from in the game's code: keep the two the same, line
for line (tools/test_rooms.py and the browser tests check they run alike, to
the last bit). The four Furret share one field and its balls, so the server
runs it from everyone's pads (the people's: the devices send each change, a
"pad" with the frame it's for; the CPUs think in it as on every device), and
so knows who scored what.
"""
import math
import struct

SEATS = 4
FPS = 30
LEVELS = {"easy": 1, "normal": 2, "hard": 3}
AHEAD = 4  # frames ahead of now a pad may be for (a device sends its player's up to 3 ahead: src/lag.js leadFor)
AFTER = 0  # frames from the end to the results: none (0x8620392C fades the song and 0x86204A9C starts them that frame)

STEPS = 3
TIME = 60 * FPS
HURRY = 30 * FPS
GRAVITY = -120 / 60
SP_DEC = 0.9700000286102295
F_BOUND = 0.6000000238418579
SHOT_PW = 660 / 60
SPD_MX = 2700 / 60
EGG_SIZE = 0.800000011920929
SO_POS, SO_SC = 1.5, 1
REACH = 108.5
SPAWN_EVERY = 11
GONE = -200
C = 0.7071067690849304
U = 4294967296

SIZE = {1: 1, 2: 1.5, 3: 2, 5: 2.5}
SPEED = {1: 1, 2: 0.949999988079071, 3: 0.8999999761581421, 5: 0.800000011920929}
RADIUS = {k: EGG_SIZE * 0.75 * 100 * SIZE[k] for k in SIZE}
SPAWNS = [[950, 700, 0], [-950, 700, 0], [0, 700, 950], [0, 700, -950]]

SPOTS = [
    (0, 0, 0x8000),
    (282.84271240234375, -282.84271240234375, 0x0100),
    (282.84271240234375, 282.84271240234375, 0x0400),
    (-282.84271240234375, -282.84271240234375, 0x0800),
    (-282.84271240234375, 282.84271240234375, 0x0200),
]
DIRS = [(-C, 0, -C), (C, 0, -C), (-C, 0, C), (C, 0, C)]
GOALS = [3, 1, 2, 0]
START = [2, 4, 1, 3]
TAIL = [
    (0, 5.837299823760986, -0.1022999957203865), (1.0230000019073486, 61.128902435302734, 20.05390167236328),
    (1.1779999732971191, 126.83340454101562, 19.433900833129883), (1.1159999370574951, 152.91371154785156, 6.230999946594238),
    (1.0601999759674072, 141.9862060546875, -1.3174999952316284), (0.9858000874519348, 111.51319885253906, -7.102099895477295),
    (0.8896999955177307, 73.75830078125, -10.282699584960938), (0.7781000137329102, 39.385498046875, -10.425299644470215),
    (0.6571999788284302, 18.816999435424805, -8.810200691223145), (0.536300003528595, 8.915599822998047, -6.810699939727783),
    (0.4122999906539917, 1.8352000713348389, -4.569400310516357), (0.2914000153541565, -3.103100061416626, -2.405600070953369),
    (0.17669999599456787, -6.079100131988525, -0.8586999773979187), (0.07750000059604645, -6.900599956512451, -0.17669999599456787),
    (0.0030999998562037945, -5.285499572753906, -0.15809999406337738), (-0.05270000174641609, -1.4074000120162964, -0.2944999933242798),
    (-0.08060000091791153, 3.8904998302459717, -0.3254999816417694), (-0.08989999443292618, 8.329700469970703, -0.31310001015663147),
    (-0.0868000015616417, 10.614400863647461, -0.26660001277923584), (-0.07440000027418137, 11.206499099731445, -0.2076999843120575),
    (-0.055799998342990875, 10.636100769042969, -0.1394999921321869), (-0.03720000013709068, 9.389900207519531, -0.07750000059604645),
    (-0.01860000006854534, 7.867800235748291, -0.05270000174641609), (-0.0030999998562037945, 6.469700336456299, -0.08060000091791153),
    (0, 5.837299823760986, -0.1022999957203865),
]
UP, STAND, SWING, CHEER, SAD, HOP, LAND = range(7)
CLIP_LEN = [24, 24, 29, 102, 129, 5, 7]
HOLD = [False, False, False, False, False, True, True]
LOOP = [0, 0, 0, 0x42, 0x74, 0, 0]  # (the frame a clip goes back to: the show writes the cheer's and the sulk's)
COUNTDOWN = 4 * 20  # (GO 80 frames after the Furret pop up: clip 0 at frame 8 then)
SKILLS = [[0, 0, 0, 0], [1, 1, 0, 0], [2, 2, 1, 0], [3, 3, 3, 2]]

MESH = [
    ([-1084, 336, 0, -706, 251, -1, -704, 260, -51, -1082, 345, -51, -1157, 119, 824, -1124, -128, 857, -579, 195,
      269, -578, 195, -270, -1123, -128, -855, -1154, 119, -824, -579, 195, 269, -1414, 201, 566, -1157, 119, 824,
      -1082, 345, 51, -704, 260, 51, -312, 114, 0, -283, 74, 0, -283, 74, 0, -312, 114, 0, -1413, 201, -564, -849,
      257, 0, -578, 195, -270, -1154, 119, -824, 0, 74, 283, 283, 74, 0, 0, -46, 0, -283, 74, 0, 0, 74, -283, -283,
      -46, -283, -290, 75, 559, -283, -46, 283, -290, 75, 559, -559, 75, 290, -1124, -128, 857, -283, -46, 283, 0,
      74, 283, -283, 74, 0, -290, 75, -559, -559, 75, -290, -283, -46, -283, -559, 75, 290, -559, 75, -290, -290,
      75, -559, -853, -128, -1125, -578, 195, -270, -559, 75, -290, -1123, -128, -855, -290, 75, 559, 0, 74, -283,
      -1124, -128, 857, -559, 75, 290, -579, 195, 269, -1123, -128, -855, -859, -128, 1122, -283, 74, 0, 0, -46, 0,
      -849, 257, 0, -1413, 201, -564, -1978, 290, 1, -579, 195, 269, -312, 114, 0, -566, 160, 0, -578, 195, -270,
      -283, 74, 0, -579, 195, 269, -559, 75, 290, -1978, 290, 1, -1414, 201, 566, -849, 257, 0, -566, 160, 0, -579,
      195, 269, -312, 114, 0, -578, 195, -270],
     [0, 1, 2, 0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 0, 13, 14, 0, 14, 1, 15, 16, 7, 6, 17, 18, 19, 20, 21, 22,
      19, 21, 23, 24, 25, 26, 27, 28, 25, 26, 23, 29, 23, 30, 25, 24, 27, 31, 32, 33, 34, 35, 36, 37, 38, 39, 36,
      40, 34, 41, 42, 43, 44, 45, 46, 34, 40, 47, 39, 48, 37, 49, 50, 51, 43, 52, 41, 33, 53, 31, 39, 38, 36, 45,
      44, 54, 48, 36, 55, 56, 57, 58, 59, 60, 61, 62, 56, 61, 63, 64, 65, 66, 67, 68, 69, 68, 70, 69, 71, 72, 70,
      68, 67]),
    ([0, 336, -1084, 1, 251, -706, 51, 260, -704, 51, 345, -1082, 0, 257, -849, 566, 201, -1414, 1, 212, -1978,
      -51, 345, -1082, -51, 260, -704, 268, 195, -581, -822, 119, -1156, -853, -128, -1125, -271, 195, -577, -271,
      195, -577, -564, 201, -1413, -822, 119, -1156, 0, 74, 283, 283, 74, 0, 0, -46, 0, -283, 74, 0, 0, 74, -283,
      -283, -46, -283, 268, 195, -581, 859, -128, -1122, 826, 119, -1155, 283, -46, -283, -290, 75, -559, -559, 75,
      -290, 559, 75, -290, 0, 74, -283, 0, 114, -312, -290, 75, -559, 283, -46, -283, 559, 75, -290, 290, 75, -559,
      -559, 75, -290, -290, 75, -559, -853, -128, -1125, 1124, -128, -857, 859, -128, -1122, 290, 75, -559, 1, 212,
      -1978, -564, 201, -1413, 0, 257, -849, 268, 195, -581, 290, 75, -559, 859, -128, -1122, 559, 75, -290, -283,
      -46, -283, 0, 74, -283, -290, 75, -559, -1123, -128, -855, 0, 74, -283, -271, 195, -577, -290, 75, -559, 0,
      74, -283, -559, 75, -290, -283, 74, 0, 0, -46, 0, 0, 114, -312, -271, 195, -577, 0, 114, -312, 0, 160, -566,
      268, 195, -581, 826, 119, -1155, 566, 201, -1414, 268, 195, -581, 0, 160, -566, 0, 257, -849, -271, 195,
      -577, 0, 114, -312],
     [0, 1, 2, 0, 2, 3, 4, 5, 6, 0, 7, 8, 0, 8, 1, 5, 4, 9, 10, 11, 12, 13, 14, 15, 13, 4, 14, 16, 17, 18, 19, 20,
      21, 18, 19, 16, 18, 17, 20, 22, 23, 24, 25, 20, 17, 26, 27, 21, 17, 28, 25, 12, 29, 30, 11, 31, 12, 32, 33,
      34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 40, 47, 38, 48, 49, 50, 37, 51, 35, 52, 53, 54, 34, 49,
      32, 45, 44, 55, 48, 56, 57, 49, 57, 58, 59, 55, 44, 60, 61, 62, 63, 43, 62, 64, 65, 66, 67, 68, 69, 67, 70,
      66]),
    ([-268, 195, 581, -859, -128, 1122, -826, 119, 1155, 0, 336, 1084, 51, 345, 1082, 51, 260, 704, -1, 251, 706,
      -51, 260, 704, -51, 345, 1082, -1, 212, 1978, 564, 201, 1413, 0, 257, 849, 0, 74, 283, 283, 74, 0, 0, -46, 0,
      283, -46, 283, 290, 75, 559, 559, 72, 290, -283, 74, 0, -290, 75, 559, -283, -46, 283, 822, 119, 1156, 853,
      -128, 1125, 271, 195, 577, 0, 74, 283, 0, 114, 312, 0, 74, -283, 0, 114, 312, 0, 74, 283, -290, 75, 559,
      -290, 75, 559, -559, 75, 290, -1124, -128, 857, 853, -128, 1125, 1123, -128, 855, 559, 72, 290, -283, -46,
      283, 0, 74, 283, -283, 74, 0, -268, 195, 581, -290, 75, 559, -859, -128, 1122, 290, 75, 559, -559, 75, 290,
      -290, 75, 559, 283, 74, 0, 283, -46, 283, 853, -128, 1125, 290, 75, 559, 271, 195, 577, -859, -128, 1122, 0,
      74, -283, 0, -46, 0, 0, 160, 566, 0, 114, 312, -268, 195, 581, 0, 257, 849, 271, 195, 577, 0, 74, 283, -566,
      201, 1414, -1, 212, 1978, 564, 201, 1413, -826, 119, 1155, -566, 201, 1414, -268, 195, 581, 271, 195, 577,
      564, 201, 1413, 822, 119, 1156, 0, 257, 849],
     [0, 1, 2, 3, 4, 5, 3, 5, 6, 3, 6, 7, 3, 7, 8, 9, 10, 11, 12, 13, 14, 15, 12, 16, 15, 17, 13, 14, 18, 12, 19,
      12, 20, 21, 22, 23, 23, 24, 25, 14, 13, 26, 27, 28, 0, 16, 17, 15, 29, 0, 28, 30, 31, 32, 33, 34, 35, 36, 37,
      38, 39, 40, 41, 35, 42, 33, 38, 43, 36, 36, 43, 44, 45, 37, 46, 47, 48, 49, 32, 50, 30, 51, 38, 52, 53, 54,
      55, 53, 56, 57, 58, 49, 48, 55, 56, 53, 57, 54, 53, 56, 59, 60, 57, 56, 61, 62, 63, 64, 65, 66, 67, 63, 68,
      64]),
    ([1084, 336, 0, 1082, 345, -51, 704, 260, -51, 706, 251, 1, 849, 257, 0, 1413, 201, 564, 1978, 212, -1, 704,
      260, 51, 1082, 345, 51, 1157, 119, -824, 1124, -128, -857, 579, 195, -269, 0, 74, 283, 283, 74, 0, 0, -46, 0,
      283, -46, 283, 290, 75, 559, 559, 72, 290, 283, 74, 0, 312, 114, 0, 312, 114, 0, 283, 74, 0, 578, 195, 270,
      -283, 74, 0, 0, 74, -283, 853, -128, 1125, 1123, -128, 855, 559, 72, 290, 1123, -128, 855, 1154, 119, 824,
      283, -46, -283, 290, 75, 559, 283, 74, 0, 559, 75, -290, 283, -46, -283, 578, 195, 270, 559, 72, 290, 1123,
      -128, 855, 290, 75, -559, 1124, -128, -857, 859, -128, -1122, 290, 75, -559, 1124, -128, -857, 559, 75, -290,
      579, 195, -269, 559, 75, -290, 0, 74, 283, 283, -46, 283, 0, 74, -283, 283, 74, 0, -283, 74, 0, 0, -46, 0,
      566, 160, 0, 312, 114, 0, 578, 195, 270, 849, 257, 0, 579, 195, -269, 283, 74, 0, 1978, 212, -1, 1414, 201,
      -566, 1413, 201, 564, 1154, 119, 824, 1157, 119, -824],
     [0, 1, 2, 0, 2, 3, 4, 5, 6, 0, 3, 7, 0, 7, 8, 9, 10, 11, 12, 13, 14, 15, 12, 16, 15, 17, 13, 11, 18, 19, 20,
      21, 22, 14, 23, 12, 14, 13, 24, 16, 17, 15, 25, 26, 27, 22, 28, 29, 30, 24, 13, 27, 31, 25, 32, 33, 34, 35,
      36, 37, 34, 33, 38, 39, 40, 41, 42, 43, 44, 41, 45, 39, 32, 46, 47, 38, 48, 34, 49, 44, 43, 48, 50, 51, 52,
      53, 54, 52, 55, 56, 54, 55, 52, 36, 35, 57, 56, 53, 52, 58, 59, 55, 60, 55, 54, 61, 60, 54, 56, 59, 62, 56,
      55, 59]),
]


def _unit(v):
    k = 1 / math.sqrt((v[0] * v[0] + v[1] * v[1]) + v[2] * v[2])
    v[0] *= k
    v[1] *= k
    v[2] *= k


def _unit_len(v):
    l = math.sqrt((v[0] * v[0] + v[1] * v[1]) + v[2] * v[2])
    if l != 0:
        v[0] /= l
        v[1] /= l
        v[2] /= l
    return l


class Tri:
    __slots__ = ("a", "b", "c", "n", "d", "lo", "hi")


def _pieces():
    out = []
    for v, t in MESH:
        verts = [(v[i], v[i + 1], v[i + 2]) for i in range(0, len(v), 3)]
        tris = []
        for i in range(0, len(t), 3):
            a, b, c = verts[t[i]], verts[t[i + 1]], verts[t[i + 2]]
            n = [
                (b[1] - a[1]) * (c[2] - b[2]) - (c[1] - b[1]) * (b[2] - a[2]),
                (b[2] - a[2]) * (c[0] - b[0]) - (c[2] - b[2]) * (b[0] - a[0]),
                (b[0] - a[0]) * (c[1] - b[1]) - (c[0] - b[0]) * (b[1] - a[1]),
            ]
            _unit(n)
            tr = Tri()
            tr.a, tr.b, tr.c, tr.n = a, b, c, n
            tr.d = -((n[0] * a[0] + n[1] * a[1]) + n[2] * a[2])
            tr.lo = [min(a[k], b[k], c[k]) for k in range(3)]
            tr.hi = [max(a[k], b[k], c[k]) for k in range(3)]
            tris.append(tr)
        out.append(tris)
    return out


PIECES = _pieces()


def level_code(level, cpus):
    return (LEVELS.get(level) or 2) if any(cpus) else 1


def _across(t, p, d):
    n = t.n
    k = (n[0] * d[0] + n[1] * d[1]) + n[2] * d[2]
    if k == 0:
        return 0
    return -(((n[0] * p[0] + n[1] * p[1]) + n[2] * p[2]) + t.d) / k


def _inside(px, pz, x0, z0, x1, z1, x2, z2):
    ax, az, bx, bz = x0 - px, z1 - pz, x1 - px, z0 - pz
    p, q = ax * az, bx * bz
    cz, cx = z2 - pz, x2 - px
    if q <= p and 0 <= bx * cz - cx * az and 0 <= cx * bz - ax * cz:
        return True
    return p - q <= 0 and bx * cz - cx * az <= 0 and cx * bz - ax * cz <= 0


def _nearest(p, a, b):
    ax, ay, az = a[0] - p[0], a[1] - p[1], a[2] - p[2]
    bx, by, bz = b[0] - p[0], b[1] - p[1], b[2] - p[2]
    ez = bz - az
    if bx == ax and by - ay == 0 and ez == 0:
        return 0, 0, [0, 0, 0]
    ex, ey = bx - ax, by - ay
    t = -((ax * ex + ay * ey) + az * ez) / ((ex * ex + ey * ey) + ez * ez)
    d = [t * ex + ax, t * ey + ay, t * ez + az]
    return math.sqrt((d[0] * d[0] + d[1] * d[1]) + d[2] * d[2]), t, d


def _edge(p, r, a, b):
    l, t, d = _nearest(p, a, b)
    if not (l < r and 0 <= t and t <= 1):
        return None
    _unit(d)
    return [d[0] * -1, d[1] * -1, d[2] * -1], r - l


def _abs(x):
    return x if 0 < x else -x


def _corner(p, r, c):
    d = [p[0] - c[0], p[1] - c[1], p[2] - c[2]]
    if not (_abs(d[0]) <= r and _abs(d[1]) <= r and _abs(d[2]) <= r):
        return None
    l = math.sqrt((d[0] * d[0] + d[1] * d[1]) + d[2] * d[2])
    if not (l <= r):
        return None
    if d[0] == 0 and d[1] == 0 and d[2] == 0:
        d[0] = 1
    else:
        _unit(d)
    return d, r - l


def _piece_at(x, z):
    a, b = x * C + z * -C, -x * -C + z * C
    return (1 if 0 < a else 0) + (2 if 0 < b else 0)


def _set_clip(f, c):
    if f.clip != c:
        f.clip = c
        f.frame = -1


def _set_frame(f, k):
    f.frame = k - 1


def _at_last(f):
    return f.frame >= CLIP_LEN[f.clip] - 1


def _advance(f):
    f.frame += 1
    if f.frame >= CLIP_LEN[f.clip]:
        f.frame = CLIP_LEN[f.clip] - 1 if HOLD[f.clip] else LOOP[f.clip]


def _bat(v, d):
    x = d[0] * SHOT_PW
    v[0] = v[0] + (x + x)
    v[1] = v[1] + SHOT_PW * 4.25
    z = d[2] * SHOT_PW
    v[2] = v[2] + (z + z)


class Ball:
    __slots__ = ("id", "kind", "pos", "v", "prev", "imp", "disp", "imp2", "scored", "alpha", "dist", "start")

    def copy(self):
        b = Ball()
        b.id, b.kind, b.scored, b.alpha, b.dist = self.id, self.kind, self.scored, self.alpha, self.dist
        b.pos, b.v, b.prev, b.imp, b.disp, b.imp2, b.start = (list(self.pos), list(self.v), list(self.prev), list(self.imp),
                                                              list(self.disp), list(self.imp2), list(self.start))
        return b


class Furret:
    __slots__ = ("spot", "target", "pos", "tail", "clip", "frame", "counter", "frozen", "swing", "redirect", "hit", "layout", "cry")

    def copy(self):
        f = Furret()
        for k in self.__slots__:
            setattr(f, k, getattr(self, k))
        f.pos, f.tail = list(self.pos), list(self.tail)
        return f


class Player:
    __slots__ = ("z", "cpu", "goal", "score", "won", "arrived", "cheer", "skill", "state", "timer", "held", "f", "empty")

    def copy(self):
        p = Player()
        for k in self.__slots__:
            setattr(p, k, getattr(self, k))
        p.f = self.f.copy()
        return p


class World:
    def __init__(self, seed, level="normal", cpus=(False, True, True, True), empty=None):
        empty = [bool(e) for e in empty] if empty else [False] * SEATS  # (no one at all: rules.js World)
        self.level = level_code(level, cpus)
        self.seed = seed & 0xFFFFFFFF
        self.t = -1
        self.end = None
        self.over = False
        self.left = TIME
        self.balls = []
        self.most = 1
        self.wait = 0
        self.order = [0, 1, 2, 3]
        self.next = 0
        self.ids = 0
        self.events = []
        self.shuffle()
        self.p = []
        for z in range(SEATS):
            p = Player()
            p.z, p.cpu, p.goal, p.score, p.won, p.arrived, p.cheer, p.skill = z, bool(cpus[z]), GOALS[z], 0, False, False, False, 0
            p.state, p.timer, p.held, p.empty = 0, 0, 0, empty[z]
            f = p.f = Furret()
            f.spot, f.target, f.pos, f.tail, f.clip, f.frame, f.counter = 0, 0, [0, 30, 0], [0, 0, 0], UP, COUNTDOWN % CLIP_LEN[UP], 0
            f.frozen, f.swing, f.redirect, f.hit, f.layout, f.cry = True, False, False, False, 0, 0
            self.p.append(p)
        for p in self.p:
            p.f.spot = p.f.target = START[p.goal]
            self.place(p, p.f.spot)
            p.f.tail = list(p.f.pos)
        cpu_list = [p for p in self.p if p.cpu]
        lst, n = list(SKILLS[self.level]), len(cpu_list)
        if n > 0:
            for _ in range(256):
                i = self.rnd() % n
                j = self.rnd() % n
                lst[i], lst[j] = lst[j], lst[i]
        for k, p in enumerate(cpu_list):
            p.skill = lst[k]

    def rnd(self):
        self.seed = (self.seed * 1664525 + 1013904223) & 0xFFFFFFFF
        return self.seed

    def shuffle(self):
        self.order = [0, 1, 2, 3]
        n = self.rnd() % 11
        for _ in range(n):
            self.rnd()
            i = self.rnd() & 3
            j = self.rnd() & 3
            self.order[i], self.order[j] = self.order[j], self.order[i]
        self.next = 0

    # ---- a frame ----
    def step(self, t, pads=()):
        self.t = t
        if not self.over:
            self.wait += 1
            if self.wait >= SPAWN_EVERY:
                self.wait = 0
                if len(self.balls) < self.most and self.left > 0:
                    v = (self.rnd() % 34) * self.most
                    self.spawn(5 if v >= 81 else 3 if v >= 61 else 2 if v >= 41 else 1)
            if (TIME // 3) * self.most < TIME - self.left:
                self.most += 1
            for p in self.p:
                if p.empty:
                    continue
                if p.cpu:
                    v = self.think(p)
                else:
                    pad = pads[p.z] if p.z < len(pads) and pads[p.z] else (0, False)
                    v = SPOTS[pad[0]][2] | (0x4000 if pad[1] else 0)
                s = 0
                for k in range(5):
                    if SPOTS[k][2] & v:
                        s = k
                        break
                self.move(p, s)
                if v & 0x4000:
                    self.swing(p)
        else:
            self.gather()
        for b in self.balls:
            b.start = list(b.pos)
        for _ in range(STEPS):
            self.sub()
        for b in self.balls:
            dx, dy, dz = b.pos[0] - b.start[0], b.pos[1] - b.start[1], b.pos[2] - b.start[2]
            b.dist = math.sqrt((dx * dx + dy * dy) + dz * dz)
        if not self.over:
            self.left -= 1
            if self.left < 0:
                self.left = 0
                self.finish()
        for p in self.p:
            if not p.empty:
                _advance(p.f)

    def sub(self):
        for p in self.p:
            if p.empty:
                continue
            self.furret(p)
            p.f.counter += 1
        for b in list(self.balls):
            self.roll(b)
        if self.left > 0:
            for p in self.p:
                if not p.f.swing:
                    continue
                for b in self.balls:
                    b.disp = [0, 0, 0]
                    self.bat(p, b)
                    b.pos = [b.pos[0] + b.disp[0], b.pos[1] + b.disp[1], b.pos[2] + b.disp[2]]
                    b.disp = [0, 0, 0]
        n = len(self.balls)
        for i in range(n - 1):
            for j in range(i + 1, n):
                self.knock(self.balls[i], self.balls[j])
        for b in self.balls:
            self.ground(b)

    # ---- the balls ----
    def spawn(self, kind):
        at = SPAWNS[self.order[self.next]]
        b = Ball()
        b.id, b.kind = self.ids, kind
        self.ids += 1
        b.pos, b.v, b.prev, b.imp, b.disp, b.imp2 = list(at), [0, 0, 0], list(at), [0, 0, 0], [0, 0, 0], [0, 0, 0]
        b.scored, b.alpha, b.dist, b.start = False, 255, 0, list(at)
        self.next += 1
        if self.next >= 4:
            self.shuffle()
        self.balls.append(b)
        self.events.append(["spawn", b.id, kind])

    def roll(self, b):
        v = b.v
        for k in range(3):
            v[k] = v[k] + (b.imp[k] + b.imp2[k])
        for k in range(3):
            v[k] = v[k] * SP_DEC
        s = math.sqrt((v[0] * v[0] + v[1] * v[1]) + v[2] * v[2])
        if SPD_MX < s:
            k = (SPD_MX / s) * SPEED[b.kind]
            b.v = v = [v[0] * k, v[1] * k, v[2] * k]
        b.prev = list(b.pos)
        for k in range(3):
            b.pos[k] = b.pos[k] + b.disp[k]
        for k in range(3):
            b.pos[k] = b.pos[k] + v[k]
        b.imp = [0, GRAVITY, 0]
        b.disp = [0, 0, 0]
        b.imp2 = [0, 0, 0]
        self.goal(b)
        if b.pos[1] < GONE:
            self.drop(b)
        if self.left == 0 and not b.scored:
            if b.alpha >= 9:
                b.alpha -= 8
            else:
                self.drop(b)

    def drop(self, b):
        if b in self.balls:
            self.balls.remove(b)

    def goal(self, b):
        if not (self.left > 0) or b.scored:
            return
        x, z = b.pos[0], b.pos[2]

        def past(x0, z0, x1, z1):
            return (x1 - x) * (z0 - z) <= (x0 - x) * (z1 - z)
        g = -1
        if x <= 0 and z < 0 and past(0, -1200, -1200, 0):
            g = 0
        if 0 < x and z <= 0 and past(1200, 0, 0, -1200):
            g = 1
        if x < 0 and 0 <= z and past(-1200, 0, 0, 1200):
            g = 2
        if 0 <= x and 0 < z and past(0, 1200, 1200, 0):
            g = 3
        if g < 0:
            return
        p = next(q for q in self.p if q.goal == g)
        b.scored = True
        if p.empty:
            return
        p.score += b.kind
        self.events.append(["goal", p.z, b.id, b.kind])

    def knock(self, a, b):
        dx, dy, dz = b.pos[0] - a.pos[0], b.pos[1] - a.pos[1], b.pos[2] - a.pos[2]
        R = EGG_SIZE * 0.75 * 100
        r = R * SIZE[a.kind] + R * SIZE[b.kind]
        if not (_abs(dx) < r and _abs(dy) < r and _abs(dz) < r):
            return
        l = math.sqrt((dx * dx + dy * dy) + dz * dz)
        if not (l < r):
            return
        dv = [b.v[0] - a.v[0], b.v[1] - a.v[1], b.v[2] - a.v[2]]
        if l == 0:
            n = [2 * (self.rnd() / U) - 1 for _ in range(3)]
            if n[0] == 0 and n[1] == 0 and n[2] == 0:
                n[0] = 1
        else:
            n = [dx, dy, dz]
        _unit(n)
        j = ((dv[0] * n[0] + dv[1] * n[1]) + dv[2] * n[2]) * 0.10000000149011612
        for k in range(3):
            a.imp[k] = a.imp[k] + n[k] * j
        for k in range(3):
            b.imp[k] = b.imp[k] - n[k] * j
        h = (r - l) * 0.5
        for k in range(3):
            a.disp[k] = a.disp[k] - n[k] * h
        for k in range(3):
            b.disp[k] = b.disp[k] + n[k] * h

    def ground(self, b):
        acc = [0, 0, 0]
        count = 0
        r = RADIUS[b.kind]
        for t in PIECES[_piece_at(b.pos[0], b.pos[2])]:
            off = False
            for k in range(3):
                pk, qk = b.prev[k], b.pos[k]
                lo = (pk if pk < qk else qk) - r - 1
                hi = (pk if pk > qk else qk) + r + 1
                if t.hi[k] < lo or hi < t.lo[k]:
                    off = True
                    break
            if off:
                continue
            hit = self.touch(b, t, r)
            if not hit:
                continue
            n, depth = hit
            for k in range(3):
                b.pos[k] = b.pos[k] + n[k] * depth
            k2 = (F_BOUND * -2) * ((n[0] * b.v[0] + n[1] * b.v[1]) + n[2] * b.v[2])
            for k in range(3):
                acc[k] = acc[k] + n[k] * k2
            if r * 0.03999999910593033 < depth and b.dist > 55:
                self.events.append(["bounce", b.id])
            count += 1
        if count > 0:
            for k in range(3):
                b.v[k] = b.v[k] + acc[k] / count

    def touch(self, b, t, r):
        s, pos, tn = b.prev, b.pos, t.n
        d = [pos[0] - s[0], pos[1] - s[1], pos[2] - s[2]]
        if d[0] == 0 and d[1] == 0 and d[2] == 0:
            d = [-tn[0], -tn[1], -tn[2]]
        else:
            _unit(d)
        fr = [s[0] - d[0] * r, s[1] - d[1] * r, s[2] - d[2] * r]
        seg = [(pos[0] + d[0] * r) - fr[0], (pos[1] + d[1] * r) - fr[1], (pos[2] + d[2] * r) - fr[2]]
        k = _across(t, fr, seg)
        hx, hz = seg[0] * k + fr[0], seg[2] * k + fr[2]
        a, bb, c = t.a, t.b, t.c
        face = 0 < k and k < 1 and _inside(hx, hz, a[0], a[2], bb[0], bb[2], c[0], c[2])
        if not face:
            down = [-tn[0], -tn[1], -tn[2]]
            dd = _across(t, pos, down)
            face = 0 <= dd and dd <= r and _inside(pos[0] + down[0] * dd, pos[2] + down[2] * dd, a[0], a[2], bb[0], bb[2], c[0], c[2])
        if face:
            p = [pos[0] - tn[0] * r, pos[1] - tn[1] * r, pos[2] - tn[2] * r]
            n = [tn[0], tn[1], tn[2]]
            return n, _across(t, p, n)
        return (_edge(pos, r, a, bb) or _edge(pos, r, bb, c) or _edge(pos, r, c, a)
                or _corner(pos, r, a) or _corner(pos, r, bb) or _corner(pos, r, c))

    # ---- the Furret ----
    def place(self, p, s):
        d, sp = DIRS[p.goal], SPOTS[s]
        p.f.pos = [sp[0] - ((d[0] * 18) * (5 * SO_SC)) * SO_POS, 30, sp[1] - ((d[2] * 18) * (5 * SO_SC)) * SO_POS]

    def furret(self, p):
        f = p.f
        i = max(0, f.frame - 4) if f.clip == SWING else 0
        tl = TAIL[i]
        f.tail = [f.pos[0] + tl[0], f.pos[1] + tl[1], f.pos[2] + tl[2]]
        if self.over:
            self.show(p)
        else:
            self.clips(p)

    def clips(self, p):
        f = p.f
        if f.clip == HOP:
            if _at_last(f):
                f.spot = f.target
                self.place(p, f.target)
                _set_clip(f, LAND)
        elif f.clip == UP:
            if _at_last(f):
                _set_clip(f, SWING)
        elif f.clip == SWING:
            if f.frame + 1 == 4:
                _set_clip(f, STAND)
            if _at_last(f):
                _set_clip(f, STAND)
            if STEPS * 9 < f.counter:
                f.swing = f.redirect = f.hit = False
        elif f.clip == LAND:
            if _at_last(f):
                _set_clip(f, STAND)
        elif f.clip == STAND:
            f.frozen = False

    def move(self, p, s):
        f = p.f
        if f.frozen or s == f.spot:
            return
        if f.swing:
            if not f.redirect and f.frame < STEPS * 2:
                f.spot = s
                self.place(p, s)
                _set_clip(f, SWING)
                _set_frame(f, 5)
                f.redirect = True
        else:
            f.target = s
            if f.clip != HOP:
                _set_clip(f, HOP)

    def swing(self, p):
        f = p.f
        if f.frozen or f.swing or not (STEPS * 9 < f.counter):
            return
        f.counter = 0
        f.swing = True
        _set_clip(f, SWING)
        _set_frame(f, 5)
        if f.target != f.spot:
            self.place(p, f.spot)
        self.events.append(["swing", p.z])

    def bat(self, p, b):
        f = p.f
        d = [f.tail[0] - b.pos[0], f.tail[1] - b.pos[1], f.tail[2] - b.pos[2]]
        l = _unit_len(d)
        reach = RADIUS[b.kind] + REACH
        if not (l < reach):
            return
        pen = reach - l
        for k in range(3):
            b.disp[k] = b.disp[k] + -d[k] * pen
        if f.counter < STEPS * 3 - 1 and not f.hit:
            dr = DIRS[p.goal]
            _bat(b.imp2, dr)
            k = (b.v[0] * dr[0] + b.v[1] * dr[1]) + b.v[2] * dr[2]
            if k < 0:
                for i in range(3):
                    b.v[i] = b.v[i] - dr[i] * k
            self.events.append(["shot", p.z, b.id])
        else:
            k = (b.v[0] * d[0] + b.v[1] * d[1]) + b.v[2] * d[2]
            for i in range(3):
                b.imp2[i] = b.imp2[i] + -d[i] * k
        f.hit = True

    # ---- a CPU ----
    def think(self, p):
        sk = p.skill
        if sk == 0:
            wait = (self.rnd() % 41) + 40
            rank = self.rnd() % 3
            least = 0
            swing_after = self.rnd() % 31
        elif sk == 1:
            wait = (self.rnd() % 18) + 17
            rank = self.rnd() & 1
            least = 0.699999988079071
            swing_after = self.rnd() % 13
        elif sk == 2:
            wait = (self.rnd() & 15) + 15
            self.rnd()
            rank = 0
            least = 0.8500000238418579
            swing_after = self.rnd() % 6
        else:
            wait = (self.rnd() % 13) + 12
            self.rnd()
            rank = 0
            least = 0.8999999761581421
            swing_after = self.rnd() & 3
        v = p.held
        if p.state == 0:
            if wait < p.timer:
                p.state, p.timer = 1, 0
        elif p.state == 1:
            c = self.choose(p, rank, least)
            if c:
                p.state, p.timer, v = 2, 0, c
            else:
                v = 0
        elif p.state == 2:
            if swing_after < p.timer:
                v |= 0x4000
                p.state, p.timer = 0, 0
        p.timer += 1
        p.held = v & 0xBFFF
        return v

    def choose(self, p, rank, least):
        dr = DIRS[p.goal]
        vals, ids = [], []
        for s in range(5):
            best = 0
            for i, b in enumerate(self.balls):
                val = -1
                d = self.reach(SPOTS[s], dr, b)
                if d:
                    d[1] = 0
                    d[0] = d[0] + b.v[0]
                    d[2] = d[2] + b.v[2]
                    l = math.sqrt(d[2] * d[2] + d[0] * d[0])
                    if l != 0:
                        d[0] /= l
                        d[2] /= l
                    val = (dr[0] * d[0] + d[2] * dr[2]) * b.kind
                if best < val or i == 0:
                    best = val
            vals.append(best)
            ids.append(s)

        def swap(i, j):
            vals[i], vals[j] = vals[j], vals[i]
            ids[i], ids[j] = ids[j], ids[i]
        for _ in range(5):
            i = self.rnd() % 5
            j = self.rnd() % 5
            swap(i, j)
        for k in range(4, 0, -1):
            for i in range(k, 0, -1):
                if vals[i - 1] < vals[i]:
                    swap(i, i - 1)
        return SPOTS[ids[rank]][2] if least < vals[rank] else 0

    def reach(self, sp, dr, b):
        k = 5 * SO_SC
        tx = TAIL[0][0] + (sp[0] - ((dr[0] * 18) * k) * SO_POS)
        ty = TAIL[0][1] + 30
        tz = TAIL[0][2] + (sp[1] - ((dr[2] * 18) * k) * SO_POS)
        d = [b.pos[0] - tx, b.pos[1] - ty, b.pos[2] - tz]
        l = _unit_len(d)
        if not (l < RADIUS[b.kind] + REACH):
            return None
        _bat(d, dr)
        return d

    # ---- the end ----
    def finish(self):
        here = [p for p in self.p if not p.empty]
        best = here[0].score
        for p in here:
            if best < p.score:
                best = p.score
        for p in here:
            p.won = p.score == best
        if all(p.won for p in here):
            for p in here:
                p.won = False
        self.end = self.t
        self.over = True
        self.events.append(["end"])

    def gather(self):
        w = sum(1 for p in self.p if p.won)
        a = sum(1 for p in self.p if p.arrived)
        if w == a:
            for p in self.p:
                if p.won:
                    p.cheer = True

    def show(self, p):
        f = p.f
        if p.cheer:
            if f.clip != CHEER:
                f.layout = 1
                _set_clip(f, CHEER)
                return
            if f.frame + 1 == 69 and f.cry < STEPS * 2:
                if f.cry % 3 == 0:
                    self.events.append(["cheer", p.z])
                f.cry += 1
        elif _at_last(f):
            if p.won:
                if f.spot != 0:
                    self.move(p, 0)
                    self.clips(p)
                    return
                p.arrived = True
                return
            if f.clip != SAD:
                f.layout = 1
                _set_clip(f, SAD)

    # ---- for running a frame again ----
    def save(self):
        return dict(t=self.t, end=self.end, over=self.over, left=self.left, seed=self.seed, most=self.most, wait=self.wait,
                    order=list(self.order), next=self.next, ids=self.ids, balls=[b.copy() for b in self.balls],
                    p=[p.copy() for p in self.p])

    def load(self, s):
        for k in ("t", "end", "over", "left", "seed", "most", "wait", "next", "ids"):
            setattr(self, k, s[k])
        self.order = list(s["order"])
        self.balls = [b.copy() for b in s["balls"]]
        self.p = [p.copy() for p in s["p"]]
        self.events = []

    @property
    def scores(self):
        return [p.score for p in self.p]

    @property
    def places(self):
        return [None if p.empty else 1 + sum(1 for q in self.p if q.score > p.score and not q.empty) for p in self.p]

    def digest(self):
        parts = [self.t, self.seed, -1 if self.end is None else self.end, int(self.over), self.left, self.most, self.wait,
                 ".".join(str(v) for v in self.order), self.next, self.ids]
        for p in self.p:
            f = p.f
            parts += [p.score, int(p.won), int(p.arrived), int(p.cheer), p.skill, p.state, p.timer, p.held, f.spot, f.target]
            parts += [_hex(v) for v in f.pos] + [_hex(v) for v in f.tail]
            parts += [f.clip, f.frame, f.counter, int(f.frozen), int(f.swing), int(f.redirect), int(f.hit), f.layout, f.cry]
        for b in self.balls:
            parts += [b.id, b.kind]
            for vec in (b.pos, b.v, b.prev, b.imp, b.disp, b.imp2):
                parts += [_hex(v) for v in vec]
            parts += [int(b.scored), b.alpha, _hex(b.dist)] + [_hex(v) for v in b.start]
        return ",".join(str(v) for v in parts)


def _hex(v):
    return struct.pack(">d", float(v) + 0).hex()  # (-0 as 0)


class Round:
    """One round's world on the server, run as far as the pads that can still
    come in allow."""

    def __init__(self, seed, level="normal", cpus=(False, True, True, True), empty=None):
        self.cpus = list(cpus)
        self.empty = [bool(e) for e in empty] if empty else [False] * SEATS  # (no one at all: online, the CPUs off)
        self.world = World(seed, level, self.cpus, self.empty)
        self.pads = [[] for _ in range(SEATS)]  # each person's pad changes: [frame, spot, A]
        self.at = [0] * SEATS  # where each one's list has been read to
        self.done = None  # how it ended, once decided: dict(f, s)
        self.end = (TIME + AFTER) / FPS  # s after GO it's over

    def pad_at(self, s, t):
        """Seat s's [spot, A] on frame t (frames are run in order)."""
        lst, i = self.pads[s], self.at[s]
        x, a = (lst[i - 1][1] if i else 0), False
        while i < len(lst) and lst[i][0] <= t:
            x = lst[i][1]
            a = a or (lst[i][0] == t and lst[i][2] == 1)
            i += 1
        self.at[s] = i
        return [x, a]

    def run_to(self, t):
        w = self.world
        while w.end is None and w.t < t:
            f = w.t + 1
            w.step(f, [None if self.cpus[s] or self.empty[s] else self.pad_at(s, f) for s in range(SEATS)])
            w.events = []

    def pad(self, s, f, x, a, now, allow):
        """Seat s's D-pad went to spot x (0 the middle, 1-4 right, down, up,
        left) and A if a, on frame f (its device's word); it came in at round
        time now, and may be at most allow s old. Returns the frame it counts on, or None."""
        if self.cpus[s] or self.empty[s] or self.done or type(f) is not int or type(x) is not int or a not in (0, 1):
            return None
        if not 0 <= x <= 4:
            return None
        here = int(now * FPS)
        f = min(max(f, here - int(allow * FPS)), here + 1 + AHEAD)  # (no older than the way here allows; not far ahead)
        f = max(f, self.world.t + 1)  # (not what's been run)
        if self.pads[s]:
            last = self.pads[s][-1]
            f = max(f, last[0] + (1 if a and last[2] and last[0] >= f else 0))  # (in order; one A a frame)
        self.pads[s].append([f, x, a])
        return f

    def wire(self):
        """What a device needs to rejoin the round: how it ended (once decided) and the people's pads so far."""
        return dict(fu=dict(done=self.done, pads=[None if self.cpus[s] or self.empty[s] else [list(e) for e in self.pads[s]]
                                                  for s in range(SEATS)]))

    def result(self):
        return self.done

    @property
    def scores(self):
        """Each seat's points (as far as the world's been run)."""
        return list(self.done["s"]) if self.done else self.world.scores

    def places(self):
        """Each seat's place, as the devices rank them (game.js places()): by points, the most first,
        ties sharing the better place; None for an empty seat."""
        p = self.scores
        here = [s for s in range(SEATS) if not self.empty[s]]
        return [None if self.empty[s] else 1 + sum(1 for o in here if p[o] > p[s]) for s in range(SEATS)]

    def settle(self, now, allow):
        """Run the world as far as no pad still on its way could change; once
        it's over, how: dict(f, s), or None."""
        if self.done:
            return None
        safe = int(now * FPS) - int(allow * FPS) - 1
        if safe < 0:
            return None
        self.run_to(min(safe, TIME))
        if self.world.end is not None:
            self.done = dict(f=self.world.end, s=self.world.scores)
            self.end = (self.world.end + AFTER) / FPS
            return self.done
        return None

    def next_settle(self, allow):
        """When (round time, s) to look again: every half second (the world's
        run as it goes, so the end needs little more)."""
        return None if self.done else (self.world.t + 1 + FPS // 2) / FPS + allow
