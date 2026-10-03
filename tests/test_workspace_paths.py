from .test_workflow import client, ADMIN, ENGINEER


def test_directory_settings_authorization_version_and_no_file_operations(
    client, tmp_path
):
    assert client.get("/api/workspace/paths").status_code == 401
    initial = client.get("/api/workspace/paths", headers=ADMIN).json()
    assert initial["version"] == 0
    root = tmp_path / "not-created-project"
    body = {
        "version": 0,
        "paths": {"root": str(root), "documents": "specs", "source": "code"},
    }
    assert (
        client.put("/api/workspace/paths", headers=ENGINEER, json=body).status_code
        == 403
    )
    result = client.put("/api/workspace/paths", headers=ADMIN, json=body)
    assert result.status_code == 200
    assert result.json()["paths"]["documents"] == str(root / "specs")
    assert not root.exists()
    assert client.get("/api/workspace/paths", headers=ENGINEER).json() == result.json()
    assert (
        client.put("/api/workspace/paths", headers=ADMIN, json=body).status_code == 409
    )
    assert any(
        log["event"] == "workspace_paths_updated"
        for log in client.get("/api/logs", headers=ADMIN).json()
    )


def test_windows_paths_normalization_and_invalid_root(client):
    body = {
        "version": 0,
        "paths": {"root": "D:\\Projects\\BMS", "documents": "docs", "source": "src"},
    }
    result = client.put("/api/workspace/paths", headers=ADMIN, json=body)
    assert result.status_code == 200
    assert result.json()["paths"]["source"] == "D:\\Projects\\BMS\\src"
    body["version"] = 1
    for root in ["relative", "https://example.com/project", "D:relative"]:
        body["paths"]["root"] = root
        assert (
            client.put("/api/workspace/paths", headers=ADMIN, json=body).status_code
            == 422
        )
