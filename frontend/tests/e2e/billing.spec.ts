/**
 * Billing & Checkout Flow E2E Tests
 * ===================================
 * Deckt den vollständigen Monetarisierungs-Pfad ab:
 *  - Auth-Guard auf /billing (unauthenticated → /login)
 *  - Authentifizierte Billing-UI via geseedeter localStorage-Session
 *  - Graceful Degradation, wenn Stripe NICHT konfiguriert ist (kein harter Fehler)
 *  - Checkout-Redirect zu Stripe (success_url-Flow)
 *  - Customer-Portal-Öffnung für zahlende Kunden
 *  - Usage-Card, Rechnungs-Historie, Success-Banner nach Checkout
 *  - Pricing → Billing CTA-Verkettung mit ?plan=-Vorauswahl
 *
 * Strategie: Die App liest die Auth-Session aus localStorage
 * ("neural-auth-storage", zustand/persist). Wir seeden vor dem Laden
 * einen gültigen (nicht abgelaufenen) Token und mocken alle
 * /api/billing/*-Antworten, um die UI-Logik isoliert zu testen —
 * ohne echtes Backend oder Stripe.
 *
 * Erfordert Dev-Server auf http://localhost:3000.
 */
import { test, expect, type Page } from "@playwright/test";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Seed a non-expired authenticated session into localStorage before page load. */
async function seedAuthSession(
  page: Page,
  opts: { tier?: string; role?: string; username?: string } = {},
) {
  const { tier = "free", role = "user", username = "e2e_user" } = opts;
  const state = {
    state: {
      token: "e2e-fake-jwt-token",
      username,
      role,
      tier,
      // expires in 24h so isAuthenticated() returns true
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
    },
    version: 0,
  };
  await page.addInitScript(
    ([key, value]) => {
      window.localStorage.setItem(key as string, value as string);
      // Suppress the onboarding modal overlay (covers the page and blocks
      // clicks). Product behavior is correct; we only opt out for E2E.
      window.localStorage.setItem("onboarding_v1_done", "1");
    },
    ["neural-auth-storage", JSON.stringify(state)],
  );
}

interface BillingStatusMock {
  plan?: string;
  plan_name?: string;
  price_eur?: number;
  signals_per_day?: number;
  status?: string;
  current_period_end?: string | null;
  cancel_at_period_end?: boolean;
  stripe_configured?: boolean;
}

/** Register route handlers for the billing API endpoints. */
async function mockBillingApi(
  page: Page,
  cfg: {
    status?: BillingStatusMock;
    usage?: Record<string, unknown>;
    invoices?: unknown[];
    checkoutUrl?: string;
    checkoutStatus?: number;
    portalUrl?: string;
    portalStatus?: number;
  } = {},
) {
  const status: Required<BillingStatusMock> = {
    plan: "free",
    plan_name: "Free",
    price_eur: 0,
    signals_per_day: 3,
    status: "active",
    current_period_end: null,
    cancel_at_period_end: false,
    stripe_configured: false,
    ...cfg.status,
  };

  await page.route("**/api/billing/status", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(status) }),
  );

  await page.route("**/api/billing/usage", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        cfg.usage ?? {
          plan: status.plan,
          signals_used_today: 1,
          signals_limit: status.signals_per_day,
          signals_remaining: Math.max(0, status.signals_per_day - 1),
          reset_at: new Date(Date.now() + 3600_000).toISOString(),
        },
      ),
    }),
  );

  await page.route("**/api/billing/invoices", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ invoices: cfg.invoices ?? [] }),
    }),
  );

  await page.route("**/api/billing/checkout", (route) => {
    if (cfg.checkoutStatus && cfg.checkoutStatus >= 400) {
      return route.fulfill({
        status: cfg.checkoutStatus,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Stripe ist nicht konfiguriert." }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        checkout_url: cfg.checkoutUrl ?? "https://checkout.stripe.com/c/pay/e2e-session",
        session_id: "cs_test_e2e",
      }),
    });
  });

  await page.route("**/api/billing/portal", (route) => {
    if (cfg.portalStatus && cfg.portalStatus >= 400) {
      return route.fulfill({
        status: cfg.portalStatus,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Kein aktives Stripe-Abonnement gefunden." }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ portal_url: cfg.portalUrl ?? "https://billing.stripe.com/p/session/e2e" }),
    });
  });

  // /api/auth/me — used by syncUserInfo() after checkout success
  await page.route("**/api/auth/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        username: "e2e_user",
        role: "user",
        tier: status.plan,
        email: "e2e@example.com",
        email_unsubscribed: false,
        created_at: new Date().toISOString(),
      }),
    }),
  );
}

// ---------------------------------------------------------------------------
// Auth-Guard (unauthenticated)
// ---------------------------------------------------------------------------
test.describe("Billing auth-guard", () => {
  test("/billing leitet ohne Session zu /login um", async ({ page }) => {
    await page.goto("/billing");
    await expect(page).toHaveURL(/\/login/, { timeout: 8_000 });
  });
});

// ---------------------------------------------------------------------------
// Free plan + Stripe NOT configured → graceful degradation
// ---------------------------------------------------------------------------
test.describe("Billing — Free-Plan, Stripe nicht konfiguriert", () => {
  test.beforeEach(async ({ page }) => {
    await seedAuthSession(page, { tier: "free" });
    await mockBillingApi(page, { status: { plan: "free", stripe_configured: false } });
    await page.goto("/billing");
  });

  test("Rendert ohne Crash und zeigt Billing-Heading", async ({ page }) => {
    await expect(page).toHaveURL(/\/billing/, { timeout: 8_000 });
    const h1 = page.locator("h1").first();
    await expect(h1).toBeVisible({ timeout: 10_000 });
    await expect(h1).toHaveText(/billing|subscription/i, { timeout: 5_000 });
  });

  test("Zeigt aktuellen Free-Plan", async ({ page }) => {
    await expect(page.getByText(/aktueller plan/i).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/kostenlos/i).first()).toBeVisible({ timeout: 5_000 });
  });

  test("Zeigt Stripe-nicht-aktiviert-Hinweis statt hartem Fehler", async ({ page }) => {
    const hint = page.getByText(/stripe noch nicht aktiviert/i).first();
    await expect(hint).toBeVisible({ timeout: 10_000 });
    // Setup-Hinweis nennt die nötigen Env-Variablen
    await expect(page.getByText(/STRIPE_SECRET_KEY/).first()).toBeVisible({ timeout: 5_000 });
  });

  test("Upgrade-Buttons sind deaktiviert, wenn Stripe fehlt", async ({ page }) => {
    const upgradeBtn = page.getByRole("button", { name: /upgrade/i }).first();
    await expect(upgradeBtn).toBeVisible({ timeout: 10_000 });
    await expect(upgradeBtn).toBeDisabled({ timeout: 5_000 });
  });

  test("Usage-Card zeigt Signal-Nutzung", async ({ page }) => {
    await expect(page.getByText(/signale heute/i).first()).toBeVisible({ timeout: 10_000 });
  });
});

// ---------------------------------------------------------------------------
// Free plan + Stripe configured → Checkout redirect
// ---------------------------------------------------------------------------
test.describe("Billing — Checkout-Flow (Stripe aktiv)", () => {
  test.beforeEach(async ({ page }) => {
    await seedAuthSession(page, { tier: "free" });
    await mockBillingApi(page, {
      status: { plan: "free", stripe_configured: true },
      checkoutUrl: "https://checkout.stripe.com/c/pay/cs_test_e2e",
    });
  });

  test("Upgrade-Button ist aktiv, wenn Stripe konfiguriert ist", async ({ page }) => {
    await page.goto("/billing");
    const upgradeBtn = page.getByRole("button", { name: /upgrade/i }).first();
    await expect(upgradeBtn).toBeVisible({ timeout: 10_000 });
    await expect(upgradeBtn).toBeEnabled({ timeout: 5_000 });
    // Kein Stripe-Setup-Hinweis im konfigurierten Zustand
    await expect(page.getByText(/stripe noch nicht aktiviert/i)).toHaveCount(0);
  });

  test("Klick auf Upgrade leitet zur Stripe-Checkout-URL", async ({ page }) => {
    await page.goto("/billing");
    const upgradeBtn = page.getByRole("button", { name: /upgrade/i }).first();
    await expect(upgradeBtn).toBeEnabled({ timeout: 10_000 });
    await upgradeBtn.click();
    // window.location.href = checkout_url → Navigation zur Stripe-Domain
    await page.waitForURL(/checkout\.stripe\.com/, { timeout: 8_000 });
    expect(page.url()).toContain("checkout.stripe.com");
  });

  test("?plan=pro hebt den vorausgewählten Plan hervor", async ({ page }) => {
    await page.goto("/billing?plan=pro");
    const selectedBadge = page.getByText(/ausgewählt/i).first();
    await expect(selectedBadge).toBeVisible({ timeout: 10_000 });
  });
});

// ---------------------------------------------------------------------------
// Checkout error handling
// ---------------------------------------------------------------------------
test.describe("Billing — Checkout-Fehlerbehandlung", () => {
  test("Backend-503 bei Checkout zeigt Fehlermeldung statt White-Screen", async ({ page }) => {
    await seedAuthSession(page, { tier: "free" });
    await mockBillingApi(page, {
      status: { plan: "free", stripe_configured: true },
      checkoutStatus: 503,
    });
    await page.goto("/billing");
    const upgradeBtn = page.getByRole("button", { name: /upgrade/i }).first();
    await expect(upgradeBtn).toBeEnabled({ timeout: 10_000 });
    await upgradeBtn.click();
    // Fehler-Banner muss erscheinen; Seite bleibt auf /billing
    await expect(page.getByText(/stripe ist nicht konfiguriert|fehler/i).first()).toBeVisible({ timeout: 8_000 });
    await expect(page).toHaveURL(/\/billing/);
  });
});

// ---------------------------------------------------------------------------
// Paid plan → Portal + Invoices
// ---------------------------------------------------------------------------
test.describe("Billing — Zahlender Kunde (Pro)", () => {
  test.beforeEach(async ({ page }) => {
    await seedAuthSession(page, { tier: "pro" });
    await mockBillingApi(page, {
      status: {
        plan: "pro",
        plan_name: "Pro",
        price_eur: 99,
        signals_per_day: 50,
        status: "active",
        current_period_end: new Date(Date.now() + 30 * 86400_000).toISOString(),
        cancel_at_period_end: false,
        stripe_configured: true,
      },
      invoices: [
        {
          id: "in_e2e_1",
          number: "NTO-0001",
          date: "01.05.2026",
          amount_eur: 99.0,
          status: "paid",
          pdf_url: "https://stripe.com/invoice/e2e.pdf",
          hosted_url: "https://stripe.com/invoice/e2e",
        },
      ],
    });
    await page.goto("/billing");
  });

  test("Zeigt Pro-Plan und Preis", async ({ page }) => {
    await expect(page.getByText("Pro").first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/€99/).first()).toBeVisible({ timeout: 5_000 });
  });

  test("Zeigt 'Abonnement verwalten'-Button (Portal)", async ({ page }) => {
    const portalBtn = page.getByRole("button", { name: /abonnement verwalten/i }).first();
    await expect(portalBtn).toBeVisible({ timeout: 10_000 });
    await expect(portalBtn).toBeEnabled({ timeout: 5_000 });
  });

  test("Zeigt Rechnungs-Historie mit PDF-Link", async ({ page }) => {
    await expect(page.getByText(/rechnungen/i).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("NTO-0001").first()).toBeVisible({ timeout: 5_000 });
    const pdfLink = page.getByRole("link", { name: /pdf/i }).first();
    await expect(pdfLink).toBeVisible({ timeout: 5_000 });
  });

  test("Zeigt keine Upgrade-Plan-Karten für bestehenden Pro-Kunden", async ({ page }) => {
    // Pro-Kunde sieht die Bestätigung statt der Upgrade-Auswahl
    await expect(page.getByText(/du bist auf dem/i).first()).toBeVisible({ timeout: 10_000 });
  });
});

// ---------------------------------------------------------------------------
// Success banner after Stripe redirect back
// ---------------------------------------------------------------------------
test.describe("Billing — Erfolgs-Banner nach Checkout", () => {
  test("?success=1 zeigt Aktivierungs-Banner", async ({ page }) => {
    await seedAuthSession(page, { tier: "pro" });
    await mockBillingApi(page, {
      status: {
        plan: "pro",
        plan_name: "Pro",
        price_eur: 99,
        signals_per_day: 50,
        status: "active",
        stripe_configured: true,
      },
    });
    await page.goto("/billing?success=1");
    await expect(page.getByText(/abonnement aktiviert/i).first()).toBeVisible({ timeout: 10_000 });
  });
});

// ---------------------------------------------------------------------------
// Pricing → Billing CTA chaining (authenticated)
// ---------------------------------------------------------------------------
test.describe("Pricing → Billing Verkettung (authentifiziert)", () => {
  test("Authentifizierter Nutzer auf /pricing sieht Abonnieren-CTA zu /billing", async ({ page }) => {
    await seedAuthSession(page, { tier: "free" });
    await page.goto("/pricing");
    // Basic/Pro CTA für eingeloggte Free-User → /billing?plan=...
    const subscribeLink = page
      .getByRole("link", { name: /jetzt abonnieren/i })
      .first();
    await expect(subscribeLink).toBeVisible({ timeout: 10_000 });
    const href = await subscribeLink.getAttribute("href");
    expect(href).toContain("/billing?plan=");
  });
});
