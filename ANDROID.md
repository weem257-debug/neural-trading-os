# Neural Trading OS - Android App

Built with Capacitor 8. The native Android shell bundles a **static export** of
the Next.js app (`MOBILE_BUILD=1 next build` → `out/`) and talks to the live
FastAPI backend on Railway over HTTPS/WSS.

## Prerequisites
- Android Studio (download: https://developer.android.com/studio)
- JDK 17 (required by Capacitor 8 / Android Gradle Plugin)
- Node.js 18+
- An `android/local.properties` with `sdk.dir=<path-to-Android-SDK>`
  (Android Studio writes this automatically on first open)

## Quick Start

```bash
cd frontend && npm install
npm run android            # builds the static export, syncs, opens Android Studio
```

## How it works
The web layer is statically exported (`next.config.mjs` switches to
`output: "export"` when `MOBILE_BUILD=1`). The exported assets live in
`frontend/out/` and are copied into the Android project by `npx cap sync`.

Backend URLs are **baked into the bundle at build time** (a static export has no
server to read env vars at runtime). `next.config.mjs` injects them for mobile
builds via the `env` key (this overrides `.env.local`, which otherwise pins
localhost). Defaults point at the Railway deployment; override per build:

```bash
MOBILE_API_URL=https://api.example.com \
MOBILE_WS_URL=wss://api.example.com \
MOBILE_APP_URL=https://app.example.com \
npm run android:sync
```

Web-only routes (`*.web.tsx`: the Edge-runtime OpenGraph/Twitter share images
and SEO pages) are excluded from the mobile bundle via `pageExtensions`, because
the Edge runtime cannot be statically exported.

## Build commands (run from `frontend/`)
| Command | Result |
|---------|--------|
| `npm run android:sync`      | Build static export + `cap sync` (no compile) |
| `npm run android:build:apk` | Sync, then build a release **APK** via Gradle |
| `npm run android:build:aab` | Sync, then build a release **AAB** (Play Store) |
| `npm run android:dev`       | Live-reload against `http://10.0.2.2:3000` (emulator) |

> A compiled APK/AAB requires JDK 17 + the Android SDK on the build machine.
> Without them, `android:sync` still works and prepares the project; the final
> Gradle compile must run where the SDK is installed (or in CI).

## Build APK (Android Studio)
1. Open Android Studio -> Build -> Generate Signed Bundle / APK
2. Choose APK -> create/select keystore -> build Release

## Push Notifications (Telegram alternative)
Telegram bot handles real-time notifications. For native push:
1. Create Firebase project at console.firebase.google.com
2. Add `google-services.json` to `android/app/`
3. Set `FIREBASE_SERVER_KEY` in Railway env vars
4. Use `@capacitor/push-notifications` (already installed)

## App Details
- Package: com.neuraltrading.os
- Min SDK: Android 7.0 (API 24)
- Target: Android 14 (API 34)
- Background: #080B14 (Neural dark)
