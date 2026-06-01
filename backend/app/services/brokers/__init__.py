"""
Broker integrations package.

Phase 1 — Offizielle APIs (sofort einsatzbereit):
  - bitpanda   : Offizielle REST API v1 (Bearer token)
  - comdirect  : Offizielle OAuth 2.0 API (PHOTO-TAN Onboarding nötig)

Phase 2 — Inoffizielle / Community-Bibliotheken (Mittelfristig):
  - degiro     : degiro-connector (community, pip-installierbar)
  - flatex     : python-degiro-like inoffizielle Lib / FinTS fallback
  - crowdestor : Web-Scraping / inoffizielle API

Phase 3 — Reverse Engineering (Komplex):
  - trade_republic : WebSocket + proprietäres Protokoll
  - wh_selfinvest  : FIX-Protokoll oder proprietärer WebSocket
"""
