import { TestBed } from '@angular/core/testing';
import { PrayerTimeStore } from './prayer-time.store';
import { PrayerTimeService } from '../services/prayer-time.service';
import { of } from 'rxjs';
import { PrayerTimeData } from '../services/prayer-time.types';
import { vi } from 'vitest';

describe('PrayerTimeStore', () => {
  let store: PrayerTimeStore;
  let service: PrayerTimeService;

  beforeEach(() => {
    const serviceSpy = {
      getCurrentLocation: vi.fn(),
      getPrayerTimesByCoordinates: vi.fn()
    };

    TestBed.configureTestingModule({
      providers: [
        PrayerTimeStore,
        { provide: PrayerTimeService, useValue: serviceSpy }
      ]
    });

    store = TestBed.inject(PrayerTimeStore);
    service = TestBed.inject(PrayerTimeService);
  });

  it('should be created', () => {
    expect(store).toBeTruthy();
  });

  it('should cache prayer times', async () => {
    const mockLocation = { latitude: 25.2048, longitude: 55.2708 };
    const mockData: PrayerTimeData = {
      date: '29 Dec 2024',
      timings: {
        fajr: '05:30',
        sunrise: '06:45',
        dhuhr: '12:30',
        asr: '15:15',
        maghrib: '17:45',
        isha: '19:00'
      },
      location: mockLocation
    };

    const date = new Date('2024-12-29');

    vi.spyOn(service, 'getCurrentLocation').mockReturnValue(of(mockLocation));
    vi.spyOn(service, 'getPrayerTimesByCoordinates').mockReturnValue(of(mockData));

    const result = await new Promise<PrayerTimeData | null>((resolve) => {
      store.getPrayerTimes(date).subscribe({
        next: resolve
      });
    });

    expect(result).toEqual(mockData);

    // Second call should use cache
    const cachedResult = await new Promise<PrayerTimeData | null>((resolve) => {
      store.getPrayerTimes(date).subscribe({
        next: resolve
      });
    });

    expect(cachedResult).toEqual(mockData);
    expect(service.getPrayerTimesByCoordinates).toHaveBeenCalledTimes(1);
  });

  it('should preload prayer times for date range', async () => {
    const mockLocation = { latitude: 25.2048, longitude: 55.2708 };
    const mockData: PrayerTimeData = {
      date: '29 Dec 2024',
      timings: {
        fajr: '05:30',
        sunrise: '06:45',
        dhuhr: '12:30',
        asr: '15:15',
        maghrib: '17:45',
        isha: '19:00'
      },
      location: mockLocation
    };

    vi.spyOn(service, 'getCurrentLocation').mockReturnValue(of(mockLocation));
    vi.spyOn(service, 'getPrayerTimesByCoordinates').mockReturnValue(of(mockData));

    const centerDate = new Date('2024-12-29');

    const results = await new Promise<PrayerTimeData[]>((resolve) => {
      store.preloadPrayerTimes(centerDate).subscribe({
        next: resolve
      });
    });

    expect(results.length).toBeGreaterThan(0);
    expect(service.getPrayerTimesByCoordinates).toHaveBeenCalled();
  });
});

