import { useEffect, useState } from "react";
import {
  App,
  Button,
  Tag,
  Select,
  Input,
  InputNumber,
  Upload,
  Table,
  Modal,
  Empty,
  Spin,
} from "antd";
import { BookOpen, UploadCloud, RefreshCw, Search } from "lucide-react";
import { api } from "./api";
import { stages } from "./data";
import RetrievalEvaluation from "./RetrievalEvaluation";
const categories = [
  { value: "other", label: "其他资料" },
  { value: "autosar", label: "AUTOSAR" },
  { value: "misra", label: "MISRA" },
  { value: "iso26262", label: "ISO 26262" },
  { value: "srs", label: "需求 / SRS" },
  { value: "project", label: "项目规范" },
];
export default function KnowledgePanel({ backend }: { backend: boolean }) {
  const { message } = App.useApp();
  const [documents, setDocuments] = useState<any[]>([]),
    [stats, setStats] = useState<any>(null),
    [busy, setBusy] = useState(false);
  const [category, setCategory] = useState("other"),
    [version, setVersion] = useState(""),
    [asil, setAsil] = useState(""),
    [stage, setStage] = useState(""),
    [indexMode, setIndexMode] = useState("vector");
  const [size, setSize] = useState(900),
    [overlap, setOverlap] = useState(100),
    [query, setQuery] = useState(""),
    [mode, setMode] = useState("hybrid"),
    [filter, setFilter] = useState(""),
    [topK, setTopK] = useState(4),
    [results, setResults] = useState<any[]>([]);
  const [detail, setDetail] = useState<any>(null),
    [searched, setSearched] = useState(false);
  const [searchVersion, setSearchVersion] = useState(""),
    [searchAsil, setSearchAsil] = useState(""),
    [searchStage, setSearchStage] = useState("");
  async function refresh() {
    if (!backend) return;
    try {
      const [docs, summary] = await Promise.all([
        api("/knowledge"),
        api("/knowledge/stats"),
      ]);
      setDocuments(docs);
      setStats(summary);
    } catch (e) {
      message.error(String(e));
    }
  }
  useEffect(() => {
    refresh();
  }, [backend]);
  async function search() {
    if (!query.trim()) return;
    setBusy(true);
    try {
      setResults(
        await api("/knowledge/search", {
          method: "POST",
          body: JSON.stringify({
            query,
            mode,
            top_k: topK,
            category: filter || null,
            version: searchVersion || null,
            asil: searchAsil || null,
            stage: searchStage || null,
          }),
        }),
      );
      setSearched(true);
    } catch (e) {
      message.error(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="section-callout">
        <BookOpen size={24} />
        <div>
          <strong>工程知识，有来源才能有依据</strong>
          <p>章节与规则切片 · Faiss + BM25 混合检索 · 引用可回溯 · 版本隔离</p>
        </div>
        <Tag>
          {stats
            ? `${stats.active_documents} 文档 / ${stats.chunks} 片段`
            : "RAG KNOWLEDGE"}
        </Tag>
      </div>
      <div className="knowledge-grid">
        <section className="panel upload-panel">
          <h2>添加知识文档</h2>
          <p>PDF、DOCX、TXT、Markdown；支持无 Embedding 服务的关键词索引。</p>
          <div className="kb-controls">
            <label>
              知识类别
              <Select
                value={category}
                onChange={setCategory}
                options={categories}
              />
            </label>
            <label>
              标准 / 文档版本
              <Input
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                placeholder="例如 4.4 / 2012"
              />
            </label>
            <label>
              适用 ASIL
              <Select
                value={asil}
                onChange={setAsil}
                options={[
                  { value: "", label: "通用" },
                  ...["QM", "A", "B", "C", "D"].map((value) => ({
                    value,
                    label: value,
                  })),
                ]}
              />
            </label>
            <label>
              适用阶段
              <Select
                value={stage}
                onChange={setStage}
                options={[
                  { value: "", label: "通用" },
                  ...stages.map((value) => ({ value, label: value })),
                ]}
              />
            </label>
            <label>
              入库模式
              <Select
                value={indexMode}
                onChange={setIndexMode}
                options={[
                  { value: "vector", label: "向量 + 关键词" },
                  { value: "keyword", label: "仅关键词（无需 Key）" },
                ]}
              />
            </label>
            <label>
              切片字符 / 重叠
              <div className="kb-number-pair">
                <InputNumber
                  min={200}
                  max={2000}
                  value={size}
                  onChange={(v) => setSize(v || 900)}
                />
                <InputNumber
                  min={0}
                  max={Math.min(size - 1, 499)}
                  value={overlap}
                  onChange={(v) => setOverlap(v || 0)}
                />
              </div>
            </label>
          </div>
          <Spin spinning={busy}>
            <Upload.Dragger
              accept=".pdf,.docx,.txt,.md"
              multiple
              showUploadList={false}
              disabled={busy}
              beforeUpload={async (file) => {
                if (!backend) {
                  message.warning("请先启动后端并配置访问令牌");
                  return false;
                }
                if (file.size > 20 * 1024 * 1024) {
                  message.error("文件超过 20 MB");
                  return false;
                }
                setBusy(true);
                const form = new FormData();
                form.append("file", file);
                Object.entries({
                  category,
                  version,
                  asil,
                  stage,
                  index_mode: indexMode,
                  chunk_size: String(size),
                  chunk_overlap: String(overlap),
                }).forEach(([key, value]) => form.append(key, value));
                try {
                  const token = sessionStorage.getItem("pilot-token");
                  const r = await fetch("/api/knowledge", {
                    method: "POST",
                    headers: token ? { Authorization: `Bearer ${token}` } : {},
                    body: form,
                  });
                  const data = await r.json();
                  if (!r.ok) throw new Error(data.detail);
                  message.success(
                    data.duplicate
                      ? "内容已存在，已避免重复入库"
                      : `已入库 ${data.chunks} 个章节片段`,
                  );
                  await refresh();
                } catch (e) {
                  message.error(String(e));
                } finally {
                  setBusy(false);
                }
                return false;
              }}
            >
              <UploadCloud size={35} />
              <h3>点击或拖拽文档至此</h3>
              <p>单个文件最大 20 MB · 授权标准与项目资料</p>
            </Upload.Dragger>
          </Spin>
        </section>
        <section className="panel retrieve-panel">
          <h2>验证知识检索</h2>
          <p>优先匹配需求 ID / 规则编号，融合语义召回并减少重复片段。</p>
          <div className="kb-search-controls">
            <Select
              value={mode}
              onChange={setMode}
              options={[
                { value: "hybrid", label: "混合检索" },
                { value: "keyword", label: "关键词 BM25" },
                { value: "vector", label: "仅向量" },
              ]}
            />
            <Select
              value={filter}
              onChange={setFilter}
              options={[{ value: "", label: "所有类别" }, ...categories]}
            />
            <InputNumber
              min={1}
              max={20}
              value={topK}
              onChange={(v) => setTopK(v || 4)}
              addonBefore="Top K"
            />
          </div>
          <details className="kb-advanced">
            <summary>版本与适用范围过滤</summary>
            <div className="kb-search-controls">
              <Input
                value={searchVersion}
                onChange={(e) => setSearchVersion(e.target.value)}
                placeholder="限定规范版本（可选）"
                style={{ width: 180 }}
              />
              <Select
                value={searchAsil}
                onChange={setSearchAsil}
                options={[
                  { value: "", label: "所有 ASIL" },
                  ...["QM", "A", "B", "C", "D"].map((value) => ({
                    value,
                    label: value,
                  })),
                ]}
              />
              <Select
                value={searchStage}
                onChange={setSearchStage}
                options={[
                  { value: "", label: "所有阶段" },
                  ...stages.map((value) => ({ value, label: value })),
                ]}
              />
            </div>
          </details>
          <Input.Search
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="例如：SWR-002 过压检测 / Rule 10.1"
            enterButton="检索"
            loading={busy}
            onSearch={search}
          />
          {results.length ? (
            results.map((r, i) => (
              <div className="retrieval-result" key={r.citation_id}>
                <div className="retrieval-result-heading">
                  <strong>
                    {i + 1}. {r.source} · 页 {r.page} · 片段 {r.chunk}
                  </strong>
                  <Tag>{r.retrieval}</Tag>
                </div>
                <small>
                  {r.section} · {r.citation_id}
                </small>
                <p>{r.content}</p>
                <div>
                  <Tag>融合排序分 {r.relevance.toFixed(3)}</Tag>
                  {r.dense_score !== null && (
                    <Tag>余弦 {r.dense_score?.toFixed(3)}</Tag>
                  )}
                  <Tag>BM25 {r.keyword_score.toFixed(2)}</Tag>
                </div>
                {r.warnings?.map((w: string) => (
                  <p className="retrieval-warning" key={w}>
                    {w}
                  </p>
                ))}
              </div>
            ))
          ) : (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={searched ? "没有符合条件的知识片段" : "尚无检索结果"}
            />
          )}
        </section>
      </div>
      <section className="panel">
        <div className="panel-heading">
          <h2>
            知识库文档 <Tag>{documents.length} 份</Tag>
          </h2>
          <Button size="small" icon={<RefreshCw size={13} />} onClick={refresh}>
            刷新
          </Button>
        </div>
        {stats?.stale_documents > 0 && (
          <div className="ai-banner">
            {stats.stale_documents} 份文档的 Embedding
            配置已变更，请重建向量索引；当前仍可使用关键词检索。
          </div>
        )}
        <Table
          dataSource={documents}
          rowKey="id"
          size="small"
          scroll={{ x: 850 }}
          pagination={{ pageSize: 8 }}
          locale={{ emptyText: "尚未导入知识文档" }}
          columns={[
            {
              title: "文档",
              dataIndex: "name",
              render: (name, r) => (
                <>
                  <strong>{name}</strong>
                  <small className="kb-doc-meta">
                    {r.metadata?.category} ·{" "}
                    {r.metadata?.version || "未标记版本"} · 修订{" "}
                    {r.revision || 1}
                  </small>
                </>
              ),
            },
            { title: "切片数", dataIndex: "chunks" },
            {
              title: "索引状态",
              render: (_, r) => (
                <Tag
                  color={
                    !r.active
                      ? "default"
                      : r.index_status === "ready"
                        ? "green"
                        : r.index_status === "stale"
                          ? "orange"
                          : "blue"
                  }
                >
                  {r.active === false
                    ? "历史版本"
                    : r.index_status === "ready"
                      ? "向量已就绪"
                      : r.index_status === "stale"
                        ? "需重建"
                        : "关键词索引"}
                </Tag>
              ),
            },
            {
              title: "导入时间",
              dataIndex: "created_at",
              render: (t) => new Date(t).toLocaleString("zh-CN"),
            },
            {
              title: "操作",
              render: (_, r) => (
                <div className="kb-actions">
                  <Button
                    size="small"
                    icon={<Search size={12} />}
                    onClick={async () => {
                      try {
                        setDetail(await api("/knowledge/" + r.id));
                      } catch (e) {
                        message.error(String(e));
                      }
                    }}
                  >
                    片段
                  </Button>
                  <Button
                    size="small"
                    loading={busy}
                    disabled={r.active === false}
                    onClick={async () => {
                      setBusy(true);
                      try {
                        await api("/knowledge/" + r.id + "/reindex", {
                          method: "POST",
                        });
                        await refresh();
                        message.success("向量索引已重建");
                      } catch (e) {
                        message.error(String(e));
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    重建
                  </Button>
                  <Button
                    size="small"
                    danger
                    onClick={() =>
                      Modal.confirm({
                        title: "移除该知识文档？",
                        content:
                          "片段将退出检索；已生成工件中保留的引用快照不受影响。",
                        onOk: async () => {
                          await api("/knowledge/" + r.id, { method: "DELETE" });
                          await refresh();
                        },
                      })
                    }
                  >
                    移除
                  </Button>
                </div>
              ),
            },
          ]}
        />
      </section>
      <RetrievalEvaluation backend={backend} documents={documents} />
      <Modal
        open={!!detail}
        onCancel={() => setDetail(null)}
        footer={null}
        width={850}
        title={detail?.name}
      >
        <div className="kb-chunk-preview">
          {detail?.items?.map((item: any) => (
            <details key={item.chunk_id || item.chunk}>
              <summary>
                页 {item.page} · {item.section} · 片段 {item.chunk}
              </summary>
              <small>{item.citation_id}</small>
              <pre>{item.content}</pre>
            </details>
          ))}
        </div>
      </Modal>
    </>
  );
}
