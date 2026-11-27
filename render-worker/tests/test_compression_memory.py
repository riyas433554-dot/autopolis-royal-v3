import importlib.util
import sys
from pathlib import Path

WORKER_PATH = Path(__file__).resolve().parents[1] / "main.py"
SPEC = importlib.util.spec_from_file_location("autopolis_compression_memory_test_module", WORKER_PATH)
worker = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = worker
SPEC.loader.exec_module(worker)


def test_final_video_compression_is_memory_bounded(monkeypatch):
    calls = []
    monkeypatch.setattr(worker.subprocess, "run", lambda command, **kwargs: calls.append(command))
    monkeypatch.setattr(worker.os.path, "getsize", lambda path: 1024)

    worker._compress_video("source.mp4", "voice.wav", "final.mp4", 48.0, 48.0)

    command = calls[0]
    assert command[command.index("-filter_threads") + 1] == "1"
    assert command[command.index("-threads:v") + 1] == "1"
    assert command[command.index("-preset") + 1] == "ultrafast"
