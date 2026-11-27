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
