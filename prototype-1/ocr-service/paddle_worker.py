"""PaddleOCR worker: reads image paths on stdin, answers one "@@" + JSON line per path.

Started by server.py (PaddleEngine) with the interpreter in PADDLE_PYTHON. Settings are the same as the demo worker
(demo/ocr_worker.py) and ocr-bench/run.py. Paddle logs to stdout too, so the server only reads lines that start
with "@@".

  PADDLE_DEVICE          cpu (default) or gpu (needs paddlepaddle-gpu, see requirements-paddle.txt)
  PADDLE_PDX_CACHE_HOME  optional model cache folder. PaddleX reads it from the environment at import time, so
                         it is only used if it is set; nothing is hardcoded here.
  PADDLE_HPI             1 = high-performance CPU inference (Linux only; `paddleocr install_hpi_deps cpu`).
                         ~3.7 s/screenshot on 4 CPU / 4 GB instead of ~22 s, same fields. See README "Hosting".
  PADDLE_HPI_BACKEND     openvino (default) or onnxruntime.

Paddle's own CPU speed-up (MKL-DNN) crashes on these models in Paddle 3.3.1 ("ConvertPirAttribute2Runtime
Attribute not support"), so it stays off, and under HPI each model is pinned to a backend: left alone, HPI picks
paddle_mkldnn for the detector and hits the same crash.
"""
import json
import os
import sys

sys.stdout.reconfigure(encoding="utf-8")
sys.stdin.reconfigure(encoding="utf-8")

from paddleocr import PaddleOCR  # noqa: E402

options = dict(lang="th", device=os.environ.get("PADDLE_DEVICE", "cpu"), enable_mkldnn=False,
               text_det_unclip_ratio=2.5, use_doc_orientation_classify=False, use_doc_unwarping=False,
               use_textline_orientation=False)
if os.environ.get("PADDLE_HPI") == "1":
    # HPI's auto_config picks each model's backend from a preference table and puts paddle_mkldnn first for the
    # detector. Pinning `hpi_config.backend` instead doesn't work for it: with auto_config off, PaddleX only uses
    # OpenVINO/ONNX Runtime when an ONNX copy already exists, and falls back to Paddle. So reorder the (cached)
    # table in memory: wanted backend first, paddle_mkldnn dropped. Private PaddleX API: tested with
    # paddleocr 3.7.0 / paddlex 3.7.2 / paddlepaddle 3.3.1 (pinned in the Dockerfile).
    from paddlex.inference.models.runners.hpi import backend as hpi_backend

    want = os.environ.get("PADDLE_HPI_BACKEND", "openvino")
    for table in hpi_backend._get_hpi_model_info_collection()["cpu_x64"].values():
        for model in ("PP-OCRv5_server_det", "th_PP-OCRv5_mobile_rec"):
            if model in table:
                table[model] = [want] + [b for b in table[model] if b not in (want, "paddle_mkldnn")]
    options.update(enable_hpi=True)

ocr = PaddleOCR(**options)


def box(poly):
    xs, ys = [p[0] for p in poly], [p[1] for p in poly]
    return {"left": int(min(xs)), "top": int(min(ys)), "right": int(max(xs)), "bottom": int(max(ys))}


print("@@ready", flush=True)
for line in sys.stdin:
    try:
        words = [{"text": t, **box(p.tolist())}
                 for res in ocr.predict(line.strip()) for t, p in zip(res["rec_texts"], res["rec_polys"])]
        print("@@" + json.dumps(words, ensure_ascii=False), flush=True)
    except Exception as e:  # keep the worker alive for the next request
        print("@@" + json.dumps({"error": str(e)}, ensure_ascii=False), flush=True)
