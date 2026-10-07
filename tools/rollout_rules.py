"""The rules of a Rampage Rollout race, for the rooms server (tools/rooms.py).

The same world as web/minigames/src/rollout/rules.js, which has the rules and
where each number comes from in the game's code: keep the two the same, line
for line (tools/test_rooms.py and the browser tests check they run alike, to
the last bit). The four Donphan share one track, so the server runs it from
everyone's pads (the people's: the devices send each change, a "pad" with the
frame it's for; the CPUs think in it as on every device), and so knows who
came in when.
"""
import math
import struct

SEATS = 4
FPS = 30
LEVELS = {"easy": 1, "normal": 2, "hard": 3}

SPEED = 556.8 / 60
ACCELE = 51 / 60
LAPS = 9
ACCEL = (ACCELE * 0.22 * 60) / 60
TOP = [0.85, 0.9, 0.95, 1]
KNOCKED_SLOW = [0.9, 0.92, 0.95, 0.95]
DIZZY_FOR = [20, 14, 8, 8]
KNOCKED_FOR = 20

R = 23.2
INNER = (148, 92.5)
OUTER = (309.8, 254.3)
CORNER = (124.8, 69.3)
CLOUD_R = 30
CLOUD_FOR = (5, 175, 10)
START_FOR = 10
ROLL_FOR = 30
AHEAD = 4  # frames ahead of now a pad may be for (a device sends its player's up to 3 ahead: src/lag.js leadFor)
LONGEST = 200 * FPS
AFTER = 90  # frames from the end to the results (the last one in coasting to a stop)

UP, DOWN, LEFT, RIGHT, A = 8, 4, 2, 1, 0x8000
DIRS = [(UP, 0, -1, 0x7FFF), (DOWN, 0, 1, 0), (LEFT, -1, 0, 0xBFFF), (RIGHT, 1, 0, 0x3FFF)]
WAY = {d[0]: d for d in DIRS}
NOT = [UP | RIGHT, UP | LEFT, DOWN | LEFT, DOWN | RIGHT, UP, DOWN, RIGHT, LEFT]
ALONG = [(WAY[d][1], WAY[d][2]) for d in (DOWN, RIGHT, UP, LEFT, DOWN, UP, LEFT, RIGHT)]
CORNER_BIT = [1, 2, 8, 4]

DROP = [0.05, 0.1, 0.2, 0.5, 0.001, 0.01, 0.01, 0.01]
DROP_LEVEL = [0.2, 0.7, 1, 1]

U = 4294967296


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


BLOCK = [(-148, -92.5), (-148, 92.5), (148, 92.5), (148, -92.5)]


class Edge:
    def __init__(self, a, b, turn):
        self.a = a
        self.dx, self.dz = BLOCK[b][0] - BLOCK[a][0], BLOCK[b][1] - BLOCK[a][1]
        self.n = norm(-self.dz, self.dx)
        self.turn = turn


EDGES = [Edge(0, 1, DOWN), Edge(1, 2, RIGHT), Edge(2, 3, UP), Edge(3, 0, LEFT)]
POSTS = [(i, norm(p[0], p[1])) for i, p in enumerate(BLOCK)]


def _atan_table():
    out = []
    for i in range(1025):
        x, k = i / 1024, 1
        for _ in range(2):
            x = x / (1 + math.sqrt(1 + x * x))
            k *= 2
        term, total = x, x
        x2 = x * x
        for n in range(1, 12):
            term = -term * x2
            total += term / (2 * n + 1)
        v = ((total * k) / (2 * 3.141592653589793)) * 65536
        out.append(int(math.floor(v + 0.5)) if v >= 0 else -int(math.floor(-v + 0.5)))
    return out


ATAN = _atan_table()


def _look(y, x):
    return ATAN[0] if x == 0 else ATAN[int((y / x) * 1024 + 0.5)]


def s16(v):
    return ((v & 0xFFFF) ^ 0x8000) - 0x8000


def angle(a, b):
    if b >= 0:
        if a >= 0:
            v = _look(b, a) if b <= a else 0x4000 - _look(a, b)
        else:
            a = -a
            v = _look(a, b) + 0x4000 if a < b else 0x8000 - _look(b, a)
    else:
        b = -b
        if a < 0:
            a = -a
            v = _look(b, a) + 0x8000 if b <= a else 0xC000 - _look(a, b)
        else:
            v = _look(a, b) + 0xC000 if a < b else -_look(b, a)
    return s16(v)


def trunc(v):
    return int(v)  # (towards zero, as JS's Math.trunc)


class Donphan:
    __slots__ = ("z", "human", "slot", "x", "h", "y", "vx", "vz", "vh", "rot", "timer", "start", "tumble",
                 "knocked", "bounce", "ready", "drop", "done", "won", "fin", "corners", "seg", "laps", "progress",
                 "rank", "speed", "boost", "roll", "stun", "wait", "clouds", "out", "target", "angle",
                 "notice", "lane", "px", "ph", "py")

    def copy(self):
        o = Donphan.__new__(Donphan)
        for k in Donphan.__slots__:
            setattr(o, k, getattr(self, k))
        return o


class Cloud:
    __slots__ = ("id", "owner", "x", "h", "y", "timer", "phase", "frame")

    def copy(self):
        o = Cloud.__new__(Cloud)
        for k in Cloud.__slots__:
            setattr(o, k, getattr(self, k))
        return o


class World:
    """One race's world: step() runs a frame from the people's pads."""

    def __init__(self, seed, level="normal", cpus=(False, True, True, True)):
        self.level = level_code(level, cpus)
        self.seed = seed & 0xFFFFFFFF
        self.t = -1
        self.end = None
        self.ids = 0
        self.clouds = []
        self.events = []
        slots = [0, 1, 2, 3]
        if (self.rnd() % 101) * 4 != 0:
            k = 0
            while True:
                i, j = self.rnd() & 3, self.rnd() & 3
                slots[i], slots[j] = slots[j], slots[i]
                k += 1
                if not k < (self.rnd() % 101) * 4:
                    break
        self.d = []
        for z, slot in enumerate(slots):
            d = Donphan()
            d.z, d.human, d.slot = z, not cpus[z], slot
            d.x, d.h, d.y = slot * 37.12 + 116, 0, slot * 41.76 + -254.3
            d.vx, d.vz, d.vh, d.rot, d.timer = -1, 0, 0, -0x4001, 0
            d.start, d.tumble, d.knocked, d.bounce, d.ready, d.drop, d.done, d.won, d.fin = (
                True, False, False, False, False, False, False, False, None)
            d.corners, d.seg, d.laps, d.progress, d.rank = 0, 0, LAPS, 0, z
            d.speed, d.boost, d.roll, d.stun, d.wait, d.clouds, d.out = 20, 0, 0, 0, 0, 0, 0
            d.target, d.angle, d.notice, d.lane = -16385, -16385, 0, 0
            d.px, d.ph, d.py = 0, 0, 0
            self.d.append(d)
        for d in self.d:
            d.lane = self.lane_roll()
            d.notice = self.notice_roll()
        for _ in range(20):
            self.run_in()

    def rnd(self):
        self.seed = (self.seed * 1664525 + 1013904223) & 0xFFFFFFFF
        return self.seed

    def u(self):
        return self.rnd() / U

    def lane_roll(self):
        return 2 * ((2 * self.u() - 1) * R) if self.level == 1 else 0

    def notice_roll(self):
        k = 0
        if self.level == 1:
            k = self.u() * 0.2 + 0.3
        elif self.level == 2:
            k = self.u() * 0.3 + 0.2
        return trunc(175 * k)

    def run_in(self):
        for d in self.d:
            d.speed *= 0.8
            d.x += d.vx * d.speed
            if d.speed < 1:
                d.speed = 0

    def step(self, t, pads):
        self.t = t
        if self.end is not None:
            self.coast()
            return
        for d in self.d:
            self.segment(d)
            if d.human:
                p = pads[d.z] if d.z < len(pads) and pads[d.z] is not None else (0, False)
                dpad, a = p
                if dpad & 16:
                    d.start = False
                inp = ((dpad & 15) << 8) | (A if a else 0)
            else:
                inp = self.cpu(d)
            self.donphan(d, inp)
            d.timer += 1
        self.bumps()
        lapped = []
        for d in self.d:
            d.x += d.px
            d.h += d.ph
            d.y += d.py
            d.px, d.ph, d.py = 0, 0, 0
            ax, ay = ALONG[d.seg]
            f = angle(d.x + ax * R, -(d.y + ay * R)) / 65535 - 0.25
            if f < 0:
                f += 1
            if f > 1:
                f -= 1
            if f < 0.25 and d.corners == 15:
                d.laps -= 1
                d.corners = 0
                d.notice = self.notice_roll()
                lapped.append(d)
            if not d.done:
                d.progress = LAPS - d.laps + f
        self.placings()
        for d in lapped:
            if d.laps > 0:
                d.clouds = min(3, d.clouds + d.rank)
            else:
                d.clouds = 0
            if d.rank == 0:
                self.events.append(["final" if d.laps == 1 else "lap" if d.laps >= 2 else "in", d.z])
        for c in list(self.clouds):
            self.cloud(c)
            c.timer += 1
        for d in self.d:
            self.walls(d)
        self.finish(t)

    def segment(self, d):
        was = d.seg
        if d.x <= -CORNER[0] and d.y <= -CORNER[1]:
            d.seg = 0
            d.corners |= CORNER_BIT[0]
        elif d.x <= -CORNER[0] and d.y >= CORNER[1]:
            d.seg = 1
            d.corners |= CORNER_BIT[1]
        elif d.x >= CORNER[0] and d.y >= CORNER[1]:
            d.seg = 2
            d.corners |= CORNER_BIT[2]
        elif d.x >= CORNER[0] and d.y <= -CORNER[1]:
            d.seg = 3
            d.corners |= CORNER_BIT[3]
        elif d.y <= -INNER[1]:
            d.seg = 6
        elif d.y >= INNER[1]:
            d.seg = 7
        elif d.x <= -INNER[0]:
            d.seg = 4
        elif d.x >= INNER[0]:
            d.seg = 5
        if d.seg != was:
            d.lane = self.lane_roll()

    def donphan(self, d, inp):
        if d.laps >= 2:
            d.roll -= 1
            if d.roll <= 0:
                d.roll = 0
        else:
            d.roll = 1
        if d.start:
            if START_FOR < d.timer:
                d.start = False
            elif inp & A:
                d.speed += SPEED * 0.8 * (1 - d.timer / START_FOR)
                d.start = False
                d.roll = ROLL_FOR
                self.events.append(["rocket", d.z])
        if d.bounce and 2 < d.timer:
            d.bounce = False
        if d.done:
            k = 0.97 - 0.025 * d.rank
            d.speed *= k
            d.boost *= k * 0.5
            inp = 0
            self.cloud_hits(d)
        else:
            self.turn(d, inp)
            if d.h <= 0:
                top = SPEED * TOP[d.rank]
                d.speed += ACCEL
                if top < d.speed:
                    d.speed = top
            d.boost *= 0.9
            if d.boost < SPEED * 0.9 * 0.1:
                d.boost = 0
        d.x += d.vx * (d.speed + d.boost)
        d.y += d.vz * (d.speed + d.boost)
        self.height(d)
        if self.knock(d):
            if d.tumble:
                d.stun -= 1
                if d.stun > 0:
                    if d.stun % 5 == 0:
                        self.events.append(["dizzy", d.z])
                    d.rot = s16(d.rot + 0x1FFF)
                    d.angle = d.rot
                    d.speed = 0
                else:
                    d.tumble = False
            else:
                diff = d.target - d.angle
                if diff > 32767:
                    diff = 65535 - diff
                if diff < -32767:
                    diff += 65535
                d.angle += diff * 0.5
                if d.angle < 0:
                    d.angle += 65535
                if d.angle > 65535:
                    d.angle -= 65535
                d.rot = s16(trunc(d.angle))
                self.cloud_hits(d)
        if d.clouds > 0 and not d.knocked and not d.tumble and d.h <= 0:
            d.ready = True
            if inp & A:
                d.wait = 0
                if d.laps >= 2:
                    d.boost = SPEED * 0.9 * 0.3
                else:
                    d.speed = SPEED
                    d.boost = SPEED * 0.9
                self.ids += 1
                c = Cloud()
                c.id, c.owner, c.x, c.h, c.y, c.timer, c.phase, c.frame = self.ids, d.z, d.x, d.h + R, d.y, 0, 0, 0
                self.clouds.append(c)
                d.out += 1
                d.timer = 0
                d.drop = True
                d.clouds -= 1
                self.events.append(["drop", d.z, self.ids])
        else:
            d.ready = False
        if d.drop and 8 < d.timer:
            d.drop = False

    def turn(self, d, inp):
        if d.tumble or d.bounce:
            inp = 0
        bits = (inp >> 8) & 15 & ~self.against(d) & ~NOT[d.seg]
        for dr in DIRS:
            if bits & dr[0]:
                if d.vx * dr[1] + d.vz * dr[2] >= 0:
                    d.target = dr[3]
                    d.vx = dr[1]
                    d.vz = dr[2]
                break

    def against(self, d):
        bits = 0
        x, y = d.x, d.y
        if x <= -OUTER[0]:
            bits = LEFT
        if x >= OUTER[0]:
            bits |= RIGHT
        if y <= -OUTER[1]:
            bits |= UP
        if y >= OUTER[1]:
            bits |= DOWN
        if x <= -INNER[0] and x >= -INNER[0] - R and -INNER[1] < y < INNER[1]:
            bits |= RIGHT
        if x >= INNER[0] and x <= INNER[0] + R and -INNER[1] < y < INNER[1]:
            bits |= LEFT
        if y <= -INNER[1] and y >= -INNER[1] - R and -INNER[0] < x < INNER[0]:
            bits |= DOWN
        if y >= INNER[1] and y <= INNER[1] + R and -INNER[0] < x < INNER[0]:
            bits |= UP
        return bits

    def height(self, d):
        if d.tumble and not d.done:
            if d.h < 92.8:
                d.vh += 9.28
                if d.vh > 34.8:
                    d.vh = 34.8
            else:
                d.vh -= 9.28
        else:
            d.vh -= 9.28
        d.h += d.vh
        if d.h < 0:
            d.h = 0
            d.vh *= -0.75

    def knock(self, d):
        if not d.knocked:
            return True
        d.tumble = False
        d.stun -= 1
        if d.stun > 0:
            if d.stun % 5 == 0:
                self.events.append(["dizzy", d.z])
            d.speed *= KNOCKED_SLOW[d.rank]
            return False
        d.vh = 0
        d.knocked = False
        d.h = 0
        return True

    def cloud_hits(self, d):
        for c in self.clouds:
            if c.owner == d.z or c.phase != 1:
                continue
            dx, dy = d.x - c.x, d.y - c.y
            if not math.sqrt(dx * dx + dy * dy) < CLOUD_R:
                continue
            if not d.done and not d.tumble:
                d.boost = 0
                d.vh = 34.8
                d.stun = DIZZY_FOR[d.rank]
                d.tumble = True
                self.events.append(["hit", d.z, c.id])
            c.phase = 2
            c.timer = 0

    def cloud(self, c):
        c.frame += 1
        if c.phase == 0:
            if c.timer >= CLOUD_FOR[0]:
                c.phase = 1
                c.timer = 0
        elif c.phase == 2:
            if c.timer >= CLOUD_FOR[2]:
                self.d[c.owner].out -= 1
                self.clouds.remove(c)
        elif c.timer >= CLOUD_FOR[1]:
            c.phase = 2
            c.timer = 0

    def bumps(self):
        for i in range(3):
            for j in range(i + 1, 4):
                self.bump(self.d[i], self.d[j])

    def bump(self, a, b):
        nx, nh, ny = b.x - a.x, b.h - a.h, b.y - a.y
        dist = math.sqrt(nx * nx + nh * nh + ny * ny)
        if not dist < 2 * R:
            return
        over = 2 * R - dist
        if dist > 0:
            nx /= dist
            nh /= dist
            ny /= dist
        else:
            nx = 2 * self.u() - 1
            nh = 2 * self.u() - 1
            ny = 2 * self.u() - 1
            ln = math.sqrt(nx * nx + nh * nh + ny * ny)
            if ln != 0:
                nx /= ln
                nh /= ln
                ny /= ln
        a.px += -nx * over * 0.5
        a.ph += -nh * over * 0.5
        a.py += -ny * over * 0.5
        b.px += nx * over * 0.5
        b.ph += nh * over * 0.5
        b.py += ny * over * 0.5
        fast = SPEED * 0.9 * 0.5
        if fast < a.boost and a.vx * nx + a.vz * nh >= 0 and b.boost < fast:
            self.knock_over(b)
        if fast < b.boost and b.vx * -nx + b.vz * -nh >= 0 and a.boost < fast:
            self.knock_over(a)
        if a.tumble and not b.tumble:
            a.vh = 34.8
        if b.tumble and not a.tumble:
            b.vh = 34.8

    def knock_over(self, d):
        if d.knocked:
            return
        d.stun = KNOCKED_FOR
        d.boost = 0
        d.knocked = True
        d.vh = 46.4
        self.events.append(["knocked", d.z])

    def walls(self, d):
        for e in EDGES:
            ax, ay = BLOCK[e.a]
            dist = apart(d.x, d.y, ax, ay, e.dx, e.dz)
            if not dist < R:
                continue
            at = meet(d.x, d.y, e.n[0], e.n[1], ax, ay, e.dx, e.dz)
            if not at or not (0 <= at[1] <= 1):
                continue
            depth = R - dist
            d.x += e.n[0] * depth
            d.y += e.n[1] * depth
            if e.n[0] * d.vx + e.n[1] * d.vz < 0:
                self.wall_turn(d, e.turn)
        for i, n in POSTS:
            ox, oy = d.x - BLOCK[i][0], d.y - BLOCK[i][1]
            ln = math.sqrt(ox * ox + oy * oy)
            if not ln < R:
                continue
            if ln == 0:
                ox, oy = n
            else:
                ox /= ln
                oy /= ln
            depth = R - ln if ox * n[0] + oy * n[1] >= 0 else R + ln
            d.x += ox * depth
            d.y += oy * depth
        if d.x < -OUTER[0]:
            d.x = -OUTER[0]
            if d.vx < 0:
                self.wall_turn(d, DOWN)
        if d.x > OUTER[0]:
            d.x = OUTER[0]
            if d.vx * -1 < 0:
                self.wall_turn(d, UP)
        if d.y < -OUTER[1]:
            d.y = -OUTER[1]
            if d.vz < 0:
                self.wall_turn(d, LEFT)
        if d.y > OUTER[1]:
            d.y = OUTER[1]
            if -1 * d.vz < 0:
                self.wall_turn(d, RIGHT)

    def wall_turn(self, d, way):
        d.bounce = True
        d.timer = trunc(2 * (1 - d.speed / SPEED))
        if d.done:
            d.vx *= -0.1
            d.vz *= -0.1
            return
        w = WAY[way]
        d.target = w[3]
        d.vx = w[1]
        d.vz = w[2]

    def placings(self):
        order = list(self.d)
        for k in range(3):
            for i in range(3 - k):
                if order[i].progress < order[i + 1].progress:
                    order[i], order[i + 1] = order[i + 1], order[i]
        for i, d in enumerate(order):
            d.rank = i

    def finish(self, t):
        before = sum(1 for d in self.d if d.done)
        over = False
        for d in self.d:
            if d.laps > 0:
                continue
            if before == 4:
                over = True
            if before == 0:
                d.won = True
            if not d.done:
                d.done = True
                d.fin = t
                d.progress = 10000 - d.rank
                self.events.append(["finish", d.z, int(d.won)])
        if over or t >= LONGEST:
            self.end = t
            for c in self.clouds:
                c.phase = 2
                c.timer = 0

    def coast(self):
        for d in self.d:
            d.speed *= 0.94
            d.boost = 0
            d.x += d.vx * d.speed
            d.y += d.vz * d.speed
            if d.speed < 1:
                d.speed = 0
            self.height(d)
            self.walls(d)

    def cpu(self, d):
        s = d.seg
        if s == 0 or s == 4:
            d1, d2 = (-1, 0), (0, 1)
            px, py = -148 - (d.lane + R), d.y
            dist = abs(d.x - px)
            ahead = 122.5 - d.y
        elif s == 1 or s == 7:
            d1, d2 = (0, 1), (1, 0)
            px, py = d.x, d.lane + R + 92.5
            dist = abs(d.y - py)
            ahead = 178 - d.x
        elif s == 2 or s == 5:
            d1, d2 = (1, 0), (0, -1)
            px, py = d.lane + R + 148, d.y
            dist = abs(d.x - px)
            ahead = d.y - -122.5
        else:
            d1, d2 = (0, -1), (-1, 0)
            px, py = d.x, -92.5 - (d.lane + R)
            dist = abs(d.y - py)
            ahead = d.x - 45 if d.laps == 1 else d.x - -178
        p = [px, py]
        wary = self.wary(d, dist, p, d1, d2, ahead)
        if self.level == 3 and d.laps == LAPS:
            wary = True
        px, py = p
        if s == 0:
            bits = DOWN if d.x < px else LEFT
        elif s == 1:
            bits = RIGHT if py < d.y else DOWN
        elif s == 3:
            bits = LEFT if d.y < py else UP
        elif s == 2:
            bits = UP if px < d.x else RIGHT
        elif s == 4 or s == 5:
            if wary:
                bits = RIGHT if d.x < px - SPEED else LEFT if px + SPEED < d.x else DOWN if s == 4 else UP
            else:
                bits = DOWN if s == 4 else UP
        elif d.laps == 0 and s == 6:
            bits = LEFT
        elif wary:
            bits = DOWN if d.y < py - SPEED else UP if py + SPEED < d.y else LEFT if s == 6 else RIGHT
        else:
            bits = LEFT if s == 6 else RIGHT
        inp = bits << 8
        if d.start:
            go = False
            if self.level == 1:
                go = self.rnd() % 11 == 0
            elif self.level == 2:
                go = self.rnd() % 3 == 0
            elif self.level == 3:
                go = True
            if go:
                inp |= A
        else:
            d.wait += 1
            if d.wait - 1 >= 6:
                if self.level != 3 or s < 4:
                    if self.u() < DROP[s] * DROP_LEVEL[self.level]:
                        inp |= A
        return inp

    def wary(self, d, dist, p, d1, d2, ahead):
        p0 = (p[0], p[1])
        near = False
        for c in self.clouds:
            if c.owner == d.z or c.phase == 2 or not d.notice < c.timer:
                continue
            at = meet(p[0], p[1], d1[0], d1[1], c.x, c.y, d2[0], d2[1])
            if not at:
                continue
            t, s = at
            if abs(t - dist) < 30 and s < 30:
                near = True
            if not s < 30 or not -(ahead + 30) < s:
                continue
            lo, hi = t - 30, t + 30
            if abs(s) < 30:
                if 0 < hi < dist:
                    dist = self.shift(d, p, d1, hi)
                if lo < dist < hi:
                    dist = self.shift(d, p, d1, lo if dist - lo < hi - dist else hi)
            elif lo < 0 < hi:
                dist = self.shift(d, p, d1, hi)
        if p[0] != p0[0] or p[1] != p0[1]:
            ex, ey = p0[0] - p[0], p0[1] - p[1]
            if math.sqrt(ex * ex + ey * ey) > 138.6:
                p[0], p[1] = p0
        return near

    def shift(self, d, p, d1, k):
        p[0] += d1[0] * k
        p[1] += d1[1] * k
        ex, ey = d.x - p[0], d.y - p[1]
        return math.sqrt(ey * ey + ex * ex)

    def save(self):
        return dict(t=self.t, end=self.end, ids=self.ids, seed=self.seed, d=[d.copy() for d in self.d],
                    clouds=[c.copy() for c in self.clouds])

    @property
    def places(self):
        return [d.rank + 1 for d in self.d]

    def digest(self):
        parts = [self.t, self.seed, self.ids, -1 if self.end is None else self.end]
        for d in self.d:
            parts += [_hex(d.x), _hex(d.h), _hex(d.y), _hex(d.vx), _hex(d.vz), _hex(d.vh), d.rot, d.timer,
                      int(d.start), int(d.tumble), int(d.knocked), int(d.bounce), int(d.ready), int(d.drop),
                      int(d.done), int(d.won), -1 if d.fin is None else d.fin, d.corners, d.seg, d.laps, _hex(d.progress), d.rank, _hex(d.speed),
                      _hex(d.boost), d.roll, d.stun, d.wait, d.clouds, d.out, _hex(d.target), _hex(d.angle),
                      d.notice, _hex(d.lane)]
        for c in self.clouds:
            parts += [c.id, c.owner, _hex(c.x), _hex(c.h), _hex(c.y), c.timer, c.phase, c.frame]
        return ",".join(str(p) for p in parts)


def _hex(v):
    return struct.pack(">d", float(v)).hex()


class Round:
    """One race's world on the server, run as far as the pads that can still
    come in allow."""

    def __init__(self, seed, level="normal", cpus=(False, True, True, True)):
        self.cpus = list(cpus)
        self.world = World(seed, level, self.cpus)
        self.pads = [[] for _ in range(SEATS)]  # each person's pad changes: [frame, D-pad, A]
        self.at = [0] * SEATS  # where each one's list has been read to
        self.done = None  # how it ended, once decided: dict(f, fin, p)
        self.end = (LONGEST + 1 + AFTER) / FPS  # s after GO it's over (sooner once decided)

    def pad_at(self, s, t):
        """Seat s's [D-pad, A] on frame t (frames are run in order)."""
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
        """Seat s's pad went to D-pad x (UP 8, DOWN 4, LEFT 2, RIGHT 1; + 16, A
        in the countdown) and A if a, on frame f (its device's word); it came in
        at round time now, and may be at most allow s old. Returns the frame it
        counts on, or None."""
        if self.cpus[s] or self.done or type(f) is not int or type(x) is not int or a not in (0, 1):
            return None
        if not 0 <= x <= 31:
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
        """What a device needs to rejoin the race: how it ended (once decided) and the people's pads so far."""
        return dict(rr=dict(done=self.done, pads=[None if self.cpus[s] else [list(e) for e in self.pads[s]]
                                                  for s in range(SEATS)]))

    def result(self):
        return self.done

    @property
    def scores(self):
        """Each seat's time in hundredths of a second, or -1 (not in when it ended)."""
        fin = self.done["fin"] if self.done else [d.fin for d in self.world.d]
        return [-1 if f is None else round(f * 100 / FPS) for f in fin]

    def settle(self, now, allow):
        """Run the world as far as no pad still on its way could change; once
        it's over, how: dict(f, fin, p), or None."""
        if self.done:
            return None
        safe = int(now * FPS) - int(allow * FPS) - 1
        if safe < 0:
            return None
        self.run_to(min(safe, LONGEST))
        if self.world.end is not None:
            self.done = dict(f=self.world.end, fin=[d.fin for d in self.world.d], p=self.world.places)
            self.end = (self.world.end + AFTER) / FPS
            return self.done
        return None

    def next_settle(self, allow):
        """When (round time, s) to look again: anyone can come in on any frame, so every half second."""
        return None if self.done else (self.world.t + 1 + FPS // 2) / FPS + allow
