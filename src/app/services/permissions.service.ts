import { Injectable, signal, computed, inject } from '@angular/core';
import { Observable, from } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { Logger } from '../core/logger.util';
import { PrayerTimeService } from './prayer-time.service';

/**
 * Permission status types
 */
export enum PermissionStatus {
  GRANTED = 'granted',
  DENIED = 'denied',
  PROMPT = 'prompt',
  NOT_REQUESTED = 'not_requested',
  NOT_SUPPORTED = 'not_supported'
}

/**
 * Location permission state
 */
export interface LocationPermissionState {
  status: PermissionStatus;
  canRequest: boolean;
}

/**
 * Compass permission state
 */
export interface CompassPermissionState {
  status: PermissionStatus;
  canRequest: boolean;
  isSupported: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class PermissionsService {
  private readonly prayerTimeService = inject(PrayerTimeService);
  private readonly locationPermission = signal<PermissionStatus>(PermissionStatus.NOT_REQUESTED);
  private readonly compassPermission = signal<PermissionStatus>(PermissionStatus.NOT_REQUESTED);
  private readonly compassSupported = signal<boolean>(false);

  /**
   * Current location permission state
   */
  readonly locationState = computed<LocationPermissionState>(() => ({
    status: this.locationPermission(),
    canRequest: this.locationPermission() === PermissionStatus.PROMPT || 
                this.locationPermission() === PermissionStatus.NOT_REQUESTED
  }));

  /**
   * Current compass permission state
   */
  readonly compassState = computed<CompassPermissionState>(() => ({
    status: this.compassPermission(),
    canRequest: this.compassPermission() === PermissionStatus.PROMPT || 
                this.compassPermission() === PermissionStatus.NOT_REQUESTED,
    isSupported: this.compassSupported()
  }));

  constructor() {
    this.checkPermissions();
  }

  /**
   * Check current permission statuses
   */
  checkPermissions(): void {
    this.checkLocationPermission();
    this.checkCompassPermission();
  }

  /**
   * Check location permission status. Only asks the browser what it already knows: reading the
   * position here would make the phone show its location prompt just for opening a page.
   */
  private checkLocationPermission(): void {
    void this.prayerTimeService.locationPermission().then(permission => {
      switch (permission) {
        case 'granted':
          return this.locationPermission.set(PermissionStatus.GRANTED);
        case 'denied':
          return this.locationPermission.set(PermissionStatus.DENIED);
        case 'unsupported':
          return this.locationPermission.set(PermissionStatus.NOT_SUPPORTED);
        default:
          // Keep what a request in this session already found out
          if (this.locationPermission() === PermissionStatus.NOT_REQUESTED) {
            this.locationPermission.set(PermissionStatus.PROMPT);
          }
      }
    });
  }

  /**
   * Request location permission
   */
  requestLocationPermission(): Observable<boolean> {
    return new Observable<boolean>((observer) => {
      if (!navigator.geolocation) {
        this.locationPermission.set(PermissionStatus.NOT_SUPPORTED);
        observer.next(false);
        observer.complete();
        return;
      }

      navigator.geolocation.getCurrentPosition(
        () => {
          this.locationPermission.set(PermissionStatus.GRANTED);
          observer.next(true);
          observer.complete();
        },
        (error: GeolocationPositionError) => {
          if (error.code === error.PERMISSION_DENIED) {
            this.locationPermission.set(PermissionStatus.DENIED);
          } else {
            this.locationPermission.set(PermissionStatus.PROMPT);
          }
          observer.next(false);
          observer.complete();
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    });
  }

  /**
   * Check compass/motion permission status
   */
  private checkCompassPermission(): void {
    const isSupported = typeof window !== 'undefined' && !!window.DeviceOrientationEvent;
    this.compassSupported.set(isSupported);

    if (!isSupported) {
      this.compassPermission.set(PermissionStatus.NOT_SUPPORTED);
      return;
    }

    // Check if iOS permission request is needed
    if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
      // iOS 13+ requires permission
      // Check localStorage for previously granted permission
      const wasGranted = this.isCompassPermissionGranted();
      if (wasGranted) {
        // Verify compass is actually working
        this.verifyCompassFunctionality().then(isWorking => {
          if (!isWorking) {
            // Permission was granted but compass not working - likely revoked or blocked
            this.compassPermission.set(PermissionStatus.DENIED);
            this.saveCompassPermission(false);
          } else {
            this.compassPermission.set(PermissionStatus.GRANTED);
          }
        }).catch(() => {
          // If verification fails, assume it's still granted but log it
          this.compassPermission.set(PermissionStatus.GRANTED);
        });
      } else {
        this.compassPermission.set(PermissionStatus.NOT_REQUESTED);
      }
    } else {
      // Non-iOS devices, permission is implicit
      this.compassPermission.set(PermissionStatus.GRANTED);
    }
  }

  /**
   * Verify that compass is actually working (not just permission granted)
   */
  private async verifyCompassFunctionality(): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      if (!this.compassSupported()) {
        resolve(false);
        return;
      }

      let hasReceivedData = false;
      let timeoutId: number | null = null;

      const eventName = 'ondeviceorientationabsolute' in window
        ? 'deviceorientationabsolute'
        : 'deviceorientation';

      const handleOrientation = (event: DeviceOrientationEvent) => {
        // Check if we're receiving valid data
        const hasValidData = event.alpha !== null && 
                            !isNaN(event.alpha) || 
                            ((event as any).webkitCompassHeading !== undefined && 
                             (event as any).webkitCompassHeading !== null);

        if (hasValidData) {
          hasReceivedData = true;
          if (timeoutId !== null) {
            clearTimeout(timeoutId);
            timeoutId = null;
          }
          window.removeEventListener(eventName, handleOrientation);
          resolve(true);
        }
      };

      window.addEventListener(eventName, handleOrientation, { passive: true });

      // If no data received within 2 seconds, consider it not working
      timeoutId = window.setTimeout(() => {
        window.removeEventListener(eventName, handleOrientation);
        resolve(hasReceivedData);
      }, 2000);
    });
  }

  /**
   * Request compass/motion permission
   */
  async requestCompassPermission(): Promise<boolean> {
    if (!this.compassSupported()) {
      this.compassPermission.set(PermissionStatus.NOT_SUPPORTED);
      return false;
    }

    // Check if iOS permission request is needed
    if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
      try {
        const response = await (DeviceOrientationEvent as any).requestPermission();
        const granted = response === 'granted';
        
        if (granted) {
          this.compassPermission.set(PermissionStatus.GRANTED);
          this.saveCompassPermission(true);
        } else {
          this.compassPermission.set(PermissionStatus.DENIED);
          this.saveCompassPermission(false);
        }
        
        return granted;
      } catch (e) {
        Logger.warn('Failed to request compass permission', e);
        this.compassPermission.set(PermissionStatus.DENIED);
        this.saveCompassPermission(false);
        return false;
      }
    }

    // For non-iOS devices, permission is implicit
    this.compassPermission.set(PermissionStatus.GRANTED);
    this.saveCompassPermission(true);
    return true;
  }

  /**
   * Check if compass permission was previously granted (from localStorage)
   */
  private isCompassPermissionGranted(): boolean {
    if (typeof localStorage === 'undefined') {
      return false;
    }

    try {
      const stored = localStorage.getItem('qibla_compass_permission_granted');
      return stored === 'true';
    } catch (e) {
      return false;
    }
  }

  /**
   * Save compass permission state to localStorage
   */
  private saveCompassPermission(granted: boolean): void {
    if (typeof localStorage === 'undefined') {
      return;
    }

    try {
      localStorage.setItem('qibla_compass_permission_granted', granted ? 'true' : 'false');
    } catch (e) {
      Logger.warn('Failed to save compass permission to localStorage', e);
    }
  }

  /**
   * Get human-readable permission status text
   */
  getPermissionStatusText(status: PermissionStatus): string {
    switch (status) {
      case PermissionStatus.GRANTED:
        return 'Allowed';
      case PermissionStatus.DENIED:
        return 'Denied';
      case PermissionStatus.PROMPT:
        return 'Not Requested';
      case PermissionStatus.NOT_REQUESTED:
        return 'Not Requested';
      case PermissionStatus.NOT_SUPPORTED:
        return 'Not Supported';
      default:
        return 'Unknown';
    }
  }

  /**
   * Update compass permission state when it stops working
   * Called from components when compass errors occur
   */
  markCompassAsNotWorking(): void {
    this.compassPermission.set(PermissionStatus.DENIED);
    this.saveCompassPermission(false);
  }
}

