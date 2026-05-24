/**
 * Auth / Login Page E2E Tests
 * =============================
 * Tests the login page structure and form behaviour.
 * Requires dev server running on http://localhost:3000.
 *
 * Note: backend calls are not required for form-structure tests.
 * The "wrong credentials" test mocks the backend response via route interception.
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
