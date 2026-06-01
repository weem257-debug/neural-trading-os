import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Impressum — Neural Trading OS",
  robots: { index: false, follow: false },
};

export default function ImpressumPage() {
  return (
    <div className="max-w-2xl mx-auto py-10 px-4 space-y-6 text-sm text-slate-300">
      <div>
        <Link href="/landing" className="text-xs text-cyan-400 hover:text-cyan-300">
          ← Zurück zur Startseite
        </Link>
      </div>

      <h1 className="text-2xl font-bold text-white">Impressum</h1>
      <p className="text-xs text-slate-500">Angaben gemäß § 5 TMG</p>

      <section className="space-y-1">
        <h2 className="font-semibold text-slate-100">Verantwortlicher</h2>
        <p>Jan Weem</p>
        <p>E-Mail: <a href="mailto:weem257@gmail.com" className="text-cyan-400 hover:underline">weem257@gmail.com</a></p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-slate-100">Haftungsausschluss</h2>
        <p>
          Die Inhalte dieser Website wurden mit größtmöglicher Sorgfalt erstellt. Für die
          Richtigkeit, Vollständigkeit und Aktualität der Inhalte kann keine Gewähr übernommen werden.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-slate-100">Haftung für Links</h2>
        <p>
          Diese Website enthält Links zu externen Webseiten Dritter, auf deren Inhalte kein Einfluss
          besteht. Für die Inhalte der verlinkten Seiten ist stets der jeweilige Anbieter oder
          Betreiber verantwortlich.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-slate-100">Urheberrecht</h2>
        <p>
          Die durch den Seitenbetreiber erstellten Inhalte und Werke auf dieser Website unterliegen
          dem deutschen Urheberrecht. Die Vervielfältigung, Bearbeitung, Verbreitung und jede Art der
          Verwertung außerhalb der Grenzen des Urheberrechts bedürfen der schriftlichen Zustimmung
          des jeweiligen Autors bzw. Erstellers.
        </p>
      </section>

      <div className="pt-4 border-t border-slate-800 text-xs text-slate-600 flex gap-4">
        <Link href="/datenschutz" className="hover:text-slate-400">Datenschutz</Link>
        <Link href="/agb" className="hover:text-slate-400">AGB</Link>
      </div>
    </div>
  );
}
