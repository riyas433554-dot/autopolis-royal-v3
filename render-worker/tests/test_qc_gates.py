import pytest

import main


def test_render_qc_rejects_narration_that_ends_well_before_video():
    qc = {"duration_seconds": 45.0, "width": 1920, "height": 1080}

    with pytest.raises(RuntimeError, match="narration coverage"):
        main._validate_render_qc(qc, voice_duration=27.83)


def test_render_qc_accepts_narration_with_short_outro():
    qc = {"duration_seconds": 45.0, "width": 1920, "height": 1080}

    main._validate_render_qc(qc, voice_duration=43.0)


def test_render_qc_rejects_missing_or_invalid_dimensions():
    with pytest.raises(RuntimeError, match="dimensions"):
        main._validate_render_qc(
            {"duration_seconds": 45.0, "width": 0, "height": 1080},
            voice_duration=45.0,
        )


def test_render_qc_rejects_nonpositive_voice_duration():
    with pytest.raises(RuntimeError, match="narration duration"):
        main._validate_render_qc(
            {"duration_seconds": 45.0, "width": 1920, "height": 1080},
            voice_duration=0,
        )
