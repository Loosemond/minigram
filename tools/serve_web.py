"""Serve the web minigames locally: http://localhost:8123/egg-emergency/

    python3 tools/serve_web.py [port] [folder]

Sets the MIME types browsers need for ES modules (on Windows, Python's guess
for .js can come from the registry and be wrong), and makes the browser
revalidate every file, so edits show up on reload.
"""
import functools
import http.server
import os
import sys

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
port = int(sys.argv[1]) if len(sys.argv) > 1 else 8123
folder = sys.argv[2] if len(sys.argv) > 2 else os.path.join(root, "web")


class Handler(http.server.SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.1"  # keep-alive: the minigames load dozens of small files
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json",
        ".glb": "model/gltf-binary", ".png": "image/png", ".jpg": "image/jpeg",
        ".css": "text/css", ".html": "text/html", ".svg": "image/svg+xml",
    }

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()


print("serving", folder, "on http://localhost:%d/" % port)
http.server.ThreadingHTTPServer(("", port), functools.partial(Handler, directory=folder)).serve_forever()
