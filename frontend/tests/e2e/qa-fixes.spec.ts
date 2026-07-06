/**
 * QA-Fix Regression E2E Tests (QA 2026-07-06 → Fixes 2026-07-07)
 * ==============================================================
 * Laufzeit-Verifikation der vier lokalen QA-Fix-Commits, bevor sie
 * deployt werden (Approval apv-003). Jeder Test ist self-contained:
 * die Auth-Session wird deterministisch über localStorage vorgeseedet
 * (kein Backend nötig), API-Antworten werden per route-Mock erzwungen.
 * Damit läuft der Spec identisch lokal und in CI ohne laufendes Backend.
 *
 * Abgedeckte Fixes:
 *   b953cf2  Sidebar mounted-Gate  → keine Hydration-Mismatch (#418/#423)
 *            auf /aktienanalyse für eingeloggte Besucher.
 *   ba7d4d4  Backtest-Fehler-Feedback → prominentes Alert-Banner statt
 *            Silent-Failure.
 *   a516ca1  Dashboard: seed-stabile Sparklines (kein Flackern), Label
 *            "Risiko-Warnung(en)" statt mehrdeutigem "Alarme".
 *
 * Erfordert Dev-/Prod-Server auf http://localhost:3000.
 */
import { test, expect, type Page } from "@playwright/test";

// ---------------------------------------------------------------------------
// Auth-Seed-Helper
// ---------------------------------------------------------------------------
// Reproduziert exakt die Situation, die den Hydration-Bug auslöste: der Server
// rendert unauthentifiziert (kein localStorage), während zustand/persist auf dem
// Client `username` synchron aus localStorage rehydriert → isAuthenticated()===true
// bereits im ersten Client-Render. Das Vorseeden von `neural-auth-storage` ist
// funktional identisch zu "User war eingeloggt und lädt die Seite neu".
async function seedAuthSession(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem(
      "neural-auth-storage",
      JSON.stringify({
        state: { username: "admin", role: "admin", tier: "pro" },
        version: 0,
      }),
    );
    // First-Run-Overlay des Dashboards + globalen Onboarding-Wizard
    // unterdrücken, damit kein Modal-Overlay die Interaktion blockiert.
    localStorage.setItem("neural_first_run_v1", "1");
    localStorage.setItem("onboarding_v1_done", "1");
  });

  // Catch-all: die geseedete Session hat KEIN echtes httpOnly-Cookie, also
  // würde jeder ungemockte authentifizierte Endpunkt 401 liefern. apiFetch
  // feuert bei 401 ein "auth-expired"-Event, das den User global ausloggt und
  // nach /login umleitet (TokenRefresher) — was die zu prüfende Seite abräumt.
  // Ein benigner 200-Fallback verhindert das, ohne Backend. Spezifische Mocks
  // werden pro Test NACH diesem Handler registriert und haben damit Vorrang
  // (Playwright wertet Route-Handler in umgekehrter Registrierungsreihenfolge
  // aus).
  await page.route("**/api/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
  );
}

// Muster, die auf einen Hydration-/SSR-Mismatch hindeuten. In Produktions-
// Builds meldet React minifizierte Fehler (#418/#423/#425), im Dev-Build den
// Klartext ("Hydration failed", "did not match").
const HYDRATION_ERROR_RE =
  /minified react error #(418|423|425|421|422)|hydration failed|did not match|text content does not match|hydrating/i;

// ===========================================================================
// 1) /aktienanalyse — Hydration-Smoke (Kern von b953cf2)
// ===========================================================================
test.describe("QA-Fix b953cf2 — /aktienanalyse Hydration (eingeloggt)", () => {
  test("lädt ohne React #418/#423 Hydration-Mismatch", async ({ page }) => {
    await seedAuthSession(page);

    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => pageErrors.push(err.message));

    await page.goto("/aktienanalyse", { waitUntil: "domcontentloaded" });

    // Der Auth-Gated Sidebar-Zweig hängt von mounted+isAuthenticated ab; nach
    // Mount muss die authentifizierte Sidebar erscheinen — das ist genau der
    // Teilbaum, der zuvor den Mismatch produzierte.
    await expect(
      page.locator("nav[aria-label='Hauptnavigation']").first(),
    ).toBeVisible({ timeout: 10_000 });

    // Post-Hydration kurz nachlaufen lassen, damit verspätete Errors auftauchen.
    await page.waitForTimeout(1_500);

    const hydrationErrors = [...consoleErrors, ...pageErrors].filter((t) =>
      HYDRATION_ERROR_RE.test(t),
    );
    expect(
      hydrationErrors,
      `Hydration-Fehler auf /aktienanalyse:\n${hydrationErrors.join("\n")}`,
    ).toHaveLength(0);

    // Zusätzlich: keine uncaught Exception (White-Screen-Schutz).
    expect(pageErrors, `Uncaught:\n${pageErrors.join("\n")}`).toHaveLength(0);
  });
});

// ===========================================================================
// 2) /backtest — Fehler-Feedback als Alert-Banner (ba7d4d4)
// ===========================================================================
test.describe("QA-Fix ba7d4d4 — Backtest-Fehler-Feedback", () => {
  test("zeigt Alert-Banner wenn der Run-Request fehlschlägt", async ({ page }) => {
    await seedAuthSession(page);

    // Rausch-Endpunkte ruhigstellen, damit die Seite deterministisch rendert.
    await page.route("**/api/backtest/strategies", (r) =>
      r.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
    );
    await page.route("**/api/backtest/jobs", (r) =>
      r.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
    );
    // Kernfall: der Backtest-Start scheitert serverseitig.
    await page.route("**/api/backtest/run", (r) =>
      r.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Backtest-Engine nicht verfügbar" }),
      }),
    );

    await page.goto("/backtest", { waitUntil: "domcontentloaded" });

    // Auth-Guard darf nicht auf /login umleiten (Seed-Session aktiv).
    await expect(page).toHaveURL(/\/backtest/, { timeout: 8_000 });

    const runBtn = page
      .getByRole("button", { name: /backtest starten/i })
      .first();
    await expect(runBtn).toBeVisible({ timeout: 10_000 });
    await runBtn.click();

    // Das prominente Alert-Banner (role="alert") muss erscheinen — vorher wurde
    // der Fehler nur als winziger Inline-Text oder gar nicht angezeigt.
    const alertBanner = page.locator("[role='alert']").first();
    await expect(alertBanner).toBeVisible({ timeout: 8_000 });
    await expect(alertBanner).toContainText(/nicht verfügbar|fehlgeschlagen|error|500/i);
  });
});

// ===========================================================================
// 3) /dashboard — stabile Sparklines + Risiko-Warnung-Label (a516ca1)
// ===========================================================================
test.describe("QA-Fix a516ca1 — Dashboard Sparklines & Labels", () => {
  test.beforeEach(async ({ page }) => {
    await seedAuthSession(page);
    // Deterministische Portfolio-Daten (4 Top-Positionen für 4 Sparklines).
    await page.route("**/api/portfolio/snapshot", (r) =>
      r.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          timestamp: new Date().toISOString(),
          total_value: 100000,
          cash: 20000,
          invested: 80000,
          total_pnl: 5000,
          total_pnl_pct: 0.05,
          day_pnl: 250,
          day_pnl_pct: 0.0025,
          positions: [
            { ticker: "NVDA", asset_class: "stock", quantity: 10, avg_entry_price: 700, current_price: 875, market_value: 8750, unrealized_pnl: 1750, unrealized_pnl_pct: 0.25, realized_pnl: 0, weight: 0.3 },
            { ticker: "AAPL", asset_class: "stock", quantity: 20, avg_entry_price: 170, current_price: 189, market_value: 3780, unrealized_pnl: 380, unrealized_pnl_pct: 0.11, realized_pnl: 0, weight: 0.2 },
            { ticker: "MSFT", asset_class: "stock", quantity: 15, avg_entry_price: 390, current_price: 415, market_value: 6225, unrealized_pnl: 375, unrealized_pnl_pct: 0.06, realized_pnl: 0, weight: 0.2 },
            { ticker: "TSLA", asset_class: "stock", quantity: 12, avg_entry_price: 260, current_price: 248, market_value: 2976, unrealized_pnl: -144, unrealized_pnl_pct: -0.046, realized_pnl: 0, weight: 0.1 },
          ],
        }),
      }),
    );
    // Risiko-Metriken mit zwei aktiven Warnungen → "Risiko-Warnungen"-Label.
    await page.route("**/api/risk/metrics", (r) =>
      r.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          portfolio_var_95: 3000,
          portfolio_var_99: 5000,
          max_drawdown: 0.08,
          current_drawdown: 0.02,
          sharpe_ratio: 1.8,
          concentration_risk: 0.35,
          leverage: 1.0,
          alerts: ["Konzentrationsrisiko hoch", "Drawdown nähert sich Limit"],
        }),
      }),
    );
  });

  test("Sparklines flackern nicht über einen Portfolio-Tick hinweg", async ({ page }) => {
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 8_000 });

    // Die Top-Positionen-Sparklines: Linien-Pfade tragen ein stroke-Attribut.
    const strokePaths = page.locator("svg path[stroke]");
    await expect(strokePaths.first()).toBeVisible({ timeout: 10_000 });

    const before = await strokePaths.evaluateAll((els) =>
      els.map((e) => e.getAttribute("d")),
    );
    expect(before.length).toBeGreaterThanOrEqual(4);

    // Merker für den Portfolio-Gesamtwert, um zu beweisen, dass ein Re-Render
    // stattgefunden hat (der 5s-Tick mutiert total_value).
    const valueBefore = await page.locator("body").innerText();

    // Auf den 5s-Portfolio-Tick warten, der zuvor jede Sparkline neu würfelte.
    await page.waitForTimeout(6_000);

    const after = await strokePaths.evaluateAll((els) =>
      els.map((e) => e.getAttribute("d")),
    );
    const valueAfter = await page.locator("body").innerText();

    // Nachweis, dass tatsächlich re-gerendert wurde (sonst wäre der Test wertlos).
    expect(
      valueAfter !== valueBefore,
      "Erwartete einen Re-Render durch den 5s-Portfolio-Tick",
    ).toBe(true);

    // Kernaussage: die Sparkline-Pfade sind über den Re-Render hinweg identisch.
    expect(after).toEqual(before);
  });

  test("zeigt eindeutiges 'Risiko-Warnung'-Label statt 'Alarme'", async ({ page }) => {
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 8_000 });

    // Bei aktiven Risk-Alerts muss das disambiguierte Label erscheinen.
    await expect(
      page.getByText(/risiko-warnung/i).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("kennzeichnet den Portfoliowert als Demo-Simulation", async ({ page }) => {
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await expect(
      page.getByText(/demo-portfolio, live simuliert/i).first(),
    ).toBeVisible({ timeout: 10_000 });
  });
});
