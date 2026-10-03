import { test, expect } from "@playwright/test";
const auth = { Authorization: "Bearer browser-test-reviewer" };
test("连接检查失败后仍可发送问题，并提示缺少访问令牌", async ({ page }) => {
  await page.route("**/api/health", (route) => route.abort());
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "知识问答", exact: true }).click();
  await page.getByLabel("问答问题").fill("SWR-QA-991");
  await expect(page.getByRole("button", { name: "发送问题" })).toBeEnabled();
  await page.getByRole("button", { name: "发送问题" }).click();
  await expect(page.locator(".qa-turn.assistant")).toBeVisible({
    timeout: 30000,
  });
  await page.evaluate(() => sessionStorage.removeItem("pilot-token"));
  await page.getByLabel("问答问题").fill("另一个问题");
  await page.getByRole("button", { name: "发送问题" }).click();
  await expect(
    page.getByRole("dialog", { name: "本地服务连接" }),
  ).toBeVisible();
  await expect(page.getByText(/请在工作空间设置中填写访问令牌/)).toBeVisible();
});

test("后端稍后启动时页面自动重连", async ({ page }) => {
  let attempts = 0;
  let available = false;
  await page.route("**/api/health", (route) => {
    attempts++;
    return available ? route.continue() : route.abort();
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("本地演示模式", { exact: true })).toBeVisible();
  available = true;
  await expect(page.getByText("本地服务已连接", { exact: true })).toBeVisible({
    timeout: 15000,
  });
  expect(attempts).toBeGreaterThan(1);
});
test("知识问答展示检索来源并可清空会话", async ({ page, request }) => {
  await request.post("http://127.0.0.1:8011/api/knowledge", {
    headers: auth,
    multipart: {
      index_mode: "keyword",
      category: "srs",
      file: {
        name: "qa-reference.md",
        mimeType: "text/markdown",
        buffer: Buffer.from("SWR-QA-991 采集模块必须检查输入边界。"),
      },
    },
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("本地服务已连接")).toBeVisible();
  await page.getByRole("button", { name: "知识问答", exact: true }).click();
  await page.getByLabel("问答问题").fill("SWR-QA-991");
  await page.getByRole("button", { name: "发送问题" }).click();
  await expect(page.getByText("仅检索资料", { exact: true })).toBeVisible();
  await page.locator(".qa-turn.assistant .ant-collapse-header").first().click();
  await expect(page.locator(".qa-turn.assistant")).toContainText(
    "采集模块必须检查输入边界",
  );
  await page.screenshot({ path: "artifacts/knowledge-qa.png", fullPage: true });
  await page.getByRole("button", { name: "新建对话" }).click();
  await expect(page.getByText("从一个工程问题开始")).toBeVisible();
});
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    sessionStorage.setItem("pilot-token", "browser-test-reviewer"),
  );
});
test("上传关键词知识 → 检索引用 → 生成设计候选 → 人工评审 → 安全分析", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("本地服务已连接")).toBeVisible();
  await page.getByRole("button", { name: "RAG 知识库", exact: true }).click();
  await page.locator(".kb-controls .ant-select").nth(3).click();
  await page.getByTitle("仅关键词（无需 Key）").click();
  await page.locator("input[type=file]").setInputFiles({
    name: "engineering-reference.md",
    mimeType: "text/markdown",
    buffer: Buffer.from(
      "# 模块设计\nRule 10.1 类型与接口应依据项目规范进行人工核对。\n设计单元必须检查输入边界、失效处理和需求追溯。",
    ),
  });
  await expect(page.getByText(/已入库 .* 个章节片段/)).toBeVisible();
  await page.locator(".retrieve-panel input").last().fill("Rule 10.1");
  await page.getByRole("button", { name: "检 索" }).click();
  await expect(page.locator(".retrieval-result").first()).toContainText(
    "engineering-reference.md",
  );
  await page.screenshot({
    path: "artifacts/rag-optimized.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: /^阶段工作台/ }).click();
  await page.getByRole("tab", { name: "Agent 对话" }).click();
  await page
    .getByPlaceholder("描述任务，例如：检查该模块的边界条件和需求追溯…")
    .fill("参考 Rule 10.1 补充详细设计的输入边界与故障响应");
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "详细设计候选工件", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".document-editor")).toContainText("接口契约");
  await expect(page.locator(".agent-side")).toContainText("离线结构化模板");
  await expect(page.locator(".evidence-reference").first()).toContainText(
    "engineering-reference.md",
  );
  await page.getByRole("button", { name: "人工评审", exact: true }).click();
  await page
    .getByPlaceholder("填写评审意见、依据和需要跟进的事项…")
    .fill("模板格式已核对；参数仍须工程师完善，不作为执行证据。");
  await page.getByRole("button", { name: "确认评审通过" }).click();
  await expect(page.locator(".editor-panel")).toContainText("评审通过");
  await page.getByRole("button", { name: "独立安全分析" }).click();
  await expect(page.getByText("离线证据检查已保存，未调用模型")).toBeVisible();
  await expect(page.getByText("离线证据检查已保存，未调用模型")).toBeHidden();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "artifacts/agents-functional.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
test("Agent 独立契约可查看，固定控制节点不能编辑", async ({
  page,
  request,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("本地服务已连接")).toBeVisible();
  await page.getByRole("button", { name: "Agent 管理", exact: true }).click();
  await page
    .locator(".agent-card")
    .filter({
      has: page.getByRole("heading", { name: "编码 Agent", exact: true }),
    })
    .getByRole("button")
    .click();
  await expect(page.getByRole("dialog")).toContainText("结构化输出契约");
  await page.getByRole("dialog").getByRole("button", { name: "取 消" }).click();
  await page
    .locator(".agent-card")
    .filter({
      has: page.getByRole("heading", { name: "主调度 Agent", exact: true }),
    })
    .getByRole("button")
    .click();
  await expect(
    page.getByRole("dialog").getByRole("button", { name: "确 定" }),
  ).toBeDisabled();
  const runs = await request.get("http://127.0.0.1:8011/api/runs", {
    headers: auth,
  });
  expect(runs.ok()).toBeTruthy();
});

test("编码 Agent 工件可按 C 文件修订，修订后重新评审", async ({
  page,
  request,
}) => {
  const baseline = await request.post(
    "http://127.0.0.1:8011/api/artifacts/DES-001/review",
    {
      headers: auth,
      data: { version: 2, approved: true, comment: "浏览器用例核对设计基线" },
    },
  );
  expect(baseline.ok()).toBeTruthy();
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("本地服务已连接")).toBeVisible();
  await page.getByRole("button", { name: "阶段工作台", exact: true }).click();
  await page
    .locator(".stage-tabs")
    .getByRole("button", { name: "编码实现", exact: true })
    .click();
  await page.getByRole("tab", { name: "Agent 对话" }).click();
  await page
    .getByPlaceholder("描述任务，例如：检查该模块的边界条件和需求追溯…")
    .fill("基于已评审详细设计生成 C 文件");
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "编码实现候选工件", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".code-file-controls")).toContainText(
    "candidate.c",
  );
  await page
    .locator(".document-editor")
    .fill("#include <stdint.h>\nuint16_t ReadValue(void) { return 0U; }");
  await page.getByRole("button", { name: "保存新版本", exact: true }).click();
  await expect(page.getByText("已保存文件修订，需重新评审")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "容器编译检查" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "人工评审", exact: true }).click();
  await page
    .getByPlaceholder("填写评审意见、依据和需要跟进的事项…")
    .fill("文件修订检查完成；未执行真实编译");
  await page.getByRole("button", { name: "确认评审通过" }).click();
  await expect(
    page.getByRole("button", { name: "容器编译检查" }),
  ).toBeEnabled();
  const files = await request.get("http://127.0.0.1:8011/api/artifacts", {
    headers: auth,
  });
  const item = (await files.json()).find(
    (v: any) => v.name === "编码实现候选工件",
  );
  expect(item.structured.files[0].content).toContain("ReadValue");
  expect(item.version).toBe(2);
  expect(item.execution.executed).toBe(false);
  await page.getByRole("tab", { name: "代码 / 文档预览" }).click();
  await expect(page.locator(".code-preview")).toContainText("ReadValue");
  await expect(page.locator(".code-preview .code-warning")).toHaveCount(0);
});
