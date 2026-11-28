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
    assert main._select_render_source("hf_zerogpu", resolution) == "ai_video_studio"


def test_source_profile_keeps_configured_provider():
    assert main._select_render_source("hf_zerogpu", "source") == "hf_zerogpu"


def test_studio_render_options_enable_upscaling_only_for_target_profiles():
    assert main._studio_render_options("1080p")["upscaling"] is True
    assert main._studio_render_options("source")["upscaling"] is False
