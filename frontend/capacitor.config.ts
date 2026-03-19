import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.tugasto.app',
  appName: 'Gastos',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  },
  plugins: {
    Share: {
      overrideAndroidManifest: true
    }
  }
};

export default config;
