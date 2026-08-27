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
import { CandlestickChart as CandlestickIcon } from "lucide-react";
import { api } from "@/lib/api";
import { GlassCard, NeonBadge } from "@/components/ui/GlassCard";
import { SkeletonBlock } from "@/components/ui/Skeleton";
import { TradingViewWidget } from "@/components/trading/TradingViewWidget";
import { MarketBrowser } from "@/components/trading/MarketBrowser";
import { StockBoard } from "@/components/trading/StockBoard";
import { notify } from "@/store/notificationStore";

const DEFAULT_WATCHLIST = ["AAPL", "MSFT", "NVDA", "TSLA", "BTC-USD"];
const MAX_SYMBOLS = 30;

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
      {/* Header */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <div className="flex items-center gap-3 mb-1 flex-wrap">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: "rgba(76,141,246,0.15)", border: "1px solid rgba(76,141,246,0.3)" }}
          >
            <CandlestickIcon className="w-4 h-4" style={{ color: "#4C8DF6" }} />
          </div>
          <h1 className="text-2xl font-bold text-slate-100">Charts</h1>
          {activeSymbol && <NeonBadge color="cyan">{activeSymbol}</NeonBadge>}
          {isFallback && (
            <span
              className="text-xs font-bold px-2.5 py-1 rounded-full"
              style={{ background: "rgba(100,116,139,0.12)", border: "1px solid rgba(100,116,139,0.3)", color: "#64748B" }}
              title="Die Watchlist konnte nicht vom Server geladen oder gespeichert werden."
            >
              LOKAL
            </span>
          )}
        </div>
        <p className="text-sm text-slate-500">
          Kurschart mit Zeichenwerkzeugen und Indikatoren. Symbol unten wählen — der Chart springt sofort um.
        </p>
      </motion.div>

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

      {/* Curated markets — add anything that isn't on the watchlist yet */}
      <MarketBrowser
        activeSymbol={activeSymbol}
        watchlist={symbols}
        onSelect={handleSelect}
        onAddToWatchlist={handleAdd}
      />
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
