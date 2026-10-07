/**
 * Hadith for QuranFlow AI: semantic search over the collections imported from the Hugging Face
 * dataset quranlab/hadith (scripts/import-hadith.mjs, namespace "hadith", ids like "bukhari:1").
 * The AI cites a hadith with a "[hadith bukhari:1]" marker; the app shows it in full (Arabic,
 * translation, grade), so nothing is quoted from the model's memory. Long hadith are sent
 * shortened; the app loads the rest with getHadith (GET /api/qflow/hadith) when it's opened.
 *
 * Grades are only ever the dataset's: a named muhaddith's grade on the Sunan, or the
 * collection-level note for the two Sahihs. An empty grade means no grade is known, not weak.
 */
import { embedQuery, vector } from './vector';

export interface HadithGrade {
  grader: string;
  grade: string;
}

export interface Hadith {
  ref: string; // "bukhari:1"
  book: string; // "bukhari"
  bookName: string; // "Sahih al-Bukhari"
  number: string; // "1", or "402.2" for a second chain
  ar: string;
  en: string;
  ur: string;
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

function toHadith(hit: any): Hadith {
  const data = JSON.parse(hit.data ?? '{}');
  const book = String(hit.metadata?.book ?? hit.id.split(':')[0]);
  const texts = { ar: data.ar ?? '', en: data.en ?? '', ur: data.ur ?? '' };
  const shortened = Object.values(texts).some(t => t.length > MAX_APP_CHARS);
  return {
    ref: hit.id,
    book,
    bookName: COLLECTIONS[book]?.name ?? book,
    number: String(hit.metadata?.number ?? hit.id.split(':')[1]),
    ar: clip(texts.ar, MAX_APP_CHARS),
    en: clip(texts.en, MAX_APP_CHARS),
    ur: clip(texts.ur, MAX_APP_CHARS),
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
export async function getHadith(ref: string): Promise<Pick<Hadith, 'ref' | 'ar' | 'en' | 'ur'> | null> {
  const match = /^([a-z]+):(\d{1,5}(?:\.\d{1,2})?)$/.exec(ref);
  if (!match || !HADITH_BOOKS.includes(match[1])) return null;
  const [hit] = (await vector(`fetch/${NAMESPACE}`, { ids: [ref], includeData: true })) ?? [];
  if (!hit?.data) return null;
  const data = JSON.parse(hit.data);
  return { ref, ar: data.ar ?? '', en: data.en ?? '', ur: data.ur ?? '' };
}

/** "Sahih (al-Albani); Hasan (Zubair Ali Zai)", the collection's note, or that none is known */
export function gradeText(hadith: Hadith): string {
  if (hadith.grades.length) return hadith.grades.map(g => `${g.grade} (${g.grader})`).join('; ');
  return hadith.collectionGrade ?? 'no grade given';
}

/**
 * What the model sees: the English (narrator first, then what was said), whatever the reply
 * language. The Arabic and Urdu start with the long chain of narrators, which would use up the
 * excerpt; the model replies in the person's language and the card shows their translation.
 */
export function hadithForModel(hadith: Hadith): string {
  return `[hadith ${hadith.ref}] ${hadith.bookName} ${hadith.number}, grade: ${gradeText(hadith)}: ${clip(hadith.en || hadith.ar, MAX_MODEL_CHARS)}`;
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
