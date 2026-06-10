# Compliance-Einschätzung: BaFin & DSGVO — Neural Trading OS

**Status:** Erste schriftliche Einschätzung (Arbeitsdokument)
**Datum:** 2026-06-10
**Perspektiven:** Legal/Privacy Counsel + Financial-Compliance-Officer
**Adressat:** Geschäftsführung (intern)

> **Disclaimer:** Dieses Dokument ist eine interne, fachliche Ersteinschätzung und
> **keine Rechtsberatung**. Vor einem Live-/Geld-Feature, einem öffentlichen Launch
> in DE/EU oder einer Finanzierungsrunde ist eine verbindliche Prüfung durch eine
> auf Kapitalmarktrecht spezialisierte Kanzlei sowie ggf. eine Voranfrage bei der
> BaFin zwingend einzuholen. Aussagen beziehen sich auf den Rechtsstand DE/EU 2026.

---

## 0. Management Summary (TL;DR)

- **Das größte regulatorische Risiko ist die Anlageberatung / Anlagevermittlung.**
  Sobald die App **konkrete, personalisierte Kauf-/Verkaufs-Signale** zu bestimmten
  Finanzinstrumenten ausgibt, besteht ein **erhebliches Risiko**, dass dies als
  **Anlageberatung (§ 2 Abs. 8 Nr. 10 WpHG / § 1 Abs. 1a KWG)** oder
  **Anlagevermittlung** eingestuft wird — beides **erlaubnispflichtig** nach KWG/WpIG.
- **Solange ausschließlich Paper-Trading** und **generische, nicht personalisierte**
  Information/Analyse angeboten wird, ist das Risiko **deutlich geringer**, aber nicht
  null (Abgrenzung „Anlageempfehlung" nach MAR Art. 20 / Finanzanalyse).
- **Live-Order-Routing an Broker** (nautilus, Trade Republic, comdirect, DEGIRO …)
  verschärft das Bild Richtung **Anlagevermittlung / Finanzportfolioverwaltung**
  (§ 1 Abs. 1a S. 2 Nr. 3 KWG) — **klar erlaubnispflichtig**, wenn automatisiert
  im Kundeninteresse Entscheidungen getroffen/ausgeführt werden.
- **DSGVO:** Es werden personenbezogene **und** Finanzdaten (Depots, Saldenstände,
  Bankzugänge via FinTS) verarbeitet — **hohes Schutzniveau**, **DSFA (Art. 35)
  sehr wahrscheinlich erforderlich**, AVV mit allen Auftragsverarbeitern (Railway,
  Anthropic, Stripe, SMTP) notwendig, Drittlandtransfer (USA) ist sauber zu regeln.
- **Sofortmaßnahmen** (siehe §6): Disclaimer/„keine Anlageberatung", Live-Trading
  hart gated lassen, Datenschutzerklärung + AVV-Inventar, DSFA starten, Demo-/Klartext-
  Credentials aus README entfernen.

**Ampel:**
| Bereich | Bewertung |
|---|---|
| Paper-Trading + generische Analyse | 🟡 mittel — mit Disclaimer beherrschbar |
| Personalisierte Kauf/Verkauf-Signale | 🔴 hoch — Erlaubnispflicht ernsthaft prüfen |
| Live-Order-Routing / Auto-Execution | 🔴 hoch — sehr wahrscheinlich erlaubnispflichtig |
| DSGVO (Daten + Drittland + DSFA) | 🟠 erhöht — strukturiert abarbeitbar |

---

## 1. Was die Plattform (regulatorisch relevant) tut

Aus dem Code/Funktionsumfang abgeleitet:

1. **KI-Signale**: Claude analysiert Marktdaten + Sentiment und gibt **strukturierte
   BUY/SELL/HOLD-Empfehlungen** inkl. Confidence, Kursziel, Stop-Loss aus.
2. **Paper-Trading**: simulierte Ausführung mit virtuellem Kapital (kein echtes Geld).
3. **Live-Trading**: per `ENABLE_LIVE_TRADING` gated; Anbindung an reale Broker
   (nautilus-Adapter, comdirect, DEGIRO, Trade Republic, Bitpanda, WH/cTrader …).
4. **Portfolio-/Bank-Aggregation**: FinTS/HBCI-Zugriff auf Bankkonten, P2P-Plattformen
   (Mintos, Bondora, PeerBerry), Depot-Aggregation.
5. **Self-Learning**: RAG über Trade-Ergebnisse + YouTube-Insights, fließt in Signale ein.
6. **Abo-Monetarisierung** über Stripe (Basic/Pro/Institutional + Signal-Marketplace).

Die Kombination **„personalisiertes Signal → optionale automatische Ausführung →
Abo-Geschäftsmodell"** ist genau die Konstellation, die die BaFin aufmerksam prüft.

---

## 2. BaFin / Aufsichtsrecht

### 2.1 Anlageberatung vs. Anlagevermittlung vs. bloße Information

| Tätigkeit | Definition (vereinfacht) | Erlaubnis? |
|---|---|---|
| **Anlageberatung** | **persönliche Empfehlung** zu konkreten Finanzinstrumenten, die auf die Verhältnisse des Anlegers zugeschnitten ist oder als für ihn geeignet dargestellt wird | **Ja** (§ 32 KWG / WpIG) |
| **Anlagevermittlung** | Vermittlung von Geschäften über die Anschaffung/Veräußerung von Finanzinstrumenten | **Ja** |
| **Finanzportfolioverwaltung** | Verwaltung einzelner Vermögen mit Entscheidungsspielraum (auch automatisiert / „Robo-Advisor") | **Ja** |
| **Reine Information / generische Analyse** | allgemeine Marktinformation **ohne** persönlichen Zuschnitt | i.d.R. **nein** |

**Kernabgrenzung:** Sobald ein Signal als **„für dich geeignet"** erscheint (Confidence,
Kursziel, Stop-Loss, ggf. abhängig von Portfolio/Risikoprofil des Nutzers), kippt es
schnell von „Information" zu **„persönlicher Empfehlung"** → **Anlageberatung**.

> **Bewertung:** Die aktuellen Signale (BUY/SELL + Kursziel + Stop-Loss, teils
> RAG-personalisiert) sind **grenzwertig bis erlaubnispflichtig**. Je generischer,
> disclaimter und „nicht auf den einzelnen Nutzer zugeschnitten", desto sicherer.

### 2.2 Automatisierte Ausführung / Robo-Advisor

Wenn die App im Live-Modus **Orders automatisch** (oder per One-Click direkt aus dem
Signal) **an Broker routet**, nähert sich das der **Finanzportfolioverwaltung** bzw.
**Anlagevermittlung** an — **erlaubnispflichtig**. Reines „der Nutzer klickt selbst bei
seinem eigenen Broker" ist günstiger, aber die Architektur (Broker-Keys serverseitig,
Auto-Execution-Loops) deutet auf mehr als reine Tool-Bereitstellung hin.

### 2.3 Marktmissbrauch / Anlageempfehlungen (MAR)

Werden Signale **öffentlich/an viele Abonnenten** verbreitet, greift potenziell die
**Marktmissbrauchsverordnung (MAR Art. 20)** + Delegierte VO (EU) 2016/958:
Pflicht zu **Offenlegung von Identität, Methodik, Interessenkonflikten** und
sachgerechter Darstellung („Anlageempfehlung"). Das ist auch **ohne** KWG-Erlaubnis
relevant, sobald man strukturierte Empfehlungen skaliert ausspielt.

### 2.4 Krypto / P2P

- **Krypto-Dienstleistungen** unterliegen inzwischen **MiCAR** (EU) bzw. dem
  Kryptoverwahr-/Krypto-Wertpapier-Regime. Anbindung von Bitpanda/Binance etc. zur
  bloßen Datenanzeige ist unkritisch; **Verwahrung/Vermittlung** wäre erlaubnispflichtig.
- **P2P-Aggregation** (Mintos & Co.): reine **Read-Only-Aggregation** der Bestände
  ist regulatorisch mild; Vermittlung in P2P-Kredite wäre ein eigenes Thema.

### 2.5 Zahlungsdiensteaspekt (FinTS-Bankzugriff)

Der **FinTS/HBCI-Zugriff auf Bankkonten** (Kontoinformationen) berührt das Feld der
**Kontoinformationsdienste (AISP) nach PSD2 / ZAG**. Wer **regelmäßig im Kundenauftrag
Kontoinformationen abruft**, kann **AISP-erlaubnispflichtig** sein. Hier ist genau zu
prüfen, ob ein Ausnahmetatbestand greift oder ein **lizenzierter Drittanbieter**
(z. B. ein BaFin-registrierter AISP/Open-Banking-Provider) zwischenzuschalten ist.
**Eigenes Speichern von PIN/Zugangsdaten ist besonders heikel** (siehe DSGVO + Security).

> Positiv im Code bereits umgesetzt: `FLATEX_FINTS_PIN` wird **nicht** in der DB
> gespeichert (Whitelist-Ausschluss). Diese Linie konsequent für **alle** Banking-PINs
> halten.

---

## 3. DSGVO / Datenschutz

### 3.1 Verarbeitete Datenkategorien

- **Stammdaten**: Username, E-Mail (Registrierung).
- **Finanzdaten**: Depotbestände, Salden, Trades, P2P-NAV, Bankverbindungen.
- **Zugangsdaten Dritter**: Broker-API-Keys, OAuth-Tokens, ggf. FinTS-Zugang.
- **Verhaltensdaten**: Signale, Trade-Outcomes, Nutzungsmuster (Self-Learning).

Finanzdaten sind zwar **keine** „besonderen Kategorien" i.S.v. Art. 9 DSGVO, gelten
aber als **hochsensibel** → **erhöhtes Schutzniveau**, strenge Erforderlichkeit.

### 3.2 Rechtsgrundlagen (Art. 6)

- **Vertrag (Art. 6 Abs. 1 b)** für die Kernleistung (Konto, Abo, Aggregation).
- **Einwilligung (Art. 6 Abs. 1 a)** für Marketing-E-Mails / optionales Tracking.
  → Im Code vorhanden: `gdpr_consent` Pflichtfeld bei Registrierung. **Gut.**
- **Berechtigtes Interesse (Art. 6 Abs. 1 f)** nur mit dokumentierter Abwägung.

### 3.3 Betroffenenrechte (Art. 15–21)

- **Auskunft / Datenübertragbarkeit (Art. 20)**: Code adressiert das bereits teilweise
  (Export-Pfad, Demo-User-Sonderfall). **Vollständigkeit prüfen** (alle Datentöpfe).
- **Löschung (Art. 17)** und **Widerspruch/Abmeldung (Art. 21)**:
  Unsubscribe ist **DB-persistent** (gut — kein erneutes Anschreiben nach Restart).
- **Pflicht**: dokumentierter Lösch-/Aufbewahrungs-Plan (Steuer-/HGB-Fristen vs. Löschpflicht).

### 3.4 DSFA — Datenschutz-Folgenabschätzung (Art. 35)

Wegen **systematischer, umfangreicher Verarbeitung von Finanzdaten** + ggf.
**Profilbildung** (Self-Learning, das Signale personalisiert) ist eine **DSFA
sehr wahrscheinlich verpflichtend**. **Empfehlung: DSFA jetzt starten** (auch als
Reifezeichen für Investoren/Enterprise-Kunden).

### 3.5 Auftragsverarbeitung (Art. 28) & Drittland (Kap. V)

Auftragsverarbeiter im Stack — für **jeden** ist ein **AVV** + ggf.
**SCC/Transfer Impact Assessment** nötig:

| Dienst | Rolle | Drittland | To-do |
|---|---|---|---|
| **Railway** (Hosting/DB) | AV | je nach Region (USA) | AVV, Region/SCC prüfen |
| **Anthropic** (Claude) | AV | USA | AVV/DPA, SCC, **keine unnötigen PII in Prompts** |
| **Stripe** (Billing) | AV / teils eigenverantwortlich | USA/EU | DPA vorhanden, einbinden |
| **SMTP-Provider** | AV | je nach Anbieter | AVV |
| **YouTube/Google** (Insights) | i.d.R. ohne PII | USA | nur öffentliche Daten |

> **Anthropic-spezifisch:** sicherstellen, dass in LLM-Prompts **keine
> personenbezogenen Finanzdaten** im Klartext übertragen werden, die nicht nötig sind
> (Datenminimierung, Art. 5 Abs. 1 c). Marktdaten/Ticker sind unkritisch; Depot-Salden
> einzelner Nutzer im Prompt wären zu vermeiden bzw. zu pseudonymisieren.

### 3.6 Datensicherheit (Art. 32) — Stand nach Security-Härtung

Durch das parallele Security-Remediation-Paket bereits adressiert und **für die
DSGVO-Konformität direkt relevant** (Art. 32 „Stand der Technik"):

- **Verschlüsselung at-rest** der gespeicherten Zugangsdaten (Fernet, `APP_ENCRYPTION_KEY`).
- **Demo-/Default-Credentials** in Produktion deaktiviert (Fail-closed beim Start).
- **SSRF-Schutz**, **CORS-Restriktion**, **/docs zu in Prod**, **Rate-Limits**.

Offen/empfohlen zusätzlich: TLS überall (Railway-default), zentrales Audit-Logging
für Zugriffe auf Finanzdaten, regelmäßige Pen-Tests, Backup-/Restore-Verschlüsselung,
Schlüsselverwaltung (Rotation `APP_ENCRYPTION_KEYS_OLD`).

---

## 4. Verbraucherschutz / Vertragsrecht (flankierend)

- **AGB** mit klarer Leistungsbeschreibung, Haftungsbegrenzung, Kündigungsregeln.
- **Fernabsatz / Widerrufsrecht** für Verbraucher-Abos (§§ 312 ff. BGB), korrekte
  Widerrufsbelehrung.
- **Preisangaben / Button-Lösung** („zahlungspflichtig bestellen") im Stripe-Checkout.
- **Klarer Risikohinweis**: „Trading birgt Totalverlustrisiko; vergangene Performance
  ist kein Indikator für zukünftige Ergebnisse; keine Anlageberatung."

---

## 5. Risikomatrix

| # | Risiko | Eintritt | Schaden | Brutto |
|---|---|---|---|---|
| R1 | Signale = unerlaubte Anlageberatung/-vermittlung | mittel–hoch | sehr hoch (Untersagung, Bußgeld, Strafbarkeit § 54 KWG) | 🔴 |
| R2 | Live-Auto-Execution = Finanzportfolioverwaltung | mittel | sehr hoch | 🔴 |
| R3 | FinTS-Kontozugriff = AISP-Pflicht (ZAG/PSD2) | mittel | hoch | 🟠 |
| R4 | DSFA fehlt / AVV-Lücken / Drittland ungeregelt | hoch | mittel–hoch (Bußgeld bis 4 % Umsatz) | 🟠 |
| R5 | MAR-Pflichten bei skalierten Empfehlungen | mittel | mittel | 🟡 |
| R6 | Verbraucher-/AGB-/Widerrufsmängel | mittel | mittel | 🟡 |
| R7 | Klartext-Demo-Credentials im öffentlichen README | hoch | mittel (Repo-/Daten-Kompromittierung) | 🟠 |

---

## 6. Empfohlene Maßnahmen (priorisiert)

**Sofort (diese/nächste Woche):**
1. **Disclaimer überall**: „Allgemeine Information, **keine Anlageberatung/-empfehlung**,
   kein Angebot/keine Aufforderung zum Kauf." Prominent in UI, Signalen, E-Mails, AGB.
2. **Live-Trading hart gated lassen** (`ENABLE_LIVE_TRADING=false`) bis aufsichts-
   rechtliche Klärung. Auto-Execution-Loops im Live-Modus deaktiviert lassen.
3. **README-/Repo-Hygiene**: echte Demo-Zugangsdaten (`admin / NeuralTrading2026!`)
   aus dem öffentlichen README entfernen und das Passwort **rotieren**.
4. **Datenschutzerklärung + AVV-Inventar** erstellen/vervollständigen (Tabelle §3.5).

**Kurzfristig (4–8 Wochen):**
5. **Rechtsgutachten** einer Kapitalmarktkanzlei zu R1/R2/R3 (Erlaubnispflicht).
   Ggf. **BaFin-Voranfrage** (formlose Anfrage zur Einordnung).
6. **DSFA (Art. 35)** durchführen und dokumentieren.
7. **Prompt-Datenminimierung** zu Anthropic (keine unnötigen Klartext-Finanzdaten).
8. **AISP-Strategie**: eigener Erlaubnisantrag vs. lizenzierter Open-Banking-Provider.

**Mittelfristig (Produkt-/Geschäftsmodell):**
9. Geschäftsmodell bewusst entscheiden:
   - **Variante A „Info-Tool":** generische, nicht personalisierte Analyse, kein
     Live-Routing → niedrigeres Risiko, ohne KWG-Erlaubnis tragbar (mit Disclaimer).
   - **Variante B „Robo/Vermittlung":** personalisiert + Ausführung →
     **Erlaubnis nach KWG/WpIG** oder **Kooperation mit einem Haftungsdach /
     lizenzierten Partner** (vertraglich gebundener Vermittler, § 3 WpIG).
10. **Haftpflicht/Vermögensschaden-Versicherung** (D&O + Cyber + ggf. VSH) mit Broker klären.

---

## 7. Offene Fragen an die Geschäftsführung

- Soll **Live-Order-Routing** überhaupt Teil des Produkts werden, oder bleibt es bei
  **Signal + Paper-Trading**? (Entscheidet das gesamte Erlaubnis-Thema.)
- Werden Signale **individuell pro Nutzer** personalisiert (Portfolio-/Risikoprofil),
  oder **identisch für alle** (generisch)?
- Zielmärkte: nur **DE/EU**, oder auch außerhalb? (ändert Regulatorik massiv)
- Bestehen schon **Kanzlei-/Steuer-/Versicherungs-Kontakte**, die wir aktivieren können?

---

*Erstellt durch Jarvis in Synthese aus Legal/Privacy-Counsel- und
Financial-Compliance-Officer-Perspektive. Nächster Schritt: Punkte §6.1–6.4 intern
umsetzen, parallel externe Kanzlei für §6.5 mandatieren.*
