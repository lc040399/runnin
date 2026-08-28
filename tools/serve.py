#!/usr/bin/env python3
"""Runnin dev-server: som http.server, men med no-store så browseren aldrig cacher."""
import http.server, functools, sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 4173

class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        super().end_headers()
    def log_message(self, *args):
        pass  # stille

http.server.ThreadingHTTPServer(("", PORT), NoCacheHandler).serve_forever()
