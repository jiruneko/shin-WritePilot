import { test, expect } from "@playwright/test";

test("preserves landing copy and usable auth navigation", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("自分のペースで、");
  await expect(page.getByText("WritePilotは、となりのきょうしつのためのオンライン学習プラットフォームです。")).toBeVisible();
  await page.getByRole("link", { name: "新規登録", exact: true }).click();
  await expect(page).toHaveURL(/\/signup$/);
  await expect(page.getByLabel("メールアドレス")).toBeVisible();
  await expect(page.getByLabel("パスワード（確認）")).toBeVisible();
  await page.getByRole("link", { name: "ログイン", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel("メールアドレス").fill("learner@example.test");
  await page.getByLabel("パスワード", { exact: true }).fill("test-password-123");
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("現在アカウント機能を利用できません");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

for (const route of ["/dashboard", "/account", "/videos", "/videos/10000000-0000-4000-8000-000000000001", "/admin", "/admin/videos", "/admin/videos/new", "/admin/videos/10000000-0000-4000-8000-000000000001/edit"]) {
  test(`unauthenticated access to ${route} redirects to login`, async ({ page }) => {
    await page.goto(route);
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading", { name: "おかえりなさい" })).toBeVisible();
  });
}
