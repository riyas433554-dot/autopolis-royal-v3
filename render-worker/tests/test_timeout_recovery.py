import importlib.util
import sqlite3
import sys
from pathlib import Path

WORKER_PATH = Path(__file__).resolve().parents[1] / "main.py"
SPEC = importlib.util.spec_from_file_location("autopolis_render_worker_test_module", WORKER_PATH)
worker = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = worker
SPEC.loader.exec_module(worker)


def test_recover_running_jobs_requeues_interrupted_work(tmp_path, monkeypatch):
    db_path = tmp_path / "render-worker.sqlite"
    monkeypatch.setattr(worker, "DB_PATH", str(db_path))
    worker.init_db()
    with sqlite3.connect(db_path) as db:
        db.execute(
            "insert into jobs(job_id,idempotency_key,task_id,payload,status,created_at,updated_at) values(?,?,?,?,?,?,?)",
            ("job-1", "key-1", 21, '{"task_id":21}', "running", 1, 1),
        )

    assert worker.recover_running_jobs() == 1
    with sqlite3.connect(db_path) as db:
        row = db.execute("select status from jobs where job_id='job-1'").fetchone()
    assert row == ("queued",)


def test_gradio_predict_uses_submit_with_bounded_result_timeout():
    class FakeJob:
        def result(self, timeout=None):
            assert timeout == 123
            return "remote-result"

    class FakeClient:
        def submit(self, *args, api_name=None):
            assert args == ("spoken script",)
            assert api_name == "/predict"
            return FakeJob()

    assert worker._gradio_predict_with_timeout(
        FakeClient(), "spoken script", api_name="/predict", timeout=123
    ) == "remote-result"
