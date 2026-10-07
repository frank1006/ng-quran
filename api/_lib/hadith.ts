/**
 * Hadith for QuranFlow AI: semantic search over the collections imported from the Hugging Face
 * dataset quranlab/hadith (scripts/import-hadith.mjs, namespace "hadith", ids like "bukhari:1").
 * The AI cites a hadith with a "[hadith bukhari:1]" marker; the app shows it in full, so nothing
 * is quoted from the model's memory. Long hadith are sent shortened; the app loads the rest with
 * getHadith (GET /api/qflow/hadith) when it's opened.
 *
 * Text: the Arabic (public domain), and a translation only where HadeethEnc.com (open, with
 * attribution) has the same hadith, matched by its Arabic at import. The collections' own
 * translations (e.g. Muhsin Khan's English, the Urdu) are copyrighted: they are never stored,
 * shown or sent to a model. Records imported before that still hold them in `en`/`ur`; toHadith
 * and getHadith ignore those fields.
 *
 * Grades are only ever the dataset's: a named muhaddith's grade on the Sunan, or the
 * collection-level note for the two Sahihs. An empty grade means no grade is known, not weak.
 */
import { embedQuery, vector } from './vector';

export interface HadithGrade {
  grader: string;
  grade: string;
}

/** One language of HadeethEnc's translation, verbatim */
export interface HadithTranslationText {
  text: string;
  /** e.g. "Authentic" (Urdu: "صحيح"), by HadeethEnc's editorial board */
  grade?: string;
  /** e.g. "Narrated by Bukhari", "Agreed upon" */
  attribution?: string;
}

/** HadeethEnc's translation of the same hadith, in English and/or Urdu */
export interface HadithTranslation {
  source: 'HadeethEnc';
  /** HadeethEnc's own id */
  id: string;
  en?: HadithTranslationText;
  ur?: HadithTranslationText;
}

export interface Hadith {
  ref: string; // "bukhari:1"
  book: string; // "bukhari"
  bookName: string; // "Sahih al-Bukhari"
  number: string; // "1", or "402.2" for a second chain
  ar: string;
  /** Only when HadeethEnc has this hadith */
  translation?: HadithTranslation;
  /** Each grader's verdict, as the dataset gives it */
  grades: HadithGrade[];
  /** For the two Sahihs: their grade as a whole collection */
  collectionGrade?: string;
  /** The text was shortened for the app; getHadith has all of it */
  shortened?: boolean;
  /** Search similarity (0-1); only on search results */
  score?: number;
}

const COLLECTIONS: Record<string, { name: string; collectionGrade?: string }> = {
  bukhari: { name: 'Sahih al-Bukhari', collectionGrade: 'Sahih (the whole collection)' },
  muslim: { name: 'Sahih Muslim', collectionGrade: 'Sahih (the whole collection)' },
  abudawud: { name: 'Sunan Abi Dawud' },
  tirmidhi: { name: "Jami' at-Tirmidhi" },
  nasai: { name: "Sunan an-Nasa'i" },
  ibnmajah: { name: 'Sunan Ibn Majah' },
};

/** The collections in the index so far; add each book here when its import is complete */
export const HADITH_BOOKS = ['bukhari'];
export const HADITH_BOOK_NAMES = HADITH_BOOKS.map(b => COLLECTIONS[b].name).join(', ');

const NAMESPACE = 'hadith';
const SEARCH_TOP_K = 5;
/** Characters of each language sent with an answer (the longest hadith is ~15K); the rest loads when opened */
const MAX_APP_CHARS = 2500;
/** Characters the model reads per hadith */
const MAX_MODEL_CHARS = 600;

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max).replace(/\s+\S*$/, '')}…` : text);

/** The HadeethEnc translation stored with a record (`he`), if any; never the old `en`/`ur` fields */
function translationOf(data: any, max = Infinity): HadithTranslation | undefined {
  const he = data?.he;
  const language = (l: any): HadithTranslationText | undefined =>
    l?.text
      ? {
          text: clip(String(l.text), max),
          ...(l.grade ? { grade: String(l.grade) } : {}),
          ...(l.attribution ? { attribution: String(l.attribution) } : {}),
        }
      : undefined;
  const en = language(he?.en);
  const ur = language(he?.ur);
  if (!he?.id || !(en || ur)) return undefined;
  return { source: 'HadeethEnc', id: String(he.id), ...(en ? { en } : {}), ...(ur ? { ur } : {}) };
}

function toHadith(hit: any): Hadith {
  const data = JSON.parse(hit.data ?? '{}');
  const book = String(hit.metadata?.book ?? hit.id.split(':')[0]);
  const ar = String(data.ar ?? '');
  const translation = translationOf(data, MAX_APP_CHARS);
  const shortened = ar.length > MAX_APP_CHARS || [data.he?.en?.text, data.he?.ur?.text].some(t => String(t ?? '').length > MAX_APP_CHARS);
  return {
    ref: hit.id,
    book,
    bookName: COLLECTIONS[book]?.name ?? book,
    number: String(hit.metadata?.number ?? hit.id.split(':')[1]),
    ar: clip(ar, MAX_APP_CHARS),
    ...(translation ? { translation } : {}),
    grades: Array.isArray(data.grades) ? data.grades : [],
    ...(COLLECTIONS[book]?.collectionGrade ? { collectionGrade: COLLECTIONS[book].collectionGrade } : {}),
    ...(shortened ? { shortened } : {}),
    ...(typeof hit.score === 'number' ? { score: hit.score } : {}),
  };
}

export async function searchHadith(query: string): Promise<Hadith[]> {
  const hits = await vector(`query/${NAMESPACE}`, {
    vector: await embedQuery(query),
    topK: SEARCH_TOP_K,
    includeMetadata: true,
    includeData: true,
  });
  return (hits ?? []).map(toHadith);
}

/** A hadith's full text in every language, for a card opened in the app; null if unknown */
export async function getHadith(ref: string): Promise<Pick<Hadith, 'ref' | 'ar' | 'translation'> | null> {
  const match = /^([a-z]+):(\d{1,5}(?:\.\d{1,2})?)$/.exec(ref);
  if (!match || !HADITH_BOOKS.includes(match[1])) return null;
  const [hit] = (await vector(`fetch/${NAMESPACE}`, { ids: [ref], includeData: true })) ?? [];
  if (!hit?.data) return null;
  const data = JSON.parse(hit.data);
  const translation = translationOf(data);
  return { ref, ar: String(data.ar ?? ''), ...(translation ? { translation } : {}) };
}

/** "Sahih (al-Albani); Hasan (Zubair Ali Zai)", the collection's note, or that none is known */
export function gradeText(hadith: Hadith): string {
  if (hadith.grades.length) return hadith.grades.map(g => `${g.grade} (${g.grader})`).join('; ');
  return hadith.collectionGrade ?? 'no grade given';
}

/** Where the Prophet's ﷺ words or the event usually start, after the chain of narrators */
const MATN_START = /(?:قال|أن|ان|عن|سمعت|رأيت)\s+(?:رسول\s+الله|النبي)/;

/**
 * The Arabic for the model: without diacritics, starting near what was said or done (the chain of
 * narrators before it would use up the excerpt).
 */
function arabicForModel(ar: string): string {
  const plain = ar.replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g, '');
  const start = plain.search(MATN_START);
  return clip(start > 0 ? plain.slice(start) : plain, MAX_MODEL_CHARS);
}

/**
 * What the model sees: HadeethEnc's English when there is one, otherwise the Arabic, so it explains
 * the gist in the reply language in its own words; never a copyrighted translation.
 */
export function hadithForModel(hadith: Hadith): string {
  const head = `[hadith ${hadith.ref}] ${hadith.bookName} ${hadith.number}, grade: ${gradeText(hadith)}`;
  const english = hadith.translation?.en?.text;
  return english
    ? `${head}; translation (HadeethEnc): ${clip(english, MAX_MODEL_CHARS)}`
    : `${head}; Arabic only (no translation to show; explain it in your own words): ${arabicForModel(hadith.ar)}`;
}

/** Text an answer may quote from: the Arabic and HadeethEnc's translation only */
export function quotableText(hadith: Hadith): string {
  return [hadith.ar, hadith.translation?.en?.text, hadith.translation?.ur?.text].filter(Boolean).join(' ');
}

/** Questions asking whether something is allowed, in English, Roman Urdu, Urdu or Arabic */
const RULING_QUESTION = /\b(haram|halal|allowed|permissible|permitted|forbidden|jaiz|ja'iz|najaiz|makruh|makrooh|sinful)\b|حرام|حلال|جائز|ناجائز|مکروہ|يجوز|محرم/i;

export function asksForRuling(question: string): boolean {
  return RULING_QUESTION.test(question);
}

/** How a model may write a collection's name inside a marker: "bukhari", "صحیح بخاری", "صحيح البخاري" */
const BOOK_NAMES: Record<string, string> = {
  bukhari: 'bukhari', 'sahih bukhari': 'bukhari', 'sahih al-bukhari': 'bukhari', 'صحیح بخاری': 'bukhari', 'صحيح البخاري': 'bukhari', 'بخاری': 'bukhari', 'البخاري': 'bukhari',
  muslim: 'muslim', 'sahih muslim': 'muslim', 'صحیح مسلم': 'muslim', 'صحيح مسلم': 'muslim',
  abudawud: 'abudawud', tirmidhi: 'tirmidhi', nasai: 'nasai', ibnmajah: 'ibnmajah',
};

/**
 * "[hadith bukhari:1]" markers → the hadith to show (only ones search_hadith returned); the
 * markers are removed. Without a marker nothing is shown: an answer can name a collection to
 * say a hadith wasn't found in it, and the closest search results would then be unrelated.
 */
export function takeHadithCitations(answer: string, known: Map<string, Hadith>): { text: string; hadiths: Hadith[] } {
  const refs: string[] = [];
  // "[hadith bukhari:1]", also "(hadith bukhari 1)" and "[صحیح بخاری:646]"; a bracket that isn't
  // a hadith marker (e.g. an ayah reference) is left alone
  const marker = /\s*(?:\[\s*(?:hadith|hadees|حديث|حدیث)?|\(\s*(?:hadith|hadees|حديث|حدیث))\s*#?\s*([^\[\]():\d]{2,30}?)\s*[: ]\s*(\d+(?:\.\d+)?)\s*[\])]/gi;
  const text = answer.replace(marker, (whole, name: string, n: string) => {
    const book = BOOK_NAMES[name.trim().toLowerCase().replace(/\s+/g, ' ')];
    if (!book) return whole;
    const ref = `${book}:${n}`;
    if (known.has(ref)) refs.push(ref);
    return '';
  });
  // What's left of "(Sahih Bukhari — [marker])" once the marker is gone: a bracket holding only a
  // collection's name and punctuation, or nothing
  const shell = new RegExp(String.raw`\s*[(\[]\s*(?:(?:${Object.keys(BOOK_NAMES).join('|')})\s*)?[—–\-,:،.\s]*[)\]]`, 'gi');
  const cleaned = text.replace(shell, '').replace(/[ \t]+([.,،۔])/g, '$1').replace(/[ \t]+\n/g, '\n');
  return { text: cleaned, hadiths: [...new Set(refs)].map(r => known.get(r)!).slice(0, 4) };
}
