"""The rules of a Tumbling Togepi round, for the rooms server (tools/rooms.py).

The same course, lanes, CPUs and finish as web/minigames/src/togepi/rules.js,
which has the rules and where each number comes from in the game's code: keep
the two the same (tools/test_rooms.py and the browser tests check them against
each other). Only what decides the race is here (the browser's copy also keeps
what's drawn). The server makes the round's course from the seed, takes the
stick changes the devices report (the frame, x and y), keeps each in order and
not in the future or older than the way here allows, runs every lane itself
(the CPUs' too) as far as no change still on its way could alter, and says how
the race ended once that's decided: all four in, or the race called CALL
frames after the first.
"""
import math

SEATS = 4
FPS = 30
LEVELS = {"easy": 1, "normal": 2, "hard": 3}
FLOWER, ROCK_S, ROCK, LOG_S, LOG_M, LOG_L, ARROW, DIGLETT = 0, 1, 2, 3, 4, 5, 10, 11
PATTERNS = [
    [[[3,18,0,15,9,5],[15,37,10,15,15,13]],[[15,18,4,10,4,14],[15,37,10,15,15,15]],[[10,20,0,3,15,9],[3,37,10,3,3,3]],[[9,20,4,3,15,9],[9,37,10,9,9,9]]],
    [[[9,15,0,3,15,7],[3,37,10,3,3,3]],[[9,16,0,3,15,12],[9,37,10,9,9,9]],[[3,15,4,9,15,4],[15,37,10,15,15,13]],[[9,30,2,15,3,7],[15,37,10,15,3,13]]],
    [[[15,17,0,9,4,14],[15,37,10,15,15,15]],[[15,17,4,3,9,12],[3,37,10,3,3,5]],[[4,18,5,11,15,8],[9,37,10,9,9,9]],[[9,16,0,3,15,6],[3,37,10,3,3,3]]],
    [[[15,19,0,3,9,12],[3,37,10,3,3,5]],[[9,23,0,15,3,9],[15,37,10,15,15,15]],[[9,30,2,3,15,11],[3,37,10,3,15,5]],[[3,16,0,15,9,6],[15,37,10,15,15,15]]],
    [[[3,16,0,9,14,6],[3,37,10,3,3,3]],[[15,17,4,3,9,12],[3,37,10,3,3,5]],[[9,14,4,3,15,9],[9,37,10,9,9,9]],[[9,18,0,15,3,11],[15,37,10,15,15,15]]],
    [[[3,14,0,8,11,14],[15,23,0,7,10,13],[12,34,0,3,7,9],[3,37,10,3,3,5]],[[10,4,0,3,3,6],[10,15,0,4,3,5],[14,27,0,9,5,3],[9,37,10,9,9,7]],[[3,3,0,11,10,8],[7,12,0,13,15,10],[8,22,0,13,15,11],[5,31,0,11,13,15],[9,37,10,9,9,11]],[[15,8,0,6,9,12],[13,19,0,6,8,3],[3,31,0,12,12,6],[15,37,10,15,15,13]]],
    [[[4,16,0,10,15,7],[15,29,0,6,10,8],[10,36,0,3,5,7],[3,37,10,3,3,5]],[[9,4,0,3,3,5],[14,12,0,7,4,3],[3,19,0,11,9,6],[8,26,0,14,15,13],[9,37,10,9,9,11]],[[3,3,0,9,12,6],[14,12,0,6,4,3],[10,20,0,3,4,7],[5,33,0,12,10,15],[15,37,10,15,15,15]],[[9,3,0,15,13,14],[6,11,0,12,13,9],[15,18,0,9,7,12],[3,19,0,9,7,12],[15,37,10,15,15,15]]],
    [[[3,16,0,15,9,12],[9,35,0,15,3,6],[3,37,10,15,3,6],[15,37,10,15,3,5]],[[9,4,0,15,3,3],[9,14,0,15,3,3],[9,23,0,15,3,3],[9,33,0,15,15,3],[15,37,10,15,15,3]],[[9,36,0,3,15,12],[3,37,10,3,15,13],[15,37,10,3,15,13]],[[9,5,0,3,15,15],[9,14,0,3,15,15],[9,24,0,3,15,15],[9,34,0,3,3,15],[3,37,10,3,3,15]]],
    [[[3,18,0,9,15,12],[9,35,0,3,15,12],[3,37,10,3,15,13],[15,37,10,3,15,13]],[[9,4,0,3,15,15],[9,13,0,3,15,15],[9,24,0,3,15,15],[9,34,0,3,3,15],[3,37,10,3,3,15]],[[9,35,0,3,15,12],[3,37,10,3,15,13],[15,37,10,3,15,13]],[[9,4,0,3,15,15],[9,14,0,3,15,15],[9,24,0,3,15,15],[9,33,0,3,3,15],[3,37,10,3,3,15]]],
    [[[2,17,2,7,12,3],[3,37,10,3,3,3]],[[9,17,2,4,15,11],[9,37,10,9,9,9]],[[2,17,2,6,15,9],[6,17,10,6,15,9],[10,17,2,6,15,9],[9,37,10,9,9,9]],[[15,17,2,9,4,15],[15,37,10,15,15,15]]],
    [[[16,18,2,10,5,14],[15,37,10,15,15,15]],[[8,18,2,12,3,14],[12,18,10,12,3,14],[16,18,2,12,3,14],[9,37,10,9,9,9]],[[9,18,2,15,3,11],[15,37,10,15,15,15]],[[9,30,2,3,15,11],[3,37,10,3,15,3]]],
    [[[3,17,2,9,14,3],[3,37,10,3,3,3]],[[15,17,2,3,9,13],[3,37,10,3,3,5]],[[9,16,2,3,15,7],[9,37,10,9,9,9]],[[9,19,2,3,15,11],[15,37,10,15,15,15]]],
    [[[15,18,2,9,4,15],[15,37,10,15,15,15]],[[15,20,2,3,9,13],[3,37,10,3,3,5]],[[3,20,2,9,14,5],[9,37,10,9,9,9]],[[9,20,2,3,15,11],[3,37,10,3,3,3]]],
    [[[3,15,4,14,10,8],[9,21,3,14,3,11],[9,37,10,9,9,9]],[[9,15,3,15,3,11],[15,37,10,15,15,15]],[[3,10,4,10,15,13],[9,26,3,3,14,7],[3,37,10,3,3,3]],[[9,18,4,3,15,7],[3,37,10,3,3,3]]],
    [[[3,15,4,14,10,6],[9,37,10,9,9,9]],[[9,15,3,14,3,3],[3,23,4,10,13,5],[3,37,10,3,3,3]],[[9,20,3,14,3,11],[9,37,10,9,9,9]],[[9,12,4,4,15,9],[15,21,4,8,5,9],[15,37,10,15,15,15]]],
    [[[3,16,4,9,14,3],[3,37,10,3,3,3]],[[9,18,4,3,15,6],[9,37,10,9,9,9]],[[2,18,2,9,14,3],[3,37,10,3,3,3]],[[3,17,11,15,9,3],[9,17,11,15,9,3],[15,17,11,15,9,3],[15,37,10,15,15,15]]],
    [[[3,17,4,9,14,6],[3,37,10,3,3,3]],[[3,17,4,15,3,9],[2,20,2,15,3,9],[6,20,2,15,3,9],[10,20,2,15,3,9],[3,37,10,3,3,3]],[[3,16,2,15,9,5],[15,37,10,15,15,15]],[[9,16,2,15,3,9],[9,37,10,9,9,9]]],
    [[[9,18,4,3,15,9],[3,37,10,3,3,3]],[[15,12,11,11,6,3],[9,18,11,15,9,3],[3,24,11,15,11,3],[15,37,10,15,15,13]],[[3,18,4,15,3,9],[2,21,2,15,3,9],[6,21,2,15,3,9],[10,21,2,15,3,9],[3,37,10,3,3,3]],[[3,18,2,9,14,3],[3,37,10,3,3,3]]],
    [[[9,17,4,3,15,7],[3,37,10,3,3,3]],[[3,18,2,9,15,5],[9,37,10,9,9,9]],[[9,17,4,15,3,10],[15,37,10,15,15,15]],[[3,17,11,3,9,15],[9,17,11,3,9,15],[15,17,11,3,9,15],[3,37,10,3,3,5]]],
    [[[15,17,4,3,9,12],[3,37,10,3,3,5]],[[15,12,11,3,9,15],[9,18,11,4,9,15],[3,24,11,8,9,15],[3,37,10,3,3,5]],[[15,18,4,3,15,9],[8,21,2,3,15,9],[12,21,2,3,15,9],[16,21,2,3,15,9],[15,37,10,15,15,15]],[[16,17,2,3,9,15],[3,37,10,3,3,5]]],
]
BOX = [[3.5, 3.5], [1, 1.5], [2, 2.5], [3, 3], [4, 3], [5, 3], [3, 3.2], [4, 3.2], [5, 3.2], [4, 1], [3, 3], [3, 3]]
COLUMN = 13.8
LANE = 276
X0 = 13
MARGIN = 63.75
START_X = 138
RUNNER_Z = -280
FRONT = 144
DEPTH = 18
ROW_GAP = 702
FIRST_ROW = 400
ROW_EVERY = 83.5
ROWS = 20
SHOWN = 450
GONE = -600
SPEED = 0.32
SIDE = 0.2
SCROLL = 0.12
END_TILE, END_PX, GOAL_Z = 56, 20, -155
BOOST, BOOST_SIDE, BOOST_MAX, BOOST_CAP = 0.09, 0.028, 0.75, 0.3
DASH = 5.6
CLIP_LEN = [30, 35, 27, 59, 15, 25, 50, 11, 30]
C_IDLE, C_RUN, C_KNOCK, C_TRIP, C_HOP, C_GOAL = 0, 1, 2, 3, 7, 8
RUN, FLOWERS, TRIP, KNOCK_S, KNOCK, JUMP, DONE, GOAL = 0, 1, 2, 3, 4, 10, 11, 12
NONE = 1000
MOOD_SCALE = [5, 4, 3, 2]
PICK_FIRST = [None, [80, 75, 70, 65], [65, 55, 50, 45], [40, 35, 25, 20], [20, 17, 13, 10]]
PICK_LAST = [None, [15, 20, 20, 25], [20, 25, 30, 35], [30, 35, 40, 45], [60, 70, 80, 90]]
ARROW_RANK = [90, 70, 35, 25, 15]
ARROW_LEVEL = [3, 25, 35, 60]
# how a race ends (game.js): the last one's goal run (frames), and how long after the first one's in it's called
END_AFTER = 30
CALL = 30 * FPS
LONGEST = 240 * FPS  # (no one in by then: it's over)


def quad(seed):
    x = seed & 0xFFFFFFFF

    def rnd():
        nonlocal x
        x = (((4 * x + 2) * (4 * x + 3)) & 0xFFFFFFFF) >> 2
        return x
    return rnd


def level_code(level):
    return 4 - LEVELS.get(level, 2)


def course(seed):
    """The round's course (rules.js course()): each section's pattern and whether it's mirrored."""
    r = quad(seed ^ 0x2545F491)
    pattern, flip = [], []
    pick = [lambda: r() % 5, lambda: r() % 15, lambda: r() % 10 + 5, lambda: r() % 15 + 5, lambda: r() % 5 + 15]
    for i in range(5):
        flip.append(1 if r() % 100 >= 51 else 0)
        while True:
            p = pick[i]()
            if p not in pattern:
                break
        pattern.append(p)
    return dict(pattern=pattern, flip=flip)


def trunc(v):
    return int(v)  # (toward 0, as the game's trunc.w.s and Math.trunc)


def facing(x, y):
    """The sine of the way a Togepi faces for a stick x, y (rules.js facing():
    0x86703D98, a quarter turn on from the stick's angle)."""
    y = min(y, 0)
    r = math.sqrt(x * x + y * y)
    return x / r if r else 0


def time_of(f, seed, seat):
    """A finish's time in hundredths of a second (rules.js timeOf(): 0x86703F9C,
    with its 0-2 random hundredths from the round's seed and the seat)."""
    r = ((((seed ^ 0x68E31DA4 ^ ((seat + 1) * 0x9E3779B1)) & 0xFFFFFFFF) * 1664525) + 1013904223) & 0xFFFFFFFF
    return f // FPS * 100 + (f % FPS) * 100 // FPS + r % 3


class Slot:
    __slots__ = ("type", "x", "z", "col", "n", "shown")

    def __init__(self):
        self.type, self.x, self.z, self.col, self.n, self.shown = -1, 0, 3000, 0, 0, False


class _Out:  # a slot past the 60 (an index the CPUs keep for none)
    type, z, x, col = -1, math.inf, 0, 0


class Lane:
    """One lane (rules.js Lane), what decides the race."""

    def __init__(self, seed, seat, crs, level=0):
        self.seat, self.course, self.level = seat, crs, level
        k = ((seat + 1) * 0x9E3779B1) & 0xFFFFFFFF
        self.s2 = (seed ^ 0x5BD1E995 ^ k) & 0xFFFFFFFF
        self.sl = (seed ^ 0x27D4EB2F ^ k) & 0xFFFFFFFF
        self.x, self.z = START_X, RUNNER_Z
        self.tile, self.px, self.progress = 1, 2, 0
        self.state = RUN
        self.jumpT = 0
        self.jumpEnd = 0
        self.boost = 0
        self.boostSide = 0
        self.slow = 1
        self.inFlowers = 0
        self.arrow = 0
        self.dashT = 0
        self.hop = 0
        self.spin = 0
        self.spinning = 0
        self.side = 0
        self.restart = 0
        self.clip, self.frame, self.speed = C_IDLE, 0, 1
        self.animSpeed = 1
        self.row = 0
        self.ring = 0
        self.cycle = 0
        self.corridor = 0
        self.finish = None
        self.prior = None  # its progress the frame before it got in
        self.slots = [Slot() for _ in range(60)]
        self.cpu = self.cpu_setup() if level else None
        self.rank = seat + 1
        self.finishers = 0
        self.spawn_row()

    def r2(self):
        self.s2 = (((4 * self.s2 + 2) * (4 * self.s2 + 3)) & 0xFFFFFFFF) >> 2
        return self.s2

    def rl(self):
        self.sl = (self.sl * 1664525 + 1013904223) & 0xFFFFFFFF
        return self.sl

    # the clip clock
    def set_clip(self, c):
        if c != self.clip:
            self.clip, self.frame = c, 0

    def set_frame(self, f):
        self.frame = f - self.speed

    def done(self):
        return self.frame >= CLIP_LEN[self.clip] - 1

    def advance(self):
        self.frame += self.speed
        n = CLIP_LEN[self.clip]
        if self.frame >= n:
            self.frame -= n

    def step(self, t, sx=0, sy=0, playing=True):
        if self.cpu:
            self.think(playing)
        v = self.dashT
        if v > 0:
            self.dashT += 1
            v = self.dashT
        if v >= 11:
            self.dashT = 0
        v = self.hop
        if v > 0:
            self.hop += 1
            v = self.hop
        if v >= 11:
            v = self.hop = 0
        if v == 5:
            self.boost, self.boostSide = 0.05, 0.01
        if playing and self.state in (RUN, FLOWERS, JUMP):
            self.move(t, sx, sy)
        if self.restart:
            if self.state == JUMP:
                self.restart = 0
            elif self.state in (RUN, FLOWERS):
                self.set_clip(C_RUN)
                self.speed = self.animSpeed
            elif self.state in (KNOCK_S, KNOCK):
                self.set_clip(C_KNOCK)
                self.speed = 2
                self.set_frame(0)
                self.restart = 0
            elif self.state == TRIP:
                self.set_clip(C_TRIP)
                self.speed = 2
                self.set_frame(0)
                self.restart = 0
        a1 = a2 = 0
        f = math.floor(self.frame + 1e-9)
        if self.state in (KNOCK_S, KNOCK) and not self.spinning:
            a2 = -75 if f < 5 else -7 if f < 24 else 0
            a1 = trunc(self.side * a2)
        if self.state == TRIP and not self.spinning:
            if f < 3:
                a2 = -180
            elif f < 13:
                a2 = -18
            elif f == 40:
                self.restart, self.state = 1, RUN
            self.side = 0
        if a1 or a2:
            d = a2 * (self.boost + SPEED) * self.slow
            for o in self.slots:
                o.z += d
            self.px += -a2 * (self.boost + SPEED) * SCROLL * self.slow
            self.roll_track()
            self.x -= a1 * (SIDE + self.boostSide)
            if self.x < MARGIN:
                self.x = MARGIN
            if self.x > LANE - MARGIN - 10:
                self.x = LANE - MARGIN - 10
        if self.done():
            s = self.state
            if s == JUMP:
                self.state, self.restart = RUN, 1
            elif s == FLOWERS:
                if self.jumpT:
                    self.spin = 1
                self.state = RUN
            elif s == GOAL:
                self.restart = 1
                self.set_clip(C_IDLE)
                self.state = DONE
            elif s == RUN:
                self.set_clip(C_IDLE)
                self.restart = 0
            elif s != DONE:
                self.set_clip(C_IDLE)
                self.restart = 0
                if not self.spin:
                    self.spin = 1
        if self.row * ROW_EVERY <= self.tile * 32 + self.px and self.row < ROWS:
            self.spawn_row()
        if self.spin:
            self.spin_on()
        self.advance()
        self.tick(playing)

    def move(self, t, sx, sy):
        D0, CC = sx, sy
        if self.cpu:
            D0 = self.cpu["steer"]
        a = self.jumpT
        if a > 0:
            self.jumpT += 1
            a = self.jumpT
        else:
            self.boostSide = 0
        if a == 0 and self.arrow and self.state == RUN:
            self.dashT = 1
            self.jumpT = a = 1
            self.jumpEnd = self.progress + DASH
            self.boost += BOOST
            self.boostSide += BOOST_SIDE
            self.arrow = 0
        D0 = max(-60, min(60, D0))
        if self.cpu:
            CC = abs(D0) * 15 / 60 - 60
        if CC < -60:
            CC = -60
        CC *= 0.75
        D0 *= 0.75
        if a != 0:
            if self.jumpEnd < self.progress:
                self.boost = -0.01
                self.boostSide = 0
                if self.done():
                    self.jumpT = 0
            elif self.done():
                self.jumpT = 1
        if self.boost < 0:
            if self.done():
                self.state, self.restart = RUN, 1
            if self.boost + SPEED <= 0.01:
                self.boost = 0
            else:
                self.boost -= 0.01
            if CC * SPEED <= (self.boost + SPEED) * -35:
                self.boost = 0
            else:
                CC = -35
        dashT = self.dashT
        if self.jumpT:
            self.side = 0
            CC = -45
        if dashT < 3:
            CC -= dashT * 15
        fwd = lat = 0
        if CC < -5:
            fwd = 1
        else:
            CC = 0
        if D0 > 5 or D0 < -5:
            lat = 1
        else:
            D0 = 0
        if self.collide(t, (self.boostSide + SIDE) * D0 * lat, (self.boost + SPEED) * fwd * CC) > 0:
            if self.jumpT == 1:
                self.state = JUMP
                self.set_clip(C_HOP)
                self.set_frame(0)
                self.speed = self.boost + 1
            if self.state == FLOWERS and self.jumpT == 0:
                self.slow = 0.3
            if self.inFlowers == 1:
                self.slow = 0.3
            if self.slow < 1:
                if self.jumpT == 0 and self.state == RUN:
                    self.slow = 1
                if self.inFlowers == 0:
                    self.slow += 0.1
                if self.slow > 1:
                    self.slow = 1
            if fwd:
                d = CC * (SPEED + self.boost) * self.slow
                if self.tile > END_TILE and self.px > END_PX:
                    self.z -= d
                else:
                    self.px -= d * SCROLL
                for o in self.slots:
                    o.z += d
                self.roll_track()
                was = self.progress
                self.measure()
                for o in self.slots:
                    if o.z < GONE:
                        o.type, o.z, o.shown = -1, 3000, False
                if self.finish is None and self.tile > END_TILE and self.px >= END_PX and self.z >= GOAL_Z:
                    self.finish = t
                    self.prior = was
                    if self.cpu:
                        self.progress = 120 - 3 * self.rank
                    self.side = 0
                    self.set_clip(C_GOAL)
                    self.state = GOAL
            if lat:
                self.x += D0 * (SIDE + self.boostSide) * self.slow
                if self.x < MARGIN:
                    self.x = MARGIN
                if self.x > LANE - MARGIN - 4:
                    self.x = LANE - MARGIN - 4
        if self.jumpT == 0:
            self.restart = 1
        self.animSpeed = 1 if self.state == JUMP else max(1, trunc(max(abs(CC), abs(D0)) / 9))
        if self.jumpT == 0:  # (or, the stick let go, about straight on: 0x86705F40)
            self.side = facing(trunc(D0), trunc(CC)) if CC < -5 or D0 > 5 or D0 < -5 else facing(1, -45)

    def roll_track(self):
        while self.px >= 32:
            self.tile += 1
            self.px -= 32
            if self.tile >= END_TILE and END_PX <= self.px:
                self.px = END_PX + 1
            if self.tile >= 62:
                self.tile = 0

    def measure(self):
        f0, n = (RUNNER_Z - self.z) * SCROLL, 58
        while f0 < 0:
            f0 += 32
            n -= 1
        denom, at = n * 32 - 1 + f0, self.tile * 32 - 1 + self.px
        self.progress = ((self.progress / 2 + at - 33) / denom) * 100 if self.progress <= 66 else (at / denom) * 100

    def collide(self, t, dx, dz):
        if self.hop > 0:
            return 1
        if self.state != JUMP:
            self.state = RUN
        self.inFlowers = 0
        front, px, pz = self.z + FRONT, self.x + dx * 2, self.z - dz * 2
        for o in self.slots:
            typ = o.type
            if typ < 0 or o.z > front:
                continue
            hx, hz = BOX[typ][0] * COLUMN, BOX[typ][1] * COLUMN
            if not (pz < hz + o.z and o.z - hz < pz and px < hx + o.x and o.x - hx < px):
                continue
            if self.jumpT > 0:
                if typ == ARROW:
                    self.dashT = 1
                    self.jumpEnd = self.progress + DASH
                    s = self.boost + SPEED
                    if s < BOOST_MAX:
                        self.boost += BOOST
                        s = self.boost + SPEED
                    if s > BOOST_MAX:
                        self.boost = BOOST_CAP
                    else:
                        self.boostSide += BOOST_SIDE
                elif typ == DIGLETT:
                    if o.n < 7 or o.n >= 27:
                        return 1
                    if o.n < 13:
                        self.hop = 1
                    else:
                        self.knocked()
                elif typ in (ROCK_S, ROCK):
                    self.knocked()
                elif typ in (LOG_S, LOG_M, LOG_L):
                    self.hop = 1
                if typ != FLOWER:
                    o.type, o.shown = -1, False
                else:
                    self.inFlowers = 1
                return 1
            if typ == FLOWER:
                self.state = FLOWERS if self.state == RUN else self.state
            elif typ == ROCK_S:
                self.state = KNOCK_S
            elif typ == ROCK:
                self.state = KNOCK
            elif typ == DIGLETT:
                if o.n < 7 or o.n >= 27:
                    return 1
                if o.n < 13:
                    self.hop = 1
                else:
                    self.state = KNOCK
            elif typ in (LOG_S, LOG_M, LOG_L):
                self.state = TRIP
            elif typ == ARROW:
                self.arrow = 1
            if self.state == FLOWERS:
                return 1
            if typ != DIGLETT:
                o.type, o.shown = -1, False
            if self.cpu:
                self.cpu["target"] = self.nearest(1)
            return -1
        return 1

    def knocked(self):
        self.state = KNOCK
        self.jumpT = 0
        self.boost = 0
        self.boostSide = 0

    def spin_on(self):
        most = 0
        if self.jumpT:
            self.spinning, most = 1, 32
        self.spin += 1
        if most < self.spin:
            self.spin, self.state, self.jumpT, self.spinning = 0, RUN, 0, 0
            return
        self.side = 0

    def spawn_row(self):
        base, sec = (FIRST_ROW if self.row == 0 else ROW_GAP), self.row >> 2
        idx = self.course["pattern"][sec] * 4 + (self.row - 4 * sec)
        flip = self.course["flip"][sec]
        cpu, level = self.cpu, self.level
        mood = cpu["mood"] if cpu else -1
        if idx in (28, 32):
            self.corridor = self.rl() % 3
        for e in PATTERNS[idx >> 2][idx & 3]:
            o = self.slots[self.ring]
            col, depth, typ, a, b, c = e
            if flip:
                col, a, b, c = 18 - col, 18 - a, 18 - b, 18 - c
            o.col = a
            r = self.rl() % 101
            if r >= (PICK_FIRST[level][mood] if level else 0):
                self.slots[self.seat].col = b
            if r < (PICK_LAST[level][mood] if level else 20):
                o.col = c
            if 28 <= idx < 36:
                o.col = [a, b, c][self.corridor]
            if cpu and cpu["lazy"]:
                o.col = a if self.progress > 50 else c
            if self.finishers:
                o.col = a
            o.type = typ
            if typ == DIGLETT:
                v = self.cycle + (self.rl() & 1) + 1
                self.cycle = v
                if v >= 3:
                    self.cycle = v = 0
                o.n = v * 18
            else:
                o.n = 0
            o.z = depth * DEPTH + base
            o.x = X0 + col * COLUMN
            o.shown = o.z < SHOWN
            self.ring = (self.ring + 1) % 60
        self.row += 1

    def tick(self, playing):
        for o in self.slots:
            if o.type == DIGLETT and o.shown:
                if o.n >= 72:
                    o.n = 0
                if o.n / 3 >= 12 and playing:
                    o.n += self.rl() & 1
                o.n += 1
            if o.type >= 0 and not o.shown and o.z < SHOWN:
                o.shown = True

    # a CPU
    def cpu_setup(self):
        L = self.level

        def u():
            return self.rl() / 4294967296
        c = dict(mood=self.r2() % 4, mode=0, side=0, sideCopy=0, steer=0, target=0, pref=0)
        c["lazy"] = 0 if (self.rl() & 3) < 3 else 1
        s = MOOD_SCALE[c["mood"]]
        if L == 1:
            c["look"], c["margin"], c["count"] = self.r2() % 50 + 250, 25 - self.r2() % 10, 4
            c["gain"] = s * (u() * 0.3) + 1.5
            c["thr"] = s * (u() * 0.5) + 4.0
        elif L == 2:
            c["look"], c["margin"], c["count"] = self.r2() % 50 + 200, 25 - self.r2() % 10, 3
            c["gain"] = s * (u() * 0.2) + 1.3
            c["thr"] = s * (u() * 0.2) + 3.5
        elif L == 3:
            c["look"], c["margin"], c["count"] = (self.r2() % 10) * 5 + 150, 30 - self.r2() % 10, 2
            c["gain"] = s * (u() * 0.15) + 1.15
            c["thr"] = s * (u() * 0.15) + 2.8
        else:
            c["look"], c["margin"], c["count"] = (self.r2() % 10) * 5 + 120, 30 - self.r2() % 10, 1
            c["gain"] = s * (u() * 0.15) + 1.0
            c["thr"] = s * (u() * 0.15) + 2.2
        c["pref"] = 1 if self.r2() % 100 >= 51 else -1
        return c

    def slot(self, i):
        return self.slots[i] if 0 <= i < 60 else _Out

    def nearest(self, anyway):
        lim, best = (1000 if anyway else self.z + 30 * COLUMN), NONE
        for i, o in enumerate(self.slots):
            if o.z <= lim and self.z <= o.z and o.type >= 0:
                best, lim = i, o.z
        return self.cpu["target"] if not anyway and best == NONE else best

    def dash_target(self):
        c = self.cpu
        lim, best = c["look"] + self.z - (150 if self.rank == 1 else 0), NONE
        for i in range(60):
            o = self.slots[i]
            if not (o.z <= lim and self.z <= o.z) or o.type < 0:
                continue
            if self.level == 4:
                return i
            if o.type == ARROW:
                r = self.rl() % 101
                if c["lazy"] and self.progress > 50:
                    r = 100
                if ARROW_RANK[self.rank] + ARROW_LEVEL[self.level] < r or self.finishers != 0:
                    best, lim = i, o.z
            else:
                best, lim = i, o.z
        return c["target"] if best == NONE else best

    def think(self, playing):
        c = self.cpu
        if not playing:
            return
        if self.jumpT > 0 and c["mode"] < 2:
            c["target"] = self.dash_target()
        a = c["target"]
        if (a == NONE or self.slot(a).type < 0) and self.jumpT == 0:
            a = c["target"] = self.nearest(0)
        if a == NONE or self.slot(a).type < 0:
            c["steer"] = 0
            return
        c["steer"] = 0
        o, x1 = self.slot(a), self.x
        rz = self.z
        if o.z < c["look"] + rz:
            c["pref"] = 1 if self.r2() % 100 >= 51 else -1
            c["side"] = 0
            if self.avoid(a, o.z, x1):
                c["target"] = self.nearest(0)
                c["side"] = 0
                c["steer"] = 0
            rz = self.z
        else:
            v = (3 - c["mode"]) * 10
            if x1 < v + MARGIN:
                c["pref"] = 1
                v = c["mode"] * -10 + 30
            if LANE - MARGIN - v < x1:
                c["pref"] = -1
            c["steer"] = (c["mode"] + 1) * c["pref"] * 10
        if self.slot(c["target"]).z < rz:
            c["steer"] = 0
            if self.jumpT == 0 or rz < 100:
                c["target"] = self.nearest(1)

    def avoid(self, i, z0, x1):
        c, o = self.cpu, self.slots[i]
        cx = o.col * COLUMN
        if x1 < cx:
            c["side"] = 1
        elif cx < x1:
            c["side"] = -1
        dz = z0 - self.z
        if dz == 0:
            dz = 1
        c["sideCopy"] = c["side"]
        if c["side"] > 0:
            if -c["thr"] < (cx - x1) / dz:
                c["steer"] = trunc(c["gain"] * abs(o.col * COLUMN + x1))
        elif (o.col * COLUMN + x1) / dz < c["thr"]:
            c["steer"] = trunc(c["gain"] * -abs(cx - x1))
        if self.z <= (BOX[o.type][1] + 1) * COLUMN + z0:
            if (cx < x1) if c["sideCopy"] == 1 else (x1 < cx):
                self.x = cx
                return True
        return False


def rank_cpus(lanes):
    cpus = [l for l in lanes if l and l.cpu]
    done = sum(1 for l in cpus if l.finish is not None)
    for l in cpus:
        l.rank = 1 + sum(1 for m in cpus if m.progress > l.progress)
        l.finishers = done


def places(fin, prior, prog, empty=None):
    """rules.js placesOf(): by the finish frame, the same frame's by the progress the
    frame before, then by how far each got; ties share a place. empty: the seats no
    one's in: None, and not counted."""
    empty = empty or [False] * SEATS

    def key(z):
        return (0, fin[z], -(prior[z] or 0)) if fin[z] is not None else (1, -prog[z], 0)
    return [None if empty[z] else 1 + sum(1 for y in range(SEATS) if not empty[y] and key(y) < key(z)) for z in range(SEATS)]


class Round:
    """One round's lanes and how it ended, on the server. empty: [bool x4], the
    seats no one plays (online with the CPUs off): their lanes never run (no
    stick changes taken), they don't hold up the end, and they have no place."""

    def __init__(self, seed, level="normal", cpus=(False, True, True, True), empty=None):
        self.empty = [bool(e) for e in empty] if empty else [False] * SEATS
        self.cpus = [bool(c) and not e for c, e in zip(cpus, self.empty)]
        self.seed = seed
        self.course = course(seed)
        lv = level_code(level)
        self.lanes = [Lane(seed, z, self.course, lv if self.cpus[z] else 0) for z in range(SEATS)]
        self.sticks = [[] for _ in range(SEATS)]  # each person's stick changes: [frame, x, y]
        self.at = [-1] * SEATS  # the last frame each lane has run
        self.done = None  # how it ended, once decided: dict(f, fin, p)
        self.end = LONGEST / FPS + END_AFTER / FPS  # s after GO it's over (sooner once decided)

    def stick_at(self, s, t):
        out = (0, 0)
        for f, x, y in self.sticks[s]:
            if f > t:
                break
            out = (x, y)
        return out

    def run_to(self, t):
        """Every lane up to frame t (the CPUs together: they rank among themselves)."""
        while min(self.at) < t:
            f = min(self.at) + 1
            cpus = [l for z, l in enumerate(self.lanes) if self.cpus[z] and self.at[z] < f]
            for l in cpus:
                l.step(f)
            if cpus:
                rank_cpus(self.lanes)
            for z in range(SEATS):
                if self.at[z] < f:
                    if not self.cpus[z] and not self.empty[z]:
                        x, y = self.stick_at(z, f)
                        self.lanes[z].step(f, x, y)
                    self.at[z] = f

    def stick(self, s, f, x, y, now, allow):
        """Seat s's stick went to x, y on frame f (its device's word); it came
        in at round time now, and may be at most allow s old. Returns the frame
        it counts from, or None."""
        if self.cpus[s] or self.empty[s] or self.done or type(f) is not int or type(x) is not int or type(y) is not int:
            return None
        if not (-60 <= x <= 60 and -60 <= y <= 60):
            return None
        here = int(now * FPS)
        f = min(max(f, here - int(allow * FPS)), here + 1)  # (no older than the way here allows; not in the future)
        f = max(f, self.at[s] + 1, self.sticks[s][-1][0] if self.sticks[s] else 0)  # (in order; not what's been run)
        self.sticks[s].append([f, x, y])
        return f

    def wire(self):
        """What a device needs to rejoin the round: how it ended (once decided) and the people's sticks so far."""
        return dict(tg=dict(done=self.done, sticks=[None if self.cpus[s] or self.empty[s] else [list(e) for e in self.sticks[s]] for s in range(SEATS)]))

    def result(self):
        return self.done

    def places(self):
        """Each seat's place (1 the best; tied, the better one), as the devices'
        game.js places() has them (by the finishes, then how far each got);
        None for an empty seat."""
        d = self.done
        if d:
            return places(d["fin"], d["prior"], [p / 10 for p in d["p"]], self.empty)
        return places([l.finish for l in self.lanes], [l.prior for l in self.lanes], [l.progress for l in self.lanes], self.empty)

    @property
    def scores(self):
        """Each seat's time in hundredths of a second, or -1 (not in when it ended)."""
        if not self.done:
            fin = [l.finish for l in self.lanes]
        else:
            fin = self.done["fin"]
        return [-1 if f is None else time_of(f, self.seed, s) for s, f in enumerate(fin)]

    def settle(self, now, allow):
        """How the race ended, once no stick change still on its way could alter it: dict(f, fin, p,
        prior: each one in's progress the frame before, the places' tie-break) or None."""
        if self.done:
            return None
        safe = int(now * FPS) - int(allow * FPS) - 1
        if safe < 0:
            return None
        fin = [l.finish for l in self.lanes]
        here = [z for z in range(SEATS) if not self.empty[z]]  # (the empty seats' lanes never get there)
        while min(self.at) < safe:
            self.run_to(min(self.at) + 1)
            f = min(self.at)
            fin = [l.finish for l in self.lanes]
            first = min([x for x in fin if x is not None], default=None)
            called = f >= LONGEST or (first is not None and f >= first + CALL)
            if all(fin[z] is not None for z in here) and f >= max(fin[z] for z in here) + END_AFTER or called:
                end = f if called else max(fin[z] for z in here) + END_AFTER
                self.done = dict(f=end, fin=fin, p=[round(l.progress * 10) for l in self.lanes],
                                 prior=[l.prior if l.finish is not None else None for l in self.lanes])
                self.end = (end + END_AFTER) / FPS
                return self.done
        return None

    def next_settle(self, allow):
        """When (round time, s) the end there is now could be decided."""
        if self.done:
            return None
        fin = [l.finish for z, l in enumerate(self.lanes) if not self.empty[z]]
        if all(x is not None for x in fin):
            return (max(fin) + END_AFTER + 2) / FPS + allow
        first = min([x for x in fin if x is not None], default=None)
        return None if first is None else (first + CALL + 2) / FPS + allow
