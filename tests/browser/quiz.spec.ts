import { test, expect, type Page } from "@playwright/test";
import { build } from "vite";
import path from "node:path";

let javascript: string;
let css: string;
test.beforeAll(async () => {
  // Bundle the real UI; replace framework navigation and the server-action boundary. SQL/RLS and
  // authenticated actions are separately tested in Vitest, not simulated here.
  const result = await build({
    configFile: false, logLevel: "silent",
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
    plugins: [{
      name: "quiz-action-fixture", enforce: "pre",
      resolveId(id) {
        if (id === "@/app/videos/actions") return "\0quiz-action";
        if (id === "next/link") return "\0quiz-link";
      },
      load(id) {
        // This isolated Vite page has no Next router/runtime. Keep link markup
        // and destinations testable without bundling Next's process.env reads.
        if (id === "\0quiz-link") return `import { createElement } from 'react';
          export default function Link(props) { return createElement('a', props); }`;

        if (id === "\0quiz-action") return `export async function submitVideoQuiz(id, answers, submissionId) {
          const response = await fetch('/__quiz_submit', {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id,answers,submissionId})});
          return response.json();
        }`;
      },
    }],
    build: { write: false, minify: false, lib: { entry: path.resolve("tests/browser/fixtures/quiz-harness.tsx"), name: "QuizHarness", formats: ["iife"] } },
  });
  const output = Array.isArray(result) ? result[0].output : "output" in result ? result.output : [];
  javascript = output.map(item => item.type === "chunk" ? item.code : "").join("\n");
  css = output.map(item => item.type === "asset" && item.fileName.endsWith(".css") ? String(item.source) : "").join("\n");
});
async function open(page: Page) {
  await page.route("**/__quiz_harness", route => route.fulfill({ contentType: "text/html", body: `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div></body></html>` }));
  await page.goto("/__quiz_harness");
  await page.addStyleTag({ content: css });
  const startupErrors: string[] = [];
  page.on("pageerror", error => startupErrors.push(error.message));
  await page.addScriptTag({ content: javascript });
  await expect.poll(() => startupErrors, { message: "Quiz harness must start without JavaScript errors" }).toEqual([]);
  await expect(page.locator("fieldset")).toHaveCount(3);
  await expect(page.getByRole("radio")).toHaveCount(9);
}
async function answer(page: Page, answers: number[]) {
  for (let n = 0; n < answers.length; n++) await page.locator(`input[name="question-${n}"][value="${answers[n]}"]`).check();
}
for (const [answers, score, percentage] of [[[1,0,1],1,33],[[1,2,0],3,100],[[1,0,0],2,67],[[0,0,1],0,0]] as const) {
  test(`answers ${answers} show score ${score} and save success`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    await page.route("**/__quiz_submit", async route => {
      expect(route.request().postDataJSON().answers).toEqual(answers);
      await route.fulfill({ json: { correct: answers.map((value,index) => value === [1,2,0][index]), score, percentage, saved: true, feedback: answers.map((value,index) => ({correct:value === [1,2,0][index],answer:["入力→処理→出力","キーボード","プリンター"][index], explanation:"入力と出力の役割を確認しましょう。",category:"コンピュータの基礎"})) } });
    });
    await open(page); await answer(page, [...answers]);
    await page.getByRole("button", { name: "回答を提出する", exact: true }).click();
    await expect(page.getByRole("status")).toContainText(`3問中${score}問正解`);
    await expect(page.getByRole("status")).toContainText(`正答率：${percentage}%`);
    await expect(page.getByRole("status")).toContainText("学習履歴を保存しました");
    await expect(page.getByRole("button", { name: "保存済み", exact: true })).toBeDisabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(page.getByText("コンピュータの基礎", {exact:false})).toHaveCount(score < 3 ? 4 : 3);
    const review = page.getByRole("region", { name: "おすすめの復習" });
    await expect(review).toBeVisible();
    await expect(review).toContainText(score === 3 ? "次の学習" : score === 0 ? "基礎から" : "優先して復習");
    await expect(review.getByRole("link", { name: score === 3 ? "次の教材を探す" : "この動画を見直す" })).toHaveAttribute("href", score === 3 ? "/videos" : "#lesson-video");
    if (score < 3) await expect(page.getByText("正解：", {exact:false}).first()).toBeVisible();
    if (score > 0) {
      await page.getByText("解説を見る", {exact:true}).first().click();
      await expect(page.getByText("入力と出力の役割を確認しましょう。", {exact:true}).first()).toBeVisible();
    }
    expect(errors).toEqual([]);
  });
}
test("failed save retries the same key; new attempt gets a fresh key", async ({ page }) => {
  const submissions: { answers: number[]; submissionId: string }[] = [];
  await page.route("**/__quiz_submit", async route => {
    submissions.push(route.request().postDataJSON());
    await route.fulfill({ json: submissions.length === 1 ? { error: "保存に失敗しました。再試行してください。" } : { correct: [true,true,true], score: 3, percentage: 100, saved: true } });
  });
  await open(page); await answer(page, [1,2,0]);
  await page.getByRole("button", { name: "回答を提出する", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("保存に失敗");
  await expect(page.getByRole("radio").last()).toBeEnabled();
  await page.getByRole("button", { name: "同じ回答で再試行する", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("保存しました");
  expect(submissions[0]).toEqual(submissions[1]);
  await page.getByRole("button", { name: "もう一度受験する", exact: true }).click();
  await page.getByRole("button", { name: "回答を提出する", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("保存しました");
  expect(submissions).toHaveLength(3);
  expect(submissions[2].submissionId).not.toBe(submissions[1].submissionId);
});
test("rapid submissions send only one request", async ({ page }) => {
  let calls = 0;
  await page.route("**/__quiz_submit", async route => {
    calls++;
    await new Promise(resolve => setTimeout(resolve, 100));
    await route.fulfill({ json: { correct: [true,true,true], score: 3, percentage: 100, saved: true } });
  });
  await open(page); await answer(page, [1,2,0]);
  await page.locator("form").evaluate(form => { (form as HTMLFormElement).requestSubmit(); (form as HTMLFormElement).requestSubmit(); });
  await expect(page.getByRole("status")).toContainText("保存しました");
  expect(calls).toBe(1);
});

test("unanswered form does not submit or reveal feedback", async ({page}) => {
  let calls=0;
  await page.route("**/__quiz_submit", route => {calls++; return route.fulfill({json:{}});});
  await open(page);
  await page.getByRole("button", {name:"回答を提出する",exact:true}).click();
  await expect(page.getByText("解説を見る",{exact:true})).toHaveCount(0);
  expect(calls).toBe(0);
});
