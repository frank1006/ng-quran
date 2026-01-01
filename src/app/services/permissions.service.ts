import { Injectable, signal, computed } from '@angular/core';
import { Observable, from } from 'rxjs';
import { map, catchError } from 'rxjs/operators';

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
   * Check location permission status
   */
  private checkLocationPermission(): void {
    if (!navigator.geolocation) {
      this.locationPermission.set(PermissionStatus.NOT_SUPPORTED);
      return;
    }

    // Geolocation API doesn't have a direct permission query API
    // We'll try to get the current position to check permission
    // But we'll use a timeout to avoid blocking
    navigator.geolocation.getCurrentPosition(
      () => {
        this.locationPermission.set(PermissionStatus.GRANTED);
      },
      (error: GeolocationPositionError) => {
        if (error.code === error.PERMISSION_DENIED) {
          this.locationPermission.set(PermissionStatus.DENIED);
        } else {
          // Could be unavailable or timeout, but permission might still be prompt
          this.locationPermission.set(PermissionStatus.PROMPT);
        }
      },
      { timeout: 100, maximumAge: Infinity }
    );
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
        this.compassPermission.set(PermissionStatus.GRANTED);
      } else {
        this.compassPermission.set(PermissionStatus.NOT_REQUESTED);
      }
    } else {
      // Non-iOS devices, permission is implicit
      this.compassPermission.set(PermissionStatus.GRANTED);
    }
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
        console.warn('Failed to request compass permission', e);
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
      console.warn('Failed to save compass permission to localStorage', e);
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
}

