import { defineConfig } from "@playwright/test";

/**
 * E2E tests run against a dedicated database (bookkeeping_e2e) and a
 * temporary storage directory, so they never touch development data.
 * `pnpm test:e2e` — global setup resets and migrates the e2e database.
 */
const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL ??
  "postgresql://bookkeeping:bookkeeping@localhost:5432/bookkeeping_e2e";

export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  retries: 0,
  workers: 1, // the journey is stateful and sequential
  use: {
    baseURL: "http://localhost:3100",
    trace: "retain-on-failure",
    // Use a system-provided Chromium when available (e.g. sandboxed CI
    // images that pre-install a browser); otherwise Playwright's own.
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
      : undefined,
  },
  webServer: {
    // The script resets + migrates the e2e database before starting the app
    // (Playwright launches the web server before globalSetup would run).
    command: "bash e2e/start-server.sh",
    url: "http://localhost:3100/login",
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      DATABASE_URL: E2E_DATABASE_URL,
      AUTH_SECRET: "e2e-secret-not-for-production-0123456789abcdef",
      AUTH_URL: "http://localhost:3100",
      AUTH_TRUST_HOST: "true",
      APP_ENCRYPTION_KEY: "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=",
      STORAGE_DRIVER: "local",
      STORAGE_LOCAL_PATH: "./var/e2e-storage",
      ALLOW_REGISTRATION: "true",
      OCR_PROVIDER: "stub",
      MALWARE_SCANNER: "none",
    },
  },
});
