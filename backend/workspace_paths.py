"""Directory metadata only; configuring a path grants no filesystem access."""

import ntpath
import posixpath
import re
from pathlib import Path

FIELDS = {
    "documents": "docs",
    "source": "generated/src",
    "tests": "generated/tests",
    "reports": "deliverables",
}


def normalize_paths(paths):
    root = paths["root"].strip()
    values = [root, *(paths.get(key, "") for key in FIELDS)]
    if any(any(ord(char) < 32 for char in value) or "://" in value for value in values):
        raise ValueError("目录不能包含网址或控制字符")
    windows = bool(re.match(r"^[A-Za-z]:[\\/]", root))
    module = ntpath if windows else posixpath
    if not windows and not root.startswith("/"):
        raise ValueError("项目根目录必须使用绝对路径，如 D:\\Projects\\VCP")
    result = {"root": module.normpath(root)}
    for key, default in FIELDS.items():
        value = paths.get(key, "").strip() or default
        if ntpath.splitdrive(value)[0] and not ntpath.isabs(value):
            raise ValueError("目录不能使用带盘符的相对路径")
        if value.startswith("\\\\"):
            raise ValueError("请使用本地目录路径")
        is_absolute = ntpath.isabs(value) if windows else posixpath.isabs(value)
        result[key] = module.normpath(
            value if is_absolute else module.join(result["root"], value)
        )
    return result


def default_paths():
    return normalize_paths({"root": str(Path(__file__).resolve().parent.parent)})
