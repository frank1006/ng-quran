import { HijriCalendarService } from '../../calendar/hijri-calendar.service';
import { isWhiteDay } from '../../calendar/islamic-events';
import { QFlowWelcome } from './qflow-chat.store';

const DAY_MS = 86_400_000;
/** An event this close shapes the day's suggested question */
const EVENT_SOON_DAYS = 30;

/** A question that fits each event (all answerable from the Quran) */
const EVENT_QUESTIONS: Record<string, string> = {
  'new-year': 'What does the Quran say about the passing of time?',
  ashura: 'Tell me the story of Musa and Pharaoh',
  mawlid: 'What does the Quran say about the Prophet ﷺ?',
  'isra-miraj': 'What does the Quran say about the Night Journey?',
  'mid-shaban': 'What does the Quran say about seeking forgiveness?',
  ramadan: 'What does the Quran say about fasting?',
  'laylat-al-qadr': 'What does the Quran say about Laylat al-Qadr?',
  'eid-al-fitr': 'What does the Quran say about giving charity?',
  hajj: 'What does the Quran say about Hajj?',
  arafah: 'What does the Quran say about Hajj?',
  'eid-al-adha': 'Tell me the story of Ibrahim and his son',
};

const GENERAL_QUESTION = 'What does the Quran say about patience?';
const URDU_QUESTION = 'صبر کے بارے میں قرآن کیا کہتا ہے؟';

/**
 * The day's greeting for QuranFlow AI (by first name once signed in), built from the app's own calendar (the user's moon-sighting
 * setting and hidden events apply). No AI involved, so it's instant and doesn't use a question.
 */
export function buildWelcome(hijri: HijriCalendarService, firstName?: string, now = new Date()): QFlowWelcome {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  const weekday = today.toLocaleDateString('en', { weekday: 'long' });
  const h = hijri.toHijri(today);

  const next = hijri.upcoming(today, 400)[0];
  const daysAway = next ? Math.round((startOfDay(next.date) - startOfDay(today)) / DAY_MS) : null;

  let event: string | undefined;
  if (next && daysAway === 0) {
    event = `Today is ${next.event.name}.`;
  } else if (next && daysAway !== null) {
    const when = next.date.toLocaleDateString('en', { day: 'numeric', month: 'long' });
    event = `${next.event.name} is ${daysAway === 1 ? 'tomorrow' : `in ${daysAway} days`} (${when}).`;
  }
  if (isWhiteDay(h.month, h.day)) event = `${event ? `${event} ` : ''}Today is one of the White Days.`;

  // One question for the day (Quran), two about the person's day (app data), one in Urdu
  const dayQuestion =
    weekday === 'Friday'
      ? 'Show me the first ten ayahs of Al-Kahf'
      : next && daysAway !== null && daysAway <= EVENT_SOON_DAYS
        ? EVENT_QUESTIONS[next.event.id] ?? GENERAL_QUESTION
        : GENERAL_QUESTION;

  return {
    date: isoDate(today),
    greeting: firstName ? `Assalamu alaikum, ${firstName}` : 'Assalamu alaikum',
    today: `Today is ${weekday}, ${h.day} ${h.monthName} ${h.year} AH.`,
    event,
    suggestions: [...new Set([dayQuestion, 'When is the next prayer?', 'Which masjids are near me?', URDU_QUESTION])],
  };
}

/** Local YYYY-MM-DD: the day a greeting belongs to */
export function isoDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}
