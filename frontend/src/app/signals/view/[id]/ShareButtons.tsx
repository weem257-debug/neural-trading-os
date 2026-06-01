"use client";

import { useState } from "react";
import { Copy, CheckCircle, Share2 } from "lucide-react";

export function ShareButtons({
  ticker,
  dirLabel,
  confPct,
}: {
  ticker: string;
  dirLabel: string;
  confPct: number;
}) {
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    const url = window.location.href;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        // Fallback for in-app browsers / non-secure contexts where the
        // Clipboard API is unavailable or blocked.
        const ta = document.createElement("textarea");
        ta.value = url;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked — leave button state unchanged */
    }
  }

  function shareX() {
    const text = `KI-Signal: ${ticker} ${dirLabel} (${confPct}% Konfidenz) — Neural Trading OS\n${window.location.href}`;
    window.open(`https://x.com/intent/tweet?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="flex gap-2 mb-5">
      <button
        onClick={copyLink}
        className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors"
        style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: copied ? "#00FF88" : "#94a3b8" }}
      >
        {copied ? <CheckCircle className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
        {copied ? "Kopiert!" : "Link kopieren"}
      </button>
      <button
        onClick={shareX}
        className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors"
        style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "#94a3b8" }}
      >
        <Share2 className="w-3.5 h-3.5" />
        Auf X teilen
      </button>
    </div>
  );
}
