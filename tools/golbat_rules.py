"""The rules of a Gutsy Golbat round, for the rooms server (tools/rooms.py).

The same world as web/minigames/src/golbat/rules.js, which has the rules and
where each number comes from in the game's code: keep the two the same, line
for line (tools/test_rooms.py and the browser tests check they run alike, to
the last bit). The four Golbat share one world, so the server runs it from
everyone's pads (the people's: the devices send each change, a "pad" with the
frame it's for; the CPUs think in it as on every device), and so knows each
one's hearts at the end.
"""
import math

SEATS = 4
AHEAD = 4  # frames ahead of now a pad may be for (a device sends its player's up to 3 ahead: src/lag.js leadFor)
FPS = 30
LEVELS = {"easy": 1, "normal": 2, "hard": 3}

SCROLL = -8
FLAP = 9
SPD_X = 0.023
ENEMY_BND = 20.5
PLAYER_BND = 0.6
GRAVITY = -0.58
DROP_RATE = 0.5
TIME = 1200
UNIT = 28
BUMP = 49
HIT = 30.68
NEAR = 52.156
GRAB = 58
CROWD = 174
DRAG = 0.97
VMAX = 15
DASH = math.sqrt(450) * 0.7
STICK = 64 * SPD_X
X_MIN, X_MAX, Y_MAX, FLOOR = -364.41092, 321.53903, 199.3542, -209.00037
EDGE = 464.8498
HURT_FOR = 26
FLAP_FOR = 9
HIT_FOR = 36
GOT_FOR = 6
FLASH_FOR = 16
MINE_FOR = 16
HEARTS_MAX = 99
MAGS, HEARTS = 16, 64

MAGNEMITE, HEART = 0, 3
SECTIONS = [
    [[38, 242, 0], [63, 140, 3], [102, 38, 3], [127, 229, 0], [178, 242, 0], [204, 89, 3]],
    [[51, 204, 0], [63, 242, 0], [102, 165, 3], [153, 25, 3], [153, 242, 0], [204, 76, 3]],
    [[38, 242, 0], [51, 153, 3], [140, 89, 3], [153, 229, 0], [165, 178, 3], [216, 63, 3], [216, 242, 0]],
    [[38, 229, 0], [51, 25, 3], [63, 178, 3], [89, 127, 3], [114, 242, 0], [127, 165, 1], [204, 242, 0], [229, 51, 3]],
    [[38, 242, 0], [63, 114, 3], [114, 51, 3], [140, 178, 3], [178, 38, 3], [178, 229, 0], [216, 242, 0]],
    [[38, 76, 3], [51, 229, 0], [89, 216, 3], [140, 25, 3], [140, 242, 0], [153, 102, 1], [165, 51, 3], [204, 229, 0],
     [216, 165, 3]],
    [[89, 229, 0], [140, 102, 1], [178, 242, 0], [216, 216, 0]],
    [[25, 229, 0], [127, 242, 0], [165, 216, 0], [191, 12, 1]],
    [[76, 242, 0], [127, 89, 1], [178, 242, 0], [204, 216, 0]],
    [[63, 216, 0], [127, 229, 0], [140, 76, 1], [242, 216, 0]],
    [[51, 216, 0], [127, 242, 0], [140, 51, 1], [191, 114, 3], [216, 242, 0]],
    [[63, 204, 0], [89, 242, 0], [127, 63, 3], [140, 12, 1], [178, 242, 0], [204, 216, 0]],
    [[63, 102, 3], [63, 242, 0], [89, 25, 3], [102, 229, 0], [114, 178, 1], [191, 165, 3], [191, 242, 0]],
    [[63, 153, 3], [63, 242, 0], [89, 12, 3], [114, 242, 0], [140, 204, 3], [178, 63, 3], [178, 127, 1], [229, 242, 0]],
    [[51, 89, 3], [63, 204, 0], [63, 242, 0], [102, 165, 3], [114, 76, 1], [140, 229, 0], [153, 12, 3], [153, 102, 3]],
    [[25, 229, 0], [38, 25, 3], [51, 242, 0], [76, 153, 3], [127, 242, 0], [140, 89, 3], [165, 153, 1], [178, 12, 3],
     [229, 178, 3]],
    [[12, 140, 1], [63, 153, 3], [63, 242, 0], [140, 51, 3], [140, 242, 0], [178, 229, 0], [191, 204, 3]],
    [[63, 38, 3], [63, 242, 0], [102, 140, 3], [114, 204, 0], [114, 242, 0], [178, 12, 3], [216, 165, 3], [229, 242, 0]],
    [[51, 12, 0], [51, 242, 0], [102, 229, 0], [140, 76, 2], [216, 242, 0]],
    [[38, 242, 0], [51, 63, 2], [76, 229, 0], [165, 12, 0], [165, 242, 0]],
    [[38, 216, 0], [63, 242, 0], [140, 127, 1], [191, 242, 0], [204, 204, 0]],
    [[63, 229, 0], [76, 12, 0], [127, 76, 2], [127, 242, 0], [204, 242, 0]],
    [[38, 165, 2], [76, 38, 0], [102, 229, 0], [140, 63, 3], [178, 242, 0], [229, 242, 0]],
    [[63, 229, 0], [76, 76, 2], [127, 63, 3], [127, 242, 0], [191, 12, 0], [229, 242, 0]],
    [[51, 25, 3], [89, 114, 3], [89, 229, 0], [127, 102, 1], [140, 191, 3], [140, 242, 0], [191, 63, 3], [216, 216, 0]],
    [[63, 191, 0], [76, 51, 3], [114, 242, 0], [165, 76, 1], [165, 114, 3], [191, 12, 3], [191, 242, 0], [216, 191, 3],
     [216, 229, 0]],
    [[63, 153, 3], [63, 229, 0], [102, 25, 3], [102, 127, 1], [153, 178, 3], [178, 102, 3], [204, 12, 3], [204, 242, 0],
     [229, 216, 0]],
    [[25, 178, 0], [51, 165, 3], [76, 63, 3], [89, 114, 3], [114, 242, 0], [165, 89, 1], [165, 242, 0], [204, 229, 0],
     [216, 102, 3]],
    [[25, 76, 3], [51, 12, 3], [63, 242, 0], [114, 89, 1], [153, 242, 0], [165, 127, 3], [165, 216, 0], [178, 25, 3]],
    [[25, 140, 3], [38, 242, 0], [102, 38, 3], [114, 178, 1], [165, 102, 3], [191, 242, 0], [229, 51, 3]],
    [[38, 242, 0], [51, 89, 1], [127, 242, 0], [153, 216, 0], [165, 12, 0], [191, 114, 2]],
    [[63, 242, 0], [89, 89, 2], [140, 242, 0], [204, 12, 0], [229, 153, 1]],
    [[38, 204, 0], [63, 51, 2], [153, 242, 0], [191, 191, 1], [229, 12, 0]],
    [[51, 242, 0], [76, 63, 1], [114, 229, 0], [178, 12, 0], [178, 242, 0], [229, 165, 2]],
    [[25, 242, 0], [38, 216, 0], [63, 12, 0], [114, 51, 1], [114, 191, 2], [153, 25, 3], [191, 229, 0], [216, 242, 0]],
    [[38, 12, 0], [38, 165, 3], [38, 242, 0], [76, 140, 2], [127, 229, 0], [140, 63, 3], [204, 51, 1], [204, 242, 0]],
    [[38, 0, 0], [51, 63, 3], [51, 216, 0], [102, 38, 1], [102, 114, 3], [127, 242, 0], [140, 178, 3], [165, 51, 3],
     [178, 140, 2], [178, 242, 0], [229, 114, 3]],
    [[51, 229, 0], [63, 165, 3], [76, 25, 3], [89, 242, 0], [114, 102, 3], [127, 12, 0], [140, 178, 2], [165, 38, 3],
     [165, 153, 3], [191, 89, 1], [191, 242, 0]],
    [[38, 165, 3], [51, 12, 3], [51, 242, 0], [89, 51, 1], [89, 242, 0], [140, 127, 2], [191, 38, 3], [191, 242, 0],
     [204, 127, 3]],
    [[51, 51, 1], [63, 178, 3], [89, 242, 0], [102, 114, 3], [127, 229, 0], [140, 38, 3], [153, 114, 2], [165, 165, 3],
     [204, 63, 3], [204, 242, 0]],
    [[51, 102, 3], [51, 165, 1], [63, 12, 0], [102, 165, 3], [114, 51, 3], [153, 242, 0], [165, 127, 2], [204, 229, 0],
     [216, 12, 3], [229, 114, 3]],
    [[38, 216, 0], [51, 12, 0], [51, 242, 0], [76, 127, 3], [89, 38, 3], [140, 242, 0], [165, 38, 2], [165, 114, 3],
     [178, 191, 1], [216, 178, 3]],
]
ORDER = [6, 0, 7, 1, 12, 18, 13, 19, 24, 30, 25, 31, 36, 37, 38, 39, 40, 41]
SECTION = 1000
BOB = [0, 0.207912, 0.406737, 0.587785, 0.743145, 0.866025, 0.951057, 0.994522, 0.994522, 0.951057,
       0.866025, 0.743145, 0.587785, 0.406737, 0.207912, 0, -0.207912, -0.406737, -0.587785, -0.743145,
       -0.866025, -0.951057, -0.994522, -0.994522, -0.951057, -0.866025, -0.743145, -0.587785, -0.406737, -0.207912]

BACKDROP, INTRO = 864, 80
CAVE, MOUTH, MEADOW = 0, 1, 2
BACKDROPS_AT = [-100, 764]
MEADOW_STOP, JYNX_AT = 10, BACKDROP * 1.35
START = [(-160.76952 - UNIT * 4 * (z % 2), Y_MAX - (z + 1) * 81.67091) for z in range(SEATS)]
AI_TABLE = [None, [0xC10, 1, 1, 1], [0x120, 0x210, 1, 1], [0x120, 1, 0x182, 0x140]]
AI_ENOUGH = [None, 5, 9, None]
CHASE, CHASE_NEAR, FOLLOW, ROAM, ROAM_SAFE = 4, 0x2000, 2, 0x1000, 1
FAR, MID, ANY, NO_LEFT, CROWDS, MAGS_X2 = 0x100, 0x200, 0x800, 0x10, 0x40, 0x80
ROAM_X, ROAM_W, ROAM_Y, ROAM_H, ROAM_TOP = -158.62593, 480.16498, -127.32945, 245.01274, 117.68329
U = 4294967296

# How long after the play's end a round is over (the winners' cheer, made for
# the remake), and the frame the play ends on (it doesn't depend on anyone's pads)
AFTER = 30


def level_code(level, cpus):
    return LEVELS.get(level, 2) if any(cpus) else 1


def sign(v):
    return 1 if v > 0 else -1


def clamp(v, m):
    return sign(v) * m if abs(v) > m else v


def norm(x, y):
    d = math.sqrt(y * y + x * x)
    return (x / d, y / d) if d != 0 else (x, y)


def along(ax, ay, bx, by, px, py):
    a, b = ax - px, ay - py
    ex, ey = bx - px - a, by - py - b
    l2 = ex * ex + ey * ey
    t = -((a * ex + b * ey) / l2) if l2 != 0 else 0
    cx, cy = t * ex + a, t * ey + b
    return math.sqrt(cx * cx + cy * cy), t


class Golbat:
    __slots__ = ("z", "human", "x", "y", "vx", "vy", "dash", "flap", "hurt", "hit", "timer", "hitT", "glow",
                 "face", "last", "hearts", "ai", "dx", "dy", "tx", "ty")

    def __init__(self, z, human):
        self.z, self.human = z, human
        self.x, self.y = START[z]
        self.vx = self.vy = 0
        self.dash = self.flap = self.hurt = self.hit = False
        self.timer, self.hitT, self.glow = 0, HIT_FOR, True
        self.face, self.last, self.hearts = 0, 0, 0
        self.ai = 0 if human else 0x1000
        self.dx, self.dy = 1, 0
        self.tx, self.ty = START[z]


class Thing:
    """A Magnemite or a heart."""
    __slots__ = ("id", "x", "y", "y0", "n", "vx", "vy", "kind", "owner", "knocked", "got", "timer", "flash")

    def __init__(self, **kw):
        self.y0 = self.n = 0
        self.vx = self.vy = 0
        self.kind, self.owner, self.knocked, self.got, self.timer, self.flash = None, -1, False, False, 0, False
        for k, v in kw.items():
            setattr(self, k, v)


class World:
    """One round's world (rules.js's World)."""

    def __init__(self, seed, level="normal", cpus=(False, True, True, True)):
        self.level = level_code(level, cpus)
        self.seed = seed & 0xFFFFFFFF
        self.t = -1
        self.end = None
        self.ids = 0
        self.events = []
        self.g = [Golbat(z, not cpus[z]) for z in range(SEATS)]
        self.mags = []
        self.hearts = []
        self.bgs = [[x + (SCROLL / 2) * INTRO, CAVE] for x in BACKDROPS_AT]
        self.mouth = False
        self.jynx = None
        self.scroll = SCROLL
        self.spawning = True
        self.time = TIME
        self.sec = self.entry = 0
        self.dist = 0
        for g in self.g:
            a, b = (self.rnd() % 201) / 100 - 1, (self.rnd() % 201) / 100 - 1
            g.dx, g.dy = (1, 0) if a == 0 and b == 0 else norm(a, b)
        for g in self.g:
            self.roam_to(g)

    def rnd(self):
        self.seed = (self.seed * 1664525 + 1013904223) & 0xFFFFFFFF
        return self.seed

    def u(self):
        return self.rnd() / U

    def step(self, t, pads):
        if self.end is not None:
            return
        self.t = t
        self.cpus()
        if self.spawning:
            self.course()
        for g in self.g:
            self.golbat(g, pads[g.z])
            g.timer += 1
            g.hitT += 1
        for m in list(self.mags):
            if self.magnemite(m):
                m.timer += 1
        for h in list(self.hearts):
            if self.heart(h):
                h.timer += 1
        self.backdrops()

    def backdrops(self):
        for b in self.bgs:
            if b[1] == MEADOW:
                if b[0] < BACKDROP * 0.95:
                    self.spawning = False
                if b[0] < MEADOW_STOP:
                    self.scroll = 0
            b[0] += self.scroll / 2
            if b[0] < -BACKDROP:
                b[0] += 2 * BACKDROP
                if self.time < 0:
                    if not self.mouth:
                        b[1] = MOUTH
                        self.mouth = True
                        continue
                    b[1] = MEADOW
                    self.jynx = JYNX_AT
                    for g in self.g:
                        g.glow = False
        if self.jynx is not None:
            self.jynx += self.scroll / 2
        self.time -= 1
        if self.scroll == 0 and self.end is None:
            self.end = self.t

    def course(self):
        self.dist -= self.scroll
        if self.dist > SECTION:
            self.dist = 0
            self.sec += 1
            self.entry = 0
        lst = SECTIONS[ORDER[self.sec if self.sec < len(ORDER) else 12 + (self.sec - 12) % 6]]
        while self.entry < len(lst):
            at, h, what = lst[self.entry]
            if not at * SECTION < self.dist * 255:
                break
            if what == MAGNEMITE or what == 1 or (what == 2 and self.level >= 2):
                self.add_magnemite(-(h / 255) * 444.18225 + 213.68527)
            elif what == HEART:
                self.add_heart(x=EDGE, y=2 * (-(h / 255) * 213.68527) + 213.68527, kind="course")
            self.entry += 1

    def add_magnemite(self, y):
        if len(self.mags) >= MAGS:
            return
        self.ids += 1
        self.mags.append(Thing(id=self.ids, x=EDGE, y=y, y0=y))

    def add_heart(self, x, y, kind, vx=0, vy=0, owner=-1, knocked=False):
        if len(self.hearts) >= HEARTS:
            return
        self.ids += 1
        self.hearts.append(Thing(id=self.ids, x=x, y=y, vx=vx, vy=vy, kind=kind, owner=owner, knocked=knocked))

    def cpus(self):
        lst = [g for g in self.g if not g.human]
        n = len(lst)
        if not n:
            return
        for _ in range(3 * n):
            a = self.rnd() % n
            b = self.rnd() % n
            lst[a], lst[b] = lst[b], lst[a]
        for k in range(n - 1, 0, -1):
            for j in range(k):
                if lst[j].hearts < lst[j + 1].hearts:
                    lst[j], lst[j + 1] = lst[j + 1], lst[j]
        enough = AI_ENOUGH[self.level]
        for i, g in enumerate(lst):
            g.ai = AI_TABLE[self.level][i]
            if enough is not None and g.hearts >= enough:
                g.ai = (g.ai | ROAM) & ~(CHASE_NEAR | CHASE | FOLLOW)
        lead, last = self.leader(None), lst[n - 1]
        if not lead or n < 2:
            return
        h, best = lead.hearts, lst[0].hearts
        chase = None
        if self.level == 1:
            if h >= 9 and best * 3 < h:
                chase = False
        elif self.level == 2:
            if h >= 6 and best < h:
                chase = best * 2 < h
        elif h >= 4 and best < h:
            chase = best * 2.33 < h
        if chase is True:
            last.ai = (last.ai | CHASE) & ~FOLLOW
        elif chase is False:
            last.ai = (last.ai | FOLLOW) & ~CHASE

    def leader(self, but):
        best, most = None, 0
        for g in self.g:
            if g is not but and g.human and g.hearts > most:
                most, best = g.hearts, g
        return best

    def golbat(self, g, pad):
        g.vx *= DRAG
        g.vy *= DRAG
        g.vy += GRAVITY
        pads = self.pad(g, pad) if g.human else self.think(g)
        if pads & 0x8000:
            self.flag(g, "flap")
        if g.hurt:
            if g.timer >= HURT_FOR:
                g.hurt = False
        else:
            if pads & 0x100:
                g.face = 0
            elif pads & 0x200:
                g.face = 1
            elif abs(g.vx) < 1:
                g.face = 0
            g.dash = math.sqrt(g.vx * g.vx + g.vy * g.vy) > DASH
        g.x += g.vx
        g.y += g.vy
        for o in self.g:
            if o is not g:
                self.bump(g, o)
        g.vx = clamp(g.vx, VMAX)
        g.vy = clamp(g.vy, VMAX)
        self.bounds(g)
        if g.flap and g.timer >= FLAP_FOR:
            g.flap = False
        if g.hit and g.hitT >= HIT_FOR:
            g.hit = False
        g.last = pads

    def pad(self, g, pad):
        x = max(-64, min(64, int(pad[0]))) if pad else 0
        pads = 0
        g.vx += x * SPD_X
        if pad and pad[1]:
            g.vy += FLAP
            pads = 0x8000
        if x > 0:
            pads |= 0x100
        elif x < 0:
            pads |= 0x200
        return pads

    def flag(self, g, what):
        if what == "flap":
            if not g.hurt:
                g.flap = True
                g.timer = 0
        elif what == "hurt":
            g.flap = g.hit = False
            g.hurt = True
            g.timer = 0
        elif what == "hit":
            g.hit = True
            g.timer = g.hitT = 0

    def bounds(self, g):
        if g.y < FLOOR:
            g.y = FLOOR
            if g.vy < 0:
                g.vy *= -0.5
        if g.y > Y_MAX:
            g.y = Y_MAX
            g.vy *= 0
        if g.x < X_MIN:
            g.x = X_MIN
            g.vx *= 0.5
        if g.x > X_MAX:
            g.x = X_MAX
            g.vx *= 0.5

    def bump(self, a, b):
        dx, dy = a.x - b.x, a.y - b.y
        d = math.sqrt(dx * dx + dy * dy)
        if not d < BUMP:
            return
        if d != 0:
            dx /= d
            dy /= d
        else:
            dx, dy = 1, 0
        rx, ry = a.vx - b.vx, a.vy - b.vy
        vn = rx * dx + ry * dy
        ka = kb = 0.8
        if a.dash and not b.dash:
            ka = 0.5
            self.knock(b)
        elif b.dash and not a.dash:
            kb = 0.5
            self.knock(a)
        push = BUMP - d
        px, py = push * dx * 0.5, push * dy * 0.5
        a.x += px
        a.y += py
        b.x -= px
        b.y -= py
        self.bounds(b)
        ax, ay = dx * vn, dy * vn
        a.vx += ax * -(1 + PLAYER_BND) * ka
        a.vy += ay * -(1 + PLAYER_BND) * ka
        b.vx += ax * (1 + PLAYER_BND) * kb
        b.vy += ay * (1 + PLAYER_BND) * kb

    def knock(self, g):
        self.events.append(("bump", g.z))
        self.drop(g, True)
        self.flag(g, "hit")

    def drop(self, g, knocked):
        if g.hearts <= 0:
            return
        dx, dy = norm((self.u() * 685.94995 + X_MIN) * 0.7 - g.x, (self.u() * 408.35455 + FLOOR) * 0.7 - g.y)
        self.add_heart(x=g.x, y=g.y, vx=dx * 15 - self.scroll, vy=dy * 15, kind="dropped", owner=g.z, knocked=knocked)
        g.hearts -= 1
        self.events.append(("drop", g.z))

    def magnemite(self, m):
        m.n += 1
        m.x += self.scroll
        m.y = BOB[m.n % 30] * 10 + m.y0
        for g in self.g:
            if g.hurt:
                continue
            dx, dy = g.x - m.x, g.y - m.y
            d = math.sqrt(dx * dx + dy * dy)
            if not d < HIT:
                continue
            m.timer = 0
            m.flash = True
            if d != 0:
                dx /= d
                dy /= d
            else:
                dx, dy = 0, -1
            g.vx += dx * ENEMY_BND
            g.vy += dy * ENEMY_BND
            n = int((g.hearts + 1) * DROP_RATE) or 1
            for _ in range(n):
                self.drop(g, False)
            self.flag(g, "hurt")
            self.events.append(("zap", g.z, m.id))
        if m.x < -EDGE:
            self.mags.remove(m)
            return False
        if m.flash and m.timer >= FLASH_FOR:
            m.flash = False
        return True

    def heart(self, h):
        got = gone = False
        if h.got:
            gone = h.timer >= GOT_FOR
        elif h.kind in ("dropped", "course"):
            h.vx *= DRAG
            h.vy *= DRAG
            h.x += h.vx + self.scroll
            h.y += h.vy
            if h.kind == "dropped":
                if h.y > Y_MAX:
                    h.y = Y_MAX
                    h.vy *= -1
                if h.y < FLOOR:
                    h.y = FLOOR
                    h.vy *= -1
            got = self.catch(h)
        if h.x < -EDGE:
            gone = True
        if got:
            h.got = True
            h.timer = 0
            h.vx = h.vy = 0
        if gone:
            self.hearts.remove(h)
            return False
        return True

    def catch(self, h):
        for g in self.g:
            if not (((g.z != h.owner and not h.knocked) or h.timer >= MINE_FOR)
                    and abs(h.x - g.x) < GRAB and abs(h.y - g.y) < GRAB):
                continue
            g.hearts = min(HEARTS_MAX, g.hearts + 1)
            self.events.append(("got", g.z, h.id))
            return True
        return False

    def think(self, g):
        vx, vy, f = g.vx, g.vy, g.ai
        if f & CHASE:
            self.chase(g, 12)
        elif f & CHASE_NEAR:
            self.chase(g, 7)
        elif f & FOLLOW:
            self.follow(g)
        elif f & ROAM:
            self.roam(g, False)
        elif f & ROAM_SAFE:
            self.roam(g, True)
        else:
            self.seek(g)
        pads = 0
        if g.vx < vx:
            pads = 0x200
        elif vx < g.vx:
            pads = 0x100
        if vy <= g.vy:
            if g.last & 0x8000:
                g.vy = vy
            else:
                pads |= 0x8000
        return pads

    def seek(self, g):
        f = g.ai
        right = 464.8498 if f & FAR else 393.1944 if f & MID else X_MAX
        weights = (1, 0, 1, 1) if f & NO_LEFT else (1, 1, 2, 1) if f & CROWDS else (1, 1, 1, 2) if f & MAGS_X2 else (1, 1, 1, 1)
        h = self.pick(g, right, not f & ANY, *weights)
        dx = dy = d = 0
        if h:
            dx = h.x + self.scroll * 4 - g.x
            dy = h.y - g.y
            d = math.sqrt(dy * dy + dx * dx)
            dx, dy = norm(dx, dy)
        self.steer(g, dx * 0.3, dy * 0.3, d)

    def pick(self, g, right, reach, w_near, w_left, w_crowd, w_mags):
        best, out = 3.4028235e38, None
        for h in self.hearts:
            if not h.x < right + 30 or not (not reach or self.reachable(g, h.x, h.y)):
                continue
            dx, dy = g.x - h.x, g.y - h.y
            s = math.sqrt(dx * dx + dy * dy) * w_near + (EDGE - h.x) * 0.2 * w_left
            s -= self.crowd(h.x, h.y) * w_crowd
            s += self.in_the_way(g, h.x, h.y) * w_mags
            if s < best:
                best, out = s, h
        return out

    def reachable(self, g, x, y):
        if x < X_MIN:
            return False
        if x < g.x:
            dx, dy = g.x - x, g.y - y
            if 2 * (x - X_MIN) < math.sqrt(dx * dx + dy * dy):
                return False
        return True

    def crowd(self, x, y):
        n = 0
        for h in self.hearts:
            dx, dy = x - h.x, y - h.y
            v = CROWD - math.sqrt(dx * dx + dy * dy)
            if v > 0:
                n += v
        return n

    def in_the_way(self, g, x, y):
        n = 0
        for m in self.mags:
            d, t = along(g.x, g.y, m.x, m.y, x, y)
            if t > 0 and t < 1 and d < NEAR:
                n += 70
        return n

    def steer(self, g, dx, dy, d):
        g.dx, g.dy = norm(g.dx + dx, g.dy + dy)
        ax, ay = self.dodge(g)
        if ax != 0 or ay != 0:
            ax, ay = norm(ax, ay)
            g.dx, g.dy = norm(g.dx + ax * 1.5, g.dy + ay * 1.5)
            return
        if d > 0:
            bx, by = self.brake(g)
            self.push(g, bx + ((g.dx * d) / 5 - g.vx), by + ((g.dy * d) / 5 - g.vy))
            self.cap(g)
            return
        self.roam(g, True)

    def dodge(self, g):
        ax = ay = 0
        for m in self.mags:
            dx, dy = g.x - m.x, g.y - m.y
            if not abs(dx) < NEAR or not abs(dy) < NEAR:
                continue
            d = math.sqrt(dx * dx + dy * dy)
            dx, dy = norm(dx, dy)
            if d < NEAR:
                ax += dx * (NEAR - d)
                ay += dy * (NEAR - d)
        if ax == 0 and ay == 0:
            return 0, 0
        ax = clamp(ax, STICK)
        g.vx += ax
        if ay > 0:
            g.vy += FLAP
        return ax, ay

    def brake(self, g):
        px, py = g.x + g.vx * 20, g.y + g.vy * 20
        tmin = 1
        for m in self.mags:
            d, t = along(g.x, g.y, px, py, m.x, m.y)
            if d < NEAR and t > 0 and t < 1 and t < tmin:
                tmin = t
        return ((px - g.x) * tmin) / 20 - g.vx, ((py - g.y) * tmin) / 20 - g.vy

    def push(self, g, dx, dy):
        g.vx += clamp(dx, STICK)
        if dy > 0 and g.vy < FLAP:
            g.vy += FLAP

    def cap(self, g):
        g.vx = clamp(g.vx, VMAX)
        if g.vy > VMAX:
            g.vy -= FLAP
        if g.vy < -VMAX:
            g.vy += FLAP

    def roam(self, g, safe):
        dx = dy = 0
        if safe:
            dx, dy = self.dodge(g)
        if not safe or (dx == 0 and dy == 0):
            dx = ROAM_X - g.x if g.x < ROAM_X else g.tx - g.x
            dy = ROAM_Y - g.y if g.y < ROAM_Y else ROAM_TOP - g.y if g.y > ROAM_TOP else g.ty - g.y
        if abs(g.tx - g.x) < UNIT and abs(g.ty - g.y) < UNIT:
            self.roam_to(g)
        self.push(g, dx, dy)
        self.cap(g)

    def roam_to(self, g):
        g.tx = self.u() * ROAM_W + ROAM_X
        g.ty = self.u() * ROAM_H + ROAM_Y

    def chase(self, g, k):
        lead = self.leader(g)
        if not lead:
            return self.seek(g)
        ax, ay = self.dodge(g)
        if ax != 0 or ay != 0:
            return
        nx, ny = norm(lead.x - g.x, lead.y - g.y)
        tx, ty = ax + (lead.x + nx * UNIT * k - g.x), ay + (lead.y + ny * UNIT * k - g.y)
        g.vx += sign(tx) * STICK
        if ty > 0:
            g.vy += FLAP
        self.cap(g)

    def follow(self, g):
        lead = self.leader(g)
        if not lead:
            return self.seek(g)
        ex, ey = lead.x - g.x, lead.y - g.y
        if not UNIT * 3 < abs(ex) and not UNIT * 3 < abs(ey):
            return self.seek(g)
        ax, ay = self.dodge(g)
        if ax != 0 or ay != 0:
            return
        g.vx += clamp(ax + ex, STICK)
        if ay + ey > 0:
            g.vy += FLAP
        self.cap(g)

    @property
    def scores(self):
        return [g.hearts for g in self.g]

    def digest(self):
        """rules.js's digest(), to check the two run alike."""
        parts = [self.t, self.seed, self.sec, self.entry, _hex(self.dist), self.time, self.ids]
        for g in self.g:
            parts += [_hex(g.x), _hex(g.y), _hex(g.vx), _hex(g.vy), g.hearts, int(g.dash), int(g.hurt), g.timer, g.ai, g.last]
        for m in self.mags:
            parts += [m.id, _hex(m.x), _hex(m.y), m.timer]
        for h in self.hearts:
            parts += [h.id, _hex(h.x), _hex(h.y), _hex(h.vx), _hex(h.vy), int(h.got), h.owner, h.timer]
        for b in self.bgs:
            parts += [_hex(b[0]), b[1]]
        return ",".join(str(p) for p in parts)


def _hex(v):
    import struct
    return struct.pack(">d", v).hex()


def end_frame():
    w = World(0, "normal", [False] * SEATS)
    t = 0
    while w.end is None:
        w.t = t
        w.backdrops()
        t += 1
    return w.end


END = end_frame()


class Round:
    """One round's world on the server, run as far as the pads that can still
    come in allow."""

    def __init__(self, seed, level="normal", cpus=(False, True, True, True)):
        self.cpus = list(cpus)
        self.world = World(seed, level, self.cpus)
        self.pads = [[] for _ in range(SEATS)]  # each person's pad changes: [frame, stick x, flap]
        self.at = [0] * SEATS  # where each one's list has been read to
        self.done = None  # how it ended, once decided: dict(f, h)
        self.end = (END + AFTER) / FPS  # s after GO it's over

    def pad_at(self, s, t):
        """Seat s's [stick x, flap] on frame t (frames are run in order)."""
        lst, i = self.pads[s], self.at[s]
        x, flap = (lst[i - 1][1] if i else 0), False
        while i < len(lst) and lst[i][0] <= t:
            x = lst[i][1]
            flap = flap or (lst[i][0] == t and lst[i][2] == 1)
            i += 1
        self.at[s] = i
        return [x, flap]

    def run_to(self, t):
        w = self.world
        while w.end is None and w.t < t:
            f = w.t + 1
            w.step(f, [None if self.cpus[s] else self.pad_at(s, f) for s in range(SEATS)])
            w.events = []

    def pad(self, s, f, x, a, now, allow):
        """Seat s's pad went to stick x (and a flap if a) on frame f (its
        device's word); it came in at round time now, and may be at most allow
        s old. Returns the frame it counts on, or None."""
        if self.cpus[s] or self.done or type(f) is not int or type(x) is not int or a not in (0, 1):
            return None
        if not -64 <= x <= 64:
            return None
        here = int(now * FPS)
        f = min(max(f, here - int(allow * FPS)), here + 1 + AHEAD)  # (no older than the way here allows; not far ahead)
        f = max(f, self.world.t + 1)  # (not what's been run)
        if self.pads[s]:
            last = self.pads[s][-1]
            f = max(f, last[0] + (1 if a and last[2] and last[0] >= f else 0))  # (in order; one flap a frame)
        self.pads[s].append([f, x, a])
        return f

    def wire(self):
        """What a device needs to rejoin the round: how it ended (once decided) and the people's pads so far."""
        return dict(gb=dict(done=self.done, pads=[None if self.cpus[s] else [list(e) for e in self.pads[s]] for s in range(SEATS)]))

    def result(self):
        return self.done

    @property
    def scores(self):
        """Each seat's hearts (as far as the world's been run)."""
        return self.done["h"] if self.done else self.world.scores

    def settle(self, now, allow):
        """Run the world as far as no pad still on its way could change; once
        it's at the end, how it ended: dict(f, h), or None."""
        if self.done:
            return None
        safe = int(now * FPS) - int(allow * FPS) - 1
        if safe < 0:
            return None
        self.run_to(min(safe, END))
        if self.world.end is not None:
            self.done = dict(f=self.world.end, h=self.world.scores)
            return self.done
        return None

    def next_settle(self, allow):
        """When (round time, s) the end can be decided."""
        return None if self.done else (END + 2) / FPS + allow
