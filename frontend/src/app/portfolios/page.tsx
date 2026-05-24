"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Briefcase,
  Plus,
  Pencil,
  Trash2,
  Star,
  Building2,
  User,
  TrendingUp,
  Bitcoin,
  Landmark,
  Loader2,
  CheckCircle,
  AlertTriangle,
} from "lucide-react";
import { API_BASE } from "@/lib/api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Portfolio {
  id: number;
  name: string;
  portfolio_type: "stocks" | "crypto" | "p2p" | "mixed";
  category: "private" | "business";
  currency: string;
  color: string;
  is_default: boolean;
  description?: string;
  created_at: string;
}

interface CreatePayload {
  name: string;
  portfolio_type: string;
  category: string;
  currency: string;
  color: string;
  description?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TYPE_ICONS: Record<string, React.ElementType> = {
  stocks: TrendingUp,
  crypto: Bitcoin,
  p2p: Landmark,
  mixed: Briefcase,
};

const TYPE_LABELS: Record<string, string> = {
  stocks: "Aktien",
  crypto: "Krypto",
  p2p: "P2P Kredite",
  mixed: "Gemischt",
};

const COLOR_PRESETS = [
  "#00D4FF", "#7B2FFF", "#00FF88", "#FF6B6B",
  "#FFD700", "#FF8C00", "#00CED1", "#FF69B4",
];

function authHeader(): HeadersInit {
  const token = localStorage.getItem("auth_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function apiFetch(path: string, init?: RequestInit) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...authHeader(), ...init?.headers },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// PortfolioCard
// ---------------------------------------------------------------------------

function PortfolioCard({
  portfolio,
  onSetDefault,
  onDelete,
  onEdit,
}: {
  portfolio: Portfolio;
  onSetDefault: (id: number) => void;
  onDelete: (id: number) => void;
  onEdit: (p: Portfolio) => void;
}) {
  const Icon = TYPE_ICONS[portfolio.portfolio_type] ?? Briefcase;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="relative rounded-xl border p-5 group"
      style={{
        borderColor: portfolio.is_default ? portfolio.color + "60" : "rgba(30,41,59,1)",
        background: portfolio.is_default
          ? `linear-gradient(135deg, ${portfolio.color}08, transparent)`
          : "rgba(15,23,42,0.8)",
        boxShadow: portfolio.is_default ? `0 0 20px ${portfolio.color}20` : "none",
      }}
    >
      {/* Default badge */}
      {portfolio.is_default && (
        <span
          className="absolute top-3 right-3 text-xs px-2 py-0.5 rounded-full font-semibold"
          style={{ background: portfolio.color + "30", color: portfolio.color }}
        >
          Standard
        </span>
      )}

      {/* Icon + name */}
      <div className="flex items-center gap-3 mb-3">
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: portfolio.color + "20", border: `1px solid ${portfolio.color}40` }}
        >
          <Icon className="w-5 h-5" style={{ color: portfolio.color }} />
        </div>
        <div>
          <p className="font-semibold text-white text-sm">{portfolio.name}</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            {portfolio.category === "business" ? (
              <Building2 className="w-3 h-3 text-slate-500" />
            ) : (
              <User className="w-3 h-3 text-slate-500" />
            )}
            <span className="text-xs text-slate-500">
              {portfolio.category === "business" ? "Geschäftlich" : "Privat"} ·{" "}
              {TYPE_LABELS[portfolio.portfolio_type]}
            </span>
          </div>
        </div>
      </div>

      {portfolio.description && (
        <p className="text-xs text-slate-500 mb-3 line-clamp-2">{portfolio.description}</p>
      )}

      <div className="flex items-center gap-1 text-xs text-slate-600 mb-4">
        <span>{portfolio.currency}</span>
        <span>·</span>
        <span>{new Date(portfolio.created_at).toLocaleDateString("de-DE")}</span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        {!portfolio.is_default && (
          <button
            onClick={() => onSetDefault(portfolio.id)}
            className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border border-slate-700 text-slate-400 hover:text-yellow-400 hover:border-yellow-500/40 transition-colors"
          >
            <Star className="w-3 h-3" /> Standard
          </button>
        )}
        <button
          onClick={() => onEdit(portfolio)}
          className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border border-slate-700 text-slate-400 hover:text-cyan-400 hover:border-cyan-500/40 transition-colors"
        >
          <Pencil className="w-3 h-3" /> Bearbeiten
        </button>
        {!portfolio.is_default && (
          <button
            onClick={() => onDelete(portfolio.id)}
            className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border border-slate-700 text-slate-400 hover:text-red-400 hover:border-red-500/40 transition-colors ml-auto"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        )}
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// CreateEditModal
// ---------------------------------------------------------------------------

function PortfolioModal({
  initial,
  onSave,
  onClose,
}: {
  initial?: Portfolio;
  onSave: (payload: CreatePayload) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [type, setType] = useState(initial?.portfolio_type ?? "mixed");
  const [category, setCategory] = useState(initial?.category ?? "private");
  const [currency, setCurrency] = useState(initial?.currency ?? "EUR");
  const [color, setColor] = useState(initial?.color ?? "#00D4FF");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    setError("");
    try {
      await onSave({ name: name.trim(), portfolio_type: type, category, currency, color, description: description || undefined });
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Fehler beim Speichern");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md mx-4 rounded-2xl border border-slate-700 p-6"
        style={{ background: "#0a0f1e" }}
      >
        <h2 className="text-lg font-bold text-white mb-5">
          {initial ? "Portfolio bearbeiten" : "Neues Portfolio"}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="z.B. Privat-Depot, GmbH-Aktien..."
              className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500/50"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Typ</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
              >
                <option value="mixed">Gemischt</option>
                <option value="stocks">Aktien</option>
                <option value="crypto">Krypto</option>
                <option value="p2p">P2P Kredite</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Kategorie</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
              >
                <option value="private">Privat</option>
                <option value="business">Geschäftlich</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">Währung</label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
            >
              <option value="EUR">EUR</option>
              <option value="USD">USD</option>
              <option value="GBP">GBP</option>
              <option value="CHF">CHF</option>
            </select>
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-2">Farbe</label>
            <div className="flex items-center gap-2 flex-wrap">
              {COLOR_PRESETS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className="w-7 h-7 rounded-full border-2 transition-transform hover:scale-110"
                  style={{
                    background: c,
                    borderColor: color === c ? "#fff" : "transparent",
                  }}
                />
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">Beschreibung (optional)</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Kurze Notiz zum Portfolio..."
              className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500/50"
            />
          </div>

          {error && (
            <p className="text-xs text-red-400 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> {error}
            </p>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 rounded-lg border border-slate-700 text-sm text-slate-400 hover:text-white transition-colors"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="flex-1 py-2 rounded-lg text-sm font-semibold text-black transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
              style={{ background: color }}
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {initial ? "Speichern" : "Erstellen"}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function PortfoliosPage() {
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<Portfolio | undefined>();
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  };

  const load = useCallback(async () => {
    try {
      const data = await apiFetch("/api/portfolios/");
      setPortfolios(data);
    } catch {
      // Auth error handled globally
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async (payload: CreatePayload) => {
    await apiFetch("/api/portfolios/", { method: "POST", body: JSON.stringify(payload) });
    showToast("Portfolio erstellt");
    await load();
  };

  const handleEdit = async (payload: CreatePayload) => {
    if (!editTarget) return;
    await apiFetch(`/api/portfolios/${editTarget.id}`, { method: "PATCH", body: JSON.stringify(payload) });
    showToast("Portfolio aktualisiert");
    await load();
  };

  const handleSetDefault = async (id: number) => {
    await apiFetch(`/api/portfolios/${id}/default`, { method: "POST" });
    showToast("Standard-Portfolio gesetzt");
    await load();
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Portfolio wirklich löschen?")) return;
    await apiFetch(`/api/portfolios/${id}`, { method: "DELETE" });
    showToast("Portfolio gelöscht");
    await load();
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <Briefcase className="w-6 h-6 text-cyan-400" />
            Portfolios
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Trenne Privat und Geschäftlich — verwalte mehrere Depots in einem Dashboard
          </p>
        </div>
        <button
          onClick={() => { setEditTarget(undefined); setShowModal(true); }}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-black transition-all hover:scale-105"
          style={{ background: "linear-gradient(135deg, #00D4FF, #7B2FFF)" }}
        >
          <Plus className="w-4 h-4" /> Neues Portfolio
        </button>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
        </div>
      ) : portfolios.length === 0 ? (
        <div className="text-center py-20 text-slate-500">
          <Briefcase className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Noch kein Portfolio. Erstelle dein erstes!</p>
        </div>
      ) : (
        <motion.div layout className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <AnimatePresence>
            {portfolios.map((p) => (
              <PortfolioCard
                key={p.id}
                portfolio={p}
                onSetDefault={handleSetDefault}
                onDelete={handleDelete}
                onEdit={(p) => { setEditTarget(p); setShowModal(true); }}
              />
            ))}
          </AnimatePresence>
        </motion.div>
      )}

      {/* Modal */}
      {showModal && (
        <PortfolioModal
          initial={editTarget}
          onSave={editTarget ? handleEdit : handleCreate}
          onClose={() => setShowModal(false)}
        />
      )}

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-6 right-6 flex items-center gap-2 px-4 py-3 rounded-xl border text-sm font-medium shadow-xl"
            style={{
              background: toast.ok ? "rgba(0,255,136,0.1)" : "rgba(239,68,68,0.1)",
              borderColor: toast.ok ? "rgba(0,255,136,0.3)" : "rgba(239,68,68,0.3)",
              color: toast.ok ? "#00FF88" : "#ef4444",
            }}
          >
            <CheckCircle className="w-4 h-4" />
            {toast.msg}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
