/**
 * Dashboard E2E Tests
 * =====================
 * Tests the main navigation flow and dashboard page rendering.
 * Requires dev server running on http://localhost:3000.
 */
import { test, expect } from "@playwright/test";

test.describe("Dashboard navigation", () => {
  test("navigating to / redirects to /dashboard", async ({ page }) => {
    await page.goto("/");
    // Should redirect to /dashboard
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10_000 });
  });

  test("Dashboard page loads and shows app title", async ({ page }) => {
    await page.goto("/dashboard");
    // The <title> or visible heading should contain "Neural Trading OS"
    await expect(page).toHaveTitle(/Neural Trading OS/i, { timeout: 10_000 });
  });

  test("Sidebar navigation to /signals works", async ({ page }) => {
    await page.goto("/dashboard");
    // Find the signals nav link (English or German label)
    const signalsLink = page.getByRole("link", { name: /signals|signale/i }).first();
    await signalsLink.click();
    await expect(page).toHaveURL(/\/signals/, { timeout: 8_000 });
  });

  test("/landing opens without sidebar", async ({ page }) => {
    await page.goto("/landing");
    // Landing page has its own layout without the main Sidebar nav
    // The sidebar nav element should NOT be present
    const sidebar = page.locator("nav[aria-label='Main navigation']");
    await expect(sidebar).not.toBeVisible({ timeout: 5_000 });
  });
});
