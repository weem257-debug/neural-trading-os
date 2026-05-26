# Neural Trading OS - Android App

Built with Capacitor (wraps the live web app in a native Android shell).

## Prerequisites
- Android Studio (download: https://developer.android.com/studio)
- Java 17+
- Node.js 18+

## Quick Start

```bash
# Install dependencies
cd frontend && npm install

# Open in Android Studio
npm run android
```

## How it works
The Android app is a native shell that loads the live web app from Railway.
No separate backend needed - all data comes from the existing FastAPI backend.

## Build APK
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
