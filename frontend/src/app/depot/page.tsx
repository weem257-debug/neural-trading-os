"use client";

import { motion } from "framer-motion";
import { Wallet, Briefcase, Landmark, Building2, PiggyBank } from "lucide-react";
import { Collapsible } from "@/components/ui/Collapsible";
import { PortfoliosSection } from "@/components/depot/PortfoliosSection";
import { P2PSection } from "@/components/depot/P2PSection";
import { BrokersSection } from "@/components/depot/BrokersSection";
import { NetWorthSection } from "@/components/depot/NetWorthSection";

// ---------------------------------------------------------------------------
// /depot — collects the former standalone /portfolios, /p2p, /brokers and
// /networth pages into one page with collapsible sections. Each section's
// business logic, hooks and API calls are unchanged — only extracted into
// components/depot/*Section.tsx and composed here.
// ---------------------------------------------------------------------------
export default function DepotPage() {
  return (
    <div className="space-y-5">
      {/* Header */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <div className="flex items-center gap-3 mb-1">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: "rgba(0,212,255,0.15)", border: "1px solid rgba(0,212,255,0.3)" }}
          >
            <Wallet className="w-4 h-4" style={{ color: "#00D4FF" }} />
          </div>
          <h1 className="text-2xl font-bold text-slate-100">Depot</h1>
        </div>
        <p className="text-sm text-slate-500">
          Portfolios, P2P-Kredite, Broker-Depots und Nettovermögen — alles an einem Ort, aufklappbar.
        </p>
      </motion.div>

      <Collapsible
        title="Meine Depots"
        subtitle="Privat- und Geschäftsdepots verwalten"
        icon={<Briefcase className="w-3.5 h-3.5" style={{ color: "#00D4FF" }} />}
        defaultOpen
      >
        <PortfoliosSection />
      </Collapsible>

      <Collapsible
        title="P2P Kredite"
        subtitle="Mintos · Bondora · PeerBerry"
        icon={<Landmark className="w-3.5 h-3.5" style={{ color: "#00D4FF" }} />}
      >
        <P2PSection />
      </Collapsible>

      <Collapsible
        title="Broker"
        subtitle="Alle Broker-Depots in der Übersicht"
        icon={<Building2 className="w-3.5 h-3.5" style={{ color: "#00D4FF" }} />}
      >
        <BrokersSection />
      </Collapsible>

      <Collapsible
        title="Net-Worth"
        subtitle="Konsolidiertes Gesamtvermögen"
        icon={<PiggyBank className="w-3.5 h-3.5" style={{ color: "#00D4FF" }} />}
      >
        <NetWorthSection />
      </Collapsible>
    </div>
  );
}
