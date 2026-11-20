import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.ledgerly.app',
  appName: 'Ledgerly',
  webDir: 'dist',
  android: { backgroundColor: '#F4F5F9' },
  plugins: {
    SystemBars: { insetsHandling: 'css', initialViewportFitValueHint: 'cover' },
  },
};

export default config;
