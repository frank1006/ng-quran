import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { isDevMode } from '@angular/core';
import { catchError, throwError } from 'rxjs';

/**
 * Global HTTP error interceptor
 * Handles HTTP errors consistently across the application
 * Note: Offline banner is only shown for verse audio playback errors, not for general HTTP errors
 */
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      let errorMessage = 'An unexpected error occurred';
      let isNetworkError = false;

      if (error.error instanceof ErrorEvent) {
        // Client-side error
        const clientMessage = error.error.message || '';
        // Check if it's a network-related error
        if (clientMessage.includes('Failed to fetch') || 
            clientMessage.includes('NetworkError') ||
            clientMessage.includes('network') ||
            clientMessage.includes('connection') ||
            !navigator.onLine) {
          isNetworkError = true;
          errorMessage = 'No internet connection. Please check your network and try again.';
        } else {
          errorMessage = clientMessage || 'Client-side error occurred';
        }
      } else {
        // Server-side error
        switch (error.status) {
          case 0:
            errorMessage = 'No internet connection. Please check your network and try again.';
            isNetworkError = true;
            break;
          case 400:
            errorMessage = 'Invalid request. Please try again.';
            break;
          case 401:
            errorMessage = 'Unauthorized access.';
            break;
          case 403:
            errorMessage = 'Access forbidden.';
            break;
          case 404:
            errorMessage = 'Resource not found.';
            break;
          case 429:
            errorMessage = 'Too many requests. Please try again later.';
            break;
          case 500:
            errorMessage = 'Server error. Please try again later.';
            break;
          case 503:
            errorMessage = 'Service unavailable. Please try again later.';
            break;
          default:
            errorMessage = error.error?.message || error.message || `Error: ${error.status}`;
        }
      }

      // Note: Offline banner is only shown for verse audio playback errors, not for general HTTP errors

      // Log error in development mode only
      if (isDevMode()) {
        console.error('HTTP Error:', {
          url: req.url,
          status: error.status,
          message: errorMessage,
          error
        });
      }

      return throwError(() => new Error(errorMessage));
    })
  );
};

