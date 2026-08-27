"use client";

/**
 * Curated market browser — category tabs (US-Aktien, DAX, Indizes, Krypto,
 * Forex, Rohstoffe) with the symbols of the active category as chips.
 *
 * Lives here rather than inside a page because both /live and /charts offer
 * the same "pick a market, then a symbol" entry point. Categories come from
 * GET /api/analysis/markets; if that endpoint isn't deployed the component
 * renders nothing instead of an error, so an older backend just loses the
 * browser rather than breaking the page.
 */

import { useEffect, useState } from "react";
import { Globe, Plus } from "lucide-react";
import { api } from "@/lib/api";
import type { MarketCategory } from "@/types";
import { GlassCard, SectionLabel } from "@/components/ui/GlassCard";
import { SkeletonBlock } from "@/components/ui/Skeleton";

export function MarketBrowser({
  activeSymbol,
  watchlist,
  onSelect,
  onAddToWatchlist,
}: {
  activeSymbol: string;
  watchlist: string[];
  onSelect: (s: string) => void;
  onAddToWatchlist: (s: string) => void;
}) {
  const [markets, setMarkets] = useState<MarketCategory[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await api.analysis.markets();
        if (cancelled) return;
        setMarkets(data.markets);
        setActiveCategory(data.markets[0]?.id ?? "");
      } catch {
        // Endpoint not deployed yet — hide the browser instead of erroring.
        if (!cancelled) setMarkets([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <GlassCard padding="p-4">
        <div className="flex items-center gap-2 mb-3">
          <SectionLabel>Märkte</SectionLabel>
        </div>
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonBlock key={i} height={30} width={92} rounded="rounded-xl" />
          ))}
        </div>
      </GlassCard>
    );
  }

  if (markets.length === 0) return null;

  const category = markets.find((m) => m.id === activeCategory) ?? markets[0];

  return (
    <GlassCard padding="p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Globe className="w-3.5 h-3.5" style={{ color: "#A371F7" }} />
          <SectionLabel>Märkte</SectionLabel>
        </div>
        <span className="text-xs text-slate-600">Markt wählen → Symbol analysieren</span>
      </div>

      {/* Category tabs */}
      <div className="flex flex-wrap gap-2 mb-3">
        {markets.map((m) => {
          const active = m.id === category.id;
          return (
            <button
              key={m.id}
              onClick={() => setActiveCategory(m.id)}
              aria-current={active ? "true" : undefined}
              className="px-3 py-1.5 rounded-xl text-xs font-bold transition-all"
              style={{
                background: active ? "rgba(163,113,247,0.18)" : "rgba(255,255,255,0.04)",
                border: active ? "1px solid rgba(163,113,247,0.5)" : "1px solid rgba(255,255,255,0.08)",
                color: active ? "#B794FF" : "#94a3b8",
                boxShadow: active ? "0 0 10px rgba(163,113,247,0.15)" : "none",
              }}
            >
              {m.label}
            </button>
          );
        })}
      </div>

      {/* Symbols of the active category */}
      <div className="flex flex-wrap gap-2">
        {category.symbols.map((s) => {
          const active = s.symbol === activeSymbol;
          const inWatchlist = watchlist.includes(s.symbol);
          return (
            <div key={s.symbol} className="group relative">
              <button
                onClick={() => onSelect(s.symbol)}
                aria-current={active ? "true" : undefined}
                aria-label={`${s.name} (${s.symbol}) analysieren`}
                className={`flex items-center gap-1.5 pl-3 py-1.5 rounded-xl text-xs transition-all ${inWatchlist ? "pr-3" : "pr-7"}`}
                style={{
                  background: active ? "rgba(76,141,246,0.18)" : "rgba(255,255,255,0.04)",
                  border: active ? "1px solid rgba(76,141,246,0.5)" : "1px solid rgba(255,255,255,0.08)",
                  color: active ? "#4C8DF6" : "#94a3b8",
                }}
              >
                <span className="font-bold font-mono">{s.symbol}</span>
                <span className="text-slate-600">{s.name}</span>
              </button>
              {!inWatchlist && (
                <button
                  onClick={() => onAddToWatchlist(s.symbol)}
                  aria-label={`${s.symbol} zur Watchlist hinzufügen`}
                  title="Zur Watchlist hinzufügen"
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ color: "#3FB950" }}
                >
                  <Plus className="w-3 h-3" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </GlassCard>
  );
}
