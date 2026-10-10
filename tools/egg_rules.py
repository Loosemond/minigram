"""The rules of an Egg Emergency round, for the rooms server (tools/rooms.py).

The same deal and judging as web/minigames/src/egg/rules.js, which has the
rules and where each number comes from in the game's code (module #56): keep
the two the same (tools/test_rooms.py and the browser tests check them against
each other). The drops are dealt from the round's seed, the same for every
seat. Every device sends the leans of the players it plays (the lean held from
a frame of the play on: -1 left, 0 centre, 1 right; a CPU's as its code sets
it); the server runs each seat's Chansey on them, frame by frame, as the game
does (its clips, the hurt after a Voltorb, the Voltorbs it's immune to) and
keeps the score itself, so a device can't count catches its player didn't
make. With no CPUs the game speeds up when everyone's caught at least 80 % of
the eggs by the time 70 and 40 are left: the server says when ("deal").
"""
import bisect
import math
import struct

SEATS = 4
FPS = 30


def f32(x):
    """x rounded to a 32-bit float (the game's floats; Math.fround in JS)."""
    return struct.unpack("<f", struct.pack("<f", x))[0]


SCALE = f32(0.17)
U = f32(f32(3.2) / SCALE)
FEET = -285
CATCH = f32(U * 7 + FEET)
CLOSE = 25
TOP = 550
GONE = -470
EGGS = 100
LOSS = 5
SLOTS = 40
SONG_AT, PLAY_AT = 31, 32  # frames from GO
END_AT = 31  # frames once all is clear
IMMUNE = 50
LEVELS = {"easy": 1, "normal": 2, "hard": 3}
ACCEL = [0, 17, 13, 10, 8]
INTERVAL = [f32(x) for x in (0, 4.5, 5.1, 5.4, 8)]
ERASE = [0, 0, 20, 60, 92]
THRESHOLD = [None, [100, 95, 85, 75, 65, 40], [100, 90, 80, 65, 50, 35], [100, 90, 80, 65, 50, 30], [100, 90, 75, 60, 45, 30]]
BREAKS = [None, [1, 1, 2, 2, 3, 4], [1, 1, 2, 1, 2, 4], [1, 1, 2, 1, 2, 3], [1, 2, 1, 2, 2, 3]]
TIERS = [None, [0, 1, 4, 2, 6, 2], [0, 1, 1, 2, 2, 6], [0, 1, 3, 2, 4, 5], [0, 0, 1, 3, 1, 3]]
BREAK = 50
PATTERNS = [[tuple(int(c) for c in s[i:i + 3]) for i in range(0, len(s), 3)] for s in (
    "000", "100", "100003", "000103", "100203001", "100003202", "000103202", "100201003", "100202103",
    "110", "010", "110002102", "110202102", "010102002", "100013203", "100203102202", "100202002215", "000202102211",
    "100001202111002", "000202103210203", "000013102203001", "210110002203102", "110202011213001", "110213101102001",
    "100202102201102", "100002202102001", "100002202102001", "100211001202111001102", "000012002012002",
    "110001102203011002", "100112000202002102010", "100013200202103010", "000001202111102101202",
    "000102010002012200002", "110201103211113201", "100101002111000202011200", "100002210102202001111",
    "200001001012002001102", "110102101211202201", "000201202002101102", "010200201102210111112000210",
    "100202110102012112210001", "110012102210012112210", "110011201212011101012211", "000201101011112211001101201",
    "100101001001201201001001101101", "100202102201101002201", "110101202102210202101002", "110200102010202102010",
    "100111201211101111201211101111", "100001201001101112011201", "100010201111011200212101010101101",
    "010001111101210201011001111101210201", "010112001211011201011111211", "000101001211001201001110001102",
    "100001001201201201001001001101", "110000210012200102210112000210002001",
    "010200011200101101010101010201011200011200101101", "100201101202101201002001", "010112210001012011112000210012",
    "000201011001101002201002", "")]
DEAL_SEED = 0x2545F491
SIDE = {1: 0, 2: -1, 3: 1}
LEAN = {-1: 3, 0: 2, 1: 1}  # the wire's lean -> the game's (1 right, 2 centre, 3 left)
COLUMN_OF_LEAN = {1: 3, 2: 1, 3: 2}
CLIP_FRAMES = [24, 16, 16, 16, 8, 8, 8, 8, 8, 8, 10, 10, 10, 20, 72, 97]
HURT = 13
TURN = {2: {0: 1, 2: 7, 3: 5, 11: 1, 12: 1}, 1: {0: 3, 1: 4, 2: 8, 10: 3, 11: 3}, 3: {0: 2, 1: 6, 3: 9, 10: 2, 12: 2}}
AFTER = {5: 1, 7: 1, 10: 1, 4: 3, 8: 3, 12: 3, 6: 2, 9: 2, 11: 2}
ONE = 0x10000
LONGEST = 300 * FPS  # a lean's frame is kept within the round


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
    """c for a round: 4 - the COM level, or 3 (Easy's) with no CPUs."""
    return 4 - LEVELS.get(level, 2) if cpus else 3


_falls = {}


def fall(a):
    """A drop's y after n steps of its fall (fall() in rules.js)."""
    if a not in _falls:
        ys, t, step = [TOP], 0.0, f32(0.2)
        while True:
            t = f32(t + step)
            y = f32(TOP - f32(t * f32(f32(a) * t)))
            ys.append(y)
            if y <= GONE:
                break
        _falls[a] = ys
    return _falls[a]


def turn_frames(a):
    t, step = 0.0, f32(0.2)
    while not f32(TOP - f32(f32(f32(a) * t) * t)) <= CATCH:
        t = f32(t + step)
    return int(f32(t / step))


class Row:
    __slots__ = ("i", "f", "slot", "code", "side", "kind", "spin", "a", "r", "n", "ys", "gone", "reach")


class Deal:
    """The drops, frame by frame (Deal in rules.js). want(f, eggs): the
    speed-up's check; decide(f, fast): a pattern end at frame f, whether the
    speed-up comes; fixed: a short deal for the tests, [(frame, side, kind)]."""

    def __init__(self, seed, c, all_human=False, want=None, decide=None, fixed=None, a=None):
        self.seed, self.c, self.all_human, self.want, self.decide = seed, c, all_human, want, decide
        self.L, self.Q = lcg(seed), quad(seed ^ DEAL_SEED)
        Q = self.Q
        self.perm = list(range(20))
        for _ in range(50 + Q() % 101):
            i = Q() % 20
            j = Q() % 20
            while j == i:
                j = Q() % 20
            self.perm[i], self.perm[j] = self.perm[j], self.perm[i]
        self.rates()
        self.turn = turn_frames(self.a)
        self.T = 30 + 1800 - 1
        self.N = 1800
        self.left = EGGS
        self.dropped = 0
        self.count = 1
        self.k = 0
        self.phase = 0
        self.fast = False
        self.mirror = False
        self.pat = 0
        self.row = 0
        self.f = 0
        self.rows, self.drops = [], []
        self.starts = []  # each row's frame, for lookups
        self.phases, self.lefts, self.cs = [0], [EGGS], [c]
        self.ups, self.ends = [], []
        self.list = None
        if fixed is not None:
            self.a = a if a is not None else ACCEL[c]
            self.turn = turn_frames(self.a)
            self.list = sorted(fixed, key=lambda r: r[0])
            self.left = sum(1 for r in self.list if r[2] == "e")

    def rates(self):
        self.a, self.interval = ACCEL[self.c], INTERVAL[self.c]

    @property
    def over(self):
        return not self.list if self.list is not None else self.dropped >= EGGS

    def step(self):
        self.f += 1
        f = self.f
        self.T -= 1
        if self.list is not None:
            while self.list and self.list[0][0] <= f:
                _, side, kind = self.list.pop(0)
                self.add(f, 1 if side == 0 else 2 if side < 0 else 3, kind, 0)
        elif self.dropped < EGGS:
            self.schedule(f)
        self.phases.append(self.phase)
        self.lefts.append(self.left)
        self.cs.append(self.c)

    def schedule(self, f):
        if self.all_human and self.left in (70, 40) and self.want and self.want(f, (EGGS - self.left) * 0.8):
            self.fast = True
        if self.k >= 19:
            self.k = 0
        for i, t in enumerate(THRESHOLD[self.c]):
            if t >= self.left:
                self.phase = i
        if self.N < self.T:
            return
        rows = PATTERNS[self.pat]
        if self.row >= len(rows):
            self.ends.append(f)
            up = self.decide(f, self.fast) if self.decide else self.fast
            self.fast = False
            if up:
                self.c = max(1, self.c - 1)
                self.rates()
                self.ups.append(f)
            c = self.c
            self.count += 1
            b = BREAKS[c][self.phase]
            self.N -= BREAK if b != 4 and self.count % b == 0 else 2 * math.trunc(self.interval)
            base, cnt, t = self.perm[self.k], self.count, TIERS[c][self.phase]
            if t <= 2:
                tier = t
            elif t == 3:
                tier = 1 if cnt & 1 else 0
            elif t == 4:
                tier = 2 if cnt & 1 else 1
            elif t == 5:
                tier = cnt % 3
            else:
                r = self.Q() % 100
                tier = 0 if r >= 67 else 1 if r >= 34 else 2
            self.k += 1
            self.mirror = self.L() % 101 >= 51
            self.pat = base + 20 * tier
            self.row = 0
            return
        while True:
            code, kind, _ = rows[self.row]
            r = self.L() % 101
            col = 1 if code == 0 else 2 if (code == 1) != self.mirror else 3
            if kind == 1:
                self.add(f, col, "v" if ERASE[self.cs[0]] < r else None, 0, r)
            else:
                self.left -= 1
                self.dropped += 1
                self.add(f, col, "e", r << 5, r)
            self.row += 1
            if self.row >= len(rows):
                break
            g = rows[self.row][2]
            if g != 0:
                self.N = math.trunc(f32(f32(self.N) - f32(f32(g) * self.interval)))
                break

    def add(self, f, code, kind, spin, r=0):
        row = Row()
        row.i, row.f, row.slot, row.code, row.side, row.kind = len(self.rows), f, len(self.rows) % SLOTS, code, SIDE[code], kind
        row.spin, row.a, row.r, row.n = spin, self.a, r, len(self.drops) if kind else -1
        if self.list is not None and kind == "e":
            self.left -= 1
        if kind:
            row.ys = fall(row.a)
            row.gone = f + len(row.ys) - 2
            row.reach = f + next(i for i, y in enumerate(row.ys) if y <= CATCH) - 1
        else:
            row.ys, row.gone, row.reach = None, f, f
        self.rows.append(row)
        self.starts.append(f)
        if kind:
            self.drops.append(row)

    def last_row(self, g):
        return bisect.bisect_right(self.starts, g) - 1

    def slot_row(self, j, g, last=None):
        if last is None:
            last = self.last_row(g)
        if last < 0:
            return None
        i = last - (last - j) % SLOTS
        return self.rows[i] if i >= 0 else None

    def clear(self, g):
        return self.left <= 0 and not self.list and all(not r.kind or r.gone <= g for r in self.rows)

    def end_frame(self):
        """The frame the round's over at, at the latest (its last drop gone,
        and a hit's eggs: 44 frames), with the 31 after."""
        last = max([r.gone for r in self.rows if r.kind] + [r.reach + 45 for r in self.rows if r.kind == "v"] + [1])
        return last + END_AT


def row_y(row, g):
    if row is None:
        return 0.0
    if not row.kind:
        return float(TOP)
    return row.ys[min(len(row.ys) - 1, max(0, g - row.f + 1))]


class Seat:
    """One player's Chansey and drops (Seat in rules.js), without the CPU's
    think: a CPU's leans are given, as its device plays them."""

    def __init__(self, z):
        self.z = z
        self.eggs = 0
        self.lean = 0
        self.state = 1
        self.clip = 1
        self.frame = -ONE
        self.speed = ONE
        self.immune = 0
        self.judged = {}
        self.caught = set()
        self.f = 0
        self.out = []  # what happened: (row, k "c" / "h" / "m", eggs after, frame)

    def play(self, clip):
        if clip != self.clip:
            self.clip, self.frame = clip, -ONE
        self.speed = ONE

    def ended(self):
        return self.frame >= (CLIP_FRAMES[self.clip] - 1) * ONE

    def advance(self):
        self.frame += self.speed
        n = CLIP_FRAMES[self.clip]
        if self.frame >= n * ONE:
            self.frame = (n - 1) * ONE if 4 <= self.clip <= 13 else self.frame - n * ONE

    def step(self, g, deal, lean):
        self.f = g
        if self.immune > 0:
            self.immune += 1
        if self.immune > IMMUNE:
            self.immune = 0
        if self.state <= 12:
            if lean:
                self.lean = lean
            to = TURN.get(self.lean, {}).get(self.state)
            if to is not None:
                self.state = to
                self.play(to)
        if self.ended():
            if self.state == HURT:
                self.lean, self.state = 2, 1
                self.play(1)
            elif self.state in AFTER:
                self.state = AFTER[self.state]
                self.play(self.state)
        self.speed = (4 if 4 <= self.state < 10 else 2 if 10 <= self.state < 13 else 1) * ONE
        self.advance()
        last = deal.last_row(g)
        close = f32(CATCH - CLOSE)
        for j in range(SLOTS):
            row = deal.slot_row(j, g, last)
            if row is None or not row.kind or row.gone < g:
                continue
            y = row_y(row, g)
            if not y <= CATCH or self.state == HURT:
                continue
            judged = self.judged.get(row.i, 0)
            if judged == 0 and (row.code == self.state or self.lean_match(row)):
                judged = 1
                if row.kind == "v":
                    if self.immune == 0:
                        self.caught.add(row.i)
                        self.immune, self.state, self.lean = 1, HURT, 1
                        self.clip = -1
                        self.play(HURT)
                        self.eggs -= min(self.eggs, LOSS)
                        self.out.append((row, "h", self.eggs, g))
                    else:
                        self.out.append((row, "m", self.eggs, g))
                else:
                    self.caught.add(row.i)
                    self.state += 9
                    self.play(self.state)
                    self.eggs += 1
                    self.out.append((row, "c", self.eggs, g))
            if y <= close:
                if judged == 0:
                    self.out.append((row, "m", self.eggs, g))
                judged = -1
            if judged:
                self.judged[row.i] = judged
        for j in range(SLOTS):
            row = deal.slot_row(j, g, last)
            if row is not None and row.kind and row.gone == g and not self.judged.get(row.i):
                self.judged[row.i] = -1
                self.out.append((row, "m", self.eggs, g))

    def lean_match(self, row):
        if COLUMN_OF_LEAN.get(self.lean) != row.code:
            return False
        self.state = row.code
        return True


def make_deal(seed, c, all_human=False, **kw):
    """The round's deal (the tests put a short one in its place)."""
    return Deal(seed, c, all_human, **kw)


class Round:
    """One round's deal, leans and scores, on the server."""

    def __init__(self, seed, level="normal", cpus=(True, True, True, False)):
        self.cpus = list(cpus)
        self.c = level_code(level, any(self.cpus))
        self.all_human = not any(self.cpus)
        self.deal = make_deal(seed, self.c, self.all_human, want=self.want)
        self.seats = [Seat(s) for s in range(SEATS)]
        self.frames = [[] for _ in range(SEATS)]  # each seat's leans: from frames[i], it leans leans[i]
        self.leans = [[] for _ in range(SEATS)]
        self.results = [{} for _ in range(SEATS)]  # drop -> (k, eggs after, frame)
        self.history = [[0] for _ in range(SEATS)]  # each seat's eggs after each frame (for the speed-up)
        self.told_ups = 0  # the speed-ups the devices have been told of

    @property
    def scores(self):
        return [s.eggs for s in self.seats]

    def wire(self):
        """The round as a device needs it to play (and to rejoin it): its
        level code, each seat's leans so far, the speed-ups, the scores."""
        return dict(c=self.c, human=self.all_human, leans=[[[f, l] for f, l in zip(self.frames[s], self.leans[s])] for s in range(SEATS)],
                    ups=list(self.deal.ups), scores=self.scores)

    # ---- the leans ----
    def lean(self, s, f, l):
        """Seat s leans l (-1, 0, 1) from frame f of the play. The frame is kept
        in order and after what's been judged (as the seat's leans were then);
        returns it."""
        fs, ls = self.frames[s], self.leans[s]
        f = int(min(max(f, fs[-1] if fs else 1, self.seats[s].f + 1, 1), LONGEST))
        if not ls or ls[-1] != l:
            fs.append(f)
            ls.append(l)
        return f

    def lean_at(self, s, f):
        i = bisect.bisect_right(self.frames[s], f) - 1
        return LEAN[self.leans[s][i]] if i >= 0 else 0

    # ---- running it ----
    def want(self, f, eggs):
        """The speed-up's check at frame f: every seat has at least eggs (after
        frame f - 1)."""
        for s in range(SEATS):
            self.settle(s, f - 1)
        return min(min(h[min(f - 1, len(h) - 1)] for h in self.history), 100) >= eggs

    def deal_to(self, f):
        while self.deal.f < f:
            self.deal.step()

    def settle(self, s, upto):
        """Run seat s's Chansey up to frame upto. Returns what came of its drops:
        [(n, "c" / "h" / "m", eggs after, frame)]."""
        seat, out = self.seats[s], []
        upto = int(min(upto, LONGEST))
        while seat.f < upto:
            g = seat.f + 1
            self.deal_to(g)
            seat.step(g, self.deal, self.lean_at(s, g))
            self.history[s].append(seat.eggs)
            for row, k, e, at in seat.out:
                self.results[s][row.n] = (k, e, at)
                out.append((row.n, k, e, at))
            seat.out = []
        return out

    def settled(self, s, n):
        return n in self.results[s]

    def reach(self, n):
        """The frame drop n gets to the catch line (None: not dealt yet)."""
        return self.deal.drops[n].reach if 0 <= n < len(self.deal.drops) else None

    def new_ups(self):
        """The speed-ups the devices haven't been told of yet (or None)."""
        if len(self.deal.ups) == self.told_ups:
            return None
        self.told_ups = len(self.deal.ups)
        return list(self.deal.ups)

    @property
    def end(self):
        """When (s from GO) the round's over at the latest: its deal run to the
        end, with the speed-ups so far."""
        key = len(self.deal.ups)
        if getattr(self, "_end", (None,))[0] != key:
            ups = set(self.deal.ups)
            sim = make_deal(self.deal.seed, self.c, self.all_human, decide=lambda f, fast: f in ups)
            while not sim.over:
                sim.step()
            self._end = (key, (sim.end_frame() + PLAY_AT - 1) / FPS)
        return self._end[1]
