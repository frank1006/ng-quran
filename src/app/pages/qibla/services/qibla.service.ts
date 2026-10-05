import { Injectable, isDevMode } from '@angular/core';
import { Observable, fromEvent } from 'rxjs';
import { map } from 'rxjs/operators';
import { normalizeQuadrant, normalizeCity, normalizeCountry } from '../../../core/location.util';
import { Logger } from '../../../core/logger.util';

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
  quadrant: string;
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

/** Error message emitted when the device only provides relative orientation. */
export const NO_ABSOLUTE_COMPASS = 'NO_ABSOLUTE_COMPASS';

/**
 * Converts orientation readings to a clockwise compass heading from north (0-360).
 * iOS reports webkitCompassHeading (already clockwise); others report alpha, which grows
 * counter-clockwise. Relative (non-absolute) alpha has no fixed north, so it returns null.
 */
export function toCompassHeading(
  reading: { alpha: number | null; webkitCompassHeading?: number | null },
  isAbsolute: boolean
): number | null {
  let heading: number;
  if (reading.webkitCompassHeading !== undefined && reading.webkitCompassHeading !== null) {
    heading = reading.webkitCompassHeading;
  } else if (reading.alpha !== null && !isNaN(reading.alpha) && isAbsolute) {
    heading = 360 - reading.alpha;
  } else {
    return null;
  }
  heading = heading % 360;
  return heading < 0 ? heading + 360 : heading;
}

@Injectable({
  providedIn: 'root'
})
export class QiblaService {
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
    return (bearingDegrees + 360) % 360;
  }

  private saveCompassPermission(granted: boolean): void {
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(COMPASS_PERMISSION_KEY, granted ? 'true' : 'false');
      } catch (e) {
        Logger.warn('Failed to save compass permission to localStorage', e);
      }
    }
  }

  private loadCompassPermission(): boolean | null {
    if (typeof localStorage === 'undefined') {
      return null;
    }
    try {
      const stored = localStorage.getItem(COMPASS_PERMISSION_KEY);
      return stored === 'true' ? true : stored === 'false' ? false : null;
    } catch (e) {
      Logger.warn('Failed to load compass permission from localStorage', e);
      return null;
    }
  }

  isCompassPermissionGranted(): boolean {
    return this.loadCompassPermission() === true;
  }

  /** iOS Safari needs DeviceOrientationEvent.requestPermission() from a user tap on every launch. */
  requiresPermissionGesture(): boolean {
    return this.isDeviceOrientationSupported() &&
      typeof (DeviceOrientationEvent as any).requestPermission === 'function';
  }

  isDeviceOrientationSupported(): boolean {
    return typeof window !== 'undefined' && !!window.DeviceOrientationEvent;
  }

  async requestCompassPermission(): Promise<boolean> {
    if (!this.isDeviceOrientationSupported()) {
      return false;
    }

    if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
      try {
        const response = await (DeviceOrientationEvent as any).requestPermission();
        const granted = response === 'granted';
        this.saveCompassPermission(granted);
        return granted;
      } catch {
        this.saveCompassPermission(false);
        return false;
      }
    }

    this.saveCompassPermission(true);
    return true;
  }

  getDeviceHeading(): Observable<number | null> {
    return new Observable<number | null>((observer) => {
      if (!this.isDeviceOrientationSupported()) {
        observer.next(null);
        observer.complete();
        return;
      }

      let cleanup: (() => void) | null = null;

      const savedPermission = this.loadCompassPermission();
      const needsPermissionRequest = typeof (DeviceOrientationEvent as any).requestPermission === 'function';

      if (!needsPermissionRequest) {
        this.saveCompassPermission(true);
        cleanup = this.setupOrientationListener(observer);
        return () => cleanup?.();
      }

      if (savedPermission === true) {
        try {
          cleanup = this.setupOrientationListener(observer);
        } catch (e) {
          this.saveCompassPermission(false);
          observer.next(null);
          observer.complete();
        }
        return () => cleanup?.();
      }

      observer.next(null);
      observer.complete();
      return;
    });
  }

  private setupOrientationListener(
    observer: { next: (value: number | null) => void; error: (err: unknown) => void; complete: () => void }
  ): () => void {
    let lastHeading: number | null = null;
    let rafId: number | null = null;
    let pendingHeading: number | null = null;
    let isActive = true;
    let isAbsolute = false;
    let firstReading = true;

    const eventName = 'ondeviceorientationabsolute' in window
      ? 'deviceorientationabsolute'
      : 'deviceorientation';

    const updateHeading = () => {
      if (!isActive) return;
      if (pendingHeading !== null) {
        observer.next(pendingHeading);
        pendingHeading = null;
      }
      rafId = requestAnimationFrame(updateHeading);
    };

    rafId = requestAnimationFrame(updateHeading);

    const handleOrientation = (event: DeviceOrientationEvent) => {
      let heading: number | null = null;

      const iosHeading = (event as any).webkitCompassHeading;
      if (iosHeading === undefined || iosHeading === null) {
        if (event.alpha !== null && !isNaN(event.alpha) && firstReading) {
          isAbsolute = (event as any).absolute === true || eventName === 'deviceorientationabsolute';
          firstReading = false;
          if (!isAbsolute) {
            // Relative orientation starts at an arbitrary direction, not north: unusable for Qibla
            observer.error(new Error(NO_ABSOLUTE_COMPASS));
            return;
          }
        }
      }
      heading = toCompassHeading({ alpha: event.alpha, webkitCompassHeading: iosHeading }, isAbsolute);

      if (heading === null || isNaN(heading)) {
        if (firstReading) {
          observer.next(null);
          firstReading = false;
        }
        return;
      }

      if (lastHeading === null) {
        lastHeading = heading;
        pendingHeading = Math.round(heading * 10) / 10;
        return;
      }

      let diff = heading - lastHeading;
      if (diff > 180) {
        diff -= 360;
      } else if (diff < -180) {
        diff += 360;
      }

      heading = lastHeading + diff * 0.15;
      heading = heading % 360;
      if (heading < 0) heading += 360;

      lastHeading = heading;
      pendingHeading = Math.round(heading * 10) / 10;
    };

    window.addEventListener(eventName, handleOrientation, { passive: true });

    return () => {
      isActive = false;
      window.removeEventListener(eventName, handleOrientation);
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    };
  }

  calculateAngleDifference(currentHeading: number, qiblaBearing: number): number {
    let diff = qiblaBearing - currentHeading;
    if (diff > 180) {
      diff -= 360;
    } else if (diff < -180) {
      diff += 360;
    }
    return diff;
  }

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

  private readonly CACHE_PRECISION = 2;
  private readonly STORAGE_KEY = 'location-info-cache';
  private readonly CACHE_VERSION = '1.0.0';
  private readonly CACHE_EXPIRY_DAYS = 7; // Cache expires after 7 days
  private locationInfoCache: Map<string, GeocodingLocationInfo> = new Map();

  async getLocationInfo(latitude: number, longitude: number): Promise<GeocodingLocationInfo> {
    // Validate coordinates
    if (!this.isValidCoordinate(latitude, longitude)) {
      const fallback: GeocodingLocationInfo = {
        quadrant: '',
        city: 'Unknown Location',
        country: 'Unknown Country'
      };
      
      // Try to return previously cached location if available
      const lastKnown = this.getLastKnownLocation();
      return lastKnown || fallback;
    }

    const cacheKey = this.getCacheKey(latitude, longitude);

    // Check in-memory cache first
    if (this.locationInfoCache.has(cacheKey)) {
      return this.locationInfoCache.get(cacheKey)!;
    }

    // Check persistent cache (localStorage)
    const cached = this.getCachedLocationInfo(cacheKey);
    if (cached) {
      this.locationInfoCache.set(cacheKey, cached);
      return cached;
    }

    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=10&addressdetails=1`,
        {
          headers: {
            'User-Agent': 'QuranApp/1.0'
          }
        }
      );

      if (!response.ok) {
        throw new Error(`Geocoding API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      // Extract location info using normalization utilities
      const address = data.address || {};
      const quadrant = normalizeQuadrant(address);
      const city = normalizeCity(address);
      const country = normalizeCountry(address);

      const locationInfo: GeocodingLocationInfo = {
        quadrant,
        city,
        country
      };

      // Cache in memory and persistent storage
      this.locationInfoCache.set(cacheKey, locationInfo);
      this.setCachedLocationInfo(cacheKey, locationInfo);

      return locationInfo;
    } catch (error) {
      if (isDevMode()) {
        Logger.error('Error getting location info:', error);
      }
      
      // Return fallback with empty quadrant
      const fallback: GeocodingLocationInfo = {
        quadrant: '',
        city: 'Unknown Location',
        country: 'Unknown Country'
      };
      
      // Try to return previously cached location if available
      const lastKnown = this.getLastKnownLocation();
      if (lastKnown) {
        return lastKnown;
      }
      
      return fallback;
    }
  }

  async getCityName(latitude: number, longitude: number): Promise<string> {
    const locationInfo = await this.getLocationInfo(latitude, longitude);
    return locationInfo.city;
  }

  private getCacheKey(latitude: number, longitude: number): string {
    const roundedLat = Math.round(latitude * Math.pow(10, this.CACHE_PRECISION)) / Math.pow(10, this.CACHE_PRECISION);
    const roundedLon = Math.round(longitude * Math.pow(10, this.CACHE_PRECISION)) / Math.pow(10, this.CACHE_PRECISION);
    return `${roundedLat},${roundedLon}`;
  }

  /**
   * Get cached location info from localStorage
   */
  private getCachedLocationInfo(cacheKey: string): GeocodingLocationInfo | null {
    try {
      if (typeof localStorage === 'undefined') {
        return null;
      }

      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (!stored) {
        return null;
      }

      const data = JSON.parse(stored);
      
      // Check version compatibility
      if (data.version !== this.CACHE_VERSION) {
        this.clearLocationCache();
        return null;
      }

      // Check cache expiry
      if (data.timestamp) {
        const cacheDate = new Date(data.timestamp);
        const daysSinceCache = (Date.now() - cacheDate.getTime()) / (1000 * 60 * 60 * 24);
        
        if (daysSinceCache > this.CACHE_EXPIRY_DAYS) {
          this.clearLocationCache();
          return null;
        }
      }

      // Return cached location for this key
      const cachedEntry = data.cache?.[cacheKey];
      if (cachedEntry) {
        // Ensure backward compatibility - add quadrant if missing
        return {
          quadrant: cachedEntry.quadrant || '',
          city: cachedEntry.city || 'Unknown Location',
          country: cachedEntry.country || 'Unknown Country'
        };
      }

      return null;
    } catch (error) {
      if (isDevMode()) {
        Logger.error('Error reading location cache from localStorage:', error);
      }
      return null;
    }
  }

  /**
   * Save location info to localStorage cache
   */
  private setCachedLocationInfo(cacheKey: string, locationInfo: GeocodingLocationInfo): void {
    try {
      if (typeof localStorage === 'undefined') {
        return;
      }

      let cacheData: any = {
        version: this.CACHE_VERSION,
        timestamp: new Date().toISOString(),
        cache: {}
      };

      // Load existing cache
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        try {
          const existing = JSON.parse(stored);
          if (existing.version === this.CACHE_VERSION && existing.cache) {
            cacheData.cache = existing.cache;
          }
        } catch (e) {
          // If parsing fails, start fresh
        }
      }

      // Add/update entry
      cacheData.cache[cacheKey] = locationInfo;

      // Clean up old entries (keep last 50 entries)
      const entries = Object.entries(cacheData.cache);
      if (entries.length > 50) {
        // Keep most recent entries
        const sorted = entries.slice(-50);
        cacheData.cache = Object.fromEntries(sorted);
      }

      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(cacheData));
    } catch (error) {
      if (isDevMode()) {
        Logger.error('Error saving location cache to localStorage:', error);
      }
      // Silently fail - in-memory cache will still work
    }
  }

  /**
   * Get last known location from cache (fallback when API fails)
   */
  private getLastKnownLocation(): GeocodingLocationInfo | null {
    try {
      if (typeof localStorage === 'undefined') {
        return null;
      }

      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (!stored) {
        return null;
      }

      const data = JSON.parse(stored);
      if (data.version !== this.CACHE_VERSION || !data.cache) {
        return null;
      }

      // Get the most recent entry
      const entries = Object.entries(data.cache);
      if (entries.length > 0) {
        const lastEntry = entries[entries.length - 1][1] as any;
        return {
          quadrant: lastEntry.quadrant || '',
          city: lastEntry.city || 'Unknown Location',
          country: lastEntry.country || 'Unknown Country'
        };
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Clear location cache
   */
  private clearLocationCache(): void {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(this.STORAGE_KEY);
      }
      this.locationInfoCache.clear();
    } catch (error) {
      if (isDevMode()) {
        Logger.error('Error clearing location cache:', error);
      }
    }
  }

  private toRadians(degrees: number): number {
    return (degrees * Math.PI) / 180;
  }

  private toDegrees(radians: number): number {
    return (radians * 180) / Math.PI;
  }

  /**
   * Validate GPS coordinates
   */
  private isValidCoordinate(lat: number, lon: number): boolean {
    return (
      typeof lat === 'number' &&
      typeof lon === 'number' &&
      !isNaN(lat) &&
      !isNaN(lon) &&
      isFinite(lat) &&
      isFinite(lon) &&
      lat >= -90 && lat <= 90 &&
      lon >= -180 && lon <= 180
    );
  }
}

