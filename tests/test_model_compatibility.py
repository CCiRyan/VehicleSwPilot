import json

import httpx

from backend import models


def test_thinking_configuration_passed_to_chat(monkeypatch):
    captured = {}
    monkeypatch.setenv("PILOT_CHAT_ENABLE_THINKING", "false")
    monkeypatch.setattr(models, "ChatOpenAI", lambda **kwargs: captured.update(kwargs))
    models.chat_model()
    assert captured["extra_body"] == {"enable_thinking": False}


def test_embedding_sends_strings_to_compatible_service(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.setenv("OPENAI_BASE_URL", "https://example.test/v1")
    monkeypatch.setenv("OPENAI_EMBEDDING_MODEL", "text-embedding-v4")
    monkeypatch.delenv("PILOT_EMBEDDING_BASE_URL", raising=False)
    requests = []

    def handler(request):
        requests.append(json.loads(request.content))
        return httpx.Response(
            200,
            json={
                "object": "list",
                "data": [
                    {"object": "embedding", "index": i, "embedding": [0.1, 0.2]}
                    for i in range(len(requests[-1]["input"]))
                ],
                "model": "test",
                "usage": {"prompt_tokens": 1, "total_tokens": 1},
            },
        )

    factory = models.OpenAIEmbeddings
    monkeypatch.setattr(
        models,
        "OpenAIEmbeddings",
        lambda **kwargs: factory(
            **kwargs, http_client=httpx.Client(transport=httpx.MockTransport(handler))
        ),
    )
    assert models.embedding_model().embed_query("汽车软件") == [0.1, 0.2]
    assert requests[0]["input"] == ["汽车软件"]
    requests.clear()
    assert len(models.embedding_model().embed_documents(["测试文本"] * 25)) == 25
    assert [len(r["input"]) for r in requests] == [10, 10, 5]
