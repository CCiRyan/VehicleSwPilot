import pytest
from .test_workflow import client, ADMIN
from backend import workspace_files


def configure(client, tmp_path, monkeypatch):
    monkeypatch.setattr(workspace_files, "WORKSPACE", tmp_path)
    paths = dict(
        root=str(tmp_path),
        documents="docs",
        source="src",
        tests="tests",
        reports="reports",
    )
    assert (
        client.put(
            "/api/workspace/paths", headers=ADMIN, json=dict(version=0, paths=paths)
        ).status_code
        == 200
    )
    return paths


def test_explicit_document_import_and_approved_export(client, tmp_path, monkeypatch):
    configure(client, tmp_path, monkeypatch)
    docs = tmp_path / "docs"
    docs.mkdir()
    (docs / "requirements.md").write_text(
        "VCP-SYS-001 项目需求输入。", encoding="utf-8"
    )
    listing = client.get("/api/workspace/files?scope=documents", headers=ADMIN).json()
    assert listing[0]["path"] == "requirements.md"
    preview = client.get("/api/workspace/files/preview", headers=ADMIN,
                         params=dict(scope="documents", path="requirements.md"))
    assert preview.status_code == 200
    assert preview.json()["content"] == "VCP-SYS-001 项目需求输入。"
    assert len(preview.json()["sha256"]) == 64
    assert client.get("/api/workspace/files/preview", headers=ADMIN,
                      params=dict(scope="documents", path="../outside.md")).status_code == 422
    assert client.get("/api/workspace/files/preview",
                      params=dict(scope="documents", path="requirements.md")).status_code == 401
    result = client.post(
        "/api/workspace/files/import",
        headers=ADMIN,
        json=dict(scope="documents", files=["requirements.md"]),
    )
    assert result.status_code == 200 and len(result.json()["documents"]) == 1
    payload = dict(artifact_id="SRS-001", version=3)
    exported = client.post("/api/workspace/files/export", headers=ADMIN, json=payload)
    assert exported.status_code == 200
    assert (docs / "SRS-001.md").exists()
    assert (
        client.post(
            "/api/workspace/files/export", headers=ADMIN, json=payload
        ).status_code
        == 409
    )
    assert (
        client.post(
            "/api/workspace/files/export",
            headers=ADMIN,
            json=dict(artifact_id="DES-001", version=2),
        ).status_code
        == 422
    )
    assert (
        client.get("/api/evidence/SRS-001", headers=ADMIN).json()[0]["type"]
        == "file_export"
    )


def test_code_import_preserves_source_and_requires_review(
    client, tmp_path, monkeypatch
):
    configure(client, tmp_path, monkeypatch)
    source = tmp_path / "src"
    source.mkdir()
    code = "int add(int a, int b) { return a+b; }\n"
    (source / "sum.c").write_bytes(code.encode())
    result = client.post(
        "/api/workspace/files/import",
        headers=ADMIN,
        json=dict(scope="source", files=["sum.c"]),
    )
    assert result.status_code == 200
    item = result.json()["artifact"]
    assert item["status"] == "draft" and item["ai"] is False
    assert item["structured"]["files"][0]["content"] == code
    assert "用户导入" in item["content"]
    assert (
        client.post(
            "/api/simulation",
            headers=ADMIN,
            json=dict(artifact_id=item["id"], action="compile"),
        ).status_code
        == 409
    )


def test_directory_traversal_external_paths_and_symlinks_blocked(
    client, tmp_path, monkeypatch
):
    configure(client, tmp_path, monkeypatch)
    assert (
        client.post(
            "/api/workspace/files/import",
            headers=ADMIN,
            json=dict(scope="documents", files=["../secret.md"]),
        ).status_code
        == 422
    )
    assert (
        client.put(
            "/api/workspace/paths",
            headers=ADMIN,
            json=dict(
                version=1, paths=dict(root=str(tmp_path.parent), documents="external")
            ),
        ).status_code
        == 200
    )
    assert (
        client.get("/api/workspace/files?scope=documents", headers=ADMIN).status_code
        == 422
    )
