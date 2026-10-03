import { useState } from "react";
import { Alert, App, Button, Input, Modal, Select, Tag } from "antd";
import { Folder, Plus, ChevronDown } from "lucide-react";
import ProjectPaths from "./ProjectPaths";
type ProjectDraft = {
  id: string;
  name: string;
  description: string;
  asil: string;
};
const existing: ProjectDraft = {
  id: "default",
  name: "VCP 控制器",
  description: "VCP 控制器软件开发项目",
  asil: "B",
};
export default function ProjectSwitcher({
  backend,
  role,
}: {
  backend: boolean;
  role: string;
}) {
  const { message } = App.useApp();
  const [open, setOpen] = useState(false),
    [creating, setCreating] = useState(false);
  const [drafts, setDrafts] = useState<ProjectDraft[]>(() => {
    try {
      const value = JSON.parse(
        localStorage.getItem("pilot-project-drafts") || "[]",
      );
      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  });
  const [selected, setSelected] = useState(existing);
  const [name, setName] = useState(""),
    [description, setDescription] = useState(""),
    [asil, setAsil] = useState("B");
  function saveDraft() {
    if (!name.trim()) {
      message.error("请输入项目名称");
      return;
    }
    if (
      [existing, ...drafts].some(
        (p) => p.name.toLowerCase() === name.trim().toLowerCase(),
      )
    ) {
      message.error("项目名称已存在");
      return;
    }
    const draft = {
      id: crypto.randomUUID(),
      name: name.trim(),
      description: description.trim(),
      asil,
    };
    const next = [...drafts, draft];
    setDrafts(next);
    localStorage.setItem("pilot-project-drafts", JSON.stringify(next));
    setSelected(draft);
    setCreating(false);
    setName("");
    setDescription("");
    message.success("项目草稿已保存，后端空间等待启用");
  }
  return (
    <>
      <button
        className="project-switch"
        aria-label="选择项目空间"
        onClick={() => setOpen(true)}
      >
        <span className="project-icon">
          <Folder size={17} />
        </span>
        <span>
          {existing.name}
          <small>{existing.description}</small>
        </span>
        <ChevronDown size={14} />
      </button>
      <Modal
        title="选择项目空间"
        open={open}
        width={720}
        onCancel={() => setOpen(false)}
        footer={<Button onClick={() => setOpen(false)}>关闭</Button>}
      >
        <Alert
          type="info"
          showIcon
          message="新项目的后端存储与访问模型等待确认。可先配置项目草稿；草稿不会使用现有 VCP 的工件或知识库。"
        />
        <div className="project-picker-layout">
          <div className="project-picker-list">
            {[existing, ...drafts].map((p) => (
              <button
                key={p.id}
                className={
                  selected.id === p.id
                    ? "project-choice selected"
                    : "project-choice"
                }
                onClick={() => {
                  setSelected(p);
                  setCreating(false);
                }}
              >
                <Folder size={18} />
                <div>
                  <strong>{p.name}</strong>
                  <small>{p.description || "未填写描述"}</small>
                </div>
                <Tag>{p.id === "default" ? "当前项目" : "草稿"}</Tag>
              </button>
            ))}
            <Button icon={<Plus size={16} />} onClick={() => setCreating(true)}>
              新建项目草稿
            </Button>
          </div>
          <div className="project-picker-detail">
            {creating ? (
              <>
                <h3>创建项目</h3>
                <label>
                  项目名称
                  <Input
                    aria-label="项目名称"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={100}
                    placeholder="例如：VCU 控制器"
                  />
                </label>
                <label>
                  项目描述
                  <Input.TextArea
                    aria-label="项目描述"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    maxLength={1000}
                    rows={3}
                  />
                </label>
                <label>
                  ASIL 等级
                  <Select
                    aria-label="项目 ASIL"
                    value={asil}
                    onChange={setAsil}
                    options={["QM", "A", "B", "C", "D"].map((value) => ({
                      value,
                      label: value,
                    }))}
                  />
                </label>
                <Button type="primary" onClick={saveDraft}>
                  保存项目草稿
                </Button>
              </>
            ) : (
              <>
                <h3>{selected.name}</h3>
                <p>{selected.description || "未填写项目描述"}</p>
                <Tag>ASIL {selected.asil}</Tag>
                <p>
                  {selected.id === "default"
                    ? "原项目数据保留；当前使用此空间。"
                    : "项目元数据已保存。本草稿尚未建立后端空间，没有工程工件。"}
                </p>
                <Button
                  type="primary"
                  disabled={selected.id !== "default"}
                  onClick={() => setOpen(false)}
                >
                  {selected.id === "default" ? "进入项目" : "后端空间待启用"}
                </Button>
                <ProjectPaths
                  key={selected.id}
                  projectId={selected.id}
                  backend={backend}
                  role={role}
                />
              </>
            )}
          </div>
        </div>
      </Modal>
    </>
  );
}
