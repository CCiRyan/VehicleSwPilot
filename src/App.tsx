import { useEffect, useState } from "react";
import {
  App as AntApp,
  Button,
  Tag,
  Select,
  Input,
  Modal,
  Tabs,
  Table,
  Progress,
  Upload,
  Switch,
  Empty,
  Alert,
  Tooltip,
} from "antd";
import { ProTable } from "@ant-design/pro-components";
import {
  LayoutDashboard,
  ClipboardCheck,
  Workflow,
  GitBranch,
  Bot,
  BookOpen,
  FileOutput,
  ChevronDown,
  ChevronRight,
  ArrowUpRight,
  ArrowRight,
  Plus,
  Search,
  Bell,
  Settings,
  ShieldCheck,
  Check,
  Clock,
  FileText,
  Code2,
  FlaskConical,
  Activity,
  Folder,
  MoreHorizontal,
  Download,
  Send,
  PanelRight,
  CheckCircle2,
  AlertTriangle,
  Layers,
  ExternalLink,
  Command,
  Link2,
  History,
  UploadCloud,
  X,
} from "lucide-react";
import {
  agents,
  initialArtifacts,
  stages,
  traceRows,
  type Artifact,
} from "./data";
import { api } from "./api";
import KnowledgePanel from "./KnowledgePanel";
import QuestionPanel from "./QuestionPanel";
import RoleWorkspaces from "./RoleWorkspaces";
import ProjectSwitcher from "./ProjectSwitcher";
import ProjectPaths from "./ProjectPaths";
import AgentEvidence from "./AgentEvidence";

const navigation = [
  { id: "dashboard", name: "项目总看板", icon: LayoutDashboard },
  { id: "workspace", name: "阶段工作台", icon: Workflow },
  { id: "trace", name: "双向追溯矩阵", icon: GitBranch },
  { id: "agents", name: "Agent 管理", icon: Bot },
  { id: "knowledge", name: "RAG 知识库", icon: BookOpen },
  { id: "questions", name: "知识问答", icon: Send },
  { id: "review-center", name: "评审中心", icon: ClipboardCheck },
  { id: "configuration", name: "配置管理", icon: Settings },
  { id: "process-audit", name: "ASPICE 审核", icon: ShieldCheck },
  { id: "reports", name: "报告与交付", icon: FileOutput },
];
const statusLabel: Record<string, string> = {
  approved: "评审通过",
  pending: "待评审",
  draft: "草稿",
  rejected: "评审驳回",
};
const statusColor: Record<string, string> = {
  approved: "green",
  pending: "orange",
  draft: "default",
  rejected: "red",
};
function Badge({ status }: { status: string }) {
  return (
    <Tag color={statusColor[status]} bordered={false}>
      {statusLabel[status] || status}
    </Tag>
  );
}
function download(name: string, content: string, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function readLocal<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) || "null") ?? fallback;
  } catch {
    return fallback;
  }
}
async function exportTrace(rows: typeof traceRows) {
  const { Workbook } = await import("exceljs");
  const workbook = new Workbook();
  const sheet = workbook.addWorksheet("追溯矩阵");
  sheet.columns = [
    { header: "需求 ID", key: "req", width: 16 },
    { header: "需求", key: "title", width: 34 },
    { header: "ASIL", key: "asil", width: 10 },
    { header: "设计", key: "design", width: 18 },
    { header: "代码", key: "code", width: 30 },
    { header: "测试", key: "test", width: 25 },
    { header: "状态", key: "status", width: 30 },
  ];
  sheet.addRows(rows);
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  const bytes = await workbook.xlsx.writeBuffer();
  const url = URL.createObjectURL(
    new Blob([bytes as BlobPart], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = "VCP-双向追溯矩阵.xlsx";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function App() {
  const { message } = AntApp.useApp();
  const [page, setPage] = useState("dashboard"),
    [stage, setStage] = useState("详细设计");
  const [artifacts, setArtifacts] = useState<Artifact[]>(() =>
    readLocal("pilot-artifacts", initialArtifacts),
  );
  const [selected, setSelected] = useState("DES-001"),
    [mode, setMode] = useState("document");
  const [backend, setBackend] = useState(false),
    [role, setRole] = useState("软件工程师"),
    [search, setSearch] = useState("");
  const [serverMode, setServerMode] = useState("demo"),
    [executionAvailable, setExecutionAvailable] = useState(false),
    [configurable, setConfigurable] = useState(true),
    [outputSchema, setOutputSchema] = useState<unknown>(null);
  const [review, setReview] = useState(false),
    [comment, setComment] = useState(""),
    [settings, setSettings] = useState(false),
    [token, setToken] = useState("");
  const [chat, setChat] = useState<{ role: string; text: string }[]>([
      {
        role: "agent",
        text: "我是阶段专业 Agent。选择工件后，我可以协助检查需求、补充设计和生成候选测试。所有输出都需要人工评审。",
      },
    ]),
    [prompt, setPrompt] = useState(""),
    [busy, setBusy] = useState(false);
  const [agentConfig, setAgentConfig] = useState<string | null>(null),
    [systemPrompt, setSystemPrompt] = useState(""),
    [logs, setLogs] = useState<any[]>([]);
  const [traceFilter, setTraceFilter] = useState(false);
  const [traces, setTraces] = useState(() =>
      readLocal("pilot-traces", traceRows),
    ),
    [traceEdit, setTraceEdit] = useState<(typeof traceRows)[number] | null>(
      null,
    );
  const [create, setCreate] = useState(false),
    [newName, setNewName] = useState(""),
    [newContent, setNewContent] = useState("");
  const stageState = (s: string) => {
    const items = artifacts.filter((a) => a.stage === s);
    return items.length && items.every((a) => a.status === "approved")
      ? "approved"
      : items.some((a) => a.status === "rejected")
        ? "rejected"
        : items.some((a) => a.status === "pending")
          ? "pending"
          : items.length
            ? "draft"
            : "none";
  };
  const artifact = artifacts.find((a) => a.id === selected) || artifacts[0];
  const [sourceFile, setSourceFile] = useState("");
  const codeFiles = artifact.structured?.files || [];
  const codeFile = codeFiles.find((f) => f.path === sourceFile) || codeFiles[0];
  const editingHarness =
    sourceFile === "__harness" &&
    artifact.structured &&
    "test_harness" in artifact.structured;
  const editorContent = editingHarness
    ? artifact.structured?.test_harness || ""
    : codeFile?.content || artifact.content;
  const diagnosticAt = (line: number) =>
    artifact.execution?.diagnostics?.find(
      (d) => d.line === line && d.file === (codeFile?.path || artifact.name),
    );
  async function saveFile(value: string) {
    try {
      const result = await api(
        `/artifacts/${artifact.id}/` +
          (editingHarness
            ? "harness"
            : "files/" + encodeURIComponent(codeFile.path)),
        {
          method: "PUT",
          body: JSON.stringify({ content: value, version: artifact.version }),
        },
      );
      setArtifacts(artifacts.map((a) => (a.id === artifact.id ? result : a)));
      message.success("已保存文件修订，需重新评审");
    } catch (e) {
      message.error(String(e));
    }
  }
  const reviewTarget =
    artifacts.find((a) => a.status === "pending") ||
    artifacts.find((a) => a.status !== "approved");
  useEffect(() => {
    localStorage.setItem("pilot-artifacts", JSON.stringify(artifacts));
  }, [artifacts]);
  useEffect(() => {
    localStorage.setItem("pilot-traces", JSON.stringify(traces));
  }, [traces]);
  useEffect(() => {
    if (backend) return;
    let cancelled = false;
    let checking = false;
    const connect = () => {
      if (checking) return;
      checking = true;
      api("/health")
        .then((health) => {
          if (cancelled) return;
          setBackend(true);
          setServerMode(health.mode);
          setExecutionAvailable(
            !!health.simulation?.docker_available &&
              !!health.simulation?.container_execution_enabled,
          );
          api("/me")
            .then((r) => setRole(r.role))
            .catch(() => {});
          api("/artifacts")
            .then(setArtifacts)
            .catch(() => {});
          api("/traces")
            .then(setTraces)
            .catch(() => {});
          api("/logs")
            .then(setLogs)
            .catch(() => {});
        })
        .catch(() => {})
        .finally(() => {
          checking = false;
        });
    };
    connect();
    const timer = window.setInterval(connect, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [backend]);
  async function updateArtifact(content: string) {
    const next = {
      ...artifact,
      content,
      version: artifact.version + 1,
      status: "draft",
    };
    if (backend) {
      try {
        const result = await api(`/artifacts/${artifact.id}`, {
          method: "PUT",
          body: JSON.stringify({ content, version: artifact.version }),
        });
        setArtifacts(artifacts.map((a) => (a.id === artifact.id ? result : a)));
        message.success("已保存新版本，需重新评审");
      } catch (e) {
        message.error(String(e));
      }
    } else {
      setArtifacts(
        artifacts.map((a) =>
          a.id === artifact.id
            ? next
            : stages.indexOf(a.stage) > stages.indexOf(artifact.stage) &&
                a.status === "approved"
              ? { ...a, status: "draft", version: a.version + 1 }
              : a,
        ),
      );
      message.success("已保存到本地演示数据");
    }
  }
  async function decide(approved: boolean) {
    if (!comment.trim()) {
      message.warning("请填写评审意见");
      return;
    }
    if (backend) {
      try {
        await api(`/artifacts/${artifact.id}/review`, {
          method: "POST",
          body: JSON.stringify({
            approved,
            comment,
            version: artifact.version,
          }),
        });
        setArtifacts(await api("/artifacts"));
        setTraces(await api("/traces"));
      } catch (e) {
        message.error(String(e));
        return;
      }
    } else {
      if (approved) {
        const prior = stages.slice(0, stages.indexOf(artifact.stage));
        const blocked = prior.find(
          (s) =>
            !artifacts.some((a) => a.stage === s) ||
            artifacts.some((a) => a.stage === s && a.status !== "approved"),
        );
        if (blocked) {
          message.error("上游 " + blocked + " 尚未全部评审通过");
          return;
        }
      }
      if (!["安全经理", "系统工程师", "测试工程师"].includes(role)) {
        message.error("当前角色无评审权限，请在顶部切换演示角色");
        return;
      }
      setArtifacts(
        artifacts.map((a) =>
          a.id === artifact.id
            ? { ...a, status: approved ? "approved" : "rejected" }
            : a,
        ),
      );
    }
    setReview(false);
    setComment("");
    message.success(approved ? "人工评审已通过" : "已驳回，需修订工件");
  }
  async function send() {
    if (!prompt.trim() || busy) return;
    const text = prompt;
    setPrompt("");
    setChat((c) => [...c, { role: "user", text }]);
    setBusy(true);
    try {
      const result = backend
        ? await api("/runs", {
            method: "POST",
            body: JSON.stringify({
              stage,
              instruction: text,
              artifact_id: artifact.id,
            }),
          })
        : {
            output: `【演示输出 · AI 生成，需人工评审】\n针对 ${artifact.name}，建议先明确输入范围、错误处理和验收条件，再建立需求 → 设计 → 代码 → 测试关联。\n\n当前未连接真实模型；连接后端并配置 API Key 后，可生成与当前工件相关的候选输出。`,
          };
      setChat((c) => [...c, { role: "agent", text: result.output }]);
      if (backend) {
        setArtifacts(await api("/artifacts"));
        if (result.artifact_id) {
          setSelected(result.artifact_id);
          setMode("document");
        }
        setLogs(await api("/logs"));
      }
    } catch (e) {
      message.error(String(e));
    } finally {
      setBusy(false);
    }
  }
  function openArtifact(a: Artifact) {
    setSelected(a.id);
    setStage(a.stage);
    setPage("workspace");
  }
  const header = navigation.find((n) => n.id === page)!;
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <Layers size={22} />
          </div>
          <div>
            Vehicle SW <b>Pilot</b>
            <small>AUTOMOTIVE ENGINEERING</small>
          </div>
        </div>
        <div className="space-label">
          工作空间 <ChevronDown size={12} />
        </div>
        <ProjectSwitcher backend={backend} role={role} />
        <div className="nav-label">项目</div>
        <nav>
          {navigation.map((n) => (
            <button
              key={n.id}
              aria-label={n.name}
              className={page === n.id ? "active" : ""}
              onClick={() => {
                setPage(n.id);
                setSearch("");
              }}
            >
              <n.icon size={18} />
              {n.name}
              {n.id === "workspace" && (
                <span className="nav-count">{artifacts.length}</span>
              )}
              {n.id === "trace" && <span className="nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="compliance-note">
            <ShieldCheck size={20} />
            <strong>安全始于每个阶段</strong>
            <p>人工评审 · 双向追溯 · 工件留痕</p>
            <div>
              <span>AUTOSAR</span>
              <span>ISO 26262</span>
            </div>
          </div>
          <button className="settings-btn" onClick={() => setSettings(true)}>
            <Settings size={17} />
            工作空间设置
          </button>
          <div className="user">
            <div className="avatar">RY</div>
            <div>
              Ryan<small>{role}</small>
            </div>
            <MoreHorizontal size={18} />
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            工作空间 <ChevronRight size={13} /> VCP 控制器{" "}
            <ChevronRight size={13} />
            <strong>{header.name}</strong>
          </div>
          <div className="top-tools">
            <span className={backend ? "connection online" : "connection"}>
              <i />
              {backend ? "本地服务已连接" : "本地演示模式"}
            </span>
            <Tooltip title="查看待评审工件">
              <button
                onClick={() => {
                  setPage("workspace");
                  setSelected("DES-001");
                }}
              >
                <Bell size={18} />
                <i className="notification-dot" />
              </button>
            </Tooltip>
            <span className="top-divider" />
            <Select
              size="small"
              disabled={backend}
              value={role}
              style={{ width: 116 }}
              onChange={setRole}
              options={[
                "软件工程师",
                "系统工程师",
                "评审负责人",
                "配置管理员",
                "ASPICE 审核员",
                "测试工程师",
                "安全经理",
              ].map((value) => ({ value, label: value }))}
            />
            <div className="avatar small">RY</div>
          </div>
        </header>
        <main>
          {artifacts.some((a) =>
            /BMS|Bms_|电池管理系统/.test(a.name + a.content),
          ) && (
            <Alert
              className="legacy-project-note"
              type="info"
              showIcon
              message="当前空间已更名为 VCP 控制器。现有 BMS 示例需求、设计与代码保留原记录，需按 VCP 项目需求修订并重新评审。"
            />
          )}
          <div className="page-heading">
            <div>
              <div className="eyebrow">VCP CONTROLLER / WORKSPACE</div>
              <h1>
                {header.name}
                {page === "dashboard" && (
                  <span className="project-status">
                    <i />
                    开发进行中
                  </span>
                )}
              </h1>
              <p>
                {page === "dashboard"
                  ? "从需求到验证，让每一项软件工件有据可循。"
                  : page === "workspace"
                    ? "以工件为中心，与专业 Agent 协作推进当前阶段。"
                    : page === "trace"
                      ? "贯穿需求、设计、代码与测试的双向证据链。"
                      : page === "agents"
                        ? "专业分工，统一编排，每一次协作都可追溯。"
                        : page === "questions"
                          ? "结合工程知识库提问，查看回答与资料依据。"
                          : page === "knowledge"
                            ? "为工程决策提供可检索、有来源的知识。"
                            : "汇集评审证据，准备可交付的工程文档。"}
              </p>
            </div>
            <div className="heading-actions">
              {page === "dashboard" ? (
                <>
                  <Button
                    icon={<Download size={15} />}
                    onClick={() => setPage("reports")}
                  >
                    导出报告
                  </Button>
                  <Button
                    type="primary"
                    icon={<Plus size={16} />}
                    onClick={() => setPage("workspace")}
                  >
                    进入工作台
                  </Button>
                </>
              ) : page === "trace" ? (
                <Button
                  type="primary"
                  icon={<Download size={16} />}
                  onClick={() => exportTrace(traces)}
                >
                  导出 Excel
                </Button>
              ) : (
                <Tag className="asil-tag">ASIL B</Tag>
              )}
            </div>
          </div>
          {page === "dashboard" && (
            <>
              <div className="project-meta">
                <span>
                  <Folder size={14} />
                  VCP-2026-001
                </span>
                <span>
                  ASIL <b>B</b>
                </span>
                <span>AUTOSAR Classic 4.4</span>
                <span>
                  <span className="meta-dot" />
                  ISO 26262 工作流
                </span>
                <span className="meta-right">最近更新 2026-10-01</span>
              </div>
              <div className="stats-grid">
                {[
                  {
                    name: "软件需求总数",
                    value: String(traces.length),
                    unit: "项",
                    icon: FileText,
                    detail: `${traces.filter((r) => r.status === "完整").length} 项已建立完整追溯`,
                    color: "green",
                    foot: "示例项目需求",
                  },
                  {
                    name: "未完整追溯需求",
                    value: String(
                      traces.filter((r) => r.status !== "完整").length,
                    ),
                    unit: "项",
                    icon: GitBranch,
                    detail: "需要补充设计、代码或测试",
                    color: "orange",
                    foot: `${traces.filter((r) => r.status !== "完整").length} 项待处理`,
                  },
                  {
                    name: "MISRA 违规数量",
                    value: "—",
                    unit: "",
                    icon: Code2,
                    detail: "尚未接入静态分析工具",
                    color: "red",
                    foot: "等待真实扫描",
                  },
                  {
                    name: "测试覆盖率",
                    value: "—",
                    unit: "",
                    icon: FlaskConical,
                    detail: "尚未执行覆盖率采集",
                    color: "blue",
                    foot: "等待测试执行",
                  },
                ].map((s, i) => (
                  <div className="stat-card" key={s.name}>
                    <div className="stat-top">
                      {s.name}
                      <span className={"stat-icon " + s.color}>
                        <s.icon size={18} />
                      </span>
                    </div>
                    <div className="stat-value">
                      {s.value}
                      <span>{s.unit}</span>
                      {i === 0 && <span className="mini-bars">▂▃▂▄▃▅▄▆▅▇</span>}
                    </div>
                    <div className="stat-detail">{s.detail}</div>
                    <div className={"stat-footer " + s.color}>
                      <span>{s.foot}</span>
                      <ArrowUpRight size={14} />
                    </div>
                  </div>
                ))}
              </div>
              <div className="dashboard-grid">
                <section className="panel v-panel">
                  <div className="panel-heading">
                    <div>
                      <h2>
                        V 模型开发全景{" "}
                        <span className="sub-pill">9 个阶段</span>
                      </h2>
                      <p>开发与验证并行规划，阶段间通过人工评审流转</p>
                    </div>
                    <Button
                      size="small"
                      type="text"
                      onClick={() => setPage("workspace")}
                    >
                      查看工作台 <ArrowRight size={14} />
                    </Button>
                  </div>
                  <div className="v-canvas">
                    <svg viewBox="0 0 800 310" preserveAspectRatio="none">
                      <path
                        d="M100 42 L178 103 L256 164 L334 225 L400 278 L466 225 L544 164 L622 103 L700 42"
                        fill="none"
                        stroke="#e4eae8"
                        strokeWidth="3"
                      />
                      <path
                        d="M100 42 L178 103 L256 164 L334 225"
                        fill="none"
                        stroke="#308b71"
                        strokeWidth="3"
                      />
                      {[42, 103, 164, 225].map((y, i) => (
                        <path
                          key={y}
                          d={`M${100 + 78 * i + 74} ${y} L${700 - 78 * i - 74} ${y}`}
                          fill="none"
                          stroke="#dce4e2"
                          strokeDasharray="5 6"
                        />
                      ))}
                    </svg>
                    <div className="v-label">定义与实现</div>
                    <div className="v-label right">验证与确认</div>
                    {stages.map((s, i) => {
                      const positions = [
                        [3, 10],
                        [13, 29],
                        [23, 48],
                        [33, 67],
                        [43, 86],
                        [53, 67],
                        [63, 48],
                        [73, 29],
                        [83, 10],
                      ];
                      const approved = stageState(s) === "approved";
                      const active = stageState(s) === "pending";
                      return (
                        <button
                          key={s}
                          onClick={() => {
                            setStage(s);
                            const a = artifacts.find((a) => a.stage === s);
                            if (a) setSelected(a.id);
                            setPage("workspace");
                          }}
                          className={
                            "v-node " +
                            (approved ? "done" : active ? "current" : "waiting")
                          }
                          style={{
                            left: positions[i][0] + "%",
                            top: positions[i][1] + "%",
                          }}
                        >
                          <div className="v-node-title">
                            {approved ? (
                              <CheckCircle2 size={15} />
                            ) : active ? (
                              <Clock size={15} />
                            ) : (
                              <span className="node-number">{i + 1}</span>
                            )}
                            {s}
                          </div>
                          <small>
                            {approved
                              ? "评审通过"
                              : active
                                ? "待人工评审"
                                : stageState(s) === "rejected"
                                  ? "评审驳回"
                                  : stageState(s) === "draft"
                                    ? "进行中"
                                    : "未开始"}
                          </small>
                        </button>
                      );
                    })}
                    <div className="trace-hint" style={{ top: "28%" }}>
                      需求验证
                    </div>
                    <div className="trace-hint" style={{ top: "47%" }}>
                      架构验证
                    </div>
                    <div className="trace-hint" style={{ top: "66%" }}>
                      设计验证
                    </div>
                  </div>
                  <div className="v-footer">
                    <div className="legend">
                      <span>
                        <i className="green" />
                        评审通过
                      </span>
                      <span>
                        <i className="amber" />
                        待评审
                      </span>
                      <span>
                        <i className="gray" />
                        未开始
                      </span>
                    </div>
                    <span>
                      <ShieldCheck size={14} />
                      阶段流转需人工确认
                    </span>
                  </div>
                </section>
                <section className="panel review-panel">
                  <div className="panel-heading">
                    <h2>
                      需要你的关注{" "}
                      <span className="notice-count">
                        {1 +
                          (reviewTarget ? 1 : 0) +
                          (traces.some((r) => r.status !== "完整") ? 1 : 0)}
                      </span>
                    </h2>
                    <MoreHorizontal size={19} />
                  </div>
                  <div className="attention-item">
                    <span className="attention-icon amber">
                      <Clock size={18} />
                    </span>
                    <div>
                      <strong>
                        {reviewTarget
                          ? `${reviewTarget.stage}等待评审`
                          : "当前工件评审已完成"}
                      </strong>
                      <p>
                        {reviewTarget
                          ? `${reviewTarget.name} · ${reviewTarget.id}`
                          : "可继续创建下一阶段工件"}
                      </p>
                      <span className="tiny-badge">
                        {reviewTarget ? "人工评审卡点" : "评审基线已确认"}
                      </span>
                      <button
                        onClick={() => {
                          openArtifact(reviewTarget || artifacts[0]);
                          setReview(!!reviewTarget);
                        }}
                      >
                        {reviewTarget ? "前往评审" : "查看工作台"}{" "}
                        <ArrowRight size={13} />
                      </button>
                    </div>
                  </div>
                  <div className="attention-item">
                    <span className="attention-icon red">
                      <Link2 size={18} />
                    </span>
                    <div>
                      <strong>
                        {traces.filter((r) => r.status !== "完整").length}{" "}
                        项需求追溯不完整
                      </strong>
                      <p>缺失设计、代码或测试关联</p>
                      <button
                        onClick={() => {
                          setTraceFilter(true);
                          setPage("trace");
                        }}
                      >
                        补全追溯 <ArrowRight size={13} />
                      </button>
                    </div>
                  </div>
                  <div className="attention-item">
                    <span className="attention-icon blue">
                      <Code2 size={18} />
                    </span>
                    <div>
                      <strong>静态分析工具尚未配置</strong>
                      <p>接入分析器后获取真实 MISRA 结果</p>
                      <button onClick={() => setPage("agents")}>
                        查看工具 Agent <ArrowRight size={13} />
                      </button>
                    </div>
                  </div>
                  <div className="review-note">
                    <ShieldCheck size={16} />
                    <span>AI 产出需人工评审后才能用于下一阶段</span>
                  </div>
                </section>
              </div>
              <div className="dashboard-bottom">
                <section className="panel artifacts-panel">
                  <div className="panel-heading">
                    <h2>
                      近期工件{" "}
                      <span className="sub-pill">{artifacts.length}</span>
                    </h2>
                    <button
                      className="text-button"
                      onClick={() => setPage("workspace")}
                    >
                      全部工件 <ArrowRight size={14} />
                    </button>
                  </div>
                  <Table
                    pagination={false}
                    size="middle"
                    dataSource={artifacts.slice(0, 4)}
                    rowKey="id"
                    columns={[
                      {
                        title: "工件名称",
                        dataIndex: "name",
                        render: (v, a) => (
                          <button
                            className="artifact-link"
                            onClick={() => openArtifact(a)}
                          >
                            <span
                              className={
                                "file-icon " +
                                (a.id.startsWith("SRC") ? "blue" : "green")
                              }
                            >
                              {a.id.startsWith("SRC") ? (
                                <Code2 size={17} />
                              ) : (
                                <FileText size={17} />
                              )}
                            </span>
                            <span>
                              {v}
                              <small>{a.id}</small>
                            </span>
                          </button>
                        ),
                      },
                      { title: "阶段", dataIndex: "stage" },
                      {
                        title: "版本",
                        dataIndex: "version",
                        render: (v) => <span className="version">v1.{v}</span>,
                      },
                      {
                        title: "状态",
                        dataIndex: "status",
                        render: (v) => <Badge status={v} />,
                      },
                      {
                        title: "",
                        render: (_, a) => (
                          <Button
                            type="text"
                            size="small"
                            icon={<ExternalLink size={14} />}
                            onClick={() => openArtifact(a)}
                          />
                        ),
                      },
                    ]}
                  />
                </section>
                <section className="panel activity-panel">
                  <div className="panel-heading">
                    <h2>Agent 协作动态</h2>
                    <span className="live-dot">
                      {backend ? "已连接" : "示例记录"}
                    </span>
                  </div>
                  <div className="timeline">
                    {[
                      {
                        name: "详细设计 Agent",
                        text: "生成电压监测模块设计候选稿",
                        time: "示例 · 待评审",
                        icon: Layers,
                      },
                      {
                        name: "安全 / 合规 Agent",
                        text: "识别 3 项不完整追溯需求",
                        time: "示例 · 待处理",
                        icon: ShieldCheck,
                      },
                      {
                        name: "主调度 Agent",
                        text: "暂停阶段流转，等待人工确认",
                        time: "示例 · 已暂停",
                        icon: Workflow,
                      },
                    ].map((t) => (
                      <div className="timeline-item" key={t.name}>
                        <span>
                          <t.icon size={15} />
                        </span>
                        <div>
                          <strong>{t.name}</strong>
                          <p>{t.text}</p>
                          <small>{t.time}</small>
                        </div>
                      </div>
                    ))}
                  </div>
                  <button
                    className="activity-link"
                    onClick={() => setPage("agents")}
                  >
                    查看 Agent 日志 <ArrowRight size={14} />
                  </button>
                </section>
              </div>
            </>
          )}
          {page === "workspace" && (
            <>
              <div className="stage-tabs">
                {stages.map((s) => (
                  <button
                    className={stage === s ? "selected" : ""}
                    key={s}
                    onClick={() => {
                      setStage(s);
                      const a = artifacts.find((a) => a.stage === s);
                      if (a) setSelected(a.id);
                    }}
                  >
                    {s}
                    {s === "详细设计" && <span />}
                  </button>
                ))}
              </div>
              <div className="work-grid">
                <section className="panel artifact-list">
                  <div className="panel-heading">
                    <h2>
                      阶段工件{" "}
                      <Button
                        type="text"
                        size="small"
                        icon={<Plus size={13} />}
                        onClick={() => {
                          setCreate(true);
                          setNewName("");
                          setNewContent("");
                        }}
                      />
                    </h2>
                    <Tag>
                      {artifacts.filter((a) => a.stage === stage).length}
                    </Tag>
                  </div>
                  <Input
                    prefix={<Search size={14} />}
                    placeholder="搜索工件…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  {artifacts
                    .filter((a) => a.stage === stage && a.name.includes(search))
                    .map((a) => (
                      <button
                        className={
                          "artifact-list-item " +
                          (selected === a.id ? "selected" : "")
                        }
                        key={a.id}
                        onClick={() => setSelected(a.id)}
                      >
                        <FileText size={19} />
                        <div>
                          <strong>{a.name}</strong>
                          <small>
                            {a.id} · v1.{a.version}
                          </small>
                          <Badge status={a.status} />
                        </div>
                      </button>
                    ))}
                  {!artifacts.some((a) => a.stage === stage) && (
                    <Empty
                      image={Empty.PRESENTED_IMAGE_SIMPLE}
                      description="本阶段尚无工件"
                    />
                  )}
                  <div className="artifact-list-foot">
                    <History size={14} />
                    每次保存创建新版本
                  </div>
                </section>
                <section className="panel editor-panel">
                  {artifact.stage !== stage ? (
                    <div className="empty-stage">
                      <Empty description="本阶段尚无工件，先创建阶段输入" />
                      <Button
                        type="primary"
                        onClick={() => {
                          setCreate(true);
                          setNewName("");
                          setNewContent("");
                        }}
                      >
                        新增工件
                      </Button>
                    </div>
                  ) : (
                    <>
                      <div className="panel-heading">
                        <div>
                          <h2>{artifact.name}</h2>
                          <p>
                            {artifact.id} · v1.{artifact.version}{" "}
                            <Badge status={artifact.status} />
                          </p>
                        </div>
                        <Button
                          size="small"
                          onClick={() => {
                            setComment("");
                            setReview(true);
                          }}
                        >
                          人工评审
                        </Button>
                      </div>
                      <Tabs
                        activeKey={mode}
                        onChange={setMode}
                        items={[
                          {
                            key: "document",
                            label: (
                              <span>
                                <FileText size={14} />
                                文档编辑
                              </span>
                            ),
                          },
                          {
                            key: "chat",
                            label: (
                              <span>
                                <Bot size={14} />
                                Agent 对话
                              </span>
                            ),
                          },
                          {
                            key: "preview",
                            label: (
                              <span>
                                <Code2 size={14} />
                                代码 / 文档预览
                              </span>
                            ),
                          },
                        ]}
                      />
                      {artifact.ai && (
                        <div className="ai-banner">
                          <Bot size={15} />
                          AI 生成，需人工评审<span>候选工件</span>
                        </div>
                      )}
                      {mode === "document" ? (
                        <>
                          {(codeFiles.length > 0 ||
                            (artifact.structured &&
                              "test_harness" in artifact.structured)) && (
                            <div className="code-file-controls">
                              <Select
                                value={
                                  editingHarness
                                    ? "__harness"
                                    : codeFile?.path || "__document"
                                }
                                onChange={setSourceFile}
                                style={{ minWidth: 200 }}
                                options={
                                  codeFiles.length
                                    ? codeFiles.map((f) => ({
                                        value: f.path,
                                        label: f.path,
                                      }))
                                    : [
                                        {
                                          value: "__document",
                                          label: "测试工件正文",
                                        },
                                        {
                                          value: "__harness",
                                          label: "C 测试 Harness",
                                        },
                                      ]
                                }
                              />
                              <Button
                                size="small"
                                icon={<Download size={13} />}
                                onClick={() =>
                                  download(
                                    editingHarness
                                      ? "test_harness.c"
                                      : codeFile?.path || "artifact.md",
                                    (codeFile || editingHarness
                                      ? "/* AI 生成 / 人工修订，需人工评审。 */\n"
                                      : "") + editorContent,
                                  )
                                }
                              >
                                下载当前文件
                              </Button>
                            </div>
                          )}
                          <DocumentEditor
                            key={
                              artifact.id +
                              artifact.version +
                              (editingHarness
                                ? "__harness"
                                : codeFile?.path || "")
                            }
                            content={editorContent}
                            onSave={
                              backend && (codeFile || editingHarness)
                                ? saveFile
                                : updateArtifact
                            }
                          />
                        </>
                      ) : mode === "chat" ? (
                        <>
                          <div className="chat-messages">
                            {chat.map((c, i) => (
                              <div key={i} className={"chat-message " + c.role}>
                                <span>
                                  {c.role === "agent" ? (
                                    <Bot size={18} />
                                  ) : (
                                    <span>RY</span>
                                  )}
                                </span>
                                <div>
                                  <strong>
                                    {c.role === "agent"
                                      ? `${stage} Agent`
                                      : "你"}
                                  </strong>
                                  <p>{c.text}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                          <div className="composer">
                            <Input.TextArea
                              value={prompt}
                              onChange={(e) => setPrompt(e.target.value)}
                              placeholder="描述任务，例如：检查该模块的边界条件和需求追溯…"
                              autoSize={{ minRows: 2, maxRows: 5 }}
                            />
                            <div>
                              <small>
                                {backend
                                  ? "由后端编排 · 生成工件后暂停评审"
                                  : "演示模式 · 未调用模型"}
                              </small>
                              <Button
                                type="primary"
                                loading={busy}
                                onClick={send}
                                icon={<Send size={14} />}
                              >
                                发送
                              </Button>
                            </div>
                          </div>
                        </>
                      ) : (
                        <div className="code-preview">
                          {editorContent.split("\n").map((line, i) => (
                            <div
                              className={
                                diagnosticAt(i + 1)
                                  ? diagnosticAt(i + 1)?.severity === "error"
                                    ? "code-error"
                                    : "code-warning"
                                  : ""
                              }
                              key={i}
                            >
                              <span>{i + 1}</span>
                              <code>
                                {line
                                  .split(
                                    /(\b(?:if|else|return|static|bool|uint16_t|false|true)\b|\/\*.*?\*\/|#\w+)/g,
                                  )
                                  .map((part, j) => (
                                    <span
                                      key={j}
                                      className={
                                        /^(if|else|return|static|bool|uint16_t|false|true)$/.test(
                                          part,
                                        )
                                          ? "keyword"
                                          : part.startsWith("#")
                                            ? "directive"
                                            : part.startsWith("/*")
                                              ? "comment"
                                              : ""
                                      }
                                    >
                                      {part}
                                    </span>
                                  ))}
                              </code>
                              {diagnosticAt(i + 1) && (
                                <Tooltip
                                  title={
                                    diagnosticAt(i + 1)?.rule +
                                    ": " +
                                    diagnosticAt(i + 1)?.message
                                  }
                                >
                                  <AlertTriangle size={14} />
                                </Tooltip>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </section>
                <section className="panel agent-side">
                  <div className="panel-heading">
                    <h2>
                      <PanelRight size={16} />
                      工程助手
                    </h2>
                  </div>
                  <div className="agent-identity">
                    <span>
                      <Bot size={24} />
                    </span>
                    <strong>{stage} Agent</strong>
                    <small>专业工件协作</small>
                  </div>
                  <div className="side-section">
                    <h3>当前工件状态</h3>
                    <Badge status={artifact.status} />
                    <p>
                      {artifact.mode === "model"
                        ? "真实模型候选，已执行工件契约校验"
                        : artifact.mode === "demo"
                          ? "离线结构化模板，未调用模型"
                          : "人工 / 示例工件"}{" "}
                      · v{artifact.version}
                    </p>
                  </div>
                  <div className="side-section">
                    <h3>建议下一步</h3>
                    <p>
                      补充输入边界、故障处理与验收条件，检查与上游需求的一致性。
                    </p>
                    <Button
                      block
                      onClick={() => {
                        setMode("chat");
                        setPrompt(
                          "请检查当前工件的输入边界、故障处理与需求一致性。",
                        );
                      }}
                    >
                      与 Agent 分析 <ArrowRight size={14} />
                    </Button>
                  </div>
                  <div className="side-section">
                    <h3>安全与合规提示</h3>
                    <p>
                      这些提示用于辅助工程评审。当前未执行 MISRA 扫描或 ISO
                      26262 合规认证。
                    </p>
                    <Tag bordered={false}>ASIL B</Tag>
                    <Tag bordered={false}>MISRA C:2012</Tag>
                  </div>
                  {artifact.stage === stage && (
                    <AgentEvidence
                      artifact={artifact}
                      artifacts={artifacts}
                      backend={backend}
                    />
                  )}
                  <div className="side-section">
                    <h3>版本历史</h3>
                    <Button
                      block
                      icon={<History size={14} />}
                      onClick={async () => {
                        if (!backend) {
                          message.info(
                            "演示模式仅保留当前版本；连接后端查看历史",
                          );
                          return;
                        }
                        try {
                          const h = await api(
                            `/artifacts/${artifact.id}/history`,
                          );
                          Modal.info({
                            title: "工件版本历史",
                            width: 640,
                            content: (
                              <div>
                                {h.map((v: any) => (
                                  <details key={v.version}>
                                    <summary>
                                      v1.{v.version} · {statusLabel[v.status]} ·{" "}
                                      {v.created_at}
                                    </summary>
                                    <pre style={{ whiteSpace: "pre-wrap" }}>
                                      {v.content}
                                    </pre>
                                  </details>
                                ))}
                              </div>
                            ),
                          });
                        } catch (e) {
                          message.error(String(e));
                        }
                      }}
                    >
                      查看版本历史
                    </Button>
                  </div>
                </section>
              </div>
            </>
          )}
          {page === "trace" && (
            <section className="panel">
              <div className="trace-summary">
                <div className="trace-summary-icon">
                  <GitBranch size={25} />
                </div>
                <div>
                  <h2>需求追溯完整性</h2>
                  <p>
                    {backend ? "本地项目数据" : "示例数据"} · {traces.length}{" "}
                    项需求中 {traces.filter((r) => r.status === "完整").length}{" "}
                    项已建立完整关联
                  </p>
                </div>
                <Progress
                  percent={Math.round(
                    (traces.filter((r) => r.status === "完整").length /
                      Math.max(traces.length, 1)) *
                      100,
                  )}
                  size="small"
                  style={{ width: 200, marginLeft: "auto" }}
                />
                <Tag color="orange">
                  {traces.filter((r) => r.status !== "完整").length} 项需补全
                </Tag>
              </div>
              <div className="table-toolbar">
                <Input
                  prefix={<Search size={15} />}
                  placeholder="搜索需求 ID、描述或代码函数"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{ width: 330 }}
                />
                <div>
                  仅显示缺失追溯{" "}
                  <Switch checked={traceFilter} onChange={setTraceFilter} />
                </div>
              </div>
              <ProTable
                search={false}
                options={false}
                toolBarRender={false}
                pagination={false}
                rowKey="key"
                dataSource={traces.filter(
                  (r) =>
                    (!traceFilter || r.status !== "完整") &&
                    JSON.stringify(r)
                      .toLowerCase()
                      .includes(search.toLowerCase()),
                )}
                columns={[
                  {
                    title: "需求 ID",
                    dataIndex: "req",
                    render: (_, r) => (
                      <strong className="text-green">{r.req}</strong>
                    ),
                  },
                  { title: "需求描述", dataIndex: "title" },
                  {
                    title: "ASIL",
                    dataIndex: "asil",
                    render: (_, r) => <Tag>{r.asil}</Tag>,
                  },
                  ...["design", "code", "test"].map((key, i) => ({
                    title: ["设计项", "代码函数", "测试用例"][i],
                    dataIndex: key,
                    render: (_: unknown, r: any) =>
                      r[key] ? (
                        <span className="trace-cell">{r[key]}</span>
                      ) : (
                        <span className="missing-cell">
                          <AlertTriangle size={13} />
                          缺失
                        </span>
                      ),
                  })),
                  {
                    title: "追溯状态",
                    dataIndex: "status",
                    render: (_, r) => (
                      <Tag
                        color={r.status === "完整" ? "green" : "orange"}
                        bordered={false}
                      >
                        {r.status}
                      </Tag>
                    ),
                  },
                  {
                    title: "操作",
                    render: (_, r) => (
                      <Button size="small" onClick={() => setTraceEdit(r)}>
                        编辑关联
                      </Button>
                    ),
                  },
                ]}
              />
              <div className="table-note">
                <ShieldCheck size={15} />
                追溯示例用于展示结构；实际项目关联将在后续接入 ALM / 代码 /
                测试工具。
              </div>
            </section>
          )}
          {page === "agents" && (
            <>
              <div className="section-callout">
                <Workflow size={24} />
                <div>
                  <strong>主调度 → 阶段专业 Agent → 安全检查 → 人工评审</strong>
                  <p>
                    LangGraph
                    编排，工件作为节点间契约；所有阶段输出都在人工确认前暂停。
                  </p>
                </div>
                <Tag color="green">Human-in-the-loop</Tag>
              </div>
              <div className="agent-grid">
                {agents.map((a) => (
                  <section className="panel agent-card" key={a[0]}>
                    <div className="agent-card-top">
                      <span>
                        <Bot size={22} />
                      </span>
                      <Tag color={a[4] === "在线" ? "green" : "default"}>
                        {!backend
                          ? "演示配置"
                          : a[0] === "simulation"
                            ? executionAvailable
                              ? "容器就绪"
                              : "结构检查就绪"
                            : a[0] === "orchestrator"
                              ? "编排就绪"
                              : serverMode === "model"
                                ? "模型已配置"
                                : "离线模板"}
                      </Tag>
                    </div>
                    <h2>{a[1]}</h2>
                    <p>{a[2]}</p>
                    <div className="agent-card-footer">
                      <Tag bordered={false}>{a[3]}</Tag>
                      <Button
                        size="small"
                        onClick={async () => {
                          setAgentConfig(a[0]);
                          setConfigurable(
                            !["orchestrator", "safety", "simulation"].includes(
                              a[0],
                            ),
                          );
                          setOutputSchema(null);
                          setSystemPrompt(
                            `你是${a[1]}。输出工件必须携带需求关联与“AI 生成，需人工评审”标记。遵守阶段契约，指出证据缺口，禁止声称已通过合规认证。`,
                          );
                          if (backend) {
                            try {
                              const c = await api("/agents/" + a[0]);
                              setSystemPrompt(c.prompt);
                              setConfigurable(c.configurable);
                              setOutputSchema(c.schema);
                            } catch (e) {
                              message.error(String(e));
                            }
                          }
                        }}
                      >
                        {["orchestrator", "safety", "simulation"].includes(a[0])
                          ? "查看能力"
                          : "配置提示词"}{" "}
                        <Settings size={13} />
                      </Button>
                    </div>
                  </section>
                ))}
              </div>
              <section className="panel log-panel">
                <div className="panel-heading">
                  <h2>编排与审计日志</h2>
                  <Button
                    size="small"
                    onClick={async () => {
                      try {
                        setLogs(await api("/logs"));
                      } catch (e) {
                        message.error(String(e));
                      }
                    }}
                  >
                    刷新日志
                  </Button>
                </div>
                <Table
                  dataSource={logs}
                  rowKey="id"
                  size="small"
                  pagination={{ pageSize: 5 }}
                  locale={{
                    emptyText:
                      "尚无真实运行记录。连接后端后执行任务或评审，将生成审计日志。",
                  }}
                  columns={[
                    { title: "时间", dataIndex: "time" },
                    { title: "事件", dataIndex: "event" },
                    { title: "操作者", dataIndex: "actor" },
                    { title: "详情", dataIndex: "detail" },
                  ]}
                />
              </section>
            </>
          )}
          {page === "knowledge" && <KnowledgePanel backend={backend} />}
          {page === "configuration" && (
            <section className="panel qa-panel">
              <ProjectPaths backend={backend} role={role} />
            </section>
          )}
          {["review-center", "configuration", "process-audit"].includes(
            page,
          ) && (
            <RoleWorkspaces
              kind={
                page === "review-center"
                  ? "review"
                  : page === "configuration"
                    ? "configuration"
                    : "audit"
              }
              backend={backend}
              artifacts={artifacts}
              traces={traces}
              onArtifact={(a) => {
                setSelected(a.id);
                setStage(a.stage);
                setPage("workspace");
              }}
              onNavigate={setPage}
            />
          )}
          {page === "questions" && (
            <QuestionPanel
              backend={backend}
              onOpenSettings={() => setSettings(true)}
            />
          )}
          {page === "reports" && (
            <>
              <div className="section-callout">
                <ShieldCheck size={24} />
                <div>
                  <strong>让工程证据成为可交付的文档</strong>
                  <p>
                    报告保留工件版本、评审状态和 AI
                    标记。未评审内容作为草稿导出。
                  </p>
                </div>
                <Tag color="orange">审核状态随报告导出</Tag>
              </div>
              <div className="report-grid">
                {[
                  {
                    id: "srs",
                    name: "软件需求规格说明书",
                    desc: "软件需求、ASIL 等级与验收条件",
                    icon: FileText,
                  },
                  {
                    id: "review",
                    name: "工件评审报告",
                    desc: "评审结论、意见与工件版本",
                    icon: CheckCircle2,
                  },
                  {
                    id: "test",
                    name: "测试报告",
                    desc: "测试工件与执行证据缺口",
                    icon: FlaskConical,
                  },
                  {
                    id: "safety",
                    name: "安全分析报告",
                    desc: "追溯缺口、风险和待确认事项",
                    icon: ShieldCheck,
                  },
                ].map((r) => (
                  <section className="panel report-card" key={r.id}>
                    <span className="report-icon">
                      <r.icon size={28} />
                    </span>
                    <Tag bordered={false}>草稿交付</Tag>
                    <h2>{r.name}</h2>
                    <p>{r.desc}</p>
                    <div>
                      <Button
                        icon={<Download size={14} />}
                        onClick={() =>
                          download(
                            r.id + ".md",
                            `# ${r.name}\n\n项目：VCP 控制器 · ASIL B\n\n状态：草稿；历史 BMS 示例工件需按 VCP 需求重新修订及评审。未执行合规认证或真实测试。\n\n` +
                              artifacts
                                .map(
                                  (a) =>
                                    `## ${a.name} / ${a.id} / v1.${a.version}\n状态：${statusLabel[a.status]}\n${a.content}`,
                                )
                                .join("\n\n"),
                          )
                        }
                      >
                        Markdown
                      </Button>
                      {["docx", "pdf"].map((f) => (
                        <Button
                          key={f}
                          onClick={async () => {
                            if (!backend) {
                              message.warning("Word / PDF 导出需要后端服务");
                              return;
                            }
                            try {
                              const t = sessionStorage.getItem("pilot-token");
                              const response = await fetch(
                                `/api/reports/${r.id}?format=${f}`,
                                {
                                  headers: t
                                    ? { Authorization: `Bearer ${t}` }
                                    : {},
                                },
                              );
                              if (!response.ok) throw new Error("导出失败");
                              const u = URL.createObjectURL(
                                await response.blob(),
                              );
                              const a = document.createElement("a");
                              a.href = u;
                              a.download = `VCP-${r.id}.${f}`;
                              a.click();
                              setTimeout(() => URL.revokeObjectURL(u), 1000);
                            } catch (e) {
                              message.error(String(e));
                            }
                          }}
                        >
                          {f === "docx" ? "Word" : "PDF"}
                        </Button>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </>
          )}
          <footer className="footer">
            <span>
              Vehicle SW Pilot <span>·</span> 为汽车软件工程而构建
            </span>
            <span>
              <ShieldCheck size={13} /> AI 辅助工程决策，最终结论由工程师确认
            </span>
          </footer>
        </main>
      </div>
      <Modal
        open={create}
        title={"新增" + stage + "工件"}
        onCancel={() => setCreate(false)}
        onOk={async () => {
          if (!newName.trim() || !newContent.trim()) {
            message.warning("请填写名称与工件正文");
            return;
          }
          const data = { name: newName, stage, content: newContent };
          try {
            const item: Artifact = backend
              ? await api("/artifacts", {
                  method: "POST",
                  body: JSON.stringify(data),
                })
              : {
                  ...data,
                  id: "ART-" + Date.now(),
                  version: 1,
                  status: "draft",
                  ai: false,
                };
            setArtifacts(
              backend ? await api("/artifacts") : [...artifacts, item],
            );
            setSelected(item.id);
            setCreate(false);
          } catch (e) {
            message.error(String(e));
          }
        }}
      >
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="工件名称"
        />
        <Input.TextArea
          rows={8}
          style={{ marginTop: 14 }}
          value={newContent}
          onChange={(e) => setNewContent(e.target.value)}
          placeholder="正文 / 代码 / 测试设计…"
        />
      </Modal>
      <Modal
        open={!!traceEdit}
        title="编辑追溯关联"
        onCancel={() => setTraceEdit(null)}
        onOk={async () => {
          if (!traceEdit) return;
          const missing = [
            ["design", "设计"],
            ["code", "代码"],
            ["test", "测试"],
          ].filter(([key]) => !traceEdit[key as "design"]);
          const row = {
            ...traceEdit,
            status: missing.length
              ? "缺失" + missing.map((x) => x[1]).join(" / ")
              : "完整",
          };
          try {
            if (backend) {
              await api("/traces/" + row.key, {
                method: "PUT",
                body: JSON.stringify(row),
              });
              setTraces(await api("/traces"));
            } else {
              setTraces(traces.map((r) => (r.key === row.key ? row : r)));
            }
            setTraceEdit(null);
            message.success("追溯关联已保存");
          } catch (e) {
            message.error(String(e));
          }
        }}
      >
        {traceEdit &&
          ["req", "title", "design", "code", "test"].map((key, i) => (
            <div key={key} style={{ marginBottom: 14 }}>
              <p>
                {
                  [
                    "需求 ID",
                    "需求描述",
                    "设计项 ID",
                    "代码函数",
                    "测试用例 ID",
                  ][i]
                }
              </p>
              <Input
                value={traceEdit[key as "req"]}
                onChange={(e) =>
                  setTraceEdit({ ...traceEdit, [key]: e.target.value })
                }
              />
            </div>
          ))}
      </Modal>
      <Modal
        open={review}
        title="工件人工评审"
        onCancel={() => setReview(false)}
        footer={
          <>
            <Button onClick={() => decide(false)} danger>
              驳回并修订
            </Button>
            <Button
              type="primary"
              onClick={() => decide(true)}
              icon={<Check size={15} />}
            >
              确认评审通过
            </Button>
          </>
        }
      >
        <p>
          {artifact.name} · {artifact.id} · v1.{artifact.version}
        </p>
        <p>
          确认需求一致性、接口约束、测试可验证性与安全影响。真实服务使用后端令牌绑定的角色授权。
        </p>
        <Input.TextArea
          rows={4}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="填写评审意见、依据和需要跟进的事项…"
        />
      </Modal>
      <Modal
        open={settings}
        title="本地服务连接"
        onCancel={() => setSettings(false)}
        onOk={() => {
          sessionStorage.setItem("pilot-token", token);
          setSettings(false);
          window.location.reload();
        }}
      >
        <p>
          后端地址由 Vite /api 代理连接至
          127.0.0.1:8000。输入后端配置的访问令牌；顶部角色切换仅用于本地演示。
        </p>
        <Input.Password
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="PILOT_AUTH_TOKEN 或角色令牌"
        />
        <p>真实模型与知识库需要在启动后端前设置 API Key 环境变量。</p>
      </Modal>
      <Modal
        width={720}
        open={!!agentConfig}
        title="专业 Agent 提示词"
        okButtonProps={{ disabled: !configurable }}
        onCancel={() => setAgentConfig(null)}
        onOk={async () => {
          if (backend) {
            try {
              await api("/agents/" + agentConfig, {
                method: "PUT",
                body: JSON.stringify({ prompt: systemPrompt }),
              });
              message.success("提示词已保存");
            } catch (e) {
              message.error(String(e));
              return;
            }
          } else {
            message.info("演示模式；启动后端后可持久化提示词");
          }
          setAgentConfig(null);
        }}
      >
        <Input.TextArea
          rows={10}
          readOnly={!configurable}
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
        />
        {!!outputSchema && (
          <details style={{ marginTop: 16 }}>
            <summary>结构化输出契约</summary>
            <pre className="execution-output">
              {JSON.stringify(outputSchema, null, 2)}
            </pre>
          </details>
        )}
        <p>后端强制添加工件标签和人工评审卡点，提示词编辑不能跳过流程控制。</p>
      </Modal>
    </div>
  );
}
function DocumentEditor({
  content,
  onSave,
}: {
  content: string;
  onSave: (value: string) => void;
}) {
  const [value, setValue] = useState(content);
  return (
    <>
      <textarea
        className="document-editor"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        spellCheck={false}
      />
      <div className="editor-footer">
        <span>{value.length} 字符 · 修改后需重新评审</span>
        <Button
          type="primary"
          disabled={value === content}
          onClick={() => onSave(value)}
        >
          保存新版本
        </Button>
      </div>
    </>
  );
}
