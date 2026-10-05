import { TestBed } from '@angular/core/testing';
import { Injector, effect, runInInjectionContext, signal } from '@angular/core';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { NotificationService } from './notification.service';
import { PrayerTimeStore } from '../store/prayer-time.store';
import { PrayerTimeData } from './prayer-time.types';

const data: PrayerTimeData = {
  date: '2026-10-05',
  timings: { fajr: '05:30', sunrise: '07:00', dhuhr: '23:58', asr: '23:59', maghrib: '23:59', isha: '23:59' },
  location: { latitude: 0, longitude: 0 },
};

describe('NotificationService scheduling inside an effect', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('prayer_notification_settings', JSON.stringify({
      enabled: true, advanceMinutes: 0, preferences: { dhuhr: true, asr: true, isha: true },
    }));
    vi.spyOn(window.Notification, 'permission', 'get').mockReturnValue('granted');
    TestBed.configureTestingModule({
      providers: [{
        provide: PrayerTimeStore,
        useValue: { getCachedPrayerTimes: () => null, getPrayerTimes: () => of(null), currentLocation: () => null },
      }],
    });
  });

  afterEach(() => vi.restoreAllMocks());

  it('does not re-trigger the effect that schedules (no infinite loop once notifications are on)', async () => {
    const service = TestBed.inject(NotificationService);
    const trigger = signal(data);
    let runs = 0;
    runInInjectionContext(TestBed.inject(Injector), () =>
      effect(() => {
        runs++;
        service.scheduleNotificationsForDate(new Date(), trigger());
      })
    );
    for (let i = 0; i < 20; i++) {
      TestBed.tick();
      await Promise.resolve();
    }
    expect(runs).toBeLessThanOrEqual(2);
  });
});
