import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { vi } from 'vitest';
import { PrayerTimeService } from './prayer-time.service';
import { defaultAsrSchool } from './settings.service';

describe('Prayer calculation settings', () => {
  describe('defaultAsrSchool', () => {
    it('uses Hanafi Asr in South Asia and Turkey', () => {
      expect(defaultAsrSchool('Asia/Karachi')).toBe(1);
      expect(defaultAsrSchool('Asia/Kolkata')).toBe(1);
      expect(defaultAsrSchool('Asia/Dhaka')).toBe(1);
      expect(defaultAsrSchool('Europe/Istanbul')).toBe(1);
    });

    it('uses standard Asr elsewhere', () => {
      expect(defaultAsrSchool('Europe/London')).toBe(0);
      expect(defaultAsrSchool('Asia/Riyadh')).toBe(0);
      expect(defaultAsrSchool('America/New_York')).toBe(0);
    });
  });

  describe('on-device times', () => {
    let service: PrayerTimeService;

    beforeEach(() => {
      service = TestBed.inject(PrayerTimeService);
    });

    afterEach(() => vi.restoreAllMocks());

    it('works the times out without a network request', async () => {
      const fetchSpy = vi.spyOn(window, 'fetch');
      const data = await firstValueFrom(service.getPrayerTimesByCoordinates(31.52, 74.36, new Date(2026, 9, 5), { method: null, school: 1 }));
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(data.date).toBe('05 Oct 2026');
      expect(Object.values(data.timings).every(t => /^\d{2}:\d{2}$/.test(t))).toBe(true);
    });

    it('uses the chosen method and Asr school', async () => {
      const at = (method: number | null, school: 0 | 1) =>
        firstValueFrom(service.getPrayerTimesByCoordinates(31.52, 74.36, new Date(2026, 9, 5), { method, school }));
      const [karachi, isna, hanafi] = await Promise.all([at(1, 0), at(2, 0), at(1, 1)]);
      expect(isna.timings.fajr).not.toBe(karachi.timings.fajr); // 15° vs 18°
      expect(hanafi.timings.asr).not.toBe(karachi.timings.asr);
      expect(hanafi.timings.dhuhr).toBe(karachi.timings.dhuhr);
    });
  });
});
