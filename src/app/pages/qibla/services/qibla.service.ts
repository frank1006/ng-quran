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
   * Get device compass heading using Device Orientation API
   * Uses magnetometer (compass) primarily, with gyroscope and accelerometer for enhanced accuracy
   * The Device Orientation API automatically uses available sensors:
   * - Magnetometer: compass heading (alpha)
   * - Gyroscope: rotation rate (smoother tracking)
   * - Accelerometer: device tilt compensation
   */
  getDeviceHeading(): Observable<number | null> {
    return new Observable<number | null>((observer) => {
      if (!window.DeviceOrientationEvent) {
        observer.next(null);
        observer.complete();
        return;
      }

      let cleanup: (() => void) | null = null;

      // Request permission for iOS 13+ (required for gyroscope and magnetometer access)
      if (
        typeof (DeviceOrientationEvent as any).requestPermission === 'function'
      ) {
        (DeviceOrientationEvent as any)
          .requestPermission()
          .then((response: string) => {
            if (response === 'granted') {
              cleanup = this.setupOrientationListener(observer);
            } else {
              observer.next(null);
              observer.complete();
            }
          })
          .catch(() => {
            observer.next(null);
            observer.complete();
          });
      } else {
        cleanup = this.setupOrientationListener(observer);
      }

      // Return cleanup function
      return () => {
        if (cleanup) {
          cleanup();
        }
      };
    });
  }

  /**
   * Setup orientation event listener
   * Uses 'deviceorientationabsolute' if available for more accurate readings
   * Falls back to 'deviceorientation' if absolute is not supported
   */
  private setupOrientationListener(
    observer: { next: (value: number | null) => void; complete: () => void }
  ): () => void {
    let lastHeading: number | null = null;
    let rafId: number | null = null;
    let pendingHeading: number | null = null;
    let isActive = true;
    
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
      // Use alpha for compass heading (azimuth)
      // Alpha is the compass direction (0-360) from magnetometer
      // On iOS: alpha is device orientation relative to Earth
      // On Android: alpha is usually absolute (0° = North, 90° = East, 180° = South, 270° = West)
      // Beta is pitch (front-to-back tilt)
      // Gamma is roll (left-to-right tilt)
      
      if (event.alpha !== null && !isNaN(event.alpha)) {
        // Normalize to 0-360 range
        let heading = event.alpha;
        
        // Some devices report alpha in different coordinate systems
        // Convert to standard: 0° = North, 90° = East, 180° = South, 270° = West
        // If absolute orientation is available, alpha is already in this format
        // If relative, we may need adjustment
        
        // Ensure heading is in 0-360 range
        while (heading < 0) heading += 360;
        while (heading >= 360) heading -= 360;
        
        // Smooth out rapid changes to reduce jitter
        if (lastHeading !== null) {
          let diff = heading - lastHeading;
          
          // Handle wraparound (e.g., 359° to 1° = 2° change, not 358°)
          if (diff > 180) {
            diff -= 360;
          } else if (diff < -180) {
            diff += 360;
          }
          
          // Apply smoothing (reduces jitter while maintaining responsiveness)
          // Increased smoothing factor for better performance
          heading = lastHeading + diff * 0.25; // 25% of change applied (smoother)
          
          // Normalize again after smoothing
          while (heading < 0) heading += 360;
          while (heading >= 360) heading -= 360;
        }
        
        lastHeading = heading;
        // Queue update for next animation frame (throttles to ~60fps)
        pendingHeading = Math.round(heading * 10) / 10; // Round to 1 decimal place
      } else if (event.alpha === null) {
        // Device orientation might not be absolute
        console.warn('Device orientation alpha is null - compass may not work accurately');
      }
    };

    // Try absolute orientation first (better accuracy, uses more sensors)
    const eventName = 'ondeviceorientationabsolute' in window 
      ? 'deviceorientationabsolute' 
      : 'deviceorientation';
    
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

