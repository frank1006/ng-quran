/**
 * GET /api/qflow/quota?tz=Asia/Karachi
 * How many QuranFlow AI questions this user has left today (uses none). See ../_lib/qflow-limit.
 * Signed-in users only (Authorization: Bearer <Supabase access token>); guests get 401.
 */
import { getUser } from '../_lib/auth';
import { peekQuota, validTimeZone } from '../_lib/qflow-limit';

export const maxDuration = 10;

export async function GET(request: Request): Promise<Response> {
  const timeZone = validTimeZone(new URL(request.url).searchParams.get('tz'));
  try {
    const user = await getUser(request);
    if (!user) return json({ error: 'Sign in to use QuranFlow AI' }, 401);
    return json(await peekQuota(user.limitKey, timeZone));
  } catch (error) {
    console.error('qflow/quota failed:', (error as Error).message);
    return json({ error: 'Could not read the daily limit' }, 503);
  }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}
