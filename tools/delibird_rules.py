"""The rules of a Delibird's Delivery round, for the rooms server (tools/rooms.py).

The same world as web/minigames/src/delibird/rules.js, which has the rules and
where each number comes from in the game's code: keep the two the same, line
for line (tools/test_rooms.py and the browser tests check they run alike, to
the last bit). The four Delibird share one stage, its gifts and its Swinub, so
the server runs it from everyone's sticks (the people's: the devices send each
change, a "pad" with the frame it's for; the CPUs think in it as on every
device), and so knows who scored what.
"""
import math
import struct

SEATS = 4
FPS = 30
LEVELS = {"easy": 1, "normal": 2, "hard": 3}
AHEAD = 4  # frames ahead of now a pad may be for (a device sends its player's up to 3 ahead: src/lag.js leadFor)

TIME = 60 * FPS
HURRY = 30 * FPS
LAST = 3 * FPS
FIRST = TIME - FPS
WAIT = 60
SHOW = 0  # (the results come on the frame the tally's done: 0x86A07124)


class Kind:
    __slots__ = ("name", "object", "points", "weight", "half", "depth")

    def __init__(self, name, obj, points, weight, half, depth):
        self.name, self.object, self.points, self.weight, self.half, self.depth = name, obj, points, weight, half, depth


KINDS = [
    Kind("ring", 175, 1000, 1, 1.2799999713897705, 1.600000023841858),
    Kind("piano", 176, 600, 3, 2.9066667556762695, 4.013333320617676),
    Kind("snorlax", 181, 350, 3, 3.246666669845581, 3.2799999713897705),
    Kind("n64", 169, 250, 2, 2, 2.7200000286102295),
    Kind("gameboy", 180, 100, 1, 0.8933333158493042, 1.600000023841858),
    Kind("stocking", 174, 50, 1, 2.0799999237060547, 2.133333444595337),
    Kind("candy", 184, 20, 0.5, 1.4533333778381348, 1.1066666841506958),
    Kind("gba", 177, 100, 1, 1.6066666841506958, 0.8999999761581421),
    Kind("gamecube", 170, 250, 1, 1.346666693687439, 2.940000057220459),
]
SACK_MAX = 5

START = [[-141.6666717529297, -140], [-47.22222137451172, -140], [47.22222137451172, -140], [141.6666717529297, -140]]
DOORS = [[x * 0.1111111111111111, 100 * 0.1111111111111111, -2312 * 0.1111111111111111] for x in (-1275, -425, 425, 1275)]
LANES = [-70.83333587646484, -40.27777862548828, -20.83333396911621, 4.166666507720947]
X0, X1, Z0, Z1 = -170, 170, -150, 125
TOP = -140
BELT_Z = 135
BELT_IN = 235
BELT_Y = 5.55555534362793
BELT_SLOTS = 340
BACK_Z = -175
BACK_BIG = -183.3333282470703
SWINUB_X = 270

REACH, BODY = 19.349998474121094, 11.84999942779541
GIFT_W, GIFT_K = 8.333333015441895, 0.800000011920929
APART, SQRT2, PUSH, PUSH_D = 31.19999885559082, 1.4142135381698608, 0.10999999940395355, 62.39999771118164
SWINUB, AVOID_X = 19.19999885559082, 36.19999694824219
SACK = [[0, -27.733333587646484], [-1.426285743713379, -30.585905075073242], [-2.852571487426758, -32.646095275878906],
        [-4.595809459686279, -34.38933181762695], [-6.180571556091309, -37.241905212402344],
        [-7.92380952835083, -39.619049072265625]]
SACK_R2 = [799.0242919921875, 1420.4876708984375, 2219.511962890625, 3196.09716796875]  # (by player: 0x86A0F2BC)

STAND, WALK1, WALK5, CHEER, SULK, PICK, HAND, KNOCKED = 0, 1, 5, 6, 7, 8, 9, 10
PICK_TIME, PICK_IN, PICK_DONE = 27, 12, 26
HAND_TIME = 40
HAND_AT = (36, 29, 22, 15, 8)
KNOCK_TIME, KNOCK_GRACE, KNOCK_SLIDE = 37, 10, 21

WAYS = [
    [[0, -1], [-1, -1], [1, -1], [0, 0], [0, 1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
    [[0, -1], [1, -1], [-1, -1], [0, 0], [0, 1], [1, 0], [-1, 0], [1, 1], [-1, 1]],
    [[0, 1], [-1, 1], [1, 1], [0, 0], [0, -1], [-1, 0], [1, 0], [-1, -1], [1, -1]],
    [[0, 1], [1, 1], [-1, 1], [0, 0], [0, -1], [1, 0], [-1, 0], [1, -1], [-1, -1]],
]
ORDERS = [[0, 1, 2, 3], [0, 1, 3, 2], [0, 2, 1, 3], [0, 2, 3, 1], [0, 3, 1, 2], [0, 3, 2, 1], [1, 0, 2, 3], [1, 0, 3, 2],
          [1, 2, 0, 3], [1, 2, 3, 0], [1, 3, 0, 2], [1, 3, 2, 0], [2, 1, 0, 3], [2, 1, 3, 0], [2, 0, 1, 3], [2, 0, 3, 1],
          [2, 3, 1, 0], [2, 3, 0, 1], [3, 1, 2, 0], [3, 1, 0, 2], [3, 2, 1, 0], [3, 2, 0, 1], [3, 0, 1, 2], [3, 0, 2, 1]]


def level_code(level, cpus):
    return LEVELS.get(level, 2) if any(cpus) else 1


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


def fround(v):
    return struct.unpack(">f", struct.pack(">f", v))[0]


def _sine(i):
    q, x = (i >> 10) & 3, (i & 1023) * (math.pi / 2048)
    x2 = x * x
    term = x if q % 2 == 0 else 1.0
    total = term
    for k in range(1, 10):
        term = (-term * x2) / (2 * k * (2 * k + 1) if q % 2 == 0 else (2 * k - 1) * (2 * k))
        total += term
    return fround((0.0 if total == 0 else -total) if q >= 2 else total)


SINE = [_sine(i) for i in range(4096 + 1024)]


def sine(i):
    return SINE[i]


def cosine(i):
    return SINE[i + 1024]


def cmod(a, b):
    """a % b as C (and JS) have it: the sign of a."""
    r = abs(a) % b
    return -r if a < 0 else r


def trunc(v):
    return int(v)


def heading(x, z):
    return s16(cmod(angle(x, -z) + 0x3FFF, 0xFFFF))


def apart(a, b):
    v = b - a if a < b else a - b
    if v >= 0x8000:
        v = 0xFFFF - v
    return v


def turn(to, frm, step):
    if not step < apart(to, frm):
        return to
    a, b = s16(frm + step), s16(frm - step)
    return a if apart(to, a) < apart(to, b) else b


def stride(sx, sy, weight):
    if weight > 5:
        return [(sx * 2) * 0.015625, -((sy * 2) * 0.015625)]
    return [(sx * (7 - weight)) * 0.015625, -((sy * (7 - weight)) * 0.015625)]


def stick_for(x, z):
    if x == 0 and z == 0:
        return [0, 0]
    l = math.sqrt(x * x + z * z)
    if l < 0.009999999776482582:
        l = 0.009999999776482582
    return [(x * 64) / l, -((z * 64) / l)]


def reaches(p, g, x, z):
    k = KINDS[g.kind]
    w = k.half * GIFT_W * GIFT_K + REACH
    return p.x < w + x and x - w < p.x and p.zz < 0 + REACH + z and z - ((2 * (k.depth * GIFT_W)) * 0.800000011920929 + REACH) < p.zz


def over_gift(g, x, z, r):
    k = KINDS[g.kind]
    w = k.half * GIFT_W * GIFT_K + r
    return x < w + g.x and g.x - w < x and z < 0 + r + g.z and g.z - ((2 * (k.depth * GIFT_W)) * 0.800000011920929 + r) < z


def facing(p, x, z):
    a = s16(cmod(angle(x - p.x, -(z - p.zz)) + 0x3FFF, 0xFFFF))
    return p.yaw - a < 0x2000


class Player:
    __slots__ = ("z", "cpu", "x", "zz", "vx", "vz", "state", "since", "busy", "grace", "spin", "yaw", "aim", "sack_yaw",
                 "sack", "load", "weight", "last", "score", "shown", "got", "combo", "combo_show", "combo_at", "mode",
                 "wait", "push_a", "push_b", "pushed", "won")

    def __init__(self, z, cpu):
        self.z, self.cpu = z, cpu
        self.x, self.zz, self.vx, self.vz = START[z][0], START[z][1], 0, 0
        self.state, self.since = STAND, 0
        self.busy, self.grace, self.spin = 0, 0, 0
        self.yaw, self.aim, self.sack_yaw = 0, 0, 0
        self.sack, self.load, self.weight, self.last = [], 0, 0, -1
        self.score, self.shown, self.got, self.combo, self.combo_show, self.combo_at = 0, 0, [], 0, 0, None
        self.mode, self.wait = 0, 0
        self.push_a, self.push_b, self.pushed, self.won = [0, 0], [0, 0], False, False

    def copy(self):
        c = Player.__new__(Player)
        for k in Player.__slots__:
            setattr(c, k, getattr(self, k))
        c.sack, c.got, c.push_a, c.push_b = list(self.sack), list(self.got), list(self.push_a), list(self.push_b)
        return c


class Gift:
    __slots__ = ("id", "kind", "at", "w", "x", "z", "picked", "by", "timer")

    def __init__(self, id_, kind, at, w, x, z):
        self.id, self.kind, self.at, self.w, self.x, self.z = id_, kind, at, w, x, z
        self.picked, self.by, self.timer = False, -1, 0

    def copy(self):
        c = Gift(self.id, self.kind, self.at, self.w, self.x, self.z)
        c.picked, c.by, c.timer = self.picked, self.by, self.timer
        return c


class Box:
    __slots__ = ("id", "p", "kind", "x", "y", "z", "big")

    def __init__(self, id_, p, kind, x, y, z, big):
        self.id, self.p, self.kind, self.x, self.y, self.z, self.big = id_, p, kind, x, y, z, big

    def copy(self):
        return Box(self.id, self.p, self.kind, self.x, self.y, self.z, self.big)


class Crumb:
    __slots__ = ("kind", "x", "y", "z", "vx", "vy", "vz", "alpha")

    def __init__(self, kind, x, y, z, vx, vy, vz, alpha):
        self.kind, self.x, self.y, self.z, self.vx, self.vy, self.vz, self.alpha = kind, x, y, z, vx, vy, vz, alpha

    def copy(self):
        return Crumb(self.kind, self.x, self.y, self.z, self.vx, self.vy, self.vz, self.alpha)


class Swinub:
    __slots__ = ("id", "lane", "x", "z", "vx", "right")

    def __init__(self, id_, lane, x, z, vx, right):
        self.id, self.lane, self.x, self.z, self.vx, self.right = id_, lane, x, z, vx, right

    def copy(self):
        return Swinub(self.id, self.lane, self.x, self.z, self.vx, self.right)


class Spot:
    """A gift on the front belt, or a Swinub, as of the last frame (W + 0xEC4, W + 0xE84)."""
    __slots__ = ("x", "z", "kind", "vx")

    def __init__(self, x, z, kind=0, vx=0):
        self.x, self.z, self.kind, self.vx = x, z, kind, vx

    def copy(self):
        return Spot(self.x, self.z, self.kind, self.vx)


class World:
    def __init__(self, seed, level="normal", cpus=(False, True, True, True)):
        self.level = level_code(level, cpus)
        self.everyone = not any(cpus)
        self.cpu_level = LEVELS.get(level, 2)
        self.seed = seed & 0xFFFFFFFF
        self.t = -1
        self.clock = TIME
        self.phase = "play"
        self.end = None
        self.shown = None
        self.step_ = 0
        self.counted = False
        self.ids = 0
        self.slots = [0] * BELT_SLOTS
        self.gifts = []
        self.boxes = []
        self.crumbs = []
        self.swinub = []
        self.lanes = [0, 0, 0, 0]
        self.on_belt = []
        self.running = []
        self.events = []
        self.p = [Player(z, bool(cpus[z])) for z in range(SEATS)]

    def rnd(self):
        """The game's random numbers (0x8007B100: x = (4x + 2)(4x + 3) >> 2, in 32 bits)."""
        self.seed = ((((self.seed << 2) + 2) & 0xFFFFFFFF) * (((self.seed << 2) + 3) & 0xFFFFFFFF) & 0xFFFFFFFF) >> 2
        return self.seed

    # ---- a frame ----
    def step(self, t, pads=()):
        self.t = t
        if self.phase == "play":
            c = self.clock
            if c > 0:
                self.clock = c - 1
                self.players(pads)
                if LAST < self.clock:
                    self.gift_in()
                    if self.clock < FIRST:
                        self.swinub_in()
                self.pools()
            elif self.pending():
                self.players(pads)
                self.pools()
                self.clock = c - 1
                if self.clock < -WAIT:
                    self.finish()
            else:
                self.finish()
        elif self.phase == "tally":
            self.pools()
            if self.counted:
                self.cheer()
                return
            self.players(pads)
            self.pools()
            counting = False
            for p in self.p:
                if p.shown < p.score:
                    counting = True
                    p.shown += self.step_
                    if p.shown >= p.score:
                        p.shown = p.score
                        self.events.append(["counted", p.z])
            if counting:
                self.events.append(["tick"])
            self.counted = all(p.shown == p.score for p in self.p)
            self.step_ += 1

    def pending(self):
        return any(g.picked for g in self.gifts) or len(self.boxes) > 0 or any(p.state == HAND for p in self.p)

    def finish(self):
        self.phase = "tally"
        self.end = self.t
        self.counted = False
        self.step_ = 0
        self.events.append(["end"])

    def cheer(self):
        best = -1
        for p in self.p:
            if best < p.score:
                best = p.score
        for p in self.p:
            p.won = p.score == best
        if all(p.won for p in self.p):
            for p in self.p:
                p.won = False
        for p in self.p:
            p.yaw = 0
            p.sack_yaw = 0
            self.set_state(p, CHEER if p.won else SULK)
        self.phase = "show"
        self.shown = self.t

    def set_state(self, p, s):
        if p.state != s:
            p.state = s
            p.since = self.t

    # ---- the Delibird ----
    def players(self, pads):
        order = ORDERS[self.rnd() % 24]
        for p in self.p:
            left = p.busy
            if left > 0:
                if p.spin != 0:
                    v = s16(cmod((left * 0xFFFF + p.sack_yaw) + trunc((p.spin * 0xFFFF) / 64) * left, 0xFFFF))
                    p.sack_yaw = p.yaw = p.aim = v
                if p.state == HAND:
                    self.hand(p)
                p.busy -= 1
                left = p.busy
            if left == 0 and p.grace > 0:
                p.grace -= 1
            if left == 0:
                v = [0, 0]
                if self.clock > 0:
                    v = self.stick(p, pads[p.z] if p.z < len(pads) else None)
                p.vx, p.vz = v[0], v[1]
                if v[0] != 0 or v[1] != 0:
                    p.aim = heading(v[0], v[1])
                if v[0] == 0 and v[1] == 0:
                    self.set_state(p, 3 if p.aim != p.yaw else STAND)
                else:
                    s = math.sqrt(v[0] * v[0] + v[1] * v[1])
                    self.set_state(p, 5 if s <= 3 else 4 if s <= 4 else 3 if s <= 5 else 2 if s <= 6 else 1)
        for p in self.p:
            if p.busy == 0:
                p.spin = 0
            if p.state >= PICK:
                p.spin = 0
            if p.state == KNOCKED and p.busy < KNOCK_SLIDE:
                p.vx, p.vz = 0, 0
            p.pushed = False
            p.push_a = [0, 0]
            p.push_b = [0, 0]
        for z in order:
            p = self.p[z]
            if p.state <= WALK5 and p.spin == 0:
                self.shove(p)
        for z in order:
            p = self.p[z]
            if p.state <= WALK5 and p.spin == 0 and p.pushed:
                p.vx = p.vx + (p.push_a[0] + p.push_b[0])
                p.vz = p.vz + (p.push_a[1] + p.push_b[1])
                p.pushed = False
        for z in order:
            p = self.p[z]
            if p.state <= WALK5 or p.state == KNOCKED:
                self.move(p, p.vx, p.vz)
        for p in self.p:
            if p.spin == 0:
                self.face(p)
        for p in self.p:
            if trunc(p.zz) < TOP and p.state != HAND and p.load != 0:
                self.set_state(p, HAND)
                p.busy = HAND_TIME

    def stick(self, p, pad):
        if not p.cpu:
            sx, sy = pad if pad else (0, 0)
            return stride(sx, sy, p.weight)
        sx, sy = self.think(p)
        return stride(sx, sy, p.weight)

    def shove(self, p):
        for q in self.p:
            if q is p:
                continue
            dx, dz, r = q.x - p.x, q.zz - p.zz, SQRT2 * APART
            if q.x - r < p.x < r + q.x and q.zz - r < p.zz < r + q.zz:
                d = math.sqrt(dx * dx + dz * dz)
                k = 11 if d < 0.01 else PUSH / d
                ux, uz = dx * k, dz * k
                p.pushed = True
                s = math.sqrt(q.vz * q.vz + q.vx * q.vx)
                p.push_a[0] = p.push_a[0] - ux * s
                p.push_a[1] = p.push_a[1] - uz * s
                f = PUSH_D - d
                p.push_b[0] = p.push_b[0] - ux * f
                p.push_b[1] = p.push_b[1] - uz * f

    def move(self, p, dx, dz):
        x, z = p.x + dx, p.zz + dz

        def ok(nx, nz):
            w = self.in_way(nx, nz)
            return w + p.load < 6 and (p.state != KNOCKED or self.in_way(nx, nz) == 0) and not self.blocked(nx, nz)

        if not self.against(p, x, z) and ok(x, z) and X0 < x < X1 and Z0 < z < Z1:
            p.x, p.zz = x, z
            return
        if not self.against(p, x, p.zz) and ok(x, p.zz) and X0 < x < X1:
            p.x = x
            return
        if not self.against(p, p.x, z) and ok(p.x, z) and Z0 < z < Z1:
            p.zz = z

    def against(self, p, x, z):
        for q in self.p:
            if q is not p and q.x - APART < x < q.x + APART and q.zz - APART < z < q.zz + APART:
                return True
        return False

    def in_way(self, x, z):
        n = 0
        for g in self.on_belt:
            if over_gift(g, x, z, BODY):
                n += 1
        return n

    def blocked(self, x, z):
        for g in self.on_belt:
            if over_gift(g, x, z, BODY):
                return True
        return False

    def face(self, p):
        gap = apart(p.sack_yaw, p.yaw)
        p.sack_yaw = turn(p.yaw, p.sack_yaw, 0x1332 if gap > 16383.75 else 0xCCC if gap > 8191.875 else
                          0x666 if gap > 4095.9375 else 0x199)
        s = math.sqrt(p.vx * p.vx + p.vz * p.vz)
        if s > 3.5:
            s = 3.5
        if s < 2:
            s = 2
        p.yaw = turn(p.aim, p.yaw, s16(trunc(1638 * s)))

    def hand(self, p):
        if p.busy not in HAND_AT:
            return
        k = self.take(p)
        if k < 0:
            return
        big = k == 1 or k == 2
        self.ids += 1
        self.boxes.append(Box(self.ids, p.z, k, p.x, BELT_Y, BACK_BIG if big else BACK_Z, big))
        self.events.append(["hand", p.z])

    def put(self, p, k):
        if len(p.sack) == SACK_MAX or 1 + p.load >= 6:
            return False
        p.sack.append(k)
        p.load += 1
        p.last = k
        p.weight = p.weight + KINDS[k].weight
        return True

    def take(self, p):
        if not p.sack:
            return -1
        k = p.sack.pop(0)
        p.load -= 1
        p.weight = p.weight - KINDS[k].weight
        return k

    def sack_hit(self, p, x, z):
        ox, oz = SACK[p.load]
        i = ((p.sack_yaw + angle(ox, oz)) & 0xFFFF) >> 4
        r = math.sqrt(ox * ox + oz * oz)
        dx, dz = (p.x + -cosine(i) * r) - x, (p.zz + sine(i) * r) - z
        return dx * dx + dz * dz < SACK_R2[p.z]

    # ---- the CPUs ----
    def think(self, p):
        lvl = self.cpu_level
        if lvl == 3 and self.clock < 40 * FPS:
            p.mode = 1
        if p.mode == 0:
            n = p.load
            if n == 0:
                p.mode = 0
            elif lvl == 1:
                if n >= 3:
                    p.mode = 1
                elif self.rnd() % 100 < 10 and p.wait == 0:
                    p.mode = 1
            else:
                few = 3 if lvl == 3 else 2
                if n > few:
                    p.mode = 1
                else:
                    w = p.wait
                    p.wait += 1
                    if w >= 31:
                        p.mode = 1
                    if self.clock < LAST:
                        p.mode = 1
        elif p.mode == 1:
            p.wait = 0
            if p.load == 0:
                p.mode = 0
        if p.mode == 0:
            g = self.target(p)
            if g is None:
                return [0, 0]
            w = self.way(p, 0, [g[0] - p.x, g[1] - p.zz])
            return stick_for(w[0], w[1])
        w = self.way(p, 1, None)
        return stick_for(w[0], w[1])

    def target(self, p):
        lst = self.on_belt
        if not lst:
            return None
        lvl = self.cpu_level
        best = lst[0]
        pts = KINDS[best.kind].points
        d = (p.x - best.x) * (p.x - best.x) + (p.zz - best.z) * (p.zz - best.z)
        want = 0
        if lvl == 3:
            if p.load != 0:
                want = KINDS[p.last].points
            elif p.got:
                want = KINDS[p.got[-1]].points
            if want == 20:
                want = 0
        for g in lst[1:]:
            q = KINDS[g.kind].points
            e = (p.x - g.x) * (p.x - g.x) + (p.zz - g.z) * (p.zz - g.z)
            if lvl == 1:
                take = e < d
            elif lvl == 3 and want != 0:
                take = (pts == want and e < d) or (pts != want and pts < q)
            else:
                take = pts < q or (pts == q and e < d)
            if take:
                best, pts, d = g, q, e
        return [best.x, best.z] if d > 0 else None

    def way(self, p, mode, to_gift):
        s = (0 if p.x > 0 else 1) if mode == 1 else (2 if p.x > 0 else 3)
        ways = [to_gift if i == 0 and to_gift else w for i, w in enumerate(WAYS[s])]
        steps = []
        for x, z in ways:
            sx, sy = stick_for(x, z)
            steps.append(stride(sx, sy, p.weight))
        alive = [True] * 9
        before = alive
        ahead = 130 if self.cpu_level == 3 else 1
        seen = [[r.x, r.z, r.vx] for r in self.running]
        wx = AVOID_X if self.cpu_level == 3 else SWINUB
        wz = APART if self.cpu_level == 3 else SWINUB
        px, pz = p.x, p.zz
        k = 1
        while k <= ahead and any(alive):
            before = list(alive)
            for r in seen:
                r[0] = r[0] + r[2]
            for c in range(9):
                if not alive[c]:
                    continue
                x = steps[c][0] * k + px
                z = steps[c][1] * k + pz
                if x < X0:
                    x = X0
                if X1 < x:
                    x = X1
                if z < Z0:
                    if mode == 1:
                        break
                    continue
                if Z1 < z:
                    if mode == 0:
                        break
                    continue
                for sx, sz, _ in seen:
                    if x < sx + wx and sx - wx < x and z < sz + wz and sz - wz < z:
                        alive[c] = False
                        break
            k += 1
        if not any(alive):
            alive = before
        i = alive.index(True) if True in alive else 0
        return ways[i]

    # ---- what comes in ----
    def gift_in(self):
        r = self.rnd() % 100
        k = 0 if r < 3 else 1 if r < 16 else 2 if r < 32 else 3 if r < 46 else 4 if r < 62 else 5 if r < 80 else 6
        if k == 6 and sum(1 for g in self.on_belt if g.kind == 6) >= 2:
            return
        w = trunc(KINDS[k].half * 10 + 1) + 8
        at = (self.rnd() % (BELT_SLOTS - w * 2)) + w
        for i in range(at - w, at + w):
            if self.slots[i]:
                return
        for i in range(at - w, at + w):
            self.slots[i] = 1
        self.ids += 1
        self.gifts.append(Gift(self.ids, k, at, w, at - BELT_SLOTS // 2, BELT_IN))
        if k == 0:
            self.events.append(["ring"])
        if k == 1:
            self.events.append(["piano"])

    def swinub_in(self):
        a, b = self.rnd(), self.rnd()
        right = ((b % 97) + (a % 97)) % 2 != 0
        if not self.rnd() % 97 < 61:
            return
        most = (3 if self.everyone else 2) if self.level == 1 else 3
        if len(self.swinub) >= most:
            return
        lane = self.rnd() % 4
        if self.lanes[lane]:
            return
        side = self.side(lane)
        if side == 2:
            return
        right = side == 1
        v = 5 + (self.rnd() % 3) if self.rnd() % 97 >= 11 else 8 + (self.rnd() % 3)
        if right:
            v = -v
        v = _single(v * [0.800000011920929, 0.8999999761581421, 1, 1.2000000476837158][self.level])  # (mul.s: 0x86A04A9C)
        self.lanes[lane] = 1
        self.ids += 1
        self.swinub.append(Swinub(self.ids, lane, SWINUB_X if right else -SWINUB_X, LANES[lane], v, right))

    def side(self, lane):
        def find(l):
            got = None
            for s in self.running:
                if LANES[l] - 5.55555534362793 < s.z < LANES[l] + 5.55555534362793:
                    got = s
                    if l != 3 or lane != 2:
                        break
            return got

        def coin():
            a, b = self.rnd(), self.rnd()
            return 1 if ((b % 97) + (a % 97)) % 2 != 0 else 0

        if lane in (0, 3):
            s = find(1 if lane == 0 else 2)
            if s is None:
                return coin()
            return 1 if s.vx > 0 else 0
        s1, s2 = find(0 if lane == 1 else 1), find(2 if lane == 1 else 3)
        if s1 is None and s2 is None:
            return coin()
        if s1 is not None and s2 is None:
            return 1 if s1.vx > 0 else 0
        if s1 is None and s2 is not None:
            return 1 if s2.vx > 0 else 0
        if s1.vx > 0 and s2.vx > 0:
            return 1
        if s1.vx < 0 and s2.vx < 0:
            return 0
        if s1.vx > 0 and s2.vx < 0:
            return 0 if 0 < s1.x else 1 if s2.x < 0 else 2
        return 0 if 0 < s2.x else 1 if s1.x < 0 else 2

    # ---- the things on the stage ----
    def pools(self):
        belt, running = [], []
        for g in list(self.gifts):
            self.gift(g, belt)
        self.on_belt = belt
        for b in list(self.boxes):
            self.box(b)
        for c in list(self.crumbs):
            c.x = c.x + c.vx
            c.y = c.y + c.vy
            c.z = c.z + c.vz
            c.vy = c.vy - 1
            c.alpha -= 7
            if c.y < -11.11111111111111:
                self.crumbs.remove(c)
        for s in list(self.swinub):
            self.run(s, running)
        self.running = running

    def gift(self, g, belt):
        order = ORDERS[self.rnd() % 24]
        if not g.picked:
            z0 = g.z
            lo = z0 - 3
            nxt = lo if BELT_Z < lo else z0 + 3 if z0 + 3 < BELT_Z else BELT_Z
            stop = False
            for p in self.p:
                if not reaches(p, g, g.x, nxt):
                    continue
                if p.state == PICK or p.state == KNOCKED or 1 + p.load >= 6 or not facing(p, g.x, nxt):
                    stop = True
                    break
            if not stop:
                g.z = nxt
            for z in order:
                p = self.p[z]
                if reaches(p, g, g.x, z0) and facing(p, g.x, z0) and 1 + p.load < 6 and p.busy == 0:
                    self.set_state(p, PICK)
                    p.busy = PICK_TIME
                    g.timer = 0
                    if g.x - p.x != 0 or z0 - p.zz != 0:
                        p.aim = heading(g.x - p.x, z0 - p.zz)
                    if g.x - p.x != 0 or z0 - p.zz != 0:
                        p.yaw = heading(g.x - p.x, z0 - p.zz)
                    g.picked = True
                    g.by = z
                    p.wait = 0
                    break
            belt.append(Spot(g.x, z0, g.kind))
        else:
            if g.timer >= PICK_DONE:
                for i in range(g.at - g.w, g.at + g.w):
                    self.slots[i] = 0
                self.gifts.remove(g)
                self.events.append(["sack", g.by, self.p[g.by].load])
                return
            if g.timer == PICK_IN:
                self.put(self.p[g.by], g.kind)
        g.timer += 1

    def box(self, b):
        tx, ty, tz = DOORS[b.p]
        if tx < b.x - 8:
            b.x = b.x - 8
        elif b.x + 8 < tx:
            b.x = b.x + 8
        else:
            b.x = tx
            if ty < b.y - 8:
                b.y = b.y - 8
            elif b.y + 8 < ty:
                b.y = b.y + 8
            else:
                b.y = ty
                if tz < b.z - 8:
                    b.z = b.z - 8
                elif b.z + 8 < tz:
                    b.z = b.z + 8
                else:
                    b.z = tz
        if b.x != tx or b.y != ty or b.z != tz:
            return
        self.boxes.remove(b)
        p = self.p[b.p]
        n, pts = len(p.got), KINDS[b.kind].points
        p.got.append(b.kind)
        if n > 0 and p.got[n - 1] == b.kind:
            p.combo = min(p.combo + 1, 4)
            p.score = min(p.score + pts * (p.combo + 1), 99999)
            p.combo_show = 30
            p.combo_at = self.t
            self.events.append(["combo", p.z, p.combo])
        else:
            p.combo_show = 0
            p.score = min(p.score + pts, 99999)
            p.combo = 0
            self.events.append(["in", p.z, b.kind])

    def run(self, s, running):
        s.x = s.x + s.vx
        x, z = s.x, s.z
        for p in self.p:
            if not (p.x < x + SWINUB and x - SWINUB < p.x and p.zz < z + SWINUB and z - SWINUB < p.zz):
                continue
            if p.grace != 0 or p.state == HAND or p.state == PICK:
                continue
            dz, dx = p.zz - z, p.x - x
            d = math.sqrt(dz * dz + dx * dx)
            if d < 0.01:
                d = 0.009999999776482582
            p.vx = ((dx * s.vx) / d) / 10 + s.vx * 0.5
            p.vz = ((dz * s.vx) / d) / 10
            p.spin = 0
            self.set_state(p, KNOCKED)
            n = 0
            k = self.take(p)
            while k >= 0:
                a = (self.rnd() % 65535) >> 4
                self.crumbs.append(Crumb(k, p.x, 1, p.zz, cosine(a) * 4 + p.vx, 8, sine(a) * 4 + p.vz, 255))
                n += 1
                k = self.take(p)
            self.events.append(["knocked", p.z, n])
            p.busy = KNOCK_TIME
            p.grace = KNOCK_GRACE
        for p in self.p:
            if p.state in (KNOCKED, PICK, HAND):
                continue
            if not self.sack_hit(p, x, z) or p.busy != 0:
                continue
            self.events.append(["spun", p.z])
            p.busy = abs(trunc(s.vx))
            p.vx, p.vz = 0, 0
            p.spin = (-1 if s.vx > 0 else 1) if z < p.zz else (1 if s.vx > 0 else -1)
        if x < -SWINUB_X or x > SWINUB_X:
            self.swinub.remove(s)
            self.lanes[s.lane] = 0
            return
        running.append(Spot(x, z, 0, s.vx))

    # ---- for running a frame again ----
    def save(self):
        return dict(t=self.t, seed=self.seed, clock=self.clock, phase=self.phase, end=self.end, shown=self.shown,
                    step_=self.step_, counted=self.counted, ids=self.ids, slots=list(self.slots), lanes=list(self.lanes),
                    gifts=[g.copy() for g in self.gifts], boxes=[b.copy() for b in self.boxes],
                    crumbs=[c.copy() for c in self.crumbs], swinub=[s.copy() for s in self.swinub],
                    on_belt=[g.copy() for g in self.on_belt], running=[s.copy() for s in self.running],
                    p=[p.copy() for p in self.p])

    def load(self, s):
        for k in ("t", "seed", "clock", "phase", "end", "shown", "step_", "counted", "ids"):
            setattr(self, k, s[k])
        self.slots, self.lanes = list(s["slots"]), list(s["lanes"])
        for k in ("gifts", "boxes", "crumbs", "swinub", "on_belt", "running", "p"):
            setattr(self, k, [v.copy() for v in s[k]])
        self.events = []

    @property
    def scores(self):
        return [p.score for p in self.p]

    @property
    def places(self):
        return [1 + sum(1 for q in self.p if q.score > p.score) for p in self.p]

    def digest(self):
        parts = [self.t, self.seed, self.clock, self.phase, -1 if self.end is None else self.end,
                 -1 if self.shown is None else self.shown, self.step_, int(bool(self.counted)), self.ids,
                 "".join(str(v) for v in self.slots), "".join(str(v) for v in self.lanes)]
        for p in self.p:
            parts += [_hex(p.x), _hex(p.zz), _hex(p.vx), _hex(p.vz), p.state, p.since, p.busy, p.grace, p.spin, p.yaw,
                      p.aim, p.sack_yaw, ".".join(str(k) for k in p.sack), p.load, _hex(p.weight), p.last, p.score,
                      p.shown, ".".join(str(k) for k in p.got), p.combo, p.combo_show, p.mode, p.wait, int(p.won)]
        for g in self.gifts:
            parts += [g.id, g.kind, g.at, _hex(g.x), _hex(g.z), int(g.picked), g.by, g.timer]
        for b in self.boxes:
            parts += [b.id, b.p, b.kind, _hex(b.x), _hex(b.y), _hex(b.z)]
        for c in self.crumbs:
            parts += [c.kind, _hex(c.x), _hex(c.y), _hex(c.z), _hex(c.vx), _hex(c.vy), _hex(c.vz), c.alpha]
        for s in self.swinub:
            parts += [s.id, s.lane, _hex(s.x), _hex(s.vx)]
        return ",".join(str(v) for v in parts)


def _single(v):
    """v rounded to a single (JS's Math.fround)."""
    return struct.unpack("f", struct.pack("f", v))[0]


def _hex(v):
    return struct.pack(">d", float(v) + 0).hex()  # (-0 as 0)


def tally_frames(scores):
    """Frames from the play's end to the cheering (the points count up by 0, 1, 2... a frame: 0x86A07124)."""
    shown, step, k = [0] * len(scores), 0, 1
    while True:
        k += 1
        for i, s in enumerate(scores):
            if shown[i] < s:
                shown[i] = min(s, shown[i] + step)
        step += 1
        if shown == list(scores):
            return k


class Round:
    """One round's world on the server, run as far as the sticks that can still
    come in allow."""

    def __init__(self, seed, level="normal", cpus=(False, True, True, True)):
        self.cpus = list(cpus)
        self.world = World(seed, level, self.cpus)
        self.pads = [[] for _ in range(SEATS)]  # each person's stick changes: [frame, stick, 0]
        self.at = [0] * SEATS  # where each one's list has been read to
        self.done = None  # how it ended, once decided: dict(f, s)
        self.end = (TIME + WAIT + 2 + tally_frames([99999] * SEATS) + SHOW) / FPS  # s after GO it's over (at the most)

    def pad_at(self, s, t):
        """Seat s's stick [x, y] on frame t (frames are run in order)."""
        lst, i = self.pads[s], self.at[s]
        x = lst[i - 1][1] if i else 0x4040
        while i < len(lst) and lst[i][0] <= t:
            x = lst[i][1]
            i += 1
        self.at[s] = i
        return [(x & 0xFF) - 64, (x >> 8) - 64]

    def run_to(self, t):
        w = self.world
        while w.end is None and w.t < t:
            f = w.t + 1
            w.step(f, [None if self.cpus[s] else self.pad_at(s, f) for s in range(SEATS)])
            w.events = []

    def pad(self, s, f, x, a, now, allow):
        """Seat s's stick went to x ((sx + 64) | (sy + 64) << 8, each -64 to 64)
        on frame f (its device's word); it came in at round time now, and may be
        at most allow s old. Returns the frame it counts on, or None."""
        if self.cpus[s] or self.done or type(f) is not int or type(x) is not int or a not in (0, 1):
            return None
        if not 0 <= x <= 0x8080 or (x & 0xFF) > 128:
            return None
        here = int(now * FPS)
        f = min(max(f, here - int(allow * FPS)), here + 1 + AHEAD)  # (no older than the way here allows; not far ahead)
        f = max(f, self.world.t + 1)  # (not what's been run)
        if self.pads[s]:
            f = max(f, self.pads[s][-1][0])  # (in order)
        self.pads[s].append([f, x, 0])
        return f

    def wire(self):
        """What a device needs to rejoin the round: how it ended (once decided) and the people's sticks so far."""
        return dict(dd=dict(done=self.done, pads=[None if self.cpus[s] else [list(e) for e in self.pads[s]]
                                                  for s in range(SEATS)]))

    def result(self):
        return self.done

    @property
    def scores(self):
        """Each seat's points (as far as the world's been run)."""
        return list(self.done["s"]) if self.done else self.world.scores

    def settle(self, now, allow):
        """Run the world as far as no stick still on its way could change; once
        the play's over, how: dict(f, s), or None."""
        if self.done:
            return None
        safe = int(now * FPS) - int(allow * FPS) - 1
        if safe < 0:
            return None
        self.run_to(min(safe, TIME + WAIT + 2))
        if self.world.end is not None:
            s = self.world.scores
            self.done = dict(f=self.world.end, s=s)
            self.end = (self.world.end + tally_frames(s) + SHOW) / FPS
            return self.done
        return None

    def next_settle(self, allow):
        """When (round time, s) to look again: every half second (the world's
        run as it goes, so the end needs little more)."""
        return None if self.done else (self.world.t + 1 + FPS // 2) / FPS + allow
