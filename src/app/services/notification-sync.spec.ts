import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { NotificationService } from './notification.service';
import { PrayerTimeStore } from '../store/prayer-time.store';

describe('NotificationService reminders from the account', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('prayer_notification_settings', JSON.stringify({
      enabled: true, advanceMinutes: 10, preferences: { fajr: true, dhuhr: true },
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

  it('gives the account only the reminder choices', () => {
    const service = TestBed.inject(NotificationService);
    expect(service.syncedReminders()).toEqual({
      enabled: true, preferences: { fajr: true, dhuhr: true }, silent: {}, plainSound: {},
    });
  });

  it("replaces this device's choices, keeps its own timing, and saves them", () => {
    const service = TestBed.inject(NotificationService);
    service.applySyncedReminders({
      enabled: true, preferences: { asr: true, isha: true }, silent: { isha: true }, plainSound: { asr: true },
    });

    expect(service.prayerMode('fajr')).toBe('off');
    expect(service.prayerMode('asr')).toBe('sound');
    expect(service.prayerMode('isha')).toBe('silent');
    expect(service.currentSettings().advanceMinutes).toBe(10);
    expect(JSON.parse(localStorage.getItem('prayer_notification_settings')!).preferences).toEqual({ asr: true, isha: true });
  });
});
