import { test, expect } from "@playwright/test";

test("RAG 标注问题集可评估并导出真实检索结果", async ({ page, request }) => {
  const upload = await request.post("http://127.0.0.1:8011/api/knowledge", {
    headers: { Authorization: "Bearer browser-test-reviewer" },
    multipart: {
      file: {
        name: "VCP-retrieval-evaluation.md",
        mimeType: "text/markdown",
        buffer: Buffer.from(
          "# 通信需求\nVCP-COM-771 控制器通信超时后请求安全状态。",
        ),
      },
      index_mode: "keyword",
    },
  });
  expect(upload.ok()).toBeTruthy();
  await page.addInitScript(() =>
    sessionStorage.setItem("pilot-token", "browser-test-reviewer"),
  );
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("本地服务已连接", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "RAG 知识库", exact: true }).click();
  await page.getByLabel("评估问题 1", { exact: true }).fill("VCP-COM-771");
  await page.getByRole("combobox", { name: "期望文档 1", exact: true }).click();
  await page.getByTitle("VCP-retrieval-evaluation.md", { exact: true }).click();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "运行检索评估" }).click();
  await expect(page.getByText("命中率：100.0%", { exact: true })).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出评估结果" }).click();
  expect((await download).suggestedFilename()).toBe(
    "retrieval-evaluation.json",
  );
});
