"""Voice Studio-compatible API backed by the lightweight Piper ONNX CPU engine."""
from __future__ import annotations

import io
import os
import threading
import wave
from typing import Literal

from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field

MODEL_ID = os.getenv("PIPER_VOICE_MODEL", "en_US-lessac-medium")
MODEL_PATH = os.getenv("PIPER_VOICE_PATH", "/data/voices/en_US-lessac-medium.onnx")
VOICE_IDS = {
    "Bella": MODEL_ID,
    "default": MODEL_ID,
    "lessac": MODEL_ID,
    MODEL_ID: MODEL_ID,
}
_model = None
_model_lock = threading.Lock()
_synthesis_lock = threading.Lock()


class SpeechRequest(BaseModel):
    model: str = Field(default="piper-1.8.0", max_length=100)
    input: str = Field(min_length=1, max_length=12000)
    voice: str = Field(default="Bella", max_length=80)
    response_format: Literal["wav"] = "wav"


def _get_model():
    global _model
    if _model is None:
        with _model_lock:
            if _model is None:
                from piper import PiperVoice
                _model = PiperVoice.load(MODEL_PATH)
    return _model


def synthesize(text: str, voice: str = "Bella") -> bytes:
    text = str(text or "").strip()
    if not text:
        raise ValueError("input text is required")
    if not VOICE_IDS.get(str(voice or "").strip()):
        raise ValueError("unsupported Voice Studio voice; use Bella/default")
    buffer = io.BytesIO()
    with _synthesis_lock:
        _get_model().synthesize_wav(text, wave.open(buffer, "wb"))
    audio = buffer.getvalue()
    if len(audio) < 48 or not audio.startswith(b"RIFF") or b"WAVE" not in audio[:16]:
        raise RuntimeError("Piper returned an invalid or empty WAV")
    return audio


app = FastAPI(title="Autopolis Voice Studio API", version="1.1.0")


@app.get("/")
@app.get("/health")
def health():
    return {"ok": True, "service": "autopolis-voice-studio", "engine": "Piper ONNX CPU", "model": MODEL_ID}


@app.post("/v1/audio/speech")
def speech(body: SpeechRequest, authorization: str | None = Header(default=None)):
    expected = os.getenv("VOICE_STUDIO_API_KEY", "").strip()
    if not expected:
        raise HTTPException(status_code=503, detail="Voice Studio API key is not configured")
    if authorization != "Bearer " + expected:
        raise HTTPException(status_code=401, detail="Voice Studio bearer token required")
    if not body.input.strip():
        raise HTTPException(status_code=400, detail="input text is required")
    try:
        audio = synthesize(body.input, body.voice)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Voice Studio synthesis failed: " + str(exc)[:300]) from exc
    return Response(content=audio, media_type="audio/wav")
