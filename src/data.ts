export const stages = [
  "系统需求",
  "软件需求",
  "软件架构",
  "详细设计",
  "编码实现",
  "单元测试",
  "集成测试",
  "系统测试",
  "验收验证",
];
export type Artifact = {
  id: string;
  name: string;
  stage: string;
  version: number;
  status: string;
  content: string;
  ai: boolean;
  mode?: string;
  structured?: {
    files?: { id: string; path: string; content: string; language: string }[];
    test_harness?: string;
    [key: string]: unknown;
  };
  references?: {
    citation_id: string;
    source: string;
    page: number;
    chunk: number;
    section?: string;
    content: string;
    retrieval?: string;
  }[];
  baseline?: { id: string; version: number; stage: string }[];
  safety_report?: {
    summary: string;
    findings: {
      severity: string;
      code: string;
      message: string;
      evidence: string;
      recommendation: string;
    }[];
  };
  execution?: {
    executed?: boolean;
    status: string;
    summary?: string;
    scope?: string;
    stdout?: string;
    diagnostics?: {
      file: string;
      line: number;
      severity: string;
      rule: string;
      message: string;
    }[];
  };
};
export const initialArtifacts: Artifact[] = [
  {
    id: "SYS-001",
    name: "BMS 系统需求基线",
    stage: "系统需求",
    version: 1,
    status: "approved",
    ai: false,
    content:
      "# BMS 系统需求\n\n电池管理系统提供电压监测、过压保护和通信失效处理。\nASIL B。",
  },
  {
    id: "SRS-001",
    name: "电池管理系统软件需求规格",
    stage: "软件需求",
    version: 3,
    status: "approved",
    ai: false,
    content:
      "# 电池管理系统软件需求规格\n\n项目：BMS 控制器 · ASIL B\n\n## SWR-001 电芯电压采集\n系统应每 10 ms 采集所有电芯电压。有效范围为 0–5 V，精度要求 ±5 mV。\n\n## SWR-002 过压保护\n当任一电芯电压超过 4.25 V 持续 100 ms 时，触发过压故障并请求断开充电接触器。\n\n## SWR-003 通信超时\nCAN 报文超时 500 ms 时进入安全状态，记录诊断故障码。",
  },
  {
    id: "ARC-001",
    name: "BMS 软件架构基线",
    stage: "软件架构",
    version: 1,
    status: "approved",
    ai: false,
    content:
      "# 软件架构\n\n电压采集 → 电压监测 → 故障管理 → 接触器控制。\n\n电压监测周期 10 ms，关联 SWR-002。",
  },
  {
    id: "DES-001",
    name: "电压监测模块详细设计",
    stage: "详细设计",
    version: 2,
    status: "pending",
    ai: true,
    content:
      "# 电压监测模块详细设计\n\n【AI 生成，需人工评审】\n\n接口：Bms_CheckCellVoltage(uint16_t voltage_mv)\n输入：电芯电压，单位 mV\n输出：过压状态布尔值\n追溯：SWR-002\n\n设计要求：检测阈值 4250 mV；连续超阈值 10 次才触发故障。\n边界：电压无效时请求安全状态。\n\n待评审：采样抖动与故障恢复策略。",
  },
  {
    id: "SRC-001",
    name: "bms_voltage_monitor.c",
    stage: "编码实现",
    version: 4,
    status: "pending",
    ai: true,
    content:
      "/* AI 生成，需人工评审 | Trace: SWR-002 / DES-001 */\n#include <stdint.h>\n#include <stdbool.h>\n\n#define BMS_OV_THRESHOLD_MV  (4250U)\n#define BMS_OV_CONFIRM_COUNT (10U)\n\nstatic uint16_t overvoltage_count = 0U;\n\nbool Bms_CheckCellVoltage(uint16_t voltage_mv)\n{\n    if (voltage_mv > BMS_OV_THRESHOLD_MV)\n    {\n        if (overvoltage_count < BMS_OV_CONFIRM_COUNT)\n        {\n            overvoltage_count++;\n        }\n    }\n    else\n    {\n        overvoltage_count = 0U;\n    }\n    return (overvoltage_count >= BMS_OV_CONFIRM_COUNT);\n}\n",
  },
  {
    id: "UT-001",
    name: "电压监测边界测试用例",
    stage: "单元测试",
    version: 1,
    status: "draft",
    ai: true,
    content:
      "# 电压监测单元测试\n\n【AI 生成，需人工评审】\n\nTC-001：4250 mV 输入 10 次，期望 false。\nTC-002：4251 mV 输入 9 次，期望 false。\nTC-003：4251 mV 输入 10 次，期望 true。\nTC-004：过压计数后输入 4200 mV，期望计数清零。\n\n追溯：SWR-002 / DES-001 / Bms_CheckCellVoltage\n实际测试执行：尚未执行。",
  },
];
export const traceRows = [
  {
    key: "1",
    req: "SWR-001",
    title: "电芯电压周期采集",
    asil: "B",
    design: "DES-002",
    code: "Bms_ReadCellVoltage",
    test: "TC-005",
    status: "完整",
  },
  {
    key: "2",
    req: "SWR-002",
    title: "电芯过压保护",
    asil: "B",
    design: "DES-001",
    code: "Bms_CheckCellVoltage",
    test: "TC-001 ~ 004",
    status: "完整",
  },
  {
    key: "3",
    req: "SWR-003",
    title: "CAN 通信超时安全状态",
    asil: "B",
    design: "DES-003",
    code: "Can_TimeoutHandler",
    test: "",
    status: "缺失测试",
  },
  {
    key: "4",
    req: "SWR-004",
    title: "温度传感器合理性检测",
    asil: "B",
    design: "DES-004",
    code: "",
    test: "",
    status: "缺失代码 / 测试",
  },
  {
    key: "5",
    req: "SWR-005",
    title: "SOC 状态估算",
    asil: "QM",
    design: "DES-005",
    code: "Bms_EstimateSOC",
    test: "TC-010",
    status: "完整",
  },
  {
    key: "6",
    req: "SWR-006",
    title: "接触器粘连诊断",
    asil: "B",
    design: "",
    code: "",
    test: "",
    status: "缺失设计 / 代码 / 测试",
  },
];
export const agents = [
  [
    "orchestrator",
    "主调度 Agent",
    "统筹 V 模型流程与工件传递",
    "Workflow",
    "在线",
  ],
  [
    "system",
    "系统需求 Agent",
    "系统需求分析与软件需求分配",
    "系统需求",
    "在线",
  ],
  [
    "requirements",
    "软件需求 Agent",
    "需求拆解、可验证性与 ASIL 继承",
    "软件需求",
    "在线",
  ],
  [
    "architecture",
    "软件架构 Agent",
    "AUTOSAR 组件、接口与架构设计",
    "软件架构",
    "在线",
  ],
  ["design", "详细设计 Agent", "模块设计与接口契约", "详细设计", "在线"],
  ["coding", "编码 Agent", "C 代码生成与 MISRA 规则辅助", "编码实现", "在线"],
  ["unit", "单元测试 Agent", "边界值、分支与覆盖率分析", "单元测试", "在线"],
  ["integration", "集成测试 Agent", "组件集成与接口验证", "集成测试", "待命"],
  ["systemtest", "系统测试 Agent", "系统需求验证", "系统测试", "待命"],
  ["acceptance", "验收验证 Agent", "验收证据与交付清单", "验收验证", "待命"],
  ["safety", "安全 / 合规 Agent", "安全风险、追溯完整性检查", "跨阶段", "在线"],
  [
    "simulation",
    "执行 / 仿真 Agent",
    "受控工具任务与执行证据",
    "工具",
    "未配置",
  ],
];
