"""무대 배치 도구용 작은 서버: kids-english-tv 폴더를 보여 주고, 도구의 '저장'을 받아 stage.json에 씁니다.
실행: python3 tools/stage_server.py   → http://localhost:8766/tools/stage-editor.html
내 컴퓨터(127.0.0.1)에서만 열려요."""
import json, os, sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from functools import partial

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8766
LAYERS = {"valance", "world", "sparkles", "clouds", "drapeL", "drapeR", "title"}


class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_PUT(self):
        if self.path.split("?")[0] != "/stage.json":
            return self.send_error(404)
        try:
            data = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))))
            assert isinstance(data.get("maxWidth"), (int, float)) and set(data["layers"]) <= LAYERS
        except Exception:
            return self.send_error(400, "배치 형식이 맞지 않아요")
        with open(os.path.join(ROOT, "stage.json"), "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
            f.write("\n")
        self.send_response(204)
        self.end_headers()


print(f"배치 도구: http://localhost:{PORT}/tools/stage-editor.html")
ThreadingHTTPServer(("127.0.0.1", PORT), partial(Handler, directory=ROOT)).serve_forever()
