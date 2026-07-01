import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Datenschutzerklärung — Neural Trading OS",
  robots: { index: false, follow: false },
};

export default function DatenschutzPage() {
  return (
    <div className="max-w-2xl mx-auto py-10 px-4 space-y-6 text-sm text-slate-300">
      <div>
        <Link href="/landing" className="text-xs text-cyan-400 hover:text-cyan-300">
          ← Zurück zur Startseite
        </Link>
      </div>

      <h1 className="text-2xl font-bold text-white">Datenschutzerklärung</h1>
      <p className="text-xs text-slate-500">Stand: Mai 2026</p>

      <section className="space-y-2">
        <h2 className="font-semibold text-slate-100">1. Verantwortlicher</h2>
        <p>
          Verantwortlicher im Sinne der DSGVO ist:<br />
          Jan Weem, E-Mail:{" "}
          <a href="mailto:weem257@gmail.com" className="text-cyan-400 hover:underline">
            weem257@gmail.com
          </a>
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-slate-100">2. Erhobene Daten</h2>
        <p>
          Wir erheben und verarbeiten folgende personenbezogene Daten:
        </p>
        <ul className="list-disc pl-5 space-y-1 text-slate-400">
          <li>E-Mail-Adresse (bei Waitlist-Anmeldung und Kontoregistrierung)</li>
          <li>Nutzungsdaten (generierte Signale, Login-Zeitpunkte)</li>
          <li>Zahlungsdaten (verarbeitet durch Stripe — nicht bei uns gespeichert)</li>
          <li>Technische Daten (IP-Adresse, Browser-Typ) zur Sicherheit und Fehleranalyse</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-slate-100">3. Zweck der Verarbeitung</h2>
        <ul className="list-disc pl-5 space-y-1 text-slate-400">
          <li>Bereitstellung des Dienstes (Vertragsdurchführung, Art. 6 Abs. 1 lit. b DSGVO)</li>
          <li>Sicherheit und Missbrauchsverhütung (berechtigtes Interesse, Art. 6 Abs. 1 lit. f DSGVO)</li>
          <li>E-Mail-Benachrichtigungen (nur bei ausdrücklicher Einwilligung, Art. 6 Abs. 1 lit. a DSGVO)</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-slate-100">4. Weitergabe an Dritte</h2>
        <p>
          Daten werden nicht an Dritte verkauft. Folgende Dienstleister erhalten Zugang zu Daten
          im Rahmen der Vertragserfüllung:
        </p>
        <ul className="list-disc pl-5 space-y-1 text-slate-400">
          <li>
            <strong className="text-slate-300">Stripe Inc.</strong> — Zahlungsabwicklung (USA, SCCs gemäß DSGVO Art. 46)
          </li>
          <li>
            <strong className="text-slate-300">Railway Inc.</strong> — Hosting (EU-Region, sofern verfügbar)
          </li>
          <li>
            <strong className="text-slate-300">Anthropic PBC</strong> — KI-Verarbeitung von Ticker-Anfragen (keine personenbezogenen Daten übermittelt)
          </li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-slate-100">5. Speicherdauer</h2>
        <p>
          Personenbezogene Daten werden gelöscht, sobald sie für den Verarbeitungszweck nicht mehr
          erforderlich sind, spätestens jedoch nach Beendigung des Vertragsverhältnisses und
          Ablauf gesetzlicher Aufbewahrungsfristen (max. 10 Jahre für Rechnungsdaten nach HGB/AO).
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-slate-100">6. Ihre Rechte</h2>
        <p>Sie haben das Recht auf:</p>
        <ul className="list-disc pl-5 space-y-1 text-slate-400">
          <li>Auskunft über gespeicherte Daten (Art. 15 DSGVO)</li>
          <li>Berichtigung unrichtiger Daten (Art. 16 DSGVO)</li>
          <li>Löschung (&bdquo;Recht auf Vergessenwerden&ldquo;, Art. 17 DSGVO)</li>
          <li>Einschränkung der Verarbeitung (Art. 18 DSGVO)</li>
          <li>Datenübertragbarkeit (Art. 20 DSGVO)</li>
          <li>Widerspruch gegen die Verarbeitung (Art. 21 DSGVO)</li>
          <li>Beschwerde bei der zuständigen Datenschutzbehörde</li>
        </ul>
        <p>
          Anfragen richten Sie bitte an:{" "}
          <a href="mailto:weem257@gmail.com" className="text-cyan-400 hover:underline">
            weem257@gmail.com
          </a>
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-slate-100">7. Cookies</h2>
        <p>
          Diese Anwendung setzt technisch notwendige Cookies für die Authentifizierung sowie
          Cookies von Stripe zur sicheren Zahlungsabwicklung. Durch die weitere Nutzung der
          Website erklären Sie sich mit der Verwendung dieser Cookies einverstanden.
        </p>
      </section>

      <div className="pt-4 border-t border-slate-800 text-xs text-slate-600 flex gap-4">
        <Link href="/impressum" className="hover:text-slate-400">Impressum</Link>
        <Link href="/agb" className="hover:text-slate-400">AGB</Link>
      </div>
    </div>
  );
}
