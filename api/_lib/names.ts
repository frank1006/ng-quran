/**
 * The 99 names of Allah for QuranFlow AI: a fixed copy of UmmahAPI's list
 * (scripts/fetch-ummahapi.mjs). The app shows the names an answer cites as cards.
 */
import { NAMES_ABOUT, NAMES_OF_ALLAH } from './names-data';

export interface NameOfAllah {
  number: number;
  arabic: string;
  transliteration: string;
  english: string;
  meaning: string;
}

const MAX_MATCHES = 12;

/** Letters only, lowercase, without "al-/ar-/as-…" and Arabic diacritics: "Ar-Rahmān" → "rahman" */
function key(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ًͯ-ٰٟ]/g, '')
    .toLowerCase()
    .replace(/^(al|ar|as|ash|at|az|an|ad|adh)[-\s]/, '')
    .replace(/^ال/, '')
    .replace(/[^a-zء-ي]/g, '')
    // Common spelling differences: ee/i, oo/u
    .replace(/ee/g, 'i')
    .replace(/oo/g, 'u')
    // Doubled letters: "Razzaq" and "Razzaaq" match
    .replace(/(.)\1+/g, '$1');
}

/**
 * Names matching a query (transliteration, English, meaning or Arabic), or by number.
 * With neither, the whole list in short form so the model can pick.
 */
export function findNames(query: unknown, numbers: unknown): { names: NameOfAllah[]; text: string } {
  const wanted = (Array.isArray(numbers) ? numbers : []).map(Number).filter(n => n >= 1 && n <= 99);
  const q = String(query ?? '').trim();
  let names: NameOfAllah[] = [];
  if (wanted.length) {
    names = NAMES_OF_ALLAH.filter(n => wanted.includes(n.number));
  } else if (q) {
    const k = key(q);
    // Word stems, so "forgiveness" finds "forgives" and "forgiving"
    const stems = q.toLowerCase().split(/[^a-z]+/).filter(w => w.length > 3).map(w => w.slice(0, Math.max(4, w.length - 4)));
    names = NAMES_OF_ALLAH.filter(
      n =>
        (k.length > 2 && (key(n.transliteration).includes(k) || k.includes(key(n.transliteration)) || key(n.arabic) === k)) ||
        stems.some(w => n.english.toLowerCase().includes(w) || n.meaning.toLowerCase().includes(w)),
    );
  }
  names = names.slice(0, MAX_MATCHES);
  if (names.length) return { names, text: names.map(forModel).join('\n') };
  // Nothing matched (or a general question): the short list, to pick from by number
  return {
    names: [],
    text:
      `${q ? 'No name matched exactly. ' : ''}All 99 names (number: transliteration, English); call again with numbers to get meanings.\n` +
      NAMES_OF_ALLAH.map(n => `${n.number}: ${n.transliteration}, ${n.english}`).join('\n') +
      `\nAbout the names: ${NAMES_ABOUT.hadith}`,
  };
}

function forModel(n: NameOfAllah): string {
  return JSON.stringify({ name: n.number, transliteration: n.transliteration, english: n.english, meaning: n.meaning });
}
