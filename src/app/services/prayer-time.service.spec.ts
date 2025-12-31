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
        message: expect.stringContaining('permission denied')
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
    it('should fetch prayer times successfully', async () => {
      const mockResponse = {
        code: 200,
        status: 'OK',
        data: {
          timings: {
            Fajr: '05:30 (GMT)',
            Sunrise: '07:00 (GMT)',
            Dhuhr: '12:30 (GMT)',
            Asr: '15:00 (GMT)',
            Maghrib: '17:30 (GMT)',
            Isha: '19:00 (GMT)'
          },
          date: {
            readable: '29 Dec 2024',
            timestamp: '1234567890'
          }
        }
      };

      window.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      } as Response);

      const result = await new Promise<PrayerTimeData>((resolve, reject) => {
        service.getPrayerTimesByCoordinates(40.7128, -74.0060).subscribe({
          next: resolve,
          error: reject
        });
      });

      expect(result.timings.fajr).toBe('05:30');
      expect(result.timings.dhuhr).toBe('12:30');
      expect(result.date).toBe('29 Dec 2024');
      expect(result.location.latitude).toBe(40.7128);
      expect(result.location.longitude).toBe(-74.0060);
    });

    it('should handle API error response', async () => {
      window.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      } as Response);

      await expect(
        new Promise((resolve, reject) => {
          service.getPrayerTimesByCoordinates(40.7128, -74.0060).subscribe({
            next: resolve,
            error: reject
          });
        })
      ).rejects.toThrow();
    });

    it('should handle invalid API response', async () => {
      const mockResponse = {
        code: 400,
        status: 'Bad Request',
        data: null
      };

      window.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      } as Response);

      await expect(
        new Promise((resolve, reject) => {
          service.getPrayerTimesByCoordinates(40.7128, -74.0060).subscribe({
            next: resolve,
            error: reject
          });
        })
      ).rejects.toThrow();
    });
  });

  describe('getTodayPrayerTimes', () => {
    it('should get location and fetch prayer times', async () => {
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

      const mockResponse = {
        code: 200,
        status: 'OK',
        data: {
          timings: {
            Fajr: '05:30 (GMT)',
            Sunrise: '07:00 (GMT)',
            Dhuhr: '12:30 (GMT)',
            Asr: '15:00 (GMT)',
            Maghrib: '17:30 (GMT)',
            Isha: '19:00 (GMT)'
          },
          date: {
            readable: '29 Dec 2024',
            timestamp: '1234567890'
          }
        }
      };

      mockGetCurrentPosition.mockImplementation((success: PositionCallback) => {
        success(mockPosition);
      });

      window.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      } as Response);

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
