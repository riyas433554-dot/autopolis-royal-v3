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



def test_completed_render_retries_callback_without_rerender(monkeypatch, tmp_path):
    import json
    import sqlite3
    monkeypatch.setattr(main, "DB_PATH", str(tmp_path / "worker.sqlite"))
    monkeypatch.setenv("VIDEO_RENDERER_CALLBACK_TOKEN", "callback-secret")
    main.init_db()
    payload = {
        "task_id": 21,
        "callback_url": "https://autopolis.example/api/video-render-callback",
    }
    result = {"video_url": "https://storage.example/video.mp4", "qc_report": {"size_bytes": 1234}}
    with sqlite3.connect(main.DB_PATH) as db:
        db.execute(
            "insert into jobs(job_id,idempotency_key,task_id,payload,status,result,created_at,updated_at) values(?,?,?,?,?,?,?,?)",
            ("render-21", "autopolis-task-21", 21, json.dumps(payload), "done", json.dumps(result), 1, 1),
        )
    calls = []
    class FakeResponse:
        ok = True
        content = b'{"status":"published"}'
        def json(self):
            return {"status": "published"}
    monkeypatch.setattr(main.requests, "post", lambda url, **kwargs: (calls.append((url, kwargs)) or FakeResponse()))
    response = main.retry_callback_for_job("render-21")
    assert response["status"] == "published"
    assert calls[0][0] == payload["callback_url"]
    assert calls[0][1]["headers"]["authorization"] == "Bearer callback-secret"
    assert calls[0][1]["json"]["qc_passed"] is True


def test_zero_gpu_scene_prompts_split_script():
    prompts = main._scene_prompts("Scene one. More detail.\nScene two! Final line", limit=3)
    assert prompts
    assert " ".join(prompts).split() == "Scene one. More detail. Scene two! Final line".split()


def test_zero_gpu_provider_calls_public_space_and_makes_portrait_clips(monkeypatch, tmp_path):
    calls = []
    clip = tmp_path / "remote-clip.mp4"
    clip.write_bytes(b"test-video")
    class FakeClient:
        def __init__(self, space, token=None, verbose=False):
            calls.append({"space": space, "token": token})
        def predict(self, image, prompt, ratio, duration, api_name):
            calls.append({"image": image, "prompt": prompt, "ratio": ratio, "duration": duration, "api_name": api_name})
            return (str(clip), 123)
    def fake_run(args, **kwargs):
        if args[-1].endswith(".mp4"):
            open(args[-1], "wb").write(b"fake-output")
        return type("Completed", (), {"stdout": "", "stderr": ""})()
    monkeypatch.setattr(main, "Client", FakeClient)
    monkeypatch.setattr(main.subprocess, "run", fake_run)
    monkeypatch.setenv("HF_ZEROGPU_SPACE", "test/space")
    monkeypatch.setenv("HF_ZEROGPU_CLIP_SECONDS", "3")
    output = main._render_with_hf_zerogpu("A hero walks. A city glows.", "Test", "reel", str(tmp_path))
    assert output.endswith("zerogpu-visuals.mp4")
    assert calls[0]["space"] == "test/space"
    assert calls[1]["ratio"] == "480x832"
    assert calls[1]["duration"] == 3
    assert calls[1]["api_name"] == "/generate_video"


def test_autopolis_signed_upload_flow_avoids_worker_supabase_service_key(monkeypatch, tmp_path):
    calls = []
    media_path = tmp_path / "final.mp4"
    media_path.write_bytes(b"final-mp4")
    class FakeResponse:
        ok = True
        status_code = 200
        text = ""
        def __init__(self, payload=None):
            self.payload = payload or {}
        def json(self):
            return self.payload
    def fake_post(url, **kwargs):
        calls.append(("post", url, kwargs))
        if kwargs["json"]["action"] == "upload_url":
            return FakeResponse({"signed_url": "https://project.supabase.co/storage/v1/object/upload/sign/bucket/path?token=upload"})
        return FakeResponse({"video_url": "https://project.supabase.co/storage/v1/object/sign/bucket/path?token=download"})
    def fake_put(url, **kwargs):
        calls.append(("put", url, kwargs))
        assert kwargs["data"].read() == b"final-mp4"
        return FakeResponse()
    monkeypatch.setattr(main.requests, "post", fake_post)
    monkeypatch.setattr(main.requests, "put", fake_put)
    monkeypatch.setenv("AUTOPOLIS_PUBLIC_URL", "https://autopolis.example")
    monkeypatch.setenv("VIDEO_RENDERER_TOKEN", "renderer-secret")
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)
    result = main._upload_to_autopolis_storage(str(media_path), 42, "job-42")
    assert result.startswith("https://project.supabase.co/")
    assert len(calls) == 3
    assert calls[0][2]["headers"]["authorization"] == "Bearer renderer-secret"
    assert calls[1][0] == "put" and calls[1][1].startswith("https://project.supabase.co/")


def test_voice_studio_phone_caption_srt_has_sequential_indices_and_timing():
    srt = main._phone_text_to_srt("First sentence. Second sentence!", 25.0, 5.0, start_index=4)
    assert srt.startswith("4\n")
    assert "\n\n5\n" in srt
    assert "00:00:25,000 -->" in srt
    assert "00:00:30,000" in srt
