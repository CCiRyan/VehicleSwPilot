"""Evidence-only tooling. C execution is allowed only in a constrained Docker container."""

import hashlib
import os
import re
import shutil
import subprocess
import tempfile
import threading
from pathlib import Path
from .store import now


def capabilities():
    return {
        "structural_check": True,
        "docker_available": bool(shutil.which("docker")),
        "container_execution_enabled": os.getenv("PILOT_ENABLE_CONTAINER_EXECUTION")
        == "1",
        "cppcheck_available": bool(shutil.which("cppcheck")),
        "image": os.getenv("PILOT_EXECUTION_IMAGE", "gcc:14"),
        "hardware_simulation": "not_configured",
    }


def inspect_candidate(candidate):
    files = candidate.get("files", [])
    diagnostics = []
    for file in files:
        for line, text in enumerate(file["content"].splitlines(), 1):
            for function in (
                "gets",
                "strcpy",
                "sprintf",
                "malloc",
                "calloc",
                "realloc",
            ):
                if re.search(r"\b" + function + r"\s*\(", text):
                    diagnostics.append(
                        dict(
                            file=file["path"],
                            line=line,
                            severity="warning",
                            rule="HEURISTIC-" + function.upper(),
                            message="使用 "
                            + function
                            + "，需依据项目规则人工核对；不是 MISRA 认证结果。",
                            source="structural-check",
                        )
                    )
    return {
        "status": "inspected" if files else "not_applicable",
        "summary": (
            "完成代码结构提示；未编译、执行或进行 MISRA 认证。"
            if files
            else "本阶段无代码；工具执行不适用。"
        ),
        "diagnostics": diagnostics,
        "capabilities": capabilities(),
        "executed": False,
    }


def execute_c(files, harness="", action="compile"):
    if os.getenv("PILOT_ENABLE_CONTAINER_EXECUTION") != "1":
        raise RuntimeError(
            "容器执行未启用；配置 Docker 后设置 PILOT_ENABLE_CONTAINER_EXECUTION=1。"
        )
    docker = shutil.which("docker")
    if not docker:
        raise RuntimeError("未找到 Docker；没有运行任何生成代码。")
    if action not in ("compile", "unit_test"):
        raise ValueError("只允许 compile 或 unit_test")
    if len(files) > 20 or sum(len(f["content"]) for f in files) + len(harness) > 200000:
        raise ValueError("代码输入超过执行限制")
    sources = [f for f in files if f["path"].endswith(".c")]
    if len(sources) != 1:
        raise ValueError("当前执行器支持一个 C translation unit 及其头文件")
    names = [f["path"] for f in files]
    if len(names) != len(set(names)):
        raise ValueError("文件名重复")
    for filename in names:
        if (
            not re.fullmatch(r"[A-Za-z0-9_-][A-Za-z0-9_.-]*\.(?:c|h)", filename)
            or ".." in filename
        ):
            raise ValueError("无效的源文件名")
    if action == "unit_test" and not harness.strip():
        raise ValueError("单元测试执行需要已评审的 C test harness")
    image = os.getenv("PILOT_EXECUTION_IMAGE", "gcc:14")
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_./:@-]*", image):
        raise ValueError("无效的容器镜像配置")
    with tempfile.TemporaryDirectory(prefix="pilot-exec-") as temporary:
        root = Path(temporary)
        for file in files:
            (
                root / ("source.c" if file["path"].endswith(".c") else file["path"])
            ).write_text(file["content"], encoding="utf-8")
        if action == "unit_test":
            (root / "harness.c").write_text(harness, encoding="utf-8")
        script = "gcc -std=c99 -Wall -Wextra -Wconversion -Werror -I/src -fsyntax-only /src/source.c"
        if action == "unit_test":
            script = "gcc -std=c99 -Wall -Wextra -Wconversion -Werror -I/src /src/source.c /src/harness.c -o /tmp/pilot-test && /tmp/pilot-test"
        name = "pilot-" + hashlib.sha256(os.urandom(32)).hexdigest()[:16]
        command = [
            docker,
            "run",
            "--rm",
            "--pull=never",
            "--name",
            name,
            "--network=none",
            "--read-only",
            "--cap-drop=ALL",
            "--security-opt=no-new-privileges",
            "--pids-limit=64",
            "--memory=256m",
            "--cpus=1",
            "--user=1000:1000",
            "--tmpfs",
            "/tmp:rw,exec,nosuid,size=64m",
            "--mount",
            f"type=bind,source={root.resolve()},target=/src,readonly",
            "--entrypoint",
            "/bin/sh",
            image,
            "-c",
            script,
        ]
        captured = bytearray()
        limit = threading.Event()
        process = None
        try:
            process = subprocess.Popen(
                command,
                stdin=subprocess.DEVNULL,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
            )

            def consume():
                while data := process.stdout.read(4096):
                    captured.extend(data[: max(0, 65536 - len(captured))])
                    if len(captured) >= 65536:
                        limit.set()
                        process.terminate()
                        break

            reader = threading.Thread(target=consume, daemon=True)
            reader.start()
            process.wait(timeout=30)
            reader.join(timeout=2)
            output = captured.decode("utf-8", errors="replace")
            unavailable = process.returncode in (125, 126, 127)
            status = (
                "output_limit"
                if limit.is_set()
                else (
                    "unavailable"
                    if unavailable
                    else "passed" if process.returncode == 0 else "failed"
                )
            )
            result = dict(
                status=status,
                exit_code=process.returncode,
                stdout=output,
                action=action,
                image=image,
                executed=not unavailable,
                time=now(),
                source_hash=hashlib.sha256(
                    "".join(f["content"] for f in files).encode()
                ).hexdigest(),
                harness_hash=hashlib.sha256(harness.encode()).hexdigest(),
                scope=(
                    "编译器检查"
                    if action == "compile"
                    else "提供的 C harness 执行；不代表硬件仿真或覆盖率"
                ),
            )
            return result
        except subprocess.TimeoutExpired:
            if process:
                process.kill()
                process.wait(timeout=5)
            return dict(
                status="timeout",
                action=action,
                image=image,
                executed=True,
                time=now(),
                scope="超过 30 秒限制；没有通过结论",
            )
        finally:
            try:
                subprocess.run(
                    [docker, "rm", "-f", name],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    timeout=10,
                    check=False,
                )
            except (subprocess.SubprocessError, OSError):
                pass
