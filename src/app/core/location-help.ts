/**
 * What to tell someone who blocked location, worded for where QuranFlow is running:
 * an iPhone/iPad, the installed Android app, or a browser tab.
 */
export function locationDeniedMessage(): string {
  const ua = navigator.userAgent;
  const isIos = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const installed = window.matchMedia?.('(display-mode: standalone)').matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;

  if (isIos) {
    return 'Location is off for QuranFlow. Turn it on in Settings › Privacy & Security › Location Services, then tap Try again.';
  }
  if (installed && /Android/.test(ua)) {
    return 'Location is off for QuranFlow. Allow it in Settings › Apps › QuranFlow › Permissions, then tap Try again.';
  }
  return 'Location is blocked for this site. Allow it from the icon next to the address bar, then tap Try again.';
}
