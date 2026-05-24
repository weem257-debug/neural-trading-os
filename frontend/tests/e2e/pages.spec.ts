/**
 * Page Navigation E2E Tests
 * ==========================
 * Smoke-tests for all sidebar routes: risk, sentiment, portfolio,
 * backtest, execution, alerts. Verifies pages load without uncaught errors.
 * Requires dev server running on http://localhost:3000.
 */
import { test, expect } from "@playwright/test";

const ROUTES: Array<{ path: string; heading: RegExp }> = [
  { path: "/portfolio",  heading: /portfolio/i },
  { path: "/backtest",   heading: /backtest/i },
  { path: "/risk",       heading: /risk panel|risikopanel/i },
  { path: "/sentiment",  heading: /sentiment|stimmung/i },
  { path: "/execution",  heading: /execution|ausf/i },
  { path: "/alerts",     heading: /alerts|alarme/i },
];

test.describe("Page smoke tests", () => {
  for (const { path, heading } of ROUTES) {
    test(`${path} loads with h1 heading`, async ({ page }) => {
      await page.goto(path);
      // Each page must render an h1 matching expected text
      const h1 = page.locator("h1").first();
      await expect(h1).toBeVisible({ timeout: 10_000 });
      await expect(h1).toHaveText(heading, { timeout: 5_000 });
    });
  }

  test("risk page shows gauge section", async ({ page }) => {
    await page.goto("/risk");
    // The tachometer gauges section exists
    const gaugesSection = page.getByText(/risk gauges/i, { exact: false });
    await expect(gaugesSection).toBeVisible({ timeout: 10_000 });
  });

  test("sentiment page shows analyze button", async ({ page }) => {
    await page.goto("/sentiment");
    const analyzeBtn = page.getByRole("button", { name: /analyze|analysieren/i });
    await expect(analyzeBtn).toBeVisible({ timeout: 10_000 });
  });

  test("backtest page shows strategy dropdown", async ({ page }) => {
    await page.goto("/backtest");
    const strategySelect = page.locator("select").first();
    await expect(strategySelect).toBeVisible({ timeout: 10_000 });
  });

  test("execution page shows buy/sell form", async ({ page }) => {
    await page.goto("/execution");
    // Order ticket should be visible
    const form = page.locator("input[placeholder]").first();
    await expect(form).toBeVisible({ timeout: 10_000 });
  });
});
