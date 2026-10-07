import { test, expect } from "@playwright/test";
test("界面项目定义生成待评审系统需求，未知参数不由 AI 填写", async ({
  page,
  request,
}) => {
  await page.addInitScript(() =>
    sessionStorage.setItem("pilot-token", "browser-test-reviewer"),
  );
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("本地服务已连接", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "项目定义", exact: true }).click();
  await page
    .getByLabel("VCP 全称", { exact: true })
    .fill("用户输入的 VCP 项目定义（测试用途）");
  await page
    .getByLabel("主要功能与运行场景", { exact: true })
    .fill("验证需求输入、人工评审和上游卡点流程。");
  await page.getByRole("button", { name: "保存定义草稿" }).click();
  await expect(
    page.getByText("项目定义已保存到服务端；尚未批准需求。", { exact: true }),
  ).toBeVisible();
  await page.evaluate(() =>
    localStorage.removeItem("pilot-definition-default"),
  );
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "项目定义", exact: true }).click();
  await expect(page.getByLabel("VCP 全称", { exact: true })).toHaveValue(
    "用户输入的 VCP 项目定义（测试用途）",
  );
  await page.getByRole("button", { name: "生成待评审系统需求" }).click();
  await expect(page.locator(".document-editor")).toContainText(
    "用户输入，需人工评审",
  );
  await expect(page.locator(".document-editor")).toContainText(
    "待确认，不得由 AI 假定",
  );
  const response = await request.get("http://127.0.0.1:8011/api/artifacts", {
    headers: { Authorization: "Bearer browser-test-reviewer" },
  });
  const item = (await response.json()).find(
    (a: any) => a.name === "VCP 系统需求输入",
  );
  expect(item.status).toBe("draft");
  expect(item.ai).toBe(false);
  await page.getByRole("button", { name: "文件与验证", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "工程文件与验证" }),
  ).toBeVisible();
  await expect(
    page.getByText("Docker CLI 未安装", { exact: true }),
  ).toBeVisible();
});
