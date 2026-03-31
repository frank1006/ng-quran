import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach } from 'vitest';
import { MasjidService, Masjid } from './masjid.service';

describe('MasjidService', () => {
  let service: MasjidService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(MasjidService);
  });

  function deduplicateByLocation(masjids: Masjid[]): Masjid[] {
    return (service as any).deduplicateByLocation(masjids);
  }

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('deduplicateByLocation', () => {
    it('keeps a single named entry unchanged', () => {
      const input: Masjid[] = [
        { id: 1, name: 'Al Waha 2', latitude: 25.1241, longitude: 55.4018, distance: 0.4 },
      ];
      expect(deduplicateByLocation(input)).toHaveLength(1);
    });

    it('drops the "Masjid" fallback when a named entry shares the same distance (real-world cache example)', () => {
      // Mirrors the actual cache data from the bug report
      const named: Masjid    = { id: 315535570, name: 'Al Waha 2', latitude: 25.1241589, longitude: 55.4018628, distance: 0.4 };
      const fallback: Masjid = { id: 315535571, name: 'Masjid',    latitude: 25.1242384, longitude: 55.4014657, distance: 0.4 };

      const result = deduplicateByLocation([named, fallback]);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Al Waha 2');
    });

    it('drops the fallback regardless of order in the array', () => {
      const fallback: Masjid = { id: 1, name: 'Masjid',    latitude: 25.1242, longitude: 55.4014, distance: 0.4 };
      const named: Masjid    = { id: 2, name: 'Al Waha 2', latitude: 25.1241, longitude: 55.4018, distance: 0.4 };

      const result = deduplicateByLocation([fallback, named]);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Al Waha 2');
    });

    it('keeps the fallback entry when no named entry exists at that distance', () => {
      const fallback: Masjid = { id: 1, name: 'Masjid', latitude: 25.1242, longitude: 55.4014, distance: 0.4 };

      const result = deduplicateByLocation([fallback]);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Masjid');
    });

    it('keeps both named entries at the same distance (genuinely different mosques)', () => {
      const a: Masjid = { id: 1, name: 'Mosque A', latitude: 25.1234, longitude: 55.1234, distance: 0.4 };
      const b: Masjid = { id: 2, name: 'Mosque B', latitude: 25.1300, longitude: 55.1300, distance: 0.4 };

      const result = deduplicateByLocation([a, b]);

      expect(result).toHaveLength(2);
    });

    it('keeps named entries at different distances and drops a fallback that matches one of them', () => {
      const near: Masjid     = { id: 1, name: 'Near Mosque',  latitude: 25.1241, longitude: 55.4018, distance: 0.4 };
      const far: Masjid      = { id: 2, name: 'Far Mosque',   latitude: 25.1300, longitude: 55.4100, distance: 1.2 };
      const fallback: Masjid = { id: 3, name: 'Masjid',       latitude: 25.1242, longitude: 55.4014, distance: 0.4 };

      const result = deduplicateByLocation([near, far, fallback]);

      expect(result).toHaveLength(2);
      expect(result.map(m => m.name)).toContain('Near Mosque');
      expect(result.map(m => m.name)).toContain('Far Mosque');
    });

    it('handles an empty list', () => {
      expect(deduplicateByLocation([])).toHaveLength(0);
    });
  });

  describe('formatDistance', () => {
    it('formats distances under 1km in metres', () => {
      expect(service.formatDistance(0.4)).toBe('400m');
    });

    it('formats distances of 1km and over in km', () => {
      expect(service.formatDistance(1.5)).toBe('1.5km');
    });
  });
});
