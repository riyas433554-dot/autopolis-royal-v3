"""Lightweight Voice Studio-compatible API using MSR Voice Studio's Kitten engine."""
from __future__ import annotations

import io
import os
import threading
import wave
from typing import Literal

import numpy as np
from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field

MODEL_ID = "KittenML/kitten-tts-mini-0.8"
SAMPLE_RATE = 24000
VOICE_IDS = {
    "Bella": "expr-voice-2-f",
    "Jasper": "expr-voice-2-m",
    "Luna": "expr-voice-3-f",
    "Bruno": "expr-voice-3-m",
    "Rosie": "expr-voice-4-f",
    "Hugo": "expr-voice-4-m",
    "Kiki": "expr-voice-5-f",
    "Leo": "expr-voice-5-m",
    "expr-voice-2-f": "expr-voice-2-f",
    "expr-voice-2-m": "expr-voice-2-m",
    "expr-voice-3-f": "expr-voice-3-f",
    "expr-voice-3-m": "expr-voice-3-m",
    "expr-voice-4-f": "expr-voice-4-f",
    "expr-voice-4-m": "expr-voice-4-m",
    "expr-voice-5-f": "expr-voice-5-f",
    "expr-voice-5-m": "expr-voice-5-m",
}
_model = None
_model_lock = threading.Lock()
_synthesis_lock = threading.Lock()


class SpeechRequest(BaseModel):
    model: str = Field(default="kitten-tts-mini-0.8", max_length=100)
    input: str = Field(min_length=1, max_length=12000)
    voice: str = Field(default="Bella", max_length=80)
    response_format: Literal["wav"] = "wav"


def _get_model():
    global _model
    if _model is None:
        with _model_lock:
            if _model is None:
                from kittentts import KittenTTS
                _model = KittenTTS(MODEL_ID)
    return _model


def _wav_bytes(audio) -> bytes:
    samples = np.asarray(audio, dtype=np.float32).squeeze()
    if samples.size == 0:
        raise RuntimeError("Voice Studio returned empty audio")
    samples = np.nan_to_num(samples, nan=0.0, posinf=0.0, neginf=0.0)
    samples = np.clip(samples, -1.0, 1.0)
    pcm = (samples * 32767.0).astype("<i2")
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(SAMPLE_RATE)
        output.writeframes(pcm.tobytes())
    return buffer.getvalue()


def synthesize(text: str, voice: str = "Bella") -> bytes:
    text = str(text or "").strip()
    if not text:
        raise ValueError("input text is required")
    voice_id = VOICE_IDS.get(str(voice or "").strip())
    if not voice_id:
        raise ValueError("unsupported Voice Studio voice")
    with _synthesis_lock:
        audio = _get_model().generate(text, voice=voice_id)
    return _wav_bytes(audio)


app = FastAPI(title="Autopolis Voice Studio API", version="1.0.0")


@app.get("/")
@app.get("/health")
def health():
    return {"ok": True, "service": "autopolis-voice-studio", "engine": "Kitten TTS Mini", "model": MODEL_ID}


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
