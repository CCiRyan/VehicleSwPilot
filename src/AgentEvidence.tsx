import { useEffect, useState } from "react";
import { App, Button, Tag, Select, Modal, Empty } from "antd";
import { ShieldCheck, Code2, BookOpen, GitBranch } from "lucide-react";
import { api } from "./api";
import type { Artifact } from "./data";
export default function AgentEvidence({
  artifact,
  artifacts,
  backend,
}: {
  artifact: Artifact;
  artifacts: Artifact[];
  backend: boolean;
}) {
  const { message } = App.useApp();
  const [busy, setBusy] = useState(false),
    [safety, setSafety] = useState(artifact.safety_report),
    [execution, setExecution] = useState(artifact.execution),
    [harness, setHarness] = useState<string>();
  useEffect(() => {
    let active = true;
    setSafety(artifact.safety_report);
    setExecution(artifact.execution);
    if (backend) {
      api("/evidence/" + artifact.id)
        .then((items) => {
          if (!active) return;
          const current = items.filter(
            (v: any) => v.artifact_version === artifact.version,
          );
          const analysis = current.find((v: any) => v.type === "safety_review");
          const executed = current.find((v: any) => v.action);
          if (analysis) setSafety(analysis.report);
          if (executed) setExecution(executed);
        })
        .catch(() => {});
    }
    return () => {
      active = false;
    };
  }, [artifact.id, artifact.version, backend]);
  async function execute(action: string) {
    setBusy(true);
    try {
      const result = await api("/simulation", {
        method: "POST",
        body: JSON.stringify({
          artifact_id: artifact.id,
          action,
          harness_artifact_id: harness,
        }),
      });
      setExecution(result);
      Modal.info({
        title: "执行证据 · " + result.status,
        width: 800,
        content: (
          <>
            <p>{result.scope}</p>
            <pre className="execution-output">
              {result.stdout || "没有标准输出"}
            </pre>
          </>
        ),
      });
    } catch (e) {
      message.error(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="side-section">
        <h3>
          <ShieldCheck size={13} /> 安全评审发现
        </h3>
        {safety?.findings?.length ? (
          safety.findings.map((f, i) => (
            <details className={"finding " + f.severity} key={i}>
              <summary>
                <Tag
                  color={
                    f.severity === "error"
                      ? "red"
                      : f.severity === "warning"
                        ? "orange"
                        : "blue"
                  }
                >
                  {f.severity}
                </Tag>
                {f.message}
              </summary>
              <small>{f.code}</small>
              <p>依据：{f.evidence}</p>
              <p>建议：{f.recommendation}</p>
            </details>
          ))
        ) : (
          <p>本工件尚无真实安全评审记录。</p>
        )}
        <Button
          block
          size="small"
          loading={busy}
          disabled={!backend}
          onClick={async () => {
            setBusy(true);
            try {
              const result = await api("/agents/safety/analyze", {
                method: "POST",
                body: JSON.stringify({ artifact_id: artifact.id, asil: "B" }),
              });
              setSafety(result.report);
              message.success(
                result.mode === "model"
                  ? "独立安全评审已保存"
                  : "离线证据检查已保存，未调用模型",
              );
            } catch (e) {
              message.error(String(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          独立安全分析
        </Button>
      </div>
      <div className="side-section">
        <h3>
          <BookOpen size={13} /> 知识引用
        </h3>
        {artifact.references?.length ? (
          artifact.references.map((r) => (
            <details className="evidence-reference" key={r.citation_id}>
              <summary>
                {r.source} · 页 {r.page}
              </summary>
              <small>{r.citation_id}</small>
              <p>{r.section}</p>
              <p>{r.content}</p>
            </details>
          ))
        ) : (
          <p>本工件尚未附带检索来源。</p>
        )}
      </div>
      <div className="side-section">
        <h3>
          <GitBranch size={13} /> 输入基线
        </h3>
        {artifact.baseline?.map((b) => (
          <p key={b.id}>
            {b.id} · v{b.version} · {b.stage}
          </p>
        ))}
        {!artifact.baseline?.length && <p>手工工件；生成时会固定上游版本。</p>}
      </div>
      <div className="side-section">
        <h3>
          <Code2 size={13} /> 执行与检查证据
        </h3>
        <p>{execution?.summary || execution?.scope || "尚未执行编译或测试"}</p>
        {execution && <Tag>{execution.status}</Tag>}
        {execution?.diagnostics?.map((d, i) => (
          <p key={i}>
            {d.file}:{d.line} · {d.rule}
            <br />
            {d.message}
          </p>
        ))}
        {artifact.structured?.files?.length || artifact.name.endsWith(".c") ? (
          <>
            <Button
              block
              size="small"
              loading={busy}
              disabled={!backend || artifact.status !== "approved"}
              onClick={() => execute("compile")}
            >
              容器编译检查
            </Button>
            <Select
              style={{ width: "100%", margin: "9px 0" }}
              value={harness}
              onChange={setHarness}
              placeholder="选择已评审测试 Harness"
              options={artifacts
                .filter(
                  (a) => a.status === "approved" && a.structured?.test_harness,
                )
                .map((a) => ({ value: a.id, label: a.name }))}
            />
            <Button
              block
              size="small"
              loading={busy}
              disabled={!backend || !harness || artifact.status !== "approved"}
              onClick={() => execute("unit_test")}
            >
              容器执行单元测试
            </Button>
            <p>代码与 Harness 均需通过人工评审；需启用本机 Docker 执行器。</p>
          </>
        ) : null}
      </div>
    </>
  );
}
