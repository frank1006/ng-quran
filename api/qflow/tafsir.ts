/**
 * GET /api/qflow/tafsir?ref=2:255&tafsir=ibn-kathir&lang=en&part=2
 * One part of a tafsir passage, for "Continue reading" under an answer and for a saved chat whose
 * passage is no longer kept on the device. Uses no question. See ../_lib/tafsir.
 * Signed-in users only (Authorization: Bearer <Supabase access token>); guests get 401.
 */
import { getUser } from '../_lib/auth';
import { type TafsirLang, getTafsir, isTafsirKey } from '../_lib/tafsir';

export const maxDuration = 15;

const LANGS: TafsirLang[] = ['en', 'ur', 'ar'];

export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const ref = params.get('ref') ?? '';
  const key = params.get('tafsir') ?? '';
  const lang = LANGS.find(l => l === params.get('lang')) ?? 'en';
  const part = Number(params.get('part')) || 1;
  try {
    const user = await getUser(request);
    if (!user) return json({ error: 'Sign in to use QuranFlow AI' }, 401);
    if (!isTafsirKey(key)) return json({ error: 'Unknown tafsir' }, 400);
    const tafsir = await getTafsir(ref, lang, part, key);
    if (!tafsir) return json({ error: 'Tafsir not found' }, 404);
    // Not kept by the browser: Quran Foundation corrects its content over time
    return json(tafsir);
  } catch (error) {
    console.error('qflow/tafsir failed:', (error as Error).message);
    return json({ error: 'Could not load the tafsir' }, 503);
  }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}
