import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { HijriCalendarService } from './hijri-calendar.service';
import { sightingProfileFor } from './hijri-countries';
import { isWhiteDay } from './islamic-events';

/** Aladhan month response: Gregorian days of a month mapped to Hijri days, starting at `hijriStart` */
function monthResponse(year: number, month: number, days: number, hijriStart: { day: number; month: number; year: number }, monthLength = 30) {
  const data = [];
  let { day, month: hm, year: hy } = hijriStart;
  for (let d = 1; d <= days; d++) {
    data.push({
      gregorian: { date: `${String(d).padStart(2, '0')}-${String(month).padStart(2, '0')}-${year}` },
      hijri: { day: String(day), month: { number: hm }, year: String(hy) }
    });
    day++;
    if (day > monthLength) { day = 1; hm = hm === 12 ? 1 : hm + 1; if (hm === 1) hy++; }
  }
  return { data };
}

describe('HijriCalendarService', () => {
  let service: HijriCalendarService;
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule] });
    service = TestBed.inject(HijriCalendarService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.match(() => true).forEach(r => r.flush({ data: [] })));

  /** Load October 2026 as Aladhan gives it: 1 Oct = 20 Rabi' al-Thani 1448 */
  async function loadOctober2026(method = 'HJCoSA') {
    const pending = service.ensureMonth(new Date(2026, 9, 1));
    await new Promise(resolve => setTimeout(resolve)); // requests are queued, so it starts a tick later
    http.expectOne(r => r.url.includes('/gToHCalendar/10/2026') && r.url.includes(`calendarMethod=${method}`))
      .flush(monthResponse(2026, 10, 31, { day: 20, month: 4, year: 1448 }));
    await pending;
  }

  it('uses Aladhan dates once the month is loaded', async () => {
    await loadOctober2026();
    expect(service.format(new Date(2026, 9, 6))).toBe("25 Rabi' al-Thani 1448 AH");
  });

  it('shifts by the country offset automatically, and the user can override it', async () => {
    await loadOctober2026();
    service.setCountry('PK', 'Pakistan');
    expect(service.offset()).toBe(-1);
    expect(service.toHijri(new Date(2026, 9, 6)).day).toBe(24); // a day later than Saudi Arabia
    expect(service.automaticLabel()).toContain('Pakistan');

    service.setUserOffset(0);
    expect(service.toHijri(new Date(2026, 9, 6)).day).toBe(25);
    expect(localStorage.getItem('hijri-offset')).toBe('0');

    service.setUserOffset(null);
    expect(service.isAutomatic()).toBe(true);
    expect(service.offset()).toBe(-1);
  });

  it('falls back to the built-in calendar before a month arrives', () => {
    const h = service.toHijri(new Date(2026, 9, 6));
    expect(h.year).toBe(1448);
    expect(h.month).toBe(4);
  });

  it('finds events and hides the varied ones when asked', () => {
    // Mawlid: 12 Rabi' al-Awwal 1448 (built-in calendar: late August 2026)
    const days = Array.from({ length: 60 }, (_, i) => new Date(2026, 7, 1 + i));
    const mawlidDay = days.find(d => service.eventsOn(d).some(e => e.id === 'mawlid'));
    expect(mawlidDay).toBeDefined();

    service.setShowVaried(false);
    expect(service.eventsOn(mawlidDay!).some(e => e.id === 'mawlid')).toBe(false);
    expect(localStorage.getItem('hijri-show-varied')).toBe('false');
  });

  it('lists upcoming events in date order', () => {
    const upcoming = service.upcoming(new Date(2026, 9, 6), 400);
    expect(upcoming.length).toBeGreaterThan(5);
    const times = upcoming.map(u => u.date.getTime());
    expect([...times].sort((a, b) => a - b)).toEqual(times);
    expect(upcoming.some(u => u.event.id === 'ramadan')).toBe(true);
  });
});

describe('Hijri calendar rules', () => {
  it('knows which countries usually differ', () => {
    expect(sightingProfileFor('pk').offset).toBe(-1);
    expect(sightingProfileFor('TR').method).toBe('DIYANET');
    expect(sightingProfileFor('ca')).toEqual(sightingProfileFor(null));
    expect(sightingProfileFor(null).offset).toBe(0);
  });

  it('marks the White Days, except 13 Dhu al-Hijjah', () => {
    expect(isWhiteDay(4, 13)).toBe(true);
    expect(isWhiteDay(4, 15)).toBe(true);
    expect(isWhiteDay(4, 16)).toBe(false);
    expect(isWhiteDay(12, 13)).toBe(false);
    expect(isWhiteDay(12, 14)).toBe(true);
  });
});
