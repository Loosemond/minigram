"""Serve the web minigames: http://localhost:8123/egg-emergency/

    python3 tools/serve_web.py [port] [folder]

Sets the MIME types browsers need for ES modules (on Windows, Python's guess
for .js can come from the registry and be wrong), and makes the browser
revalidate every file, so edits show up on reload. The online rooms
(tools/rooms.py) are at ws://localhost:8123/ws, so one server is all
online play needs. The port can also come from $PORT, and
TELEGRAM_BOT_TOKEN and TYPESAFE_API_KEY turn on the rooms' login and name
checks.
"""
import functools
import http.server
import os
import sys

import rooms

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
port = int(sys.argv[1]) if len(sys.argv) > 1 else int(os.environ.get("PORT", 8123))
folder = sys.argv[2] if len(sys.argv) > 2 else os.path.join(root, "web")


class Handler(http.server.SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.1"  # keep-alive: the minigames load dozens of small files
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json",
        ".glb": "model/gltf-binary", ".png": "image/png", ".jpg": "image/jpeg",
        ".css": "text/css", ".html": "text/html", ".svg": "image/svg+xml",
    }

    def do_GET(self):
        if self.path.split("?")[0] == "/ws":
            return rooms.serve(self)
        return super().do_GET()

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()


print("serving", folder, "on http://localhost:%d/ (rooms at /ws: %s)" % (port, rooms.describe()), flush=True)
http.server.ThreadingHTTPServer(("", port), functools.partial(Handler, directory=folder)).serve_forever()
