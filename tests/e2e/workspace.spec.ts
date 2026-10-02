import { test, expect } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  await page.route("**/api/**", (route) => route.abort());
});
test("工程看板、工件编辑、评审和追溯导出", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "项目总看板" })).toBeVisible();
  await page.screenshot({ path: "artifacts/dashboard.png", fullPage: true });
  await page.getByRole("button", { name: "进入工作台" }).click();
  await expect(
    page.getByRole("heading", { name: "电压监测模块详细设计" }),
  ).toBeVisible();
  const editor = page.locator(".document-editor");
  await editor.fill(
    (await editor.inputValue()) + "\n人工添加：输入无效时请求安全状态。",
  );
  await page.getByRole("button", { name: "保存新版本" }).click();
  await expect(page.locator(".editor-panel .version")).toHaveCount(0);
  await page.getByRole("button", { name: "人工评审", exact: true }).click();
  await page
    .getByPlaceholder("填写评审意见、依据和需要跟进的事项…")
    .fill("边界和安全状态已人工核对。");
  await page.getByRole("button", { name: "确认评审通过" }).click();
  await expect(
    page.getByText("当前角色无评审权限，请在顶部切换演示角色"),
  ).toBeVisible();
  await page.getByRole("button", { name: "驳回并修订" }).press("Escape");
  await page.locator(".top-tools .ant-select").click();
  await page.getByTitle("安全经理", { exact: true }).click();
  await page.getByRole("button", { name: "人工评审", exact: true }).click();
  await page
    .getByPlaceholder("填写评审意见、依据和需要跟进的事项…")
    .fill("边界和安全状态已人工核对。");
  await page.getByRole("button", { name: "确认评审通过" }).click();
  await expect(
    page.locator(".editor-panel").getByText("评审通过", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "双向追溯矩阵" }).click();
  await page.getByRole("switch").click();
  await expect(page.locator(".ant-table-tbody tr")).toHaveCount(3);
  await page.getByRole("button", { name: "编辑关联" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.locator("input").last().fill("TC-003-CAN");
  await dialog.getByRole("button", { name: "确 定" }).click();
  await expect(page.locator(".ant-table-tbody tr")).toHaveCount(2);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出 Excel" }).click();
  expect((await download).suggestedFilename()).toMatch(/\.xlsx$/);
  for (const name of ["Agent 管理", "RAG 知识库", "报告与交付"]) {
    await page.getByRole("button", { name, exact: true }).click();
    await expect(
      page.getByRole("heading", { name, exact: true }),
    ).toBeVisible();
  }
  expect(errors).toEqual([]);
});
test("窄屏下导航与工件工作台可操作", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "进入工作台" }).click();
  await expect(page.locator(".document-editor")).toBeVisible();
  await page.screenshot({
    path: "artifacts/mobile-workspace.png",
    fullPage: true,
  });
});
