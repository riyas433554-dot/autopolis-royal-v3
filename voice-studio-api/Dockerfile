FROM python:3.11-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIPER_VOICE_MODEL=en_US-lessac-medium PIPER_VOICE_PATH=/data/voices/en_US-lessac-medium.onnx
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates espeak-ng libespeak-ng1 libgomp1 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
RUN mkdir -p /data/voices && python -m piper.download_voices --data-dir /data/voices en_US-lessac-medium
COPY app.py .
EXPOSE 10000
CMD ["sh", "-c", "uvicorn app:app --host 0.0.0.0 --port ${PORT:-10000} --workers 1"]
