# OCR service (receipt sidecar)

A small local HTTP service for the tuition receipt checks. It takes one receipt (a PDF, or a screenshot of the
CU NEX app), reads the fields, and returns them with the checks they feed. The backend calls it; duplicate
detection across submissions is the backend's job, not this service's.

Stdlib HTTP server plus PyMuPDF for PDFs. Screenshots go through PaddleOCR (`paddle_worker.py`), or a stub for
teammates without Paddle.

## Run

```
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python server.py
```

Screenshots need PaddleOCR too (`pip install -r requirements-paddle.txt`, CPU build; GPU users install
`paddlepaddle-gpu` instead). The worker runs in the interpreter named by `PADDLE_PYTHON`, which defaults to the
one running `server.py`. Without Paddle, start with `OCR_ENGINE=stub`.

## Env

| Variable | Default | Meaning |
|---|---|---|
| `OCR_HOST` | `127.0.0.1` | Bind address. Keep it on localhost. |
| `OCR_PORT` | `8790` | Port. |
| `OCR_ENGINE` | `paddle` | `paddle` or `stub`. |
| `OCR_TMPDIR` | system temp | Folder for upload temp files (deleted after each request). |
| `PADDLE_PYTHON` | this interpreter | Python that runs `paddle_worker.py`. Started on the first image request. |
| `PADDLE_DEVICE` | `cpu` | Passed to PaddleOCR (`gpu` needs paddlepaddle-gpu). |
| `PADDLE_PDX_CACHE_HOME` | unset | Model cache folder. Only used if set. |

## Endpoints

`GET /health` returns `{"ok": true, "engine": "paddle"}` (or `"stub"`).

`POST /parse` takes the raw file as the body.
- `Content-Type`: `application/pdf`, `image/jpeg` or `image/png`. Anything else gets 415.
- Body: 10 MB at most (413 beyond). A missing `Content-Length` gets 411.
- Query (optional): `term` (e.g. `1/2569`, default: the current CU term) and `student_id`. Put this service behind nothing that logs query strings (the student ID is in it); the backend calls it directly on localhost.
- 200: `{"kind": "pdf" | "screenshot", "fields": {...}, "checks": [...]}`. Each field is
  `{"value", "box", "pii"}`; `box` is `[left, top, right, bottom]` in image pixels or PDF points.
  Each check is `{"name", "state", "detail"}`, with state `ok`, `warn`, `fail` or `info`.
- A PDF with no text layer, or a file that is not a PDF, is still 200 with fewer fields; the checks report
  what is missing.
- 503 `{"error": "OCR engine unavailable"}` when the Paddle worker cannot start (PDFs still work).
- 500 when the engine fails on one image.

## Stub mode

`OCR_ENGINE=stub` returns the same made-up words for every image (`stub_words()` in `server.py`). It ignores the
file content. Use it for tests and for running the backend without Paddle.

## Tests

From the repo root (stdlib `unittest`, synthetic data only; no Paddle is started):

```
python -m unittest discover -s prototype-1/ocr-service/tests -v
```

## PDPA

- Binds to localhost by default and keeps no files: uploads go to a temp file that is deleted before the response.
- Logs only method, path, status and time. Request bodies, field values, file names and query strings are not logged.
- Do not point this at a cloud OCR API. Receipts stay on the machine that runs it.
