import { Injectable, ErrorHandler } from '@angular/core';

/**
 * Global error handler service
 * Catches and handles unhandled errors across the application
 */
@Injectable({
  providedIn: 'root'
})
export class GlobalErrorHandler implements ErrorHandler {
  handleError(error: Error | unknown): void {
    // Only log detailed errors in development
    if (this.isDevelopment()) {
      console.error('Global Error Handler:', error);
    }

    // Extract error message
    const errorMessage = error instanceof Error 
      ? error.message 
      : 'An unexpected error occurred';

    // Log to console in production (without stack trace)
    console.error('Application Error:', errorMessage);

    // In production, you could send errors to an error tracking service
    // Example: Sentry, LogRocket, etc.
    // if (this.isProduction()) {
    //   this.errorTrackingService.logError(error);
    // }
  }

  private isDevelopment(): boolean {
    return typeof window !== 'undefined' && 
           (window.location.hostname === 'localhost' || 
            window.location.hostname === '127.0.0.1');
  }
}

