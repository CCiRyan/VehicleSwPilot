"""One configurable OpenAI-compatible gateway for chat and embeddings."""

import os
import json
from urllib.parse import urlsplit, urlunsplit
from langchain_openai import ChatOpenAI, OpenAIEmbeddings


class ModelOutputError(ValueError):
    pass


def chat_configured():
    return bool(os.getenv("OPENAI_API_KEY") or os.getenv("PILOT_CHAT_API_KEY"))


def embedding_signature():
    base = (
        os.getenv("PILOT_EMBEDDING_BASE_URL")
        or os.getenv("OPENAI_BASE_URL")
        or "https://api.openai.com/v1"
    )
    parsed = urlsplit(base)
    identity = urlunsplit(
        (
            parsed.scheme,
            (
                parsed.hostname + (":" + str(parsed.port) if parsed.port else "")
                if parsed.hostname
                else parsed.netloc
            ),
            parsed.path.rstrip("/"),
            "",
            "",
        )
    )
    return "|".join(
        [
            identity,
            os.getenv("OPENAI_EMBEDDING_MODEL", "text-embedding-3-small"),
            os.getenv("PILOT_EMBEDDING_DIMENSIONS", ""),
        ]
    )


def chat_model():
    kwargs = dict(
        model=os.getenv("OPENAI_MODEL", "gpt-4.1-mini"),
        api_key=os.getenv("PILOT_CHAT_API_KEY") or os.getenv("OPENAI_API_KEY"),
        temperature=0.1,
        timeout=float(os.getenv("PILOT_MODEL_TIMEOUT", "90")),
        max_retries=1,
    )
    base = os.getenv("PILOT_CHAT_BASE_URL") or os.getenv("OPENAI_BASE_URL")
    if base:
        kwargs["base_url"] = base
    thinking = os.getenv("PILOT_CHAT_ENABLE_THINKING", "").strip().lower()
    if thinking:
        if thinking not in ("true", "false"):
            raise ValueError("PILOT_CHAT_ENABLE_THINKING 必须为 true 或 false")
        kwargs["extra_body"] = {"enable_thinking": thinking == "true"}
    return ChatOpenAI(**kwargs)


def embedding_model():
    key = os.getenv("PILOT_EMBEDDING_API_KEY") or os.getenv("OPENAI_API_KEY")
    if not key:
        raise ValueError(
            "向量入库需要 OPENAI_API_KEY 或 PILOT_EMBEDDING_API_KEY；未配置时可使用关键词检索。"
        )
    kwargs = dict(
        model=os.getenv("OPENAI_EMBEDDING_MODEL", "text-embedding-3-small"),
        api_key=key,
        request_timeout=float(os.getenv("PILOT_MODEL_TIMEOUT", "90")),
        max_retries=1,
        # Compatible services may reject OpenAI token arrays; chunks are already bounded.
        check_embedding_ctx_length=False,
    )
    base = os.getenv("PILOT_EMBEDDING_BASE_URL") or os.getenv("OPENAI_BASE_URL")
    batch_size = int(os.getenv("PILOT_EMBEDDING_BATCH_SIZE", "64"))
    if batch_size < 1 or batch_size > 2048:
        raise ValueError("PILOT_EMBEDDING_BATCH_SIZE 必须在 1 到 2048 之间")
    if kwargs["model"] == "text-embedding-v4":
        batch_size = min(batch_size, 10)
    kwargs["chunk_size"] = batch_size
    if base:
        kwargs["base_url"] = base
    if os.getenv("PILOT_EMBEDDING_DIMENSIONS"):
        kwargs["dimensions"] = int(os.environ["PILOT_EMBEDDING_DIMENSIONS"])
    return OpenAIEmbeddings(**kwargs)


def structured_call(schema, messages):
    method = os.getenv("PILOT_STRUCTURED_METHOD", "function_calling")
    if method not in ("function_calling", "json_schema", "json_mode"):
        raise ValueError(
            "PILOT_STRUCTURED_METHOD 必须为 function_calling、json_schema 或 json_mode"
        )
    if method == "json_mode":
        messages = [
            *messages,
            (
                "human",
                "请仅输出符合以下 JSON Schema 的 JSON 对象："
                + json.dumps(schema.model_json_schema(), ensure_ascii=False),
            ),
        ]
    result = (
        chat_model()
        .with_structured_output(schema, method=method, include_raw=True)
        .invoke(messages)
    )
    parsed = result.get("parsed")
    if parsed is None:
        raise ModelOutputError("模型拒绝任务或返回不符合工件格式的输出")
    usage = getattr(result.get("raw"), "usage_metadata", None) or {}
    return parsed.model_dump(), usage
