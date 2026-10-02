import io
import subprocess
import pytest
from .test_workflow import client, ADMIN
from backend import execution


def test_structural_checks_do_not_claim_misra_or_execution():
    result = execution.inspect_candidate(
        {"files": [{"path": "module.c", "content": "int main(void) { strcpy(a,b); }"}]}
    )
    assert result["executed"] is False
    assert result["diagnostics"][0]["line"] == 1
    assert result["diagnostics"][0]["rule"] == "HEURISTIC-STRCPY"
    assert "MISRA" in result["diagnostics"][0]["message"]


def test_executor_fixed_commands_container_limits_and_evidence(monkeypatch):
    monkeypatch.setenv("PILOT_ENABLE_CONTAINER_EXECUTION", "1")
    monkeypatch.setattr(execution.shutil, "which", lambda name: "docker")
    commands = []

    class Process:
        def __init__(self, command, **kwargs):
            commands.append(command)
            self.stdout = io.BytesIO(b"assertions passed\n")
            self.returncode = 0
            assert kwargs["stdin"] == subprocess.DEVNULL

        def wait(self, timeout=None):
            return 0

        def terminate(self):
            self.returncode = -1

    monkeypatch.setattr(execution.subprocess, "Popen", Process)
    monkeypatch.setattr(
        execution.subprocess, "run", lambda command, **kwargs: commands.append(command)
    )
    result = execution.execute_c(
        [{"path": "bms.c", "content": "int value(void) { return 1; }"}],
        "int main(void) { return 0; }",
        "unit_test",
    )
    assert result["status"] == "passed" and result["executed"] is True
    command = commands[0]
    for flag in [
        "--network=none",
        "--read-only",
        "--cap-drop=ALL",
        "--security-opt=no-new-privileges",
        "--pids-limit=64",
        "--memory=256m",
        "--cpus=1",
        "--pull=never",
    ]:
        assert flag in command
    assert (
        command[-1]
        == "gcc -std=c99 -Wall -Wextra -Wconversion -Werror -I/src /src/source.c /src/harness.c -o /tmp/pilot-test && /tmp/pilot-test"
    )
    assert commands[-1][1:3] == ["rm", "-f"]
    assert len(result["source_hash"]) == 64


def test_executor_missing_image_output_bound_and_bad_names(monkeypatch):
    monkeypatch.setenv("PILOT_ENABLE_CONTAINER_EXECUTION", "1")
    monkeypatch.setattr(execution.shutil, "which", lambda name: "docker")

    class Process:
        def __init__(self, *args, **kwargs):
            self.returncode = 125
            self.stdout = io.BytesIO(b"no image")

        def wait(self, timeout=None):
            return self.returncode

        def terminate(self):
            pass

    monkeypatch.setattr(execution.subprocess, "Popen", Process)
    monkeypatch.setattr(execution.subprocess, "run", lambda *args, **kwargs: None)
    result = execution.execute_c([{"path": "test.c", "content": "int x;"}])
    assert result["status"] == "unavailable" and result["executed"] is False
    with pytest.raises(ValueError):
        execution.execute_c([{"path": "../escape.c", "content": "int x;"}])
    Process.__init__ = lambda self, *args, **kwargs: (
        setattr(self, "returncode", 0),
        setattr(self, "stdout", io.BytesIO(b"x" * 70000)),
    )[-1]
    result = execution.execute_c([{"path": "test.c", "content": "int x;"}])
    assert result["status"] == "output_limit" and len(result["stdout"]) == 65536


def test_execution_api_requires_reviews_and_retains_version_evidence(
    client, monkeypatch
):
    import backend.main as main

    assert (
        client.post(
            "/api/simulation", headers=ADMIN, json={"artifact_id": "SRC-001"}
        ).status_code
        == 409
    )
    for item in main.store.all():
        if item["stage"] in ["详细设计", "编码实现"]:
            item["status"] = "approved"
            main.store.save(item)
    monkeypatch.setenv("PILOT_ENABLE_CONTAINER_EXECUTION", "0")
    assert (
        client.post(
            "/api/simulation", headers=ADMIN, json={"artifact_id": "SRC-001"}
        ).status_code
        == 503
    )
    monkeypatch.setattr(
        main,
        "execute_c",
        lambda *args: {
            "status": "passed",
            "action": "compile",
            "executed": True,
            "scope": "compiler check",
            "stdout": "",
            "time": "test",
        },
    )
    result = client.post(
        "/api/simulation", headers=ADMIN, json={"artifact_id": "SRC-001"}
    ).json()
    assert result["artifact_version"] == 4
    evidence = client.get("/api/evidence/SRC-001", headers=ADMIN).json()
    assert evidence[0]["id"] == result["id"]
