import { Injectable, signal, computed } from '@angular/core';

export interface DeviceInfo {
  isMobile: boolean;
  isIOS: boolean;
  isAndroid: boolean;
  isPWAInstalled: boolean;
  isStandalone: boolean;
  supportsNotifications: boolean;
  requiresInstallation: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class DeviceDetectionService {
  private readonly isMobile = signal<boolean>(this.detectMobile());
  private readonly isIOS = signal<boolean>(this.detectIOS());
  private readonly isAndroid = signal<boolean>(this.detectAndroid());
  private readonly isPWAInstalled = signal<boolean>(this.detectPWAInstallation());
  private readonly isStandalone = signal<boolean>(this.detectStandalone());

  readonly deviceInfo = computed<DeviceInfo>(() => ({
    isMobile: this.isMobile(),
    isIOS: this.isIOS(),
    isAndroid: this.isAndroid(),
    isPWAInstalled: this.isPWAInstalled(),
    isStandalone: this.isStandalone(),
    supportsNotifications: this.supportsNotifications(),
    requiresInstallation: this.requiresInstallation()
  }));

  private detectMobile(): boolean {
    if (typeof window === 'undefined') return false;
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent
    );
  }

  private detectIOS(): boolean {
    if (typeof window === 'undefined') return false;
    // iPadOS reports itself as a Mac, but Macs have no touch screen
    return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
  }

  private detectAndroid(): boolean {
    if (typeof window === 'undefined') return false;
    return /Android/.test(navigator.userAgent);
  }

  /**
   * Detect if PWA is installed to home screen
   */
  private detectPWAInstallation(): boolean {
    if (typeof window === 'undefined') return false;

    // Only an app opened from the Home Screen runs standalone. (An active service worker
    // doesn't count: it is active in a normal browser tab too.)
    return this.detectStandalone();
  }

  /**
   * Detect if app is running in standalone mode (installed PWA)
   */
  private detectStandalone(): boolean {
    if (typeof window === 'undefined') return false;

    // Check for standalone display mode (iOS Safari)
    if ((window.navigator as any).standalone) {
      return true;
    }

    // Check for display-mode: standalone (Android Chrome)
    if (window.matchMedia('(display-mode: standalone)').matches) {
      return true;
    }

    return false;
  }

  /**
   * Check if device supports notifications
   */
  supportsNotifications(): boolean {
    if (typeof window === 'undefined') return false;
    return 'Notification' in window && 'serviceWorker' in navigator;
  }

  /**
   * Check if installation is required for notifications (iOS)
   */
  requiresInstallation(): boolean {
    return this.isIOS() && !this.isPWAInstalled();
  }

  /**
   * Get user-friendly message about installation requirement
   */
  getInstallationMessage(): string {
    if (this.isIOS() && !this.isPWAInstalled()) {
      return 'To get prayer reminders on iPhone or iPad, add QuranFlow to your Home Screen: in Safari tap Share (or ⋯ then Share), choose "Add to Home Screen", then open QuranFlow from the new icon.';
    }
    return '';
  }
}

