/**
 * Authenticated Pages E2E Tests
 * ================================
 * Smoke-tests für alle auth-pflichtigen Seiten.
 * Ohne eingeloggten User prüft jeder Test:
 *  1. Auth-Guard greift → Redirect zu /login (Sicherheitstest)
 *  2. Keine uncaught Exceptions / White-Screen
 * Mit eingeloggtem User (falls vorhanden) wird zusätzlich das
 * Haupt-Heading validiert.
 * Erfordert Dev-Server auf http://localhost:3000.
 */
import { test, expect } from "@playwright/test";

const AUTH_PAGES: Array<{ path: string; heading: RegExp }> = [
  { path: "/account",    heading: /mein konto/i },
  { path: "/billing",    heading: /billing|subscription/i },
  { path: "/brokers",    heading: /broker|depot/i },
  { path: "/settings",   heading: /einstellungen/i },
  { path: "/learning",   heading: /selbstlernend|trading-ai/i },
  { path: "/networth",   heading: /nettoverm/i },
  { path: "/portfolios", heading: /portfolios/i },
  { path: "/p2p",        heading: /p2p|kredit/i },
  { path: "/analysis",   heading: /elliott|analyse/i },
];

// ---------------------------------------------------------------------------
// Auth-Guard Redirect Tests (unauthenticated)
// ---------------------------------------------------------------------------
test.describe("Auth-Guard: unauthenticated redirect", () => {
  for (const { path } of AUTH_PAGES) {
    test(`${path} redirects to /login when unauthenticated`, async ({ page }) => {
      await page.goto(path);
      // Auth-Guard must redirect to /login within 8s
      await expect(page).toHaveURL(/\/login/, { timeout: 8_000 });
      // Login page must not crash
      await expect(page.locator("main, body")).toBeVisible({ timeout: 5_000 });
    });
  }
});

// ---------------------------------------------------------------------------
// Reset-Password Page (public but auth-flow-adjacent)
// ---------------------------------------------------------------------------
test.describe("Reset-password page (/reset-password)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/reset-password");
  });

  test("Lädt ohne Crash", async ({ page }) => {
    // Accept either /reset-password itself or redirect to /login (no valid token)
    await page.waitForURL(/\/(reset-password|login)/, { timeout: 8_000 });
    await expect(page.locator("main, body")).toBeVisible({ timeout: 5_000 });
  });

  test("Zeigt Passwort-Eingabe oder Fehler bei fehlendem Token", async ({ page }) => {
    // Wenn Token fehlt: zeigt Fehler-Feedback oder leitet weiter
    const hasPasswordField = await page.locator("input[type='password']").isVisible().catch(() => false);
    const hasErrorText     = await page.getByText(/ungültig|abgelaufen|invalid|expired/i).isVisible().catch(() => false);
    const isOnLogin        = page.url().includes("/login");
    // Mind. eine der drei Bedingungen muss zutreffen
    expect(hasPasswordField || hasErrorText || isOnLogin).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Authenticated Page Content Tests (skipped when unauthenticated)
// ---------------------------------------------------------------------------
test.describe("Authenticated content (skipped without session)", () => {
  for (const { path, heading } of AUTH_PAGES) {
    test(`${path} zeigt korrektes H1-Heading wenn eingeloggt`, async ({ page }) => {
      await page.goto(path);

      const url = page.url();
      if (url.includes("/login")) {
        // Unauthenticated — skip content check, but confirm redirect happened cleanly
        test.skip();
        return;
      }

      // Authenticated: heading must match
      const h1 = page.locator("h1").first();
      await expect(h1).toBeVisible({ timeout: 10_000 });
      await expect(h1).toHaveText(heading, { timeout: 5_000 });
    });
  }
});
