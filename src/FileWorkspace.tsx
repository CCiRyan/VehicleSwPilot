import { useEffect, useState } from "react";
import { Alert, Button, Select, Table, Tag, Modal } from "antd";
import { api } from "./api";
import { type Artifact } from "./data";
export default function FileWorkspace({
  backend,
  artifacts,
  onArtifact,
}: {
  backend: boolean;
  artifacts: Artifact[];
  onArtifact: (a: Artifact) => void;
}) {
  const [scope, setScope] = useState("documents"),
    [mode, setMode] = useState("keyword"),
    [files, setFiles] = useState<any[]>([]),
    [selected, setSelected] = useState<React.Key[]>([]);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [caps, setCaps] = useState<any>(null);
  const [exportId, setExportId] = useState<string>();
  const [preview, setPreview] = useState<any>(null);
  async function previewFile(path: string) {
    setError("");
    try {
      setPreview(
        await api(
          `/workspace/files/preview?scope=${scope}&path=${encodeURIComponent(path)}`,
        ),
      );
    } catch (e) {
      setError(String(e));
    }
  }
  async function refresh() {
    if (!backend) return;
    setBusy(true);
    setError("");
    setSelected([]);
    try {
      const [f, c] = await Promise.all([
        api(`/workspace/files?scope=${scope}`),
        api("/simulation/capabilities"),
      ]);
      setFiles(f);
      setCaps(c);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    refresh();
  }, [backend, scope]);
  async function importFiles() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await api("/workspace/files/import", {
        method: "POST",
        body: JSON.stringify({ scope, files: selected, index_mode: mode }),
      });
      if (result.artifact) {
        onArtifact(result.artifact);
      } else {
        setNotice(`已入库 ${result.documents.length} 个文档。`);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  async function exportFile() {
    const a = artifacts.find((a) => a.id === exportId);
    if (!a) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await api("/workspace/files/export", {
        method: "POST",
        body: JSON.stringify({ artifact_id: a.id, version: a.version }),
      });
      setNotice(`已写入 ${result.files.length} 个文件，版本与哈希已记录。`);
      refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel qa-panel">
      <h2>工程文件与验证</h2>
      <Alert
        type="info"
        showIcon
        message="显式导入 / 导出，保留版本与来源哈希。当前仅访问本工程目录内配置路径，不自动同步、执行源码或覆盖已有文件。"
      />
      {!backend && (
        <Alert type="warning" message="请连接后端以操作工程目录。" />
      )}
      <h3>目录文件</h3>
      <div className="qa-toolbar">
        <Select
          aria-label="工程目录类别"
          value={scope}
          onChange={setScope}
          options={[
            { value: "documents", label: "文档目录" },
            { value: "source", label: "源码目录" },
            { value: "tests", label: "测试目录" },
            { value: "reports", label: "报告目录" },
          ]}
        />
        {scope === "documents" && (
          <Select
            aria-label="文件入库模式"
            value={mode}
            onChange={setMode}
            options={[
              { value: "keyword", label: "关键词入库" },
              { value: "vector", label: "向量与关键词入库" },
            ]}
          />
        )}
        <Button onClick={refresh} disabled={!backend || busy}>
          扫描目录
        </Button>
        <Button
          type="primary"
          loading={busy}
          disabled={!backend || !selected.length || scope === "reports"}
          onClick={importFiles}
        >
          {scope === "documents" ? "导入知识库" : "导入待评审工件"}
        </Button>
      </div>
      <Table
        rowKey="path"
        dataSource={files}
        rowSelection={{ selectedRowKeys: selected, onChange: setSelected }}
        columns={[
          { title: "文件", dataIndex: "path" },
          { title: "大小", dataIndex: "size", render: (s) => `${s} bytes` },
          {
            title: "操作",
            render: (_, row) => (
              <Button onClick={() => previewFile(row.path)}>预览</Button>
            ),
          },
        ]}
        locale={{ emptyText: "该配置目录暂无受支持文件" }}
      />
      <Modal
        title={preview?.name || "文件预览"}
        open={!!preview}
        onCancel={() => setPreview(null)}
        footer={null}
        width={900}
      >
        <p>SHA-256：{preview?.sha256}</p>
        {preview?.truncated && (
          <Alert
            type="warning"
            message="仅显示前 100000 字符；导入仍使用完整文件。"
          />
        )}
        {preview?.content !== null ? (
          <pre
            style={{ whiteSpace: "pre-wrap", maxHeight: 550, overflow: "auto" }}
          >
            {preview?.content}
          </pre>
        ) : (
          <Alert type="info" message={preview?.message} />
        )}
      </Modal>
      <h3>导出已批准工件到配置目录</h3>
      <div className="qa-toolbar">
        <Select
          aria-label="待导出工件"
          placeholder="选择已批准的工件"
          value={exportId}
          onChange={setExportId}
          style={{ minWidth: 300 }}
          options={artifacts
            .filter((a) => a.status === "approved")
            .map((a) => ({ value: a.id, label: `${a.name} · v${a.version}` }))}
        />
        <Button disabled={!backend || !exportId || busy} onClick={exportFile}>
          写入配置目录
        </Button>
      </div>
      <h3>真实执行环境</h3>
      <p>
        <Tag color={caps?.docker_available ? "green" : "orange"}>
          {caps?.docker_available ? "Docker CLI 可用" : "Docker CLI 未安装"}
        </Tag>
        <Tag>
          {caps?.container_execution_enabled
            ? "容器执行已启用"
            : "容器执行未启用"}
        </Tag>
      </p>
      <p>
        代码与测试桩批准后，在阶段工作台右侧进行编译 /
        单元测试。仅容器实际运行成功才产生通过证据；生成用例不等于执行通过。
      </p>
      {error && <Alert type="error" showIcon message={error} />}{" "}
      {notice && <Alert type="success" showIcon message={notice} />}
    </section>
  );
}
