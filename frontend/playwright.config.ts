import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E Test Configuration
 * Run: npm run test:e2e
 * Requires the Next.js dev server to be running on port 3000.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Cap local concurrency: the Next.js dev server (and the unstarted
  // backend on :8000) gets overwhelmed at the default worker count,
  // causing load-induced timeouts in API-dependent page tests. 4 is a
  // stable ceiling for the full suite on a dev build. CI stays at 1.
  workers: process.env.CI ? 1 : 4,
  reporter: [["list"], ["html", { open: "never" }]],

  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    // Allow self-signed certificates in dev
    ignoreHTTPSErrors: true,
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  // If webServer is configured, Playwright will start it automatically.
  // Leave commented out so CI and manual runs work independently.
  // webServer: {
  //   command: "npm run dev",
  //   url: "http://localhost:3000",
  //   reuseExistingServer: !process.env.CI,
  //   timeout: 120_000,
  // },
});
