import { defineConfig } from "@playwright/test";
// Browser end-to-end tests against the LOCAL QA server (npm run qa:local). Never point this at production.
// Uses the installed Brave Browser; no Playwright browser download is required.
const base = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3030";
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(base)) throw new Error("E2E_BASE_URL must be a loopback development URL.");
export default defineConfig({
  testDir: "tests/e2e", fullyParallel: false, workers: 1, retries: 0, timeout: 120_000, expect: { timeout: 20_000 },
  reporter: [["list"], ["json", { outputFile: ".local/e2e/results.json" }]], outputDir: ".local/e2e/artifacts",
  use: { baseURL: base, browserName: "chromium", launchOptions: { executablePath: process.env.BRAVE_PATH ?? "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser" }, viewport: { width: 1440, height: 900 }, screenshot: "only-on-failure", trace: "retain-on-failure", actionTimeout: 20_000, navigationTimeout: 60_000 },
});
