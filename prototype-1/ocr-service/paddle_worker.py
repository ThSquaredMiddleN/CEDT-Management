"""PaddleOCR worker: reads image paths on stdin, answers one "@@" + JSON line per path.

Started by server.py (PaddleEngine) with the interpreter in PADDLE_PYTHON. Settings are the same as the demo worker
(demo/ocr_worker.py) and ocr-bench/run.py. Paddle logs to stdout too, so the server only reads lines that start
with "@@".

  PADDLE_DEVICE          cpu (default) or gpu (needs paddlepaddle-gpu, see requirements-paddle.txt)
  PADDLE_PDX_CACHE_HOME  optional model cache folder. PaddleX reads it from the environment at import time, so
                         it is only used if it is set; nothing is hardcoded here.
"""
import json
import os
import sys

sys.stdout.reconfigure(encoding="utf-8")
sys.stdin.reconfigure(encoding="utf-8")

from paddleocr import PaddleOCR  # noqa: E402

ocr = PaddleOCR(lang="th", device=os.environ.get("PADDLE_DEVICE", "cpu"), enable_mkldnn=False,
                text_det_unclip_ratio=2.5, use_doc_orientation_classify=False, use_doc_unwarping=False,
                use_textline_orientation=False)


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
