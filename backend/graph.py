"""Durable stage-specific workflow with bounded repair and human gates."""

import sqlite3
from typing import TypedDict
from langgraph.graph import StateGraph, START, END
from langgraph.types import interrupt
from langgraph.checkpoint.sqlite import SqliteSaver
from . import agents
from .agents import DEFAULT_PROMPT, STAGE_AGENTS
from .models import chat_configured
from .execution import inspect_candidate


class State(TypedDict, total=False):
    stage: str
    asil: str
    namespace: str
    instruction: str
    artifact: dict
    upstream: list
    baseline: list
    references: list
    prompt: str
    candidate: dict
    output: str
    safety: str
    safety_report: dict
    execution: dict
    events: list
    usage: dict
    attempts: int
    repair_errors: list
    approved: bool
    mode: str


def build_graph(path):
    connection = sqlite3.connect(path, check_same_thread=False)
    saver = SqliteSaver(connection)

    def event(state, node, detail):
        return [*state.get("events", []), {"agent": node, "detail": detail}]

    def dispatch(state):
        return {
            "mode": "model" if chat_configured() else "demo",
            "attempts": 0,
            "events": event(
                state,
                "orchestrator",
                "固定上游版本与知识引用，选择 " + STAGE_AGENTS[state["stage"]],
            ),
        }

    def specialist(state):
        payload, usage = agents.generate_candidate(state)
        history = [*state.get("usage", {}).get("specialist_attempts", []), usage]
        total = {
            key: sum(u.get(key, 0) for u in history)
            for key in ("input_tokens", "output_tokens", "total_tokens")
        }
        return {
            "candidate": payload,
            "usage": {
                **state.get("usage", {}),
                "specialist": total,
                "specialist_attempts": history,
            },
            "attempts": state.get("attempts", 0) + 1,
            "events": event(state, STAGE_AGENTS[state["stage"]], "生成结构化候选工件"),
        }

    def validate(state):
        errors = agents.validate_candidate(state["candidate"], state)
        if errors and (state["mode"] == "demo" or state["attempts"] >= 2):
            raise ValueError("工件契约校验失败：" + "；".join(errors))
        return {
            "repair_errors": errors,
            "events": event(
                state,
                "contract_validation",
                (
                    "；".join(errors)
                    if errors
                    else "ASIL、输出标识、追溯来源和知识引用已校验"
                ),
            ),
        }

    def safety(state):
        report, usage = agents.analyze_safety(state)
        return {
            "safety_report": report,
            "safety": "\n".join(
                f'[{f["severity"]}] {f["code"]}: {f["message"]} / {f["evidence"]}'
                for f in report["findings"]
            ),
            "usage": {**state.get("usage", {}), "safety": usage},
            "events": event(
                state, "safety", f'形成 {len(report["findings"])} 条人工评审发现'
            ),
        }

    def execution(state):
        result = inspect_candidate(state["candidate"])
        return {
            "execution": result,
            "output": agents.render_candidate(state["candidate"], state["mode"]),
            "events": event(state, "simulation", result["summary"]),
        }

    def review(state):
        decision = interrupt(
            {
                "type": "human_review",
                "output": state["output"],
                "structured": state["candidate"],
                "safety": state["safety_report"],
                "execution": state["execution"],
                "baseline": state.get("baseline", []),
                "stage": state["stage"],
            }
        )
        return {
            "approved": bool(decision["approved"]),
            "events": event(
                state,
                "human_review",
                "人工通过" if decision["approved"] else "人工驳回",
            ),
        }

    builder = StateGraph(State)
    builder.add_node("orchestrator", dispatch)
    for agent in STAGE_AGENTS.values():
        builder.add_node(agent, specialist)
        builder.add_edge(agent, "contract_validation")
    builder.add_node("contract_validation", validate)
    builder.add_node("safety", safety)
    builder.add_node("simulation", execution)
    builder.add_node("human_review", review)
    builder.add_node(
        "orchestrator_repair",
        lambda s: {
            "events": event(s, "orchestrator", "将契约错误回传专业 Agent，最多修订一次")
        },
    )
    builder.add_edge(START, "orchestrator")
    builder.add_conditional_edges(
        "orchestrator",
        lambda s: STAGE_AGENTS[s["stage"]],
        {a: a for a in STAGE_AGENTS.values()},
    )
    builder.add_conditional_edges(
        "contract_validation",
        lambda s: "repair" if s["repair_errors"] else "safety",
        {"repair": "orchestrator_repair", "safety": "safety"},
    )
    builder.add_conditional_edges(
        "orchestrator_repair",
        lambda s: STAGE_AGENTS[s["stage"]],
        {a: a for a in STAGE_AGENTS.values()},
    )
    builder.add_edge("safety", "simulation")
    builder.add_edge("simulation", "human_review")
    builder.add_edge("human_review", END)
    return builder.compile(checkpointer=saver), connection
