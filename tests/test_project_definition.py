from .test_workflow import client, ADMIN, ENGINEER
from backend.store import Store


def test_definition_persists_without_approving_artifacts(client):
    from backend import main
    before = client.get("/api/artifacts", headers=ADMIN).json()
    assert client.get("/api/workspace/definition").status_code == 401
    initial = client.get("/api/workspace/definition", headers=ENGINEER).json()
    assert initial["version"] == 0
    assert initial["definition"]["asil"] == "待确认"
    payload = dict(version=0, definition=dict(fullName="VCP", scope="用户提供功能"))
    assert client.put("/api/workspace/definition", headers=ENGINEER, json=payload).status_code == 403
    saved = client.put("/api/workspace/definition", headers=ADMIN, json=payload)
    assert saved.status_code == 200
    assert saved.json()["version"] == 1
    assert client.put("/api/workspace/definition", headers=ADMIN, json=payload).status_code == 409
    assert client.get("/api/artifacts", headers=ADMIN).json() == before
    reopened = Store(main.DATA / "pilot.sqlite")
    try:
        row = reopened.conn.execute("SELECT data FROM workspace_settings WHERE id='definition'").fetchone()
        assert '用户提供功能' in row[0]
    finally:
        reopened.conn.close()


def test_definition_rejects_invalid_safety_level_and_large_input(client):
    for definition in [dict(asil="ASIL Z"), dict(scope="x" * 3001)]:
        assert client.put("/api/workspace/definition", headers=ADMIN,
                          json=dict(version=0, definition=definition)).status_code == 422


def test_reports_use_project_facts_and_only_current_version_evidence(client):
    import io
    from docx import Document
    from backend import main
    client.put("/api/workspace/definition", headers=ADMIN,
               json=dict(version=0, definition=dict(fullName="用户定义控制器", asil="QM")))
    main.store.evidence(dict(id="old-run", type="execution", artifact_id="UT-001",
                            artifact_version=0, status="passed", marker="OLD-PASSED"))
    main.store.evidence(dict(id="new-run", type="execution", artifact_id="UT-001",
                            artifact_version=1, status="not_executed", marker="CURRENT-NOT-EXECUTED"))
    report = client.get("/api/reports/test?format=docx", headers=ADMIN)
    assert report.status_code == 200
    text = "\n".join(p.text for p in Document(io.BytesIO(report.content)).paragraphs)
    assert "用户定义控制器" in text and "安全等级：QM" in text
    assert "CURRENT-NOT-EXECUTED" in text and "OLD-PASSED" not in text
