import { useState } from "react";
import { Alert, Button, Input, InputNumber, Select, Table, Tag } from "antd";
import { api } from "./api";

export default function RetrievalEvaluation({
  backend,
  documents,
}: {
  backend: boolean;
  documents: any[];
}) {
  const [cases, setCases] = useState([
    { query: "", expected_sources: [] as string[] },
  ]);
  const [mode, setMode] = useState("keyword");
  const [topK, setTopK] = useState(4);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<any>(null);
  const sources = [
    ...new Set(documents.filter((d) => d.active !== false).map((d) => d.name)),
  ];
  async function evaluate() {
    setError("");
    setResult(null);
    if (cases.some((c) => !c.query.trim() || !c.expected_sources.length)) {
      setError("每道问题都需填写问题和期望命中文档。");
      return;
    }
    setBusy(true);
    try {
      const response = await api("/knowledge/evaluate", {
        method: "POST",
        body: JSON.stringify({ mode, top_k: topK, cases }),
      });
      setResult({ ...response, evaluated_at: new Date().toISOString() });
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  function download() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(result, null, 2)], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "retrieval-evaluation.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <section className="panel qa-panel">
      <h2>检索质量评估</h2>
      <p>
        填写真实工程问题并标注期望文档，检查召回率、命中率与首个相关文档排名。结果只反映当前问题集，不代表回答正确性或合规结论。
      </p>
      {cases.map((c, i) => (
        <div className="qa-toolbar" key={i}>
          <Input
            aria-label={`评估问题 ${i + 1}`}
            placeholder="工程问题"
            value={c.query}
            maxLength={2000}
            disabled={busy}
            onChange={(e) =>
              setCases(
                cases.map((r, n) =>
                  n === i ? { ...r, query: e.target.value } : r,
                ),
              )
            }
            style={{ minWidth: 280 }}
          />
          <Select
            aria-label={`期望文档 ${i + 1}`}
            mode="multiple"
            placeholder="期望命中的文档"
            value={c.expected_sources}
            disabled={busy}
            options={sources.map((value) => ({ value, label: value }))}
            onChange={(expected_sources) =>
              setCases(
                cases.map((r, n) => (n === i ? { ...r, expected_sources } : r)),
              )
            }
            style={{ minWidth: 280 }}
          />
          <Button
            disabled={busy || cases.length === 1}
            onClick={() => setCases(cases.filter((_, n) => n !== i))}
          >
            移除问题
          </Button>
        </div>
      ))}
      <div className="qa-toolbar">
        <Button
          disabled={busy || cases.length >= 50}
          onClick={() =>
            setCases([...cases, { query: "", expected_sources: [] }])
          }
        >
          添加评估问题
        </Button>
        <Select
          aria-label="评估检索模式"
          value={mode}
          disabled={busy}
          onChange={setMode}
          options={[
            { value: "keyword", label: "关键词" },
            { value: "hybrid", label: "混合" },
            { value: "vector", label: "向量" },
          ]}
        />
        <InputNumber
          aria-label="评估 Top K"
          min={1}
          max={20}
          value={topK}
          disabled={busy}
          onChange={(v) => setTopK(v || 4)}
        />
        <Button
          type="primary"
          loading={busy}
          disabled={!backend || !sources.length}
          onClick={evaluate}
        >
          运行检索评估
        </Button>
        <Button disabled={!result || busy} onClick={download}>
          导出评估结果
        </Button>
      </div>
      {error && <Alert type="error" message={error} />}
      {result && (
        <>
          <p>
            <Tag>
              Recall@{result.top_k}：
              {(result.mean_recall_at_k * 100).toFixed(1)}%
            </Tag>
            <Tag>MRR：{result.mrr.toFixed(3)}</Tag>
            <Tag>命中率：{(result.hit_rate * 100).toFixed(1)}%</Tag>
          </p>
          <Table
            rowKey="query"
            dataSource={result.cases}
            columns={[
              { title: "问题", dataIndex: "query" },
              {
                title: "期望文档",
                dataIndex: "expected_sources",
                render: (v: string[]) => v.join("、"),
              },
              {
                title: "实际召回",
                dataIndex: "retrieved_sources",
                render: (v: string[]) => v.join("、") || "无结果",
              },
              {
                title: "命中",
                dataIndex: "hit",
                render: (v: boolean) => (
                  <Tag color={v ? "green" : "red"}>{v ? "命中" : "未命中"}</Tag>
                ),
              },
            ]}
          />
        </>
      )}
    </section>
  );
}
