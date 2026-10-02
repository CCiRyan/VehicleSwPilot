"""Isolated no-network model backend for browser tests; never loads user's .env."""

import os
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import uvicorn

for key in ("OPENAI_API_KEY", "PILOT_CHAT_API_KEY", "PILOT_EMBEDDING_API_KEY"):
    os.environ.pop(key, None)
os.environ["PILOT_AUTH_TOKEN"] = "browser-test-reviewer"
os.environ["PILOT_ENABLE_CONTAINER_EXECUTION"] = "0"
with tempfile.TemporaryDirectory(prefix="pilot-browser-test-") as temporary:
    os.environ["PILOT_DATA_DIR"] = temporary
    uvicorn.run("backend.main:app", host="127.0.0.1", port=8011, log_level="warning")
