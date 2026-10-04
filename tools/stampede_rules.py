"""The rules of a Streaming Stampede game, for the rooms server (tools/rooms.py).

The same questions, CPUs and scoring as web/minigames/src/stampede/rules.js,
which has the rules and where each number comes from in the game's code: keep
the two the same (tools/test_rooms.py and the browser tests check them
against each other). The server makes each question from the seed when it
comes up (from the totals so far: the more players are perfect, the more
Pokemon the next ones have), takes the presses the devices report (the
question and the frame of its counting each was on), checks they could have
happened then (in the counting, not in the future, not older than the way
here allows, one a frame, 99 at most), counts the CPUs' itself, and gives
each answer's points.
"""
import math

SEATS = 4
FPS = 30
QUESTIONS = 5
MAX_COUNT = 99
CARD, TAIL, STOP = 85, 60, 50
ANSWER, JUDGED = 190, 90
LAST_ANSWER, LAST_JUDGED = 29 + 290, 29 + 210
POINTS = [(10, 5, 1), (10, 5, 1), (20, 10, 5), (20, 10, 5), (40, 20, 10)]
OFF_LEFT = -250
LEVELS = {"easy": 1, "normal": 2, "hard": 3}

# kind: (name, image bank, scale, w, h, speed a, speed b, z0, z range, x0, x range, shadow, dx, depth)
KINDS = [
    ("Pikachu", 218, 1, 64, 64, 9, 5, 217, 280, 300, 800, 1.6, 12, 27),
    ("Pichu", 217, 1, 52, 52, 6, 3, 237, 283, 300, 640, 1, 0, 23),
    ("Psyduck", 210, 1, 64, 64, 7, 5, 232, 271, 300, 1040, 2, -4, 22),
    ("Diglett", 205, 1, 36, 36, 0, 0, 278, 255, -103, 207, 0, 0, 7),
    ("Dugtrio", 208, 0.75, 64, 64, 0, 0, 289, 214, -97, 195, 0, 0, 16),
    ("Voltorb", 202, 0.8, 36, 36, 8, 5, 308, 256, 300, 960, 1.6, 0, 11.2),
    ("Electrode", 211, 0.7, 64, 64, 10, 5, 265, 255, 300, 1200, 2.1, 0, 16.8),
    ("Poke Ball", 212, 0.9, 32, 32, 8, 5, 275, 265, 300, 880, 1.35, 0, 10.8),
    ("Doduo", 206, 1, 64, 64, 8, 4, 229, 279, 300, 1120, 1.6, -6, 24),
    ("Dodrio", 207, 1.1, 80, 80, 12, 4, 205, 264, 300, 1360, 2.2, -6, 38.5),
    ("Slugma", 213, 1, 56, 56, 4, 3, 280, 240, 300, 720, 0, 0, 15),
    ("Magcargo", 203, 1, 64, 48, 4, 3, 272, 252, 300, 720, 0, 0, 15),
    ("Omanyte", 216, 1, 40, 40, 4, 3, 276, 252, 300, 720, 2, 0, 12),
    ("Togepi", 220, 1, 48, 48, 7, 5, 241, 274, 300, 800, 1.5, 0, 20),
    ("Togepi egg", 209, 0.75, 48, 40, 7, 5, 273, 267, 300, 800, 1.3125, 0, 13.5),
    ("Magnemite", 204, 0.8, 64, 40, 5, 5, 176, 311, 300, 720, 1.6, 0, 37.6),
    ("Magneton", 219, 1, 92, 72, 8, 5, 134, 295, 300, 1280, 3.2, 0, 50),
]
POPS = (3, 4)
FAMILY = [0, 0, 0, 1, 1, 2, 2, 2, 3, 3, 4, 4, 4, 5, 5, 6, 6]
FAMILY_LEVEL = [0, 0, 2, 1, 0, 2, 3]
Q1_KINDS = [0, 1, 2, 10, 11, 12, 13, 15]
Q2_KINDS = [0, 1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13, 15, 16]
Q3_FAMILIES = [0, 3, 5, 8, 10, 13, 15]
Q4_FAMILIES = [0, 3, 5, 8]
FAMILY_SPREAD = {0: 1040, 5: 1200, 8: 1360, 10: 720, 13: 800, 15: 1280}
Q3_SPECIAL = [(1, 13), (5, 16), (0, 12)]
Q4_SPECIAL = [(0, 6, 9), (2, 11, 15), (13, 8, 10)]
Q3_SPECIAL_SPREAD = [800, 1280, 800]
Q4_SPECIAL_SPREAD = [1360, 1040, 1120]
SPECIAL = [70, 50, 30, 10]
HOW_MANY = [0.6, 0.8, 1, 1]
SPREAD = [0.7, 0.85, 1, 1.2]
APART = [169, 169, 169, 100, 49]
COUNTS = [(0,), (1,), (0, 1), (2,), (0, 2), (1, 2), (0, 1, 2)]
Q4_CODES = [0, 1, 3, 6]
ERRORS = [0, -1, 1, -2, 2, -3, 3]
CPU_ODDS = [
    [[60, 90, 120, 140, 160, 180, 200], [20, 40, 60, 80, 100, 150, 200], [10, 20, 30, 45, 60, 130, 200], [0, 30, 30, 60, 60, 200, 200]],
    [[120, 150, 180, 185, 190, 195, 200], [40, 70, 100, 130, 160, 180, 200], [20, 40, 60, 90, 120, 160, 200], [0, 60, 60, 120, 120, 200, 200]],
    [[160, 175, 190, 194, 198, 199, 200], [80, 110, 140, 160, 180, 190, 200], [40, 70, 100, 130, 160, 180, 200], [0, 100, 100, 160, 160, 200, 200]],
    [[190, 192, 194, 196, 198, 199, 200], [120, 145, 170, 180, 190, 195, 200], [60, 90, 120, 150, 180, 190, 200], [0, 100, 100, 160, 160, 200, 200]],
]
CPU_GAP = [25, 21, 18, 14]
SALTS = [0x2545F491, 0x6D2B79F5, 0x1B873593, 0x3C6EF372, 0x7F4A7C15]


def quad(seed):
    """The game's random numbers 0x8007B100: (4x + 2)(4x + 3) / 4, in 32 bits."""
    x = seed & 0xFFFFFFFF

    def rnd():
        nonlocal x
        x = (((4 * x + 2) * (4 * x + 3)) & 0xFFFFFFFF) >> 2
        return x

    return rnd


def cpu_odds(answer):
    return 20 if answer < 5 else 10 if answer < 15 else 5 if answer < 25 else 3


def setup(level):
    return dict(level=level, bonus=0, families=0, specials=0)


def after(state, q, totals, all_people):
    """More Pokemon to come if enough players are perfect so far (and a
    level up for four people all perfect after the 1st or 3rd question)."""
    if q > 3:
        return state
    perfect, need = [10, 20, 40, 60][q], [3, 3, 2, 1][q]
    n = sum(1 for t in totals if t == perfect)
    s = dict(state)
    if n >= need:
        s["bonus"] += 2
    if n == 4 and all_people and q in (0, 2):
        s["level"] = min(3, s["level"] + 1)
    return s


def question(seed, q, state, cpu_totals=(0, 0, 0, 0), com_level=None):
    """Question q (0-4): the stream and its answer, as rules.js question()."""
    r = quad(seed ^ SALTS[q])
    lv = state["level"]
    com_level = lv if com_level is None else com_level
    families, specials = state["families"], state["specials"]
    special, k, tries = False, 0, 0
    while True:
        special = q in (2, 3) and (r() % 100 < SPECIAL[lv] or tries > 1000)
        tries += 1
        if special:
            k = r() % 3
            bit = 1 << (k if q == 2 else 3 + k)
            if specials & bit:
                continue
            specials |= bit
            break
        if q == 4:
            k = r() % 15
            break
        k = (r() & 7) if q == 0 else (r() % 15) if q == 1 else (r() % 7) if q == 2 else (r() & 3)
        first = [Q1_KINDS, Q2_KINDS, Q3_FAMILIES, Q4_FAMILIES][q][k]
        f = FAMILY[first]
        if lv < FAMILY_LEVEL[f] or families & (1 << f):
            continue
        families |= 1 << f
        break
    if special:
        members = list((Q3_SPECIAL if q == 2 else Q4_SPECIAL)[k])
    elif q == 0:
        members = [Q1_KINDS[k]]
    elif q == 1:
        members = [Q2_KINDS[k]]
    elif q == 2:
        members = [Q3_FAMILIES[k], Q3_FAMILIES[k] + 1]
    elif q == 3:
        members = [x for x in (Q4_FAMILIES[k] + d for d in range(3)) if FAMILY[x] == FAMILY[Q4_FAMILIES[k]]]
    else:
        members = None
    while True:
        made = _stream(r, q, special, k, members, state)
        if made:
            break
    recs, code, answer = made
    for o in recs:
        K = KINDS[o["kind"]]
        v = r() % (K[6] + 1) + K[5]
        if o["kind"] in POPS:
            o["speed"] = 0
            o["gone"] = 25 + o["t2"]
        else:
            o["speed"] = max(4, int(v * SPREAD[lv]))
            o["gone"] = math.floor((o["x"] - OFF_LEFT) / o["speed"])
    last = max(o["gone"] for o in recs)
    cpu = []
    for total in cpu_totals:
        row = 3 if q == 4 and total == 60 else [0, 0, 1, 1, 2][q]
        v = r() % 200
        i = next(n for n, t in enumerate(CPU_ODDS[com_level][row]) if v < t)
        cpu.append(max(1, answer + ERRORS[i]))
    what = None if q == 4 else [members[ro] for ro in COUNTS[code]]
    return dict(q=q, special=special, k=k, code=code, what=what, members=members, stream=recs, answer=answer,
                last=last, frames=last + 1 + TAIL, cpu=cpu, seed=seed,
                state=dict(state, families=families, specials=specials))


def _stream(r, q, special, k, members, state):
    lv, f, b = state["level"], SPREAD[state["level"]], state["bonus"]
    n0 = r()
    n = int([n0 % 6 + 5, n0 % 11 + b + 5, n0 % 11 + b + 10, (n0 & 15) + b + 10, n0 % 11 + b + 20][q] * HOW_MANY[lv])
    recs = []
    misses = 0
    for _ in range(n):
        role = 0
        if q == 2:
            role = (r() % 97) % 2
        elif q == 3:
            role = (r() % 97) % (3 if special or len(members) == 3 else 2)
        kind = Q2_KINDS[(r() % 97) % 15] if q == 4 else members[role]
        K = KINDS[kind]
        if special:
            spread = (Q3_SPECIAL_SPREAD if q == 2 else Q4_SPECIAL_SPREAD)[k]
        elif q < 2:
            spread = K[10]
        elif q == 4:
            spread = 1440
        else:
            spread = FAMILY_SPREAD.get(members[0])
        while True:
            if misses >= 201:
                return None
            t2 = r() % 197
            if kind in POPS:
                x = r() % K[10] + K[9]
                if q == 4:
                    t2 = r() % 12
            else:
                x = (r() % spread) * f + 300
            z = r() % K[8] + K[7]
            ax, az = int(int(x) + K[12]), int(int(z) + K[13] * 3)
            clash = False
            for o in recs:
                O = KINDS[o["kind"]]
                dx = ax - int(int(o["x"]) + O[12])
                dz = az - int(int(o["z"]) + O[13] * 3)
                if kind in POPS:
                    hit = (t2 - o["t2"]) ** 2 < 576 and dx * dx + dz * dz < 0x2000
                else:
                    hit = dx * dx + dz * dz < 0x400 or (dz * dz < APART[q] and dx * dx < 0x64000)
                if hit:
                    clash = True
                    break
            if not clash:
                recs.append(dict(kind=kind, role=role, x=x, z=z, t2=t2))
                break
            misses += 1
    code = 0
    if special:
        code = (r() % 97) % 3 if q == 2 else Q4_CODES[(r() % 97) % 4]
    elif q == 2:
        code = 0 if members[0] == 13 else (r() % 97) % 3
    elif q == 3:
        code = Q4_CODES[(r() % 97) % 4] if members[0] == 0 else (r() % 97) % 3
    if q == 4 or q < 2:
        answer = len(recs)
    else:
        each = [sum(1 for o in recs if o["role"] == ro) for ro in COUNTS[code]]
        answer = 0 if len(each) > 1 and 0 in each else sum(each)
    return (recs, code, answer) if answer else None


def points(q, count, answer):
    if not count:
        return 0
    d = abs(count - answer)
    return POINTS[q][d] if d < 3 else 0


def cpu_presses(Q, level, seat):
    """The counting frames a CPU seat presses on (rules.js cpuPresses)."""
    r = quad(Q["seed"] ^ 0x51ED270B ^ (Q["q"] << 8) ^ (seat << 16))
    answer = Q["cpu"][seat]
    D, gap = cpu_odds(answer), CPU_GAP[level]
    gones = sorted(o["gone"] for o in Q["stream"])
    presses = []
    since, count, f = 3, 0, 0
    while f < Q["frames"] and count < answer:
        gone = sum(1 for g in gones if g < f)
        left = gone < len(gones)
        press = False
        if gone >= 1:
            if left:
                press = since > gap and r() % D == 0
            else:
                press = count == 0 or (since >= 4 and r() % D < 2)
        since += 1
        if press:
            presses.append(f)
            count += 1
            since = 0
        f += 1
    return presses


class Round:
    """One game's questions, presses and scores, on the server."""

    def __init__(self, seed, level="normal", cpus=(False, True, True, True)):
        self.seed = seed
        self.com = LEVELS.get(level, 2)
        self.cpus = list(cpus)
        self.people = not any(self.cpus)
        self.states = [setup(1 if self.people else self.com)]
        self.qs, self.at = [], []
        self.presses = [[[] for _ in range(QUESTIONS)] for _ in range(SEATS)]
        self.verdicts = [None] * QUESTIONS
        self.scores = [0] * SEATS
        self.end = math.inf  # s after GO, once the last question's made
        self.prepare(0)

    def prepare(self, q):
        if q < len(self.qs) or q >= QUESTIONS:
            return
        if q > 0:
            self.states.append(after(self.qs[q - 1]["state"], q - 1, self.scores, self.people))
        Q = question(self.seed, q, self.states[q], list(self.scores), self.com)
        Q["cpu_presses"] = [cpu_presses(Q, self.com, s) if self.cpus[s] else None for s in range(SEATS)]
        self.qs.append(Q)
        start = self.at[q - 1]["end"] if q else 0
        count = start + CARD
        answer = count + Q["frames"]
        last = q == QUESTIONS - 1
        self.at.append(dict(start=start, count=count, answer=answer,
                            end=answer + (LAST_ANSWER if last else ANSWER)))
        if last:
            self.end = self.at[q]["end"] / FPS

    def wire(self):
        """The game as a device needs it to rejoin it: the answers so far."""
        return dict(ss=dict(told=[dict(c=v[0], p=v[1], e=v[2]) if v else None for v in self.verdicts]))

    def count(self, s, q):
        if self.cpus[s]:
            return min(MAX_COUNT, len(self.qs[q]["cpu_presses"][s]))
        return min(MAX_COUNT, len(self.presses[s][q]))

    def press(self, s, n, f, now, allow):
        """Seat s pressed in question n's counting, on its frame f (its
        device's word); it came in at round time now (s after GO) and may be
        at most allow s old. True if it counts."""
        if type(n) is not int or type(f) is not int or not 0 <= n < len(self.qs) or self.cpus[s]:
            return False
        if self.verdicts[n] is not None:
            return False
        T, Q = self.at[n], self.qs[n]
        here = now * FPS - T["count"]  # (frames into the counting)
        if not 0 <= f < Q["frames"] or f > here + 1 or f < here - allow * FPS - 1:
            return False
        p = self.presses[s][n]
        if f in p or len(p) >= MAX_COUNT:
            return False
        p.append(f)
        return True

    def settle(self, now, allow):
        """The answers that can be given by round time now (no press still on
        its way could change them), as [(n, counts, points, totals)]."""
        out = []
        for q in range(QUESTIONS):
            if q >= len(self.qs):
                break
            if self.verdicts[q] is not None:
                continue
            if now < self.at[q]["answer"] / FPS + allow:
                break
            Q = self.qs[q]
            counts = [self.count(s, q) for s in range(SEATS)]
            pts = [points(q, c, Q["answer"]) for c in counts]
            for s in range(SEATS):
                self.scores[s] += pts[s]
            self.verdicts[q] = (counts, pts, list(self.scores))
            out.append((q, counts, pts, list(self.scores)))
            self.prepare(q + 1)
        return out

    def next_settle(self, allow):
        """When (round time, s) the next answer can be given, or None."""
        for q in range(len(self.qs)):
            if self.verdicts[q] is None:
                return self.at[q]["answer"] / FPS + allow
        return None
