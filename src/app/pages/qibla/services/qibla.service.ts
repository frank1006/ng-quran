import { Injectable } from '@angular/core';
import { Observable, fromEvent } from 'rxjs';
import { map } from 'rxjs/operators';

/**
 * Makkah (Kaaba) coordinates
 */
const MAKKAH_COORDINATES = {
  latitude: 21.4225,
  longitude: 39.8262
} as const;

/**
 * Compass direction states
 */
export enum CompassInstruction {
  TURN_LEFT = 'Turn to your left',
  TURN_RIGHT = 'Turn to your right',
  FACING_MAKKAH = "You're facing Makkah"
}

/**
 * Location info from reverse geocoding
 */
export interface GeocodingLocationInfo {
  city: string;
  country: string;
}

/**
 * Qibla calculation result
 */
export interface QiblaData {
  qiblaBearing: number; // Bearing from user location to Makkah (0-360)
  currentHeading: number | null; // Device heading (0-360)
  angleDifference: number; // Difference between heading and qibla bearing (-180 to 180)
  instruction: CompassInstruction;
  cityName: string;
}

/**
 * Local storage key for compass permission
 */
const COMPASS_PERMISSION_KEY = 'qibla_compass_permission_granted';

@Injectable({
  providedIn: 'root'
})
export class QiblaService {
  /**
   * Calculate Qibla bearing (direction) from user's location to Makkah
   * Uses spherical law of cosines formula
   */
  calculateQiblaBearing(userLat: number, userLon: number): number {
    const lat1 = this.toRadians(userLat);
    const lat2 = this.toRadians(MAKKAH_COORDINATES.latitude);
    const deltaLon = this.toRadians(MAKKAH_COORDINATES.longitude - userLon);

    const y = Math.sin(deltaLon) * Math.cos(lat2);
    const x =
      Math.cos(lat1) * Math.sin(lat2) -
      Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLon);

    const bearing = Math.atan2(y, x);
    const bearingDegrees = this.toDegrees(bearing);

    // Normalize to 0-360
    return (bearingDegrees + 360) % 360;
  }

  /**
   * Save compass permission state to localStorage
   */
  private saveCompassPermission(granted: boolean): void {
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(COMPASS_PERMISSION_KEY, granted ? 'true' : 'false');
      } catch (e) {
        console.warn('Failed to save compass permission to localStorage', e);
      }
    }
  }

  /**
   * Load compass permission state from localStorage
   */
  private loadCompassPermission(): boolean | null {
    if (typeof localStorage === 'undefined') {
      return null;
    }
    try {
      const stored = localStorage.getItem(COMPASS_PERMISSION_KEY);
      return stored === 'true' ? true : stored === 'false' ? false : null;
    } catch (e) {
      console.warn('Failed to load compass permission from localStorage', e);
      return null;
    }
  }

  /**
   * Check if compass permission was previously granted
   */
  isCompassPermissionGranted(): boolean {
    return this.loadCompassPermission() === true;
  }

  /**
   * Check if device orientation API is supported
   */
  isDeviceOrientationSupported(): boolean {
    return typeof window !== 'undefined' && !!window.DeviceOrientationEvent;
  }

  /**
   * Request compass permission (for iOS 13+)
   * Returns a Promise that resolves to true if permission was granted
   */
  async requestCompassPermission(): Promise<boolean> {
    if (!this.isDeviceOrientationSupported()) {
      return false;
    }

    // Check if iOS permission request is needed
    if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
      try {
        const response = await (DeviceOrientationEvent as any).requestPermission();
        const granted = response === 'granted';
        this.saveCompassPermission(granted);
        return granted;
      } catch (e) {
        console.warn('Failed to request compass permission', e);
        this.saveCompassPermission(false);
        return false;
      }
    }

    // For non-iOS devices, permission is implicitly granted
    this.saveCompassPermission(true);
    return true;
  }

  /**
   * Get device compass heading using Device Orientation API
   * Uses magnetometer (compass) primarily, with gyroscope and accelerometer for enhanced accuracy
   * The Device Orientation API automatically uses available sensors:
   * - Magnetometer: compass heading (alpha)
   * - Gyroscope: rotation rate (smoother tracking)
   * - Accelerometer: device tilt compensation
   *
   * Automatically checks for saved permission and requests if needed
   */
  getDeviceHeading(): Observable<number | null> {
    return new Observable<number | null>((observer) => {
      if (!this.isDeviceOrientationSupported()) {
        observer.next(null);
        observer.complete();
        return;
      }

      let cleanup: (() => void) | null = null;

      // Check if permission was previously granted
      const savedPermission = this.loadCompassPermission();
      const needsPermissionRequest = typeof (DeviceOrientationEvent as any).requestPermission === 'function';

      // For non-iOS devices, permission is implicit
      if (!needsPermissionRequest) {
        this.saveCompassPermission(true);
        cleanup = this.setupOrientationListener(observer);
        return () => {
          if (cleanup) {
            cleanup();
          }
        };
      }

      // For iOS devices, check if permission was previously granted
      if (savedPermission === true) {
        // Permission was previously granted, try to start listening
        // If it fails, the observer will receive null
        try {
          cleanup = this.setupOrientationListener(observer);
        } catch (e) {
          // If setup fails, permission might have been revoked
          this.saveCompassPermission(false);
          observer.next(null);
          observer.complete();
        }
        return () => {
          if (cleanup) {
            cleanup();
          }
        };
      }

      // Permission not granted yet - will be requested via requestCompassPermission()
      // Return an observable that completes immediately
      // The component should call requestCompassPermission() first
      observer.next(null);
      observer.complete();
      return;
    });
  }

  /**
   * Setup orientation event listener
   * Uses 'deviceorientationabsolute' if available for more accurate readings
   * Falls back to 'deviceorientation' if absolute is not supported
   *
   * Properly handles coordinate system conversion to ensure consistent heading
   */
  private setupOrientationListener(
    observer: { next: (value: number | null) => void; complete: () => void }
  ): () => void {
    let lastHeading: number | null = null;
    let rafId: number | null = null;
    let pendingHeading: number | null = null;
    let isActive = true;
    let isAbsolute = false;
    let firstReading = true;

    // Determine which event to use (absolute is preferred)
    const eventName = 'ondeviceorientationabsolute' in window
      ? 'deviceorientationabsolute'
      : 'deviceorientation';

    // Use requestAnimationFrame to throttle updates for better performance
    const updateHeading = () => {
      if (!isActive) return;

      if (pendingHeading !== null) {
        observer.next(pendingHeading);
        pendingHeading = null;
      }
      rafId = requestAnimationFrame(updateHeading);
    };

    // Start the animation frame loop
    rafId = requestAnimationFrame(updateHeading);

    const handleOrientation = (event: DeviceOrientationEvent) => {
      // Priority order for heading:
      // 1. webkitCompassHeading (iOS-specific, most accurate compass reading)
      // 2. alpha (standard DeviceOrientationEvent, fallback)
      //
      // DeviceOrientationEvent coordinate system:
      // - Alpha: rotation around z-axis (0-360°) - compass direction
      // - Beta: rotation around x-axis (front-to-back tilt)
      // - Gamma: rotation around y-axis (left-to-right tilt)
      //
      // For absolute orientation:
      // - Alpha: 0° = North, 90° = East, 180° = South, 270° = West (clockwise)
      //
      // iOS webkitCompassHeading:
      // - Direct compass reading (0-360°)
      // - 0° = North, 90° = East, 180° = South, 270° = West (clockwise)
      // - More accurate than alpha on iOS devices

      let heading: number | null = null;

      // Check for iOS webkitCompassHeading first (most accurate)
      if ((event as any).webkitCompassHeading !== undefined && (event as any).webkitCompassHeading !== null) {
        heading = (event as any).webkitCompassHeading;
      }
      // Fall back to standard alpha
      else if (event.alpha !== null && !isNaN(event.alpha)) {
        heading = event.alpha;

        // Detect if this is absolute orientation on first reading
        if (firstReading) {
          isAbsolute = (event as any).absolute === true || eventName === 'deviceorientationabsolute';
          firstReading = false;
        }

        // For non-absolute orientation, alpha might need adjustment
        // This is a fallback - absolute orientation is preferred
        if (!isAbsolute) {
          // On some devices, we may need to adjust alpha
          // For now, use it as-is and rely on absolute events when available
        }
      } else {
        // No heading available
        if (firstReading) {
          observer.next(null);
          firstReading = false;
        }
        return;
      }

      // Validate heading is a number
      if (heading === null || isNaN(heading)) {
        return;
      }

      // Normalize to 0-360 range (ensures consistent output)
      heading = heading % 360;
      if (heading < 0) heading += 360;

      // On first reading, use it directly without smoothing
      // This ensures consistent starting point on page refresh
      if (lastHeading === null) {
        lastHeading = heading;
        pendingHeading = Math.round(heading * 10) / 10;
        return;
      }

      // Smooth out rapid changes to reduce jitter
      // Only apply smoothing after first reading to ensure consistent initial state
      let diff = heading - lastHeading;

      // Handle wraparound (e.g., 359° to 1° = 2° change, not 358°)
      if (diff > 180) {
        diff -= 360;
      } else if (diff < -180) {
        diff += 360;
      }

      // Apply smoothing (reduces jitter while maintaining responsiveness)
      // Reduced smoothing factor from 0.3 to 0.15 for more responsive updates
      heading = lastHeading + diff * 0.15; // 15% of change applied

      // Normalize again after smoothing
      heading = heading % 360;
      if (heading < 0) heading += 360;

      lastHeading = heading;
      // Queue update for next animation frame (throttles to ~60fps)
      pendingHeading = Math.round(heading * 10) / 10;
    };

    window.addEventListener(eventName, handleOrientation, { passive: true });

    // Return cleanup function
    return () => {
      isActive = false;
      window.removeEventListener(eventName, handleOrientation);
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    };
  }

  /**
   * Calculate angle difference between current heading and Qibla direction
   * Returns value between -180 and 180
   */
  calculateAngleDifference(currentHeading: number, qiblaBearing: number): number {
    let diff = qiblaBearing - currentHeading;

    // Normalize to -180 to 180 range
    if (diff > 180) {
      diff -= 360;
    } else if (diff < -180) {
      diff += 360;
    }

    return diff;
  }

  /**
   * Get instruction based on angle difference
   */
  getInstruction(angleDifference: number, tolerance: number = 15): CompassInstruction {
    if (Math.abs(angleDifference) <= tolerance) {
      return CompassInstruction.FACING_MAKKAH;
    }

    if (angleDifference > 0) {
      return CompassInstruction.TURN_RIGHT;
    } else {
      return CompassInstruction.TURN_LEFT;
    }
  }

  private cityNameCache: Map<string, string> = new Map();
  private readonly CACHE_PRECISION = 2; // Cache precision in decimal degrees (~111 meters)

  private locationInfoCache: Map<string, GeocodingLocationInfo> = new Map();

  /**
   * Get city name and country from coordinates (reverse geocoding) with caching
   * Only makes API request if location info is not cached for nearby coordinates
   */
  async getLocationInfo(latitude: number, longitude: number): Promise<GeocodingLocationInfo> {
    // Create cache key based on rounded coordinates
    const cacheKey = this.getCacheKey(latitude, longitude);

    // Check cache first
    if (this.locationInfoCache.has(cacheKey)) {
      return this.locationInfoCache.get(cacheKey)!;
    }

    try {
      // Using OpenStreetMap Nominatim API for reverse geocoding
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=10&addressdetails=1`,
        {
          headers: {
            'User-Agent': 'QuranApp/1.0'
          }
        }
      );

      const data = await response.json();

      let cityName = 'Unknown Location';
      let countryName = 'Unknown Country';

      if (data.address) {
        // Try city, town, village, or municipality
        cityName = (
          data.address.city ||
          data.address.town ||
          data.address.village ||
          data.address.municipality ||
          data.address.state ||
          'Unknown Location'
        );

        // Get country name
        countryName = data.address.country || 'Unknown Country';
      }

      const locationInfo: GeocodingLocationInfo = {
        city: cityName,
        country: countryName
      };

      // Cache the result
      this.locationInfoCache.set(cacheKey, locationInfo);

      return locationInfo;
    } catch (error) {
      console.error('Error getting location info:', error);
      return {
        city: 'Unknown Location',
        country: 'Unknown Country'
      };
    }
  }

  /**
   * Get city name from coordinates (reverse geocoding) with caching
   * Only makes API request if city name is not cached for nearby coordinates
   * @deprecated Use getLocationInfo instead
   */
  async getCityName(latitude: number, longitude: number): Promise<string> {
    const locationInfo = await this.getLocationInfo(latitude, longitude);
    return locationInfo.city;
  }

  /**
   * Generate cache key from coordinates with precision rounding
   */
  private getCacheKey(latitude: number, longitude: number): string {
    const roundedLat = Math.round(latitude * Math.pow(10, this.CACHE_PRECISION)) / Math.pow(10, this.CACHE_PRECISION);
    const roundedLon = Math.round(longitude * Math.pow(10, this.CACHE_PRECISION)) / Math.pow(10, this.CACHE_PRECISION);
    return `${roundedLat},${roundedLon}`;
  }

  /**
   * Convert degrees to radians
   */
  private toRadians(degrees: number): number {
    return (degrees * Math.PI) / 180;
  }

  /**
   * Convert radians to degrees
   */
  private toDegrees(radians: number): number {
    return (radians * 180) / Math.PI;
  }
}

