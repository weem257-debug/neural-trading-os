/**
 * TradingView chart E2E
 * =====================
 * Regression test for the "chart is only a thin strip" bug: the TradingView
 * embed script overwrites the widget container's inline height with `100%`
 * (autosize mode). When the container itself carried the `62vh`/`50vh`
 * height, that override left the container at its min-height and the iframe
 * (`height: 100%` of a percent-height parent) collapsed to the browser default
 * of 150px. The chart then showed only the toolbar and a sliver of candles.
 *
 * The test seeds an authenticated session (zustand/persist in localStorage),
 * mocks the watchlist endpoint so it does not depend on the backend, and
 * asserts the iframe fills the container on both chart surfaces.
 */
import { test, expect, type Page } from "@playwright/test";

async function seedAuthSession(page: Page) {
  const state = {
    state: {
      token: "e2e-fake-jwt-token",
      username: "e2e_user",
      role: "user",
      tier: "pro",
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
    },
    version: 0,
  };
  await page.addInitScript(
    ([key, value]) => {
      window.localStorage.setItem(key as string, value as string);
      window.localStorage.setItem("onboarding_v1_done", "1");
    },
    ["neural-auth-storage", JSON.stringify(state)],
  );
}

async function mockWatchlist(page: Page) {
  await page.route("**/api/analysis/watchlist", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ symbols: ["AAPL", "MSFT"] }),
    }),
  );
}

const SURFACES = [
  { path: "/charts", minHeight: 420 },
  { path: "/live", minHeight: 400 },
];

test.describe("TradingView chart fills its container", () => {
  for (const { path, minHeight } of SURFACES) {
    test(`${path}: iframe is at least ${minHeight}px tall and matches the container`, async ({ page }) => {
      await seedAuthSession(page);
      await mockWatchlist(page);
      await page.goto(path);

      const container = page.locator(".tradingview-widget-container").first();
      await expect(container).toBeVisible({ timeout: 15_000 });

      const iframe = container.locator("iframe").first();
      await expect(iframe).toBeAttached({ timeout: 15_000 });

      // The embed rebuilds once after it measures the container; give it a
      // moment so we assert the settled layout, not the transient one.
      await page.waitForTimeout(1_500);

      const [containerBox, iframeBox] = await Promise.all([
        container.boundingBox(),
        iframe.boundingBox(),
      ]);
      expect(containerBox).not.toBeNull();
      expect(iframeBox).not.toBeNull();

      expect(iframeBox!.height).toBeGreaterThanOrEqual(minHeight);
      // Iframe must fill the container (TradingView reserves nothing outside it).
      expect(Math.abs(iframeBox!.height - containerBox!.height)).toBeLessThanOrEqual(2);
    });
  }
});

test.describe("CSP allows the TradingView widget origin", () => {
  test("frame-src lists tradingview-widget.com and the embed logs no CSP violation", async ({ page }) => {
    await seedAuthSession(page);
    await mockWatchlist(page);

    const cspViolations: string[] = [];
    page.on("console", (msg) => {
      const text = msg.text();
      if (/tradingview-widget\.com/i.test(text) && /Content Security Policy|CSP rules/i.test(text)) {
        cspViolations.push(text);
      }
    });

    const response = await page.goto("/charts");
    expect(response).not.toBeNull();
    const csp =
      response!.headers()["content-security-policy"] ??
      response!.headers()["content-security-policy-report-only"] ??
      "";
    const frameSrc = csp.split(";").map((d) => d.trim()).find((d) => d.startsWith("frame-src")) ?? "";
    expect(frameSrc).toContain("https://*.tradingview.com");
    expect(frameSrc).toContain("https://*.tradingview-widget.com");

    const iframe = page.locator(".tradingview-widget-container iframe").first();
    await expect(iframe).toBeAttached({ timeout: 15_000 });
    await page.waitForTimeout(1_500);
    expect(cspViolations).toEqual([]);
  });
});
