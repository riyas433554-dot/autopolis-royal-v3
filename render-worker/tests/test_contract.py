import os
import pytest
from pydantic import ValidationError

import main


def test_authorization_requires_exact_bearer_token(monkeypatch):
    monkeypatch.setenv("VIDEO_RENDERER_TOKEN", "worker-secret")
    assert main.authorized("Bearer worker-secret")
    assert not main.authorized("worker-secret")
    assert not main.authorized("Bearer wrong")


def test_callback_url_requires_https_except_localhost():
    assert main.check_callback_url("https://autopolis.example/api/video-render-callback")
    assert main.check_callback_url("http://127.0.0.1:3000/callback")
    with pytest.raises(ValueError, match="HTTPS"):
        main.check_callback_url("http://public.example/callback")
    with pytest.raises(ValueError, match="credentials"):
        main.check_callback_url("https://user:pass@autopolis.example/callback")


def test_render_request_rejects_empty_script_and_bad_type():
    with pytest.raises(ValidationError):
        main.RenderJobRequest(
            task_id=1, title="Short", deliverable_type="reel",
            script=" ", callback_url="https://autopolis.example/callback",
        )
    with pytest.raises(ValidationError):
        main.RenderJobRequest(
            task_id=1, title="Short", deliverable_type="blog",
            script="script", callback_url="https://autopolis.example/callback",
        )


def test_idempotency_returns_same_job_and_requeues_failed(monkeypatch, tmp_path):
    monkeypatch.setattr(main, "DB_PATH", str(tmp_path / "worker.sqlite"))
    main.init_db()
    payload = {"task_id": 17, "title": "Test", "script": "A script"}
    first_id, first_status = main.enqueue_job("autopolis-task-17", payload)
    second_id, second_status = main.enqueue_job("autopolis-task-17", payload)
    assert first_id == second_id
    assert first_status == second_status == "queued"

    import sqlite3
    with sqlite3.connect(main.DB_PATH) as db:
        db.execute("update jobs set status='failed' where job_id=?", (first_id,))
    retry_id, retry_status = main.enqueue_job("autopolis-task-17", payload)
    assert retry_id == first_id
    assert retry_status == "queued"


def test_voice_studio_text_chunks_are_bounded():
    text = "sentence. " * 800
    chunks = main._split_tts_text(text, limit=120)
    assert chunks
    assert all(len(chunk) <= 120 for chunk in chunks)
    assert " ".join(chunks).split() == text.split()


def test_voice_studio_tts_uses_local_openai_compatible_endpoint(monkeypatch, tmp_path):
    calls = []
    class FakeResponse:
        ok = True
        content = b"RIFFfake-wav"
        headers = {"content-type": "audio/wav"}
    def fake_post(url, **kwargs):
        calls.append((url, kwargs))
        return FakeResponse()
    monkeypatch.setattr(main.requests, "post", fake_post)
    monkeypatch.setenv("VOICE_STUDIO_URL", "http://127.0.0.1:3900")
    monkeypatch.setenv("VOICE_STUDIO_MODEL", "test-engine")
    monkeypatch.setenv("VOICE_STUDIO_VOICE", "test-voice")
    target = str(tmp_path / "voice.wav")
    main._generate_voice_studio_audio("A short narration.", target)
    assert calls[0][0] == "http://127.0.0.1:3900/v1/audio/speech"
    assert calls[0][1]["json"]["model"] == "test-engine"
    assert calls[0][1]["json"]["voice"] == "test-voice"
    assert calls[0][1]["json"]["response_format"] == "wav"
    assert open(target, "rb").read() == b"RIFFfake-wav"



def test_voice_studio_model_must_be_explicit(monkeypatch, tmp_path):
    monkeypatch.delenv("VOICE_STUDIO_MODEL", raising=False)
    with pytest.raises(RuntimeError, match="Set VOICE_STUDIO_MODEL"):
        main._generate_voice_studio_audio("script", str(tmp_path / "voice.wav"))


def test_compression_uses_longer_of_video_and_voice_tracks(monkeypatch, tmp_path):
    calls = []
    monkeypatch.setattr(main.subprocess, "run", lambda args, **kwargs: calls.append(args))
    monkeypatch.setattr(main.os.path, "getsize", lambda path: 1)
    main._compress_video("video.mp4", "voice.wav", str(tmp_path / "final.mp4"), 10.0, 12.0)
    args = calls[0]
    assert "-map" in args and "0:v:0" in args and "1:a:0" in args
    assert "tpad=stop_mode=clone:stop_duration=2.000" in args
