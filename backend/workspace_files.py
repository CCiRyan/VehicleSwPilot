"""Explicit bounded file operations inside this repository; no automatic sync."""

import hashlib
import os
import re
from pathlib import Path

WORKSPACE = Path(__file__).resolve().parent.parent
ALLOWED = {
    "documents": {".md", ".txt", ".pdf", ".docx"},
    "source": {".c", ".h"},
    "tests": {".c", ".h", ".md", ".txt"},
    "reports": {".pdf", ".docx", ".md"},
}
BLOCKED = {
    ".git",
    ".env",
    ".venv",
    "node_modules",
    "backend",
    ".tools",
    "dist",
    "test-results",
    "playwright-report",
}


def directory(paths, scope):
    if scope not in ALLOWED:
        raise ValueError("无效目录类别")
    target = Path(paths[scope])
    trusted = WORKSPACE.resolve()
    try:
        relative = target.resolve().relative_to(trusted)
    except ValueError:
        raise ValueError(
            "当前文件操作仅允许工程目录内路径；外部路径仍可配置但不会被访问"
        )
    if any(p in BLOCKED or p.startswith(".") for p in relative.parts):
        raise ValueError("不能访问内部或隐藏目录")
    current = trusted
    for part in target.absolute().relative_to(trusted).parts:
        current = current / part
        if current.is_symlink() or (
            hasattr(current, "is_junction") and current.is_junction()
        ):
            raise ValueError("目录不能包含符号链接或目录联接")
    return target.resolve()


def selected_file(paths, scope, relative):
    root = directory(paths, scope)
    if "\\" in relative or any(
        p in ("..", ".") or p.startswith(".") for p in relative.split("/")
    ):
        raise ValueError("文件路径包含非法部分")
    target = root / relative
    try:
        target.resolve().relative_to(root)
    except ValueError:
        raise ValueError("文件路径不能越出配置目录")
    if target.suffix.lower() not in ALLOWED[scope]:
        raise ValueError("不支持的文件类型")
    current = target
    while current != root:
        if current.is_symlink() or (
            hasattr(current, "is_junction") and current.is_junction()
        ):
            raise ValueError("不读取链接文件")
        current = current.parent
    if not target.is_file():
        raise FileNotFoundError("文件不存在")
    if target.stat().st_size > 20 * 1024 * 1024:
        raise ValueError("文件超过 20 MB")
    return target


def list_files(paths, scope):
    root = directory(paths, scope)
    files = []
    if not root.exists():
        return files
    visited = 0
    for current, dirs, names in os.walk(root, followlinks=False):
        visited += 1
        if visited > 300:
            break
        rel = Path(current).relative_to(root)
        dirs[:] = (
            [
                d
                for d in sorted(dirs)
                if not d.startswith(".")
                and d not in BLOCKED
                and not (Path(current) / d).is_symlink()
                and not (
                    hasattr(Path(current) / d, "is_junction")
                    and (Path(current) / d).is_junction()
                )
            ]
            if len(rel.parts) < 6
            else []
        )
        for name in sorted(names):
            if name.startswith(".") or Path(name).suffix.lower() not in ALLOWED[scope]:
                continue
            relative = (rel / name).as_posix()
            try:
                file = selected_file(paths, scope, relative)
            except (ValueError, FileNotFoundError):
                continue
            files.append(dict(path=relative, size=file.stat().st_size))
            if len(files) >= 200:
                return files
    return files


def read_file(paths, scope, relative):
    target = selected_file(paths, scope, relative)
    with target.open("rb") as stream:
        body = stream.read(20 * 1024 * 1024 + 1)
    if len(body) > 20 * 1024 * 1024:
        raise ValueError("文件超过 20 MB")
    return target.name, body, hashlib.sha256(body).hexdigest()


def export_artifact(paths, item):
    if item["status"] != "approved":
        raise ValueError("导出到工程目录前，工件必须人工评审通过")
    if item["stage"] == "编码实现":
        files = item.get("structured", {}).get("files", [])
        if not files and item["name"].endswith(".c"):
            files = [dict(path=item["name"], content=item["content"])]
        scope = "source"
    elif item["stage"] == "单元测试" and item.get("structured", {}).get("test_harness"):
        scope = "tests"
        files = [
            dict(
                path=item["id"] + "_harness.c",
                content=item["structured"]["test_harness"],
            )
        ]
    else:
        scope = "documents"
        files = [dict(path=item["id"] + ".md", content=item["content"])]
    if not files or len(files) > 20 or sum(len(f["content"]) for f in files) > 200000:
        raise ValueError("文件输入为空或超过限制")
    root = directory(paths, scope)
    result = []
    for file in files:
        if (
            not re.fullmatch(r"[A-Za-z0-9_-][A-Za-z0-9_.-]*\.(?:c|h|md)", file["path"])
            or ".." in file["path"]
        ):
            raise ValueError("无效导出文件名")
    if len({f["path"] for f in files}) != len(files):
        raise ValueError("导出文件名重复")
    if any((root / f["path"]).exists() for f in files):
        raise FileExistsError("目标文件已存在；不会覆盖。请另存现有文件或选择空目录。")
    root.mkdir(parents=True, exist_ok=True)
    for file in files:
        target = root / file["path"]
        with target.open("x", encoding="utf-8", newline="\n") as stream:
            stream.write(file["content"])
        result.append(
            dict(
                path=str(target),
                sha256=hashlib.sha256(file["content"].encode()).hexdigest(),
            )
        )
    return dict(
        scope=scope,
        files=result,
        artifact_id=item["id"],
        artifact_version=item["version"],
    )
