import { isDevMode } from '@angular/core';

/**
 * Production-safe logging utility
 * Only logs detailed information in development mode
 */
export class Logger {
  /**
   * Log error message (always logged, but detailed info only in dev)
   */
  static error(message: string, error?: unknown): void {
    if (isDevMode() && error) {
      console.error(message, error);
    } else {
      console.error(message);
    }
  }

  /**
   * Log warning (only in development)
   */
  static warn(message: string, data?: unknown): void {
    if (isDevMode()) {
      if (data) {
        console.warn(message, data);
      } else {
        console.warn(message);
      }
    }
  }

  /**
   * Log info (only in development)
   */
  static info(message: string, data?: unknown): void {
    if (isDevMode()) {
      if (data) {
        console.info(message, data);
      } else {
        console.info(message);
      }
    }
  }
}

