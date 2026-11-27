import importlib.util
import io
import os
import sys
import wave
from pathlib import Path

from fastapi.testclient import TestClient

APP_PATH = Path(__file__).resolve().parents[2] / "voice-studio-api" / "app.py"
SPEC = importlib.util.spec_from_file_location("autopolis_voice_studio_test_module", APP_PATH)
voice_app = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = voice_app
SPEC.loader.exec_module(voice_app)


class FakePiperVoice:
    def synthesize_wav(self, text, wav_file):
        assert text == "Hello from Autopolis."
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(22050)
        wav_file.writeframes(bytes([0, 0, 16, 0, 240, 255, 32, 0]))


def test_voice_studio_health_is_public():
    response = TestClient(voice_app.app).get("/health")
    assert response.status_code == 200
    assert response.json()["engine"] == "Piper ONNX CPU"


def test_voice_studio_speech_requires_bearer_token(monkeypatch):
    monkeypatch.setenv("VOICE_STUDIO_API_KEY", "test-secret")
    response = TestClient(voice_app.app).post(
        "/v1/audio/speech",
        json={"input": "Hello from Autopolis.", "voice": "Bella", "response_format": "wav"},
    )
    assert response.status_code == 401


def test_voice_studio_returns_valid_wav_using_piper(monkeypatch):
    monkeypatch.setenv("VOICE_STUDIO_API_KEY", "test-secret")
    monkeypatch.setattr(voice_app, "_get_model", lambda: FakePiperVoice())
    response = TestClient(voice_app.app).post(
        "/v1/audio/speech",
        headers={"authorization": "Bearer test-secret"},
        json={"input": "Hello from Autopolis.", "voice": "Bella", "response_format": "wav"},
    )
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("audio/wav")
    with wave.open(io.BytesIO(response.content), "rb") as audio:
        assert audio.getframerate() == 22050
        assert audio.getnchannels() == 1
        assert audio.getnframes() == 4


def test_voice_studio_rejects_unknown_voice(monkeypatch):
    monkeypatch.setenv("VOICE_STUDIO_API_KEY", "test-secret")
    response = TestClient(voice_app.app).post(
        "/v1/audio/speech",
        headers={"authorization": "Bearer test-secret"},
        json={"input": "Hello from Autopolis.", "voice": "unknown"},
    )
    assert response.status_code == 400
