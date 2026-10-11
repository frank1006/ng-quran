import { HijriCalendarService } from '../../calendar/hijri-calendar.service';
import { buildWelcome } from './qflow-welcome';

/** A calendar with one event, `daysAway` days after the day asked about (none when undefined) */
const calendar = (eventId?: string, daysAway = 0) =>
  ({
    toHijri: () => ({ day: 20, month: 4, monthName: 'Rabi al-Thani', year: 1448 }),
    upcoming: (from: Date) =>
      eventId ? [{ date: new Date(from.getFullYear(), from.getMonth(), from.getDate() + daysAway), event: { id: eventId, name: 'Ramadan' } }] : [],
  }) as unknown as HijriCalendarService;

// 2026-10-12 is a Monday
const monday = new Date(2026, 9, 12, 9);
const dayAfter = (days: number) => new Date(2026, 9, 12 + days, 9);

describe('buildWelcome suggestions', () => {
  it('gives four different questions', () => {
    const { suggestions } = buildWelcome(calendar(), undefined, monday);
    expect(new Set(suggestions).size).toBe(4);
  });

  it('gives the same questions all day and different ones the next day', () => {
    const morning = buildWelcome(calendar(), undefined, monday).suggestions;
    const evening = buildWelcome(calendar(), undefined, new Date(2026, 9, 12, 23)).suggestions;
    const tuesday = buildWelcome(calendar(), undefined, dayAfter(1)).suggestions;
    expect(evening).toEqual(morning);
    tuesday.forEach((question, slot) => expect(question).not.toBe(morning[slot]));
  });

  it('asks about an event that is within a month', () => {
    expect(buildWelcome(calendar('ramadan', 12), undefined, monday).suggestions[0]).toBe('What does the Quran say about fasting?');
    expect(buildWelcome(calendar('ramadan', 60), undefined, monday).suggestions[0]).not.toBe('What does the Quran say about fasting?');
  });

  it('suggests Al-Kahf on a Friday', () => {
    expect(buildWelcome(calendar('ramadan', 12), undefined, dayAfter(4)).suggestions[0]).toBe('Show me the first ten ayahs of Al-Kahf');
  });
});
