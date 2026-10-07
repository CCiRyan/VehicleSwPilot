# Vehicle SW Pilot

面向汽车嵌入式软件工程的本地 MVP。React + Ant Design / Pro Components 前端，FastAPI + LangGraph / LangChain 后端，Faiss 知识检索，SQLite 工件、版本、审计日志和持久化流程检查点。

## 启动

当前工作区已经安装前后端依赖。

```powershell
# 终端 1：前端。此环境没有全局 npm，提供工作区内的 npm。
node .tools/npm/package/bin/npm-cli.js run dev

# 终端 2：后端。首次创建配置后编辑令牌与 API Key，不覆盖已有配置。
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
.\.venv\Scripts\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --env-file .env
```

打开 http://127.0.0.1:5173，在左下角「工作空间设置」填入 `.env` 的 `PILOT_AUTH_TOKEN`。它映射安全经理权限。可另设 `PILOT_SOFTWARE_TOKEN`、`PILOT_SYSTEM_TOKEN`、`PILOT_TEST_TOKEN` 以验证阶段授权；角色由后端令牌确定，已连接时不能从界面自行提升权限。

新环境安装：`npm install`；`python -m venv .venv`；`.\.venv\Scripts\python.exe -m pip install -r backend/requirements.txt`。没有 `.tools` 时使用正常安装的 npm。

不启动后端也可体验界面。演示工件和追溯关联存于浏览器 localStorage；演示角色只作用于演示数据。连接后端后以服务端数据为准。没有 Chat API Key 时，专业 Agent 生成各阶段独立的离线结构化模板；LangGraph 实际运行并在人工评审节点暂停。知识库支持无需 Key 的关键词入库与 BM25 检索；向量入库与检索需要 Embedding 服务。

详细功能、模型配置、Agent 输出契约与 RAG API 见 [Agent 与 RAG 使用说明](docs/AGENTS_RAG.md)。

构建后的前端预览：先运行 `npm run build`，再运行 `npm run preview -- --port 5180`，打开 [本地预览](http://127.0.0.1:5180/)。仍需同时启动后端以使用真实工件与知识库；没有全局 npm 时可用上述工作区 npm CLI 替换 `npm`。`.tools` 不包含在 Git 仓库中。

## 已实现

- 项目看板：V 模型阶段状态、工件列表、追溯统计、待处理入口。
- 项目定义：界面填写控制器全称、功能、硬件、接口、安全等级和验收条件；在线草稿保存到服务端并采用版本冲突保护，离线草稿保存在浏览器。生成的系统需求输入仍须人工评审；未确认信息不会由 AI 自动补全。
- 项目目录与文件：配置文档、源码、测试、报告路径，显式扫描、预览、导入知识库或待评审工件，导出已批准工件并记录版本和 SHA-256。文件操作限于本工程内配置路径，拒绝链接、越界和覆盖。Word/PDF 报告仍由浏览器下载。
- 九阶段工作台：新增工件、文档编辑、版本历史、C 高亮、阶段 Agent 对话、候选输出与人工评审。
- 追溯矩阵：需求 → 设计 → 函数 → 测试关联编辑，缺失高亮、筛选、Excel 导出。
- Agent：九阶段独立提示词 / Pydantic 工件契约、已评审上游版本传递、引用与追溯校验、最多一次修订、独立安全模型评审、结构检查、人工卡点、运行记录与 token 用量。调度、安全卡点和执行控制节点不可通过提示词编辑绕过。
- 知识库：PDF / DOCX / TXT / Markdown、章节/规则切片、OpenAI 兼容 Embedding、Faiss + 中文/工程编号 BM25、RRF 融合排序与去重多样性选择、类别/版本/ASIL/阶段过滤、引用快照、重复检测、历史版本、预览、删除、Embedding 迁移重建、检索质量评估。
- 工程知识问答：命中知识库时展示来源并校验引用；未命中且配置了聊天模型时使用通用模型回答，明确标记未引用知识库。模型服务失败会报错；检索故障不会被当成无命中。对话目前只保存在当前页面。
- 检索质量评估界面：标注问题及期望文档，选择检索模式与 Top K，查看 Recall@K、MRR、命中率及逐题召回，导出 JSON；指标只代表当前题集。
- 评审中心、配置管理和 ASPICE 证据视图；实际写入与批准仍按现有后端角色权限控制。
- Markdown / Word / PDF 草稿导出，含版本、AI 标签、评审状态和证据缺口。Word/PDF 使用服务端项目定义的名称和安全等级，测试/安全报告只纳入匹配当前工件版本的证据。

## 一轮功能测试

1. 配置 `.env` 并启动服务，在工作空间设置填入访问令牌。模型密钥只配置在后端，不填写到访问令牌框。
2. 在「项目定义」填写真实项目事实并保存。刷新确认恢复后，生成系统需求输入并人工评审；历史 BMS 示例工件不会自动成为真实 VCP 基线。
3. 在「RAG 知识库」上传一份授权 Markdown/TXT，先选关键词入库；验证检索和来源，再通过「检索质量评估」检查标注问题是否命中期望文档。
4. 在阶段工作台逐步完成软件需求 → 软件架构 → 详细设计 → 编码 → 单元测试，每阶段先检查候选内容再评审。下游入口要求全部上游工件批准，保存新版本会使已批准下游失效。
5. 在「项目目录配置」设置本工程内路径，在「文件与验证」预览、导入或导出已批准工件。没有 Docker 时只能验证工件与结构提示，不能产生真实编译/单测通过证据。

百炼可通过 `OPENAI_BASE_URL`、`OPENAI_API_KEY`、`OPENAI_MODEL` 和 `OPENAI_EMBEDDING_MODEL` 接入 OpenAI 兼容服务。API Key 填密钥，Base URL 填接口地址；具体模型 ID 按账号开通情况填写。当前客户端支持 `text-embedding-v4` 每批最多 10 条文本；结构化 Agent 使用 `PILOT_CHAT_ENABLE_THINKING=false`。修改配置后重启后端。

## 编排与评审

```mermaid
flowchart LR
 A[主调度] --> B{按 V 模型阶段路由}
 B --> C[阶段专业 Agent]
 K[Faiss 知识片段] --> C
 C --> D[安全 / 证据缺口检查]
 D --> E[interrupt 人工评审]
 E --> F[授权版本核对与 Command resume]
 F --> G[通过 / 驳回记录]
 G --> H[下一阶段入口核对全部上游工件]
```

专业 Agent 分别负责系统需求、软件需求、软件架构、详细设计、编码、单元测试、集成测试、系统测试、验收。每个阶段采用独立结构化契约。主调度负责固定输入版本与阶段路由，契约节点检查 ASIL、标识、追溯与引用并最多要求一次修订；安全节点结合确定性检查与独立模型评审。代码结构提示会保存文件名和行号，但不表示实际 MISRA 扫描。

执行 Agent 实现受限 Docker C 编译 / C test harness 运行，需本机 Docker、预先准备的编译器镜像以及 `PILOT_ENABLE_CONTAINER_EXECUTION=1`。代码与 harness 必须已评审；禁用网络、只读容器与输入、资源/时间/输出限制。当前环境没有 Docker，真实编译 / 容器测试未验证；SIL/HIL 尚未集成。

所有 AI 候选工件强制标注「AI 生成，需人工评审」。后端检查全部上游阶段已批准后，才允许生成或批准下游工件。保存新版本会取消当前批准并使已批准下游工件失效。旧版本、旧输入基线、未处理 error 级安全发现和重复恢复都会拦截批准。人工编辑会清除旧结构化输出/安全结论/执行证据并将旧运行标记 superseded，原记录保留在版本历史；修订后可独立评审。人工批准后追溯建议写入矩阵，并绑定工件版本。SQLite checkpoint 可在服务重启后恢复。

## 验证

```powershell
node .tools/npm/package/bin/npm-cli.js run build
.\.venv\Scripts\python.exe -m pytest tests -q
node node_modules/@playwright/test/cli.js test
```

浏览器验证默认使用系统 Edge，在 5175 / 8011 启动独立前后端及临时数据库，不会加载用户 `.env` 或调用外部模型。截图生成在 `artifacts/`。后端测试包括离线模板与模拟 OpenAI 兼容 HTTP 的结构化响应，不需要真实 API Key。

2026-10-07 验证：47 项后端测试通过，10 项浏览器测试均通过（新增检索评估测试修正定位后单独复测通过），TypeScript/Vite 构建通过。浏览器验证使用构建预览及隔离后端；无真实 Docker 编译或硬件测试结果。可运行 `.\.venv\Scripts\python.exe scripts/execution_smoke.py` 检查环境，准备好 Docker、本地 `gcc:14` 镜像并显式启用容器执行后，添加 `--run` 才执行已知 C 样例。

## 当前边界

这是可运行的开发基础，尚非可用于安全认证的生产系统。项目元信息与初始追溯为示例，不包含 AUTOSAR / ISO 26262 / MISRA 原文；请上传授权资料。正式 MISRA 分析器、覆盖率、SIL/HIL、HARA/FMEA/DFA 专项工具、安全论证和客户 ALM 工具尚未集成。容器执行器接口已实现但此环境未进行真实容器执行。追溯支持人工关联与评审后的 Agent 建议，尚未验证外部 ALM 中对象存在性。

当前服务为单机单进程、单示例项目，使用静态角色令牌和串行运行锁，适合本地验证。生产化需要独立用户身份、项目隔离、评审人独立性、数据库事务/恢复补偿、任务队列、可验证的外部工具结果、备份和部署访问控制。真实 LLM、Embedding 调用需用户自行配置并验证；目前测试不调用外部模型。

项目选择中的新空间目前是浏览器草稿，尚不提供服务端多项目隔离。评审负责人、配置管理员和 ASPICE 审核员的独立令牌权限、项目成员管理、受控基线冻结尚未启用；按用户要求暂不修改权限，设计方案见 [项目与权限实施范围](docs/PROJECT_ACCESS_PLAN.md)。当前 VCP 空间保留历史 BMS 示例数据，真实需求、ASIL 和验收条件需用户输入及人工确认。

LangGraph 人工暂停/恢复采用官方 [interrupt API](https://reference.langchain.com/python/langgraph/types/interrupt)。界面基于官方 [Ant Design React 组件](https://ant.design/docs/react/introduce/?locale=en)。
