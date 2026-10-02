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
export default function QuestionPanel({ backend }: { backend: boolean }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [question, setQuestion] = useState("");
  const [mode, setMode] = useState("hybrid");
  const [category, setCategory] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function ask(value = question) {
    if (!value.trim() || busy || !backend) return;
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
          <p>结合知识库理解需求、设计与验证问题，回答附带可展开的资料来源。</p>
        </div>
        <Tag>AI 生成，需人工核实</Tag>
      </div>
      {!backend && (
        <Alert
          type="warning"
          showIcon
          message="请先启动后端并在工作空间设置中配置访问令牌。"
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
                    disabled={!backend || busy}
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
                    : t.mode === "retrieval_only"
                      ? "仅检索资料"
                      : "缺少知识依据"}
                </Tag>
              )}
              <p className="qa-answer">{t.content}</p>
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
        {error && <Alert type="error" showIcon message={error} />}
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
            disabled={!backend || !question.trim()}
            onClick={() => ask()}
          >
            发送问题
          </Button>
        </div>
      </section>
    </>
  );
}
