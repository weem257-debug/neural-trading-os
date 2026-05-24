"use client";

/**
 * Lightweight i18n context — no URL locale segments required.
 * Persists locale choice in localStorage. Detects browser language on first visit.
 * Provides a useI18n() hook and a <LanguageToggle /> component.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

// ---- Type helpers -----------------------------------------------------------

type NestedMessages = { [key: string]: string | NestedMessages };
type Locale = "en" | "de";

// ---- Bundled messages (imported at build time — no async fetch needed) ------
import enMessages from "../../messages/en.json";
import deMessages from "../../messages/de.json";

const MESSAGES: Record<Locale, NestedMessages> = {
  en: enMessages as NestedMessages,
  de: deMessages as NestedMessages,
};

// ---- Resolve a dotted key from a nested object ------------------------------
function resolve(messages: NestedMessages, key: string): string {
  const parts = key.split(".");
  let current: string | NestedMessages = messages;
  for (const part of parts) {
    if (typeof current !== "object" || current === null) return key;
    current = (current as NestedMessages)[part];
    if (current === undefined) return key;
  }
  return typeof current === "string" ? current : key;
}

// ---- Context ----------------------------------------------------------------

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue>({
  locale: "en",
  setLocale: () => {},
  t: (key) => key,
});

// ---- Provider ---------------------------------------------------------------

const STORAGE_KEY = "neural-trading-locale";

function detectBrowserLocale(): Locale {
  if (typeof navigator === "undefined") return "en";
  const lang = navigator.language?.toLowerCase() ?? "";
  return lang.startsWith("de") ? "de" : "en";
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("en");

  // Initialise from localStorage or browser preference
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as Locale | null;
    if (stored === "en" || stored === "de") {
      setLocaleState(stored);
    } else {
      setLocaleState(detectBrowserLocale());
    }
  }, []);

  // Keep <html lang="…"> in sync for screen readers
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    localStorage.setItem(STORAGE_KEY, l);
  }, []);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      let text = resolve(MESSAGES[locale], key);
      if (text === key) {
        // Fallback to English
        text = resolve(MESSAGES.en, key);
      }
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          text = text.replace(`{${k}}`, String(v));
        }
      }
      return text;
    },
    [locale]
  );

  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </I18nContext.Provider>
  );
}

// ---- Hook -------------------------------------------------------------------

export function useI18n(): I18nContextValue {
  return useContext(I18nContext);
}

// ---- Language Toggle component (DE / EN flag buttons) ----------------------

export function LanguageToggle() {
  const { locale, setLocale } = useI18n();

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => setLocale("de")}
        title="Deutsch"
        aria-label="Sprache: Deutsch"
        className={`
          flex items-center gap-1.5 px-2 py-1 rounded text-xs font-semibold
          transition-all duration-150 border
          ${
            locale === "de"
              ? "border-cyan-500/50 bg-cyan-500/15 text-cyan-400"
              : "border-transparent text-slate-600 hover:text-slate-400 hover:bg-white/5"
          }
        `}
      >
        <span className="text-sm leading-none" role="img" aria-hidden="true">DE</span>
      </button>
      <button
        onClick={() => setLocale("en")}
        title="English"
        aria-label="Language: English"
        className={`
          flex items-center gap-1.5 px-2 py-1 rounded text-xs font-semibold
          transition-all duration-150 border
          ${
            locale === "en"
              ? "border-cyan-500/50 bg-cyan-500/15 text-cyan-400"
              : "border-transparent text-slate-600 hover:text-slate-400 hover:bg-white/5"
          }
        `}
      >
        <span className="text-sm leading-none" role="img" aria-hidden="true">EN</span>
      </button>
    </div>
  );
}
