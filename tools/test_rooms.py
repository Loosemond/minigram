"""Tests for the rooms server (tools/rooms.py) and its rules (tools/egg_rules.py,
tools/clearcut_rules.py).

    python3 tools/test_rooms.py

Runs a server in this process on a free port, with short rounds, and plays it
with scripted clients: the protocol, the score kept from the leans and the cuts
(and the cheats that stops), picking the game, rejoining a round, Telegram
logins, name checks, limits. Standard library only; takes about half a minute.
"""
import base64
import concurrent.futures
import hashlib
import hmac
import http.server
import json
import os
import socket
import struct
import sys
import threading
import time
import urllib.parse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import clearcut_rules  # noqa: E402
import egg_rules  # noqa: E402
import rooms  # noqa: E402

# makeSchedules() in web/minigames/src/egg/game.js, run in a browser: the
# first 16 hex digits of the SHA-256 of every drop (the bits of t and fall)
JS_SCHEDULES = {1: "ba64e35664b2591f", 12345: "36b3b248013c25c9", 2 ** 31 - 1: "9812a4cb6c5a99c7"}
# deal() in web/minigames/src/clearcut/rules.js, for every level code: each log's
# target, wait and the bits of its line (web/minigames/tests.js has the same)
JS_DEALS = {1: "845261658a294406", 12345: "dcaad7cc4c79a603", 2 ** 31 - 1: "8c853818348d493e"}

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


checks = []


def check(name):
    def run(fn):
        fn()
        checks.append(name)
        print("ok  ", name)
    return run


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


@check("a round: the server keeps the score from the leans, and stops cheats")
def _():
    A.drain()
    B.drain()
    time.sleep(rooms.CHANGE_GAP)
    A.send("start")
    sa, sb = A.wait("start"), B.wait("start")
    assert sa["seed"] == sb["seed"] and sa["round"] == 1 and sa["go"] > rooms.clock() - 100
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


@check("rejoining mid-round: the round so far comes back")
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


@check("leaving mid-round: the seat becomes a CPU, played by the host")
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


@check("the host moves on when the host leaves; a full room")
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


@check("Clear Cut Challenge: the host picks it; the server judges the cuts and stops cheats")
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


print("all %d checks passed" % len(checks))
