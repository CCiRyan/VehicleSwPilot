import { useState } from "react";
import { Alert, Button, Collapse, Empty, Input, Select, Tag } from "antd";
import { MessageSquare, Send } from "lucide-react";
import { api } from "./api";

type Turn = {
  role: "user" | "assistant";
  content: string;
  references?: any[];
  citations?: string[];
  warnings?: string[];
  mode?: string;
};
export default function QuestionPanel({
  backend,
  onOpenSettings,
}: {
  backend: boolean;
  onOpenSettings: () => void;
}) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [question, setQuestion] = useState("");
  const [mode, setMode] = useState("hybrid");
  const [category, setCategory] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function ask(value = question) {
    if (!value.trim() || busy) return;
    if (!sessionStorage.getItem("pilot-token")?.trim()) {
      setError(
        "请在工作空间设置中填写访问令牌（PILOT_AUTH_TOKEN），它与模型 API Key 不同。",
      );
      onOpenSettings();
      return;
    }
    setBusy(true);
    setError("");
    const user: Turn = { role: "user", content: value.trim() };
    try {
      const result = await api("/questions", {
        method: "POST",
        body: JSON.stringify({
          question: user.content,
          history: turns
            .slice(-10)
            .map((t) => ({ role: t.role, content: t.content.slice(0, 4000) })),
          mode,
          category,
        }),
      });
      setTurns([
        ...turns,
        user,
        { role: "assistant", content: result.answer, ...result },
      ]);
      setQuestion("");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="section-callout">
        <MessageSquare size={24} />
        <div>
          <strong>工程知识问答</strong>
          <p>
            优先检索工程知识；未命中时由通用大模型回答，知识库回答附带资料来源。
          </p>
        </div>
        <Tag>AI 生成，需人工核实</Tag>
      </div>
      {!backend && (
        <Alert
          type="warning"
          showIcon
          message="正在等待后端连接；服务启动后会自动重连。你也可以直接发送问题重试。"
          action={<Button onClick={onOpenSettings}>连接设置</Button>}
        />
      )}
      <section className="panel qa-panel">
        <div className="qa-toolbar">
          <Select
            aria-label="问答检索模式"
            value={mode}
            disabled={busy}
            onChange={setMode}
            options={[
              { value: "hybrid", label: "混合检索" },
              { value: "keyword", label: "关键词检索" },
              { value: "vector", label: "向量检索" },
            ]}
          />
          <Select
            aria-label="问答知识类别"
            placeholder="全部知识类别"
            allowClear
            value={category}
            disabled={busy}
            onChange={setCategory}
            options={[
              "AUTOSAR",
              "MISRA",
              "ISO 26262",
              "需求 / SRS",
              "项目规范",
            ].map((label, i) => ({
              label,
              value: ["autosar", "misra", "iso26262", "srs", "project"][i],
            }))}
          />
          <Button
            disabled={busy || !turns.length}
            onClick={() => {
              setTurns([]);
              setError("");
            }}
          >
            新建对话
          </Button>
          <span>对话仅保存在当前页面</span>
        </div>
        <div className="qa-messages" aria-live="polite">
          {!turns.length && (
            <>
              <Empty description="从一个工程问题开始" />
              <div className="qa-examples">
                {[
                  "知识库中对软件需求追溯有哪些要求？",
                  "如何根据现有需求设计边界值测试？",
                  "资料中有哪些 AUTOSAR 接口设计约束？",
                ].map((q) => (
                  <Button
                    key={q}
                    disabled={busy}
                    onClick={() => setQuestion(q)}
                  >
                    {q}
                  </Button>
                ))}
              </div>
            </>
          )}
          {turns.map((t, i) => (
            <article className={`qa-turn ${t.role}`} key={i}>
              <strong>{t.role === "user" ? "我的问题" : "知识问答助手"}</strong>
              {t.role === "assistant" && (
                <Tag>
                  {t.mode === "model"
                    ? "AI 生成，需人工核实"
                    : t.mode === "general_model"
                      ? "通用模型回答 · 未引用知识库"
                      : t.mode === "retrieval_only"
                        ? "仅检索资料"
                        : "缺少知识依据"}
                </Tag>
              )}
              <p className="qa-answer">{t.content}</p>
              {t.mode === "general_model" && (
                <p className="qa-source-note">
                  未命中知识库，本回答基于模型通用知识，需人工核实。
                </p>
              )}
              {t.warnings?.map((w) => (
                <Alert key={w} type="warning" message={w} />
              ))}
              {!!t.references?.length && (
                <Collapse
                  items={t.references.map((r) => ({
                    key: r.citation_id,
                    label: (
                      <span>
                        {t.citations?.includes(r.citation_id) && (
                          <Tag color="green">回答引用</Tag>
                        )}
                        {r.source} · {r.section || "正文"} · {r.citation_id}
                      </span>
                    ),
                    children: (
                      <>
                        <div>
                          <Tag>版本 {r.version || "未指定"}</Tag>
                          {r.page && <Tag>第 {r.page} 页</Tag>}
                        </div>
                        <p className="qa-answer">{r.content}</p>
                      </>
                    ),
                  }))}
                />
              )}
            </article>
          ))}
          {busy && <p>正在检索知识并生成回答…</p>}
        </div>
        {error && (
          <Alert
            type="error"
            showIcon
            message={error}
            action={<Button onClick={onOpenSettings}>连接设置</Button>}
          />
        )}
        <div className="qa-compose">
          <Input.TextArea
            aria-label="问答问题"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="输入工程问题；Ctrl + Enter 发送"
            maxLength={2000}
            showCount
            autoSize={{ minRows: 3, maxRows: 7 }}
            disabled={busy}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                ask();
              }
            }}
          />
          <Button
            type="primary"
            icon={<Send size={16} />}
            loading={busy}
            disabled={busy || !question.trim()}
            onClick={() => ask()}
          >
            发送问题
          </Button>
        </div>
      </section>
    </>
  );
}
