import { Injectable, isDevMode } from '@angular/core';
import { Observable, from, of, throwError } from 'rxjs';
import { tap, shareReplay, finalize, catchError } from 'rxjs/operators';

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

// Unified cache structure interface
interface UnifiedMasjidCache {
  version?: string;
  lastRadius?: number;
  searchCache?: MasjidCacheData;
}

@Injectable({
  providedIn: 'root'
})
export class MasjidService {
  // Multiple Overpass API endpoints for fallback
  // overpass-api.de and its two mirrors (checked 2026-10-05; kumi.systems and openstreetmap.ru no longer respond)
  private readonly OVERPASS_API_URLS = [
    'https://overpass-api.de/api/interpreter',
    'https://z.overpass-api.de/api/interpreter',
    'https://lz4.overpass-api.de/api/interpreter'
  ];
  private readonly DEFAULT_RADIUS_KM = 1; // Default 5km radius
  private readonly MAX_RADIUS_KM = 50; // Maximum 50km radius
  private readonly MIN_RADIUS_KM = 1; // Minimum 1km radius
  private readonly REQUEST_TIMEOUT_MS = 12000; // Per-endpoint limit
  private readonly STAGGER_MS = 5000; // Start the next endpoint if no answer yet
  private readonly PROXY_RADII_KM = [5, 10]; // Radii cached by /api/masjids
  private readonly PROXY_TIMEOUT_MS = 25000;
  private readonly BASE_FETCH_KM = 5; // Smallest search actually sent to the server
  
  // Cache configuration
  private readonly STORAGE_KEY = 'masjid-cache';
  private readonly CACHE_VERSION = '1.0.0';
  private readonly CACHE_EXPIRY_HOURS = 24 * 7; // Mosques rarely change; keep results for 7 days
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
   * Get nearby mosques/masjids using Overpass API with fallback endpoints.
   * Returns everything within max(radiusKm, BASE_FETCH_KM), sorted by distance; callers filter by radius.
   * @param latitude - User's latitude
   * @param longitude - User's longitude
   * @param radiusKm - Search radius in kilometers
   * @param forceRefresh - If true, bypass cache and fetch fresh data
   * @param abortSignal - Optional AbortSignal to cancel the request
   */
  getNearbyMasjids(
    latitude: number,
    longitude: number,
    radiusKm: number = this.DEFAULT_RADIUS_KM,
    forceRefresh: boolean = false,
    abortSignal?: AbortSignal
  ): Observable<Masjid[]> {
    // Clamp radius to valid range
    const clampedRadius = Math.max(
      this.MIN_RADIUS_KM,
      Math.min(this.MAX_RADIUS_KM, radiusKm)
    );

    // Radii up to BASE_FETCH_KM share one search (filtered on the device), so switching
    // between 1/2/3/5 km needs no extra server requests
    const fetchRadius = Math.max(clampedRadius, this.BASE_FETCH_KM);
    const cacheKey = this.getCacheKey(latitude, longitude, fetchRadius);

    // Check cache first (unless force refresh)
    if (!forceRefresh) {
      const cached = this.getCachedMasjids(latitude, longitude, fetchRadius);
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
    const radiusMeters = fetchRadius * 1000;

    // Overpass QL query to find mosques/masjids
    // Searches for: amenity=place_of_worship + religion=muslim
    // Server-side limit below the 12s client timeout
    const query = `
      [out:json][timeout:10];
      (
        node["amenity"="place_of_worship"]["religion"="muslim"](around:${radiusMeters},${latitude},${longitude});
        way["amenity"="place_of_worship"]["religion"="muslim"](around:${radiusMeters},${latitude},${longitude});
        relation["amenity"="place_of_worship"]["religion"="muslim"](around:${radiusMeters},${latitude},${longitude});
      );
      out center meta;
    `.trim();

    // Create the request observable with shareReplay to deduplicate concurrent requests
    const request$ = this.tryEndpointsSequentially(query, latitude, longitude, fetchRadius, abortSignal).pipe(
      tap((masjids) => {
        // Cache the results after successful fetch
        this.setCachedMasjids(latitude, longitude, fetchRadius, masjids);
      }),
      catchError((error) => {
        // Servers unavailable: fall back to an older saved search for this area, if any
        const stale = this.getCachedMasjids(latitude, longitude, fetchRadius, true);
        if (stale && !String(error?.message).includes('REQUEST_ABORTED')) {
          return of(stale);
        }
        return throwError(() => error);
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
  private getCachedMasjids(latitude: number, longitude: number, radiusKm: number, allowStale = false): Masjid[] | null {
    const cacheKey = this.getCacheKey(latitude, longitude, radiusKm);

    // Check in-memory cache first
    const inMemoryEntry = this.inMemoryCache.get(cacheKey);
    if (inMemoryEntry && (allowStale || !this.isCacheExpired(inMemoryEntry))) {
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

      try {
        const data: UnifiedMasjidCache = JSON.parse(stored);
        
        // Check version compatibility
        if (data.version !== this.CACHE_VERSION) {
          // Migrate old structure if needed
          if ((data as any).cache && typeof (data as any).cache === 'object') {
            // Old structure - migrate to new
            const oldData = data as any;
            const unifiedCache: UnifiedMasjidCache = {
              version: this.CACHE_VERSION,
              searchCache: oldData.cache
            };
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(unifiedCache));
            data.searchCache = oldData.cache;
          } else {
            this.clearCache();
            return null;
          }
        }

        // Use new unified structure
        if (!data.searchCache) {
          return null;
        }

        const entry = data.searchCache[cacheKey];
        if (entry && (allowStale || !this.isCacheExpired(entry))) {
          // Update in-memory cache
          this.inMemoryCache.set(cacheKey, entry);
          return entry.masjids;
        }

        return null;
      } catch (error) {
        // Try to parse as old structure for migration
        try {
          const oldData: { version: string; cache: MasjidCacheData } = JSON.parse(stored);
          if (oldData.version === this.CACHE_VERSION && oldData.cache) {
            // Migrate to new structure
            const unifiedCache: UnifiedMasjidCache = {
              version: this.CACHE_VERSION,
              searchCache: oldData.cache
            };
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(unifiedCache));
            
            const entry = oldData.cache[cacheKey];
            if (entry && (allowStale || !this.isCacheExpired(entry))) {
              this.inMemoryCache.set(cacheKey, entry);
              return entry.masjids;
            }
          }
        } catch (migrationError) {
          // Both parsing attempts failed
        }
        return null;
      }
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

      // Load existing unified cache
      let unifiedCache: UnifiedMasjidCache = {
        version: this.CACHE_VERSION,
        searchCache: {}
      };

      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        try {
          const existing = JSON.parse(stored);
          
          // Migrate from old structure if needed
          if (existing.version === this.CACHE_VERSION) {
            if (existing.cache && typeof existing.cache === 'object') {
              // Old structure - migrate
              unifiedCache = {
                version: this.CACHE_VERSION,
                lastRadius: existing.lastRadius,
                searchCache: existing.cache
              };
            } else if (existing.searchCache) {
              // New structure
              unifiedCache = {
                version: this.CACHE_VERSION,
                lastRadius: existing.lastRadius,
                searchCache: existing.searchCache
              };
            }
          }
        } catch (e) {
          // If parsing fails, start fresh
        }
      }

      // Initialize searchCache if it doesn't exist
      if (!unifiedCache.searchCache) {
        unifiedCache.searchCache = {};
      }

      // Add/update entry
      unifiedCache.searchCache[cacheKey] = entry;

      // Clean up old entries (keep last 20 entries)
      const entries = Object.entries(unifiedCache.searchCache);
      if (entries.length > 20) {
        // Sort by timestamp and keep most recent
        const sorted = entries.sort((a, b) => b[1].timestamp - a[1].timestamp);
        unifiedCache.searchCache = Object.fromEntries(sorted.slice(0, 20));
      }

      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(unifiedCache));
    } catch (error) {
      if (isDevMode()) {
        console.warn('Error saving masjid cache:', error);
      }
      // Silently fail - in-memory cache will still work
    }
  }

  /**
   * Clear all masjid cache (search results only, preserves lastRadius)
   */
  clearCache(): void {
    this.inMemoryCache.clear();
    try {
      if (typeof localStorage !== 'undefined') {
        const stored = localStorage.getItem(this.STORAGE_KEY);
        if (stored) {
          try {
            const existing: UnifiedMasjidCache = JSON.parse(stored);
            // Clear only search cache, preserve lastRadius
            const clearedCache: UnifiedMasjidCache = {
              version: this.CACHE_VERSION,
              lastRadius: existing.lastRadius,
              searchCache: {}
            };
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(clearedCache));
          } catch (e) {
            // If parsing fails, remove entire cache
            localStorage.removeItem(this.STORAGE_KEY);
          }
        }
      }
    } catch (error) {
      if (isDevMode()) {
        console.warn('Error clearing masjid cache:', error);
      }
    }
  }

  /**
   * Query the Overpass endpoints with a staggered race: start the first, start the next one
   * if there's no answer within STAGGER_MS (or immediately when one fails), and take the first
   * successful response. Busy servers then cost ~3s instead of a full timeout.
   */
  private tryEndpointsSequentially(
    query: string,
    latitude: number,
    longitude: number,
    radiusKm: number,
    abortSignal?: AbortSignal
  ): Observable<Masjid[]> {
    return from(
      this.fetchViaProxy(latitude, longitude, radiusKm, abortSignal).catch(error => {
        if (abortSignal?.aborted) throw error;
        // Proxy unavailable (e.g. local dev) or failed: ask the public servers directly
        return new Promise<Masjid[]>((resolve, reject) =>
          this.raceOverpass(query, latitude, longitude, abortSignal).subscribe({ next: resolve, error: reject })
        );
      })
    );
  }

  /**
   * Same-origin Vercel proxy (/api/masjids) that caches Overpass results at the edge.
   * Coordinates are rounded to the proxy's ~1 km grid; distances are computed from the real position.
   */
  private async fetchViaProxy(
    latitude: number,
    longitude: number,
    radiusKm: number,
    abortSignal?: AbortSignal
  ): Promise<Masjid[]> {
    const proxyRadius = this.PROXY_RADII_KM.find(r => r >= radiusKm);
    if (proxyRadius === undefined) {
      throw new Error('Radius not supported by proxy');
    }
    const grid = (value: number) => Number((Math.round(value / 0.01) * 0.01).toFixed(2));
    const url = `/api/masjids?lat=${grid(latitude)}&lng=${grid(longitude)}&r=${proxyRadius}`;

    const attempt = new AbortController();
    const timer = setTimeout(() => attempt.abort(), this.PROXY_TIMEOUT_MS);
    const onCallerAbort = () => attempt.abort();
    abortSignal?.addEventListener('abort', onCallerAbort);
    try {
      const response = await fetch(url, { signal: attempt.signal });
      if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) {
        throw new Error(`Proxy HTTP ${response.status}`);
      }
      const data: OverpassResponse = await response.json();
      const masjids = await this.processOverpassResponse(data, latitude, longitude);
      return masjids.sort((a, b) => (a.distance || 0) - (b.distance || 0));
    } catch (error) {
      if (abortSignal?.aborted) throw new Error('REQUEST_ABORTED');
      throw error;
    } finally {
      clearTimeout(timer);
      abortSignal?.removeEventListener('abort', onCallerAbort);
    }
  }

  /** Query the public Overpass endpoints directly (staggered race). */
  private raceOverpass(
    query: string,
    latitude: number,
    longitude: number,
    abortSignal?: AbortSignal
  ): Observable<Masjid[]> {
    const urls = this.OVERPASS_API_URLS;

    const run = new Promise<Masjid[]>((resolve, reject) => {
      if (abortSignal?.aborted) {
        reject(new Error('REQUEST_ABORTED'));
        return;
      }

      const attempts: AbortController[] = [];
      let nextIndex = 0;
      let pending = 0;
      let settled = false;
      let staggerTimer: ReturnType<typeof setTimeout> | undefined;

      const finish = (settle: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(staggerTimer);
        attempts.forEach(attempt => attempt.abort()); // stop the slower servers
        abortSignal?.removeEventListener('abort', onCallerAbort);
        settle();
      };
      const onCallerAbort = () => finish(() => reject(new Error('REQUEST_ABORTED')));
      abortSignal?.addEventListener('abort', onCallerAbort);

      const launch = () => {
        if (settled || nextIndex >= urls.length) return;
        const apiUrl = urls[nextIndex++];
        const attempt = new AbortController();
        attempts.push(attempt);
        pending++;

        clearTimeout(staggerTimer);
        staggerTimer = setTimeout(launch, this.STAGGER_MS);

        this.fetchFromEndpoint(apiUrl, query, latitude, longitude, attempt).then(
          masjids => finish(() => resolve(masjids)),
          error => {
            pending--;
            if (settled) return;
            if (isDevMode()) {
              console.warn(`Overpass endpoint failed (${error}): ${apiUrl}`);
            }
            // All overpass-api.de servers share one per-user limit: retrying only extends the block
            if (String(error).includes('HTTP 429')) {
              finish(() => reject(new Error('Too many searches in a short time. Please wait a minute and try again.')));
              return;
            }
            if (nextIndex < urls.length) {
              launch(); // don't wait for the stagger when a server has already failed
            } else if (pending === 0) {
              finish(() => reject(new Error(navigator.onLine
                ? 'Mosque search servers are busy. Please try again in a few moments.'
                : 'Network error. Please check your internet connection.')));
            }
          }
        );
      };

      launch();
    });

    return from(run);
  }

  /** One Overpass request, cut off after REQUEST_TIMEOUT_MS or when the attempt is aborted. */
  private async fetchFromEndpoint(
    apiUrl: string,
    query: string,
    latitude: number,
    longitude: number,
    attempt: AbortController
  ): Promise<Masjid[]> {
    const timer = setTimeout(() => attempt.abort(), this.REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`,
        signal: attempt.signal,
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data: OverpassResponse = await response.json();
      const masjids = await this.processOverpassResponse(data, latitude, longitude);
      return masjids.sort((a, b) => (a.distance || 0) - (b.distance || 0));
    } catch (error) {
      throw attempt.signal.aborted ? new Error('timeout') : error;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Deduplicate nearby masjids that are likely the same physical place.
   *
   * OSM often stores one mosque as both a node (pin) and a way/relation
   * (building outline). The node usually has no name tag, so the service
   * assigns it the "Masjid" fallback. Both end up at the same displayed
   * distance (already rounded to 0.1 km by processOverpassResponse).
   *
   * Rule: if a named entry and a "Masjid"-fallback entry share the same
   * rounded distance, the fallback is dropped. Entries with real names are
   * always kept, and fallbacks are kept only when no named entry exists at
   * that distance.
   */
  private deduplicateByLocation(masjids: Masjid[]): Masjid[] {
    const FALLBACK_NAME = 'Masjid';

    // Collect every distance value that has at least one named entry.
    const distancesWithName = new Set<number>();
    for (const m of masjids) {
      if (m.name !== FALLBACK_NAME && m.distance !== undefined) {
        distancesWithName.add(m.distance);
      }
    }

    // Drop fallback entries whose distance is already covered by a named entry.
    return masjids.filter(m => {
      if (m.name === FALLBACK_NAME && m.distance !== undefined) {
        return !distancesWithName.has(m.distance);
      }
      return true;
    });
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

    return this.deduplicateByLocation(masjids);
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

