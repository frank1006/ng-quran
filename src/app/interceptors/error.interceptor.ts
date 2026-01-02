import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';

/**
 * Global HTTP error interceptor
 * Handles HTTP errors consistently across the application
 */
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      let errorMessage = 'An unexpected error occurred';

      if (error.error instanceof ErrorEvent) {
        // Client-side error
        errorMessage = error.error.message || 'Client-side error occurred';
      } else {
        // Server-side error
        switch (error.status) {
          case 0:
            errorMessage = 'Network error. Please check your internet connection.';
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

      // Log error in development mode only
      if (!isProduction()) {
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

function isProduction(): boolean {
  return typeof window !== 'undefined' && 
         (window.location.hostname === 'localhost' || 
          window.location.hostname === '127.0.0.1') === false;
}

