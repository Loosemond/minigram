"""The rules of an Eager Eevee round, for the rooms server (tools/rooms.py).

The same script, presses and judging as web/minigames/src/eevee/rules.js,
which has the rules and where each number comes from in the game's code: keep
the two the same (tools/test_rooms.py and the browser tests check them
against each other). The server deals each round's script from the seed (what's
under the basket, when it comes up, Aipom's fakes), takes the presses the
devices report (the frame each player pressed on, from GO), checks they could
have happened then (an Eevee that's run into the basket or been blown up by a
Pineco can't dash again till it's back at its place) and that they're not
older than the way here allows, and says who gets each prize.
"""

SEATS = 4
FPS = 30
ROUNDS = 5
LEVELS = {"easy": 1, "normal": 2, "hard": 3}
FRUIT, BERRIES, PINECO = 0, 1, 2
MELON, GRAPES = 0, 1
POINTS = {MELON: 1000, GRAPES: 500}
BERRY = 100
PILE = 10
UNIT = 9000  # a radian
TURN = 56549  # 2 pi
SPIN = (144, 172)  # the ring's turn a frame (0.016, 0.0191111 in the final round)
LEAD = 16  # round 1's call, frames after GO (0x86B08B74)
INTRO = 28
LID, RUN, WINDOW = 4, 4, 99
AFTER = 150  # (the remake's: one length every device agrees on)
FEINT, BONK = (11, 12), (87, 109)
BLOWN_CLIPS, WALK_IN = 115, 42
PINECO_CLOSE = 24


def level_code(level, cpus):
    return LEVELS.get(level, 2) if cpus else 2


def quad(seed):
    """The game's random numbers 0x8007B100: (4x + 2)(4x + 3) / 4, in 32 bits."""
    x = seed & 0xFFFFFFFF

    def rnd():
        nonlocal x
        x = (((4 * x + 2) * (4 * x + 3)) & 0xFFFFFFFF) >> 2
        return x

    return rnd


def deal(seed, level, outs=()):
    """Each round's script: what's under the basket, the open (frames into
    its race) and Aipom's fakes (deal() in rules.js). outs[n]: a mask of the
    seats outside the ring as round n is dealt; O is drawn again for each
    (0x86B0B2C8)."""
    q = quad(seed)
    rounds = []
    last = [-1, -1]
    for n in range(ROUNDS):
        fruit, piles = MELON, 1
        if n < ROUNDS - 1:
            pineco = not (n == 0 and level <= 1)
            while True:
                kind = [FRUIT, FRUIT, BERRIES, PINECO][q() % 4] if pineco else [FRUIT, FRUIT, BERRIES][q() % 3]
                if not (kind == last[0] and kind == last[1]):
                    break
            last = [last[1], kind]
            if kind == FRUIT:
                fruit = GRAPES if q() % 3 else MELON
        else:
            kind, piles = BERRIES, 3
        if level <= 1 or q() % 100 >= 20:
            opened = q() % 141 + 60
        else:
            opened = q() % 21 + 30
        mask = outs[n] if n < len(outs) and outs[n] else 0
        for s in range(SEATS):
            if mask >> s & 1:
                opened = q() % 51 + 70
        fakes = []
        if opened >= 60:
            r = q() % 100
            if level <= 1:
                count = 2 if r < 5 else 1 if r < 30 else 0
            else:
                count = 3 if r < 5 else 2 if r < 15 else 1 if r < 40 else 0
            if count:
                v = (opened - 10) // count
                for k in range(count):
                    fakes.append(q() % (v - 14) + v * k + 10)
        rounds.append(dict(n=n, kind=kind, fruit=fruit, piles=piles, open=opened, fakes=fakes, final=n == ROUNDS - 1))
    return rounds


def timeline(rounds):
    """When each round starts, its race starts (play), the basket comes up
    (open), A stops working (close) and it ends: frames from GO."""
    out, t = [], LEAD
    for rd in rounds:
        start = t
        play = start + INTRO
        opened = play + rd["open"]
        end = opened + AFTER
        out.append(dict(start=start, play=play, open=opened, close=opened + WINDOW, end=end,
                        fakes=[play + f for f in rd["fakes"]]))
        t = end
    return out


def round_at(times, t):
    for n, tm in enumerate(times):
        if t < tm["end"]:
            return n
    return len(times) - 1


def ring(times, t):
    """How far the ring's turned by the end of frame t (units): from the first call."""
    if t < LEAD:
        return 0
    f = times[ROUNDS - 1]["start"]
    return SPIN[0] * (min(t + 1, f) - LEAD) + SPIN[1] * max(0, t + 1 - f)


def tally_frames(top):
    """The end's tally (0x86B08F20): k more on its frame k, till the most
    anyone has (top) is in; the frames before the hand-over (0x86B09148)."""
    k = 0
    while k * (k + 1) // 2 < top:
        k += 1
    return k


def handover(times, top):
    """The frame (from GO) the game hands over to the results."""
    return times[ROUNDS - 1]["end"] + 1 + tally_frames(top)


class Runner:
    """A seat's presses: whether each works, and what comes of it (Runner in rules.js)."""

    def __init__(self, times, rounds):
        self.times, self.rounds = times, rounds
        self.after = 0  # A and B work from this frame, after a feint or the basket
        self.got_in = [None] * ROUNDS
        self.pineco = None  # the frame it dashed at its last Pineco
        self.cache = None

    def retime(self, times, rounds):
        """The rounds dealt again."""
        self.times, self.rounds, self.cache = times, rounds, None

    @property
    def ready(self):
        return self.after if self.pineco is None else max(self.after, self.back() + WALK_IN)

    def back(self):
        """Blown away: the frame its place comes round to it (then it walks in)."""
        if self.pineco is None:
            return None
        if self.cache is None or self.cache[0] is not self.times or self.cache[1] != self.pineco:
            self.cache = (self.times, self.pineco, self.blown_back(self.pineco) - WALK_IN)
        return self.cache[2]

    def outside(self, s):
        """Outside the ring on frame s: blown away or waiting for its place."""
        return self.pineco is not None and self.pineco + RUN <= s < self.back()

    def can(self, t, closed=None):
        n = round_at(self.times, t)
        tm = self.times[n]
        return (t >= self.ready and t >= tm["play"] and t < tm["close"] and self.got_in[n] is None
                and (closed is None or t <= closed))

    def press(self, k, t, closed=None):
        """k ("a" or "b") on frame t: None if it doesn't work, else (n, bonk, in)."""
        if not self.can(t, closed):
            return None
        n = round_at(self.times, t)
        tm, fin = self.times[n], 1 if self.rounds[n]["final"] else 0
        if k == "b":
            self.after = t + FEINT[fin]
            return n, False, None
        if t < tm["open"] + LID:
            self.after = t + BONK[fin]
            return n, True, None
        self.got_in[n] = t + RUN
        if self.rounds[n]["kind"] == PINECO:
            self.pineco = t
        return n, False, t + RUN

    def blown_back(self, t):
        start, fin = ring(self.times, t - 1), self.times[ROUNDS - 1]["start"]
        u = t + RUN + BLOWN_CLIPS
        while ring(self.times, u) - start < TURN - SPIN[1 if u >= fin else 0]:
            u += 1
        return u + WALK_IN


def outside_mask(runners, s):
    """Who's outside as a round is dealt on frame s (a mask of seats)."""
    return sum(1 << z for z, r in enumerate(runners) if r.outside(s))


def eat(rd, ins, t=None, pts=None):
    """Strawberries: what's left of each pile at the end of frame t, the frame
    the last went, and (in pts) what each seat's had (eat() in rules.js)."""
    arrived = [a if a is not None else float("inf") for a in ins]
    pts = pts if pts is not None else [0] * SEATS
    left = [PILE] * rd["piles"]
    u = min(arrived)
    while u != float("inf") and (t is None or u <= t) and any(c > 0 for c in left):
        for p in range(len(left)):
            if left[p] <= 0:
                continue
            for s in range(SEATS):
                if arrived[s] > u:
                    continue
                pts[s] += BERRY
                left[p] = max(0, left[p] - 1)
        u += 1
    return left, u - 1


def judge(rd, ins):
    """A round's race from the frames each seat got in (or None): (points by
    seat, the frame it was decided), or None while nobody's got there."""
    arrived = [a if a is not None else float("inf") for a in ins]
    first = min(arrived)
    if first == float("inf"):
        return None
    if rd["kind"] == FRUIT:
        return [POINTS[rd["fruit"]] if a == first else 0 for a in arrived], first
    if rd["kind"] == PINECO:
        return [0] * SEATS, first + PINECO_CLOSE
    pts = [0] * SEATS
    _, last = eat(rd, ins, None, pts)
    return pts, last


class Round:
    """One game's rounds, presses and scores, on the server."""

    def __init__(self, seed, level="normal", cpus=True):
        self.seed = seed
        self.level = level_code(level, cpus)
        # who's outside the ring as each round is dealt (a mask of seats: deal's
        # outs), once the round has started (None till then; round 1's is no one)
        self.outs = [0] + [None] * (ROUNDS - 1)
        self.rounds = deal(seed, self.level)
        self.times = timeline(self.rounds)
        self.runners = [Runner(self.times, self.rounds) for _ in range(SEATS)]
        self.scores = [0] * SEATS
        self.prizes = [[None] * ROUNDS for _ in range(SEATS)]
        self.decided = [None] * ROUNDS  # the rounds whose prizes are given: the frame each was decided
        self.dealt = []  # (round, mask) dealt and not yet told to the devices

    @property
    def end(self):
        """s after GO: the hand-over, after the tally of the points."""
        return handover(self.times, max(self.scores)) / FPS

    def wire(self):
        """The game as a device needs it to rejoin it."""
        return dict(ee=dict(level=self.level, scores=self.scores, prizes=self.prizes, out=self.outs))

    def deal_to(self, here):
        """Deal each round that's started by frame here (0x86B0B04C, as it
        starts): who's outside then, from the presses here so far, decides its
        open, and so when the rounds after it come. The devices are told
        (dealt), so all of them have the server's."""
        for n in range(1, ROUNDS):
            if self.outs[n] is not None:
                continue
            if here < self.times[n]["start"]:
                break
            m = outside_mask(self.runners, self.times[n]["start"])
            self.outs[n] = m
            self.dealt.append((n, m))
            if m:
                self.rounds = deal(self.seed, self.level, [o or 0 for o in self.outs])
                self.times = timeline(self.rounds)
                for r in self.runners:
                    r.retime(self.times, self.rounds)

    def take_dealt(self):
        """The rounds dealt since last asked, [(n, mask)]."""
        out, self.dealt = self.dealt, []
        return out

    def press(self, s, k, f, now, allow):
        """Seat s pressed k on frame f (its device's word); it came in at
        round time now (s after GO), and may be at most allow s old (the way
        here). Returns the frame it counts on, or None if it doesn't work."""
        if k not in ("a", "b") or type(f) is not int:
            return None
        here = int(now * FPS)
        f = min(max(f, here - int(allow * FPS)), here + 1)  # (no older than the way here allows; not in the future)
        self.deal_to(max(here, f))
        n = round_at(self.times, f)
        res = self.runners[s].press(k, f, self.decided[n])
        return None if res is None else f

    def settle(self, now, allow):
        """The rounds whose prizes can be given by round time now (nothing
        older than allow can still change them), as [(n, points by seat,
        totals, decided)]."""
        out = []
        here = int(now * FPS)
        self.deal_to(here)
        for n, rd in enumerate(self.rounds):
            if self.decided[n] is not None:
                continue
            res = judge(rd, [r.got_in[n] for r in self.runners])
            if res is None:
                if here >= self.times[n]["end"]:
                    self.decided[n] = self.times[n]["end"]  # no one got there
                continue
            pts, decided = res
            if here < decided + int(allow * FPS) + 1 and here < self.times[n]["end"]:
                continue
            self.decided[n] = decided
            for s in range(SEATS):
                self.scores[s] += pts[s]
                if rd["kind"] == PINECO and self.runners[s].got_in[n] is not None:
                    self.prizes[s][n] = "pineco"
                elif pts[s]:
                    self.prizes[s][n] = ("melon" if rd["fruit"] == MELON else "grapes") if rd["kind"] == FRUIT else "berries"
            if rd["kind"] != PINECO:
                out.append((n, pts, list(self.scores), decided))
        return out

    def next_settle(self, allow):
        """When (round time, s) the next prize could be given, or the next
        round dealt, or None."""
        at = [self.times[n]["start"] / FPS for n in range(1, ROUNDS) if self.outs[n] is None][:1]
        for n, rd in enumerate(self.rounds):
            if self.decided[n] is not None:
                continue
            res = judge(rd, [r.got_in[n] for r in self.runners])
            if res is not None:
                at.append((res[1] + int(allow * FPS) + 1) / FPS)
                break
        return min(at) if at else None
