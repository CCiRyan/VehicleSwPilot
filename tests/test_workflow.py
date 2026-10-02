import io
import importlib
import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("PILOT_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("PILOT_AUTH_TOKEN", "test-reviewer")
    monkeypatch.setenv("PILOT_SOFTWARE_TOKEN", "test-engineer")
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    import backend.main as main

    importlib.reload(main)
    with TestClient(main.app) as c:
        yield c


ADMIN = {"Authorization": "Bearer test-reviewer"}
ENGINEER = {"Authorization": "Bearer test-engineer"}


def test_auth_and_roles(client):
    assert client.get("/api/artifacts").status_code == 401
    assert (
        client.post(
            "/api/artifacts/DES-001/review",
            headers=ENGINEER,
            json={"version": 2, "approved": True, "comment": "核对通过"},
        ).status_code
        == 403
    )
    assert (
        client.put(
            "/api/agents/coding", headers=ENGINEER, json={"prompt": "跳过人工评审"}
        ).status_code
        == 403
    )
    assert (
        client.get("/api/simulation/capabilities", headers=ADMIN).json()[
            "structural_check"
        ]
        is True
    )


def test_stage_gate_and_optimistic_lock(client):
    assert (
        client.post(
            "/api/runs",
            headers=ADMIN,
            json={
                "stage": "编码实现",
                "artifact_id": "SRC-001",
                "instruction": "生成代码",
            },
        ).status_code
        == 409
    )
    assert (
        client.put(
            "/api/artifacts/DES-001",
            headers=ADMIN,
            json={"version": 1, "content": "stale"},
        ).status_code
        == 409
    )
    assert (
        client.post(
            "/api/artifacts/DES-001/review",
            headers=ADMIN,
            json={"version": 2, "approved": True, "comment": "    "},
        ).status_code
        == 422
    )
    assert (
        client.post(
            "/api/artifacts/DES-001/review",
            headers=ADMIN,
            json={
                "version": 2,
                "approved": True,
                "comment": "依据 SWR-002 核对边界条件",
            },
        ).status_code
        == 200
    )
    assert (
        client.post(
            "/api/artifacts/SRC-001/review",
            headers=ADMIN,
            json={"version": 4, "approved": True, "comment": "人工核对"},
        ).status_code
        == 200
    )
    assert (
        client.put(
            "/api/artifacts/DES-001",
            headers=ADMIN,
            json={"version": 2, "content": "设计变更：阈值 4260 mV"},
        ).status_code
        == 200
    )
    items = client.get("/api/artifacts", headers=ADMIN).json()
    assert next(a for a in items if a["id"] == "SRC-001")["status"] == "draft"
    assert (
        client.post(
            "/api/runs",
            headers=ADMIN,
            json={
                "stage": "编码实现",
                "artifact_id": "SRC-001",
                "instruction": "生成代码",
            },
        ).status_code
        == 409
    )


def test_interrupt_resume_replay_and_stale_output(client):
    run = client.post(
        "/api/runs",
        headers=ADMIN,
        json={
            "stage": "详细设计",
            "artifact_id": "DES-001",
            "instruction": "补充边界设计",
        },
    ).json()
    assert run["status"] == "pending"
    assert run["mode"] == "demo"
    assert "AI 生成，需人工评审" in run["output"]
    endpoint = f"/api/artifacts/{run['artifact_id']}/review"
    decision = {"version": 1, "approved": True, "comment": "已核对候选设计"}
    assert client.post(endpoint, headers=ADMIN, json=decision).status_code == 200
    assert client.post(endpoint, headers=ADMIN, json=decision).status_code == 409
    second = client.post(
        "/api/runs",
        headers=ADMIN,
        json={"stage": "详细设计", "artifact_id": "DES-001", "instruction": "修订"},
    ).json()
    assert (
        client.put(
            f"/api/artifacts/{second['artifact_id']}",
            headers=ADMIN,
            json={"version": 1, "content": "人工修订新版本"},
        ).status_code
        == 200
    )
    assert (
        client.post(
            f"/api/artifacts/{second['artifact_id']}/review",
            headers=ADMIN,
            json={"version": 1, "approved": True, "comment": "尝试恢复旧运行"},
        ).status_code
        == 409
    )
    assert (
        client.post(
            f"/api/artifacts/{second['artifact_id']}/review",
            headers=ADMIN,
            json={"version": 2, "approved": True, "comment": "评审人工修订的新版本"},
        ).status_code
        == 200
    )
    import backend.main as main

    assert main.store.get_run(second["run_id"])["status"] == "superseded"


def test_report_formats_and_upload_boundary(client):
    from docx import Document
    from pypdf import PdfReader

    word = client.get("/api/reports/review?format=docx", headers=ADMIN)
    assert word.status_code == 200
    assert any("草稿" in p.text for p in Document(io.BytesIO(word.content)).paragraphs)
    pdf = client.get("/api/reports/safety?format=pdf", headers=ADMIN)
    assert pdf.status_code == 200
    assert len(PdfReader(io.BytesIO(pdf.content)).pages) > 0
    assert (
        client.post(
            "/api/knowledge", headers=ADMIN, files={"file": ("unsafe.exe", b"code")}
        ).status_code
        == 422
    )
    assert (
        client.post(
            "/api/knowledge",
            headers=ADMIN,
            files={"file": ("document.md", "软件需求测试".encode())},
        ).status_code
        == 422
    )
    assert (
        client.post(
            "/api/knowledge/search", headers=ADMIN, json={"query": "过压"}
        ).json()
        == []
    )


def test_checkpoint_survives_restart(tmp_path, monkeypatch):
    monkeypatch.setenv("PILOT_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("PILOT_AUTH_TOKEN", "test-reviewer")
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    import backend.main as main

    importlib.reload(main)
    with TestClient(main.app) as c:
        run = c.post(
            "/api/runs",
            headers=ADMIN,
            json={
                "stage": "详细设计",
                "artifact_id": "DES-001",
                "instruction": "验证持久化暂停",
            },
        ).json()
    with TestClient(main.app) as c:
        response = c.post(
            f"/api/artifacts/{run['artifact_id']}/review",
            headers=ADMIN,
            json={"version": 1, "approved": False, "comment": "重启后驳回"},
        )
        assert response.status_code == 200
        assert response.json()["status"] == "rejected"


def test_faiss_ingest_source_retrieval_delete_and_trace_edit(client, monkeypatch):
    import backend.main as main

    class OfflineEmbeddings:
        def embed_documents(self, texts):
            return [[1.0, 0.0] if "过压" in text else [0.0, 1.0] for text in texts]

        def embed_query(self, text):
            return [1.0, 0.0] if "过压" in text else [0.0, 1.0]

    monkeypatch.setattr(main.knowledge, "embeddings", lambda: OfflineEmbeddings())
    first = client.post(
        "/api/knowledge",
        headers=ADMIN,
        files={"file": ("voltage.md", "SWR-002 过压检测规范。".encode())},
    )
    assert first.status_code == 200
    second = client.post(
        "/api/knowledge",
        headers=ADMIN,
        files={"file": ("temperature.md", "温度监测规范。".encode())},
    )
    assert second.status_code == 200
    main.knowledge.reload()
    hits = client.post(
        "/api/knowledge/search", headers=ADMIN, json={"query": "过压检测"}
    ).json()
    assert hits[0]["source"] == "voltage.md"
    assert hits[0]["page"] == 1 and hits[0]["chunk"] == 1
    assert hits[0]["score"] > 0.99
    assert (
        client.delete("/api/knowledge/" + first.json()["id"], headers=ADMIN).status_code
        == 200
    )
    hits = client.post(
        "/api/knowledge/search", headers=ADMIN, json={"query": "过压检测"}
    ).json()
    assert all(h["source"] != "voltage.md" for h in hits)
    rows = client.get("/api/traces", headers=ADMIN).json()
    missing = next(r for r in rows if r["req"] == "SWR-003")
    missing["test"] = "TC-CAN-001"
    updated = client.put("/api/traces/" + missing["key"], headers=ADMIN, json=missing)
    assert updated.status_code == 200 and updated.json()["status"] == "完整"
    assert (
        client.put(
            "/api/traces/" + missing["key"], headers=ENGINEER, json=missing
        ).status_code
        == 403
    )


def test_create_stage_artifact_and_revoke_downstream(client):
    response = client.post(
        "/api/artifacts",
        headers=ADMIN,
        json={
            "name": "新增系统需求",
            "stage": "系统需求",
            "content": "新增安全状态要求",
        },
    )
    assert response.status_code == 200
    assert response.json()["status"] == "draft" and response.json()["ai"] is False
    artifacts = client.get("/api/artifacts", headers=ADMIN).json()
    assert next(a for a in artifacts if a["id"] == "SRS-001")["status"] == "draft"
    assert (
        client.post(
            "/api/runs",
            headers=ADMIN,
            json={"stage": "详细设计", "artifact_id": "DES-001", "instruction": "生成"},
        ).status_code
        == 409
    )
