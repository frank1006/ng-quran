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
        console.warn('Failed to save compass permission to localStorage', e);
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
      console.warn('Failed to load compass permission from localStorage', e);
      return null;
    }
  }

  isCompassPermissionGranted(): boolean {
    return this.loadCompassPermission() === true;
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
      } catch (e) {
        console.warn('Failed to request compass permission', e);
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
    observer: { next: (value: number | null) => void; complete: () => void }
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

      if ((event as any).webkitCompassHeading !== undefined && (event as any).webkitCompassHeading !== null) {
        heading = (event as any).webkitCompassHeading;
      } else if (event.alpha !== null && !isNaN(event.alpha)) {
        heading = event.alpha;
        if (firstReading) {
          isAbsolute = (event as any).absolute === true || eventName === 'deviceorientationabsolute';
          firstReading = false;
        }
      } else {
        if (firstReading) {
          observer.next(null);
          firstReading = false;
        }
        return;
      }

      if (heading === null || isNaN(heading)) {
        return;
      }

      heading = heading % 360;
      if (heading < 0) heading += 360;

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
  private locationInfoCache: Map<string, GeocodingLocationInfo> = new Map();

  async getLocationInfo(latitude: number, longitude: number): Promise<GeocodingLocationInfo> {
    const cacheKey = this.getCacheKey(latitude, longitude);

    if (this.locationInfoCache.has(cacheKey)) {
      return this.locationInfoCache.get(cacheKey)!;
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

      const data = await response.json();

      let cityName = 'Unknown Location';
      let countryName = 'Unknown Country';

      if (data.address) {
        cityName = (
          data.address.city ||
          data.address.town ||
          data.address.village ||
          data.address.municipality ||
          data.address.state ||
          'Unknown Location'
        );
        countryName = data.address.country || 'Unknown Country';
      }

      const locationInfo: GeocodingLocationInfo = {
        city: cityName,
        country: countryName
      };

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

  async getCityName(latitude: number, longitude: number): Promise<string> {
    const locationInfo = await this.getLocationInfo(latitude, longitude);
    return locationInfo.city;
  }

  private getCacheKey(latitude: number, longitude: number): string {
    const roundedLat = Math.round(latitude * Math.pow(10, this.CACHE_PRECISION)) / Math.pow(10, this.CACHE_PRECISION);
    const roundedLon = Math.round(longitude * Math.pow(10, this.CACHE_PRECISION)) / Math.pow(10, this.CACHE_PRECISION);
    return `${roundedLat},${roundedLon}`;
  }

  private toRadians(degrees: number): number {
    return (degrees * Math.PI) / 180;
  }

  private toDegrees(radians: number): number {
    return (radians * 180) / Math.PI;
  }
}

