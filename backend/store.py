import json
import sqlite3
import threading
from datetime import datetime, timezone
from pathlib import Path

STAGES = [
    "系统需求",
    "软件需求",
    "软件架构",
    "详细设计",
    "编码实现",
    "单元测试",
    "集成测试",
    "系统测试",
    "验收验证",
]
SEED = [
    dict(
        id="SYS-001",
        name="BMS 系统需求基线",
        stage="系统需求",
        version=1,
        status="approved",
        ai=False,
        content="电池管理系统必须提供电压监测、过压保护和通信失效处理。ASIL B。",
    ),
    dict(
        id="SRS-001",
        name="电池管理系统软件需求规格",
        stage="软件需求",
        version=3,
        status="approved",
        ai=False,
        content="# 软件需求规格\n\nSWR-001：每 10 ms 采集电芯电压。\nSWR-002：电压超过 4250 mV 持续 100 ms 后触发过压保护。\nSWR-003：CAN 超时 500 ms 后进入安全状态。\nASIL B。",
    ),
    dict(
        id="ARC-001",
        name="BMS 软件架构基线",
        stage="软件架构",
        version=1,
        status="approved",
        ai=False,
        content="# 架构\n电压采集 → 电压监测 → 故障管理 → 接触器控制。\n电压监测周期 10 ms，追溯 SWR-002。",
    ),
    dict(
        id="DES-001",
        name="电压监测模块详细设计",
        stage="详细设计",
        version=2,
        status="pending",
        ai=True,
        content="# 电压监测详细设计\n【AI 生成，需人工评审】\n追溯 SWR-002。接口 Bms_CheckCellVoltage(uint16_t voltage_mv)。\n阈值 4250 mV；连续超阈值 10 次触发过压。需要核对输入有效性与故障恢复策略。",
    ),
    dict(
        id="SRC-001",
        name="bms_voltage_monitor.c",
        stage="编码实现",
        version=4,
        status="pending",
        ai=True,
        content="/* AI 生成，需人工评审 | Trace: SWR-002 */\n#include <stdint.h>\n#include <stdbool.h>\n#define BMS_OV_THRESHOLD_MV (4250U)\nstatic uint16_t overvoltage_count = 0U;\nbool Bms_CheckCellVoltage(uint16_t voltage_mv)\n{\n    if (voltage_mv > BMS_OV_THRESHOLD_MV)\n    {\n        if (overvoltage_count < 10U)\n        {\n            overvoltage_count++;\n        }\n    }\n    else\n    {\n        overvoltage_count = 0U;\n    }\n    return (overvoltage_count >= 10U);\n}\n",
    ),
    dict(
        id="UT-001",
        name="电压监测边界测试用例",
        stage="单元测试",
        version=1,
        status="draft",
        ai=True,
        content="# 单元测试候选\n【AI 生成，需人工评审】\nTC-001：4250 mV 输入 10 次，期望 false。\nTC-002：4251 mV 输入 9 次，期望 false。\nTC-003：4251 mV 输入 10 次，期望 true。\n尚未执行测试。",
    ),
]


def now():
    return datetime.now(timezone.utc).isoformat()


class Store:
    def __init__(self, path):
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        self.conn = sqlite3.connect(path, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self.lock = threading.RLock()
        self.conn.executescript("""
        CREATE TABLE IF NOT EXISTS artifacts(id TEXT PRIMARY KEY, data TEXT);
        CREATE TABLE IF NOT EXISTS revisions(id TEXT, version INTEGER, data TEXT, created_at TEXT, PRIMARY KEY(id,version));
        CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY AUTOINCREMENT, time TEXT, event TEXT, actor TEXT, detail TEXT);
        CREATE TABLE IF NOT EXISTS agents(id TEXT PRIMARY KEY, prompt TEXT);
        CREATE TABLE IF NOT EXISTS knowledge(id TEXT PRIMARY KEY, data TEXT);
        CREATE TABLE IF NOT EXISTS runs(id TEXT PRIMARY KEY, data TEXT);
        CREATE TABLE IF NOT EXISTS traces(id TEXT PRIMARY KEY, data TEXT);
        CREATE TABLE IF NOT EXISTS evidence(id TEXT PRIMARY KEY, data TEXT);
        """)
        if not self.conn.execute("SELECT COUNT(*) FROM artifacts").fetchone()[0]:
            for item in SEED:
                self.save(item)
        if not self.conn.execute("SELECT COUNT(*) FROM traces").fetchone()[0]:
            rows = [
                (
                    "SWR-001",
                    "电芯电压周期采集",
                    "B",
                    "DES-002",
                    "Bms_ReadCellVoltage",
                    "TC-005",
                ),
                (
                    "SWR-002",
                    "电芯过压保护",
                    "B",
                    "DES-001",
                    "Bms_CheckCellVoltage",
                    "TC-001 ~ 004",
                ),
                (
                    "SWR-003",
                    "CAN 通信超时安全状态",
                    "B",
                    "DES-003",
                    "Can_TimeoutHandler",
                    "",
                ),
                ("SWR-004", "温度传感器合理性检测", "B", "DES-004", "", ""),
                (
                    "SWR-005",
                    "SOC 状态估算",
                    "QM",
                    "DES-005",
                    "Bms_EstimateSOC",
                    "TC-010",
                ),
                ("SWR-006", "接触器粘连诊断", "B", "", "", ""),
            ]
            with self.conn:
                for i, row in enumerate(rows):
                    data = dict(
                        zip(["req", "title", "asil", "design", "code", "test"], row)
                    )
                    data["key"] = str(i + 1)
                    self.conn.execute(
                        "INSERT INTO traces VALUES(?,?)",
                        (data["key"], json.dumps(data, ensure_ascii=False)),
                    )

    def all(self):
        with self.lock:
            return [
                json.loads(r[0])
                for r in self.conn.execute("SELECT data FROM artifacts ORDER BY rowid")
            ]

    def get(self, artifact_id):
        with self.lock:
            row = self.conn.execute(
                "SELECT data FROM artifacts WHERE id=?", (artifact_id,)
            ).fetchone()
            return json.loads(row[0]) if row else None

    def save(self, item):
        with self.lock, self.conn:
            self.conn.execute(
                "INSERT OR REPLACE INTO artifacts VALUES(?,?)",
                (item["id"], json.dumps(item, ensure_ascii=False)),
            )
            self.conn.execute(
                "INSERT OR REPLACE INTO revisions VALUES(?,?,?,?)",
                (
                    item["id"],
                    item["version"],
                    json.dumps(item, ensure_ascii=False),
                    now(),
                ),
            )

    def audit(self, event, actor, detail):
        with self.lock, self.conn:
            self.conn.execute(
                "INSERT INTO audit(time,event,actor,detail) VALUES(?,?,?,?)",
                (now(), event, actor, detail),
            )

    def gate(self, stage):
        prior = STAGES[: STAGES.index(stage)]
        items = self.all()
        for previous in prior:
            stage_items = [a for a in items if a["stage"] == previous]
            if not stage_items or any(a["status"] != "approved" for a in stage_items):
                return previous
        return None

    def invalidate_downstream(self, stage):
        later = STAGES[STAGES.index(stage) + 1 :]
        for item in self.all():
            if item["stage"] in later and item["status"] == "approved":
                item.pop("review", None)
                if item.get("run_id"):
                    run = self.get_run(item.pop("run_id"))
                    if run:
                        run["status"] = "superseded"
                        self.put_run(run)
                item.update(version=item["version"] + 1, status="draft")
                self.save(item)

    def baseline(self, stage, artifact):
        upstream = [
            a
            for a in self.all()
            if a["stage"] in STAGES[: STAGES.index(stage)] and a["status"] == "approved"
        ]
        snapshots = [
            dict(id=a["id"], version=a["version"], stage=a["stage"], status=a["status"])
            for a in [artifact, *upstream]
        ]
        if sum(len(a["content"]) for a in [artifact, *upstream]) > 100000:
            raise ValueError("输入与上游基线超过 100000 字符，请拆分任务或精简工件")
        return upstream, snapshots

    def stale_baseline(self, snapshots):
        return [
            s["id"]
            for s in snapshots
            if not self.get(s["id"])
            or self.get(s["id"])["version"] != s["version"]
            or (
                s.get("status") == "approved"
                and self.get(s["id"])["status"] != "approved"
            )
        ]

    def evidence(self, item):
        with self.lock, self.conn:
            self.conn.execute(
                "INSERT INTO evidence VALUES(?,?)",
                (item["id"], json.dumps(item, ensure_ascii=False)),
            )

    def put_run(self, run):
        with self.lock, self.conn:
            self.conn.execute(
                "INSERT OR REPLACE INTO runs VALUES(?,?)", (run["id"], json.dumps(run))
            )

    def get_run(self, run_id):
        with self.lock:
            row = self.conn.execute(
                "SELECT data FROM runs WHERE id=?", (run_id,)
            ).fetchone()
            return json.loads(row[0]) if row else None
