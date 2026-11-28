import pytest
from pydantic import ValidationError

import main


def test_render_request_accepts_explicit_resolution_profile():
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


def test_ltx_provider_calls_public_space_with_target_dimensions(monkeypatch, tmp_path):
    generated = tmp_path / "ltx-generated.mp4"
    generated.write_bytes(b"fake-mp4")
    calls = []

    class FakeClient:
        def __init__(self, space, token=None, verbose=False):
            calls.append(("client", space, token, verbose))

        def predict(self, *args, **kwargs):
            calls.append(("predict", args, kwargs))
            return str(generated), 123

    monkeypatch.setattr(main, "Client", FakeClient)
    monkeypatch.setattr(main, "_scene_prompts", lambda script, limit: ["A cinematic scene"])
    monkeypatch.setattr(main, "_probe", lambda path: {
        "width": 1920, "height": 1088, "duration_seconds": 10.0,
    })
    monkeypatch.setattr(main.subprocess, "run", lambda *args, **kwargs: None)
    monkeypatch.setattr(main.os.path, "getsize", lambda path: 1)
    monkeypatch.setenv("LTX_ZEROGPU_SPACE", "Lightricks/LTX-2-3")
    monkeypatch.setenv("LTX_ZEROGPU_CLIP_SECONDS", "10")

    result = main._render_with_ltx_zerogpu(
        "Narration script", "Title", "video", "1080p", str(tmp_path),
    )

    predict = next(call for call in calls if call[0] == "predict")
    assert predict[1][6] == 1088
    assert predict[1][7] == 1920
    assert predict[2]["api_name"] == "/generate_video"
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
