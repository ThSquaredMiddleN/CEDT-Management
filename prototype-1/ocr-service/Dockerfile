# OCR sidecar for a Linux host: CPU Paddle with high-performance inference (OpenVINO).
#   docker build -t cedt-ocr prototype-1/ocr-service
#   docker run -d --name cedt-ocr -p 127.0.0.1:8790:8790 -v cedt-ocr-models:/models cedt-ocr
# Publish on 127.0.0.1 only: receipts carry names and student IDs. Models download into /models on first start.
# Needs ~2 GB RAM; 4 CPU / 4 GB reads a screenshot in ~4 s. See README "Hosting".
FROM python:3.11-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 libgomp1 \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
# Versions tested 2026-11-13 (paddlepaddle 3.3.1 was the newest release then).
RUN pip install --no-cache-dir -r requirements.txt paddlepaddle==3.3.1 paddleocr==3.7.0 \
 && paddleocr install_hpi_deps cpu

COPY server.py receipt_parse.py paddle_worker.py ./

# OCR_HOST=0.0.0.0 is inside the container only; the -p 127.0.0.1:... mapping keeps it off the network.
ENV OCR_HOST=0.0.0.0 OCR_PORT=8790 OCR_ENGINE=paddle PADDLE_DEVICE=cpu PADDLE_HPI=1 \
    PADDLE_PDX_CACHE_HOME=/models PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
# Non-root user with a home folder (Paddle writes caches under ~). A new named volume copies the ownership of
# /models, so this user can write the model cache.
RUN useradd --create-home --uid 10001 ocr && mkdir /models && chown ocr /models
VOLUME /models
EXPOSE 8790
USER ocr
CMD ["python", "server.py"]
