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

At start the Paddle worker loads in the background (`engine warming up` in the log), so the first screenshot does
not wait for the model. `/health` shows `"ready": true` once it is loaded.

## Hosting

On a Linux server, use the Dockerfile. It runs Paddle on CPU with high-performance inference (OpenVINO):

```
docker build -t cedt-ocr prototype-1/ocr-service
docker run -d --name cedt-ocr --restart unless-stopped -p 127.0.0.1:8790:8790 -v cedt-ocr-models:/models cedt-ocr
```

Keep the `127.0.0.1:` in `-p`: the backend on the same machine is the only client. Models (~170 MB) download
into the volume on first start, and the first screenshot after a start is slower while OpenVINO compiles.

Measured 2026-11-13 on real CU NEX screenshots, all fields correct:

| Machine | Per screenshot | RAM |
|---|---|---|
| This image, 4 CPU / 4 GB | ~4 s | ~2 GB |
| This image, 2 CPU / 2 GB | ~7 s | at the 2 GB limit |
| Plain Paddle CPU, no HPI | ~22 s | Linux: killed at 8 GB |
| Laptop GPU (`PADDLE_DEVICE=gpu`) | 0.3 s | |

PDFs take under 0.1 s anywhere (text layer, no OCR). Plan for 4 CPU / 4 GB.

## Env

| Variable | Default | Meaning |
|---|---|---|
| `OCR_HOST` | `127.0.0.1` | Bind address. Keep it on localhost. |
| `OCR_PORT` | `8790` | Port. |
| `OCR_ENGINE` | `paddle` | `paddle` or `stub`. |
| `OCR_TMPDIR` | system temp | Parent folder; uploads go to its `cedt-ocr-uploads` subfolder (deleted after each request; leftovers are swept at start). |
| `PADDLE_PYTHON` | this interpreter | Python that runs `paddle_worker.py`. Started on the first image request. |
| `PADDLE_DEVICE` | `cpu` | Passed to PaddleOCR (`gpu` needs paddlepaddle-gpu). |
| `PADDLE_PDX_CACHE_HOME` | unset | Model cache folder. Only used if set. |
| `PADDLE_HPI` | unset | `1` = high-performance CPU inference (Linux; set in the Dockerfile). |
| `PADDLE_HPI_BACKEND` | `openvino` | `openvino` or `onnxruntime` (~same speed). |

## Endpoints

`GET /health` returns `{"ok": true, "engine": "paddle", "ready": false}` (`engine` is `"stub"` in stub mode;
`ready` is always true there).

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
- 422 `{"error": "could not read this image"}` when the engine cannot read one image.

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
