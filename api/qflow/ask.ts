/**
 * POST /api/qflow/ask
 * Body: { question, history?, calendar? }  (see AskInput in ../_lib/qflow)
 *
 * QFlow, the QuranFlow assistant: a short answer grounded in Quran ayahs it retrieved, with
 * those ayahs returned as cards. Not released yet: it only answers when QFLOW_ENABLED is "true"
 * (set locally, not in Production) until Google login and per-user limits exist.
 *
 * Privacy: nothing is stored. The question and the calendar dates are sent to the embedding
 * and AI providers to produce the answer.
 */
import { ask, type AskInput, type CalendarContext, type ChatTurn } from '../_lib/qflow';

export const maxDuration = 30;

const MAX_QUESTION = 500;
const MAX_HISTORY = 6;
const MAX_TURN = 2000;
const MAX_CALENDAR_JSON = 8000;

export async function POST(request: Request): Promise<Response> {
  if (process.env.QFLOW_ENABLED !== 'true') return json({ error: 'QFlow is not available yet' }, 404);

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

  const input: AskInput = { question, history, calendar };
  try {
    return json(await ask(input));
  } catch (error) {
    console.error('qflow/ask failed:', (error as Error).message);
    return json({ error: 'QFlow could not answer right now. Please try again.' }, 502);
  }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}
