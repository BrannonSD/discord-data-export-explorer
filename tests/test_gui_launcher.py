#!/usr/bin/env python3
"""
Automated Test Suite for Python Standalone Backend (gui_launcher.py)
"""
import os
import sys
import time
import json
import urllib.request
import urllib.parse
import threading
from http.server import HTTPServer

if hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

# Add parent dir to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

import gui_launcher

TEST_PORT = 3124
FIXTURE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), 'fixtures', 'mock_package'))

def make_request(path, method="GET", body=None):
    url = f"http://127.0.0.1:{TEST_PORT}{path}"
    req = urllib.request.Request(url, method=method)
    if body:
        req.add_header('Content-Type', 'application/json')
        data = json.dumps(body).encode('utf-8')
    else:
        data = None

    try:
        with urllib.request.urlopen(req, data=data) as response:
            res_body = response.read().decode('utf-8')
            try:
                parsed = json.loads(res_body)
                return response.status, parsed, res_body
            except Exception:
                return response.status, None, res_body
    except urllib.error.HTTPError as e:
        res_body = e.read().decode('utf-8')
        try:
            return e.code, json.loads(res_body), res_body
        except Exception:
            return e.code, None, res_body

def run_tests():
    print("====================================================")
    print("Running Python Standalone Server Test Suite...")
    print("====================================================\n")

    gui_launcher.PORT = TEST_PORT
    gui_launcher.index_package_data(FIXTURE_DIR)

    server = HTTPServer(('127.0.0.1', TEST_PORT), gui_launcher.DiscordRequestHandler)
    server_thread = threading.Thread(target=server.serve_forever, daemon=True)
    server_thread.start()

    time.sleep(0.5)

    passed = 0
    failed = 0

    def test(name, fn):
        nonlocal passed, failed
        try:
            fn()
            print(f"  [PASS] {name}")
            passed += 1
        except Exception as e:
            print(f"  [FAIL] {name} ({e})")
            failed += 1

    try:
        # Test 1: Status
        def test_status():
            status, body, _ = make_request("/api/status")
            assert status == 200
            assert body["isIndexed"] is True
            assert body["totalChannels"] == 4
            assert body["totalMessages"] == 17
        test("GET /api/status returns indexed state & channel totals", test_status)

        # Test 2: Account info
        def test_account():
            status, body, _ = make_request("/api/account")
            assert status == 200
            assert body["id"] == "112233445566778899"
            assert len(body.get("connected_accounts", [])) == 5
        test("GET /api/account returns user profile and connections", test_account)

        # Test 3: Servers list
        def test_servers():
            status, body, _ = make_request("/api/servers")
            assert status == 200
            assert len(body["servers"]) >= 2
            assert any(s["id"] == "900000000000000001" for s in body["servers"])
        test("GET /api/servers aggregates server channels and messages", test_servers)

        # Test 4: CSV Parsing
        def test_csv_channel():
            status, body, _ = make_request("/api/channel/100000000000000002/messages")
            assert status == 200
            assert body["totalMessages"] == 4
            m = next(msg for msg in body["messages"] if msg["ID"] == "800000000000000021")
            assert m["Contents"] == 'Message with, commas, and "quotes"'
        test("GET /api/channel/:id/messages correctly parses CSV with quotes/commas", test_csv_channel)

        # Test 5: Deleted User Recovery
        def test_deleted_user():
            status, body, _ = make_request("/api/channels")
            ch = next(c for c in body["channels"] if c["id"] == "100000000000000003")
            assert ch["recipientId"] == "778899001122334455"
        test("Deleted User DM c100000000000000003 recovers recipient ID 778899001122334455", test_deleted_user)

        # Test 6: Advanced Search
        def test_search():
            status, body, _ = make_request("/api/search?q=has:image")
            assert status == 200
            assert body["total"] >= 1
        test("GET /api/search with has:image filter returns image attachments", test_search)

        # Test 7: Deep Analytics
        def test_advanced_stats():
            status, body, _ = make_request("/api/stats/advanced")
            assert status == 200
            assert body["totalMessages"] == 17
            assert len(body["heatmap"]) == 7
            assert len(body["heatmap"][0]) == 24
            assert any(e["emoji"] == ":pepedance:" for e in body["topEmojis"])
        test("GET /api/stats/advanced returns 24x7 heatmap, timelines and emojis", test_advanced_stats)

        # Test 8: Export formats
        def test_exports():
            status, body, raw = make_request("/api/channel/100000000000000001/export?format=csv")
            assert status == 200
            assert raw.startswith("ID,Timestamp,AuthorID,Contents,Attachments")
        test("GET /api/channel/:id/export?format=csv generates valid CSV export", test_exports)

    finally:
        server.shutdown()

    print("\n====================================================")
    print(f"Python Test Results: {passed} Passed, {failed} Failed")
    print("====================================================\n")

    if failed > 0:
        sys.exit(1)

if __name__ == "__main__":
    run_tests()
