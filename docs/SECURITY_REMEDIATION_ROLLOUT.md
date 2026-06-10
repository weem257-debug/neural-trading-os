# Security-Remediation — Rollout-Runbook

**Branch:** `security/audit-remediation`
**Datum:** 2026-06-10

Dieses Dokument fasst zusammen, was geändert wurde und **welche Schritte du (Nutzer)
für den Produktiv-Rollout selbst ausführen musst**. Nichts davon wurde automatisch
auf Produktion deployt oder gegen die Prod-DB migriert.

---

## 1. Was du selbst tun musst (Checkliste)

### 1.1 API-Key rotieren (C1)
- [ ] **Anthropic-Key rotieren** in der Console (https://console.anthropic.com/) —
      der bisherige Klartext-Key in `backend/.env` sollte als kompromittiert gelten,
      da er lokal im Klartext lag. Neuen Key erzeugen, alten widerrufen.
- [ ] Neuen Key in `backend/.env` (lokal) und als Railway-Variable `ANTHROPIC_API_KEY`
      eintragen.
- [ ] **README-Demo-Zugangsdaten entfernen/rotieren:** Im öffentlichen `README.md`
      stehen echte Login-Daten (`admin / NeuralTrading2026!`). Entfernen und das
      Passwort des betroffenen Accounts ändern.

### 1.2 Neue Pflicht-Env-Vars setzen (C2/H5)
- [ ] **`APP_ENCRYPTION_KEY`** generieren und in Railway (Backend-Service) setzen:
      ```
      python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
      ```
      Ohne diesen Key **startet die Produktion nicht** (gewollt). **Key sicher
      verwahren** — Verlust macht verschlüsselte Credentials unwiederbringlich.
- [ ] **`TRUST_PROXY=true`** in Railway setzen (Backend sitzt hinter dem Railway-Proxy;
      sonst greift das Rate-Limiting pro Proxy-IP statt pro Client).
- [ ] **`ALLOWED_ORIGINS`** auf die echte(n) Frontend-Origin(s) setzen
      (z. B. `https://frontend-production-8a00.up.railway.app`). Kein localhost.
- [ ] **`DEMO_PASSWORD`**: entweder Default lassen (→ Demo-Account ist in Prod
      **deaktiviert**) **oder** einen starken, nicht-trivialen Wert setzen (→ Account
      bleibt aktiv). Ein bekannter Schwachwert wie `neural123` **bricht den Start ab**.
- [ ] Sicherstellen, dass **`JWT_SECRET_KEY`** in Prod ein starker Zufallswert ist
      (`openssl rand -hex 32`).

### 1.3 Bestands-Credentials verschlüsseln (C2-Migration)
Wenn in der **Prod-DB** bereits Credentials im Klartext liegen (Tabelle `app_secrets`):

- [ ] **Lokal** gegen den **Railway Public-Proxy** (kein Auto-Migrate!) ausführen —
      zuerst Dry-Run:
      ```
      # im Verzeichnis dashboard/backend
      DATABASE_URL="postgresql://<user>:<pass>@<public-proxy-host>:<port>/railway" \
      APP_ENCRYPTION_KEY="<derselbe Key wie in Railway>" \
      python -m scripts.encrypt_existing_secrets --dry-run
      ```
- [ ] Wenn die Ausgabe plausibel ist, ohne `--dry-run` erneut ausführen (schreibt).
- [ ] Das Skript ist **idempotent** — bereits verschlüsselte Zeilen (`enc:v1:`) werden
      übersprungen. Es kann gefahrlos erneut laufen.

> Hinweis: Neue Schreibvorgänge über die Settings-UI werden ab Deploy **automatisch**
> verschlüsselt. Das Skript ist nur für **Altbestände** nötig.

### 1.4 Deploy
- [ ] Branch reviewen/mergen (PR), dann **bewusst** deployen. Ein Git-Push bedeutet
      laut Projekt-Setup **nicht** automatisch „deployed".
- [ ] Es sind **keine neuen Alembic-Migrationen** in diesem Paket — das DB-Schema
      ändert sich nicht (Verschlüsselung nutzt die bestehende `app_secrets.value`-Spalte).

---

## 2. Was sich im Code geändert hat (Überblick)

| ID | Thema | Datei(en) |
|----|-------|-----------|
| C1 | Key-Hygiene, .env.example dokumentiert | `.env.example`, `railway.toml` |
| C2 | Fernet-Verschlüsselung at-rest | `app/core/crypto.py`, `app/services/credentials.py`, `scripts/encrypt_existing_secrets.py`, `requirements.txt` |
| C3 | Demo-Account in Prod aus, Fail-closed-Start | `app/core/config.py`, `app/api/auth.py`, `app/main.py` |
| H1 | JWT fail-closed (bereits inkl. staging) | `app/main.py` (bestätigt) |
| H2 | SSRF-Schutz Outbound-Webhooks | `app/services/webhooks/client.py` |
| H3 | CORS in Prod restriktiv | `app/main.py` |
| H4 | /docs, /redoc, /openapi.json in Prod aus | `app/main.py` |
| H5 | Proxy-aware + strengere Rate-Limits | `app/core/rate_limits.py`, `app/api/auth.py` |
| M3 | Gezieltes Logging statt `except: pass` | `app/services/credentials.py`, `app/api/auth.py`, `app/api/routes/execution.py` |
| M4 | Cent-exakte Paper-Money-Mathematik (Decimal) | `app/services/nautilus/client.py` |
| M5 | `cryptography` gepinnt, numpy-Pin dokumentiert | `requirements.txt` |

Neue Tests: `tests/test_crypto.py`, `tests/test_webhook_ssrf.py`.

---

## 3. Bewusst NICHT geändert (Backlog / Risikoabwägung)

- **M1 (monolithische Route-Dateien `admin.py`/`auth.py`/`signals.py`/`main.py`):**
  als Backlog belassen — eine große Aufteilung birgt Regressionsrisiko und sollte
  inkrementell mit dediziertem Test-Schutz erfolgen.
- **Voll-Decimal im Trading-Pfad:** Paper-Trading ist jetzt cent-exakt; eine
  durchgängige Decimal-Typisierung (inkl. Pydantic-Schemas) ist für den **echten**
  Geld-Pfad nachzuziehen, bevor Live-Trading aktiviert wird.
- **Railway Auto-Migrate (`alembic upgrade head` im Start-Command):** unverändert
  gelassen — das ist eine Deployment-Entscheidung. Beachte die Projekt-Regel
  „keine Auto-Migration"; ggf. den Start-Command anpassen, falls du Migrationen
  ausschließlich manuell fahren willst.

---

## 4. Verifikation

- Volle Backend-Testsuite ausgeführt (siehe Umsetzungsbericht).
- Neue Unit-Tests für Krypto-Roundtrip/Key-Rotation und SSRF-Validierung: grün.
- Fail-closed-Startup in simulierter Produktion verifiziert (Abbruch bei Default-
  `DEMO_PASSWORD` bzw. fehlendem `APP_ENCRYPTION_KEY`).
- Dev-Startup (lokal, Port 8001) bleibt funktionsfähig.
