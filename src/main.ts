import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { inject } from '@vercel/analytics';

/** On a fresh start the launch screen stays at least this long (from the tap), so it reads as a splash, not a flash */
const SPLASH_MIN_MS = 1000;

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
