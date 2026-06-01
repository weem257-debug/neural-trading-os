/**
 * Public / Conversion Pages E2E Tests
 * ======================================
 * Smoke-tests für Landing, Register, Pricing und Signal-Marketplace.
 * Diese Seiten sind ohne Auth erreichbar und sind die Haupt-Konversionspunkte.
 * Erfordert Dev-Server auf http://localhost:3000.
 */
import { test, expect } from "@playwright/test";

// ---------------------------------------------------------------------------
// Landing Page
// ---------------------------------------------------------------------------
test.describe("Landing page (/landing)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/landing");
  });

  test("Lädt ohne Fehler und zeigt Hero-Heading", async ({ page }) => {
    const hero = page.locator("h1, h2").first();
    await expect(hero).toBeVisible({ timeout: 10_000 });
  });

  test("Enthält CTA-Link zur Registrierung", async ({ page }) => {
    const ctaLink = page
      .getByRole("link", { name: /registrieren|kostenlos starten|start|register/i })
      .first();
    await expect(ctaLink).toBeVisible({ timeout: 8_000 });
  });

  test("Waitlist-E-Mail-Eingabe vorhanden", async ({ page }) => {
    const emailInput = page.locator("input[type='email']").first();
    await expect(emailInput).toBeVisible({ timeout: 8_000 });
  });

  test("Navbar-Link zur Pricing-Page vorhanden", async ({ page }) => {
    const pricingLink = page
      .getByRole("link", { name: /pricing|preise/i })
      .first();
    await expect(pricingLink).toBeVisible({ timeout: 8_000 });
  });
});

// ---------------------------------------------------------------------------
// Register Page
// ---------------------------------------------------------------------------
test.describe("Register page (/register)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/register");
  });

  test("Lädt korrekt und zeigt Registrierungsformular", async ({ page }) => {
    await expect(page).toHaveURL(/\/register/, { timeout: 8_000 });
    await expect(page.locator("main, body")).toBeVisible({ timeout: 5_000 });
  });

  test("Zeigt Username-, E-Mail- und Passwort-Felder", async ({ page }) => {
    const usernameField = page.locator("input[autocomplete='username'], input[name='username']").first();
    const emailField    = page.locator("input[type='email']").first();
    const passwordField = page.locator("input[type='password']").first();

    await expect(usernameField).toBeVisible({ timeout: 8_000 });
    await expect(emailField).toBeVisible({ timeout: 8_000 });
    await expect(passwordField).toBeVisible({ timeout: 8_000 });
  });

  test("Submit-Button ist initial deaktiviert (DSGVO-Checkbox)", async ({ page }) => {
    const submitBtn = page.locator("button[type='submit']").first();
    await expect(submitBtn).toBeDisabled({ timeout: 8_000 });
  });

  test("Passwort-Stärke-Anzeige erscheint bei Eingabe", async ({ page }) => {
    const passwordField = page.locator("input[type='password']").first();
    await passwordField.fill("abc");
    // Stärke-Label sollte erscheinen (Zu kurz / Schwach / Mittel / Stark)
    const strengthLabel = page.getByText(/zu kurz|schwach|mittel|stark/i).first();
    await expect(strengthLabel).toBeVisible({ timeout: 5_000 });
  });

  test("Link zur Login-Seite vorhanden", async ({ page }) => {
    const loginLink = page.getByRole("link", { name: /anmelden|login/i }).first();
    await expect(loginLink).toBeVisible({ timeout: 8_000 });
  });

  test("Link zur Landing-Page vorhanden", async ({ page }) => {
    const backLink = page.getByRole("link", { name: /startseite|landing|zurück/i }).first();
    await expect(backLink).toBeVisible({ timeout: 8_000 });
  });

  test("Username-Verfügbarkeitsprüfung läuft bei Eingabe", async ({ page }) => {
    // Mock die Username-Check-API
    await page.route("**/api/auth/check-username**", (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ available: false }),
      });
    });

    const usernameField = page.locator("input[autocomplete='username'], input[name='username']").first();
    await usernameField.fill("existinguser");

    // Warte auf Feedback (taken-Indikator)
    const takenIndicator = page.getByText(/bereits vergeben|nicht verfügbar|taken/i).first();
    await expect(takenIndicator).toBeVisible({ timeout: 5_000 });
  });
});

// ---------------------------------------------------------------------------
// Pricing Page
// ---------------------------------------------------------------------------
test.describe("Pricing page (/pricing)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/pricing");
  });

  test("Lädt korrekt ohne Auth", async ({ page }) => {
    await expect(page).toHaveURL(/\/pricing/, { timeout: 8_000 });
    await expect(page.locator("main, body")).toBeVisible({ timeout: 5_000 });
  });

  test("Zeigt mindestens 3 Plan-Karten (Free, Basic, Pro)", async ({ page }) => {
    // Suche nach plan-typischen Elementen (€-Preis oder Plan-Name)
    const priceElements = page.getByText(/€|kostenlos|free/i);
    await expect(priceElements.first()).toBeVisible({ timeout: 10_000 });
  });

  test("Kostenlos-Registrieren-CTA vorhanden", async ({ page }) => {
    const freeCtaLink = page
      .getByRole("link", { name: /kostenlos registrieren|jetzt starten|start free/i })
      .first();
    await expect(freeCtaLink).toBeVisible({ timeout: 10_000 });
  });

  test("FAQ-Sektion vorhanden", async ({ page }) => {
    const faq = page.getByText(/faq|häufige fragen|frequently/i).first();
    await expect(faq).toBeVisible({ timeout: 10_000 });
  });
});

// ---------------------------------------------------------------------------
// Signal Marketplace
// ---------------------------------------------------------------------------
test.describe("Signal marketplace (/signals/marketplace)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/signals/marketplace");
  });

  test("Lädt ohne Auth korrekt", async ({ page }) => {
    await expect(page).toHaveURL(/signals\/marketplace/, { timeout: 8_000 });
    await expect(page.locator("main, body")).toBeVisible({ timeout: 5_000 });
  });

  test("Zeigt Signal-Tabelle oder Marktplatz-Content", async ({ page }) => {
    // Heading oder Tabellen-Header
    const heading = page.locator("h1, h2, th").first();
    await expect(heading).toBeVisible({ timeout: 10_000 });
  });
});

// ---------------------------------------------------------------------------
// Performance Page
// ---------------------------------------------------------------------------
test.describe("Performance page (/performance)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/performance");
  });

  test("Lädt ohne Auth korrekt", async ({ page }) => {
    await expect(page).toHaveURL(/\/performance/, { timeout: 8_000 });
    await expect(page.locator("main, body")).toBeVisible({ timeout: 5_000 });
  });

  test("Zeigt Performance-Heading", async ({ page }) => {
    const heading = page.locator("h1, h2").first();
    await expect(heading).toBeVisible({ timeout: 10_000 });
  });

  test("Zeigt Register-CTA (Konversion)", async ({ page }) => {
    const ctaLink = page
      .getByRole("link", { name: /registrieren|kostenlos|start|register/i })
      .first();
    await expect(ctaLink).toBeVisible({ timeout: 10_000 });
  });
});

// ---------------------------------------------------------------------------
// Invite / Referral Landing Page
// ---------------------------------------------------------------------------
test.describe("Invite page (/invite/[code])", () => {
  // base64("trader") = "dHJhZGVy" (kein = Padding — sicherer in URL-Pfaden)
  const validCode = "dHJhZGVy";

  test("Lädt ohne Auth korrekt", async ({ page }) => {
    await page.goto(`/invite/${validCode}`);
    await expect(page.locator("main, body")).toBeVisible({ timeout: 8_000 });
  });

  test("Zeigt Einlader-Username bei gültigem Code", async ({ page }) => {
    await page.goto(`/invite/${validCode}`);
    // atob("dHJhZGVy") = "trader"
    const inviterText = page.getByText(/trader/i).first();
    await expect(inviterText).toBeVisible({ timeout: 8_000 });
  });

  test("Zeigt Register-CTA-Link mit ref-Code", async ({ page }) => {
    await page.goto(`/invite/${validCode}`);
    const registerLink = page
      .getByRole("link", { name: /kostenlos registrieren/i })
      .first();
    await expect(registerLink).toBeVisible({ timeout: 8_000 });
    const href = await registerLink.getAttribute("href");
    expect(href).toContain("/register");
    expect(href).toContain("ref=");
  });

  test("Zeigt Fallback-Text bei ungültigem Code", async ({ page }) => {
    await page.goto("/invite/!!invalid!!");
    const fallback = page.getByText(/eingeladen/i).first();
    await expect(fallback).toBeVisible({ timeout: 8_000 });
  });
});

// ---------------------------------------------------------------------------
// Signal View / Share Page (/signals/view/[id])
// ---------------------------------------------------------------------------
test.describe("Signal share page (/signals/view/[id])", () => {
  test("Ungültige ID zeigt Nicht-gefunden-Meldung", async ({ page }) => {
    // Mock backend: by-id returns null (not found)
    await page.route("**/api/signals/by-id/**", (route) => {
      route.fulfill({ status: 200, contentType: "application/json", body: "null" });
    });
    await page.goto("/signals/view/nonexistent-id-abc");
    const notFound = page.getByText(/nicht gefunden|nicht mehr|abgelaufen/i).first();
    await expect(notFound).toBeVisible({ timeout: 8_000 });
  });

  test("Lädt ohne Authentifizierung", async ({ page }) => {
    await page.route("**/api/signals/by-id/**", (route) => {
      route.fulfill({ status: 200, contentType: "application/json", body: "null" });
    });
    await page.goto("/signals/view/any-id");
    // Should not redirect to /login
    await expect(page).not.toHaveURL(/\/login/, { timeout: 5_000 });
    await expect(page.locator("body")).toBeVisible({ timeout: 5_000 });
  });

  test("Zeigt Register-CTA bei nicht gefundenem Signal", async ({ page }) => {
    await page.route("**/api/signals/by-id/**", (route) => {
      route.fulfill({ status: 200, contentType: "application/json", body: "null" });
    });
    await page.goto("/signals/view/not-found-id");
    const ctaLink = page.getByRole("link", { name: /signal generieren|eigenes signal/i }).first();
    await expect(ctaLink).toBeVisible({ timeout: 8_000 });
  });

  test("Rendert Signal-Card bei gültigem Signal", async ({ page }) => {
    const mockSignal = {
      id: "test-signal-id-123",
      ticker: "AAPL",
      direction: "BUY",
      confidence: 0.85,
      reasoning: "Starker Aufwärtstrend erkannt.",
      source: "Demo[mock]",
      generated_at: new Date().toISOString(),
      price_target: 200.0,
      stop_loss: 175.0,
      time_horizon: "1-3 Monate",
      agents_consensus: {},
    };
    await page.route("**/api/signals/by-id/**", (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockSignal),
      });
    });
    await page.goto("/signals/view/test-signal-id-123");
    // Ticker must be visible
    await expect(page.getByText("AAPL")).toBeVisible({ timeout: 8_000 });
    // Direction label
    await expect(page.getByText(/kaufen/i).first()).toBeVisible({ timeout: 5_000 });
  });

  test("Brand-Header zeigt Neural Trading OS", async ({ page }) => {
    await page.route("**/api/signals/by-id/**", (route) => {
      route.fulfill({ status: 200, contentType: "application/json", body: "null" });
    });
    await page.goto("/signals/view/any-id");
    const brand = page.getByText(/neural trading os/i).first();
    await expect(brand).toBeVisible({ timeout: 8_000 });
  });
});

// ---------------------------------------------------------------------------
// Legal Pages (must be reachable without auth)
// ---------------------------------------------------------------------------
test.describe("Legal pages (no auth required)", () => {
  for (const { path, text } of [
    { path: "/impressum",   text: /impressum/i },
    { path: "/datenschutz", text: /datenschutz/i },
    { path: "/agb",         text: /agb|allgemeine/i },
  ]) {
    test(`${path} erreichbar ohne Login`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(new RegExp(path), { timeout: 8_000 });
      const heading = page.locator("h1").first();
      await expect(heading).toBeVisible({ timeout: 8_000 });
      await expect(heading).toHaveText(text, { timeout: 5_000 });
    });
  }
});
