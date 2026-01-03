import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { inject } from '@vercel/analytics';

// Initialize Vercel Analytics
inject();

bootstrapApplication(App, appConfig)
  .catch((err) => {
    console.error('Failed to bootstrap application:', err);
    // In production, you might want to send this to an error tracking service
  });
