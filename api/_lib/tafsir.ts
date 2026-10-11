/**
 * Tafsir for QuranFlow AI: the explanation of one ayah, fetched when a question asks for it.
 * Nothing is imported or stored: a tafsir belongs to its ayah, so there is nothing to search.
 * The AI explains from this text in its own words and names the tafsir; the text itself is
 * never shown in the app (the English and Urdu ones are published translations).
 *
 * Source: the Quran Foundation Content API (https://api-docs.quran.foundation), with OAuth2
 * client credentials. Without credentials, or when that request fails (a new app starts in
 * "prelive", which only has surahs 1 and 2), the older public api.quran.com is used.
 *
 * Env: QF_CLIENT_ID, QF_CLIENT_SECRET  server-side only
 *      QF_ENV                          "production" once Quran Foundation has approved it;
 *                                      anything else is prelive
 */

export type TafsirLang = 'en' | 'ur' | 'ar';

export interface Tafsir {
  /** The tafsir's name, as the answer should give it */
  name: string;
  /** The ayahs this passage explains (tafsirs often treat a few together), e.g. ["2:183", "2:184"] */
  covers: string[];
  /** Plain text: one part of the passage, a length a model can read quickly */
  text: string;
  /** Which part this is, and how many the passage has ("tell me more" asks for the next) */
  part: number;
  parts: number;
}

/** Ibn Kathir where there is one in the language; the short, plain Muyassar for Arabic */
const SOURCES: Record<TafsirLang, { id: number; name: string }> = {
  en: { id: 169, name: 'Tafsir Ibn Kathir (abridged)' },
  ur: { id: 160, name: 'Tafsir Ibn Kathir (Urdu)' },
  ar: { id: 16, name: 'Al-Tafsir al-Muyassar' },
};

/** A passage can run to thousands of words: it is read a part at a time. The opening carries the
 *  meaning of the ayah; later parts are for follow-up questions. */
const MAX_CHARS = 2400;
const MAX_PARTS = 4;
const TIMEOUT_MS = 8000;
const PUBLIC_BASE = 'https://api.quran.com/api/v4';

const ENVIRONMENTS = {
  production: { auth: 'https://oauth2.quran.foundation', api: 'https://apis.quran.foundation' },
  prelive: { auth: 'https://prelive-oauth2.quran.foundation', api: 'https://apis-prelive.quran.foundation' },
};

/** Whole passages, by tafsir and ayah */
const cache = new Map<string, { covers: string[]; parts: string[] }>();
let token: { value: string; expires: number } | undefined;

/** The tafsir of one ayah ("2:255"), or null when there is none to give. `part` starts at 1. */
export async function getTafsir(ref: string, lang: TafsirLang, part = 1): Promise<Tafsir | null> {
  if (!/^\d{1,3}:\d{1,3}$/.test(ref)) return null;
  const source = SOURCES[lang];
  const key = `${source.id}|${ref}`;
  let passage = cache.get(key);
  if (!passage) {
    const path = `/tafsirs/${source.id}/by_ayah/${ref}`;
    const body = (await fromFoundation(path)) ?? (await getJson(`${PUBLIC_BASE}${path}`));
    const text = plainText(body?.tafsir?.text);
    if (!text) return null;
    const covers = Object.keys(body.tafsir.verses ?? {});
    passage = { covers: covers.length ? covers : [ref], parts: split(text) };
    cache.set(key, passage);
  }

  const index = Math.min(Math.max(Math.round(part) || 1, 1), passage.parts.length) - 1;
  return { name: source.name, covers: passage.covers, text: passage.parts[index], part: index + 1, parts: passage.parts.length };
}

/** The same request through the Quran Foundation API; null when it isn't set up or doesn't answer */
async function fromFoundation(path: string): Promise<any> {
  const clientId = env('QF_CLIENT_ID');
  if (!clientId || !env('QF_CLIENT_SECRET')) return null;
  const { api } = environment();
  const request = async () => {
    const accessToken = await accessTokenFor(clientId);
    return fetch(`${api}/content/api/v4${path}`, {
      headers: { 'x-auth-token': accessToken, 'x-client-id': clientId },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  };
  try {
    let response = await request();
    if (response.status === 401) {
      // The token was turned down: get a new one and try once more
      token = undefined;
      response = await request();
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = await response.json();
    return body?.tafsir?.text ? body : null;
  } catch (error) {
    console.warn('Quran Foundation tafsir request failed', (error as Error).message);
    return null;
  }
}

/** An access token (they last an hour), requested again shortly before it runs out */
async function accessTokenFor(clientId: string): Promise<string> {
  if (token && token.expires > Date.now()) return token.value;
  const response = await fetch(`${environment().auth}/oauth2/token`, {
    method: 'POST',
    headers: {
      authorization: `Basic ${Buffer.from(`${clientId}:${env('QF_CLIENT_SECRET')}`).toString('base64')}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials&scope=content',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`token HTTP ${response.status}`);
  const body = await response.json();
  if (typeof body?.access_token !== 'string') throw new Error('token missing in the response');
  token = { value: body.access_token, expires: Date.now() + (Number(body.expires_in) || 3600) * 1000 - 60_000 };
  return token.value;
}

async function getJson(url: string): Promise<any> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

function environment(): { auth: string; api: string } {
  return env('QF_ENV').toLowerCase() === 'production' ? ENVIRONMENTS.production : ENVIRONMENTS.prelive;
}

/** Environment value without surrounding whitespace or quotes (common copy-paste slips) */
function env(name: string): string {
  return (process.env[name] ?? '').trim().replace(/^["']|["']$/g, '').trim();
}

/** The API sends HTML (headings, paragraphs, Arabic spans) */
function plainText(html: unknown): string {
  if (typeof html !== 'string') return '';
  return html
    .replace(/<\/(p|h\d|div|li)>|<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}

/** The passage in parts of up to MAX_CHARS, each ending on a whole sentence where one ends in
 *  its last stretch; what is left after MAX_PARTS is dropped */
function split(text: string): string[] {
  const parts: string[] = [];
  let rest = text;
  while (rest && parts.length < MAX_PARTS) {
    if (rest.length <= MAX_CHARS) {
      parts.push(rest);
      break;
    }
    const cut = rest.slice(0, MAX_CHARS);
    const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('۔'), cut.lastIndexOf('\n'));
    const length = end > MAX_CHARS * 0.6 ? end + 1 : MAX_CHARS;
    parts.push(rest.slice(0, length).trim());
    rest = rest.slice(length).trim();
  }
  return parts;
}
