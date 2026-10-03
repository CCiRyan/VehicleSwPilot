import { useEffect, useState } from "react";
import { Alert, App, Button, Modal, Table, Tag } from "antd";
import { ClipboardCheck, Settings, ShieldCheck } from "lucide-react";
import { api } from "./api";
import { type Artifact, stages } from "./data";

const roleRows = [
  {
    role: "软件工程师",
    variable: "PILOT_SOFTWARE_TOKEN",
    purpose: "软件需求、设计、编码与阶段 Agent",
  },
  {
    role: "系统工程师",
    variable: "PILOT_SYSTEM_TOKEN",
    purpose: "系统需求、架构、系统验证与追溯",
  },
  {
    role: "评审负责人",
    variable: "PILOT_REVIEW_TOKEN",
    purpose: "评审待办、通过 / 驳回、意见与安全证据",
    pending: true,
  },
  {
    role: "配置管理员",
    variable: "PILOT_CONFIG_TOKEN",
    purpose: "配置版本、知识库与 Agent 配置、基线",
    pending: true,
  },
  {
    role: "ASPICE 审核员",
    variable: "PILOT_ASPICE_TOKEN",
    purpose: "过程证据、缺口、历史与审核报告",
    pending: true,
  },
];
function download(name: string, value: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
export default function RoleWorkspaces({
  kind,
  backend,
  artifacts,
  traces,
  onArtifact,
  onNavigate,
}: {
  kind: "review" | "configuration" | "audit";
  backend: boolean;
  artifacts: Artifact[];
  traces: any[];
  onArtifact: (a: Artifact) => void;
  onNavigate: (page: string) => void;
}) {
  const { message } = App.useApp();
  const [logs, setLogs] = useState<any[]>([]);
  const [knowledge, setKnowledge] = useState<any[]>([]);
  const [evidence, setEvidence] = useState<Record<string, any[]>>({});
  const [history, setHistory] = useState<any[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function refresh() {
    if (!backend) return;
    setBusy(true);
    setError("");
    try {
      const [l, k, e] = await Promise.all([
        api("/logs"),
        api("/knowledge"),
        Promise.all(
          artifacts.map(
            async (a) => [a.id, await api(`/evidence/${a.id}`)] as const,
          ),
        ),
      ]);
      setLogs(l);
      setKnowledge(k);
      setEvidence(Object.fromEntries(e));
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    refresh();
  }, [backend, kind, artifacts]);
  async function showHistory(a: Artifact) {
    if (!backend) {
      message.info("版本历史需要连接本地后端。");
      return;
    }
    try {
      setHistory(await api(`/artifacts/${a.id}/history`));
    } catch (e) {
      message.error(String(e));
    }
  }
  const queue = artifacts.filter(
    (a) => a.status === "pending" || a.status === "rejected",
  );
  const checks = stages.map((stage) => {
    const items = artifacts.filter((a) => a.stage === stage);
    const gaps: string[] = [];
    if (!items.length) gaps.push("缺少阶段工件");
    for (const a of items) {
      if (a.status !== "approved") gaps.push(`${a.id} 未评审通过`);
      const current = (evidence[a.id] || []).filter(
        (e) => e.artifact_version === a.version,
      );
      if (stage.includes("测试") || stage === "验收验证") {
        if (
          !current.some((e) => e.executed && e.status === "passed") &&
          !(a.execution?.executed && a.execution?.status === "passed")
        )
          gaps.push(`${a.id} 缺少当前版本的通过执行证据`);
      }
      if (a.safety_report?.findings?.some((f: any) => f.severity === "error"))
        gaps.push(`${a.id} 存在安全错误`);
    }
    return { stage, count: items.length, gaps };
  });
  const title =
    kind === "review"
      ? "评审中心"
      : kind === "configuration"
        ? "配置管理"
        : "ASPICE 审核";
  const Icon =
    kind === "review"
      ? ClipboardCheck
      : kind === "configuration"
        ? Settings
        : ShieldCheck;
  return (
    <>
      <div className="section-callout">
        <Icon size={24} />
        <div>
          <strong>{title}</strong>
          <p>
            {kind === "review"
              ? "汇集待评审工件，查看当前版本和意见，再进入阶段工作台处理。"
              : kind === "configuration"
                ? "查看配置项、版本历史与知识文档，导出可复核的项目配置快照。"
                : "检查阶段工件、评审、执行证据与追溯缺口，导出过程证据报告。"}
          </p>
        </div>
      </div>
      {error && <Alert type="error" showIcon message={error} />}
      {!backend && (
        <Alert
          type="info"
          showIcon
          message="当前展示本地示例；历史、审计与执行证据需连接后端。"
        />
      )}
      <section className="panel qa-panel">
        <div className="qa-toolbar">
          <Button onClick={refresh} loading={busy} disabled={!backend}>
            刷新证据
          </Button>
          {kind !== "review" && (
            <Button
              onClick={() =>
                download(
                  kind === "audit"
                    ? "process-evidence-report.json"
                    : "configuration-snapshot.json",
                  {
                    exported_at: new Date().toISOString(),
                    scope:
                      kind === "audit"
                        ? "过程证据检查，未经正式 ASPICE 评级"
                        : "当前配置快照，未建立受控基线",
                    source: backend ? "backend" : "demo",
                    artifacts,
                    traces,
                    knowledge,
                    evidence,
                    checks,
                    audit_logs: logs,
                  },
                )
              }
            >
              导出{kind === "audit" ? "证据报告" : "配置快照"}
            </Button>
          )}
        </div>
        {kind === "review" && (
          <>
            <h2>待办工件 · {queue.length}</h2>
            <Table
              rowKey="id"
              dataSource={queue}
              columns={[
                { title: "工件", dataIndex: "name" },
                { title: "阶段", dataIndex: "stage" },
                { title: "版本", dataIndex: "version" },
                {
                  title: "状态",
                  dataIndex: "status",
                  render: (s) => (
                    <Tag color={s === "pending" ? "orange" : "red"}>
                      {s === "pending" ? "待评审" : "已驳回"}
                    </Tag>
                  ),
                },
                {
                  title: "操作",
                  render: (_, a) => (
                    <Button onClick={() => onArtifact(a)}>查看并评审</Button>
                  ),
                },
              ]}
            />
            <h2>已完成评审</h2>
            <Table
              rowKey="id"
              dataSource={artifacts.filter((a) => a.status === "approved")}
              columns={[
                { title: "工件", dataIndex: "name" },
                { title: "版本", dataIndex: "version" },
                {
                  title: "操作",
                  render: (_, a) => (
                    <Button onClick={() => showHistory(a)}>
                      历史与评审意见
                    </Button>
                  ),
                },
              ]}
            />
          </>
        )}
        {kind === "configuration" && (
          <>
            <h2>用户角色与令牌映射</h2>
            <Alert
              type="info"
              message="新增角色的后端权限等待范围确认；当前访问仍使用已有令牌授权。"
            />
            <Table
              rowKey="role"
              dataSource={roleRows}
              pagination={false}
              columns={[
                { title: "角色", dataIndex: "role" },
                { title: "规划职责", dataIndex: "purpose" },
                { title: "令牌变量", dataIndex: "variable" },
                {
                  title: "接入状态",
                  render: (_, r) => (
                    <Tag>{r.pending ? "后端授权待确认" : "已接入"}</Tag>
                  ),
                },
              ]}
            />
            <h2>配置项版本清单</h2>
            <Table
              rowKey="id"
              dataSource={artifacts}
              columns={[
                { title: "配置项 ID", dataIndex: "id" },
                { title: "名称", dataIndex: "name" },
                { title: "阶段", dataIndex: "stage" },
                { title: "当前版本", dataIndex: "version" },
                { title: "状态", dataIndex: "status" },
                {
                  title: "操作",
                  render: (_, a) => (
                    <Button onClick={() => showHistory(a)}>版本历史</Button>
                  ),
                },
              ]}
            />
            <div className="qa-toolbar">
              <Button onClick={() => onNavigate("knowledge")}>
                管理知识文档 · {knowledge.length}
              </Button>
              <Button onClick={() => onNavigate("agents")}>
                查看 Agent 配置
              </Button>
            </div>
          </>
        )}
        {kind === "audit" && (
          <>
            <Alert
              type="info"
              showIcon
              message="以下为项目过程证据检查，不能替代正式 ASPICE 评估或能力等级判定。"
            />
            <h2>阶段证据缺口</h2>
            <Table
              rowKey="stage"
              pagination={false}
              dataSource={checks}
              columns={[
                { title: "阶段", dataIndex: "stage" },
                { title: "工件数量", dataIndex: "count" },
                {
                  title: "检查结果",
                  render: (_, r) => (
                    <Tag color={r.gaps.length ? "orange" : "green"}>
                      {r.gaps.length
                        ? `${r.gaps.length} 项缺口`
                        : "当前检查无缺口"}
                    </Tag>
                  ),
                },
                {
                  title: "缺口说明",
                  render: (_, r) => r.gaps.join("；") || "已存在通过评审的工件",
                },
              ]}
            />
            <h2>
              缺失追溯 · {traces.filter((t) => t.status !== "完整").length}
            </h2>
            <Table
              rowKey="key"
              dataSource={traces.filter((t) => t.status !== "完整")}
              columns={[
                { title: "需求", dataIndex: "req" },
                { title: "设计", dataIndex: "design" },
                { title: "代码", dataIndex: "code" },
                { title: "测试", dataIndex: "test" },
                { title: "状态", dataIndex: "status" },
              ]}
            />
          </>
        )}
        <h2>审计事件</h2>
        <Table
          rowKey="id"
          dataSource={logs}
          columns={[
            { title: "时间", dataIndex: "time" },
            { title: "操作人角色", dataIndex: "actor" },
            { title: "事件", dataIndex: "event" },
            { title: "详情", dataIndex: "detail" },
          ]}
        />
      </section>
      <Modal
        title="工件版本与评审记录"
        width={850}
        open={history !== null}
        onCancel={() => setHistory(null)}
        footer={null}
      >
        <Table
          rowKey="version"
          dataSource={history || []}
          columns={[
            { title: "版本", dataIndex: "version" },
            { title: "状态", dataIndex: "status" },
            {
              title: "评审信息",
              render: (_, r) => JSON.stringify(r.review || {}),
            },
          ]}
          expandable={{
            expandedRowRender: (r) => (
              <pre style={{ whiteSpace: "pre-wrap" }}>{r.content}</pre>
            ),
          }}
        />
      </Modal>
    </>
  );
}
