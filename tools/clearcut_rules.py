"""The rules of a Clear Cut Challenge round, for the rooms server (tools/rooms.py).

The same deal and judging as web/minigames/src/clearcut/rules.js, which has
the rules and where each number comes from in the game's code: keep the two
the same (tools/test_rooms.py and the browser tests check them against each
other). The server deals each log's target from the round's seed, judges the
cuts the devices report (the frame each player pressed on, after the drop)
and keeps the score, so a device can't give its player points for a cut they
didn't make at that moment; a player who doesn't cut in time scores the miss.
"""
import math
import struct

SEATS = 4
FPS = 30
LOGS = 5
Y0 = 285
LENGTH = 389
TOP = 92
BOTTOM = TOP - LENGTH - 10
BLADE = 90
FALL_FRAMES = 80
POINTS = [20, 10, 5, 4, 3, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]
MISS = -10
LATE_MAX = 5
AGAIN = 45  # after a miss, the frames till A works again (0x86503C90)
WAITS = [100, 40, 0, 70, 150]
LEVELS = {"easy": 1, "normal": 2, "hard": 3}
RATE = {1: 0.45, 2: 0.4, 3: 0.35, 4: 0.3}
TARGET = {0: (2, -4), 1: (1, -3), 2: (2, -4), 3: (4, -6), 4: (4, -7)}
RISE = 117
SHOW = 195


def f32(x):
    """x rounded to a 32-bit float (the game's floats; Math.fround in JS)."""
    return struct.unpack("<f", struct.pack("<f", x))[0]


def lcg(seed):
    """The game's random numbers 0x800357EC: x * 1664525 + 1013904223."""
    x = seed & 0xFFFFFFFF

    def rnd():
        nonlocal x
        x = (x * 1664525 + 1013904223) & 0xFFFFFFFF
        return x

    return rnd


def quad(seed):
    """And 0x8007B100: (4x + 2)(4x + 3) / 4, in 32 bits."""
    x = seed & 0xFFFFFFFF

    def rnd():
        nonlocal x
        x = (((4 * x + 2) * (4 * x + 3)) & 0xFFFFFFFF) >> 2
        return x

    return rnd


def level_code(level, cpus):
    return 4 - LEVELS.get(level, 2) if cpus else 0


class Fall:
    """How the logs fall for a round's level code c (fall() in rules.js)."""

    def __init__(self, c):
        self.c = c
        self.r = f32(RATE[c or 2])
        self.k = 4.9 * self.r * self.r
        root = f32(math.sqrt(f32((Y0 - TOP) / 4.9)))
        self.w0 = int(f32(f32(f32(root / self.r) + 1) - 2))
        self.size = sum(1 for f in range(self.w0 + 2, self.w0 + 102) if not self.y(f) < BOTTOM and not TOP < self.y(f))
        self.reach = 0  # the first frame the log's bottom is down to the blade
        while TOP < self.y(self.reach):
            self.reach += 1

    def y(self, f):
        """The log's bottom f frames after the drop (f < 0: it hangs)."""
        return Y0 if f < 0 else f32(Y0 - self.k * f * f)


def deal(seed, c):
    """Each log's wait (frames from ready to the drop) and target frame T."""
    fall = Fall(c)
    L, Q = lcg(seed), quad((seed ^ 0x2545F491) & 0xFFFFFFFF)
    slots = [0, 1, 2, 3, 4]
    for _ in range(10):
        a = Q() % 5
        b = Q() % 5
        while b == a:
            b = Q() % 5
        if a and b:
            slots[a], slots[b] = slots[b], slots[a]
    first, spread = TARGET[c]
    logs = []
    for slot in slots:
        t = fall.w0 + L() % (fall.size + spread + 1) + first
        logs.append(dict(wait=WAITS[slot], T=t, line=f32(BLADE - (Y0 - fall.k * (t + 2) * (t + 2)))))
    return logs


def timeline(logs):
    """When each log starts, is ready, drops, is judged and ends: frames from GO."""
    out, t = [], 0
    for log in logs:
        start = t
        ready = start + RISE
        drop = ready + log["wait"]
        judged = drop + FALL_FRAMES
        end = judged + SHOW
        out.append(dict(start=start, ready=ready, drop=drop, judged=judged, end=end))
        t = end
    return out


def judge(fall, log, f):
    """What a press f frames after the drop (negative: while the log hangs)
    comes to: the points it adds (or, negative, takes off). f None: no cut."""
    if f is None:
        return MISS
    at = fall.y(f + 2)
    if at < BOTTOM or TOP < at:
        return MISS
    d = log["T"] - f
    return POINTS[min(d, 15)] if d >= 0 else -min(-d, LATE_MAX)


def add(total, pts):
    return total + pts if pts >= 0 else max(0, total + pts)


def again(fall, f):
    """After a miss at frame f, the frame A works again from, or None: a miss
    while the log's still above the blade locks A for the log if the log gets
    down to the blade within the 45 frames (again() in rules.js)."""
    return None if f < fall.reach <= f + AGAIN else f + AGAIN


def is_open(fall, pts, f):
    """A swing at f that came to pts: a miss the player may yet follow up
    (open() in rules.js), which counts once the log's judged."""
    if f is None or pts != MISS:  # (-10 with a swing: a miss)
        return False
    a = again(fall, f)
    return a is not None and a < FALL_FRAMES


class Round:
    """One round's logs, cuts and scores, on the server."""

    def __init__(self, seed, level="normal", cpus=True):
        self.c = level_code(level, cpus)
        self.fall = Fall(self.c)
        self.logs = deal(seed, self.c)
        self.times = timeline(self.logs)
        self.cuts = [[None] * LOGS for _ in range(SEATS)]  # (f or None, points) per seat and log, once it counts
        self.open = [[None] * LOGS for _ in range(SEATS)]  # a miss that may yet be followed up: (f, points)
        self.scores = [0] * SEATS
        self.end = self.times[-1]["end"] / FPS  # s after GO: the last log's show is over

    def wire(self):
        """The round as the devices get it (they deal the logs from the seed and c):
        per seat and log [f, points], or [f, points, 1] for an open miss."""
        return dict(c=self.c, scores=self.scores,
                    cuts=[[[x[0], x[1]] if x is not None else [o[0], o[1], 1] if o is not None else None
                           for x, o in zip(seat, opens)] for seat, opens in zip(self.cuts, self.open)])

    def cut(self, s, n, f, now):
        """Seat s pressed f frames after log n's drop (negative: while it
        hung), as its device says, and it came in at round time now (s after
        GO). Returns what it comes to, [(n, f, points, total, open)] (after
        misses for the logs before it that the seat didn't cut: the totals go
        in order; open: a miss that doesn't count yet, as the seat may swing
        again), or None if it doesn't count: a swing when A doesn't work (after
        a cut, or too soon after a miss), or one out of time."""
        if not 0 <= n < LOGS or self.cuts[s][n] is not None:
            return None
        t = self.times[n]
        if now < t["ready"] / FPS - 2 or now > t["judged"] / FPS + 2:
            return None  # (2 s: how far a device's clock may be off)
        f = max(t["ready"] - t["drop"], min(int(f), FALL_FRAMES - 1))
        if (t["drop"] + f) / FPS > now + 2:
            return None  # a press in the future
        was = self.open[s][n]
        if was is not None:
            a = again(self.fall, was[0])
            if a is None or f < a:
                return None  # A didn't work yet, or not again this log
        done = self._upto(s, n)
        pts = judge(self.fall, self.logs[n], f)
        if is_open(self.fall, pts, f):
            self.open[s][n] = (f, pts)
            return done + [(n, f, pts, self.scores[s], True)]
        return done + [self._score(s, n, f)]

    def settle(self, s, upto):
        """Seat s's logs judged by round time upto: those it didn't cut are
        misses, and so are its open ones. Returns [(n, f, points, total, False)]."""
        n = 0
        while n < LOGS and self.times[n]["judged"] / FPS <= upto:
            n += 1
        return self._upto(s, n)

    def _upto(self, s, n):
        return [self._score(s, m, None if self.open[s][m] is None else self.open[s][m][0])
                for m in range(n) if self.cuts[s][m] is None]

    def _score(self, s, n, f):
        pts = judge(self.fall, self.logs[n], f)
        self.cuts[s][n] = (f, pts)
        self.open[s][n] = None
        self.scores[s] = add(self.scores[s], pts)
        return (n, f, pts, self.scores[s], False)
