// Fingerprint / face unlock for the Android app.
// The passcode is stored in the Android Keystore, bound to the user's current biometrics,
// and can only be read back after a successful fingerprint scan.
import { Capacitor } from '@capacitor/core';
import { getMeta, setMeta } from './vault';

const SERVER = 'com.ledgerly.app.vault';
const plugin = () => import('@capgo/capacitor-native-biometric');

export const isNativeApp = () => Capacitor.isNativePlatform();
export const isIOS = () => Capacitor.getPlatform() === 'ios';
/** "Face ID" on iPhone, "fingerprint" on Android. */
export const bioName = () => (isIOS() ? 'Face ID' : 'fingerprint');
export const BioName = () => (isIOS() ? 'Face ID' : 'Fingerprint');

export async function biometricAvailable(): Promise<boolean> {
  if (!isNativeApp()) return false;
  try {
    const { NativeBiometric } = await plugin();
    const r = await NativeBiometric.isAvailable();
    return r.isAvailable;
  } catch {
    return false;
  }
}

export const biometricEnabled = () => isNativeApp() && getMeta().biometric;

export async function enableBiometric(passcode: string) {
  const { NativeBiometric, AccessControl } = await plugin();
  await NativeBiometric.verifyIdentity({ title: `Turn on ${bioName()} unlock`, reason: 'Confirm it is you', negativeButtonText: 'Cancel' });
  await NativeBiometric.setCredentials({ username: 'ledgerly', password: passcode, server: SERVER, accessControl: AccessControl.BIOMETRY_CURRENT_SET });
  setMeta({ biometric: true });
}

export async function disableBiometric() {
  setMeta({ biometric: false });
  try {
    const { NativeBiometric } = await plugin();
    await NativeBiometric.deleteCredentials({ server: SERVER });
  } catch {
    /* nothing stored */
  }
}

/** Shows the fingerprint prompt and returns the stored passcode. */
export async function unlockWithBiometric(): Promise<string> {
  const { NativeBiometric } = await plugin();
  const c = await NativeBiometric.getSecureCredentials({ server: SERVER, title: 'Unlock Ledgerly', reason: 'Unlock Ledgerly' });
  return c.password;
}

/** Keep the stored passcode in step after a passcode change. */
export async function refreshBiometric(passcode: string) {
  if (!biometricEnabled()) return;
  try {
    const { NativeBiometric, AccessControl } = await plugin();
    await NativeBiometric.setCredentials({ username: 'ledgerly', password: passcode, server: SERVER, accessControl: AccessControl.BIOMETRY_CURRENT_SET });
  } catch {
    await disableBiometric();
  }
}
