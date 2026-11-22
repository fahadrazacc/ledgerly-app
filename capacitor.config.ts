import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.ledgerly.app',
  appName: 'Ledgerly',
  webDir: 'dist',
  android: { backgroundColor: '#F4F5F9' },
  ios: {
    backgroundColor: '#F4F5F9',
    contentInset: 'never',
    // Firebase sign-in plugin is added on iPhone once GoogleService-Info.plist is in place
    includePlugins: ['@capacitor/filesystem', '@capacitor/local-notifications', '@capacitor/share', '@capgo/capacitor-native-biometric'],
  },
  plugins: {
    SystemBars: { insetsHandling: 'css', initialViewportFitValueHint: 'cover' },
    LocalNotifications: { smallIcon: 'ic_stat_ledgerly', iconColor: '#3B5BDB' },
    // Native Google sign-in on Android; the Firebase JS SDK then signs in with the returned token.
    FirebaseAuthentication: { skipNativeAuth: true, providers: ['google.com'] },
  },
};

export default config;
