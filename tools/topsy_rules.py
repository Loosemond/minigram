"""The rules of a Topsy-Turvy round, for the rooms server (tools/rooms.py).

The same world as web/minigames/src/topsy/rules.js, which has the rules and
where each number comes from in the game's code: keep the two the same, line
for line (tools/test_rooms.py and the browser tests check they run alike, to
the last bit). The four Hitmontop share one ring, so the server runs it from
everyone's pads (the people's: the devices send each change, a "pad" with the
frame it's for; the CPUs think in it as on every device), and so knows who
scored what.
"""
import math
import struct

SEATS = 4
FPS = 30
START = 20  # frames from GO to the play: the countdown's over a step after GO (0x8600674C)
LEVELS = {"easy": 1, "normal": 2, "hard": 3}


_F = struct.Struct("<f")


def f32(x):
    """x rounded to a 32-bit float (the game's floats; Math.fround in JS)."""
    return _F.unpack(_F.pack(x))[0]


REPEAT = 6
DT = 1 / 30
DTS = DT / REPEAT
MASS = 100
IMPACT_WEIGHT = 5
DAMAGE_WEIGHT = 0.25
MIN_BOUND = 100 * 6000
MAX_BOUND = 100 * 2600000
STICK_POWER = 100 * 160
MAX_SPEED, MAX_SPEED_DAMAGED = 3400, 10000
GRAVITY = 20000
SPIN = 27
IMPACT_TIME = 0.4
AFTER_IMPACT = 1.5
DAMAGE_TIME = 1.2
TOUCH_TIME = 0.5
RADIUS = 135
BOUND_FACTOR = 3
IMPACT_BOUND_FACTOR = 5
IMPACT_IMPACT_BOUND = 0
BOUNDS = [
    dict(outer=(0.5, 0.1), inner=(0.2, 0.04)),
    dict(outer=(0, 0), inner=(0, 0)),
    dict(outer=(f32(0.1), f32(0.95)), inner=(f32(0.1), f32(0.95))),
]
FLOOR = (0.8, 0.2)  # the floor round the ring's bounce and friction (tuning +0x238 and +0x260, 0x86004E38)
FRICTION = 0
INITIAL_OFFSET, INITIAL_SPEED_H, INITIAL_SPEED_V = 160, 800, 4000
WAIT_IN = 0.35
GHOST = 1.4
ROOM = 50
LANDED = 1.4
AIR = 10
RECENT = 1
WINNERS_POINT = 5
TIME_LIMIT = 60 * FPS
RIM = 1800
FLOOR_SHARE = 90 * 0.01
AHEAD = 4  # frames ahead of now a pad may be for (a device sends its player's up to 3 ahead: src/lag.js leadFor)
AFTER = 1  # frames from the end to the results: the show's first frame hands over (0x86006B74-0x86006BC8)

CPU_RECS = [dict(near=f32(a), wrong=f32(b), power=f32(c), bits=d << 16) for a, b, c, d in (
    (0.85, 0.01, 24, 0x8FC0), (0.9, 0.0115, 20, 0x0DC0), (0.9, 0.01, 24, 0x3DC0), (0.8, 0.0405, 55, 0x29C0),
    (0.8, 0.0065, 45, 0xCBC0), (0.85, 0.0065, 45, 0xEBC0), (0.85, 0.006, 45, 0xC9C0), (0.65, 0.04, 50, 0x3600),
    (0.5, 0, 60, 0xF200), (0.9, 0.001, 50, 0xA200), (0.65, 0.001, 50, 0xEA40), (0, 0, 0, 0),
    (0.65, 0.00605, 28, 0xF3C0))]
CPU_ORDER = [[2], [2, 3], [1, 2, 3], [1, 2, 3, 4]]


def cpu_rec(level, k):
    return CPU_RECS[(level - 1) * 4 + k - 1]


def bit(rec, b):
    return (rec["bits"] >> b) & 1


START_ANGLE = [-2.35619455575943, 2.35619455575943, -0.7853981852531433, 0.7853981852531433]
PI, TWO_PI, HALF_PI = 3.1415927410125732, 6.2831854820251465, 1.5707963705062866
TEN_PI = 31.41592788696289  # (0x86002B20's)
U = 4294967296


def level_code(level, cpus):
    return LEVELS.get(level, 2) if any(cpus) else 1


SP = [1, -0.16666659550427756, 0.008333066246082155, -0.0001980960290193795, 2.605780637968037e-6]
RPI, PIHI, PILO = 0.3183098861837907, 3.1415926218032837, 3.178650954705639e-8


def poly(dx):
    xsq = dx * dx
    return dx * xsq * (SP[1] + ((SP[4] * xsq + SP[3]) * xsq + SP[2]) * xsq) + dx


def exponent(x):
    return (struct.unpack(">i", struct.pack(">f", x))[0] >> 22) & 0x1FF


def sinf(x):
    x = f32(x)
    xpt = exponent(x)
    if xpt < 0xFF:
        return f32(poly(x)) if xpt >= 0xE6 else x
    if xpt < 0x136:
        dn0 = x * RPI
        n = int(dn0 + 0.5 if dn0 >= 0 else dn0 - 0.5)
        dx = x - n * PIHI - n * PILO
        r = f32(poly(dx))
        return -r if n & 1 else r
    return x if x != x else 0


def cosf(x):
    x = f32(x)
    if exponent(x) < 0x136:
        ax = x if x > 0 else -x
        dn0 = ax * RPI + 0.5
        n = int(dn0 + 0.5 if dn0 >= 0 else dn0 - 0.5)
        dn = n - 0.5
        dx = ax - dn * PIHI - dn * PILO
        r = f32(poly(dx))
        return -r if n & 1 else r
    return x if x != x else 0


def atan2(y, x):
    if x == 0:
        return 0 if y == 0 else HALF_PI if 0 < y else -HALF_PI
    t = y / x
    at = t if t > 0 else -t
    s = t if at <= 1 else 1 / t
    f = 0
    for k in range(14, 0, -1):
        f = (k * k * s * s) / (2 * k + 1 + f)
    r = s / (1 + f)
    if 1 < t:
        r = HALF_PI - r
    if t < -1:
        r = -HALF_PI - r
    if 0 < x:
        return r
    return r + PI if 0 < y else r - PI


def wrap(a):
    while PI <= a:
        a -= TWO_PI
    while a <= -PI:
        a += TWO_PI
    return a


def approach(x, to, step):
    if x < to - step:
        return x + step
    if to + step < x:
        return x - step
    return to


def sqrtf(x):
    return _F.unpack(_F.pack(math.sqrt(_F.unpack(_F.pack(x))[0])))[0]


def dot(a, b):
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def len2(a):
    return a[0] * a[0] + a[1] * a[1] + a[2] * a[2]


def cross(a, b):
    return [a[1] * b[2] - b[1] * a[2], a[2] * b[0] - b[2] * a[0], a[0] * b[1] - b[0] * a[1]]


def sub(a, b):
    return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]


def add(a, b):
    return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]


def scale(a, k):
    return [a[0] * k, a[1] * k, a[2] * k]


def set_length(a, ln):
    d2 = len2(a)
    return scale(a, ln / sqrtf(d2)) if 0.0001 < d2 else [0, 0, 0]


def reject(v, n):
    d = dot(v, n)
    return [v[0] - n[0] * d, v[1] - n[1] * d, v[2] - n[2] * d]


class Cap:
    """One of the ring's spheres' caps: r across, R the sphere's radius, c its middle."""

    def __init__(self, y0, r, angle):
        half = f32((PI - angle) * 0.5)
        self.R = r / cosf(half)
        self.r = r
        self.c = [0, y0 + sinf(half) * self.R, 0]


OUTER = Cap(0, RIM, (PI * 85) / 180)
_r = OUTER.r * FLOOR_SHARE
_t = _r / OUTER.R
INNER = Cap(sqrtf(1 - _t * _t) * -OUTER.R + OUTER.c[1], _r, (PI * 10) / 180)


def within(S, p):
    dx, dz = S.c[0] - p[0], S.c[2] - p[2]
    return dx * dx + dz * dz < S.r * S.r


def surface_y(S, x, z):
    dx, dz = S.c[0] - x, S.c[2] - z
    r2, d2 = S.r * S.r, dx * dx + dz * dz
    return sqrtf(S.R * S.R - r2) * -1 + S.c[1] if d2 > r2 else sqrtf(S.R * S.R - dx * dx - dz * dz) * -1 + S.c[1]


def normal_at(S, p):
    return set_length(sub(p, S.c), -1)


def height_at(p):
    if within(INNER, p):
        return INNER.R - sqrtf(len2(sub(INNER.c, p)))
    if within(OUTER, p):
        return OUTER.R - sqrtf(len2(sub(OUTER.c, p)))
    return p[1]


def up_at(p):
    if within(INNER, p):
        return normal_at(INNER, p)
    if within(OUTER, p):
        return normal_at(OUTER, p)
    return [0, 1, 0]


class Ball:
    """A Hitmontop: its ball, and what the game keeps for its player."""

    def __init__(self, z, cpu, empty=False):
        self.z, self.cpu, self.rec, self.auto, self.empty = z, cpu, None, False, empty
        self.pos, self.vel, self.w, self.F, self.T = [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]
        self.r, self.m, self.I, self.max_v = RADIUS, MASS, 0, MAX_SPEED
        self.state, self.on, self.solid, self.hold, self.spin, self.cool = 0, False, False, 0, 0, 0
        self.touch, self.recent, self.hard, self.landed = 0, -1, False, False
        self.score, self.falls, self.hit_by, self.victims = 0, 0, -1, []
        self.angle, self.stick, self.spot = START_ANGLE[z], [0, 0], [0, 0, OUTER.r * 0.6]
        self.heading, self.turn = 0, 0

    def copy(self):
        b = Ball.__new__(Ball)
        b.__dict__.update(self.__dict__)
        for k in ("pos", "vel", "w", "F", "T", "stick", "spot", "victims"):
            setattr(b, k, list(getattr(self, k)))
        return b


def set_mass(p, m):
    p.m = m
    p.I = (((m + m) / 3) * p.r) * p.r * 5


def place_out(p):
    p.pos[0] = sinf(p.angle) * (OUTER.r + INITIAL_OFFSET)
    p.pos[2] = cosf(p.angle) * (OUTER.r + INITIAL_OFFSET)


def launch(p):
    place_out(p)
    p.pos[1] = surface_y(OUTER, p.pos[0], p.pos[2])
    p.vel = [sinf(p.angle) * -INITIAL_SPEED_H, INITIAL_SPEED_V, cosf(p.angle) * -INITIAL_SPEED_H]


def force(p, at, f):
    p.F = add(p.F, f)
    p.T = add(p.T, cross(sub(at, p.pos), f))


def push(p, x, y):
    force(p, p.pos, [STICK_POWER * x * DTS * p.m, 0, -y * STICK_POWER * DTS * p.m])


def steerable(p):
    if p.r + AIR < height_at(p.pos):
        return False
    if p.state == 6:
        return True
    if p.state in (1, 2, 3):
        return p.hold <= 0
    return False


def bump(a, b, e, move_a, move_b, at=None):
    s, d = a.r + b.r + 1, sub(a.pos, b.pos)
    if s * s < len2(d):
        return 0
    n = set_length(d, 1)
    k = a.r / (a.r + b.r)
    p = [(b.pos[0] - a.pos[0]) * k + a.pos[0], (b.pos[1] - a.pos[1]) * k + a.pos[1], (b.pos[2] - a.pos[2]) * k + a.pos[2]]
    if at is not None:
        at[:] = p
    spin = [0, SPIN, 0]
    va, vb = add(cross(spin, sub(p, a.pos)), a.vel), add(cross(spin, sub(p, b.pos)), b.vel)
    t = set_length(reject(sub(vb, va), n), 1)
    dn = dot(sub(a.vel, b.vel), n)
    j = (-(1 + e) * dn) / ((b.r * b.r / b.I + (1 / a.m + 1 / b.m + a.r * a.r / a.I)) * DTS)
    if j < MIN_BOUND:
        j = MIN_BOUND
    if 0 < MAX_BOUND and MAX_BOUND < j:
        j = MAX_BOUND
    imp = add(scale(n, j), scale(t, FRICTION * j))
    force(a, p, imp)
    force(b, p, scale(imp, -1))
    if move_a:
        a.pos = add(p, scale(n, a.r))
    if move_b:
        b.pos = add(p, scale(n, -b.r))
    return j


def rub(p, at, n, bound):
    e, fr = bound
    v = add(cross(p.w, sub(at, p.pos)), p.vel)
    j = (dot(n, v) * -(1 + e) * p.m) / DTS
    if 0 < MAX_BOUND and MAX_BOUND < j:
        j = MAX_BOUND
    t = set_length(reject(v, n), 1)
    force(p, at, add(scale(n, j), scale(t, -j * fr)))
    return j


def bowl(p, S, bound, skip):
    d = sub(S.c, p.pos)
    ln = sqrtf(len2(d))
    pen = ln - S.R + p.r
    if pen <= 0 or 10000 < pen:
        return
    at = [S.c[0] - (d[0] * S.R) / ln, S.c[1] - (d[1] * S.R) / ln, S.c[2] - (d[2] * S.R) / ln]
    if not within(S, at):
        return
    dx, dz = at[0] - S.c[0], at[2] - S.c[2]
    if dx * dx + dz * dz < skip * skip:
        return
    if not at[1] < S.c[1]:
        return
    n = normal_at(S, at)
    rub(p, at, n, bound)
    p.pos = add(p.pos, scale(n, pen))


def floor(p):
    d = p.pos[1] - p.r
    if 0 < d:
        return
    rub(p, [p.pos[0], 0, p.pos[2]], [0, 1, 0], FLOOR)
    p.pos = [p.pos[0], p.pos[1] - d, p.pos[2]]


def integrate(p, g):
    force(p, p.pos, scale(g, p.m))
    p.vel = add(p.vel, scale(p.F, DTS / p.m))
    if p.max_v * p.max_v < len2(p.vel):
        p.vel = set_length(p.vel, p.max_v)
    p.pos = add(p.pos, scale(p.vel, DTS))
    p.w = add(p.w, scale(p.T, DTS / p.I))
    p.F = [0, 0, 0]
    p.T = [0, 0, 0]


def closest(p, q, T):
    d = [q.pos[0] - p.pos[0], 0, q.pos[2] - p.pos[2]]
    dv = [q.vel[0] - p.vel[0], 0, q.vel[2] - p.vel[2]]
    dd, vv = dot(d, dv), len2(dv)
    if vv < 0.01:
        return sqrtf(len2(d))
    t = -dd / vv
    if t <= 0.05:
        return sqrtf(len2(d))
    if T <= t:
        return sqrtf(len2(add(d, scale(dv, T))))
    return sqrtf(len2(d) - (-dd / vv) * dd)


def steer(p, aim, aim_v, power):
    dv = [aim_v[0] - p.vel[0], 0, aim_v[2] - p.vel[2]]
    d = [aim[0] - p.pos[0], 0, aim[2] - p.pos[2]]
    d = sub(d, scale(dv, (DT / REPEAT) * 1))
    if f32(power * power) < len2(d):
        d = set_length(d, power)
    return [f32(d[0]), f32(-d[2])]


class World:
    def __init__(self, seed, level="normal", cpus=(False, True, True, True), empty=None):
        empty = [bool(e) for e in empty] if empty else [False] * SEATS  # (no one at all: rules.js World)
        self.level = level_code(level, cpus)
        self.seed = seed & 0xFFFFFFFF
        self.t = -1
        self.end = None
        self.over = False
        self.first = self.rnd() % 4
        self.events = []
        self.p = []
        for z in range(SEATS):
            p = Ball(z, bool(cpus[z]), empty[z])
            set_mass(p, MASS)
            launch(p)
            self.p.append(p)
        for p in self.p:
            self.enter(p, 0)

    def rnd(self):
        self.seed = (self.seed * 1664525 + 1013904223) & 0xFFFFFFFF
        return self.seed

    def u(self):
        return self.rnd() / U

    def step(self, t, pads=()):
        self.t = t
        if not self.over:
            self.parts()
        for _ in range(REPEAT):
            self.sub(pads, not self.over)
        if not self.over and self.done(t):
            self.end = t
            self.over = True
            self.events.append(["end"])
        if self.over and t == self.end + 1:
            for p in self.p:
                if p.state == 8:
                    self.enter(p, 7)
        for p in self.p:
            self.update(p)

    def parts(self):
        lst = [self.p[(self.first + k) % 4] for k in range(4) if self.p[(self.first + k) % 4].cpu]
        n = len(lst)
        for i in range(n - 1):
            for j in range(n - 1, i, -1):
                if lst[j - 1].score < lst[j].score:
                    lst[j - 1], lst[j] = lst[j], lst[j - 1]
        for k, p in enumerate(lst):
            p.rec = cpu_rec(self.level, CPU_ORDER[n - 1][k])

    def sub(self, pads, scoring):
        on = [p for p in self.p if p.on]
        for i in range(len(on)):
            for j in range(i + 1, len(on)):
                a, b = on[i], on[j]
                fa, fb = not a.solid and a.hold <= 0, not b.solid and b.hold <= 0
                if fa or fb:
                    bump(a, b, 0.1, fa, fb)
        for p in self.p:
            if p.empty:
                continue
            x, y, press = 0, 0, False
            if not p.cpu and not p.auto:
                pad = pads[p.z] if p.z < len(pads) and pads[p.z] is not None else (0, 0, False)
                x, y, press = pad
            if steerable(p):
                if p.auto:
                    x, y, press = self.drive(p)
                elif p.cpu:
                    x, y, press = self.cpu(p)
                push(p, x, y)
                p.stick = [x, y]
            if press:
                self.rapid_spin(p)
        for p in on:
            st = BOUNDS[2 if p.state >= 7 else 1 if p.state == 3 and p.hold > 0 and p.hard else 0]
            if within(OUTER, p.pos):
                bowl(p, INNER, st["inner"], 0)
                bowl(p, OUTER, st["outer"], INNER.r)
            else:
                floor(p)
        for i in range(len(on)):
            for j in range(i + 1, len(on)):
                a, b = on[i], on[j]
                if not a.solid or not b.solid:
                    continue
                e = BOUND_FACTOR
                if a.spin > 0 or b.spin > 0:
                    e = IMPACT_BOUND_FACTOR
                if a.spin > 0 and b.spin > 0:
                    e = IMPACT_IMPACT_BOUND
                at = [0, 0, 0]
                j0 = bump(a, b, e, True, True, at)
                if j0 > 0 and scoring:
                    self.hit(a, b, j0, at)
        for p in on:
            integrate(p, scale(up_at(p.pos), -GRAVITY) if p.state >= 7 else [0, -GRAVITY, 0])

    def rapid_spin(self, p):
        if p.cool <= 0 and p.spin <= 0 and p.state == 3 and p.hold <= 0:
            p.spin = IMPACT_TIME
            self.events.append(["spin", p.z])
        elif p.state == 1:
            self.enter(p, 2)

    def hit(self, a, b, j, at):
        spun = a.spin > 0 or b.spin > 0
        for p, q in ((a, b), (b, a)):
            p.hit_by = q.z
            if p.spin > 0:
                continue
            if q.spin > 0:
                p.hard = True
                p.hold = DAMAGE_TIME
            else:
                p.hold = TOUCH_TIME
                p.hard = False
        k = 3 if j > 8000000 and spun else 2 if j > 2000000 else 1 if j > 700000 else 0
        self.events.append(["hit", a.z, b.z, k, at[0], at[1], at[2], int(spun)])
        for p in (a, b):
            p.touch = TOUCH_TIME if p.hold < TOUCH_TIME else p.hold
            p.recent = RECENT

    def update(self, p):
        if p.empty:
            return
        p.w = [0, 0, 0]
        if p.recent > 0:
            p.recent -= DT
            if p.recent <= 0:
                p.recent = -1

        def spin_to(to, k=1):
            p.turn = approach(p.turn, to, DT * 80 * k)
        if p.state == 0:
            if self.t >= 0:
                self.enter(p, 1)
            else:
                spin_to(0)
                p.heading = atan2(-p.pos[0], -p.pos[2])
        elif p.state == 1:
            p.hold -= DT
            if p.hold <= 0:
                p.hold = 0
                self.enter(p, 2)
            else:
                p.turn = TEN_PI
                p.heading = atan2(-p.pos[0], -p.pos[2])
        elif p.state == 2:
            p.hold -= DT
            if p.hold <= 0:
                p.hold = 0
                if self.roomy(p):
                    self.enter(p, 3)
            else:
                spin_to(0.5)
            p.heading = wrap(p.heading + p.turn)
        elif p.state == 3:
            if p.touch > 0:
                p.touch -= DT
            if p.touch < 0:
                p.touch = 0
            if p.hold > 0:
                p.hold -= DT
                spin_to(0)
            else:
                p.hold = 0
                spin_to(67 if p.spin > 0 else (67 - 0.5) * (p.cool / AFTER_IMPACT) + 0.5)
            p.heading = wrap(p.heading + p.turn)
            if not within(OUTER, p.pos):
                self.enter(p, 4)
        elif p.state == 4:
            h = height_at(p.pos)
            spin_to(0)
            p.heading = atan2(-p.pos[0], -p.pos[2])
            if within(OUTER, p.pos):
                p.angle = atan2(p.pos[0], p.pos[2])
                place_out(p)
            if p.touch > 0:
                p.touch -= DT
            if p.touch < 0:
                p.touch = 0
            vy = p.vel[1] if p.vel[1] > 0 else -p.vel[1]
            if vy < 100 and h <= p.r + AIR:
                p.vel = [0, 0, 0]
                if not p.landed:
                    p.landed = True
                    p.hold = LANDED
                else:
                    p.hold -= DT
                    if p.hold <= 0:
                        p.hold = 0
                        self.enter(p, 1)
        elif p.state == 5:
            spin_to(0)
            p.heading = 0
        elif p.state == 6:
            spin_to(0.5)
            d = sub(p.pos, p.spot)
            d[1] = 0
            if sqrtf(len2(d)) < RADIUS * 0.5:
                self.enter(p, 5)
            p.heading = wrap(p.heading + p.turn)
        elif p.state in (7, 8):
            p.vel = scale(p.vel, 0.4)
            spin_to(0, 10)
            p.heading = wrap(p.heading + p.turn)
        p.max_v = MAX_SPEED
        if p.spin > 0:
            p.hold = 0
            p.spin -= DT
            p.cool = AFTER_IMPACT
            set_mass(p, MASS * IMPACT_WEIGHT)
            if p.spin <= 0:
                p.spin = 0
                p.cool = AFTER_IMPACT
        else:
            p.spin = 0
            set_mass(p, MASS)
            if p.state == 3 and p.hold > 0:
                set_mass(p, MASS * DAMAGE_WEIGHT)
                p.max_v = MAX_SPEED_DAMAGED
            p.cool -= DT
            if p.cool < 0:
                p.cool = 0

    def enter(self, p, s):
        p.state = s
        p.spin = 0
        if s == 0:
            p.on, p.solid = False, False
            p.heading = atan2(-p.pos[0], -p.pos[2])
        elif s == 1:
            p.on, p.solid = False, False
            self.events.append(["jump", p.z])
            p.hold = WAIT_IN
            p.angle = atan2(p.pos[0], p.pos[2])
            launch(p)
        elif s == 2:
            p.on, p.solid = True, False
            p.heading = atan2(-p.pos[0], -p.pos[2])
            p.w = [0, SPIN, 0]
            p.hold = GHOST
        elif s == 3:
            p.on, p.solid = True, True
            p.hold = 0
        elif s == 4:
            p.on, p.solid, p.landed = True, False, False
            p.falls += 1
            self.events.append(["out", p.z])
            p.angle = atan2(-p.pos[0], -p.pos[2])
            p.pos[1] += AIR
            if p.recent > 0:
                q = self.p[p.hit_by] if 0 <= p.hit_by < SEATS else None
                if q and q.state == 3:
                    q.victims.append(p.z)
                    q.score += 1
                    self.events.append(["point", q.z, p.z])
                p.recent = -1
        elif s == 5:
            p.on, p.solid = False, True
            p.heading = 0
        elif s == 6:
            p.on, p.solid, p.auto = True, True, True
        elif s == 7:
            p.on, p.solid = False, True
            p.vel, p.w = [0, 0, 0], [0, 0, 0]
        elif s == 8:
            p.on, p.solid = True, True
            p.vel, p.w = [0, 0, 0], [0, 0, 0]
            p.r *= 3

    def roomy(self, p):
        for q in self.p:
            if q.z != p.z and not q.empty and sqrtf(len2(sub(p.pos, q.pos))) < RADIUS + RADIUS + ROOM:
                return False
        return True

    def done(self, t):
        here = [p for p in self.p if not p.empty]
        best, out = 0, 0
        for p in here:
            if p.state >= 7:
                out += 1
            elif p.score >= best:
                best = p.score
        if t + 1 < TIME_LIMIT and out < 3 and best < WINNERS_POINT:
            return False
        if all(p.score == here[0].score for p in here):
            for p in here:
                p.hold = 0
                if p.state < 7:
                    self.enter(p, 8)
        else:
            for p in here:
                p.hold = 0
                if p.state < 7 and p.score < best:
                    self.enter(p, 8)
            for p in here:
                if p.state >= 7:
                    continue
                if p.state != 3:
                    self.enter(p, 1)
                    self.enter(p, 2)
                    self.enter(p, 3)
                self.enter(p, 6)
        won = [p for p in self.p if p.state == 6]
        n = len(won)
        for k, p in enumerate(won):
            a = f32(f32(f32(f32(k - f32(f32(n - 1) * 0.5)) * f32(PI)) * 30) / 180)
            d = OUTER.r * 0.65
            p.spot = [sinf(a) * d, 0, cosf(a) * d]
            p.spot[1] += RADIUS - height_at(p.spot)
        return True

    def cpu(self, p):
        rec = p.rec or CPU_RECS[12]
        if p.state != 3:
            return [0, 0, False]
        rxz = sqrtf(p.pos[0] * p.pos[0] + p.pos[2] * p.pos[2])
        out = rxz / INNER.r
        near = self.threat(p, bit(rec, 31), bit(rec, 30), 0.08)
        press = (self.u() < rec["wrong"]) != near
        target = None
        if out < rec["near"]:
            if p.cool > 0:
                th = self.nearest(p, bit(rec, 29), bit(rec, 28), 0.3)
                if th and p.pos[0] * p.pos[0] + p.pos[2] * p.pos[2] > 0.01:
                    a = wrap(wrap(f32(f32(atan2(th.pos[0] - p.pos[0], th.pos[2] - p.pos[2])) + f32(PI))) * (1 - 0) + 0)
                    return [f32(sinf(a) * rec["power"]), f32(-cosf(a) * rec["power"]), press]
            else:
                target = self.nearest(p, bit(rec, 25), bit(rec, 24), 0.3) or self.nearest(p, bit(rec, 23), bit(rec, 22), 0.02)
        aim, aim_v = [0, 0, 0], [0, 0, 0]
        if target:
            aim = add(target.pos, set_length([target.pos[0], 0, target.pos[2]], -RADIUS))
            aim_v = target.vel
        x, y = steer(p, aim, aim_v, rec["power"])
        return [x, y, press]

    def drive(self, p):
        p.pos = add(p.pos, scale(sub(p.spot, p.pos), f32(0.02)))
        x, y = steer(p, p.spot, [0, 0, 0], f32(250))
        return [x, y, False]

    def minds(self, p, q, humans, cpus):
        return q.z != p.z and q.state == 3 and (humans or q.cpu) and (cpus or not q.cpu)

    def threat(self, p, humans, cpus, T):
        if not humans and not cpus or p.state != 3:
            return False
        for q in self.p:
            if self.minds(p, q, humans, cpus) and closest(p, q, T) < RADIUS + RADIUS + 3:
                return True
        return False

    def nearest(self, p, humans, cpus, T):
        if not humans and not cpus or p.state != 3:
            return None
        best, who = 10000000, None
        for q in self.p:
            if not self.minds(p, q, humans, cpus):
                continue
            d = closest(p, q, T)
            if d < best:
                best, who = d, q
        return who

    def save(self):
        return dict(t=self.t, end=self.end, over=self.over, seed=self.seed, first=self.first, p=[p.copy() for p in self.p])

    def load(self, s):
        self.t, self.end, self.over, self.seed, self.first = s["t"], s["end"], s["over"], s["seed"], s["first"]
        self.p = [p.copy() for p in s["p"]]
        self.events = []

    @property
    def scores(self):
        return [p.score for p in self.p]

    @property
    def places(self):
        return [None if p.empty else 1 + sum(1 for q in self.p if q.score > p.score and not q.empty) for p in self.p]

    def digest(self):
        parts = [self.t, self.seed, self.first, -1 if self.end is None else self.end, int(self.over)]
        for p in self.p:
            parts += [_hex(v) for v in p.pos] + [_hex(v) for v in p.vel] + [_hex(v) for v in p.w]
            parts += [_hex(p.r), _hex(p.m), _hex(p.I), _hex(p.max_v), p.state, int(p.on), int(p.solid), _hex(p.hold),
                      _hex(p.spin), _hex(p.cool), _hex(p.touch), _hex(p.recent), int(p.hard), int(p.landed), p.score,
                      p.falls, p.hit_by, ".".join(str(v) for v in p.victims), _hex(p.angle), int(p.auto)]
            parts += [_hex(v) for v in p.spot] + [_hex(v) for v in p.stick]
        return ",".join(str(v) for v in parts)


def _hex(v):
    return struct.pack(">d", float(v) + 0).hex()  # (-0 as 0)


def unpack(x):
    """A pad's stick (each -64 to 64): x is (sx + 64) | (sy + 64) << 8."""
    return (x & 0xFF) - 64, ((x >> 8) & 0xFF) - 64


class Round:
    """One round's world on the server, run as far as the pads that can still
    come in allow."""

    def __init__(self, seed, level="normal", cpus=(False, True, True, True), empty=None):
        self.cpus = list(cpus)
        self.empty = [bool(e) for e in empty] if empty else [False] * SEATS  # (no one at all: online, the CPUs off)
        self.world = World(seed, level, self.cpus, self.empty)
        self.pads = [[] for _ in range(SEATS)]  # each person's pad changes: [frame, stick, A]
        self.at = [0] * SEATS  # where each one's list has been read to
        self.done = None  # how it ended, once decided: dict(f, s)
        self.end = (START + TIME_LIMIT + AFTER) / FPS  # s after GO it's over (sooner once decided)

    def pad_at(self, s, t):
        """Seat s's [stick x, stick y, A] on frame t (frames are run in order)."""
        lst, i = self.pads[s], self.at[s]
        x, a = (lst[i - 1][1] if i else 0x4040), False
        while i < len(lst) and lst[i][0] <= t:
            x = lst[i][1]
            a = a or (lst[i][0] == t and lst[i][2] == 1)
            i += 1
        self.at[s] = i
        sx, sy = unpack(x)
        return [sx, sy, a]

    def run_to(self, t):
        w = self.world
        while w.end is None and w.t < t:
            f = w.t + 1
            w.step(f, [None if self.cpus[s] or self.empty[s] else self.pad_at(s, f) for s in range(SEATS)])
            w.events = []

    def pad(self, s, f, x, a, now, allow):
        """Seat s's stick went to x ((sx + 64) | (sy + 64) << 8, each -64 to 64)
        and A if a, on frame f of the play (which starts START frames after GO;
        its device's word); it came in at round time now (s from GO), and may be
        at most allow s old. Returns the frame it counts on, or None."""
        if self.cpus[s] or self.empty[s] or self.done or type(f) is not int or type(x) is not int or a not in (0, 1):
            return None
        if not 0 <= x <= 0x8080 or (x & 0xFF) > 128:
            return None
        here = int(now * FPS) - START  # (the play's frames: from a step after GO)
        f = min(max(f, here - int(allow * FPS)), here + 1 + AHEAD)  # (no older than the way here allows; not far ahead)
        f = max(f, self.world.t + 1)  # (not what's been run)
        if self.pads[s]:
            last = self.pads[s][-1]
            f = max(f, last[0] + (1 if a and last[2] and last[0] >= f else 0))  # (in order; one A a frame)
        self.pads[s].append([f, x, a])
        return f

    def wire(self):
        """What a device needs to rejoin the round: how it ended (once decided) and the people's pads so far."""
        return dict(tt=dict(done=self.done, pads=[None if self.cpus[s] or self.empty[s] else [list(e) for e in self.pads[s]]
                                                  for s in range(SEATS)]))

    def result(self):
        return self.done

    @property
    def scores(self):
        """Each seat's points."""
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
        safe = int(now * FPS) - START - int(allow * FPS) - 1
        if safe < 0:
            return None
        self.run_to(min(safe, TIME_LIMIT))
        if self.world.end is not None:
            self.done = dict(f=self.world.end, s=self.world.scores)
            self.end = (START + self.world.end + AFTER) / FPS
            return self.done
        return None

    def next_settle(self, allow):
        """When (round time, s) to look again: anyone can score on any frame, so every half second."""
        return None if self.done else (START + self.world.t + 1 + FPS // 2) / FPS + allow
