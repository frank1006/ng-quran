import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { inject } from '@vercel/analytics';

/**
 * On a fresh start the launch screen stays at least this long (from the tap), so it reads as a
 * splash, not a flash. Not in the installed Android app: Android shows its own launch screen
 * (icon on the manifest's background) while it starts, so ours only covers what's left of loading.
 */
const SPLASH_MIN_MS = isInstalledAndroidApp() ? 0 : 1000;

// Initialize Vercel Analytics
inject();

bootstrapApplication(App, appConfig)
  .then(hideSplash)
  .catch((err) => {
    console.error('Failed to bootstrap application:', err);
    hideSplash();
  });

/** Fades out the launch screen in index.html once the app is up and the minimum time has passed */
function hideSplash(): void {
  const splash = document.getElementById('boot');
  if (!splash) return;
  setTimeout(() => {
    splash.classList.add('boot--hidden');
    // After the fade (or at once with reduced motion, where there is no transition)
    setTimeout(() => splash.remove(), 300);
  }, Math.max(0, SPLASH_MIN_MS - performance.now()));
}

/** The Play Store app (opened by its package) or a web app installed from Chrome on Android */
function isInstalledAndroidApp(): boolean {
  if (!/Android/i.test(navigator.userAgent)) return false;
  return document.referrer.startsWith('android-app://') || matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches;
}
