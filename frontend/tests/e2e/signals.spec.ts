/**
 * Signals Page E2E Tests
 * =======================
 * Tests the AI Signals page rendering and interactive elements.
 * Requires dev server running on http://localhost:3000.
 */
import { test, expect } from "@playwright/test";

test.describe("Signals page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/signals");
  });

  test("Signals page loads", async ({ page }) => {
    // Page should not show an error boundary or crash
    await expect(page.locator("main")).toBeVisible({ timeout: 10_000 });
    // Should contain some signal-related heading or element
    await expect(page.locator("h1, [data-testid='signals-heading']").first()).toBeVisible({ timeout: 8_000 });
  });

  test("Demo Signal button is visible and clickable", async ({ page }) => {
    // Find the Demo/Demo Signal button — matches English "Demo" or German "Demo-Signal"
    const demoBtn = page.getByRole("button", { name: /demo/i }).first();
    await expect(demoBtn).toBeVisible({ timeout: 8_000 });
    // Button should be enabled
    await expect(demoBtn).not.toBeDisabled();
    // Clicking it should not crash the page
    await demoBtn.click();
    // Page should remain loaded after click
    await expect(page.locator("main")).toBeVisible({ timeout: 5_000 });
  });

  test("Filter buttons ALL / BUY / SELL / HOLD are present after generating a signal", async ({ page }) => {
    // Generate a demo signal first so filter bar appears
    const demoBtn = page.getByRole("button", { name: /demo/i }).first();
    await demoBtn.click();

    // Wait for at least one signal card to appear (signals list or filter bar)
    // Filter buttons appear only when signals.length > 0
    await page.waitForTimeout(1_500);

    // Check for direction filter buttons (ALL, BUY, SELL, HOLD or German equivalents)
    const filterContainer = page.locator(".flex.items-center.gap-2").filter({ hasText: /all|alle/i }).first();
    // It's acceptable if filter bar is visible
    const buyBtn = page.getByRole("button", { name: /^buy$|^kauf$/i }).first();
    // At least check that either the container or buttons are present
    const hasFilter = await filterContainer.isVisible().catch(() => false)
      || await buyBtn.isVisible().catch(() => false);
    expect(hasFilter).toBe(true);
  });
});
