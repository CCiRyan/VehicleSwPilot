import json
import sqlite3
import httpx
import pytest
from .test_workflow import client, ADMIN, ENGINEER
from backend import agents, models
from backend.store import STAGES


@pytest.mark.parametrize("stage", STAGES)
def test_each_stage_has_real_contract_and_baseline(client, stage, monkeypatch):
    import backend.main as main

    for previous in STAGES[: STAGES.index(stage)]:
        if not any(a["stage"] == previous for a in main.store.all()):
            main.store.save(
                dict(
                    id="BASE-" + str(STAGES.index(previous)),
                    name=previous + "基线",
                    stage=previous,
                    version=1,
                    status="approved",
                    ai=False,
                    content="已评审阶段输入，关联 SWR-002。",
                )
            )
    for item in main.store.all():
        if item["stage"] in STAGES[: STAGES.index(stage)]:
            item["status"] = "approved"
            main.store.save(item)
    source = next((a for a in main.store.all() if a["stage"] == stage), None)
    if not source:
        source = client.post(
            "/api/artifacts",
            headers=ADMIN,
            json={
                "name": stage + "输入",
                "stage": stage,
                "content": "关联 SWR-002；参数沿用上游基线。",
            },
        ).json()
    observed = []
    monkeypatch.setenv("PILOT_CHAT_API_KEY", "fake-test-key")

    def call(schema, messages):
        observed.append((schema, messages))
        if schema is agents.SafetyOutput:
            return {
                "summary": "独立检查",
                "findings": [
                    dict(
                        severity="info",
                        code="PEER_REVIEW",
                        message="需确认故障恢复条件",
                        evidence=source["id"],
                        recommendation="核对基线",
                    )
                ],
            }, {"output_tokens": 40}
        state = json.loads(messages[-1][1])
        state["mode"] = "demo"
        candidate = agents.demo_candidate(state)
        if state["references"]:
            candidate["citations"] = [
                dict(
                    citation_id=state["references"][0]["citation_id"], reason="工程参考"
                )
            ]
        return schema.model_validate(candidate).model_dump(), {"output_tokens": 100}

    monkeypatch.setattr(agents, "structured_call", call)
    response = client.post(
        "/api/runs",
        headers=ADMIN,
        json={
            "stage": stage,
            "artifact_id": source["id"],
            "instruction": "生成对应阶段候选工件",
        },
    )
    assert response.status_code == 200, response.text
    result = response.json()
    assert result["mode"] == "model"
    assert observed[0][0] is agents.CATALOG[stage][1]
    assert observed[1][0] is agents.SafetyOutput
    item = main.store.get(result["artifact_id"])
    assert item["structured"]["asil"] == "B"
    assert agents.output_ids(item["structured"])
    assert all(
        a["status"] == "approved" for a in json.loads(observed[0][1][-1][1])["upstream"]
    )
    assert (
        len(result["baseline"])
        == len(json.loads(observed[0][1][-1][1])["upstream"]) + 1
    )
    run = client.get("/api/runs/" + result["run_id"], headers=ADMIN).json()
    assert run["usage"]["specialist"]["output_tokens"] == 100
    assert [e["agent"] for e in run["events"]] == [
        "orchestrator",
        agents.STAGE_AGENTS[stage],
        "contract_validation",
        "safety",
        "simulation",
    ]
    approved = client.post(
        "/api/artifacts/" + result["artifact_id"] + "/review",
        headers=ADMIN,
        json={"version": 1, "approved": True, "comment": "核对基线与候选工件"},
    )
    assert approved.status_code == 200, approved.text
    assert any(
        row.get("origin_artifact") == result["artifact_id"]
        for row in client.get("/api/traces", headers=ADMIN).json()
    )


def test_hallucinated_citation_repairs_once_or_fails_without_artifact(
    client, monkeypatch
):
    import backend.main as main

    monkeypatch.setenv("PILOT_CHAT_API_KEY", "fake-test-key")
    attempts = []

    def generate(state):
        attempts.append(state.get("repair_errors", []))
        candidate = agents.demo_candidate(state)
        if len(attempts) == 1:
            candidate["citations"] = [
                dict(citation_id="fabricated-reference", reason="invented")
            ]
        return candidate, {}

    monkeypatch.setattr(agents, "generate_candidate", generate)
    monkeypatch.setattr(
        agents, "analyze_safety", lambda s: ({"summary": "test", "findings": []}, {})
    )
    result = client.post(
        "/api/runs",
        headers=ADMIN,
        json={"stage": "详细设计", "artifact_id": "DES-001", "instruction": "设计"},
    ).json()
    assert len(attempts) == 2 and "引用 ID" in attempts[1][0]
    assert (
        client.get("/api/runs/" + result["run_id"], headers=ADMIN).json()["attempts"]
        == 2
    )
    count = len(main.store.all())

    def always_invalid(state):
        candidate = agents.demo_candidate(state)
        candidate["asil"] = "D"
        return candidate, {}

    monkeypatch.setattr(agents, "generate_candidate", always_invalid)
    response = client.post(
        "/api/runs",
        headers=ADMIN,
        json={"stage": "详细设计", "artifact_id": "DES-001", "instruction": "设计"},
    )
    assert response.status_code == 502 and len(main.store.all()) == count
    assert client.get("/api/runs", headers=ADMIN).json()[0]["status"] == "failed"


def test_baseline_change_and_manual_edit_invalidate_structured_data(client):
    import backend.main as main

    result = client.post(
        "/api/runs",
        headers=ADMIN,
        json={"stage": "详细设计", "artifact_id": "DES-001", "instruction": "补充设计"},
    ).json()
    assert (
        client.put(
            "/api/artifacts/DES-001",
            headers=ADMIN,
            json={"version": 2, "content": "改变输入参数"},
        ).status_code
        == 200
    )
    assert (
        client.post(
            "/api/artifacts/" + result["artifact_id"] + "/review",
            headers=ADMIN,
            json={"version": 1, "approved": True, "comment": "旧基线"},
        ).status_code
        == 409
    )
    assert (
        client.put(
            "/api/artifacts/" + result["artifact_id"],
            headers=ADMIN,
            json={"version": 1, "content": "人工修订"},
        ).status_code
        == 200
    )
    item = main.store.get(result["artifact_id"])
    assert (
        "structured" not in item
        and "baseline" not in item
        and "safety_report" not in item
    )


def test_error_finding_blocks_approval_and_independent_safety_is_saved(
    client, monkeypatch
):
    monkeypatch.setattr(
        agents,
        "analyze_safety",
        lambda s: (
            {
                "summary": "发现高风险",
                "findings": [
                    dict(
                        severity="error",
                        code="UNSAFE",
                        message="缺少安全状态",
                        evidence="DES-001",
                        recommendation="修订",
                    )
                ],
            },
            {},
        ),
    )
    result = client.post(
        "/api/runs",
        headers=ADMIN,
        json={"stage": "详细设计", "artifact_id": "DES-001", "instruction": "设计"},
    ).json()
    assert (
        client.post(
            "/api/artifacts/" + result["artifact_id"] + "/review",
            headers=ADMIN,
            json={"version": 1, "approved": True, "comment": "通过"},
        ).status_code
        == 409
    )
    # Independent check on an ordinary artifact is also persisted as evidence.
    response = client.post(
        "/api/agents/safety/analyze", headers=ADMIN, json={"artifact_id": "DES-001"}
    )
    assert response.status_code == 200
    assert (
        client.get("/api/evidence/DES-001", headers=ADMIN).json()[0]["type"]
        == "safety_review"
    )


def test_real_langchain_structured_gateway_with_mock_http(monkeypatch):
    from langchain_openai import ChatOpenAI

    state = dict(
        stage="软件需求",
        artifact={"id": "SYS-001", "content": "系统基线"},
        namespace="TEST",
        asil="B",
        mode="demo",
    )
    payload = agents.demo_candidate(state)
    requests = []

    def handler(request):
        body = json.loads(request.content)
        requests.append(body)
        tool = body["tools"][0]["function"]["name"]
        return httpx.Response(
            200,
            json={
                "id": "chatcmpl-test",
                "object": "chat.completion",
                "created": 1,
                "model": "compatible-model",
                "choices": [
                    {
                        "index": 0,
                        "message": {
                            "role": "assistant",
                            "content": None,
                            "tool_calls": [
                                {
                                    "id": "call-test",
                                    "type": "function",
                                    "function": {
                                        "name": tool,
                                        "arguments": json.dumps(payload),
                                    },
                                }
                            ],
                        },
                        "finish_reason": "tool_calls",
                    }
                ],
                "usage": {
                    "prompt_tokens": 10,
                    "completion_tokens": 20,
                    "total_tokens": 30,
                },
            },
        )

    gateway = ChatOpenAI(
        model="compatible-model",
        api_key="test",
        base_url="https://compatible.example/v1",
        http_client=httpx.Client(transport=httpx.MockTransport(handler)),
        max_retries=0,
    )
    monkeypatch.setattr(models, "chat_model", lambda: gateway)
    parsed, usage = models.structured_call(
        agents.RequirementsOutput, [("system", "按契约输出"), ("human", "软件需求")]
    )
    assert parsed["software_requirements"][0]["id"].startswith("SWR-")
    assert requests[0]["tool_choice"]["function"]["name"] == "RequirementsOutput"
    assert usage["output_tokens"] == 20


def test_embedding_signature_uses_actual_gateway_without_secret(monkeypatch):
    monkeypatch.setenv("PILOT_EMBEDDING_BASE_URL", "")
    monkeypatch.setenv(
        "OPENAI_BASE_URL", "https://username:secret@gateway.example/v1/?api_key=secret"
    )
    signature = models.embedding_signature()
    assert signature.startswith("https://gateway.example/v1|")
    assert "secret" not in signature and "username" not in signature


def test_code_file_edit_retains_contract_and_requires_new_review(client):
    import backend.main as main

    item = main.store.get("DES-001")
    item["status"] = "approved"
    main.store.save(item)
    run = client.post(
        "/api/runs",
        headers=ADMIN,
        json={
            "stage": "编码实现",
            "artifact_id": "SRC-001",
            "instruction": "生成 C 文件",
        },
    ).json()
    identifier = run["artifact_id"]
    before = main.store.get(identifier)
    filename = before["structured"]["files"][0]["path"]
    response = client.put(
        f"/api/artifacts/{identifier}/files/{filename}",
        headers=ENGINEER,
        json={
            "version": 1,
            "content": "#include <stdint.h>\nuint16_t ReadValue(void) { return 0U; }",
        },
    )
    assert response.status_code == 200
    item = response.json()
    assert item["version"] == 2 and item["status"] == "draft"
    assert "ReadValue" in item["structured"]["files"][0]["content"]
    assert "ReadValue" in item["content"] and item["baseline"] == before["baseline"]
    assert "run_id" not in item
    assert main.store.get_run(run["run_id"])["status"] == "superseded"
    assert (
        client.put(
            f"/api/artifacts/{identifier}/files/{filename}",
            headers=ENGINEER,
            json={"version": 1, "content": "stale"},
        ).status_code
        == 409
    )
    assert (
        client.post(
            "/api/simulation", headers=ADMIN, json={"artifact_id": identifier}
        ).status_code
        == 409
    )
    assert (
        client.post(
            f"/api/artifacts/{identifier}/review",
            headers=ADMIN,
            json={"version": 2, "approved": True, "comment": "已核对人工修订代码"},
        ).status_code
        == 200
    )


def test_harness_edit_keeps_test_cases_and_old_execution_evidence_stays_historical(
    client,
):
    import backend.main as main

    for item in main.store.all():
        if item["stage"] in STAGES[:5]:
            item["status"] = "approved"
            main.store.save(item)
    run = client.post(
        "/api/runs",
        headers=ADMIN,
        json={"stage": "单元测试", "artifact_id": "UT-001", "instruction": "设计测试"},
    ).json()
    identifier = run["artifact_id"]
    before = main.store.get(identifier)
    response = client.put(
        f"/api/artifacts/{identifier}/harness",
        headers=ADMIN,
        json={"version": 1, "content": "int main(void) { return 0; }"},
    )
    assert response.status_code == 200
    assert (
        response.json()["structured"]["test_cases"]
        == before["structured"]["test_cases"]
    )
    assert response.json()["structured"]["test_harness"].startswith("int main")
    assert response.json()["status"] == "draft"


def test_independent_safety_error_also_blocks_manual_artifact_review(
    client, monkeypatch
):
    import backend.main as main

    monkeypatch.setattr(
        main,
        "analyze_safety",
        lambda state: (
            {
                "summary": "错误发现",
                "findings": [
                    dict(
                        severity="error",
                        code="UNSAFE",
                        message="缺少安全响应",
                        evidence="DES-001",
                        recommendation="修订",
                    )
                ],
            },
            {},
        ),
    )
    assert (
        client.post(
            "/api/agents/safety/analyze", headers=ADMIN, json={"artifact_id": "DES-001"}
        ).status_code
        == 200
    )
    assert (
        client.post(
            "/api/artifacts/DES-001/review",
            headers=ADMIN,
            json={"version": 2, "approved": True, "comment": "不能忽略独立检查"},
        ).status_code
        == 409
    )
    assert (
        client.put(
            "/api/artifacts/DES-001",
            headers=ADMIN,
            json={"version": 2, "content": "新版本修订"},
        ).status_code
        == 200
    )
    assert (
        client.post(
            "/api/artifacts/DES-001/review",
            headers=ADMIN,
            json={
                "version": 3,
                "approved": True,
                "comment": "旧版本发现不应用于新版本",
            },
        ).status_code
        == 200
    )
