import http.client
import importlib.util
from pathlib import Path
import threading
import unittest
from http.server import HTTPServer

spec = importlib.util.spec_from_file_location("launcher", Path(__file__).resolve().parents[1] / "gui_launcher.py")
launcher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(launcher)

class LocalSecurityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = HTTPServer(("127.0.0.1", 0), launcher.DiscordRequestHandler)
        cls.port = cls.server.server_port
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()

    def request(self, headers):
        connection = http.client.HTTPConnection("127.0.0.1", self.port, timeout=5)
        connection.request("GET", "/api/status", headers=headers)
        response = connection.getresponse()
        result = response.status, dict(response.getheaders()), response.read()
        connection.close()
        return result

    def test_private_export_boundaries(self):
        for headers in [{"Origin": "https://attacker.example"}, {"Origin": "null"}, {"Host": f"attacker.example:{self.port}"}, {"Sec-Fetch-Site": "cross-site"}]:
            self.assertEqual(self.request(headers)[0], 403)
        status, headers, _ = self.request({"Origin": f"http://127.0.0.1:{self.port}"})
        self.assertEqual(status, 200)
        self.assertEqual(headers["Cache-Control"], "no-store")
        self.assertNotIn("Access-Control-Allow-Origin", headers)

if __name__ == "__main__":
    unittest.main()
