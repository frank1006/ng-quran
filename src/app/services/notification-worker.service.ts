import { Injectable, inject } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';
import { Router } from '@angular/router';
import { Logger } from '../core/logger.util';

/**
 * Service to handle Service Worker notification events
 * This works alongside Angular's service worker
 */
@Injectable({
  providedIn: 'root'
})
export class NotificationWorkerService {
  private readonly swUpdate = inject(SwUpdate);
  private readonly router = inject(Router);

  constructor() {
    this.setupNotificationHandlers();
  }

  /**
   * Setup notification click handlers
   */
  private setupNotificationHandlers(): void {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    // Listen for service worker messages (notification clicks)
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data && event.data.type === 'NOTIFICATION_CLICK') {
        this.handleNotificationClick(event.data);
      }
    });

    // Also handle notificationclick events if service worker supports it
    // This is a fallback for when service worker is active
    if (navigator.serviceWorker.controller) {
      this.registerNotificationClickHandler();
    }

    // Register handler when service worker becomes active
    navigator.serviceWorker.ready.then(() => {
      this.registerNotificationClickHandler();
    });
  }

  /**
   * Register notification click handler in service worker
   */
  private registerNotificationClickHandler(): void {
    // Send message to service worker to register notification click handler
    if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'REGISTER_NOTIFICATION_HANDLER'
      });
    }
  }

  /**
   * Handle notification click
   */
  private handleNotificationClick(data: any): void {
    const url = data.url || '/prayer';
    
    // Navigate to prayer page
    this.router.navigateByUrl(url).catch((error) => {
      Logger.error('Failed to navigate to prayer page:', error);
    });

    // Focus the window if it exists
    if (window) {
      window.focus();
    }
  }
}

