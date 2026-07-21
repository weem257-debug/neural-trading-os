import { test, expect } from "@playwright/test";
import { safeRedirectPath, DEFAULT_REDIRECT } from "../../src/lib/safeRedirect";

/**
 * F-04 — Open-redirect hardening unit tests.
 *
 * Pure-logic tests (no browser/server needed). Verify that safeRedirectPath
 * rejects protocol-relative, backslash-smuggled, scheme and external targets
 * while preserving genuine internal paths.
 */
test.describe("safeRedirectPath (F-04 open-redirect)", () => {
  const malicious: string[] = [
    "//evil.com",
    "///evil.com",
    "/\\evil.com",
    "\\/evil.com",
    "\\\\evil.com",
    "https://evil.com",
    "http://evil.com",
    "//evil.com/path?x=1",
    "javascript:alert(1)",
    "/javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "/data:text/html,x",
    "vbscript:msgbox",
    " //evil.com",
    "//evil.com\n",
    "http:evil.com",
  ];

  for (const input of malicious) {
    test(`rejects malicious target: ${JSON.stringify(input)}`, () => {
      expect(safeRedirectPath(input)).toBe(DEFAULT_REDIRECT);
    });
  }

  const safe: Array<[string, string]> = [
    ["/dashboard", "/dashboard"],
    ["/portfolio", "/portfolio"],
    ["/signals/view/123", "/signals/view/123"],
    ["/register?plan=pro", "/register?plan=pro"],
    ["/depot?tab=p2p", "/depot?tab=p2p"],
  ];

  for (const [input, expected] of safe) {
    test(`preserves internal path: ${input}`, () => {
      expect(safeRedirectPath(input)).toBe(expected);
    });
  }

  test("falls back for null/empty", () => {
    expect(safeRedirectPath(null)).toBe(DEFAULT_REDIRECT);
    expect(safeRedirectPath(undefined)).toBe(DEFAULT_REDIRECT);
    expect(safeRedirectPath("")).toBe(DEFAULT_REDIRECT);
    expect(safeRedirectPath("   ")).toBe(DEFAULT_REDIRECT);
  });

  test("honours custom fallback", () => {
    expect(safeRedirectPath("//evil.com", "/login")).toBe("/login");
  });
});
