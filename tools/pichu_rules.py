"""The rules of a Pichu's Power Plant round, for the rooms server (tools/rooms.py).

The same Electrodes, presses, CPUs and finish as
web/minigames/src/pichu/rules.js, which has the rules and where each number
comes from in the game's code: keep the two the same (tools/test_rooms.py and
the browser tests check them against each other). The server makes the
round's Electrodes from the seed, takes the presses the devices report (the
frame, the direction and the button), checks each could have happened then (not
in the future, not older than the way here allows, not while shocked or too
soon after the last), works out the charge, plays the CPUs itself, and says
who finished first once no press still on its way could change it.
"""
import math

SEATS = 4
FPS = 30
FULL = 80
SHOCK = 10
GAP = 2
END = 130
A, B = 5, 6
LEVELS = {"easy": 1, "normal": 2, "hard": 3}
BASE = {0: 70, 1: 60, 2: 60, 3: 80, 4: 120}
WARN = {0: 35, 1: 25, 2: 25, 3: 40, 4: 60}
FIRST = [1, 12, 15, 20, 25]
STICK = {1: 0, 2: 0, 3: 0, 4: 1}
CPU_ADD = {1: 1, 2: 2, 3: 4, 4: 6}
CPU_DIV = {1: 120, 2: 140, 3: 120, 4: 140}
MOOD = {1: [0, 10, 30, 40, 50], 2: [0, 20, 40, 70, 90], 3: [0, 20, 30, 40, 50], 4: [0, 10, 30, 40, 50]}
RAMP = {1: 8, 2: 10, 3: 20, 4: 25}


def _rows():
    out = []

    def perm(rest, row):
        if not rest:
            out.append(row)
        for i, d in enumerate(rest):
            perm(rest[:i] + rest[i + 1:], row + [d])
    perm([1, 2, 3, 4], [])
    return out


ROWS = _rows()


def quad(seed):
    x = seed & 0xFFFFFFFF

    def rnd():
        nonlocal x
        x = (((4 * x + 2) * (4 * x + 3)) & 0xFFFFFFFF) >> 2
        return x
    return rnd


def lcg(seed):
    x = seed & 0xFFFFFFFF

    def rnd():
        nonlocal x
        x = (x * 1664525 + 1013904223) & 0xFFFFFFFF
        return x
    return rnd


def level_code(level, cpus):
    return 4 - LEVELS.get(level, 2) if cpus else 0


def pattern(seed, c, frames=FPS * 300):
    """The round's Electrodes and each frame's cycle state (rules.js pattern())."""
    r2, rl = quad(seed ^ 0x2545F491), lcg(seed ^ 0x6D2B79F5)
    W, L0, step = WARN[c], BASE[c], 2 if c < 3 else 1
    lst = []
    at = dict(g0=[0] * frames, L=[0] * frames, cur=[0] * frames, nxt=[0] * frames)
    st = dict(g0=0, total=0, L=0, event=-100, bal=0, run=0, col=0, row=0, cur=-1, nxt=-1)
    inf = math.inf

    def setup(t):
        while True:
            if st["col"] == 0:
                st["row"] = r2() % 24
            d = ROWS[st["row"]][st["col"]]
            st["col"] = (st["col"] + 1) % 4
            if st["nxt"] < 0 or d != lst[st["nxt"]]["dir"]:
                break
        if rl() % 101 < 50 - 15 * st["bal"]:
            b = A
            st["bal"] += step
        else:
            b = B
            st["bal"] -= step
        if st["nxt"] >= 0:
            if b == lst[st["nxt"]]["btn"]:
                st["run"] += 1
            elif st["run"] < (STICK[c] if c else st["col"]):
                b = lst[st["nxt"]]["btn"]
                st["run"] += 1
            else:
                st["run"] = 0
        if st["nxt"] < 0:
            while True:
                n = r2() % 4 + 1
                if n != d:
                    break
            lst.append(dict(dir=n, btn=b, frm=t, close=inf, to=inf))
            st["nxt"] = len(lst) - 1
        else:
            lst[st["cur"]]["to"] = t
        st["cur"] = st["nxt"]
        lst.append(dict(dir=d, btn=b, frm=inf, close=inf, to=inf))
        st["nxt"] = len(lst) - 1

    for t in range(frames):
        st["total"] += 1
        st["g0"] += 1
        if st["g0"] == st["event"]:
            lst[st["nxt"]]["frm"] = t
        if st["cur"] >= 0 and st["g0"] + 8 == st["L"]:
            lst[st["cur"]]["close"] = t
        if st["L"] < st["g0"]:
            st["L"] = L0 - (r2() % 30 + 40) // 5
            st["event"] = st["L"] - W + FIRST[c] if st["total"] < 10 else st["L"] - W - 5
            st["g0"] = 0
            setup(t)
        at["g0"][t], at["L"][t], at["cur"][t], at["nxt"][t] = st["g0"], st["L"], st["cur"], st["nxt"]
    return dict(list=lst, at=at, frames=frames)


def live_at(P, t, d):
    for e in reversed(P["list"]):
        if e["frm"] >= t:
            continue
        if e["dir"] == d and t <= e["to"]:
            return e
        if e["to"] < t - 200:
            break
    return None


class Runner:
    """One person's charge from their presses, in order (rules.js Runner)."""

    def __init__(self, P):
        self.P = P
        self.charge = 0
        self.last = -99
        self.miss_at = -99
        self.full = None
        self.presses = []

    def can(self, t):
        return self.full is None and t - self.last >= GAP and not (self.miss_at < t <= self.miss_at + SHOCK)

    def press(self, t, d, btn):
        if not self.can(t):
            return None
        self.last = t
        if not d:
            return None
        e = live_at(self.P, t, d)
        if e and e["btn"] == btn:
            self.charge += 1
            if self.charge >= FULL:
                self.full = t
            res = "hit"
        else:
            self.miss_at = t
            res = "miss"
        self.presses.append((t, d, btn, res))
        return res


def cpu_presses(seed, c, cpus, P, w=30):
    """Each CPU seat's presses and finish frame (rules.js cpuPresses()); w: W
    as it was before the round (30 in a first round)."""
    if not any(cpus) or not c:
        return [None] * SEATS
    r2, rl, at = quad(seed ^ 0x1B873593), lcg(seed ^ 0x3C6EF372), P["at"]
    players = []
    for i in range(SEATS):
        players.append(dict(i=i, cpu=bool(cpus[i]), off=r2() % w - 5, mood=rl() % 5, planned=False, at=0, dir=0,
                            free=False, miss_at=-99, charge=0, full=None, presses=[]))
    ramp = rl() % 11
    for t in range(P["frames"]):
        g0 = at["g0"][t - 1] if t else 0
        for p in players:
            if not p["cpu"] or p["full"] is not None:
                continue
            if p["miss_at"] < t <= p["miss_at"] + SHOCK:
                continue
            if not p["planned"] or not p["at"] < g0:
                continue
            e = live_at(P, t, p["dir"])
            hit = e is not None
            if not e and p["free"]:
                hit, p["free"] = True, False
            if hit:
                p["charge"] += 1
                if p["charge"] >= FULL:
                    p["full"] = t
                if e:
                    p["planned"] = False
            else:
                p["miss_at"] = t
                p["planned"] = False
            p["presses"].append(dict(t=t, dir=p["dir"], hit=hit))
        if all(not p["cpu"] or p["full"] is not None for p in players):
            break
        if at["g0"][t] == 0:
            for p in players:
                if p["cpu"]:
                    p["planned"] = False
        L, cur, nxt = at["L"][t], P["list"][at["cur"][t]], P["list"][at["nxt"][t]]
        for p in players:
            if not p["cpu"] or p["planned"] or p["full"] is not None:
                continue
            p["planned"] = True
            x = r2() % 399
            add = 0
            if c == 3:
                a0 = CPU_DIV[3] - MOOD[3][p["mood"]] + RAMP[3] * ramp
                if ramp >= 8:
                    add, a0 = -1, a0 - 150
                if a0 <= 0:
                    a0 = 10
            else:
                a0 = CPU_DIV[c] - MOOD[c][p["mood"]] + RAMP[c] * ramp
            p["at"] = at["g0"][t] + add + x // a0 + CPU_ADD[c]
            p["dir"] = cur["dir"]
            if L - p["off"] < p["at"]:
                if c == 1:
                    wrong = x < 10 and ramp < 7
                elif c == 2:
                    wrong = x < 30
                elif c == 3:
                    wrong = x < (100 if ramp < 7 else 50)
                else:
                    wrong = x < 120
                if c != 4 and not wrong:
                    p["free"] = True
                p["dir"] = (rl() & 3) + 1 if wrong else nxt["dir"]
    return [dict(presses=p["presses"], full=p["full"]) if p["cpu"] else None for p in players]


def finish(fulls):
    at = min([f for f in fulls if f is not None], default=None)
    return None if at is None else (at, [f == at for f in fulls])


class Round:
    """One round's presses and finish, on the server."""

    def __init__(self, seed, level="normal", cpus=(False, True, True, True), after=None):
        """after: the room's last round (any game's): a Pichu's Power Plant
        one before makes this a "play again", whose CPUs' margins take that
        round's W (rules.js cpuPresses())."""
        self.cpus = list(cpus)
        self.c = level_code(level, any(self.cpus))
        self.w = WARN[after.c] if isinstance(after, Round) else 30
        self.P = pattern(seed, self.c)
        self.cpu = cpu_presses(seed, self.c, self.cpus, self.P, self.w)
        self.runners = [None if self.cpus[s] else Runner(self.P) for s in range(SEATS)]
        self.done = None  # (finish frame, winners), once decided
        self.end = self.P["frames"] / FPS  # s after GO: the finish's + END once decided (the pattern's end if no one gets there)

    def fulls(self):
        return [self.cpu[s]["full"] if self.cpus[s] else self.runners[s].full for s in range(SEATS)]

    def charges(self, upto=math.inf):
        out = []
        for s in range(SEATS):
            if self.cpus[s]:
                out.append(sum(1 for p in self.cpu[s]["presses"] if p["hit"] and p["t"] <= upto))
            else:
                out.append(sum(1 for p in self.runners[s].presses if p[3] == "hit" and p[0] <= upto))
        return out

    @property
    def scores(self):
        """Each seat's charge: at the finish, once it's decided."""
        return self.charges(self.done[0] if self.done else math.inf)

    def wire(self):
        """What a device needs to rejoin the round: the finish (once decided)
        and the people's presses so far."""
        presses = [None if r is None else [[t, d, b] for t, d, b, _ in r.presses] for r in self.runners]
        pp = dict(done=self.result(), presses=presses)
        if self.w != 30:
            pp["w"] = self.w  # (a "play again": the CPUs' margins)
        return dict(pp=pp)

    def result(self):
        if not self.done:
            return None
        at, winners = self.done
        return dict(f=at, w=[1 if w else 0 for w in winners], e=self.charges(at))

    def press(self, s, f, d, btn, now, allow):
        """Seat s pressed btn with the stick held to d on frame f (its
        device's word); it came in at round time now (s after GO), and may be
        at most allow s old (the way here). Returns (the frame it counts on,
        "hit" or "miss"), or None if it doesn't work."""
        if self.cpus[s] or self.done or type(f) is not int or d not in (1, 2, 3, 4) or btn not in (A, B):
            return None
        here = int(now * FPS)
        f = min(max(f, here - int(allow * FPS)), here + 1)  # (no older than the way here allows; not in the future)
        fin = finish(self.fulls())
        if fin and f > fin[0]:
            return None  # (after the finish)
        res = self.runners[s].press(f, d, btn)
        return None if res is None else (f, res)

    def settle(self, now, allow):
        """The finish, once it can't change any more (no press still on its
        way could make someone full sooner): (frame, winners) or None."""
        if self.done:
            return None
        fin = finish(self.fulls())
        if not fin:
            return None
        if now * FPS < fin[0] + allow * FPS + 1:
            return None
        self.done = fin
        self.end = (fin[0] + END) / FPS
        return fin

    def next_settle(self, allow):
        """When (round time, s) the finish there is now can be decided."""
        fin = finish(self.fulls())
        return None if fin is None or self.done else (fin[0] + 1) / FPS + allow
