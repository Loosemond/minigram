"""Online rooms for the web minigames: a small WebSocket server, standard
library only. tools/serve_web.py serves it at /ws, next to the pages.

Up to four people share a room, found by a four-letter code. Whoever has been
in the room longest is its host: they pick the minigame and the level and
start the rounds. A round is the same for everyone: the server deals it (Egg
Emergency's drops, Clear Cut Challenge's logs) and a start time on its own
clock (the clients sync to it with ping/pong). Each device plays its own
player, and the host's device also plays the CPUs; they send what their players
do (Egg Emergency: the leans; Clear Cut Challenge: the cuts; Eager Eevee: the
dashes and feints; Streaming Stampede: the counts; Pichu's Power Plant: the
presses; Tumbling Togepi: the stick; Gutsy Golbat, Barrier Ball, Rampage Rollout,
Topsy-Turvy, Furret's Frolic and Delibird's Delivery: the pad), which the server
passes on to the others. The server keeps the score itself from those
(tools/egg_rules.py, tools/clearcut_rules.py, tools/eevee_rules.py,
tools/stampede_rules.py, tools/pichu_rules.py, tools/togepi_rules.py,
tools/golbat_rules.py, tools/barrier_rules.py, tools/rollout_rules.py,
tools/topsy_rules.py, tools/furret_rules.py, tools/delibird_rules.py), so a
device can't claim points its player didn't make,
and announces the ranking at the end. A dropped
connection keeps its seat for a few seconds, so a reload or a network blip
rejoins the same seat (and the same round, with its score).

Set TELEGRAM_BOT_TOKEN to check Telegram logins (then no one can pose as a
Telegram player), and TYPESAFE_API_KEY to check names before others see them.

Messages are JSON objects with their type in "t"; web/README.md lists them.
"""
import base64
import concurrent.futures
import hashlib
import hmac
import json
import math
import os
import queue
import random
import socket
import struct
import threading
import time
import urllib.parse
import urllib.request

import barrier_rules
import clearcut_rules
import delibird_rules
import eevee_rules
import egg_rules
import golbat_rules
import pichu_rules
import rollout_rules
import topsy_rules
import furret_rules
import stampede_rules
import togepi_rules

SEATS = egg_rules.SEATS
GAMES = ("egg", "clearcut", "eevee", "stampede", "pichu", "togepi", "golbat", "barrier", "rollout", "topsy", "furret",
         "delibird")  # the minigames, as web/minigames/src/games.js names them
LETTERS = "BCDFGHJKLMNPQRSTVWXZ"  # no vowels, so no code spells a word
LEVELS = ("easy", "normal", "hard")
GRACE = 8  # s a dropped connection keeps its seat
LEAD = 800  # ms from "start" to the countdown, so it reaches everyone before
# The countdown, as the games' shared module (#64) runs it: GO four steps in
# (0x87F006BC), 20 frames each at 30 a second, or the game's own (0x87F00020);
# the shell (web/minigames/src/main.js, games.js) has the same
FPS = 30
COUNT_STEP = 20
COUNT_STEPS = dict(golbat=25, stampede=25)
GO_DELAY = 4 * COUNT_STEP * 1000 / FPS  # ms of countdown before GO (2.67 s), and longer for those
SETTLE_LAG = 3  # s after a drop reaches the hands, it's judged even if its device hasn't reported it
SLACK = 2  # s a device's clock may be off from the server's
END_WAIT = 5  # s after the last drop: the round ends even if a device hasn't finished (one in the background)
# Eager Eevee, Streaming Stampede and Pichu's Power Plant: how old a press may
# be when it gets here (its device's way here, from its round trip, and a
# little over), and so how long a race waits for the presses that could still
# win it before it gives the prize (an answer for the counts still on their
# way, the finish for the presses that could make someone full sooner)
ALLOW_MIN, ALLOW_MAX, ALLOW_GUESS = 0.2, 0.5, 0.3
ROUND_MAX = 300  # s: no round lasts longer (they take about two minutes)
IDLE = 45  # s without a message: the connection is dead (clients ping every 8 s)
MAX_MESSAGE = 8192
RATE, BURST = 60, 400  # messages a second a connection may send, and in one go
CHANGE_GAP = 0.5  # s between renames, or level or game changes
MAX_ROOMS = 500
AUTH_MAX_AGE = 86400  # s a Telegram login stays good
BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
TYPESAFE_KEY = os.environ.get("TYPESAFE_API_KEY", "")
NAME_OK = 0.5  # the name check's probability that a name is fine, at least
GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"  # RFC 6455

lock = threading.RLock()  # guards rooms and everything in them
rooms = {}


def clock():
    """The server's clock in ms, the one the clients sync to."""
    return time.monotonic() * 1000


def describe():
    return "Telegram logins %s, names %s" % (
        "checked" if BOT_TOKEN else "not checked (no TELEGRAM_BOT_TOKEN)",
        "checked with TypeSafe" if TYPESAFE_KEY else "not checked (no TYPESAFE_API_KEY)")


class WebSocket:
    """The server end of a WebSocket on an http.server connection (text messages)."""

    def __init__(self, handler):
        self.sock = handler.connection
        self.rfile = handler.rfile
        self.out = queue.Queue()  # a writer thread sends, so a slow client can't hold the lock
        self.writer = threading.Thread(target=self._write, args=(handler.wfile,), daemon=True)
        self.writer.start()

    def _read(self, n):
        b = self.rfile.read(n)
        if len(b) < n:
            raise EOFError
        return b

    def recv(self):
        """The next text message, or None once the other end closes."""
        parts, size = [], 0
        while True:
            b0, b1 = self._read(2)
            op, n = b0 & 0x0F, b1 & 0x7F
            if n == 126:
                n = struct.unpack(">H", self._read(2))[0]
            elif n == 127:
                n = struct.unpack(">Q", self._read(8))[0]
            size += n
            if size > MAX_MESSAGE:
                raise ValueError("message too long")
            mask = self._read(4) if b1 & 0x80 else b""
            data = self._read(n)
            if mask:
                k = (mask * (n // 4 + 1))[:n]
                data = (int.from_bytes(data, "big") ^ int.from_bytes(k, "big")).to_bytes(n, "big")
            if op == 8:  # close
                return None
            if op == 9:  # ping
                self.out.put((10, data))
            elif op in (0, 1, 2):  # continuation, text, binary
                parts.append(data)
                if b0 & 0x80:
                    return b"".join(parts).decode("utf-8", "replace")

    def send(self, text):
        self.out.put((1, text.encode()))

    def close(self):
        self.out.put(None)

    def _write(self, wfile):
        try:
            while True:
                item = self.out.get()
                if item is None:
                    wfile.write(b"\x88\x00")  # close
                    break
                op, data = item
                n = len(data)
                size = bytes([n]) if n < 126 else b"\x7e" + struct.pack(">H", n) if n < 65536 else b"\x7f" + struct.pack(">Q", n)
                wfile.write(bytes([0x80 | op]) + size + data)
        except OSError:
            pass
        try:
            self.sock.shutdown(socket.SHUT_RDWR)  # ends the reader too
        except OSError:
            pass


class Member:
    def __init__(self, cid, name, seat, ws, verified):
        self.id, self.name, self.seat, self.ws = cid, name, seat, ws
        self.verified = verified  # a checked Telegram login: its name is the Telegram one
        self.since = time.monotonic()
        self.away = None  # when the connection dropped
        self.done = False  # finished the round
        self.changed = 0  # the last rename or level change
        self.asked = None  # a name waiting for the name check
        self.rtt = None  # ms: its device's round trip to here, as it measures it (for how far behind the others show it)

    def send(self, msg):
        if self.ws:
            self.ws.send(json.dumps(msg, separators=(",", ":")))


class Room:
    def __init__(self, code):
        self.code = code
        self.members = {}  # seat -> Member
        self.state = "lobby"  # or "playing"
        self.round = 0
        self.level = "normal"
        self.minigame = "egg"
        self.seed = self.at = self.go = 0
        self.lineup = {}  # seat -> {id, name}: who plays this round; the other seats are CPUs
        self.game = None  # the round's rules and scores (egg_rules.Round, clearcut_rules.Round, ... pichu_rules.Round)
        self.started = None
        self.timer = None  # Eager Eevee: the next prize's giving; Streaming Stampede: the next answer's; Pichu: the finish's

    def broadcast(self, msg, skip=None):
        for m in self.members.values():
            if m is not skip:
                m.send(msg)

    def now(self):
        """The round's time in s (from GO)."""
        return (clock() - self.go) / 1000

    def playing(self, seat):
        """The seat is played by the person it was dealt to this round (not a CPU)."""
        p, m = self.lineup.get(seat), self.members.get(seat)
        return bool(p and m and m.id == p["id"])

    def host(self):
        ms = list(self.members.values())
        if self.state == "playing":  # the host plays the CPUs, so it has to be in the round
            ms = [m for m in ms if self.playing(m.seat)] or ms
        return min(ms, key=lambda m: m.since).seat if ms else None

    def player(self, seat):
        """Whose device plays the seat now: its person's, or the host's for a CPU."""
        return self.members.get(seat if self.playing(seat) else self.host())

    def rtt(self, seat):
        """The round trip (ms) of the device that plays the seat now, if it's said."""
        m = self.player(seat)
        return round(m.rtt) if m and m.rtt is not None else None

    def allow(self, seat=None):
        """Eager Eevee: how old (s) a press from the seat's device may be, or
        (no seat) the most for anyone's in the round."""
        def one(m):
            return ALLOW_GUESS if m is None or m.rtt is None else min(ALLOW_MAX, max(ALLOW_MIN, m.rtt / 2000 + 0.1))
        if seat is not None:
            return one(self.player(seat))
        return max([one(self.members.get(s)) for s in self.lineup] + [one(self.player(self.host() or 0))])

    def lineup_info(self):
        return [dict(seat=s, name=p["name"], here=self.playing(s)) for s, p in sorted(self.lineup.items())]

    def snapshot(self):
        return dict(t="room", room=self.code, state=self.state, round=self.round, level=self.level, game=self.minigame,
                    host=self.host(),
                    players=[dict(seat=s, name=m.name, away=m.away is not None) for s, m in sorted(self.members.items())],
                    lineup=self.lineup_info() if self.state == "playing" else None)

    def start_msg(self):
        """The round, as a device needs it to play (also to rejoin it midway)."""
        g = self.game
        msg = dict(t="start", game=self.minigame, round=self.round, seed=self.seed, level=self.level, at=self.at,
                   go=self.go, host=self.host(), lineup=self.lineup_info(), rtt=[self.rtt(s) for s in range(SEATS)])
        if self.minigame in ("clearcut", "eevee", "stampede", "pichu", "togepi", "golbat", "barrier", "rollout", "topsy",
                             "furret", "delibird"):
            msg.update(g.wire())
        else:
            msg.update(drops=g.wire(), scores=g.scores, leans=[g.last_lean(s) for s in range(SEATS)], settled=g.next,
                       hits=[h if h > -math.inf else None for h in g.hit])
        return msg


def _number(v):
    return v if isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v) else 0


def _name(v):
    return " ".join(str(v or "").split())[:16]


def _error(ws, code):
    ws.send(json.dumps(dict(t="error", code=code)))


# ------------------------------------------------------------ who's who

def telegram_user(init_data):
    """The Telegram user in a Mini App's initData, if Telegram signed it for this
    bot (TELEGRAM_BOT_TOKEN) not too long ago; else None.
    https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app"""
    if not BOT_TOKEN or not isinstance(init_data, str) or not init_data or len(init_data) > 4096:
        return None
    fields = dict(urllib.parse.parse_qsl(init_data, keep_blank_values=True))
    got = fields.pop("hash", "")
    secret = hmac.new(b"WebAppData", BOT_TOKEN.encode(), hashlib.sha256).digest()

    def sign(f):
        return hmac.new(secret, "\n".join("%s=%s" % kv for kv in sorted(f.items())).encode(), hashlib.sha256).hexdigest()

    # the newer "signature" field is in the signed data on some clients, left out on others
    without = {k: v for k, v in fields.items() if k != "signature"}
    if not (hmac.compare_digest(sign(fields), got) or hmac.compare_digest(sign(without), got)):
        return None
    try:
        user = json.loads(fields.get("user", ""))
        age = time.time() - int(fields.get("auth_date", "0"))
    except ValueError:
        return None
    if not isinstance(user, dict) or not isinstance(user.get("id"), int) or not -60 < age < AUTH_MAX_AGE:
        return None
    return user


checker = concurrent.futures.ThreadPoolExecutor(4) if TYPESAFE_KEY else None
name_checks = {}  # casefolded name -> fine or not


def name_check(name):
    """Jev's (TypeSafe's) probability that a name is fine to show to others."""
    body = dict(model="jev-latest", state=dict(name=name), questions=dict(fine=dict(
        type="noul",
        instructions="Is `name` fine to show to other players as a player name in a family-friendly game?",
        criteria={"true": "An ordinary first name, nickname, or harmless word or phrase, in any language",
                  "false": "Rude, sexual, hateful or harassing, or a slur, including disguised with misspellings, "
                           "spacing or symbols"})))
    req = urllib.request.Request("https://api.typesafe.ai/v1/systemone", data=json.dumps(body).encode(), method="POST",
                                 headers={"Authorization": "Bearer " + TYPESAFE_KEY, "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=6) as r:
        return float(json.load(r)["answers"]["fine"]["noul"])


def ask_typesafe(name):
    """Is the name fine to show: (fine, sure). If Jev can't be asked, the name
    goes through, unsure (so it's asked again next time)."""
    try:
        return name_check(name) >= NAME_OK, True
    except (OSError, ValueError, KeyError, TypeError) as e:
        print("name check failed (%s): letting it through" % e)
        return True, False


def rename(room, m, name, quiet=False):
    """Give m this name, once the name check says it's fine. With the lock held;
    quiet: the caller sends the room's news itself."""
    name = _name(name)
    if not name or name == m.name:
        return
    fine = True if not checker else name_checks.get(name.casefold())
    if fine is None:
        m.asked = name
        checker.submit(_checked, room, m, name)
    else:
        _named(room, m, name, fine, quiet)


def _checked(room, m, name):
    fine, sure = ask_typesafe(name)
    with lock:
        if sure:
            if len(name_checks) > 10000:
                name_checks.clear()
            name_checks[name.casefold()] = fine
        if room.members.get(m.seat) is m and m.asked == name:
            m.asked = None
            _named(room, m, name, fine)


def _named(room, m, name, fine, quiet=False):
    if not fine:
        m.send(dict(t="notice", code="name", name=name))
        return
    m.name = name
    p = room.lineup.get(m.seat)
    if p and p["id"] == m.id:
        p["name"] = name
    if not quiet:
        room.broadcast(room.snapshot())


# ------------------------------------------------------------ rooms

def join(ws, msg):
    """"hello": join the room msg["room"] (or a new one). Returns (room, member), or None."""
    cid = str(msg.get("id") or "")[:64] or "%016x" % random.getrandbits(64)
    name = msg.get("name")
    user = telegram_user(msg.get("tg"))
    if user:
        cid, name = "tg%d" % user["id"], user.get("first_name")
    elif BOT_TOKEN and cid.startswith("tg"):
        cid = "web-" + cid  # only a signed Telegram login gets a Telegram player's seat
    code = str(msg.get("room") or "").strip().upper()
    with lock:
        if code:
            if not (4 <= len(code) <= 6 and all(c in LETTERS for c in code)):
                return _error(ws, "bad-code")
            room = rooms.get(code)
            if room is None and not msg.get("create"):
                return _error(ws, "no-room")
        else:
            code = "".join(random.choice(LETTERS) for _ in range(4))
            while code in rooms:
                code = "".join(random.choice(LETTERS) for _ in range(4))
            room = None
        if room is None:
            if len(rooms) >= MAX_ROOMS:
                return _error(ws, "busy")
            room = rooms[code] = Room(code)
            if msg.get("game") in GAMES:  # the one on the title of whoever makes the room
                room.minigame = msg["game"]
        m = next((m for m in room.members.values() if m.id == cid), None)
        if m:  # the same player again (a reload, a new connection): same seat
            if m.ws and m.ws is not ws:
                m.ws.close()
            m.ws, m.away = ws, None
        else:
            free = [s for s in range(SEATS) if s not in room.members]
            if not free:
                if not room.members:
                    rooms.pop(room.code, None)
                return _error(ws, "full")
            m = room.members[free[0]] = Member(cid, "Player %d" % (free[0] + 1), free[0], ws, bool(user))
        rename(room, m, name, quiet=True)
        m.send(dict(t="welcome", room=room.code, seat=m.seat, now=clock()))
        if room.state == "playing" and room.playing(m.seat):
            m.send(room.start_msg())  # carry on with the round
        room.broadcast(room.snapshot())
        return room, m


def go_delay(game):
    """ms from the countdown's start to GO in the minigame."""
    return GO_DELAY * COUNT_STEPS.get(game, COUNT_STEP) / COUNT_STEP


def start(room):
    room.round += 1
    room.state = "playing"
    room.seed = random.getrandbits(31)
    room.at = clock() + LEAD
    room.go = room.at + go_delay(room.minigame)
    room.lineup = {s: dict(id=m.id, name=m.name) for s, m in room.members.items() if m.away is None}
    if room.minigame == "clearcut":
        room.game = clearcut_rules.Round(room.seed, room.level, cpus=len(room.lineup) < SEATS)
    elif room.minigame == "eevee":
        room.game = eevee_rules.Round(room.seed, room.level, cpus=len(room.lineup) < SEATS)
    elif room.minigame == "stampede":
        room.game = stampede_rules.Round(room.seed, room.level, cpus=[s not in room.lineup for s in range(SEATS)])
    elif room.minigame == "pichu":
        room.game = pichu_rules.Round(room.seed, room.level, cpus=[s not in room.lineup for s in range(SEATS)],
                                      after=room.game)  # (its last round: a "play again" if it was one of these)
    elif room.minigame == "togepi":
        room.game = togepi_rules.Round(room.seed, room.level, cpus=[s not in room.lineup for s in range(SEATS)])
    elif room.minigame == "golbat":
        room.game = golbat_rules.Round(room.seed, room.level, cpus=[s not in room.lineup for s in range(SEATS)])
    elif room.minigame == "barrier":
        room.game = barrier_rules.Round(room.seed, room.level, cpus=[s not in room.lineup for s in range(SEATS)])
    elif room.minigame == "rollout":
        room.game = rollout_rules.Round(room.seed, room.level, cpus=[s not in room.lineup for s in range(SEATS)])
    elif room.minigame == "topsy":
        room.game = topsy_rules.Round(room.seed, room.level, cpus=[s not in room.lineup for s in range(SEATS)])
    elif room.minigame == "furret":
        room.game = furret_rules.Round(room.seed, room.level, cpus=[s not in room.lineup for s in range(SEATS)])
    elif room.minigame == "delibird":
        room.game = delibird_rules.Round(room.seed, room.level, cpus=[s not in room.lineup for s in range(SEATS)])
    else:
        room.game = egg_rules.Round(room.seed)
    room.started = time.monotonic()
    for m in room.members.values():
        m.done = False
    room.broadcast(room.start_msg())
    room.broadcast(room.snapshot())


def judge(room, s, upto, claim=None):
    """Judge seat s's drops that reached the hands by round time upto, and pass
    on the catches and shocks. claim: (member, n, k, e), what a device reported
    for its drop n; it only hears back what's different."""
    g = room.game
    judged = set()
    for n, k, e, a in g.settle(s, upto):
        judged.add(n)
        same = claim is not None and claim[1:] == (n, k, e)
        room.broadcast(dict(t="ev", r=room.round, s=s, n=n, k=k, e=e, g=a), skip=claim[0] if same else None)
    if claim:
        m, n, k, e = claim
        res = g.results[s].get(n)
        if g.settled(s, n) and (res is None or res[0] != k or n not in judged and res[1] != e):
            # not what it counted: its player didn't catch that (or the count's off)
            m.send(dict(t="ev", r=room.round, s=s, n=n, k=res[0] if res else "m", e=g.scores[s], g=g.arrive[s][n]))


def relay(room, m, t, msg):
    """A lean, a result or a cut for seat s, from the device that plays it."""
    s = msg.get("s")
    if room.state != "playing" or msg.get("r") != room.round or type(s) is not int or not 0 <= s < SEATS \
            or not room.playing(m.seat):
        return
    if room.playing(s) and s != m.seat:
        return  # someone else's player
    if not room.playing(s) and m.seat != room.host():
        return  # the CPUs are the host's
    g = room.game
    if room.minigame == "clearcut":
        n, f = msg.get("n"), msg.get("f")
        if t == "cut" and type(n) is int and type(f) is int:
            tell_cuts(room, s, g.cut(s, n, f, room.now()) or [])
        return
    if room.minigame == "eevee":
        k = msg.get("k")
        if t != "dash":
            return
        f = g.press(s, k, msg.get("f"), room.now(), room.allow(s))
        if f is not None:  # to the others (and back to its device if it counts on a later frame)
            room.broadcast(dict(t="dash", r=room.round, s=s, k=k, f=f), skip=m if f == msg.get("f") else None)
            prizes(room)
        return
    if room.minigame == "stampede":
        if t == "count" and room.playing(s):
            n, f = msg.get("n"), msg.get("f")
            if g.press(s, n, f, room.now(), room.allow(s)):  # to the others
                room.broadcast(dict(t="count", r=room.round, s=s, n=n, f=f), skip=m)
            answers(room)
        return
    if room.minigame == "pichu":
        if t == "press" and room.playing(s):
            f, d, b = msg.get("f"), msg.get("d"), msg.get("b")
            got = g.press(s, f, d, b, room.now(), room.allow(s))
            if got:  # to the others, and back to its device if it counts on another frame
                room.broadcast(dict(t="press", r=room.round, s=s, f=got[0], d=d, b=b), skip=m)
                if got[0] != f:
                    m.send(dict(t="press", r=room.round, s=s, f=got[0], o=f, d=d, b=b))
            elif type(f) is int:  # its device counted it: it doesn't
                m.send(dict(t="press", r=room.round, s=s, f=f, o=f, d=d if d in (1, 2, 3, 4) else 0,
                            b=b if b in (pichu_rules.A, pichu_rules.B) else pichu_rules.A, x=1))
            finishes(room)
        return
    if room.minigame == "togepi":
        if t == "stick" and room.playing(s):
            f, x, y = msg.get("f"), msg.get("x"), msg.get("y")
            got = g.stick(s, f, x, y, room.now(), room.allow(s))
            if got is not None:  # to the others, and back to its device if it counts from another frame
                room.broadcast(dict(t="stick", r=room.round, s=s, f=got, x=x, y=y), skip=m)
                if got != f:
                    m.send(dict(t="stick", r=room.round, s=s, f=got, o=f, x=x, y=y))
            finishes(room)
        return
    if room.minigame in ("golbat", "barrier", "rollout", "topsy", "furret", "delibird"):
        if t == "pad" and room.playing(s):
            f, x, a = msg.get("f"), msg.get("x"), msg.get("a")
            got = g.pad(s, f, x, a, room.now(), room.allow(s))
            if got is not None:  # to the others, and back to its device if it counts on another frame
                room.broadcast(dict(t="pad", r=room.round, s=s, f=got, x=x, a=a), skip=m)
                if got != f:
                    m.send(dict(t="pad", r=room.round, s=s, f=got, o=f, x=x, a=a))
            finishes(room)
        return
    if t in ("cut", "dash", "count", "press", "stick", "pad"):
        return
    if t == "lean":
        l = max(-1, min(1, int(_number(msg.get("l")))))
        at = g.lean(s, float(_number(msg.get("g"))), l)
        room.broadcast(dict(t="lean", r=room.round, s=s, g=at, l=l), skip=m)
    else:  # "ev": its device says drop n was caught or a shock; the server judges it now
        n = msg.get("n")
        if type(n) is not int or not 0 <= n < len(g.drops[s]) or g.arrive[s][n] > room.now() + SLACK:
            return
        judge(room, s, g.arrive[s][n], (m, n, msg.get("k"), msg.get("e")))


def tell_cuts(room, s, results):
    """Clear Cut Challenge: what seat s's cuts (or misses) came to, to everyone."""
    for n, f, p, e, a in results:
        msg = dict(t="cut", r=room.round, s=s, n=n, f=f, p=p, e=e)
        if a:
            msg["a"] = 1  # a miss it may swing again after: it doesn't count yet
        room.broadcast(msg)


def prizes(room, now=None):
    """Eager Eevee: give the prizes that are decided (no press still on its way
    could change them), and set a timer for the next."""
    g = room.game
    if room.state != "playing" or not isinstance(g, eevee_rules.Round):
        return
    allow = room.allow()
    for n, pts, totals, decided in g.settle(room.now() if now is None else now, allow):
        room.broadcast(dict(t="got", r=room.round, n=n, p=pts, e=totals, d=decided))
    if room.timer:
        room.timer.cancel()
        room.timer = None
    at = g.next_settle(allow)
    if at is not None and now is None:
        rnd = room.round

        def fire():
            with lock:
                if room.round == rnd and room.game is g:
                    prizes(room)
        room.timer = threading.Timer(max(0.0, at - room.now()) + 0.01, fire)
        room.timer.daemon = True
        room.timer.start()


def answers(room, now=None):
    """Streaming Stampede: give the answers that are due (no count still on
    its way could change them), and set a timer for the next."""
    g = room.game
    if room.state != "playing" or not isinstance(g, stampede_rules.Round):
        return
    allow = room.allow()
    for n, counts, pts, totals in g.settle(room.now() if now is None else now, allow):
        room.broadcast(dict(t="ans", r=room.round, n=n, c=counts, p=pts, e=totals))
    if room.timer:
        room.timer.cancel()
        room.timer = None
    at = g.next_settle(allow)
    if at is not None and now is None:
        rnd = room.round

        def fire():
            with lock:
                if room.round == rnd and room.game is g:
                    answers(room)
        room.timer = threading.Timer(max(0.0, at - room.now()) + 0.01, fire)
        room.timer.daemon = True
        room.timer.start()


def finishes(room, now=None):
    """Pichu's Power Plant: say who finished first once it's decided (no
    press still on its way could make someone full sooner); Tumbling Togepi:
    how the race ended (no stick change on its way could alter it); Gutsy
    Golbat, Barrier Ball, Rampage Rollout, Topsy-Turvy, Furret's Frolic and
    Delibird's Delivery: run the world on as far as the pads in allow, and its
    hearts, points or places at the end. And set a timer for when it can be."""
    g = room.game
    if room.state != "playing" or not isinstance(g, (pichu_rules.Round, togepi_rules.Round, golbat_rules.Round, barrier_rules.Round,
                                                        rollout_rules.Round, topsy_rules.Round, furret_rules.Round,
                                                        delibird_rules.Round)):
        return
    allow = room.allow()
    if g.settle(room.now() if now is None else now, allow):
        room.broadcast(dict(t="won", r=room.round, **g.result()))
    if room.timer:
        room.timer.cancel()
        room.timer = None
    at = g.next_settle(allow)
    if at is not None and now is None:
        rnd = room.round

        def fire():
            with lock:
                if room.round == rnd and room.game is g:
                    finishes(room)
        room.timer = threading.Timer(max(0.0, at - room.now()) + 0.01, fire)
        room.timer.daemon = True
        room.timer.start()


def settle(room, s, upto):
    """Judge seat s's round up to round time upto: what hasn't been reported is missed."""
    if room.minigame == "clearcut":
        tell_cuts(room, s, room.game.settle(s, upto))
    elif room.minigame == "eevee":
        prizes(room, 1e9 if upto == math.inf else None)
    elif room.minigame == "stampede":
        answers(room, 1e9 if upto == math.inf else None)
    elif room.minigame in ("pichu", "togepi", "golbat", "barrier", "rollout", "topsy", "furret", "delibird"):
        finishes(room, 1e9 if upto == math.inf else None)
    else:
        judge(room, s, upto)


def check_end(room):
    """End the round once everyone in it has finished (or left), or it's long over."""
    if room.state != "playing":
        return
    g, now = room.game, room.now()
    players = [m for m in room.members.values() if room.playing(m.seat)]
    finished = all(m.done for m in players) and now >= g.end - SLACK  # a "done" before the end doesn't count yet
    if players and not finished and now < g.end + END_WAIT and time.monotonic() - room.started < ROUND_MAX:
        return
    for s in range(SEATS):
        settle(room, s, math.inf)
    results = dict(t="results", round=room.round, scores=g.scores, lineup=room.lineup_info())
    room.state, room.lineup = "lobby", {}
    room.broadcast(results)
    room.broadcast(room.snapshot())


def remove(room, m):
    if room.members.get(m.seat) is not m:
        return
    del room.members[m.seat]
    if m.ws:
        m.ws.close()
        m.ws = None
    if not room.members:
        rooms.pop(room.code, None)
        return
    room.broadcast(dict(t="left", seat=m.seat))
    room.broadcast(room.snapshot())
    check_end(room)


def handle(room, m, msg):
    """One message from a member. False: the connection should close."""
    t = msg.get("t")
    if t == "ping":
        rtt = msg.get("rtt")
        if type(rtt) in (int, float) and 0 <= rtt < 10000:
            m.rtt = rtt
        m.send(dict(t="pong", c=msg.get("c"), s=clock()))
    elif t in ("lean", "ev", "cut", "dash", "count", "press", "stick", "pad"):
        relay(room, m, t, msg)
    elif t == "done":
        if room.state == "playing" and msg.get("r") == room.round and room.playing(m.seat):
            m.done = True
            check_end(room)
    elif t in ("name", "level", "game"):
        if time.monotonic() - m.changed < CHANGE_GAP:
            return True
        m.changed = time.monotonic()
        if t == "name" and not m.verified:
            rename(room, m, msg.get("name"))
        elif t == "level" and room.state == "lobby" and m.seat == room.host() and msg.get("level") in LEVELS:
            room.level = msg["level"]
            room.broadcast(room.snapshot())
        elif t == "game" and room.state == "lobby" and m.seat == room.host() and msg.get("game") in GAMES:
            room.minigame = msg["game"]
            room.broadcast(room.snapshot())
    elif t == "start":
        if room.state == "lobby" and m.seat == room.host():
            start(room)
    elif t == "leave":
        remove(room, m)
        return False
    return True


def _reap():
    while True:
        time.sleep(1)
        now = time.monotonic()
        with lock:
            for room in list(rooms.values()):
                for m in list(room.members.values()):
                    if m.away is not None and now - m.away > GRACE:
                        remove(room, m)
                if room.state == "playing":
                    # what no one reported: missed (Egg Emergency: unless the leans say otherwise)
                    for s in range(SEATS):
                        p = room.player(s)
                        if p and p.ws:  # (not while its device is reconnecting)
                            settle(room, s, room.now() - SETTLE_LAG)
                    check_end(room)


_reaper = None


def serve(handler):
    """Take over an http.server request that asks for a WebSocket (the /ws path)."""
    global _reaper
    key = handler.headers.get("Sec-WebSocket-Key")
    if not key or "websocket" not in handler.headers.get("Upgrade", "").lower():
        handler.send_error(400, "WebSocket only")
        return
    handler.send_response(101, "Switching Protocols")
    handler.send_header("Upgrade", "websocket")
    handler.send_header("Connection", "Upgrade")
    handler.send_header("Sec-WebSocket-Accept", base64.b64encode(hashlib.sha1((key + GUID).encode()).digest()).decode())
    handler.end_headers()
    handler.close_connection = True
    with lock:
        if _reaper is None:
            _reaper = threading.Thread(target=_reap, daemon=True)
            _reaper.start()
    handler.connection.settimeout(IDLE)
    ws = WebSocket(handler)
    room = m = None
    tokens, last = BURST, time.monotonic()
    try:
        while True:
            text = ws.recv()
            if text is None:
                break
            now = time.monotonic()
            tokens = min(BURST, tokens + (now - last) * RATE) - 1
            last = now
            if tokens < 0:  # too many: ignored, and a flood closes the connection
                if tokens < -BURST:
                    break
                continue
            try:
                msg = json.loads(text)
            except ValueError:
                continue
            if not isinstance(msg, dict):
                continue
            if m is None:
                if msg.get("t") == "hello":
                    joined = join(ws, msg)
                    if not joined:
                        break
                    room, m = joined
                continue
            with lock:
                if m.ws is not ws or room.members.get(m.seat) is not m:
                    break  # a newer connection took the seat over
                if not handle(room, m, msg):
                    break
    except (OSError, EOFError, ValueError):
        pass
    finally:
        with lock:
            if m is not None and m.ws is ws:  # dropped: keep the seat for a while
                m.ws, m.away = None, time.monotonic()
                room.broadcast(room.snapshot())
        ws.close()
        ws.writer.join(2)  # let the last messages (an error, the close) go out first
