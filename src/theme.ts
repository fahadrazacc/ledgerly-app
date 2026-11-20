// Light / dark / follow-the-phone theme.
import { Capacitor, SystemBars, SystemBarsStyle } from '@capacitor/core';
import { getMeta, setMeta } from './vault';

type Pref = 'system' | 'light' | 'dark';
const media = typeof matchMedia !== 'undefined' ? matchMedia('(prefers-color-scheme: dark)') : null;
let current: Pref = 'system';

function paint() {
  const dark = current === 'dark' || (current === 'system' && !!media?.matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0F141C' : '#F4F5F9');
  if (Capacitor.isNativePlatform()) {
    // LIGHT style = light icons for a dark background, and vice versa.
    SystemBars.setStyle({ style: dark ? SystemBarsStyle.Dark : SystemBarsStyle.Light }).catch(() => undefined);
  }
}

export function applyTheme(pref: Pref) {
  current = pref;
  if (getMeta().theme !== pref) setMeta({ theme: pref });
  paint();
}

export function initTheme() {
  current = getMeta().theme;
  media?.addEventListener('change', paint);
  paint();
}
