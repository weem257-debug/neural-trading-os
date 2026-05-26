import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.neuraltrading.os",
  appName: "Neural Trading OS",
  webDir: "out",
  server: {
    // In development, point to the live server
    url: "https://frontend-production-8a00.up.railway.app",
    cleartext: false,
  },
  android: {
    backgroundColor: "#080B14",
    allowMixedContent: false,
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
  },
};

export default config;
