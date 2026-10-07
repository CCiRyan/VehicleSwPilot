import { useEffect, useState } from "react";
import { Alert, Button, Input, Select, Steps } from "antd";
import { api } from "./api";
import { type Artifact } from "./data";
type Definition = {
  fullName: string;
  scope: string;
  hardware: string;
  interfaces: string;
  asil: string;
  acceptance: string;
  exclusions: string;
};
const empty: Definition = {
  fullName: "",
  scope: "",
  hardware: "",
  interfaces: "",
  asil: "待确认",
  acceptance: "",
  exclusions: "",
};
const fields: Record<string, string> = {
  fullName: "VCP 全称",
  scope: "主要功能与运行场景",
  hardware: "目标硬件与工具链",
  interfaces: "通信接口与外部依赖",
  acceptance: "验收条件",
  exclusions: "范围外功能与待确认事项",
};
export default function ProjectDefinition({
  backend,
  role,
  onCreated,
}: {
  backend: boolean;
  role: string;
  onCreated: (artifact: Artifact) => void;
}) {
  const [definition, setDefinition] = useState<Definition>(() => {
    try {
      return {
        ...empty,
        ...JSON.parse(localStorage.getItem("pilot-definition-default") || "{}"),
      };
    } catch {
      return empty;
    }
  });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [version, setVersion] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const canWrite = ["安全经理", "系统工程师"].includes(role);
  async function load() {
    setBusy(true);
    setError("");
    try {
      const result = await api("/workspace/definition");
      if (result.version > 0) {
        setDefinition(result.definition);
        localStorage.setItem(
          "pilot-definition-default",
          JSON.stringify(result.definition),
        );
      }
      setVersion(result.version);
      setLoaded(true);
    } catch (e) {
      setError(String(e));
      setLoaded(false);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (backend) void load();
    else setLoaded(false);
  }, [backend]);
  async function save() {
    if (backend) {
      const result = await api("/workspace/definition", {
        method: "PUT",
        body: JSON.stringify({ version, definition }),
      });
      setVersion(result.version);
    }
    localStorage.setItem(
      "pilot-definition-default",
      JSON.stringify(definition),
    );
    setNotice(
      backend
        ? "项目定义已保存到服务端；尚未批准需求。"
        : "离线草稿已保存到当前浏览器；尚未批准需求。",
    );
  }
  async function create() {
    if (!definition.fullName.trim() || !definition.scope.trim()) {
      setError("请至少填写 VCP 全称和主要功能。");
      return;
    }
    setBusy(true);
    setError("");
    const content =
      "# VCP 项目定义与系统需求输入\n\n【用户输入，需人工评审；不是已批准需求基线】\n\n" +
      Object.entries(fields)
        .map(
          ([key, label]) =>
            `## ${label}\n${definition[key as keyof Definition].trim() || "待确认，不得由 AI 假定。"}`,
        )
        .join("\n\n") +
      `\n\n## 安全等级\n${definition.asil}${definition.asil !== "待确认" ? "（用户指定，仍需安全分析确认）" : "，尚未完成安全分析。"}\n\n## 工程约束\n本需求输入不继承历史 BMS 示例的电压阈值、采样周期或保护算法。后续分解须追溯到人工批准的当前版本；未确认的参数不得进入实现。`;
    try {
      await save();
      const artifact = await api("/artifacts", {
        method: "POST",
        body: JSON.stringify({
          name: "VCP 系统需求输入",
          stage: "系统需求",
          content,
        }),
      });
      onCreated(artifact);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel qa-panel">
      <h2>VCP 项目定义</h2>
      <p>
        在界面提供项目事实，生成可评审的系统需求输入。无需在聊天中提供完整项目规格。
      </p>
      <Alert
        showIcon
        type="info"
        message="未填写信息保持待确认；安全等级和验收条件需要工程师确认。生成工件会使下游已批准工件重新进入评审。"
      />
      <div className="project-paths">
        {Object.entries(fields).map(([key, label]) => (
          <label key={key}>
            {label}
            <Input.TextArea
              aria-label={label}
              autoSize={{ minRows: key === "fullName" ? 1 : 3, maxRows: 8 }}
              maxLength={key === "fullName" ? 200 : 3000}
              disabled={backend && (!loaded || !canWrite || busy)}
              value={definition[key as keyof Definition]}
              onChange={(e) => {
                setDefinition({ ...definition, [key]: e.target.value });
                setNotice("");
              }}
            />
          </label>
        ))}
        <label>
          ASIL 等级
          <Select
            aria-label="项目定义 ASIL"
            value={definition.asil}
            disabled={backend && (!loaded || !canWrite || busy)}
            onChange={(asil) => setDefinition({ ...definition, asil })}
            options={["待确认", "QM", "A", "B", "C", "D"].map((value) => ({
              value,
              label: value,
            }))}
          />
        </label>
      </div>
      {error && <Alert type="error" message={error} />}{" "}
      {notice && <Alert type="success" message={notice} />}
      <div className="qa-toolbar">
        <Button
          disabled={busy || (backend && (!loaded || !canWrite))}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              await save();
            } catch (e) {
              setError(String(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          保存定义草稿
        </Button>
        {backend && (
          <Button disabled={busy} onClick={load}>
            重新加载服务端定义
          </Button>
        )}
        <Button
          type="primary"
          loading={busy}
          disabled={!backend || !loaded || !canWrite || busy}
          onClick={create}
        >
          生成待评审系统需求
        </Button>
      </div>
      <h3>需求到测试的推进顺序</h3>
      <Steps
        direction="vertical"
        items={[
          "系统需求输入与人工评审",
          "软件需求与软件架构",
          "详细设计及边界条件",
          "C 源码与人工评审",
          "测试用例、测试桩及执行证据",
        ].map((title) => ({ title }))}
      />
      <p>
        首次填写是需求输入。只有经过人工评审的工件才能作为后续 Agent
        的批准基线。
      </p>
    </section>
  );
}
