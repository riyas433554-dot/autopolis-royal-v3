import pytest
from pydantic import ValidationError

import main


def test_render_request_accepts_explicit_resolution_profile(monkeypatch):
    monkeypatch.setenv("VIDEO_RENDER_PROVIDER", "ai_video_studio")
    request = main.RenderJobRequest(
        task_id=1, title="Cinematic", deliverable_type="video",
        script="Narration", resolution="1080p",
        callback_url="https://autopolis.example/callback",
    )
    assert request.model_dump()["resolution"] == "1080p"


def test_render_request_rejects_unknown_resolution_profile():
    with pytest.raises(ValidationError):
        main.RenderJobRequest(
            task_id=1, title="Cinematic", deliverable_type="video",
            script="Narration", resolution="4k",
            callback_url="https://autopolis.example/callback",
        )


@pytest.mark.parametrize(
    ("resolution", "deliverable_type", "expected"),
    [
        ("720p", "video", (1280, 720)),
        ("1080p", "video", (1920, 1080)),
        ("1440p", "video", (2560, 1440)),
        ("1080p", "reel", (1080, 1920)),
        ("1440p", "reel", (1440, 2560)),
    ],
)
def test_resolution_profile_dimensions(resolution, deliverable_type, expected):
    assert main._resolution_dimensions(resolution, deliverable_type) == expected


def test_resolution_qc_rejects_low_resolution_source():
    with pytest.raises(RuntimeError, match="resolution profile"):
        main._validate_resolution_qc(
            {"width": 832, "height": 480},
            resolution="1080p", deliverable_type="video",
        )



def test_resolution_qc_rejects_wrong_aspect_ratio_even_when_dimensions_are_large_enough():
    with pytest.raises(RuntimeError, match="aspect ratio"):
        main._validate_resolution_qc(
            {"width": 1920, "height": 1920},
            resolution="1080p", deliverable_type="video",
        )


def test_resolution_qc_accepts_profile_dimensions():
    main._validate_resolution_qc(
        {"width": 1920, "height": 1080},
        resolution="1080p", deliverable_type="video",
    )


def test_source_resolution_profile_does_not_force_upscale():
    assert main._resolution_dimensions("source", "video") is None

@pytest.mark.parametrize("resolution", ["720p", "1080p", "1440p"])
def test_high_resolution_routes_to_studio_provider(resolution):
    assert main._select_render_source("hf_zerogpu", resolution, ltx_enabled=True) == "ltx_zerogpu"


def test_source_profile_keeps_configured_provider():
    assert main._select_render_source("hf_zerogpu", "source") == "hf_zerogpu"


def test_studio_render_options_enable_upscaling_only_for_target_profiles():
    assert main._studio_render_options("1080p")["upscaling"] is True
    assert main._studio_render_options("source")["upscaling"] is False

@pytest.mark.parametrize(
    ("target", "expected"),
    [
        ((1920, 1080), (1920, 1088)),
        ((2560, 1440), (2560, 1440)),
        ((1080, 1920), (1088, 1920)),
        ((1280, 720), (1280, 736)),
    ],
)
def test_ltx_request_dimensions_round_up_to_model_multiple(target, expected):
    assert main._ltx_request_dimensions(target) == expected


def test_ltx_provider_uses_documented_preset_then_crops_to_720p(monkeypatch, tmp_path):
    generated = tmp_path / "ltx-generated.mp4"
    generated.write_bytes(b"fake-mp4")
    calls = []
    commands = []

    class FakeClient:
        def __init__(self, space, token=None, verbose=False):
            calls.append(("client", space, token, verbose))

        def predict(self, *args, **kwargs):
            calls.append(("predict", args, kwargs))
            return str(generated), 123

    monkeypatch.setattr(main, "Client", FakeClient)
    monkeypatch.setattr(main, "_scene_prompts", lambda script, limit: ["A cinematic scene"])
    monkeypatch.setattr(main, "_probe", lambda path: {
        "width": 1536, "height": 1024, "duration_seconds": 10.0,
    })
    monkeypatch.setattr(main.subprocess, "run", lambda command, *args, **kwargs: commands.append(command))
    monkeypatch.setattr(main.os.path, "getsize", lambda path: 1)
    monkeypatch.setenv("LTX_ZEROGPU_SPACE", "Lightricks/LTX-2-3")
    monkeypatch.setenv("LTX_ZEROGPU_CLIP_SECONDS", "10")

    result = main._render_with_ltx_zerogpu(
        "Narration script", "Title", "video", "720p", str(tmp_path),
    )

    predict = next(call for call in calls if call[0] == "predict")
    assert predict[1][6] == 1024
    assert predict[1][7] == 1536
    assert predict[2]["api_name"] == "/generate_video"
    assert any("crop=1280:720" in str(command) for command in commands)
    assert result.endswith("ltx-visuals.mp4")


def test_ltx_provider_uses_documented_portrait_preset_then_crops_to_vertical_720p(monkeypatch, tmp_path):
    generated = tmp_path / "ltx-portrait.mp4"
    generated.write_bytes(b"fake-mp4")
    calls = []
    commands = []

    class FakeClient:
        def __init__(self, space, token=None, verbose=False):
            pass

        def predict(self, *args, **kwargs):
            calls.append((args, kwargs))
            return str(generated), 123

    monkeypatch.setattr(main, "Client", FakeClient)
    monkeypatch.setattr(main, "_scene_prompts", lambda script, limit: ["A vertical cinematic scene"])
    monkeypatch.setattr(main, "_probe", lambda path: {
        "width": 1024, "height": 1536, "duration_seconds": 10.0,
    })
    monkeypatch.setattr(main.subprocess, "run", lambda command, *args, **kwargs: commands.append(command))
    monkeypatch.setattr(main.os.path, "getsize", lambda path: 1)
    monkeypatch.setenv("LTX_ZEROGPU_SPACE", "Lightricks/LTX-2-3")
    monkeypatch.setenv("LTX_ZEROGPU_CLIP_SECONDS", "10")

    result = main._render_with_ltx_zerogpu(
        "Narration script", "Title", "reel", "720p", str(tmp_path),
    )

    args, kwargs = calls[0]
    assert args[6] == 1536
    assert args[7] == 1024
    assert kwargs["api_name"] == "/generate_video"
    assert any("crop=720:1280" in str(command) for command in commands)
    assert result.endswith("ltx-visuals.mp4")


def test_high_resolution_qc_rejects_static_video_tail_when_visuals_are_short():
    with pytest.raises(RuntimeError, match="visual coverage"):
        main._validate_visual_coverage(video_duration=35.0, voice_duration=45.0)


def test_high_resolution_qc_accepts_visuals_covering_narration():
    main._validate_visual_coverage(video_duration=43.0, voice_duration=45.0)

def test_high_resolution_ltx_route_is_disabled_until_explicitly_enabled():
    with pytest.raises(RuntimeError, match="LTX ZeroGPU is disabled"):
        main._select_render_source("hf_zerogpu", "1080p", ltx_enabled=False)


def test_explicit_ltx_provider_requires_enable_flag():
    with pytest.raises(RuntimeError, match="LTX ZeroGPU is disabled"):
        main._select_render_source("ltx_zerogpu", "source", ltx_enabled=False)

def test_render_request_rejects_high_resolution_when_ltx_is_disabled(monkeypatch):
    monkeypatch.setenv("VIDEO_RENDER_PROVIDER", "hf_zerogpu")
    monkeypatch.setenv("LTX_ZEROGPU_ENABLED", "false")
    with pytest.raises(ValidationError, match="LTX ZeroGPU is disabled"):
        main.RenderJobRequest(
            task_id=1, title="Cinematic", deliverable_type="video",
            script="Narration", resolution="1080p",
            callback_url="https://autopolis.example/callback",
        )


def test_ltx_concat_manifest_separates_multiple_clips_with_real_newlines(monkeypatch, tmp_path):
    generated = tmp_path / "ltx-generated.mp4"
    generated.write_bytes(b"fake-mp4")
    manifests = []

    class FakeClient:
        def __init__(self, space, token=None, verbose=False):
            pass

        def predict(self, *args, **kwargs):
            return str(generated), 123

    def fake_run(command, *args, **kwargs):
        if "concat" in command and "-f" in command:
            manifest_path = command[command.index("-i") + 1]
            manifests.append(open(manifest_path, encoding="utf-8").read())
        return None

    monkeypatch.setattr(main, "Client", FakeClient)
    monkeypatch.setattr(main, "_scene_prompts", lambda script, limit: ["Scene one", "Scene two"])
    monkeypatch.setattr(main, "_probe", lambda path: {
        "width": 1536, "height": 1024, "duration_seconds": 10.0,
    })
    monkeypatch.setattr(main.subprocess, "run", fake_run)
    monkeypatch.setattr(main.os.path, "getsize", lambda path: 1)
    monkeypatch.setenv("LTX_ZEROGPU_CLIP_SECONDS", "10")

    main._render_with_ltx_zerogpu(
        "Narration script", "Title", "video", "720p", str(tmp_path),
    )

    assert len(manifests) == 1
    lines = manifests[0].splitlines()
    assert len(lines) == 2
    assert all(line.startswith("file ") for line in lines)
    assert "\\\\nfile " not in manifests[0]


@pytest.mark.parametrize("resolution", ["1080p", "1440p"])
def test_ltx_public_space_fails_fast_for_profiles_above_documented_native_limit(monkeypatch, tmp_path, resolution):
    class ForbiddenClient:
        def __init__(self, *args, **kwargs):
            pytest.fail("LTX client must not be called for unsupported target dimensions")

    monkeypatch.setattr(main, "Client", ForbiddenClient)
    monkeypatch.setenv("LTX_ZEROGPU_SPACE", "Lightricks/LTX-2-3")
    with pytest.raises(RuntimeError, match="no verified preset"):
        main._render_with_ltx_zerogpu(
            "Narration script", "Title", "video", resolution, str(tmp_path),
        )


def test_agnes_free_video_flash_routes_720p_and_rejects_paid_profiles(monkeypatch):
    monkeypatch.setenv("AGNES_API_KEY", "test-key")
    monkeypatch.setenv("AGNES_VIDEO_ENABLED", "true")
    assert main._select_render_source("agnes_video", "720p") == "agnes_video"
    with pytest.raises(RuntimeError, match="only supports 720p"):
        main._select_render_source("agnes_video", "1080p")
    with pytest.raises(RuntimeError, match="only supports 720p"):
        main._select_render_source("agnes_video", "1440p")


def test_agnes_video_flash_submits_720p_and_downloads_completed_video(monkeypatch, tmp_path):
    calls = []

    class FakeResponse:
        ok = True
        status_code = 200
        headers = {"content-type": "video/mp4"}

        def __init__(self, payload=None, content=b"mp4-bytes"):
            self.payload = payload
            self.content = content

        def json(self):
            return self.payload

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, traceback):
            return False

        def raise_for_status(self):
            return None

        def iter_content(self, chunk_size=1024):
            yield self.content

    def fake_post(url, **kwargs):
        calls.append(("post", url, kwargs))
        return FakeResponse({"video_id": "video-123"}, content=b'{"video_id":"video-123"}')

    def fake_get(url, **kwargs):
        calls.append(("get", url, kwargs))
        if "agnesapi" in url:
            return FakeResponse({"status": "completed", "url": "https://media.example/video.mp4"})
        return FakeResponse(content=b"mp4-bytes")

    monkeypatch.setenv("AGNES_API_KEY", "test-key")
    monkeypatch.setenv("AGNES_VIDEO_ENABLED", "true")
    monkeypatch.setenv("AGNES_VIDEO_MIN_INTERVAL_SECONDS", "0")
    monkeypatch.setattr(main.requests, "post", fake_post)
    monkeypatch.setattr(main.requests, "get", fake_get)
    monkeypatch.setattr(main.time, "sleep", lambda seconds: None)
    target = str(tmp_path / "agnes.mp4")

    result = main._agnes_generate_clip("A cinematic scene", target, "reel")

    assert result == target
    assert open(target, "rb").read() == b"mp4-bytes"
    request = calls[0][2]["json"]
    assert request["model"] == "agnes-video-2.5-flash"
    assert request["size"] == "720P"
    assert request["aspect_ratio"] == "9:16"
    assert request["seconds"] == "12"


def test_probe_can_validate_video_only_render_source_but_final_requires_audio(monkeypatch, tmp_path):
    import json
    from types import SimpleNamespace

    payload = {
        "streams": [{"codec_type": "video", "width": 1280, "height": 720, "codec_name": "h264"}],
        "format": {"duration": "12.0"},
    }
    monkeypatch.setattr(
        main.subprocess, "run",
        lambda *args, **kwargs: SimpleNamespace(stdout=json.dumps(payload)),
    )

    source_qc = main._probe(str(tmp_path / "video-only.mp4"), require_audio=False)
    assert source_qc["width"] == 1280
    assert source_qc["audio_codec"] is None

    with pytest.raises(RuntimeError, match="video and audio streams"):
        main._probe(str(tmp_path / "final-without-audio.mp4"))


def test_auto_provider_keeps_source_jobs_on_existing_hf_provider(monkeypatch):
    monkeypatch.delenv("AGNES_API_KEY", raising=False)
    assert main._select_render_source("auto", "source") == "hf_zerogpu"


def test_auto_provider_routes_720p_to_agnes_only_when_key_exists(monkeypatch):
    monkeypatch.setenv("AGNES_API_KEY", "test-key")
    monkeypatch.setenv("AGNES_VIDEO_ENABLED", "true")
    assert main._select_render_source("auto", "720p") == "agnes_video"


def test_auto_provider_rejects_720p_without_agnes_key(monkeypatch):
    monkeypatch.delenv("AGNES_API_KEY", raising=False)
    with pytest.raises(RuntimeError, match="AGNES_API_KEY"):
        main._select_render_source("auto", "720p")


def test_agnes_provider_requires_explicit_opt_in(monkeypatch):
    monkeypatch.setenv("AGNES_API_KEY", "test-key")
    monkeypatch.delenv("AGNES_VIDEO_ENABLED", raising=False)
    with pytest.raises(RuntimeError, match="AGNES_VIDEO_ENABLED"):
        main._select_render_source("agnes_video", "720p")
