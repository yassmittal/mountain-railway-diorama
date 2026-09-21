#!/usr/bin/env python3
"""Run from any directory: python3 serve.py (then open http://localhost:8000)."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from functools import partial
from pathlib import Path
import argparse
p=argparse.ArgumentParser();p.add_argument('--port',type=int,default=8000);args=p.parse_args()
root=Path(__file__).resolve().parent
print(f'Yamaai railway: http://localhost:{args.port}', flush=True)
ThreadingHTTPServer(('127.0.0.1',args.port),partial(SimpleHTTPRequestHandler,directory=str(root))).serve_forever()
