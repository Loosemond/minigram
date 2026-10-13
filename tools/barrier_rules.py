"""The rules of a Barrier Ball round, for the rooms server (tools/rooms.py).

The same world as web/minigames/src/barrier/rules.js, which has the rules and
where each number comes from in the game's code: keep the two the same, line
for line (tools/test_rooms.py and the browser tests check they run alike, to
the last bit). The four Mr. Mime share one court, so the server runs it from
everyone's pads (the people's: the devices send each change, a "pad" with the
frame it's for; the CPUs think in it as on every device), and so knows each
one's points at the end.
"""
import math
import struct

SEATS = 4
FPS = 30
LEVELS = {"easy": 1, "normal": 2, "hard": 3}

TIME = 60 * FPS
GOAL = 5
BALL_SPEED = 4
SMASH_DEC = 1
AHEAD = 4  # frames ahead of now a pad may be for (a device sends its player's up to 3 ahead: src/lag.js leadFor)

STEPS = 3
AFTER = 8  # the results 8 frames after the end (0x863024A8; a ball going puts it back a frame)
HURRY = 30 * FPS
MORE_AFTER = 3 * FPS
MOST_BALLS = 3
BALL_R = 21
COURT = 250
GONE = 350
HUB = 180
STAND = 220
BARRIER = 60
BARRIER_OUT = [385.8, 536.54, 544.73, 536.77, 522.505]
SMASH_FOR = 31
SERVE_SPIN = 1365.3125
SERVE_SPEED = 2.3
S = 0.70710677

CPU = {1: (4.8, 0.83, 0.4, 0.25), 2: (5.4, 0.93, 0.7, 5), 3: (6, 0.98, 1, 1)}

SEAT = [  # the angle, the lane's slope, the barrier's way along, its normal
    (45, 1, (-S, -S), (S, -S)),
    (315, -1, (-S, S), (-S, -S)),
    (135, -1, (S, -S), (S, S)),
    (225, 1, (S, S), (-S, S)),
]
WEDGE = [(0, 0), (-1000, 1000), (1000, 1000), (0, 0), (-1000, -1000), (-1000, 1000),
         (0, 0), (1000, -1000), (-1000, -1000), (0, 0), (1000, 1000), (1000, -1000)]
TIPS = [(0, HUB), (-HUB, 0), (0, -HUB), (HUB, 0)]
VERTS = [(x + TIPS[i // 3][0], y + TIPS[i // 3][1]) for i, (x, y) in enumerate(WEDGE)]
POSTS = [(0, (0, -1)), (3, (1, 0)), (6, (0, 1)), (9, (-1, 0))]

U = 4294967296.0

# The latest the play can end
LONGEST = TIME + 1


def level_code(level, cpus):
    return LEVELS.get(level, 2) if any(cpus) else 1


def norm(x, y):
    d = math.sqrt(y * y + x * x)
    return (x / d, y / d) if d != 0 else (x, y)


def meet(px, py, d1x, d1y, qx, qy, d2x, d2y):
    a, b = d1y * d2x, d1x * d2y
    if a == b:
        return None
    s = (d1y * (px - qx) + d1x * (qy - py)) / (a - b)
    t = (d2x * (py - qy) + d2y * (qx - px)) / (b - a)
    return t, s


def apart(px, py, qx, qy, dx, dy):
    ex, ey, l2 = qx - px, qy - py, dx * dx + dy * dy
    ox, oy = ex, ey
    if l2 != 0:
        t = -(dx * ex + ey * dy) / l2
        ox = dx * t + ex
        oy = dy * t + ey
    return math.sqrt(ox * ox + oy * oy)


def fround(v):
    return struct.unpack(">f", struct.pack(">f", v))[0]


def sine(i):
    q, x = (i >> 10) & 3, (i & 1023) * (math.pi / 2048)
    x2 = x * x
    term = x if q % 2 == 0 else 1.0
    total = term
    for k in range(1, 10):
        term = (-term * x2) / (2 * k * (2 * k + 1) if q % 2 == 0 else (2 * k - 1) * (2 * k))
        total += term
    return fround((0.0 if total == 0 else -total) if q >= 2 else total)


def s16(v):
    return ((v & 0xFFFF) ^ 0x8000) - 0x8000


EDGES = []
for _a, _b in [(0, 1), (2, 0), (3, 4), (5, 3), (6, 7), (8, 6), (9, 10), (11, 9)]:
    EDGES.append((_a, _b, norm(-(VERTS[_b][1] - VERTS[_a][1]), VERTS[_b][0] - VERTS[_a][0])))


class Mime:
    __slots__ = ("z", "human", "x", "y", "prevx", "prevy", "icpt", "xmin", "xmax", "timer", "smash", "moving",
                 "wander", "target", "aimSide", "score")

    def copy(self):
        o = Mime.__new__(Mime)
        for k in Mime.__slots__:
            setattr(o, k, getattr(self, k))
        return o


class Ball:
    __slots__ = ("id", "x", "y", "vx", "vy", "rot", "scale", "timer", "serving", "slow", "out", "smashed", "alpha",
                 "lastx", "lasty", "dx", "dy", "spinx", "spiny", "smashV", "owner", "pending")

    def copy(self):
        o = Ball.__new__(Ball)
        for k in Ball.__slots__:
            setattr(o, k, getattr(self, k))
        return o


class Bar:
    __slots__ = ("ax", "ay", "bx", "by", "abx", "aby")


class World:
    """One round's world (rules.js's World)."""

    def __init__(self, seed, level="normal", cpus=(False, True, True, True)):
        self.level = level_code(level, cpus)
        self.seed = seed & 0xFFFFFFFF
        self.t = -1
        self.end = None
        self.hand_over = None  # the frame the results came up on
        self.ids = 0
        self.events = []
        self.time = TIME
        self.clock = 0
        self.want = 1
        self.balls = []
        half = (2 * HUB * S - 2 * BARRIER) * S * 0.5
        self.m = []
        for z, (_, slope, _, n) in enumerate(SEAT):
            m = Mime()
            x, y = -n[0] * STAND, -n[1] * STAND
            m.z, m.human, m.x, m.y, m.prevx, m.prevy = z, not cpus[z], x, y, x, y
            m.icpt, m.xmin, m.xmax = y - slope * x, x - half, x + half
            m.timer, m.smash, m.moving, m.wander, m.target, m.aimSide, m.score = 0, False, False, True, 0.5, 0, 0
            self.m.append(m)
        for m in self.m:
            m.aimSide = self.u() - 0.5

    def rnd(self):
        self.seed = (self.seed * 1664525 + 1013904223) & 0xFFFFFFFF
        return self.seed

    def u(self):
        return self.rnd() / U

    def step(self, t, pads):
        self.t = t
        playing = self.end is None
        if playing and self.time > 0:
            self.clock += 1
            if self.clock > MORE_AFTER:
                self.want = min(self.want + 1, MOST_BALLS)
                self.clock = 0
            if len(self.balls) < self.want:
                self.add_ball()
        if not playing:
            self.clock += 1
            if self.clock == AFTER and self.hand_over is None:
                self.hand_over = t
        for _ in range(STEPS):
            self.substep(pads, playing)
        if not playing:
            return
        self.time -= 1
        if self.time < 0:
            self.time = 0
            self.clock = 0
            self.end = t
        for m in self.m:
            if m.score >= GOAL:
                self.clock = 0
                self.end = t
        if self.time % FPS == FPS - 1 and math.trunc((self.time + FPS - 1) / FPS) < 4:
            self.events.append(("count", -1))

    def substep(self, pads, playing):
        for m in self.m:
            if playing:
                self.mime(m, pads[m.z] if m.z < len(pads) else None)
            m.timer += 1
        for b in list(self.balls):
            self.ball(b, playing)
            b.timer += 1
        for m in self.m:
            self.barrier(m, playing)

    # ---- a Mr. Mime ----
    def mime(self, m, pad):
        slope = SEAT[m.z][1]
        if m.human:
            x, a = pad if pad else (0, False)
        else:
            x, a = self.cpu(m)
        x = max(-64, min(64, x))
        m.prevx = m.x
        m.prevy = m.y
        m.x += x * 0.09
        if m.x < m.xmin:
            m.x = m.xmin
        if m.xmax < m.x:
            m.x = m.xmax
        m.y = slope * m.x + m.icpt
        if abs(m.x - m.prevx) > 4.032:
            if not m.moving:
                self.events.append(("swish", m.z))
                m.moving = True
        else:
            m.moving = False
        if m.smash:
            if m.timer >= SMASH_FOR:
                m.smash = False
        elif a:
            m.timer = 0
            m.smash = True
            self.events.append(("smash", m.z))

    def barrier_at(self, m):
        out = BARRIER_OUT[0]
        if m.smash and m.timer < 11:
            lo, k = m.timer // 3, (m.timer % 3) / 3
            out = BARRIER_OUT[lo + 1] * k + BARRIER_OUT[lo] * (1 - k)
        n = SEAT[m.z][3]
        return m.x + n[0] * out * 0.15, m.y + n[1] * out * 0.15

    # ---- a CPU ----
    def cpu(self, m):
        _, decay, smash, _ = CPU[self.level]
        reach = CPU[self.level][0]
        for _ in range(len(self.balls) - 1):
            reach *= decay
        aim = self.reckon(m, reach)
        if aim:
            x = math.trunc(aim[0] - m.x)
            return x, self.u() < smash and aim[2] < 42
        return self.wander(m), False

    def reckon(self, m, reach):
        _, _, d_, n = SEAT[m.z]
        ahead = CPU[self.level][3]
        best, out = 3.4028234663852886e38, None
        for b in self.balls:
            lx, ly = b.vx + b.spinx * ahead, b.vy + b.spiny * ahead
            if not (n[0] * lx + n[1] * ly < 0):
                continue
            cx, cy = m.x + n[0] * 50.54625, m.y + n[1] * 50.54625
            d = apart(b.x, b.y, cx, cy, d_[0], d_[1])
            speed = math.sqrt(b.vx * b.vx + b.vy * b.vy)
            at = meet(cx, cy, d_[0], d_[1], b.lastx, b.lasty, lx, ly)
            if not at:
                continue
            along, when = at
            if not (b.smashV + speed <= reach or when < 0):
                continue
            w = HUB * 1.4142135
            if not ((-w < along and along < w) or d < 63):
                continue
            px, py = b.lastx + lx * when, b.lasty + ly * when
            if speed == 0:
                continue
            q = math.sqrt(px * px + py * py) / speed
            if q < best:
                best, out = q, [px, py, d]
        if out:
            k = -n[0] * (101.0925 * 0.5) + d_[0] * 120 * m.aimSide
            out[0] += k
            out[1] += k
        return out

    def wander(self, m):
        if m.wander:
            m.target = self.u() * (m.xmax - m.xmin) + m.xmin
            m.wander = False
            return 0
        d = math.trunc(m.target - m.x)
        if abs(d) < 5:
            if self.rnd() % 101 < 5:
                m.wander = True
            return d
        return 16 if d > 0 else -16

    # ---- a ball ----
    def add_ball(self):
        b = Ball()
        self.ids += 1
        b.id, b.x, b.y, b.vx, b.vy, b.rot, b.scale = self.ids, 0, 0, 0, 0, -0x2000, 0
        b.timer = math.trunc((self.u() + 2) * -48)
        b.serving, b.slow, b.out, b.smashed, b.alpha = True, False, False, False, 255
        b.lastx = b.lasty = b.dx = b.dy = b.spinx = b.spiny = b.smashV = 0
        b.owner = b.pending = -1
        self.balls.append(b)
        self.events.append(("spawn", -1, b.id))

    def ball(self, b, playing):
        if b.serving:
            self.serve(b, playing)
        else:
            self.fly(b, playing, b.slow)

    def serve(self, b, playing):
        if b.timer > 0:
            if playing:
                i = ((b.rot + 0x3FFF) & 0xFFFF) >> 4
                b.vx = sine(i + 1024) * SERVE_SPEED
                b.vy = sine(i) * SERVE_SPEED
                b.serving = False
                self.events.append(("serve", -1, b.id))
            else:
                b.vx = b.vy = 0
            return
        if not playing:
            return
        deg = b.rot * 0.005493248
        if -5 < deg < 5:
            b.rot = 0x38E
        if 85 < deg < 95:
            b.rot = 0x438E
        if -95 < deg < -85:
            b.rot = -0x3C72
        b.rot = s16(math.trunc(b.rot + SERVE_SPIN))
        b.scale = min(b.scale + 0.014583333, 0.7)

    def fly(self, b, playing, slow):
        b.lastx = b.x
        b.lasty = b.y
        speed = math.sqrt(b.vx * b.vx + b.vy * b.vy) * (0.975 if slow else 1)
        if speed > 0:
            b.vx /= speed
            b.vy /= speed
        b.smashV *= SMASH_DEC * 0.975 if slow else SMASH_DEC
        sx, sy = b.vx * b.smashV, b.vy * b.smashV
        b.spinx *= 0.998
        b.spiny *= 0.998
        b.vx += b.spinx
        b.vy += b.spiny
        b.vx, b.vy = norm(b.vx, b.vy)
        b.vx *= speed
        b.vy *= speed
        b.rot = s16(math.trunc(b.rot + (b.vx * b.spiny - b.spinx * b.vy) * 50000))
        b.x += b.vx + sx
        b.y += b.vy + sy
        self.walls(b, playing)
        if not slow:
            if b.out:
                b.alpha = b.alpha - 16 if b.alpha >= 17 else 0
                if b.x < -GONE or b.x > GONE or b.y < -GONE or b.y > GONE or b.alpha == 0:
                    self.balls.remove(b)
                    self.want = 1
                    self.clock = 0
            elif b.x < -COURT or b.x > COURT or b.y < -COURT or b.y > COURT:  # (after the end too: 0x86306A04)
                self.goal(b)
                b.out = True
                b.spinx = 0
                b.spiny = 0
            if not playing:
                b.slow = True
            if b.pending != -1 and in_hub(b.x, b.y):
                b.owner = b.pending
                b.pending = -1
        b.dx = b.x - b.lastx
        b.dy = b.y - b.lasty

    def goal(self, b):
        q = (0 if b.y > 0 else 2) if b.x <= 0 else (1 if b.y > 0 else 3)
        o = b.owner
        self.m[q].score -= 1
        if o != -1 and o != q:
            self.m[o].score += 1
        if self.m[q].score < 0:
            self.m[q].score = 0
        self.events.append(("goal", q, b.id, o))

    def walls(self, b, playing):
        rx, ry = b.x - b.lastx, b.y - b.lasty
        hit = False
        for a, e, n in EDGES:
            ax, ay = VERTS[a]
            bx, by = VERTS[e]
            r = sweep(b, rx, ry, ax, ay, bx - ax, by - ay, n[0], n[1])
            if not r:
                continue
            hit = True
            b.x += n[0] * r[1]
            b.y += n[1] * r[1]
            self.bounce(b, n[0], n[1], playing)
        if hit:
            return
        for v, (nx, ny) in POSTS:
            ox, oy = b.x - VERTS[v][0], b.y - VERTS[v][1]
            d = math.sqrt(ox * ox + oy * oy)
            if not d < BALL_R:
                continue
            if d == 0:
                ox, oy = nx, ny
            else:
                ox, oy = norm(ox, oy)
            depth = BALL_R - d
            if ox * nx + oy * ny >= 0:
                b.x += ox * depth
                b.y += oy * depth
            else:
                b.x -= ox * depth
                b.y -= ox * depth
            self.bounce(b, ox, oy, playing)

    def bounce(self, b, nx, ny, playing):
        jx = self.u() * 0.005 + nx - 0.0025
        jy = self.u() * 0.005 + ny - 0.0025
        k = (b.vx * nx + b.vy * ny) * -2
        b.vx = b.vx + jx * k
        b.vy = b.vy + jy * k
        self.speed_up(b)
        if playing:
            self.events.append(("wall", -1, b.id))

    def speed_up(self, b):
        s = math.sqrt(b.vx * b.vx + b.vy * b.vy)
        if s > 0:
            k = s + 1
            b.vx /= s
            b.vy /= s
            if BALL_SPEED < k:
                k = BALL_SPEED
            b.vx *= k
            b.vy *= k

    # ---- the balls off a barrier ----
    def barrier(self, m, playing):
        d_ = SEAT[m.z][2]
        cx, cy = self.barrier_at(m)
        bar = Bar()
        bar.ax, bar.ay = cx - d_[0] * BARRIER, cy - d_[1] * BARRIER
        bar.bx, bar.by = cx + d_[0] * BARRIER, cy + d_[1] * BARRIER
        bar.abx, bar.aby = bar.bx - bar.ax, bar.by - bar.ay
        for b in self.balls:
            px, py = b.x, b.y
            if not self.face(m, b, bar, playing):
                self.ends(m, b, bar, playing)
            self.body(m, b, px, py, cx, cy, bar)

    def face(self, m, b, bar, playing):
        n = SEAT[m.z][3]
        lx, ly = b.lastx, b.lasty
        front = (bar.bx - lx) * (bar.ay - ly) <= (bar.ax - lx) * (bar.by - ly)
        nx, ny = (n[0], n[1]) if front else (-n[0], -n[1])
        r = sweep(b, b.dx, b.dy, bar.ax, bar.ay, bar.abx, bar.aby, nx, ny)
        if not r:
            return False
        b.x += nx * r[1]
        b.y += ny * r[1]
        self.hit(m, b, not front, bar, r[0], playing)
        return True

    def ends(self, m, b, bar, playing):
        n = SEAT[m.z][3]
        for t, ex, ey, fx, fy in ((0, bar.ax, bar.ay, -bar.abx, -bar.aby), (1, bar.bx, bar.by, bar.abx, bar.aby)):
            ox, oy = b.x - ex, b.y - ey
            d = math.sqrt(ox * ox + oy * oy)
            if not d < BALL_R:
                continue
            if d == 0:
                ox, oy = fx, fy
            ox, oy = norm(ox, oy)
            b.x += ox * (BALL_R - d)
            b.y += oy * (BALL_R - d)
            self.hit(m, b, ox * n[0] + oy * n[1] < 0, bar, t, playing)
            return

    def hit(self, m, b, back, bar, t, playing):
        n = SEAT[m.z][3]
        k = t * 1.3 - 0.15
        tx, ty = bar.ax + bar.abx * k, bar.ay + bar.aby * k
        speed = math.sqrt(b.vx * b.vx + b.vy * b.vy)
        if back:
            dx, dy = tx - (2 * (bar.ax + bar.abx * 0.5) - m.x), ty - (2 * (bar.ay + bar.aby * 0.5) - m.y)
        else:
            dx, dy = tx - m.x, ty - m.y
        dx, dy = norm(dx, dy)
        v = speed + 1
        if BALL_SPEED < v:
            v = BALL_SPEED
        b.vx = dx * v
        b.vy = dy * v
        b.spinx = ((m.prevx - m.x + n[0]) / 8.14587) * 0.06
        b.spiny = ((m.prevy - m.y + n[1]) / 8.14587) * 0.06
        if m.smash and 3 <= m.timer < 24:
            b.smashV, b.smashed, b.timer = 2, True, 0
        else:
            b.smashV *= 0.5
            b.smashed = False
        m.aimSide = (self.u() - 0.5) * 0.5
        if not back:
            b.pending = m.z
        if playing:
            c = math.sqrt(b.spinx * b.spinx + b.spiny * b.spiny)
            kind = "hit3" if c > 0.056999996 else "hitSmash" if m.smash else "hit2" if c > 0.03 else "hit1" if c > 0.012 else "hit"
            self.events.append((kind, m.z, b.id))

    def body(self, m, b, px, py, cx, cy, bar):
        n = SEAT[m.z][3]
        ux, uy = norm(bar.abx, bar.aby)
        at = meet(px, py, ux, uy, cx, cy, -n[0], -n[1])
        if not at:
            return
        side, behind = at
        if not (behind > 21 and behind < 85 and side > -22 and side < 22):
            return
        speed = math.sqrt(b.vx * b.vx + b.vy * b.vy)
        k = side - 22 if side > 0 else side + 22
        b.x += ux * k
        b.y += uy * k
        dx, dy = norm(ux + 2 * -n[0], uy + 2 * -n[1])
        b.vx = dx * speed
        b.vy = dy * speed

    # ---- for the server ----
    @property
    def scores(self):
        return [m.score for m in self.m]

    def digest(self):
        """rules.js's digest(), to check the two run alike."""
        parts = [self.t, self.seed, self.time, self.clock, self.want, self.ids, -1 if self.end is None else self.end]
        for m in self.m:
            parts += [_hex(m.x), _hex(m.y), m.timer, int(m.smash), int(m.moving), int(m.wander), _hex(m.target),
                      _hex(m.aimSide), m.score]
        for b in self.balls:
            parts += [b.id, _hex(b.x), _hex(b.y), _hex(b.vx), _hex(b.vy), b.rot, _hex(b.scale), b.timer, int(b.serving),
                      int(b.slow), int(b.out), b.alpha, _hex(b.spinx), _hex(b.spiny), _hex(b.smashV), b.owner, b.pending]
        return ",".join(str(p) for p in parts)


def sweep(b, rx, ry, ax, ay, abx, aby, nx, ny):
    qx, qy = ax + nx * BALL_R, ay + ny * BALL_R
    at = meet(b.x, b.y, rx, ry, qx, qy, abx, aby)
    if at and at[0] > 0 and at[0] < 1 and at[1] > 0 and at[1] < 1:
        to = meet(b.x, b.y, nx, ny, qx, qy, abx, aby)
        return to and (to[1], to[0])
    on = meet(b.x, b.y, nx, ny, ax, ay, abx, aby)
    if not on:
        return None
    d = -on[0]
    if not (d > -BALL_R and d < BALL_R and on[1] > 0 and on[1] < 1):
        return None
    return on[1], (BALL_R - d if d > 0 else d + BALL_R)


def in_hub(px, py):
    ax, ay, bx, by, cx, cy, dx, dy = 0, HUB, -HUB, 0, 0, -HUB, HUB, 0
    f0, f2 = (ax - px) * (by - py), (bx - px) * (ay - py)
    e1 = (bx - px) * (cy - py) - (cx - px) * (by - py)
    e2 = (cx - px) * (dy - py) - (dx - px) * (cy - py)
    e3 = (dx - px) * (ay - py) - (ax - px) * (dy - py)
    return (f2 <= f0 and e1 >= 0 and e2 >= 0 and e3 >= 0) or (f0 - f2 <= 0 and e1 <= 0 and e2 <= 0 and e3 <= 0)


def _hex(v):
    return struct.pack(">d", v).hex()


class Round:
    """One round's world on the server, run as far as the pads that can still
    come in allow."""

    def __init__(self, seed, level="normal", cpus=(False, True, True, True)):
        self.cpus = list(cpus)
        self.world = World(seed, level, self.cpus)
        self.pads = [[] for _ in range(SEATS)]  # each person's pad changes: [frame, stick x, A]
        self.at = [0] * SEATS  # where each one's list has been read to
        self.done = None  # how it ended, once decided: dict(f, p)
        self.end = (LONGEST + AFTER + 1) / FPS  # s after GO it's over: the results (sooner once decided)

    def pad_at(self, s, t):
        """Seat s's [stick x, A] on frame t (frames are run in order)."""
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
            w.step(f, [None if self.cpus[s] else self.pad_at(s, f) for s in range(SEATS)])
            w.events = []

    def pad(self, s, f, x, a, now, allow):
        """Seat s's pad went to stick x (and A if a) on frame f (its device's
        word); it came in at round time now, and may be at most allow s old.
        Returns the frame it counts on, or None."""
        if self.cpus[s] or self.done or type(f) is not int or type(x) is not int or a not in (0, 1):
            return None
        if not -64 <= x <= 64:
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
        return dict(bb=dict(done=self.done, pads=[None if self.cpus[s] else [list(e) for e in self.pads[s]]
                                                  for s in range(SEATS)]))

    def result(self):
        return self.done

    @property
    def scores(self):
        """Each seat's points (as far as the world's been run)."""
        return self.done["p"] if self.done else self.world.scores

    def settle(self, now, allow):
        """Run the world as far as no pad still on its way could change; once
        it's ended, how: dict(f, p), or None."""
        if self.done:
            return None
        safe = int(now * FPS) - int(allow * FPS) - 1
        if safe < 0:
            return None
        self.run_to(min(safe, LONGEST))
        w = self.world
        if w.end is not None:
            # on to the results (no pad counts after the end): a goal in the first step after it still
            # counts, and they show the points then
            while w.hand_over is None:
                w.step(w.t + 1, [None] * SEATS)
                w.events = []
            self.done = dict(f=w.end, p=w.scores)
            self.end = w.hand_over / FPS
            return self.done
        return None

    def next_settle(self, allow):
        """When (round time, s) to look again: the play can end on any frame
        (someone's fifth point), so every half second."""
        return None if self.done else (self.world.t + 1 + FPS // 2) / FPS + allow
