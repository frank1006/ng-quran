/**
 * GET /api/qflow/quota?tz=Asia/Karachi
 * How many QuranFlow AI questions this user has left today (uses none). See ../_lib/qflow-limit.
 */
import { clientId, peekQuota, validTimeZone } from '../_lib/qflow-limit';

export const maxDuration = 10;

export async function GET(request: Request): Promise<Response> {
  if (process.env.QFLOW_ENABLED !== 'true') return json({ error: 'QuranFlow AI is not available yet' }, 404);
  const timeZone = validTimeZone(new URL(request.url).searchParams.get('tz'));
  try {
    return json(await peekQuota(clientId(request), timeZone));
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
