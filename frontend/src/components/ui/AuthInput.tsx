"use client";

import type { FocusEvent } from "react";

/**
 * Shared input "glass" chrome for the auth pages — the background/border and
 * focus/blur glow were byte-identical (inline in login, as local
 * inputStyle/inputFocus/inputBlur consts in register, and as local
 * inputStyle/onFocus/onBlur consts in forgot-password and reset-password).
 */
export const authInputStyle = {
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(76,141,246,0.15)",
};

export function authInputFocus(e: FocusEvent<HTMLInputElement>) {
  e.currentTarget.style.border = "1px solid rgba(76,141,246,0.5)";
  e.currentTarget.style.boxShadow = "0 0 12px rgba(76,141,246,0.1)";
}

export function authInputBlur(e: FocusEvent<HTMLInputElement>) {
  e.currentTarget.style.border = "1px solid rgba(76,141,246,0.15)";
  e.currentTarget.style.boxShadow = "none";
}
