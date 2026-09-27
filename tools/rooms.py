"""Online rooms for the web minigames: a small WebSocket relay, standard
library only. tools/serve_web.py serves it at /ws, next to the pages.

Up to four people share a room, found by a four-letter code. Whoever has been
in the room longest is its host: they pick the level and start the rounds. A
round is the same for everyone: the server deals one seed and a start time on
its own clock (the clients sync to it with ping/pong). Then each device plays
its own player and decides its own catches, and sends its leans and results,
which the server passes on to the others. The host's device also plays the
CPUs. The server keeps each seat's egg count from those results and announces
the ranking once every player has finished. A dropped connection keeps its
seat for a few seconds, so a reload or a network blip rejoins the same seat
(and the same round, with its eggs).

Messages are JSON objects with their type in "t"; web/README.md lists them.
"""
import base64
import hashlib
import json
import math
import queue
import random
import socket
import struct
import threading
import time

SEATS = 4
LETTERS = "BCDFGHJKLMNPQRSTVWXZ"  # no vowels, so no code spells a word
LEVELS = ("easy", "normal", "hard")
EGGS = 100
GRACE = 8  # s a dropped connection keeps its seat
FINISH_WAIT = 10  # s to wait for the rest after the first player finishes (a device in the background)
ROUND_MAX = 300  # s: no round lasts longer (they take about two minutes)
IDLE = 45  # s without a message: the connection is dead (clients ping every 8 s)
LEAD = 800  # ms from "start" to the countdown, so it reaches everyone before
MAX_MESSAGE = 4096
GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"  # RFC 6455

lock = threading.RLock()  # guards rooms and everything in them
rooms = {}


def clock():
    """The server's clock in ms, the one the clients sync to."""
    return time.monotonic() * 1000


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
    def __init__(self, cid, name, seat, ws):
        self.id, self.name, self.seat, self.ws = cid, name, seat, ws
        self.since = time.monotonic()
        self.away = None  # when the connection dropped
        self.done = False  # finished the round

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
        self.seed = self.at = 0
        self.lineup = {}  # seat -> {id, name}: who plays this round; the other seats are CPUs
        self.scores = [0] * SEATS
        self.started = self.first_done = None

    def broadcast(self, msg, skip=None):
        for m in self.members.values():
            if m is not skip:
                m.send(msg)

    def playing(self, seat):
        """The seat is played by the person it was dealt to this round (not a CPU)."""
        p, m = self.lineup.get(seat), self.members.get(seat)
        return bool(p and m and m.id == p["id"])

    def host(self):
        ms = list(self.members.values())
        if self.state == "playing":  # the host plays the CPUs, so it has to be in the round
            ms = [m for m in ms if self.playing(m.seat)] or ms
        return min(ms, key=lambda m: m.since).seat if ms else None

    def lineup_info(self):
        return [dict(seat=s, name=p["name"], here=self.playing(s)) for s, p in sorted(self.lineup.items())]

    def snapshot(self):
        return dict(t="room", room=self.code, state=self.state, round=self.round, level=self.level, host=self.host(),
                    players=[dict(seat=s, name=m.name, away=m.away is not None) for s, m in sorted(self.members.items())],
                    lineup=self.lineup_info() if self.state == "playing" else None)

    def start_msg(self):
        return dict(t="start", round=self.round, seed=self.seed, level=self.level, at=self.at, host=self.host(),
                    lineup=self.lineup_info(), scores=self.scores)


def _number(v):
    return v if isinstance(v, (int, float)) and math.isfinite(v) else 0


def _name(v):
    return " ".join(str(v or "").split())[:16]


def _error(ws, code):
    ws.send(json.dumps(dict(t="error", code=code)))


def join(ws, msg):
    """"hello": join the room msg["room"] (or a new one). Returns (room, member), or None."""
    cid = str(msg.get("id") or "")[:64] or "%016x" % random.getrandbits(64)
    name = _name(msg.get("name"))
    code = str(msg.get("room") or "").strip().upper()
    with lock:
        if code:
            if not (4 <= len(code) <= 6 and all(c in LETTERS for c in code)):
                return _error(ws, "bad-code")
            room = rooms.get(code)
            if room is None:
                if not msg.get("create"):
                    return _error(ws, "no-room")
                room = rooms[code] = Room(code)
        else:
            code = "".join(random.choice(LETTERS) for _ in range(4))
            while code in rooms:
                code = "".join(random.choice(LETTERS) for _ in range(4))
            room = rooms[code] = Room(code)
        m = next((m for m in room.members.values() if m.id == cid), None)
        if m:  # the same player again (a reload, a new connection): same seat
            if m.ws and m.ws is not ws:
                m.ws.close()
            m.ws, m.away = ws, None
            m.name = name or m.name
        else:
            free = [s for s in range(SEATS) if s not in room.members]
            if not free:
                if not room.members:
                    rooms.pop(room.code, None)
                return _error(ws, "full")
            m = room.members[free[0]] = Member(cid, name or "Player %d" % (free[0] + 1), free[0], ws)
        m.send(dict(t="welcome", room=room.code, seat=m.seat, now=clock()))
        if room.state == "playing" and room.playing(m.seat):
            m.send(room.start_msg())  # carry on with the round
        room.broadcast(room.snapshot())
        return room, m


def start(room):
    room.round += 1
    room.state = "playing"
    room.seed = random.getrandbits(31)
    room.at = clock() + LEAD
    room.lineup = {s: dict(id=m.id, name=m.name) for s, m in room.members.items() if m.away is None}
    room.scores = [0] * SEATS
    room.started, room.first_done = time.monotonic(), None
    for m in room.members.values():
        m.done = False
    room.broadcast(room.start_msg())
    room.broadcast(room.snapshot())


def relay(room, m, t, msg):
    """A lean or a result for seat s, from the device that plays it: pass it on."""
    s = msg.get("s")
    if room.state != "playing" or not isinstance(s, int) or not 0 <= s < SEATS or not room.playing(m.seat):
        return
    if room.playing(s) and s != m.seat:
        return  # someone else's player
    if not room.playing(s) and m.seat != room.host():
        return  # the CPUs are the host's
    out = dict(t=t, r=room.round, s=s, g=_number(msg.get("g")))
    if t == "lean":
        out["l"] = max(-1, min(1, int(_number(msg.get("l")))))
    else:
        e = max(0, min(EGGS, int(_number(msg.get("e")))))
        out.update(n=int(_number(msg.get("n"))), k="h" if msg.get("k") == "h" else "c", e=e)
        room.scores[s] = e
    room.broadcast(out, skip=m)


def check_end(room, force=False):
    """End the round once everyone in it has finished (or left)."""
    if room.state != "playing":
        return
    if not force and any(room.playing(m.seat) and not m.done for m in room.members.values()):
        return
    results = dict(t="results", round=room.round, scores=room.scores, lineup=room.lineup_info())
    room.state, room.lineup, room.first_done = "lobby", {}, None
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
        m.send(dict(t="pong", c=msg.get("c"), s=clock()))
    elif t in ("lean", "ev"):
        relay(room, m, t, msg)
    elif t == "done":
        if room.state == "playing" and room.playing(m.seat):
            m.done = True
            room.first_done = room.first_done or time.monotonic()
            check_end(room)
    elif t == "name":
        m.name = _name(msg.get("name")) or m.name
        room.broadcast(room.snapshot())
    elif t == "level":
        if room.state == "lobby" and m.seat == room.host() and msg.get("level") in LEVELS:
            room.level = msg["level"]
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
                if room.state == "playing" and (room.first_done and now - room.first_done > FINISH_WAIT
                                                or now - room.started > ROUND_MAX):
                    check_end(room, force=True)


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
    try:
        while True:
            text = ws.recv()
            if text is None:
                break
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
