/**
 * POST /api/qflow/ask
 * Body: { question, history?, calendar?, app?, timeZone? }  (see AskInput in ../_lib/qflow; `app` is
 * the person's day as the app has it: place, prayer times, Qibla, see ../_lib/app-tools)
 * Signed-in users only (Authorization: Bearer <Supabase access token>); guests get 401.
 * Each answer includes `quota` (questions left today). Over the user's daily limit, or the app's
 * global cap: 429 with `quota` (`quota.busyToday` is true for the global cap).
 *
 * QFlow, the QuranFlow assistant: a short answer grounded in Quran ayahs it retrieved, with
 * those ayahs returned as cards.
 *
 * Privacy: nothing is stored. The question, calendar dates and app context (city, prayer times,
 * Qibla, nearby masjid names, weather; never coordinates) are sent to the embedding and AI
 * providers to produce the answer. The rounded location is used here to look up masjids/weather.
 */
import { cleanContext } from '../_lib/app-tools';
import { ask, type AskInput, type CalendarContext, type ChatTurn } from '../_lib/qflow';
import { getUser } from '../_lib/auth';
import { refundQuestion, takeQuestion, validTimeZone } from '../_lib/qflow-limit';

export const maxDuration = 60;

const MAX_QUESTION = 500;
const MAX_HISTORY = 6;
const MAX_TURN = 2000;
const MAX_CALENDAR_JSON = 8000;

export async function POST(request: Request): Promise<Response> {
  let user;
  try {
    user = await getUser(request);
  } catch (error) {
    console.error('qflow/ask sign-in check failed:', (error as Error).message);
    return json({ error: 'QuranFlow AI is unavailable right now. Please try again later.' }, 503);
  }
  if (!user) return json({ error: 'Sign in to use QuranFlow AI' }, 401);

  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const question = typeof body?.question === 'string' ? body.question.trim() : '';
  if (!question || question.length > MAX_QUESTION) {
    return json({ error: `question must be 1-${MAX_QUESTION} characters` }, 400);
  }

  const history: ChatTurn[] = Array.isArray(body.history)
    ? body.history
        .filter((t: any) => (t?.role === 'user' || t?.role === 'assistant') && typeof t.content === 'string')
        .slice(-MAX_HISTORY)
        .map((t: any) => ({ role: t.role, content: t.content.slice(0, MAX_TURN) }))
    : [];

  let calendar: CalendarContext | undefined;
  if (body.calendar && typeof body.calendar === 'object' && JSON.stringify(body.calendar).length <= MAX_CALENDAR_JSON) {
    calendar = body.calendar;
  }

  // Daily limit per person (their Google account, see ../_lib/auth); a question is only used when
  // it's answered
  const id = user.limitKey;
  const timeZone = validTimeZone(body.timeZone);
  let taken;
  try {
    taken = await takeQuestion(id, timeZone);
  } catch (error) {
    console.error('qflow/ask limit check failed:', (error as Error).message);
    return json({ error: 'QuranFlow AI is unavailable right now. Please try again later.' }, 503);
  }
  if (!taken.allowed) {
    const error =
      taken.reason === 'busy'
        ? 'QuranFlow AI has answered all it can for today. Please try again tomorrow.'
        : `You've asked today's ${taken.quota.limit} questions. You can ask more tomorrow.`;
    return json({ error, quota: taken.quota }, 429);
  }

  const app = body.app && JSON.stringify(body.app).length <= MAX_CALENDAR_JSON ? cleanContext(body.app) : undefined;
  const input: AskInput = { question, history, calendar, app };
  try {
    // Why a model was skipped (busy, quota, timeout) shows in the Vercel logs; questions aren't logged
    const result = await ask(input, line => {
      if (line.includes('✗')) console.warn('qflow/ask model failed:', line.replace('✗', '').trim());
    });
    // No AI answer (every model failed): the question doesn't count
    if (result.mode === 'search-only') {
      await refundQuestion(id, timeZone);
      const { quota } = taken;
      const refunded = quota.limit === null ? quota : { ...quota, used: quota.used - 1, remaining: (quota.remaining ?? 0) + 1 };
      return json({ ...result, quota: refunded });
    }
    return json({ ...result, quota: taken.quota });
  } catch (error) {
    console.error('qflow/ask failed:', (error as Error).message);
    await refundQuestion(id, timeZone).catch(() => {});
    return json({ error: 'QuranFlow AI could not answer right now. Please try again.' }, 502);
  }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}
