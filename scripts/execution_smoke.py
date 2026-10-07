"""Real constrained C smoke test. No claim about VCP hardware or safety compliance."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from dotenv import load_dotenv
from backend.execution import capabilities, execute_c

load_dotenv(Path(__file__).resolve().parent.parent / ".env")
caps = capabilities()
print(
    "Docker CLI:",
    caps["docker_available"],
    "Execution enabled:",
    caps["container_execution_enabled"],
)
if "--run" not in sys.argv:
    print(
        "Use --run after installing Docker, preparing gcc:14, and enabling execution in .env."
    )
    raise SystemExit(0)
if not caps["docker_available"] or not caps["container_execution_enabled"]:
    print(
        "Cannot run: install/start Docker and explicitly enable container execution first."
    )
    raise SystemExit(2)
result = execute_c(
    [dict(path="sum.c", content="int add(int a, int b) { return a + b; }\n")],
    "#include <assert.h>\nint add(int a, int b);\nint main(void) { assert(add(2, 3) == 5); assert(add(-1, 1) == 0); return 0; }\n",
    "unit_test",
)
print(
    "Real smoke result:", result["status"], "Executed:", result.get("executed", False)
)
raise SystemExit(0 if result["status"] == "passed" and result.get("executed") else 1)
