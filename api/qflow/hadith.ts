/**
 * GET /api/qflow/hadith?ref=bukhari:3
 * The full text (Arabic, English, Urdu) of a hadith an answer showed shortened, so it can be read
 * in the app. Uses no question. See ../_lib/hadith.
 * Signed-in users only (Authorization: Bearer <Supabase access token>); guests get 401.
 */
import { getUser } from '../_lib/auth';
import { getHadith } from '../_lib/hadith';

export const maxDuration = 10;

export async function GET(request: Request): Promise<Response> {
  const ref = new URL(request.url).searchParams.get('ref') ?? '';
  try {
    const user = await getUser(request);
    if (!user) return json({ error: 'Sign in to use QuranFlow AI' }, 401);
    const hadith = await getHadith(ref);
    if (!hadith) return json({ error: 'Hadith not found' }, 404);
    // The text never changes; the browser may keep it for a day
    return json(hadith, 200, 'private, max-age=86400');
  } catch (error) {
    console.error('qflow/hadith failed:', (error as Error).message);
    return json({ error: 'Could not load the hadith' }, 503);
  }
}

function json(data: unknown, status = 200, cache = 'no-store'): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': cache },
  });
}
