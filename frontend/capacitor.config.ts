import type { CapacitorConfig } from "@capacitor/cli";

// CAP_SERVER_URL is set during dev live-reload only.
// In production static builds (MOBILE_BUILD=1) this is omitted so Capacitor
// serves from the bundled `out/` folder instead of a remote URL.
const devServerUrl = process.env.CAP_SERVER_URL;

const config: CapacitorConfig = {
  appId: "com.neuraltrading.os",
  appName: "Neural Trading OS",
  webDir: "out",
  server: {
    androidScheme: "https",
    ...(devServerUrl
      ? { url: devServerUrl, cleartext: devServerUrl.startsWith("http://") }
      : {}),
  },
  android: {
    backgroundColor: "#080B14",
    allowMixedContent: false,
    buildOptions: {
      releaseType: "APK",
    },
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: "#080B14",
      androidSplashResourceName: "splash",
      showSpinner: false,
    },
    StatusBar: {
      style: "dark",
      backgroundColor: "#080B14",
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
    Keyboard: {
      resize: "body",
      resizeOnFullScreen: true,
    },
  },
};

export default config;
