# Agent 与 RAG 功能

前端布局保持原有工程工作台。后端从通用演示流程升级为独立阶段契约与可配置 OpenAI 兼容服务。

## 模型配置

编辑 `.env`，通过 `uvicorn ... --env-file .env` 启动；已有 `.env` 不要被示例文件覆盖。接口密钥只在服务端读取，不进入前端配置、知识元数据或审计日志。

| 配置 | 用途 |
|---|---|
| `OPENAI_API_KEY` | 通用模型 / Embedding 密钥 |
| `OPENAI_BASE_URL` | OpenAI 兼容服务根 URL；空值使用 OpenAI 默认地址 |
| `OPENAI_MODEL` | 阶段 Agent 与安全 Agent 的模型名称 |
| `OPENAI_EMBEDDING_MODEL` | Embedding 模型名称 |
| `PILOT_CHAT_BASE_URL` / `PILOT_CHAT_API_KEY` | 可选，单独覆盖 Chat 服务 |
| `PILOT_EMBEDDING_BASE_URL` / `PILOT_EMBEDDING_API_KEY` | 可选，单独覆盖 Embedding 服务 |
| `PILOT_EMBEDDING_DIMENSIONS` | 模型支持时指定维度；不支持时留空 |
| `PILOT_STRUCTURED_METHOD` | 默认 `function_calling`；可选 `json_schema` / `json_mode`，须与网关能力一致 |
| `PILOT_MODEL_TIMEOUT` | 模型请求超时，默认 90 秒 |

Chat 和 Embedding 可以使用不同的兼容服务。只有 Chat Key 时仍可上传关键词知识；只有 Embedding Key 时阶段 Agent 使用离线模板，同时可以检索向量知识。SDK 对暂时网络错误最多重试一次；阶段工件语义校验另外最多修订一次。调用失败不会静默生成“真实模型输出”。

## 九阶段专业能力

| 阶段 / Agent | 主要结构化输出 |
|---|---|
| 系统需求 / system | 系统需求、验收条件、工作条件、外部接口、安全关联 |
| 软件需求 / requirements | 软件需求、验收条件、需求分配、安全关联 |
| 软件架构 / architecture | 组件职责、接口契约、调度、安全机制、AUTOSAR 映射 |
| 详细设计 / design | 设计单元、算法、状态/数据、接口、边界条件 |
| 编码实现 / coding | C / header 文件、实现说明、静态分析计划 |
| 单元测试 / unit | 前置条件、步骤、预期结果、设计技术、覆盖计划、候选 C harness |
| 集成测试 / integration | 用例、集成顺序、接口检查 |
| 系统测试 / systemtest | 端到端用例、测试环境、故障注入 |
| 验收验证 / acceptance | 验收用例、交付清单、证据缺口 |

共有字段为标题、摘要、ASIL、假设、待确认问题、追溯建议和知识引用。每个阶段包含当前工件及所有已评审上游工件，固定 ID/版本快照；超过 100000 字符的基线拒绝启动，避免静默截断安全需求。

流程：调度 → 专业 Agent → 契约校验 → 必要时修订一次 → 独立安全评审 → 代码结构检查 → LangGraph interrupt → 授权人工评审 / Command resume。生成过程记录节点事件、模型用量、尝试次数、基线和引用 ID。

安全 Agent 结合确定性证据检查与独立模型调用，检查输出项追溯、待确认问题、标准依据、风险函数、失效处理与验收条件。生成时和独立分析产生的当前版本 error 级发现均会阻止批准。单独点击「独立安全分析」会保存对应工件版本的分析证据。人工修改后的文字与旧结构化字段不可混用：整篇文档修改清除当前机器输出/引用/分析/执行字段，旧字段保留在版本历史。

编码工件支持按 C/header 文件编辑和下载，单元测试工件支持切换正文与 C harness。文件级保存保留结构化契约、输入基线和追溯，重新生成展示文档与确定性检查，清除旧批准并创建新版本；旧运行标记 superseded，旧安全或执行证据不得冒充新版本结果。

缺少 Chat 服务时，各阶段生成独立结构化模板，保留参数待确认，不自动编造项目阈值。界面明确显示「离线结构化模板」。即使人工批准模板，也不表示已完成软件实现、测试执行或认证。

## 执行 Agent

生成代码会立即运行轻量结构提示，保存函数名、文件和行号。该检查是启发式，不能标为 MISRA 违规或通过。

真正编译 / 测试通过 `POST /api/simulation` 执行；代码工件和测试 harness 都必须已批准。执行器只支持一个 C translation unit 及头文件。需要本机 Docker 和预先准备好的 `gcc:14` 或等效镜像，再设置 `PILOT_ENABLE_CONTAINER_EXECUTION=1`；程序不会自动拉取镜像或安装 Docker。

容器参数包含网络禁用、只读根与输入、非 root 用户、移除 capabilities、禁止提权、256 MB / 1 CPU / 64 进程、30 秒超时、64 KB 输出限制。编译参数固定为 C99 + Wall/Wextra/Wconversion/Werror；单测只运行提供的 harness。证据记录返回码、源代码 hash、harness hash、工件版本与镜像。镜像/引擎不可用、超时或输出超限不会形成通过结论。

当前环境只有执行器契约与模拟进程测试验证，没有真实 Docker 执行结果；不包含 SIL/HIL、ECU 外设或测试覆盖率。

## RAG 管理和检索

- 格式：PDF / DOCX（含表格）/ TXT / Markdown。扫描 PDF 无文本时提示 OCR，文本需 UTF-8。
- 切片：识别标题、章节、规则编号与需求 ID；章节内按中英文分隔符进一步切片，默认 900 字符、100 重叠，可配置。
- 元数据：类别、规范/文档版本、ASIL、阶段、页码、章节、文档 ID、片段 ID、稳定引用 ID。
- 索引：支持向量 + 关键词或仅关键词。Embedding 批量 64 个，校验返回数量、维度、有限值与非零向量；失败不写入新版本。
- 去重与版本：同内容/元数据/模式重复上传不重复入库；同名同元数据新内容增加修订号，历史修订退出默认检索。不同明确版本可并存并按版本过滤。
- 检索：Faiss L2 归一化内积用于余弦分数；BM25 使用英文/编号 token 与中文二元字符，保留需求 ID、规则编号；RRF 融合，编号优先，多样性排序减少重复与单文档集中。过滤先应用，避免全局 top-k 隐藏目标类别文档。
- 退化：向量服务不可用时 hybrid 模式退回关键词并显示提示；显式 vector 模式失败会报错。没有相关片段时不生成虚构引用。
- 模型迁移：provider URL / 模型 / 维度配置组成非秘密签名。不同签名与不同维度分组，旧数据标为需重建；旧文本仍可关键词检索。点击「重建」重新向量化，失败保留旧数据。
- 缓存与预算：最多缓存 128 个查询向量；默认检索 4 个片段，Agent 取 6 个，默认引用文本预算 10000 字符。规范多版本同时命中时提示检查适用性。
- 引用：候选工件保留检索片段快照，删除知识文档后旧工件引用仍能查看。模型 citations 必须引用本次提供的真实 ID，否则最多修订一次后拒绝输出。

当前多样性重排是确定性词项相似度惩罚，不是 Cross Encoder；中文 token 未做专业分词。Faiss 索引启动时由 SQLite 保存的向量重建。检索质量必须在实际授权资料与带标注问题集上评估，不能把示例测试结果当作行业知识质量结论。

## API

所有业务 API 使用 Bearer 访问令牌；完整交互格式在 FastAPI `/docs`。

| 路径 | 用途 |
|---|---|
| `GET /api/agents` | 九阶段职责、输出 schema、执行器状态 |
| `PUT /api/artifacts/{id}/files/{path}` | content / version，修订结构化 C/header 文件 |
| `PUT /api/artifacts/{id}/harness` | content / version，修订 C test harness |
| `POST /api/runs` | stage / artifact_id / instruction；可传 asil、retrieval_mode、knowledge_version |
| `GET /api/runs`、`GET /api/runs/{id}` | 运行状态、节点事件、token 用量、基线 |
| `POST /api/agents/safety/analyze` | artifact_id / asil，独立安全评审 |
| `POST /api/simulation` | artifact_id / action=compile 或 unit_test / harness_artifact_id |
| `GET /api/evidence/{artifact_id}` | 历史安全或执行证据，按工件版本区分 |
| `POST /api/knowledge` | multipart 文件、category/version/asil/stage/index_mode/chunk_size/chunk_overlap |
| `POST /api/knowledge/search` | query/top_k/mode/category/version/asil/stage/document_id/min_score/context_chars |
| `GET /api/knowledge/stats` | 文档、片段、过期索引与缓存统计 |
| `GET /api/knowledge/{id}` | 元数据与片段预览（不返回向量） |
| `POST /api/knowledge/{id}/reindex` | 按当前 Embedding 配置重建 |
| `POST /api/knowledge/evaluate` | 带 expected_sources 的问题集，返回 Recall@K / MRR / Hit Rate 与逐题结果 |

评估示例请求：

```json
{"mode":"hybrid","top_k":4,"cases":[{"query":"SWR-002 过压保护的触发条件","expected_sources":["BMS-SRS.md"]}]}
```

### 实现依据

结构化调用使用 [LangChain with_structured_output](https://reference.langchain.com/python/langchain-openai/chat_models/base/BaseChatOpenAI/with_structured_output)。归一化内积计算余弦遵循 [Faiss MetricType 说明](https://github.com/facebookresearch/faiss/wiki/MetricType-and-distances)。人工暂停/恢复使用 [LangGraph interrupt](https://reference.langchain.com/python/langgraph/types/interrupt)。

## 知识问答

侧边栏新增「知识问答」入口。先在 RAG 知识库上传资料，再输入工程问题；支持连续追问、知识类别筛选、混合 / 关键词 / 向量检索与来源原文展开。Ctrl + Enter 发送，新建对话清空当前会话。会话仅保存在当前页面，切换页面或刷新后会清空，不生成或修改阶段工件。

问答复用现有模型配置和访问令牌。未配置聊天模型时只展示检索原文；无检索依据时明确提示资料缺失；模型服务失败或返回无效引用时显示错误，不伪造回答。AI 回答需人工核实。历史用户问题用于补充追问检索上下文，历史助手回答不作为证据。

接口：`POST /api/questions`，字段 `question`、`history`（最多 10 条）、`mode`、`category`；返回 `answer`、`citations`、`references`、`warnings`、`mode`。当前不持久化问答历史。

### 百炼兼容接口

在本地 `.env` 设置 `OPENAI_BASE_URL` 为控制台对应地域 / 业务空间的兼容接口地址，`OPENAI_API_KEY` 填真实密钥。模型名称使用接口模型 ID（如 `qwen3.8-max`），向量模型可配置 `text-embedding-v4`。使用强制工具调用的结构化 Agent 时设置 `PILOT_CHAT_ENABLE_THINKING=false`；否则百炼思考模式可能拒绝 `tool_choice`。Embedding 客户端发送字符串数组，不发送 OpenAI 专用 token 数组。修改后重启后端；切换向量模型后重建已有文档索引。

### 入库分批与通用问答回退

`text-embedding-v4` 每次请求最多 10 条文本，客户端自动拆分，上传和重建索引都遵循此限制。其他模型批次默认 64，可通过 `PILOT_EMBEDDING_BATCH_SIZE` 调整；v4 始终限制为最多 10。

未命中知识库且配置了聊天模型时，问答直接使用模型通用知识，返回 `mode=general_model`、空 `references` 与空 `citations`，页面标记「通用模型回答 · 未引用知识库」。未配置模型时仍提示配置模型或补充资料。检索服务故障仍显示错误，不冒充没有检索命中；命中知识库时保持来源校验。

### 项目目录配置

可从「配置管理」或左上角「选择项目空间」进入「项目目录配置」。字段包括项目根目录、文档、源码、测试及报告目录。BMS 配置通过 `GET /api/workspace/paths`、`PUT /api/workspace/paths` 存入 SQLite 并记录审计事件；写入需现有安全经理或系统工程师令牌，其他现有角色可读取。保存需携带当前 `version`，并发修改返回 409。

项目根目录使用绝对路径；其他目录支持绝对路径或相对于根目录的路径。当前仅存储目录元数据，不授予文件访问权限，不创建目录、扫描文件、迁移工件或自动同步；工件仍在 SQLite 中，下载位置仍由浏览器决定。新项目草稿目录按各自草稿 ID 保存在浏览器；多项目后端与新增角色授权尚待确认。
