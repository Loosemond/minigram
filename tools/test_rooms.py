"""Tests for the rooms server (tools/rooms.py) and its rules (tools/egg_rules.py,
tools/clearcut_rules.py, tools/eevee_rules.py, tools/stampede_rules.py,
tools/pichu_rules.py, tools/togepi_rules.py, tools/golbat_rules.py, tools/barrier_rules.py,
tools/rollout_rules.py).

    python3 tools/test_rooms.py

Runs a server in this process on a free port, with short rounds, and plays it
with scripted clients: the protocol, the score kept from the leans and the cuts
(and the cheats that stops), picking the game, rejoining a round, Telegram
logins, name checks, limits. The checks that play a round in real time, each
in a room of its own, run side by side after the others. Standard library
only; takes about 20 seconds.
"""
import base64
import concurrent.futures
import hashlib
import hmac
import http.server
import json
import math
import os
import socket
import struct
import sys
import threading
import time
import traceback
import urllib.parse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import clearcut_rules  # noqa: E402
import eevee_rules  # noqa: E402
import egg_rules  # noqa: E402
import barrier_rules  # noqa: E402
import golbat_rules  # noqa: E402
import pichu_rules  # noqa: E402
import rollout_rules  # noqa: E402
import topsy_rules  # noqa: E402
import rooms  # noqa: E402
import stampede_rules  # noqa: E402
import togepi_rules  # noqa: E402

# makeSchedules() in web/minigames/src/egg/game.js, run in a browser: the
# first 16 hex digits of the SHA-256 of every drop (the bits of t and fall)
JS_SCHEDULES = {1: "ba64e35664b2591f", 12345: "36b3b248013c25c9", 2 ** 31 - 1: "9812a4cb6c5a99c7"}
# deal() in web/minigames/src/clearcut/rules.js, for every level code: each log's
# target, wait and the bits of its line (web/minigames/tests.js has the same)
JS_DEALS = {1: "845261658a294406", 12345: "dcaad7cc4c79a603", 2 ** 31 - 1: "8c853818348d493e"}
# deal() in web/minigames/src/eevee/rules.js, for levels 1-3: each round's
# kind, fruit, piles, open and fakes (web/minigames/tests.js has the same)
JS_EEVEE = {1: "d54a9e4e6d7d05ec", 12345: "e4663aef5698855e", 2 ** 31 - 1: "60c971ff1eb41fe2"}
# question() and cpuPresses() in web/minigames/src/stampede/rules.js, for
# levels 1-3, each question made from the totals the CPUs' counts give: its
# answer, counting frames, code, the CPUs' answers and presses, and every
# Pokemon in its stream (web/minigames/tests.js has the same)
JS_STAMPEDE = {1: "84a6cb28cd987d1d", 12345: "2a9b704b839d8309", 2 ** 31 - 1: "15649380292b011a"}
# pattern() and cpuPresses() in web/minigames/src/pichu/rules.js, for c 0-3
# over 3000 frames: every Electrode (its direction, button and frames) and the
# CPUs' presses and finishes (web/minigames/tests.js has the same)
JS_PICHU = {1: "e27615795ea9a2a3", 12345: "daf3601d2ace0952", 2 ** 31 - 1: "ecb9ea996496d4dd"}
# web/minigames/src/togepi/rules.js: a race with seat 0 on TOGEPI_SCRIPT and
# three normal CPUs, every lane's x, z, track, progress and state every 50
# frames till it's in, and the finishes (web/minigames/tests.js has the same)
JS_TOGEPI = {1: "efcaeb571cb83ba1", 12345: "98649f14c45fb285", 2 ** 31 - 1: "897e6c53dd29b182"}
TOGEPI_SCRIPT = [[0, 0, -60], [100, 45, -60], [160, 0, -60], [260, -60, -45], [300, 0, -60], [500, 30, 0], [530, 0, -60],
                 [700, -45, -45], [760, 60, -60], [800, 0, -60]]
# web/minigames/src/golbat/rules.js: a round with seats 0 and 2 on golbat_pad()
# and two CPUs (normal, hard and easy), the world's digest() every 50 frames,
# the end and the hearts (web/minigames/tests.js has the same)
JS_GOLBAT = {1: "7f7fc535a3084587", 12345: "1187f3c1ce14e6a9", 2 ** 31 - 1: "25353e1685cb6a40"}
GOLBAT_LEVEL = {1: "normal", 12345: "hard", 2 ** 31 - 1: "easy"}


def golbat_pad(z, t):
    if z == 0:
        return [[64, 0, -64, 32, -32, 0][t // 90 % 6], t % 12 == 0 or t % 47 == 5]
    return [[-64, 64][t // 70 % 2], t % 9 == 0]

# web/minigames/src/barrier/rules.js: a round with seats 0 and 2 on
# barrier_pad() and two CPUs (normal, hard and easy), the world's digest()
# every 50 frames, the end and the points (web/minigames/tests.js has the same)
JS_BARRIER = {1: "ca35d34d47129b07", 12345: "75e7b264d9ec3e9b", 2 ** 31 - 1: "fb92cf612a8219ec"}
BARRIER_LEVEL = {1: "normal", 12345: "hard", 2 ** 31 - 1: "easy"}


def barrier_pad(z, t):
    if z == 0:
        return [[64, 0, -64, 32, -32, 0][t // 40 % 6], t % 23 == 0 or t % 61 == 7]
    return [[-64, 64][t // 70 % 2], t % 19 == 0]

# web/minigames/src/rollout/rules.js: a race with seats 0 and 2 on
# rollout_pad() and two CPUs (normal, hard and easy), the world's digest()
# every 50 frames, the end, the places and the frames in (web/minigames/tests.js has the same)
JS_ROLLOUT = {1: "54a4ecbd48f149ad", 12345: "0478f9cb5f8a5194", 2 ** 31 - 1: "fb2a806822e44641"}
ROLLOUT_LEVEL = {1: "normal", 12345: "hard", 2 ** 31 - 1: "easy"}


def rollout_pad(z, t, w):
    if z == 0:  # (round the track, turning at the corners; a false start)
        d = w.d[0]
        way = 2 if d.y < -150 and d.x > -200 else 4 if d.x < -200 and d.y < 150 else 1 if d.y > 150 and d.x < 200 else 8
        return [way | (16 if t == 0 else 0), t % 47 == 3]
    return [[8, 4, 2, 1, 0, 2][t // 40 % 6], t % 61 == 11]

# web/minigames/src/topsy/rules.js: a round with seats 0 and 2 on topsy_pad()
# and two CPUs (normal, hard, easy), the world's digest() every 100 frames:
# the hard one to its end and the show after (1186 frames), the others 600;
# then the end, the points and the places (web/minigames/tests.js has the same)
JS_TOPSY = {1: "f73c640b45d45abe", 157: "8dcf2582748da502", 2 ** 31 - 1: "e51f8987128a2605"}
TOPSY_LEVEL = {1: "normal", 157: "hard", 2 ** 31 - 1: "easy"}


def topsy_pad(z, t, w):
    if z == 0:  # (at whoever's nearest, a RAPID SPIN now and then)
        me, best, bd = w.p[0], None, math.inf
        for q in w.p:
            if q is me:
                continue
            dx, dz = q.pos[0] - me.pos[0], q.pos[2] - me.pos[2]
            if dx * dx + dz * dz < bd:
                bd, best = dx * dx + dz * dz, (dx, dz)
        dx, dz = best
        return [64 if dx > 50 else -64 if dx < -50 else 0, 64 if dz < -50 else -64 if dz > 50 else 0, t % 53 == 5]
    x, y = [(64, 0), (0, 64), (-45, -45), (0, 0)][t // 60 % 4]
    return [x, y, t % 71 == 13]

# a short round, the same for every seat: (t, col, kind, fall); they reach the
# hands at 0.5, 0.8, 1.1 (the Voltorb), 1.4 and 2.1
SHORT = [(0.0, 0, "egg", 0.5), (0.3, 1, "egg", 0.5), (0.6, 1, "voltorb", 0.5), (0.9, 1, "egg", 0.5), (1.6, -1, "egg", 0.5)]
TOKEN = "12345:TEST-TOKEN"

rooms.LEAD, rooms.GO_DELAY = 0, 300
rooms.GRACE, rooms.SETTLE_LAG, rooms.SLACK, rooms.END_WAIT = 1.5, 5, 0.3, 1
rooms.BOT_TOKEN = TOKEN
rooms.checker = None  # no calls to TypeSafe from the tests
real_schedules = egg_rules.schedules
egg_rules.schedules = lambda seed: [list(SHORT) for _ in range(egg_rules.SEATS)]
REAL_WAITS = clearcut_rules.WAITS
# Clear Cut Challenge's rounds, short: no hauling up, no waits, a 30-frame fall and no show
clearcut_rules.RISE, clearcut_rules.SHOW, clearcut_rules.FALL_FRAMES = 3, 3, 30
clearcut_rules.WAITS = [0] * 5


def real_deal(seed, c):
    saved, clearcut_rules.WAITS = clearcut_rules.WAITS, REAL_WAITS
    try:
        return clearcut_rules.deal(seed, c)
    finally:
        clearcut_rules.WAITS = saved


class Handler(http.server.BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def do_GET(self):
        rooms.serve(self)

    def log_message(self, *args):
        pass


server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
PORT = server.server_address[1]
threading.Thread(target=server.serve_forever, daemon=True).start()


class Client:
    def __init__(self, name):
        self.name = name
        self.s = socket.create_connection(("127.0.0.1", PORT))
        key = base64.b64encode(os.urandom(16)).decode()
        self.s.sendall(("GET /ws HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"
                        "Sec-WebSocket-Key: %s\r\nSec-WebSocket-Version: 13\r\n\r\n" % key).encode())
        head = b""
        while b"\r\n\r\n" not in head:
            head += self.s.recv(1)
        assert b" 101 " in head, head
        self.s.settimeout(3)
        self.inbox = []

    def send(self, t, **kw):
        data = json.dumps(dict(t=t, **kw)).encode()
        mask = os.urandom(4)
        n = len(data)
        head = bytes([0x81]) + (bytes([0x80 | n]) if n < 126 else bytes([0x80 | 126]) + struct.pack(">H", n))
        self.s.sendall(head + mask + bytes(b ^ mask[i % 4] for i, b in enumerate(data)))

    def _exact(self, n):
        b = b""
        while len(b) < n:
            c = self.s.recv(n - len(b))
            if not c:
                raise EOFError
            b += c
        return b

    def read(self):
        b0, b1 = self._exact(2)
        n = b1 & 0x7F
        if n == 126:
            n = struct.unpack(">H", self._exact(2))[0]
        elif n == 127:
            n = struct.unpack(">Q", self._exact(8))[0]
        data = self._exact(n)
        if b0 & 0x0F == 8:
            return {"t": "_closed"}
        return json.loads(data)

    def wait(self, t, timeout=3):
        end = time.time() + timeout
        for i, m in enumerate(self.inbox):
            if m["t"] == t:
                return self.inbox.pop(i)
        while time.time() < end:
            m = self.read()
            if m["t"] == t:
                return m
            self.inbox.append(m)
        raise AssertionError("%s: no %s (got %s)" % (self.name, t, [m["t"] for m in self.inbox]))

    def drain(self, quiet=0.3):
        """Everything that has come in (and comes within `quiet` s)."""
        self.s.settimeout(quiet)
        try:
            while True:
                self.inbox.append(self.read())
        except (socket.timeout, TimeoutError, EOFError):
            pass
        except ConnectionError:  # closed with our messages still unread (Windows resets it)
            self.inbox.append({"t": "_closed"})
        self.s.settimeout(3)
        out, self.inbox = self.inbox, []
        return out

    def close(self):
        self.s.close()


def at(go, t):
    """Wait until round time t (s from GO at server time go, ms)."""
    time.sleep(max(0, go / 1000 + t - rooms.clock() / 1000))


def evs(msgs, s=None):
    return [(m["s"], m["n"], m["k"], m["e"]) for m in msgs if m["t"] == "ev" and (s is None or m["s"] == s)]


def init_data(user, age=0, with_signature=True, token=TOKEN):
    """A Mini App's initData, signed the way Telegram signs it."""
    fields = {"query_id": "AAHtest", "user": json.dumps(user, separators=(",", ":")),
              "auth_date": str(int(time.time() - age)), "signature": "c2lnbmF0dXJl"}
    signed = fields if with_signature else {k: v for k, v in fields.items() if k != "signature"}
    secret = hmac.new(b"WebAppData", token.encode(), hashlib.sha256).digest()
    h = hmac.new(secret, "\n".join("%s=%s" % kv for kv in sorted(signed.items())).encode(), hashlib.sha256).hexdigest()
    return urllib.parse.urlencode({**fields, "hash": h})


checks = []  # (name, fn, together)


def check(name, together=None):
    """A check. together: it plays rounds in real time, in a room of its own,
    and runs side by side with the other such checks, after the rest (which
    may change the rules' constants while they run); checks with the same
    together (not True) share a room and run one after another."""
    def add(fn):
        checks.append((name, fn, together))
        return fn
    return add


@check("the drops match the game's, bit for bit")
def _():
    for seed, want in JS_SCHEDULES.items():
        s = "".join("%s,%d,%s,%s;" % (struct.pack(">d", t).hex(), col, kind[0], struct.pack(">d", fall).hex())
                    for seat in real_schedules(seed) for t, col, kind, fall in seat)
        assert hashlib.sha256(s.encode()).hexdigest()[:16] == want, seed
    eggs = [sum(d[2] == "egg" for d in seat) for seat in real_schedules(7)]
    assert eggs == [egg_rules.EGGS] * 4, eggs


@check("Clear Cut Challenge: the logs match the game's, bit for bit")
def _():
    for seed, want in JS_DEALS.items():
        s = "".join("%d,%d,%s;" % (log["T"], log["wait"], struct.pack(">f", log["line"]).hex())
                    for c in range(5) for log in real_deal(seed, c))
        assert hashlib.sha256(s.encode()).hexdigest()[:16] == want, seed
    fall = clearcut_rules.Fall(2)
    got = [clearcut_rules.judge(fall, {"T": 20}, f) for f in (20, 19, 18, 13, 21, 25, 26, 0, None)]
    assert got == [20, 10, 5, -10, -1, -5, -10, -10, -10], got


@check("Eager Eevee: the rounds match the game's, bit for bit")
def _():
    for seed, want in JS_EEVEE.items():
        s = "".join("%d,%d,%d,%d,%s;" % (rd["kind"], rd["fruit"], rd["piles"], rd["open"], "/".join(map(str, rd["fakes"])))
                    for level in (1, 2, 3) for rd in eevee_rules.deal(seed, level))
        assert hashlib.sha256(s.encode()).hexdigest()[:16] == want, seed
    rs = eevee_rules.deal(12345, 2)
    assert [(r["kind"], r["open"], r["fakes"]) for r in rs][:2] == [(1, 165, [29, 70, 145]), (0, 132, [])], rs
    assert all(r["kind"] != eevee_rules.PINECO for s in range(50) for r in eevee_rules.deal(s, 1)[:1])  # (none first on Easy)


def stampede_digest(seed):
    s = ""
    for level in (1, 2, 3):
        st = stampede_rules.setup(level)
        totals = [0] * 4
        for q in range(stampede_rules.QUESTIONS):
            Q = stampede_rules.question(seed, q, st, totals, level)
            presses = [stampede_rules.cpu_presses(Q, level, z) for z in range(4)]
            s += "%d,%d,%d,%s,%s;" % (Q["answer"], Q["frames"], Q["code"], "/".join(map(str, Q["cpu"])),
                                      "/".join(str(len(p)) for p in presses))
            s += "".join("%d,%d,%s,%d,%d,%d,%d;" % (o["kind"], o["role"], struct.pack(">d", o["x"]).hex(), o["z"], o["t2"],
                                                    o["speed"], o["gone"]) for o in Q["stream"])
            for z in range(4):
                totals[z] += stampede_rules.points(q, len(presses[z]), Q["answer"])
            st = stampede_rules.after(Q["state"], q, totals, False)
    return hashlib.sha256(s.encode()).hexdigest()[:16]


@check("Streaming Stampede: the questions match the browser's, bit for bit; the scoring")
def _():
    for seed, want in JS_STAMPEDE.items():
        assert stampede_digest(seed) == want, seed
    P = stampede_rules.points
    assert [P(0, c, 5) for c in (5, 4, 6, 3, 7, 2, 0)] == [10, 5, 5, 1, 1, 0, 0]
    assert [P(2, 9, 9), P(3, 8, 9), P(4, 27, 25), P(4, 0, 1)] == [20, 10, 10, 0]
    st = stampede_rules.after(stampede_rules.setup(1), 0, [10, 10, 10, 10], True)  # four people, all perfect
    assert (st["bonus"], st["level"]) == (2, 2), st
    st = stampede_rules.after(st, 1, [20, 20, 15, 0], True)  # only two perfect: no more
    assert (st["bonus"], st["level"]) == (2, 2), st


def pichu_digest(seed):
    def js(v):  # (as JavaScript writes them)
        return "Infinity" if v == math.inf else "null" if v is None else str(v)
    s = ""
    for c in range(4):
        P = pichu_rules.pattern(seed, c, 3000)
        s += "".join("%d,%d,%s,%s,%s;" % (e["dir"], e["btn"], js(e["frm"]), js(e["close"]), js(e["to"])) for e in P["list"])
        cp = pichu_rules.cpu_presses(seed, c, [False, True, True, True], P)
        s += "|".join(js(x["full"]) + ":" + ",".join("%d/%d/%d" % (p["t"], p["dir"], p["hit"]) for p in x["presses"])
                      if x else "-" for x in cp)
    return hashlib.sha256(s.encode()).hexdigest()[:16]


@check("Pichu's Power Plant: the Electrodes and the CPUs match the browser's, bit for bit; the presses")
def _():
    for seed, want in JS_PICHU.items():
        assert pichu_digest(seed) == want, seed
    P = pichu_rules.pattern(7, 2)
    e = P["list"][0]  # the first, out from GO through the first cycle
    other = pichu_rules.B if e["btn"] == pichu_rules.A else pichu_rules.A
    dead = next(d for d in (1, 2, 3, 4) if d != e["dir"] and d != P["list"][1]["dir"])
    assert pichu_rules.Runner(P).press(0, e["dir"], e["btn"]) == "miss"  # (on GO's frame it isn't out yet)
    r = pichu_rules.Runner(P)
    assert r.press(1, e["dir"], e["btn"]) == "hit"
    assert r.press(2, e["dir"], e["btn"]) is None  # too soon: the button has to come up
    assert r.press(3, e["dir"], e["btn"]) == "hit"
    assert r.press(5, e["dir"], other) == "miss"  # the wrong button: a shock
    assert r.press(5 + pichu_rules.SHOCK, e["dir"], e["btn"]) is None  # (shocked)
    assert r.press(6 + pichu_rules.SHOCK, e["dir"], e["btn"]) == "hit"
    assert r.press(8 + pichu_rules.SHOCK, dead, e["btn"]) == "miss"  # one that isn't out
    assert r.press(20 + pichu_rules.SHOCK, 0, e["btn"]) is None and r.charge == 3  # no direction: nothing
    # every level's CPUs get there, the harder ones sooner
    firsts = {c: sorted(pichu_rules.finish([x["full"] for x in pichu_rules.cpu_presses(s, c, [True] * 4, pichu_rules.pattern(s, c))])[0]
                        for s in range(20))[10] for c in (1, 2, 3)}
    assert firsts[1] < firsts[2] < firsts[3] < 700, firsts


@check("Eager Eevee: a dash, a feint, the basket and a Pineco; who gets the prize")
def _():
    rs = eevee_rules.deal(12345, 2)
    times = eevee_rules.timeline(rs)
    t1 = times[1]
    r = eevee_rules.Runner(times, rs)
    assert r.press("a", t1["play"] - 1) is None  # (in Aipom's call: A doesn't work yet)
    assert r.press("b", t1["play"] + 5) == (1, False, None) and r.ready == t1["play"] + 16  # a feint: 11 frames
    assert r.press("a", t1["play"] + 10) is None
    assert r.press("a", t1["play"] + 16) == (1, True, None) and r.ready == t1["play"] + 16 + 87  # into the basket
    o = t1["open"]
    assert r.press("a", o + 4) == (1, False, o + 8)  # the basket's up: in 4 frames later
    assert r.press("b", o + 20) is None  # (in: done this round)
    t3 = times[3]  # a Pineco: blown away, back once the ring's been round
    r3 = eevee_rules.Runner(times, rs)
    assert r3.press("a", t3["open"] + 6)[2] == t3["open"] + 10 and r3.ready == r3.blown_back(t3["open"] + 6) > t3["end"] + 200
    melon = dict(kind=eevee_rules.FRUIT, fruit=eevee_rules.MELON, piles=1)
    assert eevee_rules.judge(melon, [30, 30, 31, None]) == ([1000, 1000, 0, 0], 30)  # a tie shares it
    berries = dict(kind=eevee_rules.BERRIES, fruit=0, piles=1)
    assert eevee_rules.judge(berries, [40, 42, None, None]) == ([600, 400, 0, 0], 45)  # 2 alone, then 4 each
    three = dict(kind=eevee_rules.BERRIES, fruit=0, piles=3)
    assert eevee_rules.judge(three, [None, 50, None, None]) == ([0, 3000, 0, 0], 59)  # three a frame, ten frames
    assert eevee_rules.judge(melon, [None] * 4) is None


@check("Clear Cut Challenge: after a miss a seat swings again 45 frames on, unless it swung too early")
def _():
    short = clearcut_rules.RISE, clearcut_rules.SHOW, clearcut_rules.FALL_FRAMES, clearcut_rules.WAITS
    clearcut_rules.RISE, clearcut_rules.SHOW, clearcut_rules.FALL_FRAMES, clearcut_rules.WAITS = 117, 195, 80, REAL_WAITS
    try:
        g = clearcut_rules.Round(7, "normal")  # (the first log always hangs 100 frames; normal: reaches the blade at 16)
        t, T = g.times[0], g.logs[0]["T"]
        assert g.fall.reach == 16 and t["drop"] - t["ready"] == 100, (g.fall.reach, t)

        def swing(s, f):
            return g.cut(s, 0, f, (t["drop"] + f) / clearcut_rules.FPS)
        # seat 0 swings as the log comes to hang: a miss, open; A works again 45 frames on, and the cut counts
        assert swing(0, -100) == [(0, -100, -10, 0, True)]
        assert swing(0, -60) is None, "A worked again too soon"
        assert g.wire()["cuts"][0][0] == [-100, -10, 1]
        assert swing(0, T) == [(0, T, 20, 20, False)] and swing(0, T + 50) is None
        # seat 1 swings 20 frames before the drop: the log gets to the blade first, so A's locked for the log
        assert swing(1, -20) == [(0, -20, -10, 0, False)] and swing(1, T) is None
        # seat 2 misses early and doesn't swing again: the miss counts when the log's judged
        assert swing(2, -100)[0][4] and g.settle(2, t["judged"] / clearcut_rules.FPS) == [(0, -100, -10, 0, False)]
        # seat 3 misses late: it may swing again (another miss) till the log's judged
        assert swing(3, 30) == [(0, 30, -10, 0, True)] and swing(3, 76) == [(0, 76, -10, 0, False)]
        assert g.scores == [20, 0, 0, 0] and g.cuts[1][0] == (-20, -10), (g.scores, g.cuts)
    finally:
        clearcut_rules.RISE, clearcut_rules.SHOW, clearcut_rules.FALL_FRAMES, clearcut_rules.WAITS = short


A = Client("A")
A.send("hello", id="a1", name="Ann")
w = A.wait("welcome")
code = w["room"]
B = Client("B")


@check("rooms: making one, joining, errors")
def _():
    assert w["seat"] == 0 and len(code) == 4, w
    assert A.wait("room")["players"][0]["name"] == "Ann"
    B.send("hello", id="b1", name="Bob", room=code.lower())
    assert B.wait("welcome")["seat"] == 1
    assert [p["name"] for p in A.wait("room")["players"]] == ["Ann", "Bob"]
    for room, err in (("QQQQ", "no-room"), ("AB1", "bad-code")):
        c = Client("C")
        c.send("hello", id="c1", room=room)
        assert c.wait("error")["code"] == err
        c.close()


@check("only the host sets the level and starts; renames are rate-limited")
def _():
    B.send("level", level="hard")
    B.send("start")
    assert not any(m["t"] == "start" for m in B.drain())
    A.send("level", level="hard")
    assert A.wait("room")["level"] == "hard"
    A.send("level", level="easy")  # too soon after the last change: ignored
    assert all(m.get("level") == "hard" for m in A.drain() if m["t"] == "room")
    A.send("ping", c=123)
    pong = A.wait("pong")
    assert pong["c"] == 123 and pong["s"] > 0
    A.send("ping", c=124, rtt=42.4)  # its round trip, for the others' delay ("start": rtt)
    B.send("ping", c=125, rtt="slow")  # not a number: not kept
    A.wait("pong")
    B.wait("pong")


@check("a round: the server keeps the score from the leans, and stops cheats", together="A and B")
def _():
    A.drain()
    B.drain()
    time.sleep(rooms.CHANGE_GAP)
    A.send("start")
    sa, sb = A.wait("start"), B.wait("start")
    assert sa["seed"] == sb["seed"] and sa["round"] == 1 and sa["go"] > rooms.clock() - 2000  # (GO's this round's: the others' checks keep the CPU busy)
    assert sa["drops"][0][2] == [0.6, 1, "v", 0.5] and sa["settled"] == [0] * 4 and sa["leans"] == [None] * 4
    assert sa["rtt"] == [42, None, 42, 42], sa["rtt"]  # each seat's device: Ann plays the CPUs
    go, r = sa["go"], sa["round"]
    # Ann (seat 0) plays well: leans right for the second egg, stays for the Voltorb, left for the last one
    A.send("lean", r=r, s=0, g=0.6, l=1)
    A.send("lean", r=r, s=0, g=1.5, l=-1)
    A.send("lean", r=r, s=2, g=0.1, l=1)  # the host plays the CPUs; seat 3 stays in the middle
    A.send("lean", r=99, s=0, g=0.7, l=0)  # another round's: ignored
    B.send("lean", r=r, s=0, g=0.7, l=0)  # someone else's player: ignored
    B.send("lean", r=r, s=3, g=0.7, l=1)  # a CPU, not the host: ignored
    B.send("lean", r=r, s=1, g=0.9, l=1)  # Bob moves right, under the Voltorb
    assert B.wait("lean") == dict(t="lean", r=r, s=0, g=0.6, l=1)
    B.send("ev", r=r, s=1, n=4, k="c", e=9)  # a drop that hasn't arrived yet: ignored
    at(go, 0.55)
    A.send("ev", r=r, s=0, n=0, k="c", e=1)
    B.send("ev", r=r, s=1, n=0, k="c", e=1)
    at(go, 0.62)
    A.send("done", r=r)  # "done" before the end doesn't end the round
    B.send("done", r=r)
    at(go, 0.85)
    A.send("ev", r=r, s=0, n=1, k="c", e=2)
    B.send("ev", r=r, s=1, n=1, k="c", e=2)  # Bob wasn't there
    at(go, 1.15)
    A.send("ev", r=r, s=0, n=2, k="h", e=0)
    B.send("ev", r=r, s=0, n=2, k="c", e=50)  # not his seat: ignored
    at(go, 1.45)
    B.send("ev", r=r, s=1, n=3, k="c", e=50)  # stunned, and the count's made up
    res = A.wait("results", timeout=5)
    got_at = (rooms.clock() - go) / 1000
    assert got_at > egg_rules.Round(0).end - rooms.SLACK - 0.05, got_at
    assert res["scores"] == [1, 0, 0, 1], res
    a_msgs, b_msgs = A.drain(), B.drain()
    assert any(m["t"] == "results" and m["scores"] == [1, 0, 0, 1] for m in b_msgs)
    # Bob heard Ann's catches and shock as the server judged them
    assert evs(b_msgs, 0)[:3] == [(0, 0, "c", 1), (0, 1, "c", 2), (0, 2, "h", 0)], evs(b_msgs, 0)
    # and the server's word on his own: the egg he didn't catch, the shock he didn't
    # report, the stunned egg he did
    assert evs(b_msgs, 1) == [(1, 1, "m", 1), (1, 2, "h", 0), (1, 3, "m", 0)], evs(b_msgs, 1)
    # Ann heard nothing back on the ones she got right, only the last one, judged at the end
    assert evs(a_msgs, 0) == [(0, 4, "c", 1)], evs(a_msgs, 0)
    assert (1, 0, "c", 1) in evs(a_msgs, 1) and (1, 2, "h", 0) in evs(a_msgs, 1)
    assert evs(a_msgs, 2) == [(2, 1, "c", 1), (2, 2, "h", 0)] and evs(a_msgs, 3) == [(3, 0, "c", 1)]


@check("rejoining mid-round: the round so far comes back", together="A and B")
def _():
    time.sleep(rooms.CHANGE_GAP)
    A.send("start")
    s = A.wait("start")
    B.wait("start")
    go, r = s["go"], s["round"]
    B.send("lean", r=r, s=1, g=0.2, l=1)
    at(go, 0.85)
    B.send("ev", r=r, s=1, n=1, k="c", e=1)  # missed the first (leaning right), caught the second
    time.sleep(0.1)
    B.close()
    snap = [m for m in A.drain() if m["t"] == "room"][-1]
    assert snap["players"][1]["away"] is True
    B2 = Client("B2")
    B2.send("hello", id="b1", name="Bob", room=code)
    assert B2.wait("welcome")["seat"] == 1
    st = B2.wait("start")
    assert st["round"] == r and st["go"] == go and st["drops"] == s["drops"], st
    assert st["scores"][1] == 1 and st["leans"][1] == [0.2, 1] and st["settled"][1] == 2 and st["hits"][1] is None, st
    B2.send("done", r=r)
    A.send("done", r=r)
    assert A.wait("results", timeout=5)["round"] == r
    globals()["B"] = B2


@check("leaving mid-round: the seat becomes a CPU, played by the host", together="A and B")
def _():
    A.drain()
    B.drain()
    time.sleep(rooms.CHANGE_GAP)
    A.send("start")
    r = A.wait("start")["round"]
    B.wait("start")
    B.send("leave")
    assert A.wait("left")["seat"] == 1
    time.sleep(0.1)
    snap = [m for m in A.drain() if m["t"] == "room"][-1]
    assert snap["state"] == "playing" and snap["lineup"][1]["here"] is False
    A.send("lean", r=r, s=1, g=0.3, l=-1)  # now the host's
    time.sleep(0.1)
    assert rooms.rooms[code].game.cols[1] == [-1]
    A.send("done", r=r)
    assert A.wait("results", timeout=5)["round"] == r


@check("the host moves on when the host leaves; a full room", together="A and B")
def _():
    b = Client("B3")
    b.send("hello", id="b2", name="Bea", room=code)
    b.wait("welcome")
    A.send("leave")
    time.sleep(0.2)
    snap = [m for m in b.drain() if m["t"] == "room"][-1]
    assert snap["host"] == 1 and len(snap["players"]) == 1, snap
    cs = []
    for i in range(3):
        c = Client("F%d" % i)
        c.send("hello", id="f%d" % i, room=code)
        c.wait("welcome")
        cs.append(c)
    c = Client("F4")
    c.send("hello", id="f9", room=code)
    assert c.wait("error")["code"] == "full"
    cs[0].close()
    time.sleep(rooms.GRACE + 1.2)
    assert any(m["t"] == "left" for m in b.drain()), "no left after the grace period"
    for c in cs[1:] + [b]:
        c.close()


@check("Clear Cut Challenge: the host picks it; the server judges the cuts and stops cheats", together=True)
def _():
    a, b = Client("CA"), Client("CB")
    a.send("hello", id="ca", name="Cid", game="clearcut")  # a new room, with the game on Cid's title
    ccode = a.wait("welcome")["room"]
    assert a.wait("room")["game"] == "clearcut"
    b.send("hello", id="cb", name="Dee", room=ccode, game="egg")  # joining doesn't change it
    b.wait("welcome")
    time.sleep(rooms.CHANGE_GAP)
    b.send("game", game="egg")  # not the host: ignored
    a.send("game", game="tetris")  # not a game: ignored
    time.sleep(0.2)
    assert rooms.rooms[ccode].minigame == "clearcut"
    a.drain()
    b.drain()
    time.sleep(rooms.CHANGE_GAP)
    a.send("start")
    s = a.wait("start")
    assert b.wait("start")["seed"] == s["seed"]
    assert s["game"] == "clearcut" and s["c"] == 2 and s["scores"] == [0] * 4 and s["cuts"] == [[None] * 5] * 4, s
    go, r = s["go"], s["round"]
    logs = clearcut_rules.deal(s["seed"], 2)  # (the short round's: no waits)
    times = clearcut_rules.timeline(logs)
    t0 = logs[0]["T"]
    fall = clearcut_rules.Fall(2)
    late = next(d for d in (3, 2, 1) if clearcut_rules.judge(fall, logs[1], logs[1]["T"] + d) != clearcut_rules.MISS)  # (its top may be past the blade by 3)
    b.send("cut", r=r, s=0, n=0, f=t0)  # someone else's player: ignored
    b.send("cut", r=r, s=1, n=3, f=logs[3]["T"])  # a log that isn't up yet: ignored
    a.send("cut", r=r, s=0, n=0, f=t0)  # on the target: 20
    b.send("cut", r=r, s=1, n=0, f=t0 - 2)  # 2 frames early: 5
    b.send("cut", r=r, s=1, n=0, f=t0)  # a second swing at it: ignored
    a.send("cut", r=r, s=2, n=0, f=t0 + 1)  # the host plays the CPUs: late, -1 (and a total can't go under 0)
    at(go, times[1]["ready"] / clearcut_rules.FPS)
    b.send("cut", r=r, s=1, n=1, f=logs[1]["T"] + late)  # late: -3 (or -2, -1)
    a.s.settimeout(12)  # (quiet stretches longer than the usual 3 s)
    res = a.wait("results", timeout=12)
    cuts = [(m["s"], m["n"], m["f"], m["p"], m["e"]) for m in b.drain() if m["t"] == "cut"]
    assert (0, 0, t0, 20, 20) in cuts and (1, 0, t0 - 2, 5, 5) in cuts and (2, 0, t0 + 1, -1, 0) in cuts, cuts
    assert (1, 1, logs[1]["T"] + late, -late, 5 - late) in cuts, cuts
    assert (3, 0, None, -10, 0) in cuts, "seat 3 didn't cut: a miss"
    assert sum(1 for c in cuts if c[:2] == (1, 0)) == 1 and sum(1 for c in cuts if c[:2] == (0, 3)) <= 1
    g = rooms.rooms[ccode].game
    assert res["scores"] == g.scores and g.cuts[0][0] == (t0, 20) and g.cuts[1][0] == (t0 - 2, 5), (res, g.cuts)
    assert g.scores[0] == 0 and g.scores[1] == 0, g.scores  # the logs they didn't cut: -10 each, down to 0
    a.close()
    b.close()


@check("Eager Eevee: the server judges the races and stops cheats", together=True)
def _():
    short = [dict(n=n, kind=k, fruit=f, piles=p, open=12, fakes=[], final=n == 4)
             for n, (k, f, p) in enumerate([(eevee_rules.FRUIT, eevee_rules.MELON, 1), (eevee_rules.BERRIES, 0, 1),
                                            (eevee_rules.PINECO, 0, 1), (eevee_rules.FRUIT, eevee_rules.GRAPES, 1),
                                            (eevee_rules.BERRIES, 0, 3)])]
    saved = eevee_rules.deal, eevee_rules.INTRO, eevee_rules.AFTER
    eevee_rules.deal, eevee_rules.INTRO, eevee_rules.AFTER = (lambda seed, level: [dict(r) for r in short]), 3, 30
    try:
        a, b = Client("EA"), Client("EB")
        a.send("hello", id="ea", name="Eve", game="eevee")
        code = a.wait("welcome")["room"]
        b.send("hello", id="eb", name="Fay", room=code)
        b.wait("welcome")
        time.sleep(rooms.CHANGE_GAP)
        a.drain()
        b.drain()
        a.send("start")
        st = a.wait("start")
        assert st["game"] == "eevee" and st["ee"] == dict(level=2, scores=[0] * 4, prizes=[[None] * 5] * 4), st
        go, r = st["go"], st["round"]
        times = eevee_rules.timeline(short)  # (rounds of 45 frames: the open at 15)

        def dash(c, seat, f, k="a"):
            at(go, (f + 0.2) / eevee_rules.FPS)
            c.send("dash", r=r, s=seat, k=k, f=f)

        o = times[0]["open"]
        dash(b, 1, o + 5)  # in at o + 9
        dash(a, 2, o + 5)  # the host plays the CPUs: a tie
        dash(a, 0, o + 6)  # a frame late
        b.send("dash", r=r, s=0, k="a", f=o + 6)  # someone else's player: ignored
        b.send("dash", r=r, s=1, k="a", f=o + 7)  # in already: ignored
        got = a.wait("got", timeout=4)
        assert (got["n"], got["p"], got["e"]) == (0, [0, 1000, 1000, 0], [0, 1000, 1000, 0]), got
        seen = [(m["s"], m["f"]) for m in b.drain() if m["t"] == "dash"]
        assert sorted(seen) == [(0, o + 6), (2, o + 5)], seen  # (its own isn't sent back)
        o = times[1]["open"]  # strawberries: seat 0 alone for 2 frames, then both
        dash(a, 0, o + 4)
        dash(b, 1, o + 6)
        got = b.wait("got", timeout=4)
        assert (got["n"], got["p"]) == (1, [600, 400, 0, 0]), got
        o = times[2]["open"]  # a Pineco: no prize, and blown away for a good while
        dash(a, 3, o + 4)
        dash(a, 0, o + 5)
        o = times[3]["open"]
        dash(b, 1, o - 2)  # before the basket's up: into it
        dash(b, 1, o + 5)  # ...and not back yet
        dash(a, 0, o + 5)  # still blown away
        dash(a, 2, o + 7)
        at(go, (o + 20) / eevee_rules.FPS)
        a.send("dash", r=r, s=3, k="a", f=o + 6)  # 13 frames old: counts as no earlier than the way here allows
        got = a.wait("got", timeout=4)
        while got["n"] < 3:
            got = a.wait("got", timeout=4)
        assert (got["n"], got["p"]) == (3, [0, 0, 500, 0]), got
        a.s.settimeout(8)
        res = a.wait("results", timeout=8)
        g = rooms.rooms[code].game
        assert res["scores"] == g.scores == [600, 1400, 1500, 0], (res, g.scores)
        assert g.prizes[0][:4] == [None, "berries", "pineco", None] and g.prizes[3][2] == "pineco", g.prizes
        assert g.runners[3].got_in[3] is None or g.runners[3].got_in[3] >= o + 20 - int(rooms.ALLOW_GUESS * eevee_rules.FPS) + 4
        a.close()
        b.close()
    finally:
        eevee_rules.deal, eevee_rules.INTRO, eevee_rules.AFTER = saved


@check("Streaming Stampede: the server counts the presses, gives the answers and stops cheats", together=True)
def _():
    # short questions: 3 Pokemon that are gone by frame 10 of a 20-frame counting
    def short(seed, q, state, totals=(0,) * 4, com=None):
        stream = [dict(kind=0, role=0, x=300.0, z=300, t2=0, speed=60, gone=9) for _ in range(3)]
        return dict(q=q, special=False, k=0, code=0, what=[0], members=[0], stream=stream, answer=3, last=9,
                    frames=20, cpu=[3, 3, 2, 4], seed=seed, state=dict(state))
    def presses(Q, level, seat):  # (the CPUs count to their answers once the stream's gone)
        return list(range(10, 10 + Q["cpu"][seat]))
    saved = (stampede_rules.question, stampede_rules.cpu_presses, stampede_rules.CARD, stampede_rules.ANSWER,
             stampede_rules.LAST_ANSWER)
    stampede_rules.question, stampede_rules.cpu_presses = short, presses
    stampede_rules.CARD, stampede_rules.ANSWER, stampede_rules.LAST_ANSWER = 3, 12, 12
    try:
        a, b = Client("SA"), Client("SB")
        a.send("hello", id="sa", name="Sam", game="stampede")
        code = a.wait("welcome")["room"]
        b.send("hello", id="sb", name="Sue", room=code)
        b.wait("welcome")
        time.sleep(rooms.CHANGE_GAP)
        a.drain()
        b.drain()
        a.send("start")
        st = a.wait("start")
        assert st["game"] == "stampede" and st["ss"] == dict(told=[None] * 5), st
        go, r = st["go"], st["round"]
        g = rooms.rooms[code].game
        assert g.cpus == [False, False, True, True]

        def press(c, seat, f, n=0):
            at(go, (g.at[n]["count"] + f + 0.3) / stampede_rules.FPS)
            c.send("count", r=r, s=seat, n=n, f=f)

        press(a, 0, 2)
        press(a, 0, 4)
        press(b, 1, 4)
        b.send("count", r=r, s=1, n=0, f=4)  # the same frame again: one a frame
        b.send("count", r=r, s=0, n=0, f=5)  # someone else's player: ignored
        b.send("count", r=r, s=1, n=0, f=19)  # in the future: ignored
        a.send("count", r=r, s=2, n=0, f=5)  # a CPU's: the server counts those itself
        press(a, 0, 7)
        press(b, 1, 8)
        seen = [(m["s"], m["f"]) for m in b.drain() if m["t"] == "count"]
        assert seen == [(0, 2), (0, 4), (0, 7)], seen  # (its own aren't sent back)
        ans = a.wait("ans", timeout=4)
        assert (ans["n"], ans["c"], ans["p"], ans["e"]) == (0, [3, 2, 2, 4], [10, 5, 5, 5], [10, 5, 5, 5]), ans
        a.send("count", r=r, s=0, n=0, f=10)  # after the answer: too late
        press(b, 1, 3, n=1)  # the next question: Sue counts one
        a.s.settimeout(8)
        res = a.wait("results", timeout=10)
        assert g.verdicts[0][0] == [3, 2, 2, 4], g.verdicts[0]
        assert res["scores"] == g.scores, (res, g.scores)
        assert [v[0] for v in g.verdicts[1:]] == [[0, 1, 2, 4]] + [[0, 0, 2, 4]] * 3, g.verdicts
        assert g.scores == [10, 5 + 1, 50, 50], g.scores  # (2 of 3 and 4 of 3 score too: 5, 5, 10, 10, 20)
        b.close()
        a.close()
    finally:
        (stampede_rules.question, stampede_rules.cpu_presses, stampede_rules.CARD, stampede_rules.ANSWER,
         stampede_rules.LAST_ANSWER) = saved


@check("Pichu's Power Plant: the server checks the presses, says who finished first and stops cheats", together=True)
def _():
    saved = pichu_rules.FULL, pichu_rules.cpu_presses
    pichu_rules.FULL = 3  # (three hits to win)
    pichu_rules.cpu_presses = lambda seed, c, cpus, P: [dict(presses=[], full=None) if cpus[s] else None for s in range(4)]
    try:
        a, b = Client("PA"), Client("PB")
        a.send("hello", id="pa", name="Pam", game="pichu")
        code = a.wait("welcome")["room"]
        b.send("hello", id="pb", name="Pat", room=code)
        b.wait("welcome")
        time.sleep(rooms.CHANGE_GAP)
        a.drain()
        b.drain()
        a.send("start")
        st = a.wait("start")
        assert st["game"] == "pichu" and st["pp"] == dict(done=None, presses=[[], [], None, None]), st
        go, r = st["go"], st["round"]
        g = rooms.rooms[code].game
        assert g.cpus == [False, False, True, True]
        e = g.P["list"][0]
        other = pichu_rules.B if e["btn"] == pichu_rules.A else pichu_rules.A

        def press(c, seat, f, btn=e["btn"], claim=None):
            at(go, (f + 0.3) / pichu_rules.FPS)
            c.send("press", r=r, s=seat, f=f if claim is None else claim, d=e["dir"], b=btn)

        press(a, 0, 3)
        press(b, 1, 4, other)  # the wrong button: Pat's Pichu is shocked
        press(a, 0, 5)
        press(b, 1, 6)  # shocked: it doesn't count, and Pat's device hears so
        a.send("press", r=r, s=1, f=6, d=e["dir"], b=e["btn"])  # someone else's player: ignored
        press(a, 0, 20, claim=0)  # older than the way here allows: it counts as late as that does
        late = 20 - int(rooms.ALLOW_GUESS * pichu_rules.FPS)
        got = a.drain(0.3)
        heard = [(m["s"], m["f"], m.get("o")) for m in got if m["t"] == "press"]
        assert heard == [(1, 4, None), (0, late, 0)], heard  # (Pat's miss; and Pam's own, where it counts)
        won = next((m for m in got if m["t"] == "won"), None) or a.wait("won", timeout=3)
        assert (won["f"], won["w"], won["e"]) == (late, [1, 0, 0, 0], [3, 0, 0, 0]), won
        seen = [(m["s"], m["f"], m.get("x")) for m in b.drain() if m["t"] == "press"]
        assert seen == [(0, 3, None), (0, 5, None), (1, 6, 1), (0, late, None)], seen  # (its own shocked press: x)
        a.send("press", r=r, s=0, f=late + 3, d=e["dir"], b=e["btn"])  # after the finish: too late
        a.s.settimeout(8)
        res = a.wait("results", timeout=10)
        assert res["scores"] == [3, 0, 0, 0] and g.end == (late + pichu_rules.END) / pichu_rules.FPS, (res, g.end)
        b.close()
        a.close()
    finally:
        pichu_rules.FULL, pichu_rules.cpu_presses = saved


def togepi_digest(seed):
    def q(v):
        return math.floor(v * 1000 + 0.5)
    C = togepi_rules.course(seed)
    lanes = [togepi_rules.Lane(seed, z, C, 2 if z else 0) for z in range(4)]
    s = ",".join(map(str, C["pattern"])) + "/" + ",".join(map(str, C["flip"])) + ";"
    k, stick = 0, [0, 0]
    for t in range(3000):
        while k < len(TOGEPI_SCRIPT) and TOGEPI_SCRIPT[k][0] <= t:
            stick = TOGEPI_SCRIPT[k][1:]
            k += 1
        for lane in lanes[1:]:
            lane.step(t)
        togepi_rules.rank_cpus(lanes)
        lanes[0].step(t, stick[0], stick[1])
        if t % 50 == 0:
            s += "|".join("F" if lane.finish is not None else ",".join(
                map(str, [q(lane.x), q(lane.z), lane.tile, q(lane.px), q(lane.progress), lane.state])) for lane in lanes) + ";"
        if all(lane.finish is not None for lane in lanes):
            break
    s += ",".join(map(str, [lane.finish for lane in lanes]))
    return hashlib.sha256(s.encode()).hexdigest()[:16]


@check("Tumbling Togepi: the lanes and the CPUs match the browser's, bit for bit; the race", together="Togepi")
def _():
    for seed, want in JS_TOGEPI.items():
        assert togepi_digest(seed) == want, seed
    # every level's CPUs get there, the harder ones sooner (the course is the same for all)
    def finish(seed, lv):
        C = togepi_rules.course(seed)
        lanes = [togepi_rules.Lane(seed, z, C, lv) for z in range(4)]
        for t in range(4000):
            for lane in lanes:
                lane.step(t)
            togepi_rules.rank_cpus(lanes)
            if all(lane.finish is not None for lane in lanes):
                break
        return sorted(lane.finish for lane in lanes)[1]
    firsts = {lv: sorted(finish(s, lv) for s in range(8))[4] for lv in (1, 2, 3)}
    assert firsts[1] < firsts[3] < 1500, firsts
    # someone who stands still doesn't move; one who runs gets there
    C = togepi_rules.course(5)
    still, runner = togepi_rules.Lane(5, 0, C), togepi_rules.Lane(5, 1, C)
    for t in range(1500):
        still.step(t, 0, 0)
        runner.step(t, 0, -60)
    assert still.progress < 1 and still.tile == 1 and runner.finish is not None, (still.progress, runner.finish)


@check("Tumbling Togepi: the server runs the lanes from the sticks, says how it ended and stops cheats", together="Togepi")
def _():
    saved = togepi_rules.END_TILE, togepi_rules.CALL
    togepi_rules.END_TILE, togepi_rules.CALL = 2, 45  # (a short course: in after about 60 frames; called 45 after the first)
    try:
        a, b = Client("TA"), Client("TB")
        a.send("hello", id="ta", name="Tam", game="togepi")
        code = a.wait("welcome")["room"]
        b.send("hello", id="tb", name="Tod", room=code)
        b.wait("welcome")
        time.sleep(rooms.CHANGE_GAP)
        a.drain()
        b.drain()
        a.send("start")
        st = a.wait("start")
        assert st["game"] == "togepi" and st["tg"] == dict(done=None, sticks=[[], [], None, None]), st
        go, r = st["go"], st["round"]
        g = rooms.rooms[code].game
        assert g.cpus == [False, False, True, True]
        at(go, 0.05)
        a.send("stick", r=r, s=0, f=0, x=0, y=-60)  # Tam runs from GO
        a.send("stick", r=r, s=1, f=1, x=0, y=-60)  # someone else's player: ignored
        b.send("stick", r=r, s=1, f=2, x=90, y=-60)  # out of range: ignored
        at(go, 30 / togepi_rules.FPS)
        b.send("stick", r=r, s=1, f=0, x=0, y=-60)  # Tod's, older than the way here allows: it counts as late as that does
        late = 30 - int(rooms.ALLOW_GUESS * togepi_rules.FPS)
        mine = [(m["s"], m["f"], m.get("o")) for m in b.drain(0.3) if m["t"] == "stick"]
        assert mine == [(0, 0, None), (1, late, 0)], mine  # (Tam's; and Tod's own, from where it counts)
        heard = [(m["s"], m["f"], m["x"], m["y"]) for m in a.drain(0.1) if m["t"] == "stick"]
        assert heard == [(1, late, 0, -60)], heard
        won = a.wait("won", timeout=8)
        # the same race, here: who got in when
        want = togepi_rules.Round(rooms.rooms[code].seed, "normal", cpus=[False, False, True, True])
        want.sticks = [[[0, 0, -60]], [[late, 0, -60]], [], []]
        said = {k: won[k] for k in ("f", "fin", "p")}
        assert want.settle(100, 0) == said and said["fin"][0] is not None and said["fin"][1] > said["fin"][0], (won, want.done)
        assert g.end == (won["f"] + togepi_rules.END_AFTER) / togepi_rules.FPS
        a.send("stick", r=r, s=0, f=won["f"] + 5, x=60, y=0)  # after the end: nothing
        a.send("done", r=r)
        b.send("done", r=r)
        res = a.wait("results", timeout=10)
        assert res["scores"] == [-1 if f is None else round(f * 100 / 30) for f in won["fin"]], res
        b.close()
        a.close()
    finally:
        togepi_rules.END_TILE, togepi_rules.CALL = saved


def golbat_digest(seed):
    w = golbat_rules.World(seed, GOLBAT_LEVEL[seed], [False, True, False, True])
    parts, t = [], 0
    while w.end is None:
        w.step(t, [golbat_pad(0, t), None, golbat_pad(2, t), None])
        w.events = []
        if t % 50 == 0:
            parts.append(w.digest())
        t += 1
    parts.append("%d:%s" % (w.end, ",".join(map(str, w.scores))))
    return hashlib.sha256(";".join(parts).encode()).hexdigest()[:16]


@check("Gutsy Golbat: the world (the CPUs too) matches the browser's, bit for bit; the round", together="Golbat")
def _():
    for seed, want in JS_GOLBAT.items():
        assert golbat_digest(seed) == want, seed
    assert golbat_rules.END == 1837, golbat_rules.END  # (the cave's mouth after 1200 frames, the meadow, and it stops)
    # the CPUs catch hearts, more on the harder levels (four CPUs: the people's seats hold still)
    def best(seed, level):
        w = golbat_rules.World(seed, level, [False, True, True, True])
        t = 0
        while w.end is None:
            w.step(t, [[0, False], None, None, None])
            t += 1
        return max(w.scores[1:])
    tops = {lv: sum(best(s, lv) for s in range(6)) for lv in ("easy", "hard")}
    assert 0 < tops["easy"] < tops["hard"], tops


@check("Gutsy Golbat: the server runs the world from the pads, says how it ended and stops cheats", together="Golbat")
def _():
    saved = golbat_rules.TIME, golbat_rules.BACKDROPS_AT, golbat_rules.MEADOW_STOP, golbat_rules.END
    # (a short round: the cave's mouth and the meadow come at once, and it stops at 640)
    golbat_rules.TIME, golbat_rules.MEADOW_STOP = -1, 640
    golbat_rules.BACKDROPS_AT = [-860 + 320, -856 + 320]
    golbat_rules.END = golbat_rules.end_frame()
    try:
        assert 40 < golbat_rules.END < 70, golbat_rules.END
        a, b = Client("GA"), Client("GB")
        a.send("hello", id="ga", name="Gil", game="golbat")
        code = a.wait("welcome")["room"]
        b.send("hello", id="gb", name="Bea", room=code)
        b.wait("welcome")
        time.sleep(rooms.CHANGE_GAP)
        a.drain()
        b.drain()
        a.send("start")
        st = a.wait("start")
        assert st["game"] == "golbat" and st["gb"] == dict(done=None, pads=[[], [], None, None]), st
        go, r = st["go"], st["round"]
        g = rooms.rooms[code].game
        assert g.cpus == [False, False, True, True]
        at(go, 0.05)
        a.send("pad", r=r, s=0, f=0, x=64, a=1)  # Gil flies right, flapping
        a.send("pad", r=r, s=1, f=1, x=0, a=1)  # someone else's Golbat: ignored
        b.send("pad", r=r, s=1, f=2, x=90, a=0)  # out of range: ignored
        b.send("pad", r=r, s=1, f=2, x=10, a=2)  # not a flap or none: ignored
        at(go, 25 / golbat_rules.FPS)
        b.send("pad", r=r, s=1, f=0, x=-64, a=1)  # Bea's, older than the way here allows: it counts as late as that does
        late = 25 - int(rooms.ALLOW_GUESS * golbat_rules.FPS)
        mine = [(m["s"], m["f"], m.get("o")) for m in b.drain(0.3) if m["t"] == "pad"]
        assert mine == [(0, 0, None), (1, late, 0)], mine  # (Gil's; and Bea's own, from where it counts)
        heard = [(m["s"], m["f"], m["x"], m["a"]) for m in a.drain(0.1) if m["t"] == "pad"]
        assert heard == [(1, late, -64, 1)], heard
        won = a.wait("won", timeout=8)
        # the same round, here
        want = golbat_rules.Round(rooms.rooms[code].seed, "normal", cpus=[False, False, True, True])
        want.pads = [[[0, 64, 1]], [[late, -64, 1]], [], []]
        said = {k: won[k] for k in ("f", "h")}
        assert want.settle(100, 0) == said and said["f"] == golbat_rules.END, (won, want.done)
        assert g.end == (golbat_rules.END + golbat_rules.AFTER) / golbat_rules.FPS
        a.send("pad", r=r, s=0, f=won["f"] + 5, x=-64, a=1)  # after the end: nothing
        a.send("done", r=r)
        b.send("done", r=r)
        res = a.wait("results", timeout=10)
        assert res["scores"] == won["h"], res
        b.close()
        a.close()
    finally:
        golbat_rules.TIME, golbat_rules.BACKDROPS_AT, golbat_rules.MEADOW_STOP, golbat_rules.END = saved


def barrier_digest(seed):
    w = barrier_rules.World(seed, BARRIER_LEVEL[seed], [False, True, False, True])
    parts, t = [], 0
    while w.end is None:
        w.step(t, [barrier_pad(0, t), None, barrier_pad(2, t), None])
        w.events = []
        if t % 50 == 0:
            parts.append(w.digest())
        t += 1
    parts.append("%d:%s" % (w.end, ",".join(map(str, w.scores))))
    return hashlib.sha256(";".join(parts).encode()).hexdigest()[:16]


@check("Barrier Ball: the world (the CPUs too) matches the browser's, bit for bit; the round", together="Barrier")
def _():
    for seed, want in JS_BARRIER.items():
        assert barrier_digest(seed) == want, seed
    # the ball table's sines, as the main program has them (0x80087FB0): a few, and none of the last bits off
    assert [barrier_rules.sine(i) for i in (0, 1024, 2048, 3072, 512)] == [0, 1, 0, -1, barrier_rules.fround(0.5 ** 0.5)]
    # the harder CPUs let fewer goals in (the people's seat holds still)
    def conceded(seed, level):
        w = barrier_rules.World(seed, level, [False, True, True, True])
        t, n = 0, 0
        while w.end is None:
            w.step(t, [[0, False], None, None, None])
            n += sum(1 for e in w.events if e[0] == "goal" and e[1] > 0)
            w.events = []
            t += 1
        return n
    let_in = {lv: sum(conceded(s, lv) for s in range(8)) for lv in ("easy", "hard")}
    assert let_in["hard"] < let_in["easy"], let_in
    # a round ends at 5 points, or when the minute's up
    w = barrier_rules.World(3, "hard", [True] * 4)
    t = 0
    while w.end is None:
        w.step(t, [])
        t += 1
    assert w.end == barrier_rules.TIME or max(w.scores) == barrier_rules.GOAL, (w.end, w.scores)
    # a device sends its player's pad a few frames ahead (src/lag.js leadFor): it counts then; far
    # ahead, AHEAD frames on
    g = barrier_rules.Round(3, "normal", [False, True, True, True])
    here = 10
    assert g.pad(0, here + 3, 10, 0, here / barrier_rules.FPS, 0.2) == here + 3
    assert g.pad(0, here + 40, 20, 0, here / barrier_rules.FPS, 0.2) == here + 1 + barrier_rules.AHEAD


@check("Barrier Ball: the server runs the world from the pads, says how it ended and stops cheats", together="Barrier")
def _():
    saved = barrier_rules.TIME, barrier_rules.LONGEST
    barrier_rules.TIME = 45  # (a short round)
    barrier_rules.LONGEST = barrier_rules.TIME + 1
    try:
        a, b = Client("BA"), Client("BB")
        a.send("hello", id="ba", name="Mia", game="barrier")
        code = a.wait("welcome")["room"]
        b.send("hello", id="bb", name="Max", room=code)
        b.wait("welcome")
        time.sleep(rooms.CHANGE_GAP)
        a.drain()
        b.drain()
        a.send("start")
        st = a.wait("start")
        assert st["game"] == "barrier" and st["bb"] == dict(done=None, pads=[[], [], None, None]), st
        go, r = st["go"], st["round"]
        g = rooms.rooms[code].game
        assert g.cpus == [False, False, True, True]
        at(go, 0.05)
        a.send("pad", r=r, s=0, f=0, x=64, a=1)  # Mia slides along, smashing
        a.send("pad", r=r, s=1, f=1, x=0, a=1)  # someone else's Mr. Mime: ignored
        b.send("pad", r=r, s=1, f=2, x=90, a=0)  # out of range: ignored
        b.send("pad", r=r, s=1, f=2, x=10, a=2)  # not a smash or none: ignored
        at(go, 25 / barrier_rules.FPS)
        b.send("pad", r=r, s=1, f=0, x=-64, a=1)  # Max's, older than the way here allows: it counts as late as that does
        late = 25 - int(rooms.ALLOW_GUESS * barrier_rules.FPS)
        mine = [(m["s"], m["f"], m.get("o")) for m in b.drain(0.3) if m["t"] == "pad"]
        assert mine == [(0, 0, None), (1, late, 0)], mine  # (Mia's; and Max's own, from where it counts)
        heard = [(m["s"], m["f"], m["x"], m["a"]) for m in a.drain(0.1) if m["t"] == "pad"]
        assert heard == [(1, late, -64, 1)], heard
        won = a.wait("won", timeout=8)
        # the same round, here
        want = barrier_rules.Round(rooms.rooms[code].seed, "normal", cpus=[False, False, True, True])
        want.pads = [[[0, 64, 1]], [[late, -64, 1]], [], []]
        said = {k: won[k] for k in ("f", "p")}
        assert want.settle(100, 0) == said and said["f"] == barrier_rules.TIME, (won, want.done)
        assert g.end == (barrier_rules.TIME + barrier_rules.AFTER) / barrier_rules.FPS
        a.send("pad", r=r, s=0, f=won["f"] + 5, x=-64, a=1)  # after the end: nothing
        a.send("done", r=r)
        b.send("done", r=r)
        res = a.wait("results", timeout=10)
        assert res["scores"] == won["p"], res
        b.close()
        a.close()
    finally:
        barrier_rules.TIME, barrier_rules.LONGEST = saved


def rollout_digest(seed):
    w = rollout_rules.World(seed, ROLLOUT_LEVEL[seed], [False, True, False, True])
    parts, t = [], 0
    while w.end is None:
        w.step(t, [rollout_pad(0, t, w), None, rollout_pad(2, t, w), None])
        w.events = []
        if t % 50 == 0:
            parts.append(w.digest())
        t += 1
    parts.append("%d:%s:%s" % (w.end, ",".join(map(str, w.places)), ",".join(str(d.fin) for d in w.d)))
    return hashlib.sha256(";".join(parts).encode()).hexdigest()[:16]


@check("Rampage Rollout: the world (the CPUs too) matches the browser's, bit for bit; the race", together="Rollout")
def _():
    for seed, want in JS_ROLLOUT.items():
        assert rollout_digest(seed) == want, seed
    # the main program's arctangent table (0x8008CFB0): a few of its 1025, made the same way
    assert [rollout_rules.ATAN[i] for i in (0, 1, 512, 1023, 1024)] == [0, 10, 4836, 8187, 8192]
    assert [rollout_rules.angle(*p) for p in ((1, 0), (0, 1), (-1, 0), (0, -1), (1, 1))] == [0, 16384, -32768, -16384, 8192]

    # the harder CPUs are quicker: over a few races, the last in comes in sooner, and fewer clouds catch them
    def race(seed, level):
        w = rollout_rules.World(seed, level, [True] * 4)
        t, hit = 0, 0
        while w.end is None:
            w.step(t, [])
            hit += sum(1 for e in w.events if e[0] == "hit")
            w.events = []
            t += 1
        return w.end, hit
    easy, hard = [race(s, "easy") for s in range(6)], [race(s, "hard") for s in range(6)]
    assert sum(e for e, _ in hard) < sum(e for e, _ in easy) and sum(h for _, h in hard) < sum(h for _, h in easy), (easy, hard)
    # everyone's in at the end, nine laps on; the first in is first
    w = rollout_rules.World(4, "normal", [True] * 4)
    t = 0
    while w.end is None:
        w.step(t, [])
        t += 1
    fin = [d.fin for d in w.d]
    assert all(d.laps == 0 and d.done for d in w.d) and w.end == max(fin) + 1, (w.end, fin)
    assert w.places[fin.index(min(fin))] == 1 and [d.won for d in w.d].count(True) >= 1


@check("Rampage Rollout: the server runs the world from the pads, says how it ended and stops cheats", together="Rollout")
def _():
    saved = rollout_rules.LAPS
    rollout_rules.LAPS = 1  # (a short race: one lap)
    try:
        a, b = Client("RA"), Client("RB")
        a.send("hello", id="ra", name="Rex", game="rollout")
        code = a.wait("welcome")["room"]
        b.send("hello", id="rb", name="Rio", room=code)
        b.wait("welcome")
        time.sleep(rooms.CHANGE_GAP)
        a.drain()
        b.drain()
        a.send("start")
        st = a.wait("start")
        assert st["game"] == "rollout" and st["rr"] == dict(done=None, pads=[[], [], None, None]), st
        go, r = st["go"], st["round"]
        g = rooms.rooms[code].game
        assert g.cpus == [False, False, True, True]
        at(go, 0.05)
        a.send("pad", r=r, s=0, f=0, x=rollout_rules.LEFT, a=1)  # Rex: a rocket start, along the top
        a.send("pad", r=r, s=1, f=1, x=rollout_rules.UP, a=1)  # someone else's Donphan: ignored
        b.send("pad", r=r, s=1, f=2, x=40, a=0)  # not a D-pad: ignored
        b.send("pad", r=r, s=1, f=2, x=2, a=2)  # not A or none: ignored
        at(go, 25 / rollout_rules.FPS)
        b.send("pad", r=r, s=1, f=0, x=rollout_rules.LEFT, a=1)  # Rio's, older than the way here allows: as late as that does
        late = 25 - int(rooms.ALLOW_GUESS * rollout_rules.FPS)
        mine = [(m["s"], m["f"], m.get("o")) for m in b.drain(0.3) if m["t"] == "pad"]
        assert mine == [(0, 0, None), (1, late, 0)], mine  # (Rex's; and Rio's own, from where it counts)
        heard = [(m["s"], m["f"], m["x"], m["a"]) for m in a.drain(0.1) if m["t"] == "pad"]
        assert heard == [(1, late, rollout_rules.LEFT, 1)], heard
        a.s.settimeout(40)  # (a lap: quiet stretches longer than the usual 3 s)
        won = a.wait("won", timeout=40)
        a.s.settimeout(3)
        # the same race, here
        want = rollout_rules.Round(rooms.rooms[code].seed, "normal", cpus=[False, False, True, True])
        want.pads = [[[0, rollout_rules.LEFT, 1]], [[late, rollout_rules.LEFT, 1]], [], []]
        said = {k: won[k] for k in ("f", "fin", "p")}
        assert want.settle(1000, 0) == said, (won, want.done)
        assert sorted(said["p"]) == [1, 2, 3, 4] and said["f"] == max(said["fin"]) + 1, said
        assert g.end == (said["f"] + rollout_rules.AFTER) / rollout_rules.FPS
        a.send("pad", r=r, s=0, f=won["f"] + 5, x=1, a=1)  # after the end: nothing
        a.send("done", r=r)
        b.send("done", r=r)
        a.s.settimeout(8)  # (the round's over 3 s after the race: AFTER)
        res = a.wait("results", timeout=10)
        assert res["scores"] == [round(f * 100 / rollout_rules.FPS) for f in said["fin"]], res
        b.close()
        a.close()
    finally:
        rollout_rules.LAPS = saved


def topsy_digest(seed):
    w = topsy_rules.World(seed, TOPSY_LEVEL[seed], [False, True, False, True])
    parts, t = [], 0
    while (not (w.over and t > w.end + 120)) if seed == 157 else t < 600:
        w.step(t, [topsy_pad(0, t, w), None, topsy_pad(2, t, w), None])
        w.events = []
        if t % 100 == 0:
            parts.append(w.digest())
        if t % 50 == 0:
            time.sleep(0.002)  # (a busy minute of Python: the other checks' clocks go on meanwhile)
        t += 1
    parts.append("%d:%s:%s" % (-1 if w.end is None else w.end, ",".join(map(str, w.scores)), ",".join(map(str, w.places))))
    return hashlib.sha256(";".join(parts).encode()).hexdigest()[:16]


@check("Topsy-Turvy: the world (the CPUs too) matches the browser's, bit for bit", together="Topsy")
def _():
    for seed, want in JS_TOPSY.items():
        assert topsy_digest(seed) == want, seed
    # the game's sine, cosine and arctangent (libultra's sinf and cosf; module #48's continued fraction)
    T = topsy_rules
    for x in (0.0, 0.3, -1.2, 2.5, 3.1, -3.14, 7.0, 40.0):
        assert abs(T.sinf(x) - math.sin(x)) < 2e-6 and abs(T.cosf(x) - math.cos(x)) < 2e-6, x
    for y, x in ((1, 2), (-3, 1), (2, -5), (-1, -1), (5, 0), (0, 0)):
        assert abs(T.atan2(y, x) - math.atan2(y, x)) < 1e-6, (y, x)
    assert T.atan2(0, -1) == -T.PI  # (straight back is -pi, not pi: its last case)
    # the ring: the rim 1800 across, its floor 1620, 222 deep in the middle (0x86004BD4)
    assert abs(T.surface_y(T.OUTER, 1800, 0)) < 0.01 and round(T.surface_y(T.INNER, 0, 0)) == -222, T.surface_y(T.INNER, 0, 0)


@check("Topsy-Turvy: the server runs the world from the pads, says how it ended and stops cheats", together="Topsy")
def _():
    saved = topsy_rules.TIME_LIMIT
    topsy_rules.TIME_LIMIT = 4 * topsy_rules.FPS  # (a short round: four seconds)
    try:
        a, b = Client("TA"), Client("TB")
        a.send("hello", id="ta", name="Tia", game="topsy")
        code = a.wait("welcome")["room"]
        b.send("hello", id="tb", name="Tom", room=code)
        b.wait("welcome")
        time.sleep(rooms.CHANGE_GAP)
        a.drain()
        b.drain()
        a.send("start")
        st = a.wait("start")
        assert st["game"] == "topsy" and st["tt"] == dict(done=None, pads=[[], [], None, None]), st
        go, r = st["go"], st["round"]
        g = rooms.rooms[code].game
        assert g.cpus == [False, False, True, True]
        right = (64 + 64) | (64 << 8)  # (the stick right: (x + 64) | (y + 64) << 8)
        at(go, 0.05)
        a.send("pad", r=r, s=0, f=0, x=right, a=1)  # Tia: pushing right, and A (to jump in)
        a.send("pad", r=r, s=1, f=1, x=right, a=1)  # someone else's Hitmontop: ignored
        for x, ok in ((-1, 1), (0x8081, 1), (129, 1), (right, 2), (1.5, 1)):  # no stick (or not A or none): ignored
            b.send("pad", r=r, s=1, f=2, x=x, a=ok)
        at(go, 40 / topsy_rules.FPS)
        b.send("pad", r=r, s=1, f=0, x=right, a=0)  # Tom's, older than the way here allows: as late as that does
        late = 40 - int(rooms.ALLOW_GUESS * topsy_rules.FPS)
        mine = [(m["s"], m["f"], m.get("o")) for m in b.drain(0.3) if m["t"] == "pad"]
        assert mine == [(0, 0, None), (1, late, 0)], mine  # (Tia's; and Tom's own, from where it counts)
        heard = [(m["s"], m["f"], m["x"], m["a"]) for m in a.drain(0.1) if m["t"] == "pad"]
        assert heard == [(1, late, right, 0)], heard
        a.s.settimeout(10)
        won = a.wait("won", timeout=10)
        a.s.settimeout(3)
        # the same round, here
        want = topsy_rules.Round(rooms.rooms[code].seed, "normal", cpus=[False, False, True, True])
        want.pads = [[[0, right, 1]], [[late, right, 0]], [], []]
        said = {k: won[k] for k in ("f", "s")}
        assert want.settle(1000, 0) == said, (won, want.done)
        assert said["f"] == topsy_rules.TIME_LIMIT - 1, said  # (nobody gets five points in four seconds)
        assert g.end == (said["f"] + topsy_rules.AFTER) / topsy_rules.FPS
        a.send("pad", r=r, s=0, f=won["f"] + 5, x=right, a=1)  # after the end: nothing
        a.send("done", r=r)
        b.send("done", r=r)
        a.s.settimeout(8)  # (the round's over 3 s after the play: AFTER)
        res = a.wait("results", timeout=10)
        assert res["scores"] == said["s"], res
        b.close()
        a.close()
    finally:
        topsy_rules.TIME_LIMIT = saved


@check("Telegram logins: checked, and no one can pose as a Telegram player")
def _():
    t = Client("T")
    t.send("hello", id="whatever", name="Mallory", tg=init_data({"id": 777, "first_name": "Tess"}))
    tw = t.wait("welcome")
    tcode = tw["room"]
    assert t.wait("room")["players"][0]["name"] == "Tess"
    member = rooms.rooms[tcode].members[0]
    assert member.id == "tg777" and member.verified
    time.sleep(rooms.CHANGE_GAP)
    t.send("name", name="Mallory")  # a checked login keeps its Telegram name
    time.sleep(0.2)
    assert member.name == "Tess"
    fake = Client("X")
    fake.send("hello", id="tg777", name="Tess", room=tcode)  # the same id, but no login
    assert fake.wait("welcome")["seat"] == 1 and rooms.rooms[tcode].members[1].id == "web-tg777"
    for tg in (init_data({"id": 778, "first_name": "Old"}, age=3 * 86400),  # too old
               init_data({"id": 779, "first_name": "Forged"}, token="999:OTHER")):  # someone else's bot
        c = Client("Y")
        c.send("hello", id="tg779", tg=tg, room=tcode)
        seat = c.wait("welcome")["seat"]
        assert not rooms.rooms[tcode].members[seat].verified
        c.close()
    c = Client("Z")  # signed without the "signature" field (older clients): fine too
    c.send("hello", id="z", tg=init_data({"id": 780, "first_name": "Zed"}, with_signature=False), room=tcode)
    seat = c.wait("welcome")["seat"]
    assert rooms.rooms[tcode].members[seat].id == "tg780"
    for x in (t, fake, c):
        x.close()


@check("names: a name the check turns down isn't shown")
def _():
    rooms.checker = concurrent.futures.ThreadPoolExecutor(1)
    saved = rooms.ask_typesafe
    rooms.ask_typesafe = lambda name: (name != "Rude", True)
    try:
        c = Client("N")
        c.send("hello", id="n1", name="Rude")
        c.wait("welcome")
        assert c.wait("notice") == dict(t="notice", code="name", name="Rude")
        assert all(p["name"] == "Player 1" for m in c.drain() if m["t"] == "room" for p in m["players"])
        c.send("name", name="Nice")
        assert c.wait("room")["players"][0]["name"] == "Nice"
        c.close()
    finally:
        rooms.ask_typesafe = saved
        rooms.checker = None


@check("limits: a flood closes the connection; too many rooms")
def _():
    c = Client("P")
    c.send("hello", id="p1")
    c.wait("welcome")
    sent = 0
    try:
        for i in range(1000):
            c.send("ping", c=i)
            sent += 1
    except ConnectionError:  # cut off mid-flood
        pass
    msgs = c.drain(1.0)
    pongs = sum(m["t"] == "pong" for m in msgs)
    assert pongs <= rooms.BURST + 5 and (sent < 1000 or msgs[-1]["t"] == "_closed"), (sent, pongs, msgs[-1:])
    saved, rooms.MAX_ROOMS = rooms.MAX_ROOMS, len(rooms.rooms)
    try:
        c = Client("Q")
        c.send("hello", id="q1")
        assert c.wait("error")["code"] == "busy"
    finally:
        rooms.MAX_ROOMS = saved


for name, fn, together in checks:
    if not together:
        fn()
        print("ok  ", name)
groups = {}  # together -> its checks, in order
for name, fn, together in checks:
    if together:
        groups.setdefault(name if together is True else together, []).append((name, fn))
failed, said = [], threading.Lock()


def run_group(group):
    for k, (name, fn) in enumerate(group):
        try:
            fn()
        except Exception:
            failed.append(name)
            with said:
                print("FAIL", name + "".join("\n(not run: %s)" % n for n, _ in group[k + 1:]) + "\n" + traceback.format_exc(), end="")
            return
        with said:
            print("ok  ", name)


with concurrent.futures.ThreadPoolExecutor(len(groups)) as pool:
    list(pool.map(run_group, groups.values()))
if failed:
    sys.exit("%d of %d checks failed" % (len(failed), len(checks)))
print("all %d checks passed" % len(checks))
