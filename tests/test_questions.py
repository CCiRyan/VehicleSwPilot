from .test_workflow import client, ADMIN
from .test_rag import upload


def test_no_match_uses_general_model_without_fabricated_references(client, monkeypatch):
    import backend.main as main

    monkeypatch.setattr(main, "chat_configured", lambda: True)
    calls = []

    def generate(schema, messages):
        calls.append(messages)
        return {"answer": "边界值测试关注输入范围边界及其附近值。", "citations": []}, {}

    monkeypatch.setattr(main, "structured_call", generate)
    response = client.post(
        "/api/questions",
        headers=ADMIN,
        json={"question": "边界值测试是什么？", "mode": "keyword"},
    )
    assert response.status_code == 200
    assert response.json()["mode"] == "general_model"
    assert response.json()["citations"] == response.json()["references"] == []
    assert "通用大模型" in calls[0][0][1]
    monkeypatch.setattr(
        main,
        "structured_call",
        lambda *args: ({"answer": "回答", "citations": ["K-fake"]}, {}),
    )
    assert (
        client.post(
            "/api/questions",
            headers=ADMIN,
            json={"question": "测试", "mode": "keyword"},
        ).status_code
        == 502
    )


def test_question_auth_empty_evidence_and_offline_sources(client, monkeypatch):
    monkeypatch.delenv("PILOT_CHAT_API_KEY", raising=False)
    assert client.post("/api/questions", json={"question": "需求"}).status_code == 401
    assert (
        client.post(
            "/api/questions", headers=ADMIN, json={"question": "  "}
        ).status_code
        == 422
    )
    assert (
        client.post(
            "/api/questions",
            headers=ADMIN,
            json={"question": "SWR-991", "mode": "keyword"},
        ).json()["mode"]
        == "no_evidence"
    )
    upload(client, "qa.md", "SWR-991 电压采集必须执行边界检查。", category="srs")
    response = client.post(
        "/api/questions", headers=ADMIN, json={"question": "SWR-991", "mode": "keyword"}
    ).json()
    assert response["mode"] == "retrieval_only"
    assert response["references"][0]["source"] == "qa.md"
    assert response["citations"] == []


def test_question_model_receives_evidence_and_rejects_fabricated_citation(
    client, monkeypatch
):
    import backend.main as main

    upload(client, "qa.md", "SWR-991 电压采集必须执行边界检查。", category="srs")
    monkeypatch.setattr(main, "chat_configured", lambda: True)

    def generate(schema, messages):
        import json

        context = json.loads(messages[1][1])
        reference = context["references"][0]
        assert context["question"] == "SWR-991"
        return {
            "answer": "资料要求执行边界检查。",
            "citations": [reference["citation_id"]],
        }, {}

    monkeypatch.setattr(main, "structured_call", generate)
    body = {"question": "SWR-991", "mode": "keyword"}
    response = client.post("/api/questions", headers=ADMIN, json=body)
    assert response.status_code == 200 and response.json()["mode"] == "model"
    monkeypatch.setattr(
        main,
        "structured_call",
        lambda *args: ({"answer": "伪造回答", "citations": ["K-fake"]}, {}),
    )
    assert client.post("/api/questions", headers=ADMIN, json=body).status_code == 502
