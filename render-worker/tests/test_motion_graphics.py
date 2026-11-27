import importlib.util
import sys
from pathlib import Path

WORKER_PATH = Path(__file__).resolve().parents[1] / "main.py"
SPEC = importlib.util.spec_from_file_location("autopolis_motion_graphics_test_module", WORKER_PATH)
worker = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = worker
SPEC.loader.exec_module(worker)


def test_motion_graphics_scene_plan_is_five_narration_aligned_cards():
    script = (
        "Autopolis Royal V3 is live. "
        "Tasks are created in a queue. "
        "Eligible agents claim tasks using database leases. "
        "Agents record progress and deliver written results. "
        "Video passes quality checks before public YouTube upload."
    )
    scenes = worker.build_motion_graphics_scenes(script, "Autopolis Royal V3")

    assert len(scenes) == 5
    assert scenes[0]["heading"] == "ROYAL V3 IS LIVE"
    assert "Autopolis Royal V3 is live" in scenes[0]["body"]
    assert "queue" in scenes[1]["body"]
    assert "database leases" in scenes[2]["body"]
    assert "written results" in scenes[3]["body"]
    assert "quality checks" in scenes[4]["body"]


def test_motion_graphics_scene_plan_handles_long_script_without_overflow():
    scenes = worker.build_motion_graphics_scenes("word " * 500, "Launch")

    assert len(scenes) == 5
    assert all(len(scene["body"]) <= 180 for scene in scenes)
