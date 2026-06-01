/**
 * Dashboard E2E Tests
 * =====================
 * Tests the main navigation flow and dashboard page rendering.
 * Requires dev server running on http://localhost:3000.
 */
import { test, expect } from "@playwright/test";

test.describe("Dashboard navigation", () => {
  test("navigating to / redirects to /landing", async ({ page }) => {
    await page.goto("/");
    // Root page has a permanentRedirect to /landing (not /dashboard)
    await expect(page).toHaveURL(/\/landing/, { timeout: 10_000 });
  });

  test("App title contains Neural Trading OS", async ({ page }) => {
    // Landing page (public, no auth needed) should carry the root title
    await page.goto("/landing");
    await expect(page).toHaveTitle(/Neural Trading OS/i, { timeout: 10_000 });
  });

  test("Sidebar navigation to /signals works when authenticated", async ({ page }) => {
    await page.goto("/dashboard");
    // AuthGuard may redirect to /login; check either URL is reached
    await page.waitForURL(/\/(dashboard|login)/, { timeout: 8_000 });

    if (page.url().includes("/login")) {
      // Unauthenticated → skip sidebar test
      test.skip();
      return;
    }

    // Sidebar label for signals is "KI-Signale" (de.json nav.signals)
    const signalsLink = page.getByRole("link", { name: /ki-signale|signale/i }).first();
    await signalsLink.click();
    await expect(page).toHaveURL(/\/signals/, { timeout: 8_000 });
  });

  test("/landing opens without sidebar", async ({ page }) => {
    await page.goto("/landing");
    // Landing page has its own layout without the main Sidebar nav
    const sidebar = page.locator("nav[aria-label='Main navigation']");
    await expect(sidebar).not.toBeVisible({ timeout: 5_000 });
  });
});
