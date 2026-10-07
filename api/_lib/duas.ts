/**
 * Du'as for QuranFlow AI: a fixed copy of UmmahAPI's collection (scripts/fetch-duas.mjs), from
 * the Quran and the Sunnah, each with its source. The AI picks a category; the app shows the
 * du'as it chose in full (Arabic, transliteration, meaning, source), so nothing is written from
 * the model's memory.
 */
import { DUAS, DUA_CATEGORIES } from './duas-data';

export interface Dua {
  id: number;
  category: string;
  title: string;
  arabic: string;
  transliteration: string;
  translation: string;
  /** As the collection gives it, e.g. "Sahih Muslim 4:1728" or "Quran 21:83" */
  source: string;
  /** How many times it's said (1 = once) */
  repeat: number;
}

export interface DuaCategory {
  id: string;
  name: string;
  description: string;
}

/** Plain-word needs that map to a category, so the model picks well ("health" → illness) */
const ALSO_FOR: Record<string, string> = {
  distress: 'anxiety, worry, stress, depression, sadness, hardship, fear',
  illness: 'health, sickness, cure, pain, ruqyah',
  business: 'rizq, provision, wealth, money, debt, job, work, success',
  grief: 'death, loss, calamity, funeral',
  knowledge: 'exams, study',
  marriage: 'spouse, wedding',
  children: 'pregnancy, newborn, offspring',
  protection: 'evil eye, safety, harm',
  guidance: 'decisions, istikhara, character',
  night_prayer: 'tahajjud, witr, qunut',
};

export const DUA_CATEGORY_IDS = DUA_CATEGORIES.map(c => c.id);

/** For the tool description: "illness (Illness & Healing; also health, sickness…)" */
export const DUA_CATEGORY_GUIDE = DUA_CATEGORIES.map(c => `${c.id} (${c.name}${ALSO_FOR[c.id] ? `; also ${ALSO_FOR[c.id]}` : ''})`).join(', ');

const MAX_PER_ANSWER = 8;

/** The du'as in up to two categories (Quran first, then by the collection's order), without repeats */
export function findDuas(categories: unknown): Dua[] {
  const wanted = (Array.isArray(categories) ? categories : [categories])
    .map(c => String(c ?? '').trim().toLowerCase())
    .filter(c => DUA_CATEGORY_IDS.includes(c))
    .slice(0, 2);
  const seen = new Set<string>();
  return DUAS.filter(d => wanted.includes(d.category))
    .sort((a, b) => Number(isQuran(b)) - Number(isQuran(a)))
    .filter(d => {
      if (seen.has(d.arabic)) return false;
      seen.add(d.arabic);
      return true;
    })
    .slice(0, MAX_PER_ANSWER);
}

export function duaForModel(dua: Dua): string {
  return JSON.stringify({ dua: dua.id, title: dua.title, meaning: dua.translation, source: dua.source, repeat: dua.repeat > 1 ? `${dua.repeat} times` : undefined });
}

function isQuran(dua: Dua): boolean {
  return /^quran\b/i.test(dua.source);
}
