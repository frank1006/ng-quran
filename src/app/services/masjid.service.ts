import { Injectable, isDevMode } from '@angular/core';
import { Observable, from, throwError, timer, of } from 'rxjs';
import { retryWhen, mergeMap, take, catchError, timeout, tap, shareReplay, finalize } from 'rxjs/operators';

/**
 * Mosque/Masjid data from Overpass API
 */
export interface Masjid {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  distance?: number; // Distance in kilometers
  address?: string;
  website?: string;
  phone?: string;
  openingHours?: string;
}

/**
 * Overpass API response structure
 */
interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: {
    lat: number;
    lon: number;
  };
  tags?: {
    name?: string;
    'name:en'?: string;
    'addr:full'?: string;
    'addr:street'?: string;
    'addr:city'?: string;
    'addr:postcode'?: string;
    website?: string;
    phone?: string;
    'opening_hours'?: string;
    amenity?: string;
    religion?: string;
  };
}

interface OverpassResponse {
  elements: OverpassElement[];
}

interface MasjidCacheEntry {
  masjids: Masjid[];
  timestamp: number;
  latitude: number;
  longitude: number;
  radius: number;
}

interface MasjidCacheData {
  [cacheKey: string]: MasjidCacheEntry;
}

@Injectable({
  providedIn: 'root'
})
export class MasjidService {
  // Multiple Overpass API endpoints for fallback
  private readonly OVERPASS_API_URLS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.openstreetmap.ru/api/interpreter'
  ];
  private readonly DEFAULT_RADIUS_KM = 1; // Default 5km radius
  private readonly MAX_RADIUS_KM = 50; // Maximum 50km radius
  private readonly MIN_RADIUS_KM = 1; // Minimum 1km radius
  private readonly REQUEST_TIMEOUT_MS = 30000; // 30 seconds timeout
  private readonly MAX_RETRIES = 2; // Try 2 additional times (3 total attempts)
  
  // Cache configuration
  private readonly STORAGE_KEY = 'masjid-cache';
  private readonly CACHE_VERSION = '1.0.0';
  private readonly CACHE_EXPIRY_HOURS = 24; // Cache expires after 24 hours
  private readonly CACHE_PRECISION = 2; // Round coordinates to 2 decimal places for cache key
  private readonly inMemoryCache: Map<string, MasjidCacheEntry> = new Map();
  
  // Request deduplication: track pending requests to prevent duplicate HTTP calls
  private readonly pendingRequests: Map<string, Observable<Masjid[]>> = new Map();

  /**
   * Calculate distance between two coordinates using Haversine formula
   */
  private calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number {
    const R = 6371; // Earth's radius in kilometers
    const dLat = this.toRadians(lat2 - lat1);
    const dLon = this.toRadians(lon2 - lon1);
    
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(lat1)) *
        Math.cos(this.toRadians(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in kilometers
  }

  private toRadians(degrees: number): number {
    return (degrees * Math.PI) / 180;
  }

  /**
   * Get nearby mosques/masjids using Overpass API with retry logic and fallback endpoints
   * @param latitude - User's latitude
   * @param longitude - User's longitude
   * @param radiusKm - Search radius in kilometers
   * @param forceRefresh - If true, bypass cache and fetch fresh data
   */
  getNearbyMasjids(
    latitude: number,
    longitude: number,
    radiusKm: number = this.DEFAULT_RADIUS_KM,
    forceRefresh: boolean = false
  ): Observable<Masjid[]> {
    // Clamp radius to valid range
    const clampedRadius = Math.max(
      this.MIN_RADIUS_KM,
      Math.min(this.MAX_RADIUS_KM, radiusKm)
    );

    const cacheKey = this.getCacheKey(latitude, longitude, clampedRadius);

    // Check cache first (unless force refresh)
    if (!forceRefresh) {
      const cached = this.getCachedMasjids(latitude, longitude, clampedRadius);
      if (cached) {
        return of(cached);
      }

      // Check if there's already a pending request for this key
      const pendingRequest = this.pendingRequests.get(cacheKey);
      if (pendingRequest) {
        return pendingRequest;
      }
    } else {
      // For force refresh, remove any pending request for this key
      this.pendingRequests.delete(cacheKey);
    }

    // Overpass API uses radius in meters
    const radiusMeters = clampedRadius * 1000;

    // Overpass QL query to find mosques/masjids
    // Searches for: amenity=place_of_worship + religion=muslim
    // Reduced timeout to 20 seconds to fail faster
    const query = `
      [out:json][timeout:20];
      (
        node["amenity"="place_of_worship"]["religion"="muslim"](around:${radiusMeters},${latitude},${longitude});
        way["amenity"="place_of_worship"]["religion"="muslim"](around:${radiusMeters},${latitude},${longitude});
        relation["amenity"="place_of_worship"]["religion"="muslim"](around:${radiusMeters},${latitude},${longitude});
      );
      out center meta;
    `.trim();

    // Create the request observable with shareReplay to deduplicate concurrent requests
    const request$ = this.tryEndpointsSequentially(query, latitude, longitude, clampedRadius).pipe(
      tap((masjids) => {
        // Cache the results after successful fetch
        this.setCachedMasjids(latitude, longitude, clampedRadius, masjids);
      }),
      shareReplay(1), // Share the result with all concurrent subscribers
      finalize(() => {
        // Remove from pending requests when complete (success or error)
        this.pendingRequests.delete(cacheKey);
      })
    );

    // Store the pending request to prevent duplicate calls
    this.pendingRequests.set(cacheKey, request$);

    return request$;
  }

  /**
   * Get cache key for location and radius
   */
  private getCacheKey(latitude: number, longitude: number, radiusKm: number): string {
    const roundedLat = Math.round(latitude * Math.pow(10, this.CACHE_PRECISION)) / Math.pow(10, this.CACHE_PRECISION);
    const roundedLon = Math.round(longitude * Math.pow(10, this.CACHE_PRECISION)) / Math.pow(10, this.CACHE_PRECISION);
    return `${roundedLat},${roundedLon},${radiusKm}`;
  }

  /**
   * Get cached masjids if available and not expired
   */
  private getCachedMasjids(latitude: number, longitude: number, radiusKm: number): Masjid[] | null {
    const cacheKey = this.getCacheKey(latitude, longitude, radiusKm);

    // Check in-memory cache first
    const inMemoryEntry = this.inMemoryCache.get(cacheKey);
    if (inMemoryEntry && !this.isCacheExpired(inMemoryEntry)) {
      return inMemoryEntry.masjids;
    }

    // Check localStorage cache
    try {
      if (typeof localStorage === 'undefined') {
        return null;
      }

      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (!stored) {
        return null;
      }

      const data: { version: string; cache: MasjidCacheData } = JSON.parse(stored);
      
      // Check version compatibility
      if (data.version !== this.CACHE_VERSION) {
        this.clearCache();
        return null;
      }

      const entry = data.cache[cacheKey];
      if (entry && !this.isCacheExpired(entry)) {
        // Update in-memory cache
        this.inMemoryCache.set(cacheKey, entry);
        return entry.masjids;
      }

      return null;
    } catch (error) {
      if (isDevMode()) {
        console.warn('Error reading masjid cache:', error);
      }
      return null;
    }
  }

  /**
   * Check if cache entry is expired
   */
  private isCacheExpired(entry: MasjidCacheEntry): boolean {
    const ageHours = (Date.now() - entry.timestamp) / (1000 * 60 * 60);
    return ageHours > this.CACHE_EXPIRY_HOURS;
  }

  /**
   * Save masjids to cache
   */
  private setCachedMasjids(
    latitude: number,
    longitude: number,
    radiusKm: number,
    masjids: Masjid[]
  ): void {
    const cacheKey = this.getCacheKey(latitude, longitude, radiusKm);
    const entry: MasjidCacheEntry = {
      masjids,
      timestamp: Date.now(),
      latitude,
      longitude,
      radius: radiusKm
    };

    // Update in-memory cache
    this.inMemoryCache.set(cacheKey, entry);

    // Save to localStorage
    try {
      if (typeof localStorage === 'undefined') {
        return;
      }

      let cacheData: { version: string; cache: MasjidCacheData } = {
        version: this.CACHE_VERSION,
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
      cacheData.cache[cacheKey] = entry;

      // Clean up old entries (keep last 20 entries)
      const entries = Object.entries(cacheData.cache);
      if (entries.length > 20) {
        // Sort by timestamp and keep most recent
        const sorted = entries.sort((a, b) => b[1].timestamp - a[1].timestamp);
        cacheData.cache = Object.fromEntries(sorted.slice(0, 20));
      }

      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(cacheData));
    } catch (error) {
      if (isDevMode()) {
        console.warn('Error saving masjid cache:', error);
      }
      // Silently fail - in-memory cache will still work
    }
  }

  /**
   * Clear all masjid cache
   */
  clearCache(): void {
    this.inMemoryCache.clear();
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(this.STORAGE_KEY);
      }
    } catch (error) {
      if (isDevMode()) {
        console.warn('Error clearing masjid cache:', error);
      }
    }
  }

  /**
   * Try each endpoint sequentially until one succeeds
   */
  private tryEndpointsSequentially(
    query: string,
    latitude: number,
    longitude: number,
    radiusKm: number
  ): Observable<Masjid[]> {
    let currentEndpointIndex = 0;

    const tryEndpoint = (endpointIndex: number): Observable<Masjid[]> => {
      if (endpointIndex >= this.OVERPASS_API_URLS.length) {
        return throwError(() => new Error('All Overpass API servers are busy. Please try again in a few moments.'));
      }

      const apiUrl = this.OVERPASS_API_URLS[endpointIndex];

      if (isDevMode()) {
        console.log(`Trying Overpass API endpoint ${endpointIndex + 1}/${this.OVERPASS_API_URLS.length}: ${apiUrl}`);
      }

      return from(
        fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: `data=${encodeURIComponent(query)}`,
        }).then(async (response) => {
          if (!response.ok) {
            // For 504 Gateway Timeout or 429 Too Many Requests, try next endpoint
            if (response.status === 504 || response.status === 429) {
              throw new Error(`SERVER_BUSY:${response.status}`);
            }
            throw new Error(`API_ERROR:${response.status}:${response.statusText}`);
          }
          const data: OverpassResponse = await response.json();
          const masjids = await this.processOverpassResponse(data, latitude, longitude);
          // Sort by distance (nearest first)
          return masjids.sort((a, b) => (a.distance || 0) - (b.distance || 0));
        }).catch((error) => {
          // Handle network errors
          if (error instanceof TypeError && error.message.includes('fetch')) {
            throw new Error('NETWORK_ERROR');
          }
          // Re-throw other errors
          throw error;
        })
      ).pipe(
        timeout(this.REQUEST_TIMEOUT_MS),
        retryWhen((errors) =>
          errors.pipe(
            mergeMap((error, attempt) => {
              const errorMessage = error.message || '';
              
              // If server is busy (504/429), try next endpoint immediately
              if (errorMessage.includes('SERVER_BUSY')) {
                if (isDevMode()) {
                  console.log(`Endpoint ${endpointIndex} is busy (${errorMessage}), trying next endpoint...`);
                }
                return tryEndpoint(endpointIndex + 1);
              }
              
              // For other errors, retry with exponential backoff (up to MAX_RETRIES)
              if (attempt < this.MAX_RETRIES) {
                const delay = Math.min(1000 * Math.pow(2, attempt), 5000); // Max 5 seconds
                if (isDevMode()) {
                  console.log(`Retrying endpoint ${endpointIndex} in ${delay}ms (attempt ${attempt + 1}/${this.MAX_RETRIES})...`);
                }
                return timer(delay);
              }
              
              // All retries exhausted for this endpoint, try next one
              if (isDevMode()) {
                console.log(`All retries failed for endpoint ${endpointIndex}, trying next endpoint...`);
              }
              return tryEndpoint(endpointIndex + 1);
            }),
            take(this.MAX_RETRIES * this.OVERPASS_API_URLS.length)
          )
        ),
        catchError((error) => {
          // If this endpoint failed, try next one
          const nextIndex = endpointIndex + 1;
          if (nextIndex < this.OVERPASS_API_URLS.length) {
            return tryEndpoint(nextIndex);
          }
          
          // All endpoints failed
          const errorMessage = error.message || '';
          if (errorMessage.includes('NETWORK_ERROR')) {
            return throwError(() => new Error('Network error. Please check your internet connection.'));
          }
          if (errorMessage.includes('SERVER_BUSY')) {
            return throwError(() => new Error('The Overpass API servers are too busy. Please try again in a few moments.'));
          }
          return throwError(() => new Error('Failed to fetch mosque data. Please try again.'));
        })
      );
    };

    return tryEndpoint(0);
  }

  /**
   * Process Overpass API response and convert to Masjid objects
   */
  private async processOverpassResponse(
    data: OverpassResponse,
    userLat: number,
    userLon: number
  ): Promise<Masjid[]> {
    const masjids: Masjid[] = [];

    for (const element of data.elements) {
      // Skip if not a place of worship or not Muslim
      if (
        element.tags?.amenity !== 'place_of_worship' ||
        element.tags?.religion !== 'muslim'
      ) {
        continue;
      }

      // Get coordinates
      let lat: number | undefined;
      let lon: number | undefined;

      if (element.type === 'node') {
        lat = element.lat;
        lon = element.lon;
      } else if (element.center) {
        // For ways and relations, use center coordinates
        lat = element.center.lat;
        lon = element.center.lon;
      }

      if (!lat || !lon) {
        continue; // Skip if no coordinates
      }

      // Get name (prefer English name, fallback to default name)
      const name =
        element.tags?.['name:en'] ||
        element.tags?.name ||
        'Masjid';

      // Build address
      const addressParts: string[] = [];
      if (element.tags?.['addr:street']) {
        addressParts.push(element.tags['addr:street']);
      }
      if (element.tags?.['addr:city']) {
        addressParts.push(element.tags['addr:city']);
      }
      if (element.tags?.['addr:postcode']) {
        addressParts.push(element.tags['addr:postcode']);
      }
      const address = addressParts.length > 0 ? addressParts.join(', ') : undefined;

      // Calculate distance
      const distance = this.calculateDistance(userLat, userLon, lat, lon);

      const masjid: Masjid = {
        id: element.id,
        name,
        latitude: lat,
        longitude: lon,
        distance: Math.round(distance * 10) / 10, // Round to 1 decimal place
        address,
        website: element.tags?.website,
        phone: element.tags?.phone,
        openingHours: element.tags?.['opening_hours'],
      };

      masjids.push(masjid);
    }

    return masjids;
  }

  /**
   * Get default radius
   */
  getDefaultRadius(): number {
    return this.DEFAULT_RADIUS_KM;
  }

  /**
   * Get min/max radius limits
   */
  getRadiusLimits(): { min: number; max: number } {
    return {
      min: this.MIN_RADIUS_KM,
      max: this.MAX_RADIUS_KM,
    };
  }

  /**
   * Format distance for display
   */
  formatDistance(distanceKm: number): string {
    if (distanceKm < 1) {
      return `${Math.round(distanceKm * 1000)}m`;
    }
    return `${distanceKm.toFixed(1)}km`;
  }
}

