# Neural Trading OS — ProductHunt Launch Kit

---

## 1. TAGLINE (max. 60 Zeichen)

> AI trading signals that learn from every trade

*(47 Zeichen — scharf, konkret, kein Jargon)*

Alternativen (falls A/B nötig):
- `AI-powered trading signals. Self-learning.` (44 Zeichen)
- `Your AI co-pilot for smarter trade decisions` (46 Zeichen)

---

## 2. DESCRIPTION (max. 260 Zeichen)

> Neural Trading OS connects to 7 brokers, generates AI trading signals via Claude AI, and learns from every outcome. Free tier available. Pro plan from $29/mo. Works on web and Android.

*(185 Zeichen — Raum für Icons/Emoji wenn gewünscht)*

---

## 3. MAKER COMMENT (First Comment, ~300 Wörter)

---

Hey ProductHunt!

I'm Jan, the maker of Neural Trading OS — and I want to be upfront about why I built this.

I got frustrated. Not with trading itself, but with the tooling. Every signal service I tried was a black box: you'd get a "BUY BTC" notification, no explanation, no track record, and no way to know if the system was getting better or worse over time.

So I built the opposite.

**Neural Trading OS** generates trading signals through Claude AI — and then watches what happens. Every trade outcome feeds back into the system. Signals that performed well get reinforced. Signals from stale or low-confidence insights decay automatically. The system genuinely learns, not just retrains on static data.

Under the hood:
- **7 broker connectors** (Interactive Brokers, Binance, Coinbase, Alpaca, and more)
- **Two AI modes**: Sonnet for deep analysis, Haiku for real-time speed
- **Telegram bot** for instant signal notifications
- **Full self-service multi-tenant** — sign up, connect your broker, get signals in minutes
- **Android app** via Capacitor, so you're never far from your positions

The subscription model is intentionally tiered: the free plan gives you 3 signals/month to evaluate the quality before committing. Basic (€29) covers most active retail traders. Pro (€99) unlocks 50 signals. Institutional (€299) is unlimited.

What I'm most proud of: the transparency. Every signal shows its confidence score, the reasoning behind it, and a running track record. You can audit the AI. You can tell it when it's wrong. And it actually adjusts.

525 backend tests, 52 E2E tests, live since early 2026.

Happy to answer any questions — especially around the self-learning architecture or broker integrations. Ask me anything!

— Jan

---

## 4. GALLERY CAPTIONS (5 Screenshots)

**Screenshot 1 — Dashboard Overview**
> Live AI trading signals with confidence scores, reasoning, and real-time P&L — all in one view.

**Screenshot 2 — Signal Detail**
> Every signal shows the Claude AI reasoning chain, confidence decay timeline, and historical accuracy for full transparency.

**Screenshot 3 — Broker Connection**
> Connect to 7 brokers in under 2 minutes. Interactive Brokers, Binance, Coinbase, Alpaca, and more supported out of the box.

**Screenshot 4 — Telegram Notifications**
> Instant signal alerts via Telegram — with confidence level, asset, direction, and entry range in every message.

**Screenshot 5 — Android App**
> Native Android experience via Capacitor. Monitor positions and receive signals anywhere, no compromise on functionality.

---

## 5. LAUNCH-CHECKLISTE

### Timing
- [ ] Launch-Tag: **Dienstag** (höchste Traffic-Tag auf PH, ~30% mehr Upvotes als Montag)
- [ ] Einreichung: **00:01 AM Pacific Time** (= 09:01 Uhr MEZ) — maximale 24h Sichtbarkeit
- [ ] Kein Launch an Tagen mit Apple/Google/OpenAI-Events (PH-Kalender prüfen)

### Pre-Launch (T-7 bis T-1)
- [ ] Maker-Profil auf ProductHunt vervollständigen (Avatar, Bio, Twitter verlinkt)
- [ ] Hunter identifizieren und anschreiben — jemand mit >500 Followern auf PH erhöht Sichtbarkeit signifikant
- [ ] Persönliche Launch-Ankündigung vorbereiten (Twitter, LinkedIn, Newsletter)
- [ ] Demo-Zugangsdaten für Reviewer bereitstellen: `admin / NeuralTrading2026!`
- [ ] 5–10 Beta-Nutzer vorbereiten, die am Launch-Tag authentisch kommentieren (kein Upvote-Ring — gegen PH-Regeln)
- [ ] Gallery-Screenshots final (min. 3, max. 5 Stück, 1270×952px oder 1600×1200px)
- [ ] Product Video optional aber empfohlen: 30–60 Sek. Demo-Walkthrough

### Launch-Tag (T-0)
- [ ] 00:01 AM PT: Listing live — alle Kanäle gleichzeitig feuern (nicht vorher ankündigen!)
- [ ] Maker Comment (First Comment, Schritt 3 oben) sofort nach Go-Live posten
- [ ] Auf alle Kommentare innerhalb von 1 Stunde antworten (PH-Algo bevorzugt aktive Maker)
- [ ] Twitter-Thread live schalten (Schritt 7 unten)
- [ ] LinkedIn-Post live schalten
- [ ] HN Show HN Post live schalten (Schritt 6 unten)
- [ ] Telegram-Gruppe / Community informieren
- [ ] Nicht mehr als 1 Upvote-Erinnerung an echte Nutzer senden — PH erkennt koordiniertes Voting

### Upvote-Strategie (sauber, regelkonform)
- Echte Nutzer anschreiben: "Wir sind heute live auf PH, würde mich über dein Feedback freuen"
- Erste 2 Stunden entscheidend: Wenn in Top 5 → Algorithmus pusht organisch weiter
- Keine Upvote-Exchange-Gruppen (PH bannt sofort)
- Kommentare > Upvotes: Kommentare triggern mehr organische Sichtbarkeit

### Post-Launch (T+1 bis T+7)
- [ ] Launch-Ergebnis dokumentieren (Platzierung, Upvotes, Kommentare, Traffic-Spike)
- [ ] Neue Signups aus PH-Traffic tracken (UTM-Parameter vorher einbauen: `?utm_source=producthunt`)
- [ ] Top-Kommentare für Testimonials verwenden
- [ ] PH-Badge auf Landing Page einbinden

---

## 6. HACKER NEWS — SHOW HN POST

**Titel:**
> Show HN: Neural Trading OS – AI trading signals that self-learn from outcomes (Next.js + FastAPI + Claude)

**Erster Absatz / Body:**

---

I've been building Neural Trading OS for the past several months and wanted to share it here.

The core idea: most signal services are static. They fire a recommendation, you act on it (or don't), and nothing changes in the underlying model based on what actually happened. I wanted to build something that closes that loop.

**What it does:**
- Generates trading signals via Claude AI (Anthropic Sonnet for deep analysis, Haiku for real-time)
- Tracks every signal outcome and feeds it back into the system
- Applies confidence decay to insights that haven't been validated recently
- Connects to 7 brokers (IBKR, Binance, Coinbase, Alpaca, Kraken, Bybit, Tradier)
- Sends alerts via Telegram bot
- Self-service multi-tenant — register, connect broker, get signals in ~2 minutes
- Android app via Capacitor

**Stack:** Next.js 15, FastAPI, SQLAlchemy, PostgreSQL, Railway (backend + DB), Claude Sonnet/Haiku

**Demo:** https://frontend-production-8a00.up.railway.app (admin / NeuralTrading2026!)

**GitHub:** https://github.com/weem257-debug/neural-trading-os

525 backend tests, 52 E2E tests. Feedback especially welcome on the self-learning architecture and the broker connector design.

---

*HN-Timing: Dienstag oder Mittwoch, 09:00–11:00 Uhr Eastern (höchste aktive Nutzer). Nicht am selben Tag wie PH-Launch posten — auf T+1 oder T+2 verschieben.*

---

## 7. TWITTER/X LAUNCH THREAD (5 Tweets)

---

**Tweet 1 (Hook)**
> We're live on @ProductHunt today.
>
> Neural Trading OS: AI trading signals that actually learn from every trade outcome.
>
> Here's what makes it different from every other signal service I've seen. Thread.
>
> [Link zum PH-Listing]

---

**Tweet 2 (Problem)**
> Most trading signal tools are black boxes.
>
> You get a notification. You trade (or don't). The system learns nothing.
>
> We built the opposite: every outcome — win or loss — feeds back into the AI. Signals from stale insights decay. Good calls get reinforced.
>
> It's a genuine feedback loop.

---

**Tweet 3 (Product)**
> Neural Trading OS in numbers:
>
> - 7 broker connectors (IBKR, Binance, Coinbase, Alpaca + more)
> - 2 AI modes: Claude Sonnet (deep) + Haiku (real-time)
> - Telegram alerts with confidence scores
> - Android app
> - Free tier: 3 signals/month
> - Pro: €99/month, unlimited institutional: €299
>
> Self-service. No setup call needed.

---

**Tweet 4 (Transparency angle)**
> What I'm most proud of: every signal is auditable.
>
> You see the confidence score. The reasoning chain. The track record.
>
> You can tell the AI it got it wrong. It adjusts.
>
> That's what "self-learning" should mean — not a marketing word.

---

**Tweet 5 (CTA)**
> Try it now — free tier, no credit card.
>
> Demo: https://frontend-production-8a00.up.railway.app
> (login: admin / NeuralTrading2026! for full access)
>
> If you're on ProductHunt today — an upvote means the world.
> [PH Link]
>
> And if you have questions about the architecture — reply here, I read everything.

---

*Thread-Timing: 08:00 Uhr MEZ am Launch-Dienstag. Alle 5 Tweets innerhalb von 2 Minuten als Thread posten (nicht über den Tag verteilen).*

---

## META

- Erstellt: 2026-06-02 (Iteration #116)
- Live URL: https://frontend-production-8a00.up.railway.app
- PH-Ziel-Platzierung: Top 5 des Tages
- UTM für Traffic-Tracking: `?utm_source=producthunt&utm_medium=listing&utm_campaign=launch-2026`
