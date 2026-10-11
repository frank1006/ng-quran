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

/**
 * "Try asking" shows four questions, one from each list, and moves one step along each list every
 * day, so over a week a person sees what the assistant covers. The lists have different lengths,
 * so the same four don't come round together.
 */
const QURAN_QUESTIONS = [
  'What does the Quran say about patience?',
  'What does the Quran say about parents?',
  'Show me the last two ayahs of Al-Baqarah',
  'What does the Quran say about gratitude?',
  'Tell me the story of Yusuf',
  'What does the Quran say about anger?',
  'Play Surah Ar-Rahman',
];
/** Answered from the app's own data: prayer times, place, Qibla, calendar */
const MY_DAY_QUESTIONS = [
  'When is the next prayer?',
  'Which masjids are near me?',
  'Which way is the Qibla?',
  'What time is Fajr tomorrow?',
  'Which Islamic events are coming up?',
];
/** Hadith, tafsir, du'as and the names of Allah */
const SOURCE_QUESTIONS = [
  'What did the Prophet ﷺ say about neighbours?',
  'Explain Ayat al-Kursi',
  "A du'a before sleeping",
  'What does Al-Wadud mean?',
  'Is there a hadith about intentions?',
  'Why was Surah Al-Kawthar revealed?',
];
/** Urdu, in its own script and in Latin letters */
const URDU_QUESTIONS = [
  'صبر کے بارے میں قرآن کیا کہتا ہے؟',
  'Agli namaz kab hai?',
  'والدین کے بارے میں حدیث بتائیں',
  'Safar ki dua btao',
];

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

  // The Quran question follows the day when it has something to follow: Friday, or an event that is near
  const day = Math.floor(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) / DAY_MS);
  const ofTheDay = (questions: string[]) => questions[day % questions.length];
  const eventQuestion = next && daysAway !== null && daysAway <= EVENT_SOON_DAYS ? EVENT_QUESTIONS[next.event.id] : undefined;
  const quranQuestion = weekday === 'Friday' ? 'Show me the first ten ayahs of Al-Kahf' : eventQuestion ?? ofTheDay(QURAN_QUESTIONS);

  return {
    date: isoDate(today),
    greeting: firstName ? `Assalamu alaikum, ${firstName}` : 'Assalamu alaikum',
    today: `Today is ${weekday}, ${h.day} ${h.monthName} ${h.year} AH.`,
    event,
    suggestions: [quranQuestion, ofTheDay(MY_DAY_QUESTIONS), ofTheDay(SOURCE_QUESTIONS), ofTheDay(URDU_QUESTIONS)],
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
