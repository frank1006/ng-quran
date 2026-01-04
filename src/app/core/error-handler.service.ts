import { Injectable, ErrorHandler, isDevMode } from '@angular/core';

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
    if (isDevMode()) {
      console.error('Global Error Handler:', error);
    }

    // Extract error message
    const errorMessage = error instanceof Error 
      ? error.message 
      : 'An unexpected error occurred';

    // Log to console in production (without stack trace) - intentional for critical errors
    // In production, you could send errors to an error tracking service instead
    // Example: Sentry, LogRocket, etc.
    if (!isDevMode()) {
      // In production, only log error message without full error object
      console.error('Application Error:', errorMessage);
    } else {
      // In development, log full error details
      console.error('Application Error:', errorMessage, error);
    }
  }
}

