import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser", testMatch: "quiz.spec.ts", fullyParallel: true,
  use: {
    baseURL: "http://127.0.0.1:3199", trace: "retain-on-failure",
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined },
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
});
