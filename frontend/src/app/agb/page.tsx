import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "AGB — Neural Trading OS",
  robots: { index: false, follow: false },
};

export default function AgbPage() {
  return (
    <div className="max-w-2xl mx-auto py-10 px-4 space-y-6 text-sm text-slate-300">
      <div>
        <Link href="/landing" className="text-xs text-cyan-400 hover:text-cyan-300">
          ← Zurück zur Startseite
        </Link>
      </div>

      <h1 className="text-2xl font-bold text-white">Allgemeine Geschäftsbedingungen</h1>
      <p className="text-xs text-slate-500">Stand: Mai 2026 — Neural Trading OS</p>

      <section className="space-y-2">
        <h2 className="font-semibold text-slate-100">§1 Geltungsbereich</h2>
        <p>
          Diese AGB gelten für alle Leistungen von Neural Trading OS (Betreiber: Jan Weem,
          weem257@gmail.com) gegenüber Nutzern der Plattform unter{" "}
          <span className="text-cyan-400">neuraltrading.os</span> und zugehöriger Dienste.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-slate-100">§2 Leistungsbeschreibung</h2>
        <p>
          Neural Trading OS ist eine softwarebasierte Plattform zur Analyse von Finanzmärkten
          mittels KI-gestützter Signalgenerierung, Portfolio-Tracking und Backtesting. Die
          Plattform stellt Informationen und Analysewerkzeuge bereit.
        </p>
        <p className="font-medium text-amber-400">
          Die Leistungen von Neural Trading OS stellen ausdrücklich keine Anlageberatung,
          Vermögensverwaltung oder sonstige regulierte Finanzdienstleistung im Sinne des
          WpHG/KWG dar. Alle generierten Signale und Analysen dienen ausschließlich
          Informationszwecken und ersetzen keine individuelle Anlageberatung.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-slate-100">§3 Vertragsschluss und Laufzeit</h2>
        <p>
          Der Vertrag kommt durch Registrierung und Buchung eines kostenpflichtigen Plans zustande.
          Abonnements laufen monatlich oder jährlich und verlängern sich automatisch, bis sie
          gekündigt werden. Die Kündigung ist jederzeit zum Ende der aktuellen Abrechnungsperiode
          möglich.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-slate-100">§4 Preise und Zahlung</h2>
        <p>
          Alle Preise verstehen sich inkl. gesetzlicher MwSt. Die Zahlungsabwicklung erfolgt
          ausschließlich über Stripe Inc. Gespeicherte Zahlungsdaten werden nicht auf unseren
          Servern gespeichert.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-slate-100">§5 Haftungsausschluss</h2>
        <p>
          Der Anbieter haftet nicht für:
        </p>
        <ul className="list-disc pl-5 space-y-1 text-slate-400">
          <li>
            Verluste durch Handelsentscheidungen, die auf Basis der Plattform-Signale getroffen wurden
          </li>
          <li>Ausfälle oder Unterbrechungen des Dienstes</li>
          <li>Fehlerhafte Marktdaten Dritter (yfinance, Broker-APIs)</li>
          <li>
            Indirekte Schäden, entgangenen Gewinn oder Datenverlust, soweit gesetzlich zulässig
          </li>
        </ul>
        <p>
          Die Haftung ist auf den Betrag der vom Nutzer gezahlten Abonnementgebühren der letzten
          3 Monate begrenzt, soweit nicht Vorsatz oder grobe Fahrlässigkeit vorliegt.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-slate-100">§6 Pflichten des Nutzers</h2>
        <ul className="list-disc pl-5 space-y-1 text-slate-400">
          <li>Zugangsdaten geheim zu halten und nicht weiterzugeben</li>
          <li>Die Plattform nicht für illegale Zwecke zu nutzen</li>
          <li>Keine automatisierten Zugriffe ohne ausdrückliche Genehmigung</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-slate-100">§7 Änderungen der AGB</h2>
        <p>
          Der Anbieter behält sich vor, diese AGB mit angemessener Frist (mindestens 30 Tage
          per E-Mail) zu ändern. Widerspricht der Nutzer nicht innerhalb von 14 Tagen nach
          Zugang der Mitteilung, gelten die geänderten AGB als akzeptiert.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-slate-100">§8 Anwendbares Recht und Gerichtsstand</h2>
        <p>
          Es gilt deutsches Recht unter Ausschluss des UN-Kaufrechts. Gerichtsstand ist, soweit
          gesetzlich zulässig, der Sitz des Anbieters.
        </p>
      </section>

      <div className="pt-4 border-t border-slate-800 text-xs text-slate-600 flex gap-4">
        <Link href="/impressum" className="hover:text-slate-400">Impressum</Link>
        <Link href="/datenschutz" className="hover:text-slate-400">Datenschutz</Link>
      </div>
    </div>
  );
}
