from fastapi.testclient import TestClient

import main


def test_public_worker_surface_hides_api_schema_and_docs(monkeypatch, tmp_path):
    monkeypatch.setenv("RENDER_WORKER_DB", str(tmp_path / "worker.sqlite"))
    with TestClient(main.app) as client:
        assert client.get("/health").status_code == 200
        assert client.get("/openapi.json").status_code == 404
        assert client.get("/docs").status_code == 404
        assert client.get("/redoc").status_code == 404
        assert client.get("/v1/jobs/unknown").status_code == 401
