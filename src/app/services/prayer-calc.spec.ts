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

  describe('Aladhan request', () => {
    let service: PrayerTimeService;
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      service = TestBed.inject(PrayerTimeService);
      fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          code: 200,
          status: 'OK',
          data: {
            timings: { Fajr: '04:38', Sunrise: '05:59', Dhuhr: '11:51', Asr: '16:03', Maghrib: '17:44', Isha: '19:04' },
            date: { readable: '05 Oct 2026' }
          }
        })
      });
      window.fetch = fetchMock as unknown as typeof fetch;
    });

    afterEach(() => vi.restoreAllMocks());

    const requestedUrl = () => new URL(fetchMock.mock.calls[0][0] as string);

    it('omits the method so the API picks the local authority', async () => {
      await firstValueFrom(service.getPrayerTimesByCoordinates(31.52, 74.36, new Date(2026, 9, 5), { method: null, school: 1 }));
      expect(requestedUrl().searchParams.has('method')).toBe(false);
      expect(requestedUrl().searchParams.get('school')).toBe('1');
    });

    it('sends an explicit method when chosen', async () => {
      await firstValueFrom(service.getPrayerTimesByCoordinates(31.52, 74.36, new Date(2026, 9, 5), { method: 1, school: 0 }));
      expect(requestedUrl().searchParams.get('method')).toBe('1');
      expect(requestedUrl().searchParams.get('school')).toBe('0');
    });
  });
});
