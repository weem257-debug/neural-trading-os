"use client";

/**
 * Charts — the dedicated chart surface.
 *
 * Until now a chart only existed as a collapsible section inside /live and as
 * a panel on /signals, so there was no navigable "show me the chart" entry
 * point at all. This page makes the chart the primary object: full-height,
 * always open, with the symbol picker underneath it.
 *
 * The symbol list is the SERVER-side watchlist (GET/PUT /api/analysis/watchlist),
 * the same one /live edits — adding a symbol here shows up there and vice
 * versa. If the backend is unreachable we fall back to a local default set and
 * mark it "LOKAL" so the user knows nothing is being persisted.
 */

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { CandlestickChart as CandlestickIcon, Globe } from "lucide-react";
import { api } from "@/lib/api";
import { GlassCard } from "@/components/ui/GlassCard";
import { SkeletonBlock } from "@/components/ui/Skeleton";
import { TradingViewWidget } from "@/components/trading/TradingViewWidget";
import { MarketBrowser } from "@/components/trading/MarketBrowser";
import { StockBoard } from "@/components/trading/StockBoard";
import { HkcmPanel } from "@/components/trading/HkcmPanel";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { useTradingStore } from "@/store/tradingStore";
import { notify } from "@/store/notificationStore";

const DEFAULT_WATCHLIST = ["AAPL", "MSFT", "NVDA", "TSLA", "BTC-USD"];
const MAX_SYMBOLS = 30;


/**
 * Hero band — the newsletter's opening panel, rebuilt: a deep navy field, the
 * greeting line in small letterspaced caps, and the thing the page is actually
 * about set large and bold underneath. Here that is the symbol on the chart
 * plus its live price, so the band doubles as the quote header.
 */
function ChartHero({ symbol, loading }: { symbol: string; loading: boolean }) {
  const [quote, setQuote] = useState<{ price: number | null; change: number | null }>({
    price: null,
    change: null,
  });
  // WS ticks win over the REST snapshot for symbols the socket is covering.
  const tick = useTradingStore((s) => (symbol ? s.prices[symbol] : undefined));

  useEffect(() => {
    if (!symbol) {
      setQuote({ price: null, change: null });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const data = await api.portfolio.prices([symbol]);
        const row = data[symbol];
        if (!cancelled && row) setQuote({ price: row.price, change: row.change_pct });
      } catch {
        if (!cancelled) setQuote({ price: null, change: null });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [symbol]);

  const price = tick?.price ?? quote.price;
  const change = tick?.change_pct ?? quote.change;
  const positive = (change ?? 0) >= 0;
  const changeColor =
    change === null || change === undefined
      ? "var(--text-dim)"
      : positive
        ? "var(--positive)"
        : "var(--negative)";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="rounded-xl px-6 py-7 text-center"
      style={{
        // Deep navy field, like the newsletter's header panel.
        background: "linear-gradient(160deg, #12233D 0%, #0E1A2E 100%)",
        border: "1px solid rgba(76,141,246,0.25)",
      }}
    >
      <p
        className="text-xs font-semibold uppercase tracking-[0.2em]"
        style={{ color: "rgba(230,237,243,0.55)" }}
      >
        Aktuelle Analyse
      </p>

      <h1 className="text-3xl font-bold font-mono mt-2" style={{ color: "#FFFFFF" }}>
        {symbol || (loading ? "…" : "Kein Symbol")}
      </h1>

      {symbol && (
        <div className="flex items-baseline justify-center gap-3 mt-2 flex-wrap">
          <span className="text-2xl font-bold font-mono" style={{ color: "#FFFFFF" }}>
            {price === null || price === undefined
              ? "—"
              : `$${price.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          </span>
          <span className="text-base font-bold font-mono" style={{ color: changeColor }}>
            {change === null || change === undefined
              ? "—"
              : `${positive ? "+" : ""}${change.toFixed(2)}%`}
          </span>
        </div>
      )}
    </motion.div>
  );
}

function ChartsView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlSymbol = searchParams.get("symbol");

  const [symbols, setSymbols] = useState<string[]>([]);
  const [activeSymbol, setActiveSymbol] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [isFallback, setIsFallback] = useState(false);

  // Load the server watchlist once. `?symbol=` wins over the first watchlist
  // entry so a deep link from the dashboard or a signal opens that chart.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let list = DEFAULT_WATCHLIST;
      let fallback = false;
      try {
        const data = await api.analysis.watchlistGet();
        if (data.symbols.length > 0) list = data.symbols;
      } catch {
        fallback = true;
      }
      if (cancelled) return;
      setSymbols(list);
      setIsFallback(fallback);
      setActiveSymbol((cur) => cur || urlSymbol || list[0] || "");
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // urlSymbol is read once for the initial selection; later changes are
    // handled by the effect below so this must not re-run the whole load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Follow later ?symbol= changes (back/forward, or a link from another page).
  useEffect(() => {
    if (urlSymbol) setActiveSymbol(urlSymbol);
  }, [urlSymbol]);

  const persist = useCallback(async (next: string[]) => {
    try {
      await api.analysis.watchlistSet(next);
      setIsFallback(false);
    } catch (e) {
      setIsFallback(true);
      notify.error("Watchlist konnte nicht gespeichert werden", e instanceof Error ? e.message : undefined);
    }
  }, []);

  const handleSelect = useCallback(
    (symbol: string) => {
      setActiveSymbol(symbol);
      // Keep the URL in sync so the chart is shareable and the back button
      // walks through the symbols the user looked at.
      router.replace(`/charts?symbol=${encodeURIComponent(symbol)}`, { scroll: false });
    },
    [router]
  );

  const handleAdd = useCallback(
    (symbol: string) => {
      setSymbols((prev) => {
        if (prev.includes(symbol) || prev.length >= MAX_SYMBOLS) return prev;
        const next = [...prev, symbol];
        persist(next);
        return next;
      });
      setActiveSymbol((cur) => cur || symbol);
    },
    [persist]
  );

  const handleRemove = useCallback(
    (symbol: string) => {
      setSymbols((prev) => {
        const next = prev.filter((s) => s !== symbol);
        persist(next);
        setActiveSymbol((cur) => (cur === symbol ? next[0] ?? "" : cur));
        return next;
      });
    },
    [persist]
  );

  return (
    <div className="space-y-5">
      <ChartHero symbol={activeSymbol} loading={loading} />

      {isFallback && (
        <p
          className="text-xs text-center"
          style={{ color: "var(--warning)" }}
          role="status"
        >
          Watchlist konnte nicht vom Server geladen werden — Änderungen bleiben nur lokal.
        </p>
      )}

      {/* Chart — the point of the page, so it gets the viewport */}
      <GlassCard variant="cyan" padding="p-3">
        {activeSymbol ? (
          <TradingViewWidget symbol={activeSymbol} height="62vh" minHeight={420} />
        ) : (
          <div className="flex items-center justify-center" style={{ height: "62vh", minHeight: 420 }}>
            <p className="text-sm text-slate-500">
              {loading ? "Watchlist wird geladen …" : "Kein Symbol gewählt. Füge unten eines hinzu."}
            </p>
          </div>
        )}
      </GlassCard>

      {/* Symbols of the watchlist — cards or table, user's choice */}
      {loading ? (
        <SkeletonBlock height={220} rounded="rounded-xl" />
      ) : (
        <StockBoard
          title="Meine Werte"
          symbols={symbols}
          activeSymbol={activeSymbol}
          onSelect={handleSelect}
          onAdd={handleAdd}
          onRemove={handleRemove}
          maxSymbols={MAX_SYMBOLS}
        />
      )}

      {/* What HKCM says about the symbol currently on the chart */}
      <div>
        <SectionHeader
          title="Fremdanalyse"
          icon={<CandlestickIcon className="w-3.5 h-3.5" />}
          tone="var(--violet)"
          meta="HKCM"
        />
        <HkcmPanel symbol={activeSymbol} />
      </div>

      {/* Curated markets — add anything that isn't on the watchlist yet */}
      <div>
        <SectionHeader
          title="Märkte"
          icon={<Globe className="w-3.5 h-3.5" />}
          meta="Markt wählen → Symbol in den Chart"
        />
      <MarketBrowser
        activeSymbol={activeSymbol}
        watchlist={symbols}
        onSelect={handleSelect}
        onAddToWatchlist={handleAdd}
      />
      </div>
    </div>
  );
}

/**
 * `useSearchParams` forces the closest Suspense boundary to render on the
 * client; without one, `next build` fails the whole route with
 * "useSearchParams() should be wrapped in a suspense boundary".
 */
export default function ChartsPage() {
  return (
    <Suspense fallback={<SkeletonBlock height={520} rounded="rounded-xl" />}>
      <ChartsView />
    </Suspense>
  );
}
