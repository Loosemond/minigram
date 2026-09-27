"""The rules of an Egg Emergency round, for the rooms server (tools/rooms.py).

The server deals each round's drops and keeps the score itself. Every device
sends the leans of the players it plays (which column, from which moment of
the round), and a drop counts when it reaches the hands: caught (an egg) or a
shock (a Voltorb) if the player's lean at that moment is the drop's column,
unless an earlier shock is still stunning them. The game judges the seats it
plays in the same way from the same leans (Game.takes() in
web/egg-emergency/src/game.js), so an honest device and the server always
agree, and a device can't count catches its player didn't make.
"""
import bisect
import math

SEATS = 4
EGGS = 100
LOSS = 5  # eggs a Voltorb costs
STUN = 0.8  # s after a shock with no catching
LONGEST = 300.0  # s: a lean's time is kept within the round


def mulberry32(a):
    """The game's random numbers (mulberry32() in game.js), bit for bit."""
    a &= 0xFFFFFFFF

    def rnd():
        nonlocal a
        a = (a + 0x6D2B79F5) & 0xFFFFFFFF
        t = ((a ^ (a >> 15)) * (1 | a)) & 0xFFFFFFFF
        t = ((t + (((t ^ (t >> 7)) * (61 | t)) & 0xFFFFFFFF)) & 0xFFFFFFFF) ^ t
        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296

    return rnd


def schedules(seed):
    """makeSchedules() in game.js, step for step, so a seed gives the same drops
    as in the browser: one list per seat of (t, col, kind, fall), by t."""
    rnd = mulberry32(seed)
    timeline = []
    t, eggs = 0.4, 0
    while eggs < EGGS:
        p = eggs / EGGS
        fall = 1.3 - 0.5 * p
        gap = (0.88 - 0.5 * p) * (0.85 + 0.3 * rnd())
        r = rnd()
        kind, n, extra = "single", 1, 0
        if p > 0.08 and r < 0.12 + 0.1 * p:
            kind, extra = "voltorb", 0.25
        elif p > 0.3 and r < 0.3:
            kind, n, extra = "double", 2, 0.2
        elif p > 0.15 and r < 0.45:
            kind, n, extra = "sweep", 3, 0.5
        n = min(n, EGGS - eggs)
        timeline.append((t, kind, n, fall, 0.12 + 0.25 * rnd()))
        eggs += n
        t += gap + extra
    out = []
    for z in range(SEATS):
        r = mulberry32(seed + 7919 * (z + 1))
        drops = []
        last = {-1: -9, 0: -9, 1: -9}

        def add(at, col, kind, fall):
            fall *= 0.94 + 0.12 * r()
            at = max(0.0, at + (r() - 0.5) * 0.12)
            while at + fall - last[col] < 0.32:
                at += 0.06
            last[col] = at + fall
            drops.append((at, col, kind, fall))

        def other(c):
            return [x for x in (-1, 0, 1) if x != c][math.floor(r() * 2)]

        for (et, ek, en, efall, delay) in timeline:
            c = math.floor(r() * 3) - 1
            if ek == "voltorb":
                add(et, c, "voltorb", efall)
                add(et + delay, other(c), "egg", efall)
            elif ek == "double":
                add(et, c, "egg", efall)
                if en > 1:
                    add(et, other(c), "egg", efall)
            elif ek == "sweep":
                d = 1 if r() < 0.5 else -1
                for k in range(en):
                    add(et + k * 0.24, (k - 1) * d, "egg", efall)
            else:
                add(et, c, "egg", efall)
        drops.sort(key=lambda x: x[0])
        out.append(drops)
    return out


class Round:
    """One round's drops, leans and scores, on the server."""

    def __init__(self, seed):
        # to the millisecond: that's what the devices get, so both work from the same numbers
        self.drops = [[(round(t, 3), col, kind, round(fall, 3)) for t, col, kind, fall in seat] for seat in schedules(seed)]
        self.arrive = [[d[0] + d[3] for d in seat] for seat in self.drops]  # when each reaches the hands
        self.order = [sorted(range(len(a)), key=lambda n: (a[n], n)) for a in self.arrive]
        self.place = [{n: i for i, n in enumerate(o)} for o in self.order]
        self.next = [0] * SEATS  # how many of each seat's drops are settled, in the order they arrive
        self.times = [[] for _ in range(SEATS)]  # each seat's leans: from times[i], it leans cols[i]
        self.cols = [[] for _ in range(SEATS)]
        self.hit = [-math.inf] * SEATS  # when the last shock was
        self.scores = [0] * SEATS
        self.results = [{} for _ in range(SEATS)]  # drop -> (k, eggs after): the catches and shocks
        self.end = max(max(a) for a in self.arrive)  # the last drop reaches the hands

    def wire(self):
        """The drops as the devices get them: [t, col, "e" or "v", fall]."""
        return [[[t, col, "v" if kind == "voltorb" else "e", fall] for t, col, kind, fall in seat] for seat in self.drops]

    def lean(self, s, g, l):
        """Seat s leans l (-1, 0, 1) from round time g. The time is kept in order
        (never before the seat's last lean), as on the device; returns it."""
        ts, cs = self.times[s], self.cols[s]
        g = min(max(g, ts[-1] if ts else 0.0), LONGEST)
        if not cs or cs[-1] != l:
            ts.append(g)
            cs.append(l)
        return g

    def lean_at(self, s, a):
        i = bisect.bisect_right(self.times[s], a) - 1
        return self.cols[s][i] if i >= 0 else 0

    def last_lean(self, s):
        return [self.times[s][-1], self.cols[s][-1]] if self.times[s] else None

    def settled(self, s, n):
        return self.place[s][n] < self.next[s]

    def settle(self, s, upto):
        """Judge seat s's drops that reach the hands by round time upto, in that
        order. Returns the catches and shocks: [(n, "c" or "h", eggs after, when)]."""
        out = []
        order, arrive = self.order[s], self.arrive[s]
        while self.next[s] < len(order) and arrive[order[self.next[s]]] <= upto:
            n = order[self.next[s]]
            self.next[s] += 1
            _, col, kind, _ = self.drops[s][n]
            a = arrive[n]
            if self.lean_at(s, a) != col or self.hit[s] < a <= self.hit[s] + STUN:
                continue  # missed, or still stunned
            if kind == "egg":
                self.scores[s] += 1
                k = "c"
            else:
                self.scores[s] -= min(self.scores[s], LOSS)
                self.hit[s] = a
                k = "h"
            self.results[s][n] = (k, self.scores[s])
            out.append((n, k, self.scores[s], a))
        return out
