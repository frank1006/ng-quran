import { TestBed } from '@angular/core/testing';
import { PrayerTimeService } from './prayer-time.service';
import { LocationCoordinates, PrayerTimeData, LocationError } from './prayer-time.types';
import { vi } from 'vitest';

describe('PrayerTimeService', () => {
  let service: PrayerTimeService;
  let mockGetCurrentPosition: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(PrayerTimeService);

    // Mock navigator.geolocation
    mockGetCurrentPosition = vi.fn();
    Object.defineProperty(navigator, 'geolocation', {
      value: {
        getCurrentPosition: mockGetCurrentPosition
      },
      writable: true,
      configurable: true
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('getCurrentLocation', () => {
    it('should return location coordinates on success', async () => {
      const mockPosition = {
        coords: {
          latitude: 40.7128,
          longitude: -74.0060,
          accuracy: 10,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
          toJSON: vi.fn()
        },
        timestamp: Date.now(),
        toJSON: vi.fn()
      } as GeolocationPosition;

      mockGetCurrentPosition.mockImplementation((success: PositionCallback) => {
        success(mockPosition);
      });

      const result = await new Promise<LocationCoordinates>((resolve, reject) => {
        service.getCurrentLocation().subscribe({
          next: resolve,
          error: reject
        });
      });

      expect(result.latitude).toBe(40.7128);
      expect(result.longitude).toBe(-74.0060);
    });

    it('should handle permission denied error', async () => {
      const mockError: GeolocationPositionError = {
        code: 1,
        message: 'Permission denied',
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3
      };

      mockGetCurrentPosition.mockImplementation((_success: PositionCallback, error: PositionErrorCallback) => {
        error(mockError);
      });

      await expect(
        new Promise((resolve, reject) => {
          service.getCurrentLocation().subscribe({
            next: resolve,
            error: reject
          });
        })
      ).rejects.toMatchObject({
        code: 1,
        message: expect.stringMatching(/Location is (off|blocked)/)
      });
    });

    it('should handle geolocation not supported', async () => {
      Object.defineProperty(navigator, 'geolocation', {
        value: undefined,
        writable: true,
        configurable: true
      });

      await expect(
        new Promise((resolve, reject) => {
          service.getCurrentLocation().subscribe({
            next: resolve,
            error: reject
          });
        })
      ).rejects.toMatchObject({
        message: expect.stringContaining('not supported')
      });
    });
  });

  describe('getPrayerTimesByCoordinates', () => {
    it('should work out the day\'s prayer times for the place', async () => {
      const result = await new Promise<PrayerTimeData>((resolve, reject) => {
        service.getPrayerTimesByCoordinates(40.7128, -74.0060, new Date(2024, 11, 29)).subscribe({
          next: resolve,
          error: reject
        });
      });

      const { fajr, sunrise, dhuhr, asr, maghrib, isha } = result.timings;
      expect([fajr, sunrise, dhuhr, asr, maghrib, isha]).toEqual([fajr, sunrise, dhuhr, asr, maghrib, isha].sort());
      expect(result.date).toBe('29 Dec 2024');
      expect(result.location.latitude).toBe(40.7128);
      expect(result.location.longitude).toBe(-74.0060);
    });
  });

  describe('getTodayPrayerTimes', () => {
    it('should get location and work out prayer times', async () => {
      const mockPosition = {
        coords: {
          latitude: 40.7128,
          longitude: -74.0060,
          accuracy: 10,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
          toJSON: vi.fn()
        },
        timestamp: Date.now(),
        toJSON: vi.fn()
      } as GeolocationPosition;

      mockGetCurrentPosition.mockImplementation((success: PositionCallback) => {
        success(mockPosition);
      });

      const result = await new Promise<PrayerTimeData>((resolve, reject) => {
        service.getTodayPrayerTimes().subscribe({
          next: resolve,
          error: reject
        });
      });

      expect(result).toBeTruthy();
      expect(result.timings).toBeTruthy();
      expect(result.location).toBeTruthy();
    });
  });
});
