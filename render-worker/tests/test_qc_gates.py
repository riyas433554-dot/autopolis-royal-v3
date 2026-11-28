import json

import pytest

import main


def test_compression_rejects_narration_that_ends_well_before_video(monkeypatch):
    called = []
    monkeypatch.setattr(main.subprocess, "run", lambda *args, **kwargs: called.append(args))
    monkeypatch.setattr(main.os.path, "getsize", lambda path: 1)

    with pytest.raises(RuntimeError, match="narration coverage"):
        main._compress_video(
            "source.mp4", "voice.wav", "final.mp4",
            video_duration=45.0, voice_duration=27.83,
        )

    assert called == []


def test_compression_accepts_narration_with_short_outro(monkeypatch, tmp_path):
    monkeypatch.setattr(main.subprocess, "run", lambda *args, **kwargs: None)
    monkeypatch.setattr(main.os.path, "getsize", lambda path: 1)

    main._compress_video(
        "source.mp4", "voice.wav", str(tmp_path / "final.mp4"),
        video_duration=45.0, voice_duration=43.0,
    )


def test_probe_rejects_missing_or_invalid_dimensions(monkeypatch):
    payload = {
        "format": {"duration": "45"},
        "streams": [
            {"codec_type": "video", "width": 0, "height": 1080},
            {"codec_type": "audio"},
        ],
    }

    class Result:
        stdout = json.dumps(payload)

    monkeypatch.setattr(main.subprocess, "run", lambda *args, **kwargs: Result())

    with pytest.raises(RuntimeError, match="dimensions"):
        main._probe("broken.mp4")


def test_compression_rejects_nonpositive_voice_duration(monkeypatch):
    monkeypatch.setattr(main.subprocess, "run", lambda *args, **kwargs: None)

    with pytest.raises(RuntimeError, match="narration duration"):
        main._compress_video(
            "source.mp4", "voice.wav", "final.mp4",
            video_duration=45.0, voice_duration=0,
        )
