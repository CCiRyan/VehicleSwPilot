import { useEffect, useState } from "react";
import { Alert, Button, Input, Tag } from "antd";
import { api } from "./api";
type Paths = {
  root: string;
  documents: string;
  source: string;
  tests: string;
  reports: string;
};
const empty: Paths = {
  root: "",
  documents: "docs",
  source: "generated/src",
  tests: "generated/tests",
  reports: "deliverables",
};
const labels: Record<keyof Paths, string> = {
  root: "项目根目录",
  documents: "文档目录",
  source: "源码目录",
  tests: "测试目录",
  reports: "报告目录",
};
export default function ProjectPaths({
  projectId = "default",
  backend,
  role,
}: {
  projectId?: string;
  backend: boolean;
  role: string;
}) {
  const local = projectId !== "default" || !backend;
  const [paths, setPaths] = useState<Paths>(empty);
  const [version, setVersion] = useState(0),
    [busy, setBusy] = useState(false),
    [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const writable = local || ["安全经理", "系统工程师"].includes(role);
  async function reload() {
    setBusy(true);
    setError("");
    setNotice("");
    setLoaded(false);
    try {
      const result = local
        ? JSON.parse(localStorage.getItem(`pilot-paths-${projectId}`) || "null")
        : await api("/workspace/paths");
      setPaths(result?.paths || empty);
      setVersion(result?.version || 0);
      setLoaded(true);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    reload();
  }, [projectId, backend]);
  async function save() {
    if (!paths.root.trim()) {
      setError("请填写项目根目录的绝对路径。");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = local
        ? { paths, version: version + 1 }
        : await api("/workspace/paths", {
            method: "PUT",
            body: JSON.stringify({ paths, version }),
          });
      if (local)
        localStorage.setItem(
          `pilot-paths-${projectId}`,
          JSON.stringify(result),
        );
      setPaths(result.paths);
      setVersion(result.version);
      setNotice(
        local
          ? "目录配置已保存在本地项目草稿中。"
          : "项目目录配置已保存。未创建、迁移或同步文件。",
      );
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="project-paths">
      <h3>
        项目目录配置 <Tag>v{version}</Tag>
      </h3>
      <p>根目录使用绝对路径；其他目录可填写绝对路径或相对根目录的路径。</p>
      <Alert
        type="info"
        showIcon
        message={
          local
            ? "本地草稿配置；后端项目空间尚未启用。"
            : "当前保存的是目录配置。工件仍由数据库管理，文件读写与同步尚未启用。"
        }
      />
      {!writable && (
        <Alert
          type="warning"
          message="当前角色可查看目录；修改需使用现有系统工程师或安全经理令牌。"
        />
      )}
      {(Object.keys(labels) as (keyof Paths)[]).map((key) => (
        <label key={key}>
          {labels[key]}
          <Input
            aria-label={labels[key]}
            value={paths[key]}
            disabled={busy || !loaded || !writable}
            onChange={(e) => {
              setPaths({ ...paths, [key]: e.target.value });
              setNotice("");
            }}
            placeholder={key === "root" ? "例如 D:\\Projects\\VCP" : empty[key]}
            maxLength={1024}
          />
        </label>
      ))}
      {error && <Alert type="error" showIcon message={error} />}{" "}
      {notice && <Alert type="success" showIcon message={notice} />}
      <div className="qa-toolbar">
        <Button onClick={reload} disabled={busy}>
          重新加载
        </Button>
        <Button
          type="primary"
          loading={busy}
          disabled={!loaded || !writable}
          onClick={save}
        >
          保存目录配置
        </Button>
      </div>
    </section>
  );
}
