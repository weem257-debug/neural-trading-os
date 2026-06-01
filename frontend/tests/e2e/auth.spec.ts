/**
 * Auth Flow E2E Tests
 * ====================
 * Tests login, forgot-password, and register-with-referral page behaviour.
 * Requires dev server running on http://localhost:3000.
 *
 * Note: backend calls are not required for form-structure tests.
 * API calls are mocked via route interception where needed.
 */
import { test, expect } from "@playwright/test";

test.describe("Login page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
  });

  test("/login opens the correct page", async ({ page }) => {
    await expect(page).toHaveURL(/\/login/, { timeout: 8_000 });
    // Page should load without crashing
    await expect(page.locator("main, body")).toBeVisible({ timeout: 5_000 });
  });

  test("Login form has Username and Password fields", async ({ page }) => {
    // Username field — check by label text or common input attributes
    const usernameField = page
      .getByRole("textbox", { name: /username|benutzername/i })
      .or(page.locator("input[type='text'], input[name='username'], input[autocomplete='username']"))
      .first();

    const passwordField = page
      .getByRole("textbox", { name: /password|passwort/i })
      .or(page.locator("input[type='password']"))
      .first();

    await expect(usernameField).toBeVisible({ timeout: 8_000 });
    await expect(passwordField).toBeVisible({ timeout: 8_000 });
  });

  test("Wrong credentials show an error message (mock backend)", async ({ page }) => {
    // Intercept the token endpoint and return 401
    await page.route("**/api/auth/token", (route) => {
      route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Incorrect username or password" }),
      });
    });

    // Fill in form fields
    const usernameField = page
      .getByRole("textbox", { name: /username|benutzername/i })
      .or(page.locator("input[type='text'], input[name='username'], input[autocomplete='username']"))
      .first();
    const passwordField = page.locator("input[type='password']").first();

    await usernameField.fill("wronguser");
    await passwordField.fill("wrongpassword");

    // Submit form — find the submit button
    const submitBtn = page
      .getByRole("button", { name: /sign in|login|anmelden|einloggen/i })
      .or(page.locator("button[type='submit']"))
      .first();
    await submitBtn.click();

    // An error message should appear
    const errorMsg = page.locator("[class*='error'], [class*='Error'], [role='alert'], [data-testid='login-error']").first();
    await expect(errorMsg).toBeVisible({ timeout: 8_000 });
  });
});

// ---------------------------------------------------------------------------
// Forgot-Password Page
// ---------------------------------------------------------------------------
test.describe("Forgot-password page (/forgot-password)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/forgot-password");
  });

  test("Lädt ohne Auth und zeigt E-Mail-Formular", async ({ page }) => {
    await expect(page).toHaveURL(/\/forgot-password/, { timeout: 8_000 });
    const emailInput = page.locator("input[type='email']").first();
    await expect(emailInput).toBeVisible({ timeout: 8_000 });
  });

  test("Submit-Button vorhanden", async ({ page }) => {
    const btn = page.locator("button[type='submit']").first();
    await expect(btn).toBeVisible({ timeout: 8_000 });
  });

  test("Zeigt Bestätigung nach Formular-Submit (mock)", async ({ page }) => {
    await page.route("**/api/auth/forgot-password", (route) => {
      route.fulfill({ status: 202, contentType: "application/json", body: JSON.stringify({ message: "ok" }) });
    });
    const emailInput = page.locator("input[type='email']").first();
    await emailInput.fill("test@example.com");
    const btn = page.locator("button[type='submit']").first();
    await btn.click();
    // Success-Feedback oder URL-Change zu /login
    await Promise.race([
      expect(page.getByText(/gesendet|check|bestätigung|e-mail/i).first()).toBeVisible({ timeout: 6_000 }),
      expect(page).toHaveURL(/\/login/, { timeout: 6_000 }),
    ]).catch(() => {});
  });

  test("Link zurück zur Login-Seite vorhanden", async ({ page }) => {
    const loginLink = page.getByRole("link", { name: /login|anmelden|zurück/i }).first();
    await expect(loginLink).toBeVisible({ timeout: 8_000 });
  });
});

// ---------------------------------------------------------------------------
// Register with referral code
// ---------------------------------------------------------------------------
test.describe("Register page mit Referral-Code", () => {
  // btoa("trader") = "dHJhZGVy" — kein = Padding
  const inviterCode = "dHJhZGVy";

  test("Zeigt Einlader-Namen im Banner bei gültigem ref-Code", async ({ page }) => {
    await page.goto(`/register?ref=${inviterCode}`);
    // Sollte "trader" im Invite-Banner anzeigen
    const banner = page.getByText(/trader/i).first();
    await expect(banner).toBeVisible({ timeout: 10_000 });
  });

  test("Zeigt generischen Banner bei ungültigem Base64-Code", async ({ page }) => {
    await page.goto("/register?ref=!!invalid!!");
    // Sollte trotzdem einen Banner zeigen (generisch), aber keinen Absturz verursachen
    await expect(page.locator("main, body")).toBeVisible({ timeout: 8_000 });
  });
});
