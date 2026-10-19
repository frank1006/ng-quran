import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { inject } from '@vercel/analytics';
import { NativeApp, isNativeApp } from './app/core/native-app';

/**
 * On a fresh start the launch screen stays at least this long (from the tap), so it reads as a
 * splash, not a flash. Not in the installed Android apps (the TWA's "android-app" class, set in
 * index.html, or the native app): Android shows its own launch screen there and ours stays empty.
 */
const SPLASH_MIN_MS = isNativeApp || document.documentElement.classList.contains('android-app') ? 0 : 1000;

// Vercel Analytics counts website visits; its script isn't in the Android app
if (!isNativeApp) inject();

bootstrapApplication(App, appConfig)
  .then(hideSplash)
  .catch((err) => {
    console.error('Failed to bootstrap application:', err);
    hideSplash();
  });

/** Fades out the launch screen in index.html once the app is up and the minimum time has passed */
function hideSplash(): void {
  const splash = document.getElementById('boot');
  if (isNativeApp) {
    // Android's launch screen is still up: drop ours at once, then let Android's go once the
    // page has drawn (two frames), so the page appears straight after it
    splash?.remove();
    requestAnimationFrame(() => requestAnimationFrame(() => void NativeApp.ready().catch(() => {})));
    return;
  }
  if (!splash) return;
  setTimeout(() => {
    splash.classList.add('boot--hidden');
    // After the fade (or at once with reduced motion, where there is no transition)
    setTimeout(() => splash.remove(), 300);
  }, Math.max(0, SPLASH_MIN_MS - performance.now()));
}
