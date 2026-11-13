"""OCR sidecar for the receipt checks: a tuition PDF or screenshot in, parsed fields and checks out.

  python server.py       binds OCR_HOST:OCR_PORT (default 127.0.0.1:8790)

Localhost only by default. Nothing is kept: an upload goes to a temp file that is deleted before the response is
sent. Logs carry method, path, status and time only: no bodies, field values, file names or query strings.
Do not point this at a cloud OCR API.

Env: OCR_ENGINE (paddle | stub, default paddle), OCR_HOST, OCR_PORT, OCR_TMPDIR (parent folder; uploads go to its
cedt-ocr-uploads subfolder, read once at import), PADDLE_PYTHON (interpreter for paddle_worker.py, default this one), PADDLE_DEVICE and PADDLE_PDX_CACHE_HOME
(read by paddle_worker.py).
"""
import json
import logging
import os
import subprocess
import sys
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from receipt_parse import checks, current_term, parse_pdf, parse_screenshot

HERE = Path(__file__).resolve().parent
MAX_BODY = 10 * 1024 * 1024
SUFFIX = {"application/pdf": ".pdf", "image/jpeg": ".jpg", "image/png": ".png"}
UPLOAD_DIR = Path(os.environ.get("OCR_TMPDIR") or tempfile.gettempdir()) / "cedt-ocr-uploads"
logger = logging.getLogger("ocr")


class EngineUnavailable(Exception):
    """The engine cannot run right now (worker missing or dead)."""


class OCRFailed(Exception):
    """The engine ran but could not read this image."""


def stub_words(amount="21,000.00", status="ชำระเงินสำเร็จ"):
    """Made-up OCR lines in the shape parse_screenshot reads: labels left of 45% of the width, each value to the
    right on the same row. Rows are 70px apart; text boxes are 40px tall."""
    layout = [  # (row, text, left, right)
        (0, "ค่าเล่าเรียน 1/2569", 50, 420),
        (1, "นาย ทดสอบ ตัวอย่าง (รหัสนิสิต 680000)", 50, 900),
        (2, "ยอดรวม", 50, 200), (2, amount, 500, 700),
        (3, "สถานะการชำระเงิน", 50, 400), (3, status, 500, 800),
        (4, "ชำระเงินเมื่อวันที่", 50, 400), (4, "26 ธ.ค. 68 (10:15)", 500, 800),
        (5, "หมายเลขอ้างอิง", 50, 400), (5, "1234567890123", 500, 800),
        (6, "ประเภทการชำระ", 50, 400), (6, "ชำระผ่านแอป", 500, 800),
    ]
    return [{"text": t, "left": left, "top": 40 + row * 70, "right": right, "bottom": 80 + row * 70}
            for row, t, left, right in layout]


class StubEngine:
    """Fixed made-up words for every image. For teammates without Paddle, and for tests."""
    name = "stub"
    ready = True

    def warm(self):
        pass

    def words(self, path):
        return stub_words()

    def close(self):
        pass


class PaddleEngine:
    """One long-lived paddle_worker.py process, so the model loads once. Started on first use, restarted if it dies.
    Requests are serialised by a lock."""
    name = "paddle"

    def __init__(self, python=None, worker=HERE / "paddle_worker.py", timeout=None, start_timeout=None):
        self.python = python or sys.executable
        self.worker = worker
        self.timeout = timeout or float(os.environ.get("OCR_TIMEOUT") or 60)  # per image
        self.start_timeout = start_timeout or float(os.environ.get("OCR_START_TIMEOUT") or 300)  # model load
        self.lock = threading.Lock()
        self.proc = None
        self.loaded = False  # True once the worker has printed "@@ready"

    @property
    def ready(self):
        return self.loaded and self.proc is not None and self.proc.poll() is None

    def warm(self):
        """Start the worker now, so the first upload does not wait for the model load. A failed start is
        swallowed: the next request tries again."""
        with self.lock:
            if self.proc is None or self.proc.poll() is not None:
                try:
                    self._start()
                except EngineUnavailable:
                    logger.warning("engine not ready; the next request retries")

    def words(self, path):
        with self.lock:
            if self.proc is None or self.proc.poll() is not None:
                self._start()
            try:
                self.proc.stdin.write(f"{path}\n")
                self.proc.stdin.flush()
                payload = self._answer(self.timeout)
            except (OSError, ValueError):
                payload = None
            if payload is None:
                self.close()
                raise EngineUnavailable("worker exited")
            result = json.loads(payload)
            if isinstance(result, dict):
                raise OCRFailed(result.get("error", ""))
            return result

    def _start(self):
        self.close()
        try:
            self.proc = subprocess.Popen([self.python, str(self.worker)], stdin=subprocess.PIPE,
                                         stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                                         text=True, encoding="utf-8", bufsize=1)
        except OSError as e:
            raise EngineUnavailable("cannot start worker") from e
        if self._answer(self.start_timeout) is None:  # wait for "@@ready" (model loaded); EOF = failed to start
            self.close()
            raise EngineUnavailable("worker failed to start")
        self.loaded = True

    def _answer(self, timeout):
        """Next "@@" line, or None on EOF. A hung worker is killed after `timeout` s, which ends the read with
        EOF; the next request starts a fresh worker."""
        proc = self.proc
        watchdog = threading.Timer(timeout, proc.kill)
        watchdog.daemon = True
        watchdog.start()
        try:
            for line in proc.stdout:
                if line.startswith("@@"):
                    return line[2:]
            return None
        finally:
            watchdog.cancel()

    def close(self):
        proc, self.proc = self.proc, None
        self.loaded = False
        if proc is None:
            return
        try:
            proc.stdin.close()
            proc.wait(timeout=5)
        except (OSError, subprocess.TimeoutExpired):
            proc.kill()
            proc.wait()
        proc.stdout.close()


def build_engine(name):
    if name == "stub":
        return StubEngine()
    if name == "paddle":
        return PaddleEngine(os.environ.get("PADDLE_PYTHON") or None)
    raise ValueError("OCR_ENGINE must be paddle or stub")


def _first(q, key):
    return (q.get(key) or [""])[0].strip() or None


def _remove_quietly(path):
    """Delete a temp file, retrying: on Windows a Paddle child that survived a watchdog kill can hold it open for a
    moment. Never raises (the response does not depend on the delete). The path is not logged."""
    for attempt in range(5):
        try:
            os.remove(path)
            return
        except FileNotFoundError:
            return
        except OSError:
            if attempt < 4:
                time.sleep(0.2)
    logger.error("temp file not deleted")


class Handler(BaseHTTPRequestHandler):
    server_version = "ocr-service"
    timeout = 30  # socket timeout: a client that stalls mid-body frees its thread
    sys_version = ""

    def log_message(self, *args):  # default lines carry the query string (student ID); ours log the path only
        pass

    def log_error(self, *args):
        pass

    def do_GET(self):
        self._run(self._get)

    def do_POST(self):
        self._run(self._post)

    def _run(self, route):
        t0 = time.perf_counter()
        path = urlparse(self.path).path
        self._status = 500
        try:
            route(path)
        except Exception as e:  # report the type only: the message may contain file names
            logger.error("unhandled %s", type(e).__name__)
            self._json(500, {"error": "internal error"})
        finally:
            ms = round((time.perf_counter() - t0) * 1000)
            logger.info("%s %s %d %dms", self.command, path, self._status, ms)

    def _get(self, path):
        if path == "/health":
            engine = self.server.engine
            self._json(200, {"ok": True, "engine": engine.name, "ready": engine.ready})
        else:
            self._json(404, {"error": "not found"})

    def _post(self, path):
        if path != "/parse":
            return self._json(404, {"error": "not found"})
        suffix = SUFFIX.get(self.headers.get_content_type())
        if suffix is None:
            return self._json(415, {"error": "PDF, JPEG or PNG only"})
        length = (self.headers.get("Content-Length") or "").strip()
        if not length:
            return self._json(411, {"error": "Content-Length required"})
        if not (length.isascii() and length.isdigit()):
            return self._json(400, {"error": "bad Content-Length"})
        if int(length) > MAX_BODY:
            return self._json(413, {"error": "file over 10 MB"})
        body = self.rfile.read(int(length))
        if len(body) != int(length):
            return self._json(400, {"error": "incomplete body"})
        q = parse_qs(urlparse(self.path).query)
        expected = {"term": _first(q, "term") or current_term(), "student_id": _first(q, "student_id")}
        status, payload = self._parse(body, suffix, expected)
        self._json(status, payload)

    def _parse(self, body, suffix, expected):
        """Returns (status, payload). The temp file is deleted before this returns, so before the response."""
        fd, tmp = tempfile.mkstemp(suffix=suffix, dir=str(UPLOAD_DIR))
        try:
            with os.fdopen(fd, "wb") as f:
                f.write(body)
            if suffix == ".pdf":
                kind = "pdf"
                try:
                    fields = parse_pdf(tmp)[0]
                except Exception:  # not a PDF, encrypted or broken: no fields, which the checks report
                    fields = {}
            else:
                kind = "screenshot"
                try:
                    fields = parse_screenshot(self.server.engine.words(tmp))
                except EngineUnavailable:
                    return 503, {"error": "OCR engine unavailable"}
                except OCRFailed:
                    return 422, {"error": "could not read this image"}
        finally:
            _remove_quietly(tmp)
        return 200, {"kind": kind, "fields": fields, "checks": checks(kind, fields, expected, seen_by=None)}

    def _json(self, status, obj):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self._status = status
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def make_server(host=None, port=None):
    """Env defaults: OCR_HOST, OCR_PORT, OCR_ENGINE. Pass port=0 for a free port (tests)."""
    host = host or os.environ.get("OCR_HOST", "127.0.0.1")
    port = int(port if port is not None else os.environ.get("OCR_PORT", "8790"))
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    for leftover in UPLOAD_DIR.iterdir():  # files left by an earlier crash
        if leftover.is_file():
            _remove_quietly(str(leftover))
    httpd = ThreadingHTTPServer((host, port), Handler)
    httpd.engine = build_engine(os.environ.get("OCR_ENGINE", "paddle"))
    return httpd


def main():
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    httpd = make_server()
    host, port = httpd.server_address[:2]
    logger.info("listening on %s:%s, engine %s", host, port, httpd.engine.name)
    logger.info("engine warming up")
    threading.Thread(target=httpd.engine.warm, daemon=True).start()
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()
        httpd.engine.close()


if __name__ == "__main__":
    main()
