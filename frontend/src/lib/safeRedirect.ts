/**
 * safeRedirectPath — hardened post-login/redirect target validation (F-04).
 *
 * The previous check `path.startsWith("/")` is INSUFFICIENT: a protocol-relative
 * URL like `//evil.com` also starts with a single "/", yet browsers treat it as
 * an absolute cross-origin navigation → open redirect. Backslash variants
 * (`/\evil.com`, `\/evil.com`) are normalised to `//` by browsers as well.
 *
 * This helper accepts ONLY genuine same-origin internal paths:
 *   - must start with exactly ONE "/" (reject "//..." and "/\..." etc.)
 *   - must not contain control chars / whitespace or a URL scheme
 *   - falls back to a safe default otherwise.
 *
 * It never returns an absolute URL and never trusts attacker-controlled input.
 */
export const DEFAULT_REDIRECT = "/dashboard";

export function safeRedirectPath(
  raw: string | null | undefined,
  fallback: string = DEFAULT_REDIRECT,
): string {
  if (!raw) return fallback;

  const value = raw.trim();
  if (value === "") return fallback;

  // Reject control characters / whitespace (space, tab, newline, …) which could
  // smuggle headers or bypass naive prefix checks. NOTE: this must NOT reject
  // the hyphen, so legitimate paths like "/forgot-password" survive.
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u0020\u007f]/.test(value)) return fallback;

  // Normalise backslashes to forward slashes the way browsers do, so that
  // "/\evil.com" and "\/evil.com" are caught by the protocol-relative check.
  const normalised = value.replace(/\\/g, "/");

  // Must be an absolute-path reference: start with exactly one "/".
  if (!normalised.startsWith("/")) return fallback;

  // Protocol-relative ("//host") → external. Reject.
  if (normalised.startsWith("//")) return fallback;

  // Defense in depth: reject any scheme (javascript:, data:, http:, …).
  const lower = normalised.toLowerCase();
  if (lower.includes("://")) return fallback;
  // "/<scheme>:" at the very start (e.g. "/javascript:alert(1)").
  if (/^\/[a-z][a-z0-9+.-]*:/i.test(lower)) return fallback;

  // At this point `normalised` is a genuine internal path. Return the ORIGINAL
  // value so legitimate encoded query params are preserved.
  return value;
}
