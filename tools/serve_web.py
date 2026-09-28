"""Serve the web minigames: http://localhost:8123/egg-emergency/

    python3 tools/serve_web.py [port] [folder]

Sets the MIME types browsers need for ES modules (on Windows, Python's guess
for .js can come from the registry and be wrong), and makes the browser
revalidate every file, so edits show up on reload (an unchanged file costs a
304 with no body). Scripts, pages, models and the sound file go out gzipped
to browsers that take it, which about quarters what a first visit downloads;
each is compressed once and kept until it changes. The online rooms
(tools/rooms.py) are at ws://localhost:8123/ws, so one server is all
online play needs. The port can also come from $PORT, and
TELEGRAM_BOT_TOKEN and TYPESAFE_API_KEY turn on the rooms' login and name
checks.
"""
import email.utils
import functools
import gzip
import http.server
import io
import os
import sys

import rooms

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
port = int(sys.argv[1]) if len(sys.argv) > 1 else int(os.environ.get("PORT", 8123))
folder = sys.argv[2] if len(sys.argv) > 2 else os.path.join(root, "web")
games = sorted(d for d in os.listdir(folder) if os.path.isfile(os.path.join(folder, d, "index.html")))


class Handler(http.server.SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.1"  # keep-alive: the minigames load dozens of small files
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json",
        ".glb": "model/gltf-binary", ".png": "image/png", ".jpg": "image/jpeg",
        ".css": "text/css", ".html": "text/html", ".svg": "image/svg+xml",
    }

    COMPRESS = {".js", ".mjs", ".json", ".html", ".css", ".svg", ".glb", ".bin", ".txt"}
    gzipped = {}  # path -> (mtime, size, gzipped bytes or None when it doesn't shrink)

    def do_GET(self):
        path, _, query = self.path.partition("?")
        if path == "/ws":
            return rooms.serve(self)
        if path == "/" and len(games) == 1:  # straight to the only minigame, not a file listing
            self.send_response(302)
            self.send_header("Location", "/%s/%s" % (games[0], "?" + query if query else ""))
            self.send_header("Content-Length", "0")
            self.end_headers()
            return None
        return super().do_GET()

    def send_head(self):
        path = self.translate_path(self.path)
        if (os.path.splitext(path)[1].lower() not in self.COMPRESS or not os.path.isfile(path)
                or "gzip" not in self.headers.get("Accept-Encoding", "")):
            return super().send_head()
        st = os.stat(path)
        since = self.headers.get("If-Modified-Since")
        if since and "If-None-Match" not in self.headers:
            try:
                if int(st.st_mtime) <= email.utils.parsedate_to_datetime(since).timestamp():
                    self.send_response(304)
                    self.end_headers()
                    return None
            except (TypeError, ValueError, OverflowError):
                pass
        cached = self.gzipped.get(path)
        if not cached or cached[:2] != (st.st_mtime, st.st_size):
            with open(path, "rb") as fh:
                raw = fh.read()
            body = gzip.compress(raw, 6, mtime=0)
            cached = self.gzipped[path] = (st.st_mtime, st.st_size, body if len(body) < 0.9 * len(raw) else None)
        if cached[2] is None:
            return super().send_head()
        self.send_response(200)
        self.send_header("Content-Type", self.guess_type(path))
        self.send_header("Content-Encoding", "gzip")
        self.send_header("Content-Length", str(len(cached[2])))
        self.send_header("Last-Modified", self.date_time_string(st.st_mtime))
        self.send_header("Vary", "Accept-Encoding")
        self.end_headers()
        return io.BytesIO(cached[2])

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()


print("serving", folder, "on http://localhost:%d/ (rooms at /ws: %s)" % (port, rooms.describe()), flush=True)
http.server.ThreadingHTTPServer(("", port), functools.partial(Handler, directory=folder)).serve_forever()
